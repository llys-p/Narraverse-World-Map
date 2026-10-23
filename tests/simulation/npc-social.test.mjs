import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialCampaignVillage,createCampaignVillage,createNpcCampaignVillage,defaultCampaignVillageConfig,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {executeAuditedCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {mapView,mapDistance} from '../../runtime/core/campaign-map.mjs';
import {socialWorkReady} from '../../runtime/core/npc-social.mjs';
import {validSocialPayload,validSocialView,validSocialMapView} from '../../runtime-social-contract.mjs';
import {validateCampaignReceipt} from '../../runtime-campaign-contract.mjs';
import {describeActionReceipt,socialInteractionActions} from '../../demo-runtime-interactions.mjs';

const world=b=>b.snapshot.world,mind=b=>world(b).mapModel.socialModel.actors[1],asset=b=>world(b).mapModel.socialModel.asset;
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
function initial(config,factory=createSocialCampaignVillage){const {bundle}=factory(42,'social-test',config);return createAuditedBundle(bundle,options);}
const dto=(b,type,payload={})=>({version:5,commandId:`social-${b.snapshot.revision}-${type}`,expectedRevision:b.snapshot.revision,type,payload});
const run=(b,type,payload={})=>deriveCampaignBundle(b,dto(b,type,payload));
const social=(b,action,topic='needs')=>run(b,'PlayerInteract',{targetId:'actor-2',action,...(action==='talk'?{topic}:{})});
const until=(b,tick)=>run(b,'AdvanceTime',{ticks:tick-b.snapshot.tick}).bundle;
function move(b,point){b=run(b,'MarchSet',point).bundle;let count=0;
 while(world(b).mapModel.order.status!=='arrived'){assert.ok(count++<20);b=run(b,world(b).mapModel.order.status==='paused'?'MarchResume':'MarchStep').bundle;}return b;}
let alonePrefix;
const unattended=()=>alonePrefix??=move(until(initial(),112),{x:5,y:8});

test('actual repairs build trust, borrowing and returning conserve one owned tool; refusal is not a transfer',()=>{
 let b=initial();const refused=social(b,'ask-help');assert.equal(refused.receipt.result.effect,'refused');assert.equal(asset(refused.bundle).holderId,'actor-2');
 b=social(b,'help').bundle;assert.equal(asset(b).condition,80);assert.equal(mind(b).trust,60);
 b=social(b,'help').bundle;assert.equal(asset(b).condition,100);assert.equal(mind(b).trust,70);
 const noRepair=social(b,'help');assert.equal(noRepair.receipt.outcome,'rejected');assert.equal(noRepair.receipt.result.code,'NOT_DAMAGED');assert.equal(noRepair.bundle.snapshot.tick,2);
 const loan=social(b,'ask-help');b=loan.bundle;assert.equal(loan.receipt.result.effect,'lent');assert.equal(asset(b).holderId,'actor-4');assert.equal(asset(b).ownerId,'actor-2');assert.equal(asset(b).loanDueTick,147);
 b=social(b,'return').bundle;assert.equal(asset(b).holderId,'actor-2');assert.equal(asset(b).loanDueTick,null);assert.equal(mind(b).memories.filter(m=>m.kind==='return').length,1);
 assert.equal(world(b).mapModel.socialModel.actors[0].memories.some(m=>m.kind==='help'&&m.channel==='witness'),true);
 const gift=run(initial(),'PlayerGiftFood',{recipientId:'actor-2'}).bundle;assert.equal(mind(gift).trust,55);assert.equal(mind(gift).memories.at(-1).kind,'gift');
 assert.equal(world(gift).memoryModel.observer.actors[1].memories.some(m=>m.observable.type==='food-gift'),true);
});

test('seen theft is caught; robbery meets resistance or yields under an actual imbalance',()=>{
 const caught=social(initial(),'steal');assert.equal(caught.receipt.result.effect,'caught');assert.equal(asset(caught.bundle).holderId,'actor-2');
 assert.equal(mind(caught.bundle).memories.at(-1).actorId,'actor-4');
 assert.equal(world(caught.bundle).mapModel.socialModel.actors[0].memories.at(-1).channel,'witness');
 const resisted=social(initial(),'rob');assert.equal(resisted.receipt.result.effect,'resisted');assert.equal(asset(resisted.bundle).holderId,'actor-2');
 const config=defaultCampaignVillageConfig('earn-then-buy');config.memory.society.actors.initialActors[1].health=600;
 const taken=social(initial(config),'rob');assert.equal(taken.receipt.result.effect,'taken');assert.equal(asset(taken.bundle).holderId,'actor-4');assert.equal(mind(taken.bundle).trust,15);assert.equal(mind(taken.bundle).fear,35);
 let intimidated=move(initial(),{x:5,y:8});intimidated=social(intimidated,'threaten').bundle;intimidated=social(intimidated,'threaten').bundle;
 const coerced=social(intimidated,'rob');assert.equal(coerced.receipt.result.effect,'taken');assert.equal(asset(coerced.bundle).holderId,'actor-4');assert.equal(mind(coerced.bundle).trust,0);
 const label=describeActionReceipt(resisted.receipt,dto(initial(),'PlayerInteract',{targetId:'actor-2',action:'rob'}));
 assert.match(label.summary,/抵抗/);assert.equal(label.changes.some(x=>x.includes('由你持有')),false);
});

test('unseen theft is later discovered without inventing a culprit; lost tools block wages',()=>{
 let b=unattended();assert.equal(world(b).mapModel.npcs[1].y,6);
 const stolen=social(b,'steal');b=stolen.bundle;assert.equal(stolen.receipt.result.effect,'taken');assert.equal(stolen.receipt.result.speech,'');
 assert.equal(mind(b).memories.length,0);assert.equal(mind(b).knownHolder,'actor-2');assert.equal(mind(b).trust,50);
 assert.equal(socialWorkReady(world(b).mapModel),false);
 b=until(b,156);assert.equal(world(b).societyModel.agents[1].state.wallet,0);
 const missing=mind(b).memories.find(m=>m.kind==='missing');assert.ok(missing);assert.equal(missing.actorId,null);assert.equal(missing.channel,'discovery');
 assert.equal(mind(b).knownHolder,'unknown');assert.equal(mind(b).trust,50);assert.equal(mind(b).grievance,0);
 const reply=social(b,'talk','past');assert.match(reply.receipt.result.speech,/没有看见是谁/);assert.deepEqual(reply.receipt.result.memoryRefs,[missing.eventSeq]);
 validateBundle(reply.bundle,options);
});

test('unseen damage is discovered without blame, and death during an interaction prevents its effect',()=>{
 let b=social(unattended(),'smash').bundle;assert.equal(mind(b).memories.length,0);assert.equal(mind(b).knownCondition,60);
 b=until(b,156);assert.equal(mind(b).knownCondition,20);assert.equal(mind(b).grievance,0);
 assert.equal(mind(b).memories.find(m=>m.kind==='damage').actorId,null);
 const dying=until(initial(defaultCampaignVillageConfig('no-food')),143),prior=asset(dying).condition;
 const action=social(dying,'help');assert.equal(action.receipt.durationTicks,1);assert.equal(action.receipt.outcome,'rejected');assert.equal(action.receipt.result.code,'RECIPIENT_DEAD');assert.equal(asset(action.bundle).condition,prior);
});

test('damage disables work, repair is real, and helpful acts do not erase witnessed harm',()=>{
 const broken=social(initial(),'smash');let b=broken.bundle;const harmSeq=broken.receipt.result.sourceEventSeq;
 assert.equal(asset(b).condition,20);assert.equal(socialWorkReady(world(b).mapModel),false);
 b=social(b,'help').bundle;assert.equal(asset(b).condition,40);assert.equal(socialWorkReady(world(b).mapModel),true);
 assert.equal(mind(b).trust,35);assert.equal(mind(b).fear,10);assert.equal(mind(b).grievance,26);
 const past=social(b,'talk','past');b=past.bundle;assert.match(past.receipt.result.speech,/砸坏/);assert.deepEqual(past.receipt.result.memoryRefs,[harmSeq]);
 b=social(b,'apologize').bundle;const after=mind(b).grievance;const again=social(b,'apologize');assert.equal(again.receipt.result.effect,'refused');assert.equal(mind(again.bundle).grievance,after);
 assert.ok(mind(again.bundle).memories.some(m=>m.eventSeq===harmSeq));
});

test('threat changes travel, action completion rechecks distance, waiting away calms fear without repairing trust',()=>{
 let b=move(initial(),{x:5,y:8});b=social(b,'threaten').bundle;b=social(b,'threaten').bundle;
 assert.equal(mind(b).fear,50);const before=world(b).mapModel.npcs[1];b=until(b,11);
 const trust=mind(b).trust,grievance=mind(b).grievance,memories=mind(b).memories.length;
 const late=social(b,'talk');assert.equal(late.receipt.outcome,'rejected');assert.equal(late.receipt.result.code,'NOT_COLOCATED');assert.equal(late.receipt.durationTicks,1);
 b=late.bundle;assert.equal(mind(b).memories.length,memories);assert.ok(mapDistance(world(b).mapModel.npcs[1],world(b).mapModel.position)>mapDistance(before,world(b).mapModel.position));
 b=move(b,{x:12,y:7});const fear=mind(b).fear;b=until(b,48);
 assert.ok(mind(b).fear<fear);assert.equal(mind(b).trust,trust);assert.equal(mind(b).grievance,grievance);
 const projection=mapView(b,100);assert.equal(projection.social.npc,null);assert.equal(projection.social.asset,null);assert.equal(projection.actors.some(a=>a.actorId==='actor-2'),false);
});

test('a known broken promise is recorded once, while repeated recollection never reapplies relationship damage',()=>{
 let b=initial();b=social(b,'help').bundle;b=social(b,'help').bundle;b=social(b,'ask-help').bundle;b=until(b,148);
 assert.equal(mind(b).memories.filter(m=>m.kind==='overdue').length,1);assert.equal(mind(b).trust,60);assert.equal(mind(b).grievance,15);
 b=until(b,150);assert.equal(mind(b).memories.filter(m=>m.kind==='overdue').length,1);
 let c=social(initial(),'smash').bundle;c=social(c,'help').bundle;const impact={trust:mind(c).trust,fear:mind(c).fear,grievance:mind(c).grievance},harmSeq=mind(c).memories[0].eventSeq;
 for(let i=0;i<34;i++){const next=social(c,'talk','past');assert.deepEqual(next.receipt.result.memoryRefs,[harmSeq]);c=next.bundle;}
 assert.equal(mind(c).memories.length,32);assert.ok(mind(c).memories.some(m=>m.eventSeq===harmSeq));
 assert.deepEqual({trust:mind(c).trust,fear:mind(c).fear,grievance:mind(c).grievance},impact);
});

test('new history equals full replay; plausible relation, asset, reply, event and fixture forgeries fail audit',()=>{
 let b=social(initial(),'help').bundle;b=social(b,'threaten').bundle;
 const command=dto(b,'PlayerInteract',{targetId:'actor-2',action:'talk',topic:'past'});
 const live=deriveCampaignBundle(b,command),full=executeAuditedCampaignIntent(structuredClone(b),command);assert.deepEqual(live,full);
 for(const mutate of [b=>mind(b).trust++,b=>asset(b).condition++,b=>{world(b).mapModel.socialModel.lastReply.text='凭空编造的经历';},
  b=>{mind(b).memories[0].eventSeq++;},b=>{b.snapshot.fixtureVersion='2';},b=>{b.eventLog.at(-1).payload.receipt.result.speech='伪造回应';}]){
  const bad=structuredClone(live.bundle);mutate(bad);assert.throws(()=>validateBundle(bad,options));
 }
 for(const factory of [createCampaignVillage,createNpcCampaignVillage]){const old=initial(undefined,factory),before=JSON.stringify(old);assert.throws(()=>social(old,'talk'),/new social world/);assert.equal(JSON.stringify(old),before);assert.equal(mapView(old,100).mapViewVersion,1);}
});

test('strict browser consumption binds results to action and actual deltas; UI permissions use only visible affordances',()=>{
 const b=initial(),command=dto(b,'PlayerInteract',{targetId:'actor-2',action:'smash'}),{receipt,bundle}=deriveCampaignBundle(b,command);
 assert.equal(validateCampaignReceipt(receipt,command,0),true);
 for(const mutate of [r=>{r.result.effect='repaired';},r=>{r.result.asset.after.condition=99;},r=>{r.result.asset.after.holderId='actor-4';},r=>{r.result.memoryRefs=[r.result.sourceEventSeq];},r=>{r.result.trust=100;}]){
  const forged=structuredClone(receipt);mutate(forged);assert.equal(validateCampaignReceipt(forged,command,0),false);assert.equal(describeActionReceipt(forged,command),null);
 }
 assert.equal(validSocialPayload({...command.payload,trust:100}),false);
 const rejection={...receipt,outcome:'rejected',result:{code:'NOT_COLOCATED'}};
 assert.equal(validateCampaignReceipt(rejection,command,0),true);
 assert.equal(validateCampaignReceipt(rejection,{...command,payload:{...command.payload,targetId:'actor-1'}},0),false);
 const map=mapView(bundle,100);assert.equal(validSocialView(map.social),true);
 const leak=structuredClone(map.social);leak.npc.trust=100;assert.equal(validSocialView(leak),false);
 for(const mutate of [m=>{m.social.asset.x=6;},m=>{m.social.asset=null;},m=>{m.actors.find(a=>a.actorId==='actor-2').x=9;}]){
  const forged=structuredClone(map);mutate(forged);assert.equal(validSocialMapView(forged),false);
 }
 const group={map,player:{self:{identity:{alive:true}}},encounter:{encounter:null}};
 assert.equal(socialInteractionActions(group,true).help,true);assert.equal(socialInteractionActions(group,false).help,false);
 group.map.order={status:'marching'};assert.equal(socialInteractionActions(group,true).help,false);
});
