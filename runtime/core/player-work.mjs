import {fields,integer,requireCondition,cloneData} from './data-contract.mjs';

export const PLAYER_WORK=Object.freeze({wage:20,durationTicks:36,fatigueCost:150,intervalTicks:144,minHealth:300,maxFatigue:700});
const MAX=BigInt(Number.MAX_SAFE_INTEGER);
export function nextPlayerWorkTick(world){return world.playerModel.lastWorkStartTick===null?null:world.playerModel.lastWorkStartTick+PLAYER_WORK.intervalTicks;}
const communalGold=world=>BigInt(world.resources.gold)-world.societyModel.agents.reduce((sum,a)=>sum+BigInt(a.state.wallet),0n)-BigInt(world.playerModel.wallet);
export function auditPlayerWork(world,startTick){
 integer(startTick);requireCondition(world.playerModel.version==='player-state-v4','Work requires player-state-v4','UNSUPPORTED_VERSION');
 const p=world.playerModel,a=world.actorModel.actors.find(a=>a.actorId==='actor-4');let reasonCode=null;
 if(!a.alive)reasonCode='PLAYER_DEAD';
 else if(world.encounterModel.encounter?.status==='active')reasonCode='ENCOUNTER_BUSY';
 else if(a.location!=='village'||a.health<PLAYER_WORK.minHealth||a.fatigue>PLAYER_WORK.maxFatigue||
   (nextPlayerWorkTick(world)!==null&&startTick<nextPlayerWorkTick(world))||communalGold(world)<20n)reasonCode='RULE_REJECTED';
 if(reasonCode===null)requireCondition(BigInt(startTick)+144n<=MAX&&BigInt(p.wallet)+20n<=MAX&&BigInt(p.ledger.wages)+20n<=MAX&&BigInt(p.ledger.workCount)+1n<=MAX,'Player work budget overflow','LIMIT_EXCEEDED');
 return {outcome:reasonCode===null?'succeeded':'rejected',reasonCode,durationTicks:reasonCode===null?36:0,worldCommand:true};
}
export function applyPlayerWork(input,command){
 const {startTick,intent}=command.payload;fields(intent,['type','payload']);fields(intent.payload,[]);requireCondition(intent.type==='PlayerWork','Expected work intent');
 integer(startTick);requireCondition(command.targetTick===startTick+36,'Work completion time mismatch');
 if(auditPlayerWork(input,startTick).outcome!=='succeeded')return {world:cloneData(input),success:false,result:{code:'RULE_REJECTED'}};
 const world=cloneData(input),p=world.playerModel,a=world.actorModel.actors.find(a=>a.actorId==='actor-4'),before={wallet:p.wallet,fatigue:a.fatigue};
 p.wallet+=20;p.ledger.wages+=20;p.ledger.workCount++;p.lastWorkStartTick=startTick;a.fatigue+=150;a.needs={food:a.hunger,healing:1000-a.health,rest:a.fatigue};
 return {world,success:true,result:{actorId:'actor-4',type:'PlayerWork',startTick,endTick:command.targetTick,wage:20,location:a.location,nextWorkTick:startTick+144,before,after:{wallet:p.wallet,fatigue:a.fatigue}}};
}
export function validatePlayerWorkResult(r){
 fields(r,['actorId','type','startTick','endTick','wage','location','nextWorkTick','before','after']);
 requireCondition(r.actorId==='actor-4'&&r.type==='PlayerWork'&&r.wage===20&&r.location==='village','Invalid work result identity/rules');
 for(const key of ['startTick','endTick','nextWorkTick'])integer(r[key]);
 requireCondition(BigInt(r.endTick)===BigInt(r.startTick)+36n&&BigInt(r.nextWorkTick)===BigInt(r.startTick)+144n,'Work result time mismatch');
 for(const v of [r.before,r.after]){fields(v,['wallet','fatigue']);integer(v.wallet);integer(v.fatigue);requireCondition(v.fatigue<=1000,'Work fatigue outside body bounds');}
 requireCondition(BigInt(r.after.wallet)===BigInt(r.before.wallet)+20n&&r.before.fatigue<=700&&r.after.fatigue===r.before.fatigue+150,'Work result transfer mismatch');
}
export const playerWorkFact=(command,result)=>({type:'PlayerWorkCommitted',sourceSystem:'command-engine',commandId:command.commandId,entityIds:['actor-4'],causationEventSeqs:[],payload:cloneData(result)});
