import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const load=f=>import(pathToFileURL(path.join(root,f)));
const {createMemoryCampaignVillage,campaignSystems}=await load('runtime/fixtures/campaign-village.mjs');
const {computeCampaignIntent}=await load('runtime/core/scene-campaign-runtime.mjs');
const {createAuditedBundle,validateBundle}=await load('runtime/core/world-state.mjs');
const {canonicalJson}=await load('runtime/core/data-contract.mjs');
const {mapView}=await load('runtime/core/campaign-map.mjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const rounds=[];for(let r=0;r<3;r++){
 const start=performance.now();let b=createAuditedBundle(createMemoryCampaignVillage(42,'playable-performance-baseline').bundle,{rulesVersion:'d-campaign-v1',systems:campaignSystems()});const opened=performance.now();let n=0;
 for(const tick of [36,72,108,144])b=computeCampaignIntent(b,{version:5,commandId:'perf-'+(++n),expectedRevision:b.snapshot.revision,type:'AdvanceTime',payload:{ticks:tick-b.snapshot.tick}}).bundle;
 const simulated=performance.now();validateBundle(b,{rulesVersion:'d-campaign-v1',systems:campaignSystems()});const audited=performance.now();
 for(let i=0;i<10;i++)mapView(b,124);const viewed=performance.now();
 const copy=JSON.parse(JSON.stringify(b));assert.deepEqual(copy,b);
 rounds.push({openMs:opened-start,simulateMs:simulated-opened,auditMs:audited-simulated,tenMapReadsMs:viewed-audited,bundleSha256:hash(canonicalJson(b)),tick:b.snapshot.tick});
}
assert.ok(rounds.every(r=>r.bundleSha256===rounds[0].bundleSha256));await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({node:process.version,root,rounds,externalModelCalls:0},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'measured',rounds:3,sha256:rounds[0].bundleSha256,simulateMs:rounds.map(r=>Math.round(r.simulateMs)),auditMs:rounds.map(r=>Math.round(r.auditMs))}));
