import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function oneDayBundle() {
  const {createSceneVillage} = await import('../../runtime/fixtures/scene-survival-village.mjs');
  const {executeSceneIntent} = await import('../../runtime/core/scene-runtime.mjs');
  const {createSimulationSession} = await import('../../runtime/core/command-engine.mjs');
  const fixture = createSceneVillage(42, 'world-activity-test');
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  let bundle = session.getBundle();
  const run = (type,payload,commandId) => {
    const out = executeSceneIntent(bundle,{version:3,commandId,expectedRevision:bundle.snapshot.revision,type,payload});
    bundle = out.bundle;
    return out.receipt;
  };
  run('PlayerTravel',{destination:'forest'},'activity-travel-forest');
  const begin = run('EncounterBegin',{},'activity-encounter-begin');
  const encounterId = begin.result?.encounterId ?? bundle.snapshot.world.encounterModel.encounter.encounterId;
  run('EncounterAction',{encounterId,action:'attack'},'activity-encounter-attack');
  run('EncounterAction',{encounterId,action:'flee'},'activity-encounter-flee');
  run('PlayerTravel',{destination:'village'},'activity-travel-village');
  run('PlayerBuy',{product:'food',quantity:1},'activity-buy-food');
  run('EncounterAction',{encounterId:'missing-encounter',action:'attack'},'activity-rejected-encounter');
  run('AdvanceTime',{ticks:1},'activity-advance-one');
  const endOfDay = createSimulationSession(bundle,fixture.systems);
  endOfDay.advanceTicks(144 - bundle.snapshot.tick);
  return endOfDay.getBundle();
}

test('D4E4 projection is a deterministic, bounded, redacted timeline from committed scene facts', async () => {
  const {projectWorldActivity} = await import('../../runtime/service/world-activity.mjs');
  const bundle = await oneDayBundle();
  const view = projectWorldActivity(bundle);
  assert.deepEqual(Object.keys(view).sort(), ['apiVersion','activityViewVersion','perspective','simulationId','revision','tick','actors','window','entries'].sort());
  assert.equal(view.apiVersion, 1);
  assert.equal(view.activityViewVersion, 1);
  assert.equal(view.perspective, 'developer-world');
  assert.equal(view.revision, bundle.snapshot.revision);
  assert.equal(view.tick, bundle.snapshot.tick);
  assert.ok(view.entries.length > 0);
  assert.ok(view.entries.every(entry => Object.keys(entry).sort().join('|') ===
    ['activityId','sourceEventSeq','sourceItemIndex','tick','actorIds','location','locationEvidence','kind','status','summary'].sort().join('|')));
  assert.ok(view.entries.every((entry, index) => index === 0 ||
    view.entries[index - 1].sourceEventSeq < entry.sourceEventSeq ||
    (view.entries[index - 1].sourceEventSeq === entry.sourceEventSeq && view.entries[index - 1].sourceItemIndex < entry.sourceItemIndex)));
  assert.equal(new Set(view.entries.map(entry => entry.activityId)).size, view.entries.length);
  assert.ok(view.entries.some(entry => entry.kind === 'npc-action' && entry.status === 'succeeded'));
  assert.ok(view.entries.some(entry => entry.kind === 'npc-action' && entry.status === 'no-action' && entry.summary.includes('未行动')));
  const playerRows = view.entries.filter(entry => entry.kind === 'player-action');
  assert.ok(playerRows.some(entry => entry.summary.includes('村庄→森林')));
  assert.ok(playerRows.some(entry => entry.summary.includes('攻击') && entry.summary.includes('健康') && entry.summary.includes('狼血')));
  assert.ok(playerRows.some(entry => entry.summary.includes('逃跑')));
  const tradeRow = playerRows.find(entry => entry.summary.includes('买入') || entry.summary.includes('卖出'));
  assert.ok(tradeRow && (tradeRow.status === 'rejected' ? tradeRow.summary.includes('已拒绝') :
    tradeRow.status === 'succeeded' && tradeRow.summary.includes('口粮1份')));
  assert.ok(playerRows.some(entry => entry.summary.includes('tick')));
  assert.ok(playerRows.some(entry => entry.status === 'rejected' && entry.location === null && entry.summary.includes('已拒绝')));
  assert.ok(view.entries.some(entry => entry.kind === 'daily-person'));
  for (const actorId of ['actor-1','actor-2','actor-3'])
    assert.ok(view.entries.some(entry => entry.kind === 'daily-person' && entry.actorIds.includes(actorId)), `daily row for ${actorId}`);
  const wolfRow = view.entries.find(entry => entry.kind === 'daily-population' && entry.summary.startsWith('狼群'));
  assert.ok(wolfRow);
  assert.ok(wolfRow.summary.includes('总数') && wolfRow.summary.includes('可用') && wolfRow.summary.includes('保留'));
  assert.ok(view.entries.every(entry => ['village','forest',null].includes(entry.location)));
  const serialized = JSON.stringify(view);
  for (const forbidden of ['observer','inputHistory','privateFood','communalGold','failureOwner','receiptVersion','commandId','payload','wallet'])
    assert.equal(serialized.includes(forbidden), false, `projection omits ${forbidden}`);
  assert.ok(view.window.maxSourceEvents <= 256);
  assert.ok(view.entries.length <= 64);
  assert.ok(Buffer.byteLength(serialized) <= 65536);
});

test('D4E4 owner and HTTP activity projection are opt-in, revision-coherent, detached, read-only, and durable', async () => {
  const {createRuntimeOwner} = await import('../../runtime/service/runtime-owner.mjs');
  const {startRuntimeServer} = await import('../../runtime-server.mjs');
  const tempRoot = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, 'd4e4-world-activity-'));
  const resolvedRoot = path.resolve(root);
  let owner, server, reopened;
  try {
    assert.equal(path.dirname(resolvedRoot).toLowerCase(), tempRoot.toLowerCase(), 'cleanup root remains under os.tmpdir');
    assert.ok(path.basename(resolvedRoot).toLowerCase().startsWith('d4e4-world-activity-'), 'cleanup root has this task prefix');
    owner = await createRuntimeOwner({directory:path.join(root,'owner'),profile:'scene-survival-village',seed:42,writable:true});
    assert.equal(owner.activityAvailable, undefined);
    assert.equal(typeof owner.getActivity, 'undefined');
    await owner.close(); owner = null;

    server = await startRuntimeServer({directory:path.join(root,'http-default'),profile:'scene-survival-village',seed:42,port:0,writable:true});
    const legacyCaps = await (await fetch(`${server.url}/api/runtime/capabilities`)).json();
    assert.equal(Object.hasOwn(legacyCaps,'activityAvailable'), false);
    assert.equal((await fetch(`${server.url}/api/runtime/activities`)).status, 404);
    await server.close(); server = null;

    const directory = path.join(root,'enabled');
    let links = 0, failLink = false;
    const io = new Proxy(fs, {get(target,key) {
      if (key === 'link') return async (...args) => { links++; if (failLink && links === 2) { failLink=false; throw Object.assign(new Error('injected EIO'),{code:'EIO'}); } return target.link(...args); };
      const value = Reflect.get(target,key,target); return typeof value === 'function' ? value.bind(target) : value;
    }});
    owner = await createRuntimeOwner({directory,profile:'scene-survival-village',seed:42,writable:true,inspectActivity:true},io);
    assert.equal(owner.activityAvailable, true);
    const before = owner.getActivity(), detached = owner.getActivity(); detached.entries.length = 0;
    assert.deepEqual(owner.getActivity(),before);
    const dto = {version:3,commandId:'activity-time-one',expectedRevision:0,type:'AdvanceTime',payload:{ticks:1}};
    failLink = true;
    await assert.rejects(owner.submit(dto),error => error.code === 'SAVE_FAILED');
    assert.equal(owner.getSnapshot().revision,0);
    assert.deepEqual(owner.getActivity(),before);
    const receipt = await owner.submit(dto);
    assert.equal(receipt.status,'committed');
    assert.equal(owner.getActivity().revision,owner.getSnapshot().revision);
    const saved = owner.getActivity();
    await owner.close(); owner=null;
    reopened = await createRuntimeOwner({directory,writable:true,inspectActivity:true});
    assert.deepEqual(reopened.getActivity(),saved);
    assert.equal(reopened.getActivity().tick,reopened.getSnapshot().tick);
    await reopened.close(); reopened=null;

    server = await startRuntimeServer({directory:path.join(root,'http-enabled'),profile:'scene-survival-village',seed:42,port:0,writable:true,inspectActivity:true});
    const caps = await (await fetch(`${server.url}/api/runtime/capabilities`)).json();
    assert.equal(caps.activityAvailable,true);
    const [snapshot,activity] = await Promise.all([
      fetch(`${server.url}/api/runtime/snapshot`).then(r=>r.json()),fetch(`${server.url}/api/runtime/activities`).then(r=>r.json())]);
    assert.equal(activity.simulationId,snapshot.simulationId);
    assert.equal(activity.revision,snapshot.revision);
    assert.equal(activity.tick,snapshot.tick);
    const head = await fetch(`${server.url}/api/runtime/activities`,{method:'HEAD'});
    assert.equal(head.status,200); assert.equal(await head.text(),'');
    assert.equal((await fetch(`${server.url}/api/runtime/activities?private=true`)).status,400);
    assert.equal((await fetch(`${server.url}/api/runtime/activities`,{method:'POST'})).status,405);
    const after = await (await fetch(`${server.url}/api/runtime/snapshot`)).json();
    assert.deepEqual(after,snapshot);
  } finally {
    if (owner) await owner.close(); if (reopened) await reopened.close(); if (server) await server.close();
    await fs.rm(root,{recursive:true,force:true});
  }
});
