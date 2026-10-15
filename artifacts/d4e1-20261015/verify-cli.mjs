import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';
const output=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(output,'../..');
const directory=path.join(output,'cli-test-world-'+Date.now()),defaultWorld=path.join(root,'artifacts/d4-daily/world');
assert.equal(fs.existsSync(directory),false,'Do not reuse an existing test world');
assert.equal(fs.existsSync(defaultWorld),false,'Default user world must remain uncreated');
const wrapper=fs.readFileSync(path.join(root,'Start-D4.cmd'),'utf8');
for(const flag of ['--port 18325','--profile scene-survival-village','--seed 42','--writable true','--inspect-mind false'])assert.ok(wrapper.includes(flag));
const sha=value=>createHash('sha256').update(value).digest('hex');
const files=()=>Object.fromEntries(fs.readdirSync(directory).filter(f=>f.endsWith('.json')).sort().map(f=>[f,sha(fs.readFileSync(path.join(directory,f)))]));
const live=[];
async function start(label){
  const initialize=!fs.existsSync(directory);
  const args=['runtime-server.mjs','--data-dir',directory,'--port','0','--writable','true','--inspect-mind','false',...(initialize?['--profile','scene-survival-village','--seed','42']:[])];
  const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);live.push(child);
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('CLI readiness exceeded 20s')),20000);
    const check=()=>{for(const line of stdout.split(/\r?\n/)){try{const x=JSON.parse(line);if(x.status==='ready'){clearTimeout(timer);child.stdout.off('data',check);resolve(x);return;}}catch{}}};
    child.stdout.on('data',check);child.once('exit',()=>{clearTimeout(timer);reject(Error('CLI exited before ready: '+stderr));});check();
  });
  const get=async route=>{const r=await fetch(ready.url+route,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200,route);return r.json();};
  const views={health:await get('/healthz'),capabilities:await get('/api/runtime/capabilities'),snapshot:await get('/api/runtime/snapshot'),player:await get('/api/runtime/player'),scene:await get('/api/runtime/scene'),encounter:await get('/api/runtime/encounter')};
  assert.equal(views.capabilities.writes,true);assert.equal(views.capabilities.sceneAvailable,true);assert.equal(views.capabilities.encounterAvailable,true);assert.equal(views.capabilities.mindAvailable,false);assert.equal(views.capabilities.commandDtoVersion,3);
  assert.equal(views.snapshot.revision,0);assert.equal(views.snapshot.tick,0);assert.equal(views.scene.simulationId,'scene-survival-village');
  const routes=[];for(const route of ['/runtime-map.html','/runtime-village.html','/runtime-encounter.html']){const r=await fetch(ready.url+route,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);await r.arrayBuffer();routes.push({route,status:r.status});}
  const hidden=await fetch(ready.url+'/api/runtime/minds',{signal:AbortSignal.timeout(5000)});assert.equal(hidden.status,404);await hidden.arrayBuffer();
  const signature=sha(canonicalJson(views)),saved=files();
  child.stdin.end('quit\n');let timer;const stopped=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CLI quit exceeded 10s')),10000);})]).finally(()=>clearTimeout(timer));
  fs.writeFileSync(path.join(output,label+'-stdout.txt'),stdout);fs.writeFileSync(path.join(output,label+'-stderr.txt'),stderr);
  assert.equal(stopped.code,0);assert.match(stdout,/"status":"stopped"/);assert.equal(fs.existsSync(path.join(directory,'.runtime-owner.lock')),false);
  assert.equal(fs.existsSync(defaultWorld),false);
  return {label,pid:child.pid,args,initialize,url:ready.url,signature,saved,exit:stopped,routes,writes:views.capabilities.writes,scene:views.scene.simulationId,revision:views.snapshot.revision,tick:views.snapshot.tick};
}
try{
  const first=await start('first'),reopened=await start('reopen');
  assert.equal(reopened.signature,first.signature);assert.deepEqual(reopened.saved,first.saved);
  const result={at:new Date().toISOString(),verdict:'CLI_HTTP_ENTRY_PASS',first,reopened,defaultUserWorldCreated:false,browserVerified:false,fullStoryRerun:false};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{for(const child of live)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
