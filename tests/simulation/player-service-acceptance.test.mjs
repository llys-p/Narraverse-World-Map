import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { loadServiceCommit,validateServiceCommit } from '../../runtime/service/service-commit.mjs';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { buildPlayerKnowledge } from '../../runtime/knowledge/player-knowledge.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
const dto=(id,revision=0,ticks=144)=>({version:1,commandId:id,expectedRevision:revision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-player-http-independent-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
async function get(url,route){const r=await fetch(url+route);return {status:r.status,body:await r.json()};}
async function post(url,d){const r=await fetch(url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});return {status:r.status,body:await r.json()};}
async function bytes(directory){return Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,await fs.readFile(path.join(directory,f),'utf8')]));}
const bad=e=>['INVALID_INPUT','UNSUPPORTED_VERSION','INVALID_SERVICE_COMMIT'].includes(e.code);

test('D2B independent real HTTP: player reads are exact own projection, pure, query-free and match one atomic disk world',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,profile:'player-village',writable:true});t.after(()=>server.close());
  assert.equal((await get(server.url,'/api/runtime/capabilities')).body.playerAvailable,true);
  const before=await bytes(directory),first=await get(server.url,'/api/runtime/player');assert.equal(first.status,200);
  assert.deepEqual(Object.keys(first.body).sort(),['apiVersion','revision','self','simulationId','tick']);assert.equal(first.body.self.wallet,100);
  first.body.self.wallet=99999;
  for(let i=0;i<5;i++)assert.equal((await get(server.url,'/api/runtime/player')).body.self.wallet,100);
  assert.deepEqual(await bytes(directory),before);assert.equal((await get(server.url,'/api/runtime/player?actorId=actor-2')).status,400);
  const publicView=(await get(server.url,'/api/runtime/snapshot')).body;assert.equal(publicView.population.unnamedAlive,76);assert.equal(publicView.population.totalAlive,80);
  assert.equal(publicView.actors.length,4);assert.equal(JSON.stringify(publicView).includes('wallet'),false);assert.equal(JSON.stringify(publicView).includes('inventory'),false);
  assert.equal((await post(server.url,dto('day'))).status,200);
  const disk=await loadServiceCommit(path.join(directory,'service-commit-r144.json'));assert.equal(disk.serviceFormatVersion,2);
  assert.deepEqual((await get(server.url,'/api/runtime/player')).body,{apiVersion:1,...buildPlayerKnowledge(disk.bundle)});
  const f=createPlayerVillage(),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(144);assert.deepEqual(disk.bundle,s.getBundle());
  const latest=await bytes(directory);assert.deepEqual(await post(server.url,dto('day')), {status:200,body:disk.commands[0].receipt});assert.deepEqual(await bytes(directory),latest);
});

test('D2B independent real HTTP restart: original ID wins before stale revision and mismatched body cannot change player',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,profile:'player-village',writable:true});t.after(()=>server.close());
  const receipt=await post(server.url,dto('original'));assert.equal(receipt.status,200);
  assert.equal((await post(server.url,dto('later',144,1))).status,200);await server.close();
  const restored=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>restored.close());const before=await bytes(directory);
  assert.deepEqual(await post(restored.url,dto('original')),receipt);assert.equal((await get(restored.url,'/api/runtime/player')).body.revision,145);
  assert.equal((await post(restored.url,dto('original',145,1))).body.error.code,'COMMAND_ID_CONFLICT');
  assert.equal((await post(restored.url,dto('stale',0,1))).body.error.code,'REVISION_CONFLICT');assert.deepEqual(await bytes(directory),before);
});

test('D2B independent HTTP rejects invented actor, wallet and all unapproved player actions without committing',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,profile:'player-village',writable:true});t.after(()=>server.close());
  const before=await bytes(directory);
  for(const d of [{...dto('actor'),actorId:'actor-2'},{...dto('coins'),payload:{ticks:1,wallet:1000}},
    ...['SocietyAction','BuyFood','BuyMedicine','Travel','Rest','UseMedicine','Attack'].map(type=>({...dto(type),type}))]){
    assert.equal((await post(server.url,d)).status,400);assert.equal((await get(server.url,'/api/runtime/player')).body.tick,0);
  }
  assert.deepEqual(await bytes(directory),before);
});

test('D2B independent read-only initialization persists service2; legacy default service1 cannot pretend to contain a player',async t=>{
  const root=await temporary(t),playerDir=path.join(root,'player'),legacyDir=path.join(root,'legacy');
  const player=await startRuntimeServer({directory:playerDir,port:0,profile:'player-village'});t.after(()=>player.close());
  const files=await fs.readdir(playerDir);assert.ok(files.includes('service-commit-r0.json'));assert.equal(files.some(f=>f.startsWith('checkpoint-')),false);
  assert.equal((await loadServiceCommit(path.join(playerDir,'service-commit-r0.json'))).serviceFormatVersion,2);
  assert.equal((await post(player.url,dto('disabled'))).status,405);await player.close();
  const legacy=await startRuntimeServer({directory:legacyDir,port:0,writable:true});t.after(()=>legacy.close());
  assert.equal((await get(legacy.url,'/api/runtime/capabilities')).body.playerAvailable,false);
  const missing=await get(legacy.url,'/api/runtime/player');assert.equal(missing.status,404);assert.equal(missing.body.error.code,'PLAYER_UNAVAILABLE');
  assert.equal((await post(legacy.url,dto('legacy-time',0,1))).status,200);
  const old=await loadServiceCommit(path.join(legacyDir,'service-commit-r1.json'));assert.equal(old.serviceFormatVersion,1);assert.equal(old.bundle.snapshot.world.actorModel.actors.length,3);
  await legacy.close();await assert.rejects(createRuntimeOwner({directory:legacyDir,profile:'player-village'}),bad);
});

test('D2B independent disk audit: forged journal/owner/format fails, corrupt newest state never falls back to valid anchor',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,profile:'player-village',writable:true});t.after(()=>server.close());
  assert.equal((await post(server.url,dto('day'))).status,200);await server.close();
  const file=path.join(directory,'service-commit-r144.json'),good=await loadServiceCommit(file);
  for(const mutate of [x=>x.commands[0].receipt.toRevision++,x=>x.commands[0].dto.payload.ticks++,
    x=>x.bundle.snapshot.world.playerModel.actorId='actor-2',x=>x.serviceFormatVersion=1]){
    const corrupt=structuredClone(good);mutate(corrupt);assert.throws(()=>validateServiceCommit(corrupt),bad);
  }
  const corrupt=structuredClone(good);corrupt.bundle.snapshot.world.playerModel.inventory.food++;await fs.writeFile(file,JSON.stringify(corrupt));
  await assert.rejects(createRuntimeOwner({directory}),bad);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).bundle.snapshot.world.playerModel.inventory.food,corrupt.bundle.snapshot.world.playerModel.inventory.food);
  assert.ok((await fs.readdir(directory)).includes('service-commit-r0.json'));
});
