// M3-4A contract §2/§3: the cognition service (format6) against the real owner and real HTTP.
// Everything runs through createRuntimeOwner/startRuntimeServer with port 0 and private
// mkdtemp directories; this file never touches another process, never binds a fixed port and
// closes every owner it opened. Expectations come from the pinned contract text and the
// frozen baseline behavior — not from the implementation under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { loadCognitionBackend, cognitionBackendState, requireCognitionBackend, COGNITION_RULES,
  runtimeProfile, projectPublicSnapshot, validateServiceCommandDto, MOTIVATION_RULES } from '../../runtime/service/http-contract.mjs';
import { validateServiceCommit, transitionServiceCommand } from '../../runtime/service/service-commit.mjs';
import { createCognitionVillage, defaultCognitionVillageConfig, cognitionSystems } from '../../runtime/fixtures/cognition-village.mjs';
import { createMindVillage } from '../../runtime/fixtures/mind-village.mjs';
import { createPlayerPlayVillage } from '../../runtime/fixtures/player-play-village.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { describeMotivationPlayerActions } from '../../runtime/core/motivation-runtime.mjs';
import { createMotivationVillage } from '../../runtime/fixtures/motivation-village.mjs';

const intent = (commandId, expectedRevision, type, payload) => ({ version: 2, commandId, expectedRevision, type, payload });
const time = (commandId, expectedRevision = 0, ticks = 6) => ({ version: 1, commandId, expectedRevision, type: 'AdvanceTime', payload: { ticks } });
const COGNITION_PREFIXES = ['mind-day-', 'mind-settle-', 'society-day-', 'motivation-day-', 'experience-day-', 'cognition-day-', 'cognition-eval-'];
async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'world-cognition-service-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix)); await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}
async function getJson(url, opts) { const r = await fetch(url, opts); let body = null; try { body = await r.json(); } catch {/* HEAD/empty */} return { status: r.status, body, headers: r.headers }; }
async function storedBytes(directory) {
  const names = (await fs.readdir(directory)).filter(name => name !== '.runtime-owner.lock').sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await fs.readFile(path.join(directory, name), 'utf8')])));
}
const ownerReadings = owner => ({ public: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
  capabilities: { playerAvailable: owner.playerAvailable, playerActionsAvailable: owner.playerActionsAvailable, mindAvailable: owner.mindAvailable } });

test('contract §2: the cognition backend loads with exact exports, recognizes format6 only for the frozen rule/fixture pair, and unknown profiles never register', async t => {
  const record = await loadCognitionBackend();
  assert.equal(record.dependencyPending, false, 'the real integration must not be pending at this baseline');
  assert.equal(record.backend !== null, true);
  assert.equal(cognitionBackendState().available, true);
  assert.equal(COGNITION_RULES, 'm-cognition-v1');
  const backend = requireCognitionBackend();
  assert.deepEqual(Object.keys(backend).sort(), ['fixture', 'knowledge', 'runtime']);
  for (const [name, keys] of Object.entries({ fixture: ['defaultCognitionVillageConfig', 'createCognitionVillage', 'cognitionSystems'],
    runtime: ['validateCognitionWorld', 'executeCognitionPlayerIntent', 'describeCognitionPlayerActions'],
    knowledge: ['buildCognitionKnowledge', 'projectCognitionInspector'] }))
    for (const key of keys) assert.equal(typeof backend[name][key], 'function', `${name} export ${key}`);
  const village = backend.fixture.createCognitionVillage().bundle;
  assert.equal(runtimeProfile(village).serviceFormatVersion, 6);
  assert.equal(runtimeProfile(village).rulesVersion, COGNITION_RULES);
  // Contract §1: only this exact pair maps to format6; nothing else may grow into it.
  for (const forged of [
    { rulesVersion: COGNITION_RULES, fixtureId: 'cognition-village-v2' },
    { rulesVersion: 'm-cognition-v2', fixtureId: 'cognition-village' },
    { rulesVersion: COGNITION_RULES, fixtureId: 'motivation-village' }]) {
    const bundle = { snapshot: { fixtureVersion: '1', ...forged, simulationId: 'x', revision: 0, tick: 0 }, eventLog: [] };
    assert.throws(() => runtimeProfile(bundle), error => error.code === 'UNSUPPORTED_VERSION', JSON.stringify(forged));
  }
  const directory = path.join(await temporary(t), 'profile');
  for (const profile of ['cognition-village-x', 'cognition-villa', 'cognition']) {
    await assert.rejects(createRuntimeOwner({ directory: `${directory}-${profile}`, profile }),
      error => error.code === 'UNSUPPORTED_VERSION' && /Unknown runtime profile/.test(error.message), profile);
  }
  // Legacy profile recognition stays untouched.
  assert.equal(runtimeProfile(createPersonalityNeutral().bundle).serviceFormatVersion, 1);
  assert.equal(runtimeProfile(createPlayerPlayVillage().bundle).serviceFormatVersion, 3);
  assert.equal(runtimeProfile(createMindVillage().bundle).serviceFormatVersion, 4);
  assert.equal(runtimeProfile(createMotivationVillage().bundle).serviceFormatVersion, 5);
});

test('contract §2: format6 capabilities, one audited candidate and the cognition player actions DTO shape', async t => {
  const directory = path.join(await temporary(t), 'world');
  const owner = await createRuntimeOwner({ directory, profile: 'cognition-village' });
  t.after(() => owner.close());
  assert.equal(owner.playerAvailable, true);
  assert.equal(owner.playerActionsAvailable, true);
  assert.equal(owner.mindAvailable, true);
  const readings = ownerReadings(owner);
  assert.equal(readings.mind.mindVersion, 'cognition-inspector-v1');
  for (const projection of [readings.public, readings.player, readings.mind]) assert.equal(projection.revision, 0);
  assert.equal(readings.public.tick, 0);
  assert.equal(readings.player.actions.travelTicks, 12);
  assert.equal(readings.player.actions.restTicks, 6);
  assert.equal(readings.player.actions.tradeTicks, 1);
  assert.equal(readings.player.actions.maxQuantity, 10);
  assert.deepEqual(readings.player.actions.locations, ['village', 'forest']);
  assert.equal(readings.player.actions.canTrade, true);
  // Contract §2: the DTO is field-for-field the same shape as the motivation description.
  const motivationActions = describeMotivationPlayerActions(createMotivationVillage(42, 'shape-compare').bundle);
  assert.deepEqual(Object.keys(readings.player.actions).sort(), Object.keys(motivationActions).sort());
  // Mutating served data must not contaminate later reads (clone boundary).
  readings.mind.actors[0].knowledge.self.wallet = 999999;
  readings.player.actions.maxQuantity = 99;
  const again = ownerReadings(owner);
  assert.notEqual(again.mind.actors[0].knowledge.self.wallet, 999999);
  assert.equal(again.player.actions.maxQuantity, 10);
});

test('contract §2: a committed command atomically publishes all three projections at the same revision and bundle', async t => {
  const directory = path.join(await temporary(t), 'world');
  const owner = await createRuntimeOwner({ directory, profile: 'cognition-village', writable: true });
  t.after(() => owner.close());
  const receipt = await owner.submit(time('cognition-service-advance', 0, 144));
  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.toRevision, 144);
  const readings = ownerReadings(owner);
  for (const projection of [readings.public, readings.player, readings.mind]) {
    assert.equal(projection.revision, receipt.toRevision, 'three projections share the new revision');
    assert.equal(projection.tick, 144);
  }
  // Same candidate bundle backs all three views: the knowledge tick follows the projection.
  for (const actor of readings.mind.actors) {
    assert.equal(actor.knowledge.tick, readings.public.tick);
    assert.equal(actor.knowledge.revision, readings.public.revision);
  }
  assert.equal(readings.mind.worldFacts.publicFood, readings.public.market.food);
  assert.equal(readings.mind.worldFacts.postedHerbPrice, readings.public.market.prices.herbs);
  const durable = JSON.parse((await storedBytes(directory))[`service-commit-r${receipt.toRevision}.json`]);
  assert.equal(durable.serviceFormatVersion, 6);
  assert.equal(durable.commands.length, 1);
  assert.deepEqual(durable.commands[0].dto, time('cognition-service-advance', 0, 144));
});

test('contract §2: format6 rejects all seven internal prefixes on both DTO versions while old profiles keep their namespaces', async t => {
  const record = await loadCognitionBackend();
  const cognition = record.backend.fixture.createCognitionVillage().bundle;
  for (const prefix of COGNITION_PREFIXES) {
    assert.throws(() => transitionServiceCommand(cognition, time(`${prefix}external`)), error => error.code === 'INVALID_INPUT', `${prefix} DTO1`);
    assert.throws(() => transitionServiceCommand(cognition, intent(`${prefix}external`, 0, 'PlayerRest', {})), error => error.code === 'INVALID_INPUT', `${prefix} DTO2`);
  }
  // The generic DTO parser keeps rejecting society-day- for every version (legacy rules).
  assert.throws(() => validateServiceCommandDto(intent('society-day-x', 0, 'PlayerRest', {})), error => error.code === 'INVALID_INPUT');
  // Old formats never expand: motivation5 rejects its own three but accepts cognition namespaces;
  // mind4 accepts cognition/experience ids; play3 accepts cognition ids and still runs time.
  const motivation = createMotivationVillage(42, 'legacy-ns').bundle;
  for (const prefix of ['mind-day-', 'society-day-', 'motivation-day-'])
    assert.throws(() => transitionServiceCommand(motivation, time(`${prefix}external`)), error => error.code === 'INVALID_INPUT', `v5 ${prefix}`);
  assert.equal(transitionServiceCommand(motivation, time('cognition-day-legacy-ok')).receipt.toRevision, 6);
  assert.equal(transitionServiceCommand(motivation, time('cognition-eval-legacy-ok')).receipt.toRevision, 6);
  const mind = createMindVillage(42, 'legacy-ns-4').bundle;
  for (const prefix of ['mind-day-', 'society-day-'])
    assert.throws(() => transitionServiceCommand(mind, time(`${prefix}external`)), error => error.code === 'INVALID_INPUT', `v4 ${prefix}`);
  assert.equal(transitionServiceCommand(mind, time('experience-day-legacy-ok')).receipt.toRevision, 6);
  const play = createPlayerPlayVillage(42, 'legacy-ns-3').bundle;
  assert.equal(transitionServiceCommand(play, time('cognition-day-play-ok')).receipt.toRevision, 6);
  assert.doesNotThrow(() => transitionServiceCommand(play, intent('cognition-day-play-intent', 0, 'PlayerRest', {})));
  // format6 also refuses to enter an old-profile commit audit as format5 or 7.
  assert.throws(() => validateServiceCommit({ serviceFormatVersion: 7, anchor: cognition, commands: [], bundle: cognition }),
    error => error.code === 'UNSUPPORTED_VERSION');
  assert.throws(() => validateServiceCommit({ serviceFormatVersion: 5, anchor: cognition, commands: [], bundle: cognition }),
    error => error.code === 'UNSUPPORTED_VERSION');
  assert.doesNotThrow(() => validateServiceCommit({ serviceFormatVersion: 6, anchor: cognition, commands: [], bundle: cognition }));
});

test('contract §2: same-ID full DTO is idempotent (also after reopen), different payload conflicts, stale revisions 409', async t => {
  const directory = path.join(await temporary(t), 'world');
  const owner = await createRuntimeOwner({ directory, profile: 'cognition-village', writable: true });
  t.after(() => owner.close());
  const dto = time('cognition-idempotent', 0, 144);
  const receipt = await owner.submit(dto);
  assert.deepEqual(await owner.submit(dto), receipt, 'exact retry returns the durable receipt');
  await assert.rejects(owner.submit(time('cognition-idempotent', 0, 288)), error => error.code === 'COMMAND_ID_CONFLICT');
  await assert.rejects(owner.submit(time('cognition-stale', 0, 1)), error => error.code === 'REVISION_CONFLICT' && error.currentRevision === 144);
  await owner.close();
  const reopened = await createRuntimeOwner({ directory, writable: true });
  t.after(() => reopened.close());
  assert.equal(reopened.getSnapshot().revision, 144, 'reopen restores the revision');
  assert.deepEqual(await reopened.submit(dto), receipt, 'reopen keeps same-ID idempotency with the old expectedRevision');
  await assert.rejects(reopened.submit(time('cognition-idempotent', 0, 1)), error => error.code === 'COMMAND_ID_CONFLICT');
});

test('contract §2: real io.link fault rolls back all three projections and disk bytes; recovery publishes exactly once; reopen verifies', async t => {
  const directory = path.join(await temporary(t), 'world');
  let failNextLink = false, linkCalls = 0, injectedFailures = 0;
  const io = new Proxy(fs, { get(target, prop) {
    if (prop === 'link') return async (...args) => {
      linkCalls++;
      if (failNextLink) { failNextLink = false; injectedFailures++; throw Object.assign(new Error('injected link failure'), { code: 'EACCES' }); }
      return target.link(...args);
    };
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const owner = await createRuntimeOwner({ directory, profile: 'cognition-village', writable: true }, io);
  t.after(() => owner.close());
  const before = ownerReadings(owner), diskBefore = await storedBytes(directory);
  assert.equal(linkCalls, 1, 'the non-fault path really links: the initial commit exists on disk');
  assert.ok(diskBefore['service-commit-r0.json']);
  const dto = intent('cognition-save-fault', 0, 'PlayerRest', {});
  failNextLink = true;
  await assert.rejects(owner.submit(dto), error => error.code === 'SAVE_FAILED' && error.cause?.code === 'EACCES');
  assert.equal(injectedFailures, 1, 'the request reached durable publication');
  assert.deepEqual(ownerReadings(owner), before, 'all full projections and capabilities stay old');
  assert.deepEqual(await storedBytes(directory), diskBefore, 'failed publication preserves every file and byte');
  const receipt = await owner.submit(dto);
  assert.equal(receipt.status, 'committed');
  const after = ownerReadings(owner), diskAfter = await storedBytes(directory);
  const filename = `service-commit-r${receipt.toRevision}.json`;
  assert.deepEqual(Object.keys(diskAfter).sort(), ['service-commit-r0.json', filename].sort());
  assert.equal(diskAfter['service-commit-r0.json'], diskBefore['service-commit-r0.json']);
  const envelope = JSON.parse(diskAfter[filename]);
  assert.equal(envelope.commands.length, 1, 'the retry publishes exactly once');
  assert.deepEqual(envelope.commands[0].dto, dto);
  assert.deepEqual(envelope.commands[0].receipt, receipt);
  for (const projection of [after.public, after.player, after.mind]) assert.equal(projection.revision, receipt.toRevision);
  assert.deepEqual(await owner.submit(dto), receipt);
  assert.equal(linkCalls, 3, 'retry does not publish another file');
  await owner.close();
  const reopened = await createRuntimeOwner({ directory, writable: true });
  t.after(() => reopened.close());
  assert.deepEqual(ownerReadings(reopened), after, 'reopen restores all three full projections');
  assert.deepEqual(await reopened.submit(dto), receipt, 'reopen keeps the durable idempotency');
  assert.deepEqual(await storedBytes(directory), diskAfter, 'reopen and retries do not change durable bytes');
});

test('contract §2: explicit checkpoint initialization runs with source/runtime separation and no profile option', async t => {
  const root = await temporary(t);
  const source = path.join(root, 'source-world'), runtime = path.join(root, 'runtime-world');
  await fs.mkdir(source); await fs.mkdir(runtime);
  const bundle = createCognitionVillage(42, 'checkpoint-closeout').bundle;
  const saved = await saveCheckpoint(bundle, { directory: source, rulesVersion: COGNITION_RULES, systems: cognitionSystems() });
  const checkpointFile = path.join(source, 'checkpoint-r0.json');
  assert.ok(saved);
  await fs.access(checkpointFile);
  const sourceBefore = await storedBytes(source);
  const owner = await createRuntimeOwner({ directory: runtime, checkpoint: checkpointFile, writable: true });
  t.after(() => owner.close());
  assert.deepEqual(await storedBytes(source), sourceBefore, 'the source directory is never rewritten');
  assert.ok(Object.keys(sourceBefore).includes('checkpoint-r0.json'));
  const readings = ownerReadings(owner);
  assert.equal(readings.mind.mindVersion, 'cognition-inspector-v1');
  assert.equal(readings.public.revision, 0);
  const files = await storedBytes(runtime);
  assert.ok(files['service-commit-r0.json'], 'the runtime directory owns its new commit file');
  const receipt = await owner.submit(time('checkpoint-advance', 0, 144));
  assert.equal(receipt.toRevision, 144);
  assert.equal(owner.getMindInspector().revision, 144);
  // An explicit checkpoint cannot be replaced by a profile later in the same directory.
  await owner.close();
  await assert.rejects(createRuntimeOwner({ directory: runtime, profile: 'cognition-village' }),
    error => /Cannot reset existing runtime profile|Cannot replace existing runtime checkpoint/.test(error.message));
});

test('contract §3: HTTP keeps the gate order — disabled or incapable worlds 404 every method and query first', async t => {
  const root = await temporary(t);
  const closed = await startRuntimeServer({ directory: path.join(root, 'closed'), profile: 'cognition-village', port: 0 });
  t.after(() => closed.close());
  assert.equal((await getJson(closed.url + '/api/runtime/capabilities')).body.mindAvailable, false);
  for (const opts of [undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, { method: 'HEAD' }, { method: 'PUT' }])
    assert.equal((await getJson(closed.url + '/api/runtime/minds', opts)).status, 404, `closed gate ${opts?.method ?? 'GET'}`);
  assert.equal((await getJson(closed.url + '/api/runtime/minds?page=1')).status, 404);
  for (const route of ['/runtime-mind.html', '/runtime-mind.mjs', '/runtime-mind.css'])
    assert.equal((await fetch(closed.url + route)).status, 404, route);
  const noCapability = await startRuntimeServer({ directory: path.join(root, 'no-cap'), profile: 'personality-neutral', port: 0, inspectMind: true });
  t.after(() => noCapability.close());
  assert.equal((await getJson(noCapability.url + '/api/runtime/capabilities')).body.mindAvailable, false);
  for (const opts of [undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, { method: 'HEAD' }])
    assert.equal((await getJson(noCapability.url + '/api/runtime/minds', opts)).status, 404);
  assert.equal((await getJson(noCapability.url + '/api/runtime/minds?page=1')).status, 404);
  for (const route of ['/runtime-mind.html', '/runtime-mind.mjs', '/runtime-mind.css'])
    assert.equal((await fetch(noCapability.url + route)).status, 404, route);
});

test('contract §3: capable cognition HTTP serves method/query gating, HEAD parity, static reads and never-mutating GETs', async t => {
  const directory = path.join(await temporary(t), 'world');
  const server = await startRuntimeServer({ directory, profile: 'cognition-village', port: 0, writable: true, inspectMind: true });
  t.after(() => server.close());
  const cap = await getJson(server.url + '/api/runtime/capabilities');
  assert.equal(cap.body.mindAvailable, true);
  assert.equal(cap.body.playerActionsAvailable, true);
  const get = await fetch(server.url + '/api/runtime/minds');
  assert.equal(get.status, 200);
  const first = await get.json();
  assert.equal(first.mindVersion, 'cognition-inspector-v1');
  const head = await fetch(server.url + '/api/runtime/minds', { method: 'HEAD' });
  assert.equal(head.status, get.status);
  assert.equal(head.headers.get('content-type'), get.headers.get('content-type'));
  assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal((await head.text()).length, 0);
  const post = await getJson(server.url + '/api/runtime/minds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
  assert.equal((await getJson(server.url + '/api/runtime/minds?page=1')).status, 400);
  for (const route of ['/runtime-mind.html', '/runtime-mind.mjs', '/runtime-mind.css'])
    assert.equal((await fetch(server.url + route)).status, 200, route);
  // Consecutive reads never advance or rewrite anything.
  const diskBefore = await storedBytes(directory);
  await getJson(server.url + '/api/runtime/minds');
  await getJson(server.url + '/api/runtime/snapshot');
  const repeat = await getJson(server.url + '/api/runtime/minds');
  assert.deepEqual(repeat.body, first, 'repeat GET returns the same DTO');
  assert.deepEqual(await storedBytes(directory), diskBefore, 'GET never writes');
  // A caller mutating its own copy of a served DTO cannot pollute the next read.
  repeat.body.actors[0].knowledge.self.wallet = 999999;
  repeat.body.revision = 12345;
  const fresh = await getJson(server.url + '/api/runtime/minds');
  assert.deepEqual(fresh.body, first);
  // Real HTTP commit: the read-only endpoints then report the new shared revision.
  const receipt = await getJson(server.url + '/api/runtime/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(time('http-cognition-advance', 0, 144)) });
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.toRevision, 144);
  const [minds, snapshot, player] = await Promise.all([getJson(server.url + '/api/runtime/minds'), getJson(server.url + '/api/runtime/snapshot'), getJson(server.url + '/api/runtime/player')]);
  assert.equal(minds.body.revision, 144);
  assert.equal(snapshot.body.revision, 144);
  assert.equal(player.body.revision, 144);
  assert.equal(minds.body.tick, 144);
});
