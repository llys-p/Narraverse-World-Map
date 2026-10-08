import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createMotivationVillage,defaultMotivationVillageConfig,motivationSystems} from '../../runtime/fixtures/motivation-village.mjs';
import {createSimulationSession} from '../../runtime/core/command-engine.mjs';
import {validateBundle} from '../../runtime/core/world-state.mjs';
import {MOTIVATION_RULES} from '../../runtime/core/motivation-state.mjs';
import {fault} from '../../runtime/core/data-contract.mjs';
import {executeMotivationPlayerIntent} from '../../runtime/core/motivation-runtime.mjs';
import {saveCheckpoint,loadCheckpoint} from '../../runtime/persistence/checkpoint-store.mjs';
import {runSimulation,parseArguments} from '../../simulation-runner.mjs';

const systems=motivationSystems();
const advance=ticks=>{const f=createMotivationVillage(),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(ticks);return s.getBundle();};
async function temp(t){const prefix=path.join(os.tmpdir(),'world-motivation-test-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}

test('complete 576 ticks equals checkpoint resumes from request, duty and urgent boundaries',async t=>{
  const dir=await temp(t),whole=advance(576);
  for(const split of [200,288,432]){const file=await saveCheckpoint(advance(split),{directory:dir,rulesVersion:MOTIVATION_RULES,systems});
    const loaded=await loadCheckpoint(file,{rulesVersion:MOTIVATION_RULES,systems});
    const s=createSimulationSession(loaded,systems);s.advanceTicks(576-split);assert.deepEqual(s.getBundle(),whole);
  }
});

test('complete audit rejects altered sources, gates, duty, plan binding, outcomes, cursors and extra facts',()=>{
  const base=advance(288),m=b=>b.snapshot.world.motivationModel.actors[0];
  const planned=b=>b.eventLog.find(e=>e.type==='MotivationDecisionPlanned'&&e.tick===288&&e.payload.actorId==='actor-2');
  const resolved=b=>b.eventLog.find(e=>e.type==='MotivationDecisionResolved'&&e.tick===288&&e.payload.actorId==='actor-2');
  for(const change of [
    b=>{m(b).lastReviewedDutyId=null;},b=>{m(b).lastDuty.fulfilledTick=287;},b=>{m(b).lastDuty.status='pending';m(b).lastDuty.fulfilledTick=null;},
    b=>{m(b).suspendedPlan.goalId=2;},b=>{m(b).suspendedPlan.stepIndex=0;},b=>{b.snapshot.world.motivationModel.cursor--;},b=>{b.snapshot.world.motivationModel.requestCursor=0;},
    b=>{planned(b).payload.candidates[2].provider='health-need';},b=>{planned(b).payload.candidates[2].sourceRef='other';},
    b=>{planned(b).payload.candidates[0].selectable=false;planned(b).payload.candidates[0].selectionBlockCode='COMMITMENT_PROTECTED';},
    b=>{planned(b).payload.gateReason='SELECT_NEW_PLAN';},b=>{planned(b).payload.candidates[2].score++;},
    b=>{planned(b).payload.knowledgeFingerprint+=' ';},b=>{resolved(b).payload.failureOwner={planId:2,goalId:1};},
    b=>{b.snapshot.world.societyModel.agents[1].state.currentGoal.failures++;},
    b=>{b.eventLog.at(-1).payload.activePlan={...m(b).suspendedPlan,status:'ready'};},
    b=>{b.eventLog.push({...structuredClone(b.eventLog.at(-1)),eventSeq:b.snapshot.nextEventSeq++});b.snapshot.world.mindModel.cursor++;b.snapshot.world.motivationModel.cursor++;}
  ]){const bad=structuredClone(base);change(bad);assert.throws(()=>validateBundle(bad,{rulesVersion:MOTIVATION_RULES,systems}));}
});

test('failed settlement rolls back all motivation decisions, IDs and new receipts in the tick',()=>{
  const before=advance(287),s=createSimulationSession(before,{society(){throw fault('INVALID_INPUT','injected settlement fault');}});
  assert.throws(()=>s.advanceTicks(1),e=>e.failedTick===288&&e.code==='INVALID_INPUT');assert.deepEqual(s.getBundle(),before);
});

test('checkpoint at an off-boundary supersession preserves cancellation and the suspended original plan',async t=>{
  const c=defaultMotivationVillageConfig();c.memory.society.player.initialHerbs=20;
  c.memory.society.actors.market.ecology.resources.resources.herbs.initial=50;c.memory.society.actors.market.ecology.resources.resources.gold.initial=350;
  c.motivation.requests.push({requestId:'replacement',tick:310,speakerId:'actor-1',listenerId:'actor-2',urgencyPermille:899,expiresTick:454});
  const f=createMotivationVillage(42,'supersession',c),s=createSimulationSession(f.bundle,systems);s.advanceTicks(144);
  const sold=executeMotivationPlayerIntent(s.getBundle(),{commandId:'drain',type:'PlayerSell',payload:{product:'herbs',quantity:7}}).bundle;
  const before=createSimulationSession(sold,systems);before.advanceTicks(165);const at310=before.getBundle();
  const cancellation=at310.eventLog.find(e=>e.tick===310&&e.type==='MotivationPlanSettled');assert.equal(cancellation.payload.transitions[0].reasonCode,'REQUEST_SUPERSEDED');
  const file=await saveCheckpoint(at310,{directory:await temp(t),rulesVersion:MOTIVATION_RULES,systems});
  const loaded=await loadCheckpoint(file,{rulesVersion:MOTIVATION_RULES,systems}),resumed=createSimulationSession(loaded,systems);resumed.advanceTicks(122);
  before.advanceTicks(122);assert.deepEqual(resumed.getBundle(),before.getBundle());
  assert.equal(resumed.getBundle().snapshot.world.motivationModel.actors[0].lastDecision.planId,1);
});

test('CLI two-day save plus two-day resume matches straight four days and every original export',async t=>{
  const dir=await temp(t),first=path.join(dir,'first'),resumed=path.join(dir,'resumed'),straight=path.join(dir,'straight');
  const a=await runSimulation(parseArguments(['--fixture','motivation-village','--days','2','--seed','42','--out',first]));
  assert.equal(a.status,'succeeded');assert.equal(a.rulesVersion,MOTIVATION_RULES);assert.match(a.motivationInspectorHash,/^[a-f0-9]{64}$/);
  const b=await runSimulation(parseArguments(['--resume',a.checkpointPath,'--days','2','--out',resumed]));
  const c=await runSimulation(parseArguments(['--fixture','motivation-village','--days','4','--seed','42','--out',straight]));
  assert.equal(b.stateHash,c.stateHash);assert.equal(b.eventHash,c.eventHash);
  for(const file of ['motivation-config.json','motivation-inspector.json','mind-config.json','resource-config.json','ecology-config.json','market-config.json',
    'actor-config.json','society-config.json','memory-config.json','events.csv','inputs.json','economy.csv','population.csv','ecology.csv','market.csv','trade.csv',
    'actors.csv','society.csv','actions.csv','memories.csv','relationships.csv'])assert.equal(await fs.readFile(path.join(resumed,file),'utf8'),await fs.readFile(path.join(straight,file),'utf8'),file);
  assert.deepEqual(JSON.parse(await fs.readFile(b.checkpointPath,'utf8')),JSON.parse(await fs.readFile(c.checkpointPath,'utf8')));
  const view=JSON.parse(await fs.readFile(path.join(resumed,'motivation-inspector.json'),'utf8'));assert.equal(view.tick,576);assert.equal(view.actors[0].lastDecision.choice,'UseMedicine');
});
