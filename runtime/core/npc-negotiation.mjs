import {cloneData,fields,denseArray,requireCondition} from './data-contract.mjs';
import {auditSocial,rememberSocial} from './npc-social.mjs';
import {NEGOTIATION_MAP_VERSION,NEGOTIATION_COMMANDS,validNegotiationPayload,validAgreement,validDialogueTurn,validNegotiationResult} from '../../runtime-negotiation-contract.mjs';

const active=a=>a&&['accepted','ready','borrowed'].includes(a.status);
const model=w=>w.mapModel.negotiationModel,hunter=w=>w.mapModel.socialModel.actors[1],asset=w=>w.mapModel.socialModel.asset;
const assetState=w=>({holderId:asset(w).holderId,condition:asset(w).condition});
const alive=(w,id)=>w.actorModel.actors.find(a=>a.actorId===id).alive;
const remember=(w,seq,tick,text,actorId='actor-4')=>{if(alive(w,'actor-2'))rememberSocial(hunter(w),seq,tick,'agreement',actorId,'self',text,2);};
export const createNegotiationModel=()=>({version:'npc-negotiation-v1',agreement:null,turns:[]});
export function validateNegotiationModel(m,tick){
 fields(m,['version','agreement','turns']);requireCondition(m.version==='npc-negotiation-v1','Unsupported negotiation model');
 requireCondition(m.agreement===null||validAgreement(m.agreement,tick),'Invalid agreement');denseArray(m.turns,8);let seq=0;
 for(const turn of m.turns){requireCondition(validDialogueTurn(turn,tick)&&turn.eventSeq>seq,'Invalid dialogue history');seq=turn.eventSeq;}
}
export function preflightNegotiation(dto){requireCondition(validNegotiationPayload(dto.type,dto.payload),'Invalid negotiation payload');
 requireCondition(new TextEncoder().encode(JSON.stringify(dto)).length<=4096,'Dialogue exceeds command budget','LIMIT_EXCEEDED');}

export function auditNegotiation(world,dto){
 if(!NEGOTIATION_COMMANDS.includes(dto.type))return null;
 requireCondition(world.mapModel.version===NEGOTIATION_MAP_VERSION,'Negotiation requires a new negotiation world','COMMAND_UNSUPPORTED');
 const p=dto.payload,a=model(world).agreement,base=auditSocial(world,{type:'PlayerInteract',payload:{targetId:'actor-2',action:'talk',topic:'needs'}});
 let reason=base.reasonCode;
 if(!reason&&dto.type==='PlayerDialogue'){
  const known=new Set([...hunter(world).memories.map(m=>m.eventSeq),...model(world).turns.map(m=>m.eventSeq)]);
  if(!p.memoryRefs.every(ref=>known.has(ref)))reason='RULE_REJECTED';
 }else if(!reason){
  const pos=world.mapModel.position;if(Math.max(Math.abs(pos.x-5),Math.abs(pos.y-8))>1)reason='NOT_COLOCATED';
  else if(dto.type==='PlayerNegotiate'&&(active(a)||asset(world).holderId!=='actor-2'))reason='ASSET_UNAVAILABLE';
  else if(dto.type==='PlayerAgreement'){
   if(!a||a.id!==p.agreementId)reason='RULE_REJECTED';
   else if(p.action==='accept'&&a.status!=='offered'||p.action==='decline'&&a.status!=='offered'||p.action==='claim'&&a.status!=='ready')reason='RULE_REJECTED';
   else if(p.action!=='decline'&&asset(world).holderId!=='actor-2')reason='ASSET_UNAVAILABLE';
   else if(p.action==='claim'&&(asset(world).condition<a.targetCondition||hunter(world).fear>=40||hunter(world).grievance>=20))reason='RULE_REJECTED';
  }
 }
 return {outcome:reason?'rejected':'succeeded',reasonCode:reason,durationTicks:reason||dto.type==='PlayerDialogue'?0:1,worldCommand:true,directTicks:true,directCommand:true};
}
export function commitNegotiation(world,dto,tick,eventSeq){
 const m=model(world),p=dto.payload,h=hunter(world);let speech,effect,change=null;
 if(dto.type==='PlayerDialogue'){
  // These are attributed utterances, never additions to objective fact memory.
  const turn={eventSeq,tick,utterance:p.utterance,reply:p.reply,memoryRefs:cloneData(p.memoryRefs),proposal:cloneData(p.proposal),model:p.model};
  m.turns.push(turn);if(m.turns.length>8)m.turns.shift();
  const result={actorId:'actor-2',speech:p.reply,memoryRefs:cloneData(p.memoryRefs),proposal:cloneData(p.proposal),sourceEventSeq:eventSeq};
  requireCondition(validNegotiationResult(result,dto,tick),'Invalid dialogue result');return result;
 }
 if(dto.type==='PlayerNegotiate'){
  if(h.fear>=20||h.grievance>=20||asset(world).condition===100){effect='refused';speech=asset(world).condition===100?'工具已经完好，这次不需要以修理换借用。':'我现在还不愿与你订借用约定。先处理之前的事。';
   // A refused counterproposal must not leave an earlier offer silently usable.
   if(m.agreement?.status==='offered')Object.assign(m.agreement,{status:'cancelled',closedTick:tick,eventSeq});
  }else{
   const repairAmount=Math.min(100-asset(world).condition,asset(world).condition<=60?40:20);
   // Tool damage/repair changes in multiples of 20 in this bounded world.
   const terms={repairAmount,loanTicks:Math.min(p.terms.loanTicks,h.trust>=65?144:72)};
   effect=terms.repairAmount===p.terms.repairAmount&&terms.loanTicks===p.terms.loanTicks?'offered':'countered';
   m.agreement={id:dto.commandId,terms,targetCondition:asset(world).condition+repairAmount,status:'offered',offeredTick:tick,expiresTick:tick+144,
    acceptedTick:null,repairProgress:0,claimTick:null,dueTick:null,closedTick:null,eventSeq};
   speech=`我的条件是：接受后把工具实际修好${repairAmount}点，达到${m.agreement.targetCondition}耐久；我借你${terms.loanTicks/6}小时。接受后一天内修好并来领取。`;
  }
 }else{
  const a=m.agreement;a.eventSeq=eventSeq;
  if(p.action==='accept'){a.status='accepted';a.acceptedTick=tick;a.expiresTick=tick+144;effect='accepted';speech='约定记下了。等你实际修好，再到这里领取工具。';}
  if(p.action==='decline'){a.status='cancelled';a.closedTick=tick;effect='declined';speech='那就先不订这个约定。';}
  if(p.action==='claim'){
   const before=assetState(world);a.status='borrowed';a.claimTick=tick;a.dueTick=tick+a.terms.loanTicks;
   asset(world).holderId='actor-4';asset(world).loanDueTick=a.dueTick;h.knownHolder='actor-4';h.knownCondition=asset(world).condition;
   change={before,after:assetState(world)};effect='lent';speech=`你兑现了修理条件。工具借给你，请在借出后${a.terms.loanTicks/6}小时内带回并完成归还。`;
  }
 }
 remember(world,eventSeq,tick,speech);world.mapModel.socialModel.lastReply={text:speech,refs:[],tick};
 const result={actorId:'actor-2',effect,speech,agreement:cloneData(m.agreement),asset:change,sourceEventSeq:eventSeq};
 requireCondition(validNegotiationResult(result,dto,tick),'Invalid negotiation result');return result;
}

// Runs after the original social action, so existing repair/return/harm effects
// and relationship changes are applied once. No second reward or penalty here.
export function observeAgreementAction(world,dto,result,tick,seq){
 if(world.mapModel.version!==NEGOTIATION_MAP_VERSION)return result;
 const a=model(world).agreement;if(!a)return result;let note='';
 if(['accepted','ready'].includes(a.status)){
  if(dto.payload.action==='help'){
   a.repairProgress=Math.min(a.terms.repairAmount,a.repairProgress+result.asset.after.condition-result.asset.before.condition);
   a.status=a.repairProgress>=a.terms.repairAmount&&asset(world).condition>=a.targetCondition?'ready':'accepted';a.eventSeq=seq;
   note=a.status==='ready'?'修理条件已完成，你可以按约领取工具。':'还需继续实际修理，才能达到约定条件。';
  }else if(dto.payload.action==='smash'&&a.status==='ready'&&hunter(world).memories.some(m=>m.eventSeq===seq)){a.status='accepted';a.eventSeq=seq;note='工具又损坏了，当前不能按约领取。';}
  else if(asset(world).holderId!=='actor-2'&&hunter(world).knownHolder==='actor-4'){a.status='invalidated';a.closedTick=tick;a.eventSeq=seq;note='工具已被另行拿走，修理换借用的约定失效。';}
 }else if(['borrowed','breached'].includes(a.status)&&dto.payload.action==='return'){
  a.status=tick<=a.dueTick?'fulfilled':'returned-late';a.closedTick=tick;a.eventSeq=seq;
  note=a.status==='fulfilled'?'这次约定已按时完成。':'工具虽已归还，这次逾期的记录仍然保留。';
 }
 if(note){result.speech+=note;world.mapModel.socialModel.lastReply.text=result.speech;
  const memory=hunter(world).memories.find(x=>x.eventSeq===seq);if(memory)memory.text+=note;}
 return result;
}
export function observeAgreementTick(world,tick,append){
 if(world.mapModel.version!==NEGOTIATION_MAP_VERSION)return;
 const a=model(world).agreement;if(!a||!['offered','accepted','ready','borrowed'].includes(a.status))return;
 let status=null,text='',actorId='actor-4';
 if(!alive(world,'actor-2')||!alive(world,'actor-4')){status='invalidated';text='约定一方已死亡，约定停止。';}
 else if(['accepted','ready'].includes(a.status)&&hunter(world).knownHolder==='unknown'){
  status='invalidated';text='发现工具失踪，修理换借用的约定停止；没有看见是谁拿走的。';actorId=null;
 }
 else if(a.status==='borrowed'&&tick>a.dueTick){status='breached';text='工具没有按约归还，这次借用已逾期。';}
 else if(a.status!=='borrowed'&&tick>a.expiresTick){status='expired';text=a.status==='offered'?'借用条件未被接受，提议已过期。':'修理换借用未在约定期限内完成，约定已过期。';}
 if(!status){
  // Only observed damage changes the NPC's understanding of completed repairs.
  if(a.status==='ready'&&hunter(world).knownCondition<a.targetCondition){a.status='accepted';a.eventSeq=hunter(world).memories.at(-1)?.eventSeq??a.eventSeq;}
  return;
 }
 const seq=append({type:'NpcAgreementClosed',sourceSystem:'campaign',commandId:null,entityIds:['actor-2','actor-4'],causationEventSeqs:[a.eventSeq],payload:{agreementId:a.id,status,text}});
 Object.assign(a,{status,closedTick:tick,eventSeq:seq});remember(world,seq,tick,text,actorId);
}
export function negotiationView(world){
 const m=model(world),can=(type,payload)=>auditNegotiation(world,{type,payload}).outcome==='succeeded',id=m.agreement?.id??'none';
 return {agreement:cloneData(m.agreement),lastTurn:cloneData(m.turns.at(-1)??null),
  canPropose:can('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:20,loanTicks:72}}),
  canAccept:can('PlayerAgreement',{targetId:'actor-2',agreementId:id,action:'accept'}),canClaim:can('PlayerAgreement',{targetId:'actor-2',agreementId:id,action:'claim'}),
  canDecline:can('PlayerAgreement',{targetId:'actor-2',agreementId:id,action:'decline'}),
  canTalk:auditSocial(world,{type:'PlayerInteract',payload:{targetId:'actor-2',action:'talk',topic:'needs'}}).outcome==='succeeded'};
}
// Private server-to-provider context. Never merge into the player's map/scene.
export function npcDialogueContext(bundle){
 const s=bundle.snapshot,w=s.world;if(w.mapModel.version!==NEGOTIATION_MAP_VERSION)return null;
 const h=hunter(w),own=w.societyModel.agents[1].state,b=w.actorModel.actors.find(a=>a.actorId==='actor-2');
 return {simulationId:s.simulationId,revision:s.revision,tick:s.tick,targetId:'actor-2',
  persona:'村里的猎人，靠工具谋生，珍惜实际帮助；受伤害后不会因为一句好话就忘记。',
  self:{alive:b.alive,health:b.health,fatigue:b.fatigue,food:own.inventory.food,wallet:own.wallet,trust:h.trust,fear:h.fear,grievance:h.grievance,
   knownHolder:h.knownHolder,knownCondition:h.knownCondition},
  observations:cloneData(h.memories),agreement:cloneData(model(w).agreement),conversation:cloneData(model(w).turns),
  canTalk:negotiationView(w).canTalk};
}
