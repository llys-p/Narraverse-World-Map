// D4P4 free-model optimization candidate: cloneData per-key fast path.
// Contract: d4p4-clone-data-fast-path-v1 (single bounded candidate, workbuddy-global/deepseek-v4.1-flash)
//
// Candidate under test (runtime/core/data-contract.mjs, cloneData record branch):
//   for (const key of Object.keys(value).sort()) {
//     const entry = cloneData(value[key], ancestors, depth + 1);
//     if (Object.hasOwn(Object.prototype, key)) put(result, key, entry);
//     else result[key] = entry;
//   }
// Rationale: `result` is a fresh plain `{}`, so assignment is only unsafe for keys that are own
// properties of Object.prototype. `put()` (defineProperty) is still used for those, preserving
// the baseline's prototype-pollution guarantee. This removes a defineProperty per key on the hot
// path. `put` stays exported and unchanged (command-engine.mjs:128 still uses it for dynamic keys).
//
// This test proves OBSERVATIONAL EQUIVALENCE against the frozen baseline oracle, not speed.
// Speed is measured separately by the controller; the oracle path here is the candidate's own
// absolute artifacts/oracle directory (frozen baseline SHA c6f3bb2c...).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_SOURCE = path.resolve(SCRIPT_DIR, '../..');
// Standard D4P3_BASELINE_SOURCE for this candidate = its own absolute artifacts/oracle dir.
const BASELINE_SOURCE = process.env.D4P3_BASELINE_SOURCE ||
  path.join(LOCAL_SOURCE, 'artifacts', 'oracle');
const REFERENCE_RUNTIME_DATA = process.env.D4P3_REFERENCE_RUNTIME_DATA ||
  'D:\\Narraverse-World-Map\\hds-d4-cp1a-review\\artifacts\\world-runtime-d4-cp3-controller\\CP3-FULL-19796-1791960566578\\runtime-data';

const EXPECTED_BASELINE_SHA = 'c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f';

const ORIGINAL_ARCHIVE_SHA = {
  'service-commit-r170.json': '3bf39f7cf0b9e7adb5a39a1969dbf0bc111ec20d18fb5b4b7e92c907969450dd',
  'service-commit-r182.json': 'd2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c'
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const loadOld = () => import(pathToFileURL(path.join(BASELINE_SOURCE, 'runtime/core/data-contract.mjs')).href);
const loadNew = () => import(pathToFileURL(path.join(LOCAL_SOURCE, 'runtime/core/data-contract.mjs')).href);

// Deep structural fingerprint: own keys, key order, descriptor flags, prototype identity and
// array-ness at every level. Two clones are equivalent iff these strings are equal.
function fingerprint(value) {
  if (value === null || typeof value !== 'object') {
    return `prim:${typeof value}:${Object.is(value, -0) ? '-0' : String(value)}`;
  }
  const proto = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  const parts = keys.map((key) => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    const flag = `${d.enumerable ? 'e' : '-'}${d.writable ? 'w' : '-'}${d.configurable ? 'c' : '-'}`;
    const inner = typeof d.value === 'object' && d.value !== null ? fingerprint(d.value) : String(d.value);
    return `${JSON.stringify(String(key))}=${flag}:${inner}`;
  });
  const protoName = proto === Object.prototype ? 'Object.prototype'
    : proto === null ? 'null'
      : Array.isArray(value) ? 'Array.prototype' : 'other';
  return `${Array.isArray(value) ? 'arr' : 'rec'}[${protoName}]{${parts.join('|')}}`;
}

function validCases() {
  const shared = { id: 'shared', values: [1, 2, 'three', true, null], meta: { active: true } };
  const nullProto = Object.create(null);
  nullProto.z = 100; nullProto.a = 'string-a'; nullProto['0'] = 'zero';
  const ownProto = {};
  Object.defineProperty(ownProto, '__proto__', { value: 'custom-proto', enumerable: true, writable: true, configurable: true });
  ownProto.constructor = 'constructor-val';
  let deep = { leaf: 'bottom' };
  for (let i = 0; i < 40; i++) deep = { level: i, next: deep };
  return [
    null, true, false, '', 'simple', 'unicode: 🌲 🐺 \u0000 \t \n \\ " /',
    0, -0, 1, -1, 123456789, 0.0000001, 1e20, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
    [], [null], [true, false, 'str', 123, -0], [[1, 2], [3, [4, 5]]],
    {}, { a: 1 }, { b: 2, a: 1 }, { z: 'end', middle: 0, a: 'start' },
    // Integer-like keys: insertion order must not leak into the clone.
    { '2': 'two', '10': 'ten', '1': 'one', a: 'A', b: 'B' },
    { '0': 0, '1': 1, '2': 2, '10': 10, '100': 100, '20': 20 },
    nullProto, ownProto,
    // Keys that collide with Object.prototype members: the fast path must still produce own data props.
    { toString: 'ts', valueOf: 'vo', constructor: 'c', hasOwnProperty: 'h', isPrototypeOf: 'ip', propertyIsEnumerable: 'pe', toLocaleString: 'tls' },
    { __defineGetter__: 1, __defineSetter__: 2, __lookupGetter__: 3, __lookupSetter__: 4 },
    { length: 3, name: 'n', prototype: 'p' },
    { branchA: shared, branchB: shared, list: [shared, shared] },
    deep
  ];
}

test('D4P4 Step 1: baseline oracle fingerprint matches the frozen baseline SHA', async () => {
  const oraclePath = path.join(BASELINE_SOURCE, 'runtime/core/data-contract.mjs');
  const oracleBuf = await fs.readFile(oraclePath);
  assert.equal(sha256(oracleBuf), EXPECTED_BASELINE_SHA,
    `Oracle data-contract.mjs SHA must match frozen baseline c6f3bb2c... (got ${sha256(oracleBuf)})`);

  const localBuf = await fs.readFile(path.join(LOCAL_SOURCE, 'runtime/core/data-contract.mjs'));
  assert.notEqual(sha256(localBuf), EXPECTED_BASELINE_SHA,
    'Local data-contract.mjs must differ from the frozen baseline (candidate applied)');
});

test('D4P4 Step 1: cloneData produces descriptor-identical clones for all valid cases', async () => {
  const { cloneData: oldClone } = await loadOld();
  const { cloneData: newClone } = await loadNew();
  const cases = validCases();
  for (let i = 0; i < cases.length; i++) {
    const expected = fingerprint(oldClone(cases[i]));
    const actual = fingerprint(newClone(cases[i]));
    assert.equal(actual, expected, `cloneData fingerprint mismatch on valid case #${i}`);
  }
});

test('D4P4 Step 1: cloneData preserves prototype-pollution safety under hostile Object.prototype', async () => {
  const { cloneData: oldClone } = await loadOld();
  const { cloneData: newClone } = await loadNew();

  const runCase = (clone, setup) => {
    setup();
    let thrown = null;
    let result = null;
    try { result = clone({ probeKey: 'from-source', normal: 1 }); } catch (err) { thrown = `${err.constructor.name}: ${err.message}`; }
    const outcome = {
      thrown,
      own: result ? Object.hasOwn(result, 'probeKey') : null,
      value: result ? result.probeKey : null,
      ownNormal: result ? Object.hasOwn(result, 'normal') : null,
      protoIntact: result ? Object.getPrototypeOf(result) === Object.prototype : null
    };
    delete Object.prototype.probeKey;
    return outcome;
  };

  // 1. Inherited accessor on Object.prototype: must not run, must still yield an own data property.
  let setterRuns = 0;
  const withSetter = () => Object.defineProperty(Object.prototype, 'probeKey', {
    set() { setterRuns++; }, configurable: true
  });
  setterRuns = 0;
  const oldSetter = runCase(oldClone, withSetter);
  const oldSetterRuns = setterRuns;
  setterRuns = 0;
  const newSetter = runCase(newClone, withSetter);
  const newSetterRuns = setterRuns;
  assert.deepEqual(newSetter, oldSetter, 'inherited-setter outcome must match baseline');
  assert.equal(newSetterRuns, oldSetterRuns, 'inherited setter must run the same number of times as baseline');
  assert.equal(newSetterRuns, 0, 'candidate must not invoke the inherited setter');

  // 2. Non-writable inherited data property: plain assignment would throw a TypeError in strict mode.
  const withReadOnly = () => Object.defineProperty(Object.prototype, 'probeKey', {
    value: 'locked', writable: false, configurable: true
  });
  const oldRo = runCase(oldClone, withReadOnly);
  const newRo = runCase(newClone, withReadOnly);
  assert.deepEqual(newRo, oldRo, 'non-writable inherited property outcome must match baseline');
  assert.equal(newRo.thrown, null, 'candidate must not throw where the baseline does not');
  assert.equal(newRo.own, true, 'candidate must create an own data property');
  assert.equal(newRo.value, 'from-source', 'candidate must carry the source value, not the inherited one');

  assert.equal(Object.hasOwn(Object.prototype, 'probeKey'), false, 'test must clean up Object.prototype');
});

test('D4P4 Step 1: cloneData throws identical error code and message on invalid cases', async () => {
  const { cloneData: oldClone } = await loadOld();
  const { cloneData: newClone } = await loadNew();

  const badCases = [
    ['undefined', () => undefined],
    ['symbol', () => Symbol('sym')],
    ['function', () => (() => {})],
    ['bigint', () => 12345678901234567890n],
    ['NaN', () => NaN],
    ['Infinity', () => Infinity],
    ['-Infinity', () => -Infinity],
    ['cyclic-object', () => { const o = {}; o.self = o; return o; }],
    ['cyclic-array', () => { const a = [1]; a.push(a); return a; }],
    ['sparse-array', () => { const a = [1, 2]; a[4] = 5; return a; }],
    ['array-extra-property', () => { const a = [1, 2]; a.extra = 'x'; return a; }],
    ['record-symbol-key', () => ({ [Symbol('forbidden')]: 'val' })],
    ['record-non-enumerable', () => { const o = {}; Object.defineProperty(o, 'n', { value: 1, enumerable: false }); return o; }],
    ['unsupported-prototype-class', () => { class C {} return new C(); }],
    ['depth-exceeded', () => { let cur = {}; const root = cur; for (let i = 0; i < 66; i++) { cur.n = {}; cur = cur.n; } return root; }],
    ['record-accessor-property', () => { const o = { valid: 1 }; Object.defineProperty(o, 'g', { get() { return 'x'; }, enumerable: true, configurable: true }); return o; }],
    ['array-accessor-element', () => { const a = [1, 2]; Object.defineProperty(a, '1', { get() { return 'x'; }, enumerable: true, configurable: true }); return a; }]
  ];

  for (const [name, make] of badCases) {
    let oldErr = null, newErr = null;
    try { oldClone(make()); } catch (e) { oldErr = e; }
    try { newClone(make()); } catch (e) { newErr = e; }
    assert.ok(oldErr, `baseline must throw on ${name}`);
    assert.ok(newErr, `candidate must throw on ${name}`);
    assert.equal(newErr.code, oldErr.code, `error code mismatch on ${name}`);
    assert.equal(newErr.message, oldErr.message, `error message mismatch on ${name}`);
  }
});

test('D4P4 Step 1: real archive saves clone to identical fingerprints', async () => {
  const { cloneData: oldClone } = await loadOld();
  const { cloneData: newClone } = await loadNew();

  for (const [filename, expectedSha] of Object.entries(ORIGINAL_ARCHIVE_SHA)) {
    const rawBuf = await fs.readFile(path.join(REFERENCE_RUNTIME_DATA, filename));
    assert.equal(sha256(rawBuf), expectedSha, `raw archive ${filename} must match frozen original SHA`);
    const parsed = JSON.parse(rawBuf.toString('utf8'));
    const oldOut = oldClone(parsed);
    const newOut = newClone(parsed);
    assert.equal(fingerprint(newOut), fingerprint(oldOut), `cloneData fingerprint mismatch on real save ${filename}`);
    assert.equal(JSON.stringify(newOut), JSON.stringify(oldOut), `cloneData JSON mismatch on real save ${filename}`);
  }
});

test('D4P4 Step 1: put() stays exported and defineProperty-based (command-engine dynamic keys)', async () => {
  const { put } = await loadNew();
  assert.equal(typeof put, 'function', 'put must remain exported');
  const target = {};
  put(target, '__proto__', 'v');
  const d = Object.getOwnPropertyDescriptor(target, '__proto__');
  assert.ok(d, 'put must create an own property even for __proto__');
  assert.equal(d.value, 'v');
  assert.equal(d.enumerable, true);
  assert.equal(d.writable, true);
  assert.equal(d.configurable, true);
  assert.equal(Object.getPrototypeOf(target), Object.prototype, 'put must not mutate the prototype');
});
