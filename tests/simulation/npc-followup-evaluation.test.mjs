import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {evaluateDialogueCli} from '../../scripts/evaluate-npc-dialogue.mjs';
import {runDialogueEvaluation} from '../../runtime/evaluation/npc-dialogue-eval.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-followup-v1/cases.json',import.meta.url),'utf8'));

test('follow-up plan has eight uncalled turns and does not fabricate confirmed speech anchors',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'npc10-plan-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let calls=0;
 const r=await evaluateDialogueCli(['--suite','followup-v1','--out',path.join(dir,'plan.json')],{env:{NPC_LLM_ENABLED:'true'},fetchImpl:()=>{calls++;throw Error('No calls');},log(){}});
 assert.equal(calls,0);assert.equal(r.exitCode,0);assert.equal(r.report.fixtureVersion,'5');assert.equal(r.report.counts.notRun,8);
 assert.equal(r.report.semanticVerdict,'not-evaluated');assert.ok(r.report.cases.every(c=>c.worldReplayAudit==='passed'));
 for(const c of r.report.cases)for(const row of c.turns)assert.equal(row.context.conversation.length,0);
 assert.equal(r.report.cases[0].turns[1].context.recallFocus.source,'none');
 assert.ok(r.report.source.sha256['runtime/service/npc-recall-focus.mjs']);assert.ok(r.report.source.sha256['benchmarks/npc-followup-v1/cases.json']);
});

test('controlled evaluation forms anchors only by committing dialogue and keeps facts separate from topics',async()=>{
 const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19980',model:'controlled-followup-evaluation',apiKey:''},{maxCalls:8,fetchImpl:async(_url,o)=>{
  const ctx=JSON.parse(JSON.parse(o.body).messages[1].content).npc,ref=ctx.observations.find(m=>m.kind==='help');
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控回复，仅检验话题接线，不代表语言质量。',memoryRefs:ref?[ref.eventSeq]:[],proposal:null})}}]});
 }});
 try{
  const r=await runDialogueEvaluation({suite,mode:'controlled-test',provider:p,maxRequests:8});
  assert.equal(r.counts.automaticPassed,8);assert.equal(r.counts.providerFailed,0);assert.equal(r.realProviderAttempted,false);assert.equal(r.semanticVerdict,'needs-human-review');
  const repair=r.cases[0].turns,claim=r.cases[1].turns;
  for(const i of [1,2])assert.deepEqual(repair[i].context.recallFocus,{source:'confirmed-player-followup',topics:['repair'],anchorEventSeq:repair[0].committedSpeech.eventSeq});
  assert.deepEqual(repair[3].context.recallFocus.topics,['food']);
  assert.equal(claim[1].context.recallFocus.source,'confirmed-player-followup');assert.equal(claim[1].context.observations.length,0);
  assert.equal(claim[3].context.recallFocus.source,'none');
  for(const c of r.cases){assert.equal(c.worldReplayAudit,'passed');for(const row of c.turns){assert.ok(row.checks.every(x=>x.passed));assert.equal(row.response.proposal,null);}}
 }finally{p.close();}
});
