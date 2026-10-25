import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc13-life-live-20261026';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(name){assert.ok(typeof name==='string'&&!path.isAbsolute(name));const p=path.resolve(root,name);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async name=>JSON.parse(await read(dir+'/'+name));
const index=await json('index.json');assert.equal(index.parent,'9d8baecc2d253420e3d86546acb15b3ef5e99252');
for(const [file,hash] of Object.entries(index.sourceSha256))assert.equal(sha(await read(file)),hash,'Source mismatch: '+file);
for(const [file,hash] of Object.entries(index.preservedEvidence))assert.equal(sha(await read(file)),hash,'Historical evidence changed: '+file);
for(const [file,record] of Object.entries(index.evidence)){assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,record.bytes);assert.equal(sha(bytes),record.sha256);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const run=await json('npc13-life-live.json');assert.equal(run.exitCode,0);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.ok(run.wallMs>0&&run.wallMs<run.hardLimitMs);
assert.ok(run.command.includes('--max-requests'));assert.equal(run.command[run.command.indexOf('--max-requests')+1],'8');
const s=await json('live-summary.json');assert.equal(s.basisCommit,index.parent);assert.equal(s.workingTreeDirty,false);assert.equal(s.fixtureVersion,'5');assert.equal(s.suiteId,'npc-life-v1');
assert.deepEqual(s.counts,{planned:8,attempted:8,automaticPassed:8,automaticFailed:0,providerFailed:0,fixtureFailed:0,blocked:0,notRun:0});assert.equal(s.httpSucceeded,8);assert.equal(s.provider.model,'deepseek-flash');assert.equal(s.provider.thinking,'disabled');
assert.equal(s.semanticVerdict,'needs-correction');assert.equal(s.independentHumanVerdict,'pending');assert.equal(s.assistantAssessment.explicitFactErrors,1);assert.equal(s.assistantAssessment.explanationIssues,3);assert.equal(s.assistantAssessment.turns.length,8);
const turns=s.cases.flatMap(c=>c.turns);assert.equal(turns.length,8);assert.ok(s.cases.every(c=>c.worldReplayAudit==='passed'));
for(const t of turns){assert.equal(t.status,'automatic-pass');assert.ok(t.checks.every(c=>c.passed));assert.equal(t.metrics.httpStatus,200);assert.equal(t.metrics.failure,null);assert.equal(t.metrics.finishReason,'stop');assert.equal(t.metrics.thinking,'disabled');const u=t.metrics.usage;assert.equal(u.inputTokens+u.outputTokens,u.totalTokens);assert.equal(u.inputCache.hitTokens+u.inputCache.missTokens,u.inputTokens);}
for(const k of ['inputTokens','outputTokens','totalTokens'])assert.equal(s.usage[k],turns.reduce((n,t)=>n+t.metrics.usage[k],0));assert.deepEqual(s.usage,{inputTokens:16080,outputTokens:529,totalTokens:16609});
assert.deepEqual(s.inputCache,{hitTokens:7424,missTokens:8656});
const bought=s.cases.find(c=>c.id==='work-and-food').turns.find(t=>t.id==='food-consumed').facts;assert.equal(bought.food,0);assert.equal(bought.wallet,10);assert.equal(bought.activity.lastResult.foodChange,1);
for(const [file,hash] of Object.entries(s.source.sha256))assert.equal(sha(await read(file)),hash,'Live source changed: '+file);
assert.equal(s.privateReportSha256,index.privateReports.jsonSha256);assert.equal(s.privateHtmlSha256,index.privateReports.htmlSha256);
const checks=await json('static-checks.json');assert.equal(checks.passed,true);assert.ok(checks.checks.every(c=>c.exitCode===0));
console.log(JSON.stringify({status:'verified',requests:8,httpSucceeded:8,automaticPassed:8,worldReplays:2,semanticVerdict:'needs-correction',independentHumanVerdict:'pending',runtimeChanged:false,preservedEvidenceFiles:Object.keys(index.preservedEvidence).length}));
