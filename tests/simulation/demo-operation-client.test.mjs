import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoClient} from '../../demo-runtime-bridge.mjs';
import {createPlayableCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedServiceCommit,advanceAuditedServiceCommit} from '../../runtime/service/service-commit.mjs';
import {projectPublicSnapshot,projectMapSnapshot,projectPlayerSnapshot,projectEncounterSnapshot,projectSceneSnapshot} from '../../runtime/service/http-contract.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function environment(t){
 const keys=['fetch','EventSource','sessionStorage','document','window','navigator','setInterval','clearInterval','performance'],saved=keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 t.after(()=>{for(const [key,d]of saved)if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];});
 const storage=new Map(),jobs=new Map(),events={},windowEvents={},beacons=[];let source,clock=0,id=0;
 const set=(k,v)=>Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 set('document',{hidden:false,addEventListener(k,fn){events[k]=fn;}});set('window',{addEventListener(k,fn){windowEvents[k]=fn;}});
 set('navigator',{sendBeacon(...v){beacons.push(v);return true;}});set('performance',{now:()=>clock});
 set('setInterval',fn=>{jobs.set(++id,fn);return id;});set('clearInterval',i=>jobs.delete(i));
 set('sessionStorage',{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});
 set('EventSource',class{constructor(){source=this;}close(){}});
 return {jobs,storage,beacons,connect:g=>source.onmessage({data:JSON.stringify(g)}),error:()=>source.onerror(),advance(ms){clock+=ms;for(const fn of [...jobs.values()])fn();},hide(){document.hidden=true;events.visibilitychange();},show(){document.hidden=false;events.visibilitychange();},leave(){windowEvents.pagehide();}};
}
function fixture(){
 const {bundle}=createPlayableCampaignVillage(42,'feedback-client');const anchor=createAuditedServiceCommit({serviceFormatVersion:11,anchor:bundle,commands:[],bundle});
 const group=b=>({apiVersion:1,capabilities:{apiVersion:1,commandDtoVersion:5,continuousMarch:true,encounterAvailable:true,mapAvailable:true,playerAvailable:true,sceneAvailable:true,writes:true},snapshot:projectPublicSnapshot(b),map:projectMapSnapshot(b,512-b.snapshot.world.encounterModel.inputHistory.length),player:projectPlayerSnapshot(b),encounter:projectEncounterSnapshot(b),scene:projectSceneSnapshot(b),runner:{active:false}});
 return {anchor,group,initial:group(anchor.bundle)};
}
test('delayed POST, refresh and presentation retain one request, show distinct phases, and never advance time from display ticks',async t=>{
 const env=environment(t),f=fixture(),opening=deferred(),posting=deferred(),reading=deferred(),presenting=deferred(),progress=[],statuses=[],requests=[];let after,getCount=0;
 globalThis.fetch=async(url,options={})=>{
  requests.push({url,body:options.body});if(options.method==='POST'){after=advanceAuditedServiceCommit(f.anchor,JSON.parse(options.body));return posting.promise;}
  return ++getCount===1?opening.promise:reading.promise;
 };
 const client=createDemoClient({onState(){},onStatus:s=>statuses.push(s),onProgress:p=>progress.push(p),onReceipt:()=>presenting.promise});
 const start=client.start();assert.equal(progress.at(-1).phase,'connect');env.advance(5000);assert.equal(progress.at(-1).elapsedSeconds,5);assert.equal(requests.length,1);
 opening.resolve(Response.json(f.initial));await start;assert.equal(env.jobs.size,0);env.connect(f.initial);
 const command=client.submit('AdvanceTime',{ticks:1});assert.equal(progress.at(-1).phase,'confirm');assert.equal(client.state().busy,true);
 env.advance(45000);assert.equal(client.getGroup().map.tick,0);assert.equal(requests.length,2);assert.equal(progress.at(-1).elapsedSeconds,45);
 env.connect(f.group(after.bundle));assert.equal(client.state().pending,true);assert.equal(client.state().canRetry,false);assert.match(statuses.at(-1),/正在确认/);
 await assert.rejects(client.submit('AdvanceTime',{ticks:1}));assert.equal(requests.length,2);
 posting.resolve(Response.json(after.commands.at(-1).receipt));await turn();assert.equal(progress.at(-1).phase,'refresh');assert.match(statuses.at(-1),/已收到回执/);
 env.error();assert.match(statuses.at(-1),/已收到回执/);assert.doesNotMatch(statuses.at(-1),/原请求仍在确认/);env.connect(f.group(after.bundle));
 reading.resolve(Response.json(f.group(after.bundle)));await turn();assert.equal(progress.at(-1).phase,'present');assert.equal(client.state().pending,true);
 presenting.resolve();await command;assert.equal(env.jobs.size,0);assert.equal(progress.at(-1).active,false);assert.equal(client.state().pending,false);assert.equal(env.storage.size,0);assert.equal(client.getGroup().map.tick,1);assert.equal(requests.length,3);
});
test('lost responses clear display timers while retry reuses the exact durable intent and receipt',async t=>{
 const env=environment(t),f=fixture(),progress=[],posts=[];let after;
 globalThis.fetch=async(url,options={})=>{
  if(options.method==='POST'){
   posts.push(options.body);if(posts.length===1){after=advanceAuditedServiceCommit(f.anchor,JSON.parse(options.body));throw new TypeError('lost after commit');}
   assert.equal(options.body,posts[0]);return Response.json(after.commands.at(-1).receipt);
  }return Response.json(after?f.group(after.bundle):f.initial);
 };
 const client=createDemoClient({onState(){},onStatus(){},onProgress:p=>progress.push(p),onReceipt(){}});await client.start();env.connect(f.initial);
 await assert.rejects(client.submit('AdvanceTime',{ticks:1}),/lost after commit/);assert.equal(client.state().canRetry,true);assert.equal(env.jobs.size,0);assert.equal(progress.at(-1).active,false);
 env.advance(60000);assert.equal(posts.length,1);await client.retry();assert.equal(posts.length,2);assert.equal(client.getGroup().map.tick,1);assert.equal(env.jobs.size,0);assert.equal(client.state().pending,false);
});
test('visibility and page exit release display intervals without clearing unresolved requests; startup failure also cleans up',async t=>{
 const env=environment(t),f=fixture(),posting=deferred(),progress=[];let postCount=0;
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){postCount++;return posting.promise;}return Response.json(f.initial);};
 const client=createDemoClient({onState(){},onStatus(){},onProgress:p=>progress.push(p),onReceipt(){}});await client.start();env.connect(f.initial);
 const command=client.submit('AdvanceTime',{ticks:1});assert.equal(env.jobs.size,1);env.hide();assert.equal(env.jobs.size,0);env.advance(8000);assert.equal(client.state().pending,true);
 env.show();assert.equal(env.jobs.size,1);assert.equal(progress.at(-1).elapsedSeconds,8);env.leave();assert.equal(env.jobs.size,0);assert.equal(env.storage.size,1);assert.equal(postCount,1);
 posting.reject(new TypeError('closed'));await assert.rejects(command,/closed/);assert.equal(env.jobs.size,0);assert.equal(env.storage.size,1);
 globalThis.fetch=async()=>{throw Error('not ready');};const other=createDemoClient({onState(){},onStatus(){},onProgress:p=>progress.push(p),onReceipt(){}});await assert.rejects(other.start(),/not ready/);assert.equal(env.jobs.size,0);assert.equal(progress.at(-1).active,false);
});
