// M3-4A contract §1: the cognition knowledge/inspector projection, driven only by real
// cognition-village bundles (no mocks). Expected values come from the contract text, the
// pinned-baseline probes recorded in the delivery report, and the frozen kernel formulas —
// never re-derived from the projection under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createCognitionVillage, defaultCognitionVillageConfig } from '../../runtime/fixtures/cognition-village.mjs';
import { createMotivationVillage, defaultMotivationVillageConfig } from '../../runtime/fixtures/motivation-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { buildCognitionKnowledge, projectCognitionInspector, COGNITION_INSPECTOR_VERSION, MAX_COGNITION_INSPECTOR_BYTES } from '../../runtime/knowledge/cognition-knowledge.mjs';
import { buildMotivationKnowledge } from '../../runtime/knowledge/motivation-knowledge.mjs';
import { deriveWorkExperience } from '../../runtime/core/work-experience.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createM3CloseoutConfig } from '../../runtime/experiments/m3-closeout-scenario.mjs';

const KNOWLEDGE_KEYS = ['knowledgeVersion','phase','simulationId','actorId','tick','revision','self','quote',
  'observations','belief','profile','duty','planState','experience','useWorkExperience'];
// Contract §1 frozen budgets.
const MAX_KNOWLEDGE_BYTES = 16384, MAX_INSPECTOR_BYTES = 131072;
const bytes = value => new TextEncoder().encode(canonicalJson(value)).length;
const run = (config, ticks = 0) => {
  const fixture = createCognitionVillage(42, 'cog-knowledge-test', config ?? defaultCognitionVillageConfig());
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  if (ticks > 0) session.advanceTicks(ticks);
  return session.getBundle();
};

test('contract §1: knowledge is the exact 15-key committed projection within the frozen budget, and the inspector is the exact developer DTO', () => {
  for (const ticks of [0, 144, 432, 2016]) {
    const bundle = run(null, ticks), snapshot = bundle.snapshot;
    const knowledge = buildCognitionKnowledge(bundle, 'actor-2');
    assert.deepEqual(Object.keys(knowledge).sort(), [...KNOWLEDGE_KEYS].sort(), `keys at tick ${ticks}`);
    assert.equal(knowledge.knowledgeVersion, 'cognition-knowledge-v1');
    assert.equal(knowledge.phase, 'committed');
    assert.equal(knowledge.simulationId, 'cog-knowledge-test');
    assert.equal(knowledge.actorId, 'actor-2');
    assert.equal(knowledge.tick, snapshot.tick);
    assert.equal(knowledge.revision, snapshot.revision);
    assert.ok(bytes(knowledge) <= MAX_KNOWLEDGE_BYTES, `knowledge budget at tick ${ticks}`);
    assert.equal(MAX_COGNITION_INSPECTOR_BYTES, 131072);
    assert.equal(COGNITION_INSPECTOR_VERSION, 'cognition-inspector-v1');
    const view = projectCognitionInspector(bundle);
    assert.deepEqual(Object.keys(view).sort(), ['apiVersion','mindVersion','view','simulationId','revision','tick','worldFacts','actors'].sort());
    assert.deepEqual(Object.keys(view.worldFacts).sort(), ['publicFood','publicHerbs','postedHerbPrice'].sort());
    assert.equal(view.apiVersion, 1);
    assert.equal(view.mindVersion, 'cognition-inspector-v1');
    assert.equal(view.view, 'developer');
    assert.equal(view.revision, snapshot.revision);
    assert.equal(view.tick, snapshot.tick);
    assert.deepEqual(view.actors.map(a => a.knowledge.actorId), ['actor-2', 'actor-3'], 'fixed roster and order');
    for (const actor of view.actors) {
      assert.deepEqual(Object.keys(actor).sort(), ['cognition','counterfactual','knowledge','lastDecision','lastOutcome','workExperience'].sort());
      assert.ok(!('actorId' in actor), 'actors are identified only through knowledge.actorId');
      assert.deepEqual(Object.keys(actor.cognition).sort(), ['importancePermille','lastReviewDecisionId','lastReviewEventSeq','reviewState','signalBaseline'].sort());
      assert.deepEqual(Object.keys(actor.workExperience).sort(), ['state', 'view']);
      // Contract §3: the cognition inspector never calls the counterfactual planner; it stays null.
      assert.equal(actor.counterfactual, null, `counterfactual null at tick ${ticks}`);
    }
    assert.ok(bytes(view) <= MAX_INSPECTOR_BYTES, `inspector budget at tick ${ticks}`);
  }
});

test('contract §1: shared committed keys equal the motivation projection for the same seed and day (expected diff, not self-derived)', () => {
  const cognitionConfig = defaultCognitionVillageConfig(), motivationConfig = defaultMotivationVillageConfig();
  assert.deepEqual([cognitionConfig.memory, cognitionConfig.mind, cognitionConfig.motivation],
    [motivationConfig.memory, motivationConfig.mind, motivationConfig.motivation], 'cognition reuses the motivation blocks');
  // Same seed, same simulationId, same shared config blocks; the only world differences are the
  // cognition models plus the two extra CognitionReviewEvaluated facts each day (event-seq shift).
  const cog = ticks => {
    const f = createCognitionVillage(42, 'cmp-same-day', defaultCognitionVillageConfig());
    const s = createSimulationSession(f.bundle, f.systems);
    if (ticks) s.advanceTicks(ticks);
    return s.getBundle();
  };
  const mot = ticks => {
    const f = createMotivationVillage(42, 'cmp-same-day', defaultMotivationVillageConfig());
    const s = createSimulationSession(f.bundle, f.systems);
    if (ticks) s.advanceTicks(ticks);
    return s.getBundle();
  };
  const ck0 = buildCognitionKnowledge(cog(0), 'actor-2'), mk0 = buildMotivationKnowledge(mot(0), 'actor-2');
  for (const key of Object.keys(mk0)) if (key !== 'knowledgeVersion') assert.deepEqual(ck0[key], mk0[key], `tick 0 shared key ${key}`);
  assert.equal(ck0.knowledgeVersion, 'cognition-knowledge-v1');
  assert.notEqual(ck0.knowledgeVersion, mk0.knowledgeVersion);
  // The only knowledge delta is the two new keys (contract §1: motivation keys verbatim plus two).
  assert.deepEqual(Object.keys(ck0).filter(k => !Object.keys(mk0).includes(k)).sort(), ['experience', 'useWorkExperience']);
  // Contract §1: actor-2 carries the real 900/200 profile in Knowledge.
  assert.deepEqual(ck0.profile, { dutyWeightPermille: 900, riskAversionPermille: 200 });
  const ck1 = buildCognitionKnowledge(cog(144), 'actor-2'), mk1 = buildMotivationKnowledge(mot(144), 'actor-2');
  // At the first full day both rules make the same committed state; duty/plan/self must agree.
  for (const key of ['self', 'planState', 'profile', 'duty']) assert.deepEqual(ck1[key], mk1[key], `tick 144 shared key ${key}`);
  assert.deepEqual({ product: ck1.quote.product, price: ck1.quote.price, observedTick: ck1.quote.observedTick },
    { product: mk1.quote.product, price: mk1.quote.price, observedTick: mk1.quote.observedTick }, 'quote content agrees');
  // Expected diff: the two extra cognition facts per day shift public event sequences; the
  // knowledge itself only carries the actor-visible number, which the projections report verbatim.
  assert.notEqual(ck1.quote.sourceEventSeq, mk1.quote.sourceEventSeq);
  assert.ok(Number.isSafeInteger(ck1.quote.sourceEventSeq));
  const stripSeq = items => items.map(item => ({ ...item, sourceEventSeq: 0 }));
  assert.deepEqual(stripSeq(ck1.observations), stripSeq(mk1.observations), 'observation content agrees');
  assert.equal(ck1.belief.value, mk1.belief.value);
  assert.equal(ck1.belief.confidencePermille, mk1.belief.confidencePermille);
});

test('contract §1: dead actors keep currentGoal null and their quote never cites post-death events', () => {
  const config = defaultCognitionVillageConfig();
  // The pinned-baseline death recipe mirrors motivation-runtime tests: starving low-health actor-2.
  Object.assign(config.memory.society.actors.initialActors[1], { health: 1, hunger: 1000 });
  config.memory.society.estates[1].initialFood = 0;
  const bundle = run(config, 432);
  const body = bundle.snapshot.world.actorModel.actors.find(a => a.actorId === 'actor-2');
  assert.equal(body.alive, false);
  const knowledge = buildCognitionKnowledge(bundle, 'actor-2');
  assert.equal(knowledge.self.alive, false);
  assert.equal(knowledge.self.currentGoal, null, 'dead actors expose no goal');
  assert.ok(knowledge.quote.observedTick < body.deathTick, 'quote source must predate death');
  assert.equal(knowledge.experience.sampleCount, 0);
  const view = projectCognitionInspector(bundle);
  const dead = view.actors[0];
  assert.equal(dead.knowledge.actorId, 'actor-2');
  // Frozen kernel invariant (M3-1 review contract): dormant evaluations carry exactly DEAD.
  const decision = dead.cognition.reviewState.lastEvaluation.decision;
  assert.equal(decision.mode, 'dormant');
  assert.equal(decision.shouldReview, false);
  assert.deepEqual(dead.cognition.reviewState.lastEvaluation.decision.reasonCodes, ['DEAD']);
  assert.equal(dead.counterfactual, null);
  assert.ok(bytes(view) <= MAX_INSPECTOR_BYTES);
});

test('contract §1: unknown actors fail closed and non-cognition rules reject with UNSUPPORTED_VERSION', () => {
  const bundle = run(null, 144);
  assert.throws(() => buildCognitionKnowledge(bundle, 'actor-4'), error => error.code === 'MIND_UNAVAILABLE');
  assert.throws(() => buildCognitionKnowledge(bundle, 'actor-1'), error => error.code === 'MIND_UNAVAILABLE');
  assert.throws(() => buildCognitionKnowledge(bundle, ''), error => error.code === 'INVALID_INPUT');
  const motivationBundle = (() => {
    const f = createMotivationVillage(42, 'wrong-rules', defaultMotivationVillageConfig());
    const s = createSimulationSession(f.bundle, f.systems);
    s.advanceTicks(144);
    return s.getBundle();
  })();
  assert.throws(() => buildCognitionKnowledge(motivationBundle, 'actor-2'), error => error.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => projectCognitionInspector(motivationBundle), error => error.code === 'UNSUPPORTED_VERSION');
  const forged = { snapshot: { fixtureVersion: '1', fixtureId: 'cognition-village', rulesVersion: 'm-cognition-v2',
    simulationId: 'forged', revision: 0, tick: 0, rng: { seed: 42, cursor: 0 }, world: {}, ledger: {} }, eventLog: [] };
  assert.throws(() => buildCognitionKnowledge(forged, 'actor-2'), error => error.code === 'UNSUPPORTED_VERSION');
});

test('contract §1: the full bundle descriptor tree is preflighted — accessors, inherited arrays, sparse, symbol, cyclic and non-JSON data are rejected with zero getter calls', () => {
  const base = () => run(null, 144);
  {
    // A deep accessor inside cognitionModel must not be executed even once.
    let reads = 0;
    const bundle = base();
    Object.defineProperty(bundle.snapshot.world.cognitionModel.config, 'bad', { enumerable: true, get() { reads++; return 1; } });
    assert.throws(() => projectCognitionInspector(bundle));
    assert.throws(() => buildCognitionKnowledge(bundle, 'actor-2'));
    assert.equal(reads, 0, 'deep accessor must not be read');
  }
  {
    // Accessor even deeper: inside the experience state of the samples holder.
    let reads = 0;
    const bundle = base();
    const deep = bundle.snapshot.world.experienceModel.actors[0];
    Object.defineProperty(deep, 'poison', { enumerable: true, get() { reads++; return 1; } });
    assert.throws(() => buildCognitionKnowledge(bundle, 'actor-2'));
    assert.equal(reads, 0);
  }
  {
    // An Array subclass with a 'map' getter: the prototype check must reject before any method
    // lookup, so the getter must never be invoked (clone/map paths would otherwise touch it).
    let calls = 0;
    const hostilePrototype = Object.create(Array.prototype);
    Object.defineProperty(hostilePrototype, 'map', { enumerable: false, get() { calls++; return Array.prototype.map; } });
    const bundle = base();
    const hostile = [];
    Object.setPrototypeOf(hostile, hostilePrototype);
    bundle.snapshot.world.mindModel.actors[0].observations = hostile;
    assert.throws(() => projectCognitionInspector(bundle));
    assert.throws(() => buildCognitionKnowledge(bundle, 'actor-2'));
    assert.equal(calls, 0, 'inherited array map getter must not be invoked');
  }
  {
    const bundle = base();
    const sparse = [1, 2];
    delete sparse[0];
    bundle.snapshot.world.mindModel.actors[0].observations = sparse;
    assert.throws(() => projectCognitionInspector(bundle), error => error.code === 'INVALID_INPUT');
  }
  {
    const bundle = base();
    Object.defineProperty(bundle.snapshot.world.mindModel.actors[0], Symbol.for('hidden'), { enumerable: true, value: 1 });
    assert.throws(() => buildCognitionKnowledge(bundle, 'actor-2'), error => error.code === 'INVALID_INPUT');
  }
  {
    const bundle = base();
    const cycle = { loop: null };
    cycle.loop = cycle;
    bundle.snapshot.world.mindModel.actors[0].belief = cycle;
    assert.throws(() => projectCognitionInspector(bundle), error => error.code === 'INVALID_INPUT');
  }
  {
    const bundle = base();
    bundle.snapshot.world.mindModel.actors[0].lastFunction = () => 1;
    assert.throws(() => buildCognitionKnowledge(bundle, 'actor-2'), error => error.code === 'INVALID_INPUT');
    const nonJson = base();
    nonJson.snapshot.world.cognitionModel.actors[0].signalBaseline = undefined;
    assert.throws(() => projectCognitionInspector(nonJson), error => error.code === 'INVALID_INPUT');
  }
});

test('contract §1/§4: outputs are fully detached clones; inputs stay byte-identical', () => {
  const bundle = run(createM3CloseoutConfig('work-learning', true), 864);
  const before = canonicalJson(bundle);
  const knowledge = buildCognitionKnowledge(bundle, 'actor-2');
  const view = projectCognitionInspector(bundle);
  const knowledgeSnapshot = canonicalJson(knowledge), viewSnapshot = canonicalJson(view);
  knowledge.self.wallet = 999;
  knowledge.planState.activePlan = { forged: true };
  knowledge.experience.penaltyPermille = 777;
  knowledge.observations.length = 0;
  knowledge.cognition = 'should never exist';
  delete knowledge.useWorkExperience;
  view.revision = 999;
  view.worldFacts.publicFood = 999;
  view.actors[0].workExperience.state.samples.push({ forged: true });
  view.actors[0].cognition.reviewState.lastEvaluation = null;
  view.actors[0].lastDecision = { forged: true };
  assert.equal(canonicalJson(bundle), before, 'the bundle must not observe any mutation');
  assert.equal(canonicalJson(buildCognitionKnowledge(bundle, 'actor-2')), knowledgeSnapshot, 're-reads are stable');
  assert.equal(canonicalJson(projectCognitionInspector(bundle)), viewSnapshot, 'inspector re-reads are stable');
});

test('contract §1: workExperience state/view derive consistently and match the Knowledge experience (frozen kernel formulas)', () => {
  // Pinned-baseline observation: the frozen work-learning ladder leaves a full successful window.
  const bundle = run(createM3CloseoutConfig('work-learning', true), 1726);
  const view = projectCognitionInspector(bundle);
  for (const actor of view.actors) {
    const state = actor.workExperience.state, derived = actor.workExperience.view;
    assert.equal(state.version, 'work-experience-state-v1');
    assert.equal(state.actorId, actor.knowledge.actorId);
    assert.ok(state.samples.length <= 4, 'window is at most four samples');
    for (let i = 1; i < state.samples.length; i++) {
      assert.ok(state.samples[i].sourceEventSeq > state.samples[i - 1].sourceEventSeq, 'FIFO by event sequence');
      assert.equal(state.samples[i].action, 'WorkForPay', 'only authority Work results enter the window');
    }
    assert.deepEqual(derived, deriveWorkExperience(state), 'view derives from the served state');
    assert.equal(derived.sampleCount, state.samples.length);
    assert.equal(derived.failureCount, state.samples.filter(sample => sample.status === 'rejected').length);
    assert.equal(derived.penaltyPermille, Math.min(300, derived.failureCount * 100), 'frozen penalty formula');
    assert.deepEqual(derived.evidenceRefs, state.samples.map(sample => sample.sourceEventSeq));
    // The Knowledge experience is the same derivation over the same state (no second source).
    assert.deepEqual(actor.knowledge.experience, derived);
    assert.equal(actor.counterfactual, null);
  }
  // A successful Work ladder really produced the window at this baseline (probe-recorded fact).
  const hunter = view.actors[0];
  assert.ok(hunter.workExperience.state.samples.length > 0, 'pinned baseline produced real Work samples');
  assert.ok(hunter.workExperience.state.samples.every(sample => sample.status === 'succeeded'));
  assert.equal(hunter.workExperience.view.penaltyPermille, 0);
});

test('contract §1/§4: useWorkExperience reflects the real experience config (ON/OFF only that flag differs in Knowledge)', () => {
  const on = buildCognitionKnowledge(run(createM3CloseoutConfig('work-learning', true), 288), 'actor-2');
  const off = buildCognitionKnowledge(run(createM3CloseoutConfig('work-learning', false), 288), 'actor-2');
  assert.equal(on.useWorkExperience, true);
  assert.equal(off.useWorkExperience, false);
  assert.equal(on.experience.version, 'work-experience-view-v1');
  assert.equal(off.experience.version, 'work-experience-view-v1');
});

test('contract §1: the experience-off closeout ladder keeps the ladder semantics visible and budgets inside limits', () => {
  const bundle = run(createM3CloseoutConfig('work-learning', false), 1726);
  const view = projectCognitionInspector(bundle);
  assert.ok(bytes(view) <= MAX_INSPECTOR_BYTES);
  for (const actor of view.actors) assert.ok(bytes(actor.knowledge) <= MAX_KNOWLEDGE_BYTES);
  assert.equal(view.actors[0].knowledge.useWorkExperience, false);
  assert.equal(view.actors[0].counterfactual, null);
});
