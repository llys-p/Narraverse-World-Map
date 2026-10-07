const byId=id=>document.getElementById(id),status=byId('connection'),button=byId('refresh');let last=null;
const occupations={chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'};
const advance=byId('advance'),ticks=byId('advance-ticks'),commandStatus=byId('command-status');let writable=false,pending=null,submitting=false,lastPlayer=null,actionsAvailable=false;
const actionControls=['travel-destination','travel-submit','rest-submit','trade-product','trade-quantity','buy-submit','sell-submit'];
function controls(){advance.disabled=!writable || !last || submitting;ticks.disabled=submitting || pending!==null;advance.textContent=pending?'重试同一请求':'推进世界时间';
  for(const id of actionControls)byId(id).disabled=!writable || !actionsAvailable || !lastPlayer?.self.identity.alive || submitting || pending!==null;
  if(lastPlayer?.actions && !lastPlayer.actions.canTrade)for(const id of ['trade-product','trade-quantity','buy-submit','sell-submit'])byId(id).disabled=true;
}
function render(dto){
  byId('world-time').textContent=`第 ${dto.clock.day+1} 天 · ${String(dto.clock.hour).padStart(2,'0')}:${String(dto.clock.minute).padStart(2,'0')}`;
  byId('stock-food').textContent=dto.market.food;byId('stock-herbs').textContent=dto.market.herbs;
  byId('price-food').textContent=`公布粮价 ${dto.market.prices.food} 金币 / 份`;byId('price-herbs').textContent=`公布药价 ${dto.market.prices.herbs} 金币 / 份`;
  byId('human-count').textContent=dto.population.totalAlive;byId('named-count').textContent=`${dto.population.namedAlive} 位实名居民 · ${dto.population.unnamedAlive} 位普通居民`;
  byId('deer-count').textContent=dto.population.deer;byId('wolf-count').textContent=dto.population.wolves;
  byId('route-state').textContent=dto.market.routeOpen?'贸易路线开放':'贸易路线暂停';
  const rows=dto.actors.map(a=>{const li=document.createElement('li'),seal=document.createElement('span'),body=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');
    seal.className='seal';seal.textContent=occupations[a.occupation]?.slice(0,1)??'人';name.textContent=a.name;
    detail.textContent=`${occupations[a.occupation]??a.occupation} · ${a.location==='village'?'村庄':a.location} · ${a.alive?'存活':'已逝'}`;
    body.append(name,detail);li.append(seal,body);return li;});
  byId('actor-list').replaceChildren(...rows);document.documentElement.dataset.revision=String(dto.revision);
}
function renderPlayer(player){
  byId('player-panel').hidden=player===null;if(!player)return;const s=player.self,a=s.identity;
  byId('player-identity').textContent=`${a.name} · ${a.location==='village'?'村庄':a.location==='forest'?'森林':a.location} · ${a.alive?'存活':`已逝 · 第 ${Math.floor(a.deathTick/144)+1} 天`}`;
  for(const key of ['health','hunger','fatigue','wallet'])byId('player-'+key).textContent=s[key];
  byId('player-food').textContent=s.inventory.food;byId('player-herbs').textContent=s.inventory.herbs;
  byId('player-needs').textContent=`当前需求：食物 ${s.needs.food} · 治疗 ${s.needs.healing} · 休息 ${s.needs.rest}`;
  byId('player-panel').dataset.revision=String(player.revision);
}
function renderActions(player){
  byId('action-panel').hidden=!player?.actions;if(!player?.actions)return;const actions=player.actions;
  const options=actions.locations.filter(location=>location!==player.self.identity.location).map(location=>{
    const option=document.createElement('option');option.value=location;option.textContent=location==='forest'?'森林':'村庄';return option;});
  byId('travel-destination').replaceChildren(...options);byId('travel-submit').textContent=`旅行 · ${actions.travelTicks*10} 分钟`;
  byId('rest-submit').textContent=`休整 · ${actions.restTicks*10} 分钟`;byId('trade-quantity').max=String(actions.maxQuantity);
  byId('trade-prices').textContent=`粮食 买 ${actions.prices.food.buy} / 卖 ${actions.prices.food.sell} 金币 · 药材 买 ${actions.prices.herbs.buy} / 卖 ${actions.prices.herbs.sell} 金币`;
  byId('trade-note').textContent=`整笔买卖耗时 ${actions.tradeTicks*10} 分钟，按完成时价格结算，期间可能变化。${actions.canTrade?'':'当前地点或生命状态不能交易。'}`;
}
async function readPair(playerAvailable){
  const read=async route=>{const response=await fetch(route,{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new Error('读数读取失败');const dto=await response.json();if(dto.apiVersion!==1)throw new Error('未知世界接口');return dto;};
  for(let attempt=0;attempt<2;attempt++){
    const [dto,player]=await Promise.all([read('/api/runtime/snapshot'),playerAvailable?read('/api/runtime/player'):null]);
    if(!player || (dto.simulationId===player.simulationId && dto.revision===player.revision && dto.tick===player.tick))return {dto,player};
  }
  throw Object.assign(new Error('两份世界读数不一致'),{code:'READING_CONFLICT'});
}
let refreshing=false;
async function refresh(){
  if(refreshing)return;refreshing=true;
  button.disabled=true;status.dataset.state='loading';status.textContent='正在读取世界…';
  try{
    const capResponse=await fetch('/api/runtime/capabilities',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!capResponse.ok)throw new Error('世界能力读取失败');const capabilities=await capResponse.json();
    if(capabilities.apiVersion!==1 || typeof capabilities.playerAvailable!=='boolean')throw new Error('未知世界能力');
    const {dto,player}=await readPair(capabilities.playerAvailable);
    if(capabilities.playerActionsAvailable===true && !player?.actions)throw new Error('动作读数缺失');
    render(dto);renderPlayer(player);renderActions(player);last=dto;lastPlayer=player;actionsAvailable=capabilities.playerActionsAvailable===true;
    writable=capabilities.writes===true;byId('time-controls').hidden=!writable;
    byId('map-note').textContent=writable?'世界时间仅在明确提交后推进':'只读观察 · 世界时间不会自动流逝';
    status.dataset.state='ready';status.textContent='已读取服务保存的世界 · 刷新不会推进时间';
  }catch(error){status.dataset.state='error';status.textContent=error.code==='READING_CONFLICT'?
    (last?'世界与本人读数暂不一致，保留上次一致读数。请刷新重试。':'世界与本人读数暂不一致，暂未显示。请刷新重试。'):
    (last?'连接中断，显示上次读数。请重试。':'暂时无法连接世界。请重试。');}
  finally{refreshing=false;button.disabled=false;controls();}
}
function validReceipt(receipt,dto){
  if(!receipt || typeof receipt!=='object' || Array.isArray(receipt))return false;
  if(receipt.apiVersion!==1 || receipt.commandId!==dto.commandId || receipt.status!=='committed' || receipt.fromRevision!==dto.expectedRevision ||
    !Number.isSafeInteger(receipt.toRevision) || receipt.toRevision<=receipt.fromRevision || receipt.tick!==receipt.toRevision)return false;
  const fields=dto.version===1?['apiVersion','commandId','status','fromRevision','toRevision','tick']:
    ['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','tick','type','outcome','result'];
  if(Object.keys(receipt).length!==fields.length || !fields.every(key=>Object.hasOwn(receipt,key)))return false;
  if(dto.version===1)return receipt.toRevision-receipt.fromRevision===dto.payload.ticks;
  if(receipt.receiptVersion!==2 || receipt.type!==dto.type || !['succeeded','rejected'].includes(receipt.outcome) || !receipt.result)return false;
  const actions=lastPlayer?.actions,duration=actions?.[dto.type==='PlayerTravel'?'travelTicks':dto.type==='PlayerRest'?'restTicks':'tradeTicks'];
  if(!Number.isSafeInteger(duration) || duration<1 || receipt.toRevision-receipt.fromRevision!==duration)return false;
  if(receipt.outcome==='rejected')return Object.keys(receipt.result).length===1 && receipt.result.code==='RULE_REJECTED';
  const r=receipt.result,resultFields=['actorId','type','startTick','endTick','product','quantity','unitPrice','amount','before','after'];
  if(Object.keys(r).length!==resultFields.length || !resultFields.every(key=>Object.hasOwn(r,key)) || r.actorId!=='actor-4' || r.type!==dto.type ||
    r.startTick!==receipt.fromRevision || r.endTick!==receipt.toRevision || ![null,'food','herbs'].includes(r.product) ||
    ![r.quantity,r.unitPrice,r.amount].every(n=>Number.isSafeInteger(n) && n>=0))return false;
  if(['PlayerBuy','PlayerSell'].includes(dto.type)){
    if(r.product!==dto.payload.product || r.quantity!==dto.payload.quantity || r.unitPrice<1 ||
      !Number.isSafeInteger(r.quantity*r.unitPrice) || r.amount!==r.quantity*r.unitPrice)return false;
  }else if(r.product!==null || r.quantity!==0 || r.unitPrice!==0 || r.amount!==0)return false;
  if(dto.type==='PlayerTravel' && r.after?.location!==dto.payload.destination)return false;
  return [r.before,r.after].every(row=>row && Object.keys(row).length===6 && ['location','fatigue','wallet','inventory','publicStock','communalGold'].every(key=>Object.hasOwn(row,key)) && ['village','forest'].includes(row.location) &&
    [row.fatigue,row.wallet,row.communalGold].every(n=>Number.isSafeInteger(n) && n>=0) && [row.inventory,row.publicStock].every(stock=>
      stock && Object.keys(stock).length===2 && [stock.food,stock.herbs].every(n=>Number.isSafeInteger(n) && n>=0)));
}
async function submitIntent(dto){
  if(submitting || !writable || !last)return;
  if(!pending)pending=dto;if(!pending)return;
  submitting=true;controls();commandStatus.dataset.state='loading';commandStatus.textContent='正在提交世界请求…';
  try{
    const response=await fetch('/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});
    if(response.status===409){pending=null;commandStatus.dataset.state='error';commandStatus.textContent='世界已变化或请求冲突，已重新读取。请确认读数后再次操作。';await refresh();return;}
    if(!response.ok){if([400,405,413,415,422].includes(response.status))pending=null;
      commandStatus.dataset.state='error';commandStatus.textContent=pending?'请求未能完成，可重试同一请求。':'请求被拒绝，请检查输入或重新读取世界。';return;}
    const receipt=await response.json();
    if(!validReceipt(receipt,pending))throw new Error('Invalid receipt');
    const rejected=receipt.outcome==='rejected',action=pending.version===2;
    pending=null;commandStatus.dataset.state=rejected?'error':'ready';commandStatus.textContent=rejected?'时间已推进，动作未完成。正在读取新的世界读数。':
      action?'动作已完成，正在读取新的世界读数。':'时间已提交，正在读取新的世界读数。';await refresh();
  }catch{commandStatus.dataset.state='error';commandStatus.textContent='连接中断，结果尚未确认。重试同一请求不会重复执行。';}
  finally{submitting=false;controls();}
}
function submitTime(){return submitIntent(pending??{version:1,commandId:crypto.randomUUID(),expectedRevision:last?.revision,type:'AdvanceTime',payload:{ticks:Number(ticks.value)}});}
function submitAction(type,payload){if(pending || !actionsAvailable || !lastPlayer)return;
  return submitIntent({version:2,commandId:crypto.randomUUID(),expectedRevision:last.revision,type,payload});}
byId('travel-form').addEventListener('submit',event=>{event.preventDefault();submitAction('PlayerTravel',{destination:byId('travel-destination').value});});
byId('rest-submit').addEventListener('click',()=>submitAction('PlayerRest',{}));
byId('trade-form').addEventListener('submit',event=>{event.preventDefault();submitAction(event.submitter?.id==='sell-submit'?'PlayerSell':'PlayerBuy',
  {product:byId('trade-product').value,quantity:Number(byId('trade-quantity').value)});});
button.addEventListener('click',refresh);advance.addEventListener('click',submitTime);refresh();
