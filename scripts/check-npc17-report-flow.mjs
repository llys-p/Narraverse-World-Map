// Full offline producer -> verifier -> review consumer, with no model configuration.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluateDialogueCli} from './evaluate-npc-dialogue.mjs';
import {reviewDialogueCli} from './review-npc-dialogue.mjs';
import {verifyDialogueReportCli} from './verify-npc-dialogue-report.mjs';
const directory=path.resolve(process.argv[2]);
await fs.mkdir(directory,{recursive:true});
const report=path.join(directory,'life-v3.json'),template=path.join(directory,'review-template.json'),reviewed=path.join(directory,'reviewed.json');
let calls=0;const silent=()=>{};
const r=await evaluateDialogueCli(['--suite','life-v3','--out',report],{env:{},fetchImpl:()=>{calls++;throw Error('Offline flow cannot fetch');},log:silent});
assert.equal(r.exitCode,0);assert.equal(r.report.completed,true);assert.equal(r.report.counts.notRun,28);assert.equal(r.report.counts.fixtureFailed,0);assert.equal(r.report.counts.blocked,0);assert.equal(calls,0);
assert.ok(r.report.cases.every(c=>c.worldReplayAudit==='passed'&&c.turns.every(t=>t.preconditions.every(x=>x.passed))));
const sha=b=>createHash('sha256').update(b).digest('hex'),before=sha(await fs.readFile(report));
const proof=await verifyDialogueReportCli(['--report',report],{log:silent});assert.equal(proof.exitCode,0);
const t=await reviewDialogueCli(['--report',report,'--template',template],{log:silent});assert.equal(t.template.turns.length,28);assert.ok(t.template.turns.every(t=>t.verdict==='pending'));assert.equal(t.sourceFileIntegrity.status,'files-verified');
const reviewedReport=await reviewDialogueCli(['--report',report,'--reviews',template,'--out',reviewed],{log:silent});
assert.equal(reviewedReport.exitCode,0);assert.equal(reviewedReport.report.reviewImport.summary.notRun,28);assert.equal(reviewedReport.report.reviewImport.independentHumanVerdict,'not-verified');
assert.equal(reviewedReport.report.semanticVerdict,'not-evaluated');assert.ok(reviewedReport.report.cases.every(c=>c.turns.every(t=>t.humanReview.verdict==='pending')));
assert.equal((await verifyDialogueReportCli(['--report',reviewed],{log:silent})).exitCode,0);assert.equal(sha(await fs.readFile(report)),before);
const summary={status:'verified',externalModelCalls:calls,source:r.report.source,completionProtocol:r.report.completionProtocol,counts:r.report.counts,
 semanticVerdict:r.report.semanticVerdict,sourceReportUnchanged:true,templateRows:t.template.turns.length,templatePending:t.template.turns.filter(t=>t.verdict==='pending').length,
 fileIntegrity:r.fileIntegrity,reviewedFileIntegrity:reviewedReport.fileIntegrity,independentHumanVerdict:reviewedReport.report.reviewImport.independentHumanVerdict,
 cases:r.report.cases.map(c=>({id:c.id,worldReplayAudit:c.worldReplayAudit,turns:c.turns.map(t=>({id:t.id,status:t.status,preconditions:t.preconditions}))}))};
await fs.writeFile(path.join(directory,'flow-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:summary.status,externalModelCalls:calls,turns:28,worldReplays:4,templateRows:28,fileIntegrity:summary.fileIntegrity.status,semanticVerdict:summary.semanticVerdict}));
