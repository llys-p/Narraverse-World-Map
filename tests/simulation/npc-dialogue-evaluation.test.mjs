import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {validateDialogueSuite,selectDialogueCases,runDialogueEvaluation,renderDialogueReport} from '../../runtime/evaluation/npc-dialogue-eval.mjs';
import {evaluateDialogueCli,parseEvaluationArgs} from '../../scripts/evaluate-npc-dialogue.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-dialogue-v1/cases.json',import.meta.url),'utf8'));
const config={enabled:true,baseURL:'http://127.0.0.1:19998/v1',model:'controlled-eval-fixture',apiKey:'unit-only-secret'};
const env={NPC_LLM_ENABLED:'true',NPC_LLM_BASE_URL:config.baseURL,NPC_LLM_MODEL:config.model,NPC_LLM_API_KEY:config.apiKey};
const json=value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}});
const answer=(content)=>{
 const c=suite.cases.find(c=>c.turns.some(t=>t.text===content.playerUtterance)),t=c.turns.find(t=>t.text===content.playerUtterance),ctx=content.npc;
 let proposal=null,reply='这是受控测试回复，实际经历仍以世界记录为准。';
 if(c.id==='bargain'&&t.id==='offer')proposal={type:'PlayerNegotiate',payload:{targetId:'actor-2',terms:{repairAmount:40,loanTicks:72}}};
 if(c.id==='help-memory'&&t.id==='help')proposal={type:'PlayerInteract',payload:{targetId:'actor-2',action:'help'}};
 const wanted={counter:'agreement',remember:'help',forgive:'smash',deny:'smash',who:'missing',returned:'overdue',promise:'overdue'}[t.id];
 const ref=ctx.observations.find(m=>m.kind===wanted);
 return {reply,memoryRefs:ref?[ref.eventSeq]:[],proposal};
};
async function temp(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'npc5-eval-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}

test('suite identities, action grammar, count and CLI live-call gates reject malformed or implicit inputs',()=>{
 assert.equal(validateDialogueSuite(suite),16);assert.equal(selectDialogueCases(suite,['unsupported']).length,1);
 for(const change of [s=>s.cases.push(s.cases[0]),s=>s.cases[0].turns.push(s.cases[0].turns[0]),s=>s.cases[0].setup.push({type:'PlayerBuy',payload:{}}),s=>s.cases[0].turns[0].expect.proposalKeys=['invent-gold']]){
  const bad=structuredClone(suite);change(bad);assert.throws(()=>validateDialogueSuite(bad));
 }
 assert.throws(()=>selectDialogueCases(suite,['unknown']));assert.throws(()=>selectDialogueCases(suite,['bargain','bargain']));
 assert.equal(parseEvaluationArgs([]).mode,'plan');
 for(const args of [['--mode','live'],['--mode','live','--allow-model-calls','--max-requests','16'],['--mode','plan','--allow-model-calls'],['--max-requests','0'],['--mode','controlled-test'],['--case','all','--case','bargain']])assert.throws(()=>parseEvaluationArgs(args));
});

test('default plan reconstructs all real scenarios without any provider call or semantic pass claim',async t=>{
 const out=path.join(await temp(t),'plan.json');let calls=0;
 const result=await evaluateDialogueCli(['--out',out],{env,fetchImpl:()=>{calls++;throw Error('plan must not fetch');},log(){}});
 assert.equal(result.exitCode,0);assert.equal(calls,0);assert.equal(result.report.realProviderAttempted,false);
 assert.deepEqual(result.report.counts,{planned:16,attempted:0,automaticPassed:0,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:16});
 assert.equal(result.report.semanticVerdict,'not-evaluated');assert.ok(result.report.cases.every(c=>c.worldReplayAudit==='passed'));
 const unknown=result.report.cases.find(c=>c.id==='unknown-thief').turns[0].context;
 assert.equal(unknown.self.knownHolder,'unknown');assert.ok(unknown.observations.some(m=>m.kind==='missing'&&m.actorId===null));assert.equal(unknown.observations.some(m=>m.kind==='steal'),false);
 const falseClaim=result.report.cases[0].turns[2];assert.equal(falseClaim.context.agreement.repairProgress,0);assert.equal(falseClaim.context.self.knownCondition,60);
 const saved=JSON.parse(await fs.readFile(out,'utf8'));assert.equal(saved.semanticVerdict,'not-evaluated');assert.match(await fs.readFile(result.html,'utf8'),/未调用模型/);
});

test('controlled multi-turn run uses real prior speech and scripted effects, withholds rubric/labels, and leaves semantics pending even when automatic checks pass',async()=>{
 const calls=[];
 const provider=createNpcLanguageProvider(config,{maxCalls:16,fetchImpl:async(_url,o)=>{
  const body=JSON.parse(o.body),content=JSON.parse(body.messages[1].content);calls.push(content);
  assert.equal(JSON.stringify(body).includes('humanReview'),false);assert.equal(JSON.stringify(body).includes('proposalKeys'),false);
  assert.ok(suite.cases.every(c=>!content.npc.simulationId.includes(c.id)&&!content.npc.agreement?.id?.includes(c.id)));
  assert.deepEqual(Object.keys(content).sort(),['npc','playerUtterance']);assert.equal(Object.hasOwn(content.npc,'actors'),false);
  return json(answer(content));
 }});
 try{
  const report=await runDialogueEvaluation({suite,mode:'controlled-test',provider,maxRequests:16});
  assert.equal(calls.length,16);assert.equal(report.counts.automaticPassed,16);assert.equal(report.counts.automaticFailed,0);assert.equal(report.counts.fixtureFailed,0);
  assert.equal(report.semanticVerdict,'needs-human-review');assert.equal(report.realProviderAttempted,false);assert.ok(report.cases.every(c=>c.worldReplayAudit==='passed'));
  assert.equal(calls[1].npc.conversation.length,1);assert.equal(calls[1].npc.conversation[0].utterance,suite.cases[0].turns[0].text);
  assert.equal(calls[1].npc.conversation[0].reply,'这是受控测试回复，实际经历仍以世界记录为准。');assert.deepEqual(calls[1].npc.agreement.terms,{repairAmount:40,loanTicks:72});
  assert.equal(calls[2].npc.agreement.repairProgress,0);assert.equal(calls[2].npc.self.knownCondition,60);
  for(const row of report.cases.flatMap(c=>c.turns)){assert.equal(row.humanReview.verdict,'pending');assert.deepEqual(row.metrics.usage,{inputTokens:100,outputTokens:20,totalTokens:120});assert.ok(row.metrics.durationMs>=0);}
  const pathBase=path.join(root,'artifacts/npc5-dialogue-eval');await fs.mkdir(pathBase,{recursive:true});
  // Explicitly labelled controlled fixture for report review, never a model benchmark.
  await fs.writeFile(path.join(pathBase,'controlled-report.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(pathBase,'controlled-report.html'),renderDialogueReport(report));
 }finally{provider.close();}
});

test('wrong harmful proposals and missing factual citations fail automatic checks without executing the proposed harm',async()=>{
 const p=createNpcLanguageProvider(config,{fetchImpl:async()=>json({reply:'受控负例',memoryRefs:[],proposal:{type:'PlayerInteract',payload:{targetId:'actor-2',action:'smash'}}})});
 try{
  const r=await runDialogueEvaluation({suite,selection:['negation-report','harm-memory'],mode:'controlled-test',provider:p,maxRequests:4});
  assert.equal(r.counts.automaticFailed,4);assert.equal(r.counts.automaticPassed,0);assert.equal(r.counts.providerFailed,0);
  assert.ok(r.cases.flatMap(c=>c.turns).every(t=>t.checks.find(x=>x.name==='speechDidNotExecuteAction').passed));
  assert.ok(r.cases.find(c=>c.id==='harm-memory').turns.every(t=>!t.checks.find(x=>x.name==='requiredMemorySource').passed));
  assert.equal(r.semanticVerdict,'needs-human-review');
 }finally{p.close();}
});

test('one invalid provider response blocks later turns of that conversation without retrying or hiding skipped coverage',async()=>{
 let calls=0;const p=createNpcLanguageProvider(config,{fetchImpl:async()=>++calls===1?Response.json({choices:[{finish_reason:'stop',message:{content:'not json'}}]}):json({reply:'受控回复',memoryRefs:[],proposal:null})});
 try{
  const r=await runDialogueEvaluation({suite,selection:['negation-report','unsupported'],mode:'controlled-test',provider:p,maxRequests:3});
  assert.equal(calls,2);assert.deepEqual(r.counts,{planned:3,attempted:2,automaticPassed:1,automaticFailed:0,providerFailed:1,fixtureFailed:0,blocked:1,notRun:0});
  assert.equal(r.cases[0].turns[0].errorCode,'MODEL_OUTPUT_INVALID');assert.equal(r.cases[0].turns[1].status,'blocked');
 }finally{p.close();}
});

test('configuration, authorization, budget and existing output failures happen before any request and preserve existing files',async t=>{
 const dir=await temp(t),out=path.join(dir,'report.json'),base=['--mode','live','--case','unsupported','--allow-model-calls','--max-requests','1','--out',out];let calls=0;
 const deps={env,fetchImpl:()=>{calls++;throw Error('must not fetch');},log(){}};
 await assert.rejects(evaluateDialogueCli(base.filter(x=>x!=='--allow-model-calls'),deps),{code:'MODEL_CALLS_NOT_AUTHORIZED'});
 await assert.rejects(evaluateDialogueCli([...base.slice(0,3),'all',...base.slice(4)],deps),{code:'MODEL_BUDGET'});
 await assert.rejects(evaluateDialogueCli(base,{...deps,env:{}}),{code:'MODEL_CONFIGURATION_REQUIRED'});
 await assert.rejects(evaluateDialogueCli(base,{...deps,env:{...env,NPC_LLM_BASE_URL:'http://example.com/private-secret'}}),e=>e.code==='MODEL_CONFIGURATION_INVALID'&&!e.message.includes('private-secret'));
 assert.deepEqual(await fs.readdir(dir),[]);
 await fs.writeFile(out,'preserve-json');await assert.rejects(evaluateDialogueCli(base,deps),{code:'OUTPUT_EXISTS'});assert.equal(await fs.readFile(out,'utf8'),'preserve-json');
 await fs.unlink(out);await fs.writeFile(out.replace('.json','.html'),'preserve-html');await assert.rejects(evaluateDialogueCli(base,deps),{code:'OUTPUT_EXISTS'});
 assert.equal(await fs.readFile(out.replace('.json','.html'),'utf8'),'preserve-html');await assert.rejects(fs.access(out));assert.equal(calls,0);
});

test('real loopback HTTP exercises the opt-in CLI path and produces escaped reports with unknown usage, no key or automatic semantic approval',async t=>{
 const out=path.join(await temp(t),'local-http.json');let calls=0;
 const server=http.createServer(async(req,res)=>{for await(const chunk of req){}calls++;res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控输出 <img src=x onerror=alert(1)> '+config.apiKey,memoryRefs:[],proposal:null})}}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const result=await evaluateDialogueCli(['--mode','live','--case','unsupported','--allow-model-calls','--max-requests','1','--out',out],
  {env:{...env,NPC_LLM_BASE_URL:`http://127.0.0.1:${server.address().port}`},log(){}});
 assert.equal(calls,1);assert.equal(result.exitCode,0);assert.equal(result.report.semanticVerdict,'needs-human-review');assert.equal(result.report.cases[0].turns[0].metrics.usage,null);
 const html=await fs.readFile(result.html,'utf8'),data=await fs.readFile(out,'utf8');assert.match(html,/&lt;img/);assert.equal(html.includes('<img'),false);assert.match(html,/default-src 'none'/);
 assert.equal(html.includes(config.apiKey),false);assert.equal(data.includes(config.apiKey),false);assert.equal(data.includes('Authorization'),false);
});

test('provider diagnostic snapshots are detached, cached once, and distinguish missing or invalid usage from zero usage',async()=>{
 for(const usage of [undefined,{prompt_tokens:0,completion_tokens:0,total_tokens:0},{prompt_tokens:5,completion_tokens:3,total_tokens:999}]){
  let calls=0;const p=createNpcLanguageProvider(config,{fetchImpl:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:'{"reply":"测试","memoryRefs":[],"proposal":null}'}}],...(usage?{usage}:{})});}});
  const context={canTalk:true,simulationId:'metrics',revision:0,tick:0,observations:[],conversation:[]},request={apiVersion:1,requestId:'metrics',simulationId:'metrics',expectedRevision:0,targetId:'actor-2',text:'测试'};
  try{
   assert.equal(p.getMetrics('missing'),null);await p.compose(request,context);const m=p.getMetrics('metrics');
   assert.equal(m.status,'succeeded');assert.equal(m.usage===null,usage?.total_tokens!==0);m.status='mutated';await p.compose(request,context);
   assert.equal(calls,1);assert.equal(p.getMetrics('metrics').status,'succeeded');
  }finally{p.close();}
 }
});
