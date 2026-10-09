// M2 narrow motivation planner: five fixed candidates, six ordered commitment gates and pure
// Goal/Plan identifier proposals over the §4.1 Knowledge DTO.
// It reads nothing but this actor's own knowledge: no world, no resolver, no other ledger, no
// RNG and no clock. It never mutates its input; every goal/plan it returns is a clone proposal
// that the runtime layer commits as-is or rejects.
import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition,fault } from './data-contract.mjs';
import { MAX_MIND_OBSERVATIONS,validateObservation } from './mind-state.mjs';
import { MOTIVATION_KNOWLEDGE_VERSION,MOTIVATION_DECISION_VERSION,MAX_MOTIVATION_KNOWLEDGE_BYTES,
  MOTIVATION_ACTOR_IDS,MOTIVATION_MAJOR_DUTY_PERMILLE,MOTIVATION_EMERGENCY_FATIGUE,MAX_MOTIVATION_PERMILLE,
  validateMotivationDuty,validateMotivationPlan,validateMotivationDecision,validateExperienceMotivationDecision,
  validateCognitionMotivationDecision } from './motivation-state.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { COGNITION_KNOWLEDGE_VERSION,COGNITION_DECISION_VERSION,MAX_COGNITION_KNOWLEDGE_BYTES,
  MAX_COGNITION_EVIDENCE_REFS } from './cognition-state.mjs';

const DAY_TICKS=144;
const HEALTH_GOAL_TARGET=800;
const HEALTH_GOAL_DEADLINE_DAYS=20;
const HEALTH_GOAL_TRIGGER=700;
const RECOVERY_BIAS=300;
const BUY_CONFIDENCE_FLOOR=600;
const NEED_LIMIT=1000;
const WORK_HEALTH_FLOOR=300;
const WORK_FATIGUE_CEILING=700;
const REST_TRIGGER=600;
const EMERGENCY_REST_SCORE=2000;
const COUNTERFACTUAL_SHIFT=200;
const SELF_FIELDS=['name','occupation','location','alive','health','hunger','fatigue','wallet','inventory',
  'currentGoal','nextGoalId','cooldownUntilDay'];
const MAX_MOTIVATION_EVIDENCE_REFS=MAX_MIND_OBSERVATIONS*2;

function permille(value,label){
  integer(value);requireCondition(value<=MAX_MOTIVATION_PERMILLE,label+' must stay within 0..1000 permille','LIMIT_EXCEEDED');
}

function validateGoal(goal){
  if(goal===null)return null;
  fields(goal,['goalId','kind','step','startDay','deadlineDay','failures','target']);
  integer(goal.goalId,1);
  requireCondition(goal.kind==='recover-health','Motivation planner only handles the narrow recover-health goal');
  requireCondition(['use','buy','wait'].includes(goal.step),'Unknown motivation goal step');
  for(const key of ['startDay','deadlineDay','failures','target'])integer(goal[key]);
  requireCondition(goal.startDay>=1 && goal.deadlineDay===goal.startDay+HEALTH_GOAL_DEADLINE_DAYS &&
    goal.target===HEALTH_GOAL_TARGET,'Motivation goal deadline/target mismatch');
  return goal;
}

const MOTIVATION_KNOWLEDGE_FIELDS=['knowledgeVersion','phase','simulationId','actorId','tick','revision','self','quote',
  'observations','belief','profile','duty','planState'];
const EXPERIENCE_KNOWLEDGE_FIELDS=[...MOTIVATION_KNOWLEDGE_FIELDS,'experience','useWorkExperience'];

// One private knowledge contract shared by the three rule variants; only the version string,
// byte budget and experience-view presence differ. Cognition reuses the M3-2 experience
// knowledge shape exactly, including its derived work-experience view.
const KNOWLEDGE_VARIANTS={
  motivation:{version:MOTIVATION_KNOWLEDGE_VERSION,bytes:MAX_MOTIVATION_KNOWLEDGE_BYTES,experience:false,
    fields:MOTIVATION_KNOWLEDGE_FIELDS},
  experience:{version:'experience-knowledge-v1',bytes:16384,experience:true,fields:EXPERIENCE_KNOWLEDGE_FIELDS},
  cognition:{version:COGNITION_KNOWLEDGE_VERSION,bytes:MAX_COGNITION_KNOWLEDGE_BYTES,experience:true,
    fields:EXPERIENCE_KNOWLEDGE_FIELDS}
};

function validateKnowledgeBase(knowledge, isExperience=false){
  return validateKnowledgeVariant(knowledge, isExperience?'experience':'motivation');
}

function validateKnowledgeVariant(knowledge, variant){
  const spec=KNOWLEDGE_VARIANTS[variant],isExperience=spec.experience;
  const bytes=new TextEncoder().encode(canonicalJson(knowledge)).length;
  const maxBytes=spec.bytes;
  requireCondition(bytes<=maxBytes,'Motivation knowledge exceeds budget','LIMIT_EXCEEDED');
  record(knowledge);
  fields(knowledge,spec.fields);
  const expectedVersion=spec.version;
  requireCondition(knowledge.knowledgeVersion===expectedVersion,'Unknown motivation knowledge version','UNSUPPORTED_VERSION');
  requireCondition(knowledge.phase==='decision','Motivation planner only accepts decision-phase knowledge');
  identifier(knowledge.simulationId);
  requireCondition(MOTIVATION_ACTOR_IDS.includes(knowledge.actorId),'Motivation planner actor unavailable','MIND_UNAVAILABLE');
  integer(knowledge.tick,1);
  requireCondition(knowledge.tick%DAY_TICKS===0,'Motivation planner requires a daily decision tick');
  integer(knowledge.revision);
  requireCondition(knowledge.revision===knowledge.tick-1,'Motivation planner revision must precede the decision tick');

  const self=knowledge.self;
  record(self);fields(self,SELF_FIELDS);
  identifier(self.name);
  for(const key of ['occupation','location'])identifier(self[key]);
  requireCondition(typeof self.alive==='boolean','Invalid knowledge life state');
  for(const key of ['health','hunger','fatigue'])
    requireCondition(Number.isSafeInteger(self[key])&&self[key]>=0&&self[key]<=NEED_LIMIT,'Knowledge need state outside budget');
  integer(self.wallet);
  record(self.inventory);fields(self.inventory,['food','herbs']);
  for(const key of ['food','herbs'])
    requireCondition(Number.isSafeInteger(self.inventory[key])&&self.inventory[key]>=0&&self.inventory[key]<=NEED_LIMIT,
      'Knowledge inventory outside budget');
  validateGoal(self.currentGoal);integer(self.nextGoalId,1);integer(self.cooldownUntilDay);

  record(knowledge.quote);fields(knowledge.quote,['product','price','observedTick','sourceEventSeq']);
  requireCondition(knowledge.quote.product==='herbs','Unknown knowledge quote product');
  integer(knowledge.quote.price,1);integer(knowledge.quote.observedTick);
  if(knowledge.quote.sourceEventSeq!==null)integer(knowledge.quote.sourceEventSeq,1);

  denseArray(knowledge.observations,MAX_MIND_OBSERVATIONS);
  for(const observation of knowledge.observations)validateObservation(observation);

  record(knowledge.belief);
  fields(knowledge.belief,['topic','value','confidencePermille','evidenceRefs','contradictionRefs','lastUpdatedTick']);
  requireCondition(knowledge.belief.topic==='public-herbs-available' &&
    ['available','unavailable','unknown'].includes(knowledge.belief.value),'Invalid knowledge belief');
  permille(knowledge.belief.confidencePermille,'Knowledge belief confidence');
  denseArray(knowledge.belief.evidenceRefs,MAX_MOTIVATION_EVIDENCE_REFS);
  denseArray(knowledge.belief.contradictionRefs,MAX_MOTIVATION_EVIDENCE_REFS);
  for(const ref of knowledge.belief.evidenceRefs)integer(ref,1);
  for(const ref of knowledge.belief.contradictionRefs)integer(ref,1);
  if(knowledge.belief.lastUpdatedTick!==null)integer(knowledge.belief.lastUpdatedTick);

  record(knowledge.profile);fields(knowledge.profile,['dutyWeightPermille','riskAversionPermille']);
  permille(knowledge.profile.dutyWeightPermille,'Motivation duty weight');
  permille(knowledge.profile.riskAversionPermille,'Motivation risk aversion');

  validateMotivationDuty(knowledge.duty);

  record(knowledge.planState);fields(knowledge.planState,['activePlan','suspendedPlan','nextPlanId','lastReviewedDutyId']);
  const active=validateMotivationPlan(knowledge.planState.activePlan);
  const suspended=validateMotivationPlan(knowledge.planState.suspendedPlan);
  if(active!==null)requireCondition(active.status==='ready'||active.status==='blocked','A finished plan cannot stay active');
  if(suspended!==null){
    requireCondition(suspended.status==='suspended','Only suspended plans occupy the suspension slot');
    requireCondition(suspended.kind==='recover-health','Only the health plan may be suspended');
  }
  if(active!==null&&active.kind==='recover-health'&&suspended!==null)
    requireCondition(false,'Motivation knowledge carries two health plans with nowhere to park them');
  if(active!==null&&suspended!==null)requireCondition(active.planId!==suspended.planId,'Active and suspended plans must be distinct');
  integer(knowledge.planState.nextPlanId,1);
  for(const plan of [active,suspended])if(plan!==null)
    requireCondition(knowledge.planState.nextPlanId>plan.planId,
      'Motivation plan counter must exceed existing plan identifiers');
  if(knowledge.planState.lastReviewedDutyId!==null)identifier(knowledge.planState.lastReviewedDutyId);

  if(isExperience){
    requireCondition(typeof knowledge.useWorkExperience==='boolean','Invalid useWorkExperience flag');
    const exp=knowledge.experience;
    record(exp);
    fields(exp,['version','simulationId','actorId','topic','sampleCount','failureCount','penaltyPermille','evidenceRefs']);
    requireCondition(exp.version==='work-experience-view-v1','Unknown work experience view version','UNSUPPORTED_VERSION');
    requireCondition(exp.simulationId===knowledge.simulationId,'Experience simulationId mismatch');
    requireCondition(exp.actorId===knowledge.actorId,'Experience actorId mismatch');
    requireCondition(exp.topic==='work-for-pay-execution','Unknown experience topic');
    integer(exp.sampleCount,0);
    requireCondition(exp.sampleCount<=4,'Sample count exceeds window','LIMIT_EXCEEDED');
    integer(exp.failureCount,0);
    requireCondition(exp.failureCount<=exp.sampleCount,'Failure count exceeds sample count');
    requireCondition(exp.penaltyPermille===Math.min(300,100*exp.failureCount),'Penalty permille mismatch');
    denseArray(exp.evidenceRefs,4);
    requireCondition(exp.evidenceRefs.length===exp.sampleCount,'Evidence refs length mismatch');
    let prev=0;
    for(const seq of exp.evidenceRefs){
      integer(seq,1);
      requireCondition(seq>prev,'Unordered experience evidence refs');
      prev=seq;
    }
  }

  return knowledge;
}

function validateKnowledge(knowledge){
  return validateKnowledgeBase(knowledge, false);
}

export function validateCognitionKnowledge(knowledge){
  inspectDescriptorTree(knowledge);
  return validateKnowledgeVariant(knowledge, 'cognition');
}

function rejectDead(){throw fault('RULE_REJECTED','Motivation planner does not decide for the dead');}

const dutyWindowOpen=(duty,tick)=>duty!==null&&duty.status==='pending'&&tick>=duty.observedTick&&tick<duty.expiresTick;
const strainOf=self=>Math.min(MAX_MOTIVATION_PERMILLE,self.fatigue+Math.max(0,HEALTH_GOAL_TRIGGER-self.health));
const recoveryOf=self=>Math.max(0,HEALTH_GOAL_TARGET-self.health)+RECOVERY_BIAS;
const providerOf=action=>action==='WorkForPay'?'role-request':action==='Rest'?'fatigue-need':
  action==='NoAction'?'fallback':'health-need';
const sourceRefOf=action=>action==='WorkForPay'||action==='NoAction'?null:
  action==='Rest'?'self-fatigue':'recover-health';
const scored=(action,reasonCode,support)=>({action,provider:providerOf(action),
  sourceRef:sourceRefOf(action),eligible:true,score:support,support,opposition:0,reasonCode});
const softBlocked=(action,reasonCode,sourceRef=sourceRefOf(action))=>({action,provider:providerOf(action),
  sourceRef,eligible:false,score:null,support:0,opposition:0,reasonCode});

// One private soft-guard per committed action. The full candidate builders and the M3-3A
// committed-step eligibility query share them, so continuation can never drift from the rules
// that produced the plan in the first place.
function useGuard(hasGoal,self){
  if(!hasGoal)return 'NO_HEALTH_GOAL';
  if(self.inventory.herbs===0)return 'PRIVATE_MEDICINE_MISSING';
  if(self.health>=NEED_LIMIT)return 'HEALTH_ALREADY_FULL';
  return null;
}

function buyGuard(hasGoal,self,knowledge){
  if(!hasGoal)return 'NO_HEALTH_GOAL';
  if(self.inventory.herbs!==0)return 'PRIVATE_MEDICINE_PRESENT';
  if(knowledge.belief.value==='unknown')return 'SUPPLY_UNKNOWN';
  if(knowledge.belief.value==='unavailable')return 'SUPPLY_UNAVAILABLE';
  if(knowledge.belief.confidencePermille<BUY_CONFIDENCE_FLOOR)return 'SUPPLY_CONFIDENCE_LOW';
  if(self.wallet<knowledge.quote.price)return 'WALLET_INSUFFICIENT';
  if(self.inventory.herbs+1>NEED_LIMIT)return 'CAPACITY_UNAVAILABLE';
  return null;
}

// requestId binds the guard to one committed duty plan; the shared candidate path passes null.
function workGuard(self,knowledge,requestId=null){
  const duty=knowledge.duty;
  if(!dutyWindowOpen(duty,knowledge.tick))return 'DUTY_UNAVAILABLE';
  if(requestId!==null&&duty.requestId!==requestId)return 'DUTY_UNAVAILABLE';
  if(self.health<WORK_HEALTH_FLOOR)return 'HEALTH_TOO_LOW_FOR_WORK';
  if(self.fatigue>WORK_FATIGUE_CEILING)return 'FATIGUE_TOO_HIGH_FOR_WORK';
  return null;
}

function restGuard(self){
  if(self.fatigue<REST_TRIGGER)return 'FATIGUE_BELOW_REST_THRESHOLD';
  return null;
}

function committedGuard(knowledge,plan){
  const self=knowledge.self,hasGoal=self.currentGoal!==null,action=plan.steps[plan.stepIndex];
  if(action==='UseMedicine')return useGuard(hasGoal,self);
  if(action==='BuyMedicine')return buyGuard(hasGoal,self,knowledge);
  if(action==='WorkForPay')return workGuard(self,knowledge,plan.requestId);
  if(action==='Rest')return restGuard(self);
  requireCondition(false,'Committed plan step is not a recognizable action');
}

const MAINTAIN_REASON_CODES={UseMedicine:'RECOVER_HEALTH',BuyMedicine:'RECOVER_HEALTH',
  WorkForPay:'DUTY',Rest:'FATIGUE_RELIEF'};

function useCandidate(hasGoal,self){
  const reason=useGuard(hasGoal,self);
  return reason===null?scored('UseMedicine','RECOVER_HEALTH',recoveryOf(self)):softBlocked('UseMedicine',reason);
}

function buyCandidate(hasGoal,self,knowledge){
  const reason=buyGuard(hasGoal,self,knowledge);
  return reason===null?scored('BuyMedicine','RECOVER_HEALTH',recoveryOf(self)):softBlocked('BuyMedicine',reason);
}

function workCandidate(self,knowledge,experiencePenalty=0){
  const duty=knowledge.duty,reason=workGuard(self,knowledge,null);
  if(reason!==null)return softBlocked('WorkForPay',reason,reason==='DUTY_UNAVAILABLE'?null:duty.requestId);
  const sourceRef=duty.requestId;
  const support=Math.floor(duty.urgencyPermille*knowledge.profile.dutyWeightPermille/1000);
  const opposition=Math.floor(strainOf(self)*knowledge.profile.riskAversionPermille/1000)+experiencePenalty;
  return {action:'WorkForPay',provider:'role-request',sourceRef,eligible:true,score:support-opposition,
    support,opposition,reasonCode:'DUTY'};
}

function restCandidate(self){
  const reason=restGuard(self);
  if(reason!==null)return softBlocked('Rest',reason);
  const emergency=self.fatigue>=MOTIVATION_EMERGENCY_FATIGUE;
  return scored('Rest',emergency?'EMERGENCY_FATIGUE':'FATIGUE_RELIEF',emergency?EMERGENCY_REST_SCORE:self.fatigue);
}

// M3-3A: does the already-committed current step still hold? It never scores, never compares
// candidates and never touches plan steps, identifiers or duty review markers.
export function isCommittedStepEligible(knowledge,plan){
  inspectDescriptorTree({knowledge,plan});
  const spec=validateKnowledgeVariant(knowledge,'cognition');
  requireCondition(plan!==null&&typeof plan==='object','Cognition continuation requires a committed plan');
  const slots=[spec.planState.activePlan,spec.planState.suspendedPlan];
  const owned=slots.some(slot=>slot!==null&&(slot===plan||canonicalJson(slot)===canonicalJson(plan)));
  requireCondition(owned,'Cognition continuation plan is not this actor\'s committed plan');
  validateMotivationPlan(plan);
  const reason=committedGuard(knowledge,plan);
  return {eligible:reason===null,reasonCode:reason};
}

function collectCandidates(knowledge,experiencePenalty=0){
  const self=knowledge.self,day=knowledge.tick/DAY_TICKS;
  const hasGoal=self.currentGoal!==null||(self.health<=HEALTH_GOAL_TRIGGER&&day>=self.cooldownUntilDay);
  const candidates=[useCandidate(hasGoal,self),buyCandidate(hasGoal,self,knowledge),workCandidate(self,knowledge,experiencePenalty),
    restCandidate(self),scored('NoAction','WAIT',0)];
  return candidates;
}

export function collectMotivationCandidates(knowledge){
  validateKnowledge(knowledge);
  if(!knowledge.self.alive)rejectDead();
  return collectCandidates(knowledge, 0);
}

function slotValid(plan,goal,knowledge,day){
  if(plan===null)return null;
  if(plan.kind==='recover-health')return goal!==null&&plan.goalId===goal.goalId&&day<=goal.deadlineDay?plan:null;
  if(plan.kind==='aid-village')
    return dutyWindowOpen(knowledge.duty,knowledge.tick)&&knowledge.duty.requestId===plan.requestId&&
      day<=plan.deadlineDay?plan:null;
  return day<=plan.deadlineDay?plan:null;
}

const canonicalHealthSteps=self=>self.inventory.herbs===0?['BuyMedicine','UseMedicine']:['UseMedicine'];

function proposeGoal(nextGoalId,day){
  requireCondition(nextGoalId<Number.MAX_SAFE_INTEGER,'Motivation goal counter overflow','LIMIT_EXCEEDED');
  return {goalId:nextGoalId,kind:'recover-health',step:'wait',startDay:day,
    deadlineDay:day+HEALTH_GOAL_DEADLINE_DAYS,failures:0,target:HEALTH_GOAL_TARGET};
}

function repairHealthPlan(plan,self,candidates,keepSuspended){
  const steps=canonicalHealthSteps(self);
  const ready=candidates.find(candidate=>candidate.action===steps[0]).eligible;
  return {...plan,steps,stepIndex:0,status:keepSuspended?'suspended':ready?'ready':'blocked'};
}

const DECISION_VERSIONS={motivation:MOTIVATION_DECISION_VERSION,experience:'experience-decision-v1',
  cognition:COGNITION_DECISION_VERSION};
const DECISION_PREFIXES={motivation:'motivation-day-',experience:'experience-day-',cognition:'cognition-day-'};
const DECISION_VALIDATORS={motivation:validateMotivationDecision,experience:validateExperienceMotivationDecision,
  cognition:validateCognitionMotivationDecision};

function planDecisionInternal(knowledge, variant='motivation', context=null){
  const spec=KNOWLEDGE_VARIANTS[variant],isExperience=spec.experience;
  validateKnowledgeVariant(knowledge, variant);
  const self=knowledge.self,tick=knowledge.tick,day=tick/DAY_TICKS;
  if(!self.alive)rejectDead();

  let currentGoal=self.currentGoal===null?null:cloneData(self.currentGoal);
  let nextGoalId=self.nextGoalId;
  if(currentGoal===null&&self.health<=HEALTH_GOAL_TRIGGER&&day>=self.cooldownUntilDay){
    currentGoal=proposeGoal(nextGoalId,day);nextGoalId+=1;
  }

  const penalty=isExperience&&knowledge.useWorkExperience?knowledge.experience.penaltyPermille:0;
  const candidates=collectCandidates(knowledge, penalty);
  const eligibleOf=action=>candidates.find(candidate=>candidate.action===action).eligible;
  let activePlan=slotValid(cloneData(knowledge.planState.activePlan),self.currentGoal,knowledge,day);
  let suspendedPlan=slotValid(cloneData(knowledge.planState.suspendedPlan),self.currentGoal,knowledge,day);
  let nextPlanId=knowledge.planState.nextPlanId;
  let lastReviewedDutyId=knowledge.planState.lastReviewedDutyId;
  const duty=knowledge.duty;

  const urgent=self.fatigue>=MOTIVATION_EMERGENCY_FATIGUE;
  const major=dutyWindowOpen(duty,tick)&&duty.urgencyPermille>=MOTIVATION_MAJOR_DUTY_PERMILLE&&
    duty.requestId!==lastReviewedDutyId;
  const opened=plan=>plan!==null&&eligibleOf(plan.steps[plan.stepIndex]);

  let gateReason,commitment,choice;
  if(urgent){
    gateReason='URGENT_FATIGUE';commitment='Rest';choice='Rest';
  }else if(major){
    gateReason='NEW_MAJOR_DUTY';lastReviewedDutyId=duty.requestId;commitment=null;
  }else if(activePlan!==null&&activePlan.status==='ready'&&opened(activePlan)){
    gateReason='CONTINUE_COMMITTED';commitment=activePlan.steps[activePlan.stepIndex];choice=commitment;
  }else if(activePlan===null&&suspendedPlan!==null&&opened(suspendedPlan)){
    gateReason='RESUME_COMMITTED';commitment=suspendedPlan.steps[suspendedPlan.stepIndex];choice=commitment;
  }else if(activePlan!==null||suspendedPlan!==null){
    gateReason='LOCAL_REPLAN_BLOCKED';commitment=null;
  }else{
    gateReason='SELECT_NEW_PLAN';commitment=null;
  }

  let best=null;
  for(const candidate of candidates){
    if(candidate.eligible&&(best===null||candidate.score>best.score))best=candidate;
  }
  if(commitment===null)choice=best.action;
  for(const candidate of candidates){
    candidate.selectable=commitment===null?candidate.eligible:candidate.action===commitment;
    candidate.selectionBlockCode=!candidate.eligible?'SOFT_PRECONDITION_FAILED':
      candidate.selectable?null:(gateReason==='URGENT_FATIGUE'?'URGENT_OVERRIDE':'COMMITMENT_PROTECTED');
  }

  let boundPlan=null;
  if(choice==='UseMedicine'||choice==='BuyMedicine'){
    if(activePlan!==null&&activePlan.kind==='recover-health'){
      boundPlan=gateReason==='LOCAL_REPLAN_BLOCKED'?repairHealthPlan(activePlan,self,candidates,false):activePlan;
    }else if(suspendedPlan!==null){
      boundPlan=gateReason==='LOCAL_REPLAN_BLOCKED'?repairHealthPlan(suspendedPlan,self,candidates,false):
        {...suspendedPlan,status:'ready'};
      suspendedPlan=null;
    }else{
      requireCondition(nextPlanId<Number.MAX_SAFE_INTEGER,'Motivation plan counter overflow','LIMIT_EXCEEDED');
      boundPlan={planId:nextPlanId,goalId:currentGoal.goalId,kind:'recover-health',steps:canonicalHealthSteps(self),
        stepIndex:0,status:'ready',createdDay:day,deadlineDay:currentGoal.deadlineDay,requestId:null};
      nextPlanId+=1;
    }
    activePlan=boundPlan;
    currentGoal={...currentGoal,step:choice==='UseMedicine'?'use':'buy'};
  }else if(choice==='WorkForPay'||choice==='Rest'){
    const kind=choice==='WorkForPay'?'aid-village':'recover-rest';
    if((gateReason==='CONTINUE_COMMITTED'||gateReason==='LOCAL_REPLAN_BLOCKED')&&
      activePlan!==null&&activePlan.kind===kind){
      boundPlan={...activePlan,status:'ready'};
    }else{
      requireCondition(nextPlanId<Number.MAX_SAFE_INTEGER,'Motivation plan counter overflow','LIMIT_EXCEEDED');
      boundPlan={planId:nextPlanId,goalId:null,kind,steps:[choice],stepIndex:0,status:'ready',createdDay:day,
        deadlineDay:kind==='aid-village'?Math.floor((duty.expiresTick-1)/DAY_TICKS):day,
        requestId:kind==='aid-village'?duty.requestId:null};
      nextPlanId+=1;
    }
    if(activePlan!==null&&activePlan.kind==='recover-health')suspendedPlan={...activePlan,status:'suspended'};
    activePlan=boundPlan;
  }else if(activePlan!==null||suspendedPlan!==null){
    if(activePlan!==null)activePlan=activePlan.kind==='recover-health'?
      repairHealthPlan(activePlan,self,candidates,false):
      {...activePlan,status:eligibleOf(activePlan.steps[activePlan.stepIndex])?'ready':'blocked'};
    if(suspendedPlan!==null)suspendedPlan=repairHealthPlan(suspendedPlan,self,candidates,true);
    boundPlan=activePlan!==null?activePlan:suspendedPlan;
  }

  const innerStance=self.fatigue>=MOTIVATION_EMERGENCY_FATIGUE?'fatigue-concerned':
    self.health<=HEALTH_GOAL_TRIGGER||currentGoal!==null?'health-concerned':'balanced';
  const evidence=new Set([...knowledge.belief.evidenceRefs,...knowledge.belief.contradictionRefs]);
  if(duty!==null)evidence.add(duty.sourceEventSeq);
  if(isExperience&&knowledge.experience?.evidenceRefs){
    for(const seq of knowledge.experience.evidenceRefs)evidence.add(seq);
  }
  const cognition=variant==='cognition';
  if(cognition){
    // A full review cites its own published evaluation fact, never another actor's.
    requireCondition(context!==null,'Cognition review requires its evaluation context');
    evidence.add(context.evaluationEventSeq);
  }

  const decisionId=DECISION_PREFIXES[variant]+day+'-'+knowledge.actorId;
  const decisionVersion=DECISION_VERSIONS[variant];
  const decision={version:decisionVersion,decisionId,
    actorId:knowledge.actorId,tick,goalId:boundPlan===null?null:boundPlan.goalId,
    planId:boundPlan===null?null:boundPlan.planId,innerStance,
    committedIntent:currentGoal===null?null:{goalId:currentGoal.goalId,kind:'recover-health'},
    apparentAction:choice,choice,reasonCode:candidates.find(candidate=>candidate.action===choice).reasonCode,
    gateReason,strainPermille:strainOf(self),candidates,
    evidenceRefs:[...evidence].sort((a,b)=>a-b),
    knowledgeFingerprint:canonicalJson(knowledge)};
  if(cognition){
    decision.mode='review';
    decision.sourceReviewDecisionId=null;
    decision.sourceReviewEventSeq=null;
  }

  DECISION_VALIDATORS[variant](decision);

  return {currentGoal,nextGoalId,activePlan,suspendedPlan,nextPlanId,lastReviewedDutyId,decision};
}

export function planMotivationDecision(knowledge){
  return planDecisionInternal(knowledge, 'motivation');
}

export function planExperienceMotivationDecision(knowledge){
  inspectDescriptorTree(knowledge);
  return planDecisionInternal(knowledge, 'experience');
}

function validateCognitionContext(context,maintain){
  inspectDescriptorTree(context);
  record(context);
  fields(context,['evaluationEventSeq','sourceReviewDecisionId','sourceReviewEventSeq']);
  integer(context.evaluationEventSeq,1);
  if(maintain){
    identifier(context.sourceReviewDecisionId);
    requireCondition(context.sourceReviewDecisionId.startsWith('cognition-day-'),
      'Cognition maintain source is not a cognition review decision');
    integer(context.sourceReviewEventSeq,1);
    requireCondition(context.sourceReviewEventSeq<context.evaluationEventSeq,
      'Cognition maintain source must strictly precede its evaluation');
  }else{
    requireCondition(context.sourceReviewDecisionId===null&&context.sourceReviewEventSeq===null,
      'Cognition full review carries no maintain source');
  }
  return context;
}

export function planCognitionMotivationDecision(knowledge,context){
  inspectDescriptorTree({knowledge,context});
  validateCognitionContext(context,false);
  return planDecisionInternal(knowledge,'cognition',context);
}

// M3-3A continuation: execute the already-committed current step, or resume an eligible
// suspended plan. It never scores, never compares candidates, never edits steps/stepIndex,
// never builds a Goal or Plan, never consumes a plan identifier and never marks a duty reviewed.
export function continueCognitionPlan(knowledge,context){
  inspectDescriptorTree({knowledge,context});
  validateCognitionContext(context,true);
  const spec=validateKnowledgeVariant(knowledge,'cognition');
  const self=spec.self,tick=spec.tick;
  if(!self.alive)rejectDead();
  requireCondition(context.sourceReviewDecisionId.endsWith('-'+spec.actorId),
    'Cognition maintain source belongs to another actor');

  const currentGoal=self.currentGoal===null?null:cloneData(self.currentGoal);
  const nextGoalId=self.nextGoalId;
  let activePlan=cloneData(spec.planState.activePlan);
  let suspendedPlan=cloneData(spec.planState.suspendedPlan);
  const nextPlanId=spec.planState.nextPlanId;
  const lastReviewedDutyId=spec.planState.lastReviewedDutyId;

  let gateReason,choice,reasonCode,boundPlan=null;
  if(activePlan!==null){
    const action=activePlan.steps[activePlan.stepIndex],guard=isCommittedStepEligible(knowledge,activePlan);
    if(guard.eligible){
      gateReason='CONTINUE_MAINTAIN';choice=action;reasonCode=MAINTAIN_REASON_CODES[action];
      activePlan={...activePlan,status:'ready'};
    }else{
      gateReason='WAIT_MAINTAIN';choice='NoAction';reasonCode=guard.reasonCode;
      activePlan={...activePlan,status:'blocked'};
    }
    boundPlan=activePlan;
  }else if(suspendedPlan!==null){
    const action=suspendedPlan.steps[suspendedPlan.stepIndex],guard=isCommittedStepEligible(knowledge,suspendedPlan);
    if(guard.eligible){
      gateReason='CONTINUE_MAINTAIN';choice=action;reasonCode=MAINTAIN_REASON_CODES[action];
      activePlan={...suspendedPlan,status:'ready'};suspendedPlan=null;boundPlan=activePlan;
    }else{
      gateReason='WAIT_MAINTAIN';choice='NoAction';reasonCode=guard.reasonCode;boundPlan=suspendedPlan;
    }
  }else{
    gateReason='WAIT_MAINTAIN';choice='NoAction';reasonCode='WAIT';
  }

  const innerStance=self.fatigue>=MOTIVATION_EMERGENCY_FATIGUE?'fatigue-concerned':
    self.health<=HEALTH_GOAL_TRIGGER||currentGoal!==null?'health-concerned':'balanced';
  const evidence=new Set([...spec.belief.evidenceRefs,...spec.belief.contradictionRefs]);
  if(spec.duty!==null)evidence.add(spec.duty.sourceEventSeq);
  for(const seq of spec.experience.evidenceRefs)evidence.add(seq);
  evidence.add(context.evaluationEventSeq);
  evidence.add(context.sourceReviewEventSeq);

  const decision={version:COGNITION_DECISION_VERSION,
    decisionId:'cognition-day-'+tick/DAY_TICKS+'-'+spec.actorId,
    actorId:spec.actorId,tick,goalId:boundPlan===null?null:boundPlan.goalId,
    planId:boundPlan===null?null:boundPlan.planId,innerStance,
    committedIntent:currentGoal===null?null:{goalId:currentGoal.goalId,kind:'recover-health'},
    apparentAction:choice,choice,reasonCode,
    gateReason,strainPermille:strainOf(self),candidates:[],
    evidenceRefs:[...evidence].sort((a,b)=>a-b),
    knowledgeFingerprint:canonicalJson(knowledge),
    mode:'maintain',sourceReviewDecisionId:context.sourceReviewDecisionId,
    sourceReviewEventSeq:context.sourceReviewEventSeq};
  validateCognitionMotivationDecision(decision);

  return {currentGoal,nextGoalId,activePlan,suspendedPlan,nextPlanId,lastReviewedDutyId,decision};
}

function profileProbe(knowledge,changedField,toValue){
  const probe=cloneData(knowledge),key=changedField.split('.')[1];
  probe.profile[key]=toValue;
  return probe;
}

function counterfactualCase(caseId,changedField,fromValue,toValue,knowledge,frozen){
  const decision=changedField===null?frozen:planMotivationDecision(profileProbe(knowledge,changedField,toValue)).decision;
  return {caseId,changedField,fromValue,toValue,choice:decision.choice,
    candidates:cloneData(decision.candidates),gateReason:decision.gateReason};
}

// Three fixed hypotheses over the frozen decision and its own knowledge text. Nothing is
// executed: no tick, RNG, identifier, role state, goal, plan or file changes, and a hypothesis
// never claims that the World accepted the action.
export function buildFastCounterfactual(decision){
  validateMotivationDecision(decision);
  const text=decision.knowledgeFingerprint;
  requireCondition(typeof text==='string'&&text.length>0,'Motivation decision carries no knowledge text');
  let knowledge;
  try{knowledge=JSON.parse(text);}catch{throw fault('INVALID_INPUT','Motivation decision knowledge is not canonical JSON');}
  requireCondition(canonicalJson(knowledge)===text,'Motivation decision knowledge fingerprint mismatch');
  validateKnowledge(knowledge);
  requireCondition(knowledge.actorId===decision.actorId&&knowledge.tick===decision.tick&&
    knowledge.revision===decision.tick-1,'Motivation counterfactual identity mismatch');
  const baseline=planMotivationDecision(knowledge).decision;
  requireCondition(baseline.choice===decision.choice&&baseline.apparentAction===decision.apparentAction&&
    baseline.gateReason===decision.gateReason&&
    canonicalJson(baseline.candidates)===canonicalJson(decision.candidates),
    'Motivation counterfactual baseline does not reproduce the frozen decision');
  const profile=knowledge.profile;
  return [counterfactualCase('baseline',null,null,null,knowledge,baseline),
    counterfactualCase('duty-minus-200','profile.dutyWeightPermille',profile.dutyWeightPermille,
      Math.max(0,profile.dutyWeightPermille-COUNTERFACTUAL_SHIFT),knowledge,baseline),
    counterfactualCase('risk-plus-200','profile.riskAversionPermille',profile.riskAversionPermille,
      Math.min(MAX_MOTIVATION_PERMILLE,profile.riskAversionPermille+COUNTERFACTUAL_SHIFT),knowledge,baseline)];
}
