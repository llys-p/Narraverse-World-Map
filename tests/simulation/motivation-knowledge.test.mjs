import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotivationVillage,defaultMotivationVillageConfig} from '../../runtime/fixtures/motivation-village.mjs';
import {createSimulationSession} from '../../runtime/core/command-engine.mjs';
import {buildMotivationKnowledge,projectMotivationInspector} from '../../runtime/knowledge/motivation-knowledge.mjs';
import {buildFastCounterfactual} from '../../runtime/core/motivation-planner.mjs';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';

const run=(config=defaultMotivationVillageConfig(),ticks=288)=>{const f=createMotivationVillage(42,'motivation-village',config),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(ticks);return s.getBundle();};

test('public Knowledge/Inspector are exact actor-local committed clones and CF is pure',()=>{
  const b=run(),before=canonicalJson(b),k=buildMotivationKnowledge(b,'actor-2'),view=projectMotivationInspector(b);
  assert.deepEqual(Object.keys(k).sort(),['knowledgeVersion','phase','simulationId','actorId','tick','revision','self','quote','observations','belief','profile','duty','planState'].sort());
  assert.equal(k.phase,'committed');assert.equal(k.revision,288);assert.equal(k.tick,288);assert.equal(k.self.currentGoal.goalId,1);
  assert.equal(view.mindVersion,'motivation-inspector-v1');assert.equal(view.actors.length,2);assert.deepEqual(Object.keys(view.worldFacts).sort(),['publicFood','publicHerbs','postedHerbPrice'].sort());
  const d=view.actors[0].lastDecision;assert.equal(JSON.parse(d.knowledgeFingerprint).phase,'decision');assert.equal(JSON.parse(d.knowledgeFingerprint).revision,287);
  assert.deepEqual(view.actors[0].counterfactual.map(c=>c.choice),['WorkForPay','UseMedicine','UseMedicine']);
  assert.deepEqual(buildFastCounterfactual(d),view.actors[0].counterfactual);
  assert.doesNotMatch(canonicalJson(view),/communalGold|"world"|"rng"|"eventLog"/);
  k.self.wallet=999;k.planState.suspendedPlan.planId=999;view.actors[0].lastOutcome.delta.wallet=999;view.worldFacts.publicFood=999;
  assert.equal(canonicalJson(b),before);assert.equal(buildMotivationKnowledge(b,'actor-2').self.wallet,70);
});

test('unobserved future requests are absent, unavailable actors reject and initial CF is null',()=>{
  const f=createMotivationVillage(),view=projectMotivationInspector(f.bundle);assert.equal(view.actors.every(a=>a.counterfactual===null),true);
  assert.equal(buildMotivationKnowledge(f.bundle,'actor-2').duty,null);
  assert.throws(()=>buildMotivationKnowledge(f.bundle,'actor-4'),e=>e.code==='MIND_UNAVAILABLE');
  const b=run(defaultMotivationVillageConfig(),143);assert.equal(buildMotivationKnowledge(b,'actor-2').duty,null);
  assert.equal(b.snapshot.world.mindModel.actors[0].observations[0].channel,'market-check');
});

test('CF preserves commitment when the high score Work was blocked',()=>{
  const c=defaultMotivationVillageConfig();Object.assign(c.motivation.profiles[0],{dutyWeightPermille:1000,riskAversionPermille:0});c.motivation.requests[0].urgencyPermille=899;
  const b=run(c),cf=projectMotivationInspector(b).actors[0].counterfactual;
  assert.ok(cf.every(c=>c.gateReason==='CONTINUE_COMMITTED'&&c.choice==='UseMedicine'));
  assert.equal(cf[0].candidates[2].score,899);assert.equal(cf[0].candidates[2].selectable,false);assert.equal(cf[0].candidates[2].selectionBlockCode,'COMMITMENT_PROTECTED');
});

test('unsafe data and cross-config budgets reject before allocating or publishing state',()=>{
  const c=defaultMotivationVillageConfig();c.mind.stimuli=Array.from({length:8},(_,i)=>({stimulusId:'s'+i,tick:12,kind:'market-check',listenerId:'actor-2'}));
  c.motivation.requests=[{requestId:'d',tick:12,speakerId:'actor-1',listenerId:'actor-2',urgencyPermille:1000,expiresTick:144}];
  assert.throws(()=>createMotivationVillage(42,'budget',c),e=>e.code==='LIMIT_EXCEEDED');
  const total=defaultMotivationVillageConfig();total.mind.stimuli=Array.from({length:64},(_,i)=>({stimulusId:'s'+i,tick:i+1,kind:'market-check',listenerId:'actor-2'}));
  assert.throws(()=>createMotivationVillage(42,'budget',total),e=>e.code==='LIMIT_EXCEEDED');
  const frozen=defaultMotivationVillageConfig();frozen.memory.society.economics.wage=21;
  assert.throws(()=>createMotivationVillage(42,'frozen',frozen),e=>e.code==='UNSUPPORTED_VERSION');
  let reads=0;const unsafe=defaultMotivationVillageConfig();Object.defineProperty(unsafe.memory,'bad',{enumerable:true,get(){reads++;return 1;}});
  assert.throws(()=>createMotivationVillage(42,'unsafe',unsafe));assert.equal(reads,0);
  const b=createMotivationVillage().bundle;Object.defineProperty(b.snapshot.world,'bad',{enumerable:true,get(){reads++;return 1;}});
  assert.throws(()=>projectMotivationInspector(b));assert.equal(reads,0);
});
