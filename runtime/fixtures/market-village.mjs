import { createInitialBundle } from '../core/world-state.mjs';
import { MARKET_RULES, defaultMarketConfig, shortageMarketConfig, createMarketWorld, settleMarketDay } from '../core/market.mjs';

export function createMarketVillage(seed=42,simulationId='market-village',config=defaultMarketConfig(),commands=[],fixtureId='market-village') {
  const systems={market(context){
    const result=settleMarketDay(context.snapshot.world,context.rng.next());context.snapshot.world=result.world;
    context.emitFact({type:'EconomyDaySettled',sourceSystem:'market',commandId:null,
      causationEventSeqs:context.populationCauses,entityIds:[],payload:result.payload});
  }};
  const bundle=createInitialBundle({rulesVersion:MARKET_RULES,simulationId,fixtureId,fixtureVersion:'1',seed,world:createMarketWorld(config),commands,
    scheduledTasks:[{taskId:'daily-market',systemId:'market',nextDueTick:144,intervalTicks:144,priority:10}],
  },systems);return {bundle,systems};
}
export function createMarketShortage(seed=42,simulationId='market-shortage') {
  return createMarketVillage(seed,simulationId,shortageMarketConfig(),[],'market-shortage');
}
export function createMarketRoutePause(seed=42,simulationId='market-route-pause') {
  return createMarketVillage(seed,simulationId,shortageMarketConfig(),[
    {commandId:'close-day2',targetTick:288,type:'SetTradeRoute',payload:{open:false}},
    {commandId:'open-day4',targetTick:576,type:'SetTradeRoute',payload:{open:true}},
  ],'market-route-pause');
}
