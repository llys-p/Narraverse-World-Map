import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createExperienceVillage, experienceSystems } from '../../runtime/fixtures/experience-village.mjs';
import { EXPERIENCE_RULES, EXPERIENCE_RUNTIME_STATE_VERSION } from '../../runtime/core/experience-state.mjs';
import { createMotivationVillage, motivationSystems } from '../../runtime/fixtures/motivation-village.mjs';
import { MOTIVATION_RULES } from '../../runtime/core/motivation-state.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { runSimulation, parseArguments } from '../../simulation-runner.mjs';

const systems = experienceSystems();
const advance = (ticks) => {
  const f = createExperienceVillage();
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(ticks);
  return s.getBundle();
};

async function temp(t) {
  const prefix = path.join(os.tmpdir(), 'world-experience-test-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test('E5: 连续 432 ticks 与分段推进 (200+232, 288+144) 及保存恢复严格相等', async (t) => {
  const dir = await temp(t);
  const whole432 = advance(432);

  for (const split of [200, 288]) {
    const atSplit = advance(split);
    const file = await saveCheckpoint(atSplit, { directory: dir, rulesVersion: EXPERIENCE_RULES, systems });
    const loaded = await loadCheckpoint(file, { rulesVersion: EXPERIENCE_RULES, systems });
    const s = createSimulationSession(loaded, systems);
    s.advanceTicks(432 - split);
    assert.deepEqual(s.getBundle(), whole432);
  }
});

test('E5: CLI 2日保存 + 2日恢复与连续4日严格相等，导出包含 experience-config 与 work-experience', async (t) => {
  const dir = await temp(t);
  const first = path.join(dir, 'first');
  const resumed = path.join(dir, 'resumed');
  const straight = path.join(dir, 'straight');

  // 1. Run first 2 days
  const a = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '2', '--seed', '42', '--out', first]));
  assert.equal(a.status, 'succeeded');
  assert.equal(a.rulesVersion, EXPERIENCE_RULES);
  assert.match(a.experienceConfigHash, /^[a-f0-9]{64}$/);
  assert.match(a.workExperienceHash, /^[a-f0-9]{64}$/);

  // 2. Resume 2 days
  const b = await runSimulation(parseArguments(['--resume', a.checkpointPath, '--days', '2', '--out', resumed]));
  assert.equal(b.status, 'succeeded');
  assert.equal(b.rulesVersion, EXPERIENCE_RULES);

  // 3. Straight 4 days
  const c = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '4', '--seed', '42', '--out', straight]));
  assert.equal(c.status, 'succeeded');
  assert.equal(c.rulesVersion, EXPERIENCE_RULES);

  // Hashes must match
  assert.equal(b.stateHash, c.stateHash);
  assert.equal(b.eventHash, c.eventHash);
  assert.equal(b.experienceConfigHash, c.experienceConfigHash);
  assert.equal(b.workExperienceHash, c.workExperienceHash);

  // File outputs must match
  for (const file of [
    'experience-config.json',
    'work-experience.json',
    'motivation-config.json',
    'mind-config.json',
    'resource-config.json',
    'ecology-config.json',
    'market-config.json',
    'actor-config.json',
    'society-config.json',
    'memory-config.json',
    'events.csv',
    'inputs.json',
    'economy.csv',
    'population.csv',
    'ecology.csv',
    'market.csv',
    'trade.csv',
    'actors.csv',
    'society.csv',
    'actions.csv',
    'memories.csv',
    'relationships.csv',
  ]) {
    const resumedContent = await fs.readFile(path.join(resumed, file), 'utf8');
    const straightContent = await fs.readFile(path.join(straight, file), 'utf8');
    assert.equal(resumedContent, straightContent, file);
  }

  // Checkpoints must match
  const resumedCp = JSON.parse(await fs.readFile(b.checkpointPath, 'utf8'));
  const straightCp = JSON.parse(await fs.readFile(c.checkpointPath, 'utf8'));
  assert.deepEqual(resumedCp, straightCp);

  // Verify work-experience.json contents
  const workExp = JSON.parse(await fs.readFile(path.join(resumed, 'work-experience.json'), 'utf8'));
  assert.equal(workExp.version, EXPERIENCE_RUNTIME_STATE_VERSION);
  assert.equal(workExp.actors.length, 2);
  const actor2Exp = workExp.actors.find((a) => a.actorId === 'actor-2');
  assert.equal(actor2Exp.workExperienceState.version, 'work-experience-state-v1');
  assert.equal(actor2Exp.workExperienceState.actorId, 'actor-2');
  assert.ok(Array.isArray(actor2Exp.workExperienceState.samples));
});

test('E7: 只读校验 legacy-oracle-87aa9b6-v2.json 与旧 motivation 行为未受污染', async () => {
  const oraclePath = 'D:/Narraverse-World-Map-m2-acceptance/artifacts/world-runtime-m2-acceptance-repair-20261008/legacy-oracle-87aa9b6-v2.json';
  const rawBytes = await fs.readFile(oraclePath);
  const fileHash = crypto.createHash('sha256').update(rawBytes).digest('hex').toUpperCase();
  assert.equal(fileHash, 'E7FEE8C0BD872A8294615172DD4EE7FEF6E6464663D2DF9FC4099D9261221B18');

  const oracle = JSON.parse(rawBytes.toString('utf8'));
  assert.equal(oracle.baselineSHA, '87aa9b605f5f509ce3b0daa97e34ded004d22f33');
  assert.ok(oracle.results.scenarios.d2cSixOperations);
  assert.ok(oracle.results.scenarios.c5FourDay);
  assert.ok(oracle.results.scenarios.default288Hash);
  assert.ok(oracle.results.scenarios.deadlineHashes);

  // Verify legacy motivation-village profile runs 288 ticks unmodified
  const f = createMotivationVillage();
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(288);
  const mBundle = s.getBundle();
  assert.equal(mBundle.snapshot.rulesVersion, MOTIVATION_RULES);
  assert.equal(mBundle.snapshot.tick, 288);
  validateBundle(mBundle, { rulesVersion: MOTIVATION_RULES, systems: f.systems });
});
