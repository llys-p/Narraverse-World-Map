// M3-1 cognitive review kernel: importance × relevance tiering with one review decision per
// world day and critical-signal wakeup (m3-kernels-contract-v1). Pure synchronous state
// machine — no clock, RNG, IO, world or cross-actor access. Signals are future adapter
// summaries; this module never reads hidden world state and never pauses plans or the world:
// 'maintain' only means "no candidate comparison this day".
import { fields,record,identifier,integer,denseArray,cloneData,canonicalJson,requireCondition,MAX_EVENTS } from './data-contract.mjs';
import { TICKS_PER_DAY } from './simulation-clock.mjs';

export const COGNITIVE_REVIEW_STATE_VERSION='cognitive-review-state-v1';
export const COGNITIVE_REVIEW_DECISION_VERSION='cognitive-review-decision-v1';
export const COGNITIVE_FULL_THRESHOLD=600000;
export const COGNITIVE_FULL_INTERVAL_TICKS=144;
export const COGNITIVE_REDUCED_INTERVAL_TICKS=432;
export const MAX_COGNITIVE_REVIEW_STATE_BYTES=8192;
export const MAX_COGNITIVE_REVIEW_INPUT_BYTES=2048;

const COGNITIVE_ACTOR_IDS=Object.freeze(['actor-2','actor-3']);
const INPUT_FIELDS=Object.freeze(['simulationId','actorId','tick','alive','importancePermille','relevancePermille',
  'urgentNeed','newMajorDuty','keyEvidenceChanged','goalOrPlanInvalidated']);
const STATE_FIELDS=Object.freeze(['version','simulationId','actorId','lastEvaluation','lastReviewTick']);
const DECISION_FIELDS=Object.freeze(['version','simulationId','actorId','tick','tier','score','intervalTicks',
  'mode','shouldReview','reasonCodes','nextReviewTick']);
const LAST_EVALUATION_FIELDS=Object.freeze(['input','decision']);
const REASON_ORDER=Object.freeze(['INITIAL','PROMOTED','URGENT_NEED','MAJOR_DUTY','EVIDENCE_CHANGED','PLAN_INVALIDATED','PERIOD_DUE']);
const DEAD_REASON='DEAD';
const INPUT_BOOLEAN_FIELDS=Object.freeze(['alive','urgentNeed','newMajorDuty','keyEvidenceChanged','goalOrPlanInvalidated']);
const INPUT_PERMILLE_FIELDS=Object.freeze(['importancePermille','relevancePermille']);

// Fail-closed plain-JSON scan: cloneData checks descriptors (enumerable data properties, plain
// prototypes, dense arrays, no cycles/symbols/functions) before ever reading a value, so
// accessors are rejected without executing their getters.
function canonicalBytes(value){return new TextEncoder().encode(canonicalJson(value)).length;}
function budgetCheck(value,limit,label){
  requireCondition(canonicalBytes(value)<=limit,`${label} exceeds budget`,'LIMIT_EXCEEDED');
}
function inspectInputTree(value,ancestors=new Set(),depth=0){
  requireCondition(depth<=64,'Data nesting budget exceeded','LIMIT_EXCEEDED');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){
    requireCondition(Number.isFinite(value),'Non-finite number');
    return;
  }
  requireCondition(typeof value==='object','Non-JSON data');
  requireCondition(!ancestors.has(value),'Cyclic data');
  ancestors.add(value);
  if(Array.isArray(value)){
    requireCondition(Object.getPrototypeOf(value)===Array.prototype,'Unsupported array prototype');
    denseArray(value,MAX_EVENTS);
    for(let i=0;i<value.length;i++)
      inspectInputTree(Object.getOwnPropertyDescriptor(value,String(i)).value,ancestors,depth+1);
  }else{
    record(value);
    for(const key of Object.keys(value))
      inspectInputTree(Object.getOwnPropertyDescriptor(value,key).value,ancestors,depth+1);
  }
  ancestors.delete(value);
}
function safeAdd(a,b){
  requireCondition(a<=Number.MAX_SAFE_INTEGER-b,'Safe-integer addition overflow','LIMIT_EXCEEDED');
  return a+b;
}
function validateInputShape(input){
  fields(input,INPUT_FIELDS);
  identifier(input.simulationId);
  requireCondition(COGNITIVE_ACTOR_IDS.includes(input.actorId),'Unknown cognitive review actor');
  integer(input.tick);
  requireCondition(input.tick%TICKS_PER_DAY===0,'Cognitive review is only eligible at day boundaries');
  for(const key of INPUT_BOOLEAN_FIELDS)requireCondition(typeof input[key]==='boolean',`Input ${key} must be boolean`);
  for(const key of INPUT_PERMILLE_FIELDS)
    requireCondition(Number.isSafeInteger(input[key])&&input[key]>=0&&input[key]<=1000,`Input ${key} out of range`);
}
function scoreOf(input){return input.importancePermille*input.relevancePermille;}
function tierOf(score,alive){return alive?(score>=COGNITIVE_FULL_THRESHOLD?'full':'reduced'):'dormant';}
function intervalOf(tier){
  return tier==='full'?COGNITIVE_FULL_INTERVAL_TICKS:tier==='reduced'?COGNITIVE_REDUCED_INTERVAL_TICKS:null;
}
function validateDecisionShape(decision,savedInput){
  fields(decision,DECISION_FIELDS);
  requireCondition(decision.version===COGNITIVE_REVIEW_DECISION_VERSION,'Unknown cognitive review decision version','UNSUPPORTED_VERSION');
  requireCondition(decision.simulationId===savedInput.simulationId&&decision.actorId===savedInput.actorId,'Decision identity mismatch');
  requireCondition(decision.tick===savedInput.tick,'Decision tick does not match its input');
  const score=scoreOf(savedInput),tier=tierOf(score,savedInput.alive);
  requireCondition(decision.score===score,'Decision score does not match the input product');
  requireCondition(decision.tier===tier,'Decision tier does not match the score');
  requireCondition(decision.intervalTicks===intervalOf(tier),'Decision interval does not match its tier');
  denseArray(decision.reasonCodes,REASON_ORDER.length);
  if(tier==='dormant'){
    requireCondition(decision.mode==='dormant'&&decision.shouldReview===false,'Dormant decision mode fields mismatch');
    requireCondition(decision.reasonCodes.length===1&&decision.reasonCodes[0]===DEAD_REASON,'Dormant reasons must be exactly DEAD');
    return;
  }
  requireCondition(decision.mode==='review'||decision.mode==='maintain','Invalid alive decision mode');
  requireCondition(decision.shouldReview===(decision.mode==='review'),'shouldReview must match mode');
  if(decision.mode==='review')requireCondition(decision.reasonCodes.length>0,'Review decisions need at least one reason');
  else requireCondition(decision.reasonCodes.length===0,'Maintain decisions must not carry reasons');
  let previous=-1;
  for(const reason of decision.reasonCodes){
    const index=REASON_ORDER.indexOf(reason);
    requireCondition(index>=0&&index>previous,'Reason codes must be legal, unique and in fixed order');
    previous=index;
  }
}
// Shared business validation over a cloned state; both the validator and the evaluator go
// through this so a served state and a produced state satisfy exactly the same invariants.
function validateStateBusiness(state){
  fields(state,STATE_FIELDS);
  requireCondition(state.version===COGNITIVE_REVIEW_STATE_VERSION,'Unknown cognitive review state version','UNSUPPORTED_VERSION');
  identifier(state.simulationId);
  requireCondition(COGNITIVE_ACTOR_IDS.includes(state.actorId),'Unknown cognitive review actor');
  requireCondition(state.lastReviewTick===null||(Number.isSafeInteger(state.lastReviewTick)&&state.lastReviewTick>=0),
    'Invalid lastReviewTick');
  if(state.lastEvaluation===null){
    requireCondition(state.lastReviewTick===null,'Empty cognitive review state must not carry a review tick');
    return;
  }
  fields(state.lastEvaluation,LAST_EVALUATION_FIELDS);
  const savedInput=state.lastEvaluation.input,savedDecision=state.lastEvaluation.decision;
  validateInputShape(savedInput);
  requireCondition(savedInput.simulationId===state.simulationId&&savedInput.actorId===state.actorId,'Saved input identity mismatch');
  validateDecisionShape(savedDecision,savedInput);
  requireCondition(state.lastReviewTick===null||state.lastReviewTick<=savedInput.tick,'Review tick exceeds its evaluation tick');
  if(savedInput.alive){
    requireCondition(state.lastReviewTick!==null,'Alive evaluations must carry a review tick');
    if(savedDecision.mode==='review')requireCondition(state.lastReviewTick===savedInput.tick,'Review must move the review tick to the evaluation tick');
    else requireCondition(state.lastReviewTick<savedInput.tick,'Maintain must keep the previous review tick');
    requireCondition(savedDecision.nextReviewTick===safeAdd(state.lastReviewTick,savedDecision.intervalTicks),
      'nextReviewTick must equal the review tick plus the tier interval');
  }else{
    requireCondition(savedDecision.nextReviewTick===null,'Dormant nextReviewTick must be null');
  }
}

export function createCognitiveReviewState(simulationId,actorId){
  identifier(simulationId);
  requireCondition(COGNITIVE_ACTOR_IDS.includes(actorId),'Unknown cognitive review actor');
  return {version:COGNITIVE_REVIEW_STATE_VERSION,simulationId,actorId,lastEvaluation:null,lastReviewTick:null};
}

export function validateCognitiveReviewState(state){
  inspectInputTree(state);
  const stateClone=cloneData(state);
  budgetCheck(stateClone,MAX_COGNITIVE_REVIEW_STATE_BYTES,'Cognitive review state');
  validateStateBusiness(stateClone);
  return state;
}

export function evaluateCognitiveReview(state,input){
  inspectInputTree(state);
  inspectInputTree(input);
  const stateClone=cloneData(state),inputClone=cloneData(input);
  budgetCheck(inputClone,MAX_COGNITIVE_REVIEW_INPUT_BYTES,'Cognitive review input');
  budgetCheck(stateClone,MAX_COGNITIVE_REVIEW_STATE_BYTES,'Cognitive review state');
  validateStateBusiness(stateClone);
  validateInputShape(inputClone);
  requireCondition(inputClone.simulationId===stateClone.simulationId&&inputClone.actorId===stateClone.actorId,
    'Cognitive review identity mismatch');
  const saved=stateClone.lastEvaluation;
  if(saved){
    requireCondition(inputClone.tick>=saved.input.tick,'Cognitive review tick moved backwards');
    if(inputClone.tick===saved.input.tick){
      requireCondition(canonicalJson(inputClone)===canonicalJson(saved.input),'Conflicting cognitive review input for the same tick');
      return {state:cloneData(stateClone),decision:cloneData(saved.decision)};
    }
  }
  requireCondition(!(saved&&saved.input.alive===false&&inputClone.alive),'Cognitive review actors cannot revive');
  const score=scoreOf(inputClone),tier=tierOf(score,inputClone.alive),interval=intervalOf(tier);
  let lastReviewTick=stateClone.lastReviewTick;
  const reasons=[];
  if(inputClone.alive){
    if(lastReviewTick===null)reasons.push('INITIAL');
    if(saved&&saved.input.alive===true&&saved.decision.tier==='reduced'&&tier==='full')reasons.push('PROMOTED');
    if(inputClone.urgentNeed)reasons.push('URGENT_NEED');
    if(inputClone.newMajorDuty)reasons.push('MAJOR_DUTY');
    if(inputClone.keyEvidenceChanged)reasons.push('EVIDENCE_CHANGED');
    if(inputClone.goalOrPlanInvalidated)reasons.push('PLAN_INVALIDATED');
    if(lastReviewTick!==null&&inputClone.tick>=safeAdd(lastReviewTick,interval))reasons.push('PERIOD_DUE');
  }
  let mode,shouldReview,decisionReasons;
  if(!inputClone.alive){mode='dormant';shouldReview=false;decisionReasons=[DEAD_REASON];}
  else if(reasons.length>0){mode='review';shouldReview=true;decisionReasons=reasons;lastReviewTick=inputClone.tick;}
  else{mode='maintain';shouldReview=false;decisionReasons=[];}
  const nextReviewTick=inputClone.alive&&lastReviewTick!==null?safeAdd(lastReviewTick,interval):null;
  const decision={version:COGNITIVE_REVIEW_DECISION_VERSION,simulationId:inputClone.simulationId,actorId:inputClone.actorId,
    tick:inputClone.tick,tier,score,intervalTicks:interval,mode,shouldReview,reasonCodes:decisionReasons,nextReviewTick};
  const nextState={version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:stateClone.simulationId,actorId:stateClone.actorId,
    lastEvaluation:{input:cloneData(inputClone),decision:cloneData(decision)},lastReviewTick};
  budgetCheck(nextState,MAX_COGNITIVE_REVIEW_STATE_BYTES,'Cognitive review state');
  validateStateBusiness(nextState);
  return {state:cloneData(nextState),decision:cloneData(decision)};
}
