// Encounter-profile read-only cognition projection. It audits the real encounter rules and
// derives Knowledge from persisted mind, motivation and experience state without presenting
// the bundle as the legacy survival profile.
import { validateBundle } from '../core/world-state.mjs';
import { projectActorEvent,projectSceneActorEvent } from '../core/memory-observer.mjs';
import { deriveMindBelief } from '../core/mind-state.mjs';
import { cloneData, fields, record, canonicalJson, requireCondition } from '../core/data-contract.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { COGNITION_KNOWLEDGE_VERSION } from '../core/cognition-state.mjs';
import { SURVIVAL_ACTOR_ID, SURVIVAL_KNOWLEDGE_VERSION, SURVIVAL_INSPECTOR_VERSION,
  SURVIVAL_FOOD_QUOTE_EVENT, SURVIVAL_WORK_OFFER_EVENT, MAX_SURVIVAL_KNOWLEDGE_BYTES,
  survivalFoodQuoteFrom, survivalWorkOfferFrom } from '../core/survival-state.mjs';
import { deriveWorkExperience } from '../core/work-experience.mjs';
import { ENCOUNTER_RULES } from '../core/encounter-runtime.mjs';
import { encounterSystems } from '../fixtures/encounter-survival-village.mjs';
import {SCENE_RULES} from '../core/scene-runtime.mjs';
import {canonicalSystems} from '../core/command-engine.mjs';

export const MAX_ENCOUNTER_INSPECTOR_BYTES = 131072;

function audit(bundle,scene=false) {
  inspectDescriptorTree(bundle);
  fields(bundle, ['snapshot', 'eventLog']);
  record(bundle.snapshot);
  const rules=scene?SCENE_RULES:ENCOUNTER_RULES;
  requireCondition(bundle.snapshot.rulesVersion === rules,
    'Unknown encounter projection rules', 'UNSUPPORTED_VERSION');
  validateBundle(bundle, { rulesVersion: rules, systems: scene?canonicalSystems(SCENE_RULES):encounterSystems() });
}

function budget(value) {
  requireCondition(new TextEncoder().encode(canonicalJson(value)).length <= MAX_ENCOUNTER_INSPECTOR_BYTES,
    'Encounter projection exceeds budget', 'LIMIT_EXCEEDED');
  return value;
}

function ownFoodQuote(world,eventLog,actorId,tick,scene=false){
  const cursor=world.mindModel.cursor;let best=null;
  for(const event of eventLog){
    if(event.eventSeq>cursor || event.tick>tick)continue;
    if(event.type===SURVIVAL_FOOD_QUOTE_EVENT){
      const candidate={seq:event.eventSeq,tick:event.tick,quote:survivalFoodQuoteFrom(event.payload,event.tick,event.eventSeq)};
      if(best===null || candidate.tick>best.tick || (candidate.tick===best.tick && candidate.seq>best.seq))best=candidate;
      continue;
    }
    if(event.type!=='SocietyDaySettled')continue;
    const actor=world.actorModel.actors.find(entry=>entry.actorId===actorId);
    if(!(actor.alive || event.tick<actor.deathTick))continue;
    const projection=(scene?projectSceneActorEvent:projectActorEvent)(event,actorId).find(entry=>entry.channel==='public');
    if(!projection)continue;
    const market=projection.observable,candidate={seq:event.eventSeq,tick:event.tick,
      quote:survivalFoodQuoteFrom({product:'food',price:market.prices.food,available:market.food>0},event.tick,event.eventSeq)};
    if(best===null || candidate.tick>best.tick || (candidate.tick===best.tick && candidate.seq>best.seq))best=candidate;
  }
  return best?.quote??null;
}

function ownWorkOffer(world,eventLog,actorId,tick,duty){
  if(duty===null || duty.status!=='pending' || tick>=duty.expiresTick)return null;
  const cursor=world.mindModel.cursor;let best=null;
  for(const event of eventLog){
    if(event.eventSeq>cursor || event.tick>tick || event.type!==SURVIVAL_WORK_OFFER_EVENT)continue;
    if(event.payload.actorId!==actorId || event.payload.requestId!==duty.requestId || event.payload.expiresTick!==duty.expiresTick)continue;
    const delivered=eventLog.find(entry=>entry.eventSeq===event.causationEventSeqs[0] && entry.type==='MotivationRequestResolved' &&
      entry.payload.requestId===duty.requestId && entry.payload.listenerId===actorId && entry.tick===event.tick);
    if(!delivered)continue;
    const candidate={seq:event.eventSeq,tick:event.tick,offer:survivalWorkOfferFrom(event.payload,event.tick,event.eventSeq)};
    if(best===null || candidate.tick>best.tick || (candidate.tick===best.tick && candidate.seq>best.seq))best=candidate;
  }
  return best?.offer??null;
}

function knowledge(bundle, motivation,scene=false) {
  const s = bundle.snapshot, w = s.world;
  const actor = w.actorModel.actors.find(entry => entry.actorId === motivation.actorId);
  const state = w.societyModel.agents.find(entry => entry.state.actorId === motivation.actorId).state;
  const mind = w.mindModel.actors.find(entry => entry.actorId === motivation.actorId);
  const last = bundle.eventLog.findLast(event => event.eventSeq <= w.mindModel.cursor &&
    event.type === 'SocietyDaySettled' && (actor.alive || event.tick < actor.deathTick));
  const publicValue = last ? (scene?projectSceneActorEvent:projectActorEvent)(last, motivation.actorId).find(entry => entry.channel === 'public')?.observable : null;
  const profile = w.motivationModel.config.profiles.find(entry => entry.actorId === motivation.actorId);
  const experience = w.experienceModel.actors.find(entry => entry.actorId === motivation.actorId);
  const survival=motivation.actorId===SURVIVAL_ACTOR_ID;
  const extra=survival?{foodQuote:ownFoodQuote(w,bundle.eventLog,motivation.actorId,s.tick,scene),
    workOffer:ownWorkOffer(w,bundle.eventLog,motivation.actorId,s.tick,motivation.lastDuty)}:{};
  return budget({
    knowledgeVersion: survival?SURVIVAL_KNOWLEDGE_VERSION:COGNITION_KNOWLEDGE_VERSION, phase: 'committed', simulationId: s.simulationId,
    actorId: motivation.actorId, tick: s.tick, revision: s.revision,
    self: { name: actor.name, occupation: actor.occupation, location: actor.location, alive: actor.alive,
      health: actor.health, hunger: actor.hunger, fatigue: actor.fatigue, wallet: state.wallet,
      inventory: cloneData(state.inventory), currentGoal: actor.alive ? cloneData(state.currentGoal) : null,
      nextGoalId: state.nextGoalId, cooldownUntilDay: state.cooldownUntilDay },
    quote: { product: 'herbs', price: publicValue ? publicValue.prices.herbs : w.marketModel.config.products.herbs.basePrice,
      observedTick: last?.tick ?? 0, sourceEventSeq: last?.eventSeq ?? null },
    observations: cloneData(mind.observations), belief: deriveMindBelief(mind.observations, s.tick),
    profile: { dutyWeightPermille: profile.dutyWeightPermille, riskAversionPermille: profile.riskAversionPermille },
    duty: cloneData(motivation.lastDuty),
    planState: { activePlan: cloneData(motivation.activePlan), suspendedPlan: cloneData(motivation.suspendedPlan),
      nextPlanId: motivation.nextPlanId, lastReviewedDutyId: motivation.lastReviewedDutyId },
    experience: deriveWorkExperience(experience.workExperienceState),
    useWorkExperience: w.experienceModel.config.useWorkExperience === true,
    ...extra,
  }, MAX_SURVIVAL_KNOWLEDGE_BYTES);
}

export function projectEncounterInspector(bundle){return projectInspectorFor(bundle);}
export function projectSceneMindInspector(bundle){return projectInspectorFor(bundle,true);}
function projectInspectorFor(bundle,scene=false) {
  audit(bundle,scene);
  const s = bundle.snapshot, w = s.world;
  const actors = w.cognitionModel.actors.map(entry => {
    const motivation = w.motivationModel.actors.find(actor => actor.actorId === entry.actorId);
    const experience = w.experienceModel.actors.find(actor => actor.actorId === entry.actorId);
    const profile = w.cognitionModel.config.profiles.find(actor => actor.actorId === entry.actorId);
    const state = experience.workExperienceState;
    return { knowledge: knowledge(bundle, motivation,scene), lastDecision: cloneData(motivation.lastDecision),
      lastOutcome: cloneData(motivation.lastOutcome), counterfactual: null,
      workExperience: { state: cloneData(state), view: deriveWorkExperience(state) },
      cognition: { importancePermille: profile.importancePermille, reviewState: cloneData(entry.reviewState),
        signalBaseline: cloneData(entry.signalBaseline), lastReviewDecisionId: entry.lastReviewDecisionId,
        lastReviewEventSeq: entry.lastReviewEventSeq } };
  });
  return cloneData(budget({ apiVersion: 1, mindVersion: SURVIVAL_INSPECTOR_VERSION, view: 'developer',
    simulationId: s.simulationId, revision: s.revision, tick: s.tick,
    worldFacts: { publicFood: w.resources.food, publicHerbs: w.resources.herbs,
      postedFoodPrice: w.marketModel.prices.food, postedHerbPrice: w.marketModel.prices.herbs },
    actors }));
}
