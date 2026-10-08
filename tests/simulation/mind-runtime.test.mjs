// M1A mind runtime: K1 information isolation/causal pairing, K2 correction/actual price,
// K3 competition rejection and the player ordering counter-example, K4 no external
// action, and the K6 death-branch boundary run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMindVillage,defaultMindVillageConfig } from '../../runtime/fixtures/mind-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { buildMindKnowledge } from '../../runtime/knowledge/mind-knowledge.mjs';
import { executeMindPlayerIntent,describeMindPlayerActions } from '../../runtime/core/mind-runtime.mjs';
import { deriveMindBelief } from '../../runtime/core/mind-state.mjs';

const advance=(config,ticks)=>{const f=createMindVillage(42,'mind-village',structuredClone(config));
  const s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(ticks);return s.getBundle();};
const mind=(w,id)=>w.mindModel.actors.find(a=>a.actorId===id);
const estate=(w,id)=>w.societyModel.agents.find(a=>a.state.actorId===id);
const resolved=(b,actorId)=>b.eventLog.filter(e=>e.type==='MindDecisionResolved'&&e.payload.actorId===actorId);
const planned=(b,actorId)=>b.eventLog.filter(e=>e.type==='MindDecisionPlanned'&&e.payload.actorId===actorId);

test('K1 isolation at 24/143 then the frozen pairing at 144',()=>{
  const config=defaultMindVillageConfig();
  const b24=advance(config,24),w24=b24.snapshot.world;
  assert.deepEqual(deriveMindBelief(mind(w24,'actor-2').observations,24),
    {topic:'public-herbs-available',value:'unavailable',confidencePermille:600,evidenceRefs:[1],contradictionRefs:[],lastUpdatedTick:12});
  assert.deepEqual(deriveMindBelief(mind(w24,'actor-3').observations,24),
    {topic:'public-herbs-available',value:'available',confidencePermille:900,evidenceRefs:[2],contradictionRefs:[],lastUpdatedTick:24});
  assert.equal(mind(w24,'actor-2').observations.length,1);
  assert.equal(mind(w24,'actor-3').observations.length,1);
  assert.equal(w24.resources.herbs,20);
  const b143=advance(config,143),w143=b143.snapshot.world;
  for(const id of ['actor-2','actor-3']){
    assert.equal(mind(w143,id).lastDecision,null);
    assert.equal(mind(w143,id).lastOutcome,null);
  }
  assert.equal(w143.resources.herbs,20);
  const b144=advance(config,144),w144=b144.snapshot.world;
  assert.equal(mind(w144,'actor-2').lastDecision.choice,'NoAction');
  assert.equal(mind(w144,'actor-2').lastDecision.reasonCode,'SUPPLY_UNAVAILABLE');
  assert.deepEqual(mind(w144,'actor-2').lastOutcome,
    {decisionId:'mind-day-1-actor-2',actorId:'actor-2',commandId:null,status:'no-action',code:null,
      delta:{wallet:0,herbs:0,health:0},price:null});
  assert.equal(estate(w144,'actor-2').state.wallet,100);
  assert.equal(estate(w144,'actor-2').state.inventory.herbs,0);
  assert.equal(mind(w144,'actor-3').lastDecision.choice,'BuyMedicine');
  assert.deepEqual(mind(w144,'actor-3').lastOutcome,
    {decisionId:'mind-day-1-actor-3',actorId:'actor-3',commandId:'mind-day-1-actor-3',status:'succeeded',code:null,
      delta:{wallet:-50,herbs:1,health:0},price:50});
  assert.equal(estate(w144,'actor-3').state.wallet,50);
  assert.equal(estate(w144,'actor-3').state.inventory.herbs,1);
  assert.equal(w144.resources.herbs,19);
  assert.deepEqual(Object.keys(b144.snapshot.commandReceipts),['mind-day-1-actor-3','society-day-1-actor-1']);
  const r=b144.snapshot.commandReceipts['mind-day-1-actor-3'];
  assert.equal(r.status,'succeeded');assert.equal(r.inputSeq,2);
  assert.equal(r.input.payload.goalId,1);assert.equal(r.input.payload.action,'BuyMedicine');
  for(const id of ['actor-2','actor-3']){
    const p=planned(b144,id),d=resolved(b144,id);
    assert.equal(p.length,1);assert.equal(d.length,1);
    assert.deepEqual(d[0].causationEventSeqs,[p[0].eventSeq]);
    assert.ok(p[0].eventSeq<d[0].eventSeq);
  }
  // Causal pairing: flipping exactly the one statement actor-2 heard flips exactly actor-2.
  const paired=structuredClone(config);paired.mind.stimuli[0].available=true;
  const b=advance(paired,144),w=b.snapshot.world;
  assert.equal(mind(w,'actor-2').lastDecision.choice,'BuyMedicine');
  assert.equal(mind(w,'actor-2').lastOutcome.status,'succeeded');
  assert.equal(estate(w,'actor-2').state.wallet,50);
  assert.equal(estate(w,'actor-2').state.inventory.herbs,1);
  assert.equal(mind(w,'actor-3').lastOutcome.status,'succeeded');
  assert.equal(w.resources.herbs,18);
});

test('K2 empty stimuli wait, then the corrected belief buys at the planning-time quote',()=>{
  const config=defaultMindVillageConfig();
  const empty=structuredClone(config);empty.mind.stimuli=[];
  const b143=advance(empty,143),w143=b143.snapshot.world;
  for(const id of ['actor-2','actor-3'])
    assert.equal(deriveMindBelief(mind(w143,id).observations,143).value,'unknown');
  const b144=advance(empty,144),w144=b144.snapshot.world;
  for(const id of ['actor-2','actor-3']){
    assert.equal(mind(w144,id).lastDecision.choice,'NoAction');
    assert.equal(mind(w144,id).lastDecision.reasonCode,'SUPPLY_UNKNOWN');
    assert.equal(mind(w144,id).lastOutcome.status,'no-action');
  }
  assert.deepEqual(Object.keys(b144.snapshot.commandReceipts),['society-day-1-actor-1']);
  assert.equal(w144.resources.herbs,20);
  // Default flow: the day-end public closing corrects actor-2 before the 288 purchase.
  const b=advance(config,288),w=b.snapshot.world;
  const k144=buildMindKnowledge(advance(config,144),'actor-2');
  assert.equal(mind(w,'actor-2').lastDecision.choice,'BuyMedicine');
  assert.equal(mind(w,'actor-2').lastOutcome.status,'succeeded');
  assert.equal(mind(w,'actor-2').lastOutcome.price,k144.quote.price);
  assert.equal(mind(w,'actor-2').lastOutcome.delta.wallet,-k144.quote.price);
  const r=b.snapshot.commandReceipts['mind-day-2-actor-2'];
  assert.equal(r.status,'succeeded');assert.equal(r.result.price,k144.quote.price);
  assert.equal(estate(w,'actor-2').state.wallet,100-k144.quote.price);
  assert.equal(estate(w,'actor-2').state.inventory.herbs,1);
  assert.deepEqual({goalId:estate(w,'actor-2').state.currentGoal.goalId,failures:estate(w,'actor-2').state.currentGoal.failures},
    {goalId:1,failures:0});
  assert.equal(mind(w,'actor-3').lastDecision.choice,'UseMedicine');
  assert.equal(mind(w,'actor-3').lastOutcome.delta.health,100);
  assert.equal(mind(w,'actor-3').lastOutcome.delta.herbs,-1);
  assert.equal(mind(w,'actor-3').lastOutcome.price,null);
  assert.equal(estate(w,'actor-3').state.wallet,50);
  assert.equal(estate(w,'actor-3').state.inventory.herbs,0);
  assert.equal(w.actorModel.actors.find(a=>a.actorId==='actor-3').health,500);
  // The day-1 decision still records the wrong speech; the day-end report corrects it.
  const day1Planned=b.eventLog.find(e=>e.type==='MindDecisionPlanned'&&e.payload.actorId==='actor-2'&&e.tick===144);
  assert.match(day1Planned.payload.knowledgeFingerprint,/"value":"unavailable"/);
  const day2Planned=b.eventLog.find(e=>e.type==='MindDecisionPlanned'&&e.payload.actorId==='actor-2'&&e.tick===288);
  assert.match(day2Planned.payload.knowledgeFingerprint,/"value":"available"/);
  const s01Seq=b.eventLog.find(e=>e.type==='MindStimulusResolved'&&e.payload.stimulusId==='s01').eventSeq;
  const belief288=deriveMindBelief(mind(w,'actor-2').observations,288);
  assert.equal(belief288.value,'available');
  assert.ok(belief288.contradictionRefs.includes(s01Seq));
});

test('K3 competition: last herb goes to the first submitter, the loser is rejected and corrected',()=>{
  const config=structuredClone(defaultMindVillageConfig());
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial=1;
  config.mind.stimuli=[
    {stimulusId:'s01',tick:12,kind:'market-check',listenerId:'actor-2'},
    {stimulusId:'s02',tick:24,kind:'market-check',listenerId:'actor-3'}];
  const b144=advance(config,144),w144=b144.snapshot.world;
  for(const id of ['actor-2','actor-3'])
    assert.equal(mind(w144,id).lastDecision.choice,'BuyMedicine');
  assert.equal(mind(w144,'actor-2').lastOutcome.status,'succeeded');
  assert.equal(w144.resources.herbs,0);
  assert.equal(estate(w144,'actor-2').state.wallet,50);
  assert.equal(estate(w144,'actor-2').state.inventory.herbs,1);
  assert.equal(mind(w144,'actor-3').lastOutcome.status,'rejected');
  assert.equal(mind(w144,'actor-3').lastOutcome.code,'RULE_REJECTED');
  assert.deepEqual(mind(w144,'actor-3').lastOutcome.delta,{wallet:0,herbs:0,health:0});
  const r=b144.snapshot.commandReceipts['mind-day-1-actor-3'];
  assert.equal(r.status,'rejected');
  assert.equal(estate(w144,'actor-3').state.wallet,100);
  assert.equal(estate(w144,'actor-3').state.inventory.herbs,0);
  assert.equal(estate(w144,'actor-3').state.currentGoal.failures,1);
  const obs=mind(w144,'actor-3').observations;
  assert.deepEqual(obs.map(o=>o.channel),['market-check','own-rejection','daily-public']);
  const rejection=b144.eventLog.find(e=>e.type==='MindDecisionResolved'&&e.payload.actorId==='actor-3');
  const daily=b144.eventLog.find(e=>e.type==='SocietyDaySettled');
  assert.ok(rejection.eventSeq<daily.eventSeq);
  assert.equal(obs[1].sourceEventSeq,rejection.eventSeq);
  assert.equal(deriveMindBelief(obs.slice(0,2),144).value,'unknown');
  const belief=deriveMindBelief(obs,144);
  assert.equal(belief.value,'unavailable');
  assert.equal(belief.confidencePermille,900);
  // Waiting on unknown/unavailable knowledge adds no goal failures.
  const b288=advance(config,288),w288=b288.snapshot.world;
  assert.equal(mind(w288,'actor-2').lastDecision.choice,'UseMedicine');
  assert.equal(mind(w288,'actor-2').lastOutcome.delta.health,100);
  assert.equal(mind(w288,'actor-2').lastOutcome.delta.herbs,-1);
  assert.equal(mind(w288,'actor-3').lastDecision.choice,'NoAction');
  assert.equal(estate(w288,'actor-3').state.currentGoal.failures,1);
});

test('K3 player counter-example: the only buy entrance empties stock before both NPC plans are rejected',()=>{
  const config=structuredClone(defaultMindVillageConfig());
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial=1;
  config.mind.stimuli=[
    {stimulusId:'s01',tick:12,kind:'market-check',listenerId:'actor-2'},
    {stimulusId:'s02',tick:24,kind:'market-check',listenerId:'actor-3'}];
  const f=createMindVillage(42,'mind-village',structuredClone(config));
  const s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(143);
  const intent={commandId:'p-buy-1',type:'PlayerBuy',payload:{product:'herbs',quantity:1}};
  const done=executeMindPlayerIntent(s.getBundle(),intent);
  assert.equal(done.outcome,'succeeded');
  assert.equal(done.durationTicks,1);
  const b=done.bundle,w=b.snapshot.world;
  assert.equal(b.snapshot.tick,144);
  assert.equal(w.playerModel.inventory.herbs,1);
  assert.equal(w.resources.herbs,0);
  for(const id of ['actor-2','actor-3']){
    assert.equal(mind(w,id).lastDecision.choice,'BuyMedicine');
    assert.equal(mind(w,id).lastOutcome.status,'rejected');
    assert.equal(mind(w,id).lastOutcome.code,'RULE_REJECTED');
    assert.equal(estate(w,id).state.inventory.herbs,0);
    assert.equal(estate(w,id).state.wallet,100);
    assert.equal(estate(w,id).state.currentGoal.failures,1);
  }
  // Reserved internal namespaces stay protected for the player adapter.
  assert.throws(()=>executeMindPlayerIntent(s.getBundle(),{commandId:'mind-day-9-actor-2',type:'PlayerBuy',payload:{product:'herbs',quantity:1}}),
    e=>e.code==='INVALID_INPUT');
  assert.throws(()=>executeMindPlayerIntent(s.getBundle(),{commandId:'society-day-9',type:'PlayerBuy',payload:{product:'herbs',quantity:1}}),
    e=>e.code==='INVALID_INPUT');
  assert.deepEqual(describeMindPlayerActions(f.bundle),
    {travelTicks:12,restTicks:6,tradeTicks:1,maxQuantity:10,locations:['village','forest'],
      prices:{food:{buy:f.bundle.snapshot.world.marketModel.prices.food,sell:Math.max(1,Math.floor(f.bundle.snapshot.world.marketModel.prices.food/2))},
        herbs:{buy:50,sell:25}},canTrade:true});
});

test('K4 no external action: NoAction yields no command/rest, private food still consumed',()=>{
  const config=structuredClone(defaultMindVillageConfig());config.mind.stimuli=[];
  const b144=advance(config,144),w144=b144.snapshot.world;
  for(const id of ['actor-2','actor-3']){
    assert.equal(mind(w144,id).lastDecision.choice,'NoAction');
    assert.equal(mind(w144,id).lastOutcome.status,'no-action');
    assert.equal(estate(w144,id).state.ledger.restDays,0);
  }
  assert.deepEqual(Object.keys(b144.snapshot.commandReceipts),['society-day-1-actor-1']);
  assert.equal(b144.snapshot.nextInputSeq,2);
  assert.equal(w144.actorModel.actors.find(a=>a.actorId==='actor-2').fatigue,200);
  assert.equal(w144.actorModel.actors.find(a=>a.actorId==='actor-3').fatigue,200);
  assert.equal(estate(w144,'actor-2').state.inventory.food,19);
  assert.equal(estate(w144,'actor-3').state.inventory.food,19);
  assert.equal(estate(w144,'actor-2').state.inventory.herbs,0);
  assert.equal(w144.resources.herbs,20);
  // Day 2 can act on the fresh public report but still earns no rest receipt.
  const b288=advance(config,288),w288=b288.snapshot.world;
  for(const id of ['actor-2','actor-3']){
    assert.equal(mind(w288,id).lastDecision.choice,'BuyMedicine');
    assert.equal(mind(w288,id).lastOutcome.status,'succeeded');
    assert.equal(estate(w288,id).state.ledger.restDays,0);
  }
  assert.deepEqual(Object.keys(b288.snapshot.commandReceipts),['mind-day-2-actor-2','mind-day-2-actor-3','society-day-1-actor-1','society-day-2-actor-1']);
  assert.equal(w288.resources.herbs,18);
});

test('K6 death branch: the dead are sealed at 144 and the 156 stimulus is unavailable',()=>{
  const config=structuredClone(defaultMindVillageConfig());
  const m=config.memory;
  Object.assign(m.society.actors.initialActors[1],{health:1,hunger:1000,fatigue:200});
  Object.assign(m.society.actors.initialActors[2],{health:1,hunger:1000,fatigue:200});
  for(const index of [0,1,2])Object.assign(m.society.estates[index],{initialFood:0,initialHerbs:0});
  Object.assign(m.society.player,{initialFood:0,initialHerbs:0});
  const r=m.society.actors.market.ecology.resources.resources;
  r.food.initial=0;r.food.production={numerator:0,denominator:5};
  r.herbs.initial=0;r.herbs.production={numerator:0,denominator:8};
  m.society.actors.market.products.food.maxOrder=0;
  m.society.actors.market.products.herbs.maxOrder=0;
  config.mind.stimuli.push({stimulusId:'s03',tick:156,kind:'market-check',listenerId:'actor-2'});
  const b288=advance(config,288),w288=b288.snapshot.world;
  for(const id of ['actor-2','actor-3']){
    const actor=w288.actorModel.actors.find(a=>a.actorId===id);
    assert.equal(actor.alive,false);
    assert.equal(actor.deathTick,144);
    // Tombstone: private ledger remains readable, no new observations or decisions.
    assert.equal(estate(w288,id).state.wallet,100);
    assert.equal(mind(w288,id).lastDecision.decisionId,'mind-day-1-'+id);
    assert.equal(mind(w288,id).lastDecision.choice,'NoAction');
    assert.equal(mind(w288,id).lastOutcome.status,'no-action');
    assert.equal(estate(w288,id).state.lastAction,'None');
    assert.equal(estate(w288,id).state.currentGoal,null);
  }
  const s03=b288.eventLog.find(e=>e.type==='MindStimulusResolved'&&e.payload.stimulusId==='s03');
  assert.equal(s03.payload.status,'unavailable');
  assert.equal(s03.payload.available,null);
  assert.equal(w288.mindModel.scriptCursor,3);
  assert.equal(mind(w288,'actor-2').observations.length,1);
  assert.equal(mind(w288,'actor-3').observations.length,1);
  const knowledge=buildMindKnowledge(b288,'actor-2');
  assert.equal(knowledge.self.alive,false);
  assert.equal(knowledge.committedIntent,null);
  assert.equal(planned(b288,'actor-2').length,1);
  assert.equal(resolved(b288,'actor-2').length,1);
});