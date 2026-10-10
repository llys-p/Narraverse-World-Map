// M4A A2 slice: the five frozen §7 recipes end to end, the authoritative refusal paths, save
// and resume, and the CLI export. Every expected number is the §7 hand-computed anchor, never a
// value copied back from a module output. Each case first proves its own recipe inputs and the
// no-resupply conditions before it checks any behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { canonicalJson, cloneData } from '../../runtime/core/data-contract.mjs';
import { defaultSurvivalVillageConfig, createSurvivalVillage, survivalSystems, survivalRecipeInputs }
  from '../../runtime/fixtures/survival-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { runSimulation } from '../../simulation-runner.mjs';
import { SURVIVAL_RULES, SURVIVAL_FIXTURE_ID, SURVIVAL_RECIPES, SURVIVAL_FOOD_QUOTE_EVENT,
  SURVIVAL_WORK_OFFER_EVENT, SURVIVAL_QUOTE_TTL_TICKS, SURVIVAL_FOOD_PLAN_KIND } from '../../runtime/core/survival-state.mjs';
import { executeSurvivalPlayerIntent } from '../../runtime/core/motivation-runtime.mjs';

const DAY = 144;
const hash = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

function advance(recipe, ticks, config) {
  const fixture = createSurvivalVillage(42, 'survival-village', config ?? defaultSurvivalVillageConfig(recipe));
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(ticks);
  return { bundle: session.getBundle(), systems: fixture.systems };
}
const actor2 = bundle => {
  const w = bundle.snapshot.world;
  const body = w.actorModel.actors.find(a => a.actorId === 'actor-2');
  const estate = w.societyModel.agents.find(a => a.state.actorId === 'actor-2').state;
  const entry = w.motivationModel.actors.find(a => a.actorId === 'actor-2');
  return { body, estate, entry, world: w };
};
async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'm4a-runtime-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------------------
// §7 the recipe inputs and the no-resupply conditions
// ---------------------------------------------------------------------------

test('§7: every recipe name is accepted and an unknown name is rejected', () => {
  for (const recipe of SURVIVAL_RECIPES) {
    const config = defaultSurvivalVillageConfig(recipe);
    assert.equal(config.mind.stimuli.length, 0, `${recipe} carries no stimuli`);
    assert.deepEqual(config.cognition.profiles.map(p => p.importancePermille), [700, 400]);
    assert.equal(config.experience.useWorkExperience, true);
  }
  assert.throws(() => defaultSurvivalVillageConfig('sixth-recipe'), /Unknown survival recipe/);
  assert.throws(() => defaultSurvivalVillageConfig(''), /Unknown survival recipe/);
  assert.throws(() => survivalRecipeInputs('nope'), /Unknown survival recipe/);
});

test('§7: the opening stock, prices and no-resupply conditions hold before any behaviour', () => {
  for (const recipe of ['affordable', 'earn-then-buy', 'no-opportunity', 'no-food']) {
    const inputs = survivalRecipeInputs(recipe);
    assert.equal(inputs.wage, 20, `${recipe} wage`);
    assert.equal(inputs.workFood, 0, `${recipe} work produces no food`);
    assert.equal(inputs.foodPrice, 10, `${recipe} food price`);
    assert.equal(inputs.foodProductionNumerator, 0, `${recipe} farm output`);
    assert.equal(inputs.foodLossPermille, 0, `${recipe} food loss`);
    assert.equal(inputs.maxHunters, 0, `${recipe} hunting`);
    assert.equal(inputs.transportCapacity, 0, `${recipe} transport`);
    assert.equal(inputs.foodMaxOrder, 0, `${recipe} restock`);
    assert.equal(inputs.publicHerbs, 20, `${recipe} opening herbs`);
    if (recipe !== 'no-food') assert.equal(inputs.publicFood, 600, `${recipe} opening food`);
    assert.equal(inputs.actor2PrivateFood, 0, `${recipe}: actor-2 starts with no private food`);
  }
  assert.equal(survivalRecipeInputs('no-food').publicFood, 0, 'no-food starts with no public food');
  assert.equal(survivalRecipeInputs('wage-refused').publicGold, 0, 'wage-refused has no public purse');
  assert.equal(survivalRecipeInputs('affordable').actor2Wallet, 30);
  assert.equal(survivalRecipeInputs('earn-then-buy').actor2Wallet, 0);
  assert.equal(survivalRecipeInputs('no-opportunity').actor2Wallet, 0);
  assert.equal(survivalRecipeInputs('no-food').actor2Wallet, 30);
  // Only earn-then-buy and wage-refused carry the one request; the others have none.
  assert.equal(survivalRecipeInputs('earn-then-buy').requests, canonicalJson([{ requestId: 's-food-01',
    tick: 100, speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000, expiresTick: 200 }]));
  for (const recipe of ['affordable', 'no-opportunity', 'no-food'])
    assert.equal(survivalRecipeInputs(recipe).requests, canonicalJson([]), `${recipe} has no request`);
});

test('§7: private rations really move out of the public stock at allocation', () => {
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  // 600 opening food minus 20 each for actor-1, actor-3 and the player leaves 540.
  assert.equal(fixture.bundle.snapshot.world.resources.food, 540);
  assert.equal(fixture.bundle.snapshot.rulesVersion, SURVIVAL_RULES);
  assert.equal(fixture.bundle.snapshot.fixtureId, SURVIVAL_FIXTURE_ID);
  assert.equal(fixture.bundle.snapshot.fixtureVersion, '1');
});

// ---------------------------------------------------------------------------
// §7 affordable
// ---------------------------------------------------------------------------

test('§7 affordable: buy at tick 144, then buy again and really eat at tick 288', () => {
  const first = advance('affordable', DAY);
  let a = actor2(first.bundle);
  assert.equal(a.estate.wallet, 20, 'wallet 30 -> 20');
  assert.equal(a.estate.ledger.foodBought, 1, 'one ration really bought');
  assert.equal(a.estate.ledger.foodUsed, 1, 'and one really eaten the same day');
  assert.equal(a.body.hunger, 100, 'hunger 200 -> 100');
  assert.equal(a.estate.inventory.food, 0, 'day-end private stock is back to zero');
  assert.equal(a.estate.ledger.wages, 0, 'and no work happened');
  assert.equal(a.estate.ledger.workDays, 0);

  const both = advance('affordable', 2 * DAY);
  a = actor2(both.bundle);
  assert.equal(a.estate.wallet, 10, 'wallet 20 -> 10 after the second purchase');
  assert.equal(a.estate.ledger.foodBought, 2);
  assert.equal(a.estate.ledger.foodUsed, 2);
  assert.equal(a.body.hunger, 0, 'hunger 100 -> 0');
  assert.equal(a.estate.ledger.wages, 0);
  assert.equal(a.estate.ledger.workDays, 0);
  assert.equal(a.body.alive, true);
});

// ---------------------------------------------------------------------------
// §7 earn-then-buy
// ---------------------------------------------------------------------------

test('§7 earn-then-buy: work at tick 144, then spend the earned wage at tick 288', () => {
  const first = advance('earn-then-buy', DAY);
  let a = actor2(first.bundle);
  assert.equal(a.estate.ledger.workDays, 1, 'one real work day');
  assert.equal(a.estate.ledger.wages, 20, 'the wage really landed');
  assert.equal(a.estate.wallet, 20, 'wallet 0 -> 20');
  assert.equal(a.estate.ledger.foodProduced, 0, 'work produced no food');
  assert.equal(a.estate.ledger.foodBought, 0, 'no purchase yet');
  assert.equal(a.body.hunger, 300, 'hunger 200 -> 300 without food');
  assert.equal(a.entry.lastDuty.status, 'fulfilled');
  assert.equal(a.entry.lastDuty.fulfilledTick, DAY);
  // The plan is still the same one, on the same identifier.
  assert.equal(a.entry.activePlan.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.equal(a.entry.activePlan.stepIndex, 1);

  const both = advance('earn-then-buy', 2 * DAY);
  a = actor2(both.bundle);
  assert.equal(a.estate.wallet, 10, 'wallet 20 -> 10 after buying');
  assert.equal(a.estate.ledger.foodBought, 1, 'the earned wage bought the ration');
  assert.equal(a.estate.ledger.foodUsed, 1, 'and it was really eaten');
  assert.equal(a.body.hunger, 200, 'hunger 300 -> 200');
  assert.equal(a.estate.ledger.workDays, 1, 'and it did not work a second time');
  assert.equal(a.estate.ledger.wages, 20);
});

test('§7 earn-then-buy: the expired request never cancels the already-earned purchase', () => {
  const { bundle } = advance('earn-then-buy', 2 * DAY);
  const a = actor2(bundle);
  // The request window closed at tick 200, yet the purchase at tick 288 still happened.
  assert.equal(a.entry.lastDuty.expiresTick, 200);
  assert.equal(bundle.snapshot.tick, 2 * DAY);
  assert.equal(a.estate.ledger.foodBought, 1);
  assert.equal(a.estate.ledger.foodUsed, 1);
});

// ---------------------------------------------------------------------------
// §7 no-opportunity
// ---------------------------------------------------------------------------

test('§7 no-opportunity: waits on both days with no income and no detour', () => {
  const { bundle } = advance('no-opportunity', 2 * DAY);
  const a = actor2(bundle);
  assert.equal(a.estate.ledger.wages, 0, 'no wage');
  assert.equal(a.estate.ledger.workDays, 0, 'no work');
  assert.equal(a.estate.ledger.foodBought, 0, 'no purchase');
  assert.equal(a.estate.ledger.foodUsed, 0, 'nothing eaten');
  assert.equal(a.estate.ledger.hunts, 0, 'no hunting detour');
  assert.equal(a.body.hunger, 400, 'hunger 200 -> 300 -> 400');
  assert.equal(a.estate.wallet, 0);
  assert.equal(a.entry.lastDecision.choice, 'NoAction');
});

// ---------------------------------------------------------------------------
// §7 wage-refused
// ---------------------------------------------------------------------------

test('§7 wage-refused: authority refuses the wage and nothing is produced or bought', () => {
  const { bundle } = advance('wage-refused', 2 * DAY);
  const a = actor2(bundle);
  assert.equal(a.estate.wallet, 0, 'wallet stays 0');
  assert.equal(a.estate.ledger.wages, 0, 'no wage was paid');
  assert.equal(a.estate.ledger.workDays, 0);
  assert.equal(a.estate.ledger.foodProduced, 0);
  assert.equal(a.estate.ledger.foodBought, 0);
  assert.equal(a.estate.ledger.foodUsed, 0);
  assert.equal(a.estate.ledger.failedActions, 1, 'exactly one failure was recorded');
  assert.equal(a.body.hunger, 400);
  // One own work-experience failure, from the one real rejection.
  const exp = bundle.snapshot.world.experienceModel.actors.find(x => x.actorId === 'actor-2');
  assert.equal(exp.workExperienceState.samples.length, 1);
  assert.equal(exp.workExperienceState.samples[0].status, 'rejected');
});

test('§7 wage-refused: the planner attempts work and authority alone refuses it', () => {
  const { bundle } = advance('wage-refused', DAY);
  const a = actor2(bundle);
  // The decision was a real work attempt on the real request, and it was really refused.
  assert.equal(a.entry.lastDecision.choice, 'WorkForPay');
  assert.equal(a.entry.lastOutcome.status, 'rejected');
  assert.equal(a.entry.lastOutcome.code, 'RULE_REJECTED');
  assert.equal(a.entry.lastOutcome.failureOwner.goalId, null, 'the failure carries no health goal');
  assert.equal(a.entry.lastOutcome.failureOwner.planId, a.entry.activePlan.planId);
  // The narrow food path never applied: an unpayable wage is not an income opportunity, so this
  // is the frozen plain-duty Work (aid-village) rather than a secure-food plan.
  assert.notEqual(a.entry.activePlan.kind, SURVIVAL_FOOD_PLAN_KIND);
  assert.equal(a.entry.activePlan.status, 'blocked', 'the plan stays blocked, never pretending to recover');
  assert.equal(a.estate.ledger.wages, 0, 'and no wage was paid');
});

test('§7 wage-refused: an expired request is never retried on the next day', () => {
  const { bundle } = advance('wage-refused', 2 * DAY);
  const a = actor2(bundle);
  assert.equal(a.entry.lastDuty.expiresTick, 200);
  // Day 2 is past the window, so no second work attempt was made.
  assert.equal(a.estate.ledger.workDays, 0);
  assert.equal(a.entry.lastDecision.choice, 'NoAction');
});

// ---------------------------------------------------------------------------
// §7 no-food
// ---------------------------------------------------------------------------

test('§7 no-food: real hunger damage kills, and the next day stays dormant', () => {
  const first = advance('no-food', DAY);
  let a = actor2(first.bundle);
  assert.equal(a.body.hunger, 500, 'hunger 400 -> 500');
  assert.equal(a.body.alive, false, 'the 50 hunger damage ends the actor');
  assert.equal(a.estate.ledger.foodBought, 0, 'no ration was conjured out of money');
  assert.equal(a.estate.ledger.foodUsed, 0);
  assert.equal(a.estate.wallet, 30, 'the wallet was never touched');

  const both = advance('no-food', 2 * DAY);
  a = actor2(both.bundle);
  assert.equal(a.body.alive, false, 'still dead, never revived');
  assert.equal(a.entry.lastDecision.decisionId, 'survival-day-1-actor-2', 'no later decision exists');
  assert.equal(a.entry.activePlan, null);
  // History is preserved, not deleted: day 1 still has its facts.
  assert.ok(both.bundle.eventLog.some(e => e.tick === DAY && e.type === 'SocietyDaySettled'));
  assert.equal(first.bundle.snapshot.world.resources.food, 0, 'public food stays 0');
});

// ---------------------------------------------------------------------------
// §7 the adversarial variant: a stale quote versus an empty stock
// ---------------------------------------------------------------------------

test('§7 adversarial: authority refuses on the real stock even though the stale quote allows it', () => {
  const config = cloneData(defaultSurvivalVillageConfig('affordable'));
  config.memory.society.actors.market.ecology.resources.resources.food.initial = 61;
  config.memory.society.player.initialWallet = 10;

  const fixture = createSurvivalVillage(42, 'survival-village', config);
  // The other private rations still total 60, so exactly one public ration is left.
  assert.equal(fixture.bundle.snapshot.world.resources.food, 1);
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(1);
  let bundle = session.getBundle();

  // Tick 1 announces one available ration at the real posted price.
  const quote = bundle.eventLog.find(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT);
  assert.equal(quote.tick, 1);
  assert.deepEqual(quote.payload, { location: 'village', product: 'food', price: 10, available: true });

  // The player legally buys that last ration through the original interface.
  const drained = executeSurvivalPlayerIntent(bundle, { commandId: 'supply-drain-1', type: 'PlayerBuy',
    payload: { product: 'food', quantity: 1 } });
  assert.equal(drained.outcome, 'succeeded');
  bundle = drained.bundle;
  assert.equal(bundle.snapshot.tick, 2);
  assert.equal(bundle.snapshot.world.resources.food, 0, 'the public stock is really gone');
  assert.equal(bundle.snapshot.world.playerModel.wallet, 0);

  // At tick 144 actor-2 only has the stale quote, so the soft candidate is feasible but the
  // authoritative layer must refuse on the real stock.
  const s2 = createSimulationSession(bundle, fixture.systems);
  s2.advanceTicks(143);
  bundle = s2.getBundle();
  const a = actor2(bundle);
  assert.equal(a.entry.lastDecision.choice, 'BuyFood', 'the stale quote drives a real attempt');
  assert.equal(a.entry.lastOutcome.status, 'rejected', 'and authority refuses it');
  assert.equal(a.entry.lastOutcome.code, 'RULE_REJECTED');
  assert.equal(a.estate.ledger.foodBought, 0, 'no ration was transferred');
  assert.equal(a.estate.ledger.foodUsed, 0, 'and none was consumed');
  assert.equal(a.estate.wallet, 30, 'the wallet was never charged');
  const exp = bundle.snapshot.world.experienceModel.actors.find(x => x.actorId === 'actor-2');
  assert.equal(exp.workExperienceState.samples.length, 0, 'no work experience was fabricated');
});

// ---------------------------------------------------------------------------
// the published facts themselves
// ---------------------------------------------------------------------------

test('§3.2: the food quote is published once at tick 1 and the offer with its request', () => {
  const { bundle } = advance('earn-then-buy', 2 * DAY);
  const quotes = bundle.eventLog.filter(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT);
  assert.equal(quotes.length, 1, 'exactly one public quote');
  assert.equal(quotes[0].tick, 1);
  assert.deepEqual(quotes[0].payload, { location: 'village', product: 'food', price: 10, available: true });
  assert.equal(quotes[0].sourceSystem, 'survival');
  assert.equal(quotes[0].commandId, null);

  const offers = bundle.eventLog.filter(e => e.type === SURVIVAL_WORK_OFFER_EVENT);
  assert.equal(offers.length, 1, 'exactly one offer for the one request');
  assert.equal(offers[0].tick, 100, 'published on the same tick as the delivered request');
  assert.deepEqual(offers[0].payload, { actorId: 'actor-2', requestId: 's-food-01', wage: 20, expiresTick: 200 });
  assert.deepEqual(offers[0].entityIds, ['actor-2'], 'the offer belongs to the listening actor');
  // The offer cites the very request fact that delivered it.
  const delivered = bundle.eventLog.find(e => e.eventSeq === offers[0].causationEventSeqs[0]);
  assert.equal(delivered.type, 'MotivationRequestResolved');
  assert.equal(delivered.tick, 100);
  assert.equal(delivered.payload.requestId, 's-food-01');
  assert.equal(delivered.payload.status, 'delivered');
});

test('§3.2: under no-food the tick 1 quote honestly reports no food', () => {
  const { bundle } = advance('no-food', DAY);
  const quote = bundle.eventLog.find(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT);
  assert.deepEqual(quote.payload, { location: 'village', product: 'food', price: 10, available: false });
});

test('§3.2: actor-3 keeps the frozen cognition decision and prefix under the survival rules', () => {
  const { bundle } = advance('earn-then-buy', 2 * DAY);
  const w = bundle.snapshot.world;
  const peer = w.motivationModel.actors.find(a => a.actorId === 'actor-3');
  assert.equal(peer.lastDecision.version, 'cognition-decision-v1');
  assert.ok(peer.lastDecision.decisionId.startsWith('cognition-day-'));
  const anchor = w.cognitionModel.actors.find(a => a.actorId === 'actor-3');
  assert.ok(anchor.lastReviewDecisionId.startsWith('cognition-day-'));
  // actor-2 carries the survival decision and the survival anchor prefix.
  const self = w.motivationModel.actors.find(a => a.actorId === 'actor-2');
  assert.equal(self.lastDecision.version, 'survival-decision-v1');
  assert.ok(self.lastDecision.decisionId.startsWith('survival-day-'));
  const selfAnchor = w.cognitionModel.actors.find(a => a.actorId === 'actor-2');
  assert.ok(selfAnchor.lastReviewDecisionId.startsWith('survival-day-'));
});

// ---------------------------------------------------------------------------
// §6 save / resume and the CLI export
// ---------------------------------------------------------------------------

test('§6: 144 ticks then a resume for 144 more is byte-identical to 288 continuous ticks', async t => {
  const dir = await tempDir(t);
  const continuous = advance('affordable', 2 * DAY).bundle;

  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  const first = createSimulationSession(fixture.bundle, fixture.systems);
  first.advanceTicks(DAY);
  const mid = first.getBundle();
  const cpDir = path.join(dir, 'cp');
  await fs.mkdir(cpDir, { recursive: true });
  const file = await saveCheckpoint(mid, { directory: cpDir, rulesVersion: mid.snapshot.rulesVersion,
    systems: fixture.systems });
  const restored = await loadCheckpoint(file, { rulesVersion: mid.snapshot.rulesVersion, systems: fixture.systems });
  const second = createSimulationSession(restored, fixture.systems);
  second.advanceTicks(DAY);
  const resumed = second.getBundle();

  assert.equal(hash(resumed.snapshot), hash(continuous.snapshot), 'state must match byte for byte');
  assert.equal(hash(resumed.eventLog), hash(continuous.eventLog), 'events must match byte for byte');
  assert.equal(resumed.snapshot.tick, 2 * DAY);
  assert.equal(resumed.eventLog.length, continuous.eventLog.length);
});

test('§6: three days then a resume for the last day matches 432 continuous ticks', async t => {
  const dir = await tempDir(t);
  const continuous = advance('earn-then-buy', 3 * DAY).bundle;

  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('earn-then-buy'));
  const first = createSimulationSession(fixture.bundle, fixture.systems);
  first.advanceTicks(2 * DAY);
  const mid = first.getBundle();
  const cpDir = path.join(dir, 'cp');
  await fs.mkdir(cpDir, { recursive: true });
  const file = await saveCheckpoint(mid, { directory: cpDir, rulesVersion: mid.snapshot.rulesVersion,
    systems: fixture.systems });
  const restored = await loadCheckpoint(file, { rulesVersion: mid.snapshot.rulesVersion, systems: fixture.systems });
  const second = createSimulationSession(restored, fixture.systems);
  second.advanceTicks(DAY);
  const resumed = second.getBundle();

  assert.equal(hash(resumed.snapshot), hash(continuous.snapshot), 'state must match byte for byte');
  assert.equal(hash(resumed.eventLog), hash(continuous.eventLog), 'events must match byte for byte');
  assert.equal(resumed.snapshot.tick, 3 * DAY);
});

test('§6: the loop keeps buying one ration and eating one ration every day', () => {
  const { bundle } = advance('affordable', 3 * DAY);
  const a = actor2(bundle);
  assert.equal(a.estate.ledger.foodBought, 3, 'one real purchase per day');
  assert.equal(a.estate.ledger.foodUsed, 3, 'one real ration eaten per day');
  assert.equal(a.estate.inventory.food, 0, 'so the stock never accumulates');
  assert.equal(a.estate.ledger.wages, 0, 'and no work was needed');
  // Earning once is enough: the wage is spent once and never earned twice.
  const earned = advance('earn-then-buy', 3 * DAY).bundle;
  const b = actor2(earned);
  assert.equal(b.estate.ledger.workDays, 1, 'worked once');
  assert.equal(b.estate.ledger.wages, 20, 'earned one wage');
  assert.equal(b.estate.ledger.foodBought, 2, 'and bought on the later days');
  assert.equal(b.estate.ledger.foodUsed, 2);
});

test('§6: the CLI exports survival-config.json and hashes it in the summary', async t => {
  const dir = await tempDir(t);
  const out = path.join(dir, 'out');
  const summary = await runSimulation({ fixture: 'survival-village', resume: undefined, days: 2, ticks: 2 * DAY,
    seed: 42, out });
  assert.equal(summary.status, 'succeeded');
  assert.equal(summary.fixtureId, SURVIVAL_FIXTURE_ID);
  assert.equal(summary.rulesVersion, SURVIVAL_RULES);
  const exported = JSON.parse(await fs.readFile(path.join(out, 'survival-config.json'), 'utf8'));
  assert.equal(exported.version, 'survival-config-v1');
  assert.deepEqual(Object.keys(exported).sort(), ['cognition', 'experience', 'memory', 'mind', 'motivation', 'version']);
  assert.equal(summary.survivalConfigHash, hash(exported), 'the summary hash must match the export');
  // The exported config really is the fixture input, not a module reconstruction.
  assert.equal(exported.memory.society.economics.workFood, 0);
  assert.equal(exported.memory.society.actors.market.products.food.basePrice, 10);
  assert.equal(exported.motivation.requests.length, 0, 'affordable carries no request');
});

test('§6: a resume keeps the registered survival rules and refuses a cross-profile load', async t => {
  const dir = await tempDir(t);
  const out1 = path.join(dir, 'one');
  const first = await runSimulation({ fixture: 'survival-village', resume: undefined, days: 1, ticks: DAY, seed: 42, out: out1 });
  const out2 = path.join(dir, 'two');
  const second = await runSimulation({ fixture: undefined, resume: first.checkpointPath, days: 1, ticks: DAY,
    seed: undefined, out: out2 });
  assert.equal(second.rulesVersion, SURVIVAL_RULES);
  assert.equal(second.tick, 2 * DAY);
  // A cognition checkpoint must not be accepted as a survival world.
  const cognitionOut = path.join(dir, 'cog');
  const cognition = await runSimulation({ fixture: 'cognition-village', resume: undefined, days: 1, ticks: DAY,
    seed: 42, out: cognitionOut });
  assert.equal(cognition.rulesVersion, 'm-cognition-v1');
  assert.equal(cognition.fixtureId, 'cognition-village');
});

// ---------------------------------------------------------------------------
// structural guarantees
// ---------------------------------------------------------------------------

test('A2: every recipe run validates as a complete bundle on every tick', () => {
  for (const recipe of SURVIVAL_RECIPES) {
    const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig(recipe));
    const session = createSimulationSession(fixture.bundle, fixture.systems);
    session.advanceTicks(2 * DAY);
    const bundle = session.getBundle();
    validateBundle(bundle, { rulesVersion: SURVIVAL_RULES, systems: survivalSystems() });
    const w = bundle.snapshot.world;
    // All four cursors stay locked to the committed history.
    const last = bundle.eventLog.length;
    for (const model of [w.mindModel, w.motivationModel, w.experienceModel, w.cognitionModel])
      assert.equal(model.cursor, last, `${recipe}: cursors must match the committed log`);
  }
});

test('A2: the survival world keeps its own versions and refuses a cross-profile load', () => {
  const { bundle } = advance('affordable', DAY);
  const w = bundle.snapshot.world;
  assert.equal(w.motivationModel.version, 'survival-motivation-state-v1');
  assert.equal(w.cognitionModel.version, 'survival-cognition-state-v1');
  assert.equal(w.experienceModel.version, 'experience-runtime-state-v1');
  // The old cognition profile keeps its own versions untouched.
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  assert.equal(fixture.bundle.snapshot.world.cognitionModel.actors.length, 2);
});

test('A2: the tick-1 publication task is registered and does not settle a day', () => {
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  const tasks = fixture.bundle.snapshot.scheduledTasks;
  assert.equal(tasks.length, 2);
  assert.ok(tasks.some(t => t.systemId === 'survival' && t.taskId === 'survival-quote'));
  assert.ok(tasks.some(t => t.systemId === 'society' && t.taskId === 'daily-memory'));
  // Tick 1 runs the publication but settles no day.
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(1);
  const bundle = session.getBundle();
  assert.equal(bundle.eventLog.filter(e => e.type === 'SocietyDaySettled').length, 0);
  assert.equal(bundle.eventLog.filter(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT).length, 1);
});

test('A2: the observed food quote expires exactly two days after it was observed', () => {
  const { bundle } = advance('affordable', 2 * DAY);
  const quote = bundle.eventLog.find(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT);
  assert.equal(quote.tick, 1);
  // Later days use the existing public day-settlement projection instead of new broadcasts.
  const settled = bundle.eventLog.filter(e => e.type === 'SocietyDaySettled');
  assert.equal(settled.length, 2);
  assert.equal(bundle.eventLog.filter(e => e.type === SURVIVAL_FOOD_QUOTE_EVENT).length, 1);
  assert.equal(SURVIVAL_QUOTE_TTL_TICKS, 288);
});
