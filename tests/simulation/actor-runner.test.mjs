import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createActorNeeds,createActorShortage } from '../../runtime/fixtures/actor-village.mjs';
import { ACTOR_RULES } from '../../runtime/core/actors.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-actor-test-'),folder=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(folder.startsWith(prefix));await fs.rm(folder,{recursive:true,force:true});});return folder;}
function run(bundle,systems,ticks){const session=createSimulationSession(bundle,systems);session.advanceTicks(ticks);return session.getBundle();}

test('C1 real disk needs and tombstones survive split with no extra consumption or identity recreation',async t=>{
  const directory=await temporary(t);
  for(const [index,factory] of [createActorNeeds,createActorShortage].entries()){
    const {bundle,systems}=factory(0,'actor-disk-'+index),whole=run(bundle,systems,4*144),prefix=run(bundle,systems,144);
    const file=await saveCheckpoint(prefix,{directory:path.join(directory,'case-'+index),rulesVersion:ACTOR_RULES,systems});
    const loaded=await loadCheckpoint(file,{rulesVersion:ACTOR_RULES,systems});
    const resumed=run(loaded,systems,3*144);assert.deepEqual(resumed,whole);assert.equal(resumed.snapshot.nextEntityId,4);
    const corrupt=JSON.parse(await fs.readFile(file,'utf8'));corrupt.snapshot.world.actorModel.actors[0].needs.food++;
    const badFile=path.join(directory,'bad-'+index+'.json');await fs.writeFile(badFile,JSON.stringify(corrupt));
    await assert.rejects(loadCheckpoint(badFile,{rulesVersion:ACTOR_RULES,systems}),e=>e.code==='INVALID_CHECKPOINT');
  }
});

test('C1 actual CLI exports per-person needs, conserved human totals and restores Actor fixture',async t=>{
  const directory=await temporary(t),first=path.join(directory,'first'),resumed=path.join(directory,'resumed');
  const cli=args=>spawnSync(process.execPath,['simulation-runner.mjs',...args],{cwd:root,encoding:'utf8',timeout:60000});
  const result=cli(['--fixture','actor-needs','--days','1','--seed','0','--out',first]);assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(await fs.readFile(path.join(first,'summary.json'),'utf8'));
  assert.equal(summary.rulesVersion,ACTOR_RULES);assert.match(summary.actorConfigHash,/^[a-f0-9]{64}$/);
  const config=JSON.parse(await fs.readFile(path.join(first,'actor-config.json'),'utf8'));assert.equal(config.version,'actor-config-v1');
  const actors=await fs.readFile(path.join(first,'actors.csv'),'utf8');assert.match(actors,/hunger/);assert.match(actors,/actor-2/);
  assert.equal(actors.trim().split('\n').length,4);
  const population=await fs.readFile(path.join(first,'population.csv'),'utf8');assert.match(population,/totalAlive,namedAlive,unnamedAlive/);
  const checkpoint=JSON.parse(await fs.readFile(summary.checkpointPath,'utf8'));assert.equal(checkpoint.snapshot.world.actorModel.actors[1].health,600);
  const economy=await fs.readFile(path.join(first,'economy.csv'),'utf8');assert.equal(economy.trim().split('\n').length,4);
  const second=cli(['--resume',summary.checkpointPath,'--days','3','--out',resumed]);assert.equal(second.status,0,second.stderr);
  const end=JSON.parse(await fs.readFile(path.join(resumed,'summary.json'),'utf8'));assert.equal(end.tick,576);assert.equal(end.actorConfigHash,summary.actorConfigHash);
  const restored=JSON.parse(await fs.readFile(end.checkpointPath,'utf8'));assert.equal(restored.snapshot.world.actorModel.actors[1].health,900);
});
