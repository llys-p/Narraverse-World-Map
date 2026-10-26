import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {validateDialogueSuite,runDialogueEvaluation} from '../../runtime/evaluation/npc-dialogue-eval.mjs';import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-playable-v1/cases.json',import.meta.url),'utf8'));
test('playable schema keeps the eight turn and seven day bounds without widening old fixtures',()=>{
 assert.equal(validateDialogueSuite(suite),8);
 for(const change of [s=>s.fixtureVersion='5',s=>s.cases[0].turns[0].before=[{advanceTo:1009}],s=>s.cases[0].turns.push(structuredClone(s.cases[0].turns[0]))]){const s=structuredClone(suite);change(s);assert.throws(()=>validateDialogueSuite(s));}
});
test('controlled eight turn conversation consumes retained own history and never manufactures world experience',async()=>{
 let calls=0;const provider=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19971',model:'controlled-playable',apiKey:''},{maxCalls:8,fetchImpl:async(_url,o)=>{
  calls++;const input=JSON.parse(JSON.parse(o.body).messages[1].content),c=input.npc;
  assert.ok(!JSON.stringify(input).includes('humanReview'));assert.equal(c.lifeHistoryVersion,'play-life-v1');assert.ok(c.lifeHistory.length<=8);assert.deepEqual(c.lifeHistory,c.knownFacts.life.recentHistory);
  const turn=suite.cases[0].turns.find(t=>t.text===input.playerUtterance);assert.ok(turn);assert.equal(c.self.food,turn.expect.facts.selfFood);assert.equal(c.self.wallet,turn.expect.facts.selfWallet);
  const ref=c.observations.find(m=>turn.expect.referenceAnyKinds.includes(m.kind));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:`受控回复：我现在有${c.self.food}份粮，钱包里有${c.self.wallet}块钱。`,memoryRefs:ref?[ref.eventSeq]:[],proposal:null})}}]});
 }});
 try{const r=await runDialogueEvaluation({suite,mode:'controlled-test',provider,maxRequests:8});assert.equal(calls,8);assert.equal(r.counts.automaticPassed,8);assert.equal(r.counts.fixtureFailed,0);assert.equal(r.factAuditSummary.contradictionTurns,0);assert.equal(r.cases[0].worldReplayAudit,'passed');assert.ok(r.cases[0].turns.every(t=>t.humanReview.verdict==='pending'&&t.checks.find(x=>x.name==='speechDidNotCreateEpisodes').passed));}finally{provider.close();}
});
