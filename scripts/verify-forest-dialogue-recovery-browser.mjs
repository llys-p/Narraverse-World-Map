// Controlled browser failure injection against a fresh fixture8 world.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {loadServiceCommit} from '../runtime/service/service-commit.mjs';
import {openDemoBrowser} from './demo-browser-client.mjs';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';

const [argument,...extra]=process.argv.slice(2);
assert.ok(argument&&!extra.length,'Usage: node scripts/verify-forest-dialogue-recovery-browser.mjs artifacts/forest-dialogue/NEW');
const out=path.resolve(argument);
assert.ok(out.startsWith(path.resolve('artifacts/forest-dialogue')+path.sep),'Use a fresh synthetic artifacts directory');
const candidate=await verifyForestCandidate();
// Neither Chromium nor the worker needs the user's provider credential.
delete process.env.NPC_LLM_API_KEY;
const directory=path.join(out,'world');
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.mkdir(out);

const compose='/api/runtime/demo-npc-compose',commands='/api/runtime/commands';
const question='工具现在还有多少耐久？',repair='我现在要帮你修理这个工具。';
const utterances=[question,repair,repair],reply='等你动手，我再看看修得怎么样。';
const proposal={type:'PlayerInteract',payload:{targetId:'actor-2',action:'help'}};
const posts=[],composeStatuses=[],paused=[];
const report={schemaVersion:1,candidate:candidate.id,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),externalModelCalls:0,controlledCalls:0,steps:[],verdict:'FAIL'};
const sources=['scripts/verify-forest-dialogue-recovery-browser.mjs','scripts/demo-browser-client.mjs','docs/runtime/forest-playtest-candidate.json'];
report.sourceSha256=Object.fromEntries(await Promise.all(sources.map(async file=>[
 file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const model=createServer(async(req,res)=>{
 try{
  assert.equal(req.method,'POST');assert.equal(req.url,'/chat/completions');
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks));
  assert.equal(body.model,'controlled-recovery');
  const expected=utterances[report.controlledCalls++];
  assert.ok(expected,'Unexpected extra generation');
  assert.equal(JSON.parse(body.messages.at(-1).content).playerUtterance,expected);
  // The first response deliberately violates the read-only question contract.
  const content=JSON.stringify({reply:expected===question?'现在耐久是六十。':reply,memoryRefs:[],proposal});
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]}));
 }catch(error){report.providerError=error.message;res.writeHead(500);res.end();}
});
let service,browser;
const text=id=>browser.read(`document.querySelector(${JSON.stringify(id)}).textContent`);
const enabled=id=>browser.read(`(()=>{const n=document.querySelector(${JSON.stringify(id)});return !!n&&!n.hidden&&!n.disabled&&n.getClientRects().length>0;})()`);
const get=async()=>{const r=await fetch(service.url+'/api/runtime/demo-state');assert.equal(r.status,200);return r.json();};
const views=g=>[g.snapshot,g.map,g.player,g.encounter,g.scene];
const saveHashes=async()=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort()
 .map(async f=>[f,createHash('sha256').update(await fs.readFile(path.join(directory,f))).digest('hex')])));
const browserWrites=()=>posts.filter(p=>p.route===commands);
async function wait(check,label){
 const end=performance.now()+35000;
 while(performance.now()<end){
  assert.equal(report.providerError,undefined);
  const result=await check();if(result)return result;await delay(75);
 }
 throw Error(label+' timed out');
}
async function hunter(){
 await wait(()=>browser.read('document.body?.dataset.worldConnected==="true"'),'world connection');
 await browser.click('#tabSceneBtn');
 const button='#scenePeople button[data-actor-id="actor-2"]';
 await wait(()=>enabled(button),'hunter entry');await browser.click(button);
}
async function generate(utterance){
 await browser.click('#npcDialogueText');
 const previous=await browser.read('document.querySelector("#npcDialogueText").value');
 if(previous!==utterance){
  if(previous){
   const selectAll={key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65,nativeVirtualKeyCode:65};
   await browser.call('Input.dispatchKeyEvent',{type:'rawKeyDown',...selectAll});
   await browser.call('Input.dispatchKeyEvent',{type:'keyUp',...selectAll});
  }
  await browser.call('Input.insertText',{text:utterance});
  assert.equal(await browser.read('document.querySelector("#npcDialogueText").value'),utterance);
 }
 await wait(()=>enabled('#npcDialogueGenerate'),'generate button');
 await browser.click('#npcDialogueGenerate');
}
async function advance(commandId,expectedRevision){
 const response=await fetch(service.url+commands,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({version:5,type:'AdvanceTime',commandId,expectedRevision,payload:{ticks:1}})});
 assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.outcome,'succeeded');
 assert.equal(receipt.toRevision,expectedRevision+1);
 return get();
}
async function doubleConfirm(){
 const {root}=await browser.call('DOM.getDocument');
 const {nodeId}=await browser.call('DOM.querySelector',{nodeId:root.nodeId,selector:'#npcDialogueCommit'});
 await browser.call('DOM.scrollIntoViewIfNeeded',{nodeId});
 const at=await browser.read("(()=>{const r=document.querySelector('#npcDialogueCommit').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 for(const clickCount of [1,2])for(const type of ['mousePressed','mouseReleased'])
  await browser.call('Input.dispatchMouseEvent',{type,button:'left',clickCount,...at});
}

try{
 model.listen(0,'127.0.0.1');await once(model,'listening');
 const options={directory,writable:true,continuousMarch:true,
  npcLanguage:{enabled:true,baseURL:'http://127.0.0.1:'+model.address().port,model:'controlled-recovery',apiKey:''}};
 service=await startRuntimeServer({...options,profile:'campaign-forest-village',seed:42,port:0});
 browser=await openDemoBrowser({directory:path.join(out,'browser'),url:service.url+'/demo-runtime.html',onEvent(event){
  if(event.method==='Fetch.requestPaused')paused.push(event.params);
  if(event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST'){
   const request=event.params.request,route=new URL(request.url).pathname;
   if([compose,commands].includes(route))posts.push({route,body:request.postData});
  }
  if(event.method==='Network.responseReceived'&&new URL(event.params.response.url).pathname===compose)
   composeStatuses.push(event.params.response.status);
 }});
 report.browser=(await browser.call('Browser.getVersion')).product;
 await hunter();
 const initial=await get(),initialFiles=await saveHashes(),durability=initial.map.social.asset.condition;
 assert.equal(durability,60);

 await generate(question);
 await wait(async()=>/没有保存交谈/.test(await text('#npcDialogueStatus'))&&report.controlledCalls===1,'rejected read-only proposal');
 assert.match(await text('#npcDialogueStatus'),/回复格式或记忆引用不正确/);
 assert.equal(await text('#npcDialoguePreview'),'');assert.equal(await enabled('#npcDialogueCommit'),false);
 assert.equal(await enabled('#npcDialogueAct'),false);assert.deepEqual(views(await get()),views(initial));
 assert.deepEqual(await saveHashes(),initialFiles);assert.equal(browserWrites().length,0);
 report.steps.push('reject-action-on-durability-question');

 await generate(repair);
 await wait(()=>enabled('#npcDialogueCommit'),'first repair preview');
 assert.equal(await text('#npcDialoguePreview'),reply);
 assert.deepEqual(await saveHashes(),initialFiles);
 const before=await advance('recovery-advance-before-speech',initial.snapshot.revision);
 await wait(async()=>/世界状态已变化/.test(await text('#npcDialogueStatus')),'invalidate preview after world change');
 assert.equal(await text('#npcDialoguePreview'),'');assert.equal(await enabled('#npcDialogueCommit'),false);
 assert.equal(await enabled('#npcDialogueAct'),false);assert.equal(browserWrites().length,0);
 report.steps.push('discard-unconfirmed-preview-after-world-change');

 await generate(repair);
 await wait(()=>enabled('#npcDialogueCommit'),'fresh repair preview');
 await browser.call('Fetch.enable',{patterns:[{urlPattern:service.url+commands,requestStage:'Response'}]});
 await doubleConfirm();
 const lost=await wait(()=>paused[0],'persisted reply interception');
 assert.equal(lost.responseStatusCode,200);
 const saved=await get(),savedFiles=await saveHashes();
 assert.equal(saved.snapshot.revision,before.snapshot.revision+1);
 assert.equal(saved.snapshot.tick,before.snapshot.tick);
 assert.equal(saved.map.social.asset.condition,durability);assert.equal(saved.map.negotiation.lastTurn.reply,reply);
 assert.equal(browserWrites().length,1);assert.equal(JSON.parse(browserWrites()[0].body).type,'PlayerDialogue');
 assert.equal(await enabled('#npcDialogueCommit'),false);assert.equal(await enabled('#npcDialogueAct'),false);
 report.steps.push('double-click-saves-speech-once-without-action');
 await browser.call('Fetch.failRequest',{requestId:lost.requestId,errorReason:'ConnectionReset'});
 await browser.call('Fetch.disable');
 await wait(()=>enabled('#retryPending'),'pending retry after lost reply');

 const port=Number(new URL(service.url).port);
 await service.close();
 service=await startRuntimeServer({...options,port});
 await browser.call('Page.reload');
 await wait(()=>enabled('#retryPending'),'pending retry after restart and reload');
 await hunter();
 assert.ok((await text('#npcDialogueHistory')).includes(reply));
 assert.equal(await enabled('#npcDialogueAct'),false);
 await browser.click('#retryPending');
 await wait(()=>enabled('#npcDialogueAct'),'separate suggestion after confirmed retry');
 const writes=browserWrites();assert.equal(writes.length,2);assert.equal(writes[0].body,writes[1].body);
 assert.deepEqual(views(await get()),views(saved));assert.deepEqual(await saveHashes(),savedFiles);
 report.steps.push('same-bytes-retry-after-service-restart-and-browser-reload');

 const final=await advance('recovery-advance-after-speech',saved.snapshot.revision);
 await wait(async()=>await text('#revisionText')==='修订 '+final.snapshot.revision,'new revision in browser');
 assert.equal(await enabled('#npcDialogueAct'),false);
 assert.ok((await text('#npcDialogueHistory')).includes(reply));
 assert.equal(final.map.social.asset.condition,durability);
 const commit=await loadServiceCommit(path.join(directory,`service-commit-r${final.snapshot.revision}.json`));
 assert.deepEqual(commit.commands.map(c=>c.dto.type),['AdvanceTime','PlayerDialogue','AdvanceTime']);
 assert.equal(report.controlledCalls,3);assert.equal(posts.filter(p=>p.route===compose).length,3);
 assert.deepEqual(composeStatuses,[502,200,200]);
 assert.equal(browserWrites().length,2);assert.equal(paused.length,1);assert.equal(report.providerError,undefined);
 report.steps.push('discard-action-suggestion-after-world-change');
 report.final={revision:final.snapshot.revision,durabilityBefore:durability,durabilityAfter:final.map.social.asset.condition,
  savedSpeechCount:1,browserWriteRequests:2,distinctBrowserWrites:1,retrySameBytes:true,composeStatuses};
 report.verdict='PASS';
}catch(error){report.error={code:error.code??null,message:error.message};}
finally{
 const cleanup=await Promise.allSettled([browser?.close(),service?.close(),model.listening?new Promise((resolve,reject)=>model.close(e=>e?reject(e):resolve())):null]);
 report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(file=>file.endsWith('.lock'));
 if(cleanup.some(result=>result.status==='rejected')||report.remainingLocks.length){report.cleanupFailed=true;report.verdict='FAIL';}
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
 if(report.verdict!=='PASS')process.exitCode=1;
}
