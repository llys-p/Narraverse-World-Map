import * as defaultIo from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
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
  // 复用原有片段/键序，每片先检查总字节限额；每64KiB聚合一次，避免二次遍历和逐片写入。
  // 暂存缓冲总量不超过一个文件上限，最后只合并一次。
  let length=0,text='',textBytes=0;const chunks=[];
  const flush=()=>{if(textBytes){chunks.push(Buffer.from(text));text='';textBytes=0;}};
  for(const part of parts(envelope)){
    const bytes=Buffer.byteLength(part);length+=bytes;requireCondition(length<=MAX_STATE_FILE_BYTES,'State file exceeds budget','LIMIT_EXCEEDED');
    if(textBytes+bytes>65536)flush();
    if(bytes>65536)chunks.push(Buffer.from(part));else{text+=part;textBytes+=bytes;}
  }
  flush();return Buffer.concat(chunks,length);
}
export async function publishStateFile(envelope,target,io=defaultIo){
  return publishBytes(encodeStateFile(envelope),target,io);
}
// 仅说明本次实际编码的完整字节；不是世界审计、签名或恢复授权。
export async function publishStateFileWithFingerprint(envelope,target,io=defaultIo){
  const bytes=encodeStateFile(envelope),sha256=createHash('sha256').update(bytes).digest('hex');
  await publishBytes(bytes,target,io);return {path:target,sha256,bytes:bytes.length};
}
async function publishBytes(bytes,target,io){
  const directory=path.dirname(target),temporary=path.join(directory,`.${path.basename(target)}.${process.pid}.${++sequence}.tmp`);
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
