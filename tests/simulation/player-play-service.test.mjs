import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { parseCommandBytes,validateTimeCommandDto,validateServiceCommandDto,projectPlayerSnapshot,projectPublicSnapshot } from '../../runtime/service/http-contract.mjs';
import { validateServiceCommit,saveServiceCommit } from '../../runtime/service/service-commit.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';

const intent=(commandId,expectedRevision,type,payload)=>({version:2,commandId,expectedRevision,type,payload});
const bytes=dto=>Buffer.from(JSON.stringify(dto));
const fixture=async config=>{const {createPlayerPlayVillage}=await import('../../runtime/fixtures/player-play-village.mjs');return createPlayerPlayVillage(0,undefined,config);};
const execute=async(bundle,dto)=>{const {executePlayerIntent}=await import('../../runtime/core/player-intents.mjs');return executePlayerIntent(bundle,{commandId:dto.commandId,type:dto.type,payload:dto.payload});};
const time=(commandId,expectedRevision,ticks)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-runtime-play-service-'),base=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(base) && base.startsWith(prefix));await fs.rm(base,{recursive:true,force:true});});return base;}

test('D2C exact action DTO parser dispatches without weakening AdvanceTime',()=>{
  const dto=intent('travel',0,'PlayerTravel',{destination:'forest'});assert.deepEqual(parseCommandBytes(bytes(dto)),dto);
  assert.throws(()=>validateTimeCommandDto(dto),e=>e.code==='UNSUPPORTED_VERSION');
  for(const d of [intent('rest',0,'PlayerRest',{}),intent('buy',0,'PlayerBuy',{product:'food',quantity:10}),intent('sell',0,'PlayerSell',{product:'herbs',quantity:1})])
    assert.deepEqual(parseCommandBytes(bytes(d)),d);
  for(const mutate of [d=>d.actorId='actor-1',d=>d.payload.ticks=12,d=>d.payload.destination='village/forest',d=>d.version=3,d=>d.type='Travel']){
    const bad=structuredClone(dto);mutate(bad);assert.throws(()=>parseCommandBytes(bytes(bad)),e=>['INVALID_INPUT','UNSUPPORTED_VERSION'].includes(e.code));}
  for(const quantity of [0,11,1.5,-1])assert.throws(()=>parseCommandBytes(bytes(intent('buy',0,'PlayerBuy',{product:'food',quantity}))),e=>['INVALID_INPUT','LIMIT_EXCEEDED'].includes(e.code));
  assert.throws(()=>parseCommandBytes(bytes(intent('society-day-forged',0,'PlayerRest',{}))),e=>e.code==='INVALID_INPUT');
  let getters=0;assert.throws(()=>validateServiceCommandDto({...dto,get payload(){getters++;return {};}}),e=>e.code==='INVALID_INPUT');assert.equal(getters,0);
});

test('D2C explicit play profile is service3 with authority action descriptors',async t=>{
  const directory=path.join(await temporary(t),'world'),owner=await createRuntimeOwner({directory,profile:'player-play-village'});t.after(()=>owner.close());
  const player=owner.getPlayer();assert.equal(owner.playerActionsAvailable,true);assert.equal(player.self.identity.location,'village');
  assert.equal(player.actions.travelTicks,12);assert.equal(player.actions.restTicks,6);assert.equal(player.actions.tradeTicks,1);
  assert.equal(player.actions.maxQuantity,10);assert.equal(player.actions.canTrade,true);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory,'service-commit-r0.json'))).serviceFormatVersion,3);
});

test('D2C legacy profiles never acquire actions, reject action commands and retain original AdvanceTime receipts',async t=>{
  const base=await temporary(t);
  for(const profile of ['personality-neutral','player-village']){
    const directory=path.join(base,profile),owner=await createRuntimeOwner({directory,profile,writable:true});t.after(()=>owner.close());
    assert.equal(owner.playerActionsAvailable,false);if(owner.playerAvailable)assert.equal(Object.hasOwn(owner.getPlayer(),'actions'),false);
    const file=path.join(directory,'service-commit-r0.json'),before=await fs.readFile(file);
    await assert.rejects(owner.submit(intent('rest',0,'PlayerRest',{})),e=>e.code==='COMMAND_UNSUPPORTED');assert.deepEqual(await fs.readFile(file),before);
    const receipt=await owner.submit(time('hour',0,6));assert.deepEqual(receipt,{apiVersion:1,commandId:'hour',status:'committed',fromRevision:0,toRevision:6,tick:6});
    await owner.close();const restored=await createRuntimeOwner({directory});t.after(()=>restored.close());assert.equal(restored.playerActionsAvailable,false);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory,'service-commit-r6.json'))).serviceFormatVersion,profile==='player-village'?2:1);
  }
});

test('D2C format3 mixed action/time journal replays full core results and rejects tampering and wrong profile pairings',async()=>{
  const f=await fixture(),entries=[];let bundle=f.bundle;
  for(const dto of [intent('travel',0,'PlayerTravel',{destination:'forest'}),intent('rest',12,'PlayerRest',{}),
    intent('return',18,'PlayerTravel',{destination:'village'}),intent('buy',30,'PlayerBuy',{product:'food',quantity:1}),time('hour',31,6)]){
    const before=bundle;
    if(dto.version===2){const result=await execute(bundle,dto);bundle=result.bundle;entries.push({dto,receipt:{apiVersion:1,receiptVersion:2,commandId:dto.commandId,status:'committed',
      fromRevision:before.snapshot.revision,toRevision:bundle.snapshot.revision,tick:bundle.snapshot.tick,type:dto.type,outcome:result.outcome,result:result.result}});}
    else{const session=createSimulationSession(bundle,f.systems);session.advanceTicks(6);bundle=session.getBundle();entries.push({dto,receipt:{apiVersion:1,commandId:dto.commandId,status:'committed',fromRevision:31,toRevision:37,tick:37}});}
  }
  const envelope={serviceFormatVersion:3,anchor:f.bundle,commands:entries,bundle};validateServiceCommit(envelope);
  const bad=e=>{assert.throws(()=>validateServiceCommit(e));};
  for(const mutate of [e=>e.commands[0].receipt.outcome='rejected',e=>e.commands[3].receipt.result.unitPrice++,e=>e.commands[0].receipt.result.endTick++,
    e=>e.commands[0].dto.payload.destination='village',e=>e.commands.reverse(),e=>e.bundle.snapshot.world.playerModel.wallet++,e=>e.commands[0].receipt.extra=1]){
    const forged=structuredClone(envelope);mutate(forged);bad(forged);}
  for(const version of [1,2,4])bad({...envelope,serviceFormatVersion:version});
  for(const old of [createPersonalityNeutral().bundle,createPlayerVillage().bundle])bad({serviceFormatVersion:3,anchor:old,commands:[],bundle:old});
});

test('D2C real HTTP preflight422 is pure; travel/rest/buy/sell authority matches core and persisted IDs survive restart',async t=>{
  const directory=path.join(await temporary(t),'world'),f=await fixture();let server=await startRuntimeServer({directory,profile:'player-play-village',seed:0,port:0,writable:true});t.after(()=>server.close());
  const read=async route=>{const r=await fetch(server.url+route);assert.equal(r.status,200);return r.json();};
  const post=async dto=>{const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});return {status:r.status,body:await r.json()};};
  assert.equal((await read('/api/runtime/capabilities')).playerActionsAvailable,true);assert.deepEqual(await read('/api/runtime/player'),projectPlayerSnapshot(f.bundle));
  const initial=await fs.readFile(path.join(directory,'service-commit-r0.json'));
  assert.equal((await post(intent('same-place',0,'PlayerTravel',{destination:'village'}))).status,422);
  assert.deepEqual(await fs.readFile(path.join(directory,'service-commit-r0.json')),initial);
  let direct=f.bundle;const receipts=[];
  for(const [id,type,payload] of [['same-place','PlayerTravel',{destination:'forest'}],['rest','PlayerRest',{}],['home','PlayerTravel',{destination:'village'}],
    ['buy','PlayerBuy',{product:'food',quantity:1}],['sell','PlayerSell',{product:'herbs',quantity:1}]]){
    const dto=intent(id,direct.snapshot.revision,type,payload),expected=await execute(direct,dto),reply=await post(dto);assert.equal(reply.status,200);
    assert.equal(reply.body.receiptVersion,2);assert.equal(reply.body.type,type);assert.equal(reply.body.outcome,expected.outcome);assert.deepEqual(reply.body.result,expected.result);
    assert.equal(Object.keys(reply.body).length,10);direct=expected.bundle;receipts.push({dto,receipt:reply.body});
    assert.deepEqual(await read('/api/runtime/player'),projectPlayerSnapshot(direct));assert.deepEqual(await read('/api/runtime/snapshot'),projectPublicSnapshot(direct));
    assert.deepEqual((await post(dto)).body,reply.body);
    if(type==='PlayerTravel' && payload.destination==='forest'){
      const before=await fs.readFile(path.join(directory,'service-commit-r12.json'));assert.equal((await post(intent('forest-buy',12,'PlayerBuy',{product:'food',quantity:1}))).status,422);
      assert.deepEqual(await fs.readFile(path.join(directory,'service-commit-r12.json')),before);
    }
  }
  const finalFile=path.join(directory,`service-commit-r${direct.snapshot.revision}.json`),disk=await fs.readFile(finalFile);assert.deepEqual(JSON.parse(disk).bundle,direct);
  assert.equal((await post(intent('stale',0,'PlayerRest',{}))).status,409);
  await server.close();server=await startRuntimeServer({directory,port:0,writable:true});
  for(const entry of receipts)assert.deepEqual((await post(entry.dto)).body,entry.receipt);
  assert.deepEqual(await fs.readFile(finalFile),disk);assert.deepEqual(await read('/api/runtime/player'),projectPlayerSnapshot(direct));
});

test('D2C consumed-time rejection is committed once and its exact original receipt survives read-only restart',async t=>{
  const {defaultPlayerPlayConfig}=await import('../../runtime/core/player-intents.mjs'),config=defaultPlayerPlayConfig();
  config.society.actors.initialActors[3].health=50;config.society.actors.initialActors[3].hunger=400;config.society.player.initialFood=0;
  const f=await fixture(config),session=createSimulationSession(f.bundle,f.systems);session.advanceTicks(143);const anchor=session.getBundle();
  const directory=path.join(await temporary(t),'world');await saveServiceCommit({serviceFormatVersion:3,anchor,commands:[],bundle:anchor},directory);
  const owner=await createRuntimeOwner({directory,writable:true});t.after(()=>owner.close());const dto=intent('death-travel',143,'PlayerTravel',{destination:'forest'}),receipt=await owner.submit(dto);
  assert.equal(receipt.status,'committed');assert.equal(receipt.outcome,'rejected');assert.equal(receipt.toRevision,155);assert.deepEqual(receipt.result,{code:'RULE_REJECTED'});
  assert.equal(owner.getPlayer().self.identity.alive,false);assert.equal(owner.getPlayer().self.identity.location,'village');assert.deepEqual(await owner.submit(dto),receipt);
  await owner.close();const restored=await createRuntimeOwner({directory,writable:true});t.after(()=>restored.close());assert.deepEqual(await restored.submit(dto),receipt);
  assert.equal(restored.getSnapshot().revision,155);await restored.close();const readOnly=await createRuntimeOwner({directory});t.after(()=>readOnly.close());assert.equal(readOnly.getPlayer().revision,155);
});
