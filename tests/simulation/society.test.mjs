import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSocietyConfig,createSocietyWorld,validateSocietyWorld,planSocietyDay,applySocietyAction,settleSocietyDay,validateSocietyActionResult } from '../../runtime/core/society.mjs';
import { createRng } from '../../runtime/core/rng.mjs';
import { createActorWorld,defaultActorConfig,settleActorDay } from '../../runtime/core/actors.mjs';
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);
function tick(w,seed=42){const rng=createRng(seed),plan=planSocietyDay(w);w=plan.world;const results=[];
  for(const cmd of plan.commands){const r=applySocietyAction(w,cmd.payload,cmd.payload.action==='Hunt'?rng.next():null);results.push({command:cmd,...r});w=r.world;}
  return {...settleSocietyDay(w,rng.next()),results};}

test('C3 three private estates are transferred without minting goods or coins, and all living people consume once',()=>{
  const c=defaultSocietyConfig(),w=createSocietyWorld(c);assert.equal(w.resources.food,891);
  assert.equal(w.societyModel.agents.reduce((n,a)=>n+a.state.inventory.food,0),9);
  assert.equal(w.societyModel.agents.reduce((n,a)=>n+a.state.wallet,0),100);assert.equal(w.resources.gold,20000);
  const r=tick(w);assert.equal(r.payload.actors.market.ecology.resources.entries[0].demand,77);
  assert.equal(r.payload.actors.rows.reduce((n,row)=>n+row.food,0),3);assert.equal(r.payload.agents.length,3);
  validateSocietyWorld(r.world);
});

test('C3 same-snapshot plans for the last public medicine only commit once; losers keep funds and failed goals',()=>{
  const c=defaultSocietyConfig();c.actors.market.ecology.resources.resources.herbs.initial=1;
  c.actors.initialActors[0].health=500;c.actors.initialActors[1].health=500;c.estates.forEach(e=>e.initialWallet=100);
  const initial=createSocietyWorld(c),p=planSocietyDay(initial);
  assert.equal(p.commands[0].payload.action,'BuyMedicine');assert.equal(p.commands[1].payload.action,'BuyMedicine');
  let w=p.world;const first=applySocietyAction(w,p.commands[0].payload);w=first.world;const second=applySocietyAction(w,p.commands[1].payload);
  assert.equal(first.success,true);assert.equal(second.success,false);assert.equal(first.world.resources.herbs,0);
  assert.equal(second.world.societyModel.agents[1].state.wallet,100);assert.equal(second.world.societyModel.agents[1].state.inventory.herbs,0);
  assert.equal(second.world.societyModel.agents[1].state.currentGoal.failures,1);
  assert.equal(second.world.societyModel.agents[0].state.inventory.herbs,1);assert.deepEqual(initial.societyModel.agents.map(a=>a.state.wallet),[100,100,100]);
});

test('C3 two injured poor residents competing for the last wage cannot overspend common currency',()=>{
  const c=defaultSocietyConfig();c.actors.initialActors[0].health=500;c.actors.initialActors[1].health=500;
  c.estates.forEach(e=>e.initialWallet=0);c.actors.market.ecology.resources.resources.gold.initial=20;
  const p=planSocietyDay(createSocietyWorld(c));assert.equal(p.commands[0].payload.action,'WorkForPay');assert.equal(p.commands[1].payload.action,'WorkForPay');
  const a=applySocietyAction(p.world,p.commands[0].payload),b=applySocietyAction(a.world,p.commands[1].payload);
  assert.equal(a.success,true);assert.equal(b.success,false);assert.deepEqual(b.world.societyModel.agents.map(a=>a.state.wallet),[20,0,0]);
  assert.equal(b.world.resources.gold,20);assert.equal(b.world.societyModel.agents[1].state.ledger.wages,0);
});

test('C3 merchant sale moves real medicine and cash together, then buyer continues the same health goal next day',()=>{
  const c=defaultSocietyConfig();c.actors.initialActors[1].health=500;c.estates[1].initialWallet=100;c.estates[2].initialHerbs=1;
  c.actors.market.ecology.resources.resources.herbs.initial=1;c.actors.market.ecology.resources.resources.herbs.production.numerator=0;
  const first=tick(createSocietyWorld(c));const sale=first.results.find(r=>r.command.payload.action==='SellMedicine');
  assert.ok(sale?.success);assert.equal(sale.result.buyerId,'actor-2');assert.equal(sale.result.price,52);
  assert.equal(first.world.societyModel.agents[1].state.wallet,48);assert.equal(first.world.societyModel.agents[2].state.wallet,152);
  assert.equal(first.world.societyModel.agents[1].state.inventory.herbs,1);assert.equal(first.world.societyModel.agents[2].state.inventory.herbs,0);
  const second=tick(first.world);assert.equal(second.results.find(r=>r.command.payload.actorId==='actor-2').command.payload.action,'UseMedicine');
  assert.equal(second.world.actorModel.actors[1].health,600);assert.equal(second.world.societyModel.agents[1].state.inventory.herbs,0);
});

test('C3 chief public-food and merchant stock goals are real role-specific work and inventory',()=>{
  const c=defaultSocietyConfig();c.actors.market.ecology.resources.resources.food.initial=100;
  const r=tick(createSocietyWorld(c));assert.equal(r.results[0].command.payload.action,'WorkForPay');
  assert.equal(r.payload.agents[0].decision.kind,'support-village');assert.equal(r.world.societyModel.agents[0].state.ledger.workDays,1);
  assert.equal(r.results[2].command.payload.action,'BuyMedicine');assert.equal(r.payload.agents[2].decision.kind,'stock-medicine');
  assert.equal(r.world.societyModel.agents[2].state.inventory.herbs,1);assert.equal(r.payload.agents[2].goalOutcome,'completed');
});

test('C3 dead or already supplied buyer rejects peer sale; invalid rosters and double private balances fail',()=>{
  const c=defaultSocietyConfig();c.estates[2].initialHerbs=1;c.estates[1].initialWallet=100;c.actors.initialActors[1].health=0;
  const dead=createSocietyWorld(c),r=applySocietyAction(dead,{actorId:'actor-3',goalId:0,action:'SellMedicine',targetActorId:'actor-2'});
  assert.equal(r.success,false);assert.equal(r.world.societyModel.agents[1].state.wallet,100);assert.equal(r.world.societyModel.agents[2].state.inventory.herbs,1);
  const supplied=defaultSocietyConfig();supplied.actors.initialActors[1].health=500;supplied.estates[1].initialWallet=100;
  supplied.estates[1].initialHerbs=1;supplied.estates[2].initialHerbs=1;
  const already=applySocietyAction(createSocietyWorld(supplied),{actorId:'actor-3',goalId:0,action:'SellMedicine',targetActorId:'actor-2'});
  assert.equal(already.success,false);assert.equal(already.world.societyModel.agents[1].state.inventory.herbs,1);assert.equal(already.world.societyModel.agents[1].state.wallet,100);
  for(const mutate of [c=>c.estates=Array(3),c=>c.estates[0].actorId='actor-2',c=>c.estates[0].initialWallet=20001,c=>c.saleMarkup=-1,c=>c.actors.initialActors[0].occupation='hunter']){
    const c=defaultSocietyConfig();mutate(c);assert.throws(()=>createSocietyWorld(c),bad);
  }
  const w=createSocietyWorld(defaultSocietyConfig());w.societyModel.agents[0].state.wallet++;
  assert.throws(()=>validateSocietyWorld(w),bad);
});

test('C3 public fact validation must reject getters before consulting action type',()=>{
  let reads=0;const accessed={};Object.defineProperty(accessed,'action',{enumerable:true,get(){reads++;return 'SellMedicine';}});
  assert.throws(()=>validateSocietyActionResult(accessed),bad);assert.equal(reads,0);
});

test('C3 batch management rejects null/alien policies and accessors without invoking them',()=>{
  const world=createActorWorld(defaultActorConfig());
  for(const policy of [null,new Date(),new Map()])assert.throws(()=>settleActorDay(world,0.5,policy),bad);
  let reads=0;const policy={privateFoodConsumed:0,reservedGold:0};
  Object.defineProperty(policy,'managedActors',{enumerable:true,get(){reads++;return [];}});
  assert.throws(()=>settleActorDay(world,0.5,policy),bad);assert.equal(reads,0);
});
