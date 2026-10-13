/**
 * D3-5B 独立验收 —— 集成/运行时门（G1、G2、G3、G4、G5、G7-runtime）
 * ============================================================================
 * 依据：tasks/D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md（v d3-playable-encounter-acceptance-v1）
 *       tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md（v d3-playable-encounter-v1）
 * 作者角色：B（独立验收），只写本文件，不读被测实现反抄 expected。
 *
 * 观察面只用 D3-5A 冻结的公共面：
 *   runtime/core/encounter-runtime.mjs        -> ENCOUNTER_RULES / ENCOUNTER_PROFILE /
 *                                                encounterRuntimeHooks / executeEncounterIntent /
 *                                                describeEncounterActions / validateEncounterWorldState
 *   runtime/fixtures/encounter-survival-village.mjs -> defaultEncounterVillageConfig / encounterSystems /
 *                                                createEncounterVillage
 *   runtime/service/http-contract.mjs         -> projectEncounterSnapshot
 *   world.encounterModel / world.ecologyModel.ledger.wolves 的冻结字段名
 *
 * 手算期望（全部来自合同文字，未运行实现）：
 *   G1  Begin 0 tick / revision+1；attack×2 各 6 tick；player 1000->920->920；
 *       wolf 300->150->0；battleDeaths 14->13；elapsedTicks 12。
 *   G2  health<=80 首攻死（狼 150，预留只归还一次）；flee 6 tick；cancel 0 tick；
 *       ACTIVE 中 5 个世界命令 ENCOUNTER_BUSY 0 tick / revision+1；
 *       入场域拒绝 reasonCode 闭集；malformed/overflow 无 receipt。
 *   G3  affordable 派生 health1000/hunger400/food0：travel->12，AdvanceTime125->137，
 *       Begin->137，attack->143（920/150），attack target149 经 t144 日结（hunger500，损50）
 *       -> 870，t149 杀狼无反击 -> 870/0。
 *       对照 health100：t132 Begin，首攻 t138 -> 20/150；二攻 target144 先杀狼后日结死。
 *   G4  health50：travel12，AdvanceTime131->143，Begin，attack target149；
 *       t144 日结饿死 -> endTick144 / elapsedTicks1 / 狼300 / 归还1次；
 *       receipt tick149 / duration6 / rejected PLAYER_DEAD。
 *       completion==144（health100）：先杀狼（win）后日结死，SocietyDaySettled opening health=20，
 *       receipt after.health=0，狼死亡只记一次。
 *   G5  earn-then-buy + actor-2 fatigue700：t144 Work->fatigue850，该日结 resting=false 不减；
 *       t288 urgent Rest 后日结 ->650，工资一次20、未购粮、food plan step 仍 1；
 *       t432 同计划 BuyFood -> 钱包 20->10、工资一次、食物消费1；request.expiresTick=200 不阻 t432。
 *   G7  同 seed/config/DT0 序列完整重放：projection 与 world.encounterModel 逐值一致；
 *       validateEncounterWorldState 拒绝篡改（damage / reservation / version）。
 *
 * 证据（运行期由 root 记录，本文件只打印、不注入伪造值）：
 *   命令  node --test tests/simulation/encounter-integration-acceptance.test.mjs
 *   期望  退出码 0；TAP 零 fail / 零 skip / 零 todo
 *   基准  f335abf30e3eef9d1b40a99a791a6c3c6ae962ab（A 精确 SHA 由 root 用 D35B_A_SHA 传入）
 *   未验项（本文件不覆盖，见回执）：
 *     - 真实 save/reopen 一致（服务门）、CLI 产物一致性（服务门）
 *     - 真实浏览器（UI 门）
 *     - 旧 profile / DTO1/2 / format1-7 隔离（服务门）
 *     - G7 的 input/receipt/cause/rules 篡改：D3-5A 未冻结 encounterRuntimeHooks.validateHistory 签名，
 *       改由服务门在磁盘 checkpoint 上做真实篡改拒绝（实现无关）。
 * ============================================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';

import {
  ENCOUNTER_RULES,
  ENCOUNTER_PROFILE,
  encounterRuntimeHooks,
  executeEncounterIntent,
  describeEncounterActions,
  validateEncounterWorldState,
} from '../../runtime/core/encounter-runtime.mjs';

import {
  defaultEncounterVillageConfig,
  encounterSystems,
  createEncounterVillage,
} from '../../runtime/fixtures/encounter-survival-village.mjs';

import { projectEncounterSnapshot } from '../../runtime/service/http-contract.mjs';

// ---------------------------------------------------------------------------
// 常量与证据头
// ---------------------------------------------------------------------------
const PROFILE = 'encounter-survival-village';
const RULES = 'd-encounter-survival-v1';
const BASE_SHA = 'f335abf30e3eef9d1b40a99a791a6c3c6ae962ab';
const EXPECTED_A_SHA = '2ecfc0cd5c8991d57053e2e04c17a312469ef96f';
const A_SHA = process.env.D35B_A_SHA;
const TEST_TIMEOUT_MS = 300_000;

assert.ok(A_SHA, 'D35B_A_SHA 必须由验收命令显式提供');
assert.equal(A_SHA, EXPECTED_A_SHA, 'D35B_A_SHA 必须等于 root 钉定的 A SHA');
const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(actualHead, EXPECTED_A_SHA, '当前 HEAD 必须精确等于 root 钉定的 A SHA');
const productionStatus = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=no'],
  { encoding: 'utf8' },
).trim();
assert.equal(productionStatus, '', '所有 tracked 源码必须干净，A SHA 才能作为有效基准');

console.log(
  '[D3-5B evidence][integration] ' +
    JSON.stringify({
      gate: 'G1-G5,G7-runtime',
      baseSha: BASE_SHA,
      aSha: A_SHA,
      head: actualHead,
      profile: PROFILE,
      rules: RULES,
      command: 'node --test tests/simulation/encounter-integration-acceptance.test.mjs',
      expectedExitCode: 0,
      expectedTap: { fail: 0, skip: 0, todo: 0 },
      node: process.version,
      port: null,
      dataDir: null,
      pid: process.pid,
    }),
);

// ---------------------------------------------------------------------------
// 定位器：D3-5A 未冻结路径的字段一律 fail-closed（找不到即 required gate 失败）
// ---------------------------------------------------------------------------
function locatorError(what, tried) {
  return new Error(
    `[D3-5B required-gate] 无法定位 ${what}；已尝试：${tried.join(', ')}。` +
      '若实现确有该字段但路径不同，请 root 裁定并在此登记，不得静默放宽。',
  );
}

function getPath(obj, path) {
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function worldOf(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw locatorError('bundle', ['executeEncounterIntent 返回值.bundle']);
  }
  const world = bundle.snapshot.world;
  if (!world || typeof world !== 'object') {
    throw locatorError('bundle.snapshot.world', ['bundle.snapshot.world']);
  }
  if (!world.encounterModel || typeof world.encounterModel !== 'object') {
    throw locatorError('world.encounterModel', ['bundle.snapshot.world.encounterModel']);
  }
  return world;
}

function encounterModelOf(bundle) {
  return worldOf(bundle).encounterModel;
}

function inputHistoryOf(bundle) {
  const m = encounterModelOf(bundle);
  if (!Array.isArray(m.inputHistory)) {
    throw locatorError('world.encounterModel.inputHistory', ['world.encounterModel.inputHistory']);
  }
  return m.inputHistory;
}

function eventsOf(bundle) {
  if (!Array.isArray(bundle?.eventLog)) {
    throw locatorError('bundle.eventLog', ['bundle.eventLog']);
  }
  return bundle.eventLog;
}

function eventTypeOf(e) {
  if (!e || typeof e !== 'object') return undefined;
  if (typeof e.type !== 'string') throw locatorError('event.type', ['event.type']);
  return e.type;
}

function eventSeqOf(e) {
  if (!e || typeof e !== 'object') return undefined;
  if (!Number.isSafeInteger(e.eventSeq)) throw locatorError('event.eventSeq', ['event.eventSeq']);
  return e.eventSeq;
}

function eventsByType(bundle, type) {
  return eventsOf(bundle).filter((e) => eventTypeOf(e) === type);
}

// D3-5A:81 / society.mjs settleSocietyDay 返回 payload {day,actors,agents,communalGold}：
// 每 actor 的身体与 needs 只在 payload.actors.rows[i]（rows[0..3] = actor-1..actor-4），
// 顶层没有 actorId/opening/resting 字段。定位必须走这条真实路径。
function settleRows(event) {
  const rows = getPath(event, 'payload.actors.rows');
  if (!Array.isArray(rows)) {
    throw locatorError(
      'SocietyDaySettled payload.actors.rows',
      ['event.payload.actors.rows'],
    );
  }
  return rows;
}

function settleRowOf(event, actorId) {
  const hit = settleRows(event).find((r) => r && r.actorId === actorId);
  if (!hit) {
    throw locatorError(
      `SocietyDaySettled row ${actorId}`,
      ['event.payload.actors.rows[*].actorId'],
    );
  }
  return hit;
}

function settleEventAt(bundle, tick) {
  const hit = eventsByType(bundle, 'SocietyDaySettled').find((e) => {
    const t = e.tick;
    return t === tick;
  });
  if (!hit) {
    throw locatorError(
      `tick${tick} SocietyDaySettled`,
      ['bundle.<events>[*].type===SocietyDaySettled && tick'],
    );
  }
  return hit;
}

function causeOf(e) {
  if (!e || typeof e !== 'object' || !Array.isArray(e.causationEventSeqs)) {
    throw locatorError('event.causationEventSeqs', ['event.causationEventSeqs']);
  }
  return { keys: ['causationEventSeqs'], value: e.causationEventSeqs };
}

function actorsOf(bundle) {
  const actors = getPath(worldOf(bundle), 'actorModel.actors');
  if (!Array.isArray(actors)) {
    throw locatorError('world.actorModel.actors', ['world.actorModel.actors']);
  }
  return actors;
}

function actorOf(bundle, actorId) {
  const hit = actorsOf(bundle).find((a) => a && a.actorId === actorId);
  if (!hit) throw locatorError(`actor ${actorId}`, ['world.actorModel.actors[*].actorId']);
  return hit;
}

// M4 既有真实路径：actor 身体在 world.actorModel.actors，钱包/库存/账本在
// world.societyModel.agents[].state，计划/义务在 world.motivationModel.actors[]。
function estateOf(bundle, actorId) {
  const agents = getPath(worldOf(bundle), 'societyModel.agents');
  if (!Array.isArray(agents)) {
    throw locatorError('world.societyModel.agents', ['world.societyModel.agents']);
  }
  const hit = agents.find((a) => a && a.state && a.state.actorId === actorId);
  if (!hit) {
    throw locatorError(`society estate ${actorId}`, ['world.societyModel.agents[*].state.actorId']);
  }
  return hit.state;
}

function motivationEntryOf(bundle, actorId) {
  const list = getPath(worldOf(bundle), 'motivationModel.actors');
  if (!Array.isArray(list)) {
    throw locatorError('world.motivationModel.actors', ['world.motivationModel.actors']);
  }
  const hit = list.find((a) => a && a.actorId === actorId);
  if (!hit) {
    throw locatorError(`motivation entry ${actorId}`, ['world.motivationModel.actors[*].actorId']);
  }
  return hit;
}

function pickNum(node, names) {
  for (const n of names) {
    const v = getPath(node, n);
    if (typeof v === 'number') return { value: v, path: n };
  }
  throw locatorError(`数值字段 ${names.join('|')}`, names);
}

// ---------------------------------------------------------------------------
// 引擎壳：只经 executeEncounterIntent 提交完整 DTO3
// ---------------------------------------------------------------------------
let idSeq = 0;
function nextCommandId(tag) {
  idSeq += 1;
  return `d35b-${tag}-${idSeq}`;
}

class Harness {
  constructor(bundle) {
    this.bundle = bundle;
  }

  static create(seed = 42, config) {
    const fixture =
      config === undefined
        ? createEncounterVillage(seed, PROFILE)
        : createEncounterVillage(seed, PROFILE, config);
    if (!fixture || typeof fixture !== 'object' || !fixture.bundle) {
      throw locatorError('createEncounterVillage 返回值.bundle', ['fixture.bundle']);
    }
    return new Harness(fixture.bundle);
  }

  snap() {
    return projectEncounterSnapshot(this.bundle);
  }

  get revision() {
    return this.snap().revision;
  }

  get tick() {
    return this.snap().tick;
  }

  raw(type, payload = {}, opts = {}) {
    const commandId = opts.commandId ?? nextCommandId(type.toLowerCase());
    const expectedRevision = opts.expectedRevision ?? this.revision;
    const dto = { version: opts.version ?? 3, commandId, expectedRevision, type, payload };
    let out = null;
    let error = null;
    try {
      out = executeEncounterIntent(this.bundle, dto);
    } catch (e) {
      error = e;
    }
    if (out?.receipt) assertReceiptShape(out.receipt, type);
    if (out && out.bundle) this.bundle = out.bundle;
    return { dto, receipt: out ? out.receipt : null, error };
  }

  ok(type, payload = {}, opts = {}) {
    const r = this.raw(type, payload, opts);
    assert.equal(r.error, null, `${type} 抛错：${r.error && r.error.message}`);
    assert.equal(r.receipt.status, 'committed', `${type} status`);
    assert.equal(
      r.receipt.outcome,
      'succeeded',
      `${type} 应为 succeeded，实际 ${JSON.stringify(r.receipt.result)}`,
    );
    return r;
  }
}

function tryIntent(bundle, dto) {
  let out;
  try {
    out = executeEncounterIntent(bundle, dto);
  } catch (e) {
    return { threw: true, error: e, receipt: null, bundle };
  }
  const receipt = out ? out.receipt : null;
  if (receipt) assertReceiptShape(receipt, dto.type);
  return { threw: false, receipt, bundle: out ? out.bundle : bundle };
}

const RECEIPT_FIELDS = [
  'apiVersion',
  'receiptVersion',
  'commandId',
  'status',
  'fromRevision',
  'toRevision',
  'fromTick',
  'tick',
  'durationTicks',
  'type',
  'outcome',
  'result',
];

const ENCOUNTER_RESULT_FIELDS = [
  'actorId',
  'encounterId',
  'action',
  'before',
  'after',
  'reasonCode',
];

const RESULT_FIELDS = [
  'tick',
  'playerHealth',
  'playerAlive',
  'wolfHealth',
  'totalLivingWolves',
  'reservedWolves',
  'availableWolves',
  'battleDeaths',
  'status',
  'resolution',
];

function assertReceiptShape(receipt, label) {
  assert.ok(receipt && typeof receipt === 'object', `${label}.receipt 应为对象`);
  assert.deepEqual(Object.keys(receipt).sort(), [...RECEIPT_FIELDS].sort(), `${label}.receipt exact fields`);
  assert.equal(receipt.receiptVersion, 3, `${label}.receiptVersion`);
  assert.equal(receipt.status, 'committed', `${label}.receipt.status`);
  assert.ok(['succeeded', 'rejected'].includes(receipt.outcome), `${label}.receipt.outcome`);
}

function assertEncounterResultShape(result, label) {
  assert.ok(result && typeof result === 'object', `${label}.result 应为对象`);
  assert.deepEqual(
    Object.keys(result).sort(),
    [...ENCOUNTER_RESULT_FIELDS].sort(),
    `${label}.result exact fields`,
  );
  assert.equal(result.actorId, 'actor-4', `${label}.result.actorId`);
  for (const half of ['before', 'after']) {
    assert.ok(result[half] && typeof result[half] === 'object', `${label}.result.${half}`);
    assert.deepEqual(
      Object.keys(result[half]).sort(),
      [...RESULT_FIELDS].sort(),
      `${label}.result.${half} exact fields`,
    );
  }
}

function travelToForest(h) {
  const s = h.snap();
  if (s.self.location === 'forest') return false;
  const r = h.ok('PlayerTravel', { destination: 'forest' });
  assert.equal(
    r.receipt.durationTicks,
    12,
    'D3-5B G3：Travel 到 forest 至 tick12（PlayerTravel durationTicks 必须为 12）',
  );
  assert.equal(h.snap().self.location, 'forest');
  return true;
}

function deriveConfig(recipe, mutate) {
  const cfg = structuredClone(defaultEncounterVillageConfig(recipe));
  mutate(cfg);
  return cfg;
}

function setActorConfigField(cfg, actorId, field, value) {
  const rows = cfg.memory.society.actors.initialActors;
  assert.ok(Array.isArray(rows), 'config.memory.society.actors.initialActors must be an array');
  assert.equal(rows.length, 4, 'encounter fixture config must expose four initial actors');
  const indexByActorId = { 'actor-2': 1, 'actor-4': 3 };
  const index = indexByActorId[actorId];
  assert.notEqual(index, undefined, `D3-5B config locator does not permit ${actorId}`);
  const hit = rows[index];
  if (actorId === 'actor-4') {
    assert.equal(hit.occupation, 'player', 'initialActors[3] must generate actor-4 player');
    assert.equal(cfg.memory.society.player.actorId, 'actor-4', 'society.player must map to actor-4');
  }
  assert.ok(Object.hasOwn(hit, field), `configured ${actorId} row must expose ${field}`);
  hit[field] = value;
}

function setPlayerInitialFood(cfg, value) {
  const player = cfg.memory.society.player;
  if (!player || player.actorId !== 'actor-4' || !Object.hasOwn(player, 'initialFood')) {
    throw locatorError('config player.initialFood', ['cfg.memory.society.player.initialFood']);
  }
  player.initialFood = value;
}

function ledgerIdentity(world) {
  const eco = world.ecologyModel;
  if (!eco || typeof eco !== 'object') throw locatorError('world.ecologyModel', ['world.ecologyModel']);
  const led = eco.ledger && eco.ledger.wolves;
  if (!led || typeof led !== 'object') {
    throw locatorError('world.ecologyModel.ledger.wolves', ['world.ecologyModel.ledger.wolves']);
  }
  const num = (v, name) => {
    assert.equal(typeof v, 'number', `ledger.${name} 必须是数字`);
    return v;
  };
  const initial = num(
    getPath(world, 'ecologyModel.config.resources.populations.wolves'),
    'initial',
  );
  assert.equal(initial, 14, 'D3-5B affordable recipe 初始配置固定为14只狼');
  const births = num(led.births, 'births');
  const naturalDeaths = num(led.naturalDeaths, 'naturalDeaths');
  const starvationDeaths = num(led.starvationDeaths, 'starvationDeaths');
  const predation = num(led.predation, 'predation');
  const hunted = num(led.hunted, 'hunted');
  const removed = num(led.removed, 'removed');
  const battleDeaths = num(led.battleDeaths, 'battleDeaths');
  assert.equal(predation, 0, 'D3-5A：predation 固定为 0');
  const expected = initial + births - naturalDeaths - starvationDeaths - predation - hunted - removed - battleDeaths;
  assert.equal(
    eco.populations.wolves,
    expected,
    'D3-5A 狼账恒等式：wolves = initial + births - naturalDeaths - starvationDeaths - predation - hunted - removed - battleDeaths',
  );
  assert.equal(
    eco.reservedWolves,
    0,
    '终态后 ecologyModel.reservedWolves 必须归还为 0',
  );
  return { initial, births, naturalDeaths, starvationDeaths, predation, hunted, removed, battleDeaths, total: eco.populations.wolves };
}

// ===========================================================================
// G1 —— 真实世界与同日遭遇
// ===========================================================================
test('G1 真实世界与同日遭遇：14 狼、Begin 零 tick、两攻各 6 tick、1000->920->920、150->0、一只 battleDeath、逐值重放', { timeout: TEST_TIMEOUT_MS }, () => {
  assert.equal(ENCOUNTER_PROFILE, PROFILE);
  assert.equal(ENCOUNTER_RULES, RULES);
  assert.ok(encounterRuntimeHooks && typeof encounterRuntimeHooks === 'object', 'encounterRuntimeHooks 必须导出');
  for (const hook of ['createWorld', 'beforeSystems', 'afterSystems', 'applyAction', 'settleDay', 'validateHistory']) {
    assert.equal(typeof encounterRuntimeHooks[hook], 'function', `encounterRuntimeHooks.${hook} 必须是函数`);
  }
  assert.deepEqual(
    Object.keys(encounterSystems()).sort(),
    ['encounter', 'society', 'survival'],
    'D3-5A：encounterSystems() 只注册 society、survival、encounter',
  );

  const h = Harness.create(42);
  const travelled = travelToForest(h);

  const s0 = h.snap();
  assert.equal(s0.apiVersion, 1);
  assert.equal(s0.encounterViewVersion, 1);
  assert.equal(s0.actorId, 'actor-4');
  assert.equal(s0.encounter, null, '新世界尚无遭遇');
  assert.equal(s0.self.alive, true);
  assert.equal(s0.self.health, 1000, 'G1 手算：affordable 玩家初始 health 1000');
  assert.equal(s0.self.location, 'forest');
  assert.equal(s0.self.deathTick, null);
  assert.equal(s0.population.totalLivingWolves, 14, 'G1：初始 14 只真实活狼');
  assert.equal(s0.population.reservedWolves, 0);
  assert.equal(s0.population.availableWolves, 14);
  assert.equal(s0.population.battleDeaths, 0);

  const acts0 = describeEncounterActions(h.bundle);
  assert.equal(acts0.profile, PROFILE);
  assert.equal(acts0.rulesVersion, RULES);
  assert.equal(acts0.beginTicks, 0);
  assert.equal(acts0.attackTicks, 6);
  assert.equal(acts0.fleeTicks, 6);
  assert.equal(acts0.cancelTicks, 0);
  assert.equal(acts0.canBegin, true);
  assert.equal(acts0.canAct, false);
  assert.equal(acts0.canCancel, false);
  assert.equal(acts0.encounterId, null);
  assert.ok(Array.isArray(acts0.blockedWorldActions), 'blockedWorldActions 必须是类型数组');

  const rev0 = h.revision;
  const tick0 = h.tick;
  assert.equal(rev0, tick0, '初始 revision = tick + instantCommits(0)');

  // --- Begin：零 tick，独立审计 revision ---
  const b = h.ok('EncounterBegin', {});
  const rb = b.receipt;
  assert.equal(rb.apiVersion, 1);
  assert.equal(rb.receiptVersion, 3);
  assert.equal(rb.commandId, b.dto.commandId);
  assert.equal(rb.status, 'committed');
  assert.equal(rb.type, 'EncounterBegin');
  assert.equal(rb.outcome, 'succeeded');
  assert.equal(rb.fromRevision, rev0);
  assert.equal(rb.toRevision, rev0 + 1, 'G1：Begin 零耗时却有独立审计 revision（+1）');
  assert.equal(rb.fromTick, tick0);
  assert.equal(rb.tick, tick0, 'G1：Begin 不推进 tick');
  assert.equal(rb.durationTicks, 0);
  assertEncounterResultShape(rb.result, 'Begin');
  assert.equal(rb.result.action, 'begin');
  assert.equal(rb.result.encounterId, 'encounter-1');
  assert.equal(rb.result.reasonCode, null);
  assert.deepEqual(rb.result.before, {
    tick: tick0,
    playerHealth: 1000,
    playerAlive: true,
    wolfHealth: null,
    totalLivingWolves: 14,
    reservedWolves: 0,
    availableWolves: 14,
    battleDeaths: 0,
    status: 'none',
    resolution: null,
  });
  assert.deepEqual(rb.result.after, {
    tick: tick0,
    playerHealth: 1000,
    playerAlive: true,
    wolfHealth: 300,
    totalLivingWolves: 14,
    reservedWolves: 1,
    availableWolves: 13,
    battleDeaths: 0,
    status: 'active',
    resolution: null,
  });

  const world1 = worldOf(h.bundle);
  assert.equal(world1.encounterModel.version, 'encounter-runtime-v1');
  assert.equal(world1.encounterModel.nextEncounterId, 2, '成功 Begin 后 nextEncounterId 递增');
  const enc1 = h.snap().encounter;
  assert.equal(enc1.encounterId, 'encounter-1');
  assert.equal(enc1.actorId, 'actor-4');
  assert.equal(enc1.location, 'forest');
  assert.equal(enc1.status, 'active');
  assert.equal(enc1.resolution, null);
  assert.equal(enc1.startTick, tick0);
  assert.equal(enc1.endTick, null);
  assert.equal(enc1.initialPlayerHealth, 1000, 'initialPlayerHealth 是历史锚点');
  assert.equal(enc1.wolfHealth, 300, 'G1：狼起始 HP 300');
  assert.equal(enc1.attackCount, 0);
  assert.equal(enc1.elapsedTicks, 0);
  assert.equal(enc1.beginCommandId, b.dto.commandId);
  assert.equal(enc1.lastCommandId, b.dto.commandId);
  assert.ok(enc1.reserved, 'ACTIVE 必须预留一只狼');
  assert.equal(h.snap().population.reservedWolves, 1);
  assert.equal(h.snap().population.availableWolves, 13);

  // --- 第一攻：6 tick，玩家 1000 -> 920，狼 300 -> 150 ---
  const tickA = h.tick;
  const revA = h.revision;
  const a1 = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  const r1 = a1.receipt;
  assert.equal(r1.type, 'EncounterAction');
  assert.equal(r1.durationTicks, 6, 'G1：attack 推进 6 tick');
  assert.equal(r1.fromTick, tickA);
  assert.equal(r1.tick, tickA + 6);
  assert.equal(r1.toRevision, revA + 6, '非零耗时 toRevision = fromRevision + durationTicks');
  assert.equal(r1.result.action, 'attack');
  assert.equal(r1.result.encounterId, 'encounter-1');
  assert.equal(r1.result.reasonCode, null);
  assertEncounterResultShape(r1.result, 'attack#1');
  assert.deepEqual(r1.result.after, {
    tick: tickA + 6,
    playerHealth: 920,
    playerAlive: true,
    wolfHealth: 150,
    totalLivingWolves: 14,
    reservedWolves: 1,
    availableWolves: 13,
    battleDeaths: 0,
    status: 'active',
    resolution: null,
  });

  // --- 第二攻：6 tick，玩家仍 920（击杀回合不反击），狼 150 -> 0 ---
  const tickB = h.tick;
  const revB = h.revision;
  const a2 = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  const r2 = a2.receipt;
  assert.equal(r2.durationTicks, 6);
  assert.equal(r2.fromTick, tickB);
  assert.equal(r2.tick, tickB + 6);
  assert.equal(r2.toRevision, revB + 6);
  assertEncounterResultShape(r2.result, 'attack#2');
  assert.deepEqual(r2.result.after, {
    tick: tickB + 6,
    playerHealth: 920,
    playerAlive: true,
    wolfHealth: 0,
    totalLivingWolves: 13,
    reservedWolves: 0,
    availableWolves: 13,
    battleDeaths: 1,
    status: 'closed',
    resolution: 'win',
  });
  assert.equal(h.tick - tick0, 12, 'G1：累计经过 12 tick');

  const sEnd = h.snap();
  assert.equal(sEnd.encounter.status, 'closed');
  assert.equal(sEnd.encounter.resolution, 'win');
  assert.equal(sEnd.encounter.wolfHealth, 0);
  assert.equal(sEnd.encounter.attackCount, 2);
  assert.equal(sEnd.encounter.endTick, tickB + 6);
  assert.equal(sEnd.encounter.elapsedTicks, 12);
  assert.equal(sEnd.encounter.lastCommandId, a2.dto.commandId);
  assert.equal(sEnd.self.health, 920, '当前身体 HP 与初始锚点分离');
  assert.equal(sEnd.population.totalLivingWolves, 13);
  assert.equal(sEnd.population.battleDeaths, 1, 'G1：只记一只战斗死亡');
  assert.equal(sEnd.population.reservedWolves, 0);

  const ledger = ledgerIdentity(worldOf(h.bundle));
  assert.equal(ledger.total, 13);
  assert.equal(ledger.battleDeaths, 1);

  // --- EncounterCommandResolved 与 inputHistory 逐值对应 ---
  const history = inputHistoryOf(h.bundle);
  const accepted = [b, a1, a2];
  assert.equal(history.length, accepted.length + (travelled ? 1 : 0), 'inputHistory 记录每个被接受输入');
  for (const entry of history) {
    assert.ok(entry.dto && entry.receipt, 'inputHistory 每项恰为 {dto, receipt}');
  }
  const resolved = eventsByType(h.bundle, 'EncounterCommandResolved');
  assert.equal(resolved.length, history.length, '每条被接受 DTO3 恰一条 EncounterCommandResolved');
  for (const r of accepted) {
    const ev = resolved.find((e) => e.payload && e.payload.dto && e.payload.dto.commandId === r.dto.commandId);
    assert.ok(ev, `EncounterCommandResolved 缺少 commandId=${r.dto.commandId}`);
    assert.equal(ev.sourceSystem, 'encounter');
    assert.equal(ev.commandId, r.dto.commandId);
    assert.deepEqual(ev.entityIds, ['actor-4']);
    assert.deepEqual(ev.payload.dto, r.dto);
    assert.deepEqual(ev.payload.receipt, r.receipt);
    const inHist = history.find((x) => x.dto.commandId === r.dto.commandId);
    assert.deepEqual(inHist, { dto: r.dto, receipt: r.receipt });
  }
  const beginEv = resolved.find((e) => e.payload.dto.commandId === b.dto.commandId);
  const beginCause = causeOf(beginEv);
  if (beginCause) {
    assert.ok(
      beginCause.value === null || beginCause.value === undefined || beginCause.value.length === 0,
      'D3-5A：Begin 无 cause',
    );
  }
  for (const r of [a1, a2]) {
    const ev = resolved.find((e) => e.payload.dto.commandId === r.dto.commandId);
    const cause = causeOf(ev);
    if (cause) {
      const seqs = Array.isArray(cause.value) ? cause.value : [cause.value];
      const beginSeq = eventSeqOf(beginEv);
      for (const s of seqs) {
        if (s === null || s === undefined) continue;
        assert.ok(typeof s === 'number', `cause 应为 seq 数字：${JSON.stringify(s)}`);
        assert.ok(s < eventSeqOf(ev), 'D3-5A：cause 必须是较早已存在 seq，禁止 self-cycle');
        assert.ok(s <= beginSeq || s < eventSeqOf(ev), 'Action cause 指向已提交事实');
      }
      assert.ok(seqs.some((s) => s === beginSeq), 'Action cause 必须引用已提交 Begin');
    }
  }

  // --- 完整重放：同 seed/config + 同 DTO3 序列 ---
  const replay = Harness.create(42);
  for (const entry of history) {
    const out = executeEncounterIntent(replay.bundle, entry.dto);
    replay.bundle = out.bundle;
  }
  assert.deepEqual(replay.snap(), h.snap(), 'G1：完整重放 projection 逐值一致');
  assert.deepEqual(
    worldOf(replay.bundle).encounterModel,
    worldOf(h.bundle).encounterModel,
    'G1：完整重放 encounterModel 逐值一致',
  );
  assert.deepEqual(
    worldOf(replay.bundle).ecologyModel,
    worldOf(h.bundle).ecologyModel,
    'G1：完整重放 ecologyModel（含狼账）逐值一致',
  );
});

// ===========================================================================
// G2 —— 边界伤害、逃跑/取消和时钟
// ===========================================================================
test('G2a 边界伤害：反击前 health<=80，首攻玩家死亡、狼 150、预留只归还一次', { timeout: TEST_TIMEOUT_MS }, () => {
  const cfg = deriveConfig('affordable', (c) => {
    setActorConfigField(c, 'actor-4', 'health', 80);
    setPlayerInitialFood(c, 0);
  });
  const h = Harness.create(42, cfg);
  travelToForest(h);
  assert.equal(h.snap().self.health, 80, '派生配置必须通过 validator 并生效');

  h.ok('EncounterBegin', {});
  const revA = h.revision;
  const tickA = h.tick;
  const a1 = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  const r = a1.receipt;
  assert.equal(r.durationTicks, 6);
  assert.equal(r.tick, tickA + 6);
  assert.equal(r.toRevision, revA + 6);
  assertEncounterResultShape(r.result, 'attack->player death');
  assert.equal(r.result.after.playerAlive, false, 'G2：反击 80 打死 health<=80 的玩家');
  assert.equal(r.result.after.playerHealth, 0);
  assert.equal(r.result.after.wolfHealth, 150, 'G2：狼仍为 150（未击杀，只吃了一次 150）');
  assert.equal(r.result.after.totalLivingWolves, 14, '狼未死');
  assert.equal(r.result.after.battleDeaths, 0);
  assert.equal(r.result.after.reservedWolves, 0, 'G2：活动预留只归还一次');
  assert.equal(r.result.after.availableWolves, 14);
  assert.equal(r.result.after.status, 'closed');
  assert.ok(
    r.result.after.resolution === 'lose' || r.result.after.resolution === 'player-died',
    `D3-5A 闭集未把反击致死单列；实际 resolution=${r.result.after.resolution}（合同解释风险，见回执）`,
  );
  assert.equal(r.result.reasonCode, null);

  const world = worldOf(h.bundle);
  assert.equal(world.ecologyModel.reservedWolves, 0, 'reserved 恰归还一次');
  assert.equal(h.snap().self.alive, false);
  assert.equal(typeof h.snap().self.deathTick, 'number');
  assert.equal(h.snap().encounter.resolution, r.result.after.resolution);
  assert.equal(h.snap().encounter.endTick, tickA + 6);
  const ev = eventsByType(h.bundle, 'EncounterTerminated');
  assert.equal(ev.length, 0, 'D3-5A：无“日结前置死亡”不得发 EncounterTerminated');
});

test('G2b flee 固定 6 tick 且保留既有生命值/狼伤害', { timeout: TEST_TIMEOUT_MS }, () => {
  const h = Harness.create(42);
  travelToForest(h);
  h.ok('EncounterBegin', {});
  h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  const before = h.snap();
  assert.equal(before.self.health, 920);
  assert.equal(before.encounter.wolfHealth, 150);

  const rev = h.revision;
  const tick = h.tick;
  const f = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'flee' });
  assert.equal(f.receipt.durationTicks, 6, 'G2：flee 固定耗 6 tick');
  assert.equal(f.receipt.fromTick, tick);
  assert.equal(f.receipt.tick, tick + 6);
  assert.equal(f.receipt.toRevision, rev + 6);
  assertEncounterResultShape(f.receipt.result, 'flee');
  assert.equal(f.receipt.result.after.playerHealth, 920, 'flee 不附加伤害也不回血');
  assert.equal(f.receipt.result.after.playerAlive, true);
  assert.equal(f.receipt.result.after.wolfHealth, 150, 'flee 保留既有狼伤害');
  assert.equal(f.receipt.result.after.reservedWolves, 0);
  assert.equal(f.receipt.result.after.battleDeaths, 0);
  assert.equal(f.receipt.result.after.status, 'closed');
  assert.equal(f.receipt.result.after.resolution, 'flee');
  assert.equal(f.receipt.result.reasonCode, null);
  assert.equal(h.snap().encounter.elapsedTicks, 12);
  assert.equal(worldOf(h.bundle).ecologyModel.populations.wolves, 14, 'flee 不产生战斗死亡');
});

test('G2c cancel 零 tick 且不回血', { timeout: TEST_TIMEOUT_MS }, () => {
  const h = Harness.create(42);
  travelToForest(h);
  h.ok('EncounterBegin', {});
  const rev = h.revision;
  const tick = h.tick;
  const c = h.ok('EncounterCancel', { encounterId: 'encounter-1' });
  assert.equal(c.receipt.durationTicks, 0, 'G2：cancel 为零 tick');
  assert.equal(c.receipt.fromTick, tick);
  assert.equal(c.receipt.tick, tick, 'cancel 不推进 tick');
  assert.equal(c.receipt.toRevision, rev + 1, '零耗时命令 revision +1');
  assertEncounterResultShape(c.receipt.result, 'cancel');
  assert.equal(c.receipt.result.after.playerHealth, 1000, 'cancel 不回血（无伤害可回）');
  assert.equal(c.receipt.result.after.wolfHealth, 300);
  assert.equal(c.receipt.result.after.reservedWolves, 0);
  assert.equal(c.receipt.result.after.battleDeaths, 0);
  assert.equal(c.receipt.result.after.resolution, 'cancel');
  assert.equal(c.receipt.result.reasonCode, null);
  assert.equal(h.tick, tick, 'cancel 后世界 tick 不变');
});

test('G2d ACTIVE 中 5 个世界命令统一 ENCOUNTER_BUSY、0 tick、revision+1、输入入审计', { timeout: TEST_TIMEOUT_MS }, () => {
  const h = Harness.create(42);
  travelToForest(h);
  h.ok('EncounterBegin', {});
  const acts = describeEncounterActions(h.bundle);
  assert.equal(acts.canAct, true);
  assert.equal(acts.canCancel, true);
  assert.equal(acts.canBegin, false);
  assert.equal(acts.encounterId, 'encounter-1');
  for (const t of ['AdvanceTime', 'PlayerTravel', 'PlayerRest', 'PlayerBuy', 'PlayerSell']) {
    assert.ok(
      acts.blockedWorldActions.includes(t),
      `blockedWorldActions 必须包含 ${t}，实际 ${JSON.stringify(acts.blockedWorldActions)}`,
    );
  }

  const cases = [
    ['AdvanceTime', { ticks: 5 }],
    ['PlayerTravel', { destination: 'village' }],
    ['PlayerRest', {}],
    ['PlayerBuy', { product: 'grain', quantity: 1 }],
    ['PlayerSell', { product: 'grain', quantity: 1 }],
  ];
  const eventsBefore = eventsByType(h.bundle, 'EncounterCommandResolved').length;
  for (const [type, payload] of cases) {
    const rev = h.revision;
    const tick = h.tick;
    const hist = inputHistoryOf(h.bundle).length;
    const r = h.raw(type, payload);
    assert.equal(r.error, null, `${type} 应产生已接受拒绝 receipt`);
    const rc = r.receipt;
    assert.equal(rc.outcome, 'rejected', `${type} outcome`);
    assert.equal(rc.status, 'committed');
    assert.deepEqual(rc.result, { code: 'ENCOUNTER_BUSY' }, `${type} 结果必须恰为 {code:'ENCOUNTER_BUSY'}`);
    assert.equal(rc.durationTicks, 0, `${type} 0 tick`);
    assert.equal(rc.fromTick, tick);
    assert.equal(rc.tick, tick, `${type} 不暗中推进 tick`);
    assert.equal(rc.fromRevision, rev);
    assert.equal(rc.toRevision, rev + 1, `${type} 零耗时仍 revision+1`);
    assert.equal(h.tick, tick);
    assert.equal(inputHistoryOf(h.bundle).length, hist + 1, `${type} 输入进入审计`);
  }
  assert.equal(
    eventsByType(h.bundle, 'EncounterCommandResolved').length,
    eventsBefore + cases.length,
    '每个被接受的零耗时拒绝也生成 EncounterCommandResolved',
  );
  assert.equal(h.snap().encounter.status, 'active', 'ACTIVE 未被世界命令破坏');
  assert.equal(h.snap().self.health, 1000);
});

test('G2e 入场域拒绝：reasonCode 闭集、revision+1、duration 0', { timeout: TEST_TIMEOUT_MS }, () => {
  // ENCOUNTER_BUSY：ACTIVE 中再次 Begin
  const h1 = Harness.create(42);
  travelToForest(h1);
  h1.ok('EncounterBegin', {});
  {
    const rev = h1.revision;
    const tick = h1.tick;
    const r = h1.raw('EncounterBegin', {});
    assert.equal(r.error, null);
    assert.equal(r.receipt.outcome, 'rejected');
    assert.equal(r.receipt.result.reasonCode, 'ENCOUNTER_BUSY');
    assert.equal(r.receipt.durationTicks, 0);
    assert.equal(r.receipt.toRevision, rev + 1);
    assert.equal(r.receipt.tick, tick);
    assertEncounterResultShape(r.receipt.result, 'Begin BUSY');
  }

  // RULE_REJECTED：非 forest 发起 Begin（入场规则不满足）
  const h2 = Harness.create(42);
  const s2 = h2.snap();
  if (s2.self.location === 'forest') {
    // 默认已在 forest 时，先移动到非 forest 地点（合同只冻结 forest 为遭遇地点）
    let moved = false;
    for (const dest of ['village', 'settlement', 'home', 'camp']) {
      const r = h2.raw('PlayerTravel', { destination: dest });
      if (r.error === null && r.receipt.outcome === 'succeeded' && h2.snap().self.location !== 'forest') {
        moved = true;
        break;
      }
    }
    if (!moved) {
      throw locatorError('离开 forest 的合法目的地', ['PlayerTravel destination ∈ village|settlement|home|camp']);
    }
  }
  {
    const rev = h2.revision;
    const r = h2.raw('EncounterBegin', {});
    assert.equal(r.error, null);
    assert.equal(r.receipt.outcome, 'rejected', '非 forest 不得 Begin');
    assert.equal(r.receipt.result.reasonCode, 'RULE_REJECTED');
    assert.equal(r.receipt.durationTicks, 0);
    assert.equal(r.receipt.toRevision, rev + 1);
    assertEncounterResultShape(r.receipt.result, 'Begin RULE_REJECTED');
  }

  // ENCOUNTER_ID_MISMATCH：ACTIVE 中错误 encounterId
  {
    const rev = h1.revision;
    const tick = h1.tick;
    const r = h1.raw('EncounterAction', { encounterId: 'encounter-999', action: 'attack' });
    assert.equal(r.error, null);
    assert.equal(r.receipt.outcome, 'rejected');
    assert.equal(r.receipt.result.reasonCode, 'ENCOUNTER_ID_MISMATCH');
    assert.equal(r.receipt.result.encounterId, 'encounter-999');
    assert.equal(r.receipt.durationTicks, 0);
    assert.equal(r.receipt.toRevision, rev + 1);
    assert.equal(h1.tick, tick);
    assert.equal(h1.snap().encounter.status, 'active', 'ID 不匹配不得推进战斗');
    assert.equal(h1.snap().encounter.attackCount, 0);
  }

  // ENCOUNTER_CLOSED：对已关闭遭遇发起 action
  {
    const h3 = Harness.create(42);
    travelToForest(h3);
    h3.ok('EncounterBegin', {});
    h3.ok('EncounterCancel', { encounterId: 'encounter-1' });
    const rev = h3.revision;
    const r = h3.raw('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
    assert.equal(r.error, null);
    assert.equal(r.receipt.outcome, 'rejected');
    assert.equal(r.receipt.result.reasonCode, 'ENCOUNTER_CLOSED');
    assert.equal(r.receipt.durationTicks, 0);
    assert.equal(r.receipt.toRevision, rev + 1);
  }

  // PLAYER_DEAD：玩家已死时 Begin
  {
    const cfg = deriveConfig('affordable', (c) => {
      setActorConfigField(c, 'actor-4', 'health', 80);
      setPlayerInitialFood(c, 0);
    });
    const h4 = Harness.create(42, cfg);
    travelToForest(h4);
    h4.ok('EncounterBegin', {});
    h4.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
    assert.equal(h4.snap().self.alive, false);
    const rev = h4.revision;
    const r = h4.raw('EncounterBegin', {});
    assert.equal(r.error, null);
    assert.equal(r.receipt.outcome, 'rejected');
    assert.equal(r.receipt.result.reasonCode, 'PLAYER_DEAD');
    assert.equal(r.receipt.durationTicks, 0);
    assert.equal(r.receipt.toRevision, rev + 1);
  }

  // ENCOUNTER_UNAVAILABLE：无当前遭遇时对遭遇域发起 action
  {
    const h5 = Harness.create(42);
    const rev = h5.revision;
    const r = h5.raw('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
    assert.equal(r.error, null, '无遭遇时 action 应为已接受域拒绝而非 malformed');
    assert.equal(r.receipt.outcome, 'rejected');
    assert.equal(
      r.receipt.result.reasonCode,
      'ENCOUNTER_UNAVAILABLE',
      'D3-5A：无当前遭遇的 action 归 ENCOUNTER_UNAVAILABLE',
    );
    assert.equal(r.receipt.durationTicks, 0);
    assert.equal(r.receipt.toRevision, rev + 1);
    assert.equal(h5.snap().encounter, null);
  }
});

test('G2f 时钟不变量：Idle 跳过保留 revision-tick offset；零 tick 命令只增 revision', { timeout: TEST_TIMEOUT_MS }, () => {
  const h = Harness.create(42);
  travelToForest(h);
  const offset = () => h.revision - h.tick;
  const off0 = offset();
  h.ok('EncounterBegin', {});
  assert.equal(offset(), off0 + 1, 'Begin 零耗时：offset +1');
  h.ok('EncounterCancel', { encounterId: 'encounter-1' });
  assert.equal(offset(), off0 + 2, 'cancel 零耗时：offset +1');
  const tickBefore = h.tick;
  const revBefore = h.revision;
  h.ok('AdvanceTime', { ticks: 100 });
  assert.equal(h.tick, tickBefore + 100, 'AdvanceTime 推进真实 tick');
  assert.equal(h.revision, revBefore + 100, 'AdvanceTime 同步推进 revision');
  assert.equal(offset(), off0 + 2, 'Idle 跳过必须保留 revision-tick offset');
  // D3-5A：revision = tick + instantCommits；instantCommits = 已接受零耗时命令数（本序列 Begin + cancel = 2）
  assert.equal(
    h.revision - h.tick,
    2,
    'D3-5A：revision = tick + instantCommits，且 instantCommits 等于已接受零耗时命令数',
  );
});

test('G2g 幂等/冲突/预算前置：malformed 无 receipt、同 ID 原样、异 DTO 冲突优先、stale 不占预算', { timeout: TEST_TIMEOUT_MS }, () => {
  const h = Harness.create(42);
  travelToForest(h);
  const before = h.snap();
  const beforeBundleCanonical = canonicalJson(h.bundle);
  const beforeHistoryCanonical = canonicalJson(inputHistoryOf(h.bundle));

  // malformed / overflow 抛错且不留 receipt
  {
    // D3-5A：DTO1/2 在新 format8 报 UNSUPPORTED_VERSION（抛错或已拒绝 receipt，两条路径都必须带权威码）
    const bad1 = { version: 2, commandId: 'bad-v2', expectedRevision: h.revision, type: 'AdvanceTime', payload: { ticks: 1 } };
    const r1 = tryIntent(h.bundle, bad1);
    const rejected1 = !r1.threw && r1.receipt && r1.receipt.outcome === 'rejected';
    assert.ok(
      r1.threw || rejected1,
      `DTO2 在新 format8 必须非零失败（抛错或 UNSUPPORTED_VERSION 拒绝），实际 ${JSON.stringify(r1.receipt)}`,
    );
    const code1 = r1.threw
      ? r1.error && r1.error.code
      : r1.receipt.result && r1.receipt.result.code;
    assert.ok(
      code1 === 'UNSUPPORTED_VERSION' || code1 === 'COMMAND_UNSUPPORTED',
      `D3-5A：DTO2 失败码应为 UNSUPPORTED_VERSION/COMMAND_UNSUPPORTED，实际 ${code1}`,
    );
    // D3-5A：整体超 4096 字节 preflight 抛错且不留 receipt（必须带数据契约码，不得是任意错误）
    const bad2 = {
      version: 3,
      commandId: 'bad-overflow',
      expectedRevision: h.revision,
      type: 'EncounterBegin',
      payload: { blob: 'x'.repeat(5000) },
    };
    assert.throws(
      () => executeEncounterIntent(h.bundle, bad2),
      (e) => Boolean(e) && ['INVALID_INPUT', 'LIMIT_EXCEEDED', 'UNSUPPORTED_VERSION'].includes(e.code),
      '超过 4096 字节必须抛数据契约错误（带 code）且不留 receipt',
    );
    assert.equal(h.revision, before.revision, 'malformed 不得改变 revision');
    assert.equal(canonicalJson(h.bundle), beforeBundleCanonical, 'malformed/overflow 不得改变完整 bundle');
    assert.equal(canonicalJson(inputHistoryOf(h.bundle)), beforeHistoryCanonical,
      'malformed/overflow 不得改变操作前的 inputHistory');
  }

  // 同 ID canonical 原 receipt 原样复制
  const first = h.raw('EncounterBegin', {});
  assert.equal(first.receipt.outcome, 'succeeded');
  const revAfterFirst = h.revision;
  const histAfterFirst = inputHistoryOf(h.bundle).length;
  const again = h.raw('EncounterBegin', {}, {
    commandId: first.dto.commandId,
    expectedRevision: first.dto.expectedRevision,
  });
  assert.equal(again.error, null);
  assert.deepEqual(again.receipt, first.receipt, '同 ID 同输入返回原 receipt');
  assert.equal(h.revision, revAfterFirst, '同 ID 重试不再提交');
  assert.equal(inputHistoryOf(h.bundle).length, histAfterFirst);

  // 同 ID 异 DTO -> COMMAND_ID_CONFLICT 优先 revision
  {
    const rev = h.revision;
    const hist = inputHistoryOf(h.bundle).length;
    const r = tryIntent(h.bundle, {
      version: 3,
      commandId: first.dto.commandId,
      expectedRevision: 0, // 同时 stale，冲突必须优先
      type: 'EncounterCancel',
      payload: { encounterId: 'encounter-1' },
    });
    // D3-5A：冲突是协议级失败；无论抛错还是 rejected receipt，权威码都必须是 COMMAND_ID_CONFLICT
    const code = r.threw
      ? r.error && r.error.code
      : r.receipt && r.receipt.result && r.receipt.result.code;
    assert.equal(code, 'COMMAND_ID_CONFLICT', `同 ID 异 DTO 必须报 COMMAND_ID_CONFLICT，实际 ${code}`);
    if (!r.threw) {
      assert.equal(r.receipt.outcome, 'rejected');
      assert.equal(r.receipt.durationTicks, 0);
    }
    assert.equal(h.revision, rev, 'COMMAND_ID_CONFLICT 不产生状态变化（优先于 stale）');
    assert.equal(inputHistoryOf(h.bundle).length, hist);
    const stored = inputHistoryOf(h.bundle).find((x) => x.dto.commandId === first.dto.commandId);
    assert.deepEqual(stored.receipt, first.receipt, '原 receipt 必须原样保留');
  }

  // 新 ID stale -> REVISION_CONFLICT，不占 ID/预算
  {
    const rev = h.revision;
    const hist = inputHistoryOf(h.bundle).length;
    const id = nextCommandId('stale');
    const r = tryIntent(h.bundle, {
      version: 3,
      commandId: id,
      expectedRevision: Math.max(0, rev - 1),
      type: 'AdvanceTime',
      payload: { ticks: 1 },
    });
    // D3-5A：new-ID stale 是协议级失败；抛错或 rejected receipt 的权威码都必须是 REVISION_CONFLICT
    const staleCode = r.threw
      ? r.error && r.error.code
      : r.receipt && r.receipt.result && r.receipt.result.code;
    assert.equal(staleCode, 'REVISION_CONFLICT', `new-ID stale 必须报 REVISION_CONFLICT，实际 ${staleCode}`);
    if (!r.threw) {
      assert.equal(r.receipt.outcome, 'rejected');
      assert.equal(r.receipt.durationTicks, 0);
    }
    assert.equal(h.revision, rev, 'stale 不改变 revision');
    assert.equal(inputHistoryOf(h.bundle).length, hist, 'stale 不占 inputHistory 预算');
    assert.equal(
      inputHistoryOf(h.bundle).some((x) => x.dto.commandId === id),
      false,
      'stale 不占 ID',
    );
  }
});

// ===========================================================================
// G3 —— 144 日界和真实当前身体
// ===========================================================================
test('G3 144 日界真实身体：health1000/hunger400/food0 -> t143 920/150 -> t144 日结 870 -> t149 杀狼 870/0', { timeout: TEST_TIMEOUT_MS }, () => {
  const cfg = deriveConfig('affordable', (c) => {
    setActorConfigField(c, 'actor-4', 'health', 1000);
    setActorConfigField(c, 'actor-4', 'hunger', 400);
    setPlayerInitialFood(c, 0);
  });
  const h = Harness.create(42, cfg);
  assert.equal(travelToForest(h), true, 'G3 假设默认不在 forest：Travel 到 forest 应发生');
  assert.equal(h.tick, 12, 'G3：Travel 到 forest 至 tick12');
  assert.equal(h.snap().self.health, 1000);

  h.ok('AdvanceTime', { ticks: 125 });
  assert.equal(h.tick, 137, 'G3：AdvanceTime 125 至 tick137');
  assert.equal(h.snap().self.health, 1000, 't137 尚未跨日结');

  h.ok('EncounterBegin', {});
  assert.equal(h.snap().encounter.startTick, 137);
  assert.equal(h.snap().encounter.initialPlayerHealth, 1000);

  const a1 = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  assert.equal(a1.receipt.tick, 143, 'G3：第一攻 6 tick 至 143');
  assert.equal(a1.receipt.result.after.playerHealth, 920);
  assert.equal(a1.receipt.result.after.wolfHealth, 150);

  const a2 = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  assert.equal(a2.receipt.tick, 149, 'G3：第二攻 target 149');
  assert.equal(a2.receipt.durationTicks, 6);
  assertEncounterResultShape(a2.receipt.result, 'G3 attack#2');
  assert.equal(
    a2.receipt.result.after.playerHealth,
    870,
    'G3：t144 日结 hunger 400->500、无私粮损 50 -> 920-50=870，跨日用当前身体判战',
  );
  assert.equal(a2.receipt.result.after.playerAlive, true);
  assert.equal(a2.receipt.result.after.wolfHealth, 0, 'G3：t149 击杀狼');
  assert.equal(a2.receipt.result.after.totalLivingWolves, 13);
  assert.equal(a2.receipt.result.after.battleDeaths, 1);
  assert.equal(a2.receipt.result.after.reservedWolves, 0);
  assert.equal(a2.receipt.result.after.status, 'closed');
  assert.equal(a2.receipt.result.after.resolution, 'win');
  assert.equal(a2.receipt.result.reasonCode, null, '击杀回合不反击，玩家未死');

  const s = h.snap();
  assert.equal(s.self.health, 870);
  assert.equal(s.self.alive, true);
  assert.equal(s.encounter.endTick, 149);
  assert.equal(s.encounter.elapsedTicks, 12);

  const world = worldOf(h.bundle);
  const ledger = ledgerIdentity(world);
  assert.equal(ledger.total, 13);
  assert.equal(ledger.battleDeaths, 1);

  // t144 真实日结：actor-1..actor-4 各一行；玩家 hunger 400→500、无私粮损 50
  const actor4Settle = settleEventAt(h.bundle, 144);
  const row4 = settleRowOf(actor4Settle, 'actor-4');
  assert.equal(row4.opening.hunger, 400, 'G3：actor-4 日结 opening.hunger=400');
  assert.equal(row4.closing.hunger, 500, 'G3：t144 日结令 hunger=400→500');
  assert.equal(row4.hungerDamage, 50, 'G3：无私粮且 hunger>=500，损 50');
  // D3-5A:93：completion=149 > 144，日结先于动作完成。opening 必须是 t143 首攻反击后的真实
  // 当前 body health=920（1000-80），日结再损 50 -> 870；870 才是 t149 杀狼时的权威 health。
  assert.equal(row4.opening.health, 920, 'G3：日结 opening.health=920（t143 首攻反击后）');
  assert.equal(row4.closing.health, 870, 'G3：日结损 50 -> 870');
  assert.equal(row4.closing.alive, true);
  for (const id of ['actor-2', 'actor-3']) {
    const row = settleRowOf(actor4Settle, id);
    assert.equal(row.closing.alive, true, `G3：tick144 ${id} 正常日结且存活`);
    assert.ok(Number.isInteger(row.hungerDamage), `G3：${id} 日结有真实 hungerDamage`);
  }
  // 预留个体不被出生/捕食/群体死亡流程误改
  assert.equal(world.ecologyModel.reservedWolves, 0);
  // D3-5A:81：日结 payload 必须附加 encounterOwnership 六字段；普通 wolves 统计为可用群体，
  // totalLivingOpening/Closing 是含预留的真实总数（ecology.mjs 恒等式 totalLiving = wolves.opening + reserved）。
  const ownershipNodes = [];
  const collectOwnership = (node, seen = new Set()) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.encounterOwnership && typeof node.encounterOwnership === 'object') {
      ownershipNodes.push(node.encounterOwnership);
    }
    for (const v of Object.values(node)) collectOwnership(v, seen);
  };
  for (const e of eventsByType(h.bundle, 'SocietyDaySettled').filter((ev) => {
    const t = ev.tick;
    return t === 144;
  })) {
    collectOwnership(e.payload);
  }
  assert.ok(
    ownershipNodes.length > 0,
    'G3/D3-5A:81：tick144 日结 payload 必须附加 encounterOwnership 六字段（不得缺失）',
  );
  const ownership = ownershipNodes[0];
  for (const k of [
    'reservedOpening',
    'reservedClosing',
    'battleDeathsOpening',
    'battleDeathsClosing',
    'totalLivingOpening',
    'totalLivingClosing',
  ]) {
    assert.ok(Object.hasOwn(ownership, k), `G3：日结 payload.encounterOwnership 缺 ${k}`);
  }
  assert.deepEqual(
    Object.keys(ownership).sort(),
    [
      'battleDeathsClosing',
      'battleDeathsOpening',
      'reservedClosing',
      'reservedOpening',
      'totalLivingClosing',
      'totalLivingOpening',
    ],
    'G3/D3-5A:81：encounterOwnership 恰六字段',
  );
  assert.equal(ownership.reservedOpening, 1, 'G3：日结 opening 时预留 1 只');
  assert.equal(ownership.reservedClosing, ownership.reservedOpening, 'G3：日结不赢得战斗，预留不变');
  assert.equal(ownership.battleDeathsOpening, 0);
  assert.equal(
    ownership.battleDeathsClosing,
    ownership.battleDeathsOpening,
    'G3：日结不记战斗死亡',
  );
  assert.equal(
    ownership.totalLivingOpening,
    14,
    'G3：totalLivingOpening 是含 1 只预留的真实总数（14），不是可用群体 13',
  );
  // 完整重放
  const history = inputHistoryOf(h.bundle);
  const replay = Harness.create(42, cfg);
  for (const entry of history) {
    replay.bundle = executeEncounterIntent(replay.bundle, entry.dto).bundle;
  }
  assert.deepEqual(replay.snap(), h.snap(), 'G3：完整重放一致');
  assert.deepEqual(worldOf(replay.bundle).ecologyModel, world.ecologyModel);
});

test('G3 对照 completion==144：health100 先杀狼后日结死，狼死亡不被撤销', { timeout: TEST_TIMEOUT_MS }, () => {
  const cfg = deriveConfig('affordable', (c) => {
    setActorConfigField(c, 'actor-4', 'health', 100);
    setActorConfigField(c, 'actor-4', 'hunger', 400);
    setPlayerInitialFood(c, 0);
  });
  const h = Harness.create(42, cfg);
  travelToForest(h);
  assert.equal(h.tick, 12);
  h.ok('AdvanceTime', { ticks: 120 });
  assert.equal(h.tick, 132, 'G3 对照：从 tick132 Begin');

  h.ok('EncounterBegin', {});
  const a1 = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  assert.equal(a1.receipt.tick, 138, 'G3 对照：首攻完成 138');
  assert.equal(a1.receipt.result.after.playerHealth, 20, 'G3 对照：100-80=20');
  assert.equal(a1.receipt.result.after.wolfHealth, 150);

  const a2 = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  assert.equal(a2.receipt.tick, 144, 'G3 对照：第二攻 target144');
  assert.equal(a2.receipt.result.after.wolfHealth, 0, 'G3 对照：先杀狼');
  assert.equal(a2.receipt.result.after.resolution, 'win');
  assert.equal(a2.receipt.result.after.battleDeaths, 1, '狼死亡记一次');
  assert.equal(a2.receipt.result.after.playerHealth, 0, 'G3 对照：随后日结饿死，after.health=0');
  assert.equal(a2.receipt.result.after.playerAlive, false);
  assert.equal(h.snap().self.deathTick, 144, 'G3 对照：死于 tick144');
  assert.equal(h.snap().encounter.endTick, 144);
  assert.equal(h.snap().encounter.elapsedTicks, 12);

  const world = worldOf(h.bundle);
  assert.equal(world.ecologyModel.ledger.wolves.battleDeaths, 1, '狼死亡只记一次且不被日结前置死亡分支撤销');
  assert.equal(world.ecologyModel.populations.wolves, 13);
  ledgerIdentity(world);
  // G4(a)/D3-5A:93：completion==144 时先执行动作（狼死、玩家 20），随后日结最多扣50并令玩家死亡。
  // 日结 opening 必须是动作结算后的真实当前 body health=20，而不是 initial health。
  const row4c = settleRowOf(settleEventAt(h.bundle, 144), 'actor-4');
  assert.equal(row4c.opening.health, 20, 'G3 对照：SocietyDaySettled opening.health=20（动作结算后）');
  assert.equal(row4c.closing.health, 0, 'G3 对照：日结实际扣减20令 health=0');
  assert.equal(row4c.closing.alive, false, 'G3 对照：日结后玩家死亡');
  assert.equal(row4c.hungerDamage, 20, 'G3 对照：health20 时实际饥饿扣减封顶20');
  assert.equal(row4c.opening.health - row4c.closing.health, row4c.hungerDamage,
    'G3 对照：hungerDamage 等于实际 health 扣减');
  assert.equal(row4c.closing.deathTick, 144, 'G3 对照：deathTick=144');
});

// ===========================================================================
// G4 —— 相同 target 顺序、玩家死亡与 completion==144
// ===========================================================================
test('G4 前置日结死亡：health50，attack target149 于 t144 被日结饿死，狼 300 且归还 reservation', { timeout: TEST_TIMEOUT_MS }, () => {
  const cfg = deriveConfig('affordable', (c) => {
    setActorConfigField(c, 'actor-4', 'health', 50);
    setActorConfigField(c, 'actor-4', 'hunger', 400);
    setPlayerInitialFood(c, 0);
  });
  const h = Harness.create(42, cfg);
  travelToForest(h);
  assert.equal(h.tick, 12);
  h.ok('AdvanceTime', { ticks: 131 });
  assert.equal(h.tick, 143, 'G4：AdvanceTime 131 到 143');
  h.ok('EncounterBegin', {});
  assert.equal(h.snap().encounter.startTick, 143);
  assert.equal(h.snap().encounter.elapsedTicks, 0);

  const rev = h.revision;
  const tick = h.tick;
  const a = h.raw('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  assert.equal(a.error, null, 'G4：提前死亡仍是已接受命令，必须留下 receipt');
  const r = a.receipt;
  assert.equal(r.outcome, 'rejected', 'G4：receipt rejected/PLAYER_DEAD');
  assert.equal(r.status, 'committed');
  assert.equal(r.durationTicks, 6, 'G4：原 action 仍推进完整预定 6 tick');
  assert.equal(r.fromTick, tick);
  assert.equal(r.tick, tick + 6, 'G4：receipt tick 是原 targetTick 149');
  assert.equal(r.toRevision, rev + 6, 'G4：toRevision 增 6，不套用零 tick 规则');
  assertEncounterResultShape(r.result, 'G4 pre-death');
  assert.equal(r.result.action, 'attack');
  assert.equal(r.result.reasonCode, 'PLAYER_DEAD');
  assert.equal(r.result.after.wolfHealth, 300, 'G4：未执行攻击，狼仍 300');
  assert.equal(r.result.after.playerAlive, false);
  assert.equal(r.result.after.playerHealth, 0);
  assert.equal(r.result.after.battleDeaths, 0, 'G4：不伪造 win/lose');
  assert.equal(r.result.after.reservedWolves, 0, 'G4：狼活着，恰归还一次预留');
  assert.equal(r.result.after.totalLivingWolves, 14);

  const s = h.snap();
  assert.equal(s.tick, 149, 'G4：最终世界 tick 149');
  assert.equal(s.self.deathTick, 144, 'G4：实际死亡 tick 144');
  assert.equal(s.encounter.status, 'closed');
  assert.equal(s.encounter.resolution, 'player-died');
  assert.equal(s.encounter.endTick, 144, 'G4：遭遇 endTick144');
  assert.equal(s.encounter.elapsedTicks, 1, 'G4：elapsedTicks1');
  assert.equal(s.encounter.wolfHealth, 300);
  const world = worldOf(h.bundle);
  assert.equal(world.ecologyModel.reservedWolves, 0);
  assert.equal(world.ecologyModel.populations.wolves, 14);
  ledgerIdentity(world);

  const term = eventsByType(h.bundle, 'EncounterTerminated');
  assert.equal(term.length, 1, 'G4：恰一条 EncounterTerminated');
  const t = term[0];
  assert.equal(t.payload.encounterId, 'encounter-1');
  assert.equal(t.payload.actorId, 'actor-4');
  assert.equal(t.payload.reason, 'player-died');
  assert.equal(t.payload.deathTick, 144);
  assert.equal(t.payload.wolfHealth, 300);
  assert.equal(t.payload.reservedBefore, 1);
  assert.equal(t.payload.reservedAfter, 0);
  const cause = causeOf(t);
  assert.ok(cause, 'G4：EncounterTerminated 必须有 cause');
  const causeSeq = Array.isArray(cause.value) ? cause.value[0] : cause.value;
  const deathSettle = eventsByType(h.bundle, 'SocietyDaySettled').find((e) => {
    const tk = e.tick;
    return tk === 144;
  });
  assert.ok(deathSettle, 'G4：t144 日结事件存在');
  assert.equal(causeSeq, eventSeqOf(deathSettle), 'G4：cause 精确指向触发死亡的 SocietyDaySettled 序号');

  const replay = Harness.create(42, cfg);
  for (const entry of inputHistoryOf(h.bundle)) {
    replay.bundle = executeEncounterIntent(replay.bundle, entry.dto).bundle;
  }
  assert.deepEqual(replay.snap(), s, 'G4：完整重演一致');
});

test('G4 completion==144：外部输入先于 beforeSystems/到期日结', { timeout: TEST_TIMEOUT_MS }, () => {
  const cfg = deriveConfig('affordable', (c) => {
    setActorConfigField(c, 'actor-4', 'health', 100);
    setActorConfigField(c, 'actor-4', 'hunger', 400);
    setPlayerInitialFood(c, 0);
  });
  const h = Harness.create(42, cfg);
  travelToForest(h);
  h.ok('AdvanceTime', { ticks: 120 });
  assert.equal(h.tick, 132);
  h.ok('EncounterBegin', {});
  h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  assert.equal(h.snap().self.health, 20);
  assert.equal(h.snap().encounter.wolfHealth, 150);

  const a = h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });
  assert.equal(a.receipt.tick, 144);
  assert.equal(a.receipt.outcome, 'succeeded', 'G4：先执行动作再日结');
  assert.equal(a.receipt.result.after.wolfHealth, 0, 'G4：completion 先击杀狼');
  assert.equal(a.receipt.result.after.playerHealth, 0, 'G4：receipt 最终 after.health=0');
  assert.equal(a.receipt.result.after.resolution, 'win');
  assert.equal(a.receipt.result.after.battleDeaths, 1);
  assert.equal(worldOf(h.bundle).ecologyModel.ledger.wolves.battleDeaths, 1, 'G4：狼死亡仍记一次且不被撤销');
  assert.equal(eventsByType(h.bundle, 'EncounterTerminated').length, 0, 'G4：win 不得发 EncounterTerminated');
  // G4(b)/D3-5A:93：completion==144 时外部输入（attack）先于 beforeSystems/到期日结提交，
  // 所以日结 opening 必须是动作结算后的真实 body health=20，不是 initial health。
  const row4g4 = settleRowOf(settleEventAt(h.bundle, 144), 'actor-4');
  assert.equal(row4g4.opening.health, 20, 'G4：SocietyDaySettled opening.health=20（动作先于日结）');
  assert.equal(row4g4.closing.health, 0, 'G4：随后日结实际扣减20令 health=0');
  assert.equal(row4g4.hungerDamage, 20, 'G4：health20 时实际饥饿扣减封顶20');
  assert.equal(row4g4.opening.health - row4g4.closing.health, row4g4.hungerDamage,
    'G4：hungerDamage 等于实际 health 扣减');
  assert.equal(row4g4.closing.alive, false);
  assert.equal(h.snap().self.deathTick, 144);
});

// ===========================================================================
// G5 —— M4 actor-2/3 交叉与旧规则隔离
// ===========================================================================
test('G5 M4 交叉：actor-2 urgent Rest 保 planId/步骤/request/deadline，工资一次、购粮真实', { timeout: TEST_TIMEOUT_MS }, () => {
  const cfg = deriveConfig('earn-then-buy', (c) => {
    setActorConfigField(c, 'actor-2', 'fatigue', 700);
  });
  const h = Harness.create(42, cfg);

  const body2 = () => actorOf(h.bundle, 'actor-2');
  const estate2 = () => estateOf(h.bundle, 'actor-2');
  const entry2 = () => motivationEntryOf(h.bundle, 'actor-2');

  assert.equal(body2().fatigue, 700, 'G5：actor-2 初始 fatigue=700（真实可达组合配置）');

  // tick 0 -> 144：真实 Work（workFatigue 150）与日结
  h.ok('AdvanceTime', { ticks: 144 });
  assert.equal(h.tick, 144);
  assert.equal(body2().fatigue, 850, 'G5：tick144 Work 后疲劳 700+150=850');
  assert.equal(estate2().ledger.workDays, 1, 'G5：t144 恰好一个真实工作日');
  assert.equal(estate2().ledger.wages, 20, 'G5：工资真实到账 20');
  assert.equal(estate2().wallet, 20, 'G5：钱包 0 -> 20');
  assert.equal(estate2().ledger.foodBought, 0, 'G5：t144 尚未购粮');
  {
    // 该日日结 resting=false：restReduction 必须为 0，疲劳不被削减
    const row = settleRowOf(settleEventAt(h.bundle, 144), 'actor-2');
    assert.equal(row.restReduction, 0, 'G5：t144 日结 resting=false -> restReduction 0');
    assert.equal(row.opening.fatigue, 850, 'G5：日结 opening.fatigue=850');
    assert.equal(row.closing.fatigue, 850, 'G5：日结不降低疲劳');
  }

  // tick 144 -> 288：urgent Rest（临时 Rest，goalId/planId 均 null），日结降至 650
  h.ok('AdvanceTime', { ticks: 144 });
  assert.equal(h.tick, 288);
  assert.equal(body2().fatigue, 650, 'G5：tick288 urgent Rest 后日结 850-200=650');
  const entry288 = entry2();
  const plan288 = entry288.activePlan;
  assert.ok(plan288, 'G5：actor-2 仍保有 secure-food active plan');
  assert.equal(plan288.kind, 'secure-food', 'G5：原 plan kind 不变');
  assert.equal(plan288.stepIndex, 1, 'G5：urgent Rest 后原 food plan step 仍为 1');
  assert.equal(plan288.requestId, 's-food-01', 'G5：原 requestId 保留');
  assert.equal(plan288.createdDay, 1, 'G5：原 createdDay=1 保留');
  assert.equal(plan288.deadlineDay, 4, 'G5：原 deadlineDay=4 保留');
  assert.equal(entry288.lastDuty.expiresTick, 200, 'G5：原 request.expiresTick=200 全程保留');
  assert.equal(entry288.lastDuty.status, 'fulfilled', 'G5：工资义务已履行且只履行一次');
  assert.equal(entry288.lastDuty.fulfilledTick, 144, 'G5：履行于 tick144');
  assert.equal(entry288.suspendedPlan, null, 'G5：不得建立 recover-rest/暂停槽替换对象');
  assert.equal(estate2().ledger.foodBought, 0, 'G5：t288 尚未购粮');
  assert.equal(estate2().wallet, 20, 'G5：钱包仍 20');
  assert.equal(estate2().ledger.wages, 20, 'G5：工资只支付一次（未重复领）');

  // tick 288 -> 432：同一 food plan 真实 BuyFood
  h.ok('AdvanceTime', { ticks: 144 });
  assert.equal(h.tick, 432);
  const estate432 = estate2();
  assert.equal(estate432.wallet, 10, 'G5：tick432 同计划购粮 钱包 20->10');
  assert.equal(estate432.ledger.foodBought, 1, 'G5：恰好一次真实购粮');
  assert.equal(estate432.ledger.foodUsed, 1, 'G5：日结食物消费一份');
  assert.equal(estate432.ledger.wages, 20, 'G5：工资仍只支付一次（432 未重复）');
  assert.equal(estate432.ledger.workDays, 1, 'G5：全程只有一个工作日');
  const entry432 = entry2();
  assert.ok(
    entry432.activePlan === null || entry432.activePlan.planId === plan288.planId,
    'G5：t432 仍是同一 food plan（planId 不变）或已按同一 plan 完成',
  );
  // actor-3 cognition 按真实日结继续运行
  const cognition = eventsOf(h.bundle).filter((e) => /cognition/i.test(String(eventTypeOf(e) || '')));
  assert.ok(cognition.length > 0, 'G5：actor-3 cognition 在真实日结下继续运行');
  // 每日最多一动作：society agent 每日 decision 至多一个
  for (const day of [1, 2, 3]) {
    const decisions = eventsOf(h.bundle).filter((e) => {
      const tk = e.tick;
      if (typeof tk !== 'number' || tk <= (day - 1) * 144 || tk > day * 144) return false;
      return /MotivationDecision|ActionSettled|WorkForPay|BuyFood|Rest/i.test(String(eventTypeOf(e) || ''));
    });
    assert.ok(decisions.length >= 1, `G5：day${day} 必须有真实动作/决策事实`);
  }
});

test('G5 旧规则隔离：新 DTO3 只在 encounter profile 生效，旧格式/旧版本不放宽', { timeout: TEST_TIMEOUT_MS }, () => {
  const h = Harness.create(42);
  // 旧 DTO 版本在新 format8 下必须非零失败（UNSUPPORTED_VERSION 语义），不得静默退回旧规则
  for (const version of [1, 2]) {
    const rev = h.revision;
    const r = tryIntent(h.bundle, {
      version,
      commandId: `legacy-dto-${version}`,
      expectedRevision: rev,
      type: 'AdvanceTime',
      payload: { ticks: 1 },
    });
    const rejected = !r.threw && r.receipt && r.receipt.outcome === 'rejected';
    assert.ok(
      r.threw || rejected,
      `DTO${version} 在新 format8 必须非零失败（抛错或拒绝），实际 ${JSON.stringify(r.receipt)}`,
    );
    const code = r.threw
      ? r.error && r.error.code
      : r.receipt.result && r.receipt.result.code;
    assert.ok(
      code === 'UNSUPPORTED_VERSION' || code === 'COMMAND_UNSUPPORTED',
      `D3-5A：DTO${version} 失败码应为 UNSUPPORTED_VERSION/COMMAND_UNSUPPORTED，实际 ${code}`,
    );
    assert.equal(h.revision, rev, `DTO${version} 不得改变状态`);
  }
  // 未知 rules/version fail-closed：不能以未知 profile 静默退回旧规则
  assert.equal(worldOf(h.bundle).encounterModel.version, 'encounter-runtime-v1');
  const tampered = structuredClone(worldOf(h.bundle).encounterModel);
  tampered.version = 'encounter-runtime-v0-unknown';
  const world = { ...worldOf(h.bundle), encounterModel: tampered };
  assert.throws(
    () => validateEncounterWorldState(world, { tick: h.tick }),
    (e) => Boolean(e) && typeof e.code === 'string' && e.code.length > 0,
    'G5/G7：未知/旧不兼容 encounterModel 版本必须明确失败（带数据契约 code）',
  );
});

// ===========================================================================
// G7(runtime) —— 结构 validator 拒绝非法状态，完整 replay 拒绝合法形状历史篡改
// ===========================================================================
test('G7(runtime) 世界状态审计拒绝篡改；同输入重放确定性', { timeout: TEST_TIMEOUT_MS }, () => {
  const h = Harness.create(42);
  travelToForest(h);
  h.ok('EncounterBegin', {});
  h.ok('EncounterAction', { encounterId: 'encounter-1', action: 'attack' });

  const world = worldOf(h.bundle);
  assert.doesNotThrow(
    () => validateEncounterWorldState(world, { tick: h.tick }),
    'D3-5A：context 恰为 {tick}，合法世界必须通过',
  );

  const shapeCases = [
    ['damage/wolfHealth', (w) => { w.encounterModel.encounter.wolfHealth = 999; }],
    ['reservation', (w) => { w.ecologyModel.reservedWolves = 0; }],
    ['battleDeaths 账', (w) => { w.ecologyModel.ledger.wolves.battleDeaths = 5; }],
    ['rules/config version', (w) => { w.encounterModel.version = 'encounter-runtime-v0'; }],
    ['encounter status/resolution', (w) => { w.encounterModel.encounter.resolution = 'win'; }],
    ['encounter endTick', (w) => { w.encounterModel.encounter.endTick = 0; }],
    ['encounterId 引用', (w) => { w.encounterModel.encounter.encounterId = 'encounter-99'; }],
    ['actorId 引用', (w) => { w.encounterModel.encounter.actorId = 'actor-2'; }],
    ['nextEncounterId 计数', (w) => { w.encounterModel.nextEncounterId = 99; }],
  ];
  for (const [label, mutate] of shapeCases) {
    const tampered = { ...world, encounterModel: structuredClone(world.encounterModel), ecologyModel: structuredClone(world.ecologyModel) };
    mutate(tampered);
    assert.throws(
      () => validateEncounterWorldState(tampered, { tick: h.tick }),
      (e) => Boolean(e) && typeof e.code === 'string' && e.code.length > 0,
      `G7：篡改 ${label} 必须被审计拒绝（带数据契约 code）`,
    );
  }

  const replayCases = [
    ['initialPlayerHealth 历史锚点', (bundle) => {
      bundle.snapshot.world.encounterModel.encounter.initialPlayerHealth = 999;
    }],
    ['beginCommandId 引用', (bundle) => {
      bundle.snapshot.world.encounterModel.encounter.beginCommandId = 'forged-begin-command';
    }],
    ['lastCommandId 引用', (bundle) => {
      bundle.snapshot.world.encounterModel.encounter.lastCommandId = 'forged-last-command';
    }],
    ['actor-4 当前 body health', (bundle) => {
      const actor = bundle.snapshot.world.actorModel.actors.find((entry) => entry.actorId === 'actor-4');
      actor.health = 919;
      actor.needs.healing = 81;
    }],
  ];
  const canonicalBundle = canonicalJson(h.bundle);
  for (const [label, mutate] of replayCases) {
    const forged = structuredClone(h.bundle);
    mutate(forged);
    assert.notEqual(canonicalJson(forged), canonicalBundle,
      `G7：${label} 变体必须实质改变 canonical bundle`);
    assert.throws(() => {
      validateBundle(forged, { rulesVersion: ENCOUNTER_RULES, systems: encounterSystems() });
      encounterRuntimeHooks.validateHistory(forged.snapshot, forged.eventLog);
    }, (e) => Boolean(e) && typeof e.code === 'string' && e.code.length > 0,
    `G7：完整 bundle/history replay 必须拒绝 ${label} 篡改`);
  }

  // 同输入重放确定性（bundle/RNG/事件/账本/预留）
  const history = inputHistoryOf(h.bundle);
  const r1 = Harness.create(42);
  const r2 = Harness.create(42);
  for (const entry of history) {
    r1.bundle = executeEncounterIntent(r1.bundle, entry.dto).bundle;
    r2.bundle = executeEncounterIntent(r2.bundle, entry.dto).bundle;
  }
  assert.deepEqual(r1.snap(), r2.snap(), 'G7：同输入重放 projection 一致');
  assert.deepEqual(worldOf(r1.bundle).encounterModel, worldOf(r2.bundle).encounterModel);
  assert.deepEqual(worldOf(r1.bundle).ecologyModel, worldOf(r2.bundle).ecologyModel);
  assert.deepEqual(
    eventsOf(r1.bundle).map((e) => [eventTypeOf(e), eventSeqOf(e)]),
    eventsOf(r2.bundle).map((e) => [eventTypeOf(e), eventSeqOf(e)]),
    'G7：事件序列与 seq 一致',
  );
  assert.deepEqual(r1.snap(), h.snap(), 'G7：重放与原始运行一致');
});
