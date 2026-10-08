import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';

// Expected values: m2-contract-v2 §§2–6/Q1–Q4, control 5f07edd8, baseline 87aa9b6.
async function dependency(specifier, names) {
  const url = new URL(specifier, import.meta.url);
  let module;
  try { module = await import(url.href); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === url.href) return { missing: url.href };
    throw error; // Syntax, initialization and transitive failures are never missing delivery.
  }
  for (const name of names) assert.equal(typeof module[name], 'function', `${specifier} export ${name}`);
  return { module };
}
const [stateDep, plannerDep, fixtureDep, runtimeDep, knowledgeDep] = await Promise.all([
  dependency('../../runtime/core/motivation-state.mjs', ['validateMotivationConfig', 'createMotivationModel', 'validateMotivationModel']),
  dependency('../../runtime/core/motivation-planner.mjs', ['collectMotivationCandidates', 'planMotivationDecision', 'buildFastCounterfactual']),
  dependency('../../runtime/fixtures/motivation-village.mjs', ['defaultMotivationVillageConfig', 'createMotivationVillage', 'motivationSystems']),
  dependency('../../runtime/core/motivation-runtime.mjs', ['validateMotivationWorld', 'executeMotivationPlayerIntent', 'describeMotivationPlayerActions']),
  dependency('../../runtime/knowledge/motivation-knowledge.mjs', ['buildMotivationKnowledge', 'projectMotivationInspector']),
]);
function ready(t, ...deps) {
  const missing = deps.filter(d => d.missing).map(d => d.missing);
  if (!missing.length) return true;
  t.skip(`DEPENDENCY_UNDELIVERED: ${missing.join(', ')}`); return false;
}
const planner = plannerDep.module, fixture = fixtureDep.module, runtime = runtimeDep.module, knowledge = knowledgeDep.module;
const clone = value => structuredClone(value);
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const goal = () => ({ goalId: 1, kind: 'recover-health', step: 'use', startDay: 1, deadlineDay: 21, failures: 0, target: 800 });
const plan = () => ({ planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null });
function decisionKnowledge() {
  return {
    knowledgeVersion: 'motivation-knowledge-v1', phase: 'decision', simulationId: 'm2c-independent', actorId: 'actor-2', tick: 288, revision: 287,
    self: { name: 'hunter', occupation: 'hunter', location: 'village', alive: true, health: 400, hunger: 0, fatigue: 650, wallet: 50,
      inventory: { food: 19, herbs: 1 }, currentGoal: goal(), nextGoalId: 2, cooldownUntilDay: 0 },
    quote: { product: 'herbs', price: 50, observedTick: 144, sourceEventSeq: 12 },
    observations: [{ sourceEventSeq: 12, occurrenceTick: 144, observedTick: 144, channel: 'daily-public', sourceActorId: null, available: true, confidencePermille: 900, expiresTick: 432 }],
    belief: { topic: 'public-herbs-available', value: 'available', confidencePermille: 900, evidenceRefs: [12], contradictionRefs: [], lastUpdatedTick: 144 },
    profile: { dutyWeightPermille: 900, riskAversionPermille: 200 },
    duty: { requestId: 'd01', sourceEventSeq: 13, observedTick: 200, expiresTick: 432, urgencyPermille: 1000, status: 'pending', fulfilledTick: null },
    planState: { activePlan: plan(), suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null },
  };
}
function expectedCandidates({ weight = 900, risk = 200, urgency = 1000, gate = 'NEW_MAJOR_DUTY' } = {}) {
  // Closed arithmetic: strain=650+(700-400)=950; recovery=(800-400)+300=700.
  const support = Math.floor(urgency * weight / 1000), opposition = Math.floor(950 * risk / 1000);
  return [
    { action: 'UseMedicine', provider: 'health-need', sourceRef: 'recover-health', eligible: true, score: 700, support: 700, opposition: 0, reasonCode: 'RECOVER_HEALTH' },
    { action: 'BuyMedicine', provider: 'health-need', sourceRef: 'recover-health', eligible: false, score: null, support: 0, opposition: 0, reasonCode: 'PRIVATE_MEDICINE_PRESENT' },
    { action: 'WorkForPay', provider: 'role-request', sourceRef: 'd01', eligible: true, score: support - opposition, support, opposition, reasonCode: 'DUTY' },
    { action: 'Rest', provider: 'fatigue-need', sourceRef: 'self-fatigue', eligible: true, score: 650, support: 650, opposition: 0, reasonCode: 'FATIGUE_RELIEF' },
    { action: 'NoAction', provider: 'fallback', sourceRef: null, eligible: true, score: 0, support: 0, opposition: 0, reasonCode: 'WAIT' },
  ].map(c => ({ ...c, selectable: c.eligible && (gate !== 'CONTINUE_COMMITTED' || c.action === 'UseMedicine'),
    selectionBlockCode: !c.eligible ? 'SOFT_PRECONDITION_FAILED' : gate === 'CONTINUE_COMMITTED' && c.action !== 'UseMedicine' ? 'COMMITMENT_PROTECTED' : null }));
}

test('Q1 A1 exports/model signatures and frozen constants', t => {
  if (!ready(t, stateDep, plannerDep)) return;
  const s = stateDep.module;
  for (const [key, value] of Object.entries({ MOTIVATION_RULES: 'm-motivation-v1', MOTIVATION_CONFIG_VERSION: 'motivation-config-v1', MOTIVATION_STATE_VERSION: 'motivation-state-v1',
    MOTIVATION_KNOWLEDGE_VERSION: 'motivation-knowledge-v1', MOTIVATION_DECISION_VERSION: 'motivation-decision-v1', MOTIVATION_INSPECTOR_VERSION: 'motivation-inspector-v1',
    MAX_MOTIVATION_ACTORS: 2, MAX_MOTIVATION_CANDIDATES: 5, MAX_MOTIVATION_PLAN_STEPS: 2, MAX_MOTIVATION_REQUESTS: 64, MAX_MOTIVATION_INPUTS_PER_TICK: 8,
    MAX_MOTIVATION_KNOWLEDGE_BYTES: 16384, MAX_MOTIVATION_INSPECTOR_BYTES: 131072, MAX_MOTIVATION_PLAN_TRANSITIONS: 8 })) assert.equal(s[key], value, key);
  const config = freeze({ version: 'motivation-config-v1', profiles: ['actor-2', 'actor-3'].map(actorId => ({ actorId, dutyWeightPermille: 900, riskAversionPermille: 200 })), requests: [] });
  s.validateMotivationConfig(config); const m = s.createMotivationModel(config); s.validateMotivationModel(m);
  assert.equal(m.configFingerprint, canonical(config));
  assert.deepEqual(m.actors.map(a => [a.actorId, a.nextPlanId, a.activePlan, a.suspendedPlan, a.lastDecision]), [['actor-2', 1, null, null, null], ['actor-3', 1, null, null, null]]);
});
test('Q1 real collection/planning: five sources, independent Work710/Use700/Rest650, pure ID proposals', t => {
  if (!ready(t, plannerDep)) return;
  const k = freeze(decisionKnowledge()), before = canonical(k);
  assert.deepEqual(planner.collectMotivationCandidates(k), expectedCandidates().map(({ selectable, selectionBlockCode, ...c }) => c));
  const p = planner.planMotivationDecision(k);
  assert.deepEqual(p.decision.candidates, expectedCandidates());
  assert.deepEqual([p.decision.strainPermille, p.decision.choice, p.decision.gateReason], [950, 'WorkForPay', 'NEW_MAJOR_DUTY']);
  assert.deepEqual([p.activePlan.planId, p.activePlan.goalId, p.suspendedPlan.planId, p.nextPlanId, p.currentGoal.goalId, p.currentGoal.step], [2, null, 1, 3, 1, 'use']);
  assert.equal(p.decision.knowledgeFingerprint, before); assert.deepEqual(p.decision.evidenceRefs, [12, 13]); assert.equal(canonical(k), before);
});
test('Q1 single weight/risk perturbations really change choice under major gate', t => {
  if (!ready(t, plannerDep)) return;
  for (const [field, value, score] of [['dutyWeightPermille', 700, 510], ['riskAversionPermille', 400, 520]]) {
    const k = decisionKnowledge(); k.profile[field] = value; const p = planner.planMotivationDecision(freeze(k));
    assert.equal(p.decision.gateReason, 'NEW_MAJOR_DUTY'); assert.equal(p.decision.choice, 'UseMedicine'); assert.equal(p.decision.candidates[2].score, score);
    assert.deepEqual(p.decision.candidates, expectedCandidates({ weight: k.profile.dutyWeightPermille, risk: k.profile.riskAversionPermille }));
    assert.equal(p.activePlan.planId, 1); assert.equal(p.suspendedPlan, null);
  }
});
test('Q1 request urgency 1000/899 alone distinguishes major gate and protected Use commitment', t => {
  if (!ready(t, plannerDep)) return;
  const a = decisionKnowledge(); a.profile = { dutyWeightPermille: 1000, riskAversionPermille: 0 }; const b = clone(a); b.duty.urgencyPermille = 899;
  const pa = planner.planMotivationDecision(freeze(a)), pb = planner.planMotivationDecision(freeze(b));
  assert.deepEqual([pa.decision.choice, pa.decision.gateReason, pa.lastReviewedDutyId], ['WorkForPay', 'NEW_MAJOR_DUTY', 'd01']);
  assert.deepEqual([pb.decision.choice, pb.decision.gateReason, pb.lastReviewedDutyId, pb.activePlan.planId, pb.nextPlanId], ['UseMedicine', 'CONTINUE_COMMITTED', null, 1, 2]);
  assert.deepEqual(pb.decision.candidates, expectedCandidates({ weight: 1000, risk: 0, urgency: 899, gate: 'CONTINUE_COMMITTED' }));
});
test('Q1 fixed tie ordering, Knowledge soft preconditions, urgent and resume gates', t => {
  if (!ready(t, plannerDep)) return;
  const tie = decisionKnowledge(); tie.self.fatigue = 700; // Work=Use=Rest=700.
  assert.equal(planner.planMotivationDecision(freeze(tie)).decision.choice, 'UseMedicine');
  const noDuty = decisionKnowledge(); noDuty.duty = null;
  assert.deepEqual(planner.collectMotivationCandidates(freeze(noDuty))[2], { action: 'WorkForPay', provider: 'role-request', sourceRef: null, eligible: false, score: null, support: 0, opposition: 0, reasonCode: 'DUTY_UNAVAILABLE' });
  for (const [value, confidence, reason] of [['unknown', 0, 'SUPPLY_UNKNOWN'], ['unavailable', 900, 'SUPPLY_UNAVAILABLE'], ['available', 599, 'SUPPLY_CONFIDENCE_LOW']]) {
    const k = decisionKnowledge(); k.self.inventory.herbs = 0; k.belief.value = value; k.belief.confidencePermille = confidence;
    const c = planner.collectMotivationCandidates(freeze(k))[1]; assert.equal(c.eligible, false); assert.equal(c.reasonCode, reason); assert.equal(c.score, null);
  }
  const urgent = decisionKnowledge(); urgent.self.fatigue = 800; const p = planner.planMotivationDecision(freeze(urgent));
  assert.deepEqual([p.decision.gateReason, p.decision.choice, p.decision.candidates[3].score, p.lastReviewedDutyId], ['URGENT_FATIGUE', 'Rest', 2000, null]);
  assert.deepEqual(p.decision.candidates.filter(c => c.selectable).map(c => c.action), ['Rest']); assert.equal(p.suspendedPlan.planId, 1); assert.equal(p.activePlan.goalId, null);
  const resume = decisionKnowledge(); resume.duty.status = 'fulfilled'; resume.duty.fulfilledTick = 288;
  resume.planState.suspendedPlan = { ...plan(), status: 'suspended' }; resume.planState.activePlan = null;
  const rp = planner.planMotivationDecision(freeze(resume));
  assert.deepEqual([rp.decision.gateReason, rp.decision.choice, rp.activePlan.planId], ['RESUME_COMMITTED', 'UseMedicine', 1]);
});
test('Q1 mismatched Duty/Work request cannot continue or execute superseded commitment', t => {
  if (!ready(t, plannerDep)) return;
  const k = decisionKnowledge(); k.duty.requestId = 'd02'; k.duty.urgencyPermille = 899;
  k.planState = { activePlan: { planId: 2, goalId: null, kind: 'aid-village', steps: ['WorkForPay'], stepIndex: 0, status: 'ready', createdDay: 2, deadlineDay: 2, requestId: 'd01' },
    suspendedPlan: { ...plan(), status: 'suspended' }, nextPlanId: 3, lastReviewedDutyId: 'd01' };
  let p;
  try { p = planner.planMotivationDecision(freeze(k)); } catch (e) { assert.equal(e.code, 'INVALID_INPUT'); return; }
  assert.notEqual(p.decision.gateReason, 'CONTINUE_COMMITTED'); assert.notEqual(p.decision.choice, 'WorkForPay');
  assert.ok(p.activePlan === null || p.activePlan.kind !== 'aid-village' || p.activePlan.requestId === 'd02');
});
test('Q4 actual counterfactual compares complete saved baseline and three independent candidate arrays; tampering rejected', t => {
  if (!ready(t, plannerDep)) return;
  const k = freeze(decisionKnowledge()), before = canonical(k), d = freeze(planner.planMotivationDecision(k).decision), original = canonical(d);
  assert.deepEqual(planner.buildFastCounterfactual(d), [
    { caseId: 'baseline', changedField: null, fromValue: null, toValue: null, choice: 'WorkForPay', candidates: expectedCandidates(), gateReason: 'NEW_MAJOR_DUTY' },
    { caseId: 'duty-minus-200', changedField: 'profile.dutyWeightPermille', fromValue: 900, toValue: 700, choice: 'UseMedicine', candidates: expectedCandidates({ weight: 700 }), gateReason: 'NEW_MAJOR_DUTY' },
    { caseId: 'risk-plus-200', changedField: 'profile.riskAversionPermille', fromValue: 200, toValue: 400, choice: 'UseMedicine', candidates: expectedCandidates({ risk: 400 }), gateReason: 'NEW_MAJOR_DUTY' },
  ]);
  assert.equal(canonical(d), original); assert.equal(canonical(k), before);
  for (const mutate of [x => { x.choice = 'Rest'; }, x => { x.candidates[2].score++; }, x => { x.candidates[2].provider = 'fallback'; }, x => { x.candidates[2].sourceRef = 'd02'; },
    x => { x.candidates[0].selectable = false; }, x => { x.gateReason = 'CONTINUE_COMMITTED'; }, x => { x.knowledgeFingerprint = ' ' + x.knowledgeFingerprint; }]) {
    const altered = clone(d); mutate(altered); assert.throws(() => planner.buildFastCounterfactual(altered), e => Boolean(e.code));
  }
});
test('Q4 high-scoring Work remains blocked in all three counterfactuals by original commitment gate', t => {
  if (!ready(t, plannerDep)) return;
  const k = decisionKnowledge(); k.profile = { dutyWeightPermille: 1000, riskAversionPermille: 0 }; k.duty.urgencyPermille = 899;
  const cases = planner.buildFastCounterfactual(freeze(planner.planMotivationDecision(freeze(k)).decision));
  for (const c of cases) {
    assert.equal(c.choice, 'UseMedicine'); assert.equal(c.gateReason, 'CONTINUE_COMMITTED'); assert.equal(c.candidates[2].selectable, false); assert.equal(c.candidates[2].selectionBlockCode, 'COMMITMENT_PROTECTED');
  }
  assert.deepEqual(cases.map(c => c.candidates[2].score), [899, 719, 709]);
});

const estate = (b, id = 'actor-2') => b.snapshot.world.societyModel.agents.find(a => a.state.actorId === id).state;
const actor = (b, id = 'actor-2') => b.snapshot.world.actorModel.actors.find(a => a.actorId === id);
const mind = (b, id = 'actor-2') => b.snapshot.world.motivationModel.actors.find(a => a.actorId === id);
const facts = (b, type, tick, id = 'actor-2') => b.eventLog.filter(e => e.type === type && e.tick === tick && e.entityIds.includes(id));
function session(config) {
  const f = fixture.createMotivationVillage(42, 'm2c-independent', config ?? fixture.defaultMotivationVillageConfig());
  assert.ok(f.bundle && f.systems); return createSimulationSession(f.bundle, f.systems);
}
function reconcile(b) {
  const w = b.snapshot.world;
  for (const id of ['food', 'herbs', 'gold']) {
    const l = w.resourceModel.ledger[id];
    assert.equal(BigInt(w.resources[id]), BigInt(w.resourceModel.config.resources[id].initial) + BigInt(l.production) + BigInt(l.inflow) - BigInt(l.consumption) - BigInt(l.outflow) - BigInt(l.loss) - BigInt(l.capacityLoss), `${id} closed ledger`);
  }
}
const publicCash = b => b.snapshot.world.resources.gold - b.snapshot.world.societyModel.agents.reduce((n, a) => n + a.state.wallet, 0) - b.snapshot.world.playerModel.wallet;
function failureRecipe() {
  const c = fixture.defaultMotivationVillageConfig(), res = c.memory.society.actors.market.ecology.resources.resources;
  c.memory.society.player.initialHerbs = 20; res.herbs.initial = 50; res.herbs.production.numerator = 0; res.gold.initial = 350; return c;
}
test('Q2 actual Buy144→request200→Work288→Rest432→Use576 chain retains health Goal/Plan and obeys one action/day', t => {
  if (!ready(t, fixtureDep, runtimeDep, knowledgeDep)) return;
  const s = session(); s.advanceTicks(144); const b144 = s.getBundle();
  assert.equal(mind(b144).lastDecision.choice, 'BuyMedicine'); assert.equal(mind(b144).lastOutcome.price, 50);
  assert.deepEqual(mind(b144).lastOutcome.delta, { wallet: -50, herbs: 1, health: 0, fatigue: 0 }); assert.deepEqual(mind(b144).activePlan, plan());
  assert.equal(estate(b144).wallet, 50); assert.equal(estate(b144).inventory.herbs, 1); reconcile(b144);
  s.advanceTicks(56); const b200 = s.getBundle(); assert.equal(mind(b200).lastDuty.requestId, 'd01'); assert.equal(mind(b200).lastDuty.status, 'pending');
  s.advanceTicks(88); const b288 = s.getBundle(), m = mind(b288);
  assert.equal(m.lastDecision.choice, 'WorkForPay'); assert.equal(m.lastDecision.gateReason, 'NEW_MAJOR_DUTY'); assert.deepEqual(m.lastDecision.candidates, expectedCandidates());
  assert.deepEqual([m.lastDecision.innerStance, m.lastDecision.committedIntent, m.lastDecision.apparentAction], ['health-concerned', { goalId: 1, kind: 'recover-health' }, 'WorkForPay']);
  assert.deepEqual([m.lastDecision.goalId, m.lastDecision.planId, m.suspendedPlan.planId, m.lastDuty.status, m.lastDuty.fulfilledTick], [null, 2, 1, 'fulfilled', 288]);
  assert.equal(estate(b288).currentGoal.step, 'use'); assert.equal(estate(b288).currentGoal.failures, 0);
  assert.deepEqual(m.lastOutcome.delta, { wallet: 20, herbs: 0, health: 0, fatigue: 150 }); assert.equal(m.lastOutcome.publicFoodProduced, 8);
  assert.equal(estate(b288).wallet, 70); assert.equal(actor(b288).fatigue, 800); reconcile(b288);
  s.advanceTicks(144); const b432 = s.getBundle();
  assert.deepEqual([mind(b432).lastDecision.choice, mind(b432).lastDecision.gateReason, mind(b432).lastDecision.planId, mind(b432).lastDecision.goalId], ['Rest', 'URGENT_FATIGUE', 3, null]);
  assert.equal(mind(b432).lastOutcome.delta.fatigue, 0); assert.equal(actor(b432).fatigue, 600); assert.equal(mind(b432).suspendedPlan.planId, 1); reconcile(b432);
  s.advanceTicks(144); const b576 = s.getBundle();
  assert.deepEqual([mind(b576).lastDecision.choice, mind(b576).lastDecision.gateReason, mind(b576).lastDecision.planId], ['UseMedicine', 'RESUME_COMMITTED', 1]);
  assert.equal(estate(b576).inventory.herbs, 0); assert.equal(actor(b576).health, 500); assert.equal(estate(b576).currentGoal.goalId, 1); assert.equal(estate(b576).currentGoal.target, 800); assert.equal(estate(b576).ledger.goalsCompleted, 0);
  for (const tick of [144, 288, 432, 576]) for (const id of ['actor-2', 'actor-3']) {
    assert.equal(facts(b576, 'MotivationDecisionPlanned', tick, id).length, 1); const resolved = facts(b576, 'MotivationDecisionResolved', tick, id); assert.equal(resolved.length, 1);
    assert.equal(Object.hasOwn(b576.snapshot.commandReceipts, `motivation-day-${tick / 144}-${id}`), resolved[0].payload.status !== 'no-action');
  }
  for (const day of [2, 3]) assert.equal(b576.snapshot.commandReceipts[`motivation-day-${day}-actor-2`].input.payload.goalId, 0);
  assert.ok(b576.snapshot.world.mindModel.actors.every(a => a.lastDecision === null && a.lastOutcome === null));
  runtime.validateMotivationWorld(b576.snapshot.world, true);
  validateBundle(b576, { rulesVersion: 'm-motivation-v1', systems: fixture.motivationSystems() }); reconcile(b576);
});
test('Q3 deadline fixture: one Buy refusal, bounded blocked waiting without receipts/rest/repeated failures, day21 termination/day23 new Goal', t => {
  if (!ready(t, fixtureDep, runtimeDep)) return;
  const c = fixture.defaultMotivationVillageConfig(); c.memory.society.actors.initialActors.slice(1, 3).forEach(a => { a.fatigue = 200; });
  c.memory.society.estates.forEach(e => { e.initialFood = 32; e.initialHerbs = 0; }); c.memory.society.player.initialHerbs = 0;
  const herbs = c.memory.society.actors.market.ecology.resources.resources.herbs; herbs.initial = 0; herbs.production.numerator = 0;
  c.memory.society.actors.market.products.herbs.maxOrder = 0;
  c.mind.stimuli = [{ stimulusId: 'deadline-statement', tick: 12, kind: 'statement', speakerId: 'actor-1', listenerId: 'actor-2', available: true }]; c.motivation.requests = [];
  const s = session(c); s.advanceTicks(144); const first = s.getBundle();
  assert.equal(mind(first).lastDecision.choice, 'BuyMedicine'); assert.equal(mind(first).lastOutcome.status, 'rejected'); assert.deepEqual(mind(first).lastOutcome.failureOwner, { planId: 1, goalId: 1 });
  assert.equal(estate(first).currentGoal.failures, 1); assert.equal(estate(first).ledger.failedActions, 1); assert.equal(mind(first).activePlan.status, 'blocked'); assert.equal(mind(first).activePlan.stepIndex, 0);
  for (let day = 2; day <= 20; day++) {
    s.advanceTicks(144); const b = s.getBundle();
    assert.equal(mind(b).lastDecision.choice, 'NoAction'); assert.equal(mind(b).lastOutcome.status, 'no-action'); assert.equal(mind(b).lastOutcome.commandId, null); assert.equal(mind(b).lastOutcome.failureOwner, null);
    assert.equal(estate(b).currentGoal.failures, 1); assert.equal(estate(b).ledger.failedActions, 1); assert.equal(estate(b).ledger.restDays, 0); assert.equal(actor(b).fatigue, 200);
    assert.equal(mind(b).activePlan.planId, 1); assert.equal(mind(b).activePlan.status, 'blocked'); assert.equal(Object.hasOwn(b.snapshot.commandReceipts, `motivation-day-${day}-actor-2`), false);
  }
  s.advanceTicks(144); const end = s.getBundle(); assert.equal(estate(end).currentGoal, null); assert.equal(estate(end).ledger.goalsFailed, 1); assert.equal(estate(end).cooldownUntilDay, 23); assert.equal(mind(end).activePlan, null);
  s.advanceTicks(144); assert.equal(estate(s.getBundle()).currentGoal, null);
  s.advanceTicks(144); const next = s.getBundle(); assert.equal(estate(next).currentGoal.goalId, 2); assert.equal(estate(next).ledger.goalsFailed, 1); assert.equal(mind(next).activePlan, null);
});
test('Q3 actual death seals successful Buy, clears Goal/Plan once and makes later request/observation unavailable', t => {
  if (!ready(t, fixtureDep, runtimeDep)) return;
  const c = fixture.defaultMotivationVillageConfig(); Object.assign(c.memory.society.actors.initialActors[1], { health: 1, hunger: 1000 });
  Object.assign(c.memory.society.estates[1], { initialFood: 0, initialHerbs: 0, initialWallet: 100 }); c.mind.stimuli.push({ stimulusId: 'after-death', tick: 210, kind: 'market-check', listenerId: 'actor-2' });
  const s = session(c); s.advanceTicks(144); const dead = s.getBundle();
  assert.equal(actor(dead).alive, false); assert.equal(mind(dead).lastDecision.choice, 'BuyMedicine'); assert.equal(mind(dead).lastOutcome.status, 'succeeded');
  assert.equal(estate(dead).ledger.goalsFailed, 1); assert.equal(estate(dead).ledger.failedActions, 0); assert.equal(estate(dead).currentGoal, null); assert.equal(mind(dead).activePlan, null); assert.equal(mind(dead).suspendedPlan, null);
  const sealed = clone({ decision: mind(dead).lastDecision, outcome: mind(dead).lastOutcome, wallet: estate(dead).wallet, herbs: estate(dead).inventory.herbs });
  s.advanceTicks(432); const b = s.getBundle();
  assert.equal(estate(b).ledger.goalsFailed, 1); assert.equal(estate(b).ledger.failedActions, 0); assert.equal(mind(b).lastDuty, null);
  assert.deepEqual({ decision: mind(b).lastDecision, outcome: mind(b).lastOutcome, wallet: estate(b).wallet, herbs: estate(b).inventory.herbs }, sealed);
  assert.equal(facts(b, 'MotivationRequestResolved', 200)[0].payload.status, 'unavailable'); assert.equal(facts(b, 'MindStimulusResolved', 210)[0].payload.status, 'unavailable');
  assert.equal(b.eventLog.filter(e => e.type === 'MotivationDecisionPlanned' && e.tick > 144 && e.entityIds.includes('actor-2')).length, 0);
});
test('Q3 actual PlayerSell cash 150→10 makes wage20 Work reject; temporary failure does not damage suspended health Goal/Belief', t => {
  if (!ready(t, fixtureDep, runtimeDep, knowledgeDep)) return;
  const s = session(failureRecipe()); assert.equal(publicCash(s.getBundle()), 50); s.advanceTicks(144); const buy = s.getBundle();
  assert.equal(publicCash(buy), 150); assert.equal(estate(buy).wallet, 50); assert.equal(estate(buy, 'actor-3').wallet, 50); assert.equal(buy.snapshot.world.playerModel.wallet, 100); reconcile(buy);
  const sold = runtime.executeMotivationPlayerIntent(buy, { commandId: 'm2c-sell-seven', type: 'PlayerSell', payload: { product: 'herbs', quantity: 7 } });
  assert.equal(sold.outcome, 'succeeded'); assert.equal(sold.bundle.snapshot.tick, 145); assert.equal(publicCash(sold.bundle), 10); assert.equal(sold.bundle.snapshot.world.playerModel.wallet, 240); assert.equal(sold.bundle.snapshot.world.playerModel.inventory.herbs, 13); reconcile(sold.bundle);
  const next = createSimulationSession(sold.bundle, fixture.motivationSystems()); next.advanceTicks(142); const before = next.getBundle(), kb = knowledge.buildMotivationKnowledge(before, 'actor-2');
  next.advanceTicks(1); const failed = next.getBundle(), m = mind(failed);
  assert.equal(m.lastDecision.choice, 'WorkForPay'); assert.equal(m.lastDecision.candidates[2].score, 710); assert.equal(m.lastDecision.gateReason, 'NEW_MAJOR_DUTY'); assert.equal(m.lastOutcome.status, 'rejected'); assert.equal(m.lastOutcome.code, 'RULE_REJECTED');
  assert.deepEqual(m.lastOutcome.failureOwner, { planId: 2, goalId: null }); assert.deepEqual(m.lastOutcome.delta, { wallet: 0, herbs: 0, health: 0, fatigue: 0 });
  assert.equal(estate(failed).ledger.failedActions, estate(before).ledger.failedActions + 1); assert.equal(estate(failed).currentGoal.failures, 0); assert.equal(estate(failed).currentGoal.step, 'use');
  assert.equal(m.activePlan.planId, 2); assert.equal(m.activePlan.status, 'blocked'); assert.equal(m.suspendedPlan.planId, 1); assert.equal(m.lastDuty.status, 'pending');
  assert.equal(estate(failed).wallet, estate(before).wallet); assert.equal(estate(failed).inventory.herbs, estate(before).inventory.herbs); assert.equal(actor(failed).fatigue, actor(before).fatigue);
  const saved = JSON.parse(m.lastDecision.knowledgeFingerprint); assert.deepEqual(saved.belief, kb.belief); assert.deepEqual(saved.observations, kb.observations);
  assert.equal(knowledge.buildMotivationKnowledge(failed, 'actor-2').observations.some(o => o.channel === 'own-rejection'), false); assert.equal(Object.hasOwn(saved, 'world'), false); assert.equal(Object.hasOwn(saved.self, 'player'), false); assert.equal(publicCash(failed), 10); reconcile(failed);
  next.advanceTicks(144); const recovered = next.getBundle(); assert.equal(mind(recovered).lastDecision.choice, 'UseMedicine'); assert.equal(mind(recovered).lastDecision.planId, 1); assert.equal(actor(recovered).health, 500); assert.equal(estate(recovered).currentGoal.failures, 0);
  assert.ok(facts(recovered, 'MotivationPlanSettled', 432)[0].payload.transitions.some(x => x.planId === 2 && x.reasonCode === 'REQUEST_EXPIRED')); reconcile(recovered);
});
