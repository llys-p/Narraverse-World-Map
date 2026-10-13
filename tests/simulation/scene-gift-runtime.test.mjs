import test from 'node:test';
import assert from 'node:assert/strict';

import {defaultEncounterVillageConfig} from '../../runtime/fixtures/encounter-survival-village.mjs';
import {createSocietyWorld, validateSocietyWorld, defaultSocietyConfig} from '../../runtime/core/society.mjs';
import {createPlayerPlayState} from '../../runtime/core/player-state.mjs';
import {validateHunterWorld} from '../../runtime/core/hunter.mjs';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';

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
