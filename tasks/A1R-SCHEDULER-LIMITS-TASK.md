# A1R 修正任务书：调度结果预算与严格输入校验

发布时间：2026-10-07 11:27（Asia/Shanghai）。
状态以 [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) 为准；本文件同时保存 A1 的独立验收结论与修正合同。

## 1. 中控验收结论：NEED REVISION

验收目标与实际源码均为 `eee6cb8c47ef1ca315198f9a34317baf73c4e728`，分支 `codex/world-runtime-a1`，交付时工作区干净。实际共同基准为 `14293bab9572f3847f1732a09d49df5370be5598`；交付只修改 A1 约定的三个模块、两份测试与状态文件。

环境：Windows / Node v24.14.0。中控本次独立复跑：

- A1 定向测试：23/23 通过。
- 独立化边界回归：3/3 通过。
- 交付差异的 `git diff --check` 通过。
- 新增边界探针发现下面三项缺口，因而不能仅按原有测试数量判定通过。

允许保留的实现选择：调度跨度上限 144000 与架构保护预算一致；时辰采用子时 23:00～00:59 的明确约定；scheduler 引入同目录的时钟常量合理。以上不构成阻塞。

未执行浏览器、模型、Laya 桥或磁盘存档测试；它们不在 A1 范围。未修改候选代码、未合并候选分支到 main，A2 不发布。

## 2. 必须修正的发现

### F1 / P1：时间跨度保护未限制结果总量

`scheduler.mjs` 在第 263～274 行逐任务展开所有到期项，既未检查总结果数，也在结果展开后才检查下一到期点溢出。

32 个合法任务，`nextDueTick=1 / intervalTicks=1 / priority=0`，推进到合法上限 144000，会产生 `32 × 144000 = 4608000` 条到期记录。中控在 64 MiB 堆的独立子进程复现：退出状态 134，`Reached heap limit / JavaScript heap out of memory`，没有返回可处理的 `LIMIT_EXCEEDED`。

这证明不存在展开量预算和提前拒绝；受限堆结果不表示已验证普通 4 GiB 堆必然失败。原先的跨度保护减少了单任务数量，但不能控制多任务乘积。

修正合同：

- 调度队列最多 100000 项，与架构任务预算一致；单次 `dueTasks` 最多 1000000 项。导出常量并在注释注明它们是保护限额，不是性能承诺。
- 在分配到期结果前，预检所有任务的触发次数、下一到期点、安全整数运算与累计结果预算；超限抛 `LIMIT_EXCEEDED`，不修改输入，不截断、不隐式分批或丢任务。
- 次数累计采用防溢出比较；先判断是否超预算，再相加。下一到期点溢出也必须在展开前拒绝。
- 合法的小输入维持既有排序、恢复和分块一致性；调用方可显式缩小推进跨度，不由调度器暗改请求。

### F2 / P2：稀疏数组跳过描述符校验

`buildSchedulerState()` 使用 `rawTasks.map()`，会跳过数组空洞：

```js
createScheduler({ tasks: Array(1) }, new Set(['s']));
// 当前接受，返回 tasks 含空洞；JSON 序列化成为 [null]。
```

工厂产生的状态随后不能正常恢复或推进。修正为密集数组校验，create/restore/advance 都拒绝空洞、null、undefined 描述符并返回 `INVALID_INPUT`；禁止过滤掉坏元素后继续。合法空数组仍接受。

### F3 / P2：普通对象校验接受异类对象并静默使用缺省值

```js
createClock(new Date()); // 当前接受，静默创建 tick 0。
```

clock 的选项声明为普通对象，scheduler 的 `isPlainObject()` 也仅排除了 null/数组。修正为显式数据对象判定：原型为 `Object.prototype` 或 null 的记录可接受；Date、Map、Set、类实例不得当作选项、恢复记录或任务描述符。系统注册集合中明确允许的 Set/数组继续支持，对象形式注册表同样必须是普通记录。

检查 RNG 恢复记录、Clock 选项/恢复记录、Scheduler 选项/恢复记录/描述符；保留字段白名单。不要为了修正增加通用 schema 框架或第三方依赖。

## 3. 执行范围与基准

继续在 `D:\Narraverse-World-Map @ codex/world-runtime-a1` 修正，以 `eee6cb8` 为代码基准。先检查真实 HEAD、origin、脏改动与归属；若已有新提交，报告差异后按实际基准工作，不重置覆盖。

修正合同与最新文档位于 main；只读取得本任务书和最新状态，不把 main 的状态文件整份覆盖回候选分支。其他会话更新的 E 阶段研究文档必须保留。

允许修改：

- `runtime/core/scheduler.mjs`
- `runtime/core/simulation-clock.mjs`
- `runtime/core/rng.mjs`（仅恢复记录的普通对象校验）
- `tests/simulation/clock-scheduler.test.mjs`
- `tests/simulation/rng.test.mjs`
- `PROJECT_CONTEXT.md`（只写 A1R 执行者交付待复验与真实证据）

不得开始 A2、修改旧页面/根目录状态桥/服务、加入依赖、迁移存档、运行付费模型或 Laya 桥。中控验收文档位于 `D:\Narraverse-World-Map-control`，执行者不得覆盖该工作树。

## 4. 新增回归与复验要求

1. 32 任务 × 144000 tick 在 64 MiB 堆子进程内提前得到 `LIMIT_EXCEEDED`，正常结束，不 OOM、不超时；使用有超时的独立子进程，不能在测试主进程反复制造 OOM。
2. 超出任务项上限拒绝；总展开数量超限拒绝；合法小批量仍逐项完整输出。输入冻结时也不得出现部分更新。
3. 下一到期点溢出在展开前拒绝，不能先创建大结果数组再失败。
4. sparse/null/undefined 描述符，在 create/restore/advance 三个入口拒绝；空数组和合法密集数组通过。
5. Date/Map/Set/类实例拒绝作为记录；正常对象与 null 原型记录按字段合同处理，系统 Set 注册不误拒绝。
6. 原有 23 项行为与 3 项独立化边界回归仍通过；原 RNG 向量、时辰、排序和分块语义保持一致。

可用的关键复验形状：

```js
const tasks = Array.from({ length: 32 }, (_, i) => ({
  taskId: 't' + i, systemId: 's', nextDueTick: 1,
  intervalTicks: 1, priority: 0,
}));
// 受限子进程内必须可处理地拒绝，不生成 4608000 个结果对象。
advanceScheduler(createScheduler({ tasks }, new Set(['s'])), 144000, new Set(['s']));
```

验证命令：

```powershell
node --test tests/simulation/rng.test.mjs tests/simulation/clock-scheduler.test.mjs
node --test tests/export-boundaries.test.mjs
git diff --check
git status --short --branch
```

精确提交并推送 `codex/world-runtime-a1`，不要合并或推 main。回执使用原 [A1 任务书](A1-DETERMINISTIC-CLOCK-TASK.md) 格式，并逐项列出 F1/F2/F3 的修复与反例证据。完成后等待中控复验；原阶段 A 仍未完成。
