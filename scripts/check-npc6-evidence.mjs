import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory='docs/evidence/npc6-deepseek-continuation-20261024';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function read(relative){
 assert.equal(typeof relative,'string');assert.ok(!path.isAbsolute(relative));
 const resolved=path.resolve(root,relative);assert.ok(resolved.startsWith(root));
 return fs.readFile(resolved);
}
const json=async relative=>JSON.parse(await read(relative));
const index=await json(directory+'/index.json');
assert.equal(index.schemaVersion,1);
assert.equal(index.parent,'2b66d0451e669c0847fa9e306f1cbdc344b30ef8');
assert.ok(Object.keys(index.sourceSha256).length>0);
for(const [name,expected] of Object.entries(index.sourceSha256))assert.equal(sha(await read(name)),expected,'Source SHA mismatch: '+name);
for(const [name,expected] of Object.entries(index.evidence)){
 assert.equal(path.basename(name),name);const bytes=await read(directory+'/'+name);
 assert.equal(bytes.length,expected.bytes,'Evidence size mismatch: '+name);assert.equal(sha(bytes),expected.sha256,'Evidence SHA mismatch: '+name);
}
assert.deepEqual((await fs.readdir(path.join(root,directory))).sort(),['index.json',...Object.keys(index.evidence)].sort(),'Unlisted or missing evidence');
for(const phase of ['tests','plan']){
 const metadata=await json(directory+'/'+index.runs[phase].metadata);
 assert.equal(metadata.exitCode,0);assert.equal(metadata.timedOut,false);assert.equal(metadata.unconfirmed,false);
 assert.ok(metadata.wallMs>0&&metadata.wallMs<metadata.hardLimitMs);
}
const tests=await json(directory+'/'+index.runs.tests.metadata);
assert.equal(tests.command[0],'node');assert.ok(tests.command.includes('--test'));
const testFiles=tests.command.filter(s=>s.endsWith('.test.mjs'));assert.equal(testFiles.length,4);
for(const name of testFiles)assert.ok(Object.hasOwn(index.sourceSha256,name),'Unfingerprinted test: '+name);
const log=(await read(directory+'/'+index.runs.tests.log)).toString('utf8');
for(const [key,value] of Object.entries({tests:17,pass:17,fail:0,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^ℹ '+key+' '+value+'$','m'));
assert.equal(index.final.distinctTests,17);
const live=index.liveResult?await json(directory+'/'+index.liveResult):null;
assert.equal(index.final.realModelCalls,live?1:0);
if(live){
 assert.equal(live.requestLimit,1);assert.equal(live.networkAttempts,1);assert.equal(live.httpStatus,200);
 assert.equal(live.case,'unsupported');assert.equal(live.model,'deepseek-flash');assert.equal(live.thinking,'disabled');
 assert.deepEqual(live.counts,{planned:1,attempted:1,automaticPassed:1,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:0});
 assert.equal(live.worldReplayAudit,'passed');assert.equal(live.semanticVerdict,'needs-human-review');
 assert.equal(live.assistantReview.humanVerdict,'pending');assert.ok(live.checks.every(c=>c.passed));
 assert.equal(live.metrics.usage.inputTokens+live.metrics.usage.outputTokens,live.metrics.usage.totalTokens);
 for(const [name,hash] of Object.entries(live.sourceSha256))assert.equal(hash,index.sourceSha256[name],'Live source mismatch: '+name);
 const liveStatic=await json(directory+'/static-live-checks.json');assert.equal(liveStatic.passed,true);
 assert.ok(liveStatic.checks.length>=2&&liveStatic.checks.every(c=>c.exitCode===0));
}
const plan=await json(directory+'/plan-final.json');
assert.equal(plan.mode,'plan');assert.equal(plan.completed,true);assert.equal(plan.realProviderAttempted,false);
assert.equal(plan.semanticVerdict,'not-evaluated');assert.equal(plan.provider,null);
assert.deepEqual(plan.counts,{planned:16,attempted:0,automaticPassed:0,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:16});
assert.equal(plan.cases.length,8);assert.ok(plan.cases.every(c=>c.worldReplayAudit==='passed'));
for(const [name,hash] of Object.entries(plan.source.sha256))assert.equal(hash,index.sourceSha256[name],'Plan source mismatch: '+name);
const checks=await json(directory+'/static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.length>=4);
assert.ok(checks.checks.every(c=>c.exitCode===0));
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,
 tests:17,planScenarios:8,planTurns:16,planModelAttempts:0,realModelAttempts:live?.networkAttempts??0,semanticVerdict:live?.semanticVerdict??plan.semanticVerdict}));
