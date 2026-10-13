import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { projectEncounterSnapshot, runtimeProfile, validateServiceCommandDto, parseCommandBytes,
  loadSurvivalBackend } from '../../runtime/service/http-contract.mjs';
import { transitionServiceCommand, loadServiceCommit } from '../../runtime/service/service-commit.mjs';
import { createEncounterVillage, defaultEncounterVillageConfig } from '../../runtime/fixtures/encounter-survival-village.mjs';
import { createSurvivalVillage, defaultSurvivalVillageConfig } from '../../runtime/fixtures/survival-village.mjs';

const PROFILE = 'encounter-survival-village';
const dto = (commandId, expectedRevision, type, payload = {}) => ({ version: 3, commandId, expectedRevision, type, payload });
const begin = (id, revision) => dto(id, revision, 'EncounterBegin');
const attack = (id, revision, encounterId = 'encounter-1') => dto(id, revision, 'EncounterAction', { encounterId, action: 'attack' });
const cleanupByTest = new WeakMap();
function cleanupState(t) {
  let state = cleanupByTest.get(t);
  if (!state) {
    state = { resources: [], directories: [] };
    cleanupByTest.set(t, state);
    t.after(async () => {
      for (const close of state.resources.reverse()) await close();
      for (const directory of state.directories.reverse()) {
        assert.ok(path.isAbsolute(directory) && directory.startsWith(path.join(os.tmpdir(), 'd35-encounter-service-')),
          'cleanup is confined to this test’s unique TEMP directory');
        await fs.rm(directory, { recursive: true, force: true });
      }
    });
  }
  return state;
}
async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'd35-encounter-service-');
  const dir = await fs.mkdtemp(prefix);
  cleanupState(t).directories.push(dir);
  return dir;
}
function trackOwner(t, owner) { cleanupState(t).resources.push(() => owner.close()); return owner; }
function trackServer(t, server) { cleanupState(t).resources.push(() => server.close()); return server; }
async function readJson(base, route, options) {
  const response = await fetch(base + route, options);
  let body = null;
  try { body = await response.json(); } catch { /* HEAD and empty response */ }
  return { status: response.status, body, headers: response.headers };
}
async function ownerAt(t, directory, options = {}) {
  return trackOwner(t, await createRuntimeOwner({ directory, profile: PROFILE, seed: 42, writable: true, ...options }));
}
function sameRevision(readings) {
  const revisions = readings.map(reading => reading.revision);
  assert.ok(revisions.every(revision => revision === revisions[0]), `projection revisions diverged: ${revisions}`);
  return revisions[0];
}
function four(owner) { return [owner.getSnapshot(), owner.getPlayer(), owner.getMindInspector(), owner.getEncounter()]; }

test('D3-5 §service: encounter snapshot is a detached, exact-shape projection of the real profile', () => {
  const { bundle } = createEncounterVillage(42, 'encounter-survival-village', defaultEncounterVillageConfig('affordable'));
  assert.equal(runtimeProfile(bundle).serviceFormatVersion, 8);
  const first = projectEncounterSnapshot(bundle);
  const expectedKeys = ['apiVersion', 'encounterViewVersion', 'simulationId', 'revision', 'tick', 'actorId', 'self', 'encounter', 'population', 'actions'];
  assert.deepEqual(Object.keys(first).sort(), expectedKeys.sort());
  assert.deepEqual(Object.keys(first.self).sort(), ['alive', 'health', 'location', 'deathTick'].sort());
  assert.deepEqual(Object.keys(first.population).sort(), ['totalLivingWolves', 'availableWolves', 'reservedWolves', 'battleDeaths'].sort());
  assert.equal(first.apiVersion, 1);
  assert.equal(first.encounterViewVersion, 1);
  assert.equal(first.actorId, 'actor-4');
  assert.equal(first.encounter, null);
  assert.equal(first.self.health, 1000);
  assert.equal(first.self.location, 'village');
  assert.equal(first.population.totalLivingWolves, 14);
  assert.equal(first.population.availableWolves, 14);
  assert.equal(first.population.reservedWolves, 0);
  assert.equal(first.population.battleDeaths, 0);
  const second = projectEncounterSnapshot(bundle);
  assert.notEqual(second, first);
  second.population.totalLivingWolves = -1;
  second.actions.blockedWorldActions.push('poison');
  assert.deepEqual(projectEncounterSnapshot(bundle), first, 'projection and nested arrays are copied from the world');
});

test('D3-5 §service: format 8 accepts DTO3 only and the existing profile keeps DTO3 unsupported', async () => {
  const fixture = createEncounterVillage(42, 'encounter-survival-village', defaultEncounterVillageConfig('affordable'));
  assert.deepEqual(validateServiceCommandDto(begin('dto3-valid', 0)), begin('dto3-valid', 0));
  for (const version of [1, 2]) {
    const oldDto = version === 1
      ? { version, commandId: `old-dto-${version}`, expectedRevision: 0, type: 'AdvanceTime', payload: { ticks: 1 } }
      : { version, commandId: `old-dto-${version}`, expectedRevision: 0, type: 'PlayerRest', payload: {} };
    assert.throws(() => transitionServiceCommand(fixture.bundle, oldDto), error => error.code === 'UNSUPPORTED_VERSION');
  }
  await loadSurvivalBackend();
  const oldBundle = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable')).bundle;
  assert.throws(() => transitionServiceCommand(oldBundle, begin('dto3-old-profile', 0)), error => error.code === 'COMMAND_UNSUPPORTED');
});

test('D3-5 §service: DTO preflight accepts frozen null-prototype JSON and rejects getters without invoking them', () => {
  const payload = Object.freeze(Object.create(null));
  const raw = Object.freeze(Object.assign(Object.create(null), {
    version: 3, commandId: 'dto3-frozen-null-proto', expectedRevision: 0, type: 'EncounterBegin', payload,
  }));
  assert.deepEqual(validateServiceCommandDto(raw), begin('dto3-frozen-null-proto', 0));
  const wireDto = begin('dto3-wire-mode', 0);
  const wireBytes = Buffer.from(JSON.stringify(wireDto));
  assert.throws(() => parseCommandBytes(wireBytes), error => error.code === 'UNSUPPORTED_VERSION',
    'the default parser mode preserves the legacy DTO1/2 surface');
  assert.deepEqual(parseCommandBytes(wireBytes, 3), wireDto, 'the format 8 service opts into DTO3 parsing explicitly');
  let getterCalls = 0;
  const accessorDto = { version: 3, commandId: 'dto3-getter', expectedRevision: 0, payload: {} };
  Object.defineProperty(accessorDto, 'type', { enumerable: true, get() { getterCalls += 1; return 'EncounterBegin'; } });
  assert.throws(() => validateServiceCommandDto(accessorDto));
  assert.equal(getterCalls, 0, 'descriptor-first validation never evaluates accessor input');
  assert.throws(() => parseCommandBytes(Buffer.alloc(4097, 0x20)), error => error.code === 'LIMIT_EXCEEDED',
    'HTTP parser enforces the UTF-8 command byte budget before JSON decoding');
});

test('D3-5 §service: one owner commits Travel → Begin → attack, preserves active state across reopen, then resolves win exactly once', async t => {
  const directory = path.join(await temporary(t), 'world');
  let owner = await ownerAt(t, directory);
  const travel = dto('service-travel-forest', 0, 'PlayerTravel', { destination: 'forest' });
  const travelReceipt = await owner.submit(travel);
  assert.equal(travelReceipt.durationTicks, 12);
  assert.equal(owner.getEncounter().self.location, 'forest');
  const revBeforeBegin = owner.getSnapshot().revision;
  const start = begin('service-encounter-begin', revBeforeBegin);
  const startReceipt = await owner.submit(start);
  assert.equal(startReceipt.outcome, 'succeeded');
  assert.equal(startReceipt.durationTicks, 0);
  assert.equal(startReceipt.tick, 12);
  assert.equal(startReceipt.toRevision, startReceipt.fromRevision + 1);
  assert.equal(owner.getEncounter().encounter.status, 'active');
  assert.equal(owner.getEncounter().population.reservedWolves, 1);

  const beforeBusy = owner.getSnapshot();
  const busy = await owner.submit(dto('service-active-world-command', beforeBusy.revision, 'AdvanceTime', { ticks: 10 }));
  assert.equal(busy.outcome, 'rejected');
  assert.deepEqual(busy.result, { code: 'ENCOUNTER_BUSY' });
  assert.equal(busy.durationTicks, 0);
  assert.equal(busy.tick, beforeBusy.tick);
  assert.equal(owner.getSnapshot().revision, beforeBusy.revision + 1);
  assert.equal(owner.getSnapshot().tick, beforeBusy.tick);

  const attackRevision = owner.getSnapshot().revision;
  const firstAttackDto = attack('service-encounter-attack-1', attackRevision);
  const firstAttack = await owner.submit(firstAttackDto);
  assert.equal(firstAttack.outcome, 'succeeded');
  assert.equal(firstAttack.durationTicks, 6);
  assert.equal(firstAttack.tick, 18);
  const [snapshot1, player1, mind1, encounter1] = four(owner);
  assert.equal(sameRevision([snapshot1, player1, mind1, encounter1]), firstAttack.toRevision);
  assert.equal(player1.self.health, 920, 'the first surviving wolf counterattack costs 80 health');
  assert.equal(encounter1.self.health, 920);
  assert.equal(encounter1.encounter.wolfHealth, 150);
  assert.equal(encounter1.encounter.attackCount, 1);
  assert.equal(encounter1.population.totalLivingWolves, 14);
  assert.equal(encounter1.population.reservedWolves, 1);
  assert.equal(encounter1.population.availableWolves, 13);
  assert.equal(encounter1.population.battleDeaths, 0);

  await owner.close();
  owner = trackOwner(t, await createRuntimeOwner({ directory, writable: true }));
  const [snapshot2, player2, mind2, encounter2] = four(owner);
  assert.deepEqual([snapshot2, player2, mind2, encounter2], [snapshot1, player1, mind1, encounter1], 'reopen retains the active battle, health and reservation');
  assert.deepEqual(await owner.submit(firstAttackDto), firstAttack, 'same DTO remains idempotent after reopen');
  await assert.rejects(owner.submit(attack(firstAttackDto.commandId, 0)), error => error.code === 'COMMAND_ID_CONFLICT',
    'used ID with different DTO conflicts before stale-revision handling');
  await assert.rejects(owner.submit(attack('service-stale-new-id', 0)), error => error.code === 'REVISION_CONFLICT');
  assert.deepEqual(four(owner), [snapshot1, player1, mind1, encounter1], 'conflicts and replay do not mutate projections');

  const secondAttack = await owner.submit(attack('service-encounter-attack-2', owner.getSnapshot().revision));
  assert.equal(secondAttack.outcome, 'succeeded');
  assert.equal(secondAttack.tick, 24);
  const finalView = owner.getEncounter();
  assert.equal(owner.getPlayer().self.health, 920, 'victory does not heal the prior injury');
  assert.equal(finalView.encounter.status, 'closed');
  assert.equal(finalView.encounter.resolution, 'win');
  assert.equal(finalView.encounter.wolfHealth, 0);
  assert.equal(finalView.encounter.attackCount, 2);
  assert.equal(finalView.population.totalLivingWolves, 13);
  assert.equal(finalView.population.reservedWolves, 0);
  assert.equal(finalView.population.availableWolves, 13);
  assert.equal(finalView.population.battleDeaths, 1);
  assert.equal(owner.getEncounter().revision, secondAttack.toRevision);

  const commitFile = path.join(directory, `service-commit-r${secondAttack.toRevision}.json`);
  const audited = await loadServiceCommit(commitFile);
  assert.equal(audited.serviceFormatVersion, 8);
  assert.equal(audited.bundle.snapshot.revision, secondAttack.toRevision);
  assert.deepEqual(audited.commands.map(command => command.dto.commandId), [travel.commandId, start.commandId,
    'service-active-world-command', firstAttackDto.commandId, 'service-encounter-attack-2'],
    'loadServiceCommit accepted only the complete command history after full canonical replay');
  const tamperCases = [
    ['receipt', envelope => {
      const entry = envelope.commands.find(command => command.dto.type === 'EncounterAction' && command.dto.payload.action === 'attack');
      entry.receipt.result.after.wolfHealth = Math.max(0, entry.receipt.result.after.wolfHealth - 1);
    }],
    ['reservation', envelope => { envelope.bundle.snapshot.world.ecologyModel.reservedWolves = 1; }],
    ['causation', envelope => {
      const event = envelope.bundle.eventLog.find(item => item.type === 'EncounterCommandResolved' &&
        item.payload.dto.type === 'EncounterAction' && item.payload.dto.payload.action === 'attack');
      event.causationEventSeqs = [event.eventSeq];
    }],
  ];
  for (const [name, tamper] of tamperCases) {
    const changed = JSON.parse(JSON.stringify(audited));
    tamper(changed);
    const target = path.join(directory, `tampered-${name}.json`);
    await fs.writeFile(target, JSON.stringify(changed));
    await assert.rejects(loadServiceCommit(target), error => error.code === 'INVALID_SERVICE_COMMIT',
      `service-commit replay/audit must reject the changed ${name}`);
  }
});

test('D3-5 §HTTP: real format 8 and old-profile routes enforce method/query/version gates and shared capabilities', async t => {
  const dir = await temporary(t);
  const current = trackServer(t, await startRuntimeServer({ directory: path.join(dir, 'encounter'), profile: PROFILE, port: 0, writable: false, inspectMind: true }));
  const capabilities = await readJson(current.url, '/api/runtime/capabilities');
  assert.equal(capabilities.status, 200);
  assert.equal(capabilities.body.commandDtoVersion, 3);
  assert.equal(capabilities.body.encounterAvailable, true);
  assert.equal(capabilities.body.mindAvailable, true);
  const encounterGet = await fetch(current.url + '/api/runtime/encounter');
  assert.equal(encounterGet.status, 200);
  const encounterBody = await encounterGet.json();
  const encounterHead = await fetch(current.url + '/api/runtime/encounter', { method: 'HEAD' });
  assert.equal(encounterHead.status, encounterGet.status);
  for (const name of ['content-type', 'content-length', 'cache-control']) assert.equal(encounterHead.headers.get(name), encounterGet.headers.get(name));
  assert.equal((await encounterHead.text()).length, 0);
  assert.deepEqual((await readJson(current.url, '/api/runtime/minds')).body.revision, encounterBody.revision,
    'real projectMindInspector remains enabled for the new profile');
  assert.equal((await readJson(current.url, '/api/runtime/encounter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405);
  assert.equal((await readJson(current.url, '/api/runtime/encounter?x=1')).status, 400);
  assert.equal((await readJson(current.url, '/api/runtime/encounter?x=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405,
    'route method gate precedes query parsing for the supported route');
  assert.equal((await readJson(current.url, '/api/runtime/commands', { method: 'GET' })).status, 405, 'read-only owner never accepts commands');
  const legacy = trackServer(t, await startRuntimeServer({ directory: path.join(dir, 'legacy'), profile: 'survival-village', port: 0, writable: true, inspectMind: true }));
  assert.equal((await readJson(legacy.url, '/api/runtime/encounter')).status, 404);
  assert.equal((await readJson(legacy.url, '/api/runtime/encounter', { method: 'HEAD' })).status, 404);
  assert.equal((await readJson(legacy.url, '/api/runtime/encounter?x=1')).status, 404, 'unknown legacy route gate precedes query validation');
  assert.equal((await readJson(legacy.url, '/api/runtime/encounter?x=1', { method: 'PUT' })).status, 404, 'legacy profile keeps 404 precedence');
  const unsupported = { version: 1, commandId: 'http-unsupported-v1', expectedRevision: 0, type: 'AdvanceTime', payload: { ticks: 1 } };
  assert.equal((await readJson(current.url, '/api/runtime/commands', { method: 'GET' })).status, 405);
  const writable = trackServer(t, await startRuntimeServer({ directory: path.join(dir, 'encounter-writable'), profile: PROFILE, port: 0, writable: true }));
  const rejectedDto = await readJson(writable.url, '/api/runtime/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(unsupported) });
  assert.equal(rejectedDto.status, 400);
  assert.equal(rejectedDto.body.error.code, 'UNSUPPORTED_VERSION');
});
async function storedBytes(directory) {
  const names = (await fs.readdir(directory)).filter(name => name !== '.runtime-owner.lock').sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await fs.readFile(path.join(directory, name))])));
}

test('D3-5 §service: real io.link EACCES before publish leaves all projections and commit bytes intact; same-ID retry commits once', async t => {
  const directory = path.join(await temporary(t), 'fault-world');
  let failNextLink = false;
  const io = new Proxy(fs, { get(target, property) {
    if (property === 'link') return async (...args) => {
      if (failNextLink) {
        failNextLink = false;
        throw Object.assign(new Error('injected publish-before-link denial'), { code: 'EACCES' });
      }
      return Reflect.get(target, property, target)(...args);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const owner = trackOwner(t, await createRuntimeOwner({ directory, profile: PROFILE, seed: 42, writable: true }, io));
  const travel = dto('service-fault-travel-forest', 0, 'PlayerTravel', { destination: 'forest' });
  const travelReceipt = await owner.submit(travel);
  assert.equal(travelReceipt.tick, 12, 'the fault scenario reaches forest through the real travel command');
  const before = four(owner);
  const diskBefore = await storedBytes(directory);
  failNextLink = true;
  const command = begin('service-fault-begin-retry', before[0].revision);
  await assert.rejects(owner.submit(command), error => error.code === 'SAVE_FAILED' && error.cause?.code === 'EACCES');
  assert.deepEqual(four(owner), before, 'failed durable publish must not swap the live bundle or any cached view');
  assert.deepEqual(await storedBytes(directory), diskBefore, 'official service-commit bytes remain byte-for-byte unchanged');
  const committed = await owner.submit(command);
  assert.equal(committed.outcome, 'succeeded');
  assert.equal(committed.toRevision, before[0].revision + 1);
  const afterCommit = four(owner);
  assert.equal(afterCommit[3].encounter.status, 'active');
  assert.equal(sameRevision(afterCommit), committed.toRevision);
  assert.deepEqual(await owner.submit(command), committed, 'same ID retry after commit cannot duplicate effects');
  assert.deepEqual(four(owner), afterCommit);
  const diskAfter = await storedBytes(directory);
  assert.equal(Object.keys(diskAfter).filter(name => name.startsWith('service-commit-r')).length, 3,
    'only initialization, successful travel and the one successful Begin are official revisions');
  assert.deepEqual(await storedBytes(directory), diskAfter);
});

test('D3-5 §service: the full 128-command encounter journal fits the service-file budget and fails closed at 129', async t => {
  const directory = path.join(await temporary(t), 'budget-world');
  const owner = await ownerAt(t, directory);
  const started = performance.now();
  const receipts = [];
  for (let index = 1; index <= 128; index += 1) {
    const revision = owner.getSnapshot().revision;
    const receipt = await owner.submit(begin(`budget-${String(index).padStart(3, '0')}`, revision));
    receipts.push(receipt);
    assert.equal(receipt.status, 'committed');
    assert.equal(receipt.outcome, 'rejected', 'Begin at village is a real accepted domain rejection');
    assert.equal(receipt.durationTicks, 0);
    assert.equal(receipt.tick, 0);
    assert.equal(receipt.toRevision, revision + 1);
    if (index % 16 === 0) {
      console.log(`D3-5 service budget: ${index}/128 committed, revision=${owner.getSnapshot().revision}, elapsed=${Math.round(performance.now() - started)}ms`);
    }
  }

  const [snapshot, player, mind, encounter] = four(owner);
  assert.equal(sameRevision([snapshot, player, mind, encounter]), 128);
  assert.equal(snapshot.tick, 0);
  assert.equal(encounter.encounter, null);
  const diskAtLimit = await storedBytes(directory);
  assert.equal(Object.keys(diskAtLimit).filter(name => name.startsWith('service-commit-r')).length, 129,
    'r0 plus 128 accepted command revisions are published');
  const latest = await loadServiceCommit(path.join(directory, 'service-commit-r128.json'));
  assert.equal(latest.commands.length, 128);
  assert.equal(latest.bundle.snapshot.world.encounterModel.inputHistory.length, 128);
  assert.deepEqual(await owner.submit(begin('budget-128', 127)), receipts[127],
    'same-ID retry for the 128th command remains idempotent at the file budget');
  await assert.rejects(owner.submit(dto('budget-128', 0, 'PlayerTravel', { destination: 'forest' })),
    error => error.code === 'COMMAND_ID_CONFLICT', 'same-ID conflict takes priority over stale revision and budget');

  await assert.rejects(owner.submit(begin('budget-129', 128)), error => error.code === 'LIMIT_EXCEEDED');
  assert.deepEqual(four(owner), [snapshot, player, mind, encounter], 'the 129th ID leaves every cached projection unchanged');
  assert.deepEqual(await storedBytes(directory), diskAtLimit, 'the 129th ID publishes no service-commit file');

  await owner.close();
  const reopened = trackOwner(t, await createRuntimeOwner({ directory, writable: true }));
  assert.deepEqual(four(reopened), [snapshot, player, mind, encounter], 'reopen loads all 128 receipts and four projections');
  assert.deepEqual(await reopened.submit(begin('budget-128', 127)), receipts[127]);
  assert.equal(Object.keys(await storedBytes(directory)).filter(name => name.startsWith('service-commit-r')).length, 129);
});

test('D3-5 §service: legacy personality owner keeps the 128-file cap after 127 real one-tick writes', async t => {
  const directory = path.join(await temporary(t), 'legacy-budget-world');
  const owner = trackOwner(t, await createRuntimeOwner({ directory, profile: 'personality-neutral', seed: 42, writable: true }));
  const started = performance.now();
  for (let index = 1; index <= 127; index += 1) {
    const revision = owner.getSnapshot().revision;
    const receipt = await owner.submit({ version: 1, commandId: `legacy-budget-${String(index).padStart(3, '0')}`,
      expectedRevision: revision, type: 'AdvanceTime', payload: { ticks: 1 } });
    assert.deepEqual(Object.keys(receipt).sort(), ['apiVersion', 'commandId', 'status', 'fromRevision', 'toRevision', 'tick'].sort());
    assert.equal(receipt.status, 'committed');
    assert.equal(receipt.fromRevision, revision);
    assert.equal(receipt.toRevision, revision + 1);
    assert.equal(receipt.tick, index);
    if (index % 16 === 0) console.log(`D3-5 legacy service budget: ${index}/127 committed, revision=${owner.getSnapshot().revision}, elapsed=${Math.round(performance.now() - started)}ms`);
  }

  const atLimit = owner.getSnapshot();
  assert.equal(atLimit.revision, 127);
  assert.equal(atLimit.tick, 127);
  const filesAtLimit = await storedBytes(directory);
  assert.equal(Object.keys(filesAtLimit).filter(name => name.startsWith('service-commit-r')).length, 128,
    'r0 plus 127 commands fit the unchanged legacy file budget');
  await assert.rejects(owner.submit({ version: 1, commandId: 'legacy-budget-128', expectedRevision: 127,
    type: 'AdvanceTime', payload: { ticks: 1 } }), error => error.code === 'LIMIT_EXCEEDED');
  assert.deepEqual(owner.getSnapshot(), atLimit, 'the 128th legacy DTO leaves the snapshot unchanged');
  assert.deepEqual(await storedBytes(directory), filesAtLimit, 'the rejected legacy DTO publishes no official file');

  await owner.close();
  const reopened = trackOwner(t, await createRuntimeOwner({ directory, writable: true }));
  assert.deepEqual(reopened.getSnapshot(), atLimit, 'no-profile reopen loads the complete 128-file legacy chain');
  assert.equal(Object.keys(await storedBytes(directory)).filter(name => name.startsWith('service-commit-r')).length, 128);
});
