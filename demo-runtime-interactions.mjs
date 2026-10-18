import {validateCampaignReceipt} from './runtime-campaign-contract.mjs';
// Display affordances for existing commands only. The runtime remains authority.
export function interactionActions(group,writable,actorId,quantity=1){
 const p=group?.player.self,active=group?.encounter.encounter?.status==='active';
 const ready=!!(p&&writable&&p.identity.alive&&!active&&group.map.order?.status!=='marching');
 const actor=group?.map.actors.find(a=>a.actorId===actorId),near=!!(actor?.alive&&actor.canInteract);
 const village=p?.identity.location==='village',work=group?.player.actions.work;
 const trade=ready&&near&&actorId==='actor-3'&&village&&!!group.player.actions.canTrade;
 const valid=Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=Math.min(10,group?.player.actions.maxQuantity??10);
 const product=id=>({buy:!!(trade&&valid&&p.wallet>=group.player.actions.prices[id].buy*quantity&&p.inventory[id]<=1000-quantity),
   sell:!!(trade&&valid&&p.inventory[id]>=quantity)});
 return {rest:ready,work:!!(ready&&near&&actorId==='actor-1'&&village&&work&&p.fatigue<=700&&work.nextWorkTick<=group.map.tick),
  gift:!!(ready&&near&&actorId==='actor-2'&&group.scene.actors.find(a=>a.actorId===actorId)?.gift?.available),
  trade:!!trade,quantityValid:valid,food:product('food'),herbs:product('herbs')};
}

export function personNavigation(group,writable,actorId){
 const actor=group?.map.actors.find(a=>a.actorId===actorId),valid=actor&&Number.isSafeInteger(actor.x)&&actor.x>=0&&actor.x<20&&Number.isSafeInteger(actor.y)&&actor.y>=0&&actor.y<12;
 if(!valid)return {visible:false,canApproach:false,target:null};
 return {visible:true,canApproach:!!(writable&&actor.alive&&!actor.canInteract&&group.player.self.identity.alive&&
  group.encounter.encounter?.status!=='active'&&group.map.budget.remainingCommands>=3),target:{x:actor.x,y:actor.y}};
}

const actionNames={PlayerWork:'村庄工作',PlayerRest:'休整',PlayerGiftFood:'赠送粮食',AdvanceTime:'等待',
 MarchSet:'下达行军目的地',MarchPause:'暂停行军',MarchResume:'继续行军',MarchStep:'行军',
 EncounterBegin:'开始遭遇',EncounterAction:'战斗回合',EncounterCancel:'取消遭遇'};
const reasons={RULE_REJECTED:'当前条件不满足；请检查所在地点、疲劳、工作间隔或可用资产。',
 PLAYER_DEAD:'玩家已死亡，操作无法完成。',ENCOUNTER_BUSY:'战斗尚未结束，请先完成当前遭遇。',
 ENCOUNTER_UNAVAILABLE:'当前没有可操作的遭遇。',ENCOUNTER_CLOSED:'这次遭遇已经结束。',ENCOUNTER_ID_MISMATCH:'遭遇已发生变化，请查看当前战斗。',
 NOT_COLOCATED:'与对方距离太远，请先走近。',RECIPIENT_DEAD:'对方已死亡，无法收取。',NO_FOOD:'行囊里没有可赠送的粮食。',RECIPIENT_FULL:'对方暂时无法再收取粮食。'};

export function describeActionReceipt(receipt,dto){
 if(!validateCampaignReceipt(receipt,dto,receipt?.fromTick))return null;
 const result=receipt.result,product={food:'粮食',herbs:'药草'}[dto.payload.product];
 const name=['PlayerBuy','PlayerSell'].includes(dto.type)?(dto.type==='PlayerBuy'?'买入':'卖出')+product:actionNames[dto.type];
 const succeeded=receipt.outcome==='succeeded',changes=[];
 if(succeeded){
  const delta=(label,before,after)=>{if(Number.isSafeInteger(before)&&Number.isSafeInteger(after)&&before!==after)changes.push(label+' '+(after>before?'+':'')+(after-before));};
  for(const [key,label] of [['wallet','金币'],['fatigue','疲劳'],['playerHealth','生命'],['wolfHealth','森林狼生命']])delta(label,result?.before?.[key],result?.after?.[key]);
  for(const [key,label] of [['food','粮食'],['herbs','药草']])delta(label,result?.before?.inventory?.[key],result?.after?.inventory?.[key]);
  if(dto.type==='PlayerGiftFood')changes.push('粮食 -'+result.quantity,'对方已收到粮食');
  if(dto.type==='MarchSet')changes.push('目的地 ('+dto.payload.x+', '+dto.payload.y+')');
  if(result?.after?.resolution)changes.push('战斗结果：'+({win:'胜利',lose:'败北',flee:'逃离',cancel:'已取消','player-died':'玩家死亡'}[result.after.resolution]??'已结束'));
 }
 const minutes=receipt.durationTicks*10,hours=Math.floor(minutes/60),remaining=minutes%60;
 const elapsed=Number.isSafeInteger(minutes)?(hours?hours+'小时':'')+(remaining?remaining+'分钟':''):receipt.durationTicks+'刻';
 return {commandId:receipt.commandId,type:dto.type,outcome:receipt.outcome,summary:name+(succeeded?' · 已完成':' · 未完成'),changes,
  reason:succeeded?'':reasons[result?.reasonCode??result?.code]??'当前世界状态不允许完成这项操作。',
  time:'世界时刻 '+receipt.fromTick+' → '+receipt.tick+' · '+(receipt.durationTicks?'推进'+elapsed+'（'+receipt.durationTicks+'刻）':'未推进世界时间')};
}

export function recordConfirmedAction(history,receipt,dto){
 const view=describeActionReceipt(receipt,dto);
 if(!view||history.some(entry=>entry.commandId===view.commandId))return history;
 return [view,...history].slice(0,8);
}
