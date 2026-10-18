import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';
import {executeAuditedCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {createAuditedServiceCommit,createCampaignLiveWriter,validateServiceCommit} from '../../runtime/service/service-commit.mjs';

test('fixed successors equal the unchanged complete oracle, including rejected and zero-tick commands',()=>{
 const {bundle,systems}=createCampaignVillage(42);
 let live=createAuditedBundle(bundle,{rulesVersion:bundle.snapshot.rulesVersion,systems}),full=structuredClone(bundle);
 const commands=[['PlayerGiftFood',{recipientId:'actor-2'}],['MarchSet',{x:16,y:7}],['MarchStep',{}],['MarchPause',{}],['MarchSet',{x:4,y:7}],['MarchStep',{}],['AdvanceTime',{ticks:2}]];
 for(const [index,[type,payload]] of commands.entries()){
  const dto={version:5,commandId:'derive-'+index,expectedRevision:live.snapshot.revision,type,payload};
  const next=deriveCampaignBundle(live,dto),oracle=executeAuditedCampaignIntent(full,dto);
  assert.deepEqual(next,oracle);assert(Object.isFrozen(next.bundle.snapshot.world));
  live=next.bundle;full=structuredClone(oracle.bundle);
 }
 const last=live.snapshot.world.encounterModel.inputHistory.at(-1);
 assert.throws(()=>deriveCampaignBundle(live,last.dto));
});

test('copies, arbitrary candidates, unknown profiles and getters cannot acquire a successor proof',async()=>{
 const {bundle,systems}=createCampaignVillage(42),dto={version:5,commandId:'x',expectedRevision:0,type:'AdvanceTime',payload:{ticks:1}};
 for(const raw of [bundle,structuredClone(bundle),Object.freeze(structuredClone(bundle))])assert.throws(()=>deriveCampaignBundle(raw,dto));
 const audited=createAuditedBundle(bundle,{rulesVersion:bundle.snapshot.rulesVersion,systems});
 let calls=0;const bad={...dto};Object.defineProperty(bad,'payload',{enumerable:true,get(){calls++;return {ticks:1};}});
 assert.throws(()=>deriveCampaignBundle(audited,bad));assert.equal(calls,0);
 assert.throws(()=>deriveCampaignBundle(audited,{...dto,trusted:true}));
 const drift=new Proxy({...dto},{get(target,key,receiver){return key==='version'?3:Reflect.get(target,key,receiver);}});
 assert.throws(()=>deriveCampaignBundle(audited,drift));
 assert.throws(()=>deriveCampaignBundle(new Proxy(audited,{}),dto));
 const commit=createAuditedServiceCommit({serviceFormatVersion:11,anchor:bundle,commands:[],bundle});
 await assert.rejects(createCampaignLiveWriter(structuredClone(commit),'artifacts/unused','x'));
 const forged=structuredClone(commit);forged.bundle.snapshot.rng.state++;
 assert.throws(()=>validateServiceCommit(forged));
});
