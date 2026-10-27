import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {createPlayableCampaignVillage,createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {computeCampaignIntent,campaignRuntimeHooks} from '../../runtime/core/scene-campaign-runtime.mjs';
import {performCampaignTick} from '../../runtime/core/command-engine.mjs';
import {validateCampaignEventLogWithEvidence} from '../../runtime/core/event-log.mjs';
import {createAuditedBundle,deriveCampaignBundle,hasStrictReplayEvidence} from '../../runtime/core/world-state.mjs';
import {createAuditedServiceCommit,validateServiceCommit} from '../../runtime/service/service-commit.mjs';

const parentRoot=process.env.REPLAY_PARENT_ROOT??path.resolve('../Narraverse-Long-Recovery');
const parentFile=path.join(parentRoot,'runtime/service/service-commit.mjs');
if(process.env.REPLAY_PARENT_ROOT&&!existsSync(parentFile))throw new Error('REPLAY_PARENT_ROOT does not contain the parent service');
const parent=existsSync(parentFile)?await import(pathToFileURL(parentFile)):null;
const differential=(name,fn)=>test(name,{skip:parent?false:'Set REPLAY_PARENT_ROOT to the parent checkout'},fn);
function act(bundle,id,type,payload={}){
 const dto={version:5,commandId:id,expectedRevision:bundle.snapshot.revision,type,payload};
 const result=computeCampaignIntent(bundle,dto);
 return {bundle:result.bundle,entry:{dto,receipt:result.receipt}};
}
function make(factory=createPlayableCampaignVillage,anchorHistory=false){
 let anchor=factory(42,'reuse-differential').bundle;
 if(anchorHistory)anchor=act(anchor,'before-anchor','AdvanceTime',{ticks:2}).bundle;
 let bundle=anchor;const commands=[];
 for(const [id,type,payload] of [['quest','PlayerQuest',{questId:'livelihood',action:'accept'}],['rejected','PlayerQuest',{questId:'forest-route',action:'claim'}],['time','AdvanceTime',{ticks:3}],['abandon','PlayerQuest',{questId:'livelihood',action:'abandon'}]]){
  const r=act(bundle,id,type,payload);bundle=r.bundle;commands.push(r.entry);
 }
 return {serviceFormatVersion:11,anchor,commands,bundle};
}
function outcome(fn,raw){try{fn(raw);return 'accepted';}catch(e){return e.code??e.name;}}
function same(raw){const original=structuredClone(raw),a=outcome(parent.validateServiceCommit,raw),b=outcome(validateServiceCommit,raw);assert.equal(b,a);assert.deepEqual(raw,original);return a;}

differential('genesis journal, rejected and zero tick commands preserve parent audit and immutable result',()=>{
 const raw=make();assert.equal(raw.anchor.snapshot.tick,0);assert.equal(raw.commands[0].receipt.durationTicks,0);
 assert.equal(raw.commands[1].receipt.outcome,'rejected');assert.equal(same(raw),'accepted');
 const expected=parent.createAuditedServiceCommit(structuredClone(raw)),actual=createAuditedServiceCommit(structuredClone(raw));
 assert.deepEqual(actual,expected);assert.ok(Object.isFrozen(actual.bundle.snapshot.world));
});
differential('historical anchors and older fixture fall back and match the independent parent',()=>{
 const anchor=createMemoryCampaignVillage(42,'reuse-legacy').bundle;
 const old=act(anchor,'legacy-wait','AdvanceTime',{ticks:3});
 const firstAnchor=createPlayableCampaignVillage(42,'reuse-instant-anchor').bundle;
 const accepted=act(firstAnchor,'anchor-accept','PlayerQuest',{questId:'livelihood',action:'accept'});
 const abandoned=act(accepted.bundle,'later-abandon','PlayerQuest',{questId:'livelihood',action:'abandon'});
 const instant={serviceFormatVersion:11,anchor:accepted.bundle,commands:[abandoned.entry],bundle:abandoned.bundle};
 assert.equal(instant.anchor.snapshot.tick,0);assert.ok(instant.anchor.snapshot.revision>0);
 for(const e of [make(createPlayableCampaignVillage,true),instant,{serviceFormatVersion:11,anchor,commands:[old.entry],bundle:old.bundle}])assert.equal(same(e),'accepted');
});
differential('pre-certified incremental successor retains parent behavior',()=>{
 const base=createPlayableCampaignVillage(42,'reuse-certified').bundle;
 const certified=createAuditedBundle(base,{rulesVersion:'d-campaign-v1',systems:campaignSystems()});
 const dto={version:5,commandId:'certified-time',expectedRevision:0,type:'AdvanceTime',payload:{ticks:2}};
 const result=deriveCampaignBundle(certified,dto);
 assert.equal(hasStrictReplayEvidence(result.bundle),false);
 const raw={serviceFormatVersion:11,anchor:certified,commands:[{dto,receipt:result.receipt}],bundle:result.bundle};
 assert.deepEqual(createAuditedServiceCommit(raw),parent.createAuditedServiceCommit(structuredClone(raw)));
});
test('strict replay evidence is private and bound to a freshly audited object',()=>{
 const raw=make().bundle,options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
 assert.equal(hasStrictReplayEvidence(raw),false);
 const audited=createAuditedBundle(raw,options);assert.equal(hasStrictReplayEvidence(audited),true);
 const copy=structuredClone(audited);Object.freeze(copy);assert.equal(hasStrictReplayEvidence(copy),false);
 copy.snapshot.world.playerModel.wallet++;assert.throws(()=>createAuditedBundle(copy,options));
});
differential('missing, duplicate, reordered, modified and hidden commands cannot reuse a proof',()=>{
 const original=make();const cases=[
  e=>e.commands.pop(),e=>e.commands.push(structuredClone(e.commands.at(-1))),
  e=>[e.commands[0],e.commands[1]]=[e.commands[1],e.commands[0]],
  e=>e.commands[0].dto.payload.action='abandon',e=>e.commands[1].receipt.outcome='succeeded',
  e=>e.commands[2].dto.expectedRevision++,e=>e.commands[2].receipt.fromTick++,e=>e.commands=[],
  e=>e.bundle=performCampaignTick(e.bundle)
 ];
 for(const mutate of cases){const e=structuredClone(original);mutate(e);assert.notEqual(same(e),'accepted');}
});
differential('anchor, final facts and world tampering still match parent rejection',()=>{
 const original=make();const cases=[
  e=>e.anchor.snapshot.world.playerModel.wallet++,e=>e.anchor.snapshot.rng.seed++,
  e=>e.anchor.snapshot.scheduledTasks[0].nextDueTick++,e=>e.bundle.snapshot.world.playerModel.wallet++,
  e=>e.bundle.snapshot.rng.seed++,e=>e.bundle.snapshot.nextEntityId++,e=>e.bundle.eventLog.pop(),
  e=>e.bundle.snapshot.world.memoryModel.config.society.player.initialFood++
 ];
 for(const mutate of cases){const e=structuredClone(original);mutate(e);assert.notEqual(same(e),'accepted');}
});
differential('an unjournalled time gap falls back and is rejected like the parent',()=>{
 const anchor=createPlayableCampaignVillage(42,'reuse-gap').bundle;
 const first=act(anchor,'gap-first','PlayerQuest',{questId:'livelihood',action:'accept'});
 const shifted=performCampaignTick(first.bundle),last=act(shifted,'gap-last','AdvanceTime',{ticks:2});
 assert.notEqual(same({serviceFormatVersion:11,anchor,commands:[first.entry,last.entry],bundle:last.bundle}),'accepted');
});
differential('raw accessors are rejected without being invoked on either audit',()=>{
 for(const audit of [parent.validateServiceCommit,validateServiceCommit,parent.createAuditedServiceCommit,createAuditedServiceCommit]){
  const e=make();let invoked=0;Object.defineProperty(e.commands[0].dto,'payload',{enumerable:true,get(){invoked++;return {};}});
  assert.throws(()=>audit(e));assert.equal(invoked,0);
 }
});
test('new observational helpers reject accessors without invoking them',()=>{
 for(const check of [s=>campaignRuntimeHooks.replayOrigin(s),s=>campaignRuntimeHooks.validateHistoryWithEvidence(s,[]),s=>validateCampaignEventLogWithEvidence([],s,campaignSystems())]){
  let invoked=0;const s={};Object.defineProperty(s,'fixtureVersion',{enumerable:true,get(){invoked++;return '6';}});
  assert.throws(()=>check(s));assert.equal(invoked,0);
 }
});
differential('proxy input uses the original replay path and matches parent behavior',()=>{
 function proxied(){const e=make();let reads=0;const payload=e.commands[0].dto.payload;
  e.commands[0].dto.payload=new Proxy(payload,{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver);}});
  return {e,reads:()=>reads};
 }
 const a=proxied(),b=proxied(),old=outcome(parent.createAuditedServiceCommit,a.e),current=outcome(createAuditedServiceCommit,b.e);
 assert.equal(current,old);assert.equal(b.reads(),a.reads());
});
differential('raw negative zero retains the parent strict comparison behavior',()=>{
 const a=make();a.commands[0].receipt.fromTick=-0;
 assert.notEqual(outcome(parent.createAuditedServiceCommit,a),'accepted');
 assert.equal(outcome(createAuditedServiceCommit,a),outcome(parent.createAuditedServiceCommit,a));
 const zero=make();zero.bundle.snapshot.world.encounterModel.inputHistory[0].receipt.fromTick=-0;
 assert.notEqual(outcome(parent.createAuditedServiceCommit,zero),'accepted');
 assert.equal(outcome(createAuditedServiceCommit,zero),outcome(parent.createAuditedServiceCommit,zero));
});
