import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneData, canonicalJson } from '../../runtime/core/data-contract.mjs';
import { defaultExperienceVillageConfig, createExperienceVillage } from '../../runtime/fixtures/experience-village.mjs';
import { EXPERIENCE_RULES } from '../../runtime/core/experience-state.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { executeExperiencePlayerIntent, experienceRuntimeHooks } from '../../runtime/core/motivation-runtime.mjs';
import { projectOwnWorkOutcome } from '../../runtime/core/work-experience-adapter.mjs';
import { observeWorkOutcome } from '../../runtime/core/work-experience.mjs';
import { cloneBundle, createInitialBundle, validateSnapshotStructure } from '../../runtime/core/world-state.mjs';
import { lookupCommand, advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { validateEventLog, validateFact } from '../../runtime/core/event-log.mjs';

function buildE2Config(useWorkExperience = true) {
  const config = defaultExperienceVillageConfig();
  config.experience.useWorkExperience = useWorkExperience;

  // Exact recipe values from A0 / contract
  config.memory.society.player.initialHerbs = 20;
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial = 50;
  config.memory.society.actors.market.ecology.resources.resources.herbs.production = { numerator: 0, denominator: 8 };
  config.memory.society.actors.market.ecology.resources.resources.gold.initial = 350;

  // Requests: d01 at tick 200, add d02 at tick 344
  config.motivation.requests = [
    {
      requestId: 'd01',
      tick: 200,
      speakerId: 'actor-1',
      listenerId: 'actor-2',
      urgencyPermille: 1000,
      expiresTick: 432,
    },
    {
      requestId: 'd02',
      tick: 344,
      speakerId: 'actor-1',
      listenerId: 'actor-2',
      urgencyPermille: 1000,
      expiresTick: 576,
    },
  ];
  return config;
}

test('E2: 真实拒付后改变下一日选择 (useWorkExperience: true vs false)', async () => {
  // 1. Run true scenario
  const { bundle: bundleTrue, systems: systemsTrue } = createExperienceVillage(42, 'exp-e2-true', buildE2Config(true));
  const sessionTrue = createSimulationSession(bundleTrue, systemsTrue);

  // Advance to tick 144
  sessionTrue.advanceTicks(144);
  let state144 = sessionTrue.getBundle();

  // Execute PlayerSell herbs qty=7 (duration 1 tick -> tick 145)
  const sellIntent = {
    commandId: 'player-sell-herbs',
    type: 'PlayerSell',
    payload: { product: 'herbs', quantity: 7 },
  };
  const sellResult = executeExperiencePlayerIntent(state144, sellIntent);
  assert.equal(sellResult.outcome, 'succeeded');
  assert.equal(sellResult.durationTicks, 1);

  // Resume session from tick 145
  const sessionAfterSell = createSimulationSession(sellResult.bundle, systemsTrue);

  // Advance to tick 288 (end of day 2)
  sessionAfterSell.advanceTicks(143);
  const bundleDay2 = sessionAfterSell.getBundle();

  // At tick 288: actor-2 executed WorkForPay and was rejected
  const resolvedWorkDay2 = bundleDay2.eventLog.find(
    (e) => e.type === 'MotivationDecisionResolved' && e.tick === 288 && e.payload.actorId === 'actor-2'
  );
  assert.ok(resolvedWorkDay2);
  assert.equal(resolvedWorkDay2.payload.status, 'rejected');
  assert.equal(resolvedWorkDay2.payload.code, 'RULE_REJECTED');
  assert.deepEqual(resolvedWorkDay2.payload.failureOwner, { planId: 2, goalId: null });

  // Observed event emitted
  const observedDay2 = bundleDay2.eventLog.find(
    (e) => e.type === 'ExperienceWorkObserved' && e.tick === 288 && e.payload.actorId === 'actor-2'
  );
  assert.ok(observedDay2);
  assert.equal(observedDay2.payload.sourceEventSeq, resolvedWorkDay2.eventSeq);
  assert.equal(observedDay2.payload.experienceView.penaltyPermille, 100);
  assert.equal(observedDay2.payload.experienceView.failureCount, 1);
  assert.equal(observedDay2.payload.experienceView.sampleCount, 1);

  // Verify health goal failure count remains 0 (temporary failure didn't penalize health goal)
  const actor2Entry = bundleDay2.snapshot.world.motivationModel.actors.find((a) => a.actorId === 'actor-2');
  const actor2Agent = bundleDay2.snapshot.world.societyModel.agents.find((a) => a.state.actorId === 'actor-2').state;
  assert.equal(actor2Agent.currentGoal.failures, 0);

  // Advance to tick 432 (day 3 decision and execution)
  sessionAfterSell.advanceTicks(144);
  const bundleDay3 = sessionAfterSell.getBundle();

  // Verify day 3 choice under useWorkExperience: true
  const plannedDay3 = bundleDay3.eventLog.find(
    (e) => e.type === 'MotivationDecisionPlanned' && e.tick === 432 && e.payload.actorId === 'actor-2'
  );
  assert.ok(plannedDay3);
  const workCandidate = plannedDay3.payload.candidates.find((c) => c.action === 'WorkForPay');
  const useMedCandidate = plannedDay3.payload.candidates.find((c) => c.action === 'UseMedicine');
  assert.equal(workCandidate.opposition, 290); // base opposition 190 + 100 penalty
  assert.equal(workCandidate.score, 610); // 900 support - 290 opposition
  assert.equal(useMedCandidate.score, 700);
  assert.equal(plannedDay3.payload.choice, 'UseMedicine'); // chosen UseMedicine because 700 > 610

  // Verify full bundle replay validity
  validateBundle(bundleDay3, { rulesVersion: EXPERIENCE_RULES, systems: systemsTrue });

  // 2. Run false scenario (useWorkExperience: false)
  const { bundle: bundleFalse, systems: systemsFalse } = createExperienceVillage(42, 'exp-e2-false', buildE2Config(false));
  const sessionFalse = createSimulationSession(bundleFalse, systemsFalse);
  sessionFalse.advanceTicks(144);
  const sellResultFalse = executeExperiencePlayerIntent(sessionFalse.getBundle(), sellIntent);
  const sessionFalseAfterSell = createSimulationSession(sellResultFalse.bundle, systemsFalse);
  sessionFalseAfterSell.advanceTicks(143);

  // Day 2 check: sample is STILL recorded and event is STILL emitted
  const bundleFalseDay2 = sessionFalseAfterSell.getBundle();
  const observedFalseDay2 = bundleFalseDay2.eventLog.find(
    (e) => e.type === 'ExperienceWorkObserved' && e.tick === 288 && e.payload.actorId === 'actor-2'
  );
  assert.ok(observedFalseDay2);
  assert.equal(observedFalseDay2.payload.experienceView.penaltyPermille, 100);

  // Advance to day 3
  sessionFalseAfterSell.advanceTicks(144);
  const bundleFalseDay3 = sessionFalseAfterSell.getBundle();

  const plannedFalseDay3 = bundleFalseDay3.eventLog.find(
    (e) => e.type === 'MotivationDecisionPlanned' && e.tick === 432 && e.payload.actorId === 'actor-2'
  );
  assert.ok(plannedFalseDay3);
  const workCandidateFalse = plannedFalseDay3.payload.candidates.find((c) => c.action === 'WorkForPay');
  assert.equal(workCandidateFalse.opposition, 190); // unpenalized base opposition
  assert.equal(workCandidateFalse.score, 710); // 900 - 190
  assert.equal(plannedFalseDay3.payload.choice, 'WorkForPay'); // chooses WorkForPay because 710 > 700

  // Validate divergence
  assert.notEqual(plannedDay3.payload.choice, plannedFalseDay3.payload.choice);
  validateBundle(bundleFalseDay3, { rulesVersion: EXPERIENCE_RULES, systems: systemsFalse });
});

test('E3: 连续成功修正窗口 (rich 10-day recipe and penalty sequence)', async () => {
  // Default profile day 2 Work succeeds
  const { bundle: defaultBundle, systems: defaultSystems } = createExperienceVillage(42, 'exp-e3-default');
  const defaultSession = createSimulationSession(defaultBundle, defaultSystems);
  defaultSession.advanceTicks(288);
  const day2Bundle = defaultSession.getBundle();
  const observedDay2 = day2Bundle.eventLog.find(
    (e) => e.type === 'ExperienceWorkObserved' && e.tick === 288 && e.payload.actorId === 'actor-2'
  );
  assert.ok(observedDay2);
  assert.equal(observedDay2.payload.experienceView.sampleCount, 1);
  assert.equal(observedDay2.payload.experienceView.failureCount, 0);
  assert.equal(observedDay2.payload.experienceView.penaltyPermille, 0);

  // Rich 10-day recipe: actor-2 dutyWeight=1000/risk=0, gold=20000
  const richConfig = defaultExperienceVillageConfig();
  const profile2 = richConfig.motivation.profiles.find((p) => p.actorId === 'actor-2');
  profile2.dutyWeightPermille = 1000;
  profile2.riskAversionPermille = 0;
  richConfig.memory.society.actors.market.ecology.resources.resources.gold.initial = 20000;

  richConfig.motivation.requests = [];
  for (let day = 1; day <= 10; day++) {
    richConfig.motivation.requests.push({
      requestId: `rich-req-${day}`,
      tick: 56 + (day - 1) * 144,
      expiresTick: (day + 1) * 144,
      urgencyPermille: 1000,
      speakerId: 'actor-1',
      listenerId: 'actor-2',
    });
  }

  const { bundle: richBundle, systems: richSystems } = createExperienceVillage(42, 'exp-e3-rich', richConfig);
  const richSession = createSimulationSession(richBundle, richSystems);
  richSession.advanceTicks(1440); // 10 days
  const finalRichBundle = richSession.getBundle();

  // Find all actor-2 ExperienceWorkObserved facts
  const observedEvents = finalRichBundle.eventLog.filter(
    (e) => e.type === 'ExperienceWorkObserved' && e.payload.actorId === 'actor-2'
  );
  assert.ok(observedEvents.length >= 5, `Expected at least 5 work observations, got ${observedEvents.length}`);

  // All successes
  const finalView = observedEvents[observedEvents.length - 1].payload.experienceView;
  assert.equal(finalView.failureCount, 0);
  assert.equal(finalView.penaltyPermille, 0);
  assert.ok(finalView.sampleCount <= 4);

  // Each observation has a unique 1:1 MotivationDecisionResolved cause
  const resolvedSeqs = observedEvents.map((e) => e.payload.sourceEventSeq);
  assert.equal(new Set(resolvedSeqs).size, observedEvents.length);

  validateBundle(finalRichBundle, { rulesVersion: EXPERIENCE_RULES, systems: richSystems });
});

test('E4: 因果、幂等和边界保护', async () => {
  const { bundle, systems } = createExperienceVillage(42, 'exp-e4-causal');
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(288);
  const currentBundle = session.getBundle();

  const adapterContext = {
    simulationId: currentBundle.snapshot.simulationId,
    rulesVersion: EXPERIENCE_RULES,
    eventLog: currentBundle.eventLog,
    commandReceipts: currentBundle.snapshot.commandReceipts,
  };

  // 1. Correct the original fixture: seq 1 is not Resolved. Contract §4 requires
  // damaged/non-Resolved links to throw; other-actor null requires a valid chain.
  assert.notEqual(currentBundle.eventLog.find((e) => e.eventSeq === 1)?.type, 'MotivationDecisionResolved');
  assert.throws(() => projectOwnWorkOutcome(adapterContext, 'actor-2', 1), { code: 'INVALID_INPUT' });

  // 2. actor-3 looking at actor-2's resolved event returns null
  const actor2Resolved = currentBundle.eventLog.find(
    (e) => e.type === 'MotivationDecisionResolved' && e.payload.actorId === 'actor-2' && e.tick === 288
  );
  assert.ok(actor2Resolved);
  // actor-1 (chief) and actor-4 (player) inspect the same real, valid Resolved.
  assert.equal(projectOwnWorkOutcome(adapterContext, 'actor-1', actor2Resolved.eventSeq), null);
  assert.equal(projectOwnWorkOutcome(adapterContext, 'actor-4', actor2Resolved.eventSeq), null);
  assert.equal(projectOwnWorkOutcome(adapterContext, 'actor-3', actor2Resolved.eventSeq), null);

  // 3. Non-WorkForPay action returns null
  const actor2BuyResolved = currentBundle.eventLog.find(
    (e) => e.type === 'MotivationDecisionResolved' && e.payload.actorId === 'actor-2' && e.tick === 144
  );
  assert.ok(actor2BuyResolved);
  assert.equal(projectOwnWorkOutcome(adapterContext, 'actor-2', actor2BuyResolved.eventSeq), null);

  // 4. Broken causation or tampered receipts throw INVALID_INPUT
  const tamperedContext = cloneData(adapterContext);
  delete tamperedContext.commandReceipts[actor2Resolved.commandId];
  assert.throws(
    () => projectOwnWorkOutcome(tamperedContext, 'actor-2', actor2Resolved.eventSeq),
    /Missing command receipt/
  );

  // 5. Idempotence: re-observing identical outcome returns { disposition: 'duplicate' }
  const state = currentBundle.snapshot.world.experienceModel.actors.find((a) => a.actorId === 'actor-2').workExperienceState;
  const outcome = projectOwnWorkOutcome(adapterContext, 'actor-2', actor2Resolved.eventSeq);
  assert.ok(outcome);
  const dupResult = observeWorkOutcome(state, outcome);
  assert.equal(dupResult.disposition, 'duplicate');

  // Conflicting outcome with same sourceEventSeq throws
  const conflictOutcome = { ...outcome, status: outcome.status === 'succeeded' ? 'rejected' : 'succeeded', code: 'RULE_REJECTED' };
  assert.throws(() => observeWorkOutcome(state, conflictOutcome), /Conflicting work experience outcome/);
});

test('E6: 全恢复历史篡改拒绝与完整重演防御', async () => {
  const { bundle, systems } = createExperienceVillage(42, 'exp-e6-tamper');
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(288);
  const validBundle = session.getBundle();

  // Baseline passes
  validateBundle(validBundle, { rulesVersion: EXPERIENCE_RULES, systems });

  // 1. Tamper sample penalty/status in snapshot experienceModel
  const tampered1 = cloneData(validBundle);
  tampered1.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].status = 'rejected';
  tampered1.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].code = 'RULE_REJECTED';
  assert.throws(
    () => validateBundle(tampered1, { rulesVersion: EXPERIENCE_RULES, systems }),
    /Experience final world\/identity\/assets mismatch/
  );

  // 2. Tamper ExperienceWorkObserved event payload in eventLog
  const tampered2 = cloneData(validBundle);
  const observedEvent = tampered2.eventLog.find((e) => e.type === 'ExperienceWorkObserved');
  assert.ok(observedEvent);
  observedEvent.payload.experienceView.penaltyPermille = 300; // illegal penalty for 0 failures
  assert.throws(
    () => validateBundle(tampered2, { rulesVersion: EXPERIENCE_RULES, systems }),
    /Penalty permille mismatch/
  );

  // 3. Tamper ExperienceWorkObserved causation
  const tampered3 = cloneData(validBundle);
  const obsEvent3 = tampered3.eventLog.find((e) => e.type === 'ExperienceWorkObserved');
  obsEvent3.causationEventSeqs = [obsEvent3.causationEventSeqs[0] - 1];
  assert.throws(
    () => validateBundle(tampered3, { rulesVersion: EXPERIENCE_RULES, systems }),
    /Observation sourceEventSeq mismatch with causationEventSeq/
  );

  // 4. Tamper config switch useWorkExperience
  const tampered4 = cloneData(validBundle);
  tampered4.snapshot.world.experienceModel.config.useWorkExperience = false;
  assert.throws(
    () => validateBundle(tampered4, { rulesVersion: EXPERIENCE_RULES, systems }),
    /Experience config fingerprint mismatch/
  );
});

function boundaryContext(bundle) {
  return { simulationId: bundle.snapshot.simulationId, rulesVersion: bundle.snapshot.rulesVersion,
    eventLog: bundle.eventLog, commandReceipts: bundle.snapshot.commandReceipts };
}

test('controller boundary: adapter verifies complete real chains before null', async (t) => {
  const fixture = createExperienceVillage(42, 'controller-boundary-regression');
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(288);
  const context = boundaryContext(session.getBundle());
  const work = context.eventLog.find(e => e.type === 'MotivationDecisionResolved' && e.tick === 288 && e.payload.actorId === 'actor-2');
  const nonWork = context.eventLog.find(e => e.type === 'MotivationDecisionResolved' && e.tick === 144 && e.payload.actorId === 'actor-2');
  const resolved = c => c.eventLog.find(e => e.eventSeq === work.eventSeq);
  const planned = c => c.eventLog.find(e => e.eventSeq === work.causationEventSeqs[0]);
  const receipt = c => c.commandReceipts[work.commandId];
  const committed = c => c.eventLog.find(e => e.eventSeq === receipt(c).eventSeqs[0]);
  assert.equal(projectOwnWorkOutcome(context, 'actor-2', work.eventSeq).status, 'succeeded');
  assert.equal(projectOwnWorkOutcome(context, 'actor-3', work.eventSeq), null);
  assert.equal(projectOwnWorkOutcome(context, 'actor-1', work.eventSeq), null);
  assert.equal(projectOwnWorkOutcome(context, 'actor-2', nonWork.eventSeq), null);
  const mutations = [
    ['target tick', c => receipt(c).input.targetTick++],
    ['resolved payload command', c => resolved(c).payload.commandId = 'forged-command'],
    ...['wallet', 'herbs', 'health', 'fatigue'].map(key => ['delta ' + key, c => resolved(c).payload.delta[key]++]),
    ['public food', c => resolved(c).payload.publicFoodProduced++],
    ['price', c => resolved(c).payload.price = 1],
    ['planned event tick', c => planned(c).tick++],
    ['planned command', c => planned(c).commandId = work.commandId],
    ['other actor bad cause', c => resolved(c).causationEventSeqs = [999999], work.eventSeq, 'actor-3'],
    ['foreign query actor bad cause', c => resolved(c).causationEventSeqs = [999999], work.eventSeq, 'actor-1'],
    ['forged null work', c => { resolved(c).payload.commandId = null; resolved(c).commandId = null; }],
    ['non-work missing receipt', c => { delete c.commandReceipts[nonWork.commandId]; }, nonWork.eventSeq],
    ['non-work wrong delta', c => c.eventLog.find(e => e.eventSeq === nonWork.eventSeq).payload.delta.herbs++ , nonWork.eventSeq],
    ['context extra key', c => c.extra = true],
    ['complete receipt result', c => receipt(c).result.extra = true],
    ['committed source', c => committed(c).sourceSystem = 'forged'],
    ['committed schema', c => committed(c).schemaVersion = 999],
    ['committed entities', c => committed(c).entityIds.push('actor-3')],
    ['duplicate committed', c => { const e = structuredClone(committed(c)); e.eventSeq = c.eventLog.at(-1).eventSeq + 1; c.eventLog.push(e); }],
    ['duplicate resolved', c => { const e = structuredClone(resolved(c)); e.eventSeq = c.eventLog.at(-1).eventSeq + 1; c.eventLog.push(e); }],
    ['duplicate planned decision', c => { const e = structuredClone(planned(c)); e.eventSeq = c.eventLog.at(-1).eventSeq + 1; c.eventLog.push(e); }],
    ['resolved sequence absent', () => {}, 999999],
    ['resolved wrong type', c => resolved(c).type = 'SocietyDaySettled'],
  ];
  for (const [name, mutate, seq = work.eventSeq, actor = 'actor-2'] of mutations) await t.test(name, () => {
    const bad = structuredClone(context); mutate(bad);
    assert.throws(() => projectOwnWorkOutcome(bad, actor, seq), { code: 'INVALID_INPUT' });
  });
  await t.test('unknown adapter rules', () => {
    const bad = structuredClone(context); bad.rulesVersion = 'unknown-rules';
    assert.throws(() => projectOwnWorkOutcome(bad, 'actor-2', work.eventSeq), { code: 'UNSUPPORTED_VERSION' });
  });
});

test('controller boundary: legitimate NoAction is checked and has no receipt', () => {
  const config = defaultExperienceVillageConfig();
  for (const actor of config.memory.society.actors.initialActors) { actor.health = 1000; actor.fatigue = 0; }
  config.motivation.requests = [];
  const fixture = createExperienceVillage(42, 'controller-noaction', config);
  const session = createSimulationSession(fixture.bundle, fixture.systems); session.advanceTicks(144);
  const context = boundaryContext(session.getBundle());
  const event = context.eventLog.find(e => e.type === 'MotivationDecisionResolved');
  assert.equal(event.payload.status, 'no-action');
  assert.equal(projectOwnWorkOutcome(context, event.payload.actorId, event.eventSeq), null);
  for (const mutate of [
    c => c.eventLog.find(e => e.eventSeq === event.eventSeq).causationEventSeqs = [999999],
    c => c.eventLog.find(e => e.eventSeq === event.eventSeq).payload.delta.health++,
    c => c.commandReceipts[event.payload.decisionId] = { forged: true },
  ]) {
    const bad = structuredClone(context); mutate(bad);
    assert.throws(() => projectOwnWorkOutcome(bad, event.payload.actorId, event.eventSeq), { code: 'INVALID_INPUT' });
  }
});

test('controller boundary: public experience entries reject inherited map without executing getters', async (t) => {
  const fixture = createExperienceVillage(42, 'controller-descriptors');
  const session = createSimulationSession(fixture.bundle, fixture.systems); session.advanceTicks(144);
  const historical = session.getBundle();
  let calls = 0;
  const inheritedMap = array => {
    const prototype = Object.create(Array.prototype);
    Object.defineProperty(prototype, 'map', { get() { calls++; return Array.prototype.map; } });
    Object.setPrototypeOf(array, prototype); return array;
  };
  const raw = { commandId: 'controller-probe', targetTick: 1, type: 'PlayerAction', payload: { startTick: 0, intent: { type: 'PlayerRest', payload: {} } } };
  const entryPoints = [
    ['cloneBundle eventLog', b => inheritedMap(b.eventLog), b => cloneBundle(b)],
    ['lookupCommand eventLog', b => inheritedMap(b.eventLog), b => lookupCommand(b, raw)],
    ['lookupCommand raw payload', () => {}, b => { const input = structuredClone(raw); input.payload.extra = inheritedMap([]); return lookupCommand(b, input); }],
    ['validateEventLog eventLog', b => inheritedMap(b.eventLog), b => validateEventLog(b.eventLog, b.snapshot, fixture.systems)],
    ['validateEventLog pending', b => inheritedMap(b.snapshot.pendingCommands), b => validateEventLog(b.eventLog, b.snapshot, fixture.systems)],
    ['validateEventLog receipts', b => b.snapshot.commandReceipts.extra = { data: inheritedMap([]) }, b => validateEventLog(b.eventLog, b.snapshot, fixture.systems)],
    ['validateSnapshotStructure pending', b => inheritedMap(b.snapshot.pendingCommands), b => validateSnapshotStructure(b.snapshot, { rulesVersion: EXPERIENCE_RULES, systems: fixture.systems }, 0)],
    ['advanceOneTick eventLog', b => inheritedMap(b.eventLog), b => advanceOneTick(b, fixture.systems)],
    ['createSimulationSession eventLog', b => inheritedMap(b.eventLog), b => createSimulationSession(b, fixture.systems)],
  ];
  for (const [name, mutate, run] of entryPoints) await t.test(name, () => {
    const b = structuredClone(fixture.bundle); calls = 0; mutate(b);
    assert.throws(() => run(b), e => e.code === 'INVALID_INPUT' || (e.code === 'TICK_FAILED' && e.cause?.code === 'INVALID_INPUT'));
    assert.equal(calls, 0);
  });
  await t.test('validateFact', () => {
    const fact = structuredClone(historical.eventLog.find(e => e.type === 'SocietyDaySettled'));
    delete fact.eventSeq; delete fact.tick; delete fact.schemaVersion; calls = 0; inheritedMap(fact.causationEventSeqs);
    assert.throws(() => validateFact(fact, 'society', EXPERIENCE_RULES), { code: 'INVALID_INPUT' }); assert.equal(calls, 0);
  });
  await t.test('createInitialBundle commands', () => {
    const b = structuredClone(fixture.bundle); calls = 0;
    const config = { rulesVersion: EXPERIENCE_RULES, simulationId: b.snapshot.simulationId, fixtureId: 'experience-village', fixtureVersion: '1', seed: 42,
      world: b.snapshot.world, commands: inheritedMap([]), scheduledTasks: b.snapshot.scheduledTasks };
    assert.throws(() => createInitialBundle(config, fixture.systems), { code: 'INVALID_INPUT' }); assert.equal(calls, 0);
  });
  for (const entry of ['cloneBundle', 'lookupCommand', 'validateEventLog', 'createInitialBundle']) await t.test(entry + ' rules getter', () => {
    calls = 0; const b = structuredClone(fixture.bundle);
    const target = entry === 'createInitialBundle' ? { rulesVersion: EXPERIENCE_RULES } : b.snapshot;
    Object.defineProperty(target, 'rulesVersion', { enumerable: true, get() { calls++; return EXPERIENCE_RULES; } });
    assert.throws(() => entry === 'cloneBundle' ? cloneBundle(b) : entry === 'lookupCommand' ? lookupCommand(b, raw) :
      entry === 'validateEventLog' ? validateEventLog(b.eventLog, b.snapshot, fixture.systems) : createInitialBundle(target, fixture.systems), { code: 'INVALID_INPUT' });
    assert.equal(calls, 0);
  });
});

test('controller boundary: pending commands cannot claim mind-settle namespace', () => {
  const fixture = createExperienceVillage(42, 'controller-pending-prefix');
  const bad = structuredClone(fixture.bundle);
  bad.snapshot.pendingCommands.push({ commandId: 'mind-settle-controller', inputSeq: 1, targetTick: 6, type: 'PlayerAction',
    payload: { startTick: 0, intent: { type: 'PlayerRest', payload: {} } } });
  bad.snapshot.nextInputSeq = 2;
  assert.throws(() => validateSnapshotStructure(bad.snapshot, { rulesVersion: EXPERIENCE_RULES, systems: fixture.systems }, 0), { code: 'INVALID_INPUT' });
});
