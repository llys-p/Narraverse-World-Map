import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSocietyMedicineRace,createSocietyPeerSale } from '../../runtime/fixtures/society-village.mjs';
import { SOCIETY_RULES } from '../../runtime/core/society.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-society-test-'),folder=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(folder.startsWith(prefix));await fs.rm(folder,{recursive:true,force:true});});return folder;}
function run(b,s,n){const session=createSimulationSession(b,s);session.advanceTicks(n);return session.getBundle();}

test('C3 real disk keeps failed medicine bids and completed peer delivery, then uses the same Goals after reload',async t=>{
  const directory=await temporary(t);
  for(const [index,factory] of [createSocietyMedicineRace,createSocietyPeerSale].entries()){
    const {bundle,systems}=factory(42,'society-disk-'+index),whole=run(bundle,systems,4*144),prefix=run(bundle,systems,144);
    const file=await saveCheckpoint(prefix,{directory:path.join(directory,'case-'+index),rulesVersion:SOCIETY_RULES,systems});
    const loaded=await loadCheckpoint(file,{rulesVersion:SOCIETY_RULES,systems});assert.deepEqual(run(loaded,systems,3*144),whole);
    const bad=JSON.parse(await fs.readFile(file,'utf8'));bad.snapshot.world.societyModel.agents[1].state.currentGoal.failures++;
    const badFile=path.join(directory,'bad-'+index+'.json');await fs.writeFile(badFile,JSON.stringify(bad));
    await assert.rejects(loadCheckpoint(badFile,{rulesVersion:SOCIETY_RULES,systems}),e=>e.code==='INVALID_CHECKPOINT');
  }
});

test('C3 real CLI exports all estates and sale parties plus complete rejected internal intents',async t=>{
  const directory=await temporary(t),first=path.join(directory,'first'),resume=path.join(directory,'resume');
  const cli=args=>spawnSync(process.execPath,['simulation-runner.mjs',...args],{cwd:root,encoding:'utf8',timeout:60000});
  const result=cli(['--fixture','society-peer-sale','--days','1','--seed','42','--out',first]);assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(await fs.readFile(path.join(first,'summary.json'),'utf8'));assert.equal(summary.rulesVersion,SOCIETY_RULES);assert.match(summary.societyConfigHash,/^[a-f0-9]{64}$/);
  const society=await fs.readFile(path.join(first,'society.csv'),'utf8');assert.equal(society.trim().split('\n').length,4);assert.match(society,/sell-medicine/);
  const actions=await fs.readFile(path.join(first,'actions.csv'),'utf8');assert.equal(actions.trim().split('\n').length,4);assert.match(actions,/SellMedicine/);assert.match(actions,/actor-2/);
  const actors=await fs.readFile(path.join(first,'actors.csv'),'utf8');assert.equal(actors.trim().split('\n').length,4);
  const inputs=JSON.parse(await fs.readFile(path.join(first,'inputs.json'),'utf8'));assert.equal(inputs.length,3);assert.equal(inputs[0].type,'SocietyAction');
  const second=cli(['--resume',summary.checkpointPath,'--days','3','--out',resume]);assert.equal(second.status,0,second.stderr);
  const end=JSON.parse(await fs.readFile(path.join(resume,'summary.json'),'utf8'));assert.equal(end.tick,576);assert.equal(end.societyConfigHash,summary.societyConfigHash);
});
