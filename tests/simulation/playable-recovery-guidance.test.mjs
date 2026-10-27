import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableCampaignVillage,defaultPlayableVillageConfig,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle} from '../../runtime/core/world-state.mjs';
import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {observePlayTick,auditQuest,commitQuest,playableView} from '../../runtime/core/campaign-play.mjs';
import {projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot} from '../../runtime/service/http-contract.mjs';
import {playableNextStep,questDeadlineText,createPlayableGoals} from '../../demo-playable-goals.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
const project=b=>({map:projectMapSnapshot(b,512-b.snapshot.world.encounterModel.inputHistory.length),player:projectPlayerSnapshot(b),encounter:projectEncounterSnapshot(b)});
const dto=(id,action)=>({type:'PlayerQuest',payload:{questId:id,action}});

test('last tick permits a ready village claim; advancing one tick fails it and a later acceptance resets progress',()=>{
 const b=createPlayableCampaignVillage().bundle,w=structuredClone(b.snapshot.world),q=w.mapModel.playModel.quests[0];
 Object.assign(q,{status:'ready',acceptedTick:0,deadlineTick:2016,claimedTick:null,progress:[1,1]});
 observePlayTick(w,2016);const g=project(b);g.map.playable=playableView(w,2016);g.map.tick=2016;
 assert.equal(auditQuest(w,dto('livelihood','claim')).outcome,'succeeded');assert.match(playableNextStep(g),/现在.*领取.*推进世界时间会使任务失败/);assert.match(questDeadlineText(g.map.playable.quests[0]),/最后一刻/);
 const claimed=structuredClone(w);assert.equal(commitQuest(claimed,dto('livelihood','claim'),2016).status,'completed');
 g.map.self.location='forest';assert.match(playableNextStep(g),/返回村庄会推进时间并使任务失败/);
 observePlayTick(w,2017);assert.equal(q.status,'failed');assert.equal(auditQuest(w,dto('livelihood','claim')).outcome,'rejected');
 assert.equal(auditQuest(w,dto('livelihood','accept')).outcome,'succeeded');commitQuest(w,dto('livelihood','accept'),2017);assert.deepEqual(q.progress,[0,0]);assert.equal(q.deadlineTick,4033);
});
test('last tick warns during battle and ongoing march without promising an instant pause',()=>{
 const g=project(createPlayableCampaignVillage().bundle),q=g.map.playable.quests[0];q.status='active';q.remainingTicks=0;
 g.encounter.encounter={status:'active'};assert.match(playableNextStep(g),/推进世界时间.*失败/);g.encounter.encounter=null;
 g.map.order={status:'marching'};assert.match(playableNextStep(g),/已进行的步进仍可能完成/);g.map.order=null;
 assert.match(playableNextStep(g),/不推进时间的可用行动/);g.map.budget.remainingCommands=0;assert.match(playableNextStep(g),/额度已用完/);
});
test('failed and abandoned quests offer a reaccept without inventing rewards or world changes',()=>{
 const g=project(createPlayableCampaignVillage().bundle),q=g.map.playable.quests[0];
 for(const status of ['failed','abandoned']){q.status=status;const before=structuredClone(g);assert.match(playableNextStep(g),/重新接取/);assert.deepEqual(g,before);}
 g.map.self.alive=false;assert.match(playableNextStep(g),/旅程已结束.*存档保留/);
});
test('the last available command cannot lead to an unfinishable new attempt; a ready village claim remains available',()=>{
 const g=project(createPlayableCampaignVillage().bundle),q=g.map.playable.quests[0];g.map.budget.remainingCommands=1;
 for(const status of ['available','active','abandoned','failed']){q.status=status;assert.match(playableNextStep(g),/只剩1次新操作.*无法完成并领取/);}
 q.status='ready';g.map.self.location='forest';assert.match(playableNextStep(g),/只剩1次新操作/);
 g.map.self.location='village';assert.match(playableNextStep(g),/领取/);q.remainingTicks=0;assert.match(playableNextStep(g),/现在.*领取/);
});
test('a visibly dead hunter blocks misleading repair and gift guidance in a real audited world',()=>{
 const c=defaultPlayableVillageConfig();c.memory.society.actors.initialActors[1].health=0;
 let b=createAuditedBundle(createPlayableCampaignVillage(42,'visible-dead-hunter',c).bundle,options),i=0;
 const run=(type,payload={})=>{const result=computeCampaignIntent(b,{version:5,commandId:'visible-dead-'+(++i),expectedRevision:b.snapshot.revision,type,payload});b=result.bundle;return result.receipt;};
 const quest=(questId,action)=>run('PlayerQuest',{questId,action});
 assert.equal(quest('livelihood','accept').outcome,'succeeded');assert.equal(run('PlayerWork').outcome,'succeeded');assert.equal(run('PlayerBuy',{product:'food',quantity:1}).outcome,'succeeded');assert.equal(quest('livelihood','claim').outcome,'succeeded');assert.equal(quest('hunter-aid','accept').outcome,'succeeded');
 const g=project(b),hunter=g.map.actors.find(a=>a.actorId==='actor-2');assert.equal(hunter.alive,false);assert.match(playableNextStep(g),/猎人已倒下.*放弃任务.*原存档会保留/);
 assert.equal(quest('hunter-aid','abandon').outcome,'succeeded');
 const hidden=structuredClone(g);hidden.map.actors=hidden.map.actors.filter(a=>a.actorId!=='actor-2');let reads=0;Object.defineProperty(hidden,'world',{get(){reads++;throw Error('private state accessed');}});
 assert.doesNotMatch(playableNextStep(hidden),/已倒下/);assert.equal(reads,0);
});
test('a ready quest stays claimable even if the hunter is visible dead; no approach button is offered for a dead hunter',t=>{
 const g=project(createPlayableCampaignVillage().bundle);g.map.playable.quests.forEach(q=>q.status='locked');const q=g.map.playable.quests[1];q.status='ready';q.remainingTicks=1;
 g.map.actors=[{actorId:'actor-2',x:5,y:8,alive:false,canInteract:false}];assert.match(playableNextStep(g),/领取/);
 const old=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map(),el=()=>({textContent:'',hidden:false,disabled:false,dataset:{},children:[],append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},addEventListener(){}});
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);},createElement:el};t.after(()=>{if(old)Object.defineProperty(globalThis,'document',old);else delete globalThis.document;});
 q.status='active';createPlayableGoals({submit(){},approach(){throw Error('cannot approach dead hunter');}}).paint(g,true);
 assert.equal(nodes.get('playableQuestList').children.find(x=>x.dataset.quest==='hunter-aid').children.some(x=>x.textContent==='走近猎人'),false);
});
