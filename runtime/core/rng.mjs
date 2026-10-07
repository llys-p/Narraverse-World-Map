/**
 * runtime/core/rng.mjs —— 确定性随机流 mulberry32-v1（A1）。
 *
 * 接口合同（A1 任务书 §4 / 架构计划 §4.3）：
 *
 * createRng(seed)
 *   - seed：必需参数，必须是 0..4294967295 的整数（含 0 与上限）。
 *     0 是合法 seed，不是缺省值；缺参、非数值、负数、小数、NaN、Infinity、越界
 *     一律抛 Error（code='INVALID_INPUT'），不做隐式类型转换。
 *   - 返回 rng 对象：{ next(), getState() }。
 *
 * rng.next()
 *   - 返回 [0,1) 的双精度数。输出 = uint32 输出 / 2^32（除以 2 的幂在 IEEE754 下精确）。
 *   - 同 seed 的实例序列逐项一致；不使用 Math.random。
 *
 * rng.getState()
 *   - 返回新对象 { algorithm: 'mulberry32-v1', seed, state }，state 为当前 uint32。
 *     修改返回对象不影响内部。
 *
 * restoreRng(saved)
 *   - saved 必须是普通数据对象（原型为 Object.prototype 或 null），
 *     且恰好为 { algorithm: 'mulberry32-v1', seed, state } 三个字段，
 *     algorithm 精确匹配，seed/state 均为 uint32 整数；缺字段、多字段、未知算法、
 *     非法数值、Date/Map/Set/类实例一律抛 Error（code='INVALID_INPUT'），不静默修复。
 *   - 从 saved.state 位置继续输出，不重新从 seed 开始。
 *
 * uint32 溢出语义：状态累加按 mod 2^32 显式回绕（>>> 0），与 C 参考实现一致。
 * 不采用浮点累加——浮点累加版本在累计超过 2^53 后会失去精度而偏离 32 位语义。
 *
 * 算法来源：mulberry32（Tommy Ettinger，公共领域）。
 * 测试已知向量由 BigInt 掩码运算独立核算并与规范实现对照，见 tests/simulation/rng.test.mjs。
 *
 * 本模块零依赖：不引入任何模块，不触墙钟、定时器、DOM、网络与环境变量。
 */

export const RNG_ALGORITHM = 'mulberry32-v1';

const UINT32_MAX = 0xffffffff;
const STATE_INCREMENT = 0x6d2b79f5;

function invalidInput(message) {
  const error = new Error(message);
  error.code = 'INVALID_INPUT';
  return error;
}

function isUint32Value(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

function isDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function makeRng(seed, initialState) {
  let state = initialState;
  return {
    next() {
      state = (state + STATE_INCREMENT) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState() {
      return { algorithm: RNG_ALGORITHM, seed, state };
    },
  };
}

export function createRng(seed) {
  if (!isUint32Value(seed)) {
    throw invalidInput(`rng seed 必须是 0..4294967295 的整数，收到 ${String(seed)}`);
  }
  return makeRng(seed, seed);
}

export function restoreRng(saved) {
  if (!isDataRecord(saved)) {
    throw invalidInput('恢复状态必须是普通数据对象 { algorithm, seed, state }——Date/Map/Set/类实例不接受');
  }
  const keys = Object.keys(saved).sort();
  const expected = ['algorithm', 'seed', 'state'];
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) {
    throw invalidInput(`恢复状态字段必须恰好为 ${expected.join('/')}，收到 [${keys.join('/') || '无'}]`);
  }
  if (saved.algorithm !== RNG_ALGORITHM) {
    throw invalidInput(`未知随机算法 "${String(saved.algorithm)}"，仅支持 ${RNG_ALGORITHM}`);
  }
  if (!isUint32Value(saved.seed)) {
    throw invalidInput(`恢复状态 seed 非法：${String(saved.seed)}`);
  }
  if (!isUint32Value(saved.state)) {
    throw invalidInput(`恢复状态 state 非法：${String(saved.state)}`);
  }
  return makeRng(saved.seed, saved.state);
}
