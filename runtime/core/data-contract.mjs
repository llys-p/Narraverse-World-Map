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
    // Plain assignment on a fresh `{}` yields the same {writable,enumerable,configurable} data
    // descriptor as put(), and is materially cheaper. `__proto__` is the only accessor inherited
    // from Object.prototype, so it must still go through defineProperty to stay an own data key.
    for (const key of Object.keys(value).sort()) {
      const entry = cloneData(value[key], ancestors, depth + 1);
      if (key === '__proto__') put(result, key, entry); else result[key] = entry;
    }
  }
  ancestors.delete(value);
  return result;
}
function encodeCanonical(value, ancestors = new Set(), depth = 0) {
  requireCondition(depth <= 64, 'Data nesting budget exceeded', 'LIMIT_EXCEEDED');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    requireCondition(Number.isFinite(value), 'Non-finite number');
    return value === 0 ? '0' : JSON.stringify(value);
  }
  requireCondition(typeof value === 'object', 'Non-JSON data');
  requireCondition(!ancestors.has(value), 'Cyclic data');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      denseArray(value, MAX_EVENTS);
      const len = value.length;
      if (len === 0) return '[]';
      let out = '[';
      for (let i = 0; i < len; i++) {
        if (i > 0) out += ',';
        out += encodeCanonical(value[i], ancestors, depth + 1);
      }
      return out + ']';
    }
    record(value);
    const sortedKeys = Object.keys(value).sort();
    const len = sortedKeys.length;
    if (len === 0) return '{}';
    let out = '{';
    for (let i = 0; i < len; i++) {
      if (i > 0) out += ',';
      const key = sortedKeys[i];
      out += JSON.stringify(key) + ':' + encodeCanonical(value[key], ancestors, depth + 1);
    }
    return out + '}';
  } finally {
    ancestors.delete(value);
  }
}

// Encode keys directly: building an object first would reorder integer-looking keys.
export function canonicalJson(value) {
  return encodeCanonical(value);
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
    if(input.type==='PlayerAction'){
      fields(input.payload,['startTick','intent']);integer(input.payload.startTick);const intent=input.payload.intent;fields(intent,['type','payload']);
      if(intent.type==='PlayerTravel'){fields(intent.payload,['destination']);requireCondition(['village','forest'].includes(intent.payload.destination),'Unknown destination');}
      else if(intent.type==='PlayerRest')fields(intent.payload,[]);
      else{requireCondition(['PlayerBuy','PlayerSell'].includes(intent.type),'Unknown player action');fields(intent.payload,['product','quantity']);
        requireCondition(['food','herbs'].includes(intent.payload.product),'Unknown product');integer(intent.payload.quantity,1);requireCondition(intent.payload.quantity<=10,'Quantity budget exceeded');}
    }else if(input.type==='SocietyAction'){
      fields(input.payload,['actorId','goalId','action','targetActorId']);identifier(input.payload.actorId);integer(input.payload.goalId);
      requireCondition(['Rest','WorkForPay','Hunt','BuyFood','BuyMedicine','UseMedicine','SellMedicine'].includes(input.payload.action),'Unknown Society action');
      if(input.payload.action==='SellMedicine')identifier(input.payload.targetActorId);else requireCondition(input.payload.targetActorId===null,'Nontrade action has peer target');
    }else if(input.type==='ActorAction'){
      fields(input.payload,['actorId','goalId','action']);identifier(input.payload.actorId);integer(input.payload.goalId);
      requireCondition(['Rest','WorkForPay','Hunt','BuyFood','BuyMedicine','UseMedicine'].includes(input.payload.action),'Unknown Actor action');
    }else if (input.type === 'SetTradeRoute') {
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
