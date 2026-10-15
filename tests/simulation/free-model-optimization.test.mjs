// D4P4 hy4 candidate: cloneData record-copy fast path.
// Contract: d4-dsh-free-model-optimization-v1
//
// The candidate replaces per-key Object.defineProperty with plain assignment on a fresh `{}`,
// keeping defineProperty only for an own `__proto__` key (the one accessor inherited from
// Object.prototype). This test proves semantics against the frozen baseline oracle:
// identical canonicalJson, identical prototype, identical own property descriptors,
// independent copies, zero getter execution, identical error codes/messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_SOURCE = path.resolve(SCRIPT_DIR, '../..');
const BASELINE_SOURCE = process.env.D4P3_BASELINE_SOURCE || path.join(LOCAL_SOURCE, 'artifacts/oracle');
const EXPECTED_BASELINE_SHA = 'c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const load = async (root) => import(pathToFileURL(path.join(root, 'runtime/core/data-contract.mjs')).href);

const shapeOf = (obj) => {
  const out = {};
  for (const key of Reflect.ownKeys(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    out[String(key)] = { value: d.value, writable: !!d.writable, enumerable: !!d.enumerable, configurable: !!d.configurable, hasValue: Object.hasOwn(d, 'value') };
  }
  return out;
};

async function loadPair() {
  const { readFile } = await import('node:fs/promises');
  assert.equal(sha256(await readFile(path.join(BASELINE_SOURCE, 'runtime/core/data-contract.mjs'))), EXPECTED_BASELINE_SHA, 'baseline oracle fingerprint must match frozen baseline');
  const baseline = await load(BASELINE_SOURCE);
  const candidate = await load(LOCAL_SOURCE);
  return { baseline, candidate };
}

function cases() {
  const nullProto = Object.create(null);
  nullProto.z = 100; nullProto.a = 'string-a'; nullProto['0'] = 'zero';

  const ownProto = {};
  Object.defineProperty(ownProto, '__proto__', { value: 'custom-proto-value', enumerable: true, writable: true, configurable: true });
  ownProto.constructor = 'constructor-val';
  ownProto.after = { deep: [1, { __proto__: 'nested-proto' }] };

  const protoOnly = {};
  Object.defineProperty(protoOnly, '__proto__', { value: { hacked: true }, enumerable: true, writable: true, configurable: true });

  const shared = { id: 'shared-data', values: [1, 2, 'three', true, null], meta: { active: true } };
  let deep = { leaf: 'bottom' };
  for (let i = 0; i < 40; i++) deep = { level: i, next: deep };

  return {
    'empty': {},
    'flat': { b: 2, a: 1, z: 'end' },
    'integer-like-keys': { '2': 'two', '10': 'ten', '1': 'one', 'a': 'A', 'b': 'B' },
    'null-prototype': nullProto,
    'own-proto-key': ownProto,
    'own-proto-object-value': protoOnly,
    'shared-dag': { branchA: shared, branchB: shared, list: [shared, shared] },
    'nested-arrays': { rows: [{ id: 'r1', tags: ['a', 'b'] }, { id: 'r2' }], empty: [], nested: [[1, 2], [3, [4, 5]]] },
    'deep-40': deep,
    'scalars': { s: 'x', n: 0, neg: -0, f: 1.5, t: true, f2: false, nil: null, big: Number.MAX_SAFE_INTEGER }
  };
}

test('candidate cloneData: identical canonicalJson, prototype and descriptors vs baseline', async () => {
  const { baseline, candidate } = await loadPair();
  for (const [name, value] of Object.entries(cases())) {
    const oldClone = baseline.cloneData(value);
    const newClone = candidate.cloneData(value);
    assert.equal(baseline.canonicalJson(newClone), baseline.canonicalJson(oldClone), `canonicalJson mismatch on ${name}`);
    assert.equal(Object.getPrototypeOf(newClone), Object.getPrototypeOf(oldClone), `prototype mismatch on ${name}`);
    assert.deepEqual(shapeOf(newClone), shapeOf(oldClone), `descriptor shape mismatch on ${name}`);
    assert.equal(Array.isArray(newClone), Array.isArray(oldClone), `array-ness mismatch on ${name}`);
  }
});

test('candidate cloneData: own __proto__ stays an own data property and never mutates prototype', async () => {
  const { baseline, candidate } = await loadPair();
  const source = {};
  Object.defineProperty(source, '__proto__', { value: 'custom-proto-value', enumerable: true, writable: true, configurable: true });
  source.plain = 1;

  const clone = candidate.cloneData(source);
  assert.equal(Object.getPrototypeOf(clone), Object.prototype, 'clone prototype must stay Object.prototype');
  assert.ok(Object.hasOwn(clone, '__proto__'), '__proto__ must be an own key');
  const d = Object.getOwnPropertyDescriptor(clone, '__proto__');
  assert.deepEqual({ value: d.value, writable: d.writable, enumerable: d.enumerable, configurable: d.configurable },
    { value: 'custom-proto-value', writable: true, enumerable: true, configurable: true }, '__proto__ descriptor must match put() semantics');
  assert.deepEqual(shapeOf(clone), shapeOf(baseline.cloneData(source)), 'descriptor shape must match baseline');
});

test('candidate cloneData: copies are independent from the source at every level', async () => {
  const { candidate } = await loadPair();
  const source = { a: { list: [1, 2] }, b: 'keep' };
  const clone = candidate.cloneData(source);
  assert.notEqual(clone, source);
  assert.notEqual(clone.a, source.a);
  assert.notEqual(clone.a.list, source.a.list);
  clone.a.list.push(3); clone.b = 'changed'; delete clone.a;
  assert.equal(source.a.list.length, 2);
  assert.equal(source.b, 'keep');
  assert.ok(Object.hasOwn(source, 'a'));
});

test('candidate cloneData: rejects the same inputs with identical code/message and never runs getters', async () => {
  const { baseline, candidate } = await loadPair();
  let oldGetters = 0, newGetters = 0;
  const makeGetter = (which) => {
    const obj = { validKey: 'hello' };
    Object.defineProperty(obj, 'getterProp', {
      get() { if (which === 'old') oldGetters++; else newGetters++; return 'executed'; },
      enumerable: true, configurable: true
    });
    return obj;
  };

  const badCases = [
    { name: 'undefined', make: () => undefined },
    { name: 'symbol', make: () => Symbol('sym') },
    { name: 'function', make: () => (() => {}) },
    { name: 'bigint', make: () => 12345678901234567890n },
    { name: 'NaN', make: () => NaN },
    { name: 'Infinity', make: () => Infinity },
    { name: '-Infinity', make: () => -Infinity },
    { name: 'cyclic-object', make: () => { const o = {}; o.self = o; return o; } },
    { name: 'cyclic-array', make: () => { const a = [1]; a.push(a); return a; } },
    { name: 'sparse-array', make: () => { const a = [1, 2]; a[4] = 5; return a; } },
    { name: 'array-extra-property', make: () => { const a = [1, 2]; a.extra = 'forbidden'; return a; } },
    { name: 'record-symbol-key', make: () => ({ [Symbol('forbidden')]: 'val' }) },
    { name: 'record-non-enumerable', make: () => { const o = {}; Object.defineProperty(o, 'nonEnum', { value: 1, enumerable: false }); return o; } },
    { name: 'unsupported-prototype-class', make: () => { class CustomClass {} return new CustomClass(); } },
    { name: 'depth-exceeded', make: () => { let cur = {}; const root = cur; for (let i = 0; i < 66; i++) { cur.n = {}; cur = cur.n; } return root; } },
    { name: 'record-accessor-property', make: (which) => makeGetter(which) }
  ];

  for (const tc of badCases) {
    let oldErr = null, newErr = null;
    try { baseline.cloneData(tc.make('old')); } catch (e) { oldErr = e; }
    try { candidate.cloneData(tc.make('new')); } catch (e) { newErr = e; }
    assert.ok(oldErr, `baseline must throw on ${tc.name}`);
    assert.ok(newErr, `candidate must throw on ${tc.name}`);
    assert.equal(newErr.code, oldErr.code, `error code mismatch on ${tc.name}`);
    assert.equal(newErr.message, oldErr.message, `error message mismatch on ${tc.name}`);
  }
  assert.equal(oldGetters, 0, 'baseline must never invoke getters');
  assert.equal(newGetters, 0, 'candidate must never invoke getters');
});

test('candidate cloneData: array branch still produces dense, identical, independent copies', async () => {
  const { baseline, candidate } = await loadPair();
  const source = [1, 'two', { a: [null, true] }, [], -0];
  const clone = candidate.cloneData(source);
  assert.ok(Array.isArray(clone));
  assert.deepEqual(clone, source);
  assert.equal(baseline.canonicalJson(clone), baseline.canonicalJson(source));
  assert.deepEqual(shapeOf(clone), shapeOf(baseline.cloneData(source)));
  clone[2].a.push('mutated');
  assert.equal(source[2].a.length, 2);
});
