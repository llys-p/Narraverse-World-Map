/**
 * D3-5A — Encounter Runtime (runtime/core/encounter-runtime.mjs)
 *
 * Deterministic implementation of the playable encounter survival domain.
 * Hand-computed from the D3-5A contract; the RED contract test
 * (tests/simulation/encounter-runtime.test.mjs) is the authority.
 *
 * Dependencies: data-contract.mjs, motivation-runtime.mjs,
 * command-engine.mjs (performTick drives non-zero-tick world commands
 * through the real scheduler) and player-state.mjs (real PlayerAction
 * intent construction). The command-engine/world-state/motivation-runtime
 * import cycle already exists at module top level; top-level statements
 * here are definitions only, so no runtime cycle is introduced.
 *
 * Contract constants
 *   ENCOUNTER_RULES   = 'd-encounter-survival-v1'
 *   ENCOUNTER_PROFILE = 'encounter-survival-village'
 *   wolf             : maxHealth 300, player hit 150, wolf counter 80
 *   ticks            : begin 0, attack 6, flee 6, cancel 0
 *   budgets          : intent 4096 bytes, inputHistory 128 entries
 *
 * Rejection codes are closed sets:
 *   preflight : INVALID_INPUT | UNSUPPORTED_VERSION | LIMIT_EXCEEDED
 *   engine    : COMMAND_ID_CONFLICT | REVISION_CONFLICT | LIMIT_EXCEEDED
 *   encounter : RULE_REJECTED | ENCOUNTER_BUSY | ENCOUNTER_UNAVAILABLE |
 *               ENCOUNTER_ID_MISMATCH | ENCOUNTER_CLOSED | PLAYER_DEAD
 *
 * Every accepted command publishes exactly one `EncounterCommandResolved`
 * fact and exactly one `{ dto, receipt }` entry in
 * `world.encounterModel.inputHistory`. Domain rejections are accepted
 * commands: they consume zero ticks, bump `instantCommits` and are journalled.
 * Malformed or over-budget intents throw and publish nothing.
 */

import {
  canonicalJson,
  cloneData,
  fields,
  identifier,
  integer,
  record,
  requireCondition,
} from './data-contract.mjs';
import { TICKS_PER_DAY } from './simulation-clock.mjs';
import { MAX_RESOURCE_DAYS } from './resource-ledger.mjs';
import { createSurvivalWorld, survivalRuntimeHooks } from './motivation-runtime.mjs';
import { performTick, canonicalSystems } from './command-engine.mjs';
import { canPlayerIntent, playerIntentDuration } from './player-state.mjs';
import { createRng } from './rng.mjs';

// ---------------------------------------------------------------------------
// contract constants
// ---------------------------------------------------------------------------

export const ENCOUNTER_RULES = 'd-encounter-survival-v1';
export const ENCOUNTER_PROFILE = 'encounter-survival-village';

const MODEL_VERSION = 'encounter-runtime-v1';
const RECEIPT_API_VERSION = 1;
const RECEIPT_VERSION = 3;

const ACTOR_ID = 'actor-4';
const ENCOUNTER_LOCATION = 'forest';
const HOME_LOCATION = 'village';

const WOLF_MAX_HEALTH = 300;
const WOLF_HIT_DAMAGE = 150;
const WOLF_COUNTER_DAMAGE = 80;

const BEGIN_TICKS = 0;
const ATTACK_TICKS = 6;
const FLEE_TICKS = 6;
const CANCEL_TICKS = 0;

const TRAVEL_TICKS = 12;
const REST_TICKS = 6;
const TRADE_TICKS = 1;
const MAX_ADVANCE_TICKS = 144000;

const MAX_INPUT_HISTORY = 128;
const INTENT_BYTE_BUDGET = 4096;

const STATUS_ACTIVE = 'active';
const STATUS_CLOSED = 'closed';
const STATUS_NONE = 'none';
const STATUS_DOMAIN = [STATUS_ACTIVE, STATUS_CLOSED];

const RESOLUTION_DOMAIN = [null, 'win', 'lose', 'flee', 'cancel', 'player-died'];

const WOLF_HEALTH_DOMAIN = [300, 150, 0];
const ATTACK_COUNT_DOMAIN = [0, 1, 2];
const ELAPSED_TICKS_DOMAIN = [0, 6, 12];

const ACTION_ATTACK = 'attack';
const ACTION_FLEE = 'flee';
const ACTION_DOMAIN = [ACTION_ATTACK, ACTION_FLEE];

const TYPE_BEGIN = 'EncounterBegin';
const TYPE_ACTION = 'EncounterAction';
const TYPE_CANCEL = 'EncounterCancel';
const TYPE_DOMAIN = [TYPE_BEGIN, TYPE_ACTION, TYPE_CANCEL];

const TYPE_ADVANCE = 'AdvanceTime';
const TYPE_TRAVEL = 'PlayerTravel';
const TYPE_REST = 'PlayerRest';
const TYPE_BUY = 'PlayerBuy';
const TYPE_SELL = 'PlayerSell';

const TERMINATED_TYPE = 'EncounterTerminated';
const SETTLED_TYPE = 'SocietyDaySettled';

/** L89: during ACTIVE these world commands are refused as zero-tick domain rejections. */
const BLOCKED_WORLD_ACTIONS = Object.freeze([
  TYPE_ADVANCE,
  TYPE_TRAVEL,
  TYPE_REST,
  TYPE_BUY,
  TYPE_SELL,
]);

const WORLD_COMMAND_TYPES = Object.freeze([
  TYPE_ADVANCE,
  TYPE_BUY,
  TYPE_REST,
  TYPE_SELL,
  TYPE_TRAVEL,
]);

const FACT_TYPE = 'EncounterCommandResolved';
const SOURCE_SYSTEM = 'encounter';

const DTO_KEYS = Object.freeze([
  'commandId',
  'expectedRevision',
  'payload',
  'type',
  'version',
]);

const CURSOR_MODELS = Object.freeze([
  'mindModel',
  'motivationModel',
  'experienceModel',
  'cognitionModel',
]);

const ENCOUNTER_MODEL_KEYS = Object.freeze([
  'encounter',
  'inputHistory',
  'nextEncounterId',
  'version',
]);

const ENCOUNTER_KEYS = Object.freeze([
  'actorId',
  'attackCount',
  'beginCommandId',
  'elapsedTicks',
  'encounterId',
  'endTick',
  'initialPlayerHealth',
  'lastCommandId',
  'location',
  'reserved',
  'resolution',
  'startTick',
  'status',
  'wolfHealth',
]);

const RECEIPT_KEYS = Object.freeze([
  'apiVersion',
  'commandId',
  'durationTicks',
  'fromRevision',
  'fromTick',
  'outcome',
  'receiptVersion',
  'result',
  'status',
  'tick',
  'toRevision',
  'type',
]);

// ---------------------------------------------------------------------------
// small pure helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

function isIdentifier(value) {
  return typeof value === 'string' && value.length > 0;
}

function sortedKeysEqual(object, expected) {
  const keys = Object.keys(object).sort();
  if (keys.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (keys[index] !== expected[index]) return false;
  }
  return true;
}

function needsOf(actor) {
  return actor.alive === true
    ? { food: actor.hunger, healing: 1000 - actor.health, rest: actor.fatigue }
    : { food: 0, healing: 0, rest: 0 };
}

// ---------------------------------------------------------------------------
// world / model readers (the real bundle shape: bundle.snapshot.world)
// ---------------------------------------------------------------------------

function modelOf(world) {
  return isPlainObject(world) && isPlainObject(world.encounterModel) ? world.encounterModel : null;
}

function encounterOf(world) {
  const model = modelOf(world);
  return model && isPlainObject(model.encounter) ? model.encounter : null;
}

function activeEncounter(world) {
  const encounter = encounterOf(world);
  return encounter && encounter.status === STATUS_ACTIVE ? encounter : null;
}

/** The authoritative player body lives in world.actorModel.actors, keyed by actorId. */
function playerOf(world) {
  if (!isPlainObject(world) || !isPlainObject(world.actorModel) ||
    !Array.isArray(world.actorModel.actors)) {
    return null;
  }
  const player = world.actorModel.actors
    .find((actor) => isPlainObject(actor) && actor.actorId === ACTOR_ID);
  return isPlainObject(player) ? player : null;
}

function playerIsAlive(world) {
  const player = playerOf(world);
  return isPlainObject(player) && player.alive === true;
}

function findHistory(model, commandId) {
  if (!isPlainObject(model) || !Array.isArray(model.inputHistory)) return null;
  for (const entry of model.inputHistory) {
    if (isPlainObject(entry) && isPlainObject(entry.dto) && entry.dto.commandId === commandId) {
      return entry;
    }
  }
  return null;
}

function cloneSnapshotWith(snapshot, world) {
  const copy = {};
  for (const key of Object.keys(snapshot)) {
    if (key === 'world') continue;
    copy[key] = cloneData(snapshot[key]);
  }
  copy.world = world;
  return copy;
}

function cloneBundle(bundle) {
  return {
    snapshot: cloneData(bundle.snapshot),
    eventLog: bundle.eventLog.map((event) => cloneData(event)),
  };
}

// ---------------------------------------------------------------------------
// the ten-field encounter view carried by every before/after
// ---------------------------------------------------------------------------

function encounterView(world, tick) {
  const encounter = encounterOf(world);
  const ecology = isPlainObject(world.ecologyModel) ? world.ecologyModel : null;
  const populations = ecology && isPlainObject(ecology.populations) ? ecology.populations : null;
  const ledger = ecology && isPlainObject(ecology.ledger) ? ecology.ledger : null;
  const wolvesLedger = ledger && isPlainObject(ledger.wolves) ? ledger.wolves : null;
  const player = playerOf(world);
  const totalLivingWolves = populations && isInteger(populations.wolves) ? populations.wolves : 0;
  const reservedWolves = ecology && isInteger(ecology.reservedWolves) ? ecology.reservedWolves : 0;
  return {
    tick,
    playerHealth: player && isInteger(player.health) ? player.health : 0,
    playerAlive: isPlainObject(player) && player.alive === true,
    wolfHealth: encounter === null ? null : encounter.wolfHealth,
    totalLivingWolves,
    reservedWolves,
    availableWolves: totalLivingWolves - reservedWolves,
    battleDeaths: wolvesLedger && isInteger(wolvesLedger.battleDeaths) ? wolvesLedger.battleDeaths : 0,
    status: encounter === null ? STATUS_NONE : encounter.status,
    resolution: encounter === null ? null : encounter.resolution,
  };
}

// ---------------------------------------------------------------------------
// receipts
// ---------------------------------------------------------------------------

/**
 * The registered engine systems for one real tick under the encounter rules. Built
 * lazily at first use: command-engine imports this module, so calling
 * canonicalSystems at module top level would run before the cycle settles.
 */
let encounterSystemsCache = null;
function encounterSystems() {
  if (encounterSystemsCache === null) encounterSystemsCache = canonicalSystems(ENCOUNTER_RULES);
  return encounterSystemsCache;
}

/** Queues a real DTO3 world command as a legacy PlayerAction for the engine to commit. */
function enqueueWorldAction(working, dto, fromTick, targetTick) {
  const next = cloneBundle(working);
  next.snapshot.pendingCommands.push({
    commandId: dto.commandId,
    inputSeq: next.snapshot.nextInputSeq++,
    targetTick,
    type: 'PlayerAction',
    payload: { startTick: fromTick, intent: { type: dto.type, payload: cloneData(dto.payload) } },
  });
  return next;
}

/** Settlement and termination fact seqs appended during one command's real progression. */
function collectProgressionCauses(eventLog, startIndex) {
  const seqs = [];
  for (let index = startIndex; index < eventLog.length; index += 1) {
    const event = eventLog[index];
    if (isPlainObject(event) && isInteger(event.eventSeq) &&
      (event.type === SETTLED_TYPE || event.type === TERMINATED_TYPE)) {
      seqs.push(event.eventSeq);
    }
  }
  return seqs;
}

function makeReceipt(dto, base, outcome, result) {
  return {
    apiVersion: RECEIPT_API_VERSION,
    commandId: dto.commandId,
    durationTicks: base.durationTicks,
    fromRevision: base.fromRevision,
    fromTick: base.fromTick,
    outcome,
    receiptVersion: RECEIPT_VERSION,
    result,
    status: 'committed',
    tick: base.tick,
    toRevision: base.toRevision,
    type: dto.type,
  };
}

// ---------------------------------------------------------------------------
// encounter record construction
// ---------------------------------------------------------------------------

/**
 * Builds the 14-key encounter record. `wolfDied` is always derived from
 * wolfHealth by consumers and is never persisted here.
 */
function makeEncounter(spec) {
  return {
    encounterId: spec.encounterId,
    actorId: spec.actorId,
    location: spec.location,
    startTick: spec.startTick,
    endTick: spec.endTick,
    initialPlayerHealth: spec.initialPlayerHealth,
    wolfHealth: spec.wolfHealth,
    attackCount: spec.attackCount,
    elapsedTicks: spec.elapsedTicks,
    status: spec.status,
    resolution: spec.resolution,
    beginCommandId: spec.beginCommandId,
    lastCommandId: spec.lastCommandId,
    reserved: spec.reserved,
  };
}

// ---------------------------------------------------------------------------
// preflight (descriptor-first, then byte budget, then shape)
// ---------------------------------------------------------------------------

/**
 * Descriptor-first shape preflight.
 *
 * `record` and `fields` are descriptor-based: an accessor-bearing input is
 * refused before any getter can run. Only after the shape is proven is the
 * 4096 byte budget measured, so an oversized-but-well-formed intent reports
 * LIMIT_EXCEEDED while a malformed one reports INVALID_INPUT.
 */
function preflightIntent(dto) {
  record(dto);
  fields(dto, DTO_KEYS);

  const bytes = new TextEncoder().encode(canonicalJson(dto)).length;
  requireCondition(bytes <= INTENT_BYTE_BUDGET,
    `the intent exceeds the ${INTENT_BYTE_BUDGET} byte budget`, 'LIMIT_EXCEEDED');

  if (dto.version !== 3) {
    requireCondition(false, `unsupported command version ${String(dto.version)}`, 'UNSUPPORTED_VERSION');
  }

  identifier(dto.commandId);
  integer(dto.expectedRevision);
  identifier(dto.type);
  requireCondition(TYPE_DOMAIN.includes(dto.type) || WORLD_COMMAND_TYPES.includes(dto.type),
    `unknown command type ${String(dto.type)}`, 'INVALID_INPUT');

  const payload = dto.payload;
  record(payload);

  if (dto.type === TYPE_BEGIN) {
    fields(payload, []);
  } else if (dto.type === TYPE_ACTION) {
    fields(payload, ['action', 'encounterId']);
    requireCondition(ACTION_DOMAIN.includes(payload.action),
      'EncounterAction.action must be attack or flee', 'INVALID_INPUT');
    identifier(payload.encounterId);
  } else if (dto.type === TYPE_CANCEL) {
    fields(payload, ['encounterId']);
    identifier(payload.encounterId);
  } else if (dto.type === TYPE_ADVANCE) {
    fields(payload, ['ticks']);
    integer(payload.ticks, 1);
    requireCondition(payload.ticks <= MAX_ADVANCE_TICKS,
      `AdvanceTime.ticks must be at most ${MAX_ADVANCE_TICKS}`, 'INVALID_INPUT');
  } else if (dto.type === TYPE_TRAVEL) {
    fields(payload, ['destination']);
    requireCondition(payload.destination === HOME_LOCATION || payload.destination === ENCOUNTER_LOCATION,
      'PlayerTravel.destination must be village or forest', 'INVALID_INPUT');
  } else if (dto.type === TYPE_REST) {
    fields(payload, []);
  } else if (dto.type === TYPE_BUY || dto.type === TYPE_SELL) {
    fields(payload, ['product', 'quantity']);
    identifier(payload.product);
    integer(payload.quantity, 1);
  }
}

/** The canonical five-key DTO that is journalled and replayed. */
function canonicalInput(dto) {
  return {
    commandId: dto.commandId,
    expectedRevision: dto.expectedRevision,
    payload: cloneData(dto.payload),
    type: dto.type,
    version: dto.version,
  };
}

// ---------------------------------------------------------------------------
// candidate audit (pure; never mutates the input bundle)
// ---------------------------------------------------------------------------

function worldCommandTicks(dto) {
  if (dto.type === TYPE_ADVANCE) return dto.payload.ticks;
  if (dto.type === TYPE_TRAVEL) return TRAVEL_TICKS;
  if (dto.type === TYPE_REST) return REST_TICKS;
  if (dto.type === TYPE_BUY || dto.type === TYPE_SELL) return TRADE_TICKS;
  return 0;
}

/**
 * Decides the outcome of one intent without touching the bundle.
 * Rejections are returned, never thrown: a domain rejection is an accepted
 * command that consumes zero ticks and is journalled.
 */
function auditIntent(dto, world) {
  const model = modelOf(world);
  const encounter = encounterOf(world);
  const active = encounter && encounter.status === STATUS_ACTIVE ? encounter : null;
  const alive = playerIsAlive(world);
  const player = playerOf(world);
  const inForest = isPlainObject(player) && player.location === ENCOUNTER_LOCATION;

  if (dto.type === TYPE_BEGIN) {
    if (active !== null) {
      return { outcome: 'rejected', action: 'begin', reasonCode: 'ENCOUNTER_BUSY', encounterId: active.encounterId, durationTicks: 0 };
    }
    if (!alive) {
      return { outcome: 'rejected', action: 'begin', reasonCode: 'PLAYER_DEAD', encounterId: null, durationTicks: 0 };
    }
    if (!inForest) {
      return { outcome: 'rejected', action: 'begin', reasonCode: 'RULE_REJECTED', encounterId: null, durationTicks: 0 };
    }
    return {
      outcome: 'succeeded',
      action: 'begin',
      reasonCode: null,
      encounterId: `encounter-${model.nextEncounterId}`,
      durationTicks: BEGIN_TICKS,
    };
  }

  if (dto.type === TYPE_ACTION) {
    const requested = dto.payload.encounterId;
    const action = dto.payload.action;
    if (encounter === null) {
      return { outcome: 'rejected', action, reasonCode: 'ENCOUNTER_UNAVAILABLE', encounterId: requested, durationTicks: 0 };
    }
    if (encounter.status === STATUS_CLOSED) {
      return { outcome: 'rejected', action, reasonCode: 'ENCOUNTER_CLOSED', encounterId: requested, durationTicks: 0 };
    }
    if (requested !== encounter.encounterId) {
      return { outcome: 'rejected', action, reasonCode: 'ENCOUNTER_ID_MISMATCH', encounterId: requested, durationTicks: 0 };
    }
    if (!alive) {
      return { outcome: 'rejected', action, reasonCode: 'PLAYER_DEAD', encounterId: requested, durationTicks: 0 };
    }
    return {
      outcome: 'succeeded',
      action,
      reasonCode: null,
      encounterId: requested,
      durationTicks: action === ACTION_ATTACK ? ATTACK_TICKS : FLEE_TICKS,
    };
  }

  if (dto.type === TYPE_CANCEL) {
    const requested = dto.payload.encounterId;
    if (encounter === null) {
      return { outcome: 'rejected', action: 'cancel', reasonCode: 'ENCOUNTER_UNAVAILABLE', encounterId: requested, durationTicks: 0 };
    }
    if (encounter.status === STATUS_CLOSED) {
      return { outcome: 'rejected', action: 'cancel', reasonCode: 'ENCOUNTER_CLOSED', encounterId: requested, durationTicks: 0 };
    }
    if (requested !== encounter.encounterId) {
      return { outcome: 'rejected', action: 'cancel', reasonCode: 'ENCOUNTER_ID_MISMATCH', encounterId: requested, durationTicks: 0 };
    }
    return { outcome: 'succeeded', action: 'cancel', reasonCode: null, encounterId: requested, durationTicks: CANCEL_TICKS };
  }

  // world commands: refused as a whole while an encounter is ACTIVE
  if (active !== null) {
    return { outcome: 'rejected', worldCommand: true, reasonCode: 'ENCOUNTER_BUSY', durationTicks: 0 };
  }
  // L87: AdvanceTime is pure time; legacy intents are admitted only when the real
  // engine would admit them now (a refusal consumes zero ticks, never world time).
  if (dto.type !== TYPE_ADVANCE &&
    !canPlayerIntent(world, { commandId: dto.commandId, type: dto.type, payload: dto.payload })) {
    return { outcome: 'rejected', worldCommand: true, reasonCode: 'RULE_REJECTED', durationTicks: 0 };
  }
  return { outcome: 'succeeded', worldCommand: true, reasonCode: null, durationTicks: worldCommandTicks(dto) };
}

// ---------------------------------------------------------------------------
// candidate application (mutates only the freshly cloned world)
// ---------------------------------------------------------------------------

function applyAttack(nextWorld, dto, completionTick) {
  const model = nextWorld.encounterModel;
  const encounter = model.encounter;
  const player = playerOf(nextWorld);

  const wolfHealth = Math.max(0, encounter.wolfHealth - WOLF_HIT_DAMAGE);
  const wolfSurvives = wolfHealth > 0;
  const playerHealth = wolfSurvives
    ? Math.max(0, player.health - WOLF_COUNTER_DAMAGE)
    : player.health;
  const playerSurvives = playerHealth > 0;

  let status = STATUS_ACTIVE;
  let resolution = null;
  if (!playerSurvives) {
    status = STATUS_CLOSED;
    resolution = 'lose';
  } else if (!wolfSurvives) {
    status = STATUS_CLOSED;
    resolution = 'win';
  }

  model.encounter = makeEncounter({
    ...encounter,
    wolfHealth,
    attackCount: encounter.attackCount + 1,
    elapsedTicks: encounter.elapsedTicks + ATTACK_TICKS,
    lastCommandId: dto.commandId,
    status,
    resolution,
    endTick: status === STATUS_CLOSED ? completionTick : null,
    reserved: status === STATUS_ACTIVE,
  });

  player.health = playerHealth;
  if (playerSurvives) {
    player.needs = needsOf(player);
  } else {
    player.alive = false;
    player.deathTick = completionTick;
    player.lastNeedsTick = completionTick;
    player.needs = needsOf(player);
    nextWorld.actorModel.ledger.deaths += 1;
  }

  if (resolution === 'win') {
    nextWorld.ecologyModel.ledger.wolves.battleDeaths += 1;
    nextWorld.ecologyModel.populations.wolves -= 1;
    nextWorld.ecologyModel.reservedWolves = 0;
  } else if (resolution === 'lose') {
    nextWorld.ecologyModel.reservedWolves = 0;
  }
}

function applyIntent(nextWorld, dto, plan, completionTick) {
  if (plan.outcome !== 'succeeded') return;
  const model = nextWorld.encounterModel;

  if (dto.type === TYPE_BEGIN) {
    const player = playerOf(nextWorld);
    model.encounter = makeEncounter({
      encounterId: `encounter-${model.nextEncounterId}`,
      actorId: ACTOR_ID,
      location: ENCOUNTER_LOCATION,
      status: STATUS_ACTIVE,
      resolution: null,
      startTick: completionTick,
      endTick: null,
      initialPlayerHealth: player.health,
      wolfHealth: WOLF_MAX_HEALTH,
      attackCount: 0,
      elapsedTicks: 0,
      beginCommandId: dto.commandId,
      lastCommandId: dto.commandId,
      reserved: true,
    });
    model.nextEncounterId += 1;
    nextWorld.ecologyModel.reservedWolves = 1;
    return;
  }

  if (dto.type === TYPE_ACTION) {
    if (dto.payload.action === ACTION_ATTACK) {
      applyAttack(nextWorld, dto, completionTick);
      return;
    }
    const encounter = model.encounter;
    model.encounter = makeEncounter({
      ...encounter,
      elapsedTicks: encounter.elapsedTicks + FLEE_TICKS,
      lastCommandId: dto.commandId,
      status: STATUS_CLOSED,
      resolution: 'flee',
      endTick: completionTick,
      reserved: false,
    });
    nextWorld.ecologyModel.reservedWolves = 0;
    return;
  }

  if (dto.type === TYPE_CANCEL) {
    const encounter = model.encounter;
    model.encounter = makeEncounter({
      ...encounter,
      lastCommandId: dto.commandId,
      status: STATUS_CLOSED,
      resolution: 'cancel',
      endTick: completionTick,
      reserved: false,
    });
    nextWorld.ecologyModel.reservedWolves = 0;
    return;
  }

  if (dto.type === TYPE_TRAVEL) {
    const player = playerOf(nextWorld);
    player.location = dto.payload.destination;
    player.needs = needsOf(player);
  }
}

// ---------------------------------------------------------------------------
// the encounter command engine
// ---------------------------------------------------------------------------

function requireEncounterProfileMetadata(snapshot) {
  requireCondition(snapshot.rulesVersion === ENCOUNTER_RULES && snapshot.fixtureId === ENCOUNTER_PROFILE &&
    snapshot.fixtureVersion === '1' && snapshot.schemaVersion === 3,
  'Unsupported encounter profile', 'UNSUPPORTED_VERSION');
}

export function executeEncounterIntent(bundle, dto) {
  requireCondition(isPlainObject(bundle), 'bundle must be { snapshot, eventLog }', 'INVALID_INPUT');
  fields(bundle, ['eventLog', 'snapshot']);
  const snapshot = bundle.snapshot;
  requireCondition(isPlainObject(snapshot), 'bundle.snapshot must be an object', 'INVALID_INPUT');
  record(snapshot);
  preflightIntent(dto);
  requireEncounterProfileMetadata(snapshot);
  const world = snapshot.world;
  requireCondition(isPlainObject(world), 'bundle.snapshot.world must be an object', 'INVALID_INPUT');
  record(world);
  requireCondition(isPlainObject(world.encounterModel), 'world.encounterModel must be an object', 'INVALID_INPUT');
  const eventLog = bundle.eventLog;
  requireCondition(Array.isArray(eventLog), 'bundle.eventLog must be an array', 'INVALID_INPUT');

  const model = world.encounterModel;
  const commandId = dto.commandId;

  // Step 1 — commandId resolution: an identical replay is free and idempotent.
  const stored = findHistory(model, commandId);
  if (stored !== null) {
    requireCondition(canonicalJson(stored.dto) === canonicalJson(canonicalInput(dto)),
      `commandId ${commandId} was already used with a different input`, 'COMMAND_ID_CONFLICT');
    return { bundle: cloneBundle(bundle), receipt: cloneData(stored.receipt) };
  }

  // Step 2 — optimistic revision guard (a new id only).
  requireCondition(dto.expectedRevision === snapshot.revision,
    'expectedRevision does not match the current revision', 'REVISION_CONFLICT');

  // Step 3 — the input journal budget.
  requireCondition(model.inputHistory.length < MAX_INPUT_HISTORY,
    `the input history budget of ${MAX_INPUT_HISTORY} entries is exhausted`, 'LIMIT_EXCEEDED');

  // Step 4 — candidate audit (pure).
  const fromTick = snapshot.tick;
  const fromRevision = snapshot.revision;
  const plan = auditIntent(dto, world);
  const tick = fromTick + plan.durationTicks;
  const instantCommit = plan.durationTicks === 0;
  const toRevision = fromRevision + (instantCommit ? 1 : plan.durationTicks);
  const nextInstantCommits = snapshot.instantCommits + (instantCommit ? 1 : 0);

  // Step 5 — real progression (L87-92) through the registered engine ticks, then
  // atomic publication. A non-zero-duration command drives the world forward with
  // performTick so that mid-flight quotes, settlements and player deaths are real.
  const systems = encounterSystems();
  const initialEventCount = eventLog.length;
  let working = { snapshot: cloneData(snapshot), eventLog: eventLog.map((event) => cloneData(event)) };
  if (plan.outcome === 'succeeded' && !instantCommit && plan.worldCommand === true && dto.type !== TYPE_ADVANCE) {
    // The legacy intent commits inside its target tick, before that tick's settlement (L90).
    working = enqueueWorldAction(working, dto, fromTick, tick);
  }

  let midFlightDead = false;
  if (plan.outcome === 'succeeded' && !instantCommit && plan.worldCommand !== true) {
    // L91: the encounter effect lands at the completion tick *before* that tick's
    // settlement, so the world is advanced to completionTick-1 first, the action is
    // applied there, and the final tick settles the post-action world.
    for (let t = fromTick; t < tick - 1; t += 1) working = performTick(working, systems, 'session');
    if (playerIsAlive(working.snapshot.world)) {
      const actedWorld = cloneData(working.snapshot.world);
      applyIntent(actedWorld, dto, plan, tick);
      // L83: a combat death is observed by the memory observer in the same atomic
      // completion, so the observer/world life boundary stays aligned at every tick.
      if (!playerIsAlive(actedWorld)) {
        for (const observer of actedWorld.memoryModel.observer.actors) {
          observer.alive = actedWorld.actorModel.actors
            .some((actor) => isPlainObject(actor) && actor.actorId === observer.actorId && actor.alive === true);
        }
      }
      working = { snapshot: cloneSnapshotWith(working.snapshot, actedWorld), eventLog: working.eventLog };
      working = performTick(working, systems, 'session');
    } else {
      // L92: a settlement before completion killed the player — the action never lands,
      // but the clock still advances to the original target tick.
      midFlightDead = true;
      for (let t = working.snapshot.tick; t < tick; t += 1) working = performTick(working, systems, 'session');
    }
  } else if (plan.outcome === 'succeeded' && !instantCommit) {
    for (let t = fromTick; t < tick; t += 1) working = performTick(working, systems, 'session');
  }

  const finalSnapshot = working.snapshot;
  requireCondition(finalSnapshot.tick === tick, 'the real progression must end at the target tick', 'INVALID_INPUT');
  const nextWorld = cloneData(finalSnapshot.world);
  if (instantCommit) applyIntent(nextWorld, dto, plan, tick);

  let outcome = plan.outcome;
  let result;
  if (plan.worldCommand === true) {
    if (plan.outcome === 'succeeded' && dto.type === TYPE_ADVANCE) {
      result = null;
    } else if (plan.outcome === 'succeeded') {
      // L67: legacy world commands mirror the real engine outcome.
      const engineReceipt = finalSnapshot.commandReceipts[dto.commandId];
      if (engineReceipt && engineReceipt.status === 'rejected') {
        outcome = 'rejected';
        result = { code: 'RULE_REJECTED' };
      } else {
        result = engineReceipt ? cloneData(engineReceipt.result) : null;
      }
    } else {
      result = { code: plan.reasonCode };
    }
  } else {
    if (midFlightDead) { outcome = 'rejected'; }
    result = {
      actorId: ACTOR_ID,
      encounterId: plan.encounterId,
      action: plan.action,
      before: encounterView(world, fromTick),
      after: encounterView(nextWorld, tick),
      reasonCode: midFlightDead ? 'PLAYER_DEAD' : plan.reasonCode,
    };
  }

  const receipt = makeReceipt(
    dto,
    { durationTicks: plan.durationTicks, fromRevision, fromTick, tick, toRevision },
    outcome,
    result,
  );

  const historyDto = cloneData(canonicalInput(dto));
  const historyReceipt = cloneData(receipt);
  nextWorld.encounterModel.inputHistory.push({ dto: historyDto, receipt: historyReceipt });

  const progressionCauses = collectProgressionCauses(working.eventLog, initialEventCount);
  let causationEventSeqs = [];
  if ((dto.type === TYPE_ACTION || dto.type === TYPE_CANCEL) &&
    isPlainObject(nextWorld.encounterModel.encounter)) {
    const beginCommandId = nextWorld.encounterModel.encounter.beginCommandId;
    for (const event of eventLog) {
      if (isPlainObject(event) && event.commandId === beginCommandId &&
        isInteger(event.eventSeq)) {
        causationEventSeqs = [event.eventSeq];
        break;
      }
    }
    causationEventSeqs = [...causationEventSeqs, ...progressionCauses];
  }

  const eventSeq = finalSnapshot.nextEventSeq;
  const nextEventSeq = eventSeq + 1;
  for (const key of CURSOR_MODELS) {
    if (isPlainObject(nextWorld[key])) nextWorld[key].cursor = nextEventSeq - 1;
  }

  const event = {
    type: FACT_TYPE,
    sourceSystem: SOURCE_SYSTEM,
    commandId,
    entityIds: [ACTOR_ID],
    causationEventSeqs,
    payload: { dto: cloneData(canonicalInput(dto)), receipt: cloneData(receipt) },
    eventSeq,
    tick,
    schemaVersion: 1,
  };

  const nextSnapshot = cloneSnapshotWith(finalSnapshot, nextWorld);
  nextSnapshot.tick = tick;
  nextSnapshot.revision = toRevision;
  nextSnapshot.instantCommits = nextInstantCommits;
  nextSnapshot.nextEventSeq = nextEventSeq;

  return {
    bundle: { snapshot: nextSnapshot, eventLog: [...working.eventLog, event] },
    receipt,
  };
}

// ---------------------------------------------------------------------------
// capability description
// ---------------------------------------------------------------------------

export function describeEncounterActions(bundle) {
  requireCondition(isPlainObject(bundle), 'describeEncounterActions expects a bundle', 'INVALID_INPUT');
  record(bundle);
  const snapshot = bundle.snapshot;
  requireCondition(isPlainObject(snapshot), 'describeEncounterActions expects a bundle snapshot', 'INVALID_INPUT');
  record(snapshot);
  requireEncounterProfileMetadata(snapshot);
  const world = snapshot.world;
  requireCondition(isPlainObject(world), 'describeEncounterActions expects bundle.snapshot.world', 'INVALID_INPUT');
  record(world);

  const active = activeEncounter(world);
  const alive = playerIsAlive(world);
  const player = playerOf(world);
  const inForest = isPlainObject(player) && player.location === ENCOUNTER_LOCATION;

  return {
    profile: ENCOUNTER_PROFILE,
    rulesVersion: ENCOUNTER_RULES,
    beginTicks: BEGIN_TICKS,
    attackTicks: ATTACK_TICKS,
    fleeTicks: FLEE_TICKS,
    cancelTicks: CANCEL_TICKS,
    canBegin: active === null && alive && inForest,
    canAct: active !== null && alive,
    canCancel: active !== null && alive,
    blockedWorldActions: active !== null ? [...BLOCKED_WORLD_ACTIONS] : [],
    encounterId: active !== null ? active.encounterId : null,
  };
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

export function validateEncounterWorldState(world, snapshotContext = {}) {
  // The snapshot context is exactly { tick }: a missing, negative, fractional or extra-keyed
  // context is an invalid call, never a silent tick 0.
  requireCondition(isPlainObject(snapshotContext), 'snapshotContext must be exactly { tick }', 'INVALID_INPUT');
  fields(snapshotContext, ['tick']);
  integer(snapshotContext.tick);
  const tick = snapshotContext.tick;

  if (!isPlainObject(world)) return { valid: false, errors: ['world must be a plain object'] };
  const errors = [];

  const model = world.encounterModel;
  let modelOk = true;
  if (!isPlainObject(model)) {
    errors.push('world.encounterModel must be a plain object');
    modelOk = false;
  } else {
    if (!sortedKeysEqual(model, ENCOUNTER_MODEL_KEYS)) {
      errors.push(`encounterModel must have exactly the ${ENCOUNTER_MODEL_KEYS.length} contract fields (found ${Object.keys(model).length})`);
    }
    if (model.version !== MODEL_VERSION) errors.push(`encounterModel.version must be ${MODEL_VERSION}`);
    if (!isInteger(model.nextEncounterId) || model.nextEncounterId < 1 || model.nextEncounterId > 17) {
      errors.push('encounterModel.nextEncounterId must be an integer in 1..17');
    }
    if (!Array.isArray(model.inputHistory)) {
      errors.push('encounterModel.inputHistory must be an array');
    } else if (model.inputHistory.length > MAX_INPUT_HISTORY) {
      errors.push(`encounterModel.inputHistory must not exceed ${MAX_INPUT_HISTORY} entries`);
    } else {
      const seen = new Set();
      for (let index = 0; index < model.inputHistory.length; index += 1) {
        const entry = model.inputHistory[index];
        if (!isPlainObject(entry) || !sortedKeysEqual(entry, ['dto', 'receipt']) ||
          !isPlainObject(entry.dto) || !isPlainObject(entry.receipt)) {
          errors.push(`encounterModel.inputHistory[${index}] must be a { dto, receipt } pair`);
          continue;
        }
        const commandId = entry.dto.commandId;
        if (!isIdentifier(commandId)) {
          errors.push(`encounterModel.inputHistory[${index}].dto.commandId must be a non-empty identifier`);
          continue;
        }
        if (seen.has(commandId)) errors.push(`encounterModel.inputHistory has a duplicate commandId ${commandId}`);
        seen.add(commandId);
      }
    }
  }

  // The authoritative actor array must carry the real player body.
  const actors = isPlainObject(world.actorModel) && Array.isArray(world.actorModel.actors)
    ? world.actorModel.actors
    : null;
  if (!actors) errors.push('world.actorModel.actors must be an array');
  const playerBody = actors ? actors.find((actor) => isPlainObject(actor) && actor.actorId === ACTOR_ID) : null;
  if (actors && !playerBody) errors.push(`world.actorModel.actors must contain ${ACTOR_ID}`);

  // The v2 ecology layer owns the held-wolf reservation.
  let reservedWolves = null;
  if (!isPlainObject(world.ecologyModel)) {
    errors.push('world.ecologyModel must be a plain object');
  } else {
    const ecology = world.ecologyModel;
    if (!isPlainObject(ecology.config) || ecology.config.version !== 'ecology-config-v2') {
      errors.push('world.ecologyModel.config.version must be ecology-config-v2');
    }
    reservedWolves = ecology.reservedWolves;
    if (!isInteger(reservedWolves) || (reservedWolves !== 0 && reservedWolves !== 1)) {
      errors.push('world.ecologyModel.reservedWolves must be 0 or 1');
    }
    const wolves = isPlainObject(ecology.populations) ? ecology.populations.wolves : undefined;
    if (!isInteger(wolves)) errors.push('world.ecologyModel.populations.wolves must be an integer');
    else if (isInteger(reservedWolves) && reservedWolves > wolves) {
      errors.push('world.ecologyModel.reservedWolves must not exceed the living wolf population');
    }
    let battleDeaths = null;
    let initialWolves = null;
    const wolfLedger = isPlainObject(ecology.ledger) && isPlainObject(ecology.ledger.wolves)
      ? ecology.ledger.wolves : null;
    if (!wolfLedger) {
      errors.push('world.ecologyModel.ledger.wolves must be a plain object');
    } else {
      const WOLF_BOOKS = ['births', 'naturalDeaths', 'starvationDeaths', 'predation', 'hunted', 'removed', 'battleDeaths'];
      for (const key of WOLF_BOOKS) {
        if (!isInteger(wolfLedger[key]) || wolfLedger[key] < 0) {
          errors.push(`world.ecologyModel.ledger.wolves.${key} must be a non-negative integer`);
        }
      }
      if (wolfLedger.predation !== 0) errors.push('wolves never suffer predation (L77: fixed zero)');
      battleDeaths = isInteger(wolfLedger.battleDeaths) && wolfLedger.battleDeaths >= 0
        ? wolfLedger.battleDeaths : null;
    }
    if (isPlainObject(ecology.ledger) && isPlainObject(ecology.ledger.deer) &&
      'battleDeaths' in ecology.ledger.deer) {
      errors.push('battleDeaths is a wolf-only account; deer must never gain it');
    }
    if (isPlainObject(ecology.config) && isPlainObject(ecology.config.resources) &&
      isPlainObject(ecology.config.resources.populations)) {
      initialWolves = ecology.config.resources.populations.wolves;
    }
    if (battleDeaths !== null && initialWolves !== null && isInteger(wolves) && wolfLedger) {
      const booksOk = ['births', 'naturalDeaths', 'starvationDeaths', 'predation', 'hunted', 'removed']
        .every((key) => isInteger(wolfLedger[key]) && wolfLedger[key] >= 0);
      if (booksOk) {
        // L77: wolves = initial + births - natural - starvation - predation(0) - hunted - removed - battleDeaths.
        const computed = BigInt(initialWolves) + BigInt(wolfLedger.births) - BigInt(wolfLedger.naturalDeaths)
          - BigInt(wolfLedger.starvationDeaths) - BigInt(wolfLedger.predation) - BigInt(wolfLedger.hunted)
          - BigInt(wolfLedger.removed) - BigInt(wolfLedger.battleDeaths);
        if (BigInt(wolves) !== computed) {
          errors.push('wolf population violates the ecology ledger conservation');
        }
      }
    }
  }

  if (modelOk && model.encounter !== null) {
    const encounter = model.encounter;
    if (!isPlainObject(encounter)) {
      errors.push('encounter must be null or a plain object');
    } else {
      if (!sortedKeysEqual(encounter, ENCOUNTER_KEYS)) {
        errors.push(`encounter must have exactly the ${ENCOUNTER_KEYS.length} contract fields (found ${Object.keys(encounter).length})`);
      }
      if ('wolfDied' in encounter) errors.push('wolfDied must be derived from wolfHealth, never persisted');
      if (encounter.actorId !== ACTOR_ID) errors.push(`encounter.actorId must be ${ACTOR_ID}`);
      if (encounter.location !== ENCOUNTER_LOCATION) errors.push(`encounter.location must be ${ENCOUNTER_LOCATION}`);
      if (encounter.encounterId !== `encounter-${model.nextEncounterId - 1}`) {
        errors.push('encounter.encounterId must be encounter-(nextEncounterId-1)');
      }
      if (!isIdentifier(encounter.beginCommandId)) errors.push('encounter.beginCommandId must be a non-empty identifier');
      if (!isIdentifier(encounter.lastCommandId)) errors.push('encounter.lastCommandId must be a non-empty identifier');
      if (!isInteger(encounter.startTick) || encounter.startTick < 0) {
        errors.push('encounter.startTick must be a non-negative integer');
      }
      if (!isInteger(encounter.initialPlayerHealth) || encounter.initialPlayerHealth < 0) {
        errors.push('encounter.initialPlayerHealth must be a non-negative integer');
      }
      if (!WOLF_HEALTH_DOMAIN.includes(encounter.wolfHealth)) {
        errors.push(`encounter.wolfHealth must be one of ${WOLF_HEALTH_DOMAIN.join(', ')}`);
      }
      if (!ATTACK_COUNT_DOMAIN.includes(encounter.attackCount)) {
        errors.push(`encounter.attackCount must be one of ${ATTACK_COUNT_DOMAIN.join(', ')}`);
      }
      if (encounter.resolution === 'player-died') {
        // Death can close an encounter at any tick (counter-attack or
        // settlement); elapsedTicks is endTick - startTick, not a domain member.
        if (!isInteger(encounter.elapsedTicks) || encounter.elapsedTicks < 0) {
          errors.push('encounter.elapsedTicks must be a non-negative integer');
        }
      } else if (!ELAPSED_TICKS_DOMAIN.includes(encounter.elapsedTicks)) {
        errors.push(`encounter.elapsedTicks must be one of ${ELAPSED_TICKS_DOMAIN.join(', ')}`);
      }
      if (!STATUS_DOMAIN.includes(encounter.status)) {
        errors.push(`encounter.status must be one of ${STATUS_DOMAIN.join(', ')}`);
      }
      if (!RESOLUTION_DOMAIN.includes(encounter.resolution)) {
        errors.push(`encounter.resolution must be one of ${RESOLUTION_DOMAIN.join(', ')}`);
      }
      if (encounter.status === STATUS_ACTIVE) {
        if (encounter.reserved !== true) errors.push('an active encounter must hold its reservation');
        if (encounter.endTick !== null) errors.push('an active encounter must have endTick null');
        if (encounter.resolution !== null) errors.push('an active encounter must have resolution null');
        if (isInteger(reservedWolves) && reservedWolves !== 1) {
          errors.push('an active encounter must reserve exactly one wolf');
        }
        if (!playerBody || playerBody.alive !== true) {
          errors.push('an active encounter requires a living actor-4');
        } else if (playerBody.location !== ENCOUNTER_LOCATION) {
          errors.push('an active encounter requires actor-4 in the forest');
        }
      } else if (encounter.status === STATUS_CLOSED) {
        if (encounter.reserved !== false) errors.push('a closed encounter must release its reservation');
        if (isInteger(reservedWolves) && reservedWolves !== 0) {
          errors.push('a closed encounter must reserve no wolf');
        }
        if (!isInteger(encounter.endTick)) errors.push('a closed encounter must have an integer endTick');
        else if (encounter.endTick > tick) errors.push('encounter.endTick must not be in the future of the snapshot tick');
        if (encounter.resolution === null) errors.push('a closed encounter must carry a resolution');
      }
    }
  }

  if (errors.length > 0) requireCondition(false, errors.join('; '), 'INVALID_INPUT');
  return { valid: true, errors };
}

// ---------------------------------------------------------------------------
// runtime hooks (six responsibilities)
// ---------------------------------------------------------------------------

function hooksCreateWorld(memory, mind, motivation, experience, cognition, simulationId) {
  const world = createSurvivalWorld(memory, mind, motivation, experience, cognition, simulationId);
  world.encounterModel = {
    version: MODEL_VERSION,
    nextEncounterId: 1,
    encounter: null,
    inputHistory: [],
  };
  return world;
}

/**
 * The survival/mind validators check the world against an exact field set, so `encounterModel`
 * is detached *in place* for the duration of the delegated work and re-attached to whichever
 * world object the snapshot points at afterwards. It must be the same object rather than a
 * shadow copy: the survival hooks replace `snapshot.world` mid-call and hand the same live world
 * to the engine's commit callback, so a copy would desynchronise the command from the world it
 * was planned against.
 */
function withEncounterDetached(snapshot, run) {
  const world = snapshot.world;
  const model = world.encounterModel;
  if (model === undefined) return run();
  delete world.encounterModel;
  try {
    return run();
  } finally {
    if (snapshot.world.encounterModel === undefined) snapshot.world.encounterModel = model;
  }
}

function hooksBeforeSystems(snapshot, events, tick, append, commit) {
  return withEncounterDetached(snapshot,
    () => survivalRuntimeHooks.beforeSystems(snapshot, events, tick, append, commit));
}

function hooksAfterSystems(snapshot, events, tick, append, context) {
  const result = withEncounterDetached(snapshot,
    () => survivalRuntimeHooks.afterSystems(snapshot, events, tick, append, context));
  // L91: when a settlement truly kills the player, the active encounter is terminated
  // at the death tick and an EncounterTerminated fact cites the killing settlement.
  const world = snapshot.world;
  const model = isPlainObject(world) ? modelOf(world) : null;
  if (model !== null) {
    const encounter = encounterOf(world);
    if (encounter !== null && encounter.status === STATUS_ACTIVE && !playerIsAlive(world)) {
      const player = playerOf(world);
      const deathTick = isInteger(player.deathTick) ? player.deathTick : tick;
      let cause = null;
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (isPlainObject(event) && event.type === SETTLED_TYPE && event.tick === deathTick) {
          cause = event.eventSeq;
          break;
        }
      }
      model.encounter = makeEncounter({
        ...encounter,
        status: STATUS_CLOSED,
        resolution: 'player-died',
        endTick: deathTick,
        elapsedTicks: deathTick - encounter.startTick,
        reserved: false,
      });
      world.ecologyModel.reservedWolves = 0;
      // The settlement death is observed in the same tick so the observer/world life
      // boundary (world-state L163) stays aligned for the end-of-tick validation.
      for (const observer of world.memoryModel.observer.actors) {
        observer.alive = world.actorModel.actors
          .some((actor) => isPlainObject(actor) && actor.actorId === observer.actorId && actor.alive === true);
      }
      append({
        type: TERMINATED_TYPE,
        sourceSystem: SOURCE_SYSTEM,
        commandId: null,
        entityIds: [ACTOR_ID],
        causationEventSeqs: cause === null ? [] : [cause],
        payload: {
          encounterId: encounter.encounterId,
          actorId: ACTOR_ID,
          reason: 'player-died',
          deathTick,
          wolfHealth: encounter.wolfHealth,
          reservedBefore: 1,
          reservedAfter: 0,
        },
      });
      // The terminated fact is appended after the delegated survival afterSystems sealed the
      // mind/motivation/experience/cognition cursors at the pre-append event count; re-seal the
      // cursors at the new event count so the end-of-tick boundary validation sees them aligned.
      world.mindModel.cursor = events.length;
      world.motivationModel.cursor = events.length;
      if (isPlainObject(world.experienceModel)) world.experienceModel.cursor = events.length;
      if (isPlainObject(world.cognitionModel)) world.cognitionModel.cursor = events.length;
    }
  }
  return result;
}

/**
 * Internal society actions (the motivation/cognition proposals the survival profile admits) are
 * applied through the same world-level signature as every other profile. The encounter domain
 * itself is *not* reached here: DTO3 intents go through the exported `executeEncounterIntent`
 * entry point, so a tick can never both advance the world and re-run the intent journal.
 */
function hooksApplyAction(input, payload, sample = null) {
  const model = input.encounterModel;
  const stripped = {};
  for (const key of Object.keys(input)) {
    if (key === 'encounterModel') continue;
    stripped[key] = input[key];
  }
  const applied = survivalRuntimeHooks.applyAction(stripped, payload, sample);
  if (model === undefined) return applied;
  const nextWorld = {};
  for (const key of Object.keys(applied.world)) nextWorld[key] = applied.world[key];
  nextWorld.encounterModel = cloneData(model);
  return { ...applied, world: nextWorld };
}

/**
 * L81: the daily settlement runs only over the *available* wolf group and never
 * closes an active encounter. The survival settlement owns the day/ecology work
 * but its world does not carry `encounterModel`, so the encounter model is
 * detached for the settlement and re-attached to the fresh result world. The
 * input world is never mutated.
 */
function hooksSettleDay(world, sample) {
  requireCondition(isPlainObject(world), 'settleDay expects a world', 'INVALID_INPUT');
  const model = world.encounterModel;
  const stripped = {};
  for (const key of Object.keys(world)) {
    if (key === 'encounterModel') continue;
    stripped[key] = world[key];
  }
  const settled = survivalRuntimeHooks.settleDay(stripped, sample);
  requireCondition(isPlainObject(settled) && isPlainObject(settled.world),
    'the survival settlement must return { world, payload }', 'INVALID_INPUT');
  const nextWorld = {};
  for (const key of Object.keys(settled.world)) nextWorld[key] = settled.world[key];
  if (model !== undefined) nextWorld.encounterModel = cloneData(model);
  return { world: nextWorld, payload: settled.payload };
}

/**
 * L71: a full replay. The encounter journal is replayed from the same sealed
 * configs and compared against the committed world, the published facts and the
 * journal receipts. Structural facts (source system, entity ids, payload shape,
 * causation ordering) are checked directly so a tampered log cannot survive.
 */
function hooksValidateHistory(snapshot, events) {
  requireCondition(isPlainObject(snapshot), 'validateHistory expects a snapshot', 'INVALID_INPUT');
  requireCondition(isPlainObject(snapshot.world), 'validateHistory expects snapshot.world', 'INVALID_INPUT');
  requireCondition(Array.isArray(events), 'validateHistory expects the event log', 'INVALID_INPUT');

  integer(snapshot.tick);
  const actorDay = snapshot.world.actorModel?.day;
  integer(actorDay);
  requireCondition(actorDay === Math.floor(snapshot.tick / TICKS_PER_DAY) && actorDay <= MAX_RESOURCE_DAYS,
    'Encounter snapshot clock/day is outside the supported replay range', 'INVALID_INPUT');
  validateEncounterWorldState(snapshot.world, { tick: snapshot.tick });
  requireCondition(snapshot.nextEventSeq === events.length + 1,
    'nextEventSeq must equal the published event count plus one', 'INVALID_INPUT');

  const model = snapshot.world.encounterModel;
  const history = model.inputHistory;
  const recorded = events.filter((event) => isPlainObject(event) && event.type === FACT_TYPE);
  requireCondition(recorded.length === history.length,
    'every encounter input must publish exactly one fact', 'INVALID_INPUT');

  const byCommandId = new Map();
  for (const event of recorded) {
    requireCondition(event.sourceSystem === SOURCE_SYSTEM,
      'an encounter fact must be published by the encounter system', 'INVALID_INPUT');
    requireCondition(Array.isArray(event.entityIds) && event.entityIds.length === 1 &&
      event.entityIds[0] === ACTOR_ID, 'an encounter fact must target actor-4', 'INVALID_INPUT');
    requireCondition(isPlainObject(event.payload) && sortedKeysEqual(event.payload, ['dto', 'receipt']),
      'an encounter fact must carry exactly { dto, receipt }', 'INVALID_INPUT');
    requireCondition(!byCommandId.has(event.commandId),
      `duplicate encounter fact for ${String(event.commandId)}`, 'INVALID_INPUT');
    requireCondition(Array.isArray(event.causationEventSeqs),
      'causationEventSeqs must be an array', 'INVALID_INPUT');
    for (const cause of event.causationEventSeqs) {
      requireCondition(isInteger(cause) && cause < event.eventSeq,
        'a cause must reference an earlier fact', 'INVALID_INPUT');
    }
    byCommandId.set(event.commandId, event);
  }

  // L71: every world fact (quote, settlement, termination) must be reproduced by the
  // one full replay below — never by copying the committed (terminal) world, RNG, task
  // list or counters. A stripped "survival-only" replay cannot be used for the world
  // comparison: combat damage, wolf kills and reservations are encounter effects, so a
  // survival-only replay diverges from the committed world by construction. The full
  // journal replay through `executeEncounterIntent` reproduces *both* projections
  // (world facts and encounter facts) from the sealed configs and the initial seed.
  const worldFacts = events.filter((event) => !(isPlainObject(event) && event.type === FACT_TYPE));
  const journalOnly = worldFacts.length === 0;
  requireCondition(worldFacts.length + recorded.length === events.length,
    'the event log must contain only world and encounter facts', 'INVALID_INPUT');

  const replayWorld = hooksCreateWorld(
    snapshot.world.memoryModel.config,
    snapshot.world.mindModel.config,
    snapshot.world.motivationModel.config,
    snapshot.world.experienceModel.config,
    snapshot.world.cognitionModel.config,
    snapshot.simulationId,
  );
  const replaySnapshot = cloneSnapshotWith(snapshot, replayWorld);
  replaySnapshot.tick = 0;
  replaySnapshot.revision = 0;
  replaySnapshot.instantCommits = 0;
  replaySnapshot.nextEventSeq = 1;
  // The replay rebuilds the world from the initial seed: input queues, receipts and
  // counters start empty, and the scheduler starts from the *fresh* tick-0 schedule
  // (daily task 144, quote task 1). The committed snapshot carries the advanced
  // schedule, so the tasks are re-derived from their frozen intervals instead of being
  // copied from the terminal state.
  replaySnapshot.rng = createRng(snapshot.rng.seed).getState();
  replaySnapshot.commandReceipts = {};
  replaySnapshot.pendingCommands = [];
  replaySnapshot.nextInputSeq = 1;
  if (snapshot.tick > 0) {
    replaySnapshot.scheduledTasks = replaySnapshot.scheduledTasks.map((task) => ({
      ...task,
      nextDueTick: task.taskId === 'survival-quote' ? 1 : task.intervalTicks,
    }));
  }

  const systems = encounterSystems();
  let replay = { snapshot: replaySnapshot, eventLog: [] };
  if (history.length === 0) {
    // Engine-driven bundle: no encounter input was ever accepted, so every world fact was
    // produced by the registered main loop alone. The one full replay therefore advances the
    // fresh world through the real ticks; the terminal comparison below still owns the whole
    // world, the RNG, the counters and every committed fact byte for byte.
    for (let t = 0; t < snapshot.tick; t += 1) replay = performTick(replay, systems, 'session');
    requireCondition(replay.eventLog.length === events.length,
      'the committed log holds facts no replayed engine tick can produce', 'INVALID_INPUT');
    for (let seq = 1; seq <= events.length; seq += 1) {
      requireCondition(canonicalJson(replay.eventLog[seq - 1]) === canonicalJson(events[seq - 1]),
        `the replayed engine fact #${seq} does not match the committed fact`, 'INVALID_INPUT');
    }
  }
  let comparedFactCount = 0;
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index];
    requireCondition(isPlainObject(entry) && isPlainObject(entry.dto) && isPlainObject(entry.receipt),
      'encounterModel.inputHistory[' + index + '] must be a { dto, receipt } pair', 'INVALID_INPUT');

    const receipt = entry.receipt;
    integer(receipt.fromTick);
    integer(receipt.fromRevision);
    integer(receipt.durationTicks);
    integer(receipt.tick);
    integer(receipt.toRevision);
    requireCondition(receipt.fromTick >= replay.snapshot.tick && receipt.fromTick <= snapshot.tick,
      'Encounter input time anchors must be monotonic and within the committed clock', 'INVALID_INPUT');
    requireCondition(receipt.durationTicks <= MAX_ADVANCE_TICKS,
      'Encounter command duration exceeds its budget', 'LIMIT_EXCEEDED');
    requireCondition(receipt.fromTick <= Number.MAX_SAFE_INTEGER - receipt.durationTicks,
      'Encounter replay target tick overflows a safe integer', 'INVALID_INPUT');
    const targetTick = receipt.fromTick + receipt.durationTicks;
    const revisionDelta = receipt.durationTicks === 0 ? 1 : receipt.durationTicks;
    requireCondition(targetTick === receipt.tick && targetTick <= snapshot.tick &&
      receipt.fromRevision <= Number.MAX_SAFE_INTEGER - revisionDelta &&
      receipt.toRevision === receipt.fromRevision + revisionDelta,
      'Encounter receipt time anchors are inconsistent or outside the committed clock', 'INVALID_INPUT');

    while (replay.snapshot.tick < receipt.fromTick) {
      replay = performTick(replay, systems, 'session');
    }
    requireCondition(replay.snapshot.tick === receipt.fromTick &&
      replay.snapshot.revision === receipt.fromRevision,
      'Encounter receipt start anchor does not match replayed time', 'INVALID_INPUT');

    const outcome = executeEncounterIntent(replay, entry.dto);
    replay = outcome.bundle;
    const published = byCommandId.get(entry.dto.commandId);
    requireCondition(published !== undefined,
      'the journal entry ' + entry.dto.commandId + ' has no published fact', 'INVALID_INPUT');
    requireCondition(published.eventSeq > 0 && published.eventSeq <= replay.eventLog.length,
      'the published fact for ' + entry.dto.commandId + ' sits outside the replayed log', 'INVALID_INPUT');
    requireCondition(canonicalJson(outcome.receipt) === canonicalJson(entry.receipt),
      'the replayed receipt for ' + entry.dto.commandId + ' does not match the journal', 'INVALID_INPUT');

    requireCondition(replay.eventLog.length <= events.length,
      'the replay produced more facts than the committed log', 'INVALID_INPUT');
    for (let seq = comparedFactCount; seq < replay.eventLog.length; seq += 1) {
      requireCondition(canonicalJson(replay.eventLog[seq]) === canonicalJson(events[seq]),
        'the replayed fact #' + (seq + 1) + ' does not match the committed fact', 'INVALID_INPUT');
    }
    comparedFactCount = replay.eventLog.length;
  }

  requireCondition(snapshot.tick >= replay.snapshot.tick,
    'The committed terminal clock precedes replayed input time', 'INVALID_INPUT');
  while (replay.snapshot.tick < snapshot.tick) {
    replay = performTick(replay, systems, 'session');
  }
  requireCondition(replay.snapshot.tick === snapshot.tick,
    'The replayed terminal clock does not match the committed clock', 'INVALID_INPUT');
  requireCondition(replay.eventLog.length <= events.length,
    'the replay produced more facts than the committed log', 'INVALID_INPUT');
  for (let seq = comparedFactCount; seq < replay.eventLog.length; seq += 1) {
    requireCondition(canonicalJson(replay.eventLog[seq]) === canonicalJson(events[seq]),
      'the replayed fact #' + (seq + 1) + ' does not match the committed fact', 'INVALID_INPUT');
  }
  requireCondition(replay.eventLog.length === events.length,
    'the committed log holds facts no replayed input can produce', 'INVALID_INPUT');

  if (journalOnly) {
    // Pure journal bundle: the journal replay owns the whole snapshot.
    requireCondition(canonicalJson(replay.snapshot) === canonicalJson(snapshot),
      'the replayed snapshot does not match the committed snapshot', 'INVALID_INPUT');
  } else {
    // World-ticked bundle: the one full replay owns the world, the RNG and every fact,
    // so the terminal world must equal the committed world byte for byte. Comparing the
    // whole world also closes every encounter-effect tampering (reservation, damage,
    // population, ledger) against a hand-edited terminal snapshot.
    requireCondition(canonicalJson(replay.snapshot.world) === canonicalJson(snapshot.world),
      'the replayed terminal world does not match the committed world', 'INVALID_INPUT');
    requireCondition(replay.snapshot.tick === snapshot.tick &&
      replay.snapshot.revision === snapshot.revision &&
      replay.snapshot.instantCommits === snapshot.instantCommits &&
      replay.snapshot.nextEventSeq === snapshot.nextEventSeq &&
      canonicalJson(replay.snapshot.rng) === canonicalJson(snapshot.rng) &&
      canonicalJson(replay.snapshot.scheduledTasks) === canonicalJson(snapshot.scheduledTasks) &&
      replay.snapshot.nextEntityId === snapshot.nextEntityId,
      'the replayed terminal counters do not match the committed snapshot', 'INVALID_INPUT');
    requireCondition(canonicalJson(replay.snapshot.commandReceipts) === canonicalJson(snapshot.commandReceipts),
      'the replayed encounter receipts do not match the committed receipts', 'INVALID_INPUT');
    requireCondition(replay.snapshot.nextInputSeq === snapshot.nextInputSeq &&
      canonicalJson(replay.snapshot.pendingCommands) === canonicalJson(snapshot.pendingCommands),
      'the replayed encounter input history does not match the committed counters', 'INVALID_INPUT');
  }
  return { valid: true, errors: [] };
}

export const encounterRuntimeHooks = {
  createWorld: hooksCreateWorld,
  beforeSystems: hooksBeforeSystems,
  afterSystems: hooksAfterSystems,
  applyAction: hooksApplyAction,
  settleDay: hooksSettleDay,
  validateHistory: hooksValidateHistory,
};
