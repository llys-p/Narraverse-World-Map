import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc12-life-context-20261026';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(name){assert.ok(typeof name==='string'&&!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(dir+'/'+name));
const index=await json('index.json');assert.equal(index.schemaVersion,1);assert.equal(index.parent,'aa10926f8e0019aa66e61ed2e9a4c757a8ed9a5e');
for(const [file,hash] of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),hash,'Source mismatch: '+file);
for(const [file,hash] of Object.entries(index.preservedEvidence))assert.equal(sha(await read(file)),hash,'Historical evidence changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){
 assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,record.bytes);assert.equal(sha(bytes),record.sha256,'Evidence mismatch: '+file);
}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [name,code] of [['npc12-red',1],['npc12-green',0],['npc12-core',1],['npc12-core-final',1],['npc12-core-delivery',0],['npc12-http',0],['npc12-evaluation',1],['npc12-evaluation-final',1],['npc12-evaluation-delivery',0],['npc12-delivery-final',0],['npc12-legacy',0]]){
 const run=await json(name+'.json');assert.equal(run.exitCode,code);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.ok(run.wallMs>0&&run.wallMs<run.hardLimitMs);
}
for(const [label,total,pass,fail] of [['npc12-red',2,0,2],['npc12-core',5,3,2],['npc12-core-final',5,4,1],['npc12-evaluation',1,0,1],['npc12-evaluation-final',2,0,2],['npc12-delivery-final',85,85,0]]){
 const log=(await read(dir+'/'+label+'.txt')).toString();for(const [key,value] of Object.entries({tests:total,pass,fail,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
}
const files=(await json('npc12-delivery-final.json')).command.filter(x=>x.endsWith('.test.mjs'));assert.equal(files.length,25);for(const file of files)assert.ok(index.sourceSha256[file]);
for(const file of ['runtime/core/npc-life-context.mjs','runtime/core/npc-village-sites.mjs','runtime/core/campaign-npc-agency.mjs','runtime/core/campaign-map.mjs'])assert.ok(index.sourceSha256[file]);
const suite=JSON.parse(await read('benchmarks/npc-life-v1/cases.json'));assert.equal(suite.schemaVersion,2);assert.equal(suite.fixtureVersion,'5');assert.equal(suite.cases.length,2);assert.equal(suite.cases.reduce((n,c)=>n+c.turns.length,0),8);
const legacy=await json('legacy.json');assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.equal(legacy.externalModelCalls,0);assert.equal(legacy.candidate.length,5);assert.deepEqual(legacy.baseline,legacy.candidate);
assert.equal(index.final.distinctTests,85);assert.equal(index.final.externalModelCalls,0);
const checks=await json('static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,tests:85,newTests:8,fixtureVersion:'5',lifeSuiteTurns:8,legacyFixtures:5,legacyBundleCheckpoints:10,externalModelCalls:0,semanticVerdict:'not-evaluated-for-npc12'}));
