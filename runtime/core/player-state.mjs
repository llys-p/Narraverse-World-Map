import { fields,integer,requireCondition,cloneData,record,identifier,canonicalJson } from './data-contract.mjs';

export const PLAYER_RULES='d-player-v1';
export const PLAY_RULES='d-player-v2';
const PLAY_LEDGER=['foodUsed','herbsUsed','foodBought','herbsBought','foodSold','herbsSold','spent','earned'];
export function playerIntentDuration(intent){
 fields(intent,['commandId','type','payload']);identifier(intent.commandId);requireCondition(!intent.commandId.startsWith('society-day-'),'Reserved NPC command ID');
 if(intent.type==='PlayerTravel'){fields(intent.payload,['destination']);requireCondition(['village','forest'].includes(intent.payload.destination),'Unknown destination');return 12;}
 if(intent.type==='PlayerRest'){fields(intent.payload,[]);return 6;}
 requireCondition(['PlayerBuy','PlayerSell'].includes(intent.type),'Unknown player intent');fields(intent.payload,['product','quantity']);
 requireCondition(['food','herbs'].includes(intent.payload.product),'Unknown player product');integer(intent.payload.quantity,1);requireCondition(intent.payload.quantity<=10,'Quantity exceeds action budget');return 1;
}
const commonGold=w=>w.resources.gold-w.societyModel.agents.reduce((n,a)=>n+a.state.wallet,0)-w.playerModel.wallet;
const prices=w=>Object.fromEntries(['food','herbs'].map(id=>[id,{buy:w.marketModel.prices[id],sell:Math.max(1,Math.floor(w.marketModel.prices[id]/2))}]));
export function canPlayerIntent(w,intent){
 playerIntentDuration(intent);const a=w.actorModel.actors[3],p=w.playerModel,{type,payload}=intent;
 if(!a.alive)return false;if(type==='PlayerTravel')return payload.destination!==a.location;
 if(type==='PlayerRest')return true;if(a.location!=='village')return false;
 const {product:id,quantity:q}=payload,quote=prices(w)[id],amount=BigInt(q)*BigInt(type==='PlayerBuy'?quote.buy:quote.sell);
 return type==='PlayerBuy'?w.resources[id]>=q && BigInt(p.wallet)>=amount && p.inventory[id]<=1000-q:
 p.inventory[id]>=q && w.resources[id]<=w.resourceModel.config.resources[id].capacity-q && BigInt(commonGold(w))>=amount;
}
const actionView=w=>({location:w.actorModel.actors[3].location,fatigue:w.actorModel.actors[3].fatigue,wallet:w.playerModel.wallet,
 inventory:cloneData(w.playerModel.inventory),publicStock:{food:w.resources.food,herbs:w.resources.herbs},communalGold:commonGold(w)});
export function applyPlayerAction(input,command){
 const {startTick,intent}=command.payload,duration=playerIntentDuration({commandId:command.commandId,...intent});integer(startTick);
 requireCondition(command.targetTick===startTick+duration,'Player action duration mismatch');
 if(!canPlayerIntent(input,{commandId:command.commandId,...intent}))return {world:cloneData(input),success:false,result:{code:'RULE_REJECTED'}};
 const world=cloneData(input),p=world.playerModel,a=world.actorModel.actors[3],before=actionView(world);let product=null,quantity=0,unitPrice=0,amount=0;
 if(intent.type==='PlayerTravel'){a.location=intent.payload.destination;a.fatigue=Math.min(1000,a.fatigue+100);}
 else if(intent.type==='PlayerRest')a.fatigue=Math.max(0,a.fatigue-100);
 else{
  ({product,quantity}=intent.payload);const buy=intent.type==='PlayerBuy';unitPrice=prices(world)[product][buy?'buy':'sell'];amount=quantity*unitPrice;
  integer(amount);const wallet=BigInt(p.wallet)+(buy?-BigInt(amount):BigInt(amount));requireCondition(wallet<=BigInt(Number.MAX_SAFE_INTEGER),'Player wallet overflow','LIMIT_EXCEEDED');
  p.wallet=Number(wallet);p.inventory[product]+=buy?quantity:-quantity;world.resources[product]+=buy?-quantity:quantity;
  const key=product+(buy?'Bought':'Sold'),cash=buy?'spent':'earned',flow=buy?'outflow':'inflow';
  for(const [obj,k,n] of [[p.ledger,key,quantity],[p.ledger,cash,amount],[world.resourceModel.ledger[product],flow,quantity]]){
   requireCondition(obj[k]<=Number.MAX_SAFE_INTEGER-n,'Player ledger overflow','LIMIT_EXCEEDED');obj[k]+=n;
  }
 }
 a.needs={food:a.hunger,healing:1000-a.health,rest:a.fatigue};
 return {world,success:true,result:{actorId:'actor-4',type:intent.type,startTick,endTick:command.targetTick,product,quantity,unitPrice,amount,before,after:actionView(world)}};
}
export function validatePlayerActionResult(r){
  fields(r,['actorId','type','startTick','endTick','product','quantity','unitPrice','amount','before','after']);requireCondition(r.actorId==='actor-4','Foreign player action identity');
 record(r.after);
 integer(r.startTick);integer(r.endTick);for(const n of [r.quantity,r.unitPrice,r.amount])integer(n);
 const payload=r.type==='PlayerTravel'?{destination:r.after.location}:r.type==='PlayerRest'?{}:{product:r.product,quantity:r.quantity};
 requireCondition(r.endTick===r.startTick+playerIntentDuration({commandId:'validated',type:r.type,payload}),'Committed action duration mismatch');
 for(const v of [r.before,r.after]){fields(v,['location','fatigue','wallet','inventory','publicStock','communalGold']);requireCondition(['village','forest'].includes(v.location),'Unknown action location');
  for(const n of [v.fatigue,v.wallet,v.communalGold])integer(n);requireCondition(v.fatigue<=1000,'Invalid action fatigue');for(const bag of [v.inventory,v.publicStock]){fields(bag,['food','herbs']);integer(bag.food);integer(bag.herbs);}}
 if(['PlayerTravel','PlayerRest'].includes(r.type))requireCondition(r.product===null && r.quantity===0 && r.unitPrice===0 && r.amount===0,'Movement has trade quantity');
 else requireCondition(r.unitPrice>0 && BigInt(r.amount)===BigInt(r.quantity)*BigInt(r.unitPrice),'Action cash/quote mismatch');
}
export const playerActionFact=(c,r)=>({type:'PlayerActionCommitted',sourceSystem:'command-engine',commandId:c.commandId,entityIds:['actor-4'],causationEventSeqs:[],payload:cloneData(r)});
export function validatePlayerAllocation(config){
 fields(config,['actorId','initialWallet','initialFood','initialHerbs']);requireCondition(config.actorId==='actor-4','Unknown player identity');
 for(const key of ['initialWallet','initialFood','initialHerbs']){integer(config[key]);requireCondition(config[key]<=1000,'Player initial asset budget exceeded','LIMIT_EXCEEDED');}
}
export function createPlayerState(config){
 validatePlayerAllocation(config);return {version:'player-state-v1',actorId:config.actorId,wallet:config.initialWallet,
 inventory:{food:config.initialFood,herbs:config.initialHerbs},ledger:{foodUsed:0}};
}
export function createPlayerPlayState(config){const p=createPlayerState(config);p.version='player-state-v2';p.ledger=Object.fromEntries(PLAY_LEDGER.map(k=>[k,0]));return p;}
export function validatePlayerState(world){
 const p=world.playerModel,c=world.societyModel.config.player;validatePlayerAllocation(c);
 // D3-5A: society-config-v4 carries the same play profile forward (player-state-v2), so the
 // identity/version gate accepts it too; v1/v2/v3 keep their exact old meanings.
 const play=['society-config-v3','society-config-v4'].includes(world.societyModel.config.version);
 fields(p,['version','actorId','wallet','inventory','ledger']);requireCondition(p.version===(play?'player-state-v2':'player-state-v1') && p.actorId===c.actorId,'Player identity/version mismatch');
 fields(p.inventory,['food','herbs']);fields(p.ledger,play?PLAY_LEDGER:['foodUsed']);for(const n of [p.wallet,...Object.values(p.inventory),...Object.values(p.ledger)])integer(n);
 if(play){requireCondition(p.inventory.food<=1000 && p.inventory.herbs<=1000 && p.ledger.herbsUsed===0,'Player inventory/use outside contract');
  requireCondition(BigInt(p.wallet)===BigInt(c.initialWallet)-BigInt(p.ledger.spent)+BigInt(p.ledger.earned),'Player currency ledger mismatch');
  for(const id of ['food','herbs'])requireCondition(BigInt(p.inventory[id])===BigInt(c[id==='food'?'initialFood':'initialHerbs'])+BigInt(p.ledger[id+'Bought'])-BigInt(p.ledger[id+'Sold'])-BigInt(p.ledger[id+'Used']),'Player item ledger mismatch');
 }else requireCondition(p.wallet===c.initialWallet && p.inventory.herbs===c.initialHerbs && BigInt(p.inventory.food)+BigInt(p.ledger.foodUsed)===BigInt(c.initialFood),'Player assets do not reconcile');
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
 integer(payload.inventory.food);integer(payload.inventory.herbs);record(payload.ledger);fields(payload.ledger,Object.hasOwn(payload.ledger,'spent')?PLAY_LEDGER:['foodUsed']);Object.values(payload.ledger).forEach(n=>integer(n));
}
