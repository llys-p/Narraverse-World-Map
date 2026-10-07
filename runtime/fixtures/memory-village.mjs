import { createInitialBundle } from '../core/world-state.mjs';
import { MEMORY_RULES,defaultMemoryConfig,createMemoryWorld,settleMemorySocietyDay } from '../core/memory-runtime.mjs';
export function memorySystems(){return {society(ctx){const result=settleMemorySocietyDay(ctx.snapshot.world,ctx.rng.next());ctx.snapshot.world=result.world;
  ctx.emitFact({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:ctx.populationCauses,payload:result.payload});}};}
export function createMemoryVillage(seed=42,simulationId='memory-village',config=defaultMemoryConfig(),commands=[],fixtureId='memory-village'){
  const systems=memorySystems();
  const bundle=createInitialBundle({rulesVersion:MEMORY_RULES,simulationId,fixtureId,fixtureVersion:'1',seed,world:createMemoryWorld(config),commands,
    scheduledTasks:[{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);return {bundle,systems};
}
export function memoryRelationsConfig(discountEnabled=true){
  const config=defaultMemoryConfig();config.discountEnabled=discountEnabled;
  config.society.actors.initialActors[1].health=400;config.society.estates.forEach(e=>{e.initialFood=20;e.initialWallet=0;e.initialHerbs=0;});
  config.society.estates[1].initialWallet=500;config.society.estates[2].initialHerbs=4;
  config.society.actors.market.ecology.resources.resources.herbs.initial=4;
  config.society.actors.market.ecology.resources.resources.herbs.production.numerator=0;
  config.society.actors.market.ecology.resources.resources.gold.initial=500;return config;
}
export const createMemoryRelations=(seed=42,simulationId='memory-relations')=>createMemoryVillage(seed,simulationId,memoryRelationsConfig(),[],'memory-relations');
export const createMemoryRelationsControl=(seed=42,simulationId='memory-relations-control')=>createMemoryVillage(seed,simulationId,memoryRelationsConfig(false),[],'memory-relations-control');
export function createMemoryMedicineRace(seed=42,simulationId='memory-medicine-race'){
  const c=defaultMemoryConfig();c.society.actors.initialActors[0].health=500;c.society.actors.initialActors[1].health=500;
  c.society.actors.market.ecology.resources.resources.herbs.initial=1;c.society.estates.forEach(e=>e.initialWallet=100);
  return createMemoryVillage(seed,simulationId,c,[],'memory-medicine-race');
}
