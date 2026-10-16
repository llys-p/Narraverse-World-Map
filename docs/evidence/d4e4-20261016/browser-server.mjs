import {spawn} from 'node:child_process';
import {writeFileSync,appendFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='artifacts/d4e4-controller-20261016',restore=process.argv.includes('--restore'),label=restore?'reopen':'first';
const args=['runtime-server.mjs','--data-dir',resolve(root,'world'),'--port','18328','--writable','true','--inspect-mind','false','--inspect-activity','true',...(restore?[]:['--profile','scene-survival-village','--seed','42'])];
assert(!existsSync(`${root}/${label}-process.json`));
const child=spawn(process.execPath,args,{stdio:['pipe','pipe','pipe'],windowsHide:true}),started=Date.now();
writeFileSync(`${root}/${label}-process.json`,JSON.stringify({pid:child.pid,args,hardLimitMs:600000}));
let prepared=false,buffer='',forced,timedOut=false;
const timer=setTimeout(()=>{timedOut=true;console.error('TEST_HARD_LIMIT');child.stdin.write('quit\n');forced=setTimeout(()=>child.kill('SIGKILL'),5000);},600000);
process.stdin.pipe(child.stdin);child.stdin.on('error',()=>{});
const hash=x=>createHash('sha256').update(x).digest('hex');
async function prepare(){
 if(!restore){
  for(const dto of [{version:3,commandId:'activity-review-rejected-begin',expectedRevision:0,type:'EncounterBegin',payload:{}},{version:3,commandId:'activity-review-gift',expectedRevision:1,type:'PlayerGiftFood',payload:{recipientId:'actor-2'}}]){
   const response=await fetch('http://127.0.0.1:18328/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto),signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.outcome,dto.type==='EncounterBegin'?'rejected':'succeeded');
  }
 }
 const raw=await (await fetch('http://127.0.0.1:18328/api/runtime/activities',{signal:AbortSignal.timeout(10000)})).text();const activity=JSON.parse(raw);
 assert.equal(activity.revision,2);assert.equal(activity.tick,0);assert.equal(activity.entries.length,2);assert.equal(activity.entries[0].status,'rejected');assert.equal(activity.entries[0].location,null);assert.equal(activity.entries[1].kind,'gift');assert.equal(activity.entries[1].location,'village');
 const proof={revision:activity.revision,tick:activity.tick,entryCount:activity.entries.length,activitySha256:hash(raw),rejectedLocationUnknown:true,giftNotDuplicated:true,actor2GiftVisible:activity.entries[1].actorIds.includes('actor-2')};
 if(restore)assert.deepEqual(proof,JSON.parse(readFileSync(`${root}/first-activity-proof.json`,'utf8')));
 writeFileSync(`${root}/${label}-activity-proof.json`,JSON.stringify(proof,null,2));console.log('BROWSER_READY '+JSON.stringify(proof));
}
child.stdout.on('data',x=>{process.stdout.write(x);appendFileSync(`${root}/${label}-stdout.txt`,x);buffer+=x;if(!prepared&&buffer.includes('"status":"ready"')){prepared=true;prepare().catch(error=>{console.error(error);child.stdin.write('quit\n');process.exitCode=1;});}});
child.stderr.on('data',x=>{process.stderr.write(x);appendFileSync(`${root}/${label}-stderr.txt`,x);});
child.on('exit',(code,signal)=>{clearTimeout(timer);clearTimeout(forced);writeFileSync(`${root}/${label}-exit.json`,JSON.stringify({pid:child.pid,code,signal,timedOut,wallMs:Date.now()-started}));process.exit(process.exitCode||(code===0&&signal===null&&!timedOut?0:1));});
