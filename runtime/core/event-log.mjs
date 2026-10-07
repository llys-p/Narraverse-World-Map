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
import { MEMORY_RULES,validateMemoryWorld,validateMemoryDayPayload,validateMemoryRuntimeHistory } from './memory-runtime.mjs';
import { validateMedicineAnnouncement } from './public-medicine.mjs';

// Returns only validated copies; the engine assigns sequence/tick/version.
export function validateFact(raw, systemId, rulesVersion = 'a-smoke-v1') {
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
  }else if([SOCIETY_RULES,MEMORY_RULES].includes(rulesVersion)){
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
  normalizeSystems(systems); denseArray(eventLog, MAX_EVENTS);
  record(snapshot);
  if (snapshot.rulesVersion === RESOURCE_RULES) {
    denseArray(eventLog, MAX_RESOURCE_DAYS); validateResourceWorld(snapshot.world);
  } else if (snapshot.rulesVersion === ECOLOGY_RULES) {
    denseArray(eventLog, MAX_RESOURCE_DAYS + 100000); validateEcologyWorld(snapshot.world);
  } else if (snapshot.rulesVersion === MARKET_RULES) {
    denseArray(eventLog, MAX_RESOURCE_DAYS + 100000); validateMarketWorld(snapshot.world);
  } else if (snapshot.rulesVersion===ACTOR_RULES) {
    denseArray(eventLog,MAX_RESOURCE_DAYS+100000);validateActorWorld(snapshot.world);
  }else if(snapshot.rulesVersion===HUNTER_RULES){
    denseArray(eventLog,MAX_RESOURCE_DAYS*2+100000);validateHunterWorld(snapshot.world);
  }else if(snapshot.rulesVersion===MEMORY_RULES){
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
  const memoryProfile=state.rulesVersion===MEMORY_RULES;
  const societyProfile=state.rulesVersion===SOCIETY_RULES || memoryProfile;
  const marketProfile = state.rulesVersion === MARKET_RULES || actorProfile || hunterProfile || societyProfile;
  if (!resourceProfile && !ecologyProfile && !marketProfile) fields(state.world, ['resources']);
  integer(state.tick); integer(state.nextEventSeq, 1);
  requireCondition(state.nextEventSeq === events.length + 1, 'Event counter mismatch');
  const commandEvents = new Map(), resourcePayloads = []; let previousTick = 0;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]; fields(event, EVENT_FIELDS);
    requireCondition(event.eventSeq === index + 1, 'Event sequence gap');
    integer(event.tick, 1);
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
      if(societyProfile && receipt.input.type==='SocietyAction'){
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
  if(memoryProfile)validateMemoryRuntimeHistory(state,events);
  else if(societyProfile)validateSocietyHistory(state,events);
  else if(hunterProfile)validateHunterHistory(state,events);
  else if (actorProfile) validateActorHistory(state,events);
  else if (marketProfile) validateMarketHistory(state, events);
}
