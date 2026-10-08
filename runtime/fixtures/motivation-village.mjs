import {createInitialBundle} from '../core/world-state.mjs';
import {fields,cloneData} from '../core/data-contract.mjs';
import {defaultMindVillageConfig} from './mind-village.mjs';
import {MOTIVATION_RULES} from '../core/motivation-state.mjs';
import {motivationRuntimeHooks} from '../core/motivation-runtime.mjs';

export function defaultMotivationVillageConfig(){
  const {memory,mind}=cloneData(defaultMindVillageConfig());
  for(const actor of memory.society.actors.initialActors.slice(1,3))Object.assign(actor,{health:400,hunger:0,fatigue:650});
  Object.assign(memory.society.economics,{wage:20,workFood:8,workFatigue:150,deadlineDays:20,maxFailures:3,cooldownDays:2});
  mind.stimuli=[{stimulusId:'mc02',tick:12,kind:'market-check',listenerId:'actor-2'},
    {stimulusId:'mc03',tick:24,kind:'market-check',listenerId:'actor-3'}];
  const motivation={version:'motivation-config-v1',profiles:[
    {actorId:'actor-2',dutyWeightPermille:900,riskAversionPermille:200},
    {actorId:'actor-3',dutyWeightPermille:900,riskAversionPermille:200}],
    requests:[{requestId:'d01',tick:200,speakerId:'actor-1',listenerId:'actor-2',urgencyPermille:1000,expiresTick:432}]};
  return {memory,mind,motivation};
}

export function motivationSystems(){
  return {society(ctx){const result=motivationRuntimeHooks.settleDay(ctx.snapshot.world,ctx.rng.next());
    ctx.snapshot.world=result.world;ctx.emitFact({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,
      entityIds:[],causationEventSeqs:ctx.populationCauses,payload:result.payload});}};
}

export function createMotivationVillage(seed=42,simulationId='motivation-village',config=defaultMotivationVillageConfig()){
  fields(config,['memory','mind','motivation']);const input=cloneData(config),systems=motivationSystems();
  const bundle=createInitialBundle({rulesVersion:MOTIVATION_RULES,simulationId,fixtureId:'motivation-village',fixtureVersion:'1',seed,
    world:motivationRuntimeHooks.createWorld(input.memory,input.mind,input.motivation),commands:[],
    scheduledTasks:[{taskId:'daily-memory',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}]},systems);
  return {bundle,systems};
}
