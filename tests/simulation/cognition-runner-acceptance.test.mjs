// M3-3B 独立验收：CLI、保存恢复、连续/切片重演与旧基准防劣化
// 合同唯一权威：m3-cognition-runtime-contract-v1（M3-3A §共同合同）
// 唯一起点：D:\Narraverse-World-Map-m3-integration @ a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { runSimulation, parseArguments } from '../../simulation-runner.mjs';
import { createExperienceVillage, experienceSystems } from '../../runtime/fixtures/experience-village.mjs';
import { EXPERIENCE_RULES } from '../../runtime/core/experience-state.mjs';
import { createMotivationVillage, motivationSystems } from '../../runtime/fixtures/motivation-village.mjs';
import { MOTIVATION_RULES } from '../../runtime/core/motivation-state.mjs';

// ---- A 路依赖探针 ----
const REQUIRED = [
  '../../runtime/core/cognition-state.mjs',
  '../../runtime/core/cognition-signals.mjs',
  '../../runtime/fixtures/cognition-village.mjs',
];
let deps = null, depFailure = null;
try {
  deps = {
    state: await import(REQUIRED[0]),
    signals: await import(REQUIRED[1]),
    fixture: await import(REQUIRED[2]),
  };
} catch (error) {
  depFailure = error;
}

const EXTRA_EXPORTS = [
  ['../../runtime/core/motivation-planner.mjs', () => import('../../runtime/core/motivation-planner.mjs'), ['planCognitionMotivationDecision']],
  ['../../runtime/core/motivation-runtime.mjs', () => import('../../runtime/core/motivation-runtime.mjs'), ['cognitionRuntimeHooks', 'validateCognitionWorld', 'executeCognitionPlayerIntent']],
];

let extraModules = [];
try {
  extraModules = await Promise.all(EXTRA_EXPORTS.map(async ([specifier, load, names]) => [specifier, await load(), names]));
} catch (error) {
  if (!depFailure) depFailure = error;
}

function gate() {
  if (depFailure !== null) {
    const directMissing = depFailure.code === 'ERR_MODULE_NOT_FOUND' &&
      REQUIRED.some(specifier => new URL(specifier, import.meta.url).href === depFailure.url);
    if (directMissing) {
      assert.fail('A_DEPENDENCY_PENDING: A 路精确交付 SHA 尚未派发；不得把待跑记为 PASS：' + depFailure.url);
    }
    throw depFailure; // transitive 缺失、语法错误等不能归为已知待跑。
  }
  for (const [specifier, module, names] of extraModules) {
    for (const name of names) {
      if (name === 'cognitionRuntimeHooks') {
        const hooks = module[name];
        const expected = ['createWorld', 'beforeSystems', 'afterSystems', 'applyAction', 'settleDay', 'validateHistory'];
        assert.ok(hooks !== null && typeof hooks === 'object' && !Array.isArray(hooks), specifier + ' hooks 必须为六函数对象');
        assert.deepEqual(Object.keys(hooks).sort(), expected.slice().sort());
        for (const key of expected) assert.equal(typeof hooks[key], 'function', key);
      } else {
        assert.equal(typeof module[name], 'function', specifier + ' 导出 ' + name);
      }
    }
  }
  for (const name of ['validateCognitionConfig', 'createCognitionModel', 'validateCognitionModel'])
    assert.equal(typeof deps.state[name], 'function', name);
  assert.equal(typeof deps.signals.deriveActorCognitionSignals, 'function');
  for (const name of ['defaultCognitionVillageConfig', 'createCognitionVillage', 'cognitionSystems'])
    assert.equal(typeof deps.fixture[name], 'function', name);
  return true;
}

async function temp(t) {
  const prefix = path.join(os.tmpdir(), 'world-cognition-runner-test-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

// ============================================================================
// C6: CLI / 恢复 / 完整重演 (864 连续 vs 切分, CLI 2+4 对比 6)
// ============================================================================
test('C6: 连续 864 ticks 与非日界切片 (200+664, 432+432) 严格重演相等', async (t) => {
  if (!gate(t)) return;
  const { createCognitionVillage, cognitionSystems } = deps.fixture;
  const { COGNITION_RULES } = deps.state;
  const systems = cognitionSystems();

  const advance = (ticks) => {
    const f = createCognitionVillage();
    const s = createSimulationSession(f.bundle, f.systems);
    s.advanceTicks(ticks);
    return s.getBundle();
  };

  const dir = await temp(t);
  const whole864 = advance(864);

  // 1. 非日界切分 200 + 664
  const at200 = advance(200);
  const file200 = await saveCheckpoint(at200, { directory: dir, rulesVersion: COGNITION_RULES, systems });
  const loaded200 = await loadCheckpoint(file200, { rulesVersion: COGNITION_RULES, systems });
  const s200 = createSimulationSession(loaded200, systems);
  s200.advanceTicks(664);
  assert.deepEqual(s200.getBundle(), whole864, '200+664 切片恢复与连续 864 严格相等');

  // 2. 日界切分 432 + 432
  const at432 = advance(432);
  const file432 = await saveCheckpoint(at432, { directory: dir, rulesVersion: COGNITION_RULES, systems });
  const loaded432 = await loadCheckpoint(file432, { rulesVersion: COGNITION_RULES, systems });
  const s432 = createSimulationSession(loaded432, systems);
  s432.advanceTicks(432);
  assert.deepEqual(s432.getBundle(), whole864, '432+432 切片恢复与连续 864 严格相等');
});

test('C6: CLI 2日保存 + 4日恢复与连续6日严格相等，全量文件与 Hash 逐字节一致', async (t) => {
  if (!gate(t)) return;
  const { COGNITION_RULES } = deps.state;
  const dir = await temp(t);
  const first = path.join(dir, 'first');
  const resumed = path.join(dir, 'resumed');
  const straight = path.join(dir, 'straight');

  // 1. Run first 2 days (288 ticks)
  const a = await runSimulation(parseArguments(['--fixture', 'cognition-village', '--days', '2', '--seed', '42', '--out', first]));
  assert.equal(a.status, 'succeeded');
  assert.equal(a.rulesVersion, COGNITION_RULES);
  assert.match(a.cognitionConfigHash, /^[a-f0-9]{64}$/);
  assert.match(a.cognitionStateHash, /^[a-f0-9]{64}$/);

  // 2. Resume 4 days (total 6 days / 864 ticks)
  const b = await runSimulation(parseArguments(['--resume', a.checkpointPath, '--days', '4', '--out', resumed]));
  assert.equal(b.status, 'succeeded');
  assert.equal(b.rulesVersion, COGNITION_RULES);

  // 3. Straight 6 days
  const c = await runSimulation(parseArguments(['--fixture', 'cognition-village', '--days', '6', '--seed', '42', '--out', straight]));
  assert.equal(c.status, 'succeeded');
  assert.equal(c.rulesVersion, COGNITION_RULES);

  // Hashes 严格匹配
  assert.equal(b.stateHash, c.stateHash);
  assert.equal(b.eventHash, c.eventHash);
  assert.equal(b.cognitionConfigHash, c.cognitionConfigHash);
  assert.equal(b.cognitionStateHash, c.cognitionStateHash);

  // 全部 24 个业务产物文件逐字节匹配
  const businessFiles = [
    'cognition-config.json',
    'cognition-state.json',
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
  ];

  for (const file of businessFiles) {
    const resumedContent = await fs.readFile(path.join(resumed, file), 'utf8');
    const straightContent = await fs.readFile(path.join(straight, file), 'utf8');
    assert.equal(resumedContent, straightContent, `产物文件 ${file} 必须逐字节相同`);
  }

  // Checkpoints 严格相等
  const resumedCp = JSON.parse(await fs.readFile(b.checkpointPath, 'utf8'));
  const straightCp = JSON.parse(await fs.readFile(c.checkpointPath, 'utf8'));
  assert.deepEqual(resumedCp, straightCp);

  // 校验 cognition-state.json 内容
  const cogState = JSON.parse(await fs.readFile(path.join(resumed, 'cognition-state.json'), 'utf8'));
  assert.equal(cogState.version, 'cognition-runtime-state-v1');
  assert.equal(cogState.actors.length, 2);
});

// ============================================================================
// C8: 旧规则兼容与基准防劣化 (只读核验 oracle，经验与动机规则 0 漂移)
// ============================================================================
const BASELINE_MANIFEST = 'D:/Narraverse-World-Map-m3-cognition-acceptance-review/artifacts/world-runtime-m33b-preparation-review-20261009/legacy-baseline/manifest.json';
const hash = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');
async function frozenBaseline() {
  // 缺缓存是 blocker；不得用候选运行结果生成或更新 expected。
  const manifest = JSON.parse(await fs.readFile(BASELINE_MANIFEST, 'utf8'));
  assert.equal(manifest.schema, 'world-runtime-m33b-legacy-baseline-v1');
  assert.equal(manifest.provenance.commit, 'a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2');
  assert.equal(manifest.provenance.sourceFingerprintBefore, 'b374db0a5966a33284caaddd5b642516980181738f15b2e57903d2b141f9531a');
  assert.equal(manifest.provenance.sourceFingerprintAfter, manifest.provenance.sourceFingerprintBefore);
  assert.equal(manifest.provenance.sourcePrePostMatch, true);
  assert.equal(manifest.provenance.cleanBefore, true);
  assert.equal(manifest.provenance.cleanAfter, true);
  assert.equal(manifest.matchContract.missingExpectedOrCacheIsBlocking, true);
  assert.equal(manifest.matchContract.candidateMustNotGenerateOrUpdateExpected, true);
  assert.deepEqual([manifest.scenario.simulationId, manifest.scenario.seed, manifest.scenario.tick], ['experience-village-seed-42', 42, 576]);
  const expectedPath = path.join(path.dirname(BASELINE_MANIFEST), manifest.expected.bundle.file);
  const raw = await fs.readFile(expectedPath);
  assert.equal(byteHash(raw), manifest.expected.bundle.byteSha256);
  const envelope = JSON.parse(raw.toString('utf8'));
  assert.equal(envelope.formatVersion, 1);
  const checkpoint = { snapshot: envelope.snapshot, eventLog: envelope.eventLog };
  assert.equal(hash(checkpoint), manifest.expected.bundle.bundleHash);
  assert.equal(hash(checkpoint.snapshot), manifest.expected.bundle.snapshotHash);
  assert.equal(hash(checkpoint.eventLog), manifest.expected.bundle.eventHash);
  return { manifest, checkpoint, directory: path.dirname(expectedPath) };
}

test('C8: 只读校验冻结 legacy oracle 的 raw/canonical payload 哈希及 D2C/C5 既有证明', async () => {
  const { manifest } = await frozenBaseline();
  const references = manifest.reusedExistingBaselines;
  const rawBytes = await fs.readFile(references.m2Oracle);
  const fileHash = byteHash(rawBytes).toUpperCase();
  assert.equal(fileHash, 'E7FEE8C0BD872A8294615172DD4EE7FEF6E6464663D2DF9FC4099D9261221B18');
  const oracle = JSON.parse(rawBytes.toString('utf8'));
  assert.equal(oracle.schemaVersion, 2);
  assert.equal(oracle.baselineSHA, '87aa9b605f5f509ce3b0daa97e34ded004d22f33');
  assert.ok(oracle.results.scenarios.d2cSixOperations, 'D2C 6 操作证据存在');
  assert.ok(oracle.results.scenarios.c5FourDay, 'C5 576 tick 证据存在');
  assert.ok(oracle.results.scenarios.default288Hash, 'M1 default 288 hash 存在');
  assert.ok(oracle.results.scenarios.deadlineHashes, 'Goal deadline hashes 存在');
  const payloadHash = hash({ scenarioSpecs: oracle.scenarioSpecs, provenance: oracle.provenance, results: oracle.results });
  assert.equal(payloadHash, '1ebe129b1a252434e8b103796778f3b71f9ffc6587cb0578f8ea7828d6c87f67');
  assert.equal(oracle.payloadHash, payloadHash);
  // 只消费既有有效 controller proof；不是本轮重新运行 D2/C5。
  for (const [scenario, file] of [['d2cSixOperations', references.d2cSixOperationBundle], ['c5FourDay', references.c5FourDayBundle]]) {
    const proof = JSON.parse(await fs.readFile(path.join(references.source, file), 'utf8'));
    assert.equal(hash(proof.snapshot), oracle.results.scenarios[scenario].stateHash, scenario + ' snapshot');
    assert.equal(hash(proof.eventLog), oracle.results.scenarios[scenario].eventHash, scenario + ' facts');
  }
});

test('C8: 冻结 a638 默认 experience 四日完整 bundle、业务输出与 M2 四日对照', async t => {
  const { manifest, checkpoint: expected, directory: expectedDirectory } = await frozenBaseline();
  const dir = await temp(t);
  const candidateDir = path.join(dir, 'experience');
  const summary = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '4', '--seed', '42', '--out', candidateDir]));
  assert.equal(summary.status, 'succeeded');
  const actual = await loadCheckpoint(summary.checkpointPath, { rulesVersion: EXPERIENCE_RULES, systems: experienceSystems() });
  assert.equal(actual.snapshot.rulesVersion, EXPERIENCE_RULES);
  assert.equal(actual.snapshot.tick, 576);
  validateBundle(actual, { rulesVersion: EXPERIENCE_RULES, systems: experienceSystems() });
  assert.deepEqual(actual, expected, '完整业务 bundle（含 receipt/IDs/RNG/facts）不得漂移');
  assert.equal(hash(actual), manifest.expected.bundle.bundleHash);
  const business = Object.fromEntries(Object.entries(summary).filter(([key]) => !manifest.expected.summaryVolatileFieldsExcluded.includes(key)));
  assert.deepEqual(business, manifest.expected.businessSummary);
  assert.deepEqual((await fs.readdir(candidateDir)).filter(name => name !== 'summary.json').sort(), Object.keys(manifest.expected.stableArtifactFiles).sort());
  for (const [file, expectedHash] of Object.entries(manifest.expected.stableArtifactFiles)) {
    const baselineBytes = await fs.readFile(path.join(expectedDirectory, file));
    assert.equal(byteHash(baselineBytes), expectedHash, '冻结缓存受损 ' + file);
    const actualBytes = await fs.readFile(path.join(candidateDir, file));
    assert.equal(byteHash(actualBytes), expectedHash, '候选业务输出漂移 ' + file);
    assert.deepEqual(actualBytes, baselineBytes, file + ' 逐字节相等');
  }

  // 保留原 M2 两日结构断言，再推进至合同所需四日与既有冻结完整 bundle 对照。
  const motF = createMotivationVillage(42, 'motivation-village-seed-42');
  const motS = createSimulationSession(motF.bundle, motF.systems);
  motS.advanceTicks(288);
  const motBundle = motS.getBundle();
  assert.equal(motBundle.snapshot.rulesVersion, MOTIVATION_RULES);
  assert.equal(motBundle.snapshot.tick, 288);
  validateBundle(motBundle, { rulesVersion: MOTIVATION_RULES, systems: motF.systems });
  motS.advanceTicks(288);
  const m2 = motS.getBundle();
  const references = manifest.reusedExistingBaselines;
  const m2Manifest = JSON.parse(await fs.readFile(path.join(references.source, references.m2Default576Manifest), 'utf8'));
  const m2Envelope = JSON.parse(await fs.readFile(path.join(references.source, 'm2-default-576-cli', 'checkpoint-r576.json'), 'utf8'));
  const m2Expected = { snapshot: m2Envelope.snapshot, eventLog: m2Envelope.eventLog };
  assert.equal(hash(m2Expected), m2Manifest.bundleHash, '旧 M2 cache/hash 必须有效');
  assert.equal(hash(m2), m2Manifest.bundleHash);
  assert.equal(hash(m2.snapshot), m2Manifest.snapshotHash);
  assert.equal(hash(m2.eventLog), m2Manifest.eventHash);
  assert.deepEqual(m2, m2Expected);
});
