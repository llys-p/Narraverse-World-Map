import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, restoreRng, RNG_ALGORITHM } from '../../runtime/core/rng.mjs';

// —— 已知向量（R1）——
// 算法来源：mulberry32（Tommy Ettinger，公共领域）；JS 社区常见规范实现为 bryc 的版本。
// 向量独立核算方式：另用临时脚本以 BigInt 显式 & 0xFFFFFFFF 掩码逐行复刻 C 的 32 位语义
// （Math.imul 的两个实参 t^(t>>>15) 与 t|1 都取自原始 t；每次乘法/加法后各自 mod 2^32），
// 再与 bryc 规范实现（状态累加显式 >>> 0 回绕变体）跨 5 个 seed 各 60000 次输出逐项对照一致。
// 下列期望值是那次独立核算的产物，不是复制被测实现的输出。
// 期望浮点 = u32 / 2^32（除以 2 的幂在 IEEE754 双精度下精确，无舍入误差）。
const KNOWN_VECTORS = [
  [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
  [42, [2581720956, 1925393290, 3661312704, 2876485805, 750819978]],
  [4294967295, [3850105811, 813802916, 3073704848, 4054706436, 3630262831]],
];

// 状态闭式解：第 k 次输出后的内部状态 = (seed + k * 0x6D2B79F5) mod 2^32（增量与 C 参考一致）。
const closedFormState = (seed, k) =>
  Number((BigInt(seed >>> 0) + BigInt(k) * 0x6D2B79F5n) & 0xFFFFFFFFn);

test('R1: mulberry32-v1 已知向量逐项一致（seed 0 / 42 / 2^32-1），输出均在 [0,1)', () => {
  for (const [seed, u32s] of KNOWN_VECTORS) {
    const rng = createRng(seed);
    u32s.forEach((u32, i) => {
      const v = rng.next();
      assert.ok(v >= 0 && v < 1, `seed ${seed} 输出 #${i} 越界: ${v}`);
      assert.ok(Object.is(v, u32 / 4294967296), `seed ${seed} 输出 #${i} 期望 ${u32}/2^32，实得 ${v}`);
    });
  }
});

test('R1: 算法名固定；seed 0 与 uint32 上限均合法；缺省 seed 被拒绝（0 不是缺省值）', () => {
  assert.equal(RNG_ALGORITHM, 'mulberry32-v1');
  const zero = createRng(0);
  assert.equal(zero.getState().seed, 0);
  const max = createRng(4294967295);
  assert.equal(max.getState().seed, 4294967295);
  assert.throws(() => createRng(), (err) => err.code === 'INVALID_INPUT');
});

test('R1: 长序列输出始终为有限数且在 [0,1)', () => {
  const rng = createRng(42);
  for (let i = 0; i < 10000; i++) {
    const v = rng.next();
    assert.ok(Number.isFinite(v) && v >= 0 && v < 1, `#${i} 输出非法: ${v}`);
  }
});

test('R2: 同 seed 的两实例序列逐项一致', () => {
  const a = createRng(7);
  const b = createRng(7);
  for (let i = 0; i < 1000; i++) {
    assert.ok(Object.is(a.next(), b.next()), `#${i} 两实例输出不同`);
  }
});

test('R2: 前段导出恢复后，后续序列与不中断实例逐项相同；恢复不从 seed 重来', () => {
  const uninterrupted = createRng(42);
  for (let i = 0; i < 10; i++) uninterrupted.next();

  const split = createRng(42);
  for (let i = 0; i < 10; i++) split.next();
  const saved = split.getState();
  assert.deepEqual(saved, { algorithm: 'mulberry32-v1', seed: 42, state: closedFormState(42, 10) });

  const resumed = restoreRng(saved);
  assert.equal(resumed.getState().state, closedFormState(42, 10), '恢复后位置不变');
  for (let i = 0; i < 10; i++) {
    assert.ok(Object.is(resumed.next(), uninterrupted.next()), `恢复后 #${i} 与不中断实例不同`);
  }
  assert.equal(resumed.getState().state, closedFormState(42, 20), '恢复后继续推进，未重置回 seed');
});

test('R2: getState 返回新对象，外部修改不影响内部状态', () => {
  const rng = createRng(9);
  const tampered = rng.getState();
  tampered.state = 0;
  tampered.seed = 123456;
  assert.equal(rng.getState().state, closedFormState(9, 0));
  assert.equal(rng.getState().seed, 9);
});

test('R3: 非法 seed 全部拒绝，不做隐式类型转换', () => {
  const badSeeds = [-1, 0.5, 4294967296, 2 ** 53, NaN, Infinity, -Infinity, '42', null, false, true, 42n];
  for (const seed of badSeeds) {
    assert.throws(() => createRng(seed), (err) => err.code === 'INVALID_INPUT', `seed=${String(seed)} 应被拒绝`);
  }
});

test('R3: 非法恢复状态/未知算法/缺字段/多字段一律拒绝，不静默修复', () => {
  const source = createRng(42);
  for (let i = 0; i < 3; i++) source.next();
  const base = source.getState();

  const badStates = [
    null, undefined, 42, 'state', [],
    {},
    { algorithm: 'mulberry32-v1', seed: 42 }, // 缺 state
    { algorithm: 'mulberry32-v1', state: 5 }, // 缺 seed
    { seed: 42, state: 5 }, // 缺 algorithm
    { ...base, extra: 1 }, // 多余字段
    { ...base, algorithm: 'mulberry32-v2' }, // 未知算法
    { ...base, algorithm: 'mulberry32' }, // 算法名不精确
    { ...base, algorithm: 42 },
    { ...base, seed: -1 },
    { ...base, seed: 0.5 },
    { ...base, seed: '42' },
    { ...base, seed: 4294967296 },
    { ...base, seed: NaN },
    { ...base, state: -1 },
    { ...base, state: 0.5 },
    { ...base, state: 4294967296 },
    { ...base, state: '5' },
    { ...base, state: NaN },
    { ...base, state: Infinity },
  ];
  for (const s of badStates) {
    assert.throws(() => restoreRng(s), (err) => err.code === 'INVALID_INPUT', `${JSON.stringify(s)} 应被拒绝`);
  }
});

test('R3+: 恢复记录必须是普通数据对象——Date/Map/类实例拒绝，null 原型记录接受', () => {
  class Custom {}
  for (const exotic of [new Date(), new Map(), new Custom()]) {
    assert.throws(
      () => restoreRng(exotic),
      (err) => err.code === 'INVALID_INPUT',
      `restoreRng(${exotic.constructor?.name ?? 'unknown'}) 应被拒绝`,
    );
  }
  const source = createRng(5);
  source.next();
  const nullProto = Object.assign(Object.create(null), source.getState());
  const resumed = restoreRng(nullProto);
  assert.equal(resumed.getState().seed, 5);
  assert.equal(resumed.getState().state, closedFormState(5, 1), 'null 原型记录按字段合同恢复');
});
