// Issue #3: same-process alternating-order canonical JSON A/B against frozen base SHA.
// Run only in isolated CI after checkout with fetch-depth: 0.
// This is not a real private r170 save or a full-chain latency claim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import * as optimized from '../runtime/core/data-contract.mjs';
import {createSceneVillage} from '../runtime/fixtures/scene-survival-village.mjs';

const SHA='87d95751fa55f3a082f1545d6b03b20cca25d3bd';
const originalSource=execFileSync('git',['show',SHA+':runtime/core/data-contract.mjs'],{
  encoding:'utf8',maxBuffer:1024*1024});
const original=await import('data:text/javascript;base64,'+
  Buffer.from(originalSource,'utf8').toString('base64'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const median=values=>{const ordered=[...values].sort((a,b)=>a-b),mid=Math.floor(ordered.length/2);
  return ordered.length%2?ordered[mid]:(ordered[mid-1]+ordered[mid])/2;};
const event=n=>({
  eventSeq:n+1,tick:n%25,sourceSystem:'society',type:'SocietyDaySettled',
  flag:n%2===0,succeeded:n%3===0,active:false,requested:null,
  payload:{input:n,survival:n%3===0,inventory:{food:n%99,herbs:n%4},
    outcome:n%3===0?'succeeded':'rejected',details:[null,true,false,n%7]},
  entityIds:['actor-2','actor-3'],causationEventSeqs:[],
});
const base=createSceneVillage(42).bundle;
const fixtures=[
  {name:'seed42-scene-bundle',input:base,repeats:30},
  {name:'synthetic-500-facts',input:{bundle:base,events:Array.from({length:500},(_,i)=>event(i))},repeats:8},
  {name:'synthetic-2000-facts',input:{bundle:base,events:Array.from({length:2000},(_,i)=>event(i))},repeats:3},
];
const compareFailure=value=>{
  const run=fn=>{try{return {output:fn(value)}}catch(e){return {code:e.code||null,message:e.message}}};
  assert.deepEqual(run(optimized.canonicalJson),run(original.canonicalJson));
};
compareFailure(undefined);compareFailure(NaN);compareFailure({bad:()=>2});
const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){throw new Error('GETTER_RAN')}});
compareFailure(getter);
const cycle={x:null};cycle.y=cycle;compareFailure(cycle);
let deep=null;for(let i=0;i<66;i++)deep={next:deep};compareFailure(deep);
let fails=0,allFaster=true;const outcomes=[];
for(const f of fixtures){
  const control=original.canonicalJson(f.input),candidate=optimized.canonicalJson(f.input);
  assert.equal(candidate,control,f.name+' canonical byte equality');
  const results={baseline:[],candidate:[]};
  for(let round=0;round<7;round++){
    const order=round%2?[['candidate',optimized],['baseline',original]]:
      [['baseline',original],['candidate',optimized]];
    for(const [name,implementation] of order){
      const start=performance.now();
      for(let j=0;j<f.repeats;j++)implementation.canonicalJson(f.input);
      results[name].push(performance.now()-start);
    }
  }
  const baselineMedian=median(results.baseline),candidateMedian=median(results.candidate);
  const speedupPct=100*(1-candidateMedian/baselineMedian);
  if(speedupPct<=0){allFaster=false;fails++;}
  outcomes.push({name:f.name,repeatCount:f.repeats,rounds:7,
    baselineMs:+baselineMedian.toFixed(3),candidateMs:+candidateMedian.toFixed(3),
    speedupPct:+speedupPct.toFixed(2),canonicalSha256:sha(candidate)});
}
console.log(JSON.stringify({kind:'issue3-primitive-ab',node:process.version,
  originalCommit:SHA,originalDataContractSha256:sha(originalSource),
  candidateFileSha256:sha(readFileSync(new URL('../runtime/core/data-contract.mjs',import.meta.url))),
  invalidCasesMatched:6,allWorkloadsFaster:allFaster,regressions:fails,
  provenance:'seed42 scene fixture + synthetic events; NOT r170 private history',outcomes},null,2));
