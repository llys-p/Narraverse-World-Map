import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableCampaignVillage,createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {mapView} from '../../runtime/core/campaign-map.mjs';
import {validateCampaignReceipt} from '../../runtime-campaign-contract.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
function game(seed=42){let b=createAuditedBundle(createPlayableCampaignVillage(seed,'playable-test').bundle,options),serial=0;const submit=(type,payload={})=>{const dto={version:5,commandId:'play-'+(++serial),expectedRevision:b.snapshot.revision,type,payload},before=b.snapshot.tick,r=computeCampaignIntent(b,dto);assert.ok(validateCampaignReceipt(r.receipt,dto,before),type);b=r.bundle;return {dto,...r};};return {get bundle(){return b;},submit};}
const quest=(g,id,action)=>g.submit('PlayerQuest',{questId:id,action});
function march(g,target){g.submit('MarchSet',target);let n=0;while(g.bundle.snapshot.world.mapModel.order.status!=='arrived'){assert.ok(n++<40);const status=g.bundle.snapshot.world.mapModel.order.status;g.submit(status==='paused'?'MarchResume':'MarchStep');}}

test('four real quest states complete a village/forest chapter, survive replay, and cannot be rewarded twice',()=>{
 const g=game();assert.equal(quest(g,'hunter-aid','accept').receipt.outcome,'rejected');
 quest(g,'livelihood','accept');g.submit('PlayerWork');g.submit('PlayerBuy',{product:'food',quantity:1});assert.equal(quest(g,'livelihood','claim').receipt.outcome,'succeeded');
 quest(g,'hunter-aid','accept');assert.equal(g.submit('PlayerInteract',{targetId:'actor-2',action:'help'}).receipt.outcome,'succeeded');g.submit('PlayerGiftFood',{recipientId:'actor-2'});quest(g,'hunter-aid','claim');
 quest(g,'forest-route','accept');march(g,{x:16,y:7});march(g,{x:4,y:7});assert.equal(quest(g,'forest-route','claim').receipt.outcome,'succeeded');
 const before=structuredClone(g.bundle),view=mapView(g.bundle,80);assert.equal(view.playable.chapterComplete,true);assert.equal(view.playable.rank,3);assert.equal(view.playable.quests[3].status,'available');
 assert.equal(quest(g,'forest-route','claim').receipt.outcome,'rejected');assert.equal(g.bundle.snapshot.world.playerModel.wallet,before.snapshot.world.playerModel.wallet);
 quest(g,'forest-win','accept');march(g,{x:16,y:7});g.submit('EncounterBegin');const encounterId=g.bundle.snapshot.world.encounterModel.encounter.encounterId;g.submit('EncounterAction',{encounterId,action:'attack'});g.submit('EncounterAction',{encounterId,action:'attack'});march(g,{x:4,y:7});assert.equal(quest(g,'forest-win','claim').receipt.outcome,'succeeded');assert.equal(g.bundle.snapshot.world.mapModel.playModel.quests.filter(q=>q.status==='completed').length,4);
 validateBundle(g.bundle,options);
 const forged=structuredClone(before);forged.snapshot.world.mapModel.playModel.quests[0].progress=[0,0];assert.throws(()=>validateBundle(forged,options));
});

test('oral claims do not complete tasks, abandonment resets progress, and the same request is idempotent',()=>{
 const g=game();const first=quest(g,'livelihood','accept');
 assert.deepEqual(computeCampaignIntent(g.bundle,first.dto).receipt,first.receipt);
 g.submit('PlayerInteract',{targetId:'actor-2',action:'talk',topic:'needs'});assert.equal(quest(g,'livelihood','claim').receipt.outcome,'rejected');
 g.submit('PlayerWork');quest(g,'livelihood','abandon');quest(g,'livelihood','accept');assert.deepEqual(g.bundle.snapshot.world.mapModel.playModel.quests[0].progress,[0,0]);validateBundle(g.bundle,options);
});

test('seven days have recurring opportunities and recorded own life results, with resources and replay intact',()=>{
 const g=game();for(let day=1;day<=7;day++)g.submit('AdvanceTime',{ticks:144-g.bundle.snapshot.tick%144});
 const w=g.bundle.snapshot.world,p=w.mapModel.playModel,h=w.actorModel.actors[1];assert.equal(h.alive,true);assert.equal(p.lifeHistory.length,7);
 assert.ok(p.lifeHistory.filter(x=>x.action==='WorkForPay'&&x.status==='succeeded').length>=2);assert.ok(p.lifeHistory.filter(x=>x.action==='BuyFood'&&x.status==='succeeded').length>=2);
 assert.ok(w.resources.food>=0);assert.ok(w.societyModel.agents[1].state.wallet>=0);validateBundle(g.bundle,options);
 const forged=structuredClone(g.bundle);forged.snapshot.world.mapModel.playModel.lifeHistory[0].walletChange=999;assert.throws(()=>validateBundle(forged,options));
});

test('offscreen preparation uses fewer evaluations and reactivates on important changes',()=>{
 const g=game();march(g,{x:16,y:7});const before=structuredClone(g.bundle.snapshot.world.mapModel.playModel.agency);
 g.submit('AdvanceTime',{ticks:72});const after=g.bundle.snapshot.world.mapModel.playModel.agency;
 assert.equal(after.tier,'far');assert.ok(after.skipped>before.skipped);assert.ok(after.evaluations-before.evaluations<18);validateBundle(g.bundle,options);
});

test('a new offer does not erase the source of an already earned purchase step',async()=>{
 const {defaultPlayableVillageConfig}=await import('../../runtime/fixtures/campaign-village.mjs');const c=defaultPlayableVillageConfig();c.motivation.requests=c.motivation.requests.map((r,i)=>({...r,tick:100+i*288,expiresTick:388+i*288}));
 let b=createAuditedBundle(createPlayableCampaignVillage(42,'offer-overlap',c).bundle,options),n=0;
 const act=(type,payload)=>{b=computeCampaignIntent(b,{version:5,commandId:'overlap-'+(++n),expectedRevision:b.snapshot.revision,type,payload}).bundle;};
 for(const tick of [144,288,432,576,676,720])act('AdvanceTime',{ticks:tick-b.snapshot.tick});
 assert.ok(b.snapshot.world.mapModel.playModel.lifeHistory.some(r=>r.tick===720&&r.action==='BuyFood'&&r.status==='succeeded'));validateBundle(b,options);
});
