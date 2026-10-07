import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { request } from 'node:http';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { loadServiceCommit } from '../../runtime/service/service-commit.mjs';
const dto=(commandId,expectedRevision=0,ticks=144)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-time-http-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
async function post(url,d){const r=await fetch(url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});return {status:r.status,body:await r.json()};}
test('D2A real HTTP: explicit writable mode, concurrent revisions, original receipt after later commands and disk restart',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>server.close());
  assert.equal((await (await fetch(server.url+'/api/runtime/capabilities')).json()).writes,true);
  const pair=await Promise.all([post(server.url,dto('first')),post(server.url,dto('racing'))]);
  assert.deepEqual(pair.map(x=>x.status).sort(),[200,409]);const winner=pair.find(x=>x.status===200),loser=pair.find(x=>x.status===409);
  assert.equal(loser.body.error.code,'REVISION_CONFLICT');assert.equal(loser.body.currentRevision,144);
  const id=winner.body.commandId;assert.deepEqual(await post(server.url,dto(id)),winner);
  assert.equal((await post(server.url,dto(id,144,1))).body.error.code,'COMMAND_ID_CONFLICT');
  assert.equal((await post(server.url,dto('next',144,1))).status,200);
  assert.equal((await (await fetch(server.url+'/api/runtime/snapshot')).json()).tick,145);
  await server.close();const restored=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>restored.close());
  assert.deepEqual(await post(restored.url,dto(id)),winner);
  assert.equal((await (await fetch(restored.url+'/api/runtime/snapshot')).json()).tick,145);
});
test('D2A real HTTP parser denies invalid bodies without disk writes and accepts bounded chunked DTO',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>server.close());
  for(const [body,headers,status] of [
    ['{}',{'Content-Type':'text/plain'},415],['{"version":1,"version":1}',{'Content-Type':'application/json'},400],
    [Buffer.from([0xff]),{'Content-Type':'application/json'},400],['x'.repeat(4097),{'Content-Type':'application/json'},413],
    [JSON.stringify(dto('foreign')),{'Content-Type':'application/json',Origin:'http://foreign.example'},403]]){
    const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers,body});assert.equal(r.status,status);
    assert.equal((await (await fetch(server.url+'/api/runtime/snapshot')).json()).tick,0);
    assert.equal((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).length,1);
  }
  const chunk=await new Promise((resolve,reject)=>{const req=request(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{
    let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});req.on('error',reject);
    const text=JSON.stringify(dto('chunk'));req.write(text.slice(0,20));req.end(text.slice(20));});
  assert.equal(chunk.status,200);assert.equal(chunk.body.tick,144);
});
test('D2A lost HTTP response persists one commit, restart and retry cannot double apply',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>server.close());
  await new Promise((resolve,reject)=>{const req=request(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{
    // Drop the response before parsing/acknowledging it; only the disk can answer the subsequent retry.
    res.destroy();resolve();});req.on('error',reject);req.end(JSON.stringify(dto('lost')));});
  await server.close();const disk=await loadServiceCommit(path.join(directory,'service-commit-r144.json'));assert.equal(disk.commands.length,1);
  const restored=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>restored.close());
  const retry=await post(restored.url,dto('lost'));assert.equal(retry.status,200);assert.deepEqual(retry.body,disk.commands[0].receipt);
  assert.equal((await (await fetch(restored.url+'/api/runtime/snapshot')).json()).tick,144);
});
test('D2A streaming body exceeds budget or aborts before completion without committing; later requests remain usable',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>server.close());
  const status=await new Promise((resolve,reject)=>{const req=request(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{
    res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('x'.repeat(4096));req.end('x');});assert.equal(status,413);
  await new Promise(resolve=>{const req=request(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'4000'}});
    req.on('error',()=>resolve());req.on('socket',socket=>socket.once('connect',()=>{req.write('{');setImmediate(()=>req.destroy());}));});
  assert.equal((await (await fetch(server.url+'/api/runtime/snapshot')).json()).tick,0);
  assert.equal((await post(server.url,dto('after-abort',0,1))).status,200);
});
