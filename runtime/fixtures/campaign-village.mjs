import {cloneData,fields} from '../core/data-contract.mjs';
import {inspectDescriptorTree} from '../core/experience-state.mjs';
import {defaultLivelihoodVillageConfig} from './scene-livelihood-village.mjs';
import {CAMPAIGN_RULES,CAMPAIGN_PROFILE,campaignRuntimeHooks} from '../core/scene-campaign-runtime.mjs';
import {canonicalSystems} from '../core/command-engine.mjs';
import {createInitialBundle} from '../core/world-state.mjs';
export function defaultCampaignVillageConfig(recipe='no-opportunity'){const c=cloneData(defaultLivelihoodVillageConfig(recipe));c.memory.version='memory-config-v8';c.memory.society.version='society-config-v7';c.memory.society.actors.version='actor-config-v5';return c;}
export function campaignSystems(){return canonicalSystems(CAMPAIGN_RULES);}
export function createCampaignVillage(seed=42,simulationId=CAMPAIGN_PROFILE,config=defaultCampaignVillageConfig()){
 inspectDescriptorTree(config);fields(config,['memory','mind','motivation','experience','cognition']);const c=cloneData(config),systems=campaignSystems();
 const bundle=createInitialBundle({rulesVersion:CAMPAIGN_RULES,simulationId,fixtureId:CAMPAIGN_PROFILE,fixtureVersion:'1',seed,
  world:campaignRuntimeHooks.createWorld(c.memory,c.mind,c.motivation,c.experience,c.cognition,simulationId),commands:[],
  scheduledTasks:[{taskId:'survival-quote',systemId:'survival',nextDueTick:1,intervalTicks:288,priority:20},{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);
 return {bundle,systems};
}
