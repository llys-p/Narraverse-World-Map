#!/usr/bin/env node
// Portable, bounded clone/encode probe. No saved world, services or network reads.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import * as candidate from '../runtime/core/data-contract.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const references=[
  ['accepted293','2936233426e990857f3c88a39ad58623832419fd'],
  ['deepseek10a','10a2180441fcc9509a6ddd561ac97679f279aa9f'],
];
const hash=value=>createHash('sha256').update(value).digest('hex');
async function main(){
  assert.equal(process.argv.length,2,'This fixed probe takes no arguments');
  const models=[];
  for(const [label,commit] of references){
    let source;
    try{source=execFileSync('git',['show',commit+':runtime/core/data-contract.mjs'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000});}
    catch{throw new Error('REFERENCE_UNAVAILABLE: Git and full ancestry containing '+commit+' are required; no network fetch was attempted.');}
    const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    models.push({label,commit,sha256:hash(source),module});
  }
  const source=fs.readFileSync(new URL('../runtime/core/data-contract.mjs',import.meta.url));
  models.push({label:'candidate',commit:null,sha256:hash(source),module:candidate});
  const sample={revision:170,actors:Array.from({length:150},(_,i)=>({id:'actor-'+i,alive:true,
    stats:{hp:920,food:18,money:i},events:[{tick:168,type:'Observed',payload:{actorId:i}}]}))};
  const expected=models[0].module.canonicalJson(sample);
  let getterCalls=0;const getter={};Object.defineProperty(getter,'bad',{enumerable:true,get(){getterCalls++;return 1;}});
  const cycle={};cycle.self=cycle;
  const error=(fn,value)=>{try{fn(value);return null;}catch(e){return {code:e.code,message:e.message};}};
  for(const model of models){
    assert.deepEqual(model.module.cloneData(sample),models[0].module.cloneData(sample));
    assert.equal(model.module.canonicalJson(sample),expected);
    for(const bad of [getter,cycle]){
      const reference=error(models[0].module.canonicalJson,bad);assert.ok(reference);
      assert.deepEqual(error(model.module.canonicalJson,bad),reference);
    }
  }
  assert.equal(getterCalls,0);
  const iterations=100,repeats=3,results=[];
  for(let repeat=0;repeat<repeats;repeat++)for(const model of [...models.slice(repeat),...models.slice(0,repeat)]){
    const row={repeat,label:model.label,iterations};
    for(const operation of ['cloneData','canonicalJson']){
      for(let i=0;i<5;i++)model.module[operation](sample);
      const started=performance.now();for(let i=0;i<iterations;i++)model.module[operation](sample);
      row[operation+'Ms']=performance.now()-started;
    }
    results.push(row);
  }
  console.log(JSON.stringify({at:new Date().toISOString(),node:process.version,platform:process.platform,
    sampleKind:'SYNTHETIC_ONLY_NOT_REAL_R170',sampleBytes:Buffer.byteLength(expected),sampleSha256:hash(expected),
    checks:{cloneValuesEqual:true,canonicalBytesEqual:true,getterCalls,rejectionParity:true},
    references:models.map(({module,...identity})=>identity),results,
    notMeasured:['runtime-open','travel','reopen','p95','peak-memory']},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
