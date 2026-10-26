import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseCommandBytes } from '../../runtime/service/http-contract.mjs';
import { validateServiceCommit, saveServiceCommit, loadServiceCommit } from '../../runtime/service/service-commit.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';
import { MAX_STATE_FILE_BYTES } from '../../runtime/persistence/bounded-json-file.mjs';
const command=(commandId='a',expectedRevision=0,ticks=144)=>({version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}});
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-service-commit-'),directory=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(directory)&&directory.startsWith(prefix));await fs.rm(directory,{recursive:true,force:true});});return directory;}
function genesis(){const anchor=createPersonalityNeutral(42).bundle;return {serviceFormatVersion:1,anchor,commands:[],bundle:structuredClone(anchor)};}
function committed(){const e=genesis(),f=createPersonalityNeutral(42),s=createSimulationSession(e.anchor,f.systems);s.advanceTicks(144);e.bundle=s.getBundle();
  e.commands.push({dto:command(),receipt:{apiVersion:1,commandId:'a',status:'committed',fromRevision:0,toRevision:144,tick:144}});return e;}

test('D2A wire parser rejects duplicate and escaped duplicate keys, bad UTF8, deep or oversized JSON before DTO use',()=>{
  const text=JSON.stringify(command());assert.deepEqual(parseCommandBytes(Buffer.from(text)),command());
  for(const text of ['{"version":1,"version":1}', '{"payload":{"ticks":1,"ti\\u0063ks":2}}', '['.repeat(65)+'0'+']'.repeat(65)])
    assert.throws(()=>parseCommandBytes(Buffer.from(text)),e=>['INVALID_INPUT','LIMIT_EXCEEDED'].includes(e.code));
  assert.throws(()=>parseCommandBytes(Buffer.from([0xff])),e=>e.code==='INVALID_INPUT');
  assert.throws(()=>parseCommandBytes(Buffer.alloc(4097,32)),e=>e.code==='LIMIT_EXCEEDED');
});
test('D2A full envelope audits receipts and actual replay rather than accepting rewritten metadata or final state',()=>{
  const e=committed();validateServiceCommit(e);
  for(const alter of [e=>e.commands[0].receipt.tick++,e=>e.commands[0].dto.payload.ticks++,e=>e.bundle.snapshot.world.resources.food++,e=>e.commands.push(structuredClone(e.commands[0]))]){
    const bad=structuredClone(e);alter(bad);assert.throws(()=>validateServiceCommit(bad));}
  const sparse=genesis();sparse.commands=Array(1);assert.throws(()=>validateServiceCommit(sparse));
  const huge=genesis();huge.commands=Array(129);assert.throws(()=>validateServiceCommit(huge),e=>e.code==='LIMIT_EXCEEDED');
});
test('D2A service files publish exclusively and reject corruption; publication failure never replaces a completed file',async t=>{
  const directory=await temporary(t),e=committed(),file=await saveServiceCommit(e,directory),bytes=await fs.readFile(file);
  assert.deepEqual(await loadServiceCommit(file),e);await assert.rejects(saveServiceCommit(e,directory),e=>e.code==='SAVE_FAILED');
  assert.deepEqual(await fs.readFile(file),bytes);
  const corrupt=structuredClone(e);corrupt.commands[0].receipt.toRevision++;await fs.writeFile(file,JSON.stringify(corrupt));
  await assert.rejects(loadServiceCommit(file),e=>e.code==='INVALID_SERVICE_COMMIT');
});
test('D2A owner commits real C5 world, serializes conflicts and persists original retry receipt across restart',async t=>{
  const directory=path.join(await temporary(t),'world'),owner=await createRuntimeOwner({directory,writable:true});t.after(()=>owner.close());
  const outcomes=await Promise.allSettled([owner.submit(command()),owner.submit(command('b'))]);
  assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].reason.code,'REVISION_CONFLICT');assert.equal(outcomes[1].reason.currentRevision,144);
  assert.deepEqual(await owner.submit(command()),outcomes[0].value);
  await assert.rejects(owner.submit(command('a',144,1)),e=>e.code==='COMMAND_ID_CONFLICT');
  const next=await owner.submit(command('b',144,1));assert.equal(next.toRevision,145);
  const disk=await loadServiceCommit(path.join(directory,'service-commit-r145.json'));
  const f=createPersonalityNeutral(42),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(145);assert.deepEqual(disk.bundle,s.getBundle());
  await owner.close();const restored=await createRuntimeOwner({directory,writable:true});t.after(()=>restored.close());
  assert.equal(restored.getSnapshot().tick,145);assert.deepEqual(await restored.submit(command()),outcomes[0].value);assert.equal(restored.getSnapshot().tick,145);
});
test('D2A link failure leaves live world and receipts untouched, then same ID may succeed; latest corrupt never falls back',async t=>{
  const directory=path.join(await temporary(t),'world');let fail=false;
  const io={...fs,async link(...args){if(fail)throw new Error('injected disk failure');return fs.link(...args);}};
  const owner=await createRuntimeOwner({directory,writable:true},io);t.after(()=>owner.close());const before=owner.getSnapshot();fail=true;
  await assert.rejects(owner.submit(command()),e=>e.code==='SAVE_FAILED');assert.deepEqual(owner.getSnapshot(),before);
  assert.deepEqual((await fs.readdir(directory)).sort(),['.runtime-owner.lock','service-commit-r0.json']);fail=false;
  await owner.submit(command());await owner.close();await fs.writeFile(path.join(directory,'service-commit-r145.json'),'{}');
  await assert.rejects(createRuntimeOwner({directory,writable:true}),e=>e.code==='INVALID_SERVICE_COMMIT');
});
test('D2A queue preflight includes the active commit, readers see previous revision and close drains before releasing ownership',async t=>{
  const directory=path.join(await temporary(t),'world');let hold=false,entered;
  const started=new Promise(resolve=>entered=resolve);let resume;const gate=new Promise(resolve=>resume=resolve);
  const io={...fs,async link(...args){if(hold){entered();await gate;}return fs.link(...args);}};
  const owner=await createRuntimeOwner({directory,writable:true},io);t.after(()=>owner.close());hold=true;
  const first=owner.submit(command('queued',0,1));await started;
  assert.equal(owner.getSnapshot().tick,0);
  const remaining=Array.from({length:15},()=>owner.submit(command('queued',0,1)));
  await assert.rejects(owner.submit(command('overflow',0,1)),e=>e.code==='LIMIT_EXCEEDED');
  const closing=owner.close();await assert.rejects(owner.submit(command('closing',0,1)),e=>e.code==='OWNER_CLOSED');
  assert.equal((await fs.stat(path.join(directory,'.runtime-owner.lock'))).isFile(),true);
  resume();const receipt=await first;for(const result of await Promise.all(remaining))assert.deepEqual(result,receipt);await closing;
  const disk=await loadServiceCommit(path.join(directory,'service-commit-r1.json'));assert.equal(disk.commands.length,1);
  await assert.rejects(fs.stat(path.join(directory,'.runtime-owner.lock')),e=>e.code==='ENOENT');
});
test('D2A budgets and format boundary reject before replay or publication; no implicit D1 conversion',async t=>{
  const base=await temporary(t),oldDir=path.join(base,'old'),old=await createRuntimeOwner({directory:oldDir});await old.close();
  await assert.rejects(createRuntimeOwner({directory:oldDir,writable:true}),e=>e.code==='UNSUPPORTED_VERSION');
  const directory=path.join(base,'new'),owner=await createRuntimeOwner({directory,writable:true,checkpoint:path.join(oldDir,'checkpoint-r0.json')});t.after(()=>owner.close());
  for(let i=1;i<128;i++)await fs.writeFile(path.join(directory,`service-commit-r${i}.json`),'{}');
  await assert.rejects(owner.submit(command('full',0,1)),e=>e.code==='LIMIT_EXCEEDED');assert.equal(owner.getSnapshot().tick,0);
  await fs.writeFile(path.join(directory,'service-commit-r128.json'),'{}');await owner.close();
  await assert.rejects(createRuntimeOwner({directory,writable:true}),e=>e.code==='LIMIT_EXCEEDED');
  const oversized=path.join(base,'oversized.json'),handle=await fs.open(oversized,'w');await handle.truncate(MAX_STATE_FILE_BYTES+1);await handle.close();
  await assert.rejects(loadServiceCommit(oversized),e=>e.code==='LIMIT_EXCEEDED');
});
test('D2A interrupted cleanup keeps bounded service temporaries but loads only audited published commits; temporary-only genesis fails',async t=>{
  const base=await temporary(t),directory=path.join(base,'world'),owner=await createRuntimeOwner({directory,writable:true});await owner.submit(command('orphan',0,1));await owner.close();
  const orphan=path.join(directory,'.service-commit-r1.json.999.1.tmp'),partial=path.join(directory,'.service-commit-r2.json.999.2.tmp');
  await fs.link(path.join(directory,'service-commit-r1.json'),orphan);await fs.writeFile(partial,'unfinished');
  const restored=await createRuntimeOwner({directory,writable:true});t.after(()=>restored.close());assert.equal(restored.getSnapshot().tick,1);
  assert.equal(await fs.readFile(partial,'utf8'),'unfinished');assert.equal((await fs.stat(orphan)).isFile(),true);await restored.close();
  const incomplete=path.join(base,'incomplete');await fs.mkdir(incomplete);await fs.writeFile(path.join(incomplete,'.service-commit-r0.json.999.1.tmp'),'unfinished');
  await assert.rejects(createRuntimeOwner({directory:incomplete,writable:true}),e=>e.code==='INVALID_INPUT');
});
