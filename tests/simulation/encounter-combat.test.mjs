// D3-4 minimal deterministic single-wolf combat kernel tests (contract d3-combat-kernel-v1).
// Independent lane: every expected number below is hand-computed from the frozen taskbook
// (tasks/D3-4-ENCOUNTER-COMBAT-TASK.md) - wolf 300, player blow 150, surviving counter 80,
// attack 6 ticks, flee 6 ticks, cancel 0 ticks, HP clamped at 0 - and the module under test is never
// read. The two real consumers (D3-3 encounter session, D3-1 reservation ledger) are exercised as
// black boxes so the numbers are anchored to actual world data, not to this file's own constants.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../../runtime/core/encounter-combat.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createEncounterReservation, reserveEncounter,
  closeEncounterReservation } from '../../runtime/core/encounter-reservation.mjs';
import { createEncounterSession } from '../../runtime/core/encounter-session.mjs';
import { createPlayerPlayVillage, playerPlaySystems } from '../../runtime/fixtures/player-play-village.mjs';
import { executePlayerIntent } from '../../runtime/core/player-intents.mjs';

const { ENCOUNTER_COMBAT_VERSION, createEncounterCombat, validateEncounterCombat,
  applyEncounterCombatAction } = mod;

// Frozen recipe, one constant per taskbook line.
const VERSION = 'encounter-combat-v1';        // L14: the only legal version string.
const WOLF_HEALTH = 300;                      // L16: wolf starts at 300.
const PLAYER_ATTACK = 150;                    // L16: player blow 150.
const WOLF_COUNTER = 80;                      // L16: surviving wolf counters for 80.
const ATTACK_TICKS = 6;                       // L17: attack costs 6 ticks.
const FLEE_TICKS = 6;                         // L17: flee costs 6 ticks.
const CANCEL_TICKS = 0;                       // L17: cancel costs 0 ticks.
const MIN_PLAYER_HEALTH = 1;                  // L15: positive safe integer 1..1000.
const MAX_PLAYER_HEALTH = 1000;               // L15: the trusted adapter's ceiling.
const MAX_STATE_BYTES = 4096;                 // L30: canonical UTF-8 budget per state and intent.
const ID = 'encounter-1';
const OTHER_ID = 'encounter-2';
// L20: the state carries exactly these ten fields.
const STATE_FIELDS = ['elapsedTicks', 'encounterId', 'initialPlayerHealth', 'playerHealth',
  'resolution', 'rounds', 'status', 'version', 'wolfDied', 'wolfHealth'];
// L37: the closed result carries exactly these six fields.
const RESULT_FIELDS = ['elapsedTicks', 'encounterId', 'playerHealth', 'resolution', 'wolfDied',
  'wolfHealth'];

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};
const bytes = (value) => new TextEncoder().encode(canonicalJson(value)).length;
const rejects = (run, code, why) => assert.throws(run, { code }, why);
const attempt = (run) => { try { run(); return 'accepted'; } catch (error) { return error?.code ?? 'no-code'; } };

// L20/L21: the create() shape, parameterised for hand-built fixtures.
const stateOf = (over = {}) => ({ version: VERSION, encounterId: ID, initialPlayerHealth: 1000,
  playerHealth: 1000, wolfHealth: WOLF_HEALTH, rounds: 0, elapsedTicks: 0, status: 'active',
  resolution: null, wolfDied: false, ...over });
// L23: active/round0 -> the opening health, wolf 300, no ticks.
const active0 = (initial) => stateOf({ initialPlayerHealth: initial, playerHealth: initial });
// L23: active/round1 -> initial>80, initial-80, wolf 150, 6 ticks.
const active1 = (initial) => stateOf({ initialPlayerHealth: initial,
  playerHealth: initial - WOLF_COUNTER, wolfHealth: WOLF_HEALTH - PLAYER_ATTACK, rounds: 1,
  elapsedTicks: ATTACK_TICKS });
// L24: closed/win -> round2, initial>80, initial-80, wolf 0, died, 12 ticks.
const winState = (initial) => stateOf({ initialPlayerHealth: initial,
  playerHealth: initial - WOLF_COUNTER, wolfHealth: 0, rounds: 2, elapsedTicks: 2 * ATTACK_TICKS,
  status: 'closed', resolution: 'win', wolfDied: true });
// L25: closed/lose -> round1, initial<=80, player 0, wolf 150, 6 ticks.
const loseState = (initial) => stateOf({ initialPlayerHealth: initial, playerHealth: 0,
  wolfHealth: WOLF_HEALTH - PLAYER_ATTACK, rounds: 1, elapsedTicks: ATTACK_TICKS, status: 'closed',
  resolution: 'lose' });
// L26/L27: closed/flee -> rounds*6 + 6 ticks; closed/cancel -> rounds*6 ticks; round1 needs initial>80.
const fledState = (initial, round) => stateOf({ initialPlayerHealth: initial,
  playerHealth: initial - round * WOLF_COUNTER, wolfHealth: WOLF_HEALTH - round * PLAYER_ATTACK,
  rounds: round, elapsedTicks: round * ATTACK_TICKS + FLEE_TICKS, status: 'closed',
  resolution: 'flee' });
const cancelledState = (initial, round) => stateOf({ initialPlayerHealth: initial,
  playerHealth: initial - round * WOLF_COUNTER, wolfHealth: WOLF_HEALTH - round * PLAYER_ATTACK,
  rounds: round, elapsedTicks: round * ATTACK_TICKS, status: 'closed', resolution: 'cancel' });
const intentOf = (action, encounterId = ID) => ({ encounterId, action });
// Walk a whole fight from the opening state and hand back the last apply() output.
const drive = (initial, actions) => {
  let state = createEncounterCombat(ID, initial), out = null;
  for (const action of actions) {
    out = applyEncounterCombatAction(state, intentOf(action));
    state = out.state;
  }
  return out;
};

test('contract smoke: exactly four exports and the frozen version string', () => {
  assert.deepEqual(Object.keys(mod).sort(),
    ['ENCOUNTER_COMBAT_VERSION', 'applyEncounterCombatAction', 'createEncounterCombat',
      'validateEncounterCombat'],
    'the module exports nothing else, so no test-only hook is smuggled in');
  assert.equal(ENCOUNTER_COMBAT_VERSION, VERSION);
  assert.equal(typeof createEncounterCombat, 'function');
  assert.equal(typeof validateEncounterCombat, 'function');
  assert.equal(typeof applyEncounterCombatAction, 'function');
});

test('create: the exact ten-field shape and the frozen opening values', () => {
  const state = createEncounterCombat(ID, 1000);
  assert.deepEqual(state, { version: VERSION, encounterId: ID, initialPlayerHealth: 1000,
    playerHealth: 1000, wolfHealth: WOLF_HEALTH, rounds: 0, elapsedTicks: 0, status: 'active',
    resolution: null, wolfDied: false });
  assert.deepEqual(Object.keys(state).sort(), STATE_FIELDS, 'exactly ten state fields');
  assert.equal(state.playerHealth, state.initialPlayerHealth, 'L21: playerHealth starts at initial');
  assert.equal(validateEncounterCombat(state), state, 'L28: validate hands back the input itself');
  assert.equal(createEncounterCombat(ID, MIN_PLAYER_HEALTH).playerHealth, MIN_PLAYER_HEALTH,
    'the lower bound 1 is legal');
  assert.equal(createEncounterCombat(ID, MAX_PLAYER_HEALTH).initialPlayerHealth, MAX_PLAYER_HEALTH,
    'the upper bound 1000 is legal');
  assert.equal(createEncounterCombat('e'.repeat(64), 1000).encounterId.length, 64,
    '64 characters is the widest legal id');
  const one = createEncounterCombat(ID, 1000), two = createEncounterCombat(ID, 1000);
  assert.notEqual(one, two, 'each creation is its own object');
  assert.deepEqual(one, two, 'equal arguments give equal states');
});

test('reachability: every hand-built shape the taskbook names validates as itself', () => {
  // L22-27: the complete reachable set, built by hand and asserted positively, so a validator that
  // merely rejects everything cannot pass this file.
  const reachable = [
    ['active/round0 at 1', active0(1)],
    ['active/round0 at 81', active0(81)],
    ['active/round0 at 1000', active0(1000)],
    ['active/round1 at 81', active1(81)],
    ['active/round1 at 1000', active1(1000)],
    ['closed/win at 81', winState(81)],
    ['closed/win at 1000', winState(1000)],
    ['closed/lose at 1', loseState(1)],
    ['closed/lose at 80', loseState(80)],
    ['closed/flee at round0', fledState(1000, 0)],
    ['closed/flee at round1', fledState(81, 1)],
    ['closed/cancel at round0', cancelledState(1000, 0)],
    ['closed/cancel at round1', cancelledState(81, 1)],
  ];
  for (const [label, fixture] of reachable) {
    assert.equal(validateEncounterCombat(fixture), fixture, 'L28: ' + label + ' is reachable and valid');
    assert.deepEqual(Object.keys(fixture).sort(), STATE_FIELDS, label + ' carries exactly ten fields');
    assert.equal(fixture.wolfDied, fixture.wolfHealth === 0, 'L27: ' + label + ' keeps the flag honest');
    assert.equal(fixture.elapsedTicks,
      fixture.rounds * ATTACK_TICKS + (fixture.resolution === 'flee' ? FLEE_TICKS : 0),
      'L27: ' + label + ' obeys the tick formula');
  }
  // The exact arithmetic of the boundary fixtures, re-derived here rather than read from the module.
  assert.equal(active1(81).playerHealth, 1, '81 - 80 = 1');
  assert.equal(active1(81).wolfHealth, 150, '300 - 150 = 150');
  assert.equal(winState(81).playerHealth, 1);
  assert.equal(winState(81).wolfHealth, 0);
  assert.equal(winState(81).elapsedTicks, 12, 'two blows cost 12 ticks');
  assert.equal(loseState(80).playerHealth, 0, '80 - 80 = 0');
  assert.equal(fledState(1000, 0).elapsedTicks, 6, 'a flee from the opening costs 6 ticks');
  assert.equal(fledState(81, 1).elapsedTicks, 12, 'a flee after one blow costs 12 ticks');
  assert.equal(cancelledState(1000, 0).elapsedTicks, 0, 'a cancel from the opening costs 0 ticks');
  assert.equal(cancelledState(81, 1).elapsedTicks, 6, 'a cancel after one blow costs 6 ticks');
  assert.equal(fledState(81, 1).wolfHealth, 150, 'the fled wolf is still wounded');
});

test('create rejects: 0, 1001, non-integers, a death and a malformed id', () => {
  rejects(() => createEncounterCombat(ID, 0), 'INVALID_INPUT', 'L15: a death (0 health) is never created');
  rejects(() => createEncounterCombat(ID, MAX_PLAYER_HEALTH + 1), 'INVALID_INPUT', 'L15: past the 1..1000 ceiling');
  rejects(() => createEncounterCombat(ID, -1), 'INVALID_INPUT', 'a negative health');
  rejects(() => createEncounterCombat(ID, 1.5), 'INVALID_INPUT', 'a fractional health');
  rejects(() => createEncounterCombat(ID, 0.5), 'INVALID_INPUT', 'a fractional health below one');
  rejects(() => createEncounterCombat(ID, NaN), 'INVALID_INPUT', 'NaN');
  rejects(() => createEncounterCombat(ID, Infinity), 'INVALID_INPUT', 'Infinity');
  rejects(() => createEncounterCombat(ID, -Infinity), 'INVALID_INPUT', '-Infinity');
  rejects(() => createEncounterCombat(ID, 2 ** 53), 'INVALID_INPUT', 'an unsafe integer');
  for (const bad of ['1000', 1000n, null, undefined, true, {}, [], [1000]]) {
    rejects(() => createEncounterCombat(ID, bad), 'INVALID_INPUT', 'health ' + String(bad));
  }
  for (const bad of ['', 'e'.repeat(65), null, undefined, 1, true, {}, []] ) {
    rejects(() => createEncounterCombat(bad, 1000), 'INVALID_INPUT', 'encounterId ' + String(bad));
  }
});

test('attack: 1000 -> 920/150 round1 tick6 active, then 920/0 round2 tick12 win with no counter', () => {
  const opened = createEncounterCombat(ID, 1000);
  const first = applyEncounterCombatAction(opened, intentOf('attack'));
  assert.deepEqual(Object.keys(first).sort(), ['result', 'state'], 'L37: exactly {state, result}');
  assert.deepEqual(first.state, { version: VERSION, encounterId: ID, initialPlayerHealth: 1000,
    playerHealth: 1000 - WOLF_COUNTER, wolfHealth: WOLF_HEALTH - PLAYER_ATTACK, rounds: 1,
    elapsedTicks: ATTACK_TICKS, status: 'active', resolution: null, wolfDied: false });
  assert.equal(first.result, null, 'L37: an active outcome carries no result');
  assert.equal(validateEncounterCombat(first.state), first.state, 'the candidate is a valid state');
  const second = applyEncounterCombatAction(first.state, intentOf('attack'));
  assert.deepEqual(second.state, { version: VERSION, encounterId: ID, initialPlayerHealth: 1000,
    playerHealth: 1000 - WOLF_COUNTER, wolfHealth: 0, rounds: 2, elapsedTicks: 2 * ATTACK_TICKS,
    status: 'closed', resolution: 'win', wolfDied: true });
  assert.deepEqual(second.result, { encounterId: ID, resolution: 'win',
    playerHealth: 1000 - WOLF_COUNTER, wolfHealth: 0, wolfDied: true,
    elapsedTicks: 2 * ATTACK_TICKS });
  assert.deepEqual(Object.keys(second.result).sort(), RESULT_FIELDS, 'exactly six result fields');
  assert.equal(second.state.playerHealth, 1000 - WOLF_COUNTER,
    'L16: the killing blow is not answered - 920, never 840');
  assert.equal(second.state.wolfDied, second.state.wolfHealth === 0, 'L27: wolfDied tracks wolfHealth');
});

test('the 80/81/1 boundary: 80 dies to the first counter, 81 survives and wins, 1 dies at once', () => {
  const eighty = applyEncounterCombatAction(createEncounterCombat(ID, 80), intentOf('attack'));
  assert.deepEqual(eighty.state, { version: VERSION, encounterId: ID, initialPlayerHealth: 80,
    playerHealth: 0, wolfHealth: WOLF_HEALTH - PLAYER_ATTACK, rounds: 1,
    elapsedTicks: ATTACK_TICKS, status: 'closed', resolution: 'lose', wolfDied: false });
  assert.deepEqual(eighty.result, { encounterId: ID, resolution: 'lose', playerHealth: 0,
    wolfHealth: WOLF_HEALTH - PLAYER_ATTACK, wolfDied: false, elapsedTicks: ATTACK_TICKS });
  assert.equal(eighty.state.wolfHealth, PLAYER_ATTACK, 'the wolf survived the losing exchange');
  assert.equal(validateEncounterCombat(eighty.state), eighty.state);

  const eightyOne = applyEncounterCombatAction(createEncounterCombat(ID, 81), intentOf('attack'));
  assert.equal(eightyOne.state.status, 'active', '81 - 80 = 1 keeps the fight open');
  assert.equal(eightyOne.state.playerHealth, 1);
  assert.equal(eightyOne.state.wolfHealth, PLAYER_ATTACK);
  assert.equal(eightyOne.state.rounds, 1);
  assert.equal(eightyOne.result, null);
  const win = applyEncounterCombatAction(eightyOne.state, intentOf('attack'));
  assert.equal(win.state.playerHealth, 1, 'the surviving player takes no counter on the kill');
  assert.equal(win.state.wolfHealth, 0);
  assert.equal(win.state.resolution, 'win');
  assert.equal(win.state.wolfDied, true);
  assert.equal(win.state.elapsedTicks, 2 * ATTACK_TICKS);

  const one = applyEncounterCombatAction(createEncounterCombat(ID, 1), intentOf('attack'));
  assert.equal(one.state.playerHealth, 0, 'L16: 1 - 80 clamps to 0, never negative');
  assert.equal(one.state.resolution, 'lose');
  assert.equal(one.state.rounds, 1);
  assert.equal(one.state.elapsedTicks, ATTACK_TICKS);
  assert.equal(one.state.wolfDied, false);
});

test('flee and cancel: fixed durations, no extra damage and no healing', () => {
  const openingFlee = applyEncounterCombatAction(createEncounterCombat(ID, 1000), intentOf('flee'));
  assert.deepEqual(openingFlee.state, { version: VERSION, encounterId: ID, initialPlayerHealth: 1000,
    playerHealth: 1000, wolfHealth: WOLF_HEALTH, rounds: 0, elapsedTicks: FLEE_TICKS,
    status: 'closed', resolution: 'flee', wolfDied: false });
  assert.deepEqual(openingFlee.result, { encounterId: ID, resolution: 'flee', playerHealth: 1000,
    wolfHealth: WOLF_HEALTH, wolfDied: false, elapsedTicks: FLEE_TICKS });
  const openingCancel = applyEncounterCombatAction(createEncounterCombat(ID, 1000), intentOf('cancel'));
  assert.deepEqual(openingCancel.state, { version: VERSION, encounterId: ID, initialPlayerHealth: 1000,
    playerHealth: 1000, wolfHealth: WOLF_HEALTH, rounds: 0, elapsedTicks: CANCEL_TICKS,
    status: 'closed', resolution: 'cancel', wolfDied: false });
  assert.deepEqual(openingCancel.result, { encounterId: ID, resolution: 'cancel', playerHealth: 1000,
    wolfHealth: WOLF_HEALTH, wolfDied: false, elapsedTicks: CANCEL_TICKS });

  const wounded = applyEncounterCombatAction(createEncounterCombat(ID, 1000), intentOf('attack')).state;
  assert.equal(wounded.playerHealth, 1000 - WOLF_COUNTER, 'the fixture really took 80 damage');
  const afterFlee = applyEncounterCombatAction(wounded, intentOf('flee'));
  assert.equal(afterFlee.state.playerHealth, 1000 - WOLF_COUNTER, 'L17: fleeing never restores damage');
  assert.equal(afterFlee.state.wolfHealth, PLAYER_ATTACK);
  assert.equal(afterFlee.state.rounds, 1, 'flee adds no round');
  assert.equal(afterFlee.state.elapsedTicks, ATTACK_TICKS + FLEE_TICKS, 'L27: rounds*6 + 6 = 12');
  assert.equal(afterFlee.state.resolution, 'flee');
  const afterCancel = applyEncounterCombatAction(wounded, intentOf('cancel'));
  assert.equal(afterCancel.state.playerHealth, 1000 - WOLF_COUNTER, 'cancel never restores damage');
  assert.equal(afterCancel.state.wolfHealth, PLAYER_ATTACK);
  assert.equal(afterCancel.state.rounds, 1);
  assert.equal(afterCancel.state.elapsedTicks, ATTACK_TICKS, 'L27: rounds*6 = 6');
  assert.equal(afterCancel.state.resolution, 'cancel');
  const woundedEscape = applyEncounterCombatAction(active1(81), intentOf('flee'));
  assert.equal(woundedEscape.state.elapsedTicks, 2 * ATTACK_TICKS, 'round1 flee is 6 + 6 = 12 ticks');
  assert.equal(woundedEscape.state.playerHealth, 1);
  assert.equal(woundedEscape.state.wolfHealth, PLAYER_ATTACK);
});

test('apply ordering: the state, then the intent, then a foreign id, then a same-id closed slot', () => {
  const active = stateOf();
  const closed = winState(1000);
  rejects(() => applyEncounterCombatAction({ ...active, extra: 1 }, intentOf('attack', OTHER_ID)),
    'INVALID_INPUT', 'L35: the state is validated before the encounter id is compared');
  rejects(() => applyEncounterCombatAction({ ...active, extra: 1 }, intentOf('heal')), 'INVALID_INPUT');
  rejects(() => applyEncounterCombatAction(active, intentOf('heal', OTHER_ID)), 'INVALID_INPUT',
    'the intent shape is judged before the encounter id');
  rejects(() => applyEncounterCombatAction(active, { encounterId: OTHER_ID, action: 'attack',
    damage: 999 }), 'INVALID_INPUT', 'an injected field is a shape fault, not a mismatch');
  rejects(() => applyEncounterCombatAction(active, intentOf('attack', OTHER_ID)),
    'ENCOUNTER_ID_MISMATCH', 'L35: a foreign id on an open encounter');
  rejects(() => applyEncounterCombatAction(closed, intentOf('attack', OTHER_ID)),
    'ENCOUNTER_ID_MISMATCH', 'L35: the foreign id wins over ENCOUNTER_CLOSED');
  rejects(() => applyEncounterCombatAction(closed, intentOf('flee', OTHER_ID)), 'ENCOUNTER_ID_MISMATCH');
  rejects(() => applyEncounterCombatAction(closed, intentOf('cancel', OTHER_ID)), 'ENCOUNTER_ID_MISMATCH');
  for (const action of ['attack', 'flee', 'cancel']) {
    rejects(() => applyEncounterCombatAction(closed, intentOf(action)), 'ENCOUNTER_CLOSED',
      'L35/L39: a same-id closed slot refuses ' + action);
  }
  rejects(() => applyEncounterCombatAction(fledState(1000, 0), intentOf('attack')), 'ENCOUNTER_CLOSED');
  rejects(() => applyEncounterCombatAction(loseState(80), intentOf('cancel')), 'ENCOUNTER_CLOSED');
  assert.equal(active.status, 'active', 'the caller state is still open after every refusal');
});

test('intent shape: exactly two fields, three legal actions and no client-supplied outcome', () => {
  const state = stateOf();
  assert.deepEqual(Object.keys(intentOf('attack')).sort(), ['action', 'encounterId'],
    'L34: the intent carries exactly encounterId and action');
  for (const action of ['attack', 'flee', 'cancel']) {
    assert.equal(attempt(() => applyEncounterCombatAction(state, intentOf(action))), 'accepted', action);
  }
  for (const bad of ['Attack', 'heal', 'win', 'lose', 'flee ', '', null, undefined, 0, true, {}, []]) {
    rejects(() => applyEncounterCombatAction(state, { encounterId: ID, action: bad }), 'INVALID_INPUT',
      'action ' + String(bad));
  }
  for (const extra of ['damage', 'health', 'result', 'outcome', 'actorId', 'win', 'wolfHealth',
    'reward', 'rounds', 'playerHealth']) {
    rejects(() => applyEncounterCombatAction(state, { ...intentOf('attack'), [extra]: 1 }),
      'INVALID_INPUT', 'L34: injected ' + extra);
  }
  for (const bad of ['', 'e'.repeat(65), null, undefined, 1, true, {}, []]) {
    rejects(() => applyEncounterCombatAction(state, { encounterId: bad, action: 'attack' }),
      'INVALID_INPUT', 'encounterId ' + String(bad));
  }
  const { encounterId: _id, ...missingId } = intentOf('attack');
  rejects(() => applyEncounterCombatAction(state, missingId), 'INVALID_INPUT', 'a missing encounterId');
  const { action: _action, ...missingAction } = intentOf('attack');
  rejects(() => applyEncounterCombatAction(state, missingAction), 'INVALID_INPUT', 'a missing action');
  assert.equal(applyEncounterCombatAction(state, intentOf('attack')).result, null,
    'a legal action never fabricates a rejection result');
});

test('descriptor preflight: no accessor ever runs and exotic records are refused', () => {
  let calls = 0;
  const stateGetter = stateOf();
  Object.defineProperty(stateGetter, 'playerHealth',
    { enumerable: true, configurable: true, get() { calls += 1; return 1000; } });
  const stateHidden = stateOf();
  Object.defineProperty(stateHidden, 'hidden',
    { value: 1, enumerable: false, configurable: true, writable: true });
  const stateSymbol = { ...stateOf() };
  stateSymbol[Symbol('extra')] = 1;
  const stateCycle = stateOf();
  stateCycle.self = stateCycle;
  const intentGetter = intentOf('attack');
  Object.defineProperty(intentGetter, 'action',
    { enumerable: true, configurable: true, get() { calls += 1; return 'attack'; } });
  const intentCycle = intentOf('attack');
  intentCycle.self = intentCycle;
  const codes = [
    attempt(() => validateEncounterCombat(stateGetter)),
    attempt(() => applyEncounterCombatAction(stateGetter, intentOf('attack'))),
    attempt(() => validateEncounterCombat(stateHidden)),
    attempt(() => validateEncounterCombat(stateSymbol)),
    attempt(() => validateEncounterCombat(stateCycle)),
    attempt(() => applyEncounterCombatAction(stateOf(), intentGetter)),
    attempt(() => applyEncounterCombatAction(stateOf(), intentCycle)),
  ];
  assert.deepEqual(codes, Array(7).fill('INVALID_INPUT'),
    'L29: accessors, hidden keys, symbols and cycles are all data-boundary faults');
  assert.equal(calls, 0, 'L29: no accessor was ever invoked');

  const bare = Object.assign(Object.create(null), stateOf());
  assert.equal(validateEncounterCombat(bare), bare, 'L29: a null-prototype state is ordinary data');
  assert.equal(applyEncounterCombatAction(bare, intentOf('attack')).state.playerHealth,
    1000 - WOLF_COUNTER, 'a null-prototype state is still a legal input');
  const bareIntent = Object.assign(Object.create(null), intentOf('flee'));
  assert.equal(applyEncounterCombatAction(stateOf(), bareIntent).state.resolution, 'flee',
    'a null-prototype intent is accepted');
  const frozenState = deepFreeze(stateOf());
  assert.equal(validateEncounterCombat(frozenState), frozenState, 'L29: a frozen state validates');
  assert.equal(applyEncounterCombatAction(frozenState, deepFreeze(intentOf('flee'))).state.resolution,
    'flee', 'a frozen state and intent are usable');

  rejects(() => validateEncounterCombat([VERSION, ID, 1000, 1000, WOLF_HEALTH, 0, 0, 'active', null,
    false]), 'INVALID_INPUT', 'an array is not a state');
  rejects(() => validateEncounterCombat(Object.assign(function tag() {}, stateOf())), 'INVALID_INPUT',
    'a function is not a data record');
  rejects(() => validateEncounterCombat(Object.assign(Object.create({ inherited: 1 }), stateOf())),
    'INVALID_INPUT', 'a foreign prototype is not plain data');
  for (const bad of [null, undefined, 'state', 0, true]) {
    rejects(() => validateEncounterCombat(bad), 'INVALID_INPUT', 'state ' + String(bad));
  }
  rejects(() => applyEncounterCombatAction(stateOf(), null), 'INVALID_INPUT', 'a null intent');
  rejects(() => validateEncounterCombat({ ...stateOf(), extra: 1 }), 'INVALID_INPUT',
    'L29: an extra state field');
  rejects(() => applyEncounterCombatAction(stateOf(), { ...intentOf('attack'), extra: 1 }),
    'INVALID_INPUT', 'an extra intent field');
  for (const key of STATE_FIELDS) {
    const { [key]: _drop, ...rest } = stateOf();
    rejects(() => validateEncounterCombat(rest), 'INVALID_INPUT', 'missing state field ' + key);
  }
});

test('budget: the canonical UTF-8 ceiling is 4096 for state and intent, ahead of the field rules', () => {
  const normal = stateOf();
  assert.ok(bytes(normal) < MAX_STATE_BYTES, 'L31: the ordinary state is under the ceiling: ' + bytes(normal));
  const overState = stateOf({ encounterId: 'x'.repeat(5000) });
  assert.ok(bytes(overState) > MAX_STATE_BYTES, 'the oversized state really is over: ' + bytes(overState));
  rejects(() => validateEncounterCombat(overState), 'LIMIT_EXCEEDED', 'L30: an over-budget state');
  rejects(() => applyEncounterCombatAction(overState, intentOf('attack')), 'LIMIT_EXCEEDED',
    'an over-budget state on the apply path');
  const overIntent = { encounterId: 'y'.repeat(5000), action: 'attack' };
  assert.ok(bytes(overIntent) > MAX_STATE_BYTES, 'the oversized intent really is over: ' + bytes(overIntent));
  rejects(() => applyEncounterCombatAction(stateOf(), overIntent), 'LIMIT_EXCEEDED',
    'L30: an over-budget intent');
  rejects(() => applyEncounterCombatAction(stateOf(), { encounterId: 'y'.repeat(5000), action: 'heal' }),
    'LIMIT_EXCEEDED', 'L30: the budget precedes the action rule');
  rejects(() => validateEncounterCombat({ ...overState, extra: 1 }), 'LIMIT_EXCEEDED',
    'L30: the budget precedes the field shape');
  rejects(() => applyEncounterCombatAction(stateOf(), { ...overIntent, damage: 1 }), 'LIMIT_EXCEEDED',
    'L30: the budget precedes the injected-field refusal');

  const shortId = stateOf({ encounterId: 'x'.repeat(65) });
  assert.ok(bytes(shortId) < MAX_STATE_BYTES, 'the 65-character id fits the budget: ' + bytes(shortId));
  rejects(() => validateEncounterCombat(shortId), 'INVALID_INPUT',
    'the same id is INVALID_INPUT once it fits the budget, so the budget really ran first');
  assert.equal(bytes(intentOf('attack')) < MAX_STATE_BYTES, true, 'a legal intent is under the ceiling');
});

test('version: a different string is UNSUPPORTED_VERSION, a missing or non-string one INVALID_INPUT', () => {
  rejects(() => validateEncounterCombat(stateOf({ version: 'encounter-combat-v2' })),
    'UNSUPPORTED_VERSION', 'L30: a foreign version string');
  rejects(() => validateEncounterCombat(stateOf({ version: 'encounter-combat-v1 ' })),
    'UNSUPPORTED_VERSION', 'a trailing space is a different string');
  rejects(() => validateEncounterCombat(stateOf({ version: '' })),
    'UNSUPPORTED_VERSION', 'L30: the empty string is a different string, so it is unsupported');
  rejects(() => applyEncounterCombatAction(stateOf({ version: 'encounter-combat-v2' }),
    intentOf('attack')), 'UNSUPPORTED_VERSION', 'the version gate also runs on the apply path');
  for (const bad of [null, 0, 1, true, false, {}, [], 42]) {
    rejects(() => validateEncounterCombat(stateOf({ version: bad })), 'INVALID_INPUT',
      'L30: version ' + String(bad));
  }
  const { version: _version, ...missing } = stateOf();
  rejects(() => validateEncounterCombat(missing), 'INVALID_INPUT', 'a missing version');
  assert.equal(validateEncounterCombat(stateOf({ version: VERSION })).version, VERSION,
    'the frozen string itself is accepted');
});

test('tampering: each altered field changes the canonical bytes and is refused', () => {
  const base = active1(1000);
  assert.equal(validateEncounterCombat(base), base, 'the untampered fixture is reachable');
  const TAMPER = [
    ['rounds back to 0', { rounds: 0 }],
    ['rounds past 2', { rounds: 3 }],
    ['one point of player health', { playerHealth: 921 }],
    ['a dead player still active', { playerHealth: 0 }],
    ['one point of wolf health', { wolfHealth: 149 }],
    ['a dead wolf without the flag', { wolfHealth: 0 }],
    ['one tick short', { elapsedTicks: 5 }],
    ['one tick long', { elapsedTicks: 7 }],
    ['closed without an outcome', { status: 'closed' }],
    ['a win while still active', { resolution: 'win' }],
    ['a loss while still active', { resolution: 'lose' }],
    ['a death flag over a live wolf', { wolfDied: true }],
  ];
  for (const [label, patch] of TAMPER) {
    const mutated = { ...base, ...patch };
    assert.notEqual(canonicalJson(mutated), canonicalJson(base),
      'the tampered fixture really differs: ' + label);
    rejects(() => validateEncounterCombat(mutated), 'INVALID_INPUT', label);
  }
  const foreignVersion = { ...base, version: 'encounter-combat-v2' };
  assert.notEqual(canonicalJson(foreignVersion), canonicalJson(base), 'the version tamper really differs');
  rejects(() => validateEncounterCombat(foreignVersion), 'UNSUPPORTED_VERSION', 'a tampered version');

  const UNREACHABLE = [
    ['active/round2', stateOf({ playerHealth: 920, wolfHealth: 0, rounds: 2,
      elapsedTicks: 2 * ATTACK_TICKS, wolfDied: true })],
    ['a win without a death', stateOf({ playerHealth: 920, wolfHealth: PLAYER_ATTACK, rounds: 2,
      elapsedTicks: 2 * ATTACK_TICKS, status: 'closed', resolution: 'win' })],
    ['a win at round1', stateOf({ playerHealth: 920, wolfHealth: 0, rounds: 1,
      elapsedTicks: ATTACK_TICKS, status: 'closed', resolution: 'win', wolfDied: true })],
    ['an active round1 holding a dead wolf', stateOf({ playerHealth: 920, wolfHealth: 0, rounds: 1,
      elapsedTicks: ATTACK_TICKS, wolfDied: true })],
    ['a loss at round0', stateOf({ playerHealth: 0, wolfHealth: WOLF_HEALTH, rounds: 0,
      elapsedTicks: 0, status: 'closed', resolution: 'lose' })],
    ['a loss with health left', stateOf({ playerHealth: 1, wolfHealth: PLAYER_ATTACK, rounds: 1,
      elapsedTicks: ATTACK_TICKS, status: 'closed', resolution: 'lose' })],
    ['a loss from a healthy start', stateOf({ initialPlayerHealth: 81, playerHealth: 0,
      wolfHealth: PLAYER_ATTACK, rounds: 1, elapsedTicks: ATTACK_TICKS, status: 'closed',
      resolution: 'lose' })],
    ['a flee at round2', fledState(1000, 2)],
    ['a cancel at round2', cancelledState(1000, 2)],
    ['a flee at round1 from 80', fledState(80, 1)],
    ['a cancel at round1 from 80', cancelledState(80, 1)],
    ['a flee with no ticks', stateOf({ elapsedTicks: 0, status: 'closed', resolution: 'flee' })],
    ['a cancel that cost ticks', stateOf({ elapsedTicks: ATTACK_TICKS, status: 'closed',
      resolution: 'cancel' })],
    ['an open encounter with a decided outcome', stateOf({ resolution: 'win' })],
    ['a closed encounter with no outcome', stateOf({ status: 'closed' })],
    ['a death flag on an open encounter', stateOf({ wolfDied: true })],
    ['an unknown status', stateOf({ status: 'open' })],
    ['an unknown resolution', stateOf({ status: 'closed', resolution: 'victory' })],
    ['an unknown rounds value', stateOf({ rounds: -1 })],
    ['a health of 0 at creation', stateOf({ initialPlayerHealth: 0, playerHealth: 0 })],
    ['a health of 1001 at creation', stateOf({ initialPlayerHealth: 1001, playerHealth: 1001 })],
  ];
  for (const [label, fixture] of UNREACHABLE) {
    rejects(() => validateEncounterCombat(fixture), 'INVALID_INPUT', 'L22-27: ' + label);
  }
});

test('determinism: a revived state continues identically and equal inputs give equal candidates', () => {
  const opened = createEncounterCombat(ID, 1000);
  const revived = JSON.parse(JSON.stringify(opened));
  assert.deepEqual(revived, opened, 'a JSON round trip preserves the state');
  assert.equal(validateEncounterCombat(revived), revived, 'the revived state is valid data');
  assert.deepEqual(applyEncounterCombatAction(revived, intentOf('attack')),
    applyEncounterCombatAction(opened, intentOf('attack')), 'the revived candidate matches in memory');
  const inMemory = drive(1000, ['attack', 'attack']);
  // L30/L31: a mid-fight revive, not just the opening round. The first blow in memory yields a real
  // round-1 active state; that state is serialised, revived, fully validated, then finished with a
  // second blow, and the resulting candidate must equal the uninterrupted two-blow run.
  const fromRoundTrip = (() => {
    const first = applyEncounterCombatAction(createEncounterCombat(ID, 1000), intentOf('attack'));
    assert.equal(first.state.rounds, 1, 'the first blow is a real round-1 state');
    assert.equal(first.state.status, 'active', 'the fight is still open after one blow');
    const revived = JSON.parse(JSON.stringify(first.state));
    assert.deepEqual(revived, first.state, 'a JSON round trip preserves the mid-fight state');
    assert.equal(validateEncounterCombat(revived), revived, 'the revived mid-fight state is valid data');
    assert.equal(revived.rounds, 1, 'the revived state is still at round 1');
    assert.equal(revived.playerHealth, 920, 'the revived player kept the counter wound');
    assert.equal(revived.wolfHealth, 150, 'the revived wolf kept its wound');
    return applyEncounterCombatAction(revived, intentOf('attack'));
  })();
  assert.deepEqual(fromRoundTrip, inMemory, 'a round-1 revive finishes identically to an uninterrupted fight');
  assert.equal(fromRoundTrip.state.resolution, 'win');
  assert.equal(fromRoundTrip.state.elapsedTicks, 2 * ATTACK_TICKS);

  const a = applyEncounterCombatAction(opened, intentOf('attack'));
  const b = applyEncounterCombatAction(opened, intentOf('attack'));
  assert.deepEqual(a, b, 'L39: the same input recomputes the same candidate');
  assert.notEqual(a.state, b.state, 'but each call hands back its own copy');
  assert.equal(opened.rounds, 0, 'L39: recomputation is not a second application');
  assert.equal(opened.playerHealth, 1000, 'the source state is still unopened');
  assert.equal(applyEncounterCombatAction(opened, intentOf('cancel')).state.elapsedTicks,
    CANCEL_TICKS, 'cancel costs nothing from the opening state');
});

test('purity: inputs are never written and every returned value is a detached copy', () => {
  const state = deepFreeze(stateOf());
  const intent = deepFreeze(intentOf('attack'));
  const before = canonicalJson(state);
  const out = applyEncounterCombatAction(state, intent);
  assert.equal(canonicalJson(state), before, 'L28: the frozen input is byte-identical after a success');
  assert.notEqual(out.state, state, 'the returned state is a detached copy');
  assert.equal(out.result, null, 'the opening attack leaves the fight open');
  assert.equal(out.state.playerHealth, 1000 - WOLF_COUNTER);

  const wounded = deepFreeze(active1(1000));
  const woundedBefore = canonicalJson(wounded);
  const escaped = applyEncounterCombatAction(wounded, intentOf('flee'));
  assert.notEqual(escaped.state, wounded, 'the closed state is a detached copy');
  assert.notEqual(escaped.result, null, 'a closed outcome carries a result');
  assert.notEqual(escaped.result, escaped.state, 'the result is not the state object');
  escaped.state.playerHealth = 999;
  escaped.result.playerHealth = 999;
  escaped.result.resolution = 'win';
  assert.equal(wounded.playerHealth, 1000 - WOLF_COUNTER,
    'mutating the returned copies changes nothing in the input');
  assert.equal(wounded.resolution, null);
  assert.equal(canonicalJson(wounded), woundedBefore, 'the input is byte-identical after a success');
  const escapedAgain = applyEncounterCombatAction(wounded, intentOf('flee'));
  assert.equal(escapedAgain.state.playerHealth, 1000 - WOLF_COUNTER, 'the input is still pristine');
  assert.notEqual(escapedAgain.state, escaped.state, 'separate calls never share the state');
  assert.notEqual(escapedAgain.result, escaped.result, 'separate calls never share the result');

  const active = stateOf();
  const activeBefore = canonicalJson(active);
  rejects(() => applyEncounterCombatAction(active, intentOf('attack', OTHER_ID)),
    'ENCOUNTER_ID_MISMATCH');
  rejects(() => applyEncounterCombatAction(active, intentOf('heal')), 'INVALID_INPUT');
  rejects(() => applyEncounterCombatAction(active, intentOf('attack', 'e'.repeat(65))), 'INVALID_INPUT');
  assert.equal(canonicalJson(active), activeBefore, 'L36: a refused call wrote nothing');
  assert.equal(validateEncounterCombat(active), active, 'L28: validate still hands back the input');
});

test('real read-only consumer: the tick-12 forest session supplies encounter-1 and health 1000', () => {
  const travelled = executePlayerIntent(createPlayerPlayVillage(42).bundle,
    { commandId: 'go-forest', type: 'PlayerTravel', payload: { destination: 'forest' } }).bundle;
  assert.equal(travelled.snapshot.tick, 12, 'the real travel really completes at tick 12');
  assert.equal(travelled.snapshot.world.actorModel.actors[3].location, 'forest');
  const bundleBefore = canonicalJson(travelled);

  const session = createEncounterSession(travelled, playerPlaySystems());
  const receipt = session.submit({ commandId: 'begin-1', expectedEncounterRevision: 0,
    type: 'EncounterBegin', payload: {} });
  assert.equal(receipt.status, 'succeeded', 'the real Begin really succeeds');
  assert.equal(receipt.encounterId, ID, 'the session chose encounter-1');
  const snapshot = session.getSnapshot();
  const sourceTick = snapshot.sourceTick;
  assert.equal(sourceTick, 12, 'sourceTick is the creation tick');
  const health = snapshot.frame.world.actorModel.actors[3].health;
  assert.equal(health, 1000, 'the real player carries 1000 health');

  const opened = createEncounterCombat(receipt.encounterId, health);
  assert.deepEqual(opened, { version: VERSION, encounterId: ID, initialPlayerHealth: 1000,
    playerHealth: 1000, wolfHealth: WOLF_HEALTH, rounds: 0, elapsedTicks: 0, status: 'active',
    resolution: null, wolfDied: false }, 'the trusted adapter value opens the kernel unchanged');
  const first = applyEncounterCombatAction(opened, intentOf('attack'));
  assert.equal(first.state.playerHealth, 1000 - WOLF_COUNTER);
  const second = applyEncounterCombatAction(first.state, intentOf('attack'));
  assert.equal(second.state.playerHealth, 1000 - WOLF_COUNTER);
  assert.equal(second.state.wolfHealth, 0);
  assert.equal(second.state.rounds, 2);
  assert.equal(second.state.elapsedTicks, 12, 'the local candidate spends 12 ticks');
  assert.equal(second.state.resolution, 'win');

  const after = session.getSnapshot();
  assert.equal(after.sourceTick, sourceTick, 'the session sourceTick never moved');
  assert.equal(after.sourceTick, 12);
  assert.equal(after.sourceRevision, 12, 'the session sourceRevision never moved');
  assert.equal(after.encounterRevision, 1, 'only the one Begin advanced the session');
  assert.equal(session.getJournal().length, 1, 'the kernel wrote no session command');
  assert.equal(canonicalJson(travelled), bundleBefore, 'the source bundle is byte-identical');
  assert.deepEqual(Object.keys(after.frame.reservation.encounter).sort(),
    ['encounterId', 'resolution', 'status'], 'the reservation slot is still the D3-1 three-field record');
  assert.equal(after.frame.reservation.encounter.status, 'active',
    'the local win is NOT written back to the session');
  assert.equal(after.frame.reservation.encounter.resolution, null,
    'the session still sees an undecided encounter');
  assert.equal(Object.hasOwn(after.frame, 'wolfHealth'), false,
    'no combat field leaks into the session frame');
  assert.equal(Object.hasOwn(after.frame.world.actorModel.actors[3], 'wolfHealth'), false,
    'no combat field leaks into the world actor');
});

test('D3-1 ledger consumption: wolfDied decides died versus released, and only once', () => {
  const winResult = drive(1000, ['attack', 'attack']).result;
  const loseResult = drive(80, ['attack']).result;
  const fleeResult = drive(1000, ['flee']).result;
  const cancelResult = drive(1000, ['cancel']).result;
  assert.equal(winResult.resolution, 'win');
  assert.equal(winResult.wolfDied, true);
  assert.equal(loseResult.resolution, 'lose');
  assert.equal(loseResult.wolfDied, false);
  assert.equal(fleeResult.resolution, 'flee');
  assert.equal(fleeResult.wolfDied, false);
  assert.equal(cancelResult.resolution, 'cancel');
  assert.equal(cancelResult.wolfDied, false);

  const trio = (ledger) => [ledger.available, ledger.reserved, ledger.battleDeaths];
  const hold = () => reserveEncounter(createEncounterReservation(14), ID);
  assert.deepEqual(trio(hold()), [13, 1, 0], 'the D3-1 fixture really holds one wolf out of 14');

  const died = closeEncounterReservation(hold(), ID, winResult.wolfDied ? 'died' : 'released');
  assert.deepEqual(trio(died), [13, 0, 1], 'a death is deducted exactly once');
  assert.deepEqual(died.encounter, { encounterId: ID, status: 'closed', resolution: 'died' });
  const diedAgain = closeEncounterReservation(died, ID, 'died');
  assert.deepEqual(trio(diedAgain), [13, 0, 1], 'a repeated close transfers nothing');
  assert.deepEqual(diedAgain, died);
  assert.notEqual(diedAgain, died, 'the repeated close is still a detached copy');
  assert.equal(died.initialPopulation, 14, 'the initial pool is history');

  for (const result of [loseResult, fleeResult, cancelResult]) {
    const released = closeEncounterReservation(hold(), ID, result.wolfDied ? 'died' : 'released');
    assert.deepEqual(trio(released), [14, 0, 0], result.resolution + ' returns the wolf to the pool');
    assert.deepEqual(released.encounter, { encounterId: ID, status: 'closed', resolution: 'released' });
    const releasedAgain = closeEncounterReservation(released, ID, 'released');
    assert.deepEqual(trio(releasedAgain), [14, 0, 0], 'a repeated release transfers nothing');
    assert.deepEqual(releasedAgain, released);
  }
  assert.deepEqual(Object.keys(died).sort(),
    ['available', 'battleDeaths', 'encounter', 'initialPopulation', 'reserved', 'version'],
    'the ledger keeps its own six fields: no removed/predation/hunted account is invented');
  assert.equal(died.battleDeaths, 1, 'battleDeaths stays inside the D3-1 0/1 rule');
});

test('post-commit fault: no injection point exists, so the closest observable guarantee is asserted', () => {
  // The synchronous pure module exposes exactly the four frozen exports above; there is no seam to
  // install a post-commit failure on without adding a production test backdoor, so NO such fault is
  // injected here. The closest observable guarantee is asserted instead: a refused apply leaves the
  // caller state byte-identical, and a successful one publishes a fully consistent candidate.
  const state = deepFreeze(stateOf());
  const before = canonicalJson(state);
  rejects(() => applyEncounterCombatAction(state, intentOf('attack', OTHER_ID)),
    'ENCOUNTER_ID_MISMATCH');
  rejects(() => applyEncounterCombatAction(state, intentOf('attack', 'e'.repeat(65))), 'INVALID_INPUT');
  assert.equal(canonicalJson(state), before, 'no partial update survives a refusal');
  assert.equal(state.rounds, 0, 'the caller state was never advanced');
  assert.equal(Object.keys(mod).length, 4, 'still no extra export to hook a fault onto');
});
