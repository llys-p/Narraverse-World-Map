import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {coherent} from '../../demo-runtime-bridge.mjs';

const fixture=process.env.REPLAY_FIXTURE,root=path.resolve(process.env.REPLAY_RUNTIME_ROOT??fileURLToPath(new URL('../../',import.meta.url)));
const {startRuntimeServer}=await import(pathToFileURL(path.join(root,'runtime-server.mjs')));
const {encodeStateFile}=await import(pathToFileURL(path.join(root,'runtime/persistence/bounded-json-file.mjs')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('synthetic 14-day HTTP reopen preserves projections and idempotent retry',{skip:fixture?false:'Set REPLAY_FIXTURE to a synthetic fixture'},async t=>{
 const e=JSON.parse(await fs.readFile(fixture));assert.equal(e.bundle.snapshot.tick,2017);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'replay-reuse-http-'));let server;
 t.after(async()=>{if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});});
 const name='service-commit-r'+e.bundle.snapshot.revision+'.json',bytes=encodeStateFile(e);
 await fs.writeFile(path.join(directory,name),bytes,{flag:'wx'});
 const before=sha(bytes),at=performance.now();
 server=await startRuntimeServer({directory,port:0,writable:true,continuousMarch:true});
 const reopenMs=performance.now()-at,r=await fetch(server.url+'/api/runtime/demo-state');
 assert.equal(r.status,200);const g=await r.json();assert.ok(coherent(g));assert.equal(g.snapshot.tick,2017);
 const last=e.commands.at(-1),retryAt=performance.now(),response=await fetch(server.url+'/api/runtime/commands',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(last.dto)
 });
 const retryMs=performance.now()-retryAt;assert.equal(response.status,200);assert.deepEqual(await response.json(),last.receipt);
 assert.deepEqual((await fs.readdir(directory)).filter(f=>f.endsWith('.json')),[name]);
 assert.equal(sha(await fs.readFile(path.join(directory,name))),before);
 const projections=Object.fromEntries(['snapshot','map','player','scene','encounter'].map(k=>[k,g[k]]));
 console.log(JSON.stringify({measurement:'14-day-reopen-http',root,node:process.version,reopenMs,retryMs,
  fileSha256:before,projectionsSha256:sha(JSON.stringify(projections)),tick:g.snapshot.tick,commands:e.commands.length,
  externalModelCalls:0,scope:'one synthetic saved state; HTTP startup and retry, not visual layout or FPS'}));
});
