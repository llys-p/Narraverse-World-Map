// Real Chromium keyboard input with a loopback-only provider and a fresh fixture8 save.
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

const [argument,...extra]=process.argv.slice(2),out=path.resolve(argument??'');
assert.ok(argument&&!extra.length&&out.startsWith(path.resolve('artifacts/forest-dialogue')+path.sep),'Use a fresh artifacts/forest-dialogue output directory');
await verifyForestCandidate();delete process.env.NPC_LLM_API_KEY;
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const directory=path.join(out,'world'),question='工具现在还有多少耐久？',reply='眼下工具耐久是六十。';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={schemaVersion:1,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),
 platform:process.platform,externalModelCalls:0,controlledCalls:0,checks:[],verdict:'FAIL',physicalScreenReaderTested:false};
const sourceFiles=['scripts/verify-forest-dialogue-keyboard.mjs','scripts/demo-browser-client.mjs','demo-runtime-prototype.mjs','demo-runtime.html','demo-playable-goals.mjs','demo-npc-dialogue.mjs'];
report.sourceSha256=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,sha(await fs.readFile(f))])));
const writes=[],errors=[];
let service,browser;
const model=createServer(async(req,res)=>{
 try{
  assert.equal(req.method,'POST');assert.equal(req.url,'/chat/completions');
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=JSON.parse(Buffer.concat(chunks));assert.equal(body.model,'controlled-keyboard');
  assert.equal(JSON.parse(body.messages.at(-1).content).playerUtterance,question);
  assert.ok(++report.controlledCalls<=3,'Unexpected extra generation');
  const content=report.controlledCalls===1?'invalid JSON':JSON.stringify({reply,memoryRefs:[],proposal:null});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]}));
 }catch(error){report.providerError=error.message;res.writeHead(500);res.end();}
});
const read=expression=>browser.read(expression);
const state=async()=>{const r=await fetch(service.url+'/api/runtime/demo-state');assert.equal(r.status,200);return r.json();};
const files=async()=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,sha(await fs.readFile(path.join(directory,f)))])));
const enabled=selector=>read(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});return !!n&&!n.disabled&&!n.hidden&&n.getClientRects().length>0;})()`);
const focused=selector=>read(`document.activeElement?.matches(${JSON.stringify(selector)})`);
const check=(name,actual,expected=true)=>report.checks.push({name,actual,expected,pass:actual===expected});
async function wait(check,label){for(let n=0;n<400;n++){assert.equal(report.providerError,undefined);assert.deepEqual(errors,[]);if(await check())return;await delay(50);}throw Error(label+' timed out');}
async function key(key,modifiers=0){const code={Tab:9,Enter:13,Escape:27}[key];for(const type of ['keyDown','keyUp'])await browser.call('Input.dispatchKeyEvent',{type,key,code:key,modifiers,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,...(key==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});}
async function tabTo(selector){await wait(()=>enabled(selector),selector+' available');for(let n=0;n<180;n++){if(await focused(selector))return;await key('Tab');}throw Error('Tab cannot reach '+selector);}
async function activate(selector){await tabTo(selector);await key('Enter');}
const hunter='#scenePeople button[data-actor-id="actor-2"]';
async function openHunter(){await activate(hunter);await wait(()=>read('!document.querySelector("#personCard").hidden'),'hunter open');}
async function enterQuestion(){await tabTo('#npcDialogueText');await browser.call('Input.insertText',{text:question});assert.equal(await read('document.querySelector("#npcDialogueText").value'),question);}
async function escapeAndRecover(name){
 await key('Escape');const closed=await read('document.querySelector("#personCard").hidden');check(name,closed);
 if(!closed)await activate('#closePerson'); // Continue collecting baseline failures using only keyboard input.
 check(name+'-returns-to-entry',await focused(hunter));
}

try{
 model.listen(0,'127.0.0.1');await once(model,'listening');
 service=await startRuntimeServer({directory,profile:'campaign-forest-village',seed:42,port:0,writable:true,continuousMarch:true,
  npcLanguage:{enabled:true,baseURL:'http://127.0.0.1:'+model.address().port,model:'controlled-keyboard',apiKey:''}});
 browser=await openDemoBrowser({directory:path.join(out,'browser'),url:service.url+'/demo-runtime.html',onEvent(e){
  if(e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error')errors.push(e.params);
  if(e.method==='Network.requestWillBeSent'&&e.params.request.method==='POST')writes.push({route:new URL(e.params.request.url).pathname,body:e.params.request.postData});
 }});
 report.browser=(await browser.call('Browser.getVersion')).product;
 await wait(()=>read('document.body?.dataset.worldConnected==="true"'),'world connection');
 const initial=await state(),initialFiles=await files();
 await activate('#tabSceneBtn');await openHunter();
 check('scene-entry-focuses-person-heading',await focused('#personName'));
 await enterQuestion();await escapeAndRecover('escape-from-textarea-closes-card');
 assert.deepEqual(await files(),initialFiles);
 await openHunter();await enterQuestion();await activate('#npcDialogueGenerate');
 await wait(()=>read('/回复格式或记忆引用不正确/.test(document.querySelector("#npcDialogueStatus").textContent)'),'controlled rejection');
 check('generation-error-retains-focus-at-status',await focused('#npcDialogueStatus'));
 assert.equal(await enabled('#npcDialogueCommit'),false);assert.deepEqual(await files(),initialFiles);
 await activate('#npcDialogueGenerate');await wait(()=>enabled('#npcDialogueCommit'),'valid preview');
 check('preview-retains-focus-at-status',await focused('#npcDialogueStatus'));
 const tree=await browser.call('Accessibility.getFullAXTree');
 const textbox=tree.nodes.find(n=>!n.ignored&&n.role?.value==='textbox'&&n.name?.value==='与猎人自然交谈');
 const commit=tree.nodes.find(n=>!n.ignored&&n.role?.value==='button'&&n.name?.value==='确认交谈并保存');
 const status=tree.nodes.find(n=>!n.ignored&&n.role?.value==='status'&&n.properties?.some(p=>p.name==='live'&&p.value.value==='polite'));
 check('dialogue-textbox-has-accessible-name',!!textbox);check('status-has-polite-live-semantics',!!status);
 check('confirm-describes-unsaved-preview',!!commit?.description?.value?.includes(reply));
 await tabTo('#npcDialogueCommit');await escapeAndRecover('escape-from-preview-button-closes-card');
 assert.deepEqual(await files(),initialFiles);assert.equal(writes.filter(w=>w.route==='/api/runtime/commands').length,0);
 await openHunter();await enterQuestion();await activate('#npcDialogueGenerate');await wait(()=>enabled('#npcDialogueCommit'),'new preview');
 await activate('#npcDialogueCommit');await wait(async()=>(await state()).snapshot.revision===initial.snapshot.revision+1,'speech saved');
 await wait(()=>read('/交谈已保存/.test(document.querySelector("#npcDialogueStatus").textContent)'),'saved status');
 check('save-retains-focus-at-status',await focused('#npcDialogueStatus'));
 await activate('#closePerson');check('close-button-returns-to-entry-after-state-refresh',await focused(hunter));
 const final=await state();assert.equal(final.map.tick,initial.map.tick);assert.equal(final.map.social.asset.condition,60);
 const saved=await loadServiceCommit(path.join(directory,`service-commit-r${final.snapshot.revision}.json`));
 assert.deepEqual(saved.commands.map(c=>c.dto.type),['PlayerDialogue']);assert.equal(report.controlledCalls,3);
 assert.equal(writes.filter(w=>w.route==='/api/runtime/commands').length,1);assert.deepEqual(errors,[]);
 report.final={savedSpeechCount:1,tick:final.map.tick,toolCondition:final.map.social.asset.condition,discardedPreviewPreservedSave:true};
 report.verdict=report.checks.every(c=>c.pass)?'PASS':'FAIL';
}catch(error){report.error={code:error.code??null,message:error.message};}
finally{
 const cleanup=await Promise.allSettled([browser?.close(),service?.close(),model.listening?new Promise((resolve,reject)=>model.close(e=>e?reject(e):resolve())):null]);
 report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(f=>f.endsWith('.lock'));
 if(cleanup.some(r=>r.status==='rejected')||report.remainingLocks.length){report.cleanupFailed=true;report.verdict='FAIL';}
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));if(report.verdict!=='PASS')process.exitCode=1;
}
