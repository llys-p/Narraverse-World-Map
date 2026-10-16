import test from 'node:test';
import assert from 'node:assert/strict';
import { filterActivityEntries, validActivityView } from '../../runtime-activity.mjs';

function view() {
  return {
    apiVersion:1, activityViewVersion:1, perspective:'developer-world', simulationId:'test-world', revision:8, tick:12,
    actors:[{actorId:'actor-4',name:'玩家'},{actorId:'actor-2',name:'猎人'}],
    window:{maxSourceEvents:256,maxEntries:64,sourceEventsConsidered:3,truncated:false},
    entries:[
      {activityId:'event-1-item-0',sourceEventSeq:1,sourceItemIndex:0,tick:2,actorIds:['actor-2'],location:'village',
        locationEvidence:'event-location',kind:'gift',status:'succeeded',summary:'村庄赠粮'},
      {activityId:'event-2-item-0',sourceEventSeq:2,sourceItemIndex:0,tick:4,actorIds:['actor-4'],location:'forest',
        locationEvidence:'event-location',kind:'encounter-end',status:'succeeded',summary:'森林遭遇'},
      {activityId:'event-3-item-0',sourceEventSeq:3,sourceItemIndex:0,tick:6,actorIds:['actor-4'],location:null,
        locationEvidence:'unknown',kind:'player-action',status:'rejected',summary:'地点未知'}
    ]
  };
}

test('shared activity validator accepts the same-version complete DTO and rejects version or identity mismatch', () => {
  const valid = view();
  assert.equal(validActivityView(valid,valid),true);
  assert.equal(validActivityView({...valid,activityViewVersion:2},valid),false);
  assert.equal(validActivityView(valid,{...valid,simulationId:'other-world'}),false);
});

test('place filtering uses strict location equality and does not mutate the source DTO', () => {
  const source = view(), before = JSON.stringify(source);
  assert.deepEqual(filterActivityEntries(source.entries,'village').map(row => row.activityId),['event-1-item-0']);
  assert.deepEqual(filterActivityEntries(source.entries,'forest').map(row => row.activityId),['event-2-item-0']);
  assert.deepEqual(filterActivityEntries(source.entries,'other'),[]);
  assert.equal(JSON.stringify(source),before);
});
