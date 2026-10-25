import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {knownNegotiationOptions} from '../../runtime/core/npc-negotiation-terms.mjs';
import {providerContext,createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()};
const initial=()=>createAuditedBundle(createMemoryCampaignVillage(42,'npc9-options').bundle,options);
const trade='我替你修理工具，借我半天可以吗？';
const proposal=(repairAmount=40,loanTicks=72)=>({type:'PlayerNegotiate',payload:{targetId:'actor-2',terms:{repairAmount,loanTicks}}});

test('known options reflect condition and trust, never infer unknown holder or bypass an active agreement',()=>{
 const self=npcDialogueContext(initial()).self;
 assert.deepEqual(knownNegotiationOptions(self,null).options,[{repairAmount:40,loanTicks:36},{repairAmount:40,loanTicks:72}]);
 assert.deepEqual(knownNegotiationOptions({...self,knownCondition:80,trust:65},null).options,[36,72,144].map(loanTicks=>({repairAmount:20,loanTicks})));
 for(const change of [{knownHolder:'unknown'},{knownHolder:'actor-4'},{knownCondition:100},{fear:20},{grievance:20}])assert.equal(knownNegotiationOptions({...self,...change},null).status,'unavailable');
 assert.equal(knownNegotiationOptions({},null).status,'unknown');
 for(const status of ['accepted','ready','borrowed'])assert.equal(knownNegotiationOptions(self,{status}).status,'unavailable');
 const ctx=npcDialogueContext(initial());
 for(const text of ['我不会替你修理工具，借我半天可以吗？','“'+trade+'”','他说'+trade,'如果'+trade,trade+'然后抢走它','我昨天替你修理工具，借我半天可以吗？'])assert.notEqual(providerContext(ctx,text).intentHint.kind,'negotiate-repair-loan');
 assert.equal(providerContext(ctx,trade).intentHint.kind,'negotiate-repair-loan');
});

test('missing or impossible trade proposals and actions on terms questions fail without signing or world changes',async()=>{
 const bundle=initial(),raw=npcDialogueContext(bundle),before=JSON.stringify(bundle);
 const offered=deriveCampaignBundle(bundle,{version:5,commandId:'existing',expectedRevision:0,type:'PlayerNegotiate',payload:proposal().payload}).bundle;
 const cases=[
  [raw,trade,null,'explicit-intent-missing-proposal'],[raw,trade,proposal(20,36),'terms-outside-known-options'],[raw,trade,proposal(40,144),'terms-outside-known-options'],
  [{...raw,self:{}},'聊聊借用吧',proposal(),'terms-outside-known-options'],
  [npcDialogueContext(offered),'请再说一遍这份约定。',proposal(),'question-has-action'],
  [raw,'我现在要帮你修理这个工具。',null,'explicit-intent-missing-proposal']
 ];
 for(const [ctx,text,suggestion,reason] of cases){
  const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19980',model:'controlled-options',apiKey:''},{fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控错误建议',memoryRefs:[],proposal:suggestion})}}]})});
  try{await assert.rejects(p.compose({apiVersion:1,requestId:'bad',simulationId:ctx.simulationId,expectedRevision:ctx.revision,targetId:'actor-2',text},ctx),{code:'MODEL_OUTPUT_INVALID'});assert.equal(p.getMetrics('bad').failure.reason,reason);}
  finally{p.close();}
 }
 assert.equal(JSON.stringify(bundle),before);validateBundle(offered,options);
});

test('a supported model proposal remains a preview; only explicit action produces exactly the shared terms',async()=>{
 const bundle=initial(),ctx=npcDialogueContext(bundle),before=JSON.stringify(bundle);
 const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19980',model:'controlled-options',apiKey:''},{fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'修理40点，可以商量借用12小时。',memoryRefs:[],proposal:proposal()})}}]})});
 try{
  const draft=await p.compose({apiVersion:1,requestId:'valid',simulationId:ctx.simulationId,expectedRevision:ctx.revision,targetId:'actor-2',text:trade},ctx);
  assert.equal(JSON.stringify(bundle),before);assert.equal(p.verify(ctx.simulationId,{type:draft.type,expectedRevision:0,payload:draft.payload}),true);
  const speech=deriveCampaignBundle(bundle,{version:5,commandId:'speech',expectedRevision:0,type:draft.type,payload:draft.payload}).bundle;
  assert.equal(speech.snapshot.world.mapModel.negotiationModel.agreement,null);assert.equal(speech.snapshot.world.mapModel.memoryModel.actors[1].episodes.length,0);
  const result=deriveCampaignBundle(speech,{version:5,commandId:'explicit-action',expectedRevision:speech.snapshot.revision,...draft.payload.proposal});
  assert.equal(result.receipt.result.effect,'offered');assert.deepEqual(result.receipt.result.agreement.terms,draft.payload.proposal.payload.terms);validateBundle(result.bundle,options);
 }finally{p.close();}
});
