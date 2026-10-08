import test from 'node:test';
import assert from 'node:assert/strict';
import { createMindVillage,defaultMindVillageConfig } from '../../runtime/fixtures/mind-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';

test('M1 recover-health goal respects day-21 deadline and two-day cooldown before creating the next goal',()=>{
  const config=defaultMindVillageConfig();
  config.mind.stimuli=[];
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial=0;
  for(const estate of config.memory.society.estates.slice(1,3))estate.initialFood=32;
  const fixture=createMindVillage(42,'mind-goal-boundary-seed42',config);
  const session=createSimulationSession(fixture.bundle,fixture.systems);
  const world=()=>session.getBundle().snapshot.world;
  const actors=()=>world().societyModel.agents.slice(1,3).map(({state})=>state);
  const byActor=id=>actors().find(actor=>actor.actorId===id);
  const decisionOf=id=>world().mindModel.actors.find(actor=>actor.actorId===id).lastDecision;

  session.advanceTicks(144);
  for(const id of ['actor-2','actor-3']){
    const actor=byActor(id);
    assert.deepEqual(actor.currentGoal,{goalId:1,kind:'recover-health',step:'wait',startDay:1,deadlineDay:21,failures:0,target:800});
    assert.equal(decisionOf(id).choice,'NoAction');
    assert.equal(actor.ledger.goalsFailed,0);
  }

  session.advanceTicks(19*144);
  for(const id of ['actor-2','actor-3']){
    const actor=byActor(id);
    assert.equal(actor.day,20);
    assert.equal(actor.currentGoal.goalId,1);
    assert.equal(actor.currentGoal.deadlineDay,21);
    assert.equal(actor.currentGoal.failures,0,'waiting without medicine does not count as a failed action');
    assert.equal(actor.ledger.goalsFailed,0);
    assert.equal(decisionOf(id).choice,'NoAction');
  }

  session.advanceTicks(144);
  for(const id of ['actor-2','actor-3']){
    const actor=byActor(id);
    assert.equal(actor.day,21);
    assert.equal(actor.currentGoal,null,'the day-21 settlement terminates the goal at its deadline');
    assert.equal(actor.cooldownUntilDay,23);
    assert.equal(actor.ledger.goalsFailed,1);
    assert.equal(decisionOf(id).choice,'NoAction');
  }

  session.advanceTicks(144);
  for(const id of ['actor-2','actor-3']){
    const actor=byActor(id);
    assert.equal(actor.day,22);
    assert.equal(actor.currentGoal,null,'cooldown day 22 cannot create another goal');
    assert.equal(actor.nextGoalId,2);
    assert.equal(actor.ledger.goalsFailed,1);
  }

  session.advanceTicks(144);
  for(const id of ['actor-2','actor-3']){
    const actor=byActor(id);
    assert.equal(actor.day,23);
    assert.deepEqual(actor.currentGoal,{goalId:2,kind:'recover-health',step:'wait',startDay:23,deadlineDay:43,failures:0,target:800});
    assert.equal(actor.nextGoalId,3);
    assert.equal(actor.ledger.goalsFailed,1,'the ended goal is counted exactly once');
  }
});
