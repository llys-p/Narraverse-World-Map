import test from 'node:test';import assert from 'node:assert/strict';import {createPlayableCampaignVillage} from '../../runtime/fixtures/campaign-village.mjs';import {createAuditedBundle,inspectAuditedBundleData} from '../../runtime/core/world-state.mjs';import {projectEncounterSnapshot,projectSceneSnapshot} from '../../runtime/service/http-contract.mjs';import {oldEncounter,oldScene} from '../helpers/short-parent-oracle.mjs';
test('certified read projections equal the parent, stay detached, and do not treat copied or proxy-wrapped worlds as privately audited data',()=>{
 const {bundle,systems}=createPlayableCampaignVillage(),audited=createAuditedBundle(bundle,{rulesVersion:'d-campaign-v1',systems});
 for(const [project,parent] of [[projectEncounterSnapshot,oldEncounter],[projectSceneSnapshot,oldScene]]){assert.deepEqual(project(audited),parent(structuredClone(audited)));assert.deepEqual(project(structuredClone(audited)),project(audited));const a=project(audited);a.self.alive=false;assert.equal(project(audited).self.alive,true);}
 let descriptors=0;const wrapped=new Proxy(audited,{getOwnPropertyDescriptor(target,key){descriptors++;return Reflect.getOwnPropertyDescriptor(target,key);}});inspectAuditedBundleData(wrapped);assert.ok(descriptors>0);
 const fake=Object.freeze(structuredClone(audited));fake.snapshot.world.playerModel.wallet++;for(const project of [projectEncounterSnapshot,projectSceneSnapshot])assert.throws(()=>project(fake));
});
test('raw getters are rejected before profile selection exactly as before, including fake trust fields and unknown metadata',()=>{
 const {bundle}=createPlayableCampaignVillage();let calls=0;
 for(const project of [projectEncounterSnapshot,projectSceneSnapshot,oldEncounter,oldScene])for(const unknown of [false,true]){const raw=structuredClone(bundle);if(unknown)raw.snapshot.fixtureVersion='unknown';Object.defineProperty(raw.snapshot.world,'trap',{enumerable:true,get(){calls++;return 1;}});assert.throws(()=>project(raw),{code:'INVALID_INPUT'});}
 const fake={...structuredClone(bundle),audited:true};Object.defineProperty(fake,'trap',{enumerable:true,get(){calls++;return 1;}});assert.throws(()=>inspectAuditedBundleData(fake));assert.equal(calls,0);
});
