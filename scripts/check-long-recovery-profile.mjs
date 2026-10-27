import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir='docs/evidence/long-recovery-profile-20261027';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function read(name){assert.ok(!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(name));
const index=await json(dir+'/index.json');
assert.equal(index.parent,'543bf632ffc32e9496fd6bc6ebf191329b0ed39d');
for(const [name,sha] of Object.entries(index.sourceSha256))assert.equal(hash(await read(name)),sha,name);
for(const [name,item] of Object.entries(index.evidence)){
 assert.equal(path.basename(name),name);const bytes=await read(dir+'/'+name);
 assert.equal(bytes.length,item.bytes,name);assert.equal(hash(bytes),item.sha256,name);
}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const match=await json(dir+'/fixture-match.json');
assert.equal(match.matchesPriorHttpFinalFile,true);
assert.equal(match.sha256,'1a31773e50d8ee8f9542399e98a908c255f52b5a1e6c12b26e987f4b978ef391');
const shape=await json(dir+'/fixture-shape.json');
assert.equal(shape.journalMatchesWorldHistory,true);assert.equal(shape.anchorTick,0);assert.equal(shape.anchorEvents,0);assert.equal(shape.anchorInputs,0);assert.equal(shape.eventCount,269);
const tests=(await read(dir+'/cold-audit-tests.log')).toString();
for(const [name,count] of [['tests',4],['pass',4],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(tests,new RegExp('^(?:# |ℹ )'+name+' '+count+'$','m'));
const parent=await json(dir+'/test-parent.json');assert.equal(parent.commit,'0a74b7e6009055d492659d3b3b1038af7b9482f4');
const phases=[];
for(const name of ['profile-1','profile-2']){
 const p=await json(dir+'/'+name+'.json');
 assert.equal(p.measurement,'local-instrumented-audit-copy');assert.equal(p.tick,2017);assert.equal(p.commands,7);
 assert.equal(p.inputSha256,'0013bd4db5593d6e3a5790fe3151c8a6aa9d67c1101916789463aa01bfd83ea0');
 assert.equal(p.certifiedEnvelopeSha256,match.sha256);assert.equal(p.serviceSourceSha256,hash(await read('runtime/service/service-commit.mjs')));
 assert.equal(p.externalModelCalls,0);
 const t=p.phases;for(const k of ['envelopeMs','anchorMs','finalFullAuditMs','projectionsMs','journalMs','totalMs'])assert.ok(Number.isFinite(t[k])&&t[k]>=0,k);
 assert.ok(Math.abs(t.totalMs-(t.envelopeMs+t.anchorMs+t.finalFullAuditMs+t.projectionsMs+t.journalMs))<0.001);
 const raw=(await read(dir+'/'+name+'.log')).toString().trim();assert.deepEqual(JSON.parse(raw),p);
 phases.push(t);
}
console.log(JSON.stringify({status:'verified',runs:phases.length,tick:2017,commands:7,matchedPriorHttpFile:true,externalModelCalls:0,phases}));
