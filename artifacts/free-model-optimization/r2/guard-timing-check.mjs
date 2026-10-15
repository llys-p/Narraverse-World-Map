// R2 run 3: does DeepSeek-style guard survive a POLLUTED Object.prototype if the
// "own key of Object.prototype" check is evaluated per call instead of cached at module load?
import * as proto from './prototype.mjs';
import { put, record, denseArray, MAX_EVENTS } from '../../oracle/runtime/core/data-contract.mjs';

const sharedFn = (fn) => fn;
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
    result = value.map((e) => cloneDyn(e, ancestors, depth + 1));
  } else {
    record(value);
    result = makeResult(value, ancestors, depth);
  }
  ancestors.delete(value);
  return result;
}
function cloneDyn(value, ancestors = new Set(), depth = 0) {
  return shared(value, ancestors, depth, (v, anc, d) => {
    const result = {};
    for (const key of Object.keys(v).sort()) {
      const entry = cloneDyn(v[key], anc, d + 1);
      // Per-call dynamic guard (not cached at module load).
      if (Object.hasOwn(Object.prototype, key)) put(result, key, entry); else result[key] = entry;
    }
    return result;
  });
}

function probe(fn, label) {
  let setterCalls = 0;
  Object.defineProperty(Object.prototype, 'polluted', { get() { return undefined; }, set() { setterCalls++; }, enumerable: false, configurable: true });
  let setterRes;
  try {
    const c = fn({ polluted: 'x', ok: 1 });
    setterRes = `calls=${setterCalls} own=${Object.hasOwn(c, 'polluted')} value=${JSON.stringify(Object.getOwnPropertyDescriptor(c, 'polluted')?.value)}`;
  } catch (e) { setterRes = 'threw=' + e.message; }
  finally { delete Object.prototype.polluted; }

  Object.defineProperty(Object.prototype, 'locked', { value: 'inh', writable: false, enumerable: false, configurable: true });
  let roRes;
  try {
    const c = fn({ locked: 'x' });
    roRes = `own=${Object.hasOwn(c, 'locked')} value=${JSON.stringify(Object.getOwnPropertyDescriptor(c, 'locked')?.value)}`;
  } catch (e) { roRes = 'threw=' + e.message; }
  finally { delete Object.prototype.locked; }

  console.log(`${label}\n  setter: ${setterRes}\n  readonly: ${roRes}`);
}

console.log('=== run 3: guard timing check ===');
probe(cloneDyn, 'V2b-deepseek-style DYNAMIC per-call guard');
probe(proto.cloneFromEntries, 'V3-r2-object-fromEntries');
