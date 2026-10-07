import { cloneBundle, validateBundle } from './world-state.mjs';
import { restoreRng } from './rng.mjs';
import { restoreClock } from './simulation-clock.mjs';
import { advanceScheduler } from './scheduler.mjs';
import { validateFact } from './event-log.mjs';
import { commandInput, inputFingerprint, cloneData, canonicalJson, fields, record, denseArray, own, put, fault,
  requireCondition, MAX_COLLECTION, MAX_EVENTS } from './data-contract.mjs';

export function lookupCommand(bundle, raw) {
  const input = commandInput(raw, false), fingerprint = inputFingerprint(input);
  const { snapshot } = cloneBundle(bundle);
  record(snapshot); denseArray(snapshot.pendingCommands); record(snapshot.commandReceipts);
  const queued = snapshot.pendingCommands.find((entry) => entry.commandId === input.commandId);
  const receipt = own(snapshot.commandReceipts, input.commandId) ? snapshot.commandReceipts[input.commandId] : undefined;
  if (queued || receipt) {
    requireCondition((queued ? inputFingerprint(queued) : receipt.fingerprint) === fingerprint, 'Command ID has different input', 'COMMAND_ID_CONFLICT');
    return queued ? { status: 'pending', inputSeq: queued.inputSeq } : cloneData(receipt);
  }
  return { status: 'not_found' };
}

export function advanceOneTick(bundle, systems) {
  let failedTick;
  let active = true;
  try {
    fields(bundle, ['snapshot', 'eventLog']); record(bundle.snapshot);
    validateBundle(bundle, { rulesVersion: bundle.snapshot.rulesVersion, systems });
    const candidate = cloneBundle(bundle), s = candidate.snapshot;
    const rulesVersion = s.rulesVersion;
    const clock = restoreClock({ tick: s.tick, tickMinutes: s.tickMinutes });
    clock.advanceTicks(1); failedTick = clock.tick;
    requireCondition(s.revision < Number.MAX_SAFE_INTEGER, 'Revision overflow', 'LIMIT_EXCEEDED');
    const rng = Object.freeze(restoreRng(s.rng));
    let nextEventSeq = s.nextEventSeq;
    let receiptCount = Object.keys(s.commandReceipts).length;
    const append = (fact) => {
      requireCondition(active, 'Tick context is closed');
      requireCondition(s.nextEventSeq === nextEventSeq, 'System rewrote event counter');
      requireCondition(candidate.eventLog.length < MAX_EVENTS && nextEventSeq < Number.MAX_SAFE_INTEGER, 'Event budget/counter exceeded', 'LIMIT_EXCEEDED');
      const eventSeq = nextEventSeq++;
      s.nextEventSeq = nextEventSeq;
      candidate.eventLog.push({ ...cloneData(fact), eventSeq, tick: failedTick, schemaVersion: 1 });
      return eventSeq;
    };
    const remaining = [];
    for (const input of s.pendingCommands) {
      if (input.targetTick !== failedTick) { remaining.push(input); continue; }
      requireCondition(receiptCount < MAX_COLLECTION, 'Receipt budget exceeded', 'LIMIT_EXCEEDED');
      const { from, to, amount } = input.payload, balances = s.world.resources;
      const success = from !== to && own(balances, from) && own(balances, to) && balances[from] >= amount &&
        balances[to] <= Number.MAX_SAFE_INTEGER - amount;
      let result, eventSeqs = [];
      if (success) {
        balances[from] -= amount; balances[to] += amount; result = { from, to, amount };
        eventSeqs = [append({ type: 'ResourceTransferred', sourceSystem: 'command-engine', commandId: input.commandId,
          causationEventSeqs: [], entityIds: [from, to], payload: result })];
      } else result = { code: 'RULE_REJECTED' };
      put(s.commandReceipts, input.commandId, { inputSeq: input.inputSeq,
        input: { type: input.type, payload: cloneData(input.payload), targetTick: input.targetTick },
        fingerprint: inputFingerprint(input), status: success ? 'succeeded' : 'rejected', result, eventSeqs });
      receiptCount++;
    }
    s.pendingCommands = remaining;
    const plan = advanceScheduler({ currentTick: s.tick, tasks: s.scheduledTasks }, failedTick, Object.keys(systems));
    // Rules may change resources and allocate entity IDs, never rewrite the input/identity envelope.
    const envelope = () => {
      const { world, nextEntityId, nextEventSeq: eventCounter, ...protectedFields } = s;
      return canonicalJson(protectedFields);
    };
    const beforeSystems = envelope(), previousEntityId = s.nextEntityId;
    for (const due of plan.dueTasks) {
      const context = { snapshot: s, rng, emitFact(fact) { return append(validateFact(fact, due.systemId)); } };
      const returned = systems[due.systemId](context, Object.freeze({ ...due }));
      if (returned && typeof returned.then === 'function') {
        // Observe rejection so a rejected Promise does not escape as an unhandled host error.
        Promise.resolve(returned).catch(() => {});
        throw fault('INVALID_INPUT', 'Asynchronous systems are not supported');
      }
    }
    requireCondition(envelope() === beforeSystems, 'System changed protected snapshot fields');
    requireCondition(s.nextEventSeq === nextEventSeq, 'System rewrote event counter');
    requireCondition(s.nextEntityId <= Number.MAX_SAFE_INTEGER, 'Entity ID overflow', 'LIMIT_EXCEEDED');
    requireCondition(Number.isSafeInteger(s.nextEntityId) && s.nextEntityId >= previousEntityId, 'System reduced/invalidated entity ID counter');
    s.nextEventSeq = nextEventSeq;
    s.scheduledTasks = plan.scheduler.tasks; s.rng = rng.getState(); s.tick = failedTick; s.revision++;
    validateBundle(candidate, { rulesVersion, systems });
    return cloneBundle(candidate);
  } catch (cause) {
    const error = new Error(`Tick ${failedTick ?? 'input'} was not committed`, { cause });
    if (cause.code) error.code = cause.code;
    error.failedTick = failedTick;
    throw error;
  } finally {
    active = false;
  }
}
