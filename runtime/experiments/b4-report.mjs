import { canonicalJson } from '../core/data-contract.mjs';
import { B4_GATES,createB4Config } from '../fixtures/b4-calibrated.mjs';

function ensure(condition,message) { if(!condition)throw new Error('B4_GATE_FAILED: '+message); }
export function auditRun(bundle,summary,scenario) {
  const snapshot=bundle.snapshot,world=snapshot.world,events=bundle.eventLog;
  ensure(canonicalJson(world.marketModel.config)===canonicalJson(createB4Config(scenario)),'frozen configuration changed');
  const previousPrices=Object.fromEntries(['food','herbs'].map(id=>[id,world.marketModel.config.products[id].basePrice]));
  const days=events.filter(e=>e.type==='EconomyDaySettled').map(e=>e.payload);
  ensure(days.length===Math.floor(snapshot.tick/144),'missing daily settlement');
  const ordered=new Map(),arrived=new Set();let paid=0n,pressureDays=0,farmLoss=0,injuries=0,herbsConsumed=0,unmetFood=0,unmetHerbs=0;
  const population={deer:world.ecologyModel.config.resources.populations.deer,wolves:world.ecologyModel.config.resources.populations.wolves};
  const resource={...world.resourceModel.config.resources};
  let food=resource.food.initial,herbs=resource.herbs.initial,gold=resource.gold.initial,injured=world.ecologyModel.config.resources.settlement.injuredCount;
  for(const [index,event] of events.entries()) {
    ensure(event.eventSeq===index+1,'event sequence');
    if(event.type==='PopulationRemoved') {const p=event.payload;ensure(population[p.species]===p.before && p.after===p.before-p.amount,'population command conservation');population[p.species]=p.after;}
    if(event.type!=='EconomyDaySettled')continue;
    const p=event.payload,e=p.ecology;
    ensure(event.tick===p.day*144,'daily schedule');
    for(const species of ['deer','wolves']){
      const row=e[species];ensure(row.opening===population[species],'population opening');
      ensure(BigInt(row.closing)===BigInt(row.opening)+BigInt(row.births)-BigInt(row.naturalDeaths)-BigInt(row.predation)-BigInt(row.starvationDeaths)-BigInt(row.hunted),'population conservation');
      ensure(row.closing>=0,'negative population');population[species]=row.closing;
    }
    ensure(e.foodWorkers+e.herbWorkers+e.hunters+e.injuredOpening<=world.ecologyModel.config.resources.settlement.humanCount,'double labour allocation');
    ensure(e.injuredOpening===injured && e.injuredClosing===injured+e.newInjuries-e.healed,'injury conservation');injured=e.injuredClosing;
    ensure(e.healed===e.resources.entries.find(r=>r.resource==='herbs').consumption,'free healing');
    for(const row of e.resources.entries){
      const opening=row.resource==='food'?food:row.resource==='herbs'?herbs:gold;
      ensure(row.opening===opening,'resource opening');
      ensure(BigInt(row.closing)===BigInt(row.opening)+BigInt(row.production)+BigInt(row.inflow)-BigInt(row.consumption)-BigInt(row.outflow)-BigInt(row.loss)-BigInt(row.capacityLoss),'resource conservation');
      ensure(row.closing>=0 && row.demand===row.consumption+row.unmetConsumption,'resource deficit');
      if(row.resource==='food')food=row.closing;if(row.resource==='herbs')herbs=row.closing;
    }
    const arrivalUnits={food:0,herbs:0};let dayPayment=0n;
    for(const cargo of p.arrivals){
      ensure(!arrived.has(cargo.shipmentId) && ordered.has(cargo.shipmentId),'duplicate or unbought arrival');
      ensure(canonicalJson(cargo)===canonicalJson(ordered.get(cargo.shipmentId)) && cargo.dueDay<=p.day && p.routeOpen,'early/changed/closed-route cargo');
      arrived.add(cargo.shipmentId);arrivalUnits[cargo.resource]+=cargo.amount;
    }
    for(const order of p.orders){
      ensure(Number.isSafeInteger(order.amount) && order.amount>0 && Number.isSafeInteger(order.unitPrice) && order.unitPrice>0 && Number.isSafeInteger(order.cost) && order.cost>0,'invalid order quantities');
      ensure(p.routeOpen && !ordered.has(order.shipmentId),'closed/duplicate order');
      ensure(BigInt(order.cost)===BigInt(order.unitPrice)*BigInt(order.amount) && order.dueDay===p.day+world.marketModel.config.delayDays,'locked cost/delay');
      ensure(order.unitPrice===p.prices[order.resource].current,'unlocked order price');ordered.set(order.shipmentId,order);dayPayment+=BigInt(order.cost);
    }
    for(const id of ['food','herbs']){
      const configured=world.resourceModel.config.flows.filter(f=>f.day===p.day && f.resource===id && f.direction==='in').reduce((sum,f)=>sum+f.amount,0);
      ensure(e.resources.entries.find(r=>r.resource===id).inflow===arrivalUnits[id]+configured,'unlogged goods inflow');
      const product=world.marketModel.config.products[id],quote=p.prices[id],stock=id==='food'?food:herbs;
      let gap=(BigInt(product.targetStock)-BigInt(stock))*1000n/BigInt(Math.max(1,product.targetStock));gap=gap>1000n?1000n:gap< -1000n?-1000n:gap;
      const c=world.marketModel.config,target=Math.max(product.minPrice,Math.min(product.maxPrice,Number(BigInt(product.basePrice)*(1000n+gap*BigInt(c.scarcityGainPermille)/1000n+BigInt(c.routeRiskPermille)*BigInt(c.riskPremiumPermille)/1000n)/1000n)));
      const current=Math.max(previousPrices[id]-product.maxDailyChange,Math.min(previousPrices[id]+product.maxDailyChange,target));
      ensure(quote.previous===previousPrices[id] && quote.current===current && quote.gapPermille===Number(gap) && quote.target===target && quote.current>=product.minPrice && quote.current<=product.maxPrice && Math.abs(quote.current-quote.previous)<=product.maxDailyChange,'price formula/bounds');
      previousPrices[id]=quote.current;
    }
    ensure(dayPayment===BigInt(p.goldSpent) && gold===p.goldOpening && BigInt(p.goldClosing)===BigInt(gold)-dayPayment,'payment conservation');
    gold=p.goldClosing;paid+=dayPayment;
    const pending=[...ordered.values()].filter(o=>!arrived.has(o.shipmentId)).reduce((n,o)=>n+o.amount,0);
    ensure(pending===p.inTransitUnits && pending<=world.marketModel.config.transportCapacity,'in-transit capacity/ledger');
    if(e.pressurePermille>0)pressureDays++;farmLoss+=e.farmLoss;injuries+=e.newInjuries;herbsConsumed+=e.resources.entries[1].consumption;
    unmetFood+=e.resources.entries[0].unmetConsumption;unmetHerbs+=e.resources.entries[1].unmetConsumption;
  }
  ensure(food===world.resources.food && herbs===world.resources.herbs && gold===world.resources.gold && BigInt(world.marketModel.paid)===paid,'final inventory/cash mismatch');
  ensure(canonicalJson(population)===canonicalJson(world.ecologyModel.populations),'final population');
  ensure(world.marketModel.nextShipmentId===ordered.size+1 && snapshot.nextEventSeq===events.length+1,'counter mismatch');
  ensure(canonicalJson(world.marketModel.inTransit)===canonicalJson([...ordered.values()].filter(o=>!arrived.has(o.shipmentId))),'pending cargo identity/paid terms');
  for(const id of ['food','herbs'])ensure(world.marketModel.ordered[id]-world.marketModel.arrived[id]===world.marketModel.inTransit.filter(o=>o.resource===id).reduce((n,o)=>n+o.amount,0),'pending commodity totals');
  if(scenario==='baseline'){
    ensure(days.every(p=>p.ecology.deer.closing>0 && p.ecology.wolves.closing>0),'baseline extinction');
    ensure(unmetFood===0 && unmetHerbs===0,'baseline unmet needs');
    if(days.length>=500)ensure(population.deer>=B4_GATES.baselineFinalDeerMin && population.deer<=B4_GATES.baselineFinalDeerMax && population.wolves>=B4_GATES.baselineFinalWolvesMin && population.wolves<=B4_GATES.baselineFinalWolvesMax,'baseline frozen final range');
  }
  const removed=events.find(e=>e.type==='PopulationRemoved');
  const recovery=removed?days.find(p=>p.day>10 && p.ecology.deer.closing>=removed.payload.before)?.day:null;
  if(scenario==='mild')ensure(recovery && recovery<=B4_GATES.mildRecoveryMaxDay,'mild disturbance does not recover');
  if(days.length===1000)ensure(summary.elapsedMs<=B4_GATES.max1000DaysElapsedMs,'frozen runtime budget');
  return {scenario,seed:snapshot.rng.seed,days:days.length,eventCount:events.length,populations:population,resources:world.resources,
    pressureDays,farmLoss,injuries,herbsConsumed,unmetFood,unmetHerbs,paid:Number(paid),orderCount:ordered.size,arrivalCount:arrived.size,
    pendingOrderCount:world.marketModel.inTransit.length,recoveryDay:recovery,elapsedMs:summary.elapsedMs,rssAtEnd:summary.memoryUsage.rss,
    stateHash:summary.stateHash,eventHash:summary.eventHash,marketConfigHash:summary.marketConfigHash,checkpointPath:summary.checkpointPath};
}

export function auditPaired(baseline,severe,shortage,blocked) {
  const facts=b=>b.eventLog.filter(e=>e.type==='EconomyDaySettled').map(e=>e.payload);
  const a=facts(baseline),s=facts(severe),h=facts(shortage),b=facts(blocked);
  ensure(canonicalJson(a.slice(0,9))===canonicalJson(s.slice(0,9)),'pre-intervention baseline differs');
  ensure(canonicalJson(h.slice(0,9))===canonicalJson(b.slice(0,9)),'shortage/blockage pair differs before command');
  const pressure=s.find(p=>p.ecology.pressurePermille>0 && p.day>=10);ensure(pressure,'no deer→wolf pressure');
  ensure(s.some(p=>p.day>=pressure.day && p.ecology.farmLoss>0 && p.ecology.hunters>0 && p.ecology.newInjuries>0 && p.ecology.resources.entries[1].consumption>0),'missing pressure→farm/hunt/health→medicine chain');
  const order=s.flatMap(p=>p.orders.map(o=>({...o,day:p.day}))).find(o=>o.resource==='herbs' && o.orderDay>=pressure.day && o.cost>0 && s[o.orderDay-1].prices.herbs.current>a[o.orderDay-1].prices.herbs.current);
  ensure(order && s.some(p=>p.day>=order.dueDay && p.arrivals.some(o=>o.shipmentId===order.shipmentId)),'no higher-price paid delayed medicine supply');
  ensure(b.filter(p=>p.day>=10).every(p=>!p.routeOpen && p.orders.length===0 && p.arrivals.length===0),'trade blockage did not hold');
  const sum=(list,pick)=>list.reduce((n,p)=>n+pick(p),0);
  ensure(sum(b,p=>p.ecology.resources.entries[1].unmetConsumption)>sum(h,p=>p.ecology.resources.entries[1].unmetConsumption),'trade blockage did not worsen medicine deficit');
  return {pressureDay:pressure.day,paidMedicineOrder:order.shipmentId,orderDay:order.orderDay,arrivalDueDay:order.dueDay,
    openMedicineDeficit:sum(h,p=>p.ecology.resources.entries[1].unmetConsumption),blockedMedicineDeficit:sum(b,p=>p.ecology.resources.entries[1].unmetConsumption)};
}
