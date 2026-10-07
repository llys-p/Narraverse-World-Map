import { fields,integer,requireCondition,cloneData } from './data-contract.mjs';

export const PLAYER_RULES='d-player-v1';
export function validatePlayerAllocation(config){
 fields(config,['actorId','initialWallet','initialFood','initialHerbs']);requireCondition(config.actorId==='actor-4','Unknown player identity');
 for(const key of ['initialWallet','initialFood','initialHerbs']){integer(config[key]);requireCondition(config[key]<=1000,'Player initial asset budget exceeded','LIMIT_EXCEEDED');}
}
export function createPlayerState(config){
 validatePlayerAllocation(config);return {version:'player-state-v1',actorId:config.actorId,wallet:config.initialWallet,
 inventory:{food:config.initialFood,herbs:config.initialHerbs},ledger:{foodUsed:0}};
}
export function validatePlayerState(world){
 const p=world.playerModel,c=world.societyModel.config.player;validatePlayerAllocation(c);
 fields(p,['version','actorId','wallet','inventory','ledger']);requireCondition(p.version==='player-state-v1' && p.actorId===c.actorId,'Player identity/version mismatch');
 fields(p.inventory,['food','herbs']);fields(p.ledger,['foodUsed']);for(const n of [p.wallet,p.inventory.food,p.inventory.herbs,p.ledger.foodUsed])integer(n);
 requireCondition(p.wallet===c.initialWallet && p.inventory.herbs===c.initialHerbs && BigInt(p.inventory.food)+BigInt(p.ledger.foodUsed)===BigInt(c.initialFood),'Player assets do not reconcile');
 requireCondition(world.actorModel.actors.some(a=>a.actorId===p.actorId && a.occupation==='player'),'Player body not registered');
}
export function consumePlayerFood(world){
 validatePlayerState(world);const p=world.playerModel,actor=world.actorModel.actors.find(a=>a.actorId===p.actorId),food=actor.alive && p.inventory.food>0?1:0;
 p.inventory.food-=food;p.ledger.foodUsed+=food;return {actorId:p.actorId,privateFood:food,resting:true};
}
export function playerDayFact(world,daily){
 validatePlayerState(world);const p=world.playerModel,row=daily.actors.rows.find(r=>r.actorId===p.actorId);
 requireCondition(row && daily.day===world.actorModel.day,'Missing player daily portion');
 return {type:'PlayerDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:[],
 payload:{day:daily.day,actorId:p.actorId,privateFood:row.food,wallet:p.wallet,inventory:cloneData(p.inventory),ledger:cloneData(p.ledger)}};
}
export function validatePlayerDayPayload(payload){
 fields(payload,['day','actorId','privateFood','wallet','inventory','ledger']);integer(payload.day,1);requireCondition(payload.actorId==='actor-4','Foreign player daily identity');
 integer(payload.privateFood);requireCondition(payload.privateFood<=1,'Invalid player ration');integer(payload.wallet);fields(payload.inventory,['food','herbs']);
 integer(payload.inventory.food);integer(payload.inventory.herbs);fields(payload.ledger,['foodUsed']);integer(payload.ledger.foodUsed);
}
