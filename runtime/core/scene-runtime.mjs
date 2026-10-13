// D4 CP1c: real scene creation and survival ticks; external scene intents await CP1 gift.
import {requireCondition,record,fields,integer} from './data-contract.mjs';
import {inspectDescriptorTree} from './experience-state.mjs';
import {sceneBaseRuntimeHooks,validateSceneBaseWorld} from './motivation-runtime.mjs';
import {createSceneEncounterRuntimeHooks,validateSceneEncounterWorldState} from './encounter-runtime.mjs';
export const SCENE_RULES='d-scene-survival-v1';
export const SCENE_PROFILE='scene-survival-village';
// Resolve the shared base only after this module cycle has finished initializing.
let cachedHooks=null;
const hooks=()=>cachedHooks??=createSceneEncounterRuntimeHooks(sceneBaseRuntimeHooks);
export const sceneRuntimeHooks=Object.freeze({
 createWorld:(memory,mind,motivation,experience,cognition,id)=>hooks().createWorld(memory,mind,motivation,experience,cognition,id),
 beforeSystems:(snapshot,events,tick,append,commit)=>hooks().beforeSystems(snapshot,events,tick,append,commit),
 afterSystems:(snapshot,events,tick,append,context)=>hooks().afterSystems(snapshot,events,tick,append,context),
 applyAction:(input,payload,sample=null)=>hooks().applyAction(input,payload,sample),
 settleDay:(world,sample)=>hooks().settleDay(world,sample),
 validateHistory:(snapshot,events)=>hooks().validateHistory(snapshot,events)
});
export function validateSceneWorldState(world,options={}){
 inspectDescriptorTree({world,options});record(world);record(options);fields(options,['tick']);
 const tick=options.tick;integer(tick);
 const {encounterModel,...base}=world;
 validateSceneBaseWorld(base);
 return validateSceneEncounterWorldState(world,{tick});
}
export function executeSceneIntent(bundle,dto){
 inspectDescriptorTree({bundle,dto});
 requireCondition(false,'Scene intents are unavailable until the gift transaction and complete journal replay are implemented','UNSUPPORTED_VERSION');
}
