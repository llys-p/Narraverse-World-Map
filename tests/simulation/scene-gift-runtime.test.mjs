import test from 'node:test';
import assert from 'node:assert/strict';

import {defaultEncounterVillageConfig} from '../../runtime/fixtures/encounter-survival-village.mjs';
import {createSocietyWorld, validateSocietyWorld, defaultSocietyConfig} from '../../runtime/core/society.mjs';
import {createPlayerPlayState} from '../../runtime/core/player-state.mjs';
import {validateHunterWorld} from '../../runtime/core/hunter.mjs';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';
import {createMemoryWorld,validateMemoryWorld} from '../../runtime/core/memory-runtime.mjs';
import {createMemoryState,validateMemoryState,reduceMemoryFacts,validateMemoryHistory,projectActorEvent,advanceActorMemory} from '../../runtime/core/memory-observer.mjs';

const PLAY_LEDGER = ['foodUsed', 'herbsUsed', 'foodBought', 'herbsBought', 'foodSold', 'herbsSold', 'spent', 'earned'];

// no-opportunity 配方：猎人 actor-2 第1天无打工机会，公共 food=540，player food=20
function societyConfigV5() {
  const cfg = defaultEncounterVillageConfig('no-opportunity');
  cfg.memory.society.version = 'society-config-v5';
  return cfg.memory.society;
}

function AGENT_BY_ID(world, id) {
  return world.societyModel.agents.find((a) => a.state.actorId === id);
}

function hunterView(world, id) {
  const agent = AGENT_BY_ID(world, id);
  return {
    resources: world.resources,
    resourceModel: world.resourceModel,
    ecologyModel: world.ecologyModel,
    marketModel: world.marketModel,
    actorModel: world.actorModel,
    hunterModel: agent.state,
  };
}

function ownershipV2For(world, id) {
  // no-opportunity 新世界：全钱包0、全账本0，故 ownership-v2 六字段全0 + foodReceived=0
  return {
    actorId: id,
    foreignWallets: 0,
    foreignFoodUsed: 0,
    saleRevenue: 0,
    herbsSold: 0,
    herbsReceived: 0,
    version: 'society-ownership-v2',
    foodReceived: 0,
  };
}

test('CP1a-1 createSocietyWorld 接受 society-config-v5，基线值不变', () => {
  const c = societyConfigV5();
  const w = createSocietyWorld(c);
  validateSocietyWorld(w);
  assert.equal(w.societyModel.config.version, 'society-config-v5');
  assert.equal(w.resources.food, 540);
  assert.equal(w.playerModel.inventory.food, 20);
  assert.equal(AGENT_BY_ID(w, 'actor-2').state.inventory.food, 0);
  for (const agent of w.societyModel.agents) {
    assert.equal(agent.trade.foodReceived, 0);
  }
});

test('CP1a-2 v5 配置指纹与 estates 原样', () => {
  const c = societyConfigV5();
  const w = createSocietyWorld(c);
  assert.equal(w.societyModel.configFingerprint, canonicalJson(c));
  assert.deepEqual(w.societyModel.config.estates, c.estates);
});

test('CP1a-3 旧 society-config-v4 基线不泄漏新字段（回归护栏）', () => {
  const cfg = defaultEncounterVillageConfig('no-opportunity');
  const c = cfg.memory.society;
  assert.equal(c.version, 'society-config-v4');
  const w = createSocietyWorld(c);
  validateSocietyWorld(w);
  assert.equal(w.societyModel.config.version, 'society-config-v4');
  assert.equal(w.playerModel.version, 'player-state-v2');
  assert.equal(w.playerModel.inventory.food, 20);
  const hunter = AGENT_BY_ID(w, 'actor-2');
  assert.equal(hunter.state.inventory.food, 0);
  assert.deepEqual(
    Object.keys(hunter.trade).sort(),
    ['revenue', 'spent', 'herbsSold', 'herbsReceived', 'lastSaleDay'].sort(),
  );
});

test('CP1a-4 createPlayerPlayState 旧公开签名仍返 v2 + 8 键账本（回归护栏）', () => {
  const cfg = defaultEncounterVillageConfig('no-opportunity');
  const c = cfg.memory.society;
  const p = createPlayerPlayState(c.player);
  assert.equal(p.version, 'player-state-v2');
  assert.deepEqual(Object.keys(p.ledger).sort(), [...PLAY_LEDGER].sort());
  assert.equal(p.inventory.food, 20);
  assert.equal(p.inventory.herbs, 0);
});

test('CP1a-5 v5 + 跨版本 actor-config-v3 被 roster 门拒绝', () => {
  const c = societyConfigV5();
  c.actors.version = 'actor-config-v3';
  assert.throws(
    () => createSocietyWorld(c),
    /Society roster\/population differs from fixed contract/,
  );
});

test('CP1a-5b 未知版本 society-config-v9 被版本门拒绝（护栏）', () => {
  const c = defaultSocietyConfig();
  c.version = 'society-config-v9';
  assert.throws(() => createSocietyWorld(c), /Unknown Society configuration/);
});

test('CP1a-6 actor-2 收粮的接收库存与双方账本平衡时被接受', () => {
  const w = createSocietyWorld(societyConfigV5());
  w.playerModel.inventory.food = 19;
  w.playerModel.ledger.foodGiven = 1;
  const receiver = AGENT_BY_ID(w, 'actor-2');
  receiver.trade.foodReceived = 1;
  receiver.state.inventory.food = 1;
  validateSocietyWorld(w);
});

test('CP1a-6b 收粮账记了接收但接收库存未增加时明确拒绝', () => {
  const w = createSocietyWorld(societyConfigV5());
  w.playerModel.inventory.food = 19;
  w.playerModel.ledger.foodGiven = 1;
  AGENT_BY_ID(w, 'actor-2').trade.foodReceived = 1;
  assert.throws(() => validateSocietyWorld(w), /Private food ledger mismatch/);
});

test('CP1a-6c actor-1 即使库存和礼赠总账平衡也不得收玩家礼赠', () => {
  const w = createSocietyWorld(societyConfigV5());
  w.playerModel.inventory.food = 19;
  w.playerModel.ledger.foodGiven = 1;
  const receiver = AGENT_BY_ID(w, 'actor-1');
  receiver.trade.foodReceived = 1;
  receiver.state.inventory.food = 21; // no-opportunity 配方 actor-1 初始私粮20，接收后为21
  assert.throws(
    () => validateSocietyWorld(w),
    (error) => error.code === 'INVALID_INPUT' && !/Private food ledger mismatch/.test(error.message),
  );
});

test('CP1a-7 双边库存各自自洽但 ΣfoodReceived≠foodGiven 时明确在总账门拒绝', () => {
  const w = createSocietyWorld(societyConfigV5());
  const receiver = AGENT_BY_ID(w, 'actor-2');
  receiver.trade.foodReceived = 1;
  receiver.state.inventory.food = 1; // actor-2 私粮由0增至1，接收方恒等式自洽
  w.playerModel.ledger.foodGiven = 2;
  w.playerModel.inventory.food = 18; // 玩家20-2=18，双方局部恒等式自洽
  assert.throws(() => validateSocietyWorld(w), /Society gift ledger mismatch/);
});

test('CP1a-8 foodReceived 负数/非整数/超容量被拒绝', () => {
  const base = createSocietyWorld(societyConfigV5());
  validateSocietyWorld(base);
  const wNeg = createSocietyWorld(societyConfigV5());
  AGENT_BY_ID(wNeg, 'actor-1').trade.foodReceived = -1;
  assert.throws(() => validateSocietyWorld(wNeg));

  const wFloat = createSocietyWorld(societyConfigV5());
  AGENT_BY_ID(wFloat, 'actor-1').trade.foodReceived = 1.5;
  assert.throws(() => validateSocietyWorld(wFloat));

  const wOver = createSocietyWorld(societyConfigV5());
  AGENT_BY_ID(wOver, 'actor-1').trade.foodReceived = 1001;
  wOver.playerModel.ledger.foodGiven = 1001;
  assert.throws(() => validateSocietyWorld(wOver));
});

test('CP1a-9 v5 世界派生 player-state-v3（9 键账本含 foodGiven）', () => {
  const w = createSocietyWorld(societyConfigV5());
  const p = w.playerModel;
  assert.equal(p.version, 'player-state-v3');
  assert.equal(p.ledger.foodGiven, 0);
  assert.deepEqual(Object.keys(p.ledger).sort(), [...PLAY_LEDGER, 'foodGiven'].sort());
  validateSocietyWorld(w);
});

test('CP1a-10 v5 内部 ownership-v2 有效、未知 ownership 版本被 hunter 拒绝', () => {
  const w5 = createSocietyWorld(societyConfigV5());
  validateSocietyWorld(w5);
  const a2 = AGENT_BY_ID(w5, 'actor-2');
  assert.equal(a2.trade.foodReceived, 0);
  assert.equal(w5.playerModel.ledger.foodGiven, 0);

  const view = hunterView(w5, 'actor-2');
  const validV2 = ownershipV2For(w5, 'actor-2');
  validateHunterWorld(view, validV2);
  assert.throws(() => validateHunterWorld(view, {...validV2, version: 'society-ownership-v9'}));
});

test('CP1a-10b hunter ownership null 是 INVALID_INPUT，版本访问器在读取前拒绝', () => {
  const w = createSocietyWorld(societyConfigV5());
  const view = hunterView(w, 'actor-2');
  assert.throws(() => validateHunterWorld(view, null), (error) => error.code === 'INVALID_INPUT');

  const ownership = ownershipV2For(w, 'actor-2');
  let versionReads = 0;
  Object.defineProperty(ownership, 'version', {
    enumerable: true,
    get() {
      versionReads += 1;
      return 'society-ownership-v2';
    },
  });
  assert.throws(() => validateHunterWorld(view, ownership), (error) => error.code === 'INVALID_INPUT');
  assert.equal(versionReads, 0);
});

// ---------------------------------------------------------------- CP1b 记忆层（memory-config-v6 / memory-observer-v3）---
// 期望值按 D4A-CP1B-MEMORY-LAYER-CARD.md 与 D4A-SCENE-GIFT-MEMORY-TASK.md §2/§5/§6 独立手算。
function memoryConfigV6() {
  const cfg = defaultEncounterVillageConfig('no-opportunity');
  return {...cfg.memory, version: 'memory-config-v6', society: {...cfg.memory.society, version: 'society-config-v5'}};
}

const GIFT_ROSTER = [
  {actorId: 'actor-1', alive: true, location: 'village'},
  {actorId: 'actor-2', alive: true, location: 'village'},
  {actorId: 'actor-3', alive: true, location: 'village'},
  {actorId: 'actor-4', alive: true, location: 'village'},
];

function giftFact(seq, tick, commandId, donorBefore = 20, donorAfter = 19, recipientBefore = 0, recipientAfter = 1) {
  return {schemaVersion: 1, eventSeq: seq, tick, type: 'FoodGiftCommitted', sourceSystem: 'scene', commandId,
    causationEventSeqs: [], entityIds: ['actor-4', 'actor-2'],
    payload: {donorId: 'actor-4', recipientId: 'actor-2', product: 'food', quantity: 1, location: 'village',
      donorFoodBefore: donorBefore, donorFoodAfter: donorAfter, recipientFoodBefore: recipientBefore, recipientFoodAfter: recipientAfter}};
}

// 旧的 SellMedicine 事实：用于验证赠粮不改动关系而 medicine-trade 仍是 trust+10。
function medicineSaleFact(seq, tick) {
  return {schemaVersion: 1, eventSeq: seq, tick, type: 'SocietyActionCommitted', sourceSystem: 'command-engine',
    commandId: 'cmd-sale-1', causationEventSeqs: [], entityIds: ['actor-1', 'actor-3'],
    payload: {actorId: 'actor-1', goalId: 1, action: 'SellMedicine', targetActorId: 'actor-3', day: 1, buyerId: 'actor-3', price: 5,
      before: {sellerWallet: 0, buyerWallet: 10, sellerHerbs: 1, buyerHerbs: 0},
      after: {sellerWallet: 5, buyerWallet: 5, sellerHerbs: 0, buyerHerbs: 1}}};
}

const giftState = () => createMemoryState(GIFT_ROSTER, 'memory-observer-v3');

test('CP1b-1 memory-config-v6 显式配 society-config-v5，空世界带 player-state-v3 与 memory-observer-v3', () => {
  const world = createMemoryWorld(memoryConfigV6());
  validateMemoryWorld(world);
  assert.equal(world.memoryModel.config.version, 'memory-config-v6');
  assert.equal(world.societyModel.config.version, 'society-config-v5');
  assert.equal(world.playerModel.version, 'player-state-v3');
  assert.equal(world.memoryModel.observer.version, 'memory-observer-v3');
  assert.deepEqual(world.memoryModel.observer.initialActors.map((a) => a.actorId), ['actor-1', 'actor-2', 'actor-3', 'actor-4']);
  assert.deepEqual(world.memoryModel.observer.initialActors.map((a) => a.location), ['village', 'village', 'village', 'village']);
  assert.equal(world.memoryModel.observer.cursor, 0);
  assert.equal(world.memoryModel.observer.lastObservedTick, 0);
  assert.deepEqual(world.memoryModel.observer.actors.map((a) => a.memories.length), [0, 0, 0, 0]);
  assert.deepEqual(Object.keys(world.playerModel.ledger).sort(),
    ['earned', 'foodBought', 'foodGiven', 'foodSold', 'foodUsed', 'herbsBought', 'herbsSold', 'herbsUsed', 'spent']);
});

test('CP1b-2 v6 只接受 society-config-v5，旧 memory 不接受 society-config-v5，未知版本被拒', () => {
  const base = memoryConfigV6();
  validateMemoryWorld(createMemoryWorld(base));
  assert.throws(() => createMemoryWorld({...base, society: {...base.society, version: 'society-config-v4'}}),
    (error) => error.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => createMemoryWorld({...base, version: 'memory-config-v5'}),
    (error) => error.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => createMemoryWorld({...base, version: 'memory-config-v7'}),
    (error) => error.code === 'UNSUPPORTED_VERSION');
});

test('CP1b-3 v6 世界拒绝旧 observer 版本、缺 location 的名单与旧 player 版本', () => {
  const world = createMemoryWorld(memoryConfigV6());
  validateMemoryWorld(world);

  const staleObserver = JSON.parse(JSON.stringify(world));
  staleObserver.memoryModel.observer.version = 'memory-observer-v2';
  assert.throws(() => validateMemoryWorld(staleObserver), (error) => error.code === 'INVALID_INPUT');

  const noLocation = JSON.parse(JSON.stringify(world));
  for (const a of noLocation.memoryModel.observer.initialActors) delete a.location;
  assert.throws(() => validateMemoryWorld(noLocation), (error) => error.code === 'INVALID_INPUT');

  const stalePlayer = JSON.parse(JSON.stringify(world));
  stalePlayer.playerModel.version = 'player-state-v2';
  assert.throws(() => validateMemoryWorld(stalePlayer), (error) => error.code === 'INVALID_INPUT');
});

test('CP1b-4 赠粮只投影 donor/recipient 本人的 self 记忆，observable 严格、不改关系', () => {
  const tick = 144;
  const next = reduceMemoryFacts(giftState(), [giftFact(1, tick, 'gift-1')], tick);
  validateMemoryState(next);
  assert.equal(next.cursor, 1);
  assert.equal(next.lastObservedTick, tick);

  const by = (id) => next.actors.find((a) => a.actorId === id);
  const donor = by('actor-4').memories[0], recipient = by('actor-2').memories[0];
  assert.equal(donor.memoryId, 'memory-1-actor-4-self');
  assert.equal(recipient.memoryId, 'memory-1-actor-2-self');
  for (const m of [donor, recipient]) {
    assert.equal(m.sourceEventSeq, 1);
    assert.equal(m.occurrenceTick, tick);
    assert.equal(m.observedTick, tick);
    assert.equal(m.channel, 'self');
    assert.equal(m.importance, 1);
    assert.deepEqual(Object.keys(m.observable).sort(),
      ['commandId', 'direction', 'donorId', 'product', 'quantity', 'recipientId', 'type']);
  }
  assert.deepEqual(donor.observable, {type: 'food-gift', donorId: 'actor-4', recipientId: 'actor-2', product: 'food',
    quantity: 1, direction: 'given', commandId: 'gift-1'});
  assert.deepEqual(recipient.observable, {type: 'food-gift', donorId: 'actor-4', recipientId: 'actor-2', product: 'food',
    quantity: 1, direction: 'received', commandId: 'gift-1'});
  assert.deepEqual(by('actor-1').memories, []);
  assert.deepEqual(by('actor-3').memories, []);
  assert.deepEqual(next.actors.map((a) => a.relationships), [[], [], [], []]);
});

test('CP1b-4b v6 空世界的 observer 消费赠粮事实后仍通过 validateMemoryWorld', () => {
  const world = createMemoryWorld(memoryConfigV6());
  const observer = reduceMemoryFacts(world.memoryModel.observer, [giftFact(1, 144, 'gift-1')], 144);
  const next = {...world, memoryModel: {...world.memoryModel, observer}};
  validateMemoryWorld(next);
  assert.equal(next.memoryModel.observer.cursor, 1);
  assert.equal(next.memoryModel.observer.lastObservedTick, 144);
});

test('CP1b-5 v1/v2 reducer 不接受赠粮来源，缺 donor/recipient 的名单也被拒', () => {
  const tick = 144, facts = [giftFact(1, tick, 'gift-1')];
  const v1Roster = GIFT_ROSTER.map(({actorId, alive}) => ({actorId, alive}));
  assert.throws(() => reduceMemoryFacts(createMemoryState(v1Roster), facts, tick), (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => reduceMemoryFacts(createMemoryState(GIFT_ROSTER, 'memory-observer-v2'), facts, tick),
    (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => advanceActorMemory(createMemoryState(GIFT_ROSTER, 'memory-observer-v2'), facts, tick),
    (error) => error.code === 'INVALID_INPUT');
  const partial = [{actorId: 'actor-4', alive: true, location: 'village'}];
  assert.throws(() => reduceMemoryFacts(createMemoryState(partial, 'memory-observer-v3'), facts, tick),
    (error) => error.code === 'INVALID_INPUT');
  // v3 接受同一事实
  assert.equal(reduceMemoryFacts(giftState(), facts, tick).cursor, 1);
});

test('CP1b-6 赠粮的来源、字段集、方向、地点与转移恒等式反例全被拒', () => {
  const tick = 144, base = giftFact(1, tick, 'gift-1');
  const reject = (fact) => assert.throws(
    () => reduceMemoryFacts(giftState(), [fact], tick), (error) => error.code === 'INVALID_INPUT');
  const withPayload = (extra) => ({...base, payload: {...base.payload, ...extra}});

  reject({...base, sourceSystem: 'command-engine'});
  reject({...base, commandId: null});
  reject({...base, entityIds: ['actor-4']});
  reject({...base, entityIds: ['actor-2', 'actor-4']});
  reject({...base, entityIds: ['actor-4', 'actor-3']});
  reject({...base, causationEventSeqs: [1]});
  reject({...base, eventSeq: 2, causationEventSeqs: [2]});
  const missing = {...base.payload};
  delete missing.location;
  reject({...base, payload: missing});
  reject(withPayload({excess: 1}));
  reject(withPayload({quantity: 2}));
  reject(withPayload({product: 'herbs'}));
  reject(withPayload({location: 'forest'}));
  reject(withPayload({donorId: 'actor-2', recipientId: 'actor-4'}));
  reject(withPayload({donorId: 'actor-1'}));
  reject(withPayload({donorFoodAfter: base.payload.donorFoodBefore - 2}));
  reject(withPayload({recipientFoodAfter: base.payload.recipientFoodBefore + 2}));
  reject(withPayload({donorFoodBefore: 1.5}));
  reject(withPayload({donorFoodAfter: -1}));
  reject(withPayload({recipientFoodBefore: Number.NaN}));
  // 同一 commandId 的重复赠粮来源被拒
  assert.throws(() => reduceMemoryFacts(giftState(), [base, giftFact(2, tick, 'gift-1', 19, 18, 1, 2)], tick),
    (error) => error.code === 'INVALID_INPUT');
});

test('CP1b-7 重复 suffix 不新增记忆，cursor/观察时点与 seq、tick 门保持', () => {
  const tick = 144, facts = [giftFact(1, tick, 'gift-1')];
  const first = reduceMemoryFacts(giftState(), facts, tick);
  const again = advanceActorMemory(first, facts, tick);
  assert.deepEqual(again, first);
  assert.deepEqual(reduceMemoryFacts(first, [], tick), first);
  assert.equal(first.cursor, 1);
  assert.equal(first.lastObservedTick, tick);
  assert.throws(() => advanceActorMemory(first, facts, tick - 1), (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => reduceMemoryFacts(first, [giftFact(3, tick, 'gift-2', 19, 18, 1, 2)], tick),
    (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => reduceMemoryFacts(first, [giftFact(2, tick + 1, 'gift-2', 19, 18, 1, 2)], tick),
    (error) => error.code === 'INVALID_INPUT');
  // 观察时点前进后追加的新事实正常落账
  const later = reduceMemoryFacts(first, [giftFact(2, tick + 1, 'gift-2', 19, 18, 1, 2)], tick + 1);
  assert.equal(later.cursor, 2);
  assert.equal(later.lastObservedTick, tick + 1);
  assert.equal(later.actors.find((a) => a.actorId === 'actor-4').memories.length, 2);
});

test('CP1b-8 赠粮不增信任、旧 medicine-trade 仍 trust+10，v3 保留32条留存与排序', () => {
  const tick = 144, events = [medicineSaleFact(1, tick)];
  for (let i = 1; i <= 33; i++) events.push(giftFact(i + 1, tick, 'gift-' + i, 100 - (i - 1), 99 - (i - 1), i - 1, i));
  const state = reduceMemoryFacts(giftState(), events, tick);
  validateMemoryState(state);
  validateMemoryHistory(state, events);
  assert.equal(state.cursor, 34);

  const by = (id) => state.actors.find((a) => a.actorId === id);
  assert.equal(by('actor-4').memories.length, 32);
  assert.equal(by('actor-2').memories.length, 32);
  assert.deepEqual(by('actor-4').memories.map((m) => m.sourceEventSeq), Array.from({length: 32}, (_, i) => i + 3));
  assert.equal(by('actor-4').memories.at(-1).memoryId, 'memory-34-actor-4-self');
  assert.equal(by('actor-2').memories.at(-1).memoryId, 'memory-34-actor-2-self');
  assert.equal(by('actor-1').memories.length, 1);
  assert.equal(by('actor-3').memories.length, 1);
  // 赠粮不改关系；旧 medicine-trade 仍是双方 trust+10
  assert.deepEqual(by('actor-4').relationships, []);
  assert.deepEqual(by('actor-2').relationships, []);
  assert.deepEqual(by('actor-1').relationships, [{actorId: 'actor-3', trust: 10, lastSourceEventSeq: 1}]);
  assert.deepEqual(by('actor-3').relationships, [{actorId: 'actor-1', trust: 10, lastSourceEventSeq: 1}]);
});

test('CP1b-9 赠粮 getter/稀疏/异类结构在读取前被拒（descriptor-first）', () => {
  const tick = 144, base = giftFact(1, tick, 'gift-1');
  const reject = (fact) => assert.throws(
    () => reduceMemoryFacts(giftState(), [fact], tick), (error) => error.code === 'INVALID_INPUT');

  let quantityReads = 0;
  const payloadWithGetter = {...base.payload};
  Object.defineProperty(payloadWithGetter, 'quantity', {enumerable: true, get() { quantityReads += 1; return 1; }});
  reject({...base, payload: payloadWithGetter});
  assert.equal(quantityReads, 0);

  const sparseIds = {...base, entityIds: ['actor-4', 'actor-2']};
  sparseIds.entityIds.length = 3;
  reject(sparseIds);

  const accessorIds = {...base, entityIds: ['actor-4', 'actor-2']};
  Object.defineProperty(accessorIds.entityIds, '1', {enumerable: true, get() { return 'actor-2'; }});
  reject(accessorIds);

  reject({...base, payload: {...base.payload, donorFoodBefore: undefined}});
  reject({...base, payload: {...base.payload, donorFoodBefore: () => 1}});
  reject({...base, causationEventSeqs: [1, undefined]});
  reject({...base, entityIds: ['actor-4', 2]});
});

test('CP1b-10 validateMemoryHistory 复算一致，篡改记忆/错版本/缺来源被拒', () => {
  const tick = 144, events = [giftFact(1, tick, 'gift-1')];
  const state = reduceMemoryFacts(giftState(), events, tick);
  validateMemoryHistory(state, events);

  const tampered = JSON.parse(JSON.stringify(state));
  tampered.actors[3].memories[0].observable.direction = 'received';
  assert.throws(() => validateMemoryHistory(tampered, events), (error) => error.code === 'INVALID_INPUT');

  const dropped = JSON.parse(JSON.stringify(state));
  dropped.actors[1].memories = [];
  assert.throws(() => validateMemoryHistory(dropped, events), (error) => error.code === 'INVALID_INPUT');

  assert.throws(() => validateMemoryHistory(state, []), (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => validateMemoryState({...state, version: 'memory-observer-v9'}),
    (error) => error.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => createMemoryState(GIFT_ROSTER.map(({actorId, alive}) => ({actorId, alive})), 'memory-observer-v3'),
    (error) => error.code === 'INVALID_INPUT');
  assert.throws(() => createMemoryState([{actorId: 'actor-4', alive: true, location: 'forest'}], 'memory-observer-v3'),
    (error) => error.code === 'INVALID_INPUT');
});

test('CP1b-11 projectActorEvent 旧类型输出不变，赠粮对无关 actor 零投影', () => {
  const sale = medicineSaleFact(1, 144);
  const [projection] = projectActorEvent(sale, 'actor-1', 'village');
  assert.deepEqual(projection.observable,
    {type: 'medicine-trade', sellerId: 'actor-1', buyerId: 'actor-3', herbs: 1, price: 5, cashDelta: 5});
  assert.equal(projection.channel, 'interaction');
  assert.equal(projection.importance, 2);
  assert.equal(projection.memoryId, 'memory-1-actor-1-interaction');
  assert.deepEqual(projectActorEvent(sale, 'actor-2', 'village'), []);
  assert.deepEqual(projectActorEvent(giftFact(1, 144, 'gift-1'), 'actor-1', 'village'), []);
  assert.deepEqual(projectActorEvent(giftFact(1, 144, 'gift-1'), 'actor-3', 'village'), []);
});

// ---------------------------------------------------------------- Controller boundary cases (CP1b-R)
// These observer checks validate structure/projection consistency, not authoritative asset commits.
const controllerBoundaryRoster = [
  {actorId: 'actor-1', alive: true, location: 'village'},
  {actorId: 'actor-2', alive: true, location: 'village'},
  {actorId: 'actor-3', alive: true, location: 'village'},
  {actorId: 'actor-4', alive: true, location: 'village'},
];
const controllerBoundaryFresh = () => createMemoryState(controllerBoundaryRoster, 'memory-observer-v3');
const controllerBoundaryGift = (eventSeq, tick, commandId, donorFoodBefore = 20, recipientFoodBefore = 0) => ({
  schemaVersion: 1, eventSeq, tick, type: 'FoodGiftCommitted', sourceSystem: 'scene', commandId,
  causationEventSeqs: [], entityIds: ['actor-4', 'actor-2'],
  payload: {donorId: 'actor-4', recipientId: 'actor-2', product: 'food', quantity: 1, location: 'village',
    donorFoodBefore, donorFoodAfter: donorFoodBefore - 1,
    recipientFoodBefore, recipientFoodAfter: recipientFoodBefore + 1},
});
const controllerBoundaryActor = (state, id) => state.actors.find((row) => row.actorId === id);

test('CP1b-R1 delayed history replay observes a gift at its occurrence tick', () => {
  const fact = controllerBoundaryGift(1, 10, 'gift-delayed');
  const state = advanceActorMemory(controllerBoundaryFresh(), [fact], 20);
  for (const id of ['actor-4', 'actor-2']) {
    assert.equal(controllerBoundaryActor(state, id).memories[0].occurrenceTick, 10);
    assert.equal(controllerBoundaryActor(state, id).memories[0].observedTick, 10);
  }
  assert.equal(state.lastObservedTick, 20);
});

test('CP1b-R2 full-history validation rejects a changed gift observation tick', () => {
  const fact = controllerBoundaryGift(1, 10, 'gift-tamper');
  const state = advanceActorMemory(controllerBoundaryFresh(), [fact], 12);
  controllerBoundaryActor(state, 'actor-4').memories[0].observedTick = 11;
  assert.throws(() => validateMemoryHistory(state, [fact]));
});

test('CP1b-R3 forest donor contradicts village gift and rejects without changing input', () => {
  const state = controllerBoundaryFresh();
  controllerBoundaryActor(state, 'actor-4').location = 'forest';
  const before = structuredClone(state);
  assert.throws(() => reduceMemoryFacts(state, [controllerBoundaryGift(1, 10, 'gift-forest')], 10),
    (error) => error.code === 'INVALID_INPUT');
  assert.deepEqual(state, before);
});

test('CP1b-R4 dead donor contradicts gift and rejects without changing input', () => {
  const state = controllerBoundaryFresh();
  controllerBoundaryActor(state, 'actor-4').alive = false;
  const before = structuredClone(state);
  assert.throws(() => reduceMemoryFacts(state, [controllerBoundaryGift(1, 10, 'gift-dead')], 10),
    (error) => error.code === 'INVALID_INPUT');
  assert.deepEqual(state, before);
});

test('CP1b-R5 gift observer enforces recipient capacity 1000', () => {
  assert.throws(() => reduceMemoryFacts(controllerBoundaryFresh(),
    [controllerBoundaryGift(1, 10, 'gift-full-recipient', 20, 1000)], 10));
});

test('CP1b-R6 recipient capacity allows the 999-to-1000 boundary', () => {
  const next = reduceMemoryFacts(controllerBoundaryFresh(),
    [controllerBoundaryGift(1, 10, 'gift-capacity-boundary', 20, 999)], 10);
  assert.equal(next.cursor, 1);
  assert.equal(controllerBoundaryActor(next, 'actor-2').memories.length, 1);
  assert.equal(controllerBoundaryActor(next, 'actor-4').memories.length, 1);
});

test('CP1b-R7 gift observer rejects a donor transfer below zero', () => {
  assert.throws(() => reduceMemoryFacts(controllerBoundaryFresh(),
    [controllerBoundaryGift(1, 10, 'gift-empty-donor', 0, 0)], 10));
});

test('CP1b-R8 gift observer rejects arithmetic crossing safe-integer bounds', () => {
  const max = Number.MAX_SAFE_INTEGER;
  assert.throws(() => reduceMemoryFacts(controllerBoundaryFresh(),
    [controllerBoundaryGift(1, 10, 'gift-recipient-overflow', 20, max)], 10));
});

test('CP1b-R9 full-log audit rejects repeated gift command IDs across incremental suffixes', () => {
  const facts = [controllerBoundaryGift(1, 10, 'gift-once'), controllerBoundaryGift(2, 20, 'gift-once')];
  assert.throws(() => advanceActorMemory(controllerBoundaryFresh(), facts, 20));
});

test('CP1b-R10 legacy three-argument projection keeps its no-gift output', () => {
  assert.deepEqual(projectActorEvent(controllerBoundaryGift(1, 10, 'gift-legacy'), 'actor-4', 'village'), []);
});

test('CP1b-R11 observer-v3 retains v2 travel location projection', () => {
  const travel = {
    schemaVersion: 1, eventSeq: 1, tick: 12, type: 'PlayerActionCommitted',
    sourceSystem: 'command-engine', commandId: 'travel-to-forest', causationEventSeqs: [], entityIds: ['actor-4'],
    payload: {
      actorId: 'actor-4', type: 'PlayerTravel', startTick: 0, endTick: 12,
      product: null, quantity: 0, unitPrice: 0, amount: 0,
      before: {location: 'village', fatigue: 0, wallet: 100, inventory: {food: 3, herbs: 1}, publicStock: {food: 10, herbs: 10}, communalGold: 0},
      after: {location: 'forest', fatigue: 100, wallet: 100, inventory: {food: 3, herbs: 1}, publicStock: {food: 10, herbs: 10}, communalGold: 0},
    },
  };
  const state = advanceActorMemory(controllerBoundaryFresh(), [travel], 12);
  assert.equal(controllerBoundaryActor(state, 'actor-4').location, 'forest');
});

// ---------------------------------------------------------------- CP1c — real scene bundle and no-op runtime closure
// New modules are imported only inside these required tests so a missing scene module is an
// explicit missingSCENE failure here and cannot prevent the existing 37 tests from loading.
async function cp1cImport(specifier, label, missingPrefix = 'missingSCENE') {
  try { return await import(specifier); }
  catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`${missingPrefix} ${label}: ${error.message}`, {cause: error});
    }
    throw error;
  }
}

const CP1C_RECIPES = ['affordable', 'earn-then-buy', 'no-opportunity', 'wage-refused', 'no-food'];

function cp1cExperience(world, actorId) {
  return world.experienceModel.actors.find((actor) => actor.actorId === actorId).workExperienceState;
}

test('CP1c-R1 five scene recipes differ from encounter config only at memory and society versions', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  assert.equal(typeof fixture.defaultSceneVillageConfig, 'function', 'missingSCENE defaultSceneVillageConfig export');
  for (const recipe of CP1C_RECIPES) {
    const sceneConfig = fixture.defaultSceneVillageConfig(recipe);
    const expected = defaultEncounterVillageConfig(recipe);
    assert.equal(sceneConfig.memory.version, 'memory-config-v6');
    assert.equal(sceneConfig.memory.society.version, 'society-config-v5');
    const normalized = structuredClone(sceneConfig);
    normalized.memory.version = expected.memory.version;
    normalized.memory.society.version = expected.memory.society.version;
    assert.deepEqual(normalized, expected, `${recipe}: only the two D4A versions may differ`);
  }
  assert.deepEqual(fixture.defaultSceneVillageConfig(), fixture.defaultSceneVillageConfig('no-opportunity'));
  assert.throws(() => fixture.defaultSceneVillageConfig('no-such-recipe'), (error) => error.code === 'UNSUPPORTED_VERSION');
});

test('CP1c-R2 scene fixture creates a real schema3 bundle and validates its complete versions', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const runtime = await cp1cImport('../../runtime/core/scene-runtime.mjs', 'scene runtime');
  const worldState = await import('../../runtime/core/world-state.mjs');
  assert.equal(runtime.SCENE_PROFILE, 'scene-survival-village');
  assert.equal(runtime.SCENE_RULES, 'd-scene-survival-v1');
  assert.equal(typeof fixture.sceneSystems, 'function');
  assert.equal(typeof fixture.createSceneVillage, 'function');
  assert.equal(typeof runtime.validateSceneWorldState, 'function');
  assert.equal(typeof runtime.sceneRuntimeHooks, 'object', 'missingSCENE sceneRuntimeHooks export');
  for (const hook of ['createWorld', 'beforeSystems', 'afterSystems', 'applyAction', 'settleDay', 'validateHistory']) {
    assert.equal(typeof runtime.sceneRuntimeHooks[hook], 'function', `missingSCENE sceneRuntimeHooks.${hook}`);
  }
  const {bundle, systems} = fixture.createSceneVillage(42, 'cp1c-scene-bundle');
  assert.deepEqual(Object.keys(systems).sort(), ['encounter', 'scene', 'society', 'survival']);
  assert.equal(bundle.snapshot.schemaVersion, 3);
  assert.equal(bundle.snapshot.rulesVersion, runtime.SCENE_RULES);
  assert.equal(bundle.snapshot.fixtureId, 'scene-survival-village');
  assert.equal(bundle.snapshot.fixtureVersion, '1');
  assert.equal(bundle.snapshot.tick, 0);
  assert.equal(bundle.snapshot.instantCommits, 0);
  assert.equal(bundle.snapshot.revision, bundle.snapshot.tick + bundle.snapshot.instantCommits);
  assert.equal(bundle.snapshot.world.memoryModel.config.version, 'memory-config-v6');
  assert.equal(bundle.snapshot.world.societyModel.config.version, 'society-config-v5');
  assert.equal(bundle.snapshot.world.memoryModel.observer.version, 'memory-observer-v3');
  assert.equal(bundle.snapshot.world.playerModel.version, 'player-state-v3');
  assert.equal(bundle.snapshot.world.encounterModel.version, 'encounter-runtime-v2');
  assert.equal(Object.hasOwn(bundle.snapshot.world, 'sceneModel'), false);
  runtime.validateSceneWorldState(bundle.snapshot.world, {tick: 0});
  worldState.validateBundle(bundle, {rulesVersion: runtime.SCENE_RULES, systems});
});

test('CP1c-R3 old and scene rules, config, observer, player, and encounter model versions reject cross-pairing', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const runtime = await cp1cImport('../../runtime/core/scene-runtime.mjs', 'scene runtime');
  const oldFixture = await import('../../runtime/fixtures/encounter-survival-village.mjs');
  const oldRuntime = await import('../../runtime/core/encounter-runtime.mjs');
  const worldState = await import('../../runtime/core/world-state.mjs');
  const scene = fixture.createSceneVillage(42, 'cp1c-version-scene');
  const old = oldFixture.createEncounterVillage(42, 'cp1c-version-old');
  assert.throws(() => worldState.validateBundle(scene.bundle,
    {rulesVersion: oldRuntime.ENCOUNTER_RULES, systems: scene.systems}));
  assert.throws(() => worldState.validateBundle(old.bundle,
    {rulesVersion: runtime.SCENE_RULES, systems: old.systems}));

  const oldConfig = oldFixture.defaultEncounterVillageConfig('no-opportunity');
  assert.throws(() => fixture.createSceneVillage(42, 'cp1c-old-config', oldConfig));
  const staleObserver = structuredClone(scene.bundle);
  staleObserver.snapshot.world.memoryModel.observer.version = 'memory-observer-v2';
  assert.throws(() => worldState.validateBundle(staleObserver,
    {rulesVersion: runtime.SCENE_RULES, systems: scene.systems}));
  const stalePlayer = structuredClone(scene.bundle);
  stalePlayer.snapshot.world.playerModel.version = 'player-state-v2';
  assert.throws(() => worldState.validateBundle(stalePlayer,
    {rulesVersion: runtime.SCENE_RULES, systems: scene.systems}));
  const staleEncounter = structuredClone(scene.bundle);
  staleEncounter.snapshot.world.encounterModel.version = 'encounter-runtime-v1';
  assert.throws(() => worldState.validateBundle(staleEncounter,
    {rulesVersion: runtime.SCENE_RULES, systems: scene.systems}));
});

test('CP1c-R4 tick1 publication and tick144 no-op preserve the hand-computed village state', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const runtime = await cp1cImport('../../runtime/core/scene-runtime.mjs', 'scene runtime');
  const engine = await import('../../runtime/core/command-engine.mjs');
  const {bundle, systems} = fixture.createSceneVillage(42, 'cp1c-no-opportunity',
    fixture.defaultSceneVillageConfig('no-opportunity'));
  const session = engine.createSimulationSession(bundle, systems);
  session.advanceTicks(1);
  const atOne = session.getBundle();
  const quote = atOne.eventLog.find((event) => event.type === 'SurvivalFoodQuoteAnnounced');
  assert.ok(quote, 'the real tick1 public food quote must be present');
  assert.equal(quote.tick, 1);
  assert.deepEqual(quote.payload, {location: 'village', product: 'food', price: 10, available: true});
  assert.equal(atOne.snapshot.world.resources.food, 540, 'opening public food stock remains a world-state value');
  session.advanceTicks(143);
  const day = session.getBundle();
  assert.equal(day.snapshot.tick, 144);
  assert.equal(day.snapshot.revision, 144);
  assert.equal(day.snapshot.world.resources.food, 464);
  assert.equal(day.snapshot.world.playerModel.inventory.food, 19);
  assert.equal(day.snapshot.world.actorModel.actors.find((actor) => actor.actorId === 'actor-2').hunger, 300);
  assert.deepEqual(day.eventLog.filter((event) => event.type === 'FoodGiftCommitted'), []);
  assert.equal(day.eventLog.filter((event) => event.type === 'SocietyDaySettled').length, 1);
  assert.ok(day.snapshot.world.societyModel.agents.every((agent) => agent.state.wallet === 0), 'no wage is paid');
  assert.deepEqual(cp1cExperience(day.snapshot.world, 'actor-2').samples, [], 'no Work experience is invented');
  runtime.validateSceneWorldState(day.snapshot.world, {tick: 144});
});

test('CP1c-R5 advancing 144 ticks at once equals 1 plus 143 ticks byte-for-byte', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const engine = await import('../../runtime/core/command-engine.mjs');
  const {bundle, systems} = fixture.createSceneVillage(42, 'cp1c-partition-equivalence',
    fixture.defaultSceneVillageConfig('no-opportunity'));
  const oneShot = engine.createSimulationSession(bundle, systems);
  oneShot.advanceTicks(144);
  const split = engine.createSimulationSession(bundle, systems);
  split.advanceTicks(1);
  split.advanceTicks(143);
  assert.equal(canonicalJson(split.getBundle()), canonicalJson(oneShot.getBundle()));
});

test('CP1c-R6 scene bundle saves and restores through the existing checkpoint API', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const runtime = await cp1cImport('../../runtime/core/scene-runtime.mjs', 'scene runtime');
  const engine = await import('../../runtime/core/command-engine.mjs');
  const checkpoint = await import('../../runtime/persistence/checkpoint-store.mjs');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const {fileURLToPath} = await import('node:url');
  const evidence = fileURLToPath(new URL('../../artifacts/world-runtime-d4-cp1c-controller/', import.meta.url));
  await fs.mkdir(evidence, {recursive: true});
  const directory = await fs.mkdtemp(path.join(evidence, 'checkpoint-'));
  try {
    const {bundle, systems} = fixture.createSceneVillage(42, 'cp1c-checkpoint');
    const session = engine.createSimulationSession(bundle, systems);
    session.advanceTicks(144);
    const expected = session.getBundle();
    const file = await checkpoint.saveCheckpoint(expected,
      {directory, rulesVersion: runtime.SCENE_RULES, systems});
    const restored = await checkpoint.loadCheckpoint(file,
      {rulesVersion: runtime.SCENE_RULES, systems});
    assert.deepEqual(restored, expected);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

async function cp1cRunOldFixture(fixtureModule, engineModule, recipe, simulationId) {
  const config = fixtureModule[recipe.config](recipe.name);
  const {bundle, systems} = fixtureModule[recipe.create](42, simulationId, config);
  const session = engineModule.createSimulationSession(bundle, systems);
  session.advanceTicks(144);
  return session.getBundle();
}

// Archived compatibility baselines were generated from c4ac067a3debe6d104a7b0d85672c442184e4972
// (archive SHA256 a4ae7587b602d32fb46af4b90ab4287aa7f600ea4fffffa79243d189f20111bf), seed 42,
// recipe no-opportunity, 144 ticks, with the simulation IDs below. Rebuild from that immutable
// archive using `node artifacts/world-runtime-d4-cp1c-controller/baseline-144.mjs`; the tracked
// tests intentionally need only these fixed whole-bundle hashes, not the ignored archive files.
test('CP1c-R7 old encounter 144tick complete bundle retains the c4ac067 canonical baseline', async () => {
  const currentFixture = await import('../../runtime/fixtures/encounter-survival-village.mjs');
  const currentEngine = await import('../../runtime/core/command-engine.mjs');
  const data = await import('../../runtime/core/data-contract.mjs');
  const crypto = await import('node:crypto');
  const options = {config: 'defaultEncounterVillageConfig', create: 'createEncounterVillage', name: 'no-opportunity'};
  const actual = await cp1cRunOldFixture(currentFixture, currentEngine, options, 'encounter-survival-village');
  const canonical = data.canonicalJson(actual);
  assert.equal(crypto.createHash('sha256').update(canonical, 'utf8').digest('hex'),
    '1e56e2d60191251037375fd55ee6c50f6fb6e75758054c2551b72729e4116dce');
});

test('CP1c-R8 old survival 144tick complete bundle retains the c4ac067 canonical baseline', async () => {
  const currentFixture = await import('../../runtime/fixtures/survival-village.mjs');
  const currentEngine = await import('../../runtime/core/command-engine.mjs');
  const data = await import('../../runtime/core/data-contract.mjs');
  const crypto = await import('node:crypto');
  const options = {config: 'defaultSurvivalVillageConfig', create: 'createSurvivalVillage', name: 'no-opportunity'};
  const actual = await cp1cRunOldFixture(currentFixture, currentEngine, options, 'survival-village');
  const canonical = data.canonicalJson(actual);
  assert.equal(crypto.createHash('sha256').update(canonical, 'utf8').digest('hex'),
    '0e6ea2759e11cf12567720f355b571ce809cb4eb28abe1cc231f7bb5f317d95a');
});

test('CP1c-R9 a late 144tick scene failure rolls back the whole batch, history, schedule, RNG, and stats', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const engine = await import('../../runtime/core/command-engine.mjs');
  const {bundle, systems: normalSystems} = fixture.createSceneVillage(42, 'cp1c-batch-rollback',
    fixture.defaultSceneVillageConfig('no-opportunity'));
  const initial = structuredClone(bundle);
  let injectedHandlerCalled = false;
  let failOnce = true;
  const systems = {...normalSystems, society() {
    if (failOnce) {
      failOnce = false;
      injectedHandlerCalled = true;
      throw Object.assign(new Error('CP1c injected day-144 failure'), {code: 'TICK_FAILED'});
    }
    return normalSystems.society(...arguments);
  }};
  const session = engine.createSimulationSession(bundle, systems);
  assert.throws(() => session.advanceTicks(144),
    (error) => error.code === 'TICK_FAILED' && error.cause?.message === 'CP1c injected day-144 failure',
    'the wrapped TICK_FAILED error must preserve the injected day-144 cause');
  assert.equal(injectedHandlerCalled, true, 'the daily settlement handler must be reached after tick 1');
  assert.equal(canonicalJson(session.getBundle()), canonicalJson(initial),
    'failure after tick 1 must publish no quote, clock, RNG, event, or schedule prefix');
  assert.deepEqual(session.getStats(), {idleTicks: 0, activityTicks: 0},
    'failed scene batch must restore public activity statistics too');

  session.advanceTicks(144);
  const retry = engine.createSimulationSession(initial, normalSystems);
  retry.advanceTicks(144);
  assert.equal(canonicalJson(session.getBundle()), canonicalJson(retry.getBundle()),
    'the same failed session can retry and match a fresh session from the untouched input');
});

test('CP1c-R10 scene validation rejects instant commits and generic external PlayerAction inputs', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const runtime = await cp1cImport('../../runtime/core/scene-runtime.mjs', 'scene runtime');
  const worldState = await import('../../runtime/core/world-state.mjs');
  const {bundle, systems} = fixture.createSceneVillage(42, 'cp1c-external-input-boundary',
    fixture.defaultSceneVillageConfig('no-opportunity'));
  const committed = structuredClone(bundle);
  committed.snapshot.instantCommits = 1;
  committed.snapshot.revision = committed.snapshot.tick + committed.snapshot.instantCommits;
  assert.throws(() => worldState.validateBundle(committed,
    {rulesVersion: runtime.SCENE_RULES, systems}),
  'an empty-history scene cannot claim an external instant commit');

  const externalRest = {
    commandId: 'cp1c-external-rest', type: 'PlayerAction', targetTick: 6,
    payload: {startTick: 0, intent: {commandId: 'cp1c-external-rest', type: 'PlayerRest', payload: {}}},
  };
  assert.throws(() => worldState.createInitialBundle({
    rulesVersion: runtime.SCENE_RULES,
    simulationId: 'cp1c-external-input-boundary',
    fixtureId: bundle.snapshot.fixtureId,
    fixtureVersion: bundle.snapshot.fixtureVersion,
    seed: 42,
    world: bundle.snapshot.world,
    scheduledTasks: bundle.snapshot.scheduledTasks,
    commands: [externalRest],
  }, systems),
  'scene profile has no external intent/journal support before complete replay exists');
});

test('CP1c-R11 scene world validator rejects malformed values and accessor-bearing context before reads', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const runtime = await cp1cImport('../../runtime/core/scene-runtime.mjs', 'scene runtime');
  const world = fixture.createSceneVillage(42, 'cp1c-validator-input',
    fixture.defaultSceneVillageConfig('no-opportunity')).bundle.snapshot.world;
  const violations = [];
  let nullError;
  try { runtime.validateSceneWorldState(null, {}); } catch (error) { nullError = error; }
  if (nullError?.code !== 'INVALID_INPUT')
    violations.push(`null world returned ${nullError?.code ?? nullError?.name ?? 'no error'}, expected INVALID_INPUT`);
  let reads = 0;
  const context = {get tick() { reads++; return 0; }};
  let accessorError;
  try { runtime.validateSceneWorldState(world, context); } catch (error) { accessorError = error; }
  if (accessorError?.code !== 'INVALID_INPUT')
    violations.push(`accessor context returned ${accessorError?.code ?? accessorError?.name ?? 'no error'}, expected INVALID_INPUT`);
  if (reads !== 0) violations.push(`context getter invoked ${reads} time(s), expected zero`);
  assert.deepEqual(violations, [], 'scene validator must reject invalid values before property reads');
});

test('CP1c-R12 runtime entry modules import in fresh Node processes without top-level failures', async () => {
  const {spawnSync} = await import('node:child_process');
  const path = await import('node:path');
  const {fileURLToPath, pathToFileURL} = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const failures = [];
  for (const entry of [
    'runtime/core/scene-runtime.mjs',
    'runtime/core/motivation-runtime.mjs',
    'runtime/core/command-engine.mjs',
    'runtime/core/world-state.mjs',
  ]) {
    const moduleUrl = pathToFileURL(path.resolve(root, entry)).href;
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(moduleUrl)});`],
      {cwd: root, encoding: 'utf8'});
    if (probe.error) failures.push(`${entry}: child process failed to start: ${probe.error.message}`);
    else if (probe.status !== 0) failures.push(`${entry}: fresh import exit=${probe.status}; stderr=${probe.stderr}`);
  }
  assert.deepEqual(failures, [], 'each entry must import in a separate fresh process');
});

test('CP1c-R13 affordable scene consumes one successful day-one BuyFood purchase', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const engine = await import('../../runtime/core/command-engine.mjs');
  const {bundle, systems} = fixture.createSceneVillage(42, 'cp1c-affordable-seed42',
    fixture.defaultSceneVillageConfig('affordable'));
  const session = engine.createSimulationSession(bundle, systems);
  session.advanceTicks(144);

  const day = session.getBundle();
  const world = day.snapshot.world;
  const actor = world.actorModel.actors.find((entry) => entry.actorId === 'actor-2');
  const estate = world.societyModel.agents.find((entry) => entry.state.actorId === 'actor-2').state;
  const fact = day.eventLog.find((event) => event.type === 'SocietyActionCommitted' &&
    event.payload?.actorId === 'actor-2' && event.payload?.action === 'BuyFood');
  const receipt = fact && day.snapshot.commandReceipts[fact.commandId];

  assert.equal(actor.hunger, 100, 'one ration is consumed after reducing hunger from 200');
  assert.equal(estate.wallet, 20, 'the 10-coin purchase leaves the initial 30-coin wallet at 20');
  assert.equal(estate.ledger.foodBought, 1);
  assert.equal(estate.ledger.foodUsed, 1);
  assert.ok(fact, 'a successful BuyFood must produce its committed society fact');
  assert.ok(receipt, 'the committed fact must have its persisted command receipt');
  assert.equal(receipt.status, 'succeeded');
  assert.equal(receipt.result.price, 10);
  assert.deepEqual(receipt.result.before, {communalGold: 970, inventory: {food: 0, herbs: 0}, wallet: 30});
  assert.deepEqual(receipt.result.after, {communalGold: 980, inventory: {food: 1, herbs: 0}, wallet: 20});
  assert.equal(canonicalJson(receipt.result), canonicalJson(fact.payload));
});

test('CP1c-R14 earn-then-buy pays once and a later-day purchase succeeds after the request window', async () => {
  const fixture = await cp1cImport('../../runtime/fixtures/scene-survival-village.mjs', 'scene fixture');
  const engine = await import('../../runtime/core/command-engine.mjs');
  const {bundle, systems} = fixture.createSceneVillage(42, 'cp1c-earn-then-buy-seed42',
    fixture.defaultSceneVillageConfig('earn-then-buy'));
  const session = engine.createSimulationSession(bundle, systems);
  session.advanceTicks(288);

  const day = session.getBundle();
  const world = day.snapshot.world;
  const estate = world.societyModel.agents.find((entry) => entry.state.actorId === 'actor-2').state;
  const facts = day.eventLog.filter((event) => event.type === 'SocietyActionCommitted' &&
    event.payload?.actorId === 'actor-2');
  const work = facts.find((event) => event.tick === 144 && event.payload.action === 'WorkForPay');
  const buy = facts.find((event) => event.tick === 288 && event.payload.action === 'BuyFood');

  assert.ok(work, 'the first day must commit the available paid work');
  assert.ok(buy, 'the day-two food purchase must remain available after the earlier request window');
  for (const fact of [work, buy]) {
    const receipt = day.snapshot.commandReceipts[fact.commandId];
    assert.ok(receipt, `${fact.payload.action} must have a persisted command receipt`);
    assert.equal(receipt.status, 'succeeded');
    assert.equal(canonicalJson(receipt.result), canonicalJson(fact.payload));
  }
  assert.equal(estate.ledger.wages, 20);
  assert.equal(estate.ledger.foodBought, 1);
  assert.equal(estate.ledger.foodUsed, 1);
  assert.equal(estate.wallet, 10, 'the 20-coin wage funds the 10-coin food purchase');
  assert.equal(estate.inventory.food, 0, 'the purchased ration is consumed by the end of day two');
});
