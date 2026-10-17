// D4 scene continuity: one authoritative encounter journal for gifts and existing DTO3 commands.
import {requireCondition,record,fields,integer,identifier,denseArray,cloneData,canonicalJson} from './data-contract.mjs';
import {inspectDescriptorTree} from './experience-state.mjs';
import {sceneBaseRuntimeHooks,validateSceneBaseWorld} from './motivation-runtime.mjs';
import {createSceneEncounterRuntimeHooks,validateSceneEncounterWorldState} from './encounter-runtime.mjs';
import {observeSceneCommand} from './memory-runtime.mjs';
import {validateBundle,createAuditedBundle} from './world-state.mjs';
import {canonicalSystems} from './command-engine.mjs';
export const SCENE_RULES='d-scene-survival-v1';
export const SCENE_PROFILE='scene-survival-village';
// Resolve the shared base only after this module cycle has finished initializing.
let cachedHooks=null;
const hooks=()=>cachedHooks??=createSceneEncounterRuntimeHooks(sceneBaseRuntimeHooks,{preflight:preflightSceneIntent,auditGift,commitGift,observe:observeSceneCommand});
export const sceneRuntimeHooks=Object.freeze({
 createWorld:(memory,mind,motivation,experience,cognition,id)=>hooks().createWorld(memory,mind,motivation,experience,cognition,id),
 beforeSystems:(snapshot,events,tick,append,commit)=>hooks().beforeSystems(snapshot,events,tick,append,commit),
 afterSystems:(snapshot,events,tick,append,context)=>hooks().afterSystems(snapshot,events,tick,append,context),
 applyAction:(input,payload,sample=null)=>hooks().applyAction(input,payload,sample),
 settleDay:(world,sample)=>hooks().settleDay(world,sample),
 validateHistory:(snapshot,events)=>hooks().validateHistory(snapshot,events)
});
export function validateSceneWorldState(world,options={}){
 inspectDescriptorTree({world,options});record(world);record(options);fields(options,['tick']);
 const tick=options.tick;integer(tick);
 const {encounterModel,...base}=world;
 validateSceneBaseWorld(base);
 return validateSceneEncounterWorldState(world,{tick});
}
export function preflightSceneIntent(dto,version=3){
 inspectDescriptorTree(dto);fields(dto,['version','commandId','expectedRevision','type','payload']);
 requireCondition(new TextEncoder().encode(canonicalJson(dto)).length<=4096,'Scene intent exceeds byte budget','LIMIT_EXCEEDED');
 requireCondition(dto.version===version,'Unsupported scene DTO version','UNSUPPORTED_VERSION');
 identifier(dto.commandId);integer(dto.expectedRevision);identifier(dto.type);record(dto.payload);
 requireCondition(dto.commandId.length<=64&&/^[A-Za-z0-9_-]+$/.test(dto.commandId)&&
  !['society-day-','mind-day-','mind-settle-','motivation-day-','experience-day-','cognition-day-','cognition-eval-','survival-day-'].some(p=>dto.commandId.startsWith(p)),'Invalid or reserved scene command ID');
 const p=dto.payload;
 if(dto.type==='PlayerGiftFood'){fields(p,['recipientId']);requireCondition(p.recipientId==='actor-2','Unknown food gift recipient');}
 else if(dto.type==='AdvanceTime'){fields(p,['ticks']);integer(p.ticks,1);requireCondition(p.ticks<=144000,'Advance budget exceeded','LIMIT_EXCEEDED');}
 else if(dto.type==='PlayerTravel'){fields(p,['destination']);requireCondition(['village','forest'].includes(p.destination),'Unknown travel destination');}
 else if(version===4 && dto.type==='PlayerWork')fields(p,[]);
 else if(['PlayerRest','EncounterBegin'].includes(dto.type))fields(p,[]);
 else if(['PlayerBuy','PlayerSell'].includes(dto.type)){fields(p,['product','quantity']);requireCondition(['food','herbs'].includes(p.product),'Unknown product');integer(p.quantity,1);requireCondition(p.quantity<=10,'Trade quantity budget exceeded','LIMIT_EXCEEDED');}
 else if(['EncounterAction','EncounterCancel'].includes(dto.type)){fields(p,dto.type==='EncounterAction'?['encounterId','action']:['encounterId']);identifier(p.encounterId);requireCondition(p.encounterId.length<=64,'Encounter ID budget exceeded');if(dto.type==='EncounterAction')requireCondition(['attack','flee'].includes(p.action),'Unknown encounter action');}
 else requireCondition(false,'Unknown scene intent');
}
function giftParticipants(world){return {
 donor:world.actorModel.actors.find(a=>a.actorId==='actor-4'),
 recipient:world.actorModel.actors.find(a=>a.actorId==='actor-2'),
 player:world.playerModel,estate:world.societyModel.agents.find(a=>a.state.actorId==='actor-2')
};}
export function auditGift(world){
 const {donor,recipient,player,estate}=giftParticipants(world);
 let reasonCode=null;
 if(!donor.alive)reasonCode='PLAYER_DEAD';
 else if(world.encounterModel.encounter?.status==='active')reasonCode='ENCOUNTER_BUSY';
 else if(!recipient.alive)reasonCode='RECIPIENT_DEAD';
 else if(donor.location!=='village'||recipient.location!=='village')reasonCode='NOT_COLOCATED';
 else if(player.inventory.food===0)reasonCode='NO_FOOD';
 else if(estate.state.inventory.food>=1000)reasonCode='RECIPIENT_FULL';
 if(reasonCode===null)requireCondition(player.ledger.foodGiven<Number.MAX_SAFE_INTEGER&&estate.trade.foodReceived<Number.MAX_SAFE_INTEGER,'Gift ledger budget exceeded','LIMIT_EXCEEDED');
 return {outcome:reasonCode===null?'succeeded':'rejected',reasonCode,durationTicks:0};
}
export function commitGift(world,dto,tick,eventSeq){
 const {player,estate}=giftParticipants(world),donorFoodBefore=player.inventory.food,recipientFoodBefore=estate.state.inventory.food;
 player.inventory.food--;player.ledger.foodGiven++;estate.state.inventory.food++;estate.trade.foodReceived++;
 return {type:'FoodGiftCommitted',sourceSystem:'scene',commandId:dto.commandId,entityIds:['actor-4','actor-2'],causationEventSeqs:[],
 payload:{donorId:'actor-4',recipientId:'actor-2',product:'food',quantity:1,location:'village',donorFoodBefore,donorFoodAfter:player.inventory.food,recipientFoodBefore,recipientFoodAfter:estate.state.inventory.food},eventSeq,tick,schemaVersion:1};
}
export function validateSceneGiftEvent(event){
 inspectDescriptorTree(event);fields(event,['schemaVersion','eventSeq','tick','type','sourceSystem','commandId','causationEventSeqs','entityIds','payload']);
 integer(event.eventSeq,1);integer(event.tick);denseArray(event.entityIds,2);denseArray(event.causationEventSeqs,0);
 requireCondition(event.type==='FoodGiftCommitted'&&event.sourceSystem==='scene'&&event.schemaVersion===1,'Invalid gift fact source');identifier(event.commandId);
 requireCondition(canonicalJson(event.entityIds)===canonicalJson(['actor-4','actor-2'])&&event.causationEventSeqs.length===0,'Invalid gift fact identities/causes');
 const p=event.payload;fields(p,['donorId','recipientId','product','quantity','location','donorFoodBefore','donorFoodAfter','recipientFoodBefore','recipientFoodAfter']);
 requireCondition(p.donorId==='actor-4'&&p.recipientId==='actor-2'&&p.product==='food'&&p.quantity===1&&p.location==='village','Invalid gift fact payload');
 for(const key of ['donorFoodBefore','donorFoodAfter','recipientFoodBefore','recipientFoodAfter'])integer(p[key]);
 requireCondition(p.donorFoodBefore>0&&p.donorFoodAfter===p.donorFoodBefore-1&&p.recipientFoodBefore<1000&&p.recipientFoodAfter===p.recipientFoodBefore+1,'Gift fact transfer mismatch');
}
function auditSceneProjection(bundle){
 inspectDescriptorTree(bundle);
 validateBundle(bundle,{rulesVersion:SCENE_RULES,systems:canonicalSystems(SCENE_RULES)});
}
export function describeSceneEncounterActions(bundle){
 auditSceneProjection(bundle);
 return cloneData(hooks().describeActions(bundle));
}
export function describeSceneGiftAvailability(bundle){
 auditSceneProjection(bundle);
 const {outcome,reasonCode}=auditGift(bundle.snapshot.world);
 return {available:outcome==='succeeded',reasonCode};
}
export function executeAuditedSceneIntent(bundle,dto){
 inspectDescriptorTree({bundle,dto});preflightSceneIntent(dto);
 const systems=canonicalSystems(SCENE_RULES);
 validateBundle(bundle,{rulesVersion:SCENE_RULES,systems});
 const result=hooks().executeIntent(bundle,dto);
 return {bundle:createAuditedBundle(result.bundle,{rulesVersion:SCENE_RULES,systems}),receipt:cloneData(result.receipt)};
}
export function executeSceneIntent(bundle,dto){
 const result=executeAuditedSceneIntent(bundle,dto);
 return {bundle:cloneData(result.bundle),receipt:cloneData(result.receipt)};
}
