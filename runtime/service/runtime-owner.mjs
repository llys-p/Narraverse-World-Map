import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPersonalityNeutral } from '../fixtures/personality-village.mjs';
import { memorySystems } from '../fixtures/memory-village.mjs';
import { PERSONALITY_RULES } from '../core/memory-runtime.mjs';
import { createSimulationSession } from '../core/command-engine.mjs';
import { saveCheckpoint,loadCheckpoint } from '../persistence/checkpoint-store.mjs';
import { record,requireCondition,integer,cloneData,fault } from '../core/data-contract.mjs';
import { projectPublicSnapshot } from './http-contract.mjs';
const LOCK='.runtime-owner.lock',MAX_CHECKPOINTS=128;
async function ownsLock(file,token){
  const handle=await fs.open(file,'r');
  try{
    const expected=Buffer.from(token),stat=await handle.stat();if(!stat.isFile() || stat.size!==expected.length)return false;
    const bytes=Buffer.alloc(expected.length+1);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(bytesRead===0)break;offset+=bytesRead;}
    return offset===expected.length && bytes.subarray(0,offset).equals(expected);
  }finally{await handle.close();}
}
async function inspectDirectory(directory){
  const checkpoints=[],entries=await fs.opendir(directory);let count=0;
  for await(const entry of entries){
    if(entry.name===LOCK)continue;
    requireCondition(++count<=MAX_CHECKPOINTS,'Runtime directory exceeds file budget','LIMIT_EXCEEDED');
    const match=/^checkpoint-r(0|[1-9][0-9]*)\.json$/.exec(entry.name);
    requireCondition(match && entry.isFile(),'Runtime directory contains foreign files');
    const revision=Number(match[1]);integer(revision);checkpoints.push({file:path.join(directory,entry.name),revision});
  }
  return checkpoints.sort((a,b)=>b.revision-a.revision);
}
export async function createRuntimeOwner(options){
  record(options);requireCondition(Object.keys(options).every(k=>['directory','seed','checkpoint'].includes(k)),'Unknown owner option');
  requireCondition(typeof options.directory==='string' && options.directory.length>0,'Explicit runtime directory required');
  if(options.seed!==undefined){integer(options.seed);requireCondition(options.seed<=0xffffffff,'Invalid runtime seed');}
  if(options.checkpoint!==undefined)requireCondition(typeof options.checkpoint==='string' && options.checkpoint.length>0 && options.seed===undefined,'Checkpoint cannot reset seed');
  const directory=path.resolve(options.directory);await fs.mkdir(directory,{recursive:true});
  // Inventory first, then atomic ownership, then inventory again to close startup races.
  await inspectDirectory(directory);const lockPath=path.join(directory,LOCK),token=JSON.stringify({ownerId:randomUUID(),pid:process.pid});let handle;
  try{handle=await fs.open(lockPath,'wx');}catch(cause){if(cause.code==='EEXIST')throw fault('OWNER_BUSY','Runtime directory already has an owner');throw cause;}
  let released=false;
  const release=async()=>{
    if(released)return;released=true;await handle.close();
    try{if(await ownsLock(lockPath,token))await fs.unlink(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  };
  try{
    await handle.writeFile(token,'utf8');await handle.sync();const checkpoints=await inspectDirectory(directory),systems=memorySystems();let bundle;
    if(checkpoints.length){
      requireCondition(options.checkpoint===undefined,'Cannot replace existing runtime checkpoint');
      bundle=await loadCheckpoint(checkpoints[0].file,{rulesVersion:PERSONALITY_RULES,systems});
      requireCondition(bundle.snapshot.revision===checkpoints[0].revision,'Checkpoint filename/revision mismatch','INVALID_CHECKPOINT');
      requireCondition(options.seed===undefined || options.seed===bundle.snapshot.rng.seed,'Cannot reset existing runtime seed');
    }else{
      bundle=options.checkpoint===undefined?createPersonalityNeutral(options.seed??42).bundle:
        await loadCheckpoint(options.checkpoint,{rulesVersion:PERSONALITY_RULES,systems});
    }
    requireCondition(bundle.snapshot.fixtureId==='personality-neutral','Runtime service profile is not registered','UNSUPPORTED_VERSION');
    let session=createSimulationSession(bundle,systems);const projection=projectPublicSnapshot(session.getBundle());
    if(!checkpoints.length)await saveCheckpoint(bundle,{directory,rulesVersion:PERSONALITY_RULES,systems});
    // D1 exposes no advance/submit operation; this audited view remains current.
    // Keeping the private session until close leaves one owner for the future D2 writer.
    return Object.freeze({getSnapshot(){requireCondition(session!==null,'Runtime owner is closed','OWNER_CLOSED');return cloneData(projection);},
      async close(){session=null;await release();}});
  }catch(cause){await release();throw cause;}
}
