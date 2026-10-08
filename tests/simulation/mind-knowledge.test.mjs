// M1A mind knowledge: the read-only committed/decision projections, the M1B inspector
// DTO partition, dispatch through the old actor/player knowledge entries and old-profile
// regression.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMindVillage } from '../../runtime/fixtures/mind-village.mjs';
import { createMemoryVillage } from '../../runtime/fixtures/memory-village.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { buildMindKnowledge,projectMindInspector } from '../../runtime/knowledge/mind-knowledge.mjs';
import { buildActorKnowledge } from '../../runtime/knowledge/actor-knowledge.mjs';
import { buildPlayerKnowledge } from '../../runtime/knowledge/player-knowledge.mjs';

const advance=(ticks)=>{const f=createMindVillage();const s=createSimulationSession(f.bundle,f.systems);s.advanceTicks(ticks);return s.getBundle();};

test('tick0 knowledge: unknown belief, initial posted quote with observedTick 0 and no source',()=>{
  const b=createMindVillage().bundle;
  const k=buildMindKnowledge(b,'actor-2');
  assert.equal(k.knowledgeVersion,'mind-knowledge-v1');
  assert.equal(k.phase,'committed');
  assert.equal(k.simulationId,'mind-village');
  assert.equal(k.tick,0);assert.equal(k.revision,0);
  assert.deepEqual(k.belief,{topic:'public-herbs-available',value:'unknown',confidencePermille:0,
    evidenceRefs:[],contradictionRefs:[],lastUpdatedTick:null});
  assert.deepEqual(k.quote,{product:'herbs',price:50,observedTick:0,sourceEventSeq:null});
  assert.equal(k.innerStance,'uncertain-supply');
  assert.deepEqual(k.observations,[]);
  assert.equal(k.committedIntent,null);
  assert.equal(k.self.wallet,100);
  assert.equal(k.self.health,400);
  assert.equal(k.self.inventory.herbs,0);
});

test('non-mind identities are refused with MIND_ACTOR_UNAVAILABLE',()=>{
  const b=createMindVillage().bundle;
  for(const id of ['actor-1','actor-4','actor-9'])
    assert.throws(()=>buildMindKnowledge(b,id),e=>e.code==='MIND_ACTOR_UNAVAILABLE');
});

test('speech is not stock: bellef stays personal while worldFacts keep the real count',()=>{
  const b24=advance(24);
  const k2=buildMindKnowledge(b24,'actor-2'),k3=buildMindKnowledge(b24,'actor-3');
  assert.equal(k2.belief.value,'unavailable');
  assert.equal(k3.belief.value,'available');
  assert.equal(k2.innerStance,'expect-no-supply');
  assert.equal(k3.innerStance,'expect-supply');
  assert.equal(k2.belief.evidenceRefs.length,1);
  const inspector=projectMindInspector(b24);
  assert.equal(inspector.apiVersion,1);
  assert.equal(inspector.mindVersion,'mind-inspector-v1');
  assert.equal(inspector.view,'developer');
  assert.equal(inspector.tick,24);
  assert.equal(inspector.revision,24);
  assert.equal(inspector.worldFacts.publicHerbs,20);
  assert.equal(inspector.worldFacts.postedHerbPrice,50);
  assert.equal(inspector.actors.length,2);
  assert.deepEqual(inspector.actors[0].knowledge,k2);
  assert.deepEqual(inspector.actors[1].knowledge,k3);
  assert.equal(inspector.actors[0].lastDecision,null);
  assert.equal(inspector.actors[0].lastOutcome,null);
  // The all-knowing world partition and the personal partition disagree by design.
  assert.notEqual(inspector.worldFacts.publicHerbs>0,inspector.actors[0].knowledge.belief.value==='available');
});

test('actor/player entry dispatch: M routes to mind knowledge, old profiles keep their shapes',()=>{
  const b=createMindVillage().bundle;
  assert.deepEqual(buildActorKnowledge(b,'actor-2'),buildMindKnowledge(b,'actor-2'));
  assert.throws(()=>buildActorKnowledge(b,'actor-1'),e=>e.code==='MIND_ACTOR_UNAVAILABLE');
  const player=buildPlayerKnowledge(b);
  assert.equal(player.self.identity.actorId,'actor-4');
  assert.equal(player.tick,0);
  assert.equal(player.self.wallet,100);
  // Old memory profile regression: the classic actor projection is untouched.
  const memory=createMemoryVillage(7,'regress-memory');
  const old=buildActorKnowledge(memory.bundle,'actor-2');
  assert.equal(old.actorId,'actor-2');
  assert.equal(old.alive,true);
  assert.ok(Object.hasOwn(old,'self')&&Object.hasOwn(old,'public')&&Object.hasOwn(old,'memories')&&Object.hasOwn(old,'relationships'));
  assert.throws(()=>buildActorKnowledge(memory.bundle,'actor-99'),e=>e.code==='INVALID_INPUT');
});

test('committed knowledge after a full day: goals, intention and the sealed pair',()=>{
  const b144=advance(144);
  const inspector=projectMindInspector(b144);
  assert.ok(inspector.tick===144&&inspector.revision===144);
  const actor2=inspector.actors[0],actor3=inspector.actors[1];
  assert.equal(actor2.knowledge.committedIntent.kind,'recover-health');
  assert.equal(actor3.knowledge.committedIntent.kind,'recover-health');
  assert.equal(actor2.knowledge.committedIntent.goalId,1);
  assert.equal(actor2.lastDecision.choice,'NoAction');
  assert.equal(actor2.lastOutcome.status,'no-action');
  assert.equal(actor3.lastDecision.choice,'BuyMedicine');
  assert.equal(actor3.lastOutcome.status,'succeeded');
  assert.equal(actor3.knowledge.self.inventory.herbs,1);
  assert.equal(actor3.knowledge.self.wallet,50);
  // quote now comes from the visible day-end report, not the initial posted price.
  assert.equal(actor3.knowledge.quote.sourceEventSeq!==null,true);
  assert.equal(actor3.knowledge.quote.observedTick,144);
});