// M3-4A contract §3: the cognition reading of the shared mind inspector page. Same fake-DOM +
// vm harness as the motivation inspector tests: the real runtime-mind.mjs runs against hand
// built DTO readings (simulationId carries the -mock marker; these fixtures are display data,
// never served by any production route). The page must render the DTO verbatim, keep M1/M2
// behaviour unchanged and never borrow candidates or counterfactuals.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import vm from 'node:vm';
import { canonicalJson } from '../runtime/core/data-contract.mjs';

const MIND_JS = new URL('../runtime-mind.mjs', import.meta.url);
const MIND_HTML = new URL('../runtime-mind.html', import.meta.url);
const MOCK_SIM = 'cognition-village-mock';

const experienceView = (actorId, over = {}) => ({ version: 'work-experience-view-v1', simulationId: MOCK_SIM, actorId,
  topic: 'work-for-pay-execution', sampleCount: over.sampleCount ?? 0, failureCount: over.failureCount ?? 0,
  penaltyPermille: over.penaltyPermille ?? 0, evidenceRefs: over.evidenceRefs ?? [] });
const sample = (seq, tick, status, actorId = 'actor-2') => ({ simulationId: MOCK_SIM, actorId, sourceEventSeq: seq, occurrenceTick: tick,
  decisionId: `cognition-day-${tick / 144}-${actorId}`, commandId: `cognition-day-${tick / 144}-${actorId}`,
  action: 'WorkForPay', status, code: status === 'rejected' ? 'RULE_REJECTED' : null });
const workState = (actorId, samples = []) => ({ version: 'work-experience-state-v1', simulationId: MOCK_SIM, actorId, samples });
const reviewInput = (over = {}) => ({ simulationId: MOCK_SIM, actorId: over.actorId ?? 'actor-2', tick: over.tick ?? 432,
  alive: over.alive ?? true, importancePermille: over.importance ?? 700, relevancePermille: over.relevance ?? 999,
  urgentNeed: over.urgentNeed ?? true, newMajorDuty: false, keyEvidenceChanged: false, goalOrPlanInvalidated: false });
// Deliberately NOT the frozen formula (700×999≠12345, tier/score can mismatch): the page must
// display these saved values verbatim; any re-computation would visibly change them.
const reviewDecision = (over = {}) => ({ version: 'cognitive-review-decision-v1', simulationId: MOCK_SIM, actorId: over.actorId ?? 'actor-2',
  tick: over.tick ?? 432, tier: over.tier ?? 'full', score: over.score ?? 12345,
  intervalTicks: 'intervalTicks' in over ? over.intervalTicks : 144, mode: over.mode ?? 'review',
  shouldReview: 'shouldReview' in over ? over.shouldReview : (over.mode ?? 'review') === 'review',
  reasonCodes: over.reasonCodes ?? ['URGENT_NEED', 'PERIOD_DUE'],
  nextReviewTick: 'nextReviewTick' in over ? over.nextReviewTick : 576 });
const reviewState = (actorId, evaluation, lastReviewTick) =>
  ({ version: 'cognitive-review-state-v1', simulationId: MOCK_SIM, actorId, lastEvaluation: evaluation, lastReviewTick });
const belief = (value, confidencePermille = 900, evidenceRefs = [14]) =>
  ({ topic: 'public-herbs-available', value, confidencePermille, evidenceRefs, contradictionRefs: [], lastUpdatedTick: 144 });
function knowledge(actorId, over = {}) {
  return { knowledgeVersion: 'cognition-knowledge-v1', phase: 'committed', simulationId: MOCK_SIM, actorId,
    tick: over.tick ?? 432, revision: over.revision ?? 432,
    self: { name: over.name ?? (actorId === 'actor-2' ? '猎人' : '商人'), occupation: actorId === 'actor-2' ? 'hunter' : 'merchant',
      location: 'village', alive: over.alive ?? true, health: over.health ?? 400, hunger: 0, fatigue: over.fatigue ?? 650,
      wallet: over.wallet ?? 50, inventory: { food: over.food ?? 19, herbs: over.herbs ?? 1 },
      currentGoal: over.currentGoal === undefined ? null : over.currentGoal, nextGoalId: 1, cooldownUntilDay: 0 },
    quote: { product: 'herbs', price: over.price ?? 40, observedTick: 144, sourceEventSeq: 14 },
    observations: over.observations ?? [], belief: over.belief ?? belief('available'),
    profile: over.profile ?? { dutyWeightPermille: 900, riskAversionPermille: 200 },
    duty: over.duty === undefined ? null : over.duty,
    planState: over.planState ?? { activePlan: null, suspendedPlan: null, nextPlanId: 1, lastReviewedDutyId: null },
    experience: over.experience ?? experienceView(actorId), useWorkExperience: over.useWorkExperience ?? true };
}
const candidate = (action, extra = {}) => ({ action, provider: extra.provider ?? 'fallback', sourceRef: extra.sourceRef ?? null,
  eligible: extra.eligible ?? true, score: extra.score ?? 0, support: extra.support ?? 0, opposition: extra.opposition ?? 0,
  reasonCode: extra.reasonCode ?? 'WAIT', selectable: extra.selectable ?? true, selectionBlockCode: extra.block ?? null });
// The decision-time frozen knowledge is a phase-decision snapshot with its own experience view,
// intentionally different from the current window in the display fixtures.
function frozenKnowledge(actorId, over = {}) {
  const base = knowledge(actorId, { ...over, phase: undefined });
  return { ...base, phase: 'decision', tick: over.tick ?? 288, revision: (over.tick ?? 288) - 1,
    experience: over.frozenExperience ?? experienceView(actorId, { sampleCount: 1, failureCount: 1, penaltyPermille: 100, evidenceRefs: [27] }),
    useWorkExperience: over.frozenUseWorkExperience ?? true };
}
function cognitionDecision(actorId, over = {}) {
  const tick = over.tick ?? 288, day = tick / 144;
  const frozen = over.frozen ?? frozenKnowledge(actorId, over);
  return { version: 'cognition-decision-v1', decisionId: over.decisionId ?? `cognition-day-${day}-${actorId}`, actorId, tick,
    goalId: over.goalId ?? 1, planId: over.planId ?? 1, innerStance: over.innerStance ?? 'health-concerned',
    committedIntent: { goalId: 1, kind: 'recover-health' }, apparentAction: over.choice ?? 'UseMedicine', choice: over.choice ?? 'UseMedicine',
    reasonCode: over.reasonCode ?? 'RECOVER_HEALTH', gateReason: over.gateReason ?? 'CONTINUE_COMMITTED', strainPermille: 950,
    mode: over.mode ?? 'review', sourceReviewDecisionId: over.sourceReviewDecisionId ?? null, sourceReviewEventSeq: over.sourceReviewEventSeq ?? null,
    candidates: over.candidates ?? [candidate('UseMedicine', { provider: 'health-need', sourceRef: 'recover-health', score: 700, support: 700, reasonCode: 'RECOVER_HEALTH' }),
      candidate('NoAction', { reasonCode: 'WAIT', score: 0 })],
    evidenceRefs: [14], knowledgeFingerprint: typeof over.fingerprint === 'string' ? over.fingerprint : canonicalJson(frozen) };
}
const cognitionFields = (actorId, over = {}) => ({ importancePermille: over.importancePermille ?? 700,
  reviewState: 'reviewState' in over ? over.reviewState
    : reviewState(actorId, { input: reviewInput({ actorId }), decision: reviewDecision({ actorId }) }, 432),
  signalBaseline: over.signalBaseline ?? null,
  lastReviewDecisionId: 'lastReviewDecisionId' in over ? over.lastReviewDecisionId : `cognition-day-3-${actorId}`,
  lastReviewEventSeq: 'lastReviewEventSeq' in over ? over.lastReviewEventSeq : (actorId === 'actor-2' ? 22 : 23) });
const outcome = (over = {}) => ({ decisionId: over.decisionId ?? 'cognition-day-2-actor-2', actorId: over.actorId ?? 'actor-2',
  commandId: over.commandId ?? null, status: over.status ?? 'no-action', code: over.code ?? null,
  delta: over.delta ?? { wallet: 0, herbs: 0, health: 0, fatigue: 0 }, price: over.price ?? null,
  publicFoodProduced: over.publicFoodProduced ?? 0, failureOwner: over.failureOwner ?? null });
const actorEntry = (actorId, over = {}) => ({ knowledge: knowledge(actorId, over), lastDecision: over.lastDecision ?? null,
  lastOutcome: over.lastOutcome ?? null, counterfactual: null,
  workExperience: over.workExperience ?? { state: workState(actorId), view: experienceView(actorId) }, cognition: cognitionFields(actorId, over.cognition ?? {}) });
const inspector = (over = {}) => ({ apiVersion: 1, mindVersion: 'cognition-inspector-v1', view: 'developer', simulationId: MOCK_SIM,
  revision: over.revision ?? 432, tick: over.tick ?? 432,
  worldFacts: over.worldFacts ?? { publicFood: 120, publicHerbs: 20, postedHerbPrice: 40 },
  actors: over.actors ?? [actorEntry('actor-2', over.actor2 ?? {}), actorEntry('actor-3', over.actor3 ?? {})] });

async function pageHarness(initialTransport) {
  const elements = new Map();
  const make = () => ({ textContent: '', hidden: false, disabled: false, value: '', dataset: {}, handlers: {}, children: [],
    append(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, addEventListener(type, fn) { this.handlers[type] = fn; } });
  const document = { documentElement: { dataset: {} }, createElement: make, _handlers: {},
    addEventListener(type, fn) { this._handlers[type] = fn; },
    getElementById(id) { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); } };
  let transport = initialTransport, calls = 0;
  const context = vm.createContext({ document, AbortSignal, fetch: (...a) => { calls++; return transport(...a); } });
  vm.runInContext(await fs.readFile(MIND_JS, 'utf8'), context);
  let i = 0;
  while (elements.get('mind-status')?.dataset.state === 'loading' && i++ < 100) await new Promise(r => setImmediate(r));
  return { elements, document, context, calls: () => calls, setTransport(fn) { transport = fn; } };
}
const okJson = body => ({ ok: true, status: 200, json: async () => structuredClone(body) });

test('static page keeps M1 semantics and ships the cognition blocks hidden with the frozen texts', async () => {
  const html = await fs.readFile(MIND_HTML, 'utf8');
  assert.match(html, /id="cognition-review"[^>]*hidden/);
  assert.match(html, /id="cognition-experience"[^>]*hidden/);
  assert.match(html, /<p id="cog-maintain-note" hidden>沿用承诺，本次未比较候选。<\/p>/);
  assert.match(html, /直接展示评审内核保存的输入与决定，页面不重算/);
  assert.match(html, /决定时冻结经验与当前窗口分开显示/);
  // All M1 anchors keep their ids and semantics untouched by the M3 additions.
  for (const id of ['mind-sim', 'mind-time', 'mind-status', 'actor-2', 'actor-3', 'knowledge-title', 'self-name', 'fact-herbs', 'fact-price', 'm1-stance-row', 'm1-intent-row', 'decision-fields', 'outcome-fields'])
    assert.match(html, new RegExp(`id="${id}"`), id);
});

test('cognition reading renders saved review input and decision verbatim — the page re-evaluates nothing', async () => {
  const p = await pageHarness(async () => okJson(inspector()));
  assert.equal(p.elements.get('cognition-review').hidden, false);
  assert.equal(p.elements.get('cognition-experience').hidden, false);
  assert.equal(p.elements.get('mind-sim').textContent, MOCK_SIM);
  assert.equal(p.elements.get('fact-food').textContent, '120');
  assert.equal(p.elements.get('cog-eval-input').textContent, '关注 700‰ · 相关性 999‰ · 存活 · 评估 tick 432');
  // score 12345 is not 700×999 and tier full does not follow it: the DTO values must survive as-is.
  assert.match(p.elements.get('cog-eval-decision').textContent, /12345/);
  assert.match(p.elements.get('cog-eval-decision').textContent, /完整重评 · 应重评 · full/);
  assert.match(p.elements.get('cog-eval-decision').textContent, /URGENT_NEED, PERIOD_DUE/);
  assert.match(p.elements.get('cog-eval-decision').textContent, /间隔 144 · 下次评审 tick 576/);
});

test('cognition anchors show the saved review ids, event sequences and ticks with their provenance', async () => {
  const lastDecision = cognitionDecision('actor-2', { mode: 'maintain', candidates: [], sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 9 });
  const p = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision } })));
  assert.equal(p.elements.get('cog-review-anchors').textContent,
    'cognition-day-3-actor-2 · Planned 事件 22 · 实际 tick 432（来源：本人最近一次完整评审锚点）');
  assert.equal(p.elements.get('cog-source-review').textContent,
    'cognition-day-1-actor-2 · Planned 事件 9 · 实际 tick 144（来源：上次评审锚点，非本次评分）');
  // A full review carries no source anchor and says so instead of pointing at another decision.
  const full = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision: cognitionDecision('actor-2', {}) } })));
  assert.equal(full.elements.get('cog-source-review').textContent, '无（本次为完整重评，候选来自本次比较）');
  const noReview = inspector({ actor3: { cognition: { lastReviewDecisionId: null, lastReviewEventSeq: null, reviewState: reviewState('actor-3', null, null) } } });
  const none = await pageHarness(async () => okJson(noReview));
  vm.runInContext('selectActor("actor-3")', none.context);
  assert.equal(none.elements.get('cog-review-anchors').textContent, '无（还没有完成过的完整评审）');
  assert.equal(none.elements.get('cog-eval-input').textContent, '尚无评审记录');
});

test('maintain decisions show the frozen commitment text and never borrow candidates', async () => {
  const lastDecision = cognitionDecision('actor-2', { mode: 'maintain', gateReason: 'WAIT_MAINTAIN', choice: 'NoAction', candidates: [],
    sourceReviewDecisionId: 'cognition-day-13-actor-2', sourceReviewEventSeq: 178 });
  const p = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision } })));
  assert.equal(p.elements.get('cog-maintain-note').hidden, false);
  assert.equal(p.elements.get('decision-candidates').children.length, 0, 'no candidates may appear for maintain');
  assert.equal(p.elements.get('m2-candidates-body').children.length, 0);
  // The review kernel data cannot smuggle a candidate list into a maintain rendering either.
  assert.match(p.elements.get('decision-choice').textContent, /无动作/);
});

test('counterfactual null shows the frozen no-counterfactual text and no hypothesis rows', async () => {
  const p = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision: cognitionDecision('actor-2', {}) } })));
  assert.equal(p.elements.get('m2-counterfactual').hidden, false);
  assert.equal(p.elements.get('cf-empty').textContent, '本轮无反事实。');
  assert.equal(p.elements.get('cf-empty').hidden, false);
  assert.equal(p.elements.get('cf-list').children.length, 0);
});

test('decision-time frozen experience and the current window are shown separately and consistently', async () => {
  const samples = [sample(27, 288, 'rejected'), sample(41, 576, 'succeeded'), sample(75, 864, 'succeeded'), sample(99, 1152, 'succeeded')];
  const view = experienceView('actor-2', { sampleCount: 4, failureCount: 1, penaltyPermille: 100, evidenceRefs: samples.map(s => s.sourceEventSeq) });
  const lastDecision = cognitionDecision('actor-2', { mode: 'maintain', candidates: [],
    sourceReviewDecisionId: 'cognition-day-1-actor-2', sourceReviewEventSeq: 9 });
  const p = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision,
    lastOutcome: outcome({}), workExperience: { state: workState('actor-2', samples), view } } })));
  // Frozen experience at decision time: 1 sample, 1 failure → penalty 100 (frozen kernel formula).
  assert.equal(p.elements.get('cog-frozen-experience').textContent,
    '决定时冻结：样本 1 · 失败 1 · 惩罚 100‰ · 证据 27 · 经验开关 开');
  assert.equal(p.elements.get('cog-window-summary').textContent, '当前窗口：样本 4 · 失败 1 · 惩罚 100‰ · 证据 27, 41, 75, 99');
  const rows = p.elements.get('cog-window-list').children.map(row => row.textContent);
  assert.deepEqual(rows, [
    'tick 1152 · 事件 99 · actor-2 · 决定 cognition-day-8-actor-2 · 命令 cognition-day-8-actor-2 · 成功',
    'tick 864 · 事件 75 · actor-2 · 决定 cognition-day-6-actor-2 · 命令 cognition-day-6-actor-2 · 成功',
    'tick 576 · 事件 41 · actor-2 · 决定 cognition-day-4-actor-2 · 命令 cognition-day-4-actor-2 · 成功',
    'tick 288 · 事件 27 · actor-2 · 决定 cognition-day-2-actor-2 · 命令 cognition-day-2-actor-2 · 拒绝（权威）']);
  assert.equal(p.elements.get('cog-window-empty').hidden, true);
  // NoAction and authority rejection stay separate: the outcome row reports 无动作.
  assert.equal(p.elements.get('outcome-status').textContent, '无动作');
});

test('unreadable frozen knowledge is reported as unreadable, never inferred from the choice', async () => {
  const broken = cognitionDecision('actor-2', { fingerprint: 'not-json' });
  const p = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision: broken, lastOutcome: null } })));
  assert.match(p.elements.get('cog-frozen-experience').textContent, /无法读取合法的当时冻结经验；未从选择或结果推断。/);
  assert.equal(p.elements.get('decision-belief').textContent, '无法读取合法的当时判断依据');
  // A non-canonical or motivation-version fingerprint must not be accepted as cognition evidence.
  const mismatch = cognitionDecision('actor-2', { fingerprint: canonicalJson({ ...frozenKnowledge('actor-2'), knowledgeVersion: 'motivation-knowledge-v1' }) });
  const p2 = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision: mismatch } })));
  assert.match(p2.elements.get('cog-frozen-experience').textContent, /无法读取合法的当时冻结经验/);
});

test('dead actors show the sealed old decision plus the dormant DEAD review and no new action', async () => {
  const sealed = cognitionDecision('actor-2', { tick: 144, decisionId: 'cognition-day-1-actor-2' });
  const deadCognition = { reviewState: reviewState('actor-2', {
      input: reviewInput({ tick: 432, alive: false, relevancePermille: 0, urgentNeed: false }),
      decision: reviewDecision({ tick: 432, tier: 'dormant', score: 0, mode: 'dormant', shouldReview: false, reasonCodes: ['DEAD'], intervalTicks: null, nextReviewTick: null }),
    }, 144),
    lastReviewDecisionId: 'cognition-day-1-actor-2', lastReviewEventSeq: 7 };
  const p = await pageHarness(async () => okJson(inspector({ actor2: {
    alive: false, currentGoal: null, lastDecision: sealed, lastOutcome: null, cognition: deadCognition } })));
  assert.equal(p.elements.get('knowledge-alive').textContent, '已故 · 封存');
  assert.equal(p.elements.get('decision-seal').textContent, '封存记录');
  assert.equal(p.elements.get('decision-fields').hidden, false, 'the sealed decision stays readable');
  assert.match(p.elements.get('cog-eval-decision').textContent, /休眠/);
  assert.match(p.elements.get('cog-eval-decision').textContent, /\[DEAD\]/);
  assert.match(p.elements.get('cog-eval-decision').textContent, /下次评审 无/);
  assert.match(p.elements.get('cog-eval-input').textContent, /已故/);
  assert.equal(p.elements.get('cog-maintain-note').hidden, true);
});

test('cognition mode reuses the M2 knowledge/duty/plan/candidate blocks for a full review', async () => {
  const d = cognitionDecision('actor-2', { tick: 288, choice: 'WorkForPay', apparentAction: 'WorkForPay', reasonCode: 'DUTY',
    gateReason: 'NEW_MAJOR_DUTY', candidates: [candidate('UseMedicine', { provider: 'health-need', sourceRef: 'recover-health', score: 700, support: 700, reasonCode: 'RECOVER_HEALTH' }),
      candidate('WorkForPay', { provider: 'role-request', sourceRef: 'closeout-duty-2', score: 730, support: 900, opposition: 170, reasonCode: 'DUTY' })] });
  const p = await pageHarness(async () => okJson(inspector({ actor2: { lastDecision: d,
    lastOutcome: outcome({ status: 'succeeded', commandId: 'cognition-day-2-actor-2', delta: { wallet: 20, herbs: 0, health: 0, fatigue: 150 } }) } })));
  assert.equal(p.elements.get('m2-duty-plan').hidden, false);
  assert.equal(p.elements.get('decision-gate').textContent, '新的重大职责 · 打开完整重评');
  assert.equal(p.elements.get('decision-choice').textContent, '工作');
  const rows = p.elements.get('m2-candidates-body').children;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].children[3].textContent, '900 / 170');
  assert.equal(rows[1].children[4].textContent, '730');
  assert.equal(p.elements.get('outcome-fatigue').textContent, '150');
});

test('M1 and M2 pages keep zero regression: motivation readings hide cognition, mind readings hide everything new', async () => {
  const motivationInspector = { apiVersion: 1, mindVersion: 'motivation-inspector-v1', view: 'developer', simulationId: 'motivation-village-mock',
    revision: 288, tick: 288, worldFacts: { publicFood: 100, publicHerbs: 10, postedHerbPrice: 50 },
    actors: [{ knowledge: { ...knowledge('actor-2', { tick: 288, revision: 288 }), knowledgeVersion: 'motivation-knowledge-v1' },
      lastDecision: null, lastOutcome: null, counterfactual: null }] };
  const motivationPage = await pageHarness(async () => okJson(motivationInspector));
  assert.equal(motivationPage.elements.get('cognition-review').hidden, true);
  assert.equal(motivationPage.elements.get('cognition-experience').hidden, true);
  assert.equal(motivationPage.elements.get('m2-duty-plan').hidden, false);
  assert.equal(motivationPage.elements.get('m2-counterfactual').hidden, false);
  assert.equal(motivationPage.elements.get('m1-stance-row').hidden, true);
  assert.equal(motivationPage.elements.get('cf-empty').textContent, '暂无反事实记录。');
  const m1 = { apiVersion: 1, mindVersion: 'mind-inspector-v1', view: 'developer', simulationId: 'mind-village', revision: 0, tick: 0,
    worldFacts: { publicHerbs: 20, postedHerbPrice: 50 },
    actors: [{ knowledge: { knowledgeVersion: 'mind-knowledge-v1', phase: 'committed', simulationId: 'mind-village', actorId: 'actor-2',
      tick: 0, revision: 0, self: { name: '猎人', occupation: 'hunter', location: 'village', alive: true, health: 400, hunger: 0, fatigue: 200,
        wallet: 100, inventory: { food: 20, herbs: 0 }, currentGoal: null, nextGoalId: 1, cooldownUntilDay: 0 },
      quote: { product: 'herbs', price: 50, observedTick: 0, sourceEventSeq: null }, observations: [], belief: belief('unknown', 0, []),
      innerStance: 'uncertain-supply', committedIntent: null }, lastDecision: null, lastOutcome: null }] };
  const m1Page = await pageHarness(async () => okJson(m1));
  assert.equal(m1Page.elements.get('cognition-review').hidden, true);
  assert.equal(m1Page.elements.get('cognition-experience').hidden, true);
  assert.equal(m1Page.elements.get('m1-stance-row').hidden, false);
  assert.equal(m1Page.elements.get('m2-duty-plan').hidden, true);
  assert.equal(m1Page.elements.get('inner-stance').textContent, '供给不明');
});

test('every cognition string lands as plain text — injection payloads from DTO fields are never HTML', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const injection = cognitionDecision('actor-2', { mode: 'maintain', candidates: [] });
  const hostile = inspector({ actor2: { name: payload, lastDecision: injection,
    cognition: { reviewState: reviewState('actor-2', { input: reviewInput({}), decision: reviewDecision({ reasonCodes: [payload] }) }, 432),
      lastReviewDecisionId: payload, lastReviewEventSeq: 1 } } });
  const p = await pageHarness(async () => okJson(hostile));
  assert.equal(p.elements.get('self-name').textContent, payload);
  assert.equal(p.elements.get('cog-eval-decision').textContent.includes(payload), true);
  assert.equal(p.elements.get('cog-review-anchors').textContent, `${payload} · Planned 事件 1 · 实际 tick 432（来源：本人最近一次完整评审锚点）`);
  // No element carries HTML children; the fake DOM only receives textContent writes.
  for (const [, element] of p.elements) assert.equal('innerHTML' in element, false);
});

test('late revisions never overwrite and transport errors keep the last cognition reading', async () => {
  let tick = 432;
  const p = await pageHarness(async () => okJson(inspector({ revision: tick, tick, actor2: { lastDecision: cognitionDecision('actor-2', {}) } })));
  assert.equal(p.elements.get('mind-time').textContent, 'tick 432 · revision 432');
  tick = 864;
  await vm.runInContext('refresh()', p.context);
  assert.equal(p.elements.get('mind-time').textContent, 'tick 864 · revision 864');
  tick = 144;
  await vm.runInContext('refresh()', p.context);
  assert.equal(p.elements.get('mind-time').textContent, 'tick 864 · revision 864');
  assert.match(p.elements.get('mind-status').textContent, /迟到/);
  // Actor switching after the late arrival still shows the retained newer reading.
  vm.runInContext('selectActor("actor-3")', p.context);
  assert.equal(p.elements.get('mind-time').textContent, 'tick 864 · revision 864');
  p.setTransport(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('not json'); } }));
  await vm.runInContext('refresh()', p.context);
  assert.equal(p.elements.get('mind-status').dataset.state, 'error');
  assert.match(p.elements.get('mind-status').textContent, /保留上次读数/);
  assert.equal(p.elements.get('mind-time').textContent, 'tick 864 · revision 864');
  assert.equal(p.elements.get('cog-eval-decision').textContent.includes('12345'), true, 'disconnect keeps cognition readings');
});
