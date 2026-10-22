import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';
import {campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';

const projections=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
const hunterState=b=>({position:b.snapshot.world.mapModel.npcs[1],intent:b.snapshot.world.mapModel.hunterIntent,
  estate:b.snapshot.world.societyModel.agents[1],motivation:b.snapshot.world.motivationModel.actors.find(a=>a.actorId==='actor-2'),
  experience:b.snapshot.world.experienceModel.actors.find(a=>a.actorId==='actor-2'),
  memory:b.snapshot.world.memoryModel.observer.actors.find(a=>a.actorId==='actor-2')});
async function hashes(directory){const names=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort();
  return Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(directory,n))).digest('hex')])));}

test('HTTP worker saves a hunter mid-trip, reopens the same person, and continues while the player is away without duplicate pay',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-npc1-'));let server;
  t.after(async()=>{if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});});
  const options={directory,port:0,writable:true,continuousMarch:true};
  server=await startRuntimeServer({...options,profile:'campaign-npc-village',seed:42});
  const state=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const g=await r.json();assert.equal(coherent(g),true);return g;};
  const post=async dto=>{const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(dto)});
    const receipt=await r.json();assert.equal(r.status,200,JSON.stringify(receipt));return receipt;};
  let seq=0;
  const send=async(type,payload={})=>{const g=await state();return post({version:5,commandId:`npc-http-${++seq}`,expectedRevision:g.snapshot.revision,type,payload});};
  let group=await state();assert.equal(group.snapshot.tick,0);
  assert.ok(group.map.landmarks.some(p=>p.id==='village-food'&&p.name==='粮摊'));
  await send('AdvanceTime',{ticks:148});group=await state();
  const own=group.map.actors.find(a=>a.actorId==='actor-2');assert.deepEqual({x:own.x,y:own.y},{x:5,y:7});
  const midFile=path.join(directory,`service-commit-r${group.snapshot.revision}.json`);
  const mid=JSON.parse(await fs.readFile(midFile,'utf8')),savedHunter=hunterState(mid.bundle),savedViews=projections(group);
  assert.equal(savedHunter.estate.state.wallet,20);assert.equal(savedHunter.motivation.activePlan.stepIndex,1);
  assert.equal(savedHunter.intent.action,'BuyFood');const planId=savedHunter.motivation.activePlan.planId;
  const readOnlyHashes=await hashes(directory);await state();assert.deepEqual(await hashes(directory),readOnlyHashes);
  await server.close();server=null;server=await startRuntimeServer(options);
  assert.deepEqual(projections(await state()),savedViews);assert.deepEqual(await hashes(directory),readOnlyHashes);
  assert.deepEqual(hunterState(JSON.parse(await fs.readFile(midFile,'utf8')).bundle),savedHunter);
  const controller=new AbortController();t.after(()=>controller.abort());
  const stream=await fetch(server.url+'/api/runtime/demo-events',{signal:controller.signal}),reader=stream.body.getReader();await reader.read();
  const order=async(type,payload={})=>{
    const r=await fetch(server.url+'/api/runtime/demo-order',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({apiVersion:1,requestId:`npc-order-${++seq}`,type,payload})});
    assert.equal(r.status,200);assert.equal((await r.json()).receipt.outcome,'succeeded');
  };
  await order('MarchSet',{x:16,y:7});
  const deadline=Date.now()+60000;
  for(;;){
    group=await state();if(group.map.order.status==='arrived')break;
    assert.ok(Date.now()<deadline,'bounded server-owned march must complete');
    if(group.map.order.status==='paused')await order('MarchResume');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  controller.abort();try{await reader.cancel();}catch{}
  group=await state();assert.equal(group.map.self.location,'forest');
  assert.equal(group.map.actors.some(a=>a.actorId==='actor-2'),false,'offscreen hunter has no public position or private mind');
  const dto={version:5,commandId:'npc-http-finish',expectedRevision:group.snapshot.revision,type:'AdvanceTime',payload:{ticks:288-group.snapshot.tick}};
  const receipt=await post(dto);
  group=await state();const finalFile=path.join(directory,`service-commit-r${group.snapshot.revision}.json`);
  const final=JSON.parse(await fs.readFile(finalFile,'utf8'));
  let expected=createAuditedBundle(mid.bundle,{rulesVersion:mid.bundle.snapshot.rulesVersion,systems:campaignSystems()});
  for(const entry of final.commands.slice(mid.commands.length)){
    const next=deriveCampaignBundle(expected,entry.dto);assert.deepEqual(next.receipt,entry.receipt);expected=next.bundle;
  }
  assert.deepEqual(final.bundle,expected,'restored worker equals uninterrupted deterministic continuation');
  assert.equal(final.bundle.snapshot.world.societyModel.agents[1].state.wallet,10);
  assert.equal(final.bundle.snapshot.world.societyModel.agents[1].state.inventory.food,0);
  const hunter=final.bundle.snapshot.world.motivationModel.actors.find(a=>a.actorId==='actor-2');
  assert.equal(hunter.activePlan,null);assert.equal(hunter.lastDecision.planId,planId);assert.equal(hunter.lastDecision.choice,'BuyFood');
  const beforeRetry=await hashes(directory);assert.deepEqual(await post(dto),receipt);
  assert.deepEqual(await hashes(directory),beforeRetry);assert.deepEqual(projections(await state()),projections(group));
});
