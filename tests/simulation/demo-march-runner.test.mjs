import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createMarchRunner} from '../../runtime/service/march-runner.mjs';
import {startRuntimeServer} from '../../runtime-server.mjs';

test('runner owns bounded steps, reserves pause and ignores offline wall time',async()=>{
 let revision=0,remaining=4,order=null;const history=[];
 const owner={getSnapshot:()=>({revision}),getMap:()=>({self:{alive:true},contact:null,order,budget:{remainingCommands:remaining}}),
  getCommittedCommand:id=>history.find(e=>e.dto.commandId===id),
  async submit(dto){const old=history.find(e=>e.dto.commandId===dto.commandId);if(old){assert.deepEqual(dto,old.dto);return old.receipt;}assert.equal(dto.expectedRevision,revision);revision++;remaining--;
   if(dto.type==='MarchSet')order={status:'marching'};if(dto.type==='MarchPause')order.status='paused';
   const receipt={outcome:'succeeded',revision};history.push({dto,receipt});return receipt;}};
 const runner=createMarchRunner(owner,{intervalMs:10});const detach=runner.attach();
 try{
  const intent={requestId:'set',type:'MarchSet',payload:{x:16,y:7}};
  const first=await runner.order(intent);assert.deepEqual(await runner.order(intent),first);
  await delay(90);assert.deepEqual(history.map(e=>e.dto.type),['MarchSet','MarchStep','MarchStep','MarchPause']);
  assert.equal(remaining,0);assert.equal(runner.status().reason,'budget-limit');
  detach();const count=history.length;await delay(35);assert.equal(history.length,count);
 }finally{await runner.close();}
});

test('HTTP orders persist ordinary DTO5 commands and disconnect stops further marching',async()=>{
 const directory=await fs.mkdtemp(path.resolve('artifacts/d4e12/runner-'));
 let server=await startRuntimeServer({directory,profile:'campaign-village',seed:42,port:0,writable:true,continuousMarch:true});
 const controller=new AbortController();let reader;
 const get=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);return r.json();};
 const post=async(body,endpoint='demo-order')=>fetch(server.url+'/api/runtime/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 try{
  const stream=await fetch(server.url+'/api/runtime/demo-events',{signal:controller.signal});reader=stream.body.getReader();await reader.read();
  const body={apiVersion:1,requestId:'http-set',type:'MarchSet',payload:{x:16,y:7}};
  const first=await post(body);assert.equal(first.status,200);const confirmed=await first.json();
  const duplicate=await post(body);assert.deepEqual(await duplicate.json(),confirmed);
  assert.equal((await post({...body,payload:{x:4,y:9}})).status,409);
  assert.equal((await post({...body,requestId:'injected-step',type:'MarchStep'})).status,400);
  assert.equal((await post({...confirmed.command,commandId:'browser-step',type:'MarchStep',expectedRevision:(await get()).snapshot.revision},'commands')).status,400);
  await post({apiVersion:1,requestId:'http-resume',type:'MarchResume',payload:{}});
  await delay(700);await post({apiVersion:1},'demo-stop');const stopped=await get();
  controller.abort();await reader.cancel().catch(()=>{});await delay(650);assert.deepEqual((await get()).map.self,stopped.map.self);
  const before=await get();await server.close();server=null;
  assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));
  server=await startRuntimeServer({directory,port:0,writable:true,continuousMarch:true});
  const after=await get();for(const key of ['snapshot','map','player','encounter','scene'])assert.deepEqual(after[key],before[key]);
  assert.equal(after.runner.active,false);await delay(600);assert.equal((await get()).snapshot.revision,after.snapshot.revision);
 }finally{controller.abort();if(reader)await reader.cancel().catch(()=>{});if(server)await server.close();}
});
