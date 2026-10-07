import { cloneData,fields,integer,denseArray,canonicalJson,requireCondition,identifier } from './data-contract.mjs';
import { createMarketWorld,validateMarketWorld,settleMarketDay,applyMarketCommand,marketCommandFact,marketCauses,validateMarketPayload,calibratedMarketConfig } from './market.mjs';
import { createRng } from './rng.mjs';
import { MAX_RESOURCE_DAYS } from './resource-ledger.mjs';

export const ACTOR_RULES='c-actors-v1';
export const MAX_PERSISTENT_ACTORS=64;
const ACTOR_FIELDS=['actorId','name','occupation','location','simulationLevel','alive','health','hunger','fatigue','needs','lastNeedsTick','deathTick'];
const INITIAL_FIELDS=['name','occupation','health','hunger','fatigue'];
const marketPart=w=>({resources:w.resources,resourceModel:w.resourceModel,ecologyModel:w.ecologyModel,marketModel:w.marketModel});
const needsOf=a=>a.alive?{food:a.hunger,healing:1000-a.health,rest:a.fatigue}:{food:0,healing:0,rest:0};
function value1000(value){integer(value);requireCondition(value<=1000,'Actor state exceeds 1000');}
function safeAdd(a,b){requireCondition(a<=Number.MAX_SAFE_INTEGER-b,'Actor counter overflow','LIMIT_EXCEEDED');return a+b;}

export function defaultActorConfig(market=calibratedMarketConfig()) {
  return {version:'actor-config-v1',market:cloneData(market),initialActors:[
    {name:'村长',occupation:'chief',health:1000,hunger:0,fatigue:0},
    {name:'猎人',occupation:'hunter',health:1000,hunger:0,fatigue:0},
    {name:'商人',occupation:'merchant',health:1000,hunger:0,fatigue:0},
  ]};
}

function validateConfig(config){
  fields(config,['version','market','initialActors']);requireCondition(config.version==='actor-config-v1','Unknown Actor configuration','UNSUPPORTED_VERSION');
  denseArray(config.initialActors,MAX_PERSISTENT_ACTORS);
  for(const actor of config.initialActors){fields(actor,INITIAL_FIELDS);identifier(actor.name);
    requireCondition(['chief','hunter','merchant'].includes(actor.occupation),'Unknown Actor occupation');
    for(const key of ['health','hunger','fatigue'])value1000(actor[key]);}
  const world=createMarketWorld(config.market),settlement=config.market.ecology.resources.settlement;
  requireCondition(config.initialActors.length<=settlement.humanCount && settlement.injuredCount<=settlement.humanCount-config.initialActors.length,
    'Named population overlaps aggregate injury shares');
  const food=config.market.ecology.resources.resources.food.consumption;
  requireCondition(food.numerator===1 && food.denominator===1,'C1 requires one ration per living resident');
  return world;
}

export function createActorWorld(config){
  const world=validateConfig(config),copy=cloneData(config);
  const actors=copy.initialActors.map((initial,index)=>{
    const actor={actorId:'actor-'+(index+1),...initial,location:'village',simulationLevel:'L1',alive:initial.health>0,
      needs:{},lastNeedsTick:0,deathTick:initial.health===0?0:null};actor.needs=needsOf(actor);return actor;
  });
  return {...world,actorModel:{config:copy,configFingerprint:canonicalJson(copy),day:0,actors,
    ledger:{foodConsumed:0,herbsConsumed:0,deaths:0}}};
}

function sharesOf(world){
  const actors=world.actorModel.actors,registered=actors.length,namedAlive=actors.filter(a=>a.alive).length;
  const unnamedAlive=world.actorModel.config.market.ecology.resources.settlement.humanCount-registered;
  return {registered,namedAlive,unnamedAlive,totalAlive:unnamedAlive+namedAlive,namedInjured:actors.filter(a=>a.alive && a.health<1000).length,dead:registered-namedAlive};
}
export function populationShares(world){validateActorWorld(world);return sharesOf(world);}
export function validateActorWorld(world){
  fields(world,['resources','resourceModel','ecologyModel','marketModel','actorModel']);
  const m=world.actorModel;fields(m,['config','configFingerprint','day','actors','ledger']);
  denseArray(m.actors,MAX_PERSISTENT_ACTORS);validateConfig(m.config);validateMarketWorld(marketPart(world));
  requireCondition(m.configFingerprint===canonicalJson(m.config) && canonicalJson(m.config.market)===canonicalJson(world.marketModel.config),'Actor/market configuration mismatch');
  integer(m.day);requireCondition(m.day===world.marketModel.day && m.day<=MAX_RESOURCE_DAYS,'Actor day mismatch');
  requireCondition(m.actors.length===m.config.initialActors.length,'Actor registry count mismatch');
  let dead=0;
  for(const [index,actor] of m.actors.entries()){
    fields(actor,ACTOR_FIELDS);const initial=m.config.initialActors[index];
    requireCondition(actor.actorId==='actor-'+(index+1) && actor.name===initial.name && actor.occupation===initial.occupation &&
      actor.location==='village' && actor.simulationLevel==='L1','Actor identity changed');
    for(const key of ['health','hunger','fatigue'])value1000(actor[key]);
    requireCondition(typeof actor.alive==='boolean' && actor.alive===(actor.health>0),'Actor life/health mismatch');
    integer(actor.lastNeedsTick);
    if(actor.alive)requireCondition(actor.deathTick===null && actor.lastNeedsTick===m.day*144,'Living Actor tick/death mismatch');
    else {integer(actor.deathTick);requireCondition(actor.deathTick<=m.day*144 && actor.deathTick%144===0 && actor.lastNeedsTick===actor.deathTick,'Invalid Actor tombstone');dead++;}
    fields(actor.needs,['food','healing','rest']);requireCondition(canonicalJson(actor.needs)===canonicalJson(needsOf(actor)),'Actor needs disagree with actual state');
  }
  fields(m.ledger,['foodConsumed','herbsConsumed','deaths']);for(const value of Object.values(m.ledger))integer(value);
  requireCondition(m.ledger.deaths===dead-m.config.initialActors.filter(a=>a.health===0).length,'Actor death ledger mismatch');
  requireCondition(m.ledger.foodConsumed<=world.resourceModel.ledger.food.consumption && m.ledger.herbsConsumed<=world.resourceModel.ledger.herbs.consumption,
    'Named consumption exceeds actual world consumption');
  requireCondition(world.ecologyModel.injuredCount<=sharesOf(world).unnamedAlive,'Aggregate injuries overlap named residents');
}

export function settleActorDay(input,sample){
  validateActorWorld(input);const world=cloneData(input),m=world.actorModel,populationOpening=sharesOf(world);
  const market=settleMarketDay(marketPart(world),sample,{registered:populationOpening.registered,alive:populationOpening.namedAlive,injured:populationOpening.namedInjured});
  const foodConsumed=market.payload.ecology.resources.entries[0].consumption;
  const unnamedFood=Math.min(foodConsumed,populationOpening.unnamedAlive),unnamedHerbs=market.payload.ecology.healed;
  let remainingFood=foodConsumed-unnamedFood,remainingHerbs=market.payload.ecology.namedShares.healed;
  const rows=[];
  for(const actor of m.actors){
    const opening={health:actor.health,hunger:actor.hunger,fatigue:actor.fatigue,alive:actor.alive};
    let food=0,herbs=0,hungerDamage=0,restReduction=0,died=false;
    if(actor.alive){
      if(remainingFood>0){food=1;remainingFood--;}
      if(actor.health<1000 && remainingHerbs>0){herbs=1;remainingHerbs--;actor.health=Math.min(1000,actor.health+100);}
      actor.hunger=Math.min(1000,actor.hunger+100);if(food)actor.hunger=Math.max(0,actor.hunger-200);
      restReduction=Math.min(200,actor.fatigue);actor.fatigue-=restReduction;
      if(!food && actor.hunger>=500){hungerDamage=Math.min(50,actor.health);actor.health-=hungerDamage;}
      actor.lastNeedsTick=(m.day+1)*144;
      if(actor.health===0){actor.alive=false;actor.deathTick=actor.lastNeedsTick;died=true;m.ledger.deaths++;}
      actor.needs=needsOf(actor);
      m.ledger.foodConsumed=safeAdd(m.ledger.foodConsumed,food);m.ledger.herbsConsumed=safeAdd(m.ledger.herbsConsumed,herbs);
    }
    rows.push({actorId:actor.actorId,opening,food,herbs,hungerDamage,restReduction,died,closing:cloneData(actor)});
  }
  requireCondition(remainingFood===0 && remainingHerbs===0,'Actor allocation left unowned resource consumption');
  Object.assign(world,market.world);m.day++;validateActorWorld(world);
  return {world,payload:{day:m.day,market:market.payload,populationOpening,populationClosing:sharesOf(world),unnamedFood,unnamedHerbs,rows}};
}

export function applyActorCommand(input,command){
  validateActorWorld(input);const result=applyMarketCommand(marketPart(input),command);
  return {...result,world:{...result.world,actorModel:cloneData(input.actorModel)}};
}
export function validateActorPayload(payload){
  fields(payload,['day','market','populationOpening','populationClosing','unnamedFood','unnamedHerbs','rows']);integer(payload.day,1);
  validateMarketPayload(payload.market);requireCondition(payload.market.day===payload.day,'Actor/market fact day mismatch');
  for(const key of ['populationOpening','populationClosing']){
    fields(payload[key],['registered','namedAlive','unnamedAlive','totalAlive','namedInjured','dead']);
    for(const value of Object.values(payload[key]))integer(value);
    requireCondition(payload[key].registered===payload[key].namedAlive+payload[key].dead && payload[key].totalAlive===payload[key].unnamedAlive+payload[key].namedAlive,
      'Population share conservation mismatch');
  }
  integer(payload.unnamedFood);integer(payload.unnamedHerbs);denseArray(payload.rows,MAX_PERSISTENT_ACTORS);
  let food=payload.unnamedFood,herbs=payload.unnamedHerbs;
  for(const row of payload.rows){
    fields(row,['actorId','opening','food','herbs','hungerDamage','restReduction','died','closing']);identifier(row.actorId);
    fields(row.opening,['health','hunger','fatigue','alive']);fields(row.closing,ACTOR_FIELDS);
    integer(row.food);integer(row.herbs);integer(row.hungerDamage);integer(row.restReduction);
    requireCondition(row.food<=1 && row.herbs<=1 && typeof row.died==='boolean','Invalid named resource allocation');
    food+=row.food;herbs+=row.herbs;
  }
  requireCondition(food===payload.market.ecology.resources.entries[0].consumption && herbs===payload.market.ecology.resources.entries[1].consumption,
    'Named/aggregate portions do not reconcile');
}

export function validateActorHistory(snapshot,events){
  validateActorWorld(snapshot.world);denseArray(events,MAX_RESOURCE_DAYS+100000);
  requireCondition(snapshot.nextEntityId===snapshot.world.actorModel.actors.length+1,'Actor identity counter mismatch');
  let expected=createActorWorld(snapshot.world.actorModel.config),eventIndex=0;const rng=createRng(snapshot.rng.seed);
  const receipts=Object.entries(snapshot.commandReceipts).map(([commandId,receipt])=>({commandId,...receipt}));
  const operations=[...receipts.map(r=>({tick:r.input.targetTick,receipt:r})),...Array.from({length:snapshot.world.actorModel.day},(_,i)=>({tick:(i+1)*144}))];
  operations.sort((a,b)=>a.tick-b.tick || (a.receipt?0:1)-(b.receipt?0:1) || (a.receipt?.inputSeq??0)-(b.receipt?.inputSeq??0));
  const expectFact=(fact,tick)=>{
    const event=events[eventIndex++];requireCondition(event,'Missing Actor fact');const {eventSeq,schemaVersion,...actual}=event;
    requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'Actor history disagrees with commands/rules');
  };
  for(const op of operations){
    if(op.receipt){
      const r=op.receipt,result=applyActorCommand(expected,{type:r.input.type,payload:r.input.payload});expected=result.world;
      requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'Actor world command outcome mismatch');
      if(result.success)expectFact(marketCommandFact({commandId:r.commandId,type:r.input.type},result.result),op.tick);
    }else{
      const result=settleActorDay(expected,rng.next());expected=result.world;
      expectFact({type:'ActorDaySettled',sourceSystem:'actors',commandId:null,causationEventSeqs:marketCauses(events.slice(0,eventIndex)),entityIds:[],payload:result.payload},op.tick);
    }
  }
  requireCondition(eventIndex===events.length && canonicalJson(expected)===canonicalJson(snapshot.world),'Actor world/history mismatch');
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Actor RNG history mismatch');
}
