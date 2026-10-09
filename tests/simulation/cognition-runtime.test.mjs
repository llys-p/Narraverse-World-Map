// M3-3A A2 slice: cognition runtime hooks, authority, event ordering, adapter, transactional
// rollback, full replay and integrity. Every scenario builds a real cognition-village profile
// through `createCognitionVillage`; single-tick probes only cover local seams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneData, canonicalJson } from '../../runtime/core/data-contract.mjs';
import { defaultCognitionVillageConfig, createCognitionVillage } from '../../runtime/fixtures/cognition-village.mjs';
import { createSimulationSession, advanceOneTick, lookupCommand } from '../../runtime/core/command-engine.mjs';
import { validateBundle, validateSnapshotStructure, cloneBundle } from '../../runtime/core/world-state.mjs';
import { validateEventLog, validateFact } from '../../runtime/core/event-log.mjs';
import { cognitionRuntimeHooks, validateCognitionWorld, executeCognitionPlayerIntent } from '../../runtime/core/motivation-runtime.mjs';
import { projectOwnCognitionWorkOutcome, projectOwnWorkOutcome } from '../../runtime/core/work-experience-adapter.mjs';
import { deriveActorCognitionSignals } from '../../runtime/core/cognition-signals.mjs';
import { evaluateCognitiveReview, createCognitiveReviewState } from '../../runtime/core/cognitive-review.mjs';
import { continueCognitionPlan } from '../../runtime/core/motivation-planner.mjs';
import { COGNITION_RULES } from '../../runtime/core/cognition-state.mjs';

const OPTIONS = systems => ({ rulesVersion: COGNITION_RULES, systems });

function village(simulationId, mutate, seed = 42) {
  const config = defaultCognitionVillageConfig();
  if (mutate) mutate(config);
  const { bundle, systems } = createCognitionVillage(seed, simulationId, config);
  return { bundle, systems, config };
}

// Returns the real bundle plus the registered systems; the bundle itself stays a pure
// { snapshot, eventLog } record so it can be cloned, canonicalised and validated.
function run(simulationId, ticks, mutate, seed = 42) {
  const { bundle, systems, config } = village(simulationId, mutate, seed);
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(ticks);
  return { bundle: session.getBundle(), systems, config };
}

const eventsOfType = (bundle, type) => bundle.eventLog.filter(e => e.type === type);
const atTick = (bundle, type, tick) => bundle.eventLog.filter(e => e.type === type && e.tick === tick);
const forActor = (list, actorId) => list.filter(e => (e.payload?.actorId ?? e.entityIds?.[0]) === actorId);
const one = (list, what) => {
  assert.equal(list.length, 1, `expected exactly one ${what}, got ${list.length}`);
  return list[0];
};
const cognitionActor = (world, actorId) => world.cognitionModel.actors.find(a => a.actorId === actorId);

// ---------------------------------------------------------------------------------------------
// C2: 降频策略
// ---------------------------------------------------------------------------------------------

// health=1000 / hunger=0 / fatigue=0 keeps both actors uncommitted and unpressured, so the only
// real signal left is the frozen kernel cadence itself. No stimulus or duty is added afterwards.
function c2Config(config) {
  config.motivation.requests = [];
  for (const actor of config.memory.society.actors.initialActors.slice(1, 3)) {
    actor.health = 1000; actor.hunger = 0; actor.fatigue = 0;
  }
  return config;
}

test('C2: 降频 INITIAL144 -> maintain288/432 -> PERIOD_DUE576（真实 fresh cognition-village）', () => {
  const { bundle, systems } = run('cog-c2-cadence', 720, c2Config);
  const evals = eventsOfType(bundle, 'CognitionReviewEvaluated');
  const modeAt = (tick, actorId) => one(forActor(atTick(bundle, 'CognitionReviewEvaluated', tick), actorId),
    `CognitionReviewEvaluated ${tick}/${actorId}`);
  const expected = [
    [144, 'review', ['INITIAL'], 576],
    [288, 'maintain', [], 576],
    [432, 'maintain', [], 576],
    [576, 'review', ['PERIOD_DUE'], 1008],
    [720, 'maintain', [], 1008],
  ];
  for (const [tick, mode, reasonCodes, nextReviewTick] of expected) {
    for (const actorId of ['actor-2', 'actor-3']) {
      const event = modeAt(tick, actorId);
      assert.equal(event.payload.decision.mode, mode, `${actorId}@${tick} mode`);
      assert.deepEqual(event.payload.decision.reasonCodes, reasonCodes, `${actorId}@${tick} reasonCodes`);
      assert.equal(event.payload.decision.nextReviewTick, nextReviewTick, `${actorId}@${tick} nextReviewTick`);
      assert.equal(event.payload.input.tick, tick);
      assert.equal(event.payload.input.alive, true);
    }
  }
  // Both actors are evaluated on every real day boundary; nothing else evaluates them.
  assert.equal(evals.length, 10);
  assert.deepEqual(evals.map(e => e.tick), [144, 144, 288, 288, 432, 432, 576, 576, 720, 720]);
  // The cadence never invents experience or commands: no new plan, work or observation happens.
  assert.equal(eventsOfType(bundle, 'ExperienceWorkObserved').length, 0);
  assert.ok(eventsOfType(bundle, 'MotivationDecisionPlanned').every(e => e.payload.choice === 'NoAction'));
  validateBundle(bundle, OPTIONS(systems));
  cognitionRuntimeHooks.validateHistory(bundle.snapshot, bundle.eventLog);
});

test('C2: 无 stimuli 时首次 daily-public 使 belief 真变为 available/900 并 EVIDENCE_CHANGED 唤醒', () => {
  const { bundle, systems, config } = run('cog-c2-evidence', 864, mutate => {
    c2Config(mutate);
    mutate.mind.stimuli = [];
  });
  assert.deepEqual(config.mind.stimuli, [], 'fixture carries no stimulus at all');
  const expected = [
    [144, 'review', ['INITIAL'], 576, false],
    [288, 'review', ['EVIDENCE_CHANGED'], 720, true],
    [432, 'maintain', [], 720, false],
    [576, 'maintain', [], 720, false],
    [720, 'review', ['PERIOD_DUE'], 1152, false],
    [864, 'maintain', [], 1152, false],
  ];
  for (const [tick, mode, reasonCodes, nextReviewTick, keyEvidenceChanged] of expected) {
    for (const actorId of ['actor-2', 'actor-3']) {
      const event = one(forActor(atTick(bundle, 'CognitionReviewEvaluated', tick), actorId),
        `eval ${tick}/${actorId}`);
      assert.equal(event.payload.decision.mode, mode, `${actorId}@${tick} mode`);
      assert.deepEqual(event.payload.decision.reasonCodes, reasonCodes, `${actorId}@${tick} reasons`);
      assert.equal(event.payload.decision.nextReviewTick, nextReviewTick, `${actorId}@${tick} next`);
      assert.equal(event.payload.input.keyEvidenceChanged, keyEvidenceChanged, `${actorId}@${tick} keyEvidenceChanged`);
    }
  }
  // The wake-up is proved by the real published belief inside the frozen knowledge, not by a flag.
  const beliefAt = (tick, actorId) => {
    const planned = one(forActor(atTick(bundle, 'MotivationDecisionPlanned', tick), actorId), `planned ${tick}/${actorId}`);
    return JSON.parse(planned.payload.knowledgeFingerprint).belief;
  };
  const before = beliefAt(144, 'actor-2');
  assert.equal(before.value, 'unknown');
  assert.equal(before.confidencePermille, 0);
  const after = beliefAt(288, 'actor-2');
  assert.equal(after.value, 'available');
  assert.equal(after.confidencePermille, 900);
  validateBundle(bundle, OPTIONS(systems));
  cognitionRuntimeHooks.validateHistory(bundle.snapshot, bundle.eventLog);
});

// ---------------------------------------------------------------------------------------------
// C3: 真实 continuation
// ---------------------------------------------------------------------------------------------

function c3Config(config) {
  config.cognition.profiles[0].importancePermille = 400;
  config.motivation.requests = [];
  return config;
}

test('C3: actor-2 importance400 真买药后 maintain 真 Use，Goal/Plan/anchor 不漂移', () => {
  const config = defaultCognitionVillageConfig();
  // Preconditions demanded by the contract: both default stimulus slots are market-checks.
  assert.deepEqual(config.mind.stimuli.map(s => `${s.stimulusId}@${s.tick}:${s.kind}:${s.listenerId}`),
    ['mc02@12:market-check:actor-2', 'mc03@24:market-check:actor-3']);
  assert.deepEqual(config.memory.society.actors.initialActors.slice(1, 3).map(a => [a.health, a.hunger, a.fatigue]),
    [[400, 0, 650], [400, 0, 650]]);

  const { bundle: day1 } = run('cog-c3-day1', 144, c3Config);
  const { bundle: day2, systems: c3Systems } = run('cog-c3-day2', 288, c3Config);

  const belief1 = JSON.parse(one(forActor(atTick(day1, 'MotivationDecisionPlanned', 144), 'actor-2'), 'day1 planned').payload.knowledgeFingerprint).belief;
  assert.equal(belief1.value, 'available');
  assert.ok(belief1.confidencePermille >= 600, `belief confidence ${belief1.confidencePermille}`);

  // Day 1: a genuine review that really buys medicine.
  const planned1 = one(forActor(atTick(day1, 'MotivationDecisionPlanned', 144), 'actor-2'), 'day1 planned');
  const resolved1 = one(forActor(atTick(day1, 'MotivationDecisionResolved', 144), 'actor-2'), 'day1 resolved');
  assert.equal(planned1.payload.mode, 'review');
  assert.equal(planned1.payload.choice, 'BuyMedicine');
  assert.equal(planned1.payload.candidates.length, 5);
  assert.equal(resolved1.payload.status, 'succeeded');
  assert.equal(resolved1.payload.delta.herbs, 1);
  const goalId1 = planned1.payload.goalId, planId1 = planned1.payload.planId;
  assert.ok(goalId1 !== null && planId1 !== null, 'day 1 binds a real goal and plan');

  // Day 2: the frozen anchor is continued and the committed step really executes.
  const planned2 = one(forActor(atTick(day2, 'MotivationDecisionPlanned', 288), 'actor-2'), 'day2 planned');
  const resolved2 = one(forActor(atTick(day2, 'MotivationDecisionResolved', 288), 'actor-2'), 'day2 resolved');
  assert.equal(planned2.payload.mode, 'maintain');
  assert.equal(planned2.payload.choice, 'UseMedicine');
  assert.equal(planned2.payload.gateReason, 'CONTINUE_MAINTAIN');
  assert.equal(planned2.payload.candidates.length, 0);
  assert.equal(resolved2.payload.status, 'succeeded');
  assert.equal(resolved2.payload.delta.health, 100);
  assert.equal(resolved2.payload.delta.herbs, -1);

  // Identifiers never move: continuation reuses the day-1 goal and plan.
  assert.equal(planned2.payload.goalId, goalId1);
  assert.equal(planned2.payload.planId, planId1);
  const entry1 = day1.snapshot.world.motivationModel.actors.find(a => a.actorId === 'actor-2');
  const entry2 = day2.snapshot.world.motivationModel.actors.find(a => a.actorId === 'actor-2');
  assert.equal(entry2.nextPlanId, entry1.nextPlanId, 'nextPlanId must not advance');
  const agent1 = day1.snapshot.world.societyModel.agents.find(a => a.state.actorId === 'actor-2').state;
  const agent2 = day2.snapshot.world.societyModel.agents.find(a => a.state.actorId === 'actor-2').state;
  assert.equal(agent2.nextGoalId, agent1.nextGoalId, 'nextGoalId must not advance');
  assert.equal(agent2.currentGoal.goalId, goalId1);

  // The review anchor is still the day-1 Planned, never the plan's creation event, and the
  // sequence is unchanged too.
  const anchor2 = cognitionActor(day2.snapshot.world, 'actor-2');
  assert.equal(anchor2.lastReviewDecisionId, planned1.payload.decisionId);
  assert.equal(anchor2.lastReviewDecisionId, 'cognition-day-1-actor-2');
  assert.equal(anchor2.lastReviewEventSeq, planned1.eventSeq);
  assert.equal(anchor2.reviewState.lastReviewTick, 144);
  assert.equal(planned2.payload.sourceReviewDecisionId, planned1.payload.decisionId);
  assert.equal(planned2.payload.sourceReviewEventSeq, planned1.eventSeq);
  assert.ok(planned2.payload.sourceReviewEventSeq < planned2.eventSeq);

  // Today's command/receipt is newly created, never the review day's command.
  assert.notEqual(resolved2.payload.commandId, resolved1.payload.commandId);
  assert.equal(resolved2.payload.commandId, 'cognition-day-2-actor-2');
  assert.ok(Object.hasOwn(day2.snapshot.commandReceipts, resolved2.payload.commandId));
  const committed2 = one(day2.eventLog.filter(e => e.type === 'SocietyActionCommitted' && e.commandId === resolved2.payload.commandId), 'day2 commit');
  assert.equal(committed2.payload.action, 'UseMedicine');
  assert.ok(committed2.eventSeq > planned2.eventSeq && committed2.eventSeq < resolved2.eventSeq);

  // The day still settles normally and all four cursors reach the last fact.
  assert.ok(atTick(day2, 'SocietyDaySettled', 288).length === 1);
  assert.ok(atTick(day2, 'MotivationPlanSettled', 288).some(e => e.payload.actorId === 'actor-2'));
  const last = day2.snapshot.nextEventSeq - 1;
  for (const key of ['mindModel', 'motivationModel', 'experienceModel', 'cognitionModel'])
    assert.equal(day2.snapshot.world[key].cursor, last, `${key} cursor`);
  validateBundle(day2, OPTIONS(c3Systems));
  cognitionRuntimeHooks.validateHistory(day2.snapshot, day2.eventLog);
});

// ---------------------------------------------------------------------------------------------
// C5: death / 身份 / 时序
// ---------------------------------------------------------------------------------------------

// A legal initial state, not a hand-edited world: actor-2 starts starving with almost no health
// and an empty private larder, so the day-1 settlement takes it to exactly zero health.
function c5Config(config) {
  config.motivation.requests = [];
  Object.assign(config.memory.society.actors.initialActors[1], { health: 50, hunger: 1000, fatigue: 0 });
  Object.assign(config.memory.society.estates[1], { initialFood: 0 });
  return config;
}

test('C5: tick144 当日死亡后 dormant、不发新 Planned/Resolved/Observed', () => {
  const { bundle, systems } = run('cog-c5-death', 576, c5Config);
  const body = id => bundle.snapshot.world.actorModel.actors.find(a => a.actorId === id);
  assert.equal(body('actor-2').alive, false);
  assert.equal(body('actor-2').deathTick, 144);

  // The day-boundary evaluation made while alive may be kept, but only for the death tick.
  const eval144 = one(forActor(atTick(bundle, 'CognitionReviewEvaluated', 144), 'actor-2'), 'eval144');
  assert.equal(eval144.payload.input.alive, true);
  assert.equal(eval144.payload.input.tick, 144);

  for (const tick of [288, 432, 576]) {
    const event = one(forActor(atTick(bundle, 'CognitionReviewEvaluated', tick), 'actor-2'), `eval${tick}`);
    assert.equal(event.payload.decision.mode, 'dormant', `actor-2@${tick} mode`);
    assert.deepEqual(event.payload.decision.reasonCodes, ['DEAD'], `actor-2@${tick} reasonCodes`);
    assert.equal(event.payload.decision.nextReviewTick, null);
    assert.equal(event.payload.decision.tier, 'dormant');
    assert.equal(event.payload.input.alive, false);
  }
  for (const type of ['MotivationDecisionPlanned', 'MotivationDecisionResolved', 'ExperienceWorkObserved'])
    assert.deepEqual(forActor(eventsOfType(bundle, type).filter(e => e.tick > 144), 'actor-2'), [],
      `dead actor must not emit ${type}`);
  // The surviving actor keeps deciding normally, so the dormancy is actor-local.
  assert.ok(forActor(atTick(bundle, 'MotivationDecisionPlanned', 288), 'actor-3').length === 1);
  validateBundle(bundle, OPTIONS(systems));
  cognitionRuntimeHooks.validateHistory(bundle.snapshot, bundle.eventLog);
});

test('C5: 死者历史 experience / anchor / kernel 保留且不复活', () => {
  const { bundle: early } = run('cog-c5-retain', 288, c5Config);
  const { bundle: late, systems } = run('cog-c5-retain', 576, c5Config);
  const keep = world => {
    const a = cognitionActor(world, 'actor-2');
    return { lastReviewDecisionId: a.lastReviewDecisionId, lastReviewEventSeq: a.lastReviewEventSeq,
      lastReviewTick: a.reviewState.lastReviewTick, version: a.reviewState.version,
      simulationId: a.reviewState.simulationId, actorId: a.reviewState.actorId };
  };
  assert.deepEqual(keep(late.snapshot.world), keep(early.snapshot.world));
  assert.equal(keep(late.snapshot.world).lastReviewDecisionId, 'cognition-day-1-actor-2');
  assert.equal(keep(late.snapshot.world).lastReviewTick, 144);
  const exp = world => world.experienceModel.actors.find(a => a.actorId === 'actor-2');
  assert.deepEqual(exp(late.snapshot.world), exp(early.snapshot.world));
  // The kernel identity survives even though the latest evaluation is the dormant one.
  const dead = cognitionActor(late.snapshot.world, 'actor-2').reviewState;
  assert.equal(dead.lastEvaluation.decision.mode, 'dormant');
  assert.equal(dead.lastEvaluation.input.actorId, 'actor-2');
  assert.equal(dead.lastEvaluation.input.simulationId, late.snapshot.simulationId);
  validateBundle(late, OPTIONS(systems));
  validateCognitionWorld(late.snapshot.world, true);
});

test('C5: 跨 actor / 旧 tick / 旧 anchor / 同 tick merge 均被拒绝', () => {
  const { bundle } = run('cog-c5-identity', 432);
  const planned = eventsOfType(bundle, 'MotivationDecisionPlanned');
  const knowledgeOf = (tick, actorId) => JSON.parse(
    one(forActor(atTick(bundle, 'MotivationDecisionPlanned', tick), actorId), `knowledge ${tick}/${actorId}`).payload.knowledgeFingerprint);
  const k2 = knowledgeOf(432, 'actor-2'), k3 = knowledgeOf(432, 'actor-3');
  const sid = bundle.snapshot.simulationId;
  const previous = over => ({ simulationId: sid, actorId: 'actor-2', tick: 288,
    decisionId: 'cognition-day-2-actor-2', choice: 'WorkForPay', status: 'succeeded', code: null, failureOwner: null, ...over });

  assert.ok(deriveActorCognitionSignals(k2, 700, null, previous()).input);
  for (const [name, args, message] of [
    ['cross actor knowledge/previous', [k3, 700, null, previous()], /belongs to another actor/],
    ['previous on a future tick', [k2, 700, null, previous({ tick: 432, decisionId: 'cognition-day-3-actor-2' })], /must precede the evaluated tick/],
    ['previous off a day boundary', [k2, 700, null, previous({ tick: 287 })], /must sit on a day boundary/],
    ['previous decision id mismatch', [k2, 700, null, previous({ decisionId: 'cognition-day-1-actor-2' })], /decision identifier mismatch/],
    ['previous simulation mismatch', [k2, 700, null, previous({ simulationId: 'other-sim' })], /simulation mismatch/],
    ['previous choice/status mismatch', [k2, 700, null, previous({ choice: 'NoAction' })], /choice\/status mismatch/],
    ['previous rejected without code', [k2, 700, null, previous({ status: 'rejected' })], /status\/code mismatch/],
  ]) {
    assert.throws(() => deriveActorCognitionSignals(...args), err => err.code === 'INVALID_INPUT' && message.test(err.message), name);
  }
  assert.throws(() => deriveActorCognitionSignals(k2, 1001, null, previous()), { code: 'LIMIT_EXCEEDED' });

  // Frozen kernel: a same-tick merge with a different input is refused, an identical one is
  // served back unchanged, and a dead actor can never be evaluated alive again.
  const state = createCognitiveReviewState(sid, 'actor-2');
  const input = deriveActorCognitionSignals(k2, 700, null, null).input;
  const first = evaluateCognitiveReview(state, input);
  assert.equal(first.decision.mode, 'review');
  assert.throws(() => evaluateCognitiveReview(first.state, { ...input, relevancePermille: 500 }),
    { code: 'INVALID_INPUT', message: /Conflicting cognitive review input for the same tick/ });
  const cached = evaluateCognitiveReview(first.state, { ...input });
  assert.deepEqual(cached.decision, first.decision);
  const deadInput = { ...input, tick: 576, alive: false, relevancePermille: 0,
    urgentNeed: false, newMajorDuty: false, goalOrPlanInvalidated: false, keyEvidenceChanged: false };
  const dead = evaluateCognitiveReview(first.state, deadInput);
  assert.equal(dead.decision.mode, 'dormant');
  assert.throws(() => evaluateCognitiveReview(dead.state, { ...input, tick: 720 }),
    { code: 'INVALID_INPUT', message: /cannot revive/ });
  assert.equal(evaluateCognitiveReview(dead.state, { ...deadInput, tick: 720 }).decision.mode, 'dormant');

  // Maintain must cite a strictly earlier own review Planned.
  const k3Maintain = knowledgeOf(288, 'actor-3');
  const valid = continueCognitionPlan(k3Maintain, { evaluationEventSeq: 37,
    sourceReviewDecisionId: 'cognition-day-1-actor-3', sourceReviewEventSeq: 8 });
  assert.equal(valid.decision.mode, 'maintain');
  assert.equal(valid.decision.gateReason, 'CONTINUE_MAINTAIN');
  for (const [name, context, message] of [
    ['anchor seq equal to evaluation', { evaluationEventSeq: 37, sourceReviewDecisionId: 'cognition-day-1-actor-3', sourceReviewEventSeq: 37 }, /strictly precede/],
    ['anchor seq later than evaluation', { evaluationEventSeq: 37, sourceReviewDecisionId: 'cognition-day-1-actor-3', sourceReviewEventSeq: 38 }, /strictly precede/],
    ['foreign anchor', { evaluationEventSeq: 37, sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 7 }, /belongs to another actor/],
    ['review-shaped null sources', { evaluationEventSeq: 37, sourceReviewDecisionId: null, sourceReviewEventSeq: null }, /identifier/],
  ]) {
    assert.throws(() => continueCognitionPlan(k3Maintain, context),
      err => err.code === 'INVALID_INPUT' && message.test(err.message), name);
  }
  assert.ok(planned.length > 0);
});

// ---------------------------------------------------------------------------------------------
// hooks 形状与事件时序
// ---------------------------------------------------------------------------------------------

test('hooks: cognitionRuntimeHooks 是六函数对象，CognitionReviewEvaluated 形状精确', () => {
  assert.deepEqual(Object.keys(cognitionRuntimeHooks).sort(),
    ['afterSystems', 'applyAction', 'beforeSystems', 'createWorld', 'settleDay', 'validateHistory']);
  assert.ok(Object.values(cognitionRuntimeHooks).every(v => typeof v === 'function'));
  assert.equal(typeof cognitionRuntimeHooks, 'object');
  assert.notEqual(typeof cognitionRuntimeHooks, 'function');

  const { bundle } = run('cog-hooks-shape', 288);
  const evals = atTick(bundle, 'CognitionReviewEvaluated', 288);
  assert.equal(evals.length, 2);
  assert.deepEqual(evals.map(e => e.entityIds[0]), ['actor-2', 'actor-3'], 'actor-ID order');
  for (const event of evals) {
    assert.equal(event.sourceSystem, 'cognition');
    assert.equal(event.commandId, null);
    assert.deepEqual(event.entityIds, [event.payload.actorId]);
    assert.deepEqual(event.causationEventSeqs, []);
    assert.deepEqual(Object.keys(event.payload).sort(), ['actorId', 'decision', 'input']);
    assert.equal(event.payload.actorId, event.entityIds[0]);
    assert.deepEqual(Object.keys(event.payload.input).sort(),
      ['actorId', 'alive', 'goalOrPlanInvalidated', 'importancePermille', 'keyEvidenceChanged',
        'newMajorDuty', 'relevancePermille', 'simulationId', 'tick', 'urgentNeed']);
    assert.equal(event.payload.decision.actorId, event.payload.actorId);
    assert.equal(event.payload.decision.tick, event.tick);
    assert.equal(event.payload.decision.simulationId, bundle.snapshot.simulationId);
  }
});

test('hooks: 同日两 proposal 先冻结，再 chief commit、authority、Resolved、Observed、日结', () => {
  const { bundle } = run('cog-hooks-order', 288);
  const evals = atTick(bundle, 'CognitionReviewEvaluated', 288);
  const planned = atTick(bundle, 'MotivationDecisionPlanned', 288);
  const resolved = atTick(bundle, 'MotivationDecisionResolved', 288);
  const observed = atTick(bundle, 'ExperienceWorkObserved', 288);
  const settled = atTick(bundle, 'SocietyDaySettled', 288);
  const planSettled = atTick(bundle, 'MotivationPlanSettled', 288);
  const committed = atTick(bundle, 'SocietyActionCommitted', 288);

  assert.equal(evals.length, 2);
  assert.equal(planned.length, 2);
  // Both proposals are frozen before any chief or actor authority runs.
  assert.ok(Math.max(...evals.map(e => e.eventSeq)) < Math.min(...planned.map(e => e.eventSeq)),
    'CognitionReviewEvaluated must precede every MotivationDecisionPlanned');
  assert.ok(Math.max(...planned.map(e => e.eventSeq)) < Math.min(...committed.map(e => e.eventSeq)),
    'authority runs after both proposals are planned');
  const chief = one(committed.filter(e => e.payload.actorId === 'actor-1'), 'chief commit');
  const actorCommits = committed.filter(e => e.payload.actorId !== 'actor-1');
  assert.ok(actorCommits.every(e => e.eventSeq > chief.eventSeq), 'chief commits before actor authority');
  assert.deepEqual(actorCommits.map(e => e.payload.actorId), ['actor-2', 'actor-3']);
  for (const [index, actorId] of ['actor-2', 'actor-3'].entries()) {
    const commit = actorCommits[index];
    const res = one(resolved.filter(e => e.payload.actorId === actorId), `resolved ${actorId}`);
    assert.ok(commit.eventSeq > planned[index].eventSeq);
    assert.ok(res.eventSeq > commit.eventSeq);
  }
  const workResolved = one(resolved.filter(e => e.payload.actorId === 'actor-2'), 'resolved actor-2');
  assert.equal(observed.length, 1);
  assert.equal(observed[0].payload.actorId, 'actor-2');
  assert.ok(observed[0].eventSeq > workResolved.eventSeq, 'observation follows its own resolved');
  assert.equal(observed[0].payload.sourceEventSeq, workResolved.eventSeq);
  assert.deepEqual(observed[0].causationEventSeqs, [workResolved.eventSeq]);
  assert.ok(settled[0].eventSeq > Math.max(...resolved.map(e => e.eventSeq)), 'day settle follows authority');
  assert.equal(planSettled.length, 2);
  assert.ok(planSettled.every(e => e.eventSeq > settled[0].eventSeq), 'MotivationPlanSettled closes the day');
  assert.deepEqual(planSettled.map(e => e.payload.actorId), ['actor-2', 'actor-3']);

  // Every action of the day creates its own command/receipt; the review command is never reused.
  for (const event of resolved) {
    const receipt = bundle.snapshot.commandReceipts[event.payload.commandId];
    assert.ok(receipt, `missing receipt ${event.payload.commandId}`);
    assert.equal(receipt.input.targetTick, 288);
    assert.equal(receipt.input.payload.actorId, event.payload.actorId);
  }
  const last = bundle.snapshot.nextEventSeq - 1;
  for (const key of ['mindModel', 'motivationModel', 'experienceModel', 'cognitionModel'])
    assert.equal(bundle.snapshot.world[key].cursor, last, `${key} cursor`);
  validateCognitionWorld(bundle.snapshot.world, true);
});

test('hooks: cognition-day- / cognition-eval- 命名空间保留给内部命令', () => {
  const { bundle, systems } = village('cog-namespace');
  for (const commandId of ['cognition-day-1-actor-2', 'cognition-eval-1-actor-2'])
    assert.throws(() => executeCognitionPlayerIntent(bundle, { commandId, type: 'PlayerRest', payload: {} }),
      /reserved namespace/, commandId);
  const pending = { commandId: 'cognition-day-9-actor-2', inputSeq: 1, targetTick: 6, type: 'PlayerAction',
    payload: { startTick: 0, intent: { type: 'PlayerRest', payload: {} } } };
  const bad = structuredClone(bundle);
  bad.snapshot.pendingCommands.push(pending);
  bad.snapshot.nextInputSeq = 2;
  assert.throws(() => validateSnapshotStructure(bad.snapshot, OPTIONS(systems), 0), { code: 'INVALID_INPUT' });
});

// ---------------------------------------------------------------------------------------------
// C7: 完整性与原子性
// ---------------------------------------------------------------------------------------------

async function tamperSuite(t, label, source, mutations) {
  for (const [name, mutate] of mutations) await t.test(name, () => {
    const bad = cloneData(source.bundle);
    const before = canonicalJson(bad);
    mutate(bad);
    assert.notEqual(canonicalJson(bad), before, `${label}/${name} did not change any canonical byte`);
    assert.throws(() => validateBundle(bad, OPTIONS(source.systems)),
      e => e.code === 'INVALID_INPUT' || e.code === 'LIMIT_EXCEEDED' || e.code === 'UNSUPPORTED_VERSION',
      `${label}/${name} was accepted`);
  });
}

test('C7: 篡改 input/decision/baseline/anchor/steps/IDs/receipt/work/cursor/RNG 后即使重算 hash 也拒绝', async (t) => {
  const late = run('cog-c7-late', 288);
  const early = run('cog-c7-early', 144);
  const ev = b => eventsOfType(b, 'CognitionReviewEvaluated');
  const pl = b => eventsOfType(b, 'MotivationDecisionPlanned');
  const obs = b => one(eventsOfType(b, 'ExperienceWorkObserved'), 'observation');

  await tamperSuite(t, 'late', late, [
    ['eval input importance', b => { ev(b)[2].payload.input.importancePermille = 699; }],
    ['eval input relevance', b => { ev(b)[2].payload.input.relevancePermille = 500; }],
    ['eval input alive', b => { ev(b)[2].payload.input.alive = false; }],
    ['eval decision mode', b => { const d = ev(b)[2].payload.decision; d.mode = 'maintain'; d.shouldReview = false; d.reasonCodes = []; }],
    ['eval decision score', b => { ev(b)[2].payload.decision.score = 1; }],
    ['eval decision tier', b => { const d = ev(b)[3].payload.decision; d.tier = 'full'; d.intervalTicks = 144; d.nextReviewTick = 432; }],
    ['eval decision nextReviewTick', b => { ev(b)[2].payload.decision.nextReviewTick = 999; }],
    ['eval reasonCodes order', b => { ev(b)[2].payload.decision.reasonCodes = ['INITIAL', 'PERIOD_DUE']; }],
    ['eval entityIds', b => { ev(b)[2].entityIds = ['actor-3']; }],
    ['eval commandId', b => { ev(b)[2].commandId = 'forged'; }],
    ['eval sourceSystem', b => { ev(b)[2].sourceSystem = 'motivation'; }],
    ['eval causation', b => { ev(b)[2].causationEventSeqs = [1]; }],
    ['baseline fingerprint', b => { b.snapshot.world.cognitionModel.actors[0].signalBaseline.keyEvidenceFingerprint = '{"confidenceEnough":false,"penaltyPermille":0,"value":"available"}'; }],
    ['baseline dropped', b => { b.snapshot.world.cognitionModel.actors[0].signalBaseline = null; }],
    ['anchor decision id', b => { b.snapshot.world.cognitionModel.actors[1].lastReviewDecisionId = 'cognition-day-2-actor-3'; }],
    ['anchor event seq', b => { b.snapshot.world.cognitionModel.actors[1].lastReviewEventSeq = 24; }],
    ['anchor unpaired', b => { b.snapshot.world.cognitionModel.actors[1].lastReviewEventSeq = null; }],
    ['kernel review tick', b => { b.snapshot.world.cognitionModel.actors[1].reviewState.lastReviewTick = 288; }],
    ['kernel input relevance', b => { b.snapshot.world.cognitionModel.actors[0].reviewState.lastEvaluation.input.relevancePermille = 500; }],
    ['kernel decision reasons', b => { b.snapshot.world.cognitionModel.actors[0].reviewState.lastEvaluation.decision.reasonCodes = ['INITIAL']; }],
    ['review candidates emptied', b => { pl(b).find(p => p.payload.mode === 'review').payload.candidates = []; }],
    ['maintain candidates injected', b => {
      const maintain = pl(b).find(p => p.payload.mode === 'maintain').payload;
      maintain.candidates = cloneData(pl(b).find(p => p.payload.mode === 'review').payload.candidates);
    }],
    ['planned review mode flipped to maintain', b => { const p = pl(b).find(x => x.payload.mode === 'review').payload;
      p.mode = 'maintain'; p.candidates = []; p.gateReason = 'CONTINUE_MAINTAIN';
      p.sourceReviewDecisionId = 'cognition-day-1-actor-2'; p.sourceReviewEventSeq = 7; }],
    ['planned maintain mode flipped to review', b => { const p = pl(b).find(x => x.payload.mode === 'maintain').payload;
      p.mode = 'review'; p.gateReason = 'SELECT_NEW_PLAN'; p.sourceReviewDecisionId = null; p.sourceReviewEventSeq = null;
      p.candidates = cloneData(pl(b).find(x => x.payload.mode === 'review').payload.candidates); }],
    ['receipt input target tick', b => { b.snapshot.commandReceipts['cognition-day-2-actor-2'].input.targetTick = 289; }],
    ['receipt result', b => { b.snapshot.commandReceipts['cognition-day-2-actor-2'].result.publicFoodProduced = 9; }],
    ['receipt removed', b => { delete b.snapshot.commandReceipts['cognition-day-2-actor-2']; }],
    ['work causation', b => { obs(b).causationEventSeqs = [1]; }],
    ['work payload actor', b => { const o = obs(b); o.payload.actorId = 'actor-3'; o.entityIds = ['actor-3']; }],
    ['observation penalty', b => { obs(b).payload.experienceView.penaltyPermille = 300; }],
    ['experience sample status', b => { b.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].status = 'rejected'; }],
    ['cognition cursor', b => { b.snapshot.world.cognitionModel.cursor = 1; }],
    ['mind cursor', b => { b.snapshot.world.mindModel.cursor = 1; }],
    ['motivation cursor', b => { b.snapshot.world.motivationModel.cursor = 1; }],
    ['experience cursor', b => { b.snapshot.world.experienceModel.cursor = 1; }],
    ['rng state', b => { b.snapshot.rng.calls = 999; }],
    ['cognition importance with recomputed fingerprint', b => { const m = b.snapshot.world.cognitionModel;
      m.config.profiles[0].importancePermille = 699; m.configFingerprint = canonicalJson(m.config); }],
    ['request urgency with recomputed fingerprint', b => { const m = b.snapshot.world.motivationModel;
      m.config.requests[0].urgencyPermille = 999; m.configFingerprint = canonicalJson(m.config); }],
    ['experience flag with recomputed fingerprint', b => { const m = b.snapshot.world.experienceModel;
      m.config.useWorkExperience = false; m.configFingerprint = canonicalJson(m.config); }],
    ['stored decision mode', b => { b.snapshot.world.motivationModel.actors[0].lastDecision.mode = 'maintain'; }],
    ['stored decision goalId', b => { b.snapshot.world.motivationModel.actors[0].lastDecision.goalId = 1; }],
    ['stored decision choice', b => { b.snapshot.world.motivationModel.actors[0].lastDecision.choice = 'Rest'; }],
    ['stored outcome status', b => { b.snapshot.world.motivationModel.actors[0].lastOutcome.status = 'rejected'; }],
  ]);

  await tamperSuite(t, 'early', early, [
    ['plan steps', b => { b.snapshot.world.motivationModel.actors[0].activePlan.steps = ['UseMedicine']; }],
    ['plan stepIndex', b => { b.snapshot.world.motivationModel.actors[0].activePlan.stepIndex = 0; }],
    ['plan id', b => { b.snapshot.world.motivationModel.actors[0].activePlan.planId = 9; }],
    ['nextPlanId', b => { b.snapshot.world.motivationModel.actors[0].nextPlanId = 5; }],
    ['goal id', b => { b.snapshot.world.societyModel.agents[1].state.currentGoal.goalId = 7; }],
  ]);
});

test('C7: sealed world 通过 validateCognitionWorld，篡改后拒绝', () => {
  const { bundle } = run('cog-c7-sealed', 288);
  assert.equal(validateCognitionWorld(bundle.snapshot.world, true), bundle.snapshot.world);
  for (const [name, mutate] of [
    ['cursor', w => { w.cognitionModel.cursor = 0; }],
    ['roster order', w => { w.cognitionModel.actors.reverse(); }],
    ['anchor id', w => { w.cognitionModel.actors[0].lastReviewDecisionId = 'cognition-day-9-actor-2'; }],
    ['paired anchors broken', w => { w.cognitionModel.actors[0].lastReviewDecisionId = null; }],
    ['baseline shape', w => { w.cognitionModel.actors[0].signalBaseline = { keyEvidenceFingerprint: '' }; }],
    ['kernel identity', w => { w.cognitionModel.actors[0].reviewState.actorId = 'actor-3'; }],
    ['kernel evaluation off a day boundary', w => { w.cognitionModel.actors[0].reviewState.lastEvaluation.input.tick = 145; }],
    ['kernel version', w => { w.cognitionModel.actors[0].reviewState.version = 'cognitive-review-state-v0'; }],
  ]) {
    const bad = cloneData(bundle.snapshot.world);
    const before = canonicalJson(bad);
    mutate(bad);
    assert.notEqual(canonicalJson(bad), before, `${name} did not change any canonical byte`);
    assert.throws(() => validateCognitionWorld(bad, true),
      e => e.code === 'INVALID_INPUT' || e.code === 'UNSUPPORTED_VERSION', name);
  }
});

test('C7: 带 getter 的不安全树被拒绝且 getter 调用数为 0', async (t) => {
  const { bundle, systems } = village('cog-c7-getters');
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(288);
  const historical = session.getBundle();
  let calls = 0;
  const inheritedMap = array => {
    const prototype = Object.create(Array.prototype);
    Object.defineProperty(prototype, 'map', { get() { calls++; return Array.prototype.map; } });
    Object.setPrototypeOf(array, prototype);
    return array;
  };
  const raw = { commandId: 'cognition-probe', targetTick: 1, type: 'PlayerAction',
    payload: { startTick: 0, intent: { type: 'PlayerRest', payload: {} } } };
  const entryPoints = [
    ['cloneBundle eventLog', b => inheritedMap(b.eventLog), b => cloneBundle(b)],
    ['lookupCommand eventLog', b => inheritedMap(b.eventLog), b => lookupCommand(b, raw)],
    ['validateEventLog eventLog', b => inheritedMap(b.eventLog), b => validateEventLog(b.eventLog, b.snapshot, systems)],
    ['validateEventLog pending', b => inheritedMap(b.snapshot.pendingCommands), b => validateEventLog(b.eventLog, b.snapshot, systems)],
    ['validateEventLog receipts', b => b.snapshot.commandReceipts.extra = { data: inheritedMap([]) }, b => validateEventLog(b.eventLog, b.snapshot, systems)],
    ['validateSnapshotStructure pending', b => inheritedMap(b.snapshot.pendingCommands), b => validateSnapshotStructure(b.snapshot, OPTIONS(systems), 0)],
    ['advanceOneTick eventLog', b => inheritedMap(b.eventLog), b => advanceOneTick(b, systems)],
    ['advanceOneTick cognition actors', b => inheritedMap(b.snapshot.world.cognitionModel.actors), b => advanceOneTick(b, systems)],
    ['validateBundle eventLog', b => inheritedMap(b.eventLog), b => validateBundle(b, OPTIONS(systems))],
    ['validateCognitionWorld actors', b => inheritedMap(b.snapshot.world.cognitionModel.actors), b => validateCognitionWorld(b.snapshot.world, true)],
    ['validateCognitionWorld kernel', b => { const a = b.snapshot.world.cognitionModel.actors[0];
      Object.defineProperty(a.reviewState, 'actorId', { enumerable: true, get() { calls++; return 'actor-2'; } }); },
      b => validateCognitionWorld(b.snapshot.world, true)],
    ['validateHistory eventLog', b => inheritedMap(b.eventLog), b => cognitionRuntimeHooks.validateHistory(b.snapshot, b.eventLog)],
    ['validateHistory receipts', b => b.snapshot.commandReceipts.extra = { data: inheritedMap([]) }, b => cognitionRuntimeHooks.validateHistory(b.snapshot, b.eventLog)],
  ];
  for (const [name, mutate, runEntry] of entryPoints) await t.test(name, () => {
    const bad = structuredClone(historical);
    calls = 0;
    mutate(bad);
    assert.throws(() => runEntry(bad), e => e.code === 'INVALID_INPUT' ||
      (e.code === 'TICK_FAILED' && e.cause?.code === 'INVALID_INPUT'), name);
    assert.equal(calls, 0, `${name} executed an accessor`);
  });
  await t.test('validateFact', () => {
    const fact = structuredClone(historical.eventLog.find(e => e.type === 'SocietyDaySettled'));
    delete fact.eventSeq; delete fact.tick; delete fact.schemaVersion;
    calls = 0;
    inheritedMap(fact.causationEventSeqs);
    assert.throws(() => validateFact(fact, 'society', COGNITION_RULES), { code: 'INVALID_INPUT' });
    assert.equal(calls, 0);
  });
  await t.test('createCognitionVillage config', () => {
    const config = defaultCognitionVillageConfig();
    calls = 0;
    inheritedMap(config.mind.stimuli);
    assert.throws(() => createCognitionVillage(42, 'cog-c7-config', config), { code: 'INVALID_INPUT' });
    assert.equal(calls, 0);
  });
  await t.test('snapshot rulesVersion getter', () => {
    const bad = structuredClone(historical);
    calls = 0;
    Object.defineProperty(bad.snapshot, 'rulesVersion', { enumerable: true, get() { calls++; return COGNITION_RULES; } });
    assert.throws(() => validateBundle(bad, OPTIONS(systems)), { code: 'INVALID_INPUT' });
    assert.equal(calls, 0);
  });
});

test('C7: post-learning 故障整 tick 回滚，bundle 字节不变', () => {
  const { bundle, systems } = village('cog-c7-rollback');
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(143);
  const before = session.getBundle();
  const frozen = cloneData(before);
  const corruptions = [
    ['baseline', w => { w.cognitionModel.actors[0].signalBaseline = { keyEvidenceFingerprint: '{"confidenceEnough":false,"penaltyPermille":0,"value":"unknown"}' }; }],
    ['anchor event seq', w => { w.cognitionModel.actors[0].lastReviewEventSeq = 999; }],
    ['kernel review tick', w => { w.cognitionModel.actors[0].reviewState.lastReviewTick = 0; }],
  ];
  for (const [name, corrupt] of corruptions) {
    const injected = { society(ctx) {
      const result = cognitionRuntimeHooks.settleDay(ctx.snapshot.world, ctx.rng.next());
      corrupt(result.world);
      ctx.snapshot.world = result.world;
      ctx.emitFact({ type: 'SocietyDaySettled', sourceSystem: 'society', commandId: null, entityIds: [],
        causationEventSeqs: ctx.populationCauses, payload: result.payload });
    } };
    assert.throws(() => advanceOneTick(before, injected),
      e => e.message.startsWith('Tick 144 was not committed') && e.cause?.code === 'INVALID_INPUT', name);
    assert.equal(canonicalJson(before), canonicalJson(frozen), `${name} partially wrote the bundle`);
    assert.equal(before.snapshot.tick, 143, `${name} advanced the committed tick`);
    assert.equal(before.eventLog.length, frozen.eventLog.length, `${name} appended facts`);
  }
  // The healthy path still commits the same tick, proving the rollback is caused by the fault.
  const advanced = advanceOneTick(before, systems);
  assert.equal(advanced.snapshot.tick, 144);
  validateBundle(advanced, OPTIONS(systems));
});

// ---------------------------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------------------------

function adapterContext(bundle) {
  return { simulationId: bundle.snapshot.simulationId, rulesVersion: COGNITION_RULES,
    eventLog: bundle.eventLog, commandReceipts: bundle.snapshot.commandReceipts };
}

test('adapter: 真实 review Work 投影九字段，并与事件/经验链一致', () => {
  // The default fixture carries d01 (tick 200, actor-2, urgency 1000); the tick-288 review is a
  // genuine review-mode WorkForPay with its own command, committed fact and experience sample.
  const { bundle } = run('cog-adapter-work', 288);
  const planned = one(forActor(atTick(bundle, 'MotivationDecisionPlanned', 288), 'actor-2'), 'planned 288');
  const resolved = one(forActor(atTick(bundle, 'MotivationDecisionResolved', 288), 'actor-2'), 'resolved 288');
  const observed = one(eventsOfType(bundle, 'ExperienceWorkObserved'), 'observation');
  assert.equal(planned.payload.mode, 'review');
  assert.equal(planned.payload.choice, 'WorkForPay');
  assert.equal(planned.payload.candidates.length, 5);
  assert.equal(resolved.payload.status, 'succeeded');
  assert.equal(observed.payload.actorId, 'actor-2');
  assert.equal(observed.payload.sourceEventSeq, resolved.eventSeq);

  const context = adapterContext(bundle);
  const projected = projectOwnCognitionWorkOutcome(context, 'actor-2', resolved.eventSeq);
  assert.deepEqual(Object.keys(projected).sort(),
    ['action', 'actorId', 'code', 'commandId', 'decisionId', 'occurrenceTick', 'simulationId', 'sourceEventSeq', 'status']);
  assert.equal(projected.simulationId, bundle.snapshot.simulationId);
  assert.equal(projected.actorId, 'actor-2');
  assert.equal(projected.decisionId, planned.payload.decisionId);
  assert.equal(projected.commandId, resolved.payload.commandId);
  assert.equal(projected.action, 'WorkForPay');
  assert.equal(projected.status, resolved.payload.status);
  assert.equal(projected.code, resolved.payload.code);
  assert.equal(projected.sourceEventSeq, resolved.eventSeq);
  assert.equal(projected.occurrenceTick, resolved.tick);
  const sample = one(bundle.snapshot.world.experienceModel.actors.find(a => a.actorId === 'actor-2')
    .workExperienceState.samples, 'experience sample');
  assert.equal(sample.decisionId, projected.decisionId);
  assert.equal(sample.commandId, projected.commandId);
  assert.equal(sample.action, projected.action);
  assert.equal(sample.status, projected.status);

  // A complete but foreign chain returns null instead of projecting someone else's work.
  assert.equal(projectOwnCognitionWorkOutcome(context, 'actor-3', resolved.eventSeq), null);
  assert.equal(projectOwnCognitionWorkOutcome(context, 'actor-1', resolved.eventSeq), null);
  assert.equal(projectOwnCognitionWorkOutcome(context, 'actor-4', resolved.eventSeq), null);
  const buy = one(forActor(atTick(bundle, 'MotivationDecisionResolved', 144), 'actor-2'), 'buy resolved');
  assert.equal(projectOwnCognitionWorkOutcome(context, 'actor-2', buy.eventSeq), null);
  // The frozen legacy adapter must not accept cognition rules.
  assert.throws(() => projectOwnWorkOutcome({ ...context, rulesVersion: COGNITION_RULES }, 'actor-2', resolved.eventSeq),
    { code: 'UNSUPPORTED_VERSION' });
});

test('adapter: context 形状与 rulesVersion 隔离', async (t) => {
  const { bundle } = run('cog-adapter-context', 288);
  const context = adapterContext(bundle);
  const resolved = one(forActor(atTick(bundle, 'MotivationDecisionResolved', 288), 'actor-2'), 'resolved');
  assert.deepEqual(Object.keys(context).sort(), ['commandReceipts', 'eventLog', 'rulesVersion', 'simulationId']);
  await t.test('missing or extra context field', () => {
    for (const mutate of [c => delete c.commandReceipts, c => delete c.eventLog,
      c => delete c.simulationId, c => delete c.rulesVersion, c => c.extra = true]) {
      const bad = structuredClone(context);
      mutate(bad);
      assert.throws(() => projectOwnCognitionWorkOutcome(bad, 'actor-2', resolved.eventSeq), { code: 'INVALID_INPUT' });
    }
  });
  await t.test('foreign rules versions', () => {
    for (const rulesVersion of ['m-experience-v1', 'm-motivation-v1', 'unknown-rules']) {
      const bad = { ...context, rulesVersion };
      assert.throws(() => projectOwnCognitionWorkOutcome(bad, 'actor-2', resolved.eventSeq), { code: 'UNSUPPORTED_VERSION' }, rulesVersion);
    }
  });
});

test('adapter: 坏链 fail closed，合法 NoAction/非 Work 才返回 null', async (t) => {
  const { bundle } = run('cog-adapter-failclosed', 432);
  const context = adapterContext(bundle);
  const work = one(forActor(atTick(bundle, 'MotivationDecisionResolved', 288), 'actor-2'), 'work resolved');
  const nonWork = one(forActor(atTick(bundle, 'MotivationDecisionResolved', 144), 'actor-2'), 'buy resolved');
  const noAction = one(eventsOfType(bundle, 'MotivationDecisionResolved').filter(e => e.payload.status === 'no-action'), 'no-action resolved');
  const eventAt = (c, seq) => c.eventLog.find(e => e.eventSeq === seq);
  assert.equal(projectOwnCognitionWorkOutcome(context, 'actor-2', work.eventSeq).status, 'succeeded');
  assert.equal(projectOwnCognitionWorkOutcome(context, 'actor-2', nonWork.eventSeq), null);
  assert.equal(projectOwnCognitionWorkOutcome(context, noAction.payload.actorId, noAction.eventSeq), null);

  const resolved = c => c.eventLog.find(e => e.eventSeq === work.eventSeq);
  const planned = c => c.eventLog.find(e => e.eventSeq === work.causationEventSeqs[0]);
  const receipt = c => c.commandReceipts[work.commandId];
  const committed = c => c.eventLog.find(e => e.eventSeq === receipt(c).eventSeqs[0]);
  const mutations = [
    ['target tick', c => receipt(c).input.targetTick++],
    ['resolved payload command', c => resolved(c).payload.commandId = 'forged-command'],
    ...['wallet', 'herbs', 'health', 'fatigue'].map(key => [`delta ${key}`, c => resolved(c).payload.delta[key]++]),
    ['public food', c => resolved(c).payload.publicFoodProduced++],
    ['price', c => resolved(c).payload.price = 1],
    ['planned event tick', c => planned(c).tick++],
    ['planned command', c => planned(c).commandId = work.commandId],
    ['other actor bad cause', c => resolved(c).causationEventSeqs = [999999], work.eventSeq, 'actor-3'],
    ['foreign actor bad cause', c => resolved(c).causationEventSeqs = [999999], work.eventSeq, 'actor-1'],
    ['forged null work', c => { resolved(c).payload.commandId = null; resolved(c).commandId = null; }],
    ['non-work missing receipt', c => { delete c.commandReceipts[nonWork.commandId]; }, nonWork.eventSeq],
    ['non-work wrong delta', c => eventAt(c, nonWork.eventSeq).payload.delta.herbs++, nonWork.eventSeq],
    ['no-action forged receipt', c => { c.commandReceipts[noAction.payload.decisionId] = { forged: true }; }, noAction.eventSeq, noAction.payload.actorId],
    ['complete receipt result', c => receipt(c).result.extra = true],
    ['committed source', c => committed(c).sourceSystem = 'forged'],
    ['committed schema', c => committed(c).schemaVersion = 999],
    ['committed entities', c => committed(c).entityIds.push('actor-3')],
    ['duplicate committed', c => { const e = structuredClone(committed(c)); e.eventSeq = c.eventLog.at(-1).eventSeq + 1; c.eventLog.push(e); }],
    ['duplicate resolved', c => { const e = structuredClone(resolved(c)); e.eventSeq = c.eventLog.at(-1).eventSeq + 1; c.eventLog.push(e); }],
    ['duplicate planned decision', c => { const e = structuredClone(planned(c)); e.eventSeq = c.eventLog.at(-1).eventSeq + 1; c.eventLog.push(e); }],
    // These two break the query argument instead of the context, so no canonical byte moves.
    ['resolved sequence absent', () => {}, 999999, 'actor-2', false],
    ['resolved wrong type', c => resolved(c).type = 'SocietyDaySettled'],
    ['unknown query actor', () => {}, work.eventSeq, 'actor-9', false],
  ];
  for (const [name, mutate, seq = work.eventSeq, actor = 'actor-2', changesBytes = true] of mutations) await t.test(name, () => {
    const bad = structuredClone(context);
    const before = canonicalJson(bad);
    mutate(bad);
    if (changesBytes) assert.notEqual(canonicalJson(bad), before, `${name} did not change any canonical byte`);
    assert.throws(() => projectOwnCognitionWorkOutcome(bad, actor, seq), { code: 'INVALID_INPUT' }, name);
  });
});

// ---------------------------------------------------------------------------------------------
// 完整重演
// ---------------------------------------------------------------------------------------------

test('重演: 连续 864 ticks 通过 validateBundle/validateHistory，四 cursor 到最终事实', () => {
  const { bundle, systems } = run('cog-replay-864', 864);
  assert.equal(bundle.snapshot.tick, 864);
  validateBundle(bundle, OPTIONS(systems));
  assert.doesNotThrow(() => cognitionRuntimeHooks.validateHistory(bundle.snapshot, bundle.eventLog));
  const last = bundle.snapshot.nextEventSeq - 1;
  assert.equal(bundle.eventLog.length, last);
  for (const key of ['mindModel', 'motivationModel', 'experienceModel', 'cognitionModel'])
    assert.equal(bundle.snapshot.world[key].cursor, last, `${key} cursor`);
  // Every real day boundary evaluated both configured actors, and nothing was evaluated early.
  const evals = eventsOfType(bundle, 'CognitionReviewEvaluated');
  assert.equal(evals.length, 12);
  assert.deepEqual([...new Set(evals.map(e => e.tick))], [144, 288, 432, 576, 720, 864]);
  assert.ok(evals.every(e => e.tick % 144 === 0));
  // Anchors still resolve to a unique own review Planned fact at the end of the run.
  for (const actor of bundle.snapshot.world.cognitionModel.actors) {
    if (actor.lastReviewDecisionId === null) continue;
    const planned = eventsOfType(bundle, 'MotivationDecisionPlanned')
      .filter(e => e.payload.decisionId === actor.lastReviewDecisionId);
    assert.equal(planned.length, 1);
    assert.equal(planned[0].eventSeq, actor.lastReviewEventSeq);
    assert.equal(planned[0].payload.mode, 'review');
  }
});

test('重演: 从 genesis 重建的独立会话与连续运行逐字节一致', () => {
  const { bundle: continuous, systems } = run('cog-replay-equal', 864);
  const split = (() => {
    const { bundle, systems } = createCognitionVillage(42, 'cog-replay-equal', defaultCognitionVillageConfig());
    const first = createSimulationSession(bundle, systems);
    first.advanceTicks(288);
    const middle = first.getBundle();
    const second = createSimulationSession(middle, systems);
    second.advanceTicks(576);
    return second.getBundle();
  })();
  assert.equal(canonicalJson(split.eventLog), canonicalJson(continuous.eventLog), 'replayed event log differs');
  assert.equal(canonicalJson(split.snapshot), canonicalJson(continuous.snapshot), 'replayed snapshot differs');
  validateBundle(split, OPTIONS(systems));
  assert.doesNotThrow(() => cognitionRuntimeHooks.validateHistory(split.snapshot, split.eventLog));
});
