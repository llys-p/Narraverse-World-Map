import {cloneData,fields} from '../core/data-contract.mjs';
import {inspectDescriptorTree} from '../core/experience-state.mjs';
import {defaultLivelihoodVillageConfig} from './scene-livelihood-village.mjs';
import {CAMPAIGN_RULES,CAMPAIGN_PROFILE,campaignRuntimeHooks,createNpcCampaignWorld,createSocialCampaignWorld,createNegotiationCampaignWorld,createMemoryCampaignWorld,createPlayableCampaignWorld,createTrustCampaignWorld,createForestCampaignWorld} from '../core/scene-campaign-runtime.mjs';
import {canonicalSystems} from '../core/command-engine.mjs';
import {createInitialBundle} from '../core/world-state.mjs';
export function defaultCampaignVillageConfig(recipe='no-opportunity'){const c=cloneData(defaultLivelihoodVillageConfig(recipe));c.memory.version='memory-config-v8';c.memory.society.version='society-config-v7';c.memory.society.actors.version='actor-config-v5';return c;}
export function campaignSystems(){return canonicalSystems(CAMPAIGN_RULES);}
export function createCampaignVillage(seed=42,simulationId=CAMPAIGN_PROFILE,config=defaultCampaignVillageConfig()){
 return createVariant(seed,simulationId,config,'1');
}
export function createNpcCampaignVillage(seed=42,simulationId='campaign-npc-village',config=defaultCampaignVillageConfig('earn-then-buy')){
 return createVariant(seed,simulationId,config,'2');
}
export function createSocialCampaignVillage(seed=42,simulationId='campaign-social-village',config=defaultCampaignVillageConfig('earn-then-buy')){
 return createVariant(seed,simulationId,config,'3');
}
function createVariant(seed,simulationId,config,version){
 inspectDescriptorTree(config);fields(config,['memory','mind','motivation','experience','cognition']);const c=cloneData(config),systems=campaignSystems();
 const bundle=createInitialBundle({rulesVersion:CAMPAIGN_RULES,simulationId,fixtureId:CAMPAIGN_PROFILE,fixtureVersion:version,seed,
  world:(version==='8'?createForestCampaignWorld:version==='7'?createTrustCampaignWorld:version==='6'?createPlayableCampaignWorld:version==='5'?createMemoryCampaignWorld:version==='4'?createNegotiationCampaignWorld:version==='3'?createSocialCampaignWorld:version==='2'?createNpcCampaignWorld:campaignRuntimeHooks.createWorld)(c.memory,c.mind,c.motivation,c.experience,c.cognition,simulationId),commands:[],
  scheduledTasks:[{taskId:'survival-quote',systemId:'survival',nextDueTick:1,intervalTicks:288,priority:20},{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);
 return {bundle,systems};
}
export function createMemoryCampaignVillage(seed=42,simulationId='campaign-memory-village',config=defaultCampaignVillageConfig('earn-then-buy')){
 return createVariant(seed,simulationId,config,'5');
}
export function createNegotiationCampaignVillage(seed=42,simulationId='campaign-negotiation-village',config=defaultCampaignVillageConfig('earn-then-buy')){
 return createVariant(seed,simulationId,config,'4');
}

export function defaultPlayableVillageConfig(){
 const c=defaultCampaignVillageConfig('earn-then-buy');
 c.memory.society.player.initialFood=4;
 // Existing resource production: sixty farm workers produce ninety rations/day.
 c.memory.society.actors.market.ecology.resources.resources.food.production={numerator:3,denominator:2};
 c.motivation.requests=Array.from({length:7},(_,i)=>({requestId:'play-work-'+(i+1),speakerId:'actor-1',listenerId:'actor-2',tick:100+i*432,expiresTick:100+i*432+288,urgencyPermille:1000}));
 return c;
}
export function createPlayableCampaignVillage(seed=42,simulationId='campaign-playable-village',config=defaultPlayableVillageConfig()){
 return createVariant(seed,simulationId,config,'6');
}

export function createTrustCampaignVillage(seed=42,simulationId='campaign-trust-village',config=defaultPlayableVillageConfig()){
 return createVariant(seed,simulationId,config,'7');
}

export function createForestCampaignVillage(seed=42,simulationId='campaign-forest-village',config=defaultPlayableVillageConfig()){
 return createVariant(seed,simulationId,config,'8');
}
