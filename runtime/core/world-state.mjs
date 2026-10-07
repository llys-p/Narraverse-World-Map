import { createRng, restoreRng } from './rng.mjs';
import { restoreClock } from './simulation-clock.mjs';
import { createScheduler, restoreScheduler } from './scheduler.mjs';
import { validateEventLog } from './event-log.mjs';
import { RESOURCE_RULES, MAX_RESOURCE_DAYS, validateResourceWorld } from './resource-ledger.mjs';
import { ECOLOGY_RULES, validateEcologyWorld } from './ecology.mjs';
import { cloneData, fields, record, identifier, integer, denseArray, normalizeSystems,
  commandInput, inputFingerprint, requireCondition, fault, MAX_EVENTS } from './data-contract.mjs';

const SNAPSHOT_FIELDS = ['schemaVersion', 'rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion',
  'tick', 'tickMinutes', 'revision', 'rng', 'nextEntityId', 'nextEventSeq', 'nextInputSeq',
  'scheduledTasks', 'pendingCommands', 'commandReceipts', 'world'];

export function cloneBundle(bundle) {
  fields(bundle, ['snapshot', 'eventLog']);
  return cloneData(bundle);
}

function checkBudgets(snapshot, events) {
  record(snapshot);
  denseArray(events, MAX_EVENTS);
  denseArray(snapshot.scheduledTasks); denseArray(snapshot.pendingCommands);
  record(snapshot.commandReceipts); record(snapshot.world); record(snapshot.world.resources);
  if (snapshot.rulesVersion === RESOURCE_RULES) {
    denseArray(events, MAX_RESOURCE_DAYS); validateResourceWorld(snapshot.world);
  } else if (snapshot.rulesVersion === ECOLOGY_RULES) {
    denseArray(events, MAX_RESOURCE_DAYS + 100000); validateEcologyWorld(snapshot.world);
  }
}

export function validateBundle(bundle, options) {
  fields(options, ['rulesVersion', 'systems']); identifier(options.rulesVersion);
  normalizeSystems(options.systems); fields(bundle, ['snapshot', 'eventLog']);
  checkBudgets(bundle.snapshot, bundle.eventLog);
  const { snapshot: s, eventLog } = cloneBundle(bundle); fields(s, SNAPSHOT_FIELDS);
  requireCondition(s.schemaVersion === 2 && s.rulesVersion === options.rulesVersion, 'Unsupported snapshot/rules version', 'UNSUPPORTED_VERSION');
  for (const key of ['rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion']) identifier(s[key]);
  restoreClock({ tick: s.tick, tickMinutes: s.tickMinutes }); restoreRng(s.rng);
  integer(s.revision); requireCondition(s.revision === s.tick, 'Revision does not match committed tick');
  for (const key of ['nextEntityId', 'nextEventSeq', 'nextInputSeq']) integer(s[key], 1);
  restoreScheduler({ currentTick: s.tick, tasks: s.scheduledTasks }, Object.keys(options.systems));
  if (s.rulesVersion === RESOURCE_RULES) {
    validateResourceWorld(s.world);
    requireCondition(s.fixtureId === 'resource-village' && s.fixtureVersion === '1', 'Unknown resource fixture', 'UNSUPPORTED_VERSION');
    requireCondition(s.pendingCommands.length === 0 && Object.keys(s.commandReceipts).length === 0 && s.nextInputSeq === 1,
      'B1 does not accept cross-unit transfer commands');
    const day = Math.floor(s.tick / 144);
    requireCondition(s.world.resourceModel.day === day, 'Resource settlement clock mismatch');
    requireCondition(s.scheduledTasks.length === 1, 'B1 requires one daily resource task');
    const task = s.scheduledTasks[0];
    requireCondition(task.taskId === 'daily-resources' && task.systemId === 'resources' && task.intervalTicks === 144 &&
      task.priority === 10 && task.nextDueTick === (day + 1) * 144, 'Invalid B1 resource schedule');
  } else if (s.rulesVersion === ECOLOGY_RULES) {
    validateEcologyWorld(s.world);
    requireCondition(['ecology-village', 'ecology-deer-shock'].includes(s.fixtureId) && s.fixtureVersion === '1', 'Unknown ecology fixture', 'UNSUPPORTED_VERSION');
    const day = Math.floor(s.tick / 144), task = s.scheduledTasks[0];
    requireCondition(s.world.ecologyModel.day === day && s.scheduledTasks.length === 1 && task.taskId === 'daily-ecology' &&
      task.systemId === 'ecology' && task.intervalTicks === 144 && task.priority === 10 && task.nextDueTick === (day + 1) * 144, 'Invalid ecology settlement schedule');
  } else fields(s.world, ['resources']);
  for (const [id, balance] of Object.entries(s.world.resources)) { identifier(id); integer(balance); }
  const ids = new Set(), sequences = new Set(); let previousInput = 0;
  const remember = (id, sequence) => {
    identifier(id); integer(sequence, 1);
    requireCondition(!ids.has(id) && !sequences.has(sequence) && sequence < s.nextInputSeq, 'Repeated command/input sequence');
    ids.add(id); sequences.add(sequence);
  };
  for (const entry of s.pendingCommands) {
    fields(entry, ['commandId', 'inputSeq', 'targetTick', 'type', 'payload']);
    const { inputSeq, ...input } = entry; commandInput(input);
    requireCondition(input.type === (s.rulesVersion === ECOLOGY_RULES ? 'RemovePopulation' : 'TransferResource'), 'Command does not belong to this rules version');
    remember(entry.commandId, inputSeq);
    requireCondition(inputSeq > previousInput && entry.targetTick > s.tick, 'Out-of-order or expired pending input'); previousInput = inputSeq;
  }
  for (const [id, receipt] of Object.entries(s.commandReceipts)) {
    fields(receipt, ['inputSeq', 'input', 'fingerprint', 'status', 'result', 'eventSeqs']);
    fields(receipt.input, ['type', 'payload', 'targetTick']);
    commandInput({ commandId: id, ...receipt.input }); remember(id, receipt.inputSeq);
    requireCondition(receipt.input.type === (s.rulesVersion === ECOLOGY_RULES ? 'RemovePopulation' : 'TransferResource'), 'Receipt does not belong to this rules version');
    requireCondition(receipt.input.targetTick <= s.tick && receipt.fingerprint === inputFingerprint(receipt.input), 'Invalid receipt input/fingerprint');
    if (receipt.status === 'succeeded') {
      fields(receipt.result, s.rulesVersion === ECOLOGY_RULES ? ['species', 'amount', 'before', 'after'] : ['from', 'to', 'amount']);
    } else {
      requireCondition(receipt.status === 'rejected', 'Unknown receipt status');
      fields(receipt.result, ['code']); requireCondition(receipt.result.code === 'RULE_REJECTED', 'Unknown rejection code');
    }
  }
  // Cardinality + unique positive values below nextInputSeq proves a contiguous range.
  requireCondition(sequences.size === s.nextInputSeq - 1, 'Input sequence gap/counter mismatch');
  validateEventLog(eventLog, s, options.systems);
}

export function createInitialBundle(config, systems) {
  record(config);
  const worldField = [RESOURCE_RULES, ECOLOGY_RULES].includes(config.rulesVersion) ? 'world' : 'resources';
  fields(config, ['rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion', 'seed', worldField, 'scheduledTasks', 'commands']);
  normalizeSystems(systems); denseArray(config.commands); denseArray(config.scheduledTasks); record(config[worldField]);
  const c = cloneData(config);
  for (const key of ['rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion']) identifier(c[key]);
  const commands = [], seen = new Map(); let nextInputSeq = 1;
  for (const raw of c.commands) {
    const input = commandInput(raw), fingerprint = inputFingerprint(input);
    if (seen.has(input.commandId)) {
      if (seen.get(input.commandId) !== fingerprint) throw fault('COMMAND_ID_CONFLICT', 'Command ID has different input');
      continue;
    }
    seen.set(input.commandId, fingerprint); commands.push({ ...input, inputSeq: nextInputSeq++ });
  }
  const result = { snapshot: {
    schemaVersion: 2, rulesVersion: c.rulesVersion, simulationId: c.simulationId,
    fixtureId: c.fixtureId, fixtureVersion: c.fixtureVersion, tick: 0, tickMinutes: 10, revision: 0,
    rng: createRng(c.seed).getState(), nextEntityId: 1, nextEventSeq: 1, nextInputSeq,
    scheduledTasks: createScheduler({ tasks: c.scheduledTasks }, Object.keys(systems)).tasks,
    pendingCommands: commands, commandReceipts: {}, world: worldField === 'world' ? c.world : { resources: c.resources },
  }, eventLog: [] };
  validateBundle(result, { rulesVersion: c.rulesVersion, systems });
  return result;
}
