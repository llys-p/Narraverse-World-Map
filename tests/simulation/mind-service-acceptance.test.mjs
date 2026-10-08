import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSimulationSession } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
import { createRuntimeOwner } from '../../runtime/service/runtime-owner.mjs';

// =============================================================================
// M1A/M1B 未交付时的显式依赖标记。A 交付核心模块、B 交付 owner/inspector 服务后，
// m1Skip 自动变 false，下方全部断言即可真实运行（断言正文一律保留，绝不为通过而删）。
// =============================================================================
const M1 = await (async () => {
  try {
    const [fixture, state, planner, runtime, knowledge] = await Promise.all([
      import('../../runtime/fixtures/mind-village.mjs'),
      import('../../runtime/core/mind-state.mjs'),
      import('../../runtime/core/mind-planner.mjs'),
      import('../../runtime/core/mind-runtime.mjs'),
      import('../../runtime/knowledge/mind-knowledge.mjs'),
    ]);
    return { fixture, state, planner, runtime, knowledge };
  } catch (error) {
    return { error };
  }
})();
const m1Skip = M1.error
  ? `依赖未交付（基准 feb2856，M1A/M1B 未交付）：${M1.error.code ?? 'IMPORT_FAILED'} ${(M1.error.message ?? '').split('\n')[0]}`
  : false;

const agent = (w, id) => w.societyModel.agents.find((a) => a.state.actorId === id).state;
const actorOf = (w, id) => w.actorModel.actors.find((a) => a.actorId === id);
const mindActor = (w, id) => w.mindModel.actors.find((a) => a.actorId === id);
const mk = (patch) => {
  const config = patch ? patch(M1.fixture.defaultMindVillageConfig()) : M1.fixture.defaultMindVillageConfig();
  return M1.fixture.createMindVillage(42, 'mind-village', config);
};
async function temporary(t) {
  const prefix = path.join(os.tmpdir(), 'world-mind-service-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix)); await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}
async function jsonBytes(dir) {
  return Promise.all((await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort().map(async (f) => [f, await fs.readFile(path.join(dir, f), 'utf8')]));
}
const time = (commandId, expectedRevision, ticks) => ({ version: 1, commandId, expectedRevision, type: 'AdvanceTime', payload: { ticks } });

test('K6 硬上限常量与合同 §8.3 一致（独立期望，非从 A/B 倒抄）', () => {
  if (m1Skip) assert.ok(true, `当前依赖未交付：${m1Skip.slice(0, 200)}`);
  else {
    const s = M1.state;
    assert.equal(s.MAX_MIND_ACTORS, 2);
    assert.equal(s.MAX_MIND_STIMULI, 64);
    assert.equal(s.MAX_MIND_STIMULI_PER_TICK, 8);
    assert.equal(s.MAX_MIND_OBSERVATIONS, 8);
    assert.equal(s.MIND_EVIDENCE_TTL_TICKS, 288);
    assert.equal(s.MAX_MIND_CANDIDATES, 3);
    assert.equal(s.MAX_MIND_KNOWLEDGE_BYTES, 8192);
    assert.equal(s.MAX_MIND_INSPECTOR_BYTES, 65536);
  }
});

test('K6 预算反例：65条刺激 / 同tick9条 / 未知版本 / 非法actor 显式拒绝', { skip: m1Skip }, () => {
  // 65 条刺激（>64）→ LIMIT_EXCEEDED
  const over = M1.fixture.defaultMindVillageConfig();
  over.mind.stimuli = Array.from({ length: 65 }, (_, i) => ({ stimulusId: `s${i}`, tick: 12 + i, kind: 'market-check', listenerId: 'actor-2' }));
  assert.throws(() => M1.fixture.createMindVillage(42, 'mind-village', over), (e) => e.code === 'LIMIT_EXCEEDED');
  // 同 tick 9 条（>8）→ LIMIT_EXCEEDED
  const sameTick = M1.fixture.defaultMindVillageConfig();
  sameTick.mind.stimuli = Array.from({ length: 9 }, (_, i) => ({ stimulusId: `t${i}`, tick: 12, kind: 'market-check', listenerId: 'actor-2' }));
  assert.throws(() => M1.fixture.createMindVillage(42, 'mind-village', sameTick), (e) => e.code === 'LIMIT_EXCEEDED');
  // 未知 mind config 版本 → UNSUPPORTED_VERSION
  const badVersion = M1.fixture.defaultMindVillageConfig();
  badVersion.mind.version = 'mind-config-vX';
  assert.throws(() => M1.fixture.createMindVillage(42, 'mind-village', badVersion), (e) => e.code === 'UNSUPPORTED_VERSION');
  // 非法/非 Mind actor → MIND_ACTOR_UNAVAILABLE（不能退回全知 DTO）
  const bundle = mk().bundle;
  assert.throws(() => M1.knowledge.buildMindKnowledge(bundle, 'actor-9'), (e) => e.code === 'MIND_ACTOR_UNAVAILABLE');
  assert.throws(() => M1.knowledge.buildMindKnowledge(bundle, 'actor-1'), (e) => e.code === 'MIND_ACTOR_UNAVAILABLE');
});

test('K6 死亡分支：144 按规则死亡后，tick156 s03 未送达、不观察不决策，保留墓碑/私账/封存判断', { skip: m1Skip }, () => {
  const f = mk((c) => {
    c.memory.society.actors.initialActors[1].health = 1;
    c.memory.society.actors.initialActors[2].health = 1;
    c.memory.society.actors.initialActors[1].hunger = 1000;
    c.memory.society.actors.initialActors[2].hunger = 1000;
    for (const e of c.memory.society.estates) { e.initialFood = 0; e.initialHerbs = 0; }
    const res = c.memory.society.actors.market.ecology.resources.resources;
    for (const id of ['food', 'herbs']) { res[id].initial = 0; res[id].production.numerator = 0; }
    c.memory.society.actors.market.products.food.maxOrder = 0;
    c.memory.society.actors.market.products.herbs.maxOrder = 0;
    c.mind.stimuli.push({ stimulusId: 's03', tick: 156, kind: 'market-check', listenerId: 'actor-2' });
    return c;
  });
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(156);
  const bundle = s.getBundle(), w = bundle.snapshot.world;
  assert.equal(actorOf(w, 'actor-2').alive, false);
  assert.equal(actorOf(w, 'actor-3').alive, false);
  const s03 = bundle.eventLog.find((e) => e.type === 'MindStimulusResolved' && e.payload.stimulusId === 's03');
  assert.equal(s03.payload.status, 'unavailable', '死者未送达');
  assert.equal(s03.payload.available, null);
  const ma2 = mindActor(w, 'actor-2');
  assert.equal(ma2.observations.some((o) => o.observedTick === 156), false, '死者不接死亡后新观察');
  assert.equal(bundle.eventLog.some((e) => e.type === 'MindDecisionPlanned' && e.payload.actorId === 'actor-2' && e.tick === 156), false);
  // 墓碑/私账/封存判断保留，不抹去资产与记录
  assert.ok(Number.isInteger(agent(w, 'actor-2').wallet));
  assert.ok(ma2.lastDecision !== null, '封存判断记录保留');
});

test('service4 同 ID 跨重启幂等：相同 DTO 重试只返回原回执，不重复推进时间', { skip: m1Skip }, async (t) => {
  const dir = await temporary(t);
  const owner = await createRuntimeOwner({ directory: dir, profile: 'mind-village', writable: true });
  t.after(() => owner.close());
  const dto = time('adv24', 0, 24);
  const first = await owner.submit(dto);
  assert.equal(first.status, 'committed');
  assert.deepEqual(await owner.submit(dto), first, '同进程同 ID 同 payload 幂等');
  await owner.close();
  const restored = await createRuntimeOwner({ directory: dir, writable: true });
  t.after(() => restored.close());
  assert.deepEqual(await restored.submit(dto), first, '跨重启同 ID 重试只返回原回执');
  assert.equal(restored.getMindInspector().revision, 24, 'revision 未因重试重复推进');
});

test('service4 冲突：过期 expectedRevision 409、同 ID 异 payload 冲突', { skip: m1Skip }, async (t) => {
  const dir = await temporary(t);
  const owner = await createRuntimeOwner({ directory: dir, profile: 'mind-village', writable: true });
  t.after(() => owner.close());
  await owner.submit(time('adv24', 0, 24));
  await assert.rejects(owner.submit(time('stale', 0, 24)), (e) => e.code === 'REVISION_CONFLICT', '旧页(过期 revision)必须 409');
  await assert.rejects(owner.submit(time('adv24', 24, 120)), (e) => e.code === 'COMMAND_ID_CONFLICT', '同 ID 异 payload 冲突');
});

test('service4 保存故障：提交失败后 公共/玩家/检查器 三份投影与磁盘保持旧读数，恢复后发布一致', { skip: m1Skip }, async (t) => {
  const directory = path.join(await temporary(t), 'world');
  let fail = true;
  const io = {
    ...fs,
    async link(from, to) {
      if (fail && to.endsWith('service-commit-r24.json')) throw Object.assign(new Error('controlled write failure'), { code: 'EIO' });
      return fs.link(from, to);
    },
  };
  const owner = await createRuntimeOwner({ directory, profile: 'mind-village', writable: true }, io);
  t.after(() => owner.close());
  const snapBefore = owner.getSnapshot();
  const inspBefore = owner.getMindInspector();
  const diskBefore = await jsonBytes(directory);
  await assert.rejects(owner.submit(time('adv24', 0, 24)), (e) => e.code === 'SAVE_FAILED');
  assert.deepEqual(owner.getSnapshot(), snapBefore, '公共投影不变');
  assert.deepEqual(owner.getMindInspector(), inspBefore, '检查器投影不变');
  assert.deepEqual(await jsonBytes(directory), diskBefore, '磁盘不变');
  fail = false;
  const receipt = await owner.submit(time('adv24', 0, 24));
  assert.equal(receipt.status, 'committed');
  assert.equal(owner.getSnapshot().revision, 24);
  assert.equal(owner.getMindInspector().revision, 24);
});

test('K6 恢复最小真实消费者：core 保存 checkpoint → owner 显式加载 → 检查器与磁盘/投影一致且读取零写', { skip: m1Skip }, async (t) => {
  const root = await temporary(t);
  const f = mk();
  const s = createSimulationSession(f.bundle, f.systems);
  s.advanceTicks(24);
  const options = { rulesVersion: M1.state.MIND_RULES, systems: M1.fixture.mindSystems() };
  const file = await saveCheckpoint(s.getBundle(), { directory: path.join(root, 'anchor'), ...options });
  const directory = path.join(root, 'world');
  const owner = await createRuntimeOwner({ directory, checkpoint: file, writable: true });
  t.after(() => owner.close());
  const insp = owner.getMindInspector();
  assert.equal(insp.revision, 24);
  assert.equal(insp.actors.length, 2);
  assert.deepEqual(insp, M1.knowledge.projectMindInspector(s.getBundle()));
  const before = await jsonBytes(directory);
  assert.deepEqual(owner.getMindInspector(), insp);
  assert.deepEqual(await jsonBytes(directory), before, '读取不推进 tick / 不写文件');
  // 检查器恢复不是纯 mock serializer：临时/坏 checkpoint 文件仍被真实 loader 拒绝
  await assert.rejects(loadCheckpoint(file + '.tmp', options), (e) => e.code === 'INVALID_CHECKPOINT');
});