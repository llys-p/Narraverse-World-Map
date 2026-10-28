// New fixture only: deterministic quest progress and private own life history.
// All resources and combat remain owned by the existing rule engines.
import {fields,integer,denseArray,requireCondition,cloneData} from './data-contract.mjs';
import {SURVIVAL_REASON_CODES} from './survival-state.mjs';
import {PLAY_QUEST_IDS,PLAY_QUEST_STATUSES,PLAY_QUEST_COMMAND,TRUST_QUEST_ID,validQuestPayload} from '../../runtime-playable-contract.mjs';
import {trustDefinition,hasTrust,validateTrustLoan,observeTrustTick,observeTrustCommand,trustLoanView} from './campaign-trust.mjs';
const definitions=[
 {id:'livelihood',title:'在村里站稳脚跟',description:'接取后完成一次工作，并购买一份口粮。工钱和粮食必须实际到手。',targets:[1,1],reward:'解锁猎人的求助'},
 {id:'hunter-aid',title:'帮猎人渡过难关',description:'确保猎人的工具由他持有且耐久至少80，并在接取后实际赠送一份口粮。',targets:[1,1],reward:'获得村庄伙伴称号，解锁森林探路委托'},
 {id:'forest-route',title:'走一趟森林',description:'接取后抵达森林，再活着返回村庄。可以避开战斗。',targets:[1,1],reward:'完成初期主目标，解锁讨伐挑战'},
 {id:'forest-win',title:'可选挑战：林间猎狼',description:'接取后战胜一匹狼，并活着返回村庄。',targets:[1,1],reward:'获得森林守望者称号'}
];
export const playableQuestDefinitions=()=>cloneData(definitions);
export function createPlayModel(trust=false){return {version:trust?'playable-v2':'playable-v1',quests:(trust?[...definitions,trustDefinition]:definitions).map((q,i)=>({id:q.id,status:i===0?'available':'locked',acceptedTick:null,deadlineTick:null,claimedTick:null,progress:[0,0]})),agency:{lastTick:0,signature:'',evaluations:0,skipped:0,tier:'near'},lifeHistory:[],...(trust?{trustLoan:null}:{})};}
export const isPlayable=w=>['playable-v1','playable-v2'].includes(w?.mapModel?.playModel?.version);
export function validatePlayModel(p,tick){
 const trust=hasTrust(p),ids=trust?[...PLAY_QUEST_IDS,TRUST_QUEST_ID]:PLAY_QUEST_IDS;
 fields(p,['version','quests','agency','lifeHistory',...(trust?['trustLoan']:[])]);requireCondition(['playable-v1','playable-v2'].includes(p.version),'Unknown playable model');denseArray(p.quests,ids.length);requireCondition(p.quests.length===ids.length,'Quest roster mismatch');
 for(const [i,q] of p.quests.entries()){
  fields(q,['id','status','acceptedTick','deadlineTick','claimedTick','progress']);requireCondition(q.id===ids[i]&&PLAY_QUEST_STATUSES.includes(q.status),'Invalid quest state');denseArray(q.progress,2);requireCondition(q.progress.length===2&&q.progress.every(x=>x===0||x===1),'Quest progress outside bounds');
  for(const key of ['acceptedTick','deadlineTick','claimedTick'])if(q[key]!==null)integer(q[key]);
  if(['locked','available'].includes(q.status))requireCondition(q.acceptedTick===null&&q.deadlineTick===null&&q.claimedTick===null&&q.progress.every(x=>x===0),'Unaccepted quest has progress');
  else requireCondition(q.acceptedTick!==null&&q.deadlineTick!==null&&q.acceptedTick<=tick&&q.deadlineTick===q.acceptedTick+2016,'Invalid quest time');
  if(['ready','completed'].includes(q.status))requireCondition(q.progress.every(x=>x===1),'Unfinished quest marked ready');
  requireCondition((q.status==='completed')===(q.claimedTick!==null),'Quest reward/claim mismatch');if(q.claimedTick!==null)requireCondition(q.claimedTick>=q.acceptedTick&&q.claimedTick<=tick,'Future quest claim');
  if(i&&q.status!=='locked')requireCondition(p.quests[i===4?2:i-1].status==='completed','Quest prerequisite missing');
 }
 if(trust)validateTrustLoan(p,tick);
 fields(p.agency,['lastTick','signature','evaluations','skipped','tier']);for(const k of ['lastTick','evaluations','skipped'])integer(p.agency[k]);requireCondition(p.agency.lastTick<=tick&&typeof p.agency.signature==='string'&&p.agency.signature.length<=500&&['near','far','important'].includes(p.agency.tier),'Invalid agency cache');
 denseArray(p.lifeHistory,16);let previous=0;for(const r of p.lifeHistory){fields(r,['tick','action','status','walletChange','foodChange','reasonCode']);integer(r.tick,1);requireCondition(r.tick>previous&&r.tick<=tick&&r.tick%144===0,'Invalid own life time');previous=r.tick;requireCondition(['WorkForPay','BuyFood','Rest','NoAction','BuyMedicine','UseMedicine'].includes(r.action)&&['succeeded','rejected','no-action'].includes(r.status)&&SURVIVAL_REASON_CODES.includes(r.reasonCode),'Invalid own life result');for(const k of ['walletChange','foodChange'])requireCondition(Number.isSafeInteger(r[k]),'Invalid own life delta');requireCondition((r.action==='NoAction')===(r.status==='no-action')&&(r.status==='succeeded'||r.walletChange===0&&r.foodChange===0),'Invalid own life outcome');}
}
export function auditQuest(world,dto){
 if(dto.type!==PLAY_QUEST_COMMAND)return null;
 requireCondition(isPlayable(world),'Quest commands require a new playable world','COMMAND_UNSUPPORTED');
 requireCondition(validQuestPayload(dto.payload),'Invalid quest payload');
 let code=null;const p=world.mapModel.playModel,q=p?.quests.find(q=>q.id===dto.payload.questId),actor=world.actorModel.actors[3];
 if(!p||!q)code='RULE_REJECTED';else if(!actor.alive)code='PLAYER_DEAD';else if(world.encounterModel.encounter?.status==='active')code='ENCOUNTER_BUSY';
 else if(actor.location!=='village'||(dto.payload.action==='accept'?!['available','abandoned','failed'].includes(q.status):dto.payload.action==='claim'?q.status!=='ready':!['active','ready'].includes(q.status)))code='RULE_REJECTED';
 else if(q.id===TRUST_QUEST_ID&&dto.payload.action==='accept'&&(world.mapModel.socialModel.asset.holderId!=='actor-2'||!world.actorModel.actors[1].alive))code='RULE_REJECTED';
 return {outcome:code?'rejected':'succeeded',reasonCode:code,durationTicks:0,worldCommand:true,directTicks:true,directCommand:true};
}
export function commitQuest(world,dto,tick){
 const p=world.mapModel.playModel,q=p.quests.find(q=>q.id===dto.payload.questId);
 if(dto.payload.action==='accept')Object.assign(q,{status:'active',acceptedTick:tick,deadlineTick:tick+2016,claimedTick:null,progress:[0,0]});
 if(q.id===TRUST_QUEST_ID&&dto.payload.action==='accept')p.trustLoan=null;
 if(dto.payload.action==='abandon')q.status='abandoned';
 if(dto.payload.action==='claim'){q.status='completed';q.claimedTick=tick;const next=p.quests[p.quests.indexOf(q)+1];if(next?.status==='locked')next.status='available';}
 if(hasTrust(p)&&dto.payload.action==='claim'&&q.id==='forest-route')p.quests[4].status='available';
 return {questId:q.id,action:dto.payload.action,status:q.status,rank:p.quests.filter(q=>q.status==='completed').length};
}
function ready(q){if(q.status==='active'&&q.progress.every(Boolean))q.status='ready';}
export function observePlayTick(world,tick){
 if(!isPlayable(world))return;const p=world.mapModel.playModel,player=world.actorModel.actors[3];
 for(const q of p.quests)if(['active','ready'].includes(q.status)){
  if(!player.alive||tick>q.deadlineTick){q.status='failed';continue;}
  if(q.id==='hunter-aid'){q.progress[0]=world.mapModel.socialModel.asset.holderId==='actor-2'&&world.mapModel.socialModel.asset.condition>=80?1:0;if(q.status==='ready'&&!q.progress[0])q.status='active';ready(q);}
  if(['forest-route','forest-win'].includes(q.id)){
   if(q.id==='forest-route'&&player.location==='forest')q.progress[0]=1;
   if(q.progress[0]&&player.location==='village')q.progress[1]=1;ready(q);
  }
 }
 observeTrustTick(world,tick);
 const m=world.motivationModel.actors.find(a=>a.actorId==='actor-2'),d=m.lastDecision,r=m.lastOutcome;
 if(d&&r&&d.decisionId===r.decisionId&&d.tick===tick&&tick%144===0&&p.lifeHistory.at(-1)?.tick!==tick){p.lifeHistory.push({tick,action:d.choice,status:r.status,walletChange:r.delta.wallet,foodChange:r.delta.food,reasonCode:d.reasonCode});if(p.lifeHistory.length>16)p.lifeHistory.shift();}
}
export function observePlayCommand(world,events,tick){
 if(!isPlayable(world))return;const fact=events.at(-1);if(fact?.type!=='EncounterCommandResolved')return;
 const {dto,receipt}=fact.payload;if(receipt.outcome!=='succeeded')return;
 for(const q of world.mapModel.playModel.quests)if(q.status==='active'){
  if(q.id==='livelihood'){if(dto.type==='PlayerWork')q.progress[0]=1;if(dto.type==='PlayerBuy'&&dto.payload.product==='food')q.progress[1]=1;}
  if(q.id==='hunter-aid'){if(dto.type==='PlayerGiftFood')q.progress[1]=1;}
  if(q.id==='forest-win'&&dto.type==='EncounterAction'&&receipt.result.after.resolution==='win')q.progress[0]=1;
  ready(q);
 }
 observeTrustCommand(world,dto,receipt,tick);observePlayTick(world,tick);
}
export function playAgencyDue(world,tick){
 const p=world.mapModel.playModel;if(!p)return tick%4===0;
 if(tick%4)return false;
 const a=world.actorModel.actors[1],n=world.mapModel.npcs[1],s=world.mapModel.socialModel.actors[1],own=world.societyModel.agents[1].state;
 const distance=Math.max(Math.abs(n.x-world.mapModel.position.x),Math.abs(n.y-world.mapModel.position.y));
 const important=['active','ready'].includes(p.quests[1].status),tier=important?'important':distance<=4?'near':'far';
 const signature=JSON.stringify([a.alive,a.health,a.fatigue,a.hunger,own.inventory.food,own.wallet,s.knownHolder,s.knownCondition,s.fear>=40,distance<=3,world.motivationModel.actors[1].lastDuty?.requestId,world.motivationModel.actors[1].lastDuty?.status,world.motivationModel.actors[1].lastDecision?.decisionId,world.mindModel.actors[1].observations.at(-1)?.eventSeq,own.inventory.herbs,Math.ceil(tick/144),tier]);
 const interval=tier==='important'?4:tier==='near'?12:24;
 const due=signature!==p.agency.signature||tick-p.agency.lastTick>=interval;
 if(due){Object.assign(p.agency,{lastTick:tick,signature,tier});p.agency.evaluations++;}else p.agency.skipped++;
 return due;
}
export function playableView(world,tick){
 if(!isPlayable(world))return null;const p=world.mapModel.playModel,trust=hasTrust(p),defs=trust?[...definitions,trustDefinition]:definitions;return {version:trust?2:1,title:'在村庄站稳脚跟',chapterComplete:p.quests.slice(0,3).every(q=>q.status==='completed'),rank:p.quests.filter(q=>q.status==='completed').length,
 activity:(()=>{const n=world.mapModel.npcs[1],at=world.mapModel.position;if(Math.max(Math.abs(n.x-at.x),Math.abs(n.y-at.y))>4)return null;return {actorId:'actor-2',label:!world.actorModel.actors[1].alive?'猎人已倒下':n.x===5&&n.y===6?'猎人在工作点':n.x===3&&n.y===7?'猎人在粮摊附近':n.x===5&&n.y===8?'猎人在歇脚处':'猎人正在村内活动'};})(),
 quests:p.quests.map((q,i)=>{const own=trust&&q.id===TRUST_QUEST_ID,loan=own?p.trustLoan:null,deadlineTick=loan&&loan.returnedTick===null?Math.min(q.deadlineTick,loan.dueTick):q.deadlineTick;return {...cloneData(q),...cloneData(defs[i]),deadlineTick,remainingTicks:deadlineTick===null?null:Math.max(0,deadlineTick-tick),...(own?{loan:trustLoanView(loan)}:{})};}),
 help:'先到村庄任务板接取目标。实际工作、购买、修理和旅行才会推进任务；说自己完成了不会生效。可放弃后重新接取。钱粮不足时可工作和购买；疲劳高时休整。'};}
