import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/forest-playtest-closeout-20261030';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(file){const p=path.resolve(root,file);assert.ok(!path.isAbsolute(file)&&p.startsWith(root));return fs.readFile(p);}
const json=async file=>JSON.parse(await read(file)),index=await json(dir+'/index.json'),candidate=await verifyForestCandidate();
assert.equal(index.parent,'acdc4afac35c2db99a7eacb7cc035d442657de66');assert.equal(candidate.gameFiles,192);assert.equal(candidate.gameEntry,'Start-Forest-Journey.cmd');
assert.deepEqual(candidate.gates,{serviceRecovery:'verified',browser:'blocked-missing-executable',windowsLauncher:'not-run',physicalMobile:'not-run',screenReader:'not-run',realModelLanguage:'not-run'});
assert.deepEqual(index.gameplayDiff,[]);assert.equal(index.externalModelCalls,0);
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [file,hash]of Object.entries(index[group]))assert.equal(sha(await read(file)),hash,group+': '+file);
for(const [file,item]of Object.entries(index.evidence)){assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256,file);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const names=new Set(),measurements=[];
for(const [label,count]of [['forest-closeout-recovery',3],['forest-closeout-preflight-release',3],['forest-closeout-regression',16]]){
 const m=await json(dir+'/'+label+'.json'),log=(await read(dir+'/'+label+'.txt')).toString();assert.equal(m.exitCode,0);assert.equal(m.timedOut,false);assert.equal(m.unconfirmed,false);
 for(const [key,value]of [['tests',count],['pass',count],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
 const tests=[...log.matchAll(/^ok \d+ - (.*)$/gm)];assert.equal(tests.length,count);for(const m of tests){assert.ok(!names.has(m[1]));names.add(m[1]);}
 measurements.push(...log.split('\n').filter(l=>l.startsWith('# {"measurement"')).map(l=>JSON.parse(l.slice(2))));
}
assert.equal(names.size,22);assert.equal(index.uniqueTests,22);
const lost=measurements.find(r=>r.measurement==='forest-closeout-lost-response'),disconnect=measurements.find(r=>r.measurement==='forest-closeout-disconnect'),overdue=measurements.find(r=>r.measurement==='forest-closeout-overdue');
for(const r of [lost,disconnect,overdue]){assert.equal(r.fixture,8);assert.equal(r.externalModelCalls,0);assert.equal(r.browserRendered,false);}
assert.equal(lost.harvestCommits,1);assert.equal(lost.receiptDeliveries,1);for(const key of ['identicalRetryBytes','blockedSecondIntent','reopenedWorker','filesPreserved'])assert.equal(lost[key],true);
for(const key of ['actualSse','noOfflineTicks','noReconnectCatchup','explicitResume','returnedLoan','chapterComplete','reopenedCompletedWorld'])assert.equal(disconnect[key],true);
assert.equal(overdue.overdueMemories,1);assert.equal(overdue.returnMemories,1);assert.equal(overdue.taskStillFailed,true);assert.equal(overdue.relationshipBreachPreserved,true);
const b=await json(dir+'/browser-release.json'),m=await json(dir+'/forest-closeout-browser-release.json');assert.equal(m.exitCode,2);assert.equal(m.timedOut,false);assert.equal(b.verdict,'BLOCKED');assert.equal(b.browserExecuted,false);assert.equal(b.startedService,false);assert.equal(b.candidateVerified,true);assert.equal(b.candidateGameFiles,192);assert.equal(b.externalModelCalls,0);assert.deepEqual(b.requests,[]);assert.deepEqual(b.remainingLocks,[]);assert.deepEqual(b.cleanupErrors,[]);
const parentMeta=await json(dir+'/forest-closeout-parent.json');assert.equal(parentMeta.exitCode,0);assert.equal(JSON.parse((await read(dir+'/forest-closeout-parent.txt')).toString()).uniqueTests,35);
const checks=await json(dir+'/static-checks.json');assert.equal(checks.diffCheck,true);assert.equal(checks.credentialsFound,false);assert.equal(checks.protectedWorktreesUnchanged,true);
console.log(JSON.stringify({status:'verified',candidate:candidate.id,frozenGameFiles:192,uniqueTests:22,recoveryRoutes:3,browser:'BLOCKED',windows:'not-run',realModelLanguage:'not-run',externalModelCalls:0}));
