import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ServerResponse} from 'node:http';
import {getDefaultHighWaterMark,setDefaultHighWaterMark} from 'node:stream';
import {startRuntimeServer} from '../../runtime-server.mjs';

test('a draining SSE connection survives a full write buffer and delivers the committed forest revision',async()=>{
 const previous=getDefaultHighWaterMark(false),write=ServerResponse.prototype.write;
 let backpressured=0,server,reader;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 ServerResponse.prototype.write=function(...args){const accepted=write.apply(this,args);if(typeof args[0]==='string'&&args[0].startsWith('data: ')&&!accepted)backpressured++;return accepted;};
 setDefaultHighWaterMark(false,1); // Real HTTP sockets, deliberately smaller than one state frame.
 try{
  const directory=await fs.mkdtemp(path.resolve('artifacts/d4e12/event-buffer-'));
  server=await startRuntimeServer({directory,profile:'campaign-forest-village',seed:42,port:0,writable:true,continuousMarch:true,npcLanguage:{enabled:false}});
  const stream=await fetch(server.url+'/api/runtime/demo-events',{signal:controller.signal});assert.equal(stream.status,200);reader=stream.body.getReader();
  const decoder=new TextDecoder();let buffer='';
  const revision=async expected=>{for(;;){let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.startsWith('data: ')&&JSON.parse(frame.slice(6)).snapshot.revision===expected)return;}
   const part=await reader.read();assert.equal(part.done,false,'Event stream ended during ordinary buffer pressure');buffer+=decoder.decode(part.value,{stream:true});}};
  await revision(0);
  const response=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:5,commandId:'buffer-quest',expectedRevision:0,type:'PlayerQuest',payload:{questId:'livelihood',action:'accept'}}),signal:controller.signal});
  assert.equal(response.status,200);await response.json();await revision(1);
  assert.ok(backpressured>0,'The test must exercise an actual false return from ServerResponse.write');
  const state=await (await fetch(server.url+'/api/runtime/demo-state',{signal:controller.signal})).json();assert.equal(state.runner.viewers,1);assert.equal(state.snapshot.revision,1);
 }finally{clearTimeout(timer);controller.abort();await reader?.cancel().catch(()=>{});if(server)await server.close();ServerResponse.prototype.write=write;setDefaultHighWaterMark(false,previous);}
});
