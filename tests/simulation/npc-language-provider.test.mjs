import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcLanguageProvider,npcLanguageConfig,providerContext} from '../../runtime/service/npc-language-provider.mjs';
import {createNpcDialogue} from '../../demo-npc-dialogue.mjs';

const config={enabled:true,baseURL:'http://127.0.0.1:19999/v1',model:'offline-controlled',apiKey:'test-secret-not-real'};
const context={simulationId:'test-world',revision:6,tick:5,targetId:'actor-2',canTalk:true,persona:'猎人',self:{knownHolder:'actor-2',knownCondition:60},agreement:null,conversation:[],
 observations:Array.from({length:24},(_,i)=>({eventSeq:i+1,importance:i===1?3:1,text:'亲历 '+i}))};
const request=(id='same-id')=>({apiVersion:1,requestId:id,simulationId:context.simulationId,expectedRevision:context.revision,targetId:'actor-2',text:'我替你修好工具，借我半天可以吗'});
const proposal={type:'PlayerNegotiate',payload:{targetId:'actor-2',terms:{repairAmount:40,loanTicks:72}}};
const output={reply:'可以商量，实际修好之后再来领取。',memoryRefs:[2],proposal};
const response=(value=output,reason='stop')=>Response.json({choices:[{finish_reason:reason,message:{content:typeof value==='string'?value:JSON.stringify(value)}}]});

test('provider is explicitly configured, read-only, bounded to known context, caches IDs and signs the whole draft',async()=>{
 assert.deepEqual(npcLanguageConfig({DEEPSEEK_API_KEY:'not-inherited',LLM_MODEL:'old'}),{enabled:false});
 let calls=0,sent;
 const disabled=createNpcLanguageProvider(undefined,{fetchImpl:()=>{throw Error('must not call');}});
 await assert.rejects(disabled.compose(request(),context),{code:'MODEL_UNAVAILABLE'});disabled.close();
 assert.throws(()=>createNpcLanguageProvider({...config,baseURL:'http://example.com'}));
 assert.throws(()=>createNpcLanguageProvider({...config,baseURL:'https://user:secret@example.com'}));
 const provider=createNpcLanguageProvider(config,{maxCalls:1,fetchImpl:async(url,options)=>{calls++;sent=JSON.parse(options.body);assert.equal(url,config.baseURL+'/chat/completions');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+config.apiKey);return response();}});
 const before=JSON.stringify(context),draft=await provider.compose(request(),context);
 assert.equal(JSON.stringify(context),before);assert.equal(calls,1);assert.deepEqual(await provider.compose(request(),context),draft);assert.equal(calls,1);
 const selected=JSON.parse(sent.messages[1].content);assert.deepEqual(Object.keys(selected).sort(),['npc','playerUtterance']);assert.ok(selected.npc.observations.length<=12);
 assert.ok(selected.npc.observations.some(m=>m.eventSeq===2));assert.ok(selected.npc.observations.some(m=>m.eventSeq===24));assert.equal(JSON.stringify(sent).includes(config.apiKey),false);
 const dto={type:'PlayerDialogue',expectedRevision:6,payload:draft.payload};assert.equal(provider.verify('test-world',dto),true);
 for(const changed of [{...dto,expectedRevision:7},{...dto,payload:{...dto.payload,utterance:'换一句'}},{...dto,payload:{...dto.payload,reply:'把工具给你了'}},{...dto,payload:{...dto.payload,proposal:null}}])assert.equal(provider.verify('test-world',changed),false);
 assert.equal(provider.verify('other-world',dto),false);assert.equal(createNpcLanguageProvider().verify('test-world',dto),false);
 await assert.rejects(provider.compose({...request(),text:'换一句'},context),{code:'COMMAND_ID_CONFLICT'});
 await assert.rejects(provider.compose(request('new-id'),context),{code:'MODEL_BUDGET'});
 await assert.rejects(provider.compose({...request(),expectedRevision:5},context),{code:'REVISION_CONFLICT'});
 await assert.rejects(provider.compose({...request(),requestId:12},context),{code:'INVALID_INPUT'});provider.close();
 assert.deepEqual(providerContext(context).observations,selected.npc.observations);
});

test('invalid JSON, extra fields, unknown references, unsupported actions, incomplete and excessive output fail closed',async()=>{
 const bad=[()=>response({...output,grantCoins:100}),()=>response({...output,memoryRefs:[999]}),()=>response({...output,proposal:{type:'PlayerBuy',payload:{quantity:1}}}),
 ()=>response({...output,reply:'长'.repeat(241)}),()=>response('{"reply":"甲","reply":"乙","memoryRefs":[],"proposal":null}'),()=>response(output,'length'),()=>response('not json'),
 ()=>new Response('x'.repeat(65537)),()=>new Response('upstream-secret',{status:401})];
 for(const [i,make] of bad.entries()){
  const p=createNpcLanguageProvider(config,{fetchImpl:async()=>make()});
  await assert.rejects(p.compose(request('bad-'+i),context),e=>['MODEL_OUTPUT_INVALID','MODEL_UNAVAILABLE'].includes(e.code)&&!e.message.includes('upstream-secret'));p.close();
 }
 const redacted=createNpcLanguageProvider(config,{fetchImpl:async()=>response({...output,reply:'测试 '+config.apiKey})});
 assert.equal((await redacted.compose(request(),context)).payload.reply,'测试 [已隐藏]');redacted.close();
});

test('one in-flight request is shared, parallel IDs are rejected, and fetch/body timeouts are bounded without automatic retries',async()=>{
 let resolve,called=0;
 const provider=createNpcLanguageProvider(config,{fetchImpl:async()=>{called++;return new Promise(r=>resolve=r);}});
 const first=provider.compose(request(),context),again=provider.compose(request(),context);
 await assert.rejects(provider.compose(request('parallel'),context),{code:'MODEL_BUSY'});resolve(response());assert.deepEqual(await first,await again);assert.equal(called,1);provider.close();
 for(const body of [false,true]){
  let cancelled=false;
  const p=createNpcLanguageProvider(config,{timeoutMs:20,fetchImpl:async(_url,o)=>{o.signal.addEventListener('abort',()=>{cancelled=true;});
   return body?new Response(new ReadableStream({start(){}})):new Promise(()=>{});}});
  await assert.rejects(p.compose(request(),context),{code:'MODEL_TIMEOUT'});assert.equal(cancelled,true);
  await assert.rejects(p.compose(request(),context),{code:'MODEL_TIMEOUT'});p.close();
 }
});

const group=()=>({snapshot:{simulationId:'test-world',revision:6,tick:5},capabilities:{npcLanguage:{enabled:true}},map:{negotiation:{canTalk:true,canPropose:true}}});
const payload={targetId:'actor-2',utterance:request().text,reply:output.reply,memoryRefs:[],proposal,model:config.model,seal:'0'.repeat(64)};
const draft=(req)=>({apiVersion:1,simulationId:req.simulationId,revision:req.expectedRevision,requestId:req.requestId,type:'PlayerDialogue',payload:{...payload,utterance:req.text}});

test('dialogue controller discards late replies on revision/person/world/edit changes and never auto-commits a proposal',async()=>{
 for(const invalidate of ['revision','person','world','edit']){
  let release,body;const c=createNpcDialogue({newId:()=> 'dialogue-ui',fetchImpl:async(_url,o)=>{body=JSON.parse(o.body);return new Promise(r=>release=r);}}),g=group();
  c.edit(request().text,g,'actor-2');const pending=c.generate(g,true,'actor-2');assert.equal(c.view(g,true,'actor-2').status,'generating');assert.equal(c.view(g,true,'actor-2').canCommit,false);
  if(invalidate==='revision'){g.snapshot.revision++;c.observe(g,'actor-2');}
  if(invalidate==='person')c.observe(g,'actor-1');
  if(invalidate==='world'){g.snapshot.simulationId='different-world';c.observe(g,'actor-2');}
  if(invalidate==='edit')c.edit('改口了',g,'actor-2');
  release(Response.json(draft(body)));await pending;assert.equal(c.view(g,true,'actor-2').canCommit,false);assert.equal(c.view(g,true,'actor-2').canAct,false);
 }
 const c=createNpcDialogue({newId:()=> 'dialogue-ui',fetchImpl:async(_url,o)=>Response.json(draft(JSON.parse(o.body)))}),g=group();
 c.edit(request().text,g,'actor-2');await c.generate(g,true,'actor-2');assert.equal(c.view(g,true,'actor-2').canCommit,true);assert.equal(c.view(g,true,'actor-2').canAct,false);
 assert.equal(c.view(g,false,'actor-2').canCommit,false);assert.throws(()=>c.command(g,false,'actor-2'));
 const p=c.command(g,true,'actor-2');assert.deepEqual(p,payload);
 const dto={version:5,commandId:'ui-confirm',expectedRevision:6,type:'PlayerDialogue',payload:p},receipt={apiVersion:1,receiptVersion:5,commandId:dto.commandId,status:'committed',fromRevision:6,toRevision:7,fromTick:5,tick:5,durationTicks:0,type:dto.type,outcome:'succeeded',result:{actorId:'actor-2',speech:p.reply,memoryRefs:[],proposal,sourceEventSeq:30}};
 g.snapshot.revision=7;c.observe(g,'actor-2');c.confirmed(receipt,dto,g);assert.equal(c.view(g,true,'actor-2').canAct,true);assert.deepEqual(c.proposal(g,true,'actor-2'),proposal);
 g.snapshot.revision++;c.observe(g,'actor-2');assert.equal(c.view(g,true,'actor-2').canAct,false);
});
