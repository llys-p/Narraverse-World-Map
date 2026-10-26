// ABBA on identical three-day, six-command bytes; both paths retain full external audit.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {performance} from 'node:perf_hooks';import {createHash} from 'node:crypto';
import {createPlayableCampaignVillage} from '../runtime/fixtures/campaign-village.mjs';import {computeCampaignIntent} from '../runtime/core/scene-campaign-runtime.mjs';import {validateServiceCommit} from '../runtime/service/service-commit.mjs';
const oracleFile=path.resolve(process.argv[2]),out=process.argv[3],serviceRoot=new URL('../runtime/service/',import.meta.url);
const source=await fs.readFile(oracleFile,'utf8'),linked=source.replace(/from '([^']+)'/g,(m,p)=>p.startsWith('.')?`from '${new URL(p,serviceRoot).href}'`:m);
const oracle=await import('data:text/javascript;base64,'+Buffer.from(linked).toString('base64'));
const anchor=createPlayableCampaignVillage(42,'journal-measurement').bundle,commands=[];let bundle=anchor,n=0;
for(const tick of [72,144,216,288,360,432]){const dto={version:5,commandId:'journal-'+(++n),expectedRevision:bundle.snapshot.revision,type:'AdvanceTime',payload:{ticks:tick-bundle.snapshot.tick}},r=computeCampaignIntent(bundle,dto);bundle=r.bundle;commands.push({dto,receipt:r.receipt});}
const envelope={serviceFormatVersion:11,anchor,commands,bundle},bytes=JSON.stringify(envelope),samples=[];
for(const name of ['A','B','B','A']){const detached=JSON.parse(bytes),start=performance.now();(name==='A'?oracle.validateServiceCommit:validateServiceCommit)(detached);samples.push({name,ms:performance.now()-start});}
const report={node:process.version,fixtureVersion:'6',tick:432,commands:6,oracleSourceSha256:createHash('sha256').update(source).digest('hex'),envelopeSha256:createHash('sha256').update(bytes).digest('hex'),samples,externalModelCalls:0};await fs.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
