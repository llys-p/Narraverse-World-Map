import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import vm from 'node:vm';
import { canonicalJson } from '../runtime/core/data-contract.mjs';

const MIND_JS=new URL('../runtime-mind.mjs',import.meta.url);

// ---- mock readings, explicitly annotated: M1A is not delivered, so the page is exercised
// against a hand-built Inspector fixture. `simulationId` carries the "mock" marker (`mind-village-mock`)
// that the page displays, so a mock reading is visibly labelled rather than silently mistaken for a
// real backend reading. No production route ever returns these fixtures.
const MOCK_SIM='mind-village-mock';
const stance=value=>value==='available'?'expect-supply':value==='unavailable'?'expect-no-supply':'uncertain-supply';
const belief=(value,confidencePermille,evidenceRefs=[],contradictionRefs=[],lastUpdatedTick=null)=>
  ({topic:'public-herbs-available',value,confidencePermille,evidenceRefs,contradictionRefs,lastUpdatedTick});
const decision=(actorId,choice,reasonCode,evidenceRefs=[])=>({version:'mind-decision-v1',decisionId:`mind-day-1-${actorId}`,
  actorId,tick:144,goalId:3,choice,reasonCode,candidates:[
    {action:'UseMedicine',eligible:false,reasonCode:'NO_PRIVATE_MEDICINE'},
    {action:'BuyMedicine',eligible:false,reasonCode:'SUPPLY_UNAVAILABLE'},
    {action:'NoAction',eligible:true,reasonCode:'WAIT'},
  ],evidenceRefs,knowledgeFingerprint:canonicalJson(knowledge(actorId,{phase:'decision',tick:144,revision:143,
    belief:belief(reasonCode==='SUPPLY_UNAVAILABLE'?'unavailable':'unknown',reasonCode==='SUPPLY_UNAVAILABLE'?600:0,evidenceRefs)}))});
function knowledge(actorId,overrides={}){
  const b=overrides.belief??belief(overrides.beliefValue??'unknown',0);
  return {
    knowledgeVersion:'mind-knowledge-v1',phase:overrides.phase??'committed',simulationId:MOCK_SIM,actorId,
    tick:overrides.tick??0,revision:overrides.revision??0,
    self:{name:overrides.name??(actorId==='actor-2'?'猎人':'商人'),occupation:actorId==='actor-2'?'hunter':'merchant',location:'village',
      alive:overrides.alive??true,health:400,hunger:0,fatigue:200,wallet:100,inventory:{food:20,herbs:overrides.herbs??0},
      currentGoal:overrides.currentGoal??null,nextGoalId:1,cooldownUntilDay:0},
    quote:{product:'herbs',price:overrides.price??50,observedTick:0,sourceEventSeq:null},
    observations:overrides.observations??[],belief:b,innerStance:stance(b.value),
    committedIntent:overrides.committedIntent??null,
  };
}
function inspector(overrides={}){
  return {
    apiVersion:1,mindVersion:'mind-inspector-v1',view:'developer',simulationId:MOCK_SIM,
    revision:overrides.revision??0,tick:overrides.tick??0,
    worldFacts:{publicHerbs:overrides.publicHerbs??20,postedHerbPrice:overrides.postedHerbPrice??50},
    actors:overrides.actors??[{knowledge:knowledge('actor-2'),lastDecision:null,lastOutcome:null},
      {knowledge:knowledge('actor-3'),lastDecision:null,lastOutcome:null}],
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

test('initial reading shows world facts, unknown belief, no decision yet and an explicit mock simulation id',async()=>{
  const p=await pageHarness(async()=>okJson(inspector()));
  assert.equal(p.elements.get('mind-sim').textContent,MOCK_SIM);
  assert.equal(p.elements.get('mind-time').textContent,'tick 0 · revision 0');
  assert.equal(p.elements.get('fact-herbs').textContent,'20');
  assert.equal(p.elements.get('fact-price').textContent,'50');
  assert.equal(p.elements.get('belief-value').textContent,'未知');
  assert.equal(p.elements.get('mind-status').dataset.state,'ready');
  assert.equal(p.elements.get('decision-empty').hidden,false);
  assert.equal(p.elements.get('decision-empty').textContent,'尚未到决策时点');
  assert.equal(p.elements.get('decision-fields').hidden,true);
  assert.equal(p.elements.get('outcome-fields').hidden,true);
});

test('two-person selection switches locally without refetching, including keyboard 1/2',async()=>{
  const p=await pageHarness(async()=>okJson(inspector()));
  const before=p.calls();
  vm.runInContext('selectActor("actor-3")',p.context);
  assert.equal(p.elements.get('knowledge-title').textContent,'本人所知 · 商人');
  assert.equal(p.calls(),before);
  p.document._handlers.keydown({key:'1'});
  assert.equal(p.elements.get('knowledge-title').textContent,'本人所知 · 猎人');
  assert.equal(p.calls(),before);
});

test('a corrected belief keeps the original decision basis and marks the correction explicitly',async()=>{
  const d=decision('actor-2','NoAction','SUPPLY_UNAVAILABLE',[12]);
  const actors=[{knowledge:knowledge('actor-2',{tick:144,revision:144,belief:belief('available',900,[30],[12],144)}),lastDecision:d,lastOutcome:null},
    {knowledge:knowledge('actor-3',{tick:144,revision:144}),lastDecision:null,lastOutcome:null}];
  const p=await pageHarness(async()=>okJson(inspector({revision:144,tick:144,actors})));
  assert.equal(p.elements.get('belief-value').textContent,'有药');
  assert.equal(p.elements.get('decision-choice').textContent,'无动作');
  assert.equal(p.elements.get('decision-evidence').textContent,'12');
  assert.equal(p.elements.get('decision-belief').textContent,'无药');
  assert.match(p.elements.get('decision-candidates').children?.[0]?.textContent??'',/不可选/);
  assert.match(p.elements.get('belief-note').textContent,/已纠正/);
});

test('UseMedicine does not invent the old belief from choice and shows received observations',async()=>{
  const d=decision('actor-2','UseMedicine','USE_OWN_MEDICINE',[12]);
  d.knowledgeFingerprint=canonicalJson(knowledge('actor-2',{phase:'decision',tick:144,revision:143,
    belief:belief('unavailable',600,[12]),observations:[{sourceEventSeq:12,occurrenceTick:12,observedTick:12,
      channel:'statement',sourceActorId:'actor-1',available:false,confidencePermille:600,expiresTick:300}]}));
  const current=knowledge('actor-2',{tick:144,revision:144,belief:belief('available',900,[30],[12],144),
    observations:[{sourceEventSeq:12,occurrenceTick:12,observedTick:12,channel:'statement',sourceActorId:'actor-1',available:false,
      confidencePermille:600,expiresTick:300}]});
  const p=await pageHarness(async()=>okJson(inspector({revision:144,tick:144,actors:[
    {knowledge:current,lastDecision:d,lastOutcome:null},{knowledge:knowledge('actor-3'),lastDecision:null,lastOutcome:null}]})));
  assert.equal(p.elements.get('decision-belief').textContent,'无药');
  assert.equal(p.elements.get('belief-note').textContent,'已纠正：当时依据结论为「无药」，当前判断为「有药」。');
  assert.match(p.elements.get('observations-list').children[0].textContent,/statement · 无药 · tick 12 · 来源事件 12/);
});

test('invalid or absent frozen knowledge fingerprint is reported as unreadable rather than guessed',async()=>{
  const d=decision('actor-2','BuyMedicine','FUNDS_INSUFFICIENT',[12]);
  d.knowledgeFingerprint='not-json';
  const p=await pageHarness(async()=>okJson(inspector({actors:[
    {knowledge:knowledge('actor-2',{beliefValue:'available'}),lastDecision:d,lastOutcome:null},
    {knowledge:knowledge('actor-3'),lastDecision:null,lastOutcome:null}]})));
  assert.equal(p.elements.get('decision-belief').textContent,'无法读取合法的当时判断依据');
  assert.match(p.elements.get('belief-note').textContent,/未从选择或原因推断/);
});

test('success and rejection outcomes render status, code and deltas',async()=>{
  const buy=decision('actor-3','BuyMedicine','BUY_KNOWN_SUPPLY',[24]);
  const reject=decision('actor-2','BuyMedicine','READY',[24]);
  const actors=[
    {knowledge:knowledge('actor-2',{tick:144,revision:144}),lastDecision:reject,
      lastOutcome:{decisionId:reject.decisionId,actorId:'actor-2',commandId:null,status:'rejected',code:'RULE_REJECTED',delta:{wallet:0,herbs:0,health:0},price:null}},
    {knowledge:knowledge('actor-3',{tick:144,revision:144}),lastDecision:buy,
      lastOutcome:{decisionId:buy.decisionId,actorId:'actor-3',commandId:'mind-day-1-actor-3',status:'succeeded',code:null,delta:{wallet:-50,herbs:1,health:0},price:50}},
  ];
  const p=await pageHarness(async()=>okJson(inspector({revision:144,tick:144,actors})));
  assert.equal(p.elements.get('outcome-status').textContent,'拒绝');
  assert.equal(p.elements.get('outcome-code').textContent,'RULE_REJECTED');
  vm.runInContext('selectActor("actor-3")',p.context);
  assert.equal(p.elements.get('outcome-status').textContent,'成功');
  assert.equal(p.elements.get('outcome-delta').textContent,'钱包 -50 · 药 1 · 健康 0');
  assert.equal(p.elements.get('outcome-price').textContent,'50');
});

test('a dead actor shows a sealed reading that preserves the archived decision',async()=>{
  const d=decision('actor-2','NoAction','SUPPLY_UNAVAILABLE',[12]);
  const actors=[{knowledge:knowledge('actor-2',{tick:288,revision:288,alive:false,belief:belief('unavailable',600,[12])}),lastDecision:d,
      lastOutcome:{decisionId:d.decisionId,actorId:'actor-2',commandId:null,status:'no-action',code:null,delta:{wallet:0,herbs:0,health:0},price:null}},
    {knowledge:knowledge('actor-3',{tick:288,revision:288}),lastDecision:null,lastOutcome:null}];
  const p=await pageHarness(async()=>okJson(inspector({revision:288,tick:288,actors})));
  assert.equal(p.elements.get('knowledge-alive').textContent,'已故 · 封存');
  assert.equal(p.elements.get('decision-seal').textContent,'封存记录');
  assert.equal(p.elements.get('decision-choice').textContent,'无动作');
});

test('disconnect or non-JSON shows a read failure and keeps the last reading and revision',async()=>{
  let mode='ok';
  const p=await pageHarness(async()=>mode==='ok'?okJson(inspector({revision:24,tick:24})):{ok:false,status:502,json:async()=>{throw new SyntaxError('not json');}});
  assert.equal(p.elements.get('mind-time').textContent,'tick 24 · revision 24');
  mode='fail';
  await vm.runInContext('refresh()',p.context);
  assert.equal(p.elements.get('mind-status').dataset.state,'error');
  assert.match(p.elements.get('mind-status').textContent,/保留上次读数/);
  assert.equal(p.elements.get('mind-time').textContent,'tick 24 · revision 24');
});

test('a late lower-revision reading never overwrites the newer one',async()=>{
  let rev=24;
  const p=await pageHarness(async()=>okJson(inspector({revision:rev,tick:rev})));
  rev=48;await vm.runInContext('refresh()',p.context);
  assert.equal(p.elements.get('mind-time').textContent,'tick 48 · revision 48');
  rev=12;await vm.runInContext('refresh()',p.context);
  assert.equal(p.elements.get('mind-time').textContent,'tick 48 · revision 48');
  assert.match(p.elements.get('mind-status').textContent,/迟到/);
});

test('MIND_UNAVAILABLE (404) is surfaced distinctly from a transport failure',async()=>{
  const p=await pageHarness(async()=>({ok:false,status:404,json:async()=>{throw new Error('no');}}));
  assert.equal(p.elements.get('mind-status').dataset.state,'error');
  assert.equal(p.elements.get('mind-status').textContent,'心智检查器不可用。');
});

test('config strings are rendered as plain text, never as HTML',async()=>{
  const payload='<img src=x onerror=alert(1)>';
  const actors=[{knowledge:knowledge('actor-2',{name:payload}),lastDecision:null,lastOutcome:null},
    {knowledge:knowledge('actor-3'),lastDecision:null,lastOutcome:null}];
  const p=await pageHarness(async()=>okJson(inspector({actors})));
  assert.equal(p.elements.get('self-name').textContent,payload);
  assert.equal(p.elements.get('knowledge-title').textContent,`本人所知 · ${payload}`);
});
