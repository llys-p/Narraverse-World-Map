// Explicit livelihood profile over the existing complete scene/encounter journal.
import {inspectDescriptorTree} from './experience-state.mjs';
import {fields,integer,record,cloneData} from './data-contract.mjs';
import {livelihoodBaseRuntimeHooks,validateLivelihoodBaseWorld} from './motivation-runtime.mjs';
import {createSceneEncounterRuntimeHooks,validateSceneEncounterWorldState} from './encounter-runtime.mjs';
import {preflightSceneIntent,auditGift,commitGift} from './scene-runtime.mjs';
import {observeSceneCommand} from './memory-runtime.mjs';
import {auditPlayerWork} from './player-work.mjs';
import {canonicalSystems} from './command-engine.mjs';
import {validateBundle,createAuditedBundle} from './world-state.mjs';
export const LIVELIHOOD_RULES='d-scene-livelihood-v1';
export const LIVELIHOOD_PROFILE='scene-livelihood-village';
let cached;
const hooks=()=>cached??=createSceneEncounterRuntimeHooks(livelihoodBaseRuntimeHooks,{rules:LIVELIHOOD_RULES,fixture:LIVELIHOOD_PROFILE,
 preflight:dto=>preflightSceneIntent(dto,4),auditGift,commitGift,auditWork:auditPlayerWork,observe:observeSceneCommand});
export const livelihoodRuntimeHooks=Object.freeze({
 createWorld:(...args)=>hooks().createWorld(...args),beforeSystems:(...args)=>hooks().beforeSystems(...args),
 afterSystems:(...args)=>hooks().afterSystems(...args),applyAction:(...args)=>hooks().applyAction(...args),
 settleDay:(...args)=>hooks().settleDay(...args),validateHistory:(...args)=>hooks().validateHistory(...args)
});
export function validateLivelihoodWorldState(world,options={}){
 inspectDescriptorTree({world,options});record(world);fields(options,['tick']);integer(options.tick);
 const {encounterModel,...base}=world;validateLivelihoodBaseWorld(base);return validateSceneEncounterWorldState(world,options);
}
function audit(bundle){validateBundle(bundle,{rulesVersion:LIVELIHOOD_RULES,systems:canonicalSystems(LIVELIHOOD_RULES)});}
export function describeLivelihoodEncounterActions(bundle){inspectDescriptorTree(bundle);audit(bundle);return cloneData(hooks().describeActions(bundle));}
export function describeLivelihoodGiftAvailability(bundle){inspectDescriptorTree(bundle);audit(bundle);const {outcome,reasonCode}=auditGift(bundle.snapshot.world);return {available:outcome==='succeeded',reasonCode};}
export function executeAuditedLivelihoodIntent(bundle,dto){
 inspectDescriptorTree({bundle,dto});preflightSceneIntent(dto,4);audit(bundle);const result=hooks().executeIntent(bundle,dto);
 return {bundle:createAuditedBundle(result.bundle,{rulesVersion:LIVELIHOOD_RULES,systems:canonicalSystems(LIVELIHOOD_RULES)}),receipt:cloneData(result.receipt)};
}
export function executeLivelihoodIntent(bundle,dto){const result=executeAuditedLivelihoodIntent(bundle,dto);return {bundle:cloneData(result.bundle),receipt:cloneData(result.receipt)};}
