import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PLAY_RULES,defaultPlayerPlayConfig,executePlayerIntent,enqueuePlayerIntent,describePlayerActions } from '../../runtime/core/player-intents.mjs';
import { createPlayerPlayVillage,playerPlaySystems } from '../../runtime/fixtures/player-play-village.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { buildPlayerKnowledge } from '../../runtime/knowledge/player-knowledge.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const bad=e=>['INVALID_INPUT','UNSUPPORTED_VERSION','RULE_REJECTED','LIMIT_EXCEEDED'].includes(e.code);
const intent=(commandId,type,payload={})=>({commandId,type,payload});
const body=b=>b.snapshot.world.actorModel.actors.find(a=>a.actorId==='actor-4');
const advance=(b,n)=>{const s=createSimulationSession(b,playerPlaySystems());s.advanceTicks(n);return s.getBundle();};
const treasury=w=>BigInt(w.resources.gold)-BigInt(w.playerModel.wallet)-w.societyModel.agents.reduce((n,a)=>n+BigInt(a.state.wallet),0n);
function fixture(c=defaultPlayerPlayConfig()){return createPlayerPlayVillage(42,'player-play-village',c).bundle;}
function quiet(c){const r=c.society.actors.market.ecology.resources;r.resources.food.production.numerator=0;r.resources.herbs.production.numerator=0;
  r.resources.food.lossPermille=0;r.resources.herbs.lossPermille=0;r.populations.deer=0;r.populations.wolves=0;return r;}
function dying(food=0){const c=defaultPlayerPlayConfig();quiet(c);c.society.player.initialFood=food;c.society.actors.initialActors[3].health=1;
  c.society.actors.initialActors[3].hunger=1000;c.society.estates.forEach(e=>e.initialFood=20);return c;}
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-play-independent-'),d=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(d)&&d.startsWith(prefix));await fs.rm(d,{recursive:true,force:true});});return d;}
function audit(b){validateBundle(b,{rulesVersion:PLAY_RULES,systems:playerPlaySystems()});}

test('D2C independent travel/rest: completion alone moves the same body, 24 roundtrip ticks, actual +100 and -100 without healing',()=>{
  const c=defaultPlayerPlayConfig();c.society.actors.initialActors[3].health=650;const initial=fixture(c),before=structuredClone(initial);
  assert.equal(PLAY_RULES,'d-player-v2');assert.equal(c.version,'memory-config-v4');assert.equal(c.society.version,'society-config-v3');
  const pending=enqueuePlayerIntent(initial,intent('out','PlayerTravel',{destination:'forest'}));
  assert.equal(pending.durationTicks,12);assert.equal(pending.bundle.snapshot.tick,0);assert.equal(body(pending.bundle).location,'village');
  const mid=advance(pending.bundle,11);assert.equal(body(mid).location,'village');assert.equal(body(mid).fatigue,0);
  const out=advance(mid,1);assert.equal(out.snapshot.tick,12);assert.equal(body(out).location,'forest');assert.equal(body(out).fatigue,100);
  const home=executePlayerIntent(out,intent('home','PlayerTravel',{destination:'village'}));
  assert.equal(home.outcome,'succeeded');assert.equal(home.bundle.snapshot.tick,24);assert.equal(body(home.bundle).fatigue,200);
  const resting=executePlayerIntent(home.bundle,intent('rest','PlayerRest'));assert.equal(resting.durationTicks,6);
  assert.equal(resting.bundle.snapshot.tick,30);assert.equal(body(resting.bundle).fatigue,100);assert.equal(body(resting.bundle).health,650);
  const second=executePlayerIntent(resting.bundle,intent('rest-again','PlayerRest'));assert.equal(body(second.bundle).fatigue,0);
  assert.equal(body(second.bundle).lastNeedsTick,0);assert.deepEqual(initial,before);audit(second.bundle);
});

test('D2C independent exact midnight: completed travel +100 and passive daily -200 are separate real effects',()=>{
  const c=defaultPlayerPlayConfig();c.society.actors.initialActors[3].fatigue=350;const start=advance(fixture(c),132);
  const r=executePlayerIntent(start,intent('midnight-travel','PlayerTravel',{destination:'forest'}));
  assert.equal(r.result.before.fatigue,350);assert.equal(r.result.after.fatigue,450);assert.equal(r.result.startTick,132);assert.equal(r.result.endTick,144);
  assert.equal(body(r.bundle).fatigue,250);assert.equal(body(r.bundle).lastNeedsTick,144);
  const events=r.bundle.eventLog,action=events.find(e=>e.commandId==='midnight-travel'),daily=events.find(e=>e.type==='SocietyDaySettled');
  assert.equal(action.type,'PlayerActionCommitted');assert.equal(action.tick,144);assert.ok(action.eventSeq<daily.eventSeq);
  assert.equal(daily.payload.actors.rows.find(a=>a.actorId==='actor-4').restReduction,200);
});

test('D2C independent midnight purchase: last private ration is bought before consumption, pays exactly posted10 and prevents death',()=>{
  const start=advance(fixture(dying()),143),old=structuredClone(start),r=executePlayerIntent(start,intent('lifesaving-food','PlayerBuy',{product:'food',quantity:1}));
  assert.equal(r.outcome,'succeeded');assert.equal(r.durationTicks,1);assert.equal(r.result.unitPrice,10);assert.equal(r.result.amount,10);
  assert.equal(r.result.after.publicStock.food,r.result.before.publicStock.food-1);assert.equal(r.result.after.inventory.food,1);
  const w=r.bundle.snapshot.world;assert.equal(w.playerModel.inventory.food,0);assert.equal(w.playerModel.wallet,90);assert.equal(body(r.bundle).alive,true);
  assert.equal(body(r.bundle).health,1);assert.equal(body(r.bundle).hunger,900);assert.deepEqual(start,old);
  const row=r.bundle.eventLog.find(e=>e.type==='SocietyDaySettled').payload.actors.rows.find(a=>a.actorId==='actor-4');assert.equal(row.food,1);
});

test('D2C independent midnight sale: selling final ration completes at5 then actual death seals proceeds and assets',()=>{
  const start=advance(fixture(dying(1)),143),r=executePlayerIntent(start,intent('last-ration','PlayerSell',{product:'food',quantity:1}));
  assert.equal(r.outcome,'succeeded');assert.equal(r.result.unitPrice,5);assert.equal(r.result.amount,5);
  assert.equal(r.result.after.publicStock.food,r.result.before.publicStock.food+1);assert.equal(r.result.after.inventory.food,0);
  assert.equal(body(r.bundle).alive,false);assert.equal(body(r.bundle).deathTick,144);assert.equal(r.bundle.snapshot.world.playerModel.wallet,105);
  const later=advance(r.bundle,144);assert.deepEqual(later.snapshot.world.playerModel,r.bundle.snapshot.world.playerModel);
  assert.equal(body(later).location,'village');
});

test('D2C independent earlier midnight death: valid travel consumes12 ticks, rejects at155, never moves or creates success fact',()=>{
  const start=advance(fixture(dying()),143),r=executePlayerIntent(start,intent('fatal-travel','PlayerTravel',{destination:'forest'}));
  assert.equal(r.durationTicks,12);assert.equal(r.bundle.snapshot.tick,155);assert.equal(r.outcome,'rejected');assert.deepEqual(r.result,{code:'RULE_REJECTED'});
  assert.equal(body(r.bundle).deathTick,144);assert.equal(body(r.bundle).location,'village');assert.equal(body(r.bundle).fatigue,0);
  assert.equal(r.bundle.snapshot.commandReceipts['fatal-travel'].status,'rejected');
  assert.equal(r.bundle.eventLog.some(e=>e.type==='PlayerActionCommitted'&&e.commandId==='fatal-travel'),false);
  assert.equal(r.bundle.snapshot.world.playerModel.wallet,100);audit(r.bundle);
});

test('D2C independent last medicine: player completion precedes NPC plans, only one physical warehouse item changes owner',()=>{
  const c=defaultPlayerPlayConfig();c.society.estates.forEach(e=>{e.initialHerbs=0;e.initialFood=20;e.initialWallet=0;});
  c.society.estates[1].initialWallet=100;c.society.actors.initialActors[1].health=500;
  c.society.actors.market.ecology.resources.resources.herbs.initial=2;c.society.actors.market.ecology.resources.resources.herbs.production.numerator=0;
  const r=executePlayerIntent(advance(fixture(c),143),intent('last-medicine','PlayerBuy',{product:'herbs',quantity:1}));
  assert.equal(r.result.unitPrice,50);assert.equal(r.result.after.publicStock.herbs,0);assert.equal(r.bundle.snapshot.world.playerModel.inventory.herbs,2);
  const receipts=Object.values(r.bundle.snapshot.commandReceipts);assert.equal(receipts.some(x=>x.status==='succeeded'&&x.input.type==='SocietyAction'&&x.input.payload.action==='BuyMedicine'),false);
  assert.equal(r.bundle.snapshot.world.societyModel.agents[1].state.inventory.herbs,0);audit(r.bundle);
});

test('D2C independent last common coins: player sale uses25 and subsequent NPC wages cannot spend another owners100',()=>{
  const c=defaultPlayerPlayConfig();c.society.estates.forEach(e=>{e.initialWallet=0;e.initialFood=20;});
  c.society.actors.initialActors[0].health=500;c.society.actors.initialActors[1].health=500;
  c.society.actors.market.ecology.resources.resources.gold.initial=125;
  const r=executePlayerIntent(advance(fixture(c),143),intent('last-common-coins','PlayerSell',{product:'herbs',quantity:1})),w=r.bundle.snapshot.world;
  assert.equal(r.result.unitPrice,25);assert.equal(r.result.after.communalGold,0);assert.equal(w.playerModel.wallet,125);
  assert.equal(w.resources.gold,125);assert.equal(w.societyModel.agents.reduce((n,a)=>n+a.state.ledger.wages,0),0);assert.equal(treasury(w),0n);
});

test('D2C independent true buy/sell balances: no-day roundtrip moves goods, records inflow/outflow and never mints total currency',()=>{
  const initial=fixture(),old=initial.snapshot.world,bought=executePlayerIntent(initial,intent('buy-two','PlayerBuy',{product:'food',quantity:2}));
  const sold=executePlayerIntent(bought.bundle,intent('sell-two','PlayerSell',{product:'food',quantity:2})),w=sold.bundle.snapshot.world;
  assert.equal(bought.result.amount,20);assert.equal(sold.result.amount,10);assert.equal(w.playerModel.wallet,90);assert.equal(w.resources.gold,old.resources.gold);
  assert.deepEqual(w.playerModel.inventory,old.playerModel.inventory);assert.equal(w.resources.food,old.resources.food);
  assert.equal(w.resourceModel.ledger.food.outflow-old.resourceModel.ledger.food.outflow,2);assert.equal(w.resourceModel.ledger.food.inflow-old.resourceModel.ledger.food.inflow,2);
  assert.equal(treasury(w)-treasury(old),10n);
  for(const id of ['food','herbs']){
    const stock=v=>BigInt(v.resources[id])+BigInt(v.playerModel.inventory[id])+v.societyModel.agents.reduce((n,a)=>n+BigInt(a.state.inventory[id]),0n);
    assert.equal(stock(w),stock(old));
  }
  assert.deepEqual(Object.keys(sold.result).sort(),['actorId','after','amount','before','endTick','product','quantity','startTick','type','unitPrice']);
  assert.equal(sold.bundle.snapshot.commandReceipts['sell-two'].inputSeq,2);audit(sold.bundle);
});

test('D2C independent entry failures are pure: village-only trade, no future NPC repayment, exact fields/quantities/namespace',()=>{
  const c=defaultPlayerPlayConfig();c.society.estates.forEach(e=>e.initialWallet=0);c.society.estates[1].initialWallet=100;
  c.society.actors.market.ecology.resources.resources.gold.initial=200;const b=advance(fixture(c),143),old=structuredClone(b);
  assert.equal(treasury(b.snapshot.world),0n);assert.throws(()=>executePlayerIntent(b,intent('future-money','PlayerSell',{product:'herbs',quantity:1})),e=>e.code==='RULE_REJECTED');
  for(const d of [intent('same','PlayerTravel',{destination:'village'}),intent('society-day-1-actor-1','PlayerRest'),
    intent('fraction','PlayerBuy',{product:'food',quantity:1.5}),intent('eleven','PlayerBuy',{product:'food',quantity:11}),
    intent('price','PlayerBuy',{product:'food',quantity:1,price:1}),{...intent('forged','PlayerRest'),actorId:'actor-1'},intent('time','PlayerRest',{ticks:0})]){
    assert.throws(()=>executePlayerIntent(b,d),bad);assert.deepEqual(b,old);
  }
  const forest=executePlayerIntent(fixture(),intent('out','PlayerTravel',{destination:'forest'})).bundle;
  assert.throws(()=>executePlayerIntent(forest,intent('forest-buy','PlayerBuy',{product:'food',quantity:1})),e=>e.code==='RULE_REJECTED');
  assert.equal(describePlayerActions(forest).canTrade,false);
});

test('D2C independent forest observer: only own daily/action sources; same-day village requests and market remain unseen',()=>{
  const c=defaultPlayerPlayConfig();c.society.actors.initialActors[1].health=500;const out=executePlayerIntent(fixture(c),intent('to-forest','PlayerTravel',{destination:'forest'})).bundle;
  const b=advance(out,132),observed=b.snapshot.world.memoryModel.observer,player=observed.actors.find(a=>a.actorId==='actor-4');
  assert.equal(observed.version,'memory-observer-v2');assert.ok(b.eventLog.some(e=>e.type==='MedicalRequestAnnounced'));
  assert.equal(player.memories.some(m=>m.occurrenceTick===144&&m.channel==='public'),false);
  assert.ok(player.memories.some(m=>m.channel==='self'&&m.sourceEventSeq===b.eventLog.find(e=>e.type==='PlayerDaySettled').eventSeq));
  assert.ok(player.memories.some(m=>m.sourceEventSeq===b.eventLog.find(e=>e.commandId==='to-forest').eventSeq));
  for(const npc of observed.actors.filter(a=>a.actorId!=='actor-4'))assert.equal(npc.memories.some(m=>m.sourceEventSeq===b.eventLog.find(e=>e.commandId==='to-forest').eventSeq),false);
  const known=buildPlayerKnowledge(b);assert.equal(known.self.identity.location,'forest');assert.equal(JSON.stringify(known).includes('currentGoal'),false);audit(b);
});

test('D2C independent genuine in-flight checkpoint: dynamic post-NPC registration resumes exactly and consumes no early effect',async t=>{
  const dir=await temporary(t),start=advance(fixture(),145),cmd=intent('after-npc','PlayerTravel',{destination:'forest'}),queued=enqueuePlayerIntent(start,cmd);
  assert.equal(queued.bundle.snapshot.tick,145);assert.equal(body(queued.bundle).location,'village');assert.equal(queued.bundle.snapshot.pendingCommands.length,1);
  const halfway=advance(queued.bundle,6),options={rulesVersion:PLAY_RULES,systems:playerPlaySystems()};
  const file=await saveCheckpoint(halfway,{directory:dir,...options}),restored=await loadCheckpoint(file,options),finished=advance(restored,6);
  assert.deepEqual(finished,executePlayerIntent(start,cmd).bundle);assert.equal(finished.snapshot.tick,157);
  const entries=Object.values(finished.snapshot.commandReceipts).sort((a,b)=>a.inputSeq-b.inputSeq);
  assert.deepEqual(entries.map(x=>x.inputSeq),Array.from({length:entries.length},(_,i)=>i+1));
  const at143=advance(fixture(),143),pending=enqueuePlayerIntent(at143,intent('rest-cross-day','PlayerRest'));
  const file2=await saveCheckpoint(advance(pending.bundle,1),{directory:dir,...options});
  assert.deepEqual(advance(await loadCheckpoint(file2,options),5),executePlayerIntent(at143,intent('rest-cross-day','PlayerRest')).bundle);
});

test('D2C independent replay/legacy: edited start/end/price/count/location/core receipt rejected and old profiles never accept play',()=>{
  const good=executePlayerIntent(fixture(),intent('purchase','PlayerBuy',{product:'food',quantity:1})).bundle;
  for(const mutate of [b=>b.snapshot.commandReceipts.purchase.result.unitPrice++,b=>b.snapshot.commandReceipts.purchase.result.quantity++,
    b=>b.snapshot.commandReceipts.purchase.result.startTick++,b=>b.snapshot.commandReceipts.purchase.result.endTick++,
    b=>b.snapshot.commandReceipts.purchase.input.payload.startTick++,b=>body(b).location='forest',
    b=>b.eventLog.find(e=>e.commandId==='purchase').payload.amount++]){
    const corrupt=structuredClone(good);mutate(corrupt);assert.throws(()=>audit(corrupt),bad);
  }
  for(const old of [createPlayerVillage(),createPersonalityNeutral()]){
    const before=structuredClone(old.bundle);assert.throws(()=>executePlayerIntent(old.bundle,intent('legacy-rest','PlayerRest')),e=>e.code==='UNSUPPORTED_VERSION');
    assert.deepEqual(old.bundle,before);assert.equal(old.bundle.snapshot.world.memoryModel.observer.version,'memory-observer-v1');
  }
});
