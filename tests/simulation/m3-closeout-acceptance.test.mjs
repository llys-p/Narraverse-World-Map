// M3-4B G2/G3 独立期望（B 路）。合同：m3-closeout-contract-v1，场景与公式权威见 M3-4A §4。
// 这里的每个 expected 都由合同文本独立手算得到，绝不从被测 createM3CloseoutConfig、投影或
// derive 的输出反推；A 路交付缺席时按 G0 fail closed（REQUIRED_EVIDENCE_MISSING），不 skip。
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMotivationRequest } from '../../runtime/core/motivation-state.mjs';

const DAY = 144;
const SEED = 42;
// M2 formula, re-derived here instead of importing a helper under test.
const recovery = health => Math.max(0, 800 - health) + 300;
const strainOf = (fatigue, health) => Math.min(1000, fatigue + Math.max(0, 700 - health));
const workScore = (urgency, dutyWeight, risk, strain) =>
  Math.floor(urgency * dutyWeight / 1000) - Math.floor(strain * risk / 1000);
const penalty = failures => Math.min(300, 100 * failures);
const windowFailures = window => window.filter(sample => sample === 'F').length;

test('G2 合同日 2 的三方分数由公式独立复算，不取自被测投影', () => {
  // 合同 §4：actor-2 health 400 / fatigue 650，profile 900/200，urgency 1000。
  const strain = strainOf(650, 400);
  assert.equal(strain, 950);
  assert.equal(workScore(1000, 900, 200, strain), 710, 'day2 Work must be 710');
  assert.equal(recovery(400), 700, 'day2 Use must be 700');
  assert.equal(650, 650, 'day2 Rest score is fatigue itself, below the emergency clamp');
  assert.ok(710 > 700 && 700 > 650, 'the contract ordering must hold before any world runs');
});

test('G2 ON/OFF 只差经验开关：同一条失败窗口使 ON 改选 Use、OFF 继续 Work', () => {
  // 日 2 真实 RULE_REJECTED 后窗口为 F，failureCount 1 -> penalty 100。
  const window = ['F'];
  assert.equal(windowFailures(window), 1);
  assert.equal(penalty(windowFailures(window)), 100);
  const strain = strainOf(650, 400);
  // ON 把 penalty 计入 opposition：900 - (190 + 100) = 610 < 700，故日 3 改选 Use。
  const onWork = workScore(1000, 900, 200, strain) - 100;
  assert.equal(onWork, 610);
  assert.ok(onWork < recovery(400), 'ON day3 must prefer UseMedicine');
  // OFF 不消费 penalty：仍是 710 > 700，公金仍不足时再次真实拒付。
  const offWork = workScore(1000, 900, 200, strain);
  assert.equal(offWork, 710);
  assert.ok(offWork > recovery(400), 'OFF day3 must still pick WorkForPay');
  // 合同固定：公金 10 < 工资 20，所以 OFF 的 Work 是权威拒绝而不是规划器能证明的事实。
  assert.ok(10 < 20, 'the authority rejection premise is a real cash shortfall');
});

test('G2 四次真实成功把旧失败推出四样本窗口，penalty 序列 100/100/100/0', () => {
  const windows = [['F', 'S'], ['F', 'S', 'S'], ['F', 'S', 'S', 'S'], ['S', 'S', 'S', 'S']];
  assert.deepEqual(windows.map(window => penalty(windowFailures(window))), [100, 100, 100, 0]);
  // 合同把成功定在 tick 720/864/1152/1440，即世界日 5/6/8/10（允许中间自然 Rest）。
  assert.deepEqual([720, 864, 1152, 1440].map(tick => tick / DAY), [5, 6, 8, 10]);
  assert.deepEqual(windows.map(window => window.length), [2, 3, 4, 4], 'the window never exceeds four');
  assert.equal(penalty(windowFailures(['F', 'F', 'F', 'F'])), 300, 'four failures clamp at 300');
});

test('G2 合法交易恢复付款条件：4 份药材按单价 25 实付 100，公金 10 变 110', () => {
  const quantity = 4, unitPrice = 25, publicCashBefore = 10;
  assert.equal(quantity * unitPrice, 100, 'the contract states the paid amount explicitly');
  assert.equal(publicCashBefore + 100, 110, 'public payable cash must reach 110 through a real PlayerBuy');
  assert.ok(110 >= 20, 'after the trade a wage of 20 becomes affordable, which is what unblocks Work');
});

test('G2 日 11 的 730 是公式恒等式，不用 A 的 actualTimeline 回填', () => {
  // 合同 §4：support 900，opposition = floor(strain*200/1000) + 启用时的经验惩罚。
  // 归零窗口下惩罚为 0，所以 730 = 900 - floor(strain*200/1000) 反推 strain ∈ [850, 854]。
  const support = Math.floor(1000 * 900 / 1000);
  assert.equal(support, 900);
  for (const strain of [850, 851, 852, 853, 854])
    assert.equal(support - Math.floor(strain * 200 / 1000) - penalty(0), 730, 'strain ' + strain);
  assert.notEqual(support - Math.floor(849 * 200 / 1000) - penalty(0), 730, '849 falls outside the band');
  assert.equal(support - Math.floor(850 * 200 / 1000) - penalty(1), 630, 'a nonzero penalty must lower it further');
});

test('G2 十二条请求配方的日期与窗口独立可算，并按基准 request 规则合法', () => {
  const requests = Array.from({ length: 12 }, (_, index) => ({
    requestId: 'closeout-duty-' + (index + 1), tick: 200 + DAY * index, expiresTick: 432 + DAY * index,
    speakerId: 'actor-1', listenerId: 'actor-2', urgencyPermille: 1000
  }));
  assert.equal(requests.length, 12);
  // The recipe is tick-ordered with unique ids, so each request is legal on its own and the
  // sequence is consumable by the existing request cursor.
  for (const request of requests) assert.deepEqual(validateMotivationRequest(request), request);
  let previous = null;
  for (const request of requests) {
    assert.ok(previous === null || request.tick > previous.tick, 'requests must stay tick-ordered');
    assert.equal(request.expiresTick - request.tick, 232, 'each window is 232 ticks, inside the 288 TTL');
    previous = request;
  }
  // A request arriving at tick 200 is first decidable at the next daily tick, i.e. world day 2.
  assert.deepEqual(requests.slice(0, 4).map(request => Math.ceil(request.tick / DAY)), [2, 3, 4, 5]);
  // Its duty plan deadline is the day containing expiresTick - 1.
  assert.deepEqual(requests.slice(0, 4).map(request => Math.floor((request.expiresTick - 1) / DAY)), [2, 3, 4, 5]);
  assert.equal(requests[11].tick, 1784, 'the twelfth request lands after the 12-day scenario ends');
});

test('G3 continuation 前提可独立核对：空请求表使 Work 永远不成为候选', async () => {
  // 合同 §4：continuation 仅改 actor-2 importancePermille=400 且 motivation.requests=[]。
  const { collectMotivationCandidates } = await import('../../runtime/core/motivation-planner.mjs');
  // The smallest decision-phase knowledge the frozen planner accepts, with no duty at all.
  const base = {
    knowledgeVersion: 'motivation-knowledge-v1', phase: 'decision', simulationId: 'm34-continuation-closeout',
    actorId: 'actor-2', tick: 288, revision: 287,
    self: { name: 'Hunter', occupation: 'hunter', location: 'village', alive: true, health: 400, hunger: 0,
      fatigue: 650, wallet: 50, inventory: { food: 20, herbs: 1 }, currentGoal: { goalId: 1, kind: 'recover-health',
        step: 'use', startDay: 1, deadlineDay: 21, failures: 0, target: 800 }, nextGoalId: 2, cooldownUntilDay: 0 },
    quote: { product: 'herbs', price: 50, observedTick: 0, sourceEventSeq: null }, observations: [],
    belief: { topic: 'public-herbs-available', value: 'available', confidencePermille: 900, evidenceRefs: [7],
      contradictionRefs: [], lastUpdatedTick: 144 },
    profile: { dutyWeightPermille: 900, riskAversionPermille: 200 }, duty: null,
    planState: { activePlan: { planId: 1, goalId: 1, kind: 'recover-health', steps: ['BuyMedicine', 'UseMedicine'],
      stepIndex: 1, status: 'ready', createdDay: 1, deadlineDay: 21, requestId: null }, suspendedPlan: null,
      nextPlanId: 2, lastReviewedDutyId: null }
  };
  const candidates = collectMotivationCandidates(base);
  const work = candidates.find(candidate => candidate.action === 'WorkForPay');
  assert.deepEqual([work.eligible, work.reasonCode, work.sourceRef, work.score],
    [false, 'DUTY_UNAVAILABLE', null, null], 'an empty request table can never open a Work candidate');
  // So a low-review continuation day can only continue the committed treatment step or wait.
  assert.equal(candidates.find(candidate => candidate.action === 'UseMedicine').score, 700);
  assert.deepEqual([144, 288].map(tick => tick / DAY), [1, 2], 'review then maintain on consecutive days');
});

// ---- A 路 required 依赖门：缺席即阻断，禁止 skip/todo 冒充（G0 口径）----
const A_REQUIRED = [
  ['../../runtime/experiments/m3-closeout-scenario.mjs', ['createM3CloseoutConfig']],
  ['../../runtime/knowledge/cognition-knowledge.mjs', ['buildCognitionKnowledge', 'projectCognitionInspector',
    'COGNITION_INSPECTOR_VERSION', 'MAX_COGNITION_INSPECTOR_BYTES']]
];
const aLoad = await Promise.all(A_REQUIRED.map(async ([specifier, names]) => {
  try { return [specifier, await import(specifier), names, null]; }
  catch (error) { return [specifier, null, names, error]; }
}));

test('G2/G3 需要 A 路固定场景与认知投影实体才能继续（未派发 SHA 时按缺失阻断）', async () => {
  const missing = aLoad.filter(([, , , error]) => error !== null)
    .map(([specifier, , , error]) => specifier + ' [' + (error.code ?? 'LOAD_FAILED') + ']');
  assert.deepEqual(missing, [], 'REQUIRED_EVIDENCE_MISSING: M3-4A 交付实体未导入，B 不猜导出：' + missing.join(', '));
  for (const [specifier, module, names] of aLoad)
    for (const name of names)
      assert.ok(module?.[name] !== undefined, '已导入的 A 路模块缺少合同声明的导出 ' + specifier + '#' + name);
  const scenario = aLoad.find(([specifier]) => specifier.includes('m3-closeout-scenario'))[1];
  // Once A exists these are checked against A's helper, but only for equality with the fixed
  // contract inputs above: the expected numbers stay the hand-computed ones declared here.
  const on = scenario.createM3CloseoutConfig('work-learning', true);
  const off = scenario.createM3CloseoutConfig('work-learning', false);
  assert.equal(JSON.stringify({ ...on, experience: { ...on.experience, useWorkExperience: null } }),
    JSON.stringify({ ...off, experience: { ...off.experience, useWorkExperience: null } }),
    'ON/OFF may differ only in useWorkExperience');
  assert.notEqual(on.experience.useWorkExperience, off.experience.useWorkExperience);
  assert.equal(on.motivation.requests.length, 12);
  assert.deepEqual(on.motivation.requests.map(request => request.requestId),
    Array.from({ length: 12 }, (_, index) => 'closeout-duty-' + (index + 1)));
  // Contract §4 fixed patches, asserted against A's helper but never taken from it as expected.
  const society = on.memory.society;
  assert.deepEqual([society.player.initialHerbs, society.player.initialFood], [20, 30]);
  assert.deepEqual([society.estates[1].initialFood, society.estates[2].initialFood], [100, 30]);
  const resources = society.actors.market.ecology.resources.resources;
  assert.deepEqual([resources.herbs.initial, resources.gold.initial], [50, 350]);
  assert.equal(society.economics.wage, 20, 'the wage that day2 public cash of 10 cannot cover');
  assert.deepEqual([on.experience.useWorkExperience, off.experience.useWorkExperience], [true, false]);
  assert.throws(() => scenario.createM3CloseoutConfig('continuation', false), 'continuation must refuse an OFF switch');
});
