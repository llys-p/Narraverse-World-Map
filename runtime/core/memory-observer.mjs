// C4 pure projection/retention over committed Society and announcement facts.
// This module does not authenticate a bundle or replace the engine's full replay audit.
import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition,payloadBudget } from './data-contract.mjs';
import { validateSocietyActionResult,validateSocietyPayload } from './society.mjs';
import { MAX_PERSISTENT_ACTORS } from './actors.mjs';
import { MAX_RESOURCE_DAYS } from './resource-ledger.mjs';
import { validateMedicineAnnouncement } from './public-medicine.mjs';
import { validatePlayerDayPayload,validatePlayerActionResult } from './player-state.mjs';

export const MAX_ACTOR_MEMORIES=32;
export const MEMORY_OBSERVER_VERSION='memory-observer-v1';
// D4A-CP1b: memory-observer-v3 is the gift profile. It keeps every v2 meaning (location/travel
// and the old projections) and additionally consumes FoodGiftCommitted; v1/v2 never see it.
const OBSERVER_VERSIONS=['memory-observer-v1','memory-observer-v2','memory-observer-v3'];
const isLocatedObserver=version=>version!=='memory-observer-v1';
const FOOD_GIFT_FIELDS=['donorId','recipientId','product','quantity','location','donorFoodBefore','donorFoodAfter','recipientFoodBefore','recipientFoodAfter'];
const EVENT_LIMIT=MAX_RESOURCE_DAYS*4+100000;
const byId=(a,b)=>a<b?-1:a>b?1:0;
const chronological=(a,b)=>a.sourceEventSeq-b.sourceEventSeq || byId(a.memoryId,b.memoryId);
const entry=(event,actorId,channel,importance,observable)=>({memoryId:'memory-'+event.eventSeq+'-'+actorId+'-'+channel,
  sourceEventSeq:event.eventSeq,occurrenceTick:event.tick,channel,importance,observable});

function checkEvent(event){
  fields(event,['schemaVersion','eventSeq','tick','type','sourceSystem','commandId','causationEventSeqs','entityIds','payload']);
  requireCondition(event.schemaVersion===1,'Unsupported memory source schema','UNSUPPORTED_VERSION');
  integer(event.eventSeq,1);integer(event.tick);identifier(event.type);identifier(event.sourceSystem);
  if(event.commandId!==null)identifier(event.commandId);
  denseArray(event.causationEventSeqs,EVENT_LIMIT);for(const seq of event.causationEventSeqs){integer(seq,1);requireCondition(seq<event.eventSeq,'Future memory causation');}
  denseArray(event.entityIds,MAX_PERSISTENT_ACTORS);event.entityIds.forEach(identifier);record(event.payload);payloadBudget(event.payload);
  if(event.type==='SocietyActionCommitted'){
    requireCondition(event.sourceSystem==='command-engine' && event.commandId!==null && event.causationEventSeqs.length===0,'Invalid personal source');
    validateSocietyActionResult(event.payload);
    const ids=event.payload.action==='SellMedicine'?[event.payload.actorId,event.payload.buyerId]:[event.payload.actorId];
    requireCondition(canonicalJson(ids)===canonicalJson(event.entityIds),'Personal source identity mismatch');
  }else if(event.type==='SocietyDaySettled'){
    requireCondition(event.sourceSystem==='society' && event.commandId===null && event.entityIds.length===0,'Invalid daily source');
    validateSocietyPayload(event.payload);requireCondition(event.tick===event.payload.day*144,'Daily source clock mismatch');
  }else if(event.type==='PlayerDaySettled'){
    requireCondition(event.sourceSystem==='society' && event.commandId===null && event.entityIds.length===0 && event.causationEventSeqs.length===0,'Invalid player source');
    validatePlayerDayPayload(event.payload);requireCondition(event.tick===event.payload.day*144,'Player daily clock mismatch');
  }else if(event.type==='PlayerActionCommitted'){
    requireCondition(event.sourceSystem==='command-engine' && event.commandId!==null && event.entityIds.length===1 && event.entityIds[0]==='actor-4' && event.causationEventSeqs.length===0,'Invalid player action source');
    validatePlayerActionResult(event.payload);requireCondition(event.tick===event.payload.endTick,'Player action source clock mismatch');
  }else if(event.type==='FoodGiftCommitted'){
    validateFoodGiftSource(event);
  }else if(['MedicalRequestAnnounced','MedicineOfferAnnounced'].includes(event.type)){
    const {schemaVersion,eventSeq,tick,...fact}=event;validateMedicineAnnouncement(fact);
    requireCondition(event.tick<=event.payload.expiresTick,'Announcement already expired at occurrence');
  }
}

// D4A-CP1b: strict provenance/field/transfer audit of a committed food gift. checkEvent audits the
// structure for every observer version; the v3 gate that admits such a source lives in sourceLog,
// so v1/v2 reducers/advancement reject it before any projection can reach an old profile.
function validateFoodGiftSource(event){
  requireCondition(event.sourceSystem==='scene' && event.commandId!==null && event.causationEventSeqs.length===0,'Invalid gift source');
  const p=event.payload;fields(p,FOOD_GIFT_FIELDS);
  identifier(p.donorId);identifier(p.recipientId);identifier(p.product);identifier(p.location);
  requireCondition(event.entityIds.length===2 && event.entityIds[0]===p.donorId && event.entityIds[1]===p.recipientId,'Gift source identity mismatch');
  requireCondition(p.donorId==='actor-4' && p.recipientId==='actor-2','Unknown food gift participants');
  requireCondition(p.product==='food' && p.quantity===1 && p.location==='village','Food gift outside contract');
  for(const key of ['donorFoodBefore','donorFoodAfter','recipientFoodBefore','recipientFoodAfter'])integer(p[key]);
  requireCondition(p.donorFoodAfter===p.donorFoodBefore-1 && p.recipientFoodAfter===p.recipientFoodBefore+1,'Food gift transfer does not reconcile');
  requireCondition(p.recipientFoodBefore<1000 && p.recipientFoodAfter<=1000,'Food gift recipient capacity exceeded');
}

// Keep the original public three-argument projection; profile dispatch stays internal.
export function projectActorEvent(raw,actorId,location='village'){
  return projectVersionedActorEvent(raw,actorId,location,MEMORY_OBSERVER_VERSION);
}
function projectVersionedActorEvent(raw,actorId,location,version){
  identifier(actorId);requireCondition(OBSERVER_VERSIONS.includes(version),'Unknown observer version','UNSUPPORTED_VERSION');checkEvent(raw);
  const event=cloneData(raw),p=event.payload;
  // D4A-CP1b: the gift projection is the donor's/recipient's own view only, channel self / importance 1.
  // Old callers pass no version and default to v1, so they keep their old [] output verbatim.
  if(event.type==='FoodGiftCommitted'){
    if(version!=='memory-observer-v3')return [];
    if(actorId!==p.donorId && actorId!==p.recipientId)return [];
    const direction=actorId===p.donorId?'given':'received';
    return [entry(event,actorId,'self',1,{type:'food-gift',donorId:p.donorId,recipientId:p.recipientId,
      product:p.product,quantity:p.quantity,direction,commandId:event.commandId})];
  }
  if(['MedicalRequestAnnounced','MedicineOfferAnnounced'].includes(event.type))return location==='forest'?[]:[entry(event,actorId,'public',0,{type:event.type,...cloneData(p)})];
  if(event.type==='PlayerActionCommitted')return actorId==='actor-4'?[entry(event,actorId,'self',1,{...cloneData(p),action:p.type,type:'player-action'})]:[];
  if(event.type==='SocietyActionCommitted'){
    if(!event.entityIds.includes(actorId))return [];
    if(p.action==='SellMedicine')return [entry(event,actorId,'interaction',2,{type:'medicine-trade',sellerId:p.actorId,buyerId:p.buyerId,
      herbs:1,price:p.price,cashDelta:actorId===p.actorId?p.price:-p.price})];
    // Deliberately omit before/after balances and any nested action receipt.
    return [entry(event,actorId,'self',1,{type:'own-action',actorId,action:p.action,goalId:p.goalId})];
  }
  if(event.type==='PlayerDaySettled')return actorId===p.actorId?[entry(event,actorId,'self',1,{type:'player-day',actorId,privateFood:p.privateFood,wallet:p.wallet,inventory:cloneData(p.inventory)})]:[];
  if(event.type!=='SocietyDaySettled')return [];
  const row=p.actors.rows.find(a=>a.actorId===actorId),account=p.agents.find(a=>a.actorId===actorId);
  if(!row)return [];
  const market=p.actors.market,resources=market.ecology.resources.entries;
  return [...(location==='forest'?[]:[entry(event,actorId,'public',0,{type:'village-market',food:resources.find(e=>e.resource==='food').closing,
    herbs:resources.find(e=>e.resource==='herbs').closing,prices:{food:market.prices.food.current,herbs:market.prices.herbs.current},
    routeOpen:market.routeOpen,alive:p.actors.populationClosing.totalAlive})]),
  ...(account?[entry(event,actorId,'self',1,{type:'own-day',actorId,alive:row.closing.alive,health:row.closing.health,hunger:row.closing.hunger,
    fatigue:row.closing.fatigue,privateFood:account.privateFood,wallet:account.wallet,inventory:cloneData(account.inventory),
    currentGoal:cloneData(account.currentGoal),goalOutcome:account.goalOutcome})]:[])];
}

export function createMemoryState(initialActors,version=MEMORY_OBSERVER_VERSION){
  requireCondition(OBSERVER_VERSIONS.includes(version),'Unknown observer version','UNSUPPORTED_VERSION');const play=isLocatedObserver(version);
  denseArray(initialActors,MAX_PERSISTENT_ACTORS);requireCondition(initialActors.length>0,'Empty memory roster');const ids=new Set();
  for(const a of initialActors){fields(a,['actorId','alive',...(play?['location']:[])]);identifier(a.actorId);requireCondition(typeof a.alive==='boolean' && !ids.has(a.actorId),'Invalid/duplicate memory identity');if(play)requireCondition(a.location==='village','Unknown initial observer location');ids.add(a.actorId);}
  // D4A-CP1b: the gift profile projects both gift participants, so both must be on the roster.
  if(version==='memory-observer-v3'){
    for(const id of ['actor-2','actor-4'])requireCondition(ids.has(id),'Food gift roster is missing a participant');
  }
  const actors=cloneData(initialActors).sort((a,b)=>byId(a.actorId,b.actorId));
  return {version,initialActors:actors,cursor:0,lastObservedTick:0,
    actors:actors.map(a=>({...a,memories:[],relationships:[]}))};
}

export function validateMemoryState(state){
  fields(state,['version','initialActors','cursor','lastObservedTick','actors']);
  requireCondition(OBSERVER_VERSIONS.includes(state.version),'Unknown memory observer version','UNSUPPORTED_VERSION');const play=isLocatedObserver(state.version);integer(state.cursor);integer(state.lastObservedTick);
  requireCondition(state.cursor<=EVENT_LIMIT,'Memory cursor exceeds event budget','LIMIT_EXCEEDED');
  const initial=createMemoryState(state.initialActors,state.version);requireCondition(canonicalJson(initial.initialActors)===canonicalJson(state.initialActors),'Unordered memory roster');
  denseArray(state.actors,MAX_PERSISTENT_ACTORS);requireCondition(state.actors.length===initial.actors.length,'Missing memory identity');
  for(const [i,a] of state.actors.entries()){
    fields(a,['actorId','alive','memories','relationships',...(play?['location']:[])]);requireCondition(a.actorId===initial.actors[i].actorId && typeof a.alive==='boolean','Memory identity mismatch');
    if(play)requireCondition(a.actorId==='actor-4'?['village','forest'].includes(a.location):a.location==='village','Memory location mismatch');
    denseArray(a.memories,MAX_ACTOR_MEMORIES);let previous=null;
    for(const m of a.memories){
      fields(m,['memoryId','sourceEventSeq','occurrenceTick','observedTick','channel','importance','observable']);identifier(m.memoryId);
      integer(m.sourceEventSeq,1);integer(m.occurrenceTick);integer(m.observedTick);integer(m.importance);
      requireCondition(['self','public','interaction'].includes(m.channel) && m.importance===({public:0,self:1,interaction:2})[m.channel], 'Memory channel/importance mismatch');
      requireCondition(m.sourceEventSeq<=state.cursor && m.occurrenceTick<=m.observedTick && m.observedTick<=state.lastObservedTick,'Memory time/reference mismatch');
      requireCondition(previous===null || chronological(previous,m)<0,'Duplicate/unordered memories');previous=m;record(m.observable);payloadBudget(m.observable);
      if(m.observable.type==='food-gift'){
        const gift=m.observable;fields(gift,['type','donorId','recipientId','product','quantity','direction','commandId']);identifier(gift.commandId);
        requireCondition(state.version==='memory-observer-v3' && m.channel==='self' && m.observedTick===m.occurrenceTick &&
          gift.donorId==='actor-4' && gift.recipientId==='actor-2' && gift.product==='food' && gift.quantity===1 &&
          ((a.actorId===gift.donorId && gift.direction==='given') || (a.actorId===gift.recipientId && gift.direction==='received')),'Invalid immediate food gift memory');
      }
    }
    denseArray(a.relationships,MAX_PERSISTENT_ACTORS);let peer=null;
    for(const r of a.relationships){fields(r,['actorId','trust','lastSourceEventSeq']);identifier(r.actorId);integer(r.trust);integer(r.lastSourceEventSeq,1);
      requireCondition(r.actorId!==a.actorId && initial.actors.some(p=>p.actorId===r.actorId) && r.trust<=1000 && r.lastSourceEventSeq<=state.cursor &&
        (peer===null || byId(peer,r.actorId)<0),'Invalid relation identity/trust/source');peer=r.actorId;}
  }
}

function sourceLog(events,observedTick,offset=0,initialActors=[],version=MEMORY_OBSERVER_VERSION){
  denseArray(events,EVENT_LIMIT);let tick=0;const commands=new Set();
  for(const [i,e] of events.entries()){
    checkEvent(e);requireCondition(e.eventSeq===offset+i+1 && e.tick>=tick && e.tick<=observedTick,'Disordered/future memory source');tick=e.tick;
    if(e.type==='PlayerDaySettled')requireCondition(initialActors.some(a=>a.actorId===e.payload.actorId),'Player daily fact references unregistered observer identity');
    if(e.type==='PlayerActionCommitted')requireCondition(isLocatedObserver(version) && initialActors.some(a=>a.actorId==='actor-4'),'Player action outside observer version/roster');
    if(e.type==='SocietyActionCommitted'){
      requireCondition(!commands.has(e.commandId) && e.tick===e.payload.day*144,'Repeated/off-clock personal source');commands.add(e.commandId);
    }
    if(e.type==='FoodGiftCommitted'){
      requireCondition(version==='memory-observer-v3','Food gift outside observer version');
      requireCondition(!commands.has(e.commandId),'Repeated food gift source');commands.add(e.commandId);
    }
  }
}
function consume(state,events,observedTick,startIndex=state.cursor){
  for(let i=startIndex;i<events.length;i++){
    const event=events[i];
    if(event.type==='FoodGiftCommitted'){
      const participants=[event.payload.donorId,event.payload.recipientId].map(id=>state.actors.find(a=>a.actorId===id));
      requireCondition(participants.every(a=>a && a.alive && a.location==='village'),'Food gift contradicts observer life/location');
    }
    for(const a of state.actors){
      if(!a.alive)continue;
      // D4A-CP1b: narrow internal version dispatch. Old callers keep the v1 default and their old output.
      const projections=projectVersionedActorEvent(event,a.actorId,a.location??'village',state.version);
      for(const p of projections){
        a.memories.push({...p,observedTick:event.type==='FoodGiftCommitted'?event.tick:observedTick});
        if(p.channel==='interaction'){
          const peer=p.observable.sellerId===a.actorId?p.observable.buyerId:p.observable.sellerId;
          requireCondition(state.actors.some(r=>r.actorId===peer),'Transaction references unknown memory identity');
          let r=a.relationships.find(r=>r.actorId===peer);
          if(!r){r={actorId:peer,trust:0,lastSourceEventSeq:event.eventSeq};a.relationships.push(r);}
          r.trust=Math.min(1000,r.trust+10);r.lastSourceEventSeq=event.eventSeq;a.relationships.sort((a,b)=>byId(a.actorId,b.actorId));
        }
      }
      while(a.memories.length>MAX_ACTOR_MEMORIES){
        const discard=[...a.memories].sort((a,b)=>a.importance-b.importance || chronological(a,b))[0];
        a.memories.splice(a.memories.indexOf(discard),1);
      }
      a.memories.sort(chronological);
      if(isLocatedObserver(state.version) && event.type==='PlayerActionCommitted' && a.actorId==='actor-4'){
        requireCondition(a.location===event.payload.before.location,'Travel observer source location mismatch');a.location=event.payload.after.location;
      }
      if(event.type==='SocietyDaySettled'){
        const row=event.payload.actors.rows.find(r=>r.actorId===a.actorId);if(row)a.alive=row.closing.alive;
      }
    }
    state.cursor=event.eventSeq;
  }
  state.lastObservedTick=observedTick;return state;
}

// Structural/projection audit of a standalone observer. Authoritative C4 save audit
// must additionally replay the original roster and observation ticks from the engine.
export function validateMemoryHistory(state,events){
  validateMemoryState(state);denseArray(events,EVENT_LIMIT);requireCondition(state.cursor<=events.length,'Memory cursor lacks source');
  const prefix=events.slice(0,state.cursor);sourceLog(prefix,state.lastObservedTick,0,state.initialActors,state.version);
  const expected=consume(createMemoryState(state.initialActors,state.version),prefix,state.lastObservedTick);
  const withoutTimes=s=>s.actors.map(a=>({...a,memories:a.memories.map(({observedTick,...m})=>m)}));
  requireCondition(canonicalJson(withoutTimes(state))===canonicalJson(withoutTimes(expected)),'Memory projection/retention/relation source mismatch');
}

export function advanceActorMemory(state,events,observedTick){
  integer(observedTick);validateMemoryHistory(state,events);requireCondition(observedTick>=state.lastObservedTick,'Observation time moved backward');
  sourceLog(events,observedTick,0,state.initialActors,state.version);
  if(events.length===state.cursor)return cloneData(state);
  const result=consume(cloneData(state),events,observedTick);validateMemoryState(result);return result;
}

// Pure domain transition over new facts only. It validates the suffix and bounded
// state, but does not authenticate their past. Runtime entry/save audits replay
// from the original roster; the engine verifies each complete candidate state.
// Call advanceActorMemory for an independent observer supplied with a full log.
export function reduceMemoryFacts(state,newFacts,observedTick){
  integer(observedTick);validateMemoryState(state);denseArray(newFacts,EVENT_LIMIT-state.cursor);
  requireCondition(observedTick>=state.lastObservedTick,'Observation time moved backward');
  sourceLog(newFacts,observedTick,state.cursor,state.initialActors,state.version);
  if(newFacts.length===0)return cloneData(state);
  const result=consume(cloneData(state),newFacts,observedTick,0);validateMemoryState(result);return result;
}

// Read-only observer result, not the complete C4 buildActorKnowledge interface.
export function buildObservedMemory(state,actorId){
  identifier(actorId);validateMemoryState(state);const actor=state.actors.find(a=>a.actorId===actorId);
  requireCondition(actor,'Unknown memory identity');return cloneData(actor);
}
