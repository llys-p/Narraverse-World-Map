// Same real action and files, alternating execution placement. No private saves.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
const out=path.resolve(process.argv[2]);await fs.mkdir(out,{recursive:false});
const results=[];
for(const [index,runtimeWorker] of [false,true,true,false].entries()){
 const directory=path.join(out,String(index)),server=await startRuntimeServer({directory,seed:42,profile:'campaign-village',writable:true,continuousMarch:true,runtimeWorker,port:0});
 try{
  const json=async(route,body)=>{const r=await fetch(server.url+route,{headers:{Connection:'close',...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json();};
  let done=false;const start=performance.now(),cpu=process.cpuUsage();
  const post=json('/api/runtime/commands',{version:5,commandId:'responsive-fixed',expectedRevision:0,type:'AdvanceTime',payload:{ticks:12}}).then(x=>{done=true;return x;});
  const reads=[];let beforeCommit=false;
  while(!done){const due=performance.now()+20;await delay(20);const at=performance.now(),s=await json('/api/runtime/demo-state');const end=performance.now();reads.push({timerLagMs:at-due,httpMs:end-at,revision:s.snapshot.revision});if(s.snapshot.revision===0)beforeCommit=true;}
  const receipt=await post,totalMs=performance.now()-start,used=process.cpuUsage(cpu);assert.equal(receipt.outcome,'succeeded');assert.equal(receipt.tick,12);
  const final=await json('/api/runtime/demo-state');assert.equal(final.snapshot.revision,12);assert([final.map,final.player,final.scene,final.encounter].every(v=>v.revision===12));
  results.push({runtimeWorker,totalMs,cpuMs:(used.user+used.system)/1000,beforeCommit,reads,receipt});
 }finally{await server.close();}
 const file=path.join(directory,'service-commit-r12.json'),raw=await fs.readFile(file);results.at(-1).sha256=createHash('sha256').update(raw).digest('hex');assert(!(await fs.readdir(directory)).some(n=>n.endsWith('.lock')));
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(results,null,2));
}
assert.equal(new Set(results.map(r=>r.sha256)).size,1);
assert(results.filter(r=>r.runtimeWorker).every(r=>r.beforeCommit));
console.log(JSON.stringify(results.map(({reads,receipt,...r})=>({...r,readCount:reads.length,maxReadMs:Math.max(...reads.map(x=>x.httpMs+x.timerLagMs))}))));
