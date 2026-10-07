import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHunterRecovery } from '../../runtime/fixtures/hunter-village.mjs';
import { HUNTER_RULES } from '../../runtime/core/hunter.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-hunter-test-'),folder=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(folder.startsWith(prefix));await fs.rm(folder,{recursive:true,force:true});});return folder;}
function run(b,s,n){const session=createSimulationSession(b,s);session.advanceTicks(n);return session.getBundle();}

test('C2 real disk retains the same recover-health goal, partial wages, inventory, receipt and future action',async t=>{
  const directory=await temporary(t),{bundle,systems}=createHunterRecovery(42,'hunter-disk');
  const continuous=run(bundle,systems,20*144),prefix=run(bundle,systems,2*144);
  assert.equal(prefix.snapshot.world.hunterModel.currentGoal.kind,'recover-health');assert.equal(prefix.snapshot.world.hunterModel.wallet,40);
  const goalId=prefix.snapshot.world.hunterModel.currentGoal.goalId;
  const file=await saveCheckpoint(prefix,{directory,rulesVersion:HUNTER_RULES,systems});
  const restored=await loadCheckpoint(file,{rulesVersion:HUNTER_RULES,systems});
  assert.equal(restored.snapshot.world.hunterModel.currentGoal.goalId,goalId);
  const resumed=run(restored,systems,18*144);assert.deepEqual(resumed,continuous);
  assert.ok(resumed.snapshot.world.hunterModel.ledger.herbsUsed>=3);assert.ok(resumed.snapshot.world.hunterModel.ledger.goalsCompleted>=1);
  const bad=JSON.parse(await fs.readFile(file,'utf8'));bad.snapshot.world.hunterModel.currentGoal.failures++;
  const badFile=path.join(directory,'bad-goal.json');await fs.writeFile(badFile,JSON.stringify(bad));
  await assert.rejects(loadCheckpoint(badFile,{rulesVersion:HUNTER_RULES,systems}),e=>e.code==='INVALID_CHECKPOINT');
});

test('C2 actual CLI outputs action/goal/private accounts and exports internal commands as complete inputs',async t=>{
  const directory=await temporary(t),first=path.join(directory,'first'),resume=path.join(directory,'resume');
  const cli=args=>spawnSync(process.execPath,['simulation-runner.mjs',...args],{cwd:root,encoding:'utf8',timeout:60000});
  const result=cli(['--fixture','hunter-recovery','--days','2','--seed','42','--out',first]);assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(await fs.readFile(path.join(first,'summary.json'),'utf8'));
  assert.equal(summary.rulesVersion,HUNTER_RULES);assert.match(summary.hunterConfigHash,/^[a-f0-9]{64}$/);
  const hunter=await fs.readFile(path.join(first,'hunter.csv'),'utf8');assert.match(hunter,/wallet/);assert.match(hunter,/recover-health/);assert.equal(hunter.trim().split('\n').length,3);
  const actions=await fs.readFile(path.join(first,'actions.csv'),'utf8');assert.match(actions,/WorkForPay/);assert.equal(actions.trim().split('\n').length,3);
  const inputs=JSON.parse(await fs.readFile(path.join(first,'inputs.json'),'utf8'));assert.equal(inputs.length,2);assert.equal(inputs[0].type,'ActorAction');
  const actors=await fs.readFile(path.join(first,'actors.csv'),'utf8');assert.equal(actors.trim().split('\n').length,7);
  const second=cli(['--resume',summary.checkpointPath,'--days','18','--out',resume]);assert.equal(second.status,0,second.stderr);
  const end=JSON.parse(await fs.readFile(path.join(resume,'summary.json'),'utf8'));assert.equal(end.tick,2880);assert.equal(end.hunterConfigHash,summary.hunterConfigHash);
  const checkpoint=JSON.parse(await fs.readFile(end.checkpointPath,'utf8'));assert.ok(checkpoint.snapshot.world.hunterModel.ledger.herbsUsed>=3);
});
