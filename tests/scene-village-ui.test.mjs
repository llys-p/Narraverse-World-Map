import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startRuntimeServer } from '../runtime-server.mjs';
import http from 'node:http';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = process.env.D4_UI_EVIDENCE_DIR || path.join(root, 'artifacts/world-runtime-d4-cp2c-controller');
const browserExe = process.env.D4_UI_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const driver = process.env.D4_UI_PLAYWRIGHT_MODULE || 'C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const giftSelector = '[data-action="gift"][data-recipient-id="actor-2"]';
const pendingKey = 'narraverse.village.pending.v1:scene-survival-village';
const commandRoute = '**/api/runtime/commands';
const projectionRoute = /\/api\/runtime\/(player|scene|encounter)$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (read, predicate, label) => {
  let last;
  for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
    last = await read(); if (predicate(last)) return last; await sleep(40);
  }
  assert.fail(`${label}; last=${JSON.stringify(last)}`);
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const posts = logs => logs.requests.filter(r => r.method === 'POST' && new URL(r.url).pathname === '/api/runtime/commands');
const assertGiftDto = (dto, revision) => {
  assert.deepEqual(Object.keys(dto).sort(), ['commandId', 'expectedRevision', 'payload', 'type', 'version']);
  assert.equal(dto.version, 3); assert.equal(dto.type, 'PlayerGiftFood');
  assert.equal(dto.expectedRevision, revision); assert.equal(typeof dto.commandId, 'string');
  assert.ok(dto.commandId.length > 0); assert.deepEqual(dto.payload, { recipientId: 'actor-2' });
};
const assertGiftReceipt = (receipt, dto) => {
  assert.deepEqual(Object.keys(receipt).sort(), ['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','fromTick','tick','durationTicks','type','outcome','result'].sort());
  assert.equal(receipt.commandId, dto.commandId); assert.equal(receipt.fromRevision, dto.expectedRevision);
  assert.equal(receipt.apiVersion, 1); assert.equal(receipt.receiptVersion, 3); assert.equal(receipt.status, 'committed');
  assert.equal(receipt.type, 'PlayerGiftFood'); assert.equal(receipt.outcome, 'succeeded');
  assert.equal(receipt.toRevision, receipt.fromRevision + 1); assert.equal(receipt.tick, receipt.fromTick); assert.equal(receipt.durationTicks, 0);
  assert.deepEqual(Object.keys(receipt.result).sort(), ['donorId','recipientId','product','quantity','sourceEventSeq','reasonCode'].sort());
  assert.equal(receipt.result.donorId, 'actor-4'); assert.equal(receipt.result.recipientId, 'actor-2');
  assert.equal(receipt.result.product, 'food'); assert.equal(receipt.result.quantity, 1); assert.equal(receipt.result.reasonCode, null);
  assert.ok(Number.isSafeInteger(receipt.result.sourceEventSeq) && receipt.result.sourceEventSeq > 0);
};
const lifecycle = async (name, options, run) => {
  console.log(`BEGIN ${name}`);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2c-ui-'));
  const evidence = path.join(evidenceRoot, `${name}-${process.pid}-${Date.now()}`);
  await fs.mkdir(evidence, { recursive: true });
  const logs = { gate: name, node: process.version, service: null, browserPid: null, stage: 'normal', requests: [], responses: [], console: [], pageErrors: [], failedRequests: [], injections: [], http: [], cleanup: {} };
  const responseTasks = []; let service; let browser; let context; let failure;
  const h = { logs, evidence,
    get url() { return service.url; }, get context() { return context; },
    async http(route, init = {}) {
      const response = await fetch(`${service.url}${route}`, { ...init, headers: { ...init.headers, Connection: 'close' } });
      const text = await response.text(); const record = { method: init.method || 'GET', route, status: response.status, headers: Object.fromEntries(response.headers), requestBody: init.body ?? null, body: text };
      logs.http.push(record); return { response, text, body: text && response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(text) : null };
    },
    async scene() { return (await h.http('/api/runtime/scene')).body; },
    async readSet() {
      return Object.fromEntries(await Promise.all(['player','encounter','scene'].map(async key => [key, (await h.http(`/api/runtime/${key}`)).body])));
    },
    async page() {
      const page = await context.newPage();
      page.on('request', r => logs.requests.push({ stage: logs.stage, method: r.method(), url: r.url(), postData: r.postData() }));
      page.on('response', r => {
        const record = { stage: logs.stage, method: r.request().method(), url: r.url(), status: r.status(), requestBody: r.request().postData() };
        logs.responses.push(record);
        if (new URL(r.url()).pathname.startsWith('/api/runtime/')) responseTasks.push(r.text().then(body => { record.body = body; }, error => { record.bodyError = error.message; }));
      });
      page.on('console', m => logs.console.push({ stage: logs.stage, type: m.type(), text: m.text(), url: m.location().url }));
      page.on('pageerror', e => logs.pageErrors.push({ stage: logs.stage, message: e.stack || String(e) }));
      page.on('requestfailed', r => logs.failedRequests.push({ stage: logs.stage, url: r.url(), postData: r.postData(), error: r.failure()?.errorText }));
      return page;
    },
    async open(page) {
      await page.goto(`${service.url}/runtime-village.html`);
      await until(() => page.locator('#village-revision').textContent(), v => /^\d+$/.test(v), 'village initial coherent read');
    },
    async rendered(page, revision, food) {
      await until(() => page.locator('#village-revision').textContent(), v => v === String(revision), 'rendered revision');
      assert.equal(await page.locator('#village-food').textContent(), String(food));
    },
    async pending(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), pendingKey); },
    async gift(page) {
      const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/runtime/commands') && r.request().method() === 'POST');
      await page.locator(giftSelector).click(); const response = await responsePromise;
      assert.equal(response.status(), 200); const dto = JSON.parse(response.request().postData());
      const receipt = await response.json(); assertGiftDto(dto, dto.expectedRevision); assertGiftReceipt(receipt, dto);
      await h.rendered(page, receipt.toRevision, 20 - receipt.toRevision);
      return { dto, receipt };
    },
    async screenshot(page, label) { await page.screenshot({ path: path.join(evidence, `${label}.png`), fullPage: true }); }
  };
  try {
    const tracked = execFileSync('git', ['ls-files', '--', 'runtime', 'runtime-*.mjs', 'runtime-*.html', 'runtime-*.css'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
    const files = [...new Set([...tracked, 'runtime-village.html','runtime-village.mjs','runtime-village.css','tests/scene-village-ui.test.mjs'])].sort();
    logs.fileHashes = Object.fromEntries(await Promise.all(files.map(async f => [f, await fs.readFile(path.join(root, f)).then(sha, () => 'missing')])));
    logs.sourceHash = sha(JSON.stringify(Object.fromEntries(Object.entries(logs.fileHashes).filter(([f]) => !f.startsWith('tests/')))));
    logs.head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    service = await startRuntimeServer({ directory, profile: options.profile || 'scene-survival-village', seed: 42, port: 0, writable: options.writable !== false, inspectMind: true });
    logs.service = { url: service.url, directory, pid: process.pid };
    if (options.browser) {
      assert.ok(await fs.stat(browserExe).then(() => true, () => false), `required real Edge missing: ${browserExe}`);
      let chromium; try { ({ chromium } = createRequire(import.meta.url)(driver)); } catch (e) { assert.fail(`required Playwright unavailable: ${driver}: ${e.message}`); }
      browser = await chromium.launch({ executablePath: browserExe, headless: true });
      const query = `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${process.pid}" | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*--remote-debugging-pipe*' } | Select-Object -ExpandProperty ProcessId`;
      const ids = execFileSync('powershell.exe', ['-NoProfile', '-Command', query], { encoding: 'utf8', windowsHide: true }).trim().split(/\s+/).filter(Boolean).map(Number);
      assert.equal(ids.length, 1, 'precisely one owned Edge parent'); logs.browserPid = ids[0];
      context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    }
    await run(h);
    assert.equal(logs.pageErrors.length, 0, JSON.stringify(logs.pageErrors));
    assert.equal(logs.requests.some(r => /\/model|bridge|\/api\/(?:llm|models)\b/i.test(r.url)), false);
    for (const error of logs.console.filter(r => r.type === 'error')) {
      assert.ok(logs.injections.some(i => i.stage === error.stage && i.url === error.url && i.expectedError && error.text.includes(i.expectedError)), `unexpected console error: ${JSON.stringify(error)}`);
    }
  } catch (e) { failure = e; logs.failure = { message: e.message, stack: e.stack }; throw e; }
  finally {
    try {
      if (context) await context.close(); if (browser) await browser.close();
      if (logs.browserPid) {
        const pid = execFileSync('powershell.exe', ['-NoProfile','-Command', `Get-CimInstance Win32_Process -Filter "ProcessId = ${logs.browserPid}" | Select-Object -ExpandProperty ProcessId`], { encoding: 'utf8', windowsHide: true }).trim();
        logs.cleanup.browserPidGone = pid === ''; assert.equal(pid, '', 'owned Edge parent exited');
      }
      if (service) {
        await service.close();
        logs.cleanup.lockGone = await fs.stat(path.join(directory, '.runtime-owner.lock')).then(() => false, () => true);
        logs.cleanup.portClosed = await fetch(`${service.url}/healthz`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(1000) }).then(() => false, () => true);
        assert.equal(logs.cleanup.lockGone, true); assert.equal(logs.cleanup.portClosed, true);
      }
      await Promise.allSettled(responseTasks);
      const afterHashes = Object.fromEntries(await Promise.all(Object.keys(logs.fileHashes || {}).map(async f => [f, await fs.readFile(path.join(root, f)).then(sha, () => 'missing')])));
      logs.hashesUnchanged = JSON.stringify(afterHashes) === JSON.stringify(logs.fileHashes);
      assert.equal(logs.hashesUnchanged, true, 'measured source and test bytes unchanged through gate');
      assert.ok(directory.startsWith(path.join(os.tmpdir(), 'd4-cp2c-ui-')) && path.isAbsolute(directory));
      await fs.rm(directory, { recursive: true, force: true }); logs.cleanup.tempRemoved = true;
    } catch (e) { logs.cleanup.failure = e.stack; if (!failure) throw e; }
    finally { await fs.writeFile(path.join(evidence, 'evidence.json'), JSON.stringify(logs, null, 2)); console.log(`END ${name} evidence=${evidence}`); }
  }
};

test('CP2c-R0 scene resources have capability-first method gates and HEAD parity', async () => lifecycle('CP2c-R0', {}, async h => {
  assert.equal((await h.http('/api/runtime/scene')).response.status, 200);
  assert.equal((await h.http('/api/runtime/capabilities')).body.sceneAvailable, true);
  for (const [route, type] of [['/runtime-village.html','text/html'],['/runtime-village.mjs','text/javascript'],['/runtime-village.css','text/css'],['/api/runtime/scene','application/json']]) {
    const get = await h.http(route); assert.equal(get.response.status, 200, route);
    assert.ok(get.response.headers.get('content-type').startsWith(type));
    const head = await h.http(route, { method: 'HEAD' }); assert.equal(head.response.status, 200); assert.equal(head.text, '');
    for (const key of ['content-type','content-length','content-security-policy','cache-control','x-content-type-options']) assert.equal(head.response.headers.get(key), get.response.headers.get(key), `HEAD ${key}`);
    assert.equal((await h.http(`${route}?bad=1`, { method: 'POST' })).response.status, 405, 'method before query');
    assert.equal((await h.http(`${route}?bad=1`)).response.status, 400);
    if (route.endsWith('.html')) {
      assert.match(get.response.headers.get('content-security-policy'), /script-src 'self'/);
      assert.match(get.response.headers.get('content-security-policy'), /style-src 'self'/);
      assert.doesNotMatch(get.text, /<script(?![^>]*\bsrc=)[^>]*>/i);
      assert.doesNotMatch(get.text, /WorldRPG|WorldInv|WorldState|bridge/i);
    }
  }
}));

test('CP2c-R1 old encounter profile exposes no village resource for any method', async () => lifecycle('CP2c-R1', { profile: 'encounter-survival-village' }, async h => {
  for (const route of ['/runtime-village.html','/runtime-village.mjs','/runtime-village.css','/api/runtime/scene'])
    for (const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])
      assert.equal((await h.http(`${route}?bad=1`, { method })).response.status, 404, `${method} ${route} capability first`);
}));

test('CP2c-R2 read-only scene world rejects commands without changing revision', async () => lifecycle('CP2c-R2', { writable: false }, async h => {
  const before = await h.scene();
  const response = await h.http('/api/runtime/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 3, commandId: 'readonly-gift', expectedRevision: 0, type: 'PlayerGiftFood', payload: { recipientId: 'actor-2' } }) });
  assert.equal(response.response.status, 405); assert.deepEqual(await h.scene(), before);
}));

test('CP2c-B1 actual Gift changes one world once while readonly navigation never writes', async () => {
  await lifecycle('CP2c-B1-readonly', { browser: true, writable: false }, async h => {
    const page = await h.page(); await h.open(page);
    assert.equal(await page.locator(giftSelector).isDisabled(), true);
    await page.reload(); await h.rendered(page, 0, 20);
    assert.equal(posts(h.logs).length, 0); assert.equal((await h.scene()).revision, 0);
    await h.screenshot(page, 'readonly');
  });
  await lifecycle('CP2c-B1', { browser: true }, async h => {
    let page = await h.page(); await page.goto(`${h.url}/runtime-map.html`);
    await page.locator('#village-scene-link').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#village-scene-link').getAttribute('href'), '/runtime-village.html');
    await page.locator('#village-scene-link').click(); await h.rendered(page, 0, 20);
    assert.ok(await page.locator('[data-actor-id="actor-2"]').textContent());
    const before = await h.scene(); const { dto, receipt } = await h.gift(page);
    assertGiftDto(dto, 0); assert.equal(receipt.fromTick, 0); assert.equal(receipt.tick, 0);
    const after = await h.scene(); assert.equal(after.simulationId, before.simulationId); assert.equal(after.revision, 1); assert.equal(after.self.food, 19);
    const hunter = after.actors.find(a => a.actorId === 'actor-2'); assert.equal(hunter.receivedGifts.length, 1);
    assert.equal(hunter.receivedGifts[0].observable.commandId, dto.commandId);
    assert.match(await page.locator('[data-actor-id="actor-2"]').textContent(), /粮|food|赠/);
    await page.locator('#village-refresh').click(); await h.rendered(page, 1, 19);
    await page.goBack(); await page.goForward(); await h.rendered(page, 1, 19);
    await page.reload(); await h.rendered(page, 1, 19);
    await page.close(); page = await h.page(); await h.open(page); await h.rendered(page, 1, 19);
    assert.equal(posts(h.logs).length, 1); assert.deepEqual(await h.scene(), after); assert.equal(await h.pending(page), null);
    await h.screenshot(page, 'gift-memory-after-reopen');
  });
});

test('CP2c-B2 committed response loss persists canonical pending through reload and hard tab close', async () => lifecycle('CP2c-B2', { browser: true }, async h => {
  let page = await h.page(); await h.open(page);
  let originalBody; let receipt; let resolveCommitted; const committed = new Promise(resolve => { resolveCommitted = resolve; });
  h.logs.stage = 'response-loss';
  await page.route(commandRoute, async route => {
    originalBody = route.request().postData(); const response = await route.fetch(); receipt = await response.json();
    assert.equal(response.status(), 200); h.logs.injections.push({ stage: h.logs.stage, url: route.request().url(), kind: 'actual-server-commit-before-response-abort', expectedError: 'net::ERR_FAILED', receipt });
    await route.abort('failed'); resolveCommitted();
  });
  await page.locator(giftSelector).click(); await committed; await page.locator('#village-retry').waitFor({ state: 'visible' });
  const dto = JSON.parse(originalBody); assertGiftDto(dto, 0); assertGiftReceipt(receipt, dto);
  const once = await h.scene(); assert.equal(once.revision, 1); assert.equal(once.self.food, 19);
  const pending = await h.pending(page); assert.equal(pending.body, originalBody); assert.deepEqual(pending.dto, dto);
  await page.unroute(commandRoute); await page.reload(); await h.rendered(page, 1, 19);
  assert.deepEqual(await h.pending(page), pending); assert.equal(posts(h.logs).length, 1);
  await page.close({ runBeforeUnload: false }); page = await h.page(); await h.open(page); await h.rendered(page, 1, 19);
  await page.locator('#village-retry').waitFor({ state: 'visible' });
  assert.deepEqual(await h.pending(page), pending); assert.equal(posts(h.logs).length, 1, 'reopen does not auto POST');
  h.logs.stage = 'explicit-retry';
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/runtime/commands') && r.request().method() === 'POST');
  await page.locator('#village-retry').click(); const response = await responsePromise;
  assert.equal(response.status(), 200); assert.equal(response.request().postData(), originalBody); assert.deepEqual(await response.json(), receipt);
  await until(() => h.pending(page), v => v === null, 'pending removed only after valid receipt');
  assert.equal(posts(h.logs).length, 2); assert.deepEqual(await h.scene(), once); await h.screenshot(page, 'confirmed-original-receipt');
}));

test('CP2c-B3 nonJSON 502 and malformed committed receipt preserve original pending intent', async () => lifecycle('CP2c-B3', { browser: true }, async h => {
  const page = await h.page(); await h.open(page);
  for (const kind of ['nonJSON502','malformed200']) {
    let originalBody; let authoritativeReceipt;
    let resolveHandled; let rejectHandled;
    const handled = new Promise((resolve, reject) => { resolveHandled = resolve; rejectHandled = reject; });
    h.logs.stage = kind;
    const before = await h.scene();
    await page.route(commandRoute, async route => {
      try {
      originalBody = route.request().postData();
      if (kind === 'nonJSON502') {
        h.logs.injections.push({ kind: 'synthetic-gateway-response-no-server-commit', stage: kind, url: route.request().url(), expectedError: '502' });
        await route.fulfill({ status: 502, contentType: 'text/html', body: '<p>gateway down</p>' });
      } else {
        const response = await route.fetch(); authoritativeReceipt = await response.json(); assert.equal(response.status(), 200);
        h.logs.injections.push({ kind: 'synthetic-malformed-response-after-real-commit', stage: kind, url: route.request().url(), authoritativeReceipt });
        await route.fulfill({ response, json: { ...authoritativeReceipt, result: { ...authoritativeReceipt.result, sourceEventSeq: null } } });
      }
      resolveHandled();
      } catch (error) { rejectHandled(error); }
    });
    await page.locator(giftSelector).click(); await handled;
    await until(() => page.locator('#village-command-status').textContent(), text => text.includes(kind === 'nonJSON502' ? 'HTTP 502' : '回执不匹配'), 'injected response processing completed');
    await page.locator('#village-retry').waitFor({ state: 'visible' });
    const pending = await h.pending(page); assert.equal(pending.body, originalBody); assertGiftDto(pending.dto, before.revision);
    const after = await h.scene(); assert.equal(after.revision, before.revision + (kind === 'malformed200' ? 1 : 0));
    await page.unroute(commandRoute); await page.reload(); await h.rendered(page, after.revision, after.self.food);
    assert.deepEqual(await h.pending(page), pending);
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/runtime/commands') && r.request().method() === 'POST');
    h.logs.stage = `${kind}-retry`; await page.locator('#village-retry').click(); const retry = await responsePromise;
    assert.equal(retry.request().postData(), originalBody); assert.equal(retry.status(), 200);
    const receipt = await retry.json(); assertGiftReceipt(receipt, pending.dto);
    if (authoritativeReceipt) assert.deepEqual(receipt, authoritativeReceipt);
    await until(() => h.pending(page), v => v === null, 'original pending receipt confirmed'); await h.rendered(page, receipt.toRevision, 20 - receipt.toRevision);
  }
  assert.equal(posts(h.logs).length, 4); assert.equal((await h.scene()).self.food, 18); await h.screenshot(page, 'recovered-bad-responses');
}));

test('CP2c-B4 two real pages race at revision zero and 409 creates no replacement Gift', async () => lifecycle('CP2c-B4', { browser: true }, async h => {
  const pages = [await h.page(), await h.page()]; for (const page of pages) await h.open(page);
  const held = []; let release; const barrier = new Promise(resolve => { release = resolve; }); h.logs.stage = 'real-race-409';
  for (const page of pages) await page.route(commandRoute, async route => {
    held.push(route.request().postData()); if (held.length === 2) release(); await barrier;
    const response = await route.fetch();
    if (response.status() === 409) h.logs.injections.push({ kind: 'actual-stale-DTO-409', stage: h.logs.stage, url: route.request().url(), expectedError: '409', dto: JSON.parse(route.request().postData()) });
    await route.fulfill({ response });
  });
  await Promise.all(pages.map(p => p.locator(giftSelector).click()));
  await until(() => h.logs.responses.filter(r => r.method === 'POST' && r.url.endsWith('/api/runtime/commands')), r => r.length === 2, 'both real command responses');
  const responses = h.logs.responses.filter(r => r.method === 'POST' && r.url.endsWith('/api/runtime/commands'));
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]); assert.notEqual(JSON.parse(held[0]).commandId, JSON.parse(held[1]).commandId);
  for (const body of held) assertGiftDto(JSON.parse(body), 0);
  for (const page of pages) { await page.unroute(commandRoute); await page.locator('#village-refresh').click(); await h.rendered(page, 1, 19); }
  assert.equal(posts(h.logs).length, 2); const scene = await h.scene(); assert.equal(scene.revision, 1); assert.equal(scene.tick, 0); assert.equal(scene.actors.find(a => a.actorId === 'actor-2').receivedGifts.length, 1);
  await h.screenshot(pages[1], 'two-page-conflict');
}));

test('CP2c-B5 synthetic stale reordered and torn projections keep last coherent world and disable writes', async () => lifecycle('CP2c-B5', { browser: true }, async h => {
  const page = await h.page(); await h.open(page); const old = await h.readSet();
  await h.gift(page); const real = await h.readSet();
  for (const variant of ['stale-reordered','torn-scene','torn-player','torn-encounter']) {
    h.logs.stage = variant; h.logs.injections.push({ kind: `synthetic-${variant}`, source: 'legal live projections only; server world unchanged', stage: variant });
    const handler = async route => {
      const key = new URL(route.request().url()).pathname.split('/').at(-1); const response = await route.fetch();
      const body = structuredClone(variant === 'stale-reordered' ? old[key] : real[key]);
      if (variant !== 'stale-reordered' && variant.endsWith(key)) body.revision += 1;
      if (variant === 'stale-reordered') await sleep(key === 'scene' ? 100 : key === 'player' ? 50 : 0);
      await route.fulfill({ response, json: body });
    };
    await page.route(projectionRoute, handler);
    await page.locator('#village-refresh').click();
    await until(() => page.locator('#village-status').textContent(), text => /不一致|迟到|旧|失败|保留/.test(text), 'invalid synthetic projection signalled');
    await h.rendered(page, 1, 19); assert.equal(await page.locator(giftSelector).isDisabled(), true);
    await page.unroute(projectionRoute, handler);
    assert.deepEqual(await h.readSet(), real, 'synthetic response changes never change authority');
    await page.locator('#village-refresh').click(); await until(() => page.locator(giftSelector).isDisabled(), v => v === false, 'real coherent refresh re-enables writes');
  }
  assert.equal(posts(h.logs).length, 1); await h.screenshot(page, 'coherence-restored');
}));

test('CP2c-B6 synthetic names are literal text and dead archived player disables all Gift controls', async () => lifecycle('CP2c-B6', { browser: true }, async h => {
  const page = await h.page(); await h.open(page); await h.gift(page); const real = await h.readSet();
  const name = '<img src=x onerror="window.__villageInjected=1">猎人';
  h.logs.injections.push({ kind: 'synthetic-name-from-legal-scene-shape', source: 'display-only response variant, no authoritative action' });
  const nameHandler = async route => { const response = await route.fetch(); const body = await response.json(); body.actors.find(a => a.actorId === 'actor-2').name = name; await route.fulfill({ response, json: body }); };
  await page.route('**/api/runtime/scene', nameHandler); await page.locator('#village-refresh').click();
  await until(() => page.locator('[data-actor-id="actor-2"]').textContent(), text => text.includes(name), 'literal dynamic name');
  assert.equal(await page.locator('[data-actor-id="actor-2"] img').count(), 0); assert.equal(await page.evaluate(() => window.__villageInjected), undefined);
  await h.screenshot(page, 'literal-name'); await page.unroute('**/api/runtime/scene', nameHandler);
  h.logs.injections.push({ kind: 'synthetic-dead-display-only', source: 'legal live projection copied; not real death/day144 verification' });
  const deadHandler = async route => {
    const key = new URL(route.request().url()).pathname.split('/').at(-1); const response = await route.fetch(); const body = structuredClone(real[key]);
    if (key === 'player') { body.self.identity.alive = false; body.self.identity.deathTick = 0; body.self.health = 0; }
    if (key === 'encounter') { body.self.alive = false; body.self.health = 0; body.self.deathTick = 0; }
    if (key === 'scene') { body.self.alive = false; for (const actor of body.actors) actor.gift = { available: false, reasonCode: 'PLAYER_DEAD' }; }
    await route.fulfill({ response, json: body });
  };
  await page.route(projectionRoute, deadHandler); await page.locator('#village-refresh').click();
  await until(() => page.locator('#village-status').textContent(), text => /死亡|已逝|封存|只供|只读/.test(text), 'dead archived display');
  assert.equal(await page.locator(giftSelector).isDisabled(), true); assert.equal(posts(h.logs).length, 1); assert.deepEqual(await h.readSet(), real);
  assert.equal(real.scene.actors.find(a => a.actorId === 'actor-2').receivedGifts.length, 1, 'synthetic dead view retains real prior gift memory');
  await h.screenshot(page, 'synthetic-dead-archive');
}));

test('CP2c-B7 actual village Gift forest Travel Begin Cancel and return preserves actor memory', async () => lifecycle('CP2c-B7', { browser: true }, async h => {
  const page = await h.page(); await h.open(page); const initial = await h.scene(); const { dto } = await h.gift(page);
  await page.locator('#village-travel').click();
  await until(() => h.scene(), v => v.location === 'forest' && v.tick === 12, 'actual 12 tick travel');
  await page.locator('#village-forest-link').waitFor({ state: 'visible' }); await page.locator('#village-forest-link').click();
  await until(() => page.locator('#scene-revision').textContent(), v => v === '13', 'forest same-world revision');
  await page.locator('#encounter-begin').click();
  const begun = await until(() => h.http('/api/runtime/encounter').then(r => r.body), v => v.encounter?.status === 'active', 'actual encounter Begin');
  assert.equal(begun.tick, 12); assert.equal(begun.revision, 14);
  await page.locator('#encounter-cancel').click();
  const cancelled = await until(() => h.http('/api/runtime/encounter').then(r => r.body), v => v.encounter?.status === 'closed', 'actual encounter Cancel');
  assert.equal(cancelled.tick, 12); assert.equal(cancelled.revision, 15); assert.equal(cancelled.encounter.resolution, 'cancel');
  await page.locator('#scene-exit').click(); await page.locator('#travel-destination').selectOption('village');
  const returnResponsePromise = page.waitForResponse(response => {
    if (!response.url().endsWith('/api/runtime/commands') || response.request().method() !== 'POST') return false;
    const command = JSON.parse(response.request().postData());
    return command.type === 'PlayerTravel' && command.expectedRevision === 15 && command.payload.destination === 'village';
  }, { timeout: 120000 });
  await page.locator('#travel-submit').click(); const returnResponse = await returnResponsePromise;
  assert.equal(returnResponse.status(), 200); const returnReceipt = await returnResponse.json();
  assert.equal(returnReceipt.toRevision, 27); assert.equal(returnReceipt.tick, 24); assert.equal(returnReceipt.durationTicks, 12);
  await until(() => h.scene(), v => v.location === 'village' && v.tick === 24, 'actual 12 tick return Travel');
  await page.locator('#village-scene-link').waitFor({ state: 'visible' }); await page.locator('#village-scene-link').click(); await h.rendered(page, 27, 19);
  const returned = await h.scene(); assert.equal(returned.simulationId, initial.simulationId); assert.equal(returned.revision, 27); assert.equal(returned.tick, 24);
  const hunter = returned.actors.find(a => a.actorId === 'actor-2'); assert.equal(hunter.receivedGifts.length, 1); assert.equal(hunter.receivedGifts[0].observable.commandId, dto.commandId);
  const commandDtos = posts(h.logs).map(r => JSON.parse(r.postData)); assert.deepEqual(commandDtos.map(d => d.type), ['PlayerGiftFood','PlayerTravel','EncounterBegin','EncounterCancel','PlayerTravel']);
  assert.equal(commandDtos.filter(d => d.type === 'PlayerGiftFood').length, 1);
  assert.deepEqual(commandDtos.map(d => d.expectedRevision), [0,1,13,14,15]);
  await page.reload(); await h.rendered(page, 27, 19); assert.deepEqual(await h.scene(), returned); await h.screenshot(page, 'village-return-memory');
}));

test('CP2c-R3 native empty connection timeout sends no response while malformed HTTP remains 400', async () => {
  const originalCreateServer = http.createServer;
  const native = { origin: 'real net.connect sockets; native request timeout; no server.emit', clientErrors: [], connections: [], cleanup: {} };
  let captured;
  http.createServer = function (options, ...args) {
    assert.equal(captured, undefined, 'only the isolated gate server is intercepted');
    captured = originalCreateServer.call(this, { ...options, connectionsCheckingInterval: 100 }, ...args);
    native.server = { requestedOptions: options, requestTimeout: captured.requestTimeout, headersTimeout: captured.headersTimeout, connectionsCheckingInterval: captured.connectionsCheckingInterval };
    captured.on('clientError', (error, socket) => native.clientErrors.push({ code: error.code, message: error.message, bytesRead: socket.bytesRead, bytesWritten: socket.bytesWritten, remotePort: socket.remotePort, rawPacketLength: error.rawPacket?.length ?? null }));
    return captured;
  };
  try {
    await lifecycle('CP2c-R3', {}, async h => {
      h.logs.nativeHTTP = native;
      http.createServer = originalCreateServer;
      native.cleanup.createServerRestored = http.createServer === originalCreateServer;
      assert.equal(native.server.requestTimeout, 5000); assert.equal(native.server.headersTimeout, 5000);
      assert.equal(native.server.connectionsCheckingInterval, 100);
      const connect = payload => new Promise((resolve, reject) => {
        const record = { kind: payload ? 'nonempty-malformed-http' : 'empty-preconnect', sentBytes: 0, responseBytes: 0, response: '', beganAt: new Date().toISOString() };
        native.connections.push(record);
        const socket = net.connect({ host: '127.0.0.1', port: Number(new URL(h.url).port) });
        const timer = setTimeout(() => { record.deadlineExceeded = true; socket.destroy(); reject(new Error('native socket did not close within 35 seconds')); }, 35000);
        socket.on('connect', () => { record.localPort = socket.localPort; if (payload) { socket.write(payload); record.sentBytes = Buffer.byteLength(payload); } });
        socket.on('data', bytes => { record.responseBytes += bytes.length; record.response += bytes.toString('utf8'); });
        socket.on('error', error => { record.clientError = { code: error.code, message: error.message }; });
        socket.on('close', hadError => {
          clearTimeout(timer); record.closedAt = new Date().toISOString(); record.hadError = hadError;
          record.bytesRead = socket.bytesRead; record.bytesWritten = socket.bytesWritten;
          record.destroyed = socket.destroyed; resolve(record);
        });
      });
      const malformed = await connect('NOT HTTP\r\n\r\n');
      const empty = await connect(null);
      const scene = await h.http('/api/runtime/scene');
      native.cleanup.allClientSocketsDestroyed = native.connections.every(c => c.destroyed);
      assert.match(malformed.response, /^HTTP\/1\.1 400 /);
      const badError = native.clientErrors.find(e => e.remotePort === malformed.localPort);
      assert.ok(badError && badError.code.startsWith('HPE_') && badError.bytesRead > 0, 'actual malformed parser error retains 400');
      const timeout = native.clientErrors.find(e => e.remotePort === empty.localPort);
      assert.equal(timeout?.code, 'ERR_HTTP_REQUEST_TIMEOUT');
      assert.equal(timeout.bytesRead, 0); assert.equal(timeout.bytesWritten, 0);
      assert.equal(empty.sentBytes, 0); assert.equal(empty.bytesWritten, 0);
      assert.equal(scene.response.status, 200); assert.equal(scene.body.revision, 0);
      assert.equal(native.cleanup.allClientSocketsDestroyed, true);
      assert.equal(empty.responseBytes, 0, 'empty native timeout must close without any unsolicited HTTP response bytes');
    });
  } finally {
    http.createServer = originalCreateServer;
    native.cleanup.createServerRestored = http.createServer === originalCreateServer;
    assert.equal(native.cleanup.createServerRestored, true);
  }
});

test('CP3-FULL one real world Gift day settlement forest victory village memory and CLI reopen', { timeout: 7200000 }, async () => {
  // This member owns a separate CLI process: synchronous world validation must not block the browser driver.
  const { spawn } = await import('node:child_process');
  const evidence = path.join(root, 'artifacts/world-runtime-d4-cp3-controller', `CP3-FULL-${process.pid}-${Date.now()}`);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp3-full-'));
  await fs.mkdir(evidence, { recursive: true });
  const started = Date.now(), records = { node: process.version, directory, testPid: process.pid, phase: 'setup',
    requests: [], responses: [], console: [], pageErrors: [], failedRequests: [], services: [], commands: [], checkpoints: [], cleanup: {} };
  const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const responseTasks = []; let service, browser, context, page, heartbeat, failure, giftDto, giftReceipt, memory;
  const sources = execFileSync('git', ['ls-files', '--', 'runtime', 'runtime-*.mjs', 'runtime-*.html', 'runtime-*.css'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const frozen = Object.fromEntries(await Promise.all([...sources, 'tests/scene-village-ui.test.mjs'].map(async file => [file, sha(await fs.readFile(path.join(root, file)))])));
  records.frozen = frozen; records.head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const save = () => fs.writeFile(path.join(evidence, 'evidence.json'), JSON.stringify(records, null, 2));
  const bounded = (promise, ms, label) => {
    let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); })]).finally(() => clearTimeout(timer));
  };
  const wait = async (read, predicate, label) => {
    let last; for (const deadline = Date.now() + 180000; Date.now() < deadline;) {
      last = await read(); if (predicate(last)) return last; await sleep(100);
    } assert.fail(`${label}; last=${JSON.stringify(last)}`);
  };
  const checkpoint = async phase => {
    if (phase) records.phase = phase;
    const files = await fs.readdir(directory), signatures = {};
    for (const file of files.filter(file => /^service-commit-r\d+\.json$/.test(file))) {
      const bytes = await fs.readFile(path.join(directory, file)); signatures[file] = { size: bytes.length, sha256: sha(bytes) };
    }
    const owned = [process.pid, ...records.services.map(item => item.pid), records.browserPid].filter(Boolean);
    const query = `$ids=@(${owned.join(',')}); Get-CimInstance Win32_Process | Where-Object { $ids -contains $_.ProcessId -or $ids -contains $_.ParentProcessId } | Select-Object ProcessId,ParentProcessId,Name,KernelModeTime,UserModeTime | ConvertTo-Json -Compress`;
    const cpu = execFileSync('powershell.exe', ['-NoProfile', '-Command', query], { encoding: 'utf8', windowsHide: true }).trim();
    const item = { timestamp: new Date().toISOString(), elapsedMs: Date.now() - started, phase: records.phase, cpu: cpu ? JSON.parse(cpu) : [], signatures };
    records.checkpoints.push(item); await fs.writeFile(path.join(evidence, 'checkpoint.json'), JSON.stringify(item, null, 2)); await save();
    console.log(`CP3 CHECKPOINT ${records.phase} elapsedMs=${item.elapsedMs} servicePid=${service?.child.pid}`);
  };
  const start = async initialize => {
    const args = ['runtime-server.mjs', '--data-dir', directory, '--port', '0', '--writable', 'true', '--inspect-mind', 'true',
      ...(initialize ? ['--profile', 'scene-survival-village', '--seed', '42'] : [])];
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const record = { pid: child.pid, args, stdout: '', stderr: '', ready: null, stopped: false, exit: null }; records.services.push(record);
    let readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const exited = new Promise(resolve => child.once('exit', (code, signal) => { record.exit = { code, signal }; resolve(record.exit); readyReject(new Error(`CLI exited before ready: ${record.stderr}`)); }));
    let lines = '';
    child.stdout.on('data', bytes => {
      record.stdout += bytes.toString(); lines += bytes.toString(); let newline;
      while ((newline = lines.indexOf('\n')) >= 0) {
        const line = lines.slice(0, newline).trim(); lines = lines.slice(newline + 1);
        try { const value = JSON.parse(line); if (value.status === 'ready') { record.ready = value; readyResolve(value); }
          if (value.status === 'stopped') record.stopped = true; } catch {}
      }
    });
    child.stderr.on('data', bytes => { record.stderr += bytes.toString(); }); child.once('error', readyReject);
    service = { child, record, exited, url: null }; const value = await bounded(ready, 600000, 'CLI ready'); service.url = value.url;
    assert.equal(value.writes, true); await checkpoint(initialize ? 'initial-cli-ready' : 'reopened-cli-ready');
  };
  const quit = async () => {
    const current = service; if (!current || current.record.closed) return;
    current.child.stdin.write('quit\n'); const exited = await bounded(current.exited, 600000, 'CLI graceful quit');
    assert.deepEqual(exited, { code: 0, signal: null }); assert.equal(current.record.stopped, true);
    current.record.lockGone = await fs.stat(path.join(directory, '.runtime-owner.lock')).then(() => false, error => error.code === 'ENOENT');
    current.record.portClosed = await fetch(`${current.url}/healthz`, { signal: AbortSignal.timeout(2000) }).then(() => false, () => true);
    assert.equal(current.record.lockGone, true); assert.equal(current.record.portClosed, true); current.record.closed = true;
    await checkpoint('cli-stopped-exit0-lockgone-portclosed');
  };
  const get = async key => {
    const response = await fetch(`${service.url}/api/runtime/${key}`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(180000) });
    assert.equal(response.status, 200, key); return response.json();
  };
  const read = async (label, revision, tick) => {
    const views = Object.fromEntries(await Promise.all(['snapshot','player','minds','encounter','scene'].map(async key => [key, await get(key)])));
    for (const [key, view] of Object.entries(views)) {
      assert.equal(view.simulationId, views.scene.simulationId, `${key} simulationId`); assert.equal(view.revision, revision, `${key} revision`); assert.equal(view.tick, tick, `${key} tick`);
    }
    const bytes = await fs.readFile(path.join(directory, `service-commit-r${revision}.json`)), commit = JSON.parse(bytes);
    assert.equal(commit.serviceFormatVersion, 9); assert.equal(commit.bundle.snapshot.revision, revision); assert.equal(commit.bundle.snapshot.tick, tick);
    assert.equal(commit.bundle.snapshot.simulationId, views.scene.simulationId); assert.equal(commit.commands.length, records.commands.length);
    assert.deepEqual(commit.commands, records.commands.map(({ dto, receipt }) => ({ dto, receipt })));
    await fs.writeFile(path.join(evidence, `${label}-five-projections.json`), canonical(views));
    await fs.writeFile(path.join(evidence, `${label}-service-commit.json`), bytes); await checkpoint(label);
    return { views, commit, world: commit.bundle.snapshot.world };
  };
  const screenshot = label => page.screenshot({ path: path.join(evidence, `${label}.png`), fullPage: true });
  const newPage = async () => {
    const opened = await context.newPage(); opened.setDefaultTimeout(180000); opened.setDefaultNavigationTimeout(180000);
    opened.on('request', request => records.requests.push({ timestamp: new Date().toISOString(), phase: records.phase, method: request.method(), url: request.url(), postData: request.postData() }));
    opened.on('response', response => {
      const item = { phase: records.phase, method: response.request().method(), url: response.url(), status: response.status(), requestBody: response.request().postData() }; records.responses.push(item);
      if (new URL(response.url()).pathname.startsWith('/api/runtime/')) responseTasks.push(response.text().then(body => { item.body = body; }, error => { item.bodyError = error.message; }));
    });
    opened.on('console', message => records.console.push({ phase: records.phase, type: message.type(), text: message.text(), location: message.location() }));
    opened.on('pageerror', error => records.pageErrors.push({ phase: records.phase, message: error.stack || String(error) }));
    opened.on('requestfailed', request => records.failedRequests.push({ phase: records.phase, url: request.url(), error: request.failure()?.errorText }));
    return opened;
  };
  const rendered = (selector, revision) => wait(() => page.locator(selector).textContent(), value => value === String(revision), `UI ${selector}=${revision}`);
  const command = async (label, type, fromRevision, toRevision, tick, durationTicks, action) => {
    await checkpoint(`before-${label}`);
    const pending = page.waitForResponse(response => response.url().endsWith('/api/runtime/commands') && response.request().method() === 'POST', { timeout: 600000 });
    await action(); const response = await pending; assert.equal(response.status(), 200, `${label} HTTP`);
    const dto = JSON.parse(response.request().postData()), receipt = await bounded(response.json(), 180000, `${label} receipt body`);
    assert.equal(dto.version, 3); assert.equal(dto.type, type); assert.equal(dto.expectedRevision, fromRevision);
    assert.equal(receipt.commandId, dto.commandId); assert.equal(receipt.type, type); assert.equal(receipt.status, 'committed'); assert.equal(receipt.outcome, 'succeeded');
    assert.equal(receipt.fromRevision, fromRevision); assert.equal(receipt.toRevision, toRevision); assert.equal(receipt.tick, tick); assert.equal(receipt.durationTicks, durationTicks);
    assert.equal(receipt.fromTick, tick - durationTicks); records.commands.push({ label, dto, receipt }); await checkpoint(`receipt-${label}`);
    return { dto, receipt };
  };
  const backendGift = data => {
    const world = data.world, recipient = world.societyModel.agents.find(agent => agent.state.actorId === 'actor-2');
    assert.equal(world.playerModel.ledger.foodGiven, 1); assert.equal(recipient.trade.foodReceived, 1);
    const gifts = data.commit.bundle.eventLog.filter(event => event.type === 'FoodGiftCommitted'); assert.equal(gifts.length, 1);
    assert.equal(gifts[0].eventSeq, giftReceipt.result.sourceEventSeq); assert.equal(gifts[0].commandId, giftDto.commandId); assert.equal(gifts[0].tick, 0);
    assert.equal(gifts[0].sourceSystem, 'scene'); assert.deepEqual(gifts[0].entityIds, ['actor-4','actor-2']); assert.deepEqual(gifts[0].causationEventSeqs, []);
    assert.deepEqual(gifts[0].payload, { donorId:'actor-4',recipientId:'actor-2',product:'food',quantity:1,location:'village',donorFoodBefore:20,donorFoodAfter:19,recipientFoodBefore:0,recipientFoodAfter:1 });
    for (const actor of world.memoryModel.observer.actors) {
      const entries = actor.memories.filter(entry => entry.observable?.type === 'food-gift');
      assert.equal(entries.length, ['actor-4','actor-2'].includes(actor.actorId) ? 1 : 0);
      if (entries.length) {
        const entry = entries[0]; assert.equal(entry.sourceEventSeq, gifts[0].eventSeq); assert.equal(entry.occurrenceTick, 0); assert.equal(entry.observedTick, 0);
        assert.equal(entry.channel, 'self'); assert.equal(entry.importance, 1);
        assert.deepEqual(entry.observable, {type:'food-gift',donorId:'actor-4',recipientId:'actor-2',product:'food',quantity:1,direction:actor.actorId === 'actor-4' ? 'given' : 'received',commandId:giftDto.commandId});
        if (actor.actorId === 'actor-2' && memory) assert.deepEqual(entry, memory);
      }
    }
    return recipient;
  };
  const visibleMemory = async data => {
    const hunter = data.views.scene.actors.find(actor => actor.actorId === 'actor-2'); assert.ok(hunter); assert.deepEqual(hunter.receivedGifts, [memory]);
    const row = page.locator('[data-actor-id="actor-2"]'); assert.equal(await row.count(), 1);
    assert.match(await row.textContent(), /我记得，你给过我一份口粮。/); await row.locator('details summary').click();
    const text = await row.locator('details p').textContent(); assert.equal(text, `发生时刻：0 tick；来源事实：${memory.sourceEventSeq}；请求编号：${giftDto.commandId}`);
    assert.equal(await row.locator('details p').isVisible(), true);
  };
  try {
    heartbeat = setInterval(() => checkpoint().catch(error => { records.heartbeatError = error.stack; }), 45000);
    let initial, day;
    const resumeSource = process.env.CP3_RESUME_EVIDENCE;
    if (resumeSource) {
      const artifactRoot = await fs.realpath(path.join(root,'artifacts/world-runtime-d4-cp3-controller'));
      const origin = await fs.realpath(resumeSource);
      assert.ok(origin.startsWith(artifactRoot + path.sep) && path.basename(origin).startsWith('CP3-FULL-'), 'resume must name this gate original evidence');
      const originLog = JSON.parse(await fs.readFile(path.join(origin,'evidence.json'),'utf8'));
      assert.equal(originLog.head,records.head); assert.equal(originLog.result,'FAIL');
      assert.equal(originLog.failure.phase,'before-forest156'); assert.match(originLog.failure.message,/Timeout 180000ms/);
      for (const source of sources) assert.equal(originLog.frozen[source],frozen[source],`resume frozen source ${source}`);
      const originalBytes = await fs.readFile(path.join(artifactRoot,'original-scene-village-ui.mjs.bin'));
      const currentBytes = await fs.readFile(path.join(root,'tests/scene-village-ui.test.mjs'));
      assert.deepEqual(currentBytes.subarray(0,originalBytes.length),originalBytes,'all eleven original members remain exact prefix');
      assert.equal(sha(await fs.readFile(path.join(artifactRoot,'first-run-scene-village-ui.mjs.bin'))),originLog.frozen['tests/scene-village-ui.test.mjs']);
      const retained = ['service-commit-r0.json','service-commit-r1.json','service-commit-r145.json'], fileManifest = {};
      for (const file of retained) {
        const bytes=await fs.readFile(path.join(origin,'runtime-data',file));
        const recorded=originLog.checkpoints.find(item=>item.signatures[file])?.signatures[file]; assert.ok(recorded);
        assert.equal(sha(bytes),recorded.sha256); assert.equal(bytes.length,recorded.size);
        await fs.writeFile(path.join(directory,file),bytes); fileManifest[file]=recorded;
      }
      const originCommit=JSON.parse(await fs.readFile(path.join(directory,'service-commit-r145.json'),'utf8'));
      const originDay=JSON.parse(await fs.readFile(path.join(origin,'day144-five-projections.json'),'utf8'));
      const originInitial=JSON.parse(await fs.readFile(path.join(origin,'initial-five-projections.json'),'utf8'));
      const originGift=JSON.parse(await fs.readFile(path.join(origin,'gift-immediate-five-projections.json'),'utf8'));
      assert.equal(canonical(originCommit),canonical(JSON.parse(await fs.readFile(path.join(origin,'day144-service-commit.json'),'utf8'))));
      assert.equal(originCommit.bundle.snapshot.revision,145); assert.equal(originCommit.bundle.snapshot.tick,144);
      assert.equal(originCommit.bundle.snapshot.simulationId,originInitial.scene.simulationId); assert.equal(originCommit.commands.length,2);
      assert.deepEqual(originCommit.commands,originLog.commands.map(({dto,receipt})=>({dto,receipt})));
      assert.deepEqual(originCommit.commands.map(item=>item.dto.type),['PlayerGiftFood','AdvanceTime']);
      records.commands=originCommit.commands.map((item,index)=>({...item,label:index===0?'gift':'day144',source:'original-real-committed-journal'}));
      ({dto:giftDto,receipt:giftReceipt}=originCommit.commands[0]); assertGiftDto(giftDto,0); assertGiftReceipt(giftReceipt,giftDto);
      assert.deepEqual(originCommit.commands[1].dto.payload,{ticks:144}); assert.equal(originCommit.commands[1].receipt.toRevision,145);
      memory=originGift.scene.actors.find(actor=>actor.actorId==='actor-2').receivedGifts[0];
      initial={views:originInitial}; records.resume={origin,fileManifest,originalTwoCommands:originCommit.commands,originalTestSha:originLog.frozen['tests/scene-village-ui.test.mjs'],originalFailure:originLog.failure};
      await start(false); day=await read('resumed-day144',145,144); assert.equal(canonical(day.views),canonical(originDay)); backendGift(day);
      records.resume.exactFiveProjectionContinuity=true;
    } else await start(true);
    const { chromium } = createRequire(import.meta.url)(driver); browser = await chromium.launch({ executablePath: browserExe, headless: true });
    const ids = execFileSync('powershell.exe', ['-NoProfile','-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${process.pid}" | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*--remote-debugging-pipe*' } | Select-Object -ExpandProperty ProcessId`], { encoding:'utf8', windowsHide:true }).trim().split(/\s+/).filter(Boolean).map(Number);
    assert.equal(ids.length, 1); records.browserPid = ids[0]; context = await browser.newContext({ viewport: { width:1440,height:1000 } }); page = await newPage();
    if (!resumeSource) {
    initial = await read('initial', 0, 0); const initialHunter = initial.world.societyModel.agents.find(agent => agent.state.actorId === 'actor-2');
    assert.equal(initial.world.playerModel.inventory.food, 20); assert.equal(initialHunter.state.inventory.food, 0);
    assert.equal(initial.world.actorModel.actors.find(actor => actor.actorId === 'actor-2').hunger, 200); assert.equal(initial.world.resources.food, 540); assert.equal(initialHunter.state.wallet, 0);
    await page.goto(`${service.url}/runtime-map.html`); await page.locator('#village-scene-link').waitFor({state:'visible'}); await page.locator('#village-scene-link').click(); await rendered('#village-revision', 0); await screenshot('01-village-initial');
    ({ dto:giftDto, receipt:giftReceipt } = await command('gift', 'PlayerGiftFood', 0, 1, 0, 0, () => page.locator(giftSelector).click()));
    assertGiftDto(giftDto, 0); assertGiftReceipt(giftReceipt, giftDto); await rendered('#village-revision', 1);
    const gifted = await read('gift-immediate', 1, 0); const recipient = backendGift(gifted);
    assert.equal(gifted.world.playerModel.inventory.food, 19); assert.equal(recipient.state.inventory.food, 1); assert.equal(gifted.world.resources.food, 540);
    assert.equal(recipient.state.wallet, initialHunter.state.wallet); assert.equal(gifted.world.playerModel.wallet, initial.world.playerModel.wallet);
    memory = gifted.views.scene.actors.find(actor => actor.actorId === 'actor-2').receivedGifts[0]; await visibleMemory(gifted); await screenshot('02-gift-immediate-memory');
    await page.locator('a[href="/runtime-map.html"]').click(); await page.locator('#advance-ticks').selectOption('144');
    await command('day144', 'AdvanceTime', 1, 145, 144, 144, () => page.locator('#advance').click());
    day = await read('day144', 145, 144); const dayHunter = backendGift(day);
    assert.equal(day.world.playerModel.inventory.food, 18); assert.equal(day.world.playerModel.ledger.foodUsed, 1); assert.equal(dayHunter.state.inventory.food, 0);
    assert.equal(dayHunter.state.ledger.foodUsed, 1); assert.equal(day.world.actorModel.actors.find(actor => actor.actorId === 'actor-2').hunger, 100);
    assert.equal(day.world.resources.food, 464); assert.equal(dayHunter.state.ledger.wages, 0);
    assert.deepEqual(day.world.experienceModel.actors.find(actor => actor.actorId === 'actor-2').workExperienceState.samples, []);
    await wait(() => page.locator('#player-food').textContent(), value => value === '18', 'day144 player food'); await screenshot('03-day144-real-settlement');
    } else {
      await page.goto(`${service.url}/runtime-map.html`); await wait(()=>page.locator('#player-food').textContent(),value=>value==='18','restored day144 UI');
      await screenshot('03-restored-day144-real-settlement');
    }
    await page.locator('#travel-destination').selectOption('forest'); await command('forest156', 'PlayerTravel', 145, 157, 156, 12, () => page.locator('#travel-submit').click());
    const forest = await read('forest156', 157, 156); backendGift(forest); assert.equal(forest.views.scene.location, 'forest'); assert.equal(forest.views.encounter.population.totalLivingWolves, 14);
    const healthAnchor = forest.views.player.self.health; records.healthAnchorAt156 = healthAnchor;
    await page.locator('#forest-scene-link').waitFor({state:'visible'}); await page.locator('#forest-scene-link').click(); await rendered('#scene-revision',157);
    await command('begin156', 'EncounterBegin',157,158,156,0, () => page.locator('#encounter-begin').click()); const active = await read('active156',158,156);
    assert.equal(active.views.encounter.encounter.status,'active'); assert.equal(active.views.encounter.population.reservedWolves,1); await rendered('#scene-revision',158);
    // Leaving and reading the active scene cannot silently cancel its reservation.
    await page.locator('#scene-exit').click(); await page.goto(`${service.url}/runtime-village.html`); await rendered('#village-revision',158);
    assert.equal(await page.locator('#village-travel').isDisabled(),true); assert.equal((await get('encounter')).encounter.status,'active');
    await page.locator('#village-forest-link').click(); await rendered('#scene-revision',158); assert.deepEqual(await get('encounter'),active.views.encounter);
    await command('attack162','EncounterAction',158,164,162,6, () => page.locator('#encounter-attack').click()); const first = await read('attack162',164,162);
    assert.equal(first.views.encounter.encounter.status,'active'); assert.equal(first.views.encounter.encounter.wolfHealth,150); assert.equal(first.views.player.self.health,healthAnchor-80); await rendered('#scene-revision',164);
    await command('victory168','EncounterAction',164,170,168,6, () => page.locator('#encounter-attack').click()); const victory = await read('victory168',170,168); backendGift(victory);
    assert.equal(victory.views.encounter.encounter.status,'closed'); assert.equal(victory.views.encounter.encounter.resolution,'win'); assert.equal(victory.views.encounter.encounter.wolfHealth,0);
    assert.deepEqual(victory.views.encounter.population,{totalLivingWolves:13,availableWolves:13,reservedWolves:0,battleDeaths:1}); assert.equal(victory.views.player.self.health,healthAnchor-80);
    await rendered('#scene-revision',170); await screenshot('04-forest-victory'); await page.locator('#scene-exit').click(); await page.locator('#travel-destination').selectOption('village');
    await command('return180','PlayerTravel',170,182,180,12, () => page.locator('#travel-submit').click()); const returned = await read('return180',182,180); backendGift(returned);
    assert.equal(returned.views.scene.location,'village'); assert.equal(returned.views.scene.self.food,18); assert.equal(returned.views.scene.simulationId,initial.views.scene.simulationId);
    await page.locator('#village-scene-link').waitFor({state:'visible'}); await page.locator('#village-scene-link').click(); await rendered('#village-revision',182); await visibleMemory(returned); await screenshot('05-return-village-memory');
    await page.reload(); await rendered('#village-revision',182); const refreshed = await read('refreshed',182,180); assert.equal(canonical(refreshed.views),canonical(returned.views)); await visibleMemory(refreshed);
    await page.close({runBeforeUnload:false}); page = await newPage(); await page.goto(`${service.url}/runtime-village.html`); await rendered('#village-revision',182);
    const tabReopened = await read('hard-tab-reopened',182,180); assert.equal(canonical(tabReopened.views),canonical(returned.views)); await visibleMemory(tabReopened); await screenshot('06-hard-tab-reopen');
    await page.close({runBeforeUnload:false}); await quit(); await start(false); page = await newPage(); await page.goto(`${service.url}/runtime-map.html`);
    await page.locator('#village-scene-link').waitFor({state:'visible'}); await page.locator('#village-scene-link').click(); await rendered('#village-revision',182);
    const reopened = await read('service-reopened',182,180); backendGift(reopened); assert.equal(canonical(reopened.views),canonical(returned.views)); assert.equal(canonical(reopened.commit),canonical(returned.commit));
    await visibleMemory(reopened); await screenshot('07-service-reopened-memory');
    const allPosts = posts(records), newCommands = records.commands.slice(resumeSource ? 2 : 0); assert.equal(allPosts.length,resumeSource ? 5 : 7); assert.deepEqual(allPosts.map(item => JSON.parse(item.postData)),newCommands.map(item => item.dto));
    assert.deepEqual(records.commands.map(item => item.dto.type),['PlayerGiftFood','AdvanceTime','PlayerTravel','EncounterBegin','EncounterAction','EncounterAction','PlayerTravel']);
    assert.deepEqual(records.commands.map(item => item.dto.expectedRevision),[0,1,145,157,158,164,170]);
    assert.deepEqual(records.commands.slice(4,6).map(item => item.dto.payload.action),['attack','attack']);
    assert.equal(records.pageErrors.length,0,JSON.stringify(records.pageErrors)); assert.deepEqual(records.console.filter(item => item.type === 'error'),[]);
    assert.equal(records.requests.some(item => /\/model|bridge|\/api\/(?:llm|models)\b/i.test(item.url)),false); records.result='PASS';
  } catch (error) { failure=error; records.result='FAIL'; records.failure={message:error.message,stack:error.stack,elapsedMs:Date.now()-started,phase:records.phase}; throw error; }
  finally {
    clearInterval(heartbeat);
    try {
      await checkpoint('final-evidence-preservation');
      if (context) await context.close(); if (browser) await browser.close();
      if (records.browserPid) {
        const alive=execFileSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ProcessId = ${records.browserPid}" | Select-Object -ExpandProperty ProcessId`],{encoding:'utf8',windowsHide:true}).trim();
        records.cleanup.browserPidGone=alive===''; assert.equal(alive,'');
      }
      await quit(); await Promise.allSettled(responseTasks);
      await fs.mkdir(path.join(evidence,'runtime-data'),{recursive:true});
      for (const file of (await fs.readdir(directory)).filter(file=>/^service-commit-r\d+\.json$/.test(file)))
        await fs.copyFile(path.join(directory,file),path.join(evidence,'runtime-data',file));
      const after=Object.fromEntries(await Promise.all(Object.keys(frozen).map(async file=>[file,sha(await fs.readFile(path.join(root,file)))])));
      records.cleanup.frozenUnchanged=canonical(after)===canonical(frozen); assert.equal(records.cleanup.frozenUnchanged,true);
      assert.ok(path.isAbsolute(directory) && directory.startsWith(path.join(os.tmpdir(),'d4-cp3-full-')));
      await fs.rm(directory,{recursive:true,force:true}); records.cleanup.tempRemoved=true;
    } catch (error) { records.cleanup.failure=error.stack; if (!failure) throw error; }
    finally { records.elapsedMs=Date.now()-started; await save(); console.log(`END CP3-FULL result=${records.result} evidence=${evidence}`); }
  }
});
