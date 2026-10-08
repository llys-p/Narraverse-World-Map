import { createInitialBundle } from '../core/world-state.mjs';
import { defaultPlayerPlayConfig } from '../core/player-intents.mjs';
import { MIND_RULES } from '../core/mind-state.mjs';
import { createMindWorld,settleMindSocietyDay } from '../core/mind-runtime.mjs';

export function mindSystems(){
  return {society(ctx){const result=settleMindSocietyDay(ctx.snapshot.world,ctx.rng.next());ctx.snapshot.world=result.world;
    ctx.emitFact({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:ctx.populationCauses,payload:result.payload});}};
}

// §9 frozen experiment: the memory config deep-copies the play baseline and only swaps
// the listed initial values. The stimuli only declare the opportunity to speak/observe;
// they never preset answers, purchase outcomes or world stock.
export function defaultMindVillageConfig(){
  const memory=defaultPlayerPlayConfig();
  Object.assign(memory.society.actors.initialActors[1],{health:400,hunger:0,fatigue:200});
  Object.assign(memory.society.actors.initialActors[2],{health:400,hunger:0,fatigue:200});
  Object.assign(memory.society.estates[1],{initialFood:20,initialHerbs:0,initialWallet:100});
  Object.assign(memory.society.estates[2],{initialFood:20,initialHerbs:0,initialWallet:100});
  memory.society.player.initialHerbs=0;
  const village=memory.society.actors.market.ecology.resources;
  village.resources.herbs.initial=20;village.resources.herbs.production={numerator:0,denominator:8};village.settlement.injuredCount=0;
  for(const personality of memory.personalities){
    personality.healthWeightPermille=1000;personality.foodWeightPermille=1000;personality.restWeightPermille=1000;
  }
  const mind={version:'mind-config-v1',actorIds:['actor-2','actor-3'],stimuli:[
    {stimulusId:'s01',tick:12,kind:'statement',speakerId:'actor-1',listenerId:'actor-2',available:false},
    {stimulusId:'s02',tick:24,kind:'market-check',listenerId:'actor-3'}]};
  return {memory,mind};
}

export function createMindVillage(seed=42,simulationId='mind-village',config=defaultMindVillageConfig()){
  const systems=mindSystems();
  const bundle=createInitialBundle({rulesVersion:MIND_RULES,simulationId,fixtureId:'mind-village',fixtureVersion:'1',seed,
    world:createMindWorld(config.memory,config.mind),commands:[],
    scheduledTasks:[{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);
  return {bundle,systems};
}