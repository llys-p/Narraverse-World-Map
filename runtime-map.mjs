import { renderActivityRows, readActivity, renderPersonTracking } from './runtime-activity.mjs';
const byId=id=>document.getElementById(id),status=byId('connection'),button=byId('refresh');let last=null,lastCapabilities=null,lastEncounter=null,lastActivity=null,lastActivityGroup=null;
const occupations={chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'};
const advance=byId('advance'),ticks=byId('advance-ticks'),commandStatus=byId('command-status');let writable=false,pending=null,submitting=false,lastPlayer=null,actionsAvailable=false;
const actionControls=['travel-destination','travel-submit','rest-submit','trade-product','trade-quantity','buy-submit','sell-submit'];
function controls(){const encounterActive=lastEncounter?.encounter?.status==='active';advance.disabled=!writable || !last || submitting || encounterActive || !readingsFresh;ticks.disabled=submitting || pending!==null || encounterActive || !readingsFresh;advance.textContent=pending?'重试同一请求':'推进世界时间';
  byId('encounter-block-note').hidden=!encounterActive;if(encounterActive)byId('encounter-block-note').textContent='遭遇进行中，旅行、休整、交易和世界时间操作已暂停。';
  for(const id of actionControls)byId(id).disabled=!writable || !actionsAvailable || !lastPlayer?.self.identity.alive || submitting || pending!==null || encounterActive || !readingsFresh;
  if(lastPlayer?.actions && !lastPlayer.actions.canTrade)for(const id of ['trade-product','trade-quantity','buy-submit','sell-submit'])byId(id).disabled=true;
}
function render(dto,sceneAvailable,actualLocation){
  byId('world-time').textContent=`第 ${dto.clock.day+1} 天 · ${String(dto.clock.hour).padStart(2,'0')}:${String(dto.clock.minute).padStart(2,'0')}`;
  byId('stock-food').textContent=dto.market.food;byId('stock-herbs').textContent=dto.market.herbs;
  byId('price-food').textContent=`公布粮价 ${dto.market.prices.food} 金币 / 份`;byId('price-herbs').textContent=`公布药价 ${dto.market.prices.herbs} 金币 / 份`;
  byId('human-count').textContent=dto.population.totalAlive;byId('named-count').textContent=`${dto.population.namedAlive} 位实名居民 · ${dto.population.unnamedAlive} 位普通居民`;
  byId('deer-count').textContent=dto.population.deer;byId('wolf-count').textContent=dto.population.wolves;
  byId('route-state').textContent=dto.market.routeOpen?'贸易路线开放':'贸易路线暂停';
  const rows=dto.actors.map(a=>{const li=document.createElement('li'),seal=document.createElement('span'),body=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');
    seal.className='seal';seal.textContent=occupations[a.occupation]?.slice(0,1)??'人';name.textContent=a.name;
    detail.textContent=`${occupations[a.occupation]??a.occupation} · ${a.location==='village'?'村庄':a.location} · ${a.alive?'存活':'已逝'}`;
    const place=sceneAvailable && ['village','forest'].includes(a.location)?a.location:null;
    if(place){const link=document.createElement('a');link.href=`${place==='village'?'/runtime-village.html':'/runtime-encounter.html'}${place==='village'&&actualLocation==='village'?'#'+encodeURIComponent(a.actorId):''}`;
      link.textContent=place==='village'&&actualLocation==='village'?`定位${a.name}`:`查看${place==='village'?'村庄':'森林'}（${a.name}仅在同地点时可见）`;
      link.className='person-place-link';body.append(name,detail,link);}
    else body.append(name,detail);
    li.dataset.actorId=a.actorId;body.dataset.actorId=a.actorId;li.append(seal,body);return li;});
  byId('actor-list').replaceChildren(...rows);document.documentElement.dataset.revision=String(dto.revision);
}
function renderActivity(view,snapshot){
  const panel=byId('activity-panel'),actorFilter=byId('activity-actor'),locationFilter=byId('activity-location');
  panel.hidden=view===null;if(!view){lastActivityGroup=null;return;}
  lastActivityGroup={snapshot,activity:view};
  const prior=actorFilter.value,all=document.createElement('option');all.value='all';all.textContent='全部人物';
  actorFilter.replaceChildren(all,...view.actors.map(actor=>{const option=document.createElement('option');option.value=actor.actorId;option.textContent=actor.name;return option;}));
  actorFilter.value=view.actors.some(actor=>actor.actorId===prior)?prior:'all';
  const count=renderActivityRows(byId('activity-list'),view.entries,actorFilter.value,locationFilter.value);
  byId('activity-count').textContent=`${count} 条 · ${view.window.truncated?'最近窗口，历史已截断':'当前来源窗口'}`;
  const tracking=renderPersonTracking(byId('person-tracking'),snapshot,view,actorFilter.value);
  byId('person-tracking-prompt').hidden=tracking?.selected===true;
}
function rerenderActivity(){if(lastActivityGroup)renderActivity(lastActivityGroup.activity,lastActivityGroup.snapshot);}
byId('activity-actor').addEventListener('change',rerenderActivity);
byId('activity-location').addEventListener('change',rerenderActivity);
function renderPlayer(player,sceneAvailable){
  byId('player-panel').hidden=player===null;if(!player)return;const s=player.self,a=s.identity;
  byId('player-identity').textContent=`${a.name} · ${a.location==='village'?'村庄':a.location==='forest'?'森林':a.location} · ${a.alive?'存活':`已逝 · 第 ${Math.floor(a.deathTick/144)+1} 天`}`;
  for(const key of ['health','hunger','fatigue','wallet'])byId('player-'+key).textContent=s[key];
  byId('player-food').textContent=s.inventory.food;byId('player-herbs').textContent=s.inventory.herbs;
  byId('player-needs').textContent=`当前需求：食物 ${s.needs.food} · 治疗 ${s.needs.healing} · 休息 ${s.needs.rest}`;
  byId('player-panel').dataset.revision=String(player.revision);
  const sceneLink=byId('player-scene-link'),place=a.location;
  sceneLink.hidden=sceneAvailable!==true || !['village','forest'].includes(place);
  if(!sceneLink.hidden){sceneLink.href=`${place==='village'?'/runtime-village.html':'/runtime-encounter.html'}#actor-4`;
    sceneLink.textContent=`定位我在${place==='village'?'村庄':'森林'}的状态`;}
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
async function readPair(playerAvailable,encounterAvailable){
  const read=async route=>{const response=await fetch(route,{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new Error('读数读取失败');const dto=await response.json();if(dto.apiVersion!==1)throw new Error('未知世界接口');return dto;};
  for(let attempt=0;attempt<2;attempt++){
    const [dto,player,encounter]=await Promise.all([read('/api/runtime/snapshot'),playerAvailable?read('/api/runtime/player'):null,
      encounterAvailable?read('/api/runtime/encounter'):null]);
    const samePlayer=!player || (dto.simulationId===player.simulationId && dto.revision===player.revision && dto.tick===player.tick);
    const sameEncounter=!encounter || (player && dto.simulationId===encounter.simulationId && player.simulationId===encounter.simulationId &&
      dto.revision===encounter.revision && player.revision===encounter.revision && dto.tick===encounter.tick && player.tick===encounter.tick);
    if(samePlayer && sameEncounter)return {dto,player,encounter};
  }
  throw Object.assign(new Error('世界投影不一致'),{code:'READING_CONFLICT'});
}let refreshing=false,readingsFresh=false;
async function refresh(){
  if(refreshing)return;refreshing=true;readingsFresh=false;
  button.disabled=true;status.dataset.state='loading';status.textContent='正在读取世界…';
  try{
    const capResponse=await fetch('/api/runtime/capabilities',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!capResponse.ok)throw new Error('世界能力读取失败');const capabilities=await capResponse.json();
    if(capabilities.apiVersion!==1 || typeof capabilities.playerAvailable!=='boolean')throw new Error('未知世界能力');
    const encounterAvailable=capabilities.encounterAvailable===true;
    if(capabilities.activityAvailable!==undefined && typeof capabilities.activityAvailable!=='boolean')throw new Error('未知世界活动能力');
    if(encounterAvailable && (capabilities.commandDtoVersion!==3 || capabilities.playerAvailable!==true))throw new Error('未知遭遇能力');
    const {dto,player,encounter}=await readPair(capabilities.playerAvailable,encounterAvailable);
    const activity=await readActivity(capabilities,dto);
    if(capabilities.playerActionsAvailable===true && !player?.actions)throw new Error('动作读数缺失');
    if(encounterAvailable && (!encounter || encounter.encounterViewVersion!==1))throw new Error('遭遇读数缺失');
    if(last && dto.revision<last.revision)throw Object.assign(new Error('忽略迟到读数'),{code:'READING_CONFLICT'});
    render(dto,capabilities.sceneAvailable===true,player?.self?.identity?.location);renderPlayer(player,capabilities.sceneAvailable===true);renderActions(player);renderActivity(activity,dto);byId('activity-stale').hidden=true;byId('activity-panel').dataset.stale='false';last=dto;lastPlayer=player;lastEncounter=encounter;lastCapabilities=capabilities;lastActivity=activity;
    actionsAvailable=capabilities.playerActionsAvailable===true;writable=capabilities.writes===true;readingsFresh=true;
    byId('time-controls').hidden=!writable;byId('mind-link').hidden=capabilities.mindAvailable!==true;
    if(capabilities.sceneAvailable===true){const villageLink=byId('village-scene-link');if(villageLink)villageLink.hidden=false;}
    const sceneLink=byId('forest-scene-link'),canViewForest=capabilities.sceneAvailable===true ||
      (player?.self?.identity?.location==='forest' && encounterAvailable);
    sceneLink.hidden=!canViewForest;if(canViewForest)sceneLink.textContent=capabilities.sceneAvailable===true?'查看森林场景':'进入森林场景';
    byId('map-note').textContent=writable?'世界时间仅在明确提交后推进':'只读观察 · 世界时间不会自动流逝';
    status.dataset.state='ready';status.textContent='已读取服务保存的世界 · 刷新不会推进时间';
  }catch(error){if(lastActivityGroup){byId('activity-stale').hidden=false;byId('activity-panel').dataset.stale='true';}status.dataset.state='error';status.textContent=error.code==='READING_CONFLICT'?
    (last?'世界投影暂不一致，保留上次一致读数。请刷新重试。':'世界投影暂不一致，暂未显示。请刷新重试。'):
    (last?'连接中断，显示上次读数。请重试。':'暂时无法连接世界。请重试。');}
  finally{refreshing=false;button.disabled=false;controls();}
}
function validWorldActionResult(result,dto,receipt){
  const fields=['actorId','type','startTick','endTick','product','quantity','unitPrice','amount','before','after'];
  const validState=row=>row && Object.keys(row).length===6 && ['location','fatigue','wallet','inventory','publicStock','communalGold'].every(key=>Object.hasOwn(row,key)) &&
    ['village','forest'].includes(row.location) && [row.fatigue,row.wallet,row.communalGold].every(n=>Number.isSafeInteger(n)&&n>=0) &&
    [row.inventory,row.publicStock].every(stock=>stock && Object.keys(stock).length===2 && [stock.food,stock.herbs].every(n=>Number.isSafeInteger(n)&&n>=0));
  if(!result || typeof result!=='object' || Array.isArray(result) || Object.keys(result).length!==fields.length || !fields.every(key=>Object.hasOwn(result,key)) ||
    result.actorId!=='actor-4' || result.type!==dto.type || result.startTick!==receipt.fromTick || result.endTick!==receipt.tick ||
    ![null,'food','herbs'].includes(result.product) || ![result.quantity,result.unitPrice,result.amount].every(n=>Number.isSafeInteger(n)&&n>=0))return false;
  if(['PlayerBuy','PlayerSell'].includes(dto.type)){
    if(result.product!==dto.payload.product || result.quantity!==dto.payload.quantity || result.unitPrice<1 ||
      !Number.isSafeInteger(result.quantity*result.unitPrice) || result.amount!==result.quantity*result.unitPrice)return false;
  }else if(result.product!==null || result.quantity!==0 || result.unitPrice!==0 || result.amount!==0)return false;
  if(dto.type==='PlayerTravel' && result.after?.location!==dto.payload.destination)return false;
  return validState(result.before)&&validState(result.after);
}
function validReceipt(receipt,dto){
  if(!receipt || typeof receipt!=='object' || Array.isArray(receipt))return false;
  if(dto.version===3){
    const fields=['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','fromTick','tick','durationTicks','type','outcome','result'];
    if(Object.keys(receipt).length!==fields.length || !fields.every(key=>Object.hasOwn(receipt,key)) || receipt.apiVersion!==1 || receipt.receiptVersion!==3 ||
      receipt.commandId!==dto.commandId || receipt.status!=='committed' || receipt.fromRevision!==dto.expectedRevision || receipt.type!==dto.type ||
      !Number.isSafeInteger(receipt.fromRevision) || !Number.isSafeInteger(receipt.toRevision) || !Number.isSafeInteger(receipt.fromTick) ||
      !Number.isSafeInteger(receipt.tick) || !Number.isSafeInteger(receipt.durationTicks) || receipt.durationTicks<0 || receipt.fromTick>receipt.fromRevision ||
      receipt.tick!==receipt.fromTick+receipt.durationTicks || receipt.toRevision!==receipt.fromRevision+(receipt.durationTicks===0?1:receipt.durationTicks) ||
      !['succeeded','rejected'].includes(receipt.outcome))return false;
    const actions=lastPlayer?.actions;
    const duration=dto.type==='AdvanceTime'?dto.payload.ticks:actions?.[dto.type==='PlayerTravel'?'travelTicks':dto.type==='PlayerRest'?'restTicks':'tradeTicks'];
    if(!Number.isSafeInteger(duration)||duration<1)return false;
    if(receipt.outcome==='rejected'){
      const result=receipt.result;
      if(!result || typeof result!=='object' || Array.isArray(result) || Object.keys(result).length!==1 || !['ENCOUNTER_BUSY','RULE_REJECTED','PLAYER_DEAD'].includes(result.code))return false;
      return result.code==='ENCOUNTER_BUSY'?receipt.durationTicks===0:receipt.durationTicks===0||receipt.durationTicks===duration;
    }
    if(dto.type==='AdvanceTime')return receipt.result===null && receipt.durationTicks===duration;
    return receipt.durationTicks===duration && validWorldActionResult(receipt.result,dto,receipt);
  }
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
}async function submitIntent(dto){
  if(submitting || !writable || !last)return;
  if(!pending)pending=dto;if(!pending)return;
  submitting=true;controls();commandStatus.dataset.state='loading';commandStatus.textContent='正在提交世界请求…';
  try{
    const response=await fetch('/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});
    if(response.status===409){pending=null;commandStatus.dataset.state='error';commandStatus.textContent='世界已变化或请求冲突，已重新读取。请确认读数后再次操作。';await refresh();return;}
    if(!response.ok){if([400,405,413,415,422].includes(response.status))pending=null;
      commandStatus.dataset.state='error';commandStatus.textContent=pending?'请求未能完成，可重试同一请求。':'请求被拒绝，请检查输入或重新读取世界。';return;}
    const receipt=await response.json();
    if(!validReceipt(receipt,pending))throw new Error('Invalid receipt');
    const rejected=receipt.outcome==='rejected',action=pending.version===2||pending.version===3;
    const rejectionCode=receipt.result?.code;
    if(rejected && rejectionCode)commandStatus.textContent='动作被世界拒绝（'+rejectionCode+'），正在读取新的世界读数。';
    pending=null;commandStatus.dataset.state=rejected?'error':'ready';await refresh();
    commandStatus.textContent=rejected && rejectionCode?'动作被世界拒绝（'+rejectionCode+'），正在读取新的世界读数。':rejected?'时间已推进，动作未完成。正在读取新的世界读数。':
      action?'动作已完成，正在读取新的世界读数。':'时间已提交，正在读取新的世界读数。';
  }catch{commandStatus.dataset.state='error';commandStatus.textContent='连接中断，结果尚未确认。重试同一请求不会重复执行。';}
  finally{submitting=false;controls();}
}
function submitTime(){const version=lastCapabilities?.commandDtoVersion===3?3:1;return submitIntent(pending??{version,commandId:crypto.randomUUID(),expectedRevision:last?.revision,type:'AdvanceTime',payload:{ticks:Number(ticks.value)}});}
function submitAction(type,payload){if(pending || !actionsAvailable || !lastPlayer)return;
  const version=lastCapabilities?.commandDtoVersion===3?3:2;return submitIntent({version,commandId:crypto.randomUUID(),expectedRevision:last.revision,type,payload});}
byId('travel-form').addEventListener('submit',event=>{event.preventDefault();submitAction('PlayerTravel',{destination:byId('travel-destination').value});});
byId('rest-submit').addEventListener('click',()=>submitAction('PlayerRest',{}));
byId('trade-form').addEventListener('submit',event=>{event.preventDefault();submitAction(event.submitter?.id==='sell-submit'?'PlayerSell':'PlayerBuy',
  {product:byId('trade-product').value,quantity:Number(byId('trade-quantity').value)});});
button.addEventListener('click',refresh);advance.addEventListener('click',submitTime);refresh();
