import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/forest-browser-acceptance-20261031';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async file=>{const p=path.resolve(root,file);assert.ok(!path.isAbsolute(file)&&p.startsWith(root));return fs.readFile(p);};
const json=async file=>JSON.parse(await read(file));
const index=await json(dir+'/index.json'),candidate=await verifyForestCandidate(),manifest=await json('docs/runtime/forest-playtest-candidate.json');
assert.equal(candidate.id,'forest-playtest-candidate-2');assert.equal(candidate.gameFiles,192);assert.equal(index.uniqueTests,49);
for(const [file,h]of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),h,'source: '+file);
for(const [file,item]of Object.entries(index.evidence)){assert.equal(path.basename(file),file);const b=await read(dir+'/'+file);assert.equal(b.length,item.bytes);assert.equal(sha(b),item.sha256,file);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const names=new Set();
for(const [label,count]of [['browser-provider-regression',31],['browser-forest-release',15],['browser-event-buffer-final',3]]){
 const m=await json(dir+'/'+label+'.json'),log=(await read(dir+'/'+label+'.txt')).toString();assert.equal(m.exitCode,0);assert.equal(m.timedOut,false);assert.equal(m.unconfirmed,false);
 for(const [k,v]of [['tests',count],['pass',count],['fail',0],['skipped',0],['cancelled',0]])assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));
 const tests=[...log.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>m[1]);if(!tests.length)tests.push(...[...log.matchAll(/^✔ (.+) \([\d.]+ms\)$/gm)].map(m=>m[1]));assert.equal(tests.length,count);
 for(const name of tests){assert.ok(!names.has(name),'duplicate test: '+name);names.add(name);}
}
assert.equal(names.size,49);
assert.equal((await json(dir+'/browser-event-buffer-red.json')).exitCode,1);
assert.match((await read(dir+'/browser-event-buffer-red.txt')).toString(),/other side closed/);
for(const platform of ['linux','win32']){
 const p=await json(dir+'/ci-'+platform+'.json'),r=p.result;assert.equal(p.platform,platform);assert.equal(p.head,index.testedCommit);assert.equal(String(p.runId),String(index.ciRunId));
 assert.deepEqual(p.gameSha256,manifest.gameSha256);for(const [file,h]of Object.entries(p.sourceSha256))assert.equal(sha(await read(file)),h,'CI source: '+file);
 assert.equal(r.verdict,'PASS');assert.equal(r.browserExecuted,true);assert.equal(r.candidateVerified,true);assert.equal(r.externalModelCalls,0);assert.equal(r.steps.length,6);assert.equal(r.screenshots.length,4);
 assert.equal(r.keyboardExit,true);assert.equal(r.mobileLayout.viewport,390);assert.equal(r.mobileLayout.documentWidth,390);assert.ok(r.mobileLayout.buttons.every(b=>b.height>=44&&b.described));
 assert.deepEqual(r.final,{tick:78,rank:4,toolCondition:70});assert.deepEqual(r.remainingLocks,[]);assert.deepEqual(r.cleanupErrors,[]);
 for(const field of ['windowsLauncherExecuted','physicalMobileTested','screenReaderTested','realModelLanguageTested'])assert.equal(r[field],false);
}
assert.equal((await json(dir+'/ci-initial-linux.json')).result.verdict,'FAIL');assert.equal((await json(dir+'/ci-initial-win32.json')).result.verdict,'FAIL');assert.equal((await json(dir+'/ci-second-win32.json')).result.verdict,'FAIL');
const local=await json(dir+'/local-release.json');assert.equal(local.verdict,'PASS');assert.deepEqual(local.remainingLocks,[]);
let attempts=0,input=0,output=0;
for(const label of ['live-work-01','live-gifts-01','live-gifts-02']){
 const b=await read(dir+'/'+label+'.json'),r=JSON.parse(b),complete=await json(dir+'/'+label+'.complete.json'),html=await read(dir+'/'+label+'.html');
 assert.equal(complete.json.sha256,sha(b));assert.equal(complete.json.bytes,b.length);assert.equal(complete.html.sha256,sha(html));assert.equal(complete.html.bytes,html.length);
 assert.equal(r.mode,'live');assert.equal(r.realProviderAttempted,true);assert.equal(r.semanticVerdict,'needs-human-review');assert.equal(r.fixtureVersion,'5');assert.equal(r.cases[0].worldReplayAudit,'passed');attempts+=r.counts.attempted;
 for(const t of r.cases[0].turns){input+=t.metrics?.usage?.inputTokens??0;output+=t.metrics?.usage?.outputTokens??0;}
 if(label==='live-gifts-02'){assert.equal(r.counts.automaticPassed,4);for(const [file,h]of Object.entries(r.source.sha256))assert.equal(sha(await read(file)),h,'live retest: '+file);assert.equal(r.cases[0].turns[1].metrics.memoryRefsIssue,'not-strictly-increasing');}
 if(label==='live-gifts-01'){assert.equal(r.counts.providerFailed,1);assert.equal(r.counts.blocked,2);}
}
assert.equal(attempts,10);assert.equal(input,29867);assert.equal(output,647);
const review=await json(dir+'/language-review.json');assert.equal(review.reviewer,'assistant');assert.equal(review.humanReview,'pending');for(const c of review.cases)assert.equal(c.reportSha256,sha(await read(dir+'/'+c.report)));
assert.equal(candidate.gates.browser,'verified-linux-and-windows-ci');assert.equal(candidate.gates.realModelLanguage,'sampled-fixture5-human-review-pending');
console.log(JSON.stringify({status:'verified',candidate:candidate.id,uniqueTests:49,actualBrowserPlatforms:['linux','win32'],ciRunId:index.ciRunId,externalModelRequests:attempts,humanSemanticReview:'pending',windowsLauncher:'not-run',physicalMobile:'not-run',screenReader:'not-run'}));
