import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { parseCommandBytes,validateServiceCommandDto,projectMindInspector,runtimeProfile,mindBackend,hasMindSupport,MIND_RULES } from '../../runtime/service/http-contract.mjs';
import { validateServiceCommit,transitionServiceCommand } from '../../runtime/service/service-commit.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { createPlayerPlayVillage } from '../../runtime/fixtures/player-play-village.mjs';

const intent=(commandId,expectedRevision,type,payload)=>({version:2,commandId,expectedRevision,type,payload});
const bytes=dto=>Buffer.from(JSON.stringify(dto));
const time=(commandId,expectedRevision=0,ticks=6)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-mind-service-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
async function getJson(url,opts){const r=await fetch(url,opts);let body=null;try{body=await r.json();}catch{/* HEAD/204 */}return {status:r.status,body};}

test('M1B mind integration resolves as unavailable while M1A is not delivered (real path, no mock fallback)',()=>{
  assert.equal(hasMindSupport(),false);
  assert.equal(mindBackend(),null);
  assert.equal(MIND_RULES,'m-mind-v1');
  assert.throws(()=>projectMindInspector({}),e=>e.code==='MIND_UNAVAILABLE');
});

test('M1B existing service profiles keep formats 1/2/3 and a mind bundle is refused until A delivers its runtime',()=>{
  assert.equal(runtimeProfile(createPersonalityNeutral().bundle).serviceFormatVersion,1);
  assert.equal(runtimeProfile(createPlayerVillage().bundle).serviceFormatVersion,2);
  assert.equal(runtimeProfile(createPlayerPlayVillage().bundle).serviceFormatVersion,3);
  const forged={snapshot:{fixtureVersion:'1',rulesVersion:'m-mind-v1',fixtureId:'mind-village'},eventLog:[]};
  assert.throws(()=>runtimeProfile(forged),e=>e.code==='UNSUPPORTED_VERSION');
  const unknown={snapshot:{fixtureVersion:'1',rulesVersion:'m-mind-v1',fixtureId:'not-mind'},eventLog:[]};
  assert.throws(()=>runtimeProfile(unknown),e=>e.code==='UNSUPPORTED_VERSION');
});

test('M1B action command IDs reserve the mind-day- namespace like society-day- without weakening valid actions',()=>{
  assert.deepEqual(parseCommandBytes(bytes(intent('rest',0,'PlayerRest',{}))),intent('rest',0,'PlayerRest',{}));
  assert.throws(()=>parseCommandBytes(bytes(intent('mind-day-1-actor-2',0,'PlayerRest',{}))),e=>e.code==='INVALID_INPUT');
  assert.throws(()=>parseCommandBytes(bytes(intent('society-day-1',0,'PlayerRest',{}))),e=>e.code==='INVALID_INPUT');
});

test('M1B owner exposes mindAvailable=false and never serves a mind inspector without the mind profile',async t=>{
  const base=await temporary(t);
  const owner=await createRuntimeOwner({directory:path.join(base,'play'),profile:'player-play-village'});t.after(()=>owner.close());
  assert.equal(owner.mindAvailable,false);
  assert.equal(owner.playerActionsAvailable,true);
  assert.throws(()=>owner.getMindInspector(),e=>e.code==='MIND_UNAVAILABLE');
});

test('M1B owner rejects the mind-village profile while the mind runtime is not delivered, leaving no artifacts',async t=>{
  const base=await temporary(t),directory=path.join(base,'mind');
  await assert.rejects(createRuntimeOwner({directory,profile:'mind-village'}),e=>e.code==='UNSUPPORTED_VERSION');
  await assert.rejects(fs.access(directory),e=>e.code==='ENOENT');
});

test('M1B real HTTP keeps the inspector closed without a mind profile: capability-first 404 for every method and query',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,profile:'player-play-village',port:0,writable:true,inspectMind:true});
  t.after(()=>server.close());
  const cap=await getJson(server.url+'/api/runtime/capabilities');assert.equal(cap.status,200);assert.equal(cap.body.mindAvailable,false);
  for(const [route,opts] of [['/api/runtime/minds',undefined],['/api/runtime/minds',{method:'HEAD'}],['/api/runtime/minds',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}],
    ['/api/runtime/minds?page=1',undefined],['/runtime-mind.html',undefined],['/runtime-mind.mjs',undefined],['/runtime-mind.css',undefined]]){
    const r=route.startsWith('/api/')?await getJson(server.url+route,opts):await fetch(server.url+route,opts);
    assert.equal(r.status,404,route);
    if(route.startsWith('/api/runtime/minds')&&!opts)assert.equal((await getJson(server.url+route)).body.error.code,'MIND_UNAVAILABLE');
  }
  assert.equal((await getJson(server.url+'/api/runtime/snapshot')).status,200);
});

test('M1B inspect-mind option is validated as boolean at server start and defaults to closed',async t=>{
  const directory=path.join(await temporary(t),'world');
  await assert.rejects(startRuntimeServer({directory,profile:'player-play-village',port:0,inspectMind:'yes'}),e=>e.code==='INVALID_INPUT');
  const server=await startRuntimeServer({directory:path.join(await temporary(t),'w2'),profile:'player-play-village',port:0});
  t.after(()=>server.close());
  assert.equal((await getJson(server.url+'/api/runtime/capabilities')).body.mindAvailable,false);
});

test('M1B service commit audits format4 against its own profile and rejects disguised foreign formats',()=>{
  const play=createPlayerPlayVillage().bundle,neutral=createPersonalityNeutral().bundle;
  assert.doesNotThrow(()=>validateServiceCommit({serviceFormatVersion:1,anchor:neutral,commands:[],bundle:neutral}));
  assert.throws(()=>validateServiceCommit({serviceFormatVersion:4,anchor:neutral,commands:[],bundle:neutral}),e=>e.code==='UNSUPPORTED_VERSION');
  assert.throws(()=>validateServiceCommit({serviceFormatVersion:5,anchor:play,commands:[],bundle:play}),e=>e.code==='UNSUPPORTED_VERSION');
});

test('M1B transition dispatches player actions for the play profile and keeps legacy profiles read in time only (regression)',()=>{
  const play=createPlayerPlayVillage().bundle,neutral=createPersonalityNeutral().bundle;
  assert.doesNotThrow(()=>transitionServiceCommand(play,intent('rest',0,'PlayerRest',{})));
  assert.throws(()=>transitionServiceCommand(neutral,intent('rest',0,'PlayerRest',{})),e=>e.code==='COMMAND_UNSUPPORTED');
  assert.equal(transitionServiceCommand(neutral,time('hour')).receipt.toRevision,6);
});