import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/npc7-retest-20261025';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(path.join(root,p));
const json=async p=>JSON.parse(await read(p));
const index=await json(dir+'/index.json');
assert.equal(index.sourceCommit,'8064e2bb2ba7198aebea8ab511884fd343b26460');
const historical=p=>execFileSync('git',['show',index.sourceCommit+':'+p],{cwd:root,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
for(const [name,hash] of Object.entries(index.sourceSha256)){
 const archived=index.archivedSources[name];
 assert.equal(sha(await read(archived?dir+'/'+archived:name)),hash,name);
 if(!archived)assert.equal(sha(historical(name)),hash,name+' at evaluated commit');
}
for(const [name,hash] of Object.entries(index.deliverySourceSha256))assert.equal(sha(await read(name)),hash,name);
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
for(const [name,meta] of Object.entries(index.evidence)){
 assert.equal(path.basename(name),name);const bytes=await read(dir+'/'+name);assert.equal(bytes.length,meta.bytes);assert.equal(sha(bytes),meta.sha256,name);
}
const live=await json(dir+'/live-summary.json'),plan=await json(dir+'/plan-summary.json');
assert.deepEqual(live.counts,{planned:16,attempted:15,automaticPassed:13,automaticFailed:1,providerFailed:1,fixtureFailed:0,blocked:1,notRun:0});
assert.equal(live.actualOutboundRequests,15);assert.equal(live.http200,15);assert.equal(live.requestLimit,16);
assert.equal(live.source.workingTreeDirty,false);assert.equal(live.source.baseCommit,index.sourceCommit);assert.deepEqual(live.source.sha256,index.sourceSha256);
assert.equal(live.provider.model,'deepseek-flash');assert.equal(live.provider.thinking,'disabled');
assert.equal(live.assistantReview.verdict,'needs-correction');assert.equal(live.assistantReview.humanVerdict,'pending');
assert.equal(live.cases.length,8);assert.ok(live.cases.every(c=>c.worldReplayAudit==='passed'));
const rows=live.cases.flatMap(c=>c.turns);assert.equal(rows.length,16);
for(const [status,count] of [['automatic-pass',13],['automatic-fail',1],['provider-failed',1],['blocked',1]])assert.equal(rows.filter(t=>t.status===status).length,count);
const measures=rows.filter(t=>t.metrics).map(t=>t.metrics);assert.equal(measures.length,15);assert.ok(measures.every(m=>m.httpStatus===200&&m.thinking==='disabled'&&m.usage));
for(const key of ['inputTokens','outputTokens','totalTokens'])assert.equal(measures.reduce((s,m)=>s+m.usage[key],0),live.usage[key]);
assert.equal(live.usage.totalTokens,20870);assert.equal(live.usage.inputTokens+live.usage.outputTokens,live.usage.totalTokens);
for(const key of ['hitTokens','missTokens'])assert.equal(measures.reduce((s,m)=>s+m.usage.inputCache[key],0),live.inputCache[key]);
assert.equal(live.inputCache.hitTokens+live.inputCache.missTokens,live.usage.inputTokens);
assert.equal(plan.mode,'plan');assert.equal(plan.completed,true);assert.equal(plan.actualOutboundRequests,0);assert.equal(plan.counts.notRun,16);assert.equal(plan.counts.attempted,0);
assert.equal(plan.replays.length,8);assert.ok(plan.replays.every(c=>c.audit==='passed'));assert.equal(plan.suiteSha256,live.suiteSha256);assert.deepEqual(plan.source,live.source);
for(const [mode,exitCode,limit] of [['plan',0,120000],['live',1,420000]]){
 const run=await json(dir+'/npc7-retest-'+mode+'.json');assert.equal(run.exitCode,exitCode);assert.equal(run.timedOut,false);assert.equal(run.unconfirmed,false);assert.equal(run.hardLimitMs,limit);assert.ok(run.wallMs>0&&run.wallMs<limit);
 const log=JSON.parse((await read(dir+'/npc7-retest-'+mode+'.txt')).toString().trim());assert.equal(log.outboundRequests,mode==='live'?15:0);assert.deepEqual(log.counts,mode==='live'?live.counts:plan.counts);
}
// Older runs remain tied to the historical bytes they actually tested.
for(const [name,hash] of Object.entries(index.preservedEvidence)){
 assert.equal(sha(await read(name)),hash);assert.equal(sha(historical(name)),hash);
 const old=JSON.parse(historical(name)),base=path.posix.dirname(name);
 for(const [file,expected] of Object.entries(old.sourceSha256)){
  const at=base.includes('npc6-')?old.parent??'356541b27c4a0ef56218c941cecc88244803c7cc':index.sourceCommit;
  // NPC6's index was finalized on the PR14 head, including documentation updates.
  const commit=base.includes('npc6-')?'356541b27c4a0ef56218c941cecc88244803c7cc':at;
  const bytes=execFileSync('git',['show',commit+':'+file],{cwd:root,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});assert.equal(sha(bytes),expected,file);
 }
 for(const [file,meta] of Object.entries(old.evidence))assert.equal(sha(await read(base+'/'+file)),meta.sha256,base+'/'+file);
}
assert.equal(live.rawReport.sha256,index.privateDelivery.rawReportSha256);
console.log(JSON.stringify({status:'verified',planned:16,actualOutboundRequests:15,automaticPassed:13,automaticFailed:1,providerFailed:1,blocked:1,worldReplaysPassed:8,tokens:20870,assistantVerdict:'needs-correction',humanVerdict:'pending'}));
