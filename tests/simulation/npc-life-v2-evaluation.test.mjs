import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {evaluateDialogueCli,parseEvaluationArgs} from '../../scripts/evaluate-npc-dialogue.mjs';
import {runDialogueEvaluation,validateDialogueSuite} from '../../runtime/evaluation/npc-dialogue-eval.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-life-v2/cases.json',import.meta.url),'utf8'));
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'npc15-life-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
const findTurn=text=>suite.cases.flatMap(c=>c.turns).find(t=>t.text===text);

test('life-v2 plan verifies sixteen real action states, rejects invalid own facts and makes zero model calls',async t=>{
 assert.equal(parseEvaluationArgs(['--suite','life-v2']).suite,'life-v2');assert.equal(validateDialogueSuite(suite),16);
 for(const mutate of [s=>s.cases[0].turns[0].expect.facts.selfFood=-1,s=>s.cases[0].turns[0].expect.facts.lifeIntent='GrantGold',s=>s.cases[0].turns[0].expect.facts.lifeFoodChange=1001,s=>s.cases[0].turns[0].expect.facts.selfWallet='secret',s=>{s.schemaVersion=1;delete s.fixtureVersion;}]){
  const copy=structuredClone(suite);mutate(copy);assert.throws(()=>validateDialogueSuite(copy));
 }
 let calls=0;const out=path.join(await temp(t),'plan.json');
 const r=await evaluateDialogueCli(['--suite','life-v2','--out',out],{env:{NPC_LLM_ENABLED:'true'},fetchImpl:()=>{calls++;throw Error('Plan cannot call models');},log(){}});
 assert.equal(calls,0);assert.equal(r.exitCode,0);assert.equal(r.report.counts.notRun,16);assert.equal(r.report.counts.fixtureFailed,0);assert.equal(r.report.counts.blocked,0);
 assert.ok(r.report.cases.every(c=>c.worldReplayAudit==='passed'));assert.ok(r.report.cases.every(c=>c.turns.every(t=>t.preconditions.length>0&&t.preconditions.every(x=>x.passed))));
 assert.equal(r.report.factAuditSummary.notEvaluatedTurns,16);assert.equal(r.report.factAuditSummary.checkedNoContradictionTurns,0);
 assert.ok(r.report.source.sha256['runtime/evaluation/npc-fact-audit.mjs']);
});

test('controlled sixteen-turn coverage separates one explicit contradiction from valid protocols and later world replays',async()=>{
 let calls=0;const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19976',model:'controlled-life-v2',apiKey:''},{maxCalls:16,fetchImpl:async(_url,o)=>{
  calls++;const input=JSON.parse(JSON.parse(o.body).messages[1].content),ctx=input.npc,t=findTurn(input.playerUtterance);
  assert.equal(JSON.stringify(input).includes('humanReview'),false);assert.equal(JSON.stringify(input).includes('selfFood'),false);
  const food=t.id==='after-purchase'?1:ctx.self.food,ref=ctx.observations.find(m=>t.expect.referenceAnyKinds.includes(m.kind));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:`我现在有${food}份粮，钱包里有${ctx.self.wallet}块钱。`,memoryRefs:ref?[ref.eventSeq]:[],proposal:null})}}]});
 }});
 try{
  const r=await runDialogueEvaluation({suite,mode:'controlled-test',provider:p,maxRequests:16});
  assert.equal(calls,16);assert.equal(r.realProviderAttempted,false);assert.equal(r.counts.automaticPassed,16);assert.equal(r.counts.providerFailed,0);
  assert.equal(r.factAuditSummary.contradictionTurns,1);assert.equal(r.factAuditSummary.checkedNoContradictionTurns,15);assert.equal(r.factAuditSummary.unassessedTurns,0);
  assert.equal(r.semanticVerdict,'needs-human-review');assert.ok(r.cases.every(c=>c.worldReplayAudit==='passed'));
  const wrong=r.cases[0].turns[3];assert.equal(wrong.response.reply,'我现在有1份粮，钱包里有10块钱。');assert.equal(wrong.context.self.food,0);assert.equal(wrong.humanReview.verdict,'pending');
  assert.ok(r.cases.every(c=>c.turns.every(t=>t.checks.find(x=>x.name==='speechDidNotCreateEpisodes').passed)));
 }finally{p.close();}
});

test('loopback CLI returns a separate fact-contradiction status, keeps original reply and never retries or executes suggestions',async t=>{
 let calls=0;const mock=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const ctx=JSON.parse(JSON.parse(Buffer.concat(chunks)).messages[1].content).npc;
  assert.equal(req.headers.authorization,'Bearer local-test-only');calls++;
  const food=calls===1?1:ctx.self.food,ref=ctx.observations.find(m=>m.kind==='gift');
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:`我现在有${food}份粮，钱包里有${ctx.self.wallet}块钱。`,memoryRefs:ref?[ref.eventSeq]:[],proposal:null})}}]}));
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>mock.close(r)));
 const logs=[],out=path.join(await temp(t),'loopback.json');
 const r=await evaluateDialogueCli(['--suite','life-v2','--mode','live','--case','words-and-hunger','--allow-model-calls','--max-requests','4','--out',out],{env:{NPC_LLM_ENABLED:'true',NPC_LLM_BASE_URL:`http://127.0.0.1:${mock.address().port}`,NPC_LLM_MODEL:'controlled-life-loopback',NPC_LLM_API_KEY:'local-test-only'},log:v=>logs.push(JSON.parse(v))});
 assert.equal(calls,4);assert.equal(r.exitCode,1);assert.equal(logs.at(-1).status,'fact-contradiction-detected');assert.equal(r.report.counts.automaticPassed,4);assert.equal(r.report.factAuditSummary.contradictionTurns,1);
 assert.equal(r.report.cases[0].turns[0].response.reply,'我现在有1份粮，钱包里有0块钱。');assert.equal(r.report.cases[0].worldReplayAudit,'passed');
 const html=await fs.readFile(r.html,'utf8');assert.match(html,/覆盖有限|覆盖/);assert.match(html,/检测到明确数值矛盾/);assert.equal(html.includes('local-test-only'),false);
});
