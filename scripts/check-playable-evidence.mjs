import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/playable-batch-20261026';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f)),index=await json(dir+'/index.json');assert.equal(index.parent,'22cc088451899033e67e33a89ca42fb9d8fb86aa');
for(const group of ['sourceSha256','testedSourceSha256','preservedEvidence'])for(const [f,sha] of Object.entries(index[group]))assert.equal(hash(await read(f)),sha,group+': '+f);
for(const [f,r] of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [label,expected] of Object.entries(index.runs)){
 const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,expected.exitCode);assert.equal(r.timedOut,false);assert.equal(r.unconfirmed,false);assert.ok(r.wallMs>0&&r.wallMs<r.hardLimitMs);
 if(expected.tests){const log=(await read(dir+'/'+label+'.txt')).toString();for(const [k,n] of Object.entries(expected.tests))assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+n+'$','m'));}
}
const legacy=await json(dir+'/final-legacy.json');assert.equal(legacy.matches,true);assert.deepEqual(legacy.baseline,legacy.candidate);assert.equal(legacy.candidate.length,5);assert.equal(legacy.parent,index.parent);
const seven=await json(dir+'/final-seven-days.json');assert.equal(seven.status,'passed');assert.deepEqual(seven.seeds.map(s=>s.seed),[7,42,99]);assert.ok(seven.seeds.every(s=>s.tick===1008&&s.fullReplay==='passed'&&s.days.length===7&&s.days.every(d=>d.food>=0&&d.wallet>=0&&d.publicFood>=0)));
const abba=await Promise.all(['A1','B1','B2','A2'].map(s=>json(dir+'/final-abba-'+s+'.json')));assert.ok(abba.flatMap(r=>r.rounds).every(r=>r.bundleSha256===abba[0].rounds[0].bundleSha256));
const journal=await json(dir+'/final-journal.json');assert.deepEqual(journal.samples.map(s=>s.name),['A','B','B','A']);assert.ok(journal.samples.every(s=>s.ms>0));assert.equal(journal.oracleSourceSha256,hash(await read(dir+'/service-commit-before-journal.mjs')));
const plan=await json(dir+'/plan-summary.json');assert.equal(plan.completed,true);assert.equal(plan.counts.planned,8);assert.equal(plan.counts.attempted,0);assert.equal(plan.counts.fixtureFailed,0);assert.equal(plan.counts.blocked,0);assert.ok(plan.cases.every(c=>c.worldReplayAudit==='passed'&&c.turns.every(t=>t.preconditions.every(p=>p.passed))));
for(const [f,sha] of Object.entries(plan.source.sha256))assert.equal(hash(await read(f)),sha,'Plan source: '+f);
const live=await json(dir+'/live-summary.json');assert.ok(live.attempted<=8);assert.equal(live.requestLimit,8);assert.equal(live.independentHumanVerdict,'pending');assert.equal(index.final.browserVisual,'blocked');assert.equal(index.final.fps,'not-measured');
const staticChecks=await json(dir+'/static-checks.json');assert.equal(staticChecks.passed,true);assert.ok(staticChecks.checks.every(c=>c.exitCode===0));
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,testedSourceFiles:Object.keys(index.testedSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,evidenceFiles:Object.keys(index.evidence).length,legacyCheckpoints:10,sevenDaySeeds:3,distinctTests:index.final.distinctTests,modelAttempts:live.attempted,browserVisual:index.final.browserVisual,fps:index.final.fps}));
