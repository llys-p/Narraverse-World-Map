import test from 'node:test';
import assert from 'node:assert/strict';
import { denseArray, cloneData, canonicalJson } from '../../runtime/core/data-contract.mjs';

// Number keys are converted by ToPropertyKey to the same index strings.
test('Issue #3 numeric descriptor keys keep arrays and proxy trap keys equivalent', () => {
  const data = Array.from({ length: 1024 }, (_, i) => ({ id: 'e-' + i, tick: i }));
  assert.doesNotThrow(() => denseArray(data));
  assert.deepEqual(cloneData(data), data);
  assert.equal(canonicalJson(data), canonicalJson(cloneData(data)));
  const seen = [];
  const wrapped = new Proxy([11, 22, 33], {
    getOwnPropertyDescriptor(target, key) {
      seen.push(key);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  denseArray(wrapped);
  assert.deepEqual(seen, ['0', '1', '2']);
});
test('Issue #3 sparse, extra, symbol and accessor arrays are still rejected', () => {
  const sparse = [1, , 3];
  const extra = [1, 2]; extra.note = 3;
  const hidden = [1, 2]; Object.defineProperty(hidden, 'hidden', { value: true });
  const symbol = [1]; symbol[Symbol('extra')] = true;
  let getterRuns = 0;
  const accessor = [1, 2];
  Object.defineProperty(accessor, '1', { enumerable: true, get() { getterRuns++; return 2; } });
  for (const value of [sparse, extra, hidden, symbol, accessor]) {
    for (const fn of [denseArray, cloneData, canonicalJson])
      assert.throws(() => fn(value), { code: 'INVALID_INPUT' });
  }
  assert.equal(getterRuns, 0);
});
