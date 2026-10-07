import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActorKnowledge } from '../../runtime/knowledge/actor-knowledge.mjs';
import { createMemoryVillage,createMemoryRelations } from '../../runtime/fixtures/memory-village.mjs';
import { defaultMemoryConfig } from '../../runtime/core/memory-runtime.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';

test('C4 actual actor knowledge: own state plus public facts and direct trades; no peer private state, initial config or writable alias',()=>{
  const f=createMemoryRelations(42),session=createSimulationSession(f.bundle,f.systems);session.advanceTicks(288);const bundle=session.getBundle();
  for(const id of ['actor-1','actor-2','actor-3']){
    const known=buildActorKnowledge(bundle,id);assert.equal(known.actorId,id);assert.equal(known.tick,288);assert.equal(known.revision,288);
    assert.deepEqual(Object.keys(known).sort(),['actorId','alive','memories','public','relationships','revision','self','tick']);
    assert.equal(known.self.identity.actorId,id);assert.equal(JSON.stringify(known).includes('initialActors'),false);
    assert.equal(Object.hasOwn(known,'snapshot'),false);assert.equal(Object.hasOwn(known,'eventLog'),false);
    for(const memory of known.memories){
      if(memory.channel==='public' || memory.channel==='interaction')for(const key of ['wallet','health','currentGoal','inventory','needs'])assert.equal(Object.hasOwn(memory.observable,key),false);
      else assert.equal(memory.observable.actorId,id);
    }
    known.self.wallet=999999;known.memories.length=0;known.relationships.length=0;
    assert.notEqual(buildActorKnowledge(bundle,id).self.wallet,999999);
  }
  const raw=JSON.stringify(buildActorKnowledge(bundle,'actor-1').public);assert.equal(raw.includes('wallet'),false);assert.equal(raw.includes('currentGoal'),false);
  session.advanceTicks(1);assert.deepEqual(buildActorKnowledge(session.getBundle(),'actor-3').public.announcements,[]);
});

test('C4 actual actor knowledge: unknown identity fails, dead observer returns only its sealed historical state, forged memory rejects at query entry',()=>{
  const config=defaultMemoryConfig();config.society.actors.initialActors[0].health=0;
  const f=createMemoryVillage(0,'dead-knowledge',config),session=createSimulationSession(f.bundle,f.systems);session.advanceTicks(144);const bundle=session.getBundle();
  const dead=buildActorKnowledge(bundle,'actor-1');assert.deepEqual(Object.keys(dead).sort(),['actorId','alive','deathTick','memories','relationships']);
  assert.equal(dead.alive,false);assert.deepEqual(dead.memories,[]);assert.equal(Object.hasOwn(dead,'public'),false);
  assert.throws(()=>buildActorKnowledge(bundle,'unknown'),e=>e.code==='INVALID_INPUT');
  const corrupt=structuredClone(bundle);corrupt.snapshot.world.memoryModel.observer.actors[1].memories[0].observable.wallet=123;
  assert.throws(()=>buildActorKnowledge(corrupt,'actor-2'),e=>e.code==='INVALID_INPUT');
});

test('C4 actual actor knowledge: later death retains old facts and directed identity, never learns subsequent public announcements',()=>{
  const config=defaultMemoryConfig();config.society.actors.initialActors[0].health=1;config.society.actors.initialActors[0].hunger=1000;
  config.society.actors.market.ecology.resources.resources.food.initial=0;config.society.estates.forEach(e=>e.initialFood=0);
  config.society.actors.market.ecology.resources.populations.deer=0;
  const f=createMemoryVillage(0,'later-death-knowledge',config),session=createSimulationSession(f.bundle,f.systems);session.advanceTicks(3*144);
  const dead=buildActorKnowledge(session.getBundle(),'actor-1');assert.equal(dead.alive,false);assert.ok(dead.memories.length>0);
  assert.ok(dead.memories.every(m=>m.occurrenceTick<=dead.deathTick));assert.equal(Object.hasOwn(dead,'public'),false);
});
