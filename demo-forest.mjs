import {FOREST_ACTIONS,forestDuration} from './runtime-forest-contract.mjs';
const labels={collect:'用工具采枯枝 · 30分钟',camp:'生火歇脚 · 30分钟',observe:'观察狼迹 · 10分钟',avoid:'绕开狼迹 · 不耗时',site:'走到林间歇脚处',rest:'普通休整',challenge:'主动迎战森林狼',exit:'结束遭遇 · 不耗时',return:'返回村庄'};
const reasons={NOT_COLOCATED:'需靠近林间歇脚处 (16, 7)',NOT_HELD:'需要实际携带工具',ASSET_UNAVAILABLE:'工具耐久需至少40',FOREST_DEPLETED:'此处枯枝已采尽，不会刷新',NO_FIREWOOD:'需要1捆枯枝',NOT_TIRED:'目前无需恢复疲劳',PLAYER_DEAD:'玩家已倒下',ENCOUNTER_BUSY:'先结束遭遇'};
const trailText={unseen:'泥地上留着狼爪印。可以观察，也可以直接绕开。',observed:'狼迹延伸进林间。是否迎战由你决定，采集和返村都不要求猎狼。',avoided:'你选择绕开狼迹。可以处理手头的事，或重新观察后再决定。',engaged:'当前遭遇进行中。攻击可能受到反击；可结束遭遇，或在战斗区选择1小时逃离。',resolved:'这次遭遇已经结束。可以继续采集、歇脚或返村；再次观察才会开放新的挑战。'};
const same=(a,b)=>a?.x===b.x&&a?.y===b.y;
function currentLoan(g){
 const q=g.map.playable?.quests.find(q=>q.id==='hunter-trust'),held=g.map.social?.asset?.holderId==='actor-4';
 if(!held)return {remaining:null,text:'当前未携带工具；借还以实际交接为准。'};
 if(q?.status==='active'&&q.progress[0]&&!q.progress[2]&&Number.isSafeInteger(q.loanDueTick)){
  const remaining=q.loanDueTick-g.map.tick;
  return {remaining,text:remaining>0?'本次支线借期剩余 '+remaining*10+' 分钟；归还还需10分钟，另需返程和走近猎人的时间。':remaining===0?'本次支线借期已到最后一刻；归还还要推进10分钟，已无法按期交还，仍需实际归还工具。':'这份支线所记借期已过；仍需实际归还工具。'};
 }
 return {remaining:null,text:['failed','abandoned'].includes(q?.status)?'旧委托已'+(q.status==='failed'?'失败':'放弃')+'；手中工具仍需实际归还。当前借期无法仅凭旧委托记录确认。':'手中工具的当前借期无法从这份任务记录确认；持有不等于正式借用，请返村向猎人核对并归还。'};
}
function timeAdvice(loan,ticks){
 if(loan.remaining===null||!ticks)return '';
 const left=loan.remaining-ticks;
 return left<0?'这次行动会超过本次支线借期。':left===0?'这次行动会用尽借期，之后归还将逾期。':left===1?'之后仅剩归还所需的10分钟，尚未计返程；建议先返村。':'行动后借期剩余 '+left*10+' 分钟（未计返程和其他行动）。';
}
// Read only confirmed public state. The same fresh view governs painting and click handlers.
function view(g,write){
 const m=g?.map,v=m?.forest;if(!v)return null;
 const p=g.player?.self,e=g.encounter,active=e?.encounter?.status==='active',marching=m.order?.status==='marching',budget=m.budget.remainingCommands;
 const near=Math.max(Math.abs(m.self.x-v.site.x),Math.abs(m.self.y-v.site.y))<=1,loan=currentLoan(g);
 const common=!m.self.alive?'玩家已倒下；保留原存档，可另开新旅程。':budget<1?'本档操作额度已用完；保留原存档，可另开新旅程。':!write?'当前操作暂不可用，请查看连接与行动确认状态。':'';
 const controls={};
 function add(action,type,payload,reason='',detail='',ticks=0,label=labels[action]){controls[action]={type,payload,reason:common||reason,detail:[detail,timeAdvice(loan,ticks)].filter(Boolean).join(' '),label};}
 for(const action of FOREST_ACTIONS){
  const a=v.actions.find(a=>a.action===action);let reason=active?'先结束遭遇。':marching?'正在行军；请先在地图控制区暂停，或等待抵达。':a?.available?'':reasons[a?.reasonCode]??'当前条件不允许这项行动。';
  if(!active&&!marching&&a?.reasonCode==='RULE_REJECTED'){
   if(action==='collect'&&p?.fatigue>900)reason='疲劳过高，先生火歇脚或普通休整。';
   if(action==='observe'&&v.state.trail==='observed')reason='已经观察过狼迹，可以迎战或绕开。';
   if(action==='avoid'&&!['unseen','observed'].includes(v.state.trail))reason=v.state.trail==='avoided'?'已经绕开，无需重复选择。':'这次遭遇已结束，无需再绕开。';
  }
  const detail={collect:'取1捆枯枝，工具耐久−10、疲劳+25。',camp:'消耗1捆枯枝，疲劳最多−200；不回血、不补粮。',observe:'只观察，不会自动开战或占用狼。',avoid:'不占用狼，不损害关系。'}[action];
  add(action,'PlayerForest',{action},reason,detail,forestDuration(action));
 }
 const move=(action,target)=>{
  const existing=same(m.order?.target,target)&&['marching','paused'].includes(m.order?.status),running=existing&&marching&&g.runner?.active!==false;
  const reason=active?'先结束遭遇再行军。':budget<3?'至少剩余3次操作才能发起行军，途中还会继续消耗额度。':action==='site'&&near?'已经靠近林间歇脚处。':running?'已经在前往这个目的地，抵达后再行动。':'';
  add(action,existing?'MarchResume':'MarchSet',existing?{}:{...target},reason,'行军推进世界和借期；路遇可能暂停，到村后还需走近猎人归还。',0,existing&&!running?(action==='return'?'继续返回村庄':'继续前往歇脚处'):labels[action]);
 };
 move('site',v.site);move('return',{x:4,y:7});
 const restTicks=g.player?.actions?.restTicks??6;
 add('rest','PlayerRest',{},active?'先结束遭遇。':marching?'请先暂停行军或等待抵达。':'','不消耗枯枝，沿用原有休整规则。',restTicks,'普通休整 · '+restTicks*10+'分钟');
 add('challenge','EncounterBegin',{},active?'当前已有遭遇。':marching?'请先暂停行军或等待抵达。':budget<2?'迎战需至少2次操作额度，为结束遭遇保留1次。':!near?'先靠近林间歇脚处，再决定是否迎战。':v.state.trail!=='observed'?'先观察狼迹，再决定是否迎战。':!e?.actions.canBegin?(e?.population?.availableWolves===0?'当前没有可迎战的狼。':'当前状态无法迎战，请查看战斗状态。'):'','攻击可能受伤；结束遭遇不耗时，但不会恢复已受伤害。');
 add('exit','EncounterCancel',{encounterId:e?.encounter?.encounterId},!active?'当前没有进行中的遭遇。':!e?.actions.canCancel?'当前状态无法结束遭遇。':'','保留已经产生的伤害与时间；最后1次操作可用于结束遭遇。');
 let plan=common|| (active?(budget===1?'只剩最后1次操作，请用“结束遭遇”退出；退出不会回血。':'当前正在遭遇中。可在战斗区行动，或在这里结束遭遇后再返村。'):budget<3?'当前只剩 '+budget+' 次操作，已不足以发起返村行军；请保留存档，另开新旅程。':marching?'正在行军；采集和歇脚需抵达或暂停后进行。':!near?'先走到林间歇脚处，再决定采集、歇脚或观察狼迹。':p?.fatigue>900?'疲劳过高，请先恢复体力；没有枯枝也可普通休整。':v.state.branchesRemaining===0?'枯枝已经采尽，不会刷新；可用随身枯枝歇脚，或普通休整后返村。':'采集、歇脚和迎战都可跳过。请结合借期与体力决定，随时可以返村。');
 return {controls,loan,plan};
}
export function createForestPanel({submit}){
 const $=id=>document.getElementById(id);let group=null,writable=false;
 for(const action of Object.keys(labels))$('forest-'+action).addEventListener('click',()=>{const a=view(group,writable)?.controls[action];if(a&&!a.reason)submit(a.type,a.payload);});
 return {paint(value,write){group=value;writable=write;const state=view(group,writable);$('forestJourney').hidden=!state;if(!state)return;
  const f=group.map.forest.state,tool=group.map.social?.asset;
  $('forestSupplies').textContent='林间歇脚处 (16, 7) · 枯枝剩余 '+f.branchesRemaining+'/3捆 · 随身枯枝 '+f.firewood+'捆 · '+(tool?.holderId==='actor-4'?'工具耐久 '+tool.condition+'/100':'未携带工具')+' · 疲劳 '+group.player.self.fatigue+'/1000。';
  $('forestCosts').textContent='采集和生火各推进30分钟，借期与世界活动照常推进；工具磨损保留到归还后。';
  $('forestLoan').textContent=state.loan.text;$('forestPlan').textContent=state.plan;$('forestTrail').textContent=trailText[f.trail];
  for(const [action,a] of Object.entries(state.controls)){const b=$('forest-'+action);b.disabled=!!a.reason;b.textContent=a.label;b.title=a.reason;const hint=$('forest-'+action+'-hint');hint.textContent=[a.reason,a.detail].filter(Boolean).join(' ');}
  $('forestActionHint').textContent=Object.values(state.controls).filter(a=>a.reason).map(a=>a.label.split(' · ')[0]+'：'+a.reason).join('；');
 }};
}
