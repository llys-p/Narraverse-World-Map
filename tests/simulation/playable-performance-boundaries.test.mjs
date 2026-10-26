import test from 'node:test';import assert from 'node:assert/strict';
import {createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {performCampaignTick} from '../../runtime/core/command-engine.mjs';
import {validateBundle} from '../../runtime/core/world-state.mjs';
test('one campaign candidate remains detached, rejects non-data before invoking accessors, and preserves full audit',()=>{
 const b=createMemoryCampaignVillage().bundle,before=structuredClone(b),r=performCampaignTick(b);assert.deepEqual(b,before);assert.notEqual(r.snapshot.world,b.snapshot.world);assert.equal(r.snapshot.tick,1);validateBundle(r,{rulesVersion:'d-campaign-v1',systems:campaignSystems()});
 let calls=0;for(const location of ['snapshot','event']){const raw=structuredClone(b);if(location==='snapshot')Object.defineProperty(raw.snapshot.world,'trap',{enumerable:true,get(){calls++;return 1;}});else raw.eventLog.push({get trap(){calls++;return 1;}});assert.throws(()=>performCampaignTick(raw));}assert.equal(calls,0);
 for(const bad of [undefined,()=>{},Infinity,new Date()]){const raw=structuredClone(b);raw.snapshot.world.bad=bad;assert.throws(()=>performCampaignTick(raw));}
 const raw=structuredClone(b);raw.snapshot.rulesVersion='other-rules';assert.throws(()=>performCampaignTick(raw));
});
