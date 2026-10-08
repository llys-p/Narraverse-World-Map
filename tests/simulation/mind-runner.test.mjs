// M1A mind runner: K5 identical save/resume splits (default and competition), tampered
// checkpoint rejection, whole-tick rollback on system faults, and the real CLI artifact
// set including mind-inspector.json across a 2-day save + 1-day resume.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createMindVillage,defaultMindVillageConfig,mindSystems } from '../../runtime/fixtures/mind-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { MIND_RULES } from '../../runtime/core/mind-state.mjs';
import { fault } from '../../runtime/core/data-contract.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { runSimulation,parseArguments } from '../../simulation-runner.mjs';

const systems=mindSystems();
const advance=(config,ticks)=>{const f=createMindVillage(42,'mind-village',structuredClone(config));
  const s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(ticks);return s.getBundle();};
const competition=()=>{const config=structuredClone(defaultMindVillageConfig());
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial=1;
  config.mind.stimuli=[
    {stimulusId:'s01',tick:12,kind:'market-check',listenerId:'actor-2'},
    {stimulusId:'s02',tick:24,kind:'market-check',listenerId:'actor-3'}];
  return config;};
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-mind-test-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
async function saved(t,bundle){const dir=await temporary(t);
  return await saveCheckpoint(bundle,{directory:dir,rulesVersion:MIND_RULES,systems});}
async function resume(file,ticks){const loaded=await loadCheckpoint(file,{rulesVersion:MIND_RULES,systems});
  const s=createSimulationSession(loaded,systems);s.advanceTicks(ticks);return s.getBundle();}

test('K5 default split: continuous 288 equals 24+264 and equals 143+145',async t=>{
  const config=defaultMindVillageConfig(),whole=advance(config,288);
  const file24=await saved(t,advance(config,24));
  assert.deepEqual(await resume(file24,264),whole);
  const file143=await saved(t,advance(config,143));
  assert.deepEqual(await resume(file143,145),whole);
});

test('K5 competition split: continuous 288 equals a save right after the 144 rejection plus 144',async t=>{
  const config=competition(),whole=advance(config,288);
  const b144=advance(config,144);
  const r=b144.snapshot.commandReceipts['mind-day-1-actor-3'];
  assert.equal(r.status,'rejected');
  const file=await saved(t,b144);
  assert.deepEqual(await resume(file,144),whole);
});

test('K5 tampered checkpoints are rejected as INVALID_CHECKPOINT',async t=>{
  const whole=advance(defaultMindVillageConfig(),288);
  const file=await saved(t,whole);
  const source=JSON.parse(await fs.readFile(file,'utf8'));
  const mind=(b)=>b.snapshot.world.mindModel.actors.find(a=>a.actorId==='actor-2');
  const reject=async(bad)=>{const badFile=path.join(path.dirname(file),'tampered-'+Math.random().toString(36).slice(2)+'.json');
    await fs.writeFile(badFile,JSON.stringify(bad));
    await assert.rejects(loadCheckpoint(badFile,{rulesVersion:MIND_RULES,systems}),e=>e.code==='INVALID_CHECKPOINT');};
  const stamp=(mutate)=>{const bad=structuredClone(source);mutate(bad);return bad;};
  await reject(stamp(bad=>{bad.snapshot.world.mindModel.config.stimuli[0].available=true;}));
  await reject(stamp(bad=>{bad.snapshot.world.mindModel.scriptCursor++;}));
  await reject(stamp(bad=>{mind(bad).observations[0].observedTick++;}));
  await reject(stamp(bad=>{mind(bad).lastDecision.choice='NoAction';}));
  await reject(stamp(bad=>{bad.snapshot.world.mindModel.cursor++;}));
  await reject(stamp(bad=>{bad.snapshot.commandReceipts['mind-day-9-actor-9']=structuredClone(bad.snapshot.commandReceipts['mind-day-2-actor-2']);}));
  await reject(stamp(bad=>{bad.eventLog.push(structuredClone(bad.eventLog[bad.eventLog.length-1]));}));
});

test('system faults roll the whole tick back: the last committed bundle survives unchanged',()=>{
  const survivor=advance(defaultMindVillageConfig(),431);
  const hostile={society(){throw fault('INVALID_INPUT','hostile settlement');}};
  const s=createSimulationSession(survivor,hostile);
  assert.throws(()=>s.advanceTicks(1),e=>e.failedTick===432&&e.code==='INVALID_INPUT');
  assert.deepEqual(s.getBundle(),survivor);
});

test('CLI artifacts: 2 days saved then 1 resumed equals a straight 3-day run with mind-inspector.json',async t=>{
  const dir=await temporary(t),first=path.join(dir,'first'),resumed=path.join(dir,'resumed'),straight=path.join(dir,'straight');
  const summary=await runSimulation(parseArguments(['--fixture','mind-village','--days','2','--seed','42','--out',first]));
  assert.equal(summary.status,'succeeded');
  assert.equal(summary.rulesVersion,MIND_RULES);
  assert.match(summary.mindInspectorHash,/^[a-f0-9]{64}$/);
  assert.match(summary.mindConfigHash,/^[a-f0-9]{64}$/);
  await runSimulation(parseArguments(['--resume',summary.checkpointPath,'--days','1','--out',resumed]));
  const straightSummary=await runSimulation(parseArguments(['--fixture','mind-village','--days','3','--seed','42','--out',straight]));
  assert.equal(straightSummary.status,'succeeded');
  for(const file of ['mind-inspector.json','mind-config.json','events.csv','inputs.json','memory-config.json',
    'memories.csv','relationships.csv','society.csv','actions.csv','actors.csv','economy.csv']) {
    assert.equal(await fs.readFile(path.join(resumed,file),'utf8'),await fs.readFile(path.join(straight,file),'utf8'),file);
  }
  const resumedSummary=JSON.parse(await fs.readFile(path.join(resumed,'summary.json'),'utf8'));
  assert.equal(resumedSummary.stateHash,straightSummary.stateHash);
  assert.equal(resumedSummary.eventHash,straightSummary.eventHash);
  assert.deepEqual(JSON.parse(await fs.readFile(resumedSummary.checkpointPath,'utf8')),
    JSON.parse(await fs.readFile(straightSummary.checkpointPath,'utf8')));
  const inspector=JSON.parse(await fs.readFile(path.join(resumed,'mind-inspector.json'),'utf8'));
  assert.equal(inspector.apiVersion,1);
  assert.equal(inspector.tick,432);
  assert.equal(inspector.actors.length,2);
});