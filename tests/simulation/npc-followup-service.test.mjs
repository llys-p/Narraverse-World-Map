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

async function hashes(directory){
 const names=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort();
 return Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(directory,n))).digest('hex')])));
}

test('real HTTP/worker follow-up uses confirmed private speech after reopen, ignores previews, and retries once',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-npc10-')),seen=[];let server;
 const mock=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const input=JSON.parse(JSON.parse(Buffer.concat(chunks)).messages[1].content);seen.push(input.npc);
  const gift=input.npc.observations.find(m=>m.kind==='gift');
  // Deliberately mentions food even on weather; NPC replies must not set the topic.
  const output={reply:'受控回复：关于之前提到的粮食，我只按保留经历回答。',memoryRefs:gift?[gift.eventSeq]:[],proposal:null};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 t.after(async()=>{if(server)await server.close();await new Promise(r=>mock.close(r));await fs.rm(directory,{recursive:true,force:true});});
 const options={directory,port:0,writable:true,continuousMarch:true};
 const npcLanguage={enabled:true,baseURL:`http://127.0.0.1:${mock.address().port}/v1`,model:'controlled-followup-http',apiKey:'local-test-only'};
 server=await startRuntimeServer({...options,profile:'campaign-memory-village',seed:42,npcLanguage});
 const post=(route,body)=>fetch(server.url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const read=async()=>{const response=await fetch(server.url+'/api/runtime/demo-state');assert.equal(response.status,200);const g=await response.json();assert.equal(coherent(g),true);return g;};
 let group=await read(),serial=0,requestSerial=0;
 const command=async(type,payload)=>{
  const dto={version:5,commandId:'followup-http-'+(++serial),expectedRevision:group.snapshot.revision,type,payload};
  const response=await post('/api/runtime/commands',dto);assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.outcome,'succeeded');group=await read();return {dto,receipt};
 };
 const compose=async text=>{
  const response=await post('/api/runtime/demo-npc-compose',{apiVersion:1,requestId:'followup-preview-'+(++requestSerial),simulationId:group.snapshot.simulationId,expectedRevision:group.snapshot.revision,targetId:'actor-2',text});
  assert.equal(response.status,200);return response.json();
 };
 const memory=async()=> (await loadServiceCommit(path.join(directory,`service-commit-r${group.snapshot.revision}.json`))).bundle.snapshot.world.mapModel.memoryModel;
 await command('PlayerGiftFood',{recipientId:'actor-2'});
 const before=structuredClone(group),beforeHashes=await hashes(directory),beforeMemory=await memory();
 const anchor=await compose('我送过的口粮，你记得吗？');await compose('那后来呢？');
 assert.equal(seen[1].recallFocus.source,'none');assert.deepEqual(await read(),before);assert.deepEqual(await hashes(directory),beforeHashes);
 await command('PlayerDialogue',anchor.payload);const anchorSeq=(await memory()).actors[1].speech[0].eventSeq;
 await server.close();server=await startRuntimeServer({...options,npcLanguage});group=await read();
 const followup=await compose('那后来呢？');
 assert.deepEqual(seen[2].recallFocus,{source:'confirmed-player-followup',topics:['food'],anchorEventSeq:anchorSeq});
 assert.ok(seen[2].observations.some(m=>m.kind==='gift'));assert.equal(followup.payload.proposal,null);
 const confirmed=await command('PlayerDialogue',followup.payload);
 const weather=await compose('天气怎么样？');await command('PlayerDialogue',weather.payload);
 await compose('那现在呢？');assert.equal(seen.at(-1).recallFocus.source,'none');
 const durable=structuredClone(group),durableHashes=await hashes(directory),saved=await memory();
 assert.deepEqual(saved.actors.map(a=>a.episodes),beforeMemory.actors.map(a=>a.episodes));assert.equal(saved.actors[1].speech.length,3);
 for(const actor of saved.actors.filter(a=>a.actorId!=='actor-2'))assert.deepEqual(actor.speech,[]);
 for(const marker of ['recallFocus','anchorEventSeq','memoryModel','local-test-only'])assert.equal(JSON.stringify(group).includes(marker),false);
 assert.equal(JSON.stringify(saved).includes('recallFocus'),false);
 await server.close();server=await startRuntimeServer(options);group=await read();
 const retry=await post('/api/runtime/commands',confirmed.dto);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),confirmed.receipt);
 // Provider capability changes on reopen; the five authoritative projections do not.
 for(const key of ['snapshot','map','player','scene','encounter'])assert.deepEqual(group[key],durable[key]);
 assert.deepEqual(await hashes(directory),durableHashes);assert.deepEqual(await memory(),saved);assert.equal(seen.length,5);
});
