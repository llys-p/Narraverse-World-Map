// Presentation consumes the same confirmed world; never keeps a second quest ledger.
import {personNavigation,worldTimeView} from './demo-runtime-interactions.mjs';
const labels={locked:'尚未解锁',available:'可接取',active:'进行中',ready:'已达成，返回村庄领取',completed:'已完成',abandoned:'已放弃，可重接',failed:'未完成，可重接'};
const steps={livelihood:['实际工作一次','购买一份口粮'],'hunter-aid':['工具归猎人且耐久至少80','实际赠送一份口粮'],'forest-route':['抵达森林','活着返回村庄'],'forest-win':['战胜一匹狼','活着返回村庄']};
export function questDeadlineText(q){
 if(!['active','ready'].includes(q.status)||q.remainingTicks===null)return '';
 if(q.remainingTicks===0)return '已到任务期限，请核对当前任务状态。';
 const hours=Math.floor(q.remainingTicks/6),minutes=q.remainingTicks%6*10;
 return '任务期限：还剩'+(hours?hours+'小时':'')+(minutes?minutes+'分钟':'')+'（世界时间）；现实等待不会消耗期限。';
}
export function playableNextStep(group){
 const view=group?.map?.playable;if(!view)return '';
 if(!group.map.self.alive)return '本次旅程已结束；原存档保留，可以另开新旅程。';
 if(group.encounter.encounter?.status==='active')return '下一步：先完成当前战斗，再继续任务。';
 if(group.map.order?.status==='marching')return '下一步：抵达目的地后继续任务；也可先暂停行军查看周围。';
 if(group.map.budget.remainingCommands===0)return '本档操作额度已用完。请保留原存档，另开新旅程继续探索。';
 const q=view.quests.find(q=>q.status==='ready')??view.quests.find(q=>q.status==='active')??view.quests.find(q=>['available','abandoned','failed'].includes(q.status));
 if(!q)return view.chapterComplete?'第一章目标已完成，可以回顾本次旅程。':'查看任务条件，继续探索当前世界。';
 const village=group.map.self.location==='village';
 if(q.status==='ready')return '下一步：'+(village?'在任务板领取':'活着返回村庄领取')+'「'+q.title+'」的进展。';
 if(q.status!=='active')return (view.chapterComplete?'第一章已完成。可选挑战：':'下一步：')+(village?'在任务板接取':'返回村庄接取')+'「'+q.title+'」。';
 if(q.id==='livelihood'){
  if(!q.progress[0]){const timing=worldTimeView(group,true);return timing.workReady?'下一步：在村庄完成一次实际工作。':'下一步：完成一次实际工作。'+timing.workHint;}
  return '下一步：在村庄商人处实际购买一份口粮。';
 }
 if(q.id==='hunter-aid'){
  if(!q.progress[0])return '下一步：帮助修理，并让工具归猎人持有且耐久至少80。';
  if(group.player.self.inventory.food<1)return '下一步：先在村庄商人处购买口粮，再实际送一份给猎人。';
  const hunter=group.map.actors.find(a=>a.actorId==='actor-2');
  return hunter?'下一步：'+(hunter.canInteract?'实际送一份口粮给猎人。':'先走近当前可见的猎人，再送一份口粮。'):'下一步：在附近寻找猎人，见面后实际送一份口粮。';
 }
 if(q.id==='forest-route')return q.progress[0]?'下一步：活着返回村庄，完成森林往返。':'下一步：抵达森林，再活着返回村庄；这个任务可以避开战斗。';
 return q.progress[0]?'下一步：活着返回村庄，领取可选挑战进展。':'下一步：前往森林战胜一匹狼，再活着返回村庄；这是可选挑战。';
}
export function createPlayableGoals({submit,approach}){
 const panel=document.getElementById('playableGoals'),list=document.getElementById('playableQuestList');let key='';
 function paint(group,writable){
  const view=group?.map?.playable;panel.hidden=!view;if(!view)return;
  const hunter=group.map.actors.find(a=>a.actorId==='actor-2'),navigation=personNavigation(group,writable,'actor-2'),next=playableNextStep(group);
  const value=JSON.stringify([view,writable,group.map.self.location,group.map.self.alive,group.map.order?.status,group.encounter.encounter?.status,navigation,hunter,next]);if(value===key)return;key=value;
  document.getElementById('playableTitle').textContent=view.chapterComplete?'第一章完成：你已在村庄站稳脚跟':view.title;
  document.getElementById('playableNext').textContent=next;
  document.getElementById('playableHelp').textContent=group.map.self.alive?view.help+(view.activity?'　'+view.activity.label+'。':''):'本次旅程已结束，原存档会保留。可关闭入口后使用新旅程脚本建立另一个存档。';list.replaceChildren();
  const inVillage=group.map.self.location==='village',free=writable&&group.map.self.alive&&group.map.budget.remainingCommands>0&&inVillage&&group.map.order?.status!=='marching'&&group.encounter.encounter?.status!=='active';
  for(const q of view.quests){
   const row=document.createElement('article');row.className='quest-card';row.dataset.quest=q.id;
   const title=document.createElement('h3');title.textContent=q.title+' · '+labels[q.status];const detail=document.createElement('p');detail.textContent=q.description;
   const progress=document.createElement('p');progress.textContent=q.progress.map((v,i)=>steps[q.id][i]+' '+v+'/'+q.targets[i]).join(' · ')+'　奖励：'+q.reward;
   row.append(title,detail,progress);
   const deadline=questDeadlineText(q);if(deadline){const text=document.createElement('p');text.className='quest-deadline';text.textContent=deadline;row.append(text);}
   const actions=['available','abandoned','failed'].includes(q.status)?[['accept','接取任务']]:q.status==='ready'?[['claim','领取进展'],['abandon','放弃任务']]:q.status==='active'?[['abandon','放弃任务']]:[];
   for(const [action,text] of actions){const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.questAction=action;button.disabled=!free;button.addEventListener('click',()=>submit('PlayerQuest',{questId:q.id,action}));row.append(button);}
   if(q.status==='active'&&q.id==='hunter-aid'&&hunter&&!hunter.canInteract){const b=document.createElement('button');b.textContent='走近猎人';b.disabled=!navigation.canApproach;b.addEventListener('click',()=>approach(hunter));row.append(b);}
   if(actions.length&&!inVillage){const hint=document.createElement('small');hint.textContent='接取、领取和放弃请返回村庄任务板。';row.append(hint);}
   list.append(row);
  }
 }
 return {paint};
}
