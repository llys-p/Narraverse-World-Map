// M3-2B 独立验收（B 路）：本人 Work 经验消费 —— planner 配对、真实闭环、因果/幂等、getter 预检与 rollback。
// 合同唯一权威：m3-experience-runtime-contract-v1（M3-2A §共同合同）；旧四日与错误语义另据 m2-contract-v2。
// 独立性：所有 expected 均为手算（注释给出推导）或来自冻结 M2 源码/主控实跑钉死数字；不从被测实现反推。
// 依赖门控：A 路生产（experience-state / work-experience-adapter / experience-village 及既有模块新导出）尚未派发，
// 缺失时按精确 ERR_MODULE_NOT_FOUND / 缺名动态跳过；A 落地后自动转为真实运行。其余错误（SyntaxError 等）为未通过证据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson, fault } from '../../runtime/core/data-contract.mjs';
// 冻结内核（M3-1A，现在就存在）：观察/派生四样本窗口。
import { createWorkExperienceState, observeWorkOutcome, deriveWorkExperience,
  WORK_EXPERIENCE_VIEW_VERSION, MAX_WORK_EXPERIENCE_STATE_BYTES } from '../../runtime/core/work-experience.mjs';
// 基线 M2 模块（现在就存在，只读参考）。
import { defaultMotivationVillageConfig, createMotivationVillage, motivationSystems } from '../../runtime/fixtures/motivation-village.mjs';
import { executeMotivationPlayerIntent } from '../../runtime/core/motivation-runtime.mjs';
import { planMotivationDecision } from '../../runtime/core/motivation-planner.mjs';

// ---- A 路依赖探针：三份新生产模块 + 既有模块的新导出。任一缺失按“依赖未到”动态跳过。 ----
const REQUIRED = ['../../runtime/core/experience-state.mjs', '../../runtime/core/work-experience-adapter.mjs', '../../runtime/fixtures/experience-village.mjs'];
let deps = null, depFailure = null;
try {
  deps = { state: await import(REQUIRED[0]), adapter: await import(REQUIRED[1]), fixture: await import(REQUIRED[2]) };
} catch (error) { depFailure = error; }
const EXTRA_EXPORTS = [
  ['../../runtime/core/motivation-planner.mjs', () => import('../../runtime/core/motivation-planner.mjs'), ['planExperienceMotivationDecision']],
  ['../../runtime/core/motivation-runtime.mjs', () => import('../../runtime/core/motivation-runtime.mjs'), ['experienceRuntimeHooks', 'validateExperienceWorld', 'executeExperiencePlayerIntent']],
  ['../../runtime/core/motivation-state.mjs', () => import('../../runtime/core/motivation-state.mjs'), ['validateExperienceMotivationDecision', 'validateExperienceMotivationModel']],
];
const extraModules = await Promise.all(EXTRA_EXPORTS.map(async ([specifier, load, names]) => [specifier, await load(), names]));
const plannerExports = extraModules[0][1];
const runtimeExports = extraModules[1][1];
const stateExports = extraModules[2][1];
function gate(t) {
  if (depFailure !== null) {
    if (depFailure.code === 'ERR_MODULE_NOT_FOUND') {
      t.skip('A 路依赖未导入，待中控派发 SHA 后运行：' + (depFailure.url ?? REQUIRED.join(', ')));
      return false;
    }
    // SyntaxError / 初始化失败等不是“依赖未到”，是未通过证据。
    assert.fail('A 路依赖模块加载失败（非缺失）：' + (depFailure.stack ?? String(depFailure)));
  }
  const missing = [];
  for (const [specifier, module, names] of extraModules)
    for (const name of names)
      if (typeof module[name] !== 'function') missing.push(specifier + ' 导出 ' + name);
  if (missing.length) { t.skip('A 路依赖未导入，待中控派发 SHA 后运行：' + missing.join(', ')); return false; }
  return true;
}
const clone = value => structuredClone(value);

// ---- 手算与配方工具 ----
// 公共现金 = resources.gold − Σ agent wallet − playerModel.wallet（冻结 M2 验收口径）。
const agentOf = (b, id = 'actor-2') => b.snapshot.world.societyModel.agents.find(a => a.state.actorId === id).state;
const bodyOf = (b, id = 'actor-2') => b.snapshot.world.actorModel.actors.find(a => a.actorId === id);
const mindOf = (b, id = 'actor-2') => b.snapshot.world.motivationModel.actors.find(a => a.actorId === id);
const communal = b => b.snapshot.world.resources.gold
  - b.snapshot.world.societyModel.agents.reduce((n, a) => n + a.state.wallet, 0) - b.snapshot.world.playerModel.wallet;
const factsOf = (b, type, tick, id) => b.eventLog.filter(e => e.type === type && e.tick === tick && (id === undefined || e.entityIds.includes(id)));

// E2 配方（M3-2A 合同 E2 / M2 合同 Q3 配对 recipe，全部为 M2 合法输入；主控实跑钉死数字已在测试内断言）。
function m2FailureRecipe({ secondRequest = true } = {}) {
  const config = defaultMotivationVillageConfig();
  config.memory.society.player.initialHerbs = 20; // memory.society.player，不是顶层
  const res = config.memory.society.actors.market.ecology.resources.resources;
  res.herbs.initial = 50; res.herbs.production = { numerator: 0, denominator: 8 }; res.gold.initial = 350;
  config.motivation.requests = [{ requestId: 'd01', tick: 200, speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000, expiresTick: 432 }];
  if (secondRequest) config.motivation.requests.push({ requestId: 'd02', tick: 344, speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000, expiresTick: 576 });
  return config;
}

// 冻结 M2 验收测试（tests/simulation/motivation-acceptance.test.mjs）的 decisionKnowledge 形状是 oracle 场景构造的冻结来源；
// 这里按 M3-2A 合同 §3 在其上加 experience view 与严格 boolean useWorkExperience，knowledgeVersion 换为 experience-knowledge-v1。
const goal = () => ({ goalId: 1, kind: 'recover-health', step: 'use', startDay: 1, deadlineDay: 21, failures: 0, target: 800 });
const plan = () => ({ planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null });
function experienceKnowledge({ experience, useWorkExperience, urgencyPermille = 1000, dutyStatus = 'pending', planState } = {}) {
  const knowledge = {
    knowledgeVersion: 'experience-knowledge-v1', phase: 'decision', simulationId: 'm2c-independent', actorId: 'actor-2', tick: 288, revision: 287,
    self: { name: 'hunter', occupation: 'hunter', location: 'village', alive: true, health: 400, hunger: 0, fatigue: 650, wallet: 50,
      inventory: { food: 19, herbs: 1 }, currentGoal: goal(), nextGoalId: 2, cooldownUntilDay: 0 },
    quote: { product: 'herbs', price: 50, observedTick: 144, sourceEventSeq: 12 },
    observations: [{ sourceEventSeq: 12, occurrenceTick: 144, observedTick: 144, channel: 'daily-public', sourceActorId: null, available: true, confidencePermille: 900, expiresTick: 432 }],
    belief: { topic: 'public-herbs-available', value: 'available', confidencePermille: 900, evidenceRefs: [12], contradictionRefs: [], lastUpdatedTick: 144 },
    profile: { dutyWeightPermille: 900, riskAversionPermille: 200 },
    duty: { requestId: 'd01', sourceEventSeq: 13, observedTick: 200, expiresTick: 432, urgencyPermille, status: dutyStatus, fulfilledTick: dutyStatus === 'fulfilled' ? 288 : null },
    planState: planState ?? { activePlan: plan(), suspendedPlan: null, nextPlanId: 2, lastReviewedDutyId: null },
    experience, useWorkExperience,
  };
  return knowledge;
}
// 经冻结内核 deriveWorkExperience 真实派生的 view；seq=23 是 E2 配方世界 tick288 真实 Work Resolved 的事件序号（主控实跑钉死）。
function kernelView(simulationId, { sampleCount = 0, seq = 23 } = {}) {
  let state = createWorkExperienceState(simulationId, 'actor-2');
  for (let i = 0; i < sampleCount; i++) {
    state = observeWorkOutcome(state, { simulationId, actorId: 'actor-2', sourceEventSeq: seq + i, occurrenceTick: 288 + i,
      decisionId: 'experience-day-2-actor-2', commandId: 'experience-day-2-actor-2', action: 'WorkForPay', status: 'rejected', code: 'RULE_REJECTED' }).state;
  }
  return deriveWorkExperience(state);
}

// E1 候选手算（knowledge.self：health 400 / fatigue 650 / herbs 1 / Goal1；duty d01 pending）：
//   strain = min(1000, 650 + max(0, 700−400)) = 950；recovery = max(0, 800−400) + 300 = 700。
//   WorkForPay support = floor(urgency×900/1000)；opposition = floor(950×200/1000) = 190；
//   开关 true 时 opposition 再加 kernel penalty（合同 §3：可到 1300，不得夹到 1000），score = support − opposition。
//   urgency=1000 → support 900，Work 710；+penalty100 → 290/610。urgency=899 → support floor(899×900/1000)=809，Work 619/519。
//   UseMedicine 700（goal 存在、私药 1>0、health<1000）；BuyMedicine 私药≠0 → soft-ineligible（null/0/0）；
//   Rest fatigue 650≥600 → 650；NoAction 0。
function expectedCandidates({ penalty = 0, useWorkExperience = true, urgency = 1000, gateReason = 'NEW_MAJOR_DUTY' } = {}) {
  const support = Math.floor(urgency * 900 / 1000);
  const opposition = Math.floor(950 * 200 / 1000) + (useWorkExperience ? penalty : 0);
  const committed = gateReason === 'CONTINUE_COMMITTED' || gateReason === 'RESUME_COMMITTED';
  return [
    { action: 'UseMedicine', provider: 'health-need', sourceRef: 'recover-health', eligible: true, score: 700, support: 700, opposition: 0, reasonCode: 'RECOVER_HEALTH' },
    { action: 'BuyMedicine', provider: 'health-need', sourceRef: 'recover-health', eligible: false, score: null, support: 0, opposition: 0, reasonCode: 'PRIVATE_MEDICINE_PRESENT' },
    { action: 'WorkForPay', provider: 'role-request', sourceRef: 'd01', eligible: true, score: support - opposition, support, opposition, reasonCode: 'DUTY' },
    { action: 'Rest', provider: 'fatigue-need', sourceRef: 'self-fatigue', eligible: true, score: 650, support: 650, opposition: 0, reasonCode: 'FATIGUE_RELIEF' },
    { action: 'NoAction', provider: 'fallback', sourceRef: null, eligible: true, score: 0, support: 0, opposition: 0, reasonCode: 'WAIT' },
  ].map(c => ({ ...c, selectable: c.eligible && !(committed && c.action !== 'UseMedicine'),
    selectionBlockCode: !c.eligible ? 'SOFT_PRECONDITION_FAILED' : committed && c.action !== 'UseMedicine' ? 'COMMITMENT_PROTECTED' : null }));
}

// E2 新 profile 配方：defaultExperienceVillageConfig 之上按 M3-2A 合同 E2 覆写。
function experienceRecipe(useWorkExperience, { secondRequest = true, d01ExpiresTick = 432 } = {}) {
  const config = deps.fixture.defaultExperienceVillageConfig();
  config.memory.society.player.initialHerbs = 20;
  const res = config.memory.society.actors.market.ecology.resources.resources;
  res.herbs.initial = 50; res.herbs.production = { numerator: 0, denominator: 8 }; res.gold.initial = 350;
  config.motivation.requests = [{ requestId: 'd01', tick: 200, speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000, expiresTick: d01ExpiresTick }];
  if (secondRequest) config.motivation.requests.push({ requestId: 'd02', tick: 344, speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000, expiresTick: 576 });
  config.experience.useWorkExperience = useWorkExperience;
  return config;
}
function experienceVillage(config) {
  const f = deps.fixture.createExperienceVillage(42, 'recipe-pin', config);
  assert.ok(f.bundle && f.systems, 'createExperienceVillage 必须返回 bundle/systems');
  return { f, session: createSimulationSession(f.bundle, f.systems) };
}
// 配方 0→145：两人 tick144 各以价 50 买药（公共现金 50→150），玩家真实 PlayerSell herbs×7（+140，公共现金 150→10，耗 1 tick）。
function runToAfterSell(config) {
  const { f, session } = experienceVillage(config);
  session.advanceTicks(144);
  const sold = runtimeExports.executeExperiencePlayerIntent(session.getBundle(),
    { commandId: 'b2b-recipe-sell-seven', type: 'PlayerSell', payload: { product: 'herbs', quantity: 7 } });
  return { f, session, sold };
}

test('E2-A0 旧 M2 profile 物理钉子：配方实跑与主控钉死数字逐项一致，且旧规则无经验事件', t => {
  // 冻结来源：M2 合同 Q3 配对 recipe + 主控实跑钉死数字（seed42，createMotivationVillage(42,'recipe-pin',config)）。
  const f = createMotivationVillage(42, 'recipe-pin', m2FailureRecipe());
  const s = createSimulationSession(f.bundle, f.systems);
  const b0 = s.getBundle();
  // tick0：gold 350，公共现金 350−(0+100+100)−100=50；公共药 50−20(玩家已分拨)=30。
  assert.equal(b0.snapshot.world.resources.gold, 350);
  assert.equal(communal(b0), 50);
  assert.equal(b0.snapshot.world.resources.herbs, 30);
  assert.equal(b0.snapshot.world.playerModel.wallet, 100);
  assert.equal(b0.snapshot.world.playerModel.inventory.herbs, 20);
  assert.equal(agentOf(b0, 'actor-2').wallet, 100);
  assert.equal(agentOf(b0, 'actor-3').wallet, 100);
  s.advanceTicks(144);
  const b144 = s.getBundle();
  // tick144：两人各以价 50 买药入公账 → 公共现金 150；钱包各 50；actor-2 私药 1、health 400、fatigue 650。
  assert.equal(communal(b144), 150);
  assert.equal(agentOf(b144, 'actor-2').wallet, 50);
  assert.equal(agentOf(b144, 'actor-3').wallet, 50);
  assert.equal(mindOf(b144).lastDecision.choice, 'BuyMedicine');
  assert.equal(mindOf(b144).lastOutcome.price, 50);
  assert.equal(agentOf(b144, 'actor-2').inventory.herbs, 1);
  assert.equal(bodyOf(b144, 'actor-2').health, 400);
  assert.equal(bodyOf(b144, 'actor-2').fatigue, 650);
  // tick144 bundle 上真实 PlayerSell herbs×7：耗 1 tick（144→145），玩家 100→240、20→13，公共现金 150→10。
  const sold = executeMotivationPlayerIntent(b144, { commandId: 'b2b-probe-sell-seven', type: 'PlayerSell', payload: { product: 'herbs', quantity: 7 } });
  assert.equal(sold.outcome, 'succeeded');
  assert.equal(sold.durationTicks, 1);
  assert.equal(b144.snapshot.tick, 144);
  assert.equal(sold.bundle.snapshot.tick, 145);
  assert.equal(sold.bundle.snapshot.world.playerModel.wallet, 240);
  assert.equal(sold.bundle.snapshot.world.playerModel.inventory.herbs, 13);
  assert.equal(communal(sold.bundle), 10);
  const next = createSimulationSession(sold.bundle, motivationSystems());
  next.advanceTicks(143);
  const b288 = next.getBundle();
  // tick288：d01 已于 tick200 送达（seq 18 钉死）；Work 710>Use 700 走 NEW_MAJOR_DUTY，权威因公共现金 10<工资 20 真实拒付。
  assert.equal(communal(b288), 10);
  const request = factsOf(b288, 'MotivationRequestResolved', 200).find(e => e.payload.requestId === 'd01');
  assert.equal(request.eventSeq, 18);
  const m = mindOf(b288);
  assert.equal(m.lastDecision.choice, 'WorkForPay');
  assert.equal(m.lastDecision.gateReason, 'NEW_MAJOR_DUTY');
  assert.deepEqual(m.lastDecision.candidates, expectedCandidates());
  const planned = factsOf(b288, 'MotivationDecisionPlanned', 288).find(e => e.payload.actorId === 'actor-2');
  const resolved = factsOf(b288, 'MotivationDecisionResolved', 288).find(e => e.payload.actorId === 'actor-2');
  assert.deepEqual([planned.eventSeq, resolved.eventSeq], [20, 23]); // 主控实跑钉死
  assert.equal(planned.commandId, null); // Planned 事件 commandId 必须为 null
  assert.equal(planned.payload.choice, 'WorkForPay'); // payload.choice 即 action
  assert.equal(planned.payload.decisionId, resolved.commandId);
  assert.deepEqual([resolved.payload.status, resolved.payload.code], ['rejected', 'RULE_REJECTED']);
  assert.deepEqual(resolved.payload.failureOwner, { planId: 2, goalId: null }); // 临时失败归属：不伤健康 Goal
  assert.equal(resolved.payload.commandId, 'motivation-day-2-actor-2');
  assert.deepEqual(resolved.payload.delta, { wallet: 0, herbs: 0, health: 0, fatigue: 0 });
  assert.equal(agentOf(b288, 'actor-2').wallet, 50);
  assert.equal(agentOf(b288, 'actor-2').currentGoal.failures, 0);
  assert.equal(agentOf(b288, 'actor-2').currentGoal.step, 'use');
  assert.deepEqual(
    { requestId: m.lastDuty.requestId, status: m.lastDuty.status, observedTick: m.lastDuty.observedTick, expiresTick: m.lastDuty.expiresTick, sourceEventSeq: m.lastDuty.sourceEventSeq },
    { requestId: 'd01', status: 'pending', observedTick: 200, expiresTick: 432, sourceEventSeq: 18 });
  assert.deepEqual([m.activePlan.planId, m.activePlan.status, m.suspendedPlan.planId], [2, 'blocked', 1]);
  // 旧 M2 事件日志中 ExperienceWorkObserved 恒为 0（该事件类型只在新规则出现）。
  assert.equal(b288.eventLog.filter(e => e.type === 'ExperienceWorkObserved').length, 0);
  // 继续 144 ticks（旧 M2 无经验消费）：d02 已于 344 送达 → 432 仍选 Work710，再次 RULE_REJECTED，公共现金仍 10。
  // 这就是 A 的 false 分支应记录第二个样本（sampleCount=2、penalty=200）且第三日起两 world 真实分歧的物理基线。
  next.advanceTicks(144);
  const b432 = next.getBundle();
  assert.equal(communal(b432), 10);
  assert.equal(mindOf(b432).lastDecision.choice, 'WorkForPay');
  assert.equal(mindOf(b432).lastDecision.candidates[2].score, 710);
  assert.deepEqual([mindOf(b432).lastOutcome.status, mindOf(b432).lastOutcome.code], ['rejected', 'RULE_REJECTED']);
  assert.equal(mindOf(b432).lastDuty.requestId, 'd02');
  assert.equal(agentOf(b432, 'actor-2').inventory.herbs, 1);
  assert.equal(bodyOf(b432, 'actor-2').health, 400);
});

test('E4-内核 冻结窗口幂等：同 seq 同九字段 duplicate、同 seq 异关联拒绝、淘汰 seq 拒绝、无无界 seen-set', t => {
  // 只依赖冻结内核 work-experience.mjs（现在已存在），不依赖 A。
  const sim = 'kernel-window-probe';
  const outcome = (seq, tick, tag, actorId = 'actor-2') => ({ simulationId: sim, actorId, sourceEventSeq: seq, occurrenceTick: tick,
    decisionId: 'experience-day-' + tag, commandId: 'experience-day-' + tag, action: 'WorkForPay', status: 'rejected', code: 'RULE_REJECTED' });
  const first = observeWorkOutcome(createWorkExperienceState(sim, 'actor-2'), outcome(23, 288, '2-actor-2'));
  assert.equal(first.disposition, 'learned');
  assert.equal(first.state.samples.length, 1);
  // 同 sourceEventSeq + 完整九字段一致 → 幂等 duplicate，不新增样本。
  const again = observeWorkOutcome(first.state, outcome(23, 288, '2-actor-2'));
  assert.equal(again.disposition, 'duplicate');
  assert.equal(again.state.samples.length, 1);
  // 同 seq 但关联字段（decisionId/commandId）不同 → 拒绝。
  assert.throws(() => observeWorkOutcome(first.state, outcome(23, 288, '2-actor-3')), e => e.code === 'INVALID_INPUT');
  // 填满窗口淘汰最早样本后被淘汰的旧 seq 拒绝。
  let state = first.state;
  for (let i = 0; i < 4; i++) state = observeWorkOutcome(state, outcome(100 + i, 300 + i, 'fill-' + i)).state;
  assert.equal(state.samples.length, 4);
  assert.throws(() => observeWorkOutcome(state, outcome(23, 288, '2-actor-2')), e => e.code === 'INVALID_INPUT');
  // 无无界 seen-set：600 条不同权威结果后状态仍恰 4 样本，canonical 字节数不超过冻结预算 8192。
  let bounded = createWorkExperienceState(sim, 'actor-3');
  for (let i = 0; i < 600; i++) bounded = observeWorkOutcome(bounded, outcome(1000 + i, 288 + i, 'stream-' + i, 'actor-3')).state;
  assert.equal(bounded.samples.length, 4);
  assert.ok(new TextEncoder().encode(canonicalJson(bounded)).length <= MAX_WORK_EXPERIENCE_STATE_BYTES);
});

test('E1 候选消费配对：penalty 只压 soft-eligible WorkForPay 的 opposition，承诺门照旧保护，损坏 view 拒绝', t => {
  if (!gate(t)) return;
  // 合同 §2：experience 模块冻结常量精确值。
  assert.deepEqual(
    [deps.state.EXPERIENCE_RULES, deps.state.EXPERIENCE_CONFIG_VERSION, deps.state.EXPERIENCE_RUNTIME_STATE_VERSION,
      deps.state.EXPERIENCE_MOTIVATION_STATE_VERSION, deps.state.EXPERIENCE_KNOWLEDGE_VERSION, deps.state.EXPERIENCE_DECISION_VERSION,
      deps.state.MAX_EXPERIENCE_EVIDENCE_REFS, deps.state.MAX_EXPERIENCE_KNOWLEDGE_BYTES, deps.state.MAX_EXPERIENCE_MODEL_BYTES],
    ['m-experience-v1', 'experience-config-v1', 'experience-runtime-state-v1', 'experience-motivation-state-v1',
      'experience-knowledge-v1', 'experience-decision-v1', 69, 16384, 32768]);
  const planner = plannerExports;
  const stateConstants = stateExports;
  assert.equal(stateConstants.EXPERIENCE_DECISION_VERSION, 'experience-decision-v1');

  // 同一冻结新 knowledge 的两份/四份副本，只差 experience view 与开关。
  const empty = experienceKnowledge({ experience: kernelView('m2c-independent'), useWorkExperience: true });
  const penalized = experienceKnowledge({ experience: kernelView('m2c-independent', { sampleCount: 1 }), useWorkExperience: true });
  const ignoring = experienceKnowledge({ experience: kernelView('m2c-independent', { sampleCount: 1 }), useWorkExperience: false });
  const before = canonicalJson(empty);
  const p0 = planner.planExperienceMotivationDecision(empty);
  const p1 = planner.planExperienceMotivationDecision(penalized);
  const p2 = planner.planExperienceMotivationDecision(ignoring);
  assert.equal(canonicalJson(empty), before, 'planner 不得修改输入 knowledge');
  // 空经历：Work 710（support 900 / opposition 190），与旧 M2 候选逐字段一致，gate=NEW_MAJOR_DUTY。
  assert.deepEqual(p0.decision.candidates, expectedCandidates());
  assert.deepEqual([p0.decision.choice, p0.decision.gateReason, p0.decision.strainPermille], ['WorkForPay', 'NEW_MAJOR_DUTY', 950]);
  // penalty=100：Work opposition 190→290、score 710→610；UseMedicine 700 与其余候选逐字段不变。
  assert.deepEqual(p1.decision.candidates, expectedCandidates({ penalty: 100 }));
  for (const index of [0, 1, 3, 4]) assert.deepEqual(p1.decision.candidates[index], p0.decision.candidates[index], '第' + index + '候选必须逐字段不变');
  assert.deepEqual([p1.decision.candidates[2].support, p1.decision.candidates[2].opposition, p1.decision.candidates[2].score], [900, 290, 610]);
  assert.equal(p1.decision.choice, 'UseMedicine'); // 700 > 610 → 真实改选 Use
  // useWorkExperience=false：opposition 加 0（Work 仍 710）；真实经历仍记录/发 Observed 由 E2 false 分支在运行时覆盖。
  assert.deepEqual(p2.decision.candidates, expectedCandidates({ penalty: 100, useWorkExperience: false }));
  assert.deepEqual([p2.decision.candidates[2].opposition, p2.decision.candidates[2].score], [190, 710]);
  assert.equal(p2.decision.choice, 'WorkForPay');
  // 新 decision 保留旧 decision 全部键，并使用新版本/新 id 前缀；fingerprint 为完整新 knowledge 的 canonical JSON。
  const oldDecision = planMotivationDecision(oldShapeKnowledge()).decision;
  for (const key of Object.keys(oldDecision)) assert.ok(Object.hasOwn(p0.decision, key), '新 decision 丢失旧键 ' + key);
  assert.equal(p0.decision.version, stateConstants.EXPERIENCE_DECISION_VERSION);
  assert.equal(p0.decision.decisionId, 'experience-day-2-actor-2');
  assert.equal(p0.decision.knowledgeFingerprint, canonicalJson(empty));

  // 承诺保护：urgency 899 不开重大门 → CONTINUE_COMMITTED 只开放原下一步 UseMedicine，Work 即使可评分也不 selectable。
  const committed = experienceKnowledge({ experience: kernelView('m2c-independent', { sampleCount: 1 }), useWorkExperience: true, urgencyPermille: 899 });
  const pc = planner.planExperienceMotivationDecision(committed);
  assert.deepEqual([pc.decision.gateReason, pc.decision.choice], ['CONTINUE_COMMITTED', 'UseMedicine']);
  assert.deepEqual(pc.decision.candidates, expectedCandidates({ penalty: 100, urgency: 899, gateReason: 'CONTINUE_COMMITTED' }));
  assert.equal(pc.decision.candidates[2].score, 519); // 手算 809−(190+100)
  // RESUME_COMMITTED 同样只开放恢复的健康计划步骤；职责已履行后 Work 本身 soft-ineligible。
  const resumed = experienceKnowledge({ experience: kernelView('m2c-independent', { sampleCount: 1 }), useWorkExperience: true,
    dutyStatus: 'fulfilled', planState: { activePlan: null, suspendedPlan: { ...plan(), status: 'suspended' }, nextPlanId: 2, lastReviewedDutyId: null } });
  const pr = planner.planExperienceMotivationDecision(resumed);
  assert.deepEqual([pr.decision.gateReason, pr.decision.choice], ['RESUME_COMMITTED', 'UseMedicine']);
  assert.deepEqual([pr.decision.candidates[2].eligible, pr.decision.candidates[2].score, pr.decision.candidates[2].selectionBlockCode],
    [false, null, 'SOFT_PRECONDITION_FAILED']);
  assert.deepEqual(pr.decision.candidates.filter(c => c.selectable).map(c => c.action), ['UseMedicine']);

  // 损坏 view 不能降级为空经验：身份/推导/形状不符必须拒绝（合同 §3 view 校验）。
  const corruptCases = [
    ['penaltyPermille 与 min(300,100*failureCount) 不符', view => { view.penaltyPermille = 101; }],
    ['actorId 身份不符', view => { view.actorId = 'actor-3'; }],
    ['topic 固定值被改', view => { view.topic = 'other-topic'; }],
    ['view 版本未知', view => { view.version = 'work-experience-view-v0'; }],
    ['evidenceRefs 长度≠样本数', view => { view.sampleCount = 2; view.failureCount = 1; view.evidenceRefs = [23]; }],
    ['failureCount>sampleCount', view => { view.sampleCount = 2; view.failureCount = 3; }],
    ['sampleCount>4', view => { view.sampleCount = 5; }],
  ];
  for (const [label, mutate] of corruptCases) {
    const knowledge = experienceKnowledge({ experience: kernelView('m2c-independent', { sampleCount: 1 }), useWorkExperience: true });
    mutate(knowledge.experience);
    assert.throws(() => planner.planExperienceMotivationDecision(knowledge), e => e.code === 'INVALID_INPUT', label);
  }
});

test('E2 真实拒付闭环：tick288 拒付→唯一 Resolved→紧随唯一 Observed→kernel 样本；tick432 ON 改选 Use 真实成功，false 仍 710 且第三日真实分歧', t => {
  if (!gate(t)) return;
  const runtime = runtimeExports;
  const experienceOf = b => b.snapshot.world.experienceModel.actors.find(a => a.actorId === 'actor-2');
  const assertObserved = (bundle, tick, resolved, commandId, actorId, penalty, refs) => {
    const observed = factsOf(bundle, 'ExperienceWorkObserved', tick).filter(e => e.payload.actorId === actorId);
    assert.equal(observed.length, 1, '每本人 Work Resolved 恰一个 Observed');
    const event = observed[0];
    assert.equal(event.eventSeq, resolved.eventSeq + 1, 'Observed 必须紧随本人 Work Resolved');
    assert.equal(event.sourceSystem, 'experience');
    assert.deepEqual(Object.keys(event.payload).sort(), ['actorId', 'experienceView', 'sourceEventSeq']);
    assert.equal(event.payload.sourceEventSeq, resolved.eventSeq);
    assert.deepEqual(event.causationEventSeqs, [resolved.eventSeq], 'cause 唯一指向该 Resolved seq');
    assert.deepEqual(event.entityIds, [actorId]);
    assert.equal(event.commandId, commandId);
    // view 从新 state 派生，经冻结内核逐字段核对。
    assert.deepEqual(event.payload.experienceView, deriveWorkExperience(experienceOf(bundle).workExperienceState));
    assert.equal(event.payload.experienceView.penaltyPermille, penalty);
    assert.deepEqual(event.payload.experienceView.evidenceRefs, refs);
    return event;
  };

  // ---- ON 分支（useWorkExperience=true）----
  const on = runToAfterSell(experienceRecipe(true));
  assert.equal(on.f.bundle.snapshot.rulesVersion, deps.state.EXPERIENCE_RULES);
  const b0 = on.f.bundle;
  assert.equal(communal(b0), 50);
  assert.equal(b0.snapshot.world.resources.herbs, 30);
  const sold = on.sold;
  assert.equal(sold.outcome, 'succeeded');
  assert.deepEqual([sold.bundle.snapshot.tick, sold.bundle.snapshot.world.playerModel.wallet, sold.bundle.snapshot.world.playerModel.inventory.herbs], [145, 240, 13]);
  assert.equal(communal(sold.bundle), 10);
  const sOn = createSimulationSession(sold.bundle, on.f.systems);
  sOn.advanceTicks(143);
  const b288 = sOn.getBundle();
  // tick288 决策时经验为空 → 候选与旧 M2 完全一致（Work 710），权威拒付。
  const m288 = mindOf(b288);
  assert.deepEqual(m288.lastDecision.candidates, expectedCandidates());
  assert.deepEqual([m288.lastDecision.choice, m288.lastDecision.gateReason], ['WorkForPay', 'NEW_MAJOR_DUTY']);
  assert.equal(m288.lastDecision.decisionId, 'experience-day-2-actor-2');
  const resolved288 = factsOf(b288, 'MotivationDecisionResolved', 288).find(e => e.payload.actorId === 'actor-2');
  assert.deepEqual([resolved288.payload.status, resolved288.payload.code], ['rejected', 'RULE_REJECTED']);
  assert.deepEqual(resolved288.payload.failureOwner, { planId: 2, goalId: null });
  const planned288 = factsOf(b288, 'MotivationDecisionPlanned', 288).find(e => e.payload.actorId === 'actor-2');
  assert.equal(planned288.commandId, null);
  assert.equal(planned288.payload.choice, 'WorkForPay');
  assert.equal(planned288.payload.decisionId, resolved288.payload.commandId);
  assert.equal(resolved288.payload.commandId, 'experience-day-2-actor-2');
  assertObserved(b288, 288, resolved288, 'experience-day-2-actor-2', 'actor-2', 100, [resolved288.eventSeq]);
  // kernel 样本 rejected / penalty100；同日另一 actor 的 proposal 已冻结、不受影响。
  const sample288 = experienceOf(b288).workExperienceState.samples;
  assert.equal(sample288.length, 1);
  assert.deepEqual(
    { actorId: sample288[0].actorId, sourceEventSeq: sample288[0].sourceEventSeq, occurrenceTick: sample288[0].occurrenceTick,
      decisionId: sample288[0].decisionId, commandId: sample288[0].commandId, action: sample288[0].action, status: sample288[0].status, code: sample288[0].code },
    { actorId: 'actor-2', sourceEventSeq: resolved288.eventSeq, occurrenceTick: 288,
      decisionId: 'experience-day-2-actor-2', commandId: 'experience-day-2-actor-2', action: 'WorkForPay', status: 'rejected', code: 'RULE_REJECTED' });
  assert.equal(deriveWorkExperience(experienceOf(b288).workExperienceState).penaltyPermille, 100);
  assert.equal(agentOf(b288, 'actor-2').wallet, 50);
  assert.equal(agentOf(b288, 'actor-2').currentGoal.failures, 0);
  assert.equal(agentOf(b288, 'actor-2').currentGoal.step, 'use');
  assert.equal(m288.lastDuty.status, 'pending');
  const frozenA3 = factsOf(b288, 'MotivationDecisionPlanned', 288).find(e => e.payload.actorId === 'actor-3');

  sOn.advanceTicks(144);
  const b432 = sOn.getBundle();
  // tick432：d02（344 送达）开第二次重大门；Work=900−(190+100)=610 < Use=700 → 真实成功 UseMedicine：health 400→500、私药 1→0、恢复原健康计划。
  const m432 = mindOf(b432);
  assert.deepEqual([m432.lastDecision.candidates[2].score, m432.lastDecision.candidates[0].score], [610, 700]);
  assert.deepEqual([m432.lastDecision.choice, m432.lastDecision.gateReason, m432.lastDecision.planId], ['UseMedicine', 'NEW_MAJOR_DUTY', 1]);
  assert.equal(m432.lastDecision.decisionId, 'experience-day-3-actor-2');
  assert.equal(m432.lastOutcome.status, 'succeeded');
  assert.deepEqual(m432.lastOutcome.delta, { wallet: 0, herbs: -1, health: 100, fatigue: 0 });
  assert.equal(m432.lastOutcome.failureOwner, null);
  assert.equal(bodyOf(b432, 'actor-2').health, 500);
  assert.equal(agentOf(b432, 'actor-2').inventory.herbs, 0);
  // Use 成功不产生 kernel 样本：样本数仍 1；同时 actor-3 的候选不得沾染 actor-2 的经验（proposals 冻结/隔离）。
  assert.equal(experienceOf(b432).workExperienceState.samples.length, 1);
  assert.equal(factsOf(b432, 'MotivationDecisionPlanned', 432).find(e => e.payload.actorId === 'actor-3').payload.candidates[2].eligible, false);
  assert.equal(factsOf(b432, 'MotivationDecisionPlanned', 432).find(e => e.payload.actorId === 'actor-3').payload.candidates[2].score, null);
  // 成功 receipt.result 与 SocietyActionCommitted.payload 完整 canonical 相等（两种不同 DTO 的精确关系）。
  const receiptOn = b432.snapshot.commandReceipts['experience-day-3-actor-2'];
  assert.equal(receiptOn.status, 'succeeded');
  const committedOn = b432.eventLog.find(e => e.type === 'SocietyActionCommitted' && e.commandId === 'experience-day-3-actor-2');
  assert.equal(canonicalJson(receiptOn.result), canonicalJson(committedOn.payload));
  assert.equal(receiptOn.eventSeqs.length, 1);
  assert.equal(receiptOn.eventSeqs[0], committedOn.eventSeq);
  // sealed：三模型 cursor 均等 nextEventSeq−1。
  const w432 = b432.snapshot.world;
  assert.deepEqual([w432.mindModel.cursor, w432.motivationModel.cursor, w432.experienceModel.cursor], [b432.snapshot.nextEventSeq - 1, b432.snapshot.nextEventSeq - 1, b432.snapshot.nextEventSeq - 1]);

  // ---- false 分支（useWorkExperience=false，同 seed）：仍记录/发 Observed，但不消费惩罚 → Work 710 再拒 → 样本累计、第三日真实分歧 ----
  const off = runToAfterSell(experienceRecipe(false));
  const sOff = createSimulationSession(off.sold.bundle, off.f.systems);
  sOff.advanceTicks(143);
  const off288 = sOff.getBundle();
  const offResolved288 = factsOf(off288, 'MotivationDecisionResolved', 288).find(e => e.payload.actorId === 'actor-2');
  assert.deepEqual([offResolved288.payload.status, offResolved288.payload.code], ['rejected', 'RULE_REJECTED']);
  assertObserved(off288, 288, offResolved288, 'experience-day-2-actor-2', 'actor-2', 100, [offResolved288.eventSeq]);
  // tick288 决策前两 world 物理状态一致（事件流因 knowledgeFingerprint 携带开关而不同）。
  for (const id of ['actor-2', 'actor-3']) {
    assert.deepEqual(
      { health: bodyOf(off288, id).health, fatigue: bodyOf(off288, id).fatigue, wallet: agentOf(off288, id).wallet, herbs: agentOf(off288, id).inventory.herbs },
      { health: bodyOf(b288, id).health, fatigue: bodyOf(b288, id).fatigue, wallet: agentOf(b288, id).wallet, herbs: agentOf(b288, id).inventory.herbs });
  }
  assert.equal(communal(off288), communal(b288));
  assert.notEqual(canonicalJson(off288.snapshot), canonicalJson(b288.snapshot));
  // 同日冻结 proposals 对照：actor-3 的 Planned 在两 world 完全一致。
  assert.equal(canonicalJson(frozenA3), canonicalJson(factsOf(off288, 'MotivationDecisionPlanned', 288).find(e => e.payload.actorId === 'actor-3')));
  sOff.advanceTicks(144);
  const off432 = sOff.getBundle();
  // false：Work=710（opposition 190，不加 penalty）→ 再次 RULE_REJECTED；kernel 记第二个样本 penalty=200。
  const mOff432 = mindOf(off432);
  assert.deepEqual([mOff432.lastDecision.candidates[2].score, mOff432.lastDecision.candidates[2].opposition], [710, 190]);
  assert.equal(mOff432.lastDecision.choice, 'WorkForPay');
  assert.deepEqual([mOff432.lastOutcome.status, mOff432.lastOutcome.code], ['rejected', 'RULE_REJECTED']);
  assert.equal(communal(off432), 10);
  const offSamples = experienceOf(off432).workExperienceState.samples;
  assert.equal(offSamples.length, 2);
  assert.deepEqual(offSamples.map(s => [s.occurrenceTick, s.status]), [[288, 'rejected'], [432, 'rejected']]);
  assert.deepEqual(offSamples.map(s => s.decisionId), ['experience-day-2-actor-2', 'experience-day-3-actor-2']);
  assert.notEqual(offSamples[0].sourceEventSeq, offSamples[1].sourceEventSeq);
  assert.equal(deriveWorkExperience(experienceOf(off432).workExperienceState).penaltyPermille, 200);
  const offResolved432 = factsOf(off432, 'MotivationDecisionResolved', 432).find(e => e.payload.actorId === 'actor-2');
  assertObserved(off432, 432, offResolved432, 'experience-day-3-actor-2', 'actor-2', 200, [offSamples[0].sourceEventSeq, offResolved432.eventSeq]);
  // 第三日起两 world 真实分歧：stateHash 不同 + 权威物理字段不同。
  assert.notEqual(canonicalJson(off432.snapshot), canonicalJson(b432.snapshot));
  assert.equal(bodyOf(off432, 'actor-2').health, 400);
  assert.equal(agentOf(off432, 'actor-2').inventory.herbs, 1);
  assert.deepEqual([bodyOf(b432, 'actor-2').health, agentOf(b432, 'actor-2').inventory.herbs], [500, 0]);
});

test('E3 成功窗口：默认新 profile 第二日真实 Work 成功（1 样本/penalty 0），Rest 与他人动作不学习', t => {
  if (!gate(t)) return;
  const { f, session } = experienceVillage(deps.fixture.defaultExperienceVillageConfig());
  session.advanceTicks(288);
  const b288 = session.getBundle();
  const xpOf = (bundle, id) => bundle.snapshot.world.experienceModel.actors.find(a => a.actorId === id);
  const resolved = factsOf(b288, 'MotivationDecisionResolved', 288).find(e => e.payload.actorId === 'actor-2');
  assert.equal(resolved.payload.status, 'succeeded');
  assert.equal(mindOf(b288).lastDecision.choice, 'WorkForPay');
  // 第二日真实 Work 成功：恰 1 样本、succeeded、penalty 0、引用真实 Resolved seq。
  const samples = xpOf(b288, 'actor-2').workExperienceState.samples;
  assert.equal(samples.length, 1);
  assert.deepEqual([samples[0].status, samples[0].code, samples[0].action], ['succeeded', null, 'WorkForPay']);
  assert.deepEqual([samples[0].sourceEventSeq, samples[0].occurrenceTick, samples[0].decisionId, samples[0].commandId],
    [resolved.eventSeq, 288, 'experience-day-2-actor-2', 'experience-day-2-actor-2']);
  assert.deepEqual(deriveWorkExperience(xpOf(b288, 'actor-2').workExperienceState),
    { version: WORK_EXPERIENCE_VIEW_VERSION, simulationId: b288.snapshot.simulationId, actorId: 'actor-2',
      topic: 'work-for-pay-execution', sampleCount: 1, failureCount: 0, penaltyPermille: 0, evidenceRefs: [resolved.eventSeq] });
  assert.equal(factsOf(b288, 'ExperienceWorkObserved', 288).length, 1);
  // 他人（actor-3 第二日非 Work 动作）与本人第三日 Rest 都不学习。
  session.advanceTicks(144);
  const b432 = session.getBundle();
  assert.deepEqual([mindOf(b432).lastDecision.choice, mindOf(b432).lastDecision.gateReason], ['Rest', 'URGENT_FATIGUE']);
  assert.equal(xpOf(b432, 'actor-2').workExperienceState.samples.length, 1);
  assert.equal(xpOf(b432, 'actor-3').workExperienceState.samples.length, 0);
  session.advanceTicks(144);
  const b576 = session.getBundle();
  assert.equal(xpOf(b576, 'actor-2').workExperienceState.samples.length, 1);
  assert.equal(xpOf(b576, 'actor-3').workExperienceState.samples.length, 0);
  assert.equal(b576.eventLog.filter(e => e.type === 'ExperienceWorkObserved').length, 1);
});

test('E3 富裕十日：真实成功≥5、Rest 不产生样本、四窗 seq 严格升序且逐一等于真实本人 Work Resolved', t => {
  if (!gate(t)) return;
  // M3-2A 合同 E3 富裕 10 日 recipe：actor-2 dutyWeight=1000/risk=0、gold=20000、10 条请求。
  const config = deps.fixture.defaultExperienceVillageConfig();
  config.motivation.profiles = [{ actorId: 'actor-2', dutyWeightPermille: 1000, riskAversionPermille: 0 },
    { actorId: 'actor-3', dutyWeightPermille: 900, riskAversionPermille: 200 }];
  config.memory.society.actors.market.ecology.resources.resources.gold.initial = 20000;
  config.motivation.requests = Array.from({ length: 10 }, (_, i) =>
    ({ requestId: 'd' + (i + 1), tick: 56 + i * 144, speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000, expiresTick: (i + 2) * 144 }));
  const { session } = experienceVillage(config);
  session.advanceTicks(1440);
  const bundle = session.getBundle();
  const log = bundle.eventLog;
  const planned = log.filter(e => e.type === 'MotivationDecisionPlanned' && e.payload.actorId === 'actor-2');
  const resolvedByCause = new Map(log.filter(e => e.type === 'MotivationDecisionResolved').map(e => [e.causationEventSeqs[0], e]));
  const workResolved = planned.filter(e => e.payload.choice === 'WorkForPay').map(e => resolvedByCause.get(e.eventSeq));
  const restResolved = planned.filter(e => e.payload.choice === 'Rest').map(e => resolvedByCause.get(e.eventSeq));
  // 不硬编码哪些日成功：只断言真实成功≥5 且每次成功都有 receipt/committed。
  const successes = workResolved.filter(e => e.payload.status === 'succeeded');
  assert.ok(successes.length >= 5, '真实成功次数 ' + successes.length + ' < 5');
  for (const event of successes) {
    const receipt = bundle.snapshot.commandReceipts[event.payload.commandId];
    assert.equal(receipt.status, 'succeeded');
    const committed = log.find(e => e.type === 'SocietyActionCommitted' && e.commandId === event.payload.commandId);
    assert.equal(canonicalJson(receipt.result), canonicalJson(committed.payload));
  }
  // Rest 结果不产生样本：kernel 四窗内不含任何 Rest Resolved 的 seq。
  const samples = bundle.snapshot.world.experienceModel.actors.find(a => a.actorId === 'actor-2').workExperienceState.samples;
  for (const event of restResolved) assert.ok(!samples.some(s => s.sourceEventSeq === event.eventSeq), 'Rest 结果不得进入样本窗');
  // 四窗恰好是最近的真实本人 Work Resolved：seq 严格升序、逐一等于日志事件、decisionId/commandId/tick 对应。
  assert.ok(workResolved.length >= 4);
  assert.deepEqual(samples.map(s => s.sourceEventSeq), workResolved.slice(-4).map(e => e.eventSeq));
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i].sourceEventSeq > samples[i - 1].sourceEventSeq);
  for (const sample of samples) {
    const resolved = log.find(e => e.eventSeq === sample.sourceEventSeq);
    const plannedEvent = log.find(e => e.type === 'MotivationDecisionPlanned' && e.payload.actorId === 'actor-2' && e.payload.decisionId === sample.decisionId);
    assert.ok(resolved && resolved.type === 'MotivationDecisionResolved' && resolved.payload.actorId === 'actor-2');
    assert.ok(plannedEvent && plannedEvent.payload.choice === 'WorkForPay');
    assert.equal(resolved.commandId, sample.commandId);
    assert.deepEqual(resolved.causationEventSeqs, [plannedEvent.eventSeq]);
    assert.equal(sample.occurrenceTick, resolved.tick);
    assert.ok(['succeeded', 'rejected'].includes(sample.status));
  }
  // 同一权威 command 恰一个 Observed，且全部指向本人 Work Resolved（1:1）。
  const observed = log.filter(e => e.type === 'ExperienceWorkObserved');
  assert.equal(observed.length, workResolved.length);
  assert.deepEqual(observed.map(e => e.payload.sourceEventSeq), workResolved.map(e => e.eventSeq));
  assert.deepEqual(new Set(observed.map(e => e.causationEventSeqs[0])).size, observed.length);
});

test('E4 因果与身份：他人/非 Work/NoAction 不学习，坏 planned/resolved/receipt 报 INVALID_INPUT 而非 null', t => {
  if (!gate(t)) return;
  const adapter = deps.adapter;
  const contextOf = bundle => ({ simulationId: bundle.snapshot.simulationId, rulesVersion: deps.state.EXPERIENCE_RULES,
    eventLog: bundle.eventLog, commandReceipts: bundle.snapshot.commandReceipts });
  const resolvedOf = (bundle, tick, actorId, choice) => {
    const planned = factsOf(bundle, 'MotivationDecisionPlanned', tick).find(e => e.payload.actorId === actorId && e.payload.choice === choice);
    return factsOf(bundle, 'MotivationDecisionResolved', tick).find(e => e.payload.actorId === actorId && e.causationEventSeqs[0] === planned.eventSeq);
  };
  // W1：配方 ON 世界至 288（本人 Work 真实拒付）。
  const w1 = runToAfterSell(experienceRecipe(true));
  const s1 = createSimulationSession(w1.sold.bundle, w1.f.systems);
  s1.advanceTicks(143);
  const recipe288 = s1.getBundle();
  const ownWork = resolvedOf(recipe288, 288, 'actor-2', 'WorkForPay');
  // W2：默认新 profile 至 432（288 本人 Work 成功、432 Rest）。
  const { session: s2 } = experienceVillage(deps.fixture.defaultExperienceVillageConfig());
  s2.advanceTicks(432);
  const default432 = s2.getBundle();
  const ownSuccess = resolvedOf(default432, 288, 'actor-2', 'WorkForPay');
  const ownRest = resolvedOf(default432, 432, 'actor-2', 'Rest');
  // W3：期限配方新 profile 至 288（本人 NoAction）。
  const deadlineConfig = deps.fixture.defaultExperienceVillageConfig();
  deadlineConfig.memory.society.actors.initialActors.slice(1, 3).forEach(a => { a.fatigue = 200; });
  deadlineConfig.memory.society.estates.forEach(e => { e.initialFood = 32; e.initialHerbs = 0; });
  deadlineConfig.memory.society.player.initialHerbs = 0;
  const herbs = deadlineConfig.memory.society.actors.market.ecology.resources.resources.herbs;
  herbs.initial = 0; herbs.production.numerator = 0;
  deadlineConfig.memory.society.actors.market.products.herbs.maxOrder = 0;
  deadlineConfig.mind.stimuli = [{ stimulusId: 'deadline-statement', tick: 12, kind: 'statement', speakerId: 'actor-1', listenerId: 'actor-2', available: true }];
  deadlineConfig.motivation.requests = [];
  const { session: s3 } = experienceVillage(deadlineConfig);
  s3.advanceTicks(288);
  const deadline288 = s3.getBundle();
  const ownNoAction = resolvedOf(deadline288, 288, 'actor-2', 'NoAction');

  // 合法非本人/非 Work/NoAction → 返回 null；本人 Work（成功或拒绝）→ 非 null 投影。
  assert.equal(adapter.projectOwnWorkOutcome(contextOf(recipe288), 'actor-3', resolvedOf(recipe288, 288, 'actor-3', 'UseMedicine').eventSeq), null);
  assert.equal(adapter.projectOwnWorkOutcome(contextOf(default432), 'actor-2', ownRest.eventSeq), null);
  assert.equal(adapter.projectOwnWorkOutcome(contextOf(deadline288), 'actor-2', ownNoAction.eventSeq), null);
  assert.notEqual(adapter.projectOwnWorkOutcome(contextOf(recipe288), 'actor-2', ownWork.eventSeq), null);
  assert.notEqual(adapter.projectOwnWorkOutcome(contextOf(default432), 'actor-2', ownSuccess.eventSeq), null);

  // 坏链接必须抛 INVALID_INPUT 而不是静默 null（合同 §4）。
  const bad = (bundle, actorId, seq, mutate) => {
    const context = contextOf(bundle);
    mutate(context);
    assert.throws(() => adapter.projectOwnWorkOutcome(context, actorId, seq), e => e.code === 'INVALID_INPUT');
  };
  const plannedOf = (context, seq) => {
    const resolved = context.eventLog.find(e => e.eventSeq === seq);
    return context.eventLog.find(e => e.eventSeq === resolved.causationEventSeqs[0] && e.type === 'MotivationDecisionPlanned');
  };
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { c.eventLog.find(e => e.eventSeq === ownWork.eventSeq).causationEventSeqs = []; }); // 缺 causation
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { c.eventLog.find(e => e.eventSeq === ownWork.eventSeq).causationEventSeqs = [plannedOf(c, ownWork.eventSeq).eventSeq, plannedOf(c, ownWork.eventSeq).eventSeq + 1000]; }); // 双 causation
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { plannedOf(c, ownWork.eventSeq).commandId = 'forged-command'; }); // Planned commandId 非 null
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { plannedOf(c, ownWork.eventSeq).payload.decisionId = 'experience-day-2-actor-3'; }); // decisionId 不匹配
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { plannedOf(c, ownWork.eventSeq).payload.tick = 144; }); // Planned tick 与 Resolved 不匹配
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { c.eventLog.splice(c.eventLog.indexOf(plannedOf(c, ownWork.eventSeq)), 1); }); // Planned 缺失
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { c.eventLog.find(e => e.eventSeq === ownWork.eventSeq).entityIds = ['actor-3']; }); // entity/actor 不符
  bad(recipe288, 'actor-2', ownWork.eventSeq, c => { c.commandReceipts[ownWork.payload.commandId].status = 'succeeded'; }); // receipt 与 Resolved status 冲突
  bad(default432, 'actor-2', ownSuccess.eventSeq, c => { c.commandReceipts[ownSuccess.payload.commandId].result.foodProduced = 999; }); // receipt result 与 committed payload 不再 canonical 相等
  bad(default432, 'actor-2', ownSuccess.eventSeq, c => {
    const receipt = c.commandReceipts[ownSuccess.payload.commandId];
    receipt.eventSeqs = [c.eventLog.find(e => e.type === 'SocietyActionCommitted' && e.commandId !== ownSuccess.payload.commandId).eventSeq]; // 伪造/错引 SocietyActionCommitted
  });
  bad(default432, 'actor-2', ownSuccess.eventSeq, c => { c.commandReceipts[ownSuccess.payload.commandId].input.payload.actorId = 'actor-3'; }); // receipt 输入身份不符
});

test('E4 跨日同请求学习、历史不可变、sealed cursor 与死亡隔离', t => {
  if (!gate(t)) return;
  // 同 request 跨日学习：d01 tick200 expiresTick488 的单请求配方 + 开关 false，让 288 与 432 两次 Work 都真实被拒。
  const { f, session } = experienceVillage(experienceRecipe(false, { secondRequest: false, d01ExpiresTick: 488 }));
  session.advanceTicks(144);
  const sold = runtimeExports.executeExperiencePlayerIntent(session.getBundle(),
    { commandId: 'b2b-crossday-sell', type: 'PlayerSell', payload: { product: 'herbs', quantity: 7 } });
  const s = createSimulationSession(sold.bundle, f.systems);
  s.advanceTicks(287);
  const b288 = s.getBundle();
  const xpOf = (b, id = 'actor-2') => b.snapshot.world.experienceModel.actors.find(a => a.actorId === id);
  const resolved288 = factsOf(b288, 'MotivationDecisionResolved', 288).find(e => e.payload.actorId === 'actor-2');
  assert.deepEqual([resolved288.payload.status, resolved288.payload.commandId], ['rejected', 'experience-day-2-actor-2']);
  const before288 = canonicalJson({ log: b288.eventLog, samples: xpOf(b288).workExperienceState.samples });
  s.advanceTicks(144);
  const b432 = s.getBundle();
  const resolved432 = factsOf(b432, 'MotivationDecisionResolved', 432).find(e => e.payload.actorId === 'actor-2');
  assert.deepEqual([resolved432.payload.status, resolved432.payload.commandId], ['rejected', 'experience-day-3-actor-2']);
  // 每个合法本人 Work 结果都学习一次（去重按真实 resolvedEventSeq/权威 command，不按 requestId）。
  const samples = xpOf(b432).workExperienceState.samples;
  assert.deepEqual(samples.map(s => [s.decisionId, s.commandId, s.occurrenceTick]),
    [['experience-day-2-actor-2', 'experience-day-2-actor-2', 288], ['experience-day-3-actor-2', 'experience-day-3-actor-2', 432]]);
  assert.deepEqual([samples[0].sourceEventSeq, samples[1].sourceEventSeq], [resolved288.eventSeq, resolved432.eventSeq]);
  assert.notEqual(samples[0].sourceEventSeq, samples[1].sourceEventSeq);
  assert.equal(deriveWorkExperience(xpOf(b432).workExperienceState).penaltyPermille, 200);
  // Observed 与 Resolved 一对一，cause 各不相同。
  const observed = b432.eventLog.filter(e => e.type === 'ExperienceWorkObserved');
  assert.deepEqual(observed.map(e => e.payload.sourceEventSeq), [resolved288.eventSeq, resolved432.eventSeq]);
  assert.deepEqual(observed.map(e => e.causationEventSeqs[0]), [resolved288.eventSeq, resolved432.eventSeq]);
  // 历史 decision/view 不可变：288 时点的事件前缀与样本在 432 仍逐字节相同。
  const prefixLength = JSON.parse(before288).log.length;
  assert.equal(canonicalJson({ log: b432.eventLog.slice(0, prefixLength), samples: [samples[0]] }), before288);

  // sealed：三模型 cursor 均等 nextEventSeq−1；A 的 world 校验器接受该终态。
  const world = b432.snapshot.world;
  assert.deepEqual([world.mindModel.cursor, world.motivationModel.cursor, world.experienceModel.cursor],
    [b432.snapshot.nextEventSeq - 1, b432.snapshot.nextEventSeq - 1, b432.snapshot.nextEventSeq - 1]);
  runtimeExports.validateExperienceWorld(world, true);

  // 死亡人物：沿用旧 M2 cleanup，不复活、不再学习，本人 experience state 保留。
  const deathConfig = deps.fixture.defaultExperienceVillageConfig();
  Object.assign(deathConfig.memory.society.actors.initialActors[1], { health: 1, hunger: 1000 });
  Object.assign(deathConfig.memory.society.estates[1], { initialFood: 0, initialHerbs: 0, initialWallet: 100 });
  const { session: deadSession } = experienceVillage(deathConfig);
  deadSession.advanceTicks(576);
  const dead = deadSession.getBundle();
  assert.equal(bodyOf(dead, 'actor-2').alive, false);
  assert.equal(factsOf(dead, 'MotivationRequestResolved', 200).find(e => e.payload.requestId === 'd01').payload.status, 'unavailable');
  assert.equal(dead.eventLog.filter(e => e.type === 'MotivationDecisionPlanned' && e.tick > 144 && e.payload.actorId === 'actor-2').length, 0);
  assert.equal(dead.eventLog.filter(e => e.type === 'ExperienceWorkObserved' && e.payload.actorId === 'actor-2').length, 0);
  const deadXp = dead.snapshot.world.experienceModel.actors.find(a => a.actorId === 'actor-2');
  assert.ok(deadXp, '死亡人物本人 experience 条目必须保留');
  assert.deepEqual(deadXp.workExperienceState.samples, []);
});

test('descriptor 预检：白名单新规则入口必须在 cloneData/canonicalJson 之前拒绝 getter，且 getter 不执行', t => {
  if (!gate(t)) return;
  const runtime = runtimeExports;
  const stateConstants = stateExports;
  const probe = (call) => {
    let calls = 0;
    const handle = { get calls() { return calls; } };
    let threw = null;
    try { call(() => { calls++; return 1; }); } catch (error) { threw = error; }
    assert.ok(threw, 'getter 输入必须被拒绝');
    assert.equal(calls, 0, 'descriptor 预检必须先于任何值读取：getter 被执行了 ' + calls + ' 次');
    return threw;
  };
  const withGetter = (object, key) => (get) => Object.defineProperty(object, key, { enumerable: true, configurable: true, get });
  // validateExperienceConfig：experience 配置是合同钉死的精确两键 DTO。
  probe(get => { const config = { version: 'experience-config-v1', useWorkExperience: true }; withGetter(config, 'useWorkExperience')(get); deps.state.validateExperienceConfig(config); });
  // createExperienceModel。
  probe(get => { const config = { version: 'experience-config-v1', useWorkExperience: true }; withGetter(config, 'useWorkExperience')(get); deps.state.createExperienceModel('getter-probe', config); });
  // validateExperienceModel：先用 A 公共入口造合法 model，再植入 getter。
  probe(get => { const model = deps.state.createExperienceModel('getter-probe', { version: 'experience-config-v1', useWorkExperience: true }); withGetter(model, 'cursor')(get); deps.state.validateExperienceModel(model); });
  // motivation-state 两个新导出。
  const motivationConfig = { version: 'motivation-config-v1', profiles: [{ actorId: 'actor-2', dutyWeightPermille: 900, riskAversionPermille: 200 }, { actorId: 'actor-3', dutyWeightPermille: 900, riskAversionPermille: 200 }], requests: [] };
  probe(get => { const model = { ...JSON.parse(canonicalJson({ version: 'experience-motivation-state-v1', config: motivationConfig, configFingerprint: canonicalJson(motivationConfig), requestCursor: 0, cursor: 0, actors: [] })) }; withGetter(model, 'cursor')(get); stateConstants.validateExperienceMotivationModel(model); });
  probe(get => { const decision = planMotivationDecision(oldShapeKnowledge()).decision; decision.version = 'experience-decision-v1'; decision.decisionId = 'experience-day-2-actor-2'; withGetter(decision, 'goalId')(get); stateConstants.validateExperienceMotivationDecision(decision); });
  // planExperienceMotivationDecision。
  probe(get => { const knowledge = experienceKnowledge({ experience: kernelView('m2c-independent'), useWorkExperience: true }); withGetter(knowledge, 'tick')(get); plannerExports.planExperienceMotivationDecision(knowledge); });
  // projectOwnWorkOutcome（adapter）。
  probe(get => { const context = { simulationId: 'getter-probe', rulesVersion: deps.state.EXPERIENCE_RULES, eventLog: [], commandReceipts: {} }; withGetter(context, 'simulationId')(get); deps.adapter.projectOwnWorkOutcome(context, 'actor-2', 1); });
  // validateExperienceWorld / executeExperiencePlayerIntent（motivation-runtime 新导出）。
  probe(get => { const world = { memoryModel: {}, mindModel: {}, motivationModel: {}, experienceModel: {} }; withGetter(world, 'experienceModel')(get); runtime.validateExperienceWorld(world, true); });
  probe(get => { const bundle = { snapshot: { rulesVersion: deps.state.EXPERIENCE_RULES }, eventLog: [] }; withGetter(bundle.snapshot, 'rulesVersion')(get); runtime.executeExperiencePlayerIntent(bundle, { commandId: 'probe-intent', type: 'PlayerRest', payload: {} }); });
  // 既有 public 入口的新规则 raw bundle：validateBundle / createSimulationSession。
  const systems = deps.fixture.experienceSystems();
  probe(get => { const bundle = { snapshot: { rulesVersion: deps.state.EXPERIENCE_RULES }, eventLog: [] }; withGetter(bundle.snapshot, 'rulesVersion')(get); validateBundle(bundle, { rulesVersion: deps.state.EXPERIENCE_RULES, systems }); });
  probe(get => { const bundle = { snapshot: { rulesVersion: deps.state.EXPERIENCE_RULES }, eventLog: [] }; withGetter(bundle.snapshot, 'rulesVersion')(get); createSimulationSession(bundle, systems); });
  // 继承数组的 map 等方法仍应存在，但用户在数组上种植的同名 getter 不得触发（含数组字段的 DTO）。
  probe(get => {
    const shadowed = [{ sourceEventSeq: 12, occurrenceTick: 144, observedTick: 144, channel: 'daily-public', sourceActorId: null, available: true, confidencePermille: 900, expiresTick: 432 }];
    Object.defineProperty(shadowed, 'map', { enumerable: true, configurable: true, get });
    const knowledge = experienceKnowledge({ experience: kernelView('m2c-independent'), useWorkExperience: true });
    knowledge.observations = shadowed;
    plannerExports.planExperienceMotivationDecision(knowledge);
  });
  assert.equal([1, 2].map(x => x * 2).join(','), '2,4', '普通数组的继承方法不受影响');
});

test('rollback：post-learning 预算错误必须整 tick 回滚（公共 session systems 注入）', t => {
  if (!gate(t)) return;
  // 黑盒可构造：通过公共 createSimulationSession 注入一个在 tick288（学习已完成后的 society 日结）抛预算错误的系统。
  // 说明：更深的 post-learning 内部故障点（如 observeWorkOutcome 与 Observed 发射之间）无法在不窥探 A 内部的情况下黑盒注入，
  // 该范围交中控裁定，不伪造覆盖。
  const { f, session } = experienceVillage(experienceRecipe(true));
  session.advanceTicks(287);
  const before = session.getBundle();
  const original = f.systems;
  const wrapped = Object.fromEntries(Object.entries(original).map(([id, handler]) => [id, (ctx) => {
    if (ctx.snapshot.tick === 288) throw fault('LIMIT_EXCEEDED', 'injected post-learning budget overflow');
    return handler(ctx);
  }]));
  const broken = createSimulationSession(before, wrapped);
  assert.throws(() => broken.advanceTicks(1), e => e.code === 'LIMIT_EXCEEDED' && e.failedTick === 288);
  // 整 tick 回滚：不得部分写入经验、receipt、事件、RNG 或物理状态。
  assert.deepEqual(broken.getBundle(), before);
  // 同一 before 用原系统可正常推进，证明注入是失败原因且 before 未被污染。
  const healthy = createSimulationSession(before, original);
  healthy.advanceTicks(1);
  assert.equal(healthy.getBundle().snapshot.tick, 288);
});

// 供 E1/getter 预检使用的旧版（M2 形状）decision-phase knowledge：剥除新键后换回旧版本字符串。
function oldShapeKnowledge() {
  const { experience, useWorkExperience, ...legacy } = experienceKnowledge({ experience: kernelView('m2c-independent'), useWorkExperience: true });
  return { ...legacy, knowledgeVersion: 'motivation-knowledge-v1' };
}
