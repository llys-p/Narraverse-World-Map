import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {openDemoBrowser} from './demo-browser-client.mjs';
import {loadServiceCommit} from '../runtime/service/service-commit.mjs';
import {canonicalJson} from '../runtime/core/data-contract.mjs';

const out=path.resolve(process.argv[2]),directory=path.join(out,'world');await fs.mkdir(out,{recursive:false});
const steps=[],errors=[],requests=[];let server,browser,report;
const sha=v=>createHash('sha256').update(v).digest('hex');
const get=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state',{headers:{Connection:'close'}});assert.equal(r.status,200);return r.json();};
const five=g=>Object.fromEntries(['snapshot','map','player','scene','encounter'].map(k=>[k,g[k]]));
const read=expression=>browser.read(expression);
async function wait(check){const start=performance.now();while(performance.now()-start<110000){if(errors.length)throw Error(JSON.stringify(errors[0]));const value=await check();if(value)return value;await delay(60);}throw Error('World time condition timed out');}
async function phase(name,run){await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:name,startedAt:Date.now()}));const start=performance.now();try{return await run();}finally{steps.push({name,wallMs:performance.now()-start});await fs.writeFile(path.join(out,'phase.json'),'{"phase":null}');}}
async function clickCommand(selector,type){
 const before=await get();await wait(()=>read(`!document.querySelector(${JSON.stringify(selector)}).disabled`));await browser.click(selector);
 await wait(()=>read(`(()=>{try{const r=JSON.parse(document.querySelector('#lastReceipt').textContent);return r.type===${JSON.stringify(type)}&&r.toRevision>${before.snapshot.revision}&&!document.querySelector('#waitHour').disabled;}catch{return false;}})()`));
 return get();
}
try{
 await phase('synthetic-work-then-open',async()=>{
  server=await startRuntimeServer({directory,seed:42,profile:'campaign-village',writable:true,continuousMarch:true,port:0});
  const response=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:5,commandId:'time-setup-work',expectedRevision:0,type:'PlayerWork',payload:{}})});
  assert.equal(response.status,200);assert.equal((await response.json()).outcome,'succeeded');
  browser=await openDemoBrowser({directory:path.join(out,'browser'),url:server.url+'/demo-runtime.html',onEvent(event){
   if(event.method==='Runtime.exceptionThrown')errors.push(event.params);
   if(event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')errors.push(event.params);
   if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')errors.push(event.params);
   if(event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST')requests.push({url:new URL(event.params.request.url).pathname,body:event.params.request.postData});
  }});await wait(()=>read(`document.body?.dataset.worldConnected==='true'`));
 });
 const initial=await get();assert.equal(initial.snapshot.tick,36);assert.equal(initial.player.self.fatigue,150);
 await phase('world-wait-advances-time-and-NPCs-without-rest-effect',async()=>{
  assert.match(await read(`document.querySelector('#worldClockText').textContent`),/第 0 天 06:00/);
  assert.match(await read(`document.querySelector('#workTimingText').textContent`),/18小时/);
  const after=await clickCommand('#waitHour','AdvanceTime');assert.equal(after.snapshot.tick,42);assert.deepEqual(after.player.self,initial.player.self);
  assert.notDeepEqual(after.map.actors,initial.map.actors);
  assert.match(await read(`document.querySelector('#worldClockText').textContent`),/07:00/);assert.match(await read(`document.querySelector('#workTimingText').textContent`),/17小时/);
  assert.match(await read(`document.querySelector('#actionTime').textContent`),/1小时/);
  assert.equal(await read(`document.querySelector('#work').disabled`),true);
 });
 await phase('bag-wait-versus-real-rest-and-no-auto-catchup',async()=>{
  await browser.click('#tabBagBtn');const before=await get();let after=await clickCommand('#bagWait','AdvanceTime');
  assert.equal(after.snapshot.tick,48);assert.deepEqual(after.player.self,before.player.self);
  assert.match(await read(`document.querySelector('#workTimingText').textContent`),/16小时/);
  after=await clickCommand('#bagRest','PlayerRest');assert.equal(after.snapshot.tick,54);assert.equal(after.player.self.fatigue,50);assert.equal(after.player.self.wallet,20);
  assert.match(await read(`document.querySelector('#workTimingText').textContent`),/15小时/);
  const count=requests.length,pristine=five(after);await delay(250);assert.equal(requests.length,count);assert.deepEqual(five(await get()),pristine);
 });
 const final=await get(),hashes={};for(const name of (await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)))hashes[name]=sha(await fs.readFile(path.join(directory,name)));
 let envelope;
 await phase('normal-close-full-audit-reopen-with-cooldown',async()=>{
  await browser.close();browser=null;await server.close();server=null;
  envelope=await loadServiceCommit(path.join(directory,`service-commit-r${final.snapshot.revision}.json`));
  assert.deepEqual(envelope.commands.map(e=>[e.dto.type,e.dto.payload]),[['PlayerWork',{}],['AdvanceTime',{ticks:6}],['AdvanceTime',{ticks:6}],['PlayerRest',{}]]);
  server=await startRuntimeServer({directory,writable:true,continuousMarch:true,port:0});assert.deepEqual(five(await get()),five(final));
  browser=await openDemoBrowser({directory:path.join(out,'reopen-browser'),url:server.url+'/demo-runtime.html',onEvent(event){if(event.method==='Runtime.exceptionThrown')errors.push(event.params);}});
  await wait(()=>read(`document.body?.dataset.worldConnected==='true'`));assert.match(await read(`document.querySelector('#worldClockText').textContent`),/09:00/);assert.match(await read(`document.querySelector('#workTimingText').textContent`),/15小时/);
  await browser.close();browser=null;await server.close();server=null;
  for(const [name,hash] of Object.entries(hashes))assert.equal(sha(await fs.readFile(path.join(directory,name))),hash);
 });
 assert.deepEqual(errors,[]);report={verdict:'PASS',steps,errors,requests,files:hashes,projectionSignature:sha(canonicalJson(five(final))),commands:envelope.commands,
  final:{revision:final.snapshot.revision,tick:final.snapshot.tick,wallet:final.player.self.wallet,food:final.player.self.inventory.food,fatigue:final.player.self.fatigue,nextWorkTick:final.player.actions.work.nextWorkTick}};
}catch(error){report={verdict:'FAIL',steps,errors,requests,error:{message:error.message,stack:error.stack,cause:error.cause?.message}};process.exitCode=1;}
finally{if(browser)await browser.close();if(server)await server.close();report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(n=>n.endsWith('.lock'));await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({verdict:report.verdict,steps:steps.length,error:report.error?.message}));}
