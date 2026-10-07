import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PLAYER_RULES,defaultPlayerConfig,createPlayerWorld,validatePlayerWorld } from '../../runtime/core/player-runtime.mjs';
import { createPlayerVillage,playerSystems } from '../../runtime/fixtures/player-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { saveCheckpoint,loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { buildPlayerKnowledge } from '../../runtime/knowledge/player-knowledge.mjs';
import { createPersonalityNeutral } from '../../runtime/fixtures/personality-village.mjs';
import { createMemoryVillage } from '../../runtime/fixtures/memory-village.mjs';
import { applyMemoryAction } from '../../runtime/core/memory-runtime.mjs';
import { createActorVillage } from '../../runtime/fixtures/actor-village.mjs';
import { createHunterVillage } from '../../runtime/fixtures/hunter-village.mjs';
import { defaultActorConfig } from '../../runtime/core/actors.mjs';
import { defaultHunterConfig } from '../../runtime/core/hunter.mjs';
import { createMemoryState,reduceMemoryFacts } from '../../runtime/core/memory-observer.mjs';
const run=(config,days=1)=>{const f=createPlayerVillage(42,'player-village',config),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(days*144);return s.getBundle();};
test('D2B four residents replace anonymous share; initial assets transfer once from public stock',()=>{
 const c=defaultPlayerConfig(),w=createPlayerWorld(c),p=w.playerModel;
 assert.equal(c.version,'memory-config-v3');assert.equal(w.actorModel.actors.length,4);assert.equal(w.societyModel.agents.length,3);
 assert.equal(p.actorId,'actor-4');assert.equal(p.wallet,100);assert.deepEqual(p.inventory,{food:3,herbs:1});
 assert.equal(w.resources.food,c.society.actors.market.ecology.resources.resources.food.initial-c.society.estates.reduce((n,e)=>n+e.initialFood,0)-3);
 assert.equal(w.resources.herbs,c.society.actors.market.ecology.resources.resources.herbs.initial-1);
 assert.equal(w.resources.gold,c.society.actors.market.ecology.resources.resources.gold.initial);
 assert.equal(createPlayerVillage().bundle.snapshot.nextEntityId,5);
});
test('D2B real daily consumer uses 76 public rations and four private rations without player Goal',()=>{
 const c=defaultPlayerConfig();c.society.estates.forEach(e=>e.initialFood=3);const b=run(c),w=b.snapshot.world,d=b.eventLog.find(e=>e.type==='SocietyDaySettled').payload;
 assert.equal(d.actors.populationOpening.unnamedAlive,76);assert.equal(d.actors.populationClosing.totalAlive,80);
 assert.equal(d.actors.market.ecology.resources.entries[0].consumption,76);assert.deepEqual(d.actors.rows.map(r=>r.food),[1,1,1,1]);
 assert.equal(w.playerModel.inventory.food,2);assert.equal(w.playerModel.ledger.foodUsed,1);assert.equal(w.playerModel.inventory.herbs,1);
 assert.equal(Object.hasOwn(w.playerModel,'currentGoal'),false);
 assert.equal(b.eventLog.some(e=>e.type==='SocietyActionCommitted' && e.payload.actorId==='actor-4'),false);
 const m=w.memoryModel.observer.actors.find(a=>a.actorId==='actor-4').memories;
 assert.ok(m.some(a=>a.observable.type==='village-market'));assert.ok(m.some(a=>a.observable.type==='player-day'));
});
test('D2B private shortage does not eat or heal from public stock; death seals identity and assets',()=>{
 const c=defaultPlayerConfig();c.society.player.initialFood=0;c.society.actors.initialActors[3].health=50;c.society.actors.initialActors[3].hunger=500;
 const b=run(c,3),w=b.snapshot.world,p=w.actorModel.actors[3];assert.equal(p.alive,false);assert.equal(p.deathTick,144);
 assert.equal(w.playerModel.wallet,100);assert.deepEqual(w.playerModel.inventory,{food:0,herbs:1});assert.equal(w.playerModel.ledger.foodUsed,0);
 const m=w.memoryModel.observer.actors[3];assert.equal(m.alive,false);assert.ok(m.memories.every(a=>a.observedTick<=144));
 assert.equal(w.actorModel.actors.length,4);assert.equal(w.memoryModel.observer.actors.length,4);
});
test('D2B last public wage is paid once; private player money cannot fund NPC wages or imports',()=>{
 const c=defaultPlayerConfig(),r=c.society.actors.market.ecology.resources;r.resources.gold.initial=120;
 c.society.estates.forEach(e=>{e.initialWallet=0;e.initialFood=0;});r.resources.food.initial=12;r.resources.herbs.initial=1;
 const b=run(c),w=b.snapshot.world,actions=b.eventLog.filter(e=>e.type==='SocietyActionCommitted');
 assert.equal(actions.filter(e=>e.payload.action==='WorkForPay').length,1);assert.equal(w.resources.gold,120);assert.equal(w.playerModel.wallet,100);
 assert.equal(b.eventLog.find(e=>e.type==='SocietyDaySettled').payload.communalGold,0);
 assert.equal(w.marketModel.inTransit.length,0);
});
test('D2B checkpoint 143 + 1 equals uninterrupted 144, and full replay rejects forged balances, identities and observations',async()=>{
 const f=createPlayerVillage(42),s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(143);
 const dir=await mkdtemp(path.join(os.tmpdir(),'d2b-core-')),file=await saveCheckpoint(s.getBundle(),{directory:dir,rulesVersion:PLAYER_RULES,systems:f.systems});
 const recovered=await loadCheckpoint(file,{rulesVersion:PLAYER_RULES,systems:f.systems}),continued=createSimulationSession(recovered,f.systems);continued.advanceTicks(1);
 const expected=run(defaultPlayerConfig());assert.deepEqual(continued.getBundle(),expected);
 for(const mutate of [b=>b.snapshot.world.playerModel.wallet++,b=>b.snapshot.world.playerModel.ledger.foodUsed++,b=>b.snapshot.world.actorModel.actors[3].deathTick=0,
 b=>{b.snapshot.world.memoryModel.observer.actors[3].memories[0].observable.food++;},b=>b.snapshot.nextEntityId=4,
 b=>{const c=b.snapshot.world.memoryModel.config;c.society.player.initialWallet++;b.snapshot.world.memoryModel.configFingerprint=canonicalJson(c);},
 b=>b.eventLog.find(e=>e.type==='PlayerDaySettled').payload.privateFood=0]){
  const corrupt=structuredClone(expected);mutate(corrupt);assert.throws(()=>validateBundle(corrupt,{rulesVersion:PLAYER_RULES,systems:playerSystems()}));
 }
});
test('D2B player knowledge is strict, copied and contains only the frozen own fields',()=>{
 const b=run(defaultPlayerConfig()),k=buildPlayerKnowledge(b);assert.equal(k.self.identity.deathTick,null);assert.equal(k.self.identity.actorId,'actor-4');
 assert.deepEqual(Object.keys(k).sort(),['revision','self','simulationId','tick']);assert.deepEqual(Object.keys(k.self).sort(),['fatigue','health','hunger','identity','inventory','needs','wallet']);
 assert.equal(JSON.stringify(k).includes('actor-2'),false);k.self.inventory.food=999;assert.equal(buildPlayerKnowledge(b).self.inventory.food,2);
 let reads=0;assert.throws(()=>buildPlayerKnowledge({get snapshot(){reads++;return {};},eventLog:[]}));assert.equal(reads,0);
 const bad=structuredClone(b);bad.snapshot.rulesVersion='c-personality-v1';assert.throws(()=>buildPlayerKnowledge(bad));
});
test('D2B real NPC internal purchase restores public gold ownership without minting currency',()=>{
 const w=createPlayerWorld(),actor=w.societyModel.agents[1].state,before=w.resources.gold-w.societyModel.agents.reduce((n,a)=>n+a.state.wallet,0)-w.playerModel.wallet;
 const r=applyMemoryAction(w,{actorId:actor.actorId,goalId:0,action:'BuyFood',targetActorId:null});assert.equal(r.success,true);
 assert.equal(r.world.resources.gold,w.resources.gold);assert.equal(r.world.playerModel.wallet,100);
 assert.equal(r.result.after.communalGold,before+r.result.price);assert.equal(r.result.before.wallet-r.result.after.wallet,r.result.price);
 assert.equal(r.world.resources.food,w.resources.food-1);assert.equal(r.world.societyModel.agents[1].state.inventory.food,1);
});
test('D2B version pairing, adversarial records and alternate handlers cannot bypass strict audit',()=>{
 const f=createPlayerVillage(),s=createSimulationSession(f.bundle,{society(ctx,due){f.systems.society(ctx,due);ctx.snapshot.world.playerModel.wallet++;}});
 assert.throws(()=>s.advanceTicks(144),e=>e.failedTick===144);assert.equal(s.getBundle().snapshot.tick,143);
 for(const old of [createPersonalityNeutral(),createMemoryVillage()]){
  const b=structuredClone(old.bundle);b.snapshot.world=createPlayerWorld();assert.throws(()=>validateBundle(b,{rulesVersion:b.snapshot.rulesVersion,systems:old.systems}));
 }
 for(const mutate of [c=>{c.society.version='society-config-v1';},c=>{c.version='memory-config-v2';},c=>{c.society.actors.version='actor-config-v1';},
  c=>c.society.estates.push({...c.society.estates[0],actorId:'actor-4'}),c=>c.extra=1,c=>c.society.player.initialFood=1.5]){
  const c=defaultPlayerConfig();mutate(c);assert.throws(()=>createPlayerWorld(c));
 }
 let reads=0;const c=defaultPlayerConfig();Object.defineProperty(c.society,'version',{enumerable:true,get(){reads++;return 'society-config-v2';}});
 assert.throws(()=>createPlayerWorld(c));assert.equal(reads,0);
});
test('D2B public validation rejects nested version getters and checks event budget before copying nested state',()=>{
 let reads=0;const w=createPlayerWorld();Object.defineProperty(w.memoryModel.config,'version',{enumerable:true,get(){reads++;return 'memory-config-v3';}});
 assert.throws(()=>validatePlayerWorld(w));assert.equal(reads,0);
 const b=createPlayerVillage().bundle;b.eventLog=Array(140001).fill(null);
 Object.defineProperty(b.snapshot.world.actorModel.actors[3],'health',{enumerable:true,get(){reads++;return 1000;}});
 assert.throws(()=>buildPlayerKnowledge(b),e=>e.code==='LIMIT_EXCEEDED');assert.equal(reads,0);
});
test('D2B new Actor schema is forbidden by old C1 and C2 envelopes',()=>{
 const c=defaultActorConfig();c.version='actor-config-v2';c.initialActors.push(defaultPlayerConfig().society.actors.initialActors[3]);
 assert.throws(()=>createActorVillage(42,'old-actor2',c),e=>e.code==='UNSUPPORTED_VERSION');
 const h=defaultHunterConfig();h.actors=c;assert.throws(()=>createHunterVillage(42,'old-hunter2',h),e=>e.code==='UNSUPPORTED_VERSION');
});
test('D2B standalone observer rejects PlayerDay outside its registered roster',()=>{
 const event={eventSeq:1,schemaVersion:1,tick:144,type:'PlayerDaySettled',sourceSystem:'society',commandId:null,entityIds:[],causationEventSeqs:[],
  payload:{day:1,actorId:'actor-4',privateFood:1,wallet:100,inventory:{food:2,herbs:1},ledger:{foodUsed:1}}};
 const old=createMemoryState([1,2,3].map(i=>({actorId:'actor-'+i,alive:true})));
 assert.throws(()=>reduceMemoryFacts(old,[event],144));assert.equal(old.cursor,0);
 const player=createMemoryState([...old.initialActors,{actorId:'actor-4',alive:true}]),observed=reduceMemoryFacts(player,[event],144);
 assert.equal(observed.cursor,1);assert.equal(observed.actors[3].memories[0].observable.type,'player-day');
});
test('D2B initially dead player retains assets and has no new observations; tombstone edits fail full replay',()=>{
 const c=defaultPlayerConfig();c.society.actors.initialActors[3].health=0;const b=run(c,2),w=b.snapshot.world;
 assert.equal(w.actorModel.actors[3].deathTick,0);assert.deepEqual(w.playerModel.inventory,{food:3,herbs:1});assert.equal(w.playerModel.wallet,100);
 assert.equal(w.playerModel.ledger.foodUsed,0);assert.deepEqual(w.memoryModel.observer.actors[3].memories,[]);
 const k=buildPlayerKnowledge(b);assert.equal(k.self.identity.alive,false);assert.equal(k.self.identity.deathTick,0);
 for(const mutate of [b=>{b.snapshot.world.actorModel.actors[3].deathTick=144;},b=>{b.snapshot.world.memoryModel.observer.actors[3].alive=true;}]){
  const corrupt=structuredClone(b);mutate(corrupt);assert.throws(()=>validateBundle(corrupt,{rulesVersion:PLAYER_RULES,systems:playerSystems()}));
 }
});
