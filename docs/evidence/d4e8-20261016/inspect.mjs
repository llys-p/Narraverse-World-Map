import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='artifacts/d4e8-20261016',label=process.argv[2];assert(/^[a-z-]+$/.test(label));
const hash=x=>createHash('sha256').update(x).digest('hex'),views={},hashes={};
for(const [key,route] of Object.entries({snapshot:'snapshot',player:'player',scene:'scene',encounter:'encounter',activity:'activities'})){
 const r=await fetch(`http://127.0.0.1:18334/api/runtime/${route}`,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);const text=await r.text();views[key]=JSON.parse(text);hashes[key]=hash(text);
}
const s=views.snapshot;assert(Object.values(views).every(v=>v.simulationId===s.simulationId&&v.revision===s.revision&&v.tick===s.tick));
const files={},names=(await readdir(`${out}/world`)).filter(n=>/^service-commit-r\d+\.json$/.test(n)).sort((a,b)=>Number(a.match(/r(\d+)/)[1])-Number(b.match(/r(\d+)/)[1]));
for(const name of names)files[name]=hash(await readFile(`${out}/world/${name}`));
const commit=JSON.parse(await readFile(`${out}/world/${names.at(-1)}`,'utf8')),w=commit.bundle.snapshot.world,p=w.playerModel;
assert.equal(commit.bundle.snapshot.revision,s.revision);assert.equal(commit.bundle.snapshot.tick,s.tick);assert.equal(views.player.self.wallet,p.wallet);assert.deepEqual(views.player.self.inventory,p.inventory);
const commands=commit.commands.map(({dto,receipt})=>({type:dto.type,quantity:dto.payload.quantity,fromRevision:receipt.fromRevision,toRevision:receipt.toRevision,tick:receipt.tick,outcome:receipt.outcome,amount:receipt.result?.amount,unitPrice:receipt.result?.unitPrice}));
const trades=commit.commands.map(({dto,receipt:r},index)=>{
 const {before,after,amount,unitPrice,quantity}=r.result,sign=dto.type==='PlayerSell'?-1:1;
 assert.equal(r.outcome,'succeeded');assert.equal(r.tick,index+1);assert.equal(amount,quantity*unitPrice);
 assert.equal(after.wallet,before.wallet-sign*amount);assert.equal(after.inventory.food,before.inventory.food+sign*quantity);assert.equal(after.publicStock.food,before.publicStock.food-sign*quantity);assert.equal(after.communalGold,before.communalGold+sign*amount);
 return {type:dto.type,quantity,unitPrice,amount,playerWalletDelta:after.wallet-before.wallet,privateFoodDelta:after.inventory.food-before.inventory.food,publicFoodDelta:after.publicStock.food-before.publicStock.food,communalGoldDelta:after.communalGold-before.communalGold};
});
assert.equal(p.ledger.foodUsed,0);assert.equal(commit.bundle.eventLog.filter(e=>e.type==='PlayerDaySettled').length,0);
const proof={simulationId:s.simulationId,revision:s.revision,tick:s.tick,hashes,files,player:{wallet:p.wallet,inventory:p.inventory,ledger:p.ledger},commands,trades,activities:views.activity.entries.map(e=>({activityId:e.activityId,actorIds:e.actorIds,status:e.status,summary:e.summary}))};
if(['initial','after-inputs'].includes(label)){assert.equal(s.tick,0);assert.equal(commands.length,0);assert.equal(names.length,1);assert.equal(p.wallet,0);assert.equal(p.inventory.food,20);}
if(label==='sold'){assert.equal(s.tick,1);assert.equal(commands.length,1);assert.equal(commands[0].type,'PlayerSell');assert.equal(commands[0].quantity,4);assert.equal(p.wallet,20);assert.equal(p.inventory.food,16);}
if(['bought','refreshed','reopened'].includes(label)){assert.equal(s.tick,2);assert.equal(commands.length,2);assert.equal(commands[1].type,'PlayerBuy');assert.equal(commands[1].quantity,2);assert.equal(p.wallet,0);assert.equal(p.inventory.food,18);assert.equal(p.ledger.earned,20);assert.equal(p.ledger.spent,20);assert.equal(views.activity.entries.length,2);}
if(process.argv[3])assert.deepEqual(proof,JSON.parse(await readFile(`${out}/${process.argv[3]}.json`,'utf8')));
await writeFile(`${out}/${label}.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify({label,revision:s.revision,player:proof.player,commands,files:names.length}));
