import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson, payloadBudget} from '../../runtime/core/data-contract.mjs';

test('Issue #3 fixed primitive encodings remain byte-exact inside nested data', () => {
  for (const value of [null, true, false, 0, -0, 1, 'true', 'null', '\\n', '狼🐺']) {
    assert.equal(canonicalJson(value), JSON.stringify(value) === '-0' ? '0' : JSON.stringify(value));
  }
  const value = {z: [null, true, false, {b: null, a: false}], a: true, '2': false, '10': null};
  assert.equal(canonicalJson(value),
    '{"10":null,"2":false,"a":true,"z":[null,true,false,{"a":false,"b":null}]}');
  assert.equal(canonicalJson({branchA: value,branchB: value}), canonicalJson({branchA: value,branchB: value}));
});

test('Issue #3 primitive fast path never bypasses depth, getters or non-finite rejection', () => {
  for (const value of [undefined, Symbol('bad'), Infinity, -Infinity, NaN, BigInt(2)])
    assert.throws(() => canonicalJson(value), e => e?.code === 'INVALID_INPUT');
  let value = null;
  for(let i=0;i<65;i++)value={next:value};
  assert.throws(() => canonicalJson(value),
    e => e?.code==='LIMIT_EXCEEDED' && e.message==='Data nesting budget exceeded');
  let getters=0;
  const bad={};Object.defineProperty(bad,'ok',{enumerable:true,get(){getters++;return true}});
  assert.throws(()=>canonicalJson({a:[null,bad]}),e=>e?.code==='INVALID_INPUT');
  assert.equal(getters,0);
  const cycle={nullable:null};cycle.self=cycle;
  assert.throws(()=>canonicalJson(cycle),e=>e?.code==='INVALID_INPUT');
});

test('Issue #3 canonical boolean/null performance change preserves UTF8 payload budget', () => {
  assert.doesNotThrow(()=>payloadBudget({flag:true,v:null,text:'x'.repeat(65500)}));
  assert.throws(()=>payloadBudget({flag:true,v:null,text:'x'.repeat(65536)}),
    e=>e?.code==='LIMIT_EXCEEDED');
});
