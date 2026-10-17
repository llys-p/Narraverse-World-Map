// Scene knowledge is a read-only actor-local projection over the audited persistent world.
import {inspectDescriptorTree} from '../core/experience-state.mjs';
import {validateBundle} from '../core/world-state.mjs';
import {canonicalSystems} from '../core/command-engine.mjs';
import {LIVELIHOOD_RULES} from '../core/scene-livelihood-runtime.mjs';
import {SCENE_RULES} from '../core/scene-runtime.mjs';
import {identifier,requireCondition,cloneData,canonicalJson} from '../core/data-contract.mjs';
const condition=actor=>!actor.alive?'dead':actor.health===1000?'healthy':'wounded';
const publicActor=actor=>({actorId:actor.actorId,name:actor.name,occupation:actor.occupation,
 location:actor.location,alive:actor.alive,condition:condition(actor)});
const byId=(a,b)=>a.actorId<b.actorId?-1:a.actorId>b.actorId?1:0;
export function projectSceneKnowledge(bundle,actorId){
 inspectDescriptorTree({bundle,actorId});identifier(actorId);
 const rules=bundle.snapshot.rulesVersion===LIVELIHOOD_RULES?LIVELIHOOD_RULES:SCENE_RULES;
 validateBundle(bundle,{rulesVersion:rules,systems:canonicalSystems(rules)});
 const s=bundle.snapshot,w=s.world,actor=w.actorModel.actors.find(a=>a.actorId===actorId);
 requireCondition(actor,'Unknown scene actor');
 const observer=w.memoryModel.observer.actors.find(a=>a.actorId===actorId);
 requireCondition(observer,'Scene actor lacks a persistent observer');
 const {actorId:omit,...self}=publicActor(actor);
 const value={knowledgeVersion:'scene-knowledge-v1',simulationId:s.simulationId,revision:s.revision,tick:s.tick,actorId,self,
 visibleActors:w.actorModel.actors.filter(a=>a.actorId!==actorId&&a.location===actor.location).map(publicActor).sort(byId),
 giftMemories:observer.memories.filter(m=>m.observable.type==='food-gift')};
 requireCondition(new TextEncoder().encode(canonicalJson(value)).length<=65536,'Scene knowledge exceeds byte budget','LIMIT_EXCEEDED');
 return cloneData(value);
}
