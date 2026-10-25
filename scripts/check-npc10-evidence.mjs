import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc10-followup-recall-20261025';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(name){assert.ok(typeof name==='string'&&!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(dir+'/'+name));
const index=await json('index.json');assert.equal(index.schemaVersion,1);assert.equal(index.parent,'0150106f29a01573a82a0e0ff31472e1e005a975');
for(const [file,hash] of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),hash,'Source mismatch: '+file);
for(const [file,hash] of Object.entries(index.preservedEvidence))assert.equal(sha(await read(file)),hash,'Historical evidence changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){
 assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,record.bytes);assert.equal(sha(bytes),record.sha256,'Evidence mismatch: '+file);
}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [name,code] of [['npc10-recall-red',1],['npc10-recall-green',1],['npc10-recall-green-final',0],['npc10-http',0],['npc10-evaluation',0],['npc10-delivery-final',0],['npc10-followup-plan',0],['npc10-legacy',0]]){
 const run=await json(name+'.json');assert.equal(run.exitCode,code);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.ok(run.wallMs>0&&run.wallMs<run.hardLimitMs);
}
for(const [label,total,pass,fail] of [['npc10-recall-red',2,0,2],['npc10-recall-green',5,4,1],['npc10-delivery-final',71,71,0]]){
 const log=(await read(dir+'/'+label+'.txt')).toString();for(const [key,value] of Object.entries({tests:total,pass,fail,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
}
const files=(await json('npc10-delivery-final.json')).command.filter(x=>x.endsWith('.test.mjs'));
assert.equal(files.length,19);for(const file of files)assert.ok(index.sourceSha256[file]);
const plan=await json('followup-plan-summary.json');assert.equal(plan.fixtureVersion,'5');assert.equal(plan.mode,'plan');assert.equal(plan.completed,true);assert.equal(plan.realProviderAttempted,false);assert.equal(plan.semanticVerdict,'not-evaluated');
assert.deepEqual(plan.counts,{planned:8,attempted:0,automaticPassed:0,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:8});
assert.equal(plan.cases.length,2);assert.ok(plan.cases.every(c=>c.worldReplayAudit==='passed'));
for(const c of plan.cases)for(const t of c.turns){assert.equal(t.conversationCount,0);assert.notEqual(t.recallFocus.source,'confirmed-player-followup');}
for(const [name,hash] of Object.entries(plan.source.sha256))assert.equal(hash,index.sourceSha256[name]);
assert.ok(plan.source.sha256['runtime/service/npc-recall-focus.mjs']);
const legacy=await json('legacy.json');assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.equal(legacy.externalModelCalls,0);assert.equal(legacy.candidate.length,5);assert.deepEqual(legacy.baseline,legacy.candidate);
assert.equal(index.final.distinctTests,71);assert.equal(index.final.externalModelCalls,0);
const checks=await json('static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,tests:71,newTests:8,fixtureVersion:'5',planTurns:8,legacyFixtures:5,legacyBundleCheckpoints:10,externalModelCalls:0,semanticVerdict:'not-evaluated-for-npc10'}));
