import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';

const projections=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
async function hashes(directory){
 const names=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort();
 return Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(directory,n))).digest('hex')])));
}

test('fixture5 real HTTP/worker: private memory reaches the provider, preview is read-only, durable dialogue and actions survive reopen and same-DTO retry once',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-npc8-')),calls=[];let server;
 const mock=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks)),context=JSON.parse(body.messages[1].content).npc;calls.push(context);
  assert.equal(req.headers.authorization,'Bearer local-test-only');
  const injury=context.observations.find(m=>m.kind==='smash');
  const output={reply:'我记得工具受损，也看到了后来的修理；你刚才说的话我还需要核实。',memoryRefs:[injury.eventSeq],proposal:null};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 t.after(async()=>{if(server)await server.close();await new Promise(r=>mock.close(r));await fs.rm(directory,{recursive:true,force:true});});
 const options={directory,port:0,writable:true,continuousMarch:true};
 const npcLanguage={enabled:true,baseURL:`http://127.0.0.1:${mock.address().port}/v1`,model:'controlled-memory-http',apiKey:'local-test-only'};
 server=await startRuntimeServer({...options,profile:'campaign-memory-village',seed:42,npcLanguage});
 const read=async()=>{const response=await fetch(server.url+'/api/runtime/demo-state');assert.equal(response.status,200);const g=await response.json();assert.equal(coherent(g),true);return g;};
 const post=(route,body)=>fetch(server.url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 let group=await read(),serial=0;assert.equal(group.map.mapViewVersion,3);
 const command=async(type,payload)=>{
  const dto={version:5,commandId:'memory-http-'+(++serial),expectedRevision:group.snapshot.revision,type,payload};
  const response=await post('/api/runtime/commands',dto);assert.equal(response.status,200);
  const receipt=await response.json();assert.equal(receipt.outcome,'succeeded');group=await read();return {dto,receipt};
 };
 await command('PlayerInteract',{targetId:'actor-2',action:'smash'});
 await command('PlayerInteract',{targetId:'actor-2',action:'help'});
 const apology=await command('PlayerInteract',{targetId:'actor-2',action:'apologize'});
 const before=projections(group),beforeHashes=await hashes(directory);
 const request={apiVersion:1,requestId:'memory-http-preview',simulationId:group.snapshot.simulationId,expectedRevision:group.snapshot.revision,targetId:'actor-2',text:'工具修好了吗？我说商人偷过工具，你会相信吗？'};
 const response=await post('/api/runtime/demo-npc-compose',request);assert.equal(response.status,200);const draft=await response.json();
 assert.deepEqual(await hashes(directory),beforeHashes);assert.deepEqual(projections(await read()),before);
 assert.equal(calls.length,1);const context=calls[0];assert.equal(context.memoryMode,'npc-memory-v1');
 assert.deepEqual(context.memoryCoverage,{forgottenEpisodes:0,forgottenSpeech:0});
 const damage=context.memoryUpdates.find(m=>m.topic==='damage');assert.equal(damage.status,'damage-remains');assert.equal(damage.followUpRefs.length,1);
 assert.equal(context.observations.find(m=>m.kind==='smash').observedState.condition,20);
 assert.equal(context.knownFacts.tool.condition,40);
 const spoken=await command('PlayerDialogue',draft.payload),durable=projections(group),durableHashes=await hashes(directory);
 const stateText=JSON.stringify(group);
 for(const key of ['memoryModel','observedState','memoryUpdates','memoryCoverage','knownFacts','local-test-only'])assert.equal(stateText.includes(key),false);
 assert.equal((await fetch(server.url+'/api/runtime/npcContext')).status,404);
 const filename=path.join(directory,`service-commit-r${group.snapshot.revision}.json`),commit=await loadServiceCommit(filename);
 const memory=commit.bundle.snapshot.world.mapModel.memoryModel;
 assert.equal(commit.bundle.snapshot.fixtureVersion,'5');assert.equal(memory.actors[1].episodes.length,3);assert.equal(memory.actors[1].speech.length,1);
 assert.equal(memory.actors[1].speech[0].utterance,request.text);assert.deepEqual(memory.actors[1].speech[0].memoryRefs,draft.payload.memoryRefs);
 assert.equal(memory.actors[1].episodes.some(m=>m.kind==='steal'),false);
 for(const actor of memory.actors.filter(a=>a.actorId!=='actor-2'))assert.deepEqual(actor.speech,[]);
 await server.close();server=await startRuntimeServer(options);group=await read();
 assert.equal(group.capabilities.npcLanguage.enabled,false);assert.deepEqual(projections(group),durable);
 for(const {dto,receipt} of [apology,spoken]){
  const retry=await post('/api/runtime/commands',dto);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),receipt);
 }
 assert.deepEqual(projections(await read()),durable);assert.deepEqual(await hashes(directory),durableHashes);assert.equal(calls.length,1);
 await server.close();server=null;
 const reopened=await loadServiceCommit(filename);assert.deepEqual(reopened.bundle.snapshot.world.mapModel.memoryModel,memory);assert.equal(reopened.commands.length,4);
});
