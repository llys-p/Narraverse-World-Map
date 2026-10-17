import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoClient } from '../../demo-runtime-bridge.mjs';
import { createCampaignVillage } from '../../runtime/fixtures/campaign-village.mjs';
import { advanceAuditedServiceCommit, createAuditedServiceCommit } from '../../runtime/service/service-commit.mjs';
import { projectEncounterSnapshot, projectMapSnapshot, projectPlayerSnapshot, projectPublicSnapshot, projectSceneSnapshot } from '../../runtime/service/http-contract.mjs';

function demoState(bundle) {
  const remainingCommands = 128 - bundle.snapshot.revision;
  return {
    apiVersion: 1,
    capabilities: { apiVersion: 1, commandDtoVersion: 5, continuousMarch: true, encounterAvailable: true,
      mapAvailable: true, playerAvailable: true, sceneAvailable: true, writes: true },
    snapshot: projectPublicSnapshot(bundle),
    map: projectMapSnapshot(bundle, remainingCommands),
    player: projectPlayerSnapshot(bundle),
    encounter: projectEncounterSnapshot(bundle),
    scene: projectSceneSnapshot(bundle),
    runner: { active: false },
  };
}

function response(body, ok = true) { return { ok, async json() { return body; } }; }

test('SSE keeps an in-flight recovered request pending and retry confirms only on its POST receipt', async t => {
  const previous = Object.fromEntries(['fetch', 'EventSource', 'sessionStorage', 'document', 'window']
    .map(key => [key, globalThis[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value; });

  const { bundle: initialBundle } = createCampaignVillage(42, 'demo-pending-status');
  let committed = null, postCalls = [], eventSource;
  const stored = new Map();
  globalThis.sessionStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  globalThis.document = { hidden: false, addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  globalThis.EventSource = class {
    constructor() { eventSource = this; }
    close() {}
    send(state) { this.onmessage({ data: JSON.stringify(state) }); }
  };

  const simulationId = initialBundle.snapshot.simulationId;
  const request = { apiVersion: 1, requestId: 'restored-original-id', type: 'MarchSet', payload: { x: 16, y: 7 } };
  const originalBody = JSON.stringify(request);
  stored.set(`narraverse.demo.pending.v1:${simulationId}`, JSON.stringify({ simulationId, endpoint: '/api/runtime/demo-order', body: originalBody, fromTick: 0 }));

  let rejectFirstPost;
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/runtime/demo-state') return response(demoState(committed?.bundle ?? initialBundle));
    assert.equal(url, '/api/runtime/demo-order');
    assert.equal(options.method, 'POST');
    postCalls.push(options.body);
    if (postCalls.length === 1) return new Promise((resolve, reject) => { rejectFirstPost = reject; });
    assert.equal(options.body, originalBody, 'retry reuses the exact persisted request body and ID');
    return response({ command: committed.commands.at(-1).dto, receipt: committed.commands.at(-1).receipt });
  };

  const statuses = [];
  const client = createDemoClient({ onState() {}, onStatus(text) { statuses.push(text); }, onReceipt() {} });
  await client.start();
  eventSource.send(demoState(initialBundle));
  assert.equal(client.state().pending, true, 'sessionStorage request is restored');

  const firstRetry = client.retry();
  assert.equal(client.state().busy, true);
  committed = advanceAuditedServiceCommit(createAuditedServiceCommit({ serviceFormatVersion: 11, anchor: initialBundle, commands: [], bundle: initialBundle }), {
    version: 5, commandId: request.requestId, expectedRevision: initialBundle.snapshot.revision, type: request.type, payload: request.payload,
  });
  eventSource.send(demoState(committed.bundle));
  assert.equal(client.state().pending, true, 'a newer SSE projection does not clear the unconfirmed request');
  assert.equal(client.state().busy, true);
  assert.match(statuses.at(-1), /正在确认/);
  assert.doesNotMatch(statuses.at(-1), /重试/);
  assert.equal(client.state().canRetry, false, 'the retry affordance is unavailable while the POST is in flight');

  rejectFirstPost(new TypeError('connection lost after commit'));
  await assert.rejects(firstRetry, /connection lost after commit/);
  assert.equal(client.state().busy, false);
  assert.equal(client.state().pending, true);
  assert.equal(client.state().canRetry, true, 'the unresolved request becomes resumable after the connection loss');

  await client.retry();
  assert.deepEqual(postCalls, [originalBody, originalBody]);
  assert.equal(client.state().pending, false, 'a validated POST receipt clears the pending request');
  assert.equal(client.state().canRetry, false);
  assert.equal(stored.has(`narraverse.demo.pending.v1:${simulationId}`), false);
});
