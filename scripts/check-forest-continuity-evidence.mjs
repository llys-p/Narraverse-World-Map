import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';
import {verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/forest-continuity-20261103',hash=b=>createHash('sha256').update(b).digest('hex');
const read=async f=>{const p=path.resolve(root,f);assert.ok(!path.isAbsolute(f)&&p.startsWith(root));return fs.readFile(p);},json=async f=>JSON.parse(await read(f));
const index=await json(dir+'/index.json'),candidate=await verifyForestCandidate(),manifest=await json('docs/runtime/forest-playtest-candidate.json');
assert.equal(index.testedCommit,'eab73a6318d047de95f4792a7fc71ee1f952d6b7');assert.equal(candidate.id,'forest-playtest-candidate-4');
for(const [f,h]of Object.entries(index.sourceSha256))assert.equal(hash(await read(f)),h,'source '+f);
for(const [f,d]of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,d.bytes,f);assert.equal(hash(b),d.sha256,f);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const log=(await read(dir+'/regression.txt')).toString(),meta=await json(dir+'/regression.meta.json');assert.equal(meta.exitCode,0);assert.equal(meta.timedOut,false);
for(const [k,v]of [['tests',74],['pass',74],['fail',0],['cancelled',0],['skipped',0]])assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));
const names=[...log.matchAll(/^✔ (.+) \([\d.]+ms\)$/gm)].map(m=>m[1]);assert.equal(names.length,74);assert.equal(new Set(names).size,74);
let controlledTurns=0,attempted=0;
for(const name of ['controlled-borrow-return','controlled-witness-denial','controlled-overdue-denial','recovery-unavailable','recovery-unavailable-retry']){
 await verifyDialogueReportFiles(path.join(root,dir,name+'.json'));const r=await json(dir+'/'+name+'.json');assert.equal(r.completed,true);assert.equal(r.suiteId,'npc-forest-continuity-v2');assert.equal(r.fixtureVersion,'8');assert.equal(r.source.baseCommit,index.testedCommit);
 for(const [f,h]of Object.entries(r.source.sha256))assert.equal(hash(await read(f)),h,name+' source '+f);
 assert.equal(r.cases.length,1);const c=r.cases[0];assert.equal(c.worldReplayAudit,'passed');assert.deepEqual(c.remainingLocks,[]);
 for(const reopen of c.reopens){assert.equal(reopen.sameFiveProjections,true);assert.equal(reopen.noExtraCommit,true);assert.equal(reopen.committedDialogueRetry,true);}
 if(name.startsWith('controlled-')){
  assert.equal(r.mode,'controlled-test');assert.equal(r.externalModelCalls,0);assert.equal(r.counts.automaticPassed,4);assert.equal(r.semanticVerdict,'not-evaluated');controlledTurns+=r.counts.automaticPassed;
  if(c.id==='borrow-return'){assert.equal(c.turns.at(-1).id,'next-day');assert.equal(c.turns.at(-1).context.knownFacts.tool.holder,'self');assert.equal(c.turns.at(-1).context.knownFacts.tool.condition,70);}
  if(c.id==='witness-denial')for(const t of c.turns.slice(2))assert.equal(t.context.knownFacts.tool.condition,40);
  if(c.id==='overdue-denial'){
   assert.equal(r.continuation.sourceUnchanged,true);assert.equal(r.continuation.copiedToFreshWorld,true);assert.equal(r.continuation.originalReplies.length,4);
   assert.equal(r.continuation.sourceReportSha256,hash(await read('docs/evidence/forest-dialogue-20261101/live-01.json')));
   assert.ok(c.turns[0].context.conversation.some(t=>/1460/.test(t.reply)));
   for(const t of c.turns.filter(t=>t.id!=='topic-switch')){assert.equal(t.context.knownFacts.simpleLoan.loanMinutes,1440);assert.equal(t.context.knownFacts.simpleLoan.borrowedMinutes,1470);assert.equal(t.context.knownFacts.simpleLoan.overdueMinutes,30);assert.equal(t.oracle.overdueMinutes,30);}
  }
 }else{
  assert.equal(r.mode,'live');assert.equal(r.provider.model,'deepseek-flash');assert.equal(r.externalModelCalls,1);assert.equal(r.counts.providerFailed,1);assert.equal(r.counts.blocked,3);assert.equal(r.counts.automaticPassed,0);attempted+=r.externalModelCalls;
  assert.equal(c.turns[0].metrics.httpStatus,503);assert.equal(c.turns[0].metrics.usage,null);assert.equal(c.turns[0].response,null);assert.equal(c.turns[0].error.error.code,'MODEL_UNAVAILABLE');assert.equal(c.turns[0].checks.find(k=>k.name==='previewDoesNotCommit').passed,true);
 }
}
assert.equal(controlledTurns,12);assert.equal(attempted,2);
for(const platform of ['linux','win32']){const p=await json(dir+'/ci-'+platform+'.json');assert.equal(p.head,index.testedCommit);assert.equal(String(p.runId),'41587465354');assert.equal(p.platform,platform);assert.deepEqual(p.gameSha256,manifest.gameSha256);for(const [f,h]of Object.entries(p.sourceSha256))assert.equal(hash(await read(f)),h);assert.equal(p.result.verdict,'PASS');assert.equal(p.result.steps.length,6);assert.equal(p.result.externalModelCalls,0);assert.deepEqual(p.result.remainingLocks,[]);}
const prior=await json(dir+'/maintenance-observations.json');assert.equal(prior.notOriginalReport,true);assert.equal(prior.modelRequestsObservedBeforeMaintenance,20);assert.equal(prior.humanReview,'pending');assert.ok(prior.missing.length>0);
assert.equal(index.status,'recovery-model-service-unavailable');assert.equal(index.totalObservedExternalAttempts,22);assert.equal(candidate.gates.realModelLanguage,'observed-before-maintenance-recovery-blocked');
console.log(JSON.stringify({status:'evidence-verified-with-open-language-gate',candidate:candidate.id,uniqueTests:74,controlledTurns:12,restoredLiveAttempts:2,restoredLiveReplies:0,providerHttpStatus:503,priorLiveObservations:20,priorOriginalReportsAvailable:false,semanticHumanReview:'pending',browserPlatforms:['linux','win32']}));
