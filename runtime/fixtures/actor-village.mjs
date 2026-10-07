import { createInitialBundle } from '../core/world-state.mjs';
import { ACTOR_RULES,defaultActorConfig,createActorWorld,settleActorDay } from '../core/actors.mjs';

export function createActorVillage(seed=42,simulationId='actor-village',config=defaultActorConfig(),commands=[],fixtureId='actor-village') {
  const systems={actors(context){
    const result=settleActorDay(context.snapshot.world,context.rng.next());context.snapshot.world=result.world;
    context.emitFact({type:'ActorDaySettled',sourceSystem:'actors',commandId:null,
      causationEventSeqs:context.populationCauses,entityIds:[],payload:result.payload});
  }};
  const bundle=createInitialBundle({rulesVersion:ACTOR_RULES,simulationId,fixtureId,fixtureVersion:'1',seed,world:createActorWorld(config),commands,
    scheduledTasks:[{taskId:'daily-actors',systemId:'actors',nextDueTick:144,intervalTicks:144,priority:10}],
  },systems);return {bundle,systems};
}

export function createActorNeeds(seed=42,simulationId='actor-needs') {
  const config=defaultActorConfig();Object.assign(config.initialActors[1],{health:500,hunger:500,fatigue:600});
  return createActorVillage(seed,simulationId,config,[],'actor-needs');
}
export function createActorShortage(seed=42,simulationId='actor-shortage') {
  const config=defaultActorConfig(),resources=config.market.ecology.resources.resources;
  resources.food.initial=0;resources.food.production.numerator=0;resources.herbs.initial=0;resources.herbs.production.numerator=0;resources.gold.initial=0;
  config.market.ecology.foodPerDeer=0;
  Object.assign(config.initialActors[0],{health:50,hunger:900,fatigue:600});
  return createActorVillage(seed,simulationId,config,[],'actor-shortage');
}
