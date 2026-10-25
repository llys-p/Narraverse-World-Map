import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCampaignVillage,createNegotiationCampaignVillage,defaultCampaignVillageConfig,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {providerContext} from '../../runtime/service/npc-language-provider.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
const initial=config=>createAuditedBundle(createMemoryCampaignVillage(42,'npc12-life',config).bundle,options);
const advance=(b,tick)=>deriveCampaignBundle(b,{version:5,commandId:'life-to-'+tick,expectedRevision:b.snapshot.revision,type:'AdvanceTime',payload:{ticks:tick-b.snapshot.tick}}).bundle;
const read=b=>providerContext(npcDialogueContext(b),'你现在准备去哪，最近做了什么？');

test('initial private dialogue carries the hunter own recorded activity without inventing a decision or outcome',()=>{
 const b=initial(),before=structuredClone(b),c=read(b);
 assert.ok(c.activity,'Dialogue must receive its own life context');assert.equal(c.activity.intent.action,'NoAction');
 assert.equal(c.activity.plan,null);assert.equal(c.activity.lastResult,null);assert.equal(c.self.hunger,200);
 assert.deepEqual(b,before);assert.deepEqual(providerContext(c,'你现在准备去哪，最近做了什么？'),c);
});

test('buying intent differs from purchased food, and gifts pause travel without manufacturing another wage',()=>{
 let b=advance(initial(),160),c=read(b);
 assert.equal(c.activity.intent.action,'BuyFood');assert.equal(c.activity.intent.destination,'food-stall');
 assert.equal(c.activity.intent.phase,'at-destination');assert.equal(c.activity.lastResult.action,'WorkForPay');assert.equal(c.self.food,0);
 const gift=(source,id)=>deriveCampaignBundle(source,{version:5,commandId:id,expectedRevision:source.snapshot.revision,type:'PlayerGiftFood',payload:{recipientId:'actor-2'}}).bundle;
 let gifted=gift(gift(b,'gift-one'),'gift-two');gifted=advance(gifted,180);const g=read(gifted);
 assert.equal(g.activity.intent.action,'NoAction');assert.equal(g.activity.intent.destination,'rest-site');assert.equal(g.self.food,2);
 assert.equal(g.activity.lastResult.tick,144);assert.equal(g.self.wallet,20);
 b=advance(b,288);c=read(b);
 assert.equal(c.activity.intent.phase,'awaiting-review');assert.equal(c.activity.plan,null);
 assert.deepEqual(c.activity.lastResult,{action:'BuyFood',status:'succeeded',tick:288,walletChange:-10,foodChange:1});
 assert.equal(c.self.food,0,'Purchased ration has already been consumed at day settlement');assert.equal(c.self.wallet,10);validateBundle(b,options);validateBundle(gifted,options);
});

test('own failed result and movement overrides use known facts without hidden balances or tool ownership',()=>{
 const failed=advance(initial(defaultCampaignVillageConfig('wage-refused')),144),c=read(failed);
 assert.deepEqual(c.activity.lastResult,{action:'WorkForPay',status:'rejected',tick:144,walletChange:0,foodChange:0});
 assert.equal(c.activity.plan.status,'blocked');assert.equal(c.self.wallet,0);
 const b=structuredClone(advance(initial(),112)),w=b.snapshot.world,h=w.mapModel.socialModel.actors[1];
 h.knownCondition=20;let projected=read(b);assert.equal(projected.activity.intent.redirect,'tool');assert.equal(projected.activity.intent.destination,'rest-site');
 const before=structuredClone(projected.activity);
 w.resources.gold=0;w.resources.food=0;w.societyModel.agents[0].state.wallet=999;
 w.mapModel.socialModel.asset.holderId='actor-4';assert.deepEqual(read(b).activity,before);
 h.fear=50;projected=read(b);assert.equal(projected.activity.intent.redirect,'safety');assert.equal(projected.activity.intent.destination,'safety');
 w.actorModel.actors[1].alive=false;assert.equal(read(b).activity.intent.phase,'stopped');
 // Deliberately altered projection boundary, not a claim of valid gameplay states.
});

test('private projection strips internal inputs, rejects future or unpaired results and preserves old fixture context',()=>{
 const b=structuredClone(advance(initial(),144)),w=b.snapshot.world,m=w.motivationModel.actors.find(a=>a.actorId==='actor-2'),original=read(b),raw=npcDialogueContext(b);
 assert.equal(JSON.stringify(original).includes('knowledgeFingerprint'),false);assert.equal(JSON.stringify(original).includes('candidates'),false);
 raw.activity.intent.private='PRIVATE-LIFE-MARKER';raw.activity.plan.private='PRIVATE-LIFE-MARKER';raw.activity.lastResult.private='PRIVATE-LIFE-MARKER';
 raw.activity.knowledgeFingerprint='PRIVATE-LIFE-MARKER';assert.deepEqual(providerContext(raw,'你在做什么？').activity,original.activity);
 raw.activity.lastResult={...original.activity.lastResult,action:'NoAction'};assert.equal(providerContext(raw,'现在呢？').activity.lastResult,null);
 raw.activity.lastResult={...original.activity.lastResult};
 raw.activity.lastResult.tick=145;assert.equal(providerContext(raw,'现在呢？').activity.lastResult,null);
 raw.activity.intent.destination='PRIVATE-LIFE-MARKER';assert.equal(providerContext(raw,'现在呢？').activity.intent,null);
 raw.activity.plan.step='GrantCoins';assert.equal(providerContext(raw,'现在呢？').activity.plan,null);
 m.lastOutcome.decisionId='unpaired';assert.equal(read(b).activity.lastResult,null);
 const old=npcDialogueContext(createNegotiationCampaignVillage().bundle);old.activity=original.activity;old.self.hunger=999;
 const legacy=providerContext(old,'现在呢？');assert.equal(Object.hasOwn(legacy,'activity'),false);assert.equal(Object.hasOwn(legacy.self,'hunger'),false);
});

test('preparing to work is not a paid result and a newly completed action makes its older intent await review',()=>{
 let b=advance(initial(),112),c=read(b);
 assert.ok(c.activity,'Travel needs a separately attributed intention');assert.equal(c.activity.intent.action,'WorkForPay');
 assert.equal(c.activity.intent.phase,'at-destination');assert.equal(c.activity.lastResult,null);assert.equal(c.self.wallet,0);
 assert.equal(c.knownFacts.life.preparation.status,'preparing');assert.equal(c.knownFacts.life.preparation.action,'WorkForPay');assert.equal(c.knownFacts.life.lastExecution,null);
 b=advance(b,144);c=read(b);
 assert.equal(c.activity.intent.phase,'awaiting-review');assert.equal(c.activity.plan.step,'BuyFood');
 assert.deepEqual(c.activity.lastResult,{action:'WorkForPay',status:'succeeded',tick:144,walletChange:20,foodChange:0});
 assert.equal(c.self.wallet,20);validateBundle(b,options);
 assert.equal(c.knownFacts.life.current.wallet,20);assert.equal(c.knownFacts.life.lastExecution.walletChange,20);assert.equal(c.knownFacts.life.preparation.status,'awaiting-review');
});
