// R2 prototype — candidate cloneData fast-assign (deepseek reuse classification).
// Self-contained copy of the functions under test; production runtime/core/data-contract.mjs
// is NOT modified. See proposal.md for mechanism/path/line classification.
const MAX_COLLECTION = 100000;
const MAX_EVENTS = 1000000;
const own = (value, key) => Object.hasOwn(value, key);

function fault(code, message) { return Object.assign(new Error(message), { code }); }
function requireCondition(condition, message, code = 'INVALID_INPUT') { if (!condition) throw fault(code, message); }
function record(value) {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected data record');
  const prototype = Object.getPrototypeOf(value);
  requireCondition(prototype === Object.prototype || prototype === null, 'Unsupported record prototype');
  const keys = Reflect.ownKeys(value);
  requireCondition(keys.length <= MAX_COLLECTION, 'Record budget exceeded', 'LIMIT_EXCEEDED');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireCondition(typeof key === 'string' && descriptor.enumerable && own(descriptor, 'value'), 'Only enumerable data properties are supported');
  }
  return value;
}
function denseArray(value, limit = MAX_COLLECTION) {
  requireCondition(Array.isArray(value), 'Expected array');
  requireCondition(value.length <= limit, 'Array budget exceeded', 'LIMIT_EXCEEDED');
  requireCondition(Reflect.ownKeys(value).length === value.length + 1, 'Sparse array or extra array properties');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    requireCondition(descriptor && descriptor.enumerable && own(descriptor, 'value'), 'Sparse array or accessor element');
  }
}
function put(value, key, entry) {
  Object.defineProperty(value, key, { value: entry, enumerable: true, writable: true, configurable: true });
}

// --- candidate: DeepSeek-classified scheme on cloneData record branch (line 64-65 of production) ---
export function cloneData(value, ancestors = new Set(), depth = 0) {
  requireCondition(depth <= 64, 'Data nesting budget exceeded', 'LIMIT_EXCEEDED');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    requireCondition(Number.isFinite(value), 'Non-finite number');
    return value === 0 ? 0 : value;
  }
  requireCondition(typeof value === 'object', 'Non-JSON data');
  requireCondition(!ancestors.has(value), 'Cyclic data');
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    denseArray(value, MAX_EVENTS);
    result = value.map((entry) => cloneData(entry, ancestors, depth + 1));
  } else {
    record(value); result = {};
    for (const key of Object.keys(value).sort()) {
      const cloned = cloneData(value[key], ancestors, depth + 1);
      // Safe fast path: only bypass defineProperty for keys that are NOT own data props of Object.prototype.
      // Conflict keys (e.g. __proto__, constructor, toString, or any injected proto accessor/read-only prop)
      // use the original defineProperty so no inherited setter fires and no TypeError on read-only proto props.
      if (own(Object.prototype, key)) put(result, key, cloned);
      else result[key] = cloned;
    }
  }
  ancestors.delete(value);
  return result;
}

export { record, denseArray, own };
