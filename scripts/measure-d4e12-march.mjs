// Short, isolated attribution only. Load hooks add clocks, never change decisions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {openDemoBrowser} from './demo-browser-client.mjs';

const out=path.resolve(process.argv[2]),directory=path.join(out,'world');await fs.mkdir(out,{recursive:false});
const commits=[],intents=[],spans=new Map(),intentStarts=new Map(),instrumented=[],network=new Map(),errors=[];
const cpuMs=cpu=>(cpu.user+cpu.system)/1000;
globalThis.__d4e12Measure={
 queue(dto){const now=performance.now();spans.set(dto.commandId,{commandId:dto.commandId,type:dto.type,start:now,last:now,cpu:process.cpuUsage(),parts:[]});},
 mark(id,name){const t=spans.get(id);if(!t)return;const now=performance.now(),used=process.cpuUsage();t.parts.push({name,wallMs:now-t.last,cpuMs:cpuMs({user:used.user-t.cpu.user,system:used.system-t.cpu.system})});t.last=now;t.cpu=used;},
 finish(id){const t=spans.get(id);if(!t)return;commits.push({commandId:id,type:t.type,totalMs:performance.now()-t.start,parts:t.parts});spans.delete(id);},
 intentStart(id){intentStarts.set(id,performance.now());},
 intentRun(id){const start=intentStarts.get(id);if(start!==undefined){intents.push({requestId:id,runnerQueueMs:performance.now()-start});intentStarts.delete(id);}}
};
const trace='globalThis.__d4e12Measure';
function replaceOnce(source,from,to){assert.equal(source.split(from).length,2,'Instrumentation anchor changed: '+from.slice(0,70));return source.replace(from,to);}
registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);
 if(![new URL('../runtime/service/runtime-owner.mjs',import.meta.url).href,new URL('../runtime/service/march-runner.mjs',import.meta.url).href,new URL('../runtime-server.mjs',import.meta.url).href].includes(url))return result;
 let source=typeof result.source==='string'?result.source:Buffer.from(result.source).toString('utf8');
 instrumented.push({file:new URL(url).pathname,originalSha256:createHash('sha256').update(source).digest('hex')});
 if(url.endsWith('/runtime-owner.mjs')){
  source=replaceOnce(source,"        requireCondition(pending<MAX_PENDING_REQUESTS",`        ${trace}.queue(dto);\n        requireCondition(pending<MAX_PENDING_REQUESTS`);
  source=replaceOnce(source,'const operation=tail.then(async()=>{',`const operation=tail.then(async()=>{${trace}.mark(dto.commandId,'owner-queue');`);
  source=replaceOnce(source,"requireCondition(await ownsLock(lockPath,token,io),'Runtime ownership changed','OWNER_BUSY');",`requireCondition(await ownsLock(lockPath,token,io),'Runtime ownership changed','OWNER_BUSY');${trace}.mark(dto.commandId,'preflight-and-lock');`);
  source=replaceOnce(source,'          const certifiedNext=',`          ${trace}.mark(dto.commandId,'inspect-directory');\n          const certifiedNext=`);
  source=replaceOnce(source,',candidate=createSimulationSession(nextBundle,systems),',`;${trace}.mark(dto.commandId,'audited-transition');const candidate=createSimulationSession(nextBundle,systems);${trace}.mark(dto.commandId,'session-copy');const `);
  source=replaceOnce(source,'          const next=certifiedNext??',`          ${trace}.mark(dto.commandId,'projections');\n          const next=certifiedNext??`);
  source=replaceOnce(source,'          await saveServiceCommit(next,directory,io);',`          await saveServiceCommit(next,directory,io);${trace}.mark(dto.commandId,'durable-save');`);
  source=replaceOnce(source,'activityProjection=nextActivityProjection;return cloneData(receipt);',`activityProjection=nextActivityProjection;${trace}.mark(dto.commandId,'publish');${trace}.finish(dto.commandId);return cloneData(receipt);`);
 }else if(url.endsWith('/march-runner.mjs')){
  source=replaceOnce(source,'    const old=owner.getCommittedCommand(intent.requestId),dto=',`    ${trace}.intentRun(intent.requestId);const old=owner.getCommittedCommand(intent.requestId),dto=`);
 }else{
  source=replaceOnce(source,'          send(200,await runner.order(body));return;',`          ${trace}.intentStart(body.requestId);send(200,await runner.order(body));return;`);
 }
 return {...result,source};
}});
let server,browser,report;
async function phase(name,run){await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:name,startedAt:Date.now()}));try{return await run();}finally{await fs.writeFile(path.join(out,'phase.json'),'{"phase":null}');}}
async function waitFor(check){const start=performance.now();while(performance.now()-start<30000){if(await check())return;await delay(25);}throw Error('Short march condition timed out');}
try{
 const {startRuntimeServer}=await import('../runtime-server.mjs');
 await phase('short-march',async()=>{
  server=await startRuntimeServer({directory,profile:'campaign-village',seed:42,port:0,writable:true,continuousMarch:true});
  browser=await openDemoBrowser({directory:out,url:server.url+'/demo-runtime.html',onEvent(event){
   const p=event.params;if(event.method==='Runtime.exceptionThrown')errors.push(p.exceptionDetails);
   if(event.method==='Network.requestWillBeSent'&&p.request.url.includes('/api/runtime/'))network.set(p.requestId,{path:new URL(p.request.url).pathname,method:p.request.method,start:p.timestamp,body:p.request.postData});
   if(event.method==='Network.responseReceived'&&network.has(p.requestId))Object.assign(network.get(p.requestId),{status:p.response.status,response:p.timestamp});
   if(event.method==='Network.loadingFinished'&&network.has(p.requestId))network.get(p.requestId).end=p.timestamp;
  }});
  await waitFor(()=>browser.read(`document.body?.dataset.worldConnected==='true' && !document.querySelector('#toForest').disabled`));
  await browser.click('#toForest');
  await waitFor(()=>commits.filter(c=>c.type==='MarchStep').length>=2);
  await browser.click('#pauseMarch');
  await waitFor(()=>commits.some(c=>c.type==='MarchPause'));
  await waitFor(()=>browser.read(`!document.querySelector('#toForest').disabled`));
  const response=await fetch(server.url+'/api/runtime/demo-state',{headers:{Connection:'close'}}),final=await response.json();
  assert.equal(final.runner.active,false);assert.equal(final.map.order.status,'paused');assert(final.map.tick>=4&&final.map.tick<=6);
  assert(![...network.values()].some(n=>n.body&&JSON.parse(n.body).type==='MarchStep'));assert.deepEqual(errors,[]);
  report={verdict:'MEASURED',environment:{node:process.version,platform:process.platform},instrumented,commits,intents,
   network:[...network.values()].filter(n=>n.end!==undefined).map(n=>({path:n.path,method:n.method,type:n.body?JSON.parse(n.body).type??'stop':null,status:n.status,wallMs:(n.end-n.start)*1000,headersMs:n.response===undefined?null:(n.response-n.start)*1000})),
   statusText:await browser.read(`document.querySelector('#connectionStatus').textContent`),final:{revision:final.map.revision,tick:final.map.tick,position:final.map.self,orderStatus:final.map.order.status},errors};
 });
}catch(error){process.exitCode=1;report={verdict:'FAIL',instrumented,commits,intents,errors,error:{message:error.message,stack:error.stack}};console.error(error.stack);}
finally{
 if(browser)await browser.close();if(server)await server.close();delete globalThis.__d4e12Measure;
 report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(n=>n.endsWith('.lock'));await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({verdict:report.verdict,commits:report.commits.length,error:report.error?.message}));
}
