// R2 short experiment: does the Object.prototype descriptor gate keep the
// fast ordinary store AND survive the R1 inherited-member counter-example,
// measured against the frozen baseline module of THIS worktree?
//
// Reference (oracle / behaviour+perf baseline):
//   SHA 2936233426e990857f3c88a39ad58623832419fd
//   module: free-perf-trials/step5/artifacts/oracle/runtime/core/data-contract.mjs
//   sha256: c6f3bb2c1f4c10e2566b74a8f94ef38e9342ba52a4e60244f
// No real archive samples are read (out of contextReadScope); only synthetic
// legal samples derived from the real save shape.
//
// Run: node --test --test-reporter=tap --test-isolation=none experiments.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDataCandidate, cloneDataBase, oracleCloneData } from './proto-record-store.mjs';

// --- R1 counter-example, verbatim shape used by the controller -------------
test('R1 counter-example: inherited setter on Object.prototype is not invoked and value parity holds', () => {
  let setterCalls = 0;
  const installed = [];
  try {
    Object.defineProperty(Object.prototype, 'accountId', {
      set(v) { setterCalls += 1; installed.push(v); },
      get() { return 'INHERITED'; },
      configurable: true
    });
    Object.defineProperty(Object.prototype, 'frozenName', { value: 'INHERITED', writable: false, configurable: true });

    const input = { name: 'world-map', accountId: 'a-1', frozenName: 'local', numeric: 1, nested: { deep: [1, 2] } };
    const expected = oracleCloneData(input);
    const actual = cloneDataCandidate(input);
    assert.deepStrictEqual(actual, expected, 'candidate clone differs from oracle');
    assert.equal(setterCalls, 0, 'inherited setter was invoked');
    assert.equal(installed.length, 0, 'value leaked into inherited setter');
    assert.deepEqual(Object.getOwnPropertyDescriptor(actual, 'accountId'), Object.getOwnPropertyDescriptor(expected, 'accountId'));
    assert.deepEqual(Object.getOwnPropertyDescriptor(actual, 'frozenName'), Object.getOwnPropertyDescriptor(expected, 'frozenName'));
    assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    assert.equal(Object.keys(actual).join(','), Object.keys(expected).join(','));
  } finally {
    delete Object.prototype.accountId;
    delete Object.prototype.frozenName;
  }
});

test('read-only inherited member only: candidate matches oracle (R1 rejection #2)', () => {
  try {
    Object.defineProperty(Object.prototype, 'frozenName', { value: 'INHERITED', writable: false, configurable: true });
    const input = { frozenName: 'local', other: 2 };
    const expected = oracleCloneData(input);
    const actual = cloneDataCandidate(input);
    assert.deepStrictEqual(actual, expected);
    assert.equal(Object.hasOwn(actual, 'frozenName'), true);
    assert.equal(actual.frozenName, 'local');
  } finally {
    delete Object.prototype.frozenName;
  }
});

// --- descriptor / prototype / key-order parity on ordinary samples ---------
const descriptorEqual = (a, b, where) => {
  assert.equal(Object.getPrototypeOf(a), Object.getPrototypeOf(b), `prototype differs at ${where}`);
  assert.deepEqual(Reflect.ownKeys(a), Reflect.ownKeys(b), `own key order differs at ${where}`);
  for (const k of Reflect.ownKeys(b)) {
    const da = Object.getOwnPropertyDescriptor(a, k);
    const db = Object.getOwnPropertyDescriptor(b, k);
    assert.ok(da, `missing own property ${String(k)} at ${where}`);
    assert.deepEqual(da, db, `descriptor differs at ${where}.${String(k)}`);
    if (da && 'value' in da && da.value !== null && typeof da.value === 'object') descriptorEqual(da.value, db.value, `${where}.${String(k)}`);
  }
};

test('descriptor/prototype/key-order parity and getter-free on synthetic legal samples', () => {
  const shared = { id: 'shared', values: [1, 2] };
  const ownProto = {};
  Object.defineProperty(ownProto, '__proto__', { value: 'pv', enumerable: true, writable: true, configurable: true });
  ownProto.constructor = 'cv';
  ownProto.a = 1;
  const nullProto = Object.create(null); nullProto.z = 1; nullProto.a = 'b'; nullProto['0'] = 'z'; nullProto['10'] = 't'; nullProto['2'] = 'w';
  const cases = [
    {}, { b: 2, a: 1 }, nullProto, ownProto,
    [0, -0, 1, 'two', true, null, [[1]]],
    { branchA: shared, branchB: shared, list: [shared, shared] },
    { name: 'world-map', revision: 3, saves: [{ id: 's1', payload: { entities: [{ id: 'e', tags: ['a', 'b'] }] } }, { id: 's2' }] }
  ];
  cases.forEach((c, i) => {
    const expected = oracleCloneData(c);
    const actual = cloneDataCandidate(c);
    assert.deepStrictEqual(actual, expected, `clone mismatch on case #${i}`);
    descriptorEqual(actual, expected, `case#${i}`);
  });
  const p = cloneDataCandidate(ownProto);
  assert.deepEqual(Object.getOwnPropertyDescriptor(p, '__proto__'), { value: 'pv', enumerable: true, writable: true, configurable: true });
  assert.equal(Object.keys(p).join(','), '__proto__,a,constructor');
  const n = cloneDataCandidate(nullProto);
  assert.equal(Object.getPrototypeOf(n), Object.prototype);
  assert.deepEqual(Object.keys(n), ['0', '2', '10', 'a', 'z']);
});

// --- rejection parity ------------------------------------------------------
test('rejection parity: identical code+message, getters never invoked', () => {
  const bad = [
    { name: 'getter', make: () => { const o = { ok: 'v' }; Object.defineProperty(o, 'g', { get() { throw new Error('nope'); }, enumerable: true, configurable: true }); return o; } },
    { name: 'symbol-key', make: () => ({ [Symbol('x')]: 1 }) },
    { name: 'non-enumerable', make: () => { const o = { a: 1 }; Object.defineProperty(o, 'b', { value: 2, enumerable: false }); return o; } },
    { name: 'accessor', make: () => { const o = { a: 1 }; Object.defineProperty(o, 'b', { get() { throw new Error('nope'); }, enumerable: true, configurable: true }); return o; } },
    { name: 'sparse', make: () => { const a = [1]; a[3] = 4; return a; } },
    { name: 'array-extra', make: () => { const a = [1]; a.x = 'e'; return a; } },
    { name: 'class-prototype', make: () => new (class X {})() },
    { name: 'non-finite', make: () => ({ n: Infinity }) },
    { name: 'cycle', make: () => { const o = { a: 1 }; o.self = o; return o; } },
    { name: 'depth', make: () => { let c = { leaf: 1 }; for (let i = 0; i < 70; i++) c = { next: c }; return c; } },
    { name: 'non-json', make: () => ({ f: () => {} }) }
  ];
  for (const t of bad) {
    let oe = null; let ne = null;
    try { oracleCloneData(t.make()); } catch (e) { oe = e; }
    try { cloneDataCandidate(t.make()); } catch (e) { ne = e; }
    assert.ok(oe, `oracle must reject ${t.name}`);
    assert.ok(ne, `candidate must reject ${t.name}`);
    assert.equal(ne.code, oe.code, `code mismatch ${t.name}`);
    assert.equal(ne.message, oe.message, `message mismatch ${t.name}`);
  }
});

// --- micro timing (single in-process sample, not a benchmark system) -------
test('copy-loop micro timing: oracle defineProperty loop vs candidate (same traversal)', () => {
  const entity = (i) => ({ id: `e-${i}`, name: `Entity ${i}`, tags: ['a', 'b'], stats: { hp: 10 + i, mp: 3 }, nested: { a: { b: { c: i } } } });
  const sample = { name: 'world-map', revision: 1, entities: Array.from({ length: 400 }, (_, i) => entity(i)), saves: [{ id: 's1', list: [1, 2, 3] }] };
  const rounds = 12;
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) oracleCloneData(sample);
  const oracleMs = Number(process.hrtime.bigint() - t0) / 1e6;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) cloneDataCandidate(sample);
  const candMs = Number(process.hrtime.bigint() - t0) / 1e6;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) cloneDataBase(sample);
  const baseMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`TIMING rounds=${rounds} oracleDefineProperty=${oracleMs.toFixed(3)}ms candidate=${candMs.toFixed(3)}ms traversalSanity=${baseMs.toFixed(3)}ms ratio=${(oracleMs / candMs).toFixed(3)}x`);
  assert.ok(oracleMs > 0 && candMs > 0 && baseMs > 0);
});
