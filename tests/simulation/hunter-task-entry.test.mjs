import test from 'node:test';import assert from 'node:assert/strict';
import {createPlayableCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot} from '../../runtime/service/http-contract.mjs';
import {createPlayableGoals} from '../../demo-playable-goals.mjs';
function dom(t){const prev=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map();const e=()=>({textContent:'',hidden:false,disabled:false,dataset:{},children:[],handlers:{},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},addEventListener(k,fn){this.handlers[k]=fn;},click(){if(!this.disabled)this.handlers.click?.();}});globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,e());return nodes.get(id);},createElement:e};t.after(()=>{if(prev)Object.defineProperty(globalThis,'document',prev);else delete globalThis.document;});return nodes;}
function group(){const {bundle}=createPlayableCampaignVillage();const g={map:projectMapSnapshot(bundle,512),player:projectPlayerSnapshot(bundle),encounter:projectEncounterSnapshot(bundle)};g.map.playable.quests[0].status='completed';g.map.playable.quests[1].status='active';g.map.playable.quests[1].remainingTicks=100;return g;}
test('active quest opens only the currently visible living hunter, including read-only mode',t=>{
 const nodes=dom(t),g=group(),opened=[],sent=[];g.map.actors=[{actorId:'actor-2',alive:true,x:5,y:7,canInteract:true}];const panel=createPlayableGoals({submit:(...x)=>sent.push(x),approach:(...x)=>sent.push(x),openPerson:id=>opened.push(id)});
 const button=()=>nodes.get('playableQuestList').children.find(n=>n.dataset.quest==='hunter-aid').children.find(n=>n.textContent==='查看猎人');
 panel.paint(g,false);const stale=button();assert.ok(stale);stale.click();assert.deepEqual(opened,['actor-2']);assert.deepEqual(sent,[]);
 const newer=structuredClone(g);newer.map.actors=[];panel.paint(newer,false);assert.equal(button(),undefined);stale.click();assert.deepEqual(opened,['actor-2']);
 newer.map.actors=[{actorId:'actor-2',alive:false,x:5,y:7,canInteract:false}];panel.paint(newer,false);assert.equal(button(),undefined);stale.click();assert.equal(opened.length,1);
 newer.map.actors[0].alive=true;newer.map.playable.quests[1].status='completed';panel.paint(newer,false);assert.equal(button(),undefined);stale.click();assert.equal(opened.length,1);
 panel.paint({map:{playable:null}},false);stale.click();assert.equal(opened.length,1);
});
