# R2 proposal — hy4-preview-f（回应 round1-comparison.md 拒收反馈）

- 时间：R2 短试验（目标 5 分钟）。路由 `workbuddy-global/hy4-preview-f`（high）；实际路由不可观测部分 unknown。
- 树：`free-perf-trials/hy4`，分支 `codex/world-runtime-d4-free-hy4`。本轮**只写** `artifacts/free-model-optimization/r2/`；生产源码、原测试、旧证据未改。
- 本轮 git 状态：`runtime/core/data-contract.mjs` = `a982322ad6198235a8aee380c255802e0c6b67f146554186cf04ef80d29b2528`（R1 拒收实验存档 `f8128f0`，**未改动**）；两个未跟踪规则/任务文件字节不变。

## 参照（不自作 oracle）

- 行为/性能参照（只读冻结基线）：`free-perf-trials/hy4/artifacts/oracle/runtime/core/data-contract.mjs`，实测 SHA256 `c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f`（= git 基准 `2936233426e990857f3c88a39ad58623832419fd`，= 测试内 `EXPECTED_BASELINE_SHA`）。
- 原型复用 oracle 导出的 `record` / `denseArray` / `put` / `MAX_EVENTS`，四个变体**只在记录复制步骤**上不同。

## 拒收原因复盘与定位

`round1-comparison.md:34` 的反例成立：`record()` 只校验**输入自身**的描述符与原型身份，并不保证 `Object.prototype` 上没有其它 setter / 只读键。我的 R1 只特殊处理字面 `'__proto__'`，因此：
- 运行时给 `Object.prototype` 加普通 setter 键 → 赋值调用 setter（calls=1）且**丢失自有属性**（own=false）；
- 改为只读键 → 直接抛 TypeError，而原实现仍成功。

本轮实测复现了这一条（见 `raw-output.txt` Part 1，V0 安全、V1 两项均失败）。这是 R1 的真实缺陷，不是中控误判。

## R2 方案（不同机制，非复用 DeepSeek）

**机制**：把记录分支的逐键 `put()`（= `Object.defineProperty`）换成 —— 先构造排好序的 `[key, value]` 数组，再用 **`Object.fromEntries`** 一次性创建对象。

依据（ECMA-262）：`Object.fromEntries` 对每个条目执行 **CreateDataPropertyOrThrow**，是**定义语义**（define own property），不查原型链上的 setter、不受继承只读属性影响，对**任意键名**成立 —— 包括 `__proto__`、`constructor`，以及运行时新增到 `Object.prototype` 的任意键。因此不需要枚举"哪些键危险"，从机制上就没有该缺陷。

它与 DeepSeek 方案**不是同一机制**：DeepSeek 是"先判断键是否危险，安全键走赋值"（白/黑名单式守卫，正确性依赖守卫集合的完整性与求值时机）；本方案是"一律走定义语义，由 `fromEntries` 保证"，没有需要维护的键集合，也不依赖 `Object.prototype` 的快照。归类：**独立新优化（非复用）**；同时它是对 R1 缺陷的**返修**（同一函数同一分支）。

### 若落到生产，最小 diff（示意，本轮**未实施**）

位置：`free-perf-trials/hy4/runtime/core/data-contract.mjs:64-71`（`cloneData` 记录分支）

```js
-    for (const key of Object.keys(value).sort()) {
-      const entry = cloneData(value[key], ancestors, depth + 1);
-      if (key === '__proto__') put(result, key, entry); else result[key] = entry;
-    }
+    const sortedKeys = Object.keys(value).sort();
+    const entries = new Array(sortedKeys.length);
+    for (let i = 0; i < sortedKeys.length; i++) {
+      entries[i] = [sortedKeys[i], cloneData(value[sortedKeys[i]], ancestors, depth + 1)];
+    }
+    return Object.fromEntries(entries);   // CreateDataPropertyOrThrow per entry
```

## 实测结果（本机、本沙箱，3 次 20 秒内命令）

| 命令 | 次数 | 结果 |
| --- | --- | --- |
| `node experiment.mjs` | 第 1 次 | 失败：`ERR_MODULE_NOT_FOUND`（oracle 相对路径写错，已修） |
| `node experiment.mjs` | 第 2 次 | 成功，完整四部分输出 → `raw-output.txt` |
| `node guard-timing-check.mjs` | 第 3 次 | 成功，守卫时机对照 |

**Part 1（R1 拒收反例复现，Object.prototype 被运行时污染）**

| 变体 | setter 键 | 继承只读键 |
| --- | --- | --- |
| V0 baseline（defineProperty） | calls=0, own=true, value="x" | own=true, value="x" |
| V1 R1（字面 `__proto__`）**拒收** | **calls=1, own=false, value=undefined** | **threw TypeError: Cannot assign to read only property 'locked'** |
| V2 DeepSeek 式（模块加载期缓存守卫集） | **calls=1, own=false** | **threw TypeError** |
| **V3 R2 `Object.fromEntries`** | **calls=0, own=true, value="x"** | **own=true, value="x"** |

**Part 2（9 个合法样本 vs V0）**：V1/V2/V3 全部 `MATCH`（canonicalJson、返回原型、`Reflect.ownKeys` 全量描述符含 writable/enumerable/configurable/hasValue 一致；含自有 `__proto__`、`constructor`、null 原型、整数样键、DAG、深 40、嵌套数组）。

**Part 3（14 个非法输入 vs V0）**：V1/V2/V3 全部 `PARITY`（错误码与 message 逐条一致；含 undefined/symbol/bigint/NaN/±Infinity/循环/稀疏/数组额外属性/符号键/非枚举/class 原型/深度 66/访问器）。**getter 调用总数 0**。

**Part 4（合成 clone-only 微测量，30 记录 × 12 键 × 3 层 × 200 次，仅假设、非产品性能结论）**

| 变体 | 200 次总耗时 | 均值 |
| --- | --- | --- |
| V0 baseline | 874.40ms | 4.3720ms |
| V1 R1 赋值 | 306.08ms | 1.5304ms |
| V2 DeepSeek 式 | 316.21ms | 1.5810ms |
| **V3 R2 fromEntries** | **421.01ms** | **2.1050ms** |

即：V3 相对 V0 约 **2.08×**（合成样本）；但**比 V1/V2 慢约 37%**（多一次 entries 数组分配 + 每键一个二元组）。V3 是用一部分速度换"不依赖键黑名单/快照"的健壮性。真实收益未知，归 Codex 测量。

**重要附带发现（run 3，`guard-timing-check.mjs`）**：DeepSeek 式守卫**若在每次调用时求值**（`Object.hasOwn(Object.prototype, key)`）而不是在模块加载期缓存键集合，则同样通过这两个反例（calls=0, own=true, value="x"；只读键 own=true, value="x"）。所以在我的实验中 V2 失败**源于守卫集合在模块加载期被快照**，而非该思路本身不可行。这点请 Codex 复核 DeepSeek 实际落地代码的求值时机 —— 若它是动态求值，则 R1 比较里"V2 也失败"的复现条件与真实候选不同，不应据此否定 DeepSeek 候选。

## 与 DeepSeek 现有方案是否相同

**不相同**（机制层面）：DeepSeek = 键守卫 + 赋值；本方案 = 无守卫，`Object.fromEntries` 统一定义语义。效果层面在合法样本上等价（Part 2/3 全一致），差异只在 `Object.prototype` 被污染时的鲁棒性与微测量速度。按合同要求明确归类：**独立新优化 + 对自身 R1 缺陷的返修**，不自称与 DeepSeek 无关也不冒充其方案。

## 风险

1. `Object.fromEntries` 会**多分配**一个长度 N 的数组和 N 个二元组，内存/GC 压力高于 V1/V2；超大记录（接近 MAX_EVENTS/MAX_COLLECTION）的峰值内存未测。
2. 结果对象由 `fromEntries` 用 `{}` 创建，原型恒为 `Object.prototype` —— 与 V0 `result = {}` 一致（Part 2 已核对含 null 原型输入也一致，因为 `cloneData` 恒返回普通对象），但若将来要求返回 null 原型则不适用。
3. 我未在真实存档样本上跑过 V3（本轮只允许 synthetic + 边界）；8 份真实存档字节一致性、真实投影、持久化拒绝语义**均未验**。
4. 微测量在受限沙箱内、单进程、未预热充分，且是 clone-only；**不能**推断 r170 首次打开的真实收益。
5. `Object.fromEntries` 对 `Symbol` 键可用，但本路径键来自 `Object.keys()`（仅字符串），无影响。

## 最小下一步（交 Codex，需解除 spawn 限制的环境）

1. 先复核 DeepSeek 候选守卫的求值时机（上述 run 3 发现），判断 R1 比较里 V2 的复现条件是否成立。
2. 若采纳 V3，把上面示意 diff 落到 `runtime/core/data-contract.mjs:64-71`，然后：
   ```
   cd D:\Narraverse-World-Map\free-perf-trials\hy4
   set D4P3_BASELINE_SOURCE=D:\Narraverse-World-Map\free-perf-trials\hy4\artifacts\oracle
   node --test tests/simulation/canonical-json-equivalence.test.mjs
   ```
3. 新增/复用定向反例：把 Part 1 的两个 `Object.prototype` 污染用例（setter 键 + 继承只读键）加入 `tests/simulation/free-model-optimization.test.mjs`，`finally` 清理。
4. 语义通过后，按母合同做至多一次不带 Profiler 的 r170 首次打开测量（120s 阶段 / 150s 总时限），与 DeepSeek 的 47377.2192ms 同机顺序对比。

本轮**未实施**生产修改（R2 只允许写 r2 目录）；是否采纳由 Codex 决定。
