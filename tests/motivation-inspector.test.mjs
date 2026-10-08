import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import vm from 'node:vm';
import { canonicalJson } from '../runtime/core/data-contract.mjs';

const MIND_JS=new URL('../runtime-mind.mjs',import.meta.url);
const MIND_HTML=new URL('../runtime-mind.html',import.meta.url);

// ---- mock readings, explicitly annotated: A2 (runtime/core/motivation-runtime.mjs) is not
// delivered at this baseline, so the page is exercised against hand-built Inspector fixtures
// that follow the m2-contract-v2 DTO shapes. `simulationId` carries the "mock" marker
// (`motivation-village-mock`) that the page displays, so a mock reading is visibly labelled
// rather than silently mistaken for a real backend reading. No production route ever returns
// these fixtures, and the numbers only illustrate display, not planner behaviour.
const MOCK_SIM='motivation-village-mock';
const belief=(value,confidencePermille,evidenceRefs=[],contradictionRefs=[],lastUpdatedTick=null)=>
  ({topic:'public-herbs-available',value,confidencePermille,evidenceRefs,contradictionRefs,lastUpdatedTick});
const plan=(planId,goalId,kind,steps,stepIndex,status,createdDay,deadlineDay,requestId)=>
  ({planId,goalId,kind,steps,stepIndex,status,createdDay,deadlineDay,requestId});
const duty=(overrides={})=>({requestId:'d01',sourceEventSeq:24,observedTick:200,expiresTick:432,
  urgencyPermille:1000,status:'pending',fulfilledTick:null,...overrides});
function knowledge(actorId,overrides={}){
  const b=overrides.belief??belief(overrides.beliefValue??'unknown',0);
  return {
    knowledgeVersion:'motivation-knowledge-v1',phase:overrides.phase??'committed',simulationId:MOCK_SIM,actorId,
    tick:overrides.tick??0,revision:overrides.revision??0,
    self:{name:overrides.name??(actorId==='actor-2'?'猎人':'商人'),occupation:actorId==='actor-2'?'hunter':'merchant',location:'village',
      alive:overrides.alive??true,health:overrides.health??400,hunger:0,fatigue:overrides.fatigue??650,wallet:100,
      inventory:{food:20,herbs:overrides.herbs??1},currentGoal:overrides.currentGoal??null,nextGoalId:2,cooldownUntilDay:0},
    quote:{product:'herbs',price:overrides.price??50,observedTick:0,sourceEventSeq:null},
    observations:overrides.observations??[],belief:b,
    profile:overrides.profile??{dutyWeightPermille:900,riskAversionPermille:200},
    duty:overrides.duty===undefined?null:overrides.duty,
    planState:overrides.planState??{activePlan:null,suspendedPlan:null,nextPlanId:2,lastReviewedDutyId:null},
  };
}
const candidate=(action,provider,sourceRef,extra={})=>({action,provider,sourceRef,eligible:extra.eligible??false,
  score:extra.score??null,support:extra.support??0,opposition:extra.opposition??0,reasonCode:extra.reasonCode??'WAIT',
  selectable:extra.selectable??false,selectionBlockCode:extra.block??null});
// Contract §2 fixed tick-288 example, hand-computed for display only: fatigue 650 + max(0,700-400)
// gives strain 950; Work support floor(1000*900/1000)=900, opposition floor(950*200/1000)=190 → 710.
const tick288Candidates=()=>[
  candidate('UseMedicine','health-need','recover-health',{eligible:true,score:700,support:700,reasonCode:'RECOVER_HEALTH',block:'COMMITMENT_PROTECTED'}),
  candidate('BuyMedicine','health-need','recover-health',{reasonCode:'PRIVATE_MEDICINE_PRESENT',block:'SOFT_PRECONDITION_FAILED'}),
  candidate('WorkForPay','role-request','d01',{eligible:true,score:710,support:900,opposition:190,reasonCode:'DUTY',selectable:true}),
  candidate('Rest','fatigue-need','self-fatigue',{eligible:true,score:650,support:650,reasonCode:'FATIGUE_RELIEF',block:'COMMITMENT_PROTECTED'}),
  candidate('NoAction','fallback',null,{eligible:true,score:0,reasonCode:'WAIT',block:'COMMITMENT_PROTECTED'}),
];
function decision(actorId,overrides={}){
  const tick=overrides.tick??288;
  return {version:'motivation-decision-v1',decisionId:overrides.decisionId??`motivation-day-2-${actorId}`,actorId,tick,
    goalId:overrides.goalId??null,planId:overrides.planId??null,
    innerStance:overrides.innerStance??'health-concerned',
    committedIntent:overrides.committedIntent===undefined?{goalId:1,kind:'recover-health'}:overrides.committedIntent,
    apparentAction:overrides.apparentAction??'NoAction',choice:overrides.choice??'NoAction',
    reasonCode:overrides.reasonCode??'WAIT',gateReason:overrides.gateReason??'SELECT_NEW_PLAN',
    strainPermille:overrides.strainPermille??950,
    candidates:overrides.candidates??tick288Candidates(),
    evidenceRefs:overrides.evidenceRefs??[],
    knowledgeFingerprint:overrides.fingerprint??canonicalJson(knowledge(actorId,{phase:'decision',tick,revision:tick-1,
      belief:belief('available',600,overrides.evidenceRefs??[])}))};
}
const outcome=(overrides={})=>({decisionId:overrides.decisionId??'motivation-day-2-actor-2',actorId:overrides.actorId??'actor-2',
  commandId:overrides.commandId??null,status:overrides.status??'no-action',code:overrides.code??null,
  delta:overrides.delta??{wallet:0,herbs:0,health:0,fatigue:0},price:overrides.price??null,
  publicFoodProduced:overrides.publicFoodProduced??0,failureOwner:overrides.failureOwner??null});
const counterfactual=()=>[
  {caseId:'baseline',changedField:null,fromValue:null,toValue:null,choice:'WorkForPay',gateReason:'NEW_MAJOR_DUTY',candidates:tick288Candidates()},
  {caseId:'duty-minus-200',changedField:'profile.dutyWeightPermille',fromValue:900,toValue:700,choice:'UseMedicine',gateReason:'SELECT_NEW_PLAN',
    candidates:[candidate('UseMedicine','health-need','recover-health',{eligible:true,score:700,support:700,reasonCode:'RECOVER_HEALTH',selectable:true}),
      candidate('WorkForPay','role-request','d01',{eligible:true,score:510,support:700,opposition:190,reasonCode:'DUTY',block:'COMMITMENT_PROTECTED'})]},
  {caseId:'risk-plus-200',changedField:'profile.riskAversionPermille',fromValue:200,toValue:400,choice:'UseMedicine',gateReason:'SELECT_NEW_PLAN',
    candidates:[candidate('UseMedicine','health-need','recover-health',{eligible:true,score:700,support:700,reasonCode:'RECOVER_HEALTH',selectable:true})]},
];
const tick288Actor=overrides=>{
  const {lastDecisionOverride,...rest}=overrides;
  const merged={tick:288,revision:288,beliefValue:'available',
    currentGoal:{goalId:1,kind:'recover-health',target:800,step:'use',deadlineDay:20},
    choice:'WorkForPay',apparentAction:'WorkForPay',reasonCode:'DUTY',gateReason:'NEW_MAJOR_DUTY',planId:2,goalId:null,
    duty:duty(),planState:{activePlan:plan(2,null,'aid-village',['WorkForPay'],0,'ready',2,3,'d01'),
      suspendedPlan:plan(1,1,'recover-health',['BuyMedicine','UseMedicine'],1,'suspended',1,21,null),nextPlanId:3,lastReviewedDutyId:'d01'},
    ...rest};
  return {knowledge:knowledge('actor-2',merged),lastDecision:lastDecisionOverride??decision('actor-2',merged),
    lastOutcome:merged.outcome??null,counterfactual:merged.counterfactual===undefined?counterfactual():merged.counterfactual};
};
function inspector(overrides={}){
  return {
    apiVersion:1,mindVersion:'motivation-inspector-v1',view:'developer',simulationId:MOCK_SIM,
    revision:overrides.revision??0,tick:overrides.tick??0,
    worldFacts:{publicFood:overrides.publicFood??120,publicHerbs:overrides.publicHerbs??20,postedHerbPrice:overrides.postedHerbPrice??50},
    actors:overrides.actors??[{knowledge:knowledge('actor-2'),lastDecision:null,lastOutcome:null,counterfactual:null},
      {knowledge:knowledge('actor-3'),lastDecision:null,lastOutcome:null,counterfactual:null}],
  };
}

async function pageHarness(initialTransport){
  const elements=new Map();
  const make=()=>({textContent:'',hidden:false,disabled:false,value:'',dataset:{},handlers:{},children:[],
    append(child){this.children.push(child);},replaceChildren(){this.children=[];},addEventListener(type,fn){this.handlers[type]=fn;}});
  const document={documentElement:{dataset:{}},createElement:make,_handlers:{},
    addEventListener(type,fn){this._handlers[type]=fn;},
    getElementById(id){if(!elements.has(id))elements.set(id,make());return elements.get(id);}};
  let transport=initialTransport,calls=0;
  const context=vm.createContext({document,AbortSignal,fetch:(...a)=>{calls++;return transport(...a);}});
  const source=await fs.readFile(MIND_JS,'utf8');
  vm.runInContext(source,context);
  let i=0;while(elements.get('mind-status')?.dataset.state==='loading'&&i++<100)await new Promise(r=>setImmediate(r));
  return {elements,document,context,calls:()=>calls,setTransport(fn){transport=fn;}};
}
const okJson=body=>({ok:true,status:200,json:async()=>structuredClone(body)});

test('the static page carries the hypothesis and read-only disclaimers for the counterfactual panel',async()=>{
  const html=await fs.readFile(MIND_HTML,'utf8');
  assert.match(html,/id="m2-counterfactual"[^>]*hidden/);
  assert.match(html,/只读推演 · 不执行动作 · 不代表世界结果或成功/);
  assert.match(html,/分数高≠被选中，承诺门可拦截/);
});

test('M2 reading shows mock-labelled simulation, three world facts and motivation-only blocks',async()=>{
  const p=await pageHarness(async()=>okJson(inspector()));
  assert.equal(p.elements.get('mind-sim').textContent,MOCK_SIM);
  assert.equal(p.elements.get('fact-food').textContent,'120');
  assert.equal(p.elements.get('fact-herbs').textContent,'20');
  assert.equal(p.elements.get('fact-price').textContent,'50');
  assert.equal(p.elements.get('m2-fact-food').hidden,false);
  assert.equal(p.elements.get('m2-duty-plan').hidden,false);
  assert.equal(p.elements.get('m2-counterfactual').hidden,false);
  assert.equal(p.elements.get('m1-stance-row').hidden,true);
  assert.equal(p.elements.get('m1-intent-row').hidden,true);
  assert.equal(p.elements.get('belief-value').textContent,'未知');
  assert.equal(p.elements.get('decision-empty').hidden,false);
  assert.equal(p.elements.get('cf-empty').hidden,false);
  assert.equal(p.elements.get('cf-list').children.length,0);
});

test('M1 readings keep the original layout: motivation blocks stay hidden',async()=>{
  const m1={apiVersion:1,mindVersion:'mind-inspector-v1',view:'developer',simulationId:'mind-village',
    revision:0,tick:0,worldFacts:{publicHerbs:20,postedHerbPrice:50},
    actors:[{knowledge:{knowledgeVersion:'mind-knowledge-v1',phase:'committed',simulationId:'mind-village',actorId:'actor-2',
      tick:0,revision:0,self:{name:'猎人',occupation:'hunter',location:'village',alive:true,health:400,hunger:0,fatigue:200,wallet:100,
      inventory:{food:20,herbs:0},currentGoal:null,nextGoalId:1,cooldownUntilDay:0},
      quote:{product:'herbs',price:50,observedTick:0,sourceEventSeq:null},observations:[],
      belief:belief('unknown',0),innerStance:'uncertain-supply',committedIntent:null},lastDecision:null,lastOutcome:null}]};
  const p=await pageHarness(async()=>okJson(m1));
  assert.equal(p.elements.get('m2-fact-food').hidden,true);
  assert.equal(p.elements.get('m2-duty-plan').hidden,true);
  assert.equal(p.elements.get('m2-counterfactual').hidden,true);
  assert.equal(p.elements.get('m1-stance-row').hidden,false);
  assert.equal(p.elements.get('m1-intent-row').hidden,false);
  assert.equal(p.elements.get('belief-value').textContent,'未知');
  assert.equal(p.elements.get('inner-stance').textContent,'供给不明');
});

test('candidate table shows provider/source, scores, selectable and the commitment gate that blocks high scores',async()=>{
  const p=await pageHarness(async()=>okJson(inspector({revision:288,tick:288,actors:[tick288Actor({}),{knowledge:knowledge('actor-3',{tick:288,revision:288})}]})));
  assert.equal(p.elements.get('decision-choice').textContent,'工作');
  assert.equal(p.elements.get('decision-gate').textContent,'新的重大职责 · 打开完整重评');
  assert.equal(p.elements.get('decision-inner').textContent,'以健康为虑');
  assert.equal(p.elements.get('decision-intent').textContent,'recover-health（目标 1）');
  assert.equal(p.elements.get('decision-apparent').textContent,'工作');
  assert.equal(p.elements.get('decision-plan').textContent,'计划 #2（临时 · 不绑定长期目标）');
  assert.equal(p.elements.get('decision-strain').textContent,'950‰');
  const rows=p.elements.get('m2-candidates-body').children;
  assert.equal(rows.length,5);
  assert.equal(rows[0].children[0].textContent,'用药');
  assert.equal(rows[0].children[1].textContent,'health-need / recover-health');
  assert.equal(rows[0].children[2].textContent,'满足');
  assert.equal(rows[0].children[4].textContent,'700');
  assert.equal(rows[0].children[5].textContent,'承诺保护');
  assert.equal(rows[1].children[5].textContent,'软前提未满足');
  assert.equal(rows[1].children[6].textContent,'PRIVATE_MEDICINE_PRESENT');
  assert.equal(rows[2].children[1].textContent,'role-request / d01');
  assert.equal(rows[2].children[3].textContent,'900 / 190');
  assert.equal(rows[2].children[4].textContent,'710');
  assert.equal(rows[2].children[5].textContent,'可选');
});

test('duty fulfillment, expiry and plan states are read from knowledge only',async()=>{
  const p=await pageHarness(async()=>okJson(inspector({revision:288,tick:288,actors:[tick288Actor({}),{knowledge:knowledge('actor-3')}]})));
  assert.equal(p.elements.get('duty-summary').textContent,'d01 · 紧急度 1000‰ · 窗口 tick 200–432');
  assert.equal(p.elements.get('duty-status').textContent,'待履约');
  assert.equal(p.elements.get('plan-active').textContent,'#2 履行村中职责 · 就绪 · 步骤 0/1（WorkForPay） · 期限 第 4 天');
  assert.equal(p.elements.get('plan-suspended').textContent,'#1 恢复健康 · 挂起 · 步骤 1/2（BuyMedicine → UseMedicine） · 期限 第 22 天');
  assert.equal(p.elements.get('plan-reviewed').textContent,'d01');
  assert.equal(p.elements.get('self-current-goal').textContent,'#1 recover-health · 目标值 800 · 阶段 use · 截止第 21 天');
  assert.equal(p.elements.get('profile-weights').textContent,'职责 900‰ · 风险厌恶 200‰');
});

test('fulfilled duty shows its execution tick and expired duties are marked without inventing state',async()=>{
  const fulfilled=duty({status:'fulfilled',fulfilledTick:288});
  const expired=duty({requestId:'d00',observedTick:20,expiresTick:100,urgencyPermille:500});
  const p=await pageHarness(async()=>okJson(inspector({revision:432,tick:432,actors:[
    {knowledge:knowledge('actor-2',{tick:432,revision:432,duty:fulfilled}),lastDecision:null,lastOutcome:null,counterfactual:null},
    {knowledge:knowledge('actor-3',{tick:432,revision:432,duty:expired}),lastDecision:null,lastOutcome:null,counterfactual:null}]})));
  assert.equal(p.elements.get('duty-status').textContent,'已履约（tick 288）');
  vm.runInContext('selectActor("actor-3")',p.context);
  assert.equal(p.elements.get('duty-status').textContent,'待履约（窗口已过期）');
});

test('outcome shows fatigue delta, public food accounting and failure owner separately from intent',async()=>{
  const rejected=outcome({status:'rejected',code:'RULE_REJECTED',failureOwner:{planId:2,goalId:null}});
  const p=await pageHarness(async()=>okJson(inspector({revision:288,tick:288,actors:[tick288Actor({outcome:rejected}),{knowledge:knowledge('actor-3',{tick:288,revision:288})}]})));
  assert.equal(p.elements.get('outcome-status').textContent,'拒绝');
  assert.equal(p.elements.get('outcome-code').textContent,'RULE_REJECTED');
  assert.equal(p.elements.get('outcome-fatigue').textContent,'0');
  assert.equal(p.elements.get('outcome-owner').textContent,'公粮记账 0 · 失败归属 计划 #2（临时，无长期目标）');
  const worked=outcome({status:'succeeded',commandId:'motivation-day-2-actor-2',delta:{wallet:20,herbs:0,health:0,fatigue:150},publicFoodProduced:8});
  const p2=await pageHarness(async()=>okJson(inspector({revision:288,tick:288,actors:[tick288Actor({outcome:worked}),{knowledge:knowledge('actor-3',{tick:288,revision:288})}]})));
  assert.equal(p2.elements.get('outcome-status').textContent,'成功');
  assert.equal(p2.elements.get('outcome-owner').textContent,'公粮记账 8 · 失败归属 无');
});

test('counterfactual panel labels every case as hypothesis and keeps blocked candidates visible',async()=>{
  const p=await pageHarness(async()=>okJson(inspector({revision:288,tick:288,actors:[tick288Actor({}),{knowledge:knowledge('actor-3',{tick:288,revision:288})}]})));
  const cases=p.elements.get('cf-list').children;
  assert.equal(cases.length,3);
  assert.match(cases[0].textContent,/基准（原配置） · 假设选择 工作 · 门 新的重大职责 · 打开完整重评 · 被拦截：用药（承诺保护）、休息（承诺保护）、无动作（承诺保护）/);
  assert.match(cases[1].textContent,/假设：职责权重 −200 · profile\.dutyWeightPermille 900→700 · 假设选择 用药 · 门 选择新计划/);
  assert.match(cases[1].textContent,/被拦截：工作（承诺保护）/);
  assert.match(cases[2].textContent,/假设：风险厌恶 \+200 · profile\.riskAversionPermille 200→400 · 假设选择 用药/);
});

test('frozen decision knowledge is readable for motivation knowledge and the resumed plan binding is shown',async()=>{
  const d=decision('actor-2',{tick:576,choice:'UseMedicine',apparentAction:'UseMedicine',reasonCode:'RECOVER_HEALTH',
    goalId:1,planId:1,evidenceRefs:[24],gateReason:'RESUME_COMMITTED',
    fingerprint:canonicalJson(knowledge('actor-2',{phase:'decision',tick:576,revision:575,belief:belief('available',900,[30],[12],576)}))});
  const actors=[tick288Actor({tick:576,revision:576,beliefValue:'available',lastDecisionOverride:d}),
    {knowledge:knowledge('actor-3',{tick:576,revision:576}),lastDecision:null,lastOutcome:null,counterfactual:null}];
  const p=await pageHarness(async()=>okJson(inspector({revision:576,tick:576,actors})));
  assert.equal(p.elements.get('decision-gate').textContent,'恢复挂起的治疗计划');
  assert.equal(p.elements.get('decision-plan').textContent,'计划 #1（绑定长期目标 1）');
  assert.equal(p.elements.get('decision-belief').textContent,'有药');
});

test('unreadable frozen knowledge stays reported as unreadable, never inferred from choice',async()=>{
  const d=decision('actor-2',{choice:'BuyMedicine',apparentAction:'BuyMedicine',reasonCode:'BUY_KNOWN_SUPPLY'});
  d.knowledgeFingerprint='not-json';
  const p=await pageHarness(async()=>okJson(inspector({revision:288,tick:288,actors:[tick288Actor({lastDecisionOverride:d}),{knowledge:knowledge('actor-3',{tick:288,revision:288})}]})));
  assert.equal(p.elements.get('decision-belief').textContent,'无法读取合法的当时判断依据');
  assert.match(p.elements.get('belief-note').textContent,/未从选择或原因推断/);
});

test('late lower-revision M2 readings never overwrite newer ones and disconnects keep the last reading',async()=>{
  let rev=288;
  const p=await pageHarness(async()=>okJson(inspector({revision:rev,tick:rev,actors:[tick288Actor({}),{knowledge:knowledge('actor-3',{tick:rev,revision:rev})}]})));
  assert.equal(p.elements.get('mind-time').textContent,'tick 288 · revision 288');
  rev=432;await vm.runInContext('refresh()',p.context);
  assert.equal(p.elements.get('mind-time').textContent,'tick 432 · revision 432');
  rev=144;await vm.runInContext('refresh()',p.context);
  assert.equal(p.elements.get('mind-time').textContent,'tick 432 · revision 432');
  assert.match(p.elements.get('mind-status').textContent,/迟到/);
  p.setTransport(async()=>({ok:false,status:502,json:async()=>{throw new SyntaxError('not json');}}));
  await vm.runInContext('refresh()',p.context);
  assert.equal(p.elements.get('mind-status').dataset.state,'error');
  assert.match(p.elements.get('mind-status').textContent,/保留上次读数/);
  assert.equal(p.elements.get('mind-time').textContent,'tick 432 · revision 432');
});

test('MIND_UNAVAILABLE (404) is surfaced distinctly from a transport failure',async()=>{
  const p=await pageHarness(async()=>({ok:false,status:404,json:async()=>{throw new Error('no');}}));
  assert.equal(p.elements.get('mind-status').dataset.state,'error');
  assert.equal(p.elements.get('mind-status').textContent,'心智检查器不可用。');
});

test('config strings are rendered as plain text, never as HTML',async()=>{
  const payload='<img src=x onerror=alert(1)>';
  const actors=[{knowledge:knowledge('actor-2',{name:payload}),lastDecision:null,lastOutcome:null,counterfactual:null},
    {knowledge:knowledge('actor-3'),lastDecision:null,lastOutcome:null,counterfactual:null}];
  const p=await pageHarness(async()=>okJson(inspector({actors})));
  assert.equal(p.elements.get('self-name').textContent,payload);
  assert.equal(p.elements.get('knowledge-title').textContent,`本人所知 · ${payload}`);
});
