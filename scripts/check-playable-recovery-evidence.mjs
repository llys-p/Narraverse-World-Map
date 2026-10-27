import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/playable-recovery-guidance-20261027';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f)),index=await json(dir+'/index.json');
assert.equal(index.parent,'e55ecc39b289b65ad3958e3b6063de969a7ee2f5');
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [f,sha]of Object.entries(index[group]))assert.equal(hash(await read(f)),sha,group+': '+f);
for(const [f,r]of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
assert.deepEqual(index.domainDiff,[]);assert.deepEqual(index.productionDiff,['demo-playable-goals.mjs']);
assert.equal(hash(await read(dir+'/goals.parent.source.txt')),'d951413afcdfb0e66cac2b2dcfdc3b8212e42bd176a743bbf7b8842ec61f793a');
let reconstructed=(await read('demo-playable-goals.mjs')).toString();for(const {from,to} of await json(dir+'/source-change.json')){assert.equal(reconstructed.split(from).length,2);reconstructed=reconstructed.replace(from,to);}assert.equal(reconstructed,(await read(dir+'/goals.before-budget-guidance.source.txt')).toString());
for(const [label,counts]of Object.entries(index.runs)){const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,0);assert.equal(r.timedOut,false);assert.equal(r.unconfirmed,false);assert.ok(r.wallMs>0&&r.wallMs<r.hardLimitMs);const log=(await read(dir+'/'+label+'.txt')).toString();for(const [k,v]of Object.entries(counts))assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));}
const measure=async label=>JSON.parse((await read(dir+'/'+label+'.txt')).toString().split('\n').find(l=>l.startsWith('{"measurement"')));
const service=await measure('quest-recovery-final-service');assert.equal(service.measurement,'playable-guidance-consumer');assert.equal(service.rank,1);assert.equal(service.worldTick,37);assert.equal(service.requestPosts,4);assert.equal(service.externalModelCalls,0);assert.equal(Object.keys(service.assets).length,6);for(const [f,sha]of Object.entries(service.assets))assert.equal(hash(await read(f)),sha,'final served asset: '+f);assert.equal(Object.keys(service.durableFiles).length,5);
const long=await measure('quest-recovery-http');assert.equal(long.measurement,'quest-deadline-recovery');assert.equal(long.worldTick,2017);assert.equal(long.deadline,4033);assert.deepEqual(long.progress,[0,0]);assert.equal(Object.keys(long.files).length,8);assert.equal(long.externalModelCalls,0);
const observation=await json(dir+'/reopen-in-progress.json');assert.equal(observation.statOnly,true);assert.equal(observation.latestRevision,2019);assert.equal(observation.minimumElapsedMs,181880);assert.ok(Date.parse(observation.observedAt)-Date.parse(observation.reopenLockCreatedAt)>=observation.minimumElapsedMs);
const names=new Set();for(const label of index.finalRuns)for(const m of (await read(dir+'/'+label+'.txt')).toString().matchAll(/^✔ (.+?) \([\d.]+ms\)$/gm))names.add(m[1]);assert.equal(names.size,35);for(const m of (await read(dir+'/quest-recovery-http.txt')).toString().matchAll(/^✔ (.+?) \([\d.]+ms\)$/gm))names.add(m[1]);assert.equal(names.size,36);
assert.equal(index.newTests,7);assert.equal(index.externalModelCalls,0);assert.equal(index.browserLayout,'not-measured');assert.equal(index.fps,'not-measured');
console.log(JSON.stringify({status:'verified',finalTests:35,phaseInclusiveTests:names.size,newTests:7,sourceFiles:Object.keys(index.sourceSha256).length,frozenSourceFiles:Object.keys(index.frozenSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,evidenceFiles:Object.keys(index.evidence).length,reopenObservationLowerBoundMs:observation.minimumElapsedMs,externalModelCalls:0,browserLayout:index.browserLayout,fps:index.fps}));
