import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {performance} from 'node:perf_hooks';
import {startRuntimeServer} from '../../runtime-server.mjs';import {coherent} from '../../demo-runtime-bridge.mjs';
test('seven-day worker simulation keeps HTTP reads responsive and restores all quest, life and budget state',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'playable-long-'));let server;t.after(async()=>{if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});});
 const options={directory,port:0,writable:true,continuousMarch:true},openedAt=performance.now();server=await startRuntimeServer({...options,profile:'campaign-playable-village',seed:42});const initialOpenMs=performance.now()-openedAt;
 const read=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const g=await r.json();assert.ok(coherent(g));return g;};let g=await read();
 for(const f of ['demo-runtime.html','demo-playable-goals.mjs','runtime-playable-contract.mjs','runtime-campaign-contract.mjs'])assert.equal((await fetch(server.url+'/'+f)).status,200,f);
 const dto={version:5,commandId:'long-seven',expectedRevision:g.snapshot.revision,type:'AdvanceTime',payload:{ticks:1008}};
 let done=false;const submitAt=performance.now(),response=fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)}).then(async r=>{assert.equal(r.status,200);const value=await r.json();assert.equal(value.outcome,'succeeded');done=true;return value;});
 const reads=[];while(!done&&reads.length<30){const at=performance.now();const view=await read();reads.push(performance.now()-at);assert.ok([g.snapshot.tick,1008].includes(view.snapshot.tick));await new Promise(r=>setTimeout(r,25));}
 await response;const submitAndSaveMs=performance.now()-submitAt;g=await read();assert.equal(g.snapshot.tick,1008);assert.ok(reads.length>0);assert.ok(Math.max(...reads)<1000,'cached HTTP reads should stay below the one-second safety gate');
 const durable=structuredClone(g);await server.close();const reopenAt=performance.now();server=await startRuntimeServer(options);const reopenMs=performance.now()-reopenAt;g=await read();for(const k of ['snapshot','map','player','scene','encounter'])assert.deepEqual(g[k],durable[k]);
 // Timings are diagnostic environment measurements, not browser frame-rate claims.
 console.log(JSON.stringify({measurement:'cached-HTTP-read-during-worker',initialOpenMs,submitAndSaveMs,reopenMs,samples:reads.length,maxMs:Math.max(...reads),medianMs:[...reads].sort((a,b)=>a-b)[Math.floor(reads.length/2)]}));
});
