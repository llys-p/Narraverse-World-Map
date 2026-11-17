// One explicit browser generation in an isolated forest fixture. The browser
// uses real input and application routes; the controlled mode supplies one reply.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {npcLanguageConfig} from '../runtime/service/npc-language-provider.mjs';
import {loadServiceCommit} from '../runtime/service/service-commit.mjs';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';
import {openDemoBrowser} from './demo-browser-client.mjs';

const [mode,arg,flag,...extra]=process.argv.slice(2),live=mode==='live';
assert.ok(['live','controlled-test'].includes(mode)&&arg&&!extra.length&&(live?flag==='--allow-one-model-call':flag===undefined),
 'Usage: node scripts/verify-forest-dialogue-browser.mjs controlled-test|live artifacts/forest-dialogue/NEW [--allow-one-model-call]');
const out=path.resolve(arg);
assert.ok(out.startsWith(path.resolve('artifacts/forest-dialogue')+path.sep),'Use a fresh synthetic artifacts directory');
const candidate=await verifyForestCandidate(),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile('docs/runtime/forest-playtest-candidate.json','utf8'));
const source={baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),gameSha256:manifest.gameSha256,scriptSha256:{}};
for(const file of ['scripts/verify-forest-dialogue-browser.mjs','scripts/demo-browser-client.mjs','scripts/forest-playtest-candidate.mjs'])source.scriptSha256[file]=hash(await fs.readFile(file));
assert.ok(!live||!source.workingTreeDirty,'Live smoke needs a clean source checkout');
const config=live?npcLanguageConfig():{enabled:true,baseURL:'http://127.0.0.1:1',model:'controlled-browser',apiKey:''};
// Pass config in memory; never inherit the credential in Chrome or the worker.
delete process.env.NPC_LLM_API_KEY;
if(live){assert.equal(config.enabled,true);assert.equal(config.baseURL,'https://api.deepseek.com');assert.equal(config.model,'deepseek-flash');assert.equal(config.thinking??'disabled','disabled');assert.ok(config.apiKey);}
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const directory=path.join(out,'world'),getState=async()=>{const r=await nativeFetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);return r.json();};
const five=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
const files=async()=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,hash(await fs.readFile(path.join(directory,f)))])));
const objective=async g=>{const {bundle}=await loadServiceCommit(path.join(directory,`service-commit-r${g.snapshot.revision}.json`)),w=bundle.snapshot.world;
 return {tick:bundle.snapshot.tick,social:w.mapModel.socialModel,play:w.mapModel.playModel,forest:w.mapModel.forestModel,actors:w.actorModel.actors,agents:w.societyModel.agents};};
const text='我现在要帮你修理这个工具。',action={type:'PlayerInteract',payload:{targetId:'actor-2',action:'help'}};
const report={schemaVersion:1,candidate:candidate.id,source,mode,externalModelCalls:0,providerRequests:0,providerHttpStatus:null,
 humanReview:live?'pending':'not-evaluated',text,reply:null,steps:[],browserVersion:null,browserPostRoutes:[],verdict:'FAIL',remainingLocks:[]};
let server,browser;const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)!==config.baseURL+'/chat/completions')return nativeFetch(url,options);
 assert.equal(report.providerRequests,0,'Browser smoke allows exactly one generation');report.providerRequests++;
 if(live)report.externalModelCalls++;
 const response=live?await nativeFetch(url,options):Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'好，等你动手修过再看。',memoryRefs:[],proposal:action})}}]});
 report.providerHttpStatus=response.status;return response;
};
async function wait(read,label){
 const end=performance.now()+45000;
 while(performance.now()<end){const found=await read();if(found)return found;await delay(75);}
 const status=await browser?.read('document.querySelector("#npcDialogueStatus")?.textContent').catch(()=>null);
 throw Error(label+' timed out'+(status?': '+status:''));
}
const has=(selector,test)=>browser.read(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});return !!n&&(${test});})()`);
const enabled=selector=>has(selector,'!n.disabled&&!n.hidden&&n.getClientRects().length>0');
const history=()=>browser.read('document.querySelector("#npcDialogueHistory").textContent');
async function open(name){
 browser=await openDemoBrowser({directory:path.join(out,name),url:server.url+'/demo-runtime.html',onEvent(event){
  if(event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST')report.browserPostRoutes.push(new URL(event.params.request.url).pathname);
 }});
 await wait(()=>browser.read('document.body?.dataset.worldConnected==="true"'),'world connection');
 await browser.click('#tabSceneBtn');const hunter='#scenePeople button[data-actor-id="actor-2"]';
 await wait(()=>enabled(hunter),'hunter');await browser.click(hunter);await wait(()=>enabled('#npcDialogueText'),'hunter dialogue');
}
async function close(){if(browser){await browser.close();browser=null;}if(server){await server.close();server=null;}}
try{
 server=await startRuntimeServer({directory,profile:'campaign-forest-village',seed:42,port:0,writable:true,continuousMarch:true,npcLanguage:config});
 await open('browser');report.browserVersion=(await browser.call('Browser.getVersion')).product;
 const before=await getState(),originalFiles=await files(),beforeFacts=await objective(before),condition=before.map.social.asset.condition;
 assert.equal(before.map.negotiation.canTalk,true);assert.ok(condition<100);
 await browser.click('#npcDialogueText');await browser.call('Input.insertText',{text});
 await wait(()=>enabled('#npcDialogueGenerate'),'generate control');await browser.click('#npcDialogueGenerate');
 await wait(()=>enabled('#npcDialogueCommit'),'generated preview');
 report.reply=await browser.read('document.querySelector("#npcDialoguePreview").textContent');assert.ok(report.reply);
 assert.equal(await enabled('#npcDialogueAct'),false);assert.deepEqual(five(await getState()),five(before));assert.deepEqual(await files(),originalFiles);
 report.steps.push('preview-read-only');
 await browser.click('#npcDialogueCommit');await wait(()=>enabled('#npcDialogueAct'),'separate action confirmation');
 const said=await getState();assert.equal(said.snapshot.revision,before.snapshot.revision+1);assert.deepEqual(await objective(said),beforeFacts);
 assert.equal(said.map.negotiation.lastTurn.reply,report.reply);assert.ok((await history()).includes(report.reply));report.steps.push('speech-only');
 await browser.click('#npcDialogueAct');
 const final=await wait(async()=>{const g=await getState();return g.snapshot.revision>said.snapshot.revision?g:null;},'repair commit');
 assert.equal(final.snapshot.revision,said.snapshot.revision+1);assert.equal(final.map.social.asset.condition,condition+20);
 assert.equal(final.map.negotiation.lastTurn.reply,report.reply);report.condition={before:condition,after:final.map.social.asset.condition};
 report.steps.push('separately-confirmed-repair');
 const saved=await files();await close();
 server=await startRuntimeServer({directory,port:0,writable:true,continuousMarch:true,npcLanguage:config});await open('reopen-browser');
 assert.ok((await history()).includes(report.reply));assert.deepEqual(five(await getState()),five(final));assert.deepEqual(await files(),saved);
 report.steps.push('same-history-after-reopen');
 assert.equal(report.providerRequests,1);
 assert.deepEqual(report.browserPostRoutes,['/api/runtime/demo-npc-compose','/api/runtime/commands','/api/runtime/commands']);
 report.verdict='PASS';
}catch(error){report.error={code:error.code??null,message:config.apiKey?error.message.split(config.apiKey).join('[已隐藏]'):error.message};}
finally{
 try{await close();}catch(error){report.cleanupError=error.code??'close-failed';report.verdict='FAIL';}
 globalThis.fetch=nativeFetch;report.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(f=>f.endsWith('.lock'));
 if(report.remainingLocks.length)report.verdict='FAIL';
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({verdict:report.verdict,mode,steps:report.steps,externalModelCalls:report.externalModelCalls,error:report.error}));
 if(report.verdict!=='PASS')process.exitCode=1;
}
