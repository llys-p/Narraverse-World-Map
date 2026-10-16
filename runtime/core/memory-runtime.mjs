import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition,inputFingerprint } from './data-contract.mjs';
import { defaultSocietyConfig,createSocietyWorld,inspectSocietyConfiguration,validateSocietyWorld,planSocietyDay,applySocietyAction,applySocietyCommand,settleSocietyDay,societyActionFact,societyCauses } from './society.mjs';
import { createMemoryState,validateMemoryState,reduceMemoryFacts } from './memory-observer.mjs';
import { createMedicineAnnouncements,validateMedicineAnnouncement,selectPublicMedicineBuyer } from './public-medicine.mjs';
import { createRng } from './rng.mjs';
import { marketCommandFact } from './market.mjs';
import { validatePersonalities,neutralPersonalities } from './personality.mjs';
import { PLAYER_RULES,PLAY_RULES,playerDayFact } from './player-state.mjs';
import { validatePlayRuntimeHistory } from './player-intents.mjs';

export const MEMORY_RULES='c-memory-v1';
export const PERSONALITY_RULES='c-personality-v1';
export const MEMORY_RULE_VERSIONS=Object.freeze([MEMORY_RULES,PERSONALITY_RULES,PLAYER_RULES,PLAY_RULES]);
export const isMemoryRules=version=>MEMORY_RULE_VERSIONS.includes(version);
const SOCIETY_FIELDS=['resources','resourceModel','ecologyModel','marketModel','actorModel','societyModel'];
const society=w=>Object.fromEntries([...SOCIETY_FIELDS,...(w.playerModel?['playerModel']:[])].map(k=>[k,w[k]]));
const own=(w,id)=>w.societyModel.agents.find(a=>a.state.actorId===id);
function increment(object,key){requireCondition(object[key]<Number.MAX_SAFE_INTEGER,'Memory goal counter overflow','LIMIT_EXCEEDED');object[key]++;}
export function defaultMemoryConfig(){return {version:'memory-config-v1',society:defaultSocietyConfig(),discountEnabled:true};}
export function defaultPersonalityConfig(){return {...defaultMemoryConfig(),version:'memory-config-v2',personalities:neutralPersonalities()};}
// memory-config-v5 carries the play profile forward from v4: same fields, society-config-v4 and player-state-v2.
// D4A-CP1b: memory-config-v6 is the gift profile. It keeps the play fields and is the only memory
// version that pairs with society-config-v5 (player-state-v3) and memory-observer-v3.
const MEMORY_VERSIONS=['memory-config-v1','memory-config-v2','memory-config-v3','memory-config-v4','memory-config-v5','memory-config-v6'];
const isPlayConfig=version=>version==='memory-config-v4' || version==='memory-config-v5';
const isGiftConfig=version=>version==='memory-config-v6';
const isLocatedConfig=version=>isPlayConfig(version) || isGiftConfig(version);
const isPlayerConfig=version=>version==='memory-config-v3' || isLocatedConfig(version);
const societyVersionOf=version=>isGiftConfig(version)?'society-config-v5':version==='memory-config-v5'?'society-config-v4':version==='memory-config-v4'?'society-config-v3':version==='memory-config-v3'?'society-config-v2':'society-config-v1';
const observerVersionOf=version=>isGiftConfig(version)?'memory-observer-v3':isPlayConfig(version)?'memory-observer-v2':'memory-observer-v1';
function validateConfig(config,buildWorld=true){
  record(config);requireCondition(MEMORY_VERSIONS.includes(config.version),'Unknown memory configuration','UNSUPPORTED_VERSION');
  fields(config,['version','society','discountEnabled',...(config.version!=='memory-config-v1'?['personalities']:[])]);
  record(config.society);
  requireCondition(config.society.version===societyVersionOf(config.version),'Memory/Society version mismatch','UNSUPPORTED_VERSION');
  if(config.version!=='memory-config-v1')validatePersonalities(config.personalities);
  requireCondition(typeof config.discountEnabled==='boolean','Invalid memory discount policy');return buildWorld?createSocietyWorld(config.society):inspectSocietyConfiguration(config.society);}
export function createMemoryWorld(config=defaultMemoryConfig()){
  const world=validateConfig(config),copy=cloneData(config);
  return {...world,memoryModel:{config:copy,configFingerprint:canonicalJson(copy),day:0,
    observer:createMemoryState(world.actorModel.actors.map(a=>({actorId:a.actorId,alive:a.alive,...(isLocatedConfig(copy.version)?{location:a.location}:{})})),observerVersionOf(copy.version)),announcements:[],waitingActorId:null,waitingOutcome:null}};
}
export function validateMemoryWorld(world){
  record(world);record(world.memoryModel);record(world.memoryModel.config);
  fields(world,[...SOCIETY_FIELDS,'memoryModel',...(isPlayerConfig(world.memoryModel.config.version)?['playerModel']:[])]);validateSocietyWorld(society(world));const m=world.memoryModel;
  fields(m,['config','configFingerprint','day','observer','announcements','waitingActorId','waitingOutcome']);const initial=validateConfig(m.config,false);
  requireCondition(m.configFingerprint===canonicalJson(m.config) && canonicalJson(m.config.society)===canonicalJson(world.societyModel.config),'Memory/Society configuration mismatch');
  integer(m.day);requireCondition(m.day===world.societyModel.day,'Memory day mismatch');validateMemoryState(m.observer);
  const play=isLocatedConfig(m.config.version),version=observerVersionOf(m.config.version);
  requireCondition(m.observer.version===version && canonicalJson(m.observer.initialActors)===canonicalJson(createMemoryState(initial.actors.map(a=>({actorId:a.actorId,alive:a.alive,...(play?{location:a.location}:{})})),version).initialActors),'Memory initial identity/version mismatch');
  denseArray(m.announcements,6);const seen=new Set();
  for(const f of m.announcements){validateMedicineAnnouncement(f);const key=f.type+'-'+f.payload.actorId;
    requireCondition(!seen.has(key) && world.actorModel.actors.some(a=>a.actorId===f.payload.actorId) &&
      [m.day*144,(m.day+1)*144].includes(f.payload.expiresTick),'Invalid duplicate/foreign/stale announcement');seen.add(key);}
  requireCondition(m.waitingActorId===null || ['actor-1','actor-2'].includes(m.waitingActorId),'Unknown waiting identity');
  requireCondition([null,'delivered','failed'].includes(m.waitingOutcome) && (m.waitingActorId!==null || m.waitingOutcome===null),'Invalid waiting outcome');
}
function publicSelection(world){
  const m=world.memoryModel,relations=m.observer.actors.find(a=>a.actorId==='actor-3').relationships;
  const selected=selectPublicMedicineBuyer(m.announcements,'actor-3',relations,{postedPrice:world.marketModel.prices.herbs,
    maxPrice:world.marketModel.config.products.herbs.maxPrice,markup:world.societyModel.config.saleMarkup,discountEnabled:m.config.discountEnabled},(m.day+1)*144);
  return {buyerId:selected?.actorId??null,price:selected?.price??null};
}
export function prepareMemoryDay(input,tick){
  validateMemoryWorld(input);const world=cloneData(input),facts=createMedicineAnnouncements(society(world),tick);
  world.memoryModel.announcements=cloneData(facts);world.memoryModel.waitingActorId=null;world.memoryModel.waitingOutcome=null;
  return {world,facts};
}
export function planMemoryDay(input){
  validateMemoryWorld(input);const selection=publicSelection(input),plan=planSocietyDay(society(input),selection,input.memoryModel.config.personalities);
  const world={...plan.world,memoryModel:cloneData(input.memoryModel)},sale=plan.commands.find(c=>c.payload.action==='SellMedicine');
  if(sale){
    const id=sale.payload.targetActorId,state=own(world,id).state,known=world.memoryModel.observer.actors.find(a=>a.actorId===id);
    const trust=known.relationships.find(r=>r.actorId==='actor-3')?.trust??0;
    const acceptable=world.resources.herbs===0 || selection.price<=world.marketModel.prices.herbs;
    if(trust>=20 && state.wallet>=selection.price && state.inventory.herbs===0 && state.currentGoal?.kind==='recover-health' && acceptable){
      if(state.lastDecision.blocked)state.currentGoal.failures--;
      state.currentGoal.step='wait';state.lastDecision.action='Rest';state.lastDecision.blocked=false;
      const command=plan.commands.find(c=>c.payload.actorId===id);command.payload.action='Rest';
      world.memoryModel.waitingActorId=id;
    }
  }
  validateMemoryWorld(world);return {world,commands:plan.commands};
}
export function applyMemoryAction(input,payload,sample=null){
  validateMemoryWorld(input);const result=applySocietyAction(society(input),payload,sample,publicSelection(input));
  return {...result,world:{...result.world,memoryModel:cloneData(input.memoryModel)}};
}
export function applyMemoryCommand(input,command){
  validateMemoryWorld(input);const result=applySocietyCommand(society(input),command);
  return {...result,world:{...result.world,memoryModel:cloneData(input.memoryModel)}};
}
export function settleMemorySocietyDay(input,sample){
  validateMemoryWorld(input);const world=cloneData(input),m=world.memoryModel;
  if(m.waitingActorId!==null){
    // lastSaleDay belongs to the seller. A waiting buyer started without medicine
    // and performs Rest; only the one selected seller can deliver this herb today.
    const buyer=own(world,m.waitingActorId),seller=own(world,'actor-3');
    m.waitingOutcome=seller.trade.lastSaleDay===m.day+1 && buyer.state.inventory.herbs>0?'delivered':'failed';
    if(m.waitingOutcome==='failed' && buyer.state.currentGoal)increment(buyer.state.currentGoal,'failures');
  }
  const result=settleSocietyDay(society(world),sample);m.day++;
  return {world:{...result.world,memoryModel:m},payload:result.payload};
}
// A scene command observes its newly committed suffix immediately. Existing observation times stay sealed.
export function observeSceneCommand(world,events,tick){
 requireCondition(world.memoryModel.config.version==='memory-config-v6'&&world.memoryModel.observer.version==='memory-observer-v3','Scene observation version mismatch','UNSUPPORTED_VERSION');
 const m=world.memoryModel;
 m.observer=reduceMemoryFacts(m.observer,events.slice(m.observer.cursor),tick);
 return world;
}
export function finishMemoryDay(input,events,tick){
  validateMemoryWorld(input);integer(tick,1);requireCondition(tick===input.memoryModel.day*144,'Memory closing clock mismatch');
  const world=cloneData(input),m=world.memoryModel,oldCursor=m.observer.cursor;
  const newFacts=events.slice(oldCursor);
  m.observer=reduceMemoryFacts(m.observer,newFacts,tick);
  const causes=newFacts.filter(e=>['MedicalRequestAnnounced','MedicineOfferAnnounced','SocietyActionCommitted','SocietyDaySettled'].includes(e.type)).map(e=>e.eventSeq);
  validateMemoryWorld(world);
  return {world,fact:{type:'MemoryDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:causes,
    payload:{day:m.day,observer:cloneData(m.observer),waitingActorId:m.waitingActorId,waitingOutcome:m.waitingOutcome}}};
}

export function validateMemoryDayPayload(payload){
  fields(payload,['day','observer','waitingActorId','waitingOutcome']);integer(payload.day,1);validateMemoryState(payload.observer);
  requireCondition(payload.observer.lastObservedTick===payload.day*144 && (payload.waitingActorId===null || ['actor-1','actor-2'].includes(payload.waitingActorId)) &&
    [null,'delivered','failed'].includes(payload.waitingOutcome) && (payload.waitingActorId!==null || payload.waitingOutcome===null),'Invalid memory closing payload');
}

// Complete C4 rule replay. Snapshot envelope, event schema and receipt references
// are additionally checked by world-state/event-log at public engine/save entries.
export function validateMemoryRuntimeHistory(snapshot,events){
  if(snapshot.rulesVersion===PLAY_RULES)return validatePlayRuntimeHistory(snapshot,events);
  validateMemoryWorld(snapshot.world);denseArray(events,140000);let expected=createMemoryWorld(snapshot.world.memoryModel.config),eventIndex=0;
  const rng=createRng(snapshot.rng.seed),receipts=snapshot.commandReceipts,seen=new Set();
  const external=Object.entries(receipts).filter(([,r])=>r.input.type!=='SocietyAction').map(([commandId,r])=>({commandId,...r}));
  let nextInternalSeq=external.length+snapshot.pendingCommands.length+1;
  const operations=[...external.map(r=>({tick:r.input.targetTick,receipt:r})),...Array.from({length:snapshot.world.memoryModel.day},(_,i)=>({tick:(i+1)*144}))];
  operations.sort((a,b)=>a.tick-b.tick || (a.receipt?0:1)-(b.receipt?0:1) || (a.receipt?.inputSeq??0)-(b.receipt?.inputSeq??0));
  const expectFact=(fact,tick)=>{
    const event=events[eventIndex++];requireCondition(event,'Missing C4 fact');const {eventSeq,schemaVersion,...actual}=event;
    requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'C4 history disagrees with announcement/knowledge/plan/rules');
  };
  for(const op of operations){
    if(op.receipt){
      const r=op.receipt;requireCondition(['RemovePopulation','SetTradeRoute'].includes(r.input.type) && !r.commandId.startsWith('society-day-'),'C4 external command claimed internal source');
      const result=applyMemoryCommand(expected,{type:r.input.type,payload:r.input.payload});expected=result.world;
      requireCondition(r.status===(result.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(result.result),'C4 external outcome mismatch');
      if(result.success)expectFact(marketCommandFact({commandId:r.commandId,type:r.input.type},result.result),op.tick);seen.add(r.commandId);
    }else{
      const prepared=prepareMemoryDay(expected,op.tick);expected=prepared.world;prepared.facts.forEach(f=>expectFact(f,op.tick));
      const planned=planMemoryDay(expected);expected=planned.world;
      for(const command of planned.commands){
        const r=receipts[command.commandId];requireCondition(r && !seen.has(command.commandId),'Missing/duplicate C4 internal receipt');
        const input={type:command.type,targetTick:command.targetTick,payload:command.payload};
        requireCondition(r.inputSeq===nextInternalSeq++ && r.fingerprint===inputFingerprint(input) && canonicalJson(r.input)===canonicalJson(input),'C4 intent/knowledge/inputSeq mismatch');
        const action=applyMemoryAction(expected,command.payload,command.payload.action==='Hunt'?rng.next():null);expected=action.world;
        requireCondition(r.status===(action.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(action.result),'C4 action/quote outcome mismatch');
        if(action.success)expectFact(societyActionFact(command,action.result),op.tick);seen.add(command.commandId);
      }
      const daily=settleMemorySocietyDay(expected,rng.next());expected=daily.world;
      expectFact({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:societyCauses(events.slice(0,eventIndex)),payload:daily.payload},op.tick);
      if(snapshot.rulesVersion===PLAYER_RULES)expectFact(playerDayFact(expected,daily.payload),op.tick);
      const memory=finishMemoryDay(expected,events.slice(0,eventIndex),op.tick);expected=memory.world;expectFact(memory.fact,op.tick);
    }
  }
  requireCondition(eventIndex===events.length && seen.size===Object.keys(receipts).length && nextInternalSeq===snapshot.nextInputSeq,'Unclaimed C4 fact/receipt/input counter');
  requireCondition(canonicalJson(expected)===canonicalJson(snapshot.world) && canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'C4 final memory/relationship/assets/RNG mismatch');
}
