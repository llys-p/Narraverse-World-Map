import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';
import {verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/forest-dialogue-recovery-20261105';
const read=f=>fs.readFile(path.join(root,f)),json=async f=>JSON.parse(await read(f)),hash=b=>createHash('sha256').update(b).digest('hex');
const evidence=f=>dir+'/'+f,manifest=await json('docs/runtime/forest-playtest-candidate.json');
const index=await json(evidence('index.json')),review=await json(evidence('assistant-review.json'));
await verifyForestCandidate();
assert.equal(index.candidate,manifest.id);assert.match(index.testedCommit,/^[a-f0-9]{40}$/);
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [file,d] of Object.entries(index.evidence)){
 assert.equal(path.basename(file),file);const b=await read(evidence(file));assert.equal(hash(b),d.sha256,file);assert.equal(b.length,d.bytes,file);
}
async function sources(entries){for(const [f,h] of Object.entries(entries)){assert.ok(!path.isAbsolute(f)&&!f.includes('\\')&&f.split('/').every(p=>p&&p!=='.'&&p!=='..'));assert.equal(hash(await read(f)),h,f);}}
await sources(index.regressionSourceSha256);
const log=(await read(evidence('regression.txt'))).toString(),meta=await json(evidence('regression.meta.json'));
assert.equal(meta.exitCode,0);assert.equal(meta.timedOut,false);
for(const [k,v] of [['tests',77],['pass',77],['fail',0],['cancelled',0],['skipped',0]])assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));
const names=[...log.matchAll(/^✔ (.+) \([\d.]+ms\)$/gm)].map(m=>m[1]);assert.equal(names.length,77);assert.equal(new Set(names).size,77);
const baseline='docs/evidence/forest-language-recovery-20261103/baseline-borrow.json';
await verifyDialogueReportFiles(path.join(root,baseline));assert.equal(hash(await read(baseline)),index.baselineSha256);
const previous=await json(baseline),old=previous.cases[0].turns.find(t=>t.id==='claimed-return');
assert.equal(previous.externalModelCalls,4);assert.equal(old.oracle.asset.holderId,'actor-4');assert.equal(hash(old.response.reply),review.baseline.replySha256);
const reviewed=new Map(review.turns.map(t=>[t.caseId+'/'+t.turnId,t])),counts={externalCalls:0,replies:0,automaticPassed:0};
assert.equal(review.humanReview,'pending');assert.equal(reviewed.size,review.turns.length);
for(const caseId of index.httpCases){
 const file=evidence('live-'+caseId+'.json');await verifyDialogueReportFiles(path.join(root,file));const r=await json(file);
 assert.equal(r.source.baseCommit,index.testedCommit);assert.equal(r.source.workingTreeDirty,false);
 for(const [f,h] of Object.entries(manifest.gameSha256))assert.equal(r.source.sha256[f],h);
 await sources(r.source.sha256);assert.equal(r.mode,'live');assert.equal(r.provider.model,'deepseek-flash');assert.equal(r.provider.thinking,'disabled');
 assert.equal(r.semanticVerdict,'needs-human-review');assert.equal(r.cases.length,1);assert.equal(r.requestLimit,4);
 const c=r.cases[0];assert.equal(c.id,caseId);assert.equal(c.worldReplayAudit,'passed');assert.deepEqual(c.remainingLocks,[]);
 assert.ok(c.reopens.length>0);
 for(const reopen of c.reopens){assert.equal(reopen.sameFiveProjections,true);assert.equal(reopen.noExtraCommit,true);assert.equal(reopen.committedDialogueRetry,true);}
 counts.externalCalls+=r.externalModelCalls;counts.automaticPassed+=r.counts.automaticPassed;
 for(const t of c.turns){
  assert.equal(t.humanReview,'pending');if(!t.response)continue;counts.replies++;
  const key=caseId+'/'+t.id,entry=reviewed.get(key);assert.ok(entry,key);assert.equal(hash(t.response.reply),entry.replySha256,key);reviewed.delete(key);
  assert.equal(t.checks.find(k=>k.name==='previewDoesNotCommit')?.passed,true);
  assert.equal(t.checks.find(k=>k.name==='speechDoesNotAlterActionsOrObjectiveMemory')?.passed,true);
 }
 if(c.id==='overdue-denial'){
  assert.equal(r.continuation.sourceUnchanged,true);assert.equal(r.continuation.copiedToFreshWorld,true);
  assert.equal(r.continuation.sourceReportSha256,hash(await read('docs/evidence/forest-dialogue-20261101/live-01.json')));
 }
}
assert.equal(reviewed.size,0);assert.deepEqual(counts,index.httpCounts);
for(const platform of ['linux','win32']){
 const c=await json(evidence('ci-'+platform+'.json'));assert.equal(c.platform,platform);assert.equal(c.head,index.testedCommit);assert.equal(String(c.runId),index.ciRun);
 assert.deepEqual(c.gameSha256,manifest.gameSha256);await sources(c.sourceSha256);
 assert.equal(c.result.verdict,'PASS');assert.equal(c.result.steps.length,6);assert.equal(c.result.externalModelCalls,0);assert.deepEqual(c.result.remainingLocks,[]);
}
for(const mode of ['controlled','live']){
 const b=await json(evidence('browser-'+mode+'.json'));assert.deepEqual(b.source.gameSha256,manifest.gameSha256);await sources(b.source.scriptSha256);
 if(mode==='live'){assert.equal(b.source.baseCommit,index.testedCommit);assert.equal(b.source.workingTreeDirty,false);assert.equal(b.humanReview,'pending');assert.equal(b.verdict,index.liveBrowserVerdict);assert.equal(b.externalModelCalls,index.liveBrowserCalls);assert.equal(hash(b.reply),review.browser.replySha256);}
 else{assert.equal(b.externalModelCalls,0);assert.equal(b.verdict,'PASS');}
 if(b.verdict==='PASS'){assert.deepEqual(b.steps,['preview-read-only','speech-only','separately-confirmed-repair','same-history-after-reopen']);assert.deepEqual(b.condition,{before:60,after:80});assert.deepEqual(b.remainingLocks,[]);}
}
console.log(JSON.stringify({status:'evidence-verified',candidate:manifest.id,tests:77,http:counts,liveBrowser:index.liveBrowserVerdict,browserPlatforms:['linux','win32'],humanReview:review.humanReview}));
