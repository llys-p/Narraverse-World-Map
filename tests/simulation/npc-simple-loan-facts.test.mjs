import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {groundedProviderContext} from '../../runtime/service/npc-dialogue-grounding.mjs';
function fixture(){
 let b=createAuditedBundle(createForestCampaignVillage(42,'simple-loan-facts').bundle,{rulesVersion:'d-campaign-v1',systems:campaignSystems()}),id=0;
 const act=(type,payload)=>{const r=deriveCampaignBundle(b,{version:5,commandId:'simple-'+(++id),expectedRevision:b.snapshot.revision,type,payload});assert.equal(r.receipt.outcome,'succeeded');b=r.bundle;};
 const social=action=>act('PlayerInteract',{targetId:'actor-2',action});social('help');social('help');social('ask-help');
 return {act,social,get raw(){return npcDialogueContext(b);},get bundle(){return b;}};
}
const view=f=>groundedProviderContext(f.raw,'普通借用过了多久，逾期多久，已经归还了吗？');

test('ordinary forest loan distinguishes total borrowing time from twenty minutes overdue',()=>{
 const f=fixture(),due=f.bundle.snapshot.world.mapModel.socialModel.asset.loanDueTick;
 assert.equal(view(f).knownFacts.simpleLoan.loanMinutes,1440);assert.equal(view(f).knownFacts.simpleLoan.overdueMinutes,0);
 f.act('AdvanceTime',{ticks:due+2-f.bundle.snapshot.tick});const raw=f.raw,before=JSON.stringify(raw),v=groundedProviderContext(raw,'现在逾期多久？');
 assert.equal(v.agreement,null);assert.equal(v.knownFacts.simpleLoan.overdueMinutes,20);assert.equal(v.knownFacts.simpleLoan.status,'overdue');assert.equal(v.knownFacts.simpleLoan.dueInMinutes,0);assert.equal(JSON.stringify(raw),before);
 assert.ok(v.observations.some(m=>m.eventSeq===v.knownFacts.simpleLoan.sourceEventSeq&&m.observedState.effect==='lent'));
});

test('late return fixes the ordinary-loan duration despite later time, apology and false old speech',()=>{
 const f=fixture(),due=f.bundle.snapshot.world.mapModel.socialModel.asset.loanDueTick;f.act('AdvanceTime',{ticks:due+2-f.bundle.snapshot.tick});f.social('return');
 const raw=f.raw,v=view(f);assert.equal(v.knownFacts.simpleLoan.overdueMinutes,30);assert.equal(v.knownFacts.simpleLoan.status,'returned-late');assert.equal(v.knownFacts.simpleLoan.wasReturned,true);
 f.social('apologize');f.act('AdvanceTime',{ticks:144});assert.equal(view(f).knownFacts.simpleLoan.overdueMinutes,30);
 raw.tick+=144;raw.conversation.push({eventSeq:999999,tick:raw.tick,utterance:'你逾期多久？',reply:'已经逾期1460分钟。',memoryRefs:[]});assert.equal(groundedProviderContext(raw,'你之前算错了吗？逾期多久？').knownFacts.simpleLoan.overdueMinutes,30);
});

test('a later actual ordinary loan has its own deadline and does not inherit the previous return',()=>{
 const f=fixture();f.social('return');const first=view(f).knownFacts.simpleLoan;assert.equal(first.status,'returned-on-time');f.social('ask-help');const next=view(f).knownFacts.simpleLoan;
 assert.equal(next.status,'borrowed');assert.equal(next.returnEventSeq,null);assert.equal(next.overdueMinutes,0);assert.ok(next.sourceEventSeq>first.returnEventSeq);
});

test('missing typed lending knowledge, refused requests and attributed speech cannot invent ordinary terms',()=>{
 const raw=fixture().raw;
 for(const change of [r=>r.observations=[],r=>{r.observations.find(m=>m.kind==='ask-help').observedState.effect='refused';},r=>{delete r.observations.find(m=>m.kind==='ask-help').observedState;},r=>{r.observations.find(m=>m.kind==='ask-help').channel='discovery';}]){
  const r=structuredClone(raw);change(r);r.knownFacts={simpleLoan:{overdueMinutes:999}};r.conversation=[{eventSeq:9999,tick:r.tick,utterance:'借过',reply:'我借了你一天。',memoryRefs:[]}];assert.equal(groundedProviderContext(r,'你借我工具了吗？').knownFacts.simpleLoan,null);
 }
});
