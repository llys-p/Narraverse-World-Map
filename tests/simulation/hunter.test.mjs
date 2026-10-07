import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultHunterConfig,createHunterWorld,applyHunterAction,planHunterDay,settleHunterDay,
  validateHunterWorld,communalGold } from '../../runtime/core/hunter.mjs';
import { createRng } from '../../runtime/core/rng.mjs';
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);
const target=w=>w.actorModel.actors.find(a=>a.actorId===w.hunterModel.actorId);
function action(w,kind,sample=null){return applyHunterAction(w,{actorId:w.hunterModel.actorId,goalId:0,action:kind},sample);}
function tick(w,rng){const plan=planHunterDay(w);w=plan.world;
  const committed=plan.command?applyHunterAction(w,plan.command.payload,plan.command.payload.action==='Hunt'?rng.next():null):null;
  if(committed)w=committed.world;const result=settleHunterDay(w,rng.next());return {...result,plan:plan.decision,command:plan.command,committed};}

test('C2 initial private rations are transferred, money remains conserved and wages cannot be minted',()=>{
  const c=defaultHunterConfig(),w=createHunterWorld(c);assert.equal(w.resources.food+w.hunterModel.inventory.food,c.actors.market.ecology.resources.resources.food.initial);
  assert.equal(w.hunterModel.inventory.food,3);assert.equal(w.resources.gold,20000);assert.equal(communalGold(w),20000);
  const job=action(w,'WorkForPay');assert.equal(job.success,true);assert.equal(job.world.hunterModel.wallet,20);
  assert.equal(job.world.resources.gold,20000);assert.equal(communalGold(job.world),19980);
  assert.equal(job.world.resources.food,w.resources.food+8);assert.equal(w.hunterModel.wallet,0);
  const poor=defaultHunterConfig();poor.actors.market.ecology.resources.resources.gold.initial=0;
  const refused=action(createHunterWorld(poor),'WorkForPay');assert.equal(refused.success,false);assert.equal(refused.world.hunterModel.wallet,0);
});

test('C2 internal purchases move ownership once; medicine use consumes private inventory, not village stock twice',()=>{
  const c=defaultHunterConfig();c.initialWallet=100;c.actors.initialActors[1].health=500;
  let w=createHunterWorld(c),total=w.resources.gold,herbs=w.resources.herbs;
  const bought=action(w,'BuyMedicine');assert.equal(bought.success,true);w=bought.world;
  assert.equal(w.hunterModel.wallet,50);assert.equal(w.resources.gold,total);assert.equal(w.resources.herbs,herbs-1);
  assert.equal(w.hunterModel.inventory.herbs,1);assert.equal(w.resourceModel.ledger.herbs.outflow,1);
  w=settleHunterDay(w,0.5).world;
  const used=action(w,'UseMedicine');assert.equal(used.success,true);assert.equal(used.world.hunterModel.inventory.herbs,0);
  assert.equal(target(used.world).health,600);assert.equal(used.world.resources.herbs,w.resources.herbs);
  assert.equal(used.world.hunterModel.ledger.herbsUsed,1);
  const notAgain=action(used.world,'UseMedicine');assert.equal(notAgain.success,false);assert.equal(notAgain.world.hunterModel.ledger.herbsUsed,1);
});

test('C2 Hunt takes the same deer once, produces owned food, risks injury and excludes double daily actions',()=>{
  const w=createHunterWorld(defaultHunterConfig()),deer=w.ecologyModel.populations.deer;
  const hunt=action(w,'Hunt',0);assert.equal(hunt.success,true);assert.equal(hunt.world.ecologyModel.populations.deer,deer-1);
  assert.equal(hunt.world.ecologyModel.ledger.deer.hunted,1);assert.equal(hunt.world.hunterModel.inventory.food,23);
  assert.equal(hunt.world.resources.food,w.resources.food);assert.equal(target(hunt.world).health,900);
  assert.equal(target(hunt.world).fatigue,200);assert.equal(action(hunt.world,'Hunt',0).success,false);
  const c=defaultHunterConfig();c.actors.market.ecology.resources.populations.deer=0;
  assert.equal(action(createHunterWorld(c),'Hunt',0).success,false);
});

test('C2 daily own ration prevents anonymous consumption duplication; dead hunters do not act or eat',()=>{
  const w=createHunterWorld(defaultHunterConfig()),rng=createRng(42),r=tick(w,rng);
  assert.equal(r.payload.actors.market.ecology.resources.entries[0].demand,79);
  assert.equal(r.payload.privateFood,1);assert.equal(r.world.hunterModel.inventory.food,2);
  assert.equal(r.world.actorModel.ledger.foodConsumed,3);assert.equal(r.world.hunterModel.ledger.foodUsed,1);
  const c=defaultHunterConfig();c.actors.initialActors[1].health=0;
  const dead=createHunterWorld(c);assert.equal(action(dead,'WorkForPay').success,false);
  const d=tick(dead,createRng(0));assert.equal(d.command,null);assert.equal(d.payload.privateFood,0);
  assert.equal(d.world.hunterModel.inventory.food,3);assert.equal(d.payload.population.totalAlive,79);
});

test('C2 Utility changes with hunger/health/fatigue/assets and existing medicine goals persist across steps',()=>{
  const c=defaultHunterConfig();c.actors.initialActors[1].health=500;c.initialFood=20;
  let w=createHunterWorld(c);const rng=createRng(42),actions=[],goals=[];
  for(let i=0;i<20;i++){const r=tick(w,rng);w=r.world;actions.push(r.command?.payload.action);goals.push(r.command?.payload.goalId);}
  assert.ok(actions.includes('WorkForPay'));assert.ok(actions.includes('BuyMedicine'));assert.ok(actions.includes('UseMedicine'));
  assert.ok(target(w).health>=800);assert.ok(w.hunterModel.ledger.goalsCompleted>=1);
  assert.equal(goals[0],goals[1]);assert.ok(w.hunterModel.ledger.wages>0);assert.ok(w.hunterModel.ledger.spentMedicine>0);
  const hungry=defaultHunterConfig();hungry.initialFood=0;hungry.actors.initialActors[1].hunger=500;
  assert.equal(planHunterDay(createHunterWorld(hungry)).command.payload.action,'Hunt');
  const fatigued=defaultHunterConfig();fatigued.actors.initialActors[1].fatigue=900;
  assert.equal(planHunterDay(createHunterWorld(fatigued)).command.payload.action,'Rest');
  const rich=defaultHunterConfig();rich.initialWallet=100;rich.actors.initialActors[1].health=500;
  assert.equal(planHunterDay(createHunterWorld(rich)).command.payload.action,'BuyMedicine');
});

test('C2 enough money but unavailable medicine waits instead of farming unnecessary wages; successful meal completes a food goal',()=>{
  const waiting=defaultHunterConfig();waiting.initialWallet=100;waiting.actors.initialActors[1].health=500;
  waiting.actors.market.ecology.resources.resources.herbs.initial=0;
  const plan=planHunterDay(createHunterWorld(waiting));assert.equal(plan.command.payload.action,'Rest');assert.equal(plan.decision.blocked,true);
  const hungry=defaultHunterConfig();hungry.initialWallet=100;hungry.initialFood=0;hungry.actors.initialActors[1].hunger=300;
  const r=tick(createHunterWorld(hungry),createRng(0));assert.equal(r.command.payload.action,'BuyFood');
  assert.equal(target(r.world).hunger,200);assert.equal(r.payload.goalOutcome,'completed');assert.equal(r.world.hunterModel.currentGoal,null);
});

test('C2 impossible goals terminate/cool down; bad inputs, tampered private ledgers and capacity failures refuse',()=>{
  const c=defaultHunterConfig();c.actors.initialActors[1].health=500;c.initialFood=20;
  c.actors.market.ecology.resources.resources.gold.initial=0;c.actors.market.ecology.resources.resources.herbs.initial=0;
  c.actors.market.ecology.resources.resources.herbs.production.numerator=0;
  let w=createHunterWorld(c),rng=createRng(0);
  for(let i=0;i<5;i++)w=tick(w,rng).world;
  assert.ok(w.hunterModel.ledger.goalsFailed>0);assert.ok(w.hunterModel.ledger.failedActions<=4);
  for(const mutate of [c=>c.initialWallet=20001,c=>c.initialFood=1001,c=>c.actionCost=NaN,c=>c.actors.initialActors[1].occupation='chief']){
    const c=defaultHunterConfig();mutate(c);assert.throws(()=>createHunterWorld(c),bad);
  }
  const initial=createHunterWorld(defaultHunterConfig());
  for(const mutate of [w=>w.hunterModel.wallet++,w=>w.hunterModel.inventory.food++,w=>w.hunterModel.ledger.hunts++]){
    const corrupt=structuredClone(initial);mutate(corrupt);assert.throws(()=>validateHunterWorld(corrupt),bad);
  }
  assert.throws(()=>applyHunterAction(initial,{actorId:'actor-2',goalId:0,action:'teleport'}),bad);
  assert.throws(()=>action(initial,'Hunt',NaN),bad);
});

test('C2 market cannot spend a reserved wallet and ownership ledgers reconcile after each real day',()=>{
  const c=defaultHunterConfig();c.initialWallet=100;c.actors.market.ecology.resources.resources.gold.initial=100;
  c.actors.market.ecology.resources.resources.food.initial=100;c.actors.market.ecology.resources.resources.herbs.initial=0;
  const initial=createHunterWorld(c),r=tick(initial,createRng(0));
  assert.equal(r.world.resources.gold,100);assert.equal(r.world.hunterModel.wallet,100);
  assert.equal(r.payload.actors.market.orders.length,0);assert.equal(communalGold(r.world),0);
});

test('C2 capacity loss is real and a refused purchase cannot partially transfer money or warehouse stock',()=>{
  const c=defaultHunterConfig();c.initialFood=0;c.actors.market.ecology.resources.resources.food.initial=1800;
  const full=createHunterWorld(c),worked=action(full,'WorkForPay');assert.equal(worked.success,true);
  assert.equal(worked.world.resources.food,1800);assert.equal(worked.world.resourceModel.ledger.food.production,8);
  assert.equal(worked.world.resourceModel.ledger.food.capacityLoss,8);assert.equal(worked.world.hunterModel.wallet,20);
  const poor=createHunterWorld(defaultHunterConfig()),before=structuredClone(poor);
  const refused=action(poor,'BuyMedicine');assert.equal(refused.success,false);
  assert.deepEqual(refused.world.resources,before.resources);assert.deepEqual(refused.world.resourceModel,before.resourceModel);
  assert.equal(refused.world.hunterModel.wallet,0);assert.deepEqual(refused.world.hunterModel.inventory,before.hunterModel.inventory);
  assert.deepEqual(poor,before);
});
