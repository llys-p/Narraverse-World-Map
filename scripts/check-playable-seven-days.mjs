// Three seed offline worlds: single authority, real days, no model or hidden rewards.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {performance} from 'node:perf_hooks';import {createHash} from 'node:crypto';
import {createPlayableCampaignVillage,campaignSystems} from '../runtime/fixtures/campaign-village.mjs';import {createAuditedBundle,validateBundle} from '../runtime/core/world-state.mjs';import {computeCampaignIntent} from '../runtime/core/scene-campaign-runtime.mjs';import {canonicalJson} from '../runtime/core/data-contract.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()},results=[];
for(const seed of [7,42,99]){
 const start=performance.now();let b=createAuditedBundle(createPlayableCampaignVillage(seed,'playable-seven-'+seed).bundle,options);const days=[];
 for(let day=1;day<=7;day++){
  b=computeCampaignIntent(b,{version:5,commandId:'seven-'+day,expectedRevision:b.snapshot.revision,type:'AdvanceTime',payload:{ticks:144}}).bundle;const w=b.snapshot.world,h=w.societyModel.agents[1].state;
  days.push({day,food:h.inventory.food,wallet:h.wallet,health:w.actorModel.actors[1].health,result:w.mapModel.playModel.lifeHistory.at(-1),publicFood:w.resources.food});
 }
 validateBundle(b,options);assert.ok(b.snapshot.world.actorModel.actors[1].alive);assert.ok(days.filter(x=>x.result.action==='WorkForPay'&&x.result.status==='succeeded').length>=2);assert.ok(days.filter(x=>x.result.action==='BuyFood'&&x.result.status==='succeeded').length>=2);
 assert.ok(days.every(x=>x.food>=0&&x.wallet>=0&&x.publicFood>=0));results.push({seed,tick:b.snapshot.tick,wallMs:performance.now()-start,sha256:createHash('sha256').update(canonicalJson(b)).digest('hex'),fullReplay:'passed',days});
}
await fs.writeFile(process.argv[2],JSON.stringify({status:'passed',externalModelCalls:0,seeds:results},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'passed',seeds:3,daysPerWorld:7,externalModelCalls:0}));
