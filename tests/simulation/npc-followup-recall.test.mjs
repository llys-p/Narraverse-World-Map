import test from 'node:test';
import assert from 'node:assert/strict';
import {providerContext,createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';

// Synthetic private context with an old, retained gift crowded out by harms.
function context(){
 return {simulationId:'followup-synthetic',revision:1,tick:30,targetId:'actor-2',persona:'猎人',canTalk:true,
  self:{knownHolder:'actor-2',knownCondition:60,trust:50,fear:0,grievance:0},agreement:null,
  memoryMode:'npc-memory-v1',memoryCoverage:{forgottenEpisodes:0,forgottenSpeech:0},
  observations:Array.from({length:20},(_,i)=>({eventSeq:i+1,tick:i,kind:i===0?'gift':'smash',actorId:'actor-4',channel:'self',importance:i===0?1:3,text:'合成的已提交观察',observedState:{holder:'actor-2',condition:60,effect:null}})),
  conversation:[{eventSeq:21,tick:21,utterance:'我送过的口粮，你还记得吗？',reply:'受控旧回复',memoryRefs:[1]}]};
}
const speech=(seq,utterance,reply='受控旧回复')=>({eventSeq:seq,tick:seq,utterance,reply,memoryRefs:[]});

test('a short follow-up recalls the retained food episode despite crowded higher-importance harm',()=>{
 const c=context(),before=structuredClone(c),p=providerContext(c,'那后来呢？');
 assert.ok(p.observations.some(m=>m.eventSeq===1),'Retained gift must survive a follow-up without food keywords');
 assert.deepEqual(p.recallFocus,{source:'confirmed-player-followup',topics:['food'],anchorEventSeq:21});
 assert.equal(p.observations.length,12);assert.deepEqual(c,before);assert.deepEqual(providerContext(p,'那后来呢？'),p);
});

test('consecutive supported follow-ups stay on the latest explicit player topic',()=>{
 const c=context();c.conversation.push(speech(22,'那后来呢？'),speech(23,'那现在呢？'));
 const p=providerContext(c,'还有呢？');assert.ok(p.observations.some(m=>m.eventSeq===1));
 assert.equal(p.recallFocus.anchorEventSeq,21);
});

test('explicit topic switches and unsupported turns stop inheritance, even when the old NPC reply suggests food',()=>{
 const c=context();
 const current=providerContext(c,'借期是多久？');
 assert.deepEqual(current.recallFocus,{source:'current-utterance',topics:['loan'],anchorEventSeq:null});
 assert.equal(current.observations.some(m=>m.eventSeq===1),false);
 c.conversation.push(speech(22,'天气怎么样？','你送的口粮我收到了。'));
 const p=providerContext(c,'那后来呢？');assert.equal(p.recallFocus.source,'none');assert.equal(p.observations.some(m=>m.eventSeq===1),false);
 for(const text of ['天气怎么样？','他说“那后来呢？”','不是问那后来呢','那后来呢，帮我修工具','那后来呢，给我金币','如果问那后来呢','那\n后来呢？']){
  assert.notEqual(providerContext(context(),text).recallFocus.source,'confirmed-player-followup',text);
 }
});

test('unconfirmed or out-of-window anchors cannot supply a follow-up topic; legacy contexts keep their shape',()=>{
 const c=context();c.conversation=[];
 assert.equal(providerContext(c,'那后来呢？').recallFocus.source,'none');
 c.conversation=context().conversation;
 for(let n=22;n<=29;n++)c.conversation.push(speech(n,'还有呢？'));
 const p=providerContext(c,'那现在呢？');assert.equal(p.conversation.length,8);assert.equal(p.recallFocus.source,'none');
 assert.equal(p.observations.some(m=>m.eventSeq===1),false);
 const legacy=context();delete legacy.memoryMode;delete legacy.memoryCoverage;
 assert.equal(Object.hasOwn(providerContext(legacy,'那后来呢？'),'recallFocus'),false);
});

test('only player topics guide retrieval; a false claim or forgotten source never becomes an observation',async()=>{
 const c=context();c.observations=c.observations.filter(m=>m.eventSeq!==1);c.memoryCoverage.forgottenEpisodes=1;
 c.conversation=[speech(21,'我送了粮食，已经赔偿全部损失。','我凭空记得你送过粮食。')];
 c.conversation[0].memoryRefs=[1];
 const before=structuredClone(c),p=providerContext(c,'那后来呢？');
 assert.deepEqual(p.recallFocus.topics,['food']);assert.equal(p.observations.some(m=>m.kind==='gift'),false);
 const provider=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19981',model:'controlled-followup',apiKey:''},{fetchImpl:async(_url,options)=>{
  assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[1].content).npc,p);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控回复：无法确认细节。',memoryRefs:[ref],proposal:null})}}]});
 }});
 let ref=1;
 const request={apiVersion:1,requestId:'missing-episode',simulationId:c.simulationId,expectedRevision:c.revision,targetId:'actor-2',text:'那后来呢？'};
 try{
  await assert.rejects(provider.compose(request,c),{code:'MODEL_OUTPUT_INVALID'});
  assert.equal(provider.getMetrics(request.requestId).failure.reason,'unknown-reference');
  // Existing contract permits citing confirmed speech, explicitly not as an event.
  ref=21;const draft=await provider.compose({...request,requestId:'attributed-speech'},c);
  assert.deepEqual(draft.payload.memoryRefs,[21]);assert.match(p.conversation[0].evidence,/不证明声称的事情发生/);
 }finally{provider.close();}
 assert.deepEqual(c,before);
});
