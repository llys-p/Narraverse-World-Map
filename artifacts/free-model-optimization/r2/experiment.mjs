// R2 short experiment — hy4. Runs in-process (no node --test, avoids spawn EPERM).
// 1. Correctness: R1 rejection counterexamples (inherited setter / inherited read-only key on
//    Object.prototype) plus core semantics vs the frozen oracle.
// 2. Speed: clone-only micro timing on a synthetic record workload (hypothesis only, not a
//    product measurement — Codex owns real measurement).
import * as proto from './prototype.mjs';
import { canonicalJson } from '../../oracle/runtime/core/data-contract.mjs';

const out = [];
const log = (s) => { out.push(s); console.log(s); };
const shape = (o) => {
  const r = {};
  for (const k of Reflect.ownKeys(o)) {
    const d = Object.getOwnPropertyDescriptor(o, k);
    r[String(k)] = `${d.value}|w=${!!d.writable},e=${!!d.enumerable},c=${!!d.configurable},hasValue=${Object.hasOwn(d, 'value')}`;
  }
  return r;
};

// ---------- Part 1: R1 rejection counterexamples ----------
function inheritedSetterCase(fn) {
  let setterCalls = 0;
  Object.defineProperty(Object.prototype, 'polluted', {
    get() { return undefined; }, set() { setterCalls++; }, enumerable: false, configurable: true
  });
  try {
    const src = { polluted: 'x', ok: 1 };
    const clone = fn(src);
    return { setterCalls, own: Object.hasOwn(clone, 'polluted'), value: Object.getOwnPropertyDescriptor(clone, 'polluted')?.value, threw: null };
  } catch (e) { return { setterCalls, own: null, value: null, threw: e.constructor.name + ': ' + e.message }; }
  finally { delete Object.prototype.polluted; }
}

function inheritedReadOnlyCase(fn) {
  Object.defineProperty(Object.prototype, 'locked', { value: 'inherited', writable: false, enumerable: false, configurable: true });
  try {
    const src = { locked: 'x' };
    const clone = fn(src);
    return { own: Object.hasOwn(clone, 'locked'), value: Object.getOwnPropertyDescriptor(clone, 'locked')?.value, threw: null };
  } catch (e) { return { own: null, value: null, threw: e.constructor.name + ': ' + e.message }; }
  finally { delete Object.prototype.locked; }
}

log('=== Part 1: R1 rejection counterexamples (Object.prototype polluted at runtime) ===');
for (const { name, fn } of proto.VARIANTS) {
  const s = inheritedSetterCase(fn);
  const r = inheritedReadOnlyCase(fn);
  log(`${name}\n  setter: calls=${s.setterCalls} own=${s.own} value=${JSON.stringify(s.value)} threw=${s.threw}` +
      `\n  readonly: own=${r.own} value=${JSON.stringify(r.value)} threw=${r.threw}`);
}

// ---------- Part 2: core semantics vs oracle baseline ----------
log('\n=== Part 2: semantics vs V0-baseline (canonicalJson / prototype / descriptors) ===');
const ownProtoObj = {};
Object.defineProperty(ownProtoObj, '__proto__', { value: 'custom-proto-value', enumerable: true, writable: true, configurable: true });
ownProtoObj.constructor = 'constructor-val';
ownProtoObj.after = { deep: [1, { __proto__: 'nested' }] };
const nullProto = Object.create(null); nullProto.z = 1; nullProto.a = 's'; nullProto['0'] = 'z';
const shared = { id: 's', values: [1, 2, null], meta: { active: true } };
let deep = { leaf: 'bottom' }; for (let i = 0; i < 40; i++) deep = { level: i, next: deep };
const cases = {
  empty: {}, flat: { b: 2, a: 1 }, intKeys: { '2': 'two', '10': 'ten', '1': 'one', 'a': 'A' },
  ownProto: ownProtoObj, nullProto, dag: { a: shared, b: shared, l: [shared, shared] },
  nested: { rows: [{ id: 'r1', tags: ['a', 'b'] }], empty: [], nn: [[1, 2], [3, [4, 5]]] },
  deep40: deep, scalars: { s: 'x', n: 0, neg: -0, f: 1.5, t: true, nil: null }
};
for (const { name, fn } of proto.VARIANTS) {
  let bad = [];
  for (const [cn, cv] of Object.entries(cases)) {
    const a = proto.cloneBaseline(cv), b = fn(cv);
    if (canonicalJson(b) !== canonicalJson(a)) bad.push(`${cn}:canonical`);
    if (Object.getPrototypeOf(b) !== Object.getPrototypeOf(a)) bad.push(`${cn}:proto`);
    if (JSON.stringify(shape(b)) !== JSON.stringify(shape(a))) bad.push(`${cn}:descriptors`);
  }
  log(`${name} -> ${bad.length === 0 ? 'MATCH (all 9 cases)' : 'DIFF: ' + bad.join(', ')}`);
}

// ---------- Part 3: rejection parity on invalid inputs ----------
log('\n=== Part 3: invalid-input parity vs V0-baseline ===');
let getters = 0;
const badCases = {
  undefined: () => undefined, symbol: () => Symbol('s'), function: () => () => {}, bigint: () => 10n,
  NaN: () => NaN, Infinity: () => Infinity, '-Infinity': () => -Infinity,
  cyclic: () => { const o = {}; o.self = o; return o; },
  sparse: () => { const a = [1, 2]; a[4] = 5; return a; },
  arrayExtra: () => { const a = [1, 2]; a.extra = 'x'; return a; },
  symbolKey: () => ({ [Symbol('f')]: 'v' }),
  nonEnum: () => { const o = {}; Object.defineProperty(o, 'x', { value: 1, enumerable: false }); return o; },
  classProto: () => { class C {} return new C(); },
  depth66: () => { let c = {}; const r = c; for (let i = 0; i < 66; i++) { c.n = {}; c = c.n; } return r; },
  accessor: () => { const o = { k: 'v' }; Object.defineProperty(o, 'g', { get() { getters++; return 'x'; }, enumerable: true, configurable: true }); return o; }
};
for (const { name, fn } of proto.VARIANTS) {
  const diffs = [];
  for (const [cn, make] of Object.entries(badCases)) {
    let ea = null, eb = null;
    try { proto.cloneBaseline(make()); } catch (e) { ea = e; }
    try { fn(make()); } catch (e) { eb = e; }
    if (!ea || !eb) { diffs.push(`${cn}:${ea ? 'no-throw' : 'baseline-no-throw'}`); continue; }
    if (ea.code !== eb.code || ea.message !== eb.message) diffs.push(`${cn}:${eb.code}/${eb.message} != ${ea.code}/${ea.message}`);
  }
  log(`${name} -> ${diffs.length === 0 ? 'PARITY (all 14)' : 'DIFF: ' + diffs.join(', ')}`);
}
log(`getter invocations across variants: ${getters} (baseline must be 0; each variant counted)`);

// ---------- Part 4: clone-only micro timing (hypothesis only) ----------
log('\n=== Part 4: clone-only micro timing, 30 records x 12 keys x 3 levels, 200 iterations ===');
const build = (d) => {
  if (d === 0) return { s: 'value', n: 1, t: true, nil: null };
  const o = {};
  for (let i = 0; i < 12; i++) o['key' + i] = build(d - 1);
  return o;
};
const payload = build(3);
for (const { name, fn } of proto.VARIANTS) {
  fn(payload); fn(payload);
  let total = 0;
  for (let i = 0; i < 200; i++) { const t = process.hrtime.bigint(); fn(payload); total += Number(process.hrtime.bigint() - t) / 1e6; }
  log(`${name} -> 200 iters total=${total.toFixed(2)}ms avg=${(total / 200).toFixed(4)}ms`);
}
log('\nNOTE: Part 4 is a synthetic clone-only micro measurement under this sandbox; it is NOT a product performance result. Real measurement belongs to Codex (r170 first-open under the parent contract).');
