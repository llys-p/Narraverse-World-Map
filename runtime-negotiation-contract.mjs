import {validSocialPayload} from './runtime-social-contract.mjs';

export const NEGOTIATION_MAP_VERSION='campaign-map-v4';
export const NEGOTIATION_COMMANDS=Object.freeze(['PlayerNegotiate','PlayerAgreement','PlayerDialogue']);
export const AGREEMENT_STATUSES=Object.freeze(['offered','accepted','ready','borrowed','fulfilled','breached','returned-late','expired','cancelled','invalidated']);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const optionalTick=n=>n===null||nat(n);
export const dialogueText=(s,max=240)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\p{Cf}\p{Cs}\u0000-\u001f\u007f]/u.test(s);
export const validRepairTerms=t=>exact(t,['repairAmount','loanTicks'])&&[20,40].includes(t.repairAmount)&&[36,72,144].includes(t.loanTicks);
export function validProposal(p){return p===null||exact(p,['type','payload'])&&
 (p.type==='PlayerInteract'?validSocialPayload(p.payload):p.type==='PlayerNegotiate'&&validNegotiationPayload(p.type,p.payload));}
export const validMemoryRefs=refs=>Array.isArray(refs)&&refs.length<=3&&refs.every((n,i)=>nat(n)&&n>0&&(i===0||n>refs[i-1]));
export function validModelReply(r){return exact(r,['reply','memoryRefs','proposal'])&&dialogueText(r.reply)&&validMemoryRefs(r.memoryRefs)&&validProposal(r.proposal);}
export function validNegotiationPayload(type,p){
 if(type==='PlayerNegotiate')return exact(p,['targetId','terms'])&&p.targetId==='actor-2'&&validRepairTerms(p.terms);
 if(type==='PlayerAgreement')return exact(p,['targetId','agreementId','action'])&&p.targetId==='actor-2'&&dialogueText(p.agreementId,128)&&['accept','claim','decline'].includes(p.action);
 if(type==='PlayerDialogue')return exact(p,['targetId','utterance','reply','memoryRefs','proposal','model','seal'])&&p.targetId==='actor-2'&&
  dialogueText(p.utterance)&&validModelReply({reply:p.reply,memoryRefs:p.memoryRefs,proposal:p.proposal})&&dialogueText(p.model,80)&&typeof p.seal==='string'&&/^[a-f0-9]{64}$/u.test(p.seal);
 return false;
}
export function validAgreement(a,tick=Number.MAX_SAFE_INTEGER){
 if(!exact(a,['id','terms','targetCondition','status','offeredTick','expiresTick','acceptedTick','repairProgress','claimTick','dueTick','closedTick','eventSeq'])||
  !dialogueText(a.id,128)||!validRepairTerms(a.terms)||!nat(a.targetCondition)||a.targetCondition<40||a.targetCondition>100||
  !AGREEMENT_STATUSES.includes(a.status)||!nat(a.offeredTick)||a.offeredTick>tick||!nat(a.expiresTick)||a.expiresTick<a.offeredTick||
  !nat(a.repairProgress)||a.repairProgress>a.terms.repairAmount||![a.acceptedTick,a.claimTick,a.dueTick,a.closedTick].every(optionalTick)||!nat(a.eventSeq)||a.eventSeq<1)return false;
 if([a.acceptedTick,a.claimTick,a.closedTick].some(n=>n!==null&&(n<a.offeredTick||n>tick)))return false;
 if((a.claimTick===null)!==(a.dueTick===null)||a.claimTick!==null&&(a.acceptedTick===null||a.claimTick<a.acceptedTick||a.dueTick!==a.claimTick+a.terms.loanTicks))return false;
 if(['accepted','ready','borrowed','fulfilled','breached','returned-late'].includes(a.status)&&a.acceptedTick===null)return false;
 if(['ready','borrowed','fulfilled','breached','returned-late'].includes(a.status)&&a.repairProgress<a.terms.repairAmount)return false;
 if(['borrowed','fulfilled','breached','returned-late'].includes(a.status)&&a.claimTick===null)return false;
 if(['offered','accepted','ready','borrowed'].includes(a.status)?a.closedTick!==null:a.closedTick===null)return false;
 if(a.expiresTick!==(a.acceptedTick??a.offeredTick)+144)return false;
 if(['offered','cancelled'].includes(a.status)&&(a.acceptedTick!==null||a.repairProgress!==0))return false;
 if(['offered','accepted','ready','cancelled','expired'].includes(a.status)&&a.claimTick!==null)return false;
 if(a.status==='expired'&&a.closedTick<=a.expiresTick)return false;
 if(a.status==='fulfilled'&&a.closedTick>a.dueTick||['breached','returned-late'].includes(a.status)&&a.closedTick<=a.dueTick)return false;
 return true;
}
export function validDialogueTurn(t,tick=Number.MAX_SAFE_INTEGER){return exact(t,['eventSeq','tick','utterance','reply','memoryRefs','proposal','model'])&&
 nat(t.eventSeq)&&t.eventSeq>0&&nat(t.tick)&&t.tick<=tick&&dialogueText(t.utterance)&&dialogueText(t.model,80)&&
 validModelReply({reply:t.reply,memoryRefs:t.memoryRefs,proposal:t.proposal})&&t.memoryRefs.every(n=>n<t.eventSeq);}
export function validNegotiationView(v,tick){return exact(v,['agreement','lastTurn','canPropose','canAccept','canClaim','canDecline','canTalk'])&&
 (v.agreement===null||validAgreement(v.agreement,tick))&&(v.lastTurn===null||validDialogueTurn(v.lastTurn,tick))&&
 ['canPropose','canAccept','canClaim','canDecline','canTalk'].every(k=>typeof v[k]==='boolean')&&
 (!(v.canPropose||v.canAccept||v.canClaim||v.canDecline)||v.canTalk)&&
 (!(v.canAccept||v.canDecline)||v.agreement?.status==='offered')&&(!v.canClaim||v.agreement?.status==='ready')&&
 (!v.canPropose||!['accepted','ready','borrowed'].includes(v.agreement?.status));}
const same=(a,b)=>a===b||a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&
 Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
const state=a=>exact(a,['holderId','condition'])&&['actor-2','actor-4'].includes(a.holderId)&&nat(a.condition)&&a.condition<=100;
export function validNegotiationResult(r,dto,tick){
 if(!validNegotiationPayload(dto.type,dto.payload))return false;
 const p=dto.payload;
 if(dto.type==='PlayerDialogue')return exact(r,['actorId','speech','memoryRefs','proposal','sourceEventSeq'])&&r.actorId==='actor-2'&&
  r.speech===p.reply&&same(r.memoryRefs,p.memoryRefs)&&same(r.proposal,p.proposal)&&nat(r.sourceEventSeq)&&r.sourceEventSeq>0&&p.memoryRefs.every(n=>n<r.sourceEventSeq);
 if(!exact(r,['actorId','effect','speech','agreement','asset','sourceEventSeq'])||r.actorId!=='actor-2'||!dialogueText(r.speech,300)||!nat(r.sourceEventSeq)||r.sourceEventSeq<1||
  r.agreement!==null&&!validAgreement(r.agreement,tick))return false;
 if(dto.type==='PlayerNegotiate')return ['offered','countered','refused'].includes(r.effect)&&r.asset===null&&
  (r.effect==='refused'||r.agreement?.status==='offered'&&r.agreement.id===dto.commandId&&r.agreement.eventSeq===r.sourceEventSeq&&
   (r.effect==='offered'?same(r.agreement.terms,p.terms):!same(r.agreement.terms,p.terms)));
 if(r.agreement?.id!==p.agreementId||r.agreement.eventSeq!==r.sourceEventSeq)return false;
 if(p.action==='accept')return r.effect==='accepted'&&r.agreement.status==='accepted'&&r.agreement.acceptedTick===tick&&r.asset===null;
 if(p.action==='decline')return r.effect==='declined'&&r.agreement.status==='cancelled'&&r.asset===null;
 return p.action==='claim'&&r.effect==='lent'&&r.agreement.status==='borrowed'&&r.agreement.claimTick===tick&&
  exact(r.asset,['before','after'])&&state(r.asset.before)&&state(r.asset.after)&&r.asset.before.holderId==='actor-2'&&r.asset.after.holderId==='actor-4'&&
  r.asset.before.condition===r.asset.after.condition&&r.asset.after.condition>=r.agreement.targetCondition;
}
