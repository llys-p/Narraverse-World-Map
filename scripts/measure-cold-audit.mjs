// Local-only measurement copy: the production module receives no observer or bypass flag.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]),input=process.argv[3],out=process.argv[4],load=f=>import(pathToFileURL(path.join(root,f))),hash=b=>createHash('sha256').update(b).digest('hex');
if(input==='--prepare'){
 const {createPlayableCampaignVillage}=await load('runtime/fixtures/campaign-village.mjs'),{computeCampaignIntent}=await load('runtime/core/scene-campaign-runtime.mjs');
 const anchor=createPlayableCampaignVillage(42,'cold-audit-measurement').bundle,dto={version:5,commandId:'cold-seven',expectedRevision:0,type:'AdvanceTime',payload:{ticks:1008}},r=computeCampaignIntent(anchor,dto);assert.equal(r.receipt.outcome,'succeeded');
 const envelope={serviceFormatVersion:11,anchor,commands:[{dto,receipt:r.receipt}],bundle:r.bundle};await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(envelope),{flag:'wx'});console.log(JSON.stringify({status:'prepared',seed:42,tick:1008,commands:1,externalModelCalls:0}));
}else{
 const file=path.join(root,'runtime/service/service-commit.mjs'),source=await fs.readFile(file,'utf8');let measured=source;
 const replace=(needle,value)=>{assert.equal(measured.split(needle).length,2,'Measurement anchor: '+needle);measured=measured.replace(needle,value);};
 replace('function auditServiceCommit(envelope){','function auditServiceCommit(envelope){\n const coldStarted=performance.now();');
 replace('  const anchor=[9,10,11]', ' const coldAnchorStarted=performance.now();\n  const anchor=[9,10,11]');
 replace('  const final=[9,10,11]', ' const coldFinalStarted=performance.now();\n  const final=[9,10,11]');
 replace('  projectPublicSnapshot(anchor);', ' const coldProjectionStarted=performance.now();\n  projectPublicSnapshot(anchor);');
 replace('  const seen=new Set();',' const coldJournalStarted=performance.now();\n  const seen=new Set();');
 replace('  return {anchor,final};',' const coldEnded=performance.now();coldAuditPhases={envelopeMs:coldAnchorStarted-coldStarted,anchorMs:coldFinalStarted-coldAnchorStarted,finalFullAuditMs:coldProjectionStarted-coldFinalStarted,projectionsMs:coldJournalStarted-coldProjectionStarted,journalMs:coldEnded-coldJournalStarted,totalMs:coldEnded-coldStarted};\n  return {anchor,final};');
 measured='export let coldAuditPhases;\n'+measured.replace(/from '([^']+)'/g,(m,p)=>p.startsWith('.')?`from '${pathToFileURL(path.resolve(path.dirname(file),p)).href}'`:m);
 const module=await import('data:text/javascript;base64,'+Buffer.from(measured).toString('base64')),bytes=await fs.readFile(input),raw=JSON.parse(bytes),result=module.createAuditedServiceCommit(raw);
 assert.deepEqual(result,raw);assert.ok(Object.isFrozen(result.bundle.snapshot.world));const {canonicalJson}=await load('runtime/core/data-contract.mjs');
 const record={node:process.version,root,tick:result.bundle.snapshot.tick,commands:result.commands.length,serviceSourceSha256:hash(source),inputBytes:bytes.length,inputSha256:hash(bytes),certifiedEnvelopeSha256:hash(canonicalJson(result)),measurement:'local-instrumented-audit-copy',phases:module.coldAuditPhases,externalModelCalls:0};await fs.writeFile(out,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record));
}
