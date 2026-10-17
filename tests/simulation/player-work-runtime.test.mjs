import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivelihoodVillage,defaultLivelihoodVillageConfig} from '../../runtime/fixtures/scene-livelihood-village.mjs';
import {createSceneVillage} from '../../runtime/fixtures/scene-survival-village.mjs';
import {executeLivelihoodIntent,LIVELIHOOD_RULES} from '../../runtime/core/scene-livelihood-runtime.mjs';
import {executeSceneIntent} from '../../runtime/core/scene-runtime.mjs';
import {auditPlayerWork,applyPlayerWork,validatePlayerWorkResult} from '../../runtime/core/player-work.mjs';
import {validateBundle} from '../../runtime/core/world-state.mjs';
import {canonicalJson,cloneData} from '../../runtime/core/data-contract.mjs';
import {playerIntentDuration,canPlayerIntent,applyPlayerAction} from '../../runtime/core/player-state.mjs';
const dto=(b,id,type='PlayerWork',payload={})=>({version:4,commandId:id,expectedRevision:b.snapshot.revision,type,payload});
const run=(b,id,type,payload)=>executeLivelihoodIntent(b,dto(b,id,type,payload));

test('D4E9-R1 exact profile pairing and old scene rejects work without mutation',()=>{
 const {bundle}=createLivelihoodVillage();const w=bundle.snapshot.world;
 assert.equal(bundle.snapshot.rulesVersion,LIVELIHOOD_RULES);assert.equal(w.memoryModel.config.version,'memory-config-v7');assert.equal(w.societyModel.config.version,'society-config-v6');assert.equal(w.playerModel.version,'player-state-v4');
 assert.equal(w.playerModel.wallet,0);assert.equal(w.playerModel.inventory.food,20);assert.equal(w.playerModel.lastWorkStartTick,null);
 const bad=defaultLivelihoodVillageConfig();bad.memory.society.version='society-config-v5';assert.throws(()=>createLivelihoodVillage(42,'bad',bad),{code:'UNSUPPORTED_VERSION'});
 const old=createSceneVillage().bundle,before=canonicalJson(old);assert.throws(()=>executeSceneIntent(old,{...dto(old,'old'),version:3}));assert.equal(canonicalJson(old),before);
 const intent={commandId:'old-helper',type:'PlayerWork',payload:{}};assert.throws(()=>playerIntentDuration(intent),{code:'INVALID_INPUT'});assert.throws(()=>canPlayerIntent(old.snapshot.world,intent),{code:'INVALID_INPUT'});assert.throws(()=>applyPlayerAction(old.snapshot.world,{commandId:intent.commandId,targetTick:36,payload:{startTick:0,intent:{type:intent.type,payload:{}}}}),{code:'INVALID_INPUT'});
 assert.throws(()=>executeLivelihoodIntent(bundle,{...dto(bundle,'wrong'),version:3}),{code:'UNSUPPORTED_VERSION'});
});

test('D4E9-R2 pure work guard, completion recheck, transfer conservation and safe integer boundaries',()=>{
 const base=createLivelihoodVillage().bundle.snapshot.world;
 const denied=[w=>{w.actorModel.actors[3].alive=false;},w=>{w.actorModel.actors[3].location='forest';},w=>{w.actorModel.actors[3].health=299;},w=>{w.actorModel.actors[3].fatigue=701;},w=>{w.resources.gold=19;},w=>{w.encounterModel.encounter={status:'active'};},w=>{w.playerModel.lastWorkStartTick=0;}];
 for(const mutate of denied){const w=cloneData(base);mutate(w);assert.equal(auditPlayerWork(w,36).outcome,'rejected');const before=canonicalJson(w);const r=applyPlayerWork(w,{commandId:'denied',targetTick:72,payload:{startTick:36,intent:{type:'PlayerWork',payload:{}}}});assert.equal(r.success,false);assert.equal(canonicalJson(r.world),before);assert.equal(canonicalJson(w),before);}
 const w=cloneData(base);w.actorModel.actors[3].health=300;w.actorModel.actors[3].fatigue=700;
 const before=canonicalJson(w),r=applyPlayerWork(w,{commandId:'edge',targetTick:36,payload:{startTick:0,intent:{type:'PlayerWork',payload:{}}}});assert.equal(r.success,true);validatePlayerWorkResult(r.result);assert.equal(canonicalJson(w),before);
 assert.equal(r.world.resources.gold,w.resources.gold);assert.equal(canonicalJson(r.world.societyModel),canonicalJson(w.societyModel));assert.deepEqual(r.world.playerModel.inventory,w.playerModel.inventory);assert.equal(r.world.playerModel.ledger.earned,0);assert.equal(r.world.playerModel.ledger.wages,20);assert.equal(r.world.actorModel.actors[3].fatigue,850);
 for(const mutate of [w=>{w.playerModel.ledger.wages=Number.MAX_SAFE_INTEGER;},w=>{w.playerModel.ledger.workCount=Number.MAX_SAFE_INTEGER;}]){const w=cloneData(base);mutate(w);assert.throws(()=>auditPlayerWork(w,0),{code:'LIMIT_EXCEEDED'});}
 assert.throws(()=>auditPlayerWork(base,Number.MAX_SAFE_INTEGER-143),{code:'LIMIT_EXCEEDED'});
 const cooldown=r.world;assert.equal(auditPlayerWork(cooldown,143).outcome,'rejected');assert.equal(auditPlayerWork(cooldown,144).outcome,'rejected','fatigue remains too high until rested');cooldown.actorModel.actors[3].fatigue=0;assert.equal(auditPlayerWork(cooldown,144).outcome,'succeeded');
});

test('D4E9-R3 real work journal is idempotent, cooldown is a zero tick receipt and tampering cannot survive replay',()=>{
 const {bundle,systems}=createLivelihoodVillage(),out=run(bundle,'work'),next=out.bundle;
 assert.equal(out.receipt.durationTicks,36);assert.equal(out.receipt.receiptVersion,4);assert.equal(next.snapshot.world.playerModel.ledger.workCount,1);assert.equal(next.snapshot.world.playerModel.lastWorkStartTick,0);
 assert.deepEqual(executeLivelihoodIntent(next,dto(bundle,'work')).receipt,out.receipt);
 assert.throws(()=>executeLivelihoodIntent(next,{...dto(bundle,'work'),expectedRevision:1}),{code:'COMMAND_ID_CONFLICT'});
 const cooldown=run(next,'cooldown');assert.equal(cooldown.receipt.outcome,'rejected');assert.equal(cooldown.receipt.durationTicks,0);assert.equal(cooldown.bundle.snapshot.tick,36);assert.equal(cooldown.bundle.snapshot.revision,37);assert.equal(cooldown.bundle.snapshot.world.playerModel.ledger.workCount,1);
 const fact=next.eventLog.find(e=>e.type==='PlayerWorkCommitted'),resolved=next.eventLog.find(e=>e.type==='EncounterCommandResolved');assert.deepEqual(resolved.causationEventSeqs,[fact.eventSeq]);
 assert.equal(next.snapshot.world.memoryModel.observer.actors.some(a=>a.memories.some(m=>JSON.stringify(m).includes('PlayerWork'))),false);
 for(const mutate of [b=>{b.snapshot.world.playerModel.ledger.wages+=20;b.snapshot.world.playerModel.ledger.workCount++;b.snapshot.world.playerModel.wallet+=20;},b=>{b.snapshot.world.playerModel.lastWorkStartTick=1;},b=>{b.eventLog.find(e=>e.type==='PlayerWorkCommitted').payload.wage=21;},b=>{b.snapshot.world.encounterModel.inputHistory[0].receipt.result.nextWorkTick=145;},b=>{b.eventLog.find(e=>e.type==='EncounterCommandResolved').causationEventSeqs=[];}]){const b=cloneData(next);mutate(b);assert.throws(()=>validateBundle(b,{rulesVersion:LIVELIHOOD_RULES,systems}));}
});

test('D4E9-R4 completion exactly on daily tick pays before settlement and settles food once',()=>{
 let {bundle}=createLivelihoodVillage();bundle=run(bundle,'wait','AdvanceTime',{ticks:108}).bundle;const out=run(bundle,'boundary-work');
 assert.equal(out.receipt.tick,144);assert.equal(out.receipt.result.after.fatigue,150);assert.equal(out.bundle.snapshot.world.actorModel.actors[3].fatigue,0);assert.equal(out.bundle.snapshot.world.playerModel.ledger.foodUsed,1);
 const work=out.bundle.eventLog.find(e=>e.type==='PlayerWorkCommitted'),daily=out.bundle.eventLog.find(e=>e.type==='SocietyDaySettled');assert.equal(work.tick,144);assert.ok(work.eventSeq<daily.eventSeq);assert.equal(out.bundle.snapshot.world.playerModel.lastWorkStartTick,108);
});

test('D4E9-R5 completion rejection retains real elapsed ticks and starvation settlement without wages',()=>{
 const config=defaultLivelihoodVillageConfig();config.memory.society.player.initialFood=0;Object.assign(config.memory.society.actors.initialActors[3],{health:300,hunger:1000});
 let {bundle}=createLivelihoodVillage(42,'work-recheck',config);bundle=run(bundle,'wait','AdvanceTime',{ticks:120}).bundle;const out=run(bundle,'failed-completion');
 assert.equal(out.receipt.durationTicks,36);assert.equal(out.receipt.tick,156);assert.equal(out.receipt.outcome,'rejected');assert.equal(out.bundle.snapshot.world.playerModel.ledger.wages,0);assert.equal(out.bundle.snapshot.world.playerModel.ledger.workCount,0);assert.equal(out.bundle.snapshot.world.playerModel.lastWorkStartTick,null);assert.equal(out.bundle.snapshot.world.actorModel.day,1);assert.ok(out.bundle.snapshot.world.actorModel.actors[3].health<300);assert.equal(out.bundle.eventLog.some(e=>e.type==='PlayerWorkCommitted'),false);
});
