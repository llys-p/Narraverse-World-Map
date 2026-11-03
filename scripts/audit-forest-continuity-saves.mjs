// Read-only physical/objective-memory checks around the actually saved new speech.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';
const base=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),hash=b=>createHash('sha256').update(b).digest('hex');
const facts=b=>{const w=b.snapshot.world,m=w.mapModel;return {tick:b.snapshot.tick,actorModel:w.actorModel,society:w.societyModel.agents,position:m.position,npcs:m.npcs,order:m.order,contact:m.contact,social:m.socialModel,agreement:m.negotiationModel.agreement,play:m.playModel,forest:m.forestModel,objectiveMemory:m.memoryModel.actors.map(a=>({actorId:a.actorId,episodes:a.episodes,forgottenEpisodes:a.forgottenEpisodes}))};};
const result={schemaVersion:1,scope:'continuity-v2-actual-synthetic-speech-boundaries',externalModelCalls:0,confirmedSpeechCommands:0,groups:[],humanReview:'pending'};
for(const id of ['borrow-return','witness-denial','overdue-denial']){
 const file=path.join(base,'live-'+id,'report.json');await verifyDialogueReportFiles(file);const bytes=await fs.readFile(file),r=JSON.parse(bytes);
 assert.equal(r.suiteId,'npc-forest-continuity-v2');assert.equal(r.fixtureVersion,'8');assert.equal(r.mode,'live');assert.equal(r.cases.length,1);const c=r.cases[0];assert.equal(c.id,id);
 const directory=path.join(path.dirname(file),id,'world'),files=await fs.readdir(directory);assert.ok(!files.some(f=>f.endsWith('.lock')));
 const read=async rev=>{const bytes=await fs.readFile(path.join(directory,`service-commit-r${rev}.json`));return {data:JSON.parse(bytes),sha256:hash(bytes)};};
 const head=await read(c.finalRevision);assert.equal(hash(JSON.stringify(head.data.bundle)),c.finalBundleSha256);
 const accepted=c.turns.filter(t=>t.response),speech=head.data.commands.filter(e=>e.dto.type==='PlayerDialogue'&&e.dto.commandId.startsWith('speech-forest2-'));
 assert.equal(speech.length,accepted.length);const entries=[];
 for(const e of speech){
  const before=await read(e.dto.expectedRevision),after=await read(e.receipt.toRevision);assert.deepEqual(facts(before.data.bundle),facts(after.data.bundle));
  const t=accepted.find(t=>'speech-'+t.requestId===e.dto.commandId);assert.ok(t);assert.equal(t.response.reply,e.dto.payload.reply);assert.equal(t.text,e.dto.payload.utterance);assert.deepEqual(t.response.memoryRefs,e.dto.payload.memoryRefs);
  entries.push({commandId:e.dto.commandId,fromRevision:e.dto.expectedRevision,toRevision:e.receipt.toRevision,beforeFileSha256:before.sha256,afterFileSha256:after.sha256,noPhysicalOrObjectiveMemoryChange:true});
 }
 let retainedOriginalReplies=0;
 if(r.continuation){assert.equal(r.continuation.sourceUnchanged,true);for(const original of r.continuation.originalReplies){assert.ok(head.data.commands.some(e=>e.dto.type==='PlayerDialogue'&&hash(e.dto.payload.reply)===original.replySha256));retainedOriginalReplies++;}}
 result.externalModelCalls+=r.externalModelCalls;result.confirmedSpeechCommands+=entries.length;result.groups.push({id,sourceReportSha256:hash(bytes),finalBundleSha256:c.finalBundleSha256,retainedOriginalReplies,entries});
}
await fs.writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'verified',externalModelCalls:result.externalModelCalls,confirmedSpeechCommands:result.confirmedSpeechCommands,retainedOriginalReplies:result.groups.reduce((n,g)=>n+g.retainedOriginalReplies,0)}));
