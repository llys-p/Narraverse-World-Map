import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { parseCommandBytes,validateServiceCommandDto,projectMindInspector,runtimeProfile,MIND_RULES } from '../../runtime/service/http-contract.mjs';
import { validateServiceCommit,transitionServiceCommand } from '../../runtime/service/service-commit.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { createPlayerPlayVillage } from '../../runtime/fixtures/player-play-village.mjs';
import { createMindVillage } from '../../runtime/fixtures/mind-village.mjs';

const intent=(commandId,expectedRevision,type,payload)=>({version:2,commandId,expectedRevision,type,payload});
const bytes=dto=>Buffer.from(JSON.stringify(dto));
const time=(commandId,expectedRevision=0,ticks=6)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-mind-service-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
async function getJson(url,opts){const r=await fetch(url,opts);let body=null;try{body=await r.json();}catch{/* HEAD/204 */}return {status:r.status,body};}

test('M1B real mind fixture projects through format4 while invalid profiles remain rejected',()=>{
  assert.equal(runtimeProfile(createPersonalityNeutral().bundle).serviceFormatVersion,1);
  assert.equal(runtimeProfile(createPlayerVillage().bundle).serviceFormatVersion,2);
  assert.equal(runtimeProfile(createPlayerPlayVillage().bundle).serviceFormatVersion,3);
  const mind=createMindVillage().bundle;
  assert.equal(MIND_RULES,'m-mind-v1');
  assert.equal(runtimeProfile(mind).serviceFormatVersion,4);
  assert.equal(projectMindInspector(mind).actors.length,2);
  assert.doesNotThrow(()=>validateServiceCommit({serviceFormatVersion:4,anchor:mind,commands:[],bundle:mind}));
  const forged={snapshot:{fixtureVersion:'1',rulesVersion:'m-mind-v1',fixtureId:'mind-village'},eventLog:[]};
  assert.throws(()=>projectMindInspector(forged));
  const unknown={snapshot:{fixtureVersion:'1',rulesVersion:'m-mind-v1',fixtureId:'not-mind'},eventLog:[]};
  assert.throws(()=>runtimeProfile(unknown),e=>e.code==='UNSUPPORTED_VERSION');
});

test('M1B command parser keeps legacy IDs and M transition reserves internal prefixes for both DTO versions',()=>{
  assert.deepEqual(parseCommandBytes(bytes(intent('rest',0,'PlayerRest',{}))),intent('rest',0,'PlayerRest',{}));
  assert.equal(validateServiceCommandDto(intent('mind-day-legacy-external',0,'PlayerRest',{})).commandId,'mind-day-legacy-external');
  assert.throws(()=>parseCommandBytes(bytes(intent('society-day-1',0,'PlayerRest',{}))),e=>e.code==='INVALID_INPUT');
  const mind=createMindVillage().bundle,play=createPlayerPlayVillage().bundle;
  for(const prefix of ['mind-day-','society-day-']){
    assert.throws(()=>transitionServiceCommand(mind,time(`${prefix}external`)),e=>e.code==='INVALID_INPUT');
    assert.throws(()=>transitionServiceCommand(mind,intent(`${prefix}external`,0,'PlayerRest',{})),e=>e.code==='INVALID_INPUT');
  }
  assert.doesNotThrow(()=>transitionServiceCommand(play,intent('mind-day-legacy-external',0,'PlayerRest',{})));
  assert.equal(transitionServiceCommand(play,time('mind-day-legacy-time')).receipt.toRevision,6);
});

test('M1B owner exposes mindAvailable=false and never serves a mind inspector without the mind profile',async t=>{
  const base=await temporary(t);
  const owner=await createRuntimeOwner({directory:path.join(base,'play'),profile:'player-play-village'});t.after(()=>owner.close());
  assert.equal(owner.mindAvailable,false);
  assert.equal(owner.playerActionsAvailable,true);
  assert.throws(()=>owner.getMindInspector(),e=>e.code==='MIND_UNAVAILABLE');
});

test('M1B owner loads the real mind-village profile and returns its initial inspector projection',async t=>{
  const base=await temporary(t),directory=path.join(base,'mind');
  const owner=await createRuntimeOwner({directory,profile:'mind-village'});t.after(()=>owner.close());
  assert.equal(owner.mindAvailable,true);
  const inspector=owner.getMindInspector();
  assert.equal(inspector.actors.length,2);
  assert.equal(inspector.revision,0);
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
