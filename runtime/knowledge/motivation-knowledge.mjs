import {validateBundle} from '../core/world-state.mjs';
import {projectActorEvent} from '../core/memory-observer.mjs';
import {deriveMindBelief} from '../core/mind-state.mjs';
import {cloneData,fields,record,identifier,canonicalJson,requireCondition} from '../core/data-contract.mjs';
import {MOTIVATION_RULES,MOTIVATION_KNOWLEDGE_VERSION,MOTIVATION_INSPECTOR_VERSION,MAX_MOTIVATION_KNOWLEDGE_BYTES,MAX_MOTIVATION_INSPECTOR_BYTES} from '../core/motivation-state.mjs';
import {buildFastCounterfactual} from '../core/motivation-planner.mjs';
import {motivationSystems} from '../fixtures/motivation-village.mjs';

function audit(bundle){fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion===MOTIVATION_RULES,'Unknown motivation projection rules','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion:MOTIVATION_RULES,systems:motivationSystems()});}
function budget(value,max){requireCondition(new TextEncoder().encode(canonicalJson(value)).length<=max,'Motivation projection exceeds budget','LIMIT_EXCEEDED');return value;}

// This committed projection has no decision-phase entry point. The runtime builds
// its private frozen planning input separately, before either actor executes.
function project(bundle,entry){
  const s=bundle.snapshot,w=s.world,actor=w.actorModel.actors.find(a=>a.actorId===entry.actorId);
  const state=w.societyModel.agents.find(a=>a.state.actorId===entry.actorId).state,mind=w.mindModel.actors.find(a=>a.actorId===entry.actorId);
  const last=bundle.eventLog.findLast(e=>e.eventSeq<=w.mindModel.cursor&&e.type==='SocietyDaySettled'&&(actor.alive||e.tick<actor.deathTick));
  const publicValue=last?projectActorEvent(last,entry.actorId).find(p=>p.channel==='public').observable:null;
  const profile=w.motivationModel.config.profiles.find(p=>p.actorId===entry.actorId);
  return budget({knowledgeVersion:MOTIVATION_KNOWLEDGE_VERSION,phase:'committed',simulationId:s.simulationId,actorId:entry.actorId,tick:s.tick,revision:s.revision,
    self:{name:actor.name,occupation:actor.occupation,location:actor.location,alive:actor.alive,health:actor.health,hunger:actor.hunger,fatigue:actor.fatigue,
      wallet:state.wallet,inventory:cloneData(state.inventory),currentGoal:actor.alive?cloneData(state.currentGoal):null,nextGoalId:state.nextGoalId,cooldownUntilDay:state.cooldownUntilDay},
    quote:{product:'herbs',price:publicValue?publicValue.prices.herbs:w.marketModel.config.products.herbs.basePrice,observedTick:last?.tick??0,sourceEventSeq:last?.eventSeq??null},
    observations:cloneData(mind.observations),belief:deriveMindBelief(mind.observations,s.tick),
    profile:{dutyWeightPermille:profile.dutyWeightPermille,riskAversionPermille:profile.riskAversionPermille},duty:cloneData(entry.lastDuty),
    planState:{activePlan:cloneData(entry.activePlan),suspendedPlan:cloneData(entry.suspendedPlan),nextPlanId:entry.nextPlanId,lastReviewedDutyId:entry.lastReviewedDutyId}},MAX_MOTIVATION_KNOWLEDGE_BYTES);
}

export function buildMotivationKnowledge(bundle,actorId){
  identifier(actorId);audit(bundle);const entry=bundle.snapshot.world.motivationModel.actors.find(a=>a.actorId===actorId);
  requireCondition(entry,'Motivation actor unavailable','MIND_UNAVAILABLE');return cloneData(project(bundle,entry));
}

export function projectMotivationInspector(bundle){
  audit(bundle);const s=bundle.snapshot,w=s.world;
  const actors=w.motivationModel.actors.map(entry=>({knowledge:project(bundle,entry),lastDecision:cloneData(entry.lastDecision),lastOutcome:cloneData(entry.lastOutcome),
    counterfactual:entry.lastDecision===null?null:buildFastCounterfactual(entry.lastDecision)}));
  return cloneData(budget({apiVersion:1,mindVersion:MOTIVATION_INSPECTOR_VERSION,view:'developer',simulationId:s.simulationId,revision:s.revision,tick:s.tick,
    worldFacts:{publicFood:w.resources.food,publicHerbs:w.resources.herbs,postedHerbPrice:w.marketModel.prices.herbs},actors},MAX_MOTIVATION_INSPECTOR_BYTES));
}
