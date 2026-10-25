import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';
import {updateNpcMemory,npcMemoryFor} from '../../runtime/core/npc-memory.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';
import {providerContext,createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';

test('synthetic full history still sends recent repair and forgetting counts, while evicted detail cannot be cited',async()=>{
 // Synthetic committed-observation boundary, explicitly not 90 real gameplay actions.
 const bundle=structuredClone(createMemoryCampaignVillage(42,'npc9-capacity').bundle),w=bundle.snapshot.world,h=w.mapModel.socialModel.actors[1];
 for(let n=1;n<=90;n++){
  const kind=n===1?'talk':n===90?'help':'smash';
  h.memories.push({eventSeq:n,tick:n,kind,actorId:'actor-4',channel:'self',importance:kind==='smash'?3:1,text:'合成已提交观察'});h.memories=h.memories.slice(-32);
  if(n===90)h.knownCondition=100;
  updateNpcMemory(w,{sourceEventSeq:n,effect:kind==='help'?'repaired':null});
 }
 bundle.snapshot.tick=90;
 const memory=npcMemoryFor(w),evicted=Array.from({length:90},(_,i)=>i+1).find(n=>!memory.episodes.some(m=>m.eventSeq===n));
 assert.ok(evicted);const text='你还记得新近修理的帮助吗，更早遗漏的事能逐字还原吗？',ctx=npcDialogueContext(bundle),selected=providerContext(ctx,text);
 assert.equal(selected.memoryCoverage.forgottenEpisodes,26);assert.ok(selected.observations.some(m=>m.eventSeq===90));assert.equal(selected.observations.some(m=>m.eventSeq===evicted),false);
 const before=JSON.stringify(w.mapModel.memoryModel);let calls=0;
 const p=createNpcLanguageProvider({enabled:true,baseURL:'http://127.0.0.1:19978',model:'controlled-capacity',apiKey:''},{fetchImpl:async(_url,o)=>{
  const sent=JSON.parse(JSON.parse(o.body).messages[1].content).npc;
  assert.deepEqual(sent,selected);calls++;
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控回复：保留新帮助，遗漏细节未知。',memoryRefs:[calls===1?90:evicted],proposal:null})}}]});
 }});
 const req={apiVersion:1,requestId:'retained',simulationId:ctx.simulationId,expectedRevision:ctx.revision,targetId:'actor-2',text};
 try{
  const draft=await p.compose(req,ctx);assert.deepEqual(draft.payload.memoryRefs,[90]);
  await assert.rejects(p.compose({...req,requestId:'evicted'},ctx),{code:'MODEL_OUTPUT_INVALID'});assert.equal(p.getMetrics('evicted').failure.reason,'unknown-reference');
  assert.equal(JSON.stringify(w.mapModel.memoryModel),before);
 }finally{p.close();}
});
