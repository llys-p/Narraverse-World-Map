// M4A bounded survival (`m-survival-v1`): the frozen public constants and the pure DTO
// validators of this contract. This module owns no world, clock, RNG, event log or executor.
// Every entry preflights the complete descriptor tree before any clone or canonical byte
// budget, so a getter supplied by an untrusted caller is rejected without being executed.
//
// What is deliberately NOT here: anything that can read the hidden world. A food quote and a
// work offer are actor-local views of *published* facts only. A missing or expired source is a
// lawful infeasibility, never something this module repairs by peeking at the real stock.
//
// Pure DTO validity covers shape and the constraints that live inside the input. A positive
// integer event sequence is not, on its own, proof that such a public event exists: the trusted
// projection, the authoritative entry and a complete bundle replay check that separately.
import { fields, record, integer, identifier, denseArray, cloneData, canonicalJson, requireCondition,
  MAX_COLLECTION } from './data-contract.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { MOTIVATION_ACTOR_IDS, MOTIVATION_PLAN_KINDS, MOTIVATION_PLAN_STATUSES,
  validateMotivationConfig, validateMotivationDuty, validateMotivationOutcome,
  validateCognitionMotivationDecision } from './motivation-state.mjs';

export const SURVIVAL_RULES = 'm-survival-v1';
export const SURVIVAL_FIXTURE_ID = 'survival-village';
export const SURVIVAL_MOTIVATION_STATE_VERSION = 'survival-motivation-state-v1';
export const SURVIVAL_COGNITION_STATE_VERSION = 'survival-cognition-state-v1';
export const SURVIVAL_KNOWLEDGE_VERSION = 'survival-knowledge-v1';
export const SURVIVAL_DECISION_VERSION = 'survival-decision-v1';
export const SURVIVAL_INSPECTOR_VERSION = 'survival-inspector-v1';
export const SURVIVAL_SERVICE_FORMAT = 7;
export const SURVIVAL_DECISION_PREFIX = 'survival-day-';
export const SURVIVAL_ACTOR_ID = 'actor-2';
export const SURVIVAL_PEER_ID = 'actor-3';
export const SURVIVAL_ACTOR_IDS = Object.freeze(['actor-2', 'actor-3']);

export const MAX_SURVIVAL_KNOWLEDGE_BYTES = 16384;
export const MAX_SURVIVAL_EVIDENCE_REFS = 71;
export const MAX_SURVIVAL_PLAN_TRANSITIONS = 8;
// A food quote stays valid for two whole days from the tick it was observed.
export const SURVIVAL_QUOTE_TTL_TICKS = 288;
export const SURVIVAL_PLAN_DEADLINE_DAYS = 3;
export const SURVIVAL_FOOD_NEED_INVENTORY = 1;
export const SURVIVAL_BUY_FOOD_SUPPORT = 1200;
export const SURVIVAL_FOOD_PLAN_KIND = 'secure-food';
export const SURVIVAL_FOOD_QUOTE_EVENT = 'SurvivalFoodQuoteAnnounced';
export const SURVIVAL_WORK_OFFER_EVENT = 'SurvivalWorkOfferAnnounced';
export const SURVIVAL_RECIPES = Object.freeze(['affordable', 'earn-then-buy', 'no-opportunity', 'wage-refused', 'no-food']);

// The frozen M3-2 action set plus the single new food action.
export const SURVIVAL_ACTIONS = Object.freeze(['UseMedicine', 'BuyMedicine', 'WorkForPay', 'Rest', 'NoAction', 'BuyFood']);
export const SURVIVAL_PLAN_KINDS = Object.freeze(['recover-health', 'aid-village', 'recover-rest', SURVIVAL_FOOD_PLAN_KIND]);
export const SURVIVAL_PLAN_STATUSES = Object.freeze(['ready', 'blocked', 'suspended', 'completed', 'cancelled']);
export const SURVIVAL_GATES = Object.freeze(['URGENT_FATIGUE', 'NEW_MAJOR_DUTY', 'CONTINUE_COMMITTED',
  'RESUME_COMMITTED', 'LOCAL_REPLAN_BLOCKED', 'SELECT_NEW_PLAN']);
export const SURVIVAL_MAINTAIN_GATES = Object.freeze(['CONTINUE_MAINTAIN', 'WAIT_MAINTAIN']);
export const SURVIVAL_STANCES = Object.freeze(['fatigue-concerned', 'health-concerned', 'balanced']);
// The frozen reason vocabulary plus the food/income codes. No old value is loosened.
export const SURVIVAL_REASON_CODES = Object.freeze(['RECOVER_HEALTH', 'NO_HEALTH_GOAL', 'PRIVATE_MEDICINE_MISSING',
  'HEALTH_ALREADY_FULL', 'PRIVATE_MEDICINE_PRESENT', 'SUPPLY_UNKNOWN', 'SUPPLY_UNAVAILABLE', 'SUPPLY_CONFIDENCE_LOW',
  'WALLET_INSUFFICIENT', 'CAPACITY_UNAVAILABLE', 'DUTY_UNAVAILABLE', 'HEALTH_TOO_LOW_FOR_WORK',
  'FATIGUE_TOO_HIGH_FOR_WORK', 'DUTY', 'FATIGUE_BELOW_REST_THRESHOLD', 'FATIGUE_RELIEF', 'EMERGENCY_FATIGUE', 'WAIT',
  'BUY_FOOD', 'FOOD_INCOME', 'NO_FOOD_NEED', 'FOOD_QUOTE_MISSING', 'FOOD_QUOTE_EXPIRED', 'FOOD_UNAVAILABLE']);
export const SURVIVAL_OUTCOME_STATUSES = Object.freeze(['succeeded', 'rejected', 'no-action']);
export const SURVIVAL_OUTCOME_DELTA_FIELDS = Object.freeze(['wallet', 'food', 'herbs', 'health', 'fatigue']);

const TICKS_PER_DAY = 144;
const NEED_LIMIT = 1000;
const MAX_PERMILLE = 1000;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const QUOTE_FIELDS = Object.freeze(['product', 'price', 'available', 'observedTick', 'expiresTick', 'sourceEventSeq']);
const OFFER_FIELDS = Object.freeze(['requestId', 'wage', 'observedTick', 'expiresTick', 'sourceEventSeq']);
const KNOWLEDGE_FIELDS = Object.freeze(['knowledgeVersion', 'phase', 'simulationId', 'actorId', 'tick', 'revision',
  'self', 'quote', 'observations', 'belief', 'profile', 'duty', 'planState', 'experience', 'useWorkExperience',
  'foodQuote', 'workOffer']);
const SELF_FIELDS = Object.freeze(['name', 'occupation', 'location', 'alive', 'health', 'hunger', 'fatigue', 'wallet',
  'inventory', 'currentGoal', 'nextGoalId', 'cooldownUntilDay']);
const CANDIDATE_FIELDS = Object.freeze(['action', 'provider', 'sourceRef', 'eligible', 'score', 'support',
  'opposition', 'reasonCode', 'selectable', 'selectionBlockCode']);
const DECISION_FIELDS = Object.freeze(['version', 'decisionId', 'actorId', 'tick', 'goalId', 'planId', 'innerStance',
  'committedIntent', 'apparentAction', 'choice', 'reasonCode', 'gateReason', 'strainPermille', 'candidates',
  'evidenceRefs', 'knowledgeFingerprint', 'mode', 'sourceReviewDecisionId', 'sourceReviewEventSeq']);
const PLAN_FIELDS = Object.freeze(['planId', 'goalId', 'kind', 'steps', 'stepIndex', 'status', 'createdDay',
  'deadlineDay', 'requestId']);
const DUTY_FIELDS = Object.freeze(['requestId', 'sourceEventSeq', 'observedTick', 'expiresTick', 'urgencyPermille',
  'status', 'fulfilledTick']);
const OBSERVATION_FIELDS = Object.freeze(['sourceEventSeq', 'occurrenceTick', 'observedTick', 'channel',
  'sourceActorId', 'available', 'confidencePermille', 'expiresTick']);
// A secure-food plan is either the direct purchase or the two-step work-then-purchase.
const FOOD_STEP_SHAPES = Object.freeze([Object.freeze(['BuyFood']), Object.freeze(['WorkForPay', 'BuyFood'])]);
// The old five keep their frozen budget; the food candidate makes six.
const MAX_SURVIVAL_CANDIDATES = 6;

function permille(value, label) {
  integer(value);
  requireCondition(value <= MAX_PERMILLE, label + ' must stay within 0..1000 permille', 'LIMIT_EXCEEDED');
}

// Overflow is checked before the addition itself, per the shared budget ordering.
function expiry(observedTick) {
  integer(observedTick, 1);
  requireCondition(observedTick <= Number.MAX_SAFE_INTEGER - SURVIVAL_QUOTE_TTL_TICKS,
    'Survival quote expiry would overflow', 'LIMIT_EXCEEDED');
  return observedTick + SURVIVAL_QUOTE_TTL_TICKS;
}

// ---------------------------------------------------------------------------
// actor-local published views
// ---------------------------------------------------------------------------

export function validateSurvivalKnowledgeQuote(quote) {
  if (quote === null) return null;
  record(quote);
  fields(quote, QUOTE_FIELDS);
  requireCondition(quote.product === 'food', 'Unknown survival quote product');
  integer(quote.price, 1);
  requireCondition(typeof quote.available === 'boolean', 'Invalid survival quote availability');
  integer(quote.observedTick, 1);
  integer(quote.expiresTick, 1);
  requireCondition(quote.expiresTick === expiry(quote.observedTick), 'Survival quote expiry does not match its observation');
  integer(quote.sourceEventSeq, 1);
  return quote;
}

export function validateSurvivalWorkOffer(offer) {
  if (offer === null) return null;
  record(offer);
  fields(offer, OFFER_FIELDS);
  identifier(offer.requestId);
  requireCondition(IDENTIFIER_PATTERN.test(offer.requestId), 'Invalid survival offer identifier');
  integer(offer.wage, 1);
  integer(offer.observedTick, 1);
  integer(offer.expiresTick, 1);
  requireCondition(offer.expiresTick > offer.observedTick, 'Survival offer window is empty');
  integer(offer.sourceEventSeq, 1);
  return offer;
}

// Is the quote still this actor's current, fresh source at this decision tick? A future
// observation is a caller error; an expired one is simply unusable.
export function isSurvivalQuoteFresh(quote, tick) {
  integer(tick, 1);
  if (quote === null) return false;
  validateSurvivalKnowledgeQuote(quote);
  return quote.observedTick <= tick && tick < quote.expiresTick;
}

export function isSurvivalOfferFresh(offer, tick) {
  integer(tick, 1);
  if (offer === null) return false;
  validateSurvivalWorkOffer(offer);
  return offer.observedTick <= tick && tick < offer.expiresTick;
}

// ---------------------------------------------------------------------------
// the actor-2 decision Knowledge
// ---------------------------------------------------------------------------

function validateGoal(goal) {
  if (goal === null) return null;
  record(goal);
  fields(goal, ['goalId', 'kind', 'step', 'startDay', 'deadlineDay', 'failures', 'target']);
  integer(goal.goalId, 1);
  requireCondition(goal.kind === 'recover-health', 'Survival knowledge only carries the narrow health goal');
  requireCondition(['use', 'buy', 'wait'].includes(goal.step), 'Unknown survival goal step');
  for (const key of ['startDay', 'deadlineDay', 'failures', 'target']) integer(goal[key]);
  requireCondition(goal.startDay >= 1 && goal.deadlineDay === goal.startDay + 20 && goal.target === 800,
    'Survival goal deadline/target mismatch');
  return goal;
}

function validateDuty(duty) {
  if (duty === null) return null;
  record(duty);
  fields(duty, DUTY_FIELDS);
  identifier(duty.requestId);
  requireCondition(IDENTIFIER_PATTERN.test(duty.requestId), 'Invalid survival duty identifier');
  integer(duty.sourceEventSeq, 1); integer(duty.observedTick, 1); integer(duty.expiresTick, 1);
  requireCondition(duty.expiresTick > duty.observedTick, 'Survival duty window is empty');
  permille(duty.urgencyPermille, 'Survival duty urgency');
  requireCondition(['pending', 'fulfilled'].includes(duty.status), 'Unknown survival duty status');
  if (duty.fulfilledTick !== null) integer(duty.fulfilledTick, 1);
  requireCondition((duty.status === 'fulfilled') === (duty.fulfilledTick !== null), 'Survival duty fulfillment marker mismatch');
  return duty;
}

// The temporary secure-food plan: goalId null, one of exactly two step shapes, its own deadline
// window and a request binding only for the two-step shape.
export function validateSurvivalPlan(plan) {
  if (plan === null) return null;
  record(plan);
  fields(plan, PLAN_FIELDS);
  integer(plan.planId, 1);
  requireCondition(plan.goalId === null, 'Survival plan carries no health goal');
  requireCondition(plan.kind === SURVIVAL_FOOD_PLAN_KIND, 'Unknown survival plan kind');
  denseArray(plan.steps, 2);
  requireCondition(FOOD_STEP_SHAPES.some(shape => shape.length === plan.steps.length &&
    shape.every((step, index) => step === plan.steps[index])), 'Survival plan steps do not match their fixed kind');
  integer(plan.stepIndex);
  requireCondition(SURVIVAL_PLAN_STATUSES.includes(plan.status), 'Unknown survival plan status');
  integer(plan.createdDay, 1);
  integer(plan.deadlineDay, 1);
  requireCondition(plan.deadlineDay === plan.createdDay + SURVIVAL_PLAN_DEADLINE_DAYS,
    'Survival plan deadline must be its creation day plus the fixed window');
  if (plan.steps.length === 2) identifier(plan.requestId);
  else requireCondition(plan.requestId === null, 'A single-step food purchase cites no request');
  if (plan.status === 'completed') requireCondition(plan.stepIndex === plan.steps.length,
    'Completed survival plan step index must sit past its last step');
  else requireCondition(plan.stepIndex < plan.steps.length, 'Survival plan step index exceeds its steps');
  return plan;
}

// The actor-2 decision Knowledge. It carries exactly the frozen cognition fields plus two
// nullable actor-local views. Nothing here is public cash, another actor's private account, a
// market object or a raw receipt.
export function validateSurvivalKnowledge(knowledge) {
  inspectDescriptorTree(knowledge);
  requireCondition(new TextEncoder().encode(canonicalJson(knowledge)).length <= MAX_SURVIVAL_KNOWLEDGE_BYTES,
    'Survival knowledge exceeds budget', 'LIMIT_EXCEEDED');
  record(knowledge);
  fields(knowledge, KNOWLEDGE_FIELDS);
  requireCondition(knowledge.knowledgeVersion === SURVIVAL_KNOWLEDGE_VERSION,
    'Unknown survival knowledge version', 'UNSUPPORTED_VERSION');
  requireCondition(knowledge.phase === 'decision', 'Survival planner only accepts decision-phase knowledge');
  identifier(knowledge.simulationId);
  requireCondition(SURVIVAL_ACTOR_IDS.includes(knowledge.actorId), 'Survival planner actor unavailable', 'MIND_UNAVAILABLE');
  integer(knowledge.tick, 1);
  requireCondition(knowledge.tick % TICKS_PER_DAY === 0, 'Survival decisions sit on a daily tick');
  integer(knowledge.revision);
  requireCondition(knowledge.revision === knowledge.tick - 1, 'Survival revision must precede the decision tick');

  const self = knowledge.self;
  record(self); fields(self, SELF_FIELDS);
  identifier(self.name);
  for (const key of ['occupation', 'location']) identifier(self[key]);
  requireCondition(typeof self.alive === 'boolean', 'Invalid survival knowledge life state');
  for (const key of ['health', 'hunger', 'fatigue'])
    requireCondition(Number.isSafeInteger(self[key]) && self[key] >= 0 && self[key] <= NEED_LIMIT,
      'Survival knowledge need state outside budget');
  integer(self.wallet);
  record(self.inventory); fields(self.inventory, ['food', 'herbs']);
  for (const key of ['food', 'herbs'])
    requireCondition(Number.isSafeInteger(self.inventory[key]) && self.inventory[key] >= 0 && self.inventory[key] <= NEED_LIMIT,
      'Survival knowledge inventory outside budget');
  validateGoal(self.currentGoal); integer(self.nextGoalId, 1); integer(self.cooldownUntilDay);

  record(knowledge.quote); fields(knowledge.quote, ['product', 'price', 'observedTick', 'sourceEventSeq']);
  requireCondition(knowledge.quote.product === 'herbs', 'Unknown survival quote product');
  integer(knowledge.quote.price, 1); integer(knowledge.quote.observedTick);
  if (knowledge.quote.sourceEventSeq !== null) integer(knowledge.quote.sourceEventSeq, 1);

  denseArray(knowledge.observations, MAX_COLLECTION);
  for (const observation of knowledge.observations) {
    record(observation); fields(observation, OBSERVATION_FIELDS);
    integer(observation.sourceEventSeq, 1); integer(observation.occurrenceTick); integer(observation.observedTick);
    identifier(observation.channel);
    if (observation.sourceActorId !== null) identifier(observation.sourceActorId);
    requireCondition(observation.available === null || typeof observation.available === 'boolean',
      'Invalid survival observation availability');
    permille(observation.confidencePermille, 'Survival observation confidence');
    integer(observation.expiresTick);
  }

  record(knowledge.belief);
  fields(knowledge.belief, ['topic', 'value', 'confidencePermille', 'evidenceRefs', 'contradictionRefs', 'lastUpdatedTick']);
  requireCondition(knowledge.belief.topic === 'public-herbs-available' &&
    ['available', 'unavailable', 'unknown'].includes(knowledge.belief.value), 'Invalid survival knowledge belief');
  permille(knowledge.belief.confidencePermille, 'Survival knowledge belief confidence');
  denseArray(knowledge.belief.evidenceRefs, MAX_SURVIVAL_EVIDENCE_REFS);
  denseArray(knowledge.belief.contradictionRefs, MAX_SURVIVAL_EVIDENCE_REFS);
  for (const ref of knowledge.belief.evidenceRefs) integer(ref, 1);
  for (const ref of knowledge.belief.contradictionRefs) integer(ref, 1);
  if (knowledge.belief.lastUpdatedTick !== null) integer(knowledge.belief.lastUpdatedTick);

  record(knowledge.profile); fields(knowledge.profile, ['dutyWeightPermille', 'riskAversionPermille']);
  permille(knowledge.profile.dutyWeightPermille, 'Survival duty weight');
  permille(knowledge.profile.riskAversionPermille, 'Survival risk aversion');

  validateDuty(knowledge.duty);

  record(knowledge.planState);
  fields(knowledge.planState, ['activePlan', 'suspendedPlan', 'nextPlanId', 'lastReviewedDutyId']);
  const active = validateSurvivalSlot(knowledge.planState.activePlan);
  const suspended = validateSurvivalSlot(knowledge.planState.suspendedPlan);
  if (active !== null) requireCondition(['ready', 'blocked'].includes(active.status), 'A finished plan cannot stay active');
  if (suspended !== null) {
    requireCondition(suspended.status === 'suspended', 'Only suspended plans occupy the suspension slot');
    requireCondition(suspended.kind === 'recover-health', 'Only the health plan may be suspended');
  }
  if (active !== null && suspended !== null) requireCondition(active.planId !== suspended.planId,
    'Active and suspended plans must be distinct');
  integer(knowledge.planState.nextPlanId, 1);
  for (const plan of [active, suspended]) if (plan !== null)
    requireCondition(knowledge.planState.nextPlanId > plan.planId,
      'Survival plan counter must exceed existing plan identifiers');
  if (knowledge.planState.lastReviewedDutyId !== null) identifier(knowledge.planState.lastReviewedDutyId);

  requireCondition(typeof knowledge.useWorkExperience === 'boolean', 'Invalid useWorkExperience flag');
  const exp = knowledge.experience;
  record(exp);
  fields(exp, ['version', 'simulationId', 'actorId', 'topic', 'sampleCount', 'failureCount', 'penaltyPermille', 'evidenceRefs']);
  requireCondition(exp.version === 'work-experience-view-v1', 'Unknown work experience view version', 'UNSUPPORTED_VERSION');
  requireCondition(exp.simulationId === knowledge.simulationId, 'Survival experience simulationId mismatch');
  requireCondition(exp.actorId === knowledge.actorId, 'Survival experience actorId mismatch');
  requireCondition(exp.topic === 'work-for-pay-execution', 'Unknown experience topic');
  integer(exp.sampleCount, 0);
  requireCondition(exp.sampleCount <= 4, 'Sample count exceeds window', 'LIMIT_EXCEEDED');
  integer(exp.failureCount, 0);
  requireCondition(exp.failureCount <= exp.sampleCount, 'Failure count exceeds sample count');
  requireCondition(exp.penaltyPermille === Math.min(300, 100 * exp.failureCount), 'Penalty permille mismatch');
  denseArray(exp.evidenceRefs, 4);
  requireCondition(exp.evidenceRefs.length === exp.sampleCount, 'Evidence refs length mismatch');
  let previousRef = 0;
  for (const seq of exp.evidenceRefs) { integer(seq, 1); requireCondition(seq > previousRef, 'Unordered experience evidence refs'); previousRef = seq; }

  validateSurvivalKnowledgeQuote(knowledge.foodQuote);
  validateSurvivalWorkOffer(knowledge.workOffer);
  return knowledge;
}

// A plan slot may hold a frozen M3-2 plan or the temporary secure-food plan.
function validateSurvivalSlot(plan) {
  if (plan === null) return null;
  record(plan);
  if (Object.hasOwn(plan, 'kind') && plan.kind === SURVIVAL_FOOD_PLAN_KIND) return validateSurvivalPlan(plan);
  return validateLegacyPlan(plan);
}

function validateLegacyPlan(plan) {
  fields(plan, PLAN_FIELDS);
  integer(plan.planId, 1);
  requireCondition(['recover-health', 'aid-village', 'recover-rest'].includes(plan.kind), 'Unknown survival plan kind');
  denseArray(plan.steps, 2);
  const shapes = { 'recover-health': [['BuyMedicine', 'UseMedicine'], ['UseMedicine']],
    'aid-village': [['WorkForPay']], 'recover-rest': [['Rest']] };
  requireCondition(shapes[plan.kind].some(shape => shape.length === plan.steps.length &&
    shape.every((step, index) => step === plan.steps[index])), 'Survival plan steps do not match their fixed kind');
  requireCondition(plan.kind === 'recover-health' ? plan.goalId !== null : plan.goalId === null,
    'Survival plan goal binding mismatch');
  if (plan.goalId !== null) integer(plan.goalId, 1);
  integer(plan.createdDay, 1); integer(plan.deadlineDay, 1);
  requireCondition(plan.deadlineDay >= plan.createdDay, 'Survival plan deadline precedes its creation');
  if (plan.kind === 'recover-rest') requireCondition(plan.deadlineDay === plan.createdDay,
    'Rest plan deadline must be its own creation day');
  if (plan.kind === 'aid-village') identifier(plan.requestId);
  else requireCondition(plan.requestId === null, 'Only duty plans carry a request reference');
  requireCondition(SURVIVAL_PLAN_STATUSES.includes(plan.status), 'Unknown survival plan status');
  integer(plan.stepIndex);
  if (plan.status === 'completed') requireCondition(plan.stepIndex === plan.steps.length,
    'Completed plan step index must sit past its last step');
  else requireCondition(plan.stepIndex < plan.steps.length, 'Survival plan step index exceeds its steps');
  return plan;
}

// ---------------------------------------------------------------------------
// decision DTO
// ---------------------------------------------------------------------------

export function validateSurvivalCandidate(candidate) {
  record(candidate);
  fields(candidate, CANDIDATE_FIELDS);
  requireCondition(SURVIVAL_ACTIONS.includes(candidate.action), 'Unknown survival candidate action');
  // The food candidate comes from this actor's own food need, not from a health goal or a role
  // request. It sits sixth so the frozen five keep their exact order.
  const expectedProvider = candidate.action === 'BuyFood' ? 'food-need' : candidate.action === 'WorkForPay' ? 'role-request' :
    candidate.action === 'Rest' ? 'fatigue-need' : candidate.action === 'NoAction' ? 'fallback' : 'health-need';
  requireCondition(candidate.provider === expectedProvider, 'Survival candidate provider mismatch');
  if (candidate.action === 'BuyFood') {
    requireCondition(candidate.sourceRef === null || (typeof candidate.sourceRef === 'string' &&
      IDENTIFIER_PATTERN.test(candidate.sourceRef)), 'Invalid food candidate source reference');
    requireCondition(!candidate.eligible || candidate.sourceRef === 'self-food',
      'An eligible food candidate cites its own food need');
  } else if (candidate.action === 'WorkForPay') {
    requireCondition(candidate.sourceRef === null || (typeof candidate.sourceRef === 'string' &&
      IDENTIFIER_PATTERN.test(candidate.sourceRef)), 'Invalid duty candidate source reference');
    requireCondition(!candidate.eligible || typeof candidate.sourceRef === 'string',
      'An eligible duty candidate must cite its request identifier');
  } else {
    requireCondition(candidate.sourceRef === (candidate.action === 'Rest' ? 'self-fatigue' :
      candidate.action === 'NoAction' ? null : 'recover-health'), 'Survival candidate source reference mismatch');
  }
  requireCondition(typeof candidate.eligible === 'boolean', 'Invalid survival candidate eligibility');
  requireCondition(SURVIVAL_REASON_CODES.includes(candidate.reasonCode), 'Unknown survival candidate reason');
  if (candidate.eligible) {
    integer(candidate.support); integer(candidate.opposition);
    requireCondition(Number.isSafeInteger(candidate.score) && candidate.score === candidate.support - candidate.opposition,
      'Survival candidate score must be support minus opposition');
    requireCondition(candidate.selectable === (candidate.selectionBlockCode === null),
      'A selectable survival candidate must be eligible and unblocked');
  } else {
    requireCondition(candidate.score === null && candidate.support === 0 && candidate.opposition === 0,
      'Ineligible survival candidates carry a null score and empty reasons');
    requireCondition(candidate.selectable === false && candidate.selectionBlockCode === 'SOFT_PRECONDITION_FAILED',
      'Ineligible survival candidates are blocked by their soft precondition');
  }
  return candidate;
}

// The survival decision reuses the cognition envelope field-for-field. Only the version, the
// prefix, the action set, the candidate budget and the reason vocabulary differ.
export function validateSurvivalDecision(decision) {
  inspectDescriptorTree(decision);
  record(decision);
  fields(decision, DECISION_FIELDS);
  requireCondition(decision.version === SURVIVAL_DECISION_VERSION, 'Unknown survival decision version', 'UNSUPPORTED_VERSION');
  identifier(decision.decisionId);
  requireCondition(SURVIVAL_ACTOR_IDS.includes(decision.actorId), 'Foreign survival decision identity');
  integer(decision.tick, TICKS_PER_DAY);
  requireCondition(decision.tick % TICKS_PER_DAY === 0, 'Survival decision must sit on a daily tick');
  requireCondition(decision.decisionId === SURVIVAL_DECISION_PREFIX + decision.tick / TICKS_PER_DAY + '-' + decision.actorId,
    'Survival decision identifier must follow the daily identity');
  if (decision.goalId !== null) integer(decision.goalId, 1);
  if (decision.planId !== null) integer(decision.planId, 1);
  requireCondition(SURVIVAL_STANCES.includes(decision.innerStance), 'Unknown survival stance');
  if (decision.committedIntent !== null) {
    fields(decision.committedIntent, ['goalId', 'kind']); integer(decision.committedIntent.goalId, 1);
    requireCondition(decision.committedIntent.kind === 'recover-health', 'Unknown survival committed intent kind');
  }
  requireCondition(SURVIVAL_ACTIONS.includes(decision.apparentAction) && SURVIVAL_ACTIONS.includes(decision.choice),
    'Unknown survival action');
  requireCondition(decision.apparentAction === decision.choice, 'Survival apparent action and choice must agree');
  requireCondition(SURVIVAL_REASON_CODES.includes(decision.reasonCode), 'Unknown survival decision reason');
  permille(decision.strainPermille, 'Survival strain');
  denseArray(decision.candidates, MAX_SURVIVAL_CANDIDATES);
  requireCondition(decision.mode === 'review' || decision.mode === 'maintain', 'Unknown survival decision mode');
  if (decision.mode === 'review') {
    requireCondition(decision.sourceReviewDecisionId === null && decision.sourceReviewEventSeq === null,
      'Survival review decisions carry no maintain source');
    requireCondition(decision.candidates.length === MAX_SURVIVAL_CANDIDATES, 'Survival review must compare all candidates');
    requireCondition(SURVIVAL_GATES.includes(decision.gateReason), 'Unknown survival review gate');
    requireCondition(decision.candidates.every((candidate, index) => candidate.action === SURVIVAL_ACTIONS[index]),
      'Out-of-order survival candidates');
    for (const candidate of decision.candidates) validateSurvivalCandidate(candidate);
    const chosen = decision.candidates.find(candidate => candidate.action === decision.choice);
    requireCondition(chosen.selectable, 'Survival choice must be a selectable candidate');
    requireCondition(chosen.reasonCode === decision.reasonCode, 'Survival decision reason must be the chosen candidate reason');
  } else {
    requireCondition(decision.candidates.length === 0, 'Survival maintain decisions must not carry fabricated candidates');
    requireCondition(SURVIVAL_MAINTAIN_GATES.includes(decision.gateReason), 'Unknown survival maintain gate');
    identifier(decision.sourceReviewDecisionId);
    const sourceIdentity = /^survival-day-([1-9][0-9]*)-(actor-[23])$/.exec(decision.sourceReviewDecisionId);
    requireCondition(sourceIdentity !== null && sourceIdentity[2] === decision.actorId,
      'Invalid survival maintain source identity');
    const sourceDay = Number(sourceIdentity[1]);
    requireCondition(Number.isSafeInteger(sourceDay) && sourceDay < decision.tick / TICKS_PER_DAY,
      'Survival maintain source must be a strictly earlier daily decision');
    integer(decision.sourceReviewEventSeq, 1);
    requireCondition(decision.gateReason === 'CONTINUE_MAINTAIN' ? decision.choice !== 'NoAction' : decision.choice === 'NoAction',
      'Survival maintain gate/choice mismatch');
  }
  denseArray(decision.evidenceRefs, MAX_SURVIVAL_EVIDENCE_REFS);
  let previous = 0;
  for (const sequence of decision.evidenceRefs) {
    integer(sequence, 1);
    requireCondition(sequence > previous, 'Dirty/duplicate survival evidence');
    previous = sequence;
  }
  requireCondition(typeof decision.knowledgeFingerprint === 'string' &&
    new TextEncoder().encode(decision.knowledgeFingerprint).length <= MAX_SURVIVAL_KNOWLEDGE_BYTES,
    'Survival knowledge fingerprint exceeds budget', 'LIMIT_EXCEEDED');
  return decision;
}

// Same outcome fields as M3-2 plus the private food delta, so a real purchase reconciles
// against the private inventory.
export function validateSurvivalOutcome(outcome) {
  record(outcome);
  fields(outcome, ['decisionId', 'actorId', 'commandId', 'status', 'code', 'delta', 'price', 'publicFoodProduced', 'failureOwner']);
  identifier(outcome.decisionId);
  requireCondition(SURVIVAL_ACTOR_IDS.includes(outcome.actorId), 'Foreign survival outcome identity');
  if (outcome.commandId !== null) identifier(outcome.commandId);
  requireCondition(SURVIVAL_OUTCOME_STATUSES.includes(outcome.status), 'Unknown survival outcome status');
  // A no-action decision never registers a command, so it can never cite a receipt either.
  requireCondition((outcome.status === 'no-action') === (outcome.commandId === null),
    'Survival no-action outcome must not carry a command');
  requireCondition(outcome.code === null || outcome.code === 'RULE_REJECTED', 'Invalid survival outcome code');
  requireCondition((outcome.status === 'rejected') === (outcome.code === 'RULE_REJECTED'), 'Survival outcome status/code mismatch');
  fields(outcome.delta, SURVIVAL_OUTCOME_DELTA_FIELDS);
  for (const value of Object.values(outcome.delta)) requireCondition(Number.isSafeInteger(value), 'Invalid survival outcome delta');
  if (outcome.price !== null) integer(outcome.price, 1);
  integer(outcome.publicFoodProduced);
  if (outcome.status === 'rejected') {
    fields(outcome.failureOwner, ['planId', 'goalId']); integer(outcome.failureOwner.planId, 1);
    requireCondition(outcome.failureOwner.goalId === null, 'Survival failures belong to the food plan alone');
  } else requireCondition(outcome.failureOwner === null, 'Only rejected survival outcomes carry a failure owner');
  if (outcome.status !== 'succeeded') requireCondition(Object.values(outcome.delta).every(value => value === 0) &&
    outcome.price === null && outcome.publicFoodProduced === 0, 'Failed/no-action survival outcome carries deltas');
  return outcome;
}

// ---------------------------------------------------------------------------
// published announcement facts
// ---------------------------------------------------------------------------

// The tick-1 food quote announcement: exactly four payload fields, no command, no entity.
export function validateSurvivalFoodQuoteAnnouncement(fact) {
  record(fact);
  fields(fact, ['type', 'sourceSystem', 'commandId', 'causationEventSeqs', 'entityIds', 'payload']);
  requireCondition(fact.type === SURVIVAL_FOOD_QUOTE_EVENT, 'Unknown survival announcement type');
  requireCondition(fact.sourceSystem === 'survival', 'Invalid survival announcement source');
  requireCondition(fact.commandId === null, 'Survival announcements carry no command');
  denseArray(fact.causationEventSeqs, 0);
  denseArray(fact.entityIds, 0);
  const payload = fact.payload;
  record(payload);
  fields(payload, ['location', 'product', 'price', 'available']);
  requireCondition(payload.location === 'village', 'Survival food quote belongs to the village');
  requireCondition(payload.product === 'food', 'Unknown survival quote product');
  integer(payload.price, 1);
  requireCondition(typeof payload.available === 'boolean', 'Invalid survival quote availability');
  return fact;
}

// The work-offer announcement for the listening actor only.
export function validateSurvivalWorkOfferAnnouncement(fact) {
  record(fact);
  fields(fact, ['type', 'sourceSystem', 'commandId', 'causationEventSeqs', 'entityIds', 'payload']);
  requireCondition(fact.type === SURVIVAL_WORK_OFFER_EVENT, 'Unknown survival announcement type');
  requireCondition(fact.sourceSystem === 'survival', 'Invalid survival announcement source');
  requireCondition(fact.commandId === null, 'Survival announcements carry no command');
  denseArray(fact.entityIds, 1);
  requireCondition(fact.entityIds.length === 1 && fact.entityIds[0] === SURVIVAL_ACTOR_ID,
    'Survival work offer belongs to the listening actor');
  denseArray(fact.causationEventSeqs, 1);
  const payload = fact.payload;
  record(payload);
  fields(payload, ['actorId', 'requestId', 'wage', 'expiresTick']);
  requireCondition(payload.actorId === SURVIVAL_ACTOR_ID, 'Survival work offer identity mismatch');
  identifier(payload.requestId);
  integer(payload.wage, 1);
  integer(payload.expiresTick, 1);
  return fact;
}

// Pure projections used by the runtime to publish and by tests to verify. The sequence always
// comes from the real event log; nothing is fabricated here.
export function survivalFoodQuoteFrom(payload, observedTick, sourceEventSeq) {
  record(payload);
  integer(observedTick, 1);
  integer(sourceEventSeq, 1);
  return { product: payload.product, price: payload.price, available: payload.available === true,
    observedTick, expiresTick: expiry(observedTick), sourceEventSeq };
}

export function survivalWorkOfferFrom(payload, observedTick, sourceEventSeq) {
  record(payload);
  integer(observedTick, 1);
  integer(sourceEventSeq, 1);
  return { requestId: payload.requestId, wage: payload.wage, observedTick,
    expiresTick: payload.expiresTick, sourceEventSeq };
}

// The food need is a pure reading of this actor's own private inventory: no world lookup, no
// assumption about public stock and no promise to hold a permanent water level.
export function survivalFoodNeeded(knowledge) {
  const self = validateSurvivalKnowledge(knowledge).self;
  return self.alive && self.inventory.food <= SURVIVAL_FOOD_NEED_INVENTORY;
}

// ---------------------------------------------------------------------------
// the survival motivation model
// ---------------------------------------------------------------------------

// The frozen M2 model fields under the survival state version. The only structural addition is
// that either slot may now hold the temporary secure-food plan. A cross-profile or unknown
// version load is always rejected; there is no automatic migration.
export function validateSurvivalMotivationModel(model) {
  inspectDescriptorTree(model);
  record(model);
  requireCondition(model.version === SURVIVAL_MOTIVATION_STATE_VERSION,
    'Unknown motivation state version', 'UNSUPPORTED_VERSION');
  fields(model, ['version', 'config', 'configFingerprint', 'requestCursor', 'cursor', 'actors']);
  validateMotivationConfig(model.config);
  requireCondition(model.configFingerprint === canonicalJson(model.config),
    'Motivation configuration fingerprint mismatch');
  integer(model.requestCursor);
  requireCondition(model.requestCursor <= model.config.requests.length, 'Motivation request cursor exceeds configuration');
  integer(model.cursor);
  denseArray(model.actors, 2);
  requireCondition(model.actors.length === MOTIVATION_ACTOR_IDS.length &&
    model.actors.every((actor, index) => actor.actorId === MOTIVATION_ACTOR_IDS[index]), 'Motivation roster mismatch');
  for (const actor of model.actors) {
    fields(actor, ['actorId', 'lastDuty', 'lastReviewedDutyId', 'activePlan', 'suspendedPlan', 'nextPlanId',
      'lastDecision', 'lastOutcome']);
    validateMotivationDuty(actor.lastDuty);
    if (actor.lastReviewedDutyId !== null) identifier(actor.lastReviewedDutyId);
    validateSurvivalSlot(actor.activePlan); validateSurvivalSlot(actor.suspendedPlan);
    if (actor.activePlan !== null) requireCondition(['ready', 'blocked'].includes(actor.activePlan.status),
      'A finished plan cannot stay active');
    if (actor.suspendedPlan !== null) {
      requireCondition(actor.suspendedPlan.status === 'suspended', 'Only suspended plans occupy the suspension slot');
      requireCondition(['recover-health', SURVIVAL_FOOD_PLAN_KIND].includes(actor.suspendedPlan.kind),
        'Only the health or food plan may be suspended');
    }
    if (actor.activePlan !== null && actor.suspendedPlan !== null)
      requireCondition(actor.activePlan.planId !== actor.suspendedPlan.planId,
        'Active and suspended plans must be distinct');
    integer(actor.nextPlanId, 1);
    for (const plan of [actor.activePlan, actor.suspendedPlan]) if (plan !== null)
      requireCondition(actor.nextPlanId > plan.planId, 'Motivation plan counter must exceed existing plan identifiers');
    if (actor.lastDecision !== null) {
      // Under the survival rules actor-2 carries the survival decision and actor-3 keeps the
      // frozen cognition decision; both are checked by their own validator.
      if (actor.actorId === SURVIVAL_ACTOR_ID) validateSurvivalDecision(actor.lastDecision);
      else validateCognitionMotivationDecision(actor.lastDecision);
      requireCondition(actor.lastDecision.actorId === actor.actorId, 'Foreign motivation decision stored on this actor');
    }
    if (actor.lastOutcome !== null) {
      if (actor.actorId === SURVIVAL_ACTOR_ID) validateSurvivalOutcome(actor.lastOutcome);
      else validateMotivationOutcome(actor.lastOutcome);
      requireCondition(actor.lastDecision !== null, 'Orphaned motivation outcome');
      requireCondition(actor.lastOutcome.actorId === actor.actorId &&
        actor.lastOutcome.decisionId === actor.lastDecision.decisionId, 'Motivation decision/outcome pairing mismatch');
      requireCondition((actor.lastDecision.choice === 'NoAction') === (actor.lastOutcome.status === 'no-action'),
        'Motivation decision/outcome action mismatch');
    }
  }
  return model;
}
