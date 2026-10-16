import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as actors from '../../runtime/core/actors.mjs';
import * as hunter from '../../runtime/core/hunter.mjs';
import * as society from '../../runtime/core/society.mjs';
import * as memory from '../../runtime/core/memory-runtime.mjs';
import {canonicalJson} from '../../runtime/core/data-contract.mjs';
const prefix='D:/Narraverse-World-Map-issue3-baseline/runtime/';
const prior=Object.fromEntries(await Promise.all(['actors','hunter','society','memory-runtime'].map(async n=>[n,await import(pathToFileURL(prefix+'core/'+n+'.mjs'))])));
const result=fn=>{try{fn();return {ok:true};}catch(e){return {ok:false,code:e.code,message:e.message};}};
const equal=(a,b,label)=>assert.ok(canonicalJson(a)===canonicalJson(b),label);
const configs=[prior['memory-runtime'].defaultMemoryConfig(),prior['memory-runtime'].defaultPersonalityConfig()];
for(const [file,name] of [['player-village','createPlayerVillage'],['player-play-village','createPlayerPlayVillage'],['encounter-survival-village','createEncounterVillage'],['scene-survival-village','createSceneVillage']]){
 const fixture=await import(pathToFileURL(prefix+'fixtures/'+file+'.mjs'));
 configs.push(fixture[name](42).bundle.snapshot.world.memoryModel.config);
}

test('configuration inspectors reproduce detached initial rosters and balances across six memory profiles',()=>{
 for(const config of configs){
  const a=prior.actors.createActorWorld(config.society.actors),inspectA=actors.inspectActorConfiguration(config.society.actors);
  equal(a.actorModel.actors,inspectA.actors,'initial actor roster');equal(a.resources,inspectA.resources,'initial actor balances');
  const s=prior.society.createSocietyWorld(config.society),inspectS=society.inspectSocietyConfiguration(config.society);
  equal(s.actorModel.actors,inspectS.actors,'society roster');equal(s.resources,inspectS.resources,'society balances');
  equal(s,society.createSocietyWorld(config.society),'society public constructor');
  const m=prior['memory-runtime'].createMemoryWorld(config);
  equal(m,memory.createMemoryWorld(config),'memory public constructor');
  assert.deepEqual(result(()=>memory.validateMemoryWorld(m)),result(()=>prior['memory-runtime'].validateMemoryWorld(m)));
  inspectA.actors[0].health=0;assert.notEqual(config.society.actors.initialActors[0].health,0,'inspector must not share inputs');
 }
});

test('hunter and society configuration checks preserve refusal and default semantics',()=>{
 for(const [current,old,factory,constructor,inspect] of [
  [hunter,prior.hunter,'defaultHunterConfig','createHunterWorld','validateHunterConfiguration'],
  [society,prior.society,'defaultSocietyConfig','createSocietyWorld','inspectSocietyConfiguration']]){
  for(const invalid of [undefined,null,false,0,[],new Date()])assert.deepEqual(result(()=>current[inspect](invalid)),result(()=>old[constructor](invalid)));
  const changes=[c=>{},c=>{c.version='bad';},c=>{c.actors.initialActors[1].occupation='merchant';},c=>{c.actors.market.ecology.resources.resources.food.initial=NaN;},
   c=>{c.actors=undefined;},c=>{c.extra=undefined;},c=>{Object.defineProperty(c,'version',{enumerable:true,get(){throw Error('getter executed');}});}];
  for(const change of changes){const config=old[factory]();change(config);assert.deepEqual(result(()=>current[inspect](config)),result(()=>old[constructor](config)));}
 }
});

test('upper world fingerprints and initial identity remain independently rechecked',()=>{
 for(const config of configs){
  const original=prior['memory-runtime'].createMemoryWorld(config);
  for(const mutate of [w=>{w.memoryModel.configFingerprint='tampered';},w=>{w.memoryModel.observer.initialActors[0].actorId='bad-identity';},
   w=>{w.societyModel.configFingerprint='tampered';},w=>{w.societyModel.config.estates[0].initialFood=1000000;}]){
   const world=structuredClone(original);mutate(world);
   assert.deepEqual(result(()=>memory.validateMemoryWorld(world)),result(()=>prior['memory-runtime'].validateMemoryWorld(world)));
  }
 }
 const h=prior.hunter.createHunterWorld();equal(h,hunter.createHunterWorld(),'hunter public constructor');
 h.hunterModel.configFingerprint='tampered';assert.deepEqual(result(()=>hunter.validateHunterWorld(h)),result(()=>prior.hunter.validateHunterWorld(h)));
});
