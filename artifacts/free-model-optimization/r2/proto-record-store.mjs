// R2 prototype: safe fast-path for the record copy loop of cloneData.
// Behaviour/performance reference: SHA 2936233426e990857f3c88a39ad58623832419fd
//   == frozen module free-perf-trials/step5/artifacts/oracle/runtime/core/data-contract.mjs
//      (sha256 c6f3bb2c1f4c10e2566b74a8f94ef38e9342ba52a4e60244f)
// The traversal below is copied verbatim from that frozen module. The ONLY
// difference is the per-key write step in the record branch (copyRecordCandidate).
import { cloneData as oracleCloneData, record as oracleRecord, denseArray as oracleDenseArray } from '../../oracle/runtime/core/data-contract.mjs';

export function put(value, key, entry) {
  Object.defineProperty(value, key, { value: entry, enumerable: true, writable: true, configurable: true });
}

function baseCopy(source, result, value, ancestors, depth) {
  for (const key of Object.keys(source).sort()) put(result, key, cloneWith(baseCopy, value[key], ancestors, depth + 1));
}
export function candidateCopy(source, result, value, ancestors, depth) {
  for (const key of Object.keys(source).sort()) {
    const entry = cloneWith(candidateCopy, value[key], ancestors, depth + 1);
    // put()'s defineProperty is equivalent to a plain store ONLY when the key
    // does not resolve to an inherited accessor / non-writable member of the
    // result's prototype (Object.prototype). The own-descriptor lookup is exact
    // (undefined when absent) and is what fixes the R1 counter-example.
    if (key === '__proto__' || Object.getOwnPropertyDescriptor(Object.prototype, key) !== undefined) put(result, key, entry);
    else result[key] = entry;
  }
}

function cloneWith(copyRecord, value, ancestors, depth) {
  const requireCondition = (c, m, code = 'INVALID_INPUT') => { if (!c) throw Object.assign(new Error(m), { code }); };
  requireCondition(depth <= 64, 'Data nesting budget exceeded', 'LIMIT_EXCEEDED');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { requireCondition(Number.isFinite(value), 'Non-finite number'); return value === 0 ? 0 : value; }
  requireCondition(typeof value === 'object', 'Non-JSON data');
  requireCondition(!ancestors.has(value), 'Cyclic data');
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) { oracleDenseArray(value, 1000000); result = value.map((e) => cloneWith(copyRecord, e, ancestors, depth + 1)); }
  else {
    oracleRecord(value); result = {};
    copyRecord(value, result, value, ancestors, depth);
  }
  ancestors.delete(value);
  return result;
}

export const cloneDataBase = (value) => cloneWith(baseCopy, value, new Set(), 0);
export const cloneDataCandidate = (value) => cloneWith(candidateCopy, value, new Set(), 0);
export { oracleCloneData };
