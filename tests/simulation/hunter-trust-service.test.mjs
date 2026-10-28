import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {createPlayableGoals,trustQuestGuidance} from '../../demo-playable-goals.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=async d=>Object.fromEntries(await Promise.all((await fs.readdir(d)).filter(x=>x.endsWith('.json')).sort().map(async n=>[n,sha(await fs.readFile(path.join(d,n)))])));
test('new journey runs through real worker HTTP, reopens a borrowed tool, completes the side quest, and retries without a second reward',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'trust-journey-'));let server,streamAbort,streamPump,streamFailure;
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document'),nodes=new Map(),element=()=>({textContent:'',hidden:false,disabled:false,dataset:{},children:[],handlers:{},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},addEventListener(k,fn){this.handlers[k]=fn;},click(){assert.equal(this.disabled,false);this.handlers.click?.();}});
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element};
 t.after(async()=>{streamAbort?.abort();await streamPump;if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});if(prior)Object.defineProperty(globalThis,'document',prior);else delete globalThis.document;});
 const options={directory,port:0,writable:true,continuousMarch:true};server=await startRuntimeServer({...options,profile:'campaign-trust-village',seed:42});
 const read=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const g=await r.json();assert.ok(coherent(g));return g;};
 let g=await read(),n=0,pending;const action=async(type,payload={})=>{
  const dto={version:5,commandId:'trust-http-'+(++n),expectedRevision:g.snapshot.revision,type,payload};
  const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});assert.equal(r.status,200,type);const receipt=await r.json();assert.equal(receipt.outcome,'succeeded',type+' '+JSON.stringify(receipt.result));g=await read();return {dto,receipt};
 };
 const quest=async(id,actionName)=>action('PlayerQuest',{questId:id,action:actionName});
 const panel=createPlayableGoals({submit:(...a)=>{pending=action(...a);},approach(){throw Error('unexpected movement');},openPerson(){}});
 const clickQuest=async(id,name)=>{panel.paint(g,true);const row=nodes.get('playableQuestList').children.find(n=>n.dataset.quest===id),button=row.children.find(n=>n.dataset.questAction===name);assert.ok(button);button.click();return pending;};
 const social=async(actionName)=>action('PlayerInteract',{targetId:'actor-2',action:actionName});
 await clickQuest('livelihood','accept');await action('PlayerWork');await action('PlayerBuy',{product:'food',quantity:1});await quest('livelihood','claim');
 await quest('hunter-aid','accept');await social('help');await action('PlayerGiftFood',{recipientId:'actor-2'});await quest('hunter-aid','claim');
 assert.equal(g.map.playable.quests[4].status,'available');assert.equal(g.map.playable.quests[3].status,'locked');await clickQuest('hunter-trust','accept');await quest('forest-route','accept');
 const offer=(await action('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:20,loanTicks:36}})).receipt.result.agreement;
 await action('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'accept'});await social('help');await action('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'claim'});
 const loan=structuredClone(g);assert.deepEqual(g.map.playable.quests[4].progress,[1,0,0]);await server.close();server=await startRuntimeServer(options);g=await read();
 for(const k of ['snapshot','map','player','encounter','scene'])assert.deepEqual(g[k],loan[k]);
 streamAbort=new AbortController();const stream=await fetch(server.url+'/api/runtime/demo-events',{signal:streamAbort.signal});assert.equal(stream.status,200);
 // Keep consuming the SSE body, as the browser does; do not leave an unread response for GC/backpressure.
 streamPump=(async()=>{try{for await(const chunk of stream.body){assert.ok(chunk.length);}}catch(error){if(!streamAbort.signal.aborted)streamFailure=error;}})();
 const order=async(type,payload)=>{const r=await fetch(server.url+'/api/runtime/demo-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiVersion:1,requestId:'trust-order-'+(++n),type,payload})});assert.equal(r.status,200);assert.equal((await r.json()).receipt.outcome,'succeeded');g=await read();};
 const march=async target=>{await order('MarchSet',target);let count=0;while(g.map.order?.status!=='arrived'){assert.equal(streamFailure,undefined);assert.ok(count++<300,'route did not arrive: '+JSON.stringify({tick:g.map.tick,order:g.map.order,runner:g.runner}));assert.ok(g.runner.active||g.map.order?.status==='paused','runner stopped: '+JSON.stringify({tick:g.map.tick,order:g.map.order,runner:g.runner}));await new Promise(resolve=>setTimeout(resolve,200));g=await read();if(g.map.order?.status==='paused'&&!g.runner.active)await order('MarchResume',{});}};
 await march({x:16,y:7});assert.deepEqual(g.map.playable.quests[4].progress,[1,1,0]);assert.equal(g.map.actors.some(a=>a.actorId==='actor-2'),false);panel.paint(g,true);
 assert.equal(nodes.get('playableQuestList').children.find(n=>n.dataset.quest==='hunter-trust').children.some(n=>n.textContent==='查看猎人'),false);
 await march({x:4,y:7});await social('return');assert.equal(g.map.playable.quests[4].status,'ready');assert.equal(g.map.negotiation.agreement.status,'fulfilled');await quest('forest-route','claim');const last=await clickQuest('hunter-trust','claim');
 assert.equal(g.map.playable.chapterComplete,true);assert.equal(g.map.playable.rank,4);assert.equal(g.map.playable.quests[3].status,'available');assert.match(trustQuestGuidance(g,g.map.playable.quests[4]),/守约已经保存/);
 const assets={};for(const file of ['demo-runtime.html','demo-runtime-prototype.mjs','demo-playable-goals.mjs','runtime-playable-contract.mjs']){const r=await fetch(server.url+'/'+file);assert.equal(r.status,200);const data=Buffer.from(await r.arrayBuffer());assert.deepEqual(data,await fs.readFile(new URL('../../'+file,import.meta.url)));assets[file]=sha(data);}
 const before=await files(directory),saved=structuredClone(g);streamAbort.abort();await streamPump;await server.close();server=await startRuntimeServer(options);g=await read();for(const k of ['snapshot','map','player','encounter','scene'])assert.deepEqual(g[k],saved[k]);
 const retry=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(last.dto)});assert.equal(retry.status,200);assert.deepEqual(await retry.json(),last.receipt);assert.deepEqual(await files(directory),before);
 console.log(JSON.stringify({measurement:'hunter-trust-http',tick:g.map.tick,rank:g.map.playable.rank,chapterComplete:g.map.playable.chapterComplete,quests:g.map.playable.quests.map(q=>({id:q.id,status:q.status})),loanDueTick:g.map.playable.quests[4].loanDueTick,explicitRequests:n,assets,reopenedBorrowedLoan:true,reopenedComplete:true,retryFilesUnchanged:true,externalModelCalls:0,browser:'DOM callbacks only; real HTTP, worker and saves; no browser rendering'}));
});

test('actual overdue service events remain durable and re-openable in the new profile',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'trust-overdue-'));let server;const options={directory,port:0,writable:true,continuousMarch:true};
 t.after(async()=>{if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});});
 server=await startRuntimeServer({...options,profile:'campaign-trust-village',seed:42});let n=0;
 const read=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const g=await r.json();assert.ok(coherent(g));return g;};let g=await read();
 const act=async(type,payload={})=>{const dto={version:5,commandId:'overdue-http-'+(++n),expectedRevision:g.snapshot.revision,type,payload},r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});assert.equal(r.status,200);const receipt=await r.json();assert.equal(receipt.outcome,'succeeded');g=await read();return receipt;};
 const offer=(await act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:40,loanTicks:36}})).result.agreement;
 await act('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'accept'});for(let i=0;i<2;i++)await act('PlayerInteract',{targetId:'actor-2',action:'help'});await act('PlayerAgreement',{targetId:'actor-2',agreementId:offer.id,action:'claim'});await act('AdvanceTime',{ticks:37});assert.equal(g.map.negotiation.agreement.status,'breached');
 const prior=structuredClone(g);await server.close();server=await startRuntimeServer(options);g=await read();for(const k of ['snapshot','map','player','encounter','scene'])assert.deepEqual(g[k],prior[k]);
 await act('PlayerInteract',{targetId:'actor-2',action:'return'});assert.equal(g.map.negotiation.agreement.status,'returned-late');
 console.log(JSON.stringify({measurement:'hunter-trust-overdue-http',reopened:true,agreement:g.map.negotiation.agreement.status,externalModelCalls:0}));
});
