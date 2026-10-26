import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createDialogueReportWriter,verifyDialogueReportFiles,dialogueReportPaths} from '../../runtime/evaluation/npc-report-files.mjs';
const temp=async t=>{const p=await fs.mkdtemp(path.join(os.tmpdir(),'npc17-files-'));t.after(()=>fs.rm(p,{recursive:true,force:true}));return p;};
const data=completed=>JSON.stringify({schemaVersion:1,completed,completionProtocol:1});
async function publish(out){const w=await createDialogueReportWriter(out);try{await w.save(data(true),'<html>final</html>');await w.finish();}finally{await w.close();}}
const wrapHandle=(h,overrides)=>new Proxy(h,{get(target,key){return overrides[key]??(typeof target[key]==='function'?target[key].bind(target):target[key]);}});

test('progress has no completion proof; successful final pair is reread and later drift or missing halves are detected',async t=>{
 const out=path.join(await temp(t),'run.json'),p=dialogueReportPaths(out),w=await createDialogueReportWriter(out);
 try{
  await w.save(data(false),'<html>progress</html>');await assert.rejects(verifyDialogueReportFiles(out),{code:'REPORT_UNVERIFIED'});
  await w.save(data(true),'<html>final</html>');assert.equal((await w.finish()).status,'files-verified');
 }finally{await w.close();}
 const json=await fs.readFile(p.json),html=await fs.readFile(p.html),proof=await fs.readFile(p.completion);
 for(const [file,wrong] of [[p.json,Buffer.from(data(false))],[p.html,Buffer.from('<html>earlier</html>')],[p.completion,Buffer.from('{}')]]){
  const original=await fs.readFile(file);await fs.writeFile(file,wrong);await assert.rejects(verifyDialogueReportFiles(out),{code:'REPORT_UNVERIFIED'});await fs.writeFile(file,original);
 }
 await fs.unlink(p.html);await assert.rejects(verifyDialogueReportFiles(out),{code:'REPORT_UNVERIFIED'});await fs.writeFile(p.html,html);
 await fs.writeFile(p.completion,proof);assert.equal((await verifyDialogueReportFiles(out)).status,'files-verified');assert.deepEqual(await fs.readFile(p.json),json);
});

test('readback mismatch, zero-byte writes and save failures never create a usable completion marker',async t=>{
 const dir=await temp(t);
 for(const kind of ['readback','zero-write','save-failure']){
  const out=path.join(dir,kind+'.json');let fail=false;
  const io={...fs,open:async(name,flags)=>{
   const h=await fs.open(name,flags);
   if(kind==='readback'&&flags==='r'&&name===out)return wrapHandle(h,{readFile:async()=>Buffer.from('old progress bytes')});
   if(flags==='wx'&&name===out&&kind!=='readback')return wrapHandle(h,{write:async(...args)=>{
    if(kind==='zero-write')return {bytesWritten:0};if(fail)throw Error('private injected failure');return h.write(...args);
   }});return h;
  }};
  const w=await createDialogueReportWriter(out,{io});
  try{
   if(kind==='readback'){await w.save(data(true),'<html>final</html>');await assert.rejects(w.finish(),{code:'REPORT_UNAVAILABLE'});}
   else if(kind==='zero-write'){await assert.rejects(w.save(data(true),'html'),{code:'REPORT_UNAVAILABLE'});await assert.rejects(w.finish(),{code:'REPORT_UNAVAILABLE'});}
   else{await w.save(data(true),'html');fail=true;await assert.rejects(w.save(data(true),'html'),{code:'REPORT_UNAVAILABLE'});await assert.rejects(w.finish(),{code:'REPORT_UNAVAILABLE'});}
  }finally{await w.close();}
  assert.equal((await fs.readFile(dialogueReportPaths(out).completion)).length,0);await assert.rejects(verifyDialogueReportFiles(out),{code:'REPORT_UNVERIFIED'});
 }
});

test('partial writes are completed, shrinking progress truncates correctly, and incomplete final reports cannot be sealed',async t=>{
 const dir=await temp(t),out=path.join(dir,'short.json');
 const io={...fs,open:async(name,flags)=>{const h=await fs.open(name,flags);return flags==='wx'?wrapHandle(h,{write:(b,o,n,p)=>h.write(b,o,Math.min(n,7),p)}):h;}};
 const w=await createDialogueReportWriter(out,{io});try{
  await w.save(JSON.stringify({completed:false,completionProtocol:1,padding:'x'.repeat(200)}),'x'.repeat(500));await w.save(data(true),'html');await w.finish();
 }finally{await w.close();}
 assert.equal(await fs.readFile(out,'utf8'),data(true));assert.equal(await fs.readFile(dialogueReportPaths(out).html,'utf8'),'html');
 const next=path.join(dir,'incomplete.json'),v=await createDialogueReportWriter(next);try{await v.save(data(false),'html');await assert.rejects(v.finish(),{code:'REPORT_UNAVAILABLE'});}finally{await v.close();}
 await assert.rejects(verifyDialogueReportFiles(next),{code:'REPORT_UNVERIFIED'});
});

test('all three reservation collisions preserve old files and remove only files created by this attempt',async t=>{
 const dir=await temp(t);
 for(const key of ['json','html','completion']){
  const base=path.join(dir,key);await fs.mkdir(base);const out=path.join(base,'report.json'),file=dialogueReportPaths(out)[key];await fs.writeFile(file,'original');
  await assert.rejects(createDialogueReportWriter(out),{code:'OUTPUT_EXISTS'});assert.equal(await fs.readFile(file,'utf8'),'original');assert.deepEqual(await fs.readdir(base),[path.basename(file)]);
 }
});
