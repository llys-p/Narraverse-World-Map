import {cloneData,requireCondition} from '../core/data-contract.mjs';
import {TICK_MINUTES} from '../core/simulation-clock.mjs';
import {interpretSocialText} from '../../demo-social-language.mjs';
import {NPC_MEMORY_VERSION,retrieveNpcEpisodes,npcMemoryUpdates} from '../core/npc-memory.mjs';
import {knownNegotiationOptions,repairLoanTerms} from '../core/npc-negotiation-terms.mjs';
import {npcRecallFocus} from './npc-recall-focus.mjs';
import {sanitizeNpcLifeContext} from '../core/npc-life-context.mjs';
import {npcLifeFacts,sanitizeLifeHistory} from './npc-life-facts.mjs';

const pick=(value,names)=>Object.fromEntries(names.filter(k=>value&&Object.hasOwn(value,k)).map(k=>[k,cloneData(value[k])]));
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const minutes=(later,earlier)=>nat(later)&&nat(earlier)&&later>=earlier&&Number.isSafeInteger((later-earlier)*TICK_MINUTES)?(later-earlier)*TICK_MINUTES:null;
const selfFields=['alive','health','fatigue','food','wallet','trust','fear','grievance','knownHolder','knownCondition'];
const memoryFields=['eventSeq','tick','kind','actorId','channel','importance','text'];
const agreementFields=['id','terms','targetCondition','status','offeredTick','expiresTick','acceptedTick','repairProgress','claimTick','dueTick','closedTick','eventSeq'];
const stages={offered:'仅提出条款，尚未接受或借出',accepted:'已接受条款，尚未达到可领取状态',ready:'修理条件已完成，仍须玩家领取，尚未借出',
 borrowed:'玩家已经领取，借用仍在进行',breached:'借用已经逾期，尚未归还',fulfilled:'已按时归还，本次约定完成',
 'returned-late':'已经归还，但发生过逾期',expired:'约定已过期',cancelled:'约定已取消',invalidated:'约定已经停止'};
const basis={self:'本人直接经历的事件，不是玩家单方面声称',witness:'本人在场目击的事件',discovery:'后来发现的结果；不是对先前行为的目击'};

function agreementFacts(a,tick){
 if(!a)return null;
 const returned=['fulfilled','returned-late'].includes(a.status),ongoing=['borrowed','breached'].includes(a.status);
 const comparisonTick=returned?a.closedTick:tick;
 const elapsed=nat(comparisonTick)&&nat(a.dueTick)?minutes(Math.max(comparisonTick,a.dueTick),a.dueTick):null;
 return {sourceEventSeq:a.eventSeq,status:a.status,meaning:stages[a.status]??'状态未识别，不推断交付',
  wasClaimed:nat(a.claimTick),wasReturned:returned,readyForSeparateClaim:a.status==='ready',
  repairRequired:a.terms?.repairAmount??null,repairRecorded:a.repairProgress??null,targetCondition:a.targetCondition??null,
  loanMinutes:minutes(a.terms?.loanTicks,0),overdueMinutes:returned||ongoing?elapsed:null,
  overdueBasis:returned?'实际归还时间减截止时间，归还后不再增长':ongoing?'当前时间减截止时间；逾期标记时间不是归还时间':'不适用',
  expiresInMinutes:['offered','accepted','ready'].includes(a.status)?minutes(a.expiresTick,tick):null};
}

// Narrow complete-sentence hints, not a general intent classifier or an action executor.
export function dialogueIntentHint(text,context){
 const plain=typeof text==='string'?text.normalize('NFKC').trim().replace(/[ \t]+/gu,'').replace(/[。.!?！？]+$/u,''):'';
 const existing=context.agreement;
 const termsQuestion=/^(?:(?:半天|一天|六小时|十二小时)(?:也)?(?:行|可以)[,，])?(?:(?:刚才|之前|先前)(?:你)?(?:正式)?(?:提出|说)的)?(?:修理条件|借用条件|借期|条款|约定)(?:到底)?(?:是)?(?:多少|什么|多久)$/u;
 const repeatQuestion=/^(?:请)?(?:再说|重复)(?:一下|一遍)?(?:刚才|之前|这份)?(?:的)?(?:条款|约定|修理条件)$/u;
 if(existing&&(termsQuestion.test(plain)||repeatQuestion.test(plain)))return {kind:'existing-terms-question',recommendation:'explain-existing-terms',proposalHint:null,
  note:'询问已经记录的条件，不是重新提议、接受或领取；先回答现有条款，不重复生成协商动作。'};
 const exchange=/^我(?:可以|愿意|来)?(?:帮你|替你)?(?:修好|修理|修)(?:(?:20|40)点(?:耐久)?|(?:这个|你的)?工具(?:包)?)[,，](?:你把)?(?:工具(?:包)?)?(?:借我|借给我)(一天|半天|六小时|十二小时|24小时|12小时|6小时)(?:行吗|可以吗|好吗|如何|怎么样)?$/u.exec(plain);
 if(exchange){
  const available=knownNegotiationOptions(context.self,existing),duration={一天:144,半天:72,六小时:36,十二小时:72,'24小时':144,'12小时':72,'6小时':36}[exchange[1]];
  return {kind:'negotiate-repair-loan',recommendation:available.status==='available'?'suggest-supported-terms':'explain-negotiation-limit',
   proposalHint:available.status==='available'?{type:'PlayerNegotiate',payload:{targetId:'actor-2',terms:repairLoanTerms(context.self.knownCondition,context.self.trust,duration)}}:null,
   note:'玩家明确谈修理换借用；若可谈，给当前候选条款的协商预览，口头还价不能替代建议，也不能承诺候选之外的条件。仍需确认及世界审核。'};
 }
 const parsed=interpretSocialText(text);
 const explicitRepair=/^(?:那)?(?:我)?(?:现在|这就|马上)?(?:要|来)?(?:帮你|替你)(?:修理|修好|修)(?:一下)?(?:这个|你的|猎人的)?工具(?:包)?$/u;
 if(parsed.status==='ready'&&parsed.candidates[0]?.action==='help'||explicitRepair.test(plain)){
  const available=context.self?.knownHolder==='actor-2'&&Number.isSafeInteger(context.self.knownCondition)&&context.self.knownCondition<100;
  return {kind:'repair-now',recommendation:available?'suggest-help':'explain-known-tool-condition',
   proposalHint:available?{type:'PlayerInteract',payload:{targetId:'actor-2',action:'help'}}:null,
   note:available?'玩家明确提出现在修理，可给help建议，仍需玩家确认并通过世界规则；不是已经修好。':'玩家提出修理，但已知工具状态不支持这个建议；说明缺项，不伪造可用性或修理完成。'};
 }
 return {kind:'model-interpretation',recommendation:'answer-current-topic',proposalHint:null,
  note:'本句未由有界规则判定动作；根据原话理解或追问。不要将否定、引语、转述或过去自述当现在行动，也不要机械转回修理换借用。'};
}

// Only a projection of the caller's already restricted NPC view. Never accepts a world.
export function groundedProviderContext(context,text){
 requireCondition(context&&typeof context==='object'&&Array.isArray(context.observations)&&Array.isArray(context.conversation),'Invalid NPC context');
 requireCondition(context.targetId===undefined||context.targetId==='actor-2','Unexpected NPC context target');
 const out=pick(context,['simulationId','revision','tick','targetId','persona','canTalk']);
 out.targetId='actor-2';out.self=pick(context.self,selfFields);
 const memoryMode=context.memoryMode===NPC_MEMORY_VERSION;
 if(memoryMode){
  if(nat(context.self?.hunger)&&context.self.hunger<=1000)out.self.hunger=context.self.hunger;
  if(Object.hasOwn(context,'activity'))out.activity=sanitizeNpcLifeContext(context.activity,context.tick);
  if(context.lifeHistoryVersion==='play-life-v1'){out.lifeHistoryVersion='play-life-v1';out.lifeHistory=sanitizeLifeHistory(context.lifeHistory,context.tick);}
 }
 const recall=memoryMode?npcRecallFocus(text,context.conversation):null;
 const recent=context.observations.slice(-6),important=context.observations.slice().sort((a,b)=>(b.importance??0)-(a.importance??0)||b.eventSeq-a.eventSeq).slice(0,6);
 const selected=memoryMode?retrieveNpcEpisodes(context.observations,recall.query):[...new Map([...important,...recent].map(m=>[m.eventSeq,m])).values()].sort((a,b)=>a.eventSeq-b.eventSeq);
 out.observations=selected.map(m=>({
  ...pick(m,memoryFields),...(memoryMode&&m.observedState?{observedState:pick(m.observedState,['holder','condition','effect'])}:{}),evidence:{basis:m.channel??'unknown',meaning:basis[m.channel]??'来源不详，不能声称目击',
   actor:m.actorId==='actor-4'?'玩家':m.actorId===null?'未识别的行为人':'身份不详',minutesAgo:minutes(context.tick,m.tick)}}));
 out.agreement=context.agreement?{...pick(context.agreement,agreementFields),terms:pick(context.agreement.terms,['repairAmount','loanTicks'])}:null;
 out.conversation=context.conversation.slice(-8).map(t=>({...pick(t,['eventSeq','tick','utterance','reply','memoryRefs']),evidence:'仅为双方说过的话，不证明声称的事情发生；旧回复也可能有误'}));
 // 只从本轮真正发送的两类资料重建目录，不接收外部传入的引用白名单。
 out.referenceOptions={observationEventSeqs:out.observations.map(m=>m.eventSeq),conversationEventSeqs:out.conversation.map(m=>m.eventSeq),
  format:'memoryRefs只能是上述编号中最多3个正整数的升序无重复JSON数组；可用[]。交谈编号只证明说过。lifeHistory、activity与knownFacts不新增编号。'};
 const holder=out.self.knownHolder;
 out.knownFacts={version:1,identity:{selfId:'actor-2',selfRole:'你是猎人',playerId:'actor-4',playerRole:'正在与你交谈的玩家'},tickMinutes:TICK_MINUTES,
  tool:{holder:holder==='actor-2'?'self':holder==='actor-4'?'player':'unknown',
   meaning:holder==='actor-2'?'按你已知的情况，工具仍由你本人持有，不是玩家持有；不推断随身携带或实际位置':holder==='actor-4'?'按你已知的情况，工具由玩家持有':'不知道当前持有人，不推断拿走工具的人',condition:out.self.knownCondition??null},
  agreement:agreementFacts(out.agreement,out.tick),
  authority:'这是NPC已知事实的派生说明，不是全知事实。以当前已知状态和实际经历为依据；旧交谈不能覆盖事件。不能凭空添加耽误工作等后果。'};
 out.intentHint=dialogueIntentHint(text,out);
 out.negotiationOptions={...knownNegotiationOptions(out.self,out.agreement),authority:'仅依据当前可知状态计算的候选，不是批准、接受或实际借出；提交后仍核对距离、物品和当时关系。'};
 if(memoryMode){
  const coverage=context.memoryCoverage;
  requireCondition(coverage&&nat(coverage.forgottenEpisodes)&&nat(coverage.forgottenSpeech),'Invalid memory coverage');
  out.memoryMode=NPC_MEMORY_VERSION;out.memoryCoverage=pick(coverage,['forgottenEpisodes','forgottenSpeech']);
  out.recallFocus=recall.focus;
  out.memoryUpdates=npcMemoryUpdates(out.observations,out.self);
  if(out.activity){out.knownFacts.life=npcLifeFacts(out.self,out.activity,out.tick);if(out.lifeHistoryVersion)out.knownFacts.life.recentHistory=out.lifeHistory;}
 }
 return out;
}
