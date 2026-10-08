// M2A1 motivation planner: five candidate sources, the six ordered commitment gates, pure
// identifier proposals and the fixed three-case counterfactual. Every expectation here is
// hand-derived from the m2-contract-v2 formulas; nothing reads a world, resolver or fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMotivationCandidates,planMotivationDecision,buildFastCounterfactual }
  from '../../runtime/core/motivation-planner.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';

const goalOf=(over={})=>({goalId:1,kind:'recover-health',step:'use',startDay:1,deadlineDay:21,failures:0,target:800,
  ...structuredClone(over)});
const healthPlan=(over={})=>({planId:1,goalId:1,kind:'recover-health',steps:['BuyMedicine','UseMedicine'],stepIndex:1,
  status:'ready',createdDay:1,deadlineDay:21,requestId:null,...structuredClone(over)});
const dutyPlan=(over={})=>({planId:2,goalId:null,kind:'aid-village',steps:['WorkForPay'],stepIndex:0,status:'ready',
  createdDay:2,deadlineDay:2,requestId:'d01',...structuredClone(over)});
const dutyOf=(over={})=>({requestId:'d01',sourceEventSeq:12,observedTick:200,expiresTick:432,urgencyPermille:1000,
  status:'pending',fulfilledTick:null,...structuredClone(over)});
const beliefOf=(value,over={})=>({topic:'public-herbs-available',value,
  confidencePermille:value==='available'?900:value==='unavailable'?600:0,
  evidenceRefs:value==='unknown'?[]:[7],contradictionRefs:[],lastUpdatedTick:value==='unknown'?null:144,
  ...structuredClone(over)});

const BASE={knowledgeVersion:'motivation-knowledge-v1',phase:'decision',simulationId:'motivation-village',
  actorId:'actor-2',tick:288,revision:287,
  self:{name:'Hunter',occupation:'hunter',location:'village',alive:true,health:400,hunger:0,fatigue:650,wallet:50,
    inventory:{food:20,herbs:1},currentGoal:goalOf(),nextGoalId:2,cooldownUntilDay:0},
  quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},observations:[],belief:beliefOf('available'),
  profile:{dutyWeightPermille:900,riskAversionPermille:200},duty:dutyOf(),
  planState:{activePlan:healthPlan(),suspendedPlan:null,nextPlanId:2,lastReviewedDutyId:null}};

function merge(target,source){
  for(const [key,value] of Object.entries(source))
    target[key]=value!==null&&typeof value==='object'&&!Array.isArray(value)
      ?merge({...(target[key]??{})},value):value;
  return target;
}
const knowledge=(over={})=>merge(structuredClone(BASE),over);
const deepFreeze=value=>{
  if(value!==null&&typeof value==='object'){for(const key of Object.keys(value))deepFreeze(value[key]);Object.freeze(value);}
  return value;
};
const plan=over=>planMotivationDecision(knowledge(over));
const scores=result=>Object.fromEntries(result.decision.candidates.map(candidate=>[candidate.action,candidate.score]));
const blocks=result=>Object.fromEntries(result.decision.candidates.map(candidate=>[candidate.action,
  candidate.selectable?'open':candidate.selectionBlockCode]));
const reasons=list=>Object.fromEntries(list.map(candidate=>[candidate.action,candidate.reasonCode]));

test('collect: the five fixed candidates, providers and source references',()=>{
  const list=collectMotivationCandidates(knowledge());
  assert.deepEqual(list.map(candidate=>candidate.action),['UseMedicine','BuyMedicine','WorkForPay','Rest','NoAction']);
  assert.deepEqual(list.map(candidate=>candidate.provider),
    ['health-need','health-need','role-request','fatigue-need','fallback']);
  assert.deepEqual(list.map(candidate=>candidate.sourceRef),['recover-health','recover-health','d01','self-fatigue',null]);
  // A candidate that cannot see an open duty cites nothing at all.
  assert.deepEqual(collectMotivationCandidates(knowledge({duty:null})).map(candidate=>candidate.sourceRef),
    ['recover-health','recover-health',null,'self-fatigue',null]);
  assert.deepEqual(Object.keys(list[0]),['action','provider','sourceRef','eligible','score','support','opposition','reasonCode'],
    'collecting candidates must not pre-decide selectability');
});

test('collect: tick288 scores are the hand-computed Work710 / Use700 / Rest650',()=>{
  // recoveryScore = max(0,800-400)+300 = 700; strain = min(1000,650+max(0,700-400)) = 950;
  // Work support = floor(1000*900/1000) = 900; opposition = floor(950*200/1000) = 190; score = 710;
  // Rest support = fatigue = 650 (below the 800 emergency clamp).
  const list=collectMotivationCandidates(knowledge());
  assert.deepEqual(scores({decision:{candidates:list}}),
    {UseMedicine:700,BuyMedicine:null,WorkForPay:710,Rest:650,NoAction:0});
  assert.deepEqual(list.map(candidate=>[candidate.support,candidate.opposition]),
    [[700,0],[0,0],[900,190],[650,0],[0,0]]);
  assert.deepEqual(reasons(list),{UseMedicine:'RECOVER_HEALTH',BuyMedicine:'PRIVATE_MEDICINE_PRESENT',
    WorkForPay:'DUTY',Rest:'FATIGUE_RELIEF',NoAction:'WAIT'});
  // The same arithmetic under the two contract weight pairings.
  for(const [profile,work] of [[{dutyWeightPermille:700,riskAversionPermille:200},510],
    [{dutyWeightPermille:900,riskAversionPermille:400},520],
    [{dutyWeightPermille:1000,riskAversionPermille:0},1000]])
    assert.equal(collectMotivationCandidates(knowledge({profile})).find(c=>c.action==='WorkForPay').score,work);
});

test('collect: soft preconditions report the first failed one in contract order',()=>{
  const of=(action,list)=>list.find(candidate=>candidate.action===action);
  const noGoal=collectMotivationCandidates(knowledge({self:{currentGoal:null,health:750}}));
  assert.equal(of('UseMedicine',noGoal).reasonCode,'NO_HEALTH_GOAL');
  assert.equal(of('BuyMedicine',noGoal).reasonCode,'NO_HEALTH_GOAL');
  assert.equal(of('UseMedicine',noGoal).score,null,'an ineligible candidate carries no score');
  assert.deepEqual([of('UseMedicine',noGoal).support,of('UseMedicine',noGoal).opposition],[0,0]);
  assert.equal(reasons(noGoal).Rest,'FATIGUE_RELIEF','other candidates keep their own preconditions');

  const empty=knowledge({self:{inventory:{food:20,herbs:0}}});
  const noMedicine=collectMotivationCandidates(empty);
  assert.equal(of('UseMedicine',noMedicine).reasonCode,'PRIVATE_MEDICINE_MISSING');
  assert.equal(of('BuyMedicine',noMedicine).reasonCode,'RECOVER_HEALTH');
  assert.equal(of('BuyMedicine',noMedicine).score,700);
  assert.equal(of('UseMedicine',collectMotivationCandidates(
    knowledge({self:{health:1000,inventory:{food:20,herbs:2}}}))).reasonCode,'HEALTH_ALREADY_FULL');
  assert.equal(of('BuyMedicine',collectMotivationCandidates(knowledge({self:{inventory:{food:20,herbs:2}}})))
    .reasonCode,'PRIVATE_MEDICINE_PRESENT');
  const buyOver=(belief,over={})=>knowledge({belief:belief??beliefOf('available'),self:{...over,inventory:{food:20,herbs:0}}});
  const buyReason=(belief,over)=>of('BuyMedicine',collectMotivationCandidates(buyOver(belief,over))).reasonCode;
  assert.equal(buyReason(beliefOf('unknown')),'SUPPLY_UNKNOWN');
  assert.equal(buyReason(beliefOf('unavailable')),'SUPPLY_UNAVAILABLE');
  assert.equal(buyReason(beliefOf('available',{confidencePermille:599})),'SUPPLY_CONFIDENCE_LOW');
  assert.equal(buyReason(beliefOf('available',{confidencePermille:600}),{wallet:49}),'WALLET_INSUFFICIENT');
  assert.equal(buyReason(),'RECOVER_HEALTH','exactly the known price is affordable');

  for(const [duty,reason] of [[null,'DUTY_UNAVAILABLE'],[dutyOf({status:'fulfilled',fulfilledTick:288}),'DUTY_UNAVAILABLE'],
    [dutyOf({expiresTick:288}),'DUTY_UNAVAILABLE'],[dutyOf({observedTick:289}),'DUTY_UNAVAILABLE']])
    assert.equal(of('WorkForPay',collectMotivationCandidates(knowledge({duty}))).reasonCode,reason);
  // The window is half-open: [observedTick, expiresTick).
  assert.equal(of('WorkForPay',collectMotivationCandidates(knowledge({duty:dutyOf({observedTick:288})})))
    .reasonCode,'DUTY');
  assert.equal(of('WorkForPay',collectMotivationCandidates(knowledge({self:{health:299}})))
    .reasonCode,'HEALTH_TOO_LOW_FOR_WORK');
  assert.equal(of('WorkForPay',collectMotivationCandidates(knowledge({self:{fatigue:701}})))
    .reasonCode,'FATIGUE_TOO_HIGH_FOR_WORK');
  assert.equal(of('Rest',collectMotivationCandidates(knowledge({self:{fatigue:599}})))
    .reasonCode,'FATIGUE_BELOW_REST_THRESHOLD');
  assert.equal(of('Rest',collectMotivationCandidates(knowledge({self:{fatigue:600}}))).reasonCode,'FATIGUE_RELIEF');
  const emergency=of('Rest',collectMotivationCandidates(knowledge({self:{fatigue:800}})));
  assert.deepEqual([emergency.reasonCode,emergency.support,emergency.score],['EMERGENCY_FATIGUE',2000,2000]);
  assert.equal(of('NoAction',collectMotivationCandidates(knowledge())).reasonCode,'WAIT');
  assert.equal(of('NoAction',collectMotivationCandidates(knowledge())).eligible,true);
});

test('collect: a potential health goal opens treatment without consuming an identifier',()=>{
  const source=deepFreeze(knowledge({self:{currentGoal:null,nextGoalId:7,health:400,inventory:{food:20,herbs:0}}}));
  const list=collectMotivationCandidates(source);
  assert.equal(list.find(candidate=>candidate.action==='BuyMedicine').eligible,true);
  assert.equal(list.find(candidate=>candidate.action==='BuyMedicine').score,700);
  assert.equal(source.self.nextGoalId,7,'collecting must never advance the goal counter');
  // Above the trigger, or while the cooldown still runs, no potential goal exists.
  for(const over of [{currentGoal:null,health:701},{currentGoal:null,health:400,cooldownUntilDay:3}])
    assert.equal(collectMotivationCandidates(knowledge({self:over}))
      .find(candidate=>candidate.action==='UseMedicine').reasonCode,'NO_HEALTH_GOAL');
});

test('purity: neither entry point mutates or reads beyond its own knowledge',()=>{
  const before=knowledge();
  const frozen=deepFreeze(structuredClone(before));
  assert.deepEqual(collectMotivationCandidates(frozen).map(candidate=>candidate.action),
    ['UseMedicine','BuyMedicine','WorkForPay','Rest','NoAction']);
  const result=planMotivationDecision(frozen);
  assert.deepEqual(canonicalJson(frozen),canonicalJson(before),'the planner rewrote its input');
  // A knowledge DTO may never smuggle the world, another ledger or a getter.
  assert.throws(()=>collectMotivationCandidates(knowledge({communalGold:500})),{code:'INVALID_INPUT'});
  assert.throws(()=>collectMotivationCandidates(knowledge({self:{hiddenSupply:true}})),{code:'INVALID_INPUT'});
  const getter=knowledge();Object.defineProperty(getter.self,'healthGet',{get:()=>1000});
  assert.throws(()=>collectMotivationCandidates(getter),{code:'INVALID_INPUT'});
  assert.throws(()=>collectMotivationCandidates({...knowledge(),duty:undefined}),{code:'INVALID_INPUT'});
  assert.equal(typeof result.decision,'object');
});

test('knowledge boundary: budget first, then version, phase, tick and identity',()=>{
  assert.throws(()=>planMotivationDecision({...knowledge(),padding:'x'.repeat(17000)}),{code:'LIMIT_EXCEEDED'},
    'the canonical byte budget is checked before field semantics');
  assert.throws(()=>planMotivationDecision(knowledge({knowledgeVersion:'motivation-knowledge-v2'})),
    {code:'UNSUPPORTED_VERSION'});
  assert.throws(()=>planMotivationDecision(knowledge({phase:'committed'})),{code:'INVALID_INPUT'});
  assert.throws(()=>planMotivationDecision(knowledge({tick:289,revision:288})),{code:'INVALID_INPUT'});
  assert.throws(()=>planMotivationDecision(knowledge({tick:288,revision:288})),{code:'INVALID_INPUT'});
  assert.throws(()=>planMotivationDecision(knowledge({actorId:'actor-1'})),{code:'MIND_UNAVAILABLE'});
  assert.throws(()=>planMotivationDecision(knowledge({actorId:'actor-4'})),{code:'MIND_UNAVAILABLE'});
  assert.throws(()=>planMotivationDecision(knowledge({self:{health:1001}})),{code:'INVALID_INPUT'});
  assert.throws(()=>planMotivationDecision(knowledge({self:{wallet:-1}})),{code:'INVALID_INPUT'});
  assert.throws(()=>planMotivationDecision(knowledge({self:{currentGoal:goalOf({target:900})}})),{code:'INVALID_INPUT'});
  assert.throws(()=>planMotivationDecision(knowledge({planState:{activePlan:healthPlan({steps:['Rest']})}})),
    {code:'INVALID_INPUT'});
  assert.throws(()=>planMotivationDecision(knowledge({planState:{activePlan:null,suspendedPlan:null,nextPlanId:0}})),
    {code:'INVALID_INPUT'});
});

test('dead knowledge: neither collecting nor planning decides for the dead',()=>{
  const dead=knowledge({self:{alive:false,currentGoal:null,health:400},duty:dutyOf()});
  for(const run of [()=>collectMotivationCandidates(dead),()=>planMotivationDecision(dead)])
    assert.throws(run,{code:'RULE_REJECTED'});
});

test('gates: NEW_MAJOR_DUTY opens once, re-evaluates fully and never forces Work',()=>{
  const result=plan();
  assert.equal(result.decision.gateReason,'NEW_MAJOR_DUTY');
  assert.equal(result.decision.choice,'WorkForPay');
  assert.equal(result.lastReviewedDutyId,'d01');
  assert.deepEqual(blocks(result),{UseMedicine:'open',BuyMedicine:'SOFT_PRECONDITION_FAILED',
    WorkForPay:'open',Rest:'open',NoAction:'open'},'a full re-evaluation opens every soft-eligible candidate');
  // The second look at the same request is an ordinary day again: the commitment holds at 710.
  const reviewed=plan({planState:{activePlan:healthPlan(),suspendedPlan:null,nextPlanId:3,lastReviewedDutyId:'d01'}});
  assert.equal(reviewed.decision.gateReason,'CONTINUE_COMMITTED');
  assert.equal(reviewed.decision.choice,'UseMedicine');
  assert.equal(reviewed.decision.candidates.find(c=>c.action==='WorkForPay').score,710);
  assert.equal(reviewed.decision.candidates.find(c=>c.action==='WorkForPay').selectionBlockCode,'COMMITMENT_PROTECTED');
  assert.equal(reviewed.lastReviewedDutyId,'d01');
  // 899 is not a major request even when Work outscores the committed step.
  const ordinary=plan({duty:dutyOf({urgencyPermille:899}),profile:{dutyWeightPermille:1000,riskAversionPermille:0}});
  assert.equal(ordinary.decision.gateReason,'CONTINUE_COMMITTED');
  assert.equal(ordinary.decision.choice,'UseMedicine');
  assert.equal(ordinary.decision.candidates.find(c=>c.action==='WorkForPay').score,899,'floor(899*1000/1000)');
  assert.equal(ordinary.lastReviewedDutyId,null,'an ordinary request is never marked reviewed');
  // The two contract weight pairings flip the same major re-evaluation to Use.
  for(const profile of [{dutyWeightPermille:700,riskAversionPermille:200},
    {dutyWeightPermille:900,riskAversionPermille:400}]){
    const flipped=plan({profile});
    assert.equal(flipped.decision.gateReason,'NEW_MAJOR_DUTY');
    assert.equal(flipped.decision.choice,'UseMedicine','a major gate re-evaluates, it does not obey');
    assert.equal(flipped.activePlan.planId,1,'the committed health plan keeps running');
    assert.equal(flipped.suspendedPlan,null);
  }
});

test('gates: urgent fatigue opens Rest only and leaves an unreviewed duty unreviewed',()=>{
  const result=plan({self:{fatigue:800}});
  assert.equal(result.decision.gateReason,'URGENT_FATIGUE');
  assert.equal(result.decision.choice,'Rest');
  assert.equal(result.decision.innerStance,'fatigue-concerned');
  assert.equal(result.lastReviewedDutyId,null,'urgent fatigue must not mark a duty it never evaluated');
  assert.equal(scores(result).Rest,2000);
  assert.deepEqual(blocks(result),{UseMedicine:'URGENT_OVERRIDE',BuyMedicine:'SOFT_PRECONDITION_FAILED',
    WorkForPay:'SOFT_PRECONDITION_FAILED',Rest:'open',NoAction:'URGENT_OVERRIDE'});
  assert.deepEqual([result.activePlan.kind,result.activePlan.goalId,result.activePlan.steps,result.activePlan.requestId],
    ['recover-rest',null,['Rest'],null]);
  assert.deepEqual([result.activePlan.createdDay,result.activePlan.deadlineDay],[2,2],'a rest plan dies with its day');
  assert.deepEqual([result.suspendedPlan.planId,result.suspendedPlan.status,result.suspendedPlan.steps,
    result.suspendedPlan.stepIndex],[1,'suspended',['BuyMedicine','UseMedicine'],1],'the treatment plan is only parked');
  assert.equal(result.nextPlanId,3);
  assert.deepEqual(result.currentGoal,goalOf(),'urgent rest leaves the long-term goal untouched');
  // Urgency outranks a major request even when Work would win the scores.
  assert.equal(plan({self:{fatigue:800},profile:{dutyWeightPermille:1000,riskAversionPermille:0}})
    .decision.gateReason,'URGENT_FATIGUE');
});

test('gates: resume restores the original planId without allocating a new one',()=>{
  const result=plan({duty:null,planState:{activePlan:null,
    suspendedPlan:healthPlan({status:'suspended'}),nextPlanId:2,lastReviewedDutyId:null}});
  assert.equal(result.decision.gateReason,'RESUME_COMMITTED');
  assert.equal(result.decision.choice,'UseMedicine');
  assert.equal(result.decision.planId,1);
  assert.equal(result.decision.goalId,1);
  assert.deepEqual([result.activePlan.planId,result.activePlan.status],[1,'ready']);
  assert.equal(result.suspendedPlan,null);
  assert.equal(result.nextPlanId,2,'resuming never re-assigns an identifier');
  assert.deepEqual(blocks(result),{UseMedicine:'open',BuyMedicine:'SOFT_PRECONDITION_FAILED',
    WorkForPay:'SOFT_PRECONDITION_FAILED',Rest:'COMMITMENT_PROTECTED',NoAction:'COMMITMENT_PROTECTED'});
});

test('gates: local replan keeps the plan identifier and re-derives only remaining steps',()=>{
  const waiting=plan({duty:null,belief:beliefOf('unavailable'),
    self:{health:400,fatigue:200,inventory:{food:20,herbs:0},currentGoal:goalOf({step:'buy'}),nextGoalId:2},
    quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},
    planState:{activePlan:healthPlan({steps:['BuyMedicine','UseMedicine'],stepIndex:0,status:'blocked'}),
      suspendedPlan:null,nextPlanId:2,lastReviewedDutyId:null}});
  assert.equal(waiting.decision.gateReason,'LOCAL_REPLAN_BLOCKED');
  assert.equal(waiting.decision.choice,'NoAction');
  assert.deepEqual([waiting.activePlan.planId,waiting.activePlan.status,waiting.activePlan.stepIndex,
    waiting.activePlan.steps],[1,'blocked',0,['BuyMedicine','UseMedicine']]);
  assert.deepEqual(waiting.currentGoal,goalOf({step:'buy'}),'waiting clears neither the goal nor its step');
  assert.equal(waiting.nextPlanId,2,'NoAction creates no plan');
  assert.deepEqual([waiting.decision.planId,waiting.decision.goalId],[1,1],'the waited plan is still the bound plan');
  // A blocked plan whose precondition returned is repaired to ready and picked up again.
  const ready=plan({duty:null,self:{health:400,fatigue:200,inventory:{food:20,herbs:0},wallet:100,
    currentGoal:goalOf({step:'buy'}),nextGoalId:2},
    planState:{activePlan:healthPlan({steps:['BuyMedicine','UseMedicine'],stepIndex:0,status:'blocked'}),
      suspendedPlan:null,nextPlanId:2,lastReviewedDutyId:null}});
  assert.equal(ready.decision.gateReason,'LOCAL_REPLAN_BLOCKED');
  assert.equal(ready.decision.choice,'BuyMedicine');
  assert.deepEqual([ready.activePlan.planId,ready.activePlan.status,ready.activePlan.steps,ready.activePlan.stepIndex],
    [1,'ready',['BuyMedicine','UseMedicine'],0]);
  assert.equal(ready.currentGoal.step,'buy');
  // Once only the parked plan remains and its step no longer holds, suspension is preserved.
  const parked=plan({duty:null,belief:beliefOf('unknown'),self:{health:400,fatigue:200,inventory:{food:20,herbs:0},
    currentGoal:goalOf({step:'buy'}),nextGoalId:2},
    planState:{activePlan:null,suspendedPlan:healthPlan({status:'suspended',steps:['UseMedicine'],stepIndex:0}),
      nextPlanId:2,lastReviewedDutyId:null}});
  assert.equal(parked.decision.gateReason,'LOCAL_REPLAN_BLOCKED');
  assert.equal(parked.decision.choice,'NoAction');
  assert.deepEqual([parked.activePlan,parked.suspendedPlan.planId,parked.suspendedPlan.status,parked.suspendedPlan.steps],
    [null,1,'suspended',['BuyMedicine','UseMedicine']],'one suspension layer only, no second stack');
});

test('gates: expired and superseded duty plans never survive into a new action',()=>{
  // The window is half-open, so tick 432 is already too late for a request expiring at 432.
  const expired=plan({tick:432,revision:431,quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},
    self:{health:400,fatigue:600,inventory:{food:20,herbs:1},wallet:50,
      currentGoal:goalOf({deadlineDay:21,startDay:1}),nextGoalId:2},
    planState:{activePlan:dutyPlan(),suspendedPlan:healthPlan({status:'suspended'}),nextPlanId:3,
      lastReviewedDutyId:'d01'}});
  assert.equal(expired.decision.gateReason,'RESUME_COMMITTED');
  assert.equal(expired.decision.choice,'UseMedicine');
  assert.deepEqual([expired.activePlan.planId,expired.activePlan.kind,expired.suspendedPlan],[1,'recover-health',null]);
  assert.equal(expired.decision.candidates.find(c=>c.action==='WorkForPay').reasonCode,'DUTY_UNAVAILABLE');
  assert.equal(expired.nextPlanId,3,'a cancelled duty plan frees its slot, it is not re-run');
  // The day after its deadline the same temporary plan is gone even while the window is open.
  const late=plan({tick:432,revision:431,quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},
    self:{health:400,fatigue:200,inventory:{food:20,herbs:1},wallet:50,currentGoal:goalOf(),nextGoalId:2},
    duty:dutyOf({observedTick:400,expiresTick:576}),
    planState:{activePlan:dutyPlan(),suspendedPlan:healthPlan({status:'suspended'}),nextPlanId:3,
      lastReviewedDutyId:'d01'}});
  assert.equal(late.activePlan.planId,1,'deadline day 2 cannot keep a plan alive on day 3');
  // A different request supersedes the old duty plan; the old duty is never fulfilled by it.
  const superseded=plan({tick:432,revision:431,quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},
    self:{health:400,fatigue:650,inventory:{food:20,herbs:1},wallet:50,currentGoal:goalOf(),nextGoalId:2},
    duty:dutyOf({requestId:'d02',sourceEventSeq:40,observedTick:432,expiresTick:576}),
    planState:{activePlan:dutyPlan({requestId:'d01'}),suspendedPlan:healthPlan({status:'suspended'}),nextPlanId:3,
      lastReviewedDutyId:'d01'}});
  assert.equal(superseded.decision.gateReason,'NEW_MAJOR_DUTY');
  assert.equal(superseded.decision.choice,'WorkForPay');
  assert.deepEqual([superseded.activePlan.planId,superseded.activePlan.requestId,superseded.activePlan.deadlineDay],
    [3,'d02',3],'the new plan binds the new request and its own deadline');
  assert.deepEqual([superseded.suspendedPlan.planId,superseded.suspendedPlan.status],[1,'suspended'],
    'the parked health plan survives a superseded duty');
  assert.equal(superseded.lastReviewedDutyId,'d02');
  assert.notEqual(superseded.activePlan.requestId,'d01');
});

test('gates: temporary duty plans keep the request identity and its half-open deadline',()=>{
  const result=plan();
  assert.deepEqual(result.activePlan,{planId:2,goalId:null,kind:'aid-village',steps:['WorkForPay'],stepIndex:0,
    status:'ready',createdDay:2,deadlineDay:2,requestId:'d01'});
  assert.deepEqual([result.suspendedPlan.planId,result.suspendedPlan.status],[1,'suspended']);
  assert.equal(result.decision.goalId,null,'a temporary plan owns no long-term goal');
  assert.equal(result.decision.planId,2);
  assert.deepEqual(result.currentGoal,goalOf(),'Work never rewrites the health goal step');
  // floor((576-1)/144) = 3 for a request that stays open through day 3.
  assert.equal(plan({duty:dutyOf({observedTick:288,expiresTick:576})}).activePlan.deadlineDay,3);
});

test('gates: a fresh day proposes both identifiers exactly once, in order',()=>{
  const source=knowledge({tick:144,revision:143,quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},
    self:{name:'Hunter',occupation:'hunter',location:'village',alive:true,health:400,hunger:0,fatigue:650,wallet:100,
      inventory:{food:20,herbs:0},currentGoal:null,nextGoalId:7,cooldownUntilDay:0},
    belief:beliefOf('available'),duty:null,
    planState:{activePlan:null,suspendedPlan:null,nextPlanId:4,lastReviewedDutyId:null}});
  const before=canonicalJson(source);
  const result=planMotivationDecision(source);
  assert.equal(result.decision.gateReason,'SELECT_NEW_PLAN');
  assert.equal(result.decision.choice,'BuyMedicine');
  assert.deepEqual([result.currentGoal.goalId,result.currentGoal.step,result.currentGoal.startDay,
    result.currentGoal.deadlineDay,result.currentGoal.target,result.currentGoal.failures],
    [7,'buy',1,21,800,0],'the goal is proposed verbatim from self.nextGoalId');
  assert.equal(result.nextGoalId,8,'exactly one identifier is consumed');
  assert.deepEqual([result.activePlan.planId,result.activePlan.goalId,result.activePlan.steps],
    [4,7,['BuyMedicine','UseMedicine']],'the plan is proposed verbatim from planState.nextPlanId');
  assert.equal(result.nextPlanId,5);
  assert.deepEqual([result.decision.goalId,result.decision.planId,result.decision.committedIntent],
    [7,4,{goalId:7,kind:'recover-health'}]);
  assert.equal(canonicalJson(source),before,'the planner rewrote the caller knowledge');
  // Overflow is refused before anything is allocated; A2 may not renumber a proposal.
  assert.throws(()=>plan({self:{currentGoal:null,nextGoalId:Number.MAX_SAFE_INTEGER,health:400,wallet:100,
    inventory:{food:20,herbs:0}},duty:null,planState:{activePlan:null,suspendedPlan:null,nextPlanId:4}}),
    {code:'LIMIT_EXCEEDED'});
  assert.throws(()=>plan({tick:144,revision:143,quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},
    self:{health:400,fatigue:650,inventory:{food:20,herbs:0},wallet:100,currentGoal:goalOf({goalId:1}),nextGoalId:2},
    belief:beliefOf('available'),duty:null,
    planState:{activePlan:null,suspendedPlan:null,nextPlanId:Number.MAX_SAFE_INTEGER}}),{code:'LIMIT_EXCEEDED'});
});

test('gates: NoAction creates nothing and an ordinary tie keeps the fixed order',()=>{
  const idle=plan({tick:144,revision:143,quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},
    self:{health:400,fatigue:200,inventory:{food:20,herbs:0},wallet:100,currentGoal:null,nextGoalId:2,cooldownUntilDay:0},
    belief:beliefOf('unknown'),duty:null,planState:{activePlan:null,suspendedPlan:null,nextPlanId:1}});
  assert.equal(idle.decision.gateReason,'SELECT_NEW_PLAN');
  assert.equal(idle.decision.choice,'NoAction');
  assert.equal(idle.decision.reasonCode,'WAIT');
  assert.deepEqual([idle.activePlan,idle.suspendedPlan],[null,null]);
  assert.deepEqual([idle.decision.goalId,idle.decision.planId],[null,null]);
  assert.equal(idle.nextPlanId,1,'waiting consumes no plan identifier');
  assert.deepEqual([idle.currentGoal.goalId,idle.decision.committedIntent.goalId],[2,2],
    'the need rule still opens the goal, the action simply does not follow');
  // Work 900 - floor(950*211/1000) = 700 ties Use 700 and the fixed order keeps UseMedicine.
  const tied=plan({duty:null,profile:{dutyWeightPermille:1000,riskAversionPermille:0},
    self:{health:400,fatigue:650,inventory:{food:20,herbs:0},wallet:100,currentGoal:goalOf({step:'buy'}),nextGoalId:2},
    planState:{activePlan:null,suspendedPlan:null,nextPlanId:1}});
  assert.equal(scores(tied).BuyMedicine,700);
  assert.equal(tied.decision.choice,'BuyMedicine','Use is soft-blocked on an empty herb slot, so Buy wins its own slot');
  // Work floor(1000*900/1000) - floor(950*211/1000) = 900-200 = 700 ties Use 700.
  const tie=plan({profile:{dutyWeightPermille:900,riskAversionPermille:211},
    planState:{activePlan:null,suspendedPlan:null,nextPlanId:1,lastReviewedDutyId:'d01'}});
  assert.equal(tie.decision.gateReason,'SELECT_NEW_PLAN');
  assert.deepEqual([scores(tie).UseMedicine,scores(tie).WorkForPay],[700,700]);
  assert.equal(tie.decision.choice,'UseMedicine','equal scores break on the fixed candidate order');
  assert.deepEqual([tie.activePlan.kind,tie.activePlan.planId],['recover-health',1]);
});

test('decision: identity, three independent layers, evidence union and fingerprint',()=>{
  const result=plan();
  const decision=result.decision;
  assert.equal(decision.decisionId,'motivation-day-2-actor-2');
  assert.deepEqual([decision.apparentAction,decision.choice],['WorkForPay','WorkForPay']);
  assert.deepEqual([decision.innerStance,decision.committedIntent,decision.apparentAction],
    ['health-concerned',{goalId:1,kind:'recover-health'},'WorkForPay'],
    'stance, long-term intent and this action are three separate statements');
  assert.equal(decision.reasonCode,'DUTY','the decision reason is the chosen candidate reason');
  assert.equal(decision.strainPermille,950);
  assert.deepEqual(decision.evidenceRefs,[7,12],'belief evidence and the delivered request source, ascending');
  assert.equal(decision.knowledgeFingerprint,canonicalJson(knowledge()),'the fingerprint is the knowledge text itself');
  assert.equal(validatePlanRoundTrip(result),'ok');
  // A belief with contradictions cites both sides; an undelivered request cites nothing.
  assert.deepEqual(plan({belief:beliefOf('available',{contradictionRefs:[3]}),duty:null}).decision.evidenceRefs,[3,7]);
  assert.deepEqual(plan({duty:dutyOf({observedTick:288})}).decision.evidenceRefs,[7,12]);
  // Stance falls back to balanced only when neither need nor goal speaks.
  const calm=plan({tick:144,revision:143,duty:null,belief:beliefOf('unknown'),
    self:{health:800,fatigue:500,inventory:{food:20,herbs:0},wallet:100,currentGoal:null,nextGoalId:2,cooldownUntilDay:9},
    planState:{activePlan:null,suspendedPlan:null,nextPlanId:1}});
  assert.deepEqual([calm.decision.innerStance,calm.decision.committedIntent,calm.currentGoal,calm.nextGoalId],
    ['balanced',null,null,2],'the cooldown keeps both the goal and the intent empty');
});

function validatePlanRoundTrip(result){
  for(const plan of [result.activePlan,result.suspendedPlan])if(plan!==null){
    if(plan.kind==='recover-health'&&plan.status!=='suspended')return 'health plan slot';
    if(plan.kind!=='recover-health'&&plan.status==='suspended')return 'temporary plan suspended';
  }
  return 'ok';
}

test('counterfactual: exactly three fixed hypotheses with clamped weights',()=>{
  const decision=plan().decision;
  const cases=buildFastCounterfactual(decision);
  assert.deepEqual(cases.map(entry=>entry.caseId),['baseline','duty-minus-200','risk-plus-200']);
  assert.deepEqual(cases[0],{caseId:'baseline',changedField:null,fromValue:null,toValue:null,
    choice:'WorkForPay',candidates:decision.candidates,gateReason:'NEW_MAJOR_DUTY'});
  assert.deepEqual(cases[1].changedField,'profile.dutyWeightPermille');
  assert.deepEqual([cases[1].fromValue,cases[1].toValue],[900,700]);
  assert.deepEqual(cases[2].changedField,'profile.riskAversionPermille');
  assert.deepEqual([cases[2].fromValue,cases[2].toValue],[200,400]);
  // Both pairings from the contract re-run here and both land on Use 700.
  assert.deepEqual(cases.map(entry=>[entry.choice,entry.candidates.find(c=>c.action==='WorkForPay').score]),
    [['WorkForPay',710],['UseMedicine',510],['UseMedicine',520]]);
  assert.deepEqual(cases.map(entry=>entry.gateReason),['NEW_MAJOR_DUTY','NEW_MAJOR_DUTY','NEW_MAJOR_DUTY']);
  // Clamping at both ends, and a case never claims a world result.
  const floorCase=buildFastCounterfactual(plan({profile:{dutyWeightPermille:50,riskAversionPermille:990}}).decision);
  assert.deepEqual([floorCase[1].toValue,floorCase[2].toValue],[0,1000]);
  assert.deepEqual(Object.keys(floorCase[0]),['caseId','changedField','fromValue','toValue','choice','candidates',
    'gateReason']);
});

test('counterfactual: a committed plan still blocks a better hypothetical score',()=>{
  const decision=plan({planState:{activePlan:healthPlan(),suspendedPlan:null,nextPlanId:3,
    lastReviewedDutyId:'d01'}}).decision;
  assert.equal(decision.gateReason,'CONTINUE_COMMITTED');
  const cases=buildFastCounterfactual(decision);
  for(const entry of cases){
    assert.equal(entry.gateReason,'CONTINUE_COMMITTED','a hypothesis cannot reopen a reviewed request');
    assert.equal(entry.choice,'UseMedicine');
    const work=entry.candidates.find(candidate=>candidate.action==='WorkForPay');
    assert.equal(work.selectionBlockCode,'COMMITMENT_PROTECTED');
    assert.equal(work.selectable,false);
  }
  assert.deepEqual(cases.map(entry=>entry.candidates.find(c=>c.action==='WorkForPay').score),[710,510,520],
    'the score moves while the gate keeps the commitment');
});

test('counterfactual: the frozen baseline must reproduce byte for byte',()=>{
  const decision=plan().decision;
  assert.doesNotThrow(()=>buildFastCounterfactual(decision));
  for(const tamper of [
    {choice:'UseMedicine'},
    {apparentAction:'UseMedicine'},
    {gateReason:'CONTINUE_COMMITTED'},
    {reasonCode:'RECOVER_HEALTH'},
    {candidates:decision.candidates.map(candidate=>candidate.action==='WorkForPay'
      ?{...candidate,score:700}:candidate)},
    {candidates:decision.candidates.map(candidate=>candidate.action==='Rest'
      ?{...candidate,selectionBlockCode:'COMMITMENT_PROTECTED',selectable:false}:candidate)},
    {knowledgeFingerprint:canonicalJson(knowledge({profile:{dutyWeightPermille:700}}))},
    {knowledgeFingerprint:'{"actorId":"actor-2"}'},
    {knowledgeFingerprint:JSON.stringify({zzz:1,...JSON.parse(decision.knowledgeFingerprint)})}]){
    assert.throws(()=>buildFastCounterfactual({...structuredClone(decision),...structuredClone(tamper)}),
      {code:'INVALID_INPUT'},'tampered field '+Object.keys(tamper));
  }
  // An identity drift between the decision and its knowledge text is rejected too.
  const stale=structuredClone(decision);
  const other=structuredClone(JSON.parse(stale.knowledgeFingerprint));
  other.actorId='actor-3';stale.actorId='actor-3';
  stale.knowledgeFingerprint=canonicalJson({...other,actorId:'actor-2'});
  assert.throws(()=>buildFastCounterfactual(stale));
});

test('counterfactual: pure reads only - no identifier, role, RNG, clock or file movement',()=>{
  const result=plan();
  const decision=deepFreeze(structuredClone(result.decision));
  const before=canonicalJson(decision);
  const cases=buildFastCounterfactual(decision);
  assert.equal(canonicalJson(decision),before,'a hypothesis rewrote the frozen decision');
  assert.notEqual(cases[0].candidates,decision.candidates,'cases must not alias the frozen decision');
  assert.notEqual(cases[0].candidates[0],decision.candidates[0]);
  for(const entry of cases)for(const candidate of entry.candidates)
    assert.equal(Object.isFrozen(candidate),false,'returned hypothesis data must stay writable for the caller');
  // The plan/goal proposals of a hypothesis never leak into its reported fields, and the
  // duty-minus case cannot invent a second request either.
  assert.deepEqual(cases.map(entry=>entry.candidates.filter(candidate=>candidate.eligible)
    .map(candidate=>candidate.action)),
    [['UseMedicine','WorkForPay','Rest','NoAction'],['UseMedicine','WorkForPay','Rest','NoAction'],
      ['UseMedicine','WorkForPay','Rest','NoAction']]);
  assert.deepEqual(cases.map(entry=>entry.candidates.find(c=>c.action==='WorkForPay').sourceRef),['d01','d01','d01']);
});
