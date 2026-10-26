import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import { fault, requireCondition } from '../core/data-contract.mjs';
export const MAX_STATE_FILE_BYTES=64*1024*1024;
let sequence=0;
// Callers validate their entire domain envelope before encoding data properties.
function* parts(value){
  if(value===null || typeof value!=='object'){yield JSON.stringify(value);return;}
  const array=Array.isArray(value),keys=array?value.keys():Object.keys(value).sort();
  yield array?'[':'{';let first=true;
  for(const key of keys){if(!first)yield ',';first=false;if(!array){yield JSON.stringify(key);yield ':';}yield* parts(value[key]);}
  yield array?']':'}';
}
export function encodeStateFile(envelope){
  let length=0;for(const part of parts(envelope)){
    length+=Buffer.byteLength(part);requireCondition(length<=MAX_STATE_FILE_BYTES,'State file exceeds budget','LIMIT_EXCEEDED');}
  const bytes=Buffer.alloc(length);let offset=0;
  for(const part of parts(envelope))offset+=bytes.write(part,offset,undefined,'utf8');return bytes;
}
export async function publishStateFile(envelope,target,io=defaultIo){
  const bytes=encodeStateFile(envelope),directory=path.dirname(target),temporary=path.join(directory,`.${path.basename(target)}.${process.pid}.${++sequence}.tmp`);
  let handle,created=false;
  try{
    await io.mkdir(directory,{recursive:true});handle=await io.open(temporary,'wx');created=true;
    await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;
    await io.link(temporary,target);return target;
  }catch(cause){throw Object.assign(fault('SAVE_FAILED','State publication failed'),{cause});}
  finally{if(handle){try{await handle.close();}catch{}}if(created){try{await io.unlink(temporary);}catch{}}}
}
export async function readStateFile(file,io=defaultIo){
  let handle;
  try{
    handle=await io.open(path.resolve(file),'r');const stat=await handle.stat();
    requireCondition(stat.isFile(),'State is not a regular file');
    requireCondition(stat.size<=MAX_STATE_FILE_BYTES,'State file exceeds budget','LIMIT_EXCEEDED');
    const bytes=Buffer.alloc(stat.size);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
      requireCondition(bytesRead>0,'State file truncated');offset+=bytesRead;}
    requireCondition((await handle.read(Buffer.alloc(1),0,1,offset)).bytesRead===0,'State file grew');return bytes;
  }finally{if(handle)await handle.close();}
}
