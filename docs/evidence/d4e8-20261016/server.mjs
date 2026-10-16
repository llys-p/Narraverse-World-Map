import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out='artifacts/d4e8-20261016',world=resolve(`${out}/world`),label=process.argv.includes('--reopen')?'reopen':'first';
assert(!existsSync(`${out}/${label}-process.json`));assert.equal(existsSync(world),label==='reopen');
const args=['runtime-server.mjs','--data-dir',world,'--port','18334',...(label==='first'?['--profile','scene-survival-village','--seed','42']:[]),'--writable','true','--inspect-mind','false','--inspect-activity','true'];
const child=spawn(process.execPath,args,{stdio:['pipe','pipe','pipe'],windowsHide:true}),started=Date.now(),phases=[];
writeFileSync(`${out}/${label}-process.json`,JSON.stringify({pid:child.pid,args,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hardLimitMs:600000,phaseLimitMs:120000,startedUtc:new Date().toISOString()}));
let phaseTimer,forceTimer,timedOut=false,readyBuffer='';
function stop(reason){if(timedOut)return;timedOut=true;phases.push({timeout:reason,at:new Date().toISOString()});child.stdin.write('quit\n');forceTimer=setTimeout(()=>child.kill('SIGKILL'),5000);}
function phase(name){clearTimeout(phaseTimer);phases.push({phase:name,at:new Date().toISOString()});if(name!=='done')phaseTimer=setTimeout(()=>stop(name),120000);}
const totalTimer=setTimeout(()=>stop('TOTAL_LIMIT'),600000);phase('startup');
const input=createInterface({input:process.stdin});input.on('line',line=>{if(line.startsWith('phase '))phase(line.slice(6));else if(line==='quit'){phase('done');child.stdin.write('quit\n');}});
child.stdin.on('error',()=>{});
child.stdout.on('data',x=>{process.stdout.write(x);appendFileSync(`${out}/${label}-stdout.txt`,x);readyBuffer+=x.toString();if(readyBuffer.includes('"status":"ready"')){phase('done');readyBuffer='';}});
child.stderr.on('data',x=>{process.stderr.write(x);appendFileSync(`${out}/${label}-stderr.txt`,x);});
child.on('exit',(code,signal)=>{clearTimeout(totalTimer);clearTimeout(phaseTimer);clearTimeout(forceTimer);input.close();writeFileSync(`${out}/${label}-exit.json`,JSON.stringify({pid:child.pid,code,signal,timedOut,wallMs:Date.now()-started,phases}));process.exit(code===0&&signal===null&&!timedOut?0:1);});
