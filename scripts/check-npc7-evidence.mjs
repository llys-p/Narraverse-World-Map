import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url)),directory='docs/evidence/npc7-dialogue-grounding-20261025';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function relative(name){assert.equal(typeof name,'string');assert.ok(!path.isAbsolute(name));const absolute=path.resolve(root,name);assert.ok(absolute.startsWith(root));return absolute;}
const read=name=>fs.readFile(relative(name));
const json=async name=>JSON.parse(await read(name));
const index=await json(directory+'/index.json');
assert.equal(index.schemaVersion,1);assert.equal(index.parent,'356541b27c4a0ef56218c941cecc88244803c7cc');
for(const [name,expected] of Object.entries(index.sourceSha256))assert.equal(sha(await read(name)),expected,'Source SHA mismatch: '+name);
for(const [name,expected] of Object.entries(index.evidence)){
 assert.equal(path.basename(name),name);const bytes=await read(directory+'/'+name);assert.equal(bytes.length,expected.bytes,name);assert.equal(sha(bytes),expected.sha256,name);
}
assert.deepEqual((await fs.readdir(path.join(root,directory))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const result=await json(directory+'/'+index.runs.final.metadata),log=(await read(directory+'/'+index.runs.final.log)).toString('utf8');
assert.equal(result.exitCode,0);assert.equal(result.timedOut,false);assert.equal(result.unconfirmed,false);assert.ok(result.wallMs>0&&result.wallMs<result.hardLimitMs);
assert.ok(result.command.includes('--test'));const tests=result.command.filter(x=>x.endsWith('.test.mjs'));assert.equal(tests.length,6);
for(const name of tests)assert.ok(Object.hasOwn(index.sourceSha256,name),'Unfingerprinted test: '+name);
for(const [key,value] of Object.entries({tests:29,pass:29,fail:0,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
const first=await json(directory+'/'+index.runs.firstFull.metadata);assert.equal(first.exitCode,1);assert.equal(first.timedOut,false);
assert.match((await read(directory+'/'+index.runs.firstFull.log)).toString('utf8'),/^# fail 1$/m);
const planRun=await json(directory+'/'+index.runs.plan.metadata);assert.equal(planRun.exitCode,0);assert.equal(planRun.timedOut,false);
const plan=await json(directory+'/plan-final.json');
assert.equal(plan.completed,true);assert.equal(plan.mode,'plan');assert.equal(plan.realProviderAttempted,false);assert.equal(plan.semanticVerdict,'not-evaluated');
assert.deepEqual(plan.counts,{planned:16,attempted:0,automaticPassed:0,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:16});
assert.equal(plan.cases.length,8);assert.ok(plan.cases.every(c=>c.worldReplayAudit==='passed'));
for(const [name,hash] of Object.entries(plan.source.sha256))assert.equal(hash,index.sourceSha256[name],'Plan source mismatch: '+name);
assert.ok(Object.hasOwn(plan.source.sha256,'runtime/service/npc-dialogue-grounding.mjs'));
assert.ok(Object.hasOwn(plan.source.sha256,'demo-social-language.mjs'));assert.ok(Object.hasOwn(plan.source.sha256,'runtime/core/simulation-clock.mjs'));
for(const row of plan.cases.flatMap(c=>c.turns)){assert.equal(row.context.knownFacts.tickMinutes,10);assert.equal(row.context.knownFacts.identity.selfId,'actor-2');assert.equal(row.humanReview.verdict,'pending');}
const checks=await json(directory+'/static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.passed===true));
// Historical results belong to historical source bytes. Never rewrite their score to match this patch.
const oldDirectory='docs/evidence/npc6-deepseek-continuation-20261024';
const historical=name=>{relative(name);return execFileSync('git',['show',index.parent+':'+name],{cwd:root,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});};
const oldIndexBytes=historical(oldDirectory+'/index.json'),oldIndex=JSON.parse(oldIndexBytes);
assert.equal(sha(await read(oldDirectory+'/index.json')),sha(oldIndexBytes),'Historical index modified');
assert.deepEqual((await fs.readdir(path.join(root,oldDirectory))).sort(),['index.json',...Object.keys(oldIndex.evidence)].sort());
for(const [name,hash] of Object.entries(oldIndex.sourceSha256))assert.equal(sha(historical(name)),hash,'Historical source mismatch: '+name);
for(const [name,meta] of Object.entries(oldIndex.evidence)){
 const current=await read(oldDirectory+'/'+name);assert.equal(sha(current),meta.sha256,'Historical evidence modified: '+name);
 assert.equal(sha(historical(oldDirectory+'/'+name)),meta.sha256);
}
const oldSummary=await read(oldDirectory+'/live-multiturn-summary.json'),old=JSON.parse(oldSummary);
assert.equal(sha(oldSummary),index.historicalLiveSummarySha256);assert.equal(old.counts.automaticPassed,14);assert.equal(old.counts.automaticFailed,2);
assert.equal(old.totalRealModelAttempts,16);assert.equal(old.assistantReview.verdict,'needs-correction');assert.equal(old.assistantReview.humanVerdict,'pending');
assert.equal(index.final.newExternalModelCalls,0);assert.equal(index.final.semanticVerdict,'not-evaluated-after-repair');
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,
 tests:29,planScenarios:8,planTurns:16,newExternalModelCalls:0,historicalModelAttempts:16,historicalAutomaticPassed:14,historicalAutomaticFailed:2,semanticVerdict:index.final.semanticVerdict}));
