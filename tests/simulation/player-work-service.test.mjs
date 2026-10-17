import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRuntimeOwner} from '../../runtime/service/runtime-owner.mjs';
import {validateSceneCommandDto,parseSceneCommandBytes} from '../../runtime/service/http-contract.mjs';
const views=o=>({snapshot:o.getSnapshot(),player:o.getPlayer(),mind:o.getMindInspector(),encounter:o.getEncounter(),scene:o.getScene(),activity:o.getActivity()});
const dto=(o,id,type='PlayerWork',payload={})=>({version:4,commandId:id,expectedRevision:o.getSnapshot().revision,type,payload});

test('D4E9-S1 explicit DTO4 parsing rejects injected wages/accessors and wrong versions before submission',()=>{
 const valid={version:4,commandId:'work',expectedRevision:0,type:'PlayerWork',payload:{}};assert.deepEqual(validateSceneCommandDto(valid,4),valid);assert.deepEqual(parseSceneCommandBytes(Buffer.from(JSON.stringify(valid)),4),valid);
 assert.throws(()=>validateSceneCommandDto(valid),{code:'UNSUPPORTED_VERSION'});assert.throws(()=>validateSceneCommandDto({...valid,version:3},4),{code:'UNSUPPORTED_VERSION'});
 for(const payload of [{wage:20},{durationTicks:1},{actorId:'actor-1'},{startTick:0}])assert.throws(()=>validateSceneCommandDto({...valid,payload},4));
 let getters=0;const invalid={...valid,payload:{get wage(){getters++;return 20;}}};assert.throws(()=>validateSceneCommandDto(invalid,4));assert.equal(getters,0);
});

test('D4E9-S2 durable failure rolls back whole work; retry/reopen idempotence and latest tamper fail closed',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'d4e9-work-publish-')),directory=path.join(root,'world');let owner,fail=false;
 const io=new Proxy(fs,{get(target,key){if(key==='link')return async(...args)=>{if(fail)throw Object.assign(new Error('injected publish failure'),{code:'EACCES'});return target.link(...args);};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
 try{
  owner=await createRuntimeOwner({directory,profile:'scene-livelihood-village',seed:42,writable:true,inspectActivity:true},io);assert.equal(owner.commandDtoVersion,4);assert.equal(owner.playerWorkAvailable,true);
  const command=dto(owner,'work'),before=views(owner),names=(await fs.readdir(directory)).sort(),bytes=await Promise.all(names.map(n=>fs.readFile(path.join(directory,n))));
  assert.deepEqual(before.player.actions.work,{wage:20,durationTicks:36,fatigueCost:150,nextWorkTick:null});fail=true;await assert.rejects(owner.submit(command),{code:'SAVE_FAILED'});assert.deepEqual(views(owner),before);assert.deepEqual((await fs.readdir(directory)).sort(),names);for(let i=0;i<names.length;i++)assert.deepEqual(await fs.readFile(path.join(directory,names[i])),bytes[i]);
  fail=false;const receipt=await owner.submit(command),after=views(owner);assert.equal(receipt.outcome,'succeeded');assert.equal(after.player.self.wallet,20);assert.equal(after.player.actions.work.nextWorkTick,144);assert.equal(after.activity.entries.filter(e=>e.kind==='player-action').length,1);assert.equal(after.activity.entries.find(e=>e.kind==='player-action').location,'village');
  assert.deepEqual(await owner.submit(command),receipt);await assert.rejects(owner.submit({...command,expectedRevision:36}),{code:'COMMAND_ID_CONFLICT'});await owner.close();owner=null;
  owner=await createRuntimeOwner({directory,writable:true,inspectActivity:true});assert.deepEqual(views(owner),after);assert.deepEqual(await owner.submit(command),receipt);const all=await fs.readdir(directory);const official=all.filter(n=>n.startsWith('service-commit'));assert.equal(official.length,2);const file=path.join(directory,'service-commit-r36.json'),envelope=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(envelope.serviceFormatVersion,10);assert.equal(envelope.bundle.snapshot.world.playerModel.ledger.workCount,1);
  await owner.close();owner=null;envelope.bundle.snapshot.world.playerModel.lastWorkStartTick=1;await fs.writeFile(file,JSON.stringify(envelope));await assert.rejects(createRuntimeOwner({directory,writable:true}),{code:'INVALID_SERVICE_COMMIT'});assert.equal((await fs.readdir(directory)).includes('.runtime-owner.lock'),false,'failed restore releases ownership');
 }finally{if(owner)await owner.close();await fs.rm(root,{recursive:true,force:true});}
});

test('D4E9-S3 DTO4 gift, travel, encounter, busy refusal, attack, cancel, return, rest and sell keep dispatch semantics',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'d4e9-work-dispatch-'));let owner;
 try{
  owner=await createRuntimeOwner({directory:path.join(root,'world'),profile:'scene-livelihood-village',writable:true,inspectActivity:true});
  const send=async(id,type,payload={})=>{const r=await owner.submit(dto(owner,id,type,payload));assert.equal(r.receiptVersion,4);return r;};
  assert.equal((await send('gift','PlayerGiftFood',{recipientId:'actor-2'})).outcome,'succeeded');assert.equal(owner.getPlayer().self.inventory.food,19);
  assert.equal((await send('forest','PlayerTravel',{destination:'forest'})).durationTicks,12);assert.equal((await send('begin','EncounterBegin')).outcome,'succeeded');const encounterId=owner.getEncounter().encounter.encounterId;assert.ok(owner.getEncounter().actions.blockedWorldActions.includes('PlayerWork'));
  const busy=await send('busy','PlayerWork');assert.equal(busy.outcome,'rejected');assert.equal(busy.result.code,'ENCOUNTER_BUSY');assert.equal(busy.durationTicks,0);
  const hit=await send('attack','EncounterAction',{encounterId,action:'attack'});assert.equal(hit.outcome,'succeeded');assert.equal(owner.getEncounter().encounter.wolfHealth,150);assert.equal(owner.getPlayer().self.health,920);
  assert.equal((await send('cancel','EncounterCancel',{encounterId})).outcome,'succeeded');assert.equal((await send('home','PlayerTravel',{destination:'village'})).outcome,'succeeded');assert.equal((await send('rest','PlayerRest')).durationTicks,6);assert.equal((await send('sell','PlayerSell',{product:'food',quantity:1})).outcome,'succeeded');assert.equal(owner.getPlayer().self.wallet,5);assert.equal(owner.getSnapshot().tick,37);assert.equal(owner.getPlayer().actions.work.nextWorkTick,null);
 }finally{if(owner)await owner.close();await fs.rm(root,{recursive:true,force:true});}
});
