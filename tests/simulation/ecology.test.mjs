import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultEcologyConfig, createEcologyWorld, settleEcologyDay, removePopulation, ECOLOGY_RULES } from '../../runtime/core/ecology.mjs';
import { createEcologyVillage } from '../../runtime/fixtures/ecology-village.mjs';
import { createRng } from '../../runtime/core/rng.mjs';
import { advanceOneTick, lookupCommand } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
const bad = e => ['INVALID_INPUT','UNSUPPORTED_VERSION','LIMIT_EXCEEDED'].includes(e.code);
const advance = (b, systems, ticks) => { for (let i=0;i<ticks;i++) b=advanceOneTick(b, systems); return b; };
const runDays = (config, count, seed=42) => {
  let world = createEcologyWorld(config); const rng=createRng(seed), facts=[];
  for(let day=0;day<count;day++){ const result=settleEcologyDay(world,rng.next()); world=result.world;facts.push(result.payload); }
  return {world,facts,rng:rng.getState()};
};

test('B2 population and resource ledgers reconcile real births/deaths/predation, with capacity and persisted carry', () => {
  const result=runDays(defaultEcologyConfig(),40);
  assert.ok(result.facts.some(p=>p.deer.births>0)); assert.ok(result.facts.some(p=>p.deer.predation>0));
  for(const p of result.facts){
    assert.equal(p.deer.closing,p.deer.opening+p.deer.births-p.deer.naturalDeaths-p.deer.predation-p.deer.hunted);
    assert.equal(p.wolves.closing,p.wolves.opening+p.wolves.births-p.wolves.naturalDeaths-p.wolves.starvationDeaths-p.wolves.hunted);
    assert.ok(p.deer.closing>=0 && p.deer.closing<=240 && p.wolves.closing>=0);
    for(const r of p.resources.entries) assert.equal(r.closing,r.opening+r.production+r.inflow-r.consumption-r.outflow-r.loss-r.capacityLoss);
  }
  const c=defaultEcologyConfig(); c.resources.populations={deer:0,wolves:0};
  const extinct=runDays(c,20); assert.equal(extinct.world.ecologyModel.populations.deer,0);assert.equal(extinct.world.ecologyModel.populations.wolves,0);
  assert.ok(extinct.facts.every(p=>p.pressurePermille===0 && p.farmLoss===0));
});

test('B2 depleted deer causes pressure, real farm losses, hunting injuries and actual treatment demand', () => {
  const config=defaultEcologyConfig();config.resources.populations.deer=0;
  const result=runDays(config,5,1), pressured=result.facts.find(p=>p.pressurePermille>0);
  assert.ok(pressured);assert.ok(pressured.farmLoss>0);assert.ok(pressured.hunters>0);
  assert.ok(result.facts.some(p=>p.newInjuries>0));assert.ok(result.facts.some(p=>p.resources.entries[1].demand>0));
  const noHerbs=defaultEcologyConfig(); noHerbs.resources.populations.deer=0;
  noHerbs.resources.resources.herbs.initial=0;noHerbs.resources.resources.herbs.production.numerator=0;
  const hungry=runDays(noHerbs,8,1);
  assert.ok(hungry.world.ecologyModel.injuredCount>0);assert.ok(hungry.facts.every(p=>p.healed===0));
  for(const p of hungry.facts) assert.ok(p.foodWorkers+p.herbWorkers+p.hunters+p.injuredOpening<=80);
});

test('B2 dead/hunted wolves do not raid fields, and fractional hunting injuries vary with saved RNG', () => {
  const wiped=defaultEcologyConfig();wiped.resources.populations.deer=0;wiped.wolfDeathPermille=1000;
  const result=runDays(wiped,1).facts[0];assert.equal(result.wolves.closing,0);assert.equal(result.farmLoss,0);
  const risk=defaultEcologyConfig();risk.resources.populations.deer=0;risk.maxHunters=1;
  assert.notEqual(runDays(risk,1,0).facts[0].newInjuries,runDays(risk,1,1).facts[0].newInjuries);
});

test('B2 quantity caps, zero stocks and invalid configs/samples fail or settle without negative state', () => {
  const config=defaultEcologyConfig();config.resources.populations.deer=1;config.resources.populations.wolves=1000;
  config.resources.resources.food.initial=0;config.resources.resources.herbs.initial=0;
  for(const p of runDays(config,5).facts){ assert.ok(p.deer.predation<=p.deer.opening+p.deer.births-p.deer.naturalDeaths);
    assert.ok(p.resources.entries[0].closing>=0);assert.ok(p.wolves.starvationDeaths<=p.wolves.opening+p.wolves.births-p.wolves.naturalDeaths); }
  for(const mutate of [c=>c.deerCapacity=0,c=>c.deerBirthPermille=1001,c=>c.resources.populations.deer=241,
    c=>c.maxHunters=-1,c=>c.resources.populations.wolves=1000001,c=>c.extra=1]){
    const c=defaultEcologyConfig(); mutate(c);assert.throws(()=>createEcologyWorld(c),bad);
  }
  const initial=createEcologyWorld(defaultEcologyConfig());
  for(const sample of [NaN,Infinity,-1,1,'0']) assert.throws(()=>settleEcologyDay(initial,sample),bad);
});

test('B2 remove population is atomic and rejects overdraw, core input/receipt/fact are idempotent', () => {
  const initial=createEcologyWorld(defaultEcologyConfig()), saved=structuredClone(initial);
  const result=removePopulation(initial,{species:'deer',amount:90});assert.equal(result.world.ecologyModel.populations.deer,30);
  assert.deepEqual(result.result,{species:'deer',amount:90,before:120,after:30});assert.deepEqual(initial,saved);
  const rejected=removePopulation(initial,{species:'deer',amount:121});assert.equal(rejected.success,false);assert.deepEqual(rejected.world,initial);
  const input={commandId:'remove',targetTick:1,type:'RemovePopulation',payload:{species:'deer',amount:90}};
  const {bundle,systems}=createEcologyVillage(42,'command-test',defaultEcologyConfig(),[input,input]);
  const after=advanceOneTick(bundle,systems);assert.equal(after.eventLog.length,1);assert.equal(after.eventLog[0].type,'PopulationRemoved');
  assert.equal(lookupCommand(after,input).status,'succeeded');assert.equal(after.snapshot.nextInputSeq,2);
  validateBundle(after,{rulesVersion:ECOLOGY_RULES,systems});
  const {bundle:overdraw}=createEcologyVillage(42,'rejected',defaultEcologyConfig(),[{...input,payload:{species:'deer',amount:121}}]);
  const no=advanceOneTick(overdraw,systems);assert.equal(no.eventLog.length,0);assert.equal(no.snapshot.commandReceipts.remove.status,'rejected');
});

test('B2 daily consumer and causation survive validation; tampering and failed systems cannot commit', () => {
  const input={commandId:'shock',targetTick:144,type:'RemovePopulation',payload:{species:'deer',amount:120}};
  const {bundle,systems}=createEcologyVillage(0,'tick-test',defaultEcologyConfig(),[input]);
  const before=advance(bundle,systems,143), after=advanceOneTick(before,systems);
  assert.equal(after.eventLog.length,2);assert.deepEqual(after.eventLog[1].causationEventSeqs,[1]);
  assert.equal(after.snapshot.world.ecologyModel.day,1);
  for(const mutate of [b=>b.snapshot.world.ecologyModel.populations.wolves++,b=>b.snapshot.rng.state++,
    b=>b.eventLog[1].payload.sample=0.5,b=>b.eventLog[1].payload.farmLoss++,b=>b.eventLog[1].causationEventSeqs=[],
    b=>b.snapshot.commandReceipts.shock.result.after++,b=>b.snapshot.world.ecologyModel.remainders.deerBirth++,
    b=>b.snapshot.world.ecologyModel.config.deerCapacity++,b=>b.snapshot.scheduledTasks[0].intervalTicks=1]){
    const badBundle=structuredClone(after);mutate(badBundle);assert.throws(()=>validateBundle(badBundle,{rulesVersion:ECOLOGY_RULES,systems}),bad);
  }
  const failure={ecology(ctx,due){systems.ecology(ctx,due);throw new Error('after daily rule');}};
  assert.throws(()=>advanceOneTick(before,failure),/not committed/);assert.equal(before.eventLog.length,0);
  assert.equal(before.snapshot.pendingCommands.length,1);assert.equal(before.snapshot.rng.state,0);
});

test('B2 same seed repeats while deer intervention changes only rules-driven downstream trajectory', () => {
  const initial=createEcologyWorld(defaultEcologyConfig()), rng=createRng(1);let base=initial,shock=initial;
  const baseFacts=[],shockFacts=[];
  for(let day=1;day<=60;day++){
    if(day===10) shock=removePopulation(shock,{species:'deer',amount:90}).world;
    const sample=rng.next(), b=settleEcologyDay(base,sample),s=settleEcologyDay(shock,sample);
    base=b.world;shock=s.world;baseFacts.push(b.payload);shockFacts.push(s.payload);
  }
  assert.deepEqual(baseFacts.slice(0,9),shockFacts.slice(0,9));
  assert.ok(shockFacts.slice(9).some((p,i)=>p.pressurePermille>baseFacts[i+9].pressurePermille));
  assert.ok(shockFacts.slice(9).some((p,i)=>p.farmLoss>baseFacts[i+9].farmLoss));
  assert.deepEqual(runDays(defaultEcologyConfig(),20,1),runDays(defaultEcologyConfig(),20,1));
});
