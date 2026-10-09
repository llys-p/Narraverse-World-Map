// M3-4B G4：真实浏览器消费者验收（B 路）。真实 Edge/Chromium 驱动、自建 port0 服务、全新临时
// 浏览器上下文；页面只做 GET，世界推进全部由本 harness 的 Node 侧同源 POST 完成并单独标注。
// 合同：m3-closeout-contract-v1 §G4 与 M3-4A 共同合同 §3。缺驱动/页面不可加载/断言失败均阻断 PASS。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startRuntimeServer } from '../runtime-server.mjs';
import { saveCheckpoint } from '../runtime/persistence/checkpoint-store.mjs';
import { createCognitionVillage, cognitionSystems } from '../runtime/fixtures/cognition-village.mjs';
import { COGNITION_RULES } from '../runtime/service/http-contract.mjs';

const require = createRequire(import.meta.url);
const PLAYWRIGHT = 'C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const { chromium } = require(PLAYWRIGHT);
assert.equal(typeof chromium.launch, 'function', 'the local Playwright driver must be usable');
const REPO = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const EVIDENCE_BASE = path.join(REPO, 'artifacts', 'world-runtime-m34-final-controller-20261009', 'evidence-g4');
const EVIDENCE_ROOT = path.join(EVIDENCE_BASE, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
const FINGERPRINT_FILES = ['runtime-server.mjs', 'runtime-mind.html', 'runtime-mind.mjs', 'runtime-mind.css',
  'runtime/fixtures/cognition-village.mjs', 'runtime/fixtures/mind-village.mjs',
  'runtime/fixtures/motivation-village.mjs', 'runtime/experiments/m3-closeout-scenario.mjs',
  'tests/cognition-inspector-acceptance.test.mjs'];
// WHATWG Fetch / Chromium forbidden ports. Port 0 itself is safe; the OS may assign a
// forbidden number, so reject only this startup URL before any business DTO is submitted.
const FETCH_FORBIDDEN_PORTS = new Set(`1 7 9 11 13 15 17 19 20 21 22 23 25 37 42 43 53 69 77 79 87 95 101 102 103 104 109 110 111 113 115 117 119 123 135 137 139 143 179 389 427 465 512 513 514 515 526 530 531 532 540 548 554 556 563 587 601 636 989 990 993 995 1719 1720 1723 2049 3659 4045 5060 5061 6000 6566 6665 6666 6667 6668 6669 6697 10080`.split(/\s+/).map(Number));

const RECIPE = [['closeout-advance-144', 'time', 144], ['closeout-sell-seven', 'sell', 7],
  ['closeout-advance-288', 'time', 143], ['closeout-advance-432', 'time', 144],
  ['closeout-buy-four', 'buy', 4], ['closeout-advance-576', 'time', 143],
  ['closeout-advance-720', 'time', 144], ['closeout-advance-864', 'time', 144],
  ['closeout-advance-1008', 'time', 144], ['closeout-advance-1152', 'time', 144],
  ['closeout-advance-1296', 'time', 144], ['closeout-advance-1440', 'time', 144]];
const dtoFor = (commandId, kind, amount, revision) => kind === 'time'
  ? { version: 1, commandId, expectedRevision: revision, type: 'AdvanceTime', payload: { ticks: amount } }
  : { version: 2, commandId, expectedRevision: revision, type: kind === 'sell' ? 'PlayerSell' : 'PlayerBuy',
    payload: { product: 'herbs', quantity: amount } };
// The page renders localized labels; the visible text must correspond to the raw API value
// through this independently written table, not be compared against the raw value itself.
const CHOICE_LABEL = { UseMedicine: '用药', BuyMedicine: '买药', NoAction: '无动作', WorkForPay: '工作', Rest: '休息' };
const actorOf = (projection, actorId = 'actor-2') => projection.actors.find(actor => actor.knowledge.actorId === actorId);
const fileBytes = async directory => {
  const names = (await fs.readdir(directory)).filter(name => name !== '.runtime-owner.lock').sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await fs.readFile(path.join(directory, name), 'utf8')])));
};
// Teardown must run browser, then service, then disk. Node's server.close() waits for the tab's
// still-open connection, so closing the service first never returns and turns an ordinary
// assertion failure into an endless hang.
function trackCleanup(t) {
  const steps = [];
  t.after(async () => {
    let failure;
    for (const step of steps.reverse()) { try { await step(); } catch (error) { failure ??= error; } }
    if (failure) throw failure;
  });
  return step => { steps.push(step); return step; };
}
async function evidenceFor(t, label) {
  await fs.mkdir(EVIDENCE_ROOT, { recursive: true });
  const safe = label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const evidence = { label, sourceHead: execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    worktreeStatus: execFileSync('git', ['-C', REPO, 'status', '--short'], { encoding: 'utf8' }).trim(),
    node: process.version, browser: null, requests: [], responses: [], console: [], pageErrors: [], failedRequests: [],
    harnessCommands: [], apiSnapshots: [], screenshots: [], injections: [], checks: [], files: {} };
  for (const relative of FINGERPRINT_FILES) {
    evidence.files[relative] = createHash('sha256').update(await fs.readFile(path.join(REPO, relative))).digest('hex');
  }
  evidence.testSha256 = evidence.files['tests/cognition-inspector-acceptance.test.mjs'];
  evidence.path = path.join(EVIDENCE_ROOT, safe + '.json');
  t.after(async () => fs.writeFile(evidence.path, JSON.stringify(evidence, null, 2) + '\n'));
  return evidence;
}
function attachEvidence(page, evidence) {
  page.on('request', request => evidence.requests.push({ method: request.method(), url: request.url() }));
  page.on('response', response => evidence.responses.push({ method: response.request().method(), url: response.url(), status: response.status() }));
  page.on('requestfailed', request => evidence.failedRequests.push({ method: request.method(), url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on('pageerror', error => evidence.pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') evidence.console.push(message.text()); });
}
async function screenshot(page, evidence, label) {
  const file = path.join(EVIDENCE_ROOT, evidence.label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '-' + label + '.png');
  await page.screenshot({ path: file, fullPage: true });
  evidence.screenshots.push(file);
}
async function readMinds(server, evidence, label) {
  const response = await fetch(server.url + '/api/runtime/minds');
  assert.equal(response.status, 200);
  const dto = await response.json();
  evidence.apiSnapshots.push({ label, dto });
  return dto;
}
async function submitCommand(server, dto, evidence) {
  const response = await fetch(server.url + '/api/runtime/commands', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(dto) });
  const receipt = await response.json().catch(() => null);
  evidence.harnessCommands.push({ dto, status: response.status, receipt });
  assert.equal(response.status, 200, dto.commandId + ' refused: ' + JSON.stringify(receipt));
  return receipt;
}
async function startFetchableServer(options, evidence) {
  let nextOptions = { ...options };
  evidence.servicePortAttempts ??= [];
  for (let attempt = 1; attempt <= 8; attempt++) {
    const server = await startRuntimeServer(nextOptions);
    const url = new URL(server.url);
    const port = Number(url.port);
    const record = { attempt, url: server.url, port, result: null };
    evidence.servicePortAttempts.push(record);
    if (FETCH_FORBIDDEN_PORTS.has(port)) {
      record.result = 'excluded-fetch-forbidden-port';
      await server.close();
      // startRuntimeServer opens/initializes the owner before listen. Reopen the same private
      // test directory as a restore; repeating profile/checkpoint/seed would be a reset attempt.
      nextOptions = { ...options };
      delete nextOptions.profile;
      delete nextOptions.checkpoint;
      delete nextOptions.seed;
      continue;
    }
    try {
      const response = await fetch(server.url + '/api/runtime/snapshot');
      record.preflightStatus = response.status;
      assert.equal(response.status, 200, `startup snapshot preflight failed at ${server.url}`);
      await response.arrayBuffer();
      record.result = 'accepted-fetchable-port';
      return server;
    } catch (error) {
      const badPort = error instanceof TypeError && error.cause?.message === 'bad port';
      record.preflightError = { name: error.name, message: error.message,
        causeName: error.cause?.name ?? null, causeMessage: error.cause?.message ?? null };
      if (!badPort) {
        record.result = 'preflight-failed-unrelated-to-port';
        await server.close();
        throw error;
      }
      record.result = 'excluded-fetch-bad-port-cause';
      await server.close();
      nextOptions = { ...options };
      delete nextOptions.profile;
      delete nextOptions.checkpoint;
      delete nextOptions.seed;
    }
  }
  throw new Error('Could not allocate a Fetch-allowed port after 8 private startup attempts');
}
async function temporary(cleanup) {
  const base = path.join(os.tmpdir(), 'world-m34b-g4-');
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(base + path.sep);
  cleanup(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
// The page fills actor buttons only after its first successful read, so every interaction has to
// wait for the ready state first; clicking immediately races the initial fetch and times out.
const waitForReady = page => page.waitForFunction(
  () => document.getElementById('mind-status')?.dataset?.state === 'ready', null, { timeout: 20000 });
async function openInspector(url, cleanup, evidence) {
  let browser, context;
  cleanup(async () => { await context?.close().catch(() => {}); await browser?.close().catch(() => {}); });
  browser = await chromium.launch({ executablePath: EDGE });
  evidence.browser ??= browser.version();
  const close = async () => { await context?.close().catch(() => {}); await browser?.close().catch(() => {}); };
  context = await browser.newContext();
  const page = await context.newPage();
  const errors = evidence.pageErrors, requests = evidence.requests;
  attachEvidence(page, evidence);
  await page.goto(url + '/runtime-mind.html', { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  return { page, context, errors, requests, close };
}
// Harness-side POSTs drive the world forward; one owner per directory, so the same service that
// the browser reads is the one that accepts these commands. from/to must advance monotonically:
// resubmitting an already committed commandId is a legitimate 409, not a retry.
async function driveTo(server, from, to, evidence) {
  for (const [commandId, kind, amount] of RECIPE.slice(from, to)) {
    const revision = (await (await fetch(server.url + '/api/runtime/snapshot')).json()).revision;
    const started = Date.now();
    const dto = dtoFor(commandId, kind, amount, revision);
    const receipt = await submitCommand(server, dto, evidence);
    console.log(`# POST ${commandId} -> committed revision ${receipt?.toRevision ?? 'unknown'} in ${Date.now() - started}ms`);
  }
  return (await (await fetch(server.url + '/api/runtime/snapshot')).json()).revision;
}
// After a long write phase the tab can hold an idle pooled socket, and the inspector then shows
// its documented failure state; the consumer-facing recovery is the page's own refresh button.
// The attempts are logged so a retry never hides a real read failure.
async function refreshTo(page, revision) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.click('#mind-refresh');
    try {
      await page.waitForFunction(target => document.getElementById('mind-time')?.textContent
        ?.includes(`revision ${target}`), revision, { timeout: 20000 });
      console.log(`# refresh reached revision ${revision} on attempt ${attempt}`);
      return attempt;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`# refresh attempt ${attempt} did not reach revision ${revision}: `
        + JSON.stringify(await page.getAttribute('#mind-status', 'data-state')));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

test('G4 真实浏览器加载检查器：日2 拒付与日3 改选在页面上与当时 API 一致', async t => {
  const cleanup = trackCleanup(t);
  const evidence = await evidenceFor(t, 'day2-day3-and-late-revision');
  const root = await temporary(cleanup);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const { createM3CloseoutConfig } = await import('../runtime/experiments/m3-closeout-scenario.mjs');
  await saveCheckpoint(createCognitionVillage(42, 'm34-g4-browser', createM3CloseoutConfig('work-learning', true)).bundle,
    { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  // One writable service is both the driver and the source the browser reads: a second owner on
  // the same directory is refused by design.
  const server = await startFetchableServer({ directory: runtime,
    checkpoint: path.join(source, 'checkpoint-r0.json'), port: 0, writable: true, inspectMind: true }, evidence);
  cleanup(() => server.close());

  await driveTo(server, 0, 3, evidence);   // to tick 288: the day-2 rejection
  const viewer = await openInspector(server.url, cleanup, evidence);
  await viewer.page.click('#actor-2');
  let api = await readMinds(server, evidence, 'day2-tick288');
  const day2Dto = structuredClone(api);
  let day2 = actorOf(api);
  assert.equal(api.revision, 288, 'the reading the page just took is the revision the harness drove to');
  assert.equal(await viewer.page.getAttribute('#actor-2', 'data-active'), 'true');
  assert.equal(await viewer.page.textContent('#self-name'), day2.knowledge.self.name);
  assert.equal(await viewer.page.textContent('#decision-choice'), CHOICE_LABEL[day2.lastDecision.choice], 'the visible choice label maps the API value');
  assert.equal(await viewer.page.textContent('#outcome-status'), '拒绝',
    'the browser must show the authority rejection, not a planner opinion');
  assert.match(await viewer.page.textContent('#cog-window-summary'), /样本 1 · 失败 1 · 惩罚 100‰/);
  assert.match(await viewer.page.textContent('#decision-gate'), /重大职责/);
  const day2Frozen = JSON.parse(day2.lastDecision.knowledgeFingerprint).experience;
  assert.equal(day2Frozen.sampleCount, 0, 'the tick 288 decision froze the pre-outcome empty window');
  assert.equal(await viewer.page.textContent('#cog-frozen-experience'),
    `决定时冻结：样本 ${day2Frozen.sampleCount} · 失败 ${day2Frozen.failureCount} · 惩罚 ${day2Frozen.penaltyPermille}‰ · 证据 ${day2Frozen.evidenceRefs.join(', ') || '无'} · 经验开关 开`);
  assert.equal(day2.workExperience.view.sampleCount, 1, 'the completed rejection is already in the current window');
  evidence.checks.push('tick288 frozen pre-outcome window 0 remains distinct from current post-rejection window 1');
  evidence.checks.push('day2 selected actor and visible identity/decision match revision 288 DTO');
  await screenshot(viewer.page, evidence, 'day2-tick288');

  await driveTo(server, 3, 4, evidence);   // to tick 432: day 3 under ON
  await refreshTo(viewer.page, 432);
  api = await readMinds(server, evidence, 'day3-tick432');
  const day3 = actorOf(api);
  assert.equal(api.revision, 432);
  assert.equal(day3.lastDecision.choice, 'UseMedicine', 'the API says the stored failure moved the choice');
  const day3Other = actorOf(api, 'actor-3');
  await viewer.page.click('#actor-3');
  assert.equal(await viewer.page.getAttribute('#actor-3', 'data-active'), 'true');
  assert.equal(await viewer.page.textContent('#self-name'), day3Other.knowledge.self.name);
  await viewer.page.click('#actor-2');
  assert.equal(await viewer.page.getAttribute('#actor-2', 'data-active'), 'true');
  assert.equal(await viewer.page.textContent('#self-name'), day3.knowledge.self.name);
  assert.equal(await viewer.page.textContent('#decision-choice'), '用药',
    'the visible label must match the page dictionary for this API value');
  assert.match(await viewer.page.textContent('#cog-window-summary'), /样本 1 · 失败 1 · 惩罚 100‰/,
    'using medicine adds no Work sample');
  // The frozen reading of that decision stays separate from the current window.
  const frozen = JSON.parse(day3.lastDecision.knowledgeFingerprint).experience;
  const frozenText = await viewer.page.textContent('#cog-frozen-experience');
  const currentText = await viewer.page.textContent('#cog-window-summary');
  assert.equal(frozen.sampleCount, 1, 'the tick 432 decision includes the tick 288 failure in its frozen input');
  assert.equal(frozen.penaltyPermille, 100);
  assert.equal(frozenText, `决定时冻结：样本 ${frozen.sampleCount} · 失败 ${frozen.failureCount} · 惩罚 ${frozen.penaltyPermille}‰ · 证据 ${frozen.evidenceRefs.join(', ') || '无'} · 经验开关 开`);
  assert.equal(currentText, `当前窗口：样本 ${day3.workExperience.view.sampleCount} · 失败 ${day3.workExperience.view.failureCount} · 惩罚 ${day3.workExperience.view.penaltyPermille}‰ · 证据 ${day3.workExperience.view.evidenceRefs.join(', ') || '无'}`);
  assert.equal(frozen.sampleCount, day3.workExperience.view.sampleCount,
    'the current tick432 window and tick432 decision input both contain the one failure');
  await screenshot(viewer.page, evidence, 'day3-tick432');
  // Inject a delayed response using a previously captured DTO from this same world. This is a
  // browser-route fault injection, not a production server response.
  evidence.injections.push({ kind: 'route.fulfill delayed stale response', sourceRevision: day2Dto.revision,
    simulationId: day2Dto.simulationId, currentDisplayedRevision: 432, productionResponse: false,
    source: 'captured real /api/runtime/minds DTO at tick 288 from this same service world' });
  // Deliver the tick-288 DTO captured earlier after tick 432 is already visible.
  await viewer.page.route('**/api/runtime/minds', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(day2Dto) }));
  await viewer.page.click('#mind-refresh');
  await viewer.page.waitForFunction(() => document.getElementById('mind-status').dataset.state === 'ready'
    && document.getElementById('mind-status').textContent.includes('迟到的 revision 288'));
  assert.match(await viewer.page.textContent('#mind-time'), /revision 432/);
  assert.equal(await viewer.page.textContent('#decision-choice'), '用药');
  evidence.checks.push('stale same-world revision 288 route-fulfilled after 432 retained latest reading; test injection explicitly recorded');
  await screenshot(viewer.page, evidence, 'stale-revision-retained');
  await viewer.page.unroute('**/api/runtime/minds');
  assert.deepEqual(viewer.errors, [], 'the inspector page must run without page or console errors');
  // Read-only: every browser request was a GET, while the harness POSTed the world forward.
  const methods = new Set(viewer.requests.map(request => request.method));
  assert.deepEqual([...methods].sort(), ['GET'], 'the inspector itself must never write');
  assert.ok(viewer.requests.every(request => !request.url.includes('/api/runtime/commands')));
  assert.deepEqual(evidence.console, [], 'successful and route-injected reads must not log browser console errors');
  assert.deepEqual(evidence.failedRequests, []);
});

test('G4 十日后窗口归零与低频 maintain 在页面上如实显示，切换人物与键盘刷新不写世界', async t => {
  const cleanup = trackCleanup(t);
  const evidence = await evidenceFor(t, 'day10-window-and-readonly-tabs');
  const root = await temporary(cleanup);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const { createM3CloseoutConfig } = await import('../runtime/experiments/m3-closeout-scenario.mjs');
  await saveCheckpoint(createCognitionVillage(42, 'm34-g4-late', createM3CloseoutConfig('work-learning', true)).bundle,
    { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  const server = await startFetchableServer({ directory: runtime,
    checkpoint: path.join(source, 'checkpoint-r0.json'), port: 0, writable: true, inspectMind: true }, evidence);
  cleanup(() => server.close());
  await driveTo(server, 0, 12, evidence);   // to tick 1440: the fourth real success zeroes the window
  const viewer = await openInspector(server.url, cleanup, evidence);
  const diskBefore = await fileBytes(runtime);
  const api = await readMinds(server, evidence, 'day10-tick1440');
  assert.equal(api.revision, 1440, 'the ten-day world really reached tick 1440 through the service');
  const day10 = actorOf(api);
  const day10Frozen = JSON.parse(day10.lastDecision.knowledgeFingerprint).experience;
  await viewer.page.click('#actor-2');
  assert.equal(await viewer.page.getAttribute('#actor-2', 'data-active'), 'true');
  assert.equal(await viewer.page.textContent('#self-name'), day10.knowledge.self.name);
  assert.match(await viewer.page.textContent('#cog-window-summary'), /惩罚 0‰/);
  assert.equal(day10.workExperience.view.penaltyPermille, 0);
  assert.equal(await viewer.page.textContent('#cog-window-summary'),
    `当前窗口：样本 ${day10.workExperience.view.sampleCount} · 失败 ${day10.workExperience.view.failureCount} · 惩罚 0‰ · 证据 ${day10.workExperience.view.evidenceRefs.join(', ') || '无'}`,
    'the zeroed window must be shown exactly as the API reports it');
  assert.equal(day10Frozen.penaltyPermille, 100, 'the day10 decision froze the pre-success penalty');
  assert.equal(day10.workExperience.view.penaltyPermille, 0, 'the current window includes the fourth success');
  assert.equal(await viewer.page.textContent('#cog-frozen-experience'),
    `决定时冻结：样本 ${day10Frozen.sampleCount} · 失败 ${day10Frozen.failureCount} · 惩罚 ${day10Frozen.penaltyPermille}‰ · 证据 ${day10Frozen.evidenceRefs.join(', ') || '无'} · 经验开关 开`);
  // Low-frequency continuation: the note appears for a maintain decision and stays hidden otherwise.
  const mode = day10.lastDecision?.mode ?? null;
  assert.equal(await viewer.page.isVisible('#cog-maintain-note'), mode === 'maintain',
    `the maintain note must follow the API mode (${JSON.stringify(mode)})`);
  if (mode === 'maintain') assert.match(await viewer.page.textContent('#cog-maintain-note'), /沿用承诺/);
  // Switch to the other managed actor and back with the keyboard (2, 1, R).
  const other = api.actors.find(actor => actor.knowledge.actorId === 'actor-3');
  await viewer.page.keyboard.press('2');
  assert.equal(await viewer.page.getAttribute('#actor-3', 'data-active'), 'true');
  assert.equal(await viewer.page.textContent('#knowledge-title'), '本人所知 · ' + other.knowledge.self.name);
  await viewer.page.keyboard.press('1');
  assert.equal(await viewer.page.getAttribute('#actor-2', 'data-active'), 'true');
  assert.equal(await viewer.page.textContent('#knowledge-title'), '本人所知 · ' + actorOf(api).knowledge.self.name);
  await viewer.page.keyboard.press('r');
  await viewer.page.waitForFunction(() => document.getElementById('mind-status').dataset.state === 'ready');
  assert.match(await viewer.page.textContent('#mind-time'), /revision 1440/);
  // Two tabs at once: both stay read-only and the durable bytes never move.
  const second = await viewer.context.newPage();
  attachEvidence(second, evidence);
  await second.goto(server.url + '/runtime-mind.html', { waitUntil: 'domcontentloaded' });
  await waitForReady(second);
  assert.equal(await second.textContent('#self-name'), actorOf(api).knowledge.self.name,
    'the second tab initially selects actor2 and matches the same tick1440 DTO');
  await viewer.page.reload({ waitUntil: 'domcontentloaded' }); await waitForReady(viewer.page);
  assert.deepEqual([...new Set(evidence.requests.map(request => request.method))], ['GET'], 'both tabs must remain read-only');
  assert.deepEqual(await fileBytes(runtime), diskBefore, 'two read-only tabs change no durable byte');
  assert.deepEqual(viewer.errors, [], 'no page or console errors while browsing both tabs');
  assert.deepEqual(evidence.console, [], 'no browser console errors while browsing both tabs');
  assert.deepEqual(evidence.failedRequests, []);
  evidence.checks.push('day10 actor 2/3 selection, keyboard, refresh, second tab all read-only with bytes unchanged');
  await screenshot(viewer.page, evidence, 'day10-tick1440');
});

test('G4 断连保留最后读数并给出明确失败态，页面只用 textContent 渲染', async t => {
  const cleanup = trackCleanup(t);
  const evidence = await evidenceFor(t, 'disconnect-error-retains-reading');
  const root = await temporary(cleanup);
  const directory = path.join(root, 'world');
  const server = await startFetchableServer({ directory, profile: 'cognition-village', port: 0, inspectMind: true }, evidence);
  cleanup(() => server.close());
  const viewer = await openInspector(server.url, cleanup, evidence);
  const reading = await viewer.page.textContent('#mind-time');
  assert.match(reading, /revision 0/);
  const html = await fs.readFile(new URL('../runtime-mind.mjs', import.meta.url), 'utf8');
  const markup = await fs.readFile(new URL('../runtime-mind.html', import.meta.url), 'utf8');
  assert.equal((html.match(/innerHTML|insertAdjacentHTML|document\.write/g) ?? []).length, 0,
    'the inspector must never inject string markup');
  assert.equal((markup.match(/innerHTML|onerror=/g) ?? []).length, 0);
  // Drop the server: the last reading stays and the failure state becomes explicit.
  await server.close();
  const consoleBeforeDisconnect = evidence.console.length;
  await viewer.page.click('#mind-refresh');
  await viewer.page.waitForFunction(() => document.getElementById('mind-status').dataset.state === 'error', null,
    { timeout: 15000 });
  assert.equal(await viewer.page.textContent('#mind-time'), reading, 'the stale reading must not be cleared');
  const state = await viewer.page.getAttribute('#mind-status', 'data-state');
  assert.equal(state, 'error', 'a disconnected inspector reports an explicit error, not ready or loading');
  assert.notEqual(state, 'loading', 'loading is not a terminal failure state');
  assert.match(await viewer.page.textContent('#mind-status'), /.+/, 'the failure carries a visible message');
  const disconnectConsole = evidence.console.slice(consoleBeforeDisconnect);
  evidence.expectedDisconnectConsole = disconnectConsole.filter(message => /ERR_CONNECTION|Failed to fetch|net::ERR/i.test(message));
  evidence.unexpectedDisconnectConsole = disconnectConsole.filter(message => !/ERR_CONNECTION|Failed to fetch|net::ERR/i.test(message));
  assert.deepEqual(evidence.unexpectedDisconnectConsole, [], 'disconnect may log only the expected network failure');
  assert.deepEqual(evidence.pageErrors, [], 'disconnect handling must not raise an uncaught page error');
  evidence.checks.push('disconnect produces terminal error and retains the last tick/revision');
  await screenshot(viewer.page, evidence, 'disconnected-error');
});

test('G4 旧 M1/M2 检查器消费回归：新读数块不冒出，反事实仍是原 M2 语义', async t => {
  const cleanup = trackCleanup(t);
  const evidence = await evidenceFor(t, 'legacy-m1-m2-consumer-regression');
  const root = await temporary(cleanup);
  let m1;
  cleanup(async () => { await m1?.close().catch(() => {}); });
  m1 = await startFetchableServer({ directory: path.join(root, 'mind-village'), profile: 'mind-village', seed: 42,
    port: 0, writable: true, inspectMind: true }, evidence);
  await submitCommand(m1, { version: 1, commandId: 'm1-regression-advance', expectedRevision: 0,
    type: 'AdvanceTime', payload: { ticks: 288 } }, evidence);
  const m1Api = await readMinds(m1, evidence, 'M1-tick288');
  assert.equal(m1Api.mindVersion, 'mind-inspector-v1');
  const m1Actor = actorOf(m1Api);
  const m1Viewer = await openInspector(m1.url, cleanup, evidence);
  await m1Viewer.page.click('#actor-2');
  assert.equal(await m1Viewer.page.textContent('#self-name'), m1Actor.knowledge.self.name);
  assert.equal(await m1Viewer.page.textContent('#decision-choice'), CHOICE_LABEL[m1Actor.lastDecision.choice]);
  assert.equal(await m1Viewer.page.textContent('#cog-window-summary'), '—', 'M1 does not grow an M3 experience window');
  assert.equal(await m1Viewer.page.textContent('#cog-eval-input'), '—', 'M1 does not grow M3 cognition readings');
  assert.equal(await m1Viewer.page.locator('#cognition-review').isVisible(), false);
  assert.equal(await m1Viewer.page.locator('#cognition-experience').isVisible(), false);
  assert.deepEqual(new Set(m1Viewer.requests.map(request => request.method)), new Set(['GET']));
  assert.deepEqual(evidence.console, []);
  evidence.checks.push('real M1 profile API/page retains its own values and does not show M3-only readings');
  await screenshot(m1Viewer.page, evidence, 'm1-tick288');
  await m1Viewer.close();
  await m1.close();
  m1 = null;

  let m2;
  cleanup(async () => { await m2?.close().catch(() => {}); });
  m2 = await startFetchableServer({ directory: path.join(root, 'motivation'), profile: 'motivation-village', seed: 42,
    port: 0, writable: true, inspectMind: true }, evidence);
  await submitCommand(m2, { version: 1, commandId: 'm2-regression-advance', expectedRevision: 0,
    type: 'AdvanceTime', payload: { ticks: 288 } }, evidence);
  const api = await readMinds(m2, evidence, 'M2-tick288');
  assert.equal(api.mindVersion, 'motivation-inspector-v1');
  const actor = actorOf(api);
  assert.equal(actor.counterfactual.length, 3, 'the real M2 projection must contain its three counterfactual cases');
  const viewer = await openInspector(m2.url, cleanup, evidence);
  await viewer.page.click('#actor-2');
  assert.equal(await viewer.page.getAttribute('#actor-2', 'data-active'), 'true');
  assert.equal(await viewer.page.textContent('#self-name'), actor.knowledge.self.name);
  assert.equal(await viewer.page.textContent('#decision-choice'), CHOICE_LABEL[actor.lastDecision.choice], 'M2 labels stay intact');
  assert.equal(await viewer.page.textContent('#cog-window-summary'), '—', 'M2 does not grow an experience window');
  assert.equal(await viewer.page.textContent('#cog-eval-input'), '—', 'M2 clears cognition-only readings');
  assert.equal(await viewer.page.locator('#cognition-review').isVisible(), false);
  assert.equal(await viewer.page.locator('#cognition-experience').isVisible(), false);
  assert.equal(await viewer.page.locator('#m2-counterfactual').isVisible(), true);
  const items = await viewer.page.$$eval('#cf-list li', nodes => nodes.map(node => node.textContent));
  assert.equal(items.length, 3, 'the real M2 page must render all three API counterfactual cases');
  assert.match(await viewer.page.textContent('#m2-counterfactual'), /只读推演/);
  assert.doesNotMatch(await viewer.page.textContent('#cf-empty'), /本轮无反事实/);
  assert.deepEqual(new Set(viewer.requests.map(request => request.method)), new Set(['GET']));
  assert.deepEqual(evidence.console, []);
  assert.deepEqual(evidence.failedRequests, []);
  evidence.checks.push('real M2 API has three cases and browser renders all three; both old profiles remain read-only');
  await screenshot(viewer.page, evidence, 'm2-tick288-three-counterfactuals');
});

test('G4 真实 continuation：tick144 买药后重开服务，tick288 maintain 在浏览器与 API 一致', async t => {
  const cleanup = trackCleanup(t);
  const evidence = await evidenceFor(t, 'continuation-restart-maintain');
  const root = await temporary(cleanup);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const { createM3CloseoutConfig } = await import('../runtime/experiments/m3-closeout-scenario.mjs');
  const fixture = createCognitionVillage(42, 'm34-continuation-closeout', createM3CloseoutConfig('continuation'));
  await saveCheckpoint(fixture.bundle, { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  let server;
  cleanup(async () => { await server?.close().catch(() => {}); });
  server = await startFetchableServer({ directory: runtime, checkpoint: path.join(source, 'checkpoint-r0.json'),
    port: 0, writable: true, inspectMind: true }, evidence);
  await submitCommand(server, { version: 1, commandId: 'g4-continuation-advance-144', expectedRevision: 0,
    type: 'AdvanceTime', payload: { ticks: 144 } }, evidence);
  const day1 = await readMinds(server, evidence, 'continuation-tick144-before-close');
  const first = actorOf(day1);
  const firstPlan = first.knowledge.planState.activePlan;
  assert.ok(firstPlan, 'tick144 real DTO contains the committed plan identity in knowledge.planState');
  assert.equal(day1.tick, 144);
  assert.equal(first.lastDecision.choice, 'BuyMedicine');
  assert.equal(first.lastOutcome.status, 'succeeded');
  await server.close(); server = null;
  evidence.checks.push('real tick144 BuyMedicine committed, then owner closed gracefully');

  server = await startFetchableServer({ directory: runtime, port: 0, writable: true, inspectMind: true }, evidence);
  const restored = await readMinds(server, evidence, 'continuation-restored-tick144');
  assert.deepEqual(restored, day1, 'restart must restore the same tick144 service projection');
  await submitCommand(server, { version: 1, commandId: 'g4-continuation-advance-288', expectedRevision: 144,
    type: 'AdvanceTime', payload: { ticks: 144 } }, evidence);
  const day2 = await readMinds(server, evidence, 'continuation-tick288-after-reopen');
  const second = actorOf(day2);
  assert.equal(day2.tick, 288);
  assert.equal(second.lastDecision.mode, 'maintain');
  assert.equal(second.lastDecision.choice, 'UseMedicine');
  assert.equal(second.lastOutcome.status, 'succeeded');
  assert.deepEqual(second.lastDecision.candidates, []);
  assert.equal(second.lastDecision.goalId, firstPlan.goalId);
  assert.equal(second.lastDecision.planId, firstPlan.planId);
  assert.equal(second.knowledge.self.currentGoal?.goalId, firstPlan.goalId);
  assert.equal(second.lastDecision.sourceReviewDecisionId, first.lastDecision.decisionId);
  assert.equal(second.lastOutcome.delta.herbs, -1);
  assert.equal(second.lastOutcome.delta.health, 100);
  assert.equal(second.workExperience.view.sampleCount, 0);

  const before = await fileBytes(runtime);
  const viewer = await openInspector(server.url, cleanup, evidence);
  await viewer.page.click('#actor-2');
  assert.equal(await viewer.page.textContent('#self-name'), second.knowledge.self.name);
  assert.equal(await viewer.page.textContent('#decision-choice'), CHOICE_LABEL[second.lastDecision.choice]);
  assert.equal(await viewer.page.isVisible('#cog-maintain-note'), true);
  assert.match(await viewer.page.textContent('#cog-maintain-note'), /沿用承诺.*本次未比较候选/);
  assert.match(await viewer.page.textContent('#cog-source-review'), /tick 144/);
  const frozen = JSON.parse(second.lastDecision.knowledgeFingerprint).experience;
  assert.equal(await viewer.page.textContent('#cog-frozen-experience'),
    `决定时冻结：样本 ${frozen.sampleCount} · 失败 ${frozen.failureCount} · 惩罚 ${frozen.penaltyPermille}‰ · 证据 ${frozen.evidenceRefs.join(', ') || '无'} · 经验开关 开`);
  assert.equal(await viewer.page.textContent('#cog-window-summary'),
    `当前窗口：样本 ${second.workExperience.view.sampleCount} · 失败 ${second.workExperience.view.failureCount} · 惩罚 ${second.workExperience.view.penaltyPermille}‰ · 证据 ${second.workExperience.view.evidenceRefs.join(', ') || '无'}`);
  assert.equal(await viewer.page.textContent('#mind-time'), 'tick 288 · revision 288');
  assert.deepEqual([...new Set(viewer.requests.map(request => request.method))], ['GET']);
  assert.deepEqual(await fileBytes(runtime), before, 'browser reads do not mutate the reopened world');
  assert.deepEqual(viewer.errors, []);
  assert.deepEqual(evidence.console, []);
  assert.deepEqual(evidence.failedRequests, []);
  evidence.checks.push('same-directory graceful restart; tick288 maintain/UseMedicine/API/summary/anchor match; browser GET-only');
  await screenshot(viewer.page, evidence, 'continuation-tick288-maintain');
});

test('G4 合法服务 DTO 中的 HTML 名称按文本显示，不创建节点或执行属性代码', async t => {
  const cleanup = trackCleanup(t);
  const evidence = await evidenceFor(t, 'html-name-textcontent-safety');
  const root = await temporary(cleanup);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const { createM3CloseoutConfig } = await import('../runtime/experiments/m3-closeout-scenario.mjs');
  const config = createM3CloseoutConfig('continuation');
  const name = '<img src=x onerror="window.__m34xss=1">X';
  assert.ok(config.memory?.society?.actors?.initialActors?.[1], 'the legal fixture identity is configured on actor2');
  config.memory.society.actors.initialActors[1].name = name;
  const fixture = createCognitionVillage(42, 'm34-html-name', config);
  await saveCheckpoint(fixture.bundle, { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  let server;
  cleanup(async () => { await server?.close().catch(() => {}); });
  server = await startFetchableServer({ directory: runtime, checkpoint: path.join(source, 'checkpoint-r0.json'),
    port: 0, writable: true, inspectMind: true }, evidence);
  const api = await readMinds(server, evidence, 'actual-service-dto-html-name');
  assert.equal(actorOf(api).knowledge.self.name, name, 'the real service DTO must preserve the legal identifier string');
  const viewer = await openInspector(server.url, cleanup, evidence);
  await viewer.page.click('#actor-2');
  assert.equal(await viewer.page.textContent('#self-name'), name);
  assert.equal(await viewer.page.locator('#self-name img').count(), 0);
  assert.equal(await viewer.page.locator('img').count(), 0);
  assert.equal(await viewer.page.evaluate(() => window.__m34xss), undefined);
  assert.deepEqual([...new Set(viewer.requests.map(request => request.method))], ['GET']);
  assert.deepEqual(viewer.errors, []);
  assert.deepEqual(evidence.console, []);
  assert.deepEqual(evidence.failedRequests, []);
  evidence.checks.push('HTML-bearing legal actor name came from real service DTO; rendered as text, no img node or handler execution');
  await screenshot(viewer.page, evidence, 'literal-html-name');
});
