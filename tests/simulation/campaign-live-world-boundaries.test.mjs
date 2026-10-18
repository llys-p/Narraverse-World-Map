import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';
import {executeAuditedCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';

test('real synthetic history crosses day/RNG boundary with identical whole successor',()=>{
 const {bundle,systems}=createCampaignVillage(42);
 const start=executeAuditedCampaignIntent(bundle,{version:5,commandId:'day-prefix',expectedRevision:0,type:'AdvanceTime',payload:{ticks:143}}).bundle;
 const parent=createAuditedBundle(start,{rulesVersion:start.snapshot.rulesVersion,systems});
 const dto={version:5,commandId:'day-crossing',expectedRevision:143,type:'AdvanceTime',payload:{ticks:2}};
 const live=deriveCampaignBundle(parent,dto),full=executeAuditedCampaignIntent(structuredClone(parent),dto);
 assert.deepEqual(live,full);assert.equal(live.bundle.snapshot.tick,145);
 assert.notDeepEqual(live.bundle.snapshot.rng,parent.snapshot.rng);
 assert(live.bundle.eventLog.slice(parent.eventLog.length).some(e=>e.type==='SocietyDaySettled'));
});

test('map contact, pause/resume and both JRPG rounds equal full replay',()=>{
 const {bundle,systems}=createCampaignVillage(42);
 let live=createAuditedBundle(bundle,{rulesVersion:bundle.snapshot.rulesVersion,systems}),full=structuredClone(bundle),index=0;
 const advance=(type,payload={})=>{
  const dto={version:5,commandId:'battle-'+index++,expectedRevision:live.snapshot.revision,type,payload};
  const next=deriveCampaignBundle(live,dto),oracle=executeAuditedCampaignIntent(full,dto);
  assert.deepEqual(next,oracle);live=next.bundle;full=structuredClone(oracle.bundle);return next.receipt;
 };
 advance('MarchSet',{x:16,y:7});advance('MarchStep');advance('MarchPause');advance('MarchResume');
 for(let i=0;i<14&&live.snapshot.world.mapModel.position.x!==16;i++){
  if(live.snapshot.world.mapModel.order.status==='paused')advance('MarchResume');
  advance('MarchStep');
 }
 assert.equal(live.snapshot.world.mapModel.position.x,16);
 advance('EncounterBegin');
 const encounterId=live.snapshot.world.encounterModel.encounter.encounterId;
 advance('EncounterAction',{encounterId,action:'attack'});advance('EncounterAction',{encounterId,action:'attack'});
 assert.equal(live.snapshot.world.encounterModel.encounter.resolution,'win');
});
