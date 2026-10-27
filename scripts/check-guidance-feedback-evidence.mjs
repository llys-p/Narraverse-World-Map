import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/playable-guidance-feedback-20261027';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(f){assert.equal(typeof f,'string');assert.ok(!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async f=>JSON.parse(await read(f)),index=await json(dir+'/index.json');
assert.equal(index.parent,'3f65827a5ab7444fe78318e0a0e223e612861a2e');
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [f,sha]of Object.entries(index[group]))assert.equal(hash(await read(f)),sha,group+': '+f);
for(const [f,r]of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
assert.deepEqual(index.domainDiff,[]);
const server=(await read('runtime-server.mjs')).toString(),before=(await read(dir+'/runtime-server.parent.source.txt')).toString();
assert.equal(server.replace(" 'demo-operation-feedback.mjs','demo-social-language.mjs'"," 'demo-social-language.mjs'"),before);
assert.equal(hash(await read(dir+'/goals.parent.source.txt')),'e9fcc49f40f20f417f580c5e7a78ded30e578b4fe6dddaa93b74ead9d2396a54');
for(const [label,counts]of Object.entries(index.runs)){
 const r=await json(dir+'/'+label+'.json');assert.equal(r.exitCode,0);assert.equal(r.timedOut,false);assert.equal(r.unconfirmed,false);assert.ok(r.wallMs>0&&r.wallMs<r.hardLimitMs);
 const log=(await read(dir+'/'+label+'.txt')).toString();for(const [k,v]of Object.entries(counts))assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));
}
const log=(await read(dir+'/guidance-final-service.txt')).toString(),service=JSON.parse(log.split('\n').find(l=>l.startsWith('{"measurement"')));
assert.equal(service.measurement,'playable-guidance-consumer');assert.equal(service.rank,1);assert.equal(service.worldTick,37);assert.equal(service.requestPosts,4);assert.equal(service.externalModelCalls,0);
for(const [f,sha]of Object.entries(service.assets))assert.equal(hash(await read(f)),sha,'final served asset: '+f);
assert.equal(Object.keys(service.durableFiles).length,5);assert.deepEqual(service.phases,['connect',null,'confirm','refresh','present']);
const names=new Set();for(const label of index.acceptedTestRuns)for(const m of (await read(dir+'/'+label+'.txt')).toString().matchAll(/^✔ (.+?) \([\d.]+ms\)$/gm))names.add(m[1]);assert.equal(names.size,index.distinctTests);
assert.equal(index.newTests,14);assert.equal(index.externalModelCalls,0);assert.equal(index.browserLayout,'not-measured');assert.equal(index.fps,'not-measured');
const browser=await json(dir+'/browser-availability.json');assert.equal(browser.available,false);
const html=(await read('demo-runtime.html')).toString();assert.match(html,/id="operationElapsed"[^>]*aria-live="off"/);assert.match(html,/id="playableNext"/);assert.doesNotMatch(html,/每档128条命令/);
console.log(JSON.stringify({status:'verified',distinctTests:names.size,newTests:14,sourceFiles:Object.keys(index.sourceSha256).length,frozenSourceFiles:Object.keys(index.frozenSourceSha256).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,evidenceFiles:Object.keys(index.evidence).length,servedAssets:Object.keys(service.assets).length,confirmedCommands:service.requestPosts,externalModelCalls:0,browserLayout:index.browserLayout,fps:index.fps}));
