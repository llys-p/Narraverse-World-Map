import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDialogueFacts,summarizeFactAudits} from '../../runtime/evaluation/npc-fact-audit.mjs';
const context={tick:288,self:{food:0,wallet:10}};
test('explicit current resource contradictions are separate from historical purchases and unassessed wording',()=>{
 const a=auditDialogueFacts('刚花十块钱买了一份口粮，眼下就剩这一份了，钱也只剩几块。',context);
 assert.equal(a.status,'contradiction-detected');assert.equal(a.claims.length,1);
 assert.deepEqual([a.claims[0].field,a.claims[0].stated,a.claims[0].actual],['food',1,0]);
 const b=auditDialogueFacts('我现在没有存粮，钱包里还有十块钱。',context);
 assert.equal(b.status,'checked-no-contradiction');assert.equal(b.claims.length,2);
 assert.equal(auditDialogueFacts('我得留些钱等找着新工作。',context).status,'unassessed');
});
test('questions, quotations, past, hypotheses, denial, other people and corrections do not become current assertions',()=>{
 for(const reply of ['我现在有一份口粮吗？','我现在有一份口粮，对吗。','你说：“我现在有一份口粮，钱包里有二十块钱。”','“我现在有一份口粮，钱包里有二十块钱','他说，现在有一份口粮。','我之前有一份口粮。','以前，我有一份粮。','如果我现在有一份口粮就好了。','要是有钱，我现在有一份粮。','我不是现在有一份口粮。','你现在有一份口粮。','我现在有一份口粮，不对，我刚说错了，其实没有。'])assert.equal(auditDialogueFacts(reply,context).status,'unassessed',reply);
});
test('bounded numeric grammar handles exact Chinese counts, marks missing context and skips ambiguous quantities',()=>{
 for(const [reply,field,n] of [['我现在还有两份粮。','food',2],['粮食还剩零份。','food',0],['目前钱包里还有二十块钱。','wallet',20],['钱只有一百零二枚金币。','wallet',102],['我现在有10块钱。','wallet',10]]){
  const a=auditDialogueFacts(reply,{self:{food:2,wallet:102}});assert.equal(a.claims[0]?.field,field,reply);assert.equal(a.claims[0]?.stated,n,reply);
  const claim=a.claims[0];assert.equal(reply.slice(claim.start,claim.end),claim.text);
 }
 for(const reply of ['我现在有一百二份粮。','我现在有一二份粮。','我现在有一袋粮。','我现在还有几份粮。','我现在还有一份药。','过会儿我现在有两份粮。'])assert.equal(auditDialogueFacts(reply,context).status,'unassessed',reply);
 const unknown=auditDialogueFacts('我现在有1份粮。',{});assert.equal(unknown.status,'unassessed');assert.equal(unknown.unknownClaims,1);assert.equal(unknown.claims[0].actual,null);
 assert.equal(auditDialogueFacts('x'.repeat(10000),context).status,'unassessed');
});
test('audits ignore injected derived facts, retain detached values and keep unassessed distinct from checked',()=>{
 const ctx={self:{food:0,wallet:10},knownFacts:{life:{current:{food:9}}}},before=structuredClone(ctx);
 const bad=auditDialogueFacts('现在有一份粮。',ctx),good=auditDialogueFacts('现在没有粮。',ctx),unknown=auditDialogueFacts('好吧。',ctx);
 assert.equal(bad.claims[0].actual,0);assert.deepEqual(ctx,before);
 const s=summarizeFactAudits([{turns:[{response:{},factAudit:bad},{response:{},factAudit:good},{response:{},factAudit:unknown},{response:null,factAudit:null}]}]);
 assert.deepEqual(s,{scope:'explicit-current-food-wallet',turnsWithReplies:3,contradictionTurns:1,checkedNoContradictionTurns:1,unassessedTurns:1,notEvaluatedTurns:1});
});
