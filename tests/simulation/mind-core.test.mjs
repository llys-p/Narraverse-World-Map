// M1A mind core: bounded observation derivation, the narrow three-way planner and the
// hard budget/error boundaries. Everything here is pure data in, pure data out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMindVillage } from '../../runtime/fixtures/mind-village.mjs';
import { buildMindKnowledge } from '../../runtime/knowledge/mind-knowledge.mjs';
import { deriveMindBelief,observationExpiryTick,MAX_MIND_KNOWLEDGE_BYTES } from '../../runtime/core/mind-state.mjs';
import { planMindDecision } from '../../runtime/core/mind-planner.mjs';

const observation=over=>({sourceEventSeq:1,occurrenceTick:12,observedTick:12,channel:'statement',
  sourceActorId:'actor-1',available:false,confidencePermille:600,expiresTick:observationExpiryTick(12),...over});

test('belief TTL boundary: valid at expiresTick-1, unknown at expiresTick, no silent renewal',()=>{
  const o=observation();
  const alive=deriveMindBelief([o],299);
  assert.deepEqual(alive,{topic:'public-herbs-available',value:'unavailable',confidencePermille:600,
    evidenceRefs:[1],contradictionRefs:[],lastUpdatedTick:12});
  const expired=deriveMindBelief([o],300);
  assert.deepEqual(expired,{topic:'public-herbs-available',value:'unknown',confidencePermille:0,
    evidenceRefs:[],contradictionRefs:[],lastUpdatedTick:null});
  assert.deepEqual(deriveMindBelief([],1000),expired);
});

test('own-rejection resets to unknown; a later daily-public fact wins and contradicts older speech',()=>{
  const rows=[observation(),
    {sourceEventSeq:2,occurrenceTick:24,observedTick:24,channel:'own-rejection',sourceActorId:null,
      available:null,confidencePermille:0,expiresTick:observationExpiryTick(24)},
    {sourceEventSeq:11,occurrenceTick:144,observedTick:144,channel:'daily-public',sourceActorId:null,
      available:true,confidencePermille:900,expiresTick:observationExpiryTick(144)}];
  assert.equal(deriveMindBelief(rows.slice(0,2),144).value,'unknown');
  assert.equal(deriveMindBelief(rows.slice(0,2),144).lastUpdatedTick,24);
  const full=deriveMindBelief(rows,144);
  assert.deepEqual(full,{topic:'public-herbs-available',value:'available',confidencePermille:900,
    evidenceRefs:[11],contradictionRefs:[1],lastUpdatedTick:144});
});

// One committed knowledge record cloned into decision-phase shape for the pure planner.
function decisionKnowledge(over={}){
  const f=createMindVillage(),bundle=f.bundle;
  const committed=buildMindKnowledge(bundle,'actor-2');
  const k={...committed,phase:'decision',tick:144,revision:143};
  return Object.assign(k,structuredClone(over));
}
const beliefOf=value=>({topic:'public-herbs-available',value,confidencePermille:value==='unknown'?0:(value==='available'?900:600),
  evidenceRefs:value==='unknown'?[]:[1],contradictionRefs:[],lastUpdatedTick:value==='unknown'?null:12});
const goalOf=()=>({goalId:1,kind:'recover-health',step:'wait',startDay:1,deadlineDay:21,failures:0,target:800});

test('planner: NO_GOAL waits without creating a goal above the health threshold',()=>{
  const k=decisionKnowledge({self:{...decisionKnowledge().self,health:800}});
  const out=planMindDecision(k);
  assert.equal(out.goal,null);
  assert.equal(out.nextGoalId,k.self.nextGoalId);
  assert.equal(out.decision.choice,'NoAction');
  assert.equal(out.decision.reasonCode,'NO_GOAL');
  assert.equal(out.decision.goalId,null);
});

test('planner: unknown/unavailable/funds/inventory reason codes fall through to NoAction',()=>{
  const base=decisionKnowledge();
  for(const [belief,code] of [['unknown','SUPPLY_UNKNOWN'],['unavailable','SUPPLY_UNAVAILABLE']]){
    const out=planMindDecision({...base,belief:beliefOf(belief)});
    assert.equal(out.decision.choice,'NoAction');assert.equal(out.decision.reasonCode,code);
    assert.ok(out.goal);assert.equal(out.decision.candidates.map(c=>c.action).join(','),'UseMedicine,BuyMedicine,NoAction');
    assert.equal(out.decision.evidenceRefs.join(','),belief==='unknown'?'':'1');
  }
  const poor=planMindDecision({...base,belief:beliefOf('available'),self:{...base.self,wallet:0}});
  assert.equal(poor.decision.reasonCode,'FUNDS_INSUFFICIENT');
  const full=planMindDecision({...base,belief:beliefOf('available'),
    self:{...base.self,health:1000,wallet:5000,inventory:{food:0,herbs:1000},currentGoal:goalOf()},
    committedIntent:null});
  assert.equal(full.decision.reasonCode,'INVENTORY_FULL');
  assert.equal(full.decision.candidates[0].reasonCode,'HEALTH_FULL');
  assert.equal(full.decision.candidates[1].reasonCode,'INVENTORY_FULL');
});

test('planner: real choices — own medicine first, known supply buy — with created goal',()=>{
  const base=decisionKnowledge();
  const use=planMindDecision({...base,self:{...base.self,inventory:{food:0,herbs:1}}});
  assert.equal(use.decision.choice,'UseMedicine');
  assert.equal(use.decision.reasonCode,'USE_OWN_MEDICINE');
  assert.equal(use.decision.candidates[0].reasonCode,'READY');
  assert.equal(use.goal.kind,'recover-health');
  const bought=planMindDecision({...base,belief:beliefOf('available'),self:{...base.self,wallet:5000}});
  assert.equal(bought.decision.choice,'BuyMedicine');
  assert.equal(bought.decision.reasonCode,'BUY_KNOWN_SUPPLY');
  assert.equal(bought.decision.candidates[1].reasonCode,'READY');
  assert.ok(bought.decision.knowledgeFingerprint.length<=MAX_MIND_KNOWLEDGE_BYTES);
});

test('planner: dead actors are rejected without a decision',()=>{
  const base=decisionKnowledge();
  const k={...base,self:{...base.self,alive:false,currentGoal:null},committedIntent:null};
  assert.throws(()=>planMindDecision(k),e=>e.code==='RULE_REJECTED');
});

test('planner: byte budget precedes field semantics; oversized DTO is LIMIT_EXCEEDED',()=>{
  const base=decisionKnowledge();
  const fat={...base,observations:Array(60).fill(observation())};
  assert.throws(()=>planMindDecision(fat),e=>e.code==='LIMIT_EXCEEDED');
  const longName={...base,self:{...base.self,name:'n'.repeat(65)}};
  assert.throws(()=>planMindDecision(longName),e=>e.code==='INVALID_INPUT');
});

test('planner: never mutates its input',()=>{
  const k=decisionKnowledge({belief:beliefOf('unavailable')});
  const frozen=structuredClone(k);
  planMindDecision(k);
  assert.deepEqual(k,frozen);
  const buy=decisionKnowledge({belief:beliefOf('available'),self:{...decisionKnowledge().self,wallet:5000}});
  const frozenBuy=structuredClone(buy);
  planMindDecision(buy);
  assert.deepEqual(buy,frozenBuy);
});