import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const load=f=>import(pathToFileURL(path.join(root,f)));
const {createPlayableCampaignVillage}=await load('runtime/fixtures/campaign-village.mjs');
const {validateSocietyWorld}=await load('runtime/core/society.mjs');
const {canonicalJson}=await load('runtime/core/data-contract.mjs');
const w=createPlayableCampaignVillage(42,'config-cache-society').bundle.snapshot.world;
const world=Object.fromEntries(['resources','resourceModel','ecologyModel','marketModel','actorModel','societyModel','playerModel'].map(k=>[k,w[k]]));
const before=canonicalJson(world),samples=[];
// This isolated predicate measurement leaves all runtime state and clocks intact.
for(let round=0;round<3;round++){
  const start=performance.now(),cpu=process.cpuUsage();
  for(let i=0;i<100;i++)validateSocietyWorld(world);
  const used=process.cpuUsage(cpu);samples.push({round,wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000});
}
assert.equal(canonicalJson(world),before);
const record={root,node:process.version,validations:300,samples,worldSha256:createHash('sha256').update(before).digest('hex'),sourceSha256:createHash('sha256').update(await fs.readFile(path.join(root,'runtime/core/society.mjs'))).digest('hex'),externalModelCalls:0,scope:'isolated society predicate, excluding full world replay and HTTP; not an overall game latency result'};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record));
