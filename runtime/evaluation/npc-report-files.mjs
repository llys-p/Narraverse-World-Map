// A local byte-consistency receipt, not a signature, semantic verdict or world audit.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseStrictJson} from '../service/strict-json.mjs';
import {fields,requireCondition,fault} from '../core/data-contract.mjs';
const JSON_MAX=4194304,HTML_MAX=8388608;
const hash=b=>createHash('sha256').update(b).digest('hex');
const descriptor=b=>({bytes:b.length,sha256:hash(b)});
export function dialogueReportPaths(out){
 requireCondition(typeof out==='string'&&out.endsWith('.json'),'Report must be a JSON path');
 return {json:out,html:out.slice(0,-5)+'.html',completion:out.slice(0,-5)+'.complete.json'};
}
async function readBounded(io,file,limit){
 const h=await io.open(file,'r');try{requireCondition((await h.stat()).size<=limit,'Report file too large');const b=await h.readFile();requireCondition(b.length<=limit,'Report file too large');return b;}finally{await h.close();}
}
export async function verifyDialogueReportFiles(out,{io=fs}={}){
 try{
  const names=dialogueReportPaths(out),proof=parseStrictJson(await readBounded(io,names.completion,4096),4096);
  fields(proof,['schemaVersion','kind','json','html']);requireCondition(proof.schemaVersion===1&&proof.kind==='npc-dialogue-report-completion','Invalid completion record');
  for(const [kind,limit] of [['json',JSON_MAX],['html',HTML_MAX]]){
   const d=proof[kind];fields(d,['bytes','sha256']);requireCondition(Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=limit&&typeof d.sha256==='string'&&/^[a-f0-9]{64}$/.test(d.sha256),'Invalid file digest');
  }
  const data=await readBounded(io,names.json,JSON_MAX),html=await readBounded(io,names.html,HTML_MAX);
  for(const [kind,b] of [['json',data],['html',html]])requireCondition(b.length===proof[kind].bytes&&hash(b)===proof[kind].sha256,'Report bytes do not match completion');
  const report=parseStrictJson(data,JSON_MAX);requireCondition(report?.completed===true&&report.completionProtocol===1,'Completed report required');
  return {status:'files-verified',json:descriptor(data),html:descriptor(html),scope:'local-file-bytes-only'};
 }catch{throw fault('REPORT_UNVERIFIED','Report files do not have matching completion evidence');}
}

export async function createDialogueReportWriter(out,{io=fs}={}){
 const names=dialogueReportPaths(out),opened=[];let last=null,finished=false,failed=false;
 const close=async()=>{for(const f of opened)if(!f.closed){await f.handle.close();f.closed=true;}};
 try{
  await io.mkdir(path.dirname(out),{recursive:true});
  for(const name of [names.json,names.html,names.completion])opened.push({name,handle:await io.open(name,'wx'),closed:false});
 }catch(error){for(const f of opened){await f.handle.close().catch(()=>{});await io.unlink(f.name).catch(()=>{});}throw fault(error.code==='EEXIST'?'OUTPUT_EXISTS':'REPORT_UNAVAILABLE','Cannot reserve new report files');}
 const write=async(f,bytes)=>{
  let offset=0;while(offset<bytes.length){const r=await f.handle.write(bytes,offset,bytes.length-offset,offset);requireCondition(Number.isSafeInteger(r.bytesWritten)&&r.bytesWritten>0&&r.bytesWritten<=bytes.length-offset,'Invalid report write','REPORT_UNAVAILABLE');offset+=r.bytesWritten;}
  await f.handle.truncate(bytes.length);await f.handle.sync();
 };
 return Object.freeze({
  async save(json,html){
   requireCondition(!finished&&!failed,'Report writer already finished','REPORT_UNAVAILABLE');
   try{const buffers=[Buffer.from(json),Buffer.from(html)];requireCondition(buffers[0].length<=JSON_MAX&&buffers[1].length<=HTML_MAX,'Report size exceeded');
    for(let i=0;i<2;i++)await write(opened[i],buffers[i]);last=buffers;}
   catch{failed=true;throw fault('REPORT_UNAVAILABLE','Cannot write report files');}
  },
  async finish(){
   requireCondition(!finished&&!failed&&last,'Report cannot be completed','REPORT_UNAVAILABLE');finished=true;
   try{
    const report=parseStrictJson(last[0],JSON_MAX);requireCondition(report?.completed===true&&report.completionProtocol===1,'Final report is incomplete');
    for(const f of opened.slice(0,2)){await f.handle.close();f.closed=true;}
    for(const [i,limit] of [JSON_MAX,HTML_MAX].entries())requireCondition((await readBounded(io,opened[i].name,limit)).equals(last[i]),'Final report readback differs');
    const receipt={schemaVersion:1,kind:'npc-dialogue-report-completion',json:descriptor(last[0]),html:descriptor(last[1])};
    await write(opened[2],Buffer.from(JSON.stringify(receipt,null,2)+'\n'));await opened[2].handle.close();opened[2].closed=true;
    return await verifyDialogueReportFiles(out,{io});
   }catch{throw fault('REPORT_UNAVAILABLE','Final report files could not be verified');}
  },close
 });
}
