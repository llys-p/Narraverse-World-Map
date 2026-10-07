import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createEcologyVillage } from '../../runtime/fixtures/ecology-village.mjs';
import { defaultEcologyConfig, ECOLOGY_RULES } from '../../runtime/core/ecology.mjs';
import { advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-ecology-test-'),folder=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(folder.startsWith(prefix));await fs.rm(folder,{recursive:true,force:true});});return folder;}
const advance=(b,s,ticks)=>{for(let i=0;i<ticks;i++)b=advanceOneTick(b,s);return b;};

test('B2 real disk split keeps future intervention, injury RNG, receipts, causal lineage and full state',async t=>{
  const directory=await temporary(t),command={commandId:'after-save',targetTick:145,type:'RemovePopulation',payload:{species:'deer',amount:120}};
  const {bundle,systems}=createEcologyVillage(1,'ecology-disk',defaultEcologyConfig(),[command]);
  const whole=advance(bundle,systems,3*144),prefix=advance(bundle,systems,144);
  const file=await saveCheckpoint(prefix,{directory,rulesVersion:ECOLOGY_RULES,systems});
  const loaded=await loadCheckpoint(file,{rulesVersion:ECOLOGY_RULES,systems});
  const resumed=advance(loaded,systems,2*144);assert.deepEqual(resumed,whole);
  assert.equal(resumed.snapshot.commandReceipts['after-save'].status,'succeeded');
  assert.ok(resumed.eventLog.some(e=>e.type==='EcologyDaySettled' && e.payload.farmLoss>0));
  const bad=JSON.parse(await fs.readFile(file,'utf8'));bad.snapshot.rng.state++;
  const badFile=path.join(directory,'bad-rng.json');await fs.writeFile(badFile,JSON.stringify(bad));
  await assert.rejects(loadCheckpoint(badFile,{rulesVersion:ECOLOGY_RULES,systems}),e=>e.code==='INVALID_CHECKPOINT');
});

test('B2 real CLI exports population/ecology/resource columns and preserves registered fixture when resuming',async t=>{
  const directory=await temporary(t),first=path.join(directory,'first'),resume=path.join(directory,'resume');
  const cli=args=>spawnSync(process.execPath,['simulation-runner.mjs',...args],{cwd:root,encoding:'utf8',timeout:60000});
  const result=cli(['--fixture','ecology-deer-shock','--days','1','--seed','1','--out',first]);assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(await fs.readFile(path.join(first,'summary.json'),'utf8'));
  assert.equal(summary.rulesVersion,ECOLOGY_RULES);assert.equal(summary.fixtureId,'ecology-deer-shock');assert.match(summary.ecologyConfigHash,/^[a-f0-9]{64}$/);
  const config=JSON.parse(await fs.readFile(path.join(first,'ecology-config.json'),'utf8'));assert.equal(config.version,'ecology-config-v1');
  const population=await fs.readFile(path.join(first,'population.csv'),'utf8');assert.match(population,/deer.*wolves/);assert.equal(population.trim().split('\n').length,2);
  const ecology=await fs.readFile(path.join(first,'ecology.csv'),'utf8');assert.match(ecology,/pressurePermille/);assert.match(ecology,/farmLoss/);
  const economy=await fs.readFile(path.join(first,'economy.csv'),'utf8');assert.equal(economy.trim().split('\n').length,4);
  const inputs=JSON.parse(await fs.readFile(path.join(first,'inputs.json'),'utf8'));assert.equal(inputs[0].targetTick,1440);assert.equal(inputs[0].payload.amount,90);
  const second=cli(['--resume',summary.checkpointPath,'--days','1','--out',resume]);assert.equal(second.status,0,second.stderr);
  const end=JSON.parse(await fs.readFile(path.join(resume,'summary.json'),'utf8'));assert.equal(end.tick,288);assert.equal(end.ecologyConfigHash,summary.ecologyConfigHash);
});
