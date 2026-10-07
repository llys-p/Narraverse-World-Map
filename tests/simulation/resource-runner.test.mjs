import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createResourceVillage } from '../../runtime/fixtures/resource-village.mjs';
import { defaultResourceConfig, RESOURCE_RULES } from '../../runtime/core/resource-ledger.mjs';
import { advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'world-resource-test-'), folder = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(folder.startsWith(prefix)); await fs.rm(folder, { recursive: true, force: true }); });
  return folder;
}
const advance = (bundle, systems, ticks) => { for (let i = 0; i < ticks; i++) bundle = advanceOneTick(bundle, systems); return bundle; };

test('B1 real disk thirty days equals twelve saved plus eighteen resumed, including future flows and carries', async (t) => {
  const directory = await temporary(t), config = defaultResourceConfig();
  config.flows = [{ day: 13, resource: 'herbs', direction: 'in', amount: 20 },
    { day: 29, resource: 'food', direction: 'out', amount: 50 }];
  const { bundle, systems } = createResourceVillage(0, 'disk-resource', config);
  const continuous = advance(bundle, systems, 30 * 144), prefix = advance(bundle, systems, 12 * 144);
  const file = await saveCheckpoint(prefix, { directory, rulesVersion: RESOURCE_RULES, systems });
  const restored = await loadCheckpoint(file, { rulesVersion: RESOURCE_RULES, systems });
  const resumed = advance(restored, systems, 18 * 144); assert.deepEqual(resumed, continuous);
  assert.equal(resumed.eventLog.length, 30); assert.equal(resumed.snapshot.world.resourceModel.ledger.herbs.inflow, 20);
  assert.equal(resumed.snapshot.world.resourceModel.ledger.food.outflow, 50);
  const bad = JSON.parse(await fs.readFile(file, 'utf8')); bad.snapshot.world.resourceModel.remainders.herbs.production++;
  const corrupt = path.join(directory, 'bad.json'); await fs.writeFile(corrupt, JSON.stringify(bad));
  await assert.rejects(loadCheckpoint(corrupt, { rulesVersion: RESOURCE_RULES, systems }), e => e.code === 'INVALID_CHECKPOINT');
});

test('B1 real CLI exports configuration and daily accounting, and resumes registered resource rules', async (t) => {
  const directory = await temporary(t), first = path.join(directory, 'first'), resumed = path.join(directory, 'resumed');
  const cli = args => spawnSync(process.execPath, ['simulation-runner.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 60000 });
  const result = cli(['--fixture', 'resource-village', '--days', '2', '--seed', '0', '--out', first]);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(await fs.readFile(path.join(first, 'summary.json'), 'utf8'));
  assert.equal(summary.rulesVersion, RESOURCE_RULES); assert.equal(summary.tick, 288); assert.equal(summary.seed, 0);
  const config = JSON.parse(await fs.readFile(path.join(first, 'resource-config.json'), 'utf8'));
  assert.deepEqual(config, defaultResourceConfig()); assert.match(summary.resourceConfigHash, /^[a-f0-9]{64}$/);
  const csv = await fs.readFile(path.join(first, 'economy.csv'), 'utf8');
  assert.equal(csv.trim().split('\n').length, 7); assert.match(csv, /unmetConsumption/); assert.match(csv, /food/);
  const second = cli(['--resume', summary.checkpointPath, '--days', '1', '--out', resumed]);
  assert.equal(second.status, 0, second.stderr);
  const end = JSON.parse(await fs.readFile(path.join(resumed, 'summary.json'), 'utf8'));
  assert.equal(end.startTick, 288); assert.equal(end.tick, 432); assert.equal(end.resourceConfigHash, summary.resourceConfigHash);
  const checkpoint = JSON.parse(await fs.readFile(end.checkpointPath, 'utf8'));
  assert.equal(checkpoint.snapshot.world.resourceModel.day, 3);
  const unknown = structuredClone(checkpoint); unknown.snapshot.rulesVersion = 'unregistered-resource-v9';
  const bad = path.join(directory, 'unknown.json'); await fs.writeFile(bad, JSON.stringify(unknown));
  const rejected = cli(['--resume', bad, '--days', '1', '--out', path.join(directory, 'rejected')]);
  assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /UNSUPPORTED_VERSION/);
  await assert.rejects(fs.stat(path.join(directory, 'rejected')), e => e.code === 'ENOENT');
});
