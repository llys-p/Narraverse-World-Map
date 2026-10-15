// D4P3 canonical-json equivalence and baseline comparison test.
// Contract: d4-canonical-encoding-performance-v1
//
// 1. Loads independent baseline data-contract from D:\Narraverse-World-Map-d4-long-history
//    and verifies its exact baseline SHA256.
// 2. Compares old vs new canonicalJson on comprehensive valid and invalid cases.
// 3. Verifies zero getter execution and identical error codes.
// 4. Parses the 8 real post-war archive saves and asserts byte-for-byte identical canonicalJson.
// 5. Directly checks payloadBudget boundary behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_SOURCE = path.resolve(SCRIPT_DIR, '../..');
const BASELINE_SOURCE = process.env.D4P3_BASELINE_SOURCE || 'D:\\Narraverse-World-Map-d4-long-history';
const REFERENCE_RUNTIME_DATA = process.env.D4P3_REFERENCE_RUNTIME_DATA ||
  'D:\\Narraverse-World-Map\\hds-d4-cp1a-review\\artifacts\\world-runtime-d4-cp3-controller\\CP3-FULL-19796-1791960566578\\runtime-data';

const EXPECTED_BASELINE_SHA = 'c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f';

const ORIGINAL_ARCHIVE_SHA = {
  'service-commit-r0.json': '85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b',
  'service-commit-r1.json': '01055647588a97c2cf52586c945de35dafbedce553e6cba039fa362fab1ec682',
  'service-commit-r145.json': '867ce2730c7fb01cc96f5451e4c690ab836ebe2b64b002da0fd62f9df3267e1e',
  'service-commit-r157.json': '7670a2007b4e4aaf679eec5d83ac37b20037cea90abb4862bd895a0d4000792b',
  'service-commit-r158.json': '86c08be81faed693d9b33d58ca953c6c7abf8e033de6ae87d688ae50822dc73e',
  'service-commit-r164.json': '812fb209293b49beaa55f8d1d32da2c4d345dfa6cb6d53683b2ee4c35dcd786c',
  'service-commit-r170.json': '3bf39f7cf0b9e7adb5a39a1969dbf0bc111ec20d18fb5b4b7e92c907969450dd',
  'service-commit-r182.json': 'd2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c'
};

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

test('D4P3 Step 1: verify independent baseline oracle source fingerprint', async () => {
  const baselineFilePath = path.join(BASELINE_SOURCE, 'runtime/core/data-contract.mjs');
  const baselineBuf = await fs.readFile(baselineFilePath);
  const baselineSha = sha256(baselineBuf);
  assert.equal(baselineSha, EXPECTED_BASELINE_SHA, `Baseline data-contract.mjs SHA must match frozen baseline`);

  const localFilePath = path.join(LOCAL_SOURCE, 'runtime/core/data-contract.mjs');
  const localBuf = await fs.readFile(localFilePath);
  const localSha = sha256(localBuf);
  assert.notEqual(localSha, baselineSha, `Local data-contract.mjs must contain the D4P3 unified traversal optimization`);
});

test('D4P3 Step 1: synthetic valid cases produce byte-for-byte identical canonicalJson', async () => {
  const { canonicalJson: oldCanonical } = await import(pathToFileURL(path.join(BASELINE_SOURCE, 'runtime/core/data-contract.mjs')).href);
  const { canonicalJson: newCanonical } = await import(pathToFileURL(path.join(LOCAL_SOURCE, 'runtime/core/data-contract.mjs')).href);

  const sharedObj = { id: 'shared-data', values: [1, 2, 'three', true, null], meta: { active: true } };
  const nullProto = Object.create(null);
  nullProto.z = 100;
  nullProto.a = 'string-a';
  nullProto['0'] = 'zero';

  const ownProtoObj = {};
  Object.defineProperty(ownProtoObj, '__proto__', { value: 'custom-proto-value', enumerable: true, writable: true, configurable: true });
  ownProtoObj.constructorKey = 'constructor-val';

  const validCases = [
    // Primitives
    null,
    true,
    false,
    '',
    'simple string',
    'unicode characters: 🌲 🐺 🛡️ \u0000 \u001f \t \n \r \f \\ " /',
    0,
    -0,
    1,
    -1,
    123456789,
    -987654321,
    0.0000001,
    1e20,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,

    // Arrays
    [],
    [null],
    [true, false, 'str', 123, -0],
    [[1, 2], [3, [4, 5]]],

    // Records
    {},
    { a: 1 },
    { b: 2, a: 1 },
    { z: 'end', middle: 0, a: 'start' },

    // Integer-like keys vs alphabetical keys (must follow alphabetical sort: '1' < '10' < '2')
    { '2': 'two', '10': 'ten', '1': 'one', 'a': 'A', 'b': 'B' },
    { '0': 0, '1': 1, '2': 2, '10': 10, '100': 100, '20': 20 },

    // Null prototype and own __proto__ / constructor properties
    nullProto,
    ownProtoObj,

    // Shared references (DAG, non-cyclic)
    { branchA: sharedObj, branchB: sharedObj, list: [sharedObj, sharedObj] },

    // Deep nested structure (within depth <= 64)
    (() => {
      let cur = { leaf: 'bottom' };
      for (let i = 0; i < 40; i++) cur = { level: i, next: cur };
      return cur;
    })()
  ];

  for (let i = 0; i < validCases.length; i++) {
    const item = validCases[i];
    const oldOut = oldCanonical(item);
    const newOut = newCanonical(item);
    assert.equal(newOut, oldOut, `Mismatch on valid test case #${i}`);
  }
});

test('D4P3 Step 1: invalid cases throw identical error code, message and never invoke getters', async () => {
  const { canonicalJson: oldCanonical } = await import(pathToFileURL(path.join(BASELINE_SOURCE, 'runtime/core/data-contract.mjs')).href);
  const { canonicalJson: newCanonical } = await import(pathToFileURL(path.join(LOCAL_SOURCE, 'runtime/core/data-contract.mjs')).href);

  let oldGetterCount = 0;
  let newGetterCount = 0;

  const makeRecordGetter = (counter) => {
    const obj = { validKey: 'hello' };
    Object.defineProperty(obj, 'getterProp', {
      get() {
        if (counter === 'old') oldGetterCount++;
        else newGetterCount++;
        return 'executed';
      },
      enumerable: true,
      configurable: true
    });
    return obj;
  };

  let oldArrayGetterCount = 0;
  let newArrayGetterCount = 0;

  const makeArrayGetter = (counter) => {
    const arr = [1, 2];
    Object.defineProperty(arr, '1', {
      get() {
        if (counter === 'old') oldArrayGetterCount++;
        else newArrayGetterCount++;
        return 'array-getter';
      },
      enumerable: true,
      configurable: true
    });
    return arr;
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
    { name: 'record-accessor-property', make: (mode) => makeRecordGetter(mode) },
    { name: 'array-accessor-element', make: (mode) => makeArrayGetter(mode) }
  ];

  for (const tc of badCases) {
    let oldErr = null, newErr = null;
    try { oldCanonical(tc.make('old')); } catch (e) { oldErr = e; }
    try { newCanonical(tc.make('new')); } catch (e) { newErr = e; }

    assert.ok(oldErr, `Baseline must throw on ${tc.name}`);
    assert.ok(newErr, `New canonicalJson must throw on ${tc.name}`);
    assert.equal(newErr.code, oldErr.code, `Error code mismatch on ${tc.name}: expected ${oldErr.code}, got ${newErr.code}`);
    assert.equal(newErr.message, oldErr.message, `Error message mismatch on ${tc.name}: expected ${oldErr.message}, got ${newErr.message}`);
  }

  // Verify zero getters were invoked
  assert.equal(oldGetterCount, 0, 'Baseline must never invoke getters');
  assert.equal(newGetterCount, 0, 'New canonicalJson must never invoke getters');
  assert.equal(oldArrayGetterCount, 0, 'Baseline must never invoke array getters');
  assert.equal(newArrayGetterCount, 0, 'New canonicalJson must never invoke array getters');
});

test('D4P3 Step 2: real 8 post-war archive saves produce identical canonicalJson signatures', async () => {
  const { canonicalJson: oldCanonical } = await import(pathToFileURL(path.join(BASELINE_SOURCE, 'runtime/core/data-contract.mjs')).href);
  const { canonicalJson: newCanonical } = await import(pathToFileURL(path.join(LOCAL_SOURCE, 'runtime/core/data-contract.mjs')).href);

  for (const [filename, expectedSha] of Object.entries(ORIGINAL_ARCHIVE_SHA)) {
    const filePath = path.join(REFERENCE_RUNTIME_DATA, filename);
    const rawBuf = await fs.readFile(filePath);
    assert.equal(sha256(rawBuf), expectedSha, `Raw archive file ${filename} must match frozen original SHA`);

    const parsed = JSON.parse(rawBuf.toString('utf8'));
    const oldEncoded = oldCanonical(parsed);
    const newEncoded = newCanonical(parsed);

    assert.equal(newEncoded, oldEncoded, `Canonical JSON mismatch on real save file ${filename}`);
    assert.equal(sha256(Buffer.from(newEncoded, 'utf8')), sha256(Buffer.from(oldEncoded, 'utf8')), `SHA256 mismatch on ${filename}`);
  }
});

test('D4P3 Step 2: payloadBudget boundary check with new canonicalJson', async () => {
  const { payloadBudget, MAX_PAYLOAD_BYTES } = await import(pathToFileURL(path.join(LOCAL_SOURCE, 'runtime/core/data-contract.mjs')).href);

  // Payload within budget: passes cleanly
  const validPayload = { text: 'small payload', numbers: [1, 2, 3] };
  assert.doesNotThrow(() => payloadBudget(validPayload));

  // Boundary payload: oversized payload > 65536 bytes
  const largePayload = { largeText: 'x'.repeat(MAX_PAYLOAD_BYTES + 100) };
  assert.throws(() => payloadBudget(largePayload), (err) => {
    return err.code === 'LIMIT_EXCEEDED' && err.message === 'Payload budget exceeded';
  });
});
