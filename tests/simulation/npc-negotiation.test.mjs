import test from 'node:test';
import assert from 'node:assert/strict';
import {createNegotiationCampaignVillage,createSocialCampaignVillage,defaultCampaignVillageConfig,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {executeAuditedCampaignIntent} from '../../runtime/core/scene-campaign-runtime.mjs';
import {mapView} from '../../runtime/core/campaign-map.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {validateCampaignReceipt} from '../../runtime-campaign-contract.mjs';
import {validNegotiationView} from '../../runtime-negotiation-contract.mjs';

const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()},hunter='actor-2';
const start=(factory=createNegotiationCampaignVillage)=>createAuditedBundle(factory(42,'negotiation-test').bundle,options);
const dto=(b,type,payload)=>({version:5,commandId:`neg-${b.snapshot.revision}-${type}`,expectedRevision:b.snapshot.revision,type,payload});
const run=(b,type,payload)=>deriveCampaignBundle(b,dto(b,type,payload));
const social=(b,action)=>run(b,'PlayerInteract',{targetId:hunter,action});
const agreement=b=>b.snapshot.world.mapModel.negotiationModel.agreement;
const asset=b=>b.snapshot.world.mapModel.socialModel.asset;
const act=(b,action,id=agreement(b).id)=>run(b,'PlayerAgreement',{targetId:hunter,agreementId:id,action});
function ready(loanTicks=36){let b=start();b=run(b,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:20,loanTicks}}).bundle;b=act(b,'accept').bundle;b=social(b,'help').bundle;return social(b,'help').bundle;}
const dialogue=(utterance,proposal=null)=>({targetId:hunter,utterance,reply:'先按约定实际修理，再来领取工具。',memoryRefs:[],proposal,model:'offline-test',seal:'0'.repeat(64)});

test('hunter counters duration/repair terms; accepted promise requires real work before a unique loan and timely return',()=>{
 let b=start();const p=run(b,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:20,loanTicks:144}});b=p.bundle;
 assert.equal(p.receipt.result.effect,'countered');assert.deepEqual(agreement(b).terms,{repairAmount:40,loanTicks:72});assert.equal(asset(b).holderId,hunter);
 b=act(b,'accept').bundle;assert.equal(agreement(b).status,'accepted');
 const said=run(b,'PlayerDialogue',dialogue('我已经修好了工具'));b=said.bundle;assert.equal(said.receipt.durationTicks,0);
 assert.equal(asset(b).condition,60);assert.equal(agreement(b).repairProgress,0);assert.equal(act(b,'claim').receipt.outcome,'rejected');
 b=social(b,'help').bundle;assert.equal(agreement(b).repairProgress,20);assert.equal(act(b,'claim').receipt.outcome,'rejected');
 b=social(b,'help').bundle;assert.equal(agreement(b).status,'ready');assert.equal(social(b,'ask-help').receipt.outcome,'rejected');
 const claimed=act(b,'claim');assert.equal(validateCampaignReceipt(claimed.receipt,dto(b,'PlayerAgreement',{targetId:hunter,agreementId:agreement(b).id,action:'claim'}),b.snapshot.tick),true);
 b=claimed.bundle;assert.equal(asset(b).holderId,'actor-4');assert.equal(asset(b).ownerId,hunter);assert.equal(asset(b).loanDueTick,b.snapshot.tick+72);
 assert.equal(act(b,'claim').receipt.outcome,'rejected');b=social(b,'return').bundle;assert.equal(agreement(b).status,'fulfilled');assert.equal(asset(b).holderId,hunter);
 assert.match(b.snapshot.world.mapModel.socialModel.actors[1].memories.at(-1).text,/按时完成/);
 assert.equal(validNegotiationView(mapView(b,100).negotiation,b.snapshot.tick),true);validateBundle(b,options);
});

test('overdue loan records breach once, retains harm after late return, and replays exactly',()=>{
 let b=act(ready(),'claim').bundle;const due=agreement(b).dueTick;
 b=run(b,'AdvanceTime',{ticks:due-b.snapshot.tick+1}).bundle;assert.equal(agreement(b).status,'breached');
 const h=()=>b.snapshot.world.mapModel.socialModel.actors[1],trust=h().trust,grievance=h().grievance;
 assert.equal(h().memories.filter(m=>m.kind==='overdue').length,1);
 b=run(b,'AdvanceTime',{ticks:1}).bundle;assert.equal(h().trust,trust);assert.equal(h().grievance,grievance);
 b=social(b,'return').bundle;assert.equal(agreement(b).status,'returned-late');assert.equal(h().memories.filter(m=>m.kind==='overdue').length,1);
 const input=dto(b,'PlayerDialogue',dialogue('为什么还记着这件事'));
 const incremental=deriveCampaignBundle(b,input),full=executeAuditedCampaignIntent(b,input);assert.deepEqual(full,incremental);
 validateBundle(full.bundle,options);
});

test('stale offer, duplicate acceptance, expiry, changed tool condition and unaffordable repair claims do not grant a loan',()=>{
 let b=start();b=run(b,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:40,loanTicks:36}}).bundle;const old=agreement(b).id;
 b=run(b,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:40,loanTicks:72}}).bundle;assert.equal(act(b,'accept',old).receipt.outcome,'rejected');
 b=act(b,'accept').bundle;assert.equal(act(b,'accept').receipt.outcome,'rejected');assert.equal(act(b,'decline').receipt.outcome,'rejected');
 assert.equal(run(b,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:20,loanTicks:36}}).receipt.outcome,'rejected');
 b=run(b,'AdvanceTime',{ticks:agreement(b).expiresTick-b.snapshot.tick+1}).bundle;assert.equal(agreement(b).status,'expired');assert.equal(asset(b).holderId,hunter);
 b=ready();b=social(b,'smash').bundle;assert.equal(agreement(b).status,'accepted');assert.equal(act(b,'claim').receipt.outcome,'rejected');
 const forged=structuredClone(b);forged.snapshot.world.mapModel.negotiationModel.agreement.repairProgress=0;assert.throws(()=>validateBundle(forged,options));
});

test('dialogue is attributed speech, proposals never execute, private context excludes other actors and fabricated references are refused',()=>{
 let b=start();const before=structuredClone(asset(b)),proposal={type:'PlayerInteract',payload:{targetId:hunter,action:'smash'}};
 b=run(b,'PlayerDialogue',dialogue('他说他偷过你的工具',proposal)).bundle;
 assert.deepEqual(asset(b),before);assert.equal(b.snapshot.world.mapModel.socialModel.actors[1].memories.length,0);
 assert.equal(b.snapshot.world.mapModel.negotiationModel.turns[0].utterance,'他说他偷过你的工具');
 const context=npcDialogueContext(b);assert.equal(context.targetId,hunter);assert.equal(context.observations.length,0);assert.equal(context.self.knownHolder,hunter);
 assert.equal(Object.hasOwn(context,'world'),false);assert.equal(Object.hasOwn(context,'actors'),false);
 const bad=run(b,'PlayerDialogue',{...dialogue('你知道什么'),memoryRefs:[999]});assert.equal(bad.receipt.outcome,'rejected');
 assert.equal(mapView(b,128).negotiation.lastTurn.reply,'先按约定实际修理，再来领取工具。');
 const hacked=structuredClone(b);hacked.snapshot.world.mapModel.negotiationModel.turns[0].reply='我已经把工具给你了';assert.throws(()=>validateBundle(hacked,options));
});

test('legacy social fixture refuses new commands and its original repair/loan behavior remains available',()=>{
 let b=start(createSocialCampaignVillage);assert.equal(b.snapshot.fixtureVersion,'3');assert.equal(mapView(b,128).mapViewVersion,2);
 assert.throws(()=>run(b,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:20,loanTicks:36}}),/new negotiation world/);
 b=social(b,'help').bundle;b=social(b,'help').bundle;b=social(b,'ask-help').bundle;assert.equal(asset(b).holderId,'actor-4');assert.equal(asset(b).loanDueTick,b.snapshot.tick+144);
 assert.equal(npcDialogueContext(b),null);assert.equal(Object.hasOwn(mapView(b,128),'negotiation'),false);
});


test('agreement knowledge waits for discovery of unseen theft; unavailable and dying parties cannot complete a deal',()=>{
 const move=(b,point)=>{b=run(b,'MarchSet',point).bundle;let steps=0;while(b.snapshot.world.mapModel.order.status!=='arrived'){assert.ok(steps++<20);b=run(b,b.snapshot.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep',{}).bundle;}return b;};
 let b=run(start(),'AdvanceTime',{ticks:98}).bundle;
 b=run(b,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:40,loanTicks:72}}).bundle;b=act(b,'accept').bundle;
 b=social(b,'help').bundle;b=social(b,'help').bundle;assert.equal(agreement(b).status,'ready');
 b=run(b,'AdvanceTime',{ticks:112-b.snapshot.tick}).bundle;b=move(b,{x:5,y:8});
 const h=()=>b.snapshot.world.mapModel.socialModel.actors[1],before=structuredClone(h().memories),priorReply=b.snapshot.world.mapModel.socialModel.lastReply;
 const stolen=social(b,'steal');b=stolen.bundle;assert.equal(stolen.receipt.result.effect,'taken');assert.equal(stolen.receipt.result.speech,'');
 assert.deepEqual(h().memories,before);assert.deepEqual(b.snapshot.world.mapModel.socialModel.lastReply,priorReply);assert.equal(agreement(b).status,'ready');
 assert.equal(npcDialogueContext(b).self.knownHolder,hunter);assert.equal(npcDialogueContext(b).agreement.status,'ready');
 assert.equal(act(b,'claim').receipt.outcome,'rejected');
 b=run(b,'AdvanceTime',{ticks:156-b.snapshot.tick}).bundle;assert.equal(agreement(b).status,'invalidated');
 const discovery=h().memories.find(m=>m.kind==='agreement'&&m.text.includes('失踪'));assert.ok(discovery);assert.equal(discovery.actorId,null);assert.equal(npcDialogueContext(b).self.knownHolder,'unknown');
 validateBundle(b,options);
 const far=move(start(),{x:3,y:6});assert.equal(run(far,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:40,loanTicks:72}}).receipt.outcome,'rejected');
 let dying=createAuditedBundle(createNegotiationCampaignVillage(42,'dying-deal',defaultCampaignVillageConfig('no-food')).bundle,options);
 dying=run(dying,'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:40,loanTicks:36}}).bundle;dying=act(dying,'accept').bundle;
 dying=run(dying,'AdvanceTime',{ticks:144-dying.snapshot.tick}).bundle;assert.equal(act(dying,'claim').receipt.outcome,'rejected');
 // The observer runs before settlement: midnight death blocks interaction at once;
 // its agreement closure is recorded on the following elapsed tick.
 dying=run(dying,'AdvanceTime',{ticks:1}).bundle;assert.equal(agreement(dying).status,'invalidated');
 let declined=run(start(),'PlayerNegotiate',{targetId:hunter,terms:{repairAmount:40,loanTicks:36}}).bundle;declined=act(declined,'decline').bundle;
 assert.equal(agreement(declined).status,'cancelled');assert.equal(act(declined,'accept').receipt.outcome,'rejected');
});
