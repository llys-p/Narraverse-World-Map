import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {validateCampaignReceipt} from '../../runtime-campaign-contract.mjs';
import {describeActionReceipt,socialInteractionActions} from '../../demo-runtime-interactions.mjs';
import {validateBundle} from '../../runtime/core/world-state.mjs';
import {campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';

const projections=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
async function hashes(directory){const names=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort();
 return Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(directory,n))).digest('hex')])));}

test('real HTTP worker persists social effects and memories, reopens identical views, and retries without a second effect',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-npc2-'));let server;
 t.after(async()=>{if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});});
 const options={directory,port:0,writable:true,continuousMarch:true};
 server=await startRuntimeServer({...options,profile:'campaign-social-village',seed:42});
 const state=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const g=await r.json();assert.equal(coherent(g),true);return g;};
 const post=async dto=>{const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(dto)});const receipt=await r.json();assert.equal(r.status,200,JSON.stringify(receipt));return receipt;};
 let seq=0;
 const send=async(action,topic)=>{const g=await state(),dto={version:5,commandId:`social-http-${++seq}`,expectedRevision:g.snapshot.revision,type:'PlayerInteract',payload:{targetId:'actor-2',action,...(topic?{topic}:{})}};
  const receipt=await post(dto);assert.equal(validateCampaignReceipt(receipt,dto,g.snapshot.tick),true);assert.ok(describeActionReceipt(receipt,dto));return {dto,receipt};};
 const before=await state();assert.equal(before.map.mapViewVersion,2);assert.equal(before.map.social.asset.condition,60);
 for(const file of ['demo-runtime.html','demo-runtime-prototype.mjs','demo-runtime-bridge.mjs','demo-runtime-interactions.mjs','runtime-campaign.mjs','runtime-campaign-contract.mjs','runtime-social-contract.mjs']){
  const r=await fetch(server.url+'/'+file);assert.equal(r.status,200,file);const source=await r.text();assert.ok(source.length>0);
  if(file==='demo-runtime.html')for(const key of ['talk','help','ask-help','return','apologize','steal','rob','smash','threaten'])assert.ok(source.includes(`id="social-${key}"`));
 }
 await send('help');await send('help');const loan=await send('ask-help');assert.equal(loan.receipt.result.effect,'lent');
 assert.equal((await state()).map.social.asset.holderId,'actor-4');await send('return');
 const damage=await send('smash');await send('help');const recall=await send('talk','past');assert.deepEqual(recall.receipt.result.memoryRefs,[damage.receipt.result.sourceEventSeq]);
 assert.match(recall.receipt.result.speech,/砸坏/);
 let group=await state();assert.equal(group.map.social.asset.condition,80);assert.equal(group.map.social.npc.stance,'wary');
 assert.equal(socialInteractionActions(group,true).help,true);
 const file=path.join(directory,`service-commit-r${group.snapshot.revision}.json`),saved=JSON.parse(await fs.readFile(file,'utf8'));
 validateBundle(saved.bundle,{rulesVersion:saved.bundle.snapshot.rulesVersion,systems:campaignSystems()});
 const hunter=saved.bundle.snapshot.world.mapModel.socialModel.actors[1];assert.equal(hunter.memories.filter(m=>m.kind==='ask-help').length,1);assert.ok(hunter.memories.some(m=>m.kind==='smash'));
 const savedHash=await hashes(directory),views=projections(group);await state();assert.deepEqual(await hashes(directory),savedHash);
 const forged=structuredClone(group);forged.map.social.npc.trust=100;assert.equal(coherent(forged),false);
 await server.close();server=null;server=await startRuntimeServer(options);
 assert.deepEqual(projections(await state()),views);assert.deepEqual(await hashes(directory),savedHash);
 assert.deepEqual(await post(loan.dto),loan.receipt);assert.deepEqual(await post(damage.dto),damage.receipt);assert.deepEqual(await post(recall.dto),recall.receipt);
 assert.deepEqual(await hashes(directory),savedHash);assert.deepEqual(projections(await state()),views);
 const newReply=await send('talk','relationship');assert.match(newReply.receipt.result.speech,/戒心/);
 group=await state();assert.equal(group.map.social.asset.condition,80);
});
