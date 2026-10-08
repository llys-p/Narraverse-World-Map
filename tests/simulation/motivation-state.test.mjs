// M2A1 motivation state: the §4.0 constant table, the motivation config/model structure and
// the own-budget checks. Pure data in, data out: no memory, mind, world or history replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as state from '../../runtime/core/motivation-state.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';

const {MOTIVATION_RULES,MOTIVATION_CONFIG_VERSION,MOTIVATION_STATE_VERSION,MOTIVATION_KNOWLEDGE_VERSION,
  MOTIVATION_DECISION_VERSION,MOTIVATION_INSPECTOR_VERSION,MAX_MOTIVATION_ACTORS,MAX_MOTIVATION_CANDIDATES,
  MAX_MOTIVATION_PLAN_STEPS,MAX_MOTIVATION_REQUESTS,MAX_MOTIVATION_INPUTS_PER_TICK,MAX_MOTIVATION_KNOWLEDGE_BYTES,
  MAX_MOTIVATION_INSPECTOR_BYTES,MAX_MOTIVATION_PLAN_TRANSITIONS,validateMotivationConfig,createMotivationModel,
  validateMotivationModel,validateMotivationPlan,validateMotivationDuty,validateMotivationDecision,
  validateMotivationOutcome} = state;

const requestOf=(over={})=>({requestId:'d01',tick:200,speakerId:'actor-1',listenerId:'actor-2',
  urgencyPermille:1000,expiresTick:432,...structuredClone(over)});
const configOf=(over={})=>({version:'motivation-config-v1',
  profiles:[{actorId:'actor-2',dutyWeightPermille:900,riskAversionPermille:200},
    {actorId:'actor-3',dutyWeightPermille:900,riskAversionPermille:200}],
  requests:[requestOf()],...structuredClone(over)});
const profileOf=(actorId,over)=>({actorId,dutyWeightPermille:900,riskAversionPermille:200,...structuredClone(over)});
const healthPlan=(over={})=>({planId:1,goalId:1,kind:'recover-health',steps:['BuyMedicine','UseMedicine'],
  stepIndex:0,status:'ready',createdDay:1,deadlineDay:21,requestId:null,...structuredClone(over)});
const dutyPlan=(over={})=>({planId:2,goalId:null,kind:'aid-village',steps:['WorkForPay'],stepIndex:0,status:'ready',
  createdDay:2,deadlineDay:2,requestId:'d01',...structuredClone(over)});
const restPlan=(over={})=>({planId:3,goalId:null,kind:'recover-rest',steps:['Rest'],stepIndex:0,status:'ready',
  createdDay:3,deadlineDay:3,requestId:null,...structuredClone(over)});
const dutyOf=(over={})=>({requestId:'d01',sourceEventSeq:12,observedTick:200,expiresTick:432,
  urgencyPermille:1000,status:'pending',fulfilledTick:null,...structuredClone(over)});
const candidateOf=(action,over={})=>({action,provider:action==='WorkForPay'?'role-request':
  action==='Rest'?'fatigue-need':action==='NoAction'?'fallback':'health-need',
  sourceRef:action==='Rest'?'self-fatigue':action==='WorkForPay'||action==='NoAction'?null:'recover-health',
  eligible:true,score:700,support:700,opposition:0,reasonCode:'RECOVER_HEALTH',selectable:true,
  selectionBlockCode:null,...structuredClone(over)});
const softCandidate=(action,reasonCode)=>candidateOf(action,{eligible:false,score:null,support:0,opposition:0,
  reasonCode,selectable:false,selectionBlockCode:'SOFT_PRECONDITION_FAILED'});
const decisionOf=(over={})=>({version:'motivation-decision-v1',decisionId:'motivation-day-2-actor-2',actorId:'actor-2',
  tick:288,goalId:1,planId:1,innerStance:'health-concerned',committedIntent:{goalId:1,kind:'recover-health'},
  apparentAction:'UseMedicine',choice:'UseMedicine',reasonCode:'RECOVER_HEALTH',gateReason:'CONTINUE_COMMITTED',
  strainPermille:950,
  candidates:[candidateOf('UseMedicine'),softCandidate('BuyMedicine','PRIVATE_MEDICINE_PRESENT'),
    softCandidate('WorkForPay','DUTY_UNAVAILABLE'),
    candidateOf('Rest',{score:650,support:650,reasonCode:'FATIGUE_RELIEF',selectable:false,
      selectionBlockCode:'COMMITMENT_PROTECTED'}),
    candidateOf('NoAction',{score:0,support:0,reasonCode:'WAIT',selectable:false,
      selectionBlockCode:'COMMITMENT_PROTECTED'})],
  evidenceRefs:[7,12],knowledgeFingerprint:'{"actorId":"actor-2"}',...structuredClone(over)});
const outcomeOf=(over={})=>({decisionId:'motivation-day-2-actor-2',actorId:'actor-2',commandId:'motivation-day-2-actor-2',
  status:'succeeded',code:null,delta:{wallet:-50,herbs:1,health:0,fatigue:0},price:50,publicFoodProduced:0,
  failureOwner:null,...structuredClone(over)});
const cleanOutcome=over=>outcomeOf({status:'no-action',code:null,delta:{wallet:0,herbs:0,health:0,fatigue:0},
  price:null,publicFoodProduced:0,commandId:null,...structuredClone(over)});
const rejectedOutcome=over=>outcomeOf({status:'rejected',code:'RULE_REJECTED',delta:{wallet:0,herbs:0,health:0,fatigue:0},
  price:null,publicFoodProduced:0,failureOwner:{planId:2,goalId:null},...structuredClone(over)});
const freshModel=()=>createMotivationModel(configOf());
const modelOf=(over={})=>Object.assign(freshModel(),structuredClone(over));
const actorOf=(over={})=>({actorId:'actor-2',lastDuty:null,lastReviewedDutyId:null,activePlan:null,suspendedPlan:null,
  nextPlanId:1,lastDecision:null,lastOutcome:null,...structuredClone(over)});
const modelWith=(actor2)=>validateMotivationModel({...freshModel(),actors:[actorOf(actor2),freshModel().actors[1]]});

test('constants: the contract §4.0 names and values are exported verbatim',()=>{
  assert.equal(MOTIVATION_RULES,'m-motivation-v1');
  assert.deepEqual([MOTIVATION_CONFIG_VERSION,MOTIVATION_STATE_VERSION,MOTIVATION_KNOWLEDGE_VERSION,
    MOTIVATION_DECISION_VERSION,MOTIVATION_INSPECTOR_VERSION],
    ['motivation-config-v1','motivation-state-v1','motivation-knowledge-v1','motivation-decision-v1',
      'motivation-inspector-v1']);
  assert.deepEqual([MAX_MOTIVATION_ACTORS,MAX_MOTIVATION_CANDIDATES,MAX_MOTIVATION_PLAN_STEPS,
    MAX_MOTIVATION_REQUESTS,MAX_MOTIVATION_INPUTS_PER_TICK,MAX_MOTIVATION_KNOWLEDGE_BYTES,
    MAX_MOTIVATION_INSPECTOR_BYTES,MAX_MOTIVATION_PLAN_TRANSITIONS],
    [2,5,2,64,8,16384,131072,8]);
});

test('config: the fixed two-profile roster and one valid request validate',()=>{
  assert.deepEqual(validateMotivationConfig(configOf()),configOf());
  assert.throws(()=>validateMotivationConfig({...configOf(),economics:{wage:20}}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationConfig({...configOf(),version:'motivation-config-v2'}),{code:'UNSUPPORTED_VERSION'});
  assert.throws(()=>validateMotivationConfig({...configOf(),profiles:[configOf().profiles[0]]}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationConfig({...configOf(),
    profiles:[profileOf('actor-3'),profileOf('actor-2')]}),{code:'INVALID_INPUT'},'the roster order is fixed');
  assert.throws(()=>validateMotivationConfig({...configOf(),
    profiles:[profileOf('actor-2',{dutyWeightPermille:1001}),profileOf('actor-3')]}),{code:'LIMIT_EXCEEDED'});
  assert.throws(()=>validateMotivationConfig({...configOf(),
    profiles:[profileOf('actor-2',{riskAversionPermille:-1}),profileOf('actor-3')]}),{code:'INVALID_INPUT'});
  assert.doesNotThrow(()=>validateMotivationConfig({...configOf(),
    profiles:[profileOf('actor-2',{dutyWeightPermille:0,riskAversionPermille:1000}),profileOf('actor-3')]}));
});

test('config: requests are unique, ordered by tick then code order, and windowed',()=>{
  const two=[requestOf(),requestOf({requestId:'d02'})];
  assert.deepEqual(validateMotivationConfig({...configOf(),requests:two}).requests,two);
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[two[1],two[0]]}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[two[0],two[0]]}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationConfig({...configOf(),
    requests:[requestOf(),requestOf({requestId:'d00'})]}),{code:'INVALID_INPUT'},'same tick needs code order');
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[requestOf({expiresTick:200})]}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[requestOf({expiresTick:489})]}),{code:'LIMIT_EXCEEDED'});
  assert.doesNotThrow(()=>validateMotivationConfig({...configOf(),requests:[requestOf({expiresTick:488})]}));
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[requestOf({speakerId:'actor-2'})]}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[requestOf({listenerId:'actor-1'})]}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[requestOf({urgencyPermille:1001})]}),{code:'LIMIT_EXCEEDED'});
  assert.doesNotThrow(()=>validateMotivationConfig({...configOf(),requests:[requestOf({urgencyPermille:899})]}),
    '899 is a legal ordinary request');
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:[requestOf({requestId:'d 1'})]}),{code:'INVALID_INPUT'});
});

test('config: expiry overflow is LIMIT_EXCEEDED before any range comparison',()=>{
  const edge=Number.MAX_SAFE_INTEGER-287;
  assert.throws(()=>validateMotivationConfig({...configOf(),
    requests:[requestOf({tick:edge,expiresTick:edge+288})]}),{code:'LIMIT_EXCEEDED'});
  // A hostile tick beyond the overflow guard fails here rather than passing a wrapped range check.
  assert.throws(()=>validateMotivationConfig({...configOf(),
    requests:[requestOf({tick:Number.MAX_SAFE_INTEGER,expiresTick:1})]}),{code:'LIMIT_EXCEEDED'});
});

test('config: request count and per-tick batch budgets are enforced as LIMIT_EXCEEDED',()=>{
  const fill=(count,perTick)=>Array.from({length:count},(_,index)=>({requestId:'r'+String(index).padStart(3,'0'),
    tick:144*Math.floor(index/perTick)+144,speakerId:'actor-1',listenerId:'actor-2',urgencyPermille:1000,
    expiresTick:144*Math.floor(index/perTick)+432}));
  assert.equal(validateMotivationConfig({...configOf(),requests:fill(MAX_MOTIVATION_REQUESTS,1)}).requests.length,64);
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:fill(MAX_MOTIVATION_REQUESTS+1,1)}),
    {code:'LIMIT_EXCEEDED'});
  // The combined M1 stimuli + M2 request total is the runtime layer's check; 64 is this config's own cap.
  assert.equal(validateMotivationConfig({...configOf(),requests:fill(MAX_MOTIVATION_INPUTS_PER_TICK,
    MAX_MOTIVATION_INPUTS_PER_TICK)}).requests.length,8);
  assert.throws(()=>validateMotivationConfig({...configOf(),requests:fill(MAX_MOTIVATION_INPUTS_PER_TICK+1,
    MAX_MOTIVATION_INPUTS_PER_TICK+1)}),{code:'LIMIT_EXCEEDED'});
});

test('model: creation starts empty, clones the config and fingerprints it canonically',()=>{
  const config=configOf();
  const model=createMotivationModel(config);
  assert.deepEqual(Object.keys(model),['version','config','configFingerprint','requestCursor','cursor','actors']);
  assert.equal(model.version,MOTIVATION_STATE_VERSION);
  assert.equal(model.configFingerprint,canonicalJson(config));
  assert.equal(model.requestCursor,0);assert.equal(model.cursor,0);
  assert.deepEqual(model.actors.map(actor=>actor.actorId),['actor-2','actor-3']);
  for(const actor of model.actors)assert.deepEqual(actor,
    {actorId:actor.actorId,lastDuty:null,lastReviewedDutyId:null,activePlan:null,suspendedPlan:null,nextPlanId:1,
      lastDecision:null,lastOutcome:null});
  config.requests[0].urgencyPermille=500;config.profiles[0].dutyWeightPermille=10;
  assert.equal(model.config.requests[0].urgencyPermille,1000,'the model must not alias the caller config');
  assert.equal(model.config.profiles[0].dutyWeightPermille,900);
  assert.throws(()=>createMotivationModel(),{code:'INVALID_INPUT'});
});

test('model: fingerprint, roster and cursors are structural checks',()=>{
  assert.throws(()=>validateMotivationModel(modelOf({configFingerprint:'{}'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationModel(modelOf({version:'motivation-state-v2'})),{code:'UNSUPPORTED_VERSION'});
  assert.doesNotThrow(()=>validateMotivationModel(modelOf()));
  assert.throws(()=>validateMotivationModel({...modelOf(),requestCursor:2}),{code:'INVALID_INPUT'},
    'the request cursor cannot run past this config alone');
  assert.throws(()=>validateMotivationModel(modelOf({cursor:-1})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationModel(modelOf({extra:1})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationModel({...modelOf(),actors:[modelOf().actors[0]]}),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationModel({...modelOf(),
    actors:[modelOf().actors[1],modelOf().actors[0]]}),{code:'INVALID_INPUT'});
});

test('model: plan slots keep one health plan and never carry finished plans',()=>{
  assert.throws(()=>modelWith({activePlan:healthPlan({status:'completed',stepIndex:2})}),{code:'INVALID_INPUT'});
  assert.throws(()=>modelWith({activePlan:healthPlan({status:'suspended'})}),{code:'INVALID_INPUT'});
  assert.throws(()=>modelWith({activePlan:healthPlan({planId:1}),suspendedPlan:healthPlan({planId:1,status:'suspended'})}),
    {code:'INVALID_INPUT'},'active and suspended plans must be distinct');
  assert.throws(()=>modelWith({suspendedPlan:restPlan({status:'suspended'})}),{code:'INVALID_INPUT'});
  assert.throws(()=>modelWith({activePlan:healthPlan(),nextPlanId:0}),{code:'INVALID_INPUT'});
  assert.throws(()=>modelWith({activePlan:healthPlan(),nextPlanId:1.5}),{code:'INVALID_INPUT'});
  assert.doesNotThrow(()=>modelWith({lastDuty:dutyOf(),lastReviewedDutyId:'d01',
    suspendedPlan:healthPlan({status:'suspended'}),nextPlanId:3}));
  assert.doesNotThrow(()=>modelWith({activePlan:dutyPlan(),suspendedPlan:healthPlan({status:'suspended'}),nextPlanId:3}));
  assert.doesNotThrow(()=>modelWith({activePlan:healthPlan({status:'blocked'})}));
});

test('plan: fixed step shapes, goal/request binding and deadlines are structural',()=>{
  assert.deepEqual(validateMotivationPlan(healthPlan()),healthPlan());
  assert.deepEqual(validateMotivationPlan(null),null);
  assert.throws(()=>validateMotivationPlan(healthPlan({steps:['UseMedicine','BuyMedicine']})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationPlan(healthPlan({steps:['Rest']})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationPlan(healthPlan({steps:['BuyMedicine','UseMedicine','Rest']})),
    {code:'LIMIT_EXCEEDED'});
  assert.throws(()=>validateMotivationPlan(healthPlan({goalId:null})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationPlan(healthPlan({createdDay:0})),{code:'INVALID_INPUT'});
  assert.doesNotThrow(()=>validateMotivationPlan(healthPlan({deadlineDay:20})),
    'goal-matched deadlines are a world invariant, not a plan-local one');
  assert.throws(()=>validateMotivationPlan(healthPlan({stepIndex:2})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationPlan(healthPlan({status:'completed',stepIndex:1})),{code:'INVALID_INPUT'});
  assert.doesNotThrow(()=>validateMotivationPlan(healthPlan({status:'completed',stepIndex:2})));
  assert.doesNotThrow(()=>validateMotivationPlan(healthPlan({status:'cancelled',stepIndex:1})));
  assert.throws(()=>validateMotivationPlan(healthPlan({extra:1})),{code:'INVALID_INPUT'});
  assert.deepEqual(validateMotivationPlan(dutyPlan()),dutyPlan());
  assert.throws(()=>validateMotivationPlan(dutyPlan({requestId:null})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationPlan(dutyPlan({goalId:1})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationPlan(dutyPlan({deadlineDay:1})),{code:'INVALID_INPUT'});
  assert.deepEqual(validateMotivationPlan(restPlan()),restPlan());
  assert.throws(()=>validateMotivationPlan(restPlan({deadlineDay:4})),{code:'INVALID_INPUT'},
    'a rest plan deadline is its own creation day');
});

test('duty: status and fulfillment tick pair, and the window stays inside the fixed TTL',()=>{
  assert.deepEqual(validateMotivationDuty(dutyOf()),dutyOf());
  assert.deepEqual(validateMotivationDuty(null),null);
  assert.throws(()=>validateMotivationDuty(dutyOf({status:'fulfilled'})),{code:'INVALID_INPUT'},
    'a fulfilled duty must carry the tick it was fulfilled at');
  assert.doesNotThrow(()=>validateMotivationDuty(dutyOf({status:'fulfilled',fulfilledTick:288})));
  assert.throws(()=>validateMotivationDuty(dutyOf({status:'fulfilled',fulfilledTick:0})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDuty(dutyOf({urgencyPermille:1001})),{code:'LIMIT_EXCEEDED'});
  assert.throws(()=>validateMotivationDuty(dutyOf({expiresTick:200})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDuty(dutyOf({expiresTick:489})),{code:'LIMIT_EXCEEDED'});
  assert.throws(()=>validateMotivationDuty(dutyOf({sourceEventSeq:0})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDuty(dutyOf({status:'cancelled'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDuty(dutyOf({extra:1})),{code:'INVALID_INPUT'});
});

test('decision: identity, candidate order, gate and reason coupling are checked',()=>{
  assert.deepEqual(validateMotivationDecision(decisionOf()),decisionOf());
  assert.throws(()=>validateMotivationDecision(decisionOf({version:'motivation-decision-v2'})),
    {code:'UNSUPPORTED_VERSION'});
  assert.throws(()=>validateMotivationDecision(decisionOf({decisionId:'motivation-day-3-actor-2'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({decisionId:'society-day-2-actor-2'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({tick:289})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({actorId:'actor-1'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({apparentAction:'Rest'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({gateReason:'MAJOR_DUTY'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({innerStance:'angry'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({strainPermille:1001})),{code:'LIMIT_EXCEEDED'});
  assert.throws(()=>validateMotivationDecision(decisionOf({reasonCode:'DUTY'})),{code:'INVALID_INPUT'},
    'the decision reason must be the chosen candidate reason');
  assert.throws(()=>validateMotivationDecision(decisionOf({evidenceRefs:[12,7]})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({evidenceRefs:[7,7]})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({committedIntent:{goalId:1,kind:'aid-village'}})),
    {code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({committedIntent:{goalId:1,kind:'recover-health',extra:1}})),
    {code:'INVALID_INPUT'});
  const swapped=[decisionOf().candidates[1],decisionOf().candidates[0],...decisionOf().candidates.slice(2)];
  assert.throws(()=>validateMotivationDecision(decisionOf({candidates:swapped})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({candidates:decisionOf().candidates.slice(0,4)})),
    {code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationDecision(decisionOf({
    knowledgeFingerprint:'x'.repeat(MAX_MOTIVATION_KNOWLEDGE_BYTES+1)})),{code:'LIMIT_EXCEEDED'});
});

test('candidate: provider/sourceRef table, score identity and block codes are fixed',()=>{
  const rejects=(decision,reason)=>assert.throws(()=>validateMotivationDecision(decision),{code:'INVALID_INPUT'},reason);
  const withUse=over=>rejects(decisionOf({candidates:[candidateOf('UseMedicine',over),
    ...decisionOf().candidates.slice(1)]}),'rejected UseMedicine candidate shape '+over);
  withUse({provider:'role-request'});
  withUse({sourceRef:'self-fatigue'});
  withUse({score:699});
  withUse({score:null});
  withUse({support:700,opposition:10});
  withUse({selectable:false,selectionBlockCode:'COMMITMENT_PROTECTED'});
  withUse({selectionBlockCode:'URGENT_OVERRIDE'});
  withUse({eligible:false,score:null,support:0,opposition:0});
  rejects(decisionOf({candidates:[decisionOf().candidates[0],
    candidateOf('BuyMedicine',{eligible:false,score:null,support:0,opposition:0,selectable:false,
      selectionBlockCode:'COMMITMENT_PROTECTED'}),...decisionOf().candidates.slice(2)]}),
    'only a soft precondition failure may block an ineligible candidate');
  rejects(decisionOf({candidates:[decisionOf().candidates[0],
    candidateOf('BuyMedicine',{eligible:false,score:0,support:0,opposition:0,selectable:false,
      selectionBlockCode:'SOFT_PRECONDITION_FAILED'}),...decisionOf().candidates.slice(2)]}),
    'an ineligible candidate carries no score');
  rejects(decisionOf({candidates:[decisionOf().candidates[0],
    candidateOf('BuyMedicine',{reasonCode:'READY'}),...decisionOf().candidates.slice(2)]}),'unknown candidate reason');
  rejects(decisionOf({choice:'WorkForPay'}),'the choice must be one of the selectable candidates');
  rejects(decisionOf({goalId:'1'}),'a goal identifier must be a safe integer');
  rejects(decisionOf({candidates:[decisionOf().candidates[0],
    softCandidate('BuyMedicine','PRIVATE_MEDICINE_PRESENT'),
    candidateOf('WorkForPay',{reasonCode:'DUTY'}),...decisionOf().candidates.slice(3)]}),
    'an open duty candidate must cite the request that opened it');
  rejects(decisionOf({candidates:[decisionOf().candidates[0],
    softCandidate('BuyMedicine','PRIVATE_MEDICINE_PRESENT'),
    candidateOf('WorkForPay',{reasonCode:'DUTY',sourceRef:'d01',support:900,opposition:190,score:710}),
    candidateOf('Rest',{score:650,support:650,reasonCode:'FATIGUE_RELIEF',selectable:false,selectionBlockCode:null}),
    candidateOf('NoAction',{score:0,support:0,reasonCode:'WAIT'})]}),
    'an eligible candidate cannot be closed without a gate block code');
  assert.doesNotThrow(()=>validateMotivationDecision(decisionOf({candidates:[decisionOf().candidates[0],
    softCandidate('BuyMedicine','PRIVATE_MEDICINE_PRESENT'),
    candidateOf('WorkForPay',{reasonCode:'DUTY',sourceRef:'d01',support:900,opposition:190,score:710}),
    candidateOf('Rest',{score:650,support:650,reasonCode:'FATIGUE_RELIEF'}),
    candidateOf('NoAction',{score:0,support:0,reasonCode:'WAIT'})]})),'a full re-evaluation opens every eligible candidate');
});

test('outcome: failure owner only pairs with a real rejection and non-success stays flat',()=>{
  assert.deepEqual(validateMotivationOutcome(outcomeOf()),outcomeOf());
  assert.throws(()=>validateMotivationOutcome(outcomeOf({status:'rejected'})),{code:'INVALID_INPUT'});
  assert.doesNotThrow(()=>validateMotivationOutcome(rejectedOutcome()));
  assert.throws(()=>validateMotivationOutcome(rejectedOutcome({failureOwner:null})),{code:'INVALID_INPUT'},
    'a rejection must name the plan and goal it belongs to');
  assert.throws(()=>validateMotivationOutcome(rejectedOutcome({failureOwner:{planId:2,goalId:1,extra:1}})),
    {code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationOutcome(rejectedOutcome({failureOwner:{planId:0,goalId:null}})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationOutcome(rejectedOutcome({delta:{wallet:-1,herbs:0,health:0,fatigue:0}})),
    {code:'INVALID_INPUT'},'a rejected outcome carries no deltas');
  assert.throws(()=>validateMotivationOutcome(rejectedOutcome({price:50})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationOutcome(rejectedOutcome({code:null})),{code:'INVALID_INPUT'});
  assert.doesNotThrow(()=>validateMotivationOutcome(cleanOutcome()));
  assert.throws(()=>validateMotivationOutcome(cleanOutcome({failureOwner:{planId:1,goalId:null}})),{code:'INVALID_INPUT'},
    'only a rejected outcome may carry a failure owner');
  assert.throws(()=>validateMotivationOutcome(cleanOutcome({delta:{wallet:-50,herbs:1,health:0,fatigue:0}})),
    {code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationOutcome(outcomeOf({delta:{wallet:-50,herbs:1,health:0}})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationOutcome(outcomeOf({actorId:'actor-9'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationOutcome(outcomeOf({publicFoodProduced:1.5})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateMotivationOutcome(outcomeOf({status:'no-action',
    delta:{wallet:0,herbs:0,health:0,fatigue:0},price:null,commandId:'motivation-day-2-actor-2'})),{code:'INVALID_INPUT'},
    'no-action resolves without a command receipt');
});

test('model: stored decision/outcome pairs must be complete and linked',()=>{
  assert.doesNotThrow(()=>modelWith({lastDecision:decisionOf(),lastOutcome:outcomeOf()}));
  assert.doesNotThrow(()=>modelWith({lastDecision:decisionOf()}),'an in-tick decision may precede its receipt');
  assert.throws(()=>modelWith({lastOutcome:outcomeOf()}),{code:'INVALID_INPUT'},
    'an outcome without its decision is orphaned');
  assert.throws(()=>modelWith({lastDecision:decisionOf(),lastOutcome:outcomeOf({decisionId:'motivation-day-3-actor-2'})}),
    {code:'INVALID_INPUT'});
  assert.throws(()=>modelWith({lastDecision:decisionOf({actorId:'actor-3'})}),{code:'INVALID_INPUT'},
    'a foreign decision cannot sit on this actor');
  assert.throws(()=>modelWith({lastDecision:decisionOf(),lastOutcome:cleanOutcome()}),{code:'INVALID_INPUT'},
    'a committed action cannot resolve as no-action');
  assert.throws(()=>modelWith({lastDecision:decisionOf({actorId:'actor-3'}),lastOutcome:outcomeOf({actorId:'actor-3'})}),
    {code:'INVALID_INPUT'});
});

test('state surface is data-only: no world, memory, mind, runner or service export leaks in',()=>{
  const allowed=new Set(['MOTIVATION_RULES','MOTIVATION_CONFIG_VERSION','MOTIVATION_STATE_VERSION',
    'MOTIVATION_KNOWLEDGE_VERSION','MOTIVATION_DECISION_VERSION','MOTIVATION_INSPECTOR_VERSION',
    'MAX_MOTIVATION_ACTORS','MAX_MOTIVATION_CANDIDATES','MAX_MOTIVATION_PLAN_STEPS','MAX_MOTIVATION_REQUESTS',
    'MAX_MOTIVATION_INPUTS_PER_TICK','MAX_MOTIVATION_KNOWLEDGE_BYTES','MAX_MOTIVATION_INSPECTOR_BYTES',
    'MAX_MOTIVATION_PLAN_TRANSITIONS','MAX_MOTIVATION_PERMILLE','MAX_MOTIVATION_REQUEST_WINDOW_TICKS',
    'MOTIVATION_ACTOR_IDS','MOTIVATION_REQUESTER_ID','MOTIVATION_ACTIONS','MOTIVATION_PLAN_KINDS',
    'MOTIVATION_PLAN_STATUSES','MOTIVATION_DUTY_STATUSES','MOTIVATION_GATES','MOTIVATION_STANCES',
    'MOTIVATION_SELECTION_BLOCK_CODES','MOTIVATION_REASON_CODES','MOTIVATION_OUTCOME_STATUSES',
    'MOTIVATION_MAJOR_DUTY_PERMILLE','MOTIVATION_EMERGENCY_FATIGUE','validateMotivationRequest',
    'validateMotivationConfig','createMotivationModel','validateMotivationDuty','validateMotivationPlan',
    'validateMotivationCandidate','validateMotivationDecision','validateMotivationOutcome','validateMotivationModel']);
  assert.deepEqual(Object.keys(state).filter(name=>!allowed.has(name)),[],'unexpected motivation export surface');
  for(const name of ['validateMotivationConfig','createMotivationModel','validateMotivationModel'])
    assert.equal(typeof state[name],'function','missing required export '+name);
});
