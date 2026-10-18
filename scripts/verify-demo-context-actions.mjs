import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {openDemoBrowser} from './demo-browser-client.mjs';
import {loadServiceCommit} from '../runtime/service/service-commit.mjs';
import {canonicalJson} from '../runtime/core/data-contract.mjs';

const out=path.resolve(process.argv[2]),directory=path.join(out,'world');
await fs.mkdir(out,{recursive:false});let server,browser;const errors=[],requests=[],steps=[];
const sha=v=>createHash('sha256').update(v).digest('hex');
const get=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state',{headers:{Connection:'close'}});assert.equal(r.status,200);return r.json();};
const five=g=>Object.fromEntries(['snapshot','map','player','scene','encounter'].map(k=>[k,g[k]]));
async function wait(check){const start=performance.now();while(performance.now()-start<110000){if(errors.length)throw Error('Demo page error: '+JSON.stringify(errors[0]));const value=await check();if(value)return value;await delay(60);}throw Error('Context action condition timed out');}
async function phase(name,run){await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:name,startedAt:Date.now()}));const start=performance.now();try{return await run();}finally{steps.push({name,wallMs:performance.now()-start});await fs.writeFile(path.join(out,'phase.json'),'{"phase":null}');}}
const read=expression=>browser.read(expression);
async function clickCommand(selector,type){
 const before=await get();await wait(()=>read(`document.querySelector(${JSON.stringify(selector)}).disabled===false`));
 await browser.click(selector);await wait(()=>read(`(()=>{try{const r=JSON.parse(document.querySelector('#lastReceipt').textContent);return r.type===${JSON.stringify(type)}&&r.toRevision>${before.snapshot.revision};}catch{return false;}})()`));
 const g=await get();assert(g.snapshot.revision>before.snapshot.revision);
 await wait(()=>read(`document.querySelector('#actionResult').dataset.commandType===${JSON.stringify(type)} && !document.querySelector('#toForest').disabled`));return g;
}
let report;
try{
 await phase('open-demo',async()=>{
  server=await startRuntimeServer({directory,seed:42,profile:'campaign-village',writable:true,continuousMarch:true,port:0});
  const module=await fetch(server.url+'/demo-runtime-interactions.mjs');assert.equal(module.status,200);
  browser=await openDemoBrowser({directory:path.join(out,'browser'),url:server.url+'/demo-runtime.html',onEvent(event){
   if(event.method==='Runtime.exceptionThrown')errors.push(event.params);
   if(event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')errors.push(event.params);
   if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')errors.push(event.params);
   if(event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST')requests.push({url:new URL(event.params.request.url).pathname,body:event.params.request.postData});
  }});await wait(()=>read(`document.body?.dataset.worldConnected==='true'`));
 });
 const initial=await get();assert.equal(initial.player.self.wallet,0);
 await phase('merchant-open-is-read-only-and-quantity-guard',async()=>{
  await browser.click('#tabSceneBtn');await browser.click('[data-actor-id="actor-3"]');
  assert.equal(await read(`document.querySelector('#personWork').hidden`),true);
  await browser.click('#personTrade');assert.equal(await read(`document.querySelector('#tradePanel').hidden`),false);
  assert.equal(await read(`document.querySelector('#tradeBuyFood').disabled`),true);
  await read(`document.querySelector('#tradeQuantity').value='0';document.querySelector('#tradeQuantity').dispatchEvent(new Event('input'));`);
  assert.equal(await read(`document.querySelector('#tradeSellFood').disabled`),true);
  const count=requests.length;await read(`document.querySelector('#tradeSellFood').dispatchEvent(new MouseEvent('click'));`);await delay(100);
  assert.equal(requests.length,count);assert.deepEqual(five(await get()),five(initial));
  await read(`document.querySelector('#tradeQuantity').value='2';document.querySelector('#tradeQuantity').dispatchEvent(new Event('input'));`);
 });
 await phase('merchant-real-sale-and-purchase',async()=>{
  let g=await clickCommand('#tradeSellFood','PlayerSell');assert.equal(g.player.self.wallet,10);assert.equal(g.player.self.inventory.food,18);
  assert.match(await read(`document.querySelector('#actionChanges').textContent`),/金币 \+10/);
  assert.match(await read(`document.querySelector('#actionChanges').textContent`),/粮食 -2/);
  await read(`document.querySelector('#tradeQuantity').value='1';document.querySelector('#tradeQuantity').dispatchEvent(new Event('input'));`);
  g=await clickCommand('#tradeBuyFood','PlayerBuy');assert.equal(g.player.self.wallet,0);assert.equal(g.player.self.inventory.food,19);
  assert.match(await read(`document.querySelector('#actionChanges').textContent`),/金币 -10/);
  assert.match(await read(`document.querySelector('#tradeFoodCount').textContent`),/19/);
  await browser.click('#closeTrade');await browser.click('#closePerson');
 });
 await phase('elder-work-and-bag-rest',async()=>{
  await browser.click('[data-actor-id="actor-1"]');assert.equal(await read(`document.querySelector('#personTrade').hidden`),true);
  let g=await clickCommand('#personWork','PlayerWork');assert.equal(g.player.self.wallet,20);assert.equal(g.player.self.fatigue,150);
  assert.match(await read(`document.querySelector('#actionChanges').textContent`),/金币 \+20/);assert.match(await read(`document.querySelector('#actionTime').textContent`),/6小时/);
  assert.equal(await read(`document.querySelector('#personWork').disabled`),true);
  await browser.click('#closePerson');await browser.click('#tabBagBtn');
  assert.match(await read(`document.querySelector('#bagContents').textContent`),/金币 20/);
  g=await clickCommand('#bagRest','PlayerRest');assert.equal(g.player.self.fatigue,50);assert.equal(g.player.self.wallet,20);
  assert.match(await read(`document.querySelector('#actionChanges').textContent`),/疲劳 -100/);
  assert.equal(await read(`document.querySelectorAll('#actionHistory li').length`),4);
  assert.equal(await read(`document.querySelector('#bagTrade').disabled`),true);
  const before=five(g),count=requests.length;await read(`document.querySelector('#tradeBuyFood').dispatchEvent(new MouseEvent('click'));`);await delay(100);
  assert.deepEqual(five(await get()),before);assert.equal(requests.length,count);
 });
 await phase('real-rule-rejection-is-recorded-without-gains',async()=>{
  const before=await get();await read(`document.querySelector('#work').dispatchEvent(new MouseEvent('click'));`);
  await wait(()=>read(`document.querySelector('#actionResult').dataset.outcome==='rejected'`));
  const after=await get();assert.equal(after.snapshot.revision,before.snapshot.revision+1);assert.equal(after.snapshot.tick,before.snapshot.tick);
  assert.deepEqual(after.player.self,before.player.self);
  assert.match(await read(`document.querySelector('#actionChanges').textContent`),/条件不满足/);
  assert.match(await read(`document.querySelector('#actionTime').textContent`),/未推进/);
  assert.equal(await read(`document.querySelectorAll('#actionHistory li').length`),5);
 });
 const final=await get();assert.equal(final.snapshot.tick,44);
 const actionHistory=await read(`Array.from(document.querySelectorAll('#actionHistory li')).map(n=>({commandId:n.dataset.commandId,outcome:n.dataset.outcome,text:n.textContent}))`);
 const hashes={};for(const name of (await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)))hashes[name]=sha(await fs.readFile(path.join(directory,name)));
 const latest=path.join(directory,`service-commit-r${final.snapshot.revision}.json`);
 await phase('normal-close',async()=>{await browser.close();browser=null;await server.close();server=null;});
 const envelope=await phase('independent-complete-audit',()=>loadServiceCommit(latest));
 assert.deepEqual(envelope.commands.map(e=>e.dto.type),['PlayerSell','PlayerBuy','PlayerWork','PlayerRest','PlayerWork']);
 assert.equal(envelope.commands.at(-1).receipt.outcome,'rejected');
 assert.deepEqual(envelope.commands.slice(0,2).map(e=>e.dto.payload.quantity),[2,1]);
 await phase('reopen-same-assets-and-context',async()=>{
  server=await startRuntimeServer({directory,writable:true,continuousMarch:true,port:0});assert.deepEqual(five(await get()),five(final));
  browser=await openDemoBrowser({directory:path.join(out,'reopen-browser'),url:server.url+'/demo-runtime.html',onEvent(event){if(event.method==='Runtime.exceptionThrown')errors.push(event.params);}});
  await wait(()=>read(`document.body?.dataset.worldConnected==='true'`));await browser.click('#tabBagBtn');
  assert.equal(await read(`document.querySelectorAll('#actionHistory li').length`),0);
  assert.match(await read(`document.querySelector('#bagContents').textContent`),/金币 20/);
  assert.match(await read(`document.querySelector('#bagContents').textContent`),/粮食 19/);
  await browser.close();browser=null;await server.close();server=null;
 });
 for(const [name,hash] of Object.entries(hashes))assert.equal(sha(await fs.readFile(path.join(directory,name))),hash);
 assert.deepEqual(errors,[]);report={verdict:'PASS',steps,errors,requests,actionHistory,files:hashes,projectionSignature:sha(canonicalJson(five(final))),
  final:{revision:final.snapshot.revision,tick:final.snapshot.tick,wallet:final.player.self.wallet,food:final.player.self.inventory.food,fatigue:final.player.self.fatigue},commands:envelope.commands};
}catch(error){report={verdict:'FAIL',steps,errors,requests,error:{message:error.message,stack:error.stack,cause:error.cause?.message}};process.exitCode=1;}
finally{if(browser)await browser.close();if(server)await server.close();report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(n=>n.endsWith('.lock'));await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({verdict:report.verdict,steps:steps.length,error:report.error?.message}));}
