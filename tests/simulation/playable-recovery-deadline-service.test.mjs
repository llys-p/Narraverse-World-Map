import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {defaultPlayableVillageConfig,createPlayableCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedServiceCommit,saveServiceCommit} from '../../runtime/service/service-commit.mjs';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {coherent} from '../../demo-runtime-bridge.mjs';
import {playableNextStep} from '../../demo-playable-goals.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const hashes=async dir=>Object.fromEntries(await Promise.all((await fs.readdir(dir)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,hash(await fs.readFile(path.join(dir,f)))])));

test('real worker/HTTP reaches the deadline, fails on the following tick, accepts a fresh attempt and survives recovery',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'quest-expiry-'));let server;
 t.after(async()=>{if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});});
 const config=defaultPlayableVillageConfig();config.memory.society.player.initialFood=100;
 const {bundle}=createPlayableCampaignVillage(42,'quest-expiry-http',config);
 await saveServiceCommit(createAuditedServiceCommit({serviceFormatVersion:11,anchor:bundle,commands:[],bundle}),directory);
 const options={directory,port:0,writable:true,continuousMarch:true};server=await startRuntimeServer(options);
 const read=async()=>{const r=await fetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);const g=await r.json();assert.ok(coherent(g));return g;};
 let g=await read(),n=0;const act=async(type,payload={})=>{
  const dto={version:5,commandId:'expiry-http-'+(++n),expectedRevision:g.snapshot.revision,type,payload};
  const response=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.outcome,'succeeded',type);g=await read();return {dto,receipt};
 };
 await act('PlayerQuest',{questId:'livelihood',action:'accept'});await act('PlayerWork');await act('PlayerBuy',{product:'food',quantity:1});
 assert.equal(g.map.playable.quests[0].status,'ready');assert.equal(g.map.tick,37);
 await act('AdvanceTime',{ticks:1440});await act('AdvanceTime',{ticks:539});assert.equal(g.map.tick,2016);assert.equal(g.map.self.alive,true);
 assert.equal(g.map.playable.quests[0].status,'ready');assert.equal(g.map.playable.quests[0].remainingTicks,0);assert.match(playableNextStep(g),/现在.*领取.*推进世界时间会使任务失败/);
 await act('AdvanceTime',{ticks:1});assert.equal(g.map.tick,2017);assert.equal(g.map.playable.quests[0].status,'failed');assert.match(playableNextStep(g),/未在期限内完成.*重新接取/);
 const restarted=await act('PlayerQuest',{questId:'livelihood',action:'accept'}),q=g.map.playable.quests[0];assert.equal(restarted.receipt.durationTicks,0);assert.equal(q.status,'active');assert.deepEqual(q.progress,[0,0]);assert.equal(q.deadlineTick,4033);
 const before=await hashes(directory),snapshot=structuredClone(g);await server.close();server=await startRuntimeServer(options);g=await read();for(const k of ['snapshot','map','player','encounter','scene'])assert.deepEqual(g[k],snapshot[k]);
 const retry=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(restarted.dto)});assert.equal(retry.status,200);assert.deepEqual(await retry.json(),restarted.receipt);assert.deepEqual(await hashes(directory),before);
 console.log(JSON.stringify({measurement:'quest-deadline-recovery',worldTick:g.map.tick,deadline:q.deadlineTick,progress:q.progress,files:before,externalModelCalls:0,scope:'Synthetic worker/HTTP deadline, reaccept, durable reopen and retry; no browser rendering'}));
});
