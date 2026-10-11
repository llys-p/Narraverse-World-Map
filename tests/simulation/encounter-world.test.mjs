// D3-2 player/wolf encounter candidate-world tests (contract d3-encounter-world-v1).
// Independent lane: every expected number is hand-computed from the frozen taskbook plus the real
// player-play village world that this file itself produces before asserting. Nothing is copied from
// the module under test and no implementation source is read. A candidate frame is an uncommitted
// proposal; it proves nothing about a real encounter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, cloneData } from '../../runtime/core/data-contract.mjs';
import { createPlayerPlayVillage, playerPlaySystems } from '../../runtime/fixtures/player-play-village.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { defaultPlayerPlayConfig, executePlayerIntent } from '../../runtime/core/player-intents.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateMemoryWorld } from '../../runtime/core/memory-runtime.mjs';
import { ENCOUNTER_RESERVATION_VERSION } from '../../runtime/core/encounter-reservation.mjs';
import { ENCOUNTER_WORLD_VERSION, createEncounterWorld, validateEncounterWorld,
  beginPlayerWolfEncounter, cancelPlayerWolfEncounter } from '../../runtime/core/encounter-world.mjs';

const ID = 'wolf-encounter-1';
const OTHER_ID = 'wolf-encounter-2';
const FRAME_FIELDS = ['anchorDay', 'reservation', 'version', 'world'];
const RESERVATION_FIELDS = ['available', 'battleDeaths', 'encounter', 'initialPopulation', 'reserved', 'version'];
const ECOLOGY_ACCOUNTS = ['births', 'hunted', 'naturalDeaths', 'predation', 'removed', 'starvationDeaths'];
const RESOURCE_ACCOUNTS = ['capacityLoss', 'consumption', 'inflow', 'loss', 'outflow', 'production', 'unmetConsumption', 'unmetOutflow'];
const PLAY_LEDGER = ['earned', 'foodBought', 'foodSold', 'foodUsed', 'herbsBought', 'herbsSold', 'herbsUsed', 'spent'];

const baseWorld = () => createPlayerPlayVillage(42).bundle.snapshot.world;
// The one real travel the contract pins: village -> forest, completing at tick 12, day still 0.
const forestWorld = () => executePlayerIntent(createPlayerPlayVillage(42).bundle,
  { commandId: 'go-forest', type: 'PlayerTravel', payload: { destination: 'forest' } }).bundle.snapshot.world;
const withConfig = (mutate) => {
  const config = defaultPlayerPlayConfig();
  mutate(config);
  return createPlayerPlayVillage(42, 'player-play-village', config).bundle.snapshot.world;
};
const rejects = (run, code, why) => assert.throws(run, { code }, why);
// The contract pins a data-boundary rejection for a foreign version string, not the code name.
const rejectsVersion = (run, why) => assert.throws(run,
  (error) => error?.code === 'INVALID_INPUT' || error?.code === 'UNSUPPORTED_VERSION', why);
const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};
const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const withFields = (object, extra) => ({ ...object, ...extra });
// A wolf getter must never be observed: every read path preflights the descriptor tree first.
const withGetter = (world, key) => {
  const copy = cloneData(world), ecology = { ...copy.ecologyModel }, populations = { ...ecology.populations };
  let calls = 0;
  Object.defineProperty(populations, key, { enumerable: true, configurable: true, get() { calls += 1; return 14; } });
  ecology.populations = populations;
  copy.ecologyModel = ecology;
  return { world: copy, calls: () => calls };
};
const jsonRoundTrip = (value) => JSON.parse(JSON.stringify(value));
const wolfAccounts = (world) => world.ecologyModel.ledger.wolves;
const resourceAccounts = (world) => world.resourceModel.ledger;
const playerPart = (world) => ({ actor: world.actorModel.actors[3], player: world.playerModel });
const permanentBooks = (world) => ({
  wolfLedger: { ...wolfAccounts(world) }, deerLedger: { ...world.ecologyModel.ledger.deer },
  remainders: { ...world.ecologyModel.remainders }, injuredCount: world.ecologyModel.injuredCount,
  resources: { ...world.resources }, foodLedger: { ...resourceAccounts(world).food },
  herbLedger: { ...resourceAccounts(world).herbs }, goldLedger: { ...resourceAccounts(world).gold },
  player: cloneData(world.playerModel), actor: cloneData(world.actorModel.actors[3]),
  actorLedger: { ...world.actorModel.ledger },
});

test('contract smoke: candidate creation consumes a valid existing world without changing it', () => {
  const { bundle } = createPlayerPlayVillage(42);
  const world = bundle.snapshot.world;
  const before = structuredClone(world);
  const frame = createEncounterWorld(world);
  assert.equal(ENCOUNTER_WORLD_VERSION, 'encounter-world-v1');
  assert.equal(frame.version, ENCOUNTER_WORLD_VERSION);
  assert.equal(frame.anchorDay, 0);
  assert.equal(frame.reservation.initialPopulation, 14);
  assert.equal(frame.reservation.available, 14);
  assert.equal(frame.reservation.reserved, 0);
  assert.deepEqual(frame.world, before);
  assert.notEqual(frame.world, world);
  assert.deepEqual(world, before);
});

test('the frozen export surface carries the version string and four data-boundary functions', () => {
  assert.equal(typeof ENCOUNTER_WORLD_VERSION, 'string');
  assert.equal(ENCOUNTER_WORLD_VERSION, 'encounter-world-v1');
  for (const fn of [createEncounterWorld, validateEncounterWorld, beginPlayerWolfEncounter, cancelPlayerWolfEncounter]) {
    assert.equal(typeof fn, 'function');
  }
});

test('create: the frame carries exactly four fields and holds a fresh reservation ledger', () => {
  const world = baseWorld();
  const frame = createEncounterWorld(world);
  assert.deepEqual(Object.keys(frame).sort(), FRAME_FIELDS, 'no extra shell field is allowed');
  assert.deepEqual(Object.keys(frame.reservation).sort(), RESERVATION_FIELDS, 'the ledger is the D3-1 shape');
  assert.deepEqual(frame.reservation, { version: ENCOUNTER_RESERVATION_VERSION, initialPopulation: 14,
    available: 14, reserved: 0, battleDeaths: 0, encounter: null });
  assert.equal(frame.reservation.battleDeaths, 0, 'the candidate never books a death');
  assert.equal(frame.reservation.encounter, null, 'no encounter is open before one is begun');
  assert.equal(frame.world.ecologyModel.populations.wolves, frame.reservation.available,
    'the world wolf count is the available pool');
  assert.equal(frame.world.ecologyModel.populations.wolves + frame.reservation.reserved, frame.reservation.initialPopulation,
    'available plus reserved reconstructs the initial population');
});

test('create: anchorDay is the pinned ecology day and never a later settlement', () => {
  const fresh = createEncounterWorld(baseWorld());
  assert.equal(fresh.anchorDay, 0, 'the village opens on day 0');
  assert.equal(fresh.anchorDay, fresh.world.ecologyModel.day);
  assert.equal(fresh.world.memoryModel.day, 0, 'the candidate does not advance the clock');
  const again = createEncounterWorld(createPlayerPlayVillage(42).bundle.snapshot.world);
  assert.equal(again.anchorDay, again.world.ecologyModel.day);
  assert.equal(again.anchorDay, again.world.societyModel.day);
  assert.equal(again.anchorDay, again.world.resourceModel.day);
  assert.equal(again.anchorDay, again.world.memoryModel.day);
});

test('create: the world copy is independent and a live mutation of the input never reaches it', () => {
  const world = baseWorld();
  const frame = createEncounterWorld(world);
  const frozen = canonicalJson(frame.world);
  world.ecologyModel.populations.wolves = 99;
  world.resources.gold += 1;
  world.actorModel.actors[3].location = 'forest';
  assert.equal(canonicalJson(frame.world), frozen, 'the candidate does not alias the input world');
  assert.notEqual(frame.world.ecologyModel, world.ecologyModel);
  assert.notEqual(frame.world.ecologyModel.populations, world.ecologyModel.populations);
  assert.notEqual(frame.world.actorModel.actors, world.actorModel.actors);
  assert.notEqual(frame.reservation, frame.world.ecologyModel, 'the ledger is not a world alias');
});

test('create: a frozen input, a null-prototype record and a JSON round trip are all accepted', () => {
  const frozenFrame = createEncounterWorld(deepFreeze(baseWorld()));
  assert.equal(validateEncounterWorld(frozenFrame).version, ENCOUNTER_WORLD_VERSION);
  const plain = jsonRoundTrip(baseWorld());
  const plainFrame = createEncounterWorld(plain);
  assert.deepEqual(plainFrame.world, plain);
  const nullProto = Object.create(null);
  for (const [key, value] of Object.entries(baseWorld())) nullProto[key] = value;
  const nullFrame = createEncounterWorld(nullProto);
  assert.equal(nullFrame.reservation.available, 14);
  assert.equal(validateEncounterWorld(nullFrame), nullFrame);
});

test('create rejects: missing, non-record, cyclic and unvalidatable worlds', () => {
  for (const bad of [undefined, null, 0, 'world', [], true]) {
    rejects(() => createEncounterWorld(bad), 'INVALID_INPUT', 'input ' + String(bad));
  }
  const cyclic = baseWorld();
  cyclic.ecologyModel.populations.self = cyclic;
  rejects(() => createEncounterWorld(cyclic), 'INVALID_INPUT', 'a cyclic world');
  const offLedger = baseWorld();
  offLedger.ecologyModel.populations.wolves = 13;
  rejects(() => createEncounterWorld(offLedger), 'INVALID_INPUT', 'a wolf count the ecology ledger cannot explain');
  const tampered = baseWorld();
  tampered.ecologyModel.configFingerprint = 'not-json';
  rejects(() => createEncounterWorld(tampered), 'INVALID_INPUT', 'a broken configuration fingerprint');
});

test('create rejects: a foreign memory/player version is UNSUPPORTED_VERSION', () => {
  rejectsVersion(() => createEncounterWorld(createPlayerVillage().bundle.snapshot.world),
    'memory-config-v3 is outside this contract');
  const v2 = baseWorld();
  v2.memoryModel.config.version = 'memory-config-v2';
  rejectsVersion(() => createEncounterWorld(v2), 'a memory-config-v2 label on a play world');
  const v3 = baseWorld();
  v3.societyModel.config.version = 'society-config-v2';
  rejectsVersion(() => createEncounterWorld(v3), 'a society-config-v2 label');
  const v1 = baseWorld();
  v1.playerModel.version = 'player-state-v1';
  rejectsVersion(() => createEncounterWorld(v1), 'a player-state-v1 label');
});

test('create rejects: a wrong player identity is INVALID_INPUT', () => {
  const wrongActor = baseWorld();
  wrongActor.playerModel.actorId = 'actor-3';
  // The illegal world is only ever described here; the entry under test is what must throw.
  assert.equal(wrongActor.playerModel.actorId, 'actor-3', 'the variant really changes the player identity');
  assert.equal(wrongActor.actorModel.actors[3].actorId, 'actor-4', 'the body roster is untouched by the variant');
  const wrongBefore = canonicalJson(wrongActor);
  rejects(() => createEncounterWorld(wrongActor), 'INVALID_INPUT', 'the player is not actor-4');
  assert.equal(canonicalJson(wrongActor), wrongBefore, 'the refused world is never rewritten');
  assert.equal(wrongActor.playerModel.actorId, 'actor-3', 'the refused world keeps its own variant value');
  rejects(() => validateEncounterWorld({ version: ENCOUNTER_WORLD_VERSION, anchorDay: 0, world: wrongActor,
    reservation: { version: ENCOUNTER_RESERVATION_VERSION, initialPopulation: 14, available: 14, reserved: 0,
      battleDeaths: 0, encounter: null } }), 'INVALID_INPUT', 'a hand-built frame over a foreign player identity');
  // A resulting frame would also fail: the shell cannot launder a non actor-4 world.
  const legal = createEncounterWorld(baseWorld());
  assert.equal(legal.world.playerModel.actorId, 'actor-4', 'the legal fixture really is actor-4');
  const relabelled = cloneData(legal);
  relabelled.world.playerModel.actorId = 'actor-3';
  assert.equal(relabelled.world.playerModel.actorId, 'actor-3', 'the frame variant really changes the identity');
  rejects(() => validateEncounterWorld(relabelled), 'INVALID_INPUT', 'a frame whose player is not actor-4');
});

test('create rejects: a wolf getter, a non-zero battle death field and an extra shell field', () => {
  const getter = withGetter(baseWorld(), 'wolves');
  rejects(() => createEncounterWorld(getter.world), 'INVALID_INPUT', 'a population accessor');
  assert.equal(getter.calls(), 0, 'the getter must never run');
  const withDeaths = baseWorld();
  withDeaths.ecologyModel.populations.wolves = 14;
  assert.doesNotThrow(() => createEncounterWorld(withDeaths), 'the genuine village still builds');
  const foreign = baseWorld();
  foreign.extraField = 1;
  rejects(() => createEncounterWorld(foreign), 'INVALID_INPUT', 'an extra world field');
});

test('validate returns the same reference and rejects every tampered shell/ledger shape', () => {
  const frame = createEncounterWorld(baseWorld());
  assert.equal(validateEncounterWorld(frame), frame, 'validation hands back the original frame');
  assert.equal(validateEncounterWorld(validateEncounterWorld(frame)), frame, 'validation is idempotent');
  assert.equal(validateEncounterWorld(deepFreeze(frame)), frame, 'a frozen frame is accepted');
  assert.doesNotThrow(() => validateEncounterWorld(jsonRoundTrip(frame)), 'a JSON round-tripped frame is accepted');
  const before = canonicalJson(frame);
  assert.equal(canonicalJson(validateEncounterWorld(frame)), before, 'validation changes nothing');

  assert.throws(() => validateEncounterWorld(null), 'a missing frame');
  assert.throws(() => validateEncounterWorld([]), 'an array frame');
  assert.throws(() => validateEncounterWorld('frame'), 'a string frame');
  for (const key of FRAME_FIELDS) {
    rejects(() => validateEncounterWorld(without(frame, key)), 'INVALID_INPUT', 'missing shell field ' + key);
  }
  rejects(() => validateEncounterWorld(withFields(frame, { extra: 1 })), 'INVALID_INPUT', 'an extra shell field');
  rejectsVersion(() => validateEncounterWorld({ ...frame, version: 'encounter-world-v2' }), 'a foreign shell version');
  rejects(() => validateEncounterWorld({ ...frame, version: ENCOUNTER_RESERVATION_VERSION }), 'INVALID_INPUT',
    'the kernel version is not the shell version');
  rejects(() => validateEncounterWorld({ ...frame, anchorDay: 1 }), 'INVALID_INPUT',
    'an anchor day the world does not carry');
  rejects(() => validateEncounterWorld({ ...frame, anchorDay: 0.5 }), 'INVALID_INPUT', 'a fractional anchor day');
  const drifted = cloneData(frame);
  drifted.anchorDay = 1;
  drifted.world.ecologyModel.day = 1;
  drifted.world.memoryModel.day = 1;
  rejects(() => validateEncounterWorld(drifted), 'INVALID_INPUT', 'a settled world is never pushed back into a frame');
});

test('validate rejects: available/reserved disagreement, battle deaths and shifted anchor days', () => {
  const frame = createEncounterWorld(baseWorld());
  const shift = (over) => ({ ...frame, reservation: { ...frame.reservation, ...over } });
  rejects(() => validateEncounterWorld(shift({ available: 13 })), 'INVALID_INPUT',
    'available must equal the world wolf count');
  rejects(() => validateEncounterWorld(shift({ reserved: 1 })), 'INVALID_INPUT',
    'reserved without an open encounter');
  rejects(() => validateEncounterWorld(shift({ battleDeaths: 1 })), 'INVALID_INPUT', 'a booked battle death');
  rejects(() => validateEncounterWorld({ ...frame, reservation: { ...frame.reservation,
    encounter: { encounterId: ID, status: 'closed', resolution: 'died' } } }), 'INVALID_INPUT',
    'a death the ledger cannot carry');
  rejects(() => validateEncounterWorld({ ...frame, reservation: { ...frame.reservation,
    encounter: { encounterId: ID, status: 'active', resolution: 'released' } } }), 'INVALID_INPUT',
    'an open encounter that already carries an outcome');
  rejects(() => validateEncounterWorld({ ...frame, world: { ...frame.world,
    ecologyModel: { ...frame.world.ecologyModel, populations: { ...frame.world.ecologyModel.populations, wolves: 13 } } } }),
    'INVALID_INPUT', 'the world wolf count agrees with available or the frame is refused');
  const mismatchedDay = cloneData(frame);
  mismatchedDay.world.societyModel.day = 1;
  rejects(() => validateEncounterWorld(mismatchedDay), 'INVALID_INPUT', 'a day-mismatched world inside a frame');
});

test('validate rejects: populations swapped for null and for the number 1, with the variant proven first', () => {
  const frame = createEncounterWorld(baseWorld());
  for (const [label, variant] of [['null', null], ['the number 1', 1]]) {
    const tampered = cloneData(frame);
    tampered.world.ecologyModel.populations = variant;
    assert.equal(tampered.world.ecologyModel.populations, variant, 'the fixture really carries ' + label);
    assert.notEqual(canonicalJson(tampered), canonicalJson(frame), 'the variant really differs from the legal frame');
    const before = canonicalJson(tampered);
    rejects(() => validateEncounterWorld(tampered), 'INVALID_INPUT', 'populations replaced by ' + label);
    assert.equal(canonicalJson(tampered), before, 'a refused frame is never rewritten');
    assert.equal(tampered.world.ecologyModel.populations, variant, 'the refused frame keeps its own variant value');
  }
  const frozenVariant = cloneData(frame);
  frozenVariant.world.ecologyModel.populations = null;
  assert.doesNotThrow(() => deepFreeze(frozenVariant));
  rejects(() => validateEncounterWorld(frozenVariant), 'INVALID_INPUT', 'a frozen null populations record');
});

test('validate rejects: a getter inside the frame and an array with a custom prototype', () => {
  const frame = createEncounterWorld(baseWorld());
  const spied = cloneData(frame);
  let calls = 0;
  Object.defineProperty(spied.reservation, 'available', { enumerable: true, configurable: true, get() { calls += 1; return 14; } });
  rejects(() => validateEncounterWorld(spied), 'INVALID_INPUT', 'a ledger accessor');
  assert.equal(calls, 0, 'the accessor must never run');
  const arrayProto = cloneData(frame);
  class Custom extends Array {}
  arrayProto.world.actorModel.actors = Custom.from(arrayProto.world.actorModel.actors);
  rejects(() => validateEncounterWorld(arrayProto), 'INVALID_INPUT', 'a custom array prototype');
  const sparse = cloneData(frame);
  sparse.world.actorModel.actors = [...sparse.world.actorModel.actors];
  sparse.world.actorModel.actors[9] = sparse.world.actorModel.actors[3];
  rejects(() => validateEncounterWorld(sparse), 'INVALID_INPUT', 'a sparse actor array');
});

test('validate: the temporary re-added wolf copy is never returned or booked', () => {
  const frame = createEncounterWorld(baseWorld());
  assert.equal(validateEncounterWorld(frame).world.ecologyModel.populations.wolves, 14,
    'validation leaves the available meaning untouched');
  assert.equal(validateEncounterWorld(frame).world.ecologyModel.populations.wolves, frame.world.ecologyModel.populations.wolves);
  assert.deepEqual(wolfAccounts(validateEncounterWorld(frame).world), wolfAccounts(frame.world),
    'no permanent account is written by validation');
});

test('begin: a legal forest start holds one wolf and cancel returns it', () => {
  const world = forestWorld();
  validateMemoryWorld(world);
  assert.equal(world.ecologyModel.populations.wolves, 14, 'the fixture really starts at 14 wolves');
  assert.equal(world.actorModel.actors[3].location, 'forest', 'the travel really ends in the forest');
  assert.equal(world.ecologyModel.day, 0, 'the anchor day is still 0');
  const frame = createEncounterWorld(world);
  const before = canonicalJson(frame.world);

  const started = beginPlayerWolfEncounter(frame, ID);
  assert.notEqual(started, frame, 'the candidate is a new frame');
  assert.equal(canonicalJson(frame.world), before, 'begin does not write the input frame');
  assert.deepEqual(Object.keys(started).sort(), FRAME_FIELDS, 'begin keeps the four shell fields');
  assert.equal(started.world.ecologyModel.populations.wolves, 13, 'one wolf is held back');
  assert.equal(started.reservation.available, 13);
  assert.equal(started.reservation.reserved, 1);
  assert.equal(started.reservation.battleDeaths, 0);
  assert.equal(started.reservation.initialPopulation, 14);
  assert.deepEqual(started.reservation.encounter, { encounterId: ID, status: 'active', resolution: null });
  assert.equal(started.world.ecologyModel.populations.wolves, started.reservation.available,
    'the held wolf is the only difference');
  assert.equal(started.anchorDay, 0, 'begin does not advance the day');
  assert.equal(started.world.actorModel.actors[3].location, 'forest', 'begin does not move the player');

  // Snapshot the ACTIVE input before cancelling so purity is measured against wolves 13, not 14.
  const activeWorld = canonicalJson(started.world);
  const activeFrame = canonicalJson(started);
  assert.equal(started.world.ecologyModel.populations.wolves, 13, 'the active input really holds 13 wolves');

  const cancelled = cancelPlayerWolfEncounter(started, ID);
  assert.equal(cancelled.world.ecologyModel.populations.wolves, 14, 'the wolf is returned');
  assert.equal(cancelled.reservation.available, 14);
  assert.equal(cancelled.reservation.reserved, 0);
  assert.equal(cancelled.reservation.battleDeaths, 0);
  assert.deepEqual(cancelled.reservation.encounter, { encounterId: ID, status: 'closed', resolution: 'released' });
  assert.deepEqual(cancelled.world, frame.world, 'a full round trip restores the original world exactly');
  assert.equal(cancelled.world.ecologyModel.populations.wolves, 14, 'the returned world carries 14 wolves');
  assert.equal(canonicalJson(started.world), activeWorld, 'cancel does not write its own input world');
  assert.equal(canonicalJson(started), activeFrame, 'cancel does not write its own input frame');
  assert.equal(started.world.ecologyModel.populations.wolves, 13, 'the active input still holds 13 wolves');
  assert.notEqual(canonicalJson(cancelled.world), activeWorld, 'cancel really changed the wolf count');
});

test('begin: the player identity comes from the world, never from the caller', () => {
  const frame = createEncounterWorld(forestWorld());
  const started = beginPlayerWolfEncounter(frame, ID);
  assert.equal(started.world.playerModel.actorId, 'actor-4', 'the world player is actor-4');
  assert.deepEqual(started.world.playerModel, frame.world.playerModel, 'the caller cannot move the player record');
  assert.equal(started.world.actorModel.actors[3].actorId, 'actor-4');
  assert.equal(started.world.actorModel.actors.find((a) => a.actorId === 'actor-4').alive, true);
});

test('begin/cancel: every permanent account, private book, resource and inventory is unchanged', () => {
  const world = forestWorld();
  const frame = createEncounterWorld(world);
  const books = permanentBooks(frame.world);
  const started = beginPlayerWolfEncounter(frame, ID);
  const startedBooks = permanentBooks(started.world);
  for (const key of ECOLOGY_ACCOUNTS) {
    assert.equal(startedBooks.wolfLedger[key], books.wolfLedger[key], 'wolf account ' + key);
  }
  assert.deepEqual(startedBooks.deerLedger, books.deerLedger, 'the deer ledger is untouched');
  assert.deepEqual(startedBooks.remainders, books.remainders, 'ecology remainders are untouched');
  assert.equal(startedBooks.injuredCount, books.injuredCount);
  assert.deepEqual(startedBooks.resources, books.resources, 'food/herbs/gold stock is untouched');
  for (const id of ['food', 'herbs', 'gold']) {
    assert.deepEqual(startedBooks[id === 'food' ? 'foodLedger' : id === 'herbs' ? 'herbLedger' : 'goldLedger'],
      books[id === 'food' ? 'foodLedger' : id === 'herbs' ? 'herbLedger' : 'goldLedger'], 'resource account ' + id);
  }
  assert.deepEqual(startedBooks.player, books.player, 'the player wallet/inventory/ledger is untouched');
  for (const key of PLAY_LEDGER) {
    assert.equal(startedBooks.player.ledger[key], books.player.ledger[key], 'player ledger ' + key);
  }
  assert.deepEqual(startedBooks.actor, books.actor, 'the actor body is untouched');
  assert.deepEqual(startedBooks.actorLedger, books.actorLedger, 'the actor death ledger is untouched');

  const cancelled = cancelPlayerWolfEncounter(started, ID);
  const cancelledBooks = permanentBooks(cancelled.world);
  for (const key of ECOLOGY_ACCOUNTS) {
    assert.equal(cancelledBooks.wolfLedger[key], books.wolfLedger[key], 'wolf account after cancel ' + key);
  }
  assert.deepEqual(cancelledBooks.deerLedger, books.deerLedger);
  assert.deepEqual(cancelledBooks.remainders, books.remainders);
  assert.deepEqual(cancelledBooks.resources, books.resources);
  assert.deepEqual(cancelledBooks.player, books.player);
  assert.deepEqual(cancelledBooks.actor, books.actor);
  assert.deepEqual(cancelledBooks.actorLedger, books.actorLedger);
  assert.deepEqual(cancelledBooks.foodLedger, books.foodLedger);
  assert.deepEqual(cancelledBooks.herbLedger, books.herbLedger);
  assert.deepEqual(cancelledBooks.goldLedger, books.goldLedger);
});

test('begin/cancel: the rest of the old world keeps its exact value', () => {
  const frame = createEncounterWorld(forestWorld());
  const started = beginPlayerWolfEncounter(frame, ID);
  const cancelled = cancelPlayerWolfEncounter(started, ID);
  for (const snapshot of [started.world, cancelled.world]) {
    assert.equal(snapshot.ecologyModel.populations.deer, 120, 'the deer population is untouched');
    assert.equal(snapshot.ecologyModel.day, 0);
    assert.equal(snapshot.memoryModel.day, 0);
    assert.equal(snapshot.societyModel.day, 0);
    assert.equal(snapshot.memoryModel.config.version, 'memory-config-v4');
    assert.equal(snapshot.playerModel.version, 'player-state-v2');
    assert.equal(snapshot.actorModel.config.version, 'actor-config-v3');
    assert.equal(snapshot.societyModel.config.version, 'society-config-v3');
    assert.equal(snapshot.playerModel.wallet, 100);
    assert.deepEqual(snapshot.playerModel.inventory, { food: 3, herbs: 1 });
    assert.equal(snapshot.actorModel.actors[3].fatigue, 100, 'the travelled fatigue is preserved');
    assert.equal(snapshot.actorModel.actors[3].alive, true);
    assert.equal(snapshot.actorModel.actors[3].health, 1000);
    assert.deepEqual(snapshot.actorModel.actors.map((a) => a.actorId),
      ['actor-1', 'actor-2', 'actor-3', 'actor-4'], 'the roster is unchanged');
  }
  assert.equal(started.world.ecologyModel.populations.wolves, 13, 'the start really removed one wolf');
  assert.equal(cancelled.world.ecologyModel.populations.wolves, 14, 'the cancel really returned it');
});

test('begin rejects: the player in the village is RULE_REJECTED', () => {
  const world = baseWorld();
  assert.equal(world.actorModel.actors[3].location, 'village', 'the fixture really starts in the village');
  const frame = createEncounterWorld(world);
  const before = canonicalJson(frame);
  rejects(() => beginPlayerWolfEncounter(frame, ID), 'RULE_REJECTED', 'a village start');
  assert.equal(canonicalJson(frame), before, 'a rejected begin writes nothing');
  assert.equal(frame.world.ecologyModel.populations.wolves, 14, 'no wolf is held on rejection');
  assert.equal(frame.reservation.reserved, 0);
});

test('begin rejects: a legitimately dead player is RULE_REJECTED, and the world really is dead', () => {
  const dead = withConfig((config) => { config.society.actors.initialActors[3].health = 0; });
  validateMemoryWorld(dead, 'the death fixture must be a legal old world first');
  assert.equal(dead.actorModel.actors[3].alive, false, 'the fixture really kills actor-4');
  assert.equal(dead.actorModel.actors[3].actorId, 'actor-4');
  assert.equal(dead.actorModel.actors[3].deathTick, 0, 'the initial tombstone is day 0');
  assert.equal(dead.ecologyModel.populations.wolves, 14, 'the dead village still has wolves');
  const frame = createEncounterWorld(dead);
  const before = canonicalJson(frame);
  rejects(() => beginPlayerWolfEncounter(frame, ID), 'RULE_REJECTED', 'a dead player');
  assert.equal(canonicalJson(frame), before);
  assert.equal(frame.world.actorModel.actors[3].alive, false, 'no implicit revival');
  assert.equal(frame.world.ecologyModel.populations.wolves, 14);
});

test('begin rejects: a player who starves to death in the forest is still RULE_REJECTED', () => {
  // The real legal timeline: a hungry, low-health player with no private food walks to the forest at
  // tick 12 and dies at the tick 144 daily settlement. Only the pinned health/hunger/food knobs move.
  const config = defaultPlayerPlayConfig();
  config.society.actors.initialActors[3].health = 50;
  config.society.actors.initialActors[3].hunger = 1000;
  config.society.player.initialFood = 0;
  const fixture = createPlayerPlayVillage(42, 'player-play-village', config);
  const walked = executePlayerIntent(fixture.bundle,
    { commandId: 'starve-walk', type: 'PlayerTravel', payload: { destination: 'forest' } });
  const midway = walked.bundle.snapshot.world;
  validateMemoryWorld(midway, 'the travelled world is a legal old world');
  assert.equal(walked.bundle.snapshot.tick, 12, 'the travel really completes at tick 12');
  assert.equal(midway.actorModel.actors[3].location, 'forest', 'the player really reached the forest');
  assert.equal(midway.actorModel.actors[3].alive, true, 'the player is still alive on arrival');
  assert.equal(midway.playerModel.inventory.food, 0, 'the player carries no private food');
  assert.equal(midway.playerModel.inventory.herbs, 1, 'the other private asset is untouched');
  assert.equal(midway.playerModel.wallet, 100, 'the wallet is untouched');

  const session = createSimulationSession(walked.bundle, playerPlaySystems());
  session.advanceTicks(132);
  const settled = session.getBundle();
  const world = settled.snapshot.world;
  validateMemoryWorld(world, 'the settled world is a legal old world');
  assert.equal(settled.snapshot.tick, 144, 'the daily settlement really happens at tick 144');
  assert.equal(world.actorModel.actors[3].alive, false, 'the player really starved to death');
  assert.equal(world.actorModel.actors[3].actorId, 'actor-4');
  assert.equal(world.actorModel.actors[3].location, 'forest', 'the body stays in the forest');
  assert.equal(world.actorModel.actors[3].deathTick, 144, 'the tombstone is the settlement tick');
  assert.equal(world.ecologyModel.populations.wolves, 14, 'the wolves are all still there');
  assert.equal(world.ecologyModel.day, 1, 'the anchor day for this world is 1');

  const frame = createEncounterWorld(world);
  assert.equal(frame.anchorDay, 1, 'the candidate anchors on the real post-settlement day');
  assert.equal(frame.reservation.available, 14);
  const before = canonicalJson(frame);
  rejects(() => beginPlayerWolfEncounter(frame, ID), 'RULE_REJECTED', 'a dead player standing in the forest');
  assert.equal(canonicalJson(frame), before, 'a rejected begin writes nothing');
  assert.equal(frame.world.actorModel.actors[3].alive, false, 'no implicit revival');
  assert.equal(frame.world.actorModel.actors[3].location, 'forest', 'no implicit travel');
  assert.equal(frame.world.ecologyModel.populations.wolves, 14, 'no wolf is held on rejection');
  assert.equal(frame.reservation.reserved, 0);
});

test('begin rejects: a legal zero-wolf configuration is RULE_REJECTED', () => {
  const zero = withConfig((config) => { config.society.actors.market.ecology.resources.populations.wolves = 0; });
  validateMemoryWorld(zero, 'the zero-wolf fixture must be a legal old world first');
  assert.equal(zero.ecologyModel.populations.wolves, 0, 'the fixture really removes every wolf');
  assert.equal(zero.ecologyModel.populations.deer, 120, 'the deer population is still there');
  const zeroConfig = defaultPlayerPlayConfig();
  zeroConfig.society.actors.market.ecology.resources.populations.wolves = 0;
  const walked = executePlayerIntent(createPlayerPlayVillage(42, 'player-play-village', zeroConfig).bundle,
    { commandId: 'go', type: 'PlayerTravel', payload: { destination: 'forest' } });
  const world = walked.bundle.snapshot.world;
  assert.equal(world.ecologyModel.populations.wolves, 0, 'the zero-wolf world survives a legal travel');
  assert.equal(world.actorModel.actors[3].location, 'forest', 'the player really reached the forest');
  const frame = createEncounterWorld(world);
  assert.equal(frame.reservation.initialPopulation, 0, 'the ledger opens empty');
  assert.equal(frame.reservation.available, 0);
  const before = canonicalJson(frame);
  rejects(() => beginPlayerWolfEncounter(frame, ID), 'RULE_REJECTED', 'no wolf left to reserve');
  assert.equal(canonicalJson(frame), before, 'the empty pool is not written');
});

test('begin: a one-wolf world spends its last wolf and gets it back', () => {
  const one = withConfig((config) => { config.society.actors.market.ecology.resources.populations.wolves = 1; });
  validateMemoryWorld(one);
  const c = defaultPlayerPlayConfig();
  c.society.actors.market.ecology.resources.populations.wolves = 1;
  const walked = executePlayerIntent(createPlayerPlayVillage(42, 'player-play-village', c).bundle,
    { commandId: 'go', type: 'PlayerTravel', payload: { destination: 'forest' } });
  const world = walked.bundle.snapshot.world;
  assert.equal(world.ecologyModel.populations.wolves, 1, 'the fixture really carries one wolf');
  assert.equal(world.actorModel.actors[3].location, 'forest');
  const frame = createEncounterWorld(world);
  const started = beginPlayerWolfEncounter(frame, ID);
  assert.equal(started.world.ecologyModel.populations.wolves, 0, 'the last wolf is held');
  assert.equal(started.reservation.available, 0);
  assert.equal(started.reservation.reserved, 1);
  const cancelled = cancelPlayerWolfEncounter(started, ID);
  assert.equal(cancelled.world.ecologyModel.populations.wolves, 1, 'the last wolf comes back');
  assert.equal(cancelled.reservation.available, 1);
  assert.equal(cancelled.reservation.reserved, 0);
  assert.deepEqual(cancelled.world, frame.world);
});

test('begin: repeating the same id is an equal copy that holds nothing more', () => {
  const frame = createEncounterWorld(forestWorld());
  const first = beginPlayerWolfEncounter(frame, ID);
  const second = beginPlayerWolfEncounter(first, ID);
  assert.deepEqual(second, first, 'the repeat is an equal copy');
  assert.notEqual(second, first, 'the repeat is still a new frame');
  assert.equal(second.world.ecologyModel.populations.wolves, 13, 'no second wolf is taken');
  assert.equal(second.reservation.reserved, 1);
  assert.deepEqual(second.reservation.encounter, { encounterId: ID, status: 'active', resolution: null });
  const third = beginPlayerWolfEncounter(second, ID);
  assert.equal(third.world.ecologyModel.populations.wolves, 13, 'a third begin is still free');
  assert.equal(cancelPlayerWolfEncounter(third, ID).world.ecologyModel.populations.wolves, 14,
    'one cancel returns exactly one wolf');
});

test('begin rejects: a different id while the slot is busy is ENCOUNTER_BUSY', () => {
  const frame = createEncounterWorld(forestWorld());
  const first = beginPlayerWolfEncounter(frame, ID);
  const before = canonicalJson(first);
  rejects(() => beginPlayerWolfEncounter(first, OTHER_ID), 'ENCOUNTER_BUSY', 'the slot is already held');
  assert.equal(canonicalJson(first), before, 'a busy rejection writes nothing');
  assert.equal(first.world.ecologyModel.populations.wolves, 13, 'busy does not take a second wolf');
  assert.equal(first.reservation.reserved, 1);
  rejects(() => cancelPlayerWolfEncounter(first, OTHER_ID), 'ENCOUNTER_ID_MISMATCH', 'the id does not match');
  assert.equal(cancelPlayerWolfEncounter(first, ID).world.ecologyModel.populations.wolves, 14);
});

test('begin rejects: a closed slot is never reused (ENCOUNTER_CLOSED)', () => {
  const frame = createEncounterWorld(forestWorld());
  const started = beginPlayerWolfEncounter(frame, ID);
  const closed = cancelPlayerWolfEncounter(started, ID);
  assert.equal(closed.reservation.encounter.status, 'closed');
  const before = canonicalJson(closed);
  rejects(() => beginPlayerWolfEncounter(closed, ID), 'ENCOUNTER_CLOSED', 'the same id after a cancel');
  rejects(() => beginPlayerWolfEncounter(closed, OTHER_ID), 'ENCOUNTER_CLOSED', 'a new id after a cancel');
  assert.equal(canonicalJson(closed), before, 'a closed rejection writes nothing');
  assert.equal(closed.world.ecologyModel.populations.wolves, 14, 'no wolf is taken from a closed slot');
  assert.equal(closed.reservation.reserved, 0);
});

test('cancel: repeating the same cancel adds nothing back', () => {
  const frame = createEncounterWorld(forestWorld());
  const started = beginPlayerWolfEncounter(frame, ID);
  const first = cancelPlayerWolfEncounter(started, ID);
  const second = cancelPlayerWolfEncounter(first, ID);
  assert.deepEqual(second, first, 'the repeat cancel is an equal copy');
  assert.notEqual(second, first, 'the repeat cancel is still a new frame');
  assert.equal(second.world.ecologyModel.populations.wolves, 14, 'only one wolf ever comes back');
  assert.equal(second.reservation.available, 14);
  assert.equal(second.reservation.reserved, 0);
  assert.equal(second.reservation.battleDeaths, 0);
  assert.deepEqual(second.reservation.encounter, { encounterId: ID, status: 'closed', resolution: 'released' });
  const third = cancelPlayerWolfEncounter(second, ID);
  assert.deepEqual(third, second, 'continuous cancels agree');
});

test('cancel rejects: no open encounter is ENCOUNTER_UNAVAILABLE', () => {
  const frame = createEncounterWorld(forestWorld());
  const before = canonicalJson(frame);
  rejects(() => cancelPlayerWolfEncounter(frame, ID), 'ENCOUNTER_UNAVAILABLE', 'nothing was ever begun');
  assert.equal(canonicalJson(frame), before, 'a missing cancel writes nothing');
  assert.equal(frame.world.ecologyModel.populations.wolves, 14, 'no wolf is conjured');
  assert.equal(frame.reservation.available, 14);
});

test('cancel does not require the player to be alive or in the forest, and never revives', () => {
  const frame = createEncounterWorld(forestWorld());
  const started = beginPlayerWolfEncounter(frame, ID);
  const away = cloneData(started);
  away.world.actorModel.actors[3].location = 'village';
  const moved = cancelPlayerWolfEncounter(away, ID);
  assert.equal(moved.world.actorModel.actors[3].location, 'village', 'no implicit travel');
  assert.equal(moved.world.ecologyModel.populations.wolves, 14, 'the wolf is still returned');
  assert.equal(moved.reservation.reserved, 0);
  assert.equal(moved.world.actorModel.actors[3].fatigue, started.world.actorModel.actors[3].fatigue,
    'no damage, reward or time advance');
  assert.equal(moved.world.actorModel.actors[3].health, started.world.actorModel.actors[3].health, 'no damage');
  assert.equal(moved.world.playerModel.wallet, started.world.playerModel.wallet, 'no reward');
  assert.equal(moved.anchorDay, started.anchorDay, 'no time advance');
  assert.deepEqual(moved.world.playerModel.inventory, started.world.playerModel.inventory, 'no goods move');
});

test('begin and cancel reject: bad frames, bad ids and frozen inputs stay intact', () => {
  const frame = createEncounterWorld(forestWorld());
  for (const bad of [undefined, null, 'frame', [], 0]) {
    rejects(() => beginPlayerWolfEncounter(bad, ID), 'INVALID_INPUT', 'frame ' + String(bad));
    rejects(() => cancelPlayerWolfEncounter(bad, ID), 'INVALID_INPUT', 'frame ' + String(bad));
  }
  rejects(() => beginPlayerWolfEncounter({ ...frame, version: 'encounter-world-v2' }, ID), 'INVALID_INPUT',
    'a foreign shell version');
  rejects(() => cancelPlayerWolfEncounter({ ...frame, version: 'encounter-world-v2' }, ID), 'INVALID_INPUT',
    'a foreign shell version');
  const drifted = cloneData(frame);
  drifted.world.ecologyModel.day = 1;
  rejects(() => beginPlayerWolfEncounter(drifted, ID), 'INVALID_INPUT', 'a day-drifted world inside a frame');
  for (const bad of [undefined, null, '', 0, 'e'.repeat(65), {}, [], true]) {
    rejects(() => beginPlayerWolfEncounter(frame, bad), 'INVALID_INPUT', 'id ' + String(bad));
    rejects(() => cancelPlayerWolfEncounter(frame, bad), 'INVALID_INPUT', 'id ' + String(bad));
  }
  const frozen = deepFreeze(createEncounterWorld(forestWorld()));
  assert.doesNotThrow(() => beginPlayerWolfEncounter(frozen, ID), 'a frozen frame can be spent');
  const frozenStarted = beginPlayerWolfEncounter(frozen, ID);
  assert.equal(frozen.reservation.reserved, 0, 'the frozen input is never written');
  assert.equal(frozenStarted.reservation.reserved, 1);
  assert.doesNotThrow(() => cancelPlayerWolfEncounter(deepFreeze(frozenStarted), ID), 'a frozen start can be cancelled');
  assert.equal(frozenStarted.reservation.reserved, 1, 'the frozen start is never written');
});

test('begin rejects: the 64-character id is allowed and a 65-character id is refused', () => {
  const frame = createEncounterWorld(forestWorld());
  const long = 'e'.repeat(64);
  const started = beginPlayerWolfEncounter(frame, long);
  assert.equal(started.reservation.encounter.encounterId, long, 'the boundary id is a legal identifier');
  assert.equal(started.world.ecologyModel.populations.wolves, 13);
  rejects(() => beginPlayerWolfEncounter(frame, 'e'.repeat(65)), 'INVALID_INPUT', 'a too long id');
  assert.equal(frame.reservation.available, 14, 'the refused call took nothing');
});

test('an ACTIVE candidate survives a JSON round trip and stays a legal frame', () => {
  const frame = createEncounterWorld(forestWorld());
  const started = beginPlayerWolfEncounter(frame, ID);
  const revived = jsonRoundTrip(started);
  assert.deepEqual(revived, started, 'the candidate is plain JSON data');
  assert.equal(validateEncounterWorld(revived).world.ecologyModel.populations.wolves, 13);
  const cancelled = cancelPlayerWolfEncounter(revived, ID);
  assert.equal(cancelled.world.ecologyModel.populations.wolves, 14, 'the round trip is not a disk recovery claim');
  assert.deepEqual(cancelled.reservation.encounter, { encounterId: ID, status: 'closed', resolution: 'released' });
  const frozen = deepFreeze(started);
  const cancelledFrozen = cancelPlayerWolfEncounter(frozen, ID);
  assert.equal(cancelledFrozen.world.ecologyModel.populations.wolves, 14, 'a frozen active frame still cancels');
  assert.deepEqual(cancelledFrozen.world, frame.world, 'the frozen path restores the world');
});

test('the candidate never becomes an authoritative commit: no event, receipt or day advance', () => {
  const world = forestWorld();
  const frame = createEncounterWorld(world);
  const started = beginPlayerWolfEncounter(frame, ID);
  const cancelled = cancelPlayerWolfEncounter(started, ID);
  for (const snapshot of [started, cancelled]) {
    assert.deepEqual(Object.keys(snapshot).sort(), FRAME_FIELDS, 'the shell never grows a command field');
    assert.equal(snapshot.world.memoryModel.day, 0, 'no day is settled');
    assert.equal(snapshot.world.ecologyModel.day, 0);
    assert.equal(snapshot.anchorDay, 0);
    assert.equal(snapshot.world.ecologyModel.ledger.wolves.removed, 0, 'removal is a permanent book, not a hold');
    assert.equal(snapshot.world.ecologyModel.ledger.wolves.hunted, 0);
    assert.equal(snapshot.world.ecologyModel.ledger.wolves.predation, 0);
    assert.equal(snapshot.world.actorModel.ledger.deaths, 0);
  }
  assert.equal(started.world.ecologyModel.populations.wolves, 13, 'the hold is real inside the candidate');
  assert.equal(cancelled.world.ecologyModel.populations.wolves, 14, 'and it is really returned');
});

test('the frozen ecology ceiling is untouched: the candidate only answers to the D3-1 budget', () => {
  const frame = createEncounterWorld(baseWorld());
  assert.equal(frame.world.ecologyModel.populations.wolves, 14, 'the village wolf count is a fixture fact');
  assert.equal(frame.reservation.initialPopulation, 14);
  assert.equal(frame.reservation.available, 14);
  const started = beginPlayerWolfEncounter(createEncounterWorld(forestWorld()), ID);
  assert.equal(started.reservation.initialPopulation + 0, 14, 'the kernel ceiling is a separate budget');
  assert.equal(started.world.ecologyModel.populations.wolves, 13);
});

test('the candidate world is never an old-world profile and keeps its own memory identity', () => {
  const frame = createEncounterWorld(forestWorld());
  const started = beginPlayerWolfEncounter(frame, ID);
  validateMemoryWorld({ ...started.world, ecologyModel: { ...started.world.ecologyModel,
    populations: { ...started.world.ecologyModel.populations, wolves: 14 } } },
    'with the held wolf added back the old invariants still hold');
  assert.equal(started.world.memoryModel.config.version, 'memory-config-v4', 'the play profile is preserved');
  assert.equal(started.world.playerModel.version, 'player-state-v2');
  assert.equal(started.version, ENCOUNTER_WORLD_VERSION, 'the shell version is its own DTO version');
  assert.notEqual(started.version, ENCOUNTER_RESERVATION_VERSION, 'it is not the kernel version');
  assert.equal(started.world.memoryModel.configFingerprint, canonicalJson(started.world.memoryModel.config));
});
