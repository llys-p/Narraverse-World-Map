import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { request } from 'node:http';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { projectPublicSnapshot,validateTimeCommandDto } from '../../runtime/service/http-contract.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { PERSONALITY_RULES } from '../../runtime/core/memory-runtime.mjs';
import { saveCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-runtime-service-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
function wire(url,options,body=''){return new Promise((resolve,reject)=>{const req=request(url,options,res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(body);});}

test('D1 public projection has only declared public data, copies aliases and audits its actual source',()=>{
  const f=createPersonalityNeutral(42),before=structuredClone(f.bundle),dto=projectPublicSnapshot(f.bundle);
  assert.deepEqual(Object.keys(dto).sort(),['actors','apiVersion','clock','market','population','revision','simulationId','tick']);
  for(const a of dto.actors)assert.deepEqual(Object.keys(a).sort(),['actorId','alive','location','name','occupation']);
  for(const key of ['wallet','health','currentGoal','personalities','rng','eventLog','config','inventory'])assert.equal(JSON.stringify(dto).includes('"'+key+'"'),false);
  dto.actors[0].name='changed';dto.market.food=999;assert.deepEqual(f.bundle,before);
  const corrupt=structuredClone(f.bundle);corrupt.snapshot.world.resources.food++;
  assert.throws(()=>projectPublicSnapshot(corrupt),bad);
});

test('D1 future time DTO validates exact bounded data without invoking getters; no write execution is exposed',()=>{
  const dto={version:1,commandId:'rest-1',expectedRevision:0,type:'AdvanceTime',payload:{ticks:1440}};
  assert.deepEqual(validateTimeCommandDto(dto),dto);
  for(const mutate of [d=>d.payload.ticks=1441,d=>d.payload.ticks=0,d=>d.expectedRevision=-1,d=>d.commandId='x/y',d=>d.extra=true,d=>d.version=2]){
    const d=structuredClone(dto);mutate(d);assert.throws(()=>validateTimeCommandDto(d),bad);
  }
  let reads=0;const d={...dto,get payload(){reads++;return {ticks:1};}};
  assert.throws(()=>validateTimeCommandDto(d),bad);assert.equal(reads,0);
});

test('D1 disk owner: one directory has one owner; repeated reads and restart preserve checkpoint bytes and explicit seed',async t=>{
  const base=await temporary(t),directory=path.join(base,'world'),first=await createRuntimeOwner({directory,seed:0});
  t.after(()=>first.close());const before=first.getSnapshot();assert.equal(before.tick,0);
  const file=path.join(directory,'checkpoint-r0.json'),bytes=await fs.readFile(file,'utf8');
  first.getSnapshot().market.food=123;assert.deepEqual(first.getSnapshot(),before);
  await assert.rejects(createRuntimeOwner({directory}),e=>e.code==='OWNER_BUSY');await first.close();
  const second=await createRuntimeOwner({directory});t.after(()=>second.close());assert.deepEqual(second.getSnapshot(),before);
  assert.equal(await fs.readFile(file,'utf8'),bytes);await second.close();
  await assert.rejects(createRuntimeOwner({directory,seed:42}),e=>e.code==='INVALID_INPUT');
});

test('D1 bootstrap: explicit experimental checkpoint restores real time; bad latest file cannot fall back and foreign files stay untouched',async t=>{
  const base=await temporary(t),f=createPersonalityNeutral(42),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(2*144);
  const source=await saveCheckpoint(s.getBundle(),{directory:path.join(base,'source'),rulesVersion:PERSONALITY_RULES,systems:f.systems});
  const directory=path.join(base,'world'),owner=await createRuntimeOwner({directory,checkpoint:source});
  assert.equal(owner.getSnapshot().tick,288);await owner.close();
  await assert.rejects(createRuntimeOwner({directory,checkpoint:source}),e=>e.code==='INVALID_INPUT');
  await fs.writeFile(path.join(directory,'checkpoint-r432.json'),'{}');
  await assert.rejects(createRuntimeOwner({directory}),e=>e.code==='INVALID_CHECKPOINT');
  assert.equal(await fs.readFile(path.join(directory,'checkpoint-r432.json'),'utf8'),'{}');
  const foreign=path.join(base,'foreign');await fs.mkdir(foreign);await fs.writeFile(path.join(foreign,'notes.txt'),'keep');
  await assert.rejects(createRuntimeOwner({directory:foreign}),e=>e.code==='INVALID_INPUT');assert.equal(await fs.readFile(path.join(foreign,'notes.txt'),'utf8'),'keep');
});

test('D1 owner closing never deletes a lock that another actor replaced',async t=>{
  const directory=path.join(await temporary(t),'world'),owner=await createRuntimeOwner({directory});
  const file=path.join(directory,'.runtime-owner.lock');await fs.writeFile(file,'replacement');await owner.close();
  assert.equal(await fs.readFile(file,'utf8'),'replacement');await assert.rejects(createRuntimeOwner({directory}),e=>e.code==='OWNER_BUSY');
});

test('D1 real HTTP: public live world, HEAD/pure reads, private paths and writes are denied; same directory cannot start a second server',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,seed:0});t.after(()=>server.close());
  const url=server.url,read=async()=>{const r=await fetch(url+'/api/runtime/snapshot');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return r.json();};
  const before=await read();assert.deepEqual(await read(),before);
  const head=await fetch(url+'/api/runtime/snapshot',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const caps=await (await fetch(url+'/api/runtime/capabilities')).json();assert.equal(caps.writes,false);
  for(const suffix of ['/.env','/runtime/core/rng.mjs','/checkpoint-r0.json','/../PROJECT_CONTEXT.md'])assert.equal((await fetch(url+suffix)).status,404);
  const post=await fetch(url+'/api/runtime/commands',{method:'POST',body:JSON.stringify({ticks:144})});assert.equal(post.status,405);assert.equal((await post.json()).error.code,'WRITE_DISABLED');
  assert.equal((await fetch(url+'/api/runtime/snapshot',{headers:{Origin:'https://foreign.example'}})).status,403);
  assert.equal(await wire(url+'/api/runtime/snapshot',{headers:{Host:'foreign.example'}}),403);
  assert.equal(await wire(url+'/api/runtime/commands',{method:'POST',headers:{'Content-Length':'4097'}},'x'.repeat(4097)),413);
  assert.equal(await wire(url+'/api/runtime/snapshot',{headers:{'Transfer-Encoding':'chunked'}}),400);
  assert.equal((await fetch(url+'/api/runtime/snapshot?private=true')).status,400);
  assert.deepEqual(await read(),before);await assert.rejects(startRuntimeServer({directory,port:0}),e=>e.code==='OWNER_BUSY');
  await server.close();const restarted=await startRuntimeServer({directory,port:0});t.after(()=>restarted.close());
  assert.deepEqual(await (await fetch(restarted.url+'/api/runtime/snapshot')).json(),before);
});

test('D1 port conflict releases only the new owner lock and preserves its checkpoint',async t=>{
  const base=await temporary(t),first=await startRuntimeServer({directory:path.join(base,'first'),port:0});t.after(()=>first.close());
  const directory=path.join(base,'other');await assert.rejects(startRuntimeServer({directory,port:Number(new URL(first.url).port)}),e=>e.code==='PORT_IN_USE');
  await assert.rejects(fs.stat(path.join(directory,'.runtime-owner.lock')),e=>e.code==='ENOENT');
  assert.equal((await fs.stat(path.join(directory,'checkpoint-r0.json'))).isFile(),true);
});
