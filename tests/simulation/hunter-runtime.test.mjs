import test from 'node:test';
import assert from 'node:assert/strict';
import { createHunterVillage,createHunterRecovery,createHunterHunger } from '../../runtime/fixtures/hunter-village.mjs';
import { HUNTER_RULES,defaultHunterConfig } from '../../runtime/core/hunter.mjs';
import { createSimulationSession,advanceOneTick,lookupCommand } from '../../runtime/core/command-engine.mjs';
import { validateBundle,createInitialBundle } from '../../runtime/core/world-state.mjs';
const run=(b,s,n)=>{const session=createSimulationSession(b,s);session.advanceTicks(n);return session.getBundle();};
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);

test('C2 registered planner commands use contiguous inputSeq, protected receipts and exactly one action/day',()=>{
  const {bundle,systems}=createHunterRecovery(42),after=run(bundle,systems,6*144);
  const actions=after.eventLog.filter(e=>e.type==='HunterActionCommitted');
  assert.ok(actions.some(e=>e.payload.action==='WorkForPay'));assert.ok(actions.some(e=>e.payload.action==='BuyMedicine'));assert.ok(actions.some(e=>e.payload.action==='UseMedicine'));
  assert.equal(Object.keys(after.snapshot.commandReceipts).length,6);assert.equal(after.snapshot.nextInputSeq,7);
  for(let day=1;day<=6;day++){
    const receipt=after.snapshot.commandReceipts['hunter-day-'+day];assert.equal(receipt.inputSeq,day);
    assert.equal(receipt.input.targetTick,day*144);assert.equal(receipt.input.type,'ActorAction');assert.equal(receipt.status,'succeeded');
    assert.equal(lookupCommand(after,{commandId:'hunter-day-'+day,...receipt.input}).status,'succeeded');
  }
  validateBundle(after,{rulesVersion:HUNTER_RULES,systems});
});

test('C2 planning and all internal action effects roll back with a failed daily system',()=>{
  const {bundle,systems}=createHunterRecovery(0),session=createSimulationSession(bundle,{hunter(ctx,due){systems.hunter(ctx,due);throw new Error('post-wage failure');}});
  assert.throws(()=>session.advanceTicks(144),e=>e.failedTick===144);const last=session.getBundle();
  assert.equal(last.snapshot.tick,143);assert.equal(last.snapshot.nextInputSeq,1);assert.deepEqual(last.snapshot.commandReceipts,{});
  assert.equal(last.snapshot.world.hunterModel.wallet,0);assert.equal(last.snapshot.world.hunterModel.currentGoal,null);assert.equal(last.snapshot.rng.state,0);
  assert.equal(last.eventLog.length,0);
});

test('C2 public strict ticks and private proof session agree, with action RNG and external intervention ordering',()=>{
  const {bundle,systems}=createHunterHunger(1);
  let strict=bundle;for(let i=0;i<145;i++)strict=advanceOneTick(strict,systems);
  assert.deepEqual(strict,run(bundle,systems,145));assert.ok(strict.eventLog.some(e=>e.type==='HunterActionCommitted' && e.payload.action==='Hunt'));
  const {bundle:base,systems:regular}=createHunterVillage(0,'ordered',undefined,[
    {commandId:'remove-wolves',targetTick:144,type:'RemovePopulation',payload:{species:'wolves',amount:1}},
  ]);
  const after=run(base,regular,144);assert.equal(after.eventLog[0].type,'PopulationRemoved');
  assert.equal(after.snapshot.commandReceipts['remove-wolves'].inputSeq,1);assert.equal(after.snapshot.commandReceipts['hunter-day-1'].inputSeq,2);
  assert.deepEqual(after.eventLog.at(-1).causationEventSeqs,[1,2]);
});

test('C2 source provenance rejects external action injection and tampered internal plans, currency, goals, receipts or RNG',()=>{
  const {bundle,systems}=createHunterRecovery(0),after=run(bundle,systems,144);
  for(const mutate of [b=>b.snapshot.commandReceipts['hunter-day-1'].input.payload.action='Rest',b=>b.snapshot.commandReceipts['hunter-day-1'].result.after.wallet++,
    b=>b.snapshot.world.hunterModel.wallet++,b=>b.snapshot.world.hunterModel.currentGoal.goalId++,b=>b.snapshot.world.hunterModel.inventory.food++,
    b=>b.eventLog[0].payload.price++,b=>b.snapshot.rng.state++,b=>b.snapshot.nextInputSeq++,b=>b.snapshot.world.hunterModel.config.wage++]){
    const corrupt=structuredClone(after);mutate(corrupt);assert.throws(()=>validateBundle(corrupt,{rulesVersion:HUNTER_RULES,systems}),bad);
  }
  const injected=structuredClone(bundle);injected.snapshot.pendingCommands=[{commandId:'hunter-day-1',inputSeq:1,targetTick:144,type:'ActorAction',payload:{actorId:'actor-2',goalId:1,action:'WorkForPay'}}];
  injected.snapshot.nextInputSeq=2;assert.throws(()=>validateBundle(injected,{rulesVersion:HUNTER_RULES,systems}),bad);
  const hostile=createSimulationSession(bundle,{hunter(ctx,due){systems.hunter(ctx,due);ctx.snapshot.world.hunterModel.wallet++;}});
  assert.throws(()=>hostile.advanceTicks(144),bad);assert.equal(hostile.getBundle().snapshot.world.hunterModel.wallet,0);
});

test('C2 a dead hunter generates no command, keeps private property and cannot reserve duplicate identities',()=>{
  const config=defaultHunterConfig();config.actors.initialActors[1].health=0;config.initialWallet=100;
  const {bundle,systems}=createHunterVillage(0,'dead-hunter',config),after=run(bundle,systems,3*144);
  assert.equal(after.snapshot.nextInputSeq,1);assert.deepEqual(after.snapshot.commandReceipts,{});assert.equal(after.eventLog.length,3);
  assert.equal(after.snapshot.world.hunterModel.wallet,100);assert.equal(after.snapshot.world.hunterModel.inventory.food,3);
  assert.ok(after.eventLog.every(e=>e.payload.decision===null && e.payload.privateFood===0));
  assert.equal(after.snapshot.world.actorModel.actors[1].deathTick,0);assert.equal(after.snapshot.nextEntityId,4);
});
