import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {openDemoBrowser} from '../../scripts/demo-browser-client.mjs';
const exec=promisify(execFile);
test('missing browser fails before creating a browser profile or starting a process',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forest-browser-missing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await assert.rejects(openDemoBrowser({directory:path.join(root,'browser'),url:'http://127.0.0.1:1/',executable:path.join(root,'missing-browser')}),e=>e.code==='BROWSER_UNAVAILABLE');
 assert.deepEqual(await fs.readdir(root),[]);
});
test('an existing unusable executable reports its spawn error without an unhandled error or a lingering browser',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forest-browser-unusable-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await assert.rejects(openDemoBrowser({directory:path.join(root,'profile'),url:'http://127.0.0.1:1/',executable:root}),e=>e.code==='BROWSER_UNAVAILABLE');
 await fs.rename(path.join(root,'profile','edge.txt'),path.join(root,'profile','closed-edge.txt')); // The helper released its log handle.
});
test('browser acceptance CLI records BLOCKED with no service, save directory or model call when no browser exists',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forest-browser-preflight-')),out=path.join(root,'result');t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await assert.rejects(exec(process.execPath,['scripts/verify-forest-playtest.mjs',out],{cwd:new URL('../../',import.meta.url),env:{...process.env,DEMO_BROWSER_EXECUTABLE:path.join(root,'missing')},timeout:10000}),e=>e.code===2);
 const report=JSON.parse(await fs.readFile(path.join(out,'result.json'),'utf8'));
 assert.equal(report.verdict,'BLOCKED');assert.equal(report.browserExecuted,false);assert.equal(report.startedService,false);assert.equal(report.externalModelCalls,0);assert.deepEqual(report.steps,[]);assert.deepEqual(report.remainingLocks,[]);assert.deepEqual(report.cleanupErrors,[]);
 assert.equal(report.candidateVerified,true);assert.equal(report.candidateGameFiles,192);
 assert.deepEqual(await fs.readdir(out),['result.json']);
});
