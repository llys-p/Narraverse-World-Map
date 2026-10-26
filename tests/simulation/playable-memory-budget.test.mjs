import test from 'node:test';import assert from 'node:assert/strict';
import {createPlayableCampaignVillage,createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';import {createAuditedBundle,validateBundle} from '../../runtime/core/world-state.mjs';import {computeCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';import {providerContext} from '../../runtime/service/npc-language-provider.mjs';import {serviceCommandLimit,campaignInputLimit} from '../../runtime/core/campaign-limits.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
test('own retained life results reach the private provider without becoming current inventory or public facts',()=>{
 let b=createAuditedBundle(createPlayableCampaignVillage().bundle,options);b=computeCampaignIntent(b,{version:5,commandId:'memory-days',expectedRevision:b.snapshot.revision,type:'AdvanceTime',payload:{ticks:432}}).bundle;
 const raw=npcDialogueContext(b),c=providerContext(raw,'你前几天做了什么？');assert.equal(c.lifeHistory.length,3);assert.equal(c.knownFacts.life.recentHistory[0].action,'WorkForPay');assert.equal(c.knownFacts.life.current.food,0);assert.deepEqual(providerContext(c,'你前几天做了什么？'),c);
 const mutated=structuredClone(raw);mutated.lifeHistory[0].private='SECRET';assert.equal(JSON.stringify(providerContext(mutated,'后来呢？')).includes('SECRET'),false);
 mutated.lifeHistory[0].tick=999999;assert.deepEqual(providerContext(mutated,'后来呢？').lifeHistory,[]);assert.equal(npcDialogueContext(createMemoryCampaignVillage().bundle).lifeHistory,undefined);validateBundle(b,options);
});
test('playable sessions accept 129 real entries while old sessions retain the 128 command limit',()=>{
 for(const [factory,limit] of [[createMemoryCampaignVillage,128],[createPlayableCampaignVillage,512]]){
  let b=createAuditedBundle(factory().bundle,options);assert.equal(serviceCommandLimit(b),limit);assert.equal(campaignInputLimit(b.snapshot.world),limit);
  for(let i=0;i<128;i++){const type=limit===512?'PlayerQuest':'MarchPause',payload=limit===512?{questId:'livelihood',action:'claim'}:{};b=computeCampaignIntent(b,{version:5,commandId:'limit-'+i,expectedRevision:b.snapshot.revision,type,payload}).bundle;}
  const dto={version:5,commandId:'limit-129',expectedRevision:b.snapshot.revision,type:'MarchPause',payload:{}};
  if(limit===128)assert.throws(()=>computeCampaignIntent(b,dto),{code:'LIMIT_EXCEEDED'});else{b=computeCampaignIntent(b,dto).bundle;assert.equal(b.snapshot.world.encounterModel.inputHistory.length,129);}validateBundle(b,options);
 }
});
