import { mountCampaignBattle } from './runtime-campaign-battle.mjs';
import { validateCampaignReceipt } from './runtime-campaign-contract.mjs';

const byId = id => document.getElementById(id);
const node = Object.fromEntries(['campaign-map-window','campaign-world-status','campaign-revision','campaign-tick','campaign-location','campaign-order-state',
  'campaign-order-text','campaign-contact-line','campaign-command-status','campaign-retry','campaign-pause','campaign-resume',
  'campaign-refresh','campaign-x','campaign-y','campaign-coordinate-form','campaign-map','map-land','map-routes','map-water',
  'map-settlement','map-markers','map-persons','map-labels','campaign-person-card','campaign-actions','campaign-follow',
  'campaign-zoom-in','campaign-zoom-out','campaign-battle-wrap','campaign-back-to-map'].map(id => [id,byId(id)]));

const PENDING_PREFIX='narraverse.campaign.pending.v1:';
const CX=60,CY=60,WIDTH=20,HEIGHT=12;
let current=null, fresh=false, pending=null, submitting=false, storageBlocked=false, highestRevision=-1;
let marchTimer=0,marchEpoch=0,controlEpoch=0,mapAnimations=[];
let runRequested=false, queuedControl=null, selectedActorId=null, followPlayer=true, zoom=1, battle=null, battleWriteAuthorization=false;
const svgNS='http://www.w3.org/2000/svg';
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const cellKey=({x,y})=>`${x},${y}`;
const posText=({x,y})=>`(${x}, ${y})`;
const occupationText=value=>({chief:'村长',hunter:'猎人',merchant:'商人'})[value]??value;
const locationText=value=>({village:'村庄',forest:'森林',road:'道路'})[value]??value;
const conditionText=value=>({healthy:'健康',wounded:'受伤',dead:'已逝'})[value]??value;
function canonical(dto){return JSON.stringify({commandId:dto.commandId,expectedRevision:dto.expectedRevision,payload:dto.payload,type:dto.type,version:dto.version});}
function validDto(dto){
  if(!exact(dto,['version','commandId','expectedRevision','type','payload'])||dto.version!==5||typeof dto.commandId!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(dto.commandId)||!safeInt(dto.expectedRevision)||!dto.payload||typeof dto.payload!=='object'||Array.isArray(dto.payload))return false;
  const p=dto.payload;
  if(dto.type==='MarchSet')return exact(p,['x','y'])&&validCoord(p);
  if(['MarchPause','MarchResume','MarchStep','PlayerRest','PlayerWork','EncounterBegin'].includes(dto.type))return exact(p,[]);
  if(dto.type==='PlayerGiftFood')return exact(p,['recipientId'])&&p.recipientId==='actor-2';
  if(dto.type==='PlayerBuy'||dto.type==='PlayerSell')return exact(p,['product','quantity'])&&['food','herbs'].includes(p.product)&&Number.isInteger(p.quantity)&&p.quantity>=1&&p.quantity<=10;
  if(dto.type==='EncounterAction')return exact(p,['encounterId','action'])&&typeof p.encounterId==='string'&&p.encounterId.length>0&&['attack','flee'].includes(p.action);
  if(dto.type==='EncounterCancel')return exact(p,['encounterId'])&&typeof p.encounterId==='string'&&p.encounterId.length>0;
  return false;
}
function setStatus(message,error=false){node['campaign-command-status'].textContent=message;node['campaign-command-status'].dataset.state=error?'error':'ready';}
function svg(tag,attrs={},label){const el=document.createElementNS(svgNS,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(label)el.setAttribute('aria-label',label);return el;}
function textEl(parent,tag,attrs,value){const el=svg(tag,attrs);el.textContent=value;parent.append(el);return el;}
function point({x,y}){return{x:(x+.5)*CX,y:(y+.5)*CY};}
function validCoord(p){return p&&Number.isInteger(p.x)&&p.x>=0&&p.x<WIDTH&&Number.isInteger(p.y)&&p.y>=0&&p.y<HEIGHT;}
function regionAt({x,y}){return x>=3&&x<=5&&y>=6&&y<=8?'village':x>=14&&x<=19&&y>=2&&y<=11?'forest':'road';}
function validMap(map){
  const fields=['apiVersion','mapViewVersion','simulationId','revision','tick','mapId','width','height','blocked','landmarks','self','order','contact','actors','movement','budget'];
  if(!exact(map,fields)||map.apiVersion!==1||map.mapViewVersion!==1||map.mapId!=='village-forest-v1'||map.width!==WIDTH||map.height!==HEIGHT||
    !Array.isArray(map.blocked)||!Array.isArray(map.landmarks)||!exact(map.self,['actorId','x','y','location','alive'])||!validCoord(map.self)||
    map.self.actorId!=='actor-4'||!['village','forest','road'].includes(map.self.location)||map.self.location!==regionAt(map.self)||typeof map.self.alive!=='boolean'||!exact(map.movement,['maxSteps','ticksPerStep','batchTicks'])||
    map.movement.maxSteps!==48||map.movement.ticksPerStep!==1||map.movement.batchTicks!==2||!exact(map.budget,['remainingCommands'])||!safeInt(map.budget.remainingCommands))return false;
  if(!map.blocked.every(cell=>validCoord(cell)&&exact(cell,['x','y'])))return false;
  if(!map.landmarks.every(item=>item&&typeof item==='object'&&!Array.isArray(item)&&
    (exact(item,['id','name','x','y'])||exact(item,['id','name','x','y','location']))&&typeof item.id==='string'&&typeof item.name==='string'&&validCoord(item)&&
    (!Object.hasOwn(item,'location')||item.location===regionAt(item))))return false;
  if(map.order!==null&&!(exact(map.order,['target','path','index','status'])&&validCoord(map.order.target)&&Array.isArray(map.order.path)&&map.order.path.length>0&&
    map.order.path.every(validCoord)&&safeInt(map.order.index)&&map.order.index<map.order.path.length&&['marching','paused','arrived'].includes(map.order.status)&&
    map.order.path.length<=49&&cellKey(map.order.path[map.order.index])===cellKey(map.self)&&cellKey(map.order.path.at(-1))===cellKey(map.order.target)&&
    (map.order.status==='arrived'?map.order.index===map.order.path.length-1:map.order.index<map.order.path.length-1)&&
    map.order.path.every((p,i,path)=>i===0||(Math.abs(p.x-path[i-1].x)+Math.abs(p.y-path[i-1].y)===1&&!(p.x===10&&p.y!==7)&&!(path[i-1].x===10&&path[i-1].y!==7)))))return false;
  if(map.contact!==null&&!(exact(map.contact,['actorId','tick'])&&typeof map.contact.actorId==='string'&&safeInt(map.contact.tick)&&map.contact.tick<=map.tick))return false;
  return Array.isArray(map.actors)&&map.actors.every(actor=>exact(actor,['actorId','name','occupation','location','alive','condition','x','y','canInteract','receivedGifts'])&&
    typeof actor.actorId==='string'&&actor.actorId!=='actor-4'&&typeof actor.name==='string'&&typeof actor.occupation==='string'&&['village','forest','road'].includes(actor.location)&&actor.location===regionAt(actor)&&
    typeof actor.alive==='boolean'&&['healthy','wounded','dead'].includes(actor.condition)&&validCoord(actor)&&typeof actor.canInteract==='boolean'&&Array.isArray(actor.receivedGifts)&&
    Math.max(Math.abs(actor.x-map.self.x),Math.abs(actor.y-map.self.y))<=4&&actor.receivedGifts.every(memory=>memory&&typeof memory==='object'&&memory.channel==='self'&&
      memory.occurrenceTick===memory.observedTick&&safeInt(memory.occurrenceTick)&&memory.occurrenceTick<=map.tick&&memory.observable?.type==='food-gift'&&
      memory.observable.donorId==='actor-4'&&memory.observable.recipientId===actor.actorId&&memory.observable.product==='food'&&memory.observable.quantity===1&&memory.observable.direction==='received'));
}
function coherent(group){
  const {capabilities:cap,snapshot,map,player,encounter,scene}=group;
  if(!(cap?.apiVersion===1&&cap.commandDtoVersion===5&&cap.playerAvailable===true&&cap.encounterAvailable===true&&cap.sceneAvailable===true&&cap.mapAvailable===true&&
    typeof cap.writes==='boolean'&&snapshot?.apiVersion===1&&validMap(map)&&player?.apiVersion===1&&encounter?.apiVersion===1&&encounter.encounterViewVersion===1&&
    scene?.apiVersion===1&&scene.sceneViewVersion===1&&typeof snapshot.simulationId==='string'&&snapshot.simulationId.length>0&&safeInt(snapshot.revision)&&safeInt(snapshot.tick)))return false;
  const id=snapshot.simulationId,revision=snapshot.revision,tick=snapshot.tick;
  if(![map,player,encounter,scene].every(v=>v.simulationId===id&&v.revision===revision&&v.tick===tick)||map.self.actorId!=='actor-4'||
    map.self.alive!==scene.self?.alive||map.self.location!==scene.location||player.self?.identity?.actorId!=='actor-4'||
    player.self.identity.alive!==map.self.alive||player.self.identity.location!==map.self.location||encounter.self?.alive!==map.self.alive||encounter.self.location!==map.self.location||
    (encounter.encounter!==null&&typeof encounter.encounter!=='object')||!exact(scene.self,['actorId','alive','food'])||scene.self.actorId!=='actor-4'||
    scene.self.alive!==map.self.alive||!safeInt(scene.self.food)||!Array.isArray(scene.actors))return false;
  const byId=new Map(scene.actors.map(a=>[a.actorId,a]));
  return map.actors.every(actor=>{
    const person=byId.get(actor.actorId);
    return !person||(person.name===actor.name&&person.occupation===actor.occupation&&person.location===actor.location&&person.alive===actor.alive&&person.condition===actor.condition&&
      Array.isArray(person.receivedGifts)&&JSON.stringify(person.receivedGifts)===JSON.stringify(actor.receivedGifts));
  });
}
async function readJson(path){const response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(6000)});const text=await response.text();let json=null;try{json=JSON.parse(text)}catch{}if(!response.ok||!json)throw new Error(`HTTP ${response.status}`);return json;}
async function readGroup(){const capabilities=await readJson('/api/runtime/capabilities');if(capabilities?.commandDtoVersion!==5)return{capabilities};
  const [snapshot,map,player,encounter,scene]=await Promise.all([
  '/api/runtime/snapshot','/api/runtime/map','/api/runtime/player','/api/runtime/encounter','/api/runtime/scene'].map(readJson));
  return{capabilities,snapshot,map,player,encounter,scene};}
function storedPending(simulationId){
  try{const raw=sessionStorage.getItem(PENDING_PREFIX+simulationId);if(raw===null)return null;const item=JSON.parse(raw);
    if(!exact(item,['simulationId','dto','body','fromTick'])||item.simulationId!==simulationId||item.body!==canonical(item.dto)||!safeInt(item.fromTick)||
      !validDto(item.dto)||item.fromTick>item.dto.expectedRevision){storageBlocked=true;return null;}return item;
  }catch{storageBlocked=true;return null;}
}
function persistPending(item){try{const key=PENDING_PREFIX+item.simulationId,raw=JSON.stringify(item);sessionStorage.setItem(key,raw);if(sessionStorage.getItem(key)!==raw)throw Error();return true;}catch{storageBlocked=true;return false;}}
function clearPending(item){try{sessionStorage.removeItem(PENDING_PREFIX+item.simulationId);pending=null;return true;}catch{storageBlocked=true;return false;}}
function orderName(order){return !order?'尚无行军订单':order.status==='arrived'?`已抵达 ${posText(order.target)}`:order.status==='paused'?`行军暂停 · 目的地 ${posText(order.target)}`:`行军中 · 目的地 ${posText(order.target)}`;}

function paintBase(){
  const land=node['map-land'],routes=node['map-routes'],water=node['map-water'],settlement=node['map-settlement'],labels=node['map-labels'];
  land.replaceChildren();routes.replaceChildren();water.replaceChildren();settlement.replaceChildren();labels.replaceChildren();
  land.append(svg('path',{d:'M42 220Q110 123 185 175T342 142Q423 94 487 173T620 152Q693 80 774 146T949 147Q1040 110 1158 201L1158 571Q1058 628 949 567T780 594Q673 654 571 593T390 621Q282 580 193 622T42 559Z',class:'terrain-hill'}));
  [[140,115,50],[355,230,43],[504,105,61],[740,225,52],[1060,270,55],[180,535,49],[445,485,62],[780,500,52],[1050,542,58]].forEach(([x,y,r])=>{
    const g=svg('g');g.append(svg('path',{d:`M${x-r} ${y+r*.42} ${x-r*.35} ${y-r*.55} ${x-r*.02} ${y+r*.05} ${x+r*.34} ${y-r*.85} ${x+r} ${y+r*.42}Z`,class:'mountain'}));land.append(g);
  });
  // Quiet, hand-drawn forest masses keep the parchment and terrain visible.
  for(let i=0;i<34;i++){const x=790+(i%7)*43+(i%2)*7,y=130+Math.floor(i/7)*50+(i%3)*5,r=18+(i%4)*2;land.append(svg('path',{d:`M${x-r} ${y+r*.65}q${r*.05}-${r*1.35} ${r} -${r*1.15}q${r*.95} ${r*.2} ${r} ${r*1.15}Z`,class:'forest-canopy',opacity:.68+(i%3)*.08}));}
  // Familiar roads radiate from the settlement and join the old bridge.
  [[270,450,390,450],[390,450,570,450],[570,450,630,450],[630,450,810,450],[810,450,990,450],
    [270,450,270,570],[270,570,510,570],[510,570,630,570],[630,570,750,570],[750,570,990,570],
    [270,450,270,330],[270,330,450,330],[450,330,630,330],[630,330,810,330],[810,330,990,330],
    [630,330,630,450],[630,450,630,570]].forEach(([x1,y1,x2,y2])=>routes.append(svg('path',{d:`M${x1} ${y1}L${x2} ${y2}`,class:'road-line'})));
  water.append(svg('path',{d:'M630 80Q623 190 630 300T630 640',class:'river-edge'}));water.append(svg('path',{d:'M630 80Q623 190 630 300T630 640',class:'river-line'}));
  water.append(svg('path',{d:'M598 450H662',class:'bridge-line'}));water.append(svg('path',{d:'M598 442H662M598 458H662',class:'bridge-rail'}));
  // Village hall, forest gate and names are fixed landmarks; map markers remain server-owned.
  settlement.append(svg('path',{d:'M233 447l37-31 37 31v42h-74z',fill:'#bd9861',class:'landmark-icon'}));settlement.append(svg('path',{d:'M246 449h15v16h-15zM268 449h15v16h-15zM262 467h16v22h-16z',fill:'#6c563b'}));
  settlement.append(svg('path',{d:'M949 446l18-24 18 24v34h-36z',fill:'#8b654a',class:'landmark-icon'}));settlement.append(svg('path',{d:'M960 454h14v26h-14z',fill:'#413b2c'}));
  textEl(labels,'text',{x:270,y:523,'text-anchor':'middle',class:'map-name'},'柳溪村');textEl(labels,'text',{x:988,y:520,'text-anchor':'middle',class:'map-name'},'灰狼森林');
  textEl(labels,'text',{x:630,y:405,'text-anchor':'middle',class:'map-note'},'古桥');textEl(labels,'text',{x:412,y:276,'text-anchor':'middle',class:'map-note'},'北境商道');
  textEl(labels,'text',{x:1025,y:184,'text-anchor':'middle',class:'map-note'},'针叶林');
}
paintBase();
function applyCamera(){const w=1200/zoom,h=720/zoom,focus=followPlayer&&current?point(current.map.self):{x:600,y:360};const x=Math.max(0,Math.min(1200-w,focus.x-w/2)),y=Math.max(0,Math.min(720-h,focus.y-h/2));node['campaign-map'].setAttribute('viewBox',`${x} ${y} ${w} ${h}`);}
function animateMarker(el,oldPos,newPos){el.dataset.x=String(newPos.x);el.dataset.y=String(newPos.y);if(!oldPos||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const dx=oldPos.x-newPos.x,dy=oldPos.y-newPos.y;if(dx||dy)mapAnimations.push(el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:450,easing:'ease-out'}));}
function renderOverlay(){
  const previous=new Map([...node['map-markers'].querySelectorAll('.player-marker'),...node['map-persons'].querySelectorAll('.actor-token')].map(el=>[el.dataset.actorId??'actor-4',{x:Number(el.dataset.x),y:Number(el.dataset.y)}]));
  for(const animation of mapAnimations)animation.cancel();mapAnimations=[];
  for(const id of ['map-markers','map-persons'])node[id].replaceChildren();
  const map=current?.map;if(!map)return;
  if(map.order?.path?.length){const points=map.order.path.slice(map.order.index).map(point).map(p=>`${p.x},${p.y}`).join(' ');if(points)node['map-markers'].append(svg('polyline',{points,class:'path-dash'}));
    const target=point(map.order.target);node['map-markers'].append(svg('circle',{cx:target.x,cy:target.y,r:22,class:'target-ring'}));}
  const here=point(map.self);node['map-markers'].append(svg('circle',{cx:here.x,cy:here.y,r:21,class:'current-glow'}));
  const marker=svg('g',{class:'player-marker','aria-label':'我现在的位置'});marker.append(svg('path',{d:`M${here.x} ${here.y-24}L${here.x+20} ${here.y-13}L${here.x+8} ${here.y+2}L${here.x} ${here.y-2}L${here.x-8} ${here.y+2}L${here.x-20} ${here.y-13}Z`,fill:'#a34832',stroke:'#493a29','stroke-width':2}));
  marker.append(svg('circle',{cx:here.x,cy:here.y-11,r:5,fill:'#f2e2bb'}));node['map-markers'].append(marker);animateMarker(marker,previous.get('actor-4'),here);
  for(const actor of map.actors){if(!actor.alive)continue;const p=point(actor);const g=svg('g',{class:'actor-token',tabindex:0,role:'button','data-actor-id':actor.actorId,'aria-label':`${actor.name}，${occupationText(actor.occupation)}，${conditionText(actor.condition)}，位置 ${posText(actor)}`});
    g.append(svg('circle',{cx:p.x,cy:p.y,r:16,fill:'#e4d5ad',stroke:'#6a503a','stroke-width':2}));g.append(svg('circle',{cx:p.x,cy:p.y,r:8,fill:actor.condition==='wounded'?'#a65c45':'#55704d'}));g.append(svg('path',{d:`M${p.x} ${p.y-20}v-32h25l-8 9 8 9h-25`,fill:'#a34d37',stroke:'#5d432f','stroke-width':1.5}));
    textEl(g,'text',{x:p.x+13,y:p.y+31,'text-anchor':'middle',class:'map-note'},actor.name);g.addEventListener('click',e=>{e.stopPropagation();showPerson(actor.actorId)});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showPerson(actor.actorId)}});node['map-persons'].append(g);animateMarker(g,previous.get(actor.actorId),p);}
  applyCamera();
  for(const landmark of map.landmarks){const p=point(landmark);const c=svg('circle',{cx:p.x,cy:p.y,r:20,fill:'transparent',class:'landmark','data-x':landmark.x,'data-y':landmark.y,tabindex:0,role:'button','aria-label':`目的地 ${landmark.name} ${posText(landmark)}`});c.addEventListener('click',e=>{e.stopPropagation();chooseDestination(landmark.x,landmark.y)});c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseDestination(landmark.x,landmark.y)}});node['map-markers'].append(c);}
}
function pathBetween(start,target){
  const blocked=new Set(current.map.blocked.map(cellKey)),queue=[start],previous=new Map([[cellKey(start),null]]),dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  while(queue.length&&previous.size<=240){const p=queue.shift();if(p.x===target.x&&p.y===target.y)break;for(const [dx,dy] of dirs){const n={x:p.x+dx,y:p.y+dy},key=cellKey(n);if(!validCoord(n)||blocked.has(key)||previous.has(key))continue;if(n.x===10&&n.y!==7)continue;previous.set(key,cellKey(p));queue.push(n);}}
  let key=cellKey(target);if(!previous.has(key))return null;const byKey=new Map();for(const [k,v]of previous){const[a,b]=k.split(',').map(Number);byKey.set(k,{x:a,y:b});}const path=[];while(key!==null){path.push(byKey.get(key));key=previous.get(key);}return path.reverse();
}
function chooseDestination(x,y){if(!current||(!fresh&&!pending)||!validCoord({x,y}))return;
  if(!pending&&current.map.budget.remainingCommands<3){setStatus('开始或改道至少需要三笔存档额度；只保留暂停写入。',true);if(current.map.order?.status==='marching'&&current.map.budget.remainingCommands>=1)queueControl('MarchPause',{},false);return;}
  node['campaign-x'].value=String(x);node['campaign-y'].value=String(y);const target={x,y};const route=pathBetween(current.map.self,target);if(!route){setStatus('这处地点当前不可达，请沿商道选择目的地。',true);return;}if(route.length-1>48){setStatus('行军路线超过本次地图的步数上限。',true);return;}if(x===current.map.self.x&&y===current.map.self.y){setStatus('队伍已在这个地点。');return;}
  runRequested=true;queueControl('MarchSet',{x,y},true);}
function stopScheduledMarch(){marchEpoch++;if(marchTimer)clearTimeout(marchTimer);marchTimer=0;}
function scheduleMarch(){stopScheduledMarch();const token=marchEpoch;marchTimer=setTimeout(()=>{marchTimer=0;if(token===marchEpoch)void continueMarch();},550);}
function queueControl(type,payload,continueAfter){controlEpoch++;stopScheduledMarch();runRequested=continueAfter;if(pending||submitting){queuedControl={type,payload,continueAfter};setStatus(type==='MarchPause'?'已请求暂停；正在等待当前行军批次确认。':'正在等待当前请求确认，随后从实际位置更新路线。');renderControls();return;}void issue(type,payload,continueAfter);}
function dtoFor(type,payload){if(!current||!fresh||!coherent(current)||current.capabilities.writes!==true||current.capabilities.commandDtoVersion!==5)return null;
  return{version:5,commandId:crypto.randomUUID(),expectedRevision:current.snapshot.revision,type,payload};}
function commandEnabled(type){if(!current||!fresh||current.capabilities.writes!==true||current.capabilities.commandDtoVersion!==5||pending||submitting||storageBlocked||
  (battle?.busy&&!(battleWriteAuthorization&&['EncounterBegin','EncounterAction','EncounterCancel'].includes(type))))return false;
  const map=current.map,active=current.encounter.encounter?.status==='active';
  if(active&&!['EncounterAction','EncounterCancel'].includes(type))return false;
  if(!active&&['EncounterAction','EncounterCancel'].includes(type))return false;
  if(type==='EncounterBegin')return map.self.alive&&map.self.location==='forest'&&current.encounter.actions?.canBegin===true&&current.encounter.population?.availableWolves>0&&map.budget.remainingCommands>0;
  if(['EncounterAction','EncounterCancel'].includes(type))return map.self.alive&&map.self.location==='forest'&&map.budget.remainingCommands>0;
  if(active)return false;
  if(type==='MarchSet'||type==='MarchResume')return map.budget.remainingCommands>=3&&map.self.alive;
  if(type==='MarchPause')return map.budget.remainingCommands>=1&&(map.order?.status==='marching'||map.contact!==null);
  return true;}
function buildPending(type,payload){const dto=dtoFor(type,payload);if(!dto)return null;const value={simulationId:current.snapshot.simulationId,dto,body:canonical(dto),fromTick:current.snapshot.tick};return persistPending(value)?value:null;}
async function command(type,payload){battleWriteAuthorization=true;const operation=issue(type,payload,false);battleWriteAuthorization=false;const result=await operation;if(!result)throw new Error('Campaign command was not confirmed.');return result;}
async function issue(type,payload,continueAfter=false){
  if(!current)return null;
  if(!commandEnabled(type)){
    if(type==='MarchSet'||type==='MarchResume'){runRequested=false;setStatus('存档预算或当前状态不允许开始/改道；行军已停止续发。',true);
      if(current.map.order?.status==='marching'&&current.map.budget.remainingCommands>=1)queueMicrotask(()=>queueControl('MarchPause',{},false));}
    return null;
  }
  const saved=buildPending(type,payload);if(!saved){setStatus('浏览器无法保存固定请求；本次操作没有发送。',true);renderControls();return null;}
  pending=saved;return await sendPending(continueAfter);
}
async function sendPending(continueAfter=false){
  if(!pending||submitting||!current||current.capabilities.writes!==true||pending.simulationId!==current.snapshot.simulationId)return null;
  const saved=pending,dto=saved.dto,type=dto.type,requestEpoch=controlEpoch;let receiptConfirmed=false;submitting=true;fresh=false;runRequested=continueAfter;renderControls();setStatus('正在等待服务确认这笔固定请求…');
  try{
    const response=await fetch('/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:saved.body,cache:'no-store',signal:AbortSignal.timeout(120000)});
    const raw=await response.text();let receipt=null;try{receipt=JSON.parse(raw)}catch{}
    if(!response.ok){runRequested=false;setStatus(`请求未获得可确认回执（HTTP ${response.status}）；保留原 DTO 和请求体，点击“重试同一请求”核对。`,true);return null;}
    let valid=false;try{valid=validateCampaignReceipt(receipt,dto,saved.fromTick)===true}catch{}
    if(!valid){runRequested=false;setStatus('服务回执未通过共享验证；保留原 DTO 和请求体，行军已停止。',true);return null;}
    const hadPending=saved;receiptConfirmed=true;clearPending(hadPending);if(storageBlocked){runRequested=false;setStatus('回执已验证，但浏览器无法清除待确认记录，操作已暂停。',true);return null;}
    await refresh(type==='EncounterAction',false);
    if(!fresh||current.snapshot.simulationId!==saved.simulationId||current.snapshot.revision!==receipt.toRevision||current.snapshot.tick!==receipt.tick){runRequested=false;setStatus('回执已通过验证，但新读数未与回执对齐；行军已暂停。',true);return null;}
    const result={receipt,command:dto,group:current};
    setStatus(`${type} 已确认 · 修订 ${receipt.fromRevision} → ${receipt.toRevision} · tick ${receipt.fromTick} → ${receipt.tick}`);
    if(receipt.outcome==='rejected'){runRequested=false;}
    else runRequested=continueAfter&&requestEpoch===controlEpoch&&!document.hidden;
    if(queuedControl&&!document.hidden){const queued=queuedControl;queuedControl=null;runRequested=queued.continueAfter;queueMicrotask(()=>void issue(queued.type,queued.payload,queued.continueAfter));}
    else if(runRequested&&receipt.outcome==='succeeded'&&type!=='MarchPause')scheduleMarch();
    else if(type==='MarchPause')runRequested=false;
    return result;
  }catch(error){
    console.error('Campaign confirmation failed',error);runRequested=false;setStatus(receiptConfirmed?'命令已确认，但页面读取或显示失败；停止行军，请重新读取世界。':'连接中断，提交结果未知；保留原请求，需明确重试同一 DTO。',true);return null;
  }finally{submitting=false;renderPerson();renderActions();renderControls();}
}
async function continueMarch(){
  if(!runRequested||!fresh||!current||!coherent(current)||pending||submitting||document.hidden)return;
  if(battle?.busy){runRequested=false;setStatus('战斗进行中，行军保持暂停。');return;}
  const {map,encounter}=current;if(map.contact||encounter.encounter?.status==='active'||map.order?.status!=='marching'){runRequested=false;return;}
  if(map.budget.remainingCommands<=1){runRequested=false;setStatus('存档只剩暂停保留位；已停止续发，正在落盘暂停。',true);queueControl('MarchPause',{},false);return;}
  if(map.order.path.length-map.order.index<=1){runRequested=false;return;}
  if(!commandEnabled('MarchStep'))return;
  await issue('MarchStep',{},true);
}
async function refresh(preserveBattlePlayback=false,stopMarch=true){
  if(stopMarch)controlEpoch++;stopScheduledMarch();
  if(!preserveBattlePlayback)battle?.cancel();
  runRequested=false;fresh=false;renderControls();node['campaign-world-status'].textContent='正在读取世界…';
  try{const group=await readGroup();if(group.capabilities?.commandDtoVersion!==5){current=null;fresh=false;node['campaign-world-status'].textContent='此存档版本不支持 campaign 地图命令';node['campaign-world-status'].dataset.state='error';setStatus('此页面仅支持 DTO 5 campaign 存档；没有发送任何命令。',true);renderControls();return;}
    if(!coherent(group)||group.snapshot.revision<highestRevision||(current&&group.snapshot.simulationId!==current.snapshot.simulationId))throw Error('Incoherent world group');
    highestRevision=group.snapshot.revision;current=group;
    if(!pending&&!storageBlocked)pending=storedPending(group.snapshot.simulationId);
    fresh=true;node['campaign-world-status'].textContent=group.capabilities.writes===true?'世界已连接':'世界只读';node['campaign-world-status'].dataset.state='ready';
    render();if(storageBlocked)setStatus('浏览器中存在无法安全验证的待确认记录，写入已锁定。',true);else if(pending)setStatus('发现未确认的原请求。行军不会自动继续，请先重试或联系维护者。',true);
    if(group.map.contact)runRequested=false;
  }catch{fresh=false;node['campaign-world-status'].textContent='世界读数不一致或无法读取';node['campaign-world-status'].dataset.state='error';setStatus('六项世界读数未能组成同一版本，已暂停所有写入。',true);renderControls();}
}

function render(){if(!current){renderControls();return;}const {snapshot,map,encounter}=current;
  if(map.contact&&!selectedActorId&&map.actors.some(actor=>actor.actorId===map.contact.actorId))selectedActorId=map.contact.actorId;
  node['campaign-revision'].textContent=String(snapshot.revision);node['campaign-tick'].textContent=String(snapshot.tick);node['campaign-location'].textContent=`${locationText(map.self.location)} ${posText(map.self)}`;
  node['campaign-order-state'].textContent=map.order?.status==='marching'?(runRequested?'队伍正在路上':'路线已保存 · 点击继续启程'):map.order?.status==='paused'?'行军暂停':map.order?.status==='arrived'?'抵达目的地':'旅程尚未开始';
  node['campaign-order-text'].textContent=orderName(map.order);node['campaign-contact-line'].textContent=map.contact?`路遇 ${map.actors.find(a=>a.actorId===map.contact.actorId)?.name??'人物'} · 等待查看`:'沿路也许会遇见熟悉的人。';
  const oldBattleBusy=battle?.busy??false;
  node['campaign-battle-wrap'].hidden=!(map.self.location==='forest'||encounter.encounter?.status==='active'||oldBattleBusy);
  renderOverlay();renderPerson();renderActions();
  try{if(battle&&coherent(current))battle.sync(current);}catch{setStatus('战斗画面暂时无法同步；地图读数仍以服务为准。',true);}
  renderControls();
}
function renderControls(){const cap=current?.capabilities,map=current?.map,active=current?.encounter?.encounter?.status==='active';
  const supported=cap?.commandDtoVersion===5;const writable=fresh&&supported&&cap?.writes===true&&!pending&&!submitting&&!storageBlocked&&!battle?.busy&&!active;
  const canAskPause=(fresh||pending!==null)&&supported&&cap?.writes===true&&!storageBlocked&&!battle?.busy&&!active&&map?.order?.status==='marching'&&pending?.dto.type!=='MarchPause';
  node['campaign-pause'].disabled=!canAskPause;
  node['campaign-resume'].disabled=!(writable&&['paused','marching'].includes(map?.order?.status)&&map?.budget.remainingCommands>=3&&map?.self.alive);
  node['campaign-retry'].hidden=!pending;node['campaign-retry'].disabled=!pending||submitting||storageBlocked||cap?.writes!==true||pending.simulationId!==current?.snapshot.simulationId;
  const form=node['campaign-coordinate-form'];const canChoose=(fresh||pending!==null)&&supported&&cap?.writes===true&&!storageBlocked&&!battle?.busy&&!active&&map?.budget.remainingCommands>=1;
  for(const el of form.elements)if(el.tagName==='BUTTON')el.disabled=!canChoose||(!pending&&map?.budget.remainingCommands<3);
  if(!supported&&cap) {node['campaign-world-status'].textContent='此存档版本不支持 campaign 地图命令';node['campaign-world-status'].dataset.state='error';}
  node['campaign-battle-wrap'].dataset.busy=String(Boolean(battle?.busy));
}
function showPerson(actorId){const actor=current?.map.actors.find(a=>a.actorId===actorId);if(!actor)return;selectedActorId=actorId;renderPerson();}
function appendText(parent,tag,className,text){const el=document.createElement(tag);if(className)el.className=className;el.textContent=text;parent.append(el);return el;}
function renderPerson(){const box=node['campaign-person-card'];box.replaceChildren();if(!current||!selectedActorId){box.hidden=true;return;}const actor=current.map.actors.find(a=>a.actorId===selectedActorId);if(!actor){selectedActorId=null;box.hidden=true;return;}
  box.hidden=false;const heading=document.createElement('div');heading.className='person-heading';const identity=document.createElement('div');appendText(identity,'h2','',actor.name);appendText(identity,'small','',`${occupationText(actor.occupation)} · ${conditionText(actor.condition)} · ${locationText(actor.location)} ${posText(actor)}`);heading.append(identity);const close=document.createElement('button');close.type='button';close.textContent='收起';close.addEventListener('click',()=>{const isContact=current?.map.contact?.actorId===actorId;selectedActorId=null;renderPerson();if(isContact)queueControl('MarchPause',{},false)});heading.append(close);box.append(heading);
  const memory=actor.receivedGifts;if(memory.length){for(const entry of memory){const fact=entry.observable;appendText(box,'p','person-memory',`${actor.name}记得你在第 ${entry.occurrenceTick} 刻送给他的粮食（${fact.quantity} 份）。`);}}else appendText(box,'p','person-meta',actor.canInteract?'他尚未留下收到你赠粮的记忆。':'靠近后可查看人物的互动记忆。');
  const actions=document.createElement('div');actions.className='person-actions';const giftActor=current.scene.actors.find(a=>a.actorId===actor.actorId);const d=Math.max(Math.abs(actor.x-current.map.self.x),Math.abs(actor.y-current.map.self.y));
  if(d<=1&&actor.canInteract&&giftActor?.gift?.available===true){const gift=document.createElement('button');gift.type='button';gift.textContent='送一份粮食';gift.disabled=!fresh||pending!==null||submitting||current.capabilities.writes!==true||!current.map.self.alive||current.scene.self.food<1||current.map.budget.remainingCommands<(current.map.order?.status==='marching'?2:1)||battle?.busy;
    gift.addEventListener('click',()=>{const recipient=actor.actorId;const pause=async()=>{if(current?.map.order?.status==='marching'){const r=await issue('MarchPause',{},false);if(!r)return;}if(!fresh)return;await issue('PlayerGiftFood',{recipientId:recipient},false)};void pause();});actions.append(gift);}
  if(actions.childElementCount)box.append(actions);
}
function actionButton(label,type,payload,available){const button=document.createElement('button');button.type='button';button.textContent=label;const remaining=current?.map.budget.remainingCommands??0;
  button.disabled=!fresh||!available||!current?.map.self.alive||pending!==null||submitting||current?.capabilities.writes!==true||remaining<(current?.map.order?.status==='marching'?2:1)||battle?.busy||current?.encounter.encounter?.status==='active';
  button.addEventListener('click',()=>{const execute=()=>issue(type,payload,false);if(current?.map.order?.status==='marching'){void issue('MarchPause',{},false).then(result=>{if(result)void execute()});}else void execute();});node['campaign-actions'].append(button);}
function renderActions(){const actions=node['campaign-actions'];actions.replaceChildren();if(!current||current.map.self.location!=='village')return;const player=current.player,features=player.actions??{};
  const rest=features.restTicks??features.rest?.durationTicks;actionButton(`在村中休整 · ${rest??6} tick`,'PlayerRest',{},Number.isSafeInteger(rest)&&rest>0&&current.map.self.alive);
  const work=features.work;if(current.capabilities.playerWorkAvailable===true&&work){actionButton(`村庄工作 · ${work.durationTicks??36} tick`,'PlayerWork',{},safeInt(work.nextWorkTick)&&current.snapshot.tick>=work.nextWorkTick&&current.map.self.location==='village');}
  const trade=features.prices??{};if(features.canTrade===true){for(const product of ['food','herbs']){const quote=trade[product];const market=current.snapshot.market??{};const wallet=player.self?.wallet??-1;const stock=market[product]??0;const held=player.self?.inventory?.[product]??0;
    if(quote&&safeInt(quote.buy))actionButton(`购买${product==='food'?'粮食':'草药'} · ${quote.buy}`,'PlayerBuy',{product,quantity:1},wallet>=quote.buy&&stock>=1);
    if(quote&&safeInt(quote.sell))actionButton(`出售${product==='food'?'粮食':'草药'} · ${quote.sell}`,'PlayerSell',{product,quantity:1},held>=1);}}
}

node['campaign-map'].addEventListener('click',event=>{if(event.target.closest?.('.actor-token'))return;const svgEl=node['campaign-map'],p=svgEl.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const local=p.matrixTransform(svgEl.getScreenCTM().inverse());const x=Math.max(0,Math.min(WIDTH-1,Math.floor(local.x/CX))),y=Math.max(0,Math.min(HEIGHT-1,Math.floor(local.y/CY)));chooseDestination(x,y);});
node['campaign-coordinate-form'].addEventListener('submit',event=>{event.preventDefault();const x=Number(node['campaign-x'].value),y=Number(node['campaign-y'].value);if(Number.isInteger(x)&&Number.isInteger(y))chooseDestination(x,y);});
node['campaign-pause'].addEventListener('click',()=>{runRequested=false;queuedControl=null;queueControl('MarchPause',{},false)});
node['campaign-resume'].addEventListener('click',()=>{if(!current||current.map.budget.remainingCommands<3)return;runRequested=true;queueControl('MarchResume',{},true)});
node['campaign-refresh'].addEventListener('click',()=>void refresh());node['campaign-retry'].addEventListener('click',()=>{runRequested=false;void sendPending(false)});
node['campaign-back-to-map'].addEventListener('click',()=>{battle?.cancel();node['campaign-battle-wrap'].hidden=true;});
node['campaign-follow'].addEventListener('click',()=>{followPlayer=!followPlayer;node['campaign-follow'].setAttribute('aria-pressed',String(followPlayer));applyCamera();});
node['campaign-zoom-in'].addEventListener('click',()=>{zoom=Math.min(2,zoom+.25);applyCamera()});node['campaign-zoom-out'].addEventListener('click',()=>{zoom=Math.max(1,zoom-.25);applyCamera()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){runRequested=false;controlEpoch++;stopScheduledMarch();}});window.addEventListener('pagehide',()=>{runRequested=false;controlEpoch++;stopScheduledMarch();});

battle=mountCampaignBattle({element:byId('campaign-battle'),onCommand:command,onStateChange:()=>{if(current)renderControls();}});
void refresh();
