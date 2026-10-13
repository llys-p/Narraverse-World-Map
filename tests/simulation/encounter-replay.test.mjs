/**
 * D3-5A R3 — real engine progression & full replay test (the R3 stopping-gate file).
 *
 * Contract basis: tasks/D3-5-R3-ENGINE-CARD.md (stopping gates L50-55), the public behaviour
 * contract tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md (L87-92 ordering rules), and the independent
 * acceptance hand-computations in tasks/D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md (G3/G4, L38-53).
 * Every numeric expectation below is hand-computed from those documents plus the frozen survival
 * settlement rules (runtime/core/actors.mjs L112-128: hunger +=100 per day, one private food
 * restores 200 hunger, hunger >= 500 without food costs 50 health) — the implementation under
 * test was not consulted for the expected values.
 *
 * This file runs the REAL chain only:
 *   - runtime/fixtures/encounter-survival-village.mjs (config + factory)
 *   - runtime/core/encounter-runtime.mjs (DTO3 entry point, hooks, validateHistory)
 *   - runtime/core/command-engine.mjs (createSimulationSession — the registered main loop)
 *   - runtime/core/world-state.mjs (validateBundle)
 * No shadow adapter, no simplified shape, no skipped assertions.
 *
 * Boundary scenarios (hunger 400 / health 50 / health 100) are derived ONLY from a legal
 * initial config clone before world construction (B L34/L40/L42/L50), never by mutating a
 * snapshot that already passed the validator.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultEncounterVillageConfig,
  encounterSystems,
  createEncounterVillage,
} from '../../runtime/fixtures/encounter-survival-village.mjs';
import {
  ENCOUNTER_RULES,
  ENCOUNTER_PROFILE,
  encounterRuntimeHooks,
  executeEncounterIntent,
} from '../../runtime/core/encounter-runtime.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createSurvivalVillage } from '../../runtime/fixtures/survival-village.mjs';

// ---------------------------------------------------------------------------
// Hand-transcribed contract constants (R3 card L50-55, public contract L87-92, B L38-53)
// ---------------------------------------------------------------------------

const ACTOR_ID = 'actor-4';                                  // public contract L51
const FOREST = 'forest';
const VILLAGE = 'village';
const WOLF_MAX_HEALTH = 300;                                 // L87
const WOLF_HIT_DAMAGE = 150;                                 // L87
const WOLF_COUNTER_DAMAGE = 80;                              // L87
const ATTACK_TICKS = 6;                                      // L87
const TRAVEL_TICKS = 12;                                     // L63 (legacy real duration)
const DAY_TICKS = 144;                                       // frozen day length
const HUNGER_PER_DAY = 100;                                  // actors.mjs L112-128
const STARVATION_THRESHOLD = 500;                            // actors.mjs: hunger >= 500 && no food
const STARVATION_DAMAGE = 50;                                // actors.mjs
const INITIAL_LIVING_WOLVES = 14;                            // frozen ecology config

const SETTLED_TYPE = 'SocietyDaySettled';
const TERMINATED_TYPE = 'EncounterTerminated';
const RESOLVED_TYPE = 'EncounterCommandResolved';

// ---------------------------------------------------------------------------
// Real-chain helpers
// ---------------------------------------------------------------------------

function dto3(type, payload, commandId, expectedRevision) {
  return { version: 3, commandId, expectedRevision, type, payload };
}

function submit(bundle, dto) {
  const out = executeEncounterIntent(bundle, dto);
  assert.deepEqual(Object.keys(out).sort(), ['bundle', 'receipt'],
    'executeEncounterIntent must return exactly {bundle,receipt}');
  return out;
}

function playerActor(bundle) {
  return bundle.snapshot.world.actorModel.actors.find((actor) => actor.actorId === ACTOR_ID);
}

function assertRevisionInvariant(bundle, label) {
  const snapshot = bundle.snapshot;
  assert.ok(Number.isSafeInteger(snapshot.instantCommits) && snapshot.instantCommits >= 0,
    `${label}: instantCommits must be a non-negative safe integer`);
  assert.equal(snapshot.revision, snapshot.tick + snapshot.instantCommits,
    `${label}: revision must equal tick + instantCommits (public contract L34)`);
}

/** B L40: the cross-day HP anchor config — hunger 400, no private food, legal config clone only. */
function contractVillage(overrides = {}, seed = 42) {
  const config = defaultEncounterVillageConfig();
  if (overrides.health !== undefined) config.memory.society.actors.initialActors[3].health = overrides.health;
  if (overrides.hunger !== undefined) config.memory.society.actors.initialActors[3].hunger = overrides.hunger;
  if (overrides.food !== undefined) config.memory.society.player.initialFood = overrides.food;
  return createEncounterVillage(seed, ENCOUNTER_PROFILE, config).bundle;
}

function validateHistory(bundle) {
  // R3 card L70-71: the unified audit must accept the bundle too. The domain
  // validateHistory alone cannot stand in for the full validateBundle gate — the
  // event-log identity checks (event source/commandId/entity/causation per fact) are
  // what rejected the legal DTO3/session continuations, so run the real validator first.
  validateBundle(bundle, { rulesVersion: ENCOUNTER_RULES, systems: encounterSystems() });
  encounterRuntimeHooks.validateHistory(bundle.snapshot, bundle.eventLog);
}

// ---------------------------------------------------------------------------
// Gate 1 (R3 card L50): a real session drives 144 ticks — tick-1 quote, one real daily
// settlement for actor-2/3, and the final bundle passes the full validator.
// ---------------------------------------------------------------------------

test('R3 gate 1: a real simulation session advances to tick 144 and validates', () => {
  const village = createEncounterVillage(42, ENCOUNTER_PROFILE, defaultEncounterVillageConfig());
  const session = createSimulationSession(village.bundle, encounterSystems());
  const progress = session.advanceTicks(DAY_TICKS);
  assert.equal(progress.tick, DAY_TICKS, 'the session must advance exactly 144 ticks');
  const advanced = session.getBundle();
  assert.equal(advanced.snapshot.tick, DAY_TICKS);
  assert.equal(advanced.snapshot.revision, DAY_TICKS,
    'idle+activity advance keeps revision = tick + instantCommits with zero instant commits');
  const quote = advanced.eventLog.find((event) => event.type === 'SurvivalFoodQuoteAnnounced' && event.tick === 1);
  assert.ok(quote, 'the tick-1 public food quote must be published by the real beforeSystems');
  const settlements = advanced.eventLog.filter((event) => event.type === SETTLED_TYPE);
  assert.equal(settlements.length, 1, 'exactly one daily settlement inside the first day');
  assert.equal(settlements[0].tick, DAY_TICKS, 'the settlement must land on tick 144');
  for (const actorId of ['actor-2', 'actor-3']) {
    const actor = advanced.snapshot.world.actorModel.actors.find((entry) => entry.actorId === actorId);
    assert.equal(actor.lastNeedsTick, DAY_TICKS,
      `${actorId} must have been settled once by the real society system`);
  }
  // The final bundle must be accepted by the full validator (not just the snapshot shape).
  validateBundle(advanced, { rulesVersion: ENCOUNTER_RULES, systems: encounterSystems() });
});

// ---------------------------------------------------------------------------
// Gate 2 (R3 card L51): zero-tick Begin -> Cancel produces a durable instantCommits offset;
// later idle and settlement ticks keep revision = tick + instantCommits; a duplicated id
// replays its stored receipt without advancing anything.
// ---------------------------------------------------------------------------

test('R3 gate 2: zero-tick begin/cancel offset survives idle and settlement ticks', () => {
  let bundle = contractVillage();
  bundle = submit(bundle, dto3('PlayerTravel', { destination: FOREST }, 'g2-travel', bundle.snapshot.revision)).bundle;
  const base = bundle.snapshot;
  const beginOut = submit(bundle, dto3('EncounterBegin', {}, 'g2-begin', base.revision));
  bundle = beginOut.bundle;
  assert.equal(beginOut.receipt.durationTicks, 0, 'L87: Begin is a zero-tick command');
  assert.equal(bundle.snapshot.instantCommits, base.instantCommits + 1,
    'a zero-tick commit must advance instantCommits by exactly one');
  const cancelDto = dto3('EncounterCancel', { encounterId: 'encounter-1' }, 'g2-cancel', bundle.snapshot.revision);
  const cancelOut = submit(bundle, cancelDto);
  bundle = cancelOut.bundle;
  assert.equal(cancelOut.receipt.durationTicks, 0, 'L87: Cancel is a zero-tick command');
  assert.equal(bundle.snapshot.instantCommits, base.instantCommits + 2, 'R3 L51: begin->cancel offset is 2');
  assertRevisionInvariant(bundle, 'after begin/cancel');
  const offset = bundle.snapshot.revision - bundle.snapshot.tick;
  assert.equal(offset, 2, 'the revision offset over the world clock must be exactly 2');

  // Duplicated id: the byte-identical dto replays the stored receipt before any revision check
  // (L65/R3 L51) and advances nothing.
  const beforeDup = bundle.snapshot;
  const dup = submit(bundle, cancelDto);
  assert.deepEqual(dup.receipt, cancelOut.receipt, 'a duplicated id must return the original receipt verbatim');
  assert.equal(dup.bundle.snapshot.revision, beforeDup.revision, 'a duplicated id must not advance the revision');
  assert.equal(dup.bundle.snapshot.tick, beforeDup.tick, 'a duplicated id must not advance the clock');
  assert.equal(dup.bundle.snapshot.world.encounterModel.inputHistory.length,
    beforeDup.world.encounterModel.inputHistory.length, 'a duplicated id must not grow the journal');
  bundle = dup.bundle;

  // Idle ticks keep the offset (R3 L29/L51: idle must not lose instantCommits).
  const idleOut = submit(bundle, dto3('AdvanceTime', { ticks: 10 }, 'g2-idle', bundle.snapshot.revision));
  bundle = idleOut.bundle;
  assert.equal(bundle.snapshot.tick, beforeDup.tick + 10, 'idle advance must move the world clock');
  assert.equal(bundle.snapshot.revision, bundle.snapshot.tick + 2, 'idle ticks must preserve the offset of 2');
  assert.equal(bundle.snapshot.instantCommits, beforeDup.instantCommits,
    'a real tick advance never moves instantCommits');

  // A later settlement keeps the offset as well.
  const toSettlement = DAY_TICKS - bundle.snapshot.tick;
  const settledOut = submit(bundle, dto3('AdvanceTime', { ticks: toSettlement }, 'g2-settle', bundle.snapshot.revision));
  bundle = settledOut.bundle;
  assert.equal(bundle.snapshot.tick, DAY_TICKS, 'the advance must land exactly on the settlement tick');
  assert.ok(bundle.eventLog.some((event) => event.type === SETTLED_TYPE && event.tick === DAY_TICKS),
    'the real settlement fact must exist');
  assert.equal(bundle.snapshot.revision, DAY_TICKS + 2, 'the settlement tick must preserve the offset of 2');
  assertRevisionInvariant(bundle, 'after settlement');
  validateHistory(bundle);
});

// ---------------------------------------------------------------------------
// Gate 3 (R3 card L52 + B L38-40): the cross-day 870 chain.
// Hand computation from the frozen settlement rules:
//   travel 12 ticks -> tick 12; advance 125 -> tick 137; Begin (0 ticks);
//   attack (6 ticks) -> tick 143: player 1000-80=920, wolf 300-150=150;
//   attack target 149: tick 144 settlement runs first — hunger 400+100=500, no private food,
//   so 50 damage: player 920-50=870; at tick 149 the second hit kills the wolf with no
//   counterattack: player stays 870, wolf 0, endTick 149, elapsed 12.
// ---------------------------------------------------------------------------

test('R3 gate 3: the cross-day 149 chain settles hunger damage before the killing blow', () => {
  let bundle = contractVillage({ health: 1000, hunger: 400, food: 0 });
  assert.equal(playerActor(bundle).hunger, 400, 'the legal config must carry the contract hunger anchor');

  bundle = submit(bundle, dto3('PlayerTravel', { destination: FOREST }, 'g3-travel', bundle.snapshot.revision)).bundle;
  assert.equal(bundle.snapshot.tick, TRAVEL_TICKS, 'L63: travel keeps its real 12-tick duration');
  bundle = submit(bundle, dto3('AdvanceTime', { ticks: 125 }, 'g3-advance', bundle.snapshot.revision)).bundle;
  assert.equal(bundle.snapshot.tick, 137, 'travel 12 + advance 125 must land on tick 137');

  const beginOut = submit(bundle, dto3('EncounterBegin', {}, 'g3-begin', bundle.snapshot.revision));
  bundle = beginOut.bundle;
  assert.equal(beginOut.receipt.durationTicks, 0, 'L87: Begin is zero-tick');
  assert.equal(bundle.snapshot.tick, 137, 'Begin must not move the clock');
  assert.equal(bundle.snapshot.world.ecologyModel.reservedWolves, 1, 'Begin must reserve exactly one wolf');

  const attack1 = submit(bundle, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g3-attack-1', bundle.snapshot.revision));
  bundle = attack1.bundle;
  assert.equal(attack1.receipt.tick, 143, 'the first attack completes at 137+6');
  assert.equal(attack1.receipt.result.after.playerHealth, 920, 'counterattack: 1000-80=920');
  assert.equal(attack1.receipt.result.after.wolfHealth, 150, 'hit: 300-150=150');
  assert.equal(playerActor(bundle).health, 920, 'the real body must carry the counterattack damage');
  assert.equal(playerActor(bundle).hunger, 400, 'no settlement has run yet: hunger is unchanged');

  const attack2 = submit(bundle, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g3-attack-2', bundle.snapshot.revision));
  bundle = attack2.bundle;
  assert.equal(attack2.receipt.tick, 149, 'the second attack completes at 143+6');
  assert.equal(attack2.receipt.outcome, 'succeeded', 'the player survives the settlement, so the action lands');
  assert.equal(attack2.receipt.result.after.playerHealth, 870,
    'B L40: the tick-144 settlement deals 50 hunger damage before the kill (920-50)');
  assert.equal(attack2.receipt.result.after.wolfHealth, 0, 'the second hit kills the wolf');
  assert.equal(attack2.receipt.result.after.resolution, 'win');
  assert.equal(attack2.receipt.result.after.battleDeaths, 1, 'the wolf kill is booked exactly once');

  const player = playerActor(bundle);
  assert.equal(player.health, 870, 'the authoritative body must carry the settlement damage');
  assert.equal(player.hunger, 500, 'the settlement consumed the hunger increase (400+100)');
  assert.equal(player.alive, true, 'the player survives: 870 > 0');
  assert.equal(player.lastNeedsTick, DAY_TICKS, 'the player body was settled at tick 144');

  const encounter = bundle.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.status, 'closed');
  assert.equal(encounter.resolution, 'win');
  assert.equal(encounter.endTick, 149, 'the encounter ends at the real completion tick');
  assert.equal(encounter.elapsedTicks, 12, 'endTick - startTick = 149 - 137');
  assert.equal(encounter.reserved, false, 'the reservation is released on closure');
  assert.equal(bundle.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(bundle.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES - 1,
    'L79: the battle death is deducted from the living population exactly once');

  // actor-2/actor-3 were settled exactly once during the crossing (B L44).
  for (const actorId of ['actor-2', 'actor-3']) {
    const actor = bundle.snapshot.world.actorModel.actors.find((entry) => entry.actorId === actorId);
    assert.equal(actor.lastNeedsTick, DAY_TICKS, `${actorId} must have crossed exactly one settlement`);
  }
  const settlement = bundle.eventLog.find((event) => event.type === SETTLED_TYPE && event.tick === DAY_TICKS);
  assert.ok(settlement, 'the real tick-144 SocietyDaySettled fact must exist');

  assertRevisionInvariant(bundle, 'cross-day chain');
  validateHistory(bundle);
});

// ---------------------------------------------------------------------------
// Gate 4a (R3 card L53 + B L50): a settlement before completion kills the player.
// Hand computation: health 50, hunger 400, no food. travel 12 -> tick 12; advance 131 -> tick
// 143; Begin (0 ticks); attack target 149. The tick-144 settlement runs during the flight:
// hunger 400+100=500 >= 500, no food -> 50 damage kills the player (50-50=0). The attack never
// lands; the wolf (300, untouched) is returned exactly once; the encounter closes as
// player-died at endTick 144 with elapsedTicks 1; the receipt reports tick 149 / duration 6 /
// rejected / PLAYER_DEAD (B L36: the advanced action keeps its real duration, not zero-tick).
// ---------------------------------------------------------------------------

test('R3 gate 4a: a settlement death before completion aborts the attack and returns the wolf', () => {
  let bundle = contractVillage({ health: 50, hunger: 400, food: 0 });
  bundle = submit(bundle, dto3('PlayerTravel', { destination: FOREST }, 'g4a-travel', bundle.snapshot.revision)).bundle;
  bundle = submit(bundle, dto3('AdvanceTime', { ticks: 131 }, 'g4a-advance', bundle.snapshot.revision)).bundle;
  assert.equal(bundle.snapshot.tick, 143, 'travel 12 + advance 131 lands on tick 143');
  bundle = submit(bundle, dto3('EncounterBegin', {}, 'g4a-begin', bundle.snapshot.revision)).bundle;
  assert.equal(bundle.snapshot.world.ecologyModel.reservedWolves, 1);

  const attack = submit(bundle, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g4a-attack', bundle.snapshot.revision));
  bundle = attack.bundle;
  assert.equal(attack.receipt.tick, 149, 'B L36: the receipt keeps the original target tick');
  assert.equal(attack.receipt.durationTicks, ATTACK_TICKS, 'B L36: duration 6, not the zero-tick rule');
  assert.equal(attack.receipt.toRevision, attack.receipt.fromRevision + ATTACK_TICKS,
    'B L36: toRevision advances by 6');
  assert.equal(attack.receipt.outcome, 'rejected', 'the player died before completion');
  assert.equal(attack.receipt.result.reasonCode, 'PLAYER_DEAD');

  const player = playerActor(bundle);
  assert.equal(player.health, 0, 'the settlement dealt the lethal 50 damage');
  assert.equal(player.alive, false);
  assert.equal(player.deathTick, DAY_TICKS, 'the death is booked at the real settlement tick');

  const encounter = bundle.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.status, 'closed');
  assert.equal(encounter.resolution, 'player-died', 'no fabricated win/lose (R3 L53)');
  assert.equal(encounter.endTick, DAY_TICKS, 'B L50: endTick = deathTick = 144');
  assert.equal(encounter.elapsedTicks, 1, 'B L50: elapsedTicks = 144 - 143 = 1');
  assert.equal(encounter.wolfHealth, WOLF_MAX_HEALTH, 'the attack never landed: the wolf is untouched');
  assert.equal(encounter.attackCount, 0, 'no attack was executed');
  assert.equal(encounter.reserved, false, 'the reservation is returned exactly once');
  assert.equal(bundle.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(bundle.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES,
    'the wolf is returned alive: no population change');

  // L71: the EncounterTerminated fact cites the killing settlement.
  const settlement = bundle.eventLog.find((event) => event.type === SETTLED_TYPE && event.tick === DAY_TICKS);
  assert.ok(settlement, 'the killing settlement fact must exist');
  const terminated = bundle.eventLog.find((event) => event.type === TERMINATED_TYPE);
  assert.ok(terminated, 'L71: a real EncounterTerminated fact must be published');
  assert.equal(terminated.tick, DAY_TICKS);
  assert.deepEqual(terminated.causationEventSeqs, [settlement.eventSeq],
    'L71: the termination cause is exactly the killing settlement');
  assert.deepEqual(terminated.payload, {
    encounterId: 'encounter-1',
    actorId: ACTOR_ID,
    reason: 'player-died',
    deathTick: DAY_TICKS,
    wolfHealth: WOLF_MAX_HEALTH,
    reservedBefore: 1,
    reservedAfter: 0,
  }, 'L71: the terminated payload is exactly the seven contract fields');

  assertRevisionInvariant(bundle, 'settlement-death chain');
  validateHistory(bundle);
});

// ---------------------------------------------------------------------------
// Gate 4b (R3 card L53 + B L51): completion == 144 — the killing blow lands first.
// Hand computation: health 100, hunger 400, no food. travel 12 -> tick 12; advance 120 ->
// tick 132; Begin; attack -> tick 138: player 100-80=20, wolf 150; attack target 144: the
// action completes inside tick 144 BEFORE the settlement (public contract L91), so the wolf
// dies (150-150=0, no counterattack on a kill), then the same tick's settlement deals the
// lethal hunger damage: 20-50 -> dead at 144. The win is NOT revoked (R3 L53); the wolf death
// is booked exactly once; the receipt's after-view reports the real post-settlement body.
// ---------------------------------------------------------------------------

test('R3 gate 4b: completion on the settlement tick kills the wolf before the player dies', () => {
  let bundle = contractVillage({ health: 100, hunger: 400, food: 0 });
  bundle = submit(bundle, dto3('PlayerTravel', { destination: FOREST }, 'g4b-travel', bundle.snapshot.revision)).bundle;
  bundle = submit(bundle, dto3('AdvanceTime', { ticks: 120 }, 'g4b-advance', bundle.snapshot.revision)).bundle;
  assert.equal(bundle.snapshot.tick, 132, 'travel 12 + advance 120 lands on tick 132');
  bundle = submit(bundle, dto3('EncounterBegin', {}, 'g4b-begin', bundle.snapshot.revision)).bundle;

  const attack1 = submit(bundle, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g4b-attack-1', bundle.snapshot.revision));
  bundle = attack1.bundle;
  assert.equal(attack1.receipt.tick, 138);
  assert.equal(attack1.receipt.result.after.playerHealth, 20, '100-80=20');
  assert.equal(attack1.receipt.result.after.wolfHealth, 150);

  const attack2 = submit(bundle, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g4b-attack-2', bundle.snapshot.revision));
  bundle = attack2.bundle;
  assert.equal(attack2.receipt.tick, DAY_TICKS, 'the second attack completes exactly on tick 144');
  assert.equal(attack2.receipt.durationTicks, ATTACK_TICKS);
  assert.equal(attack2.receipt.outcome, 'succeeded', 'the action lands before the settlement (L91)');
  assert.equal(attack2.receipt.result.after.wolfHealth, 0, 'the wolf is killed by the completed action');
  assert.equal(attack2.receipt.result.after.playerHealth, 0,
    'B L51: the receipt after-view reflects the real post-settlement body');
  assert.equal(attack2.receipt.result.after.playerAlive, false);
  assert.equal(attack2.receipt.result.after.battleDeaths, 1, 'the wolf death is booked exactly once');

  const player = playerActor(bundle);
  assert.equal(player.alive, false);
  assert.equal(player.deathTick, DAY_TICKS);

  const encounter = bundle.snapshot.world.encounterModel.encounter;
  assert.equal(encounter.status, 'closed');
  assert.equal(encounter.resolution, 'win', 'R3 L53: the completed wolf kill is never revoked');
  assert.equal(encounter.endTick, DAY_TICKS);
  assert.equal(encounter.elapsedTicks, 12, '144 - 132');
  assert.equal(bundle.snapshot.world.ecologyModel.populations.wolves, INITIAL_LIVING_WOLVES - 1);

  // No EncounterTerminated: the encounter closed as a win before the death branch could fire.
  assert.equal(bundle.eventLog.some((event) => event.type === TERMINATED_TYPE), false,
    'no player-died termination may be emitted for an already-closed encounter');
  const settlement = bundle.eventLog.find((event) => event.type === SETTLED_TYPE && event.tick === DAY_TICKS);
  assert.ok(settlement, 'the tick-144 settlement still ran');

  assertRevisionInvariant(bundle, 'completion-on-settlement chain');
  validateHistory(bundle);
});

// ---------------------------------------------------------------------------
// Gate 5 (R3 card L54): continuous vs segmented runs are identical, and a full replay from the
// initial seed/config/scheduler rejects every audited tamper class. The continuous/segmented
// comparison uses the whole bundle and the whole event log (canonical JSON), not a hash subset.
// ---------------------------------------------------------------------------

test('R3 gate 5: segmented progression equals the continuous run, and replay rejects tampering', () => {
  // Continuous chain.
  let continuous = contractVillage({ health: 1000, hunger: 400, food: 0 });
  continuous = submit(continuous, dto3('PlayerTravel', { destination: FOREST }, 'g5-travel', continuous.snapshot.revision)).bundle;
  continuous = submit(continuous, dto3('AdvanceTime', { ticks: 125 }, 'g5-advance', continuous.snapshot.revision)).bundle;
  continuous = submit(continuous, dto3('EncounterBegin', {}, 'g5-begin', continuous.snapshot.revision)).bundle;
  continuous = submit(continuous, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g5-attack-1', continuous.snapshot.revision)).bundle;
  continuous = submit(continuous, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g5-attack-2', continuous.snapshot.revision)).bundle;

  // Segmented: the same inputs continue after an in-memory JSON round trip following the first attack.
  let segmented = contractVillage({ health: 1000, hunger: 400, food: 0 });
  segmented = submit(segmented, dto3('PlayerTravel', { destination: FOREST }, 'g5-travel', segmented.snapshot.revision)).bundle;
  segmented = submit(segmented, dto3('AdvanceTime', { ticks: 125 }, 'g5-advance', segmented.snapshot.revision)).bundle;
  segmented = submit(segmented, dto3('EncounterBegin', {}, 'g5-begin', segmented.snapshot.revision)).bundle;
  segmented = submit(segmented, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g5-attack-1', segmented.snapshot.revision)).bundle;
  const inMemoryRoundTrip = JSON.parse(JSON.stringify(segmented)); // no disk checkpoint is exercised
  segmented = submit(inMemoryRoundTrip, dto3('EncounterAction', { encounterId: 'encounter-1', action: 'attack' },
    'g5-attack-2', inMemoryRoundTrip.snapshot.revision)).bundle;

  assert.equal(canonicalJson(segmented.snapshot), canonicalJson(continuous.snapshot),
    'R3 L54: the segmented run must reproduce the complete bundle');
  assert.equal(canonicalJson(segmented.eventLog), canonicalJson(continuous.eventLog),
    'R3 L54: the segmented run must reproduce the complete event log');

  // The full replay accepts the real history.
  validateHistory(continuous);

  // Every audited tamper class is rejected by the complete replay (R3 L54).
  const tamper = (mutate, label) => {
    const forged = JSON.parse(JSON.stringify(continuous));
    mutate(forged);
    assert.throws(() => validateHistory(forged), undefined, label);
  };
  tamper((forged) => { forged.snapshot.rng = createRngForgery(forged.snapshot.rng); },
    'tampering with the initial RNG state must be rejected');
  tamper((forged) => {
    const settlement = forged.eventLog.find((event) => event.type === SETTLED_TYPE && event.tick === DAY_TICKS);
    settlement.payload.communalGold += 1;
  }, 'tampering with the settlement fact must be rejected');
  tamper((forged) => {
    forged.snapshot.world.encounterModel.inputHistory[0].receipt.tick += 1;
  }, 'tampering with a journaled receipt must be rejected');
  tamper((forged) => {
    forged.snapshot.world.encounterModel.encounter = {
      ...forged.snapshot.world.encounterModel.encounter, reserved: true,
    };
  }, 'tampering with the reservation must be rejected');
  tamper((forged) => {
    const resolved = forged.eventLog.find((event) => event.type === RESOLVED_TYPE && event.commandId === 'g5-attack-1');
    resolved.causationEventSeqs = [];
  }, 'tampering with the causation chain must be rejected');
  tamper((forged) => {
    const resolved = forged.eventLog.find((event) => event.type === RESOLVED_TYPE && event.commandId === 'g5-attack-1');
    resolved.sourceSystem = 'command-engine';
  }, 'tampering with the event source must be rejected');
});

test('replay accepts DTO travel followed by one real session idle tick', () => {
  let bundle = contractVillage();
  bundle = submit(bundle, dto3('PlayerTravel', { destination: FOREST }, 'mix-dto-session',
    bundle.snapshot.revision)).bundle;

  const session = createSimulationSession(bundle, encounterSystems());
  session.advanceTicks(1);
  bundle = session.getBundle();

  assert.equal(bundle.snapshot.tick, TRAVEL_TICKS + 1);
  validateHistory(bundle);
});

test('replay accepts two real session idle ticks followed by DTO travel', () => {
  const initial = contractVillage();
  const session = createSimulationSession(initial, encounterSystems());
  session.advanceTicks(2);
  let bundle = session.getBundle();

  bundle = submit(bundle, dto3('PlayerTravel', { destination: FOREST }, 'mix-session-dto',
    bundle.snapshot.revision)).bundle;

  assert.equal(bundle.snapshot.tick, 2 + TRAVEL_TICKS);
  validateHistory(bundle);
});

test('replay rejects a changed historical input time anchor', () => {
  const bundle = submit(contractVillage(), dto3('PlayerTravel', { destination: FOREST },
    'tampered-time-anchor', 0)).bundle;
  const forged = JSON.parse(JSON.stringify(bundle));
  forged.snapshot.world.encounterModel.inputHistory[0].receipt.fromTick += 1;

  assert.notEqual(canonicalJson(forged), canonicalJson(bundle),
    'the time-anchor forgery must change the canonical bundle');
  assert.throws(() => validateHistory(forged), undefined,
    'a forged DTO receipt time anchor must fail full replay validation');
});
/** Minimal legal-shape RNG forgery: same shape, different state (R3 L13 ran this exact probe). */
function createRngForgery(rng) {
  const forged = JSON.parse(JSON.stringify(rng));
  forged.state = forged.state === 0 ? 1 : forged.state - 1;
  return forged;
}

// ---------------------------------------------------------------------------
// Gate 6 (R3 card L55): the old survival rules still reject the new five-version config; the
// version gate was restored so only the ENCOUNTER_RULES branch admits the new profile.
// ---------------------------------------------------------------------------

test('R3 gate 6: the old survival profile rejects the new encounter config versions', () => {
  const encounterConfig = defaultEncounterVillageConfig();
  assert.throws(
    () => createSurvivalVillage(42, 'survival-village', encounterConfig),
    (error) => error && error.code === 'UNSUPPORTED_VERSION',
    'R3 L55: loading the new five-version config under the old rules must fail');
});

test('D3-5A CLI RED: parser accepts encounter DTO inputs with a zero-day run', async () => {
  const { parseArguments } = await import('../../simulation-runner.mjs');
  assert.doesNotThrow(() => parseArguments([
    '--fixture', 'encounter-survival-village', '--seed', '42', '--days', '0',
    '--encounter-inputs', 'encounter-inputs.json', '--out', 'out-new',
  ]));
});

test('D3-5A CLI parser preserves the legacy shape and limits zero days to encounter runs', async () => {
  const { parseArguments } = await import('../../simulation-runner.mjs');
  const legacy = parseArguments(['--fixture', 'clock-smoke', '--days', '1', '--seed', '42', '--out', 'legacy-run']);
  assert.deepEqual(Object.keys(legacy), ['fixture', 'resume', 'days', 'ticks', 'seed', 'out']);
  assert.deepEqual(legacy, { fixture: 'clock-smoke', resume: undefined, days: 1, ticks: 144, seed: 42, out: 'legacy-run' });
  const zero = parseArguments(['--fixture', 'encounter-survival-village', '--days', '0', '--seed', '42',
    '--encounter-inputs', 'inputs.json', '--out', 'encounter-run']);
  assert.equal(zero.days, 0);
  assert.equal(zero.ticks, 0);
  assert.equal(zero.encounterInputs, 'inputs.json');
  assert.throws(() => parseArguments(['--fixture', 'survival-village', '--days', '0', '--seed', '42',
    '--encounter-inputs', 'inputs.json', '--out', 'old-run']), error => error.code === 'INVALID_INPUT' || error.code === 'LIMIT_EXCEEDED');
});

async function cliTools(t) {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawn } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { canonicalJson } = await import('../../runtime/core/data-contract.mjs');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const runner = path.join(root, 'simulation-runner.mjs');
  const prefix = path.join(os.tmpdir(), 'd35-encounter-cli-');
  const directory = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.isAbsolute(directory) && directory.startsWith(prefix), 'CLI cleanup is confined to its unique TEMP directory');
    await fs.rm(directory, { recursive: true, force: true });
  });
  const run = args => new Promise(resolve => {
    const child = spawn(process.execPath, [runner, ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const timer = setTimeout(() => { child.kill(); if (!done) { done = true; resolve({ exitCode: null, stdout, stderr: stderr + '\nCLI timeout' }); } }, 180000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
    child.once('error', error => { clearTimeout(timer); if (!done) { done = true; resolve({ exitCode: null, stdout, stderr: stderr + String(error) }); } });
    child.once('close', exitCode => { clearTimeout(timer); if (!done) { done = true; resolve({ exitCode, stdout, stderr }); } });
  });
  const writeInputs = async (name, value) => {
    const file = path.join(directory, name);
    await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  };
  const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
  const digest = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
  return { fs, path, directory, run, writeInputs, json, digest };
}

function cliDto(type, payload, commandId, expectedRevision) {
  return { version: 3, commandId, expectedRevision, type, payload };
}

test('D3-5A CLI persists an active encounter and resume matches a continuous two-attack run', async t => {
  const tools = await cliTools(t);
  const { fs, path, directory, run, writeInputs, json, digest } = tools;
  const inputs1 = await writeInputs('first-inputs.json', [
    cliDto('PlayerTravel', { destination: 'forest' }, 'cli-travel', 0),
    cliDto('EncounterBegin', {}, 'cli-begin', 12),
    cliDto('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'cli-attack-1', 13),
  ]);
  const firstOut = path.join(directory, 'first-run');
  const first = await run(['--fixture', 'encounter-survival-village', '--seed', '42', '--days', '0',
    '--encounter-inputs', inputs1, '--out', firstOut]);
  assert.equal(first.exitCode, 0, first.stderr);
  const firstStdout = JSON.parse(first.stdout.trim());
  assert.equal(firstStdout.tick, 18);
  const firstSummary = await json(path.join(firstOut, 'summary.json'));
  const firstCheckpoint = await json(firstSummary.checkpointPath);
  const firstEncounter = await json(path.join(firstOut, 'encounter-state.json'));
  const firstInputs = await json(path.join(firstOut, 'encounter-inputs.json'));
  assert.equal(firstCheckpoint.snapshot.tick, 18);
  assert.equal(firstCheckpoint.snapshot.world.actorModel.actors.find(actor => actor.actorId === 'actor-4').health, 920);
  assert.equal(firstCheckpoint.snapshot.world.encounterModel.encounter.wolfHealth, 150);
  assert.equal(firstCheckpoint.snapshot.world.encounterModel.encounter.attackCount, 1);
  assert.equal(firstCheckpoint.snapshot.world.ecologyModel.populations.wolves, 14);
  assert.equal(firstCheckpoint.snapshot.world.ecologyModel.reservedWolves, 1);
  assert.deepEqual(firstEncounter, firstCheckpoint.snapshot.world.encounterModel);
  assert.equal(firstEncounter.encounter.status, 'active');
  assert.deepEqual(firstInputs, firstCheckpoint.snapshot.world.encounterModel.inputHistory);
  assert.equal(firstSummary.stateHash, digest(firstCheckpoint.snapshot));
  assert.equal(firstSummary.eventHash, digest(firstCheckpoint.eventLog));
  assert.equal(firstSummary.encounterStateHash, digest(firstEncounter));
  assert.equal(firstSummary.encounterInputsHash, digest(firstInputs));

  const inputs2 = await writeInputs('resume-inputs.json', [
    cliDto('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'cli-attack-2', 19),
  ]);
  const resumedOut = path.join(directory, 'resumed-run');
  const resumed = await run(['--resume', firstSummary.checkpointPath, '--days', '0',
    '--encounter-inputs', inputs2, '--out', resumedOut]);
  assert.equal(resumed.exitCode, 0, resumed.stderr);
  const resumedStdout = JSON.parse(resumed.stdout.trim());
  const resumedSummary = await json(path.join(resumedOut, 'summary.json'));
  const resumedCheckpoint = await json(resumedSummary.checkpointPath);
  const resumedEncounter = await json(path.join(resumedOut, 'encounter-state.json'));
  const resumedInputs = await json(path.join(resumedOut, 'encounter-inputs.json'));
  assert.equal(resumedStdout.tick, 24);
  assert.equal(resumedCheckpoint.snapshot.tick, 24);
  assert.equal(resumedCheckpoint.snapshot.world.actorModel.actors.find(actor => actor.actorId === 'actor-4').health, 920);
  assert.equal(resumedCheckpoint.snapshot.world.encounterModel.encounter.wolfHealth, 0);
  assert.equal(resumedCheckpoint.snapshot.world.encounterModel.encounter.resolution, 'win');
  assert.equal(resumedCheckpoint.snapshot.world.ecologyModel.populations.wolves, 13);
  assert.equal(resumedCheckpoint.snapshot.world.ecologyModel.reservedWolves, 0);
  assert.equal(resumedCheckpoint.snapshot.world.ecologyModel.ledger.wolves.battleDeaths, 1);
  assert.deepEqual(resumedEncounter, resumedCheckpoint.snapshot.world.encounterModel);
  assert.equal(resumedEncounter.encounter.status, 'closed');
  assert.equal(resumedEncounter.encounter.resolution, 'win');
  assert.deepEqual(resumedInputs, resumedCheckpoint.snapshot.world.encounterModel.inputHistory);
  assert.equal(resumedInputs.length, 4, 'resume retains the complete input journal, including the first run');
  assert.equal(resumedSummary.stateHash, digest(resumedCheckpoint.snapshot));
  assert.equal(resumedSummary.eventHash, digest(resumedCheckpoint.eventLog));
  assert.equal(resumedSummary.encounterStateHash, digest(resumedEncounter));
  assert.equal(resumedSummary.encounterInputsHash, digest(resumedInputs));

  const continuousInputs = await writeInputs('continuous-inputs.json', [
    cliDto('PlayerTravel', { destination: 'forest' }, 'cli-travel', 0),
    cliDto('EncounterBegin', {}, 'cli-begin', 12),
    cliDto('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'cli-attack-1', 13),
    cliDto('EncounterAction', { encounterId: 'encounter-1', action: 'attack' }, 'cli-attack-2', 19),
  ]);
  const continuousOut = path.join(directory, 'continuous-run');
  const continuous = await run(['--fixture', 'encounter-survival-village', '--seed', '42', '--days', '0',
    '--encounter-inputs', continuousInputs, '--out', continuousOut]);
  assert.equal(continuous.exitCode, 0, continuous.stderr);
  const continuousSummary = await json(path.join(continuousOut, 'summary.json'));
  const continuousCheckpoint = await json(continuousSummary.checkpointPath);
  const continuousEncounter = await json(path.join(continuousOut, 'encounter-state.json'));
  const continuousInputsJournal = await json(path.join(continuousOut, 'encounter-inputs.json'));
  assert.equal(continuousSummary.stateHash, resumedSummary.stateHash);
  assert.equal(continuousSummary.eventHash, resumedSummary.eventHash);
  assert.equal(digest(continuousCheckpoint), digest(resumedCheckpoint));
  assert.equal(digest(continuousEncounter), digest(resumedEncounter));
  assert.equal(digest(continuousInputsJournal), digest(resumedInputs));
});

test('D3-5A CLI rejects malformed, legacy-profile and auto-advance-conflicting inputs without editing DTO bytes', async t => {
  const { path, run, writeInputs, directory } = await cliTools(t);
  const malformed = await writeInputs('duplicate-keys.json', '[{"version":3,"version":3}]');
  const malformedResult = await run(['--fixture', 'encounter-survival-village', '--seed', '42', '--days', '0',
    '--encounter-inputs', malformed, '--out', path.join(directory, 'malformed-run')]);
  assert.notEqual(malformedResult.exitCode, 0, 'strict JSON parsing rejects duplicate keys');

  const oversized = await writeInputs('oversized-inputs.json', ' '.repeat(4097));
  const oversizedResult = await run(['--fixture', 'encounter-survival-village', '--seed', '42', '--days', '0',
    '--encounter-inputs', oversized, '--out', path.join(directory, 'oversized-run')]);
  assert.notEqual(oversizedResult.exitCode, 0, 'encounter input JSON is capped at the contract 4096-byte budget');

  const oldInputs = await writeInputs('old-profile-inputs.json', []);
  const oldFlag = await run(['--fixture', 'survival-village', '--seed', '42', '--days', '1',
    '--encounter-inputs', oldInputs, '--out', path.join(directory, 'old-profile-run')]);
  assert.notEqual(oldFlag.exitCode, 0, 'old profiles do not accept encounter input files');
  const oldZero = await run(['--fixture', 'survival-village', '--seed', '42', '--days', '0',
    '--out', path.join(directory, 'old-zero-run')]);
  assert.notEqual(oldZero.exitCode, 0, 'zero-day runs are restricted to the encounter profile');

  const conflicting = await writeInputs('conflicting-auto-id.json', [
    cliDto('PlayerTravel', { destination: 'forest' }, 'conflict-travel', 0),
    cliDto('EncounterBegin', {}, 'runner-advance-13', 12),
  ]);
  const before = await (await import('node:fs/promises')).readFile(conflicting);
  const conflictResult = await run(['--fixture', 'encounter-survival-village', '--seed', '42', '--days', '1',
    '--encounter-inputs', conflicting, '--out', path.join(directory, 'conflict-run')]);
  assert.notEqual(conflictResult.exitCode, 0, 'automatic AdvanceTime ID conflicts with the supplied DTO ID');
  const after = await (await import('node:fs/promises')).readFile(conflicting);
  assert.deepEqual(after, before, 'runner failure does not alter the user supplied DTO file');
});

test('D3-5A legacy CLI invocation retains its prior clock-smoke output contract', async t => {
  const { fs, path, directory, run, json } = await cliTools(t);
  const out = path.join(directory, 'clock-smoke-run');
  const result = await run(['--fixture', 'clock-smoke', '--seed', '42', '--days', '1', '--out', out]);
  assert.equal(result.exitCode, 0, result.stderr);
  const stdout = JSON.parse(result.stdout.trim());
  assert.deepEqual(Object.keys(stdout).sort(), ['checkpointPath', 'eventHash', 'stateHash', 'status', 'tick']);
  assert.equal(stdout.status, 'succeeded');
  assert.equal(stdout.tick, 144);
  const summary = await json(path.join(out, 'summary.json'));
  assert.equal(summary.fixtureId, 'clock-smoke');
  assert.equal(summary.tick, 144);
  assert.equal(path.basename(summary.checkpointPath), 'checkpoint-r144.json');
  for (const name of ['encounter-state.json', 'encounter-inputs.json']) {
    await assert.rejects(fs.access(path.join(out, name)), { code: 'ENOENT' });
  }
});
