import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='artifacts/d4e5-controller-20261016',label=process.argv[2];
assert(/^[a-z0-9-]+$/.test(label));
const hash=x=>createHash('sha256').update(x).digest('hex');
const routes={snapshot:'snapshot',player:'player',scene:'scene',encounter:'encounter',activity:'activities'};
const views={},hashes={};
for(const [key,route] of Object.entries(routes)){
 const r=await fetch(`http://127.0.0.1:18330/api/runtime/${route}`,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);
 const text=await r.text();views[key]=JSON.parse(text);hashes[key]=hash(text);
}
const s=views.snapshot;assert(Object.values(views).every(v=>v.simulationId===s.simulationId&&v.revision===s.revision&&v.tick===s.tick));
const files={};for(const name of (await readdir(`${root}/world`)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort())files[name]=hash(await readFile(`${root}/world/${name}`));
const proof={simulationId:s.simulationId,revision:s.revision,tick:s.tick,location:views.scene.location,food:views.scene.self.food,
 hunterGiftMemories:views.scene.actors.find(a=>a.actorId==='actor-2')?.receivedGifts.length??null,visibleOthers:views.scene.actors.map(a=>a.actorId),
 encounterStatus:views.encounter.encounter?.status??null,encounterResolution:views.encounter.encounter?.resolution??null,
 activityCount:views.activity.entries.length,activityIds:views.activity.entries.map(e=>e.activityId),
 placeActivityCounts:Object.fromEntries(['village','forest','unknown'].map(loc=>[loc,views.activity.entries.filter(e=>e.location===(loc==='unknown'?null:loc)).length])),hashes,files};
if(process.argv[3]){
 const prior=JSON.parse(await readFile(`${root}/${process.argv[3]}.json`,'utf8'));assert.deepEqual(proof,prior);
}
await writeFile(`${root}/${label}.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
