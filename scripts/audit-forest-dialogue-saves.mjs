// Read-only audit of this acceptance tool's synthetic saves; never uploads saves.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';
const base=path.resolve(process.argv[2]??'artifacts/forest-dialogue'),out=path.resolve(process.argv[3]??path.join(base,'speech-boundaries.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const report=async name=>{const file=path.join(base,name,'report.json');await verifyDialogueReportFiles(file);const bytes=await fs.readFile(file),r=JSON.parse(bytes);assert.equal(r.suiteId,'npc-forest-http-v1');assert.equal(r.fixtureVersion,'8');assert.equal(r.mode,'live');return {name,report:r,sha256:hash(bytes)};};
const initial=await report('live-01'),borrow=await report('borrow-retest'),overdue=await report('overdue-retest');
assert.equal(borrow.report.resume.sourceReportSha256,initial.sha256);
assert.equal(initial.report.externalModelCalls+borrow.report.externalModelCalls+overdue.report.externalModelCalls,16);
const facts=b=>{const w=b.snapshot.world,m=w.mapModel;return {tick:b.snapshot.tick,actorModel:w.actorModel,society:w.societyModel.agents,position:m.position,npcs:m.npcs,order:m.order,contact:m.contact,social:m.socialModel,agreement:m.negotiationModel.agreement,play:m.playModel,forest:m.forestModel,objectiveMemory:m.memoryModel.actors.map(a=>({actorId:a.actorId,episodes:a.episodes,forgottenEpisodes:a.forgottenEpisodes}))};};
const groups=initial.report.cases.map(c=>({directory:path.join(base,'live-01',c.id,'world'),id:'initial/'+c.id,turns:[...c.turns,...(c.id==='borrow-return'?borrow.report.cases[0].turns:[])]}));groups.push({directory:path.join(base,'overdue-retest','overdue-denial','world'),id:'retest/overdue-denial',turns:overdue.report.cases[0].turns});
const result={schemaVersion:1,scope:'actual-synthetic-committed-speech-boundaries',sourceReports:[initial,borrow,overdue].map(r=>({name:r.name,sha256:r.sha256})),externalModelCalls:16,groups:[],confirmedSpeechCommands:0,semanticVerdict:'needs-human-review'};
for(const group of groups){
 const files=await fs.readdir(group.directory);assert.ok(!files.some(f=>f.endsWith('.lock')));const revisions=files.filter(f=>/^service-commit-r\d+\.json$/.test(f)).map(f=>Number(f.match(/r(\d+)/)[1]));const latest=Math.max(...revisions);
 const read=async rev=>{const bytes=await fs.readFile(path.join(group.directory,`service-commit-r${rev}.json`));return {data:JSON.parse(bytes),sha256:hash(bytes)};};
 const head=await read(latest),speech=head.data.commands.filter(c=>c.dto.type==='PlayerDialogue'),accepted=group.turns.filter(t=>t.response);assert.equal(speech.length,accepted.length);const entries=[];
 for(const entry of speech){const before=await read(entry.dto.expectedRevision),after=await read(entry.receipt.toRevision);assert.equal(after.data.bundle.snapshot.fixtureVersion,'8');assert.deepEqual(facts(after.data.bundle),facts(before.data.bundle));
  const matching=accepted.filter(t=>t.text===entry.dto.payload.utterance&&t.response.reply===entry.dto.payload.reply);assert.equal(matching.length,1);assert.deepEqual(matching[0].response.memoryRefs,entry.dto.payload.memoryRefs);
  entries.push({commandId:entry.dto.commandId,fromRevision:entry.dto.expectedRevision,toRevision:entry.receipt.toRevision,tick:before.data.bundle.snapshot.tick,beforeFileSha256:before.sha256,afterFileSha256:after.sha256,noPhysicalOrObjectiveMemoryChange:true});
 }
 result.confirmedSpeechCommands+=entries.length;result.groups.push({id:group.id,latestRevision:latest,latestFileSha256:head.sha256,remainingLocks:[],entries});
}
assert.equal(result.confirmedSpeechCommands,15);await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'verified',confirmedSpeechCommands:15,externalModelCalls:16,noPhysicalOrObjectiveMemoryChange:true,output:out}));
