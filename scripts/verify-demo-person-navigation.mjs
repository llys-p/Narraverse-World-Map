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
const get=async()=>{const response=await fetch(server.url+'/api/runtime/demo-state',{headers:{Connection:'close'}});assert.equal(response.status,200);return response.json();};
const five=g=>Object.fromEntries(['snapshot','map','player','scene','encounter'].map(k=>[k,g[k]]));
const read=expression=>browser.read(expression);
async function wait(check){const start=performance.now();while(performance.now()-start<110000){if(errors.length)throw Error(JSON.stringify(errors[0]));const result=await check();if(result)return result;await delay(60);}throw Error('Person navigation condition timed out');}
async function phase(name,run){await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:name,startedAt:Date.now()}));const start=performance.now();try{return await run();}finally{steps.push({name,wallMs:performance.now()-start});await fs.writeFile(path.join(out,'phase.json'),'{"phase":null}');}}
try{
 await phase('synthetic-visible-distant-merchant',async()=>{
  server=await startRuntimeServer({directory,seed:42,profile:'campaign-village',writable:true,continuousMarch:true,port:0});
  const response=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:5,commandId:'setup-visible-merchant',expectedRevision:0,type:'AdvanceTime',payload:{ticks:24}})});
  assert.equal(response.status,200);assert.equal((await response.json()).outcome,'succeeded');
  browser=await openDemoBrowser({directory:path.join(out,'browser'),url:server.url+'/demo-runtime.html',onEvent(event){
   if(event.method==='Runtime.exceptionThrown')errors.push(event.params);
   if(event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')errors.push(event.params);
   if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')errors.push(event.params);
   if(event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST')requests.push({url:new URL(event.params.request.url).pathname,body:event.params.request.postData});
  }});await wait(()=>read(`document.body?.dataset.worldConnected==='true'`));
 });
 const initial=await get(),merchant=initial.map.actors.find(a=>a.actorId==='actor-3');assert(merchant);assert.equal(merchant.canInteract,false);
 await phase('bag-locate-and-camera-only-no-world-write',async()=>{
  await browser.click('#tabBagBtn');assert.equal(await read(`document.querySelector('#bagTrade').disabled`),true);
  assert.equal(await read(`document.querySelector('#bagFindMerchant').disabled`),false);
  await browser.click('#bagFindMerchant');
  assert.match(await read(`document.querySelector('#personDetail').textContent`),/actor-3/);
  assert.match(await read(`document.querySelector('#personNavigationHint').textContent`),new RegExp('\\('+merchant.x+', '+merchant.y+'\\)'));
  assert.equal(await read(`document.querySelector('#worldMapCanvas').hidden`),false);
  assert.equal(await read(`document.querySelector('#mapFollowPlayer').hidden`),false);
  await browser.click('#mapFollowPlayer');assert.equal(await read(`document.querySelector('#mapFollowPlayer').hidden`),true);
  await browser.click('#personLocate');assert.equal(await read(`document.querySelector('#mapFollowPlayer').hidden`),false);
  assert.deepEqual(five(await get()),five(initial));assert.equal(requests.length,0);
 });
 await phase('existing-march-order-to-click-time-position',async()=>{
  await browser.click('#personApproach');
  await wait(async()=>{const g=await get();return (g.map.order?.status==='arrived'||g.map.contact?.actorId==='actor-3')&&!g.runner.active;});
  const arrived=await get();assert.deepEqual(arrived.map.order.target,{x:merchant.x,y:merchant.y});
  assert(Math.max(Math.abs(arrived.map.self.x-merchant.x),Math.abs(arrived.map.self.y-merchant.y))<=1);
  const order=requests.find(r=>r.url==='/api/runtime/demo-order');assert(order);assert.deepEqual(JSON.parse(order.body).payload,{x:merchant.x,y:merchant.y});
  assert.equal(JSON.parse(order.body).type,'MarchSet');assert(!requests.some(r=>JSON.parse(r.body).type==='MarchStep'));
  await wait(()=>read(`!document.querySelector('#personTrade').disabled`));
  assert.equal(await read(`document.querySelector('#personApproach').disabled`),true);
  await browser.click('#personTrade');assert.equal(await read(`document.querySelector('#tradePanel').hidden`),false);
 });
 const final=await get(),hashes={};for(const name of (await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)))hashes[name]=sha(await fs.readFile(path.join(directory,name)));
 await phase('normal-close-independent-audit-and-reopen',async()=>{
  await browser.close();browser=null;await server.close();server=null;
  const envelope=await loadServiceCommit(path.join(directory,`service-commit-r${final.snapshot.revision}.json`));
  assert(envelope.commands.some(e=>e.dto.type==='MarchSet'));assert(envelope.commands.some(e=>e.dto.type==='MarchStep'));
  server=await startRuntimeServer({directory,writable:true,continuousMarch:true,port:0});assert.deepEqual(five(await get()),five(final));
  await server.close();server=null;
  for(const [name,hash] of Object.entries(hashes))assert.equal(sha(await fs.readFile(path.join(directory,name))),hash);
 });
 assert.deepEqual(errors,[]);report={verdict:'PASS',steps,errors,requests,clickTimeTarget:{x:merchant.x,y:merchant.y},files:hashes,projectionSignature:sha(canonicalJson(five(final))),
  final:{revision:final.snapshot.revision,tick:final.snapshot.tick,position:final.map.self,merchant:final.map.actors.find(a=>a.actorId==='actor-3')}};
}catch(error){report={verdict:'FAIL',steps,errors,requests,error:{message:error.message,stack:error.stack,cause:error.cause?.message}};process.exitCode=1;}
finally{if(browser)await browser.close();if(server)await server.close();report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(n=>n.endsWith('.lock'));await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({verdict:report.verdict,steps:steps.length,error:report.error?.message}));}
