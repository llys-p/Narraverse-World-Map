/**
 * D3-5A Lane2 — real-chain contract test for the playable encounter runtime.
 *
 * Contract basis: tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md (the single public behaviour contract).
 * Every expectation below is hand-computed from that document plus the real frozen modules
 * (runtime/core/world-state.mjs, runtime/core/actors.mjs, runtime/core/ecology.mjs,
 * runtime/core/data-contract.mjs, runtime/core/event-log.mjs) and the real survival fixture
 * shape (runtime/fixtures/survival-village.mjs).
 *
 * The encounter implementation module is deliberately NOT read: runtime/core/encounter-runtime.mjs
 * and runtime/fixtures/encounter-survival-village.mjs are under repair. This file therefore runs RED
 * today: `node --check` passes, the import of the missing fixture raises ERR_MODULE_NOT_FOUND.
 * That is the intended RED state — nothing here is skipped, todo'd or weakened.
 *
 * This test consumes the REAL chain only:
 *   - runtime/fixtures/encounter-survival-village.mjs
 *       defaultEncounterVillageConfig / encounterSystems / createEncounterVillage
 *   - runtime/core/encounter-runtime.mjs
 *       ENCOUNTER_RULES / ENCOUNTER_PROFILE / encounterRuntimeHooks / executeEncounterIntent
 *       describeEncounterActions / validateEncounterWorldState
 *   - bundle = {snapshot, eventLog}; snapshot carries schemaVersion 3 (16 frozen fields +
 *     `instantCommits`); world carries the ten models; reads go through bundle.snapshot.world,
 *     world.actorModel.actors and world.encounterModel.
 *
 * No shadow adapter, no simplified {world, revision, tick} shape, no assumed world.actors array.
 *
 * Two deliberate anti-fabrication rules:
 *   1. Boundary scenarios (health <= 80, health 0) are derived from a legal initial config
 *      (defaultEncounterVillageConfig() -> config.memory.society.actors.initialActors[3].health),
 *      never by writing into a snapshot that has already passed the validator (B L34/L42).
 *   2. The contract fixes "Begin requires the player to be in the forest" (L53/L57) but never
 *      fixes the fixture's *initial* location. Where the scenario needs a forest player, the test
 *      travels through the real PlayerTravel command if needed, and every tick expectation is
 *      computed relative to the measured post-travel tick.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultEncounterVillageConfig,
  encounterSystems,
  createEncounterVillage,
} from '../../runtime/fixtures/encounter-survival-village.mjs';
import * as encounterRuntime from '../../runtime/core/encounter-runtime.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { createSurvivalVillage, defaultSurvivalVillageConfig } from '../../runtime/fixtures/survival-village.mjs';
import { SURVIVAL_RULES } from '../../runtime/core/survival-state.mjs';

const {
  ENCOUNTER_RULES,
  ENCOUNTER_PROFILE,
  encounterRuntimeHooks,
  executeEncounterIntent,
  describeEncounterActions,
  validateEncounterWorldState,
} = encounterRuntime;

// ---------------------------------------------------------------------------
// Hand-transcribed contract constants (D3-5A L33, L40-51, L63-67, L87-89)
// ---------------------------------------------------------------------------

const MODEL_VERSION = 'encounter-runtime-v1';            // L49
const ACTOR_ID = 'actor-4';                              // L51
const ENCOUNTER_LOCATION = 'forest';                     // L51
const HOME_LOCATION = 'village';                         // actors.mjs:67 — actor-config-v4 allows only these two
const WOLF_MAX_HEALTH = 300;                             // L87
const WOLF_HIT_DAMAGE = 150;                             // L87
const WOLF_COUNTER_DAMAGE = 80;                          // L87
/**
 * L47 fixes the initializer as a deep copy of the survival config with only the five config
 * versions replaced, and L57 forbids changing the old config parameters — so every actor still
 * starts at health 1000 (survival-village.mjs `Object.assign(actor,{health:1000,...})`).
 */
const PLAYER_BASELINE_HEALTH = 1000;
const PLAYER_WOUNDED_HEALTH = PLAYER_BASELINE_HEALTH - WOLF_COUNTER_DAMAGE; // 920, cross-checked by B L28
const BEGIN_TICKS = 0;                                   // L87
const ATTACK_TICKS = 6;                                  // L87
const FLEE_TICKS = 6;                                    // L87
const CANCEL_TICKS = 0;                                  // L87
const MAX_INPUT_HISTORY = 128;                           // L49
const INPUT_BYTE_BUDGET = 4096;                          // L53, L65
const INITIAL_LIVING_WOLVES = 14;                        // L47
const WOLF_HEALTH_DOMAIN = [300, 150, 0];                // L51
const ATTACK_COUNT_DOMAIN = [0, 1, 2];                   // L51

/** L67: the domain rejection codes are a closed set of exactly six. */
const REASON_CODES = ['RULE_REJECTED', 'ENCOUNTER_BUSY', 'ENCOUNTER_UNAVAILABLE',
  'ENCOUNTER_ID_MISMATCH', 'ENCOUNTER_CLOSED', 'PLAYER_DEAD'];

/** L89: during ACTIVE these world commands are refused as zero-tick domain rejections. */
const BLOCKED_WORLD_ACTIONS = ['AdvanceTime', 'PlayerTravel', 'PlayerRest', 'PlayerBuy', 'PlayerSell'];

/** L34: schema 2 keeps every original field and adds exactly `instantCommits`. */
const SNAPSHOT_FIELDS = ['schemaVersion', 'rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion',
  'tick', 'tickMinutes', 'revision', 'rng', 'nextEntityId', 'nextEventSeq', 'nextInputSeq',
  'scheduledTasks', 'pendingCommands', 'commandReceipts', 'world', 'instantCommits'];

/** L67: receipt3 is exactly these twelve fields. */
const RECEIPT_FIELDS = ['apiVersion', 'receiptVersion', 'commandId', 'status', 'fromRevision',
  'toRevision', 'fromTick', 'tick', 'durationTicks', 'type', 'outcome', 'result'];

/** L67: the encounter result is exactly these six fields. */
const RESULT_FIELDS = ['actorId', 'encounterId', 'action', 'before', 'after', 'reasonCode'];

/** L67: before/after carry exactly these ten fields. */
const VIEW_FIELDS = ['tick', 'playerHealth', 'playerAlive', 'wolfHealth', 'totalLivingWolves',
  'reservedWolves', 'availableWolves', 'battleDeaths', 'status', 'resolution'];

/** L51: one encounter is exactly these fourteen fields; `wolfDied` is derived, never stored. */
const ENCOUNTER_FIELDS = ['encounterId', 'actorId', 'location', 'status', 'resolution', 'startTick',
  'endTick', 'initialPlayerHealth', 'wolfHealth', 'attackCount', 'elapsedTicks', 'beginCommandId',
  'lastCommandId', 'reserved'];

/** L57: describeEncounterActions returns exactly these eleven keys. */
const ACTIONS_FIELDS = ['profile', 'rulesVersion', 'beginTicks', 'attackTicks', 'fleeTicks',
  'cancelTicks', 'canBegin', 'canAct', 'canCancel', 'blockedWorldActions', 'encounterId'];

/** L81: the day-settlement payload gains exactly these six encounterOwnership fields. */
const OWNERSHIP_FIELDS = ['reservedOpening', 'reservedClosing', 'battleDeathsOpening',
  'battleDeathsClosing', 'totalLivingOpening', 'totalLivingClosing'];

const ENCOUNTER_FIELDS_SORTED = ENCOUNTER_FIELDS.slice().sort();

// ---------------------------------------------------------------------------
// Real-chain helpers
// ---------------------------------------------------------------------------

function freshVillage(seed = 42) {
  const village = createEncounterVillage(seed, ENCOUNTER_PROFILE, defaultEncounterVillageConfig());
  assert.ok(village && typeof village === 'object', 'createEncounterVillage must return an object');
  const { bundle } = village;
  assert.ok(bundle && typeof bundle === 'object', 'createEncounterVillage must return {bundle, systems}');
  assert.ok(bundle.snapshot && typeof bundle.snapshot === 'object', 'bundle.snapshot is required');
  assert.ok(Array.isArray(bundle.eventLog), 'bundle.eventLog is required');
  return bundle;
}

/**
 * L47 + B L34/L42: a legal initial config is the only way to reach a boundary scenario.
 * The value is written into the config BEFORE the world is built, so the snapshot the validator
 * sees is the one the runtime itself produced.
 */
function villageWithPlayerHealth(health, seed = 42) {
  const config = defaultEncounterVillageConfig();
  assert.ok(config.memory && config.memory.society && config.memory.society.actors &&
    Array.isArray(config.memory.society.actors.initialActors),
  'the fixture config must expose memory.society.actors.initialActors');
  config.memory.society.actors.initialActors[3].health = health;
  const bundle = createEncounterVillage(seed, ENCOUNTER_PROFILE, config).bundle;
  assert.equal(playerActor(bundle).health, health, 'the config-derived body must carry the requested health');
  return bundle;
}

/** Deep mutable copy of a real bundle (strict-JSON by contract, so a JSON round trip is exact). */
function mutableCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function actorOf(world, actorId = ACTOR_ID) {
  const actors = world.actorModel.actors;
  assert.ok(Array.isArray(actors), 'world.actorModel.actors must be the authoritative actor array');
  const actor = actors.find((entry) => entry.actorId === actorId);
  assert.ok(actor, `${actorId} must exist in the authoritative actor model`);
  return actor;
}

function playerActor(bundle) {
  return actorOf(bundle.snapshot.world);
}

function dto3(type, payload, commandId, expectedRevision) {
  return { version: 3, commandId, expectedRevision, type, payload };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function throwsCode(fn, code, label) {
  let error;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `${label}: expected a throw carrying code ${code}`);
  assert.equal(error.code, code, `${label}: expected code ${code}, got ${error.code} (${error.message})`);
  return error;
}

function assertRevisionInvariant(bundle) {
  const snapshot = bundle.snapshot;
  assert.ok(Number.isSafeInteger(snapshot.instantCommits) && snapshot.instantCommits >= 0,
    'instantCommits must be a non-negative safe integer');
  assert.equal(snapshot.revision, snapshot.tick + snapshot.instantCommits, 'L34: revision = tick + instantCommits');
}

function assertReceiptShape(receipt, dto) {
  assert.deepEqual(Object.keys(receipt).sort(), RECEIPT_FIELDS.slice().sort(),
    'L67: receipt3 must carry exactly the twelve contract fields');
  assert.equal(receipt.apiVersion, 1);
  assert.equal(receipt.receiptVersion, 3);
  assert.equal(receipt.commandId, dto.commandId);
  assert.equal(receipt.type, dto.type);
  assert.equal(receipt.status, 'committed');
  assert.ok(['succeeded', 'rejected'].includes(receipt.outcome), 'outcome is succeeded|rejected');
  assert.ok(Number.isSafeInteger(receipt.fromRevision) && receipt.fromRevision >= 0);
  assert.ok(Number.isSafeInteger(receipt.toRevision));
  assert.ok(Number.isSafeInteger(receipt.fromTick) && Number.isSafeInteger(receipt.tick));
  assert.equal(receipt.durationTicks, receipt.tick - receipt.fromTick, 'L67: durationTicks = tick - fromTick');
  if (receipt.durationTicks === 0) {
    assert.equal(receipt.toRevision, receipt.fromRevision + 1, 'L67: zero-tick commit advances revision by one');
  } else {
    assert.equal(receipt.toRevision, receipt.fromRevision + receipt.durationTicks,
      'L67: tick-consuming commit advances revision by durationTicks');
  }
}

function assertEncounterViewShape(view, label) {
  assert.deepEqual(Object.keys(view).sort(), VIEW_FIELDS.slice().sort(),
    `${label} must carry exactly the ten contract fields`);
  assert.ok(Number.isSafeInteger(view.tick));
  assert.ok(Number.isSafeInteger(view.playerHealth) && view.playerHealth >= 0);
  assert.equal(typeof view.playerAlive, 'boolean');
  assert.ok(view.wolfHealth === null || WOLF_HEALTH_DOMAIN.includes(view.wolfHealth),
    `${label}.wolfHealth must be null or in the {300,150,0} domain`);
  assert.ok(['none', 'active', 'closed'].includes(view.status), `${label}.status must be none|active|closed`);
  assert.ok(view.resolution === null || ['win', 'lose', 'flee', 'cancel', 'player-died'].includes(view.resolution),
    `${label}.resolution must be null or a contract resolution`);
  for (const key of ['totalLivingWolves', 'reservedWolves', 'availableWolves', 'battleDeaths']) {
    assert.ok(Number.isSafeInteger(view[key]) && view[key] >= 0, `${label}.${key} must be a non-negative integer`);
  }
  assert.equal(view.availableWolves, view.totalLivingWolves - view.reservedWolves,
    'L77: available = total living - reserved');
  if (view.status === 'none') {
    assert.equal(view.wolfHealth, null, `${label}: no encounter means a null wolf health`);
    assert.equal(view.resolution, null, `${label}: no encounter means a null resolution`);
  }
}

function assertEncounterResultShape(result) {
  assert.deepEqual(Object.keys(result).sort(), RESULT_FIELDS.slice().sort(),
    'L67: the encounter result must carry exactly six fields');
  assert.equal(result.actorId, ACTOR_ID);
  assert.ok(result.encounterId === null || typeof result.encounterId === 'string');
  assert.ok(['begin', 'attack', 'flee', 'cancel'].includes(result.action), 'result.action must be a contract action');
  assertEncounterViewShape(result.before, 'result.before');
  assertEncounterViewShape(result.after, 'result.after');
  assert.ok(result.reasonCode === null || REASON_CODES.includes(result.reasonCode),
    'L67: reasonCode must be null or one of the six closed-set codes');
}

function encounterEvents(bundle) {
  return bundle.eventLog.filter((event) => event.type === 'EncounterCommandResolved');
}

function eventFor(bundle, commandId) {
  const matches = encounterEvents(bundle).filter((event) => event.commandId === commandId);
  assert.equal(matches.length, 1, `L69: exactly one EncounterCommandResolved for ${commandId}`);
  return matches[0];
}

function historyEntry(bundle, commandId) {
  const history = bundle.snapshot.world.encounterModel.inputHistory;
  const entry = history.find((item) => item.dto.commandId === commandId);
  assert.ok(entry, `${commandId} must be retained in inputHistory`);
  return entry;
}

function assertCommandResolution(bundle, dto, receipt, options = {}) {
  const event = eventFor(bundle, dto.commandId);
  assert.equal(event.sourceSystem, 'encounter', 'L69: sourceSystem must be encounter');
  assert.deepEqual(event.entityIds, [ACTOR_ID], 'L69: entityIds must be [actor-4]');
  assert.deepEqual(Object.keys(event.payload).sort(), ['dto', 'receipt'], 'L69: payload is exactly {dto,receipt}');
  assert.deepEqual(event.payload, { dto, receipt }, 'L69: payload must mirror the accepted dto and its receipt');
  assert.ok(event.eventSeq < bundle.snapshot.nextEventSeq);
  for (const cause of event.causationEventSeqs) {
    assert.ok(cause < event.eventSeq, 'L69: every cause must be an earlier existing seq, never a self-cycle');
  }
  if (options.requireCause) {
    assert.ok(event.causationEventSeqs.length > 0, 'L69: Action/Cancel must cite earlier facts');
  } else {
    assert.deepEqual(event.causationEventSeqs, [], 'L69: Begin has no cause');
  }
  return event;
}

/** L69: the four per-tick cursors end at nextEventSeq - 1. */
function assertCursors(bundle) {
  const snapshot = bundle.snapshot;
  const last = snapshot.nextEventSeq - 1;
  for (const model of ['mindModel', 'motivationModel', 'experienceModel', 'cognitionModel']) {
    assert.equal(snapshot.world[model].cursor, last, `L69: ${model}.cursor must equal nextEventSeq - 1`);
  }
}

/** L79: the wolf ledger must equal its own conservation identity. */
function assertConservation(world) {
  const ecology = world.ecologyModel;
  const initial = ecology.config.resources.populations;
  for (const species of ['deer', 'wolves']) {
    const ledger = ecology.ledger[species];
    const expected = initial[species] + ledger.births - ledger.naturalDeaths - ledger.starvationDeaths -
      ledger.predation - ledger.hunted - ledger.removed - (species === 'wolves' ? ledger.battleDeaths : 0);
    assert.equal(ecology.populations[species], expected, `L79: ${species} ledger must balance`);
  }
  assert.equal(ecology.ledger.wolves.predation, 0, 'L79: the wolf predation account is fixed at 0');
  assert.equal(Object.prototype.hasOwnProperty.call(ecology.ledger.deer, 'battleDeaths'), false,
    'L77: battleDeaths may only exist on the wolves account');
}

/** L69 + L49: every accepted input has exactly one resolved event and one history entry. */
function assertPublished(bundle) {
  const snapshot = bundle.snapshot;
  assert.equal(snapshot.nextEventSeq, bundle.eventLog.length + 1, 'nextEventSeq must equal eventLog length + 1');
  const history = snapshot.world.encounterModel.inputHistory;
  assert.ok(Array.isArray(history));
  assert.ok(history.length <= MAX_INPUT_HISTORY, 'L49: inputHistory may never exceed 128 accepted inputs');
  const seen = new Set();
  for (const entry of history) {
    assert.deepEqual(Object.keys(entry).sort(), ['dto', 'receipt'], 'L49: each history entry is exactly {dto,receipt}');
    assert.equal(entry.dto.commandId, entry.receipt.commandId);
    assert.equal(seen.has(entry.dto.commandId), false, 'L49: inputHistory must not repeat a command id');
    seen.add(entry.dto.commandId);
    const matches = encounterEvents(bundle).filter((event) => event.commandId === entry.dto.commandId);
    assert.equal(matches.length, 1, `L69: ${entry.dto.commandId} must have exactly one resolved event`);
    assert.deepEqual(matches[0].payload, { dto: entry.dto, receipt: entry.receipt });
  }
  assertRevisionInvariant(bundle);
}

/** Atomicity fingerprint: for every refusal path this must be byte-identical before and after. */
function stateOf(bundle) {
  const snapshot = bundle.snapshot;
  const encounterModel = snapshot.world.encounterModel;
  return canonicalJson({
    revision: snapshot.revision,
    tick: snapshot.tick,
    instantCommits: snapshot.instantCommits,
    nextEncounterId: encounterModel.nextEncounterId,
    encounter: encounterModel.encounter,
    historyLength: encounterModel.inputHistory.length,
    player: playerActor(bundle),
    wolves: snapshot.world.ecologyModel.populations.wolves,
    reservedWolves: snapshot.world.ecologyModel.reservedWolves,
    battleDeaths: snapshot.world.ecologyModel.ledger.wolves.battleDeaths,
    events: bundle.eventLog.length,
  });
}

function submit(bundle, dto) {
  const out = executeEncounterIntent(bundle, dto);
  assert.ok(out && typeof out === 'object' && !Array.isArray(out), 'executeEncounterIntent must return an object');
  assert.deepEqual(Object.keys(out).sort(), ['bundle', 'receipt'], 'L65: the return is exactly {bundle,receipt}');
  assert.ok(out.bundle && out.bundle.snapshot && Array.isArray(out.bundle.eventLog));
  assertReceiptShape(out.receipt, dto);
  return out;
}

/** L63: PlayerTravel keeps its existing real duration; used to reach the contract's forest scene. */
function travelTo(bundle, destination, commandId) {
  const out = submit(bundle, dto3('PlayerTravel', { destination }, commandId, bundle.snapshot.revision));
  assert.equal(playerActor(out.bundle).location, destination, `travel to ${destination} must move the player`);
  return out.bundle;
}

/**
 * L53/L57 require the player to be in the forest before a Begin may succeed, but the contract never
 * pins the fixture's initial location (B L40/L42/L50/L51 describe travelling to the forest first).
 * Every tick expectation downstream is therefore computed from the tick measured here.
 */
function ensureForest(bundle, prefix = 'pre-travel') {
  if (playerActor(bundle).location === ENCOUNTER_LOCATION) return bundle;
  return travelTo(bundle, ENCOUNTER_LOCATION, `${prefix}-travel`);
}

/** A bundle whose player is NOT in the forest, reached only through the real travel command. */
function awayFromForest(prefix, seed = 42) {
  const bundle = freshVillage(seed);
  if (playerActor(bundle).location !== ENCOUNTER_LOCATION) return bundle;
  return travelTo(bundle, HOME_LOCATION, `${prefix}-away`);
}

function beginVillage(commandId = 'begin-1', seed = 42) {
  const bundle = ensureForest(freshVillage(seed));
  return submit(bundle, dto3('EncounterBegin', {}, commandId, bundle.snapshot.revision)).bundle;
}

function attackOnce(bundle, commandId, encounterId = 'encounter-1') {
  return submit(bundle, dto3('EncounterAction', { encounterId, action: 'attack' }, commandId,
    bundle.snapshot.revision));
}

/** Accepts either a throw-based or a verdict-object validator without weakening the verdict. */
function isValidWorld(world, context) {
  try {
    const verdict = validateEncounterWorldState(world, context);
    if (verdict === false) return false;
    if (verdict && typeof verdict === 'object' && verdict.valid === false) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// G1 — public export surface (L40-45, L47)
// ---------------------------------------------------------------------------

test('G1 runtime keeps six legacy names and the two scene-profile helper exports', () => {
  assert.deepEqual(Object.keys(encounterRuntime).sort(),
    ['ENCOUNTER_PROFILE', 'ENCOUNTER_RULES', 'describeEncounterActions', 'encounterRuntimeHooks',
      'executeEncounterIntent', 'validateEncounterWorldState', 'createSceneEncounterRuntimeHooks',
      'validateSceneEncounterWorldState'].sort(),
    'the six legacy names remain alongside the two CP1c scene-profile helpers');
  assert.equal(ENCOUNTER_RULES, 'd-encounter-survival-v1', 'L33');
  assert.equal(ENCOUNTER_PROFILE, 'encounter-survival-village', 'L33');
  assert.equal(typeof executeEncounterIntent, 'function');
  assert.equal(executeEncounterIntent.length, 2, 'the legacy executor keeps its two-argument signature');
  assert.equal(typeof describeEncounterActions, 'function');
  assert.equal(describeEncounterActions.length, 1, 'the legacy descriptor keeps its one-argument signature');
  assert.equal(typeof validateEncounterWorldState, 'function');
  assert.equal(validateEncounterWorldState.length, 1, 'the legacy validator keeps its one-argument signature');
  assert.equal(typeof encounterRuntime.createSceneEncounterRuntimeHooks, 'function');
  assert.equal(typeof encounterRuntime.validateSceneEncounterWorldState, 'function');
  for (const duty of ['createWorld', 'beforeSystems', 'afterSystems', 'applyAction', 'settleDay', 'validateHistory']) {
    assert.equal(typeof encounterRuntimeHooks[duty], 'function', `L45: encounterRuntimeHooks.${duty} must be a function`);
  }
});

test('G1b fixture exports three names and registers exactly society, survival and encounter systems', () => {
  assert.equal(typeof defaultEncounterVillageConfig, 'function', 'L47');
  assert.equal(typeof encounterSystems, 'function', 'L47');
  assert.equal(typeof createEncounterVillage, 'function', 'L47');
  const systems = encounterSystems();
  assert.deepEqual(Object.keys(systems).sort(), ['encounter', 'society', 'survival'],
    'L47: encounterSystems() registers exactly these three keys');
  for (const key of Object.keys(systems)) {
    assert.equal(typeof systems[key], 'function', `system ${key} must be callable`);
  }
});

// ---------------------------------------------------------------------------
// G2 — initialisation: schema 3, encounter model, five new config layers (L33-36, L47-51)
// ---------------------------------------------------------------------------

test('G2 initial state: schema 3 snapshot, empty encounter model, v2 ecology and the five new config layers', () => {
  const bundle = freshVillage();
  const snapshot = bundle.snapshot;

  assert.equal(snapshot.schemaVersion, 3, 'L34: the new snapshot schema is 3');
  assert.deepEqual(Object.keys(snapshot).sort(), SNAPSHOT_FIELDS.slice().sort(),
    'L34: schema 2 fields plus exactly instantCommits');
  assert.equal(snapshot.instantCommits, 0, 'L34: instantCommits starts at 0');
  assert.equal(snapshot.tick, 0);
  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.rulesVersion, ENCOUNTER_RULES);
  assert.equal(snapshot.simulationId, ENCOUNTER_PROFILE);
  assert.equal(typeof snapshot.fixtureId, 'string');
  assert.equal(snapshot.fixtureVersion, '1');
  assert.equal(snapshot.nextInputSeq, 1);
  assert.deepEqual(snapshot.pendingCommands, []);
  assert.deepEqual(snapshot.commandReceipts, {});
  assert.equal(bundle.eventLog.length, 0);
  assertRevisionInvariant(bundle);

  const model = snapshot.world.encounterModel;
  assert.deepEqual(Object.keys(model).sort(), ['encounter', 'inputHistory', 'nextEncounterId', 'version'],
    'L49: encounterModel is exactly these four fields');
  assert.equal(model.version, MODEL_VERSION, 'L49');
  assert.equal(model.nextEncounterId, 1, 'L49: nextEncounterId starts at 1');
  assert.equal(model.encounter, null, 'L49: encounter is null before the first Begin');
  assert.deepEqual(model.inputHistory, [], 'L49: inputHistory starts empty');

  assert.equal(snapshot.world.ecologyModel.config.version, 'ecology-config-v2', 'L36');
  assert.equal(snapshot.world.ecologyModel.reservedWolves, 0, 'L77: reservedWolves is 0 while idle');
  assert.equal(snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 0, 'L77');
  assert.equal(snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES, 'L47: 14 real living wolves');
  assert.equal(snapshot.world.marketModel.config.version, 'market-config-v2', 'L36');
  assert.equal(snapshot.world.actorModel.config.version, 'actor-config-v4', 'L36');
  assert.equal(snapshot.world.societyModel.config.version, 'society-config-v4', 'L36');
  assert.equal(snapshot.world.memoryModel.config.version, 'memory-config-v5', 'L36');

  const player = playerActor(bundle);
  assert.equal(player.alive, true);
  assert.ok([HOME_LOCATION, ENCOUNTER_LOCATION].includes(player.location),
    'actors.mjs:67: actor-config-v4 permits actor-4 only in the village or the forest');
  assert.equal(player.health, PLAYER_BASELINE_HEALTH,
    'L47: the initializer only swaps the five config versions, so the survival baseline 1000 stands');

  assert.ok(snapshot.scheduledTasks.some((task) => task.systemId === 'society' && task.intervalTicks === 144 &&
    task.nextDueTick === 144), 'the daily settlement task must exist at tick 144');
  assert.ok(snapshot.scheduledTasks.some((task) => task.systemId === 'survival' && task.nextDueTick === 1),
    'the tick-1 survival publication must remain so tick 1 is a real activity tick');

  assertConservation(snapshot.world);
  assertCursors(bundle);
  assertPublished(bundle);
});

test('G2b recipes: five constructible recipes, affordable default, unknown recipe fails closed', () => {
  for (const recipe of ['affordable', 'earn-then-buy', 'no-opportunity', 'wage-refused', 'no-food']) {
    const config = defaultEncounterVillageConfig(recipe);
    assert.ok(config && typeof config === 'object', `recipe ${recipe} must be constructible`);
    const bundle = createEncounterVillage(42, ENCOUNTER_PROFILE, config).bundle;
    assert.equal(bundle.snapshot.rulesVersion, ENCOUNTER_RULES);
    assert.equal(bundle.snapshot.world.encounterModel.nextEncounterId, 1);
    assert.equal(bundle.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES);
  }
  assert.equal(canonicalJson(defaultEncounterVillageConfig()),
    canonicalJson(defaultEncounterVillageConfig('affordable')), 'L47: affordable stays the default recipe');
  assert.equal(createEncounterVillage().bundle.snapshot.simulationId, ENCOUNTER_PROFILE,
    'L47: the default argument path is simulationId = encounter-survival-village');
  throwsCode(() => defaultEncounterVillageConfig('no-such-recipe'), 'UNSUPPORTED_VERSION',
    'unknown recipe must fail closed');
});

// ---------------------------------------------------------------------------
// G3 — the combat chain (L51, L67, L87-88)
// ---------------------------------------------------------------------------

test('G3 combat chain: begin 0t -> attack 6t wolf 300->150 counter 80 -> attack 6t kill, win, no counter', () => {
  const b0 = ensureForest(freshVillage());
  const t0 = b0.snapshot.tick;
  const c0 = b0.snapshot.instantCommits;
  const beginDto = dto3('EncounterBegin', {}, 'g3-begin', b0.snapshot.revision);

  const first = submit(b0, beginDto);
  const b1 = first.bundle;
  assert.equal(first.receipt.outcome, 'succeeded');
  assert.equal(first.receipt.fromRevision, t0 + c0);
  assert.equal(first.receipt.toRevision, t0 + c0 + 1);
  assert.equal(first.receipt.fromTick, t0);
  assert.equal(first.receipt.tick, t0);
  assert.equal(first.receipt.durationTicks, BEGIN_TICKS, 'L87: Begin advances zero ticks');
  assertEncounterResultShape(first.receipt.result);
  const beginResult = first.receipt.result;
  assert.equal(beginResult.action, 'begin');
  assert.equal(beginResult.reasonCode, null);
  assert.equal(beginResult.encounterId, 'encounter-1', 'L51: the first encounter id is encounter-1');
  assert.equal(beginResult.before.status, 'none', 'L67: no encounter means status none and a null wolf health');
  assert.equal(beginResult.before.wolfHealth, null);
  assert.equal(beginResult.before.resolution, null);
  assert.equal(beginResult.before.playerHealth, PLAYER_BASELINE_HEALTH);
  assert.equal(beginResult.before.playerAlive, true);
  assert.equal(beginResult.before.totalLivingWolves, INITIAL_LIVING_WOLVES);
  assert.equal(beginResult.before.reservedWolves, 0);
  assert.equal(beginResult.before.availableWolves, INITIAL_LIVING_WOLVES);
  assert.equal(beginResult.before.battleDeaths, 0);
  assert.equal(beginResult.before.tick, t0);
  assert.equal(beginResult.after.status, 'active');
  assert.equal(beginResult.after.wolfHealth, WOLF_MAX_HEALTH, 'L87: the wolf starts at 300');
  assert.equal(beginResult.after.reservedWolves, 1, 'L53: exactly one wolf is reserved');
  assert.equal(beginResult.after.availableWolves, INITIAL_LIVING_WOLVES - 1, 'L77: available = total - reserved');
  assert.equal(beginResult.after.totalLivingWolves, INITIAL_LIVING_WOLVES);
  assert.equal(beginResult.after.battleDeaths, 0);
  assert.equal(beginResult.after.resolution, null);
  assert.equal(beginResult.after.playerHealth, PLAYER_BASELINE_HEALTH);
  assert.equal(beginResult.after.playerAlive, true);
  assert.equal(beginResult.after.tick, t0);

  const encounter1 = b1.snapshot.world.encounterModel.encounter;
  assert.deepEqual(Object.keys(encounter1).sort(), ENCOUNTER_FIELDS_SORTED,
    'L51: one encounter carries exactly the fourteen contract fields');
  assert.equal(Object.prototype.hasOwnProperty.call(encounter1, 'wolfDied'), false,
    'L51: wolfDied is derived from wolf health and must never be stored');
  assert.equal(encounter1.encounterId, 'encounter-1');
  assert.equal(encounter1.actorId, ACTOR_ID);
  assert.equal(encounter1.location, ENCOUNTER_LOCATION);
  assert.equal(encounter1.status, 'active');
  assert.equal(encounter1.resolution, null);
  assert.equal(encounter1.startTick, t0);
  assert.equal(encounter1.endTick, null);
  assert.equal(encounter1.initialPlayerHealth, PLAYER_BASELINE_HEALTH, 'L51: initialPlayerHealth is the historical anchor');
  assert.equal(encounter1.wolfHealth, WOLF_MAX_HEALTH);
  assert.equal(encounter1.attackCount, 0);
  assert.equal(encounter1.elapsedTicks, 0, 'L51: active elapsedTicks = current tick - startTick');
  assert.equal(encounter1.beginCommandId, 'g3-begin');
  assert.equal(encounter1.lastCommandId, 'g3-begin');
  assert.equal(encounter1.reserved, true);
  assert.equal(b1.snapshot.world.encounterModel.nextEncounterId, 2, 'L53: only a successful Begin consumes an id');
  assert.equal(b1.snapshot.world.ecologyModel.reservedWolves, 1);
  assert.equal(b1.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES, 'L79: reserving is not a death');
  assert.equal(b1.snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 0);
  assert.equal(b1.snapshot.tick, t0);
  assert.equal(b1.snapshot.instantCommits, c0 + 1, 'L34: a zero-tick commit grows instantCommits, not tick');
  assertRevisionInvariant(b1);

  const attack1Dto = dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'g3-attack-1',
    b1.snapshot.revision);
  const second = submit(b1, attack1Dto);
  const b2 = second.bundle;
  assert.equal(second.receipt.outcome, 'succeeded');
  assert.equal(second.receipt.fromRevision, t0 + c0 + 1);
  assert.equal(second.receipt.toRevision, t0 + c0 + 7);
  assert.equal(second.receipt.fromTick, t0);
  assert.equal(second.receipt.tick, t0 + ATTACK_TICKS);
  assert.equal(second.receipt.durationTicks, ATTACK_TICKS, 'L87: an attack advances six ticks');
  const attack1Result = second.receipt.result;
  assert.equal(attack1Result.action, 'attack');
  assert.equal(attack1Result.reasonCode, null);
  assert.equal(attack1Result.encounterId, 'encounter-1');
  assert.equal(attack1Result.before.tick, t0);
  assert.equal(attack1Result.before.wolfHealth, WOLF_MAX_HEALTH);
  assert.equal(attack1Result.before.playerHealth, PLAYER_BASELINE_HEALTH);
  assert.equal(attack1Result.after.tick, t0 + ATTACK_TICKS);
  assert.equal(attack1Result.after.wolfHealth, WOLF_MAX_HEALTH - WOLF_HIT_DAMAGE, 'L87: the strike lands first, 300-150');
  assert.equal(attack1Result.after.playerHealth, PLAYER_WOUNDED_HEALTH,
    'L87: the surviving wolf counters for 80, 1000-80 = 920');
  assert.equal(attack1Result.after.playerAlive, true);
  assert.equal(attack1Result.after.status, 'active');
  assert.equal(attack1Result.after.resolution, null);
  assert.equal(attack1Result.after.reservedWolves, 1);
  assert.equal(attack1Result.after.availableWolves, INITIAL_LIVING_WOLVES - 1);
  assert.equal(attack1Result.after.totalLivingWolves, INITIAL_LIVING_WOLVES);
  assert.equal(attack1Result.after.battleDeaths, 0);
  const encounter2 = b2.snapshot.world.encounterModel.encounter;
  assert.equal(encounter2.wolfHealth, 150, 'L51: wolfHealth is only ever 300, 150 or 0');
  assert.equal(encounter2.attackCount, 1, 'L51: attackCount is only ever 0, 1 or 2');
  assert.equal(encounter2.endTick, null);
  assert.equal(encounter2.elapsedTicks, ATTACK_TICKS);
  assert.equal(encounter2.lastCommandId, 'g3-attack-1');
  assert.equal(encounter2.initialPlayerHealth, PLAYER_BASELINE_HEALTH,
    'L88: the anchor stays historical while the authoritative body carries the current value');
  assert.equal(playerActor(b2).health, PLAYER_WOUNDED_HEALTH, 'L88: the authority for current health is the actor body');
  assert.equal(b2.snapshot.tick, t0 + ATTACK_TICKS);
  assert.equal(b2.snapshot.instantCommits, c0 + 1, 'L34: a six-tick action advances tick, not instantCommits');
  assertRevisionInvariant(b2);
  assert.equal(b2.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES);
  assert.equal(b2.snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 0);

  const attack2Dto = dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'g3-attack-2',
    b2.snapshot.revision);
  const third = submit(b2, attack2Dto);
  const b3 = third.bundle;
  assert.equal(third.receipt.outcome, 'succeeded');
  assert.equal(third.receipt.fromRevision, t0 + c0 + 7);
  assert.equal(third.receipt.toRevision, t0 + c0 + 13);
  assert.equal(third.receipt.fromTick, t0 + ATTACK_TICKS);
  assert.equal(third.receipt.tick, t0 + 2 * ATTACK_TICKS);
  assert.equal(third.receipt.durationTicks, ATTACK_TICKS);
  const attack2Result = third.receipt.result;
  assert.equal(attack2Result.action, 'attack');
  assert.equal(attack2Result.reasonCode, null);
  assert.equal(attack2Result.before.wolfHealth, 150);
  assert.equal(attack2Result.before.playerHealth, PLAYER_WOUNDED_HEALTH);
  assert.equal(attack2Result.after.wolfHealth, 0);
  assert.equal(attack2Result.after.playerHealth, PLAYER_WOUNDED_HEALTH, 'L87: the killing blow draws no counter-attack');
  assert.equal(attack2Result.after.playerAlive, true);
  assert.equal(attack2Result.after.status, 'closed');
  assert.equal(attack2Result.after.resolution, 'win');
  assert.equal(attack2Result.after.reservedWolves, 0, 'L53: a terminal state returns the reservation');
  assert.equal(attack2Result.after.totalLivingWolves, INITIAL_LIVING_WOLVES - 1);
  assert.equal(attack2Result.after.availableWolves, INITIAL_LIVING_WOLVES - 1);
  assert.equal(attack2Result.after.battleDeaths, 1, 'L79: only a win records a battle death');
  const encounter3 = b3.snapshot.world.encounterModel.encounter;
  assert.equal(encounter3.status, 'closed');
  assert.equal(encounter3.resolution, 'win');
  assert.equal(encounter3.endTick, t0 + 2 * ATTACK_TICKS);
  assert.equal(encounter3.elapsedTicks, 2 * ATTACK_TICKS, 'L51: closed elapsedTicks = endTick - startTick');
  assert.equal(encounter3.wolfHealth, 0);
  assert.equal(encounter3.attackCount, 2);
  assert.equal(encounter3.reserved, false);
  assert.equal(encounter3.lastCommandId, 'g3-attack-2');
  assert.equal(b3.snapshot.world.encounterModel.nextEncounterId, 2);
  assert.equal(b3.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(b3.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES - 1,
    'L79: the win removes exactly one living wolf');
  assert.equal(b3.snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 1);
  assert.equal(b3.snapshot.tick, t0 + 2 * ATTACK_TICKS);
  assertRevisionInvariant(b3);
  assertConservation(b3.snapshot.world);

  const beginEvent = assertCommandResolution(b3, beginDto, first.receipt, { requireCause: false });
  const attack1Event = assertCommandResolution(b3, attack1Dto, second.receipt, { requireCause: true });
  const attack2Event = assertCommandResolution(b3, attack2Dto, third.receipt, { requireCause: true });
  assert.ok(attack1Event.causationEventSeqs.includes(beginEvent.eventSeq),
    'L69: an action cites the successful Begin fact');
  assert.ok(attack2Event.causationEventSeqs.includes(beginEvent.eventSeq));
  assert.equal(b3.snapshot.world.encounterModel.inputHistory.length,
    b0.snapshot.world.encounterModel.inputHistory.length + 3);
  assertCursors(b3);
  assertPublished(b3);
});

// ---------------------------------------------------------------------------
// G4 — boundaries: HP80 loses, HP81 survives then wins, HP1 loses at zero (L83, L87-88)
// ---------------------------------------------------------------------------

test('G4a boundary HP80: the first counter kills the player, the wolf survives at 150 and no wolf dies', () => {
  const bundle = ensureForest(villageWithPlayerHealth(80));
  const t0 = bundle.snapshot.tick;
  const beginDto = dto3('EncounterBegin', {}, 'g4a-begin', bundle.snapshot.revision);
  const first = submit(bundle, beginDto);
  assert.equal(first.receipt.result.after.playerHealth, 80, 'L88: the Begin reads the config-derived body');
  assert.equal(first.receipt.result.after.status, 'active');
  const b1 = first.bundle;

  const attackDto = dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'g4a-attack',
    b1.snapshot.revision);
  const second = submit(b1, attackDto);
  const b2 = second.bundle;
  assert.equal(second.receipt.outcome, 'succeeded');
  assert.equal(second.receipt.durationTicks, ATTACK_TICKS);
  assert.equal(second.receipt.tick, t0 + ATTACK_TICKS);
  const result = second.receipt.result;
  assert.equal(result.after.wolfHealth, 150, 'L87: the player strike resolves before the counter');
  assert.equal(result.after.playerHealth, 0, 'L83: a lethal counter clamps health to exactly zero');
  assert.equal(result.after.playerAlive, false);
  assert.equal(result.after.status, 'closed');
  assert.equal(result.after.resolution, 'lose', 'L51: dying to the wolf counter is a loss, not a day-settlement death');
  assert.equal(result.after.reservedWolves, 0, 'L53: any terminal state returns the reservation');
  assert.equal(result.after.totalLivingWolves, INITIAL_LIVING_WOLVES, 'L53: the surviving wolf is still alive');
  assert.equal(result.after.availableWolves, INITIAL_LIVING_WOLVES);
  assert.equal(result.after.battleDeaths, 0, 'L79: only a win records a battle death');

  const encounter = b2.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.resolution, 'lose');
  assert.equal(encounter.endTick, t0 + ATTACK_TICKS);
  assert.equal(encounter.elapsedTicks, ATTACK_TICKS);
  assert.equal(encounter.wolfHealth, 150);
  assert.equal(encounter.attackCount, 1);
  assert.equal(encounter.reserved, false);
  assert.equal(b2.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(b2.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES);
  assert.equal(b2.snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 0);

  const player = playerActor(b2);
  assert.equal(player.health, 0, 'L83: death is health = 0');
  assert.equal(player.alive, false);
  assert.equal(player.deathTick, t0 + ATTACK_TICKS, 'L83: deathTick is the action completion tick');
  assert.equal(player.lastNeedsTick, t0 + ATTACK_TICKS, 'L83: lastNeedsTick is pinned to the death tick');
  assert.equal(player.needs.food, 0);
  assert.equal(player.needs.healing, 0);
  assert.equal(player.needs.rest, 0);
  assert.equal(b2.snapshot.world.actorModel.ledger.deaths, 1, 'L83: the actor ledger records exactly one death');
  assert.equal(b2.snapshot.world.encounterModel.nextEncounterId, 2, 'the Begin did succeed, so its id was consumed');
  assertConservation(b2.snapshot.world);
  assertPublished(b2);
});

test('G4b boundary HP81: the player survives the first counter on one hit point and the second attack wins', () => {
  const bundle = ensureForest(villageWithPlayerHealth(81));
  const t0 = bundle.snapshot.tick;
  const b1 = submit(bundle, dto3('EncounterBegin', {}, 'g4b-begin', bundle.snapshot.revision)).bundle;

  const firstAttack = attackOnce(b1, 'g4b-attack-1');
  const b2 = firstAttack.bundle;
  assert.equal(firstAttack.receipt.result.after.playerHealth, 1, '81 - 80 = 1, still alive');
  assert.equal(firstAttack.receipt.result.after.playerAlive, true);
  assert.equal(firstAttack.receipt.result.after.status, 'active');
  assert.equal(firstAttack.receipt.result.after.wolfHealth, 150);
  assert.equal(playerActor(b2).alive, true);
  assert.equal(playerActor(b2).deathTick, null);
  assert.equal(b2.snapshot.world.encounterModel.encounter.status, 'active');
  assert.equal(b2.snapshot.world.ecologyModel.reservedWolves, 1, 'L81: an active encounter keeps its reservation');

  const secondAttack = attackOnce(b2, 'g4b-attack-2');
  const b3 = secondAttack.bundle;
  assert.equal(secondAttack.receipt.result.after.wolfHealth, 0);
  assert.equal(secondAttack.receipt.result.after.playerHealth, 1, 'L87: the killing blow draws no counter');
  assert.equal(secondAttack.receipt.result.after.status, 'closed');
  assert.equal(secondAttack.receipt.result.after.resolution, 'win');
  assert.equal(secondAttack.receipt.result.after.battleDeaths, 1);
  assert.equal(b3.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES - 1);
  assert.equal(b3.snapshot.world.encounterModel.encounter.endTick, t0 + 2 * ATTACK_TICKS);
  assert.equal(playerActor(b3).alive, true);
  assertConservation(b3.snapshot.world);
});

test('G4c boundary HP1: the very first attack already loses and health clamps at zero, never negative', () => {
  const bundle = ensureForest(villageWithPlayerHealth(1));
  const t0 = bundle.snapshot.tick;
  const b1 = submit(bundle, dto3('EncounterBegin', {}, 'g4c-begin', bundle.snapshot.revision)).bundle;
  assert.equal(b1.snapshot.world.encounterModel.encounter.status, 'active');

  const attack = attackOnce(b1, 'g4c-attack');
  const b2 = attack.bundle;
  assert.equal(attack.receipt.outcome, 'succeeded');
  assert.equal(attack.receipt.durationTicks, ATTACK_TICKS);
  const result = attack.receipt.result;
  assert.equal(result.after.wolfHealth, 150, 'the player strike still lands before the lethal counter');
  assert.equal(result.after.playerHealth, 0, '1 - 80 clamps to 0 and must not become negative');
  assert.equal(result.after.playerAlive, false);
  assert.equal(result.after.status, 'closed');
  assert.equal(result.after.resolution, 'lose');
  assert.equal(result.after.reservedWolves, 0);
  assert.equal(result.after.battleDeaths, 0);
  assert.equal(b2.snapshot.world.encounterModel.encounter.wolfHealth, 150);
  assert.equal(playerActor(b2).health, 0);
  assert.equal(playerActor(b2).deathTick, t0 + ATTACK_TICKS);
  assert.equal(b2.snapshot.world.actorModel.ledger.deaths, 1);
  assert.equal(b2.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES);
  assertConservation(b2.snapshot.world);
});

// ---------------------------------------------------------------------------
// G5 — flee and cancel (L87-88)
// ---------------------------------------------------------------------------

test('G5a flee: fixed success over six ticks, no damage to either side, and it heals nothing', () => {
  const b1 = beginVillage('g5a-begin');
  const t0 = b1.snapshot.world.encounterModel.encounter.startTick;
  const wounded = attackOnce(b1, 'g5a-attack');
  const b2 = wounded.bundle;
  assert.equal(playerActor(b2).health, PLAYER_WOUNDED_HEALTH, 'precondition: the counter already wounded the player');

  const flee = submit(b2, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'flee' }, 'g5a-flee',
    b2.snapshot.revision));
  const b3 = flee.bundle;
  assert.equal(flee.receipt.outcome, 'succeeded');
  assert.equal(flee.receipt.durationTicks, FLEE_TICKS, 'L87: flee advances six ticks');
  assert.equal(flee.receipt.fromTick, t0 + ATTACK_TICKS);
  assert.equal(flee.receipt.tick, t0 + 2 * ATTACK_TICKS);
  const result = flee.receipt.result;
  assert.equal(result.action, 'flee');
  assert.equal(result.reasonCode, null, 'L87: flee always succeeds');
  assert.equal(result.before.playerHealth, PLAYER_WOUNDED_HEALTH);
  assert.equal(result.after.playerHealth, PLAYER_WOUNDED_HEALTH, 'L87: flee adds no damage and restores none');
  assert.equal(result.before.wolfHealth, 150);
  assert.equal(result.after.wolfHealth, 150, 'L87: flee does not damage the wolf');
  assert.equal(result.after.status, 'closed');
  assert.equal(result.after.resolution, 'flee');
  assert.equal(result.after.reservedWolves, 0);
  assert.equal(result.after.totalLivingWolves, INITIAL_LIVING_WOLVES);
  assert.equal(result.after.battleDeaths, 0);
  const encounter = b3.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.resolution, 'flee');
  assert.equal(encounter.endTick, t0 + 2 * ATTACK_TICKS);
  assert.equal(encounter.elapsedTicks, 2 * ATTACK_TICKS);
  assert.equal(encounter.wolfHealth, 150);
  assert.equal(encounter.attackCount, 1);
  assert.equal(encounter.reserved, false);
  assert.equal(playerActor(b3).health, PLAYER_WOUNDED_HEALTH, 'L87: neither action heals existing damage');
  assert.equal(b3.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(b3.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES);
  assert.equal(b3.snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 0);
  assertConservation(b3.snapshot.world);
  assertPublished(b3);
});

test('G5b cancel: zero ticks, no health change on either side, and the reservation is returned', () => {
  const b1 = beginVillage('g5b-begin');
  const t0 = b1.snapshot.world.encounterModel.encounter.startTick;
  const wounded = attackOnce(b1, 'g5b-attack');
  const b2 = wounded.bundle;

  const cancel = submit(b2, dto3('EncounterCancel', { encounterId: 'encounter-1' }, 'g5b-cancel',
    b2.snapshot.revision));
  const b3 = cancel.bundle;
  assert.equal(cancel.receipt.outcome, 'succeeded');
  assert.equal(cancel.receipt.durationTicks, CANCEL_TICKS, 'L87: cancel advances zero ticks');
  assert.equal(cancel.receipt.fromTick, t0 + ATTACK_TICKS);
  assert.equal(cancel.receipt.tick, t0 + ATTACK_TICKS);
  assert.equal(cancel.receipt.toRevision, b2.snapshot.revision + 1);
  const result = cancel.receipt.result;
  assert.equal(result.action, 'cancel');
  assert.equal(result.reasonCode, null);
  assert.equal(result.before.playerHealth, PLAYER_WOUNDED_HEALTH);
  assert.equal(result.after.playerHealth, PLAYER_WOUNDED_HEALTH, 'L87: cancel changes neither side');
  assert.equal(result.after.wolfHealth, 150);
  assert.equal(result.after.status, 'closed');
  assert.equal(result.after.resolution, 'cancel');
  assert.equal(result.after.reservedWolves, 0);
  assert.equal(result.after.battleDeaths, 0);
  const encounter = b3.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.resolution, 'cancel');
  assert.equal(encounter.endTick, t0 + ATTACK_TICKS, 'L51: a terminal state is pinned to the tick it happened on');
  assert.equal(encounter.elapsedTicks, ATTACK_TICKS, 'L51: closed elapsedTicks = endTick - startTick');
  assert.equal(encounter.reserved, false);
  assert.equal(b3.snapshot.tick, t0 + ATTACK_TICKS, 'L87: cancel does not move world time');
  assert.equal(b3.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(b3.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES);
  assert.equal(playerActor(b3).health, PLAYER_WOUNDED_HEALTH);
  assertConservation(b3.snapshot.world);
  assertPublished(b3);

  const immediate = beginVillage('g5b-begin-2');
  const t1 = immediate.snapshot.world.encounterModel.encounter.startTick;
  const cancelled = submit(immediate, dto3('EncounterCancel', { encounterId: 'encounter-1' }, 'g5b-cancel-2',
    immediate.snapshot.revision)).bundle;
  assert.equal(cancelled.snapshot.world.encounterModel.encounter.endTick, t1,
    'cancel closes at the tick it happened on');
  assert.equal(cancelled.snapshot.world.encounterModel.encounter.elapsedTicks, 0);
  assert.equal(cancelled.snapshot.tick, t1);
});

// ---------------------------------------------------------------------------
// G6 — executeEncounterIntent ordering and atomicity (L53, L65, L93)
// ---------------------------------------------------------------------------

test('G6a preflight: malformed DTO3 inputs and out-of-domain AdvanceTime payloads publish nothing', () => {
  const bundle = freshVillage();
  const before = stateOf(bundle);

  const missingVersion = dto3('EncounterBegin', {}, 'g6a-missing-version', 0);
  delete missingVersion.version;
  const missingCommandId = dto3('EncounterBegin', {}, 'g6a-missing-id', 0);
  delete missingCommandId.commandId;
  const missingPayload = dto3('EncounterBegin', {}, 'g6a-missing-payload', 0);
  delete missingPayload.payload;
  const extraKey = dto3('EncounterBegin', {}, 'g6a-extra', 0);
  extraKey.handler = 'json';
  const missingType = dto3('EncounterBegin', {}, 'g6a-no-type', 0);
  delete missingType.type;
  const missingRevision = dto3('EncounterBegin', {}, 'g6a-no-rev', 0);
  delete missingRevision.expectedRevision;

  const cases = [
    ['missing version', missingVersion, 'INVALID_INPUT'],
    ['dto version 2', { ...dto3('EncounterBegin', {}, 'g6a-v2', 0), version: 2 }, 'UNSUPPORTED_VERSION'],
    ['dto version 4', { ...dto3('EncounterBegin', {}, 'g6a-v4', 0), version: 4 }, 'UNSUPPORTED_VERSION'],
    ['missing commandId', missingCommandId, 'INVALID_INPUT'],
    ['empty commandId', dto3('EncounterBegin', {}, '', 0), 'INVALID_INPUT'],
    ['over-long commandId', dto3('EncounterBegin', {}, 'x'.repeat(65), 0), 'INVALID_INPUT'],
    ['missing expectedRevision', missingRevision, 'INVALID_INPUT'],
    ['negative expectedRevision', dto3('EncounterBegin', {}, 'g6a-neg', -1), 'INVALID_INPUT'],
    ['fractional expectedRevision', dto3('EncounterBegin', {}, 'g6a-frac', 1.5), 'INVALID_INPUT'],
    ['string expectedRevision', dto3('EncounterBegin', {}, 'g6a-str', '0'), 'INVALID_INPUT'],
    ['missing type', missingType, 'INVALID_INPUT'],
    ['missing payload', missingPayload, 'INVALID_INPUT'],
    ['null payload', dto3('EncounterBegin', null, 'g6a-null', 0), 'INVALID_INPUT'],
    ['array payload', dto3('EncounterBegin', [], 'g6a-arr', 0), 'INVALID_INPUT'],
    ['extra top-level key', extraKey, 'INVALID_INPUT'],
    // L63: AdvanceTime ticks must be a positive integer in 1..144000.
    ['AdvanceTime ticks 0', dto3('AdvanceTime', { ticks: 0 }, 'g6a-ticks-0', 0), 'INVALID_INPUT'],
    ['AdvanceTime ticks 144001', dto3('AdvanceTime', { ticks: 144001 }, 'g6a-ticks-max', 0), 'INVALID_INPUT'],
    ['AdvanceTime fractional ticks', dto3('AdvanceTime', { ticks: 1.5 }, 'g6a-ticks-frac', 0), 'INVALID_INPUT'],
    ['AdvanceTime string ticks', dto3('AdvanceTime', { ticks: '6' }, 'g6a-ticks-str', 0), 'INVALID_INPUT'],
  ];
  for (const [label, dto, code] of cases) {
    throwsCode(() => executeEncounterIntent(bundle, dto), code, label);
    assert.equal(stateOf(bundle), before, `${label} must publish nothing at all`);
  }
  assert.equal(bundle.snapshot.world.encounterModel.nextEncounterId, 1);
  assert.equal(bundle.snapshot.world.encounterModel.inputHistory.length, 0);
  assert.equal(bundle.eventLog.length, 0);
});

test('G6b 4096-byte input budget: an oversized input is refused as LIMIT_EXCEEDED with nothing published', () => {
  const bundle = ensureForest(freshVillage());
  const before = stateOf(bundle);
  const baselineEvents = bundle.eventLog.length;
  const oversized = dto3('EncounterAction',
    { encounterId: 'encounter-1', action: 'attack', padding: 'x'.repeat(5000) }, 'g6b-oversized',
  bundle.snapshot.revision);
  assert.ok(Buffer.byteLength(canonicalJson(oversized), 'utf8') > INPUT_BYTE_BUDGET,
    'precondition: the input must exceed the UTF-8 byte budget');
  throwsCode(() => executeEncounterIntent(bundle, oversized), 'LIMIT_EXCEEDED', 'oversized input');
  assert.equal(stateOf(bundle), before, 'L53: an over-budget input is refused as a whole');
  assert.equal(bundle.snapshot.world.encounterModel.nextEncounterId, 1);
  assert.equal(bundle.eventLog.length, baselineEvents);

  const small = dto3('EncounterBegin', {}, 'g6b-small', bundle.snapshot.revision);
  assert.ok(Buffer.byteLength(canonicalJson(small), 'utf8') <= INPUT_BYTE_BUDGET);
  const accepted = submit(bundle, small);
  assert.equal(accepted.receipt.outcome, 'succeeded', 'a within-budget input is still accepted');
});

test('G6c canonical dedup: the same id with the same canonical input replays its receipt, a different input conflicts', () => {
  const b0 = ensureForest(freshVillage());
  const beginDto = dto3('EncounterBegin', {}, 'g6c-begin', b0.snapshot.revision);
  const first = submit(b0, beginDto);
  assert.equal(first.receipt.outcome, 'succeeded', 'precondition: the Begin commits');
  const b1 = first.bundle;

  const permuted = { payload: {}, type: 'EncounterBegin', expectedRevision: beginDto.expectedRevision,
    commandId: 'g6c-begin', version: 3 };
  const retry = executeEncounterIntent(b1, permuted);
  assert.equal(retry.receipt.commandId, 'g6c-begin');
  assert.deepEqual(retry.receipt, first.receipt, 'L93: an identical retry returns the original receipt3');
  assert.notEqual(retry.receipt, first.receipt, 'the retry must hand back a copy, not the stored object');
  assert.equal(retry.bundle.snapshot.world.encounterModel.inputHistory.length,
    b1.snapshot.world.encounterModel.inputHistory.length, 'L93: a retry does not re-commit');
  assert.equal(retry.bundle.eventLog.length, b1.eventLog.length);
  assert.equal(retry.bundle.snapshot.revision, b1.snapshot.revision);

  const before = stateOf(b1);
  throwsCode(() => executeEncounterIntent(b1,
    dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'g6c-begin', 999)),
  'COMMAND_ID_CONFLICT', 'same id with different input');
  assert.equal(stateOf(b1), before, 'a conflicting id publishes nothing');
  assert.equal(b1.snapshot.world.encounterModel.nextEncounterId, 2, 'the conflict must not consume an id');
});

test('G6d a new id with a stale expectedRevision is REVISION_CONFLICT and consumes neither id nor budget', () => {
  const bundle = ensureForest(freshVillage());
  const before = stateOf(bundle);
  const historyBaseline = bundle.snapshot.world.encounterModel.inputHistory.length;
  throwsCode(() => executeEncounterIntent(bundle, dto3('EncounterBegin', {}, 'g6d-begin', bundle.snapshot.revision + 1)),
    'REVISION_CONFLICT', 'stale expectedRevision');
  assert.equal(stateOf(bundle), before, 'L65: a stale revision leaves the bundle untouched');
  assert.equal(bundle.snapshot.world.encounterModel.nextEncounterId, 1, 'L65: a stale revision consumes no id');
  assert.equal(bundle.snapshot.world.encounterModel.inputHistory.length, historyBaseline,
    'L65: a stale revision consumes no budget');

  const accepted = submit(bundle, dto3('EncounterBegin', {}, 'g6d-begin', bundle.snapshot.revision));
  assert.equal(accepted.receipt.outcome, 'succeeded', 'L65: the refused id is still fresh afterwards');
  assert.equal(accepted.bundle.snapshot.world.encounterModel.inputHistory.length, historyBaseline + 1);
  assert.equal(accepted.bundle.snapshot.world.encounterModel.nextEncounterId, 2);
});

test('G6e 128-entry input budget: the history fills to exactly 128 and the next new id is LIMIT_EXCEEDED', () => {
  let bundle = ensureForest(freshVillage());
  const beginDto = dto3('EncounterBegin', {}, 'g6e-begin', bundle.snapshot.revision);
  bundle = submit(bundle, beginDto).bundle;
  assert.equal(bundle.snapshot.world.encounterModel.encounter.status, 'active');

  const remaining = MAX_INPUT_HISTORY - bundle.snapshot.world.encounterModel.inputHistory.length;
  for (let index = 0; index < remaining; index += 1) {
    const out = submit(bundle, dto3('PlayerRest', {}, `g6e-rest-${index}`, bundle.snapshot.revision));
    assert.equal(out.receipt.outcome, 'rejected');
    assert.deepEqual(out.receipt.result, { code: 'ENCOUNTER_BUSY' },
      'L89: an accepted domain rejection carries exactly {code:ENCOUNTER_BUSY}');
    assert.equal(out.receipt.durationTicks, 0, 'L89: the refusal must not secretly advance time');
    assert.equal(out.bundle.snapshot.tick, bundle.snapshot.tick);
    bundle = out.bundle;
  }
  assert.equal(bundle.snapshot.world.encounterModel.inputHistory.length, MAX_INPUT_HISTORY,
    'L49: exactly 128 accepted inputs are recorded');

  const before = stateOf(bundle);
  throwsCode(() => executeEncounterIntent(bundle, dto3('PlayerRest', {}, 'g6e-overflow', bundle.snapshot.revision)),
    'LIMIT_EXCEEDED', 'the 129th accepted input');
  assert.equal(stateOf(bundle), before, 'L49: an over-budget input leaves no partial events behind');

  const storedBegin = historyEntry(bundle, 'g6e-begin');
  const retry = executeEncounterIntent(bundle, beginDto);
  assert.equal(retry.receipt.commandId, 'g6e-begin', 'L93: dedup is checked before the budget');
  assert.deepEqual(retry.receipt, storedBegin.receipt,
    'L93: a replayed id returns the original receipt even when the budget is full');
  assert.equal(retry.bundle.snapshot.world.encounterModel.inputHistory.length, MAX_INPUT_HISTORY);
  assertPublished(bundle);
});

test('G6f atomic publication: one resolved event and one history entry per accepted input, published together', () => {
  const afterBegin = beginVillage('g6f-begin');
  const bundle = attackOnce(afterBegin, 'g6f-attack').bundle;
  assert.equal(bundle.snapshot.world.encounterModel.inputHistory.length,
    afterBegin.snapshot.world.encounterModel.inputHistory.length + 1);
  assert.equal(encounterEvents(bundle).length, encounterEvents(afterBegin).length + 1);
  assert.equal(bundle.snapshot.nextEventSeq, bundle.eventLog.length + 1);

  const beginEvent = eventFor(bundle, 'g6f-begin');
  const attackEvent = eventFor(bundle, 'g6f-attack');
  assert.ok(beginEvent.eventSeq < attackEvent.eventSeq, 'facts are appended in commit order');
  assert.equal(attackEvent.tick, bundle.snapshot.tick, 'the fact is stamped with the completion tick');
  assert.equal(attackEvent.tick, attackEvent.payload.receipt.tick);
  assert.equal(historyEntry(bundle, 'g6f-attack').receipt.tick, bundle.snapshot.tick);
  assert.equal(historyEntry(bundle, 'g6f-begin').receipt.tick, afterBegin.snapshot.tick);
  assertPublished(bundle);
});

// ---------------------------------------------------------------------------
// G7 — the closed set of six domain rejection codes (L67, L88-89)
// ---------------------------------------------------------------------------

test('G7a ENCOUNTER_BUSY: begin while active, and every world command during ACTIVE', () => {
  const b0 = ensureForest(freshVillage());
  const b1 = submit(b0, dto3('EncounterBegin', {}, 'g7a-begin', b0.snapshot.revision)).bundle;
  const historyBefore = b1.snapshot.world.encounterModel.inputHistory.length;

  // Begin is an encounter command, so its refusal is the six-field encounter result (L67) — only the
  // world commands below use the legacy {code} rejection shape (L89).
  const busy = submit(b1, dto3('EncounterBegin', {}, 'g7a-begin-2', b1.snapshot.revision));
  assert.equal(busy.receipt.outcome, 'rejected');
  assertEncounterResultShape(busy.receipt.result);
  assert.equal(busy.receipt.result.action, 'begin');
  assert.equal(busy.receipt.result.reasonCode, 'ENCOUNTER_BUSY');
  assert.equal(busy.receipt.durationTicks, 0);
  assert.equal(busy.receipt.tick, b1.snapshot.tick);
  assert.equal(busy.receipt.toRevision, b1.snapshot.revision + 1, 'L34: the rejection still grows revision');
  assert.equal(busy.bundle.snapshot.instantCommits, b1.snapshot.instantCommits + 1);
  assert.equal(busy.bundle.snapshot.world.encounterModel.nextEncounterId, 2,
    'L53: a refused Begin must not consume an id');
  assert.deepEqual(busy.bundle.snapshot.world.encounterModel.encounter, b1.snapshot.world.encounterModel.encounter);
  assert.equal(busy.bundle.snapshot.world.ecologyModel.reservedWolves, 1);

  let bundle = busy.bundle;
  for (const [type, payload] of [['AdvanceTime', { ticks: 1 }], ['PlayerTravel', { destination: 'village' }],
    ['PlayerRest', {}], ['PlayerBuy', { product: 'food', quantity: 1 }], ['PlayerSell', { product: 'food', quantity: 1 }]]) {
    const out = submit(bundle, dto3(type, payload, `g7a-${type}`, bundle.snapshot.revision));
    assert.equal(out.receipt.outcome, 'rejected', `L89: ${type} must be a domain rejection while ACTIVE`);
    assert.equal(out.receipt.status, 'committed');
    assert.deepEqual(out.receipt.result, { code: 'ENCOUNTER_BUSY' },
      `L89: ${type} must return exactly {code:ENCOUNTER_BUSY}, never the legacy RULE_REJECTED shape`);
    assert.equal(out.receipt.durationTicks, 0, `L89: ${type} must not advance the world`);
    assert.equal(out.receipt.tick, bundle.snapshot.tick);
    assert.equal(out.bundle.snapshot.tick, bundle.snapshot.tick, 'tick must not move');
    assert.equal(out.bundle.snapshot.instantCommits, bundle.snapshot.instantCommits + 1);
    assert.equal(out.bundle.snapshot.revision, bundle.snapshot.revision + 1);
    assert.equal(out.bundle.snapshot.world.encounterModel.encounter.status, 'active');
    assert.equal(out.bundle.snapshot.world.ecologyModel.reservedWolves, 1);
    bundle = out.bundle;
  }
  assert.equal(bundle.snapshot.world.encounterModel.inputHistory.length, historyBefore + 6,
    'L69: every accepted rejection is recorded in the history');
  assertPublished(bundle);
});

test('G7b ENCOUNTER_UNAVAILABLE: acting or cancelling with no encounter at all', () => {
  let bundle = freshVillage();
  for (const [type, payload, commandId] of [
    ['EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'g7b-attack'],
    ['EncounterAction', { encounterId: 'encounter-1', action: 'flee' }, 'g7b-flee'],
    ['EncounterCancel', { encounterId: 'encounter-1' }, 'g7b-cancel'],
  ]) {
    const out = submit(bundle, dto3(type, payload, commandId, bundle.snapshot.revision));
    assert.equal(out.receipt.outcome, 'rejected');
    assertEncounterResultShape(out.receipt.result);
    assert.equal(out.receipt.result.reasonCode, 'ENCOUNTER_UNAVAILABLE', `L67: ${type} without an encounter`);
    assert.equal(out.receipt.durationTicks, 0);
    assert.equal(out.receipt.result.before.status, 'none');
    assert.equal(out.receipt.result.after.status, 'none');
    assert.equal(out.receipt.result.before.wolfHealth, null);
    assert.equal(out.receipt.result.after.wolfHealth, null);
    assert.equal(out.receipt.result.before.resolution, null);
    assert.equal(out.receipt.result.before.reservedWolves, 0);
    assert.equal(out.receipt.result.before.availableWolves, INITIAL_LIVING_WOLVES);
    assert.equal(out.receipt.result.before.playerHealth, PLAYER_BASELINE_HEALTH);
    assert.equal(out.receipt.result.before.playerAlive, true);
    assert.equal(canonicalJson(out.receipt.result.before), canonicalJson(out.receipt.result.after),
      'a domain rejection changes no state');
    assert.equal(out.bundle.snapshot.world.encounterModel.encounter, null);
    assert.equal(out.bundle.snapshot.world.encounterModel.nextEncounterId, 1);
    assert.equal(out.bundle.snapshot.tick, bundle.snapshot.tick);
    assert.equal(out.bundle.snapshot.world.ecologyModel.reservedWolves, 0);
    bundle = out.bundle;
  }
  assert.equal(bundle.snapshot.revision, 3, 'L34: three zero-tick rejections grow revision by three');
  assert.equal(bundle.snapshot.tick, 0);
  assertPublished(bundle);
});

test('G7c ENCOUNTER_ID_MISMATCH: acting on another encounter id while one is active', () => {
  const b1 = beginVillage('g7c-begin');
  const out = submit(b1, dto3('EncounterAction', { encounterId: 'encounter-7', action: 'attack' }, 'g7c-attack',
    b1.snapshot.revision));
  assert.equal(out.receipt.outcome, 'rejected');
  assertEncounterResultShape(out.receipt.result);
  assert.equal(out.receipt.result.reasonCode, 'ENCOUNTER_ID_MISMATCH');
  assert.equal(out.receipt.durationTicks, 0);
  const encounter = out.bundle.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.encounterId, 'encounter-1');
  assert.equal(encounter.status, 'active');
  assert.equal(encounter.wolfHealth, WOLF_MAX_HEALTH, 'a mismatched id must not damage the wolf');
  assert.equal(encounter.attackCount, 0);
  assert.equal(playerActor(out.bundle).health, PLAYER_BASELINE_HEALTH, 'a mismatched id must not wound the player');
  assert.equal(out.bundle.snapshot.tick, b1.snapshot.tick, 'a mismatched id must not advance time');
  assert.equal(out.bundle.snapshot.world.ecologyModel.reservedWolves, 1);
  assert.equal(out.bundle.snapshot.world.encounterModel.nextEncounterId, 2);
  assertPublished(out.bundle);
});

test('G7d ENCOUNTER_CLOSED: a concluded encounter refuses further actions but a new one may begin', () => {
  let bundle = beginVillage('g7d-begin');
  const t0 = bundle.snapshot.world.encounterModel.encounter.startTick;
  bundle = attackOnce(bundle, 'g7d-attack-1').bundle;
  bundle = attackOnce(bundle, 'g7d-attack-2').bundle;
  assert.equal(bundle.snapshot.world.encounterModel.encounter.resolution, 'win');

  const closed = submit(bundle, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g7d-attack-3', bundle.snapshot.revision));
  assert.equal(closed.receipt.outcome, 'rejected');
  assertEncounterResultShape(closed.receipt.result);
  assert.equal(closed.receipt.result.reasonCode, 'ENCOUNTER_CLOSED');
  assert.equal(closed.receipt.durationTicks, 0);
  assert.equal(closed.bundle.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES - 1,
    'a refused action on a closed encounter must not kill another wolf');
  assert.equal(closed.bundle.snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 1);
  assert.equal(closed.bundle.snapshot.world.encounterModel.nextEncounterId, 2);

  const next = submit(closed.bundle, dto3('EncounterBegin', {}, 'g7d-begin-2', closed.bundle.snapshot.revision));
  assert.equal(next.receipt.outcome, 'succeeded', 'L53: a new encounter may begin after the previous one closed');
  const result = next.receipt.result;
  assert.equal(result.encounterId, 'encounter-2');
  assert.equal(result.after.status, 'active');
  assert.equal(result.after.wolfHealth, WOLF_MAX_HEALTH, 'the new encounter reserves a fresh wolf');
  assert.equal(result.after.totalLivingWolves, INITIAL_LIVING_WOLVES - 1);
  assert.equal(result.after.reservedWolves, 1);
  assert.equal(result.after.availableWolves, INITIAL_LIVING_WOLVES - 2);
  assert.equal(result.after.battleDeaths, 1);
  assert.equal(result.after.playerHealth, PLAYER_WOUNDED_HEALTH,
    'L88: the new encounter reads the current body, not the old baseline');
  const encounter = next.bundle.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.encounterId, 'encounter-2');
  assert.equal(encounter.startTick, t0 + 2 * ATTACK_TICKS);
  assert.equal(encounter.initialPlayerHealth, PLAYER_WOUNDED_HEALTH,
    'L88: initialPlayerHealth anchors the body value at this Begin, not the previous encounter');
  assert.equal(next.bundle.snapshot.world.encounterModel.nextEncounterId, 3);
  assertConservation(next.bundle.snapshot.world);
  assertPublished(next.bundle);
});

test('G7e PLAYER_DEAD: a player who died to the wolf cannot begin another encounter', () => {
  // Derive the corpse entirely through the real chain: a config-derived 80 HP body loses to the
  // first counter while standing in the forest, so PLAYER_DEAD is the only reason left to refuse.
  const wounded = ensureForest(villageWithPlayerHealth(80));
  const lost = attackOnce(submit(wounded, dto3('EncounterBegin', {}, 'g7e-begin-1',
    wounded.snapshot.revision)).bundle, 'g7e-attack');
  const bundle = lost.bundle;
  assert.equal(lost.receipt.result.after.resolution, 'lose');
  assert.equal(playerActor(bundle).alive, false, 'precondition: the real counter killed the body');
  assert.equal(playerActor(bundle).location, ENCOUNTER_LOCATION, 'precondition: the corpse is still in the forest');

  const out = submit(bundle, dto3('EncounterBegin', {}, 'g7e-begin', bundle.snapshot.revision));
  assert.equal(out.receipt.outcome, 'rejected');
  assertEncounterResultShape(out.receipt.result);
  assert.equal(out.receipt.result.reasonCode, 'PLAYER_DEAD');
  assert.equal(out.receipt.durationTicks, 0);
  assert.equal(out.receipt.result.before.playerAlive, false);
  assert.equal(out.receipt.result.after.playerAlive, false);
  assert.equal(out.receipt.result.before.status, 'closed', 'the previous encounter stays closed');
  assert.equal(out.receipt.result.after.status, 'closed');
  assert.equal(out.bundle.snapshot.world.encounterModel.nextEncounterId, 2,
    'a refused Begin must not consume an id');
  assert.equal(out.bundle.snapshot.world.ecologyModel.reservedWolves, 0, 'no wolf may be reserved for a dead player');
  assert.equal(out.bundle.snapshot.tick, bundle.snapshot.tick, 'L89: the refusal advances no time');
  assert.equal(out.bundle.snapshot.revision, bundle.snapshot.revision + 1,
    'L34: the refusal is still an accepted zero-tick command');
  assertRevisionInvariant(out.bundle);
  assertPublished(out.bundle);
});

test('G7f RULE_REJECTED: begin is refused when the player is not in the forest', () => {
  const bundle = awayFromForest('g7f');
  assert.notEqual(playerActor(bundle).location, ENCOUNTER_LOCATION, 'precondition: the player is away from the forest');
  const out = submit(bundle, dto3('EncounterBegin', {}, 'g7f-begin', bundle.snapshot.revision));
  assert.equal(out.receipt.outcome, 'rejected');
  assertEncounterResultShape(out.receipt.result);
  assert.equal(out.receipt.result.reasonCode, 'RULE_REJECTED',
    'L57: canBegin derives from the real position, so the begin rule rejects outside the forest');
  assert.equal(out.receipt.durationTicks, 0);
  assert.equal(out.bundle.snapshot.world.encounterModel.encounter, null);
  assert.equal(out.bundle.snapshot.world.encounterModel.nextEncounterId, 1);
  assert.equal(out.bundle.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(out.bundle.snapshot.tick, bundle.snapshot.tick);
  assert.equal(out.bundle.snapshot.revision, bundle.snapshot.revision + 1);
  assertPublished(out.bundle);
});

// ---------------------------------------------------------------------------
// G8 — describeEncounterActions (L57)
// ---------------------------------------------------------------------------

test('G8 describeEncounterActions: exactly eleven keys and capabilities derived from the real state', () => {
  const idleBundle = ensureForest(freshVillage());
  const idle = describeEncounterActions(idleBundle);
  assert.deepEqual(Object.keys(idle).sort(), ACTIONS_FIELDS.slice().sort(),
    'L57: describeEncounterActions returns exactly eleven keys');
  assert.equal(idle.profile, ENCOUNTER_PROFILE);
  assert.equal(idle.rulesVersion, ENCOUNTER_RULES);
  assert.equal(idle.beginTicks, BEGIN_TICKS);
  assert.equal(idle.attackTicks, ATTACK_TICKS);
  assert.equal(idle.fleeTicks, FLEE_TICKS);
  assert.equal(idle.cancelTicks, CANCEL_TICKS);
  assert.equal(idle.canBegin, true, 'an alive player standing in the forest may begin');
  assert.equal(idle.canAct, false);
  assert.equal(idle.canCancel, false);
  assert.equal(idle.encounterId, null);
  assert.ok(Array.isArray(idle.blockedWorldActions), 'L57: blockedWorldActions is a type array');
  assert.deepEqual(idle.blockedWorldActions, [], 'nothing is blocked while idle');

  const b1 = beginVillage('g8-begin');
  const active = describeEncounterActions(b1);
  assert.deepEqual(Object.keys(active).sort(), ACTIONS_FIELDS.slice().sort());
  assert.equal(active.canBegin, false);
  assert.equal(active.canAct, true);
  assert.equal(active.canCancel, true);
  assert.equal(active.encounterId, 'encounter-1');
  assert.ok(Array.isArray(active.blockedWorldActions));
  assert.deepEqual(active.blockedWorldActions.slice().sort(), BLOCKED_WORLD_ACTIONS.slice().sort(),
    'L89: exactly the five world commands are reported as blocked while ACTIVE');

  const away = describeEncounterActions(awayFromForest('g8-away'));
  assert.equal(away.canBegin, false, 'L57: an actor away from the forest cannot begin this encounter');
  assert.equal(away.canAct, false);

  // Derive the corpse through the real chain so the capability is unambiguous: the body is dead but
  // still standing in the forest, which isolates aliveness as the only reason canBegin/canAct drop.
  const doomed = ensureForest(villageWithPlayerHealth(80));
  const deadBundle = attackOnce(submit(doomed, dto3('EncounterBegin', {}, 'g8-dead-begin',
    doomed.snapshot.revision)).bundle, 'g8-dead-attack').bundle;
  assert.equal(playerActor(deadBundle).alive, false);
  assert.equal(playerActor(deadBundle).location, ENCOUNTER_LOCATION);
  const dead = describeEncounterActions(deadBundle);
  assert.equal(dead.canBegin, false, 'L57: a dead player cannot begin an encounter');
  assert.equal(dead.canAct, false, 'L57: a dead player cannot act');
});

// ---------------------------------------------------------------------------
// G9 — validateEncounterWorldState (L45, L59)
// ---------------------------------------------------------------------------

test('G9 validateEncounterWorldState: idle, active and win worlds validate; corrupted worlds and contexts do not', () => {
  const b0 = ensureForest(freshVillage());
  assert.equal(isValidWorld(b0.snapshot.world, { tick: b0.snapshot.tick }), true,
    'a fresh idle world must validate');
  assert.equal(isValidWorld(b0.snapshot.world, {}), false, 'L59: the context is exactly {tick}');
  assert.equal(isValidWorld(b0.snapshot.world, { tick: -1 }), false, 'a negative tick is not a real context');
  assert.equal(isValidWorld(b0.snapshot.world, { tick: b0.snapshot.tick, handler: 'json' }), false,
    'L59: the validator must not accept a handler payload smuggled into the context');

  const activeBundle = beginVillage('g9-begin');
  const activeTick = activeBundle.snapshot.tick;
  assert.equal(isValidWorld(activeBundle.snapshot.world, { tick: activeTick }), true, 'an active world must validate');

  const activeCorruptions = [
    ['reservedWolves above one', (world) => { world.ecologyModel.reservedWolves = 2; }],
    ['active encounter without a reservation', (world) => { world.encounterModel.encounter.reserved = false; }],
    ['wolf health outside its domain', (world) => { world.encounterModel.encounter.wolfHealth = 200; }],
    ['active encounter carrying an end tick', (world) => { world.encounterModel.encounter.endTick = activeTick; }],
    ['nextEncounterId below one', (world) => { world.encounterModel.nextEncounterId = 0; }],
    ['inputHistory is not an array', (world) => { world.encounterModel.inputHistory = {}; }],
    ['unknown model version', (world) => { world.encounterModel.version = 'encounter-runtime-v0'; }],
    ['wrong actor for the encounter', (world) => { world.encounterModel.encounter.actorId = 'actor-2'; }],
    ['encounter outside the forest', (world) => { world.encounterModel.encounter.location = 'village'; }],
    ['an active encounter whose actor left the forest', (world) => { actorOf(world).location = 'village'; }],
  ];
  for (const [label, mutate] of activeCorruptions) {
    const world = mutableCopy(activeBundle.snapshot.world);
    mutate(world);
    assert.equal(isValidWorld(world, { tick: activeTick }), false, `L53: the validator must refuse: ${label}`);
  }

  const wonBundle = attackOnce(attackOnce(activeBundle, 'g9-attack-1').bundle, 'g9-attack-2').bundle;
  assert.equal(wonBundle.snapshot.world.encounterModel.encounter.resolution, 'win');
  const wonTick = wonBundle.snapshot.tick;
  assert.equal(isValidWorld(wonBundle.snapshot.world, { tick: wonTick }), true, 'a won world must validate');

  const wonCorruptions = [
    ['closed encounter with a null resolution', (world) => { world.encounterModel.encounter.resolution = null; }],
    ['closed encounter without an end tick', (world) => { world.encounterModel.encounter.endTick = null; }],
    ['win without a battle death', (world) => { world.ecologyModel.ledger.wolves.battleDeaths = 0; }],
    ['battle death without a wolf loss', (world) => { world.ecologyModel.populations.wolves = INITIAL_LIVING_WOLVES; }],
    ['battleDeaths account added to deer', (world) => { world.ecologyModel.ledger.deer.battleDeaths = 1; }],
    ['a closed encounter that still holds a reservation', (world) => { world.ecologyModel.reservedWolves = 1; }],
  ];
  for (const [label, mutate] of wonCorruptions) {
    const world = mutableCopy(wonBundle.snapshot.world);
    mutate(world);
    assert.equal(isValidWorld(world, { tick: wonTick }), false, `L53: the validator must refuse: ${label}`);
  }
});

// ---------------------------------------------------------------------------
// G10 — input invariance, cross-day persistence, replay (L53, L59, L69, L71)
// ---------------------------------------------------------------------------

test('G10a input invariance: frozen and null-prototype inputs are accepted and the caller data is never mutated', () => {
  const b0 = ensureForest(freshVillage());
  const dto = deepFreeze(dto3('EncounterBegin', {}, 'g10a-begin', b0.snapshot.revision));
  const bundleBefore = canonicalJson(b0);
  const dtoBefore = canonicalJson(dto);

  const out = submit(b0, dto);
  assert.equal(out.receipt.outcome, 'succeeded', 'precondition: the frozen Begin commits');
  assert.equal(canonicalJson(b0), bundleBefore, 'L59: the caller bundle must never be mutated in place');
  assert.equal(canonicalJson(dto), dtoBefore, 'L53: a frozen input is consumed, never rewritten');
  assert.notEqual(out.bundle, b0, 'L59: the returned bundle must be a fresh object');
  assert.notEqual(out.bundle.snapshot, b0.snapshot);
  assert.notEqual(out.bundle.snapshot.world, b0.snapshot.world);
  assert.notEqual(out.bundle.snapshot.world.encounterModel, b0.snapshot.world.encounterModel);
  assert.notEqual(out.bundle.eventLog, b0.eventLog);

  const nullProtoDto = Object.create(null);
  nullProtoDto.version = 3;
  nullProtoDto.commandId = 'g10a-null-proto';
  nullProtoDto.expectedRevision = out.bundle.snapshot.revision;
  nullProtoDto.type = 'PlayerRest';
  nullProtoDto.payload = Object.create(null);
  const nullProtoOut = executeEncounterIntent(out.bundle, nullProtoDto);
  assert.equal(nullProtoOut.receipt.status, 'committed', 'L53: a null-prototype input is accepted');
  assert.equal(nullProtoOut.receipt.outcome, 'rejected');
  assert.deepEqual(nullProtoOut.receipt.result, { code: 'ENCOUNTER_BUSY' });
  assertPublished(nullProtoOut.bundle);
});

test('G10b descriptor-first preflight: accessor inputs are refused and their getters are never invoked', () => {
  const bundle = freshVillage();
  const before = stateOf(bundle);
  let getterCalls = 0;
  const dto = dto3('EncounterBegin', {}, 'g10b-begin', bundle.snapshot.revision);
  Object.defineProperty(dto, 'type', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return 'EncounterBegin';
    },
  });
  assert.equal(getterCalls, 0);
  assert.throws(() => executeEncounterIntent(bundle, dto), Error,
    'L53: an accessor-bearing input must be refused');
  assert.equal(getterCalls, 0, 'L53: descriptor-first preflight must never call a getter');
  assert.equal(stateOf(bundle), before, 'a refused descriptor input publishes nothing');
  assert.equal(bundle.eventLog.length, 0);
});

/**
 * L81: the settlement payload carries an `encounterOwnership` block of exactly the six ownership
 * fields. The contract fixes the block's shape, not its depth — the real survival settlement nests
 * the ecology row at `payload.actors.market.ecology` (market.mjs:134 -> ecology.mjs:164). So the
 * block is located by its exact key set instead of by a hard-coded path, and the ordinary wolves row
 * is taken from the same payload (it is the row the ownership totals must reconcile against).
 */
function findOwnershipPayload(root) {
  const seen = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const keys = Object.keys(value).sort();
    if (keys.length === OWNERSHIP_FIELDS.length &&
      keys.every((key, index) => key === OWNERSHIP_FIELDS.slice().sort()[index])) {
      return value;
    }
    for (const key of Object.keys(value)) stack.push(value[key]);
  }
  return null;
}

/** The ordinary wolves daily row that accompanies the located ownership block. */
function findWolvesRow(root) {
  const seen = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const wolves = value.wolves;
    if (wolves && typeof wolves === 'object' && !Array.isArray(wolves) &&
      typeof wolves.opening === 'number' && typeof wolves.closing === 'number') {
      return wolves;
    }
    for (const key of Object.keys(value)) stack.push(value[key]);
  }
  return null;
}

test('G10c cross-day: the daily settlement keeps the reservation, the wolf state and the current body', () => {
  const b1 = beginVillage('g10c-begin');
  const wounded = attackOnce(b1, 'g10c-attack');
  const before = wounded.bundle.snapshot.world;
  const dayBefore = before.ecologyModel.day;
  const healthBefore = playerActor(wounded.bundle).health;
  assert.equal(healthBefore, PLAYER_WOUNDED_HEALTH);

  const settled = encounterRuntimeHooks.settleDay(before, 0.5);
  assert.ok(settled && typeof settled === 'object' && settled.world && settled.payload,
    'L45: settleDay keeps its existing {world, payload} responsibility');
  const after = settled.world;
  assert.notEqual(after, before, 'L59: the settlement must publish a fresh world');
  assert.equal(before.ecologyModel.day, dayBefore, 'L59: the input world must not be mutated in place');
  assert.equal(after.ecologyModel.day, dayBefore + 1, 'the settlement advances exactly one day');

  const encounter = after.encounterModel.encounter;
  assert.equal(encounter.status, 'active', 'L81: a daily settlement must not close an active encounter');
  assert.equal(encounter.reserved, true);
  assert.equal(encounter.wolfHealth, 150, 'the reserved wolf keeps its battle state across the day boundary');
  assert.equal(encounter.attackCount, 1);
  assert.equal(encounter.endTick, null);
  assert.equal(encounter.initialPlayerHealth, PLAYER_BASELINE_HEALTH);
  assert.equal(after.encounterModel.nextEncounterId, 2);
  assert.equal(after.ecologyModel.reservedWolves, 1, 'L81: the reservation survives the day boundary');
  assert.equal(actorOf(after).health, healthBefore, 'the current body survives the day boundary');
  assert.equal(actorOf(after).location, ENCOUNTER_LOCATION);
  assert.equal(actorOf(after).alive, true);

  const ownership = findOwnershipPayload(settled.payload);
  assert.ok(ownership, 'L81: the settlement payload must carry an encounterOwnership block of exactly six fields');
  const wolvesRow = findWolvesRow(settled.payload);
  assert.ok(wolvesRow, 'L81: the settlement payload must carry the ordinary wolves daily row');
  assert.equal(ownership.reservedOpening, 1);
  assert.equal(ownership.reservedClosing, 1, 'L81: the reservation neither opens nor closes during the day');
  assert.equal(ownership.battleDeathsOpening, 0);
  assert.equal(ownership.battleDeathsClosing, 0, 'L81: a day settlement never records a battle death');
  assert.equal(ownership.totalLivingOpening, before.ecologyModel.populations.wolves);
  assert.equal(wolvesRow.opening, ownership.totalLivingOpening - ownership.reservedOpening,
    'L81: the ordinary wolf statistics cover the available group only');
  assert.equal(ownership.totalLivingClosing, wolvesRow.closing + ownership.reservedClosing);
  assert.equal(after.ecologyModel.populations.wolves, ownership.totalLivingClosing);
  assert.equal(after.ecologyModel.ledger.wolves.battleDeaths, 0);
  assertConservation(after);
});

test('G10d validateHistory: the real history replays, and every tampered copy is refused', () => {
  let bundle = beginVillage('g10d-begin');
  bundle = attackOnce(bundle, 'g10d-attack-1').bundle;
  bundle = attackOnce(bundle, 'g10d-attack-2').bundle;
  assert.equal(bundle.snapshot.world.encounterModel.encounter.resolution, 'win');

  encounterRuntimeHooks.validateHistory(bundle.snapshot, bundle.eventLog);
  for (const commandId of ['g10d-begin', 'g10d-attack-1', 'g10d-attack-2']) {
    assert.equal(eventFor(bundle, commandId).commandId, commandId,
      'the three encounter commands each resolve to exactly one fact');
  }

  const tamperings = [
    ['reservation', (copy) => { copy.snapshot.world.encounterModel.encounter.reserved = true; }],
    ['wolf damage', (copy) => { copy.snapshot.world.encounterModel.encounter.wolfHealth = 300; }],
    ['player damage', (copy) => { actorOf(copy.snapshot.world).health = 999; }],
    ['wolf ledger', (copy) => { copy.snapshot.world.ecologyModel.ledger.wolves.battleDeaths = 0; }],
    ['wolf population', (copy) => { copy.snapshot.world.ecologyModel.populations.wolves = INITIAL_LIVING_WOLVES; }],
    ['event source', (copy) => { eventFor(copy, 'g10d-attack-1').sourceSystem = 'society'; }],
    ['input', (copy) => { eventFor(copy, 'g10d-attack-1').payload.dto.payload.action = 'flee'; }],
    ['receipt', (copy) => { historyEntry(copy, 'g10d-attack-1').receipt.result.after.wolfHealth = 999; }],
    ['causation', (copy) => {
      const event = eventFor(copy, 'g10d-attack-1');
      event.causationEventSeqs = [event.eventSeq];
    }],
    ['rules version', (copy) => { copy.snapshot.world.encounterModel.version = 'encounter-runtime-v0'; }],
  ];
  for (const [label, mutate] of tamperings) {
    const copy = mutableCopy(bundle);
    mutate(copy);
    assert.throws(() => encounterRuntimeHooks.validateHistory(copy.snapshot, copy.eventLog), Error,
      `L71: a tampered ${label} must be refused by the full replay`);
  }
});

test('G10e fresh outputs: receipts and history entries never alias one another', () => {
  const b0 = ensureForest(freshVillage());
  const dto = dto3('EncounterBegin', {}, 'g10e-begin', b0.snapshot.revision);
  const first = submit(b0, dto);
  assert.equal(first.receipt.outcome, 'succeeded', 'precondition: a forest Begin succeeds');
  const history = first.bundle.snapshot.world.encounterModel.inputHistory;
  assert.equal(history.length, b0.snapshot.world.encounterModel.inputHistory.length + 1);
  const entry = historyEntry(first.bundle, 'g10e-begin');
  assert.notEqual(first.receipt, entry.receipt, 'L59: the returned receipt must not be the stored history object');
  assert.notEqual(first.receipt.result, entry.receipt.result);
  assert.notEqual(first.receipt.result.after, entry.receipt.result.after);
  assert.notEqual(first.receipt.result.before, entry.receipt.result.before);
  assert.notEqual(first.bundle.snapshot.world.encounterModel.encounter, b0.snapshot.world.encounterModel.encounter);
  assert.deepEqual(first.receipt, entry.receipt, 'the returned receipt equals the persisted receipt3 by value');
  const reread = executeEncounterIntent(first.bundle, dto);
  assert.notEqual(reread.receipt, first.receipt);
  assert.deepEqual(reread.receipt, first.receipt);
  assert.deepEqual(reread.bundle.snapshot.world.encounterModel.inputHistory, history);
});
test('D3-5A secure-food plan survives the new-profile emergency Rest and resumes next day', () => {
  const config = defaultEncounterVillageConfig('earn-then-buy');
  config.memory.society.actors.initialActors[1].fatigue = 700;
  let bundle = createEncounterVillage(42, ENCOUNTER_PROFILE, config).bundle;
  const actorId = 'actor-2';
  const actor = (current) => actorOf(current.snapshot.world, actorId);
  const motive = (current) => current.snapshot.world.motivationModel.actors.find((entry) => entry.actorId === actorId);
  const estate = (current) => current.snapshot.world.societyModel.agents.find((entry) => entry.state.actorId === actorId).state;
  const daily = (current, tick) => current.eventLog.findLast((event) =>
    event.type === 'SocietyDaySettled' && event.tick === tick);
  const advanceOneDay = (day) => {
    const dto = dto3('AdvanceTime', { ticks: 144 }, `d3-5a-temp-rest-${day}`, bundle.snapshot.revision);
    const out = submit(bundle, dto);
    assert.equal(out.receipt.outcome, 'succeeded');
    assert.equal(out.receipt.tick, day * 144);
    bundle = out.bundle;
    return bundle;
  };

  advanceOneDay(1);
  assert.equal(bundle.snapshot.tick, 144);
  assert.equal(estate(bundle).lastAction, 'WorkForPay');
  assert.equal(actor(bundle).fatigue, 850, 'the real day-1 Work adds 150 fatigue');
  assert.equal(estate(bundle).wallet, 20, 'the real day-1 Work pays the configured wage once');
  assert.equal(motive(bundle).lastOutcome.delta.wallet, 20);
  const dayOneRow = daily(bundle, 144).payload.actors.rows.find((row) => row.actorId === actorId);
  assert.equal(dayOneRow.restReduction, 0, 'day-1 Work does not rest during settlement');
  const originalPlan = JSON.parse(JSON.stringify(motive(bundle).activePlan));
  const originalSuspended = JSON.parse(JSON.stringify(motive(bundle).suspendedPlan));
  const originalNextPlanId = motive(bundle).nextPlanId;
  const originalGoal = JSON.parse(JSON.stringify(estate(bundle).currentGoal));
  assert.equal(originalPlan.planId, 1);
  assert.equal(originalPlan.kind, 'secure-food');
  assert.equal(originalPlan.stepIndex, 1);
  assert.equal(originalPlan.deadlineDay, 4);
  assert.equal(originalPlan.requestId, 's-food-01');

  advanceOneDay(2);
  assert.equal(bundle.snapshot.tick, 288);
  assert.equal(estate(bundle).lastAction, 'Rest');
  assert.equal(actor(bundle).fatigue, 650, 'the real day-2 Rest and settlement reduce fatigue to 650');
  assert.equal(estate(bundle).wallet, 20, 'the emergency Rest pays no second wage');
  assert.equal(motive(bundle).lastOutcome.delta.wallet, 0);
  assert.equal(motive(bundle).lastDecision.choice, 'Rest');
  assert.equal(motive(bundle).lastDecision.mode, 'review');
  assert.deepEqual(motive(bundle).lastDecision.candidates.map((candidate) => candidate.action),
    ['UseMedicine', 'BuyMedicine', 'WorkForPay', 'Rest', 'NoAction', 'BuyFood']);
  assert.equal(motive(bundle).lastDecision.gateReason, 'URGENT_FATIGUE');
  assert.equal(motive(bundle).lastDecision.goalId, null);
  assert.equal(motive(bundle).lastDecision.planId, null);
  assert.deepEqual(motive(bundle).activePlan, originalPlan,
    'the temporary Rest preserves every field of the secure-food plan');
  assert.deepEqual(motive(bundle).suspendedPlan, originalSuspended);
  assert.deepEqual(estate(bundle).currentGoal, originalGoal);
  assert.equal(motive(bundle).nextPlanId, originalNextPlanId);
  const dayTwoRow = daily(bundle, 288).payload.actors.rows.find((row) => row.actorId === actorId);
  assert.equal(dayTwoRow.restReduction, 200, 'day-2 Rest applies the ordinary settlement rest');
  const planSettlements = bundle.eventLog.filter((event) =>
    event.type === 'MotivationPlanSettled' && event.payload.actorId === actorId);
  assert.equal(planSettlements.some((event) => event.payload.transitions.some((transition) =>
    transition.planId === originalPlan.planId && transition.reasonCode === 'GOAL_FAILED')), false,
  'temporary Rest must not cancel the secure-food plan as GOAL_FAILED');
  assert.equal(planSettlements.some((event) => event.payload.transitions.some((transition) =>
    transition.kind === 'recover-rest' && transition.toStatus === 'ready')), false,
  'temporary Rest must not create a recover-rest plan');

  advanceOneDay(3);
  assert.equal(bundle.snapshot.tick, 432);
  assert.equal(estate(bundle).lastAction, 'BuyFood');
  assert.equal(motive(bundle).lastDecision.choice, 'BuyFood');
  assert.equal(motive(bundle).lastDecision.planId, originalPlan.planId,
    'the next day resumes the same secure-food plan');
  assert.equal(motive(bundle).lastOutcome.delta.wallet, -10);
  assert.equal(estate(bundle).wallet, 10);
  assert.equal(estate(bundle).ledger.foodBought, 1);
  assert.equal(estate(bundle).ledger.foodUsed, 1);
  assert.equal(estate(bundle).ledger.workDays, 1, 'the earned wage is paid for exactly one real Work day');
  assert.equal(motive(bundle).activePlan, null, 'the original secure-food plan completes after purchase');
  assert.equal(motive(bundle).nextPlanId, originalNextPlanId,
    'the temporary Rest did not allocate a plan id');
  validateBundle(bundle, { rulesVersion: ENCOUNTER_RULES, systems: encounterSystems() });
  encounterRuntimeHooks.validateHistory(bundle.snapshot, bundle.eventLog);
});


test('D3-5A health goal creation during new-profile emergency Rest preserves the active food plan', () => {
  const config = defaultEncounterVillageConfig('earn-then-buy');
  const initialActor2 = config.memory.society.actors.initialActors[1];
  initialActor2.fatigue = 700;
  initialActor2.health = 710;
  initialActor2.hunger = 400;
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial = 0;
  let bundle = createEncounterVillage(42, ENCOUNTER_PROFILE, config).bundle;
  const actor = (current) => actorOf(current.snapshot.world, 'actor-2');
  const motive = (current) => current.snapshot.world.motivationModel.actors.find((entry) => entry.actorId === 'actor-2');
  const estate = (current) => current.snapshot.world.societyModel.agents.find((entry) => entry.state.actorId === 'actor-2').state;
  const advanceDay = (day) => {
    const dto = dto3('AdvanceTime', { ticks: 144 }, 'd3-5a-health-temp-rest-' + day, bundle.snapshot.revision);
    const out = submit(bundle, dto);
    assert.equal(out.receipt.outcome, 'succeeded');
    assert.equal(out.receipt.tick, day * 144);
    bundle = out.bundle;
  };

  assert.equal(actor(bundle).health, 710);
  assert.equal(actor(bundle).fatigue, 700);
  assert.equal(actor(bundle).hunger, 400);
  assert.equal(estate(bundle).currentGoal, null);
  advanceDay(1);
  assert.equal(estate(bundle).lastAction, 'WorkForPay');
  assert.equal(actor(bundle).health, 660, 'the real day-1 hunger settlement reduces health to 660');
  assert.equal(actor(bundle).fatigue, 850);
  assert.equal(estate(bundle).wallet, 20);
  const originalPlan = JSON.parse(JSON.stringify(motive(bundle).activePlan));
  assert.equal(originalPlan.planId, 1);
  assert.equal(originalPlan.kind, 'secure-food');
  assert.equal(originalPlan.stepIndex, 1);
  advanceDay(2);
  assert.equal(estate(bundle).lastAction, 'Rest');
  assert.equal(motive(bundle).lastDecision.choice, 'Rest');
  assert.equal(motive(bundle).lastDecision.gateReason, 'URGENT_FATIGUE');
  assert.equal(motive(bundle).lastDecision.goalId, null);
  assert.equal(motive(bundle).lastDecision.planId, null);
  assert.deepEqual(motive(bundle).activePlan, originalPlan,
    'legal health-goal creation does not replace or consume the secure-food plan');
  assert.equal(estate(bundle).currentGoal?.kind, 'recover-health',
    'the existing health rule still creates its goal for the wounded actor');
  assert.equal(estate(bundle).currentGoal.goalId, 1);
  assert.equal(actor(bundle).fatigue, 650);
});

test('D3-5A executor rejects non-encounter metadata after preflight and preserves valid new-profile domain behavior', () => {
  const template = freshVillage();
  const validDto = dto3('EncounterBegin', {}, 'profile-guard-valid', 0);
  const invalidProfiles = [
    ['old rules version', bundle => { bundle.snapshot.rulesVersion = SURVIVAL_RULES; }],
    ['unknown rules version', bundle => { bundle.snapshot.rulesVersion = 'unknown-runtime-rules'; }],
    ['old fixture id', bundle => { bundle.snapshot.fixtureId = 'survival-village'; }],
    ['old fixture version', bundle => { bundle.snapshot.fixtureVersion = '2'; }],
    ['old snapshot schema', bundle => { bundle.snapshot.schemaVersion = 2; }],
  ];
  for (const [label, changeMetadata] of invalidProfiles) {
    const candidate = mutableCopy(template);
    changeMetadata(candidate);
    const before = canonicalJson(candidate);
    assert.throws(() => executeEncounterIntent(candidate, validDto),
      error => error.code === 'UNSUPPORTED_VERSION', `${label} must be rejected before world-specific access`);
    assert.equal(canonicalJson(candidate), before, `${label} rejection must not mutate its input bundle`);
  }

  const legacy = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig()).bundle;
  const legacyBefore = canonicalJson(legacy);
  assert.throws(() => executeEncounterIntent(legacy, validDto),
    error => error.code === 'UNSUPPORTED_VERSION', 'a real legacy fixture has no encounter model and must still fail by profile');
  const malformed = { ...validDto, payload: { unexpected: true } };
  assert.throws(() => executeEncounterIntent(legacy, malformed),
    error => error.code === 'INVALID_INPUT', 'DTO preflight remains earlier than profile rejection');
  assert.equal(canonicalJson(legacy), legacyBefore);

  const getterBundle = freshVillage();
  const getterBefore = stateOf(getterBundle);
  const accessorSnapshot = { ...getterBundle.snapshot };
  let worldGetterCalls = 0;
  Object.defineProperty(accessorSnapshot, 'world', {
    enumerable: true,
    configurable: true,
    get() { worldGetterCalls += 1; return getterBundle.snapshot.world; },
  });
  assert.throws(() => executeEncounterIntent({ snapshot: accessorSnapshot, eventLog: getterBundle.eventLog }, validDto),
    error => error.code === 'INVALID_INPUT', 'descriptor preflight blocks a snapshot.world accessor');
  assert.equal(worldGetterCalls, 0);
  assert.equal(stateOf(getterBundle), getterBefore);

  const valid = freshVillage();
  assert.equal(playerActor(valid).location, HOME_LOCATION);
  const validBefore = stateOf(valid);
  const rejected = submit(valid, dto3('EncounterBegin', {}, 'profile-guard-domain-rejection', valid.snapshot.revision));
  assert.equal(rejected.receipt.status, 'committed');
  assert.equal(rejected.receipt.outcome, 'rejected');
  assert.equal(rejected.receipt.result.reasonCode, 'RULE_REJECTED');
  assert.equal(rejected.receipt.durationTicks, 0);
  assert.equal(rejected.bundle.snapshot.tick, valid.snapshot.tick);
  assert.equal(rejected.bundle.snapshot.revision, valid.snapshot.revision + 1);
  assert.equal(stateOf(valid), validBefore, 'the valid domain rejection also preserves the input bundle');
});
