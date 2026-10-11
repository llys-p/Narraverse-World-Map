// D3-1 encounter reservation kernel tests (contract d3-reservation-kernel-v1).
// Every expected number here is hand-computed from the frozen taskbook - one wolf is held back
// from the available pool, a survivor is returned, a death is deducted exactly once - and nothing
// is read back from the module under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { ENCOUNTER_RESERVATION_VERSION, MAX_ENCOUNTER_POPULATION, createEncounterReservation,
  validateEncounterReservation, reserveEncounter, closeEncounterReservation } from '../../runtime/core/encounter-reservation.mjs';

const ID = 'wolf-encounter-1';
const OTHER_ID = 'wolf-encounter-2';
const LONG_ID = 'e'.repeat(64);
const TOO_LONG_ID = 'e'.repeat(65);

const stateOf = (over = {}) => ({ version: ENCOUNTER_RESERVATION_VERSION, initialPopulation: 3, available: 3,
  reserved: 0, battleDeaths: 0, encounter: null, ...over });
const encounterOf = (over = {}) => ({ encounterId: ID, status: 'active', resolution: null, ...over });
// available = initialPopulation - 1, reserved = 1, battleDeaths = 0 for an open reservation.
const activeOf = (population = 3, over = {}, encounterOver = {}) => stateOf({ initialPopulation: population,
  available: population - 1, reserved: 1, ...over, encounter: encounterOf(encounterOver) });
// The three running counters: [available, reserved, battleDeaths].
const trio = (state) => [state.available, state.reserved, state.battleDeaths];
const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};
const snapshot = (value) => canonicalJson(value);
const rejects = (run, code, why) => assert.throws(run, { code }, why);
// The contract pins a data-boundary rejection for a foreign version string, not the code name.
const rejectsVersion = (run, why) => assert.throws(run,
  (error) => error?.code === 'INVALID_INPUT' || error?.code === 'UNSUPPORTED_VERSION', why);

test('constants: the frozen kernel version and the population ceiling', () => {
  assert.equal(ENCOUNTER_RESERVATION_VERSION, 'encounter-reservation-v1');
  assert.equal(MAX_ENCOUNTER_POPULATION, 100000);
});

test('create: 0, 1, 3 and the 100000 ceiling build the complete empty ledger', () => {
  for (const population of [0, 1, 3, MAX_ENCOUNTER_POPULATION]) {
    const state = createEncounterReservation(population);
    assert.deepEqual(state, { version: ENCOUNTER_RESERVATION_VERSION, initialPopulation: population,
      available: population, reserved: 0, battleDeaths: 0, encounter: null });
    assert.deepEqual(Object.keys(state).sort(),
      ['available', 'battleDeaths', 'encounter', 'initialPopulation', 'reserved', 'version'],
      'the ledger carries exactly six fields');
    assert.deepEqual(trio(state), [population, 0, 0]);
    assert.equal(validateEncounterReservation(state), state, 'a freshly created ledger validates');
  }
});

test('create: out-of-range populations fail with the frozen codes', () => {
  for (const bad of [-1, -100000, 1.5, 0.5, NaN, Infinity, -Infinity, '3', 3n, null, undefined, true, {}, [], 2 ** 53]) {
    rejects(() => createEncounterReservation(bad), 'INVALID_INPUT', 'population ' + String(bad));
  }
  for (const over of [100001, MAX_ENCOUNTER_POPULATION + 1, 1000000]) {
    rejects(() => createEncounterReservation(over), 'LIMIT_EXCEEDED', 'population ' + over);
  }
});

test('validate: conservation and the null-state counter rules', () => {
  const plain = stateOf();
  assert.equal(validateEncounterReservation(plain), plain, 'the validator hands back the input itself');
  // available + reserved + battleDeaths must equal initialPopulation.
  rejects(() => validateEncounterReservation(stateOf({ available: 2 })), 'INVALID_INPUT', 'a lost wolf');
  rejects(() => validateEncounterReservation(stateOf({ available: 4 })), 'INVALID_INPUT', 'an invented wolf');
  rejects(() => validateEncounterReservation(stateOf({ reserved: 1 })), 'INVALID_INPUT',
    'the null state holds nothing');
  rejects(() => validateEncounterReservation(stateOf({ battleDeaths: 1 })), 'INVALID_INPUT',
    'nothing has died in the null state');
  rejects(() => validateEncounterReservation(stateOf({ available: 2, battleDeaths: 1 })), 'INVALID_INPUT',
    'an unbalanced death');
  rejects(() => validateEncounterReservation(stateOf({ initialPopulation: 2, available: 3 })), 'INVALID_INPUT',
    'more available than the initial population');
  rejects(() => validateEncounterReservation(stateOf({ reserved: 2, available: 1 })), 'INVALID_INPUT',
    'reserved is only ever 0 or 1');
  for (const bad of [1.5, NaN, Infinity, -1, '0', null, undefined, 2 ** 53]) {
    rejects(() => validateEncounterReservation(stateOf({ available: bad })), 'INVALID_INPUT',
      'available ' + String(bad));
  }
});

test('validate: the active ledger pins the counters and a null outcome', () => {
  const active = activeOf();
  assert.equal(validateEncounterReservation(active), active, 'the hand-built active ledger validates as itself');
  assert.deepEqual(trio(active), [2, 1, 0]);
  rejects(() => validateEncounterReservation(activeOf(0)), 'INVALID_INPUT', 'no wolf to reserve');
  rejects(() => validateEncounterReservation(activeOf(3, { reserved: 0, available: 3 })), 'INVALID_INPUT',
    'active without a held wolf');
  rejects(() => validateEncounterReservation(activeOf(3, { reserved: 2, available: 1 })), 'INVALID_INPUT',
    'reserved is only ever 0 or 1');
  rejects(() => validateEncounterReservation(activeOf(3, { battleDeaths: 1, available: 1 })), 'INVALID_INPUT',
    'an open reservation has not died yet');
  rejects(() => validateEncounterReservation(activeOf(3, { available: 1 })), 'INVALID_INPUT',
    'active available must be the population minus one');
  rejects(() => validateEncounterReservation(activeOf(3, {}, { resolution: 'released' })), 'INVALID_INPUT',
    'an open encounter carries no outcome');
  rejects(() => validateEncounterReservation(activeOf(3, {}, { resolution: 'died' })), 'INVALID_INPUT');
});

test('validate: the two closed shapes, each closed exactly once', () => {
  const released = stateOf({ encounter: encounterOf({ status: 'closed', resolution: 'released' }) });
  assert.deepEqual(trio(released), [3, 0, 0], 'a survivor returns the held wolf');
  assert.equal(validateEncounterReservation(released), released);
  const died = stateOf({ available: 2, battleDeaths: 1,
    encounter: encounterOf({ status: 'closed', resolution: 'died' }) });
  assert.deepEqual(trio(died), [2, 0, 1], 'a death is deducted exactly once');
  assert.equal(validateEncounterReservation(died), died);
  rejects(() => validateEncounterReservation(stateOf({ available: 3,
    encounter: encounterOf({ status: 'closed', resolution: 'died' }) })), 'INVALID_INPUT',
  'a death that cost nothing');
  rejects(() => validateEncounterReservation(stateOf({ available: 2, battleDeaths: 1,
    encounter: encounterOf({ status: 'closed', resolution: 'released' }) })), 'INVALID_INPUT', 'released yet dead');
  rejects(() => validateEncounterReservation(stateOf({ initialPopulation: 0, available: 0,
    encounter: encounterOf({ status: 'closed', resolution: 'died' }) })), 'INVALID_INPUT',
  'a death needs at least one initial wolf');
  rejects(() => validateEncounterReservation(stateOf({ available: 2, battleDeaths: 1, reserved: 1,
    encounter: encounterOf({ status: 'closed', resolution: 'died' }) })), 'INVALID_INPUT',
  'a closed slot keeps nothing reserved');
  rejects(() => validateEncounterReservation(stateOf({
    encounter: encounterOf({ status: 'closed', resolution: null }) })), 'INVALID_INPUT', 'closed without an outcome');
});

test('validate: bad version, status, resolution and encounter record shape', () => {
  rejectsVersion(() => validateEncounterReservation(stateOf({ version: 'encounter-reservation-v2' })),
    'a foreign version string');
  rejectsVersion(() => validateEncounterReservation(stateOf({ version: 'encounter-reservation-v1 ' })));
  for (const bad of [null, undefined, 'ACTIVE', 'open', 1, {}]) {
    rejects(() => validateEncounterReservation(stateOf({ encounter: encounterOf({ status: bad }) })), 'INVALID_INPUT',
      'status ' + String(bad));
  }
  for (const bad of ['survived', 'dead', 'released ', 'DIED', 0, false]) {
    rejects(() => validateEncounterReservation(stateOf({ available: 2, battleDeaths: 1,
      encounter: encounterOf({ status: 'closed', resolution: bad }) })), 'INVALID_INPUT', 'resolution ' + String(bad));
  }
  // The encounter slot is null or exactly three fields.
  rejects(() => validateEncounterReservation(stateOf({ encounter: { encounterId: ID, status: 'active' } })),
    'INVALID_INPUT', 'a two-field encounter');
  rejects(() => validateEncounterReservation(stateOf({ encounter: encounterOf({ extra: 1 }) })), 'INVALID_INPUT',
    'an unknown encounter field');
  rejects(() => validateEncounterReservation(stateOf({ encounter: undefined })), 'INVALID_INPUT',
    'the empty slot is null, never undefined');
  rejects(() => validateEncounterReservation(stateOf({ encounter: [ID, 'active', null] })), 'INVALID_INPUT',
    'an array is not an encounter record');
  const emptyId = activeOf(3, {}, { encounterId: '' });
  assert.equal(emptyId.encounter.encounterId, '', 'the fixture really carries the empty id');
  rejects(() => validateEncounterReservation(emptyId), 'INVALID_INPUT', 'an empty encounter id');
  const tooLongId = activeOf(3, {}, { encounterId: TOO_LONG_ID });
  assert.equal(tooLongId.encounter.encounterId, TOO_LONG_ID, 'the fixture really carries the over-long id');
  assert.equal(tooLongId.encounter.encounterId.length, 65);
  rejects(() => validateEncounterReservation(tooLongId), 'INVALID_INPUT', 'an encounter id past 64 characters');
  for (const bad of [1, 3n, null, undefined, true, {}, [ID]]) {
    const fixture = activeOf(3, {}, { encounterId: bad });
    assert.equal(fixture.encounter.encounterId, bad, 'the fixture really carries encounterId ' + String(bad));
    rejects(() => validateEncounterReservation(fixture), 'INVALID_INPUT', 'encounterId ' + String(bad));
  }
  const widest = activeOf(3, {}, { encounterId: LONG_ID });
  assert.equal(widest.encounter.encounterId, LONG_ID, 'the fixture really carries the 64-character id');
  assert.equal(widest.encounter.encounterId.length, 64);
  assert.equal(validateEncounterReservation(widest), widest, '64 characters is the widest legal id');
});

test('validate: exotic records, extra fields, symbols and inert getters', () => {
  let getterCalls = 0;
  const attempt = (run) => {
    try { run(); return 'accepted'; } catch (error) { return error?.code ?? 'no-code'; }
  };
  rejects(() => validateEncounterReservation({ ...stateOf(), extra: 1 }), 'INVALID_INPUT', 'an unknown ledger field');
  rejects(() => validateEncounterReservation(Object.assign(function tag() {}, stateOf())), 'INVALID_INPUT',
    'a function is not a data record');
  rejects(() => validateEncounterReservation([ENCOUNTER_RESERVATION_VERSION, 3, 3, 0, 0, null]), 'INVALID_INPUT',
    'an array is not a ledger');
  rejects(() => validateEncounterReservation(Object.assign(Object.create({ inherited: 1 }), stateOf())),
    'INVALID_INPUT', 'a foreign prototype is not plain data');
  const withSymbol = { ...stateOf() };
  withSymbol[Symbol('hidden')] = 1;
  rejects(() => validateEncounterReservation(withSymbol), 'INVALID_INPUT', 'a symbol key');
  const topGetter = { ...stateOf() };
  Object.defineProperty(topGetter, 'peek', { enumerable: true, get() { getterCalls += 1; return 1; } });
  const nestedGetter = stateOf({ encounter: encounterOf() });
  Object.defineProperty(nestedGetter.encounter, 'resolution', { enumerable: true, get() { getterCalls += 1; return null; } });
  const accessorState = stateOf();
  Object.defineProperty(accessorState, 'available', { enumerable: true, get() { getterCalls += 1; return 3; } });
  const codes = [attempt(() => validateEncounterReservation(topGetter)),
    attempt(() => validateEncounterReservation(nestedGetter)),
    attempt(() => validateEncounterReservation(accessorState)),
    attempt(() => reserveEncounter(topGetter, ID)),
    attempt(() => closeEncounterReservation(nestedGetter, ID, 'released'))];
  assert.deepEqual(codes, ['INVALID_INPUT', 'INVALID_INPUT', 'INVALID_INPUT', 'INVALID_INPUT', 'INVALID_INPUT'],
    'every public entry point rejects before an accessor executes');
  assert.equal(getterCalls, 0, 'no getter was ever called');
  // A null-prototype record is ordinary data and stays valid.
  const bare = Object.assign(Object.create(null), stateOf());
  assert.equal(validateEncounterReservation(bare), bare);
  const bareActive = Object.assign(Object.create(null), activeOf(),
    { encounter: Object.assign(Object.create(null), encounterOf()) });
  assert.equal(validateEncounterReservation(bareActive), bareActive);
});

test('reserve: three wolves hold one back, then release or lose it exactly once', () => {
  const start = createEncounterReservation(3);
  const held = reserveEncounter(start, ID);
  assert.deepEqual(trio(held), [2, 1, 0], '3 available -> 2 available, 1 reserved, 0 dead');
  assert.deepEqual(held.encounter, { encounterId: ID, status: 'active', resolution: null });
  assert.equal(held.initialPopulation, 3, 'the initial population is history and never moves');
  assert.notEqual(held, start, 'a successful transition returns a detached copy');
  assert.deepEqual(trio(start), [3, 0, 0], 'the caller ledger is untouched');
  const released = closeEncounterReservation(held, ID, 'released');
  assert.deepEqual(trio(released), [3, 0, 0], 'a survivor returns to the pool');
  assert.deepEqual(released.encounter, { encounterId: ID, status: 'closed', resolution: 'released' });
  const died = closeEncounterReservation(held, ID, 'died');
  assert.deepEqual(trio(died), [2, 0, 1], 'a death is one deduction, never two');
  assert.deepEqual(died.encounter, { encounterId: ID, status: 'closed', resolution: 'died' });
  assert.equal(died.initialPopulation, 3);
  // The single-wolf ledger can only end as 0/0/1.
  const lone = reserveEncounter(createEncounterReservation(1), ID);
  assert.deepEqual(trio(lone), [0, 1, 0]);
  assert.deepEqual(trio(closeEncounterReservation(lone, ID, 'died')), [0, 0, 1]);
  assert.deepEqual(trio(closeEncounterReservation(lone, ID, 'released')), [1, 0, 0]);
});

test('reserve: an empty pool is refused without touching the input', () => {
  const empty = createEncounterReservation(0);
  const frozen = deepFreeze(stateOf({ initialPopulation: 0, available: 0 }));
  const before = snapshot(frozen);
  rejects(() => reserveEncounter(empty, ID), 'RULE_REJECTED', 'no wolf left to reserve');
  rejects(() => reserveEncounter(frozen, ID), 'RULE_REJECTED');
  rejects(() => reserveEncounter(frozen, LONG_ID), 'RULE_REJECTED', 'the pool check follows id validation');
  assert.equal(snapshot(frozen), before, 'a refused reservation left the ledger byte-identical');
  assert.equal(frozen.encounter, null);
  assert.deepEqual(trio(frozen), [0, 0, 0]);
});

test('reserve: identifiers are validated first and every slot is single-use', () => {
  const start = createEncounterReservation(3);
  for (const bad of ['', TOO_LONG_ID, 1, 3n, null, undefined, true, {}, [ID]]) {
    rejects(() => reserveEncounter(start, bad), 'INVALID_INPUT', 'encounterId ' + String(bad));
  }
  rejects(() => reserveEncounter({ ...stateOf(), extra: 1 }, ID), 'INVALID_INPUT',
    'a malformed ledger is refused first');
  const held = reserveEncounter(start, ID);
  const again = reserveEncounter(held, ID);
  assert.deepEqual(again, held, 'a repeated reservation is value-equal');
  assert.notEqual(again, held, 'but still a detached copy');
  assert.deepEqual(trio(again), [2, 1, 0], 'the second call must not deduct a second wolf');
  assert.notEqual(again.encounter, held.encounter);
  rejects(() => reserveEncounter(held, OTHER_ID), 'ENCOUNTER_BUSY', 'one slot holds one encounter');
  rejects(() => reserveEncounter(held, LONG_ID), 'ENCOUNTER_BUSY');
  for (const closed of [closeEncounterReservation(held, ID, 'released'), closeEncounterReservation(held, ID, 'died')]) {
    rejects(() => reserveEncounter(closed, ID), 'ENCOUNTER_CLOSED', 'a closed slot is never reused');
    rejects(() => reserveEncounter(closed, OTHER_ID), 'ENCOUNTER_CLOSED');
  }
});

test('close: the encounter must exist, match and carry a frozen outcome', () => {
  const held = reserveEncounter(createEncounterReservation(3), ID);
  rejects(() => closeEncounterReservation(held, OTHER_ID, 'released'), 'ENCOUNTER_ID_MISMATCH');
  rejects(() => closeEncounterReservation(held, '', 'released'), 'INVALID_INPUT',
    'a malformed id is refused before the mismatch rule');
  rejects(() => closeEncounterReservation(held, TOO_LONG_ID, 'died'), 'INVALID_INPUT');
  for (const bad of [null, undefined, 'survived', 'dead', 'RELEASED', 0, {}]) {
    rejects(() => closeEncounterReservation(held, ID, bad), 'INVALID_INPUT', 'resolution ' + String(bad));
  }
  rejects(() => closeEncounterReservation(createEncounterReservation(3), ID, 'released'), 'ENCOUNTER_UNAVAILABLE',
    'nothing is open to close');
  rejects(() => closeEncounterReservation(createEncounterReservation(0), ID, 'died'), 'ENCOUNTER_UNAVAILABLE');
  rejects(() => closeEncounterReservation({ ...held, extra: 1 }, ID, 'released'), 'INVALID_INPUT',
    'a malformed ledger is refused first');
  const closed = closeEncounterReservation(held, ID, 'released');
  const again = closeEncounterReservation(closed, ID, 'released');
  assert.deepEqual(again, closed, 'closing the same outcome twice is value-equal');
  assert.notEqual(again, closed);
  assert.deepEqual(trio(again), [3, 0, 0], 'a repeated close transfers nothing');
  rejects(() => closeEncounterReservation(closed, ID, 'died'), 'ENCOUNTER_RESULT_CONFLICT',
    'one encounter cannot both survive and die');
  const dead = closeEncounterReservation(held, ID, 'died');
  rejects(() => closeEncounterReservation(dead, ID, 'released'), 'ENCOUNTER_RESULT_CONFLICT');
  assert.deepEqual(trio(dead), [2, 0, 1], 'a refused conflict leaves the ledger alone');
});

test('purity: frozen inputs survive every success and failure, results stay detached', () => {
  const held = deepFreeze(activeOf());
  const before = snapshot(held);
  const released = closeEncounterReservation(held, ID, 'released');
  const died = closeEncounterReservation(held, ID, 'died');
  assert.equal(snapshot(held), before, 'successful closes rewrote the caller ledger');
  assert.deepEqual(trio(released), [3, 0, 0]);
  assert.deepEqual(trio(died), [2, 0, 1]);
  assert.notEqual(released, held);
  assert.notEqual(died, held);
  assert.notEqual(released.encounter, held.encounter);
  assert.notEqual(died.encounter, held.encounter);
  const frozenEmpty = deepFreeze(createEncounterReservation(2));
  const emptyBefore = snapshot(frozenEmpty);
  const fromFrozen = reserveEncounter(frozenEmpty, ID);
  assert.equal(snapshot(frozenEmpty), emptyBefore, 'a reservation never mutates a frozen input');
  assert.deepEqual(trio(fromFrozen), [1, 1, 0]);
  const frozenClosed = deepFreeze(closeEncounterReservation(activeOf(), ID, 'released'));
  const closedBefore = snapshot(frozenClosed);
  rejects(() => reserveEncounter(frozenClosed, ID), 'ENCOUNTER_CLOSED');
  rejects(() => closeEncounterReservation(frozenClosed, ID, 'died'), 'ENCOUNTER_RESULT_CONFLICT');
  assert.equal(snapshot(frozenClosed), closedBefore, 'a refused call left no partial update');
});

test('serialization and determinism: a revived active ledger closes identically', () => {
  const held = reserveEncounter(createEncounterReservation(3), ID);
  const revived = JSON.parse(JSON.stringify(held));
  assert.deepEqual(revived, held);
  assert.equal(validateEncounterReservation(revived), revived, 'a revived record is still valid data');
  assert.deepEqual(closeEncounterReservation(revived, ID, 'released'), closeEncounterReservation(held, ID, 'released'),
    'closing after a JSON round trip matches closing in memory');
  assert.deepEqual(closeEncounterReservation(revived, ID, 'died'), closeEncounterReservation(held, ID, 'died'));
  const second = reserveEncounter(createEncounterReservation(3), ID);
  assert.deepEqual(second, held, 'equal inputs give equal ledgers');
  assert.equal(canonicalJson(second), canonicalJson(held),
    'the same input always yields the same canonical bytes');
  assert.notEqual(second, held, 'but never the same object');
});
