// R2 short experiment — in-process verification of the cloneData candidate.
// Uses Node built-ins only (no test runner spawn). Mirrors canonical-json-equivalence
// semantics for cloneData: getter=0, prototype/descriptor preservation, iterable equality,
// inherited-setter / read-only-proto-prop safety. Node 24.14.0.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneData, record, own } from './prototype-cloneData.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ORACLE_SOURCE = path.resolve(SCRIPT_DIR, '../../../artifacts/oracle/runtime/core/data-contract.mjs');
const { cloneData: baselineClone } = await import(pathToFileURLSafe(ORACLE_SOURCE));

function pathToFileURLSafe(p) { return 'file://' + p.replace(/\\/g, '/'); }
function canonicalOf(obj) { // minimal canonical string for equality compare (sort keys)
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalOf).join(',') + ']';
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonicalOf(obj[k])).join(',') + '}';
}

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } }

// 1) inherited-SETTER collision (input own key collides with Object.prototype accessor):
//    candidate must NOT invoke the inherited setter and must keep an own data prop.
//    This is the exact Hy4/Step5 failure mode (they used plain assignment -> setter fired).
{
  let setterCalls = 0;
  const saved = Object.getOwnPropertyDescriptor(Object.prototype, 'setterKey');
  Object.defineProperty(Object.prototype, 'setterKey', { get() { return 0; }, set() { setterCalls++; }, configurable: true, enumerable: false });
  let out;
  try { out = cloneData({ a: 1, setterKey: 7 }); } finally {
    if (saved) Object.defineProperty(Object.prototype, 'setterKey', saved); else delete Object.prototype.setterKey;
  }
  check('inherited-setter collision: setter=0, own data prop kept', () => {
    assert.equal(setterCalls, 0);
    assert.equal(own(out, 'setterKey'), true);
    assert.equal(out.setterKey, 7);
  });
}

// 2) read-only INHERITED DATA property collision (input own key collides with a read-only
//    data prop on Object.prototype, i.e. { value, writable:false, configurable:true }):
//    candidate must succeed like baseline (defineProperty on collision key) — the Hy4/Step5
//    plain-assignment variant throws TypeError here, which is the exact R1 rejection reason.
{
  const saved = Object.getOwnPropertyDescriptor(Object.prototype, 'roKey');
  Object.defineProperty(Object.prototype, 'roKey', { value: 0, writable: false, configurable: true, enumerable: false });
  let bOut = null, cOut = null, bErr = null, cErr = null;
  try { bOut = baselineClone({ a: 1, roKey: 9 }); } catch (e) { bErr = e; }
  try { cOut = cloneData({ a: 1, roKey: 9 }); } catch (e) { cErr = e; }
  finally { if (saved) Object.defineProperty(Object.prototype, 'roKey', saved); else delete Object.prototype.roKey; }
  check('read-only INHERITED DATA prop collision: candidate == baseline (both succeed, own data prop)', () => {
    assert.equal(bErr, null); assert.equal(cErr, null);
    assert.equal(own(bOut, 'roKey'), true); assert.equal(bOut.roKey, 9);
    assert.equal(own(cOut, 'roKey'), true); assert.equal(cOut.roKey, 9);
  });
}

// 3) __proto__ own data prop preserved (no prototype pollution, no setter)
{
  const obj = {}; Object.defineProperty(obj, '__proto__', { value: 'custom', enumerable: true, writable: true, configurable: true });
  const out = cloneData(obj);
  check('own __proto__ kept as data prop', () => { assert.equal(out.__proto__, 'custom'); assert.equal(Object.getPrototypeOf(out), Object.prototype); });
}

// 4) result independence + canonical equality vs baseline on valid cases
{
  const cases = [
    { id: 'x', v: [1, 2, 'three', true, null], m: { active: true } },
    { z: 'end', middle: 0, a: 'start' },
    { '2': 'two', '10': 'ten', '1': 'one', a: 'A' },
    { branchA: { k: 1 }, list: [{ k: 1 }, { k: 1 }] },
  ];
  for (const c of cases) {
    const base = baselineClone(c), cand = cloneData(c);
    check('canonical-eq vs baseline: ' + JSON.stringify(c).slice(0, 24), () => assert.equal(canonicalOf(cand), canonicalOf(base)));
    check('clone independent: ' + JSON.stringify(c).slice(0, 24), () => { cand.x = 'mut'; assert.equal(base.x, undefined); });
    check('return proto Object.prototype: ' + JSON.stringify(c).slice(0, 24), () => assert.equal(Object.getPrototypeOf(cand), Object.prototype));
  }
}

// 5) getter-bearing record: getter must NOT execute
{
  let g = 0;
  const rec = { ok: 1 }; Object.defineProperty(rec, 'g', { get() { g++; return 2; }, enumerable: true, configurable: true });
  let threw = false;
  try { cloneData(rec); } catch { threw = true; }
  check('getter record throws + getter=0', () => { assert.ok(threw); assert.equal(g, 0); });
}

// 6) cycle / depth / non-finite still throw
{
  check('cyclic throws', () => { const o = {}; o.s = o; assert.throws(() => cloneData(o)); });
  check('NaN throws', () => { assert.throws(() => cloneData({ n: NaN })); });
}

console.log(`\nR2 experiment result: ${pass} pass, ${fail} fail`);

// Micro-benchmark (NOT a performance conclusion; single-run, host-dependent): compare
// fast-assign candidate vs baseline defineProperty-only on a wide record. Run once.
{
  const build = () => { const o = {}; for (let i = 0; i < 50; i++) o['k' + i] = i; return o; };
  const sample = build();
  const ITER = 200000;
  const bench = (fn) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < ITER; i++) fn(sample); const t1 = process.hrtime.bigint(); return Number(t1 - t0) / 1e6; };
  const baseMs = bench(baselineClone);
  const candMs = bench(cloneData);
  console.log(`micro-bench: iters=${ITER} baselineMs=${baseMs.toFixed(1)} candidateMs=${candMs.toFixed(1)} (host-dependent, single run)`);
}

process.exit(fail === 0 ? 0 : 1);
