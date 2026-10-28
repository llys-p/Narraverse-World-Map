import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot} from '../../runtime/service/http-contract.mjs';
import {createPlayableGoals,playableNextStep,questDeadlineText} from '../../demo-playable-goals.mjs';
import {validPlayableView} from '../../runtime-playable-contract.mjs';
function dom(t){const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map();
 const e=()=>({textContent:'',hidden:false,disabled:false,dataset:{},children:[],handlers:{},append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},addEventListener(k,fn){this.handlers[k]=fn;},click(){if(!this.disabled)this.handlers.click?.();}});
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,e());return nodes.get(id);},createElement:e};t.after(()=>{if(prior)Object.defineProperty(globalThis,'document',prior);else delete globalThis.document;});return nodes;
}
function group(){const {bundle}=createTrustCampaignVillage(),g={map:projectMapSnapshot(bundle,512),player:projectPlayerSnapshot(bundle),encounter:projectEncounterSnapshot(bundle)};
 for(const q of g.map.playable.quests.slice(0,3))Object.assign(q,{status:'completed',progress:[1,1],acceptedTick:0,deadlineTick:2016,claimedTick:0,remainingTicks:2016});
 Object.assign(g.map.playable,{chapterComplete:true,rank:3});const q=g.map.playable.quests[4];Object.assign(q,{status:'active',acceptedTick:0,deadlineTick:2016,remainingTicks:2016});return g;
}
test('trust journey card is discoverable and can open a visible living hunter read-only; stale handlers cannot open hidden or completed targets',t=>{
 const nodes=dom(t),g=group(),opened=[],sent=[],panel=createPlayableGoals({openPerson:x=>opened.push(x),submit:(...x)=>sent.push(x),approach:(...x)=>sent.push(x)});
 const row=()=>nodes.get('playableQuestList').children.find(n=>n.dataset.quest==='hunter-trust');
 panel.paint(g,false);assert.match(nodes.get('playableChapterSummary').textContent,/借工具探路/);assert.ok(row().children.some(n=>n.textContent.includes('带本次借用')));
 const stale=row().children.find(n=>n.textContent==='查看猎人');assert.ok(stale);stale.click();assert.deepEqual(opened,['actor-2']);assert.deepEqual(sent,[]);
 const absent=structuredClone(g);absent.map.actors=[];panel.paint(absent,false);stale.click();assert.equal(opened.length,1);
 const complete=structuredClone(g);complete.map.playable.quests[4].status='completed';panel.paint(complete,false);stale.click();assert.equal(opened.length,1);
});
test('guidance distinguishes requesting, carrying, returning and overdue debt; reaccept stays disabled while the tool is held',t=>{
 const nodes=dom(t),g=group(),q=g.map.playable.quests[4],panel=createPlayableGoals({submit(){throw Error('unexpected command');},approach(){throw Error('unexpected movement');}});
 assert.match(playableNextStep(g),/请求借工具.*借用/);q.loan={borrowedTick:1,dueTick:145,exploredTick:null,returnedTick:null};g.map.social.asset.holderId='actor-4';
 assert.match(playableNextStep(g),/带着.*森林/);q.progress[0]=1;q.loan.exploredTick=10;assert.match(playableNextStep(g),/选择“归还工具”/);
 q.status='failed';q.remainingTicks=0;assert.match(playableNextStep(g),/失败.*实际归还/);panel.paint(g,true);
 const row=nodes.get('playableQuestList').children.find(n=>n.dataset.quest==='hunter-trust'),accept=row.children.find(n=>n.dataset.questAction==='accept');assert.equal(accept.disabled,true);
 q.status='active';assert.match(questDeadlineText(q),/最后一刻/);
});
test('version2 public contract rejects invented readiness, future return, and new fields spliced into the old view',()=>{
 const {bundle}=createTrustCampaignVillage(),v=projectMapSnapshot(bundle,512).playable;assert.equal(validPlayableView(v,0),true);
 const falseReady=structuredClone(v);Object.assign(falseReady.quests[4],{status:'ready',progress:[1,1]});assert.equal(validPlayableView(falseReady,0),false);
 const future=structuredClone(v);future.quests[4].loan={borrowedTick:0,dueTick:144,exploredTick:null,returnedTick:1};assert.equal(validPlayableView(future,0),false);
 const old=structuredClone(v);old.version=1;assert.equal(validPlayableView(old,0),false);
});
