import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import assert from 'node:assert/strict';
const root='artifacts/d4e6-controller-20261016',label=process.argv[2],world=resolve(process.argv[3]);
assert(/^[a-z0-9-]+$/.test(label));const boundary=resolve('artifacts/d4e6-person-tracking-tests'),rel=relative(boundary,world);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));
const h=x=>createHash('sha256').update(x).digest('hex');
const routes={snapshot:'snapshot',player:'player',scene:'scene',encounter:'encounter',activity:'activities'},views={},hashes={};
for(const [key,route] of Object.entries(routes)){
 const r=await fetch(`http://127.0.0.1:18332/api/runtime/${route}`,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);const text=await r.text();views[key]=JSON.parse(text);hashes[key]=h(text);
}
const s=views.snapshot;assert(Object.values(views).every(v=>v.simulationId===s.simulationId&&v.revision===s.revision&&v.tick===s.tick));assert.equal(s.tick,144);
const files={};for(const name of (await readdir(world)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort())files[name]=h(await readFile(`${world}/${name}`));
const proof={simulationId:s.simulationId,revision:s.revision,tick:s.tick,actors:s.actors,activityCount:views.activity.entries.length,
 personCounts:Object.fromEntries(s.actors.map(a=>[a.actorId,Object.fromEntries(['succeeded','rejected','no-action','settled','waiting-resolved'].map(status=>[status,views.activity.entries.filter(e=>e.actorIds.includes(a.actorId)&&e.status===status).length]))])),
 dailySummaries:views.activity.entries.filter(e=>e.kind==='daily-person').map(e=>({activityId:e.activityId,actorIds:e.actorIds,tick:e.tick,location:e.location,locationEvidence:e.locationEvidence,summary:e.summary})),hashes,files};
if(process.argv[4])assert.deepEqual(proof,JSON.parse(await readFile(`${root}/${process.argv[4]}.json`,'utf8')));
await writeFile(`${root}/${label}.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
