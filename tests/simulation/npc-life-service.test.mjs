import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {providerContext} from '../../runtime/service/npc-language-provider.mjs';

async function hashes(directory){
 const names=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort();
 return Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(directory,n))).digest('hex')])));
}

test('real HTTP/worker privately delivers own life state, preserves read-only previews and restores it after dialogue/reopen',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-npc12-')),seen=[];let server;
 const mock=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const ctx=JSON.parse(JSON.parse(Buffer.concat(chunks)).messages[1].content).npc;seen.push(ctx);
  const injury=ctx.observations.find(m=>m.kind==='smash');
  const output={reply:injury?'受控回复：工具受损，我先回歇脚处；后续还要看实际行动。':'受控回复：尚无已完成的工作结果。',memoryRefs:injury?[injury.eventSeq]:[],proposal:null};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 t.after(async()=>{if(server)await server.close();await new Promise(r=>mock.close(r));await fs.rm(directory,{recursive:true,force:true});});
 const options={directory,port:0,writable:true,continuousMarch:true};
 const npcLanguage={enabled:true,baseURL:`http://127.0.0.1:${mock.address().port}/v1`,model:'controlled-life-http',apiKey:'local-test-only'};
 server=await startRuntimeServer({...options,profile:'campaign-memory-village',seed:42,npcLanguage});
 const post=(route,body)=>fetch(server.url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const read=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const g=await r.json();assert.equal(coherent(g),true);return g;};
 let group=await read(),serial=0,requests=0;
 const command=async(type,payload)=>{const dto={version:5,commandId:'life-http-'+(++serial),expectedRevision:group.snapshot.revision,type,payload};const r=await post('/api/runtime/commands',dto);assert.equal(r.status,200);const receipt=await r.json();assert.equal(receipt.outcome,'succeeded');group=await read();return {dto,receipt};};
 const compose=async()=>{const r=await post('/api/runtime/demo-npc-compose',{apiVersion:1,requestId:'life-preview-'+(++requests),simulationId:group.snapshot.simulationId,expectedRevision:group.snapshot.revision,targetId:'actor-2',text:'你现在打算做什么？'});assert.equal(r.status,200);return r.json();};
 await compose();assert.equal(seen[0].activity.lastResult,null);assert.equal(seen[0].activity.plan,null);
 await command('PlayerInteract',{targetId:'actor-2',action:'smash'});
 for(let n=0;n<2;n++)await command('PlayerGiftFood',{recipientId:'actor-2'});
 await command('AdvanceTime',{ticks:4-group.snapshot.tick});
 const before=structuredClone(group),beforeHashes=await hashes(directory),draft=await compose();
 const activity=seen.at(-1).activity;assert.equal(activity.intent.redirect,'tool');assert.equal(activity.intent.destination,'rest-site');assert.equal(activity.intent.phase,'at-destination');assert.equal(seen.at(-1).self.food,2);
 assert.deepEqual(await read(),before);assert.deepEqual(await hashes(directory),beforeHashes);
 const committed=await command('PlayerDialogue',draft.payload),filename=path.join(directory,`service-commit-r${group.snapshot.revision}.json`),saved=await loadServiceCommit(filename);
 const memory=saved.bundle.snapshot.world.mapModel.memoryModel;assert.equal(memory.actors[1].speech.length,1);
 assert.equal(JSON.stringify(memory).includes('activity'),false);assert.deepEqual(providerContext(npcDialogueContext(saved.bundle),'现在呢？').activity,activity);
 for(const marker of ['activity','lastResult','knowledgeFingerprint','local-test-only'])assert.equal(JSON.stringify(group).includes('"'+marker+'"'),false);
 const durable=structuredClone(group),durableHashes=await hashes(directory);
 await server.close();server=await startRuntimeServer({...options,npcLanguage});group=await read();await compose();assert.deepEqual(seen.at(-1).activity,activity);assert.deepEqual(await hashes(directory),durableHashes);
 await server.close();server=await startRuntimeServer(options);group=await read();
 const retry=await post('/api/runtime/commands',committed.dto);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),committed.receipt);
 for(const key of ['snapshot','map','player','scene','encounter'])assert.deepEqual(group[key],durable[key]);
 assert.deepEqual(await hashes(directory),durableHashes);assert.equal(seen.length,3);
});
