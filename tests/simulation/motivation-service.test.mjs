import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { parseCommandBytes,projectPublicSnapshot,runtimeProfile,validateServiceCommandDto,MOTIVATION_RULES,
  loadMotivationBackend,motivationBackendState } from '../../runtime/service/http-contract.mjs';
import { validateServiceCommit,transitionServiceCommand } from '../../runtime/service/service-commit.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { createPlayerPlayVillage } from '../../runtime/fixtures/player-play-village.mjs';
import { createMindVillage } from '../../runtime/fixtures/mind-village.mjs';

const intent=(commandId,expectedRevision,type,payload)=>({version:2,commandId,expectedRevision,type,payload});
const bytes=dto=>Buffer.from(JSON.stringify(dto));
const time=(commandId,expectedRevision=0,ticks=6)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-motivation-service-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
async function getJson(url,opts){const r=await fetch(url,opts);let body=null;try{body=await r.json();}catch{/* HEAD/204 */}return {status:r.status,body};}

// A2 (runtime/core/motivation-runtime.mjs) is not part of this baseline. Every test branches on
// the recorded backend state: while the module is absent the tests verify the explicit
// dependency reporting and the unchanged legacy behaviour, and they never inject mocks into
// production routes; once A2 is delivered the same tests exercise the real service5 path.

test('M2B dependency state is explicit and the format5 recognition follows the contract-frozen rules string',async()=>{
  const state=await loadMotivationBackend();
  assert.equal(motivationBackendState().available,Boolean(state.module));
  assert.equal(MOTIVATION_RULES,'m-motivation-v1');
  if(state.module){
    for(const key of ['defaultMotivationVillageConfig','createMotivationVillage','motivationSystems','validateMotivationWorld',
      'executeMotivationPlayerIntent','describeMotivationPlayerActions','buildMotivationKnowledge','projectMotivationInspector']){
      assert.equal(typeof state.module[key],'function',`A2 export ${key}`);
    }
  }else{
    assert.match(String(state.error),/motivation-runtime/,'a missing dependency must be recorded, not swallowed');
  }
  assert.equal(runtimeProfile(createPersonalityNeutral().bundle).serviceFormatVersion,1);
  assert.equal(runtimeProfile(createPlayerVillage().bundle).serviceFormatVersion,2);
  assert.equal(runtimeProfile(createPlayerPlayVillage().bundle).serviceFormatVersion,3);
  assert.equal(runtimeProfile(createMindVillage().bundle).serviceFormatVersion,4);
  const unknown={snapshot:{fixtureVersion:'1',rulesVersion:MOTIVATION_RULES,fixtureId:'not-motivation'},eventLog:[]};
  assert.throws(()=>runtimeProfile(unknown),e=>e.code==='UNSUPPORTED_VERSION');
  const forged={snapshot:{fixtureVersion:'1',rulesVersion:MOTIVATION_RULES,fixtureId:'motivation-village'},eventLog:[]};
  if(state.module)assert.throws(()=>projectPublicSnapshot(forged),e=>e.code==='INVALID_INPUT');
  else assert.throws(()=>runtimeProfile(forged),
    e=>e.code==='UNSUPPORTED_VERSION'&&/motivation runtime module/.test(e.message));
});

test('M2B command parser keeps legacy IDs while the motivation profile cannot be created without its backend',async t=>{
  assert.equal(validateServiceCommandDto(intent('mind-day-legacy-external',0,'PlayerRest',{})).commandId,'mind-day-legacy-external');
  assert.equal(validateServiceCommandDto(intent('motivation-day-legacy-external',0,'PlayerRest',{})).commandId,'motivation-day-legacy-external');
  assert.throws(()=>parseCommandBytes(bytes(intent('society-day-1',0,'PlayerRest',{}))),e=>e.code==='INVALID_INPUT');
  const {module}=await loadMotivationBackend(),directory=path.join(await temporary(t),'motivation');
  if(!module)await assert.rejects(createRuntimeOwner({directory,profile:'motivation-village'}),
    e=>e.code==='UNSUPPORTED_VERSION'&&/motivation runtime module/.test(e.message));
  else{
    const owner=await createRuntimeOwner({directory,profile:'motivation-village'});t.after(()=>owner.close());
    assert.equal(owner.mindAvailable,true);
    assert.equal(owner.playerActionsAvailable,true);
    const inspector=owner.getMindInspector();
    assert.equal(inspector.mindVersion,'motivation-inspector-v1');
    assert.equal(inspector.actors.length,2);
  }
});

test('M2B service commit audits format5 only against a real motivation world and keeps legacy formats',async()=>{
  const play=createPlayerPlayVillage().bundle,neutral=createPersonalityNeutral().bundle;
  assert.doesNotThrow(()=>validateServiceCommit({serviceFormatVersion:1,anchor:neutral,commands:[],bundle:neutral}));
  assert.throws(()=>validateServiceCommit({serviceFormatVersion:5,anchor:play,commands:[],bundle:play}),e=>e.code==='UNSUPPORTED_VERSION');
  const {module}=await loadMotivationBackend();
  if(!module){
    const forged={snapshot:{fixtureVersion:'1',rulesVersion:MOTIVATION_RULES,fixtureId:'motivation-village'},eventLog:[]};
    assert.throws(()=>validateServiceCommit({serviceFormatVersion:5,anchor:forged,commands:[],bundle:forged}),e=>e.code==='UNSUPPORTED_VERSION');
    return;
  }
  const village=module.createMotivationVillage().bundle;
  assert.equal(runtimeProfile(village).serviceFormatVersion,5);
  assert.doesNotThrow(()=>validateServiceCommit({serviceFormatVersion:5,anchor:village,commands:[],bundle:village}));
});

test('M2B reserves the three internal day namespaces for the motivation rules and keeps old profile rules',async t=>{
  const play=createPlayerPlayVillage().bundle;
  assert.doesNotThrow(()=>transitionServiceCommand(play,intent('motivation-day-legacy-external',0,'PlayerRest',{})));
  assert.equal(transitionServiceCommand(play,time('motivation-day-legacy-time')).receipt.toRevision,6);
  const {module}=await loadMotivationBackend();
  if(!module){t.skip('A2 motivation runtime not delivered; namespace integration pending');return;}
  const village=module.createMotivationVillage().bundle;
  for(const prefix of ['mind-day-','society-day-','motivation-day-']){
    assert.throws(()=>transitionServiceCommand(village,time(`${prefix}external`)),e=>e.code==='INVALID_INPUT',prefix);
    assert.throws(()=>transitionServiceCommand(village,intent(`${prefix}external`,0,'PlayerRest',{})),e=>e.code==='INVALID_INPUT',prefix);
  }
});

test('M2B real HTTP keeps the capable M1 inspector served with capability→method→query ordering and HEAD parity',async t=>{
  const directory=path.join(await temporary(t),'world');
  const server=await startRuntimeServer({directory,profile:'mind-village',port:0,inspectMind:true});
  t.after(()=>server.close());
  assert.equal((await getJson(server.url+'/api/runtime/capabilities')).body.mindAvailable,true);
  const get=await fetch(server.url+'/api/runtime/minds');
  assert.equal(get.status,200);
  const head=await fetch(server.url+'/api/runtime/minds',{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-type'),get.headers.get('content-type'));
  assert.equal(head.headers.get('content-length'),get.headers.get('content-length'));
  assert.equal((await head.text()).length,0);
  assert.equal((await getJson(server.url+'/api/runtime/minds',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,405);
  assert.equal((await getJson(server.url+'/api/runtime/minds?page=1')).status,400);
  for(const route of ['/runtime-mind.html','/runtime-mind.mjs','/runtime-mind.css']){
    assert.equal((await fetch(server.url+route)).status,200,route);
  }
  const filesBefore=(await fs.readdir(directory)).sort();
  await getJson(server.url+'/api/runtime/minds');await getJson(server.url+'/api/runtime/snapshot');await getJson(server.url+'/api/runtime/minds');
  assert.deepEqual((await fs.readdir(directory)).sort(),filesBefore,'read-only consumers must not change stored bytes');
});

test('M2B real HTTP reports capability-first 404 for worlds without any inspector capability',async t=>{
  const directory=path.join(await temporary(t),'world');
  const server=await startRuntimeServer({directory,profile:'player-play-village',port:0,writable:true,inspectMind:true});
  t.after(()=>server.close());
  assert.equal((await getJson(server.url+'/api/runtime/capabilities')).body.mindAvailable,false);
  for(const opts of [undefined,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},{method:'HEAD'}]){
    assert.equal((await getJson(server.url+'/api/runtime/minds',opts)).status,404);
  }
  assert.equal((await getJson(server.url+'/api/runtime/minds?page=1')).status,404);
  assert.equal((await fetch(server.url+'/runtime-mind.html')).status,404);
});

test('M2B service5 route: the motivation profile starts only with the real A2 backend and serves one audited candidate',async t=>{
  const {module}=await loadMotivationBackend(),directory=path.join(await temporary(t),'world');
  if(!module){
    await assert.rejects(startRuntimeServer({directory,profile:'motivation-village',port:0,inspectMind:true}),
      e=>e.code==='UNSUPPORTED_VERSION'&&/motivation runtime module/.test(e.message));
    return;
  }
  const server=await startRuntimeServer({directory,profile:'motivation-village',port:0,inspectMind:true});
  t.after(()=>server.close());
  const cap=await getJson(server.url+'/api/runtime/capabilities');
  assert.equal(cap.body.mindAvailable,true);
  assert.equal(cap.body.playerActionsAvailable,true);
  const minds=await getJson(server.url+'/api/runtime/minds');
  assert.equal(minds.status,200);
  assert.equal(minds.body.mindVersion,'motivation-inspector-v1');
  const [snap,player]=await Promise.all([getJson(server.url+'/api/runtime/snapshot'),getJson(server.url+'/api/runtime/player')]);
  assert.equal(snap.body.revision,minds.body.revision);
  assert.equal(player.body.revision,minds.body.revision);
  assert.equal((await getJson(server.url+'/api/runtime/minds',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,405);
  assert.equal((await getJson(server.url+'/api/runtime/minds?x=1')).status,400);
});

test('M2B durable save fault keeps every old projection and the retried command still lands once',async t=>{
  const {module}=await loadMotivationBackend();
  if(!module){t.skip('A2 motivation runtime not delivered; save-fault integration pending');return;}
  const directory=path.join(await temporary(t),'world');
  let failNextLink=false;
  const io=new Proxy(fs,{get(target,prop){
    if(prop==='link')return async()=>{if(failNextLink){failNextLink=false;throw Object.assign(new Error('injected link failure'),{code:'EACCES'});}};
    const value=Reflect.get(target,prop,target);
    return typeof value==='function'?value.bind(target):value;
  }});
  const owner=await createRuntimeOwner({directory,profile:'motivation-village',writable:true},io);t.after(()=>owner.close());
  const beforeSnapshot=owner.getSnapshot(),beforeMind=owner.getMindInspector();
  failNextLink=true;
  await assert.rejects(owner.submit(intent('motivation-save-fault',0,'PlayerRest',{})),e=>e.code==='SAVE_FAILED');
  assert.equal(owner.getSnapshot().revision,beforeSnapshot.revision);
  assert.equal(owner.getMindInspector().revision,beforeMind.revision);
  const receipt=await owner.submit(intent('motivation-save-fault',0,'PlayerRest',{}));
  assert.equal(receipt.status,'committed');
  assert.ok(receipt.toRevision>beforeSnapshot.revision);
  assert.equal(owner.getMindInspector().revision,receipt.toRevision);
});
