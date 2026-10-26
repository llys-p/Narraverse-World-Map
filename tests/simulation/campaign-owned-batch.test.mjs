import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as fixtures from '../../runtime/fixtures/campaign-village.mjs';
import {performCampaignTicks} from '../../runtime/core/command-engine.mjs';
import {validateCampaignWorldState} from '../../runtime/core/scene-campaign-runtime.mjs';
const root=new URL('../../',import.meta.url),evidence=new URL('docs/evidence/campaign-owned-batch-20261026/',root);
async function moduleFrom(source,file){
  const rebased=source.replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,p,z)=>a+new URL(p,new URL(file,root)).href+z);
  return import('data:text/javascript;base64,'+Buffer.from(rebased).toString('base64'));
}
async function parent(name){
  const bytes=await fs.readFile(new URL(name+'.parent.source.txt',evidence));
  const hashes=JSON.parse(await fs.readFile(new URL('parent-sources.json',evidence)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hashes[name]);
  return moduleFrom(bytes.toString(),'runtime/core/'+name+'.mjs');
}
const oldEngine=await parent('command-engine'),oldWorld=await parent('scene-campaign-runtime');
test('owned batches equal the frozen parent for multiple seeds and return fully detached results',()=>{
  for(const seed of [1,42,987]){
    const {bundle}=fixtures.createPlayableCampaignVillage(seed,'owned-seed-'+seed),before=structuredClone(bundle);
    const actual=performCampaignTicks(bundle,24),expected=oldEngine.performCampaignTicks(bundle,24);
    assert.deepEqual(actual,expected);assert.deepEqual(bundle,before);
    actual.snapshot.world.mapModel.position.x=9;actual.eventLog[0].payload.extra=true;
    assert.deepEqual(bundle,before);assert.notDeepEqual(actual,expected);
  }
});
test('a failure after the daily settlement discards all private progress in both parent and candidate batches',async()=>{
  const anchor='validateSnapshotStructure(s, { rulesVersion, systems }, candidate.eventLog.length);';
  for(const source of [await fs.readFile(new URL('command-engine.parent.source.txt',evidence),'utf8'),await fs.readFile(new URL('runtime/core/command-engine.mjs',root),'utf8')]){
    assert.equal(source.split(anchor).length,2);
    // Local test-only fault after the real structural check; production has no injection hook.
    const engine=await moduleFrom(source.replace(anchor,anchor+"if(s.tick===145)throw Object.assign(new Error('late test fault'),{code:'TEST_LATE_FAILURE'});"),'runtime/core/command-engine.mjs');
    const {bundle}=fixtures.createPlayableCampaignVillage(),before=structuredClone(bundle);
    assert.throws(()=>engine.performCampaignTicks(bundle,146),e=>e.code==='TEST_LATE_FAILURE'&&e.failedTick===145);
    assert.deepEqual(bundle,before);assert.deepEqual(engine.performCampaignTicks(bundle,1),oldEngine.performCampaignTicks(bundle,1));
  }
});
test('structural canonical bytes preserve all fixture proofs, null prototypes, negative zero, and cache result isolation',()=>{
  function normalize(v){if(!v||typeof v!=='object')return;for(const k of Object.keys(v)){if(v[k]===0)v[k]=-0;else normalize(v[k]);}if(!Array.isArray(v))Object.setPrototypeOf(v,null);}
  for(const factory of ['createCampaignVillage','createNpcCampaignVillage','createSocialCampaignVillage','createNegotiationCampaignVillage','createMemoryCampaignVillage','createPlayableCampaignVillage']){
    const {bundle}=fixtures[factory](),world=bundle.snapshot.world;normalize(world);const before=structuredClone(world);
    const result=validateCampaignWorldState(world,{tick:0});assert.deepEqual(result,oldWorld.validateCampaignWorldState(world,{tick:0}));
    result.errors.push('external mutation');assert.deepEqual(validateCampaignWorldState(world,{tick:0}).errors,[]);
    assert.deepEqual(structuredClone(world),before);
  }
});
test('native parse consumes validated bytes without toJSON callbacks and rejects hostile descriptors and forged keys',()=>{
  const {bundle}=fixtures.createPlayableCampaignVillage(),world=bundle.snapshot.world;let calls=0;
  const prior=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try{
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){calls++;throw Error('must not serialize objects with native stringify');}});
    assert.deepEqual(validateCampaignWorldState(world,{tick:0}),oldWorld.validateCampaignWorldState(world,{tick:0}));assert.equal(calls,0);
  }finally{if(prior)Object.defineProperty(Object.prototype,'toJSON',prior);else delete Object.prototype.toJSON;}
  for(const mutate of [w=>Object.defineProperty(w,'trap',{enumerable:true,get(){calls++;return 1;}}),w=>Object.defineProperty(w,'__proto__',{enumerable:true,value:{polluted:true}}),w=>w.mapModel.position.x=NaN,w=>w.extra=w,w=>{w.extra={};let p=w.extra;for(let i=0;i<66;i++)p=p.child={};}]){
    const bad=structuredClone(world);mutate(bad);for(const validate of [validateCampaignWorldState,oldWorld.validateCampaignWorldState])assert.throws(()=>validate(bad,{tick:0}));
  }
  assert.equal(calls,0);assert.equal(Object.prototype.polluted,undefined);
});
