import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createPlayableCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,validateBundle} from '../../runtime/core/world-state.mjs';import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {observePlayTick,playAgencyDue} from '../../runtime/core/campaign-play.mjs';import {createRuntimeOwner} from '../../runtime/service/runtime-owner.mjs';import {validateServiceCommit} from '../../runtime/service/service-commit.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
test('pre-existing repair counts, later damage revokes readiness, and a failed claim cannot unlock the next quest',()=>{
 let b=createAuditedBundle(createPlayableCampaignVillage().bundle,options),n=0;
 const act=(type,payload={})=>{const r=computeCampaignIntent(b,{version:5,commandId:'condition-'+(++n),expectedRevision:b.snapshot.revision,type,payload});b=r.bundle;return r.receipt;};
 const q=(id,action)=>act('PlayerQuest',{questId:id,action});q('livelihood','accept');act('PlayerWork');act('PlayerBuy',{product:'food',quantity:1});q('livelihood','claim');
 act('PlayerInteract',{targetId:'actor-2',action:'help'});q('hunter-aid','accept');assert.equal(b.snapshot.world.mapModel.playModel.quests[1].progress[0],1);
 act('PlayerGiftFood',{recipientId:'actor-2'});assert.equal(b.snapshot.world.mapModel.playModel.quests[1].status,'ready');
 act('PlayerInteract',{targetId:'actor-2',action:'smash'});assert.equal(b.snapshot.world.mapModel.playModel.quests[1].status,'active');assert.equal(q('hunter-aid','claim').outcome,'rejected');assert.equal(b.snapshot.world.mapModel.playModel.quests[2].status,'locked');
 act('PlayerInteract',{targetId:'actor-2',action:'help'});act('PlayerInteract',{targetId:'actor-2',action:'help'});assert.equal(q('hunter-aid','claim').outcome,'succeeded');validateBundle(b,options);
});
test('deadline and death fail active quests, while important and changed own facts wake the preparation cache',()=>{
 const w=structuredClone(createPlayableCampaignVillage().bundle.snapshot.world),p=w.mapModel.playModel,q=p.quests[0];Object.assign(q,{status:'active',acceptedTick:0,deadlineTick:2016});observePlayTick(w,2016);assert.equal(q.status,'active');observePlayTick(w,2017);assert.equal(q.status,'failed');
 Object.assign(q,{status:'active',deadlineTick:3000});w.actorModel.actors[3].alive=false;observePlayTick(w,2018);assert.equal(q.status,'failed');
 assert.equal(playAgencyDue(w,4),true);assert.equal(playAgencyDue(w,8),false);w.societyModel.agents[1].state.wallet++;assert.equal(playAgencyDue(w,12),true);
 p.quests[1].status='active';assert.equal(playAgencyDue(w,16),true);assert.equal(p.agency.tier,'important');assert.equal(playAgencyDue(w,20),true);
});
test('more than 129 durable files remain writable and reopen, and altered journal or terminal state is rejected',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'playable-budget-'));let owner;t.after(async()=>{if(owner)await owner.close();await fs.rm(directory,{recursive:true,force:true});});
 owner=await createRuntimeOwner({directory,profile:'campaign-playable-village',writable:true});let last;
 for(let i=0;i<131;i++){last={version:5,commandId:'durable-'+i,expectedRevision:owner.getSnapshot().revision,type:'PlayerQuest',payload:{questId:'livelihood',action:'claim'}};assert.equal((await owner.submit(last)).outcome,'rejected');}
 assert.equal((await fs.readdir(directory)).filter(n=>n.endsWith('.json')).length,132);const before=owner.getMap();await owner.close();owner=await createRuntimeOwner({directory,writable:true});assert.deepEqual(owner.getMap(),before);await owner.submit(last);
 const envelope=JSON.parse(await fs.readFile(path.join(directory,'service-commit-r131.json'),'utf8'));validateServiceCommit(envelope);
 const badJournal=structuredClone(envelope);badJournal.commands[0].receipt.outcome='succeeded';assert.throws(()=>validateServiceCommit(badJournal));
 const badState=structuredClone(envelope);badState.bundle.snapshot.world.playerModel.wallet++;assert.throws(()=>validateServiceCommit(badState));
});
