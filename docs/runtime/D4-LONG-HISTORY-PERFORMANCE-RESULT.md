# D4P2-R1｜测量器修正与首次打开 CPU 采样结果回执

- 合同：`d4-long-history-open-profile-r1`（属于 D4P2 需修正后的限定接续）
- 结果分类：**`COMPLETED_CONSISTENT`**（本次采样与诊断测量成功走完，结果一致；开启 Profiler 的诊断样本，**不代表日常性能合格，返村与重开整链仍未运行**）
- 错误归因：`NONE`（测量器已修正，无异常抛出）
- 执行分支：`codex/world-runtime-d4-long-history`
- 基准提交：`5b1c0964da33660fa65c0a9b6f678add8656da1b`（生产基准仍为 `611b3aff1e98150af069478a50e09923f4d5f633`，未修改任何生产代码）
- 执行树：`D:\Narraverse-World-Map-d4-long-history`
- 唯一业务运行：`run-20261015-r1`，命令 `node scripts/measure-d4-long-history.mjs run --run-id run-20261015-r1 --profile`
- Node / 机器：`v24.14.0`；`win32/x64`，`13th Gen Intel(R) Core(TM) i5-13500HX`，`logicalCpus 20`，`memoryGB 15.726432800292969`，hostname `HQnoe`
- 原始证据目录（ignored）：`artifacts/d4-long-history-20261015/run-20261015-r1/`（`manifest.json`、`child-events.ndjson`、`child-result.json`、`parent-result.json`、`protection.json`、`first-open.cpuprofile`、`profile-analysis.json`、`runtime-data/`）
- 探针证据：`artifacts/d4-long-history-20261015/watchdog-probe.json`

---

## R1-1. 测量器（Harness）修正与短探针核验

按照中控首轮复核（`D4P2-REVIEW-20261015.md`）要求，完成三项缺陷修正：
1. **起点 commands 来源**：不再从公开 snapshot 读取私有 commands，改从副本 `service-commit-r170.json` 真实读取并核验 SHA256，核对 `commands.length === 6`、`revision: 170`、`tick: 168`，再与真实 owner 公开投影的 revision/tick 进行交叉比对。
2. **Watchdog 退出确认时限**：父进程采用非阻塞监控循环，在检测到超时发出 `SIGKILL` 终止信号的同时，立即启动最多 5 秒的 `Promise.race` 退出确认。禁止先无界等待 `await finished`。若确认超时报告 `exitUnconfirmed: true`，停止调度，不强删锁。
3. **保护检查与未产生产物解耦**：在 `cmdVerify` 中将“原文件不变”、“7个副本不变”、“锁释放”与“业务产物生成”独立报告。对于 R1 采样模式（不提交返村），预期产物即为 7 副本且无 r182，核验判定为 `PROTECTION_OK`，不再误报为保护失败。
4. **短 watchdog 探针验证**：在业务运行前执行 `watchdog-probe`（不导入 runtime、不读写存档），设定 200ms 总预算与 400ms 退出确认，成功在 205.459ms 检测超时、发送 SIGKILL 并在 8.2ms 内完成有界退出确认，总耗时 213.694ms，`bounded: true`。

---

## R1-2. 业务阶段耗时与状态核对

| 阶段 | 状态 | 耗时 | 预算 | 说明 |
| --- | --- | --- | --- | --- |
| `profiler-setup` | 已完成 | 92.997 ms | — | 独立记录，不计入打开时间 |
| `first-open`（开启 Profiler 诊断样本） | **已完成** | **111303.165 ms** | 120000 ms | 真实打开 r170 完整存档，走完冷校验、重演与初始化 |
| `profiler-stop` | 已完成 | 476.171 ms | — | 停止采样并落盘 `first-open.cpuprofile` |
| `graceful-close` | 已完成 | 2.885 ms | — | 正常关闭，锁已释放 |
| `submit-travel` | **未运行** | — | — | R1 合同明确禁止提交 |
| `reopen` | **未运行** | — | — | R1 合同明确禁止重开 |

- **父进程观测总耗时**：`totalMs = 112169.290 ms`（子进程总预算 180000 ms 内，未超时，watchdog `killed = null`，退出码 `code: 0`）。
- **五公开读取耗时**（打开后测得）：`getSnapshot 0.086ms`、`getPlayer 0.063ms`、`getMindInspector 0.309ms`、`getEncounter 0.056ms`、`getScene 0.021ms`（合计 0.535ms，均为亚毫秒级）。
- **起点状态与五投影签名**：
  - `startState`：`revision 170`、`tick 168`、`commands 6`（全部通过断言）
  - 五投影 `canonicalJson` 签名：`046e7b2ef5da06bf3bf3d54096535601a84d7074e0754233c98d4f4031ec5f07`
- **采样样本说明**：本次 111.3 秒为开启 Node CPU Profiler 的诊断样本，采样存在 CPU 开销（首轮未采样打开为 95.1 秒），不能替代首轮数据或据此计算优化收益。

---

## R1-3. CPU Profile 原始采样与热点调用栈分析

- **采样概况**：
  - 采样文件：`first-open.cpuprofile`（81935 个调用节点，68143 个时间采样）
  - 采样起止时间戳：`startTime 93162158626` 至 `endTime 93273543057` 微秒
  - 采样有效统计时长（$\sum \Delta t$）：**111384.244 ms**（与第一阶段耗时 111303.165ms 高度吻合）

### 1. 最高 Self 耗时（函数自身 CPU 占用，排除子调用）

| 排名 | 函数名与源码位置 | Self 耗时 (ms) | 占采样总时间比例 |
| --- | --- | --- | --- |
| 1 | `put` (`runtime/core/data-contract.mjs:45`) | **31260.753** | **28.07%** |
| 2 | `cloneData` (`runtime/core/data-contract.mjs:49`) | **17490.573** | **15.70%** |
| 3 | `requireCondition` (`runtime/core/data-contract.mjs:10`) | **17423.986** | **15.64%** |
| 4 | `encode` (`runtime/core/data-contract.mjs:72`) | **14518.917** | **13.04%** |
| 5 | `(anonymous)` (`runtime/core/data-contract.mjs:75`) | **8738.621** | **7.85%** |
| 6 | `record` (`runtime/core/data-contract.mjs:13`) | **5053.642** | **4.54%** |
| 7 | `visit` (`runtime/core/experience-state.mjs:30`) | **4750.735** | **4.27%** |
| 8 | `(garbage collector)` (native) | **1558.498** | **1.40%** |
| 9 | `denseArray` (`runtime/core/data-contract.mjs:36`) | **1527.222** | **1.37%** |
| 10 | `own` (`runtime/core/data-contract.mjs:5`) | **1420.910** | **1.28%** |

> **关键发现**：仅 `runtime/core/data-contract.mjs` 中的底层数据合同操作（`put`、`cloneData`、`requireCondition`、`encode`、`record` 等）就占用了 **97433.9 ms** 的 Self CPU 时间，占整个首次打开总耗时的 **87.47%**！

### 2. 关键业务子系统 Inclusive 耗时（调用栈累积时间）

| 业务环节 / 子系统 | Inclusive 耗时 (ms) | 占采样总时间比例 | 分析与归因 |
| --- | --- | --- | --- |
| `performTick` (`command-engine.mjs:44`) | 108312.248 | 97.24% | tick 循环推进驱动所有子系统 |
| `validateBundle` (`world-state.mjs:98`) | 96477.681 | 86.62% | 完整 bundle 结构与历史权威校验 |
| `validateEventLog` (`event-log.mjs:65`) | 95782.306 | 85.99% | 事件日志校验调用历史回放 |
| `hooksValidateHistory` (`encounter-runtime.mjs:1263`) | 95548.224 | 85.78% | **核心瓶颈**：从 tick 0 到 168 的逐 tick 完整事件回放与事实对比 |
| `loadServiceCommit` (`service-commit.mjs:90`) | 93799.994 | 84.21% | 存档提交加载与冷审计 |
| `transitionAuditedServiceCommand` (`service-commit.mjs:29`) | 78853.891 | 70.79% | 6 条历史 service commands 逐条重演 |
| `canonicalJson` (`data-contract.mjs:71`) | 46609.272 | 41.85% | 在 `validateHistory` 对比事实及 `payloadBudget` 中反复调用 |
| `projections` (五投影函数) | 47.709 | 0.04% | 极快，上一轮不可变审计复用在此已完全消除冗余开销 |
| `deepStrictEqual` (深比较) | 3.288 | 0.003% | 几乎无开销 |
| `(garbage collector)` (GC 开销) | 1558.498 | 1.40% | GC 开销很低，非主要瓶颈 |
| `(program / idle)` (闲置) | 47.014 | 0.04% | 无 I/O 等待，属于纯 CPU 密集计算 |

### 3. 调用栈热点根因定位

1. **热点主要路径**：
   `loadServiceCommit` → `validateServiceCommit` → `createAuditedBundle` → `validateBundle` → `validateEventLog` → `validateHistory` (`hooksValidateHistory`)。
2. **为何耗时达 95 秒以上**：
   在 `hooksValidateHistory` 中，为保证零作弊，引擎从 tick 0 起重新执行 `performTick` 推进 168 个 ticks，并在每个 tick 的每条事实断言中执行 `canonicalJson(replay.eventLog[seq]) === canonicalJson(events[seq])`。
3. **`data-contract.mjs` 为何占用 87% CPU**：
   - `canonicalJson(value)` 的实现为 `return encode(cloneData(value))`；
   - 每次调用 `canonicalJson` 时，不仅做 JSON 编码，而且先调用 `cloneData` 做了一次完整的对象深拷贝；
   - `cloneData` 在遍历对象属性时，对每个属性都调用了 `put(result, key, entry)`，而 `put` 使用了 V8 中开销极其高昂的 `Object.defineProperty(value, key, { value, enumerable: true, writable: true, configurable: true })`（单这一项就消耗了 **31.26 秒** 的纯 CPU 时间！）；
   - 在整个 168-tick 重演与数千次事实验证过程中，`Object.defineProperty` 与 `cloneData` 被触发了数百万次。

---

## R1-4. 唯一最小优化候选建议（供中控评审，不实施）

基于实测的 68143 个 CPU 采样证据，提出**至多一项**最小优化候选：

* **优化项**：**消除 `canonicalJson` 中不必要的 `cloneData` 全量对象深拷贝，并优化 `put` 属性赋值开销**。
* **证据支撑**：
  * `put`（31.26s，28.07%）与 `cloneData`（17.49s，15.70%）合计直接消耗了 **48.75 秒**（占总耗时 43.77%）的 Self 时间。
  * `canonicalJson` 内部的 `encode` 函数本身已经递归按键排序（`Object.keys(data).sort()`）遍历并做字符串拼接，在 `encode` 之前调用 `cloneData(value)` 属于完全重复的多余内存分配与 `Object.defineProperty` 遍历。
* **边界与合同保全**：
  * **权威一致性**：`canonicalJson` 的输出字符串规范（键按字母排序、紧凑格式）完全保持不变，对外部不可变 bundle、journal、签名以及事实等值比较 100% 保持完全相同的字节输出。
  * **外部审计与重演**：不跳过任何外部 `validateBundle` 或 `hooksValidateHistory` 168-tick 的逐条回执重演与全量业务规则检查。
  * **磁盘发布与隔离**：不改写任何存档格式、模式、文件发布流程或 profile 边界，旧 profile 与非 scene 规则完全隔离。

---

## R1-5. 保护状态与未运行项

- **原文件保护**：原始参考存档 8 个文件全部逐字节未变（SHA256 全部匹配）。
- **运行目录保护**：`run-20261015-r1` 仅包含 7 个合法副本文件，逐字节等于原始存档；未生成 `service-commit-r182.json`（符合诊断采样未提交返村的预期）。
- **进程与锁状态**：子进程已以 `code 0` 正常退出，运行目录内无残留 `.runtime-owner.lock`，无残留进程。
- **未运行项**：
  * 未执行 `submit-travel`（返村命令提交）
  * 未执行 `reopen`（关闭重开对比）
  * 未执行新 r182 完整结果比较
  * 未执行任何日常体验服务或浏览器端流程
- **结论**：本 R1 工单仅达成“测量器缺陷修正”与“首次打开 CPU 采样定位”，**D4P2 原返村/重开整链仍未完成，D 阶段整体仍进行中**。

---

# --- 历史首轮记录（2026-10-15 首轮交付，保留备查） ---

# D4P2｜长历史存档性能定向验证 结果回执

- 合同：`d4-long-history-performance-v1`
- 结果分类：**`FUNCTIONAL_MISMATCH`**（测量未走完；不一致发生在**测量脚本自身**，不是世界状态；世界状态本轮未进入完整比对）
- 执行分支：`codex/world-runtime-d4-long-history`
- 基准 HEAD：`611b3aff1e98150af069478a50e09923f4d5f633`（= 生产基准，未偏离）
- 执行树：`D:\Narraverse-World-Map-d4-long-history`
- 唯一业务运行：`run-20261015-01`，命令 `node scripts/measure-d4-long-history.mjs run --run-id run-20261015-01`
- Node / 机器：`v24.14.0`；`win32/x64`，`13th Gen Intel(R) Core(TM) i5-13500HX`，`logicalCpus 20`，`memoryGB 15.726432800292969`，hostname `HQnoe`
- 原始证据目录（ignored）：`artifacts/d4-long-history-20261015/run-20261015-01/`（`child-events.ndjson`、`child-result.json`、`parent-result.json`、`protection.json`、`manifest.json`、`child-stdio.log`、`runtime-data/`）

## 1. 阶段耗时（已跑 / 未跑 / 超时 分开）

| 阶段 | 状态 | 耗时 | 预算 | 说明 |
| --- | --- | --- | --- | --- |
| `first-open` | **已跑、已完成** | **95147.747 ms** | 120000 ms | 有 `stage-begin` 与 `stage-end` 消息，耗时可信 |
| `submit-travel`（唯一返村命令） | **未运行** | — | 120000 ms | 脚本在进入该阶段前中止 |
| `graceful-close` + `reopen` | **未运行** | — | 120000 ms | 同上 |

- 父进程观测总耗时 `totalMs = 95352.916 ms`（预算 420000 ms，未触发总时限）。
- **无超时**：`killed = null`；子进程自行以 `code 1` 退出，父进程 watchdog 未介入。
- 五个公开读取耗时（均在打开完成后测得，均为亚毫秒）：`getSnapshot 0.075`、`getPlayer 0.049`、`getMindInspector 0.254`、`getEncounter 0.047`、`getScene 0.022`（ms）。

**关键结论：单是「第一次打开」就用了 95.1 秒，占该阶段 120 秒预算的 79.3%。** 返村提交与重开尚未测得，按既有源码结构二者均会各触发一次同量级的全量校验+重演，不能据此推断已在预算内。

## 2. 失败原因（测量脚本缺陷，已定位到行）

子进程异常，`child-result.json`：

```
TypeError: Cannot read properties of undefined (reading 'length')
    at cmdChild (file:///D:/Narraverse-World-Map-d4-long-history/scripts/measure-d4-long-history.mjs:232:123)
    at async file:///D:/Narraverse-World-Map-d4-long-history/scripts/measure-d4-long-history.mjs:451:33
```

`scripts/measure-d4-long-history.mjs:232`：

```js
result.startState = { revision: start.snapshot.revision, tick: start.snapshot.tick, commands: start.snapshot.commands.length };
```

`getSnapshot()` 返回的是公开投影，其字段由 `runtime/service/http-contract.mjs:298` 的 `projectPublicSnapshot` 决定，**只含** `apiVersion, simulationId, revision, tick, clock, market, population, actors`——**没有 `commands`**。命令数必须取自 service commit 文件（r170 实测 `commands.length === 6`），不能从公开投影读取。

因此 `checks` 数组为空：脚本在第 233 行首个 `check()` 之前就中止，`startState` 未记录。**这是脚本字段误用，不是存档损坏或世界状态不一致。**

## 3. 完整比对签名

**未产生。** 返村提交未运行，故没有新 r182，也就没有 `canonicalJson` 等值比较与比对签名。**不得**把本回执读作任何一致性通过。

运行目录实测状态：
- `runtime-data/` 仅含 7 个副本文件，**无 `service-commit-r182.json`**（`produced = null`，符合「未提交」）。
- 运行目录内**无锁文件**；子进程 `lockAfterErrorClose: true`，即异常路径已正常 `close()` 并释放锁。
- 五投影在打开后已生成（读取均成功、亚毫秒），但未与参考做完整比对。

## 4. 原文件保护与退出状态

`protection.json`：`verdict = "PROTECTION_ISSUE"`，`originalArchiveUnchanged = true`。

- 原始存档 8 个文件全部逐字节未变（`archive[].match` 全部 `true`，含 r182 参考文件 `d2a1ed27…88a3f972c`）。`PROTECTION_ISSUE` 仅因「预期产出的 r182 不存在」——与第 3 节一致，非原文件被改。
- 运行目录 7 个副本逐字节等于来源（`copies[].srcSha256 === copySha256`，全部一致）：r0 `82290`、r1 `85039`、r145 `117495`、r157 `122259`、r158 `125381`、r164 `128313`、r170 `131239` 字节。
- r182 参考文件**未复制进运行目录**（`referenceOnlyNotCopied = "service-commit-r182.json"`）。
- 子进程已退出（`childExit = {code:1, signal:null}`）；本任务无残留进程、无残留锁。
- 未触碰其他 Node/服务，未强删锁，未重测。

## 5. 冻结输入与源码指纹

- 固定 DTO（逐字段取自参考终点 `commands.at(-1).dto`）：
  `{"commandId":"0d851472-c18d-4060-95a2-476d903130a7","expectedRevision":170,"payload":{"destination":"village"},"type":"PlayerTravel","version":3}`
- 起点/终点期望：起点 `revision 170 / tick 168 / commands 6`；参考终点 `revision 182 / tick 180 / commands 7`。
- 生产源码指纹（执行树内实测，与上一轮冻结值一致）：
  - `runtime/service/runtime-owner.mjs` `4e539f2aa9d9ad768916a934c968e11836fdf49e805e94f52c931b27e5bb8221`
  - `runtime/service/service-commit.mjs` `0499eae6ca934b3e1745606f6b2ea966a6e8f7554113535b863c4c757cea931f`
  - `runtime/core/world-state.mjs` `491bd7b0efb1eb763eef0e25ec421e938fa4a59e968b373d4b57c46cbedc23ec`
  - `runtime/service/http-contract.mjs` `e7cc09b8186e4f52e8eb3768ceb756bd41afa63bc0485a7153567ac9e8a392e8`
  - `runtime/core/data-contract.mjs` `c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f`
- 测量脚本指纹：`scripts/measure-d4-long-history.mjs` = `25f6e2679b6b927a6b19ca47dae2f4169d337864a4f0cd5747b037ebfc49997f`（458 行，Node 内置模块，父进程 watchdog 独立执行硬时限）。
- 执行树 dirty：`?? scripts/`（本轮新增脚本；未提交）。

## 6. 最小瓶颈定位建议（静态只读分析，供中控另发有界任务）

第一次打开的 95.1 秒发生在 `createRuntimeOwner` 的既有加载路径内，链路为 `runtime/service/runtime-owner.mjs:97` → `loadServiceCommit` → `service-commit.mjs:62` `validateServiceCommit`。对 format 9，该函数在**每次**加载时执行：

- `service-commit.mjs:69-70` 对 `anchor` 与 `bundle` 各调一次 `createAuditedBundle`。二者来自 `JSON.parse`，**不在** `world-state.mjs:31` 的 `auditedSceneBundles` WeakMap 里，故各自触发一次 `freezeData(cloneBundle(bundle))` + 完整 `validateBundle`。
- `service-commit.mjs:71-73` 对 anchor/final 各投影 public/encounter/scene（共 6 次）。这些投影内部的 `validateBundle` 能命中上述缓存而提前返回——**上一轮的审计复用优化在此处生效**，但缓存**不覆盖**第 69-70 行的两次冷校验。
- `service-commit.mjs:74-84` 逐条重演 6 条命令（每条 `transitionAuditedServiceCommand` 全量执行），逐条 `isDeepStrictEqual(entry.receipt, next.receipt)`，最后对整个 bundle 再做一次 `isDeepStrictEqual(replay, envelope.bundle)`。

存档体量（r170，130791 字节）：`anchor 40907` + `bundle 85430`；`eventLog 22` 条共 `26705` 字节；`world` 13 个子模型，最大 `societyModel 18886`、`memoryModel 10044`、`motivationModel 7060` 字节。

**⇒ 下一步最省的做法是先分段插桩这 95.1 秒**（冷校验 / 6 次投影 / 6 次命令重演 / 最终深比较各占多少），再针对占比最大的一段做有界优化；在拿到分段数据前不宜直接改校验或缓存策略。

## 7. 停止状态与未运行项

- 按任务书 §4「一旦真实业务阶段开始，就不自动重试」：**未自动重测**，未修改 `runtime/`、页面、fixture、存档格式、既有测试、预算或校验规则，未新增依赖，未启动体验服务。
- 未运行：`submit-travel` 阶段、`graceful-close`、`reopen`、五投影完整比对、r182 `canonicalJson` 等值比较、比对签名。
- 本轮为**测量回执**，不自报已验收。分类 `FUNCTIONAL_MISMATCH` 的成因是脚本字段误用；修复该项并重新授权后可再发一次有界测量。
