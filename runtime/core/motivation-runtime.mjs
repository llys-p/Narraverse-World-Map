// M2-only integration. The exported hooks object is an engine/fixture connection,
// not a business API. Decision-phase Knowledge remains private to this module.
import {fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition,inputFingerprint,MAX_COLLECTION} from './data-contract.mjs';
import {createMindWorld,validateMindWorld,applyMindStimuliTick,prepareMindDay,settleMindSocietyDay,finishMindMemoryDay,finishMindDay,pushMindObservation,mindRejectionObservation} from './mind-runtime.mjs';
import {planSocietyDay,applySocietyAction,societyActionFact,societyCauses} from './society.mjs';
import {projectActorEvent} from './memory-observer.mjs';
import {deriveMindBelief,validateMindConfig} from './mind-state.mjs';
import {MOTIVATION_RULES,MOTIVATION_KNOWLEDGE_VERSION,MAX_MOTIVATION_KNOWLEDGE_BYTES,MAX_MOTIVATION_PLAN_TRANSITIONS,
  validateMotivationConfig,createMotivationModel,validateMotivationModel,validateMotivationDecision,validateMotivationOutcome} from './motivation-state.mjs';
import {planMotivationDecision} from './motivation-planner.mjs';
import {createRng} from './rng.mjs';
import {playerIntentDuration,canPlayerIntent,applyPlayerAction,playerActionFact,playerDayFact} from './player-state.mjs';
import {createSimulationSession} from './command-engine.mjs';
import {validateBundle} from './world-state.mjs';
import {motivationSystems} from '../fixtures/motivation-village.mjs';

const SOCIETY_KEYS=['resources','resourceModel','ecologyModel','marketModel','actorModel','societyModel','playerModel'];
const societyProject=w=>Object.fromEntries(SOCIETY_KEYS.map(k=>[k,w[k]]));
const agent=(w,id)=>w.societyModel.agents.find(a=>a.state.actorId===id).state;
const body=(w,id)=>w.actorModel.actors.find(a=>a.actorId===id);
const entryOf=(w,id)=>w.motivationModel.actors.find(a=>a.actorId===id);
const withoutMotivation=w=>{const {motivationModel,...base}=w;return base;};
const reserved=id=>['society-day-','mind-day-','motivation-day-'].some(p=>id.startsWith(p));

function validateInputs(memory,mind,motivation){
  record(mind);record(motivation);denseArray(mind.stimuli,64);denseArray(motivation.requests,64);
  const all=[...mind.stimuli,...motivation.requests];
  requireCondition(all.length<=64,'Combined motivation input budget exceeded','LIMIT_EXCEEDED');
  const counts=new Map();for(const input of all){const count=(counts.get(input.tick)??0)+1;
    requireCondition(count<=8,'Combined motivation per-tick input budget exceeded','LIMIT_EXCEEDED');counts.set(input.tick,count);}
  validateMindConfig(mind);validateMotivationConfig(motivation);
  const e=memory.society.economics;
  for(const [key,value] of Object.entries({wage:20,workFood:8,workFatigue:150,deadlineDays:20,maxFailures:3,cooldownDays:2}))
    requireCondition(e[key]===value,'Motivation economics are frozen','UNSUPPORTED_VERSION');
}

function createWorld(memory,mind,motivation){
  record(memory);record(mind);record(motivation);canonicalJson({memory,mind,motivation});
  validateInputs(memory,mind,motivation);
  return {...createMindWorld(memory,mind),motivationModel:createMotivationModel(motivation)};
}

export function validateMotivationWorld(world,sealed=true){
  record(world);requireCondition(typeof sealed==='boolean','Invalid motivation seal mode');
  canonicalJson(world);validateMindWorld(withoutMotivation(world),sealed);validateMotivationModel(world.motivationModel);
  const m=world.motivationModel;validateInputs(world.memoryModel.config,world.mindModel.config,m.config);
  for(const mind of world.mindModel.actors)requireCondition(mind.lastDecision===null&&mind.lastOutcome===null,'M2 mind stores observations only');
  for(const entry of m.actors){const state=agent(world,entry.actorId),actor=body(world,entry.actorId);
    requireCondition(actor&&state,'Missing motivation actor/estate');
    requireCondition(state.currentGoal===null||state.currentGoal.kind==='recover-health','Unexpected motivation canonical goal');
    if(sealed)requireCondition((entry.lastDecision===null)===(entry.lastOutcome===null),'Committed motivation decision has no outcome');
    requireCondition(!(entry.activePlan?.kind==='recover-health'&&entry.suspendedPlan!==null),'Motivation actor carries two health plans');
    if(entry.lastReviewedDutyId!==null){const index=m.config.requests.findIndex(r=>r.requestId===entry.lastReviewedDutyId),r=m.config.requests[index];
      requireCondition(index>=0&&index<m.requestCursor&&r.listenerId===entry.actorId&&r.urgencyPermille>=900,'Reviewed duty is not a consumed major request for this actor');}
    for(const plan of [entry.activePlan,entry.suspendedPlan])if(plan!==null){
      requireCondition(actor.alive,'Dead motivation actor retains a plan');
      if(plan.kind==='recover-health')requireCondition(state.currentGoal!==null&&plan.goalId===state.currentGoal.goalId&&plan.deadlineDay===state.currentGoal.deadlineDay,'Health plan references another goal');
      if(plan.kind==='aid-village')requireCondition(entry.lastDuty!==null&&entry.lastDuty.requestId===plan.requestId&&entry.lastDuty.status==='pending','Duty plan/request mismatch');
    }
    if(entry.lastDuty!==null){const d=entry.lastDuty,request=m.config.requests.find(r=>r.requestId===d.requestId);
      requireCondition(request&&m.config.requests.indexOf(request)<m.requestCursor&&request.listenerId===entry.actorId&&request.tick===d.observedTick&&request.expiresTick===d.expiresTick&&request.urgencyPermille===d.urgencyPermille,'Duty configuration/prefix mismatch');
      requireCondition(d.sourceEventSeq<=m.cursor,'Duty cites an unconsumed source');
      if(d.fulfilledTick!==null)requireCondition(d.fulfilledTick>=d.observedTick&&d.fulfilledTick<d.expiresTick,'Duty fulfilled outside its opportunity');
    }
  }
  return world;
}

// A frozen actor-local view; quotes come from previously published facts, never the
// hidden current public cash or another actor's execution results.
function decisionKnowledge(world,events,actorId,tick,simulationId){
  const actor=body(world,actorId),state=agent(world,actorId),entry=entryOf(world,actorId),mind=world.mindModel.actors.find(a=>a.actorId===actorId);
  const publicEvents=events.filter(e=>e.eventSeq<=world.mindModel.cursor&&e.type==='SocietyDaySettled'&&(actor.alive||e.tick<actor.deathTick));
  const last=publicEvents.at(-1),observable=last?projectActorEvent(last,actorId).find(p=>p.channel==='public').observable:null;
  const profile=world.motivationModel.config.profiles.find(p=>p.actorId===actorId);
  const knowledge={knowledgeVersion:MOTIVATION_KNOWLEDGE_VERSION,phase:'decision',simulationId,actorId,tick,revision:tick-1,
    self:{name:actor.name,occupation:actor.occupation,location:actor.location,alive:actor.alive,health:actor.health,hunger:actor.hunger,fatigue:actor.fatigue,
      wallet:state.wallet,inventory:cloneData(state.inventory),currentGoal:cloneData(state.currentGoal),nextGoalId:state.nextGoalId,cooldownUntilDay:state.cooldownUntilDay},
    quote:{product:'herbs',price:observable?observable.prices.herbs:world.marketModel.config.products.herbs.basePrice,observedTick:last?.tick??0,sourceEventSeq:last?.eventSeq??null},
    observations:cloneData(mind.observations),belief:deriveMindBelief(mind.observations,tick),
    profile:{dutyWeightPermille:profile.dutyWeightPermille,riskAversionPermille:profile.riskAversionPermille},duty:cloneData(entry.lastDuty),
    planState:{activePlan:cloneData(entry.activePlan),suspendedPlan:cloneData(entry.suspendedPlan),nextPlanId:entry.nextPlanId,lastReviewedDutyId:entry.lastReviewedDutyId}};
  requireCondition(new TextEncoder().encode(canonicalJson(knowledge)).length<=MAX_MOTIVATION_KNOWLEDGE_BYTES,'Motivation knowledge exceeds budget','LIMIT_EXCEEDED');
  return knowledge;
}

function transition(list,plan,fromStatus,toStatus,reasonCode){
  requireCondition(list.length<MAX_MOTIVATION_PLAN_TRANSITIONS,'Motivation transition budget exceeded','LIMIT_EXCEEDED');
  list.push({planId:plan.planId,kind:plan.kind,fromStatus,toStatus,reasonCode});
}
function cancel(entry,slot,reason,list){const plan=entry[slot];if(plan!==null){transition(list,plan,plan.status,'cancelled',reason);entry[slot]=null;}}
function facts(type,payload,causes=[],commandId=null){return {type,sourceSystem:'motivation',commandId,entityIds:[payload.actorId??payload.listenerId],causationEventSeqs:cloneData(causes),payload:cloneData(payload)};}
function setCursors(world,events){world.mindModel.cursor=events.length;world.motivationModel.cursor=events.length;}

function requestsTick(world,tick,append,context){
  const m=world.motivationModel;
  while(m.requestCursor<m.config.requests.length&&m.config.requests[m.requestCursor].tick===tick){
    const r=m.config.requests[m.requestCursor++],listener=body(world,r.listenerId),speaker=body(world,r.speakerId);
    const delivered=listener.alive&&speaker.alive&&listener.location==='village'&&speaker.location==='village';
    const seq=append(facts('MotivationRequestResolved',{requestId:r.requestId,speakerId:r.speakerId,listenerId:r.listenerId,
      urgencyPermille:r.urgencyPermille,expiresTick:r.expiresTick,status:delivered?'delivered':'unavailable'}));
    if(delivered){const entry=entryOf(world,r.listenerId),ctx=context.get(r.listenerId);ctx.requestSeqs.push(seq);
      entry.lastDuty={requestId:r.requestId,sourceEventSeq:seq,observedTick:tick,expiresTick:r.expiresTick,urgencyPermille:r.urgencyPermille,status:'pending',fulfilledTick:null};
      if(entry.activePlan?.kind==='aid-village'&&entry.activePlan.requestId!==r.requestId)cancel(entry,'activePlan','REQUEST_SUPERSEDED',ctx.transitions);
    }
  }
}

function proposalTransitions(before,after,tick,list){
  const allAfter=[after.activePlan,after.suspendedPlan].filter(Boolean);
  for(const old of [before.activePlan,before.suspendedPlan].filter(Boolean)){
    const next=allAfter.find(p=>p.planId===old.planId);
    if(!next){let reason=old.kind==='aid-village'?'REQUEST_EXPIRED':old.kind==='recover-rest'?'REQUEST_EXPIRED':'GOAL_FAILED';
      if(allAfter.some(p=>p.kind==='recover-health')&&old.kind!=='recover-health'&&tick<=old.deadlineDay*144)reason='POLICY_DEFERRED';
      transition(list,old,old.status,'cancelled',reason);
    }else if(canonicalJson(old)!==canonicalJson(next)){
      const reason=next.status==='suspended'?(after.activePlan?.kind==='aid-village'?'INTERRUPTED_DUTY':'INTERRUPTED_REST'):
        old.status==='suspended'?'RESUMED':old.status==='blocked'&&next.status==='ready'?'CONDITION_READY':'PRECONDITION_CHANGED';
      transition(list,next,old.status,next.status,reason);
    }
  }
  for(const next of allAfter)if(![before.activePlan,before.suspendedPlan].some(p=>p?.planId===next.planId))transition(list,next,null,next.status,'CREATED');
}

function beforeSystems(snapshot,events,tick,append,commit){
  const context=new Map(snapshot.world.motivationModel.actors.map(e=>[e.actorId,{transitions:[],requestSeqs:[],resolvedSeq:null,decisionId:null}]));
  applyMindStimuliTick(withoutMotivation(snapshot.world),tick,append);
  requestsTick(snapshot.world,tick,append,context);setCursors(snapshot.world,events);
  if(tick%144!==0)return context;
  const prepared=prepareMindDay(withoutMotivation(snapshot.world),tick);
  snapshot.world={...prepared.world,motivationModel:cloneData(snapshot.world.motivationModel)};
  for(const fact of prepared.facts)append(fact);setCursors(snapshot.world,events);
  const world=cloneData(snapshot.world),day=tick/144;
  const chief=planSocietyDay(societyProject(world),{buyerId:null,price:null},world.memoryModel.config.personalities);
  world.societyModel.agents[0]=chief.world.societyModel.agents[0];
  const plans=[];
  // Every proposal sees this same candidate; no proposed goal or execution result of
  // the other M2 actor has been applied when Knowledge is built.
  const proposals=[];
  for(const entry of world.motivationModel.actors){const state=agent(world,entry.actorId);state.lastAction='None';state.lastDecision=null;
    if(!body(world,entry.actorId).alive)continue;
    const knowledge=decisionKnowledge(world,events,entry.actorId,tick,snapshot.simulationId);
    proposals.push({entry,knowledge,priorPlan:cloneData(entry.activePlan),proposal:planMotivationDecision(knowledge)});
  }
  for(const {entry,knowledge,priorPlan,proposal} of proposals){const ctx=context.get(entry.actorId),state=agent(world,entry.actorId);
    proposalTransitions(entry,proposal,tick,ctx.transitions);
    state.currentGoal=cloneData(proposal.currentGoal);state.nextGoalId=proposal.nextGoalId;
    for(const key of ['activePlan','suspendedPlan','nextPlanId','lastReviewedDutyId'])entry[key]=cloneData(proposal[key]);
    entry.lastDecision=cloneData(proposal.decision);entry.lastOutcome=null;ctx.decisionId=proposal.decision.decisionId;
    const decision=proposal.decision,command=decision.choice==='NoAction'?null:{commandId:decision.decisionId,targetTick:tick,type:'SocietyAction',
      payload:{actorId:entry.actorId,goalId:decision.goalId??0,action:decision.choice,targetActorId:null}};
    plans.push({actorId:entry.actorId,decision,command,priorPlan,selfHealth:knowledge.self.health,selfFatigue:knowledge.self.fatigue});
  }
  snapshot.world=world;
  for(const item of plans)item.plannedSeq=append(facts('MotivationDecisionPlanned',item.decision,item.decision.evidenceRefs));
  for(const command of chief.commands.filter(c=>c.payload.actorId==='actor-1'))commit(command);
  for(const item of plans){const receipt=item.command?commit(item.command):null,entry=entryOf(snapshot.world,item.actorId),ctx=context.get(item.actorId);
    const outcome=resolvedOutcome(item,receipt,snapshot.world);ctx.resolvedSeq=append(facts('MotivationDecisionResolved',outcome,[item.plannedSeq],outcome.commandId));
    entry.lastOutcome=cloneData(outcome);
    if(item.decision.choice==='BuyMedicine'&&receipt?.status==='rejected')pushMindObservation(snapshot.world,item.actorId,mindRejectionObservation(ctx.resolvedSeq,tick));
    if(receipt&&entry.activePlan){const plan=entry.activePlan;
      requireCondition(plan.planId===item.decision.planId,'Outcome plan mismatch');
      if(receipt.status==='succeeded'){
        plan.stepIndex++;
        if(plan.stepIndex===plan.steps.length){
          transition(ctx.transitions,plan,plan.status,'completed',plan.kind==='aid-village'?'DUTY_FULFILLED':'PLAN_COMPLETED');entry.activePlan=null;
        }else transition(ctx.transitions,plan,plan.status,plan.status,'STEP_SUCCEEDED');
        if(plan.kind==='aid-village'){
          requireCondition(entry.lastDuty?.requestId===plan.requestId&&entry.lastDuty.status==='pending'&&tick<entry.lastDuty.expiresTick,'Work outcome cites the wrong request');
          entry.lastDuty.status='fulfilled';entry.lastDuty.fulfilledTick=tick;
        }
        if(plan.kind==='recover-health'&&agent(snapshot.world,item.actorId).currentGoal)agent(snapshot.world,item.actorId).currentGoal.step=item.decision.choice==='BuyMedicine'?'use':'wait';
      }else{
        const stillBlocked=item.priorPlan?.planId===plan.planId&&item.priorPlan.status==='blocked'&&
          canonicalJson(item.priorPlan)===canonicalJson({...plan,status:'blocked'});
        if(stillBlocked){
          // A soft-eligible retry rejected again by authority never actually left its
          // blocked state. Keep the outcome/failure ledger, omit a fictitious recovery.
          ctx.transitions=ctx.transitions.filter(t=>!(t.planId===plan.planId&&t.reasonCode==='CONDITION_READY'));
        }else if(plan.status!=='blocked')transition(ctx.transitions,plan,plan.status,'blocked','EXECUTION_REJECTED');
        plan.status='blocked';
      }
    }
    setCursors(snapshot.world,events);
  }
  return context;
}

function applyAction(input,payload,sample=null){
  validateMotivationWorld(input,false);
  const entry=entryOf(input,payload.actorId);
  if(entry){const d=entry.lastDecision,p=entry.activePlan;
    requireCondition(d&&p&&d.choice===payload.action&&p.steps[p.stepIndex]===payload.action&&d.planId===p.planId&&d.goalId===p.goalId&&d.actorId===payload.actorId&&payload.goalId===(d.goalId??0),'Motivation command/decision/plan binding mismatch');
    if(p.kind==='aid-village')requireCondition(entry.lastDuty?.status==='pending'&&p.requestId===entry.lastDuty.requestId&&d.candidates.find(c=>c.action==='WorkForPay').sourceRef===p.requestId&&d.tick<entry.lastDuty.expiresTick,'Motivation work request provenance mismatch');
  }
  const temporary=entry&&['aid-village','recover-rest'].includes(entry.activePlan.kind),projection=cloneData(societyProject(input));
  const goal=cloneData(agent(input,payload.actorId).currentGoal);
  if(temporary)agent(projection,payload.actorId).currentGoal=null;
  const result=applySocietyAction(projection,payload,sample,null);
  if(temporary)agent(result.world,payload.actorId).currentGoal=goal;
  return {...result,world:{...result.world,memoryModel:cloneData(input.memoryModel),mindModel:cloneData(input.mindModel),motivationModel:cloneData(input.motivationModel)}};
}

function resolvedOutcome(item,receipt,world){
  const {decision,command,selfHealth,selfFatigue}=item;
  const outcome={decisionId:decision.decisionId,actorId:decision.actorId,commandId:command?.commandId??null,status:receipt===null?'no-action':receipt.status,
    code:receipt?.status==='rejected'?'RULE_REJECTED':null,delta:{wallet:0,herbs:0,health:0,fatigue:0},price:null,publicFoodProduced:0,failureOwner:null};
  if(receipt?.status==='succeeded'){const r=receipt.result,a=body(world,decision.actorId);
    outcome.delta={wallet:r.after.wallet-r.before.wallet,herbs:r.after.inventory.herbs-r.before.inventory.herbs,health:a.health-selfHealth,fatigue:a.fatigue-selfFatigue};
    outcome.price=decision.choice==='BuyMedicine'?r.price:null;outcome.publicFoodProduced=decision.choice==='WorkForPay'?r.foodProduced:0;
  }else if(receipt?.status==='rejected')outcome.failureOwner={planId:decision.planId,goalId:decision.goalId};
  return validateMotivationOutcome(outcome);
}

function settleDay(input,sample){
  const result=settleMindSocietyDay(withoutMotivation(input),sample);
  return {...result,world:{...result.world,motivationModel:cloneData(input.motivationModel)}};
}

function afterSystems(snapshot,events,tick,append,context){
  if(tick%144===0){
    const daily=events.findLast(e=>e.type==='SocietyDaySettled'&&e.tick===tick);requireCondition(daily,'Missing motivation daily source');
    append(playerDayFact(snapshot.world,daily.payload));
    let base=withoutMotivation(snapshot.world);const memory=finishMindMemoryDay(base,events,tick);base=memory.world;append(memory.fact);
    base=finishMindDay(base,events,tick);snapshot.world={...base,motivationModel:cloneData(snapshot.world.motivationModel)};
  }
  for(const entry of snapshot.world.motivationModel.actors){const ctx=context.get(entry.actorId),a=body(snapshot.world,entry.actorId),state=agent(snapshot.world,entry.actorId);
    if(tick%144===0){for(const slot of ['activePlan','suspendedPlan']){
      const plan=entry[slot];if(plan===null)continue;
      if(!a.alive)cancel(entry,slot,'DEAD',ctx.transitions);
      else if(plan.kind==='recover-health'&&(state.currentGoal===null||state.currentGoal.goalId!==plan.goalId)){
        const daily=events.findLast(e=>e.type==='SocietyDaySettled'&&e.tick===tick);
        const reason=daily.payload.agents.find(g=>g.actorId===entry.actorId).goalOutcome==='completed'?'GOAL_COMPLETED':'GOAL_FAILED';cancel(entry,slot,reason,ctx.transitions);
      }
    }}
    if(ctx.decisionId!==null||ctx.transitions.length){const daily=events.findLast(e=>e.type==='SocietyDaySettled'&&e.tick===tick);
      const refs=[...ctx.requestSeqs,...(ctx.resolvedSeq?[ctx.resolvedSeq]:[]),...(daily?[daily.eventSeq]:[])];
      append(facts('MotivationPlanSettled',{actorId:entry.actorId,decisionId:ctx.decisionId,currentGoalId:state.currentGoal?.goalId??null,
        lastDuty:entry.lastDuty,lastReviewedDutyId:entry.lastReviewedDutyId,activePlan:entry.activePlan,suspendedPlan:entry.suspendedPlan,transitions:ctx.transitions},[...new Set(refs)].sort((a,b)=>a-b)));
    }
  }
  setCursors(snapshot.world,events);
}

function audit(bundle){fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);
  requireCondition(bundle.snapshot.rulesVersion===MOTIVATION_RULES,'Unknown motivation rules','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion:MOTIVATION_RULES,systems:motivationSystems()});}

export function executeMotivationPlayerIntent(bundle,intent){
  audit(bundle);const durationTicks=playerIntentDuration(intent),s=bundle.snapshot;
  requireCondition(!reserved(intent.commandId),'Player command uses a reserved namespace');
  requireCondition(!Object.hasOwn(s.commandReceipts,intent.commandId)&&!s.pendingCommands.some(c=>c.commandId===intent.commandId),'Player ID already registered','COMMAND_ID_CONFLICT');
  requireCondition(s.pendingCommands.length===0&&canPlayerIntent(s.world,intent),'Player intent cannot start','RULE_REJECTED');
  requireCondition(s.tick<=Number.MAX_SAFE_INTEGER-durationTicks&&s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Player time/input overflow','LIMIT_EXCEEDED');
  requireCondition(Object.keys(s.commandReceipts).length<MAX_COLLECTION,'Player input budget exceeded','LIMIT_EXCEEDED');
  const next=cloneData(bundle);next.snapshot.pendingCommands.push({commandId:intent.commandId,inputSeq:next.snapshot.nextInputSeq++,targetTick:s.tick+durationTicks,
    type:'PlayerAction',payload:{startTick:s.tick,intent:{type:intent.type,payload:cloneData(intent.payload)}}});
  audit(next);const session=createSimulationSession(next,motivationSystems());session.advanceTicks(durationTicks);
  const result=session.getBundle(),receipt=result.snapshot.commandReceipts[intent.commandId];requireCondition(receipt,'Missing player completion');
  return {bundle:result,durationTicks,outcome:receipt.status,result:cloneData(receipt.result)};
}

export function describeMotivationPlayerActions(bundle){
  audit(bundle);const w=bundle.snapshot.world,a=body(w,'actor-4');
  return {travelTicks:12,restTicks:6,tradeTicks:1,maxQuantity:10,locations:['village','forest'],
    prices:Object.fromEntries(['food','herbs'].map(id=>[id,{buy:w.marketModel.prices[id],sell:Math.max(1,Math.floor(w.marketModel.prices[id]/2))}])),canTrade:a.alive&&a.location==='village'};
}

function validateHistory(snapshot,events){
  validateMotivationWorld(snapshot.world);denseArray(events,140000);
  const receipts=snapshot.commandReceipts,pending=snapshot.pendingCommands;
  const entries=[...Object.entries(receipts).filter(([,r])=>r.input.type==='PlayerAction').map(([commandId,r])=>({commandId,inputSeq:r.inputSeq,...r.input,receipt:r})),...pending];
  denseArray(entries,MAX_COLLECTION);const starts=new Map(),ends=new Map(),ticks=new Set();
  for(const e of entries){requireCondition(e.type==='PlayerAction'&&!reserved(e.commandId),'Unknown motivation external command');
    const duration=playerIntentDuration({commandId:e.commandId,...e.payload.intent});integer(e.payload.startTick);
    requireCondition(e.payload.startTick<=Number.MAX_SAFE_INTEGER-duration&&e.targetTick===e.payload.startTick+duration&&e.payload.startTick<=snapshot.tick,'Player timing mismatch');
    requireCondition(!starts.has(e.payload.startTick),'Overlapping player admissions');starts.set(e.payload.startTick,e);ticks.add(e.payload.startTick);
    if(e.receipt){requireCondition(!ends.has(e.targetTick),'Overlapping player completions');ends.set(e.targetTick,e);ticks.add(e.targetTick);}
  }
  const config=snapshot.world;for(const stimulus of config.mindModel.config.stimuli)if(stimulus.tick<=snapshot.tick)ticks.add(stimulus.tick);
  for(const request of config.motivationModel.config.requests)if(request.tick<=snapshot.tick)ticks.add(request.tick);
  for(let day=1;day<=Math.floor(snapshot.tick/144);day++)ticks.add(day*144);
  const replay={world:createWorld(config.memoryModel.config,config.mindModel.config,config.motivationModel.config),simulationId:snapshot.simulationId};
  const rng=createRng(snapshot.rng.seed),rebuilt=[],seen=new Set();let nextSeq=1,registered=[];
  const expect=(fact,tick)=>{const event={...cloneData(fact),eventSeq:rebuilt.length+1,tick,schemaVersion:1};
    requireCondition(canonicalJson(events[rebuilt.length])===canonicalJson(event),'Motivation history disagrees with inputs/rules');rebuilt.push(event);return event.eventSeq;};
  const checkReceipt=(id,input,applied,seqs)=>{const r=receipts[id];requireCondition(r&&!seen.has(id),'Missing or duplicate motivation receipt');
    requireCondition(r.inputSeq===nextSeq++&&r.fingerprint===inputFingerprint(input)&&canonicalJson(r.input)===canonicalJson(input)&&r.status===(applied.success?'succeeded':'rejected')&&canonicalJson(r.result)===canonicalJson(applied.result)&&canonicalJson(r.eventSeqs)===canonicalJson(seqs),'Motivation receipt/authority mismatch');seen.add(id);return r;};
  for(const tick of [...ticks].sort((a,b)=>a-b)){
    const append=f=>expect(f,tick),end=ends.get(tick);
    if(end){requireCondition(registered.length===1&&registered[0].commandId===end.commandId,'Missing player admission');registered=[];
      const applied=applyPlayerAction(replay.world,end);replay.world=applied.world;
      const seqs=applied.success?[append(playerActionFact(end,applied.result))]:[];
      const r=receipts[end.commandId];requireCondition(r.inputSeq<nextSeq&&r.status===(applied.success?'succeeded':'rejected')&&r.fingerprint===inputFingerprint(r.input)&&canonicalJson(r.result)===canonicalJson(applied.result)&&canonicalJson(r.eventSeqs)===canonicalJson(seqs),'Player outcome mismatch');seen.add(end.commandId);
    }
    if(tick>0){const commit=command=>{const input={type:command.type,payload:cloneData(command.payload),targetTick:command.targetTick};
      const applied=applyAction(replay.world,command.payload,command.payload.action==='Hunt'?rng.next():null);replay.world=applied.world;
      return checkReceipt(command.commandId,input,applied,applied.success?[append(societyActionFact(command,applied.result))]:[]);};
      const context=beforeSystems(replay,rebuilt,tick,append,commit);
      if(tick%144===0){const daily=settleDay(replay.world,rng.next());replay.world=daily.world;
        append({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:societyCauses(rebuilt),payload:daily.payload});}
      afterSystems(replay,rebuilt,tick,append,context);
    }
    const start=starts.get(tick);if(start){requireCondition(registered.length===0&&start.inputSeq===nextSeq++&&canPlayerIntent(replay.world,{commandId:start.commandId,...start.payload.intent}),'Player registration mismatch');
      const {receipt,...input}=start;registered.push(input);}
  }
  requireCondition(rebuilt.length===events.length&&seen.size===Object.keys(receipts).length&&nextSeq===snapshot.nextInputSeq,'Unclaimed motivation history/receipt/input');
  requireCondition(canonicalJson(registered)===canonicalJson(pending),'Motivation pending input mismatch');
  requireCondition(canonicalJson(replay.world)===canonicalJson(snapshot.world),'Motivation final world/identity/assets mismatch');
  requireCondition(canonicalJson(rng.getState())===canonicalJson(snapshot.rng),'Motivation RNG history mismatch');
}

export const motivationRuntimeHooks=Object.freeze({createWorld,beforeSystems,afterSystems,applyAction,settleDay,validateHistory});
