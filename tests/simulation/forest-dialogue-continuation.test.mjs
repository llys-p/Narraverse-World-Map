import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDialogueReportWriter} from '../../runtime/evaluation/npc-report-files.mjs';
import {inspectForestContinuation,copyForestContinuation,verifyForestContinuationSource} from '../../scripts/forest-dialogue-continuation.mjs';
import {parseForestDialogueArgs} from '../../scripts/evaluate-forest-dialogue.mjs';

// Minimal file-protocol fixture, not a replay-valid game world or language test.
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forest-continue-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const out=path.join(root,'artifacts/forest-dialogue/old'),directory=path.join(out,'overdue-denial/world'),reportFile=path.join(out,'report.json');await fs.mkdir(directory,{recursive:true});
 const bundle={snapshot:{fixtureVersion:'8',revision:1}},saved={bundle,commands:[{dto:{type:'PlayerDialogue',payload:{utterance:'迟还多久？',reply:'旧错误1460分钟。'}}}]};
 await fs.writeFile(path.join(directory,'service-commit-r1.json'),JSON.stringify(saved));
 const report={suiteId:'npc-forest-http-v1',fixtureVersion:'8',mode:'live',completed:true,completionProtocol:1,cases:[{id:'overdue-denial',worldReplayAudit:'passed',remainingLocks:[],finalRevision:1,finalBundleSha256:createHash('sha256').update(JSON.stringify(bundle)).digest('hex'),turns:[{id:'old',status:'automatic-pass',text:'迟还多久？',response:{reply:'旧错误1460分钟。'},oracle:{loan:{returnedTick:186}}}]}]};
 const writer=await createDialogueReportWriter(reportFile);await writer.save(JSON.stringify(report),'<p>Protocol fixture</p>');await writer.finish();await writer.close();
 return {root,out,directory,reportFile};
}
test('continuation copies accepted old speech without altering its original report or world',async t=>{
 const f=await fixture(t),s=await inspectForestContinuation(f.root,f.reportFile,'overdue-denial'),dest=path.join(f.root,'copy');await copyForestContinuation(s,dest);
 assert.equal(s.originalReplies.length,1);assert.equal(await fs.readFile(path.join(dest,'service-commit-r1.json'),'utf8'),await fs.readFile(path.join(f.directory,'service-commit-r1.json'),'utf8'));
 await fs.writeFile(path.join(dest,'service-commit-r2.json'),'{}');await verifyForestContinuationSource(s);
 await assert.rejects(copyForestContinuation(s,dest),/empty/);
});
test('continuation rejects advanced, tampered or active source worlds',async t=>{
 const f=await fixture(t),read=()=>inspectForestContinuation(f.root,f.reportFile,'overdue-denial');
 const added=path.join(f.directory,'service-commit-r2.json');await fs.writeFile(added,'{}');await assert.rejects(read(),/advanced/);await fs.unlink(added);
 const lock=path.join(f.directory,'.runtime-owner.lock');await fs.writeFile(lock,'active');await assert.rejects(read(),/stopped/);await fs.unlink(lock);
 await fs.writeFile(path.join(f.directory,'service-commit-r1.json'),JSON.stringify({bundle:{snapshot:{fixtureVersion:'8',revision:2}}}));await assert.rejects(read(),/does not match/);
});
test('continuation rejects symlinks, reports outside synthetic outputs and altered completion bytes',async t=>{
 const f=await fixture(t),read=()=>inspectForestContinuation(f.root,f.reportFile,'overdue-denial');
 const link=path.join(f.directory,'linked.json');await fs.symlink(f.reportFile,link);await assert.rejects(read(),/regular/);await fs.unlink(link);
 const elsewhere=path.join(f.root,'report.json');await fs.copyFile(f.reportFile,elsewhere);await assert.rejects(inspectForestContinuation(f.root,elsewhere,'overdue-denial'),/synthetic/);
 await fs.appendFile(f.reportFile,' ');await assert.rejects(read(),/completion evidence/);
});
test('continuation CLI requires an explicit supported case and cannot combine resume modes',()=>{
 const base=['--out','unused','--continue-from','source'];
 for(const args of [base,[...base,'--suite','continuity-v2','--case','all'],[...base,'--suite','continuity-v2','--case','overdue-denial','--resume-failed','source']])assert.throws(()=>parseForestDialogueArgs(args));
 assert.equal(parseForestDialogueArgs([...base,'--suite','continuity-v2','--case','overdue-denial']).mode,'plan');
});
