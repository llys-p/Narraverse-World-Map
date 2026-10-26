// Fixtures 2/3/4: bounded village locomotion for actor-2, not a second action engine.
import {playAgencyDue} from './campaign-play.mjs';
import {fields,integer,requireCondition} from './data-contract.mjs';
import {campaignSurvivalTravel} from './motivation-runtime.mjs';
import {isSocialMapVersion,socialWorkReady} from './npc-social.mjs';
import {HUNTER_SITES} from './npc-village-sites.mjs';
export {HUNTER_SITES} from './npc-village-sites.mjs';

export const NPC_MAP_VERSION='campaign-map-v2';
export function initialHunterIntent(){return {action:'NoAction',planId:null,decidedTick:0};}
export function validateHunterIntent(intent,tick){
  fields(intent,['action','planId','decidedTick']);
  requireCondition(Object.hasOwn(HUNTER_SITES,intent.action),'Unknown hunter travel action');
  if(intent.planId!==null)integer(intent.planId,1);
  integer(intent.decidedTick);requireCondition(intent.decidedTick<=tick,'Hunter intent is in the future');
}
export function prepareHunterTravel(world,events,tick,simulationId){
  if(!playAgencyDue(world,tick))return;
  const next=campaignSurvivalTravel(world,events,tick,simulationId),previous=world.mapModel.hunterIntent;
  if(next.action!==previous.action||next.planId!==previous.planId)
    world.mapModel.hunterIntent={...next,decidedTick:tick};
}
export function hunterActionAtSite(map,payload){
  if(!(map?.version===NPC_MAP_VERSION||isSocialMapVersion(map?.version))||payload.actorId!=='actor-2'||!['WorkForPay','BuyFood'].includes(payload.action))return true;
  if(payload.action==='WorkForPay'&&!socialWorkReady(map))return false;
  const hunter=map.npcs[1],site=HUNTER_SITES[payload.action];
  return hunter.x===site.x&&hunter.y===site.y;
}
