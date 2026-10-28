import {fields,requireCondition,cloneData} from './data-contract.mjs';
import {FOREST_COMMAND,FOREST_ACTIONS,validForestPayload,validForestState,forestDuration} from '../../runtime-forest-contract.mjs';
export const FOREST_SITE=Object.freeze({x:16,y:7});
export const createForestModel=()=>({version:'forest-v1',branchesRemaining:3,firewood:0,harvested:0,campfires:0,trail:'unseen'});
const state=w=>{const {version,...s}=w.mapModel.forestModel;return cloneData(s);};
const effect=w=>({fatigue:w.actorModel.actors[3].fatigue,condition:w.mapModel.socialModel.asset.condition,forest:state(w)});
const near=w=>Math.max(Math.abs(w.mapModel.position.x-16),Math.abs(w.mapModel.position.y-7))<=1;
export function validateForestModel(f){fields(f,['version','branchesRemaining','firewood','harvested','campfires','trail']);const {version,...s}=f;requireCondition(version==='forest-v1'&&validForestState(s),'Invalid finite forest supplies');}
export function auditForest(world,dto){
 if(dto.type!==FOREST_COMMAND)return null;
 requireCondition(world.mapModel.forestModel?.version==='forest-v1','Forest actions require a new forest world','COMMAND_UNSUPPORTED');
 requireCondition(validForestPayload(dto.payload),'Invalid forest action');
 const {action}=dto.payload,p=world.actorModel.actors[3],f=world.mapModel.forestModel,tool=world.mapModel.socialModel.asset;let code=null;
 if(!p.alive)code='PLAYER_DEAD';
 else if(world.encounterModel.encounter?.status==='active')code='ENCOUNTER_BUSY';
 else if(world.mapModel.order?.status==='marching')code='RULE_REJECTED';
 else if(p.location!=='forest'||!near(world))code='NOT_COLOCATED';
 else if(action==='collect'){
  if(!f.branchesRemaining)code='FOREST_DEPLETED';else if(tool.holderId!=='actor-4')code='NOT_HELD';else if(tool.condition<40)code='ASSET_UNAVAILABLE';else if(p.fatigue>900)code='RULE_REJECTED';
 }else if(action==='camp'){
  if(!f.firewood)code='NO_FIREWOOD';else if(!p.fatigue)code='NOT_TIRED';
 }else if(action==='observe'&&f.trail==='observed'||action==='avoid'&&!['unseen','observed'].includes(f.trail))code='RULE_REJECTED';
 return {outcome:code?'rejected':'succeeded',reasonCode:code,durationTicks:code?0:forestDuration(action),worldCommand:true,directTicks:true,directCommand:true};
}
export function commitForest(world,dto){
 const before=effect(world),f=world.mapModel.forestModel,p=world.actorModel.actors[3],tool=world.mapModel.socialModel.asset,{action}=dto.payload;
 if(action==='collect'){f.branchesRemaining--;f.harvested++;f.firewood++;tool.condition-=10;p.fatigue+=25;}
 if(action==='camp'){f.firewood--;f.campfires++;p.fatigue=Math.max(0,p.fatigue-200);}
 if(action==='observe')f.trail='observed';if(action==='avoid')f.trail='avoided';
 p.needs={food:p.hunger,healing:1000-p.health,rest:p.fatigue};
 return {action,before,after:effect(world)};
}
export function forestCanBegin(world){return !world.mapModel.forestModel||near(world)&&world.mapModel.forestModel.trail==='observed';}
// The finite journal must always leave one command for the existing free exit.
export function requireForestBudget(type,remaining,world){
 if(!world.mapModel.forestModel)return;
 if(type==='EncounterBegin')requireCondition(remaining>=2,'Encounter requires a reserved exit command','LIMIT_EXCEEDED');
 if(world.encounterModel.encounter?.status==='active'&&type!=='EncounterCancel')requireCondition(remaining>=2,'Last command is reserved for ending the encounter','LIMIT_EXCEEDED');
}
export function observeForestCommand(world,events){
 if(!world.mapModel.forestModel)return;const fact=events.at(-1);if(fact?.type!=='EncounterCommandResolved'||fact.payload.receipt.outcome!=='succeeded')return;
 if(fact.payload.dto.type==='EncounterBegin')world.mapModel.forestModel.trail='engaged';
 if(['EncounterAction','EncounterCancel'].includes(fact.payload.dto.type)&&world.encounterModel.encounter?.status==='closed')world.mapModel.forestModel.trail='resolved';
}
export function finishForestTick(world){if(world.mapModel.forestModel?.trail==='engaged'&&world.encounterModel.encounter?.status==='closed')world.mapModel.forestModel.trail='resolved';}
export function forestView(world){return world.actorModel.actors[3].location!=='forest'?null:{version:1,site:{...FOREST_SITE},state:state(world),actions:FOREST_ACTIONS.map(action=>{const p=auditForest(world,{type:FOREST_COMMAND,payload:{action}});return {action,available:p.outcome==='succeeded',reasonCode:p.reasonCode};})};}
