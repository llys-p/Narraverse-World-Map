import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {createDemoClient,coherent} from '../../demo-runtime-bridge.mjs';
import {createSocialTextComposer} from '../../demo-social-composer.mjs';
import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';

const hunter='actor-2',projections=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
async function hashes(directory){const names=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort();
 return Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(directory,n))).digest('hex')])));}
function browser(t){
 const saved=['fetch','EventSource','sessionStorage','document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 t.after(()=>{for(const [k,d] of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 const stored=new Map();let source;
 globalThis.sessionStorage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 globalThis.document={hidden:false,addEventListener(){}};globalThis.window={addEventListener(){}};
 globalThis.EventSource=class {constructor(){source=this;}close(){}};
 return {stored,connect:g=>source.onmessage({data:JSON.stringify(g)}),disconnect:()=>source.onerror()};
}

test('text consumer performs real tool interactions, keeps claims out of memory and recovers one lost response across worker reopen',async t=>{
 const nativeFetch=globalThis.fetch,env=browser(t),directory=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-npc3-'));
 let server,client,composer,group,loseNext=false,lostReceipt;const posts=[],receipts=[];
 t.after(async()=>{if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});});
 const options={directory,port:0,writable:true,continuousMarch:true};
 server=await startRuntimeServer({...options,profile:'campaign-social-village',seed:42});
 const read=async()=>{const response=await nativeFetch(server.url+'/api/runtime/demo-state');assert.equal(response.status,200);const g=await response.json();assert.equal(coherent(g),true);return g;};
 globalThis.fetch=async(url,options={})=>{
  const response=await nativeFetch(server.url+url,options);
  if(url!=='/api/runtime/commands')return response;
  posts.push(options.body);assert.equal(response.status,200);
  if(loseNext){loseNext=false;lostReceipt=await response.json();return Response.json({apiVersion:1,error:{code:'SAVE_FAILED',message:'injected after real durable success'}},{status:503});}
  return response;
 };
 const open=async()=>{
  composer=createSocialTextComposer();client=createDemoClient({onState:g=>{group=g;composer.observe(g,hunter);},onStatus(){},
   onReceipt:(r,dto,g)=>{composer.confirmed(r,dto,g);receipts.push(r);}});
  await client.start();env.connect(await read());
 };
 const writable=()=>{const s=client.state();return s.connected&&!s.busy&&!s.pending&&!s.blocked&&group.capabilities.writes&&group.map.budget.remainingCommands>0;};
 const send=async text=>{composer.edit(text,group,hunter);return client.submit('PlayerInteract',composer.command(group,writable(),hunter));};
 await open();const before=projections(group),originalHashes=await hashes(directory);
 for(const file of ['demo-runtime.html','demo-runtime-prototype.mjs','demo-social-language.mjs','demo-social-composer.mjs']){
  const response=await nativeFetch(server.url+'/'+file);assert.equal(response.status,200);const source=await response.text();assert.ok(source.length);
  if(file==='demo-runtime.html')for(const id of ['socialTextForm','socialText','socialTextStatus','socialTextChoices','socialTextReview','socialTextExecute'])assert.ok(source.includes(`id="${id}"`));
 }
 for(const text of ['我不会抢你的工具','他说要砸坏你的工具','我已经帮你修好了工具','帮你修工具，然后送我一把剑']){
  composer.edit(text,group,hunter);assert.equal(composer.view(group,writable(),hunter).canSubmit,false);assert.throws(()=>composer.command(group,writable(),hunter));
 }
 composer.edit('我要拿走工具包',group,hunter);assert.equal(composer.view(group,writable(),hunter).status,'clarify');composer.choose(0,group,hunter);
 assert.equal(composer.command(group,writable(),hunter).action,'ask-help');
 assert.equal(posts.length,0);assert.deepEqual(projections(await read()),before);assert.deepEqual(await hashes(directory),originalHashes);
 env.disconnect();assert.equal(composer.view(group,writable(),hunter).canSubmit,false);await assert.rejects(client.submit('PlayerInteract',{targetId:hunter,action:'ask-help'}));
 env.connect(await read());
 const query=await send('你还记得我之前帮过你吗');assert.deepEqual(query.result.memoryRefs,[]);
 assert.equal(group.map.social.asset.condition,60,'a question about help must not repair the tool');
 await send('我帮你修一下工具包');await send('帮你修工具');
 const loan=await send('工具借我一天吧');assert.equal(loan.result.effect,'lent');assert.equal(group.map.social.asset.holderId,'actor-4');
 composer.edit('把它还给你',group,hunter);assert.equal(composer.view(group,writable(),hunter).status,'ready');
 const returned=await client.submit('PlayerInteract',composer.command(group,writable(),hunter));assert.equal(returned.result.effect,'returned');
 loseNext=true;await assert.rejects(send('我要砸坏工具包'),/SAVE_FAILED/);
 assert.equal(client.state().pending,true);assert.equal(client.state().canRetry,true);assert.equal(receipts.some(r=>r.commandId===lostReceipt.commandId),false);
 composer.edit('帮你修工具',group,hunter);assert.equal(composer.view(group,writable(),hunter).canSubmit,false);
 await assert.rejects(client.submit('PlayerInteract',{targetId:hunter,action:'help'}));
 const durable=await read(),durableHashes=await hashes(directory),originalBody=posts.at(-1);
 assert.equal(durable.map.social.asset.condition,60);assert.equal(lostReceipt.result.effect,'smashed');
 await server.close();server=null;assert.equal((await fs.readdir(directory)).some(n=>n.endsWith('.lock')),false);
 server=await startRuntimeServer(options);await open();assert.equal(client.state().canRetry,true);
 composer.edit('帮你修一下它',group,hunter);assert.equal(composer.view(group,writable(),hunter).status,'clarify','refresh clears unconfirmed short references');
 const retry=await client.retry();assert.deepEqual(retry,lostReceipt);assert.equal(posts.at(-1),originalBody);
 assert.deepEqual(projections(await read()),projections(durable));assert.deepEqual(await hashes(directory),durableHashes);
 assert.equal(client.state().pending,false);assert.equal(env.stored.size,0);
 await send('帮你修一下它');assert.equal(group.map.social.asset.condition,80);
 const recall=await send('我们之前发生过什么');assert.deepEqual(recall.result.memoryRefs,[lostReceipt.result.sourceEventSeq]);assert.match(recall.result.speech,/砸坏/);
 const latest=projections(group),latestHashes=await hashes(directory),lastRevision=group.snapshot.revision;
 await server.close();server=null;server=await startRuntimeServer(options);assert.deepEqual(projections(await read()),latest);assert.deepEqual(await hashes(directory),latestHashes);
 await server.close();server=null;
 const commit=await loadServiceCommit(path.join(directory,`service-commit-r${lastRevision}.json`));
 assert.equal(commit.commands.length,8);assert.equal(commit.commands.filter(c=>c.dto?.commandId===lostReceipt.commandId||c.command?.commandId===lostReceipt.commandId).length,1);
 const memories=commit.bundle.snapshot.world.mapModel.socialModel.actors[1].memories;
 assert.equal(memories.filter(m=>m.kind==='smash').length,1);assert.equal(memories.filter(m=>m.kind==='help').length,3);
 assert.equal(memories.filter(m=>m.kind==='ask-help').length,1);assert.equal(receipts.length,8);
});
