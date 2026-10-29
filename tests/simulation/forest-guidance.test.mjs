import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestPanel} from '../../demo-forest.mjs';
function dom(t){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map();
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(k,fn){this.handlers[k]=fn;},click(){this.handlers.click?.();}});return nodes.get(id);}};
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});return nodes;
}
function group(){return {map:{self:{alive:true,location:'forest',x:16,y:7},actors:[],order:null,tick:50,budget:{remainingCommands:400},
 forest:{version:1,site:{x:16,y:7},state:{branchesRemaining:3,firewood:0,harvested:0,campfires:0,trail:'unseen'},actions:['collect','camp','observe','avoid'].map(action=>({action,available:action!=='camp',reasonCode:action==='camp'?'NO_FIREWOOD':null}))},
 social:{asset:{holderId:'actor-4',condition:80}},playable:{quests:[{id:'hunter-trust',status:'active',loanDueTick:70,progress:[1,1,0]}]}},player:{self:{fatigue:100,identity:{alive:true}},actions:{restTicks:6}},encounter:{encounter:null,actions:{canBegin:false,canCancel:false},population:{availableWolves:2}},runner:{active:false}};}
test('fatigue rejection explains recovery instead of incorrectly asking a stopped player to pause marching',t=>{
 const nodes=dom(t),g=group();g.player.self.fatigue=925;Object.assign(g.map.forest.actions[0],{available:false,reasonCode:'RULE_REJECTED'});
 createForestPanel({submit(){throw Error('paint wrote');}}).paint(g,true);
 assert.match(nodes.get('forestActionHint').textContent,/疲劳过高/);assert.doesNotMatch(nodes.get('forest-collect').title,/先暂停行军/);
});
test('a failed old loan does not claim its deadline is the current held tool loan',t=>{
 const nodes=dom(t),g=group();g.map.playable.quests[0].status='failed';g.map.tick=80;
 createForestPanel({submit(){throw Error('paint wrote');}}).paint(g,true);
 assert.doesNotMatch(nodes.get('forestCosts').textContent,/借期剩余 0 分钟/);
 assert.match(nodes.get('forestLoan').textContent,/旧委托|当前借期.*无法确认/);
});
test('observed and avoided choices explain their actual state and stale clicks never resubmit them',t=>{
 const nodes=dom(t),g=group(),calls=[],panel=createForestPanel({submit:(...x)=>calls.push(x)});panel.paint(g,true);
 const observe=nodes.get('forest-observe').handlers.click;observe();assert.deepEqual(calls,[['PlayerForest',{action:'observe'}]]);
 g.map.forest.state.trail='observed';Object.assign(g.map.forest.actions[2],{available:false,reasonCode:'RULE_REJECTED'});g.encounter.actions.canBegin=true;panel.paint(g,true);observe();
 assert.equal(calls.length,1);assert.match(nodes.get('forest-observe-hint').textContent,/已经观察/);nodes.get('forest-challenge').click();assert.deepEqual(calls.at(-1),['EncounterBegin',{}]);
 g.map.forest.state.trail='avoided';Object.assign(g.map.forest.actions[3],{available:false,reasonCode:'RULE_REJECTED'});g.encounter.actions.canBegin=false;panel.paint(g,true);
 nodes.get('forest-avoid').click();nodes.get('forest-challenge').click();assert.equal(calls.length,2);assert.match(nodes.get('forest-avoid-hint').textContent,/已经绕开/);
});
test('site and return buttons use explicit current destinations and resume an existing return instead of replacing it',t=>{
 const nodes=dom(t),g=group(),calls=[],panel=createForestPanel({submit:(...x)=>calls.push(x)});g.map.self.x=14;panel.paint(g,true);assert.deepEqual(calls,[]);
 nodes.get('forest-site').click();assert.deepEqual(calls.at(-1),['MarchSet',{x:16,y:7}]);nodes.get('forest-return').click();assert.deepEqual(calls.at(-1),['MarchSet',{x:4,y:7}]);
 g.map.order={target:{x:4,y:7},status:'paused'};panel.paint(g,true);assert.match(nodes.get('forest-return').textContent,/继续/);nodes.get('forest-return').click();assert.deepEqual(calls.at(-1),['MarchResume',{}]);
 g.map.order.status='marching';g.runner.active=true;panel.paint(g,true);nodes.get('forest-return').handlers.click();assert.equal(calls.length,3);assert.equal(nodes.get('forest-return').disabled,true);
 g.runner.active=false;panel.paint(g,true);nodes.get('forest-return').click();assert.deepEqual(calls.at(-1),['MarchResume',{}]);assert.equal(calls.length,4);
});
test('no fuel or exhausted branches still leave ordinary rest available without manufacturing fuel or actions',t=>{
 const nodes=dom(t),g=group(),calls=[],panel=createForestPanel({submit:(...x)=>calls.push(x)});
 Object.assign(g.map.forest.state,{branchesRemaining:0,harvested:3,firewood:0,campfires:3});Object.assign(g.map.forest.actions[0],{available:false,reasonCode:'FOREST_DEPLETED'});
 const before=structuredClone(g);panel.paint(g,true);assert.deepEqual(g,before);assert.deepEqual(calls,[]);assert.match(nodes.get('forestPlan').textContent,/采尽/);
 nodes.get('forest-collect').click();nodes.get('forest-camp').click();assert.equal(calls.length,0);nodes.get('forest-rest').click();assert.deepEqual(calls,[['PlayerRest',{}]]);
 g.map.order={target:{x:4,y:7},status:'marching'};panel.paint(g,true);nodes.get('forest-rest').click();assert.equal(calls.length,1);
});
test('the last combat command remains an explicit exit, while exhausted, dead, locked and hidden states block all stale handlers',t=>{
 const nodes=dom(t),g=group(),calls=[],panel=createForestPanel({submit:(...x)=>calls.push(x)}),actions=['collect','camp','observe','avoid','site','rest','challenge','exit','return'];
 g.map.forest.state.trail='engaged';g.map.budget.remainingCommands=1;g.encounter.encounter={status:'active',encounterId:'encounter-current'};g.encounter.actions={canBegin:false,canCancel:true};panel.paint(g,true);
 assert.match(nodes.get('forestPlan').textContent,/最后1次.*结束遭遇/);for(const a of actions)nodes.get('forest-'+a).handlers.click();assert.deepEqual(calls,[['EncounterCancel',{encounterId:'encounter-current'}]]);
 for(const [state,write] of [[g,false],[{...g,map:{...g.map,budget:{remainingCommands:0}}},true],[{...g,map:{...g.map,self:{...g.map.self,alive:false}}},true],[{map:{forest:null}},true]]){
  panel.paint(state,write);for(const a of actions)nodes.get('forest-'+a).handlers.click();assert.equal(calls.length,1);
 }
});
test('loan advice includes time for actual handover and never promises that an activity leaves enough time for the trip',t=>{
 const nodes=dom(t),g=group(),calls=[],panel=createForestPanel({submit:(...x)=>calls.push(x)});g.map.playable.quests[0].loanDueTick=54;panel.paint(g,true);
 assert.match(nodes.get('forestLoan').textContent,/剩余 40 分钟.*归还还需10分钟.*返程/);assert.match(nodes.get('forest-collect-hint').textContent,/仅剩.*10分钟.*未计返程/);
 nodes.get('forest-collect').click();assert.equal(calls.length,1); // Warning informs choice; it is not a new world rule.
 g.map.tick=51;panel.paint(g,true);assert.match(nodes.get('forest-collect-hint').textContent,/用尽借期/);
 g.map.tick=52;panel.paint(g,true);assert.match(nodes.get('forest-collect-hint').textContent,/超过.*借期/);
 g.map.tick=54;panel.paint(g,true);assert.match(nodes.get('forestLoan').textContent,/最后一刻.*无法按期/);
});
test('abandoned or completed task history and a missing held tool cannot become a current borrowing countdown',t=>{
 const nodes=dom(t),g=group(),panel=createForestPanel({submit(){throw Error('unexpected write');}}),q=g.map.playable.quests[0];
 for(const status of ['abandoned','failed','completed','ready','available']){q.status=status;panel.paint(g,true);assert.match(nodes.get('forestLoan').textContent,/当前借期无法|当前借期.*无法/);assert.doesNotMatch(nodes.get('forestLoan').textContent,/借期剩余/);}
 q.status='active';g.map.social.asset=null;panel.paint(g,true);assert.match(nodes.get('forestLoan').textContent,/未携带/);assert.doesNotMatch(nodes.get('forestLoan').textContent,/借期剩余/);
});
test('low noncombat budgets explain why travel or challenge is unavailable without silently reserving or spending commands',t=>{
 const nodes=dom(t),g=group(),calls=[],panel=createForestPanel({submit:(...x)=>calls.push(x)});g.map.budget.remainingCommands=2;g.map.forest.state.trail='observed';g.encounter.actions.canBegin=true;
 panel.paint(g,true);assert.match(nodes.get('forest-return-hint').textContent,/至少剩余3次/);nodes.get('forest-return').click();assert.equal(calls.length,0);
 g.map.budget.remainingCommands=1;g.encounter.actions.canBegin=false;panel.paint(g,true);assert.match(nodes.get('forest-challenge-hint').textContent,/至少2次.*保留1次/);nodes.get('forest-challenge').click();assert.equal(calls.length,0);
});
