import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultResourceConfig, createResourceWorld, settleResourceDay, validateResourceHistory,
  RESOURCE_RULES } from '../../runtime/core/resource-ledger.mjs';
import { createResourceVillage } from '../../runtime/fixtures/resource-village.mjs';
import { advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';

const bad = (e) => ['INVALID_INPUT', 'LIMIT_EXCEEDED', 'UNSUPPORTED_VERSION'].includes(e.code);
const days = (world, count) => { const facts = []; for (let i = 0; i < count; i++) {
  const result = settleResourceDay(world); world = result.world; facts.push(result.payload);
} return { world, facts }; };
const advance = (bundle, systems, ticks) => { for (let i = 0; i < ticks; i++) bundle = advanceOneTick(bundle, systems); return bundle; };

test('B1 daily unit rates, exact fractional carry and independent resource equations', () => {
  const config = defaultResourceConfig(), initial = createResourceWorld(config);
  const one = settleResourceDay(initial), food = one.payload.entries[0], herbs = one.payload.entries[1];
  assert.deepEqual([food.opening, food.production, food.demand, food.consumption, food.loss, food.closing], [900, 96, 80, 80, 4, 912]);
  assert.equal(food.remainders.loss, 580); assert.equal(herbs.production, 1);
  assert.equal(herbs.remainders.production, 4); assert.equal(herbs.closing, 81);
  const two = settleResourceDay(one.world); assert.equal(two.payload.entries[1].production, 2);
  assert.equal(two.world.resources.gold, 20000); assert.equal(two.world.resourceModel.day, 2);
  for (const row of [...one.payload.entries, ...two.payload.entries])
    assert.equal(row.closing, row.opening + row.production + row.inflow - row.consumption - row.outflow - row.loss - row.capacityLoss);
  assert.deepEqual(initial, createResourceWorld(config)); // Pure, disconnected candidate.
  const thirty = days(initial, 30); validateResourceHistory(thirty.world, thirty.facts);
});

test('B1 zero population/stock stays finite; starvation and capacity losses are accounted', () => {
  const config = defaultResourceConfig(); Object.assign(config.settlement, { humanCount: 0, foodWorkers: 0, herbWorkers: 0 });
  config.resources.food.initial = 0; config.resources.herbs.initial = 0;
  const zero = days(createResourceWorld(config), 10); assert.equal(zero.world.resources.food, 0); assert.equal(zero.world.resources.herbs, 0);
  validateResourceHistory(zero.world, zero.facts);
  const hungry = defaultResourceConfig(); hungry.resources.food.initial = 2; hungry.settlement.foodWorkers = 0;
  const row = settleResourceDay(createResourceWorld(hungry)).payload.entries[0];
  assert.equal(row.consumption, 2); assert.equal(row.unmetConsumption, 78); assert.equal(row.closing, 0);
  const full = defaultResourceConfig(); full.resources.food.initial = 1800;
  const spill = settleResourceDay(createResourceWorld(full)).payload.entries[0];
  assert.equal(spill.capacityLoss, 7); assert.equal(spill.closing, 1800);
});

test('B1 explicit fixture flows apply once, inflow before demand, shortages before losses', () => {
  const config = defaultResourceConfig(); config.resources.food.initial = 2; config.settlement.foodWorkers = 0;
  config.flows = [{ day: 1, resource: 'food', direction: 'in', amount: 100 },
    { day: 1, resource: 'food', direction: 'out', amount: 50 }];
  const first = settleResourceDay(createResourceWorld(config)).payload.entries[0];
  assert.deepEqual([first.inflow, first.consumption, first.outflow, first.unmetOutflow, first.closing], [100, 80, 22, 28, 0]);
  const two = days(createResourceWorld(config), 2); assert.equal(two.facts[1].entries[0].inflow, 0);
  validateResourceHistory(two.world, two.facts);
});

test('B1 treatment demand and fractional consumption carry are settled without hidden rounding', () => {
  const config = defaultResourceConfig(); config.settlement.injuredCount = 2;
  const first = settleResourceDay(createResourceWorld(config)).payload.entries[1];
  assert.equal(first.demand, 2); assert.equal(first.consumption, 2); assert.equal(first.closing, 79);
  const fractional = defaultResourceConfig();
  Object.assign(fractional.settlement, { humanCount: 1, foodWorkers: 0, herbWorkers: 0 });
  fractional.resources.food.consumption = { numerator: 1, denominator: 3 };
  fractional.resources.food.lossPermille = 0;
  const result = days(createResourceWorld(fractional), 3);
  assert.deepEqual(result.facts.map(f => f.entries[0].consumption), [0, 0, 1]);
  assert.equal(result.world.resources.food, 899); assert.equal(result.world.resourceModel.remainders.food.consumption, 0);
});

test('B1 exact config rejects unsupported units, unsafe rates, holes, getters and impossible labour', () => {
  for (const mutate of [c => { c.units.food = 'kg'; }, c => { c.version = '2'; },
    c => { c.resources.food.production.denominator = 0; }, c => { c.resources.food.lossPermille = 1001; },
    c => { c.settlement.foodWorkers = 81; }, c => { c.settlement.injuredCount = 81; },
    c => { c.resources.food.initial = 1801; }, c => { c.resources.food.initial = NaN; },
    c => { c.flows = Array(1); }, c => { c.flows = Array(1001); },
    c => { c.flows = [{ day: 1, resource: 'gold', direction: 'in', amount: 1 }]; }]) {
    const c = defaultResourceConfig(); mutate(c); assert.throws(() => createResourceWorld(c), bad);
  }
  assert.throws(() => createResourceWorld(new Date()), bad);
  const getter = defaultResourceConfig(); let calls = 0;
  Object.defineProperty(getter.resources.food, 'initial', { enumerable: true, get() { calls++; return 1; } });
  assert.throws(() => createResourceWorld(getter), bad); assert.equal(calls, 0);
  const c = defaultResourceConfig(); c.resources.food.capacity = Number.MAX_SAFE_INTEGER;
  c.resources.food.initial = Number.MAX_SAFE_INTEGER;
  const world = createResourceWorld(c), saved = structuredClone(world);
  assert.throws(() => settleResourceDay(world), e => e.code === 'LIMIT_EXCEEDED'); assert.deepEqual(world, saved);
});

test('B1 rejects over-budget configuration before inspecting or cloning flow elements', () => {
  const config = defaultResourceConfig(); let reads = 0;
  const flow = {};
  Object.defineProperty(flow, 'day', { enumerable: true, get() { reads++; return 1; } });
  config.flows = Array(1001).fill(flow);
  assert.throws(() => createResourceWorld(config), e => e.code === 'LIMIT_EXCEEDED');
  assert.equal(reads, 0);
  const { bundle, systems } = createResourceVillage(); bundle.eventLog = Array(10001).fill(null);
  assert.throws(() => validateBundle(bundle, { rulesVersion: RESOURCE_RULES, systems }), e => e.code === 'LIMIT_EXCEEDED');
});

test('B1 fixture consumer settles only on daily boundary and restored state audits history', () => {
  const { bundle, systems } = createResourceVillage(0);
  const before = advance(bundle, systems, 143); assert.equal(before.eventLog.length, 0); assert.equal(before.snapshot.world.resources.food, 900);
  const after = advance(before, systems, 1); assert.equal(after.eventLog.length, 1);
  assert.equal(after.eventLog[0].type, 'ResourceDaySettled'); assert.equal(after.snapshot.world.resources.food, 912);
  validateBundle(after, { rulesVersion: RESOURCE_RULES, systems });
  for (const mutate of [b => { b.snapshot.world.resources.food++; },
    b => { b.snapshot.world.resourceModel.remainders.food.loss++; },
    b => { b.eventLog[0].payload.entries[0].consumption--; },
    b => { b.eventLog[0].tick--; }, b => { b.snapshot.world.resourceModel.day++; },
    b => { b.snapshot.world.resourceModel.config.resources.food.initial++; },
    b => { b.snapshot.scheduledTasks[0].intervalTicks = 1; }]) {
    const b = structuredClone(after); mutate(b); assert.throws(() => validateBundle(b, { rulesVersion: RESOURCE_RULES, systems }), bad);
  }
});

test('B1 system config rewrite or failure rejects whole tick; cross-unit commands are forbidden', () => {
  const { bundle, systems } = createResourceVillage(42), before = advance(bundle, systems, 143), saved = structuredClone(before);
  const hostile = { resources(ctx, due) { systems.resources(ctx, due); ctx.snapshot.world.resourceModel.config.resources.food.capacity++; } };
  assert.throws(() => advanceOneTick(before, hostile), bad); assert.deepEqual(before, saved);
  const failure = { resources(ctx, due) { systems.resources(ctx, due); throw new Error('fail after settlement'); } };
  assert.throws(() => advanceOneTick(before, failure), /not committed/); assert.deepEqual(before, saved);
  const injected = structuredClone(bundle); injected.snapshot.pendingCommands = [{ commandId: 'cross-unit', inputSeq: 1,
    targetTick: 1, type: 'TransferResource', payload: { from: 'food', to: 'herbs', amount: 1 } }]; injected.snapshot.nextInputSeq = 2;
  assert.throws(() => advanceOneTick(injected, systems), bad);
});
