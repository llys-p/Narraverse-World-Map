import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMotivationVillageConfig } from '../../runtime/fixtures/motivation-village.mjs';
import { createWorkExperienceState, observeWorkOutcome, deriveWorkExperience } from '../../runtime/core/work-experience.mjs';
import {
  EXPERIENCE_CONFIG_VERSION,
  EXPERIENCE_DECISION_VERSION,
  EXPERIENCE_KNOWLEDGE_VERSION,
  validateExperienceConfig,
  createExperienceModel,
  validateExperienceModel,
} from '../../runtime/core/experience-state.mjs';
import {
  planExperienceMotivationDecision,
} from '../../runtime/core/motivation-planner.mjs';

function baseKnowledge(overrides = {}) {
  const duty = {
    requestId: 'd01',
    sourceEventSeq: 10,
    observedTick: 200,
    expiresTick: 432,
    urgencyPermille: 1000,
    status: 'pending',
    fulfilledTick: null,
  };
  const self = {
    name: 'Li',
    occupation: 'Hunter',
    location: 'village',
    alive: true,
    health: 400,
    hunger: 0,
    fatigue: 650,
    wallet: 50,
    inventory: { food: 20, herbs: 1 },
    currentGoal: {
      goalId: 1,
      kind: 'recover-health',
      step: 'use',
      startDay: 1,
      deadlineDay: 21,
      failures: 0,
      target: 800,
    },
    nextGoalId: 2,
    cooldownUntilDay: 0,
  };
  const quote = { product: 'herbs', price: 50, observedTick: 144, sourceEventSeq: 5 };
  const observations = [];
  const belief = {
    topic: 'public-herbs-available',
    value: 'available',
    confidencePermille: 600,
    evidenceRefs: [1, 2],
    contradictionRefs: [],
    lastUpdatedTick: 144,
  };
  const profile = { dutyWeightPermille: 900, riskAversionPermille: 200 };
  const planState = {
    activePlan: {
      planId: 1,
      goalId: 1,
      kind: 'recover-health',
      steps: ['BuyMedicine', 'UseMedicine'],
      stepIndex: 1,
      status: 'ready',
      createdDay: 1,
      deadlineDay: 21,
      requestId: null,
    },
    suspendedPlan: null,
    nextPlanId: 2,
    lastReviewedDutyId: null,
  };

  const emptyKernel = createWorkExperienceState('experience-village', 'actor-2');
  const emptyView = deriveWorkExperience(emptyKernel);

  return {
    knowledgeVersion: EXPERIENCE_KNOWLEDGE_VERSION,
    phase: 'decision',
    simulationId: 'experience-village',
    actorId: 'actor-2',
    tick: 288,
    revision: 287,
    self,
    quote,
    observations,
    belief,
    profile,
    duty,
    planState,
    experience: emptyView,
    useWorkExperience: true,
    ...overrides,
  };
}

test('A1: experience-state 结构、默认配置与模型创建', () => {
  const cfg = { version: EXPERIENCE_CONFIG_VERSION, useWorkExperience: true };
  assert.equal(validateExperienceConfig(cfg), cfg);

  // 未知字段/版本拒绝
  assert.throws(() => validateExperienceConfig({ ...cfg, extra: 1 }), /Fields do not match schema/);
  assert.throws(() => validateExperienceConfig({ ...cfg, version: 'bad' }), (e) => e.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => validateExperienceConfig({ ...cfg, useWorkExperience: 'true' }), /Invalid useWorkExperience flag/);

  // getter 预检：不得执行访问器
  let getterCalls = 0;
  const badCfg = { version: EXPERIENCE_CONFIG_VERSION };
  Object.defineProperty(badCfg, 'useWorkExperience', {
    enumerable: true,
    get() { getterCalls++; return true; },
  });
  assert.throws(() => validateExperienceConfig(badCfg), /Sparse array or accessor element|Only enumerable data properties are supported/);
  assert.equal(getterCalls, 0, 'Getter must not execute during descriptor inspection');

  // 模型创建与校验
  const model = createExperienceModel('experience-village', cfg);
  assert.equal(model.version, 'experience-runtime-state-v1');
  assert.equal(model.actors.length, 2);
  assert.equal(model.actors[0].actorId, 'actor-2');
  assert.equal(model.actors[1].actorId, 'actor-3');
  assert.equal(model.cursor, 0);
  assert.equal(validateExperienceModel(model), model);
});

test('A1: E1 候选消费配对：空经历 vs penalty=100 配对 Work score 710→610，其余候选不变', () => {
  const kEmpty = baseKnowledge({ useWorkExperience: true });
  const planEmpty = planExperienceMotivationDecision(kEmpty);
  const workEmpty = planEmpty.decision.candidates.find((c) => c.action === 'WorkForPay');
  const useEmpty = planEmpty.decision.candidates.find((c) => c.action === 'UseMedicine');
  assert.equal(workEmpty.score, 710);
  assert.equal(workEmpty.support, 900);
  assert.equal(workEmpty.opposition, 190);
  assert.equal(useEmpty.score, 700);

  // 1次拒绝样本 -> penalty=100
  let kernel1 = createWorkExperienceState('experience-village', 'actor-2');
  kernel1 = observeWorkOutcome(kernel1, {
    simulationId: 'experience-village',
    actorId: 'actor-2',
    sourceEventSeq: 15,
    occurrenceTick: 288,
    decisionId: 'experience-day-2-actor-2',
    commandId: 'experience-day-2-actor-2',
    action: 'WorkForPay',
    status: 'rejected',
    code: 'RULE_REJECTED',
  }).state;
  const view1 = deriveWorkExperience(kernel1);
  assert.equal(view1.penaltyPermille, 100);

  const kPenalty = baseKnowledge({ experience: view1, useWorkExperience: true });
  const planPenalty = planExperienceMotivationDecision(kPenalty);
  const workPenalty = planPenalty.decision.candidates.find((c) => c.action === 'WorkForPay');
  const usePenalty = planPenalty.decision.candidates.find((c) => c.action === 'UseMedicine');

  // Work score: support(900) - (baseOpposition(190) + penalty(100)) = 900 - 290 = 610
  assert.equal(workPenalty.support, 900);
  assert.equal(workPenalty.opposition, 290);
  assert.equal(workPenalty.score, 610);
  assert.equal(usePenalty.score, 700);

  // 其余候选逐字段不变
  for (const action of ['UseMedicine', 'BuyMedicine', 'Rest', 'NoAction']) {
    const c1 = planEmpty.decision.candidates.find((c) => c.action === action);
    const c2 = planPenalty.decision.candidates.find((c) => c.action === action);
    assert.deepEqual(c1, c2, `Candidate ${action} must match exactly`);
  }

  // 开关 false 对照：Work 仍为 710
  const kOff = baseKnowledge({ experience: view1, useWorkExperience: false });
  const planOff = planExperienceMotivationDecision(kOff);
  const workOff = planOff.decision.candidates.find((c) => c.action === 'WorkForPay');
  assert.equal(workOff.score, 710);
  assert.equal(workOff.opposition, 190);
});

test('A1: E1 opposition 超过 1000 时不截断，可到达 1300', () => {
  // 3次失败 -> penalty=300
  let kernel3 = createWorkExperienceState('experience-village', 'actor-2');
  for (let i = 1; i <= 3; i++) {
    kernel3 = observeWorkOutcome(kernel3, {
      simulationId: 'experience-village',
      actorId: 'actor-2',
      sourceEventSeq: 10 + i,
      occurrenceTick: 288 + i * 144,
      decisionId: `experience-day-${i + 2}-actor-2`,
      commandId: `experience-day-${i + 2}-actor-2`,
      action: 'WorkForPay',
      status: 'rejected',
      code: 'RULE_REJECTED',
    }).state;
  }
  const view3 = deriveWorkExperience(kernel3);
  assert.equal(view3.penaltyPermille, 300);

  // 设定 strain=1000 (fatigue=700 <= 700, health=300 >= 300), riskAversion=1000 -> baseOpposition=1000 -> totalOpposition=1300
  const kMax = baseKnowledge({
    self: { ...baseKnowledge().self, health: 300, fatigue: 700 },
    profile: { dutyWeightPermille: 900, riskAversionPermille: 1000 },
    experience: view3,
    useWorkExperience: true,
  });
  const plan = planExperienceMotivationDecision(kMax);
  const work = plan.decision.candidates.find((c) => c.action === 'WorkForPay');
  assert.equal(work.opposition, 1300, 'Opposition must reach 1300 and not be clamped to 1000');
  assert.equal(work.score, 900 - 1300); // -400
});

test('A1: E1 soft-ineligible 候选保持 score=null, support=0, opposition=0', () => {
  // 当 duty 不存在时，WorkForPay 是 soft-ineligible
  const kNoDuty = baseKnowledge({ duty: null });
  const plan = planExperienceMotivationDecision(kNoDuty);
  const work = plan.decision.candidates.find((c) => c.action === 'WorkForPay');
  assert.equal(work.eligible, false);
  assert.equal(work.score, null);
  assert.equal(work.support, 0);
  assert.equal(work.opposition, 0);
  assert.equal(work.reasonCode, 'DUTY_UNAVAILABLE');
});

test('A1: decision 格式、id 前缀与 evidenceRefs 升序去重并集', () => {
  let kernel = createWorkExperienceState('experience-village', 'actor-2');
  kernel = observeWorkOutcome(kernel, {
    simulationId: 'experience-village',
    actorId: 'actor-2',
    sourceEventSeq: 20,
    occurrenceTick: 288,
    decisionId: 'experience-day-2-actor-2',
    commandId: 'experience-day-2-actor-2',
    action: 'WorkForPay',
    status: 'succeeded',
    code: null,
  }).state;
  const view = deriveWorkExperience(kernel);
  const k = baseKnowledge({ experience: view });
  const res = planExperienceMotivationDecision(k);

  assert.equal(res.decision.version, EXPERIENCE_DECISION_VERSION);
  assert.equal(res.decision.decisionId, 'experience-day-2-actor-2');
  assert.ok(res.decision.evidenceRefs.includes(20), 'Evidence refs must include experience sourceEventSeq');
  // 必须严格升序
  for (let i = 1; i < res.decision.evidenceRefs.length; i++) {
    assert.ok(res.decision.evidenceRefs[i] > res.decision.evidenceRefs[i - 1], 'Evidence refs must be strictly ascending');
  }
});
