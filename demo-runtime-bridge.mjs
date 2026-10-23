import {validSocialMapView} from './runtime-social-contract.mjs';
import {validNegotiationView} from './runtime-negotiation-contract.mjs';
// Same DTO5 projection contract used by the campaign consumer.
import {validateCampaignReceipt} from './runtime-campaign-contract.mjs';
import {describeActionReceipt} from './demo-runtime-interactions.mjs';
const WIDTH=20,HEIGHT=12,safeInt=n=>Number.isSafeInteger(n)&&n>=0;
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
// These existing API responses reject this POST before it can commit. A 5xx,
// timeout, rate limit or unknown response cannot establish the durable outcome.
const rejectionCodes=new Map([
 [400,['INVALID_INPUT','UNSUPPORTED_VERSION','COMMAND_UNSUPPORTED']],
 [403,['ORIGIN_REJECTED']],[404,['ROUTE_NOT_FOUND']],[405,['WRITE_DISABLED']],
 [409,['REVISION_CONFLICT','COMMAND_ID_CONFLICT']],[413,['LIMIT_EXCEEDED']],
 [415,['INVALID_INPUT']],[422,['RULE_REJECTED']],
]);
function definitiveRejection(response,body){
 const code=body?.error?.code,revisionConflict=code==='REVISION_CONFLICT';
 return rejectionCodes.get(response.status)?.includes(code)===true&&
  exact(body,revisionConflict?['apiVersion','error','currentRevision']:['apiVersion','error'])&&body.apiVersion===1&&
  exact(body.error,['code','message'])&&typeof body.error.message==='string'&&
  (!revisionConflict||safeInt(body.currentRevision));
}
const cellKey=({x,y})=>`${x},${y}`;
function validCoord(p){return p&&Number.isInteger(p.x)&&p.x>=0&&p.x<WIDTH&&Number.isInteger(p.y)&&p.y>=0&&p.y<HEIGHT;}
function regionAt({x,y}){return x>=3&&x<=5&&y>=6&&y<=8?'village':x>=14&&x<=19&&y>=2&&y<=11?'forest':'road';}
function validMap(map){
  const fields=['apiVersion','mapViewVersion','simulationId','revision','tick','mapId','width','height','blocked','landmarks','self','order','contact','actors','movement','budget',...([2,3].includes(map?.mapViewVersion)?['social']:[]),...(map?.mapViewVersion===3?['negotiation']:[])];
  if(!exact(map,fields)||map.apiVersion!==1||![1,2,3].includes(map.mapViewVersion)||map.mapId!=='village-forest-v1'||map.width!==WIDTH||map.height!==HEIGHT||
    !Array.isArray(map.blocked)||!Array.isArray(map.landmarks)||!exact(map.self,['actorId','x','y','location','alive'])||!validCoord(map.self)||
    map.self.actorId!=='actor-4'||!['village','forest','road'].includes(map.self.location)||map.self.location!==regionAt(map.self)||typeof map.self.alive!=='boolean'||!exact(map.movement,['maxSteps','ticksPerStep','batchTicks'])||
    map.movement.maxSteps!==48||map.movement.ticksPerStep!==1||map.movement.batchTicks!==2||!exact(map.budget,['remainingCommands'])||!safeInt(map.budget.remainingCommands))return false;
  if([2,3].includes(map.mapViewVersion)&&!validSocialMapView(map))return false;
  if(map.mapViewVersion===3&&!validNegotiationView(map.negotiation,map.tick))return false;
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
export function coherent(group){
  if(!group||typeof group!=='object'||group.capabilities?.continuousMarch!==true||group.apiVersion!==1)return false;
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

// One pending intent is retained across a lost response; retry uses identical bytes/ID.
export function createDemoClient({onState,onStatus,onReceipt,onBusy=()=>{}}){
 let group=null,source=null,connected=false,blocked=false,busy=false,pending=null,key=null,highest=-1;
 const status=(text,error=false)=>onStatus(text,error);
 async function json(url,options={}){
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(120000),...options});
  const body=await response.json();if(!response.ok)throw Object.assign(new Error(body?.error?.code??`HTTP ${response.status}`),{definitiveRejection:definitiveRejection(response,body)});return body;
 }
 function apply(value){
  if(!coherent(value))throw new Error('世界投影版本或身份不一致，已停止操作。');
  if(group&&value.snapshot.simulationId!==group.snapshot.simulationId)throw new Error('世界身份发生改变，请重新打开页面。');
  if(value.snapshot.revision<highest)return;
  highest=value.snapshot.revision;group=value;onState(value);
 }
 async function refresh(){const value=await json('/api/runtime/demo-state');apply(value);return value;}
 function savePending(value){
  const raw=JSON.stringify(value);sessionStorage.setItem(key,raw);if(sessionStorage.getItem(key)!==raw)throw new Error('待确认请求无法保全');pending=value;
 }
 function clear(){sessionStorage.removeItem(key);pending=null;}
 async function perform(item){
  busy=true;onBusy(true);status('指令已发送，正在确认…');
  try{
   let response;
   try{response=await json(item.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:item.body});}
   catch(error){if(error.definitiveRejection)clear();throw error;}
   const input=JSON.parse(item.body),order=item.endpoint.endsWith('demo-order');
   const dto=order?response.command:input,receipt=order?response.receipt:response;
   if(order&&(!dto||dto.commandId!==input.requestId||dto.type!==input.type||JSON.stringify(dto.payload)!==JSON.stringify(input.payload)))throw Error('订单确认与输入不一致');
   if(!validateCampaignReceipt(receipt,dto,order?receipt?.fromTick:item.fromTick))throw Error('命令回执无效，已保留待确认请求');
   const view=describeActionReceipt(receipt,dto);
   await refresh();
   if(group.snapshot.revision<receipt.toRevision||group.snapshot.tick<receipt.tick)throw Error('世界状态尚未更新到本次回执，请重试原请求。');
   await onReceipt(receipt,dto,group);clear();
   status(view.summary+(view.reason?'：'+view.reason:''),receipt.outcome==='rejected');
   return receipt;
  }catch(error){status(pending?'确认中断：请重试原请求，避免重复操作。':error.message,true);throw error;}
  finally{busy=false;onBusy(false);}
 }
 async function submit(type,payload={}){
  if(!connected||blocked||busy||pending||!group?.capabilities.writes)throw Error('当前无法提交：请检查连接或待确认请求。');
  // Timed world actions must not implicitly carry an unpaused march along with them.
  if(!type.startsWith('March')&&group.map.order?.status==='marching'){
   await submit('MarchPause');
   if(group.map.order?.status==='marching')throw Error('行军未暂停');
  }
  const order=type.startsWith('March');
  if(order&&!['MarchSet','MarchPause','MarchResume'].includes(type))throw Error('页面不能生成行军步进');
  const input=order?{apiVersion:1,requestId:crypto.randomUUID(),type,payload}:{version:5,commandId:crypto.randomUUID(),expectedRevision:group.snapshot.revision,type,payload};
  const item={simulationId:group.snapshot.simulationId,endpoint:order?'/api/runtime/demo-order':'/api/runtime/commands',body:JSON.stringify(input),fromTick:group.snapshot.tick};
  try{savePending(item);}catch(error){blocked=true;status('浏览器无法保全请求，已禁止写入。',true);throw error;}
  return perform(item);
 }
 function disconnect(){connected=false;source?.close();source=null;}
 function connect(){
  if(document.hidden||source)return;
  source=new EventSource('/api/runtime/demo-events');
  source.onmessage=event=>{try{apply(JSON.parse(event.data));connected=true;status(busy?'指令已发送，正在确认…':pending?'请求中断：结果待确认，可重试原请求。':'世界已连接 · 行军由运行时执行');onBusy(busy);}catch(error){disconnect();blocked=true;status(error.message,true);onBusy(false);}};
  source.onerror=()=>{connected=false;status('世界连接中断，连续行军将停止；重连后请明确继续。',true);onBusy(busy);};
 }
 async function stop(){
  const response=await json('/api/runtime/demo-stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"apiVersion":1}'});await refresh();return response;
 }
 async function pause(){
  if(busy||pending){await stop();status('已停止后续行军；请先完成待确认请求。');return;}
  // Keep other writes locked through both the drain and the persisted pause.
  busy=true;onBusy(true);
  try{await stop();}catch(error){busy=false;onBusy(false);throw error;}
  busy=false;
  if(group?.map.order?.status==='marching'||group?.map.contact)return submit('MarchPause');
  onBusy(false);
 }
 function hidden(){
  if(!document.hidden){connect();return;}
  disconnect();navigator.sendBeacon('/api/runtime/demo-stop',new Blob(['{"apiVersion":1}'],{type:'application/json'}));
 }
 async function start(){
  await refresh();key='narraverse.demo.pending.v1:'+group.snapshot.simulationId;
  try{const raw=sessionStorage.getItem(key);if(raw!==null){const value=JSON.parse(raw);
   if(!exact(value,['simulationId','endpoint','body','fromTick'])||value.simulationId!==group.snapshot.simulationId||!['/api/runtime/demo-order','/api/runtime/commands'].includes(value.endpoint)||typeof value.body!=='string'||!safeInt(value.fromTick))throw Error('待确认记录无效');
   const body=JSON.parse(value.body);if(body.type==='MarchStep'||typeof(body.requestId??body.commandId)!=='string')throw Error('待确认输入无效');pending=value;
  }}catch{blocked=true;status('待确认记录无法读取，已禁止写入。',true);}
  connect();document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',()=>{disconnect();navigator.sendBeacon('/api/runtime/demo-stop',new Blob(['{"apiVersion":1}'],{type:'application/json'}));});
 }
 return Object.freeze({start,submit,pause,stop,refresh,retry(){if(!pending||busy||blocked||!connected)throw Error('没有可重试的请求');return perform(pending);},
  state:()=>({connected,blocked,busy,pending:pending!==null,canRetry:pending!==null&&!busy&&!blocked&&connected}),getGroup:()=>group});
}
