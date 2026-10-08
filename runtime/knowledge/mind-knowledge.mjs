// M1 read-only knowledge/inspector projections. Both entries fully audit the bundle
// first and return only detached JSON data. The engine-internal decision-phase helper
// deliberately avoids a recursive full-history replay; the engine supplies a validated
// frozen candidate and the projected cursor slice.
import { validateBundle,cloneBundle } from '../core/world-state.mjs';
import { projectActorEvent } from '../core/memory-observer.mjs';
import { mindSystems } from '../fixtures/mind-village.mjs';
import { cloneData,fields,record,identifier,integer,denseArray,canonicalJson,requireCondition } from '../core/data-contract.mjs';
import { MIND_RULES,MIND_KNOWLEDGE_VERSION,MIND_INSPECTOR_VERSION,MIND_ACTOR_IDS,MAX_MIND_KNOWLEDGE_BYTES,
  MAX_MIND_INSPECTOR_BYTES,deriveMindBelief,innerStanceFor } from '../core/mind-state.mjs';

function knowledgeBudget(value){
  requireCondition(new TextEncoder().encode(canonicalJson(value)).length<=MAX_MIND_KNOWLEDGE_BYTES,'Mind knowledge exceeds budget','LIMIT_EXCEEDED');
  return value;
}

// Shared committed/decision projection from a validated mind world and one actor entry.
function projectKnowledge(world,entry,tick,revision,phase,events,simulationId){
  const actor=world.actorModel.actors.find(a=>a.actorId===entry.actorId);
  requireCondition(actor,'Mind body missing');
  const estate=world.societyModel.agents.find(a=>a.state.actorId===entry.actorId);
  requireCondition(estate,'Mind estate missing');
  const cursor=world.mindModel.cursor;
  const visible=events.filter(e=>e.eventSeq<=cursor && e.type==='SocietyDaySettled' && (actor.alive||e.tick<actor.deathTick));
  const lastPublic=visible.length?visible[visible.length-1]:null;
  let quote;
  if(lastPublic){
    const observable=projectActorEvent(lastPublic,entry.actorId).find(p=>p.channel==='public');
    requireCondition(observable,'Missing visible village-market projection');
    quote={product:'herbs',price:observable.observable.prices.herbs,observedTick:lastPublic.tick,sourceEventSeq:lastPublic.eventSeq};
  }else{
    quote={product:'herbs',price:world.marketModel.prices.herbs,observedTick:0,sourceEventSeq:null};
  }
  const belief=deriveMindBelief(entry.observations,tick);
  const currentGoal=actor.alive&&estate.state.currentGoal?cloneData(estate.state.currentGoal):null;
  return {knowledgeVersion:MIND_KNOWLEDGE_VERSION,phase,simulationId,actorId:entry.actorId,tick,revision,
    self:{name:actor.name,occupation:actor.occupation,location:actor.location,alive:actor.alive,
      health:actor.health,hunger:actor.hunger,fatigue:actor.fatigue,wallet:estate.state.wallet,
      inventory:cloneData(estate.state.inventory),currentGoal,nextGoalId:estate.state.nextGoalId,
      cooldownUntilDay:estate.state.cooldownUntilDay},
    quote,observations:cloneData(entry.observations),belief,innerStance:innerStanceFor(belief),
    committedIntent:currentGoal?{goalId:currentGoal.goalId,kind:currentGoal.kind}:null};
}

export function buildMindKnowledge(bundle,actorId){
  identifier(actorId);fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion===MIND_RULES,'Unknown mind knowledge rules','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion:MIND_RULES,systems:mindSystems()});
  const s=bundle.snapshot,entry=s.world.mindModel.actors.find(a=>a.actorId===actorId);
  requireCondition(entry,'Mind actor unavailable','MIND_ACTOR_UNAVAILABLE');
  return knowledgeBudget(cloneData(projectKnowledge(s.world,entry,s.tick,s.revision,'committed',bundle.eventLog,s.simulationId)));
}

// Engine-internal projection over a §6.3 frozen candidate. No full-bundle/history audit
// here: entry-point auditing plus the engine's whole-candidate validation covers origin.
export function decisionPhaseKnowledge(world,events,actorId,tick,simulationId){
  record(world);record(world.mindModel);
  for(const key of ['actorModel','societyModel','marketModel','mindModel'])requireCondition(Object.hasOwn(world,key),'Missing mind projection source');
  for(const key of ['actors','cursor','config'])requireCondition(Object.hasOwn(world.mindModel,key),'Missing mind state source');
  identifier(actorId);requireCondition(MIND_ACTOR_IDS.includes(actorId),'Mind actor unavailable','MIND_ACTOR_UNAVAILABLE');
  identifier(simulationId);integer(tick,1);requireCondition(tick%144===0,'Decision knowledge requires a daily tick');
  denseArray(events,140000);
  const entry=world.mindModel.actors.find(a=>a.actorId===actorId);
  requireCondition(entry,'Mind actor unavailable','MIND_ACTOR_UNAVAILABLE');
  return knowledgeBudget(cloneData(projectKnowledge(world,entry,tick,tick-1,'decision',events,simulationId)));
}

export function projectMindInspector(bundle){
  fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion===MIND_RULES,'Unknown mind inspector rules','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion:MIND_RULES,systems:mindSystems()});
  const s=bundle.snapshot,world=s.world;
  const actors=world.mindModel.actors.map(entry=>({
    knowledge:projectKnowledge(world,entry,s.tick,s.revision,'committed',bundle.eventLog,s.simulationId),
    lastDecision:entry.lastDecision===null?null:cloneData(entry.lastDecision),
    lastOutcome:entry.lastOutcome===null?null:cloneData(entry.lastOutcome)}));
  const result={apiVersion:1,mindVersion:MIND_INSPECTOR_VERSION,view:'developer',simulationId:s.simulationId,
    revision:s.revision,tick:s.tick,worldFacts:{publicHerbs:world.resources.herbs,postedHerbPrice:world.marketModel.prices.herbs},actors};
  requireCondition(new TextEncoder().encode(canonicalJson(result)).length<=MAX_MIND_INSPECTOR_BYTES,'Mind inspector exceeds budget','LIMIT_EXCEEDED');
  return cloneData(result);
}