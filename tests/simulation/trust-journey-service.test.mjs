import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=async d=>Object.fromEntries(await Promise.all((await fs.readdir(d)).filter(n=>n.endsWith('.json')).sort().map(async n=>[n,sha(await fs.readFile(path.join(d,n)))])));
const project=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));

for(const late of [false,true])test(`fixture7 real worker/HTTP: ${late?'late return fails but repays the loan':'on-time journey earns one title'}, borrowed save reopens and retries once`,async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'trust-http-'));let server,streamAbort,pump,g,serial=0;
 const options={directory,port:0,writable:true,continuousMarch:true};
 const stopStream=async()=>{streamAbort?.abort();await pump;streamAbort=null;pump=null;};
 const stop=async()=>{await stopStream();if(server){await server.close();server=null;}};
 t.after(async()=>{await stop();await fs.rm(directory,{recursive:true,force:true});});
 const read=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const state=await r.json();assert.equal(coherent(state),true);return state;};
 const open=async(first=false)=>{
  server=await startRuntimeServer({...options,...(first?{profile:'campaign-trust-village',seed:42}:{})});g=await read();
  streamAbort=new AbortController();const response=await fetch(server.url+'/api/runtime/demo-events',{signal:streamAbort.signal});assert.equal(response.status,200);
  const reader=response.body.getReader();pump=(async()=>{try{while(!(await reader.read()).done){/* Drain the actual SSE stream so shutdown cannot wait on unread bytes. */}}catch(e){if(e.name!=='AbortError')throw e;}finally{reader.releaseLock();}})();
 };
 const post=(route,body)=>fetch(server.url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const act=async(type,payload={},outcome='succeeded')=>{const dto={version:5,commandId:'trust-http-'+(++serial),expectedRevision:g.snapshot.revision,type,payload};const r=await post('/api/runtime/commands',dto);assert.equal(r.status,200,type);const receipt=await r.json();assert.equal(receipt.outcome,outcome,type+' '+JSON.stringify(receipt));g=await read();return {dto,receipt};};
 const quest=(id,action,outcome)=>act('PlayerQuest',{questId:id,action},outcome);
 const order=async(type,payload)=>{const r=await post('/api/runtime/demo-order',{apiVersion:1,requestId:'trust-order-'+(++serial),type,payload});assert.equal(r.status,200);assert.equal((await r.json()).receipt.outcome,'succeeded');g=await read();};
 const march=async target=>{await order('MarchSet',target);let n=0;while(g.map.order.status!=='arrived'){assert.ok(++n<400,'route must arrive');await new Promise(r=>setTimeout(r,75));g=await read();if(g.map.order.status==='paused'&&!g.runner.active)await order('MarchResume',{});}};
 await open(true);assert.equal(g.capabilities.npcLanguage.enabled,false);assert.equal(g.map.playable.version,2);assert.equal(g.map.playable.quests.length,5);
 for(const file of ['demo-playable-goals.mjs','runtime-playable-contract.mjs']){const response=await fetch(server.url+'/'+file);assert.equal(response.status,200);assert.equal(await response.text(),await fs.readFile(new URL('../../'+file,import.meta.url),'utf8'));}
 await quest('livelihood','accept');await act('PlayerWork');await act('PlayerBuy',{product:'food',quantity:1});await quest('livelihood','claim');
 await quest('hunter-aid','accept');await act('PlayerInteract',{targetId:'actor-2',action:'help'});await act('PlayerGiftFood',{recipientId:'actor-2'});await quest('hunter-aid','claim');
 await quest('forest-route','accept');await march({x:16,y:7});await march({x:4,y:7});await quest('forest-route','claim');
 await quest('hunter-trust','accept');const borrowed=await act('PlayerInteract',{targetId:'actor-2',action:'ask-help'});assert.equal(borrowed.receipt.result.effect,'lent');
 const snapshot=project(g),saved=await files(directory),due=g.map.playable.quests[4].loan.dueTick;
 await stop();await open();assert.deepEqual(project(g),snapshot);assert.deepEqual(await files(directory),saved);
 const retryLoan=await post('/api/runtime/commands',borrowed.dto);assert.equal(retryLoan.status,200);assert.deepEqual(await retryLoan.json(),borrowed.receipt);assert.deepEqual(await files(directory),saved);
 await march({x:16,y:7});assert.deepEqual(g.map.playable.quests[4].progress,[1,0]);await march({x:4,y:7});
 if(late){await act('AdvanceTime',{ticks:due+1-g.map.tick});assert.equal(g.map.playable.quests[4].status,'failed');await quest('hunter-trust','accept','rejected');}
 const returned=await act('PlayerInteract',{targetId:'actor-2',action:'return'});assert.equal(g.map.social.asset.holderId,'actor-2');
 await quest('hunter-trust','claim',late?'rejected':'succeeded');assert.equal(g.map.playable.quests[4].status,late?'failed':'completed');assert.equal(g.map.playable.rank,late?3:4);
 const final=project(g),finalFiles=await files(directory),filename=path.join(directory,`service-commit-r${g.snapshot.revision}.json`);
 assert.equal(JSON.stringify(g).includes('memoryModel'),false);assert.equal(Object.hasOwn(g.map.playable.quests[4].loan,'borrowedSeq'),false);
 await stop();await open();assert.deepEqual(project(g),final);
 const retryReturn=await post('/api/runtime/commands',returned.dto);assert.equal(retryReturn.status,200);assert.deepEqual(await retryReturn.json(),returned.receipt);assert.deepEqual(await files(directory),finalFiles);
 await stop();const commit=await loadServiceCommit(filename),w=commit.bundle.snapshot.world,p=w.mapModel.playModel;
 assert.equal(commit.bundle.snapshot.fixtureVersion,'7');assert.ok(p.trustLoan.returnedSeq>p.trustLoan.borrowedSeq);assert.equal(p.quests[4].status,late?'failed':'completed');
 const memories=w.mapModel.memoryModel.actors[1].episodes;assert.equal(memories.filter(m=>m.kind==='ask-help').length,1);assert.equal(memories.filter(m=>m.kind==='return').length,1);assert.equal(memories.some(m=>m.kind==='overdue'),late);
 console.log(JSON.stringify({measurement:'trust-journey-http',route:late?'late':'on-time',fixture:'7',status:p.quests[4].status,borrowedSaveReopened:true,returnSaveReopened:true,retriesPreservedFiles:true,durableFiles:Object.keys(finalFiles).length,externalModelCalls:0,browserRendering:false}));
});
