import { fields,record,integer,requireCondition,cloneData } from '../core/data-contract.mjs';
import { validateBundle } from '../core/world-state.mjs';
import { PERSONALITY_RULES } from '../core/memory-runtime.mjs';
import { memorySystems } from '../fixtures/memory-village.mjs';
import { PLAYER_RULES } from '../core/player-runtime.mjs';
import { playerSystems } from '../fixtures/player-village.mjs';
import { buildPlayerKnowledge } from '../knowledge/player-knowledge.mjs';
import { deriveClockReading } from '../core/simulation-clock.mjs';
import { parseStrictJson } from './strict-json.mjs';
export const MAX_COMMAND_BYTES=4096;
export const MAX_SERVICE_ADVANCE_TICKS=1440;
export function parseCommandBytes(bytes){return validateTimeCommandDto(parseStrictJson(bytes,MAX_COMMAND_BYTES));}
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
  requireCondition(false,'Runtime service profile is not registered','UNSUPPORTED_VERSION');
}
export function projectPlayerSnapshot(bundle){return cloneData({apiVersion:1,...buildPlayerKnowledge(bundle)});}
export function projectPublicSnapshot(bundle){
  const {rulesVersion,systems}=runtimeProfile(bundle);validateBundle(bundle,{rulesVersion,systems});
  const s=bundle.snapshot,w=s.world,actors=w.actorModel.actors,namedAlive=actors.filter(a=>a.alive).length;
  const unnamedAlive=w.actorModel.config.market.ecology.resources.settlement.humanCount-actors.length;
  return cloneData({apiVersion:1,simulationId:s.simulationId,revision:s.revision,tick:s.tick,clock:deriveClockReading(s.tick),
    market:{food:w.resources.food,herbs:w.resources.herbs,prices:{food:w.marketModel.prices.food,herbs:w.marketModel.prices.herbs},routeOpen:w.marketModel.routeOpen},
    population:{namedAlive,unnamedAlive,totalAlive:namedAlive+unnamedAlive,deer:w.ecologyModel.populations.deer,wolves:w.ecologyModel.populations.wolves},
    actors:actors.map(a=>({actorId:a.actorId,name:a.name,occupation:a.occupation,location:a.location,alive:a.alive}))});
}
