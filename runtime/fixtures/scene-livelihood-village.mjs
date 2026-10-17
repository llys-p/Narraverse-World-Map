import {createInitialBundle} from '../core/world-state.mjs';
import {fields,cloneData} from '../core/data-contract.mjs';
import {inspectDescriptorTree} from '../core/experience-state.mjs';
import {canonicalSystems} from '../core/command-engine.mjs';
import {defaultSceneVillageConfig} from './scene-survival-village.mjs';
import {LIVELIHOOD_RULES,LIVELIHOOD_PROFILE,livelihoodRuntimeHooks} from '../core/scene-livelihood-runtime.mjs';
export function defaultLivelihoodVillageConfig(recipe='no-opportunity'){
 const config=cloneData(defaultSceneVillageConfig(recipe));config.memory.version='memory-config-v7';config.memory.society.version='society-config-v6';return config;
}
export function livelihoodSystems(){return canonicalSystems(LIVELIHOOD_RULES);}
export function createLivelihoodVillage(seed=42,simulationId=LIVELIHOOD_PROFILE,config=defaultLivelihoodVillageConfig()){
 inspectDescriptorTree(config);fields(config,['memory','mind','motivation','experience','cognition']);const input=cloneData(config),systems=livelihoodSystems();
 const bundle=createInitialBundle({rulesVersion:LIVELIHOOD_RULES,simulationId,fixtureId:LIVELIHOOD_PROFILE,fixtureVersion:'1',seed,
  world:livelihoodRuntimeHooks.createWorld(input.memory,input.mind,input.motivation,input.experience,input.cognition,simulationId),commands:[],
  scheduledTasks:[{taskId:'survival-quote',systemId:'survival',nextDueTick:1,intervalTicks:288,priority:20},{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);
 return {bundle,systems};
}
