// M2 motivation state: fixed shapes for the bounded motivation planner DTOs.
// Only motivation config/model structure and its own budgets are checked here. The combined
// M1 stimuli + M2 request budgets, request prefixes/cursors and full history replay belong to
// the runtime layer, which is the only place that can see the mind configuration.
import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition } from './data-contract.mjs';
import { MAX_MIND_OBSERVATIONS } from './mind-state.mjs';
import { inspectDescriptorTree } from './experience-state.mjs';
import { COGNITION_DECISION_VERSION, COGNITION_MOTIVATION_STATE_VERSION, MAX_COGNITION_EVIDENCE_REFS } from './cognition-state.mjs';

export const MOTIVATION_RULES='m-motivation-v1';
export const MOTIVATION_CONFIG_VERSION='motivation-config-v1';
export const MOTIVATION_STATE_VERSION='motivation-state-v1';
export const MOTIVATION_KNOWLEDGE_VERSION='motivation-knowledge-v1';
export const MOTIVATION_DECISION_VERSION='motivation-decision-v1';
export const MOTIVATION_INSPECTOR_VERSION='motivation-inspector-v1';
export const MAX_MOTIVATION_ACTORS=2;
export const MAX_MOTIVATION_CANDIDATES=5;
export const MAX_MOTIVATION_PLAN_STEPS=2;
export const MAX_MOTIVATION_REQUESTS=64;
export const MAX_MOTIVATION_INPUTS_PER_TICK=8;
export const MAX_MOTIVATION_KNOWLEDGE_BYTES=16384;
export const MAX_MOTIVATION_INSPECTOR_BYTES=131072;
export const MAX_MOTIVATION_PLAN_TRANSITIONS=8;
export const MAX_MOTIVATION_PERMILLE=1000;
export const MAX_MOTIVATION_REQUEST_WINDOW_TICKS=288;
export const MOTIVATION_ACTOR_IDS=Object.freeze(['actor-2','actor-3']);
export const MOTIVATION_REQUESTER_ID='actor-1';
export const MOTIVATION_ACTIONS=Object.freeze(['UseMedicine','BuyMedicine','WorkForPay','Rest','NoAction']);
export const MOTIVATION_PLAN_KINDS=Object.freeze(['recover-health','aid-village','recover-rest']);
export const MOTIVATION_PLAN_STATUSES=Object.freeze(['ready','blocked','suspended','completed','cancelled']);
export const MOTIVATION_DUTY_STATUSES=Object.freeze(['pending','fulfilled']);
export const MOTIVATION_GATES=Object.freeze(['URGENT_FATIGUE','NEW_MAJOR_DUTY','CONTINUE_COMMITTED',
  'RESUME_COMMITTED','LOCAL_REPLAN_BLOCKED','SELECT_NEW_PLAN']);
// M3-3A maintain carries no candidate comparison, so it uses its own two gates instead of
// borrowing a full-review gate. Old decision validators never accept these.
export const COGNITION_MAINTAIN_GATES=Object.freeze(['CONTINUE_MAINTAIN','WAIT_MAINTAIN']);
export const MOTIVATION_STANCES=Object.freeze(['fatigue-concerned','health-concerned','balanced']);
export const MOTIVATION_SELECTION_BLOCK_CODES=Object.freeze(['SOFT_PRECONDITION_FAILED','COMMITMENT_PROTECTED','URGENT_OVERRIDE']);
export const MOTIVATION_REASON_CODES=Object.freeze(['RECOVER_HEALTH','NO_HEALTH_GOAL','PRIVATE_MEDICINE_MISSING',
  'HEALTH_ALREADY_FULL','PRIVATE_MEDICINE_PRESENT','SUPPLY_UNKNOWN','SUPPLY_UNAVAILABLE','SUPPLY_CONFIDENCE_LOW',
  'WALLET_INSUFFICIENT','CAPACITY_UNAVAILABLE','DUTY_UNAVAILABLE','HEALTH_TOO_LOW_FOR_WORK','FATIGUE_TOO_HIGH_FOR_WORK',
  'DUTY','FATIGUE_BELOW_REST_THRESHOLD','FATIGUE_RELIEF','EMERGENCY_FATIGUE','WAIT']);
export const MOTIVATION_OUTCOME_STATUSES=Object.freeze(['succeeded','rejected','no-action']);
export const MOTIVATION_MAJOR_DUTY_PERMILLE=900;
export const MOTIVATION_EMERGENCY_FATIGUE=800;
const IDENTIFIER_PATTERN=/^[A-Za-z0-9_-]+$/;
const MAX_MOTIVATION_EVIDENCE_REFS=MAX_MIND_OBSERVATIONS*2;
const PLAN_STEP_SHAPES={
  'recover-health':[['BuyMedicine','UseMedicine'],['UseMedicine']],
  'aid-village':[['WorkForPay']],
  'recover-rest':[['Rest']]
};

function permille(value,label){
  integer(value);requireCondition(value<=MAX_MOTIVATION_PERMILLE,label+' must stay within 0..1000 permille','LIMIT_EXCEEDED');
}

export function validateMotivationRequest(request){
  record(request);
  fields(request,['requestId','tick','speakerId','listenerId','urgencyPermille','expiresTick']);
  identifier(request.requestId);
  requireCondition(IDENTIFIER_PATTERN.test(request.requestId),'Invalid motivation request identifier');
  // Overflow is a hard stop before any range arithmetic, per the shared budget ordering.
  integer(request.tick,1);
  requireCondition(request.tick<=Number.MAX_SAFE_INTEGER-MAX_MOTIVATION_REQUEST_WINDOW_TICKS,
    'Motivation request expiry would overflow','LIMIT_EXCEEDED');
  requireCondition(request.speakerId===MOTIVATION_REQUESTER_ID,'Motivation requests come from the village chief only');
  requireCondition(MOTIVATION_ACTOR_IDS.includes(request.listenerId),'Unknown motivation request listener');
  permille(request.urgencyPermille,'Motivation request urgency');
  integer(request.expiresTick,1);
  requireCondition(request.expiresTick>request.tick,'Motivation request window is empty');
  requireCondition(request.expiresTick<=request.tick+MAX_MOTIVATION_REQUEST_WINDOW_TICKS,
    'Motivation request window exceeds the fixed TTL','LIMIT_EXCEEDED');
  return request;
}

export function validateMotivationConfig(config){
  record(config);
  requireCondition(config.version===MOTIVATION_CONFIG_VERSION,'Unknown motivation configuration','UNSUPPORTED_VERSION');
  fields(config,['version','profiles','requests']);
  denseArray(config.profiles,MAX_MOTIVATION_ACTORS);
  requireCondition(config.profiles.length===MAX_MOTIVATION_ACTORS &&
    config.profiles[0].actorId===MOTIVATION_ACTOR_IDS[0] && config.profiles[1].actorId===MOTIVATION_ACTOR_IDS[1],
    'Motivation roster must be the two fixed identities');
  for(const profile of config.profiles){
    record(profile);fields(profile,['actorId','dutyWeightPermille','riskAversionPermille']);
    identifier(profile.actorId);
    permille(profile.dutyWeightPermille,'Motivation duty weight');
    permille(profile.riskAversionPermille,'Motivation risk aversion');
  }
  denseArray(config.requests,MAX_MOTIVATION_REQUESTS);
  const ids=new Set();let previous=null,perTick=0,previousTick=-1;
  for(const request of config.requests){
    validateMotivationRequest(request);
    requireCondition(!ids.has(request.requestId),'Duplicate motivation request identifier');ids.add(request.requestId);
    requireCondition(previous===null || request.tick>previous.tick ||
      (request.tick===previous.tick && previous.requestId<request.requestId),'Unordered motivation request arrangement');
    perTick=request.tick===previousTick?perTick+1:1;previousTick=request.tick;
    requireCondition(perTick<=MAX_MOTIVATION_INPUTS_PER_TICK,'Motivation request tick batch budget exceeded','LIMIT_EXCEEDED');
    previous=request;
  }
  return config;
}

export function createMotivationModel(config=undefined){
  validateMotivationConfig(config);const copy=cloneData(config);
  return {version:MOTIVATION_STATE_VERSION,config:copy,configFingerprint:canonicalJson(copy),requestCursor:0,cursor:0,
    actors:copy.profiles.map(profile=>({actorId:profile.actorId,lastDuty:null,lastReviewedDutyId:null,
      activePlan:null,suspendedPlan:null,nextPlanId:1,lastDecision:null,lastOutcome:null}))};
}

export function validateMotivationDuty(duty){
  if(duty===null)return null;
  record(duty);
  fields(duty,['requestId','sourceEventSeq','observedTick','expiresTick','urgencyPermille','status','fulfilledTick']);
  identifier(duty.requestId);
  requireCondition(IDENTIFIER_PATTERN.test(duty.requestId),'Invalid motivation duty identifier');
  integer(duty.sourceEventSeq,1);integer(duty.observedTick,1);integer(duty.expiresTick,1);
  requireCondition(duty.expiresTick-duty.observedTick<=MAX_MOTIVATION_REQUEST_WINDOW_TICKS,
    'Motivation duty window exceeds the fixed TTL','LIMIT_EXCEEDED');
  requireCondition(duty.expiresTick>duty.observedTick,'Motivation duty window is empty');
  permille(duty.urgencyPermille,'Motivation duty urgency');
  requireCondition(MOTIVATION_DUTY_STATUSES.includes(duty.status),'Unknown motivation duty status');
  if(duty.fulfilledTick!==null)integer(duty.fulfilledTick,1);
  requireCondition((duty.status==='fulfilled')===(duty.fulfilledTick!==null),'Motivation duty fulfillment marker mismatch');
  return duty;
}

export function validateMotivationPlan(plan){
  if(plan===null)return null;
  record(plan);
  fields(plan,['planId','goalId','kind','steps','stepIndex','status','createdDay','deadlineDay','requestId']);
  integer(plan.planId,1);
  requireCondition(MOTIVATION_PLAN_KINDS.includes(plan.kind),'Unknown motivation plan kind');
  denseArray(plan.steps,MAX_MOTIVATION_PLAN_STEPS);
  requireCondition(PLAN_STEP_SHAPES[plan.kind].some(shape=>shape.length===plan.steps.length &&
    shape.every((step,index)=>step===plan.steps[index])),'Motivation plan steps do not match their fixed kind');
  requireCondition(plan.kind==='recover-health'?plan.goalId!==null:plan.goalId===null,'Motivation plan goal binding mismatch');
  if(plan.goalId!==null)integer(plan.goalId,1);
  integer(plan.createdDay,1);integer(plan.deadlineDay,1);
  requireCondition(plan.deadlineDay>=plan.createdDay,'Motivation plan deadline precedes its creation');
  if(plan.kind==='recover-rest')requireCondition(plan.deadlineDay===plan.createdDay,'Rest plan deadline must be its own creation day');
  if(plan.kind==='aid-village')identifier(plan.requestId);
  else requireCondition(plan.requestId===null,'Only duty plans carry a request reference');
  requireCondition(MOTIVATION_PLAN_STATUSES.includes(plan.status),'Unknown motivation plan status');
  integer(plan.stepIndex);
  if(plan.status==='completed')requireCondition(plan.stepIndex===plan.steps.length,'Completed plan step index must sit past its last step');
  else requireCondition(plan.stepIndex<plan.steps.length,'Motivation plan step index exceeds its steps');
  return plan;
}

export function validateMotivationCandidate(candidate){
  record(candidate);
  fields(candidate,['action','provider','sourceRef','eligible','score','support','opposition','reasonCode','selectable','selectionBlockCode']);
  requireCondition(MOTIVATION_ACTIONS.includes(candidate.action),'Unknown motivation candidate action');
  const expectedProvider=candidate.action==='WorkForPay'?'role-request':candidate.action==='Rest'?'fatigue-need':
    candidate.action==='NoAction'?'fallback':'health-need';
  requireCondition(candidate.provider===expectedProvider,'Motivation candidate provider mismatch');
  if(candidate.action==='WorkForPay'){
    requireCondition(candidate.sourceRef===null||
      (typeof candidate.sourceRef==='string'&&IDENTIFIER_PATTERN.test(candidate.sourceRef)),
      'Invalid duty candidate source reference');
    // An open duty candidate always names the pending request that opened it.
    requireCondition(!candidate.eligible||typeof candidate.sourceRef==='string',
      'An eligible duty candidate must cite its request identifier');
  }
  else requireCondition(candidate.sourceRef===(candidate.action==='Rest'?'self-fatigue':
    candidate.action==='NoAction'?null:'recover-health'),'Motivation candidate source reference mismatch');
  requireCondition(typeof candidate.eligible==='boolean','Invalid motivation candidate eligibility');
  requireCondition(MOTIVATION_REASON_CODES.includes(candidate.reasonCode),'Unknown motivation candidate reason');
  if(candidate.eligible){
    integer(candidate.support);integer(candidate.opposition);
    requireCondition(Number.isSafeInteger(candidate.score)&&candidate.score===candidate.support-candidate.opposition,
      'Motivation candidate score must be support minus opposition');
    requireCondition(candidate.selectable===(candidate.selectionBlockCode===null),
      'A selectable motivation candidate must be eligible and unblocked');
  }else{
    requireCondition(candidate.score===null&&candidate.support===0&&candidate.opposition===0,
      'Ineligible motivation candidates carry a null score and empty reasons');
    requireCondition(candidate.selectable===false&&candidate.selectionBlockCode==='SOFT_PRECONDITION_FAILED',
      'Ineligible motivation candidates are blocked by their soft precondition');
  }
  return candidate;
}

const COGNITION_EXTRA_DECISION_FIELDS=Object.freeze(['mode','sourceReviewDecisionId','sourceReviewEventSeq']);

function validateDecisionInternal(decision, expectedVersion, prefix, maxRefs, variant='motivation'){
  const cognition=variant==='cognition';
  record(decision);
  fields(decision,cognition?['version','decisionId','actorId','tick','goalId','planId','innerStance','committedIntent',
    'apparentAction','choice','reasonCode','gateReason','strainPermille','candidates','evidenceRefs','knowledgeFingerprint',
    ...COGNITION_EXTRA_DECISION_FIELDS]:['version','decisionId','actorId','tick','goalId','planId','innerStance','committedIntent',
    'apparentAction','choice','reasonCode','gateReason','strainPermille','candidates','evidenceRefs','knowledgeFingerprint']);
  requireCondition(decision.version===expectedVersion,'Unknown motivation decision version','UNSUPPORTED_VERSION');
  identifier(decision.decisionId);
  requireCondition(MOTIVATION_ACTOR_IDS.includes(decision.actorId),'Foreign motivation decision identity');
  integer(decision.tick,144);requireCondition(decision.tick%144===0,'Motivation decision must sit on a daily tick');
  requireCondition(decision.decisionId===prefix+decision.tick/144+'-'+decision.actorId,
    'Motivation decision identifier must follow the daily identity');
  if(decision.goalId!==null)integer(decision.goalId,1);
  if(decision.planId!==null)integer(decision.planId,1);
  requireCondition(MOTIVATION_STANCES.includes(decision.innerStance),'Unknown motivation stance');
  if(decision.committedIntent!==null){
    fields(decision.committedIntent,['goalId','kind']);integer(decision.committedIntent.goalId,1);
    requireCondition(decision.committedIntent.kind==='recover-health','Unknown motivation committed intent kind');
  }
  requireCondition(MOTIVATION_ACTIONS.includes(decision.apparentAction)&&MOTIVATION_ACTIONS.includes(decision.choice),
    'Unknown motivation action');
  requireCondition(decision.apparentAction===decision.choice,'Motivation apparent action and choice must agree');
  requireCondition(MOTIVATION_REASON_CODES.includes(decision.reasonCode),'Unknown motivation decision reason');
  permille(decision.strainPermille,'Motivation strain');
  denseArray(decision.candidates,MAX_MOTIVATION_CANDIDATES);
  if(cognition){
    requireCondition(decision.mode==='review'||decision.mode==='maintain','Unknown cognition decision mode');
    if(decision.mode==='review'){
      requireCondition(decision.sourceReviewDecisionId===null&&decision.sourceReviewEventSeq===null,
        'Cognition review decisions carry no maintain source');
      requireCondition(decision.candidates.length===MAX_MOTIVATION_CANDIDATES,'Cognition review must compare all candidates');
      requireCondition(MOTIVATION_GATES.includes(decision.gateReason),'Unknown cognition review gate');
    }else{
      requireCondition(decision.candidates.length===0,'Cognition maintain decisions must not carry fabricated candidates');
      requireCondition(COGNITION_MAINTAIN_GATES.includes(decision.gateReason),'Unknown cognition maintain gate');
      identifier(decision.sourceReviewDecisionId);
      const sourceIdentity=/^cognition-day-([1-9][0-9]*)-(actor-[23])$/.exec(decision.sourceReviewDecisionId);
      requireCondition(sourceIdentity!==null&&sourceIdentity[2]===decision.actorId,
        'Invalid cognition maintain source identity');
      const sourceDay=Number(sourceIdentity[1]);
      requireCondition(Number.isSafeInteger(sourceDay)&&sourceDay<decision.tick/144,
        'Cognition maintain source must be a strictly earlier daily decision');
      integer(decision.sourceReviewEventSeq,1);
      requireCondition(decision.gateReason==='CONTINUE_MAINTAIN'?decision.choice!=='NoAction':decision.choice==='NoAction',
        'Cognition maintain gate/choice mismatch');
    }
  }else{
    requireCondition(MOTIVATION_GATES.includes(decision.gateReason),'Unknown motivation gate');
    requireCondition(decision.candidates.length===MAX_MOTIVATION_CANDIDATES,'Missing motivation candidates');
  }
  if(decision.candidates.length>0){
    requireCondition(decision.candidates.every((candidate,index)=>candidate.action===MOTIVATION_ACTIONS[index]),
      'Out-of-order motivation candidates');
    for(const candidate of decision.candidates)validateMotivationCandidate(candidate);
    const chosen=decision.candidates.find(candidate=>candidate.action===decision.choice);
    requireCondition(chosen.selectable,'Motivation choice must be a selectable candidate');
    requireCondition(chosen.reasonCode===decision.reasonCode,'Motivation decision reason must be the chosen candidate reason');
  }
  denseArray(decision.evidenceRefs,maxRefs);let previous=0;
  for(const sequence of decision.evidenceRefs){integer(sequence,1);requireCondition(sequence>previous,'Dirty/duplicate motivation evidence');previous=sequence;}
  requireCondition(typeof decision.knowledgeFingerprint==='string'&&
    new TextEncoder().encode(decision.knowledgeFingerprint).length<=MAX_MOTIVATION_KNOWLEDGE_BYTES,
    'Motivation knowledge fingerprint exceeds budget','LIMIT_EXCEEDED');
  return decision;
}

export function validateMotivationDecision(decision){
  return validateDecisionInternal(decision, MOTIVATION_DECISION_VERSION, 'motivation-day-', MAX_MOTIVATION_EVIDENCE_REFS);
}

export function validateExperienceMotivationDecision(decision){
  inspectDescriptorTree(decision);
  return validateDecisionInternal(decision, 'experience-decision-v1', 'experience-day-', 69);
}

export function validateCognitionMotivationDecision(decision){
  inspectDescriptorTree(decision);
  return validateDecisionInternal(decision, COGNITION_DECISION_VERSION, 'cognition-day-', MAX_COGNITION_EVIDENCE_REFS, 'cognition');
}

export function validateMotivationOutcome(outcome){
  record(outcome);
  fields(outcome,['decisionId','actorId','commandId','status','code','delta','price','publicFoodProduced','failureOwner']);
  identifier(outcome.decisionId);
  requireCondition(MOTIVATION_ACTOR_IDS.includes(outcome.actorId),'Foreign motivation outcome identity');
  if(outcome.commandId!==null)identifier(outcome.commandId);
  requireCondition(MOTIVATION_OUTCOME_STATUSES.includes(outcome.status),'Unknown motivation outcome status');
  // A no-action decision never registers a command, so it can never cite a receipt either.
  requireCondition((outcome.status==='no-action')===(outcome.commandId===null),
    'Motivation no-action outcome must not carry a command');
  requireCondition(outcome.code===null||outcome.code==='RULE_REJECTED','Invalid motivation outcome code');
  requireCondition((outcome.status==='rejected')===(outcome.code==='RULE_REJECTED'),'Motivation outcome status/code mismatch');
  fields(outcome.delta,['wallet','herbs','health','fatigue']);
  for(const value of Object.values(outcome.delta))requireCondition(Number.isSafeInteger(value),'Invalid motivation outcome delta');
  if(outcome.price!==null)integer(outcome.price,1);
  integer(outcome.publicFoodProduced);
  if(outcome.status==='rejected'){
    fields(outcome.failureOwner,['planId','goalId']);integer(outcome.failureOwner.planId,1);
    if(outcome.failureOwner.goalId!==null)integer(outcome.failureOwner.goalId,1);
  }else requireCondition(outcome.failureOwner===null,'Only rejected motivation outcomes carry a failure owner');
  if(outcome.status!=='succeeded')requireCondition(Object.values(outcome.delta).every(value=>value===0)&&
    outcome.price===null&&outcome.publicFoodProduced===0,'Failed/no-action motivation outcome carries deltas');
  return outcome;
}

function validateModelInternal(model, expectedVersion, decisionValidator){
  record(model);
  requireCondition(model.version===expectedVersion,'Unknown motivation state version','UNSUPPORTED_VERSION');
  fields(model,['version','config','configFingerprint','requestCursor','cursor','actors']);
  validateMotivationConfig(model.config);
  requireCondition(model.configFingerprint===canonicalJson(model.config),'Motivation configuration fingerprint mismatch');
  integer(model.requestCursor);
  requireCondition(model.requestCursor<=model.config.requests.length,'Motivation request cursor exceeds configuration');
  integer(model.cursor);
  denseArray(model.actors,MAX_MOTIVATION_ACTORS);
  requireCondition(model.actors.length===MAX_MOTIVATION_ACTORS &&
    model.actors.every((actor,index)=>actor.actorId===MOTIVATION_ACTOR_IDS[index]),'Motivation roster mismatch');
  for(const actor of model.actors){
    fields(actor,['actorId','lastDuty','lastReviewedDutyId','activePlan','suspendedPlan','nextPlanId','lastDecision','lastOutcome']);
    validateMotivationDuty(actor.lastDuty);
    if(actor.lastReviewedDutyId!==null)identifier(actor.lastReviewedDutyId);
    validateMotivationPlan(actor.activePlan);validateMotivationPlan(actor.suspendedPlan);
    if(actor.activePlan!==null)requireCondition(actor.activePlan.status==='ready'||actor.activePlan.status==='blocked',
      'A finished plan cannot stay active');
    if(actor.suspendedPlan!==null){
      requireCondition(actor.suspendedPlan.status==='suspended','Only suspended plans occupy the suspension slot');
      requireCondition(actor.suspendedPlan.kind==='recover-health','Only the health plan may be suspended');
    }
    if(actor.activePlan!==null&&actor.suspendedPlan!==null)
      requireCondition(actor.activePlan.planId!==actor.suspendedPlan.planId,'Active and suspended plans must be distinct');
    integer(actor.nextPlanId,1);
    for(const plan of [actor.activePlan,actor.suspendedPlan])if(plan!==null)
      requireCondition(actor.nextPlanId>plan.planId,'Motivation plan counter must exceed existing plan identifiers');
    if(actor.lastDecision!==null){
      decisionValidator(actor.lastDecision);
      requireCondition(actor.lastDecision.actorId===actor.actorId,'Foreign motivation decision stored on this actor');
    }
    if(actor.lastOutcome!==null){
      validateMotivationOutcome(actor.lastOutcome);
      requireCondition(actor.lastDecision!==null,'Orphaned motivation outcome');
      requireCondition(actor.lastOutcome.actorId===actor.actorId &&
        actor.lastOutcome.decisionId===actor.lastDecision.decisionId,'Motivation decision/outcome pairing mismatch');
      requireCondition((actor.lastDecision.choice==='NoAction')===(actor.lastOutcome.status==='no-action'),
        'Motivation decision/outcome action mismatch');
    }
  }
  return model;
}

export function validateMotivationModel(model){
  return validateModelInternal(model, MOTIVATION_STATE_VERSION, validateMotivationDecision);
}

export function validateExperienceMotivationModel(model){
  inspectDescriptorTree(model);
  return validateModelInternal(model, 'experience-motivation-state-v1', validateExperienceMotivationDecision);
}

export function validateCognitionMotivationModel(model){
  inspectDescriptorTree(model);
  return validateModelInternal(model, COGNITION_MOTIVATION_STATE_VERSION, validateCognitionMotivationDecision);
}
