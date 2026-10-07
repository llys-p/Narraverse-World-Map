import { createInitialBundle } from '../core/world-state.mjs';
import { defaultEcologyConfig, createEcologyWorld, settleEcologyDay, ECOLOGY_RULES } from '../core/ecology.mjs';

export function createEcologyVillage(seed=42,simulationId='ecology-village',config=defaultEcologyConfig(),commands=[],fixtureId='ecology-village') {
  const systems={ecology(context){
    const result=settleEcologyDay(context.snapshot.world,context.rng.next());context.snapshot.world=result.world;
    context.emitFact({type:'EcologyDaySettled',sourceSystem:'ecology',commandId:null,
      causationEventSeqs:context.populationCauses,entityIds:[],payload:result.payload});
  }};
  const bundle=createInitialBundle({rulesVersion:ECOLOGY_RULES,simulationId,fixtureId,fixtureVersion:'1',seed,
    world:createEcologyWorld(config),commands,
    scheduledTasks:[{taskId:'daily-ecology',systemId:'ecology',nextDueTick:144,intervalTicks:144,priority:10}],
  },systems);
  return {bundle,systems};
}

export function createDeerShock(seed=42,simulationId='ecology-deer-shock') {
  return createEcologyVillage(seed,simulationId,defaultEcologyConfig(),[
    {commandId:'day10-deer-removal',targetTick:1440,type:'RemovePopulation',payload:{species:'deer',amount:90}},
  ],'ecology-deer-shock');
}
