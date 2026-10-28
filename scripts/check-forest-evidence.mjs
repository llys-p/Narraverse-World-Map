import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),base=new URL('docs/evidence/forest-tools-20261028/',root),index=JSON.parse(await fs.readFile(new URL('index.json',base),'utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');
assert.equal(index.parentCommit,'931ff94b7580c190bd9a0def4b36b0c7f26d8ee9');
for(const [name,sha] of Object.entries(index.sources))assert.equal(digest(await fs.readFile(new URL(name,root))),sha,'Source changed: '+name);
for(const [name,sha] of Object.entries(index.evidence))assert.equal(digest(await fs.readFile(new URL(name,base))),sha,'Evidence changed: '+name);
const names=new Set();for(const name of index.countedLogs){const text=await fs.readFile(new URL(name,base),'utf8');assert.match(text,/ℹ fail 0\b/);assert.match(text,/ℹ cancelled 0\b/);assert.match(text,/ℹ skipped 0\b/);const rows=[...text.matchAll(/^✔ (.+) \([\d.]+ms\)$/gm)].map(m=>m[1]);assert.equal(rows.length,Number(text.match(/ℹ tests (\d+)/)[1]));rows.forEach(n=>names.add(n));}
assert.equal(names.size,index.uniquePassedTests);
const legacy=JSON.parse(await fs.readFile(new URL('legacy-final.json',base),'utf8'));assert.equal(legacy.status,'identical');assert.equal(legacy.baseline,index.parentCommit);assert.deepEqual(legacy.fixtures.map(r=>r.fixture),[1,2,3,4,5,6,7]);assert.equal(legacy.fixtures.reduce((n,r)=>n+r.commands,0),55);
const service=await fs.readFile(new URL('service-release.txt',base),'utf8'),measurement=JSON.parse(service.split('\n').find(line=>line.startsWith('{"measurement":"forest-worker-http"')));assert.equal(measurement.committedCommands,130);assert.ok(measurement.chapterComplete&&measurement.reopenedWithWood&&measurement.reopenedActiveEncounter&&measurement.reopenedAfter130Commands&&measurement.retryFilesUnchanged);assert.equal(measurement.externalModelCalls,0);
const browser=JSON.parse(await fs.readFile(new URL('browser-attempt.json',base),'utf8'));assert.equal(browser.renderedBrowserValidated,false);assert.equal(browser.isolatedServerStoppedNormally,true);
console.log(JSON.stringify({status:'verified',uniquePassedTests:names.size,legacyCommands:55,committedHttpCommands:130,externalModelCalls:0,browser:'unverified; cloud browser could not reach workspace loopback'}));
