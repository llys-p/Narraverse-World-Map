// One bounded campaign map. Positions, orders and NPC travel are replayed world facts.
import {fields,record,integer,denseArray,requireCondition,cloneData,canonicalJson} from './data-contract.mjs';
import {inspectDescriptorTree} from './experience-state.mjs';
import {validatePlayModel,playableView} from './campaign-play.mjs';
import {NPC_MAP_VERSION,initialHunterIntent,validateHunterIntent} from './campaign-npc-agency.mjs';
import {HUNTER_SITES} from './npc-village-sites.mjs';
import {SOCIAL_MAP_VERSION,isSocialMapVersion,createSocialModel,validateSocialModel,socialTravelTarget,socialView} from './npc-social.mjs';
import {NEGOTIATION_MAP_VERSION,isNegotiationMapVersion} from '../../runtime-negotiation-contract.mjs';
import {createNegotiationModel,validateNegotiationModel,negotiationView} from './npc-negotiation.mjs';
import {NPC_MEMORY_MAP_VERSION,createNpcMemoryModel,validateNpcMemoryModel} from './npc-memory.mjs';
import {validateForestModel,forestView} from './campaign-forest.mjs';
export const CAMPAIGN_MAP_ID='village-forest-v1',MAP_WIDTH=20,MAP_HEIGHT=12,MAX_ROUTE_STEPS=48;
export const MARCH_TYPES=Object.freeze(['MarchSet','MarchPause','MarchResume','MarchStep']);
export function requireMarchBudget(type,remaining,world){integer(remaining);if(world?.mapModel?.order?.status==='marching'&&type!=='MarchPause')requireCondition(remaining>=2,'Last command is reserved for pause','LIMIT_EXCEEDED');if(['MarchSet','MarchResume'].includes(type))requireCondition(remaining>=3,'March requires a reserved pause command','LIMIT_EXCEEDED');if(type==='MarchStep')requireCondition(remaining>=2,'Last command is reserved for pause','LIMIT_EXCEEDED');}
export const LANDMARKS=Object.freeze([{id:'village',name:'村庄',x:4,y:7},{id:'forest',name:'森林',x:16,y:7}]);
const NPC_LANDMARKS=Object.freeze([...LANDMARKS,
 {id:'village-work',name:'村内工作点',...HUNTER_SITES.WorkForPay},
 {id:'village-food',name:'粮摊',...HUNTER_SITES.BuyFood},
 {id:'village-rest',name:'歇脚处',...HUNTER_SITES.Rest}]);
const NPC_IDS=['actor-1','actor-2','actor-3'];
const line=(from,to,y)=>Array.from({length:to-from+1},(_,i)=>({x:from+i,y}));
const thereAndBack=path=>[...path,...path.slice(1,-1).reverse()];
const ROUTES=[[{x:4,y:6}],thereAndBack(line(5,16,7)),thereAndBack([{x:3,y:7},...line(3,9,8)])];
const PERIODS=[0,4,6];
const same=(a,b)=>a.x===b.x&&a.y===b.y;
export const mapDistance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function validateMapPoint(p){fields(p,['x','y']);integer(p.x);integer(p.y);requireCondition(p.x<MAP_WIDTH&&p.y<MAP_HEIGHT,'Map coordinate is outside the map');return p;}
export const mapWalkable=p=>Number.isSafeInteger(p?.x)&&Number.isSafeInteger(p?.y)&&p.x>=0&&p.x<MAP_WIDTH&&p.y>=0&&p.y<MAP_HEIGHT&&(p.x!==10||p.y===7);
export function mapLocation(p){return p.x>=3&&p.x<=5&&p.y>=6&&p.y<=8?'village':p.x>=14&&p.y>=2?'forest':'road';}
export function mapRoute(from,to){
 if(!mapWalkable(from)||!mapWalkable(to))return null;
 const key=p=>p.y*MAP_WIDTH+p.x,queue=[{...from}],parents=new Map([[key(from),null]]);
 for(let i=0;i<queue.length;i++){
  const at=queue[i];if(same(at,to)){const path=[];for(let p=at;p!==null;p=parents.get(key(p)))path.push(p);path.reverse();return path.length-1<=MAX_ROUTE_STEPS?path:null;}
  for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const next={x:at.x+dx,y:at.y+dy};if(mapWalkable(next)&&!parents.has(key(next))){parents.set(key(next),at);queue.push(next);}}
 }
 return null;
}
export function createCampaignMap(npcAgency=false,social=false,negotiation=false,memory=false){return {version:memory?NPC_MEMORY_MAP_VERSION:negotiation?NEGOTIATION_MAP_VERSION:social?SOCIAL_MAP_VERSION:npcAgency?NPC_MAP_VERSION:'campaign-map-v1',mapId:CAMPAIGN_MAP_ID,position:{x:4,y:7},travelledSteps:0,
 npcs:NPC_IDS.map((actorId,i)=>({actorId,...ROUTES[i][0],routeIndex:0})),order:null,contact:null,...(npcAgency?{hunterIntent:initialHunterIntent()}:{}),...(social?{socialModel:createSocialModel()}:{}),...(negotiation?{negotiationModel:createNegotiationModel()}:{}),...(memory?{memoryModel:createNpcMemoryModel()}:{})};}
export function validateCampaignMap(world,tick){
 const m=world.mapModel,negotiation=isNegotiationMapVersion(m.version),social=isSocialMapVersion(m.version),npcAgency=m.version===NPC_MAP_VERSION||social;fields(m,['version','mapId','position','travelledSteps','npcs','order','contact',...(npcAgency?['hunterIntent']:[]),...(social?['socialModel']:[]),...(negotiation?['negotiationModel']:[]),...(m.version===NPC_MEMORY_MAP_VERSION?['memoryModel']:[]),...(Object.hasOwn(m,'playModel')?['playModel']:[]),...(Object.hasOwn(m,'forestModel')?['forestModel']:[])]);
 requireCondition((m.version==='campaign-map-v1'||npcAgency)&&m.mapId===CAMPAIGN_MAP_ID,'Unsupported campaign map','UNSUPPORTED_VERSION');
 if(Object.hasOwn(m,'playModel')){requireCondition(m.version===NPC_MEMORY_MAP_VERSION,'Playable map requires memory');validatePlayModel(m.playModel,tick);}
 if(Object.hasOwn(m,'forestModel')){requireCondition(m.playModel?.version==='playable-v2','Forest requires trust journey');validateForestModel(m.forestModel);}
 if(npcAgency)validateHunterIntent(m.hunterIntent,tick);
 if(social)validateSocialModel(m.socialModel,tick,negotiation);
 if(negotiation)validateNegotiationModel(m.negotiationModel,tick);
 if(m.version===NPC_MEMORY_MAP_VERSION)validateNpcMemoryModel(m.memoryModel,tick,m.socialModel);
 validateMapPoint(m.position);requireCondition(mapWalkable(m.position),'Player stands on blocked terrain');integer(m.travelledSteps);integer(tick);
 const actors=world.actorModel.actors,player=actors.find(a=>a.actorId==='actor-4');
 requireCondition(player&&player.location===mapLocation(m.position),'Player map/region mismatch');
 denseArray(m.npcs,3);requireCondition(m.npcs.length===3,'Campaign NPC roster mismatch');
 for(let i=0;i<3;i++){const n=m.npcs[i];fields(n,['actorId','x','y','routeIndex']);integer(n.routeIndex);
  requireCondition(n.actorId===NPC_IDS[i],'NPC identity mismatch');
  if(npcAgency&&i===1){validateMapPoint({x:n.x,y:n.y});requireCondition(n.routeIndex===0&&mapLocation(n)==='village'&&mapWalkable(n),'Hunter must stay in the village');}
  else requireCondition(n.routeIndex<ROUTES[i].length&&same(n,ROUTES[i][n.routeIndex]),'NPC route position mismatch');
  requireCondition(actors[i].actorId===n.actorId&&actors[i].location===mapLocation(n),'NPC map/region mismatch');}
 if(m.order!==null){const o=m.order;fields(o,['target','path','index','status']);validateMapPoint(o.target);denseArray(o.path,MAX_ROUTE_STEPS+1);
  requireCondition(o.path.length>=2&&['marching','paused','arrived'].includes(o.status),'Invalid march order');integer(o.index);requireCondition(o.index<o.path.length,'March cursor outside route');
  for(let i=0;i<o.path.length;i++){validateMapPoint(o.path[i]);requireCondition(mapWalkable(o.path[i]),'March route crosses blocked terrain');if(i)requireCondition(Math.abs(o.path[i].x-o.path[i-1].x)+Math.abs(o.path[i].y-o.path[i-1].y)===1,'March route is not contiguous');}
  requireCondition(same(o.path[o.index],m.position)&&same(o.path.at(-1),o.target),'March position/target mismatch');
  requireCondition((o.status==='arrived')===(o.index===o.path.length-1),'March arrival mismatch');
  requireCondition(canonicalJson(mapRoute(o.path[0],o.target))===canonicalJson(o.path),'March route is not canonical');
  if(!player.alive)requireCondition(o.status!=='marching','Dead player is marching');
 }
 if(m.contact!==null){fields(m.contact,['actorId','tick']);integer(m.contact.tick);const n=m.npcs.find(n=>n.actorId===m.contact.actorId),a=actors.find(a=>a.actorId===m.contact.actorId);
  requireCondition(n&&a?.alive&&mapDistance(m.position,n)<=1&&m.contact.tick<=tick&&m.order?.status!=='marching','Map contact is not at the player');}
}
export function auditMarch(world,dto){
 if(!MARCH_TYPES.includes(dto.type))return null;
 const m=world.mapModel,p=world.actorModel.actors[3];let reasonCode=null;
 if(dto.type==='MarchPause'){if(m.order===null&&m.contact===null)reasonCode='RULE_REJECTED';}
 else if(!p.alive)reasonCode='PLAYER_DEAD';
 else if(world.encounterModel.encounter?.status==='active')reasonCode='ENCOUNTER_BUSY';
 else if(dto.type==='MarchSet'){if(same(m.position,dto.payload)||mapRoute(m.position,dto.payload)===null)reasonCode='RULE_REJECTED';}
 else if(dto.type==='MarchResume'){if(!['paused','marching'].includes(m.order?.status))reasonCode='RULE_REJECTED';}
 else if(m.order?.status!=='marching')reasonCode='RULE_REJECTED';
 return {outcome:reasonCode===null?'succeeded':'rejected',reasonCode,durationTicks:reasonCode===null&&dto.type==='MarchStep'?Math.min(2,m.order.path.length-1-m.order.index):0,
  worldCommand:true,directTicks:true,mapCommand:true};
}
export function commitMarch(world,dto){
 const m=world.mapModel;
 if(dto.type==='MarchSet'){m.order={target:{...dto.payload},path:mapRoute(m.position,dto.payload),index:0,status:'marching'};m.contact=null;}
 else if(dto.type==='MarchPause'){if(m.order?.status==='marching')m.order.status='paused';m.contact=null;}
 else if(dto.type==='MarchResume'){m.order.status='marching';m.contact=null;}
}
export function advanceMapTick(world,tick,append){
 const priorLocations=new Map(world.actorModel.actors.map(a=>[a.actorId,a.location]));
 const m=world.mapModel,p=world.actorModel.actors[3],wasMarching=m.order?.status==='marching';
 const before=new Set(m.npcs.filter(n=>mapDistance(m.position,n)<=1).map(n=>n.actorId));
 for(let i=0;i<3;i++){const n=m.npcs[i],a=world.actorModel.actors[i];
  if([NPC_MAP_VERSION,SOCIAL_MAP_VERSION,NEGOTIATION_MAP_VERSION,NPC_MEMORY_MAP_VERSION].includes(m.version)&&i===1){
   if(a.alive&&tick%4===0){const route=mapRoute({x:n.x,y:n.y},socialTravelTarget(world,HUNTER_SITES[m.hunterIntent.action]));if(route?.length>1)Object.assign(n,route[1]);}
  }else if(a.alive&&PERIODS[i]&&tick%PERIODS[i]===0&&m.contact?.actorId!==n.actorId){n.routeIndex=(n.routeIndex+1)%ROUTES[i].length;Object.assign(n,ROUTES[i][n.routeIndex]);}
  a.location=mapLocation(n);
 }
 if(wasMarching&&p.alive&&world.encounterModel.encounter?.status!=='active'){
  const o=m.order;requireCondition(m.travelledSteps<Number.MAX_SAFE_INTEGER,'March distance overflow','LIMIT_EXCEEDED');
  const old=BigInt(m.travelledSteps),next=old+1n,cost=Number((next*100n+11n)/12n-(old*100n+11n)/12n);
  m.position={...o.path[++o.index]};m.travelledSteps++;p.location=mapLocation(m.position);p.fatigue=Math.min(1000,p.fatigue+cost);p.needs={food:p.hunger,healing:1000-p.health,rest:p.fatigue};
  if(o.index===o.path.length-1)o.status='arrived';
  const met=m.npcs.find((n,i)=>world.actorModel.actors[i].alive&&!before.has(n.actorId)&&mapDistance(m.position,n)<=1);
  if(met){m.contact={actorId:met.actorId,tick};if(o.status==='marching')o.status='paused';}
 }
 finishMapTick(world);
 const rows=world.actorModel.actors.filter(a=>a.location!==priorLocations.get(a.actorId)).map(a=>({actorId:a.actorId,before:priorLocations.get(a.actorId),after:a.location}));
 if(rows.length&&append)append({type:'CampaignRegionsChanged',sourceSystem:'campaign',commandId:null,entityIds:rows.map(r=>r.actorId),causationEventSeqs:[],payload:{rows}});
}
export function finishMapTick(world){const m=world.mapModel;if(!world.actorModel.actors[3].alive&&m.order?.status==='marching')m.order.status='paused';
 if(m.contact&&(!world.actorModel.actors.find(a=>a.actorId===m.contact.actorId)?.alive||
  ([NPC_MAP_VERSION,SOCIAL_MAP_VERSION,NEGOTIATION_MAP_VERSION,NPC_MEMORY_MAP_VERSION].includes(m.version)&&mapDistance(m.position,m.npcs.find(n=>n.actorId===m.contact.actorId))>1)))m.contact=null;}
export function marchResult(before,after,dto,plan){return plan.outcome!=='succeeded'?{code:plan.reasonCode}:{action:dto.type,before:{...before.mapModel.position},after:{...after.mapModel.position},
 stepsMoved:after.mapModel.travelledSteps-before.mapModel.travelledSteps,status:after.mapModel.order?.status??'idle',contact:cloneData(after.mapModel.contact)};}
export function mapView(bundle,remainingCommands){
 inspectDescriptorTree(bundle);const s=bundle.snapshot,w=s.world,m=w.mapModel,p=w.actorModel.actors[3];validateCampaignMap(w,s.tick);
 const blocked=Array.from({length:MAP_HEIGHT},(_,y)=>({x:10,y})).filter(p=>p.y!==7);
 return cloneData({apiVersion:1,mapViewVersion:m.forestModel?5:m.playModel?4:isNegotiationMapVersion(m.version)?3:m.version===SOCIAL_MAP_VERSION?2:1,simulationId:s.simulationId,revision:s.revision,tick:s.tick,mapId:m.mapId,width:MAP_WIDTH,height:MAP_HEIGHT,blocked,landmarks:[NPC_MAP_VERSION,SOCIAL_MAP_VERSION,NEGOTIATION_MAP_VERSION,NPC_MEMORY_MAP_VERSION].includes(m.version)?NPC_LANDMARKS:LANDMARKS,
  self:{actorId:p.actorId,...m.position,location:p.location,alive:p.alive},order:m.order,contact:m.contact,
  actors:m.npcs.filter(n=>mapDistance(m.position,n)<=4).map(n=>{const a=w.actorModel.actors.find(a=>a.actorId===n.actorId),near=mapDistance(m.position,n)<=1;
   const observer=w.memoryModel.observer.actors.find(o=>o.actorId===a.actorId);
   return {actorId:a.actorId,name:a.name,occupation:a.occupation,location:a.location,alive:a.alive,condition:!a.alive?'dead':a.health===1000?'healthy':'wounded',x:n.x,y:n.y,canInteract:near&&a.alive,
    receivedGifts:near?observer.memories.filter(mem=>mem.observable.type==='food-gift'&&mem.observable.donorId==='actor-4'&&mem.observable.direction==='received'):[]};}),
  ...(m.forestModel?{forest:forestView(w)}:{}),...(m.playModel?{playable:playableView(w,s.tick)}:{}),movement:{maxSteps:MAX_ROUTE_STEPS,ticksPerStep:1,batchTicks:2},budget:{remainingCommands},...(isSocialMapVersion(m.version)?{social:socialView(w)}:{}),...(isNegotiationMapVersion(m.version)?{negotiation:negotiationView(w)}:{})});
}
