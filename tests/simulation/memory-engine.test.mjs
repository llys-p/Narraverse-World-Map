import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryVillage,createMemoryRelations,createMemoryRelationsControl } from '../../runtime/fixtures/memory-village.mjs';
import { MEMORY_RULES } from '../../runtime/core/memory-runtime.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
const run=(fixture,days)=>{const session=createSimulationSession(fixture.bundle,fixture.systems);session.advanceTicks(days*144);return session.getBundle();};

test('C4 real engine: published facts precede plans and third actual trade changes price; knowledge and assets replay after checkpoint copy',()=>{
  const f=createMemoryRelations(42),discounted=run(f,8),control=run(createMemoryRelationsControl(42),8);
  const sales=b=>b.eventLog.filter(e=>e.payload.action==='SellMedicine');assert.equal(sales(discounted).length,4);
  assert.equal(sales(discounted)[2].payload.price,sales(control)[2].payload.price-2);
  const day5=discounted.eventLog.filter(e=>e.tick===5*144);assert.ok(day5.findIndex(e=>e.type==='MedicalRequestAnnounced')<day5.findIndex(e=>e.payload.action==='SellMedicine'));
  assert.equal(discounted.snapshot.world.actorModel.actors[1].health,800);
  assert.equal(discounted.snapshot.world.memoryModel.observer.actors[1].relationships[0].trust,40);
  const prefix=run(f,4),continued=createSimulationSession(JSON.parse(JSON.stringify(prefix)),f.systems);continued.advanceTicks(4*144);
  assert.deepEqual(continued.getBundle(),discounted);validateBundle(discounted,{rulesVersion:MEMORY_RULES,systems:f.systems});
});

test('C4 real engine: failure after society day leaves no committed announcements, actions, memory, relation, receipts or RNG',()=>{
  const f=createMemoryRelations(0),session=createSimulationSession(f.bundle,{society(ctx,due){f.systems.society(ctx,due);throw new Error('fail before memory close');}});
  assert.throws(()=>session.advanceTicks(144),e=>e.failedTick===144);const last=session.getBundle();assert.equal(last.snapshot.tick,143);
  assert.deepEqual(last.snapshot.world.memoryModel,f.bundle.snapshot.world.memoryModel);assert.deepEqual(last.eventLog,[]);
  assert.equal(last.snapshot.rng.state,0);assert.equal(last.snapshot.nextInputSeq,1);assert.deepEqual(last.snapshot.commandReceipts,{});
});

test('C4 real engine: full entry audit rejects forged viewpoint, cursor, still-plausible observation time and trust',()=>{
  const f=createMemoryVillage(42),good=run(f,2);
  for(const mutate of [b=>b.snapshot.world.memoryModel.observer.cursor++,b=>b.snapshot.world.memoryModel.observer.actors[0].memories[0].observable.wallet=999,
    b=>b.snapshot.world.memoryModel.observer.actors[0].memories[0].observedTick++,b=>b.eventLog.find(e=>e.type==='MemoryDaySettled').payload.observer.cursor++]){
    const bad=structuredClone(good);mutate(bad);assert.throws(()=>validateBundle(bad,{rulesVersion:MEMORY_RULES,systems:f.systems}),e=>e.code==='INVALID_INPUT');
  }
});

test('C4 real engine: suffix optimization cannot authorize a handler rewriting prior memories',()=>{
  const f=createMemoryVillage(42),session=createSimulationSession(f.bundle,{society(ctx,due){
    f.systems.society(ctx,due);
    if(ctx.snapshot.world.memoryModel.day===2)ctx.snapshot.world.memoryModel.observer.actors[0].memories[0].observable.wallet=7777;
  }});
  assert.throws(()=>session.advanceTicks(288),e=>e.failedTick===288);
  const clean=createSimulationSession(f.bundle,f.systems);clean.advanceTicks(287);
  assert.deepEqual(session.getBundle(),clean.getBundle());
});
