import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocietyVillage,createSocietyMedicineRace,createSocietyPeerSale } from '../../runtime/fixtures/society-village.mjs';
import { SOCIETY_RULES,defaultSocietyConfig } from '../../runtime/core/society.mjs';
import { createSimulationSession,advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
const run=(b,s,n)=>{const session=createSimulationSession(b,s);session.advanceTicks(n);return session.getBundle();};
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);

test('C3 real engine plans simultaneous medicine buyers, then commits one with normal rejected receipts',()=>{
  const {bundle,systems}=createSocietyMedicineRace(0),after=run(bundle,systems,144);
  const receipts=Object.values(after.snapshot.commandReceipts);assert.equal(receipts.length,3);assert.deepEqual(receipts.map(r=>r.inputSeq),[1,2,3]);
  assert.equal(after.snapshot.commandReceipts['society-day-1-actor-1'].status,'succeeded');
  assert.equal(after.snapshot.commandReceipts['society-day-1-actor-2'].status,'rejected');
  assert.equal(after.snapshot.world.societyModel.agents[0].state.inventory.herbs,1);assert.equal(after.snapshot.world.societyModel.agents[1].state.inventory.herbs,0);
  assert.equal(after.eventLog.filter(e=>e.type==='SocietyActionCommitted' && e.payload.action==='BuyMedicine').length,1);
  validateBundle(after,{rulesVersion:SOCIETY_RULES,systems});
});

test('C3 peer sale has one receipt, both entity references and later use, and the same snapshot repeats',()=>{
  const {bundle,systems}=createSocietyPeerSale(42),whole=run(bundle,systems,288),session=createSimulationSession(bundle,systems);
  session.advanceTicks(144);session.advanceTicks(144);assert.deepEqual(session.getBundle(),whole);
  const sale=whole.eventLog.find(e=>e.type==='SocietyActionCommitted' && e.payload.action==='SellMedicine');assert.ok(sale);
  assert.deepEqual(sale.entityIds,['actor-3','actor-2']);assert.equal(sale.payload.price,52);
  assert.ok(whole.eventLog.some(e=>e.type==='SocietyActionCommitted' && e.payload.actorId==='actor-2' && e.payload.action==='UseMedicine' && e.tick>sale.tick));
  let strict=bundle;for(let i=0;i<144;i++)strict=advanceOneTick(strict,systems);
  assert.deepEqual(strict,run(bundle,systems,144));
});

test('C3 all three commands, peer trade and planning rewind on system failure; forged provenance/history cannot load',()=>{
  const {bundle,systems}=createSocietyPeerSale(0),session=createSimulationSession(bundle,{society(ctx,due){systems.society(ctx,due);throw new Error('fail after peer trade');}});
  assert.throws(()=>session.advanceTicks(144),e=>e.failedTick===144);const last=session.getBundle();assert.equal(last.snapshot.tick,143);
  assert.equal(last.snapshot.nextInputSeq,1);assert.deepEqual(last.snapshot.commandReceipts,{});assert.equal(last.snapshot.rng.state,0);
  assert.deepEqual(last.snapshot.world.societyModel.agents.map(a=>a.state.wallet),[0,100,100]);
  const good=run(bundle,systems,144);
  for(const mutate of [b=>b.snapshot.world.societyModel.agents[2].trade.revenue++,b=>b.snapshot.world.societyModel.agents[1].trade.herbsReceived++,
    b=>b.snapshot.commandReceipts['society-day-1-actor-3'].input.payload.targetActorId='actor-1',b=>b.eventLog.at(-1).payload.agents[1].wallet++,
    b=>b.snapshot.world.societyModel.agents[1].state.currentGoal.goalId++,b=>b.snapshot.rng.state++]){
    const corrupt=structuredClone(good);mutate(corrupt);assert.throws(()=>validateBundle(corrupt,{rulesVersion:SOCIETY_RULES,systems}),bad);
  }
  const injected=structuredClone(bundle);injected.snapshot.nextInputSeq=2;injected.snapshot.pendingCommands=[{commandId:'society-day-1-actor-1',inputSeq:1,targetTick:144,
    type:'SocietyAction',payload:{actorId:'actor-1',goalId:0,action:'WorkForPay',targetActorId:null}}];
  assert.throws(()=>validateBundle(injected,{rulesVersion:SOCIETY_RULES,systems}),bad);
});

test('C3 actual registered chief public-food goal commits paid production and ends or changes after progress',()=>{
  const config=defaultSocietyConfig();config.actors.market.ecology.resources.resources.food.initial=100;
  const {bundle,systems}=createSocietyVillage(42,'chief-support',config),after=run(bundle,systems,4*144);
  const first=after.eventLog.find(e=>e.type==='SocietyDaySettled');
  assert.equal(first.payload.agents[0].decision.kind,'support-village');
  const work=after.eventLog.find(e=>e.type==='SocietyActionCommitted' && e.payload.actorId==='actor-1' && e.payload.action==='WorkForPay');
  assert.ok(work);assert.equal(work.payload.foodProduced,8);assert.equal(work.payload.after.wallet-work.payload.before.wallet,20);
  assert.ok(after.snapshot.world.societyModel.agents[0].state.ledger.workDays>=1);
  validateBundle(after,{rulesVersion:SOCIETY_RULES,systems});
});
