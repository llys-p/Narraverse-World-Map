import {validateCampaignReceipt} from './runtime-campaign-contract.mjs';
import {SOCIAL_ACTIONS} from './runtime-social-contract.mjs';
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
 return {rest:ready,work:!!(ready&&near&&actorId==='actor-1'&&village&&work&&p.health>=300&&p.fatigue<=700&&(work.nextWorkTick??0)<=group.map.tick),
  gift:!!(ready&&near&&actorId==='actor-2'&&group.scene.actors.find(a=>a.actorId===actorId)?.gift?.available),
  trade:!!trade,quantityValid:valid,food:product('food'),herbs:product('herbs')};
}

export const socialActionNames=Object.freeze({talk:'交流',threaten:'威胁',steal:'尝试偷取',rob:'抢夺',smash:'破坏工具',help:'帮助修理',return:'归还工具',apologize:'道歉','ask-help':'请求借工具'});
export function socialInteractionActions(group,writable){
 const ready=!!(writable&&group?.player.self.identity.alive&&group.encounter.encounter?.status!=='active'&&group.map.order?.status!=='marching');
 return Object.fromEntries(SOCIAL_ACTIONS.map(action=>[action,!!(ready&&group?.map.social?.actions.find(a=>a.action===action)?.available)]));
}

export function worldTimeView(group,writable){
 const tick=group.map.tick,day=Math.floor(tick/144),hour=Math.floor(tick%144/6),minute=tick%6*10;
 const p=group.player.self,active=group.encounter.encounter?.status==='active',marching=group.map.order?.status==='marching';
 const canWait=!!(writable&&p.identity.alive&&!active&&!marching),remaining=Math.max(0,(group.player.actions.work?.nextWorkTick??0)-tick);
 let workHint='已满足工作间隔；是否成功仍以世界确认为准。';
 if(!p.identity.alive)workHint='玩家已死亡，无法工作。';
 else if(!writable)workHint='连接或当前操作尚未就绪。';
 else if(active)workHint='请先结束战斗。';
 else if(marching)workHint='请先暂停行军。';
 else if(p.identity.location!=='village')workHint='需要位于村庄才能工作。';
 else if(p.health<300)workHint='生命不足300，暂不能工作。';
 else if(p.fatigue>700)workHint='疲劳高于700，请先休整。';
 else if(remaining){const hours=Math.floor(remaining/6),minutes=remaining%6*10;workHint='距离下次可开始工作还需 '+(hours?hours+'小时':'')+(minutes?minutes+'分钟':'')+'（世界时间）。';}
 return {clockText:'第 '+day+' 天 '+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'),canWait,
  workReady:!!(canWait&&p.identity.location==='village'&&p.health>=300&&p.fatigue<=700&&remaining===0&&group.player.actions.work),workHint};
}

export function personNavigation(group,writable,actorId){
 const actor=group?.map.actors.find(a=>a.actorId===actorId),valid=actor&&Number.isSafeInteger(actor.x)&&actor.x>=0&&actor.x<20&&Number.isSafeInteger(actor.y)&&actor.y>=0&&actor.y<12;
 if(!valid)return {visible:false,canApproach:false,target:null};
 return {visible:true,canApproach:!!(writable&&actor.alive&&!actor.canInteract&&group.player.self.identity.alive&&
  group.encounter.encounter?.status!=='active'&&group.map.budget.remainingCommands>=3),target:{x:actor.x,y:actor.y}};
}

const actionNames={PlayerQuest:'任务进度',PlayerNegotiate:'提出修理换借用',PlayerAgreement:'处理约定',PlayerDialogue:'与猎人交谈',PlayerWork:'村庄工作',PlayerRest:'休整',PlayerGiftFood:'赠送粮食',AdvanceTime:'等待',
 MarchSet:'下达行军目的地',MarchPause:'暂停行军',MarchResume:'继续行军',MarchStep:'行军',
 EncounterBegin:'开始遭遇',EncounterAction:'战斗回合',EncounterCancel:'取消遭遇'};
const reasons={RULE_REJECTED:'当前条件不满足；请检查所在地点、疲劳、工作间隔或可用资产。',
 PLAYER_DEAD:'玩家已死亡，操作无法完成。',ENCOUNTER_BUSY:'战斗尚未结束，请先完成当前遭遇。',
 ENCOUNTER_UNAVAILABLE:'当前没有可操作的遭遇。',ENCOUNTER_CLOSED:'这次遭遇已经结束。',ENCOUNTER_ID_MISMATCH:'遭遇已发生变化，请查看当前战斗。',
 NOT_COLOCATED:'与人物或工具距离太远；互动期间对方也可能移动，请重新走近。',RECIPIENT_DEAD:'对方已死亡，无法交互。',NO_FOOD:'行囊里没有可赠送的粮食。',RECIPIENT_FULL:'对方暂时无法再收取粮食。',
 ASSET_UNAVAILABLE:'工具当前不在原处，或已无法继续破坏。',NOT_DAMAGED:'工具完好，无需修理。',NOT_HELD:'你没有持有这件工具。'};

export function describeActionReceipt(receipt,dto){
 if(!validateCampaignReceipt(receipt,dto,receipt?.fromTick))return null;
 const result=receipt.result,product={food:'粮食',herbs:'药草'}[dto.payload.product];
 const name=dto.type==='PlayerInteract'?socialActionNames[dto.payload.action]:['PlayerBuy','PlayerSell'].includes(dto.type)?(dto.type==='PlayerBuy'?'买入':'卖出')+product:actionNames[dto.type];
 const succeeded=receipt.outcome==='succeeded',changes=[];
 if(succeeded){
  const delta=(label,before,after)=>{if(Number.isSafeInteger(before)&&Number.isSafeInteger(after)&&before!==after)changes.push(label+' '+(after>before?'+':'')+(after-before));};
  for(const [key,label] of [['wallet','金币'],['fatigue','疲劳'],['playerHealth','生命'],['wolfHealth','森林狼生命']])delta(label,result?.before?.[key],result?.after?.[key]);
  for(const [key,label] of [['food','粮食'],['herbs','药草']])delta(label,result?.before?.inventory?.[key],result?.after?.inventory?.[key]);
  if(dto.type==='PlayerGiftFood')changes.push('粮食 -'+result.quantity,'对方已收到粮食');
  if(['PlayerInteract','PlayerNegotiate','PlayerAgreement','PlayerDialogue'].includes(dto.type)){
   if(result.speech)changes.push('猎人：'+result.speech);
   if(result.asset){delta('工具耐久',result.asset.before.condition,result.asset.after.condition);
    if(result.asset.before.holderId!==result.asset.after.holderId)changes.push(result.asset.after.holderId==='actor-4'?'工具由你持有；所有者仍为猎人。':'工具已交还猎人。');}
  }
  if(dto.type==='PlayerQuest')changes.push(({accept:'已接取任务',claim:'已领取任务进展与解锁',abandon:'已放弃任务，可重新接取'})[dto.payload.action]);
  if(dto.type==='MarchSet')changes.push('目的地 ('+dto.payload.x+', '+dto.payload.y+')');
  if(result?.after?.resolution)changes.push('战斗结果：'+({win:'胜利',lose:'败北',flee:'逃离',cancel:'已取消','player-died':'玩家死亡'}[result.after.resolution]??'已结束'));
 }
 const minutes=receipt.durationTicks*10,hours=Math.floor(minutes/60),remaining=minutes%60;
 const elapsed=Number.isSafeInteger(minutes)?(hours?hours+'小时':'')+(remaining?remaining+'分钟':''):receipt.durationTicks+'刻';
 const socialEffect=['PlayerInteract','PlayerNegotiate','PlayerAgreement'].includes(dto.type)&&succeeded?({offered:'条件已提出',countered:'对方提出调整条件',accepted:'约定已接受',declined:'提议已拒绝',caught:'被发现并阻止',resisted:'对方抵抗',refused:'对方拒绝',taken:'已拿走工具',lent:'对方同意借出'})[result.effect]:null;
 return {commandId:receipt.commandId,type:dto.type,outcome:receipt.outcome,summary:name+' · '+(socialEffect??(succeeded?'已完成':'未完成')),changes,
  reason:succeeded?'':reasons[result?.reasonCode??result?.code]??'当前世界状态不允许完成这项操作。',
  time:'世界时刻 '+receipt.fromTick+' → '+receipt.tick+' · '+(receipt.durationTicks?'推进'+elapsed+'（'+receipt.durationTicks+'刻）':'未推进世界时间')};
}

export function recordConfirmedAction(history,receipt,dto){
 const view=describeActionReceipt(receipt,dto);
 if(!view||history.some(entry=>entry.commandId===view.commandId))return history;
 return [view,...history].slice(0,8);
}
