import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='artifacts/d4e7-20261016',label=process.argv[2];assert(/^[a-z-]+$/.test(label));
const hash=x=>createHash('sha256').update(x).digest('hex'),views={},hashes={};
for(const [key,route] of Object.entries({snapshot:'snapshot',player:'player',scene:'scene',encounter:'encounter',activity:'activities'})){
 const r=await fetch(`http://127.0.0.1:18333/api/runtime/${route}`,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);const text=await r.text();views[key]=JSON.parse(text);hashes[key]=hash(text);
}
const s=views.snapshot;assert(Object.values(views).every(v=>v.simulationId===s.simulationId&&v.revision===s.revision&&v.tick===s.tick));
const files={},names=(await readdir(`${out}/world`)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort((a,b)=>Number(a.match(/r(\d+)/)[1])-Number(b.match(/r(\d+)/)[1]));
for(const name of names)files[name]=hash(await readFile(`${out}/world/${name}`));
const commit=JSON.parse(await readFile(`${out}/world/${names.at(-1)}`,'utf8')),w=commit.bundle.snapshot.world,p=w.playerModel;
assert.equal(commit.bundle.snapshot.revision,s.revision);assert.equal(commit.bundle.snapshot.tick,s.tick);
assert.equal(views.player.self.wallet,p.wallet);assert.deepEqual(views.player.self.inventory,p.inventory);
const commands=commit.commands.map(({dto,receipt})=>({type:dto.type,quantity:dto.payload.quantity??null,fromRevision:receipt.fromRevision,toRevision:receipt.toRevision,fromTick:receipt.fromTick,tick:receipt.tick,durationTicks:receipt.durationTicks,outcome:receipt.outcome,amount:receipt.result?.amount??null,unitPrice:receipt.result?.unitPrice??null}));
const playerDaily=commit.bundle.eventLog.filter(e=>e.type==='PlayerDaySettled').map(e=>({tick:e.tick,day:e.payload.day,food:e.payload.privateFood}));
const proof={simulationId:s.simulationId,revision:s.revision,tick:s.tick,hashes,files,player:{wallet:p.wallet,inventory:p.inventory,ledger:p.ledger},commands,playerDaily,actorStates:s.actors,activities:views.activity.entries.map(e=>({activityId:e.activityId,actorIds:e.actorIds,kind:e.kind,status:e.status,tick:e.tick,location:e.location,summary:e.summary}))};
await mkdir(`${out}/private`,{recursive:true});await writeFile(`${out}/private/${label}.json`,JSON.stringify(views));
if(label==='initial'){assert.equal(s.tick,0);assert.equal(commands.length,0);assert.equal(names.length,1);}
if(label==='sold'||label==='bought'){
 const selling=label==='sold',prior=JSON.parse(await readFile(`${out}/${selling?'initial':'sold'}.json`,'utf8')),r=commit.commands.at(-1).receipt;
 assert.equal(commands.length,selling?1:2);assert.equal(s.tick,selling?1:2);assert.equal(r.type,selling?'PlayerSell':'PlayerBuy');assert.equal(r.outcome,'succeeded');assert.equal(r.result.quantity,selling?4:2);
 const {before,after,amount,unitPrice}=r.result,q=selling?4:2,sign=selling?-1:1;assert.equal(amount,q*unitPrice);
 assert.equal(after.wallet,before.wallet-sign*amount);assert.equal(after.inventory.food,before.inventory.food+sign*q);assert.equal(after.publicStock.food,before.publicStock.food-sign*q);assert.equal(after.communalGold,before.communalGold+sign*amount);
 assert.equal(before.wallet,prior.player.wallet);assert.equal(before.inventory.food,prior.player.inventory.food);
 assert.equal(p.wallet,after.wallet);assert.equal(p.inventory.food,after.inventory.food);assert.equal(w.resources.food,after.publicStock.food);
 proof.tradeAssertions={quantity:q,unitPrice,amount,playerWalletDelta:after.wallet-before.wallet,privateFoodDelta:after.inventory.food-before.inventory.food,publicFoodDelta:after.publicStock.food-before.publicStock.food,communalGoldDelta:after.communalGold-before.communalGold};
}
if(['settled','refreshed','reopened'].includes(label)){
 const bought=JSON.parse(await readFile(`${out}/bought.json`,'utf8'));
 assert.equal(s.tick,146);assert.equal(s.revision,146);assert.equal(commands.length,3);assert.equal(commands[2].type,'AdvanceTime');assert.equal(commands[2].outcome,'succeeded');assert.equal(commands[2].durationTicks,144);
 assert.deepEqual(playerDaily,[{tick:144,day:1,food:1}]);assert.equal(p.ledger.foodUsed,1);assert.equal(p.ledger.foodBought,2);assert.equal(p.ledger.spent,bought.tradeAssertions.amount);
 assert.equal(p.ledger.foodSold,4);assert.equal(p.ledger.earned,20);
 assert.equal(p.inventory.food,bought.player.inventory.food-1);assert.equal(p.wallet,bought.player.wallet);
 const entries=views.activity.entries.filter(e=>e.actorIds.includes('actor-4'));assert.equal(entries.filter(e=>e.status==='succeeded').length,3);assert.equal(entries.filter(e=>e.kind==='daily-person').length,1);
 const day=commit.bundle.eventLog.find(e=>e.type==='SocietyDaySettled'&&e.tick===144);assert(day);
 proof.npcDaily=day.payload.actors.rows.filter(row=>row.actorId!=='actor-4').map(row=>({actorId:row.actorId,food:row.food,herbs:row.herbs,restReduction:row.restReduction,opening:row.opening,closing:row.closing}));
 for(const row of proof.npcDaily){const e=views.activity.entries.find(e=>e.kind==='daily-person'&&e.actorIds.includes(row.actorId));assert(e);assert.equal(e.location,row.closing.location);assert(e.summary.includes(`消耗口粮${row.food}份、药材${row.herbs}份`));for(const k of ['health','hunger','fatigue'])assert(e.summary.includes(`${row.opening[k]}→${row.closing[k]}`));}
}
if(process.argv[3])assert.deepEqual(proof,JSON.parse(await readFile(`${out}/${process.argv[3]}.json`,'utf8')));
await writeFile(`${out}/${label}.json`,JSON.stringify(proof,null,2));
console.log(JSON.stringify({label,revision:s.revision,tick:s.tick,player:proof.player,commands,playerDaily,files:names.length,...(proof.tradeAssertions?{tradeAssertions:proof.tradeAssertions}:{})}));
