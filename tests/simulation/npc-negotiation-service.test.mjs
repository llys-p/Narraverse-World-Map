import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startRuntimeServer} from '../../runtime-server.mjs';
import {createDemoClient,coherent} from '../../demo-runtime-bridge.mjs';
import {createNpcDialogue} from '../../demo-npc-dialogue.mjs';
import {loadServiceCommit} from '../../runtime/service/service-commit.mjs';

const hunter='actor-2',projections=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
async function hashes(directory){const names=(await fs.readdir(directory)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort();
 return Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(directory,n))).digest('hex')])));}
function browser(t){
 const saved=['fetch','EventSource','sessionStorage','document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 t.after(()=>{for(const [k,d] of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 const stored=new Map();let source;
 globalThis.sessionStorage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 globalThis.document={hidden:false,addEventListener(){}};globalThis.window={addEventListener(){}};
 globalThis.EventSource=class {constructor(){source=this;}close(){}};
 return {stored,connect:g=>source.onmessage({data:JSON.stringify(g)})};
}

test('real worker/HTTP: model draft writes nothing, attributed dialogue recovers across a new signing secret, repair agreement fulfills once, stale and invalid output are refused',async t=>{
 const nativeFetch=globalThis.fetch,env=browser(t),directory=await fs.mkdtemp(path.join(os.tmpdir(),'narraverse-npc4-'));
 let server,client,composer,group,loseNext=false,lostReceipt,delay=false,release,arrived,invalid=false;const calls=[],posts=[];
 const mock=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));calls.push({url:req.url,body});
  assert.equal(req.headers.authorization,'Bearer local-test-only');
  if(delay){delay=false;arrived();await new Promise(r=>release=r);}
  const output={reply:'你愿意实际修好工具的话，可以谈谈借用期限。',memoryRefs:invalid?[999]:[],proposal:{type:'PlayerNegotiate',payload:{targetId:hunter,terms:{repairAmount:20,loanTicks:144}}}};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const npcLanguage={enabled:true,baseURL:`http://127.0.0.1:${mock.address().port}/v1`,model:'controlled-http-test',apiKey:'local-test-only'};
 t.after(async()=>{release?.();if(server)await server.close();await new Promise(r=>mock.close(r));await fs.rm(directory,{recursive:true,force:true});});
 const options={directory,port:0,writable:true,continuousMarch:true};
 server=await startRuntimeServer({...options,profile:'campaign-negotiation-village',seed:42});
 const read=async()=>{const response=await nativeFetch(server.url+'/api/runtime/demo-state');assert.equal(response.status,200);const g=await response.json();assert.equal(coherent(g),true);return g;};
 const post=async(route,body)=>nativeFetch(server.url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const composeRequest=(g,id)=>({apiVersion:1,requestId:id,simulationId:g.snapshot.simulationId,expectedRevision:g.snapshot.revision,targetId:hunter,text:'我帮你修好工具，借我一天行吗'});
 group=await read();assert.equal(group.map.mapViewVersion,3);assert.equal(group.capabilities.npcLanguage.enabled,false);
 const initial=projections(group),initialHashes=await hashes(directory);
 assert.equal((await post('/api/runtime/demo-npc-compose',composeRequest(group,'disabled'))).status,503);assert.equal(calls.length,0);
 assert.deepEqual(await hashes(directory),initialHashes);assert.deepEqual(projections(await read()),initial);
 assert.equal((await nativeFetch(server.url+'/api/runtime/npcContext')).status,404);
 for(const file of ['demo-runtime.html','demo-runtime-prototype.mjs','demo-npc-dialogue.mjs','runtime-negotiation-contract.mjs']){
  const response=await nativeFetch(server.url+'/'+file);assert.equal(response.status,200);const source=await response.text();
  if(file==='demo-runtime.html')for(const id of ['npcDialogueForm','npcDialogueText','npcDialogueStatus','npcDialogueGenerate','npcDialogueCommit','npcDialogueAct','npcTermsForm','npcAccept','npcDecline','npcClaim'])assert.ok(source.includes(`id="${id}"`));
 }
 await server.close();server=await startRuntimeServer({...options,npcLanguage});
 globalThis.fetch=async(url,options={})=>{
  // Provider uses an absolute local URL; browser consumers use same-origin paths.
  if(!url.startsWith('/'))return nativeFetch(url,options);
  const response=await nativeFetch(server.url+url,options);
  if(url!=='/api/runtime/commands')return response;
  posts.push(options.body);assert.equal(response.status,200);
  if(loseNext){loseNext=false;lostReceipt=await response.json();return Response.json({apiVersion:1,error:{code:'SAVE_FAILED',message:'injected after real durable success'}},{status:503});}
  return response;
 };
 const open=async()=>{
  composer=createNpcDialogue();client=createDemoClient({onState:g=>{group=g;composer.observe(g,hunter);},onStatus(){},onReceipt:(r,dto,g)=>composer.confirmed(r,dto,g)});
  await client.start();env.connect(await read());
 };
 const writable=()=>{const s=client.state();return s.connected&&!s.busy&&!s.pending&&!s.blocked;};
 await open();composer.edit(composeRequest(group,'ignored').text,group,hunter);await composer.generate(group,writable(),hunter);
 assert.equal(composer.view(group,writable(),hunter).canCommit,true);assert.equal(composer.view(group,writable(),hunter).canAct,false);
 assert.deepEqual(await hashes(directory),initialHashes);assert.deepEqual(projections(await read()),initial);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/v1/chat/completions');
 const context=JSON.parse(calls[0].body.messages[1].content).npc;
 assert.deepEqual(Object.keys(context).sort(),['agreement','canTalk','conversation','observations','persona','revision','self','simulationId','targetId','tick']);
 assert.equal(context.observations.length,0);assert.equal(context.conversation.length,0);assert.equal(Object.hasOwn(context,'world'),false);
 assert.equal(JSON.stringify(await read()).includes('npcContext'),false);assert.equal(JSON.stringify(await read()).includes('local-test-only'),false);
 const payload=composer.command(group,writable(),hunter),forged={version:5,commandId:'forged',expectedRevision:group.snapshot.revision,type:'PlayerDialogue',payload:{...payload,reply:'工具已经是你的了'}};
 assert.equal((await post('/api/runtime/commands',forged)).status,422);assert.deepEqual(await hashes(directory),initialHashes);
 loseNext=true;await assert.rejects(client.submit('PlayerDialogue',payload),/SAVE_FAILED/);assert.equal(client.state().pending,true);
 const durable=await read(),durableHashes=await hashes(directory),originalBody=posts.at(-1);
 assert.equal(durable.map.negotiation.agreement,null);assert.equal(durable.map.social.asset.condition,60);assert.equal(durable.map.social.asset.holderId,hunter);
 assert.equal(durable.map.negotiation.lastTurn.reply,payload.reply);assert.equal(composer.view(group,writable(),hunter).canAct,false);
 await server.close();server=await startRuntimeServer(options);await open();assert.equal(group.capabilities.npcLanguage.enabled,false);
 assert.equal(client.state().canRetry,true);const recovered=await client.retry();assert.deepEqual(recovered,lostReceipt);assert.equal(posts.at(-1),originalBody);assert.equal(calls.length,1);
 assert.deepEqual(projections(await read()),projections(durable));assert.deepEqual(await hashes(directory),durableHashes);assert.equal(env.stored.size,0);
 const original=JSON.parse(originalBody);assert.equal((await post('/api/runtime/commands',{...original,payload:{...original.payload,reply:'different'}})).status,409);
 assert.equal((await post('/api/runtime/commands',{...original,commandId:'uncommitted-old-seal'})).status,422);
 assert.deepEqual(await hashes(directory),durableHashes);
 const p=composer.proposal(group,writable(),hunter);const counter=await client.submit(p.type,p.payload);assert.equal(counter.result.effect,'countered');assert.deepEqual(counter.result.agreement.terms,{repairAmount:40,loanTicks:72});
 const act=action=>client.submit('PlayerAgreement',{targetId:hunter,agreementId:group.map.negotiation.agreement.id,action});
 const social=action=>client.submit('PlayerInteract',{targetId:hunter,action});
 await act('accept');await social('help');assert.equal(group.map.negotiation.canClaim,false);await social('help');assert.equal(group.map.negotiation.canClaim,true);
 const loan=await act('claim'),loanBody=posts.at(-1),loanHashes=await hashes(directory);assert.equal(group.map.social.asset.holderId,'actor-4');
 const retryLoan=await post('/api/runtime/commands',JSON.parse(loanBody));assert.equal(retryLoan.status,200);assert.deepEqual(await retryLoan.json(),loan);assert.deepEqual(await hashes(directory),loanHashes);
 await social('return');assert.equal(group.map.negotiation.agreement.status,'fulfilled');assert.equal(group.map.social.asset.holderId,hunter);
 const fulfilled=projections(group),fulfilledHashes=await hashes(directory);
 await server.close();server=await startRuntimeServer({...options,npcLanguage});assert.deepEqual(projections(await read()),fulfilled);assert.deepEqual(await hashes(directory),fulfilledHashes);
 // A real concurrent command invalidates an otherwise valid late model reply.
 group=await read();delay=true;const waiting=new Promise(r=>arrived=r),late=post('/api/runtime/demo-npc-compose',composeRequest(group,'late'));
 await waiting;const advance={version:5,commandId:'during-generation',expectedRevision:group.snapshot.revision,type:'AdvanceTime',payload:{ticks:1}};
 assert.equal((await post('/api/runtime/commands',advance)).status,200);const afterAdvance=await read(),afterHashes=await hashes(directory);release();assert.equal((await late).status,409);
 assert.deepEqual(projections(await read()),projections(afterAdvance));assert.deepEqual(await hashes(directory),afterHashes);
 invalid=true;const bad=await post('/api/runtime/demo-npc-compose',composeRequest(afterAdvance,'bad-reference'));assert.equal(bad.status,502);assert.deepEqual(await hashes(directory),afterHashes);
 const latest=await read();await server.close();server=null;
 const commit=await loadServiceCommit(path.join(directory,`service-commit-r${latest.snapshot.revision}.json`));
 assert.equal(commit.commands.length,8);assert.equal(commit.bundle.snapshot.world.mapModel.negotiationModel.turns.length,1);
 const memories=commit.bundle.snapshot.world.mapModel.socialModel.actors[1].memories;
 assert.equal(memories.filter(m=>m.kind==='help').length,2);assert.equal(commit.bundle.snapshot.world.mapModel.negotiationModel.agreement.status,'fulfilled');
 assert.equal(commit.commands.filter(c=>c.dto.commandId===lostReceipt.commandId).length,1);
});
