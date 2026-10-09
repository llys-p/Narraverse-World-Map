// M3-3A A1 slice: cognition state/validator, actor-local pure signals (contract C1), the
// committed-step guards (§3) and the two planner paths — full review and maintain
// continuation (contract C4 planner part). Every expectation is hand-derived from
// M3-3A-COGNITION-RUNTIME-TASK.md; nothing here reads a world, resolver, clock or RNG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, commandInput, inputFingerprint } from '../../runtime/core/data-contract.mjs';
import {
  COGNITION_RULES,
  COGNITION_CONFIG_VERSION,
  COGNITION_RUNTIME_STATE_VERSION,
  COGNITION_MOTIVATION_STATE_VERSION,
  COGNITION_KNOWLEDGE_VERSION,
  COGNITION_DECISION_VERSION,
  MAX_COGNITION_MODEL_BYTES,
  MAX_COGNITION_KNOWLEDGE_BYTES,
  MAX_COGNITION_EVIDENCE_REFS,
  validateCognitionConfig,
  createCognitionModel,
  validateCognitionModel,
} from '../../runtime/core/cognition-state.mjs';
import { deriveActorCognitionSignals } from '../../runtime/core/cognition-signals.mjs';
import {
  validateCognitionKnowledge,
  isCommittedStepEligible,
  planCognitionMotivationDecision,
  continueCognitionPlan,
} from '../../runtime/core/motivation-planner.mjs';
import {
  MOTIVATION_ACTIONS,
  MOTIVATION_GATES,
  MOTIVATION_CONFIG_VERSION,
  COGNITION_MAINTAIN_GATES,
  validateCognitionMotivationDecision,
  validateCognitionMotivationModel,
  validateMotivationDecision,
} from '../../runtime/core/motivation-state.mjs';
import {
  createCognitiveReviewState,
  validateCognitiveReviewState,
  evaluateCognitiveReview,
  COGNITIVE_REVIEW_STATE_VERSION,
} from '../../runtime/core/cognitive-review.mjs';
import { createWorkExperienceState, observeWorkOutcome, deriveWorkExperience }
  from '../../runtime/core/work-experience.mjs';
import { deriveMindBelief, observationExpiryTick } from '../../runtime/core/mind-state.mjs';
import { validateExperienceConfig } from '../../runtime/core/experience-state.mjs';
import { projectOwnCognitionWorkOutcome } from '../../runtime/core/work-experience-adapter.mjs';

const SIM = 'cognition-village';
const ACTOR = 'actor-2';
const PEER = 'actor-3';
const DAY = 144;
const TICK = 288; // day 2

// The frozen M3-1B kernel input contract, copied verbatim from cognitive-review.mjs.
const FROZEN_INPUT_FIELDS = ['simulationId', 'actorId', 'tick', 'alive', 'importancePermille',
  'relevancePermille', 'urgentNeed', 'newMajorDuty', 'keyEvidenceChanged', 'goalOrPlanInvalidated'];

const DEFAULT_COGNITION_CONFIG = {
  version: 'cognition-config-v1',
  profiles: [
    { actorId: 'actor-2', importancePermille: 700 },
    { actorId: 'actor-3', importancePermille: 400 },
  ],
};

// ---------------------------------------------------------------------------
// knowledge DTO helpers
// ---------------------------------------------------------------------------

const goalOf = (over = {}) => ({ goalId: 1, kind: 'recover-health', step: 'use', startDay: 1,
  deadlineDay: 21, failures: 0, target: 800, ...structuredClone(over) });
const healthPlan = (over = {}) => ({ planId: 1, goalId: 1, kind: 'recover-health',
  steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 21,
  requestId: null, ...structuredClone(over) });
const dutyPlan = (over = {}) => ({ planId: 2, goalId: null, kind: 'aid-village', steps: ['WorkForPay'],
  stepIndex: 0, status: 'ready', createdDay: 2, deadlineDay: 2, requestId: 'd01', ...structuredClone(over) });
const restPlan = (over = {}) => ({ planId: 3, goalId: null, kind: 'recover-rest', steps: ['Rest'],
  stepIndex: 0, status: 'ready', createdDay: 2, deadlineDay: 2, requestId: null, ...structuredClone(over) });
const dutyOf = (over = {}) => ({ requestId: 'd01', sourceEventSeq: 12, observedTick: 200, expiresTick: 432,
  urgencyPermille: 1000, status: 'pending', fulfilledTick: null, ...structuredClone(over) });

const observationOf = (over = {}) => ({ sourceEventSeq: 3, occurrenceTick: 12, observedTick: 12,
  channel: 'market-check', sourceActorId: null, available: true, confidencePermille: 900,
  expiresTick: observationExpiryTick(12), ...structuredClone(over) });

// Real frozen-kernel products: the belief comes from deriveMindBelief and the experience view
// from deriveWorkExperience. Nothing below is a hand-invented signal source.
const beliefFrom = (observations, tick = TICK) => deriveMindBelief(observations, tick);
const emptyExperience = () => deriveWorkExperience(createWorkExperienceState(SIM, ACTOR));
const failedExperience = () => deriveWorkExperience(observeWorkOutcome(
  createWorkExperienceState(SIM, ACTOR), {
    simulationId: SIM, actorId: ACTOR, sourceEventSeq: 9, occurrenceTick: DAY,
    decisionId: 'cognition-day-1-actor-2', commandId: 'cognition-day-1-actor-2',
    action: 'WorkForPay', status: 'rejected', code: 'RULE_REJECTED',
  }).state);

const BASE = () => ({
  knowledgeVersion: COGNITION_KNOWLEDGE_VERSION,
  phase: 'decision',
  simulationId: SIM,
  actorId: ACTOR,
  tick: TICK,
  revision: TICK - 1,
  self: {
    name: 'Hunter', occupation: 'hunter', location: 'village', alive: true,
    health: 400, hunger: 0, fatigue: 650, wallet: 50, inventory: { food: 20, herbs: 1 },
    currentGoal: goalOf(), nextGoalId: 2, cooldownUntilDay: 0,
  },
  quote: { product: 'herbs', price: 50, observedTick: DAY, sourceEventSeq: 5 },
  observations: [observationOf()],
  belief: beliefFrom([observationOf()]),
  profile: { dutyWeightPermille: 900, riskAversionPermille: 200 },
  duty: dutyOf(),
  planState: { activePlan: healthPlan(), suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null },
  experience: emptyExperience(),
  useWorkExperience: true,
});

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = value !== null && typeof value === 'object' && !Array.isArray(value)
      ? merge({ ...(target[key] ?? {}) }, value)
      : value;
  }
  return target;
}
const knowledge = (over = {}) => merge(structuredClone(BASE()), over);
const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};
const sig = (k, importance = 700, baseline = null, previous = null) =>
  deriveActorCognitionSignals(k, importance, baseline, previous);
// A baseline is only ever the previous evaluation's own output; a second call compares semantics.
const changed = (before, after, importance = 700, previous = null) =>
  deriveActorCognitionSignals(after, importance,
    deriveActorCognitionSignals(before, importance, null, previous).baseline, previous);

// ---------------------------------------------------------------------------
// §1 rules version, configuration and runtime model
// ---------------------------------------------------------------------------

test('§1: the published cognition constants are exact', () => {
  assert.equal(COGNITION_RULES, 'm-cognition-v1');
  assert.equal(COGNITION_CONFIG_VERSION, 'cognition-config-v1');
  assert.equal(COGNITION_RUNTIME_STATE_VERSION, 'cognition-runtime-state-v1');
  assert.equal(COGNITION_MOTIVATION_STATE_VERSION, 'cognition-motivation-state-v1');
  assert.equal(COGNITION_KNOWLEDGE_VERSION, 'cognition-knowledge-v1');
  assert.equal(COGNITION_DECISION_VERSION, 'cognition-decision-v1');
  assert.equal(MAX_COGNITION_MODEL_BYTES, 32768);
  assert.equal(MAX_COGNITION_KNOWLEDGE_BYTES, 16384);
  assert.equal(MAX_COGNITION_EVIDENCE_REFS, 71);
});

test('§1: the default two-actor profile is fixed in identity and order', () => {
  assert.deepEqual(DEFAULT_COGNITION_CONFIG, { version: 'cognition-config-v1', profiles: [
    { actorId: 'actor-2', importancePermille: 700 },
    { actorId: 'actor-3', importancePermille: 400 }] });
  assert.equal(validateCognitionConfig(DEFAULT_COGNITION_CONFIG), DEFAULT_COGNITION_CONFIG);
  // The validator accepts any 0..1000 safe integer, not just the defaults.
  for (const importancePermille of [0, 1, 400, 1000])
    assert.doesNotThrow(() => validateCognitionConfig({ version: 'cognition-config-v1',
      profiles: [{ actorId: 'actor-2', importancePermille }, { actorId: 'actor-3', importancePermille: 400 }] }));
});

test('§1: validators return their input; create returns a detached copy', () => {
  const config = structuredClone(DEFAULT_COGNITION_CONFIG);
  assert.equal(validateCognitionConfig(config), config, 'config validator must not rebuild the DTO');
  const model = createCognitionModel(SIM, config);
  assert.equal(validateCognitionModel(model), model, 'model validator must not rebuild the DTO');
  assert.notEqual(model.config, config);
  assert.notEqual(model.config.profiles, config.profiles);
  assert.notEqual(model.config.profiles[0], config.profiles[0]);
  config.profiles[0].importancePermille = 1;
  config.profiles.push({ actorId: 'actor-9', importancePermille: 5 });
  assert.deepEqual(model.config, DEFAULT_COGNITION_CONFIG, 'the model must not alias its input config');
  assert.deepEqual(model.version, COGNITION_RUNTIME_STATE_VERSION);
  assert.deepEqual(Object.keys(model), ['version', 'simulationId', 'config', 'configFingerprint', 'cursor', 'actors']);
  assert.equal(model.cursor, 0);
});

test('§1: initial model is two empty frozen kernels with null baselines and anchors', () => {
  const model = createCognitionModel(SIM, structuredClone(DEFAULT_COGNITION_CONFIG));
  assert.deepEqual(model.actors.map((actor) => actor.actorId), ['actor-2', 'actor-3']);
  for (const actor of model.actors) {
    assert.deepEqual(Object.keys(actor),
      ['actorId', 'reviewState', 'signalBaseline', 'lastReviewDecisionId', 'lastReviewEventSeq']);
    assert.deepEqual(actor.reviewState, createCognitiveReviewState(SIM, actor.actorId));
    assert.equal(actor.reviewState.version, COGNITIVE_REVIEW_STATE_VERSION);
    assert.equal(actor.reviewState.simulationId, SIM, 'the kernel carries the real simulation identity');
    assert.equal(actor.reviewState.lastEvaluation, null);
    assert.equal(actor.reviewState.lastReviewTick, null);
    assert.equal(actor.signalBaseline, null);
    assert.equal(actor.lastReviewDecisionId, null);
    assert.equal(actor.lastReviewEventSeq, null);
  }
  assert.equal(model.configFingerprint, canonicalJson(DEFAULT_COGNITION_CONFIG));
});

test('§1: config rejections — version, keys, roster, range and unsafe trees', () => {
  const cfg = () => structuredClone(DEFAULT_COGNITION_CONFIG);
  assert.throws(() => validateCognitionConfig({ ...cfg(), version: 'cognition-config-v2' }),
    { code: 'UNSUPPORTED_VERSION' });
  assert.throws(() => validateCognitionConfig({ ...cfg(), extra: 1 }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionConfig({ version: 'cognition-config-v1' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [cfg().profiles[0]] }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [...cfg().profiles, cfg().profiles[0]] }),
    { code: 'LIMIT_EXCEEDED' }, 'a third profile breaks the roster budget');
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [...cfg().profiles].reverse() }),
    { code: 'INVALID_INPUT' }, 'the roster order is fixed');
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [
    { actorId: 'actor-2', importancePermille: 1001 }, { actorId: 'actor-3', importancePermille: 400 }] }),
    { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [
    { actorId: 'actor-2', importancePermille: -1 }, { actorId: 'actor-3', importancePermille: 400 }] }),
    { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [
    { actorId: 'actor-2', importancePermille: 1.5 }, { actorId: 'actor-3', importancePermille: 400 }] }),
    { code: 'INVALID_INPUT' }, 'importance must be a safe integer');
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [
    { actorId: 'actor-4', importancePermille: 700 }, { actorId: 'actor-3', importancePermille: 400 }] }),
    { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionConfig({ ...cfg(), profiles: [
    { actorId: 'actor-2', importancePermille: 700, extra: 0 }, { actorId: 'actor-3', importancePermille: 400 }] }),
    { code: 'INVALID_INPUT' });

  let getterCalls = 0;
  const withGetter = cfg();
  Object.defineProperty(withGetter, 'leak', { enumerable: true, get() { getterCalls++; return 1; } });
  assert.throws(() => validateCognitionConfig(withGetter), { code: 'INVALID_INPUT' });
  assert.equal(getterCalls, 0, 'an accessor must never execute during the descriptor preflight');

  const sparse = cfg();
  sparse.profiles = [sparse.profiles[0], sparse.profiles[1]];
  sparse.profiles[3] = sparse.profiles[0];
  assert.throws(() => validateCognitionConfig(sparse), { code: 'INVALID_INPUT' }, 'sparse arrays are refused');
  class CustomArray extends Array {}
  const custom = new CustomArray();
  custom.push(cfg().profiles[0], cfg().profiles[1]);
  const customConfig = { version: 'cognition-config-v1', profiles: custom };
  assert.throws(() => validateCognitionConfig(customConfig), { code: 'INVALID_INPUT' },
    'only Array.prototype arrays are accepted');
});

test('§1: model rejections — version, identity, fingerprint, anchors and baselines', () => {
  const model = () => createCognitionModel(SIM, structuredClone(DEFAULT_COGNITION_CONFIG));
  assert.throws(() => validateCognitionModel({ ...model(), version: 'cognition-runtime-state-v2' }),
    { code: 'UNSUPPORTED_VERSION' });
  assert.throws(() => validateCognitionModel({ ...model(), padding: 1 }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionModel({ ...model(), cursor: -1 }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionModel({ ...model(), cursor: 1.5 }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionModel({ ...model(), configFingerprint: '{}' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionModel({ ...model(),
    actors: [...model().actors].reverse() }), { code: 'INVALID_INPUT' });
  // review kernel identity drift, in both directions.
  const foreignSim = model();
  foreignSim.actors[0].reviewState = createCognitiveReviewState('other-village', 'actor-2');
  assert.throws(() => validateCognitionModel(foreignSim), { code: 'INVALID_INPUT' });
  const foreignActor = model();
  foreignActor.actors[0].reviewState = createCognitiveReviewState(SIM, PEER);
  assert.throws(() => validateCognitionModel(foreignActor), { code: 'INVALID_INPUT' });
  // baseline shapes.
  for (const signalBaseline of [{}, { keyEvidenceFingerprint: '' }, { keyEvidenceFingerprint: 5 },
    { keyEvidenceFingerprint: 'fp-1' }, { keyEvidenceFingerprint: 'seed' },
    { keyEvidenceFingerprint: 'a', extra: 1 }]) {
    const bad = model();
    bad.actors[0].signalBaseline = signalBaseline;
    assert.throws(() => validateCognitionModel(bad), { code: 'INVALID_INPUT' },
      'baseline ' + canonicalJson(signalBaseline));
  }
  const good = model();
  good.actors[0].signalBaseline = { keyEvidenceFingerprint: canonicalJson({
    value: 'available', confidenceEnough: true, penaltyPermille: 0 }) };
  assert.doesNotThrow(() => validateCognitionModel(good));
});

test('§1: the two review anchors are a pair that matches the latest review tick', () => {
  const model = () => createCognitionModel(SIM, structuredClone(DEFAULT_COGNITION_CONFIG));
  // A real kernel evaluation at tick 144 (day 1) is the only legal way to populate lastReviewTick.
  const evaluated = evaluateCognitiveReview(createCognitiveReviewState(SIM, ACTOR), {
    simulationId: SIM, actorId: ACTOR, tick: DAY, alive: true, importancePermille: 700,
    relevancePermille: 1000, urgentNeed: false, newMajorDuty: false, keyEvidenceChanged: false,
    goalOrPlanInvalidated: false });
  assert.equal(evaluated.state.lastReviewTick, DAY);

  const anchored = model();
  anchored.actors[0].reviewState = evaluated.state;
  anchored.actors[0].lastReviewDecisionId = 'cognition-day-1-actor-2';
  anchored.actors[0].lastReviewEventSeq = 20;
  assert.doesNotThrow(() => validateCognitionModel(anchored));

  const halfDecision = structuredClone(anchored);
  halfDecision.actors[0].lastReviewEventSeq = null;
  assert.throws(() => validateCognitionModel(halfDecision), { code: 'INVALID_INPUT' });
  const halfSeq = structuredClone(anchored);
  halfSeq.actors[0].lastReviewDecisionId = null;
  assert.throws(() => validateCognitionModel(halfSeq), { code: 'INVALID_INPUT' });
  const noAnchor = structuredClone(anchored);
  noAnchor.actors[0].lastReviewDecisionId = null;
  noAnchor.actors[0].lastReviewEventSeq = null;
  assert.throws(() => validateCognitionModel(noAnchor), { code: 'INVALID_INPUT' },
    'a completed review must carry its anchor');
  const staleAnchor = structuredClone(anchored);
  staleAnchor.actors[0].lastReviewDecisionId = 'cognition-day-2-actor-2';
  assert.throws(() => validateCognitionModel(staleAnchor), { code: 'INVALID_INPUT' },
    'the anchor must name the day of the latest review tick');
  const peerAnchor = structuredClone(anchored);
  peerAnchor.actors[0].lastReviewDecisionId = 'cognition-day-1-actor-3';
  assert.throws(() => validateCognitionModel(peerAnchor), { code: 'INVALID_INPUT' });
  // An anchor without any completed review is refused as well.
  const premature = model();
  premature.actors[0].lastReviewDecisionId = 'cognition-day-1-actor-2';
  premature.actors[0].lastReviewEventSeq = 20;
  assert.throws(() => validateCognitionModel(premature), { code: 'INVALID_INPUT' });
  assert.doesNotThrow(() => validateCognitiveReviewState(premature.actors[0].reviewState));
});

test('§1: old validators are not widened by the cognition variants', () => {
  assert.throws(() => validateExperienceConfig(structuredClone(DEFAULT_COGNITION_CONFIG)),
    { code: 'INVALID_INPUT' }, 'the experience config validator still owns its own key set');
  assert.throws(() => validateExperienceConfig({ version: 'cognition-config-v1', useWorkExperience: true }),
    { code: 'UNSUPPORTED_VERSION' });
  // A cognition decision carries mode/sourceReviewDecisionId/sourceReviewEventSeq, so the old
  // 16-key motivation decision validator must refuse it.
  const review = planCognitionMotivationDecision(knowledge(),
    { evaluationEventSeq: 40, sourceReviewDecisionId: null, sourceReviewEventSeq: null });
  assert.equal(review.decision.version, 'cognition-decision-v1');
  assert.throws(() => validateMotivationDecision(review.decision), { code: 'INVALID_INPUT' });
  assert.doesNotThrow(() => validateCognitionMotivationDecision(review.decision));
});

// ---------------------------------------------------------------------------
// §2 / C1 signals
// ---------------------------------------------------------------------------

test('C1: every knowledge DTO used here is a legal cognition knowledge', () => {
  const k = knowledge();
  assert.equal(validateCognitionKnowledge(k), k);
  assert.equal(k.knowledgeVersion, COGNITION_KNOWLEDGE_VERSION);
  assert.deepEqual([...Object.keys(k)].sort(), [...Object.keys(BASE())].sort());
  assert.equal(k.belief.topic, 'public-herbs-available');
  assert.equal(k.belief.value, 'available');
  assert.equal(k.belief.confidencePermille, 900, 'a real deriveMindBelief product');
  assert.deepEqual(k.experience, { version: 'work-experience-view-v1', simulationId: SIM, actorId: ACTOR,
    topic: 'work-for-pay-execution', sampleCount: 0, failureCount: 0, penaltyPermille: 0, evidenceRefs: [] });
  // The M3-2 experience knowledge shape is reused exactly: same keys, only the version differs.
  assert.notEqual(k.knowledgeVersion, 'experience-knowledge-v1');
  assert.equal(k.useWorkExperience, true);
});

test('C1: relevancePermille — the independent expected table', () => {
  const empty = { self: { currentGoal: null, health: 1000, fatigue: 100, hunger: 100, cooldownUntilDay: 0 },
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null }, duty: null };
  const cases = [
    ['dead actor is always 0', { self: { alive: false } }, 0],
    ['currentGoal alone commits', {}, 1000],
    ['activePlan alone commits', { self: { currentGoal: null, health: 1000 },
      planState: { activePlan: healthPlan(), suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null }, duty: null }, 1000],
    ['suspendedPlan alone commits', { self: { currentGoal: null, health: 1000 },
      planState: { activePlan: null, suspendedPlan: healthPlan({ status: 'suspended' }), nextPlanId: 2,
        lastReviewedDutyId: null }, duty: null }, 1000],
    ['an open pending duty commits', { ...empty, duty: dutyOf() }, 1000],
    ['health<=700 past the cooldown commits', { ...empty, self: { ...empty.self, health: 700 } }, 1000],
    ['health<=700 still on cooldown does not', { ...empty, self: { ...empty.self, health: 700, cooldownUntilDay: 3 } }, 500],
    ['health 701 does not', { ...empty, self: { ...empty.self, health: 701 } }, 500],
    ['an already expired duty does not', { ...empty, duty: dutyOf({ expiresTick: TICK }) }, 500],
    ['a fulfilled duty does not', { ...empty, duty: dutyOf({ status: 'fulfilled', fulfilledTick: 288 }) }, 500],
    ['a duty that has not been observed yet does not', { ...empty, duty: dutyOf({ observedTick: TICK + 1 }) }, 500],
    ['nothing at all is the base 500', empty, 500],
  ];
  for (const [label, over, expected] of cases) {
    assert.equal(sig(knowledge(over)).input.relevancePermille, expected, label);
  }
});

test('C1: urgentNeed — the three boundaries, alive only', () => {
  const calm = { self: { fatigue: 100, hunger: 100, health: 1000, currentGoal: null, cooldownUntilDay: 0 },
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null }, duty: null };
  const cases = [
    ['fatigue 799', { fatigue: 799 }, false],
    ['fatigue 800', { fatigue: 800 }, true],
    ['hunger 899', { hunger: 899 }, false],
    ['hunger 900', { hunger: 900 }, true],
    ['health 301', { health: 301 }, false],
    ['health 300', { health: 300 }, true],
  ];
  for (const [label, over, expected] of cases) {
    assert.equal(sig(knowledge({ ...calm, self: { ...calm.self, ...over } })).input.urgentNeed, expected, label);
  }
  // A dead actor is never "in urgent need": the flag is gated on alive.
  assert.equal(sig(knowledge({ ...calm, self: { ...calm.self, alive: false, fatigue: 900 } })).input.urgentNeed, false);
});

test('C1: newMajorDuty — open window, >=900 permille, not yet reviewed', () => {
  const idle = { self: { currentGoal: null, health: 1000, fatigue: 100, hunger: 100, cooldownUntilDay: 0 },
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null } };
  const cases = [
    ['no duty', { ...idle, duty: null }, false],
    ['open duty at 900', { ...idle, duty: dutyOf({ urgencyPermille: 900 }) }, true],
    ['open duty at 1000', { ...idle, duty: dutyOf({ urgencyPermille: 1000 }) }, true],
    ['open duty at 899', { ...idle, duty: dutyOf({ urgencyPermille: 899 }) }, false],
    ['already reviewed request', { ...idle, duty: dutyOf({ urgencyPermille: 1000 }),
      planState: { ...idle.planState, lastReviewedDutyId: 'd01' } }, false],
    ['a different request is new', { ...idle, duty: dutyOf({ urgencyPermille: 1000 }),
      planState: { ...idle.planState, lastReviewedDutyId: 'd02' } }, true],
    ['expired window', { ...idle, duty: dutyOf({ urgencyPermille: 1000, expiresTick: TICK }) }, false],
    ['fulfilled duty', { ...idle, duty: dutyOf({ urgencyPermille: 1000, status: 'fulfilled', fulfilledTick: 288 }) }, false],
    ['dead actor', { ...idle, duty: dutyOf({ urgencyPermille: 1000 }), self: { ...idle.self, alive: false } }, false],
  ];
  for (const [label, over, expected] of cases) {
    assert.equal(sig(knowledge(over)).input.newMajorDuty, expected, label);
  }
});

test('C1: keyEvidenceChanged — only the semantic value may wake the actor', () => {
  const base = knowledge();
  assert.equal(sig(base, 700, null).input.keyEvidenceChanged, false, 'a null baseline never wakes');
  const same = changed(base, knowledge());
  assert.equal(same.input.keyEvidenceChanged, false);

  const quiet = [
    ['raw quote sourceEventSeq', { quote: { product: 'herbs', price: 50, observedTick: DAY, sourceEventSeq: 6 } }],
    ['raw quote observedTick', { quote: { product: 'herbs', price: 50, observedTick: 200, sourceEventSeq: 5 } }],
    ['ordinary wallet movement', { self: { wallet: 900 } }],
    ['ordinary herb movement', { self: { inventory: { food: 20, herbs: 2 } } }],
    ['plan step progress', { planState: { activePlan: healthPlan({ stepIndex: 0 }), suspendedPlan: null,
      nextPlanId: 2, lastReviewedDutyId: null } }],
    ['mild price drift', { quote: { product: 'herbs', price: 51, observedTick: DAY, sourceEventSeq: 5 } }],
    ['raw confidence 900 -> 600 (both >= 600)', { observations: [observationOf({ channel: 'statement',
      sourceEventSeq: 4, sourceActorId: 'actor-1', confidencePermille: 600, available: true })],
      belief: beliefFrom([observationOf({ channel: 'statement', sourceEventSeq: 4,
        sourceActorId: 'actor-1', confidencePermille: 600, available: true })]) }],
  ];
  for (const [label, over] of quiet) {
    assert.equal(changed(base, knowledge(over)).input.keyEvidenceChanged, false, label);
  }

  const loud = [
    ['belief value available -> unavailable', { observations: [observationOf({ available: false })],
      belief: beliefFrom([observationOf({ available: false })]) }],
    ['confidenceEnough falls below 600', { observations: [observationOf({ channel: 'own-rejection',
      sourceEventSeq: 4, available: null, confidencePermille: 0 })],
      belief: beliefFrom([observationOf({ channel: 'own-rejection', sourceEventSeq: 4,
        available: null, confidencePermille: 0 })]) }],
    ['penaltyPermille changes', { experience: failedExperience() }],
  ];
  for (const [label, over] of loud) {
    assert.equal(changed(base, knowledge(over)).input.keyEvidenceChanged, true, label);
  }
  // The semantic value is exactly {value, confidenceEnough, penaltyPermille}.
  const off = { ...knowledge(), experience: failedExperience() };
  assert.equal(sig(off, 700, { keyEvidenceFingerprint: canonicalJson({ confidenceEnough: true,
    penaltyPermille: 100, value: 'available' }) }).input.keyEvidenceChanged, false,
    'the baseline compares the canonical semantic triple');
  assert.equal(sig(off, 700, { keyEvidenceFingerprint: canonicalJson({ confidenceEnough: true,
    penaltyPermille: 0, value: 'available' }) }).input.keyEvidenceChanged, true);
});

test('C1: goalOrPlanInvalidated — the independent expected table', () => {
  const calm = { self: { currentGoal: goalOf(), health: 1000, fatigue: 100, hunger: 100, cooldownUntilDay: 0 },
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null }, duty: null };
  const rejectedYesterday = { simulationId: SIM, actorId: ACTOR, tick: TICK - DAY,
    decisionId: 'cognition-day-1-actor-2', choice: 'WorkForPay', status: 'rejected', code: 'RULE_REJECTED',
    failureOwner: { planId: 2, goalId: null } };
  const cases = [
    ['nothing committed, nothing invalid', calm, false],
    ['an expired plan is invalid', { ...calm, planState: { activePlan: healthPlan({ deadlineDay: 1 }),
      suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null } }, true],
    ['a recover-health plan without its goal', { ...calm, self: { ...calm.self, currentGoal: null },
      planState: { activePlan: healthPlan(), suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null } }, true],
    ['a recover-health plan bound to another goal', { ...calm, self: { ...calm.self,
      currentGoal: goalOf({ goalId: 2 }) },
      planState: { activePlan: healthPlan(), suspendedPlan: null, nextPlanId: 3, lastReviewedDutyId: null } }, true],
    ['an aid plan whose duty is gone', { ...calm, planState: { activePlan: dutyPlan(), suspendedPlan: null,
      nextPlanId: 3, lastReviewedDutyId: null } }, true],
    ['an aid plan bound to another request', { ...calm, duty: dutyOf({ requestId: 'd02' }),
      planState: { activePlan: dutyPlan(), suspendedPlan: null, nextPlanId: 3, lastReviewedDutyId: null } }, true],
    ['an aid plan whose window expired', { ...calm, duty: dutyOf({ expiresTick: TICK }),
      planState: { activePlan: dutyPlan(), suspendedPlan: null, nextPlanId: 3, lastReviewedDutyId: null } }, true],
    ['an aid plan on its own open window', { ...calm, duty: dutyOf(),
      planState: { activePlan: dutyPlan(), suspendedPlan: null, nextPlanId: 3, lastReviewedDutyId: null } }, false],
    ['a genuine own rejection yesterday', { ...calm, planState: { activePlan: dutyPlan(), suspendedPlan: null,
      nextPlanId: 3, lastReviewedDutyId: 'd01' }, duty: dutyOf() }, true, rejectedYesterday],
    ['a rejection from an older day does not wake', { ...calm, tick: 432, revision: 431,
      planState: { activePlan: dutyPlan({ deadlineDay: 3 }), suspendedPlan: null, nextPlanId: 3,
        lastReviewedDutyId: 'd01' }, duty: dutyOf({ observedTick: 300, expiresTick: 576 }) }, false,
      rejectedYesterday],
    ['a successful yesterday does not wake', { ...calm, planState: { activePlan: dutyPlan(), suspendedPlan: null,
      nextPlanId: 3, lastReviewedDutyId: 'd01' }, duty: dutyOf() }, false,
      { ...rejectedYesterday, status: 'succeeded', code: null, failureOwner: null, choice: 'WorkForPay' }],
    ['no goal with a pressing need', { ...calm, self: { ...calm.self, currentGoal: null, health: 700 } }, true],
    ['no goal but no pressing need', { ...calm, self: { ...calm.self, currentGoal: null, health: 701 } }, false],
    ['no goal, pressing but still cooling down', { ...calm, self: { ...calm.self, currentGoal: null,
      health: 700, cooldownUntilDay: 3 } }, false],
    ['a ready step whose soft guard fell', { ...calm, self: { ...calm.self, inventory: { food: 20, herbs: 0 } },
      planState: { activePlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0 }), suspendedPlan: null,
        nextPlanId: 2, lastReviewedDutyId: null } }, true],
    ['a statically blocked plan waits, it does not wake', { ...calm, self: { ...calm.self,
      inventory: { food: 20, herbs: 0 } },
      planState: { activePlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0, status: 'blocked' }),
        suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null } }, false],
    ['a suspended step that merely waits', { ...calm, self: { ...calm.self, inventory: { food: 20, herbs: 0 } },
      planState: { activePlan: null, suspendedPlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0,
        status: 'suspended' }), nextPlanId: 2, lastReviewedDutyId: null } }, false],
    ['an expired suspended plan still wakes', { ...calm, self: { ...calm.self, inventory: { food: 20, herbs: 1 } },
      planState: { activePlan: null, suspendedPlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0,
        status: 'suspended', deadlineDay: 1 }), nextPlanId: 2, lastReviewedDutyId: null } }, true],
    ['an unbound suspended plan still wakes', { ...calm, self: { ...calm.self, currentGoal: null },
      planState: { activePlan: null, suspendedPlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0,
        status: 'suspended' }), nextPlanId: 2, lastReviewedDutyId: null } }, true],
  ];
  for (const [label, over, expected, previous = null] of cases) {
    assert.equal(sig(knowledge(over), 700, null, previous).input.goalOrPlanInvalidated, expected, label);
  }
});

test('C1: a merely expired duty with no bound plan is not an invalidation', () => {
  // Contract §2: "仅 lastDuty 到期本身不触发". With no aid plan the window means nothing.
  const noPlan = knowledge({ self: { currentGoal: goalOf(), health: 1000 }, duty: dutyOf({ expiresTick: TICK }),
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null } });
  assert.equal(sig(noPlan).input.goalOrPlanInvalidated, false);
  // The same expiry does invalidate a plan that is bound to that window.
  const bound = knowledge({ self: { currentGoal: goalOf(), health: 1000 }, duty: dutyOf({ expiresTick: TICK }),
    planState: { activePlan: dutyPlan(), suspendedPlan: null, nextPlanId: 3, lastReviewedDutyId: null } });
  assert.equal(sig(bound).input.goalOrPlanInvalidated, true,
    'a duty plan whose own window closed is a real invalidation');
});

test('C1: isolation — hidden world state can never move this actor\'s signals', () => {
  const hidden = { communalGold: 500, ledgers: { 'actor-3': { wallet: 999, herbs: 9 } } };
  const source = deepFreeze(knowledge());
  const before = canonicalJson(sig(source));
  hidden.communalGold = 99999;
  hidden.ledgers['actor-3'].wallet = 0;
  hidden.ledgers['actor-3'].herbs = 0;
  const after = canonicalJson(sig(source));
  assert.equal(after, before, 'the projection must not read any hidden world state');
  // And a knowledge DTO cannot smuggle it in: extra keys are refused before any value is read.
  assert.throws(() => sig(knowledge({ communalGold: 500 })), { code: 'INVALID_INPUT' });
  assert.throws(() => sig(knowledge({ self: { hiddenSupply: true } })), { code: 'INVALID_INPUT' });
  assert.equal(canonicalJson(source), canonicalJson(knowledge()), 'the frozen input was rewritten');
});

test('C1: previousExecution is validated strictly and never degrades to "no wake"', () => {
  const ok = { simulationId: SIM, actorId: ACTOR, tick: DAY, decisionId: 'cognition-day-1-actor-2',
    choice: 'UseMedicine', status: 'succeeded', code: null, failureOwner: null };
  assert.deepEqual(Object.keys(ok),
    ['simulationId', 'actorId', 'tick', 'decisionId', 'choice', 'status', 'code', 'failureOwner'],
    'the projection is exactly eight fields');
  assert.doesNotThrow(() => sig(knowledge(), 700, null, null));
  assert.doesNotThrow(() => sig(knowledge(), 700, null, ok));
  assert.doesNotThrow(() => sig(knowledge(), 700, null, { ...ok, choice: 'NoAction', status: 'no-action' }));
  assert.doesNotThrow(() => sig(knowledge(), 700, null, { ...ok, choice: 'WorkForPay', status: 'rejected',
    code: 'RULE_REJECTED', failureOwner: { planId: 2, goalId: null } }));

  const bad = [
    ['an extra field', { ...ok, extra: 1 }],
    ['a missing field', { ...ok, code: undefined }],
    ['another simulation', { ...ok, simulationId: 'other-village' }],
    ['another actor', { ...ok, actorId: PEER, decisionId: 'cognition-day-1-actor-3' }],
    ['a tick off the day boundary', { ...ok, tick: 100 }],
    ['a tick that is not strictly earlier', { ...ok, tick: TICK }],
    ['a tick in the future', { ...ok, tick: TICK + DAY, decisionId: 'cognition-day-3-actor-2' }],
    ['a decisionId that breaks the naming rule', { ...ok, decisionId: 'cognition-day-2-actor-2' }],
    ['a decisionId of another actor', { ...ok, decisionId: 'cognition-day-1-actor-3' }],
    ['an unknown choice', { ...ok, choice: 'Walk' }],
    ['an unknown status', { ...ok, status: 'done' }],
    ['NoAction with a real outcome', { ...ok, choice: 'NoAction' }],
    ['a real action with no-action status', { ...ok, status: 'no-action' }],
    ['an unknown code', { ...ok, status: 'rejected', code: 'OTHER',
      failureOwner: { planId: 1, goalId: 1 } }],
    ['rejected without its code', { ...ok, status: 'rejected', failureOwner: { planId: 1, goalId: 1 } }],
    ['a code without a rejection', { ...ok, code: 'RULE_REJECTED' }],
    ['rejected without a failure owner', { ...ok, status: 'rejected', code: 'RULE_REJECTED' }],
    ['a truncated failure owner', { ...ok, status: 'rejected', code: 'RULE_REJECTED',
      failureOwner: { planId: 1 } }],
    ['a non-integer failure owner goal', { ...ok, status: 'rejected', code: 'RULE_REJECTED',
      failureOwner: { planId: 1, goalId: 'x' } }],
    ['a success carrying a failure owner', { ...ok, failureOwner: { planId: 1, goalId: 1 } }],
    ['a no-action carrying a failure owner', { ...ok, choice: 'NoAction', status: 'no-action',
      failureOwner: { planId: 1, goalId: 1 } }],
  ];
  for (const [label, previous] of bad) {
    assert.throws(() => sig(knowledge(), 700, null, previous), { code: 'INVALID_INPUT' }, label);
  }
});

test('C1: importancePermille is a 0..1000 safe integer from this actor\'s own profile', () => {
  assert.equal(sig(knowledge(), 0).input.importancePermille, 0);
  assert.equal(sig(knowledge(), 1000).input.importancePermille, 1000);
  assert.throws(() => sig(knowledge(), 1001), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => sig(knowledge(), -1), { code: 'INVALID_INPUT' });
  assert.throws(() => sig(knowledge(), 1.5), { code: 'INVALID_INPUT' });
  assert.throws(() => sig(knowledge(), '700'), { code: 'INVALID_INPUT' });
});

test('C1: the output is the frozen kernel input plus a one-field baseline', () => {
  const source = deepFreeze(knowledge());
  const result = sig(source);
  assert.deepEqual(Object.keys(result), ['input', 'baseline']);
  // cloneData canonicalises key order; the key set is exactly the frozen kernel's ten fields.
  assert.deepEqual([...Object.keys(result.input)].sort(), [...FROZEN_INPUT_FIELDS].sort());
  assert.equal(Object.keys(result.input).length, 10);
  for (const field of ['alive', 'urgentNeed', 'newMajorDuty', 'keyEvidenceChanged', 'goalOrPlanInvalidated'])
    assert.equal(typeof result.input[field], 'boolean', field + ' must be boolean');
  assert.deepEqual(Object.keys(result.baseline), ['keyEvidenceFingerprint']);
  assert.equal(typeof result.baseline.keyEvidenceFingerprint, 'string');
  // The strongest cross-check: the frozen M3-1B kernel accepts it as-is.
  const evaluated = evaluateCognitiveReview(createCognitiveReviewState(SIM, ACTOR), result.input);
  assert.equal(evaluated.decision.actorId, ACTOR);
  assert.equal(evaluated.decision.tick, TICK);
  assert.deepEqual(evaluated.decision.reasonCodes, ['INITIAL', 'MAJOR_DUTY'],
    'the frozen kernel reads the derived flags: a fresh actor with an unreviewed major duty');
  assert.equal(evaluated.decision.score, 700 * 1000);
});

test('C1: the result shares no mutable sub-object with its arguments', () => {
  const source = knowledge();
  const fingerprint = canonicalJson({ value: 'available', confidenceEnough: true, penaltyPermille: 0 });
  const baseline = { keyEvidenceFingerprint: fingerprint };
  const result = sig(source, 700, baseline, null);
  result.input.tick = 99999;
  result.input.actorId = 'actor-3';
  result.baseline.keyEvidenceFingerprint = 'mutated';
  assert.equal(source.tick, TICK);
  assert.equal(source.actorId, ACTOR);
  assert.equal(baseline.keyEvidenceFingerprint, fingerprint);
  assert.notEqual(result.input, source.self);
  assert.notEqual(result.baseline.keyEvidenceFingerprint, source.belief);
});

test('C1: the baseline is rewritten on every evaluation', () => {
  const first = sig(knowledge());
  const second = sig(knowledge(), 700, first.baseline);
  assert.deepEqual(second.baseline, first.baseline, 'an unchanged semantic keeps the same fingerprint');
  const moved = sig(knowledge({ experience: failedExperience() }), 700, first.baseline);
  assert.notEqual(moved.baseline.keyEvidenceFingerprint, first.baseline.keyEvidenceFingerprint);
  assert.equal(moved.input.keyEvidenceChanged, true);
});

// ---------------------------------------------------------------------------
// §3 isCommittedStepEligible
// ---------------------------------------------------------------------------

test('§3: the queried plan must be this actor\'s own committed plan', () => {
  const k = knowledge();
  assert.doesNotThrow(() => isCommittedStepEligible(k, k.planState.activePlan));
  // A plan that lives in no slot, even a legal one, is refused.
  assert.throws(() => isCommittedStepEligible(k, restPlan()), { code: 'INVALID_INPUT' });
  assert.throws(() => isCommittedStepEligible(k, dutyPlan()), { code: 'INVALID_INPUT' });
  assert.throws(() => isCommittedStepEligible(k, null), { code: 'INVALID_INPUT' });
  assert.throws(() => isCommittedStepEligible(k, { ...healthPlan(), planId: 9 }), { code: 'INVALID_INPUT' });
  // A structurally identical copy of the committed plan is still the committed plan.
  assert.doesNotThrow(() => isCommittedStepEligible(k, structuredClone(healthPlan())));
  // The suspended slot counts too.
  const parked = knowledge({ planState: { activePlan: null,
    suspendedPlan: healthPlan({ status: 'suspended', steps: ['UseMedicine'], stepIndex: 0 }),
    nextPlanId: 2, lastReviewedDutyId: null } });
  assert.doesNotThrow(() => isCommittedStepEligible(parked, parked.planState.suspendedPlan));
});

test('§3: BuyMedicine guard — the independent expected table', () => {
  const buy = (over = {}) => knowledge({ self: { currentGoal: goalOf(), wallet: 50,
    inventory: { food: 20, herbs: 0 }, ...structuredClone(over.self ?? {}) },
    quote: { product: 'herbs', price: 50, observedTick: DAY, sourceEventSeq: 5, ...structuredClone(over.quote ?? {}) },
    belief: over.belief ?? beliefFrom([observationOf()]),
    planState: { activePlan: healthPlan({ steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0 }),
      suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null } });
  const cases = [
    ['all five preconditions hold', buy(), true, null],
    ['no committed goal', buy({ self: { currentGoal: null } }), false, 'NO_HEALTH_GOAL'],
    ['a private herb is already held', buy({ self: { inventory: { food: 20, herbs: 1 } } }), false,
      'PRIVATE_MEDICINE_PRESENT'],
    ['supply unknown', buy({ belief: beliefFrom([observationOf({ channel: 'own-rejection',
      available: null, confidencePermille: 0, sourceEventSeq: 4 })]) }), false, 'SUPPLY_UNKNOWN'],
    ['supply unavailable', buy({ belief: beliefFrom([observationOf({ available: false })]) }), false,
      'SUPPLY_UNAVAILABLE'],
    ['confidence below the floor', buy({ belief: { topic: 'public-herbs-available', value: 'available',
      confidencePermille: 599, evidenceRefs: [3], contradictionRefs: [], lastUpdatedTick: 12 } }), false,
      'SUPPLY_CONFIDENCE_LOW'],
    ['confidence exactly at the floor', buy({ belief: { topic: 'public-herbs-available', value: 'available',
      confidencePermille: 600, evidenceRefs: [3], contradictionRefs: [], lastUpdatedTick: 12 } }), true, null],
    ['wallet one below the price', buy({ self: { wallet: 49 } }), false, 'WALLET_INSUFFICIENT'],
    ['wallet exactly at the price', buy({ self: { wallet: 50 } }), true, null],
  ];
  for (const [label, k, eligible, reasonCode] of cases) {
    assert.deepEqual(isCommittedStepEligible(k, k.planState.activePlan), { eligible, reasonCode }, label);
  }
});

test('§3: UseMedicine guard — the independent expected table', () => {
  const use = (over = {}) => knowledge({ self: { currentGoal: goalOf(), health: 400,
    inventory: { food: 20, herbs: 1 }, ...structuredClone(over) },
    planState: { activePlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0 }), suspendedPlan: null,
      nextPlanId: 2, lastReviewedDutyId: null } });
  const cases = [
    ['held herb and room to heal', use(), true, null],
    ['no committed goal', use({ currentGoal: null }), false, 'NO_HEALTH_GOAL'],
    ['no private medicine', use({ inventory: { food: 20, herbs: 0 } }), false, 'PRIVATE_MEDICINE_MISSING'],
    ['health already full', use({ health: 1000 }), false, 'HEALTH_ALREADY_FULL'],
    ['health one below full', use({ health: 999 }), true, null],
  ];
  for (const [label, k, eligible, reasonCode] of cases) {
    assert.deepEqual(isCommittedStepEligible(k, k.planState.activePlan), { eligible, reasonCode }, label);
  }
});

test('§3: WorkForPay guard — the independent expected table', () => {
  const work = (over = {}) => knowledge({ self: { currentGoal: null, health: 400, fatigue: 650,
    ...structuredClone(over.self ?? {}) }, duty: over.duty === undefined ? dutyOf() : over.duty,
    planState: { activePlan: dutyPlan({ requestId: over.requestId ?? 'd01' }), suspendedPlan: null,
      nextPlanId: 3, lastReviewedDutyId: null } });
  const cases = [
    ['open matching request, fit to work', work(), true, null],
    ['no duty at all', work({ duty: null }), false, 'DUTY_UNAVAILABLE'],
    ['an expired window', work({ duty: dutyOf({ expiresTick: TICK }) }), false, 'DUTY_UNAVAILABLE'],
    ['a fulfilled request', work({ duty: dutyOf({ status: 'fulfilled', fulfilledTick: 288 }) }), false,
      'DUTY_UNAVAILABLE'],
    ['a different request id', work({ duty: dutyOf({ requestId: 'd02' }) }), false, 'DUTY_UNAVAILABLE'],
    ['health one below the floor', work({ self: { health: 299 } }), false, 'HEALTH_TOO_LOW_FOR_WORK'],
    ['health exactly at the floor', work({ self: { health: 300 } }), true, null],
    ['fatigue one above the ceiling', work({ self: { fatigue: 701 } }), false, 'FATIGUE_TOO_HIGH_FOR_WORK'],
    ['fatigue exactly at the ceiling', work({ self: { fatigue: 700 } }), true, null],
  ];
  for (const [label, k, eligible, reasonCode] of cases) {
    assert.deepEqual(isCommittedStepEligible(k, k.planState.activePlan), { eligible, reasonCode }, label);
  }
});

test('§3: Rest guard — the independent expected table', () => {
  const rest = (fatigue) => knowledge({ self: { currentGoal: null, health: 1000, fatigue },
    planState: { activePlan: restPlan(), suspendedPlan: null, nextPlanId: 4, lastReviewedDutyId: null } });
  assert.deepEqual(isCommittedStepEligible(rest(599), rest(599).planState.activePlan),
    { eligible: false, reasonCode: 'FATIGUE_BELOW_REST_THRESHOLD' });
  assert.deepEqual(isCommittedStepEligible(rest(600), rest(600).planState.activePlan),
    { eligible: true, reasonCode: null });
  assert.deepEqual(isCommittedStepEligible(rest(800), rest(800).planState.activePlan),
    { eligible: true, reasonCode: null });
});

test('§3: the query only judges the current step and never scores', () => {
  const k = knowledge({ planState: { activePlan: healthPlan(), suspendedPlan: null, nextPlanId: 2,
    lastReviewedDutyId: null } });
  const current = isCommittedStepEligible(k, k.planState.activePlan);
  assert.deepEqual(Object.keys(current), ['eligible', 'reasonCode']);
  assert.equal('score' in current, false);
  assert.equal('support' in current, false);
  // stepIndex 1 is UseMedicine even though the plan's first step would be blocked.
  assert.deepEqual(current, { eligible: true, reasonCode: null });
  const first = knowledge({ self: { inventory: { food: 20, herbs: 1 } },
    planState: { activePlan: healthPlan({ stepIndex: 0 }), suspendedPlan: null, nextPlanId: 2,
      lastReviewedDutyId: null } });
  assert.deepEqual(isCommittedStepEligible(first, first.planState.activePlan),
    { eligible: false, reasonCode: 'PRIVATE_MEDICINE_PRESENT' });
});

// ---------------------------------------------------------------------------
// §3 planCognitionMotivationDecision — full review
// ---------------------------------------------------------------------------

const reviewContext = (over = {}) => ({ evaluationEventSeq: 40, sourceReviewDecisionId: null,
  sourceReviewEventSeq: null, ...over });

test('§3: a full review keeps the five candidates and the six original gates', () => {
  const source = deepFreeze(knowledge());
  const before = canonicalJson(source);
  const result = planCognitionMotivationDecision(source, reviewContext());
  const decision = result.decision;
  assert.deepEqual(decision.candidates.map((candidate) => candidate.action), [...MOTIVATION_ACTIONS]);
  assert.equal(decision.candidates.length, 5);
  assert.ok(MOTIVATION_GATES.includes(decision.gateReason), 'gate ' + decision.gateReason);
  // The base knowledge carries an open, still unreviewed 1000-permille request, so the ordered
  // gate list stops at NEW_MAJOR_DUTY before it ever reaches the committed step.
  assert.equal(decision.gateReason, 'NEW_MAJOR_DUTY');
  assert.equal(result.lastReviewedDutyId, 'd01', 'a full review may mark the new duty reviewed');
  assert.equal(decision.mode, 'review');
  assert.equal(decision.sourceReviewDecisionId, null);
  assert.equal(decision.sourceReviewEventSeq, null);
  assert.equal(decision.version, COGNITION_DECISION_VERSION);
  assert.equal(decision.decisionId, 'cognition-day-2-actor-2');
  assert.equal(decision.actorId, ACTOR);
  assert.equal(decision.tick, TICK);
  assert.equal(canonicalJson(source), before, 'planning must not rewrite the caller knowledge');
  assert.doesNotThrow(() => validateCognitionMotivationDecision(decision));
});

test('§3: a full review refuses non-null maintain sources and a dead actor', () => {
  assert.throws(() => planCognitionMotivationDecision(knowledge(), reviewContext(
    { sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 20 })), { code: 'INVALID_INPUT' });
  assert.throws(() => planCognitionMotivationDecision(knowledge(), reviewContext({ evaluationEventSeq: 0 })),
    { code: 'INVALID_INPUT' });
  assert.throws(() => planCognitionMotivationDecision(knowledge(), { evaluationEventSeq: 40 }),
    { code: 'INVALID_INPUT' });
  assert.throws(() => planCognitionMotivationDecision(knowledge(), null), { code: 'INVALID_INPUT' });
  assert.throws(() => planCognitionMotivationDecision(knowledge({ self: { alive: false } }), reviewContext()),
    { code: 'RULE_REJECTED' });
});

test('§3: knowledgeFingerprint covers the whole canonical knowledge', () => {
  const result = planCognitionMotivationDecision(knowledge(), reviewContext());
  assert.equal(result.decision.knowledgeFingerprint, canonicalJson(knowledge()));
  const fingerprintOf = (over) => planCognitionMotivationDecision(knowledge(over), reviewContext())
    .decision.knowledgeFingerprint;
  assert.notEqual(fingerprintOf({ self: { wallet: 51 } }), result.decision.knowledgeFingerprint);
  assert.notEqual(fingerprintOf({ duty: dutyOf({ urgencyPermille: 900 }) }), result.decision.knowledgeFingerprint);
  assert.notEqual(fingerprintOf({ belief: beliefFrom([observationOf({ available: false })]) }),
    result.decision.knowledgeFingerprint);
  assert.notEqual(fingerprintOf({ experience: failedExperience() }), result.decision.knowledgeFingerprint);
  assert.notEqual(fingerprintOf({ planState: { activePlan: healthPlan({ stepIndex: 0 }), suspendedPlan: null,
    nextPlanId: 2, lastReviewedDutyId: null } }), result.decision.knowledgeFingerprint);
  assert.notEqual(fingerprintOf({ quote: { product: 'herbs', price: 51, observedTick: DAY,
    sourceEventSeq: 5 } }), result.decision.knowledgeFingerprint);
});

test('§3: evidenceRefs is the ascending deduplicated union including the own evaluation', () => {
  // Two disagreeing market checks: the newest boolean wins and the loser becomes a contradiction.
  const observations = [observationOf({ sourceEventSeq: 3, available: false }),
    observationOf({ sourceEventSeq: 7, available: true })];
  const base = knowledge({ observations, belief: beliefFrom(observations) });
  assert.deepEqual(base.belief.evidenceRefs, [7]);
  assert.deepEqual(base.belief.contradictionRefs, [3]);
  const result = planCognitionMotivationDecision(base, reviewContext({ evaluationEventSeq: 40 }));
  assert.deepEqual(result.decision.evidenceRefs, [3, 7, 12, 40],
    'contradiction + belief + duty source + own evaluation, ascending');
  // A duty that repeats an existing reference is deduplicated, not counted twice.
  const overlap = knowledge({ observations, belief: beliefFrom(observations),
    duty: dutyOf({ sourceEventSeq: 7 }) });
  assert.deepEqual(planCognitionMotivationDecision(overlap, reviewContext({ evaluationEventSeq: 40 }))
    .decision.evidenceRefs, [3, 7, 40]);
  // Experience evidence joins the same union.
  const withExperience = knowledge({ observations, belief: beliefFrom(observations),
    experience: failedExperience() });
  assert.deepEqual(planCognitionMotivationDecision(withExperience, reviewContext({ evaluationEventSeq: 40 }))
    .decision.evidenceRefs, [3, 7, 9, 12, 40]);
  // No duty at all drops its source sequence.
  const noDuty = knowledge({ observations, belief: beliefFrom(observations), duty: null });
  assert.deepEqual(planCognitionMotivationDecision(noDuty, reviewContext({ evaluationEventSeq: 40 }))
    .decision.evidenceRefs, [3, 7, 40]);
  for (const refs of [result.decision.evidenceRefs]) {
    assert.deepEqual(refs, [...new Set(refs)].sort((a, b) => a - b));
    assert.ok(refs.length <= MAX_COGNITION_EVIDENCE_REFS);
  }
});

// ---------------------------------------------------------------------------
// §3 / C4 continueCognitionPlan — maintain
// ---------------------------------------------------------------------------

const maintainContext = (over = {}) => ({ evaluationEventSeq: 40,
  sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 20, ...over });

test('C4: maintain continues the committed step without forging candidates or ids', () => {
  const source = deepFreeze(knowledge({ planState: { activePlan: healthPlan({ steps: ['UseMedicine'],
    stepIndex: 0, status: 'ready' }), suspendedPlan: null, nextPlanId: 7, lastReviewedDutyId: 'd09' } }));
  const before = canonicalJson(source);
  const result = continueCognitionPlan(source, maintainContext());
  const decision = result.decision;
  assert.deepEqual(decision.candidates, [], 'maintain must not fabricate old scores');
  assert.equal(decision.gateReason, 'CONTINUE_MAINTAIN');
  assert.equal(decision.choice, 'UseMedicine');
  assert.equal(decision.apparentAction, 'UseMedicine');
  assert.equal(decision.reasonCode, 'RECOVER_HEALTH');
  assert.equal(decision.mode, 'maintain');
  assert.equal(decision.version, COGNITION_DECISION_VERSION);
  assert.equal(decision.decisionId, 'cognition-day-2-actor-2');
  assert.equal(decision.sourceReviewDecisionId, 'cognition-day-1-actor-2');
  assert.equal(decision.sourceReviewEventSeq, 20);
  assert.equal(decision.planId, 1);
  assert.equal(decision.goalId, 1);
  assert.deepEqual(decision.committedIntent, { goalId: 1, kind: 'recover-health' });
  assert.equal(decision.innerStance, 'health-concerned');
  // Nothing is created, consumed or marked reviewed.
  assert.deepEqual(result.activePlan, healthPlan({ steps: ['UseMedicine'], stepIndex: 0, status: 'ready' }),
    'steps and stepIndex are untouched');
  assert.equal(result.suspendedPlan, null);
  assert.equal(result.nextPlanId, 7, 'no plan identifier is consumed');
  assert.equal(result.lastReviewedDutyId, 'd09', 'no new duty is marked reviewed');
  assert.equal(result.nextGoalId, 2, 'no goal identifier is consumed');
  assert.deepEqual(result.currentGoal, goalOf());
  assert.equal(canonicalJson(source), before, 'continuation must not rewrite the caller knowledge');
  assert.doesNotThrow(() => validateCognitionMotivationDecision(decision));
  // The maintain evidence cites both the evaluation and the review it continues.
  assert.ok(decision.evidenceRefs.includes(40) && decision.evidenceRefs.includes(20));
  assert.deepEqual(decision.evidenceRefs, [...new Set(decision.evidenceRefs)].sort((a, b) => a - b));
});

test('C4: a soft-blocked committed step waits with its real guard reason', () => {
  const source = knowledge({ self: { currentGoal: goalOf(), inventory: { food: 20, herbs: 0 }, health: 400 },
    planState: { activePlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0, status: 'ready' }),
      suspendedPlan: null, nextPlanId: 7, lastReviewedDutyId: 'd09' } });
  const result = continueCognitionPlan(source, maintainContext());
  assert.equal(result.decision.gateReason, 'WAIT_MAINTAIN');
  assert.equal(result.decision.choice, 'NoAction');
  assert.equal(result.decision.apparentAction, 'NoAction');
  assert.equal(result.decision.reasonCode, 'PRIVATE_MEDICINE_MISSING', 'the real guard reason, not WAIT');
  assert.equal(result.decision.planId, 1, 'the blocked plan stays bound');
  assert.equal(result.activePlan.status, 'blocked', 'the plan waits as blocked');
  assert.deepEqual(result.activePlan.steps, ['UseMedicine']);
  assert.equal(result.activePlan.stepIndex, 0);
  assert.equal(result.nextPlanId, 7);
  assert.equal(result.lastReviewedDutyId, 'd09');
  assert.deepEqual(result.decision.candidates, []);
  assert.doesNotThrow(() => validateCognitionMotivationDecision(result.decision));
});

test('C4: an empty active slot only resumes an eligible suspended plan', () => {
  const parked = (herbs) => knowledge({ self: { currentGoal: goalOf(), inventory: { food: 20, herbs },
    health: 400 }, planState: { activePlan: null,
    suspendedPlan: healthPlan({ steps: ['UseMedicine'], stepIndex: 0, status: 'suspended' }),
    nextPlanId: 2, lastReviewedDutyId: 'd09' } });
  const ready = continueCognitionPlan(parked(1), maintainContext());
  assert.equal(ready.decision.gateReason, 'CONTINUE_MAINTAIN');
  assert.equal(ready.decision.choice, 'UseMedicine');
  assert.equal(ready.decision.reasonCode, 'RECOVER_HEALTH');
  assert.deepEqual(ready.activePlan, healthPlan({ steps: ['UseMedicine'], stepIndex: 0, status: 'ready' }),
    'the resumed plan keeps its own id, steps and step');
  assert.equal(ready.suspendedPlan, null);
  assert.equal(ready.nextPlanId, 2);
  assert.equal(ready.lastReviewedDutyId, 'd09');

  const waiting = continueCognitionPlan(parked(0), maintainContext());
  assert.equal(waiting.decision.gateReason, 'WAIT_MAINTAIN');
  assert.equal(waiting.decision.choice, 'NoAction');
  assert.equal(waiting.decision.reasonCode, 'PRIVATE_MEDICINE_MISSING');
  assert.equal(waiting.activePlan, null, 'an ineligible suspension is never promoted');
  assert.deepEqual(waiting.suspendedPlan, healthPlan({ steps: ['UseMedicine'], stepIndex: 0,
    status: 'suspended' }), 'the suspension is preserved untouched');
  assert.equal(waiting.decision.planId, 1);
});

test('C4: two empty slots wait with WAIT and create nothing', () => {
  const source = knowledge({ self: { currentGoal: goalOf(), health: 400 },
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null } });
  const result = continueCognitionPlan(source, maintainContext());
  assert.equal(result.decision.gateReason, 'WAIT_MAINTAIN');
  assert.equal(result.decision.choice, 'NoAction');
  assert.equal(result.decision.reasonCode, 'WAIT');
  assert.equal(result.decision.planId, null);
  assert.equal(result.decision.goalId, null);
  assert.deepEqual(result.decision.candidates, []);
  assert.equal(result.activePlan, null);
  assert.equal(result.suspendedPlan, null);
  assert.equal(result.nextPlanId, 1);
  assert.equal(result.lastReviewedDutyId, null);
});

test('C4: reason codes follow the current intent for Use, Buy, Rest and Work', () => {
  const slot = (plan, nextPlanId, over = {}) => knowledge({ self: { currentGoal: null, health: 400,
    fatigue: 650, inventory: { food: 20, herbs: 1 }, ...structuredClone(over) },
    planState: { activePlan: plan, suspendedPlan: null, nextPlanId, lastReviewedDutyId: 'd01' } });

  const use = continueCognitionPlan(slot(healthPlan({ steps: ['UseMedicine'], stepIndex: 0 }), 2,
    { currentGoal: goalOf() }), maintainContext());
  assert.deepEqual([use.decision.choice, use.decision.reasonCode, use.decision.gateReason],
    ['UseMedicine', 'RECOVER_HEALTH', 'CONTINUE_MAINTAIN']);

  const buy = continueCognitionPlan(slot(healthPlan({ steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0 }), 2,
    { currentGoal: goalOf(), inventory: { food: 20, herbs: 0 }, wallet: 50 }), maintainContext());
  assert.deepEqual([buy.decision.choice, buy.decision.reasonCode, buy.decision.gateReason],
    ['BuyMedicine', 'RECOVER_HEALTH', 'CONTINUE_MAINTAIN']);

  const rest = continueCognitionPlan(slot(restPlan(), 4), maintainContext());
  assert.deepEqual([rest.decision.choice, rest.decision.reasonCode, rest.decision.gateReason],
    ['Rest', 'FATIGUE_RELIEF', 'CONTINUE_MAINTAIN']);

  const work = continueCognitionPlan(slot(dutyPlan({ requestId: 'd01' }), 3), maintainContext());
  assert.deepEqual([work.decision.choice, work.decision.reasonCode, work.decision.gateReason],
    ['WorkForPay', 'DUTY', 'CONTINUE_MAINTAIN']);
  assert.deepEqual(work.decision.candidates, []);
  assert.equal(work.decision.goalId, null, 'a duty plan owns no long-term goal');
  assert.equal(work.decision.planId, 2);

  // The soft-blocked duty step reports its own guard, not WAIT.
  const blocked = continueCognitionPlan(slot(dutyPlan({ requestId: 'd01' }), 3, { fatigue: 701 }),
    maintainContext());
  assert.deepEqual([blocked.decision.choice, blocked.decision.reasonCode, blocked.decision.gateReason],
    ['NoAction', 'FATIGUE_TOO_HIGH_FOR_WORK', 'WAIT_MAINTAIN']);
  assert.equal(blocked.activePlan.status, 'blocked');
});

test('C4: maintain context must be the actor\'s own, strictly earlier review', () => {
  assert.throws(() => continueCognitionPlan(knowledge(), maintainContext({ sourceReviewEventSeq: 40 })),
    { code: 'INVALID_INPUT' }, 'an equal sequence is not strictly earlier');
  assert.throws(() => continueCognitionPlan(knowledge(), maintainContext({ sourceReviewEventSeq: 41 })),
    { code: 'INVALID_INPUT' });
  assert.throws(() => continueCognitionPlan(knowledge(), maintainContext(
    { sourceReviewDecisionId: 'cognition-day-1-actor-3' })), { code: 'INVALID_INPUT' },
    'the maintain source must belong to this actor');
  assert.throws(() => continueCognitionPlan(knowledge(), maintainContext(
    { sourceReviewDecisionId: 'motivation-day-1-actor-2' })), { code: 'INVALID_INPUT' });
  assert.throws(() => continueCognitionPlan(knowledge(), maintainContext({ sourceReviewDecisionId: null })),
    { code: 'INVALID_INPUT' });
  assert.throws(() => continueCognitionPlan(knowledge(), { evaluationEventSeq: 40 }), { code: 'INVALID_INPUT' });
  assert.throws(() => continueCognitionPlan(knowledge({ self: { alive: false } }), maintainContext()),
    { code: 'RULE_REJECTED' }, 'maintain never decides for the dead');
});

test('C4: a tampered cognition decision is refused by the dedicated validator', () => {
  const maintain = continueCognitionPlan(knowledge({ planState: { activePlan: healthPlan({ steps: ['UseMedicine'],
    stepIndex: 0 }), suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null } }), maintainContext()).decision;
  const review = planCognitionMotivationDecision(knowledge(), reviewContext()).decision;
  assert.doesNotThrow(() => validateCognitionMotivationDecision(maintain));
  assert.doesNotThrow(() => validateCognitionMotivationDecision(review));
  assert.ok(COGNITION_MAINTAIN_GATES.includes(maintain.gateReason));

  const mutations = [
    ['mode flipped to review', { ...maintain, mode: 'review' }],
    ['fabricated candidates on maintain', { ...maintain, candidates: review.candidates }],
    ['an old review gate borrowed by maintain', { ...maintain, gateReason: 'SELECT_NEW_PLAN' }],
    ['a bogus maintain gate', { ...maintain, gateReason: 'CONTINUE_COMMITTED' }],
    ['an anchor belonging to another actor', { ...maintain,
      sourceReviewDecisionId: 'cognition-day-1-actor-3' }],
    ['a null maintain source', { ...maintain, sourceReviewDecisionId: null, sourceReviewEventSeq: null }],
    ['CONTINUE_MAINTAIN with NoAction', { ...maintain, choice: 'NoAction', apparentAction: 'NoAction' }],
    ['WAIT_MAINTAIN with an action', { ...maintain, gateReason: 'WAIT_MAINTAIN', choice: 'UseMedicine',
      apparentAction: 'UseMedicine' }],
    ['evidence refs past the 71 budget', { ...maintain,
      evidenceRefs: Array.from({ length: 72 }, (unused, index) => index + 1) }],
    ['a foreign decision version', { ...maintain, version: 'cognition-decision-v2' }],
    ['a decision id from another day', { ...maintain, decisionId: 'cognition-day-3-actor-2' }],
  ];
  for (const [label, decision] of mutations) {
    assert.throws(() => validateCognitionMotivationDecision(decision), label);
  }
  assert.throws(() => validateCognitionMotivationDecision({ ...maintain,
    evidenceRefs: Array.from({ length: 72 }, (unused, index) => index + 1) }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => validateCognitionMotivationDecision({ ...maintain, version: 'cognition-decision-v2' }),
    { code: 'UNSUPPORTED_VERSION' });
  // A review decision may never carry a maintain source and must keep all five candidates.
  assert.throws(() => validateCognitionMotivationDecision({ ...review,
    sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 20 }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionMotivationDecision({ ...review, candidates: [] }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionMotivationDecision({ ...review, mode: 'maintain' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateMotivationDecision(maintain), { code: 'INVALID_INPUT' },
    'the old validator still refuses a cognition decision');
});

test('C4: the cognition motivation model validator accepts only cognition decisions', () => {
  const config = { version: MOTIVATION_CONFIG_VERSION, profiles: [
    { actorId: 'actor-2', dutyWeightPermille: 900, riskAversionPermille: 200 },
    { actorId: 'actor-3', dutyWeightPermille: 800, riskAversionPermille: 300 }], requests: [] };
  const actor = () => ({ actorId: '', lastDuty: null, lastReviewedDutyId: null, activePlan: null,
    suspendedPlan: null, nextPlanId: 1, lastDecision: null, lastOutcome: null });
  const model = (lastDecision = null) => {
    const second = { ...actor(), actorId: PEER };
    return { version: COGNITION_MOTIVATION_STATE_VERSION, config,
      configFingerprint: canonicalJson(config), requestCursor: 0, cursor: 0,
      actors: [{ ...actor(), actorId: ACTOR, lastDecision }, second] };
  };
  assert.doesNotThrow(() => validateCognitionMotivationModel(model()));
  const maintain = continueCognitionPlan(knowledge({ planState: { activePlan: healthPlan({ steps: ['UseMedicine'],
    stepIndex: 0 }), suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null } }), maintainContext()).decision;
  assert.equal(validateCognitionMotivationModel(model(maintain)).actors[0].lastDecision, maintain);
  const review = planCognitionMotivationDecision(knowledge(), reviewContext()).decision;
  assert.doesNotThrow(() => validateCognitionMotivationModel(model(review)));
  assert.throws(() => validateCognitionMotivationModel(model({ ...maintain, mode: 'review' })),
    { code: 'INVALID_INPUT' });
  assert.throws(() => validateCognitionMotivationModel(model({ ...maintain,
    version: 'motivation-decision-v1' })), { code: 'UNSUPPORTED_VERSION' });
  assert.throws(() => validateCognitionMotivationModel({ ...model(maintain),
    version: 'motivation-state-v1' }), { code: 'UNSUPPORTED_VERSION' });
});

// ---------------------------------------------------------------------------
// C4 maintain Work: planner decision plus a legally constructed adapter chain
// ---------------------------------------------------------------------------

test('C4: maintain continues a committed WorkForPay step', () => {
  const source = knowledge({ self: { currentGoal: null, health: 400, hunger: 0, fatigue: 650, wallet: 50,
    inventory: { food: 20, herbs: 0 }, nextGoalId: 2, cooldownUntilDay: 0 },
    duty: dutyOf({ requestId: 'd01', sourceEventSeq: 12, observedTick: 200, expiresTick: 432,
      urgencyPermille: 1000 }),
    planState: { activePlan: dutyPlan({ planId: 2, requestId: 'd01', createdDay: 2, deadlineDay: 2,
      status: 'ready' }), suspendedPlan: null, nextPlanId: 3, lastReviewedDutyId: 'd01' } });
  const result = continueCognitionPlan(source, maintainContext());
  assert.equal(result.decision.choice, 'WorkForPay');
  assert.equal(result.decision.apparentAction, 'WorkForPay');
  assert.equal(result.decision.reasonCode, 'DUTY');
  assert.equal(result.decision.gateReason, 'CONTINUE_MAINTAIN');
  assert.deepEqual(result.decision.candidates, []);
  assert.equal(result.decision.planId, 2);
  assert.equal(result.decision.goalId, null);
  assert.equal(result.decision.committedIntent, null);
  assert.equal(result.decision.mode, 'maintain');
  assert.equal(result.nextPlanId, 3);
  assert.equal(result.lastReviewedDutyId, 'd01');
  assert.deepEqual(result.activePlan.steps, ['WorkForPay']);
  assert.equal(result.activePlan.stepIndex, 0);
  assert.equal(result.activePlan.status, 'ready');
  assert.doesNotThrow(() => validateCognitionMotivationDecision(result.decision));
});

// A hand-built but fully validated trusted chain: Planned -> Committed -> Resolved plus the
// command receipt. It proves the nine-field projection shape only. It is NOT a claim that a
// natural maintain-Work recipe exists in the current fixture.
function cognitionWorkChain() {
  const source = knowledge({ self: { currentGoal: null, health: 400, hunger: 0, fatigue: 650, wallet: 50,
    inventory: { food: 20, herbs: 0 }, nextGoalId: 2, cooldownUntilDay: 0 },
    duty: dutyOf({ requestId: 'd01', sourceEventSeq: 12, observedTick: 200, expiresTick: 432,
      urgencyPermille: 1000 }),
    planState: { activePlan: dutyPlan({ planId: 2, requestId: 'd01', createdDay: 2, deadlineDay: 2,
      status: 'ready' }), suspendedPlan: null, nextPlanId: 3, lastReviewedDutyId: 'd01' } });
  const decision = continueCognitionPlan(source, maintainContext()).decision;
  const commandId = decision.decisionId;
  const result = { actorId: ACTOR, goalId: 0, action: 'WorkForPay', day: 2,
    before: { wallet: 50, inventory: { food: 20, herbs: 0 }, communalGold: 100 },
    after: { wallet: 60, inventory: { food: 20, herbs: 0 }, communalGold: 100 },
    foodProduced: 5, deerKilled: 0, price: 0, injuryDamage: 0, sample: null, targetActorId: null };
  const outcome = { decisionId: commandId, actorId: ACTOR, commandId, status: 'succeeded', code: null,
    delta: { wallet: 10, herbs: 0, health: 0, fatigue: 150 }, price: null, publicFoodProduced: 5,
    failureOwner: null };
  const planned = { eventSeq: 30, tick: TICK, type: 'MotivationDecisionPlanned', schemaVersion: 1,
    sourceSystem: 'motivation', commandId: null, causationEventSeqs: decision.evidenceRefs,
    entityIds: [ACTOR], payload: decision };
  const committed = { eventSeq: 31, tick: TICK, type: 'SocietyActionCommitted', schemaVersion: 1,
    sourceSystem: 'command-engine', commandId, causationEventSeqs: [], entityIds: [ACTOR],
    payload: structuredClone(result) };
  const resolved = { eventSeq: 32, tick: TICK, type: 'MotivationDecisionResolved', schemaVersion: 1,
    sourceSystem: 'motivation', commandId, causationEventSeqs: [30], entityIds: [ACTOR], payload: outcome };
  const input = { type: 'SocietyAction', payload: { actorId: ACTOR, goalId: 0, action: 'WorkForPay',
    targetActorId: null }, targetTick: TICK };
  const receipt = { inputSeq: 33, input, fingerprint: inputFingerprint(commandInput({ commandId, ...input })),
    status: 'succeeded', result, eventSeqs: [31] };
  const context = { simulationId: SIM, rulesVersion: COGNITION_RULES,
    eventLog: [planned, committed, resolved], commandReceipts: { [commandId]: receipt } };
  return { context, decision, resolvedEventSeq: 32, commandId };
}

test('C4: the cognition adapter projects the frozen nine fields from a legal chain', () => {
  const { context, resolvedEventSeq, commandId } = cognitionWorkChain();
  assert.deepEqual(projectOwnCognitionWorkOutcome(context, ACTOR, resolvedEventSeq), {
    simulationId: SIM, actorId: ACTOR, sourceEventSeq: 32, occurrenceTick: TICK,
    decisionId: commandId, commandId, action: 'WorkForPay', status: 'succeeded', code: null });
  // A complete and legal chain that is not this actor's own Work returns null, not a forged record.
  assert.equal(projectOwnCognitionWorkOutcome(context, PEER, resolvedEventSeq), null);
});

test('C4: the cognition adapter fails closed on a broken chain', () => {
  const { context, resolvedEventSeq, commandId } = cognitionWorkChain();
  assert.throws(() => projectOwnCognitionWorkOutcome({ ...context, rulesVersion: 'm-experience-v1' },
    ACTOR, resolvedEventSeq), { code: 'UNSUPPORTED_VERSION' });
  assert.throws(() => projectOwnCognitionWorkOutcome({ ...context, rulesVersion: 'm-motivation-v1' },
    ACTOR, resolvedEventSeq), { code: 'UNSUPPORTED_VERSION' });
  const noReceipt = structuredClone(context);
  delete noReceipt.commandReceipts[commandId];
  assert.throws(() => projectOwnCognitionWorkOutcome(noReceipt, ACTOR, resolvedEventSeq),
    { code: 'INVALID_INPUT' });
  const wrongCommand = structuredClone(context);
  wrongCommand.eventLog[2].commandId = 'other-command';
  assert.throws(() => projectOwnCognitionWorkOutcome(wrongCommand, ACTOR, resolvedEventSeq),
    { code: 'INVALID_INPUT' });
  const duplicated = structuredClone(context);
  duplicated.eventLog.push(structuredClone(duplicated.eventLog[2]));
  assert.throws(() => projectOwnCognitionWorkOutcome(duplicated, ACTOR, resolvedEventSeq),
    { code: 'INVALID_INPUT' }, 'a repeated resolved sequence must not be silently accepted');
  const missing = structuredClone(context);
  missing.eventLog = missing.eventLog.slice(0, 2);
  assert.throws(() => projectOwnCognitionWorkOutcome(missing, ACTOR, resolvedEventSeq),
    { code: 'INVALID_INPUT' });
  assert.throws(() => projectOwnCognitionWorkOutcome(context, 'actor-9', resolvedEventSeq),
    { code: 'INVALID_INPUT' });
});
