/**
 * runtime/core/scheduler.mjs —— 周期任务调度器（A1）。
 *
 * 接口合同（A1 任务书 §4 / 架构计划 §4.2）：
 *
 * 任务描述符
 *   - 恰好五个字段：{ taskId, systemId, nextDueTick, intervalTicks, priority }。
 *     taskId/systemId 非空字符串且 taskId 唯一；nextDueTick 为非负安全整数且
 *     必须严格大于当前 tick（初始 tick 0 已完成，到期点只能在未来）；
 *     intervalTicks 为正安全整数；priority 为安全整数（可负，升序在前）。
 *     缺字段、多字段、类型不符、值非法一律抛 Error（code='INVALID_INPUT'）。
 *
 * 系统注册集合（必须显式提供）
 *   - 接受 Set、数组或键为系统名的普通对象；systemId 必须已注册，未注册拒绝。
 *     A1 不创建任何业务系统，注册集合仅由调用方（测试/后续阶段）给出。
 *
 * createScheduler(options?, systems)
 *   - options 可省略；提供时字段仅限 tick（非负安全整数，默认 0）与
 *     tasks（描述符数组，默认 []），未知字段拒绝。
 *   - 返回普通数据状态 { currentTick, tasks }：tasks 为描述符副本，按 taskId
 *     的 UTF-16 码元序存放，序列化结果与注册顺序无关。输入对象不被修改。
 *
 * restoreScheduler(saved, systems)
 *   - saved 必须恰好为 { currentTick, tasks }（createScheduler/advanceScheduler
 *     的返回形态）；任何 nextDueTick ≤ currentTick 的队列视为已过期拒绝；
 *     重复 taskId 视为重复执行队列拒绝。
 *
 * advanceScheduler(scheduler, targetTick, systems)
 *   - 返回 { dueTasks, scheduler }。scheduler 为推进后的新状态对象；
 *     dueTasks 为本次经过的到期点集合，每项 { taskId, systemId, dueTick, priority }。
 *   - 到期区间为 (currentTick, targetTick]：起点不含（初始 tick 0 已完成）、
 *     终点含。批量推进逐个处理经过的每个到期点；同一任务可多次到期并逐次出现。
 *   - 排序固定为 dueTick、priority、systemId、taskId 升序；字符串用 UTF-16
 *     码元序（与 locale 无关、与注册先后无关）。
 *   - 完成后 nextDueTick = 原到期点 + k×intervalTicks（k 为本次触发次数），
 *     不是"本次请求终点 + 周期"。
 *   - 不执行任何业务回调、不写共享世界状态；只返回可独立验证的调度计划，
 *     供 A2 在候选状态中统一提交。输入 scheduler 与描述符不被修改。
 *   - targetTick 早于 currentTick 抛 Error（code='INVALID_INPUT'）；
 *     等于 currentTick 为无操作（返回空到期集）。任何任务计算出的下一到期点
 *     超出安全整数抛 Error（code='LIMIT_EXCEEDED'），整次推进无部分更新。
 *   - 单次推进跨度（targetTick - currentTick）不得超过 MAX_ADVANCE_TICKS
 *     （144000，架构保护预算，从 simulation-clock 引入同一常量）：到期点展开
 *     数量随跨度线性增长，超预算一律拒绝。这是防失控保护，不是能力证明。
 *
 * 到期与恢复语义与架构一致：初始 tick 0 已完成，推进执行后续 tick；
 * 恢复后从保存的 nextDueTick 继续，不漏执行、不重复执行、不重排周期。
 *
 * 保护限额（A1R F1；是防失控保护，不是性能承诺）：
 *   - MAX_SCHEDULED_TASKS = 100000：调度队列任务项上限，与架构任务预算一致，
 *     create/restore/advance 三个入口都拒绝超限队列。
 *   - MAX_ADVANCE_DUE_RESULTS = 1000000：单次推进到期结果总量上限。advanceScheduler
 *     在分配任何结果对象前预检全部任务的触发次数、下一到期点（安全整数精确运算）
 *     与累计总量，任一超限抛 Error（code='LIMIT_EXCEEDED'）；不截断、不隐式分批、
 *     不丢任务、不改输入；调用方可显式缩小推进跨度，调度器不暗改请求。
 *
 * 输入形态（A1R F2/F3）：
 *   - 任务数组必须密集：空洞、null、undefined 描述符在 create/restore/advance
 *     一律抛 Error（code='INVALID_INPUT'），不过滤坏元素后继续；空数组合法。
 *   - 选项、恢复记录、任务描述符与对象形式注册表必须是普通数据对象
 *     （原型为 Object.prototype 或 null）；Date/Map/Set/类实例一律拒绝。
 *     注册集合明确允许 Set 与数组。
 *
 * 本模块仅引用同目录 simulation-clock 的共享常量，不引入其他模块，
 * 不触墙钟、定时器、DOM、网络与环境变量。
 */

import { MAX_ADVANCE_TICKS } from './simulation-clock.mjs';

export const MAX_SCHEDULED_TASKS = 100000;
export const MAX_ADVANCE_DUE_RESULTS = 1000000;

const DESCRIPTOR_FIELDS = ['taskId', 'systemId', 'nextDueTick', 'intervalTicks', 'priority'];

function invalidInput(message) {
  const error = new Error(message);
  error.code = 'INVALID_INPUT';
  return error;
}

function limitExceeded(message) {
  const error = new Error(message);
  error.code = 'LIMIT_EXCEEDED';
  return error;
}

function isSafeInt(value) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= -Number.MAX_SAFE_INTEGER &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function isSafeNonNegativeInt(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isPositiveSafeInt(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= Number.MAX_SAFE_INTEGER;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function isDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function compareByTaskId(a, b) {
  return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
}

function normalizeRegistry(systems) {
  if (systems === null || systems === undefined) {
    throw invalidInput('系统注册集合必须显式提供（Set、数组或普通记录对象）');
  }
  let ids;
  if (systems instanceof Set) {
    ids = [...systems];
  } else if (Array.isArray(systems)) {
    ids = [...systems];
  } else if (isDataRecord(systems)) {
    ids = Object.keys(systems);
  } else {
    throw invalidInput(`系统注册集合必须是 Set、数组或普通记录对象，收到 ${describeValue(systems)}`);
  }
  const registry = new Set();
  for (const id of ids) {
    if (!isNonEmptyString(id)) {
      throw invalidInput(`注册集合中的系统名必须是非空字符串，收到 ${String(id)}`);
    }
    registry.add(id);
  }
  return registry;
}

function describeValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'object' && value.constructor && value.constructor.name) {
    return value.constructor.name + ' 实例';
  }
  return typeof value;
}

function validateTaskArray(tasks) {
  if (!Array.isArray(tasks)) {
    throw invalidInput('tasks 必须是数组');
  }
  if (tasks.length > MAX_SCHEDULED_TASKS) {
    throw limitExceeded(`调度队列 ${tasks.length} 项超出保护限额 ${MAX_SCHEDULED_TASKS}`);
  }
  for (let i = 0; i < tasks.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(tasks, i)) {
      throw invalidInput(`tasks[${i}] 是稀疏空洞：任务数组必须密集，不得含空洞`);
    }
  }
}

function validateDescriptor(raw, currentTick, registry, context) {
  if (!isDataRecord(raw)) {
    throw invalidInput(`${context}：任务描述符必须是普通数据对象（Date/Map/Set/类实例不接受）`);
  }
  const keys = Object.keys(raw).sort();
  const expected = [...DESCRIPTOR_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) {
    throw invalidInput(
      `${context}：字段必须恰好为 ${DESCRIPTOR_FIELDS.join('/')}，收到 [${keys.join('/') || '无'}]`,
    );
  }
  if (!isNonEmptyString(raw.taskId)) {
    throw invalidInput(`${context}：taskId 必须是非空字符串`);
  }
  if (!isNonEmptyString(raw.systemId)) {
    throw invalidInput(`${context}：systemId 必须是非空字符串`);
  }
  if (!registry.has(raw.systemId)) {
    throw invalidInput(`${context}：systemId "${raw.systemId}" 未注册`);
  }
  if (!isSafeNonNegativeInt(raw.nextDueTick)) {
    throw invalidInput(`${context}：nextDueTick 必须是非负安全整数，收到 ${String(raw.nextDueTick)}`);
  }
  if (raw.nextDueTick <= currentTick) {
    throw invalidInput(
      `${context}：nextDueTick(${raw.nextDueTick}) 必须大于当前 tick(${currentTick})——初始 tick 0 已完成，落在已完成 tick 上的队列已过期`,
    );
  }
  if (!isPositiveSafeInt(raw.intervalTicks)) {
    throw invalidInput(`${context}：intervalTicks 必须是正安全整数，收到 ${String(raw.intervalTicks)}`);
  }
  if (!isSafeInt(raw.priority)) {
    throw invalidInput(`${context}：priority 必须是安全整数，收到 ${String(raw.priority)}`);
  }
}

function copyDescriptor(task) {
  return {
    taskId: task.taskId,
    systemId: task.systemId,
    nextDueTick: task.nextDueTick,
    intervalTicks: task.intervalTicks,
    priority: task.priority,
  };
}

function buildSchedulerState(currentTick, rawTasks, registry) {
  validateTaskArray(rawTasks);
  const seen = new Set();
  const tasks = rawTasks.map((raw, index) => {
    validateDescriptor(raw, currentTick, registry, `tasks[${index}]`);
    if (seen.has(raw.taskId)) {
      throw invalidInput(`taskId "${raw.taskId}" 重复`);
    }
    seen.add(raw.taskId);
    return copyDescriptor(raw);
  });
  tasks.sort(compareByTaskId);
  return { currentTick, tasks };
}

function validateSchedulerState(saved) {
  if (!isDataRecord(saved)) {
    throw invalidInput('调度器状态必须是普通数据对象 { currentTick, tasks }（Date/Map/Set/类实例不接受）');
  }
  const keys = Object.keys(saved).sort();
  if (keys.length !== 2 || keys[0] !== 'currentTick' || keys[1] !== 'tasks') {
    throw invalidInput(`调度器状态字段必须恰好为 currentTick/tasks，收到 [${keys.join('/') || '无'}]`);
  }
  if (!isSafeNonNegativeInt(saved.currentTick)) {
    throw invalidInput(`currentTick 必须是非负安全整数，收到 ${String(saved.currentTick)}`);
  }
  validateTaskArray(saved.tasks);
}

export function createScheduler(options, systems) {
  const registry = normalizeRegistry(systems);
  let tick = 0;
  let rawTasks = [];
  if (options !== undefined) {
    if (!isDataRecord(options)) {
      throw invalidInput('调度器选项必须是普通数据对象 { tick, tasks } 或省略（Date/Map/Set/类实例不接受）');
    }
    for (const key of Object.keys(options)) {
      if (key === 'tick') {
        if (!isSafeNonNegativeInt(options.tick)) {
          throw invalidInput(`初始 tick 必须是非负安全整数，收到 ${String(options.tick)}`);
        }
        tick = options.tick;
      } else if (key === 'tasks') {
        if (!Array.isArray(options.tasks)) {
          throw invalidInput('tasks 必须是数组');
        }
        rawTasks = options.tasks;
      } else {
        throw invalidInput(`未知调度器选项 "${key}"`);
      }
    }
  }
  return buildSchedulerState(tick, rawTasks, registry);
}

export function restoreScheduler(saved, systems) {
  const registry = normalizeRegistry(systems);
  validateSchedulerState(saved);
  return buildSchedulerState(saved.currentTick, saved.tasks, registry);
}

export function advanceScheduler(scheduler, targetTick, systems) {
  validateSchedulerState(scheduler);
  if (!isSafeNonNegativeInt(targetTick)) {
    throw invalidInput(`目标 tick 必须是非负安全整数，收到 ${String(targetTick)}`);
  }
  if (targetTick < scheduler.currentTick) {
    throw invalidInput(`目标 tick(${targetTick}) 早于当前 tick(${scheduler.currentTick})，时间不能倒退`);
  }
  if (targetTick - scheduler.currentTick > MAX_ADVANCE_TICKS) {
    throw limitExceeded(
      `单次推进跨度 ${targetTick - scheduler.currentTick} 超过保护预算 ${MAX_ADVANCE_TICKS} tick`,
    );
  }
  const registry = normalizeRegistry(systems);

  // 先完整校验存量队列（过期/重复/未注册），失败时不产生任何结果对象
  const seen = new Set();
  for (const task of scheduler.tasks) {
    validateDescriptor(task, scheduler.currentTick, registry, `tasks["${String(task && task.taskId)}"]`);
    if (seen.has(task.taskId)) {
      throw invalidInput(`taskId "${task.taskId}" 重复`);
    }
    seen.add(task.taskId);
  }

  // 预检（A1R F1）：在分配任何结果对象之前，精确算出每个任务的触发次数与
  // 下一到期点，并累计总展开量；任一超限整次拒绝，不截断、不隐式分批、不丢任务。
  // 下一到期点 = targetTick + (intervalTicks - overdue % intervalTicks)，各量均为
  // 不超过 MAX_SAFE_INTEGER 的精确整数，先比较后相加，避免浮点误差。
  let totalDueCount = 0;
  for (const task of scheduler.tasks) {
    if (task.nextDueTick > targetTick) {
      continue;
    }
    const overdue = targetTick - task.nextDueTick;
    const fireCount = Math.floor(overdue / task.intervalTicks) + 1;
    const overshoot = task.intervalTicks - (overdue % task.intervalTicks);
    if (overshoot > Number.MAX_SAFE_INTEGER - targetTick) {
      throw limitExceeded(
        `任务 "${task.taskId}" 的下一到期点将超出安全整数，整次推进在结果展开前拒绝`,
      );
    }
    if (totalDueCount > MAX_ADVANCE_DUE_RESULTS - fireCount) {
      throw limitExceeded(
        `到期结果总量将超过单次保护限额 ${MAX_ADVANCE_DUE_RESULTS}，整次推进在结果展开前拒绝`,
      );
    }
    totalDueCount += fireCount;
  }

  const dueTasks = [];
  const nextTasks = [];
  for (const task of scheduler.tasks) {
    if (task.nextDueTick > targetTick) {
      nextTasks.push(copyDescriptor(task));
      continue;
    }
    const overdue = targetTick - task.nextDueTick;
    const fireCount = Math.floor(overdue / task.intervalTicks) + 1;
    const nextDueTick = targetTick + (task.intervalTicks - (overdue % task.intervalTicks));
    for (let j = 0; j < fireCount; j++) {
      dueTasks.push({
        taskId: task.taskId,
        systemId: task.systemId,
        dueTick: task.nextDueTick + j * task.intervalTicks,
        priority: task.priority,
      });
    }
    nextTasks.push({ ...copyDescriptor(task), nextDueTick });
  }

  dueTasks.sort(
    (a, b) =>
      a.dueTick - b.dueTick ||
      a.priority - b.priority ||
      (a.systemId < b.systemId ? -1 : a.systemId > b.systemId ? 1 : 0) ||
      (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0),
  );
  nextTasks.sort(compareByTaskId);

  return { dueTasks, scheduler: { currentTick: targetTick, tasks: nextTasks } };
}
