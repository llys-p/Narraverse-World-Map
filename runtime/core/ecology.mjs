import { cloneData, fields, integer, denseArray, canonicalJson, validateJsonData, requireCondition } from './data-contract.mjs';
import { createResourceWorld, validateResourceConfiguration, validateResourceWorld, defaultResourceConfig, settleResourceDay, validateResourcePayload, MAX_RESOURCE_DAYS } from './resource-ledger.mjs';
import { createRng } from './rng.mjs';

export const ECOLOGY_RULES = 'b-ecology-v1';
export const MAX_POPULATION = 1000000;
const PARAMETERS = ['deerCapacity', 'deerBirthPermille', 'deerDeathPermille', 'wolfBirthPermille', 'wolfDeathPermille',
  'wolfStarvationPermille', 'wolfDemandDenominator', 'maxHunters', 'huntersPerKill', 'foodPerDeer',
  'foodReserveDays', 'farmLossPerHungryWolf', 'injuryBasePermille', 'injuryPressurePermille'];
const ACCOUNTS = ['births', 'naturalDeaths', 'starvationDeaths', 'predation', 'hunted', 'removed'];
// ecology-config-v2 books real battle deaths separately; no other species gains this account.
const WOLF_ACCOUNTS = [...ACCOUNTS, 'battleDeaths'];
const REMAINDERS = ['deerBirth', 'deerDeath', 'wolfDemand', 'wolfBirth', 'wolfDeath', 'wolfStarvation'];
const PAYLOAD_FIELDS = ['day', 'deer', 'wolves', 'predationDemand', 'unmetPredation', 'pressurePermille', 'hungryWolves',
  'farmLossRequested', 'farmLoss', 'hunters', 'huntTarget', 'foodWorkers', 'herbWorkers', 'injuredOpening',
  'newInjuries', 'healed', 'injuredClosing', 'sample', 'resources'];
const OWNERSHIP_FIELDS = ['reservedOpening', 'reservedClosing', 'battleDeathsOpening', 'battleDeathsClosing',
  'totalLivingOpening', 'totalLivingClosing'];
const isV2 = config => config.version === 'ecology-config-v2';
const accountsOf = (version, id) => (id === 'wolves' && version === 'ecology-config-v2' ? WOLF_ACCOUNTS : ACCOUNTS);
const populationRow = opening => ({ opening, births: 0, naturalDeaths: 0, starvationDeaths: 0, predation: 0, hunted: 0, closing: opening });
const resourcePart = world => ({ resources: world.resources, resourceModel: world.resourceModel });
function safe(value) {
  requireCondition(value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), 'Ecology arithmetic overflow', 'LIMIT_EXCEEDED'); return Number(value);
}
const mul = (a,b) => safe(BigInt(a)*BigInt(b));
const ceil = (numerator, denominator) => safe((BigInt(numerator)+BigInt(denominator)-1n)/BigInt(denominator));

export function defaultEcologyConfig() {
  return { version: 'ecology-config-v1', resources: defaultResourceConfig(), deerCapacity: 240,
    deerBirthPermille: 20, deerDeathPermille: 2, wolfBirthPermille: 5, wolfDeathPermille: 3,
    wolfStarvationPermille: 30, wolfDemandDenominator: 10, maxHunters: 8, huntersPerKill: 4,
    foodPerDeer: 20, foodReserveDays: 5, farmLossPerHungryWolf: 4, injuryBasePermille: 100, injuryPressurePermille: 400 };
}

function validateConfig(config, buildWorld = true) {
  fields(config, ['version','resources',...PARAMETERS]);
  requireCondition(['ecology-config-v1','ecology-config-v2'].includes(config.version), 'Unknown ecology configuration', 'UNSUPPORTED_VERSION');
  for (const key of PARAMETERS) {
    integer(config[key], ['deerCapacity','wolfDemandDenominator','huntersPerKill'].includes(key) ? 1 : 0);
    requireCondition(config[key] <= MAX_POPULATION, 'Ecology parameter budget exceeded', 'LIMIT_EXCEEDED');
    if (key.includes('Permille')) requireCondition(config[key] <= 1000, 'Invalid ecological rate');
  }
  requireCondition(config.injuryBasePermille + config.injuryPressurePermille <= 1000, 'Injury probability exceeds one');
  const resources = buildWorld ? createResourceWorld(config.resources) : validateResourceConfiguration(config.resources), village=config.resources.settlement;
  requireCondition(village.humanCount<=MAX_POPULATION && config.resources.populations.deer<=config.deerCapacity &&
    config.resources.populations.wolves<=MAX_POPULATION, 'Population/capacity budget exceeded');
  requireCondition(config.resources.resources.herbs.consumption.numerator===1 &&
    config.resources.resources.herbs.consumption.denominator===1, 'B2 treatment requires one unit per injured person');
  return resources;
}

export function createEcologyWorld(config = defaultEcologyConfig()) {
  const resources=validateConfig(config), copy=cloneData(config);
  return { ...resources, ecologyModel: { config:copy, configFingerprint:canonicalJson(copy),day:0,
    populations:cloneData(copy.resources.populations), injuredCount:copy.resources.settlement.injuredCount,
    remainders:Object.fromEntries(REMAINDERS.map(key=>[key,0])),
    ledger:Object.fromEntries(['deer','wolves'].map(id=>[id,Object.fromEntries(accountsOf(copy.version,id).map(key=>[key,0]))])),
    // v1 keeps its exact old shape; only v2 owns an explicit held-wolf reservation.
    ...(isV2(copy)?{reservedWolves:0}:{}) } };
}

export function validateEcologyConfiguration(config = defaultEcologyConfig()) {
  validateConfig(config, false);
  validateJsonData(cloneData(config));
}

export function validateEcologyWorld(world, currencySpent = 0) {
  fields(world,['resources','resourceModel','ecologyModel']); validateResourceWorld(resourcePart(world), currencySpent);
  const m=world.ecologyModel,v2=isV2(m.config);
  fields(m,['config','configFingerprint','day','populations','injuredCount','remainders','ledger',...(v2?['reservedWolves']:[])]);
  validateConfig(m.config,false);requireCondition(m.configFingerprint===canonicalJson(m.config) &&
    canonicalJson(m.config.resources)===canonicalJson(world.resourceModel.config),'Ecology/resource configuration mismatch');
  integer(m.day);requireCondition(m.day===world.resourceModel.day && m.day<=MAX_RESOURCE_DAYS,'Ecology day mismatch');
  integer(m.injuredCount);requireCondition(m.injuredCount<=m.config.resources.settlement.humanCount,'Invalid injury count');
  fields(m.populations,['deer','wolves']);fields(m.ledger,['deer','wolves']);fields(m.remainders,REMAINDERS);
  if(v2){integer(m.reservedWolves);requireCondition(m.reservedWolves<=1,'Wolf reservation is only ever 0 or 1');
    requireCondition(m.reservedWolves<=m.populations.wolves,'Reserved wolves exceed the living population');}
  for(const id of ['deer','wolves']){
    integer(m.populations[id]);requireCondition(m.populations[id]<=MAX_POPULATION,'Population budget exceeded','LIMIT_EXCEEDED');
    if(id==='deer')requireCondition(m.populations[id]<=m.config.deerCapacity,'Deer exceed environmental capacity');
    const accounts=accountsOf(m.config.version,id);fields(m.ledger[id],accounts);for(const value of Object.values(m.ledger[id]))integer(value);
    const account=m.ledger[id];
    requireCondition(BigInt(m.populations[id])===BigInt(m.config.resources.populations[id])+BigInt(account.births)
      -BigInt(account.naturalDeaths)-BigInt(account.starvationDeaths)-BigInt(account.predation)-BigInt(account.hunted)-BigInt(account.removed)
      -(id==='wolves'&&v2?BigInt(account.battleDeaths):0n),'Population ledger mismatch');
    requireCondition(id==='deer' ? account.starvationDeaths===0 : account.predation===0,'Invalid species ledger');
  }
  const denominators={deerBirth:mul(m.config.deerCapacity,1000),deerDeath:1000,wolfDemand:m.config.wolfDemandDenominator,
    wolfBirth:1000000,wolfDeath:1000,wolfStarvation:1000000};
  for(const key of REMAINDERS){integer(m.remainders[key]);requireCondition(m.remainders[key]<denominators[key],'Invalid ecology remainder');}
}

export function removePopulation(input,payload,currencySpent=0) {
  validateEcologyWorld(input,currencySpent);fields(payload,['species','amount']);integer(payload.amount,1);
  requireCondition(['deer','wolves'].includes(payload.species),'Unknown population species');
  const world=cloneData(input),m=world.ecologyModel,before=m.populations[payload.species];
  // A held wolf is not available to an external removal; v1 has no reservation and keeps its exact old path.
  const available=before-(isV2(m.config)&&payload.species==='wolves'?m.reservedWolves:0);
  if(available<payload.amount)return {world,success:false,result:{code:'RULE_REJECTED'}};
  const after=before-payload.amount;m.populations[payload.species]=after;
  m.ledger[payload.species].removed=safe(BigInt(m.ledger[payload.species].removed)+BigInt(payload.amount));
  validateEcologyWorld(world,currencySpent);return {world,success:true,result:{...cloneData(payload),before,after}};
}

export function settleEcologyDay(input,sample,trade,namedShares) {
  if(trade!==undefined){fields(trade,['currencySpent','inflows']);integer(trade.currencySpent);
    fields(trade.inflows,['food','herbs']);integer(trade.inflows.food);integer(trade.inflows.herbs);}
  const currencySpent=trade?.currencySpent??0;
  validateEcologyWorld(input,currencySpent);requireCondition(typeof sample==='number' && sample>=0 && sample<1,'Invalid ecological random sample');
  const world=cloneData(input),m=world.ecologyModel,c=m.config,v=c.resources.settlement;
  if(namedShares!==undefined){
    fields(namedShares,Object.hasOwn(namedShares,'managedFood')?['registered','alive','injured','managedFood']:['registered','alive','injured']);for(const value of Object.values(namedShares))integer(value);
    requireCondition(namedShares.registered<=v.humanCount && namedShares.alive<=namedShares.registered && namedShares.injured<=namedShares.alive,
      'Invalid named population shares');
    requireCondition((namedShares.managedFood??0)<=namedShares.alive,'Managed consumption exceeds living named residents');
    requireCondition(m.injuredCount<=v.humanCount-namedShares.registered,'Aggregate injuries overlap named population');
  }
  const reserved=namedShares?.registered??0, namedInjured=namedShares?.injured??0;
  const totalAlive=v.humanCount-reserved+(namedShares?.alive??0);
  requireCondition(m.day<MAX_RESOURCE_DAYS,'Ecology day budget exceeded','LIMIT_EXCEEDED');
  const fraction=(key,numerator,denominator)=>{
    const total=BigInt(numerator)+BigInt(m.remainders[key]),den=BigInt(denominator);
    m.remainders[key]=safe(total%den);return safe(total/den);
  };
  const v2=isV2(m.config),reservedOpening=v2?m.reservedWolves:0,battleDeathsOpening=v2?m.ledger.wolves.battleDeaths:0;
  const totalLivingOpening=m.populations.wolves,availableOpening=totalLivingOpening-reservedOpening;
  const deer=populationRow(m.populations.deer),wolves=populationRow(availableOpening);
  // Empty populations have no reproductive remainder capable of reviving a species.
  deer.births=Math.min(c.deerCapacity-deer.opening,fraction('deerBirth',BigInt(deer.opening)*BigInt(c.deerBirthPermille)*BigInt(c.deerCapacity-deer.opening),mul(c.deerCapacity,1000)));
  let d=safe(BigInt(deer.opening)+BigInt(deer.births));
  deer.naturalDeaths=Math.min(d,fraction('deerDeath',mul(d,c.deerDeathPermille),1000));d-=deer.naturalDeaths;
  const predationDemand=fraction('wolfDemand',wolves.opening,c.wolfDemandDenominator);
  deer.predation=Math.min(d,predationDemand);d-=deer.predation;
  const unmetPredation=predationDemand-deer.predation,pressurePermille=predationDemand===0?0:safe(BigInt(unmetPredation)*1000n/BigInt(predationDemand));
  wolves.births=fraction('wolfBirth',BigInt(wolves.opening)*BigInt(c.wolfBirthPermille)*BigInt(1000-pressurePermille),1000000);
  let w=safe(BigInt(wolves.opening)+BigInt(wolves.births));
  wolves.naturalDeaths=Math.min(w,fraction('wolfDeath',mul(w,c.wolfDeathPermille),1000));w-=wolves.naturalDeaths;
  wolves.starvationDeaths=Math.min(w,fraction('wolfStarvation',BigInt(wolves.opening)*BigInt(c.wolfStarvationPermille)*BigInt(pressurePermille),1000000));w-=wolves.starvationDeaths;
  const injuredOpening=m.injuredCount,healthy=v.humanCount-reserved-injuredOpening;
  const foodWorkers=Math.min(v.foodWorkers,healthy),herbWorkers=Math.min(v.herbWorkers,healthy-foodWorkers);
  const lowFood=BigInt(world.resources.food)+BigInt(trade?.inflows.food??0)<BigInt(totalAlive)*BigInt(c.foodReserveDays);
  const wantedHunters=lowFood?c.maxHunters:ceil(mul(c.maxHunters,pressurePermille),1000);
  const hunters=Math.min(wantedHunters,healthy-foodWorkers-herbWorkers),huntTarget=hunters===0?'none':lowFood?'deer':'wolves';
  const kills=Math.floor(hunters/c.huntersPerKill);
  if(huntTarget==='deer'){deer.hunted=Math.min(d,kills);d-=deer.hunted;}
  if(huntTarget==='wolves'){wolves.hunted=Math.min(w,kills);w-=wolves.hunted;}
  const risk=c.injuryBasePermille+Math.floor(mul(pressurePermille,c.injuryPressurePermille)/1000);
  const expected=mul(hunters,risk),newInjuries=Math.min(hunters,Math.floor(expected/1000)+(sample<(expected%1000)/1000?1:0));
  const hungryWolves=Math.min(w,ceil(mul(wolves.opening,pressurePermille),1000)),farmLossRequested=mul(hungryWolves,c.farmLossPerHungryWolf);
  const foodBonus=mul(deer.hunted,c.foodPerDeer);
  const foodSpec=c.resources.resources.food;
  const farmProduction=safe((BigInt(foodWorkers)*BigInt(foodSpec.production.numerator)+BigInt(world.resourceModel.remainders.food.production))/BigInt(foodSpec.production.denominator));
  const dailyInflow=c.resources.flows.filter(f=>f.day===m.day+1 && f.resource==='food' && f.direction==='in').reduce((sum,f)=>sum+BigInt(f.amount),0n);
  const farmLoss=Math.min(farmLossRequested,safe(BigInt(world.resources.food)+BigInt(farmProduction)+BigInt(foodBonus)+dailyInflow+BigInt(trade?.inflows.food??0)));
  const servicedPopulation=totalAlive-(namedShares?.managedFood??0);
  const result=settleResourceDay(resourcePart(world),{settlement:{humanCount:servicedPopulation,foodWorkers,herbWorkers,injuredCount:injuredOpening+newInjuries+namedInjured},foodBonus,foodDamage:farmLossRequested},trade,v.humanCount-servicedPopulation);
  const healed=Math.min(injuredOpening+newInjuries,result.payload.entries[1].consumption);
  world.resources=result.world.resources;world.resourceModel=result.world.resourceModel;
  m.day++;m.injuredCount=injuredOpening+newInjuries-healed;deer.closing=d;wolves.closing=w;
  // A daily settlement never wins a fight: the reservation and the battle-death account are carried
  // unchanged across the day, so the six ownership numbers reconcile against the available pool.
  const reservedClosing=reservedOpening,battleDeathsClosing=m.ledger.wolves.battleDeaths,totalLivingClosing=w+reservedClosing;
  m.populations={deer:d,wolves:totalLivingClosing};
  for(const [id,row] of [['deer',deer],['wolves',wolves]]) for(const key of ACCOUNTS.filter(k=>k!=='removed'))
    m.ledger[id][key]=safe(BigInt(m.ledger[id][key])+BigInt(row[key]));  validateEcologyWorld(world,currencySpent);
  return {world,payload:{day:m.day,deer,wolves,predationDemand,unmetPredation,pressurePermille,hungryWolves,farmLossRequested,farmLoss,
    hunters,huntTarget,foodWorkers,herbWorkers,injuredOpening,newInjuries,healed,injuredClosing:m.injuredCount,sample,resources:result.payload,
    ...(v2?{encounterOwnership:{reservedOpening,reservedClosing,battleDeathsOpening,battleDeathsClosing,totalLivingOpening,totalLivingClosing}}:{}),
    ...(namedShares!==undefined?{namedShares:{...cloneData(namedShares),healed:result.payload.entries[1].consumption-healed}}:{})}};
}

export function validateEcologyPayload(payload) {
  const ownership=Object.hasOwn(payload,'encounterOwnership'),named=Object.hasOwn(payload,'namedShares');
  fields(payload,[...PAYLOAD_FIELDS,...(ownership?['encounterOwnership']:[]),...(named?['namedShares']:[])]);
  if(ownership){
    fields(payload.encounterOwnership,OWNERSHIP_FIELDS);
    for(const value of Object.values(payload.encounterOwnership))integer(value);
    const o=payload.encounterOwnership;
    requireCondition(o.reservedOpening===o.reservedClosing && o.battleDeathsOpening===o.battleDeathsClosing &&
      o.totalLivingOpening===payload.wolves.opening+o.reservedOpening &&
      o.totalLivingClosing===payload.wolves.closing+o.reservedClosing,'Invalid encounter ownership settlement');
  }integer(payload.day,1);
  if(Object.hasOwn(payload,'namedShares')){
    fields(payload.namedShares,Object.hasOwn(payload.namedShares,'managedFood')?['registered','alive','injured','healed','managedFood']:['registered','alive','injured','healed']);for(const value of Object.values(payload.namedShares))integer(value);
    requireCondition(payload.namedShares.alive<=payload.namedShares.registered && payload.namedShares.injured<=payload.namedShares.alive &&
      payload.namedShares.healed<=payload.namedShares.injured,'Invalid named population settlement');
    requireCondition((payload.namedShares.managedFood??0)<=payload.namedShares.alive,'Invalid autonomous food ownership');
  }
  for(const id of ['deer','wolves']){fields(payload[id],['opening',...ACCOUNTS.filter(k=>k!=='removed'),'closing']);for(const value of Object.values(payload[id]))integer(value);}
  for(const key of PAYLOAD_FIELDS.filter(k=>!['deer','wolves','sample','resources','huntTarget'].includes(k)))integer(payload[key]);
  requireCondition(['none','deer','wolves'].includes(payload.huntTarget) && typeof payload.sample==='number' && payload.sample>=0 && payload.sample<1,'Invalid hunt/sample');
  validateResourcePayload(payload.resources);
  requireCondition(payload.pressurePermille<=1000 && payload.resources.day===payload.day,'Invalid pressure/resource day');
}

export function ecologyCauses(events) {
  // One explicit intervention lineage; no links to future/unrelated system facts.
  return events.filter(event=>event.type==='PopulationRemoved').map(event=>event.eventSeq);
}

export function validateEcologyHistory(snapshot,events) {
  validateEcologyWorld(snapshot.world);denseArray(events,MAX_RESOURCE_DAYS+100000);
  const day=snapshot.world.ecologyModel.day,rng=createRng(snapshot.rng.seed);
  let expected=createEcologyWorld(snapshot.world.ecologyModel.config),eventIndex=0;
  const receipts=Object.entries(snapshot.commandReceipts).map(([commandId,receipt])=>({commandId,...receipt}));
  const operations=[...receipts.map(r=>({tick:r.input.targetTick,receipt:r})),
    ...Array.from({length:day},(_,i)=>({tick:(i+1)*144,day:i+1}))];
  operations.sort((a,b)=>a.tick-b.tick || (a.receipt?0:1)-(b.receipt?0:1) || (a.receipt?.inputSeq??0)-(b.receipt?.inputSeq??0));
  const expectFact=(fact,tick)=>{
    const event=events[eventIndex++];requireCondition(event,'Missing ecological fact');
    const {eventSeq,schemaVersion,...actual}=event;
    requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'Ecological history disagrees with commands/rules');
  };
  for(const op of operations){
    if(op.receipt){
      const r=op.receipt;requireCondition(r.input.type==='RemovePopulation','B2 only accepts population intervention');
      const result=removePopulation(expected,r.input.payload);expected=result.world;
      requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'Ecological command outcome mismatch');
      if(result.success)expectFact({type:'PopulationRemoved',sourceSystem:'command-engine',commandId:r.commandId,
        causationEventSeqs:[],entityIds:[r.input.payload.species],payload:result.result},op.tick);
    }else{
      const result=settleEcologyDay(expected,rng.next());expected=result.world;
      expectFact({type:'EcologyDaySettled',sourceSystem:'ecology',commandId:null,
        causationEventSeqs:ecologyCauses(events.slice(0,eventIndex)),entityIds:[],payload:result.payload},op.tick);
    }
  }
  requireCondition(eventIndex===events.length && canonicalJson(expected)===canonicalJson(snapshot.world),'Ecological world/history mismatch');
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Ecological RNG history mismatch');
}
