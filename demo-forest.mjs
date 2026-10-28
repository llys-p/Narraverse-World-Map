import {FOREST_ACTIONS} from './runtime-forest-contract.mjs';
const labels={collect:'用工具采枯枝 · 30分钟',camp:'生火歇脚 · 30分钟',observe:'观察狼迹 · 10分钟',avoid:'绕开狼迹 · 不耗时'};
const reasons={NOT_COLOCATED:'需靠近林间歇脚处 (16, 7)',NOT_HELD:'需要实际携带工具',ASSET_UNAVAILABLE:'工具耐久需至少40',FOREST_DEPLETED:'此处枯枝已采尽，不会刷新',NO_FIREWOOD:'需要1捆枯枝',NOT_TIRED:'目前无需恢复疲劳',PLAYER_DEAD:'玩家已倒下',ENCOUNTER_BUSY:'先结束遭遇',RULE_REJECTED:'先暂停行军，或选择其他行动'};
const trailText={unseen:'泥地上留着狼爪印。可以观察，也可以直接绕开。',observed:'狼迹延伸进林间。是否迎战由你决定，采集和返村都不要求猎狼。',avoided:'你选择绕开狼迹。可以安心处理手头的事，或重新观察后再决定。',engaged:'当前遭遇进行中。攻击可能受到反击；随时可结束遭遇，或花1小时逃离。',resolved:'这次遭遇已经结束。可以继续采集、歇脚或返村；再次观察才会开放新的挑战。'};
export function createForestPanel({submit}){
 const $=id=>document.getElementById(id);let group=null,writable=false;
 const allowed=action=>writable&&group?.map.forest?.actions.find(a=>a.action===action)?.available;
 for(const action of FOREST_ACTIONS)$('forest-'+action).addEventListener('click',()=>{if(allowed(action))submit('PlayerForest',{action});});
 $('forest-challenge').addEventListener('click',()=>{if(writable&&group?.map.forest&&group.encounter.actions.canBegin)submit('EncounterBegin',{});});
 $('forest-exit').addEventListener('click',()=>{if(writable&&group?.map.forest&&group.encounter.actions.canCancel)submit('EncounterCancel',{encounterId:group.encounter.encounter.encounterId});});
 $('forest-return').addEventListener('click',()=>{if(writable&&group?.map.forest&&group.encounter.encounter?.status!=='active'&&group.map.budget.remainingCommands>=3)submit('MarchSet',{x:4,y:7});});
 return {paint(value,write){group=value;writable=write;const v=group?.map.forest;$('forestJourney').hidden=!v;if(!v)return;
  const f=v.state,tool=group.map.social?.asset,loan=group.map.playable?.quests.find(q=>q.id==='hunter-trust');
  $('forestSupplies').textContent='林间歇脚处 (16, 7) · 枯枝剩余 '+f.branchesRemaining+'/3捆 · 随身枯枝 '+f.firewood+'捆 · '+(tool?.holderId==='actor-4'?'工具耐久 '+tool.condition+'/100':'未携带工具')+'。';
  $('forestCosts').textContent='采集：取1捆枯枝，耐久−10，疲劳+25。生火：消耗1捆，疲劳最多−200；不回血、不补粮。两者各推进30分钟，借期与世界活动照常推进。'+(loan?.loanDueTick&&loan.progress[0]&&!loan.progress[2]?' 借期剩余 '+Math.max(0,loan.loanDueTick-group.map.tick)*10+' 分钟；归还还需10分钟。':'');
  $('forestTrail').textContent=trailText[f.trail];
  for(const action of FOREST_ACTIONS){const b=$('forest-'+action),a=v.actions.find(a=>a.action===action);b.disabled=!allowed(action);b.textContent=labels[action];b.title=a.available?'':reasons[a.reasonCode]??'';}
  $('forestActionHint').textContent=v.actions.filter(a=>!a.available).map(a=>labels[a.action].split(' · ')[0]+'：'+reasons[a.reasonCode]).join('；');
  $('forest-challenge').disabled=!write||!group.encounter.actions.canBegin;
  $('forest-exit').disabled=!write||!group.encounter.actions.canCancel;
  $('forest-return').disabled=!write||group.encounter.encounter?.status==='active'||group.map.budget.remainingCommands<3;
 }};
}
