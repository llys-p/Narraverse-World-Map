import { cloneData,requireCondition } from '../core/data-contract.mjs';
import { PLAYER_RULES } from '../core/player-runtime.mjs';
import { validateBundle } from '../core/world-state.mjs';
import { playerSystems } from '../fixtures/player-village.mjs';
export function buildPlayerKnowledge(bundle){
 validateBundle(bundle,{rulesVersion:PLAYER_RULES,systems:playerSystems()});const s=bundle.snapshot;
 requireCondition(s.fixtureId==='player-village' && s.fixtureVersion==='1','Unknown player knowledge profile','UNSUPPORTED_VERSION');
 const a=s.world.actorModel.actors.find(a=>a.actorId===s.world.playerModel.actorId),p=s.world.playerModel;
 const {actorId,name,occupation,location,simulationLevel,alive,deathTick,health,hunger,fatigue,needs}=a;
 return cloneData({simulationId:s.simulationId,revision:s.revision,tick:s.tick,self:{identity:{actorId,name,occupation,location,simulationLevel,alive,deathTick},health,hunger,fatigue,needs,wallet:p.wallet,inventory:p.inventory}});
}
