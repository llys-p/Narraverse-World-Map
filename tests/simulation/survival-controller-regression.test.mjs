// Narrow controller regressions for the M4A boundary failures found in the original A tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMindBelief, observationExpiryTick } from '../../runtime/core/mind-state.mjs';
import { createWorkExperienceState, deriveWorkExperience } from '../../runtime/core/work-experience.mjs';
import { SURVIVAL_KNOWLEDGE_VERSION, SURVIVAL_FOOD_PLAN_KIND } from '../../runtime/core/survival-state.mjs';
import { createSurvivalVillage, defaultSurvivalVillageConfig } from '../../runtime/fixtures/survival-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { executeSurvivalPlayerIntent } from '../../runtime/core/motivation-runtime.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { validateCognitionKnowledge } from '../../runtime/core/motivation-planner.mjs';
import { planSurvivalDecision, continueSurvivalPlan } from '../../runtime/core/survival-planner.mjs';

const SIM = 'survival-village';
const ACTOR = 'actor-2';
const DAY = 144;
const observations = [{ sourceEventSeq: 3, occurrenceTick: 12, observedTick: 12, channel: 'market-check',
  sourceActorId: null, available: true, confidencePermille: 900, expiresTick: observationExpiryTick(12) }];
const quote = { product: 'food', price: 10, available: true, observedTick: 1, expiresTick: 289, sourceEventSeq: 2 };
const duty = { requestId: 's-food-01', sourceEventSeq: 12, observedTick: 100, expiresTick: 200,
  urgencyPermille: 1000, status: 'pending', fulfilledTick: null };
const offer = { requestId: 's-food-01', wage: 20, observedTick: 100, expiresTick: 200, sourceEventSeq: 9 };
function knowledge(over = {}) {
  const tick = over.tick ?? DAY;
  const ownObservations = structuredClone(over.observations ?? observations);
  return {
    knowledgeVersion: SURVIVAL_KNOWLEDGE_VERSION, phase: 'decision', simulationId: SIM, actorId: ACTOR,
    tick, revision: tick - 1,
    self: { name: 'Hunter', occupation: 'hunter', location: 'village', alive: true, health: 1000,
      hunger: 200, fatigue: 0, wallet: 0, inventory: { food: 0, herbs: 0 }, currentGoal: null,
      nextGoalId: 1, cooldownUntilDay: 0, ...structuredClone(over.self ?? {}) },
    quote: { product: 'herbs', price: 50, observedTick: 0, sourceEventSeq: null },
    observations: ownObservations, belief: deriveMindBelief(ownObservations, tick),
    profile: { dutyWeightPermille: 900, riskAversionPermille: 200 },
    duty: over.duty === undefined ? structuredClone(duty) : structuredClone(over.duty),
    planState: { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null,
      ...structuredClone(over.planState ?? {}) },
    experience: deriveWorkExperience(createWorkExperienceState(SIM, ACTOR)), useWorkExperience: true,
    foodQuote: over.foodQuote === undefined ? structuredClone(quote) : structuredClone(over.foodQuote),
    workOffer: over.workOffer === undefined ? structuredClone(offer) : structuredClone(over.workOffer),
  };
}
const context = { evaluationEventSeq: 30, sourceReviewDecisionId: null, sourceReviewEventSeq: null };

test('public purse affordability is not a planner input or an extra Knowledge field', () => {
  const input = knowledge();
  const expected = planSurvivalDecision(input, context);
  assert.equal(expected.decision.reasonCode, 'FOOD_INCOME');
  assert.equal(expected.activePlan.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.throws(() => planSurvivalDecision({ ...input, publicCanPayWage: false }, context),
    error => error?.code === 'INVALID_INPUT');
});

test('a new health concern creates its recover-health goal and plan', () => {
  const input = knowledge({ foodQuote: null, workOffer: null, duty: null,
    self: { health: 650, wallet: 50, inventory: { food: 2, herbs: 0 }, currentGoal: null } });
  const planned = planSurvivalDecision(input, context);
  assert.ok(planned.currentGoal, 'a new health concern must acquire a goal before choosing medicine');
  assert.equal(planned.currentGoal.kind, 'recover-health');
  assert.equal(planned.activePlan.kind, 'recover-health');
  assert.equal(planned.decision.choice, 'BuyMedicine');
});


test('the same local observation can precede a real last-ration race and one refusal', () => {
  const config = defaultSurvivalVillageConfig('affordable');
  config.memory.society.estates[0].initialFood = 0;
  config.memory.society.estates[0].initialWallet = 10;
  config.memory.society.actors.initialActors[0].hunger = 400;
  config.memory.society.actors.market.ecology.resources.resources.food.initial = 41;
  const fixture = createSurvivalVillage(42, SIM, config);
  assert.equal(fixture.bundle.snapshot.world.resources.food, 1);
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(DAY);
  const bundle = session.getBundle(), world = bundle.snapshot.world;
  const chief = world.societyModel.agents.find(a => a.state.actorId === 'actor-1').state;
  const own = world.societyModel.agents.find(a => a.state.actorId === ACTOR).state;
  const entry = world.motivationModel.actors.find(a => a.actorId === ACTOR);
  const seen = JSON.parse(entry.lastDecision.knowledgeFingerprint).foodQuote;
  assert.equal(seen.observedTick, DAY);
  assert.equal(seen.available, true);
  assert.equal(chief.ledger.foodBought, 1, 'chief legally acquired the last ration after the observation');
  assert.equal(entry.lastDecision.choice, 'BuyFood');
  assert.equal(entry.lastOutcome.status, 'rejected');
  assert.deepEqual(entry.lastOutcome.failureOwner, { planId: entry.activePlan.planId, goalId: null });
  assert.equal(own.ledger.failedActions, 1);
  assert.equal(own.lastActionDay, 1);
  assert.equal(own.wallet, 30);
  assert.equal(own.ledger.foodBought, 0);
  assert.equal(own.ledger.foodUsed, 0);
  assert.equal(world.experienceModel.actors.find(a => a.actorId === ACTOR).workExperienceState.samples.length, 0);
  const quoteFact = bundle.eventLog.find(e => e.eventSeq === seen.sourceEventSeq);
  const chiefFact = bundle.eventLog.find(e => e.type === 'SocietyActionCommitted' && e.commandId === 'society-day-1-actor-1');
  assert.ok(quoteFact.eventSeq < chiefFact.eventSeq);
  validateBundle(bundle, { rulesVersion: bundle.snapshot.rulesVersion, systems: fixture.systems });
});

test('maintain cancels an expired food plan before choosing its old step', () => {
  const plan = { planId: 1, goalId: null, kind: 'secure-food', steps: ['BuyFood'], stepIndex: 0,
    status: 'ready', createdDay: 1, deadlineDay: 4, requestId: null };
  const input = knowledge({ tick: 720, self: { wallet: 30 }, duty: null, workOffer: null,
    foodQuote: { ...quote, observedTick: 720, expiresTick: 1008 },
    planState: { activePlan: plan, nextPlanId: 2 } });
  const result = continueSurvivalPlan(input, { evaluationEventSeq: 30,
    sourceReviewDecisionId: 'survival-day-1-actor-2', sourceReviewEventSeq: 20 });
  assert.equal(result.decision.choice, 'NoAction');
  assert.equal(result.activePlan, null);
  assert.deepEqual(result.transitions, [{ planId: 1, kind: 'secure-food', fromStatus: 'ready',
    toStatus: 'cancelled', reasonCode: 'DEADLINE_EXPIRED' }]);
});

test('the old cognition validator rejects the new survival Knowledge variant', () => {
  assert.throws(() => validateCognitionKnowledge(knowledge()), error =>
    ['INVALID_INPUT', 'UNSUPPORTED_VERSION'].includes(error?.code));
});

test('a real food-work refusal preserves the previously created health goal', () => {
  const config = defaultSurvivalVillageConfig('affordable');
  config.memory.society.estates[1].initialFood = 2;
  config.memory.society.estates[1].initialWallet = 50;
  config.memory.society.actors.initialActors[1].health = 650;
  config.memory.society.player.initialHerbs = 2;
  config.memory.society.actors.market.ecology.resources.resources.gold.initial = 50;
  config.mind.stimuli = [{ stimulusId: 'health-market', tick: 12, kind: 'market-check', listenerId: ACTOR }];
  config.motivation.requests = [{ requestId: 'health-food-work', tick: 200, speakerId: 'actor-1', listenerId: ACTOR, urgencyPermille: 1000, expiresTick: 400 }];
  const fixture = createSurvivalVillage(42, SIM, config);
  let session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(DAY);
  let bundle = session.getBundle();
  const own = b => b.snapshot.world.societyModel.agents.find(a => a.state.actorId === ACTOR).state;
  const entry = b => b.snapshot.world.motivationModel.actors.find(a => a.actorId === ACTOR);
  assert.equal(entry(bundle).lastDecision.choice, 'BuyMedicine');
  const goal = structuredClone(own(bundle).currentGoal), healthPlan = structuredClone(entry(bundle).activePlan);
  assert.equal(bundle.snapshot.world.resources.gold, 50);
  for (let i=0;i<2;i++) { const result = executeSurvivalPlayerIntent(bundle, { commandId: 'health-drain-'+i, type: 'PlayerSell', payload: { product: 'herbs', quantity: 1 } }); assert.equal(result.outcome, 'succeeded', JSON.stringify(result.result)); bundle = result.bundle; }
  const worldAfterTrades = bundle.snapshot.world;
  assert.equal(worldAfterTrades.resources.gold - worldAfterTrades.playerModel.wallet -
    worldAfterTrades.societyModel.agents.reduce((sum, a) => sum + a.state.wallet, 0), 0);
  session = createSimulationSession(bundle, fixture.systems);
  session.advanceTicks(288-bundle.snapshot.tick);
  bundle = session.getBundle();
  assert.equal(entry(bundle).lastDecision.choice, 'WorkForPay');
  assert.equal(entry(bundle).lastOutcome.status, 'rejected');
  assert.equal(entry(bundle).activePlan.kind, 'secure-food');
  assert.equal(entry(bundle).suspendedPlan.planId, healthPlan.planId);
  assert.equal(own(bundle).currentGoal.goalId, goal.goalId);
  assert.equal(own(bundle).currentGoal.failures, goal.failures);
  assert.equal(own(bundle).ledger.failedActions, 1);
  assert.deepEqual(entry(bundle).lastOutcome.failureOwner, { planId: entry(bundle).activePlan.planId, goalId: null });
});
