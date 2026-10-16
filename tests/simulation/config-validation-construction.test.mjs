import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as data from '../../runtime/core/data-contract.mjs';
import * as resource from '../../runtime/core/resource-ledger.mjs';
import * as ecology from '../../runtime/core/ecology.mjs';
import * as market from '../../runtime/core/market.mjs';
import * as actors from '../../runtime/core/actors.mjs';
const oldRoot='D:/Narraverse-World-Map-issue3-baseline/runtime/core/';
const prior=Object.fromEntries(await Promise.all(['data-contract','resource-ledger','ecology','market','actors'].map(async name=>[name,await import(pathToFileURL(oldRoot+name+'.mjs'))])));
const outcome=fn=>{try{fn();return {ok:true};}catch(error){return {ok:false,code:error.code,message:error.message};}};

test('validation-only data walk preserves canonical validation order and executes no getter',()=>{
 assert.equal(typeof data.validateJsonData,'function');
 const shared={v:-0},cyclic={};cyclic.self=cyclic;
 let getters=0;const accessor={};Object.defineProperty(accessor,'late',{enumerable:true,get(){getters++;return 1;}});
 let deep=true;for(let i=0;i<65;i++)deep={v:deep};
 const outer={a:NaN};Object.defineProperty(outer,'z',{enumerable:true,get(){getters++;return true;}});
 const values=[null,true,false,-0,1.5,'\ud800粮',Object.assign(Object.create(null),{b:1,a:2}),{one:shared,two:shared},
 undefined,NaN,Infinity,-Infinity,1n,Symbol('invalid'),()=>{},new Date(),cyclic,deep,accessor,outer,[,1]];
 const extra=[1];extra.x=2;values.push(extra);
 const symbol={};symbol[Symbol('k')]=1;values.push(symbol);
 for(const value of values)assert.deepEqual(outcome(()=>data.validateJsonData(value)),outcome(()=>prior['data-contract'].canonicalJson(value)));
 assert.equal(getters,0);
});

test('pure configuration validators preserve constructor rejection codes and messages',()=>{
 const layers=[['resource-ledger',resource,'defaultResourceConfig','createResourceWorld','validateResourceConfiguration'],
 ['ecology',ecology,'defaultEcologyConfig','createEcologyWorld','validateEcologyConfiguration'],
 ['market',market,'defaultMarketConfig','createMarketWorld','validateMarketConfiguration']];
 for(const [name,current,factory,constructor,validate] of layers){
  assert.equal(typeof current[validate],'function');
  for(const invalid of [undefined,null,0,false,'bad',[],new Date()])
   assert.deepEqual(outcome(()=>current[validate](invalid)),outcome(()=>prior[name][constructor](invalid)),name+' defaults/type');
  const cases=[c=>{},c=>{c.version='unknown';},c=>{c.extra=1;},c=>{Object.setPrototypeOf(c,Date.prototype);},
   c=>{Object.defineProperty(c,'extra',{value:1,enumerable:false});},c=>{c[Symbol('bad')]=1;},
   c=>{Object.defineProperty(c,'version',{enumerable:true,get(){throw Error('getter executed');}});}];
  for(const mutate of cases){const config=prior[name][factory]();mutate(config);
   assert.deepEqual(outcome(()=>current[validate](config)),outcome(()=>prior[name][constructor](config)),name);}
  const config=prior[name][factory]();
  for(const mutate of [c=>{c.flows=[,];},c=>{c.flows=Array.from({length:1001},()=>({}));},c=>{c.resources.food.initial=NaN;},c=>{c.settlement.humanCount=-1;},c=>{c.resources.herbs.production.denominator=0;}]){
   const v=structuredClone(config),r=name==='resource-ledger'?v:name==='ecology'?v.resources:v.ecology.resources;mutate(r);
   assert.deepEqual(outcome(()=>current[validate](v)),outcome(()=>prior[name][constructor](v)),name+' nested');
  }
 }
});

test('public world constructors keep byte-exact output across legacy fixture versions',()=>{
 for(const [name,current,factories,constructor] of [
 ['resource-ledger',resource,['defaultResourceConfig'],'createResourceWorld'],
 ['ecology',ecology,['defaultEcologyConfig'],'createEcologyWorld'],
 ['market',market,['defaultMarketConfig','shortageMarketConfig','calibratedMarketConfig'],'createMarketWorld'],
 ['actors',actors,['defaultActorConfig'],'createActorWorld']]){
  for(const factory of factories){const config=prior[name][factory]();
   assert.equal(data.canonicalJson(current[constructor](config)),prior['data-contract'].canonicalJson(prior[name][constructor](config)));}
 }
 for(const version of ['actor-config-v1','actor-config-v2','actor-config-v3','actor-config-v4']){
  const config=prior.actors.defaultActorConfig();config.version=version;
  const world=prior.actors.createActorWorld(config);
  assert.deepEqual(outcome(()=>actors.validateActorWorld(world)),outcome(()=>prior.actors.validateActorWorld(world)));
  world.actorModel.config.market.products.food.basePrice=-1;
  assert.deepEqual(outcome(()=>actors.validateActorWorld(world)),outcome(()=>prior.actors.validateActorWorld(world)));
 }
});

test('world validators preserve lower-layer fingerprint and configuration refusal',()=>{
 for(const [name,current,factory,constructor,validate,model] of [
  ['ecology',ecology,'defaultEcologyConfig','createEcologyWorld','validateEcologyWorld','ecologyModel'],
  ['market',market,'defaultMarketConfig','createMarketWorld','validateMarketWorld','marketModel']]){
   for(const mutate of [w=>{},w=>{w[model].configFingerprint='tampered';},w=>{w[model].config.version='bad';},
     w=>{w.resourceModel.config.resources.food.initial=NaN;},w=>{w[model].config=undefined;}]){
    const world=prior[name][constructor](prior[name][factory]());mutate(world);
    assert.deepEqual(outcome(()=>current[validate](world)),outcome(()=>prior[name][validate](world)),name);
   }
 }
});
