import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBundle, validateBundle, cloneBundle } from '../../runtime/core/world-state.mjs';

const systems = {};
const config = (changes = {}) => ({
  rulesVersion: 'a-smoke-v1', simulationId: 'test', fixtureId: 'clock-smoke',
  fixtureVersion: '1', seed: 0, resources: { A: 10, B: 0 }, scheduledTasks: [], commands: [], ...changes,
});
const validate = (b) => validateBundle(b, { rulesVersion: 'a-smoke-v1', systems });
const error = (code) => (e) => e.code === code;

test('V1 genesis contains the complete snapshot, seed zero, and isolated data', () => {
  const input = config(); const b = createInitialBundle(input, systems);
  assert.deepEqual(Object.keys(b.snapshot).sort(), [
    'schemaVersion', 'rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion',
    'tick', 'tickMinutes', 'revision', 'rng', 'nextEntityId', 'nextEventSeq', 'nextInputSeq',
    'scheduledTasks', 'pendingCommands', 'commandReceipts', 'world',
  ].sort());
  assert.equal(b.snapshot.rng.seed, 0); assert.equal(b.snapshot.tick, 0);
  assert.equal(b.snapshot.revision, 0); assert.equal(b.snapshot.nextInputSeq, 1);
  assert.deepEqual(b.eventLog, []); validate(JSON.parse(JSON.stringify(b)));
  input.resources.A = 99; assert.equal(b.snapshot.world.resources.A, 10);
  const copy = cloneBundle(b); copy.snapshot.world.resources.A = 55;
  assert.equal(b.snapshot.world.resources.A, 10);
});

test('V1 rejects bad data before getters, coercion, or serialization can erase it', () => {
  let reads = 0; const getter = config();
  Object.defineProperty(getter, 'seed', { enumerable: true, get() { reads++; return 0; } });
  assert.throws(() => createInitialBundle(getter, systems), error('INVALID_INPUT'));
  assert.equal(reads, 0);
  const cycle = {}; cycle.self = cycle;
  for (const bad of [new Date(), new Map(), new Set(), Object.assign(config(), { extra: 1 }),
    config({ seed: undefined }), config({ resources: { A: NaN } }), config({ resources: cycle }),
    config({ commands: Array(1) }), config({ resources: { A: 1n } })]) {
    assert.throws(() => createInitialBundle(bad, systems), error('INVALID_INPUT'));
  }
  const symbol = config(); symbol[Symbol('hidden')] = 1;
  assert.throws(() => createInitialBundle(symbol, systems), error('INVALID_INPUT'));
  const hidden = config(); Object.defineProperty(hidden, 'hidden', { value: 1 });
  assert.throws(() => createInitialBundle(hidden, systems), error('INVALID_INPUT'));
  const array = []; array.extra = 1;
  assert.throws(() => createInitialBundle(config({ commands: array }), systems), error('INVALID_INPUT'));
});

test('V1 exact versions, metadata, queues and counters are checked', () => {
  const b = createInitialBundle(config(), systems);
  for (const change of [{ schemaVersion: 1 }, { rulesVersion: 'other' }]) {
    const bad = cloneBundle(b); Object.assign(bad.snapshot, change);
    assert.throws(() => validate(bad), error('UNSUPPORTED_VERSION'));
  }
  for (const change of [{ tickMinutes: 11 }, { nextEventSeq: 2 }, { nextInputSeq: 2 },
    { nextEntityId: 0 }, { revision: 1 }, { tick: -1 }, { scheduledTasks: Array(1) }]) {
    const bad = cloneBundle(b); Object.assign(bad.snapshot, change);
    assert.throws(() => validate(bad), error('INVALID_INPUT'));
  }
  const bad = cloneBundle(b); bad.extra = true;
  assert.throws(() => validate(bad), error('INVALID_INPUT'));
  assert.throws(() => createInitialBundle(config({ fixtureId: 'x'.repeat(65) }), systems), error('INVALID_INPUT'));
});

test('V1 resource and input budgets fail without large result allocation', () => {
  assert.throws(() => createInitialBundle(config({ resources: Object.fromEntries(
    Array.from({ length: 100001 }, (_, i) => ['r' + i, 0]),
  ) }), systems), error('LIMIT_EXCEEDED'));
  assert.throws(() => createInitialBundle(config({ commands: Array(100001) }), systems), error('LIMIT_EXCEEDED'));
  assert.throws(() => createInitialBundle(config({ scheduledTasks: Array(100001) }), systems), error('LIMIT_EXCEEDED'));
  const b = createInitialBundle(config(), systems);
  b.eventLog = Array(1000001);
  assert.throws(() => validate(b), error('LIMIT_EXCEEDED'));
  b.eventLog = []; b.snapshot.commandReceipts = Object.fromEntries(
    Array.from({ length: 100001 }, (_, i) => ['c' + i, null]),
  );
  assert.throws(() => validate(b), error('LIMIT_EXCEEDED'));
});

test('V1 null prototypes and dangerous dictionary keys remain real own entries', () => {
  const input = Object.assign(Object.create(null), config());
  input.resources = JSON.parse('{"__proto__":10,"constructor":0,"A":2}');
  const b = createInitialBundle(input, systems); validate(b);
  assert.equal(Object.getPrototypeOf(b.snapshot.world.resources), Object.prototype);
  assert.equal(Object.hasOwn(b.snapshot.world.resources, '__proto__'), true);
  assert.equal(b.snapshot.world.resources.__proto__, 10);
  assert.equal({}.polluted, undefined);
});
