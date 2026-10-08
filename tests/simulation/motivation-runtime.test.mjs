import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotivationVillage,defaultMotivationVillageConfig} from '../../runtime/fixtures/motivation-village.mjs';
import {createSimulationSession} from '../../runtime/core/command-engine.mjs';
import {executeMotivationPlayerIntent,describeMotivationPlayerActions} from '../../runtime/core/motivation-runtime.mjs';
import {deriveMindBelief} from '../../runtime/core/mind-state.mjs';

const advance=(config,ticks)=>{const f=createMotivationVillage(42,'motivation-village',config),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(ticks);return s.getBundle();};
const entry=b=>b.snapshot.world.motivationModel.actors[0];
const estate=b=>b.snapshot.world.societyModel.agents[1].state;
const decisions=b=>b.eventLog.filter(e=>e.type==='MotivationDecisionPlanned'&&e.payload.actorId==='actor-2').map(e=>e.payload);
const request=(id,tick,urgency,expiresTick)=>({requestId:id,tick,speakerId:'actor-1',listenerId:'actor-2',urgencyPermille:urgency,expiresTick});
const commonGold=b=>b.snapshot.world.resources.gold-b.snapshot.world.societyModel.agents.reduce((n,a)=>n+a.state.wallet,0)-b.snapshot.world.playerModel.wallet;
const failureConfig=()=>{const c=defaultMotivationVillageConfig();c.memory.society.player.initialHerbs=20;
  const r=c.memory.society.actors.market.ecology.resources.resources;r.herbs.initial=50;r.gold.initial=350;return c;};
const soldFailure=()=>{const b=advance(failureConfig(),144);
  assert.equal(commonGold(b),150);assert.equal(b.snapshot.world.marketModel.prices.herbs,40);
  const sold=executeMotivationPlayerIntent(b,{commandId:'drain-cash',type:'PlayerSell',payload:{product:'herbs',quantity:7}});
  assert.equal(sold.outcome,'succeeded');assert.equal(sold.durationTicks,1);assert.equal(commonGold(sold.bundle),10);
  return sold.bundle;};

test('M2 four days preserve Goal1 and Plan1 across real duty and rest',()=>{
  const {bundle,systems}=createMotivationVillage();const session=createSimulationSession(bundle,systems);
  session.advanceTicks(576);const result=session.getBundle(),entry=result.snapshot.world.motivationModel.actors[0];
  const decisions=result.eventLog.filter(e=>e.type==='MotivationDecisionPlanned'&&e.payload.actorId==='actor-2').map(e=>e.payload);
  assert.deepEqual(decisions.map(d=>d.choice),['BuyMedicine','WorkForPay','Rest','UseMedicine']);
  assert.deepEqual(decisions.map(d=>d.gateReason),['SELECT_NEW_PLAN','NEW_MAJOR_DUTY','URGENT_FATIGUE','RESUME_COMMITTED']);
  assert.deepEqual(decisions.map(d=>d.planId),[1,2,3,1]);assert.deepEqual(decisions.map(d=>d.goalId),[1,null,null,1]);
  assert.equal(entry.lastDuty.fulfilledTick,288);assert.equal(entry.lastDuty.status,'fulfilled');
  const estate=result.snapshot.world.societyModel.agents[1].state;
  assert.equal(estate.currentGoal.goalId,1);assert.equal(result.snapshot.world.actorModel.actors[1].health,500);
  assert.equal(estate.ledger.wages,20);assert.equal(estate.ledger.workDays,1);
  const day2=decisions[1];assert.equal(day2.innerStance,'health-concerned');assert.deepEqual(day2.committedIntent,{goalId:1,kind:'recover-health'});
  assert.deepEqual(day2.candidates.map(c=>[c.action,c.score]),[['UseMedicine',700],['BuyMedicine',null],['WorkForPay',710],['Rest',650],['NoAction',0]]);
  for(const day of [2,3])assert.equal(result.snapshot.commandReceipts['motivation-day-'+day+'-actor-2'].input.payload.goalId,0);
  assert.equal(result.snapshot.world.mindModel.actors.every(e=>e.lastDecision===null&&e.lastOutcome===null),true);
  const rest=result.eventLog.find(e=>e.type==='MotivationDecisionResolved'&&e.tick===432&&e.payload.actorId==='actor-2');assert.equal(rest.payload.delta.fatigue,0);
  const daily=result.eventLog.filter(e=>e.type==='SocietyDaySettled');assert.deepEqual(daily.map(e=>e.payload.actors.rows.find(a=>a.actorId==='actor-2').closing.fatigue),[650,800,600,600]);
});

test('major-gate weight and risk pairs select Use, while urgency899 protects the committed Use',()=>{
  for(const [key,value] of [['dutyWeightPermille',700],['riskAversionPermille',400]]){const c=defaultMotivationVillageConfig();c.motivation.profiles[0][key]=value;
    const d=decisions(advance(c,288))[1];assert.equal(d.choice,'UseMedicine');assert.equal(d.gateReason,'NEW_MAJOR_DUTY');}
  for(const urgency of [1000,899]){const c=defaultMotivationVillageConfig();Object.assign(c.motivation.profiles[0],{dutyWeightPermille:1000,riskAversionPermille:0});c.motivation.requests[0].urgencyPermille=urgency;
    const d=decisions(advance(c,288))[1],work=d.candidates[2];assert.equal(work.score,urgency);assert.equal(work.provider,'role-request');assert.equal(work.sourceRef,'d01');
    assert.equal(d.choice,urgency===1000?'WorkForPay':'UseMedicine');assert.equal(d.gateReason,urgency===1000?'NEW_MAJOR_DUTY':'CONTINUE_COMMITTED');
    assert.equal(work.selectable,urgency===1000);assert.equal(work.selectionBlockCode,urgency===1000?null:'COMMITMENT_PROTECTED');
  }
});

test('same frozen candidate makes both actors plan Buy; only the later actual loser gains own-rejection',()=>{
  const c=defaultMotivationVillageConfig();c.memory.society.actors.market.ecology.resources.resources.herbs.initial=1;
  const b=advance(c,144),entries=b.snapshot.world.motivationModel.actors;
  assert.ok(entries.every(e=>e.lastDecision.choice==='BuyMedicine'));
  assert.ok(entries.every(e=>JSON.parse(e.lastDecision.knowledgeFingerprint).belief.value==='available'));
  assert.equal(entries[0].lastOutcome.status,'succeeded');assert.equal(entries[1].lastOutcome.status,'rejected');
  assert.deepEqual(entries[1].lastOutcome.failureOwner,{planId:1,goalId:1});
  assert.equal(b.snapshot.world.societyModel.agents[2].state.currentGoal.failures,1);
  const observations=b.snapshot.world.mindModel.actors[1].observations;assert.deepEqual(observations.map(o=>o.channel),['market-check','own-rejection','daily-public']);
  assert.equal(deriveMindBelief(observations.slice(0,2),144).value,'unknown');
});

test('M2 player adapter preserves all real travel/rest/food/herbs command families and admission boundaries',()=>{
  let b=createMotivationVillage().bundle;const initial=structuredClone(b);
  const commands=[['go','PlayerTravel',{destination:'forest'}],['rest','PlayerRest',{}],['back','PlayerTravel',{destination:'village'}],
    ['buy-food','PlayerBuy',{product:'food',quantity:2}],['sell-food','PlayerSell',{product:'food',quantity:1}],
    ['buy-herbs','PlayerBuy',{product:'herbs',quantity:1}],['sell-herbs','PlayerSell',{product:'herbs',quantity:1}]];
  for(const [commandId,type,payload] of commands){const old=b,result=executeMotivationPlayerIntent(b,{commandId,type,payload});assert.equal(result.outcome,'succeeded');
    assert.equal(result.bundle.snapshot.world.resources.gold,old.snapshot.world.resources.gold);b=result.bundle;}
  assert.deepEqual(initial,createMotivationVillage().bundle);assert.equal(b.snapshot.tick,34);assert.equal(b.snapshot.nextInputSeq,8);
  const actions=describeMotivationPlayerActions(b);assert.equal(actions.canTrade,true);actions.locations.push('other');assert.deepEqual(describeMotivationPlayerActions(b).locations,['village','forest']);
  assert.throws(()=>executeMotivationPlayerIntent(b,{commandId:'go',type:'PlayerRest',payload:{}}),e=>e.code==='COMMAND_ID_CONFLICT');
  assert.throws(()=>executeMotivationPlayerIntent(b,{commandId:'motivation-day-fake',type:'PlayerRest',payload:{}}));
});

test('real player sale makes authority reject temporary Work without charging the health Goal',()=>{
  const base=soldFailure(),s=createSimulationSession(base,createMotivationVillage().systems);s.advanceTicks(143);const b=s.getBundle(),e=entry(b),state=estate(b);
  assert.equal(e.lastDecision.choice,'WorkForPay');assert.equal(e.lastOutcome.status,'rejected');
  assert.deepEqual(e.lastOutcome.failureOwner,{planId:2,goalId:null});assert.equal(e.activePlan.status,'blocked');assert.equal(e.suspendedPlan.planId,1);
  assert.equal(state.currentGoal.failures,0);assert.equal(state.currentGoal.step,'use');assert.equal(state.ledger.failedActions,1);
  assert.equal(state.wallet,50);assert.equal(state.inventory.herbs,1);assert.equal(b.snapshot.world.actorModel.actors[1].fatigue,650);
  assert.equal(e.lastDuty.status,'pending');assert.equal(e.lastDuty.fulfilledTick,null);assert.equal(commonGold(b),10);
  assert.equal(b.snapshot.world.mindModel.actors[0].observations.some(o=>o.channel==='own-rejection'),false);
  assert.equal(deriveMindBelief(b.snapshot.world.mindModel.actors[0].observations,288).value,'available');
  s.advanceTicks(144);const next=s.getBundle();assert.equal(entry(next).lastDecision.choice,'UseMedicine');assert.equal(entry(next).lastDecision.planId,1);
  assert.equal(next.snapshot.world.actorModel.actors[1].health,500);assert.equal(estate(next).ledger.failedActions,1);
});

test('request supersession persists immediately off boundary and merges with daily PlanSettled on boundary',()=>{
  for(const tick of [310,432]){const c=failureConfig();c.motivation.requests=[request('d01',200,1000,432),request('replacement',tick,899,tick+144)];
    const b144=advance(c,144),sold=executeMotivationPlayerIntent(b144,{commandId:'drain',type:'PlayerSell',payload:{product:'herbs',quantity:7}}).bundle;
    const s=createSimulationSession(sold,createMotivationVillage().systems);s.advanceTicks(tick-145);const b=s.getBundle(),e=entry(b);
    const settles=b.eventLog.filter(e=>e.type==='MotivationPlanSettled'&&e.tick===tick&&e.payload.actorId==='actor-2');assert.equal(settles.length,1);
    assert.ok(settles[0].payload.transitions.some(t=>t.planId===2&&t.reasonCode==='REQUEST_SUPERSEDED'&&t.toStatus==='cancelled'));
    assert.equal(e.lastDuty.requestId,'replacement');assert.equal(e.lastDuty.status,'pending');assert.equal(e.lastDuty.fulfilledTick,null);
    assert.equal(estate(b).currentGoal.failures,0);assert.equal(estate(b).ledger.wages,0);
    if(tick===310){assert.equal(e.activePlan,null);assert.equal(e.suspendedPlan.planId,1);assert.equal(settles[0].payload.decisionId,null);
      assert.deepEqual(settles[0].causationEventSeqs,[e.lastDuty.sourceEventSeq]);}
    else{assert.equal(e.lastDecision.choice,'UseMedicine');assert.equal(e.lastDecision.gateReason,'RESUME_COMMITTED');}
  }
});

test('a second real temporary Work rejection records outcome/ledger without repeating stable blocked transitions',()=>{
  const c=failureConfig();c.motivation.requests[0].expiresTick=488;
  const b144=advance(c,144),sold=executeMotivationPlayerIntent(b144,{commandId:'drain',type:'PlayerSell',payload:{product:'herbs',quantity:7}}).bundle;
  const s=createSimulationSession(sold,createMotivationVillage().systems);s.advanceTicks(432-145);const b=s.getBundle();
  assert.equal(entry(b).lastOutcome.status,'rejected');assert.equal(estate(b).ledger.failedActions,2);assert.equal(estate(b).currentGoal.failures,0);
  assert.equal(entry(b).activePlan.planId,2);assert.equal(entry(b).activePlan.status,'blocked');
  const settled=b.eventLog.find(e=>e.type==='MotivationPlanSettled'&&e.tick===432&&e.payload.actorId==='actor-2');assert.deepEqual(settled.payload.transitions,[]);
});

test('legal deadline prefix blocks Buy once, waits through day20 and retires Goal1 at day21',()=>{
  const c=defaultMotivationVillageConfig();for(const a of c.memory.society.actors.initialActors.slice(1,3))a.fatigue=200;
  for(const e of c.memory.society.estates){e.initialFood=32;e.initialHerbs=0;}c.memory.society.player.initialHerbs=0;
  c.memory.society.actors.market.ecology.resources.resources.herbs.initial=0;
  c.memory.society.actors.market.products.herbs.maxOrder=0;
  c.mind.stimuli=[{stimulusId:'deadline-statement',tick:12,kind:'statement',speakerId:'actor-1',listenerId:'actor-2',available:true}];c.motivation.requests=[];
  const f=createMotivationVillage(42,'deadline',c),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(144);
  const first=s.getBundle();assert.equal(entry(first).lastOutcome.status,'rejected');assert.deepEqual(entry(first).lastOutcome.failureOwner,{planId:1,goalId:1});
  assert.equal(estate(first).currentGoal.failures,1);assert.equal(entry(first).activePlan.status,'blocked');assert.equal(entry(first).activePlan.stepIndex,0);
  s.advanceTicks(19*144);const day20=s.getBundle();assert.equal(estate(day20).currentGoal.goalId,1);assert.equal(estate(day20).currentGoal.failures,1);
  assert.ok(decisions(day20).slice(1).every(d=>d.choice==='NoAction'));assert.equal(estate(day20).ledger.failedActions,1);
  s.advanceTicks(144);const day21=s.getBundle();assert.equal(estate(day21).currentGoal,null);assert.equal(entry(day21).activePlan,null);
  assert.equal(estate(day21).ledger.goalsFailed,1);assert.equal(estate(day21).cooldownUntilDay,23);
  s.advanceTicks(144);const day22=s.getBundle();assert.equal(estate(day22).currentGoal,null);assert.equal(estate(day22).nextGoalId,2);
  s.advanceTicks(144);const day23=s.getBundle();assert.equal(estate(day23).currentGoal.goalId,2);assert.equal(entry(day23).activePlan,null);assert.equal(entry(day23).nextPlanId,2);
});

test('legal death after successful Buy cleans Goal/Plan once and freezes later input/observations',()=>{
  const c=defaultMotivationVillageConfig();Object.assign(c.memory.society.actors.initialActors[1],{health:1,hunger:1000});c.memory.society.estates[1].initialFood=0;
  c.mind.stimuli.push({stimulusId:'dead-check',tick:210,kind:'market-check',listenerId:'actor-2'});
  const f=createMotivationVillage(42,'death',c),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(144);const first=s.getBundle();
  assert.equal(first.snapshot.world.actorModel.actors[1].alive,false);assert.equal(entry(first).lastOutcome.status,'succeeded');
  assert.equal(estate(first).ledger.failedActions,0);assert.equal(estate(first).ledger.goalsFailed,1);assert.equal(estate(first).currentGoal,null);assert.equal(entry(first).activePlan,null);
  const sealed=structuredClone(entry(first)),observations=structuredClone(first.snapshot.world.mindModel.actors[0].observations),wallet=estate(first).wallet;
  assert.equal(estate(first).inventory.herbs,1);s.advanceTicks(432);const final=s.getBundle();assert.deepEqual(entry(final),sealed);
  assert.deepEqual(final.snapshot.world.mindModel.actors[0].observations,observations);assert.equal(estate(final).wallet,wallet);assert.equal(estate(final).ledger.goalsFailed,1);
  assert.equal(final.eventLog.find(e=>e.type==='MotivationRequestResolved').payload.status,'unavailable');
  assert.equal(final.eventLog.find(e=>e.type==='MindStimulusResolved'&&e.tick===210).payload.status,'unavailable');
});
