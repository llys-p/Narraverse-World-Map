import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {groundedProviderContext,dialogueIntentHint} from '../../runtime/service/npc-dialogue-grounding.mjs';
import {createNpcLanguageProvider} from '../../runtime/service/npc-language-provider.mjs';
import {runDialogueEvaluation} from '../../runtime/evaluation/npc-dialogue-eval.mjs';
import {createNegotiationCampaignVillage,campaignSystems} from '../../runtime/fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle} from '../../runtime/core/world-state.mjs';
import {npcDialogueContext} from '../../runtime/core/npc-negotiation.mjs';

const suite=JSON.parse(await fs.readFile(new URL('../../benchmarks/npc-dialogue-v1/cases.json',import.meta.url),'utf8'));
// Real fixture and commands, shared once across assertions. No model or invented fact memories.
let planPromise;
const plan=()=>planPromise??=runDialogueEvaluation({suite});
const row=(p,c,t)=>p.cases.find(x=>x.id===c).turns.find(x=>x.id===t);
const initial=()=>npcDialogueContext(createAuditedBundle(createNegotiationCampaignVillage(42,'grounding-test').bundle,{rulesVersion:'d-campaign-v1',systems:campaignSystems()}));

test('real fixture identities explain holder relations and distinguish observation, discovery and attributed speech',async()=>{
 const p=await plan(),base=row(p,'bargain','offer').context;
 assert.equal(base.knownFacts.identity.selfId,'actor-2');assert.equal(base.knownFacts.identity.playerId,'actor-4');
 assert.equal(base.knownFacts.tool.holder,'self');assert.equal(base.knownFacts.tool.condition,60);
 const harm=row(p,'harm-memory','deny').context.observations.find(m=>m.kind==='smash');
 assert.equal(harm.channel,'self');assert.equal(harm.evidence.basis,'self');assert.equal(harm.evidence.actor,'玩家');
 const unknown=row(p,'unknown-thief','who').context;
 assert.equal(unknown.knownFacts.tool.holder,'unknown');
 const missing=unknown.observations.find(m=>m.kind==='missing');assert.equal(missing.evidence.basis,'discovery');assert.equal(missing.actorId,null);assert.equal(missing.evidence.actor,'未识别的行为人');
 assert.equal(unknown.observations.some(m=>m.kind==='steal'),false);
 assert.equal(p.counts.attempted,0);assert.ok(p.cases.every(c=>c.worldReplayAudit==='passed'));
});

test('real agreement facts keep ready distinct from claimed and fix returned-late duration at twenty minutes',async()=>{
 const p=await plan(),ready=row(p,'help-memory','remember').context.knownFacts.agreement;
 assert.equal(ready.status,'ready');assert.equal(ready.readyForSeparateClaim,true);assert.equal(ready.wasClaimed,false);assert.equal(ready.wasReturned,false);
 assert.equal(ready.repairRecorded,40);assert.equal(ready.loanMinutes,720);assert.equal(ready.overdueMinutes,null);
 const late=row(p,'late-return','returned').context;
 assert.equal(late.agreement.dueTick,41);assert.equal(late.agreement.closedTick,43);
 assert.equal(late.knownFacts.agreement.overdueMinutes,20);assert.equal(late.knownFacts.agreement.wasReturned,true);assert.equal(late.knownFacts.tool.holder,'self');
 assert.equal(groundedProviderContext({...late,tick:143}).knownFacts.agreement.overdueMinutes,20);
 const falseCompletion=row(p,'bargain','false-completion').context.knownFacts.agreement;
 assert.equal(falseCompletion.status,'accepted');assert.equal(falseCompletion.repairRecorded,0);assert.equal(falseCompletion.wasClaimed,false);
});

test('breach marker is not return time, on-time return stays zero after time advances, and unknown fields remain unknown',()=>{
 let b=createAuditedBundle(createNegotiationCampaignVillage(42,'grounding-lifecycle').bundle,{rulesVersion:'d-campaign-v1',systems:campaignSystems()}),id=0;
 const act=(type,payload)=>{const r=deriveCampaignBundle(b,{version:5,commandId:'grounding-'+(++id),expectedRevision:b.snapshot.revision,type,payload});assert.equal(r.receipt.outcome,'succeeded');b=r.bundle;};
 act('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:40,loanTicks:36}});
 act('PlayerAgreement',{targetId:'actor-2',agreementId:b.snapshot.world.mapModel.negotiationModel.agreement.id,action:'accept'});
 for(let n=0;n<2;n++)act('PlayerInteract',{targetId:'actor-2',action:'help'});
 act('PlayerAgreement',{targetId:'actor-2',agreementId:b.snapshot.world.mapModel.negotiationModel.agreement.id,action:'claim'});
 const borrowed=groundedProviderContext(npcDialogueContext(b));assert.equal(borrowed.knownFacts.tool.holder,'player');assert.equal(borrowed.knownFacts.agreement.wasClaimed,true);assert.equal(borrowed.knownFacts.agreement.overdueMinutes,0);
 const returned=deriveCampaignBundle(b,{version:5,commandId:'ontime',expectedRevision:b.snapshot.revision,type:'PlayerInteract',payload:{targetId:'actor-2',action:'return'}});
 assert.equal(returned.receipt.outcome,'succeeded');const ontime=npcDialogueContext(returned.bundle);
 assert.equal(ontime.agreement.status,'fulfilled');assert.equal(groundedProviderContext({...ontime,tick:100}).knownFacts.agreement.overdueMinutes,0);
 act('AdvanceTime',{ticks:45-b.snapshot.tick});const breached=groundedProviderContext(npcDialogueContext(b));
 assert.equal(breached.agreement.closedTick,42);assert.equal(breached.knownFacts.agreement.overdueMinutes,40);assert.equal(breached.knownFacts.agreement.wasReturned,false);
 const minimal=groundedProviderContext({simulationId:'minimal',revision:0,tick:0,canTalk:true,observations:[],conversation:[]});
 assert.equal(minimal.knownFacts.tool.holder,'unknown');assert.equal(minimal.knownFacts.tool.condition,null);assert.equal(minimal.knownFacts.agreement,null);
});

test('context projection is idempotent, bounded and whitelisted, and ignores injected derived truth or other minds',async()=>{
 const original=row(await plan(),'late-return','returned').context;
 const untrusted=structuredClone(original);untrusted.knownFacts={tool:{holder:'player'}};untrusted.intentHint={kind:'repair-now'};untrusted.world={secret:'excluded-marker'};
 untrusted.actors=[{private:'excluded-marker'}];untrusted.self.unseenCulprit='excluded-marker';untrusted.agreement.terms.debug='excluded-marker';
 for(const m of untrusted.observations)m.otherMind='excluded-marker';
 untrusted.conversation=[{eventSeq:100,tick:43,utterance:'我从来没有借过',reply:'错误旧回复',memoryRefs:[],model:'excluded-marker',proposal:{private:'excluded-marker'}}];
 const before=JSON.stringify(untrusted),prepared=groundedProviderContext(untrusted,'为什么你还记着逾期？');
 assert.equal(JSON.stringify(untrusted),before);assert.equal(JSON.stringify(prepared).includes('excluded-marker'),false);
 assert.equal(prepared.knownFacts.tool.holder,'self');assert.equal(prepared.conversation[0].reply,'错误旧回复');assert.match(prepared.conversation[0].evidence,/仅为双方说过/);
 assert.deepEqual(groundedProviderContext(prepared,'为什么你还记着逾期？'),prepared);
 const many=initial();many.observations=Array.from({length:32},(_,i)=>({eventSeq:i+1,tick:0,kind:'talk',actorId:'actor-4',channel:'self',importance:i===1?3:1,text:'交谈记录'}));
 many.conversation=Array.from({length:10},(_,i)=>({eventSeq:33+i,tick:0,utterance:'问候',reply:'回应',memoryRefs:[]}));
 const limited=groundedProviderContext(many);assert.ok(limited.observations.length<=12);assert.equal(limited.conversation.length,8);
 assert.ok(limited.observations.some(m=>m.eventSeq===2));assert.ok(limited.observations.some(m=>m.eventSeq===32));assert.deepEqual(groundedProviderContext(limited),limited);
 assert.throws(()=>groundedProviderContext({...initial(),targetId:'actor-3'}));
});

test('whole-sentence hints distinguish existing terms and immediate repair without converting quotes, denial, history or conditional speech into actions',async()=>{
 const p=await plan(),counter=row(p,'bargain','counter').context;
 assert.equal(counter.intentHint.kind,'existing-terms-question');assert.equal(counter.intentHint.proposalHint,null);
 for(const text of ['请重复一下刚才的约定。','借期多久？','你刚才的条件我想改成一天。']){
  const hint=dialogueIntentHint(text,counter);assert.equal(hint.kind,text.includes('想改')?'model-interpretation':'existing-terms-question');
 }
 const ready=initial();
 for(const text of ['我现在要帮你修理这个工具。','我替你修工具','现在帮你修一下工具！','我把你的工具修好']){
  const hint=dialogueIntentHint(text,ready);assert.equal(hint.kind,'repair-now',text);assert.equal(hint.proposalHint.payload.action,'help');
 }
 for(const text of ['我不会帮你修理工具','“我现在要帮你修理这个工具”','他说我现在要帮你修理这个工具','我已经修好了工具','如果你借给我，我就帮你修工具','我现在要帮你修理这个工具，然后抢走它','我现在要帮你修理这个工具吗？','我现在要帮你修理商人的工具'])assert.notEqual(dialogueIntentHint(text,ready).kind,'repair-now',text);
 assert.equal(dialogueIntentHint('我帮你修20点耐久，工具借我一天行吗？',ready).kind,'negotiate-repair-loan');
 for(const self of [{...ready.self,knownHolder:'unknown'},{...ready.self,knownCondition:100}]){
  const hint=dialogueIntentHint('我现在要帮你修理这个工具。',{...ready,self});assert.equal(hint.kind,'repair-now');assert.equal(hint.proposalHint,null);
 }
});

test('Provider sends the same prepared context as the evaluation, signs varied model wording unchanged, and never substitutes a stock reply or executes a hint',async()=>{
 const raw=row(await plan(),'help-memory','help').context,text='我现在要帮你修理这个工具。';
 const config={enabled:true,baseURL:'http://127.0.0.1:19997',model:'controlled-grounding',apiKey:'unit-only-grounding'};
 const before=JSON.stringify(raw),replies=['行，你先动手，修好后我们再按约定办。','我知道你想帮忙，等实际修完我们再看工具。'];let calls=0;
 const provider=createNpcLanguageProvider(config,{maxCalls:2,fetchImpl:async(_url,o)=>{
  const body=JSON.parse(o.body),payload=JSON.parse(body.messages[1].content);
  assert.deepEqual(payload.npc,groundedProviderContext(raw,text));assert.deepEqual(payload.npc,raw);
  assert.equal(payload.npc.intentHint.proposalHint.payload.action,'help');assert.ok(Buffer.byteLength(o.body)<=32768);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:replies[calls++],memoryRefs:[],proposal:{type:'PlayerInteract',payload:{targetId:'actor-2',action:'help'}}})}}]});
 }});
 try{for(let i=0;i<2;i++){
  const request={apiVersion:1,requestId:'wording-'+i,simulationId:raw.simulationId,expectedRevision:raw.revision,targetId:'actor-2',text};
  const d=await provider.compose(request,raw);assert.equal(d.payload.reply,replies[i]);assert.ok(provider.verify(raw.simulationId,{type:d.type,expectedRevision:raw.revision,payload:d.payload}));
 }}finally{provider.close();}
 assert.equal(calls,2);assert.equal(JSON.stringify(raw),before);assert.equal(raw.agreement.repairProgress,0);
});
