import test from 'node:test';import assert from 'node:assert/strict';import {providerContext,createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const context={simulationId:'reference-test',revision:3,tick:6,targetId:'actor-2',canTalk:true,self:{knownHolder:'actor-2',knownCondition:60},agreement:null,observations:[{eventSeq:1,tick:1,kind:'gift',actorId:'actor-4',channel:'self',importance:1,text:'收到一份粮'}],conversation:[{eventSeq:3,tick:3,utterance:'早上好',reply:'你好',memoryRefs:[]}]};
const request={apiVersion:1,requestId:'reference-case',simulationId:context.simulationId,expectedRevision:3,targetId:'actor-2',text:'你记得我给你的粮吗？'};
const response=memoryRefs=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'我记得收到过你的粮。',memoryRefs,proposal:null})}}]});
test('reference menu is rebuilt only from transmitted episodes and speech, is idempotent, and prompts keep the current topic',async()=>{
 const raw={...structuredClone(context),referenceOptions:{observationEventSeqs:[999],conversationEventSeqs:[888]},lifeHistory:[{tick:6}]},c=providerContext(raw,request.text);assert.deepEqual(c.referenceOptions.observationEventSeqs,[1]);assert.deepEqual(c.referenceOptions.conversationEventSeqs,[3]);assert.deepEqual(providerContext(c,request.text),c);
 let calls=0;const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19000',model:'controlled-reference',apiKey:''},{fetchImpl:async(_url,o)=>{
  calls++;const body=JSON.parse(o.body),sent=JSON.parse(body.messages[1].content);assert.deepEqual(sent.npc.referenceOptions,c.referenceOptions);assert.match(body.messages[0].content,/不追加“还是想谈修理”/);assert.match(body.messages[0].content,/JSON数字数组/);return response([1,3]);
 }});try{const before=JSON.stringify(raw),draft=await p.compose(request,raw);assert.deepEqual(draft.payload.memoryRefs,[1,3]);assert.equal(calls,1);assert.equal(JSON.stringify(raw),before);assert.equal(p.getMetrics(request.requestId).memoryRefsIssue,null);}finally{p.close();}
});
test('malformed references stay rejected without sorting or retries and diagnostics retain only bounded shape categories',async()=>{
 for(const [refs,issue,reason] of [[{},'not-array','memory-refs-field'],['1','not-array','memory-refs-field'],[['1'],'not-positive-integer','memory-refs-field'],[[0],'not-positive-integer','memory-refs-field'],[[1.5],'not-positive-integer','memory-refs-field'],[[1,3,4,5],'too-many','memory-refs-field'],[[3,1],'not-strictly-increasing','memory-refs-field'],[[1,1],'not-strictly-increasing','memory-refs-field'],[[6],null,'unknown-reference'],[[999],null,'unknown-reference']]){
  let calls=0;const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19000',model:'controlled-reference',apiKey:''},{fetchImpl:async()=>{calls++;return response(refs);}});
  try{for(let i=0;i<2;i++)await assert.rejects(p.compose(request,context),{code:'MODEL_OUTPUT_INVALID'});assert.equal(calls,1);const m=p.getMetrics(request.requestId);assert.equal(m.memoryRefsIssue,issue);assert.equal(m.failure.reason,reason);assert.equal(Object.hasOwn(m,'rawReply'),false);}finally{p.close();}
 }
});
