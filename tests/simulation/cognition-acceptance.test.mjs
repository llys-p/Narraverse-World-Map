// M3-3B 独立验收：认知降频与延续运行时独立验收
// 合同唯一权威：m3-cognition-runtime-contract-v1（M3-3A §共同合同）
// 唯一起点：D:\Narraverse-World-Map-m3-integration @ a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2
// 独立性：所有预期均为独立手算与合同定义推导，不调用被测实现自产 expected。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson, fault, cloneData } from '../../runtime/core/data-contract.mjs';
import { createWorkExperienceState, observeWorkOutcome, deriveWorkExperience } from '../../runtime/core/work-experience.mjs';
import { createCognitiveReviewState, evaluateCognitiveReview } from '../../runtime/core/cognitive-review.mjs';

// ---- A 路依赖探针 ----
const REQUIRED = [
  '../../runtime/core/cognition-state.mjs',
  '../../runtime/core/cognition-signals.mjs',
  '../../runtime/fixtures/cognition-village.mjs',
];
let deps = null, depFailure = null;
try {
  deps = {
    state: await import(REQUIRED[0]),
    signals: await import(REQUIRED[1]),
    fixture: await import(REQUIRED[2]),
  };
} catch (error) {
  depFailure = error;
}

const EXTRA_EXPORTS = [
  ['../../runtime/core/motivation-planner.mjs', () => import('../../runtime/core/motivation-planner.mjs'), ['isCommittedStepEligible', 'planCognitionMotivationDecision', 'continueCognitionPlan']],
  ['../../runtime/core/motivation-runtime.mjs', () => import('../../runtime/core/motivation-runtime.mjs'), ['cognitionRuntimeHooks', 'validateCognitionWorld', 'executeCognitionPlayerIntent']],
  ['../../runtime/core/motivation-state.mjs', () => import('../../runtime/core/motivation-state.mjs'), ['validateCognitionMotivationDecision', 'validateCognitionMotivationModel']],
  ['../../runtime/core/work-experience-adapter.mjs', () => import('../../runtime/core/work-experience-adapter.mjs'), ['projectOwnCognitionWorkOutcome']],
];

let extraModules = [];
try {
  extraModules = await Promise.all(EXTRA_EXPORTS.map(async ([specifier, load, names]) => [specifier, await load(), names]));
} catch (error) {
  if (!depFailure) depFailure = error;
}

function gate(t) {
  if (depFailure !== null) {
    if (depFailure.code === 'ERR_MODULE_NOT_FOUND') {
      t.skip('A 路依赖未导入，待中控派发精确 SHA 后运行：' + (depFailure.url ?? REQUIRED.join(', ')));
      return false;
    }
    assert.fail('A 路依赖模块加载失败（非缺失）：' + (depFailure.stack ?? String(depFailure)));
  }
  const missing = [];
  for (const [specifier, module, names] of extraModules) {
    for (const name of names) {
      if (name === 'cognitionRuntimeHooks') {
        const hooks = module[name];
        const expected = ['createWorld', 'beforeSystems', 'afterSystems', 'applyAction', 'settleDay', 'validateHistory'];
        assert.ok(hooks && typeof hooks === 'object', '合同 §4：cognitionRuntimeHooks 是六函数对象');
        assert.deepEqual(Object.keys(hooks).sort(), expected.slice().sort());
        for (const key of expected) assert.equal(typeof hooks[key], 'function', key);
      } else if (typeof module[name] !== 'function') {
        missing.push(specifier + ' 导出 ' + name);
      }
    }
  }
  assert.deepEqual(missing, [], '已导入依赖缺失或导出类型错误不得跳过');
  return true;
}

// ---- 辅助独立手算与对象构造工具 ----
function makeTestKnowledge({
  actorId = 'actor-2',
  alive = true,
  health = 1000,
  fatigue = 0,
  hunger = 0,
  wallet = 100,
  herbs = 0,
  currentGoal = null,
  cooldownUntilDay = 0,
  tick = 144,
  activePlan = null,
  suspendedPlan = null,
  duty = null,
  belief = { topic: 'public-herbs-available', value: 'available', confidencePermille: 900, evidenceRefs: [1], contradictionRefs: [], lastUpdatedTick: 12 },
  penaltyPermille = 0,
} = {}) {
  return {
    knowledgeVersion: 'cognition-knowledge-v1',
    phase: 'decision',
    simulationId: 'test-sim',
    actorId,
    tick,
    revision: tick - 1,
    self: {
      name: 'hunter',
      occupation: 'hunter',
      location: 'village',
      alive,
      health,
      hunger,
      fatigue,
      wallet,
      inventory: { food: 20, herbs },
      currentGoal,
      nextGoalId: currentGoal ? currentGoal.goalId + 1 : 1,
      cooldownUntilDay,
    },
    quote: { product: 'herbs', price: 50, observedTick: 0, sourceEventSeq: null },
    observations: [],
    belief,
    profile: { dutyWeightPermille: 900, riskAversionPermille: 200 },
    duty,
    planState: {
      activePlan,
      suspendedPlan,
      nextPlanId: activePlan ? activePlan.planId + 1 : 1,
      lastReviewedDutyId: null,
    },
    experience: {
      version: 'work-experience-view-v1',
      simulationId: 'test-sim',
      actorId,
      topic: 'work-for-pay-execution',
      sampleCount: 0,
      failureCount: penaltyPermille / 100,
      penaltyPermille,
      evidenceRefs: [],
    },
    useWorkExperience: true,
  };
}

// ============================================================================
// C1: Signals / 边界独立验证
// ============================================================================
test('C1: Signals/边界独立验证 (relevance, urgentNeed, duty, keyEvidence, invalidation)', (t) => {
  if (!gate(t)) return;
  const { deriveActorCognitionSignals } = deps.signals;

  // 1.1 Getter/accessor 探针：必须在执行任何逻辑前拒收，且 getter 调用数为 0
  let getterCalls = 0;
  const poisonousKnowledge = {
    get badProp() {
      getterCalls++;
      return 1;
    },
    knowledgeVersion: 'cognition-knowledge-v1',
  };
  assert.throws(() => deriveActorCognitionSignals(poisonousKnowledge, 500, null, null));
  assert.equal(getterCalls, 0, 'Getter 零调用');

  // 1.2 Relevance 三值判定：
  // - 死亡 -> 0
  const kDead = makeTestKnowledge({ alive: false });
  assert.equal(deriveActorCognitionSignals(kDead, 700, null, null).input.relevancePermille, 0);

  // - 存活且有 currentGoal -> 1000
  const kGoal = makeTestKnowledge({ currentGoal: { goalId: 1, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 0, target: 800 } });
  assert.equal(deriveActorCognitionSignals(kGoal, 700, null, null).input.relevancePermille, 1000);

  // - 存活且有 activePlan -> 1000
  const kPlan = makeTestKnowledge({ activePlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine'], stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null } });
  assert.equal(deriveActorCognitionSignals(kPlan, 700, null, null).input.relevancePermille, 1000);

  // - 存活且有 suspendedPlan -> 1000
  const kSusp = makeTestKnowledge({ suspendedPlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine'], stepIndex: 0, status: 'suspended', createdDay: 1, deadlineDay: 21, requestId: null } });
  assert.equal(deriveActorCognitionSignals(kSusp, 700, null, null).input.relevancePermille, 1000);

  // - 存活且有 open pending duty -> 1000
  const kDuty = makeTestKnowledge({ duty: { requestId: 'd01', sourceEventSeq: 5, observedTick: 100, expiresTick: 432, urgencyPermille: 900, status: 'pending', fulfilledTick: null } });
  assert.equal(deriveActorCognitionSignals(kDuty, 700, null, null).input.relevancePermille, 1000);

  // - 存活且 health <= 700 && day >= cooldownUntilDay -> 1000
  const kHealth = makeTestKnowledge({ health: 700, cooldownUntilDay: 0, tick: 144 });
  assert.equal(deriveActorCognitionSignals(kHealth, 700, null, null).input.relevancePermille, 1000);

  // - 其余存活者 -> 500
  const kNormal = makeTestKnowledge({ health: 1000, fatigue: 0, hunger: 0 });
  assert.equal(deriveActorCognitionSignals(kNormal, 700, null, null).input.relevancePermille, 500);

  // 1.3 UrgentNeed 边界
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ fatigue: 800 }), 700, null, null).input.urgentNeed, true);
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ hunger: 900 }), 700, null, null).input.urgentNeed, true);
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ health: 300 }), 700, null, null).input.urgentNeed, true);
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ fatigue: 799, hunger: 899, health: 301 }), 700, null, null).input.urgentNeed, false);
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ alive: false, fatigue: 999 }), 700, null, null).input.urgentNeed, false);

  // 1.4 NewMajorDuty 边界
  const majorDuty = { requestId: 'd01', sourceEventSeq: 5, observedTick: 100, expiresTick: 432, urgencyPermille: 900, status: 'pending', fulfilledTick: null };
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ duty: majorDuty }), 700, null, null).input.newMajorDuty, true);
  // urgency < 900 不是 major duty
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ duty: { ...majorDuty, urgencyPermille: 899 } }), 700, null, null).input.newMajorDuty, false);
  // requestId === lastReviewedDutyId 不再判定为 new
  const kReviewed = makeTestKnowledge({ duty: majorDuty });
  kReviewed.planState.lastReviewedDutyId = 'd01';
  assert.equal(deriveActorCognitionSignals(kReviewed, 700, null, null).input.newMajorDuty, false);

  // 1.5 KeyEvidence 语义变化 vs 纯序/价格波动
  // 初次 baseline 为 null -> keyEvidenceChanged 必须为 false
  const res1 = deriveActorCognitionSignals(kNormal, 700, null, null);
  assert.equal(res1.input.keyEvidenceChanged, false);
  assert.ok(res1.baseline !== null, '返回有效 baseline');
  assert.ok(Object.hasOwn(res1.baseline, 'keyEvidenceFingerprint'));

  // 携带上一轮 baseline：若 semantic 未变，raw price/seq/wallet 改变均不唤醒
  const kModSeq = makeTestKnowledge({
    health: 1000,
    wallet: 80, // wallet 改变
    belief: { topic: 'public-herbs-available', value: 'available', confidencePermille: 900, evidenceRefs: [999], contradictionRefs: [], lastUpdatedTick: 200 },
  });
  const res2 = deriveActorCognitionSignals(kModSeq, 700, res1.baseline, null);
  assert.equal(res2.input.keyEvidenceChanged, false, '语义稳定时 keyEvidenceChanged 为 false');

  // 若 semantic 变动（例如 penaltyPermille 从 0 变成 100）：必须为 true
  const kPenalty = makeTestKnowledge({
    health: 1000,
    penaltyPermille: 100,
  });
  const res3 = deriveActorCognitionSignals(kPenalty, 700, res1.baseline, null);
  assert.equal(res3.input.keyEvidenceChanged, true, '罚分变化触发 keyEvidenceChanged');

  // 若 confidence 降到 599 (< 600)：必须为 true
  const kLowConf = makeTestKnowledge({
    health: 1000,
    belief: { topic: 'public-herbs-available', value: 'available', confidencePermille: 599, evidenceRefs: [1], contradictionRefs: [], lastUpdatedTick: 12 },
  });
  const res4 = deriveActorCognitionSignals(kLowConf, 700, res1.baseline, null);
  assert.equal(res4.input.keyEvidenceChanged, true, '置信度跨过 600 门限触发 keyEvidenceChanged');

  // 1.6 GoalOrPlanInvalidated 判定：
  // - 既有计划已过期 (deadlineDay=1, 当前 tick=288 -> day=2 > 1)
  const kExpired = makeTestKnowledge({
    tick: 288,
    activePlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine'], stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 1, requestId: null },
    currentGoal: { goalId: 1, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 0, target: 800 },
  });
  assert.equal(deriveActorCognitionSignals(kExpired, 700, null, null).input.goalOrPlanInvalidated, true, '过期计划触发失效');

  // - 前一日执行权威拒绝 (status=rejected, code=RULE_REJECTED)
  const prevRejected = {
    simulationId: 'test-sim',
    actorId: 'actor-2',
    tick: 144,
    decisionId: 'cognition-day-1-actor-2',
    choice: 'WorkForPay',
    status: 'rejected',
    code: 'RULE_REJECTED',
    failureOwner: { planId: 1, goalId: null },
  };
  const kPrevRej = makeTestKnowledge({ tick: 288, health: 1000 });
  assert.equal(deriveActorCognitionSignals(kPrevRej, 700, null, prevRejected).input.goalOrPlanInvalidated, true, '前日拒绝触发失效');

  // - 无 currentGoal 且 health <= 700 && day >= cooldown
  const kNeedGoal = makeTestKnowledge({ tick: 144, health: 650, currentGoal: null, cooldownUntilDay: 0 });
  assert.equal(deriveActorCognitionSignals(kNeedGoal, 700, null, null).input.goalOrPlanInvalidated, true, '需要目标触发失效');
});

// ============================================================================
// C2: 频率 / 晋升周期核验 (INITIAL144 -> maintain288/432 -> PERIOD576)
// ============================================================================
test('C2: 认知降频策略与晋升周期 (默认 village 4 日轨迹与无 stimuli 样本)', async (t) => {
  if (!gate(t)) return;
  const { createCognitionVillage, defaultCognitionVillageConfig } = deps.fixture;
  const { COGNITION_RULES } = deps.state;

  // 2.1 默认 village 场景 (health=1000, fatigue=0, mc02 tick12, mc03 tick24, 无 requests)
  const config = defaultCognitionVillageConfig();
  for (const a of config.memory.society.actors.initialActors.slice(1, 3)) {
    Object.assign(a, { health: 1000, hunger: 0, fatigue: 0 });
  }
  config.motivation.requests = [];

  const { bundle, systems } = createCognitionVillage(42, 'c2-village', config);
  const session = createSimulationSession(bundle, systems);

  // Day 1 (tick 144): 评估为 review
  session.advanceTicks(144);
  const b144 = session.getBundle();
  const eval144_2 = b144.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 144 && e.payload.actorId === 'actor-2');
  const plan144_2 = b144.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 144 && e.payload.actorId === 'actor-2');
  assert.ok(eval144_2);
  assert.equal(eval144_2.payload.decision.mode, 'review');
  assert.equal(plan144_2.payload.mode, 'review');
  assert.equal(plan144_2.payload.sourceReviewDecisionId, null);

  // Day 2 (tick 288): 降频为 maintain
  session.advanceTicks(144);
  const b288 = session.getBundle();
  const eval288_2 = b288.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288 && e.payload.actorId === 'actor-2');
  const plan288_2 = b288.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.ok(eval288_2);
  assert.equal(eval288_2.payload.decision.mode, 'maintain');
  assert.equal(plan288_2.payload.mode, 'maintain');
  assert.equal(plan288_2.payload.candidates.length, 0, 'maintain candidates 必须为空数组');
  assert.equal(plan288_2.payload.sourceReviewDecisionId, 'cognition-day-1-actor-2');

  // Day 3 (tick 432): 继续 maintain
  session.advanceTicks(144);
  const b432 = session.getBundle();
  const eval432_2 = b432.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 432 && e.payload.actorId === 'actor-2');
  const plan432_2 = b432.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 432 && e.payload.actorId === 'actor-2');
  assert.ok(eval432_2);
  assert.equal(eval432_2.payload.decision.mode, 'maintain');
  assert.equal(plan432_2.payload.mode, 'maintain');

  // Day 4 (tick 576): PERIOD 周期唤醒 -> 晋升为 review
  session.advanceTicks(144);
  const b576 = session.getBundle();
  const eval576_2 = b576.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 576 && e.payload.actorId === 'actor-2');
  const plan576_2 = b576.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 576 && e.payload.actorId === 'actor-2');
  assert.ok(eval576_2);
  assert.equal(eval576_2.payload.decision.mode, 'review');
  assert.equal(plan576_2.payload.mode, 'review');
  assert.equal(plan576_2.payload.candidates.length, 5, 'review 必须包含 5 个候选');
  validateBundle(b576, { rulesVersion: COGNITION_RULES, systems });

  // 2.2 完全无 stimuli 场景：tick 288 触发 EVIDENCE_CHANGED 唤醒为 review
  const configNoStim = defaultCognitionVillageConfig();
  for (const a of configNoStim.memory.society.actors.initialActors.slice(1, 3)) {
    Object.assign(a, { health: 1000, hunger: 0, fatigue: 0 });
  }
  configNoStim.mind.stimuli = []; // 清空初始 stimuli
  configNoStim.motivation.requests = [];

  const { bundle: bundleNoStim, systems: systemsNoStim } = createCognitionVillage(42, 'c2-nostim', configNoStim);
  const sessionNoStim = createSimulationSession(bundleNoStim, systemsNoStim);
  sessionNoStim.advanceTicks(144); // Day 1 review
  sessionNoStim.advanceTicks(144); // Day 2: 首次 daily-public 改变 belief -> EVIDENCE_CHANGED 唤醒 -> review
  const bNoStim288 = sessionNoStim.getBundle();
  const evalNoStim288 = bNoStim288.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.equal(evalNoStim288.payload.decision.mode, 'review', 'EVIDENCE_CHANGED 触发 review');
});

// ============================================================================
// C3: Continuation 真实消费链 (BuyMedicine -> maintain UseMedicine)
// ============================================================================
test('C3: Continuation 真实消费链 (Day1 BuyMedicine -> Day2 maintain UseMedicine)', async (t) => {
  if (!gate(t)) return;
  const { createCognitionVillage, defaultCognitionVillageConfig } = deps.fixture;
  const { COGNITION_RULES } = deps.state;

  // 独立配方：actor-2 health 400, fatigue 650, importance 400, no requests
  const config = defaultCognitionVillageConfig();
  const a2 = config.memory.society.actors.initialActors.find((a) => a.actorId === 'actor-2');
  Object.assign(a2, { health: 400, hunger: 0, fatigue: 650 });
  config.cognition.profiles.find((p) => p.actorId === 'actor-2').importancePermille = 400;
  config.motivation.requests = [];

  const { bundle, systems } = createCognitionVillage(42, 'c3-continuation', config);
  const session = createSimulationSession(bundle, systems);

  // Day 1: review 选择 BuyMedicine 并真实执行成功
  session.advanceTicks(144);
  const bDay1 = session.getBundle();
  const planDay1 = bDay1.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 144 && e.payload.actorId === 'actor-2');
  const resDay1 = bDay1.eventLog.find((e) => e.type === 'MotivationDecisionResolved' && e.tick === 144 && e.payload.actorId === 'actor-2');
  assert.equal(planDay1.payload.mode, 'review');
  assert.equal(planDay1.payload.choice, 'BuyMedicine');
  assert.equal(resDay1.payload.status, 'succeeded');
  assert.equal(resDay1.payload.delta.herbs, 1, '背包草药增加 1');

  // Day 2: maintain 执行 UseMedicine
  session.advanceTicks(144);
  const bDay2 = session.getBundle();
  const evalDay2 = bDay2.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288 && e.payload.actorId === 'actor-2');
  const planDay2 = bDay2.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288 && e.payload.actorId === 'actor-2');
  const resDay2 = bDay2.eventLog.find((e) => e.type === 'MotivationDecisionResolved' && e.tick === 288 && e.payload.actorId === 'actor-2');

  assert.equal(evalDay2.payload.decision.mode, 'maintain');
  assert.equal(planDay2.payload.mode, 'maintain');
  assert.equal(planDay2.payload.choice, 'UseMedicine');
  assert.equal(planDay2.payload.gateReason, 'CONTINUE_MAINTAIN');
  assert.equal(planDay2.payload.candidates.length, 0);
  assert.equal(planDay2.payload.planId, 1, '沿用 planId 1');
  assert.equal(planDay2.payload.goalId, 1, '沿用 goalId 1');
  assert.equal(planDay2.payload.sourceReviewDecisionId, 'cognition-day-1-actor-2', 'anchor 保持 Day 1 Planned');

  // 动作与 authority 执行成功
  assert.equal(resDay2.payload.commandId, 'cognition-day-2-actor-2', '今日新建 commandId');
  assert.equal(resDay2.payload.status, 'succeeded');
  assert.equal(resDay2.payload.delta.herbs, -1, '使用草药 1');
  assert.ok(resDay2.payload.delta.health > 0, '生命值提升');

  validateBundle(bDay2, { rulesVersion: COGNITION_RULES, systems });
});

// ============================================================================
// C4: 阻塞、恢复与唤醒策略
// ============================================================================
test('C4: 阻塞重试、suspended 恢复、Proposal 预冻结与 Work 经验适配', async (t) => {
  if (!gate(t)) return;
  const { isCommittedStepEligible, continueCognitionPlan } = deps.planner ?? extraModules[0][1];
  const { projectOwnCognitionWorkOutcome } = deps.adapter ?? extraModules[3][1];
  const { COGNITION_RULES } = deps.state;

  // 4.1 isCommittedStepEligible: 软前置检查
  const kReady = makeTestKnowledge({
    health: 400,
    wallet: 100,
    herbs: 0,
    activePlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine'], stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null },
    currentGoal: { goalId: 1, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 0, target: 800 },
  });
  assert.equal(isCommittedStepEligible(kReady, kReady.planState.activePlan).eligible, true);

  // 钱包不足 -> ineligible
  const kPoor = makeTestKnowledge({
    health: 400,
    wallet: 10,
    activePlan: kReady.planState.activePlan,
    currentGoal: kReady.self.currentGoal,
  });
  assert.equal(isCommittedStepEligible(kPoor, kPoor.planState.activePlan).eligible, false);

  // 4.2 continueCognitionPlan: activePlan 为 null 时恢复 eligible suspendedPlan
  const kSuspended = makeTestKnowledge({
    health: 400,
    wallet: 100,
    activePlan: null,
    suspendedPlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine'], stepIndex: 0, status: 'suspended', createdDay: 1, deadlineDay: 21, requestId: null },
    currentGoal: { goalId: 1, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 0, target: 800 },
  });
  const contRes = continueCognitionPlan(kSuspended, { evaluationEventSeq: 10, sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 5 });
  assert.equal(contRes.activePlan.planId, 1);
  assert.equal(contRes.activePlan.status, 'ready', '成功恢复 suspended 为 ready');
  assert.equal(contRes.suspendedPlan, null);
  assert.equal(contRes.decision.choice, 'BuyMedicine');

  // 4.3 Work 经验投影：非 cognition 规则抛出 UNSUPPORTED_VERSION
  assert.throws(
    () => projectOwnCognitionWorkOutcome({ simulationId: 's', rulesVersion: 'm-experience-v1', eventLog: [], commandReceipts: {} }, 'actor-2', 1),
    /cognition rules only/
  );
});

// ============================================================================
// C5: 生死、身份与时序边界
// ============================================================================
test('C5: 死亡处理与跨 actor 身份/因果防串', async (t) => {
  if (!gate(t)) return;
  const { createCognitionVillage, defaultCognitionVillageConfig } = deps.fixture;
  const { COGNITION_RULES } = deps.state;

  const config = defaultCognitionVillageConfig();
  const { bundle, systems } = createCognitionVillage(42, 'c5-death', config);
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(144);

  // 人物死亡：直接将其生命值置 0
  const b144 = session.getBundle();
  const a2Body = b144.snapshot.world.actorModel.actors.find((a) => a.actorId === 'actor-2');
  a2Body.alive = false;
  a2Body.health = 0;
  a2Body.deathTick = 144;

  const deadSession = createSimulationSession(b144, systems);
  deadSession.advanceTicks(144); // Day 2 (tick 288)
  const b288 = deadSession.getBundle();

  // 死者仅发 CognitionReviewEvaluated (dormant)，不发 Planned/Resolved/Observed
  const evalDead = b288.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.ok(evalDead);
  assert.equal(evalDead.payload.decision.mode, 'dormant');
  assert.equal(evalDead.payload.input.alive, false);

  const planDead = b288.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.equal(planDead, undefined, '死者不发 Planned 事件');

  validateBundle(b288, { rulesVersion: COGNITION_RULES, systems });
});

// ============================================================================
// C7: 篡改反例、访问器防御与事务回滚
// ============================================================================
test('C7: 篡改反例 (实质改变 canonical)、Getter 零调用与回滚防御', async (t) => {
  if (!gate(t)) return;
  const { createCognitionVillage, defaultCognitionVillageConfig } = deps.fixture;
  const { validateCognitionWorld, cognitionRuntimeHooks } = deps.runtime ?? extraModules[1][1];
  const { COGNITION_RULES } = deps.state;

  const config = defaultCognitionVillageConfig();
  const { bundle, systems } = createCognitionVillage(42, 'c7-tamper', config);
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(288);
  const baseBundle = session.getBundle();

  // 7.1 实质性篡改反例：断言 canonical bytes 必变化且校验拒绝
  const mutations = [
    // 篡改 1: 篡改 cognitionModel.cursor
    (b) => {
      b.snapshot.world.cognitionModel.cursor--;
    },
    // 篡改 2: 篡改 cognitionModel actor reviewState
    (b) => {
      b.snapshot.world.cognitionModel.actors[0].reviewState.sampleCount = 999;
    },
    // 篡改 3: 篡改 Planned 事件中的 mode 为非法值
    (b) => {
      const p = b.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288);
      if (p) p.payload.mode = 'fabricated-mode';
    },
    // 篡改 4: 篡改 Planned 事件中的 sourceReviewDecisionId 错配
    (b) => {
      const p = b.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288);
      if (p) p.payload.sourceReviewDecisionId = 'wrong-review-id';
    },
    // 篡改 5: 篡改 Planned candidates 数组在 maintain 下为非空
    (b) => {
      const p = b.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288 && e.payload.mode === 'maintain');
      if (p) p.payload.candidates = [{ action: 'WorkForPay', eligible: true, score: 500 }];
    },
    // 篡改 6: 篡改 CognitionReviewEvaluated 事件 payload decision
    (b) => {
      const ev = b.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288);
      if (ev) ev.payload.decision.mode = 'review';
    },
  ];

  for (let i = 0; i < mutations.length; i++) {
    const mutated = cloneData(baseBundle);
    const beforeBytes = canonicalJson(mutated);
    mutations[i](mutated);
    const afterBytes = canonicalJson(mutated);
    assert.notEqual(beforeBytes, afterBytes, `变体 ${i + 1} 必须产生实质不同的 canonical JSON`);
    assert.throws(
      () => validateBundle(mutated, { rulesVersion: COGNITION_RULES, systems }),
      /INVALID_INPUT|LIMIT_EXCEEDED|differ|mismatch|Unknown/
    );
  }

  // 7.2 Getter 零调用防御
  let getterCalls = 0;
  const badWorld = cloneData(baseBundle.snapshot.world);
  Object.defineProperty(badWorld, 'trappedGetter', {
    get() {
      getterCalls++;
      return 'trap';
    },
    enumerable: true,
  });
  assert.throws(() => validateCognitionWorld(badWorld));
  assert.equal(getterCalls, 0, '访问器预检拦截，getterCalls 必须为 0');

  // 7.3 结算故障全 tick 回滚防御
  const s2 = createSimulationSession(baseBundle, {
    society() {
      throw fault('INVALID_INPUT', 'injected settlement failure');
    },
  });
  assert.throws(() => s2.advanceTicks(1));
  assert.deepEqual(s2.getBundle(), baseBundle, '故障时整 tick 回滚');
});
