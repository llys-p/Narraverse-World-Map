const byId=id=>document.getElementById(id);
const status=byId('mind-status'),refreshButton=byId('mind-refresh');
const occupationLabel={chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'};
const locationLabel={village:'村庄',forest:'森林'};
const beliefLabel={available:'有药',unavailable:'无药',unknown:'未知'};
const stanceLabel={'uncertain-supply':'供给不明','expect-supply':'预期有药','expect-no-supply':'预期无药'};
const choiceLabel={'UseMedicine':'用药','BuyMedicine':'买药','NoAction':'无动作','WorkForPay':'工作','Rest':'休息'};
const outcomeLabel={succeeded:'成功',rejected:'拒绝','no-action':'无动作'};
const motivationGateLabel={'URGENT_FATIGUE':'急迫疲劳 · 只允许休息','NEW_MAJOR_DUTY':'新的重大职责 · 打开完整重评','CONTINUE_COMMITTED':'继续已承诺计划','RESUME_COMMITTED':'恢复挂起的治疗计划','LOCAL_REPLAN_BLOCKED':'受阻 · 就地局部重评','SELECT_NEW_PLAN':'选择新计划'};
const motivationStanceLabel={'fatigue-concerned':'以疲劳为虑','health-concerned':'以健康为虑','balanced':'平稳'};
const planKindLabel={'recover-health':'恢复健康','aid-village':'履行村中职责','recover-rest':'恢复疲劳'};
const planStatusLabel={ready:'就绪',blocked:'受阻',suspended:'挂起',completed:'已完成',cancelled:'已取消'};
const blockCodeLabel={'SOFT_PRECONDITION_FAILED':'软前提未满足','COMMITMENT_PROTECTED':'承诺保护','URGENT_OVERRIDE':'急迫覆盖'};
const dutyStatusLabel={pending:'待履约',fulfilled:'已履约'};
const cfCaseLabel={baseline:'基准（原配置）','duty-minus-200':'假设：职责权重 −200','risk-plus-200':'假设：风险厌恶 +200'};
const MOTIVATION_BLOCKS=['m2-fact-food','m2-self-extra','m2-profile-row','m2-goal-row','m2-duty-plan','m2-decision-fields','m2-outcome-fatigue','m2-outcome-owner','m2-counterfactual'];
let selected='actor-2',last=null,refreshing=false;
const canonicalFingerprint=value=>{
  const encode=item=>item===null||typeof item!=='object'?JSON.stringify(item):Array.isArray(item)?`[${item.map(encode).join(',')}]`:
    `{${Object.keys(item).sort().map(key=>`${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
  return encode(value);
};

function decisionConclusion(decision){
  if(!decision)return null;
  try{
    const fingerprint=decision.knowledgeFingerprint;
    if(typeof fingerprint!=='string')return null;
    const frozen=JSON.parse(fingerprint);
    if(canonicalFingerprint(frozen)!==fingerprint || !['mind-knowledge-v1','motivation-knowledge-v1'].includes(frozen.knowledgeVersion) || frozen.phase!=='decision' ||
      frozen.actorId!==decision.actorId || frozen.tick!==decision.tick || frozen.revision!==decision.tick-1 ||
      !['available','unavailable','unknown'].includes(frozen.belief?.value))return null;
    return frozen.belief.value;
  }catch{return null;}
}
function setText(id,value){byId(id).textContent=value==null||value===''?'—':String(value);}
// M2 (motivation-inspector-v1) only: show the M2-only blocks, hide the two M1 knowledge rows
// whose source fields do not exist in M2 knowledge. M1 readings keep the original layout.
function setMotivationMode(on){
  for(const id of MOTIVATION_BLOCKS)byId(id).hidden=!on;
  byId('m1-stance-row').hidden=on;byId('m1-intent-row').hidden=on;
}
function motivationPlanText(plan){
  if(!plan)return '无';
  const steps=Array.isArray(plan.steps)&&plan.steps.length?`（${plan.steps.join(' → ')}）`:'';
  return `#${plan.planId} ${planKindLabel[plan.kind]??plan.kind} · ${planStatusLabel[plan.status]??plan.status} · 步骤 ${plan.stepIndex}/${plan.steps?.length??'?'}${steps} · 期限 第 ${typeof plan.deadlineDay==='number'?plan.deadlineDay+1:plan.deadlineDay} 天`;
}
function renderCounterfactual(cf){
  const list=byId('cf-list'),empty=byId('cf-empty'),cases=Array.isArray(cf)?cf:[];
  empty.hidden=cases.length>0;list.replaceChildren();
  for(const item of cases){
    const li=document.createElement('li');
    let text=`${cfCaseLabel[item.caseId]??item.caseId}`;
    if(item.changedField!=null)text+=` · ${item.changedField} ${item.fromValue}→${item.toValue}`;
    text+=` · 假设选择 ${choiceLabel[item.choice]??item.choice} · 门 ${motivationGateLabel[item.gateReason]??item.gateReason??'—'}`;
    const blocked=(item.candidates??[]).filter(candidate=>candidate.eligible&&!candidate.selectable);
    if(blocked.length)text+=` · 被拦截：${blocked.map(candidate=>`${choiceLabel[candidate.action]??candidate.action}（${blockCodeLabel[candidate.selectionBlockCode]??candidate.selectionBlockCode}）`).join('、')}`;
    li.textContent=text;list.append(li);
  }
}

function renderActor(actor,motivation=false){
  if(!actor){byId('knowledge-alive').textContent='未纳入心智';return;}
  const k=actor.knowledge,s=k.self,b=k.belief||{},q=k.quote;
  byId('knowledge-title').textContent=`本人所知 · ${s.name}`;
  byId('knowledge-alive').textContent=s.alive?'存活':'已故 · 封存';
  setText('self-name',s.name);setText('self-location',locationLabel[s.location]??s.location);
  setText('self-health',s.health);setText('self-wallet',s.wallet);setText('self-herbs',s.inventory?.herbs);
  byId('self-quote').textContent=q&&Number.isSafeInteger(q.price)?`${q.price} 金币（tick ${q.observedTick}）`:'—';
  byId('belief-value').textContent=beliefLabel[b.value]??'未知';
  byId('belief-confidence').textContent=b.confidencePermille!=null?`${b.confidencePermille}‰`:'—';
  byId('inner-stance').textContent=stanceLabel[k.innerStance]??k.innerStance??'—';
  byId('committed-intent').textContent=k.committedIntent?`${k.committedIntent.kind}（目标 ${k.committedIntent.goalId}）`:'无';
  if(motivation){
    setText('self-hunger-fatigue',`${s.hunger} / ${s.fatigue}`);
    setText('profile-weights',k.profile?`职责 ${k.profile.dutyWeightPermille}‰ · 风险厌恶 ${k.profile.riskAversionPermille}‰`:'—');
    const goal=s.currentGoal;
    byId('self-current-goal').textContent=goal?`#${goal.goalId} ${goal.kind??''}${goal.target!=null?` · 目标值 ${goal.target}`:''}${goal.step!=null?` · 阶段 ${goal.step}`:''}${goal.deadlineDay!=null?` · 截止第 ${goal.deadlineDay+1} 天`:''}`:'无';
    const duty=k.duty;
    byId('duty-summary').textContent=duty?`${duty.requestId} · 紧急度 ${duty.urgencyPermille}‰ · 窗口 tick ${duty.observedTick}–${duty.expiresTick}`:'无';
    let dutyText='无请求';
    if(duty){dutyText=dutyStatusLabel[duty.status]??duty.status;
      if(duty.status==='fulfilled'&&duty.fulfilledTick!=null)dutyText+=`（tick ${duty.fulfilledTick}）`;
      else if(duty.status==='pending'&&typeof duty.expiresTick==='number'&&k.tick>=duty.expiresTick)dutyText+='（窗口已过期）';}
    byId('duty-status').textContent=dutyText;
    byId('plan-active').textContent=motivationPlanText(k.planState?.activePlan);
    byId('plan-suspended').textContent=motivationPlanText(k.planState?.suspendedPlan);
    byId('plan-reviewed').textContent=k.planState?.lastReviewedDutyId??'无';
    renderCounterfactual(actor.counterfactual);
  }
  byId('observations-note').textContent=`已记录的观察 ${k.observations?.length??0} 条`;
  byId('observations-list').replaceChildren();
  for(const observation of k.observations??[]){
    const item=document.createElement('li');
    const value=observation.available===true?'有药':observation.available===false?'无药':'未知';
    item.textContent=`${observation.channel} · ${value} · tick ${observation.observedTick} · 来源事件 ${observation.sourceEventSeq}`;
    byId('observations-list').append(item);
  }
  const d=actor.lastDecision,o=actor.lastOutcome;
  const empty=byId('decision-empty'),decisionFields=byId('decision-fields'),outcomeFields=byId('outcome-fields'),seal=byId('decision-seal');
  if(!d && !o){
    empty.hidden=false;empty.textContent=s.alive?'尚未到决策时点':'已故，心智记录封存（无决定）。';
    decisionFields.hidden=true;outcomeFields.hidden=true;seal.textContent='';byId('belief-note').textContent='';
    return;
  }
  empty.hidden=true;decisionFields.hidden=!d;outcomeFields.hidden=!o;seal.textContent=s.alive?'':'封存记录';
  if(d){
    setText('decision-choice',choiceLabel[d.choice]??d.choice);
    setText('decision-reason',d.reasonCode);
    setText('decision-goal',d.goalId==null?'无目标':d.goalId);
    byId('decision-evidence').textContent=d.evidenceRefs?.length?d.evidenceRefs.join(', '):'无';
    byId('decision-candidates').replaceChildren();
    for(const candidate of d.candidates??[]){
      const item=document.createElement('li');
      item.textContent=`${choiceLabel[candidate.action]??candidate.action} · ${candidate.eligible?'可选':'不可选'} · ${candidate.reasonCode}`;
      byId('decision-candidates').append(item);
    }
    if(motivation){
      byId('decision-gate').textContent=motivationGateLabel[d.gateReason]??d.gateReason??'—';
      byId('decision-inner').textContent=motivationStanceLabel[d.innerStance]??d.innerStance??'—';
      byId('decision-intent').textContent=d.committedIntent?`${d.committedIntent.kind}（目标 ${d.committedIntent.goalId}）`:'无';
      byId('decision-apparent').textContent=choiceLabel[d.apparentAction]??d.apparentAction??'—';
      byId('decision-plan').textContent=d.planId!=null?`计划 #${d.planId}${d.goalId!=null?`（绑定长期目标 ${d.goalId}）`:'（临时 · 不绑定长期目标）'}`:'无';
      setText('decision-strain',d.strainPermille!=null?`${d.strainPermille}‰`:'—');
      const body=byId('m2-candidates-body');body.replaceChildren();
      for(const candidate of d.candidates??[]){
        const row=document.createElement('tr');
        for(const text of [choiceLabel[candidate.action]??candidate.action,
          `${candidate.provider??'—'} / ${candidate.sourceRef==null?'—':candidate.sourceRef}`,
          candidate.eligible?'满足':'不满足',
          `${candidate.support??0} / ${candidate.opposition??0}`,
          candidate.score==null?'—':String(candidate.score),
          candidate.selectable?'可选':(blockCodeLabel[candidate.selectionBlockCode]??candidate.selectionBlockCode??'—'),
          candidate.reasonCode]){
          const cell=document.createElement('td');cell.textContent=text;row.append(cell);
        }
        body.append(row);
      }
    }
  }
  if(o){
    byId('outcome-status').textContent=outcomeLabel[o.status]??o.status;
    byId('outcome-code').textContent=o.code??'—';
    byId('outcome-delta').textContent=o.delta?`钱包 ${o.delta.wallet} · 药 ${o.delta.herbs} · 健康 ${o.delta.health}`:'—';
    setText('outcome-price',o.price);
    if(motivation){
      setText('outcome-fatigue',o.delta?.fatigue);
      const owner=o.failureOwner;
      byId('outcome-owner').textContent=`公粮记账 ${o.publicFoodProduced??0} · 失败归属 ${owner?`计划 #${owner.planId}${owner.goalId!=null?`（长期目标 ${owner.goalId}）`:'（临时，无长期目标）'}`:'无'}`;
    }
  }
  const conclusion=decisionConclusion(d),current=b.value;
  byId('decision-belief').textContent=conclusion?beliefLabel[conclusion]:'无法读取合法的当时判断依据';
  if(conclusion && (current==='available'||current==='unavailable') && conclusion!==current){
    byId('belief-note').textContent=`已纠正：当时依据结论为「${beliefLabel[conclusion]}」，当前判断为「${beliefLabel[current]}」。`;
  }else if(d && conclusion){
    byId('belief-note').textContent=`当时判断为「${beliefLabel[conclusion]}」；当前判断为「${beliefLabel[current]??'未知'}」。`;
  }else if(d){
    byId('belief-note').textContent='无法读取合法的当时判断依据；未从选择或原因推断。';
  }else{byId('belief-note').textContent='';}
}
function renderReading(inspector){
  const motivation=inspector.mindVersion==='motivation-inspector-v1';
  setMotivationMode(motivation);
  byId('mind-sim').textContent=inspector.simulationId;
  byId('mind-time').textContent=`tick ${inspector.tick} · revision ${inspector.revision}`;
  if(motivation)setText('fact-food',inspector.worldFacts?.publicFood);
  setText('fact-herbs',inspector.worldFacts?.publicHerbs);
  setText('fact-price',inspector.worldFacts?.postedHerbPrice);
  renderActor(inspector.actors?.find(a=>a.knowledge?.actorId===selected),motivation);
}
async function readInspector(){
  const response=await fetch('/api/runtime/minds',{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(response.status===404)throw Object.assign(new Error('mind unavailable'),{code:'MIND_UNAVAILABLE'});
  if(!response.ok)throw new Error('读数读取失败');
  const dto=await response.json();
  if(dto.apiVersion!==1 || !['mind-inspector-v1','motivation-inspector-v1'].includes(dto.mindVersion))throw new Error('未知检查器接口');
  if(!Number.isSafeInteger(dto.revision) || !Number.isSafeInteger(dto.tick) || !Array.isArray(dto.actors))throw new Error('检查器读数无效');
  return dto;
}
function selectActor(id){
  selected=id;
  byId('actor-2').dataset.active=String(selected==='actor-2');
  byId('actor-3').dataset.active=String(selected==='actor-3');
  if(last)renderReading(last.inspector);
}
async function refresh(){
  if(refreshing)return;refreshing=true;refreshButton.disabled=true;
  status.dataset.state='loading';status.textContent='正在读取心智检查器…';
  try{
    const inspector=await readInspector();
    if(last && inspector.revision<last.revision){
      status.dataset.state='ready';
      status.textContent=`已保留较新读数（revision ${last.revision}），迟到的 revision ${inspector.revision} 未覆盖。`;
    }else{
      last={revision:inspector.revision,inspector};
      renderReading(inspector);
      status.dataset.state='ready';status.textContent=`已读取 revision ${inspector.revision}。`;
    }
  }catch(error){
    status.dataset.state='error';
    status.textContent=error.code==='MIND_UNAVAILABLE'?'心智检查器不可用。':
      last?`读取失败，保留上次读数（revision ${last.revision}）。请重试。`:'暂时无法连接心智检查器。请重试。';
  }finally{refreshing=false;refreshButton.disabled=false;}
}
byId('actor-2').addEventListener('click',()=>selectActor('actor-2'));
byId('actor-3').addEventListener('click',()=>selectActor('actor-3'));
refreshButton.addEventListener('click',refresh);
document.addEventListener?.('keydown',event=>{
  if(event.key==='1')selectActor('actor-2');
  else if(event.key==='2')selectActor('actor-3');
  else if(event.key==='r'||event.key==='R')refresh();
});
refresh();
