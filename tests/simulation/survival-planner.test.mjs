// M4A A1 slice: the bounded survival DTOs and the pure planner. Every expectation is
// hand-derived from the M4A contract and from the frozen §7 recipe anchors. Nothing here reads
// a world, bundle, clock, RNG or resolver — the planner is exercised on Knowledge alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, cloneData } from '../../runtime/core/data-contract.mjs';
import { deriveMindBelief, observationExpiryTick } from '../../runtime/core/mind-state.mjs';
import { createWorkExperienceState, deriveWorkExperience, observeWorkOutcome } from '../../runtime/core/work-experience.mjs';
import { SURVIVAL_RULES, SURVIVAL_KNOWLEDGE_VERSION, SURVIVAL_DECISION_VERSION,
  SURVIVAL_INSPECTOR_VERSION, SURVIVAL_ACTOR_ID, SURVIVAL_FOOD_PLAN_KIND, SURVIVAL_PLAN_DEADLINE_DAYS,
  SURVIVAL_FOOD_NEED_INVENTORY, SURVIVAL_BUY_FOOD_SUPPORT, SURVIVAL_QUOTE_TTL_TICKS, SURVIVAL_RECIPES,
  MAX_SURVIVAL_KNOWLEDGE_BYTES, MAX_SURVIVAL_EVIDENCE_REFS, MAX_SURVIVAL_PLAN_TRANSITIONS,
  SURVIVAL_SERVICE_FORMAT, validateSurvivalKnowledge, validateSurvivalPlan, validateSurvivalDecision,
  validateSurvivalOutcome, validateSurvivalFoodQuoteAnnouncement, validateSurvivalWorkOfferAnnouncement,
  isSurvivalQuoteFresh, isSurvivalOfferFresh, survivalFoodNeeded } from '../../runtime/core/survival-state.mjs';
import { collectSurvivalCandidates, planSurvivalDecision, continueSurvivalPlan, isSurvivalCommittedStepEligible }
  from '../../runtime/core/survival-planner.mjs';
import { deriveActorSurvivalSignals } from '../../runtime/core/survival-signals.mjs';

const SIM = 'survival-village';
const ACTOR = 'actor-2';
const DAY = 144;

const observationOf = (over = {}) => ({ sourceEventSeq: 3, occurrenceTick: 12, observedTick: 12,
  channel: 'market-check', sourceActorId: null, available: true, confidencePermille: 900,
  expiresTick: observationExpiryTick(12), ...structuredClone(over) });
const dutyOf = (over = {}) => ({ requestId: 's-food-01', sourceEventSeq: 12, observedTick: 100,
  expiresTick: 200, urgencyPermille: 1000, status: 'pending', fulfilledTick: null, ...structuredClone(over) });
// The tick-1 public quote: observed 1, so it stays valid for two whole days.
const quote = (over = {}) => ({ product: 'food', price: 10, available: true, observedTick: 1,
  expiresTick: 1 + SURVIVAL_QUOTE_TTL_TICKS, sourceEventSeq: 2, ...structuredClone(over) });
const offer = (over = {}) => ({ requestId: 's-food-01', wage: 20, observedTick: 100, expiresTick: 200,
  sourceEventSeq: 9, ...structuredClone(over) });

function base(over = {}) {
  const observations = [observationOf()];
  const self = { name: 'Hunter', occupation: 'hunter', location: 'village', alive: true, health: 1000,
    hunger: 200, fatigue: 0, wallet: 30, inventory: { food: 0, herbs: 0 }, currentGoal: null,
    nextGoalId: 1, cooldownUntilDay: 0, ...structuredClone(over.self ?? {}) };
  const tick = over.tick ?? DAY;
  return {
    knowledgeVersion: SURVIVAL_KNOWLEDGE_VERSION, phase: 'decision', simulationId: SIM, actorId: ACTOR,
    tick, revision: tick - 1, self,
    quote: { product: 'herbs', price: 50, observedTick: 0, sourceEventSeq: null },
    observations, belief: deriveMindBelief(observations, tick),
    profile: { dutyWeightPermille: 900, riskAversionPermille: 200 },
    duty: over.duty === undefined ? null : over.duty,
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null,
      ...structuredClone(over.planState ?? {}) },
    experience: deriveWorkExperience(createWorkExperienceState(SIM, ACTOR)),
    useWorkExperience: true,
    foodQuote: over.foodQuote === undefined ? null : over.foodQuote,
    workOffer: over.workOffer === undefined ? null : over.workOffer,
  };
}
const ctx = (over = {}) => ({ evaluationEventSeq: 30, sourceReviewDecisionId: null, sourceReviewEventSeq: null, ...over });
const deepFreeze = value => {
  if (value !== null && typeof value === 'object') { for (const key of Object.keys(value)) deepFreeze(value[key]); Object.freeze(value); }
  return value;
};

// ---------------------------------------------------------------------------
// §3.1 frozen public constants
// ---------------------------------------------------------------------------

test('§3.1: the published survival constants are exact', () => {
  assert.equal(SURVIVAL_RULES, 'm-survival-v1');
  assert.equal(SURVIVAL_KNOWLEDGE_VERSION, 'survival-knowledge-v1');
  assert.equal(SURVIVAL_DECISION_VERSION, 'survival-decision-v1');
  assert.equal(SURVIVAL_INSPECTOR_VERSION, 'survival-inspector-v1');
  assert.equal(SURVIVAL_SERVICE_FORMAT, 7);
  assert.equal(MAX_SURVIVAL_KNOWLEDGE_BYTES, 16384);
  assert.equal(MAX_SURVIVAL_EVIDENCE_REFS, 71);
  assert.equal(MAX_SURVIVAL_PLAN_TRANSITIONS, 8);
  assert.equal(SURVIVAL_QUOTE_TTL_TICKS, 288);
  assert.equal(SURVIVAL_PLAN_DEADLINE_DAYS, 3);
  assert.equal(SURVIVAL_FOOD_NEED_INVENTORY, 1);
  assert.equal(SURVIVAL_BUY_FOOD_SUPPORT, 1200);
  assert.deepEqual([...SURVIVAL_RECIPES], ['affordable', 'earn-then-buy', 'no-opportunity', 'wage-refused', 'no-food']);
});

// ---------------------------------------------------------------------------
// §3.2 Knowledge shape: exactly the frozen fields plus two nullable views
// ---------------------------------------------------------------------------

test('§3.2: actor-2 Knowledge carries no public cash, no peer account and no raw receipt', () => {
  const knowledge = base({ foodQuote: quote(), workOffer: offer(), duty: dutyOf() });
  const keys = Object.keys(knowledge).sort();
  assert.deepEqual(keys, ['actorId', 'belief', 'duty', 'experience', 'foodQuote', 'knowledgeVersion',
    'observations', 'phase', 'planState', 'profile', 'quote', 'revision', 'self', 'simulationId', 'tick',
    'useWorkExperience', 'workOffer']);
  validateSurvivalKnowledge(knowledge);
  // The actor-local views are the only additions; the herb quote stays the frozen one.
  assert.equal(knowledge.quote.product, 'herbs');
  assert.equal(knowledge.foodQuote.product, 'food');
  for (const banned of ['publicCash', 'communalGold', 'resources', 'market', 'receipt', 'peer', 'others'])
    assert.ok(!keys.includes(banned), `${banned} must not enter Knowledge`);
});

test('§3.2: a missing or expired quote is a lawful infeasibility, not an error', () => {
  validateSurvivalKnowledge(base({ foodQuote: null }));
  validateSurvivalKnowledge(base({ workOffer: null }));
  // An expired quote still validates as data; it is simply not fresh at decision time.
  const stale = base({ tick: 432, foodQuote: quote({ observedTick: 144, expiresTick: 432 }) });
  validateSurvivalKnowledge(stale);
  assert.equal(isSurvivalQuoteFresh(stale.foodQuote, 432), false);
  assert.equal(isSurvivalQuoteFresh(quote(), DAY), true);
  // The TTL boundary is exclusive at the far end.
  assert.equal(isSurvivalQuoteFresh(quote(), 289), false);
  assert.equal(isSurvivalQuoteFresh(quote(), 288), true);
  assert.equal(isSurvivalOfferFresh(offer(), 200), false);
  assert.equal(isSurvivalOfferFresh(offer(), 199), true);
});

test('§3.2: a future observation, a bad TTL or a wrong product is INVALID_INPUT', () => {
  assert.throws(() => validateSurvivalKnowledge(base({ foodQuote: quote({ observedTick: DAY + 144, expiresTick: DAY + 144 + 288 }) })),
    error => error?.code === 'INVALID_INPUT');
  assert.throws(() => validateSurvivalKnowledge(base({ foodQuote: quote({ expiresTick: 999 }) })),
    /Survival quote expiry does not match/);
  assert.throws(() => validateSurvivalKnowledge(base({ foodQuote: { ...quote(), product: 'herbs' } })),
    /Unknown survival quote product/);
  assert.throws(() => validateSurvivalKnowledge(base({ foodQuote: { ...quote(), price: 0 } })),
    /Invalid safe integer/);
  assert.throws(() => validateSurvivalKnowledge(base({ foodQuote: { ...quote(), available: 'yes' } })),
    /Invalid survival quote availability/);
  assert.throws(() => validateSurvivalKnowledge(base({ workOffer: { ...offer(), wage: 0 } })),
    /Invalid safe integer/);
});

test('§3.2: the two announcement payloads are exactly four fields each', () => {
  validateSurvivalFoodQuoteAnnouncement({ type: 'SurvivalFoodQuoteAnnounced', sourceSystem: 'survival',
    commandId: null, causationEventSeqs: [], entityIds: [],
    payload: { location: 'village', product: 'food', price: 10, available: true } });
  validateSurvivalWorkOfferAnnouncement({ type: 'SurvivalWorkOfferAnnounced', sourceSystem: 'survival',
    commandId: null, causationEventSeqs: [7], entityIds: ['actor-2'],
    payload: { actorId: 'actor-2', requestId: 's-food-01', wage: 20, expiresTick: 200 } });
  assert.throws(() => validateSurvivalFoodQuoteAnnouncement({ type: 'SurvivalFoodQuoteAnnounced',
    sourceSystem: 'survival', commandId: null, causationEventSeqs: [], entityIds: [],
    payload: { location: 'village', product: 'food', price: 10, available: true, stock: 540 } }),
    /Fields do not match schema/);
  assert.throws(() => validateSurvivalWorkOfferAnnouncement({ type: 'SurvivalWorkOfferAnnounced',
    sourceSystem: 'survival', commandId: null, causationEventSeqs: [7], entityIds: ['actor-3'],
    payload: { actorId: 'actor-2', requestId: 's-food-01', wage: 20, expiresTick: 200 } }),
    /belongs to the listening actor/);
});

test('§3.3: the secure-food plan has a null goal, exactly two shapes and a d+3 deadline', () => {
  const single = { planId: 1, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: ['BuyFood'], stepIndex: 0,
    status: 'ready', createdDay: 1, deadlineDay: 4, requestId: null };
  validateSurvivalPlan(single);
  const two = { ...single, steps: ['WorkForPay', 'BuyFood'], requestId: 's-food-01' };
  validateSurvivalPlan(two);
  assert.throws(() => validateSurvivalPlan({ ...single, steps: ['WorkForPay'] }), /steps do not match/);
  assert.throws(() => validateSurvivalPlan({ ...single, steps: ['BuyFood', 'WorkForPay'] }), /steps do not match/);
  assert.throws(() => validateSurvivalPlan({ ...single, goalId: 1 }), /carries no health goal/);
  assert.throws(() => validateSurvivalPlan({ ...single, deadlineDay: 5 }), /creation day plus the fixed window/);
  assert.throws(() => validateSurvivalPlan({ ...single, requestId: 's-food-01' }), /cites no request/);
  assert.throws(() => validateSurvivalPlan({ ...two, requestId: null }), /Invalid identifier/);
});

test('§3.3: the decision keeps the cognition envelope, its own version and the survival prefix', () => {
  const r = planSurvivalDecision(base({ foodQuote: quote() }), ctx());
  assert.equal(r.decision.version, SURVIVAL_DECISION_VERSION);
  assert.equal(r.decision.decisionId, 'survival-day-1-actor-2');
  assert.equal(r.decision.mode, 'review');
  assert.equal(r.decision.sourceReviewDecisionId, null);
  assert.equal(r.decision.sourceReviewEventSeq, null);
  assert.equal(r.decision.candidates.length, 6);
  // The frozen five keep their exact order with BuyFood appended sixth.
  assert.deepEqual(r.decision.candidates.map(c => c.action),
    ['UseMedicine', 'BuyMedicine', 'WorkForPay', 'Rest', 'NoAction', 'BuyFood']);
  validateSurvivalDecision(r.decision);
});

test('§3.3: maintain carries no fabricated candidates and must cite a strictly earlier anchor', () => {
  const plan = { planId: 1, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: ['WorkForPay', 'BuyFood'],
    stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 4, requestId: 's-food-01' };
  const knowledge = base({ tick: 288, foodQuote: quote(), duty: dutyOf({ status: 'fulfilled', fulfilledTick: 144 }),
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null },
    self: { wallet: 20, inventory: { food: 0, herbs: 0 } } });
  const r = continueSurvivalPlan(knowledge, ctx({ sourceReviewDecisionId: 'survival-day-1-actor-2', sourceReviewEventSeq: 20 }));
  assert.equal(r.decision.mode, 'maintain');
  assert.equal(r.decision.candidates.length, 0);
  assert.equal(r.decision.choice, 'BuyFood');
  assert.equal(r.decision.gateReason, 'CONTINUE_MAINTAIN');
  // A same-day or future anchor is refused, and so is a cross-actor one.
  assert.throws(() => continueSurvivalPlan(knowledge, ctx({ sourceReviewDecisionId: 'survival-day-2-actor-2', sourceReviewEventSeq: 20 })),
    /strictly earlier/);
  assert.throws(() => continueSurvivalPlan(knowledge, ctx({ sourceReviewDecisionId: 'survival-day-1-actor-3', sourceReviewEventSeq: 20 })),
    /belongs to another actor/);
  assert.throws(() => continueSurvivalPlan(knowledge, ctx({ sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 20 })),
    /not a survival review decision/);
});

// ---------------------------------------------------------------------------
// §4 the six candidates and the narrow food/income rule
// ---------------------------------------------------------------------------

test('§4: the food need is a pure reading of this actor\'s own private inventory', () => {
  assert.equal(survivalFoodNeeded(base({ self: { inventory: { food: 0, herbs: 0 } } })), true);
  assert.equal(survivalFoodNeeded(base({ self: { inventory: { food: 1, herbs: 0 } } })), true);
  assert.equal(survivalFoodNeeded(base({ self: { inventory: { food: 2, herbs: 0 } } })), false);
  assert.equal(survivalFoodNeeded(base({ self: { alive: false, inventory: { food: 0, herbs: 0 } } })), false);
});

test('§4: affordable — wallet covers the quote, so the plan is the single BuyFood step', () => {
  const r = planSurvivalDecision(base({ foodQuote: quote(), self: { wallet: 30, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(r.decision.choice, 'BuyFood');
  assert.equal(r.decision.reasonCode, 'BUY_FOOD');
  assert.equal(r.decision.goalId, null);
  assert.equal(r.decision.planId, 1);
  assert.deepEqual(r.activePlan.steps, ['BuyFood']);
  assert.equal(r.activePlan.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.equal(r.activePlan.requestId, null);
  assert.equal(r.activePlan.createdDay, 1);
  assert.equal(r.activePlan.deadlineDay, 1 + SURVIVAL_PLAN_DEADLINE_DAYS);
  const food = r.decision.candidates.find(c => c.action === 'BuyFood');
  assert.equal(food.eligible, true);
  assert.equal(food.support, SURVIVAL_BUY_FOOD_SUPPORT);
  assert.equal(food.opposition, 0);
  assert.equal(food.score, SURVIVAL_BUY_FOOD_SUPPORT);
  assert.equal(food.provider, 'food-need');
  assert.equal(food.sourceRef, 'self-food');
});

test('§4: earn-then-buy — wallet short, real offer present, so Work then BuyFood', () => {
  const knowledge = base({ foodQuote: quote(), workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } });
  const r = planSurvivalDecision(knowledge, ctx());
  assert.equal(r.decision.choice, 'WorkForPay');
  assert.equal(r.decision.reasonCode, 'FOOD_INCOME');
  assert.deepEqual(r.activePlan.steps, ['WorkForPay', 'BuyFood']);
  assert.equal(r.activePlan.requestId, 's-food-01');
  // The frozen Work score is preserved: urgency 1000 * duty 900/1000, strain 0.
  const work = r.decision.candidates.find(c => c.action === 'WorkForPay');
  assert.equal(work.support, 900);
  assert.equal(work.opposition, 0);
  assert.equal(work.score, 900);
  assert.equal(work.reasonCode, 'FOOD_INCOME');
  // The purchase step is not yet affordable, and that reason is recorded honestly.
  const food = r.decision.candidates.find(c => c.action === 'BuyFood');
  assert.equal(food.eligible, false);
  assert.equal(food.reasonCode, 'WALLET_INSUFFICIENT');
  assert.equal(food.score, null);
});

test('§4: no-opportunity — no offer, so no invented income; the day waits', () => {
  const r = planSurvivalDecision(base({ foodQuote: quote(), self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(r.decision.choice, 'NoAction');
  assert.equal(r.activePlan, null);
  const work = r.decision.candidates.find(c => c.action === 'WorkForPay');
  assert.equal(work.eligible, false);
  assert.equal(work.reasonCode, 'DUTY_UNAVAILABLE');
  const food = r.decision.candidates.find(c => c.action === 'BuyFood');
  assert.equal(food.reasonCode, 'WALLET_INSUFFICIENT');
});

test('§4: no food need — the food candidate is kept but ineligible with NO_FOOD_NEED', () => {
  const r = planSurvivalDecision(base({ foodQuote: quote(), self: { wallet: 30, inventory: { food: 20, herbs: 0 } } }), ctx());
  const food = r.decision.candidates.find(c => c.action === 'BuyFood');
  assert.equal(food.eligible, false);
  assert.equal(food.reasonCode, 'NO_FOOD_NEED');
  assert.equal(r.decision.choice, 'NoAction');
});

test('§4: an expired or unavailable quote blocks the food candidate with its own reason', () => {
  const stale = base({ tick: 432, foodQuote: quote(), self: { wallet: 30, inventory: { food: 0, herbs: 0 } } });
  const a = planSurvivalDecision(stale, ctx());
  assert.equal(a.decision.candidates.find(c => c.action === 'BuyFood').reasonCode, 'FOOD_QUOTE_EXPIRED');
  const none = base({ foodQuote: quote({ available: false }), self: { wallet: 30, inventory: { food: 0, herbs: 0 } } });
  const b = planSurvivalDecision(none, ctx());
  assert.equal(b.decision.candidates.find(c => c.action === 'BuyFood').reasonCode, 'FOOD_UNAVAILABLE');
  assert.equal(b.decision.choice, 'NoAction');
  const missing = base({ foodQuote: null, self: { wallet: 30, inventory: { food: 0, herbs: 0 } } });
  const c = planSurvivalDecision(missing, ctx());
  assert.equal(c.decision.candidates.find(c2 => c2.action === 'BuyFood').reasonCode, 'FOOD_QUOTE_MISSING');
});

test('§4: without a fresh food source this need never starts a food plan', () => {
  // Wallet is short, a real offer exists, but the quote is unavailable: the narrow food path
  // must not turn the duty into a food plan. A plain duty Work keeps its frozen DUTY reason.
  const r = planSurvivalDecision(base({ foodQuote: quote({ available: false }), workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.notEqual(r.activePlan?.kind, SURVIVAL_FOOD_PLAN_KIND, 'no secure-food plan without a food source');
  assert.notEqual(r.decision.reasonCode, 'FOOD_INCOME');
  assert.equal(r.decision.candidates.find(c => c.action === 'BuyFood').reasonCode, 'FOOD_UNAVAILABLE');
  // And with no quote at all, the same holds.
  const missing = planSurvivalDecision(base({ foodQuote: null, workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.notEqual(missing.activePlan?.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.notEqual(missing.decision.reasonCode, 'FOOD_INCOME');
});

test('§4: the body soft guard and the window are never bypassed by the food path', () => {
  // Too tired to work: fatigue above the ceiling.
  const tired = base({ foodQuote: quote(), workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, fatigue: 750, inventory: { food: 0, herbs: 0 } } });
  const a = planSurvivalDecision(tired, ctx());
  assert.notEqual(a.activePlan?.kind, SURVIVAL_FOOD_PLAN_KIND, 'no food plan while the body cannot work');
  assert.notEqual(a.decision.reasonCode, 'FOOD_INCOME');
  assert.equal(a.decision.candidates.find(c => c.action === 'WorkForPay').reasonCode, 'FATIGUE_TOO_HIGH_FOR_WORK');
  // Too weak to work: health below the floor.
  const weak = base({ foodQuote: quote(), workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, health: 250, inventory: { food: 0, herbs: 0 } } });
  const b = planSurvivalDecision(weak, ctx());
  assert.notEqual(b.activePlan?.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.notEqual(b.decision.reasonCode, 'FOOD_INCOME');
  assert.equal(b.decision.candidates.find(c => c.action === 'WorkForPay').reasonCode, 'HEALTH_TOO_LOW_FOR_WORK');
  // The wage plus the wallet would still not cover the price.
  const poor = base({ foodQuote: quote({ price: 100 }), workOffer: offer({ wage: 20 }), duty: dutyOf(),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } });
  const c = planSurvivalDecision(poor, ctx());
  assert.notEqual(c.activePlan?.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.notEqual(c.decision.reasonCode, 'FOOD_INCOME');
});

test('§4: mismatched or fulfilled-duty offers are invalid input, null offer is lawful', () => {
  assert.throws(() => planSurvivalDecision(base({ foodQuote: quote(), workOffer: offer({ requestId: 'other' }),
    duty: dutyOf(), self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx()),
    error => error?.code === 'INVALID_INPUT');
  assert.throws(() => planSurvivalDecision(base({ foodQuote: quote(), workOffer: offer(),
    duty: dutyOf({ status: 'fulfilled', fulfilledTick: 144 }),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx()),
    error => error?.code === 'INVALID_INPUT');
  // The legitimate projection removes the offer after fulfillment.
  const done = planSurvivalDecision(base({ foodQuote: quote(), workOffer: null,
    duty: dutyOf({ status: 'fulfilled', fulfilledTick: 144 }),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.notEqual(done.activePlan?.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.notEqual(done.decision.reasonCode, 'FOOD_INCOME');
});

test('§4: emergency fatigue keeps taking priority over the food rule', () => {
  const r = planSurvivalDecision(base({ foodQuote: quote(), self: { wallet: 30, fatigue: 800, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(r.decision.choice, 'Rest');
  assert.equal(r.decision.gateReason, 'URGENT_FATIGUE');
  const food = r.decision.candidates.find(c => c.action === 'BuyFood');
  assert.equal(food.selectable, false);
  assert.equal(food.selectionBlockCode, 'URGENT_OVERRIDE');
});

test('§4: an unexpired food commitment advances its own step on the same planId', () => {
  const plan = { planId: 7, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: ['WorkForPay', 'BuyFood'],
    stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 4, requestId: 's-food-01' };
  const r = planSurvivalDecision(base({ tick: 288, foodQuote: quote(), duty: dutyOf({ status: 'fulfilled', fulfilledTick: 144 }),
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 8, lastReviewedDutyId: null },
    self: { wallet: 20, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(r.decision.choice, 'BuyFood');
  assert.equal(r.decision.gateReason, 'CONTINUE_COMMITTED');
  assert.equal(r.activePlan.planId, 7);
  assert.equal(r.activePlan.stepIndex, 1);
  assert.equal(r.activePlan.requestId, 's-food-01');
});

test('§4: an already-earned purchase step is not re-gated by the duty', () => {
  // The wage was really earned, so a fulfilled/expired request must not cancel the purchase.
  const plan = { planId: 3, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: ['WorkForPay', 'BuyFood'],
    stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 4, requestId: 's-food-01' };
  const r = planSurvivalDecision(base({ tick: 288, foodQuote: quote(), duty: null,
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 4, lastReviewedDutyId: null },
    self: { wallet: 20, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(r.decision.choice, 'BuyFood');
  assert.equal(r.activePlan.planId, 3, 'the earned plan keeps its own identifier');
  assert.equal(r.activePlan.requestId, 's-food-01', 'and keeps the request as its source');
  // But the purchase itself still needs a fresh, available quote: without one it waits and the
  // plan is kept, not silently replaced.
  const stale = planSurvivalDecision(base({ tick: 288, foodQuote: null, duty: null,
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 4, lastReviewedDutyId: null },
    self: { wallet: 20, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(stale.decision.choice, 'NoAction');
  assert.equal(stale.activePlan.planId, 3);
  assert.equal(stale.activePlan.status, 'blocked');
});

test('§4: at most one recover-health plan is suspended and it keeps its identity and deadline', () => {
  const health = { planId: 2, goalId: 5, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'],
    stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null };
  const r = planSurvivalDecision(base({ foodQuote: quote(), planState: { activePlan: health, suspendedPlan: null,
    nextPlanId: 3, lastReviewedDutyId: null }, self: { wallet: 30, inventory: { food: 0, herbs: 0 },
      currentGoal: { goalId: 5, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 3, target: 800 },
      nextGoalId: 6 } }), ctx());
  assert.equal(r.decision.choice, 'BuyFood');
  assert.equal(r.activePlan.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.deepEqual(r.currentGoal, { goalId: 5, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 3, target: 800 });
  // The health plan is parked with every one of its own fields intact.
  assert.deepEqual(r.suspendedPlan, { ...health, status: 'suspended' });
  assert.equal(r.suspendedPlan.planId, 2);
  assert.equal(r.suspendedPlan.goalId, 5);
  assert.equal(r.suspendedPlan.deadlineDay, 21);
  assert.equal(r.suspendedPlan.steps.length, 2);
});

// ---------------------------------------------------------------------------
// §3.3 the d+3 window and its cancellation
// ---------------------------------------------------------------------------

test('§3.3: an expired food plan is cancelled with DEADLINE_EXPIRED before any step runs', () => {
  const plan = { planId: 4, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: ['BuyFood'], stepIndex: 0,
    status: 'ready', createdDay: 1, deadlineDay: 4, requestId: null };
  // Day 4 is still inside the window; day 5 is not.
  const inside = planSurvivalDecision(base({ tick: 4 * DAY, foodQuote: quote(),
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 5, lastReviewedDutyId: null },
    self: { wallet: 30, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(inside.activePlan.planId, 4);
  assert.deepEqual(inside.transitions, []);

  // Day 5 is past the d+3 window. With a fresh quote the old plan is cancelled and a brand new
  // identifier is allocated; the expired step is never executed.
  const outside = planSurvivalDecision(base({ tick: 5 * DAY, foodQuote: quote({ observedTick: 4 * DAY, expiresTick: 4 * DAY + 288 }),
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 5, lastReviewedDutyId: null },
    self: { wallet: 30, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(outside.activePlan?.planId, 5, 'a fresh plan gets a fresh identifier, never the expired one');
  assert.deepEqual(outside.transitions, [{ planId: 4, kind: SURVIVAL_FOOD_PLAN_KIND, fromStatus: 'ready',
    toStatus: 'cancelled', reasonCode: 'DEADLINE_EXPIRED' }]);
  // And with no usable quote at all the expired plan is still cancelled rather than revived.
  const bare = planSurvivalDecision(base({ tick: 5 * DAY, foodQuote: null,
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 5, lastReviewedDutyId: null },
    self: { wallet: 30, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(bare.activePlan, null);
  assert.deepEqual(bare.transitions, [{ planId: 4, kind: SURVIVAL_FOOD_PLAN_KIND, fromStatus: 'ready',
    toStatus: 'cancelled', reasonCode: 'DEADLINE_EXPIRED' }]);
});

test('§5: a work step whose request is gone is cancelled and the day waits lawfully', () => {
  const plan = { planId: 6, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: ['WorkForPay', 'BuyFood'],
    stepIndex: 0, status: 'blocked', createdDay: 1, deadlineDay: 4, requestId: 's-food-01' };
  const r = planSurvivalDecision(base({ tick: 288, foodQuote: quote(), duty: dutyOf({ expiresTick: 200 }),
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 7, lastReviewedDutyId: null },
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.equal(r.activePlan, null);
  assert.deepEqual(r.transitions, [{ planId: 6, kind: SURVIVAL_FOOD_PLAN_KIND, fromStatus: 'blocked',
    toStatus: 'cancelled', reasonCode: 'REQUEST_EXPIRED' }]);
  assert.equal(r.decision.choice, 'NoAction');
});

// ---------------------------------------------------------------------------
// purity, determinism and hostile inputs
// ---------------------------------------------------------------------------

test('A1: the planner never mutates its input and is deterministic', () => {
  const knowledge = deepFreeze(base({ foodQuote: quote(), workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }));
  const a = planSurvivalDecision(knowledge, ctx());
  const b = planSurvivalDecision(knowledge, ctx());
  assert.equal(canonicalJson(a.decision), canonicalJson(b.decision));
  assert.deepEqual(a.activePlan, b.activePlan);
  assert.equal(canonicalJson(knowledge), canonicalJson(base({ foodQuote: quote(), workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } })), 'the Knowledge argument is untouched');
  // Collecting candidates is idempotent too.
  assert.equal(collectSurvivalCandidates(knowledge).length, 6);
});

test('A1: the planner refuses to decide for the dead', () => {
  assert.throws(() => planSurvivalDecision(base({ self: { alive: false, inventory: { food: 0, herbs: 0 } } }), ctx()),
    /does not decide for the dead/);
  assert.throws(() => collectSurvivalCandidates(base({ self: { alive: false, inventory: { food: 0, herbs: 0 } } })),
    /does not decide for the dead/);
});

test('A1: hostile Knowledge shapes are rejected before any getter can run', () => {
  const good = base({ foodQuote: quote() });
  for (const bad of [
    { ...good, foodQuote: { get price() { throw new Error('getter ran'); } } },
    { ...good, extraField: 1 },
    { ...good, knowledgeVersion: 'cognition-knowledge-v1' },
    { ...good, revision: good.tick },
    { ...good, tick: 100 },
    { ...good, phase: 'committed' },
    { ...good, foodQuote: 'not-a-record' },
  ]) assert.throws(() => validateSurvivalKnowledge(bad), undefined, 'hostile Knowledge must fail closed');
  // An empty observation list is lawful (the actor has simply seen nothing yet).
  validateSurvivalKnowledge({ ...good, observations: [] });
  // Sparse arrays, symbols and cycles are refused too.
  const sparse = base({ foodQuote: quote() });
  sparse.observations = [observationOf()];
  sparse.observations[3] = observationOf();
  assert.throws(() => validateSurvivalKnowledge(sparse), /Sparse array/);
  const cyclic = base({ foodQuote: quote() });
  cyclic.self.inventory.self = cyclic;
  assert.throws(() => validateSurvivalKnowledge(cyclic), /Cyclic data/);
});

test('A1: the committed-step query is honest about why a step is blocked', () => {
  const plan = { planId: 1, goalId: null, kind: SURVIVAL_FOOD_PLAN_KIND, steps: ['BuyFood'], stepIndex: 0,
    status: 'ready', createdDay: 1, deadlineDay: 4, requestId: null };
  const ready = base({ foodQuote: quote(), planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null },
    self: { wallet: 30, inventory: { food: 0, herbs: 0 } } });
  assert.deepEqual(isSurvivalCommittedStepEligible(ready, plan), { eligible: true, reasonCode: null });
  const broke = base({ foodQuote: quote(), planState: { activePlan: plan, suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null },
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } });
  assert.deepEqual(isSurvivalCommittedStepEligible(broke, plan), { eligible: false, reasonCode: 'WALLET_INSUFFICIENT' });
  // A plan that is not this actor's committed plan is refused.
  assert.throws(() => isSurvivalCommittedStepEligible(ready, { ...plan, planId: 99 }), /not this actor's committed plan/);
});

// ---------------------------------------------------------------------------
// §4 signals: the single food urgentNeed derivation
// ---------------------------------------------------------------------------

test('§4 signals: private shortage ORs into urgentNeed and the kernel still decides the mode', () => {
  const hungry = deriveActorSurvivalSignals(base({ foodQuote: quote(), self: { inventory: { food: 0, herbs: 0 } } }), 700, null, null);
  assert.equal(hungry.input.urgentNeed, true);
  const fed = deriveActorSurvivalSignals(base({ foodQuote: quote(), self: { inventory: { food: 5, herbs: 0 } } }), 700, null, null);
  assert.equal(fed.input.urgentNeed, false);
  // The frozen needs still raise urgentNeed on their own.
  const tired = deriveActorSurvivalSignals(base({ foodQuote: quote(), self: { fatigue: 800, inventory: { food: 5, herbs: 0 } } }), 700, null, null);
  assert.equal(tired.input.urgentNeed, true);
  const hurt = deriveActorSurvivalSignals(base({ foodQuote: quote(), self: { health: 200, inventory: { food: 5, herbs: 0 } } }), 700, null, null);
  assert.equal(hurt.input.urgentNeed, true);
  // Exactly the frozen kernel input fields, nothing added.
  assert.deepEqual(Object.keys(hungry.input).sort(), ['actorId', 'alive', 'goalOrPlanInvalidated',
    'importancePermille', 'keyEvidenceChanged', 'newMajorDuty', 'relevancePermille', 'simulationId', 'tick', 'urgentNeed']);
});

test('§4 signals: the baseline stays the three semantic values, never a quote seq or wallet', () => {
  const a = deriveActorSurvivalSignals(base({ foodQuote: quote() }), 700, null, null);
  assert.deepEqual(Object.keys(a.baseline), ['keyEvidenceFingerprint']);
  const semantic = JSON.parse(a.baseline.keyEvidenceFingerprint);
  assert.deepEqual(Object.keys(semantic).sort(), ['confidenceEnough', 'penaltyPermille', 'value']);
  // A fresh quote with a different sequence but the same semantics must not wake the actor.
  const b = deriveActorSurvivalSignals(base({ foodQuote: quote({ sourceEventSeq: 77 }) }), 700, a.baseline, null);
  assert.equal(b.input.keyEvidenceChanged, false);
  // A wallet movement must not wake it either.
  const c = deriveActorSurvivalSignals(base({ foodQuote: quote(), self: { wallet: 99 } }), 700, a.baseline, null);
  assert.equal(c.input.keyEvidenceChanged, false);
});

test('§4 signals: only actor-2 is served, and the previous-execution identity is checked', () => {
  // Actor-3 keeps cognition Knowledge; every new survival-only entry refuses it.
  const foreign = base({ foodQuote: quote() });
  foreign.actorId = 'actor-3';
  foreign.experience = deriveWorkExperience(createWorkExperienceState(SIM, 'actor-3'));
  assert.throws(() => validateSurvivalKnowledge(foreign), error => error?.code === 'MIND_UNAVAILABLE');
  assert.throws(() => deriveActorSurvivalSignals(foreign, 700, null, null), error => error?.code === 'MIND_UNAVAILABLE');
  // A strictly earlier tick keeps the shape valid, so this fails on the decision id itself.
  assert.throws(() => deriveActorSurvivalSignals(base({ tick: 2 * DAY, foodQuote: quote() }), 700, null,
    { simulationId: SIM, actorId: ACTOR, tick: DAY, decisionId: 'cognition-day-1-actor-2', choice: 'NoAction',
      status: 'no-action', code: null, failureOwner: null }),
    /decision identifier mismatch/);
  // A same-or-later tick is refused regardless.
  assert.throws(() => deriveActorSurvivalSignals(base({ foodQuote: quote() }), 700, null,
    { simulationId: SIM, actorId: ACTOR, tick: DAY, decisionId: 'survival-day-1-actor-2', choice: 'NoAction',
      status: 'no-action', code: null, failureOwner: null }),
    /must precede the evaluated tick/);
});

test('§4 signals: a real own rejection yesterday invalidates the plan', () => {
  const rejected = { simulationId: SIM, actorId: ACTOR, tick: DAY, decisionId: 'survival-day-1-actor-2',
    choice: 'WorkForPay', status: 'rejected', code: 'RULE_REJECTED', failureOwner: { planId: 1, goalId: null } };
  const today = base({ tick: 2 * DAY, foodQuote: quote({ observedTick: 288, expiresTick: 576 }) });
  // A rejection two days back is not "yesterday" for decision tick 432, so it must not count.
  const older = { ...rejected, tick: DAY, decisionId: 'survival-day-1-actor-2' };
  const a = deriveActorSurvivalSignals({ ...today, tick: 3 * DAY, revision: 3 * DAY - 1 }, 700, null, older);
  assert.equal(a.input.goalOrPlanInvalidated, false);
  // A rejection on the immediately preceding day does count.
  const b = deriveActorSurvivalSignals(today, 700, null, rejected);
  assert.equal(b.input.goalOrPlanInvalidated, true);
  // A success yesterday is not an invalidation.
  const c = deriveActorSurvivalSignals(today, 700, null,
    { ...rejected, status: 'succeeded', code: null, failureOwner: null });
  assert.equal(c.input.goalOrPlanInvalidated, false);
});

test('§4 signals: an experience failure is part of the frozen key evidence', () => {
  const failed = deriveWorkExperience(observeWorkOutcome(createWorkExperienceState(SIM, ACTOR), {
    simulationId: SIM, actorId: ACTOR, sourceEventSeq: 9, occurrenceTick: DAY,
    decisionId: 'survival-day-1-actor-2', commandId: 'survival-day-1-actor-2',
    action: 'WorkForPay', status: 'rejected', code: 'RULE_REJECTED' }).state);
  const knowledge = base({ foodQuote: quote() });
  knowledge.experience = failed;
  const a = deriveActorSurvivalSignals(knowledge, 700, null, null);
  assert.equal(a.input.keyEvidenceChanged, false);
  const b = deriveActorSurvivalSignals(knowledge, 700,
    deriveActorSurvivalSignals(base({ foodQuote: quote() }), 700, null, null).baseline, null);
  assert.equal(b.input.keyEvidenceChanged, true, 'a penalty change is real key evidence');
});

// ---------------------------------------------------------------------------
// §3.3 the outcome carries the food delta and the real price
// ---------------------------------------------------------------------------

test('§3.3: the survival outcome adds the private food delta and keeps the frozen fields', () => {
  const outcome = { decisionId: 'survival-day-1-actor-2', actorId: ACTOR,
    commandId: 'survival-day-1-actor-2', status: 'succeeded', code: null,
    delta: { wallet: -10, food: 1, herbs: 0, health: 0, fatigue: 0 }, price: 10,
    publicFoodProduced: 0, failureOwner: null };
  validateSurvivalOutcome(outcome);
  assert.deepEqual(Object.keys(outcome.delta).sort(), ['fatigue', 'food', 'health', 'herbs', 'wallet']);
  // A rejection belongs to the food plan alone.
  const rejected = { ...outcome, status: 'rejected', code: 'RULE_REJECTED', price: null,
    delta: { wallet: 0, food: 0, herbs: 0, health: 0, fatigue: 0 },
    failureOwner: { planId: 1, goalId: null } };
  validateSurvivalOutcome(rejected);
  assert.throws(() => validateSurvivalOutcome({ ...rejected, failureOwner: { planId: 1, goalId: 5 } }),
    /belong to the food plan alone/);
  assert.throws(() => validateSurvivalOutcome({ ...rejected, delta: { wallet: 0, herbs: 0, health: 0, fatigue: 0 } }),
    /Fields do not match schema/);
  // A BuyMedicine success also records the real price.
  validateSurvivalOutcome({ ...outcome, delta: { wallet: -50, food: 0, herbs: 1, health: 0, fatigue: 0 }, price: 50 });
});

test('§3.3: evidence and transition budgets are not expanded', () => {
  const r = planSurvivalDecision(base({ foodQuote: quote(), workOffer: offer(), duty: dutyOf(),
    self: { wallet: 0, inventory: { food: 0, herbs: 0 } } }), ctx());
  assert.ok(r.decision.evidenceRefs.length <= MAX_SURVIVAL_EVIDENCE_REFS);
  let previous = 0;
  for (const seq of r.decision.evidenceRefs) { assert.ok(seq > previous, 'evidence must be sorted and unique'); previous = seq; }
  assert.ok(r.decision.candidates.length <= 6);
  assert.ok((r.transitions ?? []).length <= MAX_SURVIVAL_PLAN_TRANSITIONS);
});

test('A1: the knowledge byte budget is enforced', () => {
  const knowledge = base({ foodQuote: quote() });
  validateSurvivalKnowledge(knowledge);
  const bloated = base({ foodQuote: quote() });
  bloated.observations = Array.from({ length: 400 }, (_, i) => observationOf({ sourceEventSeq: 100 + i, channel: 'x'.repeat(40) }));
  assert.throws(() => validateSurvivalKnowledge(bloated), /exceeds budget/);
});

test('A1: cloneData rejects non-JSON values supplied in place of the actor-local views', () => {
  const knowledge = base({ foodQuote: quote() });
  knowledge.foodQuote.available = undefined;
  assert.throws(() => validateSurvivalKnowledge(knowledge), /Non-JSON data|availability/);
  const symbolic = base({ foodQuote: quote() });
  symbolic.workOffer = Symbol('offer');
  assert.throws(() => validateSurvivalKnowledge(symbolic), /Non-JSON data/);
});
