// Runs against a new synthetic world only. No .env, saved user world, model or deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {openDemoBrowser,demoBrowserExecutable} from './demo-browser-client.mjs';
import {loadServiceCommit} from '../runtime/service/service-commit.mjs';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';
const out=path.resolve(process.argv[2]??'artifacts/forest-playtest/run-'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out); // Never overwrite a previous run.
const directory=path.join(out,'world'),steps=[],errors=[],requests=[],screenshots=[],diagnostics={},sha=b=>createHash('sha256').update(b).digest('hex');
let server,browser,report,candidate,startedService=false,everOpenedBrowser=false;
const five=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
const files=async()=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,sha(await fs.readFile(path.join(directory,f)))])));
const get=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);return r.json();};
async function wait(check){for(let i=0;i<1600;i++){
 if(errors.length)throw Error('Browser error: '+JSON.stringify(errors[0]));const value=await check();if(value)return value;
 if(i===100&&browser){diagnostics.uiState=await read(`({focus:document.activeElement?.id,visibility:document.visibilityState,phase:document.body.dataset.operationPhase,status:document.querySelector('#connectionStatus')?.textContent,battle:document.querySelector('#battleState')?.textContent,toForestDisabled:document.querySelector('#toForest')?.disabled,retryHidden:document.querySelector('#retryPending')?.hidden,retryDisabled:document.querySelector('#retryPending')?.disabled,lastReceipt:document.querySelector('#lastReceipt')?.textContent})`);await fs.writeFile(path.join(out,'debug-state.json'),JSON.stringify(diagnostics,null,2));}
 await delay(60);
}throw Error('Browser acceptance phase timed out');}
async function phase(name,run){await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:name,startedAt:Date.now()}));const start=performance.now();try{return await run();}finally{steps.push({name,wallMs:Math.round(performance.now()-start)});await fs.writeFile(path.join(out,'phase.json'),'{"phase":null}');}}
const read=expression=>browser.read(expression);
async function press(key){const code=key==='Tab'?9:13;for(const type of ['keyDown','keyUp'])await browser.call('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,...(key==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});}
async function command(selector,type,keyboard=false){
 diagnostics.awaiting=selector+':'+type;
 const before=await get();await wait(()=>read(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.hidden)return false;const r=n.getBoundingClientRect();return r.width>0&&r.height>0;})()`));
 if(keyboard){for(let i=0;i<160&&!(await read(`document.activeElement?.id===${JSON.stringify(selector.slice(1))}`));i++)await press('Tab');assert.equal(await read(`document.activeElement?.id`),selector.slice(1));await press('Enter');}
 else await browser.click(selector);
 await wait(()=>read(`(()=>{try{const r=JSON.parse(document.querySelector('#lastReceipt').textContent);return r.type===${JSON.stringify(type)}&&r.toRevision>${before.snapshot.revision}&&!document.querySelector('#toForest').disabled;}catch{return false;}})()`));
 diagnostics.awaiting=null;return get();
}
const quest=(id,action)=>command(`article[data-quest="${id}"] [data-quest-action="${action}"]`,'PlayerQuest');
async function march(selector){await browser.click('#tabWorldBtn');await command(selector,'MarchSet');for(let i=0;i<800;i++){const g=await get();if(g.map.order?.status==='arrived')return g;if(g.map.order?.status==='paused')await command('#resumeMarch','MarchResume');await delay(80);}throw Error('Browser journey did not arrive');}
function onEvent(event){
 if(event.method==='Runtime.exceptionThrown'||event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')errors.push(event.params);
 if(event.method==='Log.entryAdded'&&event.params.entry.level==='error'&&!event.params.entry.url?.endsWith('/favicon.ico'))errors.push(event.params.entry);
 if(event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST')requests.push({route:new URL(event.params.request.url).pathname,body:event.params.request.postData??null});
}
async function open(name){browser=await openDemoBrowser({directory:path.join(out,name),url:server.url+'/demo-runtime.html',onEvent});everOpenedBrowser=true;await wait(()=>read(`document.body?.dataset.worldConnected==='true'`));}
async function capture(name){const result=await browser.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const bytes=Buffer.from(result.data,'base64');await fs.writeFile(path.join(out,name),bytes,{flag:'wx'});screenshots.push({file:name,sha256:sha(bytes)});}
async function focusSection(selector){const d=await browser.call('DOM.getDocument'),n=await browser.call('DOM.querySelector',{nodeId:d.root.nodeId,selector});assert.ok(n.nodeId);await browser.call('DOM.scrollIntoViewIfNeeded',{nodeId:n.nodeId});}
try{
 candidate=await verifyForestCandidate();
 await fs.access(demoBrowserExecutable()).catch(()=>{throw Object.assign(Error('No local Edge/Chromium executable. Set DEMO_BROWSER_EXECUTABLE to an installed browser, then rerun into a new output folder.'),{code:'BROWSER_UNAVAILABLE'});});
 await phase('new-isolated-world',async()=>{server=await startRuntimeServer({directory,profile:'campaign-forest-village',seed:42,port:0,writable:true,continuousMarch:true,npcLanguage:{enabled:false}});startedService=true;await open('desktop-browser');assert.equal((await get()).capabilities.npcLanguage.enabled,false);});
 const version=await browser.call('Browser.getVersion');
 await phase('village-and-real-loan-through-buttons',async()=>{
  await quest('livelihood','accept');await command('#work','PlayerWork');await command('#buyFood','PlayerBuy');await quest('livelihood','claim');await quest('hunter-aid','accept');
  const before=await files(),revision=(await get()).snapshot.revision;
  await browser.click('article[data-quest="hunter-aid"] button:not([data-quest-action])');assert.equal(await read('document.activeElement?.id'),'personName');assert.equal((await get()).snapshot.revision,revision);assert.deepEqual(await files(),before);
  await command('#social-help','PlayerInteract');await browser.click('#closePerson');await command('#giftFood','PlayerGiftFood');await quest('hunter-aid','claim');
  await quest('hunter-trust','accept');await quest('forest-route','accept');await browser.click('article[data-quest="hunter-trust"] button:not([data-quest-action])');
  const borrowed=await command('#social-ask-help','PlayerInteract');assert.equal(borrowed.map.social.asset.holderId,'actor-4');await browser.click('#closePerson');
 });
 let mobileLayout,damage;
 await phase('desktop-and-narrow-screen-forest-controls',async()=>{
  await march('#toForest');await focusSection('#forestJourney');await capture('forest-desktop.png');
  await browser.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await focusSection('#forestJourney');
  mobileLayout=await read(`(()=>{const ids=['collect','camp','observe','avoid','site','rest','challenge','exit','return'];return {viewport:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth,buttons:ids.map(id=>{const n=document.getElementById('forest-'+id),r=n.getBoundingClientRect();return {id,width:r.width,height:r.height,described:n.getAttribute('aria-describedby').split(' ').every(k=>!!document.getElementById(k))};})};})()`);
  diagnostics.mobileLayout=mobileLayout;
  diagnostics.overflow=await read(`Array.from(document.querySelectorAll('body *')).map(n=>({id:n.id,tag:n.tagName,classes:n.className,rect:n.getBoundingClientRect()})).filter(n=>n.rect.width>0&&(n.rect.right>document.documentElement.clientWidth+1||n.rect.left<0)).slice(0,30).map(n=>({id:n.id,tag:n.tag,classes:typeof n.classes==='string'?n.classes:'',left:n.rect.left,right:n.rect.right,width:n.rect.width}))`);
  await capture('forest-narrow.png');
  assert.ok(mobileLayout.viewport<=390,'Narrow viewport was not applied');assert.ok(mobileLayout.documentWidth<=mobileLayout.viewport+1,'Horizontal overflow on the narrow viewport');assert.ok(mobileLayout.buttons.every(b=>b.height>=44&&b.described));
  await command('#forest-collect','PlayerForest');assert.equal((await get()).map.forest.state.firewood,1);await command('#forest-camp','PlayerForest');assert.equal((await get()).map.forest.state.firewood,0);
 });
 await phase('explicit-encounter-and-keyboard-exit',async()=>{
  await command('#forest-observe','PlayerForest');await command('#forest-challenge','EncounterBegin');await command('#attack','EncounterAction');damage=(await get()).player.self.health;
  const tick=(await get()).map.tick;const exited=await command('#forest-exit','EncounterCancel',true);assert.equal(exited.encounter.encounter.reserved,false);assert.equal(exited.map.tick,tick);assert.equal(exited.player.self.health,damage);
 });
 let final,hashes;
 await phase('return-worn-tool-and-complete',async()=>{
  await march('#forest-return');await browser.click('article[data-quest="hunter-trust"] button:not([data-quest-action])');
  diagnostics.personLayout=await read(`(()=>{const r=document.querySelector('#portraitCanvas').getBoundingClientRect();return {viewport:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth,portraitWidth:r.width,portraitHeight:r.height};})()`);await capture('hunter-narrow.png');assert.ok(diagnostics.personLayout.documentWidth<=diagnostics.personLayout.viewport+1,'Horizontal overflow in the narrow hunter card');assert.equal(diagnostics.personLayout.portraitWidth,140);assert.equal(diagnostics.personLayout.portraitHeight,140);
  await command('#social-return','PlayerInteract');await browser.click('#closePerson');
  await quest('hunter-trust','claim');await quest('forest-route','claim');final=await get();assert.equal(final.map.playable.chapterComplete,true);assert.equal(final.map.playable.rank,4);assert.equal(final.map.social.asset.condition,70);hashes=await files();
  const commit=await loadServiceCommit(path.join(directory,`service-commit-r${final.snapshot.revision}.json`));assert.equal(commit.bundle.snapshot.fixtureVersion,'8');
  await browser.close();browser=null;await server.close();server=null;assert.ok(!(await fs.readdir(directory)).includes('.runtime-owner.lock'),'Clean shutdown must release ownership before reopening');
 });
 await phase('reopen-same-world-with-no-extra-commit',async()=>{
  server=await startRuntimeServer({directory,port:0,writable:true,continuousMarch:true,npcLanguage:{enabled:false}});assert.deepEqual(five(await get()),five(final));await open('reopen-browser');await focusSection('#playableGoals');await capture('reopened-chapter.png');
  assert.match(await read(`document.querySelector('#playableTitle').textContent`),/第一章完成/);assert.deepEqual(await files(),hashes);await browser.close();browser=null;await server.close();server=null;
 });
 assert.deepEqual(errors,[]);report={verdict:'PASS',candidate:'forest-playtest-candidate-2',contentBase:'8fa8179a99ddf85ac142df30956ad8d4ee049527',browserExecuted:true,browserVersion:version.product,desktop:true,narrowViewportEmulated:true,keyboardExit:true,mobileLayout,requests,steps,screenshots,final:{tick:final.map.tick,rank:4,toolCondition:70},externalModelCalls:0,windowsLauncherExecuted:false,physicalMobileTested:false,screenReaderTested:false,realModelLanguageTested:false};
}catch(error){report={verdict:error.code==='BROWSER_UNAVAILABLE'?'BLOCKED':'FAIL',candidate:'forest-playtest-candidate-2',contentBase:'8fa8179a99ddf85ac142df30956ad8d4ee049527',browserExecuted:everOpenedBrowser,steps,errors,requests,screenshots,diagnostics,error:{code:error.code??null,message:error.message},externalModelCalls:0};process.exitCode=report.verdict==='BLOCKED'?2:1;}
finally{
 const cleanupErrors=[];for(const [name,instance]of [['browser',browser],['server',server]])if(instance)try{await instance.close();}catch(error){cleanupErrors.push({name,message:error.message});}
 report.startedService=startedService;report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(f=>f.endsWith('.lock'));
 report.candidateVerified=!!candidate;report.candidateGameFiles=candidate?.gameFiles??0;
 report.cleanupErrors=cleanupErrors;if(cleanupErrors.length||report.remainingLocks.length){report.verdict='FAIL';process.exitCode=1;}
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({verdict:report.verdict,report:path.join(out,'result.json'),browserExecuted:report.browserExecuted,startedService,externalModelCalls:0}));
}
