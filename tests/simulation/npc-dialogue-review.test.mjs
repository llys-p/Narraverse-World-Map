import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reviewDialogueCli,parseReviewArgs} from '../../scripts/review-npc-dialogue.mjs';
import {createReviewTemplate,attachDialogueReview,refreshDialogueFactAudits} from '../../runtime/evaluation/npc-dialogue-review.mjs';

// A synthetic report-format input, not a real world run or model evaluation.
const source=()=>({schemaVersion:1,completed:true,suiteId:'synthetic-review',fixtureVersion:'5',mode:'controlled-test',requestLimit:2,semanticVerdict:'needs-human-review',notice:'合成评审格式测试',counts:{attempted:1},cases:[{
 id:'synthetic-case',title:'合成评审边界',setupReceipts:[],worldReplayAudit:'passed',turns:[
 {id:'answered',text:'现在还有粮吗？',status:'automatic-pass',context:{self:{food:0,wallet:10}},response:{reply:'我现在有一份粮。',memoryRefs:[],proposal:null},checks:[],preconditions:[],humanReview:{verdict:'pending',questions:['核对当前库存，不用旧口述代替事实。']}},
 {id:'not-run',text:'后来呢？',status:'blocked',context:null,response:null,checks:[],preconditions:[],humanReview:{verdict:'pending',questions:['未运行不能补造回复或判为通过。']}}]}]});
const bytes=r=>Buffer.from(JSON.stringify(r));
const base=()=>{const report=source(),raw=bytes(report),review=createReviewTemplate(report,raw);review.reviewer={kind:'assistant',label:'test-reviewer'};return {report,raw,review};};
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'npc15-review-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('template binds original report and turns; assistant conclusions never replace pending human review',()=>{
 const {report,raw,review}=base(),before=structuredClone(report);review.turns[0].verdict='needs-correction';review.turns[0].notes='当前粮0，回复称1。';
 const audited=refreshDialogueFactAudits(report,raw,'a'.repeat(64)),out=attachDialogueReview(audited,raw,review,bytes(review));
 assert.equal(out.factAuditSummary.contradictionTurns,1);assert.equal(out.reviewImport.verdict,'needs-correction');
 assert.equal(out.reviewImport.independentHumanVerdict,'not-verified');assert.equal(out.reviewImport.reviewerIdentityVerified,false);
 assert.equal(out.reviewImport.summary.notRun,1);assert.equal(out.cases[0].turns[0].humanReview.verdict,'pending');
 assert.equal(out.semanticVerdict,'needs-human-review');assert.equal(out.cases[0].turns[0].response.reply,report.cases[0].turns[0].response.reply);
 assert.deepEqual(report,before);
});

test('wrong source, tampered turn binding, duplicate/missing rows and verdicts on unrun turns are refused',()=>{
 for(const change of [r=>r.sourceReportSha256='0'.repeat(64),r=>r.turns[0].turnSha256='0'.repeat(64),r=>r.turns[0].reply='另一句',r=>r.turns[0].questions=['换了标准'],r=>r.turns[1]=structuredClone(r.turns[0]),r=>r.turns.pop(),r=>r.turns[1].verdict='pass',r=>r.turns[0].verdict='independent-gold-pass',r=>r.extra='injected']){
  const {report,raw,review}=base();change(review);assert.throws(()=>attachDialogueReview(report,raw,review,bytes(review)));
 }
 const {report,raw,review}=base();review.turns[0].verdict='pass';review.reviewer={kind:'unassigned',label:''};assert.throws(()=>attachDialogueReview(report,raw,review,bytes(review)));
 const edited=structuredClone(report);edited.cases[0].turns[0].context.self.food=9;assert.throws(()=>attachDialogueReview(edited,bytes(edited),review,bytes(review)));
});

test('self-declared human labels and limited coverage never become independent or full automatic approval',()=>{
 const {report,raw,review}=base();review.reviewer={kind:'human',label:'self-declared'};review.turns[0].verdict='pass';
 const out=attachDialogueReview(report,raw,review,bytes(review));
 assert.equal(out.reviewImport.verdict,'partial-coverage-reviewed');assert.equal(out.reviewImport.independentHumanVerdict,'not-verified');
 assert.equal(out.semanticVerdict,'needs-human-review');assert.throws(()=>createReviewTemplate(out,bytes(out)));
 const allPending=createReviewTemplate(report,raw);assert.equal(attachDialogueReview(report,raw,allPending,bytes(allPending)).reviewImport.verdict,'incomplete');
});

test('offline CLI template, audit and review round trip keeps source bytes and escapes report text',async t=>{
 const dir=await temp(t),original=path.join(dir,'source.json'),templatePath=path.join(dir,'review.json'),output=path.join(dir,'annotated.json');
 const report=source();report.cases[0].turns[0].response.reply='我现在有一份粮。<img src=x onerror=alert(1)>';
 const raw=bytes(report);await fs.writeFile(original,raw);
 const template=await reviewDialogueCli(['--report',original,'--template',templatePath],{log(){}});
 template.template.reviewer={kind:'assistant',label:'test-reviewer'};template.template.turns[0].verdict='needs-correction';template.template.turns[0].notes='<script>alert(1)</script>';
 await fs.writeFile(templatePath,JSON.stringify(template.template));
 const r=await reviewDialogueCli(['--report',original,'--reviews',templatePath,'--out',output],{log(){}});
 assert.equal(r.exitCode,1);assert.equal(r.report.factAuditSummary.contradictionTurns,1);assert.deepEqual(await fs.readFile(original),raw);
 const html=await fs.readFile(r.html,'utf8');assert.equal(html.includes('<script>'),false);assert.equal(html.includes('<img'),false);assert.match(html,/&lt;script&gt;/);assert.match(html,/default-src 'none'/);assert.match(html,/未验证/);
 const auditOnly=await reviewDialogueCli(['--report',original,'--out',path.join(dir,'audit-only.json')],{log(){}});assert.equal(auditOnly.exitCode,1);assert.equal(auditOnly.report.reviewImport,undefined);
});

test('existing JSON, HTML or template survives output collisions; invalid arguments and review files do not create outputs',async t=>{
 const dir=await temp(t),original=path.join(dir,'source.json'),output=path.join(dir,'annotated.json'),html=output.replace('.json','.html'),reviewPath=path.join(dir,'review.json');
 const {report,raw,review}=base();await fs.writeFile(original,raw);await fs.writeFile(reviewPath,bytes(review));await fs.writeFile(html,'preserve-html');
 await assert.rejects(reviewDialogueCli(['--report',original,'--out',output],{log(){}}),{code:'OUTPUT_EXISTS'});await assert.rejects(fs.access(output));assert.equal(await fs.readFile(html,'utf8'),'preserve-html');
 await fs.writeFile(output,'preserve-json');await assert.rejects(reviewDialogueCli(['--report',original,'--out',output],{log(){}}),{code:'OUTPUT_EXISTS'});assert.equal(await fs.readFile(output,'utf8'),'preserve-json');
 await assert.rejects(reviewDialogueCli(['--report',original,'--template',reviewPath],{log(){}}),{code:'OUTPUT_EXISTS'});
 for(const args of [[],['--report',original,'--out',output,'--out',output],['--report',original,'--template',reviewPath,'--reviews',reviewPath],['--report',original,'--allow-model-calls','--out',output]])assert.throws(()=>parseReviewArgs(args));
 review.sourceReportSha256='0'.repeat(64);await fs.writeFile(reviewPath,bytes(review));const invalidOut=path.join(dir,'invalid.json');await assert.rejects(reviewDialogueCli(['--report',original,'--reviews',reviewPath,'--out',invalidOut],{log(){}}));await assert.rejects(fs.access(invalidOut));
 assert.deepEqual(await fs.readFile(original),bytes(report));
});

test('incomplete reports, invalid response contracts and oversized or duplicate-key inputs are refused offline',async t=>{
 for(const change of [r=>r.completed=false,r=>r.cases[0].turns[0].response={reply:'x',memoryRefs:[],proposal:null,extra:1},r=>r.cases[0].turns[0].humanReview.questions=[],r=>r.cases[0].turns.push(structuredClone(r.cases[0].turns[0]))]){
  const r=source();change(r);assert.throws(()=>createReviewTemplate(r,bytes(r)));
 }
 const dir=await temp(t),input=path.join(dir,'invalid.json'),output=path.join(dir,'result.json');
 await fs.writeFile(input,Buffer.alloc(4194305,32));await assert.rejects(reviewDialogueCli(['--report',input,'--out',output],{log(){}}),{code:'LIMIT_EXCEEDED'});
 await fs.writeFile(input,'{"schemaVersion":1,"schemaVersion":1}');await assert.rejects(reviewDialogueCli(['--report',input,'--out',output],{log(){}}));await assert.rejects(fs.access(output));
});
