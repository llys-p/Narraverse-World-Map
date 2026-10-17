import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {createAuditedBundle} from '../runtime/core/world-state.mjs';
import {canonicalJson} from '../runtime/core/data-contract.mjs';
import {runtimeProfile,projectPublicSnapshot,projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot,projectSceneSnapshot} from '../runtime/service/http-contract.mjs';
import {coherent} from '../demo-runtime-bridge.mjs';
import {openDemoBrowser} from './demo-browser-client.mjs';
const out=path.resolve(process.argv[2]),directory=path.resolve(process.argv[3]);await fs.mkdir(out,{recursive:false});
const steps=[],errors=[],hashes={},sha=b=>createHash('sha256').update(b).digest('hex');let server,browser,report;
async function phase(name,run){await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:name,startedAt:Date.now()}));const start=performance.now(),cpu=process.cpuUsage();
 try{const result=await run();steps.push({name,wallMs:performance.now()-start,cpuMs:Object.values(process.cpuUsage(cpu)).reduce((a,b)=>a+b)/1000});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(steps,null,2));return result;}
 finally{await fs.writeFile(path.join(out,'phase.json'),'{"phase":null}');}}
try{
 const files=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n));
 for(const name of files)hashes[name]=sha(await fs.readFile(path.join(directory,name)));
 const latest=files.sort((a,b)=>Number(b.match(/r(\d+)/)[1])-Number(a.match(/r(\d+)/)[1]))[0],raw=JSON.parse(await fs.readFile(path.join(directory,latest),'utf8'));
 const expected=await phase('independent-world-projections',async()=>{
  const {rulesVersion,systems}=runtimeProfile(raw.bundle),bundle=createAuditedBundle(raw.bundle,{rulesVersion,systems});
  return {snapshot:projectPublicSnapshot(bundle),map:projectMapSnapshot(bundle,128-bundle.snapshot.world.encounterModel.inputHistory.length),player:projectPlayerSnapshot(bundle),encounter:projectEncounterSnapshot(bundle),scene:projectSceneSnapshot(bundle)};
 });
 assert.equal(expected.map.self.x,4);assert.equal(expected.map.self.y,7);assert.equal(expected.encounter.encounter.resolution,'win');assert.equal(expected.player.self.health,920);
 await phase('single-audit-cold-reopen',async()=>{server=await startRuntimeServer({directory,port:0,writable:true,continuousMarch:true});});
 const get=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state',{headers:{Connection:'close'},signal:AbortSignal.timeout(120000)});assert.equal(r.status,200);return r.json();};
 await phase('five-projection-sha-and-fixed-retry',async()=>{
  const restored=await get();assert(coherent(restored));for(const key of Object.keys(expected))assert.deepEqual(restored[key],expected[key]);assert.equal(restored.runner.active,false);
  const entry=raw.commands.findLast(c=>['MarchSet','MarchResume','MarchPause'].includes(c.dto.type));
  const r=await fetch(server.url+'/api/runtime/demo-order',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({apiVersion:1,requestId:entry.dto.commandId,type:entry.dto.type,payload:entry.dto.payload})});
  assert.equal(r.status,200);assert.deepEqual((await r.json()).receipt,entry.receipt);assert.equal((await get()).snapshot.revision,expected.snapshot.revision);
 });
 await phase('browser-restored-scene-assets-and-turn-state',async()=>{
  browser=await openDemoBrowser({directory:out,url:server.url+'/demo-runtime.html',onEvent(event){if(event.method==='Runtime.exceptionThrown')errors.push(event.params);if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')errors.push(event.params.entry);}});
  const start=performance.now();while(!await browser.read(`document.body?.dataset.worldConnected==='true'`)){assert(performance.now()-start<15000);await delay(80);}
  await browser.click('#tabSceneBtn');assert.match(await browser.read(`document.querySelector('#modeTag').textContent`),/村庄/);
  await browser.click('#tabBagBtn');assert.match(await browser.read(`document.querySelector('#bagContents').textContent`),new RegExp('金币 '+expected.player.self.wallet));await browser.click('#closeBag');
  await browser.click('#tabBattleBtn');assert.match(await browser.read(`document.querySelector('#battleState').textContent`),/战斗结束 · 胜利/);
  await browser.click('#battleReturn');for(const key of Object.keys(expected))assert.deepEqual((await get())[key],expected[key]);
 });
 await phase('normal-close-and-file-protection',async()=>{await browser.close();browser=null;await server.close();server=null;
  for(const [name,hash] of Object.entries(hashes))assert.equal(sha(await fs.readFile(path.join(directory,name))),hash);
  assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));assert.deepEqual(errors,[]);
 });
 report={verdict:'PASS',environment:{node:process.version,platform:process.platform},steps,errors,hashes,projectionSignature:sha(canonicalJson(Object.values(expected))),
  final:{revision:expected.snapshot.revision,tick:expected.snapshot.tick,position:expected.map.self,health:expected.player.self.health,wallet:expected.player.self.wallet,food:expected.player.self.inventory.food,resolution:expected.encounter.encounter.resolution},commandCount:raw.commands.length};
}catch(error){process.exitCode=1;report={verdict:'FAIL',steps,errors,error:{message:error.message,stack:error.stack,cause:error.cause?.message}};console.error(error.stack);}
finally{if(browser)await browser.close();if(server)await server.close();report.remainingLocks=(await fs.readdir(directory)).filter(n=>n.endsWith('.lock'));await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({verdict:report.verdict,steps:steps.length,error:report.error?.message}));}
