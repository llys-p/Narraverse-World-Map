import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustCampaignVillage,defaultPlayableVillageConfig,campaignSystems,createPlayableCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {mapView} from '../../runtime/core/campaign-map.mjs';
import {socialWorkReady} from '../../runtime/core/npc-social.mjs';
import {validPlayableView} from '../../runtime-playable-contract.mjs';
import {validateCampaignReceipt} from '../../runtime-campaign-contract.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
function game(bundle=createTrustCampaignVillage(42,'trust-test').bundle){
 let b=createAuditedBundle(bundle,options);return {
  get bundle(){return b;},get world(){return b.snapshot.world;},get tick(){return b.snapshot.tick;},
  get quest(){return b.snapshot.world.mapModel.playModel.quests.at(-1);},
  act(type,payload={}){const dto={version:5,commandId:'trust-'+b.snapshot.revision,expectedRevision:b.snapshot.revision,type,payload},before=b.snapshot.tick,r=computeCampaignIntent(b,dto);assert.ok(validateCampaignReceipt(r.receipt,dto,before),type);b=r.bundle;return {...r,dto};},
  audit(){validateBundle(b,options);assert.ok(validPlayableView(mapView(b,400).playable,b.snapshot.tick));}
 };
}
const quest=(g,id,action)=>g.act('PlayerQuest',{questId:id,action});
const social=(g,action,extra={})=>g.act('PlayerInteract',{targetId:'actor-2',action,...extra});
function unlock(g){quest(g,'livelihood','accept');g.act('PlayerWork');g.act('PlayerBuy',{product:'food',quantity:1});quest(g,'livelihood','claim');quest(g,'hunter-aid','accept');social(g,'help');g.act('PlayerGiftFood',{recipientId:'actor-2'});quest(g,'hunter-aid','claim');assert.equal(g.quest.status,'available');}
function march(g,target){g.act('MarchSet',target);let n=0;while(g.world.mapModel.order.status!=='arrived'){assert.ok(n++<40);g.act(g.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep');}}
const roundTrip=g=>{march(g,{x:16,y:7});march(g,{x:4,y:7});};
const accept=g=>quest(g,'hunter-trust','accept');

test('new optional loan journey joins real forest travel, keeps main chapter independent, and rewards once',()=>{
 const g=game();assert.equal(accept(g).receipt.outcome,'rejected');unlock(g);accept(g);quest(g,'forest-route','accept');
 assert.equal(social(g,'ask-help').receipt.result.effect,'lent');assert.equal(socialWorkReady(g.world.mapModel),false);
 march(g,{x:16,y:7});assert.deepEqual(g.quest.progress,[1,1,0]);assert.equal(mapView(g.bundle,400).actors.some(a=>a.actorId==='actor-2'),false);
 assert.equal(g.world.mapModel.playModel.agency.tier,'far');march(g,{x:4,y:7});assert.equal(g.quest.status,'active');
 assert.equal(quest(g,'hunter-trust','claim').receipt.outcome,'rejected');social(g,'return');assert.equal(socialWorkReady(g.world.mapModel),true);assert.equal(g.quest.status,'ready');
 const before=structuredClone(g.world.playerModel);const claim=quest(g,'hunter-trust','claim');assert.equal(g.quest.status,'completed');assert.deepEqual(g.world.playerModel,before);assert.equal(mapView(g.bundle,400).playable.chapterComplete,false);
 assert.deepEqual(computeCampaignIntent(g.bundle,claim.dto).receipt,claim.receipt);assert.equal(quest(g,'hunter-trust','claim').receipt.outcome,'rejected');
 quest(g,'forest-route','claim');assert.equal(mapView(g.bundle,400).playable.chapterComplete,true);
 quest(g,'forest-win','accept');march(g,{x:16,y:7});g.act('EncounterBegin');const encounterId=g.world.encounterModel.encounter.encounterId;
 g.act('EncounterAction',{encounterId,action:'attack'});g.act('EncounterAction',{encounterId,action:'attack'});march(g,{x:4,y:7});quest(g,'forest-win','claim');assert.equal(mapView(g.bundle,400).playable.rank,5);g.audit();
});

test('repair-for-loan is a second playable path with its actual negotiated deadline',()=>{
 const g=game();unlock(g);accept(g);
 const offer=g.act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:20,loanTicks:36}}).receipt.result.agreement;
 g.act('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'accept'});social(g,'help');assert.deepEqual(g.quest.progress,[0,0,0]);
 g.act('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'claim'});assert.equal(g.quest.loanDueTick,g.tick+36);
 roundTrip(g);social(g,'return');assert.equal(g.quest.status,'ready');assert.equal(g.world.mapModel.negotiationModel.agreement.status,'fulfilled');g.audit();
});

test('loans before acceptance, talk, refusals, and early returns cannot supply missing steps',()=>{
 const g=game();unlock(g);social(g,'ask-help');accept(g);roundTrip(g);social(g,'return');assert.deepEqual(g.quest.progress,[0,0,0]);
 social(g,'talk',{topic:'past'});assert.equal(g.quest.status,'active');social(g,'ask-help');social(g,'return');assert.deepEqual(g.quest.progress,[0,0,0]);assert.equal(g.quest.loanDueTick,null);
 social(g,'ask-help');roundTrip(g);social(g,'return');assert.equal(g.quest.status,'ready');g.audit();
 const refused=game();unlock(refused);accept(refused);social(refused,'threaten');const r=social(refused,'ask-help');assert.equal(r.receipt.result.effect,'refused');assert.deepEqual(refused.quest.progress,[0,0,0]);refused.audit();
});

test('actual robbery and forest travel do not become a consensual loan',()=>{
 const config=defaultPlayableVillageConfig();config.memory.society.actors.initialActors[1].health=600;
 const g=game(createTrustCampaignVillage(42,'robbery-trust',config).bundle);unlock(g);accept(g);assert.equal(social(g,'rob').receipt.result.effect,'taken');
 roundTrip(g);assert.deepEqual(g.quest.progress,[0,0,0]);assert.equal(quest(g,'hunter-trust','claim').receipt.outcome,'rejected');g.audit();
});

test('completion at the loan deadline succeeds; completing one tick later fails and retains relationship consequences',()=>{
 const prefix=game();unlock(prefix);accept(prefix);social(prefix,'ask-help');roundTrip(prefix);
 const exact=game(prefix.bundle),late=game(prefix.bundle),due=exact.quest.loanDueTick;
 exact.act('AdvanceTime',{ticks:due-exact.tick-1});assert.equal(social(exact,'return').receipt.outcome,'succeeded');assert.equal(exact.tick,due);assert.equal(exact.quest.status,'ready');
 exact.act('AdvanceTime',{ticks:2});assert.equal(exact.quest.status,'ready');quest(exact,'hunter-trust','claim');exact.audit();
 late.act('AdvanceTime',{ticks:due-late.tick});const trust=late.world.mapModel.socialModel.actors[1].trust;
 assert.equal(social(late,'return').receipt.outcome,'succeeded');assert.equal(late.tick,due+1);assert.equal(late.quest.status,'failed');assert.equal(late.world.mapModel.socialModel.asset.holderId,'actor-2');
 assert.ok(late.world.mapModel.socialModel.actors[1].trust<trust);assert.ok(late.world.mapModel.socialModel.actors[1].memories.some(m=>m.kind==='overdue'));assert.equal(quest(late,'hunter-trust','claim').receipt.outcome,'rejected');late.audit();
});

test('abandon and reaccept keep the actual loan and cannot re-count that old loan',()=>{
 const g=game();unlock(g);accept(g);social(g,'ask-help');const due=g.quest.loanDueTick;
 quest(g,'hunter-trust','abandon');assert.equal(g.world.mapModel.socialModel.asset.loanDueTick,due);accept(g);assert.deepEqual(g.quest.progress,[0,0,0]);
 roundTrip(g);social(g,'return');assert.deepEqual(g.quest.progress,[0,0,0]);social(g,'ask-help');roundTrip(g);social(g,'return');assert.equal(g.quest.status,'ready');g.audit();
});

test('forged deadlines, progress and model versions fail replay; legacy fixture retains four tasks',()=>{
 const g=game();unlock(g);accept(g);social(g,'ask-help');g.audit();
 for(const mutate of [b=>b.snapshot.world.mapModel.playModel.quests[4].loanDueTick++,b=>b.snapshot.world.mapModel.playModel.quests[4].progress[1]=1,b=>b.snapshot.fixtureVersion='6',b=>b.snapshot.world.mapModel.playModel.version='playable-v1']){
  const bad=structuredClone(g.bundle);mutate(bad);assert.throws(()=>validateBundle(bad,options));
 }
 const view=mapView(g.bundle,400).playable;for(const mutate of [v=>v.version=1,v=>v.quests[4].loanDueTick=null,v=>v.quests[4].progress=[0,1,0],v=>v.quests[4].targets=[1,1]]){const bad=structuredClone(view);mutate(bad);assert.equal(validPlayableView(bad,g.tick),false);}
 const old=game(createPlayableCampaignVillage().bundle);assert.equal(old.world.mapModel.playModel.quests.length,4);assert.equal(mapView(old.bundle,400).playable.version,1);assert.equal(accept(old).receipt.outcome,'rejected');old.audit();
});

test('playable fixtures accept genuine overdue and agreement-closure events but reject forged sources',()=>{
 for(const factory of [createPlayableCampaignVillage,createTrustCampaignVillage]){
  const g=game(factory(42,'overdue-event-'+factory.name).bundle);
  const offer=g.act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:40,loanTicks:36}}).receipt.result.agreement;
  g.act('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'accept'});social(g,'help');social(g,'help');
  g.act('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'claim'});g.act('AdvanceTime',{ticks:37});
  assert.equal(g.world.mapModel.negotiationModel.agreement.status,'breached');g.audit();
  for(const type of ['NpcPerceptionRecorded','NpcAgreementClosed']){
   assert.ok(g.bundle.eventLog.some(e=>e.type===type));
   for(const mutate of [e=>e.sourceSystem='mind',e=>e.entityIds=['actor-3'],e=>e.payload.text='虚构的逾期事件']){
    const bad=structuredClone(g.bundle);mutate(bad.eventLog.find(e=>e.type===type));assert.throws(()=>validateBundle(bad,options));
   }
  }
  social(g,'return');assert.equal(g.world.mapModel.negotiationModel.agreement.status,'returned-late');g.audit();
 }
});
