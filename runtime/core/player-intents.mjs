import { PLAY_RULES,playerIntentDuration,canPlayerIntent,applyPlayerAction,playerActionFact,playerDayFact } from './player-state.mjs';
import { defaultPlayerConfig } from './player-runtime.mjs';
import { createMemoryWorld,validateMemoryWorld,prepareMemoryDay,planMemoryDay,applyMemoryAction,settleMemorySocietyDay,finishMemoryDay } from './memory-runtime.mjs';
import { societyActionFact,societyCauses } from './society.mjs';
import { createRng } from './rng.mjs';
import { createSimulationSession } from './command-engine.mjs';
import { validateBundle } from './world-state.mjs';
import { playerPlaySystems } from '../fixtures/player-play-village.mjs';
import { cloneData,fields,record,integer,canonicalJson,inputFingerprint,requireCondition,denseArray,MAX_COLLECTION,put } from './data-contract.mjs';
export { PLAY_RULES };
export function defaultPlayerPlayConfig(){const c=defaultPlayerConfig();c.version='memory-config-v4';c.society.version='society-config-v3';c.society.actors.version='actor-config-v3';return c;}
function audit(bundle){validateBundle(bundle,{rulesVersion:PLAY_RULES,systems:playerPlaySystems()});}
export function enqueuePlayerIntent(bundle,raw){
 audit(bundle);const durationTicks=playerIntentDuration(raw),intent=cloneData(raw),s=bundle.snapshot;
 requireCondition(!Object.hasOwn(s.commandReceipts,intent.commandId) && !s.pendingCommands.some(c=>c.commandId===intent.commandId),'Player ID already registered','COMMAND_ID_CONFLICT');
 requireCondition(s.pendingCommands.length===0,'Another player action is in progress','RULE_REJECTED');
 requireCondition(canPlayerIntent(s.world,intent),'Player intent cannot start','RULE_REJECTED');
 requireCondition(s.tick<=Number.MAX_SAFE_INTEGER-durationTicks && s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Player time/input overflow','LIMIT_EXCEEDED');
 requireCondition(Object.keys(s.commandReceipts).length<MAX_COLLECTION && s.pendingCommands.length<MAX_COLLECTION,'Player input budget exceeded','LIMIT_EXCEEDED');
 const next=cloneData(bundle),{commandId,type,payload}=intent;
 next.snapshot.pendingCommands.push({commandId,inputSeq:next.snapshot.nextInputSeq++,targetTick:s.tick+durationTicks,type:'PlayerAction',payload:{startTick:s.tick,intent:{type,payload}}});
 audit(next);return {bundle:next,durationTicks};
}
export function executePlayerIntent(bundle,intent){
 const queued=enqueuePlayerIntent(bundle,intent),session=createSimulationSession(queued.bundle,playerPlaySystems());session.advanceTicks(queued.durationTicks);
 const next=session.getBundle(),r=next.snapshot.commandReceipts[intent.commandId];requireCondition(r,'Missing player completion receipt');
 return {bundle:next,durationTicks:queued.durationTicks,outcome:r.status,result:cloneData(r.result)};
}
export function describePlayerActions(bundle){
 audit(bundle);const w=bundle.snapshot.world,a=w.actorModel.actors[3];
 return {travelTicks:12,restTicks:6,tradeTicks:1,maxQuantity:10,locations:['village','forest'],
 prices:Object.fromEntries(['food','herbs'].map(id=>[id,{buy:w.marketModel.prices[id],sell:Math.max(1,Math.floor(w.marketModel.prices[id]/2))}])),canTrade:a.alive && a.location==='village'};
}
// Reconstruct dynamic registration before claiming receipts. Player intent admission
// occurs after the already committed tick; completion is before that tick's NPC/day.
export function validatePlayRuntimeHistory(snapshot,events){
 validateMemoryWorld(snapshot.world);denseArray(events,140000);const receipts=snapshot.commandReceipts,pending=snapshot.pendingCommands;
 const entries=[...Object.entries(receipts).filter(([,r])=>r.input.type==='PlayerAction').map(([commandId,r])=>({commandId,inputSeq:r.inputSeq,...r.input,receipt:r})),...pending];
 denseArray(entries,MAX_COLLECTION);const operations=[];
 for(const e of entries){
  requireCondition(e.type==='PlayerAction' && !e.commandId.startsWith('society-day-'),'Unknown play external command');
  const duration=playerIntentDuration({commandId:e.commandId,...e.payload.intent});integer(e.payload.startTick);
  requireCondition(e.targetTick===e.payload.startTick+duration && e.payload.startTick<=snapshot.tick,'Player admission/completion time mismatch');
  operations.push({tick:e.payload.startTick,phase:2,entry:e});if(e.receipt)operations.push({tick:e.targetTick,phase:0,entry:e});
 }
 for(let day=1;day<=snapshot.world.memoryModel.day;day++)operations.push({tick:day*144,phase:1});
 operations.sort((a,b)=>a.tick-b.tick || a.phase-b.phase || (a.entry?.inputSeq??0)-(b.entry?.inputSeq??0));
 let world=createMemoryWorld(snapshot.world.memoryModel.config),index=0,nextSeq=1,registered=[];const rng=createRng(snapshot.rng.seed),seen=new Set();
 const expect=(fact,tick)=>{const e=events[index++];requireCondition(e,'Missing play fact');const {eventSeq,schemaVersion,...actual}=e;
  requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'Play history disagrees with inputs/rules');};
 for(const op of operations){const e=op.entry;
  if(op.phase===2){
   requireCondition(registered.length===0 && e.inputSeq===nextSeq++ && canPlayerIntent(world,{commandId:e.commandId,...e.payload.intent}),'Player registration/eligibility/sequence mismatch');
   const {receipt,...input}=e;registered.push(input);
  }else if(op.phase===0){
   requireCondition(registered.length===1 && registered[0].commandId===e.commandId,'Missing/overlapping player admission');registered=[];
   const r=e.receipt,applied=applyPlayerAction(world,e);world=applied.world;
   requireCondition(r.fingerprint===inputFingerprint(r.input) && r.status===(applied.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(applied.result),'Player receipt/actual outcome mismatch');
   if(applied.success)expect(playerActionFact(e,applied.result),op.tick);seen.add(e.commandId);
  }else{
   const prepared=prepareMemoryDay(world,op.tick);world=prepared.world;prepared.facts.forEach(f=>expect(f,op.tick));
   const plan=planMemoryDay(world);world=plan.world;
   for(const c of plan.commands){const r=receipts[c.commandId],input={type:c.type,payload:c.payload,targetTick:c.targetTick};
    requireCondition(r && !seen.has(c.commandId) && r.inputSeq===nextSeq++ && r.fingerprint===inputFingerprint(input) && canonicalJson(r.input)===canonicalJson(input),'Play NPC dynamic input sequence/intent mismatch');
    const applied=applyMemoryAction(world,c.payload,c.payload.action==='Hunt'?rng.next():null);world=applied.world;
    requireCondition(r.status===(applied.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(applied.result),'Play NPC receipt mismatch');
    if(applied.success)expect(societyActionFact(c,applied.result),op.tick);seen.add(c.commandId);
   }
   const day=settleMemorySocietyDay(world,rng.next());world=day.world;
   expect({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:societyCauses(events.slice(0,index)),payload:day.payload},op.tick);
   expect(playerDayFact(world,day.payload),op.tick);const memory=finishMemoryDay(world,events.slice(0,index),op.tick);world=memory.world;expect(memory.fact,op.tick);
  }
 }
 requireCondition(index===events.length && seen.size===Object.keys(receipts).length && nextSeq===snapshot.nextInputSeq,'Unclaimed play fact/input/receipt');
 requireCondition(canonicalJson(registered)===canonicalJson(pending),'Play pending registration mismatch');
 requireCondition(canonicalJson(world)===canonicalJson(snapshot.world) && canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Play final identity/assets/observation/RNG mismatch');
}
