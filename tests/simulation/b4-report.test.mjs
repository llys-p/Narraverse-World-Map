import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { createB4Fixture } from '../../runtime/fixtures/b4-calibrated.mjs';
import { auditRun,auditPaired } from '../../runtime/experiments/b4-report.mjs';
const summary={elapsedMs:0,memoryUsage:{rss:1},stateHash:'test',eventHash:'test',marketConfigHash:'test',checkpointPath:'test'};
function run(scenario,days){const {bundle,systems}=createB4Fixture(scenario,42);const session=createSimulationSession(bundle,systems);session.advanceTicks(days*144);return session.getBundle();}

test('B4 independent audit rejects conservation/cost/price/schedule mistakes in actual consumer output',()=>{
  const bundle=run('baseline',4);assert.equal(auditRun(bundle,summary,'baseline').days,4);
  for(const mutate of [b=>b.snapshot.world.resources.gold++,b=>b.eventLog[0].payload.orders[0].cost++,
    b=>b.eventLog[0].payload.prices.herbs.current++,b=>b.eventLog[0].tick--,
    b=>b.eventLog[1].payload.ecology.deer.closing++,b=>b.snapshot.world.marketModel.config.delayDays++,
    b=>b.eventLog[2].payload.arrivals[0].dueDay++]){
    const corrupt=structuredClone(bundle);mutate(corrupt);assert.throws(()=>auditRun(corrupt,summary,'baseline'),/B4_GATE_FAILED/);
  }
});

test('B4 independent report verifies complete pending cargo identity and original paid terms',()=>{
  const bundle=run('baseline',1);bundle.snapshot.world.marketModel.inTransit[0].dueDay++;
  assert.throws(()=>auditRun(bundle,summary,'baseline'),/B4_GATE_FAILED/);
});

test('B4 frozen calibration recovers mild deer shock and exposes the full severe and blockage chain',()=>{
  const base=run('baseline',100),severe=run('severe',100),short=run('herb-shortage',100),block=run('trade-blocked',100),mild=run('mild',500);
  for(const [scenario,b] of [['baseline',base],['severe',severe],['herb-shortage',short],['trade-blocked',block],['mild',mild]])auditRun(b,summary,scenario);
  const chain=auditPaired(base,severe,short,block);assert.ok(chain.pressureDay>=10 && chain.pressureDay<100);
  assert.ok(chain.blockedMedicineDeficit>chain.openMedicineDeficit);assert.ok(chain.arrivalDueDay>=chain.orderDay+2);
  const notBlocked=structuredClone(short);assert.throws(()=>auditPaired(base,severe,short,notBlocked),/B4_GATE_FAILED/);
});
