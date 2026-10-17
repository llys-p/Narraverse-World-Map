import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createThreadedRuntimeOwner} from '../../runtime/service/runtime-owner-thread.mjs';
import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';

test('worker preserves committed views, exact retries, full restore and tamper refusal',async()=>{
 const directory=await fs.mkdtemp(path.resolve('artifacts/d4e12/worker-'));
 let owner=await createThreadedRuntimeOwner({directory,seed:42,profile:'campaign-village',writable:true});
 const views=()=>[owner.getSnapshot(),owner.getMap(),owner.getPlayer(),owner.getEncounter(),owner.getScene()];
 const dto={version:5,commandId:'worker-fixed',expectedRevision:0,type:'MarchSet',payload:{x:16,y:7}};
 try{
  const failedViews=views(),unexpected=path.join(directory,'service-commit-r99.json');
  await fs.copyFile(path.join(directory,'service-commit-r0.json'),unexpected);
  await assert.rejects(owner.submit(dto));assert.deepEqual(views(),failedViews);assert.equal(owner.getCommittedCommand(dto.commandId),null);
  await fs.unlink(unexpected); // Remove only the synthetic file made immediately above.
  const before=views(),pending=owner.submit(dto);assert.deepEqual(views(),before);
  const receipt=await pending;assert(views().every(v=>v.revision===1));
  assert.deepEqual(await owner.submit(dto),receipt);
  await assert.rejects(owner.submit({...dto,payload:{x:4,y:7}}),{code:'COMMAND_ID_CONFLICT'});
  const detached=owner.getCommittedCommand(dto.commandId);detached.dto.payload.x=0;
  assert.equal(owner.getCommittedCommand(dto.commandId).dto.payload.x,16);
  const raw={...dto};let getterCalls=0;Object.defineProperty(raw,'payload',{enumerable:true,get(){getterCalls++;return {};}});
  await assert.rejects(async()=>owner.submit(raw));assert.equal(getterCalls,0);
  const after=views(),file=path.join(directory,'service-commit-r1.json'),bytes=await fs.readFile(file);
  await owner.close();await owner.close();assert.throws(()=>owner.getSnapshot());
  assert(!(await fs.readdir(directory)).some(n=>n.endsWith('.lock')));
  const loaded=await loadServiceCommit(file);assert.deepEqual(loaded.commands[0].receipt,receipt);
  owner=await createThreadedRuntimeOwner({directory,writable:true});assert.deepEqual(views(),after);
  assert.deepEqual(await owner.submit(dto),receipt);await owner.close();assert.deepEqual(await fs.readFile(file),bytes);
  const anchored=await fs.mkdtemp(path.resolve('artifacts/d4e12/worker-anchor-'));
  await fs.writeFile(path.join(anchored,'service-commit-r1.json'),JSON.stringify({serviceFormatVersion:11,anchor:loaded.bundle,commands:[],bundle:loaded.bundle}));
  const anchorOwner=await createThreadedRuntimeOwner({directory:anchored,writable:true});
  try{assert.deepEqual(anchorOwner.getCommittedCommand(dto.commandId).receipt,receipt);assert.deepEqual(await anchorOwner.submit(dto),receipt);}finally{await anchorOwner.close();}
  const invalid=structuredClone(loaded);invalid.commands[0].receipt.outcome='rejected';
  const forged=await fs.mkdtemp(path.resolve('artifacts/d4e12/worker-forged-'));
  const forgedFile=path.join(forged,'service-commit-r1.json'),forgedBytes=JSON.stringify(invalid);await fs.writeFile(forgedFile,forgedBytes);
  await assert.rejects(createThreadedRuntimeOwner({directory:forged,writable:true}),{code:'INVALID_SERVICE_COMMIT'});
  assert.equal(await fs.readFile(forgedFile,'utf8'),forgedBytes);assert(!(await fs.readdir(forged)).some(n=>n.endsWith('.lock')));
 }finally{await owner.close();}
});
