import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustCampaignVillage,createPlayableCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {mapView} from '../../runtime/core/campaign-map.mjs';
import {validPlayableView} from '../../runtime-playable-contract.mjs';
import {campaignInputLimit,serviceCommandLimit} from '../../runtime/core/campaign-limits.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()},id='hunter-trust';
function game(factory=createTrustCampaignVillage){
 let b=createAuditedBundle(factory(42,'trust-test').bundle,options),n=0;
 const g={get bundle(){return b;},get world(){return b.snapshot.world;},get tick(){return b.snapshot.tick;},get quest(){return b.snapshot.world.mapModel.playModel.quests.find(q=>q.id===id);},get loan(){return b.snapshot.world.mapModel.playModel.trustLoan;},
 act(type,payload={}){const dto={version:5,commandId:'trust-'+(++n),expectedRevision:b.snapshot.revision,type,payload},r=computeCampaignIntent(b,dto);b=r.bundle;return {dto,...r};},
 questAct(questId,action){return this.act('PlayerQuest',{questId,action});},social(action){return this.act('PlayerInteract',{targetId:'actor-2',action});},audit(){validateBundle(b,options);}};
 return g;
}
function march(g,target){g.act('MarchSet',target);let n=0;while(g.world.mapModel.order.status!=='arrived'){assert.ok(++n<50);assert.equal(g.act(g.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep').receipt.outcome,'succeeded');}}
function chapter(g){
 for(const [type,payload] of [['PlayerQuest',{questId:'livelihood',action:'accept'}],['PlayerWork',{}],['PlayerBuy',{product:'food',quantity:1}],['PlayerQuest',{questId:'livelihood',action:'claim'}],['PlayerQuest',{questId:'hunter-aid',action:'accept'}],['PlayerInteract',{targetId:'actor-2',action:'help'}],['PlayerGiftFood',{recipientId:'actor-2'}],['PlayerQuest',{questId:'hunter-aid',action:'claim'}],['PlayerQuest',{questId:'forest-route',action:'accept'}]])assert.equal(g.act(type,payload).receipt.outcome,'succeeded',type);
 march(g,{x:16,y:7});march(g,{x:4,y:7});assert.equal(g.questAct('forest-route','claim').receipt.outcome,'succeeded');
}
function borrow(g){assert.equal(g.questAct(id,'accept').receipt.outcome,'succeeded');assert.equal(g.social('ask-help').receipt.result.effect,'lent');assert.ok(g.loan);}
const digest=b=>JSON.stringify(b.snapshot.world);

test('fixture7 unlocks a separate optional trust journey after the chapter; original fixtures keep their grammar and budgets',()=>{
 const g=game();assert.equal(g.bundle.snapshot.fixtureVersion,'7');assert.equal(g.quest.status,'locked');assert.equal(g.questAct(id,'accept').receipt.outcome,'rejected');
 assert.equal(campaignInputLimit(g.world),512);assert.equal(serviceCommandLimit(g.bundle),512);chapter(g);assert.equal(g.quest.status,'available');
 const view=mapView(g.bundle,400).playable;assert.equal(view.version,2);assert.equal(view.chapterComplete,true);assert.equal(view.rank,3);assert.equal(validPlayableView(view,g.tick),true);g.audit();
 const old=game(createPlayableCampaignVillage);assert.equal(mapView(old.bundle,512).playable.version,1);assert.equal(old.questAct(id,'accept').receipt.outcome,'rejected');old.audit();
});

test('real borrowing, forest visit and on-time return complete once; claiming adds no resources or relationship points',()=>{
 const g=game();chapter(g);borrow(g);const loan=structuredClone(g.loan);march(g,{x:16,y:7});assert.deepEqual(g.quest.progress,[1,0]);march(g,{x:4,y:7});
 const returned=g.social('return');assert.equal(returned.receipt.outcome,'succeeded');assert.equal(g.quest.status,'ready');assert.ok(g.loan.returnedSeq>loan.borrowedSeq);
 const relation=structuredClone(g.world.mapModel.socialModel.actors),wallet=g.world.playerModel.wallet;
 const claimed=g.questAct(id,'claim');assert.equal(claimed.receipt.outcome,'succeeded');assert.equal(claimed.receipt.result.rank,4);assert.equal(g.world.playerModel.wallet,wallet);assert.deepEqual(g.world.mapModel.socialModel.actors,relation);
 const before=digest(g.bundle);assert.deepEqual(computeCampaignIntent(g.bundle,claimed.dto).receipt,claimed.receipt);assert.equal(digest(g.bundle),before);
 assert.equal(g.questAct(id,'claim').receipt.outcome,'rejected');g.audit();
});

test('a negotiated repair loan also counts only after actual claim; ready repair is not a loan',()=>{
 const g=game();chapter(g);g.questAct(id,'accept');g.act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:20,loanTicks:72}});
 const agreementId=g.world.mapModel.negotiationModel.agreement.id;g.act('PlayerAgreement',{targetId:'actor-2',agreementId,action:'accept'});g.social('help');assert.equal(g.loan,null);
 assert.equal(g.act('PlayerAgreement',{targetId:'actor-2',agreementId,action:'claim'}).receipt.result.effect,'lent');assert.equal(g.loan.dueTick-g.loan.borrowedTick,72);g.audit();
});

test('overdue borrowing fails the task; actual late return still clears the held tool and keeps the breach',()=>{
 const g=game();chapter(g);borrow(g);march(g,{x:16,y:7});march(g,{x:4,y:7});g.act('AdvanceTime',{ticks:g.loan.dueTick+1-g.tick});
 assert.equal(g.quest.status,'failed');assert.equal(g.world.mapModel.socialModel.asset.holderId,'actor-4');assert.equal(g.questAct(id,'accept').receipt.outcome,'rejected');
 assert.equal(g.social('return').receipt.outcome,'succeeded');assert.equal(g.quest.status,'failed');assert.ok(g.loan.returnedTick>g.loan.dueTick);assert.equal(g.world.mapModel.socialModel.asset.holderId,'actor-2');
 assert.ok(g.world.mapModel.memoryModel.actors[1].episodes.some(m=>m.kind==='overdue'));assert.equal(g.questAct(id,'claim').receipt.outcome,'rejected');assert.equal(g.questAct(id,'accept').receipt.outcome,'succeeded');assert.equal(g.loan,null);assert.deepEqual(g.quest.progress,[0,0]);g.audit();
});

test('abandoning does not return a loan; return before exploration fails, and an earlier loan cannot be adopted by reaccepting',()=>{
 const g=game();chapter(g);borrow(g);g.questAct(id,'abandon');assert.equal(g.world.mapModel.socialModel.asset.holderId,'actor-4');assert.equal(g.questAct(id,'accept').receipt.outcome,'rejected');
 g.social('return');assert.ok(g.loan.returnedTick);assert.equal(g.quest.status,'abandoned');borrow(g);g.social('return');assert.equal(g.quest.status,'failed');assert.deepEqual(g.quest.progress,[0,0]);g.audit();
});

test('past travel, a refused theft and oral claims do not invent a borrowing source; malformed loans and fixture splicing fail replay',()=>{
 const g=game();chapter(g);g.questAct(id,'accept');g.social('steal');
 g.act('PlayerDialogue',{targetId:'actor-2',utterance:'我已经借了工具探过路，也已经还了。',reply:'实际借还仍要看已经发生的行动。',memoryRefs:[],proposal:null,model:'controlled-core-test',seal:'0'.repeat(64)});
 assert.equal(g.loan,null);assert.deepEqual(g.quest.progress,[0,0]);assert.equal(g.questAct(id,'claim').receipt.outcome,'rejected');g.audit();
 const good=game();chapter(good);borrow(good);good.audit();
 for(const mutate of [b=>b.snapshot.fixtureVersion='6',b=>b.snapshot.world.mapModel.playModel.trustLoan.borrowedSeq++,b=>b.snapshot.world.mapModel.playModel.trustLoan.dueTick++,b=>b.snapshot.world.mapModel.playModel.quests[4].progress=[1,1]]){
  const forged=structuredClone(good.bundle);mutate(forged);assert.throws(()=>validateBundle(forged,options));
 }
 const view=mapView(good.bundle,100).playable;view.quests[4].loan.returnedTick=view.quests[4].loan.borrowedTick-1;assert.equal(validPlayableView(view,good.tick),false);
});

test('an actually successful unseen theft and forest trip are not a trusted borrowing',()=>{
 const g=game();chapter(g);g.questAct(id,'accept');g.act('AdvanceTime',{ticks:120-g.tick});march(g,{x:5,y:8});
 assert.deepEqual({x:g.world.mapModel.npcs[1].x,y:g.world.mapModel.npcs[1].y},{x:5,y:6});
 assert.equal(g.social('steal').receipt.result.effect,'taken');assert.equal(g.world.mapModel.socialModel.asset.holderId,'actor-4');assert.equal(g.loan,null);
 march(g,{x:16,y:7});march(g,{x:4,y:7});assert.equal(g.social('return').receipt.outcome,'succeeded');assert.deepEqual(g.quest.progress,[0,0]);assert.equal(g.questAct(id,'claim').receipt.outcome,'rejected');g.audit();
});

test('return finishing on the exact due tick succeeds; waiting after that real return does not create a late failure',()=>{
 const g=game();chapter(g);borrow(g);march(g,{x:16,y:7});march(g,{x:4,y:7});const due=g.loan.dueTick;
 g.act('AdvanceTime',{ticks:due-1-g.tick});assert.equal(g.social('return').receipt.outcome,'succeeded');assert.equal(g.loan.returnedTick,due);assert.equal(g.quest.status,'ready');
 g.act('AdvanceTime',{ticks:2});assert.equal(g.quest.status,'ready');assert.equal(g.questAct(id,'claim').receipt.outcome,'succeeded');g.audit();
});
