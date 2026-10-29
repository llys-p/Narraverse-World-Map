import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/forest-guidance-20261029';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(file){assert.ok(typeof file==='string'&&!path.isAbsolute(file));const p=path.resolve(root,file);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async file=>JSON.parse(await read(file)),index=await json(dir+'/index.json');
assert.equal(index.parent,'6697559eb631955125bb143ff239da83acbd94a8');
assert.deepEqual(index.productionDiff,['demo-forest.mjs','demo-runtime.css','demo-runtime.html']);
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [file,hash] of Object.entries(index[group]))assert.equal(sha(await read(file)),hash,group+': '+file);
for(const [file,item] of Object.entries(index.evidence)){assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256,file);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const names=new Set(),records=[];
for(const [label,count] of [['forest-guidance-unit',11],['forest-guidance-regression',22],['forest-guidance-interactions',3],['forest-guidance-http-fixed',1]]){
 const meta=await json(dir+'/'+label+'.json'),log=(await read(dir+'/'+label+'.txt')).toString();
 assert.equal(meta.exitCode,0);assert.equal(meta.timedOut,false);assert.equal(meta.unconfirmed,false);
 for(const [key,n] of [['tests',count],['pass',count],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 const rows=[...log.matchAll(/^ok \d+ - (.*)$/gm)];assert.equal(rows.length,count);rows.forEach(m=>names.add(m[1]));
 records.push(...log.split('\n').filter(l=>l.startsWith('# {"measurement"')).map(l=>JSON.parse(l.slice(2))));
}
assert.equal(names.size,35);assert.equal(index.uniqueTests,35);
const own=records.find(r=>r.measurement==='forest-guidance-http'),old=records.find(r=>r.measurement==='forest-worker-http');
for(const key of ['readOnlyPaintPreservedFiles','oldLoanNotPresentedAsCurrent','siteClick','restUsedNoFuel','reopenedActiveEncounter','explicitExit','returnClick','retryPreservedFiles'])assert.equal(own[key],true);
assert.equal(own.panelRequests,7);assert.equal(own.renderedBrowser,false);
assert.equal(old.committedCommands,130);assert.equal(old.chapterComplete,true);assert.equal(old.reopenedAfter130Commands,true);
for(const r of [own,old]){assert.equal(r.externalModelCalls,0);assert.equal(r.returnedToolCondition,70);for(const [file,hash] of Object.entries(r.assets))assert.equal(sha(await read(file)),hash,'served asset: '+file);}
for(const [label,fail] of [['forest-guidance-red',2],['forest-guidance-http',1]]){
 const meta=await json(dir+'/'+label+'.json');assert.equal(meta.exitCode,1);assert.equal(meta.timedOut,false);assert.match((await read(dir+'/'+label+'.txt')).toString(),new RegExp('^# fail '+fail+'$','m'));
}
assert.match((await read(dir+'/forest-guidance-http.txt')).toString(),/receipt.toTick/);
const parentMeta=await json(dir+'/forest-guidance-parent.json');assert.equal(parentMeta.exitCode,0);
const parent=JSON.parse((await read(dir+'/forest-guidance-parent.txt')).toString());assert.equal(parent.uniquePassedTests,58);assert.equal(parent.legacyCommands,55);
const checks=await json(dir+'/static-checks.json');assert.equal(checks.sourceDiffCheck,true);assert.equal(checks.credentialsFound,false);assert.equal(checks.html.uniqueIds,true);assert.equal(checks.html.describedButtons,9);assert.equal(checks.protectedWorktreesUnchanged,true);
assert.equal(index.externalModelCalls,0);assert.equal(index.browser,'not-rendered');assert.equal(index.windows,'not-run');
console.log(JSON.stringify({status:'verified',uniqueTests:35,newPanelHttp:true,originalHttpCommittedCommands:130,productionFiles:3,externalModelCalls:0,browser:index.browser,windows:index.windows}));
