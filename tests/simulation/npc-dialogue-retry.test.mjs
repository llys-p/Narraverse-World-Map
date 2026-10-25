import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcDialogue} from '../../demo-npc-dialogue.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';

const context={simulationId:'npc11-retry',revision:1,tick:0,targetId:'actor-2',canTalk:true,persona:'猎人',self:{knownHolder:'actor-2',knownCondition:60,trust:50,fear:0,grievance:0},agreement:null,conversation:[],observations:[]};
const group=()=>({snapshot:{simulationId:context.simulationId,revision:1,tick:0},capabilities:{npcLanguage:{enabled:true}},map:{negotiation:{canTalk:true,canPropose:true}}});
const output={reply:'受控回复。',memoryRefs:[],proposal:null};
const response=value=>Response.json({choices:[{finish_reason:'stop',message:{content:typeof value==='string'?value:JSON.stringify(value)}}]});

test('a new explicit generation after invalid output or success uses a fresh ID without editing the utterance',async()=>{
 let calls=0,ids=0;const requests=[];
 const provider=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19988',model:'controlled-retry',apiKey:''},{maxCalls:3,fetchImpl:async()=>{calls++;return response(calls===1?'invalid JSON':output);}});
 const c=createNpcDialogue({newId:()=>`retry-${++ids}`,fetchImpl:async(_url,o)=>{
  const req=JSON.parse(o.body);requests.push(req);
  try{return Response.json(await provider.compose(req,context));}catch(e){return Response.json({error:{code:e.code}},{status:502});}
 }}),g=group();
 try{
  c.edit('最近怎么样？',g,'actor-2');await c.generate(g,true,'actor-2');assert.equal(c.view(g,true,'actor-2').status,'error');assert.equal(calls,1);
  await c.generate(g,true,'actor-2');assert.equal(calls,2);assert.equal(c.view(g,true,'actor-2').status,'preview');
  await c.generate(g,true,'actor-2');assert.equal(calls,3);
  assert.equal(new Set(requests.map(r=>r.requestId)).size,3);assert.ok(requests.every(r=>r.text==='最近怎么样？'));
  assert.equal(provider.verify(g.snapshot.simulationId,{type:'PlayerDialogue',expectedRevision:1,payload:c.command(g,true,'actor-2')}),true);
  await c.generate(g,true,'actor-2');assert.equal(calls,3);assert.equal(c.view(g,true,'actor-2').status,'error');assert.match(c.view(g,true,'actor-2').message,/上限/);
  await c.generate(g,true,'actor-2');assert.equal(calls,3);assert.equal(requests.at(-1).requestId,requests.at(-2).requestId);
 }finally{provider.close();}
});

test('lost successful response is recovered with identical bytes, then an explicit new generation can call again',async()=>{
 let calls=0,ids=0,drop=true;const bodies=[];
 const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19987',model:'controlled-lost-response',apiKey:''},{fetchImpl:async()=>{calls++;return response(output);}});
 const c=createNpcDialogue({newId:()=>`lost-${++ids}`,fetchImpl:async(_url,o)=>{
  bodies.push(o.body);const draft=await p.compose(JSON.parse(o.body),context);
  if(drop){drop=false;throw Error('simulated lost response');}return Response.json(draft);
 }}),g=group();
 try{
  c.edit('最近怎么样？',g,'actor-2');await c.generate(g,true,'actor-2');
  assert.equal(calls,1);assert.equal(c.view(g,true,'actor-2').generateLabel,'重取本次结果');assert.equal(c.view(g,true,'actor-2').canCommit,false);
  await c.generate(g,true,'actor-2');assert.equal(bodies[0],bodies[1]);assert.equal(calls,1);assert.equal(c.view(g,true,'actor-2').generateLabel,'重新生成预览');
  await c.generate(g,true,'actor-2');assert.equal(calls,2);assert.notEqual(bodies[1],bodies[2]);assert.equal(c.view(g,true,'actor-2').canAct,false);
 }finally{p.close();}
});

test('only known terminal errors retire an ID; busy, budget, unreadable or untrusted responses keep it',async()=>{
 const draft=req=>({apiVersion:1,requestId:req.requestId,simulationId:req.simulationId,revision:req.expectedRevision,type:'PlayerDialogue',payload:{targetId:'actor-2',utterance:req.text,...output,model:'controlled',seal:'0'.repeat(64)}});
 for(const code of ['MODEL_OUTPUT_INVALID','MODEL_TIMEOUT','MODEL_UNAVAILABLE','MODEL_BUSY','MODEL_BUDGET','UNKNOWN','unreadable','invalid-draft']){
  let ids=0;const requests=[];const terminal=['MODEL_OUTPUT_INVALID','MODEL_TIMEOUT','MODEL_UNAVAILABLE'].includes(code);
  const c=createNpcDialogue({newId:()=>`boundary-${++ids}`,fetchImpl:async(_url,o)=>{
   const req=JSON.parse(o.body);requests.push(req);
   if(requests.length>1)return Response.json(draft(req));
   if(code==='unreadable')return new Response('not JSON',{status:502});
   if(code==='invalid-draft')return Response.json({...draft(req),requestId:'wrong-id'});
   return Response.json({error:{code}},{status:502});
  }}),g=group();
  c.edit('最近怎么样？',g,'actor-2');await c.generate(g,true,'actor-2');assert.equal(requests.length,1);
  assert.equal(c.view(g,true,'actor-2').generateLabel,terminal?'重新生成预览':'重取本次结果',code);
  await c.generate(g,true,'actor-2');assert.equal(requests[0].requestId===requests[1].requestId,!terminal,code);
  assert.equal(c.view(g,true,'actor-2').status,'preview',code);
 }
});
