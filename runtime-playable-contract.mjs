// Shared browser/server quest grammar and result validation. No world access.
export const PLAY_QUEST_COMMAND='PlayerQuest';
export const PLAY_QUEST_IDS=Object.freeze(['livelihood','hunter-aid','forest-route','forest-win']);
export const TRUST_QUEST_ID='hunter-trust';
export const PLAY_QUEST_STATUSES=Object.freeze(['locked','available','active','ready','completed','abandoned','failed']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const validQuestPayload=p=>exact(p,['questId','action'])&&[...PLAY_QUEST_IDS,TRUST_QUEST_ID].includes(p.questId)&&['accept','claim','abandon'].includes(p.action);
export const validQuestResult=(r,p)=>exact(r,['questId','action','status','rank'])&&r.questId===p.questId&&r.action===p.action&&PLAY_QUEST_STATUSES.includes(r.status)&&Number.isSafeInteger(r.rank)&&r.rank>=0&&r.rank<=5;

function validLoan(v,tick){
 if(v===null)return true;
 if(!exact(v,['borrowedTick','dueTick','exploredTick','returnedTick'])||!Number.isSafeInteger(v.borrowedTick)||v.borrowedTick<0||v.borrowedTick>tick||!Number.isSafeInteger(v.dueTick)||![36,72,144].includes(v.dueTick-v.borrowedTick))return false;
 for(const key of ['exploredTick','returnedTick'])if(v[key]!==null&&(!Number.isSafeInteger(v[key])||v[key]<=v.borrowedTick||v[key]>tick))return false;
 return (v.exploredTick===null||v.exploredTick<=v.dueTick)&&(v.exploredTick===null||v.returnedTick===null||v.returnedTick>=v.exploredTick);
}

export function validPlayableView(v,tick){
 const ids=v?.version===2?[...PLAY_QUEST_IDS,TRUST_QUEST_ID]:PLAY_QUEST_IDS;
 if(!exact(v,['version','title','chapterComplete','rank','quests','help','activity'])||![1,2].includes(v.version)||typeof v.title!=='string'||typeof v.help!=='string'||typeof v.chapterComplete!=='boolean'||!Number.isSafeInteger(v.rank)||v.rank<0||v.rank>ids.length||!Array.isArray(v.quests)||v.quests.length!==ids.length)return false;
 if(v.activity!==null&&(!exact(v.activity,['actorId','label'])||v.activity.actorId!=='actor-2'||typeof v.activity.label!=='string'||v.activity.label.length>60))return false;
 for(const [i,q] of v.quests.entries()){
  const trust=v.version===2&&q?.id===TRUST_QUEST_ID;
  if(!exact(q,['id','status','acceptedTick','deadlineTick','claimedTick','progress','title','description','targets','reward','remainingTicks',...(trust?['loan']:[])])||q.id!==ids[i]||!PLAY_QUEST_STATUSES.includes(q.status)||!['title','description','reward'].every(k=>typeof q[k]==='string'&&q[k].length<=300)||!Array.isArray(q.progress)||q.progress.length!==2||!q.progress.every(n=>n===0||n===1)||!Array.isArray(q.targets)||q.targets.length!==2||!q.targets.every(n=>n===1)||trust&&!validLoan(q.loan,tick))return false;
  for(const k of ['acceptedTick','deadlineTick','claimedTick','remainingTicks'])if(q[k]!==null&&(!Number.isSafeInteger(q[k])||q[k]<0))return false;
  if(q.acceptedTick!==null&&q.acceptedTick>tick||q.claimedTick!==null&&q.claimedTick>tick)return false;
  if(trust){const loan=q.loan;
   if(!loan&&q.progress.some(Boolean)||loan&&q.progress[0]!==Number(loan.exploredTick!==null))return false;
   if(q.progress[1]&&(!loan||loan.exploredTick===null||loan.returnedTick===null||loan.returnedTick>loan.dueTick))return false;
   if(['ready','completed'].includes(q.status)&&!q.progress.every(Boolean))return false;
  }
 }
 return v.rank===v.quests.filter(q=>q.status==='completed').length&&v.chapterComplete===v.quests.slice(0,3).every(q=>q.status==='completed');
}
