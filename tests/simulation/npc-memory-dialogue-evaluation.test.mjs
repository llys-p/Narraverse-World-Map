import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {evaluateDialogueCli,parseEvaluationArgs} from '../../scripts/evaluate-npc-dialogue.mjs';
import {runDialogueEvaluation,validateDialogueSuite} from '../../runtime/evaluation/npc-dialogue-eval.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-memory-dialogue-v1/cases.json',import.meta.url),'utf8'));
const context=(r,id,turn)=>r.cases.find(c=>c.id===id).turns[turn].context;

test('memory CLI explicitly creates fixture5, preserves zero-call planning and rejects unsupported suite versions',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'npc9-memory-plan-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 assert.equal(parseEvaluationArgs([]).suite,'dialogue-v1');assert.throws(()=>parseEvaluationArgs(['--suite','invented']));
 assert.equal(validateDialogueSuite(suite),17);
 for(const change of [s=>s.fixtureVersion='4',s=>delete s.fixtureVersion,s=>s.schemaVersion=1]){const bad=structuredClone(suite);change(bad);assert.throws(()=>validateDialogueSuite(bad));}
 let calls=0;const r=await evaluateDialogueCli(['--suite','memory-v1','--out',path.join(directory,'report.json')],{env:{NPC_LLM_ENABLED:'true'},fetchImpl:()=>{calls++;throw Error('no calls');},log(){}});
 assert.equal(r.exitCode,0);assert.equal(calls,0);assert.equal(r.report.fixtureVersion,'5');assert.equal(r.report.counts.notRun,17);assert.equal(r.report.semanticVerdict,'not-evaluated');
 assert.ok(r.report.cases.every(c=>c.fixtureVersion==='5'&&c.worldReplayAudit==='passed'));
 for(const c of r.report.cases)for(const t of c.turns){assert.equal(t.context.memoryMode,'npc-memory-v1');assert.ok(t.context.observations.length<=12);}
 assert.equal(context(r.report,'repair-denial',0).memoryUpdates.find(x=>x.topic==='damage').status,'repaired');
 assert.equal(context(r.report,'repeated-apology',1).memoryUpdates.find(x=>x.topic==='apology').status,'repeated-or-refused');
 const recovered=context(r.report,'loss-return',1);assert.equal(recovered.memoryUpdates.find(x=>x.topic==='loss').status,'recovered');assert.equal(recovered.observations.some(m=>m.kind==='steal'),false);
 assert.equal(context(r.report,'fixed-lateness',0).knownFacts.agreement.overdueMinutes,40);assert.equal(context(r.report,'fixed-lateness',1).knownFacts.agreement.overdueMinutes,40);
 assert.equal(context(r.report,'repair-progress',1).knownFacts.agreement.wasClaimed,false);
 assert.ok(r.report.source.sha256['runtime/core/npc-negotiation-terms.mjs']);assert.ok(r.report.source.sha256['benchmarks/npc-memory-dialogue-v1/cases.json']);
 assert.match(await fs.readFile(r.html,'utf8'),/世界fixture：5/);
});

test('fixture5 controlled dialogue consumes actual personal updates, retains prior speech, and never writes factual episodes from words',async()=>{
 const seen=[];const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19979',model:'controlled-memory-eval',apiKey:''},{maxCalls:17,fetchImpl:async(_url,o)=>{
  const input=JSON.parse(JSON.parse(o.body).messages[1].content),ctx=input.npc;seen.push(ctx);
  assert.equal(ctx.memoryMode,'npc-memory-v1');assert.equal(JSON.stringify(input).includes('humanReview'),false);
  const c=suite.cases.find(c=>c.turns.some(t=>t.text===input.playerUtterance)),t=c.turns.find(t=>t.text===input.playerUtterance);
  const ref=ctx.observations.find(m=>t.expect.referenceAnyKinds.includes(m.kind));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控回复：已读取当前实际经历与后续进展。',memoryRefs:ref?[ref.eventSeq]:[],proposal:ctx.intentHint.proposalHint})}}]});
 }});
 try{
  const r=await runDialogueEvaluation({suite,mode:'controlled-test',provider:p,maxRequests:17});
  assert.equal(seen.length,17);assert.equal(r.counts.automaticPassed,17);assert.equal(r.counts.providerFailed,0);assert.equal(r.counts.automaticFailed,0);assert.equal(r.realProviderAttempted,false);
  assert.equal(r.semanticVerdict,'needs-human-review');assert.ok(r.cases.every(c=>c.worldReplayAudit==='passed'));
  for(const c of r.cases){assert.equal(c.turns[1].context.conversation.length,1);for(const t of c.turns)assert.equal(t.checks.find(x=>x.name==='speechDidNotCreateEpisodes').passed,true);}
  assert.equal(context(r,'false-story',1).observations.length,0);
 }finally{p.close();}
});
