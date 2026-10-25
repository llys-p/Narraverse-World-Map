import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {evaluateDialogueCli} from '../../scripts/evaluate-npc-dialogue.mjs';
import {runDialogueEvaluation,validateDialogueSuite} from '../../runtime/evaluation/npc-dialogue-eval.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-life-v1/cases.json',import.meta.url),'utf8'));
const context=(r,id,n)=>r.cases.find(c=>c.id===id).turns[n].context;

test('life plan creates real fixture5 working/purchase states without any model calls and fingerprints the new projection',async t=>{
 for(const change of [s=>s.cases[1].turns[1].before[0].payload.recipientId='actor-3',s=>s.cases[1].turns[1].before[0].payload.quantity=99,s=>{s.schemaVersion=1;delete s.fixtureVersion;}]){
  const altered=structuredClone(suite);change(altered);assert.throws(()=>validateDialogueSuite(altered));
 }
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'npc12-plan-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let calls=0;
 const r=await evaluateDialogueCli(['--suite','life-v1','--out',path.join(dir,'plan.json')],{env:{NPC_LLM_ENABLED:'true'},fetchImpl:()=>{calls++;throw Error('No calls');},log(){}});
 assert.equal(calls,0);assert.equal(r.exitCode,0);assert.equal(r.report.fixtureVersion,'5');assert.equal(r.report.counts.notRun,8);assert.equal(r.report.semanticVerdict,'not-evaluated');
 assert.ok(r.report.cases.every(c=>c.worldReplayAudit==='passed'));
 assert.equal(context(r.report,'work-and-food',0).activity.lastResult,null);
 assert.equal(context(r.report,'work-and-food',1).activity.lastResult.walletChange,20);
 assert.equal(context(r.report,'work-and-food',2).activity.lastResult.action,'WorkForPay');
 const bought=context(r.report,'work-and-food',3);assert.equal(bought.activity.lastResult.foodChange,1);assert.equal(bought.self.food,0);
 const gifted=context(r.report,'gifts-pause',1);assert.equal(gifted.activity.intent.action,'NoAction');assert.equal(gifted.self.food,2);
 const waited=context(r.report,'gifts-pause',2);assert.equal(waited.activity.lastResult.status,'no-action');assert.equal(waited.activity.plan.status,'blocked');assert.equal(waited.self.food,1);assert.equal(waited.self.wallet,20);
 assert.ok(r.report.source.sha256['runtime/core/npc-life-context.mjs']);assert.ok(r.report.source.sha256['runtime/core/campaign-npc-agency.mjs']);
 assert.ok(r.report.source.sha256['runtime/service/npc-life-facts.mjs']);assert.ok(r.report.source.sha256['runtime/core/survival-state.mjs']);
});

test('controlled eight-turn life dialogue consumes the restricted activity and commits only attributed speech',async()=>{
 const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19974',model:'controlled-life-evaluation',apiKey:''},{maxCalls:8,fetchImpl:async(_url,o)=>{
  const ctx=JSON.parse(JSON.parse(o.body).messages[1].content).npc,ref=ctx.observations.find(m=>m.kind==='gift');assert.equal(ctx.activity.version,1);
  assert.equal(ctx.knownFacts.life.current.food,ctx.self.food);assert.equal(ctx.knownFacts.life.current.wallet,ctx.self.wallet);
  assert.equal(ctx.knownFacts.life.lastExecution?.foodChange??null,ctx.activity.lastResult?.foodChange??null);
  assert.equal(JSON.stringify(ctx).includes('knowledgeFingerprint'),false);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控回复：已读取本人行动意图和结果，语义仍需独立复核。',memoryRefs:ref?[ref.eventSeq]:[],proposal:null})}}]});
 }});
 try{
  const r=await runDialogueEvaluation({suite,mode:'controlled-test',provider:p,maxRequests:8});
  assert.equal(r.counts.automaticPassed,8);assert.equal(r.counts.providerFailed,0);assert.equal(r.realProviderAttempted,false);assert.equal(r.semanticVerdict,'needs-human-review');
  for(const c of r.cases){assert.equal(c.worldReplayAudit,'passed');for(const row of c.turns){assert.ok(row.checks.every(x=>x.passed));assert.equal(row.response.proposal,null);}}
 }finally{p.close();}
});
