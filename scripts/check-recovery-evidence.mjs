import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/playable-recovery-dialogue-20261026';const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f)),index=await json(dir+'/index.json');assert.equal(index.parent,'edd8624623bb985555920d36226e0b0b499c59f1');
for(const group of ['sourceSha256','testedSourceSha256','preservedEvidence'])for(const [f,sha] of Object.entries(index[group]))assert.equal(hash(await read(f)),sha,group+': '+f);
for(const [f,r] of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [label,expected] of Object.entries(index.runs)){
 const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,expected.exitCode);assert.equal(r.timedOut,false);assert.equal(r.unconfirmed,false);assert.ok(r.wallMs>0&&r.wallMs<r.hardLimitMs);
 if(expected.tests){const log=(await read(dir+'/'+label+'.txt')).toString();for(const [k,n] of Object.entries(expected.tests))assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+n+'$','m'));}
}
const worlds=await json(dir+'/worlds.json');assert.equal(worlds.parent,index.parent);assert.equal(worlds.matches,true);assert.deepEqual(worlds.baseline,worlds.candidate);assert.equal(worlds.candidate.length,6);assert.ok(worlds.candidate.every(w=>w.checkpoints.length===2));
const abba=await Promise.all(['A1','B1','B2','A2'].map(n=>json(dir+'/abba-'+n+'.json')));assert.ok(abba.every(r=>r.tick===1008&&r.seed===42&&r.fullReplay==='passed'&&r.bundleSha256===abba[0].bundleSha256&&r.externalModelCalls===0));
const plan=await json(dir+'/plan-summary.json');assert.equal(plan.completed,true);assert.equal(plan.counts.planned,8);assert.equal(plan.counts.attempted,0);assert.equal(plan.counts.fixtureFailed,0);assert.equal(plan.counts.blocked,0);assert.ok(plan.cases.every(c=>c.worldReplayAudit==='passed'&&c.turns.every(t=>t.preconditions.every(p=>p.passed))));
for(const [f,sha] of Object.entries(plan.source.sha256))assert.equal(hash(await read(f)),sha,'Plan source: '+f);
const checks=await json(dir+'/static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));
const titles=new Set();for(const label of index.final.acceptedTestRuns){const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,0);const log=(await read(dir+'/'+label+'.txt')).toString();for(const m of log.matchAll(/^(?:✔ |ok \d+ - )(.+?) \([\d.]+ms\)$|^ok \d+ - (.+)$/gm))titles.add(m[1]??m[2]);}
assert.equal(titles.size,index.final.distinctTests);assert.equal(index.final.externalModelCalls,0);assert.equal(index.final.realLanguage,'not-retested');assert.equal(index.final.browserVisual,'blocked');
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,testedSourceFiles:Object.keys(index.testedSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,evidenceFiles:Object.keys(index.evidence).length,distinctTests:titles.size,newTests:4,worldCheckpoints:12,sevenDayComparisons:4,externalModelCalls:0,realLanguage:index.final.realLanguage,browserVisual:index.final.browserVisual}));
