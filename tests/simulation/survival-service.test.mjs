// M4A A3 slice: ServiceCommit format 7, the survival namespace, idempotence and the read-only
// HTTP gates. Uses a temporary directory and an isolated port only; it never connects to an
// existing instance and the browser-facing routes are exercised with GET/HEAD alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { projectPublicSnapshot, projectPlayerSnapshot, projectMindInspector, runtimeProfile,
  survivalBackendState, loadSurvivalBackend } from '../../runtime/service/http-contract.mjs';
import { transitionServiceCommand, validateServiceCommit, saveServiceCommit, loadServiceCommit }
  from '../../runtime/service/service-commit.mjs';
import { createSurvivalVillage, defaultSurvivalVillageConfig } from '../../runtime/fixtures/survival-village.mjs';
import { SURVIVAL_SERVICE_FORMAT, SURVIVAL_DECISION_PREFIX } from '../../runtime/core/survival-state.mjs';

async function isolated(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'm4a-service-'));
  const port = 18600 + Math.floor(Math.random() * 200);
  const service = await startRuntimeServer({ directory: path.join(dir, 'world'), profile: 'survival-village',
    seed: 42, writable: true, inspectMind: true, port });
  t.after(async () => { await service.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return service;
}
const readJson = async (base, route) => {
  const r = await fetch(base + route, { cache: 'no-store' });
  return { status: r.status, body: r.status === 200 ? await r.json() : null, headers: r.headers };
};

test('§3.1: the survival backend loads and the profile reports service format 7', async t => {
  await isolated(t);
  const backend = await loadSurvivalBackend();
  assert.equal(backend.dependencyPending, false, 'the survival backend must not report a pending dependency');
  const state = survivalBackendState();
  assert.equal(state.available, true, `survival backend unavailable: ${state.error}`);
  assert.equal(SURVIVAL_SERVICE_FORMAT, 7);
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  const profile = runtimeProfile(fixture.bundle);
  assert.equal(profile.serviceFormatVersion, 7);
  assert.equal(profile.rulesVersion, 'm-survival-v1');
});

test('§6: the three projections share one revision and the inspector is read-only', async t => {
  const service = await isolated(t);
  const base = service.url;
  const snapshot = (await readJson(base, '/api/runtime/snapshot')).body;
  const player = (await readJson(base, '/api/runtime/player')).body;
  const mind = (await readJson(base, '/api/runtime/minds')).body;
  assert.equal(snapshot.revision, player.revision, 'snapshot and player share one revision');
  assert.equal(snapshot.revision, mind.revision, 'snapshot and mind share one revision');
  assert.equal(mind.apiVersion, 1);
  assert.equal(mind.mindVersion, 'survival-inspector-v1');
  // The counterfactual stays null and is never invented.
  for (const actor of mind.actors) assert.equal(actor.counterfactual, null);
  // World facts are separated from the actor's own account.
  assert.equal(typeof mind.worldFacts.publicFood, 'number');
  assert.equal(typeof mind.worldFacts.postedFoodPrice, 'number');
  const a2 = mind.actors.find(a => a.knowledge.actorId === 'actor-2');
  assert.ok(!Object.hasOwn(a2.knowledge, 'communalGold'), 'no public cash inside Knowledge');
});

test('§6: the mind routes accept only GET/HEAD, refuse a query and serve no body for HEAD', async t => {
  const service = await isolated(t);
  const base = service.url;
  for (const route of ['/api/runtime/minds', '/runtime-mind.html']) {
    const ok = await fetch(base + route, { cache: 'no-store' });
    assert.equal(ok.status, 200, `${route} must be readable`);
    const head = await fetch(base + route, { method: 'HEAD' });
    assert.equal(head.status, 200, `${route} HEAD must succeed`);
    assert.equal((await head.text()).length, 0, `${route} HEAD must carry no body`);
    const post = await fetch(base + route, { method: 'POST', body: '{}' });
    assert.equal(post.status, 405, `${route} must refuse writes`);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
  }
  const query = await fetch(base + '/api/runtime/minds?x=1');
  assert.equal(query.status, 400, 'query parameters must be refused');
  // Static assets keep their own content types.
  const css = await fetch(base + '/runtime-mind.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
});

test('§3.3: format 7 protects the survival namespace and every format 6 prefix', async t => {
  await loadSurvivalBackend();
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  assert.equal(runtimeProfile(fixture.bundle).serviceFormatVersion, 7);
  // Every internal namespace is refused. `society-day-` is already rejected by the shared DTO
  // rule for action commands; the rest are refused by the format-7 reserved list.
  for (const id of ['survival-day-1-actor-2', 'cognition-day-1-actor-2', 'cognition-eval-1', 'mind-day-1',
    'mind-settle-1', 'motivation-day-1', 'experience-day-1']) {
    assert.throws(() => transitionServiceCommand(fixture.bundle, { version: 2, commandId: id,
      expectedRevision: 0, type: 'PlayerRest', payload: {} }), /Reserved internal command ID/,
      `${id} must stay reserved`);
  }
  assert.throws(() => transitionServiceCommand(fixture.bundle, { version: 2, commandId: 'society-day-1',
    expectedRevision: 0, type: 'PlayerRest', payload: {} }), /Invalid action command ID/);
  // An unrelated external id is accepted.
  const result = transitionServiceCommand(fixture.bundle, { version: 2, commandId: 'surv-external-1',
    expectedRevision: 0, type: 'PlayerRest', payload: {} });
  assert.equal(result.receipt.status, 'committed');
  assert.equal(result.receipt.commandId, 'surv-external-1');
  assert.equal(SURVIVAL_DECISION_PREFIX, 'survival-day-');
});

test('§6: submitting the same id again returns the same receipt, a changed DTO conflicts', async t => {
  const service = await isolated(t);
  const base = service.url;
  const submit = dto => fetch(base + '/api/runtime/commands', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(dto) });
  const dto = { version: 2, commandId: 'surv-idem-1', expectedRevision: 0, type: 'PlayerRest', payload: {} };
  const first = await (await submit(dto)).json();
  assert.equal(first.status, 'committed');
  const again = await (await submit(dto)).json();
  assert.deepEqual(again, first, 're-submitting the identical command must return the same receipt');
  // The same id with a different payload is a hard conflict, not a second effect.
  const changed = { ...dto, type: 'PlayerBuy', payload: { product: 'food', quantity: 1 } };
  const conflict = await submit(changed);
  assert.equal(conflict.status, 409, 'a changed DTO under a used id must conflict');
});

test('§6: a service commit replays exactly and a saved file re-audits', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'm4a-commit-'));
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  const anchor = fixture.bundle;
  const commands = [];
  let bundle = anchor;
  for (const [index, dto] of [[0, { version: 1, commandId: 'surv-adv-1', expectedRevision: 0,
      type: 'AdvanceTime', payload: { ticks: 144 } }],
    [144, { version: 1, commandId: 'surv-adv-2', expectedRevision: 144, type: 'AdvanceTime', payload: { ticks: 144 } }]]) {
    assert.equal(bundle.snapshot.revision, index);
    const next = transitionServiceCommand(bundle, dto);
    commands.push({ dto, receipt: next.receipt });
    bundle = next.bundle;
  }
  const envelope = { serviceFormatVersion: 7, anchor, commands, bundle };
  validateServiceCommit(envelope);
  const file = await saveServiceCommit(envelope, path.join(dir, 'world'));
  const reloaded = await loadServiceCommit(file);
  validateServiceCommit(reloaded);
  assert.equal(reloaded.serviceFormatVersion, 7);
  assert.equal(reloaded.commands.length, 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test('§6: a stale expectedRevision is refused with the current revision', async t => {
  const service = await isolated(t);
  const base = service.url;
  const snapshot = (await readJson(base, '/api/runtime/snapshot')).body;
  const r = await fetch(base + '/api/runtime/commands', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, commandId: 'surv-stale-1', expectedRevision: snapshot.revision + 5,
      type: 'AdvanceTime', payload: { ticks: 1 } }) });
  assert.equal(r.status, 409, 'a stale revision must be a conflict');
  const body = await r.json();
  assert.equal(body.currentRevision, snapshot.revision);
});

test('§6: the capabilities report writes, the player surface and the mind inspector', async t => {
  const service = await isolated(t);
  const caps = (await readJson(service.url, '/api/runtime/capabilities')).body;
  assert.equal(caps.apiVersion, 1);
  assert.equal(caps.writes, true);
  assert.equal(caps.playerAvailable, true);
  assert.equal(caps.playerActionsAvailable, true, 'format 7 supports player actions');
  assert.equal(caps.mindAvailable, true, 'the survival profile carries a mind inspector');
});

test('§6: advancing through the service keeps the world valid and the actor fed', async t => {
  const service = await isolated(t);
  const base = service.url;
  const snapshot = (await readJson(base, '/api/runtime/snapshot')).body;
  const r = await fetch(base + '/api/runtime/commands', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, commandId: 'surv-adv-1', expectedRevision: snapshot.revision,
      type: 'AdvanceTime', payload: { ticks: 144 } }) });
  assert.equal(r.status, 200);
  const mind = (await readJson(base, '/api/runtime/minds')).body;
  const a2 = mind.actors.find(a => a.knowledge.actorId === 'actor-2');
  assert.equal(a2.knowledge.knowledgeVersion, 'survival-knowledge-v1');
  assert.equal(a2.lastDecision.decisionId, 'survival-day-1-actor-2');
  assert.equal(a2.lastDecision.choice, 'BuyFood');
  assert.equal(a2.lastOutcome.status, 'succeeded');
  assert.equal(a2.lastOutcome.delta.food, 1, 'the private food delta is reported');
  assert.equal(a2.lastOutcome.price, 10, 'the real price paid is reported');
  // actor-3 keeps the frozen cognition Knowledge shape with no survival fields.
  const a3 = mind.actors.find(a => a.knowledge.actorId === 'actor-3');
  assert.equal(a3.knowledge.knowledgeVersion, 'cognition-knowledge-v1');
  assert.ok(!Object.hasOwn(a3.knowledge, 'foodQuote'));
  assert.ok(!Object.hasOwn(a3.knowledge, 'workOffer'));
  // The decision-time frozen knowledge is still reported, never rewritten.
  assert.equal(a2.lastDecision.knowledgeFingerprint.length > 0, true);
});

test('§6: projectPublicSnapshot and projectMindInspector stay detached clones', async t => {
  await isolated(t);
  const fixture = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable'));
  const first = projectMindInspector(fixture.bundle);
  const second = projectMindInspector(fixture.bundle);
  assert.deepEqual(first, second, 'two projections of the same world must agree');
  assert.notEqual(first, second, 'but must not be the same object');
  const publicView = projectPublicSnapshot(fixture.bundle);
  assert.equal(publicView.apiVersion, 1);
  assert.equal(publicView.market.food, 540, 'the public view reports the real post-allocation stock');
  const player = projectPlayerSnapshot(fixture.bundle);
  assert.equal(player.apiVersion, 1);
  assert.equal(player.self.identity.actorId, 'actor-4');
  assert.equal(typeof player.actions.prices.food.buy, 'number');
});
