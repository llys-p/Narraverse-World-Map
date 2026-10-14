import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {canonicalJson} from '../../runtime/core/data-contract.mjs';
import {SCENE_RULES, executeSceneIntent} from '../../runtime/core/scene-runtime.mjs';
import {ENCOUNTER_RULES} from '../../runtime/core/encounter-runtime.mjs';
import {createSceneVillage, sceneSystems} from '../../runtime/fixtures/scene-survival-village.mjs';
import {createEncounterVillage, encounterSystems} from '../../runtime/fixtures/encounter-survival-village.mjs';
import {loadCheckpoint, saveCheckpoint} from '../../runtime/persistence/checkpoint-store.mjs';
import {createRuntimeOwner} from '../../runtime/service/runtime-owner.mjs';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {
  loadServiceCommit, MAX_PENDING_REQUESTS, MAX_SERVICE_COMMANDS, MAX_SERVICE_FILES,
  saveServiceCommit, validateServiceCommit,
} from '../../runtime/service/service-commit.mjs';

const giftDto = (commandId, expectedRevision) => ({version: 3, commandId, expectedRevision,
  type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}});
const advanceDto = (commandId, expectedRevision, ticks = 1) => ({version: 3, commandId, expectedRevision,
  type: 'AdvanceTime', payload: {ticks}});

async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'world-map-d4b-service-');
  const directory = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.ok(directory.startsWith(prefix), 'cleanup must stay within this test-owned temp directory');
    await fs.rm(directory, {recursive: true, force: true});
  });
  return directory;
}

async function directoryBytes(directory) {
  const names = (await fs.readdir(directory)).filter(name => name !== '.runtime-owner.lock').sort();
  return Object.fromEntries(await Promise.all(names.map(async name =>
    [name, (await fs.readFile(path.join(directory, name))).toString('base64')])));
}

function projections(owner) {
  return {snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
    encounter: owner.getEncounter(), scene: owner.getScene()};
}

test('H4: live HTTP keeps exact-retry, same-ID conflict and stale-revision status codes', async t => {
  const root = await temporary(t);
  const server = await startRuntimeServer({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
    seed: 42, port: 0, writable: true, inspectMind: true});
  t.after(() => server.close());
  const post = async dto => {
    const response = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(dto)});
    return {status: response.status, body: await response.json()};
  };
  const originalDto = giftDto('d4b-h4-http-retry', 0);
  const first = await post(originalDto);
  assert.equal(first.status, 200);
  assert.deepEqual((await post(originalDto)).body, first.body, 'HTTP retries the exact original canonical DTO');
  const conflict = await post({...originalDto, expectedRevision: 1});
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'COMMAND_ID_CONFLICT');
  const stale = await post(giftDto('d4b-h4-http-stale', 0));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'REVISION_CONFLICT');
  assert.equal(stale.body.currentRevision, 1);

  const read = route => fetch(`${server.url}${route}`).then(response => response.json());
  const views = await Promise.all(['/api/runtime/snapshot', '/api/runtime/player', '/api/runtime/minds',
    '/api/runtime/encounter', '/api/runtime/scene'].map(read));
  assert.deepEqual(views.map(view => view.revision), [1, 1, 1, 1, 1]);
  assert.deepEqual(views.map(view => view.tick), [0, 0, 0, 0, 0]);
  assert.equal(views[4].self.food, 19);
  assert.equal(views[4].actors.find(actor => actor.actorId === 'actor-2').receivedGifts.length, 1);
});

test('H4: a real link EACCES preserves all five projections, the full bundle and every runtime byte; same DTO publishes once', async t => {
  const root = await temporary(t), directory = path.join(root, 'runtime');
  let armed = false, linkCalls = 0, injected = 0;
  const io = new Proxy(fs, {get(target, key) {
    if (key === 'link') return async (...args) => {
      linkCalls++;
      if (armed) {
        armed = false;
        injected++;
        throw Object.assign(new Error('independent D4B EACCES injection'), {code: 'EACCES'});
      }
      return target.link(...args);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  let owner;
  t.after(async () => { if (owner) await owner.close(); });
  owner = await createRuntimeOwner({directory, profile: 'scene-survival-village', seed: 42, writable: true}, io);
  assert.ok(linkCalls > 0, 'initial format-9 state uses the real atomic link publisher');

  const dto = giftDto('d4b-h4-eacces-gift', 0);
  const beforeProjections = projections(owner);
  const beforeFiles = await directoryBytes(directory);
  const beforeCommit = await loadServiceCommit(path.join(directory, 'service-commit-r0.json'), io);
  const beforeBundle = structuredClone(beforeCommit.bundle);
  const beforeRng = canonicalJson(beforeBundle.snapshot.rng);
  const beforeEvents = canonicalJson(beforeBundle.eventLog);

  armed = true;
  await assert.rejects(owner.submit(dto), error => error.code === 'SAVE_FAILED' && error.cause?.code === 'EACCES');
  assert.equal(injected, 1, 'the candidate reached the real formal disk publication point');
  assert.deepEqual(projections(owner), beforeProjections, 'the public, player, mind, encounter and scene caches stay old');
  assert.deepEqual(await directoryBytes(directory), beforeFiles, 'no official or temporary runtime file survives the failed publish');
  const afterFailureCommit = await loadServiceCommit(path.join(directory, 'service-commit-r0.json'), io);
  assert.deepEqual(afterFailureCommit.bundle, beforeBundle, 'the entire committed bundle remains byte-equivalent in meaning');
  assert.equal(canonicalJson(afterFailureCommit.bundle.snapshot.rng), beforeRng);
  assert.equal(canonicalJson(afterFailureCommit.bundle.eventLog), beforeEvents);

  const receipt = await owner.submit(dto);
  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.toRevision, 1);
  const filesAfterRetry = await directoryBytes(directory);
  assert.deepEqual(Object.keys(filesAfterRetry).filter(name => /^service-commit-r\d+\.json$/.test(name)).sort(),
    ['service-commit-r0.json', 'service-commit-r1.json']);
  const committed = await loadServiceCommit(path.join(directory, 'service-commit-r1.json'), io);
  assert.equal(committed.serviceFormatVersion, 9);
  assert.equal(committed.commands.length, 1);
  assert.deepEqual(committed.commands[0], {dto, receipt});
  assert.equal(committed.bundle.eventLog.filter(event => event.type === 'FoodGiftCommitted').length, 1);
  assert.equal(committed.bundle.snapshot.world.playerModel.inventory.food, 19);
  assert.equal(committed.bundle.snapshot.world.societyModel.agents.find(entry => entry.state.actorId === 'actor-2').state.inventory.food, 1);
  const afterProjections = projections(owner);
  assert.deepEqual(Object.values(afterProjections).map(value => value.revision), [1, 1, 1, 1, 1]);

  await owner.close(); owner = null;
  const reopened = await createRuntimeOwner({directory, writable: true}, io);
  t.after(() => reopened.close());
  assert.deepEqual(projections(reopened), afterProjections);
  assert.deepEqual(await directoryBytes(directory), filesAfterRetry, 'reopening does not rewrite the format-9 history');
  assert.deepEqual(await reopened.submit(dto), receipt, 'retry after close/reopen returns the original full receipt');
  assert.deepEqual(await directoryBytes(directory), filesAfterRetry, 'the reopened exact retry publishes no duplicate gift');
});

test('H4: canonical retry wins while the writer queue is full; stale and conflicting IDs stay explicit', async t => {
  const root = await temporary(t), directory = path.join(root, 'runtime');
  let holdNextLink = false, reachedLinkResolve, releaseLink;
  const reachedLink = new Promise(resolve => { reachedLinkResolve = resolve; });
  const linkReleased = new Promise(resolve => { releaseLink = resolve; });
  const io = new Proxy(fs, {get(target, key) {
    if (key === 'link') return async (...args) => {
      if (holdNextLink) {
        holdNextLink = false;
        reachedLinkResolve();
        await linkReleased;
      }
      return target.link(...args);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  let owner;
  t.after(async () => { releaseLink(); if (owner) await owner.close(); });
  owner = await createRuntimeOwner({directory, profile: 'scene-survival-village', seed: 42, writable: true}, io);

  const originalDto = giftDto('d4b-h4-priority-gift', 0);
  const originalReceipt = await owner.submit(originalDto);
  assert.deepEqual(await owner.submit(originalDto), originalReceipt);
  await assert.rejects(owner.submit({...originalDto, expectedRevision: 1}), error => error.code === 'COMMAND_ID_CONFLICT');
  await assert.rejects(owner.submit(giftDto('d4b-h4-stale', 0)), error => error.code === 'REVISION_CONFLICT'
    && error.currentRevision === 1);

  holdNextLink = true;
  const advancing = owner.submit(advanceDto('d4b-h4-queue-head', 1));
  await reachedLink;
  const queued = [];
  for (let index = 0; index < MAX_PENDING_REQUESTS - 1; index++) {
    queued.push(owner.submit(giftDto(`d4b-h4-queued-${index}`, 1)));
  }
  assert.deepEqual(await owner.submit(originalDto), originalReceipt,
    'an already committed canonical DTO is returned before the pending queue budget check');
  await assert.rejects(owner.submit(giftDto('d4b-h4-over-queue-budget', 1)),
    error => error.code === 'LIMIT_EXCEEDED');

  releaseLink();
  const advanceReceipt = await advancing;
  assert.equal(advanceReceipt.toRevision, 2);
  const queuedResults = await Promise.allSettled(queued);
  assert.equal(queuedResults.length, MAX_PENDING_REQUESTS - 1);
  assert.ok(queuedResults.every(result => result.status === 'rejected' && result.reason.code === 'REVISION_CONFLICT'));
  assert.equal(owner.getSnapshot().tick, 1);
  assert.equal(owner.getScene().revision, 2);

  await owner.close(); owner = null;
  const reopened = await createRuntimeOwner({directory, writable: true}, io);
  t.after(() => reopened.close());
  assert.deepEqual(await reopened.submit(originalDto), originalReceipt,
    'after a later commit and reopen the original canonical DTO still returns its original receipt');
  await assert.rejects(reopened.submit({...originalDto, expectedRevision: 2}),
    error => error.code === 'COMMAND_ID_CONFLICT');
  assert.equal(reopened.getScene().revision, 2);
  assert.equal(reopened.getSnapshot().tick, 1);
});

test('H4: journal and directory count preflight enforces the format-specific limits', async t => {
  assert.equal(MAX_SERVICE_COMMANDS, 128);
  assert.equal(MAX_SERVICE_FILES, 128);
  const {bundle: validSceneBundle} = createSceneVillage(42, 'd4b-h4-budget-probe');
  assert.throws(() => validateServiceCommit({serviceFormatVersion: 9, anchor: validSceneBundle,
    commands: Array.from({length: MAX_SERVICE_COMMANDS + 1}, () => null), bundle: validSceneBundle}),
  error => error.code === 'LIMIT_EXCEEDED', 'journal length is rejected before attempting to replay any entry');
  assert.throws(() => validateServiceCommit({serviceFormatVersion: 9, anchor: validSceneBundle,
    commands: Array.from({length: MAX_SERVICE_COMMANDS}, () => null), bundle: validSceneBundle}),
  error => error.code === 'INVALID_INPUT', '128 entries pass the array budget and validation reaches the first entry');

  const root = await temporary(t), sceneFilesDirectory = path.join(root, 'scene-files'),
    oldDirectory = path.join(root, 'old-files');
  await fs.mkdir(sceneFilesDirectory);
  await fs.mkdir(oldDirectory);

  // Use an intentionally incomplete latest envelope to isolate the directory-count preflight:
  // 129 format-9 files pass the count gate and reach envelope validation, while 130 do not.
  for (let revision = 0; revision <= MAX_SERVICE_FILES; revision++) {
    await fs.writeFile(path.join(sceneFilesDirectory, `service-commit-r${revision}.json`),
      revision === MAX_SERVICE_FILES ? '{"serviceFormatVersion":9}' : '');
  }
  assert.equal((await fs.readdir(sceneFilesDirectory)).filter(name => /^service-commit-r\d+\.json$/.test(name)).length,
    MAX_SERVICE_FILES + 1);
  await assert.rejects(createRuntimeOwner({directory: sceneFilesDirectory, writable: true}),
    error => error.code === 'INVALID_SERVICE_COMMIT', '129 format-9 files pass the count preflight');
  await fs.writeFile(path.join(sceneFilesDirectory, `service-commit-r${MAX_SERVICE_FILES + 1}.json`), '');
  await assert.rejects(createRuntimeOwner({directory: sceneFilesDirectory, writable: true}),
    error => error.code === 'LIMIT_EXCEEDED', 'format 9 rejects a directory that already contains 130 files');

  // Format 1 passes the count check at 128 and rejects a 129th file.
  for (let revision = 0; revision < MAX_SERVICE_FILES; revision++) {
    await fs.writeFile(path.join(oldDirectory, `service-commit-r${revision}.json`),
      revision === MAX_SERVICE_FILES - 1 ? '{"serviceFormatVersion":1}' : '');
  }
  assert.equal((await fs.readdir(oldDirectory)).filter(name => /^service-commit-r\d+\.json$/.test(name)).length, MAX_SERVICE_FILES);
  await assert.rejects(createRuntimeOwner({directory: oldDirectory, writable: true}),
    error => error.code === 'INVALID_SERVICE_COMMIT', '128 format-1 files pass the count preflight');

  await fs.writeFile(path.join(oldDirectory, `service-commit-r${MAX_SERVICE_FILES}.json`), '{"serviceFormatVersion":1}');
  await assert.rejects(createRuntimeOwner({directory: oldDirectory, writable: true}),
    error => error.code === 'LIMIT_EXCEEDED', 'legacy format 1 is rejected at 129 directory files');
});

test('H5: a legal scene checkpoint roundtrips exactly and replay rejects independent and balanced forgeries', async t => {
  const root = await temporary(t), source = path.join(root, 'source'), mirror = path.join(root, 'mirror');
  const {bundle: initial, systems} = createSceneVillage(42, 'd4b-h5-checkpoint');
  const dto = giftDto('d4b-h5-valid-gift', 0);
  const {bundle} = executeSceneIntent(initial, dto);
  const checkpointPath = await saveCheckpoint(bundle, {directory: source, rulesVersion: SCENE_RULES, systems});
  const originalBytes = await fs.readFile(checkpointPath);
  const envelope = JSON.parse(originalBytes.toString('utf8'));
  assert.equal(envelope.formatVersion, 1);
  const restored = await loadCheckpoint(checkpointPath, {rulesVersion: SCENE_RULES, systems});
  assert.deepEqual(restored, bundle, 'snapshot, RNG, scheduler, all business state and the complete event log replay exactly');
  assert.equal(canonicalJson(restored.eventLog), canonicalJson(bundle.eventLog));
  const mirrorPath = await saveCheckpoint(restored, {directory: mirror, rulesVersion: SCENE_RULES, systems});
  assert.deepEqual(await fs.readFile(mirrorPath), originalBytes, 'a valid format-1 checkpoint republishes byte-for-byte');

  const recipientMemory = state => state.snapshot.world.memoryModel.observer.actors
    .find(entry => entry.actorId === 'actor-2').memories.find(memory => memory.observable.type === 'food-gift');
  const donorMemory = state => state.snapshot.world.memoryModel.observer.actors
    .find(entry => entry.actorId === 'actor-4').memories.find(memory => memory.observable.type === 'food-gift');
  const tamper = (name, mutate) => [name, candidate => mutate(candidate)];
  const cases = [
    tamper('input-payload', value => { value.snapshot.world.encounterModel.inputHistory[0].dto.payload.recipientId = 'actor-1'; }),
    tamper('receipt-result', value => { value.snapshot.world.encounterModel.inputHistory[0].receipt.result.quantity = 2; }),
    tamper('fact-source', value => { value.eventLog[0].sourceSystem = 'player'; }),
    tamper('fact-quantity', value => { value.eventLog[0].payload.quantity = 2; }),
    tamper('fact-identities', value => { value.eventLog[0].entityIds[1] = 'actor-3'; }),
    tamper('private-accounting', value => { value.snapshot.world.playerModel.ledger.foodGiven = 2; }),
    tamper('recipient-memory', value => { recipientMemory(value).observable.quantity = 2; }),
    tamper('causation', value => { value.eventLog[1].causationEventSeqs = []; }),
    tamper('rng-state', value => { value.snapshot.rng.state++; }),
    tamper('scheduler', value => { value.snapshot.scheduledTasks.find(task => task.taskId === 'daily-memory').nextDueTick++; }),
    tamper('rules-version', value => { value.snapshot.rulesVersion = 'd-scene-survival-v99'; }),
    tamper('configuration', value => { value.snapshot.world.societyModel.config.economics.huntDamage++; }),
    tamper('balanced-receipt-fact-ledger-memory-forgery', value => {
      // Every local ledger and projection agrees that two items moved, but the fixed DTO can only transfer one.
      const world = value.snapshot.world;
      world.playerModel.inventory.food--;
      world.playerModel.ledger.foodGiven++;
      const recipient = world.societyModel.agents.find(entry => entry.state.actorId === 'actor-2');
      recipient.state.inventory.food++;
      recipient.trade.foodReceived++;
      const fact = value.eventLog[0];
      fact.payload.quantity++;
      fact.payload.donorFoodAfter--;
      fact.payload.recipientFoodAfter++;
      const receipt = value.snapshot.world.encounterModel.inputHistory[0].receipt;
      receipt.result.quantity++;
      value.eventLog[1].payload.receipt.result.quantity++;
      recipientMemory(value).observable.quantity++;
      donorMemory(value).observable.quantity++;
    }),
  ];

  for (const [name, mutate] of cases) {
    const forged = structuredClone(envelope);
    mutate(forged);
    assert.notEqual(canonicalJson(forged), canonicalJson(envelope), `${name} must differ from the original checkpoint`);
    const forgedFile = path.join(root, `${name}.json`);
    await fs.writeFile(forgedFile, JSON.stringify(forged), 'utf8');
    await assert.rejects(loadCheckpoint(forgedFile, {rulesVersion: SCENE_RULES, systems}), error =>
      ['INVALID_CHECKPOINT', 'UNSUPPORTED_VERSION'].includes(error.code),
    `${name} must fail as a domain checkpoint/version error, not parsing or path noise`);
  }
});

test('H5: old format-8 checkpoint bytes remain stable and checkpoints reject scene/encounter cross-loads', async t => {
  const root = await temporary(t);
  const oldBundle = createEncounterVillage(42, 'd4b-h5-old-profile').bundle;
  const sceneBundle = createSceneVillage(42, 'd4b-h5-new-profile').bundle;
  const oldOptions = {rulesVersion: ENCOUNTER_RULES, systems: encounterSystems()};
  const sceneOptions = {rulesVersion: SCENE_RULES, systems: sceneSystems()};
  const oldFile = await saveCheckpoint(oldBundle, {directory: path.join(root, 'old'), ...oldOptions});
  const sceneFile = await saveCheckpoint(sceneBundle, {directory: path.join(root, 'scene'), ...sceneOptions});
  const oldBytes = await fs.readFile(oldFile);
  const oldRestored = await loadCheckpoint(oldFile, oldOptions);
  assert.deepEqual(oldRestored, oldBundle);
  const oldMirror = await saveCheckpoint(oldRestored, {directory: path.join(root, 'old-mirror'), ...oldOptions});
  assert.deepEqual(await fs.readFile(oldMirror), oldBytes, 'format-8 profile export is unchanged by the scene registration');
  await assert.rejects(loadCheckpoint(oldFile, sceneOptions), error => error.code === 'UNSUPPORTED_VERSION');
  await assert.rejects(loadCheckpoint(sceneFile, oldOptions), error => error.code === 'UNSUPPORTED_VERSION');
});

test('H7: active-encounter gift is durably refused without changing the world, including after restart', {timeout: 120_000}, async t => {
  const root = await temporary(t), directory = path.join(root, 'runtime');
  let server = await startRuntimeServer({directory, profile: 'scene-survival-village', seed: 42,
    port: 0, writable: true, inspectMind: true});
  t.after(async () => { if (server) await server.close(); });
  const post = async dto => {
    try {
      const response = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
        headers: {'content-type': 'application/json', Connection: 'close'}, body: JSON.stringify(dto)});
      const result = {status: response.status, body: await response.json()};
      t.diagnostic(`${dto.type} r${dto.expectedRevision}: HTTP ${result.status}`);
      return result;
    } catch (error) {
      t.diagnostic(`${dto.type} r${dto.expectedRevision}: ${error.cause?.code} ${error.cause?.message}`);
      throw error;
    }
  };
  const readViews = async () => Object.fromEntries(await Promise.all([
    ['snapshot', '/api/runtime/snapshot'], ['player', '/api/runtime/player'], ['mind', '/api/runtime/minds'],
    ['encounter', '/api/runtime/encounter'], ['scene', '/api/runtime/scene'],
  ].map(async ([name, route]) => {
    const response = await fetch(`${server.url}${route}`);
    assert.equal(response.status, 200, `${route} remains readable`);
    return [name, await response.json()];
  })));

  const gift = giftDto('d4b-h7-initial-gift', 0);
  const gifted = await post(gift);
  assert.equal(gifted.status, 200);
  assert.equal(gifted.body.outcome, 'succeeded');
  const travel = await post({version: 3, commandId: 'd4b-h7-travel-forest', expectedRevision: 1,
    type: 'PlayerTravel', payload: {destination: 'forest'}});
  assert.equal(travel.status, 200);
  assert.equal(travel.body.toRevision, 13);
  assert.equal(travel.body.tick, 12);
  const begun = await post({version: 3, commandId: 'd4b-h7-encounter-begin', expectedRevision: 13,
    type: 'EncounterBegin', payload: {}});
  assert.equal(begun.status, 200);
  assert.equal(begun.body.toRevision, 14);
  assert.equal(begun.body.tick, 12);

  const before = await loadServiceCommit(path.join(directory, 'service-commit-r14.json'));
  const beforeWorld = before.bundle.snapshot.world;
  assert.equal(beforeWorld.encounterModel.encounter.status, 'active');
  assert.equal(beforeWorld.ecologyModel.reservedWolves, 1);
  const recipientMemory = world => world.memoryModel.observer.actors.find(actor => actor.actorId === 'actor-2')
    .memories.filter(memory => memory.observable.type === 'food-gift');
  const originalRecipientGiftMemory = recipientMemory(beforeWorld);
  assert.equal(originalRecipientGiftMemory.length, 1);
  assert.equal(originalRecipientGiftMemory[0].observable.direction, 'received');
  const originalGiftFactCount = before.bundle.eventLog.filter(event => event.type === 'FoodGiftCommitted').length;
  assert.equal(originalGiftFactCount, 1);

  const busyDto = giftDto('d4b-h7-gift-during-active-encounter', 14);
  const refused = await post(busyDto);
  assert.equal(refused.status, 200, 'a rules refusal is a committed domain receipt');
  assert.equal(refused.body.status, 'committed');
  assert.equal(refused.body.outcome, 'rejected');
  assert.equal(refused.body.result.reasonCode, 'ENCOUNTER_BUSY');
  assert.equal(refused.body.result.sourceEventSeq, null);
  assert.equal(refused.body.fromRevision, 14);
  assert.equal(refused.body.toRevision, 15);
  assert.equal(refused.body.fromTick, 12);
  assert.equal(refused.body.tick, 12);

  const after = await loadServiceCommit(path.join(directory, 'service-commit-r15.json'));
  const afterWorld = after.bundle.snapshot.world;
  assert.equal(after.bundle.snapshot.revision, 15);
  assert.equal(after.bundle.snapshot.tick, 12);
  assert.deepEqual(afterWorld.encounterModel.encounter, beforeWorld.encounterModel.encounter,
    'the active encounter itself is not interrupted by the refused gift');
  assert.deepEqual(afterWorld.ecologyModel.populations, beforeWorld.ecologyModel.populations);
  assert.equal(afterWorld.ecologyModel.reservedWolves, beforeWorld.ecologyModel.reservedWolves);
  assert.deepEqual(afterWorld.playerModel, beforeWorld.playerModel, 'player assets and gift ledger stay unchanged');
  assert.deepEqual(afterWorld.societyModel, beforeWorld.societyModel, 'recipient inventory and accounting stay unchanged');
  assert.deepEqual(recipientMemory(afterWorld), originalRecipientGiftMemory,
    'the original actor-2 received-gift memory remains intact');
  assert.equal(after.bundle.eventLog.filter(event => event.type === 'FoodGiftCommitted').length, originalGiftFactCount,
    'the rejected command emits no additional FoodGiftCommitted fact');
  assert.deepEqual(after.commands.at(-1), {dto: busyDto, receipt: refused.body});

  const viewsBeforeRestart = await readViews();
  assert.deepEqual(Object.values(viewsBeforeRestart).map(view => view.revision), [15, 15, 15, 15, 15]);
  assert.deepEqual(Object.values(viewsBeforeRestart).map(view => view.tick), [12, 12, 12, 12, 12]);
  const bytesBeforeRestart = await directoryBytes(directory);
  assert.deepEqual(await post(busyDto), {status: 200, body: refused.body}, 'same canonical DTO returns its original receipt');
  assert.deepEqual(await directoryBytes(directory), bytesBeforeRestart, 'same-process retry publishes no extra commit');

  const oldUrl = server.url;
  await server.close();
  server = null;
  await assert.rejects(fs.access(path.join(directory, '.runtime-owner.lock')),
    error => error.code === 'ENOENT', 'graceful close releases the runtime ownership lock');
  await assert.rejects(fetch(`${oldUrl}/healthz`, {signal: AbortSignal.timeout(1000)}),
    'the old ephemeral HTTP endpoint is no longer serving');
  server = await startRuntimeServer({directory, port: 0, writable: true, inspectMind: true});
  const reopened = await loadServiceCommit(path.join(directory, 'service-commit-r15.json'));
  assert.deepEqual(reopened.bundle, after.bundle, 'graceful close/reopen restores the complete committed bundle');
  assert.deepEqual(await readViews(), viewsBeforeRestart, 'all five read projections survive a real runtime restart');
  assert.deepEqual(await post(busyDto), {status: 200, body: refused.body}, 'reopened runtime returns the original refusal receipt');
  assert.deepEqual(await directoryBytes(directory), bytesBeforeRestart, 'retry after restart does not double-gift or rewrite history');
});
