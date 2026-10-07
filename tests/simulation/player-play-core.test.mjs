import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_RULES,defaultPlayerPlayConfig,executePlayerIntent,enqueuePlayerIntent,describePlayerActions } from '../../runtime/core/player-intents.mjs';
import { createPlayerPlayVillage,playerPlaySystems } from '../../runtime/fixtures/player-play-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { buildPlayerKnowledge } from '../../runtime/knowledge/player-knowledge.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {saveCheckpoint,loadCheckpoint} from '../../runtime/persistence/checkpoint-store.mjs';
const intent=(commandId,type,payload={})=>({commandId,type,payload});
const advance=(b,ticks)=>{const s=createSimulationSession(b,playerPlaySystems());s.advanceTicks(ticks);return s.getBundle();};
test('D2C travels both ways and rests via real inputs, effects and own persistent receipts',()=>{
 let b=createPlayerPlayVillage().bundle;const original=structuredClone(b);
 const a=executePlayerIntent(b,intent('go','PlayerTravel',{destination:'forest'}));assert.deepEqual(b,original);
 assert.equal(a.durationTicks,12);assert.equal(a.outcome,'succeeded');assert.equal(a.bundle.snapshot.world.actorModel.actors[3].location,'forest');
 assert.equal(a.result.after.fatigue,100);assert.equal(a.result.before.fatigue,0);
 const r=executePlayerIntent(a.bundle,intent('rest','PlayerRest'));assert.equal(r.bundle.snapshot.tick,18);assert.equal(r.result.after.fatigue,0);
 const back=executePlayerIntent(r.bundle,intent('back','PlayerTravel',{destination:'village'}));assert.equal(back.bundle.snapshot.tick,30);assert.equal(back.result.after.fatigue,100);
 assert.equal(buildPlayerKnowledge(back.bundle).self.health,1000);assert.equal(back.bundle.eventLog.filter(e=>e.type==='PlayerActionCommitted').length,3);
 assert.equal(back.bundle.snapshot.nextInputSeq,4);assert.equal(describePlayerActions(back.bundle).canTrade,true);
});
test('D2C buy and sell move owned goods and public money once with total gold conserved',()=>{
 const b=createPlayerPlayVillage().bundle,buy=executePlayerIntent(b,intent('buy','PlayerBuy',{product:'food',quantity:2}));
 assert.equal(buy.bundle.snapshot.world.resources.gold,b.snapshot.world.resources.gold);assert.equal(buy.result.amount,2*buy.result.unitPrice);
 assert.equal(buy.result.after.wallet,buy.result.before.wallet-buy.result.amount);assert.equal(buy.result.after.communalGold,buy.result.before.communalGold+buy.result.amount);
 assert.equal(buy.result.after.inventory.food,buy.result.before.inventory.food+2);assert.equal(buy.result.after.publicStock.food,buy.result.before.publicStock.food-2);
 const sell=executePlayerIntent(buy.bundle,intent('sell','PlayerSell',{product:'food',quantity:2}));
 assert.equal(sell.result.unitPrice,Math.max(1,Math.floor(describePlayerActions(buy.bundle).prices.food.buy/2)));
 assert.equal(sell.result.after.wallet,sell.result.before.wallet+sell.result.amount);assert.equal(sell.result.after.publicStock.food,sell.result.before.publicStock.food+2);
 assert.equal(sell.bundle.snapshot.world.resources.gold,b.snapshot.world.resources.gold);
});
test('D2C tick143 buy completes before daily meal; sell last meal before daily starvation death',()=>{
 const c=defaultPlayerPlayConfig();c.society.player.initialFood=0;c.society.actors.initialActors[3].health=50;c.society.actors.initialActors[3].hunger=500;
 const b=advance(createPlayerPlayVillage(42,'player-play-village',c).bundle,143),buy=executePlayerIntent(b,intent('lastbuy','PlayerBuy',{product:'food',quantity:1}));
 assert.equal(buy.bundle.snapshot.world.actorModel.actors[3].alive,true);assert.equal(buy.bundle.snapshot.world.playerModel.inventory.food,0);
 c.society.player.initialFood=1;const s=advance(createPlayerPlayVillage(42,'player-play-village',c).bundle,143),sell=executePlayerIntent(s,intent('lastsell','PlayerSell',{product:'food',quantity:1}));
 assert.equal(sell.outcome,'succeeded');assert.equal(sell.bundle.snapshot.world.actorModel.actors[3].deathTick,144);assert.equal(sell.bundle.snapshot.world.playerModel.wallet,100+sell.result.amount);
});
test('D2C earlier daily death rejects completion but keeps elapsed world, sealed assets and persistent rejection',()=>{
 const c=defaultPlayerPlayConfig();c.society.player.initialFood=0;c.society.actors.initialActors[3].health=50;c.society.actors.initialActors[3].hunger=500;
 const b=advance(createPlayerPlayVillage(42,'player-play-village',c).bundle,143),r=executePlayerIntent(b,intent('die-on-road','PlayerTravel',{destination:'forest'}));
 assert.equal(r.bundle.snapshot.tick,155);assert.equal(r.outcome,'rejected');assert.deepEqual(r.result,{code:'RULE_REJECTED'});
 assert.equal(r.bundle.snapshot.world.actorModel.actors[3].location,'village');assert.equal(r.bundle.snapshot.world.actorModel.actors[3].deathTick,144);
 assert.equal(r.bundle.eventLog.some(e=>e.type==='PlayerActionCommitted'),false);
 assert.throws(()=>executePlayerIntent(r.bundle,intent('dead','PlayerRest')),e=>e.code==='RULE_REJECTED');
});
test('D2C a real mid-action checkpoint resumes exactly; dynamic registration interleaves NPC inputSeq and full replay rejects tampering',async()=>{
 const f=createPlayerPlayVillage(),first=advance(f.bundle,144),queued=enqueuePlayerIntent(first,intent('mid','PlayerTravel',{destination:'forest'}));
 assert.equal(queued.bundle.snapshot.pendingCommands[0].inputSeq,4);const mid=advance(queued.bundle,6);
 const dir=await mkdtemp(path.join(os.tmpdir(),'player-play-'));const file=await saveCheckpoint(mid,{directory:dir,rulesVersion:PLAY_RULES,systems:f.systems});
 const restored=await loadCheckpoint(file,{rulesVersion:PLAY_RULES,systems:f.systems}),resumed=advance(restored,6),continuous=executePlayerIntent(first,intent('mid','PlayerTravel',{destination:'forest'}));
 assert.deepEqual(resumed,continuous.bundle);
 const last=executePlayerIntent(advance(resumed,132),intent('after-npc','PlayerRest')).bundle;assert.equal(last.snapshot.commandReceipts['after-npc'].inputSeq,8);
 for(const mutate of [b=>b.snapshot.commandReceipts.mid.input.payload.startTick++,b=>b.snapshot.world.actorModel.actors[3].location='village',
 b=>b.eventLog.find(e=>e.type==='PlayerActionCommitted').payload.endTick++,b=>b.snapshot.world.playerModel.wallet++,b=>b.snapshot.commandReceipts.mid.inputSeq=1]){
  const bad=structuredClone(last);mutate(bad);assert.throws(()=>validateBundle(bad,{rulesVersion:PLAY_RULES,systems:f.systems}));
 }
});
test('D2C forest observations are derived from travel, retain self facts and omit new village public facts',()=>{
 const start=createPlayerPlayVillage().bundle,go=executePlayerIntent(start,intent('woods','PlayerTravel',{destination:'forest'})).bundle,b=advance(go,132);
 const own=b.snapshot.world.memoryModel.observer.actors[3];assert.equal(own.location,'forest');assert.ok(own.memories.some(m=>m.observable.type==='player-action'));
 assert.ok(own.memories.some(m=>m.observable.type==='player-day'));assert.equal(own.memories.some(m=>m.channel==='public'),false);
 assert.ok(b.snapshot.world.memoryModel.observer.actors[0].memories.some(m=>m.channel==='public'));
 const old=createPlayerVillage().bundle;assert.throws(()=>executePlayerIntent(old,intent('old','PlayerRest')));
 assert.throws(()=>executePlayerIntent(b,intent('forest-buy','PlayerBuy',{product:'food',quantity:1})),e=>e.code==='RULE_REJECTED');
 assert.throws(()=>enqueuePlayerIntent(start,intent('society-day-1','PlayerRest')),e=>e.code==='INVALID_INPUT');
});
