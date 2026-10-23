// Browser/runtime shared wire shape. No world state or private relationship scores.
export const SOCIAL_ACTIONS=Object.freeze(['talk','threaten','steal','rob','smash','help','return','apologize','ask-help']);
export const SOCIAL_TOPICS=Object.freeze(['needs','past','relationship']);
export const SOCIAL_REASONS=Object.freeze(['PLAYER_DEAD','RECIPIENT_DEAD','NOT_COLOCATED','ENCOUNTER_BUSY','RULE_REJECTED','ASSET_UNAVAILABLE','NOT_DAMAGED','NOT_HELD']);
export const SOCIAL_EFFECTS=Object.freeze(['talked','threatened','caught','taken','resisted','smashed','repaired','returned','apologized','refused','lent']);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const text=s=>typeof s==='string'&&s.length<=300;
const refs=xs=>Array.isArray(xs)&&xs.length<=3&&xs.every((n,i)=>nat(n)&&n>0&&(i===0||n>xs[i-1]));
export function validSocialPayload(p){return exact(p,p?.action==='talk'?['targetId','action','topic']:['targetId','action'])&&
 p.targetId==='actor-2'&&SOCIAL_ACTIONS.includes(p.action)&&(p.action!=='talk'||SOCIAL_TOPICS.includes(p.topic));}
const assetState=a=>exact(a,['holderId','condition'])&&['actor-2','actor-4'].includes(a.holderId)&&nat(a.condition)&&a.condition<=100;
export function validSocialResult(r,p){
 if(!(validSocialPayload(p)&&exact(r,['actorId','action','topic','effect','speech','asset','sourceEventSeq','memoryRefs'])&&
 r.actorId===p.targetId&&r.action===p.action&&r.topic===(p.topic??null)&&SOCIAL_EFFECTS.includes(r.effect)&&text(r.speech)&&
 (r.asset===null||exact(r.asset,['before','after'])&&assetState(r.asset.before)&&assetState(r.asset.after))&&nat(r.sourceEventSeq)&&r.sourceEventSeq>0&&refs(r.memoryRefs)&&r.memoryRefs.every(n=>n<r.sourceEventSeq)))return false;
 const effects={talk:['talked'],threaten:['threatened'],steal:['caught','taken'],rob:['resisted','taken'],smash:['smashed'],help:['repaired'],return:['returned'],apologize:['apologized','refused'],'ask-help':['lent','refused']};
 if(!effects[p.action].includes(r.effect)||p.action!=='talk'&&r.memoryRefs.length)return false;
 if(['talk','threaten','apologize'].includes(p.action)||p.action==='ask-help'&&r.effect==='refused')return r.asset===null&&r.speech.length>0;
 if(r.asset===null)return false;
 const {before:b,after:a}=r.asset;
 if(p.action==='return')return b.holderId==='actor-4'&&a.holderId==='actor-2'&&a.condition===b.condition;
 if(b.holderId!=='actor-2')return false;
 if(['taken','lent'].includes(r.effect))return a.holderId==='actor-4'&&a.condition===b.condition&&(r.effect!=='lent'||b.condition>=40);
 if(a.holderId!==b.holderId)return false;
 if(r.effect==='smashed')return b.condition>0&&a.condition===Math.max(0,b.condition-40);
 if(r.effect==='repaired')return b.condition<100&&a.condition===Math.min(100,b.condition+20);
 return a.condition===b.condition;
}
export function validSocialView(s){return exact(s,['npc','asset','actions'])&&
 (s.npc===null||exact(s.npc,['actorId','stance','speech','memoryRefs'])&&s.npc.actorId==='actor-2'&&
 ['calm','warm','wary','afraid'].includes(s.npc.stance)&&text(s.npc.speech)&&refs(s.npc.memoryRefs))&&
 (s.asset===null||exact(s.asset,['assetId','name','holderId','condition','x','y'])&&s.asset.assetId==='hunter-tools'&&s.asset.name==='猎人的工具包'&&
 assetState({holderId:s.asset.holderId,condition:s.asset.condition})&&nat(s.asset.x)&&s.asset.x<20&&nat(s.asset.y)&&s.asset.y<12)&&
 Array.isArray(s.actions)&&s.actions.length===SOCIAL_ACTIONS.length&&s.actions.every((a,i)=>exact(a,['action','available','reasonCode'])&&a.action===SOCIAL_ACTIONS[i]&&
 typeof a.available==='boolean'&&(a.available?a.reasonCode===null:SOCIAL_REASONS.includes(a.reasonCode)));}

export function validSocialMapView(map){
 const s=map?.social;if(!validSocialView(s)||!Array.isArray(map.actors))return false;
 const distance=p=>Math.max(Math.abs(p.x-map.self.x),Math.abs(p.y-map.self.y));
 const npc=map.actors.find(a=>a.actorId==='actor-2');
 if((s.npc!==null)!==!!(npc?.alive&&distance(npc)<=1))return false;
 if(s.asset===null)return distance({x:5,y:8})>4;
 return s.asset.holderId==='actor-4'?s.asset.x===map.self.x&&s.asset.y===map.self.y:
  s.asset.x===5&&s.asset.y===8&&distance(s.asset)<=4;
}
