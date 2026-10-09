// M3-3B 独立验收：CLI、保存恢复、连续/切片重演与旧基准防劣化
// 合同唯一权威：m3-cognition-runtime-contract-v1（M3-3A §共同合同）
// 唯一起点：D:\Narraverse-World-Map-m3-integration @ a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
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

function gate(t) {
  if (depFailure !== null) {
    if (depFailure.code === 'ERR_MODULE_NOT_FOUND') {
      t.skip('A 路依赖未导入，待中控派发精确 SHA 后运行：' + (depFailure.url ?? REQUIRED.join(', ')));
      return false;
    }
    assert.fail('A 路依赖模块加载失败（非缺失）：' + (depFailure.stack ?? String(depFailure)));
  }
  const missing = [];
  for (const [specifier, module, names] of extraModules) {
    for (const name of names) {
      if (typeof module[name] !== 'function' && typeof module[name] !== 'object') {
        missing.push(specifier + ' 导出 ' + name);
      }
    }
  }
  assert.deepEqual(missing, [], '已导入依赖缺失或导出类型错误不得跳过');
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
test('C8: 只读校验 legacy-oracle-87aa9b6-v2.json 权威哈希与基准数据', async () => {
  const oraclePath = 'D:/Narraverse-World-Map-m2-acceptance/artifacts/world-runtime-m2-acceptance-repair-20261008/legacy-oracle-87aa9b6-v2.json';
  const rawBytes = await fs.readFile(oraclePath);
  const fileHash = createHash('sha256').update(rawBytes).digest('hex').toUpperCase();
  assert.equal(fileHash, 'E7FEE8C0BD872A8294615172DD4EE7FEF6E6464663D2DF9FC4099D9261221B18');

  const oracle = JSON.parse(rawBytes.toString('utf8'));
  assert.equal(oracle.schemaVersion, 2);
  assert.equal(oracle.baselineSHA, '87aa9b605f5f509ce3b0daa97e34ded004d22f33');
  assert.ok(oracle.results.scenarios.d2cSixOperations, 'D2C 6 操作证据存在');
  assert.ok(oracle.results.scenarios.c5FourDay, 'C5 576 tick 证据存在');
  assert.ok(oracle.results.scenarios.default288Hash, 'M1 default 288 hash 存在');
  assert.ok(oracle.results.scenarios.deadlineHashes, 'Goal deadline hashes 存在');
});

test('C8: 旧规则 m-experience-v1 (4日) 与 m-motivation-v1 (2日) 行为零漂移', async () => {
  // 1. experience-village 4 日 (576 ticks)
  const expF = createExperienceVillage();
  const expS = createSimulationSession(expF.bundle, expF.systems);
  expS.advanceTicks(576);
  const expBundle = expS.getBundle();
  assert.equal(expBundle.snapshot.rulesVersion, EXPERIENCE_RULES);
  assert.equal(expBundle.snapshot.tick, 576);
  validateBundle(expBundle, { rulesVersion: EXPERIENCE_RULES, systems: expF.systems });

  // 2. motivation-village 2 日 (288 ticks)
  const motF = createMotivationVillage();
  const motS = createSimulationSession(motF.bundle, motF.systems);
  motS.advanceTicks(288);
  const motBundle = motS.getBundle();
  assert.equal(motBundle.snapshot.rulesVersion, MOTIVATION_RULES);
  assert.equal(motBundle.snapshot.tick, 288);
  validateBundle(motBundle, { rulesVersion: MOTIVATION_RULES, systems: motF.systems });
});
