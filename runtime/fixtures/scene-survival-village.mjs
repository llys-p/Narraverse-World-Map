import {createInitialBundle} from '../core/world-state.mjs';
import {fields,cloneData} from '../core/data-contract.mjs';
import {inspectDescriptorTree} from '../core/experience-state.mjs';
import {defaultEncounterVillageConfig} from './encounter-survival-village.mjs';
import {SCENE_RULES,SCENE_PROFILE,sceneRuntimeHooks} from '../core/scene-runtime.mjs';
export function defaultSceneVillageConfig(recipe='no-opportunity'){
 const config=cloneData(defaultEncounterVillageConfig(recipe));
 config.memory.version='memory-config-v6';config.memory.society.version='society-config-v5';
 return config;
}
export function sceneSystems(){return {
 society(ctx){const result=sceneRuntimeHooks.settleDay(ctx.snapshot.world,ctx.rng.next());ctx.snapshot.world=result.world;
 ctx.emitFact({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:ctx.populationCauses,payload:result.payload});},
 survival(){},encounter(){},scene(){}
};}
export function createSceneVillage(seed=42,simulationId=SCENE_PROFILE,config=defaultSceneVillageConfig()){
 inspectDescriptorTree(config);fields(config,['memory','mind','motivation','experience','cognition']);
 const input=cloneData(config),systems=sceneSystems();
 const bundle=createInitialBundle({rulesVersion:SCENE_RULES,simulationId,fixtureId:SCENE_PROFILE,fixtureVersion:'1',seed,
 world:sceneRuntimeHooks.createWorld(input.memory,input.mind,input.motivation,input.experience,input.cognition,simulationId),commands:[],
 scheduledTasks:[{taskId:'survival-quote',systemId:'survival',nextDueTick:1,intervalTicks:288,priority:20},
 {taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);
 return {bundle,systems};
}
