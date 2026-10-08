import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { fields,record,requireCondition,cloneData } from '../../runtime/core/data-contract.mjs';
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
const A2_EXPORTS={fixture:['defaultMotivationVillageConfig','createMotivationVillage','motivationSystems'],
  runtime:['validateMotivationWorld','executeMotivationPlayerIntent','describeMotivationPlayerActions'],
  knowledge:['buildMotivationKnowledge','projectMotivationInspector']};
const A2_SPECIFIERS=['../fixtures/motivation-village.mjs','../core/motivation-runtime.mjs','../knowledge/motivation-knowledge.mjs'];
function assertPending(state){
  assert.equal(state.dependencyPending,true);assert.equal(state.backend,null);
  assert.equal(state.errorCode,'ERR_MODULE_NOT_FOUND');assert.ok(A2_SPECIFIERS.includes(state.missingSpecifier));
}
async function storedBytes(directory){
  const names=(await fs.readdir(directory)).filter(name=>name!=='.runtime-owner.lock').sort();
  return Object.fromEntries(await Promise.all(names.map(async name=>[name,await fs.readFile(path.join(directory,name),'utf8')])));
}
const ownerReadings=owner=>({public:owner.getSnapshot(),player:owner.getPlayer(),mind:owner.getMindInspector(),
  capabilities:{playerAvailable:owner.playerAvailable,playerActionsAvailable:owner.playerActionsAvailable,mindAvailable:owner.mindAvailable}});

// Isolated source execution tests only the B loader/DTO boundary. These namespaces never
// enter a production owner/HTTP route and do not count as real A2 integration evidence.
async function contractHarness(importModule,validateBundle=()=>{}){
  const url=new URL('../../runtime/service/http-contract.mjs',import.meta.url);
  const source=(await fs.readFile(url,'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export \{ MIND_RULES \};\r?\n/gm,'')
    .replace(/^export /gm,'').replace('import(specifier)','importModule(specifier)').replaceAll('import.meta.url','moduleUrl');
  const context=vm.createContext({URL,moduleUrl:url.href,importModule,validateBundle,fields,record,requireCondition,
    cloneData:value=>cloneData(structuredClone(value)),
    PERSONALITY_RULES:'legacy-personality',PLAYER_RULES:'legacy-player',PLAY_RULES:'legacy-play',MIND_RULES:'legacy-mind',
    mindFixture:{},mindRuntime:{},mindKnowledge:{},buildPlayerKnowledge(){throw new Error('M2 must not use legacy Player Knowledge');}});
  vm.runInContext(source,context);
  return context;
}
const isolatedNamespaces=()=>Object.values(A2_EXPORTS).map(keys=>Object.fromEntries(keys.map(key=>[key,()=>{}])));

test('M2B isolated loader follows three module owners without core re-exports',async()=>{
  const modules=isolatedNamespaces(),calls=[];
  const h=await contractHarness(async specifier=>{calls.push(specifier);return modules[A2_SPECIFIERS.indexOf(specifier)];});
  const state=await h.loadMotivationBackend();assert.deepEqual(calls,A2_SPECIFIERS);
  assert.equal(state.backend.fixture,modules[0]);assert.equal(state.backend.runtime,modules[1]);assert.equal(state.backend.knowledge,modules[2]);
  assert.equal(h.motivationBackendState().available,true);
});
test('M2B isolated loader marks only exact missing targets pending; syntax/init/transitive/export faults fail',async()=>{
  for(const missing of A2_SPECIFIERS){
    const modules=isolatedNamespaces(),h=await contractHarness(async specifier=>{
      if(specifier===missing)throw Object.assign(new Error('missing target'),{code:'ERR_MODULE_NOT_FOUND',url:new URL(specifier,h.moduleUrl).href});
      return modules[A2_SPECIFIERS.indexOf(specifier)];
    });
    const state=await h.loadMotivationBackend();assertPending(state);assert.equal(state.missingSpecifier,missing);
  }
  const target=new URL('../../runtime/fixtures/motivation-village.mjs',import.meta.url).href;
  for(const cause of [new SyntaxError('motivation-village parse error'),new Error('motivation-village initializer failed'),
    Object.assign(new Error('transitive dependency missing'),{code:'ERR_MODULE_NOT_FOUND',url:new URL('./other-module.mjs',target).href}),
    Object.assign(new Error('missing URL metadata'),{code:'ERR_MODULE_NOT_FOUND'}),
    Object.assign(new Error('wrong error code'),{code:'ERR_INVALID_MODULE_SPECIFIER',url:target})]){
    const h=await contractHarness(async()=>{throw cause;});
    await assert.rejects(h.loadMotivationBackend(),error=>error===cause);
    assert.equal(h.motivationBackendState().dependencyPending,false);
    assert.throws(()=>h.requireMotivationBackend(),error=>error===cause);
  }
  const h=await contractHarness(async()=>({}));
  await assert.rejects(h.loadMotivationBackend(),error=>error.code==='UNSUPPORTED_VERSION' && /missing export/.test(error.message));
  assert.equal(h.motivationBackendState().dependencyPending,false);
});
test('M2B isolated format5 player adapter audits real rules before reading and returns only a detached PlayerDTO',async()=>{
  const modules=isolatedNamespaces(),systems=['isolated-systems'],calls=[],actions={rest:{available:true}};
  modules[0].motivationSystems=()=>systems;
  modules[1].describeMotivationPlayerActions=received=>{assert.equal(received,bundle);calls.push('actions');return actions;};
  const bundle={snapshot:{fixtureVersion:'1',fixtureId:'motivation-village',rulesVersion:MOTIVATION_RULES,simulationId:'isolated-dto',revision:4,tick:4,
    world:{playerModel:{actorId:'actor-4',wallet:100,inventory:{food:3,herbs:1}},actorModel:{actors:[
      {actorId:'actor-4',name:'玩家',occupation:'player',location:'village',simulationLevel:'exact',alive:true,deathTick:null,
        health:900,hunger:0,fatigue:20,needs:{health:100},hiddenPrivateField:100},
      {actorId:'actor-2',wallet:999}]} }},eventLog:[]};
  const h=await contractHarness(async specifier=>modules[A2_SPECIFIERS.indexOf(specifier)],(received,options)=>{
    calls.push('audit');assert.equal(received,bundle);assert.equal(options.rulesVersion,MOTIVATION_RULES);assert.equal(options.systems,systems);
  });
  await h.loadMotivationBackend();
  const dto=h.projectPlayerSnapshot(bundle);assert.deepEqual(calls,['audit','actions']);
  assert.deepEqual(Object.keys(dto).sort(),['apiVersion','simulationId','revision','tick','self','actions'].sort());
  assert.deepEqual(Object.keys(dto.self).sort(),['identity','health','hunger','fatigue','needs','wallet','inventory'].sort());
  assert.deepEqual(Object.keys(dto.self.identity).sort(),['actorId','name','occupation','location','simulationLevel','alive','deathTick'].sort());
  assert.equal(dto.self.wallet,100);assert.equal(dto.self.identity.actorId,'actor-4');
  dto.self.inventory.herbs=0;dto.self.needs.health=0;dto.actions.rest.available=false;
  assert.equal(bundle.snapshot.world.playerModel.inventory.herbs,1);assert.equal(bundle.snapshot.world.actorModel.actors[0].needs.health,100);
  assert.equal(actions.rest.available,true);assert.equal(bundle.snapshot.rulesVersion,MOTIVATION_RULES);
  const rejected=await contractHarness(async specifier=>modules[A2_SPECIFIERS.indexOf(specifier)],()=>{throw new Error('audit rejected');});
  await rejected.loadMotivationBackend();
  const unreadable={snapshot:{...bundle.snapshot,world:{get playerModel(){throw new Error('read before audit');}}},eventLog:[]};
  assert.throws(()=>rejected.projectPlayerSnapshot(unreadable),/audit rejected/);
});

// Only an exact missing A2 module is dependency-pending. Import/initialization faults fail
// these gates, while real legacy service tests remain executable without A2.

test('M2B dependency state is explicit and the format5 recognition follows the contract-frozen rules string',async()=>{
  const state=await loadMotivationBackend();
  assert.equal(motivationBackendState().available,Boolean(state.backend));
  assert.equal(MOTIVATION_RULES,'m-motivation-v1');
  if(state.backend){
    for(const [module,keys] of Object.entries(A2_EXPORTS))for(const key of keys){
      assert.equal(typeof state.backend[module][key],'function',`A2 ${module} export ${key}`);
    }
  }else{
    assertPending(state);
  }
  assert.equal(runtimeProfile(createPersonalityNeutral().bundle).serviceFormatVersion,1);
  assert.equal(runtimeProfile(createPlayerVillage().bundle).serviceFormatVersion,2);
  assert.equal(runtimeProfile(createPlayerPlayVillage().bundle).serviceFormatVersion,3);
  assert.equal(runtimeProfile(createMindVillage().bundle).serviceFormatVersion,4);
  const unknown={snapshot:{fixtureVersion:'1',rulesVersion:MOTIVATION_RULES,fixtureId:'not-motivation'},eventLog:[]};
  assert.throws(()=>runtimeProfile(unknown),e=>e.code==='UNSUPPORTED_VERSION');
  const forged={snapshot:{fixtureVersion:'1',rulesVersion:MOTIVATION_RULES,fixtureId:'motivation-village'},eventLog:[]};
  if(state.backend)assert.throws(()=>projectPublicSnapshot(forged),e=>e.code==='INVALID_INPUT');
  else assert.throws(()=>runtimeProfile(forged),
    e=>e.code==='UNSUPPORTED_VERSION'&&/motivation runtime module/.test(e.message));
});

test('M2B command parser keeps legacy IDs while the motivation profile cannot be created without its backend',async t=>{
  assert.equal(validateServiceCommandDto(intent('mind-day-legacy-external',0,'PlayerRest',{})).commandId,'mind-day-legacy-external');
  assert.equal(validateServiceCommandDto(intent('motivation-day-legacy-external',0,'PlayerRest',{})).commandId,'motivation-day-legacy-external');
  assert.throws(()=>parseCommandBytes(bytes(intent('society-day-1',0,'PlayerRest',{}))),e=>e.code==='INVALID_INPUT');
  const state=await loadMotivationBackend(),directory=path.join(await temporary(t),'motivation');
  if(state.dependencyPending){assertPending(state);await assert.rejects(createRuntimeOwner({directory,profile:'motivation-village'}),
    e=>e.code==='UNSUPPORTED_VERSION'&&/motivation runtime module/.test(e.message));
  }else{
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
  const state=await loadMotivationBackend();
  if(state.dependencyPending){
    assertPending(state);
    const forged={snapshot:{fixtureVersion:'1',rulesVersion:MOTIVATION_RULES,fixtureId:'motivation-village'},eventLog:[]};
    assert.throws(()=>validateServiceCommit({serviceFormatVersion:5,anchor:forged,commands:[],bundle:forged}),e=>e.code==='UNSUPPORTED_VERSION');
    return;
  }
  const village=state.backend.fixture.createMotivationVillage().bundle;
  assert.equal(runtimeProfile(village).serviceFormatVersion,5);
  assert.doesNotThrow(()=>validateServiceCommit({serviceFormatVersion:5,anchor:village,commands:[],bundle:village}));
});

test('M2B reserves the three internal day namespaces for the motivation rules and keeps old profile rules',async t=>{
  const play=createPlayerPlayVillage().bundle;
  assert.doesNotThrow(()=>transitionServiceCommand(play,intent('motivation-day-legacy-external',0,'PlayerRest',{})));
  assert.equal(transitionServiceCommand(play,time('motivation-day-legacy-time')).receipt.toRevision,6);
  const state=await loadMotivationBackend();
  if(state.dependencyPending){assertPending(state);t.skip(`A2 ${state.missingSpecifier} not delivered; namespace integration pending`);return;}
  const village=state.backend.fixture.createMotivationVillage().bundle;
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
  const filesBefore=await storedBytes(directory);
  await getJson(server.url+'/api/runtime/minds');await getJson(server.url+'/api/runtime/snapshot');await getJson(server.url+'/api/runtime/minds');
  assert.deepEqual(await storedBytes(directory),filesBefore,'read-only consumers must not change stored bytes');
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
  const state=await loadMotivationBackend(),directory=path.join(await temporary(t),'world');
  if(state.dependencyPending){
    assertPending(state);
    await assert.rejects(startRuntimeServer({directory,profile:'motivation-village',port:0,inspectMind:true}),
      e=>e.code==='UNSUPPORTED_VERSION'&&/motivation runtime module/.test(e.message));
    t.skip(`A2 ${state.missingSpecifier} not delivered; real service5 HTTP pending`);
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

async function checkDurableSaveFault(t,profile){
  const directory=path.join(await temporary(t),'world');
  let failNextLink=false,linkCalls=0,injectedFailures=0;
  const io=new Proxy(fs,{get(target,prop){
    if(prop==='link')return async(...args)=>{linkCalls++;
      if(failNextLink){failNextLink=false;injectedFailures++;throw Object.assign(new Error('injected link failure'),{code:'EACCES'});}
      return target.link(...args);
    };
    const value=Reflect.get(target,prop,target);
    return typeof value==='function'?value.bind(target):value;
  }});
  const owner=await createRuntimeOwner({directory,profile,writable:true},io);t.after(()=>owner.close());
  const before=ownerReadings(owner),diskBefore=await storedBytes(directory);
  assert.equal(linkCalls,1,'initial publication must really link the commit');
  assert.ok(diskBefore['service-commit-r0.json'],'initial durable commit exists');
  const dto=intent('motivation-save-fault',0,'PlayerRest',{});
  failNextLink=true;
  await assert.rejects(owner.submit(dto),e=>e.code==='SAVE_FAILED' && e.cause?.code==='EACCES');
  assert.equal(injectedFailures,1,'the request reached durable publication');
  assert.deepEqual(ownerReadings(owner),before,'all full projections and capabilities stay old');
  assert.deepEqual(await storedBytes(directory),diskBefore,'failed publication preserves files and bytes');
  const receipt=await owner.submit(dto);
  assert.equal(receipt.status,'committed');
  assert.ok(receipt.toRevision>before.public.revision);
  const after=ownerReadings(owner),diskAfter=await storedBytes(directory),filename=`service-commit-r${receipt.toRevision}.json`;
  assert.deepEqual(Object.keys(diskAfter).sort(),['service-commit-r0.json',filename].sort());
  assert.equal(diskAfter['service-commit-r0.json'],diskBefore['service-commit-r0.json']);
  const envelope=JSON.parse(diskAfter[filename]);
  assert.equal(envelope.commands.length,1);assert.deepEqual(envelope.commands[0].dto,dto);
  assert.deepEqual(envelope.commands[0].receipt,receipt);
  for(const projection of [after.public,after.player,after.mind])assert.equal(projection.revision,receipt.toRevision);
  assert.deepEqual(await owner.submit(dto),receipt,'same-ID retry returns the durable receipt');
  assert.equal(linkCalls,3,'retry does not publish another file');
  await owner.close();
  const reopened=await createRuntimeOwner({directory,writable:true});t.after(()=>reopened.close());
  assert.deepEqual(ownerReadings(reopened),after,'reopen restores all full projections');
  assert.deepEqual(await reopened.submit(dto),receipt,'same-ID reopen retry is idempotent');
  await assert.rejects(reopened.submit(time('stale-after-reopen',0,1)),e=>e.code==='REVISION_CONFLICT');
  assert.deepEqual(await storedBytes(directory),diskAfter,'reopen and retries do not change durable bytes');
}
test('M2B real M1 save-fault boundary keeps full projections and bytes, then retry/reopen commit once',async t=>{
  await checkDurableSaveFault(t,'mind-village');
});
test('M2B real M2 save-fault boundary keeps full projections and bytes, then retry/reopen commit once',async t=>{
  const state=await loadMotivationBackend();
  if(state.dependencyPending){assertPending(state);t.skip(`A2 ${state.missingSpecifier} not delivered; real service5 durability pending`);return;}
  await checkDurableSaveFault(t,'motivation-village');
});
