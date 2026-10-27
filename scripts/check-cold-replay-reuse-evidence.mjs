import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/cold-replay-reuse-20261027';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f)),index=await json(dir+'/index.json');
assert.equal(index.parent,'f70e638ea4079f661855ff03713d1f267f0cf192');
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [f,sha]of Object.entries(index[group]))assert.equal(hash(await read(f)),sha,group+': '+f);
for(const [f,r]of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
assert.deepEqual(index.productionDiff,['runtime/core/encounter-runtime.mjs','runtime/core/event-log.mjs','runtime/core/scene-campaign-runtime.mjs','runtime/core/world-state.mjs','runtime/service/service-commit.mjs']);
const logs=['final-regressions-portable','http-14day-parent','http-14day-proxy-final','http-14day-portable-final','http-7day-parent','http-7day-final'];
for(const name of logs){const s=(await read(dir+'/'+name+'.log')).toString(),n=name==='final-regressions-portable'?21:1;for(const [k,v]of [['tests',n],['pass',n],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(s,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));}
const measure=async name=>JSON.parse((await read(dir+'/'+name+'.log')).toString().split('\n').find(l=>l.startsWith('{"measurement"')));
const [a,b,repeat,c,d]=await Promise.all(['http-14day-parent','http-14day-proxy-final','http-14day-portable-final','http-7day-parent','http-7day-final'].map(measure));
assert.equal(a.measurement,'14-day-reopen-http');assert.equal(b.measurement,a.measurement);assert.equal(a.tick,2017);assert.equal(b.tick,2017);assert.equal(a.commands,7);assert.equal(b.commands,7);
assert.equal(a.fileSha256,b.fileSha256);assert.equal(a.fileSha256,'1a31773e50d8ee8f9542399e98a908c255f52b5a1e6c12b26e987f4b978ef391');assert.equal(a.projectionsSha256,b.projectionsSha256);
assert.equal(repeat.measurement,a.measurement);assert.equal(repeat.tick,2017);assert.equal(repeat.commands,7);assert.equal(repeat.fileSha256,a.fileSha256);assert.equal(repeat.projectionsSha256,a.projectionsSha256);assert.equal(repeat.externalModelCalls,0);
assert.equal(c.measurement,'long-session-short-commands');assert.equal(d.measurement,c.measurement);assert.equal(c.tick,1015);assert.equal(d.tick,1015);assert.deepEqual(c.finalFiles,d.finalFiles);assert.equal(Object.keys(c.finalFiles).length,6);assert.equal(c.finalProjectionSha256,d.finalProjectionSha256);
assert.deepEqual(c.samples.map(x=>x.label),d.samples.map(x=>x.label));assert.equal(c.realModelCalls,0);assert.equal(d.realModelCalls,0);assert.equal(a.externalModelCalls,0);assert.equal(b.externalModelCalls,0);
for(const n of [a.reopenMs,b.reopenMs,repeat.reopenMs,c.reopenMs,d.reopenMs])assert.ok(Number.isFinite(n)&&n>0);
const combined=(await read(dir+'/final-regressions-portable.log')).toString(),service=JSON.parse(combined.split('\n').find(l=>l.startsWith('{"measurement":"playable-guidance-consumer"')));
for(const [f,sha] of Object.entries(service.assets))assert.equal(hash(await read(f)),sha,'served asset: '+f);assert.equal(service.externalModelCalls,0);
const names=new Set();for(const name of ['final-regressions-portable','http-14day-portable-final','http-7day-final'])for(const m of (await read(dir+'/'+name+'.log')).toString().matchAll(/^✔ (.+?) \([\d.]+ms\)$/gm))names.add(m[1]);assert.equal(names.size,23);
console.log(JSON.stringify({status:'verified',distinctFinalTests:names.size,day14ReopenMs:[a.reopenMs,b.reopenMs,repeat.reopenMs],day7ReopenMs:[c.reopenMs,d.reopenMs],sourceFiles:Object.keys(index.sourceSha256).length,frozenSourceFiles:Object.keys(index.frozenSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,externalModelCalls:0,browserLayout:'not-measured',fps:'not-measured'}));
