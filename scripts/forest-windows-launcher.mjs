import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const url='http://127.0.0.1:18356';

async function start(entry,directory){
 if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Launcher verification requires an isolated Windows Actions runner');
 try{await fs.lstat(path.join(root,'.env'));throw Error('Launcher verification requires a checkout without a .env file');}
 catch(error){if(error.code!=='ENOENT')throw error;}

 const child=spawn('cmd.exe',['/d','/c',entry],{cwd:root,windowsHide:true,
  stdio:['pipe','pipe','pipe'],env:{...process.env,FOREST_SAVE_DIR:directory,NPC_LLM_ENABLED:'false',NPC_LLM_API_KEY:''}});
 let stdout='',stderr='',exit=null,spawnError=null,stdinError=null,closePromise;
 child.stdout.setEncoding('utf8').on('data',chunk=>{stdout=(stdout+chunk).slice(-8192);});
 child.stderr.setEncoding('utf8').on('data',chunk=>{stderr=(stderr+chunk).slice(-8192);});
 child.on('error',error=>{spawnError=error;});
 child.stdin.on('error',error=>{stdinError=error;});
 child.once('close',(code,signal)=>{exit={code,signal};});

 function fail(label){
  const diagnostic=(spawnError?.message??stdinError?.message??stderr.trim())||stdout.trim();
  return Error(label+(exit?' (exit '+(exit.code??exit.signal)+')':'')+(diagnostic?'\n'+diagnostic:''));
 }
 async function waitFor(check,label){
  const end=performance.now()+60000;
  while(performance.now()<end){
   if(check())return;
   if(exit||spawnError||stdinError||/^ERROR /mu.test(stderr))break;
   await delay(50);
  }
  throw fail(label);
 }
 async function terminate(){
  if(exit||!child.pid)return;
  spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});
  const end=performance.now()+3000;
  while(!exit&&performance.now()<end)await delay(50);
  if(!exit)throw fail('Could not clean up the acceptance launcher process tree');
 }
 async function stop(){
  try{
   child.stdin.end('quit\r\n');
   await waitFor(()=>exit,'Launcher did not exit after quit');
   if(exit.code!==0||!stdout.includes('{"status":"stopped"}'))throw fail('Launcher shutdown was not clean');
  }catch(error){await terminate();throw error;}
 }
 try{
  await waitFor(()=>stdout.includes(JSON.stringify({status:'ready',url,writes:true})),'Launcher did not report ready');
  return Object.freeze({url,close(){return closePromise??=stop();}});
 }catch(error){await terminate();throw error;}
}

export const startForestWindowsLauncher=directory=>start('Start-Forest-Journey.cmd',directory);

// Only used after the acceptance runner exclusively creates this synthetic slot root.
export async function startForestWindowsNewLauncher(previousDirectory){
 const slots=path.join(root,'artifacts','forest-village');
 const before=await fs.readdir(slots);
 const server=await start('Start-Forest-Journey-New.cmd',previousDirectory);
 try{
  const added=(await fs.readdir(slots)).filter(name=>!before.includes(name));
  if(added.length!==1||!/^slot-\d+-\d+$/u.test(added[0]))throw Error('New journey must create exactly one independent slot');
  const directory=path.join(slots,added[0],'world');
  if(!(await fs.stat(directory)).isDirectory())throw Error('New journey did not create a world directory');
  return Object.freeze({...server,directory});
 }catch(error){await server.close();throw error;}
}
