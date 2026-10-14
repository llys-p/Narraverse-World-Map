import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {request} from 'node:http';

test('CP2a-S1 runtime owner opens the scene profile and exposes its read projection', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-owner-'));
  let owner;
  try {
    owner = await createRuntimeOwner({
      directory: path.join(root, 'runtime'),
      profile: 'scene-survival-village',
      seed: 42,
      writable: true,
    });
    assert.equal(owner.sceneAvailable, true);
    assert.equal(typeof owner.getScene, 'function');
    const scene = owner.getScene();
    assert.equal(scene.simulationId, 'scene-survival-village');
    assert.equal(scene.revision, 0);
    assert.equal(scene.tick, 0);
  } finally {
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S2 live scene HTTP reads and one Gift command publish the same revision across five projections', async () => {
  const {startRuntimeServer} = await import('../../runtime-server.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-http-'));
  let server;
  try {
    server = await startRuntimeServer({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
      seed: 42, port: 0, writable: true, inspectMind: true});
    const read = async (route) => {
      const response = await fetch(`${server.url}${route}`);
      assert.equal(response.status, 200, `${route} is available`);
      return response.json();
    };
    const before = await Promise.all(['/api/runtime/snapshot', '/api/runtime/player', '/api/runtime/minds',
      '/api/runtime/encounter', '/api/runtime/scene'].map(read));
    const dto = {version: 3, commandId: 'cp2a-http-gift', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}};
    const response = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(dto)});
    assert.equal(response.status, 200);
    const receipt = await response.json();
    assert.equal(receipt.status, 'committed');
    assert.equal(receipt.commandId, dto.commandId);
    const duplicate = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(dto)});
    assert.equal(duplicate.status, 200);
    assert.deepEqual(await duplicate.json(), receipt, 'same command ID and bytes are idempotent');
    const conflict = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({...dto, expectedRevision: 1})});
    assert.equal(conflict.status, 409, 'same command ID with different bytes conflicts');
    const stale = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({...dto, commandId: 'cp2a-http-stale'})});
    assert.equal(stale.status, 409, 'a new ID at an old revision is rejected');
    assert.equal((await stale.json()).currentRevision, 1);
    const after = await Promise.all(['/api/runtime/snapshot', '/api/runtime/player', '/api/runtime/minds',
      '/api/runtime/encounter', '/api/runtime/scene'].map(read));
    for (const projection of after) {
      assert.equal(projection.revision, 1);
      assert.equal(projection.tick, 0);
    }
    assert.equal(before.every((projection) => projection.revision === 0 && projection.tick === 0), true);
    assert.equal(after[0].market.food, before[0].market.food, 'a private gift does not change public stock');
    assert.equal(after[1].self.inventory.food, 19);
    assert.equal(after[4].self.food, 19);
    const recipient = after[4].actors.find((actor) => actor.actorId === 'actor-2');
    assert.equal(recipient.gift.available, true);
    assert.equal(recipient.receivedGifts.length, 1);
    assert.equal(recipient.receivedGifts[0].observable.commandId, dto.commandId);
  } finally {
    if (server) await server.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S3 scene HTTP exposes format-9 reads, method gates, and no scene surface on the old encounter profile', async () => {
  const {startRuntimeServer} = await import('../../runtime-server.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-methods-'));
  let sceneServer;
  let oldServer;
  try {
    sceneServer = await startRuntimeServer({directory: path.join(root, 'scene'), profile: 'scene-survival-village',
      seed: 42, port: 0, writable: false});
    const caps = await (await fetch(`${sceneServer.url}/api/runtime/capabilities`)).json();
    assert.equal(caps.sceneAvailable, true);
    const scene = await fetch(`${sceneServer.url}/api/runtime/scene`);
    assert.equal(scene.status, 200);
    const head = await fetch(`${sceneServer.url}/api/runtime/scene`, {method: 'HEAD'});
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-length'), scene.headers.get('content-length'));
    assert.equal(head.headers.get('cache-control'), 'no-store');
    const denied = await fetch(`${sceneServer.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: '{}'});
    assert.equal(denied.status, 405);
    assert.equal((await denied.json()).error.code, 'WRITE_DISABLED');

    oldServer = await startRuntimeServer({directory: path.join(root, 'old'), profile: 'encounter-survival-village',
      seed: 42, port: 0, writable: false});
    const oldCaps = await (await fetch(`${oldServer.url}/api/runtime/capabilities`)).json();
    assert.equal(Object.hasOwn(oldCaps, 'sceneAvailable'), false);
    assert.equal((await fetch(`${oldServer.url}/api/runtime/scene`)).status, 404);
  } finally {
    if (oldServer) await oldServer.close();
    if (sceneServer) await sceneServer.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S4 scene service DTO validation is exact, bounded, and descriptor-first', async () => {
  const contract = await import('../../runtime/service/http-contract.mjs');
  const valid = {version: 3, commandId: 'cp2a-dto-gift', expectedRevision: 0,
    type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}};
  assert.deepEqual(contract.validateSceneCommandDto(valid), valid);
  assert.deepEqual(contract.parseSceneCommandBytes(Buffer.from(JSON.stringify(valid))), valid);
  for (const candidate of [
    {...valid, payload: {recipientId: 'actor-99'}},
    {...valid, payload: {recipientId: 'actor-2', quantity: 2}},
    {...valid, type: 'PlayerGiftHerbs'},
    {...valid, extra: true},
  ]) assert.throws(() => contract.validateSceneCommandDto(candidate),
    (error) => ['INVALID_INPUT', 'UNSUPPORTED_VERSION', 'LIMIT_EXCEEDED'].includes(error.code));
  let reads = 0;
  const accessor = {...valid};
  Object.defineProperty(accessor, 'payload', {enumerable: true, get() { reads++; return valid.payload; }});
  assert.throws(() => contract.validateSceneCommandDto(accessor),
    (error) => ['INVALID_INPUT', 'UNSUPPORTED_VERSION'].includes(error.code));
  assert.equal(reads, 0);
  assert.throws(() => contract.parseCommandBytes(Buffer.from(JSON.stringify(valid)), 1),
    (error) => error.code === 'INVALID_INPUT', 'legacy parsing rejects Gift as an unknown legacy action');
});

test('CP2a-S5 a failed durable publish leaves the scene owner intact and the same DTO can retry once', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  let failLink = false;
  const io = new Proxy(fs, {get(target, key) {
    if (key === 'link') return async (...args) => {
      if (failLink) throw Object.assign(new Error('injected link denial'), {code: 'EACCES'});
      return target.link(...args);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-publish-'));
  const directory = path.join(root, 'runtime');
  let owner;
  let reopened;
  try {
    owner = await createRuntimeOwner({directory, profile: 'scene-survival-village', seed: 42, writable: true}, io);
    const dto = {version: 3, commandId: 'cp2a-publish-gift', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}};
    const projectionsBefore = {snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
      encounter: owner.getEncounter(), scene: owner.getScene()};
    const namesBefore = await fs.readdir(directory);
    const bytesBefore = new Map(await Promise.all(namesBefore.map(async (name) =>
      [name, await fs.readFile(path.join(directory, name))])));
    failLink = true;
    await assert.rejects(owner.submit(dto), (error) => error.code === 'SAVE_FAILED');
    assert.deepEqual({snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
      encounter: owner.getEncounter(), scene: owner.getScene()}, projectionsBefore);
    const namesAfterFailure = await fs.readdir(directory);
    assert.deepEqual(namesAfterFailure.sort(), namesBefore.sort());
    for (const name of namesBefore) assert.deepEqual(await fs.readFile(path.join(directory, name)), bytesBefore.get(name));
    failLink = false;
    const receipt = await owner.submit(dto);
    assert.equal(receipt.status, 'committed');
    const committedProjections = {snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
      encounter: owner.getEncounter(), scene: owner.getScene()};
    assert.equal(committedProjections.scene.revision, 1);
    await owner.close(); owner = null;
    reopened = await createRuntimeOwner({directory, writable: true}, io);
    assert.deepEqual({snapshot: reopened.getSnapshot(), player: reopened.getPlayer(), mind: reopened.getMindInspector(),
      encounter: reopened.getEncounter(), scene: reopened.getScene()}, committedProjections);
    assert.equal(reopened.getScene().revision, 1);
    assert.equal(reopened.getSnapshot().revision, 1);
  } finally {
    if (reopened) await reopened.close();
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S6 readers see the old five projections until the complete format-9 commit publishes', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  let holdLink = false;
  let reachedLink;
  let allowLink;
  const reached = new Promise((resolve) => { reachedLink = resolve; });
  const allowed = new Promise((resolve) => { allowLink = resolve; });
  const io = new Proxy(fs, {get(target, key) {
    if (key === 'link') return async (...args) => {
      if (holdLink) { reachedLink(); await allowed; }
      return target.link(...args);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-publish-read-'));
  let owner;
  try {
    owner = await createRuntimeOwner({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
      seed: 42, writable: true}, io);
    const read = () => ({snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
      encounter: owner.getEncounter(), scene: owner.getScene()});
    const before = read();
    holdLink = true;
    const committing = owner.submit({version: 3, commandId: 'cp2a-pending-gift', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}});
    await reached;
    assert.deepEqual(read(), before, 'the in-memory projections stay on the previous commit while publication is pending');
    holdLink = false;
    allowLink();
    const receipt = await committing;
    assert.equal(receipt.status, 'committed');
    const after = read();
    for (const projection of Object.values(after)) assert.equal(projection.revision, 1);
  } finally {
    allowLink();
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S7 format-9 service commits are re-audited from the real journal on reopen', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-audit-'));
  const directory = path.join(root, 'runtime');
  let owner;
  try {
    owner = await createRuntimeOwner({directory, profile: 'scene-survival-village', seed: 42, writable: true});
    const receipt = await owner.submit({version: 3, commandId: 'cp2a-audited-gift', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}});
    assert.equal(receipt.status, 'committed');
    await owner.close(); owner = null;
    const filename = path.join(directory, 'service-commit-r1.json');
    const envelope = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.equal(envelope.serviceFormatVersion, 9);
    assert.equal(envelope.commands.length, 1);
    envelope.commands[0].receipt.toRevision += 1;
    await fs.writeFile(filename, JSON.stringify(envelope));
    await assert.rejects(createRuntimeOwner({directory, writable: true}),
      (error) => error.code === 'INVALID_SERVICE_COMMIT');
  } finally {
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S8 scene read projections are detached and do not perform disk writes', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  let writes = 0;
  const writeMethods = new Set(['writeFile', 'appendFile', 'link', 'rename', 'unlink', 'rm', 'mkdir']);
  const io = new Proxy(fs, {get(target, key) {
    const value = Reflect.get(target, key, target);
    if (writeMethods.has(key)) return (...args) => { writes++; return value.apply(target, args); };
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-readonly-'));
  let owner;
  try {
    owner = await createRuntimeOwner({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
      seed: 42, writable: false}, io);
    const writeCountAfterOpen = writes;
    const first = {snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
      encounter: owner.getEncounter(), scene: owner.getScene()};
    first.scene.actors[0].name = 'mutated copy';
    first.player.self.inventory.food = -999;
    const second = {snapshot: owner.getSnapshot(), player: owner.getPlayer(), mind: owner.getMindInspector(),
      encounter: owner.getEncounter(), scene: owner.getScene()};
    assert.equal(second.scene.actors[0].name, '村长');
    assert.equal(second.player.self.inventory.food, 20);
    assert.equal(second.snapshot.revision, 0);
    assert.equal(writes, writeCountAfterOpen, 'reading projections does not touch persistent storage');
    await assert.rejects(owner.submit({version: 3, commandId: 'cp2a-readonly-write', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}}), (error) => error.code === 'WRITE_DISABLED');
    assert.equal(writes, writeCountAfterOpen);
  } finally {
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S9 explicit scene checkpoint initializes format 9 and profile/checkpoint options stay exclusive', async () => {
  const fixture = await import('../../runtime/fixtures/scene-survival-village.mjs');
  const runtime = await import('../../runtime/core/scene-runtime.mjs');
  const {saveCheckpoint} = await import('../../runtime/persistence/checkpoint-store.mjs');
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-checkpoint-'));
  const sourceDir = path.join(root, 'source');
  const directory = path.join(root, 'runtime');
  let owner;
  let reopened;
  try {
    const {bundle, systems} = fixture.createSceneVillage(42, 'cp2a-explicit-scene-checkpoint',
      fixture.defaultSceneVillageConfig('no-opportunity'));
    const checkpoint = await saveCheckpoint(bundle, {directory: sourceDir, rulesVersion: runtime.SCENE_RULES, systems});
    await assert.rejects(createRuntimeOwner({directory: path.join(root, 'mutually-exclusive'), profile: 'scene-survival-village',
      checkpoint, writable: true}), (error) => error.code === 'INVALID_INPUT');
    owner = await createRuntimeOwner({directory, checkpoint, writable: true});
    assert.equal(owner.sceneAvailable, true);
    const restoredScene = owner.getScene();
    assert.deepEqual(Object.keys(restoredScene).sort(),
      ['apiVersion', 'sceneViewVersion', 'simulationId', 'revision', 'tick', 'location', 'self', 'actors'].sort());
    assert.equal(restoredScene.simulationId, bundle.snapshot.simulationId);
    assert.equal(restoredScene.revision, 0);
    assert.deepEqual(restoredScene.self, {actorId: 'actor-4', alive: true, food: 20});
    await owner.submit({version: 3, commandId: 'cp2a-checkpoint-gift', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}});
    const savedScene = owner.getScene();
    await owner.close(); owner = null;
    reopened = await createRuntimeOwner({directory, writable: true});
    assert.deepEqual(reopened.getScene(), savedScene, 'reopening an existing format-9 owner does not reset its state');
    assert.equal(reopened.getScene().revision, 1);
  } finally {
    if (reopened) await reopened.close();
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S10 malformed or unknown scene commands are rejected before they consume revision or command ID', async () => {
  const {startRuntimeServer} = await import('../../runtime-server.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-rejections-'));
  let server;
  try {
    server = await startRuntimeServer({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
      seed: 42, port: 0, writable: true});
    const send = (body) => fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const invalid = await send({version: 3, commandId: 'cp2a-reuse-id', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-99'}});
    assert.equal(invalid.status, 400);
    const invalidBody = await invalid.json();
    assert.equal(invalidBody.error.code, 'INVALID_INPUT');
    const afterInvalid = await (await fetch(`${server.url}/api/runtime/snapshot`)).json();
    assert.equal(afterInvalid.revision, 0);
    const accepted = await send({version: 3, commandId: 'cp2a-reuse-id', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}});
    assert.equal(accepted.status, 200, 'validation failures do not reserve a command ID');
    const validReceipt = await accepted.json();
    assert.equal(validReceipt.commandId, 'cp2a-reuse-id');
    assert.equal((await (await fetch(`${server.url}/api/runtime/scene`)).json()).revision, 1);
    const extraField = await send({version: 3, commandId: 'cp2a-extra-field', expectedRevision: 1,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2', quantity: 1}});
    assert.equal(extraField.status, 400);
    assert.equal((await (await fetch(`${server.url}/api/runtime/snapshot`)).json()).revision, 1);
  } finally {
    if (server) await server.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S11 all scene read routes reject query writes and keep method ordering explicit', async () => {
  const {startRuntimeServer} = await import('../../runtime-server.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-route-order-'));
  let server;
  try {
    server = await startRuntimeServer({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
      seed: 42, port: 0, writable: true});
    const query = await fetch(`${server.url}/api/runtime/scene?private=true`);
    assert.equal(query.status, 400);
    assert.equal((await query.json()).error.code, 'INVALID_INPUT');
    const writeToRead = await fetch(`${server.url}/api/runtime/scene`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: '{}'});
    assert.equal(writeToRead.status, 405);
    assert.equal((await writeToRead.json()).error.code, 'WRITE_DISABLED');
    const capsHead = await fetch(`${server.url}/api/runtime/capabilities`, {method: 'HEAD'});
    const capsGet = await fetch(`${server.url}/api/runtime/capabilities`);
    assert.equal(capsHead.status, 200);
    assert.equal(capsHead.headers.get('content-length'), capsGet.headers.get('content-length'));
    assert.equal(capsHead.headers.get('cache-control'), 'no-store');
    assert.equal(await capsHead.text(), '');
  } finally {
    if (server) await server.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S12 persisted Gift memories are part of the audited replay and cannot be edited independently', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-memory-audit-'));
  const directory = path.join(root, 'runtime');
  let owner;
  try {
    owner = await createRuntimeOwner({directory, profile: 'scene-survival-village', seed: 42, writable: true});
    await owner.submit({version: 3, commandId: 'cp2a-memory-audit-gift', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}});
    await owner.close(); owner = null;
    const filename = path.join(directory, 'service-commit-r1.json');
    const envelope = JSON.parse(await fs.readFile(filename, 'utf8'));
    const memories = envelope.bundle.snapshot.world.memoryModel.observer.actors
      .find((entry) => entry.actorId === 'actor-2').memories;
    const received = memories.find((entry) => entry.observable?.type === 'food-gift' &&
      entry.observable.commandId === 'cp2a-memory-audit-gift');
    assert.ok(received, 'committed command has its recipient memory');
    received.observable.quantity = 2;
    await fs.writeFile(filename, JSON.stringify(envelope));
    await assert.rejects(createRuntimeOwner({directory, writable: true}),
      (error) => error.code === 'INVALID_SERVICE_COMMIT');
  } finally {
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S13 scene body-read cap rejects request 17 and releases slots after client aborts', async () => {
  const {startRuntimeServer} = await import('../../runtime-server.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-body-cap-'));
  let server;
  const partial = [];
  try {
    server = await startRuntimeServer({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
      seed: 42, port: 0, writable: true});
    const startPartial = () => {
      const req = request(`${server.url}/api/runtime/commands`, {method: 'POST', headers: {
        'content-type': 'application/json', 'content-length': '128'}});
      req.on('error', () => {});
      req.flushHeaders();
      req.write('{');
      partial.push(req);
      return req;
    };
    for (let index = 0; index < 16; index++) startPartial();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const overflow = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({version: 3, commandId: 'cp2a-over-body-cap',
        expectedRevision: 0, type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}})});
    assert.equal(overflow.status, 413);
    assert.equal((await overflow.json()).error.code, 'LIMIT_EXCEEDED');
    for (const req of partial) req.destroy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const valid = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({version: 3, commandId: 'cp2a-after-body-aborts',
        expectedRevision: 0, type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}})});
    assert.equal(valid.status, 200, 'aborted bodies release every reserved read slot');
    assert.equal((await valid.json()).status, 'committed');
  } finally {
    for (const req of partial) req.destroy();
    if (server) await server.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP2a-S14 a full scene commit queue still serves the original receipt before capacity rejection', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  let holdLink = false;
  let reachedLink;
  let allowLink;
  const reached = new Promise((resolve) => { reachedLink = resolve; });
  const allowed = new Promise((resolve) => { allowLink = resolve; });
  const io = new Proxy(fs, {get(target, key) {
    if (key === 'link') return async (...args) => {
      if (holdLink) { reachedLink(); await allowed; }
      return target.link(...args);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp2a-scene-queue-cap-'));
  let owner;
  const queued = [];
  try {
    owner = await createRuntimeOwner({directory: path.join(root, 'runtime'), profile: 'scene-survival-village',
      seed: 42, writable: true}, io);
    const originalDto = {version: 3, commandId: 'cp2a-queue-original', expectedRevision: 0,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}};
    const originalReceipt = await owner.submit(originalDto);
    holdLink = true;
    queued.push(owner.submit({version: 3, commandId: 'cp2a-queue-first', expectedRevision: 1,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}}));
    await reached;
    for (let index = 0; index < 15; index++) queued.push(owner.submit({version: 3,
      commandId: `cp2a-queue-stale-${index}`, expectedRevision: 1,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}}));
    await assert.rejects(owner.submit({version: 3, commandId: 'cp2a-queue-overflow', expectedRevision: 1,
      type: 'PlayerGiftFood', payload: {recipientId: 'actor-2'}}), (error) => error.code === 'LIMIT_EXCEEDED');
    assert.deepEqual(await owner.submit(originalDto), originalReceipt,
      'a committed exact DTO returns its original receipt without consuming another slot');
    await assert.rejects(owner.submit({...originalDto, expectedRevision: 1}),
      (error) => error.code === 'COMMAND_ID_CONFLICT');
  } finally {
    holdLink = false;
    allowLink();
  }
  const outcomes = await Promise.allSettled(queued);
  try {
    assert.equal(outcomes.length, 16);
    assert.equal(outcomes.filter((entry) => entry.status === 'fulfilled').length, 1,
      'the write at the head commits, while the remaining requests become stale');
    assert.equal(outcomes.filter((entry) => entry.status === 'rejected' && entry.reason.code === 'REVISION_CONFLICT').length, 15);
  } finally {
    if (owner) await owner.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('CP3-BUDGET format9 real HTTP accepts journal128 and files129 before atomic limit and earliest DTO replay', async (t) => {
  const {startRuntimeServer} = await import('../../runtime-server.mjs');
  const {createHash} = await import('node:crypto');
  const {createConnection} = await import('node:net');
  const evidenceBase = path.resolve('artifacts/world-runtime-d4-cp3-budget-controller');
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const started = performance.now();
  const resumeFile = process.env.CP3_BUDGET_RESUME_CHECKPOINT;
  const resume = resumeFile ? JSON.parse(await fs.readFile(resumeFile, 'utf8')) : null;
  const root = resume ? path.resolve(resume.root) : await fs.mkdtemp(path.join(os.tmpdir(), 'd4-cp3-budget-'));
  assert.equal(path.dirname(root).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(root).startsWith('d4-cp3-budget-'), 'resume targets only this member temporary directories');
  const directory = path.join(root, 'runtime');
  await fs.mkdir(evidenceBase, {recursive: true});
  const evidence = resume ? path.resolve(resume.evidence) : await fs.mkdtemp(path.join(evidenceBase, 'run-'));
  assert.equal(path.dirname(evidence), evidenceBase, 'resume evidence stays in this member artifact scope');
  const writeJson = (name, value) => fs.writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  const dtos = Array.from({length: 128}, (_, index) => ({version: 3,
    commandId: `cp3-budget-${String(index + 1).padStart(3, '0')}`,
    expectedRevision: index === 0 ? 0 : index + 11,
    type: index === 0 ? 'PlayerTravel' : 'PlayerGiftFood',
    payload: index === 0 ? {destination: 'forest'} : {recipientId: 'actor-2'}}));
  await writeJson('canonical-dtos.json', dtos);
  let server;
  let complete = false;
  const instances = [];
  const lifecycle = [];
  const receipts = [];
  const formalNames = async () => (await fs.readdir(directory))
    .filter((name) => /^service-commit-r(0|[1-9][0-9]*)\.json$/.test(name))
    .sort((a, b) => Number(a.match(/r(\d+)/)[1]) - Number(b.match(/r(\d+)/)[1]));
  const storedBytes = async () => new Map(await Promise.all((await formalNames())
    .map(async (name) => [name, await fs.readFile(path.join(directory, name))])));
  const hashes = (files) => Array.from(files, ([name, bytes]) => ({name, bytes: bytes.length, sha256: sha256(bytes)}));
  const expectedNames = (count) => ['service-commit-r0.json', ...Array.from({length: count}, (_, i) =>
    `service-commit-r${i + 12}.json`)];
  const portClosed = (url) => new Promise((resolve, reject) => {
    const socket = createConnection({host: '127.0.0.1', port: Number(new URL(url).port)});
    socket.once('connect', () => { socket.destroy(); reject(new Error(`Test port still open: ${url}`)); });
    socket.once('error', (error) => { socket.destroy(); error.code === 'ECONNREFUSED' ? resolve(true) : reject(error); });
  });
  const closeCurrent = async () => {
    if (!server) return;
    const current = server;
    server = null;
    await current.close();
    await assert.rejects(fs.stat(path.join(directory, '.runtime-owner.lock')), (error) => error.code === 'ENOENT');
    assert.equal(await portClosed(current.url), true);
    lifecycle.push({status: 'stopped', pid: process.pid, url: current.url, lockGone: true, portClosed: true,
      elapsedMs: Math.round(performance.now() - started)});
    await writeJson('lifecycle.json', lifecycle);
  };
  t.after(async () => {
    await closeCurrent();
    if (complete) {
      assert.equal(path.dirname(root).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
      assert.ok(path.basename(root).startsWith('d4-cp3-budget-'));
      await fs.rm(root, {recursive: true, force: true});
      await assert.rejects(fs.stat(root), (error) => error.code === 'ENOENT');
    }
    await writeJson('cleanup.json', {pid: process.pid, instances, root, complete,
      preservedForResume: !complete, removed: complete, elapsedMs: Math.round(performance.now() - started)});
  });
  const open = async (fresh = false) => {
    server = await startRuntimeServer({directory, ...(fresh ? {profile: 'scene-survival-village', seed: 42} : {}),
      port: 0, writable: true, inspectMind: true});
    assert.notEqual(Number(new URL(server.url).port), 18324);
    instances.push(server.url);
    lifecycle.push({status: 'ready', pid: process.pid, url: server.url, directory,
      elapsedMs: Math.round(performance.now() - started)});
    await writeJson('lifecycle.json', lifecycle);
  };
  const readFive = async () => {
    const routes = ['snapshot', 'player', 'minds', 'encounter', 'scene'];
    return Object.fromEntries(await Promise.all(routes.map(async (route) => {
      const response = await fetch(`${server.url}/api/runtime/${route}`);
      assert.equal(response.status, 200, route);
      return [route, await response.json()];
    })));
  };
  const send = async (dto, label) => {
    const body = JSON.stringify(dto);
    const response = await fetch(`${server.url}/api/runtime/commands`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body});
    const raw = await response.text();
    await writeJson(`http-${label}.json`, {dto, requestBody: body, status: response.status,
      responseBody: raw, pid: process.pid, url: server.url, elapsedMs: Math.round(performance.now() - started)});
    return {status: response.status, value: JSON.parse(raw)};
  };
  const checkpoint = async (count, phase) => {
    const files = await storedBytes();
    assert.deepEqual(Array.from(files.keys()), expectedNames(count));
    const value = {phase, accepted: count, remaining: 128 - count, root, directory, evidence,
      pid: process.pid, url: server.url, elapsedMs: Math.round(performance.now() - started),
      commandIds: dtos.slice(0, count).map((dto) => dto.commandId), fileHashes: hashes(files)};
    await writeJson(`checkpoint-${String(count).padStart(3, '0')}.json`, value);
    await writeJson('checkpoint.json', value);
    console.log(`CP3-BUDGET ${phase}: ${count}/128 accepted, remaining=${128 - count}, elapsed=${value.elapsedMs}ms, checkpoint=${path.join(evidence, 'checkpoint.json')}`);
  };
  await open(!resume);
  let accepted = 0;
  if (resume) {
    const names = await formalNames();
    accepted = names.length - 1;
    assert.ok(accepted >= 0 && accepted <= 128);
    assert.deepEqual(names, expectedNames(accepted));
    const saved = JSON.parse(await fs.readFile(path.join(directory, names.at(-1)), 'utf8'));
    assert.equal(saved.serviceFormatVersion, 9);
    assert.deepEqual(saved.commands.map((entry) => entry.dto), dtos.slice(0, accepted));
    receipts.push(...saved.commands.map((entry) => entry.receipt));
    await checkpoint(accepted, 'resumed-real-files');
  } else {
    assert.deepEqual(await formalNames(), ['service-commit-r0.json']);
    const initial = JSON.parse(await fs.readFile(path.join(directory, 'service-commit-r0.json'), 'utf8'));
    assert.equal(initial.serviceFormatVersion, 9);
    assert.equal(initial.commands.length, 0);
    assert.equal(initial.bundle.snapshot.tick, 0);
    assert.equal(initial.bundle.snapshot.revision, 0);
    await fs.copyFile(path.join(directory, 'service-commit-r0.json'), path.join(evidence, 'initial-r0.json'));
    await checkpoint(0, 'initialized-r0');
  }
  for (let index = accepted; index < 128; index++) {
    const response = await send(dtos[index], String(index + 1).padStart(3, '0'));
    assert.equal(response.status, 200, `accepted input ${index + 1}`);
    const receipt = response.value;
    assert.equal(receipt.status, 'committed');
    assert.equal(receipt.commandId, dtos[index].commandId);
    assert.equal(receipt.fromRevision, dtos[index].expectedRevision);
    assert.equal(receipt.toRevision, index + 12);
    assert.equal(receipt.fromTick, index === 0 ? 0 : 12);
    assert.equal(receipt.tick, 12);
    assert.equal(receipt.durationTicks, index === 0 ? 12 : 0);
    assert.equal(receipt.outcome, index === 0 ? 'succeeded' : 'rejected');
    if (index > 0) assert.deepEqual(receipt.result, {donorId: 'actor-4', recipientId: 'actor-2',
      product: 'food', quantity: 1, sourceEventSeq: null, reasonCode: 'NOT_COLOCATED'});
    receipts.push(receipt);
    const saved = JSON.parse(await fs.readFile(path.join(directory, `service-commit-r${index + 12}.json`), 'utf8'));
    assert.equal(saved.serviceFormatVersion, 9);
    assert.equal(saved.commands.length, index + 1);
    assert.deepEqual(saved.commands.at(-1), {dto: dtos[index], receipt});
    assert.deepEqual(saved.bundle.snapshot.world.encounterModel.inputHistory.at(-1), {dto: dtos[index], receipt});
    assert.equal(saved.bundle.snapshot.revision, index + 12);
    assert.equal(saved.bundle.snapshot.tick, 12);
    if ((index + 1) % 16 === 0) await checkpoint(index + 1, 'accepted-commands');
  }
  const finalFile = path.join(directory, 'service-commit-r139.json');
  const finalRaw = await fs.readFile(finalFile);
  const final = JSON.parse(finalRaw);
  const world = final.bundle.snapshot.world;
  const journal = dtos.map((dto, i) => ({dto, receipt: receipts[i]}));
  assert.equal(receipts.length, 128);
  assert.deepEqual(final.commands, journal);
  assert.deepEqual(world.encounterModel.inputHistory, journal);
  assert.equal(final.bundle.snapshot.revision, 139);
  assert.equal(final.bundle.snapshot.tick, 12);
  assert.equal(final.bundle.snapshot.instantCommits, 127);
  assert.equal(world.playerModel.inventory.food, 20);
  assert.equal(world.playerModel.ledger.foodGiven, 0);
  assert.equal(world.societyModel.agents.find((actor) => actor.state.actorId === 'actor-2').state.inventory.food, 0);
  assert.equal(world.societyModel.agents.reduce((sum, actor) => sum + actor.trade.foodReceived, 0), 0);
  assert.equal(final.bundle.eventLog.filter((event) => event.type === 'FoodGiftCommitted').length, 0);
  const resolved = final.bundle.eventLog.filter((event) => event.type === 'EncounterCommandResolved');
  assert.equal(resolved.length, 128);
  assert.deepEqual(resolved.map((event) => event.payload), journal);
  for (const actor of world.memoryModel.observer.actors) {
    assert.ok(actor.memories.length <= 32);
    assert.equal(actor.memories.filter((memory) => memory.observable?.type === 'food-gift').length, 0);
    for (const memory of actor.memories) {
      const fact = final.bundle.eventLog.find((event) => event.eventSeq === memory.sourceEventSeq);
      assert.ok(fact, 'every retained memory refers to a real persisted fact');
      assert.equal(memory.occurrenceTick, fact.tick);
    }
  }
  await fs.writeFile(path.join(evidence, 'final-r139.json'), finalRaw);
  await writeJson('receipts.json', receipts);
  await writeJson('journal.json', journal);
  const before = await readFive();
  for (const value of Object.values(before)) { assert.equal(value.revision, 139); assert.equal(value.tick, 12); }
  assert.equal(before.scene.location, 'forest');
  assert.deepEqual(before.scene.actors, []);
  const diskBefore = await storedBytes();
  assert.equal(diskBefore.size, 129, 'actual formal r0 plus128 accepted commits; lock and temporary files excluded');
  assert.deepEqual(Array.from(diskBefore.keys()), expectedNames(128));
  await writeJson('five-before.json', before);
  await writeJson('disk-before.json', hashes(diskBefore));
  const unchanged = async (label) => {
    const after = await readFive();
    assert.deepEqual(after, before, `${label}: all five real HTTP projections unchanged`);
    const files = await storedBytes();
    assert.deepEqual(Array.from(files.keys()), Array.from(diskBefore.keys()));
    for (const [name, bytes] of diskBefore) assert.deepEqual(files.get(name), bytes, `${label}: ${name} byte-identical`);
    await writeJson(`disk-${label}.json`, hashes(files));
  };
  const overflow = await send({...dtos[1], commandId: 'cp3-budget-129', expectedRevision: 139}, 'overflow');
  assert.equal(overflow.status, 413);
  assert.equal(overflow.value.error.code, 'LIMIT_EXCEEDED');
  await unchanged('after-overflow');
  const earliest = await send(dtos[0], 'earliest-original-dto');
  assert.equal(earliest.status, 200);
  assert.deepEqual(earliest.value, receipts[0], 'original expectedRevision0 is replayed before stale or full budget');
  await unchanged('after-earliest-replay');
  const conflict = await send({...dtos[0], expectedRevision: 139}, 'same-id-different-dto');
  assert.equal(conflict.status, 409);
  assert.equal(conflict.value.error.code, 'COMMAND_ID_CONFLICT');
  await unchanged('after-conflict');
  const stale = await send({...dtos[1], commandId: 'cp3-budget-new-stale', expectedRevision: 138}, 'new-id-stale');
  assert.equal(stale.status, 409);
  assert.equal(stale.value.error.code, 'REVISION_CONFLICT');
  assert.equal(stale.value.currentRevision, 139);
  await unchanged('after-stale');
  await closeCurrent();
  await open();
  await unchanged('after-graceful-reopen');
  const replayReopened = await send(dtos[0], 'earliest-after-reopen');
  assert.equal(replayReopened.status, 200);
  assert.deepEqual(replayReopened.value, receipts[0]);
  await unchanged('after-reopen-replay');
  await writeJson('result.json', {status: 'PASS', accepted: 128, formalFiles: 129, journal: 128,
    revision: 139, tick: 12, actualGiftFacts: 0, originalDtoReplay: true, overflowStatus: 413,
    conflictStatus: 409, staleStatus: 409, elapsedMs: Math.round(performance.now() - started)});
  complete = true;
});
