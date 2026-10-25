import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc9-dialogue-followup-20261025';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(name){assert.ok(typeof name==='string'&&!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(dir+'/'+name));
const index=await json('index.json');assert.equal(index.schemaVersion,1);assert.equal(index.parent,'a63e4cbda0b9ed2ae6c108265c8fea4671546a39');
for(const [file,hash] of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),hash,'Source mismatch: '+file);
for(const [file,hash] of Object.entries(index.preservedEvidence))assert.equal(sha(await read(file)),hash,'Historical evidence changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){
 assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,record.bytes);assert.equal(sha(bytes),record.sha256,'Evidence mismatch: '+file);
}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [name,code] of [['npc9-diagnostics-red',1],['npc9-diagnostics-green',0],['npc9-options',0],['npc9-targeted',0],['npc9-capacity',0],['npc9-diagnostic-http',0],['npc9-delivery-final',0],['npc9-memory-plan',0],['npc9-memory-plan-final',0],['npc9-legacy',0]]){
 const run=await json(name+'.json');assert.equal(run.exitCode,code);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.ok(run.wallMs>0&&run.wallMs<run.hardLimitMs);
}
for(const [label,total,pass,fail] of [['npc9-diagnostics-red',2,0,2],['npc9-delivery-final',63,63,0]]){
 const log=(await read(dir+'/'+label+'.txt')).toString();for(const [key,value] of Object.entries({tests:total,pass,fail,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
}
const tests=await json('npc9-delivery-final.json'),files=tests.command.filter(x=>x.endsWith('.test.mjs'));assert.equal(files.length,16);for(const file of files)assert.ok(index.sourceSha256[file]);
const plan=await json('memory-plan-summary.json');assert.equal(plan.fixtureVersion,'5');assert.equal(plan.mode,'plan');assert.equal(plan.completed,true);assert.equal(plan.realProviderAttempted,false);assert.equal(plan.semanticVerdict,'not-evaluated');
assert.deepEqual(plan.counts,{planned:17,attempted:0,automaticPassed:0,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:17});
assert.equal(plan.cases.length,8);assert.ok(plan.cases.every(c=>c.fixtureVersion==='5'&&c.worldReplayAudit==='passed'));
for(const [name,hash] of Object.entries(plan.source.sha256))assert.equal(hash,index.sourceSha256[name]);
const turn=(id,n)=>plan.cases.find(c=>c.id===id).turns[n];
for(const c of plan.cases)for(const t of c.turns)assert.equal(t.memoryMode,'npc-memory-v1');
assert.equal(turn('fixed-lateness',0).knownFacts.agreement.overdueMinutes,40);assert.equal(turn('fixed-lateness',1).knownFacts.agreement.overdueMinutes,40);
assert.equal(turn('repair-progress',1).knownFacts.agreement.wasClaimed,false);
assert.equal(turn('repair-denial',0).memoryUpdates.find(x=>x.topic==='damage').status,'repaired');
assert.equal(turn('loss-return',1).memoryUpdates.find(x=>x.topic==='loss').status,'recovered');
assert.deepEqual(turn('repair-bargain',0).negotiationOptions.options,[{repairAmount:40,loanTicks:36},{repairAmount:40,loanTicks:72}]);
const legacy=await json('legacy.json');assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.equal(legacy.externalModelCalls,0);assert.equal(legacy.candidate.length,5);assert.deepEqual(legacy.baseline,legacy.candidate);
assert.equal(index.final.distinctTests,63);assert.equal(index.final.externalModelCalls,0);
const checks=await json('static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,
 tests:63,newTests:9,fixtureVersion:'5',planTurns:17,legacyFixtures:5,legacyBundleCheckpoints:10,externalModelCalls:0,semanticVerdict:'not-evaluated-for-npc9'}));
