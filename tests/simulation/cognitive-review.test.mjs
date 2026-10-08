// M3-1B cognitive review kernel — the only acceptance test file for
// runtime/core/cognitive-review.mjs (contract m3-kernels-contract-v1).
//
// Every expected value below is HAND-DERIVED from the frozen contract rules or written as a
// static fixture; none is taken from an evaluateCognitiveReview output. Each expectation carries
// its derivation note, e.g.: score=600×1000=600000>=600000 → full, interval 144;
// lastReviewTick=0, tick144>=0+144 → PERIOD_DUE.
//
// Frozen module under test: runtime/core/cognitive-review.mjs. Worktree HEAD is c8d78d4
// (branch codex/world-runtime-m3-cognition) and the module is not committed there yet, so
// `git rev-parse HEAD:runtime/core/cognitive-review.mjs` has no value; the reviewed content is
// pinned by its git blob SHA 5399bacb0423208a12cd4ff908c6ee8aaa415d03 (git hash-object).
//
// Derivation shorthand: score=importancePermille×relevancePermille; alive score>=600000 → full
// (interval 144), else reduced (interval 432); alive:false → dormant. PERIOD_DUE uses the CURRENT
// tier's interval: tick >= lastReviewTick + interval. nextReviewTick = result lastReviewTick +
// interval (null without a review tick). Reasons combine in the fixed order INITIAL, PROMOTED,
// URGENT_NEED, MAJOR_DUTY, EVIDENCE_CHANGED, PLAN_INVALIDATED, PERIOD_DUE, each at most once;
// any non-empty set on a living actor means exactly one review that day.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COGNITIVE_REVIEW_STATE_VERSION,COGNITIVE_REVIEW_DECISION_VERSION,COGNITIVE_FULL_THRESHOLD,
  COGNITIVE_FULL_INTERVAL_TICKS,COGNITIVE_REDUCED_INTERVAL_TICKS,MAX_COGNITIVE_REVIEW_STATE_BYTES,
  MAX_COGNITIVE_REVIEW_INPUT_BYTES,createCognitiveReviewState,validateCognitiveReviewState,
  evaluateCognitiveReview} from '../../runtime/core/cognitive-review.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';

const SIM='sim-1',ACTOR='actor-2';
const fresh=()=>createCognitiveReviewState(SIM,ACTOR);
const inputOf=(over={})=>({simulationId:SIM,actorId:ACTOR,tick:0,alive:true,importancePermille:600,
  relevancePermille:1000,urgentNeed:false,newMajorDuty:false,keyEvidenceChanged:false,
  goalOrPlanInvalidated:false,...over});
// Hand-derived baseline decision for inputOf(): tick0, alive, 600×1000=600000>=600000 → full
// (interval 144); a fresh state was never reviewed → INITIAL review; lastReviewTick=0;
// nextReviewTick=0+144=144.
const decisionOf=(over={})=>({version:COGNITIVE_REVIEW_DECISION_VERSION,simulationId:SIM,actorId:ACTOR,
  tick:0,tier:'full',score:600000,intervalTicks:144,mode:'review',shouldReview:true,
  reasonCodes:['INITIAL'],nextReviewTick:144,...over});
const bytesOf=(value)=>new TextEncoder().encode(canonicalJson(value)).length;
const deepFreeze=(value)=>{
  if(value!==null&&typeof value==='object'){
    for(const key of Object.keys(value))deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};

// ---- Hand-written legal state fixtures (single-DTO view; history is not provable from one DTO) ----
// Full review at tick144: input 600×1000 → score=600000 → full, interval 144; review mode requires
// lastReviewTick===144; ['PERIOD_DUE'] assumes a prior review at tick0 (144>=0+144);
// nextReviewTick=144+144=288.
const reviewStateOf=(over={})=>({version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:SIM,actorId:ACTOR,
  lastEvaluation:{
    input:inputOf({tick:144}),
    decision:{version:COGNITIVE_REVIEW_DECISION_VERSION,simulationId:SIM,actorId:ACTOR,tick:144,tier:'full',
      score:600000,intervalTicks:144,mode:'review',shouldReview:true,reasonCodes:['PERIOD_DUE'],nextReviewTick:288}},
  lastReviewTick:144,...over});
// Reduced maintain at tick144: 599×1000=599000<600000 → reduced, interval 432; no wakeup and
// 144<0+432 → maintain keeps lastReviewTick=0; nextReviewTick=0+432=432.
const maintainStateOf=(over={})=>({version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:SIM,actorId:ACTOR,
  lastEvaluation:{
    input:inputOf({tick:144,importancePermille:599,relevancePermille:1000}),
    decision:{version:COGNITIVE_REVIEW_DECISION_VERSION,simulationId:SIM,actorId:ACTOR,tick:144,tier:'reduced',
      score:599000,intervalTicks:432,mode:'maintain',shouldReview:false,reasonCodes:[],nextReviewTick:432}},
  lastReviewTick:0,...over});
// Dormant at tick144 after a tick0 review: death keeps the product score 700×800=560000 and the
// old lastReviewTick=0; intervalTicks/nextReviewTick=null; reasons exactly ['DEAD'].
const dormantStateOf=(over={})=>({version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:SIM,actorId:ACTOR,
  lastEvaluation:{
    input:inputOf({tick:144,alive:false,importancePermille:700,relevancePermille:800}),
    decision:{version:COGNITIVE_REVIEW_DECISION_VERSION,simulationId:SIM,actorId:ACTOR,tick:144,tier:'dormant',
      score:560000,intervalTicks:null,mode:'dormant',shouldReview:false,reasonCodes:['DEAD'],nextReviewTick:null}},
  lastReviewTick:0,...over});
const withDecision=(over={})=>{const s=reviewStateOf();s.lastEvaluation={...s.lastEvaluation,
  decision:{...s.lastEvaluation.decision,...over}};return s;};
const withInput=(over={})=>{const s=reviewStateOf();s.lastEvaluation={...s.lastEvaluation,
  input:{...s.lastEvaluation.input,...over}};return s;};
const withMaintainDecision=(over={})=>{const s=maintainStateOf();s.lastEvaluation={...s.lastEvaluation,
  decision:{...s.lastEvaluation.decision,...over}};return s;};
const withDormantDecision=(over={})=>{const s=dormantStateOf();s.lastEvaluation={...s.lastEvaluation,
  decision:{...s.lastEvaluation.decision,...over}};return s;};
// Hand-verified day boundaries near Number.MAX_SAFE_INTEGER=9007199254740991:
// 144×62549994824590=9007199254740960 (=Math.floor(MAX_SAFE_INTEGER/144)×144, legal) and
// 144×62549994824589=9007199254740816 (legal); MAX_DAY_TICK+144=9007199254741104 overflows.
const MAX_DAY_TICK=9007199254740960,PRIOR_TICK=9007199254740816;

test('constants: m3-kernels-contract-v1 names and values are exported verbatim',()=>{
  assert.equal(COGNITIVE_REVIEW_STATE_VERSION,'cognitive-review-state-v1');
  assert.equal(COGNITIVE_REVIEW_DECISION_VERSION,'cognitive-review-decision-v1');
  assert.equal(COGNITIVE_FULL_THRESHOLD,600000);
  assert.equal(COGNITIVE_FULL_INTERVAL_TICKS,144);
  assert.equal(COGNITIVE_REDUCED_INTERVAL_TICKS,432);
  assert.equal(MAX_COGNITIVE_REVIEW_STATE_BYTES,8192);
  assert.equal(MAX_COGNITIVE_REVIEW_INPUT_BYTES,2048);
});

test('create: empty state shape with identifier and actor guards',()=>{
  assert.deepEqual(createCognitiveReviewState(SIM,ACTOR),{version:COGNITIVE_REVIEW_STATE_VERSION,
    simulationId:SIM,actorId:ACTOR,lastEvaluation:null,lastReviewTick:null});
  assert.throws(()=>createCognitiveReviewState(SIM,'actor-1'),{code:'INVALID_INPUT'},'only actor-2/actor-3 exist');
  assert.throws(()=>createCognitiveReviewState(SIM,'actor-9'),{code:'INVALID_INPUT'});
  assert.throws(()=>createCognitiveReviewState('a'.repeat(65),ACTOR),{code:'INVALID_INPUT'},'identifier cap is 64');
  assert.throws(()=>createCognitiveReviewState('',ACTOR),{code:'INVALID_INPUT'});
});

// ---- A: score/tier thresholds and the per-tier cadence ----
test('A: score thresholds bound the tier — 600000 full, 599000 and 0 reduced, 1000000 full',()=>{
  // 600×1000=600000>=600000 → full; fresh → INITIAL review; lastReviewTick=0; next=0+144=144.
  assert.deepEqual(evaluateCognitiveReview(fresh(),inputOf()).decision,decisionOf());
  // 599×1000=599000<600000 → reduced, interval 432, next=0+432=432.
  assert.deepEqual(evaluateCognitiveReview(fresh(),inputOf({importancePermille:599})).decision,
    decisionOf({tier:'reduced',score:599000,intervalTicks:432,nextReviewTick:432}));
  // 0×0=0 → reduced, next=432.
  assert.deepEqual(evaluateCognitiveReview(fresh(),inputOf({importancePermille:0,relevancePermille:0})).decision,
    decisionOf({tier:'reduced',score:0,intervalTicks:432,nextReviewTick:432}));
  // 1000×1000=1000000 → full, next=144.
  assert.deepEqual(evaluateCognitiveReview(fresh(),inputOf({importancePermille:1000,relevancePermille:1000})).decision,
    decisionOf({score:1000000}));
});

test('A: reduced cadence — 144/288 maintain, 432 PERIOD_DUE with next=864',()=>{
  const reducedInput=(tick)=>inputOf({tick,importancePermille:599,relevancePermille:1000});
  const s0=evaluateCognitiveReview(fresh(),reducedInput(0));
  assert.deepEqual(s0.decision,decisionOf({tier:'reduced',score:599000,intervalTicks:432,nextReviewTick:432}));
  const s144=evaluateCognitiveReview(s0.state,reducedInput(144));
  // lastReviewTick=0, current reduced interval 432: 144<0+432 → no PERIOD_DUE, no flags →
  // maintain; lastReviewTick kept at 0; next=0+432=432.
  assert.deepEqual(s144.decision,decisionOf({tick:144,tier:'reduced',score:599000,intervalTicks:432,
    mode:'maintain',shouldReview:false,reasonCodes:[],nextReviewTick:432}));
  assert.equal(s144.state.lastReviewTick,0);
  const s288=evaluateCognitiveReview(s144.state,reducedInput(288));
  // 288<0+432 → maintain again, tick stays 0, next=432.
  assert.deepEqual(s288.decision,decisionOf({tick:288,tier:'reduced',score:599000,intervalTicks:432,
    mode:'maintain',shouldReview:false,reasonCodes:[],nextReviewTick:432}));
  assert.equal(s288.state.lastReviewTick,0);
  const s432=evaluateCognitiveReview(s288.state,reducedInput(432));
  // 432>=0+432 → PERIOD_DUE review; lastReviewTick=432; next=432+432=864.
  assert.deepEqual(s432.decision,decisionOf({tick:432,tier:'reduced',score:599000,intervalTicks:432,
    reasonCodes:['PERIOD_DUE'],nextReviewTick:864}));
  assert.equal(s432.state.lastReviewTick,432);
});

test('A: full cadence — tick0 next=144, tick144 due with next=288',()=>{
  const s0=evaluateCognitiveReview(fresh(),inputOf());
  assert.deepEqual(s0.decision,decisionOf());
  const s144=evaluateCognitiveReview(s0.state,inputOf({tick:144}));
  // 144>=0+144 → PERIOD_DUE review; lastReviewTick=144; next=144+144=288.
  assert.deepEqual(s144.decision,decisionOf({tick:144,reasonCodes:['PERIOD_DUE'],nextReviewTick:288}));
  assert.equal(s144.state.lastReviewTick,144);
});

test('A: reduced→full promotes and reviews immediately — [PROMOTED, PERIOD_DUE], next=288',()=>{
  const reduced0=evaluateCognitiveReview(fresh(),inputOf({importancePermille:599,relevancePermille:1000}));
  const promoted=evaluateCognitiveReview(reduced0.state,inputOf({tick:144}));
  // 600×1000=600000 → full; the prior evaluation was an alive reduced → PROMOTED; with the full
  // interval 144 the day is also due (144>=0+144) → PERIOD_DUE; still one review;
  // lastReviewTick=144; next=144+144=288.
  assert.deepEqual(promoted.decision,decisionOf({tick:144,reasonCodes:['PROMOTED','PERIOD_DUE'],nextReviewTick:288}));
  assert.equal(promoted.state.lastReviewTick,144);
});

test('A: full→reduced starts the 432 cycle without forcing a review',()=>{
  const full0=evaluateCognitiveReview(fresh(),inputOf());
  const dropped=evaluateCognitiveReview(full0.state,inputOf({tick:144,importancePermille:599,relevancePermille:1000}));
  // 599×1000=599000 → reduced; no wakeup; with the new 432 interval 144<0+432 → maintain;
  // lastReviewTick stays 0; nextReviewTick=0+432=432 on the new cycle.
  assert.deepEqual(dropped.decision,decisionOf({tick:144,tier:'reduced',score:599000,intervalTicks:432,
    mode:'maintain',shouldReview:false,reasonCodes:[],nextReviewTick:432}));
  assert.equal(dropped.state.lastReviewTick,0);
});

test('A: each wakeup signal alone reviews a reduced day; multi-signal keeps the fixed order',()=>{
  // From a tick0 reduced review: tick144 with one flag → single-reason review; 144<0+432 → no
  // PERIOD_DUE; lastReviewTick=144; next=144+432=576.
  for(const [flag,reason] of [
    ['urgentNeed','URGENT_NEED'],['newMajorDuty','MAJOR_DUTY'],
    ['keyEvidenceChanged','EVIDENCE_CHANGED'],['goalOrPlanInvalidated','PLAN_INVALIDATED']]){
    const s0=evaluateCognitiveReview(fresh(),inputOf({importancePermille:599,relevancePermille:1000}));
    const woken=evaluateCognitiveReview(s0.state,
      inputOf({tick:144,importancePermille:599,relevancePermille:1000,[flag]:true}));
    assert.deepEqual(woken.decision,decisionOf({tick:144,tier:'reduced',score:599000,intervalTicks:432,
      reasonCodes:[reason],nextReviewTick:576}));
    assert.equal(woken.state.lastReviewTick,144);
  }
  // All four signals on one day → one review, reasons in the fixed order, next=576.
  const s0=evaluateCognitiveReview(fresh(),inputOf({importancePermille:599,relevancePermille:1000}));
  const multi=evaluateCognitiveReview(s0.state,inputOf({tick:144,importancePermille:599,relevancePermille:1000,
    urgentNeed:true,newMajorDuty:true,keyEvidenceChanged:true,goalOrPlanInvalidated:true}));
  assert.deepEqual(multi.decision,decisionOf({tick:144,tier:'reduced',score:599000,intervalTicks:432,
    reasonCodes:['URGENT_NEED','MAJOR_DUTY','EVIDENCE_CHANGED','PLAN_INVALIDATED'],nextReviewTick:576}));
  // INITIAL pairs with signals in the fixed order too: tick0 urgent → ['INITIAL','URGENT_NEED'],
  // 600×1000 → full, next=0+144=144.
  const initialUrgent=evaluateCognitiveReview(fresh(),inputOf({urgentNeed:true}));
  assert.deepEqual(initialUrgent.decision,decisionOf({reasonCodes:['INITIAL','URGENT_NEED']}));
});

test('A: input DTO domain — day-boundary ticks, strict booleans, permille range, known actors',()=>{
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({tick:100})),{code:'INVALID_INPUT'},'100 is not a multiple of 144');
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({tick:-144})),{code:'INVALID_INPUT'},'negative ticks are ineligible');
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({tick:1.5})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({tick:'0'})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({urgentNeed:1})),{code:'INVALID_INPUT'},'flags are strictly boolean');
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({alive:'true'})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({importancePermille:-1})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({relevancePermille:1001})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({actorId:'actor-9'})),{code:'INVALID_INPUT'});
});

// ---- B: one evaluation per day, idempotency, mismatches, skipped days ----
test('B: same-tick identical input is idempotent — saved decision copy, state untouched',()=>{
  const first=evaluateCognitiveReview(fresh(),inputOf());
  assert.deepEqual(first.decision,decisionOf());
  const again=evaluateCognitiveReview(first.state,inputOf());
  assert.deepEqual(again.decision,decisionOf(),'the saved decision is returned by value');
  assert.deepEqual(again.state,first.state);
  assert.notEqual(again.state.lastEvaluation.decision,again.decision,'clones, not shared references');
  // Key order is irrelevant: idempotency compares the whole canonical input.
  const shuffled={goalOrPlanInvalidated:false,relevancePermille:1000,newMajorDuty:false,tick:0,
    keyEvidenceChanged:false,alive:true,urgentNeed:false,importancePermille:600,actorId:ACTOR,simulationId:SIM};
  const third=evaluateCognitiveReview(first.state,shuffled);
  assert.deepEqual(third.decision,decisionOf());
  assert.deepEqual(third.state,first.state);
  // Maintain and dormant decisions are equally idempotent.
  const reduced0=evaluateCognitiveReview(fresh(),inputOf({importancePermille:599,relevancePermille:1000}));
  const maintain=evaluateCognitiveReview(reduced0.state,inputOf({tick:144,importancePermille:599,relevancePermille:1000}));
  assert.deepEqual(maintain.decision,decisionOf({tick:144,tier:'reduced',score:599000,intervalTicks:432,
    mode:'maintain',shouldReview:false,reasonCodes:[],nextReviewTick:432}));
  const maintainAgain=evaluateCognitiveReview(maintain.state,
    inputOf({tick:144,importancePermille:599,relevancePermille:1000}));
  assert.deepEqual(maintainAgain.decision,maintain.decision);
  assert.deepEqual(maintainAgain.state,maintain.state);
  const dead=evaluateCognitiveReview(fresh(),inputOf({alive:false,importancePermille:700,relevancePermille:800}));
  const deadAgain=evaluateCognitiveReview(dead.state,inputOf({alive:false,importancePermille:700,relevancePermille:800}));
  assert.deepEqual(deadAgain.decision,dead.decision);
  assert.deepEqual(deadAgain.state,dead.state);
});

test('B: same tick with a different input conflicts; backwards ticks are rejected',()=>{
  const first=evaluateCognitiveReview(fresh(),inputOf());
  assert.throws(()=>evaluateCognitiveReview(first.state,inputOf({urgentNeed:true})),{code:'INVALID_INPUT'});
  const later=evaluateCognitiveReview(first.state,inputOf({tick:144}));
  // tick144 full: 144>=0+144 → PERIOD_DUE review, lastReviewTick=144, next=288.
  assert.deepEqual(later.decision,decisionOf({tick:144,reasonCodes:['PERIOD_DUE'],nextReviewTick:288}));
  assert.throws(()=>evaluateCognitiveReview(later.state,inputOf()),{code:'INVALID_INPUT'},'tick0 < 144 moved backwards');
});

test('B: identity and version mismatches are rejected',()=>{
  const first=evaluateCognitiveReview(fresh(),inputOf());
  assert.throws(()=>evaluateCognitiveReview(first.state,inputOf({tick:144,actorId:'actor-3'})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(first.state,inputOf({tick:144,simulationId:'sim-2'})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview({...first.state,version:'cognitive-review-state-v2'},
    inputOf({tick:144})),{code:'UNSUPPORTED_VERSION'});
});

test('B: skipped days are not back-filled — only the current tick is judged',()=>{
  // From a tick0 reduced review (lastReviewTick=0, reduced interval 432): tick288 skips tick144;
  // 288<0+432 → maintain with NO reasons (the missed day is not re-judged); tick stays 0; next=432.
  const reduced0=evaluateCognitiveReview(fresh(),inputOf({importancePermille:599,relevancePermille:1000}));
  const skipped=evaluateCognitiveReview(reduced0.state,inputOf({tick:288,importancePermille:599,relevancePermille:1000}));
  assert.deepEqual(skipped.decision,decisionOf({tick:288,tier:'reduced',score:599000,intervalTicks:432,
    mode:'maintain',shouldReview:false,reasonCodes:[],nextReviewTick:432}));
  assert.equal(skipped.state.lastReviewTick,0);
  // A far jump after a full review only proves PERIOD_DUE for the current day:
  // tick1008=144×7, 1008>=0+144 → one review, lastReviewTick=1008, next=1008+144=1152.
  const full0=evaluateCognitiveReview(fresh(),inputOf());
  const far=evaluateCognitiveReview(full0.state,inputOf({tick:1008}));
  assert.deepEqual(far.decision,decisionOf({tick:1008,reasonCodes:['PERIOD_DUE'],nextReviewTick:1152}));
  assert.equal(far.state.lastReviewTick,1008);
});

// ---- C: death is dormant, final, and keeps the old review tick ----
test('C: DEAD priority — signals cannot override, dormant fields complete',()=>{
  // 500×600=300000; alive:false wins over all four signals → dormant ['DEAD'];
  // intervalTicks/nextReviewTick=null; first death without any prior review → lastReviewTick null.
  const deadInput={alive:false,importancePermille:500,relevancePermille:600,urgentNeed:true,newMajorDuty:true,
    keyEvidenceChanged:true,goalOrPlanInvalidated:true};
  const result=evaluateCognitiveReview(fresh(),inputOf(deadInput));
  assert.deepEqual(result.decision,decisionOf({tick:0,tier:'dormant',score:300000,intervalTicks:null,
    mode:'dormant',shouldReview:false,reasonCodes:['DEAD'],nextReviewTick:null}));
  assert.equal(result.state.lastReviewTick,null);
  assert.deepEqual(result.state.lastEvaluation.input,inputOf(deadInput));
});

test('C: dormant after a review keeps lastReviewTick; repeated dormant days stay dormant',()=>{
  // tick0 full INITIAL (lastReviewTick=0, next=144), then death at tick144: dormant keeps
  // lastReviewTick=0; a second dormant day at tick288 keeps it too.
  const alive0=evaluateCognitiveReview(fresh(),inputOf());
  assert.deepEqual(alive0.decision,decisionOf());
  const dead=evaluateCognitiveReview(alive0.state,
    inputOf({tick:144,alive:false,importancePermille:700,relevancePermille:800}));
  assert.deepEqual(dead.decision,decisionOf({tick:144,tier:'dormant',score:560000,intervalTicks:null,
    mode:'dormant',shouldReview:false,reasonCodes:['DEAD'],nextReviewTick:null}));
  assert.equal(dead.state.lastReviewTick,0);
  const deadAgain=evaluateCognitiveReview(dead.state,
    inputOf({tick:288,alive:false,importancePermille:700,relevancePermille:800}));
  assert.deepEqual(deadAgain.decision,decisionOf({tick:288,tier:'dormant',score:560000,intervalTicks:null,
    mode:'dormant',shouldReview:false,reasonCodes:['DEAD'],nextReviewTick:null}));
  assert.equal(deadAgain.state.lastReviewTick,0);
});

test('C: revival is rejected — later tick and same tick',()=>{
  const alive0=evaluateCognitiveReview(fresh(),inputOf());
  const dead=evaluateCognitiveReview(alive0.state,
    inputOf({tick:144,alive:false,importancePermille:700,relevancePermille:800}));
  // Saved alive=false, then alive=true on a later day → INVALID_INPUT (no resurrection).
  assert.throws(()=>evaluateCognitiveReview(dead.state,inputOf({tick:288})),{code:'INVALID_INPUT'});
  // Same tick with alive=true is a conflicting input for an already-evaluated day.
  assert.throws(()=>evaluateCognitiveReview(dead.state,inputOf({tick:144})),{code:'INVALID_INPUT'});
});

// ---- D: safe-integer overflow at the last legal day tick ----
test('D: interval/nextReview overflow is rejected with no partial state update',()=>{
  // INITIAL path: first alive evaluation at MAX_DAY_TICK. 600×1000=600000 → full; INITIAL review
  // moves lastReviewTick to MAX_DAY_TICK; nextReviewTick=MAX_DAY_TICK+144=9007199254741104 >
  // 9007199254740991 → LIMIT_EXCEEDED before any state is produced.
  const state=fresh();
  const before=canonicalJson(state);
  assert.throws(()=>evaluateCognitiveReview(state,inputOf({tick:MAX_DAY_TICK})),{code:'LIMIT_EXCEEDED'});
  assert.equal(canonicalJson(state),before,'no partial state update before the throw');
  // Non-INITIAL path: legal state with a full review at PRIOR_TICK=9007199254740816 (its
  // nextReviewTick=9007199254740960 is still safe). At MAX_DAY_TICK the PERIOD_DUE probe
  // safeAdd(PRIOR_TICK,144)=9007199254740960 is safe and 9007199254740960>=9007199254740960 →
  // due; the review then overflows on nextReviewTick=MAX_DAY_TICK+144 → LIMIT_EXCEEDED.
  const priorState={version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:SIM,actorId:ACTOR,
    lastEvaluation:{
      input:inputOf({tick:PRIOR_TICK}),
      decision:{version:COGNITIVE_REVIEW_DECISION_VERSION,simulationId:SIM,actorId:ACTOR,tick:PRIOR_TICK,
        tier:'full',score:600000,intervalTicks:144,mode:'review',shouldReview:true,reasonCodes:['INITIAL'],
        nextReviewTick:MAX_DAY_TICK}},
    lastReviewTick:PRIOR_TICK};
  assert.equal(validateCognitiveReviewState(priorState),priorState,'the overflow fixture is itself a legal state');
  const beforePrior=canonicalJson(priorState);
  assert.throws(()=>evaluateCognitiveReview(priorState,inputOf({tick:MAX_DAY_TICK})),{code:'LIMIT_EXCEEDED'});
  assert.equal(canonicalJson(priorState),beforePrior,'no partial state update before the throw');
});

// ---- E: JSON serialization round-trip ----
test('E: JSON round-trip — restored state is structurally equal and evaluates identically',()=>{
  // Step 1: tick0 599×1000=599000 → reduced INITIAL, lastReviewTick=0, next=0+432=432.
  const step1=evaluateCognitiveReview(fresh(),inputOf({importancePermille:599,relevancePermille:1000}));
  assert.deepEqual(step1.decision,decisionOf({tier:'reduced',score:599000,intervalTicks:432,nextReviewTick:432}));
  // Step 2: tick144 urgentNeed → 144<0+432 so no PERIOD_DUE; ['URGENT_NEED'] review;
  // lastReviewTick=144; next=144+432=576.
  const step2=evaluateCognitiveReview(step1.state,
    inputOf({tick:144,importancePermille:599,relevancePermille:1000,urgentNeed:true}));
  assert.deepEqual(step2.decision,decisionOf({tick:144,tier:'reduced',score:599000,intervalTicks:432,
    reasonCodes:['URGENT_NEED'],nextReviewTick:576}));
  const restored=JSON.parse(JSON.stringify(step2.state));
  assert.deepEqual(restored,step2.state);
  assert.equal(validateCognitiveReviewState(restored),restored);
  // Step 3 on both: tick288, 288<144+432=576 → maintain keeps lastReviewTick=144, next=576.
  const nextInput=inputOf({tick:288,importancePermille:599,relevancePermille:1000});
  const fromLive=evaluateCognitiveReview(step2.state,nextInput);
  const fromRestored=evaluateCognitiveReview(restored,nextInput);
  const expected=decisionOf({tick:288,tier:'reduced',score:599000,intervalTicks:432,mode:'maintain',
    shouldReview:false,reasonCodes:[],nextReviewTick:576});
  assert.deepEqual(fromLive.decision,expected);
  assert.deepEqual(fromRestored.decision,expected);
  assert.deepEqual(fromRestored.state,fromLive.state);
});

// ---- F: validator — single-DTO invariants only (INITIAL/PROMOTED/PERIOD_DUE historical
// causality cannot be confirmed from one saved DTO and is left to a future replay) ----
test('F: validator accepts every legal single-DTO shape and returns the original reference',()=>{
  const empty=fresh();
  assert.equal(validateCognitiveReviewState(empty),empty);
  const review=reviewStateOf();
  assert.equal(validateCognitiveReviewState(review),review);
  const maintain=maintainStateOf();
  assert.equal(validateCognitiveReviewState(maintain),maintain);
  const dormant=dormantStateOf();
  assert.equal(validateCognitiveReviewState(dormant),dormant);
  const produced=evaluateCognitiveReview(fresh(),inputOf()).state;
  assert.equal(validateCognitiveReviewState(produced),produced);
  const nullProto=Object.assign(Object.create(null),reviewStateOf());
  assert.equal(validateCognitiveReviewState(nullProto),nullProto);
});

test('F: validator rejects identity, tick, score, tier, interval and nextReviewTick mismatches',()=>{
  // Saved input identity must match the state (provable from one DTO, not from history).
  assert.throws(()=>validateCognitiveReviewState(withInput({simulationId:'sim-x'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateCognitiveReviewState(withInput({actorId:'actor-3'})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateCognitiveReviewState(withDecision({tick:288})),{code:'INVALID_INPUT'},'decision.tick must equal input.tick');
  assert.throws(()=>validateCognitiveReviewState(withDecision({score:599999})),{code:'INVALID_INPUT'},'score must be the product 600×1000=600000');
  assert.throws(()=>validateCognitiveReviewState(withDecision({tier:'reduced'})),{code:'INVALID_INPUT'},'600000 is full');
  assert.throws(()=>validateCognitiveReviewState(withDecision({intervalTicks:432})),{code:'INVALID_INPUT'},'full interval is 144');
  assert.throws(()=>validateCognitiveReviewState(withDecision({nextReviewTick:289})),{code:'INVALID_INPUT'},'next must be 144+144=288');
});

test('F: validator rejects review-tick relation violations',()=>{
  assert.throws(()=>validateCognitiveReviewState(reviewStateOf({lastReviewTick:0})),{code:'INVALID_INPUT'},'review must move the tick to 144');
  assert.throws(()=>validateCognitiveReviewState(maintainStateOf({lastReviewTick:144})),{code:'INVALID_INPUT'},'maintain must keep the tick below the evaluation tick');
  assert.throws(()=>validateCognitiveReviewState(reviewStateOf({lastReviewTick:null})),{code:'INVALID_INPUT'},'alive evaluations need a review tick');
  assert.throws(()=>validateCognitiveReviewState(reviewStateOf({lastReviewTick:288})),{code:'INVALID_INPUT'},'review tick cannot exceed its evaluation tick');
  assert.throws(()=>validateCognitiveReviewState({...fresh(),lastReviewTick:144}),{code:'INVALID_INPUT'},'empty evaluation cannot carry a tick');
});

test('F: validator rejects reason-list and version violations',()=>{
  assert.throws(()=>validateCognitiveReviewState(withDecision({reasonCodes:[]})),{code:'INVALID_INPUT'},'review needs reasons');
  assert.throws(()=>validateCognitiveReviewState(withMaintainDecision({reasonCodes:['INITIAL']})),{code:'INVALID_INPUT'},'maintain carries no reasons');
  assert.throws(()=>validateCognitiveReviewState(withDormantDecision({reasonCodes:[]})),{code:'INVALID_INPUT'},'dormant is exactly [DEAD]');
  assert.throws(()=>validateCognitiveReviewState(withDormantDecision({reasonCodes:['DEAD','URGENT_NEED']})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateCognitiveReviewState(withDecision({reasonCodes:['PERIOD_DUE','INITIAL']})),{code:'INVALID_INPUT'},'fixed reason order');
  assert.throws(()=>validateCognitiveReviewState(withDecision({reasonCodes:['URGENT_NEED','URGENT_NEED']})),{code:'INVALID_INPUT'},'no duplicates');
  assert.throws(()=>validateCognitiveReviewState(reviewStateOf({version:'cognitive-review-state-v2'})),{code:'UNSUPPORTED_VERSION'});
  assert.throws(()=>validateCognitiveReviewState(withDecision({version:'cognitive-review-decision-v2'})),{code:'UNSUPPORTED_VERSION'});
  assert.throws(()=>validateCognitiveReviewState({...reviewStateOf(),unexpectedKey:1}),{code:'INVALID_INPUT'},'no extra state keys');
});

// ---- G: fail-closed structure ----
test('G: plain and null-prototype records are accepted and evaluate identically',()=>{
  const baseline=evaluateCognitiveReview(fresh(),inputOf());
  const nullState=Object.assign(Object.create(null),
    {version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:SIM,actorId:ACTOR,lastEvaluation:null,lastReviewTick:null});
  const nullInput=Object.assign(Object.create(null),inputOf());
  assert.deepEqual(evaluateCognitiveReview(nullState,nullInput),baseline);
});

test('G: fail-closed — sparse arrays, symbol keys, extra keys, accessors, cycles, non-JSON, non-finite',()=>{
  // Sparse array at the decision.reasonCodes position: a hole breaks the dense-array scan.
  const sparseReasons=['URGENT_NEED','MAJOR_DUTY'];
  delete sparseReasons[0];
  const sparseState=reviewStateOf();
  sparseState.lastEvaluation={...sparseState.lastEvaluation,
    decision:{...sparseState.lastEvaluation.decision,reasonCodes:sparseReasons}};
  assert.throws(()=>evaluateCognitiveReview(sparseState,inputOf({tick:288})),{code:'INVALID_INPUT'});
  assert.throws(()=>validateCognitiveReviewState(sparseState),{code:'INVALID_INPUT'});
  // Symbol property keys are not JSON data.
  const symbolInput=inputOf();
  symbolInput[Symbol('extra')]='x';
  assert.throws(()=>evaluateCognitiveReview(fresh(),symbolInput),{code:'INVALID_INPUT'});
  const symbolState=fresh();
  symbolState[Symbol('extra')]=1;
  assert.throws(()=>validateCognitiveReviewState(symbolState),{code:'INVALID_INPUT'});
  // Unknown extra keys on the input DTO.
  assert.throws(()=>evaluateCognitiveReview(fresh(),{...inputOf(),extra:1}),{code:'INVALID_INPUT'});
  // Getter/accessor descriptors are rejected without executing the getter.
  let inputGetterRan=false;
  const getterInput=inputOf();
  Object.defineProperty(getterInput,'tick',{enumerable:true,get(){inputGetterRan=true;return 0;}});
  assert.throws(()=>evaluateCognitiveReview(fresh(),getterInput),{code:'INVALID_INPUT'});
  assert.equal(inputGetterRan,false,'the getter must never run');
  let stateGetterRan=false;
  const getterState=fresh();
  Object.defineProperty(getterState,'lastReviewTick',{enumerable:true,get(){stateGetterRan=true;return 0;}});
  assert.throws(()=>validateCognitiveReviewState(getterState),{code:'INVALID_INPUT'});
  assert.equal(stateGetterRan,false,'the getter must never run');
  // Cyclic references.
  const cyclic=inputOf();
  cyclic.self=cyclic;
  assert.throws(()=>evaluateCognitiveReview(fresh(),cyclic),{code:'INVALID_INPUT'});
  // Non-JSON values: undefined, function, bigint.
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({tick:undefined})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({urgentNeed:()=>true})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({tick:144n})),{code:'INVALID_INPUT'});
  // Non-finite numbers.
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({importancePermille:NaN})),{code:'INVALID_INPUT'});
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({relevancePermille:Infinity})),{code:'INVALID_INPUT'});
  // Non-plain prototypes.
  assert.throws(()=>evaluateCognitiveReview(fresh(),new Date()),{code:'INVALID_INPUT'});
});

// ---- H: byte budgets ----
test('H: budget — legal maximum shape fits; oversized input/state fail before ID checks',()=>{
  // Longest legal identifier: exactly 64 chars. The byte-budget maximum decision carries the
  // full fixed reason order; INITIAL+PERIOD_DUE cannot co-occur in real history, but the
  // validator only proves single-DTO invariants, so this 7-reason shape is what must fit.
  // 1000×1000=1000000 → full, interval 144; review at tick144 with lastReviewTick=144;
  // nextReviewTick=144+144=288.
  const maxId='a'.repeat(64);
  const maxInput={simulationId:maxId,actorId:ACTOR,tick:144,alive:true,importancePermille:1000,
    relevancePermille:1000,urgentNeed:true,newMajorDuty:true,keyEvidenceChanged:true,goalOrPlanInvalidated:true};
  const maxState={version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:maxId,actorId:ACTOR,
    lastEvaluation:{input:maxInput,decision:{version:COGNITIVE_REVIEW_DECISION_VERSION,simulationId:maxId,
      actorId:ACTOR,tick:144,tier:'full',score:1000000,intervalTicks:144,mode:'review',shouldReview:true,
      reasonCodes:['INITIAL','PROMOTED','URGENT_NEED','MAJOR_DUTY','EVIDENCE_CHANGED','PLAN_INVALIDATED','PERIOD_DUE'],
      nextReviewTick:288}},lastReviewTick:144};
  assert.equal(validateCognitiveReviewState(maxState),maxState);
  assert.ok(bytesOf(maxState)<=MAX_COGNITIVE_REVIEW_STATE_BYTES,'max state within 8192 canonical UTF-8 bytes');
  assert.ok(bytesOf(maxInput)<=MAX_COGNITIVE_REVIEW_INPUT_BYTES,'max input within 2048 canonical UTF-8 bytes');
  // Budget precedes business ID validation: a 5000-char simulationId on an input (limit 2048)
  // and a 9000-char one on a state (limit 8192) must yield LIMIT_EXCEEDED, not INVALID_INPUT.
  assert.throws(()=>evaluateCognitiveReview(fresh(),inputOf({simulationId:'x'.repeat(5000)})),{code:'LIMIT_EXCEEDED'});
  const longState={version:COGNITIVE_REVIEW_STATE_VERSION,simulationId:'x'.repeat(9000),actorId:ACTOR,
    lastEvaluation:null,lastReviewTick:null};
  assert.throws(()=>validateCognitiveReviewState(longState),{code:'LIMIT_EXCEEDED'});
  assert.throws(()=>evaluateCognitiveReview(longState,inputOf()),{code:'LIMIT_EXCEEDED'});
  // createCognitiveReviewState has no budget stage: its identifier rule rejects directly.
  assert.throws(()=>createCognitiveReviewState('x'.repeat(65),ACTOR),{code:'INVALID_INPUT'});
});

// ---- I: purity ----
test('I: purity — deep-frozen inputs, decoupled results, deterministic repeats',()=>{
  const baseline=evaluateCognitiveReview(fresh(),inputOf());
  assert.deepEqual(evaluateCognitiveReview(deepFreeze(fresh()),deepFreeze(inputOf())),baseline);
  // Deep-frozen inputs also survive a second step and a failure path without mutation attempts
  // (a strict-mode write would surface as a TypeError, not LIMIT_EXCEEDED).
  const step=evaluateCognitiveReview(fresh(),inputOf());
  assert.deepEqual(evaluateCognitiveReview(deepFreeze(step.state),deepFreeze(inputOf({tick:144}))),
    evaluateCognitiveReview(step.state,inputOf({tick:144})));
  assert.throws(()=>evaluateCognitiveReview(deepFreeze(fresh()),deepFreeze(inputOf({tick:MAX_DAY_TICK}))),
    {code:'LIMIT_EXCEEDED'});
  // Result state, saved decision and input are fully decoupled — no shared mutable substructure.
  const state=fresh(),input=inputOf();
  const result=evaluateCognitiveReview(state,input);
  assert.notEqual(result.state,state);
  assert.notEqual(result.state.lastEvaluation.input,input);
  assert.notEqual(result.state.lastEvaluation.decision,result.decision);
  result.state.lastEvaluation.input.tick=999;
  result.state.lastEvaluation.input.urgentNeed=true;
  result.decision.reasonCodes.push('EXTRA');
  result.decision.nextReviewTick=999999;
  assert.equal(input.tick,0,'original input untouched');
  assert.equal(input.urgentNeed,false);
  assert.deepEqual(state,fresh(),'original state untouched');
  assert.deepEqual(result.state.lastEvaluation.decision,decisionOf(),'the saved decision clone is independent of result.decision');
  // Deterministic repeat on identical inputs.
  assert.deepEqual(evaluateCognitiveReview(fresh(),inputOf()),baseline);
});

test('regression: reject custom-prototype arrays before any map getter can run',()=>{
  const hostileReasons=(mapResult)=>{
    let getterCalls=0;
    const prototype=Object.create(Array.prototype);
    Object.defineProperty(prototype,'map',{get(){
      getterCalls++;
      return this.mapResult;
    }});
    const reasons=['INITIAL'];
    Object.defineProperty(prototype,'mapResult',{value:mapResult});
    Object.setPrototypeOf(reasons,prototype);
    return {reasons,getterCalls:()=>getterCalls};
  };
  const hostileNested=(mapResult)=>{
    let getterCalls=0;
    const prototype=Object.create(Array.prototype);
    Object.defineProperty(prototype,'map',{get(){getterCalls++;return mapResult;}});
    const nested=[1];
    Object.setPrototypeOf(nested,prototype);
    return {nested,getterCalls:()=>getterCalls};
  };
  const observations=[];
  const observe=(operation,readCount,path)=>{
    let error=null;
    try{operation();}catch(caught){error={name:caught.name,code:caught.code??null};}
    observations.push({path,accepted:error===null,errorCode:error?.code??null,getterCalls:readCount(),
      errorName:error?.name??null});
  };
  const accepted=evaluateCognitiveReview(fresh(),inputOf()).state;

  for(const mapResult of [Array.prototype.map,undefined]){
    const variant=mapResult===undefined?'undefined':'function';
    const reasonState=()=>{
      const reasonCase=hostileReasons(mapResult);
      return {value:{...accepted,lastEvaluation:{...accepted.lastEvaluation,
        decision:{...accepted.lastEvaluation.decision,reasonCodes:reasonCase.reasons}}},
      getterCalls:reasonCase.getterCalls};
    };
    for(const [path,run] of [
      [`validate/state/reasonCodes/map=${variant}`,({value})=>validateCognitiveReviewState(value)],
      [`evaluate/state/reasonCodes/tick=0/map=${variant}`,({value})=>evaluateCognitiveReview(value,inputOf())],
      [`evaluate/state/reasonCodes/tick=144/map=${variant}`,({value})=>evaluateCognitiveReview(value,inputOf({tick:144}))],
    ]){
      const sample=reasonState();
      observe(()=>run(sample),sample.getterCalls,path);
    }

    for(const [path,run] of [
      [`validate/state/unknownExtra.nested/map=${variant}`,(nested)=>validateCognitiveReviewState({...accepted,unknownExtra:{nested}})],
      [`evaluate/state/unknownExtra.nested/map=${variant}`,(nested)=>evaluateCognitiveReview({...accepted,unknownExtra:{nested}},inputOf())],
      [`evaluate/input/unknownExtra.nested/map=${variant}`,(nested)=>evaluateCognitiveReview(fresh(),{...inputOf(),unknownExtra:{nested}})],
    ]){
      const sample=hostileNested(mapResult);
      observe(()=>run(sample.nested),sample.getterCalls,path);
    }
  }
  const expectedPaths=[
    'validate/state/reasonCodes/map=function','evaluate/state/reasonCodes/tick=0/map=function',
    'evaluate/state/reasonCodes/tick=144/map=function','validate/state/unknownExtra.nested/map=function',
    'evaluate/state/unknownExtra.nested/map=function','evaluate/input/unknownExtra.nested/map=function',
    'validate/state/reasonCodes/map=undefined','evaluate/state/reasonCodes/tick=0/map=undefined',
    'evaluate/state/reasonCodes/tick=144/map=undefined','validate/state/unknownExtra.nested/map=undefined',
    'evaluate/state/unknownExtra.nested/map=undefined','evaluate/input/unknownExtra.nested/map=undefined',
  ];
  assert.deepEqual(observations,expectedPaths.map((path)=>({path,accepted:false,errorCode:'INVALID_INPUT',
    getterCalls:0,errorName:'Error'})));
});
