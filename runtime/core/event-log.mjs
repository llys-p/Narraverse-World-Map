import { cloneData, denseArray, fields, identifier, integer, normalizeSystems,
  own, record, commandInput, inputFingerprint, payloadBudget, canonicalJson, requireCondition, MAX_EVENTS } from './data-contract.mjs';

const EVENT_FIELDS = ['eventSeq', 'tick', 'type', 'schemaVersion', 'sourceSystem',
  'commandId', 'causationEventSeqs', 'entityIds', 'payload'];
import { RESOURCE_RULES, MAX_RESOURCE_DAYS, validateResourceWorld, validateResourcePayload, validateResourceHistory } from './resource-ledger.mjs';
import { ECOLOGY_RULES, validateEcologyPayload, validateEcologyWorld, validateEcologyHistory } from './ecology.mjs';
import { MARKET_RULES, validateMarketPayload, validateMarketWorld, validateMarketHistory } from './market.mjs';
import { ACTOR_RULES,validateActorPayload,validateActorWorld,validateActorHistory } from './actors.mjs';
import { HUNTER_RULES,validateHunterWorld,validateHunterActionResult,validateHunterPayload,validateHunterHistory } from './hunter.mjs';
import { SOCIETY_RULES,validateSocietyWorld,validateSocietyActionResult,validateSocietyPayload,validateSocietyHistory } from './society.mjs';
import { MEMORY_RULE_VERSIONS,isMemoryRules,validateMemoryWorld,validateMemoryDayPayload,validateMemoryRuntimeHistory } from './memory-runtime.mjs';
import { MIND_RULES,validateMindStimulusPayload,validateDecision,validateOutcome } from './mind-state.mjs';
import { validateMindRuntimeHistory,validateMindWorld } from './mind-runtime.mjs';
import { MOTIVATION_RULES,validateMotivationDecision,validateMotivationOutcome,validateExperienceMotivationDecision,
  validateCognitionMotivationDecision } from './motivation-state.mjs';
import { validateMotivationWorld,motivationRuntimeHooks,validateExperienceWorld,experienceRuntimeHooks,
  validateCognitionWorld,cognitionRuntimeHooks,validateSurvivalWorld,survivalRuntimeHooks } from './motivation-runtime.mjs';
import { EXPERIENCE_RULES, inspectDescriptorTree, preflightExperienceData } from './experience-state.mjs';
import { COGNITION_RULES } from './cognition-state.mjs';
import { SURVIVAL_RULES, SURVIVAL_FOOD_QUOTE_EVENT, SURVIVAL_WORK_OFFER_EVENT, MAX_SURVIVAL_EVIDENCE_REFS,
  validateSurvivalDecision, validateSurvivalOutcome, validateSurvivalFoodQuoteAnnouncement,
  validateSurvivalWorkOfferAnnouncement }
  from './survival-state.mjs';
import { COGNITIVE_REVIEW_STATE_VERSION, validateCognitiveReviewState } from './cognitive-review.mjs';
import { validateMedicineAnnouncement } from './public-medicine.mjs';
import { PLAYER_RULES,PLAY_RULES,validatePlayerDayPayload,validatePlayerActionResult } from './player-state.mjs';
import { ENCOUNTER_RULES, validateEncounterWorldState, encounterRuntimeHooks } from './encounter-runtime.mjs';

// Returns only validated copies; the engine assigns sequence/tick/version.
export function validateFact(raw, systemId, rulesVersion = 'a-smoke-v1') {
  if (rulesVersion === EXPERIENCE_RULES || rulesVersion === COGNITION_RULES || rulesVersion === SURVIVAL_RULES || rulesVersion === ENCOUNTER_RULES)
    inspectDescriptorTree(raw);
  const fact = cloneData(raw);
  fields(fact, ['type', 'sourceSystem', 'commandId', 'causationEventSeqs', 'entityIds', 'payload']);
  requireCondition(fact.sourceSystem === systemId && fact.commandId === null, 'System fact identity mismatch');
  denseArray(fact.entityIds); requireCondition(fact.entityIds.length === 0, 'Pulse has no entity IDs');
  denseArray(fact.causationEventSeqs, MAX_EVENTS);
  if (rulesVersion === RESOURCE_RULES) {
    requireCondition(fact.type === 'ResourceDaySettled' && systemId === 'resources', 'Invalid resource fact');
    validateResourcePayload(fact.payload);
    requireCondition(fact.causationEventSeqs.length === 0, 'B1 resource fact has no causal references');
  } else if (rulesVersion === ECOLOGY_RULES) {
    requireCondition(fact.type === 'EcologyDaySettled' && systemId === 'ecology', 'Invalid ecology fact');
    validateEcologyPayload(fact.payload);
  } else if (rulesVersion === MARKET_RULES) {
    requireCondition(fact.type === 'EconomyDaySettled' && systemId === 'market', 'Invalid market fact');
    validateMarketPayload(fact.payload);
  } else if (rulesVersion===ACTOR_RULES) {
    requireCondition(fact.type==='ActorDaySettled' && systemId==='actors','Invalid Actor fact');validateActorPayload(fact.payload);
  }else if(rulesVersion===HUNTER_RULES){
    requireCondition(fact.type==='HunterDaySettled' && systemId==='hunter','Invalid Hunter daily fact');validateHunterPayload(fact.payload);
  }else if ([SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES].includes(rulesVersion)) {
    requireCondition(fact.type==='SocietyDaySettled' && systemId==='society','Invalid Society daily fact');validateSocietyPayload(fact.payload);
  } else {
    requireCondition(fact.type === 'FixturePulse', 'Unknown system fact');
    fields(fact.payload, ['sample']);
    requireCondition(typeof fact.payload.sample === 'number' && fact.payload.sample >= 0 && fact.payload.sample < 1, 'Invalid decided sample');
  }
  payloadBudget(fact.payload);
  return fact;
}

export function validateEventLog(eventLog, snapshot, systems) {
  if (preflightExperienceData(snapshot)) inspectDescriptorTree(eventLog);
  normalizeSystems(systems); denseArray(eventLog, MAX_EVENTS);
  record(snapshot);
  if (snapshot.rulesVersion === RESOURCE_RULES) {
    denseArray(eventLog, MAX_RESOURCE_DAYS); validateResourceWorld(snapshot.world);
  } else if (snapshot.rulesVersion === ECOLOGY_RULES) {
    denseArray(eventLog, MAX_RESOURCE_DAYS + 100000); validateEcologyWorld(snapshot.world);
  } else if (snapshot.rulesVersion === MARKET_RULES) {
    denseArray(eventLog, MAX_RESOURCE_DAYS + 100000); validateMarketWorld(snapshot.world);
  } else if (snapshot.rulesVersion === MOTIVATION_RULES) {
    denseArray(eventLog,MAX_RESOURCE_DAYS*4+100000);validateMotivationWorld(snapshot.world);
  } else if (snapshot.rulesVersion === EXPERIENCE_RULES) {
    denseArray(eventLog,MAX_RESOURCE_DAYS*4+100000);validateExperienceWorld(snapshot.world);
  } else if (snapshot.rulesVersion === COGNITION_RULES) {
    denseArray(eventLog,MAX_RESOURCE_DAYS*4+100000);validateCognitionWorld(snapshot.world);
  } else if (snapshot.rulesVersion === SURVIVAL_RULES) {
    denseArray(eventLog,MAX_RESOURCE_DAYS*4+100000);validateSurvivalWorld(snapshot.world);
  } else if (snapshot.rulesVersion === ENCOUNTER_RULES) {
    denseArray(eventLog,MAX_EVENTS);const{encounterModel,...part}=snapshot.world;validateSurvivalWorld(part);
    validateEncounterWorldState(snapshot.world,{tick:snapshot.tick});
  } else if (snapshot.rulesVersion === MIND_RULES) {
    denseArray(eventLog, MAX_RESOURCE_DAYS*4 + 100000); validateMindWorld(snapshot.world);
  } else if (snapshot.rulesVersion===ACTOR_RULES) {
    denseArray(eventLog,MAX_RESOURCE_DAYS+100000);validateActorWorld(snapshot.world);
  }else if(snapshot.rulesVersion===HUNTER_RULES){
    denseArray(eventLog,MAX_RESOURCE_DAYS*2+100000);validateHunterWorld(snapshot.world);
  }else if(isMemoryRules(snapshot.rulesVersion)){
    denseArray(eventLog,MAX_RESOURCE_DAYS*4+100000);validateMemoryWorld(snapshot.world);
  }else if(snapshot.rulesVersion===SOCIETY_RULES){
    denseArray(eventLog,MAX_RESOURCE_DAYS*4+100000);validateSocietyWorld(snapshot.world);
  }
  // Clone also rejects getters, hidden properties and non-JSON values in this public entry.
  const events = cloneData(eventLog), state = cloneData(snapshot);
  record(state); record(state.commandReceipts); record(state.world); record(state.world.resources);
  const resourceProfile = state.rulesVersion === RESOURCE_RULES;
  const ecologyProfile = state.rulesVersion === ECOLOGY_RULES;
  const actorProfile=state.rulesVersion===ACTOR_RULES;
  const hunterProfile=state.rulesVersion===HUNTER_RULES;
  const mindProfile=state.rulesVersion===MIND_RULES;
  const cognitionProfile=state.rulesVersion===COGNITION_RULES;
  const survivalProfile=state.rulesVersion===SURVIVAL_RULES;
  const encounterProfile=state.rulesVersion===ENCOUNTER_RULES;
  // The encounter profile extends survival: it carries the same cognition/experience/motivation
  // models and publishes the same fact family, so it shares the survival gates. Legacy rules keep
  // their own gates unchanged.
  const survivalFamilyProfile=survivalProfile||encounterProfile;
  // Cognition keeps the M3-2 experience model in place, so experience facts still apply.
  const experienceProfile=state.rulesVersion===EXPERIENCE_RULES||cognitionProfile||survivalFamilyProfile;
  const motivationProfile=state.rulesVersion===MOTIVATION_RULES||experienceProfile;
  const memoryProfile=isMemoryRules(state.rulesVersion)||mindProfile||motivationProfile;
  const societyProfile=state.rulesVersion===SOCIETY_RULES || memoryProfile;
  const marketProfile = state.rulesVersion === MARKET_RULES || actorProfile || hunterProfile || societyProfile;
  if (!resourceProfile && !ecologyProfile && !marketProfile && !encounterProfile) fields(state.world, ['resources']);
  integer(state.tick); integer(state.nextEventSeq, 1);
  requireCondition(state.nextEventSeq === events.length + 1, 'Event counter mismatch');
  const commandEvents = new Map(), resourcePayloads = []; let previousTick = 0;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]; fields(event, EVENT_FIELDS);
    requireCondition(event.eventSeq === index + 1, 'Event sequence gap');
    // The encounter profile publishes one fact per accepted DTO3, including accepted zero-tick
    // commands taken before the world clock has ever moved, so tick 0 is a legal stamp there.
    // Legacy profiles keep their original floor of 1.
    integer(event.tick, encounterProfile ? 0 : 1);
    requireCondition(event.tick >= previousTick && event.tick <= state.tick, 'Invalid event tick');
    previousTick = event.tick;
    requireCondition(event.schemaVersion === 1, 'Unknown event schema version', 'UNSUPPORTED_VERSION');
    identifier(event.sourceSystem); denseArray(event.entityIds);
    denseArray(event.causationEventSeqs, MAX_EVENTS);
    let cause = 0;
    for (const sequence of event.causationEventSeqs) {
      integer(sequence, 1);
      requireCondition(sequence > cause && sequence < event.eventSeq, 'Invalid event causation'); cause = sequence;
    }
    payloadBudget(event.payload);
    if(['MedicalRequestAnnounced','MedicineOfferAnnounced'].includes(event.type)){
      requireCondition(memoryProfile && event.tick===event.payload.expiresTick,'Invalid announcement profile/clock');
      const {eventSeq,tick,schemaVersion,...fact}=event;validateMedicineAnnouncement(fact);
    }else if(event.type===SURVIVAL_FOOD_QUOTE_EVENT){
      // Local public food observations: no command/entity, at most once on each allowed tick.
      const {eventSeq,tick,schemaVersion,...fact}=event;validateSurvivalFoodQuoteAnnouncement(fact);
      requireCondition(survivalFamilyProfile && (event.tick===1||event.tick%144===0),'Invalid survival food quote profile/clock');
      requireCondition(events.filter(e=>e.type===SURVIVAL_FOOD_QUOTE_EVENT&&e.tick===event.tick).length===1,'Repeated survival food quote at one tick');
    }else if(event.type===SURVIVAL_WORK_OFFER_EVENT){
      const {eventSeq,tick,schemaVersion,...fact}=event;validateSurvivalWorkOfferAnnouncement(fact);
      requireCondition(survivalFamilyProfile,'Invalid survival work offer profile');
      // The offer must be published on the same tick as the delivered request it cites, for
      // this same actor and with the same expiry.
      const delivered=events.find(e=>e.eventSeq===event.causationEventSeqs[0]);
      requireCondition(delivered && delivered.type==='MotivationRequestResolved' && delivered.tick===event.tick &&
        delivered.payload.requestId===event.payload.requestId && delivered.payload.listenerId===event.payload.actorId &&
        delivered.payload.expiresTick===event.payload.expiresTick,'Survival work offer does not match its delivered request');
      requireCondition(events.filter(e=>e.type===SURVIVAL_WORK_OFFER_EVENT && e.payload.requestId===event.payload.requestId).length===1,
        'Repeated survival work offer for one request');
    }else if(event.type==='PlayerActionCommitted'){
      requireCondition([PLAY_RULES,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES].includes(state.rulesVersion) && event.sourceSystem==='command-engine' && event.entityIds.length===1 && event.entityIds[0]==='actor-4' && event.causationEventSeqs.length===0,'Invalid player action source');
      identifier(event.commandId);validatePlayerActionResult(event.payload);requireCondition(event.tick===event.payload.endTick && !commandEvents.has(event.commandId),'Invalid player action clock/duplicate');commandEvents.set(event.commandId,event);
    }else if(event.type==='PlayerDaySettled'){
      requireCondition([PLAYER_RULES,PLAY_RULES,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES].includes(state.rulesVersion) && event.sourceSystem==='society' && event.commandId===null && event.entityIds.length===0 && event.causationEventSeqs.length===0,'Invalid player daily source');
      validatePlayerDayPayload(event.payload);requireCondition(event.tick===event.payload.day*144,'Player closing clock mismatch');
    }else if(event.type==='MindStimulusResolved'){
      requireCondition((mindProfile||motivationProfile) && event.sourceSystem==='mind' && event.commandId===null && event.causationEventSeqs.length===0,'Invalid mind stimulus fact source');
      validateMindStimulusPayload(event.payload);
      requireCondition(event.entityIds.length===1 && event.entityIds[0]===event.payload.listenerId,'Mind stimulus identity mismatch');
    }else if(event.type==='CognitionReviewEvaluated'){
      requireCondition((cognitionProfile||survivalFamilyProfile) && event.sourceSystem==='cognition' && event.commandId===null &&
        event.entityIds.length===1 && event.causationEventSeqs.length===0,'Invalid cognition review source');
      const p=event.payload;
      record(p);fields(p,['actorId','input','decision']);
      requireCondition(p.actorId===event.entityIds[0] && event.tick%144===0,'Cognition review identity/clock mismatch');
      const decision=p.decision;
      record(decision);
      requireCondition(decision.tick===event.tick && decision.actorId===p.actorId,'Cognition review decision identity mismatch');
      // Reuse the frozen kernel's own state validator: it re-checks the input shape and the
      // complete decision/input correspondence instead of trusting stored fields.
      validateCognitiveReviewState({version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:state.simulationId,
        actorId:p.actorId,lastEvaluation:{input:p.input,decision},
        lastReviewTick:decision.nextReviewTick===null?null:decision.nextReviewTick-decision.intervalTicks});
    }else if(event.type.startsWith('Motivation')){
      requireCondition(motivationProfile&&event.sourceSystem==='motivation'&&event.entityIds.length===1,'Invalid motivation fact source');
      if(event.type==='MotivationDecisionPlanned'){
        // Under the survival rules actor-2 carries the survival decision and actor-3 keeps the
        // frozen cognition decision; the actor identity, not the profile alone, selects it.
        if(survivalFamilyProfile&&event.entityIds[0]==='actor-2')validateSurvivalDecision(event.payload);
        else if(cognitionProfile||survivalFamilyProfile)validateCognitionMotivationDecision(event.payload);
        else if(experienceProfile)validateExperienceMotivationDecision(event.payload);
        else validateMotivationDecision(event.payload);
        requireCondition(event.commandId===null&&event.entityIds[0]===event.payload.actorId&&event.tick===event.payload.tick&&canonicalJson(event.causationEventSeqs)===canonicalJson(event.payload.evidenceRefs),'Invalid motivation planned provenance');
      }else if(event.type==='MotivationDecisionResolved'){
        if(survivalFamilyProfile&&event.entityIds[0]==='actor-2')validateSurvivalOutcome(event.payload);
        else validateMotivationOutcome(event.payload);
        requireCondition(event.entityIds[0]===event.payload.actorId&&event.commandId===event.payload.commandId&&event.causationEventSeqs.length===1,'Invalid motivation resolved provenance');
      }else if(event.type==='MotivationRequestResolved'){
        fields(event.payload,['requestId','speakerId','listenerId','urgencyPermille','expiresTick','status']);
        requireCondition(event.commandId===null&&event.causationEventSeqs.length===0&&event.entityIds[0]===event.payload.listenerId,'Invalid motivation request provenance');
      }else{
        requireCondition(event.type==='MotivationPlanSettled'&&event.commandId===null,'Unknown motivation fact');
        fields(event.payload,['actorId','decisionId','currentGoalId','lastDuty','lastReviewedDutyId','activePlan','suspendedPlan','transitions']);
        denseArray(event.payload.transitions,8);requireCondition(event.entityIds[0]===event.payload.actorId,'Invalid motivation settlement actor');
      }
    }else if(event.type==='ExperienceWorkObserved'){
      requireCondition(experienceProfile && event.sourceSystem==='experience' && event.entityIds.length===1,'Invalid experience fact source');
      identifier(event.commandId);
      denseArray(event.causationEventSeqs, 1);
      requireCondition(event.causationEventSeqs.length===1,'Experience observation must cite exactly one cause');
      const causeSeq=event.causationEventSeqs[0];
      const p=event.payload;
      record(p);
      fields(p,['actorId','sourceEventSeq','experienceView']);
      requireCondition(p.actorId===event.entityIds[0],'Observation payload actorId mismatch with entityIds');
      requireCondition(p.sourceEventSeq===causeSeq,'Observation sourceEventSeq mismatch with causationEventSeq');
      const view=p.experienceView;
      record(view);
      fields(view,['version','simulationId','actorId','topic','sampleCount','failureCount','penaltyPermille','evidenceRefs']);
      requireCondition(view.version==='work-experience-view-v1','Invalid experience view version');
      requireCondition(view.simulationId===state.simulationId,'Experience view simulationId mismatch');
      requireCondition(view.actorId===p.actorId,'Experience view actorId mismatch');
      requireCondition(view.topic==='work-for-pay-execution','Invalid experience view topic');
      integer(view.sampleCount);
      requireCondition(view.sampleCount<=4,'Sample count exceeds limit');
      integer(view.failureCount);
      requireCondition(view.failureCount<=view.sampleCount,'Failure count exceeds sample count');
      denseArray(view.evidenceRefs,4);
      requireCondition(view.evidenceRefs.length===view.sampleCount,'Evidence refs length must equal sample count');
      let prevRef=0;
      for(const ref of view.evidenceRefs){
        integer(ref,1);
        requireCondition(ref>prevRef && ref<=causeSeq,'Unordered or future evidence ref in experience view');
        prevRef=ref;
      }
      requireCondition(view.penaltyPermille===Math.min(300,100*view.failureCount),'Penalty permille mismatch');
    }else if(event.type==='MindDecisionPlanned'){
      requireCondition(mindProfile && event.sourceSystem==='mind' && event.commandId===null,'Invalid mind decision fact source');
      validateDecision(event.payload);
      requireCondition(event.entityIds.length===1 && event.entityIds[0]===event.payload.actorId && event.payload.tick===event.tick &&
        canonicalJson(event.causationEventSeqs)===canonicalJson(event.payload.evidenceRefs),'Mind decision identity/causation mismatch');
    }else if(event.type==='MindDecisionResolved'){
      requireCondition(mindProfile && event.sourceSystem==='mind' && event.causationEventSeqs.length===1,'Invalid mind outcome fact source');
      if(event.commandId!==null)identifier(event.commandId);
      validateOutcome(event.payload);
      requireCondition(event.entityIds.length===1 && event.entityIds[0]===event.payload.actorId,'Mind outcome identity mismatch');
    }else if(event.type==='MemoryDaySettled'){
      requireCondition(memoryProfile && event.sourceSystem==='society' && event.commandId===null && event.entityIds.length===0,'Invalid Memory closing source');
      validateMemoryDayPayload(event.payload);requireCondition(event.tick===event.payload.day*144,'Memory closing clock mismatch');
    }else if(event.type==='SocietyActionCommitted'){
      requireCondition(societyProfile && event.sourceSystem==='command-engine','Invalid Society action source');identifier(event.commandId);validateSocietyActionResult(event.payload);
      const ids=event.payload.action==='SellMedicine'?[event.payload.actorId,event.payload.buyerId]:[event.payload.actorId];
      requireCondition(canonicalJson(ids)===canonicalJson(event.entityIds) && event.causationEventSeqs.length===0 && !commandEvents.has(event.commandId),'Invalid Society links/duplicate');
      commandEvents.set(event.commandId,event);
    }else if(event.type==='HunterActionCommitted'){
      requireCondition(hunterProfile && event.sourceSystem==='command-engine','Invalid Hunter action fact provenance');identifier(event.commandId);
      validateHunterActionResult(event.payload);
      requireCondition(event.entityIds.length===1 && event.entityIds[0]===event.payload.actorId && event.causationEventSeqs.length===0 && !commandEvents.has(event.commandId),'Invalid Hunter action links/duplicate');
      commandEvents.set(event.commandId,event);
    }else if (event.type === 'TradeRouteSet') {
      requireCondition(marketProfile && event.sourceSystem === 'command-engine', 'Invalid route profile/source');
      fields(event.payload, ['before', 'open']); identifier(event.commandId);
      requireCondition(typeof event.payload.before === 'boolean' && typeof event.payload.open === 'boolean' &&
        event.entityIds.length === 0 && event.causationEventSeqs.length === 0, 'Invalid route fact');
      requireCondition(!commandEvents.has(event.commandId), 'Repeated route fact'); commandEvents.set(event.commandId, event);
    } else if (event.type === 'PopulationRemoved') {
      requireCondition((ecologyProfile || marketProfile) && event.sourceSystem === 'command-engine', 'Invalid population removal profile/source');
      fields(event.payload, ['species', 'amount', 'before', 'after']);
      const { species, amount, before, after } = event.payload;
      requireCondition(['deer', 'wolves'].includes(species), 'Unknown removed species');
      integer(amount, 1); integer(before); integer(after); identifier(event.commandId);
      requireCondition(before - amount === after && event.entityIds.length === 1 && event.entityIds[0] === species && event.causationEventSeqs.length === 0, 'Invalid population removal fact');
      requireCondition(!commandEvents.has(event.commandId), 'Repeated population removal'); commandEvents.set(event.commandId, event);
    } else if (event.type === 'ResourceTransferred') {
      requireCondition(!resourceProfile && !ecologyProfile && !marketProfile, 'Business rules forbid cross-unit transfer facts');
      fields(event.payload, ['from', 'to', 'amount']);
      const { from, to, amount } = event.payload;
      identifier(from); identifier(to); integer(amount, 1); identifier(event.commandId);
      requireCondition(event.sourceSystem === 'command-engine' && from !== to &&
        own(state.world.resources, from) && own(state.world.resources, to), 'Invalid transfer source or entities');
      requireCondition(event.entityIds.length === 2 && event.entityIds[0] === from && event.entityIds[1] === to, 'Transfer entity IDs mismatch');
      requireCondition(!commandEvents.has(event.commandId), 'Repeated transfer fact');
      commandEvents.set(event.commandId, event);
    } else if (event.type === 'EncounterCommandResolved') {
      // D3-5A L69: one resolved fact per accepted DTO3, published by the encounter
      // system. Its commandId is a DTO3 id (not an engine receipt id), so it must
      // not enter commandEvents; the journal correspondence is replayed in
      // encounterRuntimeHooks.validateHistory, not reconciled against state.commandReceipts.
      requireCondition(encounterProfile && event.sourceSystem === 'encounter',
        'Invalid encounter resolved fact source');
      identifier(event.commandId);
      requireCondition(event.entityIds.length === 1 && event.entityIds[0] === 'actor-4',
        'Invalid encounter resolved entity');
      fields(event.payload, ['dto', 'receipt']);
      record(event.payload.dto); record(event.payload.receipt);
      requireCondition(event.payload.dto.commandId === event.commandId &&
        event.payload.receipt.commandId === event.commandId,
        'Encounter resolved identity mismatch');
    } else if (event.type === 'EncounterTerminated') {
      // D3-5A L71: the settlement-death fact. commandId is null and the single cause is
      // the killing SocietyDaySettled on the death tick (the "real day causation").
      requireCondition(encounterProfile && event.sourceSystem === 'encounter' && event.commandId === null,
        'Invalid encounter terminated fact source');
      requireCondition(event.entityIds.length === 1 && event.entityIds[0] === 'actor-4',
        'Invalid encounter terminated entity');
      fields(event.payload, ['encounterId', 'actorId', 'reason', 'deathTick', 'wolfHealth',
        'reservedBefore', 'reservedAfter']);
      requireCondition(event.payload.reason === 'player-died' && event.payload.actorId === 'actor-4' &&
        event.payload.reservedBefore === 1 && event.payload.reservedAfter === 0,
        'Invalid encounter terminated payload');
      requireCondition(event.causationEventSeqs.length === 1,
        'Encounter terminated must cite exactly one cause');
      const terminatingCause = events.find((e) => e.eventSeq === event.causationEventSeqs[0]);
      requireCondition(terminatingCause !== undefined && terminatingCause.type === 'SocietyDaySettled' &&
        terminatingCause.tick === event.tick,
        'Encounter terminated cause must be the killing settlement');
    } else {
      requireCondition(own(systems, event.sourceSystem), 'Unknown fact system');
      const { eventSeq, tick, schemaVersion, ...fact } = event;
      validateFact(fact, event.sourceSystem, state.rulesVersion);
      if (resourceProfile) {
        requireCondition(event.tick === event.payload.day * 144, 'Resource fact is not on its daily boundary');
        resourcePayloads.push(event.payload);
      }
    }
  }
  for (const [id, receipt] of Object.entries(state.commandReceipts)) {
    fields(receipt, ['inputSeq', 'input', 'fingerprint', 'status', 'result', 'eventSeqs']);
    fields(receipt.input, ['type', 'payload', 'targetTick']); record(receipt.input.payload); record(receipt.result);
    commandInput({ commandId: id, ...receipt.input });
    requireCondition(receipt.fingerprint === inputFingerprint(receipt.input), 'Receipt fingerprint mismatch');
    denseArray(receipt.eventSeqs, MAX_EVENTS);
    if (receipt.status === 'succeeded') {
      const event = commandEvents.get(id);
      requireCondition(event && receipt.eventSeqs.length === 1 && receipt.eventSeqs[0] === event.eventSeq, 'Success receipt missing its fact');
      if([PLAY_RULES,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES].includes(state.rulesVersion) && receipt.input.type==='PlayerAction'){
        validatePlayerActionResult(receipt.result);requireCondition(event.tick===receipt.input.targetTick && event.type==='PlayerActionCommitted' && canonicalJson(event.payload)===canonicalJson(receipt.result),'Player input/receipt/fact mismatch');
      }else if(societyProfile && receipt.input.type==='SocietyAction'){
        validateSocietyActionResult(receipt.result);
        requireCondition(event.tick===receipt.input.targetTick && event.type==='SocietyActionCommitted' &&
          event.payload.actorId===receipt.input.payload.actorId && event.payload.goalId===receipt.input.payload.goalId && event.payload.action===receipt.input.payload.action &&
          event.payload.targetActorId===receipt.input.payload.targetActorId && canonicalJson(receipt.result)===canonicalJson(event.payload),'Society input/receipt/fact mismatch');
      }else if(hunterProfile && receipt.input.type==='ActorAction'){
        validateHunterActionResult(receipt.result);
        requireCondition(event.tick===receipt.input.targetTick && event.type==='HunterActionCommitted' &&
          event.payload.actorId===receipt.input.payload.actorId && event.payload.goalId===receipt.input.payload.goalId && event.payload.action===receipt.input.payload.action &&
          canonicalJson(receipt.result)===canonicalJson(event.payload),'Hunter input/receipt/fact mismatch');
      }else if (marketProfile && receipt.input.type === 'SetTradeRoute') {
        fields(receipt.result, ['before', 'open']);
        requireCondition(event.tick === receipt.input.targetTick && event.type === 'TradeRouteSet' &&
          receipt.input.payload.open === event.payload.open && canonicalJson(receipt.result) === canonicalJson(event.payload), 'Route receipt/input/fact mismatch');
      } else if (ecologyProfile || marketProfile) {
        fields(receipt.result, ['species', 'amount', 'before', 'after']);
        requireCondition(event.tick === receipt.input.targetTick && event.type === 'PopulationRemoved' && receipt.input.type === 'RemovePopulation' &&
          receipt.input.payload.species === event.payload.species && receipt.input.payload.amount === event.payload.amount &&
          canonicalJson(receipt.result) === canonicalJson(event.payload), 'Removal receipt/input/fact mismatch');
      } else {
        fields(receipt.result, ['from', 'to', 'amount']);
        const { from, to, amount } = event.payload;
        requireCondition(event.tick === receipt.input.targetTick && receipt.input.type === 'TransferResource' &&
        receipt.input.payload.from === from && receipt.input.payload.to === to && receipt.input.payload.amount === amount &&
        receipt.result.from === from && receipt.result.to === to && receipt.result.amount === amount, 'Receipt/input/fact mismatch');
      }
      commandEvents.delete(id);
    } else {
      fields(receipt.result, ['code']);
      requireCondition(receipt.result.code === 'RULE_REJECTED', 'Unknown rejection code');
      requireCondition(receipt.status === 'rejected' && receipt.eventSeqs.length === 0 && !commandEvents.has(id), 'Rejected receipt has a success fact');
    }
  }
  requireCondition(commandEvents.size === 0, 'Fact references missing receipt');
  if (resourceProfile) validateResourceHistory(state.world, resourcePayloads);
  if (ecologyProfile) validateEcologyHistory(state, events);
  if(encounterProfile)encounterRuntimeHooks.validateHistory(state,events);
  else if(survivalProfile)survivalRuntimeHooks.validateHistory(state,events);
  else if(cognitionProfile)cognitionRuntimeHooks.validateHistory(state,events);
  else if(experienceProfile)experienceRuntimeHooks.validateHistory(state,events);
  else if(motivationProfile)motivationRuntimeHooks.validateHistory(state,events);
  else if(mindProfile)validateMindRuntimeHistory(state,events);
  else if(memoryProfile)validateMemoryRuntimeHistory(state,events);
  else if(societyProfile)validateSocietyHistory(state,events);
  else if(hunterProfile)validateHunterHistory(state,events);
  else if (actorProfile) validateActorHistory(state,events);
  else if (marketProfile) validateMarketHistory(state, events);
}
