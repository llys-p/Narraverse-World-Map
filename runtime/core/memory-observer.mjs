// C4 pure projection/retention over committed Society and announcement facts.
// This module does not authenticate a bundle or replace the engine's full replay audit.
import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition,payloadBudget } from './data-contract.mjs';
import { validateSocietyActionResult,validateSocietyPayload } from './society.mjs';
import { MAX_PERSISTENT_ACTORS } from './actors.mjs';
import { MAX_RESOURCE_DAYS } from './resource-ledger.mjs';
import { validateMedicineAnnouncement } from './public-medicine.mjs';

export const MAX_ACTOR_MEMORIES=32;
export const MEMORY_OBSERVER_VERSION='memory-observer-v1';
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
  }else if(['MedicalRequestAnnounced','MedicineOfferAnnounced'].includes(event.type)){
    const {schemaVersion,eventSeq,tick,...fact}=event;validateMedicineAnnouncement(fact);
    requireCondition(event.tick<=event.payload.expiresTick,'Announcement already expired at occurrence');
  }
}

export function projectActorEvent(raw,actorId){
  identifier(actorId);checkEvent(raw);const event=cloneData(raw),p=event.payload;
  if(['MedicalRequestAnnounced','MedicineOfferAnnounced'].includes(event.type))return [entry(event,actorId,'public',0,{type:event.type,...cloneData(p)})];
  if(event.type==='SocietyActionCommitted'){
    if(!event.entityIds.includes(actorId))return [];
    if(p.action==='SellMedicine')return [entry(event,actorId,'interaction',2,{type:'medicine-trade',sellerId:p.actorId,buyerId:p.buyerId,
      herbs:1,price:p.price,cashDelta:actorId===p.actorId?p.price:-p.price})];
    // Deliberately omit before/after balances and any nested action receipt.
    return [entry(event,actorId,'self',1,{type:'own-action',actorId,action:p.action,goalId:p.goalId})];
  }
  if(event.type!=='SocietyDaySettled')return [];
  const row=p.actors.rows.find(a=>a.actorId===actorId),account=p.agents.find(a=>a.actorId===actorId);
  if(!row || !account)return [];
  const market=p.actors.market,resources=market.ecology.resources.entries;
  return [entry(event,actorId,'public',0,{type:'village-market',food:resources.find(e=>e.resource==='food').closing,
    herbs:resources.find(e=>e.resource==='herbs').closing,prices:{food:market.prices.food.current,herbs:market.prices.herbs.current},
    routeOpen:market.routeOpen,alive:p.actors.populationClosing.totalAlive}),
  entry(event,actorId,'self',1,{type:'own-day',actorId,alive:row.closing.alive,health:row.closing.health,hunger:row.closing.hunger,
    fatigue:row.closing.fatigue,privateFood:account.privateFood,wallet:account.wallet,inventory:cloneData(account.inventory),
    currentGoal:cloneData(account.currentGoal),goalOutcome:account.goalOutcome})];
}

export function createMemoryState(initialActors){
  denseArray(initialActors,MAX_PERSISTENT_ACTORS);requireCondition(initialActors.length>0,'Empty memory roster');const ids=new Set();
  for(const a of initialActors){fields(a,['actorId','alive']);identifier(a.actorId);requireCondition(typeof a.alive==='boolean' && !ids.has(a.actorId),'Invalid/duplicate memory identity');ids.add(a.actorId);}
  const actors=cloneData(initialActors).sort((a,b)=>byId(a.actorId,b.actorId));
  return {version:MEMORY_OBSERVER_VERSION,initialActors:actors,cursor:0,lastObservedTick:0,
    actors:actors.map(a=>({...a,memories:[],relationships:[]}))};
}

export function validateMemoryState(state){
  fields(state,['version','initialActors','cursor','lastObservedTick','actors']);
  requireCondition(state.version===MEMORY_OBSERVER_VERSION,'Unknown memory observer version','UNSUPPORTED_VERSION');integer(state.cursor);integer(state.lastObservedTick);
  requireCondition(state.cursor<=EVENT_LIMIT,'Memory cursor exceeds event budget','LIMIT_EXCEEDED');
  const initial=createMemoryState(state.initialActors);requireCondition(canonicalJson(initial.initialActors)===canonicalJson(state.initialActors),'Unordered memory roster');
  denseArray(state.actors,MAX_PERSISTENT_ACTORS);requireCondition(state.actors.length===initial.actors.length,'Missing memory identity');
  for(const [i,a] of state.actors.entries()){
    fields(a,['actorId','alive','memories','relationships']);requireCondition(a.actorId===initial.actors[i].actorId && typeof a.alive==='boolean','Memory identity mismatch');
    denseArray(a.memories,MAX_ACTOR_MEMORIES);let previous=null;
    for(const m of a.memories){
      fields(m,['memoryId','sourceEventSeq','occurrenceTick','observedTick','channel','importance','observable']);identifier(m.memoryId);
      integer(m.sourceEventSeq,1);integer(m.occurrenceTick);integer(m.observedTick);integer(m.importance);
      requireCondition(['self','public','interaction'].includes(m.channel) && m.importance===({public:0,self:1,interaction:2})[m.channel], 'Memory channel/importance mismatch');
      requireCondition(m.sourceEventSeq<=state.cursor && m.occurrenceTick<=m.observedTick && m.observedTick<=state.lastObservedTick,'Memory time/reference mismatch');
      requireCondition(previous===null || chronological(previous,m)<0,'Duplicate/unordered memories');previous=m;record(m.observable);payloadBudget(m.observable);
    }
    denseArray(a.relationships,MAX_PERSISTENT_ACTORS);let peer=null;
    for(const r of a.relationships){fields(r,['actorId','trust','lastSourceEventSeq']);identifier(r.actorId);integer(r.trust);integer(r.lastSourceEventSeq,1);
      requireCondition(r.actorId!==a.actorId && initial.actors.some(p=>p.actorId===r.actorId) && r.trust<=1000 && r.lastSourceEventSeq<=state.cursor &&
        (peer===null || byId(peer,r.actorId)<0),'Invalid relation identity/trust/source');peer=r.actorId;}
  }
}

function sourceLog(events,observedTick){
  denseArray(events,EVENT_LIMIT);let tick=0;const commands=new Set();
  for(const [i,e] of events.entries()){
    checkEvent(e);requireCondition(e.eventSeq===i+1 && e.tick>=tick && e.tick<=observedTick,'Disordered/future memory source');tick=e.tick;
    if(e.type==='SocietyActionCommitted'){
      requireCondition(!commands.has(e.commandId) && e.tick===e.payload.day*144,'Repeated/off-clock personal source');commands.add(e.commandId);
    }
  }
}
function consume(state,events,observedTick){
  for(let i=state.cursor;i<events.length;i++){
    const event=events[i];
    for(const a of state.actors){
      if(!a.alive)continue;
      const projections=projectActorEvent(event,a.actorId);
      for(const p of projections){
        a.memories.push({...p,observedTick});
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
  const prefix=events.slice(0,state.cursor);sourceLog(prefix,state.lastObservedTick);
  const expected=consume(createMemoryState(state.initialActors),prefix,state.lastObservedTick);
  const withoutTimes=s=>s.actors.map(a=>({...a,memories:a.memories.map(({observedTick,...m})=>m)}));
  requireCondition(canonicalJson(withoutTimes(state))===canonicalJson(withoutTimes(expected)),'Memory projection/retention/relation source mismatch');
}

export function advanceActorMemory(state,events,observedTick){
  integer(observedTick);validateMemoryHistory(state,events);requireCondition(observedTick>=state.lastObservedTick,'Observation time moved backward');
  sourceLog(events,observedTick);
  if(events.length===state.cursor)return cloneData(state);
  const result=consume(cloneData(state),events,observedTick);validateMemoryState(result);return result;
}

// Read-only observer result, not the complete C4 buildActorKnowledge interface.
export function buildObservedMemory(state,actorId){
  identifier(actorId);validateMemoryState(state);const actor=state.actors.find(a=>a.actorId===actorId);
  requireCondition(actor,'Unknown memory identity');return cloneData(actor);
}
