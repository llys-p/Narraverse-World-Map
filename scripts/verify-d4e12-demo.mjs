import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {loadServiceCommit} from '../runtime/service/service-commit.mjs';
import {canonicalJson} from '../runtime/core/data-contract.mjs';
import {coherent} from '../demo-runtime-bridge.mjs';
import {validateCampaignReceipt} from '../runtime-campaign-contract.mjs';
import {openDemoBrowser} from './demo-browser-client.mjs';

const uiOnly=process.argv.includes('--ui-only');
const out=path.resolve(process.argv[2]??'artifacts/d4e12/consumer-01'),resumeDirectory=process.argv[3]&&!process.argv[3].startsWith('--')?path.resolve(process.argv[3]):null,directory=resumeDirectory??path.join(out,'world');
await fs.mkdir(out,{recursive:false});const steps=[],errors=[],requests=[],timings=[];let server,browser,report;
const sha=b=>createHash('sha256').update(b).digest('hex'),totalStart=performance.now();
const watchdog=setTimeout(()=>{console.error('TOTAL_LIMIT');process.exit(2);},590000);watchdog.unref();
async function phase(name,run){const start=performance.now(),cpu=process.cpuUsage();await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:name,startedAt:Date.now()}));let done;const timer=setTimeout(()=>{console.error('PHASE_LIMIT '+name);process.exit(3);},120000);timer.unref();
 try{done=await run();steps.push({name,wallMs:performance.now()-start,cpuMs:Object.values(process.cpuUsage(cpu)).reduce((a,b)=>a+b)/1000});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(steps,null,2));return done;}finally{clearTimeout(timer);await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:null}));}}
const get=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state',{headers:{Connection:'close'},signal:AbortSignal.timeout(120000)});assert.equal(r.status,200);const g=await r.json();assert(coherent(g));return g;};
async function waitFor(test,ms=120000){const start=performance.now();while(performance.now()-start<ms){const value=await test();if(value)return value;await delay(80);}throw Error('Consumer condition timed out');}
async function ready(){await waitFor(()=>browser.read(`document.body?.dataset.worldConnected==='true' && (!document.querySelector('#toForest').disabled || !document.querySelector('#attack').disabled)`));}
async function clickCommand(selector,type){
 const before=await get();await ready();const start=performance.now();await browser.click(selector);
 await waitFor(async()=>{const text=await browser.read(`document.querySelector('#lastReceipt').textContent`);try{const r=JSON.parse(text);return r.type===type&&r.toRevision>before.snapshot.revision;}catch{return false;}});
 await waitFor(()=>browser.read(`!document.querySelector('#retryPending').hidden ? false : !document.querySelector('#toForest').disabled`));
 const after=await get();timings.push({type,wallMs:performance.now()-start,fromRevision:before.snapshot.revision,toRevision:after.snapshot.revision});return after;
}
try{
 await phase('start',async()=>{server=await startRuntimeServer({directory,...(resumeDirectory?{}:{profile:'campaign-village',seed:42}),port:0,writable:true,continuousMarch:true});
  browser=await openDemoBrowser({directory:out,url:server.url+'/demo-runtime.html',onEvent(event){
   if(event.method==='Runtime.exceptionThrown')errors.push({kind:event.method,details:event.params.exceptionDetails});
   if(event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')errors.push({kind:'console',args:event.params.args.map(a=>a.value??a.description)});
   if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')errors.push({kind:'log',text:event.params.entry.text});
   if(event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST')requests.push({url:new URL(event.params.request.url).pathname,body:event.params.request.postData});
  }});await ready();});
 if(!resumeDirectory){
 await phase('village-person-and-gift',async()=>{await browser.click('#tabSceneBtn');await browser.click('[data-actor-id="actor-2"]');
  assert.match(await browser.read(`document.querySelector('#personDetail').textContent`),/actor-2/);await clickCommand('#personGift','PlayerGiftFood');
  assert.match(await browser.read(`document.querySelector('#personMemory').textContent`),/人物记得/);await browser.click('#closePerson');});
 if(!uiOnly)await phase('work-trade-rest',async()=>{await clickCommand('#work','PlayerWork');const after=await clickCommand('#buyFood','PlayerBuy');assert.equal(after.player.self.wallet,10);await clickCommand('#rest','PlayerRest');});
 await phase('march-pause-replan-forest',async()=>{
  await browser.click('#tabWorldBtn');await clickCommand('#toForest','MarchSet');
  await waitFor(async()=>{const g=await get();return g.map.self.x>4||g.map.contact;});await browser.click('#pauseMarch');
  await waitFor(async()=>!(await get()).runner.active);await ready();
  await clickCommand('#toVillage','MarchSet');await browser.click('#pauseMarch');await waitFor(async()=>!(await get()).runner.active);await ready();
  await clickCommand('#toForest','MarchSet');
  await waitFor(async()=>{const g=await get();if(g.map.self.x===16&&g.map.self.y===7&&!g.runner.active)return true;
   if(!g.runner.active&&g.map.order?.status==='paused'){await ready();await clickCommand('#resumeMarch','MarchResume');}return false;});
  await browser.click('#tabSceneBtn');assert.match(await browser.read(`document.querySelector('#modeTag').textContent`),/森林/);
 });
 await phase('jrpg-two-turns',async()=>{await clickCommand('#beginEncounter','EncounterBegin');await clickCommand('#attack','EncounterAction');const g=await clickCommand('#attack','EncounterAction');assert.equal(g.encounter.encounter.resolution,'win');assert.equal(g.player.self.health,920);});
 }else{const g=await get();assert.equal(g.encounter.encounter.resolution,'win');assert.equal(g.player.self.health,920);assert.equal(g.map.order?.target.x,4);assert.equal(g.map.order?.target.y,7);}
 await phase('return-village',async()=>{await browser.click('#tabWorldBtn');const g=await get();
  if(g.map.order?.target.x===4&&g.map.order?.target.y===7&&['paused','marching'].includes(g.map.order.status))await clickCommand('#resumeMarch','MarchResume');
  else if(g.map.self.x!==4||g.map.self.y!==7)await clickCommand('#toVillage','MarchSet');
  await waitFor(async()=>{const g=await get();if(g.map.self.x===4&&g.map.self.y===7&&!g.runner.active)return true;
   if(!g.runner.active&&g.map.order?.status==='paused'){await ready();await clickCommand('#resumeMarch','MarchResume');}return false;});await browser.click('#enterLocation');
  assert.match(await browser.read(`document.querySelector('#modeTag').textContent`),/村庄/);});
 const final=await get(),files=(await fs.readdir(directory)).filter(n=>n.endsWith('.json')).sort();const hashes={};for(const file of files)hashes[file]=sha(await fs.readFile(path.join(directory,file)));
 const latest=files.sort((a,b)=>Number(b.match(/r(\d+)/)[1])-Number(a.match(/r(\d+)/)[1]))[0];
 const envelope=uiOnly?JSON.parse(await fs.readFile(path.join(directory,latest),'utf8')):await phase('full-independent-replay',()=>loadServiceCommit(path.join(directory,latest)));
 for(const entry of envelope.commands)assert(validateCampaignReceipt(entry.receipt,entry.dto,entry.receipt.fromTick));
 assert(envelope.commands.some(e=>e.dto.type==='MarchStep'));assert(!requests.some(r=>{try{return JSON.parse(r.body).type==='MarchStep';}catch{return false;}}));
 assert.equal(envelope.commands.filter(e=>e.dto.type==='EncounterAction').length,2);
 const forged=structuredClone(final);forged.player.revision++;assert(!coherent(forged));
 await phase('close',async()=>{await browser.close();browser=null;await server.close();server=null;});assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));
 if(!uiOnly)await phase('reopen',async()=>{server=await startRuntimeServer({directory,port:0,writable:true,continuousMarch:true});const restored=await get();for(const key of ['snapshot','map','player','encounter','scene'])assert.deepEqual(restored[key],final[key]);assert.equal(restored.runner.active,false);
  for(const [file,hash] of Object.entries(hashes))assert.equal(sha(await fs.readFile(path.join(directory,file))),hash);
  browser=await openDemoBrowser({directory:path.join(out,'reopen-browser'),url:server.url+'/demo-runtime.html',onEvent(event){if(event.method==='Runtime.exceptionThrown')errors.push(event.params);}});await ready();await browser.click('#tabSceneBtn');assert.match(await browser.read(`document.querySelector('#modeTag').textContent`),/村庄/);
 });
 assert.deepEqual(errors,[]);
 report={verdict:'PASS',coverage:{workTradeRest:!uiOnly,fullIndependentReplay:!uiOnly,reopen:!uiOnly},environment:{node:process.version,platform:process.platform},steps,timings,errors,requests,hashes,
  projectionSignature:sha(canonicalJson(['snapshot','map','player','encounter','scene'].map(k=>final[k]))),
  final:{revision:final.snapshot.revision,tick:final.snapshot.tick,health:final.player.self.health,wallet:final.player.self.wallet,food:final.player.self.inventory.food,position:final.map.self,resolution:final.encounter.encounter.resolution},commands:envelope.commands.length,totalMs:performance.now()-totalStart};
}catch(error){report={verdict:'FAIL',steps,timings,errors,requests,error:{message:error.message,stack:error.stack,cause:error.cause?.message,causeCode:error.cause?.code},totalMs:performance.now()-totalStart};process.exitCode=1;console.error(error.stack);}
finally{if(browser)await browser.close();if(server)await server.close();clearTimeout(watchdog);report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(n=>n.endsWith('.lock'));await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({verdict:report.verdict,steps:steps.length,totalMs:report.totalMs,error:report.error?.message}));}
