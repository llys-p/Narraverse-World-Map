// R2 prototype — hy4. NOT production code; lives in artifacts/free-model-optimization/r2/.
// Behavior/performance reference (read-only oracle, frozen baseline):
//   artifacts/oracle/runtime/core/data-contract.mjs
//   SHA256 c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f
//   (git baseline 2936233426e990857f3c88a39ad58623832419fd)
// All validation helpers (record/denseArray/put/MAX_EVENTS) are imported from the oracle so the
// four variants differ ONLY in the record-copy step.
import * as base from '../../oracle/runtime/core/data-contract.mjs';

const { record, denseArray, put, MAX_EVENTS } = base;

// V0 — baseline: per-key Object.defineProperty (oracle behavior).
export function cloneBaseline(value, ancestors = new Set(), depth = 0) {
  if (depth > 64) throw Object.assign(new Error('Data nesting budget exceeded'), { code: 'LIMIT_EXCEEDED' });
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Object.assign(new Error('Non-finite number'), { code: 'INVALID_INPUT' });
    return value === 0 ? 0 : value;
  }
  if (typeof value !== 'object') throw Object.assign(new Error('Non-JSON data'), { code: 'INVALID_INPUT' });
  if (ancestors.has(value)) throw Object.assign(new Error('Cyclic data'), { code: 'INVALID_INPUT' });
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    denseArray(value, MAX_EVENTS);
    result = value.map((entry) => cloneBaseline(entry, ancestors, depth + 1));
  } else {
    record(value); result = {};
    for (const key of Object.keys(value).sort()) put(result, key, cloneBaseline(value[key], ancestors, depth + 1));
  }
  ancestors.delete(value);
  return result;
}

const recurse = (fn, value, ancestors, depth) => fn(value, ancestors, depth + 1);

function shared(value, ancestors, depth, makeResult) {
  if (depth > 64) throw Object.assign(new Error('Data nesting budget exceeded'), { code: 'LIMIT_EXCEEDED' });
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Object.assign(new Error('Non-finite number'), { code: 'INVALID_INPUT' });
    return value === 0 ? 0 : value;
  }
  if (typeof value !== 'object') throw Object.assign(new Error('Non-JSON data'), { code: 'INVALID_INPUT' });
  if (ancestors.has(value)) throw Object.assign(new Error('Cyclic data'), { code: 'INVALID_INPUT' });
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    denseArray(value, MAX_EVENTS);
    result = value.map((entry) => recurse(SELF, entry, ancestors, depth));
  } else {
    record(value);
    result = makeResult(value, ancestors, depth);
  }
  ancestors.delete(value);
  return result;
}
let SELF = cloneBaseline;
const defineVariant = (impl) => { SELF = impl; return impl; };

// V1 — R1 hy4 candidate (REJECTED): plain assignment, only literal '__proto__' special-cased.
export const cloneR1 = defineVariant(function cloneR1(value, ancestors = new Set(), depth = 0) {
  return shared(value, ancestors, depth, (v, anc, d) => {
    const result = {};
    for (const key of Object.keys(v).sort()) {
      const entry = recurse(cloneR1, v[key], anc, d);
      if (key === '__proto__') put(result, key, entry); else result[key] = entry;
    }
    return result;
  });
});

// V2 — DeepSeek mechanism (reuse reference): guard on "key is an own property of Object.prototype".
const OBJECT_PROTOTYPE_OWN = new Set(Reflect.ownKeys(Object.prototype));
export const cloneDeepSeekStyle = defineVariant(function cloneDeepSeekStyle(value, ancestors = new Set(), depth = 0) {
  return shared(value, ancestors, depth, (v, anc, d) => {
    const result = {};
    for (const key of Object.keys(v).sort()) {
      const entry = recurse(cloneDeepSeekStyle, v[key], anc, d);
      if (OBJECT_PROTOTYPE_OWN.has(key)) put(result, key, entry); else result[key] = entry;
    }
    return result;
  });
});

// V3 — R2 hy4 proposal: build sorted [key, value] pairs and let Object.fromEntries create them.
// Object.fromEntries uses CreateDataPropertyOrThrow (define semantics per ECMA-262), so it
// creates own enumerable/writable/configurable data properties and NEVER consults inherited
// setters or inherited read-only attributes — for ANY key, not just '__proto__'.
export const cloneFromEntries = defineVariant(function cloneFromEntries(value, ancestors = new Set(), depth = 0) {
  return shared(value, ancestors, depth, (v, anc, d) => {
    const keys = Object.keys(v).sort();
    const entries = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      entries[i] = [keys[i], recurse(cloneFromEntries, v[keys[i]], anc, d)];
    }
    return Object.fromEntries(entries);
  });
});

export const VARIANTS = [
  { name: 'V0-baseline(defineProperty)', fn: cloneBaseline },
  { name: 'V1-r1-literal-proto(REJECTED)', fn: cloneR1 },
  { name: 'V2-deepseek-style(ownkey-guard)', fn: cloneDeepSeekStyle },
  { name: 'V3-r2-object-fromEntries', fn: cloneFromEntries }
];
