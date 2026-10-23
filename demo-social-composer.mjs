import {interpretSocialText,intentKey} from './demo-social-language.mjs';
import {validateCampaignReceipt} from './runtime-campaign-contract.mjs';
import {socialInteractionActions,socialActionNames} from './demo-runtime-interactions.mjs';

export function socialIntentLabel(p){return p.action==='talk'?({needs:'询问近况与需要',past:'询问共同经历',relationship:'询问彼此关系'})[p.topic]:
 ({help:'帮助修理猎人的工具包','ask-help':'请求借用猎人的工具包',return:'归还猎人的工具包',steal:'尝试偷取猎人的工具包',rob:'抢夺猎人的工具包',smash:'砸坏猎人的工具包'})[p.action]??socialActionNames[p.action];}

// Called only at createDemoClient.onReceipt, after that client checks the source
// world and refreshes coherent projections. Receipts alone carry no world ID.
// Short reference context comes only from a validated, current committed receipt.
// Nothing in this module can inspect NPC private memory or mutate the world.
export function confirmedSocialContext(receipt,dto,group){
 if(dto?.type!=='PlayerInteract'||!validateCampaignReceipt(receipt,dto,receipt?.fromTick)||receipt.outcome!=='succeeded'||
  group?.snapshot.revision!==receipt.toRevision||!group?.map.social)return null;
 return Object.freeze({simulationId:group.snapshot.simulationId,revision:receipt.toRevision,targetId:'actor-2',confirmed:true,
  tool:['steal','rob','smash','help','return','ask-help'].includes(dto.payload.action)});
}

export function createSocialTextComposer(){
 let draft=null,recent=null;
 const current=(frame,g,id)=>frame&&id==='actor-2'&&frame.simulationId===g?.snapshot.simulationId&&frame.revision===g?.snapshot.revision;
 const reset=()=>{draft=null;recent=null;};
 function edit(text,group,actorId){
  if(!group?.map.social||actorId!=='actor-2'){reset();return null;}
  if(!current(recent,group,actorId))recent=null;
  const resolution=interpretSocialText(text,recent);
  draft={text,simulationId:group.snapshot.simulationId,revision:group.snapshot.revision,targetId:actorId,resolution,
   chosen:resolution.status==='ready'?0:null};
  return view(group,false,actorId);
 }
 function observe(group,actorId){
  if(actorId!=='actor-2'||!group?.map.social||draft&&draft.simulationId!==group.snapshot.simulationId){reset();return;}
  if(!current(recent,group,actorId))recent=null;
 }
 function view(group,writable,actorId){
  if(!draft)return {status:'empty',text:'',message:'写下想说的话或想做的事。',choices:[],selected:null,canSubmit:false};
  if(!current(draft,group,actorId))return {status:'stale',text:draft.text,message:'人物或世界状态已变化，请重新理解这句话后再执行。',choices:[],selected:null,canSubmit:false};
  const selected=draft.chosen===null?null:draft.resolution.candidates[draft.chosen];
  const available=selected&&socialInteractionActions(group,writable)[selected.action];
  return {status:draft.resolution.status,text:draft.text,message:selected?('将对猎人执行：'+socialIntentLabel(selected)+(available?'。':'。当前无法执行，请检查距离、物品和当前活动。')):draft.resolution.message,
   choices:draft.resolution.candidates.map((p,i)=>({index:i,key:intentKey(p),label:socialIntentLabel(p)})),
   selected:selected?socialIntentLabel(selected):null,canSubmit:!!available};
 }
 function choose(index,group,actorId){
  if(!current(draft,group,actorId)||draft.resolution.status!=='clarify'||!Number.isSafeInteger(index)||index<0||index>=draft.resolution.candidates.length)throw Error('请重新理解并选择一个明确意思。');
  draft.chosen=index;
 }
 function command(group,writable,actorId){
  const state=view(group,writable,actorId);if(!state.canSubmit)throw Error(state.message);
  return {...draft.resolution.candidates[draft.chosen]};
 }
 function confirmed(receipt,dto,group){
  // A receipt from a button action is equally authoritative. Uncertain or rejected
  // requests never establish a new referent; unrelated commands clear old context.
  recent=confirmedSocialContext(receipt,dto,group);draft=null;
 }
 return Object.freeze({edit,observe,view,choose,command,confirmed,reset});
}
