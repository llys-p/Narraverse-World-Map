import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {providerContext} from '../../runtime/service/npc-language-provider.mjs';
const initial=()=>createAuditedBundle(createMemoryCampaignVillage(42,'npc16-reason').bundle,{rulesVersion:'d-campaign-v1',systems:campaignSystems()});
const advance=(b,tick)=>deriveCampaignBundle(b,{version:5,commandId:'reason-'+tick,expectedRevision:b.snapshot.revision,type:'AdvanceTime',payload:{ticks:tick-b.snapshot.tick}}).bundle;

test('paired own decision reason remains historical when current preparation has moved on',()=>{
 const b=advance(initial(),160),before=structuredClone(b),raw=npcDialogueContext(b),c=providerContext(raw,'现在为什么去买粮？');
 assert.equal(c.activity.decisionBasis.reasonCode,'FOOD_INCOME');assert.equal(c.activity.decisionBasis.action,'WorkForPay');
 assert.equal(c.knownFacts.life.decisionBasis.tick,144);assert.equal(c.knownFacts.life.decisionBasis.relationToPreparation,'historical');
 assert.match(c.knownFacts.life.decisionBasis.meaning,/买粮.*收入/);
 assert.match(c.knownFacts.life.decisionBasis.authority,/不证明当前准备的完整原因/);
 assert.equal(c.activity.intent.action,'BuyFood');assert.deepEqual(b,before);
 assert.deepEqual(providerContext(c,'现在为什么去买粮？'),c);
});

test('missing, unpaired, future or injected reasons are dropped instead of inventing an explanation',()=>{
 let b=initial();assert.equal(providerContext(npcDialogueContext(b),'现在呢？').knownFacts.life.decisionBasis,null);
 b=advance(b,144);const original=npcDialogueContext(b);
 for(const change of [x=>x.reasonCode='SECRET-UNKNOWN',x=>x.tick=145,x=>x.tick=143,x=>x.action='BuyFood']){
  const raw=structuredClone(original);change(raw.activity.decisionBasis);
  assert.equal(providerContext(raw,'现在呢？').knownFacts.life.decisionBasis,null);
 }
 const raw=structuredClone(original);raw.activity.decisionBasis.secret='PRIVATE-REASON-MARKER';raw.knownFacts={life:{decisionBasis:{meaning:'PRIVATE-REASON-MARKER'}}};
 assert.equal(JSON.stringify(providerContext(raw,'现在呢？')).includes('PRIVATE-REASON-MARKER'),false);
 b=structuredClone(b);b.snapshot.world.motivationModel.actors.find(a=>a.actorId==='actor-2').lastOutcome.decisionId='unpaired';
 assert.equal(npcDialogueContext(b).activity.decisionBasis,undefined);
});

test('a recorded need reason cannot override current resources or a current tool redirect',()=>{
 const b=advance(initial(),144),raw=npcDialogueContext(b);
 // Synthetic projection boundary case: no such extra gameplay is claimed.
 raw.self.food=1;raw.activity.decisionBasis.reasonCode='NO_FOOD_NEED';
 raw.activity.intent.redirect='tool';raw.activity.intent.destination='rest-site';raw.activity.intent.phase='at-destination';
 const c=providerContext(raw,'是不是因为没粮才改道？'),f=c.knownFacts.life;
 assert.equal(f.current.food,1);assert.equal(f.current.foodNeed,'needed');assert.equal(f.preparation.status,'redirected');
 assert.equal(f.decisionBasis.relationToPreparation,'historical');assert.match(f.decisionBasis.meaning,/该次决策时/);
 assert.match(f.decisionBasis.authority,/不证明当前准备的完整原因/);
});
