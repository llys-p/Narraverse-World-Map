// Independent M4B gap review. Relative imports intentionally follow this checkout.
// Contract: m4-survival-contract-v2, control publication fe939fb30a7800ecb2910dd68e74117f24ae1344.
// Baseline ancestry is evidence metadata, never a hard-pinned current HEAD assertion.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateSurvivalKnowledge, isSurvivalQuoteFresh, isSurvivalOfferFresh, validateSurvivalPlan } from '../../runtime/core/survival-state.mjs';
import { collectSurvivalCandidates, planSurvivalDecision, continueSurvivalPlan } from '../../runtime/core/survival-planner.mjs';
import { createSurvivalVillage, defaultSurvivalVillageConfig } from '../../runtime/fixtures/survival-village.mjs';
import { defaultCognitionVillageConfig } from '../../runtime/fixtures/cognition-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { executeSurvivalPlayerIntent, survivalRuntimeHooks } from '../../runtime/core/motivation-runtime.mjs';
import { buildSurvivalKnowledge } from '../../runtime/knowledge/survival-knowledge.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { deriveActorSurvivalSignals } from '../../runtime/core/survival-signals.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVIDENCE = path.join(ROOT, 'artifacts/m4-knowledge-plan-review-20261011');
const hash = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
function sourceManifest() {
  const files = git(['ls-files', 'runtime']).split(/\r?\n/).filter(Boolean).sort();
  const entries = Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(ROOT, file)))]));
  return { files: entries, sha256: hash(JSON.stringify(entries)) };
}
const manifest = {
  head: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']), node: process.version,
  baseline: '667628166546a3f342873105b93a8684063504c1',
  deliveredSource: '520e838b162edae7419fcb69a4edb32c79bdb65e',
  contractPublication: 'fe939fb30a7800ecb2910dd68e74117f24ae1344',
  mergeBase: git(['merge-base', 'HEAD', '520e838b162edae7419fcb69a4edb32c79bdb65e']),
  startedAt: new Date().toISOString(), source: sourceManifest(), bundles: {},
  testSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
};
fs.mkdirSync(EVIDENCE, { recursive: true });
after(() => {
  manifest.finishedAt = new Date().toISOString();
  manifest.finalSource = sourceManifest();
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(path.join(EVIDENCE, 'manifest.json'), manifestText);
  fs.writeFileSync(path.join(EVIDENCE, 'manifest-' + manifest.startedAt.replace(/[:.]/g, '-') + '.json'), manifestText);
  assert.deepEqual(manifest.finalSource, manifest.source, 'source bytes must stay stable during this review');
});

const ACTOR = 'actor-2', DAY = 144;
const quote = (tick = 1) => ({ product: 'food', price: 10, available: true, observedTick: tick, expiresTick: tick + 288, sourceEventSeq: 2 });
const duty = () => ({ requestId: 's-food-01', sourceEventSeq: 12, observedTick: 100, expiresTick: 200, urgencyPermille: 1000, status: 'pending', fulfilledTick: null });
const offer = () => ({ requestId: 's-food-01', wage: 20, observedTick: 100, expiresTick: 200, sourceEventSeq: 13 });
const context = () => ({ evaluationEventSeq: 30, sourceReviewDecisionId: null, sourceReviewEventSeq: null });
const maintainContext = () => ({ evaluationEventSeq: 30, sourceReviewDecisionId: 'survival-day-1-actor-2', sourceReviewEventSeq: 20 });
function knowledge(over = {}) {
  const tick = over.tick ?? DAY;
  return { knowledgeVersion: 'survival-knowledge-v1', phase: 'decision', simulationId: 'survival-village', actorId: ACTOR,
    tick, revision: tick - 1,
    self: { name: 'Hunter', occupation: 'hunter', location: 'village', alive: true, health: 1000, hunger: 200,
      fatigue: 0, wallet: 30, inventory: { food: 0, herbs: 0 }, currentGoal: null, nextGoalId: 1, cooldownUntilDay: 0, ...structuredClone(over.self ?? {}) },
    quote: { product: 'herbs', price: 50, observedTick: 0, sourceEventSeq: null },
    observations: [], belief: { topic: 'public-herbs-available', value: 'unknown', confidencePermille: 0, evidenceRefs: [], contradictionRefs: [], lastUpdatedTick: null },
    profile: { dutyWeightPermille: 900, riskAversionPermille: 200 }, duty: over.duty ?? null,
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null, ...structuredClone(over.planState ?? {}) },
    experience: { version: 'work-experience-view-v1', simulationId: 'survival-village', actorId: ACTOR, topic: 'work-for-pay-execution', sampleCount: 0, failureCount: 0, penaltyPermille: 0, evidenceRefs: [] },
    useWorkExperience: true, foodQuote: over.foodQuote === undefined ? quote() : over.foodQuote, workOffer: over.workOffer ?? null };
}
const invalid = fn => assert.throws(fn, error => error?.code === 'INVALID_INPUT');
const foodPlan = () => ({ planId: 7, goalId: null, kind: 'secure-food', steps: ['BuyFood'], stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 4, requestId: null });
const healthGoal = () => ({ goalId: 5, kind: 'recover-health', step: 'use', startDay: 1, deadlineDay: 21, failures: 3, target: 800 });
const healthPlan = () => ({ planId: 2, goalId: 5, kind: 'recover-health', steps: ['UseMedicine'], stepIndex: 0, status: 'suspended', createdDay: 1, deadlineDay: 21, requestId: null });

// Keep required failures separate so each missing invariant remains visible.
test('pure: future quote with otherwise exact TTL is rejected by DTO and planner', () => {
  for (const consume of [validateSurvivalKnowledge, k => planSurvivalDecision(k, context())])
    invalid(() => consume(knowledge({ foodQuote: quote(145) })));
});
test('pure: future work offer with an internally matching future duty is rejected', () => {
  const d = { ...duty(), observedTick: 145, expiresTick: 200 };
  const o = { ...offer(), observedTick: 145 };
  for (const consume of [validateSurvivalKnowledge, k => planSurvivalDecision(k, context())])
    invalid(() => consume(knowledge({ duty: d, workOffer: o })));
});
test('pure: visible work offer must bind the same pending request, observation and expiry', () => {
  for (const [label, edit] of [
    ['request', o => { o.requestId = 'someone-else-request'; }],
    ['observation', o => { o.observedTick = 99; }],
    ['expiry', o => { o.expiresTick = 201; }],
  ]) {
    const o = offer(); edit(o);
    assert.throws(() => validateSurvivalKnowledge(knowledge({ duty: duty(), workOffer: o })), error => error?.code === 'INVALID_INPUT', label);
  }
  invalid(() => validateSurvivalKnowledge(knowledge({ workOffer: offer(), duty: null })));
  invalid(() => validateSurvivalKnowledge(knowledge({ workOffer: offer(), duty: { ...duty(), status: 'fulfilled', fulfilledTick: 144 } })));
});
test('pure: foreign actor and foreign experience cannot enter actor Knowledge', () => {
  for (const actorId of ['actor-1', 'actor-3']) {
    const foreign = knowledge(); foreign.actorId = actorId; foreign.experience.actorId = actorId;
    assert.throws(() => validateSurvivalKnowledge(foreign), error => error?.code === 'MIND_UNAVAILABLE');
    assert.throws(() => planSurvivalDecision(foreign, context()), error => error?.code === 'MIND_UNAVAILABLE');
  }
  const mismatch = knowledge(); mismatch.experience.actorId = 'actor-3';
  invalid(() => validateSurvivalKnowledge(mismatch));
});
test('pure: TTL is inclusive at observation and exclusive at expiry, absence is soft', () => {
  assert.equal(isSurvivalQuoteFresh(quote(), 1), true);
  assert.equal(isSurvivalQuoteFresh(quote(), 288), true);
  assert.equal(isSurvivalQuoteFresh(quote(), 289), false);
  assert.equal(isSurvivalQuoteFresh(quote(145), 144), false);
  assert.equal(isSurvivalOfferFresh(offer(), 100), true);
  assert.equal(isSurvivalOfferFresh(offer(), 199), true);
  assert.equal(isSurvivalOfferFresh(offer(), 200), false);
  const missing = collectSurvivalCandidates(knowledge({ foodQuote: null })).at(-1);
  assert.equal(missing.reasonCode, 'FOOD_QUOTE_MISSING'); assert.equal(missing.eligible, false);
  const expired = collectSurvivalCandidates(knowledge({ tick: 432 })).at(-1);
  assert.equal(expired.reasonCode, 'FOOD_QUOTE_EXPIRED'); assert.equal(expired.eligible, false);
  const absent = collectSurvivalCandidates(knowledge({ self: { location: 'forest' } })).at(-1);
  assert.equal(absent.reasonCode, 'FOOD_UNAVAILABLE'); assert.equal(absent.eligible, false);
});
test('pure: descriptor preflight rejects getters with exactly zero invocations', () => {
  for (const consume of [validateSurvivalKnowledge, collectSurvivalCandidates, k => planSurvivalDecision(k, context())]) {
    let calls = 0; const k = knowledge();
    Object.defineProperty(k.self, 'wallet', { enumerable: true, get() { calls++; return 30; } });
    invalid(() => consume(k)); assert.equal(calls, 0, 'getter must be rejected before reading or cloning');
  }
  let calls = 0; const c = context();
  Object.defineProperty(c, 'evaluationEventSeq', { enumerable: true, get() { calls++; return 30; } });
  invalid(() => planSurvivalDecision(knowledge(), c)); assert.equal(calls, 0);
});
test('pure: extra fields, sparse arrays, symbols, cycles and non-JSON inputs are rejected', () => {
  const edits = [k => { k.publicCash = 1000; }, k => { k.observations = Array(1); }, k => { k[Symbol('hidden')] = 1; },
    k => { k.self.inventory.food = k; }, k => { k.self.wallet = NaN; }, k => { k.self.wallet = Infinity; },
    k => { k.self.wallet = 1n; }, k => { k.self.wallet = undefined; }, k => { k.self.wallet = () => 1; }];
  for (const edit of edits) { const k = knowledge(); edit(k); invalid(() => validateSurvivalKnowledge(k)); }
});
test('pure: BuyFood guard reasons and lawful capacity boundary are independent', () => {
  for (const [over, reason] of [[{ foodQuote: null }, 'FOOD_QUOTE_MISSING'], [{ tick: 432 }, 'FOOD_QUOTE_EXPIRED'],
    [{ foodQuote: { ...quote(), available: false } }, 'FOOD_UNAVAILABLE'], [{ self: { wallet: 9 } }, 'WALLET_INSUFFICIENT'],
    [{ self: { inventory: { food: 2, herbs: 0 } } }, 'NO_FOOD_NEED'], [{ self: { inventory: { food: 1000, herbs: 0 } } }, 'NO_FOOD_NEED']])
    assert.equal(collectSurvivalCandidates(knowledge(over)).at(-1).reasonCode, reason);
  invalid(() => validateSurvivalKnowledge(knowledge({ self: { inventory: { food: 1001, herbs: 0 } } })));
  // A legal food need has f<=1; purchasing one yields f+1<=2<=1000.
  // CAPACITY_UNAVAILABLE cannot be a BuyFood reason under this contract's legal domain.
});
test('pure: one health suspension restores conditionally with identity, failures and deadline', () => {
  const goal = healthGoal(), suspended = healthPlan();
  const k = knowledge({ tick: 288, self: { health: 650, wallet: 30, inventory: { food: 2, herbs: 1 }, currentGoal: goal, nextGoalId: 6 },
    planState: { suspendedPlan: suspended, nextPlanId: 3 } });
  const before = JSON.stringify(k); const planned = planSurvivalDecision(k, context());
  assert.equal(planned.decision.gateReason, 'RESUME_COMMITTED'); assert.equal(planned.decision.choice, 'UseMedicine');
  assert.equal(planned.suspendedPlan, null); assert.deepEqual(planned.activePlan, { ...suspended, status: 'ready' });
  assert.deepEqual(planned.currentGoal, goal); assert.equal(JSON.stringify(k), before);
});
test('pure: double suspension and foreign goal binding are rejected', () => {
  invalid(() => validateSurvivalKnowledge(knowledge({ self: { currentGoal: healthGoal(), nextGoalId: 6 },
    planState: { activePlan: { ...healthPlan(), planId: 3, status: 'ready' }, suspendedPlan: healthPlan(), nextPlanId: 4 } })));
  invalid(() => validateSurvivalKnowledge(knowledge({ self: { currentGoal: healthGoal(), nextGoalId: 6 },
    planState: { activePlan: { ...healthPlan(), planId: 3 }, suspendedPlan: healthPlan(), nextPlanId: 4 } })));
  invalid(() => validateSurvivalKnowledge(knowledge({ self: { currentGoal: healthGoal(), nextGoalId: 6 },
    planState: { suspendedPlan: { ...healthPlan(), goalId: 99 }, nextPlanId: 3 } })));
});
test('pure: d+3 continues same commitment, d+4 cancels before selection', () => {
  const old = foodPlan();
  for (const consume of [k => planSurvivalDecision(k, context()), k => continueSurvivalPlan(k, maintainContext())]) {
    const atLimit = consume(knowledge({ tick: 576, foodQuote: quote(576), planState: { activePlan: old, nextPlanId: 8 } }));
    assert.equal(atLimit.decision.choice, 'BuyFood'); assert.equal(atLimit.activePlan.planId, 7); assert.deepEqual(atLimit.transitions, []);
    const expired = consume(knowledge({ tick: 720, foodQuote: quote(720), planState: { activePlan: old, nextPlanId: 8 } }));
    assert.deepEqual(expired.transitions, [{ planId: 7, kind: 'secure-food', fromStatus: 'ready', toStatus: 'cancelled', reasonCode: 'DEADLINE_EXPIRED' }]);
    assert.notEqual(expired.activePlan?.planId, 7);
  }
  invalid(() => validateSurvivalPlan({ ...old, goalId: 5 }));
  invalid(() => validateSurvivalPlan({ ...old, steps: ['WorkForPay'], requestId: 's-food-01' }));
});
test('pure: review evaluation and strictly past own source anchor are distinct', () => {
  const review = planSurvivalDecision(knowledge(), context()).decision;
  assert.equal(review.decisionId, 'survival-day-1-actor-2'); assert.equal(review.sourceReviewDecisionId, null);
  assert.equal(review.sourceReviewEventSeq, null); assert.ok(review.evidenceRefs.includes(30));
  const k = knowledge({ tick: 288, foodQuote: quote(288), planState: { activePlan: foodPlan(), nextPlanId: 8 } });
  const maintained = continueSurvivalPlan(k, maintainContext()).decision;
  assert.deepEqual(maintained.candidates, []); assert.equal(maintained.sourceReviewEventSeq, 20);
  assert.equal(maintained.sourceReviewDecisionId, 'survival-day-1-actor-2'); assert.ok(maintained.evidenceRefs.includes(20));
  for (const c of [{ ...maintainContext(), sourceReviewDecisionId: 'survival-day-1-actor-3' },
    { ...maintainContext(), sourceReviewDecisionId: 'survival-day-2-actor-2' },
    { ...maintainContext(), sourceReviewDecisionId: 'survival-day-3-actor-2' },
    { ...maintainContext(), sourceReviewDecisionId: 'cognition-day-1-actor-2' },
    { ...maintainContext(), sourceReviewEventSeq: 30 }, { ...maintainContext(), sourceReviewEventSeq: 31 }])
    invalid(() => continueSurvivalPlan(k, c));
  invalid(() => planSurvivalDecision(knowledge(), maintainContext()));
});

test('pure: five frozen recipes establish all inputs and prohibited resupply before behavior', () => {
  for (const recipe of ['affordable', 'earn-then-buy', 'no-opportunity', 'wage-refused', 'no-food']) assertRecipe(recipe);
});
function assertRecipe(recipe) {
  const c = defaultSurvivalVillageConfig(recipe), original = defaultCognitionVillageConfig();
  const s = c.memory.society, market = s.actors.market, resources = market.ecology.resources.resources;
  assert.deepEqual(c.mind.stimuli, []); assert.equal(Object.hasOwn(c.memory, 'stimuli'), false);
  assert.deepEqual(c.motivation.profiles, original.motivation.profiles);
  assert.deepEqual(c.experience, original.experience); assert.deepEqual(c.cognition, original.cognition);
  assert.equal(resources.food.initial, recipe === 'no-food' ? 0 : 600);
  assert.equal(resources.gold.initial, recipe === 'wage-refused' ? 0 : 1000); assert.equal(resources.herbs.initial, 20);
  assert.equal(s.economics.wage, 20); assert.equal(s.economics.workFood, 0);
  assert.equal(resources.food.production.numerator, 0); assert.equal(resources.food.lossPermille, 0);
  assert.deepEqual(market.ecology.resources.flows, []); assert.equal(market.ecology.maxHunters, 0);
  assert.equal(market.transportCapacity, 0);
  for (const [product, price] of [['food', 10], ['herbs', 50]]) {
    const spec = market.products[product];
    assert.equal(spec.basePrice, price); assert.equal(spec.minPrice, price); assert.equal(spec.maxPrice, price);
    assert.equal(spec.maxDailyChange, 0); assert.equal(spec.maxOrder, 0);
  }
  assert.deepEqual(s.estates.map(e => e.initialFood), recipe === 'no-food' ? [0, 0, 0] : [20, 0, 20]);
  assert.deepEqual(s.estates.map(e => e.initialHerbs), [0, 0, 0]);
  assert.deepEqual(s.estates.map(e => e.initialWallet), [0, ['affordable', 'no-food'].includes(recipe) ? 30 : 0, 0]);
  assert.equal(s.player.initialFood, recipe === 'no-food' ? 0 : 20);
  assert.equal(s.player.initialHerbs, 0); assert.equal(s.player.initialWallet, 0);
  assert.deepEqual(s.actors.initialActors.map(a => a.health), recipe === 'no-food' ? [1000, 50, 1000, 1000] : [1000, 1000, 1000, 1000]);
  assert.deepEqual(s.actors.initialActors.map(a => a.fatigue), [0, 0, 0, 0]);
  assert.deepEqual(s.actors.initialActors.map(a => a.hunger), [0, recipe === 'no-food' ? 400 : 200, 0, 0]);
  assert.deepEqual(c.motivation.requests, ['earn-then-buy', 'wage-refused'].includes(recipe) ?
    [{ requestId: 's-food-01', tick: 100, speakerId: 'actor-1', listenerId: ACTOR, urgencyPermille: 1000, expiresTick: 200 }] : []);
  return c;
}

test('pure: illegal NPC absence is rejected and initially dead actor emits no local observation', () => {
  // Actor-2 has no legal movement path; forest must fail at the world boundary.
  const absent = structuredClone(createSurvivalVillage().bundle.snapshot), absentEvents = [];
  absent.world.actorModel.actors.find(a => a.actorId === ACTOR).location = 'forest';
  invalid(() => survivalRuntimeHooks.beforeSystems(absent, [], 1, fact => absentEvents.push(fact), () => assert.fail('no command')));
  assert.deepEqual(absentEvents, []);
  const c = assertRecipe('no-opportunity'); c.memory.society.actors.initialActors[1].health = 0;
  const dead = structuredClone(createSurvivalVillage(42, 'survival-village', c).bundle.snapshot), emitted = [];
  survivalRuntimeHooks.beforeSystems(dead, [], 1, fact => emitted.push(fact), () => assert.fail('no command'));
  assert.equal(emitted.filter(f => f.type === 'SurvivalFoodQuoteAnnounced').length, 0);
});

test('pure: private food threshold ORs frozen urgent needs without changing inputs or kernel mode', () => {
  for (const [food, fatigue, health, expected] of [[0, 0, 1000, true], [1, 0, 1000, true], [2, 0, 1000, false],
    [2, 800, 1000, true], [2, 0, 300, true]]) {
    const k = knowledge({ self: { inventory: { food, herbs: 0 }, fatigue, health } }), before = JSON.stringify(k);
    const signals = deriveActorSurvivalSignals(k, 700, null, null);
    assert.equal(signals.input.urgentNeed, expected); assert.equal(Object.hasOwn(signals.input, 'mode'), false);
    assert.equal(JSON.stringify(k), before);
  }
});
function own(bundle) {
  const w = bundle.snapshot.world;
  return { world: w, body: w.actorModel.actors.find(a => a.actorId === ACTOR),
    estate: w.societyModel.agents.find(a => a.state.actorId === ACTOR).state,
    entry: w.motivationModel.actors.find(a => a.actorId === ACTOR),
    experience: w.experienceModel.actors.find(a => a.actorId === ACTOR).workExperienceState };
}
function preserveBundle(name, bundle) {
  const text = JSON.stringify(bundle);
  fs.writeFileSync(path.join(EVIDENCE, name + '.json'), text + '\n');
  manifest.bundles[name] = { tick: bundle.snapshot.tick, sha256: hash(text), fileSha256: hash(text + '\n') };
}
function assertNoIncome(a, failed) {
  assert.equal(a.estate.wallet, 0); assert.deepEqual(a.estate.inventory, { food: 0, herbs: 0 });
  for (const key of ['wages', 'workDays', 'foodProduced', 'foodBought', 'foodUsed', 'hunts']) assert.equal(a.estate.ledger[key], 0, key);
  assert.equal(a.estate.ledger.failedActions, failed);
}

test('runtime: no-opportunity two days are true waits with independent food and hunger anchors', () => {
  const c = assertRecipe('no-opportunity'), fixture = createSurvivalVillage(42, 'survival-village', c);
  assert.equal(fixture.bundle.snapshot.world.resources.food, 600 - 3 * 20);
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  for (const day of [1, 2]) {
    session.advanceTicks(DAY); const b = session.getBundle(), a = own(b);
    assertNoIncome(a, 0); assert.equal(a.body.hunger, 200 + day * 100);
    assert.equal(a.body.health, 1000); assert.equal(a.body.alive, true);
    assert.equal(a.entry.lastDecision.choice, 'NoAction'); assert.equal(a.entry.lastOutcome.status, 'no-action');
    assert.equal(a.entry.lastOutcome.commandId, null); assert.equal(a.entry.lastOutcome.failureOwner, null);
    assert.equal(a.entry.activePlan, null); assert.equal(a.entry.lastDuty, null); assert.deepEqual(a.experience.samples, []);
    assert.equal(a.world.resources.food, 540 - day * 76, '76 anonymous residents eat only public food; other three eat private rations');
    assert.equal(b.eventLog.filter(e => e.type === 'SurvivalWorkOfferAnnounced').length, 0);
    assert.equal(Object.keys(b.snapshot.commandReceipts).filter(id => id.endsWith('-actor-2')).length, 0);
    preserveBundle('no-opportunity-day-' + day, b);
    if (day === 2) verifyTrustedSources(b, fixture.systems);
  }
});

function verifyTrustedSources(bundle, systems) {
  validateBundle(bundle, { rulesVersion: 'm-survival-v1', systems });
  // Tampering is an audit counterexample, never the input to a real behavior chain.
  for (const mutate of [
    b => { b.snapshot.world.cognitionModel.actors.find(a => a.actorId === ACTOR).lastReviewEventSeq = b.eventLog.find(e => e.type === 'CognitionReviewEvaluated').eventSeq; },
    b => { b.snapshot.world.cognitionModel.actors.find(a => a.actorId === ACTOR).lastReviewDecisionId = 'cognition-day-2-actor-3'; },
    b => { b.snapshot.world.cognitionModel.actors.find(a => a.actorId === ACTOR).lastReviewEventSeq = b.eventLog.length + 1; },
    b => { b.eventLog.find(e => e.type === 'SurvivalFoodQuoteAnnounced').payload.price = 11; },
    b => { const d = b.eventLog.find(e => e.type === 'MotivationDecisionPlanned' && e.payload.actorId === ACTOR); d.payload.mode = 'maintain'; },
  ]) {
    const bad = structuredClone(bundle); mutate(bad);
    assert.notEqual(canonicalJson(bad), canonicalJson(bundle), 'tamper must change canonical bytes');
    assert.throws(() => buildSurvivalKnowledge(bad, ACTOR), error => error?.code === 'INVALID_INPUT');
  }
  for (const actor of bundle.snapshot.world.cognitionModel.actors) {
    const fact = bundle.eventLog.find(e => e.eventSeq === actor.lastReviewEventSeq);
    assert.equal(fact.type, 'MotivationDecisionPlanned'); assert.equal(fact.payload.actorId, actor.actorId);
    assert.equal(fact.payload.mode, 'review'); assert.equal(fact.payload.decisionId, actor.lastReviewDecisionId);
    const evaluation = bundle.eventLog.find(e => e.type === 'CognitionReviewEvaluated' && e.tick === fact.tick && e.entityIds[0] === actor.actorId);
    assert.ok(evaluation.eventSeq < fact.eventSeq);
    assert.ok(fact.payload.evidenceRefs.includes(evaluation.eventSeq));
    assert.equal(fact.payload.sourceReviewEventSeq, null); assert.equal(fact.payload.sourceReviewDecisionId, null);
  }
}

test('runtime: wage-refused has one authority refusal, one own sample, expiry prevents retry', () => {
  const c = assertRecipe('wage-refused'), fixture = createSurvivalVillage(42, 'survival-village', c);
  assert.equal(fixture.bundle.snapshot.world.resources.gold, 0);
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(DAY); const first = session.getBundle(), a = own(first);
  assertNoIncome(a, 1); assert.equal(a.body.hunger, 300);
  assert.equal(a.entry.lastDecision.choice, 'WorkForPay'); assert.equal(a.entry.lastDecision.reasonCode, 'FOOD_INCOME');
  assert.equal(a.entry.lastOutcome.status, 'rejected'); assert.equal(a.entry.lastOutcome.code, 'RULE_REJECTED');
  assert.deepEqual(a.entry.lastOutcome.failureOwner, { planId: a.entry.activePlan.planId, goalId: null });
  assert.equal(a.estate.lastActionDay, 1);
  const receipt = first.snapshot.commandReceipts[a.entry.lastOutcome.commandId];
  assert.equal(receipt.status, 'rejected'); assert.equal(receipt.result.code, 'RULE_REJECTED');
  assert.equal(a.experience.samples.length, 1); assert.equal(a.experience.samples[0].status, 'rejected');
  assert.deepEqual(a.world.experienceModel.actors.find(e => e.actorId === 'actor-3').workExperienceState.samples, []);
  const visible = JSON.parse(a.entry.lastDecision.knowledgeFingerprint);
  assert.equal(visible.foodQuote.price, 10); assert.equal(visible.foodQuote.available, true);
  assert.deepEqual(visible.workOffer, { requestId: 's-food-01', wage: 20, observedTick: 100, expiresTick: 200,
    sourceEventSeq: first.eventLog.find(e => e.type === 'SurvivalWorkOfferAnnounced').eventSeq });
  const announced = first.eventLog.find(e => e.type === 'SurvivalWorkOfferAnnounced');
  for (const change of [e => { e.payload.actorId = 'actor-3'; }, e => { e.payload.requestId = 'other'; },
    e => { e.causationEventSeqs = [first.eventLog.find(f => f.type === 'SurvivalFoodQuoteAnnounced').eventSeq]; }]) {
    const bad = structuredClone(first); change(bad.eventLog.find(e => e.type === announced.type));
    assert.notEqual(canonicalJson(bad), canonicalJson(first), 'offer tamper must change canonical bytes');
    assert.throws(() => buildSurvivalKnowledge(bad, ACTOR), error => error?.code === 'INVALID_INPUT');
  }
  preserveBundle('wage-refused-day-1', first);
  session.advanceTicks(200 - DAY); const atExpiry = session.getBundle();
  // A committed projection removes expired offers; decision DTOs may still represent stale data.
  assert.equal(buildSurvivalKnowledge(atExpiry, ACTOR).workOffer, null);
  session.advanceTicks(288 - 200); const second = session.getBundle(), next = own(second);
  assertNoIncome(next, 1); assert.equal(next.body.hunger, 400);
  assert.equal(next.entry.lastDecision.choice, 'NoAction'); assert.equal(next.entry.lastOutcome.status, 'no-action');
  assert.deepEqual(next.experience.samples, a.experience.samples);
  assert.equal(next.world.resources.gold, 0); assert.equal(next.world.resources.food, 540 - 2 * 76);
  const ownReceipts = Object.entries(second.snapshot.commandReceipts).filter(([id]) => id.endsWith('-actor-2'));
  assert.equal(ownReceipts.length, 1); assert.equal(ownReceipts[0][1].status, 'rejected');
  assert.equal(buildSurvivalKnowledge(second, ACTOR).workOffer, null);
  preserveBundle('wage-refused-day-2', second);
});

test('runtime: establish real health plan, legally drain purse, food-work failure preserves it', () => {
  const c = assertRecipe('affordable');
  c.memory.society.estates[1].initialFood = 2; c.memory.society.estates[1].initialWallet = 50;
  c.memory.society.actors.initialActors[1].health = 650; c.memory.society.player.initialHerbs = 2;
  c.memory.society.actors.market.ecology.resources.resources.gold.initial = 50;
  c.mind.stimuli = [{ stimulusId: 'health-market', tick: 12, kind: 'market-check', listenerId: ACTOR }];
  c.motivation.requests = [{ requestId: 'health-food-work', tick: 200, speakerId: 'actor-1', listenerId: ACTOR, urgencyPermille: 1000, expiresTick: 400 }];
  const fixture = createSurvivalVillage(42, 'survival-village', c);
  let session = createSimulationSession(fixture.bundle, fixture.systems); session.advanceTicks(DAY);
  let b = session.getBundle(); const before = own(b);
  assert.equal(before.entry.lastDecision.choice, 'BuyMedicine'); assert.equal(before.entry.lastOutcome.status, 'succeeded');
  assert.deepEqual(before.estate.currentGoal, { goalId: 1, kind: 'recover-health', step: 'use', startDay: 1, deadlineDay: 21, failures: 0, target: 800 });
  assert.deepEqual(before.entry.activePlan, { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null });
  preserveBundle('health-established-day-1', b);
  for (let i = 0; i < 2; i++) {
    const result = executeSurvivalPlayerIntent(b, { commandId: 'health-drain-' + i, type: 'PlayerSell', payload: { product: 'herbs', quantity: 1 } });
    assert.equal(result.outcome, 'succeeded'); b = result.bundle;
    preserveBundle('health-purse-trade-' + i, b);
  }
  assert.equal(b.snapshot.world.resources.gold - b.snapshot.world.playerModel.wallet -
    b.snapshot.world.societyModel.agents.reduce((sum, e) => sum + e.state.wallet, 0), 0);
  session = createSimulationSession(b, fixture.systems); session.advanceTicks(288 - b.snapshot.tick);
  b = session.getBundle(); const next = own(b);
  assert.equal(next.entry.lastDecision.choice, 'WorkForPay'); assert.equal(next.entry.lastOutcome.status, 'rejected');
  assert.equal(next.entry.lastOutcome.code, 'RULE_REJECTED'); assert.equal(next.entry.activePlan.kind, 'secure-food');
  assert.equal(next.entry.activePlan.goalId, null); assert.equal(next.entry.activePlan.planId, 2);
  assert.deepEqual(next.entry.suspendedPlan, { ...before.entry.activePlan, status: 'suspended' });
  assert.deepEqual(next.estate.currentGoal, before.estate.currentGoal, 'goal identity, failures and deadline must all remain identical');
  assert.equal(next.estate.ledger.failedActions, 1);
  assert.deepEqual(next.entry.lastOutcome.failureOwner, { planId: 2, goalId: null });
  assert.equal(next.estate.ledger.wages, 0); assert.equal(next.experience.samples.length, 1);
  assert.equal(next.experience.samples[0].status, 'rejected');
  preserveBundle('health-preserved-day-2', b);
});

test('runtime: a real refused last-ration plan lives through d+3 and cancels before d+4 command', () => {
  const c = assertRecipe('affordable');
  c.memory.society.estates[0].initialFood = 0; c.memory.society.estates[0].initialWallet = 10;
  c.memory.society.actors.initialActors[0].hunger = 400;
  c.memory.society.actors.market.ecology.resources.resources.food.initial = 41;
  const fixture = createSurvivalVillage(42, 'survival-village', c);
  assert.equal(fixture.bundle.snapshot.world.resources.food, 41 - 20 - 20);
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  let planId;
  for (const day of [1, 2, 3, 4, 5]) {
    session.advanceTicks(DAY); const b = session.getBundle(), a = own(b);
    assert.equal(a.body.alive, true); assert.equal(a.world.resources.food, 0);
    assert.equal(a.estate.wallet, 30); assert.equal(a.estate.ledger.foodBought, 0);
    assert.equal(a.estate.ledger.foodUsed, 0); assert.equal(a.estate.ledger.failedActions, 1);
    if (day === 1) {
      planId = a.entry.activePlan.planId;
      assert.equal(a.entry.lastOutcome.status, 'rejected'); assert.equal(a.entry.lastDecision.choice, 'BuyFood');
      assert.equal(a.entry.activePlan.createdDay, 1); assert.equal(a.entry.activePlan.deadlineDay, 4);
      const seen = JSON.parse(a.entry.lastDecision.knowledgeFingerprint).foodQuote;
      assert.equal(seen.available, true);
      const observation = b.eventLog.find(e => e.eventSeq === seen.sourceEventSeq);
      const earlierPurchase = b.eventLog.find(e => e.type === 'SocietyActionCommitted' && e.commandId === 'society-day-1-actor-1');
      assert.ok(observation.eventSeq < earlierPurchase.eventSeq);
    } else {
      assert.equal(a.entry.lastDecision.choice, 'NoAction'); assert.equal(a.entry.lastOutcome.status, 'no-action');
      assert.equal(a.entry.lastOutcome.commandId, null);
      if (day <= 4) { assert.equal(a.entry.activePlan.planId, planId); assert.equal(a.entry.activePlan.status, 'blocked'); }
      else {
        assert.equal(a.entry.activePlan, null);
        const settled = b.eventLog.find(e => e.tick === 720 && e.type === 'MotivationPlanSettled' && e.payload.actorId === ACTOR);
        assert.ok(settled);
        assert.ok(settled.payload.transitions.some(t => t.planId === planId && t.toStatus === 'cancelled' && t.reasonCode === 'DEADLINE_EXPIRED'));
        assert.equal(b.eventLog.filter(e => e.tick === 720 && e.commandId === 'survival-day-5-actor-2').length, 0);
        const decision = b.eventLog.find(e => e.tick === 720 && e.type === 'MotivationDecisionPlanned' && e.payload.actorId === ACTOR);
        assert.equal(decision.payload.planId, null, 'selection already excludes expired plan before daily settlement');
      }
    }
    if ([1, 4, 5].includes(day)) preserveBundle('deadline-day-' + day, b);
  }
});

test('runtime: a throwing daily system publishes none of its partially changed tick', () => {
  const fixture = createSurvivalVillage(42, 'survival-village', assertRecipe('no-opportunity'));
  const failure = Object.assign(new Error('intentional post-settlement failure'), { code: 'REVIEW_SYSTEM_FAILURE' });
  const systems = { ...fixture.systems, society(ctx) { fixture.systems.society(ctx); throw failure; } };
  const session = createSimulationSession(fixture.bundle, systems);
  session.advanceTicks(143); const before = session.getBundle(), beforeBytes = canonicalJson(before);
  assert.throws(() => session.advanceTicks(1), error => error?.message === 'Tick 144 was not committed' && error.cause === failure);
  const after = session.getBundle(); assert.equal(canonicalJson(after), beforeBytes);
  assert.equal(after.snapshot.tick, 143); assert.equal(after.snapshot.revision, 143);
  preserveBundle('tick-failure-before', before); preserveBundle('tick-failure-after', after);
});
