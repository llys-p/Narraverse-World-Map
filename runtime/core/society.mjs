import { fields,integer,denseArray,cloneData,canonicalJson,requireCondition,identifier,inputFingerprint,MAX_COLLECTION,record } from './data-contract.mjs';
import { createActorWorld,validateActorWorld,settleActorDay,applyActorCommand,validateActorPayload } from './actors.mjs';
import { defaultHunterConfig,createHunterWorld,validateHunterWorld,planHunterDay,applyHunterAction,canPersonalAction,HUNTER_ACTIONS,validateHunterActionResult } from './hunter.mjs';
import { createRng } from './rng.mjs';
import { marketCommandFact } from './market.mjs';
import { MAX_RESOURCE_DAYS } from './resource-ledger.mjs';

export const SOCIETY_RULES='c-society-v1';
export const SOCIETY_ACTIONS=Object.freeze([...HUNTER_ACTIONS,'SellMedicine']);
const ECONOMICS=['wage','workFood','huntFood','huntRiskPermille','huntDamage','workFatigue','huntFatigue','deadlineDays','maxFailures','cooldownDays'];
const ROLES=['chief','hunter','merchant'];
const PERSONAL_GOALS=['recover-health','recover-rest','secure-food'];
const TRADE_FIELDS=['revenue','spent','herbsSold','herbsReceived','lastSaleDay'];
const actorPart=w=>({resources:w.resources,resourceModel:w.resourceModel,ecologyModel:w.ecologyModel,marketModel:w.marketModel,actorModel:w.actorModel});
const person=(w,id)=>w.actorModel.actors.find(a=>a.actorId===id);
const agent=(w,id)=>w.societyModel.agents.find(a=>a.state.actorId===id);
function add(a,b){requireCondition(a<=Number.MAX_SAFE_INTEGER-b,'Society counter overflow','LIMIT_EXCEEDED');return a+b;}
const sum=(agents,pick)=>agents.reduce((n,a)=>add(n,pick(a)),0);

export function defaultSocietyConfig(){
  const base=defaultHunterConfig();return {version:'society-config-v1',actors:base.actors,
    estates:ROLES.map((role,i)=>({actorId:'actor-'+(i+1),initialFood:3,initialHerbs:0,initialWallet:role==='merchant'?100:0})),
    economics:Object.fromEntries(ECONOMICS.map(k=>[k,base[k]])),saleMarkup:2,reserveFoodDays:2};
}
function unitConfig(config,index){return {...defaultHunterConfig(),actors:cloneData(config.actors),...config.economics,
  initialFood:config.estates[index].initialFood,initialHerbs:config.estates[index].initialHerbs,initialWallet:config.estates[index].initialWallet};}
function validateConfig(c){
  fields(c,['version','actors','estates','economics','saleMarkup','reserveFoodDays']);requireCondition(c.version==='society-config-v1','Unknown Society configuration','UNSUPPORTED_VERSION');
  denseArray(c.estates,3);requireCondition(c.estates.length===3,'Society needs exactly three estates');
  fields(c.economics,ECONOMICS);integer(c.saleMarkup);requireCondition(c.saleMarkup<=1000,'Sale markup budget exceeded','LIMIT_EXCEEDED');
  integer(c.reserveFoodDays,1);requireCondition(c.reserveFoodDays<=10,'Public reserve goal budget exceeded');
  const world=createActorWorld(c.actors);
  requireCondition(world.actorModel.actors.length===3 && world.actorModel.actors.every((a,i)=>a.occupation===ROLES[i]) &&
    c.actors.market.ecology.resources.settlement.humanCount===80,'Society roster/population differs from fixed contract');
  for(const [i,e] of c.estates.entries()){
    fields(e,['actorId','initialFood','initialHerbs','initialWallet']);requireCondition(e.actorId==='actor-'+(i+1),'Estate identity/order mismatch');
    for(const key of ['initialFood','initialHerbs','initialWallet'])integer(e[key]);createHunterWorld(unitConfig(c,i));
  }
  requireCondition(sum(c.estates,e=>e.initialFood)<=world.resources.food && sum(c.estates,e=>e.initialHerbs)<=world.resources.herbs &&
    sum(c.estates,e=>e.initialWallet)<=world.resources.gold,'Private estates exceed actual world assets');return world;
}
export function createSocietyWorld(config=defaultSocietyConfig()){
  const world=validateConfig(config),copy=cloneData(config);
  const agents=copy.estates.map((e,i)=>{const state=createHunterWorld(unitConfig(copy,i)).hunterModel;state.actorId=e.actorId;
    return {state,trade:Object.fromEntries(TRADE_FIELDS.map(k=>[k,0]))};});
  for(const id of ['food','herbs']){
    const quantity=sum(copy.estates,e=>e[id==='food'?'initialFood':'initialHerbs']);world.resources[id]-=quantity;world.resourceModel.ledger[id].outflow+=quantity;
  }
  return {...world,societyModel:{config:copy,configFingerprint:canonicalJson(copy),day:0,agents}};
}

function ownership(w,id){const a=agent(w,id),others=w.societyModel.agents.filter(a=>a.state.actorId!==id);
  return {actorId:id,foreignWallets:sum(others,a=>a.state.wallet),foreignFoodUsed:sum(others,a=>a.state.ledger.foodUsed),
    saleRevenue:a.trade.revenue,herbsSold:a.trade.herbsSold,herbsReceived:a.trade.herbsReceived};}
function view(w,id){return {...actorPart(w),hunterModel:agent(w,id).state};}
function mergeUnit(world,id,unitWorld){Object.assign(world,actorPart(unitWorld));agent(world,id).state=unitWorld.hunterModel;}
export function validateSocietyWorld(w){
  fields(w,['resources','resourceModel','ecologyModel','marketModel','actorModel','societyModel']);const m=w.societyModel;
  fields(m,['config','configFingerprint','day','agents']);denseArray(m.agents,3);requireCondition(m.agents.length===3,'Invalid Society estate count');
  validateConfig(m.config);requireCondition(m.configFingerprint===canonicalJson(m.config) && canonicalJson(m.config.actors)===canonicalJson(w.actorModel.config),'Society/Actor configuration mismatch');
  integer(m.day);requireCondition(m.day===w.actorModel.day,'Society day mismatch');
  for(const [i,a] of m.agents.entries()){
    fields(a,['state','trade']);fields(a.trade,TRADE_FIELDS);for(const n of Object.values(a.trade))integer(n);
    requireCondition(a.state.actorId===m.config.estates[i].actorId && canonicalJson(a.state.config)===canonicalJson(unitConfig(m.config,i)),'Society estate identity/config mismatch');
  }
  validateActorWorld(actorPart(w),sum(m.agents,a=>a.state.ledger.foodUsed));
  for(const a of m.agents)validateHunterWorld(view(w,a.state.actorId),ownership(w,a.state.actorId));
  requireCondition(sum(m.agents,a=>a.trade.revenue)===sum(m.agents,a=>a.trade.spent) && sum(m.agents,a=>a.trade.herbsSold)===sum(m.agents,a=>a.trade.herbsReceived),'Peer trade is not balanced');
  requireCondition(sum(m.agents,a=>a.state.wallet)<=w.resources.gold,'Combined wallets exceed total currency');
  const movedFood=sum(m.agents,a=>add(a.state.config.initialFood,add(a.state.ledger.foodBought,a.state.ledger.hunts*a.state.config.huntFood)));
  const movedHerbs=sum(m.agents,a=>add(a.state.config.initialHerbs,a.state.ledger.herbsBought)-a.trade.herbsReceived);
  requireCondition(movedFood<=w.resourceModel.ledger.food.outflow && movedHerbs<=w.resourceModel.ledger.herbs.outflow,'Aggregate estate transfers exceed warehouse outflow');
}

function validatePublicTrade(w,publicTrade){
  if(publicTrade===null)return;
  fields(publicTrade,['buyerId','price']);
  if(publicTrade.buyerId===null){requireCondition(publicTrade.price===null,'Empty public selection has a quote');return;}
  identifier(publicTrade.buyerId);integer(publicTrade.price,1);
  const regular=Math.min(w.marketModel.config.products.herbs.maxPrice,w.marketModel.prices.herbs+w.societyModel.config.saleMarkup);
  requireCondition(['actor-1','actor-2'].includes(publicTrade.buyerId) && publicTrade.price>=w.marketModel.prices.herbs && publicTrade.price<=regular,
    'Public peer selection/quote outside published range');
}
function buyerFor(w,sellerId,publicTrade=null){
  // A C4 selection contains only a public request plus observed relation, not private eligibility.
  if(publicTrade!==null)return publicTrade.buyerId===null?null:agent(w,publicTrade.buyerId);
  const price=Math.min(w.marketModel.config.products.herbs.maxPrice,w.marketModel.prices.herbs+w.societyModel.config.saleMarkup);
  return w.societyModel.agents.find(a=>a.state.actorId!==sellerId && person(w,a.state.actorId).alive && person(w,a.state.actorId).health<=700 &&
    a.state.inventory.herbs===0 && a.state.wallet>=price);
}
function beginGoal(m,kind,target,day){requireCondition(m.nextGoalId<Number.MAX_SAFE_INTEGER,'Goal counter overflow','LIMIT_EXCEEDED');
  m.currentGoal={goalId:m.nextGoalId++,kind,step:'wait',startDay:day,deadlineDay:day+m.config.deadlineDays,failures:0,target};}
export function planSocietyDay(input,publicTrade=null){
  validateSocietyWorld(input);validatePublicTrade(input,publicTrade);const world=cloneData(input),commands=[],day=world.societyModel.day+1;
  for(const estate of input.societyModel.agents){
    const id=estate.state.actorId,a=person(input,id),m=agent(world,id).state;
    const urgent=a.alive && (a.health<=700 || a.fatigue>=600 || m.inventory.food===0);
    if(m.currentGoal && !PERSONAL_GOALS.includes(m.currentGoal.kind) && (urgent || day>m.currentGoal.deadlineDay)){
      m.currentGoal=null;m.ledger.goalsFailed++;m.cooldownUntilDay=urgent?0:day+m.config.cooldownDays;}
    if(!m.currentGoal || PERSONAL_GOALS.includes(m.currentGoal.kind)){
      const planned=planHunterDay(view(world,id),ownership(world,id));agent(world,id).state=planned.world.hunterModel;
    }
    const current=agent(world,id).state;if(!a.alive){current.lastDecision=null;continue;}
    if(!current.currentGoal && day>=current.cooldownUntilDay){
      const communalFoodGoal=(80-world.actorModel.actors.filter(a=>!a.alive).length)*world.societyModel.config.reserveFoodDays;
      if(a.occupation==='chief' && input.resources.food<communalFoodGoal)beginGoal(current,'support-village',communalFoodGoal,day);
      if(a.occupation==='merchant'){
        if(current.inventory.herbs>0 && buyerFor(input,id,publicTrade))beginGoal(current,'sell-medicine',1,day);
        else if(current.inventory.herbs===0)beginGoal(current,'stock-medicine',1,day);
      }
    }
    const goal=current.currentGoal;let targetActorId=null;
    if(goal && !PERSONAL_GOALS.includes(goal.kind)){
      let action='Rest',blocked=false,step='wait';
      if(goal.kind==='support-village'){
        if(canPersonalAction(view(world,id),'WorkForPay',ownership(world,id))){action='WorkForPay';step='produce';}else blocked=true;
      }else if(goal.kind==='stock-medicine'){
        if(canPersonalAction(view(world,id),'BuyMedicine',ownership(world,id))){action='BuyMedicine';step='buy';}
        else if(current.wallet<world.marketModel.prices.herbs && canPersonalAction(view(world,id),'WorkForPay',ownership(world,id))){action='WorkForPay';step='earn';}
        else blocked=true;
      }else{
        const buyer=buyerFor(input,id,publicTrade);if(buyer){action='SellMedicine';step='sell';targetActorId=buyer.state.actorId;}else blocked=true;
      }
      goal.step=step;if(blocked)goal.failures++;
      current.lastDecision={day,goalId:goal.goalId,kind:goal.kind,action,scores:{health:0,food:0,rest:0},blocked,roleScore:500};
    }
    const d=current.lastDecision;
    commands.push({commandId:'society-day-'+day+'-'+id,targetTick:day*144,type:'SocietyAction',payload:{actorId:id,goalId:d?.goalId??0,action:d?.action??'Rest',targetActorId}});
  }
  validateSocietyWorld(world);return {world,commands};
}

export function applySocietyAction(input,payload,sample=null,publicTrade=null){
  validateSocietyWorld(input);validatePublicTrade(input,publicTrade);fields(payload,['actorId','goalId','action','targetActorId']);identifier(payload.actorId);integer(payload.goalId);
  requireCondition(agent(input,payload.actorId) && SOCIETY_ACTIONS.includes(payload.action),'Unknown Society action/estate');
  requireCondition(payload.action==='SellMedicine'?typeof payload.targetActorId==='string':payload.targetActorId===null,'Invalid Society action target');
  if(payload.action==='SellMedicine')identifier(payload.targetActorId);
  const world=cloneData(input),seller=agent(world,payload.actorId),m=seller.state,a=person(world,payload.actorId),day=m.day+1;
  if(payload.action!=='SellMedicine'){
    const {targetActorId,...personal}=payload,result=applyHunterAction(view(world,payload.actorId),personal,sample,ownership(world,payload.actorId));
    mergeUnit(world,payload.actorId,result.world);validateSocietyWorld(world);
    return {world,success:result.success,result:result.success?{...result.result,targetActorId:null}:result.result};
  }
  requireCondition(sample===null,'Trade does not consume RNG');const buyer=agent(world,payload.targetActorId),p=buyer?person(world,payload.targetActorId):null;
  if(publicTrade!==null)requireCondition(publicTrade.buyerId===payload.targetActorId,'Committed trade target differs from public selection');
  const price=publicTrade===null?Math.min(world.marketModel.config.products.herbs.maxPrice,world.marketModel.prices.herbs+world.societyModel.config.saleMarkup):publicTrade.price;
  const valid=a.alive && a.occupation==='merchant' && m.lastActionDay<day && m.inventory.herbs>0 && buyer && p.alive && p.actorId!==a.actorId &&
    p.location===a.location && p.health<=700 && buyer.state.inventory.herbs===0 && buyer.state.wallet>=price;
  if(!valid){if(a.alive && m.lastActionDay<day){m.lastActionDay=day;m.lastAction='SellMedicine';m.ledger.failedActions++;if(m.currentGoal)m.currentGoal.failures++;}
    return {world,success:false,result:{code:'RULE_REJECTED'}};}
  const before={sellerWallet:m.wallet,buyerWallet:buyer.state.wallet,sellerHerbs:m.inventory.herbs,buyerHerbs:buyer.state.inventory.herbs};
  m.inventory.herbs--;buyer.state.inventory.herbs++;m.wallet=add(m.wallet,price);buyer.state.wallet-=price;
  seller.trade.revenue=add(seller.trade.revenue,price);seller.trade.herbsSold++;seller.trade.lastSaleDay=day;
  buyer.trade.spent=add(buyer.trade.spent,price);buyer.trade.herbsReceived++;buyer.state.ledger.herbsBought++;
  buyer.state.ledger.spentMedicine=add(buyer.state.ledger.spentMedicine,price);m.lastActionDay=day;m.lastAction='SellMedicine';
  validateSocietyWorld(world);
  return {world,success:true,result:{...cloneData(payload),day,buyerId:p.actorId,price,before,
    after:{sellerWallet:m.wallet,buyerWallet:buyer.state.wallet,sellerHerbs:m.inventory.herbs,buyerHerbs:buyer.state.inventory.herbs}}};
}

export function settleSocietyDay(input,sample){
  validateSocietyWorld(input);const world=cloneData(input),m=world.societyModel,foodBefore=sum(m.agents,a=>a.state.ledger.foodUsed);
  const managedActors=m.agents.map(a=>{const alive=person(world,a.state.actorId).alive,privateFood=alive && a.state.inventory.food>0?1:0;
    a.state.inventory.food-=privateFood;a.state.ledger.foodUsed=add(a.state.ledger.foodUsed,privateFood);
    return {actorId:a.state.actorId,privateFood,resting:a.state.lastAction==='Rest'};});
  const actors=settleActorDay(actorPart(world),sample,{managedActors,privateFoodConsumed:foodBefore,reservedGold:sum(m.agents,a=>a.state.wallet)});
  Object.assign(world,actors.world);m.day++;const rows=[];
  for(const estate of m.agents){
    const s=estate.state,a=person(world,s.actorId),goal=s.currentGoal,privateFood=managedActors.find(p=>p.actorId===s.actorId).privateFood;s.day++;let goalOutcome='idle';
    if(goal){
      const complete=a.alive && (goal.kind==='recover-health'?a.health>=goal.target:goal.kind==='secure-food'?a.hunger<=goal.target && privateFood===1:
        goal.kind==='recover-rest'?a.fatigue<=goal.target:goal.kind==='support-village'?world.resources.food>=goal.target:
        goal.kind==='stock-medicine'?s.inventory.herbs>=goal.target:estate.trade.lastSaleDay===m.day);
      if(complete){s.ledger.goalsCompleted++;s.currentGoal=null;goalOutcome='completed';}
      else if(!a.alive || goal.failures>=s.config.maxFailures || s.day>=goal.deadlineDay){s.ledger.goalsFailed++;s.currentGoal=null;s.cooldownUntilDay=s.day+s.config.cooldownDays;goalOutcome='failed';}
      else goalOutcome='ongoing';
    }
    rows.push({actorId:s.actorId,decision:cloneData(s.lastDecision),currentGoal:cloneData(s.currentGoal),goalOutcome,privateFood,wallet:s.wallet,inventory:cloneData(s.inventory),ledger:cloneData(s.ledger),trade:cloneData(estate.trade)});
  }
  validateSocietyWorld(world);
  return {world,payload:{day:m.day,actors:actors.payload,agents:rows,communalGold:world.resources.gold-sum(m.agents,a=>a.state.wallet)}};
}

export function applySocietyCommand(input,command){
  validateSocietyWorld(input);const result=applyActorCommand(actorPart(input),command,sum(input.societyModel.agents,a=>a.state.ledger.foodUsed));
  return {...result,world:{...result.world,societyModel:cloneData(input.societyModel)}};
}

export function societyActionFact(command,result){return {type:'SocietyActionCommitted',sourceSystem:'command-engine',commandId:command.commandId,
  causationEventSeqs:[],entityIds:result.action==='SellMedicine'?[result.actorId,result.buyerId]:[result.actorId],payload:cloneData(result)};}
export const societyCauses=events=>events.filter(e=>['PopulationRemoved','TradeRouteSet','SocietyActionCommitted'].includes(e.type)).map(e=>e.eventSeq);
export function validateSocietyActionResult(result){
  record(result);
  if(result.action!=='SellMedicine'){const {targetActorId,...personal}=result;requireCondition(targetActorId===null,'Invalid personal action target');validateHunterActionResult(personal);return;}
  fields(result,['actorId','goalId','action','targetActorId','day','buyerId','price','before','after']);
  identifier(result.actorId);identifier(result.targetActorId);identifier(result.buyerId);integer(result.goalId);integer(result.day,1);integer(result.price,1);
  requireCondition(result.targetActorId===result.buyerId && result.actorId!==result.buyerId,'Invalid peer trade identities');
  for(const key of ['before','after']){fields(result[key],['sellerWallet','buyerWallet','sellerHerbs','buyerHerbs']);for(const n of Object.values(result[key]))integer(n);}
  requireCondition(BigInt(result.before.sellerWallet)+BigInt(result.before.buyerWallet)===BigInt(result.after.sellerWallet)+BigInt(result.after.buyerWallet) &&
    result.after.sellerWallet-result.before.sellerWallet===result.price && result.before.buyerWallet-result.after.buyerWallet===result.price &&
    result.before.sellerHerbs-result.after.sellerHerbs===1 && result.after.buyerHerbs-result.before.buyerHerbs===1,'Peer trade quantities/cash mismatch');
}
export function validateSocietyPayload(payload){
  fields(payload,['day','actors','agents','communalGold']);integer(payload.day,1);integer(payload.communalGold);validateActorPayload(payload.actors);
  requireCondition(payload.actors.day===payload.day,'Society/Actor day mismatch');denseArray(payload.agents,3);requireCondition(payload.agents.length===3,'Missing personal daily accounts');
  for(const [i,a] of payload.agents.entries()){
    fields(a,['actorId','decision','currentGoal','goalOutcome','privateFood','wallet','inventory','ledger','trade']);
    requireCondition(a.actorId==='actor-'+(i+1) && ['ongoing','completed','failed','idle'].includes(a.goalOutcome),'Invalid person daily identity/outcome');
    integer(a.privateFood);integer(a.wallet);requireCondition(a.privateFood<=1,'Invalid private consumption');fields(a.inventory,['food','herbs']);integer(a.inventory.food);integer(a.inventory.herbs);
    fields(a.trade,TRADE_FIELDS);for(const n of Object.values(a.trade))integer(n);
  }
}

export function validateSocietyHistory(snapshot,events){
  validateSocietyWorld(snapshot.world);denseArray(events,MAX_RESOURCE_DAYS*4+MAX_COLLECTION);
  requireCondition(snapshot.nextEntityId===4,'Society Actor counter mismatch');const receipts=snapshot.commandReceipts,rng=createRng(snapshot.rng.seed);
  let expected=createSocietyWorld(snapshot.world.societyModel.config),eventIndex=0;
  const external=Object.entries(receipts).filter(([,r])=>r.input.type!=='SocietyAction').map(([commandId,r])=>({commandId,...r}));
  let nextInternalSeq=external.length+snapshot.pendingCommands.length+1;const seen=new Set();
  const operations=[...external.map(r=>({tick:r.input.targetTick,receipt:r})),...Array.from({length:snapshot.world.societyModel.day},(_,i)=>({tick:(i+1)*144}))];
  operations.sort((a,b)=>a.tick-b.tick || (a.receipt?0:1)-(b.receipt?0:1) || (a.receipt?.inputSeq??0)-(b.receipt?.inputSeq??0));
  const expectFact=(fact,tick)=>{const event=events[eventIndex++];requireCondition(event,'Missing Society fact');const {eventSeq,schemaVersion,...actual}=event;
    requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'Society history disagrees with plans/order/actions/rules');};
  for(const op of operations){
    if(op.receipt){const r=op.receipt;requireCondition(['RemovePopulation','SetTradeRoute'].includes(r.input.type) && !r.commandId.startsWith('society-day-'),'External command claimed internal source');
      const result=applySocietyCommand(expected,{type:r.input.type,payload:r.input.payload});expected=result.world;
      requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'Society external command mismatch');
      if(result.success)expectFact(marketCommandFact({commandId:r.commandId,type:r.input.type},result.result),op.tick);seen.add(r.commandId);
    }else{
      const plan=planSocietyDay(expected);expected=plan.world;
      for(const command of plan.commands){const r=receipts[command.commandId];requireCondition(r && !seen.has(command.commandId),'Missing or duplicate Society intent receipt');
        const input={type:command.type,targetTick:command.targetTick,payload:command.payload};
        requireCondition(r.inputSeq===nextInternalSeq++ && canonicalJson(r.input)===canonicalJson(input) && r.fingerprint===inputFingerprint(input),'Society intent provenance/inputSeq mismatch');
        const result=applySocietyAction(expected,command.payload,command.payload.action==='Hunt'?rng.next():null);expected=result.world;
        requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'Society committed outcome mismatch');
        if(result.success)expectFact(societyActionFact(command,result.result),op.tick);seen.add(command.commandId);}
      const result=settleSocietyDay(expected,rng.next());expected=result.world;
      expectFact({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,causationEventSeqs:societyCauses(events.slice(0,eventIndex)),entityIds:[],payload:result.payload},op.tick);
    }
  }
  requireCondition(seen.size===Object.keys(receipts).length && nextInternalSeq===snapshot.nextInputSeq,'Unclaimed/forged Society receipts');
  requireCondition(eventIndex===events.length && canonicalJson(expected)===canonicalJson(snapshot.world),'Society final world/history mismatch');
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Society RNG history mismatch');
}
