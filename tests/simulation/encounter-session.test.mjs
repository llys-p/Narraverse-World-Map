// D3-3 bounded encounter command session tests (contract d3-encounter-session-v1).
// Independent lane: every expected number is derived from the frozen taskbook plus the real
// player-play village world this file itself produces before asserting. The module under test is
// never read and no expectation is copied from it. A session owns only its own isolated copy of the
// world and proves nothing about SimulationSession, the old bundle, EventLog, checkpoints or HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../../runtime/core/encounter-session.mjs';
import { canonicalJson, cloneData } from '../../runtime/core/data-contract.mjs';
import { createPlayerPlayVillage, playerPlaySystems } from '../../runtime/fixtures/player-play-village.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { defaultPlayerPlayConfig, executePlayerIntent, enqueuePlayerIntent } from '../../runtime/core/player-intents.mjs';
import { ENCOUNTER_WORLD_VERSION } from '../../runtime/core/encounter-world.mjs';

const { ENCOUNTER_SESSION_VERSION, MAX_ENCOUNTER_COMMANDS, createEncounterSession } = mod;

const SNAPSHOT_FIELDS = ['encounterRevision', 'frame', 'simulationId', 'sourceRevision', 'sourceTick', 'version'];
const FRAME_FIELDS = ['anchorDay', 'reservation', 'version', 'world'];
const RECEIPT_FIELDS = ['code', 'commandId', 'encounterId', 'encounterRevision', 'sourceTick', 'status', 'type'];
const REQUEST_FIELDS = ['commandId', 'expectedEncounterRevision', 'payload', 'type'];
const SESSION_METHODS = ['getJournal', 'getSnapshot', 'submit'];
const SESSION_ID = 'encounter-1';

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};
const bytes = (value) => new TextEncoder().encode(canonicalJson(value)).length;
const rejects = (run, code, why) => assert.throws(run, { code }, why);

// The one real travel the contract pins: village -> forest, completing at tick 12, day still 0.
const forestBundle = () => executePlayerIntent(createPlayerPlayVillage(42).bundle,
  { commandId: 'go-forest', type: 'PlayerTravel', payload: { destination: 'forest' } }).bundle;
const villageBundle = () => createPlayerPlayVillage(42).bundle;
const withConfig = (mutate) => {
  const config = defaultPlayerPlayConfig();
  mutate(config);
  return createPlayerPlayVillage(42, 'player-play-village', config).bundle;
};
const travelled = (config) => executePlayerIntent(createPlayerPlayVillage(42, 'player-play-village', config).bundle,
  { commandId: 'go', type: 'PlayerTravel', payload: { destination: 'forest' } }).bundle;
const session = (bundle = forestBundle(), systems = playerPlaySystems()) => createEncounterSession(bundle, systems);
const begin = (commandId, revision) => ({ commandId, expectedEncounterRevision: revision, type: 'EncounterBegin', payload: {} });
const cancel = (commandId, revision, encounterId = SESSION_ID) => ({ commandId, expectedEncounterRevision: revision,
  type: 'EncounterCancel', payload: { encounterId } });
const wolves = (snapshot) => snapshot.frame.world.ecologyModel.populations.wolves;
const reservation = (snapshot) => snapshot.frame.reservation;

test('contract smoke: the frozen export surface is exactly three names', () => {
  assert.deepEqual(Object.keys(mod).sort(), ['ENCOUNTER_SESSION_VERSION', 'MAX_ENCOUNTER_COMMANDS', 'createEncounterSession'],
    'the module exports nothing else, so no test-only hook is smuggled in');
  assert.equal(ENCOUNTER_SESSION_VERSION, 'encounter-session-v1');
  assert.equal(MAX_ENCOUNTER_COMMANDS, 100);
  assert.equal(typeof createEncounterSession, 'function');
});

test('the returned method object is frozen and carries exactly three synchronous methods', () => {
  const s = session();
  assert.equal(Object.isFrozen(s), true, 'the method object is frozen');
  assert.deepEqual(Object.keys(s).sort(), SESSION_METHODS, 'no other own property leaks internal state');
  for (const name of SESSION_METHODS) assert.equal(typeof s[name], 'function', name);
  assert.equal(s.submit(begin('cmd-1', 0)).status, 'succeeded', 'submit really runs synchronously');
  assert.equal(s.getSnapshot().encounterRevision, 1, 'and the state is visible right away');
  assert.equal(s.getJournal().length, 1, 'the journal is visible right away');
});

test('create: the snapshot carries exactly six fields over a real tick-12 forest world', () => {
  const bundle = forestBundle();
  assert.equal(bundle.snapshot.tick, 12, 'the real travel really completes at tick 12');
  assert.equal(bundle.snapshot.world.actorModel.actors[3].location, 'forest', 'the player really reached the forest');
  const snapshot = session(bundle).getSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), SNAPSHOT_FIELDS, 'exactly six snapshot fields');
  assert.equal(snapshot.version, ENCOUNTER_SESSION_VERSION);
  assert.equal(snapshot.simulationId, 'player-play-village');
  assert.equal(snapshot.sourceTick, 12, 'sourceTick is the creation tick');
  assert.equal(snapshot.sourceRevision, bundle.snapshot.revision, 'sourceRevision is the creation revision');
  assert.equal(snapshot.encounterRevision, 0, 'the session sequence starts at 0');
  assert.notEqual(snapshot.encounterRevision, bundle.snapshot.revision, 'it never impersonates the old revision');
  assert.deepEqual(Object.keys(snapshot.frame).sort(), FRAME_FIELDS, 'the frame is the D3-2 four-field shell');
  assert.equal(snapshot.frame.version, ENCOUNTER_WORLD_VERSION);
  assert.equal(wolves(snapshot), 14, 'the fixture really starts at 14 wolves');
  assert.equal(reservation(snapshot).available, 14);
  assert.equal(reservation(snapshot).reserved, 0);
  assert.equal(reservation(snapshot).encounter, null);
  assert.equal(snapshot.frame.world.actorModel.actors[3].location, 'forest');
});

test('create rejects: a foreign rules version is UNSUPPORTED_VERSION and pending commands are INVALID_INPUT', () => {
  rejects(() => createEncounterSession(createPlayerVillage().bundle, playerPlaySystems()),
    'UNSUPPORTED_VERSION', 'a player-v1 bundle is outside this contract');
  const pending = enqueuePlayerIntent(villageBundle(), { commandId: 'go', type: 'PlayerTravel', payload: { destination: 'forest' } }).bundle;
  assert.equal(pending.snapshot.pendingCommands.length, 1, 'the fixture really carries a pending command');
  rejects(() => createEncounterSession(pending, playerPlaySystems()), 'INVALID_INPUT', 'a non-empty pending queue');
  for (const bad of [undefined, null, 'bundle', 0, []]) {
    rejects(() => createEncounterSession(bad, playerPlaySystems()), 'INVALID_INPUT', 'bundle ' + String(bad));
  }
  rejects(() => createEncounterSession({}, playerPlaySystems()), 'INVALID_INPUT', 'a bundle without snapshot/eventLog');
});

test('create rejects: a getter and a cycle in the bundle are stopped before any read', () => {
  const spied = cloneData(villageBundle());
  let calls = 0;
  Object.defineProperty(spied.snapshot.world.ecologyModel.populations, 'wolves',
    { enumerable: true, configurable: true, get() { calls += 1; return 14; } });
  rejects(() => createEncounterSession(spied, playerPlaySystems()), 'INVALID_INPUT', 'a population accessor on the bundle');
  assert.equal(calls, 0, 'the accessor must never run');
  const cyclic = villageBundle();
  cyclic.snapshot.world.ecologyModel.populations.self = cyclic;
  rejects(() => createEncounterSession(cyclic, playerPlaySystems()), 'INVALID_INPUT', 'a cyclic bundle world');
});

test('create: the systems registry is only inspected, never called, and accessors are refused', () => {
  let calls = 0;
  const spied = Object.fromEntries(Object.entries(playerPlaySystems()).map(([id]) => [id, () => { calls += 1; }]));
  const built = createEncounterSession(forestBundle(), spied);
  built.submit(begin('cmd-1', 0));
  built.submit(cancel('cmd-2', 1));
  assert.equal(calls, 0, 'no system handler is ever invoked by the session');

  const getter = { ...playerPlaySystems() };
  let gets = 0;
  Object.defineProperty(getter, 'society', { enumerable: true, configurable: true, get() { gets += 1; return () => {}; } });
  rejects(() => createEncounterSession(forestBundle(), getter), 'INVALID_INPUT', 'a getter in the registry');
  assert.equal(gets, 0, 'the registry getter must never run');
  const symbol = { ...playerPlaySystems() };
  symbol[Symbol('extra')] = () => {};
  rejects(() => createEncounterSession(forestBundle(), symbol), 'INVALID_INPUT', 'a symbol key in the registry');
  const hidden = { ...playerPlaySystems() };
  Object.defineProperty(hidden, 'extra', { value: () => {}, enumerable: false, configurable: true, writable: true });
  rejects(() => createEncounterSession(forestBundle(), hidden), 'INVALID_INPUT', 'a non-enumerable registry entry');
});

test('happy path: Begin then Cancel move one wolf and never advance the world tick', () => {
  const s = session();
  const first = s.submit(begin('cmd-1', 0));
  assert.deepEqual(Object.keys(first).sort(), RECEIPT_FIELDS, 'the receipt carries exactly seven fields');
  assert.deepEqual(first, { commandId: 'cmd-1', encounterId: SESSION_ID, type: 'EncounterBegin', status: 'succeeded',
    code: null, encounterRevision: 1, sourceTick: 12 });
  assert.equal(s.getSnapshot().encounterRevision, 1);
  assert.equal(wolves(s.getSnapshot()), 13, 'one wolf is held back');
  assert.equal(reservation(s.getSnapshot()).reserved, 1);
  assert.deepEqual(reservation(s.getSnapshot()).encounter, { encounterId: SESSION_ID, status: 'active', resolution: null });

  const second = s.submit(cancel('cmd-2', 1));
  assert.deepEqual(second, { commandId: 'cmd-2', encounterId: SESSION_ID, type: 'EncounterCancel', status: 'succeeded',
    code: null, encounterRevision: 2, sourceTick: 12 });
  assert.equal(s.getSnapshot().encounterRevision, 2);
  assert.equal(wolves(s.getSnapshot()), 14, 'the wolf is returned');
  assert.equal(reservation(s.getSnapshot()).reserved, 0);
  assert.deepEqual(reservation(s.getSnapshot()).encounter, { encounterId: SESSION_ID, status: 'closed', resolution: 'released' });
  assert.equal(s.getSnapshot().sourceTick, 12, 'sourceTick never moves');
  assert.equal(s.getSnapshot().sourceRevision, 12, 'sourceRevision never moves');
  assert.equal(s.getSnapshot().frame.anchorDay, 0, 'the world day never moves');
  assert.equal(s.getSnapshot().frame.world.ecologyModel.day, 0, 'no settle happened');

  const journal = s.getJournal();
  assert.equal(journal.length, 2);
  for (const entry of journal) {
    assert.deepEqual(Object.keys(entry).sort(), ['command', 'receipt'], 'a journal item is command + receipt');
    assert.deepEqual(Object.keys(entry.command).sort(), REQUEST_FIELDS, 'the recorded command keeps its four fields');
  }
  assert.deepEqual(journal[0].command, begin('cmd-1', 0));
  assert.deepEqual(journal[0].receipt, first);
  assert.deepEqual(journal[1].command, cancel('cmd-2', 1));
  assert.deepEqual(journal[1].receipt, second);
  assert.notEqual(journal[0].receipt, first, 'the journal holds its own copy');
});

test('the encounter id is chosen by the session, never by the client', () => {
  const s = session();
  const accepted = s.submit(begin('cmd-0', 0));
  assert.equal(accepted.status, 'succeeded', 'an exactly-empty Begin payload is legal and the session runs it');
  assert.equal(accepted.encounterId, SESSION_ID, 'the session chose the encounter id itself');
  rejects(() => s.submit({ commandId: 'cmd-0', expectedEncounterRevision: 0, type: 'EncounterBegin',
    payload: { encounterId: 'mine' } }), 'INVALID_INPUT', 'a client-named encounter id');
  rejects(() => s.submit({ commandId: 'cmd-0', expectedEncounterRevision: 0, type: 'EncounterBegin',
    payload: { wolves: 3 } }), 'INVALID_INPUT', 'a client-supplied wolf count');
  rejects(() => s.submit({ commandId: 'cmd-0', expectedEncounterRevision: 0, type: 'EncounterBegin',
    payload: { actorId: 'actor-1' } }), 'INVALID_INPUT', 'a client-supplied person');
  rejects(() => s.submit({ commandId: 'cmd-0', expectedEncounterRevision: 0, type: 'EncounterBegin',
    payload: { frame: {} } }), 'INVALID_INPUT', 'a client-supplied frame');
  rejects(() => s.submit({ commandId: 'cmd-0', expectedEncounterRevision: 0, type: 'EncounterFlee', payload: {} }),
    'INVALID_INPUT', 'an unknown command type');
  assert.equal(s.getJournal().length, 1, 'only the one accepted Begin reaches the journal');
  assert.equal(s.getSnapshot().encounterRevision, 1, 'the accepted Begin is the only sequence step');
});

test('idempotent replay: the same id with the same canonical request replays the original receipt', () => {
  const s = session();
  const first = s.submit(begin('cmd-1', 0));
  s.submit(cancel('cmd-2', 1));
  // Stale expected revision, a completed cancel and a full journal must not change the answer.
  const stale = s.submit(begin('cmd-1', 0));
  assert.deepEqual(stale, first, 'the replay is the original receipt');
  assert.equal(stale.encounterRevision, 1, 'it still records the original sequence number');
  assert.equal(s.getJournal().length, 2, 'a replay adds no journal entry');
  assert.equal(s.getSnapshot().encounterRevision, 2, 'a replay changes no state');
  assert.notEqual(stale, first, 'the replay is an independent copy');
  stale.commandId = 'tampered';
  stale.code = 'RULE_REJECTED';
  assert.deepEqual(s.submit(begin('cmd-1', 0)), first, 'external tampering never reaches memory');
  assert.equal(wolves(s.getSnapshot()), 14, 'the replay does not take another wolf');
});

test('the same id with a different canonical request is COMMAND_ID_CONFLICT, ahead of the revision gate', () => {
  const s = session();
  const original = s.submit(begin('cmd-1', 0));
  rejects(() => s.submit(cancel('cmd-1', 1)), 'COMMAND_ID_CONFLICT', 'the id is already bound to another request');
  rejects(() => s.submit(begin('cmd-1', 99)), 'COMMAND_ID_CONFLICT', 'the conflict wins over the stale revision');
  assert.deepEqual(s.submit({ commandId: 'cmd-1', expectedEncounterRevision: 0, type: 'EncounterBegin', payload: {} }),
    original, 'a rebuilt request with the same canonical fields is a replay, not a conflict: field order is irrelevant');
  assert.equal(s.getJournal().length, 1, 'a conflict adds nothing');
  assert.equal(s.getSnapshot().encounterRevision, 1);
  assert.equal(wolves(s.getSnapshot()), 13, 'no wolf moved');
});

test('a new id with the wrong revision is REVISION_CONFLICT and consumes neither id nor budget', () => {
  const s = session();
  s.submit(begin('cmd-1', 0));
  rejects(() => s.submit(begin('cmd-9', 0)), 'REVISION_CONFLICT', 'a stale revision');
  rejects(() => s.submit(begin('cmd-9', 2)), 'REVISION_CONFLICT', 'a future revision');
  rejects(() => s.submit(begin('cmd-9', -1)), 'INVALID_INPUT', 'a negative revision is not a safe integer');
  rejects(() => s.submit(begin('cmd-9', 0.5)), 'INVALID_INPUT', 'a fractional revision');
  rejects(() => s.submit(begin('cmd-9', 2 ** 53)), 'INVALID_INPUT', 'an unsafe integer revision');
  assert.equal(s.getJournal().length, 1, 'a revision refusal leaves no receipt');
  assert.equal(s.getSnapshot().encounterRevision, 1, 'a revision refusal leaves no sequence number');
  const retried = s.submit(begin('cmd-9', 1));
  assert.equal(retried.commandId, 'cmd-9', 'the refused id is free again');
  assert.equal(retried.status, 'rejected', 'the slot is busy, but the request itself was accepted');
  assert.equal(retried.code, 'ENCOUNTER_BUSY');
  assert.equal(retried.encounterRevision, 2, 'the accepted request still advances the sequence');
});

test('input preflight: accessors, extra fields, symbols and cycles are refused with zero getter calls', () => {
  const s = session();
  const spied = cloneData(begin('cmd-1', 0));
  let calls = 0;
  Object.defineProperty(spied.payload, 'extra', { enumerable: true, configurable: true, get() { calls += 1; return 1; } });
  rejects(() => s.submit(spied), 'INVALID_INPUT', 'an accessor inside the payload');
  assert.equal(calls, 0, 'the payload accessor must never run');
  rejects(() => s.submit({ ...begin('cmd-1', 0), extra: 1 }), 'INVALID_INPUT', 'an extra request field');
  for (const key of REQUEST_FIELDS) {
    const { [key]: _drop, ...rest } = begin('cmd-1', 0);
    rejects(() => s.submit(rest), 'INVALID_INPUT', 'missing request field ' + key);
  }
  rejects(() => s.submit({ ...begin('cmd-1', 0), [Symbol('x')]: 1 }), 'INVALID_INPUT', 'a symbol key on the request');
  const cyclic = begin('cmd-1', 0);
  cyclic.self = cyclic;
  rejects(() => s.submit(cyclic), 'INVALID_INPUT', 'a cyclic request');
  rejects(() => s.submit(begin('', 0)), 'INVALID_INPUT', 'an empty command id');
  rejects(() => s.submit(begin('x'.repeat(65), 0)), 'INVALID_INPUT', 'a 65-character command id');
  assert.equal(s.getJournal().length, 0, 'nothing was accepted');

  const frozen = session();
  assert.doesNotThrow(() => frozen.submit(deepFreeze(begin('cmd-1', 0))), 'a frozen request is usable');
  const nullProto = Object.create(null);
  for (const [key, value] of Object.entries(begin('cmd-2', 1))) nullProto[key] = value;
  const nullReceipt = frozen.submit(nullProto);
  assert.equal(nullReceipt.status, 'rejected', 'a null-prototype request is accepted by preflight, not refused as malformed');
  assert.equal(nullReceipt.code, 'ENCOUNTER_BUSY', 'and it then meets the ordinary active-session domain rule');
  assert.equal(frozen.getJournal().length, 2, 'the null-prototype request really entered the journal, so it passed shape checks');
  assert.equal(frozen.getSnapshot().encounterRevision, 2, 'it advanced the sequence exactly once');
});

test('request budget: the canonical UTF-8 byte ceiling is 4096', () => {
  const s = session();
  const normal = begin('cmd-1', 0);
  assert.ok(bytes(normal) < 4096, 'the ordinary request really is under the ceiling: ' + bytes(normal) + ' bytes');
  const over = { commandId: 'cmd-over', expectedEncounterRevision: 0, type: 'EncounterBegin',
    payload: { pad: 'x'.repeat(4200) } };
  assert.ok(bytes(over) > 4096, 'the oversized request really is over the ceiling: ' + bytes(over) + ' bytes');
  rejects(() => s.submit(over), 'LIMIT_EXCEEDED', 'an over-budget request');
  rejects(() => s.submit({ commandId: 'cmd-over-2', expectedEncounterRevision: 0, type: 'EncounterCancel',
    payload: { encounterId: 'y'.repeat(5000) } }), 'LIMIT_EXCEEDED', 'an over-budget cancel id');
  assert.equal(s.getJournal().length, 0, 'an over-budget request leaves no receipt');
  assert.equal(s.getSnapshot().encounterRevision, 0);
  assert.equal(s.submit(normal).status, 'succeeded', 'the budget is per request, not a session poison');
});

test('domain rejection: village, lawful death and zero wolves are RULE_REJECTED and the frame does not move', () => {
  const village = session(villageBundle());
  assert.equal(village.getSnapshot().frame.world.actorModel.actors[3].location, 'village', 'the player really is in the village');
  const before = canonicalJson(village.getSnapshot().frame);
  const receipt = village.submit(begin('cmd-1', 0));
  assert.deepEqual(receipt, { commandId: 'cmd-1', encounterId: null, type: 'EncounterBegin', status: 'rejected',
    code: 'RULE_REJECTED', encounterRevision: 1, sourceTick: 0 });
  assert.equal(canonicalJson(village.getSnapshot().frame), before, 'the frame is byte-identical after a rejection');
  assert.equal(village.getSnapshot().encounterRevision, 1, 'the sequence still advances');
  assert.equal(village.getJournal().length, 1, 'the refusal is still an accepted request and is journalled');
  assert.equal(wolves(village.getSnapshot()), 14, 'no wolf was taken');

  const dead = session(withConfig((config) => { config.society.actors.initialActors[3].health = 0; }));
  assert.equal(dead.getSnapshot().frame.world.actorModel.actors[3].alive, false, 'the death fixture really kills actor-4');
  const deadBefore = canonicalJson(dead.getSnapshot().frame);
  assert.equal(dead.submit(begin('cmd-1', 0)).code, 'RULE_REJECTED', 'a lawfully dead player');
  assert.equal(canonicalJson(dead.getSnapshot().frame), deadBefore, 'a dead-player refusal writes nothing');

  const zeroConfig = defaultPlayerPlayConfig();
  zeroConfig.society.actors.market.ecology.resources.populations.wolves = 0;
  const zero = session(travelled(zeroConfig));
  assert.equal(zero.getSnapshot().frame.world.actorModel.actors[3].location, 'forest', 'the player really reached the forest');
  assert.equal(wolves(zero.getSnapshot()), 0, 'the zero-wolf fixture really removes every wolf');
  const zeroBefore = canonicalJson(zero.getSnapshot().frame);
  assert.equal(zero.submit(begin('cmd-1', 0)).code, 'RULE_REJECTED', 'no wolf left to reserve');
  assert.equal(canonicalJson(zero.getSnapshot().frame), zeroBefore, 'an empty pool is not written');
  assert.equal(zero.getSnapshot().encounterRevision, 1);
});

test('encounter lifecycle: busy, closed, unavailable and mismatched ids use the domain codes', () => {
  const s = session();
  s.submit(begin('cmd-1', 0));
  const busy = s.submit(begin('cmd-2', 1));
  assert.deepEqual(busy, { commandId: 'cmd-2', encounterId: SESSION_ID, type: 'EncounterBegin', status: 'rejected',
    code: 'ENCOUNTER_BUSY', encounterRevision: 2, sourceTick: 12 });
  assert.equal(wolves(s.getSnapshot()), 13, 'busy does not take a second wolf');

  const mismatch = s.submit(cancel('cmd-3', 2, 'wolf-other'));
  assert.deepEqual(mismatch, { commandId: 'cmd-3', encounterId: 'wolf-other', type: 'EncounterCancel', status: 'rejected',
    code: 'ENCOUNTER_ID_MISMATCH', encounterRevision: 3, sourceTick: 12 });
  assert.equal(wolves(s.getSnapshot()), 13, 'a mismatched cancel returns nothing');

  const closed = s.submit(cancel('cmd-4', 3));
  assert.equal(closed.status, 'succeeded', 'only the active same-id cancel succeeds');
  assert.equal(closed.encounterRevision, 4);
  assert.equal(wolves(s.getSnapshot()), 14);
  assert.equal(reservation(s.getSnapshot()).reserved, 0);

  const afterClosed = s.submit(cancel('cmd-5', 4));
  assert.deepEqual(afterClosed, { commandId: 'cmd-5', encounterId: SESSION_ID, type: 'EncounterCancel', status: 'rejected',
    code: 'ENCOUNTER_CLOSED', encounterRevision: 5, sourceTick: 12 }, 'a reopened cancel sees a closed slot');
  const beginClosed = s.submit(begin('cmd-6', 5));
  assert.deepEqual(beginClosed, { commandId: 'cmd-6', encounterId: SESSION_ID, type: 'EncounterBegin', status: 'rejected',
    code: 'ENCOUNTER_CLOSED', encounterRevision: 6, sourceTick: 12 }, 'a Begin after a cancel sees a closed slot');
  assert.equal(wolves(s.getSnapshot()), 14, 'a closed slot never takes a wolf');

  const fresh = session();
  assert.deepEqual(fresh.submit(cancel('cmd-1', 0)), { commandId: 'cmd-1', encounterId: SESSION_ID,
    type: 'EncounterCancel', status: 'rejected', code: 'ENCOUNTER_UNAVAILABLE', encounterRevision: 1, sourceTick: 12 },
    'a cancel with no encounter at all');
  assert.equal(wolves(fresh.getSnapshot()), 14, 'no wolf is conjured');
});

test('the 100 accepted command budget: the 101st new id is refused and the first stays idempotent', () => {
  const s = session(villageBundle());
  const first = s.submit(begin('cmd-1', 0));
  assert.equal(first.status, 'rejected', 'the village Begin is a repeated domain refusal');
  for (let index = 2; index <= MAX_ENCOUNTER_COMMANDS; index += 1) {
    const receipt = s.submit(begin('cmd-' + index, index - 1));
    assert.equal(receipt.commandId, 'cmd-' + index, 'every in-budget id gets a real receipt');
    assert.equal(receipt.encounterRevision, index, 'the sequence tracks the accepted count');
    assert.equal(receipt.code, 'RULE_REJECTED', 'the domain refusal is reproducible');
  }
  assert.equal(s.getJournal().length, MAX_ENCOUNTER_COMMANDS, 'the journal holds exactly 100 accepted requests');
  assert.equal(s.getSnapshot().encounterRevision, MAX_ENCOUNTER_COMMANDS);

  rejects(() => s.submit(begin('cmd-101', MAX_ENCOUNTER_COMMANDS)), 'LIMIT_EXCEEDED', 'the 101st unique command');
  rejects(() => s.submit(begin('cmd-102', MAX_ENCOUNTER_COMMANDS)), 'LIMIT_EXCEEDED', 'and the next one too');
  assert.equal(s.getJournal().length, MAX_ENCOUNTER_COMMANDS, 'a refused command adds nothing');
  assert.equal(s.getSnapshot().encounterRevision, MAX_ENCOUNTER_COMMANDS, 'a refused command changes nothing');
  assert.deepEqual(s.submit(begin('cmd-1', 0)), first, 'a full journal still replays the first receipt');
  assert.deepEqual(s.submit(begin('cmd-50', 49)), s.getJournal()[49].receipt, 'and every other one');
});

test('map-safe command ids: __proto__ and constructor never collide', () => {
  const s = session();
  const proto = s.submit(begin('__proto__', 0));
  const ctor = s.submit(begin('constructor', 1));
  assert.equal(proto.commandId, '__proto__', 'the prototype key is a legal identifier');
  assert.equal(ctor.commandId, 'constructor');
  assert.equal(proto.status, 'succeeded', 'the first Begin really succeeded');
  assert.equal(ctor.code, 'ENCOUNTER_BUSY', 'the second id is a separate entry, not a prototype collision');
  assert.equal(s.getJournal().length, 2, 'both entries are distinct journal items');
  assert.deepEqual(s.submit(begin('__proto__', 0)), proto, 'the prototype key still replays its own receipt');
  rejects(() => s.submit(begin('__proto__', 99)), 'COMMAND_ID_CONFLICT',
    'the same id with a different canonical revision is a conflict, not a stale replay');
  assert.notDeepEqual(s.submit(begin('constructor', 1)), proto, 'the two ids never share an entry');
  assert.equal({}.polluted, undefined, 'no object prototype was written');
  assert.equal(s.getJournal().length, 2, 'replays added nothing');
});

test('deep copies: the source bundle, snapshots, journal, requests and receipts never share a reference', () => {
  const bundle = forestBundle();
  const bundleBefore = canonicalJson(bundle);
  const s = createEncounterSession(bundle, playerPlaySystems());
  const first = s.submit(begin('cmd-1', 0));
  const snapshot = s.getSnapshot();
  assert.equal(canonicalJson(bundle), bundleBefore, 'the source bundle is never written');
  assert.notEqual(s.getSnapshot(), snapshot, 'every snapshot read is a fresh deep copy');
  assert.deepEqual(s.getSnapshot(), snapshot, 'and it is equal');
  snapshot.encounterRevision = 999;
  snapshot.frame.world.ecologyModel.populations.wolves = 999;
  assert.equal(s.getSnapshot().encounterRevision, 1, 'mutating a returned snapshot changes nothing inside');
  assert.equal(wolves(s.getSnapshot()), 13, 'mutating a returned frame changes nothing inside');
  assert.notEqual(s.getJournal()[0].receipt, first, 'the journal holds its own receipt copy');
  s.getJournal()[0].receipt.commandId = 'tampered';
  assert.deepEqual(s.submit(begin('cmd-1', 0)), first, 'mutating a journalled receipt changes nothing inside');
  const journal = s.getJournal();
  journal.length = 0;
  assert.equal(s.getJournal().length, 1, 'mutating a returned journal changes nothing inside');
  assert.equal(s.getSnapshot().frame.world.actorModel.actors[3].location, 'forest', 'the session world is its own copy');
});

test('post-commit fault: no injection point exists, so the rollback evidence is frame byte-equality', () => {
  // The synchronous pure module exposes only the three frozen exports above: there is no seam to
  // install a post-commit failure on without adding a production test backdoor, so NO such fault is
  // injected here. The closest observable guarantee is asserted instead: after a domain refusal the
  // published frame is byte-identical while the sequence number and journal advanced exactly once.
  const s = session();
  s.submit(begin('cmd-1', 0));
  const before = canonicalJson(s.getSnapshot().frame);
  const rejection = s.submit(begin('cmd-2', 1));
  assert.equal(rejection.status, 'rejected', 'the refusal really happened');
  assert.equal(canonicalJson(s.getSnapshot().frame), before, 'the published frame is unchanged to the byte');
  assert.equal(s.getSnapshot().encounterRevision, 2, 'the sequence advanced by exactly one');
  assert.equal(s.getJournal().length, 2, 'the journal advanced by exactly one');
  assert.equal(s.getSnapshot().sourceTick, 12, 'the world tick never moved');
  assert.equal(Object.keys(mod).length, 3, 'still no extra export to hook a fault onto');
});
