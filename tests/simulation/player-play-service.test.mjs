import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { parseCommandBytes,validateTimeCommandDto,validateServiceCommandDto,projectPlayerSnapshot,projectPublicSnapshot } from '../../runtime/service/http-contract.mjs';
import { validateServiceCommit,transitionServiceCommand } from '../../runtime/service/service-commit.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';

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
  const base=await temporary(t),directory=path.join(base,'world'),checkpoint=await saveCheckpoint(anchor,{directory:path.join(base,'source'),rulesVersion:anchor.snapshot.rulesVersion,systems:f.systems});
  let server=await startRuntimeServer({directory,checkpoint,writable:true,port:0});t.after(()=>server.close());
  const post=async dto=>{const reply=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});assert.equal(reply.status,200);return reply.json();};
  const player=async()=>{const reply=await fetch(server.url+'/api/runtime/player');assert.equal(reply.status,200);return reply.json();};
  const dto=intent('death-travel',143,'PlayerTravel',{destination:'forest'}),receipt=await post(dto);
  assert.equal(receipt.status,'committed');assert.equal(receipt.outcome,'rejected');assert.equal(receipt.toRevision,155);assert.deepEqual(receipt.result,{code:'RULE_REJECTED'});
  const dead=await player();assert.equal(dead.self.identity.alive,false);assert.equal(dead.self.identity.location,'village');assert.deepEqual(await post(dto),receipt);
  const disk=await fs.readFile(path.join(directory,'service-commit-r155.json'));
  await server.close();server=await startRuntimeServer({directory,writable:true,port:0});assert.deepEqual(await post(dto),receipt);
  assert.deepEqual(await fs.readFile(path.join(directory,'service-commit-r155.json')),disk);
  await server.close();server=await startRuntimeServer({directory,port:0});assert.equal((await player()).revision,155);
  const page=await pageHarness(anchor);assert.equal(page.valid(receipt,dto),true);
  page.setTransport(async(route)=>({ok:true,status:200,json:async()=>route.endsWith('commands')?receipt:route.endsWith('capabilities')?
    {apiVersion:1,writes:true,playerAvailable:true,playerActionsAvailable:true}:route.endsWith('player')?dead:projectPublicSnapshot(JSON.parse(disk).bundle)}));
  await page.submit(dto);assert.equal(page.pending(),null);assert.match(page.elements.get('command-status').textContent,/时间已推进，动作未完成/);
});

async function pageHarness(bundle){
  const elements=new Map(),make=()=>({textContent:'',hidden:false,disabled:false,value:'1',dataset:{},handlers:{},
    append(){},replaceChildren(){},addEventListener(type,fn){this.handlers[type]=fn;}});
  const document={documentElement:{dataset:{}},getElementById(id){if(!elements.has(id))elements.set(id,make());return elements.get(id);},createElement:make};
  let transport=async()=>{throw new Error('offline');};
  const context=vm.createContext({document,AbortSignal,crypto:{randomUUID:()=> 'same-intent'},fetch:(...args)=>transport(...args)});
  vm.runInContext(await fs.readFile(new URL('../../runtime-map.mjs',import.meta.url),'utf8'),context);await new Promise(resolve=>setImmediate(resolve));
  context.world=projectPublicSnapshot(bundle);context.player=projectPlayerSnapshot(bundle);
  vm.runInContext('last=world;lastPlayer=player;writable=true;actionsAvailable=true',context);
  return {context,elements,setTransport(fn){transport=fn;},valid(receipt,dto){context.receipt=receipt;context.dto=dto;return vm.runInContext('validReceipt(receipt,dto)',context);},
    async submit(dto){context.dto=dto;await vm.runInContext('submitIntent(dto)',context);},pending(){return vm.runInContext('pending',context);}};
}

test('D2C page validates real action receipts against the original intent and rejects damaged 200 confirmations',async()=>{
  const f=await fixture(),page=await pageHarness(f.bundle);
  for(const dto of [intent('travel',0,'PlayerTravel',{destination:'forest'}),intent('rest',0,'PlayerRest',{}),
    intent('buy',0,'PlayerBuy',{product:'food',quantity:1}),intent('sell',0,'PlayerSell',{product:'herbs',quantity:1})]){
    const {receipt}=transitionServiceCommand(f.bundle,dto);assert.equal(page.valid(receipt,dto),true);
    const wrongDuration=structuredClone(receipt);wrongDuration.toRevision++;wrongDuration.tick++;wrongDuration.result.endTick++;
    assert.equal(page.valid(wrongDuration,dto),false,'wrong duration cannot confirm an intent');
    if(dto.type==='PlayerTravel'){const bad=structuredClone(receipt);bad.result.after.location='village';assert.equal(page.valid(bad,dto),false);}
    if(['PlayerBuy','PlayerSell'].includes(dto.type))for(const mutate of [r=>r.result.product=r.result.product==='food'?'herbs':'food',
      r=>{r.result.quantity++;r.result.amount=r.result.quantity*r.result.unitPrice;},r=>r.result.amount++]){
      const bad=structuredClone(receipt);mutate(bad);assert.equal(page.valid(bad,dto),false);
    }
    else for(const key of ['quantity','unitPrice','amount']){const bad=structuredClone(receipt);bad.result[key]=1;assert.equal(page.valid(bad,dto),false);}
  }
  const travel=intent('lost',0,'PlayerTravel',{destination:'forest'}),valid=transitionServiceCommand(f.bundle,travel).receipt;
  for(const malformed of [null,[],{...valid,type:'PlayerRest'}, {...valid,toRevision:13,tick:13}])assert.equal(page.valid(malformed,travel),false);
  const rejected={...valid,outcome:'rejected',result:{code:'RULE_REJECTED'}};assert.equal(page.valid(rejected,travel),true);
  assert.equal(page.valid({...rejected,toRevision:13,tick:13},travel),false);
  page.setTransport(async()=>({ok:true,status:200,json:async()=>({...valid,toRevision:13,tick:13})}));await page.submit(travel);
  assert.deepEqual(JSON.parse(JSON.stringify(page.pending())),travel);assert.match(page.elements.get('command-status').textContent,/尚未确认/);
});

test('D2C page preserves original IDs on uncertain responses and releases non-JSON permanent rejection including422',async()=>{
  const f=await fixture(),page=await pageHarness(f.bundle),dto=intent('unknown',0,'PlayerRest',{}),sent=[];
  page.setTransport(async(route,options)=>{sent.push(JSON.parse(options.body));return {ok:false,status:502,json:async()=>{throw new Error('non-JSON');}};});
  await page.submit(dto);await page.submit(intent('new-id',0,'PlayerTravel',{destination:'forest'}));assert.deepEqual(sent,[dto,dto]);
  for(const status of [422,400,405,413,415]){
    page.setTransport(async()=>({ok:false,status,json:async()=>{throw new Error('non-JSON');}}));await page.submit(dto);assert.equal(page.pending(),null);
  }
});

test('D2C explicit audited play checkpoint initializes a fresh service3 without altering the source',async t=>{
  const base=await temporary(t),f=await fixture(),session=createSimulationSession(f.bundle,f.systems);session.advanceTicks(143);const anchor=session.getBundle();
  const file=await saveCheckpoint(anchor,{directory:path.join(base,'source'),rulesVersion:anchor.snapshot.rulesVersion,systems:f.systems}),before=await fs.readFile(file);
  const directory=path.join(base,'runtime'),owner=await createRuntimeOwner({directory,checkpoint:file,writable:true});t.after(()=>owner.close());
  assert.equal(owner.getSnapshot().revision,143);assert.equal(owner.playerActionsAvailable,true);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory,'service-commit-r143.json'))).serviceFormatVersion,3);
  assert.deepEqual(owner.getPlayer(),projectPlayerSnapshot(anchor));assert.deepEqual(await fs.readFile(file),before);
  await assert.rejects(createRuntimeOwner({directory:path.join(base,'mutually-exclusive'),checkpoint:file,profile:'player-play-village'}),e=>e.code==='INVALID_INPUT');
  for(const [name,mutate,code] of [['unknown',e=>e.snapshot.fixtureId='not-registered','UNSUPPORTED_VERSION'],
    ['format',e=>e.formatVersion=2,'UNSUPPORTED_VERSION'],['extra',e=>e.extra=true,'INVALID_CHECKPOINT'],
    ['asset',e=>e.snapshot.world.playerModel.wallet++,'INVALID_CHECKPOINT']]){
    const bad=JSON.parse(before);mutate(bad);const source=path.join(base,name+'.json');await fs.writeFile(source,JSON.stringify(bad));
    await assert.rejects(createRuntimeOwner({directory:path.join(base,'bad-'+name),checkpoint:source}),e=>e.code===code);
  }
});
