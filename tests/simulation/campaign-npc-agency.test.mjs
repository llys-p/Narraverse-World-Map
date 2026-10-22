import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignVillage,createNpcCampaignVillage,defaultCampaignVillageConfig} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {executeAuditedCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {campaignSurvivalTravel} from '../../runtime/core/motivation-runtime.mjs';
import {mapView} from '../../runtime/core/campaign-map.mjs';

const world=b=>b.snapshot.world;
const hunter=b=>world(b).mapModel.npcs[1];
const estate=b=>world(b).societyModel.agents[1].state;
const mind=b=>world(b).motivationModel.actors.find(a=>a.actorId==='actor-2');
function initial(config){const {bundle,systems}=createNpcCampaignVillage(42,'npc-agency-test',config);
  return createAuditedBundle(bundle,{rulesVersion:bundle.snapshot.rulesVersion,systems});}
function send(bundle,type,payload={}){return deriveCampaignBundle(bundle,{version:5,commandId:`npc-${bundle.snapshot.revision}-${type}`,
  expectedRevision:bundle.snapshot.revision,type,payload}).bundle;}
const until=(b,tick)=>send(b,'AdvanceTime',{ticks:tick-b.snapshot.tick});
const xy=n=>({x:n.x,y:n.y});
let prefix;
function worked(){return prefix??=until(initial(),160);}

test('hunter moves for a known opportunity, earns once, carries the same plan to food and really eats',()=>{
  let b=until(initial(),96);
  assert.deepEqual(xy(hunter(b)),{x:5,y:8});assert.equal(world(b).mapModel.hunterIntent.action,'NoAction');
  b=until(b,112);assert.deepEqual(xy(hunter(b)),{x:5,y:6});
  assert.equal(world(b).mapModel.hunterIntent.action,'WorkForPay');assert.equal(estate(b).wallet,0);
  assert.equal(mind(b).activePlan,null,'preparing travel does not commit a speculative plan');
  assert.equal(mind(b).lastDecision,null,'preparing travel does not manufacture a decision fact');
  b=until(b,144);assert.equal(estate(b).wallet,20);assert.equal(mind(b).lastOutcome.status,'succeeded');
  const plan=structuredClone(mind(b).activePlan);assert.deepEqual(plan.steps,['WorkForPay','BuyFood']);assert.equal(plan.stepIndex,1);
  b=until(b,160);prefix=b;assert.deepEqual(xy(hunter(b)),{x:3,y:7});assert.deepEqual(mind(b).activePlan,plan);
  assert.equal(world(b).mapModel.hunterIntent.planId,plan.planId);
  const dto={version:5,commandId:'npc-finish',expectedRevision:b.snapshot.revision,type:'AdvanceTime',payload:{ticks:128}};
  const live=deriveCampaignBundle(b,dto),full=executeAuditedCampaignIntent(structuredClone(b),dto);
  assert.deepEqual(live,full,'new fixture follows the same complete replay oracle');b=live.bundle;
  assert.equal(estate(b).wallet,10);assert.equal(estate(b).inventory.food,0,'the purchased ration was consumed at day settlement');
  assert.equal(mind(b).activePlan,null);assert.equal(mind(b).lastDecision.choice,'BuyFood');
  assert.equal(mind(b).lastOutcome.delta.food,1);assert.equal(mind(b).lastOutcome.delta.wallet,-10);
  const decisions=b.eventLog.filter(e=>e.type==='MotivationDecisionResolved'&&e.payload.actorId==='actor-2');
  assert.deepEqual(decisions.map(e=>e.payload.delta.wallet),[20,-10]);
});

test('one gift keeps the food need, two gifts pause buying and preserve earned wages and the owned plan',()=>{
  const baseline=worked(),planId=mind(baseline).activePlan.planId;
  let b=send(baseline,'PlayerGiftFood',{recipientId:'actor-2'});b=until(b,164);
  assert.equal(estate(b).inventory.food,1);assert.equal(world(b).mapModel.hunterIntent.action,'BuyFood');
  b=send(b,'PlayerGiftFood',{recipientId:'actor-2'});b=until(b,180);
  assert.equal(estate(b).inventory.food,2);assert.deepEqual(xy(hunter(b)),{x:5,y:8});
  assert.equal(world(b).mapModel.hunterIntent.action,'NoAction');assert.equal(estate(b).wallet,20);
  b=until(b,288);assert.equal(mind(b).lastDecision.choice,'NoAction');assert.equal(estate(b).wallet,20);
  assert.equal(estate(b).inventory.food,1);assert.equal(mind(b).activePlan.planId,planId);
  assert.equal(mind(b).activePlan.status,'blocked');
  const received=world(b).memoryModel.observer.actors.find(a=>a.actorId==='actor-2').memories.filter(m=>m.observable.type==='food-gift');
  assert.equal(received.length,2);
});

test('a late opportunity cannot pay remotely; an actual unpaid job remains a failed experience',()=>{
  const late=defaultCampaignVillageConfig('earn-then-buy');late.motivation.requests[0].tick=142;
  let b=until(initial(late),144);
  assert.deepEqual(xy(hunter(b)),{x:5,y:7},'only one step was possible before settlement');
  assert.equal(mind(b).lastDecision.choice,'WorkForPay');assert.equal(mind(b).lastOutcome.status,'rejected');
  assert.equal(estate(b).wallet,0);assert.equal(mind(b).activePlan.status,'blocked');
  b=until(b,148);assert.equal(world(b).mapModel.hunterIntent.action,'NoAction','expired offer is not a future paycheck');
  const refused=until(initial(defaultCampaignVillageConfig('wage-refused')),144);
  assert.deepEqual(xy(hunter(refused)),{x:5,y:6});assert.equal(mind(refused).lastOutcome.status,'rejected');
  assert.equal(estate(refused).wallet,0);
  const experience=refused.eventLog.find(e=>e.type==='ExperienceWorkObserved'&&e.payload.actorId==='actor-2');
  assert.equal(experience.payload.experienceView.failureCount,1);
  assert.equal(world(refused).experienceModel.actors.find(a=>a.actorId==='actor-2').workExperienceState.samples[0].status,'rejected');
});

test('empty food supply does not create a trip or ration, death stops movement, and preparation reads no hidden balances',()=>{
  let b=until(initial(defaultCampaignVillageConfig('no-food')),144);
  assert.equal(world(b).actorModel.actors[1].alive,false);assert.equal(estate(b).inventory.food,0);
  const at=xy(hunter(b));b=until(b,148);assert.deepEqual(xy(hunter(b)),at);
  const source=worked(),copy=structuredClone(world(source));
  const expected=campaignSurvivalTravel(copy,source.eventLog,164,source.snapshot.simulationId);
  copy.resources.food=0;copy.resources.gold=0;copy.societyModel.agents[0].state.wallet=999;
  assert.deepEqual(campaignSurvivalTravel(copy,source.eventLog,164,source.snapshot.simulationId),expected,
    'only published observations, not current hidden stocks or other wallets, guide travel');
});

test('legacy route remains frozen; version splices and plausible but unearned hunter positions fail replay',()=>{
  const {bundle:old,systems}=createCampaignVillage();
  const legacy=until(createAuditedBundle(old,{rulesVersion:old.snapshot.rulesVersion,systems}),8);
  assert.deepEqual(xy(hunter(legacy)),{x:7,y:7});assert.equal(world(legacy).mapModel.version,'campaign-map-v1');
  assert.equal(Object.hasOwn(world(legacy).mapModel,'hunterIntent'),false);
  const small=until(initial(),8),options={rulesVersion:small.snapshot.rulesVersion,systems};
  for(const mutate of [b=>{b.snapshot.fixtureVersion='1';},b=>{hunter(b).x=4;},b=>{world(b).mapModel.hunterIntent.action='BuyFood';}]){
    const bad=structuredClone(small);mutate(bad);assert.throws(()=>validateBundle(bad,options));
  }
  const view=mapView(worked(),100);
  assert.ok(view.actors.some(a=>a.actorId==='actor-2'));
  assert.ok(view.actors.every(a=>!Object.hasOwn(a,'wallet')&&!Object.hasOwn(a,'planId')&&!Object.hasOwn(a,'hunterIntent')));
});
