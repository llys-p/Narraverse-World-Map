import { validateBundle,cloneBundle } from '../core/world-state.mjs';
import { MEMORY_RULES,PERSONALITY_RULES } from '../core/memory-runtime.mjs';
import { memorySystems } from '../fixtures/memory-village.mjs';
import { identifier,requireCondition,cloneData,fields,record } from '../core/data-contract.mjs';
import { projectActorEvent } from '../core/memory-observer.mjs';

// Full public entry audit precedes the whitelist projection. No caller-supplied
// trust flag, configuration or system can bypass history/visibility validation.
export function buildActorKnowledge(bundle,actorId){
  identifier(actorId);
  fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);
  const rulesVersion=bundle.snapshot.rulesVersion;
  requireCondition([MEMORY_RULES,PERSONALITY_RULES].includes(rulesVersion),'Unknown actor knowledge rules','UNSUPPORTED_VERSION');
  validateBundle(bundle,{rulesVersion,systems:memorySystems()});
  const {snapshot:s,eventLog}=cloneBundle(bundle),world=s.world,actor=world.actorModel.actors.find(a=>a.actorId===actorId);
  requireCondition(actor,'Unknown actor knowledge identity');
  const observed=world.memoryModel.observer.actors.find(a=>a.actorId===actorId);
  if(!actor.alive)return cloneData({actorId,alive:false,deathTick:actor.deathTick,memories:observed.memories,relationships:observed.relationships});
  const own=world.societyModel.agents.find(a=>a.state.actorId===actorId).state;
  const lastPublic=eventLog.findLast(e=>e.type==='SocietyDaySettled' && e.eventSeq<=world.memoryModel.observer.cursor);
  const market=lastPublic?projectActorEvent(lastPublic,actorId).find(p=>p.channel==='public').observable:
    {type:'village-market',food:world.resources.food,herbs:world.resources.herbs,prices:{food:world.marketModel.prices.food,herbs:world.marketModel.prices.herbs},
      routeOpen:world.marketModel.routeOpen,alive:world.actorModel.config.market.ecology.resources.settlement.humanCount-world.actorModel.actors.filter(a=>!a.alive).length};
  return cloneData({actorId,alive:true,tick:s.tick,revision:s.revision,
    self:{identity:{actorId,name:actor.name,occupation:actor.occupation,location:actor.location,simulationLevel:actor.simulationLevel,alive:true},
      health:actor.health,hunger:actor.hunger,fatigue:actor.fatigue,needs:actor.needs,wallet:own.wallet,inventory:own.inventory,currentGoal:own.currentGoal,
      ...(rulesVersion===PERSONALITY_RULES?{personality:world.memoryModel.config.personalities.find(p=>p.actorId===actorId)}:{})},
    public:{market,announcements:world.memoryModel.announcements.filter(f=>f.payload.expiresTick>=s.tick).map(f=>({type:f.type,...f.payload}))},
    memories:observed.memories,relationships:observed.relationships});
}
