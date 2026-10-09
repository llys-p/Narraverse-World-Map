// M3-3A actor-local cognition signals: a pure projection of this actor's own knowledge into the
// frozen cognitive review kernel input. It reads nothing but its explicit arguments: no world,
// event log, clock, RNG, viewport, player state or another actor's ledger. The importance weight
// can only come from this actor's own configured profile, and the previous-execution projection
// can only come from the trusted runtime.
import { fields, record, identifier, integer, denseArray, cloneData, canonicalJson, requireCondition } from './data-contract.mjs';
import { TICKS_PER_DAY } from './simulation-clock.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { MAX_COGNITION_KNOWLEDGE_BYTES } from './cognition-state.mjs';
import { validateCognitionKnowledge, isCommittedStepEligible } from './motivation-planner.mjs';
import { MOTIVATION_ACTIONS, MOTIVATION_OUTCOME_STATUSES } from './motivation-state.mjs';

export const COGNITION_RELEVANCE_HIGH = 1000;
export const COGNITION_RELEVANCE_BASE = 500;
export const COGNITION_URGENT_FATIGUE = 800;
export const COGNITION_URGENT_HUNGER = 900;
export const COGNITION_URGENT_HEALTH = 300;
export const COGNITION_HEALTH_CONCERN = 700;
export const COGNITION_KEY_EVIDENCE_CONFIDENCE = 600;
export const COGNITION_MAJOR_DUTY_PERMILLE = 900;

const PREVIOUS_FIELDS = Object.freeze(['simulationId', 'actorId', 'tick', 'decisionId', 'choice', 'status', 'code', 'failureOwner']);
const MAX_IMPORTANCE_PERMILLE = 1000;

function dutyWindowOpen(duty, tick) {
  return duty !== null && duty.status === 'pending' && tick >= duty.observedTick && tick < duty.expiresTick;
}

function validateBaseline(baseline) {
  if (baseline === null) return null;
  inspectDescriptorTree(baseline);
  record(baseline);
  fields(baseline, ['keyEvidenceFingerprint']);
  requireCondition(typeof baseline.keyEvidenceFingerprint === 'string' && baseline.keyEvidenceFingerprint.length > 0,
    'Invalid cognition signal baseline');
  return baseline;
}

function validatePreviousExecution(previous, knowledge) {
  if (previous === null) return null;
  inspectDescriptorTree(previous);
  record(previous);
  fields(previous, PREVIOUS_FIELDS);
  identifier(previous.simulationId);
  requireCondition(previous.simulationId === knowledge.simulationId, 'Cognition previous execution simulation mismatch');
  identifier(previous.actorId);
  requireCondition(previous.actorId === knowledge.actorId, 'Cognition previous execution belongs to another actor');
  integer(previous.tick, 1);
  requireCondition(previous.tick % TICKS_PER_DAY === 0, 'Cognition previous execution must sit on a day boundary');
  requireCondition(previous.tick < knowledge.tick, 'Cognition previous execution must precede the evaluated tick');
  identifier(previous.decisionId);
  requireCondition(previous.decisionId === 'cognition-day-' + previous.tick / TICKS_PER_DAY + '-' + previous.actorId,
    'Cognition previous execution decision identifier mismatch');
  requireCondition(MOTIVATION_ACTIONS.includes(previous.choice), 'Unknown cognition previous execution choice');
  requireCondition(MOTIVATION_OUTCOME_STATUSES.includes(previous.status), 'Unknown cognition previous execution status');
  requireCondition((previous.choice === 'NoAction') === (previous.status === 'no-action'),
    'Cognition previous execution choice/status mismatch');
  requireCondition(previous.code === null || previous.code === 'RULE_REJECTED', 'Invalid cognition previous execution code');
  requireCondition((previous.status === 'rejected') === (previous.code === 'RULE_REJECTED'),
    'Cognition previous execution status/code mismatch');
  if (previous.status === 'rejected') {
    record(previous.failureOwner);
    fields(previous.failureOwner, ['planId', 'goalId']);
    integer(previous.failureOwner.planId, 1);
    if (previous.failureOwner.goalId !== null) integer(previous.failureOwner.goalId, 1);
  } else requireCondition(previous.failureOwner === null, 'Only rejected cognition executions carry a failure owner');
  return previous;
}

export function deriveActorCognitionSignals(knowledge, importancePermille, baseline, previousExecution) {
  inspectDescriptorTree({ knowledge, importancePermille, baseline, previousExecution });
  const self = validateCognitionKnowledge(knowledge).self;
  requireCondition(new TextEncoder().encode(canonicalJson(knowledge)).length <= MAX_COGNITION_KNOWLEDGE_BYTES,
    'Cognition knowledge exceeds budget', 'LIMIT_EXCEEDED');
  integer(importancePermille);
  requireCondition(importancePermille >= 0 && importancePermille <= MAX_IMPORTANCE_PERMILLE,
    'Cognition importance out of range', 'LIMIT_EXCEEDED');
  const savedBaseline = validateBaseline(baseline);
  const previous = validatePreviousExecution(previousExecution, knowledge);

  const tick = knowledge.tick, day = tick / TICKS_PER_DAY, alive = self.alive;
  const duty = knowledge.duty, planState = knowledge.planState;
  const activePlan = planState.activePlan, suspendedPlan = planState.suspendedPlan;

  // Relevance is an actor-local commitment/need reading, never a viewport or player distance.
  let relevancePermille = 0;
  if (alive) {
    const committed = self.currentGoal !== null || activePlan !== null || suspendedPlan !== null;
    const dutyOpen = dutyWindowOpen(duty, tick);
    const healthPressing = self.health <= COGNITION_HEALTH_CONCERN && day >= self.cooldownUntilDay;
    relevancePermille = committed || dutyOpen || healthPressing ? COGNITION_RELEVANCE_HIGH : COGNITION_RELEVANCE_BASE;
  }

  const urgentNeed = alive && (self.fatigue >= COGNITION_URGENT_FATIGUE || self.hunger >= COGNITION_URGENT_HUNGER ||
    self.health <= COGNITION_URGENT_HEALTH);

  const newMajorDuty = alive && dutyWindowOpen(duty, tick) && duty.urgencyPermille >= COGNITION_MAJOR_DUTY_PERMILLE &&
    duty.requestId !== planState.lastReviewedDutyId;

  // Only the semantic key-evidence value is compared: raw sequence/tick movement, ordinary
  // wallet/herb movement, plan step progress and mild price drift must not wake the actor.
  const semantic = {
    value: knowledge.belief.value,
    confidenceEnough: knowledge.belief.confidencePermille >= COGNITION_KEY_EVIDENCE_CONFIDENCE,
    penaltyPermille: knowledge.experience.penaltyPermille,
  };
  const keyEvidenceFingerprint = canonicalJson(semantic);
  const keyEvidenceChanged = savedBaseline !== null && savedBaseline.keyEvidenceFingerprint !== keyEvidenceFingerprint;

  let goalOrPlanInvalidated = false;
  if (alive) {
    for (const plan of [activePlan, suspendedPlan]) {
      if (plan === null) continue;
      if (day > plan.deadlineDay) { goalOrPlanInvalidated = true; continue; }
      if (plan.kind === 'recover-health') {
        // Unbound or inconsistent: the plan cites a goal this actor no longer carries.
        if (self.currentGoal === null || self.currentGoal.goalId !== plan.goalId) goalOrPlanInvalidated = true;
      } else if (plan.kind === 'aid-village') {
        // A duty plan whose request window is gone, missing or bound to another request.
        if (!dutyWindowOpen(duty, tick) || duty.requestId !== plan.requestId) goalOrPlanInvalidated = true;
      }
    }
    // A genuine own rejection yesterday, whether or not the failing plan is still active.
    if (previous !== null && previous.tick === tick - TICKS_PER_DAY && previous.status === 'rejected' &&
      previous.code === 'RULE_REJECTED') goalOrPlanInvalidated = true;
    if (self.currentGoal === null && self.health <= COGNITION_HEALTH_CONCERN && day >= self.cooldownUntilDay)
      goalOrPlanInvalidated = true;
    // A ready committed step whose own soft guard no longer holds is a real invalidation; a
    // statically blocked or merely waiting plan does not wake the actor day after day.
    if (activePlan !== null && activePlan.status === 'ready' && !isCommittedStepEligible(knowledge, activePlan).eligible)
      goalOrPlanInvalidated = true;
  }

  const input = cloneData({
    simulationId: knowledge.simulationId,
    actorId: knowledge.actorId,
    tick,
    alive,
    importancePermille,
    relevancePermille,
    urgentNeed,
    newMajorDuty,
    keyEvidenceChanged,
    goalOrPlanInvalidated,
  });
  return { input, baseline: cloneData({ keyEvidenceFingerprint }) };
}
