import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateDialogueSuite,runDialogueEvaluation} from '../../runtime/evaluation/npc-dialogue-eval.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
import {parseEvaluationArgs} from '../../scripts/evaluate-npc-dialogue.mjs';
const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-life-v3/cases.json',import.meta.url),'utf8'));

test('new bounded schema accepts eight-turn histories and four settlements while old schemas keep their limits',()=>{
 assert.equal(parseEvaluationArgs(['--suite','life-v3']).suite,'life-v3');assert.equal(validateDialogueSuite(suite),28);
 for(const edit of [s=>s.schemaVersion=2,s=>s.cases[0].turns[0].before=[{advanceTo:577}],s=>s.cases[0].turns.push(structuredClone(s.cases[0].turns[0])),s=>s.cases[0].turns[0].expect.facts.lifeDecisionReason='INVENTED']){
  const s=structuredClone(suite);edit(s);assert.throws(()=>validateDialogueSuite(s));
 }
 const old=structuredClone(suite);old.schemaVersion=2;old.cases=old.cases.slice(-1);assert.equal(validateDialogueSuite(old),4);
 old.cases[0].turns[0].before=[{advanceTo:289}];assert.throws(()=>validateDialogueSuite(old));
});

test('controlled twenty-eight turns preserve exact state, paired historical reasons, source references and four replays',async()=>{
 let calls=0;const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19971',model:'controlled-life-v3',apiKey:''},{maxCalls:28,fetchImpl:async(_url,o)=>{
  calls++;assert.ok(Buffer.byteLength(o.body)<=32768);const body=JSON.parse(o.body),input=JSON.parse(body.messages[1].content),ctx=input.npc;
  const t=suite.cases.flatMap(c=>c.turns).find(t=>t.text===input.playerUtterance);assert.ok(t);
  assert.equal(JSON.stringify(input).includes('humanReview'),false);assert.equal(JSON.stringify(input).includes('lifeDecisionReason'),false);
  if(Object.hasOwn(t.expect.facts,'lifeDecisionReason'))assert.equal(ctx.knownFacts.life.decisionBasis?.reasonCode??null,t.expect.facts.lifeDecisionReason);
  const ref=ctx.observations.find(m=>t.expect.referenceAnyKinds.includes(m.kind));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:`受控回复：我现在有${ctx.self.food}份粮，钱包里有${ctx.self.wallet}块钱。`,memoryRefs:ref?[ref.eventSeq]:[],proposal:null})}}]});
 }});
 try{
  const r=await runDialogueEvaluation({suite,mode:'controlled-test',provider:p,maxRequests:28});
  assert.equal(calls,28);assert.equal(r.realProviderAttempted,false);assert.equal(r.counts.automaticPassed,28);assert.equal(r.counts.fixtureFailed,0);assert.equal(r.counts.providerFailed,0);
  assert.equal(r.factAuditSummary.contradictionTurns,0);assert.equal(r.semanticVerdict,'needs-human-review');assert.ok(r.cases.every(c=>c.worldReplayAudit==='passed'));
  assert.ok(r.cases.every(c=>c.turns.every(t=>t.humanReview.verdict==='pending'&&t.checks.find(x=>x.name==='speechDidNotCreateEpisodes').passed)));
  const gifts=r.cases[1].turns;assert.equal(gifts[3].context.knownFacts.life.decisionBasis.reasonCode,'WAIT');assert.equal(gifts[3].context.self.wallet,20);
  assert.equal(gifts[5].context.self.wallet,10);assert.equal(gifts[7].context.self.wallet,0);assert.equal(gifts[7].context.self.food,1);
  assert.ok(gifts[6].context.conversation.some(t=>t.utterance===gifts[5].text));
 }finally{p.close();}
});
