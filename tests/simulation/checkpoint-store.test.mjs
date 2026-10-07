import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { createClockSmoke } from '../../runtime/fixtures/clock-smoke.mjs';
import { advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { cloneBundle } from '../../runtime/core/world-state.mjs';
const run = (bundle, systems, ticks) => { for (let i = 0; i < ticks; i++) bundle = advanceOneTick(bundle, systems); return bundle; };
const temporary = async (t) => {
  const prefix = path.join(os.tmpdir(), 'world-checkpoint-test-');
  const directory = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(directory.startsWith(prefix)); await fs.rm(directory, { recursive: true, force: true }); });
  return directory;
};

test('A3 real disk save restores RNG, pending inputs, queues, receipts and complete audit', async (t) => {
  const directory = await temporary(t), { bundle, systems } = createClockSmoke(0);
  const before = run(bundle, systems, 144), input = JSON.stringify(before);
  const file = await saveCheckpoint(before, { directory, rulesVersion: 'a-smoke-v1', systems });
  const restored = await loadCheckpoint(file, { rulesVersion: 'a-smoke-v1', systems });
  assert.deepEqual(restored, before); assert.equal(JSON.stringify(before), input);
  assert.equal(path.basename(file), 'checkpoint-r144.json');
  assert.deepEqual(run(restored, systems, 144), run(before, systems, 144));
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(file, 'utf8'))).sort(), ['formatVersion', 'snapshot', 'eventLog'].sort());
});

test('A3 100 days continuous equals 40 days saved/loaded then 60 days', { timeout: 180000 }, async (t) => {
  const directory = await temporary(t), { bundle, systems } = createClockSmoke(42);
  const continuous = run(bundle, systems, 100 * 144);
  const prefix = run(bundle, systems, 40 * 144);
  assert.ok(prefix.snapshot.pendingCommands.length > 0);
  const file = await saveCheckpoint(prefix, { directory, rulesVersion: 'a-smoke-v1', systems });
  const restored = await loadCheckpoint(file, { rulesVersion: 'a-smoke-v1', systems });
  assert.deepEqual(run(restored, systems, 60 * 144), continuous);
  assert.equal(continuous.snapshot.tick, 14400);
  assert.equal(continuous.eventLog.filter((event) => event.type === 'FixturePulse').length, 100);
});

test('A3 existing target cannot be overwritten, including concurrent saves', async (t) => {
  const directory = await temporary(t), { bundle, systems } = createClockSmoke();
  const opts = { directory, rulesVersion: 'a-smoke-v1', systems };
  const file = await saveCheckpoint(bundle, opts), previous = await fs.readFile(file);
  const altered = cloneBundle(bundle); altered.snapshot.world.resources.A++;
  await assert.rejects(saveCheckpoint(altered, opts), (e) => e.code === 'SAVE_FAILED' && e.cause.code === 'EEXIST');
  assert.deepEqual(await fs.readFile(file), previous);
  const next = advanceOneTick(bundle, systems);
  const results = await Promise.allSettled([saveCheckpoint(next, opts), saveCheckpoint(next, opts)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.code === 'SAVE_FAILED').length, 1);
  assert.deepEqual(await loadCheckpoint(path.join(directory, 'checkpoint-r1.json'), { rulesVersion: opts.rulesVersion, systems }), next);
});

test('A3 write/sync/close/publish faults never overwrite old checkpoints or publish partial data', async (t) => {
  const directory = await temporary(t), { bundle, systems } = createClockSmoke();
  const opts = { directory, rulesVersion: 'a-smoke-v1', systems };
  const oldFile = await saveCheckpoint(bundle, opts), bytes = await fs.readFile(oldFile);
  const next = advanceOneTick(bundle, systems);
  for (const point of ['writeFile', 'sync', 'close', 'link']) {
    const injected = { ...fs, async open(...args) {
      const handle = await fs.open(...args);
      if (args[1] !== 'wx') return handle;
      return Object.fromEntries(['writeFile', 'sync', 'close'].map((method) => [method, async (...values) => {
        if (method === point) { if (method === 'close') await handle.close(); throw new Error(point); }
        return handle[method](...values);
      }]));
    }, async link(...args) { if (point === 'link') throw new Error(point); return fs.link(...args); } };
    await assert.rejects(saveCheckpoint(next, opts, injected), (e) => e.code === 'SAVE_FAILED');
    assert.deepEqual(await fs.readFile(oldFile), bytes);
    await assert.rejects(fs.stat(path.join(directory, 'checkpoint-r1.json')), (e) => e.code === 'ENOENT');
  }
});

test('A3 invalid/truncated/unknown versions/oversized/missing files fail explicitly', async (t) => {
  const directory = await temporary(t), { bundle, systems } = createClockSmoke();
  const opts = { rulesVersion: 'a-smoke-v1', systems };
  const file = path.join(directory, 'bad.json');
  const good = run(bundle, systems, 144);
  const envelope = () => ({ formatVersion: 1, ...cloneBundle(good) });
  const corruptions = [
    (b) => { b.formatVersion = 2; }, (b) => { b.snapshot.schemaVersion = 1; },
    (b) => { b.snapshot.rulesVersion = 'incompatible'; },
    (b) => { b.snapshot.scheduledTasks[0].nextDueTick = 144; },
    (b) => { b.eventLog[0].eventSeq = 2; }, (b) => { Object.values(b.snapshot.commandReceipts)[0].eventSeqs = [99]; },
    (b) => { b.extra = 1; },
  ];
  for (let i = 0; i < corruptions.length; i++) {
    const bad = envelope(); corruptions[i](bad); await fs.writeFile(file, JSON.stringify(bad));
    await assert.rejects(loadCheckpoint(file, opts), (e) => e.code === (i < 3 ? 'UNSUPPORTED_VERSION' : 'INVALID_CHECKPOINT'));
  }
  await fs.writeFile(file, '{"formatVersion":1');
  await assert.rejects(loadCheckpoint(file, opts), (e) => e.code === 'INVALID_CHECKPOINT');
  await fs.writeFile(file, Buffer.from([0xff, 0xfe]));
  await assert.rejects(loadCheckpoint(file, opts), (e) => e.code === 'INVALID_CHECKPOINT');
  const handle = await fs.open(file, 'w'); await handle.truncate(64 * 1024 * 1024 + 1); await handle.close();
  await assert.rejects(loadCheckpoint(file, opts), (e) => e.code === 'LIMIT_EXCEEDED');
  await assert.rejects(loadCheckpoint(path.join(directory, 'missing.json'), opts), (e) => e.code === 'INVALID_CHECKPOINT');
  const tmp = path.join(directory, '.checkpoint-r0.json.orphan.tmp'); await fs.writeFile(tmp, JSON.stringify(envelope()));
  await assert.rejects(loadCheckpoint(tmp, opts), (e) => e.code === 'INVALID_CHECKPOINT');
});
