// Continue only completed synthetic evaluator worlds, in a fresh private copy.
// The original evidence and its saved world remain byte-for-byte unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
export async function syntheticWorldHashes(directory){
 const entries=await fs.readdir(directory,{withFileTypes:true});
 assert.ok(entries.length>0,'Synthetic world is empty');
 const result={};
 for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
  assert.ok(entry.isFile()&&entry.name.endsWith('.json'),'Synthetic world must be stopped and contain only regular JSON files');
  result[entry.name]=hash(await fs.readFile(path.join(directory,entry.name)));
 }
 return result;
}
export async function inspectForestContinuation(root,reportFile,caseId){
 assert.match(caseId,/^[a-z][a-z-]+$/);
 const prefix=await fs.realpath(path.join(root,'artifacts','forest-dialogue'))+path.sep;
 const sourcePath=await fs.realpath(path.resolve(root,reportFile));
 assert.ok(sourcePath.startsWith(prefix)&&path.basename(sourcePath)==='report.json','Only this evaluator synthetic reports can be continued');
 await verifyDialogueReportFiles(sourcePath);
 const bytes=await fs.readFile(sourcePath),report=JSON.parse(bytes),entry=report.cases.find(c=>c.id===caseId);
 assert.equal(report.suiteId,'npc-forest-http-v1');assert.equal(report.fixtureVersion,'8');assert.equal(report.mode,'live');assert.equal(report.completed,true);assert.ok(report.resume==null,'Cannot continue a failed-turn resume report');
 assert.equal(entry?.worldReplayAudit,'passed');assert.deepEqual(entry.remainingLocks,[]);
 assert.ok(entry.turns.length>0&&entry.turns.every(t=>t.status==='automatic-pass'&&t.response),'Continuation requires a completed accepted case; semantic review may still be pending');
 const directory=await fs.realpath(path.join(path.dirname(sourcePath),caseId,'world'));assert.ok(directory.startsWith(prefix));
 const fileHashes=await syntheticWorldHashes(directory),revisions=Object.keys(fileHashes).filter(f=>/^service-commit-r\d+\.json$/.test(f)).map(f=>Number(f.match(/r(\d+)/)[1]));
 assert.equal(Math.max(...revisions),entry.finalRevision,'Source world has advanced since its report');
 const saved=JSON.parse(await fs.readFile(path.join(directory,`service-commit-r${entry.finalRevision}.json`),'utf8'));
 assert.equal(hash(JSON.stringify(saved.bundle)),entry.finalBundleSha256,'Source world does not match the completed report');
 assert.equal(saved.bundle.snapshot.fixtureVersion,'8');
 for(const turn of entry.turns)assert.ok(saved.commands.some(c=>c.dto.type==='PlayerDialogue'&&c.dto.payload.utterance===turn.text&&c.dto.payload.reply===turn.response.reply),'Source world is missing an original confirmed reply');
 return {directory,fileHashes,sourcePath,sourceReportSha256:hash(bytes),caseId,originalRevision:entry.finalRevision,originalBundleSha256:entry.finalBundleSha256,loan:entry.turns.at(-1).oracle.loan,originalReplies:entry.turns.map(t=>({turnId:t.id,replySha256:hash(t.response.reply)}))};
}
export async function copyForestContinuation(source,destination){
 assert.deepEqual(await syntheticWorldHashes(source.directory),source.fileHashes,'Source world changed before copying');
 await fs.mkdir(destination,{recursive:true});assert.deepEqual(await fs.readdir(destination),[],'Copy destination must be empty');
 for(const f of Object.keys(source.fileHashes))await fs.copyFile(path.join(source.directory,f),path.join(destination,f),1);
 assert.deepEqual(await syntheticWorldHashes(destination),source.fileHashes,'Copied world differs from the original');
 await verifyForestContinuationSource(source);
}
export async function verifyForestContinuationSource(source){
 assert.equal(hash(await fs.readFile(source.sourcePath)),source.sourceReportSha256,'Original report changed');
 assert.deepEqual(await syntheticWorldHashes(source.directory),source.fileHashes,'Original synthetic world changed');
}
