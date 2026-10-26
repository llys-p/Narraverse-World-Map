import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/campaign-owned-batch-20261026';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f)),index=await json(dir+'/index.json');
assert.equal(index.parent,'9dd2c3aa5be2c5f5dcaf1e04a20ecfc1e73a3b70');
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [f,sha] of Object.entries(index[group]))assert.equal(hash(await read(f)),sha,group+': '+f);
for(const [f,r] of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const profile=await json(dir+'/profile-summary.json'),rawProfile=gunzipSync(Buffer.from((await read(dir+'/parent.cpuprofile.gz.base64')).toString().trim(),'base64'),{maxOutputLength:8*1024*1024});
assert.equal(rawProfile.length,profile.rawBytes);assert.equal(hash(rawProfile),profile.rawSha256);assert.ok(JSON.parse(rawProfile).nodes.length>0);
const baseline=await json(dir+'/parent-sources.json');
for(const [name,sha] of Object.entries(baseline))assert.equal(hash(await read(dir+'/'+name+'.parent.source.txt')),sha);
const oldEngine=(await read(dir+'/command-engine.parent.source.txt')).toString();
assert.equal(oldEngine.replace("    const candidate = mode === 'full' ? cloneBundle(bundle) :", "    // The batch owns its entry clone and never yields or accepts caller handlers.\n    // Intermediate ticks may mutate it: a failure discards the whole private batch.\n    const candidate = execution === campaignBatchExecution ? bundle : mode === 'full' ? cloneBundle(bundle) :"),(await read(dir+'/command-engine.rejected-combined.source.txt')).toString());
assert.equal(oldEngine,(await read('runtime/core/command-engine.mjs')).toString());
const oldWorld=(await read(dir+'/scene-campaign-runtime.parent.source.txt')).toString();
assert.equal(oldWorld.replace(' const detached=cloneData({world,options}),key=canonicalJson(detached);', ' // Canonical encoding already validates JSON data and normalizes numbers/keys.\n // Parse those exact bytes only on a miss, reusing the key as the detached input.\n const key=canonicalJson({world,options});').replace(' if(lastWorldStructure?.key===key)return cloneData(lastWorldStructure.result);',' if(lastWorldStructure?.key===key)return cloneData(lastWorldStructure.result);\n const detached=JSON.parse(key);'),(await read(dir+'/scene-campaign-runtime.rejected-codec.source.txt')).toString());
assert.equal(oldWorld,(await read('runtime/core/scene-campaign-runtime.mjs')).toString());
assert.deepEqual(index.productionDiff,[]);
for(const [label,counts] of Object.entries(index.runs)){
  const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,0);assert.equal(r.timedOut,false);assert.equal(r.unconfirmed,false);assert.ok(r.wallMs>0&&r.wallMs<r.hardLimitMs);
  const log=(await read(dir+'/'+label+'.txt')).toString();for(const [key,n]of Object.entries(counts))assert.match(log,new RegExp('^(?:# |ℹ )'+key+' '+n+'$','m'));
}
const exploratory=await Promise.all(['a1','b1','b2','a2'].map(n=>json(dir+'/'+n+'.json')));
const records=await Promise.all(['confirm-a1','confirm-b1','confirm-b2','confirm-a2'].map(n=>json(dir+'/'+n+'.json')));
for(const r of [...exploratory,...records])assert.equal(r.bundleSha256,records[0].bundleSha256);
const cpuArms=await Promise.all(['cpu-a1','cpu-codec','cpu-loop','cpu-a2','cpu-combined'].map(n=>json(dir+'/'+n+'.json')));
for(const r of cpuArms){assert.equal(r.tick,288);assert.equal(r.bundleSha256,cpuArms[0].bundleSha256);assert.ok(r.cpu.simulateMs>0&&r.cpu.auditMs>0);}
const combined=await json(dir+'/combined-frozen-source.json');for(const [f,sha] of Object.entries(combined))assert.equal(hash(await read(f==='runtime/core/command-engine.mjs'?dir+'/command-engine.rejected-combined.source.txt':f==='runtime/core/scene-campaign-runtime.mjs'?dir+'/scene-campaign-runtime.rejected-codec.source.txt':f)),sha,'combined phase: '+f);
for(const r of records){assert.equal(r.tick,1008);assert.equal(r.bundleSha256,records[0].bundleSha256);assert.equal(r.bytes,records[0].bytes);assert.equal(r.fullReplay,'passed');assert.equal(r.externalModelCalls,0);}
const report=await json(dir+'/performance-summary.json');assert.equal(report.decision,'reject both production optimizations; runtime is byte-identical to PR29');
for(const [group,rows] of [['combinedSevenDays',exploratory],['codecSevenDays',records]])for(const key of ['simulateMs','auditMs']){
  assert.ok(Math.abs(report[group][key].parentMeanMs-(rows[0][key]+rows[3][key])/2)<1e-6);
  assert.ok(Math.abs(report[group][key].candidateMeanMs-(rows[1][key]+rows[2][key])/2)<1e-6);
}
const http=await Promise.all(['parent','candidate'].map(async n=>JSON.parse((await read(dir+'/owned-http-'+n+'.txt')).toString().split('\n').find(l=>l.startsWith('{"measurement"')))));
for(const h of http.slice(1)){assert.deepEqual(http[0].finalFiles,h.finalFiles);assert.equal(http[0].finalProjectionSha256,h.finalProjectionSha256);}
for(const h of http){assert.equal(h.tick,1015);assert.equal(h.realModelCalls,0);assert.deepEqual(h.samples.map(p=>p.durationTicks),[1008,0,0,1,6]);}
const names=new Set();for(const label of index.acceptedTestRuns)for(const m of (await read(dir+'/'+label+'.txt')).toString().matchAll(/^✔ (.+?) \([\d.]+ms\)$/gm))names.add(m[1]);assert.equal(names.size,index.distinctTests);
assert.equal(index.externalModelCalls,0);assert.equal(index.visualFeedback,'not-measured');
console.log(JSON.stringify({status:'verified',distinctTests:names.size,sourceFiles:Object.keys(index.sourceSha256).length,frozenSourceFiles:Object.keys(index.frozenSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,evidenceFiles:Object.keys(index.evidence).length,completeSevenDayBundle:records[0].bundleSha256,httpFiles:Object.keys(http[0].finalFiles).length,externalModelCalls:0,visualFeedback:'not-measured'}));
