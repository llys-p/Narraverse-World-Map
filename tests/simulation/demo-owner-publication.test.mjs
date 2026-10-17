import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRuntimeOwner} from '../../runtime/service/runtime-owner.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';

test('campaign owner publishes all projections together only after durable save',async()=>{
 const directory=await fs.mkdtemp(path.resolve('artifacts/d4e12/publication-'));let fail=false;
 const io=new Proxy(fs,{get(t,k){if(k==='link')return async(...args)=>{if(fail)throw Object.assign(Error('injected EIO'),{code:'EIO'});return fs.link(...args);};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});
 const owner=await createRuntimeOwner({directory,profile:'campaign-village',seed:42,writable:true},io);
 const read=()=>[owner.getSnapshot(),owner.getMap(),owner.getPlayer(),owner.getEncounter(),owner.getScene()];
 try{
  const before=read(),files=await fs.readdir(directory),dto={version:5,commandId:'durable-order',expectedRevision:0,type:'MarchSet',payload:{x:16,y:7}};
  fail=true;await assert.rejects(owner.submit(dto));assert.deepEqual(read(),before);assert.deepEqual(await fs.readdir(directory),files);assert.equal(owner.getCommittedCommand(dto.commandId),null);
  fail=false;const receipt=await owner.submit(dto);assert.equal(receipt.outcome,'succeeded');assert.deepEqual(await owner.submit(dto),receipt);
  const changed=read();assert(changed.every(v=>v.revision===1&&v.tick===0));const found=owner.getCommittedCommand(dto.commandId);found.dto.payload.x=0;assert.equal(owner.getCommittedCommand(dto.commandId).dto.payload.x,16);
  await assert.rejects(owner.submit({...dto,payload:{x:4,y:9}}),{code:'COMMAND_ID_CONFLICT'});
  assert(!coherent({}));assert(!coherent({apiVersion:1,capabilities:{continuousMarch:true}}));
 }finally{await owner.close();}
 assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));
});
