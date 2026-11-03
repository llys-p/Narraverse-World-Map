import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';
import {verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/forest-dialogue-20261101',sha=b=>createHash('sha256').update(b).digest('hex');
const read=async f=>{const p=path.resolve(root,f);assert.ok(!path.isAbsolute(f)&&p.startsWith(root));return fs.readFile(p);},json=async f=>JSON.parse(await read(f));
const index=await json(dir+'/index.json'),candidate=await verifyForestCandidate(),manifest=await json('docs/runtime/forest-playtest-candidate.json');
assert.equal(candidate.id,'forest-playtest-candidate-3');assert.equal(index.testedCommit,'66eb0a21a710988b4e50b518906dfd5fff23e5f8');assert.equal(index.parent,'a272484c0e74f4079bb11259e721b57abc4b89fd');
for(const [f,h]of Object.entries(index.sourceSha256))assert.equal(sha(await read(f)),h,'source: '+f);
for(const [f,d]of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,d.bytes);assert.equal(sha(b),d.sha256,f);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const m=await json(dir+'/forest-dialogue-regression.json'),log=(await read(dir+'/forest-dialogue-regression.txt')).toString();assert.equal(m.exitCode,0);assert.equal(m.timedOut,false);assert.equal(m.unconfirmed,false);
for(const [k,v]of [['tests',70],['pass',70],['fail',0],['cancelled',0],['skipped',0]])assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));
const names=[...log.matchAll(/^✔ (.+) \([\d.]+ms\)$/gm)].map(x=>x[1]);assert.equal(names.length,70);assert.equal(new Set(names).size,70);assert.equal(index.uniqueTests,70);
let calls=0,input=0,output=0;const reports={};
for(const label of ['live-01','borrow-retest','overdue-retest','controlled-03','plan-final']){
 await verifyDialogueReportFiles(path.join(root,dir,label+'.json'));const r=await json(dir+'/'+label+'.json');reports[label]=r;assert.equal(r.fixtureVersion,'8');assert.equal(r.completed,true);
 for(const c of r.cases){assert.equal(c.worldReplayAudit,'passed');assert.deepEqual(c.remainingLocks,[]);for(const reopen of c.reopens){assert.equal(reopen.sameFiveProjections,true);assert.equal(reopen.noExtraCommit,true);}}
 if(r.mode==='live'){assert.equal(r.semanticVerdict,'needs-human-review');assert.equal(r.provider.model,'deepseek-flash');calls+=r.externalModelCalls;
  for(const c of r.cases)for(const t of c.turns){assert.equal(t.humanReview,'pending');input+=t.metrics?.usage?.inputTokens??0;output+=t.metrics?.usage?.outputTokens??0;}
 }else{assert.equal(r.externalModelCalls,0);assert.equal(r.semanticVerdict,'not-evaluated');}
 if(['borrow-retest','overdue-retest','controlled-03','plan-final'].includes(label))for(const [f,h]of Object.entries(r.source.sha256))assert.equal(sha(await read(f)),h,'current report source: '+f);
}
assert.equal(calls,16);assert.equal(input,54686);assert.equal(output,1140);assert.equal(reports['controlled-03'].counts.automaticPassed,12);assert.equal(reports['plan-final'].counts.notRun,12);assert.equal(reports['plan-final'].counts.attempted,0);
const original=reports['live-01'],parent=await json(dir+'/parent-candidate.json');for(const [f,h]of Object.entries(parent.gameSha256))assert.equal(original.source.sha256[f],h,'baseline game: '+f);
assert.equal(sha(await read(dir+'/baseline-evaluator.mjs')),original.source.sha256['scripts/evaluate-forest-dialogue.mjs']);assert.equal(sha(await read(dir+'/parent-helper.mjs')),original.source.sha256['scripts/forest-playtest-candidate.mjs']);assert.equal(sha(await read('benchmarks/npc-forest-v1/cases.json')),original.source.sha256['benchmarks/npc-forest-v1/cases.json']);
assert.equal(original.counts.attempted,11);assert.equal(original.counts.providerFailed,1);assert.equal(original.counts.blocked,1);assert.equal(original.cases[0].turns[2].metrics.outputSummary.referenceIssue,'too-many');assert.equal(original.cases[0].turns[3].status,'blocked');
assert.match(original.cases[2].turns[0].response.reply,/1460/);assert.equal(original.cases[2].turns[0].oracle.overdueMinutes,20);
const retry=reports['borrow-retest'];assert.equal(retry.counts.automaticPassed,1);assert.equal(retry.resume.sourceReportSha256,sha(await read(dir+'/live-01.json')));assert.equal(retry.resume.turnId,'handed-back');assert.equal(retry.cases[0].turns[0].context.knownFacts.tool.condition,70);
const fixed=reports['overdue-retest'];assert.equal(fixed.counts.automaticPassed,4);assert.deepEqual(fixed.cases[0].turns.map(t=>t.context.knownFacts.simpleLoan.overdueMinutes),[20,30,30,30]);assert.deepEqual(fixed.cases[0].turns.map(t=>t.oracle.overdueMinutes),[20,30,30,30]);
const boundary=await json(dir+'/speech-boundaries.json');assert.equal(boundary.confirmedSpeechCommands,15);assert.equal(boundary.externalModelCalls,16);for(const g of boundary.groups)for(const e of g.entries)assert.equal(e.noPhysicalOrObjectiveMemoryChange,true);
for(const platform of ['linux','win32']){const p=await json(dir+'/ci-'+platform+'.json');assert.equal(p.head,index.testedCommit);assert.equal(String(p.runId),String(index.ciRunId));assert.equal(p.platform,platform);assert.deepEqual(p.gameSha256,manifest.gameSha256);for(const [f,h]of Object.entries(p.sourceSha256))assert.equal(sha(await read(f)),h,'CI source: '+f);assert.equal(p.result.verdict,'PASS');assert.equal(p.result.steps.length,6);assert.equal(p.result.browserExecuted,true);assert.equal(p.result.externalModelCalls,0);assert.deepEqual(p.result.remainingLocks,[]);}
const review=await json(dir+'/assistant-review.json');assert.equal(review.reviewer,'assistant');assert.equal(review.humanReview,'pending');assert.deepEqual(review.missingLiveTurns,['borrow-return/next-day']);assert.equal(review.distinctQuestionsWithAcceptedReplies,11);
for(const r of review.reports){const bytes=await read(dir+'/'+r.file);assert.equal(r.sha256,sha(bytes));const data=JSON.parse(bytes);for(const item of r.turns){const row=data.cases.find(c=>c.id===item.case).turns.find(t=>t.id===item.turn);assert.equal(item.replySha256,row.response?sha(Buffer.from(row.response.reply)):null);assert.equal(item.humanReview,'pending');}}
assert.equal(candidate.gates.browser,'verified-linux-and-windows-ci');assert.equal(candidate.gates.realModelLanguage,'sampled-forest-human-review-pending');
console.log(JSON.stringify({status:'verified',candidate:candidate.id,uniqueTests:70,externalModelRequests:16,confirmedSpeechCommands:15,correctedOverdueMinutes:[20,30,30,30],distinctLiveQuestions:11,plannedLiveQuestions:12,missingLiveTurns:review.missingLiveTurns,semanticHumanReview:'pending',browserPlatforms:['linux','win32']}));
