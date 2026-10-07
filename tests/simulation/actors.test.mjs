import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultActorConfig,createActorWorld,settleActorDay,validateActorWorld,populationShares,ACTOR_RULES } from '../../runtime/core/actors.mjs';
import { createActorVillage } from '../../runtime/fixtures/actor-village.mjs';
import { createSimulationSession,advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);
const day=w=>settleActorDay(w,0.5);

test('C1 IDs and population are owned exactly once, and named shares do not add consumption',()=>{
  const initial=createActorWorld(defaultActorConfig());
  assert.deepEqual(populationShares(initial),{registered:3,namedAlive:3,unnamedAlive:77,totalAlive:80,namedInjured:0,dead:0});
  assert.deepEqual(initial.actorModel.actors.map(a=>a.actorId),['actor-1','actor-2','actor-3']);
  const first=day(initial);assert.equal(first.payload.populationOpening.totalAlive,80);
  assert.equal(first.payload.market.ecology.resources.entries[0].demand,80);
  assert.equal(first.payload.unnamedFood,77);assert.equal(first.payload.rows.reduce((n,r)=>n+r.food,0),3);
  assert.equal(first.world.actorModel.ledger.foodConsumed,3);assert.equal(initial.actorModel.day,0);
  const {bundle}=createActorVillage(0);assert.equal(bundle.snapshot.nextEntityId,4);
  validateActorWorld(first.world);
});

test('C1 labour excludes named actors even when aggregate workers/injuries consume the entire anonymous cohort',()=>{
  const c=defaultActorConfig();Object.assign(c.market.ecology.resources.settlement,{foodWorkers:75,herbWorkers:0,injuredCount:0});
  c.market.ecology.resources.resources.food.initial=0;
  const result=day(createActorWorld(c)),e=result.payload.market.ecology;
  assert.ok(e.foodWorkers+e.herbWorkers+e.hunters<=77);
  assert.equal(e.foodWorkers,75);assert.equal(e.hunters,2);
});

test('C1 medicine and ration allocations alter actual needs without extra inventory deductions',()=>{
  const c=defaultActorConfig();Object.assign(c.initialActors[1],{health:500,hunger:500,fatigue:600});
  const first=day(createActorWorld(c)),hunter=first.world.actorModel.actors[1];
  assert.equal(first.payload.rows[1].herbs,1);assert.equal(hunter.health,600);assert.equal(hunter.hunger,400);assert.equal(hunter.fatigue,400);
  assert.deepEqual(hunter.needs,{food:400,healing:400,rest:400});
  assert.equal(first.payload.market.ecology.resources.entries[1].demand,1);
  assert.equal(first.payload.market.ecology.resources.entries[1].consumption,1);
  const empty=structuredClone(c);empty.market.ecology.resources.resources.herbs.initial=0;empty.market.ecology.resources.resources.herbs.production.numerator=0;
  empty.market.ecology.resources.resources.gold.initial=0;
  const without=day(createActorWorld(empty));assert.equal(without.world.actorModel.actors[1].health,500);assert.equal(without.payload.rows[1].herbs,0);
});

test('C1 anonymous-first single-stock allocation is deterministic for the last rations and last medicine',()=>{
  const c=defaultActorConfig();Object.assign(c.market.ecology.resources.settlement,{foodWorkers:0,herbWorkers:0});
  c.market.ecology.maxHunters=0; // Isolate allocation from new anonymous hunting injuries.
  c.market.ecology.foodPerDeer=0;c.market.ecology.resources.resources.food.initial=78;
  c.market.ecology.resources.resources.food.lossPermille=0;c.market.ecology.resources.resources.gold.initial=0;
  c.market.ecology.resources.resources.herbs.initial=1;
  c.initialActors.forEach(a=>{a.health=500;});
  const r=day(createActorWorld(c));assert.equal(r.payload.unnamedFood,77);
  assert.deepEqual(r.payload.rows.map(row=>row.food),[1,0,0]);assert.deepEqual(r.payload.rows.map(row=>row.herbs),[1,0,0]);
  assert.equal(r.world.resources.food,0);assert.equal(r.world.resources.herbs,0);
  assert.equal(r.payload.market.ecology.resources.entries[0].unmetConsumption,2);
  assert.equal(r.payload.market.ecology.resources.entries[1].unmetConsumption,2);
  assert.equal(r.world.actorModel.ledger.herbsConsumed,1);
});

test('C1 aggregate healing has priority and cannot be counted as an Actor recovery',()=>{
  const c=defaultActorConfig();c.market.ecology.resources.settlement.injuredCount=1;
  c.market.ecology.resources.settlement.herbWorkers=0;c.market.ecology.resources.resources.herbs.initial=1;
  c.initialActors[1].health=500;
  const r=day(createActorWorld(c));assert.equal(r.payload.unnamedHerbs,1);assert.equal(r.payload.rows[1].herbs,0);
  assert.equal(r.world.ecologyModel.injuredCount,0);assert.equal(r.world.actorModel.actors[1].health,500);
  assert.equal(r.world.actorModel.ledger.herbsConsumed,0);assert.equal(r.payload.market.ecology.resources.entries[1].consumption,1);
});

test('C1 shortages cause bounded hunger injury and once-only death; tombstones stop consuming',()=>{
  const c=defaultActorConfig();Object.assign(c.initialActors[0],{health:50,hunger:900});
  c.market.ecology.resources.resources.food.initial=0;c.market.ecology.resources.resources.food.production.numerator=0;
  c.market.ecology.foodPerDeer=0;c.market.ecology.resources.resources.herbs.initial=0;c.market.ecology.resources.resources.herbs.production.numerator=0;
  c.market.ecology.resources.resources.gold.initial=0;
  const first=day(createActorWorld(c)),dead=first.world.actorModel.actors[0];
  assert.equal(dead.alive,false);assert.equal(dead.health,0);assert.equal(dead.deathTick,144);assert.deepEqual(dead.needs,{food:0,healing:0,rest:0});
  assert.equal(first.world.actorModel.ledger.deaths,1);assert.equal(first.payload.populationClosing.totalAlive,79);
  const second=day(first.world);assert.equal(second.payload.market.ecology.resources.entries[0].demand,79);
  assert.equal(second.payload.rows[0].food,0);assert.equal(second.payload.rows[0].herbs,0);assert.equal(second.payload.rows[0].died,false);
  assert.equal(second.world.actorModel.ledger.deaths,1);assert.equal(second.world.actorModel.actors[0].actorId,'actor-1');
});

test('C1 zero named actors and initial tombstones preserve demographic and resource ownership',()=>{
  const c=defaultActorConfig();c.initialActors=[];const no=day(createActorWorld(c));
  assert.equal(no.payload.unnamedFood,80);assert.equal(no.payload.rows.length,0);assert.equal(no.payload.market.ecology.resources.entries[0].demand,80);
  const d=defaultActorConfig();d.initialActors[0].health=0;const dead=day(createActorWorld(d));
  assert.equal(dead.world.actorModel.actors[0].deathTick,0);assert.equal(dead.payload.market.ecology.resources.entries[0].demand,79);
  assert.equal(dead.payload.populationClosing.unnamedAlive,77);
});

test('C1 invalid config/record/field/budget/anonymous injuries are rejected before state creation',()=>{
  for(const mutate of [c=>c.initialActors=Array(1),c=>c.initialActors=Array(65),c=>c.initialActors[0].health=1001,
    c=>c.initialActors[0].occupation='wizard',c=>c.market.ecology.resources.settlement.injuredCount=78,
    c=>c.market.ecology.resources.resources.food.consumption.denominator=2,c=>c.version='other',c=>c.extra=1]){
    const c=defaultActorConfig();mutate(c);assert.throws(()=>createActorWorld(c),bad);
  }
  assert.throws(()=>createActorWorld(new Date()),bad);
  const c=defaultActorConfig();let reads=0;Object.defineProperty(c.initialActors[0],'health',{enumerable:true,get(){reads++;return 1;}});
  assert.throws(()=>createActorWorld(c),bad);assert.equal(reads,0);
});

test('C1 session canonical proof and full history reject identity/need/portion/death/counter/RNG tampering',()=>{
  const {bundle,systems}=createActorVillage(0),session=createSimulationSession(bundle,systems);session.advanceTicks(144);
  const after=session.getBundle();assert.equal(after.eventLog[0].type,'ActorDaySettled');
  for(const mutate of [b=>b.snapshot.world.actorModel.actors[0].actorId='actor-9',b=>b.snapshot.world.actorModel.actors[0].needs.food++,
    b=>b.snapshot.world.actorModel.ledger.foodConsumed++,b=>b.eventLog[0].payload.rows[0].food++,
    b=>b.snapshot.world.actorModel.actors[0].deathTick=1,b=>b.snapshot.nextEntityId=5,b=>b.snapshot.rng.state++]){
    const corrupt=structuredClone(after);mutate(corrupt);assert.throws(()=>validateBundle(corrupt,{rulesVersion:ACTOR_RULES,systems}),bad);
  }
  const hostile={actors(ctx,due){systems.actors(ctx,due);ctx.snapshot.world.actorModel.actors[0].hunger++;}};
  const rejected=createSimulationSession(bundle,hostile);assert.throws(()=>rejected.advanceTicks(144),bad);assert.equal(rejected.getBundle().snapshot.tick,143);
  let before=bundle;for(let i=0;i<143;i++)before=advanceOneTick(before,systems);
  assert.throws(()=>advanceOneTick(before,{actors(ctx,due){systems.actors(ctx,due);throw new Error('post-meal failure');}}),/not committed/);
  assert.equal(before.snapshot.world.actorModel.ledger.foodConsumed,0);assert.equal(before.snapshot.rng.state,0);
});
