import { fields,record,integer,requireCondition,cloneData } from '../core/data-contract.mjs';
import { validateBundle } from '../core/world-state.mjs';
import { PERSONALITY_RULES } from '../core/memory-runtime.mjs';
import { memorySystems } from '../fixtures/memory-village.mjs';
import { PLAYER_RULES } from '../core/player-runtime.mjs';
import { playerSystems } from '../fixtures/player-village.mjs';
import { buildPlayerKnowledge } from '../knowledge/player-knowledge.mjs';
import { PLAY_RULES,describePlayerActions } from '../core/player-intents.mjs';
import { playerPlaySystems } from '../fixtures/player-play-village.mjs';
import { deriveClockReading } from '../core/simulation-clock.mjs';
import { MIND_RULES } from '../core/mind-state.mjs';
import * as mindFixture from '../fixtures/mind-village.mjs';
import * as mindRuntime from '../core/mind-runtime.mjs';
import * as mindKnowledge from '../knowledge/mind-knowledge.mjs';
import { parseStrictJson } from './strict-json.mjs';
export const MAX_COMMAND_BYTES=4096;
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
export function parseCommandBytes(bytes){return validateServiceCommandDto(parseStrictJson(bytes,MAX_COMMAND_BYTES));}
export function validateServiceCommandDto(dto){
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
  requireCondition(false,'Runtime service profile is not registered','UNSUPPORTED_VERSION');
}
export function projectPlayerSnapshot(bundle){
  const profile=runtimeProfile(bundle);let actions;
  if(profile.serviceFormatVersion===5){
    validateBundle(bundle,{rulesVersion:MOTIVATION_RULES,systems:profile.systems});
    const s=bundle.snapshot,p=s.world.playerModel,a=s.world.actorModel.actors.find(actor=>actor.actorId==='actor-4');
    requireCondition(p.actorId==='actor-4' && a,'Motivation player identity is missing');
    const {actorId,name,occupation,location,simulationLevel,alive,deathTick,health,hunger,fatigue,needs}=a;
    actions=requireMotivationBackend().runtime.describeMotivationPlayerActions(bundle);
    return cloneData({apiVersion:1,simulationId:s.simulationId,revision:s.revision,tick:s.tick,
      self:{identity:{actorId,name,occupation,location,simulationLevel,alive,deathTick},health,hunger,fatigue,needs,
        wallet:p.wallet,inventory:p.inventory},actions});
  }
  if(profile.serviceFormatVersion===3)actions=describePlayerActions(bundle);
  else if(profile.serviceFormatVersion===4)actions=_mindBackend.runtime.describeMindPlayerActions(bundle);
  return cloneData({apiVersion:1,...buildPlayerKnowledge(bundle),...(actions?{actions}:{})});
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
// Read-only developer projection (contract M2 §7 Inspector). Format4 keeps the M1 projection;
// format5 dispatches to A2's projectMotivationInspector. Both entries fully re-validate the
// bundle before returning detached JSON data, so the served DTO is always one audited candidate.
export function projectMindInspector(bundle){
  if(runtimeProfile(bundle).serviceFormatVersion===5)return cloneData(requireMotivationBackend().knowledge.projectMotivationInspector(bundle));
  return cloneData(_mindBackend.knowledge.projectMindInspector(bundle));
}
