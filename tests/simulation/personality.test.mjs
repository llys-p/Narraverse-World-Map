import test from 'node:test';
import assert from 'node:assert/strict';
import { neutralPersonalities,validatePersonalities,utilityWeightsFor,weightNeedScores } from '../../runtime/core/personality.mjs';
const bad=e=>['INVALID_INPUT','LIMIT_EXCEEDED','UNSUPPORTED_VERSION'].includes(e.code);

test('C5 personality: fixed integer preferences weight needs without creating zero-score needs or changing ties',()=>{
  const roster=neutralPersonalities();validatePersonalities(roster);
  assert.deepEqual(weightNeedScores({health:850,food:600,rest:0},utilityWeightsFor(roster,'actor-2')),{health:850,food:600,rest:0});
  roster[1].foodWeightPermille=2000;
  assert.deepEqual(weightNeedScores({health:850,food:600,rest:0},utilityWeightsFor(roster,'actor-2')),{health:850,food:1200,rest:0});
  const weights=utilityWeightsFor(roster,'actor-2');weights.food=500;assert.equal(roster[1].foodWeightPermille,2000);
  assert.deepEqual(weightNeedScores({health:1,food:1,rest:1},{health:500,food:500,rest:500}),{health:0,food:0,rest:0});
});

test('C5 personality: exact ordered IDs and bounded weights reject sparse, accessor, foreign or unsafe data atomically',()=>{
  for(const mutate of [r=>r.reverse(),r=>r[1].actorId='actor-1',r=>r[1].foodWeightPermille=499,r=>r[1].healthWeightPermille=2001,
    r=>r[1].restWeightPermille=1.5,r=>r[1].extra=true]){const r=neutralPersonalities();mutate(r);assert.throws(()=>validatePersonalities(r),bad);}
  assert.throws(()=>validatePersonalities(Array(3)),bad);assert.throws(()=>validatePersonalities(new Date()),bad);
  const r=neutralPersonalities();let reads=0;Object.defineProperty(r[1],'foodWeightPermille',{enumerable:true,get(){reads++;return 1000;}});
  assert.throws(()=>validatePersonalities(r),bad);assert.equal(reads,0);
  assert.throws(()=>utilityWeightsFor(neutralPersonalities(),'unknown'),bad);
  assert.throws(()=>weightNeedScores({health:Number.MAX_SAFE_INTEGER,food:0,rest:0},{health:2000,food:1000,rest:1000}),bad);
});
