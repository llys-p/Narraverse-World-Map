import { createInitialBundle } from '../core/world-state.mjs';
import { HUNTER_RULES,defaultHunterConfig,createHunterWorld,settleHunterDay } from '../core/hunter.mjs';

export function createHunterVillage(seed=42,simulationId='hunter-village',config=defaultHunterConfig(),commands=[],fixtureId='hunter-village'){
  const systems={hunter(context){
    const result=settleHunterDay(context.snapshot.world,context.rng.next());context.snapshot.world=result.world;
    context.emitFact({type:'HunterDaySettled',sourceSystem:'hunter',commandId:null,causationEventSeqs:context.populationCauses,entityIds:[],payload:result.payload});
  }};
  const bundle=createInitialBundle({rulesVersion:HUNTER_RULES,simulationId,fixtureId,fixtureVersion:'1',seed,world:createHunterWorld(config),commands,
    scheduledTasks:[{taskId:'daily-hunter',systemId:'hunter',nextDueTick:144,intervalTicks:144,priority:10}],
  },systems);return {bundle,systems};
}
export function createHunterRecovery(seed=42,simulationId='hunter-recovery'){
  const config=defaultHunterConfig();config.initialFood=20;config.actors.initialActors[1].health=500;
  return createHunterVillage(seed,simulationId,config,[],'hunter-recovery');
}
export function createHunterHunger(seed=42,simulationId='hunter-hunger'){
  const config=defaultHunterConfig();config.initialFood=0;config.actors.initialActors[1].hunger=500;
  return createHunterVillage(seed,simulationId,config,[],'hunter-hunger');
}
