import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryWorld,defaultMemoryConfig,prepareMemoryDay,planMemoryDay,applyMemoryAction,settleMemorySocietyDay,finishMemoryDay,validateMemoryWorld,validateMemoryRuntimeHistory } from '../../runtime/core/memory-runtime.mjs';
import { societyActionFact,societyCauses } from '../../runtime/core/society.mjs';
import { createRng } from '../../runtime/core/rng.mjs';
import { inputFingerprint } from '../../runtime/core/data-contract.mjs';
function run(config,days){
  let world=createMemoryWorld(config);const events=[],rng=createRng(42),receipts=[],commandReceipts={};let nextInputSeq=1;
  const append=(fact,tick)=>events.push({...structuredClone(fact),eventSeq:events.length+1,schemaVersion:1,tick});
  for(let day=1;day<=days;day++){
    const tick=day*144,prepared=prepareMemoryDay(world,tick);world=prepared.world;
    prepared.facts.forEach(f=>append(f,tick));const plan=planMemoryDay(world);world=plan.world;
    for(const command of plan.commands){const action=applyMemoryAction(world,command.payload,command.payload.action==='Hunt'?rng.next():null);world=action.world;
      receipts.push({day,command,success:action.success});if(action.success)append(societyActionFact(command,action.result),tick);
      const input={type:command.type,payload:command.payload,targetTick:tick};commandReceipts[command.commandId]={input,inputSeq:nextInputSeq++,fingerprint:inputFingerprint(input),
        status:action.success?'succeeded':'rejected',result:action.result,eventSeqs:action.success?[events.length]:[]};}
    const daily=settleMemorySocietyDay(world,rng.next());world=daily.world;
    append({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:societyCauses(events),payload:daily.payload},tick);
    const memory=finishMemoryDay(world,events,tick);world=memory.world;append(memory.fact,tick);
  }
  return {world,events,receipts,snapshot:{world,rng:rng.getState(),commandReceipts,pendingCommands:[],nextInputSeq}};
}
function recoveryConfig(discountEnabled=true){
  const config=defaultMemoryConfig();config.discountEnabled=discountEnabled;
  config.society.actors.initialActors[1].health=400;config.society.estates.forEach(e=>{e.initialWallet=0;e.initialFood=20;e.initialHerbs=0;});
  config.society.estates[1].initialWallet=500;config.society.estates[2].initialHerbs=4;
  config.society.actors.market.ecology.resources.resources.herbs.initial=4;
  config.society.actors.market.ecology.resources.resources.herbs.production.numerator=0;
  config.society.actors.market.ecology.resources.resources.gold.initial=500;return config;
}

test('C4 world: truthful public facts and old relations drive the third actual transaction discount with exact cash/herb conservation',()=>{
  const discounted=run(recoveryConfig(),8),control=run(recoveryConfig(false),8);
  const sales=r=>r.events.filter(e=>e.payload.action==='SellMedicine');
  assert.equal(sales(discounted).length,4);assert.deepEqual(sales(discounted).map(e=>e.payload.price-sales(control)[sales(discounted).indexOf(e)].payload.price),[0,0,-2,-2]);
  const states=discounted.world.societyModel.agents.map(a=>a.state);assert.equal(states.reduce((n,a)=>n+a.wallet,0),500);
  assert.equal(states[1].inventory.herbs,0,JSON.stringify(discounted.events.filter(e=>e.type==='SocietyDaySettled').map(e=>({day:e.payload.day,
    buyer:e.payload.agents[1].decision,goal:e.payload.agents[1].currentGoal,outcome:e.payload.agents[1].goalOutcome,inventory:e.payload.agents[1].inventory}))));
  assert.equal(states[2].inventory.herbs,0);assert.equal(states[1].ledger.herbsUsed,4);
  assert.equal(discounted.world.actorModel.actors[1].health,800);
  assert.equal(discounted.world.memoryModel.observer.actors[1].relationships[0].trust,40);
  assert.equal(discounted.receipts.filter(r=>r.command.payload.actorId==='actor-2' && [5,7].includes(r.day)).every(r=>r.command.payload.action==='Rest'),true);
  assert.equal(discounted.world.resources.gold,500);validateMemoryWorld(discounted.world);
});

test('C4 world: preparing/reading the new state never mutates the old world; dying or initially dead observers do not get announcements',()=>{
  const config=recoveryConfig();config.society.actors.initialActors[0].health=0;
  const initial=createMemoryWorld(config),before=structuredClone(initial),prepared=prepareMemoryDay(initial,144);
  assert.deepEqual(initial,before);assert.ok(prepared.facts.every(f=>f.payload.actorId!=='actor-1'));
  const final=run(config,2).world;assert.equal(final.memoryModel.observer.actors[0].alive,false);assert.deepEqual(final.memoryModel.observer.actors[0].memories,[]);
  assert.throws(()=>prepareMemoryDay(initial,145),e=>e.code==='INVALID_INPUT');
});

test('C4 full rule replay: every public request, quote, original observation time, retained memory and relation must match the real ordered source',()=>{
  const result=run(recoveryConfig(),6);validateMemoryRuntimeHistory(result.snapshot,result.events);
  for(const mutate of [r=>r.snapshot.world.memoryModel.observer.actors[1].relationships[0].trust++,
    r=>r.snapshot.world.memoryModel.observer.actors[1].memories[0].observedTick++,
    r=>r.events.find(e=>e.type==='MedicalRequestAnnounced').payload.maxPrice++,r=>r.snapshot.rng.state++,
    r=>r.snapshot.commandReceipts['society-day-5-actor-2'].input.payload.action='BuyMedicine']){
    const corrupt=structuredClone(result);mutate(corrupt);assert.throws(()=>validateMemoryRuntimeHistory(corrupt.snapshot,corrupt.events),e=>e.code==='INVALID_INPUT');
  }
});

test('C4 waiting without physical delivery cannot invent medicine or success; its existing goal fails and enters cooldown',()=>{
  const before=run(recoveryConfig(),4).world,prepared=prepareMemoryDay(before,5*144),plan=planMemoryDay(prepared.world);
  assert.equal(plan.world.memoryModel.waitingActorId,'actor-2');
  const wait=plan.commands.find(c=>c.payload.actorId==='actor-2');assert.equal(wait.payload.action,'Rest');
  // Domain settlement must handle an unfulfilled offer even when no seller action
  // was committed. Such a partial command history cannot pass the full engine audit.
  const resting=applyMemoryAction(plan.world,wait.payload),settled=settleMemorySocietyDay(resting.world,0.5).world;
  const buyer=settled.societyModel.agents[1].state;
  assert.equal(settled.memoryModel.waitingOutcome,'failed');assert.equal(buyer.inventory.herbs,0);
  assert.equal(buyer.wallet,before.societyModel.agents[1].state.wallet);assert.equal(buyer.currentGoal,null);
  assert.equal(buyer.cooldownUntilDay,7);assert.equal(buyer.ledger.goalsFailed,before.societyModel.agents[1].state.ledger.goalsFailed+1);
});
