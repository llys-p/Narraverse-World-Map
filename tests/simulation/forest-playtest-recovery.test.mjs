import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {createDemoClient,coherent} from '../../demo-runtime-bridge.mjs';
import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';
const nativeFetch=globalThis.fetch,keys=['snapshot','map','player','encounter','scene'];
const five=g=>Object.fromEntries(keys.map(k=>[k,g[k]]));
const files=async directory=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,createHash('sha256').update(await fs.readFile(path.join(directory,f))).digest('hex')])));
async function service(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'forest-closeout-')),options={directory,port:0,writable:true,continuousMarch:true};let server,g,n=0,stream=null;
 const read=async()=>{const r=await nativeFetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);g=await r.json();assert.ok(coherent(g));return g;};
 const disconnect=async()=>{if(stream){const old=stream;stream=null;old.abort.abort();await old.pump;}};
 const close=async()=>{await disconnect();if(server){await server.close();server=null;}};
 t.after(async()=>{await close();await fs.rm(directory,{recursive:true,force:true});});
 const open=async first=>{server=await startRuntimeServer({...options,...(first?{profile:'campaign-forest-village',seed:42}:{})});await read();assert.equal(g.capabilities.npcLanguage.enabled,false);};
 const connect=async()=>{if(stream)return;const abort=new AbortController(),response=await nativeFetch(server.url+'/api/runtime/demo-events',{signal:abort.signal});assert.equal(response.status,200);const pump=(async()=>{try{for await(const chunk of response.body)assert.ok(chunk.length);}catch(e){if(!abort.signal.aborted)throw e;}})();stream={abort,pump};};
 const act=async(type,payload={},expected='succeeded')=>{const order=type.startsWith('March'),dto=order?{apiVersion:1,requestId:'closeout-order-'+(++n),type,payload}:{version:5,commandId:'closeout-'+(++n),expectedRevision:g.snapshot.revision,type,payload};
  const r=await nativeFetch(server.url+(order?'/api/runtime/demo-order':'/api/runtime/commands'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});assert.equal(r.status,200,type);const body=await r.json(),receipt=order?body.receipt:body;assert.equal(receipt.outcome,expected,type+' '+JSON.stringify(receipt));await read();return {dto,receipt};};
 const until=async predicate=>{for(let i=0;i<600;i++){await read();if(predicate(g))return;await delay(60);}throw Error('Timed out waiting for current forest world');};
 const settle=async()=>{for(let i=0;i<600;i++){await read();if(g.map.order.status==='arrived')return;if(g.map.order.status==='paused'&&!g.runner.active)await act('MarchResume');await delay(60);}throw Error('March did not arrive');};
 const march=async target=>{await connect();await act('MarchSet',target);await settle();};
 const q=(questId,action,expected)=>act('PlayerQuest',{questId,action},expected),social=action=>act('PlayerInteract',{targetId:'actor-2',action});
 const prepare=async()=>{await q('livelihood','accept');await act('PlayerWork');await act('PlayerBuy',{product:'food',quantity:1});await q('livelihood','claim');await q('hunter-aid','accept');await social('help');await act('PlayerGiftFood',{recipientId:'actor-2'});await q('hunter-aid','claim');await q('hunter-trust','accept');await q('forest-route','accept');assert.equal((await social('ask-help')).receipt.result.effect,'lent');await march({x:16,y:7});};
 const reopen=async()=>{const saved=five(g),hashes=await files(directory);await close();await open();assert.deepEqual(five(g),saved);assert.deepEqual(await files(directory),hashes);};
 await open(true);return {directory,read,connect,disconnect,close,act,until,settle,march,q,social,prepare,reopen,get g(){return g;},get url(){return server.url;}};
}
function clientEnvironment(t){
 const saved=['fetch','EventSource','sessionStorage','document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]),stored=new Map();let source;
 globalThis.sessionStorage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 globalThis.document={hidden:false,addEventListener(){}};globalThis.window={addEventListener(){}};
 globalThis.EventSource=class{constructor(){source=this;}close(){}};
 t.after(()=>{for(const [k,v]of saved)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 return {stored,connect:g=>source.onmessage({data:JSON.stringify(g)})};
}
test('fixture8 lost harvest response survives page-client reload and worker reopen with exactly one wood and wear delta',async t=>{
 const s=await service(t);await s.prepare();const env=clientEnvironment(t),posts=[],delivered=[];let original;
 globalThis.fetch=async(url,options={})=>{
  const response=await nativeFetch(s.url+url,options);
  if(url==='/api/runtime/commands'&&JSON.parse(options.body).type==='PlayerForest'){
   posts.push(options.body);assert.equal(response.status,200);
   if(posts.length===1){original=await response.json();assert.equal(original.outcome,'succeeded');return Response.json({apiVersion:1,error:{code:'SAVE_FAILED',message:'Injected loss after durable success'}},{status:503});}
  }return response;
 };
 const make=()=>createDemoClient({onState(){},onStatus(){},onReceipt:r=>delivered.push(r)});let client=make();await client.start();env.connect(s.g);
 const before=structuredClone(s.g);await assert.rejects(client.submit('PlayerForest',{action:'collect'}),/SAVE_FAILED/);assert.equal(client.state().canRetry,true);
 await assert.rejects(client.submit('PlayerForest',{action:'collect'}),/当前无法提交/);await s.read();
 assert.equal(s.g.map.forest.state.harvested,before.map.forest.state.harvested+1);assert.equal(s.g.map.social.asset.condition,before.map.social.asset.condition-10);
 const saved=await files(s.directory);await s.reopen();client=make();await client.start();env.connect(s.g);assert.equal(client.state().canRetry,true);
 assert.deepEqual(await client.retry(),original);assert.deepEqual(posts,[posts[0],posts[0]]);assert.deepEqual(delivered,[original]);assert.equal(env.stored.size,0);
 await s.read();assert.deepEqual(await files(s.directory),saved);const final=s.g.snapshot.revision;await s.close();
 const commit=await loadServiceCommit(path.join(s.directory,`service-commit-r${final}.json`));assert.equal(commit.commands.filter(c=>c.dto.type==='PlayerForest'&&c.dto.payload.action==='collect').length,1);
 console.log(JSON.stringify({measurement:'forest-closeout-lost-response',fixture:8,identicalRetryBytes:true,blockedSecondIntent:true,reopenedWorker:true,harvestCommits:1,receiptDeliveries:delivered.length,filesPreserved:true,externalModelCalls:0,browserRendered:false}));
});
test('fixture8 actual stream loss stops a return journey; reopen and reconnect do not catch up until an explicit resume',async t=>{
 const s=await service(t);await s.prepare();await s.act('MarchSet',{x:4,y:7});await s.until(g=>g.map.self.x<16);assert.ok(s.g.map.self.x>4);
 await s.disconnect();await s.until(g=>!g.runner.active&&g.runner.viewers===0);const stopped=five(s.g),saved=await files(s.directory);
 await delay(1100);await s.read();assert.deepEqual(five(s.g),stopped);assert.deepEqual(await files(s.directory),saved);
 await s.reopen();assert.equal(s.g.runner.active,false);await s.connect();await s.read();const reconnected=five(s.g);await delay(650);await s.read();assert.deepEqual(five(s.g),reconnected);assert.equal(s.g.runner.active,false);
 await s.act('MarchResume');await s.settle();await s.social('return');await s.q('forest-route','claim');await s.q('hunter-trust','claim');assert.equal(s.g.map.playable.chapterComplete,true);assert.equal(s.g.map.playable.rank,4);await s.reopen();
 console.log(JSON.stringify({measurement:'forest-closeout-disconnect',fixture:8,actualSse:true,noOfflineTicks:true,noReconnectCatchup:true,explicitResume:true,returnedLoan:true,chapterComplete:true,reopenedCompletedWorld:true,externalModelCalls:0,browserRendered:false}));
});
test('fixture8 overdue failure and remembered breach survive worker reopen and real late handover without erasing history',async t=>{
 const s=await service(t);await s.prepare();await s.act('PlayerForest',{action:'collect'});const due=s.g.map.playable.quests[4].loanDueTick;
 await s.act('AdvanceTime',{ticks:due+1-s.g.map.tick});assert.equal(s.g.map.playable.quests[4].status,'failed');await s.reopen();assert.equal(s.g.map.playable.quests[4].status,'failed');
 await s.march({x:4,y:7});await s.social('return');await s.q('hunter-trust','claim','rejected');assert.equal(s.g.map.social.asset.holderId,'actor-2');assert.equal(s.g.map.social.asset.condition,70);await s.reopen();
 const final=s.g.snapshot.revision;await s.close();const commit=await loadServiceCommit(path.join(s.directory,`service-commit-r${final}.json`)),w=commit.bundle.snapshot.world,episodes=w.mapModel.memoryModel.actors[1].episodes;
 assert.equal(episodes.filter(e=>e.kind==='overdue').length,1);assert.equal(episodes.filter(e=>e.kind==='return').length,1);assert.equal(w.mapModel.playModel.quests[4].status,'failed');assert.ok(w.mapModel.socialModel.actors[1].grievance>0);
 console.log(JSON.stringify({measurement:'forest-closeout-overdue',fixture:8,reopenedOverdueLoan:true,lateReturn:true,overdueMemories:1,returnMemories:1,taskStillFailed:true,relationshipBreachPreserved:true,externalModelCalls:0,browserRendered:false}));
});
