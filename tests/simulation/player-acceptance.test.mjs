import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PLAYER_RULES,defaultPlayerConfig,createPlayerWorld,validatePlayerWorld } from '../../runtime/core/player-runtime.mjs';
import { createPlayerVillage } from '../../runtime/fixtures/player-village.mjs';
import { buildPlayerKnowledge } from '../../runtime/knowledge/player-knowledge.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { defaultMemoryConfig,defaultPersonalityConfig } from '../../runtime/core/memory-runtime.mjs';
import { createMemoryVillage } from '../../runtime/fixtures/memory-village.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { buildActorKnowledge } from '../../runtime/knowledge/actor-knowledge.mjs';
import { projectActorEvent } from '../../runtime/core/memory-observer.mjs';

const bad=e=>['INVALID_INPUT','UNSUPPORTED_VERSION','INVALID_CHECKPOINT'].includes(e.code);
const actor=w=>w.actorModel.actors.find(a=>a.actorId==='actor-4');
const treasury=w=>BigInt(w.resources.gold)-BigInt(w.playerModel.wallet)-w.societyModel.agents.reduce((n,a)=>n+BigInt(a.state.wallet),0n);
function config(){const c=defaultPlayerConfig();c.society.estates.forEach(e=>e.initialFood=3);return c;}
function run(c,ticks=144){const f=createPlayerVillage(42,'player-village',c),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(ticks);return s.getBundle();}
function quiet(c){const r=c.society.actors.market.ecology.resources;r.resources.food.production.numerator=0;r.resources.herbs.production.numerator=0;
  r.populations.deer=0;r.populations.wolves=0;r.resources.food.lossPermille=0;r.resources.herbs.lossPermille=0;return r;}
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-player-independent-'),dir=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(path.isAbsolute(dir)&&dir.startsWith(prefix));await fs.rm(dir,{recursive:true,force:true});});return dir;}
const day=b=>b.eventLog.find(e=>e.type==='SocietyDaySettled').payload;

test('D2B independent: four identities come from 80, and initial goods/coins have exactly one owner',()=>{
  const c=defaultPlayerConfig(),w=createPlayerWorld(c),r=c.society.actors.market.ecology.resources;
  assert.equal(PLAYER_RULES,'d-player-v1');assert.equal(c.version,'memory-config-v3');assert.equal(c.society.version,'society-config-v2');
  assert.deepEqual(w.actorModel.actors.map(a=>a.actorId),['actor-1','actor-2','actor-3','actor-4']);
  assert.deepEqual(w.societyModel.agents.map(a=>a.state.actorId),['actor-1','actor-2','actor-3']);
  assert.equal(actor(w).occupation,'player');assert.equal(actor(w).name,'玩家');assert.equal(w.playerModel.actorId,'actor-4');
  assert.equal(w.playerModel.wallet,100);assert.deepEqual(w.playerModel.inventory,{food:3,herbs:1});
  assert.equal(w.resources.gold,r.resources.gold.initial);
  const npcCoins=c.society.estates.reduce((n,e)=>n+BigInt(e.initialWallet),0n);
  assert.equal(treasury(w),BigInt(r.resources.gold.initial)-npcCoins-100n);
  for(const id of ['food','herbs']){
    const privateTotal=w.societyModel.agents.reduce((n,a)=>n+BigInt(a.state.inventory[id]),BigInt(w.playerModel.inventory[id]));
    assert.equal(BigInt(w.resources[id])+privateTotal,BigInt(r.resources[id].initial));
    assert.equal(BigInt(w.resourceModel.ledger[id].outflow),privateTotal);
  }
  for(const key of ['health','needs','location','currentGoal','personality'])assert.equal(Object.hasOwn(w.playerModel,key),false);
  const b=createPlayerVillage().bundle;assert.equal(b.snapshot.nextEntityId,5);validatePlayerWorld(w);
});

test('D2B independent real day: 76 public rations plus four private rations, never 81 people or a second player ration',()=>{
  const c=config();c.society.actors.initialActors.forEach(a=>{a.health=1000;a.hunger=0;});
  const b=run(c),p=day(b),w=b.snapshot.world;
  assert.deepEqual(p.actors.populationOpening,{registered:4,namedAlive:4,unnamedAlive:76,totalAlive:80,namedInjured:0,dead:0});
  const food=p.actors.market.ecology.resources.entries.find(e=>e.resource==='food');
  assert.equal(food.demand,76);assert.equal(food.consumption,76);assert.equal(p.actors.rows.length,4);
  assert.equal(p.actors.rows.reduce((n,a)=>n+a.food,0),4);assert.equal(w.actorModel.ledger.foodConsumed,4);
  assert.equal(w.playerModel.inventory.food,2);assert.equal(actor(w).hunger,0);
  assert.equal(b.eventLog.some(e=>e.type==='SocietyActionCommitted'&&e.payload.actorId==='actor-4'),false);
});

test('D2B independent: abundant public food and medicine cannot feed or heal an empty private player account',()=>{
  const c=config();c.society.player.initialFood=0;c.society.actors.initialActors[3].health=500;
  const b=run(c),w=b.snapshot.world,row=day(b).actors.rows.find(r=>r.actorId==='actor-4');
  assert.ok(w.resources.food>0);assert.ok(w.resources.herbs>0);assert.equal(row.food,0);assert.equal(row.herbs,0);
  assert.equal(actor(w).hunger,100);assert.equal(actor(w).health,500);assert.equal(w.playerModel.inventory.herbs,1);
});

test('D2B independent actual wage race: 120 total minus player 100 pays only the first 20 wage',()=>{
  const c=config();c.society.estates.forEach(e=>e.initialWallet=0);c.society.actors.market.ecology.resources.resources.gold.initial=120;
  c.society.actors.initialActors[0].health=500;c.society.actors.initialActors[1].health=500;
  // Two injured residents need medicine; the empty, penniless merchant also needs stock.
  // All plan against the same 20 public coins, then each commit rechecks ownership.
  const b=run(c),w=b.snapshot.world,work=Object.values(b.snapshot.commandReceipts).filter(r=>r.input.payload.action==='WorkForPay')
    .sort((a,b)=>a.input.payload.actorId.localeCompare(b.input.payload.actorId));
  assert.equal(c.society.economics.wage,20);assert.equal(work.length,3);
  assert.deepEqual(work.map(r=>r.input.payload.actorId),['actor-1','actor-2','actor-3']);
  assert.deepEqual(work.map(r=>r.status),['succeeded','rejected','rejected']);
  assert.deepEqual(w.societyModel.agents.map(a=>a.state.ledger.wages),[20,0,0]);
  assert.equal(w.societyModel.agents.reduce((n,a)=>n+a.state.ledger.workDays,0),1);
  assert.deepEqual(w.societyModel.agents.map(a=>a.state.wallet),[20,0,0]);assert.equal(w.playerModel.wallet,100);
  assert.equal(w.resources.gold,120);assert.equal(treasury(w),0n);assert.equal(day(b).communalGold,0);
});

test('D2B independent shortage: all currency belongs to player, so neither NPC wages nor actual market orders can spend it',()=>{
  const c=config(),r=quiet(c);r.resources.gold.initial=100;r.resources.food.initial=100;r.resources.herbs.initial=0;
  c.society.player.initialHerbs=0;c.society.estates.forEach(e=>{e.initialWallet=0;e.initialHerbs=0;});
  c.society.actors.initialActors[0].health=500;c.society.actors.initialActors[1].health=500;
  const b=run(c),w=b.snapshot.world;
  assert.equal(w.marketModel.routeOpen,true);assert.deepEqual(day(b).actors.market.orders,[]);
  assert.equal(w.marketModel.paid,0);assert.equal(w.resources.gold,100);assert.equal(w.playerModel.wallet,100);assert.equal(treasury(w),0n);
  assert.equal(w.societyModel.agents.reduce((n,a)=>n+a.state.ledger.wages,0),0);
});

test('D2B independent real NPC purchase: seller treasury receives price while total currency and player ownership remain unchanged',()=>{
  const c=config();c.society.estates.forEach(e=>{e.initialFood=20;e.initialWallet=0;});c.society.estates[1].initialWallet=100;
  c.society.actors.initialActors[1].health=500;c.society.actors.market.ecology.resources.resources.gold.initial=200;
  const b=run(c),w=b.snapshot.world,trade=b.eventLog.find(e=>e.type==='SocietyActionCommitted'&&e.payload.actorId==='actor-2'&&e.payload.action==='BuyMedicine').payload;
  assert.ok(trade.price>0);assert.equal(trade.before.wallet,100);assert.equal(trade.before.communalGold,0);
  assert.equal(trade.after.wallet,100-trade.price);assert.equal(trade.after.communalGold,trade.price);
  assert.equal(trade.after.inventory.herbs-trade.before.inventory.herbs,1);assert.equal(w.playerModel.wallet,100);
  assert.equal(BigInt(w.resources.gold)+BigInt(w.marketModel.paid),200n);
  assert.equal(treasury(w)+BigInt(w.marketModel.paid),BigInt(trade.price));
});

test('D2B independent death: next day population is 79, retained coins/herbs never become common property or new observations',()=>{
  const c=config();quiet(c);c.society.player.initialFood=0;c.society.actors.initialActors[3].health=1;c.society.actors.initialActors[3].hunger=1000;
  const f=createPlayerVillage(0,'player-village',c),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(144);
  const first=s.getBundle(),sealed=structuredClone(first.snapshot.world.memoryModel.observer.actors.find(a=>a.actorId==='actor-4'));
  assert.equal(actor(first.snapshot.world).deathTick,144);assert.equal(first.snapshot.world.playerModel.inventory.herbs,1);
  s.advanceTicks(144);const b=s.getBundle(),w=b.snapshot.world,p=b.eventLog.filter(e=>e.type==='SocietyDaySettled')[1].payload;
  assert.equal(p.actors.populationOpening.totalAlive,79);assert.equal(p.actors.populationOpening.unnamedAlive,76);
  assert.equal(p.actors.rows.find(r=>r.actorId==='actor-4').food,0);assert.equal(w.playerModel.wallet,100);assert.equal(w.playerModel.inventory.herbs,1);
  assert.deepEqual(w.memoryModel.observer.actors.find(a=>a.actorId==='actor-4'),sealed);
  assert.equal(actor(w).lastNeedsTick,144);assert.deepEqual(actor(w).needs,{food:0,healing:0,rest:0});
});

test('D2B independent knowledge: fixed own whitelist, no aliases, NPC privacy, configuration or mutation',()=>{
  const b=run(config()),before=structuredClone(b),known=buildPlayerKnowledge(b);
  assert.deepEqual(Object.keys(known).sort(),['revision','self','simulationId','tick']);
  assert.deepEqual(Object.keys(known.self).sort(),['fatigue','health','hunger','identity','inventory','needs','wallet']);
  assert.deepEqual(Object.keys(known.self.identity).sort(),['actorId','alive','deathTick','location','name','occupation','simulationLevel']);
  assert.equal(known.self.identity.actorId,'actor-4');assert.equal(known.self.identity.deathTick,null);
  for(const forbidden of ['actor-1','actor-2','actor-3','currentGoal','personalities','initialActors','rng','eventLog','configFingerprint'])assert.equal(JSON.stringify(known).includes(forbidden),false);
  known.self.wallet=999999;known.self.inventory.food=999999;known.self.needs.food=999999;
  for(let i=0;i<10;i++)assert.equal(buildPlayerKnowledge(b).self.wallet,100);assert.deepEqual(b,before);
  const playerDay=b.eventLog.find(e=>e.type==='PlayerDaySettled');assert.ok(playerDay,'Real player daily fact must be committed');
  const playerObserved=b.snapshot.world.memoryModel.observer.actors.find(a=>a.actorId==='actor-4');
  const own=playerObserved.memories.find(m=>m.sourceEventSeq===playerDay.eventSeq&&m.channel==='self');assert.ok(own);
  assert.deepEqual(own.observable,{type:'player-day',actorId:'actor-4',privateFood:1,wallet:100,inventory:{food:2,herbs:1}});
  const market=playerObserved.memories.find(m=>m.channel==='public'&&m.observable.type==='village-market');assert.ok(market);
  assert.equal(market.observable.alive,80);assert.equal(Object.hasOwn(market.observable,'wallet'),false);
  for(const observed of b.snapshot.world.memoryModel.observer.actors){
    for(const memory of observed.memories){
      if(memory.channel==='self')assert.equal(memory.observable.actorId,observed.actorId);
      else for(const key of ['wallet','inventory','health','needs','currentGoal','playerModel'])assert.equal(Object.hasOwn(memory.observable,key),false);
    }
  }
  for(const id of ['actor-1','actor-2','actor-3']){
    assert.throws(()=>buildActorKnowledge(b,id),e=>e.code==='UNSUPPORTED_VERSION');
    assert.deepEqual(projectActorEvent(playerDay,id),[]);
    const npc=b.snapshot.world.memoryModel.observer.actors.find(a=>a.actorId===id);
    assert.equal(npc.memories.some(m=>m.sourceEventSeq===playerDay.eventSeq),false);
  }
  const projected=projectActorEvent(playerDay,'actor-4');assert.equal(projected.length,1);projected[0].observable.wallet=99999;
  assert.equal(projectActorEvent(playerDay,'actor-4')[0].observable.wallet,100);assert.deepEqual(b,before);
});

test('D2B independent true checkpoint: 143+1 and death continuation match uninterrupted complete bundles',async t=>{
  const directory=await temporary(t);
  for(const death of [false,true]){
    const c=config();if(death){quiet(c);c.society.player.initialFood=0;c.society.actors.initialActors[3].health=1;c.society.actors.initialActors[3].hunger=1000;}
    const f=createPlayerVillage(42,'player-village',c),s=createSimulationSession(f.bundle,f.systems),options={rulesVersion:PLAYER_RULES,systems:f.systems};
    s.advanceTicks(143);const file=await saveCheckpoint(s.getBundle(),{directory:path.join(directory,String(death)),...options});
    const restored=createSimulationSession(await loadCheckpoint(file,options),f.systems);restored.advanceTicks(1);
    assert.deepEqual(restored.getBundle(),run(c,144));
    if(death){const file2=await saveCheckpoint(restored.getBundle(),{directory:path.join(directory,'death'),...options});
      const after=createSimulationSession(await loadCheckpoint(file2,options),f.systems);after.advanceTicks(144);assert.deepEqual(after.getBundle(),run(c,288));}
  }
});

test('D2B independent replay rejects forged goods, owner, death, population and receipt despite recomputed fingerprints',()=>{
  const b=run(config()),f=createPlayerVillage();
  const mutations=[x=>x.snapshot.world.playerModel.inventory.food++,x=>x.snapshot.world.playerModel.wallet++,
    x=>x.snapshot.world.playerModel.actorId='actor-2',x=>{const a=actor(x.snapshot.world);a.alive=false;a.health=0;a.deathTick=144;a.needs={food:0,healing:0,rest:0};},
    x=>{const m=x.snapshot.world.actorModel;m.config.market.ecology.resources.settlement.humanCount=81;m.configFingerprint=canonicalJson(m.config);},
    x=>{const receipt=Object.values(x.snapshot.commandReceipts)[0];receipt.status=receipt.status==='succeeded'?'rejected':'succeeded';},
    x=>{const m=x.snapshot.world.memoryModel;m.config.society.player.initialFood++;m.configFingerprint=canonicalJson(m.config);}];
  for(const mutate of mutations){const corrupt=structuredClone(b);mutate(corrupt);
    assert.throws(()=>validateBundle(corrupt,{rulesVersion:PLAYER_RULES,systems:f.systems}),bad);assert.throws(()=>buildPlayerKnowledge(corrupt),bad);}
});

test('D2B independent legacy: C4/C5 remain three persons, new player fields and cross-version worlds fail explicitly',()=>{
  for(const f of [createMemoryVillage(),createPersonalityNeutral()]){
    const s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(144);const b=s.getBundle();
    assert.equal(b.snapshot.nextEntityId,4);assert.equal(b.snapshot.world.actorModel.actors.length,3);assert.equal(Object.hasOwn(b.snapshot.world,'playerModel'),false);
    for(const id of ['actor-1','actor-2','actor-3']){
      const known=buildActorKnowledge(b,id);assert.equal(known.self.identity.actorId,id);
      assert.equal(JSON.stringify(known.public).includes('wallet'),false);assert.equal(JSON.stringify(known).includes('initialActors'),false);
      for(const m of known.memories)if(m.channel==='public'||m.channel==='interaction'){
        for(const key of ['wallet','health','currentGoal','inventory','needs'])assert.equal(Object.hasOwn(m.observable,key),false);
      }
    }
    assert.throws(()=>buildPlayerKnowledge(b),bad);
    const corrupt=structuredClone(b);corrupt.snapshot.world.playerModel=createPlayerWorld(defaultPlayerConfig()).playerModel;
    assert.throws(()=>validateBundle(corrupt,{rulesVersion:b.snapshot.rulesVersion,systems:f.systems}),bad);
  }
  for(const old of [defaultMemoryConfig(),defaultPersonalityConfig()]){
    old.society.player=defaultPlayerConfig().society.player;assert.throws(()=>createPlayerWorld(old),bad);
  }
});
