import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignMap,mapRoute,mapLocation,auditMarch,commitMarch,advanceMapTick,validateCampaignMap} from '../../runtime/core/campaign-map.mjs';
function world(){const w={actorModel:{actors:['chief','hunter','merchant','player'].map((occupation,i)=>({actorId:`actor-${i+1}`,occupation,location:'village',alive:true,health:1000,hunger:0,fatigue:0,needs:{food:0,healing:0,rest:0}}))},encounterModel:{encounter:null}};w.mapModel=createCampaignMap();return w;}
const dto=(type,payload={})=>({type,payload});
test('bounded route uses the bridge and authority derives region',()=>{
 const path=mapRoute({x:4,y:7},{x:16,y:7});assert.equal(path.length,13);assert(path.filter(p=>p.x===10).every(p=>p.y===7));
 assert.equal(mapRoute({x:4,y:7},{x:10,y:6}),null);assert.equal(mapLocation({x:8,y:7}),'road');assert.equal(mapLocation({x:16,y:7}),'forest');
});
test('pause and replan retain actual position and cumulative fatigue',()=>{
 const w=world();let d=dto('MarchSet',{x:16,y:7});assert.equal(auditMarch(w,d).outcome,'succeeded');commitMarch(w,d,0);
 advanceMapTick(w,1);advanceMapTick(w,2);assert.deepEqual(w.mapModel.position,{x:6,y:7});
 commitMarch(w,dto('MarchPause'),2);advanceMapTick(w,3);assert.deepEqual(w.mapModel.position,{x:6,y:7});
 commitMarch(w,dto('MarchSet',{x:7,y:7}),3);advanceMapTick(w,4);assert.deepEqual(w.mapModel.position,{x:7,y:7});
 assert.equal(w.mapModel.travelledSteps,3);assert.equal(w.actorModel.actors[3].fatigue,25);assert.equal(w.mapModel.order.status,'arrived');validateCampaignMap(w,4);
});
test('newly met NPC pauses a real order; no duplicate encounter while adjacent',()=>{
 const w=world();w.mapModel.position={x:16,y:7};w.actorModel.actors[3].location='forest';
 commitMarch(w,dto('MarchSet',{x:4,y:7}),24);for(let tick=25;tick<=40&&w.mapModel.order.status==='marching';tick++)advanceMapTick(w,tick);
 assert(w.mapModel.contact);assert.equal(w.mapModel.order.status,'paused');const at={...w.mapModel.position};
 commitMarch(w,dto('MarchPause'),40);assert.equal(w.mapModel.contact,null);assert.deepEqual(w.mapModel.position,at);
});
