import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createDemoClient } from '../../demo-runtime-bridge.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { createCampaignVillage } from '../../runtime/fixtures/campaign-village.mjs';
import { advanceAuditedServiceCommit, createAuditedServiceCommit, loadServiceCommit } from '../../runtime/service/service-commit.mjs';
import { projectEncounterSnapshot, projectMapSnapshot, projectPlayerSnapshot, projectPublicSnapshot, projectSceneSnapshot } from '../../runtime/service/http-contract.mjs';

const projectionKeys = ['snapshot', 'map', 'player', 'encounter', 'scene'];
const projections = group => Object.fromEntries(projectionKeys.map(key => [key, group[key]]));
const errorResponse = (status, code, extra = {}) => Response.json({ apiVersion: 1, error: { code, message: 'test response' }, ...extra }, { status });

function browser(t) {
  const keys = ['fetch', 'EventSource', 'sessionStorage', 'document', 'window'];
  const saved = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => { for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  } });
  const stored = new Map();
  let source;
  globalThis.sessionStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
  };
  globalThis.document = { hidden: false, addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  globalThis.EventSource = class {
    constructor() { source = this; }
    close() {}
  };
  return { stored, connect(group) { source.onmessage({ data: JSON.stringify(group) }); } };
}

function fixture() {
  const { bundle } = createCampaignVillage(42, 'demo-command-recovery');
  const group = state => ({
    apiVersion: 1,
    capabilities: { apiVersion: 1, commandDtoVersion: 5, continuousMarch: true, encounterAvailable: true,
      mapAvailable: true, playerAvailable: true, sceneAvailable: true, writes: true },
    snapshot: projectPublicSnapshot(state), map: projectMapSnapshot(state, 128 - state.snapshot.world.encounterModel.inputHistory.length),
    player: projectPlayerSnapshot(state), encounter: projectEncounterSnapshot(state), scene: projectSceneSnapshot(state),
    runner: { active: false },
  });
  return { bundle, group, initial: group(bundle) };
}

const clientWith = (onReceipt = () => {}) => createDemoClient({ onState() {}, onStatus() {}, onReceipt });

async function diskHashes(directory) {
  const names = (await fs.readdir(directory)).filter(name => /^service-commit-r\d+\.json$/.test(name)).sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex')])));
}

test('a 503 after a durable sale survives reload and full server reopen without a second sale', async t => {
  const nativeFetch = globalThis.fetch;
  const env = browser(t);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'narraverse-command-recovery-'));
  let server;
  t.after(async () => { if (server) await server.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const options = { directory, port: 0, writable: true, continuousMarch: true };
  server = await startRuntimeServer({ ...options, seed: 42, profile: 'campaign-village' });
  const readState = async () => {
    const response = await nativeFetch(server.url + '/api/runtime/demo-state');
    assert.equal(response.status, 200); return response.json();
  };
  const before = await readState(), posts = [], receipts = [];
  let originalReceipt;
  globalThis.fetch = async (url, options = {}) => {
    const response = await nativeFetch(server.url + url, options);
    if (url !== '/api/runtime/commands') return response;
    posts.push(options.body);
    assert.equal(response.status, 200);
    if (posts.length === 1) {
      originalReceipt = await response.json();
      assert.equal(originalReceipt.outcome, 'succeeded');
      // Inject only at the client transport boundary, after real durable success.
      return errorResponse(503, 'SAVE_FAILED');
    }
    return response;
  };
  let client = clientWith(receipt => receipts.push(receipt));
  await client.start(); env.connect(before);
  await assert.rejects(client.submit('PlayerSell', { product: 'food', quantity: 1 }), /SAVE_FAILED/);
  assert.equal(client.state().pending, true, 'a server error does not prove that the sale was rolled back');
  assert.equal(client.state().canRetry, true);
  await assert.rejects(client.submit('PlayerSell', { product: 'food', quantity: 1 }), /当前无法提交/);
  const after = await readState(), hashes = await diskHashes(directory);
  assert.equal(after.player.self.inventory.food, before.player.self.inventory.food - 1);
  assert(after.player.self.wallet > before.player.self.wallet);
  assert.equal(after.snapshot.revision, originalReceipt.toRevision);
  assert.equal(Object.keys(hashes).length, 2);
  await server.close(); server = null;
  assert(!(await fs.readdir(directory)).some(name => name.endsWith('.lock')));
  server = await startRuntimeServer(options);
  client = clientWith(receipt => receipts.push(receipt));
  await client.start(); env.connect(await readState());
  assert.equal(client.state().canRetry, true, 'the new client restores the same persisted request');
  const retried = await client.retry();
  assert.deepEqual(retried, originalReceipt);
  assert.deepEqual(posts, [posts[0], posts[0]], 'both POSTs have identical bytes, ID and expected revision');
  assert.deepEqual(receipts, [originalReceipt]);
  assert.deepEqual(projections(await readState()), projections(after));
  assert.deepEqual(await diskHashes(directory), hashes);
  assert.equal(client.state().pending, false); assert.equal(env.stored.size, 0);
  await server.close(); server = null;
  assert(!(await fs.readdir(directory)).some(name => name.endsWith('.lock')));
  const commit = await loadServiceCommit(path.join(directory, `service-commit-r${originalReceipt.toRevision}.json`));
  assert.equal(commit.commands.length, 1);
  assert.deepEqual(commit.commands[0].receipt, originalReceipt);
  assert.equal(commit.bundle.snapshot.tick, originalReceipt.tick);
});

test('uncertain order errors retain exact bytes and never enable another intent', async t => {
  const env = browser(t), { initial } = fixture(), posts = [];
  const failures = [
    () => errorResponse(500, 'RUNTIME_UNAVAILABLE'),
    () => errorResponse(408, 'INVALID_INPUT'),
    () => errorResponse(429, 'LIMIT_EXCEEDED'),
    () => errorResponse(409, 'UNKNOWN_CONFLICT'),
    () => Response.json({ error: { code: 'REVISION_CONFLICT' } }, { status: 409 }),
  ];
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/runtime/demo-state') return Response.json(initial);
    assert.equal(url, '/api/runtime/demo-order'); posts.push(options.body);
    return failures[posts.length - 1]();
  };
  const client = clientWith(); await client.start(); env.connect(initial);
  for (let i = 0; i < failures.length; i++) {
    await assert.rejects(i === 0 ? client.submit('MarchSet', { x: 16, y: 7 }) : client.retry());
    assert.equal(client.state().canRetry, true);
    assert.equal(env.stored.size, 1);
    await assert.rejects(client.submit('MarchPause'), /当前无法提交/);
    assert.equal(posts.length, i + 1);
    assert.equal(posts[i], posts[0]);
  }
});

test('a protocol-matching POST revision rejection clears only the rejected request', async t => {
  const env = browser(t), { initial } = fixture();
  globalThis.fetch = async url => url === '/api/runtime/demo-state' ? Response.json(initial) : errorResponse(409, 'REVISION_CONFLICT', { currentRevision: 1 });
  const client = clientWith(); await client.start(); env.connect(initial);
  await assert.rejects(client.submit('AdvanceTime', { ticks: 1 }), /REVISION_CONFLICT/);
  assert.equal(client.state().pending, false);
  assert.equal(client.state().busy, false);
  assert.equal(env.stored.size, 0);
});

test('a confirmed receipt stays recoverable through refresh errors and stale views', async t => {
  const env = browser(t), { bundle, group, initial } = fixture();
  let commit, reads = 0;
  const posts = [], receipts = [];
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/runtime/demo-state') {
      reads++;
      if (reads === 2) return errorResponse(409, 'REVISION_CONFLICT', { currentRevision: 1 });
      return Response.json(reads <= 3 ? initial : group(commit.bundle));
    }
    assert.equal(url, '/api/runtime/commands'); posts.push(options.body);
    if (!commit) commit = advanceAuditedServiceCommit(createAuditedServiceCommit({ serviceFormatVersion: 11, anchor: bundle, commands: [], bundle }), JSON.parse(options.body));
    return Response.json(commit.commands[0].receipt);
  };
  const client = clientWith(receipt => receipts.push(receipt));
  await client.start(); env.connect(initial);
  await assert.rejects(client.submit('PlayerGiftFood', { recipientId: 'actor-2' }), /REVISION_CONFLICT/);
  assert.equal(client.state().canRetry, true, 'a GET error cannot reject the already confirmed POST');
  assert.equal(receipts.length, 0);
  await assert.rejects(client.retry(), /世界状态尚未更新到本次回执/);
  assert.equal(client.state().canRetry, true, 'an older coherent view cannot finish confirmation');
  const receipt = await client.retry();
  assert.deepEqual(posts, [posts[0], posts[0], posts[0]]);
  assert.deepEqual(receipts, [receipt]);
  assert.equal(client.getGroup().scene.self.food, initial.scene.self.food - 1);
  assert.equal(client.state().pending, false); assert.equal(env.stored.size, 0);
});
