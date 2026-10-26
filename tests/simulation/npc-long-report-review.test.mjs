import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReviewTemplate,attachDialogueReview} from '../../runtime/evaluation/npc-dialogue-review.mjs';
const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-life-v3/cases.json',import.meta.url),'utf8'));
// Synthetic report-shaped input; no simulated history or real model quality claim.
const source=()=>({schemaVersion:1,completed:true,suiteId:suite.suiteId,mode:'plan',requestLimit:0,semanticVerdict:'not-evaluated',cases:suite.cases.map(c=>({id:c.id,title:c.title,turns:c.turns.map(t=>({id:t.id,text:t.text,checks:[],preconditions:[],context:null,response:null,status:'not-run',humanReview:{verdict:'pending',questions:t.expect.humanReview}}))}))});
test('the 28-turn long-suite report can enter offline review without permitting conclusions on unrun turns',()=>{
 const r=source(),raw=Buffer.from(JSON.stringify(r)),before=structuredClone(r),template=createReviewTemplate(r,raw);assert.equal(template.turns.length,28);
 template.reviewer={kind:'assistant',label:'controlled-test'};const out=attachDialogueReview(r,raw,template,Buffer.from(JSON.stringify(template)));
 assert.equal(out.reviewImport.summary.notRun,28);assert.equal(out.semanticVerdict,'not-evaluated');assert.deepEqual(r,before);
 template.turns[0].verdict='pass';assert.throws(()=>attachDialogueReview(r,raw,template,Buffer.from(JSON.stringify(template))));
});
test('long reports still reject ninth turns and more than 32 total rows',()=>{
 const r=source();r.cases[3].turns.push(...structuredClone(r.cases[0].turns.slice(0,4)));assert.equal(createReviewTemplate(r,Buffer.from(JSON.stringify(r))).turns.length,32);
 r.cases[0].turns.push({...structuredClone(r.cases[0].turns[0]),id:'extra'});assert.throws(()=>createReviewTemplate(r,Buffer.from(JSON.stringify(r))));
});
