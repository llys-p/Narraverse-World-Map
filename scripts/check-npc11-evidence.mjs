import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc11-retry-loss-state-20261025';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(name){assert.ok(typeof name==='string'&&!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(dir+'/'+name));
const index=await json('index.json');assert.equal(index.schemaVersion,1);assert.equal(index.parent,'06050f9839173b7c9c3b28608b5f63dbdd747aaf');
for(const [file,hash] of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),hash,'Source mismatch: '+file);
for(const [file,hash] of Object.entries(index.preservedEvidence))assert.equal(sha(await read(file)),hash,'Historical evidence changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){
 assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,record.bytes);assert.equal(sha(bytes),record.sha256,'Evidence mismatch: '+file);
}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [name,code] of [['npc11-red',1],['npc11-green',0],['npc11-boundaries',0],['npc11-http',1],['npc11-http-final',0],['npc11-delivery-final',0],['npc11-legacy',0]]){
 const run=await json(name+'.json');assert.equal(run.exitCode,code);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.ok(run.wallMs>0&&run.wallMs<run.hardLimitMs);
}
for(const [label,total,pass,fail] of [['npc11-red',2,0,2],['npc11-http',1,0,1],['npc11-delivery-final',77,77,0]]){
 const log=(await read(dir+'/'+label+'.txt')).toString();for(const [key,value] of Object.entries({tests:total,pass,fail,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
}
const files=(await json('npc11-delivery-final.json')).command.filter(x=>x.endsWith('.test.mjs'));
assert.equal(files.length,22);for(const file of files)assert.ok(index.sourceSha256[file]);
for(const file of ['demo-npc-dialogue.mjs','demo-runtime-prototype.mjs','runtime/core/npc-memory.mjs'])assert.ok(index.sourceSha256[file]);
const legacy=await json('legacy.json');assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.equal(legacy.externalModelCalls,0);assert.equal(legacy.candidate.length,5);assert.deepEqual(legacy.baseline,legacy.candidate);
assert.equal(index.final.distinctTests,77);assert.equal(index.final.externalModelCalls,0);
const checks=await json('static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,tests:77,newTests:6,fixtureVersion:'5',legacyFixtures:5,legacyBundleCheckpoints:10,externalModelCalls:0,semanticVerdict:'not-evaluated-for-npc11'}));
