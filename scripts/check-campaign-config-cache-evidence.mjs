import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/campaign-config-cache-20261027';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f)),index=await json(dir+'/index.json');
assert.equal(index.parent,'2ae8c46094da9b12f14c58cd58468c0edd84b61d');
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [f,sha]of Object.entries(index[group]))assert.equal(hash(await read(f)),sha,group+': '+f);
for(const [f,r]of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
assert.deepEqual(index.productionDiff,['runtime/core/society.mjs']);
const parent=(await read(dir+'/society.parent.source.txt')).toString(),source=(await read('runtime/core/society.mjs')).toString(),patch=await json(dir+'/source-change.json');
let reconstructed=source;for(const step of patch.reverse){assert.equal(reconstructed.split(step.from).length,2);reconstructed=reconstructed.replace(step.from,step.to);}assert.equal(reconstructed,parent);
assert.equal(hash(Buffer.from(parent)),'6e9a64856df333938330c2ba63c63a4d3904da88e9c332bbed6aaac5a27b737d');
for(const [label,counts]of Object.entries(index.runs)){
 const meta=await json(dir+'/'+label+'.json');assert.equal(meta.exitCode,0);assert.equal(meta.timedOut,false);assert.equal(meta.unconfirmed,false);assert.ok(meta.wallMs>0&&meta.wallMs<meta.hardLimitMs);
 const log=(await read(dir+'/'+label+'.txt')).toString();for(const [k,v]of Object.entries(counts))assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));
}
const core=await Promise.all(['a1','b1','b2','a2'].map(n=>json(dir+'/'+n+'.json')));
for(const r of core){assert.equal(r.tick,1008);assert.equal(r.bundleSha256,core[0].bundleSha256);assert.equal(r.bytes,core[0].bytes);assert.equal(r.fullReplay,'passed');assert.equal(r.externalModelCalls,0);assert.ok(r.cpu.simulateMs>0&&r.cpu.auditMs>0);}
const report=await json(dir+'/performance-summary.json');
for(const key of ['simulateMs','auditMs']){
 assert.ok(Math.abs(report.core[key].parentMeanMs-(core[0][key]+core[3][key])/2)<1e-6);
 assert.ok(Math.abs(report.core[key].candidateMeanMs-(core[1][key]+core[2][key])/2)<1e-6);
}
const isolated=await Promise.all(['society-parent','society-candidate'].map(n=>json(dir+'/'+n+'.json')));
assert.equal(isolated[0].worldSha256,isolated[1].worldSha256);assert.equal(isolated[0].sourceSha256,hash(Buffer.from(parent)));assert.equal(isolated[1].sourceSha256,hash(Buffer.from(source)));for(const r of isolated)assert.equal(r.validations,300);
const http=await Promise.all(['parent','candidate'].map(async n=>JSON.parse((await read(dir+'/config-cache-http-'+n+'.txt')).toString().split('\n').find(l=>l.startsWith('{"measurement"')))));
assert.deepEqual(http[0].finalFiles,http[1].finalFiles);assert.equal(http[0].finalProjectionSha256,http[1].finalProjectionSha256);for(const h of http){assert.equal(h.tick,1015);assert.equal(h.realModelCalls,0);assert.deepEqual(h.samples.map(s=>s.durationTicks),[1008,0,0,1,6]);}
const names=new Set();for(const label of index.acceptedTestRuns)for(const m of (await read(dir+'/'+label+'.txt')).toString().matchAll(/^✔ (.+?) \([\d.]+ms\)$/gm))names.add(m[1]);assert.equal(names.size,index.distinctTests);
assert.equal(index.externalModelCalls,0);assert.equal(index.visualFeedback,'not-measured');
console.log(JSON.stringify({status:'verified',distinctTests:names.size,productionFiles:1,sourceFiles:Object.keys(index.sourceSha256).length,frozenSourceFiles:Object.keys(index.frozenSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,evidenceFiles:Object.keys(index.evidence).length,fullSevenDaySha256:core[0].bundleSha256,httpFiles:Object.keys(http[0].finalFiles).length,externalModelCalls:0,visualFeedback:'not-measured'}));
