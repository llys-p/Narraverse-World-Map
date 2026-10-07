import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TICK_MINUTES,
  TICKS_PER_DAY,
  MAX_ADVANCE_TICKS,
  createClock,
  restoreClock,
  deriveClockReading,
} from '../../runtime/core/simulation-clock.mjs';
import {
  createScheduler,
  restoreScheduler,
  advanceScheduler,
} from '../../runtime/core/scheduler.mjs';

const SYSTEMS = new Set(['eco', 'market', 'resource']);
const task = (taskId, systemId, nextDueTick, intervalTicks, priority) => ({
  taskId,
  systemId,
  nextDueTick,
  intervalTicks,
  priority,
});
const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};

// ———————————————— SimulationClock ————————————————

test('T1: 常量合同与初始状态（tick 0 起步，tickMinutes 固定 10，一天 144 tick）', () => {
  assert.equal(TICK_MINUTES, 10);
  assert.equal(TICKS_PER_DAY, 144);
  assert.equal(MAX_ADVANCE_TICKS, 144000);
  const clock = createClock();
  assert.equal(clock.tick, 0);
  assert.equal(clock.tickMinutes, 10);
  assert.deepEqual(clock.describe(), {
    tick: 0,
    day: 0,
    tickOfDay: 0,
    minuteOfDay: 0,
    hour: 0,
    minute: 0,
    shichenIndex: 0,
    shichenName: '子',
  });
});

test('T1: 0 / 1 / 143→144 / 跨多天推进正确，日期与时辰全部由 tick 派生', () => {
  const clock = createClock();
  clock.advanceTicks(0);
  assert.equal(clock.tick, 0, '0 tick 推进无变化');
  clock.advanceTicks(1);
  assert.equal(clock.tick, 1);
  clock.advanceTicks(142);
  assert.equal(clock.tick, 143);
  assert.deepEqual(clock.describe(), {
    tick: 143,
    day: 0,
    tickOfDay: 143,
    minuteOfDay: 1430,
    hour: 23,
    minute: 50,
    shichenIndex: 0,
    shichenName: '子',
  });
  clock.advanceTicks(1);
  assert.equal(clock.tick, 144, '143→144 跨天');
  assert.deepEqual(clock.describe(), {
    tick: 144,
    day: 1,
    tickOfDay: 0,
    minuteOfDay: 0,
    hour: 0,
    minute: 0,
    shichenIndex: 0,
    shichenName: '子',
  });
  clock.advanceTicks(288);
  assert.equal(clock.tick, 432, '再跨两天');
  assert.equal(clock.describe().day, 3);
  assert.equal(clock.describe().hour, 0);

  // 时辰边界：01:00 丑、05:00 卯；传统约定子时 23:00–00:59 跨午夜
  assert.deepEqual(deriveClockReading(30), {
    tick: 30,
    day: 0,
    tickOfDay: 30,
    minuteOfDay: 300,
    hour: 5,
    minute: 0,
    shichenIndex: 3,
    shichenName: '卯',
  });
  assert.deepEqual(deriveClockReading(150), {
    tick: 150,
    day: 1,
    tickOfDay: 6,
    minuteOfDay: 60,
    hour: 1,
    minute: 0,
    shichenIndex: 1,
    shichenName: '丑',
  });
});

test('T1: 状态读取与恢复；恢复后从原位置继续推进', () => {
  const clock = createClock();
  clock.advanceTicks(300);
  assert.deepEqual(clock.getState(), { tick: 300, tickMinutes: 10 });
  const resumed = restoreClock(clock.getState());
  assert.equal(resumed.tick, 300);
  resumed.advanceTicks(144);
  assert.equal(resumed.tick, 444);
  assert.equal(resumed.describe().day, 3);
  assert.equal(resumed.describe().hour, 2, '444 = 第3天 02:00');
});

test('T2: 非法 n（负数/小数/字符串/非有限值/非数值）拒绝且原时钟不变', () => {
  const clock = createClock();
  clock.advanceTicks(5);
  for (const n of [-1, 0.5, '3', NaN, Infinity, -Infinity, null, undefined, {}]) {
    assert.throws(() => clock.advanceTicks(n), (err) => err.code === 'INVALID_INPUT', `n=${String(n)} 应被拒绝`);
    assert.equal(clock.tick, 5, `n=${String(n)} 失败后时钟不变`);
  }
});

test('T2: 单次推进上限 144000、累计安全整数溢出均拒绝且状态不变；上限边界值允许', () => {
  const clock = createClock();
  assert.throws(() => clock.advanceTicks(MAX_ADVANCE_TICKS + 1), (err) => err.code === 'LIMIT_EXCEEDED');
  assert.equal(clock.tick, 0, '超限后时钟不变');
  clock.advanceTicks(MAX_ADVANCE_TICKS);
  assert.equal(clock.tick, 144000, '恰好上限允许');

  const nearMax = restoreClock({ tick: Number.MAX_SAFE_INTEGER - 3, tickMinutes: 10 });
  assert.throws(() => nearMax.advanceTicks(4), (err) => err.code === 'LIMIT_EXCEEDED', '累计溢出应拒绝');
  assert.equal(nearMax.tick, Number.MAX_SAFE_INTEGER - 3);
  nearMax.advanceTicks(3);
  assert.equal(nearMax.tick, Number.MAX_SAFE_INTEGER);
  assert.throws(() => nearMax.advanceTicks(1), (err) => err.code === 'LIMIT_EXCEEDED', '到达上限后再推进溢出');
  assert.equal(nearMax.tick, Number.MAX_SAFE_INTEGER);
});

test('T2: 非法恢复状态与非法创建选项拒绝', () => {
  const badStates = [
    null,
    undefined,
    42,
    'x',
    [],
    {},
    { tick: 5 }, // 缺 tickMinutes
    { tickMinutes: 10 }, // 缺 tick
    { tick: 5, tickMinutes: 10, extra: 1 }, // 多余字段
    { tick: -1, tickMinutes: 10 },
    { tick: 1.5, tickMinutes: 10 },
    { tick: '5', tickMinutes: 10 },
    { tick: NaN, tickMinutes: 10 },
    { tick: Infinity, tickMinutes: 10 },
    { tick: 5, tickMinutes: 15 },
    { tick: 5, tickMinutes: '10' },
  ];
  for (const s of badStates) {
    assert.throws(() => restoreClock(s), (err) => err.code === 'INVALID_INPUT', `${JSON.stringify(s)} 应被拒绝`);
  }

  assert.throws(() => createClock({ tick: -1 }), (err) => err.code === 'INVALID_INPUT');
  assert.throws(() => createClock({ tick: 1.5 }), (err) => err.code === 'INVALID_INPUT');
  assert.throws(() => createClock({ unknown: 1 }), (err) => err.code === 'INVALID_INPUT');
  assert.throws(() => createClock('x'), (err) => err.code === 'INVALID_INPUT');
});

// ———————————————— Scheduler ————————————————

test('S1: 同 tick 多系统多任务按 dueTick→priority→systemId→taskId 排序；反转注册顺序结果相同', () => {
  const expectedOrder = ['early', 'a1', 'a2', 'z1', 'p1'];
  const tasks = [
    task('p1', 'eco', 5, 10, 20),
    task('z1', 'market', 5, 10, 10),
    task('a2', 'eco', 5, 10, 10),
    task('early', 'market', 3, 10, 50),
    task('a1', 'eco', 5, 10, 10),
  ];
  const forward = advanceScheduler(createScheduler({ tick: 0, tasks }, SYSTEMS), 10, SYSTEMS);
  assert.deepEqual(forward.dueTasks.map((e) => e.taskId), expectedOrder);

  const reversed = advanceScheduler(createScheduler({ tick: 0, tasks: [...tasks].reverse() }, SYSTEMS), 10, SYSTEMS);
  assert.deepEqual(reversed.dueTasks.map((e) => e.taskId), expectedOrder, '不依赖注册先后');

  // 输入对象不被修改
  const frozenTasks = deepFreeze(tasks.map((t) => ({ ...t })));
  const frozenSched = deepFreeze(createScheduler({ tick: 0, tasks: frozenTasks }, SYSTEMS));
  const fromFrozen = advanceScheduler(frozenSched, 10, SYSTEMS);
  assert.deepEqual(fromFrozen.dueTasks.map((e) => e.taskId), expectedOrder);
  assert.deepEqual(frozenSched.currentTick, 0, '输入 scheduler 保持不变');
});

test('S1: 字符串键使用与 locale 无关的 UTF-16 码元序', () => {
  const systems = new Set(['Zoo', 'apple']);
  const sched = createScheduler(
    { tick: 0, tasks: [task('t2', 'apple', 5, 10, 10), task('t1', 'Zoo', 5, 10, 10)] },
    systems,
  );
  const { dueTasks } = advanceScheduler(sched, 10, systems);
  assert.deepEqual(dueTasks.map((e) => e.systemId), ['Zoo', 'apple'], '码元序 Z(0x5A) < a(0x61)');
});

test('S2: 3/6/144 周期混合——一次推进 288 与分块 100+188 的到期序列与最终状态一致', () => {
  const tasks = [
    task('every3', 'resource', 3, 3, 10),
    task('every6', 'resource', 6, 6, 20),
    task('daily', 'eco', 144, 144, 30),
  ];
  const oneShot = advanceScheduler(createScheduler({ tick: 0, tasks }, SYSTEMS), 288, SYSTEMS);

  const stepA = advanceScheduler(createScheduler({ tick: 0, tasks }, SYSTEMS), 100, SYSTEMS);
  const stepB = advanceScheduler(stepA.scheduler, 288, SYSTEMS);

  assert.deepEqual([...stepA.dueTasks, ...stepB.dueTasks], oneShot.dueTasks, '分块到期序列逐项一致');
  assert.deepEqual(stepB.scheduler, oneShot.scheduler, '分块后最终状态一致');

  assert.equal(oneShot.dueTasks.length, 96 + 48 + 2, 'every3×96 + every6×48 + daily×2');
  assert.deepEqual(
    oneShot.scheduler.tasks.map((t) => [t.taskId, t.nextDueTick]),
    [
      ['daily', 432],
      ['every3', 291],
      ['every6', 294],
    ],
    '下次到期 = 原到期点 + k×周期，而非终点 + 周期',
  );
});

test('S2: 空调度器推进为无操作；空注册集合合法', () => {
  const empty = createScheduler({ tick: 5 }, new Set());
  const { dueTasks, scheduler } = advanceScheduler(empty, 5, new Set());
  assert.deepEqual(dueTasks, []);
  assert.deepEqual(scheduler, { currentTick: 5, tasks: [] });
});

test('S3: 到期边界只执行一次；起点不含、终点含；下次 = 原到期点 + 周期', () => {
  const sched = createScheduler({ tick: 0, tasks: [task('t', 'eco', 6, 6, 10)] }, SYSTEMS);

  const toSix = advanceScheduler(sched, 6, SYSTEMS);
  assert.deepEqual(toSix.dueTasks, [{ taskId: 't', systemId: 'eco', dueTick: 6, priority: 10 }]);
  assert.equal(toSix.scheduler.tasks[0].nextDueTick, 12, '12 = 6+6，而非 6+0 或 6+12');

  const again = advanceScheduler(toSix.scheduler, 6, SYSTEMS);
  assert.deepEqual(again.dueTasks, [], '同一到期点重复推进不执行');
  const before = advanceScheduler(again.scheduler, 11, SYSTEMS);
  assert.deepEqual(before.dueTasks, [], '未到期不运行');
  const at = advanceScheduler(before.scheduler, 12, SYSTEMS);
  assert.deepEqual(at.dueTasks, [{ taskId: 't', systemId: 'eco', dueTick: 12, priority: 10 }], '到期点恰为终点时执行且仅一次');
  assert.equal(at.scheduler.tasks[0].nextDueTick, 18);

  const direct = advanceScheduler(sched, 12, SYSTEMS);
  assert.deepEqual(direct.dueTasks.map((e) => e.dueTick), [6, 12], '批量推进逐个处理经过的到期点，不漏不重');
});

test('S3: 恢复后继续调度，不漏执行、不重新从周期起点开始', () => {
  const make = () =>
    createScheduler({ tick: 0, tasks: [task('t', 'eco', 6, 6, 10), task('u', 'market', 5, 10, 20)] }, SYSTEMS);

  const whole = advanceScheduler(make(), 30, SYSTEMS);
  const mid = advanceScheduler(make(), 7, SYSTEMS);
  const resumed = restoreScheduler(mid.scheduler, SYSTEMS);
  assert.equal(resumed.tasks.find((t) => t.taskId === 't').nextDueTick, 12, '恢复保持原 nextDueTick，不重排');

  const tail = advanceScheduler(resumed, 30, SYSTEMS);
  assert.deepEqual(tail.dueTasks, whole.dueTasks.filter((e) => e.dueTick > 7), '恢复后尾部序列与不中断实例一致');
  assert.deepEqual(tail.scheduler, whole.scheduler, '恢复后最终状态一致');
});

test('S4: 未注册系统/重复 ID/无效周期/优先级/到期点/字段集合/空 ID 拒绝，输入描述符保持不变', () => {
  const badSystem = deepFreeze(task('t', 'no-such-system', 6, 6, 10));
  assert.throws(() => createScheduler({ tick: 0, tasks: [badSystem] }, SYSTEMS), (err) => err.code === 'INVALID_INPUT');
  assert.deepEqual(badSystem, task('t', 'no-such-system', 6, 6, 10), '输入描述符保持不变');

  assert.throws(
    () => createScheduler({ tick: 0, tasks: [task('dup', 'eco', 6, 6, 10), task('dup', 'market', 6, 6, 10)] }, SYSTEMS),
    (err) => err.code === 'INVALID_INPUT',
    'taskId 必须唯一',
  );

  for (const interval of [0, -1, 1.5, '6', Infinity, NaN]) {
    assert.throws(
      () => createScheduler({ tick: 0, tasks: [task('t', 'eco', 6, interval, 10)] }, SYSTEMS),
      (err) => err.code === 'INVALID_INPUT',
      `interval=${String(interval)} 应被拒绝`,
    );
  }
  for (const priority of [1.5, '10', NaN, Infinity]) {
    assert.throws(
      () => createScheduler({ tick: 0, tasks: [task('t', 'eco', 6, 6, priority)] }, SYSTEMS),
      (err) => err.code === 'INVALID_INPUT',
      `priority=${String(priority)} 应被拒绝`,
    );
  }
  for (const nextDueTick of [0, -5, 1.5, NaN]) {
    assert.throws(
      () => createScheduler({ tick: 0, tasks: [task('t', 'eco', nextDueTick, 6, 10)] }, SYSTEMS),
      (err) => err.code === 'INVALID_INPUT',
      `nextDueTick=${String(nextDueTick)} 应被拒绝（初始 tick 0 已完成，到期点必须在未来）`,
    );
  }
  assert.throws(
    () => createScheduler({ tick: 0, tasks: [{ taskId: 't', systemId: 'eco', nextDueTick: 6, intervalTicks: 6 }] }, SYSTEMS),
    (err) => err.code === 'INVALID_INPUT',
    '缺字段拒绝',
  );
  assert.throws(
    () => createScheduler({ tick: 0, tasks: [{ ...task('t', 'eco', 6, 6, 10), note: 'x' }] }, SYSTEMS),
    (err) => err.code === 'INVALID_INPUT',
    '多字段拒绝',
  );
  assert.throws(
    () => createScheduler({ tick: 0, tasks: [task('', 'eco', 6, 6, 10)] }, SYSTEMS),
    (err) => err.code === 'INVALID_INPUT',
    '空 taskId 拒绝',
  );
  assert.throws(() => createScheduler({ tick: 0, tasks: [task('t', 'eco', 6, 6, 10)] }, undefined), (err) => err.code === 'INVALID_INPUT', '注册集合必须显式提供');
  assert.throws(() => createScheduler({ tick: -1 }, SYSTEMS), (err) => err.code === 'INVALID_INPUT');
  assert.throws(() => createScheduler({ tick: 0, foo: 1 }, SYSTEMS), (err) => err.code === 'INVALID_INPUT', '未知选项拒绝');
});

test('S4: 过期队列恢复拒绝；下一到期点溢出整次推进拒绝且无部分更新；时间倒退拒绝', () => {
  assert.throws(
    () => restoreScheduler({ currentTick: 10, tasks: [task('t', 'eco', 5, 6, 10)] }, SYSTEMS),
    (err) => err.code === 'INVALID_INPUT',
    'nextDueTick ≤ currentTick 的队列已过期',
  );
  assert.throws(
    () => restoreScheduler({ currentTick: 10, tasks: [task('a', 'eco', 20, 6, 10), task('a', 'eco', 30, 6, 10)] }, SYSTEMS),
    (err) => err.code === 'INVALID_INPUT',
    '重复执行（重复 taskId）的队列拒绝',
  );

  // 溢出：到期点贴近安全整数上限，触发一次后下一到期点溢出 → 整次推进拒绝
  const overflowTask = deepFreeze(task('ov', 'eco', Number.MAX_SAFE_INTEGER - 2, 5, 10));
  const sched = createScheduler({ tick: Number.MAX_SAFE_INTEGER - 3, tasks: [overflowTask] }, SYSTEMS);
  const snapshot = { currentTick: sched.currentTick, tasks: sched.tasks.map((t) => ({ ...t })) };
  assert.throws(
    () => advanceScheduler(sched, Number.MAX_SAFE_INTEGER, SYSTEMS),
    (err) => err.code === 'LIMIT_EXCEEDED',
    '触发后下一到期点溢出',
  );
  assert.deepEqual(sched, snapshot, '溢出时输入 scheduler 保持不变');

  // 批内混合：正常任务不溢出、溢出任务触发 → 整体拒绝，不留部分更新
  const mixed = createScheduler(
    {
      tick: Number.MAX_SAFE_INTEGER - 3,
      tasks: [task('ok', 'eco', Number.MAX_SAFE_INTEGER - 2, 2, 10), overflowTask],
    },
    SYSTEMS,
  );
  assert.throws(
    () => advanceScheduler(mixed, Number.MAX_SAFE_INTEGER, SYSTEMS),
    (err) => err.code === 'LIMIT_EXCEEDED',
    '批内溢出使整次推进失败，不留部分更新',
  );

  // 推进跨度超过架构保护预算（144000）直接拒绝
  const far = createScheduler({ tick: 0, tasks: [task('t', 'eco', 6, 6, 10)] }, SYSTEMS);
  assert.throws(() => advanceScheduler(far, MAX_ADVANCE_TICKS + 1, SYSTEMS), (err) => err.code === 'LIMIT_EXCEEDED');
  assert.equal(far.currentTick, 0);
  assert.equal(advanceScheduler(far, MAX_ADVANCE_TICKS, SYSTEMS).scheduler.currentTick, MAX_ADVANCE_TICKS, '恰好预算允许');

  const s = createScheduler({ tick: 10, tasks: [task('t', 'eco', 20, 10, 10)] }, SYSTEMS);
  assert.throws(() => advanceScheduler(s, 9, SYSTEMS), (err) => err.code === 'INVALID_INPUT', '时间不能倒退');
  assert.throws(() => advanceScheduler(s, 20), (err) => err.code === 'INVALID_INPUT', '注册集合必须显式提供');
  assert.throws(() => advanceScheduler(s, 20, new Set(['other'])), (err) => err.code === 'INVALID_INPUT', '存量任务系统未注册');
});

// ———————————————— I1: 纯 Node 独立化 ————————————————

test('I1: 三模块不触碰 Math.random/墙钟/定时器/DOM/网络/环境变量；只允许 core 内相对引用', () => {
  const modules = ['rng.mjs', 'simulation-clock.mjs', 'scheduler.mjs'];
  const forbidden = [
    /Math\.random/,
    /Date\.now/,
    /performance\./,
    /setTimeout/,
    /setInterval/,
    /setImmediate/,
    /\blocalStorage\b/,
    /\bdocument\b/,
    /\bwindow\b/,
    /\bfetch\b/,
    /XMLHttpRequest/,
    /\brequire\(/,
    /\bprocess\.env\b/,
    /\bnode:/,
  ];
  for (const name of modules) {
    const raw = readFileSync(new URL(`../../runtime/core/${name}`, import.meta.url), 'utf8');
    // 只扫描代码，剥离块注释与行注释（文档里提及禁用 API 的说明不算命中）
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const pattern of forbidden) {
      assert.doesNotMatch(src, pattern, `${name} 命中禁止模式 ${pattern}`);
    }
    // 允许的唯一依赖形态：runtime/core 内的相对引用（如 scheduler 引共享常量）
    const importLines = raw.match(/^\s*import\b[^\n]*/gm) ?? [];
    for (const line of importLines) {
      assert.match(line, /from\s+'\.\//, `${name} 出现非相对引用：${line.trim()}`);
    }
  }
});
