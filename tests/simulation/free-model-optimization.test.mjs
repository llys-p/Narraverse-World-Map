// D4P4 step5 candidate (free-model optimization): cloneData single-pass fast path.
// Scope: prove the optimized cloneData in runtime/core/data-contract.mjs is behaviourally
// identical to the frozen baseline oracle (D4P3 BASELINE_SOURCE) on real archive saves and on
// the getter/descriptor/prototype/cycle/sparse/depth boundaries. No existing test is modified.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_SOURCE = path.resolve(SCRIPT_DIR, '../..');
const BASELINE_SOURCE = process.env.D4P3_BASELINE_SOURCE || path.resolve(LOCAL_SOURCE, 'artifacts/oracle');
const REFERENCE_RUNTIME_DATA = process.env.D4P3_REFERENCE_RUNTIME_DATA ||
  'D:\\Narraverse-World-Map\\hds-d4-cp1a-review\\artifacts\\world-runtime-d4-cp3-controller\\CP3-FULL-19796-1791960566578\\runtime-data';

const load = (dir, name) => import(pathToFileURL(path.join(dir, 'runtime/core/data-contract.mjs')).href).then((m) => m[name]);

const ARCHIVES = [
  'service-commit-r0.json', 'service-commit-r1.json', 'service-commit-r145.json',
  'service-commit-r157.json', 'service-commit-r158.json', 'service-commit-r164.json',
  'service-commit-r170.json', 'service-commit-r182.json'
];

function descriptorEqual(actual, expected, where) {
  assert.equal(Object.getPrototypeOf(actual), Object.getPrototypeOf(expected), `prototype differs at ${where}`);
  assert.deepEqual(Reflect.ownKeys(actual), Reflect.ownKeys(expected), `own key order differs at ${where}`);
  for (const key of Reflect.ownKeys(expected)) {
    const a = Object.getOwnPropertyDescriptor(actual, key);
    const b = Object.getOwnPropertyDescriptor(expected, key);
    assert.ok(a, `missing own property ${String(key)} at ${where}`);
    assert.deepEqual(a, b, `descriptor differs at ${where}.${String(key)}`);
    if (a && b && 'value' in a && 'value' in b && a.value !== null && typeof a.value === 'object') {
      descriptorEqual(a.value, b.value, `${where}.${String(key)}`);
    }
  }
}

test('step5 candidate: cloneData matches baseline oracle on the 8 archive saves', async () => {
  const newClone = await load(LOCAL_SOURCE, 'cloneData');
  const oldClone = await load(BASELINE_SOURCE, 'cloneData');
  for (const file of ARCHIVES) {
    const parsed = JSON.parse(await fs.readFile(path.join(REFERENCE_RUNTIME_DATA, file), 'utf8'));
    const expected = oldClone(parsed);
    const actual = newClone(parsed);
    assert.deepStrictEqual(actual, expected, `clone mismatch on ${file}`);
    descriptorEqual(actual, expected, file);
    assert.notEqual(actual, parsed, `clone must not return the input on ${file}`);
  }
});

test('step5 candidate: prototypes, own __proto__, null prototype, key order, -0 and shared refs', async () => {
  const newClone = await load(LOCAL_SOURCE, 'cloneData');
  const oldClone = await load(BASELINE_SOURCE, 'cloneData');

  const nullProto = Object.create(null);
  nullProto.z = 100;
  nullProto.a = 'string-a';
  nullProto['0'] = 'zero';
  nullProto['10'] = 'ten';
  nullProto['2'] = 'two';

  const ownProto = {};
  Object.defineProperty(ownProto, '__proto__', { value: 'custom-proto-value', enumerable: true, writable: true, configurable: true });
  ownProto.constructor = 'constructor-val';
  ownProto.a = 1;

  const setterProto = {};
  Object.defineProperty(setterProto, 'trap', {
    set() { throw new Error('inherited setter must not run'); },
    get() { return 'inherited'; },
    enumerable: true,
    configurable: true
  });
  assert.throws(() => oldClone(setterProto), { code: 'INVALID_INPUT' }, 'oracle rejects accessor record');
  assert.throws(() => newClone(setterProto), { code: 'INVALID_INPUT' }, 'candidate rejects accessor record');

  // A record with a non-Object.prototype prototype is rejected by record(), so inherited setters
  // (and inherited __proto__ semantics) are unreachable inside cloneData. Assert that gate holds
  // identically on both sides instead of pretending such input can be cloned.
  const setterFree = { __proto__: { trap: 'inherited' }, trap: 'own-value' };
  assert.throws(() => oldClone(setterFree), { code: 'INVALID_INPUT' });
  assert.throws(() => newClone(setterFree), { code: 'INVALID_INPUT' });
  const nonObjectProto = Object.assign(Object.create({ trap: 'inherited' }), { own: 1 });
  assert.throws(() => oldClone(nonObjectProto), { code: 'INVALID_INPUT' });
  assert.throws(() => newClone(nonObjectProto), { code: 'INVALID_INPUT' });

  // data-only records that record() accepts
  const dataOne = { a: 1 };
  const dataTwo = Object.create(dataOne);
  dataTwo.b = 2;
  assert.throws(() => oldClone(dataTwo), { code: 'INVALID_INPUT' }, 'oracle rejects non-Object.prototype record');
  assert.throws(() => newClone(dataTwo), { code: 'INVALID_INPUT' }, 'candidate rejects non-Object.prototype record');

  const shared = { id: 'shared', values: [1, 2] };
  const cases = [
    {},
    { b: 2, a: 1 },
    nullProto,
    ownProto,
    [0, -0, 1, 'two', true, null, [[1]]],
    { branchA: shared, branchB: shared, list: [shared, shared] }
  ];
  for (let i = 0; i < cases.length; i++) {
    const expected = oldClone(cases[i]);
    const actual = newClone(cases[i]);
    assert.deepStrictEqual(actual, expected, `clone mismatch on synthetic case #${i}`);
    descriptorEqual(actual, expected, `synthetic#${i}`);
  }

  // own __proto__ must stay an own enumerable data property, not the Object.prototype accessor
  const protoClone = newClone(ownProto);
  assert.deepEqual(Object.getOwnPropertyDescriptor(protoClone, '__proto__'), {
    value: 'custom-proto-value', enumerable: true, writable: true, configurable: true
  });
  assert.equal(Object.keys(protoClone).join(','), '__proto__,a,constructor');

  // null-prototype record is cloned through a normal {} literal, so the clone's prototype is
  // Object.prototype on both sides (record() allows prototype === null as input)
  const nullClone = newClone(nullProto);
  assert.equal(Object.getPrototypeOf(nullClone), Object.prototype);
  assert.deepEqual(Object.keys(nullClone), ['0', '2', '10', 'a', 'z']);
  const nullCloneOld = oldClone(nullProto);
  assert.deepEqual(Object.keys(nullCloneOld), ['0', '2', '10', 'a', 'z']);
});

test('step5 candidate: clones are independent deep copies', async () => {
  const newClone = await load(LOCAL_SOURCE, 'cloneData');
  const source = { list: [{ n: 1 }, { n: 2 }], meta: { deep: { k: 'v' } } };
  const clone = newClone(source);
  clone.list[0].n = 99;
  clone.meta.deep.k = 'mutated';
  clone.added = true;
  assert.deepStrictEqual(source, { list: [{ n: 1 }, { n: 2 }], meta: { deep: { k: 'v' } } });
  assert.equal(Object.hasOwn(clone, 'added'), true);
  assert.equal(Object.hasOwn(source, 'added'), false);
});

test('step5 candidate: rejection semantics and never-invoked getters are unchanged', async () => {
  const newClone = await load(LOCAL_SOURCE, 'cloneData');
  const oldClone = await load(BASELINE_SOURCE, 'cloneData');

  let newGetterCount = 0;
  const getterRecord = () => {
    const obj = { validKey: 'hello' };
    Object.defineProperty(obj, 'getterProp', {
      get() { newGetterCount++; return 'executed'; },
      enumerable: true,
      configurable: true
    });
    return obj;
  };
  const bad = [
    { name: 'getter', make: () => getterRecord() },
    { name: 'symbol-key', make: () => ({ [Symbol('x')]: 1 }) },
    { name: 'non-enumerable', make: () => { const o = { a: 1 }; Object.defineProperty(o, 'b', { value: 2, enumerable: false }); return o; } },
    { name: 'accessor', make: () => { const o = { a: 1 }; Object.defineProperty(o, 'b', { get() { throw new Error('must not run'); }, enumerable: true, configurable: true }); return o; } },
    { name: 'sparse', make: () => { const a = [1]; a[3] = 4; return a; } },
    { name: 'array-extra', make: () => { const a = [1]; a.extra = 'x'; return a; } },
    { name: 'class-prototype', make: () => new (class X {})() },
    { name: 'non-finite', make: () => ({ n: Infinity }) },
    { name: 'cycle', make: () => { const o = { a: 1 }; o.self = o; return o; } },
    { name: 'depth', make: () => { let cur = { leaf: 1 }; for (let i = 0; i < 70; i++) cur = { next: cur }; return cur; } },
    { name: 'non-json', make: () => ({ f: () => {} }) }
  ];
  for (const tc of bad) {
    let oldErr = null;
    let newErr = null;
    try { oldClone(tc.make()); } catch (e) { oldErr = e; }
    try { newClone(tc.make()); } catch (e) { newErr = e; }
    assert.ok(oldErr, `oracle must reject ${tc.name}`);
    assert.ok(newErr, `candidate must reject ${tc.name}`);
    assert.equal(newErr.code, oldErr.code, `code mismatch on ${tc.name}`);
    assert.equal(newErr.message, oldErr.message, `message mismatch on ${tc.name}`);
  }
  assert.equal(newGetterCount, 0, 'candidate cloneData must never invoke getters');
});
