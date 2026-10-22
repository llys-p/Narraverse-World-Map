// Motivation and experience integration. The exported hooks objects are engine/fixture connections,
// not a business API. Decision-phase Knowledge remains private to this module.
import {fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition,inputFingerprint,MAX_COLLECTION} from './data-contract.mjs';
import {livelihoodMindRuntimeHooks,campaignMindRuntimeHooks,sceneMindRuntimeHooks,createMindWorld,validateMindWorld,applyMindStimuliTick,prepareMindDay,settleMindSocietyDay,finishMindMemoryDay,finishMindDay,pushMindObservation,mindRejectionObservation} from './mind-runtime.mjs';
import {planSocietyDay,applySocietyAction,societyActionFact,societyCauses} from './society.mjs';
import {projectActorEvent,projectSceneActorEvent} from './memory-observer.mjs';
import {deriveMindBelief,validateMindConfig} from './mind-state.mjs';
import {MOTIVATION_RULES,MOTIVATION_KNOWLEDGE_VERSION,MAX_MOTIVATION_KNOWLEDGE_BYTES,MAX_MOTIVATION_PLAN_TRANSITIONS,
  validateMotivationConfig,createMotivationModel,validateMotivationModel,validateMotivationDecision,validateMotivationOutcome,
  MOTIVATION_EMERGENCY_FATIGUE} from './motivation-state.mjs';
import {planMotivationDecision} from './motivation-planner.mjs';
import {createRng} from './rng.mjs';
import {playerIntentDuration,canPlayerIntent,applyPlayerAction,playerActionFact,playerDayFact} from './player-state.mjs';
import {createSimulationSession} from './command-engine.mjs';
import {validateBundle} from './world-state.mjs';
import {motivationSystems} from '../fixtures/motivation-village.mjs';
import {EXPERIENCE_RULES,EXPERIENCE_CONFIG_VERSION,EXPERIENCE_RUNTIME_STATE_VERSION,EXPERIENCE_MOTIVATION_STATE_VERSION,
  EXPERIENCE_KNOWLEDGE_VERSION,EXPERIENCE_DECISION_VERSION,MAX_EXPERIENCE_KNOWLEDGE_BYTES,
  inspectDescriptorTree,validateExperienceConfig,createExperienceModel,validateExperienceModel} from './experience-state.mjs';
import {validateExperienceMotivationDecision,validateExperienceMotivationModel,
  validateCognitionMotivationDecision,validateCognitionMotivationModel} from './motivation-state.mjs';
import {planExperienceMotivationDecision,planCognitionMotivationDecision,continueCognitionPlan} from './motivation-planner.mjs';
import {deriveWorkExperience,observeWorkOutcome} from './work-experience.mjs';
import {projectOwnWorkOutcome,projectOwnCognitionWorkOutcome,projectOwnSurvivalWorkOutcome} from './work-experience-adapter.mjs';
import {experienceSystems} from '../fixtures/experience-village.mjs';
import {cognitionSystems} from '../fixtures/cognition-village.mjs';
import {COGNITION_RULES,COGNITION_MOTIVATION_STATE_VERSION,COGNITION_KNOWLEDGE_VERSION,
  MAX_COGNITION_KNOWLEDGE_BYTES,validateCognitionConfig,createCognitionModel,validateCognitionModel,
  SURVIVAL_COGNITION_STATE_VERSION,validateSurvivalCognitionModel} from './cognition-state.mjs';
import {evaluateCognitiveReview} from './cognitive-review.mjs';
import {deriveActorCognitionSignals} from './cognition-signals.mjs';
import {SURVIVAL_RULES,SURVIVAL_MOTIVATION_STATE_VERSION,SURVIVAL_KNOWLEDGE_VERSION,
  SURVIVAL_DECISION_PREFIX,SURVIVAL_ACTOR_ID,SURVIVAL_FOOD_PLAN_KIND,SURVIVAL_FOOD_QUOTE_EVENT,
  SURVIVAL_WORK_OFFER_EVENT,MAX_SURVIVAL_KNOWLEDGE_BYTES,MAX_SURVIVAL_EVIDENCE_REFS,
  survivalFoodQuoteFrom,survivalWorkOfferFrom,
  validateSurvivalDecision,validateSurvivalOutcome,validateSurvivalMotivationModel} from './survival-state.mjs';
import {planSurvivalDecision,continueSurvivalPlan} from './survival-planner.mjs';
import {deriveActorSurvivalSignals} from './survival-signals.mjs';
import {survivalSystems} from '../fixtures/survival-village.mjs';

const SOCIETY_KEYS=['resources','resourceModel','ecologyModel','marketModel','actorModel','societyModel','playerModel'];
const societyProject=w=>Object.fromEntries(SOCIETY_KEYS.map(k=>[k,w[k]]));
const agent=(w,id)=>w.societyModel.agents.find(a=>a.state.actorId===id).state;
const body=(w,id)=>w.actorModel.actors.find(a=>a.actorId===id);
const entryOf=(w,id)=>w.motivationModel.actors.find(a=>a.actorId===id);
const withoutMotivation=w=>{const {motivationModel,...base}=w;return base;};
const withoutExperienceAndMotivation=w=>{const {experienceModel,motivationModel,...base}=w;return base;};
const withoutCognitionExperienceAndMotivation=w=>{const {experienceModel,motivationModel,cognitionModel,...base}=w;return base;};
const MOTIVATION_PROFILE=Object.freeze({experience:false,cognition:false,rules:MOTIVATION_RULES,knowledgeVersion:MOTIVATION_KNOWLEDGE_VERSION,knowledgeBytes:MAX_MOTIVATION_KNOWLEDGE_BYTES,label:'Motivation'});
const EXPERIENCE_PROFILE=Object.freeze({experience:true,cognition:false,rules:EXPERIENCE_RULES,knowledgeVersion:EXPERIENCE_KNOWLEDGE_VERSION,knowledgeBytes:MAX_EXPERIENCE_KNOWLEDGE_BYTES,label:'Experience'});
// Cognition reuses the M3-2 experience knowledge and model in place; only the review cadence
// model and the decision/motivation state versions are new.
const COGNITION_PROFILE=Object.freeze({experience:true,cognition:true,rules:COGNITION_RULES,knowledgeVersion:COGNITION_KNOWLEDGE_VERSION,knowledgeBytes:MAX_COGNITION_KNOWLEDGE_BYTES,label:'Cognition'});
// M4A: the survival profile keeps the cognition models, knowledge shape and review kernel;
// only the rules/versions, the decision prefix and actor-2's new decision anchors differ.
const SURVIVAL_PROFILE=Object.freeze({experience:true,cognition:true,survival:true,rules:SURVIVAL_RULES,
  knowledgeVersion:SURVIVAL_KNOWLEDGE_VERSION,knowledgeBytes:MAX_SURVIVAL_KNOWLEDGE_BYTES,label:'Survival'});
const SCENE_BASE_PROFILE=Object.freeze({...SURVIVAL_PROFILE,scene:true,rules:'d-scene-survival-v1',label:'Scene'});
const LIVELIHOOD_BASE_PROFILE=Object.freeze({...SCENE_BASE_PROFILE,livelihood:true,rules:'d-scene-livelihood-v1',label:'Livelihood'});
const CAMPAIGN_BASE_PROFILE=Object.freeze({...LIVELIHOOD_BASE_PROFILE,campaign:true,rules:'d-campaign-v1'});
const mindHooks=profile=>profile.campaign?campaignMindRuntimeHooks:profile.livelihood?livelihoodMindRuntimeHooks:sceneMindRuntimeHooks;
const lowerWorld=(world,profile)=>profile.cognition?withoutCognitionExperienceAndMotivation(world):
  profile.experience?withoutExperienceAndMotivation(world):withoutMotivation(world);
function retainModels(base,world,profile){
  const result={...base,motivationModel:cloneData(world.motivationModel)};
  if(profile.experience)result.experienceModel=cloneData(world.experienceModel);
  if(profile.cognition)result.cognitionModel=cloneData(world.cognitionModel);
  return result;
}
const reserved=id=>['society-day-','mind-day-','motivation-day-'].some(p=>id.startsWith(p));
const experienceReserved=id=>['society-day-','mind-day-','mind-settle-','motivation-day-','experience-day-'].some(p=>id.startsWith(p));
const cognitionReserved=id=>['society-day-','mind-day-','mind-settle-','motivation-day-','experience-day-',
  'cognition-day-','cognition-eval-'].some(p=>id.startsWith(p));
// Format7 keeps every format6 prefix and adds the survival namespace; formats 1–6 never expand.
const survivalReserved=id=>['society-day-','mind-day-','mind-settle-','motivation-day-','experience-day-',
  'cognition-day-','cognition-eval-','survival-day-'].some(p=>id.startsWith(p));
const reservedFor=(id,profile)=>profile.survival?survivalReserved(id):profile.cognition?cognitionReserved(id):
  profile.experience?experienceReserved(id):reserved(id);

// The frozen M2 economics stay exactly as they are for every old profile. M4A §7 requires
// workFood 0 so that work never produces food; that single value is relaxed for the survival
// profile only, and every other economic parameter stays frozen.
const FROZEN_ECONOMICS={wage:20,workFood:8,workFatigue:150,deadlineDays:20,maxFailures:3,cooldownDays:2};
const SURVIVAL_ECONOMICS={...FROZEN_ECONOMICS,workFood:0};
function validateInputs(memory,mind,motivation,profile){
  record(mind);record(motivation);denseArray(mind.stimuli,64);denseArray(motivation.requests,64);
  const all=[...mind.stimuli,...motivation.requests];
  requireCondition(all.length<=64,'Combined motivation input budget exceeded','LIMIT_EXCEEDED');
  const counts=new Map();for(const input of all){const count=(counts.get(input.tick)??0)+1;
    requireCondition(count<=8,'Combined motivation per-tick input budget exceeded','LIMIT_EXCEEDED');counts.set(input.tick,count);}
  validateMindConfig(mind);validateMotivationConfig(motivation);
  const e=memory.society.economics;
  for(const [key,value] of Object.entries(profile?.survival?SURVIVAL_ECONOMICS:FROZEN_ECONOMICS))
    requireCondition(e[key]===value,'Motivation economics are frozen','UNSUPPORTED_VERSION');
}

function createWorldFor(memory,mind,motivation,experience,cognition,simulationId,profile){
  record(memory);record(mind);record(motivation);
  if(profile.cognition){record(experience);record(cognition);identifier(simulationId);
    canonicalJson({memory,mind,motivation,experience,cognition});}
  else if(profile.experience){record(experience);identifier(simulationId);canonicalJson({memory,mind,motivation,experience});}
  else canonicalJson({memory,mind,motivation});
  validateInputs(memory,mind,motivation,profile);
  if(profile.experience)validateExperienceConfig(experience);
  if(profile.cognition){validateExperienceConfig(experience);validateCognitionConfig(cognition);}
  const world={...(profile.scene?mindHooks(profile).createWorld:createMindWorld)(memory,mind),motivationModel:createMotivationModel(motivation)};
  if(profile.experience){
    world.motivationModel.version=EXPERIENCE_MOTIVATION_STATE_VERSION;
    world.experienceModel=createExperienceModel(simulationId,experience);
  }
  if(profile.cognition){
    world.motivationModel.version=profile.survival?SURVIVAL_MOTIVATION_STATE_VERSION:COGNITION_MOTIVATION_STATE_VERSION;
    world.experienceModel=createExperienceModel(simulationId,experience);
    world.cognitionModel=createCognitionModel(simulationId,cognition);
    if(profile.survival)world.cognitionModel.version=SURVIVAL_COGNITION_STATE_VERSION;
  }
  return world;
}

function createWorld(memory,mind,motivation){return createWorldFor(memory,mind,motivation,null,null,null,MOTIVATION_PROFILE);}
function createExperienceWorld(memory,mind,motivation,experience,simulationId){
  inspectDescriptorTree({memory,mind,motivation,experience,simulationId});
  return createWorldFor(memory,mind,motivation,experience,null,simulationId,EXPERIENCE_PROFILE);
}
function createCognitionWorld(memory,mind,motivation,experience,cognition,simulationId){
  inspectDescriptorTree({memory,mind,motivation,experience,cognition,simulationId});
  return createWorldFor(memory,mind,motivation,experience,cognition,simulationId,COGNITION_PROFILE);
}
// M4A: the survival world is the cognition world with its own rules/versions. No new model, no
// new configuration block and no restructure of the frozen four M3-1 kernels.
export function createSurvivalWorld(memory,mind,motivation,experience,cognition,simulationId){
  inspectDescriptorTree({memory,mind,motivation,experience,cognition,simulationId});
  return createWorldFor(memory,mind,motivation,experience,cognition,simulationId,SURVIVAL_PROFILE);
}

function validateWorldFor(world,sealed,profile){
  record(world);requireCondition(typeof sealed==='boolean',profile.experience?'Invalid experience world seal mode':'Invalid motivation seal mode');
  canonicalJson(world);
  // A cognition model under older rules (or its absence under cognition rules) is a structural
  // inconsistency of the stored world itself, so it is reported as a structure error rather
  // than as an unknown-version cross-load.
  requireCondition(Object.hasOwn(world,'cognitionModel')===profile.cognition,
    profile.cognition?'Cognition rules require the cognition model':'Cognition model does not belong to these rules');
  if(profile.cognition){
    validateExperienceModel(world.experienceModel);
    if(profile.survival)validateSurvivalCognitionModel(world.cognitionModel);
    else validateCognitionModel(world.cognitionModel);
    if(profile.survival)validateSurvivalMotivationModel(world.motivationModel);
    else validateCognitionMotivationModel(world.motivationModel);
    (profile.scene?mindHooks(profile).validateWorld:validateMindWorld)(lowerWorld(world,profile),sealed);
    if(sealed)requireCondition(world.mindModel.cursor===world.motivationModel.cursor&&
      world.motivationModel.cursor===world.experienceModel.cursor&&
      world.experienceModel.cursor===world.cognitionModel.cursor,
      'Mind, motivation, experience, and cognition cursors must match when sealed');
    for(const actor of world.cognitionModel.actors){
      const saved=actor.reviewState.lastEvaluation;
      if(saved===null||!saved.input.alive)continue;
      // A day-boundary evaluation made while alive may only be followed by death on that
      // same tick; the kernel then stays dormant and never re-evaluates with another alive flag.
      requireCondition(body(world,actor.actorId).alive||body(world,actor.actorId).deathTick===saved.input.tick,
        'Cognition actor evaluated alive on another tick than its death');
    }
  }else if(profile.experience){
    validateExperienceModel(world.experienceModel);validateExperienceMotivationModel(world.motivationModel);
    (profile.scene?mindHooks(profile).validateWorld:validateMindWorld)(lowerWorld(world,profile),sealed);
    if(sealed)requireCondition(world.mindModel.cursor===world.motivationModel.cursor&&world.motivationModel.cursor===world.experienceModel.cursor,'Mind, motivation, and experience cursors must match when sealed');
  }else{(profile.scene?mindHooks(profile).validateWorld:validateMindWorld)(lowerWorld(world,profile),sealed);validateMotivationModel(world.motivationModel);}
  const m=world.motivationModel;validateInputs(world.memoryModel.config,world.mindModel.config,m.config,profile);
  for(const mind of world.mindModel.actors)requireCondition(mind.lastDecision===null&&mind.lastOutcome===null,'M2 mind stores observations only');
  for(const entry of m.actors){const state=agent(world,entry.actorId),actor=body(world,entry.actorId);
    requireCondition(actor&&state,'Missing motivation actor/estate');
    requireCondition(state.currentGoal===null||state.currentGoal.kind==='recover-health','Unexpected motivation canonical goal');
    if(sealed)requireCondition((entry.lastDecision===null)===(entry.lastOutcome===null),'Committed motivation decision has no outcome');
    // A suspension slot may hold the health plan or, under the survival rules, a food plan; it
    // never holds both, and it never holds two health plans.
    requireCondition(!(entry.activePlan?.kind==='recover-health'&&entry.suspendedPlan!==null&&
      entry.suspendedPlan.kind==='recover-health'),'Motivation actor carries two health plans');
    if(profile.survival){
      const foodSlots=[entry.activePlan,entry.suspendedPlan].filter(p=>p!==null&&p.kind===SURVIVAL_FOOD_PLAN_KIND);
      requireCondition(foodSlots.length<=1,'Motivation actor carries two food plans');
      for(const plan of foodSlots)
        requireCondition(actor.alive||!sealed,'Dead survival actor retains a food plan');
      for(const plan of [entry.activePlan,entry.suspendedPlan])if(plan!==null&&plan.kind===SURVIVAL_FOOD_PLAN_KIND){
        requireCondition(actor.alive,'Dead survival actor retains a plan');
        // The two-step shape must still point at the request that opened it.
        if(plan.steps.length===2)requireCondition(entry.lastDuty!==null&&entry.lastDuty.requestId===plan.requestId&&
          m.config.requests.some(r=>r.requestId===plan.requestId),'Survival food plan cites an unknown request');
      }
    }
    if(entry.lastReviewedDutyId!==null){const index=m.config.requests.findIndex(r=>r.requestId===entry.lastReviewedDutyId),r=m.config.requests[index];
      requireCondition(index>=0&&index<m.requestCursor&&r.listenerId===entry.actorId&&r.urgencyPermille>=900,'Reviewed duty is not a consumed major request for this actor');}
    for(const plan of [entry.activePlan,entry.suspendedPlan])if(plan!==null){
      requireCondition(actor.alive,'Dead motivation actor retains a plan');
      if(plan.kind==='recover-health')requireCondition(state.currentGoal!==null&&plan.goalId===state.currentGoal.goalId&&plan.deadlineDay===state.currentGoal.deadlineDay,'Health plan references another goal');
      if(plan.kind==='aid-village')requireCondition(entry.lastDuty!==null&&entry.lastDuty.requestId===plan.requestId&&entry.lastDuty.status==='pending','Duty plan/request mismatch');
      // A fulfilled or expired duty must not cancel an already-earned purchase step: the two
      // step plan owns its requestId as a source, not as a live obligation.
      if(plan.kind===SURVIVAL_FOOD_PLAN_KIND&&plan.steps.length===2)
        requireCondition(plan.requestId!==null,'Survival two-step plan lost its request source');
    }
    if(entry.lastDuty!==null){const d=entry.lastDuty,request=m.config.requests.find(r=>r.requestId===d.requestId);
      requireCondition(request&&m.config.requests.indexOf(request)<m.requestCursor&&request.listenerId===entry.actorId&&request.tick===d.observedTick&&request.expiresTick===d.expiresTick&&request.urgencyPermille===d.urgencyPermille,'Duty configuration/prefix mismatch');
      requireCondition(d.sourceEventSeq<=m.cursor,'Duty cites an unconsumed source');
      if(d.fulfilledTick!==null)requireCondition(d.fulfilledTick>=d.observedTick&&d.fulfilledTick<d.expiresTick,'Duty fulfilled outside its opportunity');
    }
  }
  return world;
}

export function validateMotivationWorld(world,sealed=true){return validateWorldFor(world,sealed,MOTIVATION_PROFILE);}
export function validateExperienceWorld(world,sealed=true){
  inspectDescriptorTree(world);
  return validateWorldFor(world,sealed,EXPERIENCE_PROFILE);
}
export function validateCognitionWorld(world,sealed=true){
  inspectDescriptorTree(world);
  return validateWorldFor(world,sealed,COGNITION_PROFILE);
}
export function validateSurvivalWorld(world,sealed=true){
  inspectDescriptorTree(world);
  return validateWorldFor(world,sealed,SURVIVAL_PROFILE);
}

// The decision-time Knowledge frozen inside a committed decision. It is the authoritative
// record of what this actor could see when it decided; a missing or malformed text fails closed.
function frozenDecisionKnowledge(decision){
  if(decision===null||typeof decision.knowledgeFingerprint!=='string')return null;
  let frozen;
  try{frozen=JSON.parse(decision.knowledgeFingerprint);}
  catch{return null;}
  if(frozen===null||typeof frozen!=='object'||Array.isArray(frozen))return null;
  if(canonicalJson(frozen)!==decision.knowledgeFingerprint)return null;
  if(frozen.actorId!==decision.actorId||frozen.tick!==decision.tick)return null;
  return frozen;
}

// The Knowledge version and shape follow the actor, not just the profile: under the survival
// rules actor-2 carries the new survival Knowledge (frozen fields plus its two actor-local
// views) while actor-3 keeps the original cognition Knowledge shape verbatim.
function knowledgeVersionFor(runtimeProfile,actorId){
  // Under the survival rules actor-2 carries the survival Knowledge; actor-3 keeps the frozen
  // cognition Knowledge version and shape, so the survival profile falls back to cognition.
  if(runtimeProfile.survival)
    return actorId===SURVIVAL_ACTOR_ID?SURVIVAL_KNOWLEDGE_VERSION:COGNITION_KNOWLEDGE_VERSION;
  return runtimeProfile.knowledgeVersion;
}
// The same split for the per-actor Knowledge DTO: actor-2 uses the survival validator, actor-3
// keeps using the frozen cognition validator even under the survival rules.
function validateKnowledgeFor(knowledge,profile,actorId){
  return profile.survival&&actorId===SURVIVAL_ACTOR_ID?validateSurvivalKnowledge(knowledge):
    profile.cognition?validateCognitionKnowledge(knowledge):knowledge;
}

// A frozen actor-local view; quotes come from previously published facts, never the
// hidden current public cash or another actor's execution results.
function decisionKnowledge(world,events,actorId,tick,simulationId,runtimeProfile){
  const actor=body(world,actorId),state=agent(world,actorId),entry=entryOf(world,actorId),mind=world.mindModel.actors.find(a=>a.actorId===actorId);
  const publicEvents=events.filter(e=>e.eventSeq<=world.mindModel.cursor&&e.type==='SocietyDaySettled'&&(actor.alive||e.tick<actor.deathTick));
  const last=publicEvents.at(-1),observable=last?(runtimeProfile.scene?projectSceneActorEvent:projectActorEvent)(last,actorId).find(p=>p.channel==='public').observable:null;
  const profile=world.motivationModel.config.profiles.find(p=>p.actorId===actorId);
  const knowledge={knowledgeVersion:knowledgeVersionFor(runtimeProfile,actorId),phase:'decision',simulationId,actorId,tick,revision:tick-1,
    self:{name:actor.name,occupation:actor.occupation,location:actor.location,alive:actor.alive,health:actor.health,hunger:actor.hunger,fatigue:actor.fatigue,
      wallet:state.wallet,inventory:cloneData(state.inventory),currentGoal:cloneData(state.currentGoal),nextGoalId:state.nextGoalId,cooldownUntilDay:state.cooldownUntilDay},
    quote:{product:'herbs',price:observable?observable.prices.herbs:world.marketModel.config.products.herbs.basePrice,observedTick:last?.tick??0,sourceEventSeq:last?.eventSeq??null},
    observations:cloneData(mind.observations),belief:deriveMindBelief(mind.observations,tick),
    profile:{dutyWeightPermille:profile.dutyWeightPermille,riskAversionPermille:profile.riskAversionPermille},duty:cloneData(entry.lastDuty),
    planState:{activePlan:cloneData(entry.activePlan),suspendedPlan:cloneData(entry.suspendedPlan),nextPlanId:entry.nextPlanId,lastReviewedDutyId:entry.lastReviewedDutyId}};
  if(runtimeProfile.experience){
    const expActor=world.experienceModel.actors.find(a=>a.actorId===actorId);
    knowledge.experience=deriveWorkExperience(expActor.workExperienceState);
    knowledge.useWorkExperience=world.experienceModel.config.useWorkExperience;
  }
  if(runtimeProfile.survival&&actorId===SURVIVAL_ACTOR_ID){
    knowledge.foodQuote=survivalFoodQuote(world,events,actorId,tick,runtimeProfile);
    knowledge.workOffer=survivalWorkOffer(world,events,actorId,tick,entry.lastDuty);
  }
  if(process.env.M4A_DBG)console.log('DK',actorId,'profile',runtimeProfile.label,'surv',runtimeProfile.survival,
    'ver',knowledge.knowledgeVersion,'has',Object.keys(knowledge).filter(k=>k==='foodQuote'||k==='workOffer').join(','));
  requireCondition(new TextEncoder().encode(canonicalJson(knowledge)).length<=runtimeProfile.knowledgeBytes,`${runtimeProfile.label} knowledge exceeds budget`,'LIMIT_EXCEEDED');
  return knowledge;
}

// The most recent food quote this actor can actually see: a village-visible announcement or the
// public market projection of an already published SocietyDaySettled. Both are public facts;
// neither one reads the hidden current stock, and a missing or expired source stays missing.
function survivalFoodQuote(world,events,actorId,tick,profile){
  let best=null;
  const consider=(seq,observedTick,payload)=>{
    requireCondition(observedTick<=tick,'Survival food quote observed in the future');
    const quote=survivalFoodQuoteFrom(payload,observedTick,seq);
    if(best===null||observedTick>best.observedTick||(observedTick===best.observedTick&&seq>best.sourceEventSeq))best=quote;
  };
  for(const event of events){
    if(event.eventSeq>world.mindModel.cursor||event.tick>tick)continue;
    if(event.type===SURVIVAL_FOOD_QUOTE_EVENT){consider(event.eventSeq,event.tick,event.payload);continue;}
    if(event.type!=='SocietyDaySettled')continue;
    const actor=body(world,actorId);
    if(!(actor.alive||event.tick<actor.deathTick))continue;
    const projection=(profile.scene?projectSceneActorEvent:projectActorEvent)(event,actorId).find(p=>p.channel==='public');
    if(!projection)continue;
    consider(event.eventSeq,event.tick,{product:'food',price:projection.observable.prices.food,
      available:projection.observable.food>0});
  }
  return best;
}

// Only a real, still-pending Duty of this actor may become a visible work offer, and only when
// its own announcement names exactly that request on the same tick and expiry.
function survivalWorkOffer(world,events,actorId,tick,duty){
  if(duty===null||duty.status!=='pending'||tick>=duty.expiresTick)return null;
  let best=null;
  for(const event of events){
    if(event.eventSeq>world.mindModel.cursor||event.tick>tick)continue;
    if(event.type!==SURVIVAL_WORK_OFFER_EVENT)continue;
    if(event.payload.actorId!==actorId||event.payload.requestId!==duty.requestId)continue;
    if(event.payload.expiresTick!==duty.expiresTick)continue;
    const delivered=events.find(e=>e.eventSeq===event.causationEventSeqs[0]&&e.type==='MotivationRequestResolved'&&
      e.payload.requestId===duty.requestId&&e.payload.listenerId===actorId&&e.tick===event.tick);
    if(!delivered)continue;
    const offer=survivalWorkOfferFrom(event.payload,event.tick,event.eventSeq);
    if(best===null||offer.observedTick>best.observedTick||
      (offer.observedTick===best.observedTick&&offer.sourceEventSeq>best.sourceEventSeq))best=offer;
  }
  return best;
}

function transition(list,plan,fromStatus,toStatus,reasonCode){
  requireCondition(list.length<MAX_MOTIVATION_PLAN_TRANSITIONS,'Motivation transition budget exceeded','LIMIT_EXCEEDED');
  list.push({planId:plan.planId,kind:plan.kind,fromStatus,toStatus,reasonCode});
}
function cancel(entry,slot,reason,list){const plan=entry[slot];if(plan!==null){transition(list,plan,plan.status,'cancelled',reason);entry[slot]=null;}}
function facts(type,payload,causes=[],commandId=null){return {type,sourceSystem:'motivation',commandId,entityIds:[payload.actorId??payload.listenerId],causationEventSeqs:cloneData(causes),payload:cloneData(payload)};}
function setCursors(world,events,profile){
  world.mindModel.cursor=events.length;world.motivationModel.cursor=events.length;
  if(profile.experience)world.experienceModel.cursor=events.length;
  if(profile.cognition)world.cognitionModel.cursor=events.length;
}

function requestsTick(world,tick,append,context){
  const m=world.motivationModel;
  // M4A: the new world publishes one public food quote at tick 1, recording the real posted
  // price and availability. Before each daily decision, an actor present at the market can
  // observe it again; these public facts reveal neither private wallets nor the village purse.
  if((tick===1||tick%144===0)&&world.cognitionModel?.version===SURVIVAL_COGNITION_STATE_VERSION&&
      body(world,SURVIVAL_ACTOR_ID).alive&&body(world,SURVIVAL_ACTOR_ID).location==='village'){
    append({type:SURVIVAL_FOOD_QUOTE_EVENT,sourceSystem:'survival',commandId:null,entityIds:[],causationEventSeqs:[],
      payload:{location:'village',product:'food',price:world.marketModel.prices.food,available:world.resources.food>0}});
  }
  while(m.requestCursor<m.config.requests.length&&m.config.requests[m.requestCursor].tick===tick){
    const r=m.config.requests[m.requestCursor++],listener=body(world,r.listenerId),speaker=body(world,r.speakerId);
    const delivered=listener.alive&&speaker.alive&&listener.location==='village'&&speaker.location==='village';
    const seq=append(facts('MotivationRequestResolved',{requestId:r.requestId,speakerId:r.speakerId,listenerId:r.listenerId,
      urgencyPermille:r.urgencyPermille,expiresTick:r.expiresTick,status:delivered?'delivered':'unavailable'}));
    if(delivered){const entry=entryOf(world,r.listenerId),ctx=context.get(r.listenerId);ctx.requestSeqs.push(seq);
      entry.lastDuty={requestId:r.requestId,sourceEventSeq:seq,observedTick:tick,expiresTick:r.expiresTick,urgencyPermille:r.urgencyPermille,status:'pending',fulfilledTick:null};
      if(entry.activePlan?.kind==='aid-village'&&entry.activePlan.requestId!==r.requestId)cancel(entry,'activePlan','REQUEST_SUPERSEDED',ctx.transitions);
      // M4A: the offer is published explicitly for actor-2 in the new profile. Its wage is the
      // configured wage of this world, so it is visible information, not a planner shortcut.
      if(r.listenerId===SURVIVAL_ACTOR_ID&&world.cognitionModel?.version===SURVIVAL_COGNITION_STATE_VERSION)
        append({type:SURVIVAL_WORK_OFFER_EVENT,sourceSystem:'survival',commandId:null,entityIds:[SURVIVAL_ACTOR_ID],
          causationEventSeqs:[seq],payload:{actorId:SURVIVAL_ACTOR_ID,requestId:r.requestId,
            wage:world.memoryModel.config.society.economics.wage,expiresTick:r.expiresTick}});
    }
  }
}

function proposalTransitions(before,after,tick,list){
  const allAfter=[after.activePlan,after.suspendedPlan].filter(Boolean);
  for(const old of [before.activePlan,before.suspendedPlan].filter(Boolean)){
    const next=allAfter.find(p=>p.planId===old.planId);
    if(!next){let reason=old.kind==='aid-village'?'REQUEST_EXPIRED':old.kind==='recover-rest'?'REQUEST_EXPIRED':'GOAL_FAILED';
      if(allAfter.some(p=>p.kind==='recover-health')&&old.kind!=='recover-health'&&tick<=old.deadlineDay*144)reason='POLICY_DEFERRED';
      transition(list,old,old.status,'cancelled',reason);
    }else if(canonicalJson(old)!==canonicalJson(next)){
      const reason=next.status==='suspended'?(after.activePlan?.kind==='aid-village'?'INTERRUPTED_DUTY':'INTERRUPTED_REST'):
        old.status==='suspended'?'RESUMED':old.status==='blocked'&&next.status==='ready'?'CONDITION_READY':'PRECONDITION_CHANGED';
      transition(list,next,old.status,next.status,reason);
    }
  }
  for(const next of allAfter)if(![before.activePlan,before.suspendedPlan].some(p=>p?.planId===next.planId))transition(list,next,null,next.status,'CREATED');
}

// The trusted runtime projection of this actor's own previous day outcome. Only a real
// committed decision/outcome pair can feed the signals; nothing is inferred or defaulted.
function ownPreviousExecution(entry,simulationId){
  const decision=entry.lastDecision,outcome=entry.lastOutcome;
  if(decision===null||outcome===null)return null;
  return {simulationId,actorId:decision.actorId,tick:decision.tick,decisionId:decision.decisionId,
    choice:decision.choice,status:outcome.status,code:outcome.code,failureOwner:outcome.failureOwner};
}

// One frozen kernel evaluation per configured actor per real day boundary, including the dead.
// Both actors' knowledge and signal input are frozen before anything is published, and the
// review facts are appended in actor-ID order before any proposal is planned.
function evaluateCognitionDay(snapshot,events,tick,append,profile){
  const model=snapshot.world.cognitionModel,frozen=[];
  for(const actor of model.actors){
    const entry=entryOf(snapshot.world,actor.actorId);
    const knowledge=decisionKnowledge(snapshot.world,events,actor.actorId,tick,snapshot.simulationId,profile);
    const importance=model.config.profiles.find(p=>p.actorId===actor.actorId).importancePermille;
    // M4A: actor-2 uses the survival signal derivation, which adds the food urgentNeed on top
    // of the frozen kernel need. actor-3 keeps the original cognition derivation unchanged.
    const signals=profile.survival&&actor.actorId===SURVIVAL_ACTOR_ID?
      deriveActorSurvivalSignals(knowledge,importance,actor.signalBaseline,
        ownPreviousExecution(entry,snapshot.simulationId)):
      deriveActorCognitionSignals(knowledge,importance,actor.signalBaseline,
        ownPreviousExecution(entry,snapshot.simulationId));
    const evaluated=evaluateCognitiveReview(actor.reviewState,signals.input);
    frozen.push({actorId:actor.actorId,knowledge,input:signals.input,kernel:evaluated.decision,
      nextState:evaluated.state,nextBaseline:signals.baseline,
      sourceReviewDecisionId:actor.lastReviewDecisionId,sourceReviewEventSeq:actor.lastReviewEventSeq});
  }
  for(const item of frozen){
    const actor=model.actors.find(a=>a.actorId===item.actorId);
    actor.reviewState=item.nextState;actor.signalBaseline=item.nextBaseline;
  }
  for(const item of frozen)
    item.evalSeq=append({type:'CognitionReviewEvaluated',sourceSystem:'cognition',commandId:null,
      entityIds:[item.actorId],causationEventSeqs:[],
      payload:{actorId:item.actorId,input:item.input,decision:item.kernel}});
  setCursors(snapshot.world,events,profile);
  return new Map(frozen.map(item=>[item.actorId,item]));
}

function beforeSystemsFor(snapshot,events,tick,append,commit,profile){
  const context=new Map(snapshot.world.motivationModel.actors.map(e=>[e.actorId,{transitions:[],requestSeqs:[],resolvedSeq:null,decisionId:null}]));
  (profile.scene?mindHooks(profile).applyMindStimuliTick:applyMindStimuliTick)(lowerWorld(snapshot.world,profile),tick,append);
  requestsTick(snapshot.world,tick,append,context);setCursors(snapshot.world,events,profile);
  if(tick%144!==0)return context;
  const prepared=(profile.scene?mindHooks(profile).prepareMindDay:prepareMindDay)(lowerWorld(snapshot.world,profile),tick);
  snapshot.world=retainModels(prepared.world,snapshot.world,profile);
  for(const fact of prepared.facts)append(fact);setCursors(snapshot.world,events,profile);
  const cognitionReviews=profile.cognition?evaluateCognitionDay(snapshot,events,tick,append,profile):null;
  const world=cloneData(snapshot.world),day=tick/144;
  const chief=planSocietyDay(societyProject(world),{buyerId:null,price:null},world.memoryModel.config.personalities);
  world.societyModel.agents[0]=chief.world.societyModel.agents[0];
  const plans=[];
  // Every proposal sees this same candidate; no proposed goal or execution result of
  // the other M2 actor has been applied when Knowledge is built.
  const proposals=[];
  const encounterTemporaryRest = profile.survival && (snapshot.rulesVersion === 'd-encounter-survival-v1'||profile.scene);
  for(const entry of world.motivationModel.actors){const state=agent(world,entry.actorId);state.lastAction='None';state.lastDecision=null;
    if(!body(world,entry.actorId).alive)continue;
    const review=cognitionReviews?cognitionReviews.get(entry.actorId):null;
    // Maintain never plans from scratch: it continues the frozen review anchor's own plan.
    const knowledge=review?review.knowledge:decisionKnowledge(world,events,entry.actorId,tick,snapshot.simulationId,profile);
    const proposal=profile.survival&&entry.actorId===SURVIVAL_ACTOR_ID?
      (review.kernel.mode==='maintain'?
        continueSurvivalPlan(knowledge,{evaluationEventSeq:review.evalSeq,
          sourceReviewDecisionId:review.sourceReviewDecisionId,sourceReviewEventSeq:review.sourceReviewEventSeq}):
        planSurvivalDecision(knowledge,{evaluationEventSeq:review.evalSeq,
          sourceReviewDecisionId:null,sourceReviewEventSeq:null},encounterTemporaryRest)):
      profile.cognition?(review.kernel.mode==='maintain'?
      continueCognitionPlan(knowledge,{evaluationEventSeq:review.evalSeq,
        sourceReviewDecisionId:review.sourceReviewDecisionId,sourceReviewEventSeq:review.sourceReviewEventSeq}):
      planCognitionMotivationDecision(knowledge,{evaluationEventSeq:review.evalSeq,
        sourceReviewDecisionId:null,sourceReviewEventSeq:null})):
      profile.experience?planExperienceMotivationDecision(knowledge):planMotivationDecision(knowledge);
    const priorPlan=cloneData(entry.activePlan);
    const temporaryFoodRest=encounterTemporaryRest&&entry.actorId===SURVIVAL_ACTOR_ID&&
      priorPlan?.kind===SURVIVAL_FOOD_PLAN_KIND&&tick/144<=priorPlan.deadlineDay&&
      knowledge.self.fatigue>=MOTIVATION_EMERGENCY_FATIGUE&&proposal.decision.mode==='review'&&
      proposal.decision.gateReason==='URGENT_FATIGUE'&&proposal.decision.choice==='Rest'&&
      proposal.decision.goalId===null&&proposal.decision.planId===null&&
      canonicalJson(proposal.activePlan)===canonicalJson(priorPlan)&&
      canonicalJson(proposal.suspendedPlan)===canonicalJson(entry.suspendedPlan)&&
      proposal.nextPlanId===entry.nextPlanId;
    proposals.push({entry,knowledge,priorPlan,proposal,temporaryFoodRest});
  }
  for(const {entry,knowledge,priorPlan,proposal,temporaryFoodRest} of proposals){const ctx=context.get(entry.actorId),state=agent(world,entry.actorId);
    // M4A: cancellations the survival planner produced itself (an expired food plan, or an
    // earning step whose request is gone) are recorded as real transitions of this day.
    for(const transition of proposal.transitions??[]){
      requireCondition(ctx.transitions.length<MAX_MOTIVATION_PLAN_TRANSITIONS,'Motivation transition budget exceeded','LIMIT_EXCEEDED');
      ctx.transitions.push(cloneData(transition));
    }
    proposalTransitions(entry,proposal,tick,ctx.transitions);
    state.currentGoal=cloneData(proposal.currentGoal);state.nextGoalId=proposal.nextGoalId;
    for(const key of ['activePlan','suspendedPlan','nextPlanId','lastReviewedDutyId'])entry[key]=cloneData(proposal[key]);
    entry.lastDecision=cloneData(proposal.decision);entry.lastOutcome=null;ctx.decisionId=proposal.decision.decisionId;
    const decision=proposal.decision,command=decision.choice==='NoAction'?null:{commandId:decision.decisionId,targetTick:tick,type:'SocietyAction',
      payload:{actorId:entry.actorId,goalId:decision.goalId??0,action:decision.choice,targetActorId:null}};
    plans.push({actorId:entry.actorId,decision,command,priorPlan,selfHealth:knowledge.self.health,selfFatigue:knowledge.self.fatigue,temporaryFoodRest});
  }
  snapshot.world=world;
  for(const item of plans)item.plannedSeq=append(facts('MotivationDecisionPlanned',item.decision,item.decision.evidenceRefs));
  if(profile.cognition)for(const item of plans){
    if(item.decision.mode!=='review')continue;
    // The anchor names the most recent complete own review, not the plan's creation event.
    // Under the survival rules actor-2 anchors on `survival-day-` and actor-3 keeps the
    // `cognition-day-` prefix; both must stay paired with their own latest review tick.
    const actor=snapshot.world.cognitionModel.actors.find(a=>a.actorId===item.actorId);
    actor.lastReviewDecisionId=item.decision.decisionId;actor.lastReviewEventSeq=item.plannedSeq;
  }
  for(const command of chief.commands.filter(c=>c.payload.actorId==='actor-1'))commit(command);
  for(const item of plans){
    if(item.temporaryFoodRest)requireCondition(item.command?.commandId===item.decision.decisionId&&
      item.command.type==='SocietyAction'&&item.command.targetTick===item.decision.tick&&
      item.command.payload.actorId===item.actorId&&item.command.payload.action==='Rest'&&item.command.payload.goalId===0,
      'Temporary Rest command/decision binding mismatch');
    const receipt=item.command?commit(item.command):null,entry=entryOf(snapshot.world,item.actorId),ctx=context.get(item.actorId);
    const outcome=resolvedOutcome(item,receipt,snapshot.world,profile);ctx.resolvedSeq=append(facts('MotivationDecisionResolved',outcome,[item.plannedSeq],outcome.commandId));
    entry.lastOutcome=cloneData(outcome);
    if(item.decision.choice==='BuyMedicine'&&receipt?.status==='rejected')pushMindObservation(snapshot.world,item.actorId,mindRejectionObservation(ctx.resolvedSeq,tick));
    if(receipt&&entry.activePlan&&!item.temporaryFoodRest){const plan=entry.activePlan;
      requireCondition(plan.planId===item.decision.planId,'Outcome plan mismatch');
      if(receipt.status==='succeeded'){
        plan.stepIndex++;
        if(plan.stepIndex===plan.steps.length){
          transition(ctx.transitions,plan,plan.status,'completed',plan.kind==='aid-village'?'DUTY_FULFILLED':'PLAN_COMPLETED');entry.activePlan=null;
        }else transition(ctx.transitions,plan,plan.status,plan.status,'STEP_SUCCEEDED');
        if(plan.kind==='aid-village'){
          requireCondition(entry.lastDuty?.requestId===plan.requestId&&entry.lastDuty.status==='pending'&&tick<entry.lastDuty.expiresTick,'Work outcome cites the wrong request');
          entry.lastDuty.status='fulfilled';entry.lastDuty.fulfilledTick=tick;
        }
        // M4A: the same real Work step inside a food plan fulfils the duty on the spot, and the
        // plan stays active on the same planId so tomorrow can spend the earned wage.
        if(plan.kind===SURVIVAL_FOOD_PLAN_KIND&&plan.steps[0]==='WorkForPay'&&plan.stepIndex===1){
          requireCondition(entry.lastDuty?.requestId===plan.requestId&&entry.lastDuty.status==='pending'&&tick<entry.lastDuty.expiresTick,'Food income work outcome cites the wrong request');
          entry.lastDuty.status='fulfilled';entry.lastDuty.fulfilledTick=tick;
        }
        if(plan.kind==='recover-health'&&agent(snapshot.world,item.actorId).currentGoal)agent(snapshot.world,item.actorId).currentGoal.step=item.decision.choice==='BuyMedicine'?'use':'wait';
      }else{
        const stillBlocked=item.priorPlan?.planId===plan.planId&&item.priorPlan.status==='blocked'&&
          canonicalJson(item.priorPlan)===canonicalJson({...plan,status:'blocked'});
        if(stillBlocked){
          // A soft-eligible retry rejected again by authority never actually left its
          // blocked state. Keep the outcome/failure ledger, omit a fictitious recovery.
          ctx.transitions=ctx.transitions.filter(t=>!(t.planId===plan.planId&&t.reasonCode==='CONDITION_READY'));
        }else if(plan.status!=='blocked'){
          // A rejected survival Work step stays blocked on the food plan; an already-earned
          // BuyFood step also stays blocked and keeps the wage, so a later day may retry.
          transition(ctx.transitions,plan,plan.status,'blocked','EXECUTION_REJECTED');
        }
        plan.status='blocked';
      }
    }
    if(profile.experience)observeResolvedWork(snapshot,events,item,ctx.resolvedSeq,append,profile);
    setCursors(snapshot.world,events,profile);
  }
  return context;
}

function observeResolvedWork(snapshot,events,item,resolvedSeq,append,profile){
    if(body(snapshot.world,item.actorId).alive){
      const adapterContext={simulationId:snapshot.simulationId,
        rulesVersion:profile.survival?SURVIVAL_RULES:profile.cognition?COGNITION_RULES:EXPERIENCE_RULES,
        eventLog:events,commandReceipts:snapshot.commandReceipts};
      const workOutcome=profile.survival?projectOwnSurvivalWorkOutcome(adapterContext,item.actorId,resolvedSeq):
        profile.cognition?projectOwnCognitionWorkOutcome(adapterContext,item.actorId,resolvedSeq):
        projectOwnWorkOutcome(adapterContext,item.actorId,resolvedSeq);
      if(workOutcome!==null){
        const expActor=snapshot.world.experienceModel.actors.find(a=>a.actorId===item.actorId);
        const obs=observeWorkOutcome(expActor.workExperienceState,workOutcome);
        expActor.workExperienceState=obs.state;
        const experienceView=deriveWorkExperience(expActor.workExperienceState);
        append({type:'ExperienceWorkObserved',sourceSystem:'experience',commandId:workOutcome.commandId,entityIds:[item.actorId],causationEventSeqs:[resolvedSeq],
          payload:{actorId:item.actorId,sourceEventSeq:resolvedSeq,experienceView}});
      }
    }
}

function applyActionFor(input,payload,sample,profile,spatiallyRejected=false){
  validateWorldFor(input,false,profile);
  requireCondition(typeof spatiallyRejected==='boolean'&&(!spatiallyRejected||profile.campaign),'Invalid spatial action gate');
  const entry=entryOf(input,payload.actorId);
  let purchaseReject=spatiallyRejected;
  if(entry){const d=entry.lastDecision,p=entry.activePlan;
    const temporaryFoodRest=profile.survival&&d?.mode==='review'&&d.choice==='Rest'&&
      d.gateReason==='URGENT_FATIGUE'&&d.goalId===null&&d.planId===null&&p?.kind===SURVIVAL_FOOD_PLAN_KIND&&
      d.actorId===SURVIVAL_ACTOR_ID&&d.actorId===payload.actorId&&d.tick===(input.societyModel.day+1)*144&&
      (profile.scene?input.memoryModel.config.version===(profile.campaign?'memory-config-v8':profile.livelihood?'memory-config-v7':'memory-config-v6'):input.memoryModel.config.version==='memory-config-v5')&&input.societyModel.day+1<=p.deadlineDay&&
      payload.action==='Rest'&&payload.goalId===0;
    const normalBinding=d&&p&&d.choice===payload.action&&p.steps[p.stepIndex]===payload.action&&
      d.planId===p.planId&&d.goalId===p.goalId&&d.actorId===payload.actorId&&payload.goalId===(d.goalId??0);
    requireCondition(temporaryFoodRest||normalBinding,'Motivation command/decision/plan binding mismatch');
    if(profile.cognition||profile.survival)requireCondition(d.tick===(input.societyModel.day+1)*144,'Cognition authority requires the day decision tick');
    if(p.kind==='aid-village'){
      if((profile.cognition||profile.survival)&&d.mode==='maintain')
        // Maintain carries no candidates, so the duty is bound three ways from the world.
        requireCondition(entry.lastDuty?.status==='pending'&&p.requestId===entry.lastDuty.requestId&&
          d.sourceReviewDecisionId!==null&&d.tick<entry.lastDuty.expiresTick,'Cognition maintain work request provenance mismatch');
      else requireCondition(entry.lastDuty?.status==='pending'&&p.requestId===entry.lastDuty.requestId&&d.candidates.find(c=>c.action==='WorkForPay').sourceRef===p.requestId&&d.tick<entry.lastDuty.expiresTick,'Motivation work request provenance mismatch');
    }
    // M4A: the committed decision's frozen knowledge is the authoritative record of what this
    // actor actually saw when it decided, so the authority re-checks the source from there
    // instead of trusting a live lookup.
    if(profile.survival&&p.kind===SURVIVAL_FOOD_PLAN_KIND&&!temporaryFoodRest){
      const frozen=frozenDecisionKnowledge(d);
      requireCondition(frozen!==null,'Survival food step without a frozen decision knowledge');
      // The first step of a two-step plan must be bound three ways and must not be stale.
      if(p.steps[p.stepIndex]==='WorkForPay'){
        const duty=entry.lastDuty;
        requireCondition(duty!==null&&duty.status==='pending'&&p.requestId===duty.requestId&&
          d.tick<duty.expiresTick,'Survival food income work request provenance mismatch');
        requireCondition(d.planId===p.planId&&d.choice==='WorkForPay'&&p.stepIndex===0,
          'Survival food income decision/plan mismatch');
        const offer=frozen.workOffer??null;
        requireCondition(offer!==null&&offer.requestId===p.requestId&&offer.observedTick<=d.tick&&
          d.tick<offer.expiresTick,'Survival work offer/request provenance mismatch');
        requireCondition(offer.wage===input.memoryModel.config.society.economics.wage,
          'Survival announced wage differs from this world economy');
        if(d.mode==='maintain')requireCondition(d.sourceReviewDecisionId!==null,'Survival maintain work lacks its review anchor');
        else requireCondition(d.candidates.some(c=>c.action==='WorkForPay'&&c.sourceRef===p.requestId),
          'Survival review work candidate does not cite the plan request');
      }else{
        // The purchase step of an already-earned plan is NOT re-gated by the duty: the wage was
        // really earned, so a fulfilled or expired request must not cancel the purchase.
        requireCondition(d.planId===p.planId&&d.choice==='BuyFood','Survival purchase decision/plan mismatch');
        // A direct purchase is a one-step plan; an earned purchase is the second of two steps.
        requireCondition(Array.isArray(p.steps)&&(p.steps.length===1?p.stepIndex===0:p.stepIndex===1),
          'Survival purchase step must be the current step of its own plan');
        const quote=frozen.foodQuote??null;
        // The authority re-check: a purchase it cannot honour is a real rejection of a real
        // command, not a structural error. No invented price, no reliance on the old
        // "available" flag, and no transfer when the real public stock is gone.
        if(quote===null)purchaseReject=true;
        else{
          if(!(quote.observedTick<=d.tick&&d.tick<quote.expiresTick))purchaseReject=true;
          if(quote.price!==input.marketModel.prices.food)purchaseReject=true;
          if(input.resources.food<1)purchaseReject=true;
        }
      }
    }
  }
  const temporary=entry&&['aid-village','recover-rest',SURVIVAL_FOOD_PLAN_KIND].includes(entry.activePlan.kind),projection=cloneData(societyProject(input));
  const goal=cloneData(agent(input,payload.actorId).currentGoal);
  if(temporary)agent(projection,payload.actorId).currentGoal=null;
  // A food purchase the authority cannot honour is refused outright: no stock moves, no money
  // moves, and the failure is reported as a normal rejected command.
  if(purchaseReject){
    const world=cloneData(input),state=agent(world,payload.actorId),actor=body(world,payload.actorId);
    // Same personal-action refusal bookkeeping, preserving the suspended health goal.
    if(actor.alive&&state.lastActionDay<state.day+1){
      requireCondition(state.ledger.failedActions<Number.MAX_SAFE_INTEGER,'Survival failure counter overflow','LIMIT_EXCEEDED');
      state.lastActionDay=state.day+1;state.lastAction=payload.action;state.ledger.failedActions++;
    }
    return {success:false,result:{code:'RULE_REJECTED'},world};
  }
  const result=applySocietyAction(projection,payload,sample,null);
  if(temporary)agent(result.world,payload.actorId).currentGoal=goal;
  return {...result,world:retainModels({...result.world,memoryModel:cloneData(input.memoryModel),mindModel:cloneData(input.mindModel)},input,profile)};
}

function resolvedOutcome(item,receipt,world,profile=MOTIVATION_PROFILE){
  const {decision,command,selfHealth,selfFatigue}=item;
  // Only actor-2 carries the survival outcome shape; actor-3 keeps the frozen M3-2 delta.
  const survival=profile.survival&&decision.actorId===SURVIVAL_ACTOR_ID;
  const delta=survival?{wallet:0,food:0,herbs:0,health:0,fatigue:0}:{wallet:0,herbs:0,health:0,fatigue:0};
  const outcome={decisionId:decision.decisionId,actorId:decision.actorId,commandId:command?.commandId??null,status:receipt===null?'no-action':receipt.status,
    code:receipt?.status==='rejected'?'RULE_REJECTED':null,delta,price:null,publicFoodProduced:0,failureOwner:null};
  if(receipt?.status==='succeeded'){const r=receipt.result,a=body(world,decision.actorId);
    outcome.delta={...delta,wallet:r.after.wallet-r.before.wallet,herbs:r.after.inventory.herbs-r.before.inventory.herbs,
      health:a.health-selfHealth,fatigue:a.fatigue-selfFatigue,
      ...(survival?{food:r.after.inventory.food-r.before.inventory.food}:{})};
    // Both purchases record the price that was really paid.
    outcome.price=(decision.choice==='BuyMedicine'||decision.choice==='BuyFood')?r.price:null;
    outcome.publicFoodProduced=decision.choice==='WorkForPay'?r.foodProduced:0;
  }else if(receipt?.status==='rejected')outcome.failureOwner={planId:decision.planId,goalId:decision.goalId};
  return survival?validateSurvivalOutcome(outcome):validateMotivationOutcome(outcome);
}

function settleDayFor(input,sample,profile){
  const result=(profile.scene?mindHooks(profile).settleMindSocietyDay:settleMindSocietyDay)(lowerWorld(input,profile),sample);
  return {...result,world:retainModels(result.world,input,profile)};
}

function afterSystemsFor(snapshot,events,tick,append,context,profile){
  if(tick%144===0){
    const daily=events.findLast(e=>e.type==='SocietyDaySettled'&&e.tick===tick);requireCondition(daily,'Missing motivation daily source');
    append(playerDayFact(snapshot.world,daily.payload));
    let base=lowerWorld(snapshot.world,profile);const memory=(profile.scene?mindHooks(profile).finishMindMemoryDay:finishMindMemoryDay)(base,events,tick);base=memory.world;append(memory.fact);
    base=(profile.scene?mindHooks(profile).finishMindDay:finishMindDay)(base,events,tick);snapshot.world=retainModels(base,snapshot.world,profile);
  }
  for(const entry of snapshot.world.motivationModel.actors){const ctx=context.get(entry.actorId),a=body(snapshot.world,entry.actorId),state=agent(snapshot.world,entry.actorId);
    if(tick%144===0){const day=tick/144;
      // M4A: an expired food plan is cancelled at the day boundary that passes its d+3 window,
      // so the next day never executes a step of a dead plan.
      for(const slot of ['activePlan','suspendedPlan']){
        const plan=entry[slot];if(plan===null||plan.kind!==SURVIVAL_FOOD_PLAN_KIND)continue;
        if(day>plan.deadlineDay)cancel(entry,slot,'DEADLINE_EXPIRED',ctx.transitions);
      }
      for(const slot of ['activePlan','suspendedPlan']){
      const plan=entry[slot];if(plan===null)continue;
      if(!a.alive)cancel(entry,slot,'DEAD',ctx.transitions);
      else if(plan.kind==='recover-health'&&(state.currentGoal===null||state.currentGoal.goalId!==plan.goalId)){
        const daily=events.findLast(e=>e.type==='SocietyDaySettled'&&e.tick===tick);
        const reason=daily.payload.agents.find(g=>g.actorId===entry.actorId).goalOutcome==='completed'?'GOAL_COMPLETED':'GOAL_FAILED';cancel(entry,slot,reason,ctx.transitions);
      }
    }}
    if(ctx.decisionId!==null||ctx.transitions.length){const daily=events.findLast(e=>e.type==='SocietyDaySettled'&&e.tick===tick);
      const refs=[...ctx.requestSeqs,...(ctx.resolvedSeq?[ctx.resolvedSeq]:[]),...(daily?[daily.eventSeq]:[])];
      append(facts('MotivationPlanSettled',{actorId:entry.actorId,decisionId:ctx.decisionId,currentGoalId:state.currentGoal?.goalId??null,
        lastDuty:entry.lastDuty,lastReviewedDutyId:entry.lastReviewedDutyId,activePlan:entry.activePlan,suspendedPlan:entry.suspendedPlan,transitions:ctx.transitions},[...new Set(refs)].sort((a,b)=>a-b)));
    }
  }
  setCursors(snapshot.world,events,profile);
}

function auditFor(bundle,profile){fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion===profile.rules,profile.experience?'Unknown experience rules':'Unknown motivation rules','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion:profile.rules,systems:cognitionSystemsFor(profile)});}
function cognitionSystemsFor(profile){
  return profile.survival?survivalSystems():profile.cognition?cognitionSystems():
    profile.experience?experienceSystems():motivationSystems();
}
function audit(bundle){return auditFor(bundle,MOTIVATION_PROFILE);}

function executePlayerIntentFor(bundle,intent,profile){
  auditFor(bundle,profile);const durationTicks=playerIntentDuration(intent),s=bundle.snapshot;
  requireCondition(!reservedFor(intent.commandId,profile),'Player command uses a reserved namespace');
  requireCondition(!Object.hasOwn(s.commandReceipts,intent.commandId)&&!s.pendingCommands.some(c=>c.commandId===intent.commandId),'Player ID already registered','COMMAND_ID_CONFLICT');
  requireCondition(s.pendingCommands.length===0&&canPlayerIntent(s.world,intent),'Player intent cannot start','RULE_REJECTED');
  requireCondition(s.tick<=Number.MAX_SAFE_INTEGER-durationTicks&&s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Player time/input overflow','LIMIT_EXCEEDED');
  requireCondition(Object.keys(s.commandReceipts).length<MAX_COLLECTION,'Player input budget exceeded','LIMIT_EXCEEDED');
  const next=cloneData(bundle);next.snapshot.pendingCommands.push({commandId:intent.commandId,inputSeq:next.snapshot.nextInputSeq++,targetTick:s.tick+durationTicks,
    type:'PlayerAction',payload:{startTick:s.tick,intent:{type:intent.type,payload:cloneData(intent.payload)}}});
  auditFor(next,profile);const session=createSimulationSession(next,cognitionSystemsFor(profile));session.advanceTicks(durationTicks);
  const result=session.getBundle(),receipt=result.snapshot.commandReceipts[intent.commandId];requireCondition(receipt,'Missing player completion');
  return {bundle:result,durationTicks,outcome:receipt.status,result:cloneData(receipt.result)};
}

export function executeMotivationPlayerIntent(bundle,intent){return executePlayerIntentFor(bundle,intent,MOTIVATION_PROFILE);}
export function executeExperiencePlayerIntent(bundle,intent){
  inspectDescriptorTree({bundle,intent});
  return executePlayerIntentFor(bundle,intent,EXPERIENCE_PROFILE);
}

// Shared read-only player-actions projection; each caller audits the bundle for its own rules
// first, so the DTO construction stays profile-agnostic and byte-identical for every profile.
function describePlayerActionsFor(bundle){
  const w=bundle.snapshot.world,a=body(w,'actor-4');
  return {travelTicks:12,restTicks:6,tradeTicks:1,maxQuantity:10,locations:['village','forest'],
    prices:Object.fromEntries(['food','herbs'].map(id=>[id,{buy:w.marketModel.prices[id],sell:Math.max(1,Math.floor(w.marketModel.prices[id]/2))}])),canTrade:a.alive&&a.location==='village'};
}
export function describeMotivationPlayerActions(bundle){
  audit(bundle);return describePlayerActionsFor(bundle);
}
export function describeCognitionPlayerActions(bundle){
  inspectDescriptorTree(bundle);auditFor(bundle,COGNITION_PROFILE);
  return describePlayerActionsFor(bundle);
}

function validateHistoryFor(snapshot,events,profile){
  validateWorldFor(snapshot.world,true,profile);denseArray(events,140000);
  const receipts=snapshot.commandReceipts,pending=snapshot.pendingCommands;
  const entries=[...Object.entries(receipts).filter(([,r])=>r.input.type==='PlayerAction').map(([commandId,r])=>({commandId,inputSeq:r.inputSeq,...r.input,receipt:r})),...pending];
  denseArray(entries,MAX_COLLECTION);const starts=new Map(),ends=new Map(),ticks=new Set();
  for(const e of entries){requireCondition(e.type==='PlayerAction'&&!reservedFor(e.commandId,profile),`Unknown ${profile.label.toLowerCase()} external command`);
    const duration=playerIntentDuration({commandId:e.commandId,...e.payload.intent});integer(e.payload.startTick);
    requireCondition(e.payload.startTick<=Number.MAX_SAFE_INTEGER-duration&&e.targetTick===e.payload.startTick+duration&&e.payload.startTick<=snapshot.tick,'Player timing mismatch');
    requireCondition(!starts.has(e.payload.startTick),'Overlapping player admissions');starts.set(e.payload.startTick,e);ticks.add(e.payload.startTick);
    if(e.receipt){requireCondition(!ends.has(e.targetTick),'Overlapping player completions');ends.set(e.targetTick,e);ticks.add(e.targetTick);}
  }
  const config=snapshot.world;for(const stimulus of config.mindModel.config.stimuli)if(stimulus.tick<=snapshot.tick)ticks.add(stimulus.tick);
  for(const request of config.motivationModel.config.requests)if(request.tick<=snapshot.tick)ticks.add(request.tick);
  for(let day=1;day<=Math.floor(snapshot.tick/144);day++)ticks.add(day*144);
  // M4A: the public food quote is published at tick 1, so the replay must visit that tick too.
  if(profile.survival&&snapshot.tick>=1)ticks.add(1);
  const replay={world:createWorldFor(config.memoryModel.config,config.mindModel.config,config.motivationModel.config,
    profile.experience||profile.cognition?config.experienceModel.config:null,
    profile.cognition?config.cognitionModel.config:null,snapshot.simulationId,profile),simulationId:snapshot.simulationId};
  if(profile.experience)replay.commandReceipts=receipts;
  const rng=createRng(snapshot.rng.seed),rebuilt=[],seen=new Set();let nextSeq=1,registered=[];
  const expect=(fact,tick)=>{const event={...cloneData(fact),eventSeq:rebuilt.length+1,tick,schemaVersion:1};
    requireCondition(canonicalJson(events[rebuilt.length])===canonicalJson(event),`${profile.label} history disagrees with inputs/rules`);rebuilt.push(event);return event.eventSeq;};
  const checkReceipt=(id,input,applied,seqs)=>{const r=receipts[id];requireCondition(r&&!seen.has(id),`Missing or duplicate ${profile.label.toLowerCase()} receipt`);
    requireCondition(r.inputSeq===nextSeq++&&r.fingerprint===inputFingerprint(input)&&canonicalJson(r.input)===canonicalJson(input)&&r.status===(applied.success?'succeeded':'rejected')&&canonicalJson(r.result)===canonicalJson(applied.result)&&canonicalJson(r.eventSeqs)===canonicalJson(seqs),`${profile.label} receipt/authority mismatch`);seen.add(id);return r;};
  for(const tick of [...ticks].sort((a,b)=>a-b)){
    const append=f=>expect(f,tick),end=ends.get(tick);
    if(end){requireCondition(registered.length===1&&registered[0].commandId===end.commandId,'Missing player admission');registered=[];
      const applied=applyPlayerAction(replay.world,end);replay.world=applied.world;
      const seqs=applied.success?[append(playerActionFact(end,applied.result))]:[];
      const r=receipts[end.commandId];requireCondition(r.inputSeq<nextSeq&&r.status===(applied.success?'succeeded':'rejected')&&r.fingerprint===inputFingerprint(r.input)&&canonicalJson(r.result)===canonicalJson(applied.result)&&canonicalJson(r.eventSeqs)===canonicalJson(seqs),'Player outcome mismatch');seen.add(end.commandId);
    }
    if(tick>0){const commit=command=>{const input={type:command.type,payload:cloneData(command.payload),targetTick:command.targetTick};
      const applied=applyActionFor(replay.world,command.payload,command.payload.action==='Hunt'?rng.next():null,profile);replay.world=applied.world;
      return checkReceipt(command.commandId,input,applied,applied.success?[append(societyActionFact(command,applied.result))]:[]);};
      const context=beforeSystemsFor(replay,rebuilt,tick,append,commit,profile);
      if(tick%144===0){const daily=settleDayFor(replay.world,rng.next(),profile);replay.world=daily.world;
        append({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:societyCauses(rebuilt),payload:daily.payload});}
      afterSystemsFor(replay,rebuilt,tick,append,context,profile);
    }
    const start=starts.get(tick);if(start){requireCondition(registered.length===0&&start.inputSeq===nextSeq++&&canPlayerIntent(replay.world,{commandId:start.commandId,...start.payload.intent}),'Player registration mismatch');
      const {receipt,...input}=start;registered.push(input);}
  }
  requireCondition(rebuilt.length===events.length&&seen.size===Object.keys(receipts).length&&nextSeq===snapshot.nextInputSeq,`Unclaimed ${profile.label.toLowerCase()} history/receipt/input`);
  requireCondition(canonicalJson(registered)===canonicalJson(pending),`${profile.label} pending input mismatch`);
  requireCondition(canonicalJson(replay.world)===canonicalJson(snapshot.world),`${profile.label} final world/identity/assets mismatch`);
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),`${profile.label} RNG history mismatch`);
  if(profile.cognition)validateCognitionAnchors(snapshot,events,profile);
}

// A sealed cognition anchor must resolve to exactly one own review Planned fact with matching
// identity, tick and sequence. Self-described mode/anchor fields never prove this alone.
// M4A keeps the same proof; actor-2's anchors carry the survival prefix and actor-3 keeps the
// cognition prefix, so a cross-profile or cross-actor anchor fails here.
function validateCognitionAnchors(snapshot,events,profile){
  for(const actor of snapshot.world.cognitionModel.actors){
    if(actor.lastReviewDecisionId===null){
      requireCondition(actor.reviewState.lastReviewTick===null,'Cognition review without an anchor');
      continue;
    }
    if(profile.survival)requireCondition(
      actor.lastReviewDecisionId.startsWith(actor.actorId===SURVIVAL_ACTOR_ID?SURVIVAL_DECISION_PREFIX:'cognition-day-'),
      'Survival review anchor uses another profile prefix');
    const planned=events.filter(e=>e.type==='MotivationDecisionPlanned'&&e.payload?.decisionId===actor.lastReviewDecisionId);
    requireCondition(planned.length===1,'Cognition review anchor does not resolve to a unique planned decision');
    const fact=planned[0];
    requireCondition(fact.eventSeq===actor.lastReviewEventSeq&&fact.tick===actor.reviewState.lastReviewTick&&
      fact.payload.actorId===actor.actorId&&fact.payload.mode==='review'&&
      fact.payload.decisionId===actor.lastReviewDecisionId,'Cognition review anchor/decision mismatch');
    const evaluated=events.filter(e=>e.type==='CognitionReviewEvaluated'&&e.entityIds[0]===actor.actorId&&e.tick===fact.tick);
    requireCondition(evaluated.length===1&&evaluated[0].eventSeq<fact.eventSeq,'Cognition review anchor lacks its own evaluation');
  }
}

// Public connection signatures remain fixed; only data inputs are descriptor-checked.
function beforeSystems(snapshot,events,tick,append,commit){return beforeSystemsFor(snapshot,events,tick,append,commit,MOTIVATION_PROFILE);}
function afterSystems(snapshot,events,tick,append,context){return afterSystemsFor(snapshot,events,tick,append,context,MOTIVATION_PROFILE);}
function applyAction(input,payload,sample=null){return applyActionFor(input,payload,sample,MOTIVATION_PROFILE);}
function settleDay(input,sample){return settleDayFor(input,sample,MOTIVATION_PROFILE);}
function validateHistory(snapshot,events){return validateHistoryFor(snapshot,events,MOTIVATION_PROFILE);}

function experienceBeforeSystems(snapshot,events,tick,append,commit){
  inspectDescriptorTree({snapshot,events});
  return beforeSystemsFor(snapshot,events,tick,append,commit,EXPERIENCE_PROFILE);
}
function experienceAfterSystems(snapshot,events,tick,append,context){
  inspectDescriptorTree({snapshot,events});
  return afterSystemsFor(snapshot,events,tick,append,context,EXPERIENCE_PROFILE);
}
function experienceApplyAction(input,payload,sample=null){
  inspectDescriptorTree({input,payload,sample});
  return applyActionFor(input,payload,sample,EXPERIENCE_PROFILE);
}
function experienceSettleDay(input,sample){
  inspectDescriptorTree({input,sample});
  return settleDayFor(input,sample,EXPERIENCE_PROFILE);
}
function validateExperienceHistory(snapshot,events){
  inspectDescriptorTree({snapshot,events});
  return validateHistoryFor(snapshot,events,EXPERIENCE_PROFILE);
}

function cognitionBeforeSystems(snapshot,events,tick,append,commit){
  inspectDescriptorTree({snapshot,events});
  return beforeSystemsFor(snapshot,events,tick,append,commit,COGNITION_PROFILE);
}
function cognitionAfterSystems(snapshot,events,tick,append,context){
  inspectDescriptorTree({snapshot,events});
  return afterSystemsFor(snapshot,events,tick,append,context,COGNITION_PROFILE);
}
function cognitionApplyAction(input,payload,sample=null){
  inspectDescriptorTree({input,payload,sample});
  return applyActionFor(input,payload,sample,COGNITION_PROFILE);
}
function cognitionSettleDay(input,sample){
  inspectDescriptorTree({input,sample});
  return settleDayFor(input,sample,COGNITION_PROFILE);
}
function validateCognitionHistory(snapshot,events){
  inspectDescriptorTree({snapshot,events});
  return validateHistoryFor(snapshot,events,COGNITION_PROFILE);
}

export function executeCognitionPlayerIntent(bundle,intent){
  inspectDescriptorTree({bundle,intent});
  return executePlayerIntentFor(bundle,intent,COGNITION_PROFILE);
}

// M4A bounded survival: the same six hook signatures, the same DTO1 advance / DTO2 player-intent
// write surface, no new write interface.
function survivalBeforeSystems(snapshot,events,tick,append,commit){
  inspectDescriptorTree({snapshot,events});
  return beforeSystemsFor(snapshot,events,tick,append,commit,SURVIVAL_PROFILE);
}
function survivalAfterSystems(snapshot,events,tick,append,context){
  inspectDescriptorTree({snapshot,events});
  return afterSystemsFor(snapshot,events,tick,append,context,SURVIVAL_PROFILE);
}
function survivalApplyAction(input,payload,sample=null){
  inspectDescriptorTree({input,payload,sample});
  return applyActionFor(input,payload,sample,SURVIVAL_PROFILE);
}
function survivalSettleDay(input,sample){
  inspectDescriptorTree({input,sample});
  return settleDayFor(input,sample,SURVIVAL_PROFILE);
}
export function validateSurvivalHistory(snapshot,events){
  inspectDescriptorTree({snapshot,events});
  return validateHistoryFor(snapshot,events,SURVIVAL_PROFILE);
}
export function executeSurvivalPlayerIntent(bundle,intent){
  inspectDescriptorTree({bundle,intent});
  return executePlayerIntentFor(bundle,intent,SURVIVAL_PROFILE);
}
export function describeSurvivalPlayerActions(bundle){
  inspectDescriptorTree(bundle);auditFor(bundle,SURVIVAL_PROFILE);
  return describePlayerActionsFor(bundle);
}

// Scene base hooks use the same surviving cognition/experience rules, with an explicit memory-v6 opt-in.
export function validateSceneBaseWorld(world,sealed=true){inspectDescriptorTree(world);return validateWorldFor(world,sealed,SCENE_BASE_PROFILE);}
export const sceneBaseRuntimeHooks=createSceneBaseHooks(SCENE_BASE_PROFILE);
export const livelihoodBaseRuntimeHooks=createSceneBaseHooks(LIVELIHOOD_BASE_PROFILE);
export function validateLivelihoodBaseWorld(world,sealed=true){inspectDescriptorTree(world);return validateWorldFor(world,sealed,LIVELIHOOD_BASE_PROFILE);}
export const campaignBaseRuntimeHooks=createSceneBaseHooks(CAMPAIGN_BASE_PROFILE);
export function validateCampaignBaseWorld(world,sealed=true){inspectDescriptorTree(world);return validateWorldFor(world,sealed,CAMPAIGN_BASE_PROFILE);}
// A detached forecast for locomotion only. It reads the same own Knowledge and pure
// review/planners as the daily decision, at the next settlement boundary. No review
// state, proposed plan, decision ID or synthetic evaluation reference is committed.
// New facts, gifts and body changes can change the forecast before the real decision.
export function campaignSurvivalTravel(world,events,tick,simulationId){
  const actorId=SURVIVAL_ACTOR_ID,entry=entryOf(world,actorId);
  if(!body(world,actorId).alive)return {action:'NoAction',planId:null};
  const dayTick=Math.ceil(tick/144)*144;
  const knowledge=decisionKnowledge(world,events,actorId,dayTick,simulationId,CAMPAIGN_BASE_PROFILE);
  const model=world.cognitionModel,actor=model.actors.find(a=>a.actorId===actorId);
  const importance=model.config.profiles.find(p=>p.actorId===actorId).importancePermille;
  const signals=deriveActorSurvivalSignals(knowledge,importance,actor.signalBaseline,ownPreviousExecution(entry,simulationId));
  const {decision}=evaluateCognitiveReview(actor.reviewState,signals.input);
  const context={evaluationEventSeq:events.length+1,sourceReviewDecisionId:decision.mode==='maintain'?actor.lastReviewDecisionId:null,
    sourceReviewEventSeq:decision.mode==='maintain'?actor.lastReviewEventSeq:null};
  const proposed=decision.mode==='maintain'?continueSurvivalPlan(knowledge,context):planSurvivalDecision(knowledge,context,true);
  const action=['WorkForPay','BuyFood','Rest'].includes(proposed.decision.choice)?proposed.decision.choice:'NoAction';
  const owned=[entry.activePlan,entry.suspendedPlan].find(p=>p!==null&&p.planId===proposed.decision.planId);
  return {action,planId:owned?.planId??null};
}
function createSceneBaseHooks(profile){return Object.freeze({
 createWorld:(memory,mind,motivation,experience,cognition,simulationId)=>{inspectDescriptorTree({memory,mind,motivation,experience,cognition,simulationId});return createWorldFor(memory,mind,motivation,experience,cognition,simulationId,profile);},
 beforeSystems:(snapshot,events,tick,append,commit)=>{inspectDescriptorTree({snapshot,events});return beforeSystemsFor(snapshot,events,tick,append,commit,profile);},
 afterSystems:(snapshot,events,tick,append,context)=>{inspectDescriptorTree({snapshot,events});return afterSystemsFor(snapshot,events,tick,append,context,profile);},
 applyAction:(input,payload,sample=null,spatiallyRejected=false)=>{inspectDescriptorTree({input,payload,sample,spatiallyRejected});return applyActionFor(input,payload,sample,profile,spatiallyRejected);},
 settleDay:(input,sample)=>{inspectDescriptorTree({input,sample});return settleDayFor(input,sample,profile);},
 validateHistory:(snapshot,events)=>{inspectDescriptorTree({snapshot,events});return validateHistoryFor(snapshot,events,profile);}
});}
export const survivalRuntimeHooks=Object.freeze({createWorld:createSurvivalWorld,beforeSystems:survivalBeforeSystems,
  afterSystems:survivalAfterSystems,applyAction:survivalApplyAction,settleDay:survivalSettleDay,
  validateHistory:validateSurvivalHistory});

export const motivationRuntimeHooks=Object.freeze({createWorld,beforeSystems,afterSystems,applyAction,settleDay,validateHistory});
export const experienceRuntimeHooks=Object.freeze({createWorld:createExperienceWorld,beforeSystems:experienceBeforeSystems,afterSystems:experienceAfterSystems,applyAction:experienceApplyAction,settleDay:experienceSettleDay,validateHistory:validateExperienceHistory});
export const cognitionRuntimeHooks=Object.freeze({createWorld:createCognitionWorld,beforeSystems:cognitionBeforeSystems,afterSystems:cognitionAfterSystems,applyAction:cognitionApplyAction,settleDay:cognitionSettleDay,validateHistory:validateCognitionHistory});
