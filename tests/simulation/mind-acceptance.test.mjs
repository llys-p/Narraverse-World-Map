import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';

// M1A core modules are a required dependency for this acceptance suite.
const [fixture, state, planner, runtime, knowledge] = await Promise.all([
  import('../../runtime/fixtures/mind-village.mjs'),
  import('../../runtime/core/mind-state.mjs'),
  import('../../runtime/core/mind-planner.mjs'),
  import('../../runtime/core/mind-runtime.mjs'),
  import('../../runtime/knowledge/mind-knowledge.mjs'),
]);
const M1 = { fixture, state, planner, runtime, knowledge };

// ---------------------------------------------------------------------------
// 独立 world/agent/mind 定位辅助。
// ---------------------------------------------------------------------------
const agent = (w, id) => w.societyModel.agents.find((a) => a.state.actorId === id).state;
const actorOf = (w, id) => w.actorModel.actors.find((a) => a.actorId === id);
const mindActor = (w, id) => w.mindModel.actors.find((a) => a.actorId === id);
const seqWhere = (bundle, predicate) => bundle.eventLog.find(predicate)?.eventSeq;
const mk = (patch) => {
  const config = patch ? patch(M1.fixture.defaultMindVillageConfig()) : M1.fixture.defaultMindVillageConfig();
  return M1.fixture.createMindVillage(42, 'mind-village', config);
};
const session = (f) => createSimulationSession(f.bundle, f.systems);
const advance = (f, ticks) => { const s = session(f); s.advanceTicks(ticks); return s.getBundle(); };
const know = (bundle, id) => M1.knowledge.buildMindKnowledge(bundle, id);
async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'world-mind-acceptance-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix)); await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}

// =============================================================================
// K1 信息隔离 / 配对因果 / 泄漏
// =============================================================================
test('K1 信息隔离：默认推进24 — actor-2=unavailable/600、actor-3=available/900，互不可见，公仓仍20', () => {
  const bundle = advance(mk(), 24);
  assert.equal(bundle.snapshot.world.resources.herbs, 20, 'world 公仓仍 20');
  const k2 = know(bundle, 'actor-2');
  const k3 = know(bundle, 'actor-3');
  assert.deepEqual({ value: k2.belief.value, confidencePermille: k2.belief.confidencePermille }, { value: 'unavailable', confidencePermille: 600 });
  assert.deepEqual({ value: k3.belief.value, confidencePermille: k3.belief.confidencePermille }, { value: 'available', confidencePermille: 900 });
  assert.equal(k2.observations.length, 1);
  assert.equal(k3.observations.length, 1);
  assert.equal(k2.observations[0].channel, 'statement');
  assert.equal(k2.observations[0].sourceActorId, 'actor-1');
  assert.equal(k3.observations[0].channel, 'market-check');
  // 双方看不到另一刺激
  assert.equal(k2.observations.every((o) => o.channel !== 'market-check'), true);
  assert.equal(k3.observations.every((o) => o.channel !== 'statement'), true);
});

test('K1 143 尚无非决策 → 144：2 NoAction(钱包100/药0)，3 BuyMedicine(50, 100→50, 0→1, 公仓20→19)', () => {
  const f = mk(), s = session(f);
  s.advanceTicks(143);
  assert.equal(mindActor(s.getBundle().snapshot.world, 'actor-2').lastDecision, null);
  assert.equal(mindActor(s.getBundle().snapshot.world, 'actor-3').lastDecision, null);
  s.advanceTicks(1);
  const bundle = s.getBundle(), w = bundle.snapshot.world;
  const d2 = mindActor(w, 'actor-2'), d3 = mindActor(w, 'actor-3');
  assert.equal(d2.lastDecision.choice, 'NoAction');
  assert.equal(agent(w, 'actor-2').wallet, 100);
  assert.equal(agent(w, 'actor-2').inventory.herbs, 0);
  assert.equal(d3.lastDecision.choice, 'BuyMedicine');
  assert.equal(d3.lastOutcome.status, 'succeeded');
  assert.deepEqual(d3.lastOutcome.delta, { wallet: -50, herbs: 1, health: 0 });
  assert.equal(d3.lastOutcome.price, 50);
  assert.equal(agent(w, 'actor-3').wallet, 50);
  assert.equal(agent(w, 'actor-3').inventory.herbs, 1);
  assert.equal(w.resources.herbs, 19, '公仓只扣一次');
});

test('K1 配对因果：仅改 s01.available→true，其余不变，actor-2 在144也买(100→50, 0→1)，公仓18', () => {
  const f = mk((c) => { c.mind.stimuli.find((x) => x.stimulusId === 's01').available = true; return c; });
  const bundle = advance(f, 144), w = bundle.snapshot.world;
  const d2 = mindActor(w, 'actor-2'), d3 = mindActor(w, 'actor-3');
  assert.equal(d2.lastDecision.choice, 'BuyMedicine', '只变同一人 s01.available，actor-2 从 NoAction 反转为买药');
  assert.equal(d2.lastOutcome.status, 'succeeded');
  assert.equal(agent(w, 'actor-2').wallet, 50);
  assert.equal(agent(w, 'actor-2').inventory.herbs, 1);
  assert.equal(d3.lastDecision.choice, 'BuyMedicine', 'actor-3 行为不变');
  assert.equal(agent(w, 'actor-3').wallet, 50);
  assert.equal(w.resources.herbs, 18);
});

test('K1 泄漏与纯度：改变他人私有钱包不改本人纯计划；planner 输入无世界/私有字段或隐藏 getter', () => {
  const base = M1.fixture.defaultMindVillageConfig();
  const altered = structuredClone(base);
  altered.memory.society.estates[2].initialWallet = 150; // 只变 actor-3 私有钱包，actor-2 可知输入不变
  const toDecisionPhase = (value) => ({ ...value, phase: 'decision', tick: 144, revision: 143 });
  const kBase = toDecisionPhase(know(mk().bundle, 'actor-2'));
  const kAltered = toDecisionPhase(know(M1.fixture.createMindVillage(42, 'mind-village', altered).bundle, 'actor-2'));
  assert.deepEqual(kBase, kAltered, '本人知识不变（他人钱包不属于其可知输入）');
  assert.deepEqual(M1.planner.planMindDecision(kBase), M1.planner.planMindDecision(kAltered), '纯计划不能变化');
  const buyKnowledge = { ...kBase, belief: { ...kBase.belief, value: 'available', confidencePermille: 900 } };
  assert.equal(M1.planner.planMindDecision(buyKnowledge).goal.step, 'buy', '纯 BuyMedicine 决策应返回更新后的 goal.step');
  const useKnowledge = { ...kBase, self: { ...kBase.self, inventory: { ...kBase.self.inventory, herbs: 1 } } };
  assert.equal(M1.planner.planMindDecision(useKnowledge).goal.step, 'use', '纯 UseMedicine 决策应返回更新后的 goal.step');
  // Knowledge 白名单（§8.1），无 bundle/world/其他私有字段
  const allowed = ['knowledgeVersion', 'phase', 'simulationId', 'actorId', 'tick', 'revision', 'self', 'quote', 'observations', 'belief', 'innerStance', 'committedIntent'];
  assert.deepEqual(Object.keys(kBase).sort(), allowed.sort());
  const forbidden = ['world', 'bundle', 'snapshot', 'eventLog', 'resources', 'orderbook', 'agents', 'estate', 'ledger', 'mindModel'];
  const paths = [];
  const scan = (value, prefix) => {
    if (value && typeof value === 'object') for (const key of Object.keys(value)) { paths.push(`${prefix}.${key}`); scan(value[key], `${prefix}.${key}`); }
  };
  scan(kBase, 'knowledge');
  assert.equal(paths.some((p) => forbidden.some((f) => p.split('.').includes(f))), false, 'knowledge 不得携带世界/他人私有字段');
  for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(kBase))) assert.ok('value' in desc, `knowledge.${key} 不得是隐藏 getter`);
  assert.equal(JSON.stringify(kBase), JSON.stringify(JSON.parse(JSON.stringify(kBase))), 'knowledge 必须是可序列化纯数据');
  // 原世界账仍合法
  validateBundle(mk().bundle, { rulesVersion: M1.state.MIND_RULES, systems: M1.fixture.mindSystems() });
});

// =============================================================================
// K2 未知 / 反证 / 过期
// =============================================================================
test('K2 空stimuli对照：143 belief=unknown/0，144 均 NoAction', () => {
  const f = mk((c) => { c.mind.stimuli = []; return c; });
  const bundle143 = advance(f, 143);
  for (const id of ['actor-2', 'actor-3']) {
    const b = know(bundle143, id).belief;
    assert.deepEqual({ value: b.value, confidencePermille: b.confidencePermille }, { value: 'unknown', confidencePermille: 0 });
    assert.deepEqual(b.evidenceRefs, []);
    assert.deepEqual(b.contradictionRefs, []);
    assert.equal(b.lastUpdatedTick, null);
  }
  const bundle144 = advance(f, 144);
  assert.equal(mindActor(bundle144.snapshot.world, 'actor-2').lastDecision.choice, 'NoAction');
  assert.equal(mindActor(bundle144.snapshot.world, 'actor-3').lastDecision.choice, 'NoAction');
  assert.equal(bundle144.snapshot.world.resources.herbs, 20);
});

test('K2 反证：默认144结算后 actor-2 被日末公开库存纠正为 available/900，contradictionRefs 含 s01；lastDecision 仍保留 unavailable 依据', () => {
  const bundle = advance(mk(), 144), w = bundle.snapshot.world;
  const s01seq = seqWhere(bundle, (e) => e.type === 'MindStimulusResolved' && e.payload.stimulusId === 's01');
  const d2 = mindActor(w, 'actor-2');
  const k2 = know(bundle, 'actor-2');
  assert.equal(k2.belief.value, 'available');
  assert.equal(k2.belief.confidencePermille, 900);
  assert.ok(k2.belief.contradictionRefs.includes(s01seq), '日末公开事实纠正先前的错误说法');
  // 当时判断未被后来报告改写
  assert.equal(d2.lastDecision.choice, 'NoAction');
  assert.equal(d2.lastDecision.reasonCode, 'SUPPLY_UNAVAILABLE');
  assert.ok(d2.lastDecision.evidenceRefs.includes(s01seq), '当时判断依据冻结为 s01 源');
  const buyCand = d2.lastDecision.candidates.find((c) => c.action === 'BuyMedicine');
  assert.deepEqual({ eligible: buyCand.eligible, reasonCode: buyCand.reasonCode }, { eligible: false, reasonCode: 'SUPPLY_UNAVAILABLE' });
});

test('K2 到288：actor-2 复用 recover-health Goal 买药(实扣当时已发布报价)；actor-3 用私药 UseMedicine(health+100, 药-1)', () => {
  const bundle = advance(mk(), 288), w = bundle.snapshot.world;
  const d2 = mindActor(w, 'actor-2'), d3 = mindActor(w, 'actor-3');
  assert.equal(agent(w, 'actor-2').currentGoal.kind, 'recover-health');
  assert.equal(d2.lastDecision.choice, 'BuyMedicine');
  assert.equal(d2.lastOutcome.status, 'succeeded');
  const price = d2.lastOutcome.price;
  assert.ok(Number.isInteger(price) && price >= 25 && price <= 150, '药价在挂牌区间内');
  assert.equal(-d2.lastOutcome.delta.wallet, price, '实扣即为所报单价');
  assert.deepEqual(d2.lastOutcome.delta, { wallet: -price, herbs: 1, health: 0 });
  assert.equal(agent(w, 'actor-2').wallet, 100 - price, '钱包只扣除买药');
  assert.equal(d3.lastDecision.choice, 'UseMedicine');
  assert.equal(d3.lastOutcome.status, 'succeeded');
  assert.deepEqual(d3.lastOutcome.delta, { wallet: 0, herbs: -1, health: 100 });
  assert.equal(d3.lastOutcome.price, null);
  assert.equal(actorOf(w, 'actor-3').health, 500);
});

test('K2 TTL纯函数边界：tick12 statement 在 299 有效、300 过期未知；保留最新活跃源并正确列出矛盾源；无新来源不续期', () => {
  const derive = M1.state.deriveMindBelief;
  const obs = [{ sourceEventSeq: 11, occurrenceTick: 12, observedTick: 12, channel: 'statement', sourceActorId: 'actor-1', available: false, confidencePermille: 600, expiresTick: 300 }];
  const at299 = derive(obs, 299);
  assert.deepEqual({ value: at299.value, confidencePermille: at299.confidencePermille }, { value: 'unavailable', confidencePermille: 600 });
  const at300 = derive(obs, 300);
  assert.deepEqual({ value: at300.value, confidencePermille: at300.confidencePermille }, { value: 'unknown', confidencePermille: 0 });
  assert.deepEqual(at300.evidenceRefs, []);
  assert.deepEqual(at300.contradictionRefs, []);
  assert.equal(at300.lastUpdatedTick, null);
  // 最新活跃源取胜，反值活跃源入 contradictionRefs
  const later = { sourceEventSeq: 20, occurrenceTick: 50, observedTick: 50, channel: 'daily-public', sourceActorId: null, available: true, confidencePermille: 900, expiresTick: 338 };
  const mixed = derive([...obs, later], 100);
  assert.deepEqual({ value: mixed.value, confidencePermille: mixed.confidencePermille }, { value: 'available', confidencePermille: 900 });
  assert.deepEqual(mixed.evidenceRefs, [20]);
  assert.deepEqual(mixed.contradictionRefs, [11]);
  const rejection = { sourceEventSeq: 21, occurrenceTick: 100, observedTick: 100, channel: 'own-rejection', sourceActorId: null, available: null, confidencePermille: 0, expiresTick: 388 };
  const rejected = derive([...obs, rejection], 100);
  assert.deepEqual({ value: rejected.value, confidencePermille: rejected.confidencePermille }, { value: 'unknown', confidencePermille: 0 });
  assert.deepEqual(rejected.evidenceRefs, [21], '最新 own-rejection 是胜出来源，不能丢失其事件依据');
  assert.deepEqual(rejected.contradictionRefs, []);
});

test('K2 死者报价隔离：初始死亡与第144tick死亡者只保留生前可见报价，不读未来挂牌价', () => {
  const base = M1.fixture.defaultMindVillageConfig();
  const initialPrice = base.memory.society.actors.market.products.herbs.basePrice;
  const immediatelyDead = structuredClone(base);
  immediatelyDead.memory.society.actors.initialActors[1].health = 0;
  const initial = M1.fixture.createMindVillage(42, 'mind-village', immediatelyDead).bundle;
  const initialKnowledge = know(initial, 'actor-2');
  assert.equal(initialKnowledge.self.alive, false);
  assert.deepEqual(initialKnowledge.quote, { product: 'herbs', price: initialPrice, observedTick: 0, sourceEventSeq: null });

  const diesAt144 = structuredClone(base);
  diesAt144.memory.society.actors.initialActors[1].health = 1;
  diesAt144.memory.society.actors.initialActors[1].hunger = 1000;
  for (const estate of diesAt144.memory.society.estates) { estate.initialFood = 0; estate.initialHerbs = 0; }
  diesAt144.memory.society.player.initialFood = 0;
  diesAt144.memory.society.player.initialHerbs = 0;
  const resources = diesAt144.memory.society.actors.market.ecology.resources.resources;
  for (const id of ['food', 'herbs']) { resources[id].initial = 0; resources[id].production.numerator = 0; }
  diesAt144.memory.society.actors.market.products.food.maxOrder = 0;
  diesAt144.memory.society.actors.market.products.herbs.maxOrder = 0;
  const deadFixture = M1.fixture.createMindVillage(42, 'mind-village', diesAt144);
  const deadBundle = advance(deadFixture, 144);
  assert.equal(actorOf(deadBundle.snapshot.world, 'actor-2').alive, false, '健康值1且无粮使该人物按日结规则死亡');
  const deadKnowledge = know(deadBundle, 'actor-2');
  assert.deepEqual(deadKnowledge.quote, { product: 'herbs', price: initialPrice, observedTick: 0, sourceEventSeq: null },
    '死亡者不接收死亡日公开报价；无生前报告时只能使用初始配置牌价');
});

// =============================================================================
// K3 权威与拒绝（最后 1 药的双 NPC 竞争 / 玩家抢先 / 先拒后日末）
// =============================================================================
function competitionConfig() {
  const c = M1.fixture.defaultMindVillageConfig();
  c.memory.society.actors.market.ecology.resources.resources.herbs.initial = 1;
  c.mind.stimuli = [
    { stimulusId: 's01', tick: 12, kind: 'market-check', listenerId: 'actor-2' },
    { stimulusId: 's02', tick: 24, kind: 'market-check', listenerId: 'actor-3' },
  ];
  return c;
}

test('K3 最后一药双NPC竞争：同快照均计划Buy；2成功(50,公仓1→0)，3 rejected/钱包100不变/Goal.failures恰+1，先拒后日末 unavailable', () => {
  const bundle = advance(mk(() => competitionConfig()), 144), w = bundle.snapshot.world;
  const d2 = mindActor(w, 'actor-2'), d3 = mindActor(w, 'actor-3');
  assert.equal(d2.lastDecision.choice, 'BuyMedicine');
  assert.equal(d3.lastDecision.choice, 'BuyMedicine', '两者都相信可买');
  assert.equal(d2.lastOutcome.status, 'succeeded');
  assert.equal(d3.lastOutcome.status, 'rejected', '只有真正资产校验通过者扣款');
  assert.equal(d3.lastOutcome.code, 'RULE_REJECTED');
  assert.deepEqual(d3.lastOutcome.delta, { wallet: 0, herbs: 0, health: 0 });
  assert.equal(d3.lastOutcome.price, null);
  assert.equal(agent(w, 'actor-3').wallet, 100, '失败不额外扣款');
  assert.equal(agent(w, 'actor-3').inventory.herbs, 0);
  assert.equal(agent(w, 'actor-3').currentGoal.failures, 1, '失败计数恰 +1');
  assert.equal(w.resources.herbs, 0);
  // 先拒绝、后日末空仓报告：事件顺序与观察顺序都成立
  const resolvedSeq = seqWhere(bundle, (e) => e.type === 'MindDecisionResolved' && e.payload.actorId === 'actor-3');
  const settleSeq = seqWhere(bundle, (e) => e.type === 'SocietyDaySettled');
  assert.ok(resolvedSeq < settleSeq, '同 tick resolved 先于日末结算');
  const k3 = know(bundle, 'actor-3');
  assert.ok(k3.observations.some((o) => o.channel === 'own-rejection' && o.available === null), 'own-rejection 先为 unknown');
  assert.equal(k3.belief.value, 'unavailable', '随后日末真实报告更新为 unavailable');
});

test('K3 玩家 143→144 抢先购买：玩家经唯一入口买1药，NPC2/3 仍凭旧证据计划但权威提交拒绝（不能凭信念造药或绕顺序）', () => {
  const f = mk(() => competitionConfig());
  const at143 = advance(f, 143);
  const moved = M1.runtime.executeMindPlayerIntent(at143, { commandId: 'p-buy-herb', type: 'PlayerBuy', payload: { product: 'herbs', quantity: 1 } });
  const bundle = moved.bundle, w = bundle.snapshot.world;
  assert.equal(moved.outcome, 'succeeded', '玩家动作本身成功');
  assert.equal(w.resources.herbs, 0, '玩家 144 抢先买空');
  assert.equal(w.playerModel.inventory.herbs, 1);
  const d2 = mindActor(w, 'actor-2'), d3 = mindActor(w, 'actor-3');
  assert.equal(d2.lastDecision.choice, 'BuyMedicine');
  assert.equal(d3.lastDecision.choice, 'BuyMedicine');
  assert.equal(d2.lastOutcome.status, 'rejected');
  assert.equal(d3.lastOutcome.status, 'rejected');
  assert.equal(agent(w, 'actor-2').inventory.herbs, 0);
  assert.equal(agent(w, 'actor-3').inventory.herbs, 0);
});

// =============================================================================
// K4 纯主观变化（观察不写资产 / NoAction 无命令回执休息收益 / 日结算不被跳过）
// =============================================================================
test('K4 无外显行动：空stimuli初始fatigue200，推进144两人NoAction，无mind-day-*回执/inputSeq/restDays，无休息收益，私粮各消费1', () => {
  const f = mk((c) => { c.mind.stimuli = []; return c; });
  const bundle = advance(f, 144), w = bundle.snapshot.world;
  for (const id of ['actor-2', 'actor-3']) {
    assert.equal(mindActor(w, id).lastDecision.choice, 'NoAction');
    assert.equal(agent(w, id).lastAction, 'None', '无动作日清为 None，不留上日 Rest 标识');
    assert.equal(agent(w, id).ledger.restDays, 0, '不增加 restDays');
    assert.equal(actorOf(w, id).fatigue, 200, '无休息收益');
    assert.equal(agent(w, id).inventory.food, 19, '正常私粮仍各消费 1');
    assert.equal(actorOf(w, id).health, 400, '不额外领取公药治疗');
  }
  const receiptIds = Object.keys(bundle.snapshot.commandReceipts);
  assert.equal(receiptIds.some((id) => id.startsWith('mind-day-')), false, '无 mind-day-* 命令回执');
  assert.equal(bundle.snapshot.pendingCommands.some((c) => c.commandId.startsWith('mind-day-')), false);
  assert.equal(receiptIds.some((id) => id.startsWith('society-day-') && (id.includes('actor-2') || id.includes('actor-3'))), false);
  // 再推进144可依据新日末报告买药，但仍不可产生 Rest 回执或 restDays
  const bundle288 = advance(f, 288), w2 = bundle288.snapshot.world;
  assert.equal(mindActor(w2, 'actor-2').lastDecision.choice, 'BuyMedicine');
  assert.equal(mindActor(w2, 'actor-3').lastDecision.choice, 'BuyMedicine');
  assert.equal(agent(w2, 'actor-2').ledger.restDays, 0);
  assert.equal(agent(w2, 'actor-3').ledger.restDays, 0);
});

// =============================================================================
// K5 保存与重演（完整 vs 分段一致 / 7 类篡改拒绝）
// =============================================================================
function runDirect(ticks) { const f = mk(); const s = session(f); s.advanceTicks(ticks); return s.getBundle(); }
async function runResume(dir, totalTicks, saveAt) {
  const f = mk(); const s = session(f); s.advanceTicks(saveAt);
  const options = { rulesVersion: M1.state.MIND_RULES, systems: M1.fixture.mindSystems() };
  const file = await saveCheckpoint(s.getBundle(), { directory: dir, ...options });
  const loaded = await loadCheckpoint(file, options);
  const resumed = createSimulationSession(loaded, M1.fixture.mindSystems());
  resumed.advanceTicks(totalTicks - saveAt);
  return resumed.getBundle();
}

test('K5 完整重演：默认连续288 = 保存tick24后续264 = 保存tick143后续145（整份bundle一致，非仅hash）', async (t) => {
  const dir = await temporary(t);
  const full = runDirect(288);
  assert.deepEqual(await runResume(dir, 288, 24), full);
  assert.deepEqual(await runResume(dir, 288, 143), full);
});

test('K5 竞争分支重演：连续288（144失败后续144）整份bundle一致', async (t) => {
  const dir = await temporary(t);
  const f = mk(() => competitionConfig()), s = session(f); s.advanceTicks(288);
  const full = s.getBundle();
  const g = mk(() => competitionConfig()), s2 = session(g); s2.advanceTicks(144);
  const options = { rulesVersion: M1.state.MIND_RULES, systems: M1.fixture.mindSystems() };
  const file = await saveCheckpoint(s2.getBundle(), { directory: dir, ...options });
  const resumed = createSimulationSession(await loadCheckpoint(file, options), M1.fixture.mindSystems());
  resumed.advanceTicks(144);
  assert.deepEqual(resumed.getBundle(), full);
});

test('K5 篡改拒绝：刺激来源/脚本游标/observedTick/决定证据/决定choice与指纹/Goal/重复事件回执 7 类一律拒绝，冷冻输入不变', () => {
  const bundle = runDirect(288);
  const envelope = { formatVersion: 1, ...structuredClone(bundle) };
  const rejects = () => {
    const b = { snapshot: envelope.snapshot, eventLog: envelope.eventLog };
    validateBundle(b, { rulesVersion: M1.state.MIND_RULES, systems: M1.fixture.mindSystems() });
    M1.runtime.validateMindRuntimeHistory(envelope.snapshot, envelope.eventLog);
  };
  assert.doesNotThrow(rejects, '原封不动必须通过');
  const mutators = [
    ['1.刺激来源/内容', (e) => { e.snapshot.world.mindModel.config.stimuli[0].available = !e.snapshot.world.mindModel.config.stimuli[0].available; }],
    ['2.脚本游标 scriptCursor', (e) => { e.snapshot.world.mindModel.scriptCursor++; }],
    ['3.observedTick', (e) => { e.snapshot.world.mindModel.actors[0].observations[0].observedTick++; }],
    ['4.决定证据 evidenceRefs', (e) => { e.snapshot.world.mindModel.actors[0].lastDecision.evidenceRefs = [9999999]; }],
    ['5.决定 choice/指纹', (e) => { e.snapshot.world.mindModel.actors[0].lastDecision.choice = 'BuyMedicine'; e.snapshot.world.mindModel.actors[0].lastDecision.knowledgeFingerprint = 'forged'; }],
    ['6.Goal', (e) => { e.snapshot.world.mindModel.actors[0].lastDecision.goalId = 9999999; }],
    ['7.重复事件/回执', (e) => { e.eventLog.push(structuredClone(e.eventLog[e.eventLog.length - 1])); }],
  ];
  for (const [name, mutate] of mutators) {
    const env = structuredClone(envelope);
    mutate(env);
    assert.throws(() => {
      const b = { snapshot: env.snapshot, eventLog: env.eventLog };
      validateBundle(b, { rulesVersion: M1.state.MIND_RULES, systems: M1.fixture.mindSystems() });
      M1.runtime.validateMindRuntimeHistory(env.snapshot, env.eventLog);
    }, (e) => Boolean(e && e.code), `${name} 必须被拒绝`);
  }
  // 冷冻输入不变
  assert.deepEqual({ snapshot: envelope.snapshot, eventLog: envelope.eventLog }, structuredClone(bundle));
});

test('K5 完整审计拒绝缺失的到期刺激前缀：scriptCursor=0不能为tick24空事件日志开绿灯', () => {
  const { bundle } = mk();
  const tampered = structuredClone(bundle);
  tampered.snapshot.tick = 24;
  tampered.snapshot.revision = 24;
  assert.throws(() => validateBundle(tampered, { rulesVersion: M1.state.MIND_RULES, systems: M1.fixture.mindSystems() }),
    (error) => Boolean(error && error.code), 'snapshot 到达刺激tick后，完整审计必须要求对应的配置前缀已消费');
});

// =============================================================================
// K7 兼容与独立性（旧 C5 四日 / D2C 六操作与基准一致）
// =============================================================================
test('K7 兼容：D2C 六操作完整 bundle 与逐段恢复一致', async (t) => {
  const { PLAY_RULES, executePlayerIntent } = await import('../../runtime/core/player-intents.mjs');
  const { createPlayerPlayVillage, playerPlaySystems } = await import('../../runtime/fixtures/player-play-village.mjs');
  const dir = await temporary(t);
  const start = createPlayerPlayVillage().bundle;
  const ops = [
    { commandId: 'op1', type: 'PlayerTravel', payload: { destination: 'forest' } },
    { commandId: 'op2', type: 'PlayerTravel', payload: { destination: 'village' } },
    { commandId: 'op3', type: 'PlayerRest', payload: {} },
    { commandId: 'op4', type: 'PlayerBuy', payload: { product: 'food', quantity: 1 } },
    { commandId: 'op5', type: 'PlayerBuy', payload: { product: 'herbs', quantity: 1 } },
    { commandId: 'op6', type: 'PlayerSell', payload: { product: 'food', quantity: 1 } },
  ];
  let whole = start;
  for (const op of ops) whole = executePlayerIntent(whole, op).bundle;
  // 逐段恢复：前 3 操作保存后恢复再跑后 3 操作
  let part = start;
  for (const op of ops.slice(0, 3)) part = executePlayerIntent(part, op).bundle;
  const options = { rulesVersion: PLAY_RULES, systems: playerPlaySystems() };
  const file = await saveCheckpoint(part, { directory: dir, ...options });
  let resumed = await loadCheckpoint(file, options);
  for (const op of ops.slice(3)) resumed = executePlayerIntent(resumed, op).bundle;
  assert.deepEqual(resumed, whole);
});

test('K7 兼容：旧 C5 四日完整 vs 2+2 恢复一致', async (t) => {
  const { createPersonalityFood } = await import('../../runtime/fixtures/personality-village.mjs');
  const { memorySystems } = await import('../../runtime/fixtures/memory-village.mjs');
  const { PERSONALITY_RULES } = await import('../../runtime/core/memory-runtime.mjs');
  const dir = await temporary(t);
  const whole = session2(createPersonalityFood(42), 4 * 144);
  const half = session2(createPersonalityFood(42), 2 * 144);
  const options = { rulesVersion: PERSONALITY_RULES, systems: memorySystems() };
  const file = await saveCheckpoint(half, { directory: dir, ...options });
  const resumed = createSimulationSession(await loadCheckpoint(file, options), memorySystems());
  resumed.advanceTicks(2 * 144);
  assert.deepEqual(resumed.getBundle(), whole);
});
function session2(f, ticks) { const s = createSimulationSession(f.bundle, f.systems); s.advanceTicks(ticks); return s.getBundle(); }
