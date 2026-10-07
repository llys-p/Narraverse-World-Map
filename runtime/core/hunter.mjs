import { fields,integer,cloneData,canonicalJson,requireCondition,identifier,denseArray,inputFingerprint,MAX_COLLECTION } from './data-contract.mjs';
import { defaultActorConfig,createActorWorld,validateActorWorld,settleActorDay,populationShares,applyActorCommand,validateActorPayload } from './actors.mjs';
import { createRng } from './rng.mjs';
import { marketCommandFact } from './market.mjs';
import { MAX_RESOURCE_DAYS } from './resource-ledger.mjs';

export const HUNTER_RULES='c-hunter-v1';
export const HUNTER_ACTIONS=Object.freeze(['Rest','WorkForPay','Hunt','BuyFood','BuyMedicine','UseMedicine']);
const CONFIG_FIELDS=['version','actors','initialFood','initialHerbs','initialWallet','wage','workFood','huntFood','huntRiskPermille','huntDamage','workFatigue','huntFatigue','deadlineDays','maxFailures','cooldownDays'];
const LEDGER_FIELDS=['wages','spentFood','spentMedicine','foodBought','herbsBought','herbsUsed','foodUsed','hunts','workDays','restDays','foodProduced','injuryDamage','goalsCompleted','goalsFailed','failedActions'];
const actorPart=w=>({resources:w.resources,resourceModel:w.resourceModel,ecologyModel:w.ecologyModel,marketModel:w.marketModel,actorModel:w.actorModel});
const hunterOf=w=>w.actorModel.actors.find(a=>a.actorId===w.hunterModel.actorId);
const syncNeeds=a=>{a.needs=a.alive?{food:a.hunger,healing:1000-a.health,rest:a.fatigue}:{food:0,healing:0,rest:0};};
function add(a,b){requireCondition(a<=Number.MAX_SAFE_INTEGER-b,'Hunter arithmetic overflow','LIMIT_EXCEEDED');return a+b;}

export function defaultHunterConfig(){
  return {version:'hunter-config-v1',actors:defaultActorConfig(),initialFood:3,initialHerbs:0,initialWallet:0,wage:20,workFood:8,huntFood:20,
    huntRiskPermille:200,huntDamage:100,workFatigue:150,huntFatigue:200,deadlineDays:20,maxFailures:3,cooldownDays:2};
}
function validateConfig(config){
  fields(config,CONFIG_FIELDS);requireCondition(config.version==='hunter-config-v1','Unknown Hunter configuration','UNSUPPORTED_VERSION');
  for(const key of CONFIG_FIELDS.filter(k=>!['version','actors'].includes(k))){integer(config[key]);requireCondition(config[key]<=1000,'Hunter parameter budget exceeded','LIMIT_EXCEEDED');}
  requireCondition(config.wage>0 && config.deadlineDays>0 && config.maxFailures>0 && config.cooldownDays>0,'Invalid Hunter goal/payment parameters');
  const world=createActorWorld(config.actors),hunter=world.actorModel.actors.find(a=>a.occupation==='hunter');
  requireCondition(hunter,'Hunter occupation not registered');
  requireCondition(config.initialFood<=world.resources.food && config.initialHerbs<=world.resources.herbs && config.initialWallet<=world.resources.gold,'Initial private assets exceed world assets');
  return {world,hunter};
}

export function createHunterWorld(config=defaultHunterConfig()){
  const {world,hunter}=validateConfig(config),copy=cloneData(config);
  world.resources.food-=copy.initialFood;world.resourceModel.ledger.food.outflow+=copy.initialFood;
  world.resources.herbs-=copy.initialHerbs;world.resourceModel.ledger.herbs.outflow+=copy.initialHerbs;
  return {...world,hunterModel:{config:copy,configFingerprint:canonicalJson(copy),actorId:hunter.actorId,day:0,wallet:copy.initialWallet,
    inventory:{food:copy.initialFood,herbs:copy.initialHerbs},ledger:Object.fromEntries(LEDGER_FIELDS.map(k=>[k,0])),
    currentGoal:null,nextGoalId:1,cooldownUntilDay:0,lastActionDay:0,lastAction:'None',lastDecision:null}};
}

export function communalGold(world){validateHunterWorld(world);return world.resources.gold-world.hunterModel.wallet;}
export function validateHunterWorld(world,ownership){
  if(ownership!==undefined){fields(ownership,['actorId','foreignWallets','foreignFoodUsed','saleRevenue','herbsSold','herbsReceived']);identifier(ownership.actorId);
    for(const key of ['foreignWallets','foreignFoodUsed','saleRevenue','herbsSold','herbsReceived'])integer(ownership[key]);}
  fields(world,['resources','resourceModel','ecologyModel','marketModel','actorModel','hunterModel']);
  const m=world.hunterModel;fields(m,['config','configFingerprint','actorId','day','wallet','inventory','ledger','currentGoal','nextGoalId','cooldownUntilDay','lastActionDay','lastAction','lastDecision']);
  validateConfig(m.config);fields(m.ledger,LEDGER_FIELDS);for(const n of Object.values(m.ledger))integer(n);
  validateActorWorld(actorPart(world),add(m.ledger.foodUsed,ownership?.foreignFoodUsed??0));
  requireCondition(m.configFingerprint===canonicalJson(m.config) && canonicalJson(m.config.actors)===canonicalJson(world.actorModel.config),'Hunter/Actor config mismatch');
  integer(m.day);requireCondition(m.day===world.actorModel.day,'Hunter day mismatch');identifier(m.actorId);
  const hunter=hunterOf(world);requireCondition(hunter && (ownership?hunter.actorId===ownership.actorId:hunter.occupation==='hunter' && hunter.actorId===world.actorModel.actors.find(a=>a.occupation==='hunter')?.actorId),'Personal identity mismatch');
  integer(m.wallet);requireCondition(BigInt(m.wallet)+BigInt(ownership?.foreignWallets??0)<=BigInt(world.resources.gold),'Personal wallets spent by public market');
  requireCondition(BigInt(m.wallet)===BigInt(m.config.initialWallet)+BigInt(m.ledger.wages)+BigInt(ownership?.saleRevenue??0)-BigInt(m.ledger.spentFood)-BigInt(m.ledger.spentMedicine),'Personal currency does not reconcile');
  requireCondition(BigInt(m.ledger.wages)===BigInt(m.ledger.workDays)*BigInt(m.config.wage) &&
    BigInt(m.ledger.foodProduced)===BigInt(m.ledger.workDays)*BigInt(m.config.workFood)+BigInt(m.ledger.hunts)*BigInt(m.config.huntFood), 'Work/hunt production ledger mismatch');
  fields(m.inventory,['food','herbs']);for(const n of Object.values(m.inventory)){integer(n);requireCondition(n<=1000,'Private inventory limit exceeded','LIMIT_EXCEEDED');}
  requireCondition(BigInt(m.inventory.food)===BigInt(m.config.initialFood)+BigInt(m.ledger.foodBought)+BigInt(m.ledger.hunts)*BigInt(m.config.huntFood)-BigInt(m.ledger.foodUsed),'Private food ledger mismatch');
  requireCondition(BigInt(m.inventory.herbs)===BigInt(m.config.initialHerbs)+BigInt(m.ledger.herbsBought)-BigInt(m.ledger.herbsUsed)-BigInt(ownership?.herbsSold??0),'Private medicine ledger mismatch');
  requireCondition(BigInt(world.resourceModel.ledger.food.outflow)>=BigInt(m.config.initialFood)+BigInt(m.ledger.foodBought)+BigInt(m.ledger.hunts)*BigInt(m.config.huntFood) &&
    BigInt(world.resourceModel.ledger.herbs.outflow)>=BigInt(m.config.initialHerbs)+BigInt(m.ledger.herbsBought)-BigInt(ownership?.herbsReceived??0),'Private transfer exceeds actual warehouse outflow');
  integer(m.nextGoalId,1);integer(m.cooldownUntilDay);integer(m.lastActionDay);
  requireCondition(m.lastActionDay<=m.day+1 && ['None',...HUNTER_ACTIONS,...(ownership?['SellMedicine']:[])].includes(m.lastAction),'Invalid last action');
  if(m.currentGoal){fields(m.currentGoal,['goalId','kind','step','startDay','deadlineDay','failures','target']);integer(m.currentGoal.goalId,1);
    requireCondition(m.currentGoal.goalId<m.nextGoalId && ['secure-food','recover-health','recover-rest',...(ownership?['support-village','stock-medicine','sell-medicine']:[])].includes(m.currentGoal.kind),'Invalid current goal');
    requireCondition(['earn','buy','use','hunt','rest','wait',...(ownership?['sell','produce']:[])].includes(m.currentGoal.step),'Unknown goal step');
    for(const key of ['startDay','deadlineDay','failures','target'])integer(m.currentGoal[key]);
    requireCondition(m.currentGoal.startDay>=1 && m.currentGoal.startDay<=m.day+1 && m.currentGoal.deadlineDay===m.currentGoal.startDay+m.config.deadlineDays && m.currentGoal.target<=1000,'Goal deadline/target mismatch');}
  if(m.lastDecision){fields(m.lastDecision,['day','goalId','kind','action','scores','blocked',...(ownership && Object.hasOwn(m.lastDecision,'roleScore')?['roleScore']:[])]);integer(m.lastDecision.day,1);integer(m.lastDecision.goalId);
    requireCondition([...HUNTER_ACTIONS,...(ownership?['SellMedicine']:[])].includes(m.lastDecision.action) && typeof m.lastDecision.blocked==='boolean','Invalid Utility decision');
    if(Object.hasOwn(m.lastDecision,'roleScore'))integer(m.lastDecision.roleScore);
    fields(m.lastDecision.scores,['health','food','rest']);for(const n of Object.values(m.lastDecision.scores))integer(n);}
}

export function canPersonalAction(w,action,ownership){validateHunterWorld(w,ownership);return feasible(w,action,ownership);}
function feasible(w,action,ownership){
  const m=w.hunterModel,a=hunterOf(w),c=m.config;
  if(!a.alive || m.lastActionDay>=m.day+1)return false;
  if(action==='Rest')return true;
  if(action==='WorkForPay')return a.health>=300 && a.fatigue<=700 && w.resources.gold-m.wallet-(ownership?.foreignWallets??0)>=c.wage;
  if(action==='Hunt')return a.occupation==='hunter' && a.health>=600 && a.fatigue<=600 && w.ecologyModel.populations.deer>=1 && m.inventory.food<=1000-c.huntFood;
  if(action==='BuyFood')return w.resources.food>=1 && m.wallet>=w.marketModel.prices.food && m.inventory.food<1000;
  if(action==='BuyMedicine')return w.resources.herbs>=1 && m.wallet>=w.marketModel.prices.herbs && m.inventory.herbs<1000;
  return action==='UseMedicine' && m.inventory.herbs>0 && a.health<1000;
}

export function applyHunterAction(input,payload,sample=null,ownership){
  validateHunterWorld(input,ownership);fields(payload,['actorId','goalId','action']);integer(payload.goalId);identifier(payload.actorId);
  requireCondition(payload.actorId===input.hunterModel.actorId && HUNTER_ACTIONS.includes(payload.action),'Invalid Hunter action/identity');
  if(payload.action==='Hunt')requireCondition(typeof sample==='number' && sample>=0 && sample<1,'Invalid hunting sample');
  else requireCondition(sample===null,'Only Hunt consumes an extra random sample');
  const world=cloneData(input),m=world.hunterModel,a=hunterOf(world),c=m.config,action=payload.action;
  if(!feasible(input,action,ownership)){
    if(a.alive && m.lastActionDay<m.day+1){m.lastActionDay=m.day+1;m.lastAction=action;m.ledger.failedActions=add(m.ledger.failedActions,1);if(m.currentGoal)m.currentGoal.failures++;}
    return {world,success:false,result:{code:'RULE_REJECTED'}};
  }
  const before={wallet:m.wallet,inventory:cloneData(m.inventory),communalGold:world.resources.gold-m.wallet-(ownership?.foreignWallets??0)};
  let foodProduced=0,deerKilled=0,price=0,injuryDamage=0;
  if(action==='WorkForPay'){
    m.wallet=add(m.wallet,c.wage);m.ledger.wages=add(m.ledger.wages,c.wage);m.ledger.workDays++;
    foodProduced=c.workFood;const stock=BigInt(world.resources.food)+BigInt(foodProduced),cap=BigInt(world.resourceModel.config.resources.food.capacity);
    const spill=stock>cap?Number(stock-cap):0;world.resources.food=Number(stock>cap?cap:stock);
    world.resourceModel.ledger.food.production=add(world.resourceModel.ledger.food.production,foodProduced);
    world.resourceModel.ledger.food.capacityLoss=add(world.resourceModel.ledger.food.capacityLoss,spill);
    a.fatigue=Math.min(1000,a.fatigue+c.workFatigue);
  }else if(action==='Hunt'){
    world.ecologyModel.populations.deer--;world.ecologyModel.ledger.deer.hunted=add(world.ecologyModel.ledger.deer.hunted,1);deerKilled=1;m.ledger.hunts++;
    foodProduced=c.huntFood;m.inventory.food+=foodProduced;world.resourceModel.ledger.food.production=add(world.resourceModel.ledger.food.production,foodProduced);
    world.resourceModel.ledger.food.outflow=add(world.resourceModel.ledger.food.outflow,foodProduced);
    a.fatigue=Math.min(1000,a.fatigue+c.huntFatigue);
    if(sample<c.huntRiskPermille/1000){injuryDamage=Math.min(c.huntDamage,a.health-1);a.health-=injuryDamage;m.ledger.injuryDamage=add(m.ledger.injuryDamage,injuryDamage);}
  }else if(action==='BuyFood' || action==='BuyMedicine'){
    const id=action==='BuyFood'?'food':'herbs';price=world.marketModel.prices[id];m.wallet-=price;world.resources[id]--;m.inventory[id]++;
    world.resourceModel.ledger[id].outflow=add(world.resourceModel.ledger[id].outflow,1);
    if(id==='food'){m.ledger.foodBought++;m.ledger.spentFood=add(m.ledger.spentFood,price);}else{m.ledger.herbsBought++;m.ledger.spentMedicine=add(m.ledger.spentMedicine,price);}
  }else if(action==='UseMedicine'){m.inventory.herbs--;m.ledger.herbsUsed++;a.health=Math.min(1000,a.health+100);}
  else m.ledger.restDays++;
  m.ledger.foodProduced=add(m.ledger.foodProduced,foodProduced);m.lastActionDay=m.day+1;m.lastAction=action;syncNeeds(a);
  validateHunterWorld(world,ownership);
  return {world,success:true,result:{...cloneData(payload),day:m.day+1,before,after:{wallet:m.wallet,inventory:cloneData(m.inventory),communalGold:world.resources.gold-m.wallet-(ownership?.foreignWallets??0)},foodProduced,deerKilled,price,injuryDamage,sample}};
}

function nextAction(w,goal,ownership){
  const m=w.hunterModel,a=hunterOf(w);
  if(a.fatigue>=600)return {action:'Rest',step:goal?.step??'rest',blocked:false};
  const food=()=>{
    if(m.inventory.food>0)return {action:'Rest',step:'wait',blocked:false};
    if(feasible(w,'BuyFood',ownership))return {action:'BuyFood',step:'buy',blocked:false};
    if(feasible(w,'Hunt',ownership))return {action:'Hunt',step:'hunt',blocked:false};
    if(m.wallet<w.marketModel.prices.food && feasible(w,'WorkForPay',ownership))return {action:'WorkForPay',step:'earn',blocked:false};
    return {action:'Rest',step:'wait',blocked:true};
  };
  if(m.inventory.food===0 && a.hunger>=300)return food();
  if(goal?.kind==='recover-health'){
    if(feasible(w,'UseMedicine',ownership))return {action:'UseMedicine',step:'use',blocked:false};
    if(feasible(w,'BuyMedicine',ownership))return {action:'BuyMedicine',step:'buy',blocked:false};
    if(m.wallet<w.marketModel.prices.herbs && feasible(w,'WorkForPay',ownership))return {action:'WorkForPay',step:'earn',blocked:false};
    return {action:'Rest',step:'wait',blocked:true};
  }
  if(goal?.kind==='secure-food')return food();
  return {action:'Rest',step:'rest',blocked:false};
}

export function planHunterDay(input,ownership){
  validateHunterWorld(input,ownership);const world=cloneData(input),m=world.hunterModel,a=hunterOf(world),day=m.day+1;
  const scores={health:a.alive && a.health<=700?1500-a.health:0,food:a.alive && m.inventory.food===0?600+a.hunger:0,rest:a.alive && a.fatigue>=600?600+a.fatigue:0};
  if(!a.alive){if(m.currentGoal){m.currentGoal=null;m.ledger.goalsFailed++;}m.lastDecision=null;return {world,command:null,decision:null};}
  if(m.currentGoal && day>m.currentGoal.deadlineDay){m.ledger.goalsFailed++;m.currentGoal=null;m.cooldownUntilDay=day+m.config.cooldownDays;}
  if(!m.currentGoal && day>=m.cooldownUntilDay){
    const choices=[['recover-rest',scores.rest,200],['recover-health',scores.health,800],['secure-food',scores.food,200]].sort((a,b)=>b[1]-a[1]);
    if(choices[0][1]>0){const [kind,,target]=choices[0];requireCondition(m.nextGoalId<Number.MAX_SAFE_INTEGER,'Goal counter overflow','LIMIT_EXCEEDED');
      m.currentGoal={goalId:m.nextGoalId++,kind,step:'wait',startDay:day,deadlineDay:day+m.config.deadlineDays,failures:0,target};}
  }
  const choice=nextAction(world,m.currentGoal,ownership);
  if(m.currentGoal){m.currentGoal.step=choice.step;if(choice.blocked)m.currentGoal.failures++;}
  const decision={day,goalId:m.currentGoal?.goalId??0,kind:m.currentGoal?.kind??'idle',action:choice.action,scores,blocked:choice.blocked};m.lastDecision=cloneData(decision);
  return {world,decision,command:{commandId:'hunter-day-'+day,targetTick:day*144,type:'ActorAction',payload:{actorId:m.actorId,goalId:decision.goalId,action:decision.action}}};
}

export function settleHunterDay(input,sample){
  validateHunterWorld(input);const world=cloneData(input),m=world.hunterModel,a=hunterOf(world);
  const privateFood=a.alive && m.inventory.food>0?1:0,usedBefore=m.ledger.foodUsed;
  m.inventory.food-=privateFood;m.ledger.foodUsed=add(m.ledger.foodUsed,privateFood);
  const actors=settleActorDay(actorPart(world),sample,{actorId:m.actorId,privateFood,privateFoodConsumed:usedBefore,resting:m.lastAction==='Rest',reservedGold:m.wallet});
  Object.assign(world,actors.world);m.day++;const goal=m.currentGoal,h=hunterOf(world);let outcome='ongoing';
  if(goal){
    const complete=h.alive && (goal.kind==='recover-health'?h.health>=goal.target:goal.kind==='secure-food'?h.hunger<=goal.target && privateFood===1:h.fatigue<=goal.target);
    if(complete){m.ledger.goalsCompleted++;m.currentGoal=null;outcome='completed';}
    else if(!h.alive || goal.failures>=m.config.maxFailures || m.day>=goal.deadlineDay){m.ledger.goalsFailed++;m.currentGoal=null;m.cooldownUntilDay=m.day+m.config.cooldownDays;outcome='failed';}
  }else outcome='idle';
  validateHunterWorld(world);
  return {world,payload:{day:m.day,actors:actors.payload,privateFood,inventory:cloneData(m.inventory),wallet:m.wallet,communalGold:world.resources.gold-m.wallet,
    population:populationShares(actorPart(world),m.ledger.foodUsed),decision:cloneData(m.lastDecision),currentGoal:cloneData(m.currentGoal),goalOutcome:outcome,ledger:cloneData(m.ledger)}};
}

export function applyHunterCommand(input,command){
  validateHunterWorld(input);const result=applyActorCommand(actorPart(input),command,input.hunterModel.ledger.foodUsed);
  return {...result,world:{...result.world,hunterModel:cloneData(input.hunterModel)}};
}

export function hunterActionFact(input,result){
  return {type:'HunterActionCommitted',sourceSystem:'command-engine',commandId:input.commandId,
    causationEventSeqs:[],entityIds:[result.actorId],payload:cloneData(result)};
}
export const hunterCauses=events=>events.filter(e=>['PopulationRemoved','TradeRouteSet','HunterActionCommitted'].includes(e.type)).map(e=>e.eventSeq);
export function validateHunterActionResult(result){
  fields(result,['actorId','goalId','action','day','before','after','foodProduced','deerKilled','price','injuryDamage','sample']);
  identifier(result.actorId);integer(result.goalId);integer(result.day,1);requireCondition(HUNTER_ACTIONS.includes(result.action),'Unknown committed Hunter action');
  for(const key of ['foodProduced','deerKilled','price','injuryDamage'])integer(result[key]);
  for(const key of ['before','after']){fields(result[key],['wallet','inventory','communalGold']);integer(result[key].wallet);integer(result[key].communalGold);
    fields(result[key].inventory,['food','herbs']);integer(result[key].inventory.food);integer(result[key].inventory.herbs);}
  requireCondition(result.action==='Hunt'?typeof result.sample==='number' && result.sample>=0 && result.sample<1:result.sample===null,'Action sample provenance mismatch');
}
export function validateHunterPayload(payload){
  fields(payload,['day','actors','privateFood','inventory','wallet','communalGold','population','decision','currentGoal','goalOutcome','ledger']);
  integer(payload.day,1);validateActorPayload(payload.actors);integer(payload.privateFood);integer(payload.wallet);integer(payload.communalGold);
  requireCondition(payload.actors.day===payload.day && payload.privateFood<=1 && ['ongoing','completed','failed','idle'].includes(payload.goalOutcome),'Invalid Hunter daily fact');
  fields(payload.inventory,['food','herbs']);integer(payload.inventory.food);integer(payload.inventory.herbs);fields(payload.ledger,LEDGER_FIELDS);
  for(const value of Object.values(payload.ledger))integer(value);
  fields(payload.population,['registered','namedAlive','unnamedAlive','totalAlive','namedInjured','dead']);
  requireCondition(canonicalJson(payload.population)===canonicalJson(payload.actors.populationClosing),'Hunter population ownership mismatch');
}

export function validateHunterHistory(snapshot,events){
  validateHunterWorld(snapshot.world);denseArray(events,MAX_RESOURCE_DAYS*2+MAX_COLLECTION);
  requireCondition(snapshot.nextEntityId===snapshot.world.actorModel.actors.length+1,'Hunter Actor identity counter mismatch');
  let expected=createHunterWorld(snapshot.world.hunterModel.config),eventIndex=0;const rng=createRng(snapshot.rng.seed),receipts=snapshot.commandReceipts;
  const external=Object.entries(receipts).filter(([,r])=>r.input.type!=='ActorAction').map(([commandId,r])=>({commandId,...r}));
  let nextInternalSeq=external.length+snapshot.pendingCommands.length+1;const seen=new Set();
  const operations=[...external.map(r=>({tick:r.input.targetTick,receipt:r})),...Array.from({length:snapshot.world.hunterModel.day},(_,i)=>({tick:(i+1)*144}))];
  operations.sort((a,b)=>a.tick-b.tick || (a.receipt?0:1)-(b.receipt?0:1) || (a.receipt?.inputSeq??0)-(b.receipt?.inputSeq??0));
  const expectFact=(fact,tick)=>{
    const event=events[eventIndex++];requireCondition(event,'Missing Hunter fact');const {eventSeq,schemaVersion,...actual}=event;
    requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'Hunter history disagrees with intent/actions/rules');
  };
  for(const op of operations){
    if(op.receipt){
      const r=op.receipt;requireCondition(['RemovePopulation','SetTradeRoute'].includes(r.input.type) && !r.commandId.startsWith('hunter-day-'),'External command used internal provenance');
      const result=applyHunterCommand(expected,{type:r.input.type,payload:r.input.payload});expected=result.world;
      requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'Hunter external command mismatch');
      if(result.success)expectFact(marketCommandFact({commandId:r.commandId,type:r.input.type},result.result),op.tick);seen.add(r.commandId);
    }else{
      const plan=planHunterDay(expected);expected=plan.world;
      if(plan.command){
        const command=plan.command,r=receipts[command.commandId];requireCondition(r && !seen.has(command.commandId),'Missing/duplicate planned action receipt');
        const input={type:command.type,targetTick:command.targetTick,payload:command.payload};
        requireCondition(r.inputSeq===nextInternalSeq++ && canonicalJson(r.input)===canonicalJson(input) && r.fingerprint===inputFingerprint(input),'Internal action input/source mismatch');
        const result=applyHunterAction(expected,command.payload,command.payload.action==='Hunt'?rng.next():null);expected=result.world;
        requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'Internal action outcome mismatch');
        if(result.success)expectFact(hunterActionFact(command,result.result),op.tick);seen.add(command.commandId);
      }
      const result=settleHunterDay(expected,rng.next());expected=result.world;
      expectFact({type:'HunterDaySettled',sourceSystem:'hunter',commandId:null,causationEventSeqs:hunterCauses(events.slice(0,eventIndex)),entityIds:[],payload:result.payload},op.tick);
    }
  }
  requireCondition(seen.size===Object.keys(receipts).length && nextInternalSeq===snapshot.nextInputSeq,'Unclaimed/forged Hunter input history');
  requireCondition(eventIndex===events.length && canonicalJson(expected)===canonicalJson(snapshot.world),'Hunter world/history mismatch');
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Hunter RNG history mismatch');
}
