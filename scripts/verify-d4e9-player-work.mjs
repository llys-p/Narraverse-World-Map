// Bounded fresh-world acceptance. Never opens or copies an existing user's save.
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
  const out=path.join(root,'artifacts','d4e9-acceptance',new Date().toISOString().replace(/[:.]/g,'-'));
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
  const {canonicalJson}=await import('../runtime/core/data-contract.mjs');
  const {loadServiceCommit}=await import('../runtime/service/service-commit.mjs');
  const steps=[];let server=null,legacy=null;
  const step=async(name,fn)=>{
    process.send?.({phase:name});const start=performance.now(),cpu=process.cpuUsage();
    const result=await fn();steps.push({name,wallMs:performance.now()-start,cpu:process.cpuUsage(cpu)});return result;
  };
  const get=async(name,base=server.url)=>{const response=await fetch(`${base}/api/runtime/${name}`,{signal:AbortSignal.timeout(120000)});assert.equal(response.status,200,name);return response.json();};
  const post=async(dto,base=server.url)=>{
    const response=await fetch(`${base}/api/runtime/commands`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(dto),signal:AbortSignal.timeout(120000)});
    return {status:response.status,body:await response.json()};
  };
  const five=()=>Promise.all(routes.map(route=>get(route)));
  const fileHashes=async(dir)=>Object.fromEntries(await Promise.all((await fs.readdir(dir)).filter(n=>n!=='\.runtime-owner.lock').sort().map(async n=>[n,sha(await fs.readFile(path.join(dir,n)))])));
  let report;
  try{
    await step('fresh-open',async()=>{server=await startRuntimeServer({directory,profile:'scene-livelihood-village',seed:42,port:0,writable:true,inspectMind:true,inspectActivity:true});});
    const caps=await get('capabilities');assert.equal(caps.commandDtoVersion,4);assert.equal(caps.playerWorkAvailable,true);
    const initial=await five();assert(initial.every(p=>p.tick===0&&p.revision===0));
    assert.equal(initial[1].self.wallet,0);assert.equal(initial[1].self.inventory.food,20);
    assert.deepEqual(initial[1].actions.work,{wage:20,durationTicks:36,fatigueCost:150,nextWorkTick:null});
    let work={version:4,commandId:'d4e9-work',expectedRevision:0,type:'PlayerWork',payload:{}};
    const beforeInvalid=await fileHashes(directory);
    for(const bad of [{...work,version:3},{...work,payload:{wage:2000}},{...work,extra:true}]){
      const r=await post(bad);assert.equal(r.status,400);assert.deepEqual(await fileHashes(directory),beforeInvalid);
    }
    let worked,bought;
    if(process.argv.includes('--browser')){
      await fs.writeFile(path.join(out,'endpoint.json'),JSON.stringify({url:server.url,directory,pid:process.pid}));
      await step('browser-work-and-buy',async()=>{
        for(;;){try{await fs.access(path.join(out,'browser-done.json'));break;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,100));}
      });
      const files=(await fs.readdir(directory)).filter(n=>/^service-commit-r[0-9]+\.json$/.test(n)).sort((a,b)=>Number(b.match(/r(\d+)/)[1])-Number(a.match(/r(\d+)/)[1]));
      const saved=await loadServiceCommit(path.join(directory,files[0]));assert.equal(saved.commands.length,2);
      const [w,b]=saved.commands;work=w.dto;worked={status:200,body:w.receipt};bought={status:200,body:b.receipt};
      assert.equal(work.type,'PlayerWork');assert.equal(work.version,4);assert.equal(work.expectedRevision,0);assert.deepEqual(work.payload,{});
      assert.equal(b.dto.type,'PlayerBuy');assert.deepEqual(b.dto.payload,{product:'food',quantity:2});assert.equal(b.dto.version,4);
    }else worked=await step('work',()=>post(work));
    assert.equal(worked.status,200);assert.equal(worked.body.receiptVersion,4);assert.equal(worked.body.outcome,'succeeded');
    assert.equal(worked.body.tick,36);assert.equal(worked.body.result.wage,20);
    assert.equal(worked.body.result.after.wallet-worked.body.result.before.wallet,20);
    assert.equal(worked.body.result.after.fatigue-worked.body.result.before.fatigue,150);
    const afterWorkHashes=await fileHashes(directory);assert.deepEqual((await post(work)).body,worked.body);assert.deepEqual(await fileHashes(directory),afterWorkHashes);
    if(!bought){const buy={version:4,commandId:'d4e9-buy',expectedRevision:worked.body.toRevision,type:'PlayerBuy',payload:{product:'food',quantity:2}};bought=await step('buy-two-food',()=>post(buy));}
    assert.equal(bought.status,200);assert.equal(bought.body.outcome,'succeeded');assert.equal(bought.body.tick,37);
    const day={version:4,commandId:'d4e9-day',expectedRevision:bought.body.toRevision,type:'AdvanceTime',payload:{ticks:107}};
    const advanced=await step('one-day',()=>post(day));assert.equal(advanced.status,200);assert.equal(advanced.body.outcome,'succeeded');assert.equal(advanced.body.tick,144);
    const final=await five();assert(final.every(p=>p.tick===144&&p.revision===advanced.body.toRevision));
    assert.equal(final[1].self.wallet,0);assert.equal(final[1].self.inventory.food,21);
    const activities=await get('activities');
    const workRows=activities.entries.filter(e=>e.kind==='player-action'&&e.summary.includes('工作'));
    assert.equal(workRows.length,1);assert.equal(workRows[0].location,'village');
    const latest=path.join(directory,`service-commit-r${advanced.body.toRevision}.json`);
    const envelope=await step('full-disk-audit',()=>loadServiceCommit(latest));
    const p=envelope.bundle.snapshot.world.playerModel;
    assert.equal(envelope.serviceFormatVersion,10);assert.equal(p.version,'player-state-v4');
    assert.equal(p.ledger.wages,20);assert.equal(p.ledger.workCount,1);assert.equal(p.ledger.spent,20);
    assert.equal(p.ledger.foodBought,2);assert.equal(p.ledger.foodUsed,1);assert.equal(p.lastWorkStartTick,0);
    assert.equal(envelope.bundle.eventLog.filter(e=>e.type==='PlayerWorkCommitted').length,1);
    assert.equal(envelope.bundle.eventLog.filter(e=>e.type==='PlayerDaySettled').length,1);
    assert.equal(envelope.commands.length,3);
    const hashes=await fileHashes(directory),projectionSignature=sha(canonicalJson(final));
    await step('close',async()=>{await server.close();server=null;});assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));
    await step('reopen',async()=>{server=await startRuntimeServer({directory,port:0,writable:true,inspectMind:true,inspectActivity:true});});
    assert.deepEqual(await five(),final);assert.deepEqual(await get('activities'),activities);
    assert.deepEqual((await post(work)).body,worked.body);assert.deepEqual(await fileHashes(directory),hashes);
    const changedId=await post({...work,expectedRevision:advanced.body.toRevision});assert.equal(changedId.status,409);
    assert.deepEqual(await fileHashes(directory),hashes);
    await step('reclose',async()=>{await server.close();server=null;});
    assert(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));
    await step('legacy-profile-isolation',async()=>{
      const oldDir=path.join(out,'old-scene');legacy=await startRuntimeServer({directory:oldDir,profile:'scene-survival-village',seed:42,port:0,writable:true});
      const oldCaps=await get('capabilities',legacy.url);assert.equal(oldCaps.commandDtoVersion,3);assert.equal(Object.hasOwn(oldCaps,'playerWorkAvailable'),false);
      const before=await fileHashes(oldDir);assert.equal((await post({...work,version:3},legacy.url)).status,400);assert.equal((await post(work,legacy.url)).status,400);
      assert.deepEqual(await fileHashes(oldDir),before);await legacy.close();legacy=null;assert(!(await fs.readdir(oldDir)).includes('.runtime-owner.lock'));
    });
    report={verdict:'PASS',environment:{node:process.version,platform:process.platform,arch:process.arch},steps,projectionSignature,hashes,receipts:{work:worked.body,buy:bought.body,day:advanced.body},finalPlayer:p,originalSaveAccess:false,remainingLocks:[],scope:'fresh income chain plus isolated legacy rejection; no performance acceptance'};
    console.log(JSON.stringify({verdict:'PASS',projectionSignature,steps}));
  }catch(error){report={verdict:'FAIL',steps,error:{message:error.message,stack:error.stack,code:error.code}};process.exitCode=1;console.error(error.stack);}
  finally{
    if(server)await server.close();if(legacy)await legacy.close();
    await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));
  }
}
