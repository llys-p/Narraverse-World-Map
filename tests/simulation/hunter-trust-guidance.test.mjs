import test from 'node:test';import assert from 'node:assert/strict';
import {createTrustCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot} from '../../runtime/service/http-contract.mjs';
import {createPlayableGoals,playableNextStep,trustQuestGuidance} from '../../demo-playable-goals.mjs';
function group(){const {bundle}=createTrustCampaignVillage();return {map:projectMapSnapshot(bundle,512),player:projectPlayerSnapshot(bundle),encounter:projectEncounterSnapshot(bundle)};}
function dom(t){const prev=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map();const e=()=>({textContent:'',hidden:false,disabled:false,dataset:{},children:[],handlers:{},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},addEventListener(k,fn){this.handlers[k]=fn;},click(){if(!this.disabled)this.handlers.click?.();}});globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,e());return nodes.get(id);},createElement:e};t.after(()=>{if(prev)Object.defineProperty(globalThis,'document',prev);else delete globalThis.document;});return nodes;}

test('optional card shows three real steps, loan timing, explicit actions, and visible hunter only',t=>{
 const nodes=dom(t),g=group(),q=g.map.playable.quests[4],opened=[],sent=[];
 q.status='active';q.remainingTicks=1900;q.progress=[1,1,0];q.loanDueTick=36;
 const panel=createPlayableGoals({submit:(...a)=>sent.push(a),approach:(...a)=>sent.push(a),openPerson:id=>opened.push(id)});
 const row=()=>nodes.get('playableQuestList').children.find(n=>n.dataset.quest==='hunter-trust');
 panel.paint(g,false);assert.match(row().children.map(n=>n.textContent).join(' '),/借到工具 1\/1.*抵达森林 1\/1.*亲手归还 0\/1/);
 assert.match(playableNextStep(g),/归还动作需10分钟/);assert.ok(row().children.find(n=>n.dataset.questAction==='abandon').disabled);
 const stale=row().children.find(n=>n.textContent==='查看猎人');assert.ok(stale);stale.click();assert.deepEqual(opened,['actor-2']);assert.deepEqual(sent,[]);
 const next=structuredClone(g);next.map.actors=[];panel.paint(next,true);assert.equal(row().children.find(n=>n.textContent==='查看猎人'),undefined);stale.click();assert.equal(opened.length,1);
 next.map.actors=g.map.actors;next.map.playable.quests[4].status='completed';panel.paint(next,true);stale.click();assert.equal(opened.length,1);
});

test('deadline guidance distinguishes a ten-minute return from zero-time quest claiming',()=>{
 const g=group(),q=g.map.playable.quests[4];Object.assign(q,{status:'active',progress:[1,1,0],loanDueTick:10});g.map.tick=9;
 assert.match(trustQuestGuidance(g,q),/0小时10分钟/);g.map.tick=10;assert.match(trustQuestGuidance(g,q),/现在执行也会逾期/);
 q.status='ready';assert.match(trustQuestGuidance(g,q),/已经按时归还/);assert.doesNotMatch(trustQuestGuidance(g,q),/会逾期/);
 q.status='failed';assert.match(trustQuestGuidance(g,q),/不会归还工具或免除借期/);
 g.map.social.asset={holderId:'actor-4'};assert.match(trustQuestGuidance(g,q),/亲手归还工具，再重接/);
 q.status='active';q.progress=[0,0,0];q.loanDueTick=null;assert.match(trustQuestGuidance(g,q),/不是本次任务接取后的借用/);
 g.map.social.asset=null;g.map.actors=[];assert.match(trustQuestGuidance(g,q),/请求借工具.*修理换借用/);
 g.map.actors=[{actorId:'actor-2',alive:false}];assert.match(trustQuestGuidance(g,q),/猎人已倒下/);
});
