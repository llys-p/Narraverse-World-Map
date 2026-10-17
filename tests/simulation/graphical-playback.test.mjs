import test from 'node:test';
import assert from 'node:assert/strict';
import {placeCast,confirmedPlayback,createPlaybackGate} from '../../runtime-playback-state.mjs';
const group={simulationId:'world',revision:19,tick:18,location:'forest',playerHealth:920,playerAlive:true,encounterId:'encounter-1',wolfHealth:150,status:'active',resolution:null};
const command={version:4,commandId:'hit-1',expectedRevision:13,type:'EncounterAction',payload:{encounterId:'encounter-1',action:'attack'}};
const receipt={apiVersion:1,receiptVersion:4,commandId:'hit-1',type:'EncounterAction',status:'committed',outcome:'succeeded',fromRevision:13,toRevision:19,fromTick:12,tick:18,durationTicks:6,
 result:{actorId:'actor-4',encounterId:'encounter-1',action:'attack',reasonCode:null,before:{tick:12,playerHealth:1000,playerAlive:true,wolfHealth:300},after:{tick:18,playerHealth:920,playerAlive:true,wolfHealth:150,status:'active',resolution:null}}};
test('place cast never moves player or reveals other-location actors',()=>{
 const input={viewPlace:'village',player:{actorId:'actor-4',name:'玩家',location:'forest',alive:true},actors:[{actorId:'actor-2',name:'猎人',location:'village',alive:true},{actorId:'actor-3',name:'商人',location:'forest',alive:true}]};
 assert.deepEqual(placeCast(input).map(a=>a.actorId),['actor-2']);assert.equal(input.player.location,'forest');
 assert.deepEqual(placeCast({...input,viewPlace:'forest'}).map(a=>a.actorId),['actor-4','actor-3']);
});
test('playback uses confirmed matching command and same revision only; no invented damage fields',()=>{
 const plan=confirmedPlayback(receipt,command,group);assert.equal(plan.action,'attack');assert.equal(plan.before.playerHealth,1000);assert.equal(plan.after.playerHealth,920);assert.equal(Object.hasOwn(plan,'damage'),false);
 assert.equal(confirmedPlayback({...receipt,outcome:'rejected'},command,group),null);
 assert.equal(confirmedPlayback(receipt,command,{...group,revision:20}),null);
 assert.equal(confirmedPlayback(receipt,{...command,commandId:'another'},group),null);
 assert.equal(confirmedPlayback(receipt,command,{...group,location:'village'}),null);
 assert.equal(confirmedPlayback(receipt,command,{...group,wolfHealth:0}),null);
 const before=structuredClone(receipt);plan.after.playerHealth=1;assert.deepEqual(receipt,before);
});
test('cancel/new revision invalidates captured callbacks; duplicate receipts do not replay',()=>{
 const gate=createPlaybackGate();gate.update('world:19');const first=gate.start('hit-1');assert.equal(gate.isCurrent(first),true);
 gate.cancel();assert.equal(gate.isCurrent(first),false);assert.equal(gate.start('hit-1'),null);
 const second=gate.start('hit-2');gate.update('world:20');assert.equal(gate.isCurrent(second),false);
 const third=gate.start('hit-3');gate.update('world:20');assert.equal(gate.isCurrent(third),true);
});
