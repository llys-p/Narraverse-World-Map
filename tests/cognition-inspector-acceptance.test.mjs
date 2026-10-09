// M3-4B G4：真实浏览器消费者验收（B 路）。真实 Edge/Chromium 驱动、自建 port0 服务、全新临时
// 浏览器上下文；页面只做 GET，世界推进全部由本 harness 的 Node 侧同源 POST 完成并单独标注。
// 合同：m3-closeout-contract-v1 §G4 与 M3-4A 共同合同 §3。缺驱动/页面不可加载/断言失败均阻断 PASS。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { startRuntimeServer } from '../runtime-server.mjs';
import { saveCheckpoint } from '../runtime/persistence/checkpoint-store.mjs';
import { createCognitionVillage, cognitionSystems } from '../runtime/fixtures/cognition-village.mjs';
import { COGNITION_RULES } from '../runtime/service/http-contract.mjs';

const require = createRequire(import.meta.url);
const PLAYWRIGHT = 'C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const { chromium } = require(PLAYWRIGHT);
assert.equal(typeof chromium.launch, 'function', 'the local Playwright driver must be usable');

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
const actorOf = projection => projection.actors.find(actor => actor.knowledge.actorId === 'actor-2');
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
async function openInspector(url) {
  const browser = await chromium.launch({ executablePath: EDGE });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  await page.goto(url + '/runtime-mind.html', { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  return { page, context, errors, requests,
    close: async () => { await context.close().catch(() => {}); await browser.close().catch(() => {}); } };
}
// Harness-side POSTs drive the world forward; one owner per directory, so the same service that
// the browser reads is the one that accepts these commands. from/to must advance monotonically:
// resubmitting an already committed commandId is a legitimate 409, not a retry.
async function driveTo(server, from, to) {
  for (const [commandId, kind, amount] of RECIPE.slice(from, to)) {
    const revision = (await (await fetch(server.url + '/api/runtime/snapshot')).json()).revision;
    const started = Date.now();
    const response = await fetch(server.url + '/api/runtime/commands', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify(dtoFor(commandId, kind, amount, revision)) });
    const receipt = await response.json().catch(() => null);
    console.log(`# POST ${commandId} -> ${response.status} in ${Date.now() - started}ms`);
    assert.equal(response.status, 200, commandId + ' refused: ' + JSON.stringify(receipt));
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
  const root = await temporary(cleanup);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const { createM3CloseoutConfig } = await import('../runtime/experiments/m3-closeout-scenario.mjs');
  await saveCheckpoint(createCognitionVillage(42, 'm34-g4-browser', createM3CloseoutConfig('work-learning', true)).bundle,
    { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  // One writable service is both the driver and the source the browser reads: a second owner on
  // the same directory is refused by design.
  const server = await startRuntimeServer({ directory: runtime,
    checkpoint: path.join(source, 'checkpoint-r0.json'), port: 0, writable: true, inspectMind: true });
  cleanup(() => server.close());

  await driveTo(server, 0, 3);   // to tick 288: the day-2 rejection
  const viewer = await openInspector(server.url);
  cleanup(() => viewer.close());
  await viewer.page.click('#actor-2');
  let api = await (await fetch(server.url + '/api/runtime/minds')).json();
  let day2 = actorOf(api);
  assert.equal(api.revision, 288, 'the reading the page just took is the revision the harness drove to');
  assert.equal(await viewer.page.textContent('#decision-choice'), CHOICE_LABEL[day2.lastDecision.choice], 'the visible choice label maps the API value');
  assert.equal(await viewer.page.textContent('#outcome-status'), '拒绝',
    'the browser must show the authority rejection, not a planner opinion');
  assert.match(await viewer.page.textContent('#cog-window-summary'), /样本 1 · 失败 1 · 惩罚 100‰/);
  assert.match(await viewer.page.textContent('#decision-gate'), /重大职责/);

  await driveTo(server, 3, 4);   // to tick 432: day 3 under ON
  await refreshTo(viewer.page, 432);
  api = await (await fetch(server.url + '/api/runtime/minds')).json();
  const day3 = actorOf(api);
  assert.equal(api.revision, 432);
  assert.equal(day3.lastDecision.choice, 'UseMedicine', 'the API says the stored failure moved the choice');
  assert.equal(await viewer.page.textContent('#decision-choice'), '用药',
    'the visible label must match the page dictionary for this API value');
  assert.match(await viewer.page.textContent('#cog-window-summary'), /样本 1 · 失败 1 · 惩罚 100‰/,
    'using medicine adds no Work sample');
  // The frozen reading of that decision stays separate from the current window.
  assert.notEqual(await viewer.page.textContent('#cog-frozen-experience'), '—',
    'the decision-time experience must be readable from the frozen fingerprint');
  assert.deepEqual(viewer.errors, [], 'the inspector page must run without page or console errors');
  // Read-only: every browser request was a GET, while the harness POSTed the world forward.
  const methods = new Set(viewer.requests.map(request => request.method));
  assert.deepEqual([...methods].sort(), ['GET'], 'the inspector itself must never write');
  assert.ok(viewer.requests.every(request => !request.url.includes('/api/runtime/commands')));
});

test('G4 十日后窗口归零与低频 maintain 在页面上如实显示，切换人物与键盘刷新不写世界', async t => {
  const cleanup = trackCleanup(t);
  const root = await temporary(cleanup);
  const source = path.join(root, 'source'), runtime = path.join(root, 'runtime');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const { createM3CloseoutConfig } = await import('../runtime/experiments/m3-closeout-scenario.mjs');
  await saveCheckpoint(createCognitionVillage(42, 'm34-g4-late', createM3CloseoutConfig('work-learning', true)).bundle,
    { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  const server = await startRuntimeServer({ directory: runtime,
    checkpoint: path.join(source, 'checkpoint-r0.json'), port: 0, writable: true, inspectMind: true });
  cleanup(() => server.close());
  await driveTo(server, 0, 12);   // to tick 1440: the fourth real success zeroes the window
  const viewer = await openInspector(server.url);
  cleanup(() => viewer.close());
  const diskBefore = await fileBytes(runtime);
  const api = await (await fetch(server.url + '/api/runtime/minds')).json();
  assert.equal(api.revision, 1440, 'the ten-day world really reached tick 1440 through the service');
  const day10 = actorOf(api);
  assert.match(await viewer.page.textContent('#cog-window-summary'), /惩罚 0‰/);
  assert.equal(day10.workExperience.view.penaltyPermille, 0);
  assert.equal(await viewer.page.textContent('#cog-window-summary'),
    `当前窗口：样本 ${day10.workExperience.view.sampleCount} · 失败 ${day10.workExperience.view.failureCount} · 惩罚 0‰ · 证据 ${day10.workExperience.view.evidenceRefs.join(', ') || '无'}`,
    'the zeroed window must be shown exactly as the API reports it');
  // Low-frequency continuation: the note appears for a maintain decision and stays hidden otherwise.
  const mode = day10.lastDecision?.mode ?? null;
  assert.equal(await viewer.page.isVisible('#cog-maintain-note'), mode === 'maintain',
    `the maintain note must follow the API mode (${JSON.stringify(mode)})`);
  if (mode === 'maintain') assert.match(await viewer.page.textContent('#cog-maintain-note'), /沿用承诺/);
  // Switch to the other managed actor and back with the keyboard (2, 1, R).
  const other = api.actors.find(actor => actor.knowledge.actorId === 'actor-3');
  await viewer.page.keyboard.press('2');
  assert.equal(await viewer.page.textContent('#knowledge-title'), '本人所知 · ' + other.knowledge.self.name);
  await viewer.page.keyboard.press('1');
  assert.equal(await viewer.page.textContent('#knowledge-title'), '本人所知 · ' + actorOf(api).knowledge.self.name);
  await viewer.page.keyboard.press('r');
  await viewer.page.waitForFunction(() => document.getElementById('mind-status').dataset.state === 'ready');
  assert.match(await viewer.page.textContent('#mind-time'), /revision 1440/);
  // Two tabs at once: both stay read-only and the durable bytes never move.
  const second = await viewer.context.newPage();
  const secondRequests = [];
  second.on('request', request => secondRequests.push(request.method()));
  await second.goto(server.url + '/runtime-mind.html', { waitUntil: 'domcontentloaded' });
  await waitForReady(second);
  await viewer.page.reload({ waitUntil: 'domcontentloaded' }); await waitForReady(viewer.page);
  assert.deepEqual([...new Set(secondRequests)], ['GET'], 'the second tab must not write either');
  assert.deepEqual(await fileBytes(runtime), diskBefore, 'two read-only tabs change no durable byte');
  assert.deepEqual(viewer.errors, [], 'no page or console errors while browsing both tabs');
});

test('G4 断连保留最后读数并给出明确失败态，页面只用 textContent 渲染', async t => {
  const cleanup = trackCleanup(t);
  const root = await temporary(cleanup);
  const directory = path.join(root, 'world');
  const server = await startRuntimeServer({ directory, profile: 'cognition-village', port: 0, inspectMind: true });
  cleanup(() => server.close());
  const viewer = await openInspector(server.url);
  cleanup(() => viewer.close());
  const reading = await viewer.page.textContent('#mind-time');
  assert.match(reading, /revision 0/);
  const html = await fs.readFile(new URL('../runtime-mind.mjs', import.meta.url), 'utf8');
  const markup = await fs.readFile(new URL('../runtime-mind.html', import.meta.url), 'utf8');
  assert.equal((html.match(/innerHTML|insertAdjacentHTML|document\.write/g) ?? []).length, 0,
    'the inspector must never inject string markup');
  assert.equal((markup.match(/innerHTML|onerror=/g) ?? []).length, 0);
  // Drop the server: the last reading stays and the failure state becomes explicit.
  await server.close();
  await viewer.page.click('#mind-refresh');
  await viewer.page.waitForFunction(() => document.getElementById('mind-status').dataset.state !== 'ready', null,
    { timeout: 15000 });
  assert.equal(await viewer.page.textContent('#mind-time'), reading, 'the stale reading must not be cleared');
  const state = await viewer.page.getAttribute('#mind-status', 'data-state');
  assert.notEqual(state, 'ready', 'a disconnected inspector reports failure');
  assert.match(await viewer.page.textContent('#mind-status'), /.+/, 'the failure carries a visible message');
});

test('G4 旧 M1/M2 检查器消费回归：新读数块不冒出，反事实仍是原 M2 语义', async t => {
  const cleanup = trackCleanup(t);
  const root = await temporary(cleanup);
  const directory = path.join(root, 'motivation');
  const server = await startRuntimeServer({ directory, profile: 'motivation-village', seed: 42,
    port: 0, writable: true, inspectMind: true });
  cleanup(() => server.close());
  const advance = await fetch(server.url + '/api/runtime/commands', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, commandId: 'm2-regression-advance', expectedRevision: 0,
      type: 'AdvanceTime', payload: { ticks: 288 } }) });
  assert.equal(advance.status, 200, 'the M2 world must still accept its own time DTO');
  const viewer = await openInspector(server.url);
  cleanup(() => viewer.close());
  await viewer.page.click('#actor-2');
  const api = await (await fetch(server.url + '/api/runtime/minds')).json();
  const actor = api.actors.find(entry => entry.knowledge.actorId === 'actor-2');
  // The M2 blocks keep showing M2 facts.
  assert.equal(await viewer.page.textContent('#decision-choice'), CHOICE_LABEL[actor.lastDecision.choice], 'M2 labels stay intact');
  assert.match(await viewer.page.textContent('#cog-window-summary'), /^—$/,
    'a motivation world must not grow an experience window');
  assert.match(await viewer.page.textContent('#cog-eval-input'), /^尚无评审记录$|^—$/,
    'a motivation world must not invent cognition review readings');
  // The counterfactual section stays the M2 one: a real list, never the cognition null text.
  const empty = await viewer.page.textContent('#cf-empty');
  const items = await viewer.page.$$eval('#cf-list li', nodes => nodes.map(node => node.textContent))
    .catch(() => []);
  assert.ok(items.length === 3 || (items.length === 0 && /暂无反事实记录/.test(empty ?? '')),
    'the M2 counterfactual semantics must stay intact');
  assert.doesNotMatch(empty ?? '', /本轮无反事实/, 'the cognition null wording must not leak into M2 pages');
});
