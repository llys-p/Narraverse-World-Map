# D4P4 R2｜hy3 候选 proposal（复用 DeepSeek 方案）

路由（请求）：workbuddy-global/hy3 (high)；实际路由不可观测，记 unknown。
合同：d4-dsh-free-model-optimization-v1。分配树：free-perf-trials/hy3。
本目录只读来源：artifacts/oracle（pre-D4P3 基线，SHA `c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f`）。
生产源码 SHA：`98b645381f611302019ad5b8931df5b1149b23ea2d1ca0213fe10706cb05a370`（= 基准 2936233，R1 零 diff）。
分类：**复用 (reuse)** —— 方案与 DeepSeek R1 候选本质相同，不自称独立新优化。

## 机制与路径/行号
目标：加速 `cloneData` 的记录分支（逐键写入），保留全部语义。
- 生产文件 `runtime/core/data-contract.mjs` 记录分支：`cloneData` 第 63–66 行
  `record(value); result = {}; for (const key of Object.keys(value).sort()) put(result, key, cloneData(value[key], ...));`
- 候选：在循环体内对每键判断 `own(Object.prototype, key)`：
  - 冲突键（即 `Object.prototype` 的自有属性，如 `__proto__`、`constructor`、`toString` 等，含运行时注入的继承 setter/只读键）→ 仍用原 `put`（defineProperty），不触发继承 setter、不抛只读 TypeError；
  - 非冲突普通键 → `result[key] = cloned` 直接赋值（跳过每键 4-参数 defineProperty 开销）。
- 支持数据、返回原型（`Object.prototype`）/属性描述符、规范字符串、错误码/预算、getter/setter 不执行均保持不变。`put`/`record`/校验/存档版本/磁盘提交点/历史审计调用次数不改动。

## 收益假设
- 大量普通记录的逐键写入从 `Object.defineProperty` 降级为普通赋值，预计减少每次属性定义的元数据开销；直接对标 DeepSeek R1 的同类改动（其 r170 首次打开 47377ms vs 历史 61851ms，约 -23.4%，但非同时成对实验、非 p95/规模保证）。
- 属假设，非本会话实测；本会话仅在合法样本+直接边界做正确性核验。

## 实测命令 / 次数 / 毫秒 / 正确性
- 命令（同进程，Node v24.14.0，无 test-runner spawn）：
  `node free-perf-trials/hy3/artifacts/free-model-optimization/r2/experiment.mjs`
- 次数：3 次短验证（第 1 次脚本用例 #2 把只读描述符误写成访问器 -> 17 pass/1 fail；第 2 次改为真实继承碰撞用例 -> 18 pass/0 fail；第 3 次按复核要求把 #2 改成真正的「只读继承 DATA 属性」`{value, writable:false}` -> 18 pass/0 fail，并附一次短微基准）。
- 毫秒：第 3 次总耗时 6612.1ms（含 1 次 20 万次迭代微基准 ~6500ms）；纯正确性断言部分 <100ms。
- 正确性结果（18/18 PASS，0 skip，最终第 3 次）：
  1. 继承 SETTER 碰撞键：setter 调用 0 次，结果保留自有数据属性（setterKey===7）。
  2. **只读继承 DATA 属性**碰撞键（`Object.prototype.roKey = {value:0, writable:false}`）：候选与基线均成功并保留自有数据属性（roKey===9），而 Hy4/Step5 的纯赋值变体在此抛 TypeError —— 即 R1 拒收的确切原因，本方案覆盖。
  3. 自有 `__proto__` 数据属性保留、原型不为 null（`Object.getPrototypeOf(out)===Object.prototype`）。
  4. 4 组合法样本：canonical 字符串与基线一致；克隆副本独立（改候选不影响基线）；返回原型为 `Object.prototype`。
  5. 含 getter 的记录：抛错且 getter 执行 0 次。
  6. 循环 / 非有限值：仍抛错（错误码/语义不变）。
- 微基准（非性能结论，单次、依赖宿主）：20 万次宽记录（50 普通键）克隆，baseline 全 defineProperty = 4655.7ms，候选快路径 = 1878.7ms。属 hosts-dependent 单点样本，不做 p95/规模宣称；仅说明快路径方向性收益假设有本地量级支撑。**收益列为：未测（非权威结论）**，须中控独立核验。
- 验证局限：仅 cloneData 路径；canonicalJson/encodeCanonical、payloadBudget、commandInput 未重测（与候选无关，且原 canonical-json-equivalence 在 EPERM 下仍由 Codex 复跑）。

## 与原候选区别 / 类别
- 与 DeepSeek R1 候选（SHA `10a2180441fcc9509a6ddd561ac97679f279aa9f`）：机制相同（cloneData 记录分支、冲突键走原 put、其余普通赋值），**归类为复用**，不重复申为新方案。
- 与 Hy4/Step5（已拒收，源存档 `f8128f0f…` / `72268596…`）：它们只特殊处 `__proto__` 字面量，未覆盖其它 `Object.prototype` 继承 setter/只读键 → 在继承属性反例上失败。本候选用 `own(Object.prototype,key)` 覆盖全部冲突键，故通过。

## 风险
- 低：候选仅新增每键一次 `own(Object.prototype,key)` 布尔判断 + 分支；不改变输出字节、原型、描述符或错误语义。18/18 边界核验通过（含继承 setter、只读继承 DATA 属性、自有 `__proto__`）。
- 未独立性能实测结论：微基准仅单点 host-dependent 样本，收益列为「未测/假设」，须由中控在通过语义门后做最少持久化拒绝/完整结果核验再采纳（按 R1 收口规则，不自动替换 2936233）。
- 不宣称这是「唯一安全优化」：证据仅支持本方案（DeepSeek 同类复用）在此代码与边界集上安全；不否定其它可能方案，亦未验证其它方案。
- 路由/账单不可观测（unknown）；未付费回退/购买/账号操作，未提交/push/部署/子代理/服务/长档/视觉/全量。

## 最小下一步
1. 中控在可执行 `node --test` 的环境复跑原 `tests/simulation/canonical-json-equivalence.test.mjs`（`D4P3_BASELINE_SOURCE` 指向本树 `artifacts/oracle`、带 `D4P3_REFERENCE_RUNTIME_DATA`），确认本树生产源码（=2936233）零 diff 且全部用例通过。
2. 若决定将本复用方案落地生产，仅改 `runtime/core/data-contract.mjs` 第 63–66 行记录分支；落地后须重跑同上 canonical 测试 + 直接持久化拒绝/完整结果最少核验。
3. 本 R2 已落盘：原型 `prototype-cloneData.mjs`、短脚本 `experiment.mjs`、本 `proposal.md`；生产/原测试/旧证据未改动。

## 参照 / 证据索引
- 基线 oracle SHA：`c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f`（与 canonical-json-equivalence 期望一致）。
- 本树生产 SHA：`98b645381f611302019ad5b8931df5b1149b23ea2d1ca0213fe10706cb05a370`（=2936233）。
- R1 比较：`artifacts/context/round1-comparison.md`（DeepSeek 复用源、`10a21804…`；Hy4/Step5 拒收反例）。
- 公共研究（可选，附 URL）：V8 中 `Object.defineProperty` 比普通赋值更重（属性描述符元数据与隐藏类副作用），普通键批量赋值通常更快；此为非权威直觉，不作为正确性依据。
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
