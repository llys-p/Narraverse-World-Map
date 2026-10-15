// Direct checks for per-call bounded key spelling reuse; independent frozen oracle.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';
const oracle=await import(pathToFileURL(path.join(process.env.D4P3_BASELINE_SOURCE||'D:/Narraverse-World-Map-d4-long-history','runtime/core/data-contract.mjs')));

test('D4P5 key reuse preserves escaped/integer keys past cache capacity and length bound',()=>{
  const special=['','__proto__','constructor','10','2','"quoted"','slash\\','line\n','tab\t','\u0000','粮🌲','\ud800','\udfff','x'.repeat(129)];
  const record=(keys)=>Object.fromEntries(keys.map((key,i)=>[key,{value:i,active:true}]));
  // The tail keys appear only after 300 distinct earlier keys filled the bounded table.
  const value={first:record(Array.from({length:300},(_,i)=>'unique-'+i)),repeats:Array.from({length:3},()=>record(special))};
  assert.equal(canonicalJson(value),oracle.canonicalJson(value));
});

test('D4P5 cached key spellings never reuse values or skip late getter/cycle validation',()=>{
  const value={rows:[{same:{n:1}},{same:{n:2}}]};
  assert.equal(canonicalJson(value),oracle.canonicalJson(value));
  value.rows[1].same.n=3;
  assert.equal(canonicalJson(value),oracle.canonicalJson(value));
  let getters=0;
  const badGetter={};Object.defineProperty(badGetter,'same',{enumerable:true,get(){getters++;return 4;}});
  const cycle={};cycle.same=cycle;
  for(const bad of [badGetter,cycle]){
    const input={rows:[{same:1},bad]},errors=[oracle.canonicalJson,canonicalJson].map(fn=>{
      try{fn(input);return null;}catch(e){return {code:e.code,message:e.message};}
    });
    assert.ok(errors[0]);assert.deepEqual(errors[1],errors[0]);
  }
  assert.equal(getters,0);
});
