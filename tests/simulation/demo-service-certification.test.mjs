import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedServiceCommit,advanceAuditedServiceCommit,validateServiceCommit,saveServiceCommit,loadServiceCommit,loadRuntimeServiceCommit} from '../../runtime/service/service-commit.mjs';

test('service audit checks command budget before copying and never invokes accessors',()=>{
 const {bundle}=createCampaignVillage(42,'audit-budget');
 const genesis={serviceFormatVersion:11,anchor:bundle,commands:[],bundle};
 for(const audit of [validateServiceCommit,createAuditedServiceCommit]){
  for(const commands of [Array(129),Array(129).fill(null)])
   assert.throws(()=>audit({...genesis,commands}),{code:'LIMIT_EXCEEDED'});
  assert.throws(()=>audit({...genesis,commands:Array(1)}),{code:'INVALID_INPUT'});
  let calls=0;
  const accessor={...genesis};Object.defineProperty(accessor,'commands',{enumerable:true,get(){calls++;return [];}});
  assert.throws(()=>audit(accessor),{code:'INVALID_INPUT'});
  const commands=[];Object.defineProperty(commands,'0',{enumerable:true,get(){calls++;return null;}});
  assert.throws(()=>audit({...genesis,commands}),{code:'INVALID_INPUT'});
  assert.equal(calls,0);
 }
});

test('live immutable service prefix equals independent full replay and rejects external forgeries',async()=>{
 const directory=await fs.mkdtemp(path.resolve('artifacts/d4e12/cert-'));
 const {bundle}=createCampaignVillage(42,'demo-cert');
 let state=createAuditedServiceCommit({serviceFormatVersion:11,anchor:bundle,commands:[],bundle});
 const next=(type,payload={})=>{state=advanceAuditedServiceCommit(state,{version:5,commandId:`cert-${state.commands.length}`,expectedRevision:state.bundle.snapshot.revision,type,payload});};
 assert(Object.isFrozen(state)&&Object.isFrozen(state.bundle.snapshot.world));
 next('MarchSet',{x:16,y:7});next('MarchStep');next('MarchPause');
 assert(Object.isFrozen(state.commands)&&Object.isFrozen(state.commands.at(-1).dto.payload));
 assert.throws(()=>{state.commands.at(-1).receipt.outcome='rejected';},TypeError);
 validateServiceCommit(state); // Independent whole-journal audit remains callable.
 await saveServiceCommit(state,directory);
 const loaded=await loadServiceCommit(path.join(directory,`service-commit-r${state.bundle.snapshot.revision}.json`));
 assert.deepEqual(loaded,state);
 assert.equal(Object.isFrozen(loaded),false);
 const immutableLoaded=await loadRuntimeServiceCommit(path.join(directory,`service-commit-r${state.bundle.snapshot.revision}.json`));
 assert.deepEqual(immutableLoaded,state);assert(Object.isFrozen(immutableLoaded.bundle.snapshot.world));
 assert.equal(createAuditedServiceCommit(immutableLoaded),immutableLoaded);
 const forged=structuredClone(state);forged.commands.at(-1).receipt.outcome='rejected';
 assert.throws(()=>createAuditedServiceCommit(forged));
 await assert.rejects(saveServiceCommit(forged,directory));
 const forgedFile=path.join(directory,'forged.json');await fs.writeFile(forgedFile,JSON.stringify(forged));
 await assert.rejects(loadRuntimeServiceCommit(forgedFile),{code:'INVALID_SERVICE_COMMIT'});
 assert.throws(()=>advanceAuditedServiceCommit(forged,{version:5,commandId:'forged',expectedRevision:forged.bundle.snapshot.revision,type:'MarchResume',payload:{}}));
 assert.throws(()=>advanceAuditedServiceCommit(state,{...state.commands[0].dto,expectedRevision:state.bundle.snapshot.revision}));
 const before=await fs.readdir(directory);
 const failedIo=new Proxy(fs,{get(t,k){if(k==='link')return async()=>{throw Object.assign(new Error('injected publication failure'),{code:'EIO'});};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});
 const candidate=advanceAuditedServiceCommit(state,{version:5,commandId:'resume-after-failure',expectedRevision:state.bundle.snapshot.revision,type:'MarchResume',payload:{}});
 await assert.rejects(saveServiceCommit(candidate,directory,failedIo));
 assert.deepEqual(await fs.readdir(directory),before);
 assert.deepEqual(await loadServiceCommit(path.join(directory,`service-commit-r${state.bundle.snapshot.revision}.json`)),state);
});
