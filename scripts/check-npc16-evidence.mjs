import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc16-life-continuity-20261026';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(file){assert.equal(typeof file,'string');assert.ok(!path.isAbsolute(file));const p=path.resolve(root,file);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async file=>JSON.parse(await read(file));
const index=await json(dir+'/index.json');assert.equal(index.parent,'e7bfd1c8c56c943a2ee97cef1288eedd41c29304');
for(const [file,sha] of Object.entries(index.sourceSha256))assert.equal(hash(await read(file)),sha,'Source mismatch: '+file);
for(const [file,sha] of Object.entries(index.testedSourceSha256))assert.equal(hash(await read(file)),sha,'Tested source changed: '+file);
for(const [file,sha] of Object.entries(index.preservedEvidence))assert.equal(hash(await read(file)),sha,'History changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){
 assert.equal(path.basename(file),file);const b=await read(dir+'/'+file);assert.equal(b.length,record.bytes);assert.equal(hash(b),record.sha256);
}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [label,expected] of Object.entries(index.runs)){
 const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,expected.exitCode);assert.equal(r.timedOut,false);assert.equal(r.unconfirmed,false);assert.ok(r.wallMs>0&&r.wallMs<r.hardLimitMs);
 if(expected.tests){const log=(await read(dir+'/'+label+'.txt')).toString();for(const [key,n] of Object.entries(expected.tests))assert.match(log,new RegExp('^(?:# |ℹ )'+key+' '+n+'$','m'));}
}
const plan=await json(dir+'/life-v3-plan-summary.json');assert.equal(plan.completed,true);assert.equal(plan.externalModelCalls,0);assert.equal(plan.semanticVerdict,'not-evaluated');
assert.equal(plan.counts.planned,28);assert.equal(plan.counts.notRun,28);assert.equal(plan.counts.attempted,0);assert.equal(plan.counts.fixtureFailed,0);assert.equal(plan.counts.blocked,0);
assert.equal(plan.cases.length,4);assert.ok(plan.cases.every(c=>c.worldReplayAudit==='passed'&&c.turns.every(t=>t.preconditions.every(x=>x.passed))));
for(const [file,sha] of Object.entries(plan.source.sha256))assert.equal(hash(await read(file)),sha,'Plan source mismatch: '+file);
const suite=await json('benchmarks/npc-life-v3/cases.json');assert.equal(suite.schemaVersion,3);assert.equal(suite.fixtureVersion,'5');assert.deepEqual(suite.cases.map(c=>c.turns.length),[8,8,8,4]);
const legacy=await json(dir+'/legacy.json');assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.equal(legacy.externalModelCalls,0);assert.equal(legacy.baseline.length,5);assert.deepEqual(legacy.baseline,legacy.candidate);
const staticChecks=await json(dir+'/static-checks.json');assert.equal(staticChecks.passed,true);assert.ok(staticChecks.checks.every(x=>x.exitCode===0));assert.deepEqual(staticChecks.worldBusinessDiff,[]);
const baseline=await json('docs/evidence/npc15-dialogue-review-20261026/index.json');assert.equal(baseline.final.distinctTests,105);
const testFiles=new Set();let distinctTests=0;
for(const label of ['npc16-regression-a','npc16-regression-b','npc16-life-v3-controlled']){
 const r=await json(dir+'/'+label+'.json');for(const file of r.command.filter(x=>x.endsWith('.test.mjs'))){assert.ok(!testFiles.has(file),'Duplicate grouped test file');testFiles.add(file);assert.ok(index.sourceSha256[file]);}
 const n=index.runs[label].tests;assert.equal(n.tests,n.pass);assert.equal(n.fail,0);for(const k of ['cancelled','skipped','todo'])assert.equal(n[k],0);distinctTests+=n.tests;
}
assert.equal(testFiles.size,34);assert.equal(distinctTests,113);assert.equal(index.final.distinctTests,113);assert.equal(index.final.newTests,8);assert.equal(index.final.externalModelCalls,0);
assert.equal(index.final.semanticVerdict,'not-evaluated-for-npc16');assert.equal(index.final.independentHumanVerdict,'pending');
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,testedSourceFiles:Object.keys(index.testedSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,evidenceFiles:Object.keys(index.evidence).length,distinctTests,newTests:8,lifeV3Cases:4,lifeV3Turns:28,legacyCheckpoints:10,externalModelCalls:0,semanticVerdict:index.final.semanticVerdict}));
