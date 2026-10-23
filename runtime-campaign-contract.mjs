// Strict DTO5 receipt consumption. Presentation never derives a combat outcome.
import {SOCIAL_REASONS,validSocialPayload,validSocialResult} from './runtime-social-contract.mjs';
import {NEGOTIATION_COMMANDS,validNegotiationPayload,validNegotiationResult} from './runtime-negotiation-contract.mjs';
const safeInteger=n=>Number.isSafeInteger(n)&&n>=0;
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const point=p=>exact(p,['x','y'])&&safeInteger(p.x)&&p.x<20&&safeInteger(p.y)&&p.y<12;
function validTurnEvents(events,result,command){
 if(!Array.isArray(events)||events.length>6)return false;
 let player=result.before.playerHealth,wolf=result.before.wolfHealth,hasStrike=false;
 for(const e of events){
  if(!exact(e,['kind','actorId','targetId','beforeHealth','afterHealth']))return false;
  const hp=n=>safeInteger(n)&&n<=1000;
  if(e.kind==='flee'){if(command.payload.action!=='flee'||e.actorId!=='actor-4'||e.targetId!==null||e.beforeHealth!==null||e.afterHealth!==null)return false;continue;}
  if(!hp(e.beforeHealth)||!hp(e.afterHealth))return false;
  if(e.kind==='player-strike'){if(command.payload.action!=='attack'||hasStrike||e.actorId!=='actor-4'||e.targetId!==result.encounterId||e.beforeHealth!==wolf||e.afterHealth>e.beforeHealth)return false;wolf=e.afterHealth;hasStrike=true;}
  else if(e.kind==='wolf-counter'){if(!hasStrike||wolf===0||e.actorId!==result.encounterId||e.targetId!=='actor-4'||e.beforeHealth!==player||e.afterHealth>e.beforeHealth)return false;player=e.afterHealth;}
  else if(e.kind==='world-settlement'){if(e.actorId!=='actor-4'||e.targetId!==null||e.beforeHealth!==player)return false;player=e.afterHealth;}
  else if(e.kind==='defeat'){if(e.targetId!==null||e.afterHealth!==0||!(e.actorId==='actor-4'?player===0:e.actorId===result.encounterId&&wolf===0))return false;}
  else return false;
 }
 return player===result.after.playerHealth&&wolf===result.after.wolfHealth&&
  (result.reasonCode!==null||command.payload.action!=='attack'||hasStrike);
}
function validWorldActionResult(result,dto,receipt){
  if(dto.type==='PlayerWork'){
    const fields=['actorId','type','startTick','endTick','wage','location','nextWorkTick','before','after'];
    const state=value=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===2 &&
      ['wallet','fatigue'].every(key=>Object.hasOwn(value,key)) && Number.isSafeInteger(value.wallet) && value.wallet>=0 &&
      Number.isSafeInteger(value.fatigue) && value.fatigue>=0 && value.fatigue<=1000;
    const resultOK=result && typeof result==='object' && !Array.isArray(result) && Object.keys(result).length===fields.length &&
      fields.every(key=>Object.hasOwn(result,key)) && result.actorId==='actor-4' && result.type==='PlayerWork' &&
      result.startTick===receipt.fromTick && result.endTick===receipt.tick && result.wage===20 && result.location==='village' &&
      Number.isSafeInteger(result.startTick+144) && Number.isSafeInteger(result.nextWorkTick) && result.nextWorkTick===result.startTick+144 &&
      state(result.before) && state(result.after) && result.after.wallet===result.before.wallet+20 &&
      Number.isSafeInteger(result.before.wallet+20) && result.before.fatigue<=700 && result.after.fatigue===result.before.fatigue+150 &&
      Number.isSafeInteger(result.before.fatigue+150);
    return receipt.durationTicks===36 && resultOK;
  }
  const fields=['actorId','type','startTick','endTick','product','quantity','unitPrice','amount','before','after'];
  const validState=row=>row && Object.keys(row).length===6 && ['location','fatigue','wallet','inventory','publicStock','communalGold'].every(key=>Object.hasOwn(row,key)) &&
    ['village','forest','road'].includes(row.location) && [row.fatigue,row.wallet,row.communalGold].every(n=>Number.isSafeInteger(n)&&n>=0) &&
    [row.inventory,row.publicStock].every(stock=>stock && Object.keys(stock).length===2 && [stock.food,stock.herbs].every(n=>Number.isSafeInteger(n)&&n>=0));
  if(!result || typeof result!=='object' || Array.isArray(result) || Object.keys(result).length!==fields.length || !fields.every(key=>Object.hasOwn(result,key)) ||
    result.actorId!=='actor-4' || result.type!==dto.type || result.startTick!==receipt.fromTick || result.endTick!==receipt.tick ||
    ![null,'food','herbs'].includes(result.product) || ![result.quantity,result.unitPrice,result.amount].every(n=>Number.isSafeInteger(n)&&n>=0))return false;
  if(['PlayerBuy','PlayerSell'].includes(dto.type)){
    if(result.product!==dto.payload.product || result.quantity!==dto.payload.quantity || result.unitPrice<1 ||
      !Number.isSafeInteger(result.quantity*result.unitPrice) || result.amount!==result.quantity*result.unitPrice)return false;
  }else if(result.product!==null || result.quantity!==0 || result.unitPrice!==0 || result.amount!==0)return false;
  if(dto.type==='PlayerTravel' && result.after?.location!==dto.payload.destination)return false;
  return validState(result.before)&&validState(result.after);
}
function validEncounterResult(result, command, receipt) {
  const resultFields = ['actorId','encounterId','action','before','after','reasonCode',...(command.type==='EncounterAction'?['turnEvents']:[])];
  const viewFields = ['tick','playerHealth','playerAlive','wolfHealth','totalLivingWolves','reservedWolves','availableWolves','battleDeaths','status','resolution'];
  const validView = view => view && typeof view === 'object' && !Array.isArray(view) && Object.keys(view).length === viewFields.length &&
    viewFields.every(key => Object.hasOwn(view,key)) && safeInteger(view.tick) && safeInteger(view.playerHealth) &&
    typeof view.playerAlive === 'boolean' && (view.wolfHealth === null || safeInteger(view.wolfHealth)) &&
    safeInteger(view.totalLivingWolves) && safeInteger(view.reservedWolves) && view.reservedWolves <= view.totalLivingWolves &&
    view.availableWolves === view.totalLivingWolves - view.reservedWolves && safeInteger(view.battleDeaths) &&
    ['none','active','closed'].includes(view.status) && [null,'win','lose','flee','cancel','player-died'].includes(view.resolution);
  const expectedAction = command.type === 'EncounterBegin' ? 'begin' : command.type === 'EncounterCancel' ? 'cancel' : command.payload.action;
  return result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === resultFields.length &&
    resultFields.every(key => Object.hasOwn(result,key)) && result.actorId === 'actor-4' && result.action === expectedAction &&
    (result.encounterId === null || (typeof result.encounterId === 'string' && result.encounterId.length > 0)) &&
    (command.type === 'EncounterBegin' || result.encounterId === command.payload.encounterId) &&
    (result.reasonCode === null || typeof result.reasonCode === 'string') &&
    ((receipt.outcome === 'succeeded' && result.reasonCode === null) || (receipt.outcome === 'rejected' && result.reasonCode !== null)) &&
    validView(result.before) && validView(result.after) && (command.type!=='EncounterAction'||validTurnEvents(result.turnEvents,result,command)) && result.before.tick === receipt.fromTick && result.after.tick === receipt.tick;
}

export function validateCampaignReceipt(r,dto,fromTick){
 const keys=['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','fromTick','tick','durationTicks','type','outcome','result'];
 if(dto?.version!==5||!exact(r,keys)||r.apiVersion!==1||r.receiptVersion!==5||r.status!=='committed'||r.commandId!==dto.commandId||r.type!==dto.type||r.fromRevision!==dto.expectedRevision||r.fromTick!==fromTick||
   ![r.fromRevision,r.toRevision,r.fromTick,r.tick,r.durationTicks].every(safeInteger)||r.fromTick>r.fromRevision||r.tick!==r.fromTick+r.durationTicks||r.toRevision!==r.fromRevision+Math.max(1,r.durationTicks)||!['succeeded','rejected'].includes(r.outcome))return false;
 const duration=dto.type==='MarchStep'?null:dto.type==='AdvanceTime'?dto.payload.ticks:dto.type==='PlayerWork'?36:['PlayerRest','EncounterAction'].includes(dto.type)?6:['PlayerBuy','PlayerSell','PlayerInteract','PlayerNegotiate','PlayerAgreement'].includes(dto.type)?1:0;
 if(duration!==null&&!(r.durationTicks===duration||r.outcome==='rejected'&&r.durationTicks===0))return false;
 if(r.type==='PlayerInteract')return validSocialPayload(dto.payload)&&(r.outcome==='succeeded'?validSocialResult(r.result,dto.payload):exact(r.result,['code'])&&SOCIAL_REASONS.includes(r.result.code));
 if(NEGOTIATION_COMMANDS.includes(r.type))return validNegotiationPayload(dto.type,dto.payload)&&(r.outcome==='succeeded'?validNegotiationResult(r.result,dto,r.tick):exact(r.result,['code'])&&SOCIAL_REASONS.includes(r.result.code));
 if(r.type.startsWith('March')){
   if(!['MarchSet','MarchPause','MarchResume','MarchStep'].includes(r.type))return false;
   if(r.outcome==='rejected')return r.durationTicks===0&&exact(r.result,['code'])&&['RULE_REJECTED','PLAYER_DEAD','ENCOUNTER_BUSY'].includes(r.result.code);
   const v=r.result;
   return exact(v,['action','before','after','stepsMoved','status','contact'])&&v.action===r.type&&point(v.before)&&point(v.after)&&safeInteger(v.stepsMoved)&&
    (r.type==='MarchStep'?[1,2].includes(r.durationTicks)&&v.stepsMoved<=r.durationTicks:r.durationTicks===0&&v.stepsMoved===0&&v.before.x===v.after.x&&v.before.y===v.after.y)&&
    ['idle','marching','paused','arrived'].includes(v.status)&&(v.contact===null||exact(v.contact,['actorId','tick'])&&['actor-1','actor-2','actor-3'].includes(v.contact.actorId)&&safeInteger(v.contact.tick)&&v.contact.tick<=r.tick);
 }
 if(['EncounterBegin','EncounterAction','EncounterCancel'].includes(r.type))return validEncounterResult(r.result,dto,r);
 if(r.type==='PlayerGiftFood')return r.durationTicks===0&&exact(r.result,['donorId','recipientId','product','quantity','sourceEventSeq','reasonCode'])&&r.result.donorId==='actor-4'&&r.result.recipientId===dto.payload.recipientId&&r.result.product==='food'&&r.result.quantity===1&&
  (r.outcome==='succeeded'?r.result.reasonCode===null&&safeInteger(r.result.sourceEventSeq)&&r.result.sourceEventSeq>0:typeof r.result.reasonCode==='string'&&r.result.sourceEventSeq===null);
 if(r.outcome==='rejected')return exact(r.result,['code'])&&['RULE_REJECTED','PLAYER_DEAD','ENCOUNTER_BUSY'].includes(r.result.code);
 if(r.type==='AdvanceTime')return r.result===null;
 return ['PlayerRest','PlayerWork','PlayerBuy','PlayerSell'].includes(r.type)&&validWorldActionResult(r.result,dto,r);
}
