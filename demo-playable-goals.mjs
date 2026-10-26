// Presentation consumes the same confirmed world; never keeps a second quest ledger.
const labels={locked:'尚未解锁',available:'可接取',active:'进行中',ready:'已达成，返回村庄领取',completed:'已完成',abandoned:'已放弃，可重接',failed:'未完成，可重接'};
export function createPlayableGoals({submit,approach}){
 const panel=document.getElementById('playableGoals'),list=document.getElementById('playableQuestList');let key='';
 function paint(group,writable){
  const view=group?.map?.playable;panel.hidden=!view;if(!view)return;
  const value=JSON.stringify([view,writable,group.map.self.location,group.map.order?.status]);if(value===key)return;key=value;
  document.getElementById('playableTitle').textContent=view.chapterComplete?'第一章完成：你已在村庄站稳脚跟':view.title;
  document.getElementById('playableHelp').textContent=group.map.self.alive?view.help+(view.activity?'　'+view.activity.label+'。':''):'本次旅程已结束，原存档会保留。可关闭入口后使用新旅程脚本建立另一个存档。';list.replaceChildren();
  const inVillage=group.map.self.location==='village',free=writable&&inVillage&&group.map.order?.status!=='marching'&&group.encounter.encounter?.status!=='active';
  for(const q of view.quests){
   const row=document.createElement('article');row.className='quest-card';row.dataset.quest=q.id;
   const title=document.createElement('h3');title.textContent=q.title+' · '+labels[q.status];const detail=document.createElement('p');detail.textContent=q.description;
   const progress=document.createElement('p');progress.textContent='进度 '+q.progress.map((v,i)=>v+'/'+q.targets[i]).join(' · ')+'　奖励：'+q.reward;
   row.append(title,detail,progress);
   const actions=['available','abandoned','failed'].includes(q.status)?[['accept','接取任务']]:q.status==='ready'?[['claim','领取进展'],['abandon','放弃任务']]:q.status==='active'?[['abandon','放弃任务']]:[];
   for(const [action,text] of actions){const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.questAction=action;button.disabled=!free;button.addEventListener('click',()=>submit('PlayerQuest',{questId:q.id,action}));row.append(button);}
   if(q.status==='active'&&q.id==='hunter-aid'){const hunter=group.map.actors.find(a=>a.actorId==='actor-2');if(hunter&&!hunter.canInteract){const b=document.createElement('button');b.textContent='走近猎人';b.disabled=!writable;b.addEventListener('click',()=>approach(hunter));row.append(b);}}
   if(actions.length&&!inVillage){const hint=document.createElement('small');hint.textContent='接取、领取和放弃请返回村庄任务板。';row.append(hint);}
   list.append(row);
  }
 }
 return {paint};
}
