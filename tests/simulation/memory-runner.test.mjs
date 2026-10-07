import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMemoryRelations } from '../../runtime/fixtures/memory-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { MEMORY_RULES } from '../../runtime/core/memory-runtime.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-memory-test-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}

test('C4 real disk: relationship/goal/observation source continues; corrupted observer cannot load',async t=>{
  const dir=await temporary(t),f=createMemoryRelations(42),session=createSimulationSession(f.bundle,f.systems);session.advanceTicks(4*144);
  const file=await saveCheckpoint(session.getBundle(),{directory:dir,rulesVersion:MEMORY_RULES,systems:f.systems});
  const loaded=await loadCheckpoint(file,{rulesVersion:MEMORY_RULES,systems:f.systems}),resumed=createSimulationSession(loaded,f.systems);resumed.advanceTicks(4*144);
  session.advanceTicks(4*144);assert.deepEqual(resumed.getBundle(),session.getBundle());
  const bad=JSON.parse(await fs.readFile(file,'utf8'));bad.snapshot.world.memoryModel.observer.actors[1].relationships[0].trust++;
  const badFile=path.join(dir,'bad-memory.json');await fs.writeFile(badFile,JSON.stringify(bad));
  await assert.rejects(loadCheckpoint(badFile,{rulesVersion:MEMORY_RULES,systems:f.systems}),e=>e.code==='INVALID_CHECKPOINT');
});

test('C4 real CLI: memory/config/source exports plus all social assets survive the identical full versus disk-resume path',async t=>{
  const dir=await temporary(t),cli=args=>spawnSync(process.execPath,['simulation-runner.mjs',...args],{cwd:root,encoding:'utf8',timeout:180000});
  const whole=path.join(dir,'whole'),prefix=path.join(dir,'prefix'),resumed=path.join(dir,'resumed');
  for(const [out,days] of [[whole,6],[prefix,4]]){const r=cli(['--fixture','memory-relations','--days',String(days),'--seed','42','--out',out]);assert.equal(r.status,0,r.stderr);}
  const first=JSON.parse(await fs.readFile(path.join(prefix,'summary.json'),'utf8'));
  const result=cli(['--resume',first.checkpointPath,'--days','2','--out',resumed]);assert.equal(result.status,0,result.stderr);
  const a=JSON.parse(await fs.readFile(path.join(whole,'summary.json'),'utf8')),b=JSON.parse(await fs.readFile(path.join(resumed,'summary.json'),'utf8'));
  assert.equal(a.rulesVersion,MEMORY_RULES);assert.match(a.memoryConfigHash,/^[a-f0-9]{64}$/);assert.equal(a.memoryConfigHash,b.memoryConfigHash);
  assert.deepEqual(JSON.parse(await fs.readFile(a.checkpointPath,'utf8')),JSON.parse(await fs.readFile(b.checkpointPath,'utf8')));
  for(const file of ['memory-config.json','memories.csv','relationships.csv','society.csv','actions.csv','actors.csv','economy.csv','events.csv','inputs.json'])assert.equal(await fs.readFile(path.join(whole,file),'utf8'),await fs.readFile(path.join(resumed,file),'utf8'));
  const memories=await fs.readFile(path.join(whole,'memories.csv'),'utf8');assert.match(memories,/sourceEventSeq,occurrenceTick,observedTick,channel,importance/);assert.match(memories,/interaction/);
  const relations=await fs.readFile(path.join(whole,'relationships.csv'),'utf8');assert.match(relations,/actor-2,actor-3,30,/);
});
