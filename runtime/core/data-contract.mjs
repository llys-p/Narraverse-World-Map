// Shared A2 data-boundary checks. No schemas, callbacks or host services live here.
export const MAX_COLLECTION = 100000;
export const MAX_EVENTS = 1000000;
export const MAX_PAYLOAD_BYTES = 65536;
export const own = (value, key) => Object.hasOwn(value, key);

export function fault(code, message) {
  return Object.assign(new Error(message), { code });
}
export function requireCondition(condition, message, code = 'INVALID_INPUT') {
  if (!condition) throw fault(code, message);
}
export function record(value) {
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
export function fields(value, names) {
  record(value);
  const keys = Object.keys(value);
  requireCondition(keys.length === names.length && names.every((key) => own(value, key)), 'Fields do not match schema');
}
export function identifier(value) {
  requireCondition(typeof value === 'string' && value.length > 0 && value.length <= 64, 'Invalid identifier');
}
export function integer(value, minimum = 0) {
  requireCondition(Number.isSafeInteger(value) && value >= minimum, 'Invalid safe integer');
}
export function denseArray(value, limit = MAX_COLLECTION) {
  requireCondition(Array.isArray(value), 'Expected array');
  requireCondition(value.length <= limit, 'Array budget exceeded', 'LIMIT_EXCEEDED');
  requireCondition(Reflect.ownKeys(value).length === value.length + 1, 'Sparse array or extra array properties');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    requireCondition(descriptor && descriptor.enumerable && own(descriptor, 'value'), 'Sparse array or accessor element');
  }
}
export function put(value, key, entry) {
  Object.defineProperty(value, key, { value: entry, enumerable: true, writable: true, configurable: true });
}

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
    for (const key of Object.keys(value).sort()) put(result, key, cloneData(value[key], ancestors, depth + 1));
  }
  ancestors.delete(value);
  return result;
}
// Encode keys directly: building an object first would reorder integer-looking keys.
export function canonicalJson(value) {
  const encode = (data) => {
    if (data === null || typeof data !== 'object') return JSON.stringify(data);
    if (Array.isArray(data)) return '[' + data.map(encode).join(',') + ']';
    return '{' + Object.keys(data).sort().map((key) => JSON.stringify(key) + ':' + encode(data[key])).join(',') + '}';
  };
  return encode(cloneData(value));
}
export function payloadBudget(value) {
  requireCondition(new TextEncoder().encode(canonicalJson(value)).length <= MAX_PAYLOAD_BYTES, 'Payload budget exceeded', 'LIMIT_EXCEEDED');
}
export function normalizeSystems(systems) {
  record(systems);
  for (const [id, handler] of Object.entries(systems)) {
    identifier(id); requireCondition(typeof handler === 'function', 'System handler must be a function');
    requireCondition(id !== 'command-engine', 'Reserved system identifier');
  }
  return systems;
}
export function commandInput(raw, strictType = true) {
  const input = cloneData(raw);
  fields(input, ['commandId', 'targetTick', 'type', 'payload']);
  identifier(input.commandId); integer(input.targetTick, 1); identifier(input.type);
  record(input.payload); payloadBudget(input.payload);
  if (strictType) {
    if (input.type === 'SetTradeRoute') {
      fields(input.payload, ['open']); requireCondition(typeof input.payload.open === 'boolean', 'Route state must be boolean');
    } else if (input.type === 'RemovePopulation') {
      fields(input.payload, ['species', 'amount']);
      requireCondition(['deer', 'wolves'].includes(input.payload.species), 'Unknown population species');
      integer(input.payload.amount, 1);
    } else {
      requireCondition(input.type === 'TransferResource', 'Unknown command type');
      fields(input.payload, ['from', 'to', 'amount']);
      identifier(input.payload.from); identifier(input.payload.to); integer(input.payload.amount, 1);
    }
  }
  return input;
}
export function inputFingerprint(input) {
  return canonicalJson({ type: input.type, payload: input.payload, targetTick: input.targetTick });
}
