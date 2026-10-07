import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalityHealth,createPersonalityFood,createPersonalityNeutral,createPersonalityVillage } from '../../runtime/fixtures/personality-village.mjs';
import { createMemoryVillage } from '../../runtime/fixtures/memory-village.mjs';
import { PERSONALITY_RULES,defaultPersonalityConfig,createMemoryWorld } from '../../runtime/core/memory-runtime.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { buildActorKnowledge } from '../../runtime/knowledge/actor-knowledge.mjs';
const run=(f,days)=>{const s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(days*144);return s.getBundle();};
const bad=e=>['INVALID_INPUT','UNSUPPORTED_VERSION'].includes(e.code);

test('C5 real engine: only persistent preferences change the new goal and actual cash/goods in identical circumstances',()=>{
  const health=createPersonalityHealth(42),food=createPersonalityFood(42),neutral=createPersonalityNeutral(42);
  const comparable=f=>{const w=structuredClone(f.bundle.snapshot.world);delete w.memoryModel.config.personalities;delete w.memoryModel.configFingerprint;return w;};
  assert.deepEqual(comparable(health),comparable(food));assert.deepEqual(comparable(food),comparable(neutral));
  const h=run(health,1),f=run(food,1);
  const action=b=>b.eventLog.find(e=>e.type==='SocietyActionCommitted' && e.payload.actorId==='actor-2');
  assert.equal(action(h).payload.action,'BuyMedicine');assert.equal(action(f).payload.action,'BuyFood');
  assert.equal(h.snapshot.world.societyModel.agents[1].state.currentGoal.kind,'recover-health');
  assert.equal(f.eventLog.find(e=>e.type==='SocietyDaySettled').payload.agents[1].decision.kind,'secure-food');
  assert.equal(f.eventLog.find(e=>e.type==='SocietyDaySettled').payload.agents[1].goalOutcome,'completed');
  for(const b of [h,f]){const a=action(b).payload;assert.equal(a.before.wallet-a.after.wallet,a.price);assert.ok(a.price>0);assert.equal(b.snapshot.world.resources.gold<=20000,true);}
  assert.equal(action(h).payload.after.inventory.herbs,1);assert.equal(action(f).payload.after.inventory.food,1);
});

test('C5 real replay/knowledge: original personality, scores and rule/config pairing are authenticated; only own preferences are readable',()=>{
  const fixture=createPersonalityFood(42),good=run(fixture,2),known=buildActorKnowledge(good,'actor-2');
  assert.equal(known.self.personality.foodWeightPermille,2000);assert.equal(Object.hasOwn(known.public,'personalities'),false);
  const encoded=JSON.stringify(known);assert.equal(encoded.includes('personalities'),false);assert.equal(encoded.includes('initialActors'),false);
  known.self.personality.foodWeightPermille=500;assert.equal(buildActorKnowledge(good,'actor-2').self.personality.foodWeightPermille,2000);
  for(const mutate of [b=>{const m=b.snapshot.world.memoryModel;m.config.personalities[1].foodWeightPermille=1000;m.configFingerprint=canonicalJson(m.config);},
    b=>b.eventLog.find(e=>e.type==='SocietyDaySettled').payload.agents[1].decision.scores.food++,
    b=>b.snapshot.rulesVersion='c-memory-v1']){
    const corrupt=structuredClone(good);mutate(corrupt);assert.throws(()=>validateBundle(corrupt,{rulesVersion:corrupt.snapshot.rulesVersion,systems:fixture.systems}),bad);
  }
  const old=createMemoryVillage(42).bundle;old.snapshot.rulesVersion=PERSONALITY_RULES;
  assert.throws(()=>validateBundle(old,{rulesVersion:PERSONALITY_RULES,systems:fixture.systems}),bad);
  const oldFixture=createMemoryVillage(42);oldFixture.bundle.snapshot.world=createMemoryWorld(defaultPersonalityConfig());
  assert.throws(()=>validateBundle(oldFixture.bundle,{rulesVersion:'c-memory-v1',systems:oldFixture.systems}),bad);
  const newFixture=createPersonalityNeutral(42);newFixture.bundle.snapshot.world=createMemoryVillage(42).bundle.snapshot.world;
  assert.throws(()=>validateBundle(newFixture.bundle,{rulesVersion:PERSONALITY_RULES,systems:newFixture.systems}),bad);
});

test('C5 engine: handler rewriting preference cannot evade canonical proof; committed first-day state survives failure',()=>{
  const f=createPersonalityFood(0),s=createSimulationSession(f.bundle,{society(ctx,due){
    f.systems.society(ctx,due);if(ctx.snapshot.world.memoryModel.day===2)ctx.snapshot.world.memoryModel.config.personalities[1].foodWeightPermille=1000;
  }});
  assert.throws(()=>s.advanceTicks(288),e=>e.failedTick===288);
  const clean=createSimulationSession(f.bundle,f.systems);clean.advanceTicks(287);assert.deepEqual(s.getBundle(),clean.getBundle());
});

test('C5 persistent goal survives changing need priorities; dead or satisfied actors do not invent personality needs',()=>{
  const f=createPersonalityHealth(42),b=run(f,3),days=b.eventLog.filter(e=>e.type==='SocietyDaySettled').map(e=>e.payload.agents[1]);
  assert.equal(days[0].currentGoal.goalId,days[2].currentGoal.goalId);assert.equal(days[2].currentGoal.kind,'recover-health');
  assert.equal(days[2].decision.scores.health,0);assert.ok(days[2].decision.scores.food>0);
  const config=defaultPersonalityConfig();config.society.actors.initialActors[1].health=0;
  config.personalities[1].healthWeightPermille=2000;config.personalities[1].foodWeightPermille=2000;
  const dead=run(createPersonalityVillage(0,'dead-personality',config),2);
  assert.equal(dead.eventLog.some(e=>e.type==='SocietyActionCommitted' && e.payload.actorId==='actor-2'),false);
  const healthy=run(createPersonalityVillage(0),1).snapshot.world.societyModel.agents[1].state;
  assert.equal(healthy.currentGoal,null);assert.deepEqual(healthy.lastDecision.scores,{health:0,food:0,rest:0});
});

test('C5 knowledge dispatch rejects accessor records before reading rule or snapshot getters',()=>{
  let reads=0;const alien={get snapshot(){reads++;return {};},eventLog:[]};
  assert.throws(()=>buildActorKnowledge(alien,'actor-2'),bad);assert.equal(reads,0);
});
