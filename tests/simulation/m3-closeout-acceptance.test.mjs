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

// ---- G2 真实链：服务主链 + 独立离线直跑 + 重开与无重启控制链 ----
// 输入序列完全按合同 §4 的顺序与命令 ID；expected 全部来自上面那张手算表。
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { createCognitionVillage, cognitionSystems } from '../../runtime/fixtures/cognition-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { executeCognitionPlayerIntent } from '../../runtime/core/motivation-runtime.mjs';
import { projectCognitionInspector } from '../../runtime/knowledge/cognition-knowledge.mjs';
import { COGNITION_RULES } from '../../runtime/service/http-contract.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createM3CloseoutConfig } from '../../runtime/experiments/m3-closeout-scenario.mjs';
import { deriveWorkExperience } from '../../runtime/core/work-experience.mjs';

// Only the contract's asserted breakpoints need a full projection read; every DTO is still
// submitted and receipt-checked, and the final projection is always taken separately.
const CAPTURE = new Set(['closeout-advance-288', 'closeout-advance-432', 'closeout-advance-720',
  'closeout-advance-864', 'closeout-advance-1152', 'closeout-advance-1440', 'closeout-advance-1584',
  'closeout-advance-1728']);
const SIMULATION_ID = 'm34-experience-closeout';
// Hand-computed from the contract text above; never taken from the code under test.
const HAND_COMPUTED = {
  day2: { work: 710, use: 700, penalty: 100 },
  day3On: { work: 610, choice: 'UseMedicine' },
  day3Off: { work: 710, choice: 'WorkForPay' },
  windows: [['F', 'S'], ['F', 'S', 'S'], ['F', 'S', 'S', 'S'], ['S', 'S', 'S', 'S']],
  penalties: [100, 100, 100, 0],
  day11: { work: 730, penalty: 0 }
};
const RECIPE = [
  ['closeout-advance-144', 'time', 144], ['closeout-sell-seven', 'sell', 7],
  ['closeout-advance-288', 'time', 143], ['closeout-advance-432', 'time', 144],
  ['closeout-buy-four', 'buy', 4], ['closeout-advance-576', 'time', 143],
  ['closeout-advance-720', 'time', 144], ['closeout-advance-864', 'time', 144],
  ['closeout-advance-1008', 'time', 144], ['closeout-advance-1152', 'time', 144],
  ['closeout-advance-1296', 'time', 144], ['closeout-advance-1440', 'time', 144],
  ['closeout-advance-1584', 'time', 144], ['closeout-advance-1728', 'time', 144]
];
const dtoFor = (commandId, kind, amount, revision) => kind === 'time'
  ? { version: 1, commandId, expectedRevision: revision, type: 'AdvanceTime', payload: { ticks: amount } }
  : { version: 2, commandId, expectedRevision: revision, type: kind === 'sell' ? 'PlayerSell' : 'PlayerBuy',
    payload: { product: 'herbs', quantity: amount } };
const letters = state => state.samples.map(sample => sample.status === 'rejected' ? 'F' : 'S');
const actorOf = projection => projection.actors.find(actor => actor.knowledge.actorId === 'actor-2');
async function tempDir(t, prefix, keep = false) {
  const base = path.join(os.tmpdir(), prefix);
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(base + path.sep);
  // The resumable ON chain must survive to the next step, so its directory is kept on purpose and
  // reported as leftover evidence instead of being deleted behind the continuation's back.
  if (!keep) t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function checkpointFor(t, useWorkExperience, { keep = false } = {}) {
  const root = await tempDir(t, 'world-m34b-g2-', keep);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const bundle = createCognitionVillage(SEED, SIMULATION_ID,
    createM3CloseoutConfig('work-learning', useWorkExperience)).bundle;
  await saveCheckpoint(bundle, { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  return { runtime, checkpoint: path.join(source, 'checkpoint-r0.json'), root };
}
// The service chain reads the real /api/runtime/minds projection after every commit.
function runOfflineChain(useWorkExperience) {
  let bundle = createCognitionVillage(SEED, SIMULATION_ID,
    createM3CloseoutConfig('work-learning', useWorkExperience)).bundle;
  const advance = ticks => {
    const session = createSimulationSession(bundle, cognitionSystems());
    session.advanceTicks(ticks);
    bundle = session.getBundle();
  };
  const commits = [];
  for (const [commandId, kind, amount] of RECIPE) {
    if (kind === 'time') advance(amount);
    else {
      const before = bundle.snapshot.tick;
      const result = executeCognitionPlayerIntent(bundle, { commandId,
        type: kind === 'sell' ? 'PlayerSell' : 'PlayerBuy', payload: { product: 'herbs', quantity: amount } });
      bundle = result.bundle;
      // Measured on this baseline: the intent call already commits the trade and spends its own
      // ticks, so advancing again would overshoot the contract sequence by one tick per trade.
      assert.equal(bundle.snapshot.tick, before + result.durationTicks,
        commandId + ' must land exactly its stated duration');
      assert.equal(bundle.snapshot.pendingCommands.length, 0, commandId + ' must be fully committed');
    }
    commits.push({ commandId, minds: CAPTURE.has(commandId) ? projectCognitionInspector(bundle) : null });
  }
  return { bundle, commits, tick: bundle.snapshot.tick, revision: bundle.snapshot.revision };
}

// Each commit replays the whole journal, so one 14-DTO chain cannot fit a single foreground run.
// The chain is therefore resumable through an evidence file: a step submits a prefix, records its
// real projection bytes, and the next step reopens the same service directory and continues.
const EVIDENCE = process.env.M34B_EVIDENCE || path.join(os.tmpdir(), 'm34b-g2-evidence.json');
const readEvidence = async () => {
  try { return JSON.parse(await fs.readFile(EVIDENCE, 'utf8')); }
  catch { return {}; }
};
const writeEvidence = async patch => {
  const merged = { ...await readEvidence(), ...structuredClone(patch) };
  // canonicalJson fails closed on undefined, so a step only writes the keys it actually holds.
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  await fs.writeFile(EVIDENCE, canonicalJson(merged));
  return merged;
};
// Submits RECIPE[from,to) against an existing directory, reopening it like any other client.
async function submitRange(t, label, from, to) {
  const evidence = await readEvidence();
  const directory = evidence.directory;
  assert.ok(typeof directory === 'string' && directory.length > 0,
    'REQUIRED_EVIDENCE_MISSING: ' + label + ' needs the earlier chain step to have recorded its directory');
  // The first range must create the world from the recorded checkpoint; a later range reopens the
  // existing directory, which is the restart path itself. Opening neither way would silently fall
  // back to a default profile that does not support player actions.
  const options = from === 0 ? { directory, checkpoint: evidence.checkpoint } : { directory };
  let server = await startRuntimeServer({ ...options, port: 0, writable: true, inspectMind: true });
  t.after(() => server.close());
  if (from > 0) {
    const carried = evidence.prefixSnapshot;
    assert.deepEqual(await (await fetch(server.url + '/api/runtime/snapshot')).json(), carried,
      label + ' must reopen on the exact world the previous step committed');
  }
  const captured = {};
  for (const index of Array.from({ length: to - from }, (_, offset) => from + offset)) {
    const [commandId, kind, amount] = RECIPE[index];
    const revision = (await (await fetch(server.url + '/api/runtime/snapshot')).json()).revision;
    const response = await fetch(server.url + '/api/runtime/commands', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dtoFor(commandId, kind, amount, revision)) });
    const receipt = await response.json().catch(() => null);
    assert.equal(response.status, 200, commandId + ' refused: ' + JSON.stringify(receipt));
    assert.equal(receipt.toRevision, revision + (kind === 'time' ? amount : 1), commandId + ' landed tick');
    if (CAPTURE.has(commandId)) captured[commandId] = { receipt,
      minds: await (await fetch(server.url + '/api/runtime/minds')).json() };
  }
  const snapshot = await (await fetch(server.url + '/api/runtime/snapshot')).json();
  await writeEvidence({ ...captured, prefixSnapshot: snapshot,
    submittedThrough: to, finalSnapshot: to === RECIPE.length ? snapshot : evidence.finalSnapshot });
  return { captured, snapshot };
}

test('G2 ON 链前段：日2 真实拒付、日3 改选用药，并登记可续跑目录', async t => {
  const seed = await checkpointFor(t, true, { keep: true });
  await writeEvidence({ directory: seed.runtime, checkpoint: seed.checkpoint });
  const { captured } = await submitRange(t, 'ON 前段', 0, 4);
  const day2 = actorOf(captured['closeout-advance-288'].minds);
  assert.equal(day2.lastDecision.tick, 288);
  assert.deepEqual([day2.lastDecision.choice, day2.lastDecision.gateReason], ['WorkForPay', 'NEW_MAJOR_DUTY']);
  assert.equal(day2.lastDecision.candidates.find(c => c.action === 'WorkForPay').score, HAND_COMPUTED.day2.work);
  assert.equal(day2.lastDecision.candidates.find(c => c.action === 'UseMedicine').score, HAND_COMPUTED.day2.use);
  assert.deepEqual([day2.lastOutcome.status, day2.lastOutcome.code], ['rejected', 'RULE_REJECTED'],
    'day 2 Work is refused by the authority because the trade drained the payable wage');
  assert.deepEqual([day2.lastOutcome.delta.wallet, day2.lastOutcome.publicFoodProduced, day2.lastOutcome.price],
    [0, 0, null], 'a rejected work pays nothing and books nothing');
  assert.deepEqual(letters(day2.workExperience.state), ['F']);
  assert.equal(day2.workExperience.view.penaltyPermille, HAND_COMPUTED.day2.penalty);
  const day3 = actorOf(captured['closeout-advance-432'].minds);
  assert.equal(day3.lastDecision.candidates.find(c => c.action === 'WorkForPay').score, HAND_COMPUTED.day3On.work,
    'the stored failure raises opposition by exactly 100 permille');
  assert.equal(day3.lastDecision.choice, HAND_COMPUTED.day3On.choice);
  assert.deepEqual(letters(day3.workExperience.state), ['F'], 'using medicine is not a Work sample');
  assert.equal((await fs.readdir(seed.runtime)).filter(name => name.endsWith('.json')).length, 5,
    'the initial commit plus four DTOs at this point');
});

test('G2 ON 链后段：重开同一目录续跑，四次真成功把窗口推回全成功', async t => {
  const existing = await readEvidence();
  assert.ok(existing.prefixSnapshot,
    'REQUIRED_EVIDENCE_MISSING: the ON prefix step must run before the continuation step');
  const { captured, snapshot } = await submitRange(t, 'ON 后段', 4, RECIPE.length);
  assert.equal(snapshot.tick, 1728);
  const files = (await fs.readdir(existing.directory)).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 15, 'fourteen business DTOs plus the initial commit make fifteen service files');
  const successCommands = ['closeout-advance-720', 'closeout-advance-864', 'closeout-advance-1152', 'closeout-advance-1440'];
  for (const [index, commandId] of successCommands.entries()) {
    assert.ok(captured[commandId], 'the breakpoint ' + commandId + ' must have been captured');
    const actor = actorOf(captured[commandId].minds);
    assert.deepEqual(letters(actor.workExperience.state), HAND_COMPUTED.windows[index], commandId + ' window');
    assert.equal(actor.workExperience.view.penaltyPermille, HAND_COMPUTED.penalties[index], commandId + ' penalty');
    assert.deepEqual([actor.lastOutcome.status, actor.lastOutcome.code], ['succeeded', null], commandId + ' outcome');
    assert.equal(actor.lastOutcome.delta.wallet, 20, commandId + ' pays the fixed wage of 20');
    assert.equal(actor.lastOutcome.publicFoodProduced, 8, commandId + ' books the communal production of 8');
    assert.equal(actor.lastOutcome.failureOwner, null, commandId + ' succeeded so it owns no failure');
    assert.deepEqual([actor.lastDecision.choice, actor.lastDecision.apparentAction], ['WorkForPay', 'WorkForPay']);
    assert.equal(actor.lastDecision.tick / DAY, [5, 6, 8, 10][index], commandId + ' lands on the contract day');
  }
  // day 11: the zero-penalty window still leaves a strong Work candidate.
  const day11 = actorOf(captured['closeout-advance-1584'].minds);
  assert.equal(day11.workExperience.view.penaltyPermille, HAND_COMPUTED.day11.penalty);
  assert.equal(day11.lastDecision.candidates.find(c => c.action === 'WorkForPay').score, HAND_COMPUTED.day11.work);
  // The final window holds four successes, and the served view equals the frozen kernel.
  const finalActor = actorOf(captured['closeout-advance-1728'].minds);
  assert.equal(finalActor.workExperience.view.sampleCount, 4, 'the window holds exactly four samples');
  assert.deepEqual(deriveWorkExperience(finalActor.workExperience.state), finalActor.workExperience.view,
    'the served view equals the frozen kernel derivation of the same state');
  assert.deepEqual(finalActor.workExperience.view.evidenceRefs,
    finalActor.workExperience.state.samples.map(sample => sample.sourceEventSeq), 'view evidence matches the samples');
  assert.equal(finalActor.workExperience.view.penaltyPermille, 0, 'the oldest failure has left the window');
  await writeEvidence({ finalMinds: captured['closeout-advance-1728'].minds, finalSnapshot: snapshot });
});

test('G2 OFF 对照链：同输入只换开关，日3 仍是 710 并再次被权威拒绝', async t => {
  const seed = await checkpointFor(t, false);
  const server = await startRuntimeServer({ directory: seed.runtime, checkpoint: seed.checkpoint,
    port: 0, writable: true, inspectMind: true });
  t.after(() => server.close());
  for (const index of [0, 1, 2, 3]) {
    const [commandId, kind, amount] = RECIPE[index];
    const revision = (await (await fetch(server.url + '/api/runtime/snapshot')).json()).revision;
    const response = await fetch(server.url + '/api/runtime/commands', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dtoFor(commandId, kind, amount, revision)) });
    assert.equal(response.status, 200, commandId + ' refused: ' + JSON.stringify(await response.json().catch(() => null)));
  }
  const actor = actorOf(await (await fetch(server.url + '/api/runtime/minds')).json());
  assert.deepEqual([actor.lastDecision.tick, actor.lastDecision.choice], [432, 'WorkForPay'],
    'OFF keeps working on day 3 because the penalty is never consumed');
  assert.equal(actor.lastDecision.candidates.find(c => c.action === 'WorkForPay').score, HAND_COMPUTED.day3Off.work);
  assert.deepEqual([actor.lastOutcome.status, actor.lastOutcome.code], ['rejected', 'RULE_REJECTED']);
  assert.deepEqual(letters(actor.workExperience.state), ['F', 'F'],
    'OFF keeps working on day 3, so a second real rejection is recorded');
  assert.equal(actor.workExperience.view.penaltyPermille, 200,
    'OFF still accumulates the recorded penalty of two failures');
  assert.equal(actor.lastDecision.candidates.find(c => c.action === 'WorkForPay').score, HAND_COMPUTED.day3Off.work,
    'and still spends none of it on scoring');
});

test('G2 独立离线直跑链复现服务结果，并核每样本的权威因果链', async () => {
  const evidence = await readEvidence();
  assert.ok(evidence.finalMinds,
    'REQUIRED_EVIDENCE_MISSING: the ON continuation step must have recorded its final projection');
  const offline = runOfflineChain(true);
  assert.deepEqual([offline.tick, offline.revision], [1728, 1728], 'the direct chain ends on the same tick');
  assert.equal(canonicalJson(projectCognitionInspector(offline.bundle)), canonicalJson(evidence.finalMinds),
    'the independent direct run reproduces the service projection byte for byte');
  const log = offline.bundle.eventLog;
  const bySeq = new Map(log.map(event => [event.eventSeq, event]));
  const actor = actorOf(projectCognitionInspector(offline.bundle));
  assert.equal(actor.workExperience.state.samples.length, 4);
  for (const sample of actor.workExperience.state.samples) {
    assert.equal(sample.actorId, 'actor-2', 'samples belong to this actor only');
    assert.equal(sample.action, 'WorkForPay', 'only WorkForPay results are stored');
    assert.equal(sample.commandId, sample.decisionId, 'the wage command is the decision command');
    const resolved = bySeq.get(sample.sourceEventSeq);
    assert.equal(resolved?.type, 'MotivationDecisionResolved', 'the sample cites its resolved decision event');
    assert.equal(resolved.payload.decisionId, sample.decisionId, 'the resolved event is the same decision');
    assert.equal(resolved.payload.status, sample.status, 'the sample status comes from the authority outcome');
    const planned = log.find(event => event.type === 'MotivationDecisionPlanned'
      && event.payload.decisionId === sample.decisionId);
    assert.ok(planned, 'the decision was planned before it resolved');
    const committed = log.find(event => event.type === 'SocietyActionCommitted' && event.commandId === sample.commandId);
    assert.ok(committed, 'a real authority command carries the receipt for ' + sample.commandId);
    const observed = log.find(event => event.type === 'ExperienceWorkObserved' && event.payload?.actorId === 'actor-2'
      && (event.causationEventSeqs ?? []).includes(sample.sourceEventSeq));
    assert.ok(observed, 'the observation event links back to the resolved event');
    assert.ok(planned.eventSeq < resolved.eventSeq && resolved.eventSeq < observed.eventSeq,
      'planned -> committed -> resolved -> observed keeps one direction');
  }
});


// ---- G3 低频延续：day144 真评审买药 -> 同目录优雅关闭重开 -> day288 maintain 用药 ----
async function runContinuationChain(t) {
  const root = await tempDir(t, 'world-m34b-g3-');
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const bundle = createCognitionVillage(SEED, 'm34-continuation-closeout', createM3CloseoutConfig('continuation')).bundle;
  await saveCheckpoint(bundle, { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  const checkpoint = path.join(source, 'checkpoint-r0.json');
  let server = await startRuntimeServer({ directory: runtime, checkpoint, port: 0, writable: true, inspectMind: true });
  t.after(() => server.close());
  const submit = async commandId => {
    const revision = (await (await fetch(server.url + '/api/runtime/snapshot')).json()).revision;
    const response = await fetch(server.url + '/api/runtime/commands', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dtoFor(commandId, 'time', 144, revision)) });
    assert.equal(response.status, 200, commandId + ' refused: ' + JSON.stringify(await response.json().catch(() => null)));
    return (await fetch(server.url + '/api/runtime/minds')).json();
  };
  const day1 = await submit('closeout-continuation-144');
  await server.close();
  server = await startRuntimeServer({ directory: runtime, port: 0, writable: true, inspectMind: true });
  t.after(() => server.close());
  const resumedRevision = (await (await fetch(server.url + '/api/runtime/snapshot')).json()).revision;
  const day2 = await submit('closeout-continuation-288');
  return { day1, day2, resumedRevision, files: (await fs.readdir(runtime)).filter(name => name.endsWith('.json')) };
}

test('G3 低频延续：跨重启保持同一 Goal/Plan 与旧评审锚点，maintain 不造候选', async t => {
  const chain = await runContinuationChain(t);
  const first = actorOf(chain.day1), second = actorOf(chain.day2);
  assert.equal(first.lastDecision.tick, 144);
  assert.equal(first.cognition.reviewState.lastEvaluation.decision.mode, 'review', 'day1 is a real review');
  assert.equal(first.lastDecision.choice, 'BuyMedicine', 'the reviewed actor buys medicine');
  assert.ok(first.knowledge.planState.activePlan !== null, 'the review created a committed plan');
  const planId = first.knowledge.planState.activePlan.planId, goalId = first.knowledge.planState.activePlan.goalId;
  const nextPlanId = first.knowledge.planState.nextPlanId, nextGoalId = first.knowledge.nextGoalId;
  assert.equal(chain.resumedRevision, 144, 'reopen restores the day-1 revision');
  // Second day: maintain mode, the same identities, and a fresh command id.
  assert.equal(second.lastDecision.tick, 288);
  assert.equal(second.cognition.reviewState.lastEvaluation.decision.mode, 'maintain', 'day2 runs in maintain mode');
  assert.deepEqual(second.lastDecision.candidates, [], 'a maintain day compares no candidates at all');
  assert.equal(second.lastDecision.choice, 'UseMedicine', 'the committed step still executes');
  // Contract §G3: same goal and plan identities across the restart. The day-2 use completes the
  // plan, and a completed plan is never carried across a tick, so only the decision keeps binding
  // the original identifiers while the long-term goal survives.
  assert.equal(second.lastDecision.planId, planId, 'the maintained step binds the day-1 plan id');
  assert.equal(second.lastDecision.goalId, goalId, 'and the day-1 health goal id');
  assert.equal(second.knowledge.self.currentGoal?.goalId, goalId, 'the long-term goal survives the restart');
  assert.equal(second.knowledge.planState.activePlan, null,
    'a completed plan must not persist into the next committed state');
  // The maintain path reviewed nothing new, so the old review anchors stay exactly where they were.
  assert.equal(second.cognition.lastReviewDecisionId, first.cognition.lastReviewDecisionId,
    'the last review anchor must not move on a maintained day');
  assert.equal(second.cognition.lastReviewEventSeq, first.cognition.lastReviewEventSeq,
    'the last review event anchor must not move on a maintained day');
  assert.match(second.lastDecision.decisionId, /^cognition-day-2-actor-2$/,
    'the cognition profile owns the cognition-day namespace for its daily decision');
  assert.notEqual(second.lastDecision.decisionId, first.lastDecision.decisionId, 'day2 issues a new command');
  // No extra goal or plan identifiers were invented across the restart.
  assert.equal(second.knowledge.planState.nextPlanId, nextPlanId, 'nextPlanId must not grow on a maintained step');
  assert.equal(second.knowledge.nextGoalId, nextGoalId, 'nextGoalId must not grow across the restart');
  // The authority really treated the actor: one herb out, health up by a hundred.
  assert.deepEqual([second.lastOutcome.status, second.lastOutcome.delta.herbs, second.lastOutcome.delta.health],
    ['succeeded', -1, 100], 'the day-2 use is a real succeeded outcome');
  // Low importance means no chief request exists, so nothing may enter the Work window.
  assert.equal(second.knowledge.duty, null, 'the continuation scenario has no request');
  assert.deepEqual(letters(second.workExperience.state), [], 'a Use step is never a Work sample');
  assert.equal(second.workExperience.view.penaltyPermille, 0);
  // Readout placement: experience and cognition are developer readings outside knowledge.
  for (const key of ['workExperience', 'cognition'])
    assert.equal(Object.hasOwn(second.knowledge, key), false, key + ' must not leak into decision input');
  assert.equal(second.counterfactual, null, 'the cognition inspector carries no counterfactual');
  assert.equal(chain.files.length, 3, 'initial plus two advance DTOs for this short chain');
});

test('G3 读数语义：当时经验取自冻结指纹，与当前窗口分列', async t => {
  const chain = await runContinuationChain(t);
  const second = actorOf(chain.day2);
  const frozen = JSON.parse(second.lastDecision.knowledgeFingerprint);
  assert.equal(frozen.phase, 'decision', 'the frozen fingerprint is the decision-phase knowledge text');
  assert.equal(Object.hasOwn(frozen, 'workExperience'), false,
    'the decision-phase knowledge never carries the developer reading inside itself');
  assert.deepEqual(letters(second.workExperience.state), [], 'the current window is reported separately');
  // The served knowledge is the committed own-person projection, and its identity is intact.
  assert.deepEqual([frozen.actorId, frozen.knowledgeVersion], ['actor-2', 'cognition-knowledge-v1']);
  assert.ok(canonicalJson(second.lastDecision.knowledgeFingerprint).length > 100, 'the fingerprint is the text itself');
});

test('G2 纯推进不是合同反例：省略两笔交易就不会出现日2 拒付', async () => {
  // Same seed and config, but no PlayerSell: the public purse can still pay, so the rejection
  // premise disappears. This is why the recipe must keep Sell7@144 and Buy4 after 432.
  let bundle = createCognitionVillage(SEED, 'm34-pure-advance-control',
    createM3CloseoutConfig('work-learning', true)).bundle;
  const session = createSimulationSession(bundle, cognitionSystems());
  session.advanceTicks(288);
  bundle = session.getBundle();
  const actor = projectCognitionInspector(bundle).actors.find(entry => entry.knowledge.actorId === 'actor-2');
  assert.notEqual(actor.lastOutcome.status, 'rejected',
    'without the trade the wage remains affordable, so a pure advance proves nothing about learning');
  // A successful Work is also a sample: the contrast is S with no rejection, not an empty window.
  assert.deepEqual(letters(actor.workExperience.state), ['S'],
    'pure advance records a success at day 2 where the contract recipe records a rejection');
  assert.equal(actor.workExperience.view.failureCount, 0);
  assert.equal(actor.workExperience.view.penaltyPermille, 0);
});

const A_REQUIRED = [
  ['../../runtime/experiments/m3-closeout-scenario.mjs', ['createM3CloseoutConfig']],
  ['../../runtime/knowledge/cognition-knowledge.mjs', ['buildCognitionKnowledge', 'projectCognitionInspector']]
];
const aLoad = await Promise.all(A_REQUIRED.map(async ([specifier, names]) => {
  try { return [specifier, await import(specifier), names, null]; }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === new URL(specifier, import.meta.url).href)
      return [specifier, null, names, error];
    throw error; // SyntaxError、传递缺失或初始化异常保留原始原因，不能洗成 A 未交付。
  }
}));

test('G2/G3 需要 A 路固定场景与认知投影实体才能继续（未派发 SHA 时按缺失阻断）', async () => {
  const missing = aLoad.filter(([, , , error]) => error !== null)
    .map(([specifier, , , error]) => specifier + ' [' + (error.code ?? 'LOAD_FAILED') + ']');
  assert.deepEqual(missing, [], 'REQUIRED_EVIDENCE_MISSING: M3-4A 交付实体未导入，B 不猜导出：' + missing.join(', '));
  for (const [specifier, module, names] of aLoad)
    for (const name of names)
      assert.equal(typeof module[name], 'function', '已导入的 A 路模块导出类型错误 ' + specifier + '#' + name);
  const knowledge = aLoad.find(([specifier]) => specifier.includes('cognition-knowledge'))[1];
  assert.equal(knowledge.COGNITION_INSPECTOR_VERSION, 'cognition-inspector-v1', '认知检查器版本必须符合合同');
  assert.equal(knowledge.MAX_COGNITION_INSPECTOR_BYTES, 131072, '认知检查器字节预算必须符合合同');
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
