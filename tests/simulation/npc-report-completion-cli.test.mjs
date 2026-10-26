import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {evaluateDialogueCli} from '../../scripts/evaluate-npc-dialogue.mjs';
const temp=async t=>{const p=await fs.mkdtemp(path.join(os.tmpdir(),'npc17-completion-'));t.after(()=>fs.rm(p,{recursive:true,force:true}));return p;};
test('plan completion is backed by reread JSON, HTML and a separate final byte receipt',async t=>{
 const out=path.join(await temp(t),'plan.json');let calls=0;const logs=[];
 const r=await evaluateDialogueCli(['--case','unsupported','--out',out],{env:{},fetchImpl:()=>{calls++;throw Error('No network');},log:v=>logs.push(JSON.parse(v))});
 assert.equal(r.report.completionProtocol,1);assert.equal(calls,0);assert.equal(r.report.completed,true);
 const receipt=JSON.parse(await fs.readFile(out.slice(0,-5)+'.complete.json','utf8'));assert.equal(receipt.kind,'npc-dialogue-report-completion');
 const {verifyDialogueReportFiles}=await import('../../runtime/evaluation/npc-report-files.mjs');
 const verified=await verifyDialogueReportFiles(out);assert.equal(verified.status,'files-verified');assert.equal(logs.at(-1).fileIntegrity.status,'files-verified');
 assert.equal(verified.json.sha256,receipt.json.sha256);assert.equal(verified.html.sha256,receipt.html.sha256);
});
test('existing completion evidence prevents starting a new report and is never overwritten',async t=>{
 const dir=await temp(t),out=path.join(dir,'collision.json'),receipt=out.slice(0,-5)+'.complete.json';await fs.writeFile(receipt,'preserve-original');
 await assert.rejects(evaluateDialogueCli(['--case','unsupported','--out',out],{env:{},log(){}}),{code:'OUTPUT_EXISTS'});
 assert.equal(await fs.readFile(receipt,'utf8'),'preserve-original');assert.deepEqual(await fs.readdir(dir),['collision.complete.json']);
});

test('offline review checks new source pairs, seals derived reports, and identifies legacy input without promoting human verdicts',async t=>{
 const {reviewDialogueCli}=await import('../../scripts/review-npc-dialogue.mjs'),{verifyDialogueReportFiles}=await import('../../runtime/evaluation/npc-report-files.mjs');
 const dir=await temp(t),out=path.join(dir,'source.json');
 await evaluateDialogueCli(['--case','unsupported','--out',out],{env:{},log(){}});
 const html=out.slice(0,-5)+'.html',proof=out.slice(0,-5)+'.complete.json',original=await fs.readFile(html),receipt=await fs.readFile(proof);
 await fs.unlink(proof);await assert.rejects(reviewDialogueCli(['--report',out,'--template',path.join(dir,'bad.json')],{log(){}}),{code:'REPORT_UNVERIFIED'});
 await fs.writeFile(proof,receipt);await fs.writeFile(html,'earlier HTML');await assert.rejects(reviewDialogueCli(['--report',out,'--template',path.join(dir,'bad.json')],{log(){}}),{code:'REPORT_UNVERIFIED'});
 await fs.writeFile(html,original);const derived=path.join(dir,'reviewed.json'),r=await reviewDialogueCli(['--report',out,'--out',derived],{log(){}});
 assert.equal(r.sourceFileIntegrity.status,'files-verified');assert.equal((await verifyDialogueReportFiles(derived)).status,'files-verified');assert.equal(r.report.semanticVerdict,'not-evaluated');assert.equal(r.report.cases[0].turns[0].humanReview.verdict,'pending');
 const legacy=JSON.parse(await fs.readFile(out,'utf8'));delete legacy.completionProtocol;const old=path.join(dir,'old.json');await fs.writeFile(old,JSON.stringify(legacy));
 const template=await reviewDialogueCli(['--report',old,'--template',path.join(dir,'old-template.json')],{log(){}});assert.equal(template.sourceFileIntegrity.status,'legacy-no-completion');
 assert.equal(await fs.readFile(html,'utf8'),original.toString());
});

test('standalone verification is offline, rejects malformed arguments and detects drift after a successful check',async t=>{
 const {verifyDialogueReportCli}=await import('../../scripts/verify-npc-dialogue-report.mjs');
 const out=path.join(await temp(t),'verify.json');await evaluateDialogueCli(['--case','unsupported','--out',out],{env:{},log(){}});
 const logs=[];const r=await verifyDialogueReportCli(['--report',out],{log:v=>logs.push(JSON.parse(v))});assert.equal(r.exitCode,0);assert.equal(logs[0].externalModelCalls,0);
 await assert.rejects(verifyDialogueReportCli(['--report',out,'--allow-model-calls'],{log(){}}));
 await fs.writeFile(out,'{"completed":false}');await assert.rejects(verifyDialogueReportCli(['--report',out],{log(){}}),{code:'REPORT_UNVERIFIED'});
});
