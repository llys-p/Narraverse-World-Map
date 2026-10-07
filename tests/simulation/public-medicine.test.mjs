import test from 'node:test';
import assert from 'node:assert/strict';
import { createMedicineAnnouncements,validateMedicineAnnouncement,selectPublicMedicineBuyer } from '../../runtime/core/public-medicine.mjs';
import { createSocietyWorld,defaultSocietyConfig,planSocietyDay,applySocietyAction } from '../../runtime/core/society.mjs';
import { projectActorEvent } from '../../runtime/core/memory-observer.mjs';
const config=defaultSocietyConfig();config.actors.initialActors[0].health=500;config.actors.initialActors[1].health=500;
config.estates[0].initialWallet=100;config.estates[1].initialWallet=100;config.estates[2].initialHerbs=1;
const world=createSocietyWorld(config),announcements=createMedicineAnnouncements(world,144);
const quote={postedPrice:50,maxPrice:160,markup:2,discountEnabled:true};
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED'].includes(e.code);

test('C4 public medicine: self-issued request and supply are white-listed public facts with no balances/health/goals',()=>{
  assert.deepEqual(announcements.map(a=>[a.type,a.entityIds[0]]),[['MedicalRequestAnnounced','actor-1'],['MedicalRequestAnnounced','actor-2'],['MedicineOfferAnnounced','actor-3']]);
  for(const fact of announcements){validateMedicineAnnouncement(fact);assert.equal(fact.payload.amount,1);assert.equal(fact.payload.expiresTick,144);
    assert.deepEqual(Object.keys(fact.payload).sort(),['actorId','amount',fact.type==='MedicalRequestAnnounced'?'maxPrice':'price','expiresTick'].sort());}
  assert.equal(JSON.stringify(announcements).includes('health'),false);assert.equal(JSON.stringify(announcements).includes('wallet'),false);
  const projection=projectActorEvent({...announcements[0],eventSeq:1,schemaVersion:1,tick:144},'actor-3');
  assert.equal(projection[0].channel,'public');assert.equal(projection[0].observable.maxPrice,52);
  const otherConfig=structuredClone(config);otherConfig.estates[0].initialWallet=101;otherConfig.actors.initialActors[0].health=400;
  assert.deepEqual(createMedicineAnnouncements(createSocietyWorld(otherConfig),144),announcements);
  assert.throws(()=>createMedicineAnnouncements(world,145),bad);
});

test('C4 public medicine: select only from unexpired public requests, trust chooses client and discounts after two actual increments',()=>{
  assert.deepEqual(selectPublicMedicineBuyer(announcements,'actor-3',[],quote,144),{actorId:'actor-1',price:52});
  const relations=[{actorId:'actor-1',trust:10,lastSourceEventSeq:1},{actorId:'actor-2',trust:20,lastSourceEventSeq:2}];
  assert.deepEqual(selectPublicMedicineBuyer(announcements,'actor-3',relations,quote,144),{actorId:'actor-2',price:50});
  assert.deepEqual(selectPublicMedicineBuyer(announcements,'actor-3',relations,{...quote,discountEnabled:false},144),{actorId:'actor-2',price:52});
  assert.equal(selectPublicMedicineBuyer(announcements,'actor-3',relations,quote,145),null);
  assert.equal(selectPublicMedicineBuyer(announcements.filter(a=>a.type!=='MedicineOfferAnnounced'),'actor-3',relations,quote,144),null);
  const copy=structuredClone(announcements);copy[0].payload.maxPrice=49;copy[1].payload.maxPrice=49;
  assert.equal(selectPublicMedicineBuyer(copy,'actor-3',[],quote,144),null);
});

test('C4 public medicine: duplicates, sparse lists, getters, foreign source, impossible or overflow quote are explicit errors',()=>{
  for(const facts of [Array(1),[...announcements,announcements[0]]])assert.throws(()=>selectPublicMedicineBuyer(facts,'actor-3',[],quote,144),bad);
  for(const mutate of [f=>f.payload.wallet=100,f=>f.entityIds=['actor-2'],f=>f.payload.amount=2,f=>f.commandId='fake',f=>f.sourceSystem='llm']){
    const fact=structuredClone(announcements[0]);mutate(fact);assert.throws(()=>validateMedicineAnnouncement(fact),bad);
  }
  let reads=0;const accessor={get actorId(){reads++;return 'actor-1';},trust:10,lastSourceEventSeq:1};
  assert.throws(()=>selectPublicMedicineBuyer(announcements,'actor-3',[accessor],quote,144),bad);assert.equal(reads,0);
  assert.throws(()=>selectPublicMedicineBuyer(announcements,'actor-3',[],{...quote,markup:Number.MAX_SAFE_INTEGER},144),bad);
});

test('C4 society adapter: merchant plans from public selection even when hidden buyer eligibility changes; authority rejects without asset transfer',()=>{
  const changed=structuredClone(config);changed.actors.initialActors[0].health=1000;changed.actors.initialActors[1].health=1000;
  const actual=createSocietyWorld(changed),policy={buyerId:'actor-2',price:52};
  const plan=planSocietyDay(actual,policy),sale=plan.commands.find(c=>c.payload.actorId==='actor-3');
  assert.equal(sale.payload.action,'SellMedicine');assert.equal(sale.payload.targetActorId,'actor-2');
  const before=plan.world.societyModel.agents.map(a=>[a.state.wallet,a.state.inventory.herbs]);
  const rejected=applySocietyAction(plan.world,sale.payload,null,policy);assert.equal(rejected.success,false);
  assert.deepEqual(rejected.world.societyModel.agents.map(a=>[a.state.wallet,a.state.inventory.herbs]),before);
  const without=planSocietyDay(world,{buyerId:null,price:null});
  assert.notEqual(without.commands.find(c=>c.payload.actorId==='actor-3').payload.action,'SellMedicine');
});

test('C4 society adapter: authorized public quote changes actual peer cash transfer, not warehouse goods or world gold',()=>{
  const policy={buyerId:'actor-2',price:50},plan=planSocietyDay(world,policy),sale=plan.commands.find(c=>c.payload.actorId==='actor-3');
  const result=applySocietyAction(plan.world,sale.payload,null,policy);assert.equal(result.success,true);assert.equal(result.result.price,50);
  assert.equal(result.world.societyModel.agents[1].state.wallet,50);assert.equal(result.world.societyModel.agents[2].state.wallet,150);
  assert.deepEqual(result.world.resources,world.resources);
  assert.throws(()=>planSocietyDay(world,{buyerId:'actor-2',price:0}),bad);
  assert.throws(()=>applySocietyAction(plan.world,sale.payload,null,{buyerId:'actor-1',price:50}),bad);
});
