import { fields,integer,denseArray,identifier,requireCondition } from './data-contract.mjs';
const keys=['healthWeightPermille','foodWeightPermille','restWeightPermille'];
export function neutralPersonalities(){return [1,2,3].map(i=>({actorId:'actor-'+i,healthWeightPermille:1000,foodWeightPermille:1000,restWeightPermille:1000}));}
export function validatePersonalities(roster){
  denseArray(roster,3);requireCondition(roster.length===3,'Personality needs three persistent identities');
  for(const [i,row] of roster.entries()){
    fields(row,['actorId',...keys]);requireCondition(row.actorId==='actor-'+(i+1),'Unordered/foreign personality identity');
    for(const key of keys){integer(row[key]);requireCondition(row[key]>=500 && row[key]<=2000,'Personality weight outside contract');}
  }
}
export function utilityWeightsFor(roster,actorId){
  validatePersonalities(roster);identifier(actorId);const row=roster.find(p=>p.actorId===actorId);requireCondition(row,'Unknown personality identity');
  return {health:row.healthWeightPermille,food:row.foodWeightPermille,rest:row.restWeightPermille};
}
export function weightNeedScores(scores,weights){
  fields(scores,['health','food','rest']);fields(weights,['health','food','rest']);const result={};
  for(const key of ['health','food','rest']){
    integer(scores[key]);integer(weights[key]);requireCondition(scores[key]<=1600 && weights[key]>=500 && weights[key]<=2000,'Need score/weight outside contract');
    result[key]=Math.floor(scores[key]*weights[key]/1000);
  }
  return result;
}
