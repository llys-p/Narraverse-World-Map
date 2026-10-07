import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { loadServiceCommit,validateServiceCommit } from '../../runtime/service/service-commit.mjs';
import { PLAY_RULES,defaultPlayerPlayConfig,executePlayerIntent } from '../../runtime/core/player-intents.mjs';
import { createPlayerPlayVillage,playerPlaySystems } from '../../runtime/fixtures/player-play-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const dto=(commandId,type,payload={},expectedRevision=0)=>({version:2,commandId,expectedRevision,type,payload});
const time=(commandId,expectedRevision,ticks)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-play-http-independent-'),d=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(d)&&d.startsWith(prefix));await fs.rm(d,{recursive:true,force:true});});return d;}
async function get(url,route){const r=await fetch(url+route);return {status:r.status,body:await r.json()};}
async function post(url,d){const r=await fetch(url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});return {status:r.status,body:await r.json()};}
async function bytes(d){return Promise.all((await fs.readdir(d)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,await fs.readFile(path.join(d,f),'utf8')]));}
const bad=e=>['INVALID_INPUT','INVALID_SERVICE_COMMIT','UNSUPPORTED_VERSION'].includes(e.code);

test('D2C independent real HTTP: one travel receipt, same-revision conflict, actual rest and full world equal authoritative core',async t=>{
  const directory=path.join(await temporary(t),'world'),s=await startRuntimeServer({directory,port:0,profile:'player-play-village',writable:true});t.after(()=>s.close());
  assert.equal((await get(s.url,'/api/runtime/capabilities')).body.playerActionsAvailable,true);
  const requests=[dto('out','PlayerTravel',{destination:'forest'}),dto('competing','PlayerTravel',{destination:'forest'})],pair=await Promise.all(requests.map(d=>post(s.url,d)));
  assert.deepEqual(pair.map(x=>x.status).sort(),[200,409]);const winner=pair.findIndex(x=>x.status===200),out=requests[winner],receipt=pair[winner].body;
  assert.deepEqual(Object.keys(receipt).sort(),['apiVersion','commandId','fromRevision','outcome','receiptVersion','result','status','tick','toRevision','type']);
  assert.equal(receipt.receiptVersion,2);assert.equal(receipt.status,'committed');assert.equal(receipt.outcome,'succeeded');assert.equal(receipt.toRevision,12);
  const disk=await loadServiceCommit(path.join(directory,'service-commit-r12.json'));assert.equal(disk.serviceFormatVersion,3);
  const direct=executePlayerIntent(createPlayerPlayVillage().bundle,{commandId:out.commandId,type:'PlayerTravel',payload:{destination:'forest'}});
  assert.deepEqual(disk.bundle,direct.bundle);assert.deepEqual(receipt.result,direct.result);
  const player=(await get(s.url,'/api/runtime/player')).body;assert.equal(player.self.identity.location,'forest');assert.equal(player.self.fatigue,100);
  assert.deepEqual(player.actions,{travelTicks:12,restTicks:6,tradeTicks:1,maxQuantity:10,locations:['village','forest'],prices:{food:{buy:10,sell:5},herbs:{buy:50,sell:25}},canTrade:false});
  assert.equal((await post(s.url,dto('rest','PlayerRest',{},12))).body.toRevision,18);
  assert.equal((await get(s.url,'/api/runtime/player')).body.self.fatigue,0);await s.close();
  const restored=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>restored.close());const before=await bytes(directory);
  assert.deepEqual(await post(restored.url,out),pair[winner]);assert.equal((await get(restored.url,'/api/runtime/player')).body.revision,18);assert.deepEqual(await bytes(directory),before);
  assert.equal((await post(restored.url,{...out,payload:{destination:'village'}})).body.error.code,'COMMAND_ID_CONFLICT');
});

test('D2C independent rejected-after-duration receipt survives disk restart and same ID cannot rerun death or time',async t=>{
  const root=await temporary(t),c=defaultPlayerPlayConfig();c.society.player.initialFood=0;c.society.actors.initialActors[3].health=1;c.society.actors.initialActors[3].hunger=1000;
  const f=createPlayerPlayVillage(42,'player-play-village',c),session=createSimulationSession(f.bundle,f.systems);session.advanceTicks(143);
  const checkpoint=await saveCheckpoint(session.getBundle(),{directory:path.join(root,'anchor'),rulesVersion:PLAY_RULES,systems:playerPlaySystems()});
  const directory=path.join(root,'world'),s=await startRuntimeServer({directory,port:0,checkpoint,writable:true});t.after(()=>s.close());
  const command=dto('fatal','PlayerTravel',{destination:'forest'},143),r=await post(s.url,command);
  assert.equal(r.status,200);assert.equal(r.body.status,'committed');assert.equal(r.body.outcome,'rejected');assert.equal(r.body.toRevision,155);assert.deepEqual(r.body.result,{code:'RULE_REJECTED'});
  const p=(await get(s.url,'/api/runtime/player')).body;assert.equal(p.self.identity.alive,false);assert.equal(p.self.identity.location,'village');assert.equal(p.self.wallet,100);
  await s.close();const restored=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>restored.close());const before=await bytes(directory);
  assert.deepEqual(await post(restored.url,command),r);assert.deepEqual(await bytes(directory),before);assert.equal((await get(restored.url,'/api/runtime/player')).body.tick,155);
});

test('D2C independent entry rejects422 and strict DTO rejects400, both pure; old profiles explicitly reject new command version',async t=>{
  const root=await temporary(t),directory=path.join(root,'play'),s=await startRuntimeServer({directory,port:0,profile:'player-play-village',writable:true});t.after(()=>s.close());
  const before=await bytes(directory);
  for(const d of [dto('same','PlayerTravel',{destination:'village'}),dto('too-expensive','PlayerBuy',{product:'herbs',quantity:10})])assert.equal((await post(s.url,d)).status,422);
  for(const d of [{...dto('actor','PlayerRest'),actorId:'actor-2'},dto('price','PlayerBuy',{product:'food',quantity:1,price:1}),
    dto('partial','PlayerBuy',{product:'food',quantity:0.5}),dto('ten-plus','PlayerSell',{product:'food',quantity:11}),
    dto('target','PlayerRest',{startTick:0,targetTick:0}),dto('society-day-1-actor-1','PlayerRest'),{...dto('version','PlayerRest'),version:1}])assert.equal((await post(s.url,d)).status,400);
  assert.deepEqual(await bytes(directory),before);assert.equal((await post(s.url,time('after',0,1))).status,200);
  const legacy=await startRuntimeServer({directory:path.join(root,'legacy'),port:0,profile:'player-village',writable:true});t.after(()=>legacy.close());
  assert.equal((await get(legacy.url,'/api/runtime/capabilities')).body.playerActionsAvailable,false);
  const refusal=await post(legacy.url,dto('old-profile','PlayerRest'));assert.equal(refusal.status,400);assert.equal(refusal.body.error.code,'COMMAND_UNSUPPORTED');
  assert.equal(Object.hasOwn((await get(legacy.url,'/api/runtime/player')).body,'actions'),false);
});

test('D2C independent publication failure: no candidate location/time or player DTO leaks before durable world+receipt',async t=>{
  const directory=path.join(await temporary(t),'world');let fail=true;
  const io={...fs,async link(from,to){if(fail&&to.endsWith('service-commit-r12.json'))throw Object.assign(new Error('controlled test write failure'),{code:'EIO'});return fs.link(from,to);}};
  const owner=await createRuntimeOwner({directory,profile:'player-play-village',writable:true},io);t.after(()=>owner.close());
  const publicBefore=owner.getSnapshot(),playerBefore=owner.getPlayer(),diskBefore=await bytes(directory),command=dto('failed-save','PlayerTravel',{destination:'forest'});
  await assert.rejects(owner.submit(command),e=>e.code==='SAVE_FAILED');assert.deepEqual(owner.getSnapshot(),publicBefore);assert.deepEqual(owner.getPlayer(),playerBefore);assert.deepEqual(await bytes(directory),diskBefore);
  fail=false;const receipt=await owner.submit(command);assert.equal(receipt.outcome,'succeeded');assert.equal(owner.getPlayer().self.identity.location,'forest');
  assert.equal(owner.getSnapshot().revision,12);assert.equal(owner.getPlayer().revision,12);
});

test('D2C independent journal replay rejects forged action/result/price/receipt/order and corrupt latest never rolls back',async t=>{
  const directory=path.join(await temporary(t),'world'),s=await startRuntimeServer({directory,port:0,profile:'player-play-village',writable:true});t.after(()=>s.close());
  assert.equal((await post(s.url,dto('buy','PlayerBuy',{product:'food',quantity:1}))).status,200);
  assert.equal((await post(s.url,dto('sell','PlayerSell',{product:'food',quantity:1},1))).status,200);await s.close();
  const file=path.join(directory,'service-commit-r2.json'),good=await loadServiceCommit(file);
  for(const mutate of [x=>x.commands[0].receipt.result.unitPrice++,x=>x.commands[0].receipt.result.startTick++,
    x=>x.commands[0].receipt.result.endTick++,x=>x.commands[0].dto.payload.quantity++,x=>x.commands.reverse(),x=>x.serviceFormatVersion=2,
    x=>x.bundle.snapshot.commandReceipts.buy.result.amount++]){const corrupt=structuredClone(good);mutate(corrupt);assert.throws(()=>validateServiceCommit(corrupt),bad);}
  const corrupt=structuredClone(good);corrupt.commands[0].receipt.outcome='rejected';await fs.writeFile(file,JSON.stringify(corrupt));
  await assert.rejects(createRuntimeOwner({directory}),bad);assert.deepEqual(await fs.readFile(file,'utf8'),JSON.stringify(corrupt));assert.ok((await fs.readdir(directory)).includes('service-commit-r0.json'));
});
