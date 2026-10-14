import test from 'node:test';
import assert from 'node:assert/strict';

import {createSceneVillage, defaultSceneVillageConfig} from '../../runtime/fixtures/scene-survival-village.mjs';
import {createEncounterVillage, defaultEncounterVillageConfig} from '../../runtime/fixtures/encounter-survival-village.mjs';
import {executeSceneIntent} from '../../runtime/core/scene-runtime.mjs';
import {executeEncounterIntent} from '../../runtime/core/encounter-runtime.mjs';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';
import {projectSceneKnowledge} from '../../runtime/knowledge/scene-knowledge.mjs';
import {createMemoryState, reduceMemoryFacts} from '../../runtime/core/memory-observer.mjs';

const giftDto = (commandId, expectedRevision, payload = {recipientId: 'actor-2'}) => ({
  version: 3,
  commandId,
  expectedRevision,
  type: 'PlayerGiftFood',
  payload,
});

const intent = (type, payload, commandId, expectedRevision) => ({
  version: 3,
  commandId,
  expectedRevision,
  type,
  payload,
});

const agent = (world, actorId) => world.societyModel.agents.find((entry) => entry.state.actorId === actorId);
const actor = (world, actorId) => world.actorModel.actors.find((entry) => entry.actorId === actorId);

function assertAcceptedRefusal(before, result, reasonCode) {
  const priorWorld = before.snapshot.world;
  const nextWorld = result.bundle.snapshot.world;
  assert.equal(result.receipt.status, 'committed');
  assert.equal(result.receipt.outcome, 'rejected');
  assert.equal(result.receipt.result.reasonCode, reasonCode);
  assert.equal(result.receipt.result.sourceEventSeq, null);
  assert.equal(result.receipt.durationTicks, 0);
  assert.equal(result.bundle.snapshot.tick, before.snapshot.tick);
  assert.equal(result.bundle.snapshot.revision, before.snapshot.revision + 1);
  assert.equal(result.bundle.snapshot.instantCommits, before.snapshot.instantCommits + 1);
  assert.equal(canonicalJson(result.bundle.snapshot.rng), canonicalJson(before.snapshot.rng));
  assert.deepEqual(nextWorld.playerModel, priorWorld.playerModel);
  assert.deepEqual(agent(nextWorld, 'actor-2'), agent(priorWorld, 'actor-2'));
  assert.deepEqual(nextWorld.memoryModel.observer.actors.map(({actorId, memories, relationships}) =>
    [actorId, memories, relationships]), priorWorld.memoryModel.observer.actors.map(({actorId, memories, relationships}) =>
    [actorId, memories, relationships]));
  assert.equal(result.bundle.eventLog.filter((event) => event.type === 'FoodGiftCommitted').length,
    before.eventLog.filter((event) => event.type === 'FoodGiftCommitted').length);
  const resolution = result.bundle.eventLog.filter((event) => event.type === 'EncounterCommandResolved'
    && event.commandId === result.receipt.commandId);
  assert.equal(resolution.length, 1);
}

test('H1: a real gift accepts only the fixed DTO and conserves private and public assets', () => {
  const {bundle: initial} = createSceneVillage(42, 'b-accept-h1-transfer', defaultSceneVillageConfig('no-opportunity'));
  const before = initial.snapshot.world;
  const configFingerprint = before.societyModel.configFingerprint;
  const publicAssets = canonicalJson({
    resources: before.resources,
    resourceModel: before.resourceModel,
    marketModel: before.marketModel,
    wallets: before.societyModel.agents.map(({state}) => [state.actorId, state.wallet]),
    playerWallet: before.playerModel.wallet,
  });
  const rng = canonicalJson(initial.snapshot.rng);

  const result = executeSceneIntent(initial, giftDto('b-h1-gift-once', 0));
  const world = result.bundle.snapshot.world;
  const receiver = agent(world, 'actor-2');
  const expectedPlayer = structuredClone(before.playerModel);
  expectedPlayer.inventory.food = 19;
  expectedPlayer.ledger.foodGiven = 1;
  const expectedAgents = structuredClone(before.societyModel.agents);
  const expectedReceiver = expectedAgents.find((entry) => entry.state.actorId === 'actor-2');
  expectedReceiver.state.inventory.food = 1;
  expectedReceiver.trade.foodReceived = 1;

  assert.deepEqual(result.receipt, {
    apiVersion: 1, receiptVersion: 3, commandId: 'b-h1-gift-once', status: 'committed',
    fromRevision: 0, toRevision: 1, fromTick: 0, tick: 0, durationTicks: 0,
    type: 'PlayerGiftFood', outcome: 'succeeded',
    result: {donorId: 'actor-4', recipientId: 'actor-2', product: 'food', quantity: 1,
      sourceEventSeq: 1, reasonCode: null},
  });
  assert.deepEqual(Object.keys(result.receipt).sort(), [
    'apiVersion', 'receiptVersion', 'commandId', 'status', 'fromRevision', 'toRevision',
    'fromTick', 'tick', 'durationTicks', 'type', 'outcome', 'result',
  ].sort());
  assert.equal(world.playerModel.inventory.food, 19);
  assert.equal(world.playerModel.ledger.foodGiven, 1);
  assert.equal(receiver.state.inventory.food, 1);
  assert.equal(receiver.trade.foodReceived, 1);
  assert.deepEqual(world.playerModel, expectedPlayer,
    'no unrelated player inventory, ledger, or health field changes');
  assert.deepEqual(world.societyModel.agents, expectedAgents,
    'no other estate, receiver side ledger, medicine, or trust field changes');
  assert.equal(world.societyModel.agents.reduce((sum, entry) => sum + entry.trade.foodReceived, 0), 1);
  assert.equal(world.resources.food, before.resources.food);
  assert.equal(world.resourceModel.ledger.food.outflow, before.resourceModel.ledger.food.outflow);
  assert.equal(world.playerModel.wallet, before.playerModel.wallet);
  assert.equal(world.societyModel.configFingerprint, configFingerprint);
  assert.equal(canonicalJson({
    resources: world.resources,
    resourceModel: world.resourceModel,
    marketModel: world.marketModel,
    wallets: world.societyModel.agents.map(({state}) => [state.actorId, state.wallet]),
    playerWallet: world.playerModel.wallet,
  }), publicAssets);
  assert.equal(result.bundle.snapshot.tick, 0);
  assert.equal(result.bundle.snapshot.revision, 1);
  assert.equal(result.bundle.snapshot.instantCommits, 1);
  assert.equal(canonicalJson(result.bundle.snapshot.rng), rng);

  const giftFacts = result.bundle.eventLog.filter((event) => event.type === 'FoodGiftCommitted');
  assert.equal(giftFacts.length, 1);
  assert.deepEqual(giftFacts[0], {
    schemaVersion: 1, eventSeq: 1, tick: 0, type: 'FoodGiftCommitted', sourceSystem: 'scene',
    commandId: 'b-h1-gift-once', causationEventSeqs: [], entityIds: ['actor-4', 'actor-2'],
    payload: {donorId: 'actor-4', recipientId: 'actor-2', product: 'food', quantity: 1, location: 'village',
      donorFoodBefore: 20, donorFoodAfter: 19, recipientFoodBefore: 0, recipientFoodAfter: 1},
  });
  assert.equal(result.bundle.eventLog.filter((event) => event.type === 'EncounterCommandResolved'
    && event.commandId === 'b-h1-gift-once').length, 1);
  assert.equal(world.encounterModel.inputHistory.length, 1);
  assert.deepEqual(world.encounterModel.inputHistory[0], {dto: giftDto('b-h1-gift-once', 0), receipt: result.receipt});
});

test('H1: descriptor-first, byte budget, exact payload keys and invalid intents do not consume the ID', () => {
  const {bundle} = createSceneVillage(42, 'b-accept-h1-preflight', defaultSceneVillageConfig('no-opportunity'));
  const commandId = 'b-h1-reusable-id';
  const before = canonicalJson(bundle);
  let getterReads = 0;
  const payloadWithGetter = {};
  Object.defineProperty(payloadWithGetter, 'recipientId', {
    enumerable: true,
    get() { getterReads += 1; return 'actor-2'; },
  });

  assert.throws(() => executeSceneIntent(bundle, giftDto(commandId, 0, payloadWithGetter)),
    (error) => error.code === 'INVALID_INPUT');
  assert.equal(getterReads, 0);
  assert.throws(() => executeSceneIntent(bundle, giftDto(commandId, 0, {recipientId: 'actor-99'})),
    (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => executeSceneIntent(bundle, giftDto(commandId, 0, {recipientId: 'actor-2', quantity: 1})),
    (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => executeSceneIntent(bundle, {...giftDto(commandId, 0), version: 2}),
    (error) => error.code === 'UNSUPPORTED_VERSION');

  const oversized = giftDto('粮'.repeat(1400), 0);
  assert.throws(() => executeSceneIntent(bundle, oversized), (error) => error.code === 'LIMIT_EXCEEDED');
  assert.equal(canonicalJson(bundle), before);

  const accepted = executeSceneIntent(bundle, giftDto(commandId, 0));
  assert.equal(accepted.receipt.commandId, commandId);
  assert.equal(accepted.bundle.snapshot.revision, 1);
  assert.equal(accepted.bundle.snapshot.world.playerModel.ledger.foodGiven, 1);
});

test('H1: real domain refusals follow the fixed priority and preserve the offered assets', () => {
  const deadPlayerConfig = defaultSceneVillageConfig('no-opportunity');
  deadPlayerConfig.memory.society.actors.initialActors[3].health = 0;
  const {bundle: deadPlayer} = createSceneVillage(42, 'b-accept-h1-player-dead', deadPlayerConfig);
  const playerDeadGift = executeSceneIntent(deadPlayer, giftDto('b-h1-player-dead', 0));
  assertAcceptedRefusal(deadPlayer, playerDeadGift, 'PLAYER_DEAD');

  const deadRecipientConfig = defaultSceneVillageConfig('no-opportunity');
  deadRecipientConfig.memory.society.actors.initialActors[1].health = 0;
  const {bundle: deadRecipient} = createSceneVillage(42, 'b-accept-h1-recipient-dead', deadRecipientConfig);
  const atForest = executeSceneIntent(deadRecipient,
    intent('PlayerTravel', {destination: 'forest'}, 'b-h1-dead-recipient-travel', 0));
  const deadBefore = canonicalJson({player: atForest.bundle.snapshot.world.playerModel,
    recipient: agent(atForest.bundle.snapshot.world, 'actor-2')});
  const deadGift = executeSceneIntent(atForest.bundle,
    giftDto('b-h1-dead-recipient-priority', atForest.bundle.snapshot.revision));
  assertAcceptedRefusal(atForest.bundle, deadGift, 'RECIPIENT_DEAD');
  assert.equal(deadGift.receipt.result.reasonCode, 'RECIPIENT_DEAD',
    'a dead recipient is rejected before the away-from-village condition');
  assert.equal(deadGift.receipt.outcome, 'rejected');
  assert.equal(deadGift.receipt.result.sourceEventSeq, null);
  assert.equal(deadGift.receipt.durationTicks, 0);
  assert.equal(deadGift.bundle.snapshot.tick, 12);
  assert.equal(deadGift.bundle.snapshot.revision, atForest.bundle.snapshot.revision + 1);
  assert.equal(canonicalJson({player: deadGift.bundle.snapshot.world.playerModel,
    recipient: agent(deadGift.bundle.snapshot.world, 'actor-2')}), deadBefore);
  assert.equal(deadGift.bundle.eventLog.filter((event) => event.type === 'FoodGiftCommitted').length, 0);

  const {bundle: fresh} = createSceneVillage(42, 'b-accept-h1-busy', defaultSceneVillageConfig('no-opportunity'));
  const away = executeSceneIntent(fresh, intent('PlayerTravel', {destination: 'forest'}, 'b-h1-away', 0));
  const begun = executeSceneIntent(away.bundle, intent('EncounterBegin', {}, 'b-h1-begin', 12));
  const busy = executeSceneIntent(begun.bundle, giftDto('b-h1-busy-priority', begun.bundle.snapshot.revision));
  assertAcceptedRefusal(begun.bundle, busy, 'ENCOUNTER_BUSY');
  assert.equal(busy.receipt.result.reasonCode, 'ENCOUNTER_BUSY',
    'an active encounter is checked before location even though the player is in the forest');
  assert.equal(busy.bundle.snapshot.tick, begun.bundle.snapshot.tick);
  assert.equal(busy.bundle.snapshot.revision, begun.bundle.snapshot.revision + 1);
  assert.equal(busy.bundle.eventLog.filter((event) => event.type === 'FoodGiftCommitted').length, 0);

  const awayGift = executeSceneIntent(away.bundle,
    giftDto('b-h1-away-rejected', away.bundle.snapshot.revision));
  assertAcceptedRefusal(away.bundle, awayGift, 'NOT_COLOCATED');
  assert.equal(awayGift.receipt.result.reasonCode, 'NOT_COLOCATED');
  assert.equal(awayGift.bundle.snapshot.tick, 12);
  assert.equal(awayGift.bundle.snapshot.revision, away.bundle.snapshot.revision + 1);

  const noFoodConfig = defaultSceneVillageConfig('no-food');
  const {bundle: noFood} = createSceneVillage(42, 'b-accept-h1-no-food', noFoodConfig);
  const noFoodGift = executeSceneIntent(noFood, giftDto('b-h1-no-food', 0));
  assertAcceptedRefusal(noFood, noFoodGift, 'NO_FOOD');
  assert.equal(noFoodGift.receipt.result.reasonCode, 'NO_FOOD');
  assert.equal(noFoodGift.bundle.snapshot.world.playerModel.inventory.food, 0);
  assert.equal(noFoodGift.bundle.snapshot.world.societyModel.agents
    .reduce((sum, entry) => sum + entry.trade.foodReceived, 0), 0);

  const noFoodAndFullConfig = defaultSceneVillageConfig('no-food');
  noFoodAndFullConfig.memory.society.estates.find((estate) => estate.actorId === 'actor-2').initialFood = 1000;
  const noFoodStock = noFoodAndFullConfig.memory.society.actors.market.ecology.resources.resources.food;
  noFoodStock.initial = 1000;
  noFoodStock.capacity = Math.max(noFoodStock.capacity, noFoodStock.initial);
  const {bundle: noFoodAndFull} = createSceneVillage(42, 'b-accept-h1-no-food-and-full', noFoodAndFullConfig);
  const noFoodAndFullGift = executeSceneIntent(noFoodAndFull, giftDto('b-h1-no-food-and-full', 0));
  assertAcceptedRefusal(noFoodAndFull, noFoodAndFullGift, 'NO_FOOD');
  assert.equal(noFoodAndFullGift.receipt.result.reasonCode, 'NO_FOOD',
    'lack of donor food wins before the recipient capacity check');
  assert.equal(agent(noFoodAndFullGift.bundle.snapshot.world, 'actor-2').state.inventory.food, 1000);

  const fullConfig = defaultSceneVillageConfig('no-opportunity');
  fullConfig.memory.society.estates.find((estate) => estate.actorId === 'actor-2').initialFood = 1000;
  const fullStock = fullConfig.memory.society.actors.market.ecology.resources.resources.food;
  fullStock.initial = 1200;
  fullStock.capacity = Math.max(fullStock.capacity, fullStock.initial);
  const {bundle: full} = createSceneVillage(42, 'b-accept-h1-full', fullConfig);
  const fullGift = executeSceneIntent(full, giftDto('b-h1-full', 0));
  assertAcceptedRefusal(full, fullGift, 'RECIPIENT_FULL');
  assert.equal(agent(full.snapshot.world, 'actor-2').state.inventory.food, 1000);
});

test('H1: the existing encounter profile still rejects Gift DTO3 as INVALID_INPUT without changing its bundle', () => {
  const legacy = createEncounterVillage(42, 'b-accept-h1-legacy', defaultEncounterVillageConfig('no-opportunity')).bundle;
  const before = canonicalJson(legacy);
  assert.throws(() => executeEncounterIntent(legacy, giftDto('b-h1-old-profile-gift', 0)),
    (error) => error.code === 'INVALID_INPUT');
  assert.equal(canonicalJson(legacy), before);
});

test('H2: each participant receives a source-linked self memory and the reader sees only public local state', () => {
  const {bundle: initial} = createSceneVillage(42, 'b-accept-h2-memory', defaultSceneVillageConfig('no-opportunity'));
  const relationshipsBefore = canonicalJson(initial.snapshot.world.memoryModel.observer.actors
    .map(({actorId, relationships}) => [actorId, relationships]));
  const result = executeSceneIntent(initial, giftDto('b-h2-gift', 0));
  const world = result.bundle.snapshot.world;
  const fact = result.bundle.eventLog.find((event) => event.type === 'FoodGiftCommitted');
  const memoriesOf = (actorId) => world.memoryModel.observer.actors.find((entry) => entry.actorId === actorId)
    .memories.filter((entry) => entry.observable.type === 'food-gift');

  for (const [actorId, direction] of [['actor-4', 'given'], ['actor-2', 'received']]) {
    assert.deepEqual(memoriesOf(actorId), [{
      memoryId: `memory-${fact.eventSeq}-${actorId}-self`, sourceEventSeq: fact.eventSeq,
      occurrenceTick: 0, observedTick: 0, channel: 'self', importance: 1,
      observable: {type: 'food-gift', donorId: 'actor-4', recipientId: 'actor-2', product: 'food',
        quantity: 1, direction, commandId: 'b-h2-gift'},
    }]);
  }
  assert.deepEqual(world.memoryModel.observer.actors.filter((entry) => !['actor-2', 'actor-4'].includes(entry.actorId))
    .map((entry) => entry.memories.filter((memory) => memory.observable.type === 'food-gift')), [[], []]);
  assert.equal(canonicalJson(world.memoryModel.observer.actors.map(({actorId, relationships}) => [actorId, relationships])),
    relationshipsBefore, 'the transfer creates no trust or relationship change');

  const view = projectSceneKnowledge(result.bundle, 'actor-2');
  assert.deepEqual(Object.keys(view).sort(),
    ['knowledgeVersion', 'simulationId', 'revision', 'tick', 'actorId', 'self', 'visibleActors', 'giftMemories'].sort());
  assert.deepEqual(view.self, {name: '猎人', occupation: 'hunter', location: 'village', alive: true, condition: 'healthy'});
  assert.deepEqual(view.giftMemories, memoriesOf('actor-2'));
  assert.deepEqual(view.visibleActors.map(({actorId}) => actorId), ['actor-1', 'actor-3', 'actor-4']);
  for (const visible of view.visibleActors) {
    assert.deepEqual(Object.keys(visible).sort(), ['actorId', 'name', 'occupation', 'location', 'alive', 'condition'].sort());
    assert.equal(Object.hasOwn(visible, 'health'), false);
  }
  assert.deepEqual(projectSceneKnowledge(result.bundle, 'actor-1').giftMemories, [],
    'a third party does not infer the gift from the shared event history');
  assert.throws(() => projectSceneKnowledge(result.bundle, 'actor-99'), (error) => error.code === 'INVALID_INPUT');
});

test('H2: the pre-existing medicine-trade event still adds ten trust to its two participants', () => {
  const initialActors = [
    {actorId: 'actor-1', alive: true, location: 'village'},
    {actorId: 'actor-2', alive: true, location: 'village'},
    {actorId: 'actor-3', alive: true, location: 'village'},
    {actorId: 'actor-4', alive: true, location: 'village'},
  ];
  const observer = createMemoryState(initialActors, 'memory-observer-v3');
  const legacySale = {
    schemaVersion: 1, eventSeq: 1, tick: 144, type: 'SocietyActionCommitted',
    sourceSystem: 'command-engine', commandId: 'b-h2-legacy-sale', causationEventSeqs: [],
    entityIds: ['actor-1', 'actor-3'],
    payload: {actorId: 'actor-1', goalId: 1, action: 'SellMedicine', targetActorId: 'actor-3', day: 1,
      buyerId: 'actor-3', price: 5, before: {sellerWallet: 0, buyerWallet: 10, sellerHerbs: 1, buyerHerbs: 0},
      after: {sellerWallet: 5, buyerWallet: 5, sellerHerbs: 0, buyerHerbs: 1}},
  };
  const next = reduceMemoryFacts(observer, [legacySale], 144);
  const relations = (actorId) => next.actors.find((entry) => entry.actorId === actorId).relationships;
  assert.deepEqual(relations('actor-1'), [{actorId: 'actor-3', trust: 10, lastSourceEventSeq: 1}]);
  assert.deepEqual(relations('actor-3'), [{actorId: 'actor-1', trust: 10, lastSourceEventSeq: 1}]);
  assert.deepEqual(relations('actor-2'), []);
  assert.deepEqual(relations('actor-4'), []);
});

test('H2: 33 real gifts retain the latest 32 self memories and replay to the exact observer state', () => {
  const config = defaultSceneVillageConfig('no-opportunity');
  config.memory.society.player.initialFood = 33;
  const initial = createSceneVillage(42, 'b-accept-h2-memory-retention', config).bundle;
  const initialObserver = structuredClone(initial.snapshot.world.memoryModel.observer);
  let current = initial;
  for (let index = 0; index < 33; index++) {
    const result = executeSceneIntent(current,
      giftDto(`b-h2-retention-${index}`, current.snapshot.revision));
    assert.equal(result.receipt.outcome, 'succeeded');
    current = result.bundle;
  }

  const giftFacts = current.eventLog.filter(event => event.type === 'FoodGiftCommitted');
  assert.equal(giftFacts.length, 33);
  assert.equal(current.snapshot.world.encounterModel.inputHistory.length, 33);
  assert.equal(current.snapshot.world.playerModel.ledger.foodGiven, 33);
  assert.equal(agent(current.snapshot.world, 'actor-2').trade.foodReceived, 33);
  const retainedFacts = giftFacts.slice(-32);
  for (const [actorId, direction] of [['actor-4', 'given'], ['actor-2', 'received']]) {
    const memories = current.snapshot.world.memoryModel.observer.actors
      .find(entry => entry.actorId === actorId).memories
      .filter(memory => memory.observable.type === 'food-gift');
    assert.equal(memories.length, 32);
    assert.deepEqual(memories.map(memory => memory.sourceEventSeq), retainedFacts.map(event => event.eventSeq));
    assert.ok(memories.every(memory => memory.observable.direction === direction));
    assert.equal(memories.at(-1).memoryId, `memory-${retainedFacts.at(-1).eventSeq}-${actorId}-self`);
  }
  assert.equal(current.snapshot.world.memoryModel.observer.actors
    .filter(entry => !['actor-2', 'actor-4'].includes(entry.actorId))
    .flatMap(entry => entry.memories).filter(memory => memory.observable.type === 'food-gift').length, 0);
  assert.deepEqual(reduceMemoryFacts(initialObserver, current.eventLog, current.snapshot.tick),
    current.snapshot.world.memoryModel.observer, 'full-history replay reproduces retained memories, cursors and relationships');
});

test('H3: hand-calculated day 144 agrees across matched no-opportunity worlds with and without the gift', () => {
  const config = defaultSceneVillageConfig('no-opportunity');
  const withGift = createSceneVillage(42, 'b-accept-h3-gifted', config).bundle;
  const withoutGift = createSceneVillage(42, 'b-accept-h3-control', config).bundle;
  const gifted = executeSceneIntent(withGift, giftDto('b-h3-gift', 0)).bundle;
  const dayWithGift = executeSceneIntent(gifted, intent('AdvanceTime', {ticks: 144}, 'b-h3-day-gifted', 1));
  const dayWithoutGift = executeSceneIntent(withoutGift,
    intent('AdvanceTime', {ticks: 144}, 'b-h3-day-control', 0));

  assert.equal(dayWithGift.receipt.tick, 144);
  assert.equal(dayWithoutGift.receipt.tick, 144);
  assert.equal(dayWithGift.bundle.snapshot.world.resources.food, 464);
  assert.equal(dayWithoutGift.bundle.snapshot.world.resources.food, 464);
  assert.equal(dayWithGift.bundle.snapshot.world.playerModel.inventory.food, 18);
  assert.equal(dayWithoutGift.bundle.snapshot.world.playerModel.inventory.food, 19);
  assert.equal(agent(dayWithGift.bundle.snapshot.world, 'actor-2').state.inventory.food, 0);
  assert.equal(actor(dayWithGift.bundle.snapshot.world, 'actor-2').hunger, 100);
  assert.equal(actor(dayWithoutGift.bundle.snapshot.world, 'actor-2').hunger, 300);
  assert.equal(agent(dayWithGift.bundle.snapshot.world, 'actor-2').state.wallet, 0);
  assert.equal(agent(dayWithoutGift.bundle.snapshot.world, 'actor-2').state.wallet, 0);
  assert.equal(agent(dayWithGift.bundle.snapshot.world, 'actor-2').state.ledger.wages, 0);
  assert.equal(agent(dayWithoutGift.bundle.snapshot.world, 'actor-2').state.ledger.wages, 0);
  assert.deepEqual(dayWithGift.bundle.snapshot.world.experienceModel.actors
    .find((entry) => entry.actorId === 'actor-2').workExperienceState.samples, []);
  assert.deepEqual(dayWithoutGift.bundle.snapshot.world.experienceModel.actors
    .find((entry) => entry.actorId === 'actor-2').workExperienceState.samples, []);
  assert.equal(dayWithGift.bundle.snapshot.world.playerModel.ledger.foodGiven, 1,
    'the day settlement consumes the received ration but retains the historical transfer ledger');
  assert.equal(agent(dayWithGift.bundle.snapshot.world, 'actor-2').trade.foodReceived, 1);
});

test('H3: an accepted gift does not review, clear or rewrite an existing earn-then-buy commitment', () => {
  const config = defaultSceneVillageConfig('earn-then-buy');
  config.memory.society.actors.initialActors[1].fatigue = 700;
  let bundle = createSceneVillage(42, 'b-accept-h3-commitment', config).bundle;
  const firstDay = executeSceneIntent(bundle,
    intent('AdvanceTime', {ticks: 144}, 'b-h3-earn-day', 0));
  bundle = firstDay.bundle;
  const commitment = agent(bundle.snapshot.world, 'actor-2').state.currentGoal;
  const plans = bundle.snapshot.world.motivationModel.actors.find((entry) => entry.actorId === 'actor-2');
  assert.equal(agent(bundle.snapshot.world, 'actor-2').state.lastAction, 'WorkForPay');
  assert.equal(agent(bundle.snapshot.world, 'actor-2').state.wallet, 20);
  assert.ok(plans.activePlan, 'the configured earn-then-buy recipe establishes a live plan at its real daily boundary');

  const afterGift = executeSceneIntent(bundle, giftDto('b-h3-gift-during-commitment', bundle.snapshot.revision));
  const afterAgent = agent(afterGift.bundle.snapshot.world, 'actor-2').state;
  const afterPlan = afterGift.bundle.snapshot.world.motivationModel.actors.find((entry) => entry.actorId === 'actor-2');
  assert.deepEqual(afterAgent.currentGoal, commitment);
  assert.equal(afterAgent.wallet, 20);
  assert.equal(afterAgent.lastAction, 'WorkForPay');
  assert.deepEqual(afterPlan.activePlan, plans.activePlan);
  assert.deepEqual(afterPlan.suspendedPlan, plans.suspendedPlan);
  assert.deepEqual(afterPlan.lastDecision, plans.lastDecision);
  assert.equal(afterGift.bundle.eventLog.filter((event) => event.type === 'MotivationPlanSettled').length,
    bundle.eventLog.filter((event) => event.type === 'MotivationPlanSettled').length,
    'a zero-tick gift does not run or publish a new plan review');
});
