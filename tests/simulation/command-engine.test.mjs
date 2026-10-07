import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialBundle, cloneBundle, validateBundle } from '../../runtime/core/world-state.mjs';
import { advanceOneTick, lookupCommand } from '../../runtime/core/command-engine.mjs';
import { validateEventLog } from '../../runtime/core/event-log.mjs';
const rulesVersion = 'a-smoke-v1';
const command = (commandId = 'c1', amount = 7, targetTick = 1, from = 'A', to = 'B') =>
  ({ commandId, targetTick, type: 'TransferResource', payload: { from, to, amount } });
const initial = (commands = [], systems = {}, extra = {}) => createInitialBundle({
  rulesVersion, simulationId: 'test', fixtureId: 'clock-smoke', fixtureVersion: '1', seed: 42,
  resources: { A: 10, B: 0 }, scheduledTasks: [], commands, ...extra,
}, systems);
const task = (id, systemId = 'pulse', period = 1, priority = 0) =>
  ({ taskId: id, systemId, nextDueTick: 1, intervalTicks: period, priority });
const pulse = (ctx, due) => ctx.emitFact({ type: 'FixturePulse', sourceSystem: due.systemId,
  commandId: null, causationEventSeqs: [], entityIds: [], payload: { sample: ctx.rng.next() } });
const freeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
const error = (code) => (e) => e.code === code;

test('V2 real transfer is atomic, ordered by inputSeq; a rule rejection continues', () => {
  const before = freeze(initial([command('z', 7), command('a', 5)]));
  const after = advanceOneTick(before, {});
  assert.deepEqual(after.snapshot.world.resources, { A: 3, B: 7 });
  assert.equal(after.snapshot.tick, 1); assert.equal(after.snapshot.revision, 1);
  assert.equal(after.snapshot.commandReceipts.z.status, 'succeeded');
  assert.equal(after.snapshot.commandReceipts.a.status, 'rejected');
  assert.deepEqual(after.snapshot.commandReceipts.a.result, { code: 'RULE_REJECTED' });
  assert.deepEqual(after.snapshot.commandReceipts.a.eventSeqs, []);
  assert.deepEqual(after.snapshot.pendingCommands, []); assert.equal(after.eventLog.length, 1);
  assert.deepEqual(after.snapshot.rng, before.snapshot.rng);
  assert.deepEqual(before.snapshot.world.resources, { A: 10, B: 0 });
});

test('V2 pending/succeeded/rejected dedup is read-only; key order does not cause conflict', () => {
  const input = command(); const b = initial([input, { ...input, payload: { amount: 7, to: 'B', from: 'A' } }]);
  assert.equal(b.snapshot.pendingCommands.length, 1); assert.equal(b.snapshot.nextInputSeq, 2);
  assert.deepEqual(lookupCommand(b, input), { status: 'pending', inputSeq: 1 });
  const done = advanceOneTick(b, {}); const before = JSON.stringify(done);
  const receipt = lookupCommand(done, input); receipt.result.amount = 99;
  assert.equal(JSON.stringify(done), before);
  for (const changed of [command('c1', 8), command('c1', 7, 2), { ...input, type: 'Other' }]) {
    assert.throws(() => lookupCommand(done, changed), error('COMMAND_ID_CONFLICT'));
    assert.throws(() => lookupCommand(b, changed), error('COMMAND_ID_CONFLICT'));
  }
  const rejected = advanceOneTick(initial([command('bad', 11)]), {});
  assert.equal(lookupCommand(rejected, command('bad', 11)).status, 'rejected');
  assert.deepEqual(lookupCommand(done, command('missing')), { status: 'not_found' });
  assert.throws(() => initial([input, command('c1', 8)]), error('COMMAND_ID_CONFLICT'));
});

test('V2 rule rejection covers missing/self/insufficient/overflow; malformed commands never queue', () => {
  for (const input of [command('c', 11), command('c', 1, 1, 'A', 'A'), command('c', 1, 1, 'missing')]) {
    const before = initial([input]); const after = advanceOneTick(before, {});
    assert.equal(after.snapshot.commandReceipts.c.status, 'rejected');
    assert.deepEqual(after.snapshot.world.resources, before.snapshot.world.resources);
    assert.equal(after.eventLog.length, 0);
  }
  const full = initial([command('c', 1)], {}, { resources: { A: 10, B: Number.MAX_SAFE_INTEGER } });
  assert.equal(advanceOneTick(full, {}).snapshot.commandReceipts.c.status, 'rejected');
  for (const input of [command('c', 0), command('c', 1, 0), { ...command(), type: 'Other' },
    { ...command(), extra: 1 }, { ...command(), payload: { ...command().payload, extra: 1 } }]) {
    assert.throws(() => initial([input]), error('INVALID_INPUT'));
  }
});

test('V2 prototype-looking command/resource keys transfer and deduplicate safely', () => {
  const resources = JSON.parse('{"__proto__":10,"constructor":0}');
  const input = command('__proto__', 2, 1, '__proto__', 'constructor');
  const after = advanceOneTick(initial([input], {}, { resources }), {});
  assert.equal(after.snapshot.world.resources.__proto__, 8);
  assert.equal(Object.hasOwn(after.snapshot.commandReceipts, '__proto__'), true);
  assert.equal(lookupCommand(after, input).status, 'succeeded');
  assert.equal({}.polluted, undefined);
});

test('V3 commands precede tasks, and scheduler priority/system/task order is preserved', () => {
  const seen = []; const systems = { b(ctx, due) { seen.push(due.taskId); assert.equal(ctx.snapshot.world.resources.B, 7); pulse(ctx, due); },
    a(ctx, due) { seen.push(due.taskId); pulse(ctx, due); } };
  const after = advanceOneTick(initial([command()], systems, { scheduledTasks: [
    task('z', 'b', 1, 0), task('a', 'b', 1, 0), task('x', 'a', 1, 0), task('first', 'b', 1, -1),
  ] }), systems);
  assert.deepEqual(seen, ['first', 'x', 'a', 'z']);
  assert.deepEqual(after.eventLog.map((e) => e.type), ['ResourceTransferred', ...Array(4).fill('FixturePulse')]);
  assert.equal(after.snapshot.nextEventSeq, 6);
});

test('V3 failure rolls back commands, RNG, IDs, queues, receipts and log; retry matches clean run', () => {
  const systems = { pulse(ctx, due) { ctx.snapshot.nextEntityId++; pulse(ctx, due); throw new Error('injected'); } };
  const before = freeze(initial([command()], systems, { scheduledTasks: [task('p')] }));
  const json = JSON.stringify(before);
  assert.throws(() => advanceOneTick(before, systems), (e) => e.failedTick === 1 && e.cause?.message === 'injected');
  assert.equal(JSON.stringify(before), json);
  const fixed = { pulse(ctx, due) { ctx.snapshot.nextEntityId++; pulse(ctx, due); } };
  const retry = advanceOneTick(before, fixed);
  const clean = advanceOneTick(initial([command()], fixed, { scheduledTasks: [task('p')] }), fixed);
  assert.deepEqual(retry, clean);
});

test('V3 malformed facts, invariant and counter failures, async handlers all roll back', async () => {
  for (const handler of [
    (ctx) => { ctx.snapshot.world.resources.A = -1; },
    (ctx) => { ctx.snapshot.nextEntityId = Number.MAX_SAFE_INTEGER + 1; },
    (ctx) => { ctx.snapshot.nextEventSeq = Number.MAX_SAFE_INTEGER; pulse(ctx, { systemId: 'pulse' }); },
    (ctx) => { ctx.emitFact({ type: 'Other' }); },
    (ctx, due) => { pulse(ctx, { ...due, systemId: 'other' }); },
    async (ctx) => { await Promise.resolve(); ctx.snapshot.world.resources.A = -1; },
  ]) {
    const systems = { pulse: handler }; const before = initial([command()], systems, { scheduledTasks: [task('p')] });
    const json = JSON.stringify(before);
    assert.throws(() => advanceOneTick(before, systems), (e) => e.failedTick === 1);
    await Promise.resolve(); assert.equal(JSON.stringify(before), json);
  }
});

test('V3 systems cannot rewrite identity/input history, enqueue commands, or reduce allocated IDs', () => {
  for (const handler of [
    (ctx) => { ctx.snapshot.simulationId = 'another'; },
    (ctx) => { ctx.snapshot.pendingCommands.push({ ...command('injected', 1, 2), inputSeq: 2 }); ctx.snapshot.nextInputSeq++; },
    (ctx) => { ctx.snapshot.commandReceipts.c1.result.amount = 8; },
    (ctx) => { ctx.snapshot.nextEntityId = 0; },
  ]) {
    const systems = { pulse: handler };
    const b = initial([command()], systems, { scheduledTasks: [task('p')] });
    const json = JSON.stringify(b);
    assert.throws(() => advanceOneTick(b, systems), (e) => e.failedTick === 1);
    assert.equal(JSON.stringify(b), json);
  }
});

test('V1 payload budget and lookup accessors are rejected without invoking user code', () => {
  assert.throws(() => initial([{ ...command(), payload: { note: '界'.repeat(22000) } }]), error('LIMIT_EXCEEDED'));
  let reads = 0; const b = initial();
  Object.defineProperty(b, 'snapshot', { enumerable: true, get() { reads++; return {}; } });
  assert.throws(() => lookupCommand(b, command()), error('INVALID_INPUT'));
  assert.equal(reads, 0);
});

test('V3 saved context cannot modify returned or previous bundle; 288 and 100+188 agree', () => {
  let saved; const systems = { pulse(ctx, due) { saved = ctx; pulse(ctx, due); } };
  let b = initial([command('later', 3, 144)], systems, { scheduledTasks: [task('p', 'pulse', 3)] });
  const origin = cloneBundle(b); const first = advanceOneTick(b, systems);
  saved.snapshot.world.resources.A = 99; saved.rng.next();
  assert.equal(first.snapshot.world.resources.A, 10); assert.deepEqual(b, origin);
  assert.throws(() => saved.emitFact({}), error('INVALID_INPUT'));
  const run = (start, count) => { for (let i = 0; i < count; i++) start = advanceOneTick(start, systems); return start; };
  const continuous = run(b, 288); const prefix = run(b, 100);
  const resumed = run(JSON.parse(JSON.stringify(prefix)), 188);
  assert.deepEqual(resumed, continuous);
  const inputs = [...continuous.snapshot.pendingCommands, ...Object.entries(continuous.snapshot.commandReceipts).map(([commandId, r]) => ({ commandId, inputSeq: r.inputSeq, ...r.input }))]
    .sort((a, c) => a.inputSeq - c.inputSeq).map(({ inputSeq, ...input }) => input);
  assert.deepEqual(run(initial(inputs, systems, { scheduledTasks: [task('p', 'pulse', 3)] }), 288), continuous);
});

test('V1 event sequence, tick, references, payloads and receipt correspondence are strict', () => {
  const systems = { pulse }; const good = advanceOneTick(initial([command()], systems, { scheduledTasks: [task('p')] }), systems);
  const changes = [
    (b) => { b.eventLog[0].eventSeq = 2; }, (b) => { b.eventLog[0].tick = 2; },
    (b) => { b.eventLog[0].schemaVersion = 2; }, (b) => { b.eventLog[1].causationEventSeqs = [2]; },
    (b) => { b.eventLog[1].causationEventSeqs = [1, 1]; },
    (b) => { b.eventLog[0].payload.amount++; }, (b) => { b.eventLog[0].entityIds = ['A']; },
    (b) => { b.eventLog[0].commandId = 'missing'; }, (b) => { b.eventLog[1].sourceSystem = 'missing'; },
    (b) => { b.snapshot.commandReceipts.c1.eventSeqs = [2]; },
    (b) => { b.snapshot.commandReceipts.c1.fingerprint = 'fake'; },
    (b) => { b.snapshot.commandReceipts.c1.status = 'rejected'; },
    (b) => { b.snapshot.nextEventSeq++; }, (b) => { b.snapshot.nextInputSeq++; },
    (b) => { b.snapshot.pendingCommands.push({ ...command(), inputSeq: 1, targetTick: 2 }); },
  ];
  for (const change of changes) {
    const bad = cloneBundle(good); change(bad);
    assert.throws(() => validateBundle(bad, { rulesVersion, systems }));
  }
  const cause = cloneBundle(good); cause.eventLog[1].causationEventSeqs = [1];
  validateEventLog(cause.eventLog, cause.snapshot, systems);
  const reverse = advanceOneTick(good, systems); reverse.eventLog.at(-1).tick = 0;
  assert.throws(() => validateEventLog(reverse.eventLog, reverse.snapshot, systems));
});

test('I2 core remains pure and A1 dependencies remain local', () => {
  for (const name of ['world-state', 'command-engine', 'event-log', 'data-contract', 'resource-ledger', 'ecology']) {
    const src = readFileSync(new URL(`../../runtime/core/${name}.mjs`, import.meta.url), 'utf8');
    for (const bad of [/Math\.random\s*\(/, /Date\.now\s*\(/, /performance\./, /setTimeout\s*\(/,
      /setInterval\s*\(/, /\bfetch\s*\(/, /process\.env/, /node:/, /\bdocument\./, /\bwindow\./]) assert.doesNotMatch(src, bad);
    for (const statement of src.match(/^import\b[^;]*;/gm) ?? []) assert.match(statement, /from '\.\//);
  }
});
