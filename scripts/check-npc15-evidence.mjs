import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc15-dialogue-review-20261026';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(name){assert.ok(typeof name==='string'&&!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(dir+'/'+name));
const index=await json('index.json');assert.equal(index.parent,'7edfd75a17f39c86b600d2009f72fe6530ec9028');
for(const [file,hash] of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),hash,'Source mismatch: '+file);
for(const [file,hash] of Object.entries(index.preservedEvidence))assert.equal(sha(await read(file)),hash,'Historical evidence changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){assert.equal(path.basename(file),file);const b=await read(dir+'/'+file);assert.equal(b.length,record.bytes);assert.equal(sha(b),record.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const expectedExits={'npc15-audit-red':1,'npc15-audit-green':0,'npc15-audit-integrated':0,'npc15-audit-expanded':0,'npc15-review-first':0,'npc15-audit-review':0,'npc15-review-expanded':0,'npc15-life-v2-plan':0,'npc15-life-v2-tests':0,'npc15-old-live-audit':1,'npc15-old-live-final':1,'npc15-delivery-final':0,'npc15-review-input-red':1,'npc15-review-input-final':0,'npc15-legacy':0,'npc15-life-v2-plan-final':0,'npc15-old-live-delivery':1};
assert.deepEqual(Object.keys(index.runs).sort(),Object.keys(expectedExits).sort());
for(const [label,code] of Object.entries(expectedExits)){
 const run=await json(label+'.json');assert.equal(run.exitCode,code);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.ok(run.wallMs>0&&run.wallMs<run.hardLimitMs);assert.equal(index.runs[label].expectedExitCode,code);
}
for(const [label,total,pass,fail] of [['npc15-audit-red',1,0,1],['npc15-audit-green',2,2,0],['npc15-audit-integrated',2,2,0],['npc15-audit-expanded',4,4,0],['npc15-review-first',5,5,0],['npc15-audit-review',9,9,0],['npc15-review-expanded',6,6,0],['npc15-life-v2-tests',3,3,0],['npc15-delivery-final',100,100,0],['npc15-review-input-red',2,0,2],['npc15-review-input-final',8,8,0]]){
 const log=(await read(dir+'/'+label+'.txt')).toString();
 for(const [key,value] of Object.entries({tests:total,pass,fail,cancelled:0,skipped:0,todo:0})){assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));assert.equal(index.runs[label].testCounters[key],value);}
}
assert.deepEqual(index.broadRunSourceOverrides,{'runtime/evaluation/npc-dialogue-eval.mjs':'npc15-evaluation-before-input-fix.txt','runtime/evaluation/npc-dialogue-review.mjs':'npc15-review-before-input-fix.txt'});
const beforeEval=(await read(dir+'/npc15-evaluation-before-input-fix.txt')).toString();
assert.equal((await read('runtime/evaluation/npc-dialogue-eval.mjs')).toString(),beforeEval.replace('${report.requestLimit}','${escape(report.requestLimit)}'));
const beforeReview=(await read(dir+'/npc15-review-before-input-fix.txt')).toString();
const marker=" assert(!Object.hasOwn(report,'reviewImport'),'Use the original report for another review');";
assert.equal((await read('runtime/evaluation/npc-dialogue-review.mjs')).toString(),beforeReview.replace(marker," assert(Number.isSafeInteger(report.requestLimit)&&report.requestLimit>=0&&report.requestLimit<=32,'Invalid report request limit');\n"+marker));
const suite=JSON.parse(await read('benchmarks/npc-life-v2/cases.json'));assert.equal(suite.fixtureVersion,'5');assert.equal(suite.cases.length,4);assert.equal(suite.cases.flatMap(c=>c.turns).length,16);assert.ok(suite.cases.every(c=>c.turns.every(t=>Object.keys(t.expect.facts).length>0)));
const plan=await json('life-v2-plan-summary.json');assert.equal(plan.suiteId,'npc-life-v2');assert.equal(plan.completed,true);assert.equal(plan.externalModelCalls,0);assert.equal(plan.semanticVerdict,'not-evaluated');assert.equal(plan.counts.notRun,16);assert.equal(plan.counts.attempted,0);assert.equal(plan.counts.fixtureFailed,0);assert.equal(plan.counts.blocked,0);assert.ok(plan.cases.every(c=>c.worldReplayAudit==='passed'&&c.turns.every(t=>t.preconditions.every(p=>p.passed))));
for(const [file,hash] of Object.entries(plan.source.sha256))assert.equal(sha(await read(file)),hash,'Final plan source mismatch: '+file);
const old=await json('old-live-audit-summary.json');assert.equal(old.originalReportUnchanged,true);assert.equal(old.originalRepliesPreserved,true);assert.equal(old.originalHumanReviewPreserved,true);assert.equal(old.externalModelCalls,0);
assert.deepEqual(old.factAuditSummary,{scope:'explicit-current-food-wallet',turnsWithReplies:8,contradictionTurns:1,checkedNoContradictionTurns:2,unassessedTurns:5,notEvaluatedTurns:0});
assert.equal(old.algorithmSourceSha256,sha(await read('runtime/evaluation/npc-fact-audit.mjs')));assert.equal(old.assistantSemanticVerdict,'needs-correction');assert.equal(old.independentHumanVerdict,'pending');assert.equal(old.originalAutomaticPassed,8);assert.equal(old.turns.filter(t=>t.audit.status==='contradiction-detected').length,1);
const originalIndex=JSON.parse(await read('docs/evidence/npc13-life-live-20261026/index.json'));assert.equal(old.sourceReportSha256,originalIndex.privateReports.jsonSha256);
const legacy=await json('legacy.json');assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.equal(legacy.externalModelCalls,0);assert.deepEqual(legacy.baseline,legacy.candidate);assert.equal(legacy.candidate.length,5);
const checks=await json('static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));assert.deepEqual(checks.productionDiff,[]);
assert.equal(index.final.distinctTests,105);assert.equal(index.final.newTests,15);assert.equal(index.final.externalModelCalls,0);assert.equal(index.final.semanticVerdict,'not-evaluated-for-npc15');
const tested=new Set();for(const label of ['npc15-delivery-final','npc15-life-v2-tests','npc15-review-input-final'])for(const f of (await json(label+'.json')).command.filter(x=>x.endsWith('.test.mjs')))tested.add(f);
assert.equal(tested.size,30);for(const f of tested)assert.ok(index.sourceSha256[f]);
console.log(JSON.stringify({status:'verified',sourceFiles:Object.keys(index.sourceSha256).length,evidenceFiles:Object.keys(index.evidence).length,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length,distinctTests:105,newTests:15,lifeV2Cases:4,lifeV2Turns:16,legacyCheckpoints:10,externalModelCalls:0,npc13Audit:old.factAuditSummary,semanticVerdict:'not-evaluated-for-npc15'}));
