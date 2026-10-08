const byId=id=>document.getElementById(id);
const status=byId('mind-status'),refreshButton=byId('mind-refresh');
const occupationLabel={chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'};
const locationLabel={village:'村庄',forest:'森林'};
const beliefLabel={available:'有药',unavailable:'无药',unknown:'未知'};
const stanceLabel={'uncertain-supply':'供给不明','expect-supply':'预期有药','expect-no-supply':'预期无药'};
const choiceLabel={'UseMedicine':'用药','BuyMedicine':'买药','NoAction':'无动作'};
const outcomeLabel={succeeded:'成功',rejected:'拒绝','no-action':'无动作'};
let selected='actor-2',last=null,refreshing=false;

function decisionConclusion(decision){
  if(!decision)return null;
  if(decision.choice==='BuyMedicine')return 'available';
  if(decision.choice==='UseMedicine')return null;
  if(decision.reasonCode==='SUPPLY_UNAVAILABLE')return 'unavailable';
  if(decision.reasonCode==='SUPPLY_UNKNOWN')return 'unknown';
  return null;
}
function setText(id,value){byId(id).textContent=value==null||value===''?'—':String(value);}

function renderActor(actor){
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
  byId('observations-note').textContent=`已记录的观察 ${k.observations?.length??0} 条`;
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
  }
  if(o){
    byId('outcome-status').textContent=outcomeLabel[o.status]??o.status;
    byId('outcome-code').textContent=o.code??'—';
    byId('outcome-delta').textContent=o.delta?`钱包 ${o.delta.wallet} · 药 ${o.delta.herbs} · 健康 ${o.delta.health}`:'—';
    setText('outcome-price',o.price);
  }
  const conclusion=decisionConclusion(d),current=b.value;
  if(conclusion && (current==='available'||current==='unavailable') && conclusion!==current){
    byId('belief-note').textContent=`已纠正：当时依据结论为「${beliefLabel[conclusion]}」，当前判断为「${beliefLabel[current]}」。`;
  }else if(d){
    byId('belief-note').textContent=`当时决策依据与当前判断一致（${beliefLabel[current]??'未知'}）。`;
  }else{byId('belief-note').textContent='';}
}
function renderReading(inspector){
  byId('mind-sim').textContent=inspector.simulationId;
  byId('mind-time').textContent=`tick ${inspector.tick} · revision ${inspector.revision}`;
  setText('fact-herbs',inspector.worldFacts?.publicHerbs);
  setText('fact-price',inspector.worldFacts?.postedHerbPrice);
  renderActor(inspector.actors?.find(a=>a.knowledge?.actorId===selected));
}
async function readInspector(){
  const response=await fetch('/api/runtime/minds',{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(response.status===404)throw Object.assign(new Error('mind unavailable'),{code:'MIND_UNAVAILABLE'});
  if(!response.ok)throw new Error('读数读取失败');
  const dto=await response.json();
  if(dto.apiVersion!==1 || dto.mindVersion!=='mind-inspector-v1')throw new Error('未知检查器接口');
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