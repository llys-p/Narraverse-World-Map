import {fields,record,integer,cloneData,requireCondition} from './data-contract.mjs';
import {inspectDescriptorTree} from './experience-state.mjs';
import {campaignBaseRuntimeHooks,validateCampaignBaseWorld} from './motivation-runtime.mjs';
import {createSceneEncounterRuntimeHooks,validateSceneEncounterWorldState} from './encounter-runtime.mjs';
import {preflightSceneIntent,auditGift,commitGift} from './scene-runtime.mjs';
import {observeSceneCommand} from './memory-runtime.mjs';
import {auditPlayerWork} from './player-work.mjs';
import {canonicalSystems} from './command-engine.mjs';
import {validateBundle,createAuditedBundle} from './world-state.mjs';
import {MARCH_TYPES,requireMarchBudget,createCampaignMap,validateMapPoint,validateCampaignMap,advanceMapTick,finishMapTick,auditMarch,commitMarch,marchResult,mapDistance} from './campaign-map.mjs';
export const CAMPAIGN_RULES='d-campaign-v1',CAMPAIGN_PROFILE='campaign-village';
export function preflightCampaignIntent(dto){
 inspectDescriptorTree(dto);fields(dto,['version','commandId','expectedRevision','type','payload']);
 requireCondition(dto.version===5,'Campaign requires command DTO5','UNSUPPORTED_VERSION');
 requireCondition(dto.type!=='PlayerTravel','Campaign travel requires a march order','COMMAND_UNSUPPORTED');
 if(MARCH_TYPES.includes(dto.type)){
  // Reuse the exact scene envelope, ID/namespace and byte-budget checks.
  preflightSceneIntent({...dto,type:'PlayerRest',payload:{}},5);record(dto.payload);
  if(dto.type==='MarchSet')validateMapPoint(dto.payload);else fields(dto.payload,[]);
  requireCondition(new TextEncoder().encode(JSON.stringify(dto)).length<=4096,'Campaign intent exceeds budget','LIMIT_EXCEEDED');
 }else preflightSceneIntent(dto,5);
}
function detached(snapshot,run){const m=snapshot.world.mapModel;delete snapshot.world.mapModel;try{return run();}finally{snapshot.world.mapModel=m;}}
const base=Object.freeze({
 createWorld:(...a)=>campaignBaseRuntimeHooks.createWorld(...a),
 beforeSystems:(s,e,t,a,c)=>detached(s,()=>campaignBaseRuntimeHooks.beforeSystems(s,e,t,a,c)),
 afterSystems:(s,e,t,a,c)=>detached(s,()=>campaignBaseRuntimeHooks.afterSystems(s,e,t,a,c)),
 applyAction:(input,...a)=>{const {mapModel,...part}=input,r=campaignBaseRuntimeHooks.applyAction(part,...a);return {...r,world:{...r.world,...(mapModel===undefined?{}:{mapModel:cloneData(mapModel)})}};},
 settleDay:(input,...a)=>{const {mapModel,...part}=input,r=campaignBaseRuntimeHooks.settleDay(part,...a);return {...r,world:{...r.world,...(mapModel===undefined?{}:{mapModel:cloneData(mapModel)})}};}
});
function campaignGift(world){const plan=auditGift(world),n=world.mapModel.npcs.find(n=>n.actorId==='actor-2');
 return plan.outcome==='succeeded'&&mapDistance(world.mapModel.position,n)>1?{...plan,outcome:'rejected',reasonCode:'NOT_COLOCATED'}:plan;}
let cached;
const hooks=()=>cached??=createSceneEncounterRuntimeHooks(base,{rules:CAMPAIGN_RULES,fixture:CAMPAIGN_PROFILE,campaign:true,
 preflight:preflightCampaignIntent,auditGift:campaignGift,commitGift,auditWork:auditPlayerWork,observe:observeSceneCommand,
 extendWorld:world=>({...world,mapModel:createCampaignMap()}),validateWorld:validateCampaignWorldState,
 beforeTick:advanceMapTick,afterTick:finishMapTick,auditMap:auditMarch,commitMap:commitMarch,mapResult:marchResult,requireBudget:requireMarchBudget,
 adjustPlan:(dto,world,plan)=>world.mapModel.order?.status==='marching'&&!MARCH_TYPES.includes(dto.type)?{...plan,outcome:'rejected',reasonCode:'RULE_REJECTED',durationTicks:0}:plan});
export const campaignRuntimeHooks=Object.freeze({
 createWorld:(...a)=>hooks().createWorld(...a),beforeSystems:(...a)=>hooks().beforeSystems(...a),afterSystems:(...a)=>hooks().afterSystems(...a),
 applyAction:(...a)=>hooks().applyAction(...a),settleDay:(...a)=>hooks().settleDay(...a),validateHistory:(...a)=>hooks().validateHistory(...a)
});
export function validateCampaignWorldState(world,options={}){
 inspectDescriptorTree({world,options});record(world);fields(options,['tick']);integer(options.tick);
 const {mapModel,encounterModel,...part}=world;validateCampaignBaseWorld(part);validateCampaignMap(world,options.tick);
 return validateSceneEncounterWorldState({...part,encounterModel},options);
}
export function describeCampaignEncounterActions(bundle){validateBundle(bundle,{rulesVersion:CAMPAIGN_RULES,systems:canonicalSystems(CAMPAIGN_RULES)});
 const result=hooks().describeActions(bundle);if(bundle.snapshot.world.mapModel.order?.status==='marching')result.canBegin=false;return cloneData(result);}
export function describeCampaignGiftAvailability(bundle){validateBundle(bundle,{rulesVersion:CAMPAIGN_RULES,systems:canonicalSystems(CAMPAIGN_RULES)});const {outcome,reasonCode}=campaignGift(bundle.snapshot.world);return {available:outcome==='succeeded'&&bundle.snapshot.world.mapModel.order?.status!=='marching',reasonCode};}
export function executeAuditedCampaignIntent(bundle,dto){inspectDescriptorTree({bundle,dto});preflightCampaignIntent(dto);const systems=canonicalSystems(CAMPAIGN_RULES);
 validateBundle(bundle,{rulesVersion:CAMPAIGN_RULES,systems});const result=hooks().executeIntent(bundle,dto);
 return {bundle:createAuditedBundle(result.bundle,{rulesVersion:CAMPAIGN_RULES,systems}),receipt:cloneData(result.receipt)};}
