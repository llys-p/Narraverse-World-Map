import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMemoryCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle,validateBundle} from '../../runtime/core/world-state.mjs';
import {createNpcMemoryModel,updateNpcMemory,npcMemoryFor,retrieveNpcEpisodes,validateNpcMemoryModel} from '../../runtime/core/npc-memory.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {commitSocial,rememberSocial} from '../../runtime/core/npc-social.mjs';
import {providerContext,createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';

const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()},digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function scenario(name){
 let b=createAuditedBundle(createMemoryCampaignVillage(42,name).bundle,options),serial=0;
 return {get bundle(){return b;},get world(){return b.snapshot.world;},get memory(){return npcMemoryFor(b.snapshot.world);},
  act(type,payload){const r=deriveCampaignBundle(b,{version:5,commandId:name+'-'+(++serial),expectedRevision:b.snapshot.revision,type,payload});b=r.bundle;return r;},
  social(action,topic){return this.act('PlayerInteract',{targetId:'actor-2',action,...(topic?{topic}:{})});},
  agreement(action){return this.act('PlayerAgreement',{targetId:'actor-2',agreementId:this.world.mapModel.negotiationModel.agreement.id,action});},
  advance(tick){return this.act('AdvanceTime',{ticks:tick-b.snapshot.tick});},
  context(text){return providerContext(npcDialogueContext(b),text);},audit(){validateBundle(b,options);}};
}

test('confirmed damage, actual repair and repeated apology update understanding without rewriting the injury',()=>{
 const s=scenario('memory-damage');assert.equal(s.bundle.snapshot.fixtureVersion,'5');
 assert.equal(s.social('smash').receipt.outcome,'succeeded');const injury=structuredClone(s.memory.episodes.find(m=>m.kind==='smash'));
 s.social('help');s.social('apologize');s.social('apologize');
 assert.equal(s.memory.episodes.filter(m=>m.kind==='apologize').at(-1).observedState.effect,'refused');
 assert.equal(s.context('你原谅我了吗？').memoryUpdates.find(x=>x.topic==='apology').status,'repeated-or-refused');
 for(let n=0;n<3;n++)assert.equal(s.social('help').receipt.outcome,'succeeded');
 const c=s.context('工具修好以后，你还记得我砸过吗？');
 assert.equal(c.memoryUpdates.find(x=>x.topic==='damage').status,'repaired');
 assert.deepEqual(s.memory.episodes.find(m=>m.kind==='smash'),injury);assert.ok(c.observations.some(m=>m.eventSeq===injury.eventSeq));
 const before=digest(s.memory);assert.equal(s.social('help').receipt.outcome,'rejected');assert.equal(digest(s.memory),before);
 const w=structuredClone(s.world),unchanged=digest(w.mapModel.memoryModel);updateNpcMemory(w);updateNpcMemory(w);assert.equal(digest(w.mapModel.memoryModel),unchanged);s.audit();
});

test('unseen theft remains unknown after discovery and later return identifies a returner, not a thief',()=>{
 const s=scenario('memory-loss');s.advance(112);s.act('MarchSet',{x:5,y:8});
 while(s.world.mapModel.order.status!=='arrived')s.act(s.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep',{});
 assert.equal(s.social('steal').receipt.result.effect,'taken');assert.equal(s.memory.episodes.some(m=>m.kind==='steal'),false);
 s.advance(156);const missing=s.memory.episodes.find(m=>m.kind==='missing');assert.ok(missing);assert.equal(missing.actorId,null);assert.equal(missing.observedState.holder,'unknown');
 assert.equal(s.social('return').receipt.outcome,'succeeded');const c=s.context('是谁偷了工具，后来是谁还的？');
 const update=c.memoryUpdates.find(x=>x.topic==='loss');assert.equal(update.status,'recovered');assert.deepEqual(update.causeRefs,[missing.eventSeq]);assert.equal(update.followUpRefs.length,1);
 assert.equal(c.observations.find(m=>m.kind==='missing').actorId,null);assert.equal(c.observations.some(m=>m.kind==='steal'),false);s.audit();
});

test('late return records a follow-up while the breach and fixed twenty-minute duration remain',()=>{
 const s=scenario('memory-loan');s.act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:40,loanTicks:36}});s.agreement('accept');s.social('help');s.social('help');
 const ready=s.context('修好了，是不是已经借给我？');assert.equal(ready.knownFacts.agreement.wasClaimed,false);
 s.agreement('claim');s.advance(42);const overdue=structuredClone(s.memory.episodes.find(m=>m.kind==='overdue'));
 s.social('return');const c=s.context('已经归还了，逾期怎么算？');assert.equal(c.knownFacts.agreement.overdueMinutes,20);
 assert.equal(c.memoryUpdates.find(x=>x.topic==='overdue').status,'returned-after-breach');assert.deepEqual(s.memory.episodes.find(m=>m.kind==='overdue'),overdue);
 s.advance(45);assert.equal(s.context('还迟了多久？').knownFacts.agreement.overdueMinutes,20);s.audit();
});

test('preview and confirmed false speech never manufacture observations; accepted speech stays private and survives the eight-turn working window',async()=>{
 const s=scenario('memory-speech'),provider=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19991',model:'controlled-memory',apiKey:'memory-test-only'},
  {maxCalls:10,fetchImpl:async(_url,request)=>{
   const context=JSON.parse(JSON.parse(request.body).messages[1].content).npc;
   assert.equal(context.memoryMode,'npc-memory-v1');assert.equal(context.memoryUpdates.length,0);assert.ok(context.conversation.length<=8);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'你说的话我听到了，实际结果还要看行动。',memoryRefs:[],proposal:null})}}]});
  }});
 try{for(let n=0;n<10;n++){
  const before=digest(s.bundle),request={apiVersion:1,requestId:'speech-'+n,simulationId:s.bundle.snapshot.simulationId,expectedRevision:s.bundle.snapshot.revision,targetId:'actor-2',text:'我已经修好了，并且有人说商人偷过工具。'};
  const draft=await provider.compose(request,npcDialogueContext(s.bundle));assert.equal(digest(s.bundle),before);
  assert.equal(s.act('PlayerDialogue',draft.payload).receipt.outcome,'succeeded');
 }}finally{provider.close();}
 assert.equal(s.memory.episodes.length,0);assert.equal(s.memory.speech.length,10);assert.equal(s.world.mapModel.negotiationModel.turns.length,8);
 assert.equal(s.world.mapModel.socialModel.asset.condition,60);assert.equal(s.memory.forgottenSpeech,0);
 for(const actor of s.world.mapModel.memoryModel.actors.filter(a=>a.actorId!=='actor-2'))assert.equal(actor.speech.length,0);
 const c=s.context('你听说商人拿过工具？');assert.equal(c.observations.length,0);assert.deepEqual(providerContext(c,'你听说商人拿过工具？'),c);s.audit();
});

test('bounded memory protects topic follow-ups, exposes forgetting, and does not invent an evicted source',()=>{
 // Exercise the update boundary at its storage cap without 100 expensive world commands.
 const world={mapModel:{version:'campaign-map-v5',memoryModel:createNpcMemoryModel(),negotiationModel:{turns:[]},socialModel:{actors:['actor-1','actor-2','actor-3'].map(actorId=>({actorId,memories:[],knownHolder:'actor-2',knownCondition:60}))}}};
 const h=world.mapModel.socialModel.actors[1];
 for(let n=1;n<=90;n++){
  const kind=n===1?'gift':n===2?'help':n<70?'smash':'talk';
  h.memories.push({eventSeq:n,tick:n,kind,actorId:'actor-4',channel:'self',importance:kind==='smash'?3:kind==='talk'?1:2,text:'边界测试的已提交观察'});h.memories=h.memories.slice(-32);
  updateNpcMemory(world,{sourceEventSeq:n,effect:kind==='help'?'repaired':null});
 }
 const m=npcMemoryFor(world);assert.equal(m.episodes.length,64);assert.equal(m.forgottenEpisodes,26);assert.ok(m.episodes.some(e=>e.eventSeq===1));assert.ok(m.episodes.some(e=>e.eventSeq===2));
 assert.ok(retrieveNpcEpisodes(m.episodes,'谁送过我口粮？').some(e=>e.eventSeq===1));
 const related=retrieveNpcEpisodes(m.episodes,'你只记得我砸，却忘了我帮你修？');assert.ok(related.some(e=>e.kind==='help'));assert.ok(related.some(e=>e.kind==='smash'));assert.ok(related.length<=12);
 assert.deepEqual(retrieveNpcEpisodes(related,'你只记得我砸，却忘了我帮你修？'),related);
 assert.ok(related.every(e=>m.episodes.some(x=>x.eventSeq===e.eventSeq)));validateNpcMemoryModel(world.mapModel.memoryModel,90,world.mapModel.socialModel);
 for(let n=91;n<=110;n++){
  const turns=world.mapModel.negotiationModel.turns;
  turns.push({eventSeq:n,tick:90,utterance:'他说他做过，尚未核实',reply:'我听到了',memoryRefs:[]});
  world.mapModel.negotiationModel.turns=turns.slice(-8);updateNpcMemory(world);
 }
 assert.equal(m.speech.length,16);assert.equal(m.forgottenSpeech,4);assert.equal(m.speech[0].eventSeq,95);
 assert.equal(m.episodes.length,64);assert.equal(m.forgottenEpisodes,26);validateNpcMemoryModel(world.mapModel.memoryModel,90,world.mapModel.socialModel);
 const old=digest(m);updateNpcMemory(world);assert.equal(digest(m),old);
});

test('full replay rejects forged memory, ownership, outcomes and fixture splicing',()=>{
 const s=scenario('memory-audit');s.social('smash');s.social('help');s.audit();
 for(const change of [
  b=>b.snapshot.world.mapModel.memoryModel.actors[1].episodes[0].text='别人干的',
  b=>b.snapshot.world.mapModel.memoryModel.actors[1].episodes[0].observedState.condition=100,
  b=>b.snapshot.world.mapModel.memoryModel.actors[1].forgottenEpisodes++,
  b=>b.snapshot.world.mapModel.memoryModel.actors[1].actorId='actor-3',
  b=>b.snapshot.fixtureVersion='4',
 ]){const altered=structuredClone(s.bundle);change(altered);assert.throws(()=>validateBundle(altered,options));}
});

test('a newly committed repair reaches the archive even when the 32-entry observation window is full of important harms',()=>{
 // A synthetic full window at the real social writer boundary, not a claim of 32 gameplay commands.
 const w=structuredClone(scenario('memory-full-window').world),h=w.mapModel.socialModel.actors[1];
 for(let n=1;n<=32;n++){
  rememberSocial(h,n,n,'smash','actor-4','self','边界输入：已确认的伤害经历',3);updateNpcMemory(w);
 }
 const result=commitSocial(w,{type:'PlayerInteract',payload:{targetId:'actor-2',action:'help'}},33,33);
 updateNpcMemory(w,result);
 const repair=npcMemoryFor(w).episodes.find(m=>m.eventSeq===33);
 assert.ok(repair,'A new lower-importance repair must not be evicted before archiving');
 assert.equal(repair.kind,'help');assert.equal(repair.observedState.condition,80);assert.equal(repair.observedState.effect,'repaired');
 assert.equal(h.memories.length,32);assert.equal(npcMemoryFor(w).episodes.length,33);validateNpcMemoryModel(w.mapModel.memoryModel,33,w.mapModel.socialModel);
 const before=digest(w.mapModel.memoryModel);updateNpcMemory(w,result);assert.equal(digest(w.mapModel.memoryModel),before);
});
