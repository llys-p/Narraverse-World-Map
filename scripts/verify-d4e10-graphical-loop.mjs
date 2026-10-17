// Fresh synthetic-world browser acceptance. No original save access.
import {fork} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const script=fileURLToPath(import.meta.url), root=path.resolve(path.dirname(script),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const routes=['snapshot','player','minds','encounter','scene'];
if(process.argv[2]!=='--child'){
  const out=path.join(root,'artifacts','d4e10-acceptance',new Date().toISOString().replace(/[:.]/g,'-'));
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
  const child=fork(script,['--child',out,...(process.argv.includes('--browser')?['--browser']:[])],{cwd:root,stdio:['ignore','pipe','pipe','ipc']});
  console.log(JSON.stringify({out,pid:child.pid,browser:process.argv.includes('--browser')}));
  const stdout=[],stderr=[];let phase='startup',killed=null,phaseTimer,exitTimer;
  const kill=reason=>{if(killed)return;killed={reason,phase};child.kill('SIGKILL');exitTimer=setTimeout(async()=>{
    await fs.writeFile(path.join(out,'unconfirmed-exit.json'),JSON.stringify({pid:child.pid,killed,unconfirmed:true}));
    console.error('Exit confirmation exceeded 5 seconds');process.exit(1);
  },5000);};
  const totalTimer=setTimeout(()=>kill('TOTAL_LIMIT'),600000);
  const arm=()=>{clearTimeout(phaseTimer);phaseTimer=setTimeout(()=>kill('PHASE_LIMIT'),120000);};arm();
  child.on('message',m=>{if(m.phase){phase=m.phase;arm();console.log(JSON.stringify({phase}));}});
  child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
  child.on('error',e=>stderr.push(Buffer.from(String(e.stack))));
  const result=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,killed})));
  clearTimeout(totalTimer);clearTimeout(phaseTimer);clearTimeout(exitTimer);
  await fs.writeFile(path.join(out,'stdout.txt'),Buffer.concat(stdout));
  await fs.writeFile(path.join(out,'stderr.txt'),Buffer.concat(stderr));
  await fs.writeFile(path.join(out,'supervisor.json'),JSON.stringify({pid:child.pid,...result},null,2));
  console.log(JSON.stringify({out,...result}));
  if(result.code!==0||result.killed){process.stderr.write(Buffer.concat(stderr));process.exitCode=1;}
}else{
 const out=process.argv[3],directory=path.join(out,'world');
 const {startRuntimeServer}=await import('../runtime-server.mjs');
 const {loadServiceCommit}=await import('../runtime/service/service-commit.mjs');
 const {canonicalJson}=await import('../runtime/core/data-contract.mjs');
 let server=null,old=null,report;const steps=[];
 const phase=async(name,fn)=>{process.send?.({phase:name});const start=performance.now();const v=await fn();steps.push({name,wallMs:performance.now()-start});return v;};
 const read=async route=>{const r=await fetch(server.url+'/api/runtime/'+route,{signal:AbortSignal.timeout(120000)});assert.equal(r.status,200);return r.json();};
 const five=()=>Promise.all(routes.map(read));
 const hashes=async()=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(n=>n!=='.runtime-owner.lock').sort().map(async n=>[n,sha(await fs.readFile(path.join(directory,n)))])));
 try{
  await phase('fresh-open',async()=>{server=await startRuntimeServer({directory,profile:'scene-livelihood-village',seed:42,port:0,writable:true,inspectMind:true,inspectActivity:true});});
  const caps=await read('capabilities');assert.equal(caps.commandDtoVersion,4);
  const assets=['/runtime-presentation.mjs','/runtime-playback-state.mjs','/runtime-presentation.css','/runtime-art/stickman-engine.js','/runtime-art/stickart-core.js','/runtime-art/quad.js','/runtime-art/deep.js','/runtime-art/world-combat-fx.js'];
  for(const asset of assets){const r=await fetch(server.url+asset);assert.equal(r.status,200);assert.equal(r.headers.get('x-content-type-options'),'nosniff');const head=await fetch(server.url+asset,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),r.headers.get('content-length'));assert.equal((await head.text()).length,0);}
  assert.equal((await fetch(server.url+'/runtime-art/unknown.js')).status,404);
  assert.equal((await fetch(server.url+'/runtime-art/stickman-engine.js',{method:'POST'})).status,405);
  assert.equal((await fetch(server.url+'/runtime-art/stickman-engine.js',{headers:{Origin:'http://invalid.example'}})).status,403);
  await fs.writeFile(path.join(out,'endpoint.json'),JSON.stringify({url:server.url,directory,pid:process.pid}));
  // Browser reports boundaries; only this child's IPC phase announcements reset the parent timer.
  for(const boundary of ['gift','travel','begin','first-attack','second-attack','return']){
   await phase('browser-'+boundary,async()=>{
    for(;;){try{await fs.access(path.join(out,boundary+'.json'));break;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,100));}
   });
  }
  const final=await five(),activity=await read('activities');assert(final.every(v=>v.tick===36&&v.revision===38));
  assert.equal(final[1].self.health,920);assert.equal(final[1].self.inventory.food,19);assert.equal(final[1].self.identity.location,'village');
  assert.equal(final[3].encounter.resolution,'win');assert.equal(final[3].encounter.wolfHealth,0);
  const file=path.join(directory,'service-commit-r38.json'),envelope=await phase('full-file-audit',()=>loadServiceCommit(file));
  assert.equal(envelope.commands.length,6);assert.deepEqual(envelope.commands.map(e=>e.dto.type),['PlayerGiftFood','PlayerTravel','EncounterBegin','EncounterAction','EncounterAction','PlayerTravel']);
  const receipts=envelope.commands.map(e=>e.receipt);assert.equal(envelope.bundle.snapshot.world.playerModel.ledger.foodGiven,1);
  assert.equal(envelope.bundle.snapshot.world.ecologyModel.ledger.wolves.battleDeaths,1);
  const before=await hashes(),signature=sha(canonicalJson(final));
  await phase('close',async()=>{await server.close();server=null;});assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));
  await phase('reopen',async()=>{server=await startRuntimeServer({directory,port:0,writable:true,inspectMind:true,inspectActivity:true});});
  assert.deepEqual(await five(),final);assert.deepEqual(await read('activities'),activity);assert.deepEqual(await hashes(),before);
  for(const entry of envelope.commands){const r=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(entry.dto)});assert.equal(r.status,200);assert.deepEqual(await r.json(),entry.receipt);}
  assert.deepEqual(await hashes(),before);
  await fs.writeFile(path.join(out,'reopen-endpoint.json'),JSON.stringify({url:server.url}));
  await phase('browser-restored-read-only',async()=>{for(;;){try{await fs.access(path.join(out,'restored.json'));break;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,100));}});
  assert.deepEqual(await hashes(),before);await phase('reclose',async()=>{await server.close();server=null;});
  await phase('old-profile-read-only',async()=>{old=await startRuntimeServer({directory:path.join(out,'old-scene'),profile:'scene-survival-village',port:0,writable:false});const r=await fetch(old.url+'/api/runtime/capabilities');assert.equal((await r.json()).commandDtoVersion,3);for(const asset of assets)assert.equal((await fetch(old.url+asset)).status,200);await old.close();old=null;});
  report={verdict:'PASS',steps,environment:{node:process.version,platform:process.platform},projectionSignature:signature,hashes:before,receipts,final:{tick:36,revision:38,health:920,food:19,location:'village',wolfHealth:0,resolution:'win'},remainingLocks:[]};
 }catch(error){report={verdict:'FAIL',steps,error:{message:error.message,stack:error.stack,code:error.code}};process.exitCode=1;console.error(error.stack);}
 finally{if(server)await server.close();if(old)await old.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));}
}
