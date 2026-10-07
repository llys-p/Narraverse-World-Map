import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationSession, advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { createClockSmoke } from '../../runtime/fixtures/clock-smoke.mjs';
import { createResourceVillage } from '../../runtime/fixtures/resource-village.mjs';
import { createEcologyVillage } from '../../runtime/fixtures/ecology-village.mjs';
import { createMarketRoutePause, createMarketShortage } from '../../runtime/fixtures/market-village.mjs';
const slow=(b,s,n)=>{for(let i=0;i<n;i++)b=advanceOneTick(b,s);return b;};
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);

test('B4 session matches strict reference for all registered rules, partial days and split advances',()=>{
  for(const factory of [createClockSmoke,createResourceVillage,createEcologyVillage,createMarketRoutePause]){
    const {bundle,systems}=factory(0,'session-diff'),reference=slow(bundle,systems,289);
    const session=createSimulationSession(bundle,systems);session.advanceTicks(145);session.advanceTicks(144);
    assert.deepEqual(session.getBundle(),reference);assert.equal(session.getStats().idleTicks+session.getStats().activityTicks,289);
    assert.ok(session.getStats().activityTicks<=4);
    const another=createSimulationSession(bundle,systems);another.advanceTicks(289);assert.deepEqual(another.getBundle(),reference);
    const exported=session.getBundle();exported.snapshot.world.resources.food=999;bundle.snapshot.simulationId='external-write';
    assert.deepEqual(session.getBundle(),reference);
  }
});

test('B4 session processes non-day and same-tick inputs in inputSeq order, preserving rollback and RNG',()=>{
  const commands=[{commandId:'remove-first',targetTick:145,type:'RemovePopulation',payload:{species:'deer',amount:90}},
    {commandId:'remove-rejected',targetTick:145,type:'RemovePopulation',payload:{species:'deer',amount:90}}];
  const {bundle,systems}=createEcologyVillage(42,'session-commands',undefined,commands);
  const session=createSimulationSession(bundle,systems);session.advanceTicks(288);assert.deepEqual(session.getBundle(),slow(bundle,systems,288));
  const fixture=createMarketShortage(0,'session-failure');
  const failing={market(ctx,due){fixture.systems.market(ctx,due);throw new Error('fail after charge');}};
  const failure=createSimulationSession(fixture.bundle,failing);
  assert.throws(()=>failure.advanceTicks(288),e=>e.failedTick===144);const last=failure.getBundle();
  assert.equal(last.snapshot.tick,143);assert.equal(last.snapshot.world.resources.gold,2000);assert.equal(last.eventLog.length,0);
  assert.equal(last.snapshot.rng.state,0);assert.equal(last.snapshot.world.marketModel.inTransit.length,0);
});

test('B4 only session-owned immutable states are trusted; bad imports and hostile systems are rejected',()=>{
  const {bundle,systems}=createMarketShortage();
  let reads=0;const accessed={eventLog:[]};Object.defineProperty(accessed,'snapshot',{enumerable:true,get(){reads++;return bundle.snapshot;}});
  assert.throws(()=>createSimulationSession(accessed,systems),bad);assert.equal(reads,0);
  const corrupt=structuredClone(bundle);corrupt.snapshot.world.resources.gold++;
  assert.throws(()=>createSimulationSession(corrupt,systems),bad);
  for(const mutate of [ctx=>ctx.snapshot.world.marketModel.prices.food++,ctx=>ctx.rng.next(),
    ctx=>ctx.snapshot.simulationId='rewritten',ctx=>ctx.snapshot.world.marketModel.config.delayDays++,
    ctx=>ctx.snapshot.nextEntityId++,ctx=>ctx.snapshot.world.marketModel.ordered.food++]){
    const hostile={market(ctx,due){systems.market(ctx,due);mutate(ctx);}};
    const session=createSimulationSession(bundle,hostile);assert.throws(()=>session.advanceTicks(144),bad);
    assert.equal(session.getBundle().snapshot.tick,143);assert.equal(session.getBundle().snapshot.world.resources.gold,2000);
  }
  const asyncSession=createSimulationSession(bundle,{market:async()=>{}});assert.throws(()=>asyncSession.advanceTicks(144),bad);
});

test('B4 retained contexts cannot modify committed state, append facts, or reenter a session',()=>{
  const {bundle,systems}=createMarketShortage();let context;
  const session=createSimulationSession(bundle,{market(ctx,due){context=ctx;systems.market(ctx,due);}});
  session.advanceTicks(144);const saved=session.getBundle();
  assert.throws(()=>{context.snapshot.world.resources.gold=999;},TypeError);
  assert.throws(()=>context.emitFact({}),bad);assert.deepEqual(session.getBundle(),saved);
  let reentrant;reentrant=createSimulationSession(bundle,{market(){reentrant.advanceTicks(1);}});
  assert.throws(()=>reentrant.advanceTicks(144),bad);assert.equal(reentrant.getBundle().snapshot.tick,143);
  const registered={...systems},frozenRegistry=createSimulationSession(bundle,registered);registered.market=()=>{throw new Error('registry overwritten');};
  frozenRegistry.advanceTicks(144);assert.equal(frozenRegistry.getBundle().snapshot.world.marketModel.paid,1980);
});

test('B4 zero advance and advance/clock budgets reject without losing already committed progress',()=>{
  const {bundle,systems}=createResourceVillage(),session=createSimulationSession(bundle,systems);
  session.advanceTicks(0);assert.deepEqual(session.getBundle(),bundle);
  for(const amount of [-1,0.5,NaN,Infinity,'1',144001])assert.throws(()=>session.advanceTicks(amount),bad);
  assert.deepEqual(session.getBundle(),bundle);
});
