import { calibratedMarketConfig } from '../core/market.mjs';
import { createMarketVillage } from './market-village.mjs';
import { requireCondition } from '../core/data-contract.mjs';

// Frozen after seed-42 pilot. Legacy B1/B2/B3 presets and formulas remain unchanged.
export const B4_SCENARIOS = Object.freeze(['baseline','mild','severe','herb-shortage','trade-blocked']);
export const B4_SEEDS = Object.freeze([1,7,42,2026,65535]);
export const B4_HOLDOUT_SEEDS = Object.freeze([31415,27182]);
export const B4_CONFIG_HASHES = Object.freeze({
  normal:'f66f9dce1a8f74fd5e98c5d68706e76bd9e26644be8cd4d46783134e559d3761',
  shortage:'3c70fcd22e0c9da515b3127943253004aa4ae833feae1968a233d3ef062b5ffa',
});
export const B4_GATES = Object.freeze({
  baselineFinalDeerMin:150,baselineFinalDeerMax:210,baselineFinalWolvesMin:10,baselineFinalWolvesMax:18,
  mildRecoveryMaxDay:200,max1000DaysElapsedMs:60000,
});
export function createB4Config(scenario='baseline') {
  requireCondition(B4_SCENARIOS.includes(scenario),'Unknown B4 scenario');
  const config=calibratedMarketConfig();
  if(['herb-shortage','trade-blocked'].includes(scenario)) {
    config.ecology.resources.resources.herbs.initial=0;
    config.ecology.resources.resources.herbs.production.numerator=0;
  }
  return config;
}
export function createB4Fixture(scenario,seed=42,simulationId=`b4-${scenario}-seed-${seed}`) {
  const config=createB4Config(scenario),commands=[];
  if(scenario!=='baseline')commands.push({commandId:'day10-deer-removal',targetTick:1440,type:'RemovePopulation',payload:{species:'deer',amount:scenario==='mild'?30:110}});
  if(scenario==='trade-blocked')commands.push({commandId:'day10-route-close',targetTick:1440,type:'SetTradeRoute',payload:{open:false}});
  return createMarketVillage(seed,simulationId,config,commands,'b4-'+scenario);
}
