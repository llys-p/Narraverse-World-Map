import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryState,advanceActorMemory,validateMemoryHistory,projectActorEvent,buildObservedMemory,MAX_ACTOR_MEMORIES } from '../../runtime/core/memory-observer.mjs';
import { createSocietyPeerSale,createSocietyVillage } from '../../runtime/fixtures/society-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);
const fixture=createSocietyPeerSale(42),session=createSimulationSession(fixture.bundle,fixture.systems);
session.advanceTicks(288);const bundle=session.getBundle();
const initial=()=>createMemoryState(fixture.bundle.snapshot.world.actorModel.actors.map(a=>({actorId:a.actorId,alive:a.alive})));
const sale=bundle.eventLog.find(e=>e.payload.action==='SellMedicine');

test('C4 observer: actual sale is visible only to its parties and projects own payment, never peer assets',()=>{
  assert.deepEqual(projectActorEvent(sale,'actor-1'),[]);
  const seller=projectActorEvent(sale,'actor-3')[0],buyer=projectActorEvent(sale,'actor-2')[0];
  assert.equal(seller.channel,'interaction');assert.equal(seller.importance,2);
  assert.equal(seller.observable.cashDelta,52);assert.equal(buyer.observable.cashDelta,-52);
  assert.deepEqual(Object.keys(seller.observable).sort(),['buyerId','cashDelta','herbs','price','sellerId','type']);
  assert.equal(JSON.stringify(seller).includes('Wallet'),false);assert.equal(JSON.stringify(buyer).includes('currentGoal'),false);
});

test('C4 observer: daily public data and self status are distinct, unrelated private actions remain invisible',()=>{
  const day=bundle.eventLog.find(e=>e.type==='SocietyDaySettled'),facts=projectActorEvent(day,'actor-1');
  const publicFact=facts.find(f=>f.channel==='public');assert.deepEqual(Object.keys(publicFact.observable).sort(),['alive','food','herbs','prices','routeOpen','type']);
  assert.equal(JSON.stringify(publicFact).includes('agents'),false);assert.equal(JSON.stringify(publicFact).includes('wallet'),false);
  assert.equal(facts.find(f=>f.channel==='self').observable.actorId,'actor-1');
  const other=bundle.eventLog.find(e=>e.type==='SocietyActionCommitted' && e.payload.actorId==='actor-1');
  assert.deepEqual(projectActorEvent(other,'actor-2'),[]);
});

test('C4 observer: complete real sources give directed trust once; duplicate scans and copied reads cannot mutate memory',()=>{
  const state=advanceActorMemory(initial(),bundle.eventLog,300);
  assert.equal(state.cursor,bundle.eventLog.length);
  assert.equal(buildObservedMemory(state,'actor-2').relationships[0].trust,10);
  assert.equal(buildObservedMemory(state,'actor-3').relationships[0].trust,10);
  assert.equal(buildObservedMemory(state,'actor-1').relationships.length,0);
  assert.deepEqual(advanceActorMemory(state,bundle.eventLog,400),state);
  const copy=buildObservedMemory(state,'actor-2');copy.relationships[0].trust=1000;copy.memories.length=0;
  assert.equal(buildObservedMemory(state,'actor-2').relationships[0].trust,10);
  const interaction=state.actors[1].memories.find(m=>m.channel==='interaction');
  assert.equal(interaction.sourceEventSeq,sale.eventSeq);assert.equal(interaction.occurrenceTick,144);assert.equal(interaction.observedTick,300);
  validateMemoryHistory(state,bundle.eventLog);
});

test('C4 observer: prefix checkpoint plus later observations matches retained facts/relations and preserves observation times',()=>{
  const prefix=bundle.eventLog.filter(e=>e.tick<=144),first=advanceActorMemory(initial(),prefix,144);
  const continued=advanceActorMemory(JSON.parse(JSON.stringify(first)),bundle.eventLog,288);
  validateMemoryHistory(continued,bundle.eventLog);
  assert.equal(continued.actors[1].memories.find(m=>m.sourceEventSeq===sale.eventSeq).observedTick,144);
  assert.equal(continued.actors[1].relationships[0].trust,10);
  for(const mutate of [s=>s.cursor++,s=>s.actors[1].relationships[0].trust++,s=>s.actors[1].memories[0].sourceEventSeq=999,
    s=>s.actors[1].memories[0].observedTick=Number.MAX_SAFE_INTEGER,s=>s.actors[1].memories[0].observable.wallet=123]){
    const corrupt=structuredClone(continued);mutate(corrupt);assert.throws(()=>validateMemoryHistory(corrupt,bundle.eventLog),bad);
  }
});

test('C4 observer: capacity keeps important real transaction, trims oldest public facts deterministically, cursor prevents renewed trust',()=>{
  const f=createSocietyPeerSale(0),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(15*144);
  const b=s.getBundle(),state=advanceActorMemory(createMemoryState(f.bundle.snapshot.world.actorModel.actors.map(a=>({actorId:a.actorId,alive:a.alive}))),b.eventLog,15*144);
  assert.equal(MAX_ACTOR_MEMORIES,32);assert.equal(state.actors[1].memories.length,32);
  assert.ok(state.actors[1].memories.some(m=>m.channel==='interaction'));
  assert.equal(state.actors[1].memories.some(m=>m.channel==='public' && m.occurrenceTick===144),false);
  assert.deepEqual(advanceActorMemory(state,b.eventLog,16*144),state);
  validateMemoryHistory(state,b.eventLog);
});

test('C4 observer: sparse/alien/accessor, reversed or future source and oversized roster reject atomically',()=>{
  for(const input of [Array(1),[{actorId:'actor-1',alive:true},,],new Date(),Array.from({length:65},(_,i)=>({actorId:'a'+i,alive:true}))])assert.throws(()=>createMemoryState(input),bad);
  let reads=0;const accessor={get actorId(){reads++;return 'actor-1';},alive:true};
  assert.throws(()=>createMemoryState([accessor]),bad);assert.equal(reads,0);
  for(const log of [Array(1),[...bundle.eventLog].reverse(),[...bundle.eventLog,structuredClone(bundle.eventLog[0])]])assert.throws(()=>advanceActorMemory(initial(),log,288),bad);
  assert.throws(()=>advanceActorMemory(initial(),bundle.eventLog,144),bad);
  const state=initial();assert.throws(()=>advanceActorMemory(state,bundle.eventLog,144),bad);assert.equal(state.cursor,0);
  assert.throws(()=>buildObservedMemory(state,'unknown'),bad);
});

test('C4 observer: dead identity retains history but receives no later public or self fact',()=>{
  const f=createSocietyVillage(0);
  const config=structuredClone(f.bundle.snapshot.world.societyModel.config);config.actors.initialActors[0].health=0;
  const dead=createSocietyVillage(0,'dead-memory',config),s=createSimulationSession(dead.bundle,dead.systems);s.advanceTicks(288);
  const m=advanceActorMemory(createMemoryState(dead.bundle.snapshot.world.actorModel.actors.map(a=>({actorId:a.actorId,alive:a.alive}))),s.getBundle().eventLog,288);
  const tombstone=buildObservedMemory(m,'actor-1');assert.equal(tombstone.alive,false);assert.deepEqual(tombstone.memories,[]);
  assert.equal(tombstone.actorId,'actor-1');assert.equal(m.actors[1].memories.length>0,true);
});

test('C4 observer: actual later death seals existing memories at death tick without resurrecting an ID',()=>{
  const config=structuredClone(fixture.bundle.snapshot.world.societyModel.config);
  config.actors.initialActors[0].health=1;config.actors.initialActors[0].hunger=1000;
  config.actors.market.ecology.resources.resources.food.initial=0;config.estates.forEach(e=>e.initialFood=0);
  config.actors.market.ecology.resources.populations.deer=0;
  const f=createSocietyVillage(0,'later-death',config),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(3*144);
  const b=s.getBundle(),a=b.snapshot.world.actorModel.actors[0];assert.equal(a.alive,false);
  const m=advanceActorMemory(createMemoryState(f.bundle.snapshot.world.actorModel.actors.map(a=>({actorId:a.actorId,alive:a.alive}))),b.eventLog,3*144);
  const dead=buildObservedMemory(m,'actor-1');assert.equal(dead.alive,false);assert.ok(dead.memories.length>0);
  assert.ok(dead.memories.every(e=>e.occurrenceTick<=a.deathTick));assert.ok(m.actors[1].memories.some(e=>e.occurrenceTick>a.deathTick));
});

test('C4 observer: a forged repeated command cannot inflate a relation with another event sequence',()=>{
  const prefix=bundle.eventLog.filter(e=>e.tick<=144),duplicate=structuredClone(sale);duplicate.eventSeq=prefix.length+1;
  assert.throws(()=>advanceActorMemory(initial(),[...prefix,duplicate],144),bad);
});
