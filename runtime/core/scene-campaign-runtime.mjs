import {fields,record,integer,cloneData,canonicalJson,requireCondition} from './data-contract.mjs';
import {inspectDescriptorTree} from './experience-state.mjs';
import {campaignBaseRuntimeHooks,validateCampaignBaseWorld} from './motivation-runtime.mjs';
import {createSceneEncounterRuntimeHooks,validateSceneEncounterWorldState} from './encounter-runtime.mjs';
import {preflightSceneIntent,auditGift,commitGift} from './scene-runtime.mjs';
import {observeSceneCommand} from './memory-runtime.mjs';
import {auditPlayerWork} from './player-work.mjs';
import {canonicalSystems} from './command-engine.mjs';
import {validateBundle,createAuditedBundle} from './world-state.mjs';
import {MARCH_TYPES,requireMarchBudget,createCampaignMap,validateMapPoint,validateCampaignMap,advanceMapTick,finishMapTick,auditMarch,commitMarch,marchResult,mapDistance} from './campaign-map.mjs';
import {NPC_MAP_VERSION,prepareHunterTravel,hunterActionAtSite} from './campaign-npc-agency.mjs';
import {SOCIAL_MAP_VERSION,SOCIAL_COMMAND,preflightSocialPayload,auditSocial,commitSocial,observeSocialGift,observeSocialTick} from './npc-social.mjs';
import {NEGOTIATION_MAP_VERSION,NEGOTIATION_COMMANDS} from '../../runtime-negotiation-contract.mjs';
import {preflightNegotiation,auditNegotiation,commitNegotiation,observeAgreementAction,observeAgreementTick} from './npc-negotiation.mjs';
import {createPlayModel,auditQuest,commitQuest,observePlayCommand,observePlayTick} from './campaign-play.mjs';
import {PLAY_QUEST_COMMAND,validQuestPayload} from '../../runtime-playable-contract.mjs';
import {NPC_MEMORY_MAP_VERSION,updateNpcMemory} from './npc-memory.mjs';
export const CAMPAIGN_RULES='d-campaign-v1',CAMPAIGN_PROFILE='campaign-village';
export function preflightCampaignIntent(dto){
 inspectDescriptorTree(dto);fields(dto,['version','commandId','expectedRevision','type','payload']);
 requireCondition(dto.version===5,'Campaign requires command DTO5','UNSUPPORTED_VERSION');
 requireCondition(dto.type!=='PlayerTravel','Campaign travel requires a march order','COMMAND_UNSUPPORTED');
 if(dto.type===PLAY_QUEST_COMMAND){preflightSceneIntent({...dto,type:'PlayerRest',payload:{}},5);requireCondition(validQuestPayload(dto.payload),'Invalid quest payload');
 }else if(NEGOTIATION_COMMANDS.includes(dto.type)){
  preflightSceneIntent({...dto,type:'PlayerRest',payload:{}},5);preflightNegotiation(dto);
 }else if(dto.type===SOCIAL_COMMAND){
  preflightSceneIntent({...dto,type:'PlayerRest',payload:{}},5);preflightSocialPayload(dto.payload);
 }else if(MARCH_TYPES.includes(dto.type)){
  // Reuse the exact scene envelope, ID/namespace and byte-budget checks.
  preflightSceneIntent({...dto,type:'PlayerRest',payload:{}},5);record(dto.payload);
  if(dto.type==='MarchSet')validateMapPoint(dto.payload);else fields(dto.payload,[]);
  requireCondition(new TextEncoder().encode(JSON.stringify(dto)).length<=4096,'Campaign intent exceeds budget','LIMIT_EXCEEDED');
 }else preflightSceneIntent(dto,5);
}
function detached(snapshot,run){const m=snapshot.world.mapModel;delete snapshot.world.mapModel;try{return run();}finally{snapshot.world.mapModel=m;}}
const base=Object.freeze({
 createWorld:(...a)=>campaignBaseRuntimeHooks.createWorld(...a),
 beforeSystems:(s,e,t,a,c)=>{
  const map=s.world.mapModel;
  // The base planner needs its exact field set. Reattach the authoritative map only
  // while its committed command passes through the engine's spatial action gate.
  const commit=[NPC_MAP_VERSION,SOCIAL_MAP_VERSION,NEGOTIATION_MAP_VERSION,NPC_MEMORY_MAP_VERSION].includes(map.version)?raw=>{
   s.world.mapModel=map;try{return c(raw);}finally{delete s.world.mapModel;}
  }:c;
  return detached(s,()=>campaignBaseRuntimeHooks.beforeSystems(s,e,t,a,commit));
 },
 afterSystems:(s,e,t,a,c)=>detached(s,()=>campaignBaseRuntimeHooks.afterSystems(s,e,t,a,c)),
 applyAction:(input,payload,sample)=>{const {mapModel,...part}=input,r=campaignBaseRuntimeHooks.applyAction(part,payload,sample,!hunterActionAtSite(mapModel,payload));return {...r,world:{...r.world,...(mapModel===undefined?{}:{mapModel:cloneData(mapModel)})}};},
 settleDay:(input,...a)=>{const {mapModel,...part}=input,r=campaignBaseRuntimeHooks.settleDay(part,...a);return {...r,world:{...r.world,...(mapModel===undefined?{}:{mapModel:cloneData(mapModel)})}};}
});
function campaignGift(world){const plan=auditGift(world),n=world.mapModel.npcs.find(n=>n.actorId==='actor-2');
 return plan.outcome==='succeeded'&&mapDistance(world.mapModel.position,n)>1?{...plan,outcome:'rejected',reasonCode:'NOT_COLOCATED'}:plan;}
const cached=new Map();
function hooks(version='1'){
 requireCondition(['1','2','3','4','5','6'].includes(version),'Unsupported campaign fixture','UNSUPPORTED_VERSION');
 if(cached.has(version))return cached.get(version);
 const npcAgency=version!=='1',social=['3','4','5','6'].includes(version),negotiation=['4','5','6'].includes(version);
 const result=createSceneEncounterRuntimeHooks(base,{rules:CAMPAIGN_RULES,fixture:CAMPAIGN_PROFILE,fixtureVersion:version,campaign:true,
 preflight:preflightCampaignIntent,auditGift:campaignGift,commitGift:(world,...args)=>{const fact=commitGift(world,...args);if(social)observeSocialGift(world,fact);updateNpcMemory(world);return fact;},auditWork:auditPlayerWork,observe:(w,e,t)=>{observeSceneCommand(w,e,t);if(version==='6')observePlayCommand(w,e,t);},
 extendWorld:world=>({...world,mapModel:{...createCampaignMap(npcAgency,social,negotiation,['5','6'].includes(version)),...(version==='6'?{playModel:createPlayModel()}:{})}}),validateWorld:validateCampaignWorldState,
 beforeTick:(world,tick,append,events,id)=>{if(social)observeSocialTick(world,tick,append);if(negotiation)observeAgreementTick(world,tick,append);updateNpcMemory(world);if(npcAgency)prepareHunterTravel(world,events,tick,id);advanceMapTick(world,tick,append);},
 auditDirect:(world,dto)=>auditQuest(world,dto)??auditNegotiation(world,dto)??auditSocial(world,dto),
 commitDirect:(world,dto,tick,seq)=>{const result=dto.type===PLAY_QUEST_COMMAND?commitQuest(world,dto,tick):NEGOTIATION_COMMANDS.includes(dto.type)?commitNegotiation(world,dto,tick,seq):observeAgreementAction(world,dto,commitSocial(world,dto,tick,seq),tick,seq);updateNpcMemory(world,result);return result;},
 afterTick:(w,t)=>{finishMapTick(w);if(version==='6')observePlayTick(w,t);},auditMap:auditMarch,commitMap:commitMarch,mapResult:marchResult,requireBudget:requireMarchBudget,
 adjustPlan:(dto,world,plan)=>world.mapModel.order?.status==='marching'&&!MARCH_TYPES.includes(dto.type)?{...plan,outcome:'rejected',reasonCode:'RULE_REJECTED',durationTicks:0}:plan});
 cached.set(version,result);return result;
}
export const campaignRuntimeHooks=Object.freeze({
 createWorld:(...a)=>hooks().createWorld(...a),
 beforeSystems:(s,...a)=>hooks(s.fixtureVersion).beforeSystems(s,...a),afterSystems:(s,...a)=>hooks(s.fixtureVersion).afterSystems(s,...a),
 applyAction:(...a)=>hooks().applyAction(...a),settleDay:(...a)=>hooks().settleDay(...a),
 validateHistory:(s,...a)=>hooks(s.fixtureVersion).validateHistory(s,...a),
 validateHistoryWithEvidence:(s,...a)=>{inspectDescriptorTree({snapshot:s,events:a[0]});return hooks(s.fixtureVersion).validateHistoryWithEvidence(s,...a);},
 replayOrigin:s=>{inspectDescriptorTree(s);return hooks(s.fixtureVersion).replayOrigin(s);}
});
export const createNpcCampaignWorld=(...args)=>hooks('2').createWorld(...args);
export const createSocialCampaignWorld=(...args)=>hooks('3').createWorld(...args);
export const createNegotiationCampaignWorld=(...args)=>hooks('4').createWorld(...args);
export const createMemoryCampaignWorld=(...args)=>hooks('5').createWorld(...args);
export const createPlayableCampaignWorld=(...args)=>hooks('6').createWorld(...args);
// A single bounded proof of this pure structural predicate, keyed by exact JSON
// bytes and tick, never by mutable identity or a caller-provided trust flag.
// Input descriptors are always inspected and detached before comparing bytes.
// Event/history/receipt replay is outside this predicate and never cached here.
let lastWorldStructure = null;
export function validateCampaignWorldState(world,options={}){
 inspectDescriptorTree({world,options});record(world);fields(options,['tick']);integer(options.tick);
 const detached=cloneData({world,options}),key=canonicalJson(detached);
 if(lastWorldStructure?.key===key)return cloneData(lastWorldStructure.result);
 const {mapModel,encounterModel,...part}=detached.world;validateCampaignBaseWorld(part);validateCampaignMap(detached.world,detached.options.tick);
 const result=validateSceneEncounterWorldState(detached.world,detached.options);
 if(key.length<=262144)lastWorldStructure={key,result:cloneData(result)};
 return result;
}
export function describeCampaignEncounterActions(bundle){validateBundle(bundle,{rulesVersion:CAMPAIGN_RULES,systems:canonicalSystems(CAMPAIGN_RULES)});
 const result=hooks(bundle.snapshot.fixtureVersion).describeActions(bundle);if(bundle.snapshot.world.mapModel.order?.status==='marching')result.canBegin=false;return cloneData(result);}
export function describeCampaignGiftAvailability(bundle){validateBundle(bundle,{rulesVersion:CAMPAIGN_RULES,systems:canonicalSystems(CAMPAIGN_RULES)});const {outcome,reasonCode}=campaignGift(bundle.snapshot.world);return {available:outcome==='succeeded'&&bundle.snapshot.world.mapModel.order?.status!=='marching',reasonCode};}
export function executeAuditedCampaignIntent(bundle,dto){inspectDescriptorTree({bundle,dto});preflightCampaignIntent(dto);const systems=canonicalSystems(CAMPAIGN_RULES);
 validateBundle(bundle,{rulesVersion:CAMPAIGN_RULES,systems});const result=hooks(bundle.snapshot.fixtureVersion).executeIntent(bundle,dto);
 return {bundle:createAuditedBundle(result.bundle,{rulesVersion:CAMPAIGN_RULES,systems}),receipt:cloneData(result.receipt)};}

// Pure fixed-rule computation, not an audit or a durable-owner certificate.
export function computeCampaignIntent(bundle,dto){
 inspectDescriptorTree({bundle,dto});preflightCampaignIntent(dto);
 return hooks(bundle.snapshot.fixtureVersion).executeIntent(bundle,dto);
}
