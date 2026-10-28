import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/hunter-trust-journey-20261028',parent='c5df3c8d69951545fa33e59707766c2295d3b9ed';
const sha=b=>createHash('sha256').update(b).digest('hex'),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
async function read(f){assert.ok(typeof f==='string'&&!path.isAbsolute(f));const p=path.resolve(root,f);assert.ok(p.startsWith(root));return fs.readFile(p);}
const index=JSON.parse(await read(dir+'/index.json'));assert.equal(index.parent,parent);assert.equal(index.browser,'not-tested');assert.equal(index.externalModelCalls,0);
for(const [f,h]of Object.entries(index.sources))assert.equal(sha(await read(f)),h,'source: '+f);
for(const [f,r]of Object.entries(index.evidence)){assert.equal(path.basename(f),f);const b=await read(dir+'/'+f);assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
let inheritedEvidence=0,inheritedSource=0;
for(const row of git('ls-tree','-rz',parent).split('\0').filter(Boolean)){
 const [meta,file]=row.split('\t'),[mode,type,blob]=meta.split(' ');if(type!=='blob'||mode!=='100644')continue;
 const evidence=file.startsWith('docs/evidence/'),source=/\.(mjs|cjs|js|json|html|css|py|cmd)$/.test(file)&&!evidence;
 if(!evidence&&(!source||Object.hasOwn(index.sources,file)))continue;
 const bytes=await read(file),actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');assert.equal(actual,blob,'inherited: '+file);
 if(evidence)inheritedEvidence++;else inheritedSource++;
}
assert.equal(inheritedEvidence,index.inheritedEvidenceFiles);assert.equal(inheritedSource,index.inheritedSourceFiles);
assert.deepEqual(index.finalRuns.map(r=>[r.log,r.tests]),[['new-feature-final.log',12],['regression-final.log',40]]);let total=0;
for(const run of index.finalRuns){const log=(await read(dir+'/'+run.log)).toString();for(const [k,v]of [['tests',run.tests],['pass',run.tests],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp('^(?:# |ℹ )'+k+' '+v+'$','m'));total+=run.tests;}
assert.equal(total,index.distinctTests);assert.match((await read(dir+'/core-initial.log')).toString(),/^ℹ fail 1$/m);assert.match((await read(dir+'/new-feature.log')).toString(),/^ℹ fail 2$/m);
const records=(await read(dir+'/new-feature-final.log')).toString().split('\n').filter(l=>l.startsWith('{"measurement"')).map(JSON.parse),journey=records.find(r=>r.measurement==='hunter-trust-http'),overdue=records.find(r=>r.measurement==='hunter-trust-overdue-http');
assert.ok(journey.chapterComplete&&journey.reopenedBorrowedLoan&&journey.reopenedComplete&&journey.retryFilesUnchanged);assert.equal(journey.rank,4);assert.equal(journey.quests.find(q=>q.id==='hunter-trust').status,'completed');assert.equal(overdue.agreement,'returned-late');assert.ok(overdue.reopened);
for(const r of records)assert.equal(r.externalModelCalls,0);for(const [f,h]of Object.entries(journey.assets))assert.equal(sha(await read(f)),h,'served asset: '+f);
const legacy=JSON.parse(await read(dir+'/legacy-comparison.json'));assert.equal(legacy.status,'identical');assert.equal(legacy.baseline,parent);assert.deepEqual(legacy.fixtures.map(r=>r.fixture),[1,2,3,4,5,6]);
console.log(JSON.stringify({status:'verified',distinctTests:total,inheritedEvidence,inheritedSource,oldFixturesIdentical:6,externalModelCalls:0,browser:'not-tested'}));
