import test from 'node:test';import assert from 'node:assert/strict';
import * as fixtures from '../../runtime/fixtures/campaign-village.mjs';import {performCampaignTick,performCampaignTicks,performTick} from '../../runtime/core/command-engine.mjs';import {validateBundle} from '../../runtime/core/world-state.mjs';
test('synchronous detached batches equal separate fixed ticks for all six fixtures and the daily boundary',()=>{
 for(const name of ['createCampaignVillage','createNpcCampaignVillage','createSocialCampaignVillage','createNegotiationCampaignVillage','createMemoryCampaignVillage','createPlayableCampaignVillage']){
  const {bundle,systems}=fixtures[name](),before=structuredClone(bundle);let oracle=bundle;for(let i=0;i<8;i++)oracle=performCampaignTick(oracle);
  assert.deepEqual(performCampaignTicks(bundle,8),oracle,name);assert.deepEqual(bundle,before,name);assert.deepEqual(performCampaignTicks(bundle,0),before);
 }
 const {bundle,systems}=fixtures.createPlayableCampaignVillage();let oracle=bundle;for(let i=0;i<145;i++)oracle=performCampaignTick(oracle);
 const batch=performCampaignTicks(bundle,145);assert.deepEqual(batch,oracle);assert.ok(batch.eventLog.some(e=>e.type==='SocietyDaySettled'));validateBundle(batch,{rulesVersion:'d-campaign-v1',systems});
});
test('batch boundaries inspect old events, detach nested data, reject invalid counts, and expose no custom-system bypass',()=>{
 const {bundle,systems}=fixtures.createPlayableCampaignVillage(),initial=performCampaignTicks(bundle,2),before=structuredClone(initial);let getters=0;
 const bad=structuredClone(initial);Object.defineProperty(bad.eventLog[0].payload,'secret',{enumerable:true,get(){getters++;return 1;}});assert.throws(()=>performCampaignTicks(bad,2));assert.equal(getters,0);
 for(const count of [-1,1.5,'2',NaN,Infinity,144001])assert.throws(()=>performCampaignTicks(initial,count));
 const wrong=structuredClone(initial);wrong.snapshot.rulesVersion='other';assert.throws(()=>performCampaignTicks(wrong,1));
 const custom={...systems,survival(ctx){ctx.snapshot.world.mapModel.position.x=5;}};
 assert.deepEqual(performCampaignTicks(bundle,1,custom,true),performCampaignTick(bundle));assert.throws(()=>performTick(bundle,custom,'session',true));
 const out=performCampaignTicks(initial,1);out.snapshot.world.mapModel.position.x=9;out.eventLog[0].payload.changed=true;assert.deepEqual(initial,before);
});
