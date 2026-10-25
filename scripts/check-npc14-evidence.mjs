import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc14-life-facts-20261026';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(name){assert.ok(typeof name==='string'&&!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(dir+'/'+name));
const index=await json('index.json');assert.equal(index.parent,'41907bc93d9c0e0280b59fdaf8929fc60f6064cd');
for(const [file,hash] of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),hash,'Source mismatch: '+file);
for(const [file,hash] of Object.entries(index.preservedEvidence))assert.equal(sha(await read(file)),hash,'Historical evidence changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){assert.equal(path.basename(file),file);const b=await read(dir+'/'+file);assert.equal(b.length,record.bytes);assert.equal(sha(b),record.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [name,code] of [['npc14-facts-red',1],['npc14-facts-green',0],['npc14-facts-expanded',0],['npc14-delivery-final',0],['npc14-final-wording',0],['npc14-legacy',0]]){
 const run=await json(name+'.json');assert.equal(run.exitCode,code);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.ok(run.wallMs>0&&run.wallMs<run.hardLimitMs);
}
for(const [name,total,pass,fail] of [['npc14-facts-red',2,0,2],['npc14-facts-green',2,2,0],['npc14-facts-expanded',5,5,0],['npc14-delivery-final',90,90,0],['npc14-final-wording',1,1,0]]){
 const log=(await read(dir+'/'+name+'.txt')).toString();for(const [key,value] of Object.entries({tests:total,pass,fail,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^(?:#|ℹ) '+key+' '+value+'$','m'));
}
assert.deepEqual(index.broadRunSourceOverrides,{'runtime/service/npc-language-provider.mjs':'npc14-provider-before-final-wording.txt','tests/simulation/npc-life-facts.test.mjs':'npc14-facts-test-before-final-wording.txt'});
const priorProvider=(await read(dir+'/npc14-provider-before-final-wording.txt')).toString();
assert.equal((await read('runtime/service/npc-language-provider.mjs')).toString(),priorProvider
 .replace('粮食变化+1而current.food=0时，要承认买入过1份','lastExecution记录成功买粮、粮食变化+1而current.food=0时，要承认买入过1份')
 .replace('缺少记录时直接说明尚未买或没有新行动，','只有已有未行动结果才说明该次未行动；缺少记录时承认未知，不能断言没买过。'));
const priorTest=(await read(dir+'/npc14-facts-test-before-final-wording.txt')).toString();
assert.equal((await read('tests/simulation/npc-life-facts.test.mjs')).toString(),priorTest
 .replace('assert.match(body.messages[0].content,/粮食变化\\+1而current.food=0/);','assert.match(body.messages[0].content,/lastExecution记录成功买粮、粮食变化\\+1而current.food=0/);\n  assert.match(body.messages[0].content,/缺少记录时承认未知，不能断言没买过/);'));
const legacy=await json('legacy.json');assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.equal(legacy.externalModelCalls,0);assert.equal(legacy.candidate.length,5);assert.deepEqual(legacy.baseline,legacy.candidate);
const files=(await json('npc14-delivery-final.json')).command.filter(x=>x.endsWith('.test.mjs'));assert.equal(files.length,26);for(const f of files)assert.ok(index.sourceSha256[f]);
for(const f of ['runtime/service/npc-life-facts.mjs','runtime/core/survival-state.mjs','runtime/service/npc-dialogue-grounding.mjs','runtime/service/npc-language-provider.mjs','scripts/check-npc14-legacy.mjs'])assert.ok(index.sourceSha256[f]);
const old=JSON.parse(await read('docs/evidence/npc13-life-live-20261026/live-summary.json'));assert.equal(old.semanticVerdict,'needs-correction');assert.equal(old.independentHumanVerdict,'pending');assert.equal(old.assistantAssessment.explicitFactErrors,1);assert.equal(old.assistantAssessment.explanationIssues,3);
const checks=await json('static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));
assert.equal(index.final.distinctTests,90);assert.equal(index.final.externalModelCalls,0);assert.equal(index.final.semanticVerdict,'not-evaluated-for-npc14');
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,tests:90,newTests:5,legacyCheckpoints:10,externalModelCalls:0,semanticVerdict:'not-evaluated-for-npc14',npc13SemanticVerdict:old.semanticVerdict}));
