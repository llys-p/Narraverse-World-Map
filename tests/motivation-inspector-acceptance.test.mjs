import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createSimulationSession } from '../runtime/core/command-engine.mjs';
import { saveCheckpoint } from '../runtime/persistence/checkpoint-store.mjs';
import { startRuntimeServer } from '../runtime-server.mjs';

// Q6 uses the A2 Inspector export, not an invented service/motivation-inspector.
// Q7 independently reruns bounded legacy scenarios against the exact 87aa9b6 tree.
async function dependency(specifier, names) {
  const url = new URL(specifier, import.meta.url); let module;
  try { module = await import(url.href); }
  catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && e.url === url.href) return { missing: url.href }; throw e; }
  for (const name of names) assert.equal(typeof module[name], 'function', `${specifier} export ${name}`);
  return { module };
}
const deps = await Promise.all([
  dependency('../runtime/fixtures/motivation-village.mjs', ['defaultMotivationVillageConfig', 'createMotivationVillage', 'motivationSystems']),
  dependency('../runtime/core/motivation-runtime.mjs', ['validateMotivationWorld', 'executeMotivationPlayerIntent', 'describeMotivationPlayerActions']),
  dependency('../runtime/knowledge/motivation-knowledge.mjs', ['buildMotivationKnowledge', 'projectMotivationInspector']),
]);
const [fixture, runtime, knowledge] = deps.map(d => d.module);
function ready(t) {
  const missing = deps.filter(d => d.missing).map(d => d.missing);
  if (!missing.length) return true; t.skip(`DEPENDENCY_UNDELIVERED: ${missing.join(', ')}`); return false;
}
async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'm2c-inspector-'), dir = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix)); await fs.rm(dir, { recursive: true, force: true }); }); return dir;
}
async function disk(dir) {
  return Promise.all((await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort().map(async f => [f, await fs.readFile(path.join(dir, f), 'utf8')]));
}
async function get(url, route = '/api/runtime/minds') { const r = await fetch(url + route); assert.equal(r.status, 200, route); return r.json(); }
async function post(url, dto) {
  const r = await fetch(url + '/api/runtime/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto) });
  assert.equal(r.status, 200, await r.clone().text()); return r.json();
}
const time = (commandId, expectedRevision, ticks) => ({ version: 1, commandId, expectedRevision, type: 'AdvanceTime', payload: { ticks } });
const m = b => b.snapshot.world.motivationModel.actors[0];
function scenario(config) {
  const f = fixture.createMotivationVillage(42, 'm2c-inspector', config ?? fixture.defaultMotivationVillageConfig()); const s = createSimulationSession(f.bundle, f.systems); s.advanceTicks(288); return s.getBundle();
}
test('Q6 real Inspector projection contains sources/gate/three intents/outcome and detached private whitelist', t => {
  if (!ready(t)) return;
  const b = scenario(), before = structuredClone(b), dto = knowledge.projectMotivationInspector(b);
  assert.deepEqual(Object.keys(dto).sort(), ['actors', 'apiVersion', 'mindVersion', 'revision', 'simulationId', 'tick', 'view', 'worldFacts']);
  assert.equal(dto.mindVersion, 'motivation-inspector-v1'); assert.equal(dto.view, 'developer'); assert.deepEqual(Object.keys(dto.worldFacts).sort(), ['postedHerbPrice', 'publicFood', 'publicHerbs']);
  assert.deepEqual(dto.actors.map(a => a.knowledge.actorId), ['actor-2', 'actor-3']);
  const a = dto.actors[0]; assert.equal(a.knowledge.phase, 'committed'); assert.equal(a.lastDecision.gateReason, 'NEW_MAJOR_DUTY');
  assert.deepEqual([a.lastDecision.innerStance, a.lastDecision.committedIntent, a.lastDecision.apparentAction], ['health-concerned', { goalId: 1, kind: 'recover-health' }, 'WorkForPay']);
  assert.deepEqual(a.lastDecision.candidates.map(c => [c.action, c.provider, c.sourceRef]), [['UseMedicine', 'health-need', 'recover-health'], ['BuyMedicine', 'health-need', 'recover-health'], ['WorkForPay', 'role-request', 'd01'], ['Rest', 'fatigue-need', 'self-fatigue'], ['NoAction', 'fallback', null]]);
  assert.equal(a.lastOutcome.status, 'succeeded'); assert.equal(a.lastOutcome.failureOwner, null); assert.equal(a.counterfactual.length, 3);
  assert.deepEqual(Object.keys(a.knowledge).sort(), ['actorId', 'belief', 'duty', 'knowledgeVersion', 'observations', 'phase', 'planState', 'profile', 'quote', 'revision', 'self', 'simulationId', 'tick']);
  assert.equal(JSON.stringify(dto).includes('communalGold'), false); assert.equal(Object.hasOwn(a, 'transitionsHistory'), false);
  a.knowledge.self.wallet++; dto.worldFacts.publicHerbs++; assert.deepEqual(b, before);
  const corrupt = structuredClone(b); m(corrupt).lastDuty.fulfilledTick = 287; assert.throws(() => knowledge.projectMotivationInspector(corrupt), e => Boolean(e.code));
});
test('Q4/Q6 actual read-only projection leaves complete world/RNG/clock/IDs/inputs and checkpoint bytes unchanged', async t => {
  if (!ready(t)) return;
  const dir = await temporary(t), b = scenario(), before = structuredClone(b);
  await saveCheckpoint(b, { directory: dir, rulesVersion: 'm-motivation-v1', systems: fixture.motivationSystems() }); const bytes = await disk(dir);
  const first = knowledge.projectMotivationInspector(b);
  for (let i = 0; i < 3; i++) assert.deepEqual(knowledge.projectMotivationInspector(b), first);
  assert.deepEqual(b, before); assert.deepEqual(await disk(dir), bytes);
});
test('Q6 real HTTP GET/HEAD repeats are zero-write and match A2 audited projection', async t => {
  if (!ready(t)) return;
  const root = await temporary(t), b = scenario(), checkpoint = await saveCheckpoint(b, { directory: path.join(root, 'source'), rulesVersion: 'm-motivation-v1', systems: fixture.motivationSystems() });
  const directory = path.join(root, 'world'), server = await startRuntimeServer({ directory, checkpoint, port: 0, writable: true, inspectMind: true }); t.after(() => server.close());
  const before = await disk(directory), expected = knowledge.projectMotivationInspector(b);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await get(server.url), expected);
    const head = await fetch(server.url + '/api/runtime/minds', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.ok(Number(head.headers.get('content-length')) > 0);
  }
  assert.equal((await get(server.url, '/api/runtime/snapshot')).revision, 288); assert.deepEqual(await disk(directory), before);
});
test('Q6 disabled Inspector returns404 for every method/query/static resource; enabled method405 precedes query400', async t => {
  if (!ready(t)) return;
  const root = await temporary(t), off = await startRuntimeServer({ directory: path.join(root, 'off'), profile: 'motivation-village', port: 0, inspectMind: false }); t.after(() => off.close());
  for (const route of ['/api/runtime/minds', '/runtime-mind.html', '/runtime-mind.mjs', '/runtime-mind.css']) for (const method of ['GET', 'HEAD', 'POST']) for (const query of ['', '?x=1']) {
    assert.equal((await fetch(off.url + route + query, { method })).status, 404, `${method} ${route}${query}`);
  }
  assert.equal((await get(off.url, '/api/runtime/capabilities')).mindAvailable, false);
  const on = await startRuntimeServer({ directory: path.join(root, 'on'), profile: 'motivation-village', port: 0, inspectMind: true }); t.after(() => on.close());
  assert.equal((await fetch(on.url + '/api/runtime/minds?x=1', { method: 'POST' })).status, 405);
  assert.equal((await fetch(on.url + '/api/runtime/minds?x=1')).status, 400);
  assert.equal((await fetch(on.url + '/api/runtime/minds', { headers: { Origin: 'https://invalid.example' } })).status, 403);
  await off.close(); await assert.rejects(fetch(off.url + '/api/runtime/minds'), e => e.cause?.code === 'ECONNREFUSED');
});
test('Q6 real browser two pages display source/gate/intent/result/failure and reads/counterfactual/refresh write nothing', async t => {
  if (!ready(t)) return;
  // A real browser is required when A2/B are delivered. Missing driver fails, never empty PASS.
  const { chromium } = await import(process.env.M2C_PLAYWRIGHT_MODULE ?? 'playwright');
  assert.equal(typeof chromium?.launch, 'function');
  const root = await temporary(t), cfg = fixture.defaultMotivationVillageConfig(), res = cfg.memory.society.actors.market.ecology.resources.resources;
  cfg.memory.society.player.initialHerbs = 20; res.herbs.initial = 50; res.herbs.production.numerator = 0; res.gold.initial = 350;
  const f = fixture.createMotivationVillage(42, 'm2c-browser', cfg), s = createSimulationSession(f.bundle, f.systems); s.advanceTicks(144);
  const sold = runtime.executeMotivationPlayerIntent(s.getBundle(), { commandId: 'browser-sell', type: 'PlayerSell', payload: { product: 'herbs', quantity: 7 } });
  assert.equal(sold.outcome, 'succeeded'); const follow = createSimulationSession(sold.bundle, fixture.motivationSystems()); follow.advanceTicks(143);
  const checkpoint = await saveCheckpoint(follow.getBundle(), { directory: path.join(root, 'source'), rulesVersion: 'm-motivation-v1', systems: fixture.motivationSystems() });
  const directory = path.join(root, 'world'), server = await startRuntimeServer({ directory, checkpoint, port: 0, writable: true, inspectMind: true }); t.after(() => server.close());
  const browser = await chromium.launch({ headless: true, ...(process.env.M2C_BROWSER_EXECUTABLE ? { executablePath: process.env.M2C_BROWSER_EXECUTABLE } : {}) }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), pages = [await context.newPage(), await context.newPage()];
  const errors = [], consoleMessages = [], requests = [], writes = [], evidence = process.env.M2C_BROWSER_ARTIFACTS;
  for (const [index, page] of pages.entries()) {
    page.on('pageerror', e => errors.push({ page: index + 1, message: e.message }));
    page.on('console', e => consoleMessages.push({ page: index + 1, type: e.type(), text: e.text() }));
    page.on('request', r => { const record = { page: index + 1, method: r.method(), url: r.url() }; requests.push(record); if (!['GET', 'HEAD'].includes(r.method())) writes.push(record); });
  }
  const before = await disk(directory), dto = await get(server.url);
  const actor2 = dto.actors.find(a => a.knowledge.actorId === 'actor-2'), decision = actor2.lastDecision;
  // Raw contract values belong to the real API; the UI deliberately renders Chinese labels.
  assert.equal(dto.tick, 288); assert.equal(dto.revision, 288); assert.equal(dto.mindVersion, 'motivation-inspector-v1');
  assert.deepEqual([decision.gateReason, decision.innerStance, decision.committedIntent, decision.apparentAction, decision.planId, decision.goalId],
    ['NEW_MAJOR_DUTY', 'health-concerned', { goalId: 1, kind: 'recover-health' }, 'WorkForPay', 2, null]);
  assert.deepEqual(actor2.lastOutcome.failureOwner, { planId: 2, goalId: null }); assert.equal(actor2.lastOutcome.code, 'RULE_REJECTED');
  assert.deepEqual(decision.candidates.map(c => [c.action, c.provider, c.sourceRef]),
    [['UseMedicine', 'health-need', 'recover-health'], ['BuyMedicine', 'health-need', 'recover-health'], ['WorkForPay', 'role-request', 'd01'], ['Rest', 'fatigue-need', 'self-fatigue'], ['NoAction', 'fallback', null]]);
  const actor3 = dto.actors.find(a => a.knowledge.actorId === 'actor-3');
  assert.deepEqual([actor3.lastDecision.gateReason, actor3.lastDecision.innerStance, actor3.lastDecision.committedIntent, actor3.lastDecision.apparentAction],
    ['CONTINUE_COMMITTED', 'health-concerned', { goalId: 1, kind: 'recover-health' }, 'UseMedicine']);
  const labels = { UseMedicine: '用药', BuyMedicine: '买药', WorkForPay: '工作', Rest: '休息', NoAction: '无动作' };
  const blocks = { SOFT_PRECONDITION_FAILED: '软前提未满足', COMMITMENT_PROTECTED: '承诺保护', URGENT_OVERRIDE: '急迫覆盖' };
  async function visibleText(page, id, expected) {
    const node = page.locator('#' + id); assert.equal(await node.isVisible(), true, `${id} visible`); assert.equal(await node.innerText(), expected, id);
  }
  async function reading(page, actorId) {
    await page.locator('#mind-status[data-state="ready"]').waitFor({ state: 'visible' });
    const actor = dto.actors.find(a => a.knowledge.actorId === actorId), d = actor.lastDecision;
    assert.equal(await page.locator('#' + actorId).getAttribute('data-active'), 'true');
    await visibleText(page, 'self-name', actor.knowledge.self.name);
    await visibleText(page, 'self-health', String(actor.knowledge.self.health));
    await visibleText(page, 'mind-time', 'tick 288 · revision 288');
    await visibleText(page, 'decision-choice', labels[d.choice]); await visibleText(page, 'decision-apparent', labels[d.apparentAction]);
    await visibleText(page, 'decision-inner', '以健康为虑');
    await visibleText(page, 'decision-intent', `recover-health（目标 ${d.committedIntent.goalId}）`);
    const rows = await page.locator('#m2-candidates-body tr').evaluateAll(nodes => nodes.map(row => [...row.cells].map(cell => cell.textContent)));
    assert.equal(rows.length, d.candidates.length);
    for (const [i, c] of d.candidates.entries()) assert.deepEqual(rows[i],
      [labels[c.action], `${c.provider} / ${c.sourceRef ?? '—'}`, c.eligible ? '满足' : '不满足', `${c.support} / ${c.opposition}`, c.score == null ? '—' : String(c.score), c.selectable ? '可选' : blocks[c.selectionBlockCode], c.reasonCode]);
    assert.equal(await page.locator('#m2-counterfactual').isVisible(), true); assert.equal(await page.locator('#cf-list li').count(), 3);
    assert.match(await page.locator('#m2-counterfactual').innerText(), /只读推演 · 不执行动作 · 不代表世界结果或成功/);
    if (actorId === 'actor-2') {
      await visibleText(page, 'decision-gate', '新的重大职责 · 打开完整重评');
      await visibleText(page, 'decision-plan', '计划 #2（临时 · 不绑定长期目标）');
      await visibleText(page, 'outcome-status', '拒绝'); await visibleText(page, 'outcome-code', 'RULE_REJECTED');
      await visibleText(page, 'outcome-owner', '公粮记账 0 · 失败归属 计划 #2（临时，无长期目标）');
      assert.match(await page.locator('#plan-active').innerText(), /^#2 履行村中职责 · 受阻/);
      assert.match(await page.locator('#plan-suspended').innerText(), /^#1 恢复健康 · 挂起/);
      assert.match(await page.locator('#self-current-goal').innerText(), /^#1 /);
      assert.match(await page.locator('#duty-summary').innerText(), /^d01 ·/);
    } else {
      await visibleText(page, 'decision-gate', '继续已承诺计划');
      await visibleText(page, 'decision-plan', '计划 #1（绑定长期目标 1）');
      await visibleText(page, 'outcome-status', '成功');
    }
  }
  async function readFromPage(page, action) {
    const response = page.waitForResponse(r => r.url() === server.url + '/api/runtime/minds' && r.request().method() === 'GET');
    await action(); const r = await response; assert.equal(r.status(), 200); assert.deepEqual(await r.json(), dto);
  }
  if (evidence) await fs.mkdir(evidence, { recursive: true });
  await Promise.all(pages.map(page => readFromPage(page, () => page.goto(server.url + '/runtime-mind.html'))));
  for (const [index, page] of pages.entries()) {
    await reading(page, 'actor-2');
    if (evidence) await page.screenshot({ path: path.join(evidence, `page-${index + 1}-actor-2.png`), fullPage: true });
    await page.locator('#actor-3').click(); await reading(page, 'actor-3');
    if (evidence) await page.screenshot({ path: path.join(evidence, `page-${index + 1}-actor-3.png`), fullPage: true });
    await page.locator('#actor-2').click(); await reading(page, 'actor-2');
    await readFromPage(page, () => page.locator('#mind-refresh').click()); await reading(page, 'actor-2');
    await readFromPage(page, () => page.reload()); await reading(page, 'actor-2');
  }
  const after = await disk(directory);
  if (evidence) await fs.writeFile(path.join(evidence, 'browser-observations.json'), JSON.stringify({ dto, requests, consoleMessages, errors, writes,
    diskBefore: before.map(([file, bytes]) => [file, hash(bytes)]), diskAfter: after.map(([file, bytes]) => [file, hash(bytes)]), browserVersion: browser.version() }, null, 2));
  assert.deepEqual(await get(server.url), dto); assert.deepEqual(after, before); assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  assert.deepEqual(consoleMessages.filter(e => ['error', 'warning'].includes(e.type)), []);
});

const BASELINE = '87aa9b605f5f509ce3b0daa97e34ded004d22f33';
const baselineRoot = 'D:/Narraverse-World-Map-m1-integration';
const localRoot = fileURLToPath(new URL('../', import.meta.url));
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const hash = v => createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : canonical(v)).digest('hex');
function git(root, ...args) { const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
async function legacy(root) {
  const load = name => import(pathToFileURL(path.join(root, name)).href);
  const [engine, mind, mindKnowledge, player, intents, personality, server] = await Promise.all([
    'runtime/core/command-engine.mjs', 'runtime/fixtures/mind-village.mjs', 'runtime/knowledge/mind-knowledge.mjs', 'runtime/fixtures/player-play-village.mjs',
    'runtime/core/player-intents.mjs', 'runtime/fixtures/personality-village.mjs', 'runtime-server.mjs',
  ].map(load));
  return { engine, mind, mindKnowledge, player, intents, personality, server };
}
function advance(lib, f, ticks) { const s = lib.engine.createSimulationSession(f.bundle, f.systems); s.advanceTicks(ticks); return s.getBundle(); }
function goalScenario(lib) {
  const c = lib.mind.defaultMindVillageConfig(); c.mind.stimuli = []; c.memory.society.actors.market.ecology.resources.resources.herbs.initial = 0;
  c.memory.society.estates.slice(1, 3).forEach(e => { e.initialFood = 32; });
  const f = lib.mind.createMindVillage(42, 'm2c-old-deadline', c), s = lib.engine.createSimulationSession(f.bundle, f.systems), results = [];
  for (const ticks of [144, 19 * 144, 144, 144, 144]) { s.advanceTicks(ticks); results.push(s.getBundle()); }
  return results;
}
const leafFiles = ['runtime/core/hunter.mjs', 'runtime/core/society.mjs', 'runtime/core/actors.mjs', 'runtime/core/rng.mjs', 'runtime/core/simulation-clock.mjs',
  'runtime/core/mind-state.mjs', 'runtime/core/mind-planner.mjs', 'runtime/core/player-intents.mjs', 'runtime/core/personality.mjs'];
async function sourceFingerprints(root) {
  // Windows checkouts may use CRLF or LF for the same Git blob. Explicitly hash
  // UTF-8 source normalized to LF, rather than report that line endings changed rules.
  return Object.fromEntries(await Promise.all(leafFiles.map(async file => [file, hash((await fs.readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n'))])));
}
function legacyResults(lib) {
  const b288 = advance(lib, lib.mind.createMindVillage(42, 'm2c-old-default'), 288), deadline = goalScenario(lib);
  return { default288Hash: hash(b288), inspector: lib.mindKnowledge.projectMindInspector(b288), deadlineHashes: deadline.map(hash),
    deadlineStates: deadline.map(b => { const e = b.snapshot.world.societyModel.agents[1].state; return { goal: e.currentGoal, failed: e.ledger.goalsFailed, cooldown: e.cooldownUntilDay }; }),
    ...originalScenarioResults(lib) };
}
const archiveRoot = 'D:/Narraverse-World-Map-m1-core/artifacts/world-runtime-m1a-compat';
const originalScriptHash = '114708d1c95cf2e89f169d5885e97ab66551a2cce03731028c3e23c62f0f16d9';
const originalManifestHash = '6ea2dbe1cf2f802fd45e35ae01b8fb84a10e10e2da6736659996845db51a80a9';
const priorOracleHash = '983717df5384b1f20498b49bbe311dd76fdfdb649f469eb6bf76134f83f21805';
const d2cCommands = [
  { commandId: 'm1a-buy-food', type: 'PlayerBuy', payload: { product: 'food', quantity: 2 } },
  { commandId: 'm1a-sell-herbs', type: 'PlayerSell', payload: { product: 'herbs', quantity: 1 } },
  { commandId: 'm1a-travel-forest', type: 'PlayerTravel', payload: { destination: 'forest' } },
  { commandId: 'm1a-rest', type: 'PlayerRest', payload: {} },
  { commandId: 'm1a-travel-village', type: 'PlayerTravel', payload: { destination: 'village' } },
];
function originalScenarioSpecs(lib) {
  const c5 = lib.personality.createPersonalityHealth(42, 'personality-health-seed-42');
  const d2c = lib.player.createPlayerPlayVillage(42, 'player-play-village');
  return {
    c5FourDay: { fixtureId: 'personality-health', simulationId: 'personality-health-seed-42', seed: 42, advanceTicks: 576,
      config: c5.bundle.snapshot.world.memoryModel.config, commands: [] },
    d2cSixOperations: { fixtureId: 'player-play-village', simulationId: 'player-play-village', seed: 42, advanceTicks: 144,
      config: d2c.bundle.snapshot.world.memoryModel.config, commands: d2cCommands, finalTick: 176, finalPlayer: { wallet: 105, food: 4, herbs: 0 } },
  };
}
function exportManifest(bundle) {
  const w = bundle.snapshot.world;
  const inputs = [...bundle.snapshot.pendingCommands, ...Object.entries(bundle.snapshot.commandReceipts).map(([commandId, receipt]) =>
    ({ commandId, inputSeq: receipt.inputSeq, ...receipt.input }))].sort((a, b) => a.inputSeq - b.inputSeq);
  const projections = {
    actors: w.actorModel.actors, economy: { resources: w.resources, ledger: w.resourceModel.ledger },
    memories: w.memoryModel.observer.actors.map(a => ({ actorId: a.actorId, memories: a.memories })),
    relationships: w.memoryModel.observer.actors.map(a => ({ actorId: a.actorId, relationships: a.relationships })),
    society: w.societyModel.agents, ...(w.playerModel ? { player: w.playerModel } : {}), events: bundle.eventLog, inputs,
  };
  return { stateHash: hash(bundle.snapshot), eventHash: hash(bundle.eventLog), files: {
    [`checkpoint-r${bundle.snapshot.revision}.json`]: hash({ formatVersion: 1, ...bundle }),
    ...Object.fromEntries(Object.entries(projections).map(([name, value]) => [`${name}.json`, hash(value)])),
  } };
}
function originalScenarioResults(lib) {
  const c5 = advance(lib, lib.personality.createPersonalityHealth(42, 'personality-health-seed-42'), 576);
  let b = lib.player.createPlayerPlayVillage(42, 'player-play-village').bundle;
  for (const intent of d2cCommands) { const result = lib.intents.executePlayerIntent(b, structuredClone(intent)); assert.equal(result.outcome, 'succeeded'); b = result.bundle; }
  b = advance(lib, { bundle: b, systems: lib.player.playerPlaySystems() }, 144);
  assert.equal(b.snapshot.tick, 176);
  assert.deepEqual({ wallet: b.snapshot.world.playerModel.wallet, food: b.snapshot.world.playerModel.inventory.food, herbs: b.snapshot.world.playerModel.inventory.herbs }, { wallet: 105, food: 4, herbs: 0 });
  assert.equal(c5.snapshot.fixtureId, 'personality-health'); assert.equal(c5.snapshot.simulationId, 'personality-health-seed-42');
  const originalInputs = Object.entries(b.snapshot.commandReceipts).filter(([, r]) => r.input.type === 'PlayerAction').sort((a, b) => a[1].inputSeq - b[1].inputSeq)
    .map(([commandId, r]) => ({ commandId, ...r.input.payload.intent }));
  assert.deepEqual(originalInputs, d2cCommands);
  return { c5FourDay: exportManifest(c5), d2cSixOperations: exportManifest(b) };
}
async function originalArchive() {
  assert.equal(hash(await fs.readFile(path.join(archiveRoot, 'scenario.mjs'))), originalScriptHash, 'actual original scenario script');
  const bytes = await fs.readFile(path.join(archiveRoot, 'out', 'hashes.json'));
  assert.equal(hash(bytes), originalManifestHash, 'actual original manifest');
  const manifest = JSON.parse(bytes);
  for (const [scenario, entry] of Object.entries(manifest)) for (const [file, digest] of Object.entries(entry.files)) {
    assert.equal(hash(await fs.readFile(path.join(archiveRoot, 'out', scenario, file))), digest, `${scenario}/${file}`);
  }
  return { c5FourDay: manifest['c5-four-day'], d2cSixOperations: manifest['d2c-six-ops'] };
}
async function httpResults(server) {
  await post(server.url, time('old24', 0, 24)); await post(server.url, time('old288', 24, 264));
  const routes = ['/api/runtime/minds', '/api/runtime/player', '/api/runtime/snapshot', '/api/runtime/capabilities'];
  return Object.fromEntries(await Promise.all(routes.map(async route => [route, await get(server.url, route)])));
}
let oraclePromise;
function frozenOracle() {
  return oraclePromise ??= (async () => {
    assert.equal(git(baselineRoot, 'rev-parse', 'HEAD'), BASELINE);
    assert.equal(git(baselineRoot, 'status', '--porcelain', '--untracked-files=no'), '', 'baseline tracked tree must be unchanged');
    const fingerprints = await sourceFingerprints(baselineRoot);
    const old = await legacy(baselineRoot), scenarioSpecs = originalScenarioSpecs(old), archived = await originalArchive();
    const provenance = { originalScriptHash, originalManifestHash, priorOracleHash };
    const file = process.env.M2C_LEGACY_ORACLE ?? path.join(localRoot, 'artifacts', 'world-runtime-m2-acceptance-repair-20261008', 'legacy-oracle-87aa9b6-v2.json');
    let cached;
    try { cached = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (cached) {
      assert.equal(cached.schemaVersion, 2); assert.equal(cached.baselineSHA, BASELINE); assert.deepEqual(cached.sourceFingerprints, fingerprints);
      assert.deepEqual(cached.scenarioSpecs, scenarioSpecs); assert.deepEqual(cached.provenance, provenance);
      assert.deepEqual({ c5FourDay: cached.results.scenarios.c5FourDay, d2cSixOperations: cached.results.scenarios.d2cSixOperations }, archived);
      assert.equal(cached.payloadHash, hash({ scenarioSpecs, provenance, results: cached.results })); return cached;
    }
    const priorFile = process.env.M2C_LEGACY_ORACLE_V1 ?? 'D:/Narraverse-World-Map-m2-acceptance/artifacts/world-runtime-m2-acceptance-repair-20261008/legacy-oracle-87aa9b6.json';
    const prior = JSON.parse(await fs.readFile(priorFile, 'utf8'));
    assert.equal(prior.baselineSHA, BASELINE); assert.deepEqual(prior.sourceFingerprints, fingerprints);
    assert.equal(prior.payloadHash, priorOracleHash); assert.equal(hash(prior.results), priorOracleHash);
    const corrected = originalScenarioResults(old); assert.deepEqual(corrected, archived, 'two minimal baseline reruns match every original complete-bundle/data export hash');
    const { default288Hash, inspector, deadlineHashes, deadlineStates } = prior.results.scenarios;
    const results = { scenarios: { default288Hash, inspector, deadlineHashes, deadlineStates, ...corrected }, http: prior.results.http };
    cached = { schemaVersion: 2, baselineSHA: BASELINE, sourceFingerprints: fingerprints, scenarioSpecs, provenance, results,
      payloadHash: hash({ scenarioSpecs, provenance, results }) };
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(cached, null, 2), { flag: 'wx' }); return cached;
  })();
}
test('Q7 frozen baseline oracle records real source/scenario/HTTP hashes once; this is preparation, not M2 compatibility', async t => {
  const o = await frozenOracle(), d = o.results.scenarios.deadlineStates;
  assert.equal(d[1].goal.goalId, 1); assert.equal(d[2].goal, null); assert.equal(d[2].cooldown, 23); assert.equal(d[3].goal, null); assert.equal(d[4].goal.goalId, 2); assert.equal(d[4].failed, 1);
  assert.equal(o.scenarioSpecs.d2cSixOperations.commands.length, 5); assert.equal(o.scenarioSpecs.d2cSixOperations.advanceTicks, 144);
  assert.equal(o.scenarioSpecs.c5FourDay.fixtureId, 'personality-health'); assert.equal(o.results.http['/api/runtime/minds'].mindVersion, 'mind-inspector-v1');
  t.diagnostic(`Baseline oracle only: ${BASELINE}, payload SHA256 ${o.payloadHash}; M2 compatibility is separately gated on delivered A2.`);
});
test('Q7 delivered M2 code retains frozen legacy source and default288/deadline/D2C/C5 results', async t => {
  if (!ready(t)) return;
  const o = await frozenOracle(); assert.deepEqual(await sourceFingerprints(localRoot), o.sourceFingerprints);
  assert.deepEqual(legacyResults(await legacy(localRoot)), o.results.scenarios);
});
test('Q7 delivered service retains original M1 HTTP DTO288/player/public/capability against frozen oracle', async t => {
  if (!ready(t)) return;
  const root = await temporary(t), o = await frozenOracle(), server = await startRuntimeServer({ directory: path.join(root, 'world'), profile: 'mind-village', port: 0, writable: true, inspectMind: true }); t.after(() => server.close());
  assert.deepEqual(await httpResults(server), o.results.http);
});
