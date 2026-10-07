import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSimulation,parseArguments } from '../../simulation-runner.mjs';
import { B4_SEEDS,B4_HOLDOUT_SEEDS,B4_GATES,B4_CONFIG_HASHES } from '../fixtures/b4-calibrated.mjs';
import { auditRun,auditPaired } from './b4-report.mjs';

export async function runB4Experiments(directory) {
  const out=path.resolve(directory);await fs.mkdir(out);const metrics=[],pairs=[];
  const run=async(scenario,seed,days,label)=>{
    const folder=path.join(out,label),summary=await runSimulation(parseArguments(['--fixture','b4-'+scenario,'--seed',String(seed),'--days',String(days),'--out',folder]));
    const expectedConfigHash=B4_CONFIG_HASHES[['herb-shortage','trade-blocked'].includes(scenario)?'shortage':'normal'];
    if(summary.codeDirty || summary.marketConfigHash!==expectedConfigHash)throw new Error('B4 requires clean code and frozen configuration fingerprint');
    const saved=JSON.parse(await fs.readFile(summary.checkpointPath,'utf8')),bundle={snapshot:saved.snapshot,eventLog:saved.eventLog};
    const metric=auditRun(bundle,summary,scenario);metrics.push(metric);console.log(JSON.stringify({completed:label,elapsedMs:Math.round(summary.elapsedMs),populations:metric.populations,unmetHerbs:metric.unmetHerbs}));
    return {bundle,summary};
  };
  const seed42={};for(const scenario of ['baseline','severe','herb-shortage','trade-blocked'])seed42[scenario]=await run(scenario,42,100,'quick42-'+scenario);
  const repeated=await run('baseline',42,100,'quick42-baseline-repeat');
  if(repeated.summary.stateHash!==seed42.baseline.summary.stateHash || repeated.summary.eventHash!==seed42.baseline.summary.eventHash)throw new Error('B4 repeat mismatch');
  const prefix=await run('baseline',42,40,'quick42-prefix40');
  const resumed=await runSimulation(parseArguments(['--resume',prefix.summary.checkpointPath,'--days','60','--out',path.join(out,'quick42-resume60')]));
  const resumedDisk=JSON.parse(await fs.readFile(resumed.checkpointPath,'utf8'));
  if(JSON.stringify(resumedDisk)!==JSON.stringify(JSON.parse(await fs.readFile(seed42.baseline.summary.checkpointPath,'utf8'))))throw new Error('B4 full checkpoint resume mismatch');
  pairs.push({seed:42,...auditPaired(...['baseline','severe','herb-shortage','trade-blocked'].map(k=>seed42[k].bundle))});
  for(const seed of B4_SEEDS){
    for(const days of [500,1000])await run('baseline',seed,days,`base-${seed}-${days}`);
    await run('mild',seed,500,`mild-${seed}-500`);
    if(seed!==42){
      const bundles={};for(const scenario of ['baseline','severe','herb-shortage','trade-blocked'])bundles[scenario]=(await run(scenario,seed,100,`paired-${seed}-${scenario}`)).bundle;
      pairs.push({seed,...auditPaired(...['baseline','severe','herb-shortage','trade-blocked'].map(k=>bundles[k]))});
    }
  }
  for(const seed of B4_HOLDOUT_SEEDS){await run('baseline',seed,1000,`holdout-base-${seed}-1000`);await run('mild',seed,500,`holdout-mild-${seed}-500`);}
  const report={status:'passed',nodeVersion:process.version,gates:B4_GATES,seeds:B4_SEEDS,holdoutSeeds:B4_HOLDOUT_SEEDS,
    repeat100:true,checkpoint40plus60:true,pairs,metrics,completedRuns:metrics.length+1};
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({status:report.status,completedRuns:report.completedRuns}));return report;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {if(process.argv.length!==3)throw new Error('Usage: node runtime/experiments/b4-experiments.mjs NEW_OUTPUT_DIRECTORY');await runB4Experiments(process.argv[2]);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
