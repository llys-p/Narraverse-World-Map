import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

import {startRuntimeServer} from '../runtime-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceBase = path.join(root, 'artifacts', 'world-runtime-d4b-acceptance');
const edgeExe = process.env.D4B_UI_BROWSER_EXECUTABLE
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const playwrightPath = process.env.D4B_UI_PLAYWRIGHT_MODULE
  ?? 'C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const giftSelector = '[data-action="gift"][data-recipient-id="actor-2"]';
const projections = /\/api\/runtime\/(?:player|encounter|scene)$/;
const commandPath = '/api/runtime/commands';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

let chromium;
assert.ok(await fs.stat(edgeExe).then(() => true, () => false), `required Edge executable missing: ${edgeExe}`);
try {
  ({chromium} = createRequire(import.meta.url)(playwrightPath));
} catch (error) {
  assert.fail(`required existing Playwright driver unavailable at ${playwrightPath}: ${error.message}`);
}

function giftDto(commandId, expectedRevision) {
  return {version: 3, commandId, expectedRevision, type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}};
}

function assertGiftDto(dto, expectedRevision) {
  assert.deepEqual(Object.keys(dto).sort(), ['commandId', 'expectedRevision', 'payload', 'type', 'version']);
  assert.equal(dto.version, 3);
  assert.equal(dto.type, 'PlayerGiftFood');
  assert.equal(dto.expectedRevision, expectedRevision);
  assert.equal(typeof dto.commandId, 'string');
  assert.ok(dto.commandId.length > 0);
  assert.deepEqual(dto.payload, {recipientId: 'actor-2'});
}

function assertGiftReceipt(receipt, dto, outcome = 'succeeded') {
  assert.deepEqual(Object.keys(receipt).sort(), [
    'apiVersion', 'receiptVersion', 'commandId', 'status', 'fromRevision', 'toRevision',
    'fromTick', 'tick', 'durationTicks', 'type', 'outcome', 'result',
  ].sort());
  assert.equal(receipt.commandId, dto.commandId);
  assert.equal(receipt.fromRevision, dto.expectedRevision);
  assert.equal(receipt.apiVersion, 1);
  assert.equal(receipt.receiptVersion, 3);
  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.type, 'PlayerGiftFood');
  assert.equal(receipt.outcome, outcome);
  assert.equal(receipt.toRevision, receipt.fromRevision + 1);
  assert.equal(receipt.tick, receipt.fromTick);
  assert.equal(receipt.durationTicks, 0);
  assert.deepEqual(Object.keys(receipt.result).sort(),
    ['donorId', 'recipientId', 'product', 'quantity', 'sourceEventSeq', 'reasonCode'].sort());
  assert.equal(receipt.result.donorId, 'actor-4');
  assert.equal(receipt.result.recipientId, 'actor-2');
  assert.equal(receipt.result.product, 'food');
  assert.equal(receipt.result.quantity, 1);
  if (outcome === 'succeeded') {
    assert.equal(receipt.result.reasonCode, null);
    assert.ok(Number.isSafeInteger(receipt.result.sourceEventSeq) && receipt.result.sourceEventSeq > 0);
  } else {
    assert.equal(receipt.result.reasonCode, 'ENCOUNTER_BUSY');
    assert.equal(receipt.result.sourceEventSeq, null);
  }
}

async function eventually(read, predicate, label, timeoutMs = 30000) {
  let last;
  for (const end = Date.now() + timeoutMs; Date.now() < end;) {
    last = await read();
    if (predicate(last)) return last;
    await sleep(50);
  }
  assert.fail(`${label}; last=${JSON.stringify(last)}`);
}

async function capturePage(context, logs, getStage) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);
  page.on('request', request => logs.requests.push({
    stage: getStage(), method: request.method(), url: request.url(), postData: request.postData(),
  }));
  page.on('response', response => {
    const record = {stage: getStage(), method: response.request().method(), url: response.url(),
      status: response.status(), requestBody: response.request().postData()};
    logs.responses.push(record);
    if (new URL(response.url()).pathname.startsWith('/api/runtime/')) {
      logs.responseBodies.push(response.text().then(body => { record.body = body; }, error => { record.bodyError = error.message; }));
    }
  });
  page.on('console', message => logs.console.push({
    stage: getStage(), type: message.type(), text: message.text(), location: message.location(),
  }));
  page.on('pageerror', error => logs.pageErrors.push({stage: getStage(), message: error.stack || String(error)}));
  page.on('requestfailed', request => logs.failedRequests.push({
    stage: getStage(), url: request.url(), method: request.method(), postData: request.postData(),
    error: request.failure()?.errorText,
  }));
  return page;
}

async function lifecycle(name, run) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `d4b-scene-ui-${process.pid}-`));
  const dataDir = path.join(tempRoot, 'runtime-data');
  const userDataDir = path.join(tempRoot, 'isolated-edge-user-data');
  const evidence = path.join(evidenceBase, `${name}-${process.pid}-${Date.now()}`);
  await fs.mkdir(evidence, {recursive: true});
  const logs = {
    gate: name, startedAt: new Date().toISOString(), node: process.version,
    head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    testSha256: sha(await fs.readFile(fileURLToPath(import.meta.url))),
    edgeExecutable: edgeExe, playwrightModule: playwrightPath,
    dataDir, isolatedUserDataDir: userDataDir, evidence,
    service: null, browserPid: null, stage: 'setup',
    requests: [], responses: [], responseBodies: [], console: [], pageErrors: [], failedRequests: [],
    http: [], injections: [], screenshots: [], cleanup: {},
  };
  let service, context, failure;
  const getStage = () => logs.stage;
  const h = {
    logs, evidence,
    get url() { return service.url; },
    get context() { return context; },
    async start(profile = 'scene-survival-village', restore = false) {
      service = await startRuntimeServer({directory: dataDir, port: 0, writable: true,
        ...(restore ? {} : {profile, seed: 42})});
      logs.service = {...(logs.service ?? {}), url: service.url, directory: dataDir,
        port: Number(new URL(service.url).port), profile: restore ? 'restored-from-directory' : profile};
      return service;
    },
    async browser() {
      context = await chromium.launchPersistentContext(userDataDir, {
        executablePath: edgeExe, headless: true, viewport: {width: 1440, height: 1000},
      });
      const executablePath = path.resolve(edgeExe).replaceAll("'", "''");
      const isolatedDir = userDataDir.replaceAll("'", "''");
      const command = `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${executablePath}' -and $_.CommandLine -like '*${isolatedDir}*' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1 -ExpandProperty ProcessId`;
      const processId = execFileSync('powershell.exe', ['-NoProfile', '-Command', command],
        {encoding: 'utf8', windowsHide: true}).trim();
      logs.browserPid = processId ? Number(processId) : null;
      logs.browser = {pid: logs.browserPid, isolatedUserDataDir: userDataDir, headless: true};
      assert.ok(Number.isSafeInteger(logs.browserPid), 'the isolated Edge process ID must be recorded');
      return context;
    },
    async page() { return capturePage(context, logs, getStage); },
    async http(route, init = {}) {
      const response = await fetch(`${service.url}${route}`, {
        ...init, headers: {...init.headers, Connection: 'close'},
      });
      const text = await response.text();
      const record = {stage: logs.stage, method: init.method ?? 'GET', route,
        status: response.status, headers: Object.fromEntries(response.headers),
        requestBody: init.body ?? null, body: text};
      logs.http.push(record);
      return {response, text, body: text && response.headers.get('content-type')?.startsWith('application/json')
        ? JSON.parse(text) : null};
    },
    async readViews() {
      const keys = ['player', 'encounter', 'scene'];
      return Object.fromEntries(await Promise.all(keys.map(async key => [
        key, (await h.http(`/api/runtime/${key}`)).body,
      ])));
    },
    async scene() { return (await h.http('/api/runtime/scene')).body; },
    async openMap(page) {
      await page.goto(`${service.url}/runtime-map.html`);
      await page.locator('#village-scene-link').waitFor({state: 'visible'});
    },
    async enterVillage(page) {
      await h.openMap(page);
      await page.locator('#village-scene-link').click();
      await eventually(() => page.locator('#village-revision').textContent(), value => /^\d+$/.test(value),
        'village initial read');
    },
    async rendered(page, revision, food) {
      await eventually(() => page.locator('#village-revision').textContent(), value => value === String(revision),
        `village revision ${revision}`);
      if (food !== undefined) assert.equal(await page.locator('#village-food').textContent(), String(food));
    },
    async screenshot(page, name) {
      const file = path.join(evidence, `${name}.png`);
      await page.screenshot({path: file, fullPage: true});
      logs.screenshots.push(file);
    },
    async command(page, type, expectedRevision, tick, durationTicks, action, outcome = 'succeeded') {
      const responsePromise = page.waitForResponse(response => response.url().endsWith(commandPath)
        && response.request().method() === 'POST'
        && JSON.parse(response.request().postData()).type === type
        && JSON.parse(response.request().postData()).expectedRevision === expectedRevision,
      {timeout: 600000});
      await action();
      const response = await responsePromise;
      assert.equal(response.status(), 200, `${type} HTTP`);
      const dto = JSON.parse(response.request().postData());
      const receipt = await response.json();
      assert.equal(dto.version, 3);
      assert.equal(dto.type, type);
      assert.equal(dto.expectedRevision, expectedRevision);
      assert.equal(receipt.commandId, dto.commandId);
      assert.equal(receipt.type, type);
      assert.equal(receipt.status, 'committed');
      assert.equal(receipt.outcome, outcome);
      assert.equal(receipt.fromRevision, expectedRevision);
      assert.equal(receipt.toRevision, expectedRevision + Math.max(1, durationTicks));
      assert.equal(receipt.tick, tick);
      assert.equal(receipt.durationTicks, durationTicks);
      logs.commands ??= [];
      logs.commands.push({dto, receipt});
      return {dto, receipt};
    },
    async closeService() {
      if (!service) return;
      const oldUrl = service.url;
      await service.close();
      service = null;
      logs.cleanup.lockGoneAfterServiceClose = await fs.stat(path.join(dataDir, '.runtime-owner.lock'))
        .then(() => false, () => true);
      logs.cleanup.portClosedAfterServiceClose = await fetch(`${oldUrl}/healthz`, {
        headers: {Connection: 'close'}, signal: AbortSignal.timeout(1000),
      }).then(() => false, () => true);
      assert.equal(logs.cleanup.lockGoneAfterServiceClose, true);
      assert.equal(logs.cleanup.portClosedAfterServiceClose, true);
    },
  };

  try {
    await h.start();
    await run(h);
    assert.deepEqual(logs.pageErrors, [], `unexpected uncaught browser errors: ${JSON.stringify(logs.pageErrors)}`);
    assert.equal(logs.requests.some(request => /\/model|bridge|\/api\/(?:llm|models)\b/i.test(request.url)), false,
      'the test stays on the isolated local runtime');
    const errors = logs.console.filter(entry => entry.type === 'error');
    for (const error of errors) {
      assert.ok(logs.injections.some(injection => injection.expectedConsoleError
        && injection.stage === error.stage && error.text.includes(injection.expectedConsoleError)),
      `unexpected browser console error: ${JSON.stringify(error)}`);
    }
  } catch (error) {
    failure = error;
    logs.failure = {message: error.message, stack: error.stack, stage: logs.stage};
    throw error;
  } finally {
    try {
      if (context) await context.close();
      logs.cleanup.edgeClosed = true;
      if (logs.browserPid !== null) {
        const alive = execFileSync('powershell.exe', ['-NoProfile', '-Command',
          `Get-CimInstance Win32_Process -Filter "ProcessId = ${logs.browserPid}" | Select-Object -ExpandProperty ProcessId`],
        {encoding: 'utf8', windowsHide: true}).trim();
        logs.cleanup.edgePidGone = alive === '';
        assert.equal(alive, '', 'the test-owned isolated Edge process exited');
      }
      await h.closeService();
    } catch (error) {
      logs.cleanup.failure = error.stack || String(error);
      if (!failure) throw error;
    } finally {
      await Promise.allSettled(logs.responseBodies);
      await fs.rm(tempRoot, {recursive: true, force: true});
      logs.cleanup.ownedTempRootRemoved = true;
      logs.finishedAt = new Date().toISOString();
      await fs.writeFile(path.join(evidence, 'evidence.json'), JSON.stringify(logs, null, 2));
      console.log(`D4B UI evidence ${name}: ${evidence}`);
    }
  }
}

test('H6 HTTP: scene resource gates, HEAD parity, CSP and legacy-profile 404', {timeout: 120000}, async () => {
  await lifecycle('H6-http-boundaries', async h => {
    const routes = ['/runtime-village.html', '/runtime-village.mjs', '/runtime-village.css', '/api/runtime/scene'];
    for (const route of routes) {
      const get = await h.http(route);
      assert.equal(get.response.status, 200, route);
      const head = await h.http(route, {method: 'HEAD'});
      assert.equal(head.response.status, 200, `HEAD ${route}`);
      assert.equal(head.text, '', `HEAD ${route} has no body`);
      for (const header of ['content-type', 'content-length', 'content-security-policy', 'cache-control', 'x-content-type-options']) {
        assert.equal(head.response.headers.get(header), get.response.headers.get(header), `HEAD parity: ${header} ${route}`);
      }
      assert.equal((await h.http(`${route}?bad=1`, {method: 'POST'})).response.status, 405,
        `method validation precedes query validation: ${route}`);
      assert.equal((await h.http(`${route}?bad=1`)).response.status, 400, `query rejected: ${route}`);
      if (route.endsWith('.html')) {
        const csp = get.response.headers.get('content-security-policy') ?? '';
        assert.match(csp, /script-src 'self'/);
        assert.match(csp, /style-src 'self'/);
        assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/i);
        assert.doesNotMatch(get.text, /<script(?![^>]*\bsrc=)[^>]*>/i);
        assert.doesNotMatch(get.text, /<style\b/i);
        assert.doesNotMatch(get.text, /\son[a-z]+\s*=/i);
      }
    }

    const oldDirectory = path.join(path.dirname(h.logs.dataDir), 'old-profile');
    const old = await startRuntimeServer({directory: oldDirectory, profile: 'encounter-survival-village',
      seed: 42, port: 0, writable: true});
    h.logs.oldProfile = {url: old.url, directory: oldDirectory};
    try {
      for (const route of ['/runtime-village.html', '/runtime-village.mjs', '/runtime-village.css', '/api/runtime/scene']) {
        for (const method of ['GET', 'HEAD', 'POST']) {
          const response = await fetch(`${old.url}${route}?bad=1`, {method, headers: {Connection: 'close'}});
          h.logs.http.push({stage: 'old-profile', method, route, status: response.status,
            headers: Object.fromEntries(response.headers), body: await response.text()});
          assert.equal(response.status, 404, `${method} old-profile capability gate ${route}`);
        }
      }
    } finally {
      await old.close();
      const oldLockGone = await fs.stat(path.join(oldDirectory, '.runtime-owner.lock')).then(() => false, () => true);
      const oldPortClosed = await fetch(`${old.url}/healthz`, {
        headers: {Connection: 'close'}, signal: AbortSignal.timeout(1000),
      }).then(() => false, () => true);
      h.logs.cleanup.oldProfile = {lockGone: oldLockGone, portClosed: oldPortClosed};
      assert.equal(oldLockGone, true);
      assert.equal(oldPortClosed, true);
    }
  });
});

test('H6 Edge: map-to-village Gift survives a lost response and confirms the identical DTO once',
  {timeout: 900000}, async () => lifecycle('H6-response-loss-retry', async h => {
    await h.browser();
    let page = await h.page();
    await h.enterVillage(page);
    await h.screenshot(page, '01-village-before-gift');

    let originalBody, authoritativeReceipt, releaseHandled;
    const handled = new Promise(resolve => { releaseHandled = resolve; });
    h.logs.stage = 'commit-then-drop-response';
    h.logs.injections.push({stage: h.logs.stage, kind: 'real service commit followed by browser-response abort',
      expectedConsoleError: 'net::ERR_FAILED'});
    await page.route(`**${commandPath}`, async route => {
      originalBody = route.request().postData();
      const response = await route.fetch();
      authoritativeReceipt = await response.json();
      assert.equal(response.status(), 200);
      assertGiftDto(JSON.parse(originalBody), 0);
      assertGiftReceipt(authoritativeReceipt, JSON.parse(originalBody));
      releaseHandled();
      await route.abort('failed');
    });
    await page.locator(giftSelector).click();
    await handled;
    await page.locator('#village-retry').waitFor({state: 'visible'});
    const first = await h.scene();
    assert.equal(first.revision, 1);
    assert.equal(first.tick, 0);
    assert.equal(first.self.food, 19);
    const pending = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'),
      'narraverse.village.pending.v1:scene-survival-village');
    assert.equal(pending.body, originalBody);
    assert.deepEqual(pending.dto, JSON.parse(originalBody));
    assert.equal(h.logs.requests.filter(request => request.method === 'POST'
      && new URL(request.url).pathname === commandPath).length, 1, 'no automatic second submit after the lost reply');
    await h.screenshot(page, '02-response-lost-original-pending');

    await page.unroute(`**${commandPath}`);
    await page.reload();
    await h.rendered(page, 1, 19);
    const restoredPending = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'),
      'narraverse.village.pending.v1:scene-survival-village');
    assert.deepEqual(restoredPending, pending);
    await page.close({runBeforeUnload: false});
    page = await h.page();
    await h.enterVillage(page);
    await h.rendered(page, 1, 19);
    await page.locator('#village-retry').waitFor({state: 'visible'});
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'),
      'narraverse.village.pending.v1:scene-survival-village'), pending);

    h.logs.stage = 'explicit-same-dto-retry';
    const responsePromise = page.waitForResponse(response => response.url().endsWith(commandPath)
      && response.request().method() === 'POST');
    await page.locator('#village-retry').click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    assert.equal(response.request().postData(), originalBody);
    assert.deepEqual(await response.json(), authoritativeReceipt);
    await eventually(() => page.evaluate(key => localStorage.getItem(key),
      'narraverse.village.pending.v1:scene-survival-village'), value => value === null, 'receipt clears pending');
    await h.rendered(page, 1, 19);
    assert.equal(h.logs.requests.filter(request => request.method === 'POST'
      && new URL(request.url).pathname === commandPath).length, 2,
    'the retry repeats only the same canonical DTO; server idempotency yields one gift');
    const after = await h.scene();
    assert.equal(after.revision, 1);
    assert.equal(after.actors.find(entry => entry.actorId === 'actor-2').receivedGifts.length, 1);
    assert.equal(after.actors.find(entry => entry.actorId === 'actor-2').receivedGifts[0].observable.commandId,
      JSON.parse(originalBody).commandId);
    await h.screenshot(page, '03-same-dto-confirmed-once');
  }));

test('H6 Edge: same-revision tabs produce one 200 and one 409; stale reads, injected text and dead archive stay safe',
  {timeout: 900000}, async () => lifecycle('H6-race-stale-xss-archive', async h => {
    const context = await h.browser();
    const pageA = await h.page();
    const pageB = await h.page();
    await h.enterVillage(pageA);
    await h.enterVillage(pageB);
    const initialViews = await h.readViews();
    await h.screenshot(pageA, '01-two-tabs-at-revision-zero');

    const heldDtos = [];
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    h.logs.stage = 'two-tab-revision-zero-race';
    for (const page of [pageA, pageB]) {
      await page.route(`**${commandPath}`, async route => {
        const dto = JSON.parse(route.request().postData());
        heldDtos.push(dto);
        if (heldDtos.length === 2) release();
        await barrier;
        const response = await route.fetch();
        const record = {stage: h.logs.stage, kind: 'both real DTO submissions held at the same revision',
          status: response.status(), dto};
        if (response.status() === 409) record.expectedConsoleError = '409 (Conflict)';
        h.logs.injections.push(record);
        await route.fulfill({response});
      });
    }
    await Promise.all([pageA, pageB].map(page => page.locator(giftSelector).click()));
    await eventually(() => h.logs.responses.filter(response => response.method === 'POST'
      && response.url.endsWith(commandPath)), values => values.length === 2, 'both tab command responses');
    const raceResponses = h.logs.responses.filter(response => response.method === 'POST'
      && response.url.endsWith(commandPath));
    assert.deepEqual(raceResponses.map(response => response.status).sort(), [200, 409]);
    assert.equal(heldDtos.length, 2);
    heldDtos.forEach(dto => assertGiftDto(dto, 0));
    assert.notEqual(heldDtos[0].commandId, heldDtos[1].commandId);
    for (const page of [pageA, pageB]) {
      await page.unroute(`**${commandPath}`);
      await eventually(() => page.locator('#village-revision').textContent(), value => value === '1',
        'each tab rereads winner revision');
      assert.equal(await page.locator('#village-food').textContent(), '19');
    }
    const committed = await h.readViews();
    assert.equal(committed.scene.revision, 1);
    assert.equal(committed.scene.self.food, 19);
    assert.equal(committed.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts.length, 1);
    assert.equal(h.logs.requests.filter(request => request.method === 'POST'
      && new URL(request.url).pathname === commandPath).length, 2, '409 does not mint and submit a replacement intent');
    await h.screenshot(pageB, '02-one-commit-one-conflict');

    h.logs.stage = 'late-reordered-old-read';
    h.logs.injections.push({stage: h.logs.stage, kind: 'old coherent revision-0 projections delivered after revision 1'});
    for (const page of [pageA, pageB]) {
      await page.route(projections, async route => {
        const key = new URL(route.request().url()).pathname.split('/').at(-1);
        const response = await route.fetch();
        const body = structuredClone(initialViews[key]);
        await sleep(key === 'scene' ? 120 : key === 'player' ? 60 : 0);
        await route.fulfill({response, json: body});
      });
    }
    await pageA.locator('#village-refresh').click();
    await eventually(() => pageA.locator('#village-status').textContent(), text => /旧|迟到|不一致|保留|失败/.test(text),
      'late lower revision is reported');
    await h.rendered(pageA, 1, 19);
    assert.equal((await h.scene()).revision, 1);
    assert.equal((await h.scene()).self.food, 19);
    await pageA.unroute(projections);
    await pageB.unroute(projections);
    await pageA.locator('#village-refresh').click();
    await h.rendered(pageA, 1, 19);
    await h.screenshot(pageA, '03-late-old-read-did-not-overwrite');

    h.logs.stage = 'dynamic-text-injection';
    const maliciousName = '<img src=x onerror="window.__d4bInjected=1">猎人';
    h.logs.injections.push({stage: h.logs.stage, kind: 'projection display field changed in transit',
      value: maliciousName, source: 'synthetic view only; no authoritative state write'});
    const nameHandler = async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.actors.find(entry => entry.actorId === 'actor-2').name = maliciousName;
      await route.fulfill({response, json: body});
    };
    await pageA.route('**/api/runtime/scene', nameHandler);
    await pageA.locator('#village-refresh').click();
    await eventually(() => pageA.locator('[data-actor-id="actor-2"]').textContent(), text => text.includes(maliciousName),
      'dynamic name appears as literal text');
    assert.equal(await pageA.locator('[data-actor-id="actor-2"] img').count(), 0);
    assert.equal(await pageA.evaluate(() => window.__d4bInjected), undefined);
    await pageA.unroute('**/api/runtime/scene', nameHandler);
    await h.screenshot(pageA, '04-injected-name-is-text');

    h.logs.stage = 'dead-archive-display';
    const real = await h.readViews();
    h.logs.injections.push({stage: h.logs.stage, kind: 'dead projection copied from the legal real view',
      source: 'UI display test; does not claim a real combat death'});
    const deadHandler = async route => {
      const key = new URL(route.request().url()).pathname.split('/').at(-1);
      const response = await route.fetch();
      const body = structuredClone(real[key]);
      if (key === 'player') {
        body.self.identity.alive = false;
        body.self.identity.deathTick = body.tick;
        body.self.health = 0;
      } else if (key === 'encounter') {
        body.self.alive = false;
        body.self.health = 0;
        body.self.deathTick = body.tick;
      } else if (key === 'scene') {
        body.self.alive = false;
        for (const entry of body.actors) entry.gift = {available: false, reasonCode: 'PLAYER_DEAD'};
      }
      await route.fulfill({response, json: body});
    };
    await pageA.route(projections, deadHandler);
    await pageA.locator('#village-refresh').click();
    await eventually(() => pageA.locator('#village-status').textContent(), text => /死亡|已逝|封存|只读|只供/.test(text),
      'dead player appears archived');
    assert.equal(await pageA.locator(giftSelector).isDisabled(), true);
    assert.equal(h.logs.requests.filter(request => request.method === 'POST'
      && new URL(request.url).pathname === commandPath).length, 2);
    assert.equal(real.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts.length, 1);
    await h.screenshot(pageA, '05-dead-archive-is-read-only');
    await pageA.close({runBeforeUnload: false});
    await pageB.close({runBeforeUnload: false});
    assert.ok(context.pages().length >= 0);
  }));

test('H7 Edge + same runtime: Gift, day 144, forest victory, rejected busy Gift, return and graceful reopen',
  {timeout: 7200000}, async () => lifecycle('H7-same-world-continuity', async h => {
    await h.browser();
    let page = await h.page();
    await h.enterVillage(page);
    const initial = await h.readViews();
    assert.equal(initial.scene.tick, 0);
    assert.equal(initial.scene.self.food, 20);
    assert.equal(initial.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts.length, 0);
    await h.screenshot(page, '01-h7-village-initial');

    const {dto: gift, receipt: giftReceipt} = await h.command(page, 'PlayerGiftFood', 0, 0, 0,
      () => page.locator(giftSelector).click());
    assertGiftDto(gift, 0);
    assertGiftReceipt(giftReceipt, gift);
    await h.rendered(page, 1, 19);
    const immediate = await h.readViews();
    assert.equal(immediate.scene.simulationId, initial.scene.simulationId);
    assert.equal(immediate.scene.revision, 1);
    assert.equal(immediate.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts.length, 1);
    const receivedMemory = immediate.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts[0];
    assert.deepEqual(receivedMemory.observable, {type: 'food-gift', donorId: 'actor-4', recipientId: 'actor-2',
      product: 'food', quantity: 1, direction: 'received', commandId: gift.commandId});
    await h.screenshot(page, '02-h7-real-recipient-memory');

    await page.locator('a[href="/runtime-map.html"]').click();
    await page.locator('#advance-ticks').selectOption('144');
    await h.command(page, 'AdvanceTime', 1, 144, 144, () => page.locator('#advance').click());
    const day144 = await h.readViews();
    assert.equal(day144.scene.tick, 144);
    assert.equal(day144.scene.revision, 145);
    assert.equal(day144.scene.self.food, 18);
    assert.equal(day144.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts.length, 1);
    assert.equal(day144.scene.actors.find(entry => entry.actorId === 'actor-2').gift.available, true,
      'the received ration was consumed at day144, so the recipient is below the capacity limit again');
    assert.equal(day144.scene.actors.find(entry => entry.actorId === 'actor-2').gift.reasonCode, null);
    await page.locator('#travel-destination').selectOption('forest');
    await h.command(page, 'PlayerTravel', 145, 156, 12, () => page.locator('#travel-submit').click());
    const atForest = await h.readViews();
    assert.equal(atForest.scene.location, 'forest');
    assert.equal(atForest.scene.tick, 156);
    const healthAnchor = atForest.player.self.health;
    const livingWolvesAtStart = atForest.encounter.population.totalLivingWolves;
    assert.equal(livingWolvesAtStart, 14);
    h.logs.h7 = {healthAnchorAtTick156: healthAnchor, livingWolvesAtTick156: livingWolvesAtStart,
      simulationId: atForest.scene.simulationId, giftCommandId: gift.commandId};
    await h.screenshot(page, '03-h7-forest-health-anchor');

    await page.locator('#forest-scene-link').waitFor({state: 'visible'});
    await page.locator('#forest-scene-link').click();
    await h.command(page, 'EncounterBegin', 157, 156, 0, () => page.locator('#encounter-begin').click());
    await eventually(() => h.http('/api/runtime/encounter').then(response => response.body),
      view => view.encounter?.status === 'active', 'real encounter becomes active');
    const active = await h.readViews();
    assert.equal(active.encounter.tick, 156);
    assert.equal(active.encounter.revision, 158);
    assert.equal(active.encounter.population.reservedWolves, 1);

    h.logs.stage = 'gift-while-encounter-active';
    const busyDto = giftDto('d4b-h7-active-busy', active.scene.revision);
    const busyResponse = await h.http(commandPath, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(busyDto)});
    assert.equal(busyResponse.response.status, 200);
    assertGiftDto(busyDto, 158);
    assertGiftReceipt(busyResponse.body, busyDto, 'rejected');
    assert.equal(busyResponse.body.result.reasonCode, 'ENCOUNTER_BUSY');
    const afterBusy = await h.readViews();
    assert.equal(afterBusy.scene.tick, 156);
    assert.equal(afterBusy.scene.revision, 159);
    assert.equal(afterBusy.encounter.encounter.status, 'active');
    assert.equal(afterBusy.encounter.encounter.encounterId, active.encounter.encounter.encounterId);
    assert.equal(afterBusy.encounter.population.reservedWolves, 1);
    assert.equal(afterBusy.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts.length, 1);
    h.logs.h7.busyGift = {dto: busyDto, receipt: busyResponse.body, encounterPreserved: true};
    await page.reload();
    await eventually(() => page.locator('#scene-revision').textContent(), value => value === '159',
      'encounter page rereads the accepted busy refusal revision');
    await h.screenshot(page, '04-h7-active-encounter-busy-refusal');

    await h.command(page, 'EncounterAction', 159, 162, 6,
      () => page.locator('#encounter-attack').click());
    const firstAttack = await h.readViews();
    assert.equal(firstAttack.encounter.encounter.status, 'active');
    assert.equal(firstAttack.encounter.encounter.wolfHealth, 150);
    assert.equal(firstAttack.player.self.health, healthAnchor - 80);
    assert.equal(firstAttack.encounter.tick, 162);
    await h.command(page, 'EncounterAction', 165, 168, 6,
      () => page.locator('#encounter-attack').click());
    const victory = await h.readViews();
    assert.equal(victory.encounter.encounter.status, 'closed');
    assert.equal(victory.encounter.encounter.resolution, 'win');
    assert.equal(victory.encounter.encounter.wolfHealth, 0);
    assert.equal(victory.encounter.population.totalLivingWolves, 13);
    assert.equal(victory.encounter.population.reservedWolves, 0);
    assert.equal(victory.player.self.health, healthAnchor - 80);
    assert.equal(victory.encounter.tick, 168);
    await h.screenshot(page, '05-h7-forest-victory');

    await page.locator('#scene-exit').click();
    await page.locator('#travel-destination').selectOption('village');
    await h.command(page, 'PlayerTravel', 171, 180, 12, () => page.locator('#travel-submit').click());
    const returned = await h.readViews();
    assert.equal(returned.scene.location, 'village');
    assert.equal(returned.scene.tick, 180);
    assert.equal(returned.scene.revision, 183);
    assert.equal(returned.scene.simulationId, initial.scene.simulationId);
    assert.equal(returned.scene.self.food, 18);
    const returnedHunter = returned.scene.actors.find(entry => entry.actorId === 'actor-2');
    assert.equal(returnedHunter.receivedGifts.length, 1);
    assert.deepEqual(returnedHunter.receivedGifts[0], receivedMemory);
    h.logs.h7 = {...h.logs.h7, tick180: returned.scene.tick, revision180: returned.scene.revision,
      livingWolvesAfterVictory: victory.encounter.population.totalLivingWolves,
      healthAfterCombat: victory.player.self.health, recipientMemoryAfterReturn: returnedHunter.receivedGifts[0]};
    await page.locator('#village-scene-link').waitFor({state: 'visible'});
    await page.locator('#village-scene-link').click();
    await h.rendered(page, 183, 18);
    await h.screenshot(page, '06-h7-village-return-memory');

    const beforeClose = await h.readViews();
    await page.close({runBeforeUnload: false});
    await h.closeService();
    h.logs.stage = 'same-directory-service-reopen';
    await h.start(undefined, true);
    page = await h.page();
    await page.goto(`${h.url}/runtime-village.html`);
    await h.rendered(page, 183, 18);
    const afterReopen = await h.readViews();
    assert.equal(canonical(afterReopen), canonical(beforeClose), 'one committed world survives graceful service close/reopen');
    assert.equal(afterReopen.scene.simulationId, initial.scene.simulationId);
    assert.equal(afterReopen.scene.tick, 180);
    assert.equal(afterReopen.encounter.population.totalLivingWolves, 13);
    assert.deepEqual(afterReopen.scene.actors.find(entry => entry.actorId === 'actor-2').receivedGifts,
      [receivedMemory]);
    await h.screenshot(page, '07-h7-graceful-service-reopen');

    const commandLog = h.logs.commands.map(({dto}) => dto);
    assert.deepEqual(commandLog.map(dto => dto.type), [
      'PlayerGiftFood', 'AdvanceTime', 'PlayerTravel', 'EncounterBegin',
      'EncounterAction', 'EncounterAction', 'PlayerTravel',
    ]);
    assert.deepEqual(commandLog.map(dto => dto.expectedRevision), [0, 1, 145, 157, 159, 165, 171]);
    const browserPosts = h.logs.requests.filter(request => request.method === 'POST'
      && new URL(request.url).pathname === commandPath);
    const directPosts = h.logs.http.filter(request => request.method === 'POST' && request.route === commandPath);
    assert.equal(browserPosts.length, 7, 'seven visible commands, each sent once');
    assert.equal(directPosts.length, 1, 'the only direct command is the active-Gift refusal');
    assert.equal(h.logs.h7.healthAnchorAtTick156 - afterReopen.player.self.health, 80);
    h.logs.h7.commands = commandLog;
    h.logs.h7.posts = h.logs.requests.filter(request => request.method === 'POST'
      && new URL(request.url).pathname === commandPath);
  }));
