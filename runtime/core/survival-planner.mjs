// M4A bounded survival planner: the frozen five candidates plus BuyFood, the narrow
// food-income priority rule and the two fixed secure-food plans. Pure over Knowledge plus the
// cognition review context: no world, no bundle, no clock, no RNG, no resolver and no other
// actor's ledger. Its inputs are never mutated; every goal/plan it returns is a clone proposal
// the runtime commits as-is or rejects.
//
// The five frozen M3-2 candidates keep their exact order, providers, source references and
// scores. BuyFood sits sixth. Maintain continues the already-committed plan and compares
// nothing, exactly as the cognition planner does.
import { fields, record, integer, identifier, denseArray, cloneData, canonicalJson, requireCondition, fault } from './data-contract.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { MOTIVATION_EMERGENCY_FATIGUE, MOTIVATION_MAJOR_DUTY_PERMILLE } from './motivation-state.mjs';
import { SURVIVAL_DECISION_VERSION, SURVIVAL_DECISION_PREFIX, SURVIVAL_FOOD_PLAN_KIND,
  SURVIVAL_PLAN_DEADLINE_DAYS, SURVIVAL_BUY_FOOD_SUPPORT, SURVIVAL_FOOD_NEED_INVENTORY,
  validateSurvivalKnowledge, validateSurvivalPlan, validateSurvivalDecision,
  isSurvivalQuoteFresh, isSurvivalOfferFresh } from './survival-state.mjs';

const DAY_TICKS = 144;
const HEALTH_GOAL_TRIGGER = 700;
const HEALTH_GOAL_TARGET = 800;
const HEALTH_GOAL_DEADLINE_DAYS = 20;
const RECOVERY_BIAS = 300;
const BUY_CONFIDENCE_FLOOR = 600;
const NEED_LIMIT = 1000;
const MAX_MOTIVATION_PERMILLE = 1000;
const WORK_HEALTH_FLOOR = 300;
const WORK_FATIGUE_CEILING = 700;
const REST_TRIGGER = 600;
const EMERGENCY_REST_SCORE = 2000;
const MAX_PLAN_TRANSITIONS = 8;
const MAX_SURVIVAL_CANDIDATES = 6;

const MAINTAIN_REASON_CODES = { UseMedicine: 'RECOVER_HEALTH', BuyMedicine: 'RECOVER_HEALTH',
  WorkForPay: 'DUTY', Rest: 'FATIGUE_RELIEF', BuyFood: 'BUY_FOOD' };

function permille(value, label) {
  integer(value);
  requireCondition(value <= MAX_MOTIVATION_PERMILLE, label + ' must stay within 0..1000 permille', 'LIMIT_EXCEEDED');
}

function rejectDead() { throw fault('RULE_REJECTED', 'Survival planner does not decide for the dead'); }

const dutyWindowOpen = (duty, tick) => duty !== null && duty.status === 'pending' &&
  tick >= duty.observedTick && tick < duty.expiresTick;
const strainOf = self => Math.min(MAX_MOTIVATION_PERMILLE, self.fatigue + Math.max(0, HEALTH_GOAL_TRIGGER - self.health));
const recoveryOf = self => Math.max(0, HEALTH_GOAL_TARGET - self.health) + RECOVERY_BIAS;
const providerOf = action => action === 'BuyFood' ? 'food-need' : action === 'WorkForPay' ? 'role-request' :
  action === 'Rest' ? 'fatigue-need' : action === 'NoAction' ? 'fallback' : 'health-need';

const scored = (action, reasonCode, support) => ({ action, provider: providerOf(action),
  sourceRef: action === 'Rest' ? 'self-fatigue' : 'recover-health', eligible: true, score: support,
  support, opposition: 0, reasonCode });
const softBlocked = (action, reasonCode, sourceRef) => ({ action, provider: providerOf(action), sourceRef,
  eligible: false, score: null, support: 0, opposition: 0, reasonCode });

// ---------------------------------------------------------------------------
// The frozen five guards, unchanged from the M3-2 planner, plus the food guard.
// ---------------------------------------------------------------------------

function useGuard(hasGoal, self) {
  if (!hasGoal) return 'NO_HEALTH_GOAL';
  if (self.inventory.herbs === 0) return 'PRIVATE_MEDICINE_MISSING';
  if (self.health >= NEED_LIMIT) return 'HEALTH_ALREADY_FULL';
  return null;
}

function buyGuard(hasGoal, self, knowledge) {
  if (!hasGoal) return 'NO_HEALTH_GOAL';
  if (self.inventory.herbs !== 0) return 'PRIVATE_MEDICINE_PRESENT';
  if (knowledge.belief.value === 'unknown') return 'SUPPLY_UNKNOWN';
  if (knowledge.belief.value === 'unavailable') return 'SUPPLY_UNAVAILABLE';
  if (knowledge.belief.confidencePermille < BUY_CONFIDENCE_FLOOR) return 'SUPPLY_CONFIDENCE_LOW';
  if (self.wallet < knowledge.quote.price) return 'WALLET_INSUFFICIENT';
  if (self.inventory.herbs + 1 > NEED_LIMIT) return 'CAPACITY_UNAVAILABLE';
  return null;
}

function workGuard(self, knowledge, requestId = null) {
  const duty = knowledge.duty;
  if (!dutyWindowOpen(duty, knowledge.tick)) return 'DUTY_UNAVAILABLE';
  if (requestId !== null && duty.requestId !== requestId) return 'DUTY_UNAVAILABLE';
  if (self.health < WORK_HEALTH_FLOOR) return 'HEALTH_TOO_LOW_FOR_WORK';
  if (self.fatigue > WORK_FATIGUE_CEILING) return 'FATIGUE_TOO_HIGH_FOR_WORK';
  return null;
}

function restGuard(self) {
  return self.fatigue < REST_TRIGGER ? 'FATIGUE_BELOW_REST_THRESHOLD' : null;
}

// The food soft guard is an actor-local reading only: no public stock, no other wallet and no
// claim that a purchase will succeed. That last check belongs to the authoritative layer.
function buyFoodGuard(self, knowledge) {
  if (!(self.alive && self.inventory.food <= SURVIVAL_FOOD_NEED_INVENTORY)) return 'NO_FOOD_NEED';
  if (self.location !== 'village') return 'FOOD_UNAVAILABLE';
  if (knowledge.foodQuote === null) return 'FOOD_QUOTE_MISSING';
  if (!isSurvivalQuoteFresh(knowledge.foodQuote, knowledge.tick)) return 'FOOD_QUOTE_EXPIRED';
  if (knowledge.foodQuote.available !== true) return 'FOOD_UNAVAILABLE';
  if (self.wallet < knowledge.foodQuote.price) return 'WALLET_INSUFFICIENT';
  if (self.inventory.food + 1 > NEED_LIMIT) return 'CAPACITY_UNAVAILABLE';
  return null;
}

function committedGuard(knowledge, plan) {
  const self = knowledge.self, hasGoal = self.currentGoal !== null, action = plan.steps[plan.stepIndex];
  if (action === 'UseMedicine') return useGuard(hasGoal, self);
  if (action === 'BuyMedicine') return buyGuard(hasGoal, self, knowledge);
  if (action === 'WorkForPay') return workGuard(self, knowledge, plan.requestId);
  if (action === 'Rest') return restGuard(self);
  if (action === 'BuyFood') return buyFoodGuard(self, knowledge);
  requireCondition(false, 'Committed plan step is not a recognizable action');
}

function useCandidate(hasGoal, self) {
  const reason = useGuard(hasGoal, self);
  return reason === null ? scored('UseMedicine', 'RECOVER_HEALTH', recoveryOf(self)) :
    softBlocked('UseMedicine', reason, 'recover-health');
}

function buyCandidate(hasGoal, self, knowledge) {
  const reason = buyGuard(hasGoal, self, knowledge);
  return reason === null ? scored('BuyMedicine', 'RECOVER_HEALTH', recoveryOf(self)) :
    softBlocked('BuyMedicine', reason, 'recover-health');
}

// The frozen Work candidate keeps its exact M3-2 score: support from the request urgency,
// opposition from strain and the experience penalty. `overrideReason` only relabels *why* the
// survival rule selected it; it never changes support, opposition or score.
function workCandidate(self, knowledge, experiencePenalty = 0, overrideReason = null) {
  const duty = knowledge.duty, reason = workGuard(self, knowledge, null);
  if (reason !== null) return softBlocked('WorkForPay', reason, reason === 'DUTY_UNAVAILABLE' ? null : duty.requestId);
  const sourceRef = duty.requestId;
  const support = Math.floor(duty.urgencyPermille * knowledge.profile.dutyWeightPermille / 1000);
  const opposition = Math.floor(strainOf(self) * knowledge.profile.riskAversionPermille / 1000) + experiencePenalty;
  return { action: 'WorkForPay', provider: 'role-request', sourceRef, eligible: true, score: support - opposition,
    support, opposition, reasonCode: overrideReason ?? 'DUTY' };
}

function restCandidate(self) {
  const reason = restGuard(self);
  if (reason !== null) return softBlocked('Rest', reason, 'self-fatigue');
  const emergency = self.fatigue >= MOTIVATION_EMERGENCY_FATIGUE;
  return { action: 'Rest', provider: 'fatigue-need', sourceRef: 'self-fatigue', eligible: true,
    score: emergency ? EMERGENCY_REST_SCORE : self.fatigue,
    support: emergency ? EMERGENCY_REST_SCORE : self.fatigue, opposition: 0,
    reasonCode: emergency ? 'EMERGENCY_FATIGUE' : 'FATIGUE_RELIEF' };
}

function buyFoodCandidate(self, knowledge) {
  const reason = buyFoodGuard(self, knowledge);
  if (reason !== null) return softBlocked('BuyFood', reason, null);
  return { action: 'BuyFood', provider: 'food-need', sourceRef: 'self-food', eligible: true,
    score: SURVIVAL_BUY_FOOD_SUPPORT, support: SURVIVAL_BUY_FOOD_SUPPORT, opposition: 0, reasonCode: 'BUY_FOOD' };
}

function collectCandidates(knowledge, experiencePenalty = 0) {
  const self = knowledge.self, day = knowledge.tick / DAY_TICKS;
  const hasGoal = self.currentGoal !== null || (self.health <= HEALTH_GOAL_TRIGGER && day >= self.cooldownUntilDay);
  return [useCandidate(hasGoal, self), buyCandidate(hasGoal, self, knowledge),
    workCandidate(self, knowledge, experiencePenalty), restCandidate(self),
    { action: 'NoAction', provider: 'fallback', sourceRef: null, eligible: true, score: 0, support: 0,
      opposition: 0, reasonCode: 'WAIT' },
    buyFoodCandidate(self, knowledge)];
}

export function collectSurvivalCandidates(knowledge) {
  inspectDescriptorTree(knowledge);
  const spec = validateSurvivalKnowledge(knowledge);
  if (!spec.self.alive) rejectDead();
  const penalty = spec.useWorkExperience ? spec.experience.penaltyPermille : 0;
  return collectCandidates(spec, penalty);
}

// ---------------------------------------------------------------------------
// The narrow food / income rule (§4)
// ---------------------------------------------------------------------------

const hasFoodNeed = self => self.alive && self.inventory.food <= SURVIVAL_FOOD_NEED_INVENTORY;

// A fresh, published "there is food" source. Never the hidden stock: the quote is this actor's
// own view of an announcement or of the public day settlement.
function freshFoodSource(knowledge) {
  const quote = knowledge.foodQuote;
  return quote !== null && isSurvivalQuoteFresh(quote, knowledge.tick) && quote.available === true ? quote : null;
}

// The single narrow path that may use an otherwise-available Work step to earn for food. It
// states the real reason and never lets a plain duty score be relabelled as a food plan.
function workForFoodEligible(knowledge, quote) {
  const self = knowledge.self, offer = knowledge.workOffer;
  if (offer === null) return false;
  if (!isSurvivalOfferFresh(offer, knowledge.tick)) return false;
  if (knowledge.duty === null || knowledge.duty.status !== 'pending') return false;
  if (offer.requestId !== knowledge.duty.requestId) return false;
  // The genuine Work soft guard: body conditions and the request window are never bypassed.
  if (workGuard(self, knowledge, null) !== null) return false;
  return BigInt(self.wallet) + BigInt(offer.wage) >= BigInt(quote.price);
}

// Does the actor still carry an unexpired food plan whose current step is live? Only then is
// continuation allowed, and the planId is never reset.
function committedFoodPlan(knowledge) {
  const day = knowledge.tick / DAY_TICKS;
  for (const slot of ['activePlan', 'suspendedPlan']) {
    const plan = knowledge.planState[slot];
    if (plan === null || plan.kind !== SURVIVAL_FOOD_PLAN_KIND) continue;
    if (day > plan.deadlineDay) continue;
    if (slot === 'suspendedPlan' && knowledge.planState.activePlan !== null) continue;
    return { slot, plan };
  }
  return null;
}

function nextPlan(knowledge, steps, requestId) {
  const day = knowledge.tick / DAY_TICKS, planId = knowledge.planState.nextPlanId;
  requireCondition(planId < Number.MAX_SAFE_INTEGER, 'Survival plan counter overflow', 'LIMIT_EXCEEDED');
  requireCondition(day <= Number.MAX_SAFE_INTEGER - SURVIVAL_PLAN_DEADLINE_DAYS,
    'Survival plan deadline would overflow', 'LIMIT_EXCEEDED');
  return { planId, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: cloneData(steps), stepIndex: 0,
    status: 'ready', createdDay: day, deadlineDay: day + SURVIVAL_PLAN_DEADLINE_DAYS,
    requestId: requestId === null ? null : cloneData(requestId) };
}

function validateSurvivalContext(context, maintain) {
  inspectDescriptorTree(context);
  record(context);
  fields(context, ['evaluationEventSeq', 'sourceReviewDecisionId', 'sourceReviewEventSeq']);
  integer(context.evaluationEventSeq, 1);
  if (maintain) {
    identifier(context.sourceReviewDecisionId);
    requireCondition(context.sourceReviewDecisionId.startsWith(SURVIVAL_DECISION_PREFIX),
      'Survival maintain source is not a survival review decision');
    integer(context.sourceReviewEventSeq, 1);
    requireCondition(context.sourceReviewEventSeq < context.evaluationEventSeq,
      'Survival maintain source must strictly precede its evaluation');
  } else {
    requireCondition(context.sourceReviewDecisionId === null && context.sourceReviewEventSeq === null,
      'Survival full review carries no maintain source');
  }
  return context;
}

const decisionIdOf = knowledge => SURVIVAL_DECISION_PREFIX + knowledge.tick / DAY_TICKS + '-' + knowledge.actorId;

function evidenceOf(knowledge, context, extra) {
  const evidence = new Set([...knowledge.belief.evidenceRefs, ...knowledge.belief.contradictionRefs]);
  if (knowledge.duty !== null) evidence.add(knowledge.duty.sourceEventSeq);
  if (knowledge.useWorkExperience && knowledge.experience?.evidenceRefs)
    for (const seq of knowledge.experience.evidenceRefs) evidence.add(seq);
  evidence.add(context.evaluationEventSeq);
  if (context.sourceReviewEventSeq !== null) evidence.add(context.sourceReviewEventSeq);
  for (const seq of extra) if (seq !== null && seq !== undefined) evidence.add(seq);
  return [...evidence].sort((a, b) => a - b);
}

const stanceOf = (self, currentGoal) => self.fatigue >= MOTIVATION_EMERGENCY_FATIGUE ? 'fatigue-concerned' :
  self.health <= HEALTH_GOAL_TRIGGER || currentGoal !== null ? 'health-concerned' : 'balanced';

const canonicalHealthSteps = self => self.inventory.herbs === 0 ? ['BuyMedicine', 'UseMedicine'] : ['UseMedicine'];

// ---------------------------------------------------------------------------
// Full review: compare all six candidates, then apply the narrow food priority rule.
// ---------------------------------------------------------------------------

export function planSurvivalDecision(knowledge, context, preserveFoodPlanOnUrgentRest = false) {
  requireCondition(typeof preserveFoodPlanOnUrgentRest === 'boolean',
    'Temporary food Rest policy must be boolean', 'INVALID_INPUT');
  inspectDescriptorTree({ knowledge, context });
  validateSurvivalContext(context, false);
  const spec = validateSurvivalKnowledge(knowledge);
  if (!spec.self.alive) rejectDead();

  const self = spec.self, tick = spec.tick, day = tick / DAY_TICKS;
  let currentGoal = self.currentGoal === null ? null : cloneData(self.currentGoal);
  let nextGoalId = self.nextGoalId;
  if (currentGoal === null && self.health <= HEALTH_GOAL_TRIGGER && day >= self.cooldownUntilDay) {
    requireCondition(nextGoalId < Number.MAX_SAFE_INTEGER && day <= Number.MAX_SAFE_INTEGER - HEALTH_GOAL_DEADLINE_DAYS,
      'Survival health goal counter/deadline overflow', 'LIMIT_EXCEEDED');
    currentGoal = { goalId: nextGoalId++, kind: 'recover-health', step: 'wait', startDay: day,
      deadlineDay: day + HEALTH_GOAL_DEADLINE_DAYS, failures: 0, target: HEALTH_GOAL_TARGET };
  }
  const penalty = spec.useWorkExperience ? spec.experience.penaltyPermille : 0;
  const candidates = collectCandidates(spec, penalty);
  const eligibleOf = action => candidates.find(candidate => candidate.action === action).eligible;

  let activePlan = cloneData(spec.planState.activePlan);
  let suspendedPlan = cloneData(spec.planState.suspendedPlan);
  let nextPlanId = spec.planState.nextPlanId;
  let lastReviewedDutyId = spec.planState.lastReviewedDutyId;
  const duty = spec.duty;

  const committed = committedFoodPlan(spec);
  const quote = freshFoodSource(spec);
  const needFood = hasFoodNeed(self);
  // Cancellations produced by this decision are returned so the runtime can record them as real
  // plan transitions; the frozen MotivationPlanSettled transitions list carries them verbatim.
  const transitions = [];
  // A food plan past its d+3 window is cancelled here, before this day's choice or command.
  for (const slot of ['activePlan', 'suspendedPlan']) {
    const plan = spec.planState[slot];
    if (plan === null || plan.kind !== SURVIVAL_FOOD_PLAN_KIND) continue;
    if (day > plan.deadlineDay) {
      requireCondition(transitions.length < MAX_PLAN_TRANSITIONS, 'Survival transition budget exceeded', 'LIMIT_EXCEEDED');
      transitions.push({ planId: plan.planId, kind: plan.kind, fromStatus: plan.status, toStatus: 'cancelled',
        reasonCode: 'DEADLINE_EXPIRED' });
      if (slot === 'activePlan') activePlan = null; else suspendedPlan = null;
    }
  }
  // Only the narrow food rule may create a secure-food plan; a plain duty Work keeps the frozen
  // aid-village shape, so a general duty score is never relabelled as a food plan.
  let foodPathSelected = false;
  // A committed Work step whose request is no longer pending or whose window has closed can
  // never be started: the plan is cancelled here and the day falls back to a lawful wait,
  // rather than trying to work on the strength of a historical requestId.
  const workStep = committed !== null && committed.plan.steps[committed.plan.stepIndex] === 'WorkForPay';
  const workStepUsable = !workStep || (spec.duty !== null && spec.duty.status === 'pending' &&
    spec.duty.requestId === committed.plan.requestId && spec.tick < spec.duty.expiresTick &&
    workGuard(self, spec, committed.plan.requestId) === null);
  // Only a *feasible* committed step is advanced. If the current step's own soft guard fails
  // (no money yet, no fresh quote, body not fit) the plan stays blocked and this day waits,
  // instead of selecting an ineligible action as if it were committed.
  const stepFeasible = committed !== null && committedGuard(spec, committed.plan) === null;
  const liveCommitment = committed !== null && workStepUsable && stepFeasible ? committed : null;
  const blockedCommitment = committed !== null && workStepUsable && !stepFeasible ? committed : null;
  if (committed !== null && !workStepUsable) {
    requireCondition(transitions.length < MAX_PLAN_TRANSITIONS, 'Survival transition budget exceeded', 'LIMIT_EXCEEDED');
    transitions.push({ planId: committed.plan.planId, kind: committed.plan.kind, fromStatus: committed.plan.status,
      toStatus: 'cancelled', reasonCode: 'REQUEST_EXPIRED' });
    if (committed.slot === 'activePlan') activePlan = null; else suspendedPlan = null;
  }

  // Park at most one recover-health plan, keeping its identity, goal, failures and deadline so
  // a food detour never costs the health goal its history.
  const suspendHealth = () => {
    const health = [spec.planState.activePlan, spec.planState.suspendedPlan].find(plan =>
      plan !== null && plan.kind === 'recover-health');
    if (health !== undefined && boundPlan !== null && health.planId !== boundPlan.planId)
      suspendedPlan = { ...cloneData(health), status: 'suspended' };
  };

  let gateReason, commitment, choice;
  if (self.fatigue >= MOTIVATION_EMERGENCY_FATIGUE) {
    gateReason = 'URGENT_FATIGUE'; commitment = 'Rest'; choice = 'Rest';
  } else if (liveCommitment !== null) {
    // A live food commitment advances its own current step; the planId is never reset.
    gateReason = 'CONTINUE_COMMITTED';
    commitment = liveCommitment.plan.steps[liveCommitment.plan.stepIndex];
    choice = commitment;
  } else if (committed !== null && workStep) {
    // The earning step is gone; the wage was never earned, so this day waits lawfully.
    gateReason = 'SELECT_NEW_PLAN'; commitment = null;
  } else if (blockedCommitment !== null) {
    // A live food commitment whose current step is not yet feasible stays blocked this day.
    gateReason = 'LOCAL_REPLAN_BLOCKED'; commitment = null;
  } else if (needFood && quote !== null && eligibleOf('BuyFood')) {
    gateReason = 'SELECT_NEW_PLAN'; commitment = 'BuyFood'; choice = 'BuyFood'; foodPathSelected = true;
  } else if (needFood && quote !== null && workForFoodEligible(spec, quote)) {
    gateReason = 'SELECT_NEW_PLAN'; commitment = 'WorkForPay'; choice = 'WorkForPay'; foodPathSelected = true;
  } else {
    // No food need and no food commitment: the frozen M3-2 gate chain decides as before.
    const major = dutyWindowOpen(duty, tick) && duty.urgencyPermille >= MOTIVATION_MAJOR_DUTY_PERMILLE &&
      duty.requestId !== lastReviewedDutyId;
    const opened = plan => plan !== null && eligibleOf(plan.steps[plan.stepIndex]);
    if (major) { gateReason = 'NEW_MAJOR_DUTY'; lastReviewedDutyId = duty.requestId; commitment = null; }
    else if (activePlan !== null && activePlan.status === 'ready' && opened(activePlan)) {
      gateReason = 'CONTINUE_COMMITTED'; commitment = activePlan.steps[activePlan.stepIndex]; choice = commitment;
    } else if (activePlan === null && suspendedPlan !== null && opened(suspendedPlan)) {
      gateReason = 'RESUME_COMMITTED'; commitment = suspendedPlan.steps[suspendedPlan.stepIndex]; choice = commitment;
    } else if (activePlan !== null || suspendedPlan !== null) { gateReason = 'LOCAL_REPLAN_BLOCKED'; commitment = null; }
    else { gateReason = 'SELECT_NEW_PLAN'; commitment = null; }
  }

  const temporaryFoodRest = preserveFoodPlanOnUrgentRest && gateReason === 'URGENT_FATIGUE' &&
    choice === 'Rest' && committed?.slot === 'activePlan' && activePlan !== null &&
    activePlan.kind === SURVIVAL_FOOD_PLAN_KIND && activePlan.planId === committed.plan.planId;
  // A chosen Work step keeps its frozen score; only the stated reason becomes the food income.
  const selected = candidates.map(candidate => candidate.action === 'WorkForPay' && commitment === 'WorkForPay' ?
    { ...candidate, reasonCode: 'FOOD_INCOME' } : candidate);

  const best = selected.reduce((best, candidate) =>
    candidate.eligible && (best === null || candidate.score > best.score) ? candidate : best, null);
  if (commitment === null) choice = best.action;
  for (const candidate of selected) {
    candidate.selectable = commitment === null ? candidate.eligible : candidate.action === commitment;
    candidate.selectionBlockCode = !candidate.eligible ? 'SOFT_PRECONDITION_FAILED' :
      candidate.selectable ? null : (gateReason === 'URGENT_FATIGUE' ? 'URGENT_OVERRIDE' : 'COMMITMENT_PROTECTED');
  }

  let boundPlan = null;
  if (choice === 'UseMedicine' || choice === 'BuyMedicine') {
    if (activePlan !== null && activePlan.kind === 'recover-health') {
      boundPlan = gateReason === 'LOCAL_REPLAN_BLOCKED' ?
        { ...activePlan, steps: canonicalHealthSteps(self), stepIndex: 0, status: 'ready' } : activePlan;
    } else if (suspendedPlan !== null) {
      boundPlan = gateReason === 'LOCAL_REPLAN_BLOCKED' ?
        { ...suspendedPlan, steps: canonicalHealthSteps(self), stepIndex: 0, status: 'ready' } :
        { ...suspendedPlan, status: 'ready' };
      suspendedPlan = null;
    } else {
      requireCondition(currentGoal !== null, 'Survival health choice without a health goal');
      boundPlan = { planId: nextPlanId++, goalId: currentGoal.goalId, kind: 'recover-health',
        steps: canonicalHealthSteps(self), stepIndex: 0, status: 'ready', createdDay: day,
        deadlineDay: currentGoal.deadlineDay, requestId: null };
    }
    activePlan = boundPlan;
    currentGoal = { ...currentGoal, step: choice === 'UseMedicine' ? 'use' : 'buy' };
  } else if ((choice === 'BuyFood' || choice === 'WorkForPay') &&
             (foodPathSelected || liveCommitment !== null || blockedCommitment !== null)) {
    const carried = liveCommitment ?? blockedCommitment;
    if (carried !== null) {
      boundPlan = cloneData(carried.plan);
      boundPlan.status = 'ready';
      if (carried.slot === 'suspendedPlan') { suspendedPlan = null; activePlan = boundPlan; }
      else activePlan = boundPlan;
    } else if (choice === 'BuyFood') {
      boundPlan = nextPlan(spec, ['BuyFood'], null);
      nextPlanId = boundPlan.planId + 1;
      activePlan = boundPlan;
    } else {
      // Two-step: the offer's own request is the source of the earning step.
      boundPlan = nextPlan(spec, ['WorkForPay', 'BuyFood'], spec.workOffer.requestId);
      nextPlanId = boundPlan.planId + 1;
      activePlan = boundPlan;
    }
    // At most one recover-health plan may be suspended; it keeps its identity, goal, failures
    // and deadline so a food detour never costs the health goal its history.
    if (suspendedPlan === null) suspendHealth();
  } else if (choice === 'Rest' && temporaryFoodRest) {
    // An emergency Rest is an action for this day, not a replacement for the committed food plan.
    boundPlan = null;
  } else if (choice === 'WorkForPay' || choice === 'Rest') {
    // The frozen M3-2 temporary plan for a plain duty or an emergency rest. A duty Work chosen
    // by the general gate stays an aid-village plan, never a secure-food plan.
    const kind = choice === 'WorkForPay' ? 'aid-village' : 'recover-rest';
    if (activePlan !== null && activePlan.kind === kind) boundPlan = { ...activePlan, status: 'ready' };
    else {
      requireCondition(choice === 'Rest' || spec.duty !== null, 'Survival duty choice without a duty');
      requireCondition(nextPlanId < Number.MAX_SAFE_INTEGER, 'Survival plan counter overflow', 'LIMIT_EXCEEDED');
      requireCondition(day <= Number.MAX_SAFE_INTEGER - 3, 'Survival plan deadline would overflow', 'LIMIT_EXCEEDED');
      boundPlan = choice === 'Rest'
        ? { planId: nextPlanId, goalId: null, kind, steps: ['Rest'], stepIndex: 0, status: 'ready',
            createdDay: day, deadlineDay: day, requestId: null }
        : { planId: nextPlanId, goalId: null, kind, steps: [choice], stepIndex: 0, status: 'ready',
            createdDay: day, deadlineDay: Math.floor((spec.duty.expiresTick - 1) / DAY_TICKS),
            requestId: spec.duty.requestId };
      nextPlanId = boundPlan.planId + 1;
    }
    if (suspendedPlan === null) suspendHealth();
    activePlan = boundPlan;
  } else if (activePlan !== null || suspendedPlan !== null) {
    if (activePlan !== null)
      activePlan = { ...activePlan, status: eligibleOf(activePlan.steps[activePlan.stepIndex]) ? 'ready' : 'blocked' };
    if (suspendedPlan !== null) suspendedPlan = { ...suspendedPlan, status: 'suspended' };
    boundPlan = activePlan ?? suspendedPlan;
  }

  const evidenceExtra = [spec.foodQuote?.sourceEventSeq ?? null, spec.workOffer?.sourceEventSeq ?? null];
  const decision = validateSurvivalDecision({
    version: SURVIVAL_DECISION_VERSION,
    decisionId: decisionIdOf(spec),
    actorId: spec.actorId, tick,
    goalId: boundPlan === null ? null : boundPlan.goalId,
    planId: boundPlan === null ? null : boundPlan.planId,
    innerStance: stanceOf(self, currentGoal),
    committedIntent: currentGoal === null ? null : { goalId: currentGoal.goalId, kind: 'recover-health' },
    apparentAction: choice, choice,
    reasonCode: selected.find(candidate => candidate.action === choice).reasonCode,
    gateReason, strainPermille: strainOf(self), candidates: selected,
    evidenceRefs: evidenceOf(spec, context, evidenceExtra),
    knowledgeFingerprint: canonicalJson(spec),
    mode: 'review', sourceReviewDecisionId: null, sourceReviewEventSeq: null,
  });

  return { currentGoal, nextGoalId, activePlan, suspendedPlan, nextPlanId, lastReviewedDutyId, decision, transitions };
}

// ---------------------------------------------------------------------------
// Maintain: continue the committed step or wait. Never scores, never compares.
// ---------------------------------------------------------------------------

export function continueSurvivalPlan(knowledge, context) {
  inspectDescriptorTree({ knowledge, context });
  validateSurvivalContext(context, true);
  const spec = validateSurvivalKnowledge(knowledge);
  const self = spec.self, tick = spec.tick, day = tick / DAY_TICKS;
  if (!self.alive) rejectDead();
  requireCondition(context.sourceReviewDecisionId.endsWith('-' + spec.actorId),
    'Survival maintain source belongs to another actor');
  const sourceDay = Number(/^survival-day-([1-9][0-9]*)-(actor-[23])$/.exec(context.sourceReviewDecisionId)[1]);
  requireCondition(Number.isSafeInteger(sourceDay) && sourceDay < day,
    'Survival maintain source must be a strictly earlier daily decision');

  const currentGoal = self.currentGoal === null ? null : cloneData(self.currentGoal);
  const nextGoalId = self.nextGoalId;
  let activePlan = cloneData(spec.planState.activePlan);
  let suspendedPlan = cloneData(spec.planState.suspendedPlan);
  const nextPlanId = spec.planState.nextPlanId;
  const lastReviewedDutyId = spec.planState.lastReviewedDutyId;

  let gateReason, choice, reasonCode, boundPlan = null;
  const transitions = [];
  // Expiry applies even on a reduced-review day, before any committed action is chosen.
  for (const slot of ['activePlan', 'suspendedPlan']) {
    const plan = slot === 'activePlan' ? activePlan : suspendedPlan;
    if (plan === null || plan.kind !== SURVIVAL_FOOD_PLAN_KIND || day <= plan.deadlineDay) continue;
    transitions.push({ planId: plan.planId, kind: plan.kind, fromStatus: plan.status,
      toStatus: 'cancelled', reasonCode: 'DEADLINE_EXPIRED' });
    if (slot === 'activePlan') activePlan = null; else suspendedPlan = null;
  }
  // Maintain must not start an earning step whose request is gone: the plan is cancelled and
  // the day waits, never working on the strength of a historical requestId.
  const expiredWork = (slot, plan) => {
    if (plan === null || plan.kind !== SURVIVAL_FOOD_PLAN_KIND) return false;
    if (plan.steps[plan.stepIndex] !== 'WorkForPay') return false;
    if (spec.duty !== null && spec.duty.status === 'pending' && spec.duty.requestId === plan.requestId &&
      spec.tick < spec.duty.expiresTick && workGuard(self, spec, plan.requestId) === null) return false;
    requireCondition(transitions.length < MAX_PLAN_TRANSITIONS, 'Survival transition budget exceeded', 'LIMIT_EXCEEDED');
    transitions.push({ planId: plan.planId, kind: plan.kind, fromStatus: plan.status, toStatus: 'cancelled',
      reasonCode: 'REQUEST_EXPIRED' });
    if (slot === 'activePlan') activePlan = null; else suspendedPlan = null;
    return true;
  };
  if (expiredWork('activePlan', activePlan) || expiredWork('suspendedPlan', suspendedPlan)) {
    gateReason = 'WAIT_MAINTAIN'; choice = 'NoAction'; reasonCode = 'DUTY_UNAVAILABLE'; boundPlan = null;
    const decision = validateSurvivalDecision({
      version: SURVIVAL_DECISION_VERSION, decisionId: decisionIdOf(spec), actorId: spec.actorId, tick,
      goalId: null, planId: null, innerStance: stanceOf(self, currentGoal),
      committedIntent: currentGoal === null ? null : { goalId: currentGoal.goalId, kind: 'recover-health' },
      apparentAction: choice, choice, reasonCode, gateReason, strainPermille: strainOf(self), candidates: [],
      evidenceRefs: evidenceOf(spec, context, [spec.foodQuote?.sourceEventSeq ?? null]),
      knowledgeFingerprint: canonicalJson(spec),
      mode: 'maintain', sourceReviewDecisionId: context.sourceReviewDecisionId,
      sourceReviewEventSeq: context.sourceReviewEventSeq,
    });
    return { currentGoal, nextGoalId, activePlan, suspendedPlan, nextPlanId, lastReviewedDutyId, decision, transitions };
  }
  if (activePlan !== null) {
    const action = activePlan.steps[activePlan.stepIndex], reason = committedGuard(spec, activePlan);
    if (reason === null) {
      gateReason = 'CONTINUE_MAINTAIN'; choice = action; reasonCode = MAINTAIN_REASON_CODES[action];
      activePlan = { ...activePlan, status: 'ready' };
    } else {
      gateReason = 'WAIT_MAINTAIN'; choice = 'NoAction'; reasonCode = reason;
      activePlan = { ...activePlan, status: 'blocked' };
    }
    boundPlan = activePlan;
  } else if (suspendedPlan !== null) {
    const action = suspendedPlan.steps[suspendedPlan.stepIndex], reason = committedGuard(spec, suspendedPlan);
    if (reason === null) {
      gateReason = 'CONTINUE_MAINTAIN'; choice = action; reasonCode = MAINTAIN_REASON_CODES[action];
      activePlan = { ...suspendedPlan, status: 'ready' }; suspendedPlan = null; boundPlan = activePlan;
    } else {
      gateReason = 'WAIT_MAINTAIN'; choice = 'NoAction'; reasonCode = reason; boundPlan = suspendedPlan;
    }
  } else {
    gateReason = 'WAIT_MAINTAIN'; choice = 'NoAction'; reasonCode = 'WAIT';
  }

  const evidenceExtra = [spec.foodQuote?.sourceEventSeq ?? null, spec.workOffer?.sourceEventSeq ?? null];
  const decision = validateSurvivalDecision({
    version: SURVIVAL_DECISION_VERSION,
    decisionId: decisionIdOf(spec),
    actorId: spec.actorId, tick,
    goalId: boundPlan === null ? null : boundPlan.goalId,
    planId: boundPlan === null ? null : boundPlan.planId,
    innerStance: stanceOf(self, currentGoal),
    committedIntent: currentGoal === null ? null : { goalId: currentGoal.goalId, kind: 'recover-health' },
    apparentAction: choice, choice, reasonCode,
    gateReason, strainPermille: strainOf(self), candidates: [],
    evidenceRefs: evidenceOf(spec, context, evidenceExtra),
    knowledgeFingerprint: canonicalJson(spec),
    mode: 'maintain', sourceReviewDecisionId: context.sourceReviewDecisionId,
    sourceReviewEventSeq: context.sourceReviewEventSeq,
  });

  return { currentGoal, nextGoalId, activePlan, suspendedPlan, nextPlanId, lastReviewedDutyId, decision, transitions };
}

// The M3-3A committed-step query, widened only by the food step. It never scores, never
// compares candidates and never edits steps, identifiers or duty review markers.
export function isSurvivalCommittedStepEligible(knowledge, plan) {
  inspectDescriptorTree({ knowledge, plan });
  const spec = validateSurvivalKnowledge(knowledge);
  requireCondition(plan !== null && typeof plan === 'object', 'Survival continuation requires a committed plan');
  const slots = [spec.planState.activePlan, spec.planState.suspendedPlan];
  const owned = slots.some(slot => slot !== null && (slot === plan || canonicalJson(slot) === canonicalJson(plan)));
  requireCondition(owned, 'Survival continuation plan is not this actor\'s committed plan');
  validateSurvivalPlan(plan);
  const reason = committedGuard(spec, plan);
  return { eligible: reason === null, reasonCode: reason };
}
