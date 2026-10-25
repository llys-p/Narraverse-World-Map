// This project's world-owned memory. No model writes, wall clock or external library.
import {fields,integer,denseArray,requireCondition,cloneData,canonicalJson} from './data-contract.mjs';

import {MEMORY_MAP_VERSION} from '../../runtime-negotiation-contract.mjs';
export const NPC_MEMORY_MAP_VERSION=MEMORY_MAP_VERSION;
export const NPC_MEMORY_VERSION='npc-memory-v1';
export const EPISODE_LIMIT=64,SPEECH_LIMIT=16;
const IDS=['actor-1','actor-2','actor-3'];
const KINDS=['talk','threaten','steal','rob','smash','help','return','apologize','ask-help','gift','missing','damage','overdue','agreement'];
const BASE=['eventSeq','tick','kind','actorId','channel','importance','text'];
const EFFECTS=['talked','threatened','caught','taken','resisted','smashed','repaired','returned','apologized','refused','lent'];
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,cloneData(v[k])]));
const base=m=>pick(m,BASE);
const group=kind=>['smash','damage'].includes(kind)?'damage':['steal','rob','missing'].includes(kind)?'loss':kind;
const short=(s,n)=>typeof s==='string'&&s.length<=n;
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);

export function createNpcMemoryModel(){return {version:NPC_MEMORY_VERSION,actors:IDS.map(actorId=>({actorId,throughEventSeq:0,forgottenEpisodes:0,forgottenSpeech:0,episodes:[],speech:[]}))};}
export function npcMemoryFor(world,actorId='actor-2'){
 return world.mapModel?.version===NPC_MEMORY_MAP_VERSION?world.mapModel.memoryModel.actors.find(a=>a.actorId===actorId)??null:null;
}
function retainEpisodes(actor){
 if(actor.episodes.length<=EPISODE_LIMIT)return;
 const pinned=new Set(actor.episodes.slice(-8).map(m=>m.eventSeq)),last=new Map();
 for(const m of actor.episodes)if(m.kind!=='talk')last.set(group(m.kind),m.eventSeq);
 for(const seq of last.values())pinned.add(seq);
 const candidates=actor.episodes.filter(m=>!pinned.has(m.eventSeq)).sort((a,b)=>a.importance-b.importance||a.eventSeq-b.eventSeq);
 const remove=new Set(candidates.slice(0,actor.episodes.length-EPISODE_LIMIT).map(m=>m.eventSeq));
 requireCondition(remove.size===actor.episodes.length-EPISODE_LIMIT,'Memory retention cannot meet budget');
 actor.episodes=actor.episodes.filter(m=>!remove.has(m.eventSeq));actor.forgottenEpisodes+=remove.size;
}

// Called only after the world's existing observation/confirmation rules committed.
// The typed state is the observer's knowledge, never the actual hidden asset owner.
export function updateNpcMemory(world,outcome=null){
 if(world.mapModel?.version!==NPC_MEMORY_MAP_VERSION)return;
 for(const actor of world.mapModel.memoryModel.actors){
  const observed=world.mapModel.socialModel.actors.find(a=>a.actorId===actor.actorId);
  for(const m of observed.memories){
   const prior=actor.episodes.find(x=>x.eventSeq===m.eventSeq);
   if(prior){requireCondition(same(base(prior),m),'Committed experience cannot be rewritten');continue;}
   if(m.eventSeq<=actor.throughEventSeq)continue; // Already processed and subsequently evicted.
   actor.episodes.push({...base(m),observedState:{holder:observed.knownHolder,condition:observed.knownCondition,
    effect:outcome?.sourceEventSeq===m.eventSeq&&EFFECTS.includes(outcome.effect)?outcome.effect:null}});
  }
  if(actor.actorId==='actor-2')for(const t of world.mapModel.negotiationModel.turns){
   const speech=pick(t,['eventSeq','tick','utterance','reply','memoryRefs']),prior=actor.speech.find(x=>x.eventSeq===t.eventSeq);
   if(prior){requireCondition(same(prior,speech),'Confirmed speech cannot be rewritten');continue;}
   if(t.eventSeq>actor.throughEventSeq)actor.speech.push(speech);
  }
  actor.episodes.sort((a,b)=>a.eventSeq-b.eventSeq);actor.speech.sort((a,b)=>a.eventSeq-b.eventSeq);
  actor.throughEventSeq=Math.max(actor.throughEventSeq,actor.episodes.at(-1)?.eventSeq??0,actor.speech.at(-1)?.eventSeq??0);
  retainEpisodes(actor);
  if(actor.speech.length>SPEECH_LIMIT){actor.forgottenSpeech+=actor.speech.length-SPEECH_LIMIT;actor.speech=actor.speech.slice(-SPEECH_LIMIT);}
 }
}

export function validateNpcMemoryModel(model,tick,social){
 fields(model,['version','actors']);requireCondition(model.version===NPC_MEMORY_VERSION,'Unknown NPC memory version');denseArray(model.actors,3);requireCondition(model.actors.length===3,'Memory roster mismatch');
 for(const [i,a] of model.actors.entries()){
  fields(a,['actorId','throughEventSeq','forgottenEpisodes','forgottenSpeech','episodes','speech']);requireCondition(a.actorId===IDS[i],'Memory owner mismatch');
  for(const k of ['throughEventSeq','forgottenEpisodes','forgottenSpeech'])integer(a[k]);
  denseArray(a.episodes,EPISODE_LIMIT);denseArray(a.speech,SPEECH_LIMIT);requireCondition(a.actorId==='actor-2'||a.speech.length===0,'Private dialogue belongs to its recipient');
  const used=new Set();
  for(const rows of [a.episodes,a.speech]){let previous=0;for(const m of rows){
   integer(m.eventSeq,1);integer(m.tick);requireCondition(m.eventSeq>previous&&m.eventSeq<=a.throughEventSeq&&m.tick<=tick&&!used.has(m.eventSeq),'Invalid memory chronology');previous=m.eventSeq;used.add(m.eventSeq);
   if(rows===a.episodes){
    fields(m,[...BASE,'observedState']);requireCondition(KINDS.includes(m.kind)&&[null,'actor-4'].includes(m.actorId)&&['self','witness','discovery'].includes(m.channel)&&short(m.text,300),'Invalid observed episode');
    integer(m.importance,1);requireCondition(m.importance<=3,'Invalid memory importance');
    if(m.channel==='discovery'&&['missing','damage'].includes(m.kind))requireCondition(m.actorId===null,'Discovery cannot identify a culprit');
    fields(m.observedState,['holder','condition','effect']);requireCondition(['actor-2','actor-4','unknown'].includes(m.observedState.holder),'Invalid known holder');integer(m.observedState.condition);requireCondition(m.observedState.condition<=100&&(m.observedState.effect===null||EFFECTS.includes(m.observedState.effect)),'Invalid observed outcome');
   }else{
    fields(m,['eventSeq','tick','utterance','reply','memoryRefs']);requireCondition(short(m.utterance,240)&&m.utterance.length>0&&short(m.reply,240)&&m.reply.length>0,'Invalid attributed speech');denseArray(m.memoryRefs,3);let last=0;for(const ref of m.memoryRefs){integer(ref,1);requireCondition(ref>last&&ref<m.eventSeq,'Invalid speech source');last=ref;}
   }
  }}
  for(const m of social.actors[i].memories){const saved=a.episodes.find(e=>e.eventSeq===m.eventSeq);requireCondition(m.eventSeq<=a.throughEventSeq&&(!saved||same(base(saved),m)),'Observation not processed or rewritten');}
 }
}

const TOPICS=[
 ['harm',/信任|原谅|两清|伤害|砸|威胁|抢|偷|欺骗|害怕|忘掉|忘记|否认/u,['smash','damage','threaten','rob','steal','apologize','help','return']],
 ['repair',/修|损坏|坏了|耐久|帮助|帮过/u,['help','smash','damage','agreement']],
 ['loan',/借|归还|还给|还了|迟|逾期|期限|条款|约定|领取/u,['agreement','overdue','return','ask-help','help']],
 ['loss',/不见|丢|失踪|拿走|谁拿|小偷|偷/u,['missing','steal','rob','return']],
 ['food',/粮|吃|饿|赠|送过|口粮/u,['gift']],
 ['apology',/道歉|对不起|赔礼/u,['apologize','smash','rob','threaten','steal','help','return']]
];
export function retrieveNpcEpisodes(episodes,text='',limit=12){
 integer(limit,1);requireCondition(limit<=12,'Recall limit exceeded');
 const relevant=new Set(TOPICS.filter(([,pattern])=>pattern.test(text)).flatMap(([, ,kinds])=>kinds));
 const scored=episodes.map((m,i)=>({m,score:(relevant.has(m.kind)?100:0)+m.importance*5+i/Math.max(1,episodes.length)}));
 // Keep four current observations, so recalling an injury carries its later repair/return too.
 const latest=episodes.slice(-Math.min(4,limit)),selected=new Map(latest.map(m=>[m.eventSeq,m]));
 // Related follow-up sources must survive a crowd of high-importance injuries.
 for(const kind of ['return','help','apologize','missing','smash','damage','overdue','agreement','gift','threaten','steal','rob','ask-help']){
  if(selected.size>=limit)break;
  if(relevant.has(kind)){const m=episodes.filter(e=>e.kind===kind).at(-1);if(m)selected.set(m.eventSeq,m);}
 }
 for(const {m} of scored.sort((a,b)=>b.score-a.score||b.m.eventSeq-a.m.eventSeq)){
  if(selected.size>=limit)break;selected.set(m.eventSeq,m);
 }
 return [...selected.values()].sort((a,b)=>a.eventSeq-b.eventSeq).map(m=>cloneData(m));
}

// Derived understanding, never a rewrite of an earlier episode or a relationship score.
export function npcMemoryUpdates(episodes,self){
 const latest=kinds=>episodes.filter(m=>kinds.includes(m.kind)).at(-1),updates=[];
 const damage=latest(['smash','damage']),repair=latest(['help']);
 if(damage){const follow=repair&&repair.eventSeq>damage.eventSeq?repair:null;
  updates.push({topic:'damage',status:self.knownHolder==='unknown'?'condition-uncertain':self.knownCondition===100?'repaired':'damage-remains',
   causeRefs:[damage.eventSeq],followUpRefs:follow?[follow.eventSeq]:[],meaning:'当前修理状态不删除曾经受损的经历；帮助不等于自动原谅。'});}
 const missing=latest(['missing']),returned=latest(['return']);
 if(missing)updates.push({topic:'loss',status:self.knownHolder==='actor-2'&&returned&&returned.eventSeq>missing.eventSeq?'recovered':'not-confirmed-recovered',
  causeRefs:[missing.eventSeq],followUpRefs:returned&&returned.eventSeq>missing.eventSeq?[returned.eventSeq]:[],meaning:'后来的归还只能证明归还行为，不能证明归还者就是之前的小偷。'});
 const overdue=latest(['overdue']);
 if(overdue)updates.push({topic:'overdue',status:returned&&returned.eventSeq>overdue.eventSeq?'returned-after-breach':'not-confirmed-returned',
  causeRefs:[overdue.eventSeq],followUpRefs:returned&&returned.eventSeq>overdue.eventSeq?[returned.eventSeq]:[],meaning:'已归还和曾经逾期可以同时成立；归还不删除逾期。'});
 const apology=latest(['apologize']);
 if(apology)updates.push({topic:'apology',status:apology.observedState?.effect==='refused'?'repeated-or-refused':'heard-apology',causeRefs:[apology.eventSeq],followUpRefs:[],meaning:'只记录收到道歉，不推断已赔偿、已修好或已原谅。'});
 return updates;
}
