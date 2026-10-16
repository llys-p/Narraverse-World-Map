import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';

test('Issue #3 native number conversion matches JSON finite-number spelling',()=>{
  const values=[0,-0,1,-1,1.5,0.00000001,1e-7,1e-8,1e20,1e21,1e22,
    Number.MIN_VALUE,Number.MAX_VALUE,Number.EPSILON,
    Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER,2**53,1.2345678901234567,
    -1.2345678901234567,-Number.MIN_VALUE];
  for(let i=1;i<=1024;i++)values.push((i%2?-1:1)*(i/17)*(10**((i%25)-12)));
  for(const value of values)
    assert.equal(canonicalJson(value),JSON.stringify(value),'canonical finite number: '+value);
  assert.equal(canonicalJson({b:[-0,1e21,-1e-8],a:3.14}),
    '{"a":3.14,"b":[0,1e+21,-1e-8]}');
});

test('Issue #3 numeric fast path still rejects nonfinite values without changing rejection',()=>{
  for(const value of [NaN,Infinity,-Infinity])
    assert.throws(()=>canonicalJson(value),
      e=>e?.code==='INVALID_INPUT' && e?.message==='Non-finite number');
});

test('Issue #3 numeric spelling does not depend on mutable global String',()=>{
  const old=globalThis.String;
  try{
    globalThis.String=()=>{throw Error('unexpected global String call')};
    assert.equal(canonicalJson({x:1.23,y:1e21,z:-0}),
      '{"x":1.23,"y":1e+21,"z":0}');
  }finally{globalThis.String=old;}
});
