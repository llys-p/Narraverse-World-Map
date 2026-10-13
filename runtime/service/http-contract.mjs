import { fields,record,integer,requireCondition,cloneData,canonicalJson } from '../core/data-contract.mjs';
import { validateBundle } from '../core/world-state.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { PERSONALITY_RULES } from '../core/memory-runtime.mjs';
import { memorySystems } from '../fixtures/memory-village.mjs';
import { PLAYER_RULES } from '../core/player-runtime.mjs';
import { playerSystems } from '../fixtures/player-village.mjs';
import { buildPlayerKnowledge } from '../knowledge/player-knowledge.mjs';
import { PLAY_RULES,describePlayerActions } from '../core/player-intents.mjs';
import { playerPlaySystems } from '../fixtures/player-play-village.mjs';
import { deriveClockReading } from '../core/simulation-clock.mjs';
import { playerIntentDuration,canPlayerIntent } from '../core/player-state.mjs';
import { MIND_RULES } from '../core/mind-state.mjs';
import * as mindFixture from '../fixtures/mind-village.mjs';
import * as mindRuntime from '../core/mind-runtime.mjs';
import * as mindKnowledge from '../knowledge/mind-knowledge.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { SURVIVAL_RULES } from '../core/survival-state.mjs';
import { ENCOUNTER_RULES, ENCOUNTER_PROFILE, describeEncounterActions } from '../core/encounter-runtime.mjs';
import { encounterSystems } from '../fixtures/encounter-survival-village.mjs';
import { projectEncounterInspector } from '../knowledge/encounter-knowledge.mjs';
// The frozen inspector identity lives with the projection that serves it.
const SURVIVAL_INSPECTOR_VERSION = 'survival-inspector-v1';
const MAX_SURVIVAL_INSPECTOR_BYTES = 131072;
export const MAX_COMMAND_BYTES=4096;
export const SURVIVAL_SERVICE_FORMAT=7;
export const ENCOUNTER_SERVICE_FORMAT=8;
export const MAX_SERVICE_ADVANCE_TICKS=1440;
export { MIND_RULES };
const _mindBackend={fixture:mindFixture,runtime:mindRuntime,knowledge:mindKnowledge};
export function mindBackend(){return _mindBackend;}
// M2 contract §1: rules string of the motivation experiment. The canonical constant lands with
// A1's motivation-state.mjs; service5 only recognizes the contract-frozen value and never
// invents a compatible alias for it.
export const MOTIVATION_RULES='m-motivation-v1';
// M2 contract §4.0 assigns the eight public functions to three modules, without a barrel.
const MOTIVATION_MODULES={
  fixture:{specifier:'../fixtures/motivation-village.mjs',exports:['defaultMotivationVillageConfig','createMotivationVillage','motivationSystems']},
  runtime:{specifier:'../core/motivation-runtime.mjs',exports:['validateMotivationWorld','executeMotivationPlayerIntent','describeMotivationPlayerActions']},
  knowledge:{specifier:'../knowledge/motivation-knowledge.mjs',exports:['buildMotivationKnowledge','projectMotivationInspector']},
};
let _motivationBackend=null;
export async function loadMotivationBackend(){
  if(_motivationBackend?.backend)return _motivationBackend;
  if(_motivationBackend?.failure)throw _motivationBackend.failure;
  const backend={};
  for(const [name,{specifier,exports}] of Object.entries(MOTIVATION_MODULES)){
    let module;
    try{
      module=await import(specifier);
      for(const key of exports)requireCondition(typeof module[key]==='function',`A2 ${specifier} is missing export ${key}`,'UNSUPPORTED_VERSION');
    }
    catch(error){
      const dependencyPending=error?.code==='ERR_MODULE_NOT_FOUND' && error.url===new URL(specifier,import.meta.url).href;
      _motivationBackend={backend:null,dependencyPending,missingSpecifier:dependencyPending?specifier:null,
        error:String(error?.message??error),errorCode:error?.code??null,failure:dependencyPending?null:error};
      if(!dependencyPending)throw error;
      return _motivationBackend;
    }
    backend[name]=module;
  }
  _motivationBackend={backend,dependencyPending:false,missingSpecifier:null,error:null,errorCode:null};
  return _motivationBackend;
}
export function motivationBackendState(){
  return _motivationBackend?{available:Boolean(_motivationBackend.backend),dependencyPending:_motivationBackend.dependencyPending,
    missingSpecifier:_motivationBackend.missingSpecifier,error:_motivationBackend.error,errorCode:_motivationBackend.errorCode}
    :{available:false,dependencyPending:false,missingSpecifier:null,error:'motivation backend has not been loaded yet',errorCode:null};
}
export function requireMotivationBackend(){
  if(_motivationBackend?.failure)throw _motivationBackend.failure;
  const backend=_motivationBackend?.backend;
  requireCondition(backend,'M2 motivation runtime module is not available in this deployment','UNSUPPORTED_VERSION');
  return backend;
}
// M3-4A contract §2: cognition backend loader, same recording shape as the M2 loader. Only an
// ERR_MODULE_NOT_FOUND for one of the exact target modules themselves may stay pending;
// anything else (bad exports, syntax, transitive failure, init throw) fails with the cause.
export const COGNITION_RULES='m-cognition-v1';
const COGNITION_MODULES={
  fixture:{specifier:'../fixtures/cognition-village.mjs',exports:['defaultCognitionVillageConfig','createCognitionVillage','cognitionSystems']},
  runtime:{specifier:'../core/motivation-runtime.mjs',exports:['validateCognitionWorld','executeCognitionPlayerIntent','describeCognitionPlayerActions']},
  knowledge:{specifier:'../knowledge/cognition-knowledge.mjs',exports:['buildCognitionKnowledge','projectCognitionInspector']},
};
let _cognitionBackend=null;
export async function loadCognitionBackend(){
  if(_cognitionBackend?.backend)return _cognitionBackend;
  if(_cognitionBackend?.failure)throw _cognitionBackend.failure;
  const backend={};
  for(const [name,{specifier,exports}] of Object.entries(COGNITION_MODULES)){
    let module;
    try{
      module=await import(specifier);
      for(const key of exports)requireCondition(typeof module[key]==='function',`${specifier} is missing cognition export ${key}`,'UNSUPPORTED_VERSION');
      if(name==='knowledge'){
        requireCondition(module.COGNITION_INSPECTOR_VERSION==='cognition-inspector-v1',
          'Incompatible cognition inspector version','UNSUPPORTED_VERSION');
        requireCondition(module.MAX_COGNITION_INSPECTOR_BYTES===131072,
          'Incompatible cognition inspector budget','UNSUPPORTED_VERSION');
      }
    }
    catch(error){
      const dependencyPending=error?.code==='ERR_MODULE_NOT_FOUND' && error.url===new URL(specifier,import.meta.url).href;
      _cognitionBackend={backend:null,dependencyPending,missingSpecifier:dependencyPending?specifier:null,
        error:String(error?.message??error),errorCode:error?.code??null,failure:dependencyPending?null:error};
      if(!dependencyPending)throw error;
      return _cognitionBackend;
    }
    backend[name]=module;
  }
  _cognitionBackend={backend,dependencyPending:false,missingSpecifier:null,error:null,errorCode:null,failure:null};
  return _cognitionBackend;
}
export function cognitionBackendState(){
  return _cognitionBackend?{available:Boolean(_cognitionBackend.backend),dependencyPending:_cognitionBackend.dependencyPending,
    missingSpecifier:_cognitionBackend.missingSpecifier,error:_cognitionBackend.error,errorCode:_cognitionBackend.errorCode}
    :{available:false,dependencyPending:false,missingSpecifier:null,error:'cognition backend has not been loaded yet',errorCode:null};
}
export function requireCognitionBackend(){
  if(_cognitionBackend?.failure)throw _cognitionBackend.failure;
  const backend=_cognitionBackend?.backend;
  requireCondition(backend,'M3 cognition runtime module is not available in this deployment','UNSUPPORTED_VERSION');
  return backend;
}
// M4A contract §3.1: the survival backend loader. Same recording shape as the M2/M3 loaders.
// Only an ERR_MODULE_NOT_FOUND for one of the exact target modules themselves may stay pending;
// anything else (bad exports, syntax, transitive failure, init throw) fails with the cause.
const SURVIVAL_MODULES={
  fixture:{specifier:'../fixtures/survival-village.mjs',exports:['defaultSurvivalVillageConfig','createSurvivalVillage','survivalSystems']},
  runtime:{specifier:'../core/motivation-runtime.mjs',exports:['validateSurvivalWorld','executeSurvivalPlayerIntent','describeSurvivalPlayerActions']},
  knowledge:{specifier:'../knowledge/survival-knowledge.mjs',exports:['buildSurvivalKnowledge','projectSurvivalInspector']},
};
let _survivalBackend=null;
export async function loadSurvivalBackend(){
  if(_survivalBackend?.backend)return _survivalBackend;
  if(_survivalBackend?.failure)throw _survivalBackend.failure;
  const backend={};
  for(const [name,{specifier,exports}] of Object.entries(SURVIVAL_MODULES)){
    let module;
    try{
      module=await import(specifier);
      for(const key of exports)requireCondition(typeof module[key]==='function',`${specifier} is missing survival export ${key}`,'UNSUPPORTED_VERSION');
      if(name==='knowledge'){
        requireCondition(module.SURVIVAL_INSPECTOR_VERSION===SURVIVAL_INSPECTOR_VERSION,
          'Incompatible survival inspector version','UNSUPPORTED_VERSION');
        requireCondition(module.MAX_SURVIVAL_INSPECTOR_BYTES===131072,
          'Incompatible survival inspector budget','UNSUPPORTED_VERSION');
      }
    }
    catch(error){
      const dependencyPending=error?.code==='ERR_MODULE_NOT_FOUND' && error.url===new URL(specifier,import.meta.url).href;
      _survivalBackend={backend:null,dependencyPending,missingSpecifier:dependencyPending?specifier:null,
        error:String(error?.message??error),errorCode:error?.code??null,failure:dependencyPending?null:error};
      if(!dependencyPending)throw error;
      return _survivalBackend;
    }
    backend[name]=module;
  }
  _survivalBackend={backend,dependencyPending:false,missingSpecifier:null,error:null,errorCode:null,failure:null};
  return _survivalBackend;
}
export function survivalBackendState(){
  return _survivalBackend?{available:Boolean(_survivalBackend.backend),dependencyPending:_survivalBackend.dependencyPending,
    missingSpecifier:_survivalBackend.missingSpecifier,error:_survivalBackend.error,errorCode:_survivalBackend.errorCode}
    :{available:false,dependencyPending:false,missingSpecifier:null,error:'survival backend has not been loaded yet',errorCode:null};
}
export function requireSurvivalBackend(){
  if(_survivalBackend?.failure)throw _survivalBackend.failure;
  const backend=_survivalBackend?.backend;
  requireCondition(backend,'M4A survival runtime module is not available in this deployment','UNSUPPORTED_VERSION');
  return backend;
}
export function parseCommandBytes(bytes,commandDtoVersion=1){
  requireCondition(commandDtoVersion===1 || commandDtoVersion===3,'Unknown command DTO mode','UNSUPPORTED_VERSION');
  const dto=validateServiceCommandDto(parseStrictJson(bytes,MAX_COMMAND_BYTES));
  requireCondition(commandDtoVersion===3?dto.version===3:dto.version!==3,
    commandDtoVersion===3?'Encounter service requires command DTO version 3':'Command DTO version is unsupported by this service','UNSUPPORTED_VERSION');
  return dto;
}
function validateEncounterCommandDto(dto){
  inspectDescriptorTree(dto);
  requireCondition(new TextEncoder().encode(canonicalJson(dto)).length<=MAX_COMMAND_BYTES,'Command exceeds budget','LIMIT_EXCEEDED');
  fields(dto,['version','commandId','expectedRevision','type','payload']);
  requireCondition(dto.version===3,'Unknown command DTO version','UNSUPPORTED_VERSION');
  requireCondition(typeof dto.commandId==='string' && dto.commandId.length<=64 && /^[A-Za-z0-9_-]+$/.test(dto.commandId) &&
    !dto.commandId.startsWith('society-day-'),'Invalid action command ID');
  integer(dto.expectedRevision);
  if(dto.type==='AdvanceTime'){
    fields(dto.payload,['ticks']);integer(dto.payload.ticks,1);requireCondition(dto.payload.ticks<=144000,'Time command exceeds budget','LIMIT_EXCEEDED');
  }else if(dto.type==='PlayerTravel'){
    fields(dto.payload,['destination']);requireCondition(['village','forest'].includes(dto.payload.destination),'Invalid destination');
  }else if(dto.type==='PlayerRest')fields(dto.payload,[]);
  else if(['PlayerBuy','PlayerSell'].includes(dto.type)){
    fields(dto.payload,['product','quantity']);requireCondition(['food','herbs'].includes(dto.payload.product),'Invalid product');
    integer(dto.payload.quantity,1);requireCondition(dto.payload.quantity<=10,'Quantity exceeds budget','LIMIT_EXCEEDED');
  }else if(dto.type==='EncounterBegin')fields(dto.payload,[]);
  else if(dto.type==='EncounterAction'){
    fields(dto.payload,['encounterId','action']);requireCondition(typeof dto.payload.encounterId==='string' && dto.payload.encounterId.length>0 &&
      dto.payload.encounterId.length<=64 && ['attack','flee'].includes(dto.payload.action),'Invalid encounter action');
  }else if(dto.type==='EncounterCancel'){
    fields(dto.payload,['encounterId']);requireCondition(typeof dto.payload.encounterId==='string' && dto.payload.encounterId.length>0 &&
      dto.payload.encounterId.length<=64,'Invalid encounter ID');
  }else requireCondition(false,'Unknown action type');
  return cloneData(dto);
}
export function validateServiceCommandDto(dto){
  record(dto);
  if(Object.getOwnPropertyDescriptor(dto,'version')?.value===3)return validateEncounterCommandDto(dto);
  fields(dto,['version','commandId','expectedRevision','type','payload']);
  if(dto.version===1)return validateTimeCommandDto(dto);
  requireCondition(dto.version===2,'Unknown command DTO version','UNSUPPORTED_VERSION');
  requireCondition(typeof dto.commandId==='string' && dto.commandId.length<=64 && /^[A-Za-z0-9_-]+$/.test(dto.commandId) &&
    !dto.commandId.startsWith('society-day-'),'Invalid action command ID');integer(dto.expectedRevision);
  if(dto.type==='PlayerTravel'){fields(dto.payload,['destination']);requireCondition(['village','forest'].includes(dto.payload.destination),'Invalid destination');}
  else if(dto.type==='PlayerRest')fields(dto.payload,[]);
  else if(['PlayerBuy','PlayerSell'].includes(dto.type)){
    fields(dto.payload,['product','quantity']);requireCondition(['food','herbs'].includes(dto.payload.product),'Invalid product');integer(dto.payload.quantity,1);
    requireCondition(dto.payload.quantity<=10,'Quantity exceeds budget','LIMIT_EXCEEDED');
  }else requireCondition(false,'Unknown action type');
  return cloneData(dto);
}
export function validateTimeCommandDto(dto){
  fields(dto,['version','commandId','expectedRevision','type','payload']);
  requireCondition(dto.version===1,'Unknown command DTO version','UNSUPPORTED_VERSION');
  requireCondition(typeof dto.commandId==='string' && dto.commandId.length<=64 && /^[A-Za-z0-9_-]+$/.test(dto.commandId),'Invalid command ID');
  integer(dto.expectedRevision);requireCondition(dto.type==='AdvanceTime','Unknown command type');fields(dto.payload,['ticks']);integer(dto.payload.ticks,1);
  requireCondition(dto.payload.ticks<=MAX_SERVICE_ADVANCE_TICKS,'Time command exceeds budget','LIMIT_EXCEEDED');return cloneData(dto);
}
export function runtimeProfile(bundle){
  fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);const s=bundle.snapshot;
  requireCondition(s.fixtureVersion==='1','Unknown service fixture version','UNSUPPORTED_VERSION');
  if(s.rulesVersion===PERSONALITY_RULES && s.fixtureId==='personality-neutral')return {serviceFormatVersion:1,rulesVersion:PERSONALITY_RULES,systems:memorySystems()};
  if(s.rulesVersion===PLAYER_RULES && s.fixtureId==='player-village')return {serviceFormatVersion:2,rulesVersion:PLAYER_RULES,systems:playerSystems()};
  if(s.rulesVersion===PLAY_RULES && s.fixtureId==='player-play-village')return {serviceFormatVersion:3,rulesVersion:PLAY_RULES,systems:playerPlaySystems()};
  if(s.rulesVersion===MIND_RULES && s.fixtureId==='mind-village'){
    return {serviceFormatVersion:4,rulesVersion:MIND_RULES,systems:_mindBackend.fixture.mindSystems()};
  }
  if(s.rulesVersion===MOTIVATION_RULES && s.fixtureId==='motivation-village'){
    return {serviceFormatVersion:5,rulesVersion:MOTIVATION_RULES,systems:requireMotivationBackend().fixture.motivationSystems()};
  }
  if(s.rulesVersion===COGNITION_RULES && s.fixtureId==='cognition-village'){
    return {serviceFormatVersion:6,rulesVersion:COGNITION_RULES,systems:requireCognitionBackend().fixture.cognitionSystems()};
  }
  if(s.rulesVersion===SURVIVAL_RULES && s.fixtureId==='survival-village'){
    return {serviceFormatVersion:7,rulesVersion:SURVIVAL_RULES,systems:requireSurvivalBackend().fixture.survivalSystems()};
  }
  if(s.rulesVersion===ENCOUNTER_RULES && s.fixtureId===ENCOUNTER_PROFILE){
    return {serviceFormatVersion:ENCOUNTER_SERVICE_FORMAT,rulesVersion:ENCOUNTER_RULES,systems:encounterSystems()};
  }
  requireCondition(false,'Runtime service profile is not registered','UNSUPPORTED_VERSION');
}
export function projectPlayerSnapshot(bundle){
  const profile=runtimeProfile(bundle);let actions;
  if([5,6,7,8].includes(profile.serviceFormatVersion)){
    validateBundle(bundle,{rulesVersion:profile.rulesVersion,systems:profile.systems});
    const s=bundle.snapshot,p=s.world.playerModel,a=s.world.actorModel.actors.find(actor=>actor.actorId==='actor-4');
    requireCondition(p.actorId==='actor-4' && a,'Player identity is missing');
    const {actorId,name,occupation,location,simulationLevel,alive,deathTick,health,hunger,fatigue,needs}=a;
    actions=profile.serviceFormatVersion===8?describeEncounterWorldActions(bundle):profile.serviceFormatVersion===7?requireSurvivalBackend().runtime.describeSurvivalPlayerActions(bundle):
      profile.serviceFormatVersion===6?requireCognitionBackend().runtime.describeCognitionPlayerActions(bundle):
      requireMotivationBackend().runtime.describeMotivationPlayerActions(bundle);
    return cloneData({apiVersion:1,simulationId:s.simulationId,revision:s.revision,tick:s.tick,
      self:{identity:{actorId,name,occupation,location,simulationLevel,alive,deathTick},health,hunger,fatigue,needs,
        wallet:p.wallet,inventory:p.inventory},actions});
  }
  if(profile.serviceFormatVersion===3)actions=describePlayerActions(bundle);
  else if(profile.serviceFormatVersion===4)actions=_mindBackend.runtime.describeMindPlayerActions(bundle);
  return cloneData({apiVersion:1,...buildPlayerKnowledge(bundle),...(actions?{actions}:{})});
}
function describeEncounterWorldActions(bundle){
  const w=bundle.snapshot.world,a=w.actorModel.actors.find(actor=>actor.actorId==='actor-4'),active=w.encounterModel.encounter?.status==='active';
  const prices=Object.fromEntries(['food','herbs'].map(id=>[id,{buy:w.marketModel.prices[id],sell:Math.max(1,Math.floor(w.marketModel.prices[id]/2))}]));
  const canTrade=!active && ['PlayerBuy','PlayerSell'].some(type=>['food','herbs'].some(product=>
    canPlayerIntent(w,{commandId:'service-action-view',type,payload:{product,quantity:1}})));
  return {travelTicks:playerIntentDuration({commandId:'service-action-view',type:'PlayerTravel',payload:{destination:a.location==='forest'?'village':'forest'}}),
    restTicks:playerIntentDuration({commandId:'service-action-view',type:'PlayerRest',payload:{}}),tradeTicks:1,maxQuantity:10,
    locations:['village','forest'],prices,canTrade:a.alive && a.location==='village' && canTrade};
}
export function projectPublicSnapshot(bundle){
  const {rulesVersion,systems}=runtimeProfile(bundle);validateBundle(bundle,{rulesVersion,systems});
  const s=bundle.snapshot,w=s.world,actors=w.actorModel.actors,namedAlive=actors.filter(a=>a.alive).length;
  const unnamedAlive=w.actorModel.config.market.ecology.resources.settlement.humanCount-actors.length;
  return cloneData({apiVersion:1,simulationId:s.simulationId,revision:s.revision,tick:s.tick,clock:deriveClockReading(s.tick),
    market:{food:w.resources.food,herbs:w.resources.herbs,prices:{food:w.marketModel.prices.food,herbs:w.marketModel.prices.herbs},routeOpen:w.marketModel.routeOpen},
    population:{namedAlive,unnamedAlive,totalAlive:namedAlive+unnamedAlive,deer:w.ecologyModel.populations.deer,wolves:w.ecologyModel.populations.wolves},
    actors:actors.map(a=>({actorId:a.actorId,name:a.name,occupation:a.occupation,location:a.location,alive:a.alive}))});
}
export function projectEncounterSnapshot(bundle){
  inspectDescriptorTree(bundle);
  const profile=runtimeProfile(bundle);
  requireCondition(profile.serviceFormatVersion===ENCOUNTER_SERVICE_FORMAT,'Encounter projection requires the encounter profile','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion:profile.rulesVersion,systems:profile.systems});
  const s=bundle.snapshot,w=s.world,actor=w.actorModel.actors.find(entry=>entry.actorId==='actor-4');
  requireCondition(actor,'Encounter actor is missing');
  const wolves=w.ecologyModel.populations.wolves,reserved=w.ecologyModel.reservedWolves;
  return cloneData({apiVersion:1,encounterViewVersion:1,simulationId:s.simulationId,revision:s.revision,tick:s.tick,actorId:'actor-4',
    self:{alive:actor.alive,health:actor.health,location:actor.location,deathTick:actor.deathTick},
    encounter:w.encounterModel.encounter===null?null:cloneData(w.encounterModel.encounter),
    population:{totalLivingWolves:wolves,availableWolves:wolves-reserved,reservedWolves:reserved,
      battleDeaths:w.ecologyModel.ledger.wolves.battleDeaths},actions:describeEncounterActions(bundle)});
}
// Read-only developer projection. Format4 keeps the M1 projection; format5/6 dispatch to the
// motivation/cognition inspectors. Every entry fully re-validates the bundle before returning
// detached JSON data, so the served DTO is always one audited candidate.
export function projectMindInspector(bundle){
  const format=runtimeProfile(bundle).serviceFormatVersion;
  if(format===5)return cloneData(requireMotivationBackend().knowledge.projectMotivationInspector(bundle));
  if(format===6)return cloneData(requireCognitionBackend().knowledge.projectCognitionInspector(bundle));
  if(format===7)return cloneData(requireSurvivalBackend().knowledge.projectSurvivalInspector(bundle));
  if(format===8)return cloneData(projectEncounterInspector(bundle));
  return cloneData(_mindBackend.knowledge.projectMindInspector(bundle));
}
