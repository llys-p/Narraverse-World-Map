import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startRuntimeServer } from '../runtime-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserExe = process.env.D35_UI_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const playwrightModule = process.env.D35_UI_PLAYWRIGHT_MODULE ||
  'C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const makeDirectory = () => fs.mkdtemp(path.join(os.tmpdir(), 'world-runtime-d35-ui-'));
const serviceGet = (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, Connection: 'close' } });
const json = async (url, init) => {
  let response;
  try { response = await serviceGet(url, init); }
  catch (error) {
    let health = 'unavailable';
    try {
      const probe = await fetch(new URL('/healthz', url), { headers: { Connection: 'close' } });
      health = `${probe.status} ${await probe.text()}`;
    } catch (probeError) { health = `unavailable (${probeError.code ?? probeError.cause?.code ?? probeError.message})`; }
    throw new Error(`test HTTP request failed: ${init?.method ?? 'GET'} ${url}; fresh healthz=${health}`, { cause: error });
  }
  const body = response.status === 204 || init?.method === 'HEAD' ? null : await response.json();
  return { response, body };
};
const readEncounter = async base => (await json(`${base}/api/runtime/encounter`)).body;
const diagnoseService = async base => {
  const read = async route => {
    try {
      const response = await fetch(`${base}${route}`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(4000) });
      return { status: response.status, body: await response.text() };
    } catch (error) { return { error: error.code ?? error.cause?.code ?? error.message }; }
  };
  const [healthz, encounter] = await Promise.all([read('/healthz'), read('/api/runtime/encounter')]);
  return { healthz, encounter };
};
const until = async (read, predicate, message) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(message);
};
const commands = records => records.filter(record => new URL(record.url).pathname === '/api/runtime/commands' && record.method === 'POST');
const allowedDtoKeys = ['commandId', 'expectedRevision', 'payload', 'type', 'version'];

test('encounter UI consumes the live world, survives navigation/reopen, and safely retries one DTO3', async t => {
  assert.ok(await fs.stat(browserExe).then(() => true, () => false), `required Edge executable missing: ${browserExe}`);
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)(playwrightModule)); }
  catch (error) { assert.fail(`required Playwright driver unavailable at ${playwrightModule}: ${error.message}`); }
  assert.equal(typeof chromium?.launch, 'function', 'real browser launch is a required gate');

  const evidence = path.join(root, 'artifacts', `world-runtime-d35-ui-20261013-${process.pid}-${Date.now()}`);
  await fs.mkdir(path.dirname(evidence), { recursive: true });
  await fs.mkdir(evidence, { recursive: false });
  const logs = { browserPid: null, services: [], requests: [], responses: [], console: [], pageErrors: [], networkAborts: [],
    injectedEvents: [], evidence };
  const directories = [];
  let browserStage = 'main-flow';
  const newData = async () => {
    const directory = await makeDirectory();
    directories.push(directory);
    return directory;
  };
  let browser;
  let context;
  let service;
  t.after(async () => {
    if (context) await context.close();
    if (browser) await browser.close();
    if (service) await service.close();
    for (const directory of directories.reverse()) {
      assert.ok(path.isAbsolute(directory) && directory.startsWith(path.join(os.tmpdir(), 'world-runtime-d35-ui-')),
        'cleanup must remain inside this test’s unique TEMP directory');
      await fs.rm(directory, { recursive: true, force: true });
    }
    await fs.writeFile(path.join(evidence, 'browser-evidence.json'), JSON.stringify(logs, null, 2));
  });

  const launch = async () => {
    browser = await chromium.launch({ executablePath: browserExe, headless: true });
    const pidQuery = `$parent = ${process.pid}; Get-CimInstance Win32_Process -Filter \"ParentProcessId = $parent\" | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*--remote-debugging-pipe*' } | Select-Object -First 1 -ExpandProperty ProcessId`;
    const pidText = execFileSync('powershell.exe', ['-NoProfile', '-Command', pidQuery], { encoding: 'utf8', windowsHide: true }).trim();
    logs.browserPid = pidText ? Number(pidText) : null;
    assert.ok(Number.isSafeInteger(logs.browserPid), 'isolated Playwright Edge PID must be recorded');
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  };
  const start = async directory => {
    service = await startRuntimeServer({ directory, profile: 'encounter-survival-village', seed: 42, port: 0, writable: true, inspectMind: true });
    logs.services.push({ url: service.url, pid: process.pid, directory });
    return service;
  };
  const attach = page => {
    page.on('request', request => logs.requests.push({ method: request.method(), url: request.url(), postData: request.postData() }));
    page.on('response', response => logs.responses.push({ status: response.status(), url: response.url(), method: response.request().method(), postData: response.request().postData() }));
    page.on('console', message => logs.console.push({ stage: browserStage, type: message.type(), text: message.text(), url: message.location().url }));
    page.on('pageerror', error => logs.pageErrors.push(String(error)));
    page.on('requestfailed', request => logs.networkAborts.push({ stage: browserStage, method: request.method(), url: request.url(), postData: request.postData(), error: request.failure()?.errorText }));
  };
  const openMap = async page => {
    await page.goto(`${service.url}/runtime-map.html`);
    await page.locator('#action-panel').waitFor({ state: 'visible' });
    await page.locator('#travel-destination option[value="forest"]').waitFor({ state: 'attached' });
  };
  const enterForest = async page => {
    await page.locator('#travel-destination').selectOption('forest');
    await page.locator('#travel-submit').click();
    await page.locator('#forest-scene-link').waitFor({ state: 'visible' });
    const travel = await readEncounter(service.url);
    assert.equal(travel.tick, 12, 'real map travel consumes the frozen 12 ticks');
    assert.equal(travel.self.location, 'forest');
    await page.locator('#forest-scene-link').click();
    await page.locator('#scene-status').waitFor();
  };
  const beginEncounter = async page => {
    const before = await readEncounter(service.url);
    await page.locator('#encounter-begin').click();
    const started = await until(() => readEncounter(service.url), value => value.encounter?.status === 'active', 'Begin did not commit through the real server');
    assert.equal(started.tick, before.tick, 'Begin has zero world duration');
    assert.equal(started.revision, before.revision + 1, 'Begin advances the audit revision independently from tick');
    assert.equal(started.encounter.encounterId, 'encounter-1');
    assert.equal(started.population.reservedWolves, 1);
    return started;
  };
  const clickAttack = async page => page.locator('#encounter-attack').click();
  const checkDtoBoundary = records => {
    for (const record of commands(records)) {
      const dto = JSON.parse(record.postData);
      assert.deepEqual(Object.keys(dto).sort(), allowedDtoKeys);
      assert.equal(dto.version, 3);
      assert.ok(Number.isSafeInteger(dto.expectedRevision));
      assert.equal(typeof dto.commandId, 'string');
      const payloadKeys = {
        PlayerTravel: ['destination'],
        AdvanceTime: ['ticks'],
        PlayerSell: ['product', 'quantity'],
        PlayerBuy: ['product', 'quantity'],
        EncounterBegin: [],
        EncounterAction: ['action', 'encounterId'],
        EncounterCancel: ['encounterId'],
      }[dto.type];
      assert.ok(payloadKeys, `unexpected DTO3 type ${dto.type}`);
      assert.deepEqual(Object.keys(dto.payload).sort(), payloadKeys.sort(), `unexpected payload fields for ${dto.type}`);
      for (const key of ['health', 'damage', 'winner', 'wolves', 'wolfCount', 'elapsedTicks', 'elapsed'])
        assert.equal(Object.hasOwn(dto.payload, key), false, `UI payload leaked ${key}`);
    }
  };

  await launch();
  let page = await context.newPage(); attach(page);
  const directory = await newData();
  await start(directory);
  const initial = await readEncounter(service.url);
  assert.equal(initial.self.health, 1000);
  assert.equal(initial.population.totalLivingWolves, 14);

  // Static profile gate, CSP, externally loaded assets and real map→scene→world traversal.
  const html = await page.request.get(`${service.url}/runtime-encounter.html`);
  assert.equal(html.status(), 200, 'new encounter profile serves its dedicated page');
  assert.match(html.headers()['content-type'] ?? '', /^text\/html\b/);
  assert.match(html.headers()['content-security-policy'] ?? '', /script-src 'self'/);
  assert.match(html.headers()['content-security-policy'] ?? '', /style-src 'self'/);
  const markup = await html.text();
  assert.doesNotMatch(markup, /<script(?![^>]*\bsrc=)[^>]*>/i, 'inline scripts are forbidden');
  assert.doesNotMatch(markup, /WorldRPG|WorldInv|WorldState|model|bridge/i, 'new page must not load legacy authority or model bridge');
  for (const [route, prefix] of [['/runtime-encounter.mjs', 'text/javascript'], ['/runtime-encounter.css', 'text/css']]) {
    const asset = await page.request.get(service.url + route);
    assert.equal(asset.status(), 200, `${route} is allowlisted`);
    assert.match(asset.headers()['content-type'] ?? '', new RegExp(`^${prefix}\\b`));
  }
  await openMap(page);
  // Choose a valid quantity of ten for a real stock or wallet constraint, without changing world state.
  const initialPlayerResponse = await serviceGet(`${service.url}/api/runtime/player`);
  const initialPlayer = await initialPlayerResponse.json();
  const initialSnapshotResponse = await serviceGet(`${service.url}/api/runtime/snapshot`);
  const initialSnapshot = await initialSnapshotResponse.json();
  const product = ['food', 'herbs'].find(item =>
    initialSnapshot.market[item] < 10 || initialSnapshot.market.prices[item] * 10 > initialPlayer.self.wallet);
  assert.ok(product, 'initial world must provide at least one genuine unaffordable or out-of-stock quantity');
  await page.locator('#trade-product').selectOption(product);
  await page.locator('#trade-quantity').fill('10');
  const failedTradeResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/runtime/commands') && response.request().method() === 'POST');
  await page.locator('#buy-submit').click();
  const rejectedHttpResponse = await failedTradeResponse;
  assert.equal(rejectedHttpResponse.status(), 200);
  const rejectedReceipt = await rejectedHttpResponse.json();
  assert.equal(rejectedReceipt.type, 'PlayerBuy');
  assert.equal(rejectedReceipt.outcome, 'rejected');
  assert.deepEqual(rejectedReceipt.result, { code: 'RULE_REJECTED' });
  assert.equal(rejectedReceipt.durationTicks, 0);
  assert.equal(rejectedReceipt.toRevision, rejectedReceipt.fromRevision + 1);
  assert.equal(rejectedReceipt.tick, rejectedReceipt.fromTick);
  const afterRejectedTrade = await readEncounter(service.url);
  assert.equal(afterRejectedTrade.tick, 0);
  assert.equal(afterRejectedTrade.revision, 1);
  const travelRequestAfterReject = page.waitForRequest(request => request.url().endsWith('/api/runtime/commands') && request.method() === 'POST');
  const travelResponseAfterReject = page.waitForResponse(response => response.url().endsWith('/api/runtime/commands') && response.request().method() === 'POST');
  await page.locator('#travel-destination').selectOption('forest');
  await page.locator('#travel-submit').click();
  const newTravelRequest = await travelRequestAfterReject;
  assert.notEqual(JSON.parse(newTravelRequest.postData()).commandId, rejectedReceipt.commandId,
    'a rejected DTO3 is cleared so a later action gets a new ID');
  assert.equal((await travelResponseAfterReject).status(), 200);
  await page.locator('#forest-scene-link').waitFor({ state: 'visible' });
  const firstTravel = await readEncounter(service.url);
  assert.equal(firstTravel.tick, 12);
  assert.equal(firstTravel.self.location, 'forest');
  await page.locator('#forest-scene-link').click();
  await page.locator('#scene-status').waitFor();
  const started = await beginEncounter(page);
  const encounterGet = await serviceGet(`${service.url}/api/runtime/encounter`);
  const encounterHead = await serviceGet(`${service.url}/api/runtime/encounter`, { method: 'HEAD' });
  assert.equal(encounterHead.status, encounterGet.status);
  for (const header of ['content-type', 'content-length', 'cache-control'])
    assert.equal(encounterHead.headers.get(header), encounterGet.headers.get(header));
  assert.equal(await encounterHead.text(), '', 'HEAD has the same response headers and no body');
  const firstCommandCount = commands(logs.requests).length;
  const firstAttackHttpResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/runtime/commands') && response.request().method() === 'POST');
  await clickAttack(page);
  const firstAttackResponse = await firstAttackHttpResponse;
  assert.equal(firstAttackResponse.status(), 200);
  const firstAttackReceipt = await firstAttackResponse.json();
  assert.equal(firstAttackReceipt.durationTicks, 6);
  assert.equal(firstAttackReceipt.toRevision, firstAttackReceipt.fromRevision + 6);
  const firstAttack = await until(() => readEncounter(service.url), value => value.encounter?.attackCount === 1, 'first attack was not committed');
  assert.equal(firstAttack.tick, 18);
  assert.equal(firstAttack.self.health, 920);
  assert.equal(firstAttack.encounter.wolfHealth, 150);
  assert.equal(firstAttack.population.totalLivingWolves, 14);
  assert.equal(firstAttack.population.reservedWolves, 1);
  assert.equal(firstAttack.revision, started.revision + 6, 'receipt revision keeps the zero-tick Begin offset');
  assert.ok(firstAttack.revision !== firstAttack.tick);
  assert.ok(commands(logs.requests).length > firstCommandCount);
  await page.screenshot({ path: path.join(evidence, 'active-after-first-attack.png'), fullPage: true });

  // Refresh and scene exit are navigation only; active wolf reservation remains held.
  await page.locator('#encounter-refresh').click();
  await page.locator('#encounter-attack').waitFor({ state: 'visible' });
  assert.deepEqual(await readEncounter(service.url), firstAttack);
  await page.locator('#scene-exit').click();
  await page.locator('#travel-submit').waitFor({ state: 'visible' });
  assert.equal((await readEncounter(service.url)).encounter.encounterId, started.encounter.encounterId);
  assert.equal((await readEncounter(service.url)).population.reservedWolves, 1);
  assert.equal(await page.locator('#travel-submit').isDisabled(), true, 'map world commands are disabled during an active encounter');
  assert.equal(await page.locator('#rest-submit').isDisabled(), true);
  assert.equal(await page.locator('#advance').isDisabled(), true);
  assert.equal(await page.locator('#trade-product').isDisabled(), true);
  assert.equal(await page.locator('#encounter-block-note').isVisible(), true);
  assert.match(await page.locator('#encounter-block-note').innerText(), /遭遇进行中.*旅行.*休整.*交易.*世界时间/);
  await page.locator('#forest-scene-link').click();
  await page.locator('#encounter-attack').waitFor({ state: 'visible' });
  await page.reload();
  await page.locator('#encounter-attack').waitFor({ state: 'visible' });
  assert.equal((await readEncounter(service.url)).encounter.encounterId, 'encounter-1');

  // A true service close/reopen on the same data directory restores the active fight.
  await context.close(); context = null;
  await browser.close(); browser = null;
  await service.close(); service = null;
  service = await startRuntimeServer({ directory, port: 0, writable: true, inspectMind: true });
  logs.services.push({ url: service.url, pid: process.pid, directory, reopened: true });
  await launch();
  page = await context.newPage(); attach(page);
  await page.goto(`${service.url}/runtime-encounter.html`);
  await page.locator('#encounter-attack').waitFor({ state: 'visible' });
  const restored = await readEncounter(service.url);
  assert.equal(restored.encounter.encounterId, 'encounter-1');
  assert.equal(restored.self.health, 920);
  assert.equal(restored.encounter.wolfHealth, 150);
  const secondAttackResponsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/runtime/commands' && response.request().method() === 'POST', { timeout: 15000 });
  await clickAttack(page);
  let secondAttackResponse;
  try { secondAttackResponse = await secondAttackResponsePromise; }
  catch (error) {
    logs.secondAttackDiagnostic = { url: service.url, dataDirectory: directory, failedRequest: logs.networkAborts.at(-1) ?? null,
      service: await diagnoseService(service.url), error: error.message };
    throw new Error(`second attack produced no browser response; evidence=${JSON.stringify(logs.secondAttackDiagnostic)}`, { cause: error });
  }
  const secondAttackReceipt = await secondAttackResponse.json();
  const afterSecondAttackResponse = await readEncounter(service.url);
  logs.secondAttackEvidence = {
    reopenedUrl: service.url,
    dataDirectory: directory,
    request: JSON.parse(secondAttackResponse.request().postData()),
    httpStatus: secondAttackResponse.status(),
    receipt: secondAttackReceipt,
    projectionImmediatelyAfterResponse: afterSecondAttackResponse,
  };
  assert.equal(secondAttackReceipt.type, 'EncounterAction');
  assert.equal(secondAttackReceipt.outcome, 'succeeded', 'second attack must succeed in the actual service');
  const won = await until(() => readEncounter(service.url), value => value.encounter?.status === 'closed', 'second attack did not close the encounter');
  assert.equal(won.tick, 24);
  assert.equal(won.self.health, 920);
  assert.equal(won.encounter.wolfHealth, 0);
  assert.equal(won.encounter.resolution, 'win');
  assert.equal(won.population.totalLivingWolves, 13);
  assert.equal(won.population.reservedWolves, 0);
  assert.equal(won.population.battleDeaths, 1);

  // Two genuine pages submit from one revision. The owner accepts one and returns a real 409 to the other.
  await context.close(); context = null; await browser.close(); browser = null;
  await service.close(); service = null;
  const raceDir = await newData(); await start(raceDir);
  await launch();
  const racePages = [await context.newPage(), await context.newPage()]; racePages.forEach(attach);
  await openMap(racePages[0]); await enterForest(racePages[0]);
  await racePages[1].goto(`${service.url}/runtime-map.html`);
  await racePages[1].locator('#forest-scene-link').waitFor({ state: 'visible' });
  await racePages[1].locator('#forest-scene-link').click();
  await racePages[1].locator('#scene-status').waitFor();
  await beginEncounter(racePages[0]);
  await racePages[1].reload(); await racePages[1].locator('#encounter-attack').waitFor({ state: 'visible' });
  const beforeRace = await readEncounter(service.url);
  const raceCommandStart = commands(logs.requests).length;
  browserStage = 'two-tab-revision-conflict';
  const responses = racePages.map(racePage => racePage.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/runtime/commands' && response.request().method() === 'POST'));
  await Promise.all(racePages.map(clickAttack));
  const raceResponses = await Promise.all(responses);
  const raceStatuses = raceResponses.map(response => response.status()).sort((a, b) => a - b);
  assert.deepEqual(raceStatuses, [200, 409]);
  const afterRace = await readEncounter(service.url);
  const raceDtos = commands(logs.requests).slice(raceCommandStart).map(record => JSON.parse(record.postData));
  assert.equal(raceDtos.length, 2);
  assert.ok(raceDtos.every(dto => dto.expectedRevision === beforeRace.revision && dto.type === 'EncounterAction'));
  const conflictResponse = raceResponses.find(response => response.status() === 409);
  const conflictCommand = JSON.parse(conflictResponse.request().postData());
  assert.equal(new URL(conflictResponse.url()).pathname, '/api/runtime/commands');
  logs.injectedEvents.push({ kind: 'race-409', stage: browserStage, url: conflictResponse.url(), commandId: conflictCommand.commandId, count: 1, status: conflictResponse.status() });
  assert.equal((await conflictResponse.json()).currentRevision, afterRace.revision,
    'losing tab receives the real current revision in its 409 response');
  assert.equal(afterRace.revision, beforeRace.revision + 6);
  assert.equal(afterRace.tick, beforeRace.tick + 6);
  assert.equal(afterRace.encounter.attackCount, 1);
  assert.equal(afterRace.self.health, 920);

  // Force a real lost response after route.fetch commits it, then retry through the UI unchanged.
  await context.close(); context = null; await browser.close(); browser = null;
  await service.close(); service = null;
  const retryDir = await newData(); await start(retryDir);
  await launch(); page = await context.newPage(); attach(page);
  await openMap(page); await enterForest(page); await beginEncounter(page);
  browserStage = 'committed-response-abort';
  let firstBytes; let fetchedResponse; let finishFetch; let lostCommand;
  const committedFromRoute = new Promise(resolve => { finishFetch = resolve; });
  await page.route('**/api/runtime/commands', async route => {
    firstBytes = route.request().postDataBuffer();
    lostCommand = JSON.parse(firstBytes.toString('utf8'));
    browserStage = `committed-response-abort:${lostCommand.commandId}`;
    const response = await route.fetch();
    fetchedResponse = { status: response.status(), body: await response.text() };
    logs.injectedEvents.push({ kind: 'response-abort', stage: browserStage, url: route.request().url(), commandId: lostCommand.commandId, count: 1, committedStatus: fetchedResponse.status });
    finishFetch(fetchedResponse);
    await route.abort('failed');
  });
  await clickAttack(page);
  await committedFromRoute;
  assert.equal(fetchedResponse.status, 200, 'network interception observes the actual service commit before response loss');
  const committedReceipt = JSON.parse(fetchedResponse.body);
  assert.equal(committedReceipt.fromTick, 12);
  assert.equal(committedReceipt.tick, 18);
  assert.equal(committedReceipt.durationTicks, 6);
  assert.equal(committedReceipt.toRevision, committedReceipt.fromRevision + 6);
  const once = await readEncounter(service.url);
  assert.equal(once.encounter.attackCount, 1);
  assert.equal(once.self.health, 920);
  await page.locator('#encounter-retry').waitFor({ state: 'visible' });
  await page.locator('#encounter-refresh').click();
  await until(() => readEncounter(service.url), value => value.tick === 18, 'refresh did not read the already committed tick 18 state');
  await page.locator('#scene-tick').waitFor();
  assert.equal(await page.locator('#scene-tick').innerText(), '18');
  await page.locator('#encounter-retry').waitFor({ state: 'visible' });
  await page.unroute('**/api/runtime/commands');
  const retriedRequest = page.waitForRequest(request => request.url().endsWith('/api/runtime/commands') && request.method() === 'POST');
  const retryResponse = page.waitForResponse(response => response.url().endsWith('/api/runtime/commands') && response.request().method() === 'POST');
  await page.locator('#encounter-retry').click();
  const retryRequest = await retriedRequest;
  const retriedResponse = await retryResponse;
  const retryBytes = retryRequest.postDataBuffer();
  const retryCommand = JSON.parse(retryBytes.toString('utf8'));
  assert.equal(retryCommand.commandId, lostCommand.commandId);
  logs.injectedEvents.find(item => item.kind === 'response-abort').retryCommandId = retryCommand.commandId;
  logs.injectedEvents.find(item => item.kind === 'response-abort').retryCount = 1;
  assert.equal(retriedResponse.status(), 200);
  const confirmedRetryReceipt = await retriedResponse.json();
  assert.equal(confirmedRetryReceipt.commandId, committedReceipt.commandId);
  assert.equal(confirmedRetryReceipt.fromTick, 12, 'same-id replay keeps its original fromTick after page refresh');
  assert.equal(confirmedRetryReceipt.tick, 18);
  const finalAfterRetry = await until(() => readEncounter(service.url), value => value.encounter?.attackCount === 1, 'idempotent retry changed the committed state');
  assert.deepEqual(retryBytes, firstBytes, 'retry sends the exact same command bytes including id and revision');
  assert.equal(finalAfterRetry.revision, once.revision);
  assert.equal(finalAfterRetry.tick, once.tick);
  assert.equal(finalAfterRetry.self.health, 920);
  assert.equal(finalAfterRetry.encounter.wolfHealth, 150);
  await page.locator('#encounter-retry').waitFor({ state: 'hidden' }, { timeout: 5000 });
  await page.locator('#encounter-cancel').click();
  const cancelled = await until(() => readEncounter(service.url), value => value.encounter?.status === 'closed', 'cancel did not resolve the active fight');
  assert.equal(cancelled.tick, finalAfterRetry.tick, 'cancel is zero-tick');
  assert.equal(cancelled.self.health, 920, 'cancel does not heal damage from the earlier attack');
  assert.equal(cancelled.encounter.wolfHealth, 150, 'cancel does not kill the reserved wolf');
  assert.equal(cancelled.encounter.resolution, 'cancel');
  assert.equal(cancelled.population.totalLivingWolves, 14);
  assert.equal(cancelled.population.reservedWolves, 0);
  assert.equal(cancelled.population.battleDeaths, 0);

  // Format-3 legacy profile keeps its DTO2 travel/rest UI and does not expose encounter assets/routes.
  await context.close(); context = null; await browser.close(); browser = null;
  await service.close(); service = null;
  const legacyDir = await newData();
  service = await startRuntimeServer({ directory: legacyDir, profile: 'player-play-village', port: 0, writable: true, inspectMind: true });
  logs.services.push({ url: service.url, pid: process.pid, directory: legacyDir, profile: 'player-play-village' });
  await launch(); page = await context.newPage(); attach(page);
  browserStage = 'legacy-profile';
  for (const route of ['/runtime-encounter.html', '/runtime-encounter.mjs', '/runtime-encounter.css', '/api/runtime/encounter']) {
    assert.equal((await fetch(service.url + route)).status, 404, `${route} remains unavailable on format 3`);
  }
  await openMap(page);
  const legacyCommands = [];
  page.on('request', request => { if (request.url().endsWith('/api/runtime/commands')) legacyCommands.push(JSON.parse(request.postData())); });
  await page.locator('#rest-submit').click();
  await until(() => legacyCommands, values => values.length === 1, 'legacy Rest did not submit');
  assert.equal(legacyCommands[0].version, 2);
  await page.locator('#travel-destination').selectOption('forest');
  await page.locator('#travel-submit').click();
  await until(() => legacyCommands, values => values.length === 2, 'legacy Travel did not submit');
  assert.equal(legacyCommands[1].version, 2);
  assert.equal(logs.requests.some(record => /\/model|bridge|\/api\/(?:llm|models)\b/i.test(record.url)), false,
    'no model or bridge network call is made');
  assert.equal(logs.pageErrors.length, 0, `browser page errors: ${logs.pageErrors.join('; ')}`);
  const consoleErrors = logs.console.filter(item => item.type === 'error');
  const real409s = logs.responses.filter(item => item.status === 409 && item.method === 'POST' && new URL(item.url).pathname === '/api/runtime/commands');
  assert.equal(real409s.length, 1, 'exactly one real DTO3 command receives the two-tab 409');
  const expectedConsoleErrors = consoleErrors.filter(item => {
    const race = logs.injectedEvents.find(event => event.kind === 'race-409');
    const lost = logs.injectedEvents.find(event => event.kind === 'response-abort');
    return (race && item.stage === race.stage && item.url === race.url && /409 \(Conflict\)/.test(item.text)) ||
      (lost && item.stage === lost.stage && item.url === lost.url && /net::ERR_FAILED/.test(item.text));
  });
  assert.equal(consoleErrors.length, 2, `unexpected browser console errors: ${consoleErrors.map(item => `${item.stage}: ${item.text}`).join('; ')}`);
  const raceConsole = consoleErrors.find(item => /409 \(Conflict\)/.test(item.text));
  const lostConsole = consoleErrors.find(item => /net::ERR_FAILED/.test(item.text));
  assert.ok(raceConsole && logs.injectedEvents.find(item => item.kind === 'race-409')?.commandId,
    '409 console evidence must correlate to the actual losing command DTO');
  assert.ok(lostConsole && logs.injectedEvents.find(item => item.kind === 'response-abort')?.commandId,
    'abort console evidence must correlate to the explicitly injected command ID');
  const abortedRequest = logs.networkAborts.filter(item => item.error === 'net::ERR_FAILED' && new URL(item.url).pathname === '/api/runtime/commands');
  assert.equal(abortedRequest.length, 1, 'the only failed network request is the deliberately aborted command response');
  assert.equal(JSON.parse(abortedRequest[0].postData).commandId, logs.injectedEvents.find(item => item.kind === 'response-abort').commandId);
  assert.equal(expectedConsoleErrors.length, 2, 'only the correlated real 409 and deliberately aborted response produce browser network errors');
  checkDtoBoundary(logs.requests.filter(record => record.postData && JSON.parse(record.postData).version === 3));
  await page.screenshot({ path: path.join(evidence, 'legacy-map-after-actions.png'), fullPage: true });
});
