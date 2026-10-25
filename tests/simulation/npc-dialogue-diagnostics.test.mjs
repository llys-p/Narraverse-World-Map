import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const context={simulationId:'diagnostic-world',revision:0,tick:0,targetId:'actor-2',canTalk:true,self:{knownHolder:'actor-2',knownCondition:60},observations:[],conversation:[],agreement:null};
const req={apiVersion:1,requestId:'diagnostic',simulationId:context.simulationId,expectedRevision:0,targetId:'actor-2',text:'今天天气如何？'};
const good={reply:'我先看看天色。',memoryRefs:[],proposal:null};
const envelope=(content=JSON.stringify(good),finish_reason='stop')=>({choices:[{finish_reason,message:{content}}]});
const secret='diagnostic-private-marker';

test('invalid outputs retain distinct safe categories, no raw content, and no automatic retries',async()=>{
 const cases=[
  ['http-error',()=>new Response(secret,{status:401})],
  ['response-too-large',()=>new Response('x'.repeat(65537))],
  ['envelope-json',()=>new Response(secret)],
  ['choice-missing',()=>Response.json({choices:[]})],
  ['finish-reason',()=>Response.json(envelope(secret,'length'))],
  ['content-type',()=>Response.json(envelope(null))],
  ['content-too-large',()=>Response.json(envelope('x'.repeat(8193)))],
  ['content-json',()=>Response.json(envelope('{"reply":"甲","reply":"'+secret+'"}'))],
  ['output-fields',()=>Response.json(envelope(JSON.stringify({...good,extra:secret})))],
  ['reply-field',()=>Response.json(envelope(JSON.stringify({...good,reply:'一\n二'})))],
  ['memory-refs-field',()=>Response.json(envelope(JSON.stringify({...good,memoryRefs:[2,1]})))],
  ['proposal-field',()=>Response.json(envelope(JSON.stringify({...good,proposal:{type:secret,payload:{}}})))],
  ['unknown-reference',()=>Response.json(envelope(JSON.stringify({...good,memoryRefs:[999]})))],
 ];
 for(const [reason,response] of cases){
  let calls=0;const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19981',model:'controlled-diagnostic',apiKey:secret},{fetchImpl:async()=>{calls++;return response();}});
  try{
   for(let i=0;i<2;i++)await assert.rejects(p.compose(req,context),e=>['MODEL_UNAVAILABLE','MODEL_OUTPUT_INVALID'].includes(e.code)&&!e.message.includes(secret));
   assert.equal(calls,1);const m=p.getMetrics(req.requestId);assert.equal(m.failure.reason,reason);assert.equal(JSON.stringify(m).includes(secret),false);
   assert.deepEqual(Object.keys(m.failure).sort(),['reason','stage']);assert.ok(JSON.stringify(m).length<600);
   m.failure.reason='changed';assert.equal(p.getMetrics(req.requestId).failure.reason,reason);
  }finally{p.close();}
 }
});

test('unknown finish values and transport errors never become diagnostic text; successful outputs have no failure',async()=>{
 for(const [make,reason] of [[()=>{throw Error(secret);},'network-error'],[()=>Response.json(envelope(secret,secret)),'finish-reason'],[()=>Response.json(envelope()),null]]){
  const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19981',model:'controlled-diagnostic',apiKey:secret},{fetchImpl:async()=>make()});
  try{
   if(reason)await assert.rejects(p.compose(req,context));else await p.compose(req,context);
   const m=p.getMetrics(req.requestId);assert.equal(m.failure?.reason??null,reason);assert.equal(JSON.stringify(m).includes(secret),false);
   if(reason==='finish-reason')assert.equal(m.finishReason,'other');
  }finally{p.close();}
 }
});
