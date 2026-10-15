name: r2-safe-record-store
description: R2 return-fix candidate for step5 (was rejected in R1 for the inherited-member counter-example); one minimal change in the record copy loop, validated in artifacts/free-model-optimization/r2.

# R2 proposal（free-perf-trials/step5 · Step5 模型 · x0.00 目录路由）

## 结论

一个最小候选（返修上一轮 R1 拒收，不是新方向）：

在 `cloneData` 的记录分支里，把“每个键都调用 `put()`（即 `Object.defineProperty`）”改为
**仅在键与 `Object.prototype` 自有属性冲突时使用 `put()`，其余键用普通赋值 `result[key] = entry`**。
冲突判定用 `Object.getOwnPropertyDescriptor(Object.prototype, key) !== undefined`；`'__proto__'` 显式并入冲突分支。

对照基线：`2936233426e990857f3c88a39ad58623832419fd`
本树冻结 oracle：`free-perf-trials/step5/artifacts/oracle/runtime/core/data-contract.mjs`
sha256：`c6f3bb2c1f4c10e2566b74a8f94ef38e9342ba52a4e60244f`

与 DeepSeek 已通过方案的关系：**同方向、同机制，不是独立新优化**。
DeepSeek 的做法同样是“先查键是否与 `Object.prototype` 自有属性冲突，冲突才用原 `put()`，其余普通赋值”（见 `round1-comparison.md`）。
本候选可以读作对它同一机制的独立返修实现与短试验证据，不能宣称独立新方案。
与我自己 R1 被拒版本的区别只有一点：R1 只特殊处理字面 `'__proto__'`；本版把判定换成真实的 `Object.prototype` 自有描述符查询，覆盖 accessor / 只读 / accessor+只读等一切继承成员。

## 机制与文件行号（本树 prototypes）

- 原型文件（可复跑，R2 唯一新写产物）：`free-perf-trials/step5/artifacts/free-model-optimization/r2/proto-record-store.mjs`
- 试验与原始输出：`free-perf-trials/step5/artifacts/free-model-optimization/r2/experiments.mjs`、`experiment-output.txt`
- 生产落地位置（**未改，只标注**）：`free-perf-trials/step5/runtime/core/data-contract.mjs:63-75` 记录分支；
  等价改写是把 `for (const key of Object.keys(value).sort()) put(result, key, cloneData(value[key], ancestors, depth + 1));`
  改为同形循环 + `if (key === '__proto__' || Object.getOwnPropertyDescriptor(Object.prototype, key) !== undefined) put(result, key, entry); else result[key] = entry;`
  （另可把 `cloneValue` 上提到模块私有函数，去掉每次递归的默认参数对象分配；本 R2 试验未单独测这一项，不作为收益主张。）

## 为什么这修掉 R1 拒收

`record()` 校验的是**输入**的自有描述符与输入原型身份，并不保证 **`Object.prototype` 上**没有 setter 或只读属性。
`Object.defineProperty` 不经过原型链查找；普通赋值会。所以普通赋值不是无条件安全的——R1 控制器的反例完全成立：

1. 在 `Object.prototype` 上加 accessor `accountId`：原实现产出自有数据属性且 setter 调用 0 次；R1 候选调用 setter 一次、丢自有属性。
2. 同一键改成继承只读（`writable: false`）：原实现成功；R1 候选抛 `TypeError`。

本版把冲突判定提前到写入前，冲突键仍走 `defineProperty`，因此两者都退回原实现行为。

## 试跑证据（实测，同进程，非 benchmark 系统）

- 环境：宿主 Node v24.14.0，`--test-isolation=none`（R2 规则明确列为支持的宿主参数，非升权）。
- 命令（在 `D:\Narraverse-World-Map` 执行）：
  `node --test --test-reporter=tap --test-isolation=none free-perf-trials/step5/artifacts/free-model-optimization/r2/experiments.mjs`
- 结果：**5/5 PASS，0 fail**，单次运行 `duration_ms 143.976`；第二次留存原始输出一次（见 `experiment-output.txt`），同样 5/5。
- 反向例（R1 拒收两项）复现并转绿：
  - `ok 1` 继承 accessor：候选与 frozen oracle 的 `deepStrictEqual`、`accountId` 描述符、`frozenName` 描述符、键序全部一致，setter 调用次数 = 0。
  - `ok 2` 仅继承只读：候选与 oracle 完全一致，`frozenName` 为自有数据属性，不抛 `TypeError`。
- 语义核对：合成合法样本上的递归 prototype/descriptor/键序一致；`own __proto__`（经 `defineProperty` 定义）仍是自有可枚举数据属性；键序 `__proto__,a,constructor`；null 原型记录克隆为普通 `Object.prototype` 对象、键序 `0,2,10,a,z`；DAG 共享引用、数组与 `-0` 均一致。
- 拒绝语义：11 类非法输入（getter、Symbol 键、不可枚举、accessor、稀疏数组、数组额外属性、class 原型、Infinity、环、深度越界、非 JSON 值）**error `code` 与 `message` 逐字相同**。
- 性能（实测，本地微样本，非真实存档、非 p95、非稳定延迟）：
  `TIMING rounds=12 oracleDefineProperty=42.804ms candidate=20.608ms traversalSanity=40.762ms ratio=2.077x`
  - 样本：合成 400 实体 + nested + saves，与真实 save 形状同族；12 轮，同进程。
  - `traversalSanity` 是把记录分支切成同遍历的普通赋值版本，证明遍历本身没被改动，差距来自属性写入方式。
  - 这是**机制推断 + 单次同进程微测**，不能证明真实 r170 首次打开收益；真实收益需中控统一测量。

## 风险

1. 每键多一次 `Object.getOwnPropertyDescriptor(Object.prototype, key)`：这是本方案的全部额外成本；若真实 payload 中键名大量命中 `Object.prototype`（如 `valueOf`、`toString`、`constructor`），会退化为“defineProperty + 一次查询”，只有开销。上述微样本不含这类键，未实测退化幅度。
2. 实测微测非严格基准：单次采样、同进程、无预热分离、受 GC 影响；2.077x 不能外推到真实 47s 级首开。
3. 本 R2 试验**未跑**真实 r170 样本（路径超出本轮 contextReadScope，且中控保留测量），未做 Profiler、未跑全量/长链。
4. `Object.prototype` 被同进程其他测试污染时结果可能不同；试验内用 install/restore 隔离并 `finally` 清理，但跨文件顺序执行（`--test-isolation=none`）仍依赖本文件自己的清理完整性。
5. 生产文件未改，R1 被拒的候选 diff（`722685969c3c6728381bbb0954e5913e572a2936` 分支上的 tracked 改动）保持原样未动，未回滚也未合入。

## 是否复用/返修

- 返修 R1 自身拒收缺陷：是（把 `'__proto__'` 特判升级为 `Object.prototype` 自有属性判定）。
- 与 DeepSeek 已通过候选相同机制：**是，同机制复用，不是独立新优化**。若中控只想保留一个该方向候选，本 R2 的价值是独立复现 + 反例转绿证据与退化成本提示，而非新方案。
- 首轮 Step5 生产候选（`runtime/core/data-contract.mjs` 的 tracked diff）未改动。

## 下一最小步骤（交给 Codex 决策）

1. 由 Codex 在干净短 Node 进程复跑两个反例（`experiments.mjs` 前两个 test 的同形代码），确认本 R2 声明与实测一致。
2. 若认可方向：把等价改动落到 `runtime/core/data-contract.mjs:63-75`，跑既有 `tests/simulation/canonical-json-equivalence.test.mjs`（`D4P3_BASELINE_SOURCE` 指向本树 `artifacts/oracle`）与 R1 已保存的 Step5 自带测试，确认 9/9 级不回归。
3. 命中 `Object.prototype` 键的退化成本需补一次同形微测（造 `valueOf/toString/constructor` 键名的合法样本）再谈生产落地。
4. 真实 r170 首开测量属中控职责，本轮未做，也不宣称任何真实样本收益。

## 未做 / 受阻

- 未跑真实存档样本（contextReadScope 外路径不读）。
- 未写生产源码、未改原测试、未提交/push、未启动服务、未派子代理、未做 Profiler/长档/视觉。
- 本次运行 `node --test` 未遇 EPERM（与 R1 不同：R1 的 `spawn EPERM` 未复现；`--test-isolation=none` 仍按规则使用）。
