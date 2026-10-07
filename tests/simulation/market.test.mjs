import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMarketConfig, shortageMarketConfig, createMarketWorld, settleMarketDay, quotePrice,
  applyMarketCommand, MARKET_RULES, validateMarketWorld } from '../../runtime/core/market.mjs';
import { createMarketVillage } from '../../runtime/fixtures/market-village.mjs';
import { advanceOneTick, lookupCommand } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);
const day=w=>settleMarketDay(w,0.5);
const advance=(b,s,n)=>{for(let i=0;i<n;i++)b=advanceOneTick(b,s);return b;};

test('B3 stock prices have one scarcity signal, explicit floors/ceilings and daily movement bound',()=>{
  const c=defaultMarketConfig(),product=c.products.food;
  assert.deepEqual(quotePrice(0,10,product,c),{previous:10,gapPermille:1000,target:20,current:12});
  assert.equal(quotePrice(900,10,product,c).current,8);
  const zero={...product,targetStock:0};assert.equal(quotePrice(0,10,zero,c).gapPermille,0);
  for(const stock of [0,1,399,400,900,Number.MAX_SAFE_INTEGER]){
    const p=quotePrice(stock,10,product,c);assert.ok(p.current>=5 && p.current<=30);assert.ok(Math.abs(p.current-10)<=2);
  }
  const changed=structuredClone(c);changed.routeRiskPermille=1000;changed.riskPremiumPermille=1000;
  assert.equal(quotePrice(0,29,product,changed).current,30);
});

test('B3 money is paid once at locked price; goods are unavailable until their due day',()=>{
  const start=createMarketWorld(shortageMarketConfig()),first=day(start);
  assert.equal(first.payload.orders.length,2);assert.equal(first.payload.arrivals.length,0);
  assert.equal(first.payload.orders[0].resource,'food');assert.equal(first.payload.orders[0].amount,100);
  assert.equal(first.payload.orders[0].unitPrice,12);assert.equal(first.payload.orders[0].dueDay,3);
  assert.equal(first.payload.goldSpent,1980);assert.equal(first.world.resources.gold,20);
  // The existing low-food hunting rule adds 2 deer × 20 rations before consumption.
  assert.equal(first.payload.ecology.deer.hunted,2);assert.equal(first.payload.ecology.resources.entries[0].production,136);
  assert.equal(first.world.resources.food,156);assert.equal(first.world.resources.herbs,0);
  const second=day(first.world);assert.equal(second.payload.arrivals.length,0);assert.ok(second.world.resources.food<216);
  const third=day(second.world);assert.equal(third.payload.arrivals.length,2);
  assert.equal(third.payload.ecology.resources.entries[0].inflow,100);
  assert.equal(third.payload.ecology.resources.entries[1].inflow,13);
  assert.equal(third.world.marketModel.arrived.food,100);assert.equal(third.world.marketModel.arrived.herbs,13);
  assert.equal(start.resources.gold,2000);validateMarketWorld(third.world);
});

test('B3 zero funds cannot refill; transport and in-flight goods limit order volume',()=>{
  const no=shortageMarketConfig();no.ecology.resources.resources.gold.initial=0;
  const empty=day(createMarketWorld(no));assert.deepEqual(empty.payload.orders,[]);assert.equal(empty.world.resources.gold,0);
  const small=shortageMarketConfig();small.transportCapacity=7;
  const capped=day(createMarketWorld(small));assert.equal(capped.payload.orders[0].amount,7);
  assert.equal(capped.payload.inTransitUnits,7);assert.equal(capped.payload.orders.length,1);
  const next=day(capped.world);assert.deepEqual(next.payload.orders,[]);assert.equal(next.payload.inTransitUnits,7);
  assert.equal(next.payload.ecology.resources.entries[0].inflow,0);
  assert.equal(next.payload.ecology.resources.entries[0].opening,capped.world.resources.food);
});

test('B3 medicine shortage raises bounded price, paid cargo later reduces shortage and enables actual treatment',()=>{
  const config=shortageMarketConfig(),poor=structuredClone(config);poor.ecology.resources.resources.gold.initial=0;
  let supplied=createMarketWorld(config),unfunded=createMarketWorld(poor);const facts=[];
  for(let i=0;i<3;i++){
    const a=day(supplied),b=day(unfunded);supplied=a.world;unfunded=b.world;facts.push(a.payload);
  }
  assert.equal(facts[0].prices.herbs.current,60);assert.equal(facts[0].prices.herbs.gapPermille,1000);
  assert.ok(facts[0].orders.some(o=>o.resource==='herbs' && o.cost>0));
  assert.equal(facts[1].ecology.resources.entries[1].inflow,0);
  assert.ok(facts[2].ecology.resources.entries[1].inflow>0);
  assert.ok(facts[2].prices.herbs.gapPermille<1000);
  assert.ok(supplied.ecologyModel.injuredCount<unfunded.ecologyModel.injuredCount);
});

test('B3 population intervention still commits after earlier purchases changed the currency ledger',()=>{
  const command={commandId:'remove-after-pay',targetTick:145,type:'RemovePopulation',payload:{species:'wolves',amount:1}};
  const {bundle,systems}=createMarketVillage(0,'market-intervention',shortageMarketConfig(),[command]);
  const paid=advance(bundle,systems,144);assert.ok(paid.snapshot.world.marketModel.paid>0);
  const result=advanceOneTick(paid,systems);assert.equal(result.snapshot.commandReceipts[command.commandId].status,'succeeded');
  assert.equal(result.snapshot.world.ecologyModel.ledger.wolves.removed,1);
  assert.equal(result.snapshot.world.marketModel.paid,paid.snapshot.world.marketModel.paid);
  assert.equal(result.snapshot.world.resources.gold,paid.snapshot.world.resources.gold);
  validateBundle(result,{rulesVersion:MARKET_RULES,systems});
});

test('B3 route pause retains paid cargo and reopens without duplicate arrival or payment',()=>{
  const first=day(createMarketWorld(shortageMarketConfig()));
  const closed=applyMarketCommand(first.world,{type:'SetTradeRoute',payload:{open:false}});
  assert.deepEqual(closed.result,{before:true,open:false});
  const second=day(closed.world),third=day(second.world);
  assert.deepEqual(second.payload.orders,[]);assert.deepEqual(third.payload.arrivals,[]);
  assert.equal(third.world.marketModel.paid,1980);assert.equal(third.world.marketModel.inTransit.length,2);
  const reopened=applyMarketCommand(third.world,{type:'SetTradeRoute',payload:{open:true}});
  const fourth=day(reopened.world);assert.equal(fourth.payload.arrivals.length,2);
  assert.equal(fourth.world.marketModel.arrived.food,100);
  const fifth=day(fourth.world);assert.equal(fifth.payload.arrivals.filter(a=>a.shipmentId==='shipment-1').length,0);
});

test('B3 resource and gold ledgers reconcile delivered quantities, capacity loss and total payment',()=>{
  let world=createMarketWorld(shortageMarketConfig());const opening=structuredClone(world);
  for(let i=0;i<15;i++){
    const r=day(world);world=r.world;
    assert.equal(r.payload.goldClosing,r.payload.goldOpening-r.payload.goldSpent);
    for(const order of r.payload.orders)assert.equal(order.cost,order.amount*order.unitPrice);
    for(const id of ['food','herbs']){
      const inFlight=world.marketModel.inTransit.filter(o=>o.resource===id).reduce((sum,o)=>sum+o.amount,0);
      assert.equal(world.marketModel.ordered[id]-world.marketModel.arrived[id],inFlight);
    }
    assert.equal(world.resources.gold,opening.resources.gold-world.marketModel.paid);
    assert.equal(world.resourceModel.ledger.gold.consumption,world.marketModel.paid);
  }
  const spill=shortageMarketConfig();spill.ecology.resources.resources.food.capacity=110;
  spill.ecology.resources.resources.food.initial=100;
  const delivered=day(day(day(createMarketWorld(spill)).world).world);
  assert.ok(delivered.payload.ecology.resources.entries[0].capacityLoss>0);
});

test('B3 invalid records/configs/rates/budgets/unsafe costs reject before mutation',()=>{
  for(const mutate of [c=>c.delayDays=0,c=>c.products.food.minPrice=0,c=>c.products.food.maxPrice=4,
    c=>c.routeRiskPermille=1001,c=>c.transportCapacity=1000001,c=>c.products.herbs.maxOrder=-1,c=>c.extra=1]){
    const c=defaultMarketConfig();mutate(c);assert.throws(()=>createMarketWorld(c),bad);
  }
  assert.throws(()=>createMarketWorld(new Date()),bad);
  const initial=createMarketWorld(shortageMarketConfig());
  assert.throws(()=>applyMarketCommand(initial,{type:'SetTradeRoute',payload:{open:'false'}}),bad);
  const extra=structuredClone(initial);extra.marketModel.inTransit=Array(1001).fill(null);
  assert.throws(()=>day(extra),e=>e.code==='LIMIT_EXCEEDED');assert.equal(initial.resources.gold,2000);
});

test('B3 real core route commands are idempotent and all market history tampering rolls back',()=>{
  const input={commandId:'close',targetTick:1,type:'SetTradeRoute',payload:{open:false}};
  const {bundle,systems}=createMarketVillage(0,'market-test',shortageMarketConfig(),[input,input]);
  const closed=advance(bundle,systems,144);assert.equal(lookupCommand(closed,input).status,'succeeded');
  assert.equal(closed.eventLog[0].type,'TradeRouteSet');assert.equal(closed.snapshot.nextInputSeq,2);
  assert.deepEqual(closed.eventLog[1].causationEventSeqs,[1]);assert.equal(closed.snapshot.world.marketModel.paid,0);
  const {bundle:fresh}=createMarketVillage(0,'market-active',shortageMarketConfig());
  const settled=advance(fresh,systems,144);validateBundle(settled,{rulesVersion:MARKET_RULES,systems});
  for(const mutate of [b=>b.snapshot.world.marketModel.prices.food++,b=>b.snapshot.world.marketModel.paid++,
    b=>b.snapshot.world.marketModel.inTransit[0].dueDay--,b=>b.snapshot.world.marketModel.inTransit[0].unitPrice++,
    b=>b.eventLog[0].payload.orders[0].cost++,b=>b.snapshot.world.marketModel.ordered.food++,
    b=>b.snapshot.rng.state++,b=>b.snapshot.world.marketModel.config.delayDays++,
    b=>b.eventLog[0].payload.goldSpent--]){
    const broken=structuredClone(settled);mutate(broken);assert.throws(()=>validateBundle(broken,{rulesVersion:MARKET_RULES,systems}),bad);
  }
  const before=advance(fresh,systems,143),failure={market(ctx,due){systems.market(ctx,due);throw new Error('after spending');}};
  assert.throws(()=>advanceOneTick(before,failure),/not committed/);assert.equal(before.snapshot.world.resources.gold,2000);
  assert.equal(before.snapshot.world.marketModel.inTransit.length,0);assert.equal(before.snapshot.rng.state,0);
});
