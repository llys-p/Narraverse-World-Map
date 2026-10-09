// M3-3B 独立验收：认知降频与延续运行时独立验收
// 合同唯一权威：m3-cognition-runtime-contract-v1（M3-3A §共同合同）
// 唯一起点：D:\Narraverse-World-Map-m3-integration @ a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2
// 独立性：所有预期均为独立手算与合同定义推导，不调用被测实现自产 expected。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson, fault, cloneData, inputFingerprint } from '../../runtime/core/data-contract.mjs';
import { planExperienceMotivationDecision } from '../../runtime/core/motivation-planner.mjs';
import { inspectDescriptorTree } from '../../runtime/core/experience-state.mjs';
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

function gate() {
  if (depFailure !== null) {
    const directMissing = depFailure.code === 'ERR_MODULE_NOT_FOUND' &&
      REQUIRED.some(specifier => new URL(specifier, import.meta.url).href === depFailure.url);
    if (directMissing) {
      assert.fail('A_DEPENDENCY_PENDING: A 路精确交付 SHA 尚未派发；不得把待跑记为 PASS：' + depFailure.url);
    }
    throw depFailure; // transitive 缺失、语法错误等不能归为已知待跑。
  }
  for (const [specifier, module, names] of extraModules) {
    for (const name of names) {
      if (name === 'cognitionRuntimeHooks') {
        const hooks = module[name];
        const expected = ['createWorld', 'beforeSystems', 'afterSystems', 'applyAction', 'settleDay', 'validateHistory'];
        assert.ok(hooks !== null && typeof hooks === 'object' && !Array.isArray(hooks), specifier + ' hooks 必须为六函数对象');
        assert.deepEqual(Object.keys(hooks).sort(), expected.slice().sort());
        for (const key of expected) assert.equal(typeof hooks[key], 'function', key);
      } else {
        assert.equal(typeof module[name], 'function', specifier + ' 导出 ' + name);
      }
    }
  }
  for (const name of ['validateCognitionConfig', 'createCognitionModel', 'validateCognitionModel'])
    assert.equal(typeof deps.state[name], 'function', name);
  assert.equal(typeof deps.signals.deriveActorCognitionSignals, 'function');
  for (const name of ['defaultCognitionVillageConfig', 'createCognitionVillage', 'cognitionSystems'])
    assert.equal(typeof deps.fixture[name], 'function', name);
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
      health: alive ? health : 0,
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
      nextPlanId: Math.max(0, activePlan?.planId ?? 0, suspendedPlan?.planId ?? 0) + 1,
      lastReviewedDutyId: null,
    },
    experience: {
      version: 'work-experience-view-v1',
      simulationId: 'test-sim',
      actorId,
      topic: 'work-for-pay-execution',
      sampleCount: penaltyPermille / 100,
      failureCount: penaltyPermille / 100,
      penaltyPermille,
      evidenceRefs: Array.from({ length: penaltyPermille / 100 }, (_, i) => i + 10),
    },
    useWorkExperience: true,
  };
}

const healthGoal = () => ({ goalId: 1, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 0, target: 800 });
const healthPlan = (status = 'ready') => ({ planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0, status, createdDay: 1, deadlineDay: 21, requestId: null });
const context288 = () => ({ evaluationEventSeq: 10, sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 5 });
const actorOf = (bundle, actorId = 'actor-2') => bundle.snapshot.world.actorModel.actors.find(a => a.actorId === actorId);
const entryOf = (bundle, actorId = 'actor-2') => bundle.snapshot.world.motivationModel.actors.find(a => a.actorId === actorId);
function factOf(bundle, type, tick, actorId = 'actor-2') {
  const matches = bundle.eventLog.filter(e => e.type === type && e.tick === tick && e.payload.actorId === actorId);
  assert.equal(matches.length, 1, `${type} tick${tick} ${actorId} 必须唯一存在`);
  return matches[0];
}
function healthyConfig(config) {
  for (const actor of config.memory.society.actors.initialActors.slice(1, 3))
    Object.assign(actor, { health: 1000, hunger: 0, fatigue: 0 });
  config.motivation.requests = [];
  return config;
}
const assertDefaultChecks = config => assert.deepEqual(config.mind.stimuli, [
  { stimulusId: 'mc02', tick: 12, kind: 'market-check', listenerId: 'actor-2' },
  { stimulusId: 'mc03', tick: 24, kind: 'market-check', listenerId: 'actor-3' },
]);
const assertFault = (run, code = 'INVALID_INPUT') => assert.throws(run, error => error.code === code);

// 此检查只证明测试夹具合法，不能计为 cognition 功能验收；不调用新 A API 或冻结 kernel。
test('Preparation: synthetic knowledge 保持旧 experience DTO、固定 plan shape 与引用预算', () => {
  for (const options of [{}, { penaltyPermille: 100 },
    { tick: 288, health: 400, currentGoal: healthGoal(), suspendedPlan: healthPlan('suspended') }]) {
    const cognition = makeTestKnowledge(options);
    inspectDescriptorTree(cognition);
    const oldKnowledge = { ...cloneData(cognition), knowledgeVersion: 'experience-knowledge-v1' };
    const before = canonicalJson(oldKnowledge);
    assert.ok(planExperienceMotivationDecision(oldKnowledge).decision);
    assert.equal(canonicalJson(oldKnowledge), before, '夹具校验不污染输入');
  }
  const badPenalty = makeTestKnowledge({ penaltyPermille: 100 });
  badPenalty.experience.sampleCount = 0; badPenalty.experience.evidenceRefs = [];
  assertFault(() => planExperienceMotivationDecision({ ...badPenalty, knowledgeVersion: 'experience-knowledge-v1' }));
  const badCounter = makeTestKnowledge({ tick: 288, health: 400, currentGoal: healthGoal(), suspendedPlan: healthPlan('suspended') });
  badCounter.planState.nextPlanId = 1;
  assertFault(() => planExperienceMotivationDecision({ ...badCounter, knowledgeVersion: 'experience-knowledge-v1' }));
});

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
  const kPlan = makeTestKnowledge({ currentGoal: healthGoal(), activePlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null } });
  assert.equal(deriveActorCognitionSignals(kPlan, 700, null, null).input.relevancePermille, 1000);

  // - 存活且有 suspendedPlan -> 1000
  const kSusp = makeTestKnowledge({ currentGoal: healthGoal(), suspendedPlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0, status: 'suspended', createdDay: 1, deadlineDay: 21, requestId: null } });
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
  const expectedBaseline = { keyEvidenceFingerprint: canonicalJson({ value: 'available', confidenceEnough: true, penaltyPermille: 0 }) };
  assert.deepEqual(res1.baseline, expectedBaseline);

  // 携带上一轮 baseline：若 semantic 未变，raw price/seq/wallet 改变均不唤醒
  const kModSeq = makeTestKnowledge({
    health: 1000,
    wallet: 80, // wallet 改变
    belief: { topic: 'public-herbs-available', value: 'available', confidencePermille: 900, evidenceRefs: [2], contradictionRefs: [], lastUpdatedTick: 24 },
  });
  const res2 = deriveActorCognitionSignals(kModSeq, 700, expectedBaseline, null);
  assert.equal(res2.input.keyEvidenceChanged, false, '语义稳定时 keyEvidenceChanged 为 false');

  // 若 semantic 变动（例如 penaltyPermille 从 0 变成 100）：必须为 true
  const kPenalty = makeTestKnowledge({
    health: 1000,
    penaltyPermille: 100,
  });
  const res3 = deriveActorCognitionSignals(kPenalty, 700, expectedBaseline, null);
  assert.equal(res3.input.keyEvidenceChanged, true, '罚分变化触发 keyEvidenceChanged');

  // 若 confidence 降到 599 (< 600)：必须为 true
  const kLowConf = makeTestKnowledge({
    health: 1000,
    belief: { topic: 'public-herbs-available', value: 'available', confidencePermille: 599, evidenceRefs: [1], contradictionRefs: [], lastUpdatedTick: 12 },
  });
  const res4 = deriveActorCognitionSignals(kLowConf, 700, expectedBaseline, null);
  assert.equal(res4.input.keyEvidenceChanged, true, '置信度跨过 600 门限触发 keyEvidenceChanged');

  // 1.6 GoalOrPlanInvalidated 判定：
  // - 合法健康计划与 Goal 同为 deadlineDay21；第22日只测纯 signals，不运行22日模拟
  const kExpired = makeTestKnowledge({
    tick: 3168,
    activePlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null },
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
  const before = canonicalJson(kNormal);
  kModSeq.quote = { product: 'herbs', price: 51, observedTick: 24, sourceEventSeq: 2 };
  kModSeq.self.inventory.herbs = 1;
  assert.equal(deriveActorCognitionSignals(kModSeq, 700, expectedBaseline, null).input.keyEvidenceChanged, false);
  assert.equal(canonicalJson(kNormal), before);
  const blocked = makeTestKnowledge({ tick: 288, health: 400, wallet: 10, currentGoal: healthGoal(), activePlan: healthPlan('blocked') });
  assert.equal(deriveActorCognitionSignals(blocked, 700, null, null).input.goalOrPlanInvalidated, false);
  blocked.planState.activePlan.status = 'ready';
  assert.equal(deriveActorCognitionSignals(blocked, 700, null, null).input.goalOrPlanInvalidated, true);
  const suspendedPoor = makeTestKnowledge({ tick: 288, health: 400, wallet: 10, currentGoal: healthGoal(), suspendedPlan: healthPlan('suspended') });
  assert.equal(deriveActorCognitionSignals(suspendedPoor, 700, null, null).input.goalOrPlanInvalidated, false);
  const expiredDuty = makeTestKnowledge({ tick: 432, duty: majorDuty });
  assert.equal(deriveActorCognitionSignals(expiredDuty, 700, null, null).input.newMajorDuty, false);
  assert.equal(deriveActorCognitionSignals(expiredDuty, 700, null, null).input.goalOrPlanInvalidated, false);
  const staleRejected = { ...prevRejected };
  assert.equal(deriveActorCognitionSignals(makeTestKnowledge({ tick: 432 }), 700, null, staleRejected).input.goalOrPlanInvalidated, false);
  for (const mutation of [previous => { previous.actorId = 'actor-3'; }, previous => { previous.simulationId = 'foreign'; },
    previous => { previous.tick = 288; previous.decisionId = 'cognition-day-2-actor-2'; },
    previous => { previous.decisionId = 'cognition-day-1-actor-3'; }]) {
    const wrong = cloneData(prevRejected); mutation(wrong);
    assertFault(() => deriveActorCognitionSignals(kPrevRej, 700, null, wrong));
  }
  assertFault(() => deriveActorCognitionSignals({ ...kNormal, knowledgeVersion: 'cognition-knowledge-v0' }, 700, null, null), 'UNSUPPORTED_VERSION');
  assertFault(() => deriveActorCognitionSignals(kNormal, 700, { keyEvidenceFingerprint: 'noncanonical' }, null));
  // 真实 derive output → frozen kernel：只补本次 adapter 的晋升联接，不跑旧 kernel 套件。
  const initialSignals = deriveActorCognitionSignals(makeTestKnowledge(), 700, null, null);
  const initialReview = evaluateCognitiveReview(createCognitiveReviewState('test-sim', 'actor-2'), initialSignals.input);
  const promotedSignals = deriveActorCognitionSignals(makeTestKnowledge({ tick: 288, health: 650, currentGoal: healthGoal() }), 700, expectedBaseline, null);
  const promoted = evaluateCognitiveReview(initialReview.state, promotedSignals.input);
  assert.deepEqual([promoted.decision.score, promoted.decision.tier, promoted.decision.mode], [700000, 'full', 'review']);
  assert.deepEqual(promoted.decision.reasonCodes, ['PROMOTED', 'PERIOD_DUE']); // full interval144：144+144到期，固定reason顺序

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

  assertDefaultChecks(config);
  const { bundle, systems } = createCognitionVillage(42, 'c2-village', config);
  const session = createSimulationSession(bundle, systems);

  // Day 1 (tick 144): 评估为 review
  session.advanceTicks(144);
  const b144 = session.getBundle();
  const eval144_2 = b144.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 144 && e.payload.actorId === 'actor-2');
  const plan144_2 = b144.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 144 && e.payload.actorId === 'actor-2');
  assert.ok(eval144_2);
  assert.equal(eval144_2.payload.decision.mode, 'review');
  assert.deepEqual(eval144_2.payload.decision.reasonCodes, ['INITIAL']);
  assert.equal(eval144_2.payload.input.relevancePermille, 500);
  assert.equal(eval144_2.payload.input.keyEvidenceChanged, false);
  const firstKnowledge = JSON.parse(plan144_2.payload.knowledgeFingerprint);
  assert.deepEqual([firstKnowledge.self.health, firstKnowledge.self.fatigue, firstKnowledge.duty], [1000, 0, null]);
  assert.deepEqual([firstKnowledge.belief.value, firstKnowledge.belief.confidencePermille], ['available', 900]);
  assert.equal(eval144_2.payload.decision.nextReviewTick, 576);
  assert.equal(plan144_2.payload.mode, 'review');
  assert.equal(plan144_2.payload.sourceReviewDecisionId, null);

  // Day 2 (tick 288): 降频为 maintain
  session.advanceTicks(144);
  const b288 = session.getBundle();
  const eval288_2 = b288.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288 && e.payload.actorId === 'actor-2');
  const plan288_2 = b288.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.ok(eval288_2);
  assert.equal(eval288_2.payload.decision.mode, 'maintain');
  assert.deepEqual(eval288_2.payload.decision.reasonCodes, []);
  assert.equal(eval288_2.payload.input.keyEvidenceChanged, false);
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
  assert.deepEqual(eval432_2.payload.decision.reasonCodes, []);
  assert.equal(eval432_2.payload.input.keyEvidenceChanged, false);
  assert.equal(plan432_2.payload.mode, 'maintain');

  // Day 4 (tick 576): PERIOD 周期唤醒 -> 晋升为 review
  session.advanceTicks(144);
  const b576 = session.getBundle();
  const eval576_2 = b576.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 576 && e.payload.actorId === 'actor-2');
  const plan576_2 = b576.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 576 && e.payload.actorId === 'actor-2');
  assert.ok(eval576_2);
  assert.equal(eval576_2.payload.decision.mode, 'review');
  assert.deepEqual(eval576_2.payload.decision.reasonCodes, ['PERIOD_DUE']);
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
  const noStim144 = sessionNoStim.getBundle();
  assert.deepEqual(factOf(noStim144, 'CognitionReviewEvaluated', 144).payload.decision.reasonCodes, ['INITIAL']);
  const unknown = JSON.parse(factOf(noStim144, 'MotivationDecisionPlanned', 144).payload.knowledgeFingerprint);
  assert.equal(unknown.belief.value, 'unknown');
  sessionNoStim.advanceTicks(144); // Day 2: 首次 daily-public 改变 belief -> EVIDENCE_CHANGED 唤醒 -> review
  const bNoStim288 = sessionNoStim.getBundle();
  const evalNoStim288 = bNoStim288.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.equal(evalNoStim288.payload.decision.mode, 'review', 'EVIDENCE_CHANGED 触发 review');
  assert.equal(evalNoStim288.payload.input.keyEvidenceChanged, true);
  assert.deepEqual(evalNoStim288.payload.decision.reasonCodes, ['EVIDENCE_CHANGED']);
  const available = JSON.parse(factOf(bNoStim288, 'MotivationDecisionPlanned', 288).payload.knowledgeFingerprint);
  assert.deepEqual([available.belief.value, available.belief.confidencePermille], ['available', 900]);
  for (const tick of [432, 576, 720]) {
    sessionNoStim.advanceTicks(144);
    const ev = factOf(sessionNoStim.getBundle(), 'CognitionReviewEvaluated', tick);
    assert.equal(ev.payload.decision.mode, tick === 720 ? 'review' : 'maintain');
    assert.deepEqual(ev.payload.decision.reasonCodes, tick === 720 ? ['PERIOD_DUE'] : []);
    assert.equal(ev.payload.input.keyEvidenceChanged, false);
  }
  validateBundle(sessionNoStim.getBundle(), { rulesVersion: COGNITION_RULES, systems: systemsNoStim });
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
  const a2 = config.memory.society.actors.initialActors[1];
  assert.equal(a2.occupation, 'hunter', 'initialActors 以固定位置映射 actor-2，不含 actorId 键');
  Object.assign(a2, { health: 400, hunger: 0, fatigue: 650 });
  config.cognition.profiles.find((p) => p.actorId === 'actor-2').importancePermille = 400;
  config.motivation.requests = [];

  assertDefaultChecks(config);
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
  const knowledgeDay1 = JSON.parse(planDay1.payload.knowledgeFingerprint);
  assert.deepEqual([knowledgeDay1.belief.value, knowledgeDay1.belief.confidencePermille], ['available', 900]);
  assert.equal(entryOf(bDay1).nextPlanId, 2);
  assert.equal(bDay1.snapshot.world.societyModel.agents[1].state.nextGoalId, 2);

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
  assert.equal(planDay2.payload.sourceReviewEventSeq, planDay1.eventSeq);
  assert.notEqual(resDay2.payload.commandId, resDay1.payload.commandId);
  assert.equal(entryOf(bDay2).nextPlanId, entryOf(bDay1).nextPlanId);
  assert.equal(bDay2.snapshot.world.societyModel.agents[1].state.nextGoalId, bDay1.snapshot.world.societyModel.agents[1].state.nextGoalId);
  const cognitionDay2 = bDay2.snapshot.world.cognitionModel.actors.find(a => a.actorId === 'actor-2');
  assert.equal(cognitionDay2.lastReviewDecisionId, planDay1.payload.decisionId);
  assert.equal(cognitionDay2.lastReviewEventSeq, planDay1.eventSeq);
  assert.equal(bDay2.snapshot.world.societyModel.day, 2);
  assert.ok(bDay2.snapshot.commandReceipts[resDay2.payload.commandId]);

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
    activePlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null },
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
    tick: 288,
    health: 400,
    wallet: 100,
    activePlan: null,
    suspendedPlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'], stepIndex: 0, status: 'suspended', createdDay: 1, deadlineDay: 21, requestId: null },
    currentGoal: { goalId: 1, kind: 'recover-health', step: 'buy', startDay: 1, deadlineDay: 21, failures: 0, target: 800 },
  });
  const contRes = continueCognitionPlan(kSuspended, { evaluationEventSeq: 10, sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 5 });
  assert.equal(contRes.activePlan.planId, 1);
  assert.equal(contRes.activePlan.status, 'ready', '成功恢复 suspended 为 ready');
  assert.equal(contRes.suspendedPlan, null);
  assert.equal(contRes.decision.choice, 'BuyMedicine');


  // 阻塞资格恢复只重试原 step；不得重新打分、分配 ID 或遗失 Goal。
  const blockedPoor = makeTestKnowledge({ tick: 288, health: 400, wallet: 10, currentGoal: healthGoal(), activePlan: healthPlan('blocked') });
  const wait = continueCognitionPlan(blockedPoor, context288());
  assert.deepEqual([wait.decision.choice, wait.decision.gateReason, wait.nextPlanId, wait.nextGoalId], ['NoAction', 'WAIT_MAINTAIN', 2, 2]);
  assert.equal(wait.activePlan.status, 'blocked');
  assert.deepEqual(wait.currentGoal, blockedPoor.self.currentGoal);
  const recovered = cloneData(blockedPoor); recovered.self.wallet = 100;
  const retry = continueCognitionPlan(recovered, context288());
  assert.equal(retry.decision.choice, 'BuyMedicine');
  assert.deepEqual([retry.activePlan.planId, retry.activePlan.stepIndex, retry.nextPlanId], [1, 0, 2]);
  assert.deepEqual(retry.activePlan.steps, ['BuyMedicine', 'UseMedicine']);
  assert.deepEqual(retry.decision.candidates, []);
  const empty = makeTestKnowledge({ tick: 288, health: 400, fatigue: 650, currentGoal: healthGoal() });
  const emptyWait = continueCognitionPlan(empty, context288());
  assert.deepEqual([emptyWait.decision.choice, emptyWait.activePlan, emptyWait.suspendedPlan], ['NoAction', null, null]);
  assert.deepEqual(emptyWait.currentGoal, empty.self.currentGoal);
  assert.equal(emptyWait.nextPlanId, 1);
  const duty = { requestId: 'd01', sourceEventSeq: 2, observedTick: 200, expiresTick: 432, urgencyPermille: 899, status: 'pending', fulfilledTick: null };
  const work = { planId: 2, goalId: null, kind: 'aid-village', steps: ['WorkForPay'], stepIndex: 0, status: 'ready', createdDay: 2, deadlineDay: 2, requestId: 'd01' };
  const workKnowledge = makeTestKnowledge({ tick: 288, duty, activePlan: work, currentGoal: healthGoal(), suspendedPlan: healthPlan('suspended') });
  const workContinue = continueCognitionPlan(workKnowledge, context288());
  assert.deepEqual([workContinue.decision.mode, workContinue.decision.choice, workContinue.nextPlanId], ['maintain', 'WorkForPay', 3]);
  assert.deepEqual(workContinue.suspendedPlan, workKnowledge.planState.suspendedPlan, 'active 非空不得替换为 suspended');
  assert.deepEqual(workContinue.decision.candidates, []);
  assert.equal(workContinue.lastReviewedDutyId, null);
  assertFault(() => isCommittedStepEligible(workKnowledge, { ...work, planId: 99 }));
  for (const context of [{ ...context288(), sourceReviewDecisionId: 'cognition-day-1-actor-3' },
    { ...context288(), sourceReviewEventSeq: 10 }, { ...context288(), sourceReviewDecisionId: 'cognition-day-2-actor-2' }])
    assertFault(() => continueCognitionPlan(workKnowledge, context));

  // 默认日二有真实重大职责；两 actor proposal 先冻结，review Work 走 authority/receipt/adapter/learning。
  for (const useWorkExperience of [true, false]) {
    const config = deps.fixture.defaultCognitionVillageConfig();
    config.experience.useWorkExperience = useWorkExperience;
    const fixture = deps.fixture.createCognitionVillage(42, 'c4-work-' + useWorkExperience, config);
    const session = createSimulationSession(fixture.bundle, fixture.systems);
    session.advanceTicks(288);
    const actual = session.getBundle();
    const planned = factOf(actual, 'MotivationDecisionPlanned', 288);
    const resolved = factOf(actual, 'MotivationDecisionResolved', 288);
    const observed = factOf(actual, 'ExperienceWorkObserved', 288);
    assert.deepEqual([planned.payload.mode, planned.payload.choice, resolved.payload.status], ['review', 'WorkForPay', 'succeeded']);
    const dayPlans = ['actor-2', 'actor-3'].map(actor => factOf(actual, 'MotivationDecisionPlanned', 288, actor));
    const firstAuthority = actual.eventLog.find(e => e.tick === 288 && e.type === 'SocietyActionCommitted');
    assert.ok(firstAuthority);
    assert.ok(dayPlans.every(event => event.eventSeq < firstAuthority.eventSeq));
    const context = { simulationId: actual.snapshot.simulationId, rulesVersion: COGNITION_RULES, eventLog: actual.eventLog, commandReceipts: actual.snapshot.commandReceipts };
    const expected = { simulationId: actual.snapshot.simulationId, actorId: 'actor-2', sourceEventSeq: resolved.eventSeq,
      occurrenceTick: 288, decisionId: 'cognition-day-2-actor-2', commandId: 'cognition-day-2-actor-2', action: 'WorkForPay', status: 'succeeded', code: null };
    assert.deepEqual(projectOwnCognitionWorkOutcome(context, 'actor-2', resolved.eventSeq), expected);
    assert.equal(projectOwnCognitionWorkOutcome(context, 'actor-3', resolved.eventSeq), null);
    assert.equal(observed.eventSeq, resolved.eventSeq + 1);
    assert.equal(observed.payload.sourceEventSeq, resolved.eventSeq);
    assert.deepEqual(actual.snapshot.world.experienceModel.actors[0].workExperienceState.samples, [expected]);
    for (const mutate of [c => { c.commandReceipts[expected.commandId].input.payload.actorId = 'actor-3'; },
      c => { c.eventLog.find(e => e.eventSeq === resolved.eventSeq).causationEventSeqs = [observed.eventSeq]; },
      c => { c.eventLog.push(cloneData(firstAuthority)); }]) {
      const wrong = cloneData(context); const bytes = canonicalJson(wrong); mutate(wrong);
      assert.notEqual(canonicalJson(wrong), bytes);
      assertFault(() => projectOwnCognitionWorkOutcome(wrong, 'actor-3', resolved.eventSeq), 'INVALID_INPUT');
    }
  }

  // 4.3 Work 经验投影：非 cognition 规则抛出 UNSUPPORTED_VERSION
  assert.throws(
    () => projectOwnCognitionWorkOutcome({ simulationId: 's', rulesVersion: 'm-experience-v1', eventLog: [], commandReceipts: {} }, 'actor-2', 1),
    e => e.code === 'UNSUPPORTED_VERSION'
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
  Object.assign(config.memory.society.actors.initialActors[1], { health: 1, hunger: 1000 });
  Object.assign(config.memory.society.estates[1], { initialFood: 0, initialHerbs: 0, initialWallet: 100 });
  const { bundle, systems } = createCognitionVillage(42, 'c5-death', config);
  const deadSession = createSimulationSession(bundle, systems);
  deadSession.advanceTicks(144);
  const b144 = deadSession.getBundle();
  assert.equal(factOf(b144, 'CognitionReviewEvaluated', 144).payload.input.alive, true);
  assert.deepEqual([actorOf(b144).alive, actorOf(b144).health, actorOf(b144).deathTick], [false, 0, 144]);
  const deadReview = cloneData(b144.snapshot.world.cognitionModel.actors[0]);
  const deadExperience = cloneData(b144.snapshot.world.experienceModel.actors[0]);
  deadSession.advanceTicks(144);
  const b288 = deadSession.getBundle();

  // 死者仅发 CognitionReviewEvaluated (dormant)，不发 Planned/Resolved/Observed
  const evalDead = b288.eventLog.find((e) => e.type === 'CognitionReviewEvaluated' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.ok(evalDead);
  assert.equal(evalDead.payload.decision.mode, 'dormant');
  assert.equal(evalDead.payload.input.alive, false);

  const planDead = b288.eventLog.find((e) => e.type === 'MotivationDecisionPlanned' && e.tick === 288 && e.payload.actorId === 'actor-2');
  assert.equal(planDead, undefined, '死者不发 Planned 事件');
  for (const type of ['MotivationDecisionResolved', 'ExperienceWorkObserved'])
    assert.equal(b288.eventLog.filter(e => e.type === type && e.tick === 288 && e.payload.actorId === 'actor-2').length, 0);
  assert.deepEqual([actorOf(b288).alive, actorOf(b288).deathTick], [false, 144]);
  assert.equal(b288.snapshot.world.cognitionModel.actors[0].lastReviewEventSeq, deadReview.lastReviewEventSeq);
  assert.equal(b288.snapshot.world.cognitionModel.actors[0].lastReviewDecisionId, deadReview.lastReviewDecisionId);
  assert.deepEqual(b288.snapshot.world.experienceModel.actors[0].workExperienceState, deadExperience.workExperienceState);
  assert.deepEqual(b288.eventLog.filter(e => e.tick <= 144), b144.eventLog);
  const revived = cloneData(b288);
  revived.snapshot.world.actorModel.actors[1].alive = true;
  assertFault(() => validateBundle(revived, { rulesVersion: COGNITION_RULES, systems }));

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
  config.cognition.profiles[0].importancePermille = 400;
  config.motivation.requests = [];
  const { bundle, systems } = createCognitionVillage(42, 'c7-tamper', config);
  const session = createSimulationSession(bundle, systems);
  session.advanceTicks(288);
  const baseBundle = session.getBundle();
  assert.equal(factOf(baseBundle, 'MotivationDecisionPlanned', 288).payload.mode, 'maintain');
  const mutations = [
    ['cognition cursor', b => { b.snapshot.world.cognitionModel.cursor--; }],
    ['reviewState unknown key', b => { b.snapshot.world.cognitionModel.actors[0].reviewState.sampleCount = 999; }],
    ['illegal mode', b => { factOf(b, 'MotivationDecisionPlanned', 288).payload.mode = 'fabricated-mode'; }],
    ['foreign anchor', b => { factOf(b, 'MotivationDecisionPlanned', 288).payload.sourceReviewDecisionId = 'wrong-review-id'; }],
    ['maintain nonempty candidates', b => { factOf(b, 'MotivationDecisionPlanned', 288).payload.candidates = cloneData(factOf(b, 'MotivationDecisionPlanned', 144).payload.candidates); }],
    ['evaluation mode', b => { const d = factOf(b, 'CognitionReviewEvaluated', 288).payload.decision; d.mode = d.mode === 'review' ? 'maintain' : 'review'; }],
    ['signal relevance', b => { factOf(b, 'CognitionReviewEvaluated', 288).payload.input.relevancePermille = 500; }],
    ['signal need', b => { const i = factOf(b, 'CognitionReviewEvaluated', 288).payload.input; i.urgentNeed = !i.urgentNeed; }],
    ['kernel score', b => { factOf(b, 'CognitionReviewEvaluated', 288).payload.decision.score++; }],
    ['kernel tier', b => { factOf(b, 'CognitionReviewEvaluated', 288).payload.decision.tier = 'full'; }],
    ['baseline semantic', b => { b.snapshot.world.cognitionModel.actors[0].signalBaseline.keyEvidenceFingerprint = canonicalJson({ value: 'unavailable', confidenceEnough: true, penaltyPermille: 0 }); }],
    ['review full candidates empty', b => { factOf(b, 'MotivationDecisionPlanned', 144).payload.candidates = []; }],
    ['anchor future seq', b => { factOf(b, 'MotivationDecisionPlanned', 288).payload.sourceReviewEventSeq = factOf(b, 'MotivationDecisionPlanned', 288).eventSeq; }],
    ['snapshot anchor foreign actor', b => { b.snapshot.world.cognitionModel.actors[0].lastReviewDecisionId = 'cognition-day-1-actor-3'; }],
    ['plan step/steps canonical recomputed', b => { const d = factOf(b, 'MotivationDecisionPlanned', 288).payload; const k = JSON.parse(d.knowledgeFingerprint); assert.ok(k.planState.activePlan); k.planState.activePlan.stepIndex = 0; k.planState.activePlan.steps = ['UseMedicine']; d.knowledgeFingerprint = canonicalJson(k); }],
    ['plan ID', b => { factOf(b, 'MotivationDecisionPlanned', 288).payload.planId = 99; }],
    ['knowledge canonical recomputed', b => { const d = factOf(b, 'MotivationDecisionPlanned', 288).payload; const k = JSON.parse(d.knowledgeFingerprint); k.self.wallet++; d.knowledgeFingerprint = canonicalJson(k); }],
    ['receipt input fingerprint recomputed', b => { const r = b.snapshot.commandReceipts['cognition-day-2-actor-2']; assert.ok(r); r.input.payload.actorId = 'actor-3'; r.fingerprint = inputFingerprint({ commandId: 'cognition-day-2-actor-2', ...r.input }); }],
    ['resolved cause foreign', b => { factOf(b, 'MotivationDecisionResolved', 288).causationEventSeqs = [factOf(b, 'MotivationDecisionPlanned', 288, 'actor-3').eventSeq]; }],
    ['evaluation identity', b => { factOf(b, 'CognitionReviewEvaluated', 288).payload.input.actorId = 'actor-3'; }],
    ['evaluation stale tick', b => { factOf(b, 'CognitionReviewEvaluated', 288).payload.input.tick = 144; }],
    ['same-tick conflicting duplicate', b => { const ev = cloneData(factOf(b, 'CognitionReviewEvaluated', 288)); ev.payload.input.alive = false; b.eventLog.push(ev); }],
    ['RNG', b => { b.snapshot.rng.state = (b.snapshot.rng.state + 1) >>> 0; }],
  ];
  for (const [label, mutate] of mutations) {
    const mutated = cloneData(baseBundle), beforeBytes = canonicalJson(mutated);
    mutate(mutated);
    assert.notEqual(canonicalJson(mutated), beforeBytes, label + ' 必须实质改变 canonical bytes');
    assertFault(() => validateBundle(mutated, { rulesVersion: COGNITION_RULES, systems }), 'INVALID_INPUT');
  }

  // 完整 public 新 API 与新规则 session raw tree：预检必须在 clone/canonical 之前，getter 计数精确为零。
  const runtime = extraModules[1][1], planner = extraModules[0][1], state = extraModules[2][1], adapter = extraModules[3][1];
  const poison = (value, key, get) => Object.defineProperty(cloneData(value), key, { enumerable: true, configurable: true, get });
  const probe = (label, call) => {
    let getterCalls = 0;
    assertFault(() => call(() => { getterCalls++; return 1; }));
    assert.equal(getterCalls, 0, label + ' getterCalls 必须为 0');
  };
  const cfg = config.cognition;
  const model = baseBundle.snapshot.world.cognitionModel;
  const knowledge = makeTestKnowledge({ tick: 288, health: 400, currentGoal: healthGoal(), activePlan: healthPlan() });
  const decision = factOf(baseBundle, 'MotivationDecisionPlanned', 288).payload;
  const adapterContext = { simulationId: baseBundle.snapshot.simulationId, rulesVersion: COGNITION_RULES,
    eventLog: baseBundle.eventLog, commandReceipts: baseBundle.snapshot.commandReceipts };
  for (const [label, call] of [
    ['validateCognitionConfig', get => deps.state.validateCognitionConfig(poison(cfg, 'profiles', get))],
    ['createCognitionModel', get => deps.state.createCognitionModel('getters', poison(cfg, 'profiles', get))],
    ['validateCognitionModel', get => deps.state.validateCognitionModel(poison(model, 'cursor', get))],
    ['deriveActorCognitionSignals', get => deps.signals.deriveActorCognitionSignals(poison(knowledge, 'tick', get), 400, null, null)],
    ['isCommittedStepEligible', get => planner.isCommittedStepEligible(poison(knowledge, 'tick', get), knowledge.planState.activePlan)],
    ['planCognitionMotivationDecision', get => planner.planCognitionMotivationDecision(poison(knowledge, 'tick', get), { evaluationEventSeq: 10, sourceReviewDecisionId: null, sourceReviewEventSeq: null })],
    ['continueCognitionPlan', get => planner.continueCognitionPlan(poison(knowledge, 'tick', get), context288())],
    ['validateCognitionMotivationDecision', get => state.validateCognitionMotivationDecision(poison(decision, 'goalId', get))],
    ['validateCognitionMotivationModel', get => state.validateCognitionMotivationModel(poison(baseBundle.snapshot.world.motivationModel, 'cursor', get))],
    ['projectOwnCognitionWorkOutcome', get => adapter.projectOwnCognitionWorkOutcome(poison(adapterContext, 'eventLog', get), 'actor-2', 1)],
    ['validateCognitionWorld', get => validateCognitionWorld(poison(baseBundle.snapshot.world, 'trappedGetter', get))],
    ['executeCognitionPlayerIntent', get => runtime.executeCognitionPlayerIntent(poison(baseBundle, 'eventLog', get), { commandId: 'getter-intent', type: 'PlayerRest', payload: {} })],
    ['createCognitionVillage', get => createCognitionVillage(42, 'getters', poison(config, 'memory', get))],
    ['validateBundle', get => validateBundle(poison(baseBundle, 'eventLog', get), { rulesVersion: COGNITION_RULES, systems })],
    ['createSimulationSession', get => createSimulationSession(poison(baseBundle, 'snapshot', get), systems)],
    ['hooks.createWorld', get => cognitionRuntimeHooks.createWorld(config.memory, config.mind, config.motivation, config.experience, poison(cfg, 'profiles', get), 'getters')],
    ['hooks.beforeSystems', get => cognitionRuntimeHooks.beforeSystems(poison(baseBundle.snapshot, 'pendingCommands', get), baseBundle.eventLog, 432, () => {}, () => {})],
    ['hooks.afterSystems', get => cognitionRuntimeHooks.afterSystems(poison(baseBundle.snapshot, 'commandReceipts', get), baseBundle.eventLog, 288, () => {}, new Map())],
    ['hooks.applyAction', get => cognitionRuntimeHooks.applyAction(poison(baseBundle.snapshot.world, 'cognitionModel', get), { actorId: 'actor-2', goalId: 1, action: 'UseMedicine', targetActorId: null }, 0.5)],
    ['hooks.settleDay', get => cognitionRuntimeHooks.settleDay(poison(baseBundle.snapshot.world, 'cognitionModel', get), 0.5)],
    ['hooks.validateHistory', get => cognitionRuntimeHooks.validateHistory(poison(baseBundle.snapshot, 'world', get), baseBundle.eventLog)],
  ]) probe(label, call);
  probe('inherited array map', get => {
    const bad = cloneData(knowledge);
    const inherited = Object.create(Array.prototype);
    Object.defineProperty(inherited, 'map', { get });
    Object.setPrototypeOf(bad.observations, inherited);
    planner.planCognitionMotivationDecision(bad, { evaluationEventSeq: 10, sourceReviewDecisionId: null, sourceReviewEventSeq: null });
  });

  // 日二真实 review Work 后，日结处才抛故障；dueTick 是真实目标，ctx.snapshot.tick 仍为287。
  const workFixture = createCognitionVillage(42, 'c7-post-learning', defaultCognitionVillageConfig());
  const workSession = createSimulationSession(workFixture.bundle, workFixture.systems);
  workSession.advanceTicks(287);
  const before = workSession.getBundle();
  let reached = false;
  const broken = createSimulationSession(before, {
    ...workFixture.systems,
    society(ctx, due) {
      assert.equal(due.dueTick, 288);
      const samples = ctx.snapshot.world.experienceModel.actors[0].workExperienceState.samples;
      assert.equal(samples.length, 1, '必须已经发生真实本人 Work 学习');
      assert.deepEqual([samples[0].actorId, samples[0].occurrenceTick, samples[0].commandId], ['actor-2', 288, 'cognition-day-2-actor-2']);
      assert.ok(ctx.snapshot.world.experienceModel.cursor > samples[0].sourceEventSeq, 'Observed 已占据后续真实seq');
      assert.ok(ctx.snapshot.nextEventSeq > samples[0].sourceEventSeq + 1);
      reached = true;
      throw fault('INVALID_INPUT', 'injected post-learning settlement failure');
    },
  });
  assert.throws(() => broken.advanceTicks(1), e => e.code === 'INVALID_INPUT' && e.failedTick === 288);
  assert.equal(reached, true);
  assert.deepEqual(broken.getBundle(), before, '故障时整 tick（事实/样本/输入/receipts/IDs/RNG/物理）回滚');
  assert.deepEqual(workSession.getBundle(), before, '故障注入不能污染原输入');

  // 独立合法自然预算溢出：日二本人 Work 学习完成后，原日结对 opening+inflow 的安全整数预算拒绝。
  const overflowConfig = defaultCognitionVillageConfig();
  overflowConfig.memory.society.actors.market.ecology.resources.flows.push({ day: 2, resource: 'food', direction: 'in', amount: Number.MAX_SAFE_INTEGER });
  const overflowFixture = createCognitionVillage(42, 'c7-natural-overflow', overflowConfig);
  const overflowSession = createSimulationSession(overflowFixture.bundle, overflowFixture.systems);
  overflowSession.advanceTicks(287);
  const beforeOverflow = overflowSession.getBundle();
  let reachedNatural = false;
  const naturalOverflow = createSimulationSession(beforeOverflow, {
    ...overflowFixture.systems,
    society(ctx, due) {
      assert.equal(due.dueTick, 288);
      const samples = ctx.snapshot.world.experienceModel.actors[0].workExperienceState.samples;
      assert.equal(samples.length, 1, '自然溢出前必须已经发生真实本人 Work 学习');
      assert.deepEqual([samples[0].actorId, samples[0].occurrenceTick, samples[0].commandId], ['actor-2', 288, 'cognition-day-2-actor-2']);
      assert.ok(ctx.snapshot.world.experienceModel.cursor > samples[0].sourceEventSeq + 1, '紧随 Resolved 的 Observed 已计入 cursor');
      assert.ok(ctx.snapshot.nextEventSeq > samples[0].sourceEventSeq + 1, 'Observed 已占据真实事件序号');
      reachedNatural = true;
      return overflowFixture.systems.society(ctx, due); // 原生产结算自然触发 LIMIT_EXCEEDED，不人工抛预算错误。
    },
  });
  assert.throws(() => naturalOverflow.advanceTicks(1), e => e.code === 'LIMIT_EXCEEDED' && e.failedTick === 288);
  assert.equal(reachedNatural, true, '必须到达真实学习后的自然预算拒绝点');
  assert.deepEqual(naturalOverflow.getBundle(), beforeOverflow, '自然预算溢出时整 tick 回滚');
  assert.deepEqual(overflowSession.getBundle(), beforeOverflow, '自然溢出不能污染原输入');
});
