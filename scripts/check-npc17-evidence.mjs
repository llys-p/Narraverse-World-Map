import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc17-report-integrity-20261026';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f));
const index=await json(dir+'/index.json');assert.equal(index.parent,'5f2b0c9f5fdaca3c1c8fdc39616a910d80821af9');
for(const kind of ['sourceSha256','testedSourceSha256','preservedEvidence'])for(const [f,h] of Object.entries(index[kind]))assert.equal(sha(await read(f)),h,kind+': '+f);
for(const [f,r] of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [label,e] of Object.entries(index.runs)){
 const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,e.exitCode);assert.equal(r.timedOut,false);assert.equal(r.unconfirmed,false);assert.ok(r.wallMs>0&&r.wallMs<r.hardLimitMs);
 if(e.tests){const log=(await read(dir+'/'+label+'.txt')).toString();for(const [k,n] of Object.entries(e.tests))assert.match(log,new RegExp('^# '+k+' '+n+'$','m'));}
}
let count=0;const tests=new Set();for(const label of ['npc17-targeted','npc17-life-regression']){
 const n=index.runs[label].tests;count+=n.tests;assert.equal(n.tests,n.pass);for(const k of ['fail','cancelled','skipped','todo'])assert.equal(n[k],0);
 for(const f of (await json(dir+'/'+label+'.json')).command.filter(f=>f.endsWith('.test.mjs'))){assert.ok(!tests.has(f));tests.add(f);assert.ok(index.sourceSha256[f]);}
}
assert.equal(count,41);assert.equal(tests.size,12);assert.equal(index.final.newTests,10);assert.equal(index.final.externalModelCalls,0);
const flow=await json(dir+'/flow-summary.json');assert.equal(flow.status,'verified');assert.equal(flow.externalModelCalls,0);assert.equal(flow.completionProtocol,1);assert.equal(flow.counts.notRun,28);assert.equal(flow.counts.attempted,0);assert.equal(flow.counts.fixtureFailed,0);assert.equal(flow.counts.blocked,0);
assert.equal(flow.templateRows,28);assert.equal(flow.templatePending,28);assert.equal(flow.sourceReportUnchanged,true);assert.equal(flow.semanticVerdict,'not-evaluated');assert.equal(flow.independentHumanVerdict,'not-verified');
assert.equal(flow.fileIntegrity.status,'files-verified');assert.equal(flow.reviewedFileIntegrity.status,'files-verified');assert.ok(flow.cases.every(c=>c.worldReplayAudit==='passed'&&c.turns.every(t=>t.preconditions.every(x=>x.passed))));
for(const [f,h] of Object.entries(flow.source.sha256))assert.equal(sha(await read(f)),h,'Final flow source: '+f);
const original=await json('docs/evidence/npc16-life-continuity-20261026/life-v3-intermediate-artifact-summary.json'),recheck=await json(dir+'/npc16-artifact-recheck.json');assert.equal(recheck.externalModelCalls,0);assert.equal(recheck.records[0].sha256,original.rawReportSha256);assert.equal(recheck.records[0].completed,false);assert.equal(recheck.records[0].notRun,14);assert.equal(recheck.records[0].rootCause,'not-established');
const stat=await json(dir+'/static-checks.json');assert.equal(stat.passed,true);assert.ok(stat.checks.every(x=>x.exitCode===0));assert.deepEqual(stat.worldProductionDiff,[]);
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,testedSourceFiles:Object.keys(index.testedSourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,distinctTests:count,newTests:10,flowTurns:28,worldReplays:4,externalModelCalls:0,semanticVerdict:'not-evaluated'}));
