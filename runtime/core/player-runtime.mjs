import { defaultPersonalityConfig,createMemoryWorld,validateMemoryWorld } from './memory-runtime.mjs';
import { PLAYER_RULES } from './player-state.mjs';
import { requireCondition,record } from './data-contract.mjs';
export { PLAYER_RULES };
export function defaultPlayerConfig(){
 const c=defaultPersonalityConfig();c.version='memory-config-v3';c.society.version='society-config-v2';c.society.actors.version='actor-config-v2';
 c.society.actors.initialActors[1].health=650;c.society.estates[1].initialFood=0;c.society.estates[1].initialWallet=100;
 c.society.actors.initialActors.push({name:'玩家',occupation:'player',health:1000,hunger:0,fatigue:0});
 c.society.player={actorId:'actor-4',initialWallet:100,initialFood:3,initialHerbs:1};return c;
}
export function createPlayerWorld(config=defaultPlayerConfig()){
 record(config);requireCondition(config.version==='memory-config-v3','Unknown player configuration','UNSUPPORTED_VERSION');return createMemoryWorld(config);
}
export function validatePlayerWorld(world){
 record(world);record(world.memoryModel);record(world.memoryModel.config);requireCondition(world.memoryModel.config.version==='memory-config-v3','Unknown player world','UNSUPPORTED_VERSION');validateMemoryWorld(world);
}
