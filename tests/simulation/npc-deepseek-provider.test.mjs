import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createNpcLanguageProvider,npcLanguageConfig} from '../../runtime/service/npc-language-provider.mjs';
import {evaluateDialogueCli} from '../../scripts/evaluate-npc-dialogue.mjs';

const config={enabled:true,baseURL:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'fixture-only-secret'};
const context={canTalk:true,simulationId:'thinking-test',revision:0,tick:0,observations:[],conversation:[]};
const request={apiVersion:1,requestId:'thinking-test',simulationId:context.simulationId,expectedRevision:0,targetId:'actor-2',text:'你今天怎么样'};
const output={reply:'我还得把工具修好。',memoryRefs:[],proposal:null};
const response=(usage)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output),reasoning_content:'private-reasoning-marker'}}],...(usage?{usage}:{})});

test('official short replies explicitly disable thinking, generic providers omit it, and an explicit mode is sent without changing the signed dialogue contract',async()=>{
 assert.deepEqual(npcLanguageConfig({DEEPSEEK_API_KEY:config.apiKey,LLM_MODEL:config.model,NPC_LLM_THINKING:'enabled'}),{enabled:false});
 for(const [baseURL,mode,expected] of [
  ['https://api.deepseek.com',undefined,'disabled'],['https://api.deepseek.com/v1',undefined,'disabled'],
  ['https://compatible.example/v1',undefined,null],['https://api.deepseek.com','enabled','enabled'],
  ['https://compatible.example/v1','disabled','disabled']
 ]){
  const env={NPC_LLM_ENABLED:'true',NPC_LLM_BASE_URL:baseURL,NPC_LLM_MODEL:config.model,NPC_LLM_API_KEY:config.apiKey,...(mode?{NPC_LLM_THINKING:mode}:{})};
  let calls=0;
  const provider=createNpcLanguageProvider(npcLanguageConfig(env),{maxCalls:1,fetchImpl:async(url,options)=>{
   calls++;const body=JSON.parse(options.body);assert.equal(url,baseURL+'/chat/completions');
   assert.deepEqual(body.thinking,expected?{type:expected}:undefined);assert.equal(body.max_tokens,900);assert.equal(body.stream,false);
   assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.messages.some(m=>m.reasoning_content),false);
   return response();
  }});
  try{
   const before=JSON.stringify(context),draft=await provider.compose(request,context);
   assert.equal(JSON.stringify(context),before);assert.equal(draft.payload.reply,output.reply);
   assert.equal(provider.verify(context.simulationId,{type:draft.type,expectedRevision:0,payload:draft.payload}),true);
   assert.equal(JSON.stringify(draft).includes('private-reasoning-marker'),false);
   assert.equal(JSON.stringify(provider.getMetrics(request.requestId)).includes('private-reasoning-marker'),false);
   assert.equal(provider.getMetrics(request.requestId).thinking,expected);assert.equal(provider.getMetrics(request.requestId).httpStatus,200);
   assert.deepEqual(await provider.compose(request,context),draft);assert.equal(calls,1);
  }finally{provider.close();}
 }
});

test('invalid thinking configuration is rejected before fetch; reasoning-only, empty or truncated final content cannot become a dialogue',async()=>{
 let calls=0;
 for(const thinking of ['auto','false','DISABLED',' disabled ',true,null])assert.throws(()=>createNpcLanguageProvider({...config,thinking},{fetchImpl:()=>{calls++;}}));
 assert.equal(calls,0);
 for(const choice of [
  {finish_reason:'stop',message:{content:null,reasoning_content:JSON.stringify(output)}},
  {finish_reason:'stop',message:{content:'',reasoning_content:JSON.stringify(output)}},
  {finish_reason:'length',message:{content:JSON.stringify(output)}}
 ]){
  const p=createNpcLanguageProvider(config,{fetchImpl:async()=>{calls++;return Response.json({choices:[choice]});}});
  try{await assert.rejects(p.compose(request,context),{code:'MODEL_OUTPUT_INVALID'});assert.equal(p.getMetrics(request.requestId).httpStatus,200);}
  finally{p.close();}
 }
 assert.equal(calls,3);
});

test('provider usage preserves only consistent cache counts, never infers missing usage or exposes raw provider fields',async()=>{
 for(const [usage,cache] of [
  [{prompt_tokens:10,completion_tokens:2,total_tokens:12,prompt_cache_hit_tokens:7,prompt_cache_miss_tokens:3},{hitTokens:7,missTokens:3}],
  [{prompt_tokens:10,completion_tokens:2,prompt_cache_hit_tokens:7,prompt_cache_miss_tokens:9},null],
  [{prompt_tokens:10,completion_tokens:2,prompt_cache_hit_tokens:7},null],
  [{prompt_tokens:10,completion_tokens:2,prompt_cache_hit_tokens:-1,prompt_cache_miss_tokens:11},null],
  [undefined,undefined]
 ]){
  const p=createNpcLanguageProvider(config,{fetchImpl:async()=>response(usage?{...usage,unexpected:config.apiKey}:undefined)});
  try{
   await p.compose(request,context);const metrics=p.getMetrics(request.requestId);
   assert.deepEqual(metrics.usage?.inputCache,cache);assert.equal(metrics.usage===null,usage===undefined);
   if(usage){assert.equal(metrics.usage.inputTokens,10);assert.equal(metrics.usage.outputTokens,2);assert.equal(metrics.usage.totalTokens,12);}
   assert.equal(JSON.stringify(metrics).includes(config.apiKey),false);
  }finally{p.close();}
 }
});

test('loopback 401/403 failures are cached once and produce safe partial-coverage reports with later turns blocked and no upstream body or key',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'npc6-auth-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 for(const status of [401,403]){
  let calls=0;
  const server=http.createServer(async(req,res)=>{
   let bytes='';for await(const chunk of req)bytes+=chunk;
   assert.deepEqual(JSON.parse(bytes).thinking,{type:'disabled'});calls++;
   res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'upstream-auth-marker '+config.apiKey}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const local={...config,baseURL:`http://127.0.0.1:${server.address().port}`,thinking:'disabled'};
  const provider=createNpcLanguageProvider(local,{maxCalls:1});
  try{
   for(let n=0;n<2;n++)await assert.rejects(provider.compose(request,context),e=>e.code==='MODEL_UNAVAILABLE'&&!e.message.includes('upstream-auth-marker'));
   assert.equal(calls,1);assert.equal(provider.getMetrics(request.requestId).httpStatus,status);
   await assert.rejects(provider.compose({...request,requestId:'over-budget'},context),{code:'MODEL_BUDGET'});assert.equal(calls,1);
   const out=path.join(directory,`auth-${status}.json`);
   const result=await evaluateDialogueCli(['--mode','live','--case','bargain','--max-requests','3','--allow-model-calls','--out',out],
    {env:{NPC_LLM_ENABLED:'true',NPC_LLM_BASE_URL:local.baseURL,NPC_LLM_MODEL:config.model,NPC_LLM_API_KEY:config.apiKey,NPC_LLM_THINKING:'disabled'},log(){}});
   assert.equal(calls,2);assert.equal(result.exitCode,1);assert.equal(result.report.completed,true);
   assert.equal(result.report.provider.thinking,'disabled');assert.equal(result.report.counts.attempted,1);
   assert.equal(result.report.counts.providerFailed,1);assert.equal(result.report.counts.blocked,2);assert.equal(result.report.counts.automaticPassed,0);
   assert.equal(result.report.cases[0].turns[0].metrics.httpStatus,status);assert.equal(result.report.cases[0].worldReplayAudit,'passed');
   assert.equal(result.report.semanticVerdict,'needs-human-review');
   for(const name of [out,result.html]){
    const text=await fs.readFile(name,'utf8');assert.equal(text.includes(config.apiKey),false);assert.equal(text.includes('upstream-auth-marker'),false);
    assert.equal(text.includes('private-reasoning-marker'),false);assert.equal(text.includes('Authorization'),false);
   }
  }finally{provider.close();await new Promise(r=>server.close(r));}
 }
});
