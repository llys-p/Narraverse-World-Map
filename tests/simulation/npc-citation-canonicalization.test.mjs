import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const context={simulationId:'canonical-citations',revision:2,tick:2,targetId:'actor-2',canTalk:true,self:{knownHolder:'actor-2',knownCondition:60},agreement:null,conversation:[],observations:[{eventSeq:2,importance:2,text:'玩家给了我粮食。'},{eventSeq:5,importance:2,text:'玩家又给了我粮食。'}]};
const request={apiVersion:1,requestId:'cite',simulationId:context.simulationId,expectedRevision:2,targetId:'actor-2',text:'我刚给了你两份粮，现在还要去买吗？'};
const config={enabled:true,baseURL:'http://127.0.0.1:19999',model:'controlled-citation-test',apiKey:''};
function provider(refs){let calls=0;return {get calls(){return calls;},p:createNpcLanguageProvider(config,{fetchImpl:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'我记得你给我的粮食。',memoryRefs:refs,proposal:null})}}]});}})};}
test('reversed and repeated known citations become the same signed set without changing speech, context or making retries',async()=>{
 for(const refs of [[5,2],[5,2,5]]){
  const instance=provider(refs),p=instance.p,before=JSON.stringify(context);try{
   const draft=await p.compose(request,context);assert.deepEqual(draft.payload.memoryRefs,[2,5]);assert.equal(draft.payload.reply,'我记得你给我的粮食。');assert.equal(draft.payload.proposal,null);assert.equal(JSON.stringify(context),before);
   assert.equal(p.verify(context.simulationId,{type:'PlayerDialogue',expectedRevision:2,payload:draft.payload}),true);assert.deepEqual(await p.compose(request,context),draft);assert.equal(instance.calls,1);
   assert.equal(p.getMetrics(request.requestId).status,'succeeded');assert.equal(p.getMetrics(request.requestId).memoryRefsIssue,'not-strictly-increasing');assert.equal(p.getMetrics(request.requestId).failure,null);
  }finally{p.close();}
 }
});
test('unknown, malformed and excessive citation input is still rejected and never silently dropped',async()=>{
 for(const refs of [[99,2],[2,99],[2,2,2,2],['5',2],[-1,2],[0,2],{eventSeq:2}]){
  const {p}=provider(refs);try{await assert.rejects(p.compose(request,context),e=>e.code==='MODEL_OUTPUT_INVALID');}finally{p.close();}
 }
});
