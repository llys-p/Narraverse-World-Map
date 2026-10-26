import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';import path from 'node:path';
import {createPlayableCampaignVillage,createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';import {createAuditedServiceCommit,validateServiceCommit,advanceAuditedServiceCommit} from '../../runtime/service/service-commit.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
async function parentAudit(){return import(pathToFileURL(path.join(process.env.COLD_PARENT_ROOT??fileURLToPath(new URL('../../../Narraverse-Recovery/',import.meta.url)),'runtime/service/service-commit.mjs')));}
function envelope(factory=createPlayableCampaignVillage){
 let anchor=createAuditedBundle(factory(42,'cold-contract').bundle,options);anchor=deriveCampaignBundle(anchor,{version:5,commandId:'anchored-wait',expectedRevision:0,type:'AdvanceTime',payload:{ticks:8}}).bundle;let bundle=anchor;const commands=[];
 for(const [i,[type,payload]] of [['PlayerQuest',{questId:'livelihood',action:'accept'}],['PlayerQuest',{questId:'forest-route',action:'claim'}],['PlayerWork',{}],['PlayerBuy',{product:'food',quantity:1}],['PlayerQuest',{questId:'livelihood',action:'claim'}],['AdvanceTime',{ticks:2}]].entries()){
  const dto={version:5,commandId:'cold-entry-'+i,expectedRevision:bundle.snapshot.revision,type,payload},r=computeCampaignIntent(bundle,dto);bundle=r.bundle;commands.push({dto,receipt:r.receipt});
 }
 return {serviceFormatVersion:11,anchor,commands,bundle};
}
test('cold replay equals the parent oracle for anchored history, rejected and zero-tick commands, then remains safely advanceable',async()=>{
 const raw=envelope(),before=structuredClone(raw),parent=await parentAudit();const audited=createAuditedServiceCommit(raw);assert.deepEqual(audited,parent.createAuditedServiceCommit(structuredClone(raw)));assert.deepEqual(raw,before);assert.ok(Object.isFrozen(audited.bundle.snapshot.world));
 const next=advanceAuditedServiceCommit(audited,{version:5,commandId:'after-cold',expectedRevision:audited.bundle.snapshot.revision,type:'AdvanceTime',payload:{ticks:1}});assert.equal(next.bundle.snapshot.tick,audited.bundle.snapshot.tick+1);validateServiceCommit(structuredClone(next));
 raw.bundle.snapshot.world.playerModel.wallet++;raw.commands[0].dto.payload.action='abandon';assert.deepEqual(audited.bundle,before.bundle);assert.deepEqual(audited.commands,before.commands);
});
test('independent full audit and journal checks both reject plausible changes, sparse inputs, duplicate IDs and accessors without invoking them',async()=>{
 const raw=envelope(),parent=await parentAudit();let getters=0;
 const mutations=[e=>e.commands[0].receipt.result.rank++,e=>e.commands[1].receipt.outcome='succeeded',e=>e.commands[2].dto.expectedRevision++,e=>e.commands[3].dto.payload.quantity=2,e=>e.commands.push(structuredClone(e.commands.at(-1))),e=>e.bundle.snapshot.world.playerModel.wallet++,e=>e.anchor.snapshot.world.playerModel.wallet++,e=>e.bundle.eventLog.pop(),e=>e.commands=Array(1),e=>Object.defineProperty(e.commands[0].dto,'payload',{enumerable:true,get(){getters++;return {};}})];
 for(const mutate of mutations){const bad=structuredClone(raw);mutate(bad);assert.throws(()=>validateServiceCommit(bad));assert.throws(()=>parent.validateServiceCommit(bad));}assert.equal(getters,0);
 const empty={serviceFormatVersion:11,anchor:raw.anchor,commands:[],bundle:raw.anchor};assert.deepEqual(createAuditedServiceCommit(empty),parent.createAuditedServiceCommit(structuredClone(empty)));
});
test('fixture5 keeps the original complete audit path and cannot acquire the new command budget',async()=>{
 const {bundle}=createMemoryCampaignVillage(),e={serviceFormatVersion:11,anchor:bundle,commands:[],bundle};assert.deepEqual(createAuditedServiceCommit(e),(await parentAudit()).createAuditedServiceCommit(structuredClone(e)));
 const bad=structuredClone(e);bad.commands=Array.from({length:129},()=>({}));assert.throws(()=>validateServiceCommit(bad),{code:'LIMIT_EXCEEDED'});
});
test('playable social memory, dialogue, real marching and combat survive the same complete cold audit as the parent',async()=>{
 const anchor=createPlayableCampaignVillage(42,'cold-integrated').bundle,commands=[];let bundle=anchor,n=0;
 const act=(type,payload={})=>{const dto={version:5,commandId:'integrated-'+(++n),expectedRevision:bundle.snapshot.revision,type,payload},r=computeCampaignIntent(bundle,dto);assert.equal(r.receipt.outcome,'succeeded',type);bundle=r.bundle;commands.push({dto,receipt:r.receipt});};
 const march=target=>{act('MarchSet',target);let steps=0;while(bundle.snapshot.world.mapModel.order.status!=='arrived'){assert.ok(steps++<40);act(bundle.snapshot.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep');}};
 act('PlayerInteract',{targetId:'actor-2',action:'help'});act('PlayerDialogue',{targetId:'actor-2',utterance:'刚才修好了些。',reply:'我记得你帮忙修过工具。',memoryRefs:[],proposal:null,model:'controlled-cold-test',seal:'0'.repeat(64)});
 march({x:16,y:7});act('EncounterBegin');const id=bundle.snapshot.world.encounterModel.encounter.encounterId;act('EncounterAction',{encounterId:id,action:'attack'});act('EncounterAction',{encounterId:id,action:'attack'});march({x:4,y:7});
 const raw={serviceFormatVersion:11,anchor,commands,bundle},parent=await parentAudit();assert.deepEqual(createAuditedServiceCommit(raw),parent.createAuditedServiceCommit(structuredClone(raw)));assert.equal(bundle.snapshot.world.mapModel.socialModel.asset.condition,80);assert.equal(bundle.snapshot.world.mapModel.negotiationModel.turns.at(-1).reply,'我记得你帮忙修过工具。');
});
