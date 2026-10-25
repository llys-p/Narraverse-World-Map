import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url)),directory='docs/evidence/npc8-memory-updates-20261025';
const parent='c14a07e5a6c93e59d699adcb37fdb8577110b194',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function relative(name){assert.equal(typeof name,'string');assert.ok(!path.isAbsolute(name));const absolute=path.resolve(root,name);assert.ok(absolute.startsWith(root));return absolute;}
const read=name=>fs.readFile(relative(name)),json=async name=>JSON.parse(await read(name));
const index=await json(directory+'/index.json');assert.equal(index.schemaVersion,1);assert.equal(index.parent,parent);
assert.equal(index.final.distinctTests,54);assert.equal(index.final.newTests,8);assert.equal(index.final.newExternalModelCalls,0);assert.equal(index.final.semanticVerdict,'not-evaluated-for-npc8');
for(const [name,expected] of Object.entries(index.sourceSha256))assert.equal(sha(await read(name)),expected,'Source changed: '+name);
for(const [name,expected] of Object.entries(index.evidence)){
 assert.equal(path.basename(name),name);const bytes=await read(directory+'/'+name);assert.equal(bytes.length,expected.bytes,name);assert.equal(sha(bytes),expected.sha256,name);
}
assert.deepEqual((await fs.readdir(path.join(root,directory))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [name,run] of Object.entries(index.runs)){
 const result=await json(directory+'/'+run.metadata);assert.equal(result.exitCode,name==='fullWindowRed'?1:0);assert.equal(result.timedOut,false);assert.equal(result.unconfirmed,false);
 assert.ok(result.wallMs>0&&result.wallMs<result.hardLimitMs);assert.ok(index.evidence[run.log]);
}
const final=await json(directory+'/'+index.runs.final.metadata),log=(await read(directory+'/'+index.runs.final.log)).toString('utf8');
const tests=final.command.filter(x=>x.endsWith('.test.mjs'));assert.equal(tests.length,11);
for(const test of tests)assert.ok(Object.hasOwn(index.sourceSha256,test),'Unfingerprinted test: '+test);
for(const [key,value] of Object.entries({tests:54,pass:54,fail:0,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
const red=(await read(directory+'/'+index.runs.fullWindowRed.log)).toString('utf8');
assert.match(red,/^# fail 1$/m);assert.match(red,/A new lower-importance repair must not be evicted before archiving/);
const compatibility=await json(directory+'/legacy-comparison.json');assert.equal(compatibility.parent,parent);assert.equal(compatibility.matches,true);
assert.deepEqual(compatibility.candidate,compatibility.baseline);assert.deepEqual(compatibility.candidate.map(c=>c.fixtureVersion),['1','2','3','4']);
for(const c of compatibility.candidate){assert.equal(c.checkpoints.length,2);assert.ok(c.commands>0);for(const p of c.checkpoints)assert.match(p.sha256,/^[a-f0-9]{64}$/);}
const plan=await json(directory+'/legacy-plan-summary.json');assert.equal(plan.mode,'plan');assert.equal(plan.semanticVerdict,'not-evaluated');
assert.deepEqual(plan.counts,{planned:16,attempted:0,automaticPassed:0,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:16});
assert.equal(plan.cases.length,8);for(const c of plan.cases)assert.equal(c.worldReplayAudit,'passed');
for(const [name,hash] of Object.entries(plan.source.sha256))assert.equal(hash,index.sourceSha256[name],'Plan source changed: '+name);
assert.ok(plan.source.sha256['runtime/core/npc-memory.mjs']);
const checks=await json(directory+'/static-checks.json');assert.equal(checks.diffWhitespacePassed,true);assert.equal(checks.credentialScanMatches,0);
for(const name of checks.nodeSyntaxPassed)assert.ok(index.sourceSha256[name],'Unfingerprinted syntax input: '+name);
// Preserve the old failures as historical facts. Their source-bound checkers belong to their old commits.
const historicalDirectories=['docs/evidence/npc6-deepseek-continuation-20261024','docs/evidence/npc7-dialogue-grounding-20261025','docs/evidence/npc7-retest-20261025'];
const historicalFiles=execFileSync('git',['ls-tree','-r','--name-only',parent,'--',...historicalDirectories],{cwd:root,encoding:'utf8'}).trim().split('\n');
assert.deepEqual(Object.keys(index.preservedEvidence).sort(),historicalFiles.sort());
for(const [name,hash] of Object.entries(index.preservedEvidence)){
 assert.equal(sha(await read(name)),hash,'Historical evidence modified: '+name);
 assert.equal(sha(execFileSync('git',['show',parent+':'+name],{cwd:root,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']})),hash);
}
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,
 tests:54,newTests:8,legacyFixtures:4,legacyBundleCheckpoints:8,newExternalModelCalls:0,semanticVerdict:index.final.semanticVerdict}));
