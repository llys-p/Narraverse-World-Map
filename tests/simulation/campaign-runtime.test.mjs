import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignVillage,defaultCampaignVillageConfig} from '../../runtime/fixtures/campaign-village.mjs';
import {executeAuditedCampaignIntent,preflightCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {requireMarchBudget,mapView} from '../../runtime/core/campaign-map.mjs';
import {validateCampaignReceipt} from '../../runtime-campaign-contract.mjs';
import {validateBundle} from '../../runtime/core/world-state.mjs';

function game(config){
 let {bundle,systems}=createCampaignVillage(42,'campaign-village',config),seq=0;
 return {get bundle(){return bundle;},send(type,payload={}){
  const dto={version:5,commandId:`runtime-${++seq}`,expectedRevision:bundle.snapshot.revision,type,payload},from=bundle.snapshot.tick;
  const result=executeAuditedCampaignIntent(bundle,dto);assert.equal(validateCampaignReceipt(result.receipt,dto,from),true);
  bundle=result.bundle;return result.receipt;
 },audit(){validateBundle(bundle,{rulesVersion:bundle.snapshot.rulesVersion,systems});}};
}
function toForest(g){g.send('MarchSet',{x:16,y:7});for(let i=0;i<16;i++){const m=g.bundle.snapshot.world.mapModel;if(m.order.status==='arrived')break;if(m.order.status==='paused')g.send('MarchResume');else g.send('MarchStep');}assert.equal(g.bundle.snapshot.world.actorModel.actors[3].location,'forest');}

test('campaign input and reserved pause budget reject without reading getters or changing old DTO gates',()=>{
 let calls=0;const dto={version:5,commandId:'input',expectedRevision:0,type:'MarchSet',payload:{x:1,y:1}};
 for(const payload of [{x:20,y:1},{x:-1,y:1},{x:1,y:1,cost:0}])assert.throws(()=>preflightCampaignIntent({...dto,payload}));
 assert.throws(()=>preflightCampaignIntent({...dto,payload:{get x(){calls++;return 1;},y:1}}));assert.equal(calls,0);
 assert.throws(()=>preflightCampaignIntent({...dto,version:4}),e=>e.code==='UNSUPPORTED_VERSION');
 assert.throws(()=>preflightCampaignIntent({...dto,type:'PlayerTravel',payload:{destination:'forest'}}));
 for(const type of ['MarchSet','MarchResume']){assert.throws(()=>requireMarchBudget(type,2),e=>e.code==='LIMIT_EXCEEDED');requireMarchBudget(type,3);}
 assert.throws(()=>requireMarchBudget('MarchStep',1),e=>e.code==='LIMIT_EXCEEDED');requireMarchBudget('MarchStep',2);requireMarchBudget('MarchPause',1);assert.throws(()=>requireMarchBudget('PlayerWork',1,{mapModel:{order:{status:'marching'}}}),e=>e.code==='LIMIT_EXCEEDED');
});

test('campaign cross-day attack separates real settlement from strike/counter and keeps local knowledge',()=>{
 const config=defaultCampaignVillageConfig();config.memory.society.player.initialFood=0;
 const player=config.memory.society.actors.initialActors[3];player.health=900;player.hunger=700;
 const g=game(config);toForest(g);g.send('AdvanceTime',{ticks:138-g.bundle.snapshot.tick});g.send('EncounterBegin');
 const id=g.bundle.snapshot.world.encounterModel.encounter.encounterId;
 const r=g.send('EncounterAction',{action:'attack',encounterId:id});
 assert.equal(r.tick,144);assert.deepEqual(r.result.turnEvents.map(e=>e.kind),['player-strike','wolf-counter','world-settlement']);
 assert.deepEqual(r.result.turnEvents.map(e=>[e.beforeHealth,e.afterHealth]),[[300,150],[900,820],[820,770]]);
 const view=mapView(g.bundle,100);assert.ok(view.actors.every(a=>Math.max(Math.abs(a.x-view.self.x),Math.abs(a.y-view.self.y))<=4));
 assert.ok(view.actors.every(a=>!Object.hasOwn(a,'wallet')&&!Object.hasOwn(a,'plans')));
 const w=g.bundle.snapshot.world;assert.equal(w.memoryModel.observer.version,'memory-observer-v4');
 for(const a of w.actorModel.actors)assert.equal(w.memoryModel.observer.actors.find(o=>o.actorId===a.actorId).location,a.location);
 g.audit();
 const win=g.send('EncounterAction',{action:'attack',encounterId:id});
 assert.equal(win.result.after.resolution,'win');assert.deepEqual(win.result.turnEvents.map(e=>e.kind),['player-strike','defeat']);
 assert.equal(win.result.after.playerHealth,770,'dead wolf never counters');
 const forged=structuredClone(win);forged.result.turnEvents.push({kind:'wolf-counter',actorId:id,targetId:'actor-4',beforeHealth:770,afterHealth:690});
 assert.equal(validateCampaignReceipt(forged,{version:5,commandId:win.commandId,type:win.type,expectedRevision:win.fromRevision,payload:{action:'attack',encounterId:id}},win.fromTick),false);
});

test('death before completion emits settlement/defeat, never a fictitious strike or further movement',()=>{
 const config=defaultCampaignVillageConfig();config.memory.society.player.initialFood=0;
 const player=config.memory.society.actors.initialActors[3];player.health=20;player.hunger=700;
 const g=game(config);toForest(g);g.send('AdvanceTime',{ticks:142-g.bundle.snapshot.tick});g.send('EncounterBegin');
 const id=g.bundle.snapshot.world.encounterModel.encounter.encounterId,r=g.send('EncounterAction',{action:'attack',encounterId:id});
 assert.equal(r.outcome,'rejected');assert.deepEqual(r.result.turnEvents.map(e=>e.kind),['world-settlement','defeat']);
 const before=structuredClone(g.bundle.snapshot.world.mapModel.position);assert.equal(g.send('MarchSet',{x:4,y:7}).outcome,'rejected');
 assert.deepEqual(g.bundle.snapshot.world.mapModel.position,before);g.audit();
});
