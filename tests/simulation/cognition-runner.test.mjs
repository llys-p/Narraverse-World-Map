import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createCognitionVillage,
  cognitionSystems,
  defaultCognitionVillageConfig,
} from '../../runtime/fixtures/cognition-village.mjs';
import {
  createExperienceVillage,
  experienceSystems,
  defaultExperienceVillageConfig,
} from '../../runtime/fixtures/experience-village.mjs';
import { createMotivationVillage, motivationSystems } from '../../runtime/fixtures/motivation-village.mjs';
import {
  COGNITION_RULES,
  COGNITION_RUNTIME_STATE_VERSION,
} from '../../runtime/core/cognition-state.mjs';
import { EXPERIENCE_RULES } from '../../runtime/core/experience-state.mjs';
import { MOTIVATION_RULES } from '../../runtime/core/motivation-state.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import {
  MAX_CHECKPOINT_BYTES,
  saveCheckpoint,
  loadCheckpoint,
} from '../../runtime/persistence/checkpoint-store.mjs';
import { runSimulation, parseArguments } from '../../simulation-runner.mjs';

const BASELINE_SHA = 'a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2';
const EXPERIENCE_STATE_HASH_4D = '136f4f3877344330fa12fad454f38368fd4e7d4192036ca3c56697d2da8adeff';
const EXPERIENCE_EVENT_HASH_4D = 'c762a58246acdbda4025385908790edc20a55b0b4bb5d9b6aa60c49cada66116';
const MOTIVATION_STATE_HASH_4D = '7b7969592b80a54e704f8598022ff14c486056da4e467528697160ff966c98b7';
const MOTIVATION_EVENT_HASH_4D = 'd158921f1739566175b0cdbb47bbd26348db534c0007155337d16f4782144077';

async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'world-cognition-runner-test-');
  const directory = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.isAbsolute(directory) && directory.startsWith(prefix));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function advanceCognition(ticks) {
  const fixture = createCognitionVillage(42, 'cognition-village');
  const session = createSimulationSession(fixture.bundle, fixture.systems);
  session.advanceTicks(ticks);
  return { bundle: session.getBundle(), systems: fixture.systems };
}

test('C6: cognition fixture 深拷贝 M3-2 默认配置、使用位置参数并保留旧 fixture', () => {
  const cognition = defaultCognitionVillageConfig();
  const experience = defaultExperienceVillageConfig();
  for (const key of ['memory', 'mind', 'motivation', 'experience']) {
    assert.equal(canonicalJson(cognition[key]), canonicalJson(experience[key]), `${key} defaults`);
    assert.notEqual(cognition[key], experience[key], `${key} top-level reference`);
  }
  assert.deepEqual(cognition.cognition, {
    version: 'cognition-config-v1',
    profiles: [
      { actorId: 'actor-2', importancePermille: 700 },
      { actorId: 'actor-3', importancePermille: 400 },
    ],
  });

  const cognitionBytes = canonicalJson(defaultCognitionVillageConfig());
  const experienceBytes = canonicalJson(defaultExperienceVillageConfig());
  cognition.memory.society.actors.initialActors[0].health = 1;
  cognition.cognition.profiles[0].importancePermille = 0;
  assert.equal(canonicalJson(defaultCognitionVillageConfig()), cognitionBytes, 'later cognition defaults are fresh');
  assert.equal(canonicalJson(defaultExperienceVillageConfig()), experienceBytes, 'cognition mutation cannot reach experience defaults');
  experience.memory.society.actors.initialActors[0].health = 2;
  experience.mind.stimuli[0].kind = 'speech';
  assert.equal(canonicalJson(defaultCognitionVillageConfig()), cognitionBytes, 'experience mutation cannot reach cognition defaults');

  const defaults = createCognitionVillage();
  assert.equal(defaults.bundle.snapshot.rng.seed, 42);
  assert.equal(defaults.bundle.snapshot.simulationId, 'cognition-village');

  const positionalConfig = defaultCognitionVillageConfig();
  const created = createCognitionVillage(7, 'cognition-positional', positionalConfig);
  assert.deepEqual(Object.keys(created).sort(), ['bundle', 'systems']);
  assert.equal(created.bundle.snapshot.rng.seed, 7);
  assert.equal(created.bundle.snapshot.simulationId, 'cognition-positional');
  assert.equal(created.bundle.snapshot.rulesVersion, COGNITION_RULES);
  assert.equal(created.bundle.snapshot.fixtureId, 'cognition-village');
  assert.equal(created.bundle.snapshot.fixtureVersion, '1');
  assert.deepEqual(created.bundle.snapshot.world.cognitionModel.config, positionalConfig.cognition);
  assert.notEqual(created.bundle.snapshot.world.cognitionModel.config, positionalConfig.cognition);
  validateBundle(created.bundle, { rulesVersion: COGNITION_RULES, systems: cognitionSystems() });

  const oldExperience = createExperienceVillage();
  const oldMotivation = createMotivationVillage();
  assert.equal(oldExperience.bundle.snapshot.rulesVersion, EXPERIENCE_RULES);
  assert.equal(oldExperience.bundle.snapshot.fixtureId, 'experience-village');
  assert.equal(oldMotivation.bundle.snapshot.rulesVersion, MOTIVATION_RULES);
  assert.equal(oldMotivation.bundle.snapshot.fixtureId, 'motivation-village');
  validateBundle(oldExperience.bundle, { rulesVersion: EXPERIENCE_RULES, systems: oldExperience.systems });
  validateBundle(oldMotivation.bundle, { rulesVersion: MOTIVATION_RULES, systems: oldMotivation.systems });
});

test('C6: 连续 864 ticks 与 checkpoint 分段 200+664、432+432 的完整 bundle 严格相等', async (t) => {
  const directory = await temporary(t);
  const whole = advanceCognition(864).bundle;

  for (const split of [200, 432]) {
    const prefix = advanceCognition(split);
    const checkpoint = await saveCheckpoint(prefix.bundle, {
      directory,
      rulesVersion: COGNITION_RULES,
      systems: prefix.systems,
    });
    const restored = await loadCheckpoint(checkpoint, {
      rulesVersion: COGNITION_RULES,
      systems: prefix.systems,
    });
    const resumed = createSimulationSession(restored, prefix.systems);
    resumed.advanceTicks(864 - split);
    assert.deepEqual(resumed.getBundle(), whole, `split ${split}+${864 - split}`);
  }
});

test('C6: CLI 两日保存加四日恢复与连续六日逐业务 hash、逐产物字节相等', async (t) => {
  const directory = await temporary(t);
  const first = path.join(directory, 'first');
  const resumed = path.join(directory, 'resumed');
  const straight = path.join(directory, 'straight');
  const straightSummary = await runSimulation(parseArguments([
    '--fixture', 'cognition-village', '--days', '6', '--seed', '42', '--out', straight,
  ]));

  const firstSummary = await runSimulation(parseArguments([
    '--fixture', 'cognition-village', '--days', '2', '--seed', '42', '--out', first,
  ]));
  const resumedSummary = await runSimulation(parseArguments([
    '--resume', firstSummary.checkpointPath, '--days', '4', '--out', resumed,
  ]));

  for (const summary of [firstSummary, resumedSummary, straightSummary]) {
    assert.equal(summary.status, 'succeeded');
    assert.equal(summary.rulesVersion, COGNITION_RULES);
    assert.match(summary.cognitionConfigHash, /^[a-f0-9]{64}$/);
    assert.match(summary.cognitionStateHash, /^[a-f0-9]{64}$/);
  }
  for (const key of ['stateHash', 'eventHash', 'cognitionConfigHash', 'cognitionStateHash']) {
    assert.equal(resumedSummary[key], straightSummary[key], key);
  }

  const resumedFiles = (await fs.readdir(resumed)).filter((name) => name !== 'summary.json').sort();
  const straightFiles = (await fs.readdir(straight)).filter((name) => name !== 'summary.json').sort();
  assert.deepEqual(resumedFiles, straightFiles, 'all non-summary output files');
  for (const required of [
    'events.csv', 'inputs.json', 'economy.csv', 'population.csv', 'ecology.csv', 'market.csv',
    'trade.csv', 'actors.csv', 'society.csv', 'actions.csv', 'memories.csv', 'relationships.csv',
    'resource-config.json', 'ecology-config.json', 'market-config.json', 'actor-config.json',
    'society-config.json', 'memory-config.json', 'mind-config.json', 'motivation-config.json',
    'experience-config.json', 'work-experience.json', 'cognition-config.json', 'cognition-state.json',
    path.basename(resumedSummary.checkpointPath),
  ]) assert.ok(resumedFiles.includes(required), required);
  for (const file of resumedFiles) {
    assert.deepEqual(
      await fs.readFile(path.join(resumed, file)),
      await fs.readFile(path.join(straight, file)),
      file,
    );
  }

  const cognitionState = JSON.parse(await fs.readFile(path.join(resumed, 'cognition-state.json'), 'utf8'));
  const cognitionConfig = JSON.parse(await fs.readFile(path.join(resumed, 'cognition-config.json'), 'utf8'));
  const checkpoint = JSON.parse(await fs.readFile(resumedSummary.checkpointPath, 'utf8'));
  const snapshotModel = checkpoint.snapshot.world.cognitionModel;
  assert.deepEqual(Object.keys(cognitionState).sort(),
    ['actors', 'config', 'configFingerprint', 'cursor', 'simulationId', 'version']);
  assert.equal(cognitionState.version, COGNITION_RUNTIME_STATE_VERSION);
  assert.deepEqual(cognitionState.actors.map((actor) => actor.actorId), ['actor-2', 'actor-3']);
  assert.deepEqual(cognitionState, snapshotModel);
  assert.notEqual(cognitionState, snapshotModel);
  assert.notEqual(cognitionState.config, snapshotModel.config);
  assert.notEqual(cognitionState.actors, snapshotModel.actors);
  assert.deepEqual(cognitionConfig, snapshotModel.config);
});

test('C6: resume 路径上的 systemOverride（transformSystems 在 checkpoint 加载后施加）保持确定性且 summary 标记为真', async (t) => {
  const directory = await temporary(t);
  const first = path.join(directory, 'first');
  const firstSummary = await runSimulation(parseArguments([
    '--fixture', 'cognition-village', '--days', '2', '--seed', '42', '--out', first,
  ]));
  assert.equal(firstSummary.status, 'succeeded');
  assert.equal(firstSummary.systemOverride, false);

  let applied = 0;
  const transformSystems = (systems) => {
    applied += 1;
    assert.deepEqual(Object.keys(systems), ['society']);
    return { ...systems, society: (ctx, due) => systems.society(ctx, due) };
  };
  const overridden = path.join(directory, 'overridden');
  const summary = await runSimulation(parseArguments([
    '--resume', firstSummary.checkpointPath, '--days', '4', '--out', overridden,
  ]), { transformSystems });
  const straight = await runSimulation(parseArguments([
    '--fixture', 'cognition-village', '--days', '6', '--seed', '42', '--out', path.join(directory, 'straight'),
  ]));

  assert.equal(applied, 1, 'transformSystems is applied once, after the checkpoint is loaded');
  assert.equal(summary.status, 'succeeded');
  assert.equal(summary.systemOverride, true);
  assert.equal(summary.rulesVersion, COGNITION_RULES);
  assert.equal(summary.tick, 864);
  assert.equal(summary.stateHash, straight.stateHash, 'stateHash');
  assert.equal(summary.eventHash, straight.eventHash, 'eventHash');
  assert.equal(summary.cognitionConfigHash, straight.cognitionConfigHash, 'cognitionConfigHash');
  assert.equal(summary.cognitionStateHash, straight.cognitionStateHash, 'cognitionStateHash');
  for (const file of ['events.csv', 'inputs.json', 'cognition-state.json', 'cognition-config.json']) {
    assert.deepEqual(
      await fs.readFile(path.join(overridden, file)),
      await fs.readFile(path.join(directory, 'straight', file)),
      file,
    );
  }
});

test('C6: resume 路径注入的日界故障整 tick 回滚并保留 cognition 状态', async (t) => {
  const directory = await temporary(t);
  const first = path.join(directory, 'first');
  const firstSummary = await runSimulation(parseArguments([
    '--fixture', 'cognition-village', '--days', '2', '--seed', '42', '--out', first,
  ]));
  const failing = path.join(directory, 'failing');
  await assert.rejects(runSimulation(parseArguments([
    '--resume', firstSummary.checkpointPath, '--days', '4', '--out', failing,
  ]), {
    transformSystems(systems) {
      return {
        ...systems,
        society: (ctx, due) => {
          if (due.dueTick === 576) throw new Error('injected cognition day-boundary failure');
          return systems.society(ctx, due);
        },
      };
    },
  }), (error) => error.failedTick === 576 && error.summary.status === 'failed');

  const summary = JSON.parse(await fs.readFile(path.join(failing, 'summary.json'), 'utf8'));
  assert.equal(summary.tick, 575, 'the failing tick is rolled back as a whole');
  assert.equal(summary.failedTick, 576);
  assert.equal(summary.systemOverride, true);
  const checkpoint = JSON.parse(await fs.readFile(summary.checkpointPath, 'utf8'));
  assert.equal(checkpoint.snapshot.tick, 575);
  assert.equal(checkpoint.snapshot.world.cognitionModel.cursor, checkpoint.snapshot.nextEventSeq - 1);
  assert.deepEqual(checkpoint.snapshot.world.cognitionModel.actors.map((actor) => actor.actorId), ['actor-2', 'actor-3']);
});

test('C6: checkpoint 同规则恢复成功，cross-load 与未知版本保持 UNSUPPORTED_VERSION，损坏保留 cause', async (t) => {
  const directory = await temporary(t);
  const cognition = advanceCognition(288);
  const cognitionFile = await saveCheckpoint(cognition.bundle, {
    directory: path.join(directory, 'cognition'),
    rulesVersion: COGNITION_RULES,
    systems: cognition.systems,
  });
  const restored = await loadCheckpoint(cognitionFile, {
    rulesVersion: COGNITION_RULES,
    systems: cognition.systems,
  });
  assert.deepEqual(restored, cognition.bundle);

  for (const options of [
    { rulesVersion: EXPERIENCE_RULES, systems: experienceSystems() },
    { rulesVersion: MOTIVATION_RULES, systems: motivationSystems() },
  ]) {
    await assert.rejects(loadCheckpoint(cognitionFile, options), (error) => error.code === 'UNSUPPORTED_VERSION');
  }

  const experience = createExperienceVillage(42, 'experience-village');
  const experienceSession = createSimulationSession(experience.bundle, experience.systems);
  experienceSession.advanceTicks(288);
  const experienceFile = await saveCheckpoint(experienceSession.getBundle(), {
    directory: path.join(directory, 'experience'),
    rulesVersion: EXPERIENCE_RULES,
    systems: experience.systems,
  });
  await assert.rejects(loadCheckpoint(experienceFile, {
    rulesVersion: COGNITION_RULES,
    systems: cognition.systems,
  }), (error) => error.code === 'UNSUPPORTED_VERSION');

  const envelope = JSON.parse(await fs.readFile(cognitionFile, 'utf8'));
  const unknown = structuredClone(envelope);
  unknown.snapshot.rulesVersion = 'm-never-registered-v1';
  const unknownFile = path.join(directory, 'unknown.json');
  await fs.writeFile(unknownFile, JSON.stringify(unknown));
  await assert.rejects(loadCheckpoint(unknownFile, {
    rulesVersion: COGNITION_RULES,
    systems: cognition.systems,
  }), (error) => error.code === 'UNSUPPORTED_VERSION');

  const knownOldWithCognitionWorld = structuredClone(envelope);
  knownOldWithCognitionWorld.snapshot.rulesVersion = EXPERIENCE_RULES;
  knownOldWithCognitionWorld.snapshot.fixtureId = 'experience-village';
  const mixedFile = path.join(directory, 'known-old-rules-new-world.json');
  await fs.writeFile(mixedFile, JSON.stringify(knownOldWithCognitionWorld));
  await assert.rejects(loadCheckpoint(mixedFile, {
    rulesVersion: EXPERIENCE_RULES,
    systems: experienceSystems(),
  }), (error) => {
    assert.equal(error.code, 'INVALID_CHECKPOINT', `actual ${error.code}: ${error.message}`);
    assert.ok(error.cause, 'INVALID_CHECKPOINT retains cause');
    return true;
  });

  for (const [name, mutate] of [
    ['bad-anchor', (copy) => { copy.snapshot.world.cognitionModel.actors[0].lastReviewDecisionId = 'cognition-day-999-actor-2'; }],
    ['bad-cursor', (copy) => { copy.snapshot.world.cognitionModel.cursor -= 1; }],
  ]) {
    const corrupted = structuredClone(envelope);
    mutate(corrupted);
    const file = path.join(directory, `${name}.json`);
    await fs.writeFile(file, JSON.stringify(corrupted));
    await assert.rejects(loadCheckpoint(file, {
      rulesVersion: COGNITION_RULES,
      systems: cognition.systems,
    }), (error) => error.code === 'INVALID_CHECKPOINT' && error.cause !== undefined, name);
  }

  const oversized = path.join(directory, 'oversized.json');
  const handle = await fs.open(oversized, 'w');
  await handle.truncate(MAX_CHECKPOINT_BYTES + 1);
  await handle.close();
  await assert.rejects(loadCheckpoint(oversized, {
    rulesVersion: COGNITION_RULES,
    systems: cognition.systems,
  }), (error) => error.code === 'LIMIT_EXCEEDED');
});

test(`C8: ${BASELINE_SHA} 的 experience 与 motivation 默认四日 oracle 在新代码树保持不变`, async (t) => {
  const directory = await temporary(t);
  const experience = await runSimulation(parseArguments([
    '--fixture', 'experience-village', '--days', '4', '--seed', '42', '--out', path.join(directory, 'experience'),
  ]));
  assert.equal(experience.status, 'succeeded');
  assert.equal(experience.rulesVersion, EXPERIENCE_RULES);
  assert.equal(experience.tick, 576);
  assert.equal(experience.eventCount, 57);
  assert.equal(experience.stateHash, EXPERIENCE_STATE_HASH_4D);
  assert.equal(experience.eventHash, EXPERIENCE_EVENT_HASH_4D);

  const motivation = await runSimulation(parseArguments([
    '--fixture', 'motivation-village', '--days', '4', '--seed', '42', '--out', path.join(directory, 'motivation'),
  ]));
  assert.equal(motivation.status, 'succeeded');
  assert.equal(motivation.rulesVersion, MOTIVATION_RULES);
  assert.equal(motivation.tick, 576);
  assert.equal(motivation.eventCount, 56);
  assert.equal(motivation.stateHash, MOTIVATION_STATE_HASH_4D);
  assert.equal(motivation.eventHash, MOTIVATION_EVENT_HASH_4D);
});
