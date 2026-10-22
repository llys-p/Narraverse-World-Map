// Fixture 2 only: bounded village locomotion for actor-2, not a second action engine.
import {fields,integer,requireCondition} from './data-contract.mjs';
import {campaignSurvivalTravel} from './motivation-runtime.mjs';

export const NPC_MAP_VERSION='campaign-map-v2';
export const HUNTER_SITES=Object.freeze({
  WorkForPay:Object.freeze({x:5,y:6}),
  BuyFood:Object.freeze({x:3,y:7}),
  Rest:Object.freeze({x:5,y:8}),
  NoAction:Object.freeze({x:5,y:8})
});
export function initialHunterIntent(){return {action:'NoAction',planId:null,decidedTick:0};}
export function validateHunterIntent(intent,tick){
  fields(intent,['action','planId','decidedTick']);
  requireCondition(Object.hasOwn(HUNTER_SITES,intent.action),'Unknown hunter travel action');
  if(intent.planId!==null)integer(intent.planId,1);
  integer(intent.decidedTick);requireCondition(intent.decidedTick<=tick,'Hunter intent is in the future');
}
export function prepareHunterTravel(world,events,tick,simulationId){
  if(tick%4!==0)return;
  const next=campaignSurvivalTravel(world,events,tick,simulationId),previous=world.mapModel.hunterIntent;
  if(next.action!==previous.action||next.planId!==previous.planId)
    world.mapModel.hunterIntent={...next,decidedTick:tick};
}
export function hunterActionAtSite(map,payload){
  if(map?.version!==NPC_MAP_VERSION||payload.actorId!=='actor-2'||!['WorkForPay','BuyFood'].includes(payload.action))return true;
  const hunter=map.npcs[1],site=HUNTER_SITES[payload.action];
  return hunter.x===site.x&&hunter.y===site.y;
}
