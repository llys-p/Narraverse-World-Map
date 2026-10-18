import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { advanceAuditedServiceCommit, createCampaignLiveWriter, loadRuntimeServiceCommit, validateServiceCommit } from '../../runtime/service/service-commit.mjs';

const dto = (commandId, expectedRevision, ticks = 1) => ({
  version: 5, commandId, expectedRevision, type: 'AdvanceTime', payload: { ticks },
});
const views = owner => ({ snapshot: owner.getSnapshot(), map: owner.getMap(), scene: owner.getScene(), encounter: owner.getEncounter() });
const artifactRoot = fileURLToPath(new URL('../../artifacts/d4e12/', import.meta.url));
async function setup(t, io = fs, seed = 42) {
  const root = path.join(artifactRoot, `campaign-live-owner-${randomUUID()}`);
  await fs.mkdir(root, { recursive: true });
  const directory = path.join(root, 'world');
  const owner = await createRuntimeOwner({ directory, profile: 'campaign-village', seed, writable: true }, io);
  t.after(() => owner.close());
  return { root, directory, owner };
}
function trackingIo() {
  let links = 0, fail = false;
  const io = new Proxy(fs, { get(target, key) {
    if (key === 'link') return async (...args) => {
      links++;
      if (fail) throw Object.assign(new Error('injected link failure'), { code: 'EIO' });
      return fs.link(...args);
    };
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { io, get links() { return links; }, set fail(value) { fail = value; } };
}
async function diskState(directory) {
  const names = (await fs.readdir(directory)).sort();
  const files = await Promise.all(names.filter(name => name.endsWith('.json')).map(async name =>
    [name, await fs.readFile(path.join(directory, name))]));
  return { names, files };
}

test('owner serializes revision races, deduplicates retries, and detaches caller data', async t => {
  const tracker = trackingIo(), { owner, directory } = await setup(t, tracker.io);
  let getterCalls = 0;
  const malformed = { ...dto('getter', 0), payload: { get ticks() { getterCalls++; return 1; } } };
  await assert.rejects(owner.submit(malformed));
  assert.equal(getterCalls, 0);

  const attempts = [dto('race-a', 0), dto('race-b', 0)];
  const results = await Promise.allSettled(attempts.map(command => owner.submit(command)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'REVISION_CONFLICT').length, 1);
  const index = results.findIndex(result => result.status === 'fulfilled');
  const original = structuredClone(attempts[index]), receipt = results[index].value;
  assert.equal(owner.getSnapshot().tick, 1);

  const links = tracker.links, files = await diskState(directory);
  assert.deepEqual(await owner.submit(original), receipt);
  assert.equal(tracker.links, links, 'same DTO retry performs no publication');
  assert.deepEqual(await diskState(directory), files);
  await assert.rejects(owner.submit({ ...original, payload: { ticks: 2 } }), error => error.code === 'COMMAND_ID_CONFLICT');

  attempts[index].payload.ticks = 4;
  const projection = owner.getSnapshot(), pristine = owner.getSnapshot();
  projection.market.food = -1; projection.actors[0].name = 'mutated';
  assert.deepEqual(owner.getSnapshot(), pristine);
  assert.equal(owner.getSnapshot().tick, 1, 'mutating the submitted DTO cannot alter committed state');
});

test('failed link publication preserves projections and files, then retries at the same revision', async t => {
  const tracker = trackingIo(), { owner, directory } = await setup(t, tracker.io);
  const beforeViews = views(owner), beforeDisk = await diskState(directory), command = dto('retry-after-link', 0);
  tracker.fail = true;
  await assert.rejects(owner.submit(command), error => error.code === 'SAVE_FAILED');
  assert.deepEqual(views(owner), beforeViews);
  assert.deepEqual(await diskState(directory), beforeDisk);
  tracker.fail = false;
  const receipt = await owner.submit(command);
  assert.equal(receipt.toRevision, 1);
  assert.equal(owner.getSnapshot().tick, 1);
});

test('reopen preserves short history and JSON commit copies receive full independent audit', async t => {
  let { directory, owner } = await setup(t);
  await owner.submit(dto('short-a', 0, 2));
  await owner.submit(dto('short-b', 2, 2));
  const expected = views(owner), revision = owner.getSnapshot().revision;
  await owner.close();
  owner = await createRuntimeOwner({ directory, writable: true });
  t.after(() => owner.close());
  assert.deepEqual(views(owner), expected);
  assert.ok(owner.getSnapshot().tick <= 4);
  await owner.close();

  const file = path.join(directory, `service-commit-r${revision}.json`);
  const envelope = JSON.parse(await fs.readFile(file, 'utf8'));
  const detached = JSON.parse(JSON.stringify(envelope));
  assert.doesNotThrow(() => validateServiceCommit(detached));
  assert.notStrictEqual(detached.bundle, envelope.bundle);
  const mutations = [
    value => { const snapshot = value.bundle.snapshot; const fact = structuredClone(value.bundle.eventLog.at(-1));
      fact.eventSeq = snapshot.nextEventSeq++; value.bundle.eventLog.push(fact); },
    value => { value.commands.at(-1).receipt.toRevision++; },
    value => { value.bundle.snapshot.rng.state = (value.bundle.snapshot.rng.state + 1) >>> 0; },
    value => { value.bundle.snapshot.scheduledTasks.find(task => task.systemId === 'society').nextDueTick++; },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(detached); mutate(bad);
    assert.throws(() => validateServiceCommit(bad));
  }
});

test('uncertain publication exposes no success or continuation until full reopen resolves it',async t=>{
 let uncertain=false;
 const io=new Proxy(fs,{get(target,key){if(key==='link')return async(...args)=>{
   await fs.link(...args);if(uncertain)throw Object.assign(new Error('lost publication acknowledgement'),{code:'EIO'});
 };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const {owner,directory}=await setup(t,io),command=dto('lost-ack',0,2),before=views(owner);
 uncertain=true;await assert.rejects(owner.submit(command),{code:'SAVE_FAILED'});
 assert.deepEqual(views(owner),before);
 await assert.rejects(owner.submit(dto('must-not-fork',0,1)),{code:'INVALID_SERVICE_COMMIT'});
 await owner.close();
 const restored=await createRuntimeOwner({directory,writable:true});t.after(()=>restored.close());
 assert.equal(restored.getSnapshot().revision,2);
 const names=await fs.readdir(directory),receipt=await restored.submit(command);
 assert.equal(receipt.toRevision,2);assert.deepEqual(await fs.readdir(directory),names);
 await restored.submit(dto('continue-after-recovery',2,1));assert.equal(restored.getSnapshot().tick,3);
});

test('campaign live writer requires the latest audited durable head and releases its realpath claim on close', async t => {
  const { root, directory, owner } = await setup(t);
  const r0 = await loadRuntimeServiceCommit(path.join(directory, 'service-commit-r0.json'));
  const lock = path.join(directory, '.runtime-owner.lock'), token = await fs.readFile(lock, 'utf8');
  await assert.rejects(createCampaignLiveWriter(r0, path.join(root, '.', 'world'), token), error => error.code === 'OWNER_BUSY');

  await owner.submit(dto('factory-advance', 0, 2));
  assert.equal(owner.getSnapshot().revision, 2);
  await owner.close();
  let lockCreated = false, writer;
  try {
    await fs.writeFile(lock, token, { flag: 'wx' });
    lockCreated = true;
    await assert.rejects(createCampaignLiveWriter(r0, directory, token), error => error.code === 'INVALID_SERVICE_COMMIT');
    const r2 = await loadRuntimeServiceCommit(path.join(directory, 'service-commit-r2.json'));
    writer = await createCampaignLiveWriter(r2, directory, token);
    await assert.rejects(createCampaignLiveWriter(r2, path.join(root, 'world'), token), error => error.code === 'OWNER_BUSY');
    await writer.close();
    await assert.rejects(writer.submit(dto('closed-writer', 2)), error => error.code === 'OWNER_CLOSED');
    const replacement=await createCampaignLiveWriter(r2,directory,token);
    await writer.close();
    await assert.rejects(createCampaignLiveWriter(r2,directory,token),{code:'OWNER_BUSY'});
    await replacement.close();
  } finally {
    if (writer) await writer.close();
    if (lockCreated) await fs.unlink(lock);
  }
});

test('independent owners cannot exchange projections or forged candidate authority', async t => {
  const a = await setup(t, fs, 42), b = await setup(t, fs, 43);
  const beforeA = views(a.owner), beforeB = views(b.owner);
  const certA = await loadRuntimeServiceCommit(path.join(a.directory, 'service-commit-r0.json'));
  const tokenB = await fs.readFile(path.join(b.directory, '.runtime-owner.lock'), 'utf8');

  await assert.rejects(createCampaignLiveWriter(a.owner.getSnapshot(), b.directory, tokenB), error => error.code === 'INVALID_SERVICE_COMMIT');
  await assert.rejects(createCampaignLiveWriter(certA, b.directory, tokenB), error => error.code === 'OWNER_BUSY');
  assert.throws(() => advanceAuditedServiceCommit(a.owner.getSnapshot(), dto('projection-parent', 0)));
  assert.throws(() => advanceAuditedServiceCommit(a.owner.getSnapshot().revision, dto('revision-parent', 0)));
  for (const field of ['candidate', 'trusted']) {
    assert.throws(() => advanceAuditedServiceCommit({ ...structuredClone(certA), [field]: true }, dto(`forged-${field}`, 0)));
    assert.throws(() => advanceAuditedServiceCommit(certA, { ...dto(`forged-dto-${field}`, 0), [field]: true }));
  }

  assert.deepEqual(views(a.owner), beforeA);
  assert.deepEqual(views(b.owner), beforeB);
  await a.owner.submit(dto('owner-a-still-live', 0));
  await b.owner.submit(dto('owner-b-still-live', 0));
  assert.equal(a.owner.getSnapshot().tick, 1);
  assert.equal(b.owner.getSnapshot().tick, 1);
});
