import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPersonalityFood } from '../../runtime/fixtures/personality-village.mjs';
import { PERSONALITY_RULES } from '../../runtime/core/memory-runtime.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-personality-test-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}

test('C5 real disk: persistent preferences, active goal and private assets continue identically; changing a valid config fingerprint cannot change history',async t=>{
  const dir=await temporary(t),f=createPersonalityFood(42),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(2*144);
  const file=await saveCheckpoint(s.getBundle(),{directory:dir,rulesVersion:PERSONALITY_RULES,systems:f.systems});
  const loaded=await loadCheckpoint(file,{rulesVersion:PERSONALITY_RULES,systems:f.systems});
  const resumed=createSimulationSession(loaded,f.systems);resumed.advanceTicks(2*144);s.advanceTicks(2*144);assert.deepEqual(resumed.getBundle(),s.getBundle());
  const bad=JSON.parse(await fs.readFile(file,'utf8')),m=bad.snapshot.world.memoryModel;
  m.config.personalities[1].foodWeightPermille=1000;m.configFingerprint=canonicalJson(m.config);
  const corrupt=path.join(dir,'bad.json');await fs.writeFile(corrupt,JSON.stringify(bad));
  await assert.rejects(loadCheckpoint(corrupt,{rulesVersion:PERSONALITY_RULES,systems:f.systems}),e=>e.code==='INVALID_CHECKPOINT');
});

test('C5 real CLI: complete preferences and all memory/social exports survive full four versus two saved plus two resumed days',async t=>{
  const dir=await temporary(t),cli=args=>spawnSync(process.execPath,['simulation-runner.mjs',...args],{cwd:root,encoding:'utf8',timeout:180000});
  const whole=path.join(dir,'whole'),prefix=path.join(dir,'prefix'),resumed=path.join(dir,'resumed');
  for(const [out,days] of [[whole,4],[prefix,2]]){const r=cli(['--fixture','personality-food','--days',String(days),'--seed','42','--out',out]);assert.equal(r.status,0,r.stderr);}
  const first=JSON.parse(await fs.readFile(path.join(prefix,'summary.json'),'utf8'));
  const result=cli(['--resume',first.checkpointPath,'--days','2','--out',resumed]);assert.equal(result.status,0,result.stderr);
  const a=JSON.parse(await fs.readFile(path.join(whole,'summary.json'),'utf8')),b=JSON.parse(await fs.readFile(path.join(resumed,'summary.json'),'utf8'));
  assert.equal(a.rulesVersion,PERSONALITY_RULES);assert.match(a.personalityConfigHash,/^[a-f0-9]{64}$/);assert.equal(a.personalityConfigHash,b.personalityConfigHash);
  assert.equal(await fs.readFile(a.checkpointPath,'utf8'),await fs.readFile(b.checkpointPath,'utf8'));
  for(const file of ['personality-config.json','memory-config.json','memories.csv','relationships.csv','society.csv','actions.csv','actors.csv','economy.csv','events.csv','inputs.json'])
    assert.equal(await fs.readFile(path.join(whole,file),'utf8'),await fs.readFile(path.join(resumed,file),'utf8'));
});
