import test from 'node:test';import assert from 'node:assert/strict';
import {createForestPanel} from '../../demo-forest.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {createForestCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import * as projection from '../../runtime/service/http-contract.mjs';
import {validForestView} from '../../runtime-forest-contract.mjs';
function group(bundle){return {apiVersion:1,capabilities:{apiVersion:1,continuousMarch:true,commandDtoVersion:5,playerAvailable:true,encounterAvailable:true,sceneAvailable:true,mapAvailable:true,writes:true},snapshot:projection.projectPublicSnapshot(bundle),map:projection.projectMapSnapshot(bundle,400),player:projection.projectPlayerSnapshot(bundle),encounter:projection.projectEncounterSnapshot(bundle),scene:projection.projectSceneSnapshot(bundle)};}
test('forest projection joins a coherent group and rejects forged view/state shapes',()=>{
 let b=createForestCampaignVillage().bundle,g=group(b);assert.ok(coherent(g));assert.equal(g.map.forest,null);
 const act=(type,payload={})=>{b=computeCampaignIntent(b,{version:5,commandId:'view-'+b.snapshot.revision,expectedRevision:b.snapshot.revision,type,payload}).bundle;};
 act('MarchSet',{x:16,y:7});while(b.snapshot.world.mapModel.order.status!=='arrived')act(b.snapshot.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep');g=group(b);assert.ok(coherent(g));assert.ok(validForestView(g.map.forest));
 for(const mutate of [g=>g.map.mapViewVersion=4,g=>g.map.forest=null,g=>g.map.forest.state.firewood=1,g=>g.map.forest.actions[0].available='yes',g=>g.map.forest.site.x=4,g=>g.map.forest.extra=true]){const bad=structuredClone(g);mutate(bad);assert.equal(coherent(bad),false);}
});
test('forest panel shows costs, opt-in choices, accessible status, and fresh disabled/exit controls without automatic writes',t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map(),node=()=>({textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(k,f){this.handlers[k]=f;},click(){this.handlers.click?.();}});
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};t.after(()=>{if(prior)Object.defineProperty(globalThis,'document',prior);else delete globalThis.document;});
 const calls=[],p=createForestPanel({submit:(...args)=>calls.push(args)}),f={version:1,site:{x:16,y:7},state:{branchesRemaining:3,firewood:0,harvested:0,campfires:0,trail:'unseen'},actions:['collect','camp','observe','avoid'].map(action=>({action,available:action!=='camp',reasonCode:action==='camp'?'NO_FIREWOOD':null}))};
 const g={map:{forest:f,social:{asset:{holderId:'actor-4',condition:80}},tick:50,budget:{remainingCommands:400},playable:{quests:[{id:'hunter-trust',loanDueTick:70,progress:[1,1,0]}]}},encounter:{encounter:null,actions:{canBegin:false,canCancel:false}}};p.paint(g,true);assert.equal(calls.length,0);assert.equal(nodes.get('forestJourney').hidden,false);assert.match(nodes.get('forestCosts').textContent,/耐久−10/);assert.match(nodes.get('forestCosts').textContent,/200 分钟/);assert.match(nodes.get('forestTrail').textContent,/绕开/);assert.match(nodes.get('forestActionHint').textContent,/需要1捆枯枝/);
 nodes.get('forest-collect').click();nodes.get('forest-challenge').click();assert.deepEqual(calls,[['PlayerForest',{action:'collect'}]]);
 p.paint(g,false);nodes.get('forest-collect').click();assert.equal(calls.length,1);
 const active=structuredClone(g);active.map.forest.state.trail='engaged';active.encounter={encounter:{status:'active',encounterId:'encounter-2'},actions:{canBegin:false,canCancel:true}};active.map.forest.actions.forEach(a=>{a.available=false;a.reasonCode='ENCOUNTER_BUSY';});p.paint(active,true);assert.equal(nodes.get('forest-return').disabled,true);nodes.get('forest-return').click();nodes.get('forest-exit').click();assert.deepEqual(calls.at(-1),['EncounterCancel',{encounterId:'encounter-2'}]);
 p.paint({map:{forest:null}},true);nodes.get('forest-exit').click();assert.equal(nodes.get('forestJourney').hidden,true);assert.equal(calls.length,2);
});
