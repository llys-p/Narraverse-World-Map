import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPlayableCampaignVillage } from '../../runtime/fixtures/campaign-village.mjs';
import { validateSocietyWorld, createSocietyWorld } from '../../runtime/core/society.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';

const root=new URL('../../',import.meta.url);
const bytes=await fs.readFile(new URL('docs/evidence/campaign-config-cache-20261027/society.parent.source.txt',root));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'6e9a64856df333938330c2ba63c63a4d3904da88e9c332bbed6aaac5a27b737d');
const source=bytes.toString().replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,p,z)=>a+new URL(p,new URL('runtime/core/society.mjs',root)).href+z);
const parent=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function world(){const w=createPlayableCampaignVillage().bundle.snapshot.world;return Object.fromEntries(['resources','resourceModel','ecologyModel','marketModel','actorModel','societyModel','playerModel'].map(k=>[k,w[k]]));}
const both=w=>{validateSocietyWorld(w);parent.validateSocietyWorld(w);};

test('configuration reuse accepts equivalent copies and switches valid configurations without changing world data',()=>{
  const original=world(),before=structuredClone(original);both(original);
  for(const markup of [3,2,4,2]){
    const w=structuredClone(original);w.societyModel.config.saleMarkup=markup;
    w.societyModel.configFingerprint=canonicalJson(w.societyModel.config);both(w);both(structuredClone(w));
    Object.setPrototypeOf(w.societyModel.config,null);both(w);
  }
  assert.deepEqual(original,before);
});

test('warmed configuration proofs never accept changed invalid config, forged fingerprints or mutated frozen copies',()=>{
  const original=world();both(original);
  for(const mutate of [c=>c.saleMarkup=1001,c=>c.estates[0].actorId='actor-99',c=>c.economics.wage=-1,c=>c.reserveFoodDays=11,c=>c.actors.initialActors[0].health=1001,c=>c.trusted=true]){
    const bad=structuredClone(original);mutate(bad.societyModel.config);bad.societyModel.configFingerprint=canonicalJson(bad.societyModel.config);
    Object.freeze(bad.societyModel.config);
    for(const validate of [validateSocietyWorld,parent.validateSocietyWorld])assert.throws(()=>validate(bad));
    both(original);
  }
});

test('configuration proof hits do not skip current ledger, roster, estate configuration or player checks',()=>{
  const original=world();both(original);
  for(const mutate of [w=>w.resources.food++,w=>w.societyModel.agents[0].state.config.initialFood++,w=>w.societyModel.agents[0].state.wallet++,w=>w.societyModel.agents[0].trade.spent++,w=>w.playerModel.wallet++]){
    const bad=structuredClone(original);mutate(bad);
    for(const validate of [validateSocietyWorld,parent.validateSocietyWorld])assert.throws(()=>validate(bad));
  }
});

test('getters stay unread and proxy-supplied invalid configurations cannot borrow a warmed proof',()=>{
  const original=world();both(original);let getters=0;
  const bad=structuredClone(original);Object.defineProperty(bad.societyModel.config.economics,'wage',{enumerable:true,get(){getters++;return 1;}});
  for(const validate of [validateSocietyWorld,parent.validateSocietyWorld])assert.throws(()=>validate(bad));assert.equal(getters,0);
  const wrapped=structuredClone(original),economics={...wrapped.societyModel.config.economics,wage:-1};
  wrapped.societyModel.config=new Proxy(wrapped.societyModel.config,{get(target,k,receiver){return k==='economics'?economics:Reflect.get(target,k,receiver);}});
  for(const validate of [validateSocietyWorld,parent.validateSocietyWorld])assert.throws(()=>validate(wrapped));
  both(original);both(createSocietyWorld());
});
