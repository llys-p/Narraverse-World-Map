import { cloneData, fields, integer, denseArray, canonicalJson, validateJsonData, requireCondition } from './data-contract.mjs';
import { createEcologyWorld, validateEcologyConfiguration, defaultEcologyConfig, validateEcologyWorld, settleEcologyDay, removePopulation, validateEcologyPayload } from './ecology.mjs';
import { createRng } from './rng.mjs';
import { MAX_RESOURCE_DAYS } from './resource-ledger.mjs';

export const MARKET_RULES = 'b-market-v1';
export const MAX_TRANSIT_ORDERS = 1000;
const IDS = ['food', 'herbs'];
const CONFIG_FIELDS = ['version', 'ecology', 'products', 'transportCapacity', 'delayDays', 'routeRiskPermille', 'riskPremiumPermille', 'scarcityGainPermille'];
const PRODUCT_FIELDS = ['basePrice', 'minPrice', 'maxPrice', 'maxDailyChange', 'targetStock', 'maxOrder'];
const ORDER_FIELDS = ['shipmentId', 'resource', 'amount', 'unitPrice', 'cost', 'orderDay', 'dueDay'];
const ecologyPart = world => ({ resources: world.resources, resourceModel: world.resourceModel, ecologyModel: world.ecologyModel });
const units = () => ({ food: 0, herbs: 0 });
function safe(value) {
  requireCondition(value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), 'Market arithmetic overflow', 'LIMIT_EXCEEDED'); return Number(value);
}
function bounded(value, minimum=0, maximum=1000000) {
  integer(value, minimum); requireCondition(value<=maximum, 'Market parameter budget exceeded', 'LIMIT_EXCEEDED');
}
function validateProduct(product) {
  fields(product, PRODUCT_FIELDS);
  for(const key of PRODUCT_FIELDS) bounded(product[key], ['targetStock','maxOrder','maxDailyChange'].includes(key)?0:1);
  requireCondition(product.minPrice<=product.basePrice && product.basePrice<=product.maxPrice, 'Invalid price bounds');
}
const MARKET_VERSIONS = ['market-config-v1', 'market-config-v2'];
function validateConfig(config, buildWorld = true) {
  fields(config, CONFIG_FIELDS); requireCondition(MARKET_VERSIONS.includes(config.version), 'Unknown market configuration', 'UNSUPPORTED_VERSION');
  fields(config.products, IDS); for(const id of IDS) validateProduct(config.products[id]);
  bounded(config.transportCapacity); bounded(config.delayDays,1,30);
  for(const key of ['routeRiskPermille','riskPremiumPermille','scarcityGainPermille']) bounded(config[key],0,1000);
  return buildWorld ? createEcologyWorld(config.ecology) : validateEcologyConfiguration(config.ecology);
}

export function defaultMarketConfig() {
  return { version:'market-config-v1', ecology:defaultEcologyConfig(), products:{
    food:{basePrice:10,minPrice:5,maxPrice:30,maxDailyChange:2,targetStock:400,maxOrder:100},
    herbs:{basePrice:50,minPrice:25,maxPrice:150,maxDailyChange:10,targetStock:40,maxOrder:20},
  },transportCapacity:120,delayDays:2,routeRiskPermille:100,riskPremiumPermille:200,scarcityGainPermille:1000 };
}
export function shortageMarketConfig() {
  const config=defaultMarketConfig(), village=config.ecology.resources;
  village.resources.food.initial=100; village.resources.herbs.initial=0; village.resources.gold.initial=2000;
  village.settlement.injuredCount=2; return config;
}
// Parameters frozen during B4 seed-42 calibration; shared by B4 and subsequent C fixtures.
export function calibratedMarketConfig() {
  const config=defaultMarketConfig();
  config.ecology.deerBirthPermille=40;config.ecology.wolfBirthPermille=3;
  config.ecology.resources.resources.herbs.initial=8;
  config.ecology.resources.resources.herbs.production={numerator:1,denominator:8};
  config.products.herbs.targetStock=12;return config;
}
export function createMarketWorld(config=defaultMarketConfig()) {
  const ecology=validateConfig(config), copy=cloneData(config);
  return {...ecology, marketModel:{config:copy, configFingerprint:canonicalJson(copy), day:0, routeOpen:true,
    prices:Object.fromEntries(IDS.map(id=>[id,copy.products[id].basePrice])),
    inTransit:[],nextShipmentId:1,ordered:units(),arrived:units(),paid:0}};
}

export function validateMarketConfiguration(config = defaultMarketConfig()) {
  validateConfig(config, false);
  validateJsonData(cloneData(config));
}

export function quotePrice(stock,previous,product,config) {
  integer(stock); validateProduct(product); bounded(previous,product.minPrice,product.maxPrice);
  fields(config,CONFIG_FIELDS);
  requireCondition(MARKET_VERSIONS.includes(config.version),'Unknown price configuration','UNSUPPORTED_VERSION');
  for(const key of ['routeRiskPermille','riskPremiumPermille','scarcityGainPermille']) bounded(config[key],0,1000);
  let gap=(BigInt(product.targetStock)-BigInt(stock))*1000n/BigInt(Math.max(1,product.targetStock));
  gap=gap>1000n?1000n:gap< -1000n? -1000n:gap;
  const factor=1000n+gap*BigInt(config.scarcityGainPermille)/1000n+BigInt(config.routeRiskPermille)*BigInt(config.riskPremiumPermille)/1000n;
  const target=Math.max(product.minPrice,Math.min(product.maxPrice,safe(BigInt(product.basePrice)*factor/1000n)));
  const current=Math.max(previous-product.maxDailyChange,Math.min(previous+product.maxDailyChange,target));
  return {previous,gapPermille:Number(gap),target,current};
}

function validateOrder(order,config) {
  fields(order,ORDER_FIELDS); requireCondition(typeof order.shipmentId==='string' && /^shipment-[1-9]\d*$/.test(order.shipmentId) && order.shipmentId.length<=64, 'Invalid shipment ID');
  requireCondition(IDS.includes(order.resource), 'Invalid shipment commodity');
  integer(order.amount,1); integer(order.unitPrice,1); integer(order.cost,1); integer(order.orderDay,1); integer(order.dueDay,1);
  const product=config.products[order.resource];
  requireCondition(order.amount<=product.maxOrder && order.unitPrice>=product.minPrice && order.unitPrice<=product.maxPrice &&
    BigInt(order.cost)===BigInt(order.amount)*BigInt(order.unitPrice) && order.dueDay===order.orderDay+config.delayDays, 'Invalid shipment quantity/locked price/delay');
}
export function validateMarketWorld(world) {
  fields(world,['resources','resourceModel','ecologyModel','marketModel']);
  const m=world.marketModel;
  fields(m,['config','configFingerprint','day','routeOpen','prices','inTransit','nextShipmentId','ordered','arrived','paid']);
  denseArray(m.inTransit,MAX_TRANSIT_ORDERS); integer(m.paid); validateEcologyWorld(ecologyPart(world),m.paid); validateConfig(m.config,false);
  requireCondition(m.configFingerprint===canonicalJson(m.config) && canonicalJson(m.config.ecology)===canonicalJson(world.ecologyModel.config), 'Market/ecology configuration mismatch');
  integer(m.day); requireCondition(m.day===world.ecologyModel.day && m.day<=MAX_RESOURCE_DAYS,'Market day mismatch');
  requireCondition(typeof m.routeOpen==='boolean','Invalid trade route state'); integer(m.nextShipmentId,1);
  fields(m.prices,IDS); fields(m.ordered,IDS); fields(m.arrived,IDS);
  const quantities=units(), ids=new Set(); let used=0;
  for(const order of m.inTransit){
    validateOrder(order,m.config);
    const sequence=Number(order.shipmentId.slice(9)); integer(sequence,1);
    requireCondition(sequence<m.nextShipmentId && !ids.has(order.shipmentId) && order.orderDay<=m.day, 'Invalid shipment sequence/date'); ids.add(order.shipmentId);
    used=safe(BigInt(used)+BigInt(order.amount)); quantities[order.resource]=safe(BigInt(quantities[order.resource])+BigInt(order.amount));
  }
  requireCondition(used<=m.config.transportCapacity,'Transport capacity exceeded');
  for(const id of IDS){
    integer(m.ordered[id]); integer(m.arrived[id]); bounded(m.prices[id],m.config.products[id].minPrice,m.config.products[id].maxPrice);
    requireCondition(BigInt(m.ordered[id])-BigInt(m.arrived[id])===BigInt(quantities[id]),'Commodity transit ledger mismatch');
  }
  requireCondition(BigInt(world.resources.gold)+BigInt(m.paid)===BigInt(m.config.ecology.resources.resources.gold.initial),'Currency does not reconcile');
}

export function applyMarketCommand(input,command) {
  validateMarketWorld(input); fields(command,['type','payload']);
  if(command.type==='RemovePopulation'){
    const result=removePopulation(ecologyPart(input),command.payload,input.marketModel.paid);
    return {...result,world:{...result.world,marketModel:cloneData(input.marketModel)}};
  }
  requireCondition(command.type==='SetTradeRoute','Unknown market command'); fields(command.payload,['open']);
  requireCondition(typeof command.payload.open==='boolean','Route state must be boolean');
  const world=cloneData(input),before=world.marketModel.routeOpen; world.marketModel.routeOpen=command.payload.open;
  return {world,success:true,result:{before,open:command.payload.open}};
}
export function marketCommandFact(command,result) {
  return {type:command.type==='RemovePopulation'?'PopulationRemoved':'TradeRouteSet',sourceSystem:'command-engine',commandId:command.commandId,
    causationEventSeqs:[],entityIds:command.type==='RemovePopulation'?[result.species]:[],payload:result};
}
export const marketCauses=events=>events.filter(e=>['PopulationRemoved','TradeRouteSet'].includes(e.type)).map(e=>e.eventSeq);

export function settleMarketDay(input,sample,namedShares,reservedGold=0) {
  validateMarketWorld(input); const world=cloneData(input), m=world.marketModel, config=m.config, day=m.day+1;
  integer(reservedGold);requireCondition(reservedGold<=world.resources.gold,'Reserved wallets exceed total currency');
  requireCondition(day<=MAX_RESOURCE_DAYS,'Market day budget exceeded','LIMIT_EXCEEDED');
  const arrivals=[],pending=[],inflows=units(),goldOpening=world.resources.gold;
  for(const order of m.inTransit){
    if(m.routeOpen && order.dueDay<=day){
      arrivals.push(cloneData(order)); inflows[order.resource]=safe(BigInt(inflows[order.resource])+BigInt(order.amount));
      m.arrived[order.resource]=safe(BigInt(m.arrived[order.resource])+BigInt(order.amount));
    }else pending.push(order);
  }
  m.inTransit=pending;
  const ecology=settleEcologyDay(ecologyPart(world),sample,{currencySpent:m.paid,inflows},namedShares);
  world.resources=ecology.world.resources;world.resourceModel=ecology.world.resourceModel;world.ecologyModel=ecology.world.ecologyModel;
  const prices={},orders=[]; let used=m.inTransit.reduce((total,o)=>safe(BigInt(total)+BigInt(o.amount)),0),goldSpent=0;
  for(const id of IDS){
    const product=config.products[id], quote=quotePrice(world.resources[id],m.prices[id],product,config); prices[id]=quote;m.prices[id]=quote.current;
    if(!m.routeOpen)continue;
    const transit=m.inTransit.filter(o=>o.resource===id).reduce((total,o)=>safe(BigInt(total)+BigInt(o.amount)),0);
    const deficit=BigInt(product.targetStock)-BigInt(world.resources[id])-BigInt(transit);
    const need=deficit>0n?safe(deficit):0;
    const amount=Math.min(need,product.maxOrder,config.transportCapacity-used,safe((BigInt(world.resources.gold)-BigInt(reservedGold))/BigInt(quote.current)));
    if(amount===0)continue;
    requireCondition(m.inTransit.length<MAX_TRANSIT_ORDERS && m.nextShipmentId<Number.MAX_SAFE_INTEGER,'Shipment budget/counter exceeded','LIMIT_EXCEEDED');
    const cost=safe(BigInt(amount)*BigInt(quote.current)),order={shipmentId:'shipment-'+m.nextShipmentId++,resource:id,amount,unitPrice:quote.current,cost,orderDay:day,dueDay:day+config.delayDays};
    world.resources.gold-=cost; goldSpent=safe(BigInt(goldSpent)+BigInt(cost));m.paid=safe(BigInt(m.paid)+BigInt(cost));
    world.resourceModel.ledger.gold.consumption=safe(BigInt(world.resourceModel.ledger.gold.consumption)+BigInt(cost));
    m.ordered[id]=safe(BigInt(m.ordered[id])+BigInt(amount));used+=amount;m.inTransit.push(order);orders.push(cloneData(order));
  }
  m.day=day;validateMarketWorld(world);
  return {world,payload:{day,routeOpen:m.routeOpen,arrivals,ecology:ecology.payload,prices,orders,goldOpening,goldSpent,goldClosing:world.resources.gold,inTransitUnits:used}};
}

export function validateMarketPayload(payload) {
  fields(payload,['day','routeOpen','arrivals','ecology','prices','orders','goldOpening','goldSpent','goldClosing','inTransitUnits']);
  integer(payload.day,1);requireCondition(typeof payload.routeOpen==='boolean','Invalid route fact');
  denseArray(payload.arrivals,MAX_TRANSIT_ORDERS);denseArray(payload.orders,2);fields(payload.prices,IDS);validateEcologyPayload(payload.ecology);
  for(const order of [...payload.arrivals,...payload.orders]) {
    fields(order,ORDER_FIELDS);
    requireCondition(typeof order.shipmentId==='string' && /^shipment-[1-9]\d*$/.test(order.shipmentId) && IDS.includes(order.resource),'Invalid trade fact identity');
    for(const key of ['amount','unitPrice','cost','orderDay','dueDay'])integer(order[key],1);
    requireCondition(BigInt(order.cost)===BigInt(order.amount)*BigInt(order.unitPrice) && order.dueDay>order.orderDay,'Invalid trade fact cost/delay');
  }
  requireCondition(payload.day===payload.ecology.day,'Market/ecology day mismatch');
  for(const key of ['goldOpening','goldSpent','goldClosing','inTransitUnits'])integer(payload[key]);
  requireCondition(BigInt(payload.goldOpening)-BigInt(payload.goldSpent)===BigInt(payload.goldClosing),'Daily currency ledger mismatch');
  for(const id of IDS){
    const quote=payload.prices[id];fields(quote,['previous','gapPermille','target','current']);
    for(const key of ['previous','target','current'])integer(quote[key],1);
    requireCondition(Number.isSafeInteger(quote.gapPermille) && Math.abs(quote.gapPermille)<=1000,'Invalid price gap');
  }
}

export function validateMarketHistory(snapshot,events) {
  validateMarketWorld(snapshot.world);denseArray(events,MAX_RESOURCE_DAYS+100000);
  const day=snapshot.world.marketModel.day,rng=createRng(snapshot.rng.seed);
  let expected=createMarketWorld(snapshot.world.marketModel.config),eventIndex=0;
  const receipts=Object.entries(snapshot.commandReceipts).map(([commandId,receipt])=>({commandId,...receipt}));
  const operations=[...receipts.map(r=>({tick:r.input.targetTick,receipt:r})),...Array.from({length:day},(_,i)=>({tick:(i+1)*144}))];
  operations.sort((a,b)=>a.tick-b.tick || (a.receipt?0:1)-(b.receipt?0:1) || (a.receipt?.inputSeq??0)-(b.receipt?.inputSeq??0));
  const expectFact=(fact,tick)=>{
    const event=events[eventIndex++];requireCondition(event,'Missing market fact');const {eventSeq,schemaVersion,...actual}=event;
    requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'Market history disagrees with commands/rules');
  };
  for(const op of operations){
    if(op.receipt){
      const r=op.receipt,result=applyMarketCommand(expected,{type:r.input.type,payload:r.input.payload});expected=result.world;
      requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'Market command outcome mismatch');
      if(result.success)expectFact(marketCommandFact({commandId:r.commandId,type:r.input.type},result.result),op.tick);
    }else{
      const result=settleMarketDay(expected,rng.next());expected=result.world;
      expectFact({type:'EconomyDaySettled',sourceSystem:'market',commandId:null,causationEventSeqs:marketCauses(events.slice(0,eventIndex)),entityIds:[],payload:result.payload},op.tick);
    }
  }
  requireCondition(eventIndex===events.length && canonicalJson(expected)===canonicalJson(snapshot.world),'Market world/history mismatch');
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Market RNG history mismatch');
}
