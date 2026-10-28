import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestCampaignVillage,createTrustCampaignVillage,defaultPlayableVillageConfig,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {computeCampaignIntent,describeCampaignEncounterActions} from '../../runtime/core/scene-campaign-runtime.mjs';
import {mapView} from '../../runtime/core/campaign-map.mjs';
import {validateCampaignReceipt} from '../../runtime-campaign-contract.mjs';
import {validForestView} from '../../runtime-forest-contract.mjs';
import {requireForestBudget} from '../../runtime/core/campaign-forest.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
function game(bundle=createForestCampaignVillage(42,'forest-test').bundle){let b=createAuditedBundle(bundle,options);return {
 get bundle(){return b;},get world(){return b.snapshot.world;},get forest(){return b.snapshot.world.mapModel.forestModel;},get tick(){return b.snapshot.tick;},
 act(type,payload={}){const dto={version:5,commandId:'forest-'+b.snapshot.revision,expectedRevision:b.snapshot.revision,type,payload},from=b.snapshot.tick,r=computeCampaignIntent(b,dto);assert.ok(validateCampaignReceipt(r.receipt,dto,from),type+' '+JSON.stringify(r.receipt));b=r.bundle;return {...r,dto};},
 audit(){validateBundle(b,options);if(Object.hasOwn(mapView(b,400),'forest'))assert.ok(validForestView(mapView(b,400).forest));}
};}
const forest=(g,action)=>g.act('PlayerForest',{action});
const social=(g,action)=>g.act('PlayerInteract',{targetId:'actor-2',action});
const quest=(g,id,action)=>g.act('PlayerQuest',{questId:id,action});
function unlock(g){quest(g,'livelihood','accept');g.act('PlayerWork');g.act('PlayerBuy',{product:'food',quantity:1});quest(g,'livelihood','claim');quest(g,'hunter-aid','accept');social(g,'help');g.act('PlayerGiftFood',{recipientId:'actor-2'});quest(g,'hunter-aid','claim');}
function march(g,target){g.act('MarchSet',target);let n=0;while(g.world.mapModel.order.status!=='arrived'){assert.ok(n++<40);g.act(g.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep');}}
const arrive=g=>march(g,{x:16,y:7});
function borrowed(){const g=game();unlock(g);quest(g,'hunter-trust','accept');quest(g,'forest-route','accept');social(g,'ask-help');arrive(g);return g;}

test('borrowed tools gather finite branches, camp recovers fatigue, and a peaceful return completes both journeys',()=>{
 const g=borrowed(),economy=structuredClone(g.world.playerModel),tool=g.world.mapModel.socialModel.asset,initial=tool.condition;
 const collect=forest(g,'collect');assert.equal(collect.receipt.durationTicks,3);assert.equal(tool.condition,initial);assert.equal(g.world.mapModel.socialModel.asset.condition,initial-10);assert.equal(g.forest.firewood,1);
 const fatigue=g.world.actorModel.actors[3].fatigue;forest(g,'camp');assert.equal(g.world.actorModel.actors[3].fatigue,Math.max(0,fatigue-200));assert.equal(g.forest.firewood,0);assert.equal(g.forest.campfires,1);assert.deepEqual(g.world.playerModel,economy);
 forest(g,'avoid');assert.equal(g.forest.trail,'avoided');assert.equal(g.world.ecologyModel.reservedWolves,0);assert.equal(g.world.encounterModel.encounter,null);
 march(g,{x:4,y:7});social(g,'return');quest(g,'hunter-trust','claim');quest(g,'forest-route','claim');assert.equal(mapView(g.bundle,400).playable.chapterComplete,true);assert.equal(mapView(g.bundle,400).forest,null);g.audit();
});

test('forest supplies exhaust, retries never duplicate wood or wear, and ordinary rest stays available',()=>{
 const g=borrowed();for(let i=0;i<3;i++)forest(g,'collect');assert.deepEqual([g.forest.branchesRemaining,g.forest.harvested,g.forest.firewood],[0,3,3]);
 const before=structuredClone(g.bundle),rejected=forest(g,'collect');assert.equal(rejected.receipt.result.code,'FOREST_DEPLETED');assert.equal(rejected.receipt.durationTicks,0);
 for(let i=0;i<3;i++){if(g.world.actorModel.actors[3].fatigue===0){march(g,{x:15,y:7});arrive(g);}assert.equal(forest(g,'camp').receipt.outcome,'succeeded');}
 assert.equal(forest(g,'camp').receipt.result.code,'NO_FIREWOOD');assert.equal(g.act('PlayerRest').receipt.outcome,'succeeded');g.audit();
 const branch=game(before),r=branch.act('PlayerForest',{action:'avoid'}),retry=computeCampaignIntent(branch.bundle,r.dto);assert.deepEqual(retry.bundle,branch.bundle);assert.deepEqual(retry.receipt,r.receipt);
 const actual=borrowed(),harvest=forest(actual,'collect');assert.deepEqual(computeCampaignIntent(actual.bundle,harvest.dto).bundle,actual.bundle);
});

test('location, held tool, low durability, marching, and active battle gates fail without receiving supplies',()=>{
 const g=game();assert.equal(forest(g,'collect').receipt.result.code,'NOT_COLOCATED');arrive(g);assert.equal(forest(g,'collect').receipt.result.code,'NOT_HELD');assert.equal(forest(g,'camp').receipt.result.code,'NO_FIREWOOD');
 g.act('MarchSet',{x:17,y:7});assert.equal(forest(g,'collect').receipt.result.code,'RULE_REJECTED');g.act('MarchPause');forest(g,'observe');g.act('EncounterBegin');assert.equal(forest(g,'collect').receipt.result.code,'ENCOUNTER_BUSY');g.audit();
 const c=defaultPlayableVillageConfig();c.memory.society.actors.initialActors[1].health=600;const low=game(createForestCampaignVillage(42,'low-tool',c).bundle);social(low,'smash');social(low,'help');assert.equal(social(low,'rob').receipt.result.effect,'taken');arrive(low);forest(low,'collect');assert.equal(low.world.mapModel.socialModel.asset.condition,30);assert.equal(forest(low,'collect').receipt.result.code,'ASSET_UNAVAILABLE');low.audit();
});

test('observing is optional and does not reserve wolves; cancellation, escape, and victory all release the existing reservation',()=>{
 const g=borrowed();assert.equal(g.act('EncounterBegin').receipt.outcome,'rejected');forest(g,'observe');assert.equal(g.world.ecologyModel.reservedWolves,0);assert.equal(describeCampaignEncounterActions(g.bundle).canBegin,true);
 g.act('EncounterBegin');assert.equal(g.forest.trail,'engaged');assert.equal(g.world.ecologyModel.reservedWolves,1);const start=g.tick,id=g.world.encounterModel.encounter.encounterId;
 g.act('EncounterCancel',{encounterId:id});assert.equal(g.tick,start);assert.equal(g.forest.trail,'resolved');assert.equal(g.world.ecologyModel.reservedWolves,0);assert.equal(g.act('EncounterBegin').receipt.outcome,'rejected');
 forest(g,'observe');g.act('EncounterBegin');g.act('EncounterAction',{encounterId:g.world.encounterModel.encounter.encounterId,action:'flee'});assert.equal(g.forest.trail,'resolved');assert.equal(g.world.ecologyModel.reservedWolves,0);
 forest(g,'observe');g.act('EncounterBegin');for(let i=0;i<2;i++)g.act('EncounterAction',{encounterId:g.world.encounterModel.encounter.encounterId,action:'attack'});assert.equal(g.world.encounterModel.encounter.resolution,'win');assert.equal(g.forest.trail,'resolved');assert.equal(g.world.ecologyModel.ledger.wolves.battleDeaths,1);g.audit();
});

test('leaving the clearing and returning does not force or reopen a skipped encounter',()=>{
 const g=borrowed();forest(g,'avoid');march(g,{x:14,y:7});assert.equal(mapView(g.bundle,400).forest.actions[0].reasonCode,'NOT_COLOCATED');assert.equal(g.act('EncounterBegin').receipt.outcome,'rejected');arrive(g);assert.equal(g.forest.trail,'avoided');assert.equal(g.world.encounterModel.encounter,null);forest(g,'collect');forest(g,'observe');g.act('EncounterBegin');g.act('EncounterAction',{encounterId:g.world.encounterModel.encounter.encounterId,action:'attack'});const hp=g.world.actorModel.actors[3].health;g.act('EncounterCancel',{encounterId:g.world.encounterModel.encounter.encounterId});assert.equal(g.world.actorModel.actors[3].health,hp);assert.equal(g.world.ecologyModel.reservedWolves,0);march(g,{x:4,y:7});g.audit();
});

test('collecting through the loan deadline still wears the tool and preserves overdue consequences',()=>{
 const g=borrowed(),due=g.world.mapModel.socialModel.asset.loanDueTick;g.act('AdvanceTime',{ticks:due-g.tick-1});const condition=g.world.mapModel.socialModel.asset.condition;forest(g,'collect');assert.equal(g.world.mapModel.socialModel.asset.condition,condition-10);assert.equal(g.world.mapModel.playModel.quests[4].status,'failed');assert.ok(g.world.mapModel.socialModel.actors[1].memories.some(m=>m.kind==='overdue'));march(g,{x:4,y:7});social(g,'return');assert.equal(g.world.mapModel.socialModel.asset.holderId,'actor-2');g.audit();
});

test('death during a timed harvest consumes time but grants no wood or durability changes',()=>{
 const c=defaultPlayableVillageConfig();c.memory.society.actors.initialActors[3].health=1;c.memory.society.actors.initialActors[3].hunger=1000;c.memory.society.player.initialFood=0;
 const g=game(createForestCampaignVillage(42,'forest-death',c).bundle);social(g,'help');social(g,'help');social(g,'ask-help');arrive(g);g.act('AdvanceTime',{ticks:143-g.tick});const f=structuredClone(g.forest),condition=g.world.mapModel.socialModel.asset.condition;
 const r=forest(g,'collect');assert.equal(r.receipt.outcome,'rejected');assert.equal(r.receipt.result.code,'PLAYER_DEAD');assert.equal(r.receipt.durationTicks,3);assert.equal(g.tick,146);assert.deepEqual(g.forest,f);assert.equal(g.world.mapModel.socialModel.asset.condition,condition);g.audit();
});

test('forged supplies, wear, decisions, receipts, and fixture/model mismatches fail full replay',()=>{
 const g=borrowed();const r=forest(g,'collect');g.audit();
 for(const mutate of [b=>b.snapshot.world.mapModel.forestModel.firewood++,b=>{b.snapshot.world.mapModel.forestModel.harvested++;b.snapshot.world.mapModel.forestModel.firewood++;b.snapshot.world.mapModel.forestModel.branchesRemaining--;},b=>b.snapshot.world.mapModel.forestModel.trail='observed',b=>b.snapshot.world.mapModel.socialModel.asset.condition++,b=>b.snapshot.fixtureVersion='7',b=>delete b.snapshot.world.mapModel.forestModel,b=>b.snapshot.world.encounterModel.inputHistory.at(-1).receipt.result.after.forest.firewood++]){const bad=structuredClone(g.bundle);mutate(bad);assert.throws(()=>validateBundle(bad,options));}
 for(const mutate of [x=>x.result.after.condition++,x=>x.result.after.forest.firewood++,x=>x.durationTicks=0]){const bad=structuredClone(r.receipt);mutate(bad);assert.equal(validateCampaignReceipt(bad,r.dto,r.receipt.fromTick),false);}
 const old=game(createTrustCampaignVillage().bundle);assert.equal(mapView(old.bundle,400).mapViewVersion,4);assert.equal(Object.hasOwn(mapView(old.bundle,400),'forest'),false);assert.throws(()=>forest(old,'collect'),e=>e.code==='COMMAND_UNSUPPORTED');old.audit();
});

test('the forest command budget preserves a free exit, including after a nonlethal attack',()=>{
 const g=game();arrive(g);forest(g,'observe');
 assert.throws(()=>requireForestBudget('EncounterBegin',1,g.world),e=>e.code==='LIMIT_EXCEEDED');
 assert.doesNotThrow(()=>requireForestBudget('EncounterBegin',2,g.world));g.act('EncounterBegin');
 g.act('EncounterAction',{encounterId:g.world.encounterModel.encounter.encounterId,action:'attack'});
 assert.equal(g.world.encounterModel.encounter.status,'active');
 for(const type of ['EncounterAction','PlayerForest','AdvanceTime','PlayerQuest'])assert.throws(()=>requireForestBudget(type,1,g.world),e=>e.code==='LIMIT_EXCEEDED');
 assert.doesNotThrow(()=>requireForestBudget('EncounterCancel',1,g.world));
 const hp=g.world.actorModel.actors[3].health;g.act('EncounterCancel',{encounterId:g.world.encounterModel.encounter.encounterId});assert.equal(g.world.actorModel.actors[3].health,hp);assert.equal(g.world.ecologyModel.reservedWolves,0);g.audit();
 assert.doesNotThrow(()=>requireForestBudget('EncounterBegin',1,createTrustCampaignVillage().bundle.snapshot.world));
});
