// Shared browser/server quest grammar and result validation. No world access.
export const PLAY_QUEST_COMMAND='PlayerQuest';
export const PLAY_QUEST_IDS=Object.freeze(['livelihood','hunter-aid','forest-route','forest-win']);
export const TRUST_QUEST_ID='hunter-trust';
const questIds=version=>version===2?[...PLAY_QUEST_IDS,TRUST_QUEST_ID]:PLAY_QUEST_IDS;
export const PLAY_QUEST_STATUSES=Object.freeze(['locked','available','active','ready','completed','abandoned','failed']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const validQuestPayload=p=>exact(p,['questId','action'])&&questIds(2).includes(p.questId)&&['accept','claim','abandon'].includes(p.action);
export const validQuestResult=(r,p)=>exact(r,['questId','action','status','rank'])&&r.questId===p.questId&&r.action===p.action&&PLAY_QUEST_STATUSES.includes(r.status)&&Number.isSafeInteger(r.rank)&&r.rank>=0&&r.rank<=5;

export function validPlayableView(v,tick){
 if(!exact(v,['version','title','chapterComplete','rank','quests','help','activity'])||![1,2].includes(v.version)||typeof v.title!=='string'||typeof v.help!=='string'||typeof v.chapterComplete!=='boolean'||!Number.isSafeInteger(v.rank)||v.rank<0||v.rank>questIds(v.version).length||!Array.isArray(v.quests)||v.quests.length!==questIds(v.version).length)return false;
 if(v.activity!==null&&(!exact(v.activity,['actorId','label'])||v.activity.actorId!=='actor-2'||typeof v.activity.label!=='string'||v.activity.label.length>60))return false;
 for(const [i,q] of v.quests.entries()){
  const trust=questIds(v.version)[i]===TRUST_QUEST_ID,count=trust?3:2;
  if(!exact(q,['id','status','acceptedTick','deadlineTick','claimedTick','progress','title','description','targets','reward','remainingTicks',...(trust?['loanDueTick']:[])])||q.id!==questIds(v.version)[i]||!PLAY_QUEST_STATUSES.includes(q.status)||!['title','description','reward'].every(k=>typeof q[k]==='string'&&q[k].length<=300)||!Array.isArray(q.progress)||q.progress.length!==count||!q.progress.every(n=>n===0||n===1)||!Array.isArray(q.targets)||q.targets.length!==count||!q.targets.every(n=>n===1))return false;
  if(trust&&(!((q.loanDueTick===null&&q.progress[0]===0)||(Number.isSafeInteger(q.loanDueTick)&&q.acceptedTick!==null&&q.loanDueTick>q.acceptedTick&&q.progress[0]===1))||!q.progress.every((n,j)=>j===0||n<=q.progress[j-1])))return false;
  for(const k of ['acceptedTick','deadlineTick','claimedTick','remainingTicks'])if(q[k]!==null&&(!Number.isSafeInteger(q[k])||q[k]<0))return false;
  if(q.acceptedTick!==null&&q.acceptedTick>tick||q.claimedTick!==null&&q.claimedTick>tick)return false;
 }
 return v.rank===v.quests.filter(q=>q.status==='completed').length&&v.chapterComplete===v.quests.slice(0,3).every(q=>q.status==='completed');
}
