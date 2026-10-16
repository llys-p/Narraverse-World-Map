// Issue #3 bounded, same-runner end-to-end A/B (synthetic scene r25 only).
// A B B A order, separate processes and temp directories, exact save/view SHA equality.
// Requires checkout fetch-depth:0. Never touches private r170 archives or real instances.
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const baseline='b7e5a9e7c131ee79acd017276ff62910a549d5ad';
const here=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(here,'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-issue3-ab-'));
const cloneDir=path.join(temp,'baseline-checkout');
const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
const steps=['fresh-scene-open','travel-forest','travel-village','gift-village',
  'strict-parse','validate-service-commit','clone-envelope','load-service-commit','reopen'];
const run=(name,cwd)=>{
  const proc=spawnSync(process.execPath,['scripts/measure-issue3-fixture.mjs'],{
    cwd,encoding:'utf8',timeout:120000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  if(proc.error||proc.status!==0||proc.signal)throw new Error(name+' failed: '+String(proc.error||proc.signal||proc.status)+' '+(proc.stderr||'').slice(0,1200));
  const value=JSON.parse(proc.stdout.trim());
  assert.equal(value.verdict,'SYNTHETIC_CONSISTENT');
  assert.equal(value.commands,3);assert.equal(value.revision,25);
  const byStage=Object.fromEntries(value.stages.map(s=>[s.name,s]));
  for(const stage of steps)assert.ok(Number.isFinite(byStage[stage]?.wallMs),name+' missing '+stage);
  return {name,saveSha256:value.saveSha256,fiveProjectionSha256:value.fiveProjectionSha256,
    saveBytes:value.saveBytes,stages:Object.fromEntries(steps.map(stage=>[stage,byStage[stage].wallMs]))};
};
let worktree=false,results=[];
try{
  execFileSync('git',['worktree','add','--detach',cloneDir,baseline],{cwd:source,timeout:30000,stdio:'pipe'});
  worktree=true;
  await fs.copyFile(path.join(here,'measure-issue3-fixture.mjs'),
    path.join(cloneDir,'scripts','measure-issue3-fixture.mjs'));
  for(const name of ['baseline','candidate','candidate','baseline']){
    const cwd=name==='baseline'?cloneDir:source;
    results.push(run(name,cwd));
  }
  const ref=results[0];
  for(const result of results){
    assert.equal(result.saveBytes,ref.saveBytes,'produced byte length mismatch');
    assert.equal(result.saveSha256,ref.saveSha256,'produced file SHA mismatch');
    assert.equal(result.fiveProjectionSha256,ref.fiveProjectionSha256,'all five views must match');
  }
  const stages=steps.map(stage=>{
    const old=results.filter(x=>x.name==='baseline').map(x=>x.stages[stage]);
    const candidate=results.filter(x=>x.name==='candidate').map(x=>x.stages[stage]);
    const a=median(old),b=median(candidate);
    return {stage,baselineMs:old,candidateMs:candidate,
      baselineMedianMs:+a.toFixed(3),candidateMedianMs:+b.toFixed(3),
      improvementPct:+(100*(1-b/a)).toFixed(2)};
  });
  console.log(JSON.stringify({verdict:'SYNTHETIC_AB_CONSISTENT',
    baseline,measurementsPerVersion:2,order:results.map(x=>x.name),
    provenance:'separate processes, same CI runner, isolated seed42 3-command scene worlds; NOT original r170',
    node:process.version,saveSha256:ref.saveSha256,fiveProjectionSha256:ref.fiveProjectionSha256,stages},null,2));
}finally{
  if(worktree){
    try{execFileSync('git',['worktree','remove','--force',cloneDir],{cwd:source,timeout:30000,stdio:'pipe'});}
    catch(e){console.error('worktree cleanup failed: '+String(e.message));process.exitCode=1;}
  }
  await fs.rm(temp,{force:true,recursive:true});
}
