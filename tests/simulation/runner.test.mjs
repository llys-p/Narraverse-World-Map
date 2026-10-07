import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runSimulation, parseArguments } from '../../simulation-runner.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const tmp = async (t) => {
  const prefix = path.join(os.tmpdir(), 'world-runner-test-'), directory = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(directory.startsWith(prefix)); await fs.rm(directory, { recursive: true, force: true }); });
  return directory;
};
const cli = (args) => spawnSync(process.execPath, ['simulation-runner.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 60000 });

test('A4 argument validation is exact, non-coercing, and new/resume are exclusive', () => {
  const args = parseArguments(['--fixture', 'clock-smoke', '--days', '2', '--seed', '0', '--out', 'fresh']);
  assert.equal(args.seed, 0); assert.equal(args.ticks, 288);
  for (const argv of [[], ['--wat', '1'], ['--days', '-1'], ['--days', '1.5'],
    ['--fixture', 'clock-smoke', '--days', '1', '--seed', '42', '--out', 'fresh', '--seed', '43'],
    ['--resume', 'file', '--fixture', 'clock-smoke', '--days', '1', '--out', 'fresh'],
    ['--fixture', 'clock-smoke', '--days', '1001', '--seed', '42', '--out', 'fresh'],
    ['--fixture', 'clock-smoke', '--days', '1', '--seed', 'NaN', '--out', 'fresh']]) {
    assert.throws(() => parseArguments(argv), (e) => e.code === 'INVALID_INPUT' || e.code === 'LIMIT_EXCEEDED');
  }
});

test('A4 real CLI writes traceable summary, complete inputs, CSV and checkpoint', async (t) => {
  const parent = await tmp(t), output = path.join(parent, 'out');
  const result = cli(['--fixture', 'clock-smoke', '--days', '2', '--seed', '0', '--out', output]);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(await fs.readFile(path.join(output, 'summary.json'), 'utf8'));
  assert.equal(summary.tick, 288); assert.equal(summary.seed, 0); assert.equal(summary.status, 'succeeded');
  assert.match(summary.stateHash, /^[a-f0-9]{64}$/); assert.match(summary.eventHash, /^[a-f0-9]{64}$/);
  assert.equal(summary.nodeVersion, process.version); assert.ok(typeof summary.codeDirty === 'boolean');
  assert.match(summary.codeSha, /^[a-f0-9]{40}$/); assert.equal(summary.fixtureId, 'clock-smoke');
  assert.ok(summary.elapsedMs >= 0 && summary.memoryUsage.rss > 0);
  const inputs = JSON.parse(await fs.readFile(path.join(output, 'inputs.json'), 'utf8'));
  assert.deepEqual(inputs.map((input) => input.inputSeq), [1, 2, 3]);
  assert.equal(inputs[1].targetTick, 50 * 144);
  const csv = await fs.readFile(path.join(output, 'events.csv'), 'utf8');
  assert.match(csv, /^eventSeq,tick,type,/); assert.match(csv, /ResourceTransferred/); assert.match(csv, /FixturePulse/);
  const checkpoint = JSON.parse(await fs.readFile(summary.checkpointPath, 'utf8'));
  assert.equal(checkpoint.snapshot.tick, 288); assert.equal(checkpoint.eventLog.length, summary.eventCount);
});

test('A4 resume is deterministic and existing outputs are never overwritten', async (t) => {
  const parent = await tmp(t);
  const first = await runSimulation(parseArguments(['--fixture', 'clock-smoke', '--days', '1', '--seed', '42', '--out', path.join(parent, 'first')]));
  const resumed = await runSimulation(parseArguments(['--resume', first.checkpointPath, '--days', '1', '--out', path.join(parent, 'resumed')]));
  const continuous = await runSimulation(parseArguments(['--fixture', 'clock-smoke', '--days', '2', '--seed', '42', '--out', path.join(parent, 'continuous')]));
  assert.equal(resumed.stateHash, continuous.stateHash); assert.equal(resumed.eventHash, continuous.eventHash);
  const bytes = await fs.readFile(path.join(parent, 'first', 'summary.json'));
  await assert.rejects(runSimulation(parseArguments(['--fixture', 'clock-smoke', '--days', '1', '--seed', '42', '--out', path.join(parent, 'first')])), (e) => e.code === 'SAVE_FAILED');
  assert.deepEqual(await fs.readFile(path.join(parent, 'first', 'summary.json')), bytes);
});

test('A4 injected tick failure exits through failure result with last committed checkpoint', async (t) => {
  const parent = await tmp(t), out = path.join(parent, 'failed');
  await assert.rejects(runSimulation(parseArguments(['--fixture', 'clock-smoke', '--days', '2', '--seed', '42', '--out', out]), {
    transformSystems(systems) { return { ...systems, pulse(ctx) { ctx.rng.next(); ctx.snapshot.world.resources.A--; throw new Error('injected'); } }; },
  }), (e) => e.failedTick === 144 && e.summary.status === 'failed');
  const summary = JSON.parse(await fs.readFile(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.tick, 143); assert.equal(summary.failedTick, 144);
  const checkpoint = JSON.parse(await fs.readFile(summary.checkpointPath, 'utf8'));
  assert.equal(checkpoint.snapshot.tick, 143); assert.equal(checkpoint.snapshot.world.resources.A, 999);
  assert.equal(checkpoint.eventLog.length, 1);
});

test('A4 invalid fixture, checkpoint or invocation returns a nonzero CLI exit', async (t) => {
  const parent = await tmp(t);
  for (const args of [[], ['--fixture', 'unknown', '--days', '1', '--seed', '42', '--out', path.join(parent, 'bad-fixture')],
    ['--resume', path.join(parent, 'missing.json'), '--days', '1', '--out', path.join(parent, 'bad-checkpoint')]]) {
    const result = cli(args); assert.notEqual(result.status, 0); assert.match(result.stderr, /ERROR/);
  }
});
