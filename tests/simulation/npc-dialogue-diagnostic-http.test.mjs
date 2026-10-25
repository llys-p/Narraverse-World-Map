import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {evaluateDialogueCli} from '../../scripts/evaluate-npc-dialogue.mjs';

test('real loopback failure reaches fixture5 JSON/HTML with safe category, blocks dependent turns and preserves HTTP usage',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'npc9-diagnostic-http-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let calls=0;
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const input=JSON.parse(JSON.parse(Buffer.concat(chunks)).messages[1].content);
  assert.equal(input.npc.memoryMode,'npc-memory-v1');calls++;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'length',message:{content:'upstream-private-detail',reasoning_content:'hidden-thinking'}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const r=await evaluateDialogueCli(['--suite','memory-v1','--mode','live','--case','repair-bargain','--allow-model-calls','--max-requests','3','--out',path.join(dir,'report.json')],
   {env:{NPC_LLM_ENABLED:'true',NPC_LLM_BASE_URL:'http://127.0.0.1:'+server.address().port,NPC_LLM_MODEL:'loopback-only',NPC_LLM_API_KEY:'controlled-secret'},log(){}});
  assert.equal(calls,1);assert.equal(r.exitCode,1);assert.equal(r.report.counts.providerFailed,1);assert.equal(r.report.counts.blocked,2);assert.equal(r.report.cases[0].worldReplayAudit,'passed');
  const row=r.report.cases[0].turns[0];assert.equal(row.response,null);assert.deepEqual(row.metrics.failure,{stage:'completion',reason:'finish-reason'});
  assert.equal(row.metrics.httpStatus,200);assert.equal(row.metrics.finishReason,'length');assert.equal(row.metrics.usage.totalTokens,120);
  for(const file of [r.out,r.html]){const text=await fs.readFile(file,'utf8');for(const marker of ['upstream-private-detail','hidden-thinking','controlled-secret'])assert.equal(text.includes(marker),false);assert.ok(text.includes('finish-reason'));}
 }finally{await new Promise(r=>server.close(r));}
});
