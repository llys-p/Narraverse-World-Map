import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
const root='D:/Narraverse-World-Map/free-perf-trials/';
const load=async p=>import(pathToFileURL(root+p));
const oracle=await load('hy3/artifacts/oracle/runtime/core/data-contract.mjs');
const deepseek=await load('deepseek/runtime/core/data-contract.mjs');
const hy3=await load('hy3/artifacts/free-model-optimization/r2/prototype-cloneData.mjs');
const hy4=await load('hy4/artifacts/free-model-optimization/r2/prototype.mjs');
const step5=await load('step5/artifacts/free-model-optimization/r2/proto-record-store.mjs');
const candidates=[['deepseek-existing',deepseek.cloneData],['hy3-reuse',hy3.cloneData],['hy4-fromEntries',hy4.cloneFromEntries],['step5-descriptor-guard',step5.cloneDataCandidate]];
const descriptorParity=(a,b)=>{if(a===null||typeof a!=='object')return;assert.equal(Object.getPrototypeOf(a),Object.getPrototypeOf(b));assert.deepEqual(Reflect.ownKeys(a),Reflect.ownKeys(b));for(const k of Reflect.ownKeys(a)){const x=Object.getOwnPropertyDescriptor(a,k),y=Object.getOwnPropertyDescriptor(b,k);assert.equal(x.enumerable,y.enumerable);assert.equal(x.writable,y.writable);assert.equal(x.configurable,y.configurable);descriptorParity(x.value,y.value);}};
const protoRecord={a:1};Object.defineProperty(protoRecord,'__proto__',{value:{name:'kept'},enumerable:true,writable:true,configurable:true});
const nullRecord=Object.assign(Object.create(null),{z:1,a:[-0,'字']});
const shared={k:1};const valid=[{}, {b:2,a:1},protoRecord,nullRecord,{a:shared,b:shared},[{id:'r',nested:[1,{q:true}]}]];
const results=[];
for(const [label,fn] of candidates){let checks=0;
  for(const v of valid){const expected=oracle.cloneData(v),actual=fn(v);assert.deepEqual(actual,expected);descriptorParity(actual,expected);if(actual&&typeof actual==='object')assert.notEqual(actual,v);checks++;}
  for(const kind of ['setter','readonly']){const key='__d4_r2_'+kind;assert.equal(Object.hasOwn(Object.prototype,key),false);let calls=0;
    Object.defineProperty(Object.prototype,key,kind==='setter'?{set(){calls++;},configurable:true}:{value:0,writable:false,configurable:true});
    try{const v=Object.fromEntries([[key,7],['ok',true]]),actual=fn(v),expected=oracle.cloneData(v);assert.deepEqual(actual,expected);descriptorParity(actual,expected);assert.equal(Object.hasOwn(actual,key),true);assert.equal(calls,0);}finally{delete Object.prototype[key];}checks++;}
  let getterCalls=0;const getterRecord={a:1};Object.defineProperty(getterRecord,'bad',{get(){getterCalls++;return 2;},enumerable:true});
  for(const make of [()=>getterRecord,()=>{const o={};o.self=o;return o;}]){const errors=[oracle.cloneData,fn].map(f=>{try{f(make());assert.fail('Expected rejection');}catch(e){return {code:e.code,message:e.message};}});assert.deepEqual(errors[1],errors[0]);checks++;}
  assert.equal(getterCalls,0);results.push({label,checks,pass:true});}
// One shared synthetic sample, sequential; this is a micro timing, not save-open evidence.
const build=d=>d===0?{s:'value',n:1,t:true,nil:null}:Object.fromEntries(Array.from({length:12},(_,i)=>['key'+i,build(d-1)]));
const sample=build(3),rounds=100,timings=[];
for(const [label,fn] of [['oracle',oracle.cloneData],...candidates]){fn(sample);fn(sample);const t=performance.now();for(let i=0;i<rounds;i++)fn(sample);timings.push({label,rounds,totalMs:performance.now()-t});}
const result={at:new Date().toISOString(),kind:'scoped prototype parity and single synthetic micro timing',results,timings,notMeasured:['real-save-open','travel','reopen','peak-memory','p95']};
fs.writeFileSync(new URL('controller-prototype-verification.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
