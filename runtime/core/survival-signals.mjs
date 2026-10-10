// M4A actor-local survival signals: a pure projection of actor-2's own Knowledge into the
// frozen cognitive-review kernel input. It reads nothing but its explicit arguments: no world,
// event log, clock, RNG, viewport, player state or another actor's ledger. The importance weight
// can only come from this actor's own configured profile and the previous-execution projection
// only from the trusted runtime.
//
// This is the single place where the food urgentNeed is derived: the frozen urgentNeed OR
// "this actor's private food is at or below one ration". The kernel still decides the mode; this
// module never sets, hints or overrides a mode, and it never mutates its input.
import { fields, record, identifier, integer, denseArray, cloneData, canonicalJson, requireCondition } from './data-contract.mjs';
import { TICKS_PER_DAY } from './simulation-clock.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { validateCognitionSignalBaseline } from './cognition-state.mjs';
import { SURVIVAL_ACTOR_ID, SURVIVAL_FOOD_NEED_INVENTORY, validateSurvivalKnowledge } from './survival-state.mjs';

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
const SURVIVAL_ACTIONS = Object.freeze(['UseMedicine', 'BuyMedicine', 'WorkForPay', 'Rest', 'NoAction', 'BuyFood']);
const OUTCOME_STATUSES = Object.freeze(['succeeded', 'rejected', 'no-action']);

function dutyWindowOpen(duty, tick) {
  return duty !== null && duty.status === 'pending' && tick >= duty.observedTick && tick < duty.expiresTick;
}

function validatePreviousExecution(previous, knowledge) {
  if (previous === null) return null;
  inspectDescriptorTree(previous);
  record(previous);
  fields(previous, PREVIOUS_FIELDS);
  identifier(previous.simulationId);
  requireCondition(previous.simulationId === knowledge.simulationId, 'Survival previous execution simulation mismatch');
  identifier(previous.actorId);
  requireCondition(previous.actorId === knowledge.actorId, 'Survival previous execution belongs to another actor');
  identifier(previous.decisionId);
  integer(previous.tick, 1);
  requireCondition(previous.tick % TICKS_PER_DAY === 0, 'Survival previous execution must sit on a day boundary');
  requireCondition(previous.tick < knowledge.tick, 'Survival previous execution must precede the evaluated tick');
  requireCondition(previous.decisionId === 'survival-day-' + previous.tick / TICKS_PER_DAY + '-' + previous.actorId,
    'Survival previous execution decision identifier mismatch');
  requireCondition(SURVIVAL_ACTIONS.includes(previous.choice), 'Unknown survival previous execution choice');
  requireCondition(OUTCOME_STATUSES.includes(previous.status), 'Unknown survival previous execution status');
  requireCondition((previous.choice === 'NoAction') === (previous.status === 'no-action'),
    'Survival previous execution choice/status mismatch');
  requireCondition(previous.code === null || previous.code === 'RULE_REJECTED', 'Invalid survival previous execution code');
  requireCondition((previous.status === 'rejected') === (previous.code === 'RULE_REJECTED'),
    'Survival previous execution status/code mismatch');
  if (previous.status === 'rejected') {
    record(previous.failureOwner);
    fields(previous.failureOwner, ['planId', 'goalId']);
    integer(previous.failureOwner.planId, 1);
    if (previous.failureOwner.goalId !== null) integer(previous.failureOwner.goalId, 1);
  } else requireCondition(previous.failureOwner === null, 'Only rejected survival executions carry a failure owner');
  return previous;
}

function planInvalidated(knowledge, activePlan, suspendedPlan, day) {
  const self = knowledge.self, duty = knowledge.duty;
  for (const plan of [activePlan, suspendedPlan]) {
    if (plan === null) continue;
    if (day > plan.deadlineDay) return true;
    if (plan.kind === 'recover-health') {
      if (self.currentGoal === null || self.currentGoal.goalId !== plan.goalId ||
        self.currentGoal.deadlineDay !== plan.deadlineDay) return true;
    } else if (plan.kind === 'aid-village') {
      if (!dutyWindowOpen(duty, knowledge.tick) || duty.requestId !== plan.requestId) return true;
    }
  }
  return false;
}

export function deriveActorSurvivalSignals(knowledge, importancePermille, baseline, previousExecution) {
  inspectDescriptorTree({ knowledge, importancePermille, baseline, previousExecution });
  const spec = validateSurvivalKnowledge(knowledge);
  const self = spec.self;
  // The actor identity is checked before anything else so a foreign Knowledge fails with the
  // survival reason instead of a downstream field mismatch.
  requireCondition(spec.actorId === SURVIVAL_ACTOR_ID, 'Survival signals only serve actor-2', 'MIND_UNAVAILABLE');
  integer(importancePermille);
  requireCondition(importancePermille >= 0 && importancePermille <= MAX_IMPORTANCE_PERMILLE,
    'Survival importance out of range', 'LIMIT_EXCEEDED');
  const savedBaseline = validateSurvivalBaseline(baseline);
  // The previous-execution projection is validated against this actor's own identity first, so
  // a foreign decision id is reported as such instead of as a tick mismatch.
  const previous = validatePreviousExecution(previousExecution, spec);
  requireCondition(previous === null || previous.actorId === spec.actorId,
    'Survival previous execution belongs to another actor');

  const tick = spec.tick, day = tick / TICKS_PER_DAY, alive = self.alive;
  const duty = spec.duty, planState = spec.planState;
  const activePlan = planState.activePlan, suspendedPlan = planState.suspendedPlan;

  let relevancePermille = 0;
  if (alive) {
    const committed = self.currentGoal !== null || activePlan !== null || suspendedPlan !== null;
    const dutyOpen = dutyWindowOpen(duty, tick);
    const healthPressing = self.health <= COGNITION_HEALTH_CONCERN && day >= self.cooldownUntilDay;
    relevancePermille = committed || dutyOpen || healthPressing ? COGNITION_RELEVANCE_HIGH : COGNITION_RELEVANCE_BASE;
  }

  // The only food urgentNeed derivation: the frozen need OR the actor's own private shortage.
  const foodShortage = alive && self.inventory.food <= SURVIVAL_FOOD_NEED_INVENTORY;
  const frozenUrgent = alive && (self.fatigue >= COGNITION_URGENT_FATIGUE || self.hunger >= COGNITION_URGENT_HUNGER ||
    self.health <= COGNITION_URGENT_HEALTH);
  const urgentNeed = frozenUrgent || foodShortage;

  const newMajorDuty = alive && dutyWindowOpen(duty, tick) && duty.urgencyPermille >= COGNITION_MAJOR_DUTY_PERMILLE &&
    duty.requestId !== planState.lastReviewedDutyId;

  // Only the semantic key evidence is compared. A quote sequence change, a wallet movement or a
  // plan step advance must not wake the actor; those are deliberately excluded from the baseline.
  const semantic = {
    value: spec.belief.value,
    confidenceEnough: spec.belief.confidencePermille >= COGNITION_KEY_EVIDENCE_CONFIDENCE,
    penaltyPermille: spec.experience.penaltyPermille,
  };
  const keyEvidenceFingerprint = canonicalJson(semantic);
  const keyEvidenceChanged = savedBaseline !== null && savedBaseline.keyEvidenceFingerprint !== keyEvidenceFingerprint;

  let goalOrPlanInvalidated = false;
  if (alive) {
    if (planInvalidated(spec, activePlan, suspendedPlan, day)) goalOrPlanInvalidated = true;
    if (previous !== null && previous.tick === tick - TICKS_PER_DAY && previous.status === 'rejected' &&
      previous.code === 'RULE_REJECTED') goalOrPlanInvalidated = true;
    if (self.currentGoal === null && self.health <= COGNITION_HEALTH_CONCERN && day >= self.cooldownUntilDay)
      goalOrPlanInvalidated = true;
    const committedStep = committedStepGuard(spec, activePlan);
    if (committedStep !== null && !committedStep) goalOrPlanInvalidated = true;
  }

  const input = cloneData({
    simulationId: spec.simulationId,
    actorId: spec.actorId,
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

// A ready committed step whose own soft guard no longer holds is a real invalidation; a
// statically blocked or merely waiting plan does not wake the actor day after day.
function committedStepGuard(spec, activePlan) {
  if (activePlan === null || activePlan.status !== 'ready') return null;
  const action = activePlan.steps[activePlan.stepIndex];
  if (action === 'BuyFood') {
    const quote = spec.foodQuote;
    if (quote === null) return false;
    if (!(quote.observedTick <= spec.tick && spec.tick < quote.expiresTick)) return false;
    if (quote.available !== true) return false;
    if (spec.self.wallet < quote.price) return false;
    if (spec.self.inventory.food + 1 > 1000) return false;
    return true;
  }
  return null;
}

function validateSurvivalBaseline(baseline) {
  inspectDescriptorTree(baseline);
  const saved = validateCognitionSignalBaseline(baseline);
  return saved;
}
