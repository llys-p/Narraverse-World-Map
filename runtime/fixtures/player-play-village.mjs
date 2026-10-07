import { PLAY_RULES,defaultPlayerPlayConfig } from '../core/player-intents.mjs';
import { createMemoryWorld } from '../core/memory-runtime.mjs';
import { createInitialBundle } from '../core/world-state.mjs';
import { memorySystems } from './memory-village.mjs';
export const playerPlaySystems=()=>memorySystems();
export function createPlayerPlayVillage(seed=42,id='player-play-village',config=defaultPlayerPlayConfig()){
 const systems=playerPlaySystems(),bundle=createInitialBundle({rulesVersion:PLAY_RULES,simulationId:id,fixtureId:'player-play-village',fixtureVersion:'1',seed,
 world:createMemoryWorld(config),commands:[],scheduledTasks:[{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);return {bundle,systems};
}
