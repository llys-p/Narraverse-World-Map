// Presentation consumes the same confirmed world; never keeps a second quest ledger.
import {personNavigation,worldTimeView} from './demo-runtime-interactions.mjs';
const labels={locked:'尚未解锁',available:'可接取',active:'进行中',ready:'已达成，返回村庄领取',completed:'已完成',abandoned:'已放弃，可重接',failed:'未完成，可重接'};
const steps={livelihood:['实际工作一次','购买一份口粮'],'hunter-aid':['工具归猎人且耐久至少80','实际赠送一份口粮'],'forest-route':['抵达森林','活着返回村庄'],'forest-win':['战胜一匹狼','活着返回村庄']};
export function questDeadlineText(q){
 if(!['active','ready'].includes(q.status)||q.remainingTicks===null)return '';
 if(q.remainingTicks===0)return '已到任务期限的最后一刻；推进世界时间会使任务失败，请核对当前任务状态。';
 const hours=Math.floor(q.remainingTicks/6),minutes=q.remainingTicks%6*10;
 return '任务期限：还剩'+(hours?hours+'小时':'')+(minutes?minutes+'分钟':'')+'（世界时间）；现实等待不会消耗期限。';
}
export function playableNextStep(group){
 const view=group?.map?.playable;if(!view)return '';
 if(!group.map.self.alive)return '本次旅程已结束；原存档保留，可以另开新旅程。';
 if(group.map.budget.remainingCommands===0)return '本档操作额度已用完。请保留原存档，另开新旅程继续探索。';
 const expiring=view.quests.find(q=>['active','ready'].includes(q.status)&&q.remainingTicks===0);
 if(group.encounter.encounter?.status==='active')return expiring?'当前战斗尚未结束；推进世界时间会使「'+expiring.title+'」失败。请先处理战斗，再查看任务状态。':'下一步：先完成当前战斗，再继续任务。';
 if(group.map.order?.status==='marching')return expiring?'「'+expiring.title+'」已到期限最后一刻；继续行军会使任务失败。可请求暂停，已进行的步进仍可能完成。':'下一步：抵达目的地后继续任务；也可先暂停行军查看周围。';
 const q=view.quests.find(q=>q.status==='ready')??view.quests.find(q=>q.status==='active')??view.quests.find(q=>['available','abandoned','failed'].includes(q.status));
 if(!q)return view.chapterComplete?'第一章目标已完成，可以回顾本次旅程。':'查看任务条件，继续探索当前世界。';
 const village=group.map.self.location==='village';
 const hunter=group.map.actors.find(a=>a.actorId==='actor-2');
 if(q.id==='hunter-aid'&&q.status!=='ready'&&hunter?.alive===false)return '当前可见的猎人已倒下，无法帮他修理或向他赠粮。'+(q.status==='active'?(village?'可在任务板放弃任务。':'可在村庄放弃任务；返程会推进世界时间，任务可能先到期。'):'该任务暂时无法完成。')+'原存档会保留，也可以另开新旅程。';
 if(group.map.budget.remainingCommands===1&&!(q.status==='ready'&&village))return '本档只剩1次新操作，无法完成并领取当前任务。请保留原存档，另开新旅程。';
 if(['active','ready'].includes(q.status)&&q.remainingTicks===0){
  if(q.status==='ready'&&village)return '下一步：现在在任务板领取「'+q.title+'」；再推进世界时间会使任务失败。';
  if(!village)return '「'+q.title+'」已到期限最后一刻；返回村庄会推进时间并使任务失败。返回后可重新接取。';
  return '「'+q.title+'」已到期限最后一刻；推进世界时间会使任务失败。可在任务板放弃后重新接取，或先查看不推进时间的可用行动。';
 }
 if(q.status==='ready')return '下一步：'+(village?'在任务板领取':'活着返回村庄领取')+'「'+q.title+'」的进展。';
 if(q.status!=='active')return (q.status==='failed'?'「'+q.title+'」未在期限内完成。':q.status==='abandoned'?'「'+q.title+'」已放弃。':'')+(view.chapterComplete?'第一章已完成。可选挑战：':'下一步：')+(village?'在任务板'+(q.status==='available'?'接取':'重新接取'):'返回村庄'+(q.status==='available'?'接取':'重新接取'))+'「'+q.title+'」。';
 if(q.id==='livelihood'){
  if(!q.progress[0]){const timing=worldTimeView(group,true);return timing.workReady?'下一步：在村庄完成一次实际工作。':'下一步：完成一次实际工作。'+timing.workHint;}
  return '下一步：在村庄商人处实际购买一份口粮。';
 }
 if(q.id==='hunter-aid'){
  if(!q.progress[0])return '下一步：'+(hunter?(hunter.canInteract?'打开猎人人物卡':'先走近当前可见的猎人，再打开人物卡'):'在附近寻找猎人，见面后打开人物卡')+'，在歇脚处工具附近选择“帮助修理”，并让工具归猎人持有且耐久至少80。';
  if(group.player.self.inventory.food<1)return '下一步：先在村庄商人处购买口粮，再实际送一份给猎人。';
  return hunter?'下一步：'+(hunter.canInteract?'实际送一份口粮给猎人。':'先走近当前可见的猎人，再送一份口粮。'):'下一步：在附近寻找猎人，见面后实际送一份口粮。';
 }
 if(q.id==='forest-route')return q.progress[0]?'下一步：活着返回村庄，完成森林往返。':'下一步：抵达森林，再活着返回村庄；这个任务可以避开战斗。';
 return q.progress[0]?'下一步：活着返回村庄，领取可选挑战进展。':'下一步：前往森林战胜一匹狼，再活着返回村庄；这是可选挑战。';
}
export function createPlayableGoals({submit,approach,openPerson}){
 const panel=document.getElementById('playableGoals'),list=document.getElementById('playableQuestList');let key='',latest=null;
 function paint(group,writable){
  latest=group;const view=group?.map?.playable;panel.hidden=!view;if(!view)return;
  const hunter=group.map.actors.find(a=>a.actorId==='actor-2'),navigation=personNavigation(group,writable,'actor-2'),next=playableNextStep(group);
  const value=JSON.stringify([view,writable,group.map.self.location,group.map.self.alive,group.map.order?.status,group.encounter.encounter?.status,navigation,hunter,next]);if(value===key)return;key=value;
  document.getElementById('playableTitle').textContent=view.chapterComplete?'第一章完成：你已在村庄站稳脚跟':view.title;
  const summary=document.getElementById('playableChapterSummary');summary.hidden=!view.chapterComplete;
  summary.textContent=view.chapterComplete?'你已经在村庄工作、购买口粮，帮助猎人，并完成森林往返。第一章主线到这里告一段落。'+(!group.map.self.alive?'本次旅程已结束，可以回顾这段经历。':group.map.budget.remainingCommands===0?'本档操作额度已用完，可以回顾这段经历。':view.quests.find(q=>q.id==='forest-win')?.status==='completed'?'你也完成了可选的猎狼挑战。':'可以继续探索，或在任务板查看可选的猎狼挑战。'):'';
  document.getElementById('playableNext').textContent=next;
  document.getElementById('playableHelp').textContent=group.map.self.alive?view.help+(view.activity?'　'+view.activity.label+'。':''):'本次旅程已结束，原存档会保留。可关闭入口后使用新旅程脚本建立另一个存档。';list.replaceChildren();
  const inVillage=group.map.self.location==='village',free=writable&&group.map.self.alive&&group.map.budget.remainingCommands>0&&inVillage&&group.map.order?.status!=='marching'&&group.encounter.encounter?.status!=='active';
  for(const q of view.quests){
   const row=document.createElement('article');row.className='quest-card';row.dataset.quest=q.id;
   const title=document.createElement('h3');title.textContent=q.title+' · '+(q.status==='ready'&&inVillage?'已达成，可以领取':labels[q.status]);const detail=document.createElement('p');detail.textContent=q.description;
   const progress=document.createElement('p');progress.textContent=q.progress.map((v,i)=>steps[q.id][i]+' '+v+'/'+q.targets[i]).join(' · ')+'　奖励：'+q.reward;
   row.append(title,detail,progress);
   const deadline=questDeadlineText(q);if(deadline){const text=document.createElement('p');text.className='quest-deadline';text.textContent=deadline;row.append(text);}
   const actions=['available','abandoned','failed'].includes(q.status)?[['accept','接取任务']]:q.status==='ready'?[['claim','领取进展'],['abandon','放弃任务']]:q.status==='active'?[['abandon','放弃任务']]:[];
   for(const [action,text] of actions){const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.questAction=action;button.disabled=!free;button.addEventListener('click',()=>submit('PlayerQuest',{questId:q.id,action}));row.append(button);}
   if(q.status==='active'&&q.id==='hunter-aid'&&hunter?.alive&&typeof openPerson==='function'){
    const b=document.createElement('button');b.type='button';b.textContent='查看猎人';b.addEventListener('click',()=>{
     const actor=latest?.map?.actors?.find(a=>a.actorId==='actor-2');
     const quest=latest?.map?.playable?.quests?.find(item=>item.id==='hunter-aid');
     if(actor?.alive&&quest?.status==='active')openPerson('actor-2');
    });row.append(b);
   }
   if(q.status==='active'&&q.id==='hunter-aid'&&hunter?.alive&&!hunter.canInteract){const b=document.createElement('button');b.textContent='走近猎人';b.disabled=!navigation.canApproach;b.addEventListener('click',()=>approach(hunter));row.append(b);}
   if(actions.length&&!inVillage){const hint=document.createElement('small');hint.textContent='接取、领取和放弃请返回村庄任务板。';row.append(hint);}
   list.append(row);
  }
 }
 return {paint};
}
