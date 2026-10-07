import { createInitialBundle } from '../core/world-state.mjs';
import { PERSONALITY_RULES,defaultPersonalityConfig,createMemoryWorld } from '../core/memory-runtime.mjs';
import { memorySystems } from './memory-village.mjs';
export function createPersonalityVillage(seed=42,simulationId='personality-neutral',config=defaultPersonalityConfig(),commands=[],fixtureId='personality-neutral'){
  const systems=memorySystems();
  const bundle=createInitialBundle({rulesVersion:PERSONALITY_RULES,simulationId,fixtureId,fixtureVersion:'1',seed,world:createMemoryWorld(config),commands,
    scheduledTasks:[{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);return {bundle,systems};
}
function profile(kind,seed,simulationId){
  const config=defaultPersonalityConfig();config.society.actors.initialActors[1].health=650;
  config.society.estates[1].initialFood=0;config.society.estates[1].initialWallet=100;
  if(kind!=='neutral')config.personalities[1][kind+'WeightPermille']=2000;
  return createPersonalityVillage(seed,simulationId,config,[],'personality-'+kind);
}
export const createPersonalityNeutral=(seed=42,id='personality-neutral')=>profile('neutral',seed,id);
export const createPersonalityHealth=(seed=42,id='personality-health')=>profile('health',seed,id);
export const createPersonalityFood=(seed=42,id='personality-food')=>profile('food',seed,id);
