import { fields,integer,requireCondition,cloneData } from '../core/data-contract.mjs';
import { validateBundle } from '../core/world-state.mjs';
import { PERSONALITY_RULES } from '../core/memory-runtime.mjs';
import { memorySystems } from '../fixtures/memory-village.mjs';
import { deriveClockReading } from '../core/simulation-clock.mjs';
export const MAX_COMMAND_BYTES=4096;
export const MAX_SERVICE_ADVANCE_TICKS=1440;
export function validateTimeCommandDto(dto){
  fields(dto,['version','commandId','expectedRevision','type','payload']);
  requireCondition(dto.version===1,'Unknown command DTO version','UNSUPPORTED_VERSION');
  requireCondition(typeof dto.commandId==='string' && dto.commandId.length<=64 && /^[A-Za-z0-9_-]+$/.test(dto.commandId),'Invalid command ID');
  integer(dto.expectedRevision);requireCondition(dto.type==='AdvanceTime','Unknown command type');fields(dto.payload,['ticks']);integer(dto.payload.ticks,1);
  requireCondition(dto.payload.ticks<=MAX_SERVICE_ADVANCE_TICKS,'Time command exceeds budget','LIMIT_EXCEEDED');return cloneData(dto);
}
export function projectPublicSnapshot(bundle){
  validateBundle(bundle,{rulesVersion:PERSONALITY_RULES,systems:memorySystems()});
  const s=bundle.snapshot,w=s.world,actors=w.actorModel.actors,namedAlive=actors.filter(a=>a.alive).length;
  const unnamedAlive=w.actorModel.config.market.ecology.resources.settlement.humanCount-actors.length;
  return cloneData({apiVersion:1,simulationId:s.simulationId,revision:s.revision,tick:s.tick,clock:deriveClockReading(s.tick),
    market:{food:w.resources.food,herbs:w.resources.herbs,prices:{food:w.marketModel.prices.food,herbs:w.marketModel.prices.herbs},routeOpen:w.marketModel.routeOpen},
    population:{namedAlive,unnamedAlive,totalAlive:namedAlive+unnamedAlive,deer:w.ecologyModel.populations.deer,wolves:w.ecologyModel.populations.wolves},
    actors:actors.map(a=>({actorId:a.actorId,name:a.name,occupation:a.occupation,location:a.location,alive:a.alive}))});
}
