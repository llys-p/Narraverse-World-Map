// Issue #3: bounded synthetic format-9 runtime phase attribution.
// Run: node scripts/measure-issue3-fixture.mjs
// No private saves, remote services, HTTP listener or model calls. Not r170 acceptance.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

const LIMIT_MS = 120000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const script = fileURLToPath(import.meta.url);

async function runChild(directory) {
  const {createRuntimeOwner} = await import('../runtime/service/runtime-owner.mjs');
  const {validateServiceCommit,loadServiceCommit} = await import('../runtime/service/service-commit.mjs');
  const {parseStrictJson} = await import('../runtime/service/strict-json.mjs');
  const {readStateFile,MAX_STATE_FILE_BYTES} = await import('../runtime/persistence/bounded-json-file.mjs');
  const {cloneData,canonicalJson} = await import('../runtime/core/data-contract.mjs');
  const stages=[];
  async function time(name, fn) {
    const wall=performance.now(), cpuStart=process.cpuUsage();
    const result=await fn();
    const cpu=process.cpuUsage(cpuStart);
    stages.push({name,wallMs:+(performance.now()-wall).toFixed(3),
      cpuMs:+((cpu.user+cpu.system)/1000).toFixed(3)});
    return result;
  }
  let owner=null;
  try {
    owner=await time('fresh-scene-open',()=>createRuntimeOwner({
      directory,profile:'scene-survival-village',seed:42,writable:true}));
    async function submit(name,commandId,type,payload){
      const expectedRevision=owner.getSnapshot().revision;
      const receipt=await time(name,()=>owner.submit({
        version:3,commandId,expectedRevision,type,payload}));
      assert.equal(receipt.status,'committed');
      assert.notEqual(receipt.outcome,'rejected', name+' must be accepted');
    }
    await submit('travel-forest','issue3-travel-forest','PlayerTravel',{destination:'forest'});
    await submit('travel-village','issue3-travel-village','PlayerTravel',{destination:'village'});
    await submit('gift-village','issue3-gift-village','PlayerGiftFood',{recipientId:'actor-2'});
    const projections=o=>[o.getSnapshot(),o.getPlayer(),o.getMindInspector(),o.getEncounter(),o.getScene()];
    const beforeViews=hash(canonicalJson(projections(owner)));
    const revision=owner.getSnapshot().revision;
    await time('close',()=>owner.close());owner=null;
    const file=path.join(directory,'service-commit-r'+revision+'.json');
    const bytes=await readStateFile(file),beforeFile=hash(bytes);
    const parsed=await time('strict-parse',()=>parseStrictJson(bytes,MAX_STATE_FILE_BYTES));
    assert.equal(parsed.commands.length,3);
    await time('validate-service-commit',()=>validateServiceCommit(parsed));
    await time('clone-envelope',()=>cloneData(parsed));
    await time('load-service-commit',()=>loadServiceCommit(file));
    owner=await time('reopen',()=>createRuntimeOwner({directory,writable:true}));
    assert.equal(owner.getSnapshot().revision,revision);
    const afterViews=hash(canonicalJson(projections(owner)));
    assert.equal(afterViews,beforeViews,'five projections must survive restart');
    await time('close-after-reopen',()=>owner.close());owner=null;
    assert.equal(hash(await readStateFile(file)),beforeFile,'source save bytes unchanged');
    const names=await fs.readdir(directory);
    assert.ok(!names.some(n=>n==='.runtime-owner.lock'||n.endsWith('.tmp')),
      'no stale runtime lock or temp file');
    console.log(JSON.stringify({verdict:'SYNTHETIC_CONSISTENT',node:process.version,
      provenance:'generated seed42 scene fixture, not r170 private history',
      commands:3,revision,saveBytes:bytes.length,saveSha256:beforeFile,
      fiveProjectionSha256:afterViews,stages}));
  } finally {
    if(owner)await owner.close();
  }
}

async function runParent(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-issue3-fixture-'));
  try {
    const child=spawn(process.execPath,[script,'--child',path.join(root,'world')],
      {stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',timeout=false,overflow=false;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      stdout+=chunk;
      if(stdout.length>262144){overflow=true;child.kill('SIGKILL');}
    });
    child.stderr.on('data',chunk=>{
      stderr+=chunk;
      if(stderr.length>262144){overflow=true;child.kill('SIGKILL');}
    });
    const timer=setTimeout(()=>{timeout=true;child.kill('SIGKILL');},LIMIT_MS);
    let exit;
    try{
      exit=await new Promise((resolve,reject)=>{
        child.once('error',reject);
        child.once('close',(code,signal)=>resolve({code,signal}));
      });
    }finally{clearTimeout(timer);}
    if(timeout||overflow||exit.code!==0)
      throw new Error('fixture run failed: timeout='+timeout+' overflow='+overflow+
        ' exit='+JSON.stringify(exit)+' stderr='+stderr.slice(0,1500));
    const lines=stdout.trim().split('\n').filter(Boolean);
    assert.equal(lines.length,1,'child produced exactly one evidence record');
    const result=JSON.parse(lines[0]);
    assert.equal(result.verdict,'SYNTHETIC_CONSISTENT');
    console.log(JSON.stringify(result,null,2));
  }finally{
    // Only our own newly created temp directory is removed, even after timeout.
    await fs.rm(root,{recursive:true,force:true});
  }
}
try{
  if(process.argv[2]==='--child')await runChild(process.argv[3]);
  else if(process.argv.length===2)await runParent();
  else throw new Error('Usage: node scripts/measure-issue3-fixture.mjs');
}catch(error){
  console.error(error.stack||String(error));
  process.exitCode=1;
}
