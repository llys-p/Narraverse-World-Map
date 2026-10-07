# A1 任务书：确定性随机数、模拟时钟与调度器

发布时间：2026-10-07 10:04（Asia/Shanghai）。
任务状态：已备好，待用户转发；尚未开工或验收。实际进度见 [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)。

## 1. 交给执行者的任务

你只执行 A1，为后续运行时提供独立于页面的确定性时间基础。使用纯 JS `.mjs` 和 Node 内置模块，按 [架构计划 §4、§6](../WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md) 实现并验证 RNG、SimulationClock、Scheduler。完成后提交证据回执给用户，由中控独立验收；不要继续 A2。

## 2. 仓库、基准与开工

- 仓库：`llys-p/Narraverse-World-Map`，保持私有。
- 本机源码：`D:\Narraverse-World-Map`；其他电脑可使用自己的明确克隆路径，但必须核对 origin。
- 已核实代码基准：`c1c37be552efa7d5bfed3bb35c957bdb95a10588`，此时只有原型和文档，没有新 runtime 实现。
- 本任务书随后作为文档提交发布。开工从包含本任务书的最新 main 创建 `codex/world-runtime-a1`；回执记录实际基准完整 SHA。若已有同名分支，先核对归属和差异，不重置或覆盖。
- 中控发布前本地工作区无既有脏改动；执行者仍必须重新核对，不能把这条历史事实当当前保证。

先读仓库 `AGENTS.md`、`PROJECT_CONTEXT.md`、README 独立项目入口与架构 §4～6，运行 `git status --short --branch`、`git log -3 --oneline`、`git remote -v`、`node --version`。不要读取 `.env` 或其他项目凭据。

若 main 出现新的实现或当前工作区有重叠改动，报告差异并协调精确范围，不覆盖、不 stash、不 reset。无关脏改动保留。

## 3. 允许修改范围

1. `runtime/core/rng.mjs`
2. `runtime/core/simulation-clock.mjs`
3. `runtime/core/scheduler.mjs`
4. `tests/simulation/rng.test.mjs`
5. `tests/simulation/clock-scheduler.test.mjs`
6. `PROJECT_CONTEXT.md`：只将 A1 更新为“执行者已交付，待中控验收”，列出实际检查与下一步。

接口说明直接写在以上模块的导出注释和回执，不另建进度文档。确实需要额外核心文件或改变已定合同，先提出具体理由和影响，不自行扩大范围。

禁止改旧 HTML/JS 页面、根目录 world-state.js、server.cjs、package 配置或其他仓库；不加入第三方依赖、生态/经济、命令引擎、Snapshot、磁盘存档、runner、AI、网络或真实存档迁移。架构 §4 的整 tick 业务事务在 A2 完成，A1 不为它提前造空系统。

## 4. 必须实现的合同

### RNG

- 固定 `mulberry32-v1`，seed 接受 0 到 4294967295 的整数；拒绝隐式类型转换、负数、小数、NaN、Infinity 与越界值。
- 输出范围为 `[0, 1)`；同 seed 输出逐项一致；状态可导出为 `{ algorithm, seed, state }`，加载恢复当前位置。
- 拒绝未知算法、缺失/额外字段、非法 state；不能把零 seed 当作缺省值，不能加载时重新从 seed 开始。
- 明确 uint32 溢出语义。在测试中固定已知向量，并注明算法来源及向量独立核算方式；不能只把当前实现输出复制成“期望值”。

### SimulationClock

- `tick` 从 0 起，`tickMinutes` 固定 10，一天 144 tick；提供显式 `advanceTicks(n)` 语义及状态读取/恢复能力。
- 0 tick 推进无变化；跨天正确；拒绝负数、小数、字符串、非有限值、非法恢复状态和安全整数溢出。
- 单次最多推进 144000 tick，与架构保护预算一致；输入或溢出失败时原时钟不变。
- 不启动定时器、不按真实时间补算；任意真实等待都不自动改变世界。不要因为支持时钟就顺手做播放/暂停 UI。

### Scheduler

- 周期任务描述符只包含 `taskId / systemId / nextDueTick / intervalTicks / priority`；字段白名单校验，ID 非空，任务 ID 唯一，周期为正安全整数，到期点与计算结果均在安全整数范围。
- systemId 必须存在于显式提供的注册集合；A1 注册表仅为测试所需，不创建生态等空业务系统。
- 给定目标 tick，任务顺序固定为 dueTick、priority、systemId、taskId；字符串使用与 locale 无关的确定次序，不依赖注册先后。
- 完成任务的下次时间为原 nextDueTick + intervalTicks；不能改成“本次请求终点 + 周期”。批量推进必须逐个处理经过的到期点。
- A1 使用可独立测试的调度计划/返回值，不在调度器里执行任意业务回调或写共享世界状态。保持输入对象不被修改，并返回有序到期任务和推进后的描述符，便于 A2 在候选状态中统一提交。
- 明确定义初始 tick、到期 tick 的包含关系，并与架构“初始 tick 0 已完成、推进执行后续 tick”一致；拒绝恢复到已过期/重复执行的任务队列。
- 非法输入或下一到期点溢出时不留下部分更新。未到期任务不运行；到期任务不遗漏、不重复。

具体导出名称和内部实现由执行者决定，但需在模块注释写明参数、结果和错误语义；不修改上述行为合同。随机状态与调度状态序列化仅指普通数据导出/恢复，不包含文件存档。

## 5. 验收清单

| 编号 | 必须证明的行为 |
|---|---|
| R1 | 固定已知 RNG 向量；seed 0 和 uint32 最大值合法；输出均在范围内 |
| R2 | 同 seed 的两实例一致；生成前段后导出恢复，后续序列与不中断实例逐项相同 |
| R3 | 非法 seed/state/schema/算法拒绝，不静默修复 |
| T1 | 0、1、143→144、跨多天推进正确；日期/时辰不靠真实时间 |
| T2 | 非法 tick/n、单次上限、累计安全整数溢出均拒绝且状态不变 |
| S1 | 同 tick 多系统/多任务按指定键排序；反转注册顺序仍得到相同结果 |
| S2 | 3/6/144 tick 周期混合时：一次推进 288 与分块推进 100+188 的到期序列和最终状态一致 |
| S3 | 到期边界只执行一次；恢复后继续调度，不漏执行、不重新从周期起点开始 |
| S4 | 未注册系统、重复 ID、无效周期、过期队列、下一到期点溢出拒绝，输入描述符保持不变 |
| I1 | 三模块在纯 Node 环境导入和测试，不访问 DOM/localStorage/网络，不调用 Math.random/墙钟/定时器 |

这些是行为证据，不要求为每条凑一个同名测试；允许用参数化测试覆盖边界。不要把 100 天状态恢复、命令原子性或生态平衡作为 A1 已完成，它们属于后续任务。

## 6. 验证命令与交付

PowerShell，在明确的仓库路径下运行：

```powershell
node --test tests/simulation/rng.test.mjs tests/simulation/clock-scheduler.test.mjs
node --test tests/export-boundaries.test.mjs
git diff --check
git diff --stat
git status --short --branch
```

实现前先运行新增测试，确认失败针对缺失的 A1 能力；实现后运行上面的定向测试与既有独立化边界回归。不得触发历史浏览器 E2E、付费模型或 Laya 桥来凑验证范围。

精确暂存允许范围，提交到 `codex/world-runtime-a1`。如该环境有现成远端权限，可推送该任务分支作为交接点；不得推送/合并 main、发布 Release 或清理旧文件。若不能推送，提供本地 SHA、补丁/差异位置及原因，不宣称远端已保存。

按以下格式回传给用户：

```text
任务：A1
源码目录与分支：
实际基准 SHA / 交付 SHA / 远端分支：
未提交改动及归属：
修改文件与导出接口：
R1～I1 验证证据（命令、结果、失败修复）：
未验证/失败/合同偏差：
下一步：等待中控独立验收；不执行 A2
保护范围：旧页面、旧存档、其他项目和运行实例未改动
```

中控收到后核对交付 SHA 与真实差异，独立复跑有界测试和关键反例，再将看板改为已验收或需修正。执行者完成不等于中控验收，也不等于阶段 A 完成。
