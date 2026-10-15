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
