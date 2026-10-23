import {fields,integer,denseArray,requireCondition,cloneData} from './data-contract.mjs';
import {SOCIAL_ACTIONS,validSocialPayload,validSocialResult} from '../../runtime-social-contract.mjs';
import {NEGOTIATION_MAP_VERSION} from '../../runtime-negotiation-contract.mjs';

export const SOCIAL_MAP_VERSION='campaign-map-v3';
export const isSocialMapVersion=version=>[SOCIAL_MAP_VERSION,NEGOTIATION_MAP_VERSION].includes(version);
export const SOCIAL_COMMAND='PlayerInteract';
const IDS=['actor-1','actor-2','actor-3'],STASH={x:5,y:8};
const VILLAGE_SPOTS=Array.from({length:9},(_,i)=>({x:3+i%3,y:6+Math.floor(i/3)}));
const dist=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const bounded=n=>Math.max(0,Math.min(100,n));
const model=w=>w.mapModel.socialModel;
const hunter=w=>model(w).actors[1];
const body=(w,id)=>w.actorModel.actors.find(a=>a.actorId===id);
const pos=(w,id)=>id==='actor-4'?w.mapModel.position:w.mapModel.npcs.find(n=>n.actorId===id);
const spot=w=>model(w).asset.holderId==='actor-4'?w.mapModel.position:STASH;
const seen=(w,id,at)=>body(w,id).alive&&dist(pos(w,id),at)<=1;
const assetState=w=>({holderId:model(w).asset.holderId,condition:model(w).asset.condition});
const stance=a=>a.fear>=40?'afraid':a.grievance>=20||a.trust<35?'wary':a.trust>=65?'warm':'calm';
const KINDS=['talk','threaten','steal','rob','smash','help','return','apologize','ask-help','gift','missing','damage','overdue'];

export function createSocialModel(){return {version:'npc-social-v1',asset:{assetId:'hunter-tools',ownerId:'actor-2',holderId:'actor-2',condition:60,loanDueTick:null},
 actors:IDS.map(actorId=>({actorId,trust:50,fear:0,grievance:0,knownHolder:'actor-2',knownCondition:60,lastHarmSeq:0,lastApologySeq:0,memories:[]})),
 lastReply:null};}

export function validateSocialModel(s,tick,agreements=false){
 fields(s,['version','asset','actors','lastReply']);requireCondition(s.version==='npc-social-v1','Unsupported social model');
 fields(s.asset,['assetId','ownerId','holderId','condition','loanDueTick']);
 requireCondition(s.asset.assetId==='hunter-tools'&&s.asset.ownerId==='actor-2'&&['actor-2','actor-4'].includes(s.asset.holderId),'Invalid tool ownership');
 integer(s.asset.condition);requireCondition(s.asset.condition<=100,'Invalid tool condition');
 if(s.asset.loanDueTick!==null){integer(s.asset.loanDueTick);requireCondition(s.asset.holderId==='actor-4','Loan without a borrower');}
 denseArray(s.actors,3);requireCondition(s.actors.length===3,'Social roster mismatch');
 for(const [i,a] of s.actors.entries()){
  fields(a,['actorId','trust','fear','grievance','knownHolder','knownCondition','lastHarmSeq','lastApologySeq','memories']);
  requireCondition(a.actorId===IDS[i]&&['actor-2','actor-4','unknown'].includes(a.knownHolder),'Invalid actor knowledge');
  for(const k of ['trust','fear','grievance','knownCondition']){integer(a[k]);requireCondition(a[k]<=100,'Social score outside range');}
  integer(a.lastHarmSeq);integer(a.lastApologySeq);denseArray(a.memories,32);let previous=0;
  for(const m of a.memories){fields(m,['eventSeq','tick','kind','actorId','channel','importance','text']);integer(m.eventSeq,1);integer(m.tick);integer(m.importance,1);
   requireCondition(m.eventSeq>previous&&m.tick<=tick&&m.importance<=3&&(KINDS.includes(m.kind)||agreements&&m.kind==='agreement')&&[null,'actor-4'].includes(m.actorId)&&
    ['self','witness','discovery'].includes(m.channel)&&typeof m.text==='string'&&m.text.length<=300,'Invalid social memory');previous=m.eventSeq;
   if(m.channel==='discovery'&&['missing','damage'].includes(m.kind))requireCondition(m.actorId===null,'Discovery cannot invent a culprit');
  }
 }
 if(s.lastReply!==null){fields(s.lastReply,['text','refs','tick']);requireCondition(typeof s.lastReply.text==='string'&&s.lastReply.text.length<=300,'Invalid reply');integer(s.lastReply.tick);requireCondition(s.lastReply.tick<=tick,'Future reply');denseArray(s.lastReply.refs,3);let prev=0;for(const ref of s.lastReply.refs){integer(ref,1);requireCondition(ref>prev,'Unordered reply refs');prev=ref;}}
}

export function rememberSocial(a,seq,tick,kind,actorId,channel,text,importance=1){
 requireCondition(!a.memories.some(m=>m.eventSeq===seq),'Duplicate social observation');
 a.memories.push({eventSeq:seq,tick,kind,actorId,channel,importance,text});
 // Evict the oldest least significant episode; accumulated relationships are not reapplied.
 if(a.memories.length>32){const least=Math.min(...a.memories.map(m=>m.importance));a.memories.splice(a.memories.findIndex(m=>m.importance===least),1);}
}
const remember=rememberSocial;
function harmful(a,seq,kind){
 const changes={threaten:[15,25,15],steal:[25,10,30],rob:[35,35,40],smash:[25,20,30]};
 const [trust,fear,grievance]=changes[kind];a.trust=bounded(a.trust-trust);a.fear=bounded(a.fear+fear);a.grievance=bounded(a.grievance+grievance);a.lastHarmSeq=seq;
}
function useful(a,trust=10){a.trust=bounded(a.trust+trust);a.fear=bounded(a.fear-10);a.grievance=bounded(a.grievance-4);}
export function preflightSocialPayload(payload){requireCondition(validSocialPayload(payload),'Invalid social interaction payload');}

export function auditSocial(world,dto){
 if(dto.type!==SOCIAL_COMMAND)return null;
 requireCondition(isSocialMapVersion(world.mapModel.version),'Social interactions require a new social world','COMMAND_UNSUPPORTED');
 const {action}=dto.payload,s=model(world),p=pos(world,'actor-4');let reasonCode=null;
 if(!body(world,'actor-4').alive)reasonCode='PLAYER_DEAD';
 else if(!body(world,'actor-2').alive)reasonCode='RECIPIENT_DEAD';
 else if(world.encounterModel.encounter?.status==='active')reasonCode='ENCOUNTER_BUSY';
 else if(world.mapModel.order?.status==='marching')reasonCode='RULE_REJECTED';
 else if(['steal','smash'].includes(action)){
  if(s.asset.holderId!=='actor-2')reasonCode='ASSET_UNAVAILABLE';
  else if(dist(p,STASH)>1)reasonCode='NOT_COLOCATED';
  else if(action==='smash'&&s.asset.condition===0)reasonCode='ASSET_UNAVAILABLE';
 }else if(dist(p,pos(world,'actor-2'))>1)reasonCode='NOT_COLOCATED';
 else if(['help','return','rob','ask-help'].includes(action)&&dist(p,STASH)>1)reasonCode='NOT_COLOCATED';
 else if(action==='return'&&s.asset.holderId!=='actor-4')reasonCode='NOT_HELD';
 else if(['help','rob','ask-help'].includes(action)&&s.asset.holderId!=='actor-2')reasonCode='ASSET_UNAVAILABLE';
 else if(action==='help'&&s.asset.condition===100)reasonCode='NOT_DAMAGED';
 if(!reasonCode&&world.mapModel.version===NEGOTIATION_MAP_VERSION&&action==='ask-help'&&
  ['accepted','ready','borrowed'].includes(world.mapModel.negotiationModel.agreement?.status))reasonCode='RULE_REJECTED';
 return {outcome:reasonCode?'rejected':'succeeded',reasonCode,durationTicks:reasonCode?0:1,worldCommand:true,directTicks:true,directCommand:true};
}

function recall(a,topic){
 const memories=a.memories.filter(m=>m.kind!=='talk'&&(topic!=='relationship'||m.importance>=2));
 return memories.sort((x,y)=>(a.grievance>=20?y.importance-x.importance:0)||y.eventSeq-x.eventSeq)[0]??null;
}
function talk(world,topic){
 const a=hunter(world),own=world.societyModel.agents[1].state,actor=body(world,'actor-2');
 if(topic==='past'){
  const memory=recall(a,topic);return memory?{speech:'我记得：'+memory.text,refs:[memory.eventSeq]}:{speech:'我们还没有太多共同经历。',refs:[]};
 }
 if(topic==='relationship'){
  const memory=recall(a,topic),text=stance(a)==='afraid'?'我现在怕你。请离我远一些。':stance(a)==='wary'?'我仍对你有戒心。后来的帮助不能当作之前什么都没发生。':stance(a)==='warm'?'你实际帮过我，我愿意多信任你一点。':'我们还需要慢慢了解。';
  return {speech:text,refs:memory?[memory.eventSeq]:[]};
 }
 if(a.knownHolder==='unknown')return {speech:'我的工具包不见了。我没看见是谁拿的，得先找回来。',refs:[]};
 if(a.knownCondition<40)return {speech:'工具已经坏到无法干活了，需要先修好。',refs:[]};
 if(a.fear>=40)return {speech:'我得先找个安全的地方，暂时顾不上工作。',refs:[]};
 if(actor.fatigue>=800)return {speech:'我太累了，需要休息。',refs:[]};
 return {speech:own.inventory.food<=1?(own.wallet>=10?'口粮不多了，我打算用自己的钱买粮。':'口粮不多，钱也不够。我需要一个能拿到工资的活。'):'我暂时有口粮，可以处理别的事情。',refs:[]};
}

export function commitSocial(world,dto,tick,eventSeq){
 const {action,topic}=dto.payload,s=model(world),a=hunter(world),before=assetState(world),witnesses=IDS.filter(id=>seen(world,id,pos(world,'actor-4')));
 let effect,speech,refs=[],importance=1,harm=false,changedAsset=false;
 if(action==='talk'){({speech,refs}=talk(world,topic));effect='talked';}
 if(action==='threaten'){harm=true;importance=3;effect='threatened';speech=a.fear>=25?'别再逼我，我会躲开你。':'我听见你的威胁了。别靠近我的东西。';}
 if(action==='steal'){
  harm=true;importance=3;
  if(witnesses.includes('actor-2')){effect='caught';speech='我看见你伸手了。把手收回去！';}
  else{s.asset.holderId='actor-4';changedAsset=true;effect='taken';speech='';}
 }
 if(action==='rob'){
  harm=true;importance=3;
  const supported=witnesses.some(id=>id!=='actor-2');
  if((a.fear>=40&&!supported)||body(world,'actor-4').health>body(world,'actor-2').health+200){s.asset.holderId='actor-4';changedAsset=true;effect='taken';speech='拿去。离我远一点，我会记住这件事。';}
  else{effect='resisted';speech=supported?'有人在旁边，我不会把工具交给你。':'我不会把工具交给你。';}
 }
 if(action==='smash'){harm=true;importance=3;s.asset.condition=Math.max(0,s.asset.condition-40);changedAsset=true;effect='smashed';speech=witnesses.includes('actor-2')?'你砸的是我干活的工具！':'';}
 if(action==='help'){s.asset.condition=Math.min(100,s.asset.condition+20);changedAsset=true;useful(a);importance=2;effect='repaired';speech=a.grievance>=20?'工具修好了一些，谢谢。但之前的事我还记得。':'你确实帮我修好了工具，谢谢。';}
 if(action==='return'){s.asset.holderId='actor-2';s.asset.loanDueTick=null;changedAsset=true;useful(a,8);importance=2;effect='returned';speech=a.grievance>=20?'工具回来了。至于之前的事，我们还需要时间。':'工具收到了，谢谢你带回来。';}
 if(action==='apologize'){
  if(a.lastHarmSeq>a.lastApologySeq){a.lastApologySeq=eventSeq;a.grievance=bounded(a.grievance-3);effect='apologized';speech='我听到了。能否重新信任你，还要看你以后怎么做。';}
  else{effect='refused';speech='你已经说过了，先看实际行动吧。';}
 }
 if(action==='ask-help'){
  if(a.trust>=65&&a.fear<20&&a.grievance<15&&s.asset.condition>=40){s.asset.holderId='actor-4';s.asset.loanDueTick=tick+144;changedAsset=true;effect='lent';importance=2;speech='工具可以借你。请在一天内带回这里还给我。';}
  else{effect='refused';speech=a.fear>=20||a.grievance>=15?'我现在不愿把自己的东西交给你。':'我们还不够熟悉，我暂时不能借你工具。';}
 }
 const descriptions={talk:'玩家与我谈过'+({needs:'近况',past:'往事',relationship:'彼此关系'}[topic]??'话')+'。',threaten:'玩家当面威胁了我。',
  steal:effect==='caught'?'玩家偷取工具时被我发现。':'我看到玩家拿走猎人的工具包。',rob:effect==='taken'?'玩家强行夺走了我的工具。':'玩家试图抢夺我的工具，我拒绝了。',
  smash:'玩家砸坏了猎人的工具。',help:'玩家实际帮我修理了工具。',return:'玩家把工具带回并交还。',apologize:'玩家向我道了歉。',
  'ask-help':effect==='lent'?'我把工具借给玩家，约定一天内归还。':'玩家请求借工具，我没有答应。'};
 for(const observer of s.actors){
  const direct=observer.actorId==='actor-2'&&!['steal','smash'].includes(action);
  if(!direct&&!witnesses.includes(observer.actorId))continue;
  // Casual speech stays with its recipient; visible deeds can be witnessed locally.
  if(!harm&&!direct&&!['help','return'].includes(action))continue;
  if(harm)harmful(observer,eventSeq,action);
  else if(!direct)useful(observer,3);
  const message=observer.actorId==='actor-2'?descriptions[action]:`我目击玩家${({threaten:'威胁猎人',steal:effect==='caught'?'试图拿取猎人的工具，被发现阻止':'拿走猎人的工具',rob:effect==='taken'?'抢走猎人的工具':'试图抢工具，被猎人拒绝',smash:'砸坏猎人的工具',help:'修理猎人的工具',return:'归还猎人的工具'})[action]}。`;
  remember(observer,eventSeq,tick,action,'actor-4',direct||observer.actorId==='actor-2'?'self':'witness',message,importance);
  if(changedAsset){observer.knownHolder=s.asset.holderId;observer.knownCondition=s.asset.condition;}
 }
 if(witnesses.includes('actor-2')||!['steal','smash'].includes(action))s.lastReply={text:speech,refs,tick};
 const result={actorId:'actor-2',action,topic:topic??null,effect,speech,asset:changedAsset||['steal','rob','smash'].includes(action)?{before,after:assetState(world)}:null,sourceEventSeq:eventSeq,memoryRefs:refs};
 requireCondition(validSocialResult(result,dto.payload),'Invalid social result');return result;
}

export function observeSocialGift(world,fact){
 if(!isSocialMapVersion(world.mapModel.version))return;
 const a=hunter(world);useful(a,5);remember(a,fact.eventSeq,fact.tick,'gift','actor-4','self','玩家给了我一份粮食。',2);
}
export function observeSocialTick(world,tick,append){
 if(!isSocialMapVersion(world.mapModel.version)||!body(world,'actor-2').alive)return;
 const s=model(world),a=hunter(world);let kind=null,text=null;
 // Fear eases with time away; neither trust nor remembered harm is reset by waiting.
 if(tick%24===0&&dist(pos(world,'actor-2'),pos(world,'actor-4'))>3)a.fear=bounded(a.fear-5);
 if(s.asset.loanDueTick!==null&&tick>s.asset.loanDueTick&&a.knownHolder==='actor-4'){
  kind='overdue';text='玩家答应归还工具，但约定时间过去仍未归还。';s.asset.loanDueTick=null;a.grievance=bounded(a.grievance+15);a.trust=bounded(a.trust-10);
 }else if(dist(pos(world,'actor-2'),STASH)<=1){
  if(s.asset.holderId==='actor-4'&&a.knownHolder==='actor-2'){kind='missing';text='我发现工具包不在原处，没有看见是谁拿走的。';a.knownHolder='unknown';}
  else if(s.asset.holderId==='actor-2'&&s.asset.condition<a.knownCondition){kind='damage';text='我发现工具损坏了，没有看见是谁做的。';a.knownCondition=s.asset.condition;}
 }
 if(kind){const payload={actorId:'actor-2',kind,text};const seq=append({type:'NpcPerceptionRecorded',sourceSystem:'campaign',commandId:null,entityIds:['actor-2'],causationEventSeqs:[],payload});
  remember(a,seq,tick,kind,kind==='overdue'?'actor-4':null,'discovery',text,2);if(kind==='overdue')a.lastHarmSeq=seq;}
}
export function socialTravelTarget(world,ordinary){
 if(!isSocialMapVersion(world.mapModel.version))return ordinary;
 const a=hunter(world);
 if(a.fear>=40&&dist(pos(world,'actor-2'),pos(world,'actor-4'))<=3){
  const player=pos(world,'actor-4'),self=pos(world,'actor-2');
  return VILLAGE_SPOTS.slice().sort((x,y)=>dist(y,player)-dist(x,player)||dist(x,self)-dist(y,self)||x.y-y.y||x.x-y.x)[0];
 }
 if(a.knownHolder!=='actor-2'||a.knownCondition<40)return STASH;
 return ordinary;
}
export function socialWorkReady(map){return !isSocialMapVersion(map?.version)||
 (map.socialModel.asset.holderId==='actor-2'&&map.socialModel.asset.condition>=40&&map.socialModel.actors[1].fear<40);}
export function socialView(world){
 const s=model(world),near=seen(world,'actor-2',pos(world,'actor-4')),visible=dist(spot(world),pos(world,'actor-4'))<=4;
 return {npc:near?{actorId:'actor-2',stance:stance(hunter(world)),speech:s.lastReply?.text??'',memoryRefs:cloneData(s.lastReply?.refs??[])}:null,
  asset:visible?{assetId:'hunter-tools',name:'猎人的工具包',...assetState(world),x:spot(world).x,y:spot(world).y}:null,
  actions:SOCIAL_ACTIONS.map(action=>{const plan=auditSocial(world,{type:SOCIAL_COMMAND,payload:{targetId:'actor-2',action,...(action==='talk'?{topic:'needs'}:{})}});return {action,available:plan.outcome==='succeeded',reasonCode:plan.reasonCode};})};
}
