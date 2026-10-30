// Dedicated local Edge profile; CDP reads DOM and dispatches normal input only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {once} from 'node:events';
export const demoBrowserExecutable=()=>process.env.DEMO_BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export async function openDemoBrowser({directory,url,onEvent=()=>{},executable=demoBrowserExecutable()}){
 await fs.access(executable).catch(()=>{throw Object.assign(Error('Local browser executable is unavailable. Set DEMO_BROWSER_EXECUTABLE to an installed Edge/Chromium binary.'),{code:'BROWSER_UNAVAILABLE'});});
 const profile=path.join(directory,'edge-profile');await fs.mkdir(profile,{recursive:true});
 const log=await fs.open(path.join(directory,'edge.txt'),'wx');
 const edge=spawn(executable,[
  '--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',
  '--window-size=1460,1000','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore',log.fd,log.fd]});
 let socket,id=0,spawnFailure=null;const pending=new Map();let closed=false;
 edge.once('error',error=>{spawnFailure=error;});
 async function close(){
  if(closed)return;closed=true;
  if(socket?.readyState===1)try{await call('Browser.close',{},2000);}catch{}
  socket?.close();
  if(edge.pid&&edge.exitCode===null&&edge.signalCode===null)await Promise.race([once(edge,'exit'),delay(2500)]);
  if(edge.pid&&edge.exitCode===null&&edge.signalCode===null){
   if(process.platform==='win32'){const kill=spawn('taskkill',['/PID',String(edge.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await once(kill,'exit');}
   else edge.kill('SIGTERM');
   await Promise.race([once(edge,'exit'),delay(2500)]);
  }
  await log.close();for(const item of pending.values())item.reject(Error('Browser closed'));pending.clear();
 }
 function call(method,params={},timeout=10000){return new Promise((resolve,reject)=>{
  const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error('CDP timeout: '+method));},timeout);
  pending.set(next,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
  socket.send(JSON.stringify({id:next,method,params}));
 });}
 try{
  const start=performance.now();let port;
  while(performance.now()-start<30000){
   if(spawnFailure)throw Object.assign(Error('Cannot start the dedicated browser: '+spawnFailure.code),{code:'BROWSER_UNAVAILABLE'});
   if(edge.exitCode!==null)throw Error('Isolated Edge exited before CDP: '+edge.exitCode);
   try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await delay(100);}
  }
  if(!port)throw Error('Isolated Edge did not expose CDP within 30 seconds (pid '+edge.pid+')');
  const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==='page');
  socket=new WebSocket(page.webSocketDebuggerUrl);await once(socket,'open');
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id){const item=pending.get(value.id);if(item){pending.delete(value.id);value.error?item.reject(Error(value.error.message)):item.resolve(value.result);}}else onEvent(value);});
  await call('Page.enable');await call('Runtime.enable');await call('Log.enable');await call('Network.enable');await call('Page.navigate',{url});
  const read=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
  const click=async selector=>{
   const doc=await call('DOM.getDocument'),node=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector});
   if(!node.nodeId)throw Error('Missing button: '+selector);await call('DOM.scrollIntoViewIfNeeded',{nodeId:node.nodeId});
   const at=await read(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.hidden)return null;const r=n.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
   if(!at)throw Error('Button unavailable: '+selector);
   await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...at});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...at});
  };
  return{call,read,click,close,pid:edge.pid};
 }catch(error){await close();throw error;}
}
