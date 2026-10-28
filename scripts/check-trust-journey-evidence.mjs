import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dir='docs/evidence/trust-journey-resume-20261028';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(file){assert.ok(typeof file==='string'&&!path.isAbsolute(file));const p=path.resolve(root,file);assert.ok(p.startsWith(root));return fs.readFile(p);}
const json=async file=>JSON.parse(await read(file)),index=await json(dir+'/index.json');
assert.equal(index.schemaVersion,1);assert.equal(index.parent,'c5df3c8d69951545fa33e59707766c2295d3b9ed');
assert.equal(index.externalModelCalls,0);assert.equal(index.browserLayout,'not-measured');assert.equal(index.windowsLauncher,'not-run');
for(const group of ['sourceSha256','frozenSourceSha256','preservedEvidence'])for(const [file,hash] of Object.entries(index[group]))assert.equal(sha(await read(file)),hash,group+': '+file);
for(const [file,item] of Object.entries(index.evidence)){assert.equal(path.basename(file),file);const bytes=await read(dir+'/'+file);assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256,file);}
assert.deepEqual((await fs.readdir(path.join(root,dir))).sort(),['index.json',...Object.keys(index.evidence)].sort());
const names=new Set();
for(const run of index.finalRuns){
 const meta=await json(dir+'/'+run.label+'.json'),log=(await read(dir+'/'+run.label+'.txt')).toString();
 assert.equal(meta.exitCode,0);assert.equal(meta.timedOut,false);assert.equal(meta.unconfirmed,false);
 for(const [key,n] of [['tests',run.tests],['pass',run.tests],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 for(const m of log.matchAll(/^ok \d+ - (.*)$/gm)){assert.ok(!names.has(m[1]),'Duplicate counted test: '+m[1]);names.add(m[1]);}
}
assert.equal(names.size,index.uniqueTests);assert.ok(index.uniqueTests>=14);
const legacy=await json(dir+'/trust-legacy-report.json'),legacyMeta=await json(dir+'/trust-legacy-seven-days.json');
assert.equal(legacy.parent,index.parent);assert.equal(legacy.matches,true);assert.deepEqual(legacy.candidate,legacy.baseline);assert.equal(legacy.candidate.length,6);
assert.equal(legacy.candidate.reduce((n,r)=>n+r.checkpoints.length,0),15);assert.equal(legacy.candidate[5].tick,1008);
assert.equal(legacyMeta.exitCode,0);assert.equal(legacyMeta.timedOut,false);
const regression=(await read(dir+'/trust-adjacent-regression.txt')).toString();
const records=regression.split('\n').filter(l=>l.startsWith('# {"measurement"')).map(l=>JSON.parse(l.slice(2))),service=records.filter(r=>r.measurement==='trust-journey-http');
assert.equal(service.length,2);assert.deepEqual(service.map(r=>r.route).sort(),['late','on-time']);
for(const r of service){assert.equal(r.fixture,'7');assert.equal(r.status,r.route==='late'?'failed':'completed');for(const key of ['borrowedSaveReopened','returnSaveReopened','retriesPreservedFiles'])assert.equal(r[key],true);assert.equal(r.externalModelCalls,0);assert.equal(r.browserRendering,false);}
assert.ok(records.some(r=>r.measurement==='first-chapter-http-walkthrough'&&r.chapterComplete&&r.rank===3));
assert.ok(records.some(r=>r.measurement==='hunter-task-entry-http'&&r.opened==='actor-2'&&r.explicitCommands===5));
for(const label of ['trust-legacy-events-red','trust-core-first','trust-core-final']){const meta=await json(dir+'/'+label+'.json');assert.equal(meta.exitCode,1);assert.equal(meta.timedOut,false);}
assert.match((await read(dir+'/trust-legacy-events-red.txt')).toString(),/Invalid perception source/);
assert.match((await read(dir+'/trust-core-first.txt')).toString(),/Invalid social interaction payload/);
assert.match((await read(dir+'/trust-core-final.txt')).toString(),/'caught' !== 'taken'/);
const checks=await json(dir+'/static-checks.json');assert.equal(checks.diffCheck,true);assert.equal(checks.credentialsFound,false);assert.equal(checks.node,legacy.node);
console.log(JSON.stringify({status:'verified',uniqueTests:index.uniqueTests,legacyFixtures:6,legacyFullBundleCheckpoints:15,legacyPlayableDays:7,trustServiceRoutes:2,externalModelCalls:0,browserLayout:index.browserLayout,windowsLauncher:index.windowsLauncher}));
