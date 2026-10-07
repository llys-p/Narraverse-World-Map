/**
 * runtime/core/simulation-clock.mjs —— 确定性模拟时钟（A1）。
 *
 * 接口合同（A1 任务书 §4 / 架构计划 §4.1）：
 *
 * 常量
 *   - TICK_MINUTES = 10：每 tick 代表世界内 10 分钟。
 *   - TICKS_PER_DAY = 144：一天 144 tick。
 *   - MAX_ADVANCE_TICKS = 144000：单次推进上限（1000 天，架构保护预算）。
 *
 * createClock(options?)
 *   - options 可省略（等价 { tick: 0 }）；提供时必须是普通对象且字段恰好为
 *     可选的 tick（非负安全整数），未知字段拒绝。
 *   - 返回时钟对象 { tick, tickMinutes, advanceTicks(count), getState(), describe() }。
 *
 * clock.advanceTicks(count)
 *   - 显式推进接下来的 count 个 tick。世界只由显式推进驱动：不启动定时器、
 *     不按真实时间补算、任意真实等待都不改变世界；0 tick 推进无变化。
 *   - count 必须是数值整数；负数、小数、字符串、非有限值、非数值抛
 *     Error（code='INVALID_INPUT'）。
 *   - count > MAX_ADVANCE_TICKS，或 tick + count 超出安全整数，抛
 *     Error（code='LIMIT_EXCEEDED'）。
 *   - 校验失败时原时钟不变。
 *
 * clock.getState()
 *   - 返回 { tick, tickMinutes }，供快照与恢复；tickMinutes 恒为 10，
 *     恢复时不匹配视为跨版本状态并拒绝。
 *
 * restoreClock(saved)
 *   - saved 必须恰好为 { tick, tickMinutes }，tick 为非负安全整数、
 *     tickMinutes === 10；否则抛 Error（code='INVALID_INPUT'）。
 *
 * deriveClockReading(tick)
 *   - 纯函数：由 tick 派生日期与时辰，绝不使用真实时间。
 *   - 约定：tick 0 = 第 0 天 00:00；day = floor(tick/144)；
 *     minuteOfDay = (tick mod 144) × 10；时辰各 120 分钟（12 tick），
 *     子时 23:00–00:59 跨午夜，依次 子丑寅卯辰巳午未申酉戌亥。
 *   - 返回 { tick, day, tickOfDay, minuteOfDay, hour, minute, shichenIndex, shichenName }。
 *
 * 本模块零依赖：不引入任何模块，不触墙钟、定时器、DOM、网络与环境变量。
 */

export const TICK_MINUTES = 10;
export const TICKS_PER_DAY = 144;
export const MAX_ADVANCE_TICKS = 144000;

const SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const MINUTES_PER_DAY = TICKS_PER_DAY * TICK_MINUTES;

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

function isSafeNonNegativeInt(value) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

export function deriveClockReading(tick) {
  if (!isSafeNonNegativeInt(tick)) {
    throw invalidInput(`tick 必须是非负安全整数，收到 ${String(tick)}`);
  }
  const day = Math.floor(tick / TICKS_PER_DAY);
  const tickOfDay = tick % TICKS_PER_DAY;
  const minuteOfDay = tickOfDay * TICK_MINUTES;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const shichenIndex = Math.floor(((minuteOfDay + 60) % MINUTES_PER_DAY) / 120);
  return {
    tick,
    day,
    tickOfDay,
    minuteOfDay,
    hour,
    minute,
    shichenIndex,
    shichenName: SHICHEN_NAMES[shichenIndex],
  };
}

function makeClock(tick) {
  return {
    get tick() {
      return tick;
    },
    get tickMinutes() {
      return TICK_MINUTES;
    },
    advanceTicks(count) {
      if (typeof count !== 'number' || !Number.isInteger(count)) {
        throw invalidInput(`推进数量必须是整数，收到 ${String(count)}`);
      }
      if (count < 0) {
        throw invalidInput(`推进数量不能为负，收到 ${count}`);
      }
      if (count > MAX_ADVANCE_TICKS) {
        throw limitExceeded(`单次最多推进 ${MAX_ADVANCE_TICKS} tick，收到 ${count}`);
      }
      if (tick > Number.MAX_SAFE_INTEGER - count) {
        throw limitExceeded(`累计 tick 将超出安全整数：${tick} + ${count}`);
      }
      tick += count;
    },
    getState() {
      return { tick, tickMinutes: TICK_MINUTES };
    },
    describe() {
      return deriveClockReading(tick);
    },
  };
}

export function createClock(options) {
  let tick = 0;
  if (options !== undefined) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw invalidInput('时钟选项必须是普通对象 { tick } 或省略');
    }
    const keys = Object.keys(options);
    for (const key of keys) {
      if (key !== 'tick') {
        throw invalidInput(`未知时钟选项 "${key}"`);
      }
    }
    if (keys.includes('tick')) {
      if (!isSafeNonNegativeInt(options.tick)) {
        throw invalidInput(`初始 tick 必须是非负安全整数，收到 ${String(options.tick)}`);
      }
      tick = options.tick;
    }
  }
  return makeClock(tick);
}

export function restoreClock(saved) {
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) {
    throw invalidInput('时钟恢复状态必须是 { tick, tickMinutes } 对象');
  }
  const keys = Object.keys(saved).sort();
  if (keys.length !== 2 || keys[0] !== 'tick' || keys[1] !== 'tickMinutes') {
    throw invalidInput(`时钟恢复状态字段必须恰好为 tick/tickMinutes，收到 [${keys.join('/') || '无'}]`);
  }
  if (!isSafeNonNegativeInt(saved.tick)) {
    throw invalidInput(`恢复 tick 非法：${String(saved.tick)}`);
  }
  if (saved.tickMinutes !== TICK_MINUTES) {
    throw invalidInput(`恢复 tickMinutes 必须为 ${TICK_MINUTES}，收到 ${String(saved.tickMinutes)}`);
  }
  return makeClock(saved.tick);
}
