import { cloneData,requireCondition } from '../core/data-contract.mjs';
import { PLAYER_RULES } from '../core/player-runtime.mjs';
import { PLAY_RULES } from '../core/player-state.mjs';
import { validateBundle } from '../core/world-state.mjs';
import { playerSystems } from '../fixtures/player-village.mjs';
import { playerPlaySystems } from '../fixtures/player-play-village.mjs';
import { fields,record } from '../core/data-contract.mjs';
export function buildPlayerKnowledge(bundle){
 fields(bundle,['snapshot','eventLog']);record(bundle.snapshot);const play=bundle.snapshot.rulesVersion===PLAY_RULES;
 validateBundle(bundle,{rulesVersion:play?PLAY_RULES:PLAYER_RULES,systems:play?playerPlaySystems():playerSystems()});const s=bundle.snapshot;
 requireCondition(s.fixtureId===(play?'player-play-village':'player-village') && s.fixtureVersion==='1','Unknown player knowledge profile','UNSUPPORTED_VERSION');
 const a=s.world.actorModel.actors.find(a=>a.actorId===s.world.playerModel.actorId),p=s.world.playerModel;
 const {actorId,name,occupation,location,simulationLevel,alive,deathTick,health,hunger,fatigue,needs}=a;
 return cloneData({simulationId:s.simulationId,revision:s.revision,tick:s.tick,self:{identity:{actorId,name,occupation,location,simulationLevel,alive,deathTick},health,hunger,fatigue,needs,wallet:p.wallet,inventory:p.inventory}});
}
