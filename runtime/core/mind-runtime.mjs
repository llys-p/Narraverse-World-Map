// M1 mind runtime: world/planning/day transition for the narrow recover-health strategy,
// engine hooks (stimuli/day flow/facts) and the complete replay audit. The mind never
// reuses the old planners' outputs for its two actors; real actions still execute along
// the original society ledger through the authoritative applySocietyAction path.
import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition,inputFingerprint,MAX_COLLECTION } from './data-contract.mjs';
import { createMemoryWorld,validateMemoryWorld,prepareMemoryDay,settleMemorySocietyDay,finishMemoryDay } from './memory-runtime.mjs';
import { planSocietyDay,applySocietyAction,applySocietyCommand,societyActionFact,societyCauses } from './society.mjs';
import { projectActorEvent } from './memory-observer.mjs';
import { createRng } from './rng.mjs';
import { playerIntentDuration,canPlayerIntent,applyPlayerAction,playerActionFact,playerDayFact } from './player-state.mjs';
import { createSimulationSession } from './command-engine.mjs';
import { validateBundle } from './world-state.mjs';
import { decisionPhaseKnowledge } from '../knowledge/mind-knowledge.mjs';
import { planMindDecision } from './mind-planner.mjs';
import { MIND_RULES,MIND_ACTOR_IDS,MAX_MIND_OBSERVATIONS,
  validateMindConfig,createMindModel,validateMindModel,validateObservation,validateDecision,validateOutcome,
  observationExpiryTick } from './mind-state.mjs';
import { mindSystems } from '../fixtures/mind-village.mjs';

const SOCIETY_KEYS=['resources','resourceModel','ecologyModel','marketModel','actorModel','societyModel','playerModel'];
const societyProject=w=>{const base={};for(const k of SOCIETY_KEYS)base[k]=w[k];return base;};

export { MIND_RULES };

export function createMindWorld(memoryConfig,mindConfig){
  record(memoryConfig);record(mindConfig);
  requireCondition(memoryConfig.version==='memory-config-v4','Mind requires the play memory configuration','UNSUPPORTED_VERSION');
  const economics=memoryConfig.society.economics;
  requireCondition(economics.deadlineDays===20 && economics.maxFailures===3 && economics.cooldownDays===2,
    'Mind goal economics are frozen for this experiment','UNSUPPORTED_VERSION');
  validateMindConfig(mindConfig);
  const world=createMemoryWorld(memoryConfig);
  requireCondition(mindConfig.actorIds.every(id=>world.actorModel.actors.some(a=>a.actorId===id)),'Mind roster is not registered in the village');
  return {...world,mindModel:createMindModel(mindConfig)};
}

export function validateMindWorld(world,sealed=true){
  record(world);
  requireCondition(typeof sealed==='boolean','Invalid mind world seal mode');
  requireCondition(world.memoryModel?.config?.version==='memory-config-v4','Mind requires the play memory world','UNSUPPORTED_VERSION');
  const {mindModel,...base}=world;validateMemoryWorld(base);
  validateMindModel(mindModel,sealed);
  requireCondition(mindModel.config.actorIds.every(id=>base.actorModel.actors.some(a=>a.actorId===id)),'Mind bodies are missing');
  for(const id of MIND_ACTOR_IDS){
    const estate=base.societyModel.agents.find(a=>a.state.actorId===id);
    requireCondition(estate,'Missing mind estate');
    requireCondition(estate.state.config.deadlineDays===20 && estate.state.config.maxFailures===3 && estate.state.config.cooldownDays===2,
      'Mind estate economics must stay frozen');
  }
  return world;
}

export function pushMindObservation(world,actorId,observation){
  validateObservation(observation);
  const entry=world.mindModel?.actors.find(a=>a.actorId===actorId);
  requireCondition(entry,'Unknown mind observer identity');
  requireCondition(!entry.observations.some(o=>o.sourceEventSeq===observation.sourceEventSeq),'Duplicate mind observation');
  entry.observations.push(cloneData(observation));
  while(entry.observations.length>MAX_MIND_OBSERVATIONS)entry.observations.shift();
  return world;
}

// Shared by the engine and by authoritative replay: one pending script stimulus either
// produces a delivered observation or an unavailability record. scriptCursor advances
// either way; nothing is retried.
function mindStimulusDelivery(world,stimulus,tick){
  const listener=world.actorModel.actors.find(a=>a.actorId===stimulus.listenerId);
  let delivered=false,available=null;
  if(stimulus.kind==='statement'){
    const speaker=world.actorModel.actors.find(a=>a.actorId===stimulus.speakerId);
    delivered=!!(speaker&&speaker.alive&&speaker.location==='village'&&listener&&listener.alive&&listener.location==='village');
    if(delivered)available=stimulus.available;
  }else{
    delivered=!!(listener&&listener.alive&&listener.location==='village');
    if(delivered)available=world.resources.herbs>0;
  }
  const fact={type:'MindStimulusResolved',sourceSystem:'mind',commandId:null,causationEventSeqs:[],
    entityIds:[stimulus.listenerId],payload:{stimulusId:stimulus.stimulusId,kind:stimulus.kind,
      speakerId:stimulus.kind==='statement'?stimulus.speakerId:null,listenerId:stimulus.listenerId,
      status:delivered?'delivered':'unavailable',available}};
  const observation=delivered?{sourceEventSeq:null,occurrenceTick:tick,observedTick:tick,channel:stimulus.kind,
    sourceActorId:stimulus.kind==='statement'?stimulus.speakerId:null,available,
    confidencePermille:stimulus.kind==='statement'?600:900,expiresTick:observationExpiryTick(tick)}:null;
  return {fact,observation};
}

export function applyMindStimuliTick(world,tick,append){
  validateMindWorld(world);const m=world.mindModel;
  while(m.scriptCursor<m.config.stimuli.length && m.config.stimuli[m.scriptCursor].tick===tick){
    const stimulus=m.config.stimuli[m.scriptCursor];
    const delivery=mindStimulusDelivery(world,stimulus,tick);
    const seq=append(delivery.fact);
    m.scriptCursor++;
    if(delivery.observation)pushMindObservation(world,stimulus.listenerId,{...delivery.observation,sourceEventSeq:seq});
  }
  return world;
}

export function mindDecisionPlannedFact(decision){
  validateDecision(decision);
  return {type:'MindDecisionPlanned',sourceSystem:'mind',commandId:null,entityIds:[decision.actorId],
    causationEventSeqs:cloneData(decision.evidenceRefs),payload:cloneData(decision)};
}

export function mindResolvedOutcome(item,world){
  const {decision,command,selfHealth,receipt}=item;
  let outcome;
  if(receipt===null){
    outcome={decisionId:decision.decisionId,actorId:decision.actorId,commandId:null,status:'no-action',code:null,
      delta:{wallet:0,herbs:0,health:0},price:null};
  }else if(receipt.status==='rejected'){
    outcome={decisionId:decision.decisionId,actorId:decision.actorId,commandId:command.commandId,status:'rejected',
      code:'RULE_REJECTED',delta:{wallet:0,herbs:0,health:0},price:null};
  }else{
    const r=receipt.result,actor=world.actorModel.actors.find(a=>a.actorId===decision.actorId);
    requireCondition(actor,'Missing mind body');
    outcome={decisionId:decision.decisionId,actorId:decision.actorId,commandId:command.commandId,status:'succeeded',code:null,
      delta:{wallet:r.after.wallet-r.before.wallet,herbs:r.after.inventory.herbs-r.before.inventory.herbs,health:actor.health-selfHealth},
      price:decision.choice==='BuyMedicine'?r.price:null};
  }
  return validateOutcome(outcome);
}

export function mindResolvedFact(plannedSeq,outcome){
  integer(plannedSeq,1);
  return {type:'MindDecisionResolved',sourceSystem:'mind',commandId:outcome.commandId,entityIds:[outcome.actorId],
    causationEventSeqs:[plannedSeq],payload:cloneData(outcome)};
}

export function sealMindOutcome(world,outcome){
  const entry=world.mindModel.actors.find(a=>a.actorId===outcome.actorId);
  requireCondition(entry && entry.lastDecision && entry.lastDecision.decisionId===outcome.decisionId,'Mind outcome cites an unknown decision');
  entry.lastOutcome=cloneData(outcome);
  return world;
}

export function mindRejectionObservation(eventSeq,tick){
  integer(eventSeq,1);
  return {sourceEventSeq:eventSeq,occurrenceTick:tick,observedTick:tick,channel:'own-rejection',sourceActorId:null,
    available:null,confidencePermille:0,expiresTick:observationExpiryTick(tick)};
}

// §6.3 daily planning: real announcements first, then the chief keeps only its own old
// plan/state (the two minds never inherit the old planners' results), then the two minds
// each build their own decision-phase knowledge over the same candidate and plan once.
export function planMindDay(input,events,tick,simulationId){
  validateMindWorld(input);integer(tick,1);denseArray(events,140000);identifier(simulationId);
  requireCondition(tick===(input.societyModel.day+1)*144,'Mind planning is not on the next daily boundary');
  const world=cloneData(input),day=tick/144;
  const chiefPlan=planSocietyDay(societyProject(world),{buyerId:null,price:null},world.memoryModel.config.personalities);
  world.societyModel.agents[0].state=chiefPlan.world.societyModel.agents[0].state;
  world.societyModel.agents[0].trade=chiefPlan.world.societyModel.agents[0].trade;
  const chiefs=chiefPlan.commands.filter(c=>c.payload.actorId==='actor-1');
  const plans=[];
  for(const entry of world.mindModel.actors){
    const actorId=entry.actorId,actor=world.actorModel.actors.find(a=>a.actorId===actorId);
    const estate=world.societyModel.agents.find(a=>a.state.actorId===actorId);
    requireCondition(actor && estate,'Missing mind body/estate');
    estate.state.lastAction='None';estate.state.lastDecision=null;
    if(!actor.alive)continue;
    const knowledge=decisionPhaseKnowledge(world,events,actorId,tick,simulationId);
    const planned=planMindDecision(knowledge);
    if(planned.goal)planned.goal.step=planned.decision.choice==='UseMedicine'?'use':planned.decision.choice==='BuyMedicine'?'buy':'wait';
    estate.state.currentGoal=planned.goal?cloneData(planned.goal):null;
    estate.state.nextGoalId=planned.nextGoalId;
    entry.lastDecision=cloneData(planned.decision);
    // NoAction decisions commit no command and earn no rest: only real actions go through
    // the old society executor (the engine seals a no-action outcome from a null receipt).
    const payload=(planned.goal && planned.decision.choice!=='NoAction')?
      {actorId,goalId:planned.goal.goalId,action:planned.decision.choice,targetActorId:null}:null;
    const command=payload?{commandId:'mind-day-'+day+'-'+actorId,targetTick:tick,type:'SocietyAction',payload}:null;
    plans.push({actorId,decision:planned.decision,command,selfHealth:knowledge.self.health});
  }
  const {mindModel:tidyModel,...tidy}=world;validateMemoryWorld(tidy);validateMindConfig(tidyModel.config);
  for(const entry of tidyModel.actors){
    for(const o of entry.observations)validateObservation(o);
    if(entry.lastDecision!==null)validateDecision(entry.lastDecision);
  }
  return {world,chiefs,plans};
}

// Day-boundary announcements run exactly as in the old profile; the mind world is only
// projected down to its memory fields for the shared runtime and re-attached afterwards.
export function prepareMindDay(input,tick){
  validateMindWorld(input);const {mindModel,...base}=input;
  const prepared=prepareMemoryDay(base,tick);
  return {world:{...prepared.world,mindModel:cloneData(mindModel)},facts:prepared.facts};
}

export function settleMindSocietyDay(input,sample){
  validateMindWorld(input);const {mindModel,...base}=input;
  const result=settleMemorySocietyDay(base,sample);
  return {world:{...result.world,mindModel:cloneData(mindModel)},payload:result.payload};
}

export function finishMindMemoryDay(input,events,tick){
  validateMindWorld(input);const {mindModel,...base}=input;
  const result=finishMemoryDay(base,events,tick);
  return {world:{...result.world,mindModel:cloneData(mindModel)},fact:result.fact};
}

export function applyMindAction(input,payload,sample=null){
  validateMindWorld(input,false);
  const result=applySocietyAction(societyProject(input),payload,sample,null);
  return {world:{...result.world,memoryModel:cloneData(input.memoryModel),mindModel:cloneData(input.mindModel)},
    success:result.success,result:result.result};
}

export function applyMindCommand(input,command){
  validateMindWorld(input,false);
  const result=applySocietyCommand(societyProject(input),command);
  return {world:{...result.world,memoryModel:cloneData(input.memoryModel),mindModel:cloneData(input.mindModel)},
    success:result.success,result:result.result};
}

// §6.5 closing: after the settled daily fact the two still-living minds each observe the
// public closing stock once; the mind cursor advances to the last committed eventSeq.
export function finishMindDay(input,events,tick){
  validateMindWorld(input);integer(tick,1);denseArray(events,140000);
  requireCondition(events.length>0,'Mind closing lacks committed facts');
  const world=cloneData(input);
  const daily=events.findLast(e=>e.type==='SocietyDaySettled'&&e.tick===tick);
  requireCondition(daily,'Missing mind daily closing source');
  for(const entry of world.mindModel.actors){
    const actor=world.actorModel.actors.find(a=>a.actorId===entry.actorId);
    requireCondition(actor,'Missing mind body');
    if(!actor.alive)continue;
    const observable=projectActorEvent(daily,entry.actorId).find(p=>p.channel==='public');
    requireCondition(observable,'Missing visible public daily projection');
    pushMindObservation(world,entry.actorId,{sourceEventSeq:daily.eventSeq,occurrenceTick:daily.tick,observedTick:tick,
      channel:'daily-public',sourceActorId:null,available:observable.observable.herbs>0,confidencePermille:900,
      expiresTick:observationExpiryTick(tick)});
  }
  world.mindModel.cursor=events[events.length-1].eventSeq;
  validateMindWorld(world);
  return world;
}

function auditMindBundle(bundle){
  fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion===MIND_RULES,'Unknown mind player rules','UNSUPPORTED_VERSION');
  requireCondition(bundle.snapshot.fixtureId==='mind-village' && bundle.snapshot.fixtureVersion==='1','Unknown mind player profile','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion:MIND_RULES,systems:mindSystems()});
}

// Player adapter of the same shape as executePlayerIntent; the M bundle cannot be passed
// off as PLAY_RULES through the old audit, so registration/duration/effects are replayed
// under the mind profile and the reserved NPC command namespaces stay protected.
export function executeMindPlayerIntent(bundle,intent){
  auditMindBundle(bundle);
  requireCondition(!intent.commandId.startsWith('society-day-') && !intent.commandId.startsWith('mind-day-'),
    'Player command uses a reserved internal namespace');
  const durationTicks=playerIntentDuration(intent),s=bundle.snapshot;
  requireCondition(!Object.hasOwn(s.commandReceipts,intent.commandId) && !s.pendingCommands.some(c=>c.commandId===intent.commandId),'Player ID already registered','COMMAND_ID_CONFLICT');
  requireCondition(s.pendingCommands.length===0,'Another player action is in progress','RULE_REJECTED');
  requireCondition(canPlayerIntent(s.world,intent),'Player intent cannot start','RULE_REJECTED');
  requireCondition(s.tick<=Number.MAX_SAFE_INTEGER-durationTicks && s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Player time/input overflow','LIMIT_EXCEEDED');
  requireCondition(Object.keys(s.commandReceipts).length<MAX_COLLECTION && s.pendingCommands.length<MAX_COLLECTION,'Player input budget exceeded','LIMIT_EXCEEDED');
  const next=cloneData(bundle),{commandId,type,payload}=intent;
  next.snapshot.pendingCommands.push({commandId,inputSeq:next.snapshot.nextInputSeq++,targetTick:s.tick+durationTicks,
    type:'PlayerAction',payload:{startTick:s.tick,intent:{type,payload}}});
  auditMindBundle(next);
  const session=createSimulationSession(next,mindSystems());session.advanceTicks(durationTicks);
  const result=session.getBundle(),r=result.snapshot.commandReceipts[intent.commandId];
  requireCondition(r,'Missing player completion receipt');
  return {bundle:result,durationTicks,outcome:r.status,result:cloneData(r.result)};
}

export function describeMindPlayerActions(bundle){
  auditMindBundle(bundle);const w=bundle.snapshot.world,a=w.actorModel.actors[3];
  return {travelTicks:12,restTicks:6,tradeTicks:1,maxQuantity:10,locations:['village','forest'],
    prices:Object.fromEntries(['food','herbs'].map(id=>[id,{buy:w.marketModel.prices[id],sell:Math.max(1,Math.floor(w.marketModel.prices[id]/2))}])),
    canTrade:a.alive && a.location==='village'};
}

const codeOrder=(a,b)=>a<b?-1:a>b?1:0;

// Complete M1 replay from the initial memory config + mind config + seed. Player
// registrations/completions, stimuli, daily decisions, receipts and RNG are rebuilt in
// fixed (tick, phase) order; stored lastDecision values are never replayed as decisions.
export function validateMindRuntimeHistory(snapshot,events){
  validateMindWorld(snapshot.world);denseArray(events,140000);
  const receipts=snapshot.commandReceipts,pending=snapshot.pendingCommands;
  const entries=[...Object.entries(receipts).filter(([,r])=>r.input.type==='PlayerAction').map(([commandId,r])=>({commandId,inputSeq:r.inputSeq,...r.input,receipt:r})),...pending];
  denseArray(entries,MAX_COLLECTION);const operations=[];
  for(const e of entries){
    requireCondition(e.type==='PlayerAction' && !e.commandId.startsWith('society-day-') && !e.commandId.startsWith('mind-day-'),'Unknown mind external command');
    const duration=playerIntentDuration({commandId:e.commandId,...e.payload.intent});integer(e.payload.startTick);
    requireCondition(e.targetTick===e.payload.startTick+duration && e.payload.startTick<=snapshot.tick,'Player admission/completion time mismatch');
    operations.push({tick:e.payload.startTick,phase:3,entry:e});if(e.receipt)operations.push({tick:e.targetTick,phase:0,entry:e});
  }
  for(const stimulus of snapshot.world.mindModel.config.stimuli.slice(0,snapshot.world.mindModel.scriptCursor))
    operations.push({tick:stimulus.tick,phase:1,stimulus});
  for(let day=1;day<=snapshot.world.memoryModel.day;day++)operations.push({tick:day*144,phase:2});
  operations.sort((a,b)=>a.tick-b.tick || a.phase-b.phase || (a.entry?.inputSeq??0)-(b.entry?.inputSeq??0) || codeOrder(a.stimulus?.stimulusId??'',b.stimulus?.stimulusId??''));
  let world=createMindWorld(snapshot.world.memoryModel.config,snapshot.world.mindModel.config),index=0,nextSeq=1,registered=[];
  const rng=createRng(snapshot.rng.seed),seen=new Set();
  const expect=(fact,tick)=>{const e=events[index++];requireCondition(e,'Missing mind fact');const {eventSeq,schemaVersion,...actual}=e;
    requireCondition(canonicalJson(actual)===canonicalJson({...fact,tick}),'Mind history disagrees with inputs/rules');return index;};
  for(const op of operations){
    if(op.entry){
      if(op.phase===3){
        requireCondition(registered.length===0 && op.entry.inputSeq===nextSeq++ &&
          canPlayerIntent(world,{commandId:op.entry.commandId,...op.entry.payload.intent}),'Player registration/eligibility/sequence mismatch');
        const {receipt,...input}=op.entry;registered.push(input);
      }else{
        requireCondition(registered.length===1 && registered[0].commandId===op.entry.commandId,'Missing/overlapping player admission');registered=[];
        const r=op.entry.receipt,applied=applyPlayerAction(world,op.entry);world=applied.world;
        requireCondition(r.fingerprint===inputFingerprint(r.input) && r.status===(applied.success?'succeeded':'rejected') &&
          canonicalJson(r.result)===canonicalJson(applied.result),'Player receipt/actual outcome mismatch');
        if(applied.success)expect(playerActionFact(op.entry,applied.result),op.tick);seen.add(op.entry.commandId);
      }
      world.mindModel.cursor=index;
    }else if(op.phase===1){
      const delivery=mindStimulusDelivery(world,op.stimulus,op.tick);
      expect(delivery.fact,op.tick);
      world.mindModel.scriptCursor++;
      if(delivery.observation)pushMindObservation(world,op.stimulus.listenerId,{...delivery.observation,sourceEventSeq:index});
      world.mindModel.cursor=index;
    }else{
      const prepared=prepareMindDay(world,op.tick);world=prepared.world;
      prepared.facts.forEach(f=>expect(f,op.tick));
      const planned=planMindDay(world,events,op.tick,snapshot.simulationId);world=planned.world;
      const plannedSeqs=new Map();
      for(const p of planned.plans)plannedSeqs.set(p.actorId,expect(mindDecisionPlannedFact(p.decision),op.tick));
      const submits=[...planned.chiefs.map(command=>({actorId:null,command,decision:null,selfHealth:null})),
        ...planned.plans.map(p=>({actorId:p.actorId,command:p.command,decision:p.decision,selfHealth:p.selfHealth}))];
      for(const item of submits){
        if(item.command){
          const input={type:item.command.type,targetTick:item.command.targetTick,payload:item.command.payload};
          const r=receipts[item.command.commandId];
          requireCondition(r && !seen.has(item.command.commandId),'Missing or duplicate mind internal receipt');
          requireCondition(r.inputSeq===nextSeq++ && r.fingerprint===inputFingerprint(input) && canonicalJson(r.input)===canonicalJson(input),'Mind intent provenance/inputSeq mismatch');
          const applied=applyMindAction(world,item.command.payload,item.command.payload.action==='Hunt'?rng.next():null);world=applied.world;
          requireCondition(r.status===(applied.success?'succeeded':'rejected') && canonicalJson(r.result)===canonicalJson(applied.result),'Mind committed outcome mismatch');
          if(applied.success)expect(societyActionFact({commandId:item.command.commandId,...input},applied.result),op.tick);
          seen.add(item.command.commandId);
        }
        if(item.actorId!==null){
          const receipt=item.command?receipts[item.command.commandId]:null;
          const outcome=mindResolvedOutcome({decision:item.decision,command:item.command,selfHealth:item.selfHealth,receipt},world);
          expect(mindResolvedFact(plannedSeqs.get(item.actorId),outcome),op.tick);
          sealMindOutcome(world,outcome);
          if(item.decision.choice==='BuyMedicine'&&receipt&&receipt.status==='rejected')
            pushMindObservation(world,item.actorId,mindRejectionObservation(index,op.tick));
          world.mindModel.cursor=index;
        }
      }
      const daily=settleMindSocietyDay(world,rng.next());world=daily.world;
      expect({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:societyCauses(events.slice(0,index)),payload:daily.payload},op.tick);
      expect(playerDayFact(world,daily.payload),op.tick);
      const memory=finishMindMemoryDay(world,events.slice(0,index),op.tick);world=memory.world;expect(memory.fact,op.tick);
      world=finishMindDay(world,events.slice(0,index),op.tick);
    }
  }
  requireCondition(index===events.length && seen.size===Object.keys(receipts).length && nextSeq===snapshot.nextInputSeq,'Unclaimed mind fact/input/receipt');
  requireCondition(canonicalJson(registered)===canonicalJson(pending),'Mind pending registration mismatch');
  requireCondition(canonicalJson(world)===canonicalJson(snapshot.world),'Mind final identity/assets/observation mismatch');
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Mind RNG history mismatch');
}