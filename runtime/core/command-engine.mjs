import { cloneBundle, validateBundle, validateSnapshotStructure } from './world-state.mjs';
import { restoreRng } from './rng.mjs';
import { restoreClock, MAX_ADVANCE_TICKS } from './simulation-clock.mjs';
import { advanceScheduler } from './scheduler.mjs';
import { validateFact } from './event-log.mjs';
import { RESOURCE_RULES, settleResourceDay } from './resource-ledger.mjs';
import { ECOLOGY_RULES, removePopulation, ecologyCauses, settleEcologyDay } from './ecology.mjs';
import { MARKET_RULES, applyMarketCommand, marketCommandFact, marketCauses, settleMarketDay } from './market.mjs';
import { commandInput, inputFingerprint, cloneData, canonicalJson, fields, record, denseArray, own, put, fault,
  requireCondition, integer, normalizeSystems, MAX_COLLECTION, MAX_EVENTS } from './data-contract.mjs';

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
  return performTick(bundle, systems, 'full');
}

function performTick(bundle, systems, mode) {
  let failedTick;
  let active = true;
  try {
    fields(bundle, ['snapshot', 'eventLog']); record(bundle.snapshot);
    if (mode === 'full') validateBundle(bundle, { rulesVersion: bundle.snapshot.rulesVersion, systems });
    const candidate = mode === 'full' ? cloneBundle(bundle) :
      { snapshot: cloneData(bundle.snapshot), eventLog: bundle.eventLog.slice() };
    const s = candidate.snapshot;
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
      let success, result, eventSeqs = [];
      if (rulesVersion === MARKET_RULES) {
        const applied = applyMarketCommand(s.world, { type: input.type, payload: input.payload });
        s.world = applied.world; success = applied.success; result = applied.result;
        if (success) eventSeqs = [append(marketCommandFact(input, result))];
      } else if (rulesVersion === ECOLOGY_RULES) {
        const removal = removePopulation(s.world, input.payload);
        s.world = removal.world; success = removal.success; result = removal.result;
        if (success) eventSeqs = [append({ type: 'PopulationRemoved', sourceSystem: 'command-engine', commandId: input.commandId,
          causationEventSeqs: [], entityIds: [result.species], payload: result })];
      } else {
        const { from, to, amount } = input.payload, balances = s.world.resources;
        success = from !== to && own(balances, from) && own(balances, to) && balances[from] >= amount && balances[to] <= Number.MAX_SAFE_INTEGER - amount;
        if (success) {
          balances[from] -= amount; balances[to] += amount; result = { from, to, amount };
          eventSeqs = [append({ type: 'ResourceTransferred', sourceSystem: 'command-engine', commandId: input.commandId,
            causationEventSeqs: [], entityIds: [from, to], payload: result })];
        } else result = { code: 'RULE_REJECTED' };
      }
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
      return canonicalJson({ ...protectedFields,
        ...([RESOURCE_RULES, ECOLOGY_RULES, MARKET_RULES].includes(rulesVersion) ? { resourceConfig: world.resourceModel.config } : {}),
        ...([ECOLOGY_RULES, MARKET_RULES].includes(rulesVersion) ? { ecologyConfig: world.ecologyModel.config } : {}),
        ...(rulesVersion === MARKET_RULES ? { marketConfig: world.marketModel.config } : {}) });
    };
    const beforeSystems = envelope(), previousEntityId = s.nextEntityId;
    for (const due of plan.dueTasks) {
      const context = { snapshot: s, rng,
        ...(rulesVersion === ECOLOGY_RULES ? { populationCauses: Object.freeze(ecologyCauses(candidate.eventLog)) } : {}),
        ...(rulesVersion === MARKET_RULES ? { populationCauses: Object.freeze(marketCauses(candidate.eventLog)) } : {}),
        emitFact(fact) { return append(validateFact(fact, due.systemId, rulesVersion)); } };
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
    if (mode === 'full') {
      validateBundle(candidate, { rulesVersion, systems }); return cloneBundle(candidate);
    }
    if (mode === 'session') {
      validateSnapshotStructure(s, { rulesVersion, systems }, candidate.eventLog.length);
      const expected = performTick(bundle, canonicalSystems(rulesVersion), 'proof');
      requireCondition(canonicalJson(s) === canonicalJson(expected.snapshot) &&
        canonicalJson(candidate.eventLog.slice(bundle.eventLog.length)) === canonicalJson(expected.eventLog.slice(bundle.eventLog.length)),
        'Session transition differs from registered rules');
    }
    return candidate;
  } catch (cause) {
    const error = new Error(`Tick ${failedTick ?? 'input'} was not committed`, { cause });
    if (cause.code) error.code = cause.code;
    error.failedTick = failedTick;
    throw error;
  } finally {
    active = false;
  }
}

function canonicalSystems(rulesVersion) {
  const define = (id, type, settle, usesRng) => ({ [id](ctx) {
    const result = usesRng ? settle(ctx.snapshot.world, ctx.rng.next()) : settle(ctx.snapshot.world);
    ctx.snapshot.world = result.world;
    ctx.emitFact({ type, sourceSystem: id, commandId: null, causationEventSeqs: ctx.populationCauses ?? [], entityIds: [], payload: result.payload });
  } });
  if (rulesVersion === RESOURCE_RULES) return define('resources', 'ResourceDaySettled', settleResourceDay, false);
  if (rulesVersion === ECOLOGY_RULES) return define('ecology', 'EcologyDaySettled', settleEcologyDay, true);
  if (rulesVersion === MARKET_RULES) return define('market', 'EconomyDaySettled', settleMarketDay, true);
  throw fault('UNSUPPORTED_VERSION', 'No canonical transition for these rules');
}

function freezeData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

export function createSimulationSession(bundle, systems) {
  normalizeSystems(systems);
  fields(bundle, ['snapshot', 'eventLog']); record(bundle.snapshot);
  const registered = Object.freeze({ ...systems });
  validateBundle(bundle, { rulesVersion: bundle.snapshot.rulesVersion, systems: registered });
  requireCondition(['a-smoke-v1', RESOURCE_RULES, ECOLOGY_RULES, MARKET_RULES].includes(bundle.snapshot.rulesVersion),
    'Session rules are not registered', 'UNSUPPORTED_VERSION');
  let current = freezeData(cloneBundle(bundle)), busy = false;
  const stats = { idleTicks: 0, activityTicks: 0 };
  return Object.freeze({
    advanceTicks(amount) {
      requireCondition(!busy, 'Session cannot be reentered'); integer(amount);
      requireCondition(amount <= MAX_ADVANCE_TICKS, 'Advance budget exceeded', 'LIMIT_EXCEEDED');
      const clock = restoreClock({ tick: current.snapshot.tick, tickMinutes: current.snapshot.tickMinutes });
      clock.advanceTicks(amount); const target = clock.tick;
      busy = true;
      try {
        while (current.snapshot.tick < target) {
          let nextActivity = Infinity;
          for (const command of current.snapshot.pendingCommands) nextActivity = Math.min(nextActivity, command.targetTick);
          for (const task of current.snapshot.scheduledTasks) nextActivity = Math.min(nextActivity, task.nextDueTick);
          const idleTarget = Math.min(target, nextActivity - 1);
          if (idleTarget > current.snapshot.tick) {
            const advanced = idleTarget - current.snapshot.tick;
            // Private unchanged history/world remain deeply frozen; no provider receives them.
            const snapshot = freezeData({ ...current.snapshot, tick: idleTarget, revision: idleTarget });
            current = Object.freeze({ snapshot, eventLog: current.eventLog }); stats.idleTicks += advanced;
          }
          if (current.snapshot.tick < target) {
            const mode = current.snapshot.rulesVersion === 'a-smoke-v1' ? 'full' : 'session';
            current = freezeData(performTick(current, registered, mode)); stats.activityTicks++;
          }
        }
        return { tick: current.snapshot.tick };
      } finally { busy = false; }
    },
    getBundle() {
      validateBundle(current, { rulesVersion: current.snapshot.rulesVersion, systems: registered });
      return cloneBundle(current);
    },
    getStats() { return { ...stats }; },
  });
}
