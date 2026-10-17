// Fresh synthetic-world browser acceptance. No original save access.
import {fork} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const script=fileURLToPath(import.meta.url), root=path.resolve(path.dirname(script),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const routes=['snapshot','map','player','encounter','scene'];
if(process.argv[2]!=='--child'){
  const resumeIndex=process.argv.indexOf('--resume'),resuming=resumeIndex>=0;
  const out=resuming?path.resolve(process.argv[resumeIndex+1]):path.join(root,'artifacts','d4e11-acceptance',new Date().toISOString().replace(/[:.]/g,'-'));
  assert(out.startsWith(path.join(root,'artifacts','d4e11-acceptance')+path.sep));
  if(!resuming){await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);}
  const grantIndex=process.argv.indexOf('--grant-id'),grant=grantIndex<0?'':process.argv[grantIndex+1];assert(!grant||/^[a-z0-9-]{1,64}$/.test(grant),'Invalid grant id');
  const authorizationFile=path.join(out,grant?`supplement-${grant}-authorized.json`:'supplement-authorized.json');
  const continuation=process.argv.includes('--continue-supplement');const supplement=process.argv.includes('--supplement')||continuation;assert(!supplement||resuming,'Supplement requires the existing run');
  if(supplement&&!continuation)await fs.writeFile(authorizationFile,JSON.stringify({authorized:true,totalLimitMs:300000,phaseLimitMs:120000,startedAt:new Date().toISOString()}),{flag:'wx'});
  const suffix=grant?`-supplement-${grant}`:continuation?'-supplement-continued':supplement?'-supplement':resuming?'-tail':'';
  const born=Date.parse(path.basename(out).replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,'T$1:$2:$3.$4Z'));
  if(continuation){const prior=JSON.parse(await fs.readFile(path.join(out,'result-supplement.json'),'utf8'));assert(prior.verdict==='FAIL'&&prior.error?.message==='fetch failed','Only the recorded checker failure may continue');}
  const remaining=supplement?300000-(Date.now()-Date.parse(JSON.parse(await fs.readFile(authorizationFile,'utf8')).startedAt)):600000-(Date.now()-born);assert(remaining>0,'Original browser budget is exhausted');
  const child=fork(script,['--child',out,...(resuming?['--resume-tail']:[]),...(supplement?['--supplement']:[]),...(continuation?['--continue-supplement']:[]),...(grant?['--grant-id',grant]:[])],{cwd:root,stdio:['ignore','pipe','pipe','ipc']});
  console.log(JSON.stringify({out,pid:child.pid,browser:process.argv.includes('--browser')}));
  const stdout=[],stderr=[];let phase='startup',killed=null,phaseTimer,exitTimer;
  const kill=reason=>{if(killed)return;killed={reason,phase};child.kill('SIGKILL');exitTimer=setTimeout(async()=>{
    await fs.writeFile(path.join(out,'unconfirmed-exit.json'),JSON.stringify({pid:child.pid,killed,unconfirmed:true}));
    console.error('Exit confirmation exceeded 5 seconds');process.exit(1);
  },5000);};
  const totalTimer=setTimeout(()=>kill('TOTAL_LIMIT'),remaining);
  const arm=()=>{clearTimeout(phaseTimer);phaseTimer=setTimeout(()=>kill('PHASE_LIMIT'),120000);};arm();
  child.on('message',m=>{if(m.phase){phase=m.phase;arm();console.log(JSON.stringify({phase}));}});
  child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
  child.on('error',e=>stderr.push(Buffer.from(String(e.stack))));
  const result=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,killed})));
  clearTimeout(totalTimer);clearTimeout(phaseTimer);clearTimeout(exitTimer);
  await fs.writeFile(path.join(out,'stdout'+suffix+'.txt'),Buffer.concat(stdout));
  await fs.writeFile(path.join(out,'stderr'+suffix+'.txt'),Buffer.concat(stderr));
  await fs.writeFile(path.join(out,'supervisor'+suffix+'.json'),JSON.stringify({pid:child.pid,...result},null,2));
  console.log(JSON.stringify({out,...result}));
  if(result.code!==0||result.killed){process.stderr.write(Buffer.concat(stderr));process.exitCode=1;}
}else{
 const out=process.argv[3],directory=path.join(out,'world'),tail=process.argv.includes('--resume-tail'),supplement=process.argv.includes('--supplement');
 const grantIndex=process.argv.indexOf('--grant-id'),grant=grantIndex<0?'':process.argv[grantIndex+1];
 const {startRuntimeServer}=await import('../runtime-server.mjs');
 const {loadServiceCommit}=await import('../runtime/service/service-commit.mjs');
 const {canonicalJson}=await import('../runtime/core/data-contract.mjs');
 let server,report;const steps=[];
 async function phase(name,run){process.send?.({phase:name});const start=performance.now();try{return await run();}finally{steps.push({name,ms:performance.now()-start});}}
 const read=async route=>{const r=await fetch(server.url+'/api/runtime/'+route,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);return r.json();};
 const five=()=>Promise.all(routes.map(read));
 const hashes=async()=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,sha(await fs.readFile(path.join(directory,f)))])));
 async function boundary(name){let revision=-1;await phase('browser-'+name,async()=>{for(;;){if(supplement&&name==='return'){const next=Math.max(...(await fs.readdir(directory)).map(f=>/^service-commit-r(\d+)\.json$/.exec(f)).filter(Boolean).map(m=>Number(m[1])));if(next!==revision){revision=next;process.send?.({phase:'return-confirmed-r'+revision});}}try{await fs.access(path.join(out,name+(grant&&['return','restored'].includes(name)?'-'+grant:'')+'.json'));break;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,100));}});return five();}
 try{
  await fs.mkdir(out,{recursive:true});
  await phase('initialize',async()=>{server=await startRuntimeServer(tail?{directory,port:Number(new URL(JSON.parse(await fs.readFile(path.join(out,'endpoint.json'),'utf8')).url).port),writable:true,inspectMind:false,inspectActivity:true}:{directory,profile:'campaign-village',seed:42,port:0,writable:true,inspectMind:false,inspectActivity:true});});
  assert.equal((await read('capabilities')).commandDtoVersion,5);
  await fs.writeFile(path.join(out,'endpoint.json'),JSON.stringify({url:server.url,directory,pid:process.pid}));
  let v; if(!tail){v=await boundary('gift');assert.equal(v[2].self.inventory.food,19);
  v=await boundary('set');assert.ok(v[1].order);
  v=await boundary('pause');assert.equal(v[1].order.status,'paused');assert.ok(v[1].self.x>4&&v[1].self.x<16);
  v=await boundary('replan');assert.deepEqual(v[1].order.target,{x:8,y:8});
  v=await boundary('contact');assert.equal(v[1].contact.actorId,'actor-2');assert.equal(v[1].order.status,'paused');assert.equal(v[1].actors.find(a=>a.actorId==='actor-2').receivedGifts.length,1);
  v=await boundary('forest');assert.equal(v[1].self.location,'forest');assert.equal(v[1].order.status,'arrived');
  v=await boundary('begin');assert.equal(v[3].encounter.status,'active');
  } v=await boundary('win');assert.equal(v[3].encounter.resolution,'win');assert.equal(v[3].encounter.wolfHealth,0);assert.equal(v[2].self.health,920);
  const final=await boundary('return');assert.equal(final[1].self.location,'village');assert.equal(final[1].order.status,'arrived');
  const file=path.join(directory,`service-commit-r${final[0].revision}.json`),envelope=await phase('full-file-audit',()=>loadServiceCommit(file));
  assert.equal(envelope.serviceFormatVersion,11);assert.ok(envelope.commands.some(e=>e.dto.type==='MarchPause'));assert.ok(envelope.commands.filter(e=>e.dto.type==='MarchSet').length>=3);
  const attacks=envelope.commands.filter(e=>e.dto.type==='EncounterAction');assert.equal(attacks.length,2);
  assert.deepEqual(attacks[0].receipt.result.turnEvents.map(e=>e.kind),['player-strike','wolf-counter']);assert.deepEqual(attacks[1].receipt.result.turnEvents.map(e=>e.kind),['player-strike','defeat']);
  const receipts=envelope.commands.map(e=>e.receipt),before=await hashes(),activity=await read('activities');
  await phase('close',async()=>{await server.close();server=null;});assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));
  await phase('reopen',async()=>{server=await startRuntimeServer({directory,port:0,writable:true,inspectMind:false,inspectActivity:true});});
  assert.deepEqual(await five(),final);assert.deepEqual(await read('activities'),activity);assert.deepEqual(await hashes(),before);
  const last=envelope.commands.at(-1);const retry=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(last.dto),signal:AbortSignal.timeout(15000)});assert.equal(retry.status,200);assert.deepEqual(await retry.json(),last.receipt);
  assert.deepEqual(await hashes(),before);
  await fs.writeFile(path.join(out,grant?'reopen-endpoint-'+grant+'.json':'reopen-endpoint.json'),JSON.stringify({url:server.url}));await boundary('restored');assert.deepEqual(await hashes(),before);
  await phase('reclose',async()=>{await server.close();server=null;});
  report={verdict:'PASS',environment:{node:process.version,platform:process.platform},steps,projectionSignature:sha(canonicalJson(final)),hashes:before,receipts,
    final:{tick:final[0].tick,revision:final[0].revision,position:final[1].self,order:final[1].order,health:final[2].self.health,food:final[2].self.inventory.food,resolution:final[3].encounter.resolution},commandCount:envelope.commands.length,remainingLocks:[]};
 }catch(error){report={verdict:'FAIL',steps,error:{message:error.message,stack:error.stack,code:error.code}};process.exitCode=1;console.error(error.stack);}
 finally{if(server)await server.close();await fs.writeFile(path.join(out,grant?`result-supplement-${grant}.json`:process.argv.includes('--continue-supplement')?'result-supplement-continued.json':supplement?'result-supplement.json':tail?'result-tail.json':'result.json'),JSON.stringify(report,null,2));}
}
