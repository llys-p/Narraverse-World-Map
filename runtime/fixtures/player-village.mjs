import { PLAYER_RULES,defaultPlayerConfig,createPlayerWorld } from '../core/player-runtime.mjs';
import { createInitialBundle } from '../core/world-state.mjs';
import { memorySystems } from './memory-village.mjs';
export const playerSystems=()=>memorySystems();
export function createPlayerVillage(seed=42,simulationId='player-village',config=defaultPlayerConfig()){
 const systems=playerSystems(),bundle=createInitialBundle({rulesVersion:PLAYER_RULES,simulationId,fixtureId:'player-village',fixtureVersion:'1',seed,
 world:createPlayerWorld(config),commands:[],scheduledTasks:[{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);
 return {bundle,systems};
}
