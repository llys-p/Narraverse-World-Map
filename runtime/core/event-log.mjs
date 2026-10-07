import { cloneData, denseArray, fields, identifier, integer, normalizeSystems,
  own, record, commandInput, inputFingerprint, payloadBudget, requireCondition, MAX_EVENTS } from './data-contract.mjs';

const EVENT_FIELDS = ['eventSeq', 'tick', 'type', 'schemaVersion', 'sourceSystem',
  'commandId', 'causationEventSeqs', 'entityIds', 'payload'];
import { RESOURCE_RULES, MAX_RESOURCE_DAYS, validateResourceWorld, validateResourcePayload, validateResourceHistory } from './resource-ledger.mjs';

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
  }
  // Clone also rejects getters, hidden properties and non-JSON values in this public entry.
  const events = cloneData(eventLog), state = cloneData(snapshot);
  record(state); record(state.commandReceipts); record(state.world); record(state.world.resources);
  const resourceProfile = state.rulesVersion === RESOURCE_RULES;
  if (!resourceProfile) fields(state.world, ['resources']);
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
    if (event.type === 'ResourceTransferred') {
      requireCondition(!resourceProfile, 'B1 forbids cross-unit transfer facts');
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
      fields(receipt.result, ['from', 'to', 'amount']);
      const event = commandEvents.get(id);
      requireCondition(event && receipt.eventSeqs.length === 1 && receipt.eventSeqs[0] === event.eventSeq, 'Success receipt missing its fact');
      const { from, to, amount } = event.payload;
      requireCondition(event.tick === receipt.input.targetTick && receipt.input.type === 'TransferResource' &&
        receipt.input.payload.from === from && receipt.input.payload.to === to && receipt.input.payload.amount === amount &&
        receipt.result.from === from && receipt.result.to === to && receipt.result.amount === amount, 'Receipt/input/fact mismatch');
      commandEvents.delete(id);
    } else {
      fields(receipt.result, ['code']);
      requireCondition(receipt.result.code === 'RULE_REJECTED', 'Unknown rejection code');
      requireCondition(receipt.status === 'rejected' && receipt.eventSeqs.length === 0 && !commandEvents.has(id), 'Rejected receipt has a success fact');
    }
  }
  requireCondition(commandEvents.size === 0, 'Fact references missing receipt');
  if (resourceProfile) validateResourceHistory(state.world, resourcePayloads);
}
