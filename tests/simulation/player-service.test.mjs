import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { validateServiceCommit } from '../../runtime/service/service-commit.mjs';
import { projectPlayerSnapshot,projectPublicSnapshot } from '../../runtime/service/http-contract.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';

async function temporary(t){
  const prefix=path.join(os.tmpdir(),'world-runtime-player-service-'),base=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(base) && base.startsWith(prefix));await fs.rm(base,{recursive:true,force:true});});return base;
}
const time=(commandId,expectedRevision,ticks)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
const fixture=async()=>{const {createPlayerVillage}=await import('../../runtime/fixtures/player-village.mjs');return createPlayerVillage(0);};
const rejection=e=>['INVALID_INPUT','UNSUPPORTED_VERSION','INVALID_SERVICE_COMMIT'].includes(e.code);

test('D2B explicit player profile initializes service format 2 even when read only; reads copy the actual player',async t=>{
  const directory=path.join(await temporary(t),'world'),owner=await createRuntimeOwner({directory,profile:'player-village',seed:0});
  t.after(()=>owner.close());const world=owner.getSnapshot(),player=owner.getPlayer();
  assert.deepEqual(world.population,{namedAlive:4,unnamedAlive:76,totalAlive:80,deer:120,wolves:14});
  assert.equal(player.self.identity.actorId,'actor-4');assert.equal(player.self.identity.deathTick,null);
  assert.equal(player.self.wallet,100);assert.deepEqual(player.self.inventory,{food:3,herbs:1});
  assert.equal(player.revision,world.revision);assert.equal(player.simulationId,world.simulationId);
  const file=path.join(directory,'service-commit-r0.json'),before=await fs.readFile(file);
  const envelope=JSON.parse(before);assert.equal(envelope.serviceFormatVersion,2);assert.deepEqual(envelope.commands,[]);
  player.self.wallet=0;world.actors[0].name='changed';assert.equal(owner.getPlayer().self.wallet,100);
  await assert.rejects(owner.submit(time('read-only',0,144)),e=>e.code==='WRITE_DISABLED');
  assert.deepEqual(await fs.readFile(file),before);await owner.close();
  const restored=await createRuntimeOwner({directory});t.after(()=>restored.close());
  assert.deepEqual(restored.getPlayer(),{...player,self:{...player.self,wallet:100}});
});

test('D2B profile is explicit, mutually exclusive with checkpoint and never resets an existing world',async t=>{
  const base=await temporary(t),invalid=path.join(base,'invalid');
  await assert.rejects(createRuntimeOwner({directory:invalid,profile:'player'}),e=>e.code==='UNSUPPORTED_VERSION');
  await assert.rejects(createRuntimeOwner({directory:invalid,profile:'player-village',checkpoint:'old.json'}),e=>e.code==='INVALID_INPUT');
  await assert.rejects(fs.stat(invalid),e=>e.code==='ENOENT');
  const directory=path.join(base,'player'),owner=await createRuntimeOwner({directory,profile:'player-village',seed:0});await owner.close();
  const file=path.join(directory,'service-commit-r0.json'),bytes=await fs.readFile(file);
  for(const options of [{profile:'player-village'},{profile:'personality-neutral'},{seed:42}])
    await assert.rejects(createRuntimeOwner({directory,...options}),e=>e.code==='INVALID_INPUT');
  assert.deepEqual(await fs.readFile(file),bytes);
});

test('D2B service format/profile pairs are exact and journal replay audits original IDs, revisions and receipts',async()=>{
  const player=await fixture(),legacy=createPersonalityNeutral(0);
  const initial=(f,version)=>({serviceFormatVersion:version,anchor:f.bundle,commands:[],bundle:f.bundle});
  validateServiceCommit(initial(legacy,1));validateServiceCommit(initial(player,2));
  for(const invalid of [initial(legacy,2),initial(player,1),initial(player,3),{...initial(player,2),bundle:legacy.bundle}])
    assert.throws(()=>validateServiceCommit(invalid),rejection);
  const session=createSimulationSession(player.bundle,player.systems),commands=[];
  for(const dto of [time('first',0,143),time('second',143,1)]){
    session.advanceTicks(dto.payload.ticks);commands.push({dto,receipt:{apiVersion:1,commandId:dto.commandId,status:'committed',fromRevision:dto.expectedRevision,toRevision:session.getBundle().snapshot.revision,tick:session.getBundle().snapshot.tick}});
  }
  const envelope={serviceFormatVersion:2,anchor:player.bundle,commands,bundle:session.getBundle()};validateServiceCommit(envelope);
  for(const mutate of [e=>e.commands[0].receipt.commandId='forged',e=>e.commands[1].dto.expectedRevision=0,
    e=>e.commands.reverse(),e=>e.commands[1].dto.commandId='first',e=>e.commands[0].receipt.toRevision++,
    e=>e.bundle.snapshot.world.playerModel.wallet++]){
    const bad=structuredClone(envelope);mutate(bad);assert.throws(()=>validateServiceCommit(bad),rejection);
  }
  const unknown=structuredClone(envelope);unknown.anchor.snapshot.fixtureId='foreign';assert.throws(()=>validateServiceCommit(unknown),rejection);
});

test('D2B live HTTP returns only the actual owner player and preserves time conflicts and original-ID retries across restart',async t=>{
  const directory=path.join(await temporary(t),'world'),f=await fixture();
  let server=await startRuntimeServer({directory,profile:'player-village',port:0,seed:0,writable:true});t.after(()=>server.close());
  const read=async route=>{const r=await fetch(server.url+route);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return r.json();};
  assert.deepEqual(await read('/api/runtime/player'),projectPlayerSnapshot(f.bundle));
  const self=(await read('/api/runtime/player')).self;
  assert.deepEqual(Object.keys(self).sort(),['fatigue','health','hunger','identity','inventory','needs','wallet']);
  assert.deepEqual(Object.keys(self.identity).sort(),['actorId','alive','deathTick','location','name','occupation','simulationLevel']);
  for(const key of ['wallet','health','needs','inventory','currentGoal','personality','memories','relationships','eventLog','rng','config'])
    assert.equal(JSON.stringify(await read('/api/runtime/snapshot')).includes('"'+key+'"'),false);
  assert.equal((await read('/api/runtime/capabilities')).playerAvailable,true);
  for(const [route,status] of [['/api/runtime/player?actorId=actor-1',400],['/api/runtime/player/actor-1',404]])
    assert.equal((await fetch(server.url+route)).status,status);
  assert.equal((await fetch(server.url+'/api/runtime/player',{method:'POST'})).status,405);
  const head=await fetch(server.url+'/api/runtime/player',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const before=await fs.readFile(path.join(directory,'service-commit-r0.json'));
  await read('/api/runtime/player');await read('/api/runtime/snapshot');assert.deepEqual(await fs.readFile(path.join(directory,'service-commit-r0.json')),before);
  const post=async dto=>{const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});return {status:r.status,body:await r.json()};};
  const first=time('world-day',0,144),rivals=[first,time('other-day',0,144)];
  const results=await Promise.all(rivals.map(post));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winning=results.findIndex(r=>r.status===200),dto=rivals[winning],receipt=results[winning].body;
  const direct=createSimulationSession(f.bundle,f.systems);direct.advanceTicks(144);const expected=direct.getBundle();
  assert.deepEqual(await read('/api/runtime/snapshot'),projectPublicSnapshot(expected));assert.deepEqual(await read('/api/runtime/player'),projectPlayerSnapshot(expected));
  const bytes=await fs.readFile(path.join(directory,'service-commit-r144.json'));assert.deepEqual(JSON.parse(bytes).bundle,expected);
  assert.deepEqual((await post(dto)).body,receipt);
  assert.equal((await post({...dto,payload:{ticks:1}})).status,409);
  await server.close();server=await startRuntimeServer({directory,port:0,writable:true});
  assert.deepEqual((await post(dto)).body,receipt);assert.deepEqual(await fs.readFile(path.join(directory,'service-commit-r144.json')),bytes);
  assert.deepEqual(await read('/api/runtime/player'),projectPlayerSnapshot(expected));
});

test('D2B disk publication is the single swap point for both DTOs; failed save preserves both and permits same-ID retry',async t=>{
  const directory=path.join(await temporary(t),'world');let pause=false,failed=true,release,entered;
  const blocked=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const io={...fs,async link(source,target){if(pause){entered();await gate;if(failed)throw new Error('injected publication failure');}return fs.link(source,target);}};
  const owner=await createRuntimeOwner({directory,profile:'player-village',writable:true,seed:0},io);t.after(()=>owner.close());
  const world=owner.getSnapshot(),player=owner.getPlayer(),bytes=await fs.readFile(path.join(directory,'service-commit-r0.json'));
  pause=true;const dto=time('once',0,144),request=owner.submit(dto);await Promise.race([blocked,request.then(()=>{throw new Error('Publication gate was not reached');})]);
  assert.deepEqual(owner.getSnapshot(),world);assert.deepEqual(owner.getPlayer(),player);release();
  await assert.rejects(request,e=>e.code==='SAVE_FAILED');assert.deepEqual(owner.getSnapshot(),world);assert.deepEqual(owner.getPlayer(),player);
  assert.deepEqual(await fs.readFile(path.join(directory,'service-commit-r0.json')),bytes);
  assert.deepEqual((await fs.readdir(directory)).sort(),['.runtime-owner.lock','service-commit-r0.json']);
  failed=false;assert.equal((await owner.submit(dto)).toRevision,144);
  assert.equal(owner.getSnapshot().revision,144);assert.equal(owner.getPlayer().revision,144);assert.equal(owner.getPlayer().self.inventory.food,2);
});

test('D2B malformed latest service commit cannot fall back or migrate a legacy archive',async t=>{
  const directory=path.join(await temporary(t),'world'),owner=await createRuntimeOwner({directory,profile:'player-village'});await owner.close();
  const file=path.join(directory,'service-commit-r0.json'),bytes=await fs.readFile(file),bad=path.join(directory,'service-commit-r144.json');
  await fs.writeFile(bad,'{}');await assert.rejects(createRuntimeOwner({directory}),e=>e.code==='INVALID_SERVICE_COMMIT');
  assert.deepEqual(await fs.readFile(file),bytes);assert.equal(await fs.readFile(bad,'utf8'),'{}');
});

async function pageHarness(){
  const elements=new Map(),element=()=>({textContent:'',hidden:false,disabled:false,value:'144',dataset:{},children:[],handlers:{},
    append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},addEventListener(type,fn){this.handlers[type]=fn;}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,documentElement:{dataset:{}}};
  document.getElementById('player-panel').hidden=true;let transport;
  const context=vm.createContext({document,AbortSignal,crypto:{randomUUID:()=> 'page-intent'},fetch:(...args)=>transport(...args)});
  const source=await fs.readFile(new URL('../../runtime-map.mjs',import.meta.url),'utf8');
  transport=async()=>{throw new Error('initial disconnected');};vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,context,setTransport(fn){transport=fn;},refresh:()=>vm.runInContext('refresh()',context)};
}

test('D2B page retries a mismatched real DTO pair once and keeps the previous coherent display on repeated mismatch',async()=>{
  const f=await fixture(),session=createSimulationSession(f.bundle,f.systems),old=f.bundle;
  session.advanceTicks(144);const current=session.getBundle(),page=await pageHarness();
  const response=body=>({ok:true,json:async()=>structuredClone(body)}),cap={apiVersion:1,writes:true,playerAvailable:true};
  page.setTransport(async route=>response(route.endsWith('capabilities')?cap:route.endsWith('player')?projectPlayerSnapshot(old):projectPublicSnapshot(old)));
  await page.refresh();assert.equal(page.elements.get('player-food').textContent,3);assert.equal(page.elements.get('player-panel').dataset.revision,'0');
  let snapshots=0,players=0;
  page.setTransport(async route=>{if(route.endsWith('capabilities'))return response(cap);if(route.endsWith('player')){players++;return response(projectPlayerSnapshot(old));}
    snapshots++;return response(projectPublicSnapshot(current));});
  await page.refresh();assert.equal(snapshots,2);assert.equal(players,2);
  assert.equal(page.context.document.documentElement.dataset.revision,'0');assert.equal(page.elements.get('player-panel').dataset.revision,'0');assert.equal(page.elements.get('player-food').textContent,3);
  assert.match(page.elements.get('connection').textContent,/不一致.*上次一致读数/);
  snapshots=0;players=0;
  page.setTransport(async route=>{if(route.endsWith('capabilities'))return response(cap);if(route.endsWith('player')){players++;return response(projectPlayerSnapshot(players===1?old:current));}
    snapshots++;return response(projectPublicSnapshot(current));});
  await page.refresh();assert.equal(snapshots,2);assert.equal(players,2);assert.equal(page.context.document.documentElement.dataset.revision,'144');assert.equal(page.elements.get('player-food').textContent,2);
  const legacy=createPersonalityNeutral(0);let playerRequests=0;
  page.setTransport(async route=>{if(route.endsWith('capabilities'))return response({...cap,writes:false,playerAvailable:false});if(route.endsWith('player'))playerRequests++;return response(projectPublicSnapshot(legacy.bundle));});
  await page.refresh();assert.equal(playerRequests,0);assert.equal(page.elements.get('player-panel').hidden,true);assert.equal(page.elements.get('time-controls').hidden,true);
});

test('D2B old default profile exposes no player, including through real HTTP',async t=>{
  const directory=path.join(await temporary(t),'old'),server=await startRuntimeServer({directory,port:0});t.after(()=>server.close());
  const response=await fetch(server.url+'/api/runtime/player');assert.equal(response.status,404);
  assert.deepEqual(await response.json(),{apiVersion:1,error:{code:'PLAYER_UNAVAILABLE',message:'当前世界没有玩家身份。'}});
  const cap=await (await fetch(server.url+'/api/runtime/capabilities')).json();assert.equal(cap.playerAvailable,false);
  const before=await fs.readFile(path.join(directory,'checkpoint-r0.json'));
  assert.equal((await (await fetch(server.url+'/api/runtime/snapshot')).json()).population.namedAlive,3);
  assert.deepEqual(await fs.readFile(path.join(directory,'checkpoint-r0.json')),before);
});
