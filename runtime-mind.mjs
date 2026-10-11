const byId=id=>document.getElementById(id);
const status=byId('mind-status'),refreshButton=byId('mind-refresh');
const occupationLabel={chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'};
const locationLabel={village:'村庄',forest:'森林'};
const beliefLabel={available:'有药',unavailable:'无药',unknown:'未知'};
const stanceLabel={'uncertain-supply':'供给不明','expect-supply':'预期有药','expect-no-supply':'预期无药'};
const choiceLabel={'UseMedicine':'用药','BuyMedicine':'买药','NoAction':'无动作','WorkForPay':'工作','Rest':'休息','BuyFood':'买粮'};
const outcomeLabel={succeeded:'成功',rejected:'拒绝','no-action':'无动作'};
const motivationGateLabel={'URGENT_FATIGUE':'急迫疲劳 · 只允许休息','NEW_MAJOR_DUTY':'新的重大职责 · 打开完整重评','CONTINUE_COMMITTED':'继续已承诺计划','RESUME_COMMITTED':'恢复挂起的治疗计划','LOCAL_REPLAN_BLOCKED':'受阻 · 就地局部重评','SELECT_NEW_PLAN':'选择新计划'};
const motivationStanceLabel={'fatigue-concerned':'以疲劳为虑','health-concerned':'以健康为虑','balanced':'平稳'};
const planKindLabel={'recover-health':'恢复健康','aid-village':'履行村中职责','recover-rest':'恢复疲劳'};
const planStatusLabel={ready:'就绪',blocked:'受阻',suspended:'挂起',completed:'已完成',cancelled:'已取消'};
const blockCodeLabel={'SOFT_PRECONDITION_FAILED':'软前提未满足','COMMITMENT_PROTECTED':'承诺保护','URGENT_OVERRIDE':'急迫覆盖'};
const dutyStatusLabel={pending:'待履约',fulfilled:'已履约'};
const cfCaseLabel={baseline:'基准（原配置）','duty-minus-200':'假设：职责权重 −200','risk-plus-200':'假设：风险厌恶 +200'};
const MOTIVATION_BLOCKS=['m2-fact-food','m2-self-extra','m2-profile-row','m2-goal-row','m2-duty-plan','m2-decision-fields','m2-outcome-fatigue','m2-outcome-owner','m2-counterfactual'];
// M4A (survival-inspector-v1) only: the food/income loop. Everything here is rendered verbatim
// from the served DTO; the page never re-evaluates a plan, a quote or a decision.
const SURVIVAL_BLOCKS=['surv-fact-food-price','surv-self-food','survival-food'];
const survivalReasonLabel={NO_FOOD_NEED:'暂无取食需求',FOOD_QUOTE_MISSING:'本人没有可知粮价',FOOD_QUOTE_EXPIRED:'可知粮价已过期',
  FOOD_UNAVAILABLE:'公开无粮',WALLET_INSUFFICIENT:'钱包不足',CAPACITY_UNAVAILABLE:'私粮已满',
  DUTY_UNAVAILABLE:'没有合法工作机会',BUY_FOOD:'买粮',FOOD_INCOME:'为买粮而工作'};
// M3-4A (cognition-inspector-v1) only: the review-cadence panel and the work-experience window.
// Everything here is rendered verbatim from the served DTO; the page never re-evaluates the
// kernel, never borrows candidates for a maintain decision and never invents a counterfactual.
const COGNITION_BLOCKS=['cognition-review','cognition-experience'];
const cognitionModeLabel={review:'完整重评',maintain:'维持承诺',dormant:'休眠'};
const workSampleStatusLabel={succeeded:'成功',rejected:'拒绝（权威）'};
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
    if(canonicalFingerprint(frozen)!==fingerprint || !['mind-knowledge-v1','motivation-knowledge-v1','cognition-knowledge-v1'].includes(frozen.knowledgeVersion) || frozen.phase!=='decision' ||
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
function setCognitionMode(on){for(const id of COGNITION_BLOCKS)byId(id).hidden=!on;}
function setSurvivalMode(on){for(const id of SURVIVAL_BLOCKS)byId(id).hidden=!on;}
// The survival inspector shows the actor's own food quote and work offer with their real source
// and expiry, plus the live step and an honest reason for waiting. Nothing is inferred here.
function renderSurvival(actor){
  const k=actor.knowledge,q=k.foodQuote,o=k.workOffer,plan=k.planState?.activePlan??null;
  byId('surv-food-quote').textContent=q===null?'无（本人没有可知粮价来源）':
    `粮价 ${q.price} 金币 · ${q.available?'公开有粮':'公开无粮'} · 观测 tick ${q.observedTick} · 有效期至 tick ${q.expiresTick} · 来源事件 ${q.sourceEventSeq}`;
  byId('surv-work-offer').textContent=o===null?'无（没有本人真实收到且待履约的机会）':
    `请求 ${o.requestId} · 工资 ${o.wage} · 窗口 tick ${o.observedTick}–${o.expiresTick} · 来源事件 ${o.sourceEventSeq}`;
  byId('surv-current-step').textContent=plan===null?'无进行中的取食计划':
    `计划 #${plan.planId} ${plan.kind} · ${plan.steps.join(' → ')} · 当前第 ${plan.stepIndex+1}/${plan.steps.length} 步（${plan.status}）· 期限第 ${plan.deadlineDay} 天`;
  const d=actor.lastDecision,out=actor.lastOutcome;
  let reason;
  if(out&&out.status==='rejected')reason=`权威拒绝：${out.code??'—'}${out.failureOwner?`（失败归属 计划 #${out.failureOwner.planId}${out.failureOwner.goalId===null?'（临时，无长期目标）':''}）`:''}`;
  else if(d&&d.choice==='NoAction'&&d.candidates?.length){
    const food=d.candidates.find(c=>c.action==='BuyFood');
    reason=`等待：${
      food&&!food.eligible?`${survivalReasonLabel[food.reasonCode]??food.reasonCode}`:`门 ${d.gateReason}`}`;
  }
  else if(d)reason=`已执行 ${d.choice}（${d.gateReason}）`;
  else reason='尚无决定';
  byId('surv-wait-reason').textContent=reason;
}
// Display-side parse only: the frozen kernel schedules cognition reviews on whole days and
// cognition-state validates exactly this id shape against lastReviewTick. This annotates the
// reported anchor; it recomputes no decision, signal or counterfactual.
const reviewDayTick=id=>{const match=/^cognition-day-([1-9][0-9]*)-actor-[23]$/.exec(id);return match?Number(match[1])*144:null;};
// The decision-time frozen knowledge lives inside lastDecision.knowledgeFingerprint. Only an
// exact canonical cognition decision DTO is accepted; nothing is inferred from the choice.
function frozenDecisionKnowledge(decision){
  if(!decision||typeof decision.knowledgeFingerprint!=='string')return null;
  try{
    const frozen=JSON.parse(decision.knowledgeFingerprint);
    if(canonicalFingerprint(frozen)!==decision.knowledgeFingerprint)return null;
    if(!['cognition-knowledge-v1','survival-knowledge-v1'].includes(frozen.knowledgeVersion)||frozen.phase!=='decision')return null;
    if(frozen.actorId!==decision.actorId||frozen.tick!==decision.tick||frozen.revision!==decision.tick-1)return null;
    return frozen;
  }catch{return null;}
}
function clearCognitionReadings(){
  for(const id of ['cog-eval-input','cog-eval-decision','cog-review-anchors','cog-source-review','cog-frozen-experience','cog-window-summary'])byId(id).textContent='—';
  byId('cog-maintain-note').hidden=true;byId('cog-window-empty').hidden=true;byId('cog-window-list').replaceChildren();
}
function renderCognition(actor){
  const cog=actor.cognition??null,review=cog?.reviewState??null,ev=review?.lastEvaluation??null,d=actor.lastDecision,w=actor.workExperience;
  if(ev){
    const input=ev.input,dec=ev.decision;
    byId('cog-eval-input').textContent=`关注 ${input.importancePermille}‰ · 相关性 ${input.relevancePermille}‰ · ${input.alive?'存活':'已故'} · 评估 tick ${input.tick}`;
    byId('cog-eval-decision').textContent=`${cognitionModeLabel[dec.mode]??dec.mode} · ${dec.shouldReview?'应重评':'不重评'} · ${dec.tier} · 分数 ${dec.score} · 原因 [${dec.reasonCodes.join(', ')||'无'}] · 间隔 ${dec.intervalTicks??'—'} · 下次评审 ${dec.nextReviewTick==null?'无':`tick ${dec.nextReviewTick}`}`;
  }else{byId('cog-eval-input').textContent='尚无评审记录';byId('cog-eval-decision').textContent='尚无评审记录';}
  byId('cog-review-anchors').textContent=cog?.lastReviewDecisionId==null
    ?'无（还没有完成过的完整评审）'
    :`${cog.lastReviewDecisionId} · Planned 事件 ${cog.lastReviewEventSeq} · 实际 tick ${review?.lastReviewTick??'—'}（来源：本人最近一次完整评审锚点）`;
  const sourceId=d?.sourceReviewDecisionId,sourceTick=typeof sourceId==='string'?reviewDayTick(sourceId):null;
  byId('cog-source-review').textContent=sourceId==null
    ?(d?'无（本次为完整重评，候选来自本次比较）':'尚无决策，未引用任何评审锚点')
    :`${sourceId} · Planned 事件 ${d.sourceReviewEventSeq}${sourceTick==null?'':` · 实际 tick ${sourceTick}`}（来源：上次评审锚点，非本次评分）`;
  byId('cog-maintain-note').hidden=!(d&&d.mode==='maintain');
  const frozen=frozenDecisionKnowledge(d);
  byId('cog-frozen-experience').textContent=frozen?.experience
    ?`决定时冻结：样本 ${frozen.experience.sampleCount} · 失败 ${frozen.experience.failureCount} · 惩罚 ${frozen.experience.penaltyPermille}‰ · 证据 ${frozen.experience.evidenceRefs.join(', ')||'无'} · 经验开关 ${frozen.useWorkExperience===true?'开':frozen.useWorkExperience===false?'关':'未知'}`
    :(d?'无法读取合法的当时冻结经验；未从选择或结果推断。':'尚无决策，没有决定时冻结经验。');
  const state=w?.state??null,view=w?.view??null;
  byId('cog-window-summary').textContent=view?`当前窗口：样本 ${view.sampleCount} · 失败 ${view.failureCount} · 惩罚 ${view.penaltyPermille}‰ · 证据 ${view.evidenceRefs.join(', ')||'无'}`:'—';
  const samples=Array.isArray(state?.samples)?state.samples:[],list=byId('cog-window-list');
  list.replaceChildren();byId('cog-window-empty').hidden=samples.length>0;
  for(const sample of [...samples].reverse()){
    const item=document.createElement('li');
    item.textContent=`tick ${sample.occurrenceTick} · 事件 ${sample.sourceEventSeq} · ${sample.actorId} · 决定 ${sample.decisionId} · 命令 ${sample.commandId} · ${workSampleStatusLabel[sample.status]??sample.status}`;
    list.append(item);
  }
}
function motivationPlanText(plan){
  if(!plan)return '无';
  const steps=Array.isArray(plan.steps)&&plan.steps.length?`（${plan.steps.join(' → ')}）`:'';
  return `#${plan.planId} ${planKindLabel[plan.kind]??plan.kind} · ${planStatusLabel[plan.status]??plan.status} · 步骤 ${plan.stepIndex}/${plan.steps?.length??'?'}${steps} · 期限 第 ${plan.deadlineDay} 天`;
}
function renderCounterfactual(cf,cognition=false){
  const list=byId('cf-list'),empty=byId('cf-empty'),cases=Array.isArray(cf)?cf:[];
  empty.textContent=cognition?'本轮无反事实。':'暂无反事实记录。';
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

function renderActor(actor,mode='mind'){
  const motivation=mode==='motivation'||mode==='cognition';
  if(!actor){byId('knowledge-alive').textContent='未纳入心智';clearCognitionReadings();return;}
  const k=actor.knowledge,s=k.self,b=k.belief||{},q=k.quote;
  byId('knowledge-title').textContent=`本人所知 · ${s.name}`;
  byId('knowledge-alive').textContent=s.alive?'存活':'已故 · 封存';
  setText('self-name',s.name);setText('self-location',locationLabel[s.location]??s.location);
  setText('self-health',s.health);setText('self-wallet',s.wallet);setText('self-herbs',s.inventory?.herbs);
  setText('self-food',s.inventory?.food);
  byId('self-quote').textContent=q&&Number.isSafeInteger(q.price)?`${q.price} 金币（tick ${q.observedTick}）`:'—';
  byId('belief-value').textContent=beliefLabel[b.value]??'未知';
  byId('belief-confidence').textContent=b.confidencePermille!=null?`${b.confidencePermille}‰`:'—';
  byId('inner-stance').textContent=stanceLabel[k.innerStance]??k.innerStance??'—';
  byId('committed-intent').textContent=k.committedIntent?`${k.committedIntent.kind}（目标 ${k.committedIntent.goalId}）`:'无';
  if(motivation){
    setText('self-hunger-fatigue',`${s.hunger} / ${s.fatigue}`);
    setText('profile-weights',k.profile?`职责 ${k.profile.dutyWeightPermille}‰ · 风险厌恶 ${k.profile.riskAversionPermille}‰`:'—');
    const goal=s.currentGoal;
    byId('self-current-goal').textContent=goal?`#${goal.goalId} ${goal.kind??''}${goal.target!=null?` · 目标值 ${goal.target}`:''}${goal.step!=null?` · 阶段 ${goal.step}`:''}${goal.deadlineDay!=null?` · 截止第 ${goal.deadlineDay} 天`:''}`:'无';
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
    renderCounterfactual(actor.counterfactual,mode==='cognition');
    if(mode==='cognition')renderCognition(actor);else clearCognitionReadings();
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
      const availability=motivation?(candidate.selectable?'可选':`不可选（${blockCodeLabel[candidate.selectionBlockCode]??candidate.selectionBlockCode??'—'}）`):
        candidate.eligible?'可选':'不可选';
      item.textContent=`${choiceLabel[candidate.action]??candidate.action} · ${availability} · ${candidate.reasonCode}`;
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
    byId('outcome-delta').textContent=o.delta?
      `钱包 ${o.delta.wallet}${o.delta.food===undefined?'':` · 私粮 ${o.delta.food}`} · 药 ${o.delta.herbs} · 健康 ${o.delta.health}`:'—';
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
  const cognition=inspector.mindVersion==='cognition-inspector-v1';
  const survival=inspector.mindVersion==='survival-inspector-v1';
  setMotivationMode(motivation||cognition||survival);
  setCognitionMode(cognition||survival);
  setSurvivalMode(survival);
  byId('mind-sim').textContent=inspector.simulationId;
  byId('mind-time').textContent=`tick ${inspector.tick} · revision ${inspector.revision}`;
  if(motivation||cognition||survival)setText('fact-food',inspector.worldFacts?.publicFood);
  if(survival)setText('fact-food-price',inspector.worldFacts?.postedFoodPrice);
  setText('fact-herbs',inspector.worldFacts?.publicHerbs);
  setText('fact-price',inspector.worldFacts?.postedHerbPrice);
  const actor=inspector.actors?.find(a=>a.knowledge?.actorId===selected);
  const actorSurvival=survival&&actor?.knowledge?.knowledgeVersion==='survival-knowledge-v1';
  setSurvivalMode(actorSurvival);
  byId('surv-fact-food-price').hidden=!survival;
  if(actorSurvival)renderSurvival(actor);
  renderActor(actor,motivation?'motivation':cognition||survival?'cognition':'mind');
}
async function readInspector(){
  const response=await fetch('/api/runtime/minds',{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(response.status===404)throw Object.assign(new Error('mind unavailable'),{code:'MIND_UNAVAILABLE'});
  if(!response.ok)throw new Error('读数读取失败');
  const dto=await response.json();
  if(dto.apiVersion!==1 || !['mind-inspector-v1','motivation-inspector-v1','cognition-inspector-v1','survival-inspector-v1'].includes(dto.mindVersion))throw new Error('未知检查器接口');
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
