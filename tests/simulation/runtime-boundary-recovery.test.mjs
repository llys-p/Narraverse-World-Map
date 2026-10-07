import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { projectPublicSnapshot } from '../../runtime/service/http-contract.mjs';

const dto={version:1,commandId:'retry-1',expectedRevision:0,type:'AdvanceTime',payload:{ticks:1}};
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-boundary-recovery-'),directory=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(directory)&&directory.startsWith(prefix));await fs.rm(directory,{recursive:true,force:true});});return directory;}
async function post(url){const response=await fetch(url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});
  return {status:response.status,body:await response.json()};}

test('boundary: losing the owned lock returns 503 OWNER_BUSY with no state/receipt write or automatic lock takeover',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>server.close());
  const file=path.join(directory,'service-commit-r0.json'),bytes=await fs.readFile(file),lock=path.join(directory,'.runtime-owner.lock');
  assert.equal(JSON.parse(await fs.readFile(lock,'utf8')).pid,process.pid);await fs.unlink(lock);
  for(let i=0;i<2;i++){const result=await post(server.url);assert.equal(result.status,503);assert.equal(result.body.error.code,'OWNER_BUSY');}
  assert.deepEqual(await fs.readFile(file),bytes);assert.deepEqual(await fs.readdir(directory),['service-commit-r0.json']);
  assert.equal((await(await fetch(server.url+'/api/runtime/snapshot')).json()).tick,0);await server.close();
});
test('boundary: missing published files return a typed 503 INVALID_SERVICE_COMMIT, retain the live view and permit retry after test-only restoration',async t=>{
  const directory=path.join(await temporary(t),'world'),server=await startRuntimeServer({directory,port:0,writable:true});t.after(()=>server.close());
  const file=path.join(directory,'service-commit-r0.json'),bytes=await fs.readFile(file);await fs.unlink(file);
  const result=await post(server.url);assert.equal(result.status,503);assert.equal(result.body.error.code,'INVALID_SERVICE_COMMIT');
  assert.equal((await(await fetch(server.url+'/api/runtime/snapshot')).json()).tick,0);assert.deepEqual(await fs.readdir(directory),['.runtime-owner.lock']);
  await fs.writeFile(file,bytes,{flag:'wx'});assert.equal((await post(server.url)).status,200);
});
test('boundary: checkpoint crash temporaries preserve completed read-only state, never replace it and reject wrong-family or incomplete initialization',async t=>{
  const base=await temporary(t),directory=path.join(base,'world'),first=await createRuntimeOwner({directory});const before=first.getSnapshot();await first.close();
  const file=path.join(directory,'checkpoint-r0.json'),bytes=await fs.readFile(file),orphan=path.join(directory,'.checkpoint-r0.json.999.1.tmp');
  await fs.link(file,orphan);const unfinished=path.join(directory,'.checkpoint-r144.json.999.2.tmp');await fs.writeFile(unfinished,'unfinished');
  const restored=await createRuntimeOwner({directory});assert.deepEqual(restored.getSnapshot(),before);await restored.close();
  assert.deepEqual(await fs.readFile(file),bytes);assert.equal(await fs.readFile(unfinished,'utf8'),'unfinished');assert.equal((await fs.stat(orphan)).isFile(),true);
  const incomplete=path.join(base,'incomplete');await fs.mkdir(incomplete);await fs.writeFile(path.join(incomplete,'.checkpoint-r0.json.999.1.tmp'),'unfinished');
  await assert.rejects(createRuntimeOwner({directory:incomplete}),e=>e.code==='INVALID_INPUT');
  await fs.writeFile(path.join(directory,'.service-commit-r0.json.999.3.tmp'),'other family');
  await assert.rejects(createRuntimeOwner({directory}),e=>e.code==='INVALID_INPUT');
});
test('boundary: checkpoint temporary budget rejects a compact 129-file directory without deleting any artifacts',async t=>{
  const directory=path.join(await temporary(t),'world'),owner=await createRuntimeOwner({directory});await owner.close();
  for(let i=1;i<=129;i++)await fs.writeFile(path.join(directory,`.checkpoint-r0.json.999.${i}.tmp`),'x');
  await assert.rejects(createRuntimeOwner({directory}),e=>e.code==='LIMIT_EXCEEDED');assert.equal((await fs.readdir(directory)).length,130);
});

async function page(){
  const elements=new Map(),element=()=>({textContent:'',hidden:false,disabled:false,value:'6',dataset:{},handlers:{},append(){},replaceChildren(){},addEventListener(name,fn){this.handlers[name]=fn;}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,documentElement:{dataset:{}}};
  const snapshot=projectPublicSnapshot(createPersonalityNeutral().bundle),requests=[];let answer,id=0;
  const good=body=>({ok:true,status:200,json:async()=>structuredClone(body)});
  const context=vm.createContext({document,AbortSignal,crypto:{randomUUID:()=> 'intent-'+(++id)},fetch:async(route,options)=>{
    if(route==='/api/runtime/commands'){requests.push(JSON.parse(options.body));return answer();}
    return good(route.endsWith('capabilities')?{apiVersion:1,writes:true,playerAvailable:false}:snapshot);
  }});
  vm.runInContext(await fs.readFile(new URL('../../runtime-map.mjs',import.meta.url),'utf8'),context);
  while(elements.get('connection')?.dataset.state!=='ready')await new Promise(resolve=>setImmediate(resolve));
  return {elements,requests,context,setAnswer(fn){answer=fn;},submit:()=>vm.runInContext('submitTime()',context)};
}
test('boundary: non-JSON permanent rejection releases intent, including conflict before body parsing, and permits a fresh click',async()=>{
  for(const status of [400,405,409,413,415]){
    const p=await page();let bodyReads=0;p.setAnswer(()=>({ok:false,status,json:async()=>{bodyReads++;throw new SyntaxError('plain text or HTML');}}));
    await p.submit();assert.equal(vm.runInContext('pending',p.context),null,status);assert.equal(bodyReads,0,status);
    assert.equal(p.elements.get('advance').textContent,'推进世界时间');assert.equal(p.elements.get('advance-ticks').disabled,false);
    await p.submit();assert.notEqual(p.requests[0].commandId,p.requests[1].commandId,status);
  }
});
test('boundary: uncertain HTML 502, transport loss or malformed success preserves the exact intent until original committed receipt confirms it',async()=>{
  for(const mode of ['gateway','transport','bad-success']){
    const p=await page();p.setAnswer(()=>{if(mode==='transport')throw new Error('disconnected');return {ok:mode==='bad-success',status:mode==='gateway'?502:200,json:async()=>{throw new SyntaxError('not JSON');}};});
    await p.submit();const original=p.requests[0];assert.equal(p.elements.get('advance').textContent,'重试同一请求');
    p.setAnswer(()=>({ok:true,status:200,json:async()=>({apiVersion:1,commandId:original.commandId,status:'committed',fromRevision:0,toRevision:6,tick:6})}));
    await p.submit();assert.deepEqual(p.requests[1],original);assert.equal(vm.runInContext('pending',p.context),null);
  }
});
