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

  // 1. Other actors: actor-1 (chief) or actor-4 (player) return null
  assert.equal(projectOwnWorkOutcome(adapterContext, 'actor-2', 1), null);

  // 2. actor-3 looking at actor-2's resolved event returns null
  const actor2Resolved = currentBundle.eventLog.find(
    (e) => e.type === 'MotivationDecisionResolved' && e.payload.actorId === 'actor-2' && e.tick === 288
  );
  assert.ok(actor2Resolved);
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
