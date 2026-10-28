import test from 'node:test';import assert from 'node:assert/strict';
import {createPlayableCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot} from '../../runtime/service/http-contract.mjs';
import {createPlayableGoals,playableNextStep} from '../../demo-playable-goals.mjs';
function group(){const {bundle}=createPlayableCampaignVillage();return {map:projectMapSnapshot(bundle,512),player:projectPlayerSnapshot(bundle),encounter:projectEncounterSnapshot(bundle)};}
function dom(t){const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map();const elem=()=>({textContent:'',hidden:false,disabled:false,dataset:{},children:[],append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},addEventListener(){}});globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,elem());return nodes.get(id);},createElement:elem};t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});return nodes;}
test('chapter recap appears only when completed and reflects optional challenge and death',t=>{
 const nodes=dom(t),g=group(),panel=createPlayableGoals({submit(){throw Error('must not submit');},approach(){throw Error('must not move');}}),summary=()=>nodes.get('playableChapterSummary');
 panel.paint(g,true);assert.equal(summary().hidden,true);assert.equal(summary().textContent,'');
 g.map.playable.chapterComplete=true;for(const q of g.map.playable.quests.slice(0,3))q.status='completed';g.map.playable.quests[3].status='available';panel.paint(g,true);
 assert.equal(summary().hidden,false);assert.match(summary().textContent,/工作.*购买口粮.*帮助猎人.*森林往返/);assert.match(summary().textContent,/可选.*猎狼/);
 g.map.playable.quests[3].status='completed';panel.paint(g,true);assert.match(summary().textContent,/也完成了可选的猎狼挑战/);
 g.map.budget.remainingCommands=0;panel.paint(g,true);assert.match(summary().textContent,/操作额度已用完/);assert.doesNotMatch(summary().textContent,/继续探索/);
 g.map.self.alive=false;panel.paint(g,true);assert.match(summary().textContent,/旅程已结束/);assert.doesNotMatch(summary().textContent,/继续探索/);
});
test('repair guidance uses only currently visible hunter and explains the interaction and tool location',()=>{
 const g=group(),q=g.map.playable.quests[1];g.map.playable.quests[0].status='completed';q.status='active';q.remainingTicks=100;
 g.map.actors=g.map.actors.filter(x=>x.actorId!=='actor-2');assert.match(playableNextStep(g),/寻找猎人.*歇脚处工具附近.*帮助修理/);
 g.map.actors.push({actorId:'actor-2',alive:true,canInteract:false,x:6,y:7});assert.match(playableNextStep(g),/走近当前可见的猎人.*人物卡/);
 g.map.actors.at(-1).canInteract=true;assert.match(playableNextStep(g),/打开猎人人物卡.*歇脚处工具附近/);
});
test('ready quest label distinguishes claiming here from returning to the village',t=>{
 const nodes=dom(t),g=group(),q=g.map.playable.quests[0];q.status='ready';q.progress=[1,1];q.remainingTicks=50;const panel=createPlayableGoals({submit(){},approach(){}});panel.paint(g,true);
 const title=()=>nodes.get('playableQuestList').children[0].children[0].textContent;assert.match(title(),/可以领取/);g.map.self.location='forest';panel.paint(g,true);assert.match(title(),/返回村庄领取/);
});
