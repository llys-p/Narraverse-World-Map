import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {createForestPanel} from '../../demo-forest.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=async d=>Object.fromEntries(await Promise.all((await fs.readdir(d)).filter(x=>x.endsWith('.json')).sort().map(async n=>[n,sha(await fs.readFile(path.join(d,n)))])));
test('real forest panel clicks navigate, rest without fuel and exit a reopened encounter; old abandoned loan stays explicitly unknown',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'forest-guidance-')),options={directory,port:0,writable:true,continuousMarch:true};
 let server,abort,pump,g,n=0,pending=null;const nodes=new Map(),previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(k,fn){this.handlers[k]=fn;},click(){this.handlers.click?.();}});return nodes.get(id);}};
 const disconnect=async()=>{abort?.abort();await pump;abort=null;pump=null;};
 t.after(async()=>{await disconnect();if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 const traces=[],panel=createForestPanel({submit(type,payload){traces.push({type,payload});pending=request(type,payload);}});
 const read=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);g=await r.json();assert.ok(coherent(g));panel.paint(g,true);return g;};
 async function request(type,payload={}){
  const marching=type.startsWith('March'),body=marching?{apiVersion:1,requestId:'guidance-order-'+(++n),type,payload}:{version:5,commandId:'guidance-'+(++n),expectedRevision:g.snapshot.revision,type,payload};
  const r=await fetch(server.url+(marching?'/api/runtime/demo-order':'/api/runtime/commands'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(r.status,200,type);const response=await r.json(),receipt=marching?response.receipt:response;assert.equal(receipt.outcome,'succeeded',type+' '+JSON.stringify(receipt));await read();return {body,receipt};
 }
 const connect=async()=>{abort=new AbortController();const response=await fetch(server.url+'/api/runtime/demo-events',{signal:abort.signal});assert.equal(response.status,200);const signal=abort.signal;pump=(async()=>{try{for await(const chunk of response.body)assert.ok(chunk.length);}catch(e){if(!signal.aborted)throw e;}})();};
 const settle=async()=>{let count=0;while(g.map.order.status!=='arrived'){assert.ok(++count<500,'route did not arrive');await new Promise(r=>setTimeout(r,80));await read();if(g.map.order.status==='paused'&&!g.runner.active)await request('MarchResume',{});}};
 const click=async action=>{pending=null;nodes.get('forest-'+action).click();assert.ok(pending,'expected explicit '+action);return await pending;};
 const q=(questId,action)=>request('PlayerQuest',{questId,action}),social=action=>request('PlayerInteract',{targetId:'actor-2',action});
 const reopen=async()=>{const old=structuredClone(g);await disconnect();await server.close();server=await startRuntimeServer(options);await read();for(const k of ['snapshot','map','player','encounter','scene'])assert.deepEqual(g[k],old[k]);};
 server=await startRuntimeServer({...options,profile:'campaign-forest-village',seed:42});await read();assert.equal(g.capabilities.npcLanguage.enabled,false);
 await q('livelihood','accept');await request('PlayerWork');await request('PlayerBuy',{product:'food',quantity:1});await q('livelihood','claim');await q('hunter-aid','accept');await social('help');await request('PlayerGiftFood',{recipientId:'actor-2'});await q('hunter-aid','claim');
 await q('hunter-trust','accept');await social('ask-help');const oldDeadline=g.map.playable.quests[4].loanDueTick;
 await q('hunter-trust','abandon');await social('return');const newLoan=await social('ask-help');assert.equal(newLoan.receipt.result.effect,'lent');assert.ok(g.map.tick+144>oldDeadline);
 await connect();await request('MarchSet',{x:14,y:7});await settle();assert.equal(g.map.forest.actions[0].reasonCode,'NOT_COLOCATED');assert.equal(nodes.get('forest-site').disabled,false);
 await click('site');assert.deepEqual(traces.at(-1),{type:'MarchSet',payload:{x:16,y:7}});await settle();
 assert.match(nodes.get('forestLoan').textContent,/旧委托已放弃.*当前借期无法/);assert.doesNotMatch(nodes.get('forestLoan').textContent,/借期剩余/);
 const saved=await files(directory),revision=g.snapshot.revision,count=n;
 for(let i=0;i<3;i++)panel.paint(g,false);for(const id of ['collect','rest','site','return','challenge'])nodes.get('forest-'+id).handlers.click();
 assert.equal(n,count);assert.deepEqual(await files(directory),saved);assert.equal((await read()).snapshot.revision,revision);
 const collected=await click('collect');assert.equal(g.map.forest.state.firewood,1);assert.equal(g.map.social.asset.condition,70);
 const afterCollect=await files(directory),retry=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(collected.body)});
 assert.equal(retry.status,200);assert.deepEqual(await retry.json(),collected.receipt);assert.deepEqual(await files(directory),afterCollect);
 const wood=structuredClone(g.map.forest.state),tick=g.map.tick;await click('rest');assert.equal(g.map.tick,tick+g.player.actions.restTicks);assert.deepEqual(g.map.forest.state,wood);
 await click('observe');await click('challenge');const encounterId=g.encounter.encounter.encounterId;await reopen();assert.equal(g.encounter.encounter.status,'active');assert.equal(nodes.get('forest-exit').disabled,false);
 const beforeExit=g.map.tick;await click('exit');assert.deepEqual(traces.at(-1),{type:'EncounterCancel',payload:{encounterId}});assert.equal(g.map.tick,beforeExit);assert.equal(g.encounter.encounter.reserved,false);
 await connect();await click('return');await settle();assert.equal(nodes.get('forestJourney').hidden,true);const writes=n;nodes.get('forest-collect').handlers.click();assert.equal(n,writes);await social('return');assert.equal(g.map.social.asset.condition,70);await reopen();
 const assets={};for(const file of ['demo-forest.mjs','demo-runtime.html','demo-runtime.css']){const response=await fetch(server.url+'/'+file);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,await fs.readFile(new URL('../../'+file,import.meta.url)));assets[file]=sha(bytes);}
 console.log(JSON.stringify({measurement:'forest-guidance-http',readOnlyPaintPreservedFiles:true,oldLoanNotPresentedAsCurrent:true,siteClick:true,restUsedNoFuel:true,reopenedActiveEncounter:true,explicitExit:true,returnClick:true,retryPreservedFiles:true,returnedToolCondition:70,panelRequests:traces.length,assets,externalModelCalls:0,renderedBrowser:false}));
});
