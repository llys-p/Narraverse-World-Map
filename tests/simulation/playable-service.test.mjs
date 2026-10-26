import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';import {coherent} from '../../demo-runtime-bridge.mjs';import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';
const hashes=async dir=>Object.fromEntries(await Promise.all((await fs.readdir(dir)).filter(n=>n.endsWith('.json')).sort().map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(dir,n))).digest('hex')])));
test('worker/HTTP quest progress is durable, read-only views stay coherent, and a retried command cannot duplicate a reward',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'playable-service-'));let server;t.after(async()=>{if(server)await server.close();await fs.rm(dir,{recursive:true,force:true});});
 const options={directory:dir,port:0,writable:true,continuousMarch:true};server=await startRuntimeServer({...options,profile:'campaign-playable-village',seed:42});
 const read=async()=>{const g=await(await fetch(server.url+'/api/runtime/demo-state')).json();assert.equal(coherent(g),true);return g;};let group=await read(),serial=0;
 const send=async(type,payload={})=>{const dto={version:5,commandId:'service-play-'+(++serial),expectedRevision:group.snapshot.revision,type,payload};const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)});assert.equal(r.status,200);const receipt=await r.json();group=await read();return {dto,receipt};};
 assert.equal(group.map.budget.remainingCommands,512);await send('PlayerQuest',{questId:'livelihood',action:'accept'});await send('PlayerWork');await send('PlayerBuy',{product:'food',quantity:1});const done=await send('PlayerQuest',{questId:'livelihood',action:'claim'});assert.equal(group.map.playable.rank,1);
 const before=await hashes(dir);await read();await read();assert.deepEqual(await hashes(dir),before);
 const saved=await loadServiceCommit(path.join(dir,`service-commit-r${group.snapshot.revision}.json`));assert.equal(saved.bundle.snapshot.fixtureVersion,'6');assert.equal(saved.bundle.snapshot.world.mapModel.playModel.quests[0].status,'completed');
 for(const marker of ['lifeHistory','agency','signature','knownCondition'])assert.equal(JSON.stringify(group.map.playable).includes('"'+marker+'"'),false);
 const snapshot=structuredClone(group);await server.close();server=await startRuntimeServer(options);group=await read();assert.deepEqual(group.map,snapshot.map);
 const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(done.dto)});assert.equal(r.status,200);assert.deepEqual(await r.json(),done.receipt);assert.deepEqual(await hashes(dir),before);
});
