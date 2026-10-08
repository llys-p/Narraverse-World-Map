// M3-1A work experience kernel: a four-sample window of this actor's own WorkForPay authority
// results. The caller supplies the narrow projection; a later real success can push an older
// failure out of the window and so lower the derived reading, while no stored sample, past
// decision or past derivation is ever rewritten. Pure data in, pure data out: no world, event
// log, RNG, clock or filesystem access, and nothing here proves that an outcome really happened.
import { fields,record,integer,identifier,denseArray,cloneData,canonicalJson,requireCondition } from './data-contract.mjs';

export const WORK_EXPERIENCE_STATE_VERSION='work-experience-state-v1';
export const WORK_EXPERIENCE_VIEW_VERSION='work-experience-view-v1';
export const MAX_WORK_EXPERIENCE_SAMPLES=4;
export const MAX_WORK_EXPERIENCE_STATE_BYTES=8192;
export const MAX_WORK_EXPERIENCE_OUTCOME_BYTES=2048;
export const WORK_EXPERIENCE_PENALTY_STEP=100;
export const MAX_WORK_EXPERIENCE_PENALTY=300;
const WORK_EXPERIENCE_TOPIC='work-for-pay-execution';
const WORK_EXPERIENCE_ACTION='WorkForPay';
const WORK_EXPERIENCE_ACTOR_IDS=Object.freeze(['actor-2','actor-3']);
const WORK_EXPERIENCE_STATUSES=Object.freeze(['succeeded','rejected']);
const OUTCOME_FIELDS=['simulationId','actorId','sourceEventSeq','occurrenceTick','decisionId','commandId',
  'action','status','code'];
const STATE_FIELDS=['version','simulationId','actorId','samples'];

function byteLength(value){return new TextEncoder().encode(canonicalJson(value)).length;}

// Descriptor checks run before any value is read, so a getter is rejected without being executed;
// the byte budget is the next gate and still precedes business semantics such as ID length.
function cloneWithinBudget(value,budget,label){
  requireCondition(value!==null&&typeof value==='object','Expected '+label+' data record');
  const copy=cloneData(value);
  requireCondition(byteLength(copy)<=budget,label+' exceeds the fixed byte budget','LIMIT_EXCEEDED');
  return copy;
}

function validateOutcome(outcome){
  record(outcome);
  fields(outcome,OUTCOME_FIELDS);
  identifier(outcome.simulationId);
  requireCondition(WORK_EXPERIENCE_ACTOR_IDS.includes(outcome.actorId),'Unknown work experience actor');
  integer(outcome.sourceEventSeq,1);integer(outcome.occurrenceTick,1);
  identifier(outcome.decisionId);identifier(outcome.commandId);
  requireCondition(outcome.action===WORK_EXPERIENCE_ACTION,
    'Work experience only records this actor\'s WorkForPay results');
  requireCondition(WORK_EXPERIENCE_STATUSES.includes(outcome.status),'Unknown work experience outcome status');
  requireCondition(outcome.code===null||outcome.code==='RULE_REJECTED','Invalid work experience outcome code');
  requireCondition((outcome.status==='rejected')===(outcome.code==='RULE_REJECTED'),
    'Work experience rejection must carry the authority rejection code');
  return outcome;
}

function validateState(state){
  record(state);
  fields(state,STATE_FIELDS);
  requireCondition(state.version===WORK_EXPERIENCE_STATE_VERSION,'Unknown work experience state version',
    'UNSUPPORTED_VERSION');
  identifier(state.simulationId);
  requireCondition(WORK_EXPERIENCE_ACTOR_IDS.includes(state.actorId),'Unknown work experience actor');
  denseArray(state.samples,MAX_WORK_EXPERIENCE_SAMPLES);
  let previous=null;const commands=new Set(),decisions=new Set();
  for(const sample of state.samples){
    validateOutcome(sample);
    requireCondition(sample.simulationId===state.simulationId && sample.actorId===state.actorId,
      'Work experience sample belongs to another identity');
    requireCondition(previous===null||sample.sourceEventSeq>previous.sourceEventSeq,
      'Work experience samples must be ordered by event sequence');
    requireCondition(previous===null||sample.occurrenceTick>=previous.occurrenceTick,
      'Work experience samples must not move backward in time');
    requireCondition(!commands.has(sample.commandId),'Duplicate work experience command identifier in the window');
    requireCondition(!decisions.has(sample.decisionId),'Duplicate work experience decision identifier in the window');
    commands.add(sample.commandId);decisions.add(sample.decisionId);previous=sample;
  }
  return state;
}

export function createWorkExperienceState(simulationId,actorId){
  identifier(simulationId);
  requireCondition(WORK_EXPERIENCE_ACTOR_IDS.includes(actorId),'Unknown work experience actor');
  return {version:WORK_EXPERIENCE_STATE_VERSION,simulationId,actorId,samples:[]};
}

export function validateWorkExperienceState(state){
  validateState(cloneWithinBudget(state,MAX_WORK_EXPERIENCE_STATE_BYTES,'Work experience state'));
  return state;
}

export function observeWorkOutcome(state,outcome){
  const current=validateState(cloneWithinBudget(state,MAX_WORK_EXPERIENCE_STATE_BYTES,'Work experience state'));
  const observed=validateOutcome(cloneWithinBudget(outcome,MAX_WORK_EXPERIENCE_OUTCOME_BYTES,'Work experience outcome'));
  requireCondition(observed.simulationId===current.simulationId && observed.actorId===current.actorId,
    'Work experience outcome belongs to another actor');
  const latest=current.samples.length===0?null:current.samples[current.samples.length-1];
  const held=current.samples.find(sample=>sample.sourceEventSeq===observed.sourceEventSeq);
  if(held!==undefined){
    // Key order is irrelevant, so an identical narrow projection of a windowed event is a no-op.
    requireCondition(canonicalJson(held)===canonicalJson(observed),
      'Conflicting work experience outcome for the same event sequence');
    return {state:current,disposition:'duplicate'};
  }
  if(latest!==null){
    requireCondition(observed.sourceEventSeq>latest.sourceEventSeq,
      'Work experience cannot re-learn an outcome older than the window');
    requireCondition(observed.occurrenceTick>=latest.occurrenceTick,
      'Work experience outcome moved backward in time');
  }
  requireCondition(!current.samples.some(sample=>sample.commandId===observed.commandId),
    'Work experience command identifier reused in the window');
  requireCondition(!current.samples.some(sample=>sample.decisionId===observed.decisionId),
    'Work experience decision identifier reused in the window');
  const next={...current,samples:[...current.samples,observed].slice(-MAX_WORK_EXPERIENCE_SAMPLES)};
  requireCondition(byteLength(next)<=MAX_WORK_EXPERIENCE_STATE_BYTES,
    'Work experience state exceeds the fixed byte budget','LIMIT_EXCEEDED');
  return {state:next,disposition:'learned'};
}

export function deriveWorkExperience(state){
  const current=validateState(cloneWithinBudget(state,MAX_WORK_EXPERIENCE_STATE_BYTES,'Work experience state'));
  const failureCount=current.samples.filter(sample=>sample.status==='rejected').length;
  return {version:WORK_EXPERIENCE_VIEW_VERSION,simulationId:current.simulationId,actorId:current.actorId,
    topic:WORK_EXPERIENCE_TOPIC,sampleCount:current.samples.length,failureCount,
    penaltyPermille:Math.min(MAX_WORK_EXPERIENCE_PENALTY,failureCount*WORK_EXPERIENCE_PENALTY_STEP),
    evidenceRefs:current.samples.map(sample=>sample.sourceEventSeq)};
}
