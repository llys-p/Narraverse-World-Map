// M3-1A work experience kernel tests. Every expected number here is hand-computed from the
// taskbook's fixed window rule (penalty = min(300, 100 * failures in the last four samples));
// nothing is derived from the module under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createWorkExperienceState,validateWorkExperienceState,observeWorkOutcome,deriveWorkExperience,
  WORK_EXPERIENCE_STATE_VERSION,WORK_EXPERIENCE_VIEW_VERSION,MAX_WORK_EXPERIENCE_SAMPLES,
  MAX_WORK_EXPERIENCE_STATE_BYTES,MAX_WORK_EXPERIENCE_OUTCOME_BYTES,WORK_EXPERIENCE_PENALTY_STEP,
  MAX_WORK_EXPERIENCE_PENALTY } from '../../runtime/core/work-experience.mjs';

const SIM='m3-experience';
const outcomeOf=(over={})=>({simulationId:SIM,actorId:'actor-2',sourceEventSeq:1,occurrenceTick:12,
  decisionId:'motivation-day-1-actor-2',commandId:'motivation-day-1-actor-2',action:'WorkForPay',
  status:'succeeded',code:null,...structuredClone(over)});
// A distinct decisionId/commandId pair per sample: the window rejects either reuse.
const sample=(seq,tick,result,tag)=>result==='F'
  ?outcomeOf({sourceEventSeq:seq,occurrenceTick:tick,decisionId:'dec-'+tag,commandId:'cmd-'+tag,status:'rejected',
    code:'RULE_REJECTED'})
  :outcomeOf({sourceEventSeq:seq,occurrenceTick:tick,decisionId:'dec-'+tag,commandId:'cmd-'+tag});
const stateOf=(samples=[])=>({version:WORK_EXPERIENCE_STATE_VERSION,simulationId:SIM,actorId:'actor-2',
  samples:structuredClone(samples)});
const deepFreeze=value=>{
  if(value!==null&&typeof value==='object'){for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);Object.freeze(value);}
  return value;
};
// Feed a contract-shaped sequence and read the penalty after each observation.
const penalties=entries=>{
  let state=createWorkExperienceState(SIM,'actor-2');const seen=[];
  for(const entry of entries){const outcome=typeof entry==='function'?entry():entry;
    const result=observeWorkOutcome(state,outcome);state=result.state;seen.push(deriveWorkExperience(state));}
  return seen;
};
const rejects=(run,expected,why)=>assert.throws(run,expected,why);

test('constants: the fixed window, budget and step values',()=>{
  assert.deepEqual([WORK_EXPERIENCE_STATE_VERSION,WORK_EXPERIENCE_VIEW_VERSION],
    ['work-experience-state-v1','work-experience-view-v1']);
  assert.deepEqual([MAX_WORK_EXPERIENCE_SAMPLES,MAX_WORK_EXPERIENCE_STATE_BYTES,MAX_WORK_EXPERIENCE_OUTCOME_BYTES,
    WORK_EXPERIENCE_PENALTY_STEP,MAX_WORK_EXPERIENCE_PENALTY],[4,8192,2048,100,300]);
});

test('empty window: creates detached, validates and derives a zero reading',()=>{
  const state=createWorkExperienceState(SIM,'actor-2');
  assert.deepEqual(state,{version:WORK_EXPERIENCE_STATE_VERSION,simulationId:SIM,actorId:'actor-2',samples:[]});
  assert.deepEqual(deriveWorkExperience(state),{version:WORK_EXPERIENCE_VIEW_VERSION,simulationId:SIM,
    actorId:'actor-2',topic:'work-for-pay-execution',sampleCount:0,failureCount:0,penaltyPermille:0,evidenceRefs:[]});
  assert.equal(validateWorkExperienceState(state),state,'the validator must hand back the input itself');
  assert.notEqual(deriveWorkExperience(state).evidenceRefs,state.samples);
  rejects(()=>createWorkExperienceState(SIM,'actor-1'),{code:'INVALID_INPUT'},'only the two mind actors exist');
  rejects(()=>createWorkExperienceState(SIM,'actor-4'),{code:'INVALID_INPUT'});
  rejects(()=>createWorkExperienceState('x'.repeat(65),'actor-2'),{code:'INVALID_INPUT'});
});

test('correction: F,F,S,S,S,S reads 100,200,200,200,100,0 by hand',()=>{
  // Window and failures after each real result:
  // [F]=1 -> 100 | [F,F]=2 -> 200 | [F,F,S]=2 -> 200 | [F,F,S,S]=2 -> 200
  // [F,S,S,S]=1 -> 100 | [S,S,S,S]=0 -> 0
  const rows=penalties('FFSSSS'.split('').map((result,index)=>
    sample(index+1,12*index+12,result,index+1)));
  assert.deepEqual(rows.map(row=>row.penaltyPermille),[100,200,200,200,100,0]);
  assert.deepEqual(rows.map(row=>row.sampleCount),[1,2,3,4,4,4],'the window never grows past four');
  assert.deepEqual(rows[4].evidenceRefs,[2,3,4,5],'the oldest failure was pushed out');
  assert.deepEqual(rows[5].evidenceRefs,[3,4,5,6],'the whole failure run has left the window');
  assert.deepEqual(rows.map(row=>row.failureCount),[1,2,2,2,1,0]);
});

test('correction: four failures cap at 300 and the fifth evicts the oldest',()=>{
  const rows=penalties([sample(1,12,'F',1),sample(2,24,'F',2),sample(3,36,'F',3),sample(4,48,'F',4)]);
  assert.deepEqual(rows.map(row=>row.penaltyPermille),[100,200,300,300],'100*4 is clamped to 300');
  assert.deepEqual(rows[3].evidenceRefs,[1,2,3,4]);
  assert.equal(rows[3].sampleCount,4);
  // A fifth sample keeps the window at four and drops the oldest failure.
  const five=['F','F','F','F','S'].map((result,index)=>sample(index+1,12*index+12,result,index+1));
  const afterFifth=penalties(five)[4];
  assert.deepEqual([afterFifth.sampleCount,afterFifth.failureCount,afterFifth.penaltyPermille,afterFifth.evidenceRefs],
    [4,3,300,[2,3,4,5]],'the window slid to F,F,F,S');
});

test('observation: a new sample never rewrites the ones already stored',()=>{
  const first=sample(1,12,'F',1);
  const started=observeWorkOutcome(createWorkExperienceState(SIM,'actor-2'),first);
  const before=canonicalJson(started.state.samples);
  const next=observeWorkOutcome(started.state,sample(2,24,'S',2));
  assert.equal(canonicalJson(next.state.samples.slice(0,1)),before,'stored samples must be immutable');
  assert.notEqual(next.state,started.state);
  assert.notEqual(next.state.samples[0],started.state.samples[0]);
  assert.equal(next.disposition,'learned');
  assert.deepEqual(deriveWorkExperience(next.state).penaltyPermille,100);
});

test('identity: the state belongs to exactly one simulation and actor',()=>{
  const state=stateOf([sample(1,12,'F',1)]);
  rejects(()=>observeWorkOutcome(state,{...sample(2,24,'S',2),actorId:'actor-3'}),{code:'INVALID_INPUT'},
    'another actor\'s result is not mine');
  rejects(()=>observeWorkOutcome(state,{...sample(2,24,'S',2),simulationId:'other-sim'}),{code:'INVALID_INPUT'});
  rejects(()=>validateWorkExperienceState(stateOf([{...sample(1,12,'F',1),actorId:'actor-3'}])),{code:'INVALID_INPUT'});
  rejects(()=>validateWorkExperienceState(stateOf([{...sample(1,12,'F',1),simulationId:'other'}])),{code:'INVALID_INPUT'});
});

test('duplicate protection: same windowed event with an equal projection changes nothing',()=>{
  const held=sample(1,12,'F',1);
  const state=observeWorkOutcome(createWorkExperienceState(SIM,'actor-2'),held).state;
  const reordered={code:'RULE_REJECTED',status:'rejected',action:'WorkForPay',commandId:'cmd-1',
    decisionId:'dec-1',occurrenceTick:12,sourceEventSeq:1,actorId:'actor-2',simulationId:SIM};
  const again=observeWorkOutcome(state,reordered);
  assert.equal(again.disposition,'duplicate');
  assert.deepEqual(again.state,state);
  assert.notEqual(again.state,state,'a duplicate result must still be detached from the input');
  assert.deepEqual(deriveWorkExperience(again.state).penaltyPermille,100);
  // Same sequence, different payload: a conflict, not a duplicate.
  rejects(()=>observeWorkOutcome(state,{...held,status:'succeeded',code:null}),{code:'INVALID_INPUT'},
    'one event cannot be both a success and a rejection');
  rejects(()=>observeWorkOutcome(state,{...held,occurrenceTick:24}),{code:'INVALID_INPUT'});
  rejects(()=>observeWorkOutcome(state,{...held,commandId:'cmd-other'}),{code:'INVALID_INPUT'});
});

test('window order: evicted sequences, backward ticks and reused identifiers all fail',()=>{
  let state=createWorkExperienceState(SIM,'actor-2');
  for(let seq=1;seq<=5;seq++)state=observeWorkOutcome(state,sample(seq,12*seq,'F',seq)).state;
  rejects(()=>observeWorkOutcome(state,sample(1,72,'S',9)),{code:'INVALID_INPUT'},
    'seq 1 left the four-sample window and may not be re-learned');
  rejects(()=>observeWorkOutcome(state,sample(0,12,'S',9)),{code:'INVALID_INPUT'});
  rejects(()=>observeWorkOutcome(state,{...sample(6,72,'S',6),occurrenceTick:59}),{code:'INVALID_INPUT'},
    'a later event cannot report an earlier tick than the newest sample');
  // seq and tick move forward, but the command identifier already sits in the window.
  rejects(()=>observeWorkOutcome(state,sample(6,72,'S',3)),{code:'INVALID_INPUT'},
    'a reused command identifier is a conflict even at a newer sequence');
  const decisions=stateOf([{...sample(1,12,'F',1),commandId:'cmd-x'},{...sample(2,24,'F',2),commandId:'cmd-y'}]);
  rejects(()=>observeWorkOutcome(decisions,{...sample(3,36,'S',2),commandId:'cmd-z'}),{code:'INVALID_INPUT'},
    'a reused decision identifier is a conflict even at a newer sequence');
  assert.equal(observeWorkOutcome(state,sample(6,72,'S',6)).disposition,'learned','a fresh slot is still accepted');
});

test('array prototype guard: inherited map getters stay inert in every public input path',()=>{
  let getterCalls=0;
  const attempt=run=>{
    try{run();return {code:null,getterCalls};}
    catch(error){return {code:error?.code??null,getterCalls};}
  };
  const taintedArray=values=>{
    const array=structuredClone(values);
    const prototype=Object.create(Array.prototype);
    Object.defineProperty(prototype,'map',{get(){getterCalls++;return Array.prototype.map;}});
    Object.setPrototypeOf(array,prototype);
    return array;
  };
  const taintedState=stateOf([sample(1,12,'F',1)]);
  taintedState.samples=taintedArray(taintedState.samples);
  const validation=attempt(()=>validateWorkExperienceState(taintedState));
  const derivation=attempt(()=>deriveWorkExperience(taintedState));
  const observation=attempt(()=>observeWorkOutcome(taintedState,sample(2,24,'S',2)));

  const unknownNestedArray=taintedArray([1]);
  const state=createWorkExperienceState(SIM,'actor-2');
  const nested=attempt(()=>observeWorkOutcome(state,{...sample(1,12,'S',1),unknownNestedArray}));
  assert.deepEqual([validation,derivation,observation,nested].map(({code,getterCalls})=>({code,calls:getterCalls})),[
    {code:'INVALID_INPUT',calls:0},{code:'INVALID_INPUT',calls:0},
    {code:'INVALID_INPUT',calls:0},{code:'INVALID_INPUT',calls:0}
  ],'every public input path must reject before the inherited map getter executes');
});

test('narrow scope: only WorkForPay success or authority rejection is a sample',()=>{
  const state=createWorkExperienceState(SIM,'actor-2');
  for(const over of [{action:'Rest'},{action:'BuyMedicine'},{action:'UseMedicine'},{action:'NoAction'},
    {action:'WorkForPay',status:'no-action'},{action:'WorkForPay',code:'SOMETHING_ELSE'}])
    rejects(()=>observeWorkOutcome(state,{...outcomeOf(),...over}),{code:'INVALID_INPUT'},
      'rejected projection '+over.action+'/'+over.status);
  rejects(()=>observeWorkOutcome(state,{...outcomeOf(),status:'rejected'}),{code:'INVALID_INPUT'},
    'a rejection must carry RULE_REJECTED');
  rejects(()=>observeWorkOutcome(state,{...outcomeOf(),code:'RULE_REJECTED'}),{code:'INVALID_INPUT'},
    'a success must not carry a rejection code');
  assert.equal(deriveWorkExperience(observeWorkOutcome(state,outcomeOf()).state).failureCount,0);
});

test('shape: unknown keys, prototypes, sparse arrays, symbols, getters, cycles and unsafe integers',()=>{
  const state=stateOf([sample(1,12,'F',1)]);
  rejects(()=>validateWorkExperienceState({...state,extra:1}),{code:'INVALID_INPUT'},'unknown top-level key');
  rejects(()=>validateWorkExperienceState({...state,samples:[{...sample(1,12,'F',1),extra:1}]}),{code:'INVALID_INPUT'});
  rejects(()=>validateWorkExperienceState({...state,version:'work-experience-state-v2'}),{code:'UNSUPPORTED_VERSION'});
  rejects(()=>validateWorkExperienceState({...state,samples:{0:sample(1,12,'F',1)}}),{code:'INVALID_INPUT'});
  rejects(()=>validateWorkExperienceState(Object.assign(function tag(){},{...state})),{code:'INVALID_INPUT'},
    'a function is not a data record');
  const sparse=structuredClone([sample(1,12,'F',1)]);delete sparse[0];
  rejects(()=>validateWorkExperienceState({...state,samples:sparse}),{code:'INVALID_INPUT'},'sparse array');
  const withSymbol={...state};withSymbol[Symbol('hidden')]=1;
  rejects(()=>validateWorkExperienceState(withSymbol),{code:'INVALID_INPUT'});
  rejects(()=>validateWorkExperienceState({...state,samples:[{...sample(1,12,'F',1),sourceEventSeq:2**53}]}),
    {code:'INVALID_INPUT'},'unsafe integer sequence');
  rejects(()=>validateWorkExperienceState({...state,samples:[{...sample(1,12,'F',1),sourceEventSeq:1.5}]}),
    {code:'INVALID_INPUT'});
  rejects(()=>validateWorkExperienceState({...state,samples:[{...sample(1,12,'F',1),occurrenceTick:NaN}]}),
    {code:'INVALID_INPUT'});
  const cyclic=structuredClone(sample(1,12,'F',1));cyclic.self=cyclic;
  rejects(()=>validateWorkExperienceState({...state,samples:[cyclic]}),{code:'INVALID_INPUT'},'cyclic data');
  let executed=false;
  const getter={...state,samples:[sample(1,12,'F',1)]};
  Object.defineProperty(getter,'peek',{enumerable:true,get(){executed=true;return 1;}});
  rejects(()=>validateWorkExperienceState(getter),{code:'INVALID_INPUT'},'accessor property');
  assert.equal(executed,false,'the rejection must not execute the getter');
  // A null-prototype record is ordinary data and stays valid.
  const bare=Object.assign(Object.create(null),{version:WORK_EXPERIENCE_STATE_VERSION,simulationId:SIM,
    actorId:'actor-2',samples:[]});
  assert.equal(validateWorkExperienceState(bare),bare);
  assert.equal(deriveWorkExperience(bare).penaltyPermille,0);
  assert.equal(observeWorkOutcome(bare,sample(1,12,'F',1)).disposition,'learned');
});

test('budget: oversized text fails as LIMIT_EXCEEDED before any ID rule is consulted',()=>{
  const huge='x'.repeat(MAX_WORK_EXPERIENCE_STATE_BYTES);
  assert.throws(()=>validateWorkExperienceState({...stateOf(),simulationId:huge}),
    {code:'LIMIT_EXCEEDED'},'state bytes are bounded ahead of the 64-character identifier rule');
  assert.throws(()=>observeWorkOutcome(createWorkExperienceState(SIM,'actor-2'),
    {...outcomeOf(),decisionId:'y'.repeat(MAX_WORK_EXPERIENCE_OUTCOME_BYTES+64)}),
    {code:'LIMIT_EXCEEDED'},'outcome bytes are bounded ahead of the identifier rule');
  // The legal maximum shape - four samples with the longest permitted identifiers - stays inside.
  const pad='z'.repeat(62);
  const fullest=stateOf([1,2,3,4].map(seq=>({...sample(seq,12*seq,'F',seq),
    decisionId:('d'+seq+pad).slice(0,64),commandId:('c'+seq+pad).slice(0,64)})));
  validateWorkExperienceState(fullest);
  assert.equal(fullest.samples.length,4);
  assert.ok(canonicalJson(fullest).length<MAX_WORK_EXPERIENCE_STATE_BYTES,
    'a maximum-shaped window must not need padding to stay legal');
});

test('purity: frozen inputs, detached results, stable re-reads and failed calls change nothing',()=>{
  const state=deepFreeze(stateOf([sample(1,12,'F',1)]));
  const outcome=deepFreeze(sample(2,24,'F',2));
  const before=canonicalJson(state);
  const learned=observeWorkOutcome(state,outcome);
  assert.equal(canonicalJson(state),before,'a successful observation rewrote the caller state');
  assert.notEqual(learned.state,state);
  assert.notEqual(learned.state.samples[1],outcome);
  const first=deriveWorkExperience(learned.state),second=deriveWorkExperience(learned.state);
  assert.deepEqual(first,second,'re-reading the same state must be deterministic');
  assert.notEqual(first.evidenceRefs,learned.state.samples,'derived views must not alias stored samples');
  assert.notEqual(first.evidenceRefs,second.evidenceRefs);
  const failing=deepFreeze(sample(1,60,'S',9));
  rejects(()=>observeWorkOutcome(learned.state,failing),{code:'INVALID_INPUT'});
  assert.equal(deriveWorkExperience(learned.state).failureCount,2,'a rejected call left no partial update');
});

test('serialization: a revived window is equivalent and keeps learning forward',()=>{
  const original=stateOf([sample(1,12,'F',1),sample(2,24,'S',2)]);
  const revived=JSON.parse(JSON.stringify(original));
  assert.deepEqual(deriveWorkExperience(revived),deriveWorkExperience(original));
  assert.deepEqual(deriveWorkExperience(original),{version:WORK_EXPERIENCE_VIEW_VERSION,simulationId:SIM,
    actorId:'actor-2',topic:'work-for-pay-execution',sampleCount:2,failureCount:1,penaltyPermille:100,
    evidenceRefs:[1,2]});
  const continued=observeWorkOutcome(revived,sample(3,36,'F',3));
  const expected=observeWorkOutcome(original,sample(3,36,'F',3));
  assert.deepEqual(continued.state,expected.state);
  assert.equal(deriveWorkExperience(continued.state).penaltyPermille,200,'F,S,F -> two failures in the window');
});
