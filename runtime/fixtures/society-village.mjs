import { createInitialBundle } from '../core/world-state.mjs';
import { SOCIETY_RULES,defaultSocietyConfig,createSocietyWorld,settleSocietyDay } from '../core/society.mjs';
export function createSocietyVillage(seed=42,simulationId='society-village',config=defaultSocietyConfig(),commands=[],fixtureId='society-village'){
  const systems={society(ctx){const result=settleSocietyDay(ctx.snapshot.world,ctx.rng.next());ctx.snapshot.world=result.world;
    ctx.emitFact({type:'SocietyDaySettled',sourceSystem:'society',commandId:null,causationEventSeqs:ctx.populationCauses,entityIds:[],payload:result.payload});}};
  const bundle=createInitialBundle({rulesVersion:SOCIETY_RULES,simulationId,fixtureId,fixtureVersion:'1',seed,world:createSocietyWorld(config),commands,
    scheduledTasks:[{taskId:'daily-society',systemId:'society',nextDueTick:144,intervalTicks:144,priority:10}],
  },systems);return {bundle,systems};
}
export function createSocietyMedicineRace(seed=42,simulationId='society-medicine-race'){
  const c=defaultSocietyConfig();c.actors.initialActors[0].health=500;c.actors.initialActors[1].health=500;
  c.actors.market.ecology.resources.resources.herbs.initial=1;c.estates.forEach(e=>e.initialWallet=100);
  return createSocietyVillage(seed,simulationId,c,[],'society-medicine-race');
}
export function createSocietyPeerSale(seed=42,simulationId='society-peer-sale'){
  const c=defaultSocietyConfig();c.actors.initialActors[1].health=500;c.estates[1].initialWallet=100;c.estates[2].initialHerbs=1;
  c.actors.market.ecology.resources.resources.herbs.initial=1;c.actors.market.ecology.resources.resources.herbs.production.numerator=0;
  return createSocietyVillage(seed,simulationId,c,[],'society-peer-sale');
}
