// M3-2B 独立验收（B 路）：真实 CLI、checkpoint/resume、业务文件对照、旧 profile 与历史 oracle。
// 合同唯一权威：m3-experience-runtime-contract-v1（M3-2A §共同合同）；旧四日预期另据 m2-contract-v2 §2/Q7。
// 独立性：expected 全部来自 oracle 指纹/冻结源码与合同文本（注释注明来源）；不从被测实现反推。
// 本文件与 experience-acceptance.test.mjs 互不 import；仅依赖 node: 内置与生产模块。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { validateBundle } from '../../runtime/core/world-state.mjs';
import { canonicalJson } from '../../runtime/core/data-contract.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { runSimulation, parseArguments } from '../../simulation-runner.mjs';
import { defaultMotivationVillageConfig, createMotivationVillage, motivationSystems } from '../../runtime/fixtures/motivation-village.mjs';
import { MOTIVATION_RULES } from '../../runtime/core/motivation-state.mjs';
import { createPersonalityHealth } from '../../runtime/fixtures/personality-village.mjs';
import { createPlayerPlayVillage } from '../../runtime/fixtures/player-play-village.mjs';
import { executePlayerIntent } from '../../runtime/core/player-intents.mjs';
import { createMindVillage, defaultMindVillageConfig } from '../../runtime/fixtures/mind-village.mjs';
import { projectMindInspector } from '../../runtime/knowledge/mind-knowledge.mjs';
import { projectMotivationInspector } from '../../runtime/knowledge/motivation-knowledge.mjs';

// ---- A 路依赖探针：精确目标缺失阻断验收；其他加载错误保留原始失败 ----
const REQUIRED = ['../../runtime/core/experience-state.mjs', '../../runtime/core/work-experience-adapter.mjs', '../../runtime/fixtures/experience-village.mjs'];
let deps = null, depFailure = null;
try {
  deps = { state: await import(REQUIRED[0]), adapter: await import(REQUIRED[1]), fixture: await import(REQUIRED[2]) };
} catch (error) { depFailure = error; }
const EXTRA_EXPORTS = [
  ['../../runtime/core/motivation-planner.mjs', () => import('../../runtime/core/motivation-planner.mjs'), ['planExperienceMotivationDecision']],
  ['../../runtime/core/motivation-runtime.mjs', () => import('../../runtime/core/motivation-runtime.mjs'), ['experienceRuntimeHooks', 'validateExperienceWorld', 'executeExperiencePlayerIntent']],
  ['../../runtime/core/motivation-state.mjs', () => import('../../runtime/core/motivation-state.mjs'), ['validateExperienceMotivationDecision', 'validateExperienceMotivationModel']],
];
const extraModules = await Promise.all(EXTRA_EXPORTS.map(async ([specifier, load, names]) => [specifier, await load(), names]));
function gate(t) {
  if (depFailure !== null) {
    // G0: required evidence comes first. A missing A-lane dependency blocks PASS; it is never a skip.
    if (depFailure.code === 'ERR_MODULE_NOT_FOUND' &&
        REQUIRED.some(specifier => depFailure.url === new URL(specifier, import.meta.url).href))
      assert.fail('REQUIRED_EVIDENCE_MISSING: A 路 required 依赖未导入，本门阻断 PASS：' +
        (depFailure.url ?? REQUIRED.join(', ')));
    throw depFailure;
  }
  const missing = [];
  for (const [specifier, module, names] of extraModules)
    for (const name of names)
      if (name === 'experienceRuntimeHooks') {
        const hooks = module[name];
        const expected = ['createWorld', 'beforeSystems', 'afterSystems', 'applyAction', 'settleDay', 'validateHistory'];
        assert.ok(hooks && typeof hooks === 'object', '合同 §5：experienceRuntimeHooks 是六函数对象');
        assert.deepEqual(Object.keys(hooks).sort(), expected.slice().sort());
        for (const key of expected) assert.equal(typeof hooks[key], 'function', key);
      } else if (typeof module[name] !== 'function') missing.push(specifier + ' 导出 ' + name);
  assert.deepEqual(missing, [], '已导入依赖缺失或导出类型错误不得跳过');
  return true;
}

// ---- 公共工具 ----
const ORACLE_PATH = 'D:/Narraverse-World-Map-m2-acceptance/artifacts/world-runtime-m2-acceptance-repair-20261008/legacy-oracle-87aa9b6-v2.json';
// G0: M34_ORACLE_FILE only locates a read-only evidence entity - never world config, business
// input or an HTTP option. Unset keeps the original control path. Missing entity is a blocker,
// an unreadable one is never treated as a legitimate absence, and a parseable but unknown
// schema/baseline is rejected as a version problem before any byte comparison.
const ORACLE_ENV = 'M34_ORACLE_FILE';
const ORACLE_BASELINE = '87aa9b605f5f509ce3b0daa97e34ded004d22f33';
const ORACLE_SCHEMA_VERSION = 2;
const ORACLE_RAW_SHA256 = 'e7fee8c0bd872a8294615172dd4ee7fef6e6464663d2df9fc4099d9261221b18';
const ORACLE_PAYLOAD_SHA256 = '1ebe129b1a252434e8b103796778f3b71f9ffc6587cb0578f8ea7828d6c87f67';
function oraclePath() {
  const fromEnv = process.env[ORACLE_ENV];
  return fromEnv && fromEnv.trim() !== '' ? path.resolve(fromEnv) : ORACLE_PATH;
}
function readOracleRaw() {
  try { return readFileSync(oraclePath()); }
  catch (error) {
    if (error.code === 'ENOENT')
      assert.fail('REQUIRED_EVIDENCE_MISSING: required oracle 证据实体缺失 ' + oraclePath());
    assert.fail('EVIDENCE_INTEGRITY_FAILED: oracle 证据实体不可读（' + error.code + '），' +
      'I/O 或权限错误不得解释为合法缺文件');
  }
}
function parseOracle(raw) {
  try { return JSON.parse(raw.toString('utf8')); }
  catch { assert.fail('EVIDENCE_INTEGRITY_FAILED: oracle RAW 不是合法 JSON，证据已损坏'); }
}
function requireOracleProvenance(oracle) {
  if (oracle === null || typeof oracle !== 'object' || Array.isArray(oracle))
    assert.fail('EVIDENCE_INTEGRITY_FAILED: oracle 顶层不是 JSON 对象');
  if (oracle.schemaVersion !== ORACLE_SCHEMA_VERSION || oracle.baselineSHA !== ORACLE_BASELINE)
    assert.fail('UNSUPPORTED_EVIDENCE_VERSION: oracle schema/baseline 非本轮权威（schema ' +
      String(oracle.schemaVersion) + ', baseline ' + String(oracle.baselineSHA) + '）');
  const payload = hash({ scenarioSpecs: oracle.scenarioSpecs, provenance: oracle.provenance, results: oracle.results });
  if (oracle.payloadHash !== payload)
    assert.fail('EVIDENCE_INTEGRITY_FAILED: oracle payloadHash 字段与重算 canonical payload 不符');
  return oracle;
}
// oracle 文件只读：绝不修改/复制/提交该 artifact；缺失或损坏现在都是明确阻断（见指纹门）。
function loadOracle(t) {
  const raw = readOracleRaw();
  const oracle = requireOracleProvenance(parseOracle(raw));
  assert.equal(createHash('sha256').update(raw).digest('hex'), ORACLE_RAW_SHA256,
    'EVIDENCE_INTEGRITY_FAILED: RAW SHA256 不符（证据：文件被改动或非受控版本）');
  const payload = hash({ scenarioSpecs: oracle.scenarioSpecs, provenance: oracle.provenance, results: oracle.results });
  assert.equal(payload, ORACLE_PAYLOAD_SHA256, 'EVIDENCE_INTEGRITY_FAILED: canonical payload SHA256 不符');
  return oracle;
}
// 与 simulation-runner 完全一致的哈希公式：sha256(canonicalJson(value))，canonical 递归排序键、UTF-8。
const hash = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
async function temp(t) {
  const prefix = path.join(os.tmpdir(), 'world-m3b-experience-runner-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix)); await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}
// summary 只比较业务字段：排除 source identity、startTick、elapsed、memory、executionStats 等运行元数据（E5）。
function summaryBusiness(summary) {
  const {
    codeSha, codeDirty, codeMetadataStatus, sourceHash, nodeVersion, startTick, elapsedMs, memoryUsage,
    executionStats, error, systemOverride, failedTick, checkpointPath, ...business
  } = summary;
  return business;
}
const agentOf = (b, id = 'actor-2') => b.snapshot.world.societyModel.agents.find(a => a.state.actorId === id).state;
const bodyOf = (b, id = 'actor-2') => b.snapshot.world.actorModel.actors.find(a => a.actorId === id);
const mindOf = (b, id = 'actor-2') => b.snapshot.world.motivationModel.actors.find(a => a.actorId === id);

test('E7 oracle 指纹门：RAW SHA256、canonical payload SHA256、schema/baseline/payloadHash 字段', t => {
  const oracle = loadOracle(t);
  assert.equal(oracle.schemaVersion, ORACLE_SCHEMA_VERSION);
  assert.equal(oracle.baselineSHA, ORACLE_BASELINE);
  // canonical({scenarioSpecs,provenance,results})（递归排序键、UTF-8）payload 指纹。
  const payload = createHash('sha256').update(
    canonicalJson({ scenarioSpecs: oracle.scenarioSpecs, provenance: oracle.provenance, results: oracle.results }), 'utf8').digest('hex');
  assert.equal(payload, ORACLE_PAYLOAD_SHA256,
    'EVIDENCE_INTEGRITY_FAILED: canonical payload SHA256 不符');
  assert.equal(oracle.payloadHash, payload, 'payloadHash 字段与重算不一致');
});

test('E7 oracle default288Hash 与旧 inspector 投影（mind-village 默认配置，seed42，simulationId 取自 oracle 内容）', t => {
  const oracle = loadOracle(t); if (!oracle) return;
  // recipe 说明：oracle scenarioSpecs 未含该场景；通过精确复现唯一确定——默认 mind-village、seed 42、推进 288，
  // simulationId 'm2c-old-default'（见 oracle results.scenarios.inspector.simulationId）。stateHash 口径为 hash(bundle)。
  const f = createMindVillage(42, 'm2c-old-default');
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(288);
  const bundle = s.getBundle();
  assert.equal(hash({ snapshot: bundle.snapshot, eventLog: bundle.eventLog }), oracle.results.scenarios.default288Hash);
  const view = projectMindInspector(bundle);
  assert.equal(canonicalJson(view), canonicalJson(oracle.results.scenarios.inspector));
});

test('E7 oracle deadlineStates：M1 Goal 期限 recipe（day1/20/21/22/23），state=actor-2 的 {goal,failed,cooldown}', t => {
  const oracle = loadOracle(t); if (!oracle) return;
  // recipe 来自冻结源码 tests/simulation/mind-goal-boundary.test.mjs（未改动的 M1 验收测试）。
  const config = defaultMindVillageConfig();
  config.mind.stimuli = [];
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial = 0;
  for (const estate of config.memory.society.estates.slice(1, 3)) estate.initialFood = 32;
  const f = createMindVillage(42, 'mind-goal-boundary-seed42', config);
  const s = createSimulationSession(f.bundle, f.systems);
  const days = [1, 20, 21, 22, 23];
  for (let day = 1; day <= 23; day++) {
    s.advanceTicks(144);
    if (!days.includes(day)) continue;
    const bundle = s.getBundle();
    const state = agentOf(bundle);
    // 冻结 M1 测试同时断言 actor-3 与 actor-2 状态一致；oracle 记录的是该共同状态。
    const actor3 = agentOf(bundle, 'actor-3');
    assert.deepEqual({ goal: actor3.currentGoal, failed: actor3.ledger.goalsFailed, cooldown: actor3.cooldownUntilDay },
      { goal: state.currentGoal, failed: state.ledger.goalsFailed, cooldown: state.cooldownUntilDay }, 'day ' + day + ' 两 actor 状态一致');
    assert.deepEqual({ goal: state.currentGoal, failed: state.ledger.goalsFailed, cooldown: state.cooldownUntilDay },
      oracle.results.scenarios.deadlineStates[days.indexOf(day)], 'day ' + day);
  }
});

test('E7 optional oracle deadlineHashes：冻结原脚本完整 bundle 的五个检查点哈希', t => {
  const oracle = loadOracle(t); if (!oracle) return;
  // 冻结 M2 tests/motivation-inspector-acceptance.test.mjs:206-211 goalScenario 配方，220-223 deadline.map(hash)。
  // simulationId 是 m2c-old-deadline；哈希对象是完整 getBundle，不是 deadlineStates 投影。
  const config = defaultMindVillageConfig();
  config.mind.stimuli = [];
  config.memory.society.actors.market.ecology.resources.resources.herbs.initial = 0;
  for (const estate of config.memory.society.estates.slice(1, 3)) estate.initialFood = 32;
  const f = createMindVillage(42, 'm2c-old-deadline', config);
  const s = createSimulationSession(f.bundle, f.systems);
  const actual = [];
  for (const ticks of [144, 19 * 144, 144, 144, 144]) {
    s.advanceTicks(ticks);
    actual.push(hash(s.getBundle()));
  }
  assert.deepEqual(actual, oracle.results.scenarios.deadlineHashes);
});

test('E7 oracle c5FourDay：createPersonalityHealth(42,"personality-health-seed-42") 推进576，stateHash/eventHash 匹配', t => {
  const oracle = loadOracle(t); if (!oracle) return;
  const spec = oracle.scenarioSpecs.c5FourDay;
  const f = createPersonalityHealth(42, 'personality-health-seed-42');
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(spec.advanceTicks);
  const bundle = s.getBundle();
  assert.equal(bundle.snapshot.simulationId, spec.simulationId);
  assert.equal(bundle.snapshot.tick, spec.advanceTicks);
  assert.equal(canonicalJson(bundle.snapshot.world.memoryModel.config), canonicalJson(spec.config), 'fixture 配置必须与 oracle spec 一致');
  assert.equal(hash(bundle.snapshot), oracle.results.scenarios.c5FourDay.stateHash);
  assert.equal(hash(bundle.eventLog), oracle.results.scenarios.c5FourDay.eventHash);
  // oracle files.*（actors.json/economy.json/memories.json 等）是旧基线 runner 的导出文件名，现行 runner 产出
  // 同语义的 .csv/新集合，字节口径无法从冻结源唯一对应，不在本路断言（交中控裁定的未覆盖项）。
});

test('E7 oracle d2cSixOperations：五次玩家意图（0→32）+ advance144 → 终 tick176、玩家 105/4/0', t => {
  const oracle = loadOracle(t); if (!oracle) return;
  const spec = oracle.scenarioSpecs.d2cSixOperations;
  const f = createPlayerPlayVillage(42, 'player-play-village');
  let bundle = f.bundle;
  // 六操作 = 依次执行 5 条玩家意图（1+1+12+6+12=32 ticks）再推进 144（32+144=176=finalTick）。
  for (const command of spec.commands) {
    bundle = executePlayerIntent(bundle, { commandId: command.commandId, type: command.type, payload: JSON.parse(JSON.stringify(command.payload)) }).bundle;
  }
  const s = createSimulationSession(bundle, f.systems);
  s.advanceTicks(144);
  const final = s.getBundle();
  assert.equal(final.snapshot.tick, spec.finalTick);
  assert.equal(canonicalJson(final.snapshot.world.memoryModel.config), canonicalJson(spec.config), 'fixture 配置必须与 oracle spec 一致');
  const player = final.snapshot.world.playerModel;
  assert.deepEqual({ wallet: player.wallet, food: player.inventory.food, herbs: player.inventory.herbs }, spec.finalPlayer);
  assert.equal(hash(final.snapshot), oracle.results.scenarios.d2cSixOperations.stateHash);
  assert.equal(hash(final.eventLog), oracle.results.scenarios.d2cSixOperations.eventHash);
});

test('E7 旧 M2 默认四日（m2-contract-v2 §2 固定四日预期；与 oracle 并行的独立 expected，不含 oracle 场景）', () => {
  const f = createMotivationVillage(42, 'm2c-independent');
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(144);
  const b1 = s.getBundle();
  // tick144：actor-2/3 各买药（价 50），创建 Goal1/Plan1，购买成功后等待 Use。
  assert.deepEqual([mindOf(b1).lastDecision.choice, mindOf(b1, 'actor-3').lastDecision.choice], ['BuyMedicine', 'BuyMedicine']);
  assert.deepEqual([mindOf(b1).lastOutcome.price, agentOf(b1).wallet, agentOf(b1, 'actor-3').wallet], [50, 50, 50]);
  assert.deepEqual(mindOf(b1).lastOutcome.delta, { wallet: -50, herbs: 1, health: 0, fatigue: 0 });
  assert.equal(agentOf(b1).currentGoal.step, 'use');
  s.advanceTicks(56);
  const b2 = s.getBundle();
  // tick200 收到 d01。
  assert.deepEqual([mindOf(b2).lastDuty.requestId, mindOf(b2).lastDuty.status], ['d01', 'pending']);
  s.advanceTicks(88);
  const b3 = s.getBundle();
  // tick288：NEW_MAJOR_DUTY 完整重评，Work 710 > Use 700 > Rest 650；成功回执后 d01 fulfilled/fulfilledTick=288，
  // 工资 +20、公粮生产记账 8、fatigue 650→800，Goal1/Plan1 挂起且 Goal.step 仍为 use。
  const m3 = mindOf(b3);
  assert.deepEqual([m3.lastDecision.choice, m3.lastDecision.gateReason, m3.lastDecision.candidates[2].score], ['WorkForPay', 'NEW_MAJOR_DUTY', 710]);
  assert.deepEqual([m3.lastDecision.innerStance, m3.lastDecision.committedIntent, m3.lastDecision.apparentAction],
    ['health-concerned', { goalId: 1, kind: 'recover-health' }, 'WorkForPay']);
  assert.deepEqual([m3.lastDuty.status, m3.lastDuty.fulfilledTick], ['fulfilled', 288]);
  assert.deepEqual(m3.lastOutcome.delta, { wallet: 20, herbs: 0, health: 0, fatigue: 150 });
  assert.equal(m3.lastOutcome.publicFoodProduced, 8);
  assert.equal(bodyOf(b3).fatigue, 800);
  assert.equal(agentOf(b3).currentGoal.step, 'use');
  // Work 是临时职责：命令 payload goalId=0；成功 receipt.result 与 SocietyActionCommitted.payload 完整 canonical 相等。
  const receipt = b3.snapshot.commandReceipts['motivation-day-2-actor-2'];
  assert.equal(receipt.input.payload.goalId, 0);
  assert.equal(canonicalJson(receipt.result),
    canonicalJson(b3.eventLog.find(e => e.type === 'SocietyActionCommitted' && e.commandId === 'motivation-day-2-actor-2').payload));
  s.advanceTicks(144);
  const b4 = s.getBundle();
  // tick432：请求已过期 → URGENT_FATIGUE 只选择 Rest；日结 fatigue=600；Goal1/Plan1 保留挂起。
  const m4 = mindOf(b4);
  assert.deepEqual([m4.lastDecision.choice, m4.lastDecision.gateReason], ['Rest', 'URGENT_FATIGUE']);
  assert.deepEqual(m4.lastDecision.candidates.filter(c => c.selectable).map(c => c.action), ['Rest']);
  assert.equal(bodyOf(b4).fatigue, 600);
  assert.equal(m4.suspendedPlan.planId, 1);
  s.advanceTicks(144);
  const b5 = s.getBundle();
  // tick576：RESUME_COMMITTED 恢复原 planId1 执行 Use，私药 −1、health 400→500，长期 health Goal 未完成（target 800）。
  const m5 = mindOf(b5);
  assert.deepEqual([m5.lastDecision.choice, m5.lastDecision.gateReason, m5.lastDecision.planId], ['UseMedicine', 'RESUME_COMMITTED', 1]);
  assert.equal(agentOf(b5).inventory.herbs, 0);
  assert.equal(bodyOf(b5).health, 500);
  assert.deepEqual([agentOf(b5).currentGoal.goalId, agentOf(b5).currentGoal.target], [1, 800]);
});

test('E7 旧 profile CLI/checkpoint：2日存档+2日恢复 与 连续4日 summary 与业务产物一致', async t => {
  const dir = await temp(t);
  const first = path.join(dir, 'first'), resumed = path.join(dir, 'resumed'), straight = path.join(dir, 'straight');
  const a = await runSimulation(parseArguments(['--fixture', 'motivation-village', '--days', '2', '--seed', '42', '--out', first]));
  assert.equal(a.status, 'succeeded');
  assert.equal(a.rulesVersion, MOTIVATION_RULES);
  assert.equal(a.tick, 288);
  const b = await runSimulation(parseArguments(['--resume', a.checkpointPath, '--days', '2', '--out', resumed]));
  const c = await runSimulation(parseArguments(['--fixture', 'motivation-village', '--days', '4', '--seed', '42', '--out', straight]));
  assert.equal(b.status, 'succeeded');
  assert.equal(c.status, 'succeeded');
  assert.deepEqual(summaryBusiness(b), summaryBusiness(c));
  // 业务文件集合与内容一致；checkpoint 按 JSON 语义比较。
  const files = (await fs.readdir(resumed)).sort(), straightFiles = (await fs.readdir(straight)).sort();
  assert.deepEqual(files, straightFiles);
  for (const file of files) {
    if (file === 'summary.json') continue;
    const x = await fs.readFile(path.join(resumed, file), 'utf8'), y = await fs.readFile(path.join(straight, file), 'utf8');
    if (file.endsWith('.json')) assert.deepEqual(JSON.parse(x), JSON.parse(y), file);
    else assert.equal(x, y, file);
  }
});

test('E5 新 profile：连续/程序化分段/CLI 恢复一致，summary 新增 experienceConfigHash/workExperienceHash，导出脱离引用', async t => {
  if (!gate(t)) return;
  const systems = deps.fixture.experienceSystems();
  const experienceRules = deps.state.EXPERIENCE_RULES;
  // 同 seed 连续 432（3 日，默认新 profile）。
  const fWhole = deps.fixture.createExperienceVillage(42, 'experience-village');
  const whole = createSimulationSession(fWhole.bundle, fWhole.systems);
  whole.advanceTicks(432);
  const wholeBundle = whole.getBundle();
  assert.equal(wholeBundle.snapshot.rulesVersion, experienceRules);
  // 程序化 saveCheckpoint/loadCheckpoint 在 tick200 → 200+232。
  const f200 = deps.fixture.createExperienceVillage(42, 'experience-village');
  const s200 = createSimulationSession(f200.bundle, f200.systems);
  s200.advanceTicks(200);
  const dir = await temp(t);
  const file200 = await saveCheckpoint(s200.getBundle(), { directory: dir, rulesVersion: experienceRules, systems });
  const loaded = await loadCheckpoint(file200, { rulesVersion: experienceRules, systems });
  const s232 = createSimulationSession(loaded, systems);
  s232.advanceTicks(232);
  assert.deepEqual(s232.getBundle(), wholeBundle);
  // CLI 2日(288)+resume 1日 == 连续 3 日；默认 576 == CLI 2+2。
  const cli288 = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '2', '--seed', '42', '--out', path.join(dir, 'cli-288')]));
  const cli432 = await runSimulation(parseArguments(['--resume', cli288.checkpointPath, '--days', '1', '--out', path.join(dir, 'cli-432')]));
  const straight432 = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '3', '--seed', '42', '--out', path.join(dir, 'straight-432')]));
  const cli288b = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '2', '--seed', '42', '--out', path.join(dir, 'cli-288b')]));
  const cli576 = await runSimulation(parseArguments(['--resume', cli288b.checkpointPath, '--days', '2', '--out', path.join(dir, 'cli-576')]));
  const straight576 = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '4', '--seed', '42', '--out', path.join(dir, 'straight-576')]));
  for (const run of [cli288, cli432, straight432, cli288b, cli576, straight576]) assert.equal(run.status, 'succeeded');
  assert.deepEqual(summaryBusiness(cli432), summaryBusiness(straight432));
  assert.deepEqual(summaryBusiness(cli576), summaryBusiness(straight576));
  // summary 新增 experienceConfigHash 与 workExperienceHash，且与对应业务文件内容哈希一致。
  const outDir = path.join(dir, 'straight-576');
  const summary = JSON.parse(await fs.readFile(path.join(outDir, 'summary.json'), 'utf8'));
  assert.match(summary.experienceConfigHash, /^[a-f0-9]{64}$/);
  assert.match(summary.workExperienceHash, /^[a-f0-9]{64}$/);
  const experienceConfigText = await fs.readFile(path.join(outDir, 'experience-config.json'), 'utf8');
  const workExperienceText = await fs.readFile(path.join(outDir, 'work-experience.json'), 'utf8');
  assert.equal(summary.experienceConfigHash, hash(JSON.parse(experienceConfigText)));
  assert.equal(summary.workExperienceHash, hash(JSON.parse(workExperienceText)));
  assert.deepEqual(JSON.parse(experienceConfigText), { version: 'experience-config-v1', useWorkExperience: true });
  // work-experience.json 是完整脱离引用的 experienceModel：与 full restore 重建的模型 JSON 语义相等（JSON.parse 往返相等）。
  const restored = await loadCheckpoint(straight576.checkpointPath, { rulesVersion: experienceRules, systems });
  assert.deepEqual(JSON.parse(workExperienceText), restored.snapshot.world.experienceModel);
  // CLI 对比的业务文件列表包含两件新产物，且 2+2 与连续 4 日的业务产物逐文件一致。
  const files = (await fs.readdir(path.join(dir, 'cli-576'))).sort();
  assert.ok(files.includes('experience-config.json') && files.includes('work-experience.json'));
  const straightFiles = (await fs.readdir(outDir)).sort();
  assert.deepEqual(files, straightFiles);
  for (const file of files) {
    if (file === 'summary.json') continue;
    const x = await fs.readFile(path.join(dir, 'cli-576', file), 'utf8'), y = await fs.readFile(path.join(outDir, file), 'utf8');
    if (file.endsWith('.json')) assert.deepEqual(JSON.parse(x), JSON.parse(y), file);
    else assert.equal(x, y, file);
  }
});

test('E6 全恢复历史篡改矩阵：sample/开关/fingerprint/decision/Observed/receipt/step/cursor/ID/RNG 均被 full replay 拒绝', async t => {
  if (!gate(t)) return;
  const systems = deps.fixture.experienceSystems();
  const experienceRules = deps.state.EXPERIENCE_RULES;
  // 基准：默认新 profile 288（本人 Work 已成功、恰一个 Observed、一个 kernel 样本）。
  const f = deps.fixture.createExperienceVillage(42, 'experience-village');
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(288);
  const dir = await temp(t);
  const baseFile = await saveCheckpoint(s.getBundle(), { directory: dir, rulesVersion: experienceRules, systems });
  const baseText = await fs.readFile(baseFile, 'utf8');
  const base = JSON.parse(baseText);
  const observedIndex = base.eventLog.findIndex(e => e.type === 'ExperienceWorkObserved');
  const workReceiptId = Object.keys(base.snapshot.commandReceipts)
    .find(id => base.snapshot.commandReceipts[id].input.type === 'SocietyAction' && base.snapshot.commandReceipts[id].input.payload.action === 'WorkForPay');
  const plannedIndex = base.eventLog.findIndex(e => e.type === 'MotivationDecisionPlanned' && e.payload.actorId === 'actor-2');
  assert.ok(observedIndex >= 0 && plannedIndex >= 0 && workReceiptId, '基准 checkpoint 必须含 Observed/Planned/Work receipt');
  // 说明：checkpoint 容器不携带内容摘要，校验是结构化 full replay，篡改者即使重算任何业务 hash 也无法绕过——
  // 下列每个反例都以“内容被改、无任何记录在案哈希可修复”的形态被 replay/校验器拒绝。
  const cases = [
    // 版本与预算错误按 checkpoint-store 现行为原码直抛。
    ['format-version', m => { m.formatVersion = 2; }, 'UNSUPPORTED_VERSION'],
    // world-state.checkBudgets 先按 discriminator 验 world：已知旧 rule + 新 world 是结构混搭，包装 INVALID_INPUT。
    ['rules-version-mixed-world', m => { m.snapshot.rulesVersion = 'm-motivation-v1'; }, 'INVALID_CHECKPOINT', 'INVALID_INPUT'],
    ['rules-version-unknown', m => { m.snapshot.rulesVersion = 'm-experience-v0'; }, 'UNSUPPORTED_VERSION'],
    // kernel 样本：身份/seq/tick/status/penalty/refs（penalty/refs 落在 Observed 派生 view 上）。
    ['sample-actor', m => { m.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].actorId = 'actor-3'; }],
    ['sample-seq', m => { m.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].sourceEventSeq -= 1; }],
    ['sample-tick', m => { m.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].occurrenceTick -= 1; }],
    ['sample-status', m => { m.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].status = 'rejected'; }],
    ['sample-code', m => { m.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].code = 'RULE_REJECTED'; }],
    ['sample-decision-id', m => { m.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].decisionId = 'experience-day-2-actor-3'; }],
    ['sample-command-id', m => { m.snapshot.world.experienceModel.actors[0].workExperienceState.samples[0].commandId = 'forged-command'; }],
    ['observed-penalty', m => { m.eventLog[observedIndex].payload.experienceView.penaltyPermille = 101; }],
    ['observed-refs', m => { m.eventLog[observedIndex].payload.experienceView.evidenceRefs = []; }],
    // Observed 缺失 / 重复 / wrong cause。
    ['observed-missing', m => { m.eventLog.splice(observedIndex, 1); }],
    ['observed-duplicate', m => { m.eventLog.splice(observedIndex, 0, JSON.parse(JSON.stringify(m.eventLog[observedIndex]))); }],
    ['observed-wrong-cause', m => { m.eventLog[observedIndex].causationEventSeqs = [m.eventLog[observedIndex].payload.sourceEventSeq + 1]; }],
    // 开关 / fingerprint。
    ['use-flag', m => { m.snapshot.world.experienceModel.config.useWorkExperience = false; }],
    ['model-fingerprint', m => { m.snapshot.world.experienceModel.configFingerprint += ' '; }],
    // decision knowledge / score / opposition / gate。
    ['decision-knowledge', m => { m.eventLog[plannedIndex].payload.knowledgeFingerprint += ' '; }],
    ['decision-score', m => { m.eventLog[plannedIndex].payload.candidates[2].score += 1; }],
    ['decision-opposition', m => { m.eventLog[plannedIndex].payload.candidates[2].opposition += 1; }],
    ['decision-gate', m => { m.eventLog[plannedIndex].payload.gateReason = 'CONTINUE_COMMITTED'; }],
    // receipt result / status。
    ['receipt-result', m => { m.snapshot.commandReceipts[workReceiptId].result.foodProduced = 999; }],
    ['receipt-status', m => { m.snapshot.commandReceipts[workReceiptId].status = 'rejected'; }],
    // step / cursor / ID / RNG / seq。
    ['plan-step', m => { m.snapshot.world.motivationModel.actors[0].suspendedPlan.stepIndex = 0; }],
    ['mind-cursor', m => { m.snapshot.world.mindModel.cursor -= 1; }],
    ['motivation-cursor', m => { m.snapshot.world.motivationModel.cursor += 1; }],
    ['experience-cursor', m => { m.snapshot.world.experienceModel.cursor = 0; }],
    ['decision-id', m => { m.snapshot.world.motivationModel.actors[0].lastDecision.decisionId = 'experience-day-2-actor-3'; }],
    ['rng-seed', m => { m.snapshot.rng.seed = 43; }],
    ['next-event-seq', m => { m.snapshot.nextEventSeq -= 1; }],
  ];
  for (const [label, mutate, expectedCode, expectedCause] of cases) {
    const mutated = JSON.parse(baseText);
    mutate(mutated);
    assert.notEqual(canonicalJson(mutated), canonicalJson(base), label + ' 必须是实际篡改，禁止同值反例');
    const file = path.join(dir, 'tampered-' + label + '.json');
    await fs.writeFile(file, JSON.stringify(mutated), 'utf8');
    await assert.rejects(() => loadCheckpoint(file, { rulesVersion: experienceRules, systems }), error => {
      if (expectedCode) {
        assert.equal(error.code, expectedCode, label);
        if (expectedCause) assert.equal(error.cause?.code, expectedCause, label + ' cause');
      }
      else {
        assert.equal(error.code, 'INVALID_CHECKPOINT', label);
        assert.ok(Object.hasOwn(error, 'cause'), label + ' 必须保留 cause');
      }
      return true;
    }, label);
  }
  // 篡改 exported work-experience.json 不影响 checkpoint replay：full restore 从配置/事件重算，不信任该导出文件。
  const outputDir = path.join(dir, 'cli-out');
  const run = await runSimulation(parseArguments(['--fixture', 'experience-village', '--days', '2', '--seed', '42', '--out', outputDir]));
  assert.equal(run.status, 'succeeded');
  const workPath = path.join(outputDir, 'work-experience.json');
  const originalWork = await fs.readFile(workPath, 'utf8');
  const forged = JSON.parse(originalWork);
  if (forged.actors && forged.actors[0] && forged.actors[0].workExperienceState) forged.actors[0].workExperienceState.samples = [];
  await fs.writeFile(workPath, JSON.stringify(forged), 'utf8');
  const restored = await loadCheckpoint(run.checkpointPath, { rulesVersion: experienceRules, systems });
  assert.notDeepEqual(JSON.parse(await fs.readFile(workPath, 'utf8')), restored.snapshot.world.experienceModel,
    '被篡改的导出文件不得影响 full restore 重建的模型');
});

test('E7 新旧 profile 隔离：互拒 checkpoint 与旧 inspector 防假读数（HTTP 本轮不测）', async t => {
  if (!gate(t)) return;
  const systems = deps.fixture.experienceSystems();
  const experienceRules = deps.state.EXPERIENCE_RULES;
  // 新规则 checkpoint（默认新 profile 288）。
  const f = deps.fixture.createExperienceVillage(42, 'experience-village');
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(288);
  const dir = await temp(t);
  const newFile = await saveCheckpoint(s.getBundle(), { directory: path.join(dir, 'new-profile'), rulesVersion: experienceRules, systems });
  // 旧 rules 版本收到新规则 checkpoint → UNSUPPORTED_VERSION 原码直抛。
  await assert.rejects(() => loadCheckpoint(newFile, { rulesVersion: MOTIVATION_RULES, systems: motivationSystems() }),
    e => e.code === 'UNSUPPORTED_VERSION');
  // 新规则收到旧 checkpoint → UNSUPPORTED_VERSION。
  const old = createMotivationVillage(42, 'motivation-village');
  const oldSession = createSimulationSession(old.bundle, old.systems);
  oldSession.advanceTicks(288);
  const oldFile = await saveCheckpoint(oldSession.getBundle(), { directory: path.join(dir, 'old-profile'), rulesVersion: MOTIVATION_RULES, systems: motivationSystems() });
  await assert.rejects(() => loadCheckpoint(oldFile, { rulesVersion: experienceRules, systems }), e => e.code === 'UNSUPPORTED_VERSION');
  // 旧 inspector 不得对新规则返回假读数：audit 在规则分派处直接拒绝。
  assert.throws(() => projectMotivationInspector({ snapshot: { rulesVersion: experienceRules }, eventLog: [] }),
    e => e.code === 'UNSUPPORTED_VERSION');
  // HTTP 归档字段本轮不复跑（M3-2B E7）；旧 profile checkpoint 经 validateBundle 完整审计不受影响。
  const restored = await loadCheckpoint(oldFile, { rulesVersion: MOTIVATION_RULES, systems: motivationSystems() });
  validateBundle(restored, { rulesVersion: MOTIVATION_RULES, systems: motivationSystems() });
});
