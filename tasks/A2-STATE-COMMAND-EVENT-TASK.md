# A2 任务书：状态、命令与单 tick 原子提交

发布时间：2026-10-07 12:20（Asia/Shanghai）。用户于本对话授权自行推进；当前已实现并复核通过。状态见 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md)。

## 1. 目标与执行基准

A1/A1R已验收，代码基准为 `7b4a2db98184078021647e8a59eb9dc0c00f67e5`，在 `origin/codex/world-runtime-a1`，尚未合并main。依据 [架构§4～§6](../WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md)，本任务补齐最小数据和接口合同。

实现内存闭环：Snapshot V2初始化 → 未来命令 → 周期任务 → 全局校验 → 发布新bundle。只在成功tick改变状态与日志，用fixture资源账户测试，不加入生态或真实游戏交易。

开工核对AGENTS、README独立项目入口、最新PROJECT_CONTEXT、HEAD/远端/脏改动。建议从上述SHA新建 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-a2` 工作树；已有路径/分支先查归属，禁止覆盖/重置/清理。main目前仅有控制文档，不能从main当代码基准。只读取得最新任务书，不整份覆盖状态文件，不改控制树和E研究文档。

允许新增共享纯数据边界helper `runtime/core/data-contract.mjs`（避免三模块重复校验或循环依赖），以及 `runtime/core/world-state.mjs`、`command-engine.mjs`、`event-log.mjs`，测试 `tests/simulation/world-state.test.mjs`、`command-engine.test.mjs`，fixture/helper放测试内部；更新任务分支PROJECT_CONTEXT交付状态。A1模块只读，必要改动先交中控裁定。

不得加入第三方依赖、磁盘adapter、runner、服务/页面/网络/模型/Laya桥/旧档迁移；不得开始A3或合并main。

## 2. 导出接口

| 模块 | 接口 | 合同 |
|---|---|---|
| world-state | `createInitialBundle(config, systems)` | 创建tick/revision=0的`{snapshot,eventLog:[]}` |
| world-state | `validateBundle(bundle, options)` | options恰好`{rulesVersion,systems}`；规则精确匹配，失败抛错，不改输入 |
| world-state | `cloneBundle(bundle)` | 无共享可变引用的副本；拒绝无法无损复制的数据 |
| command-engine | `lookupCommand(bundle, input)` | 纯查询，同输入返回`{status:'pending',inputSeq}`或原回执副本，不存在`{status:'not_found'}`；冲突COMMAND_ID_CONFLICT |
| command-engine | `advanceOneTick(bundle, systems)` | 推进下一个tick，返回全新bundle；异常抛错，原输入不变 |
| event-log | `validateEventLog(eventLog, snapshot, systems)` | 检查事件及与snapshot/回执的交叉一致性 |

单向依赖，无循环；复用A1 RNG/Clock/Scheduler。systems为显式系统ID→同步函数记录，不入档；缺失系统拒绝，不能静默跳过。函数`(context,dueTask)`，context只含候选snapshot、私有恢复rng、`emitFact(fact)`。只允许修改候选资源/计数器或发事实，不改已提交数据；异步/Promise必须拒绝，不能后台写已发布对象。发布前复制或冻结，保存的context不能污染返回值。无外部任意路径写状态接口。

## 3. Snapshot与初始化

config恰好八个必填字段：`rulesVersion/simulationId/fixtureId/fixtureVersion/seed/resources/scheduledTasks/commands`。四个标识/版本非空最长64字符；seed按A1 uint32。初始化只接受tick0，恢复不重新播种。

snapshot恰好为架构§5.1全部字段：

```text
schemaVersion=2, rulesVersion, simulationId, fixtureId, fixtureVersion,
tick, tickMinutes=10, revision, rng,
nextEntityId, nextEventSeq, nextInputSeq,
scheduledTasks, pendingCommands, commandReceipts, world={resources}
```

- resources为账户ID→非负安全整数余额记录；ID非空最长64，最多100000账户（保护预算）。目标加法不能溢出。
- 初始tick/revision=0，三个next计数从1起；每成功tick，tick/revision各+1，本阶段genesis固定0，校验revision=tick。内置转移不分配实体；测试系统可推进候选nextEntityId验证回滚。
- scheduledTasks沿用A1五字段/排序/系统校验，只保存描述符，nextDueTick>tick。
- commands为未来输入数组，新ID按首次出现的数组顺序赋inputSeq；同ID同输入合并，冲突整次初始化失败。不得按对象键/commandId排序代替显式输入顺序。
- pendingCommands每项恰好`{commandId,inputSeq,targetTick,type,payload}`，按inputSeq保存，targetTick>tick。结算后移除，不与回执重复。
- commandReceipts为commandId→`{inputSeq,input,fingerprint,status,result,eventSeqs}`；input恰好`{type,payload,targetTick}`，status为succeeded/rejected。pending+receipts的inputSeq唯一、连续覆盖`1..nextInputSeq-1`，commandId不交叉。保留完整输入，不裁剪回执。
- fingerprint采用规范JSON字符串本身，覆盖type/payload/targetTick；对象键递归按UTF-16码元序，数组保序。不用简易数值hash，payload键插入顺序不构成冲突。
- 记录原型仅Object.prototype/null；白名单校验。拒绝异类/稀疏/undefined/函数/Symbol/BigInt/NaN/Infinity/循环/访问器数据；不能JSON stringify静默删字段再接受。`__proto__`等合法键不能污染原型或冒充回执，使用own-property和安全字典构造并加入反例。
- bundle恰好`{snapshot,eventLog}`。不支持schema/rulesVersion为UNSUPPORTED_VERSION；结构/引用/计数不一致INVALID_INPUT；预算LIMIT_EXCEEDED。A3才把磁盘坏档映射INVALID_CHECKPOINT。

## 4. 唯一命令TransferResource

输入恰好`{commandId,targetTick,type:'TransferResource',payload}`，payload恰好`{from,to,amount}`；commandId非空最长64，初始化targetTick正安全整数；账户ID按上节，amount正安全整数。未知命令/字段/类型INVALID_INPUT，不排队或分配inputSeq。

到期检查账户存在、from≠to、余额足够、目标不溢出；失败只写`status:'rejected',result:{code:'RULE_REJECTED'},eventSeqs:[]`，不改资源/消耗RNG/产生成功事实，继续后续命令。合法payload的未知账户是规则拒绝，不要求初始化前置条件已满足。

成功同时扣减与增加，result恰好`{from,to,amount}`，产生一条ResourceTransferred，回执引用该事实。pending/receipt同ID同输入只查询原结果，不重复扣减/排队/发事件/增加revision。lookup先校验可规范化的查询外形，再按已有ID比较指纹：已有ID改type也返回冲突，不因新type未注册而掩盖ID冲突；初始化仍严格拒绝未知命令。lookup纯查询；A2无运行中入队。pending+receipts可按inputSeq还原完整输入重跑。

## 5. EventLog与预算

事件字段恰好`eventSeq/tick/type/schemaVersion/sourceSystem/commandId/causationEventSeqs/entityIds/payload`；事件schemaVersion=1（Snapshot为2）。eventSeq从1连续，nextEventSeq=日志长度+1；事件tick正安全整数≤snapshot.tick，按日志顺序不倒退。

| type | 来源与引用 | payload |
|---|---|---|
| ResourceTransferred | sourceSystem='command-engine'，commandId对应succeeded回执，entityIds恰好`[from,to]` | `{from,to,amount}`，与输入及result一致 |
| FixturePulse | sourceSystem已注册，commandId=null，entityIds=[] | `{sample}`，有限且[0,1)，记录测试任务已决RNG输出 |

只允许上述类型/精确字段。causationEventSeqs密集、去重、升序，引用存在且更早事件；无原因[]。emitFact输入恰好`{type,sourceSystem,commandId,causationEventSeqs,entityIds,payload}`，引擎赋序号/tick/schemaVersion；系统只能用自己的sourceSystem发FixturePulse。成功转移与事件双向一一对应，event.tick=input.targetTick；拒绝无成功事实。缺失/错命令/错tick/错资源/重复引用拒绝。FixturePulse不代表真实生态。

规范UTF-8 JSON payload≤64KiB；日志≤1000000条，任务/待处理命令/回执各≤100000项。初始化、入口、候选发布前检查，计数器先检查安全整数溢出再增加；超限整tick回退。A3另做整文件64MiB限制。预算非性能承诺，A2不压缩或规模优化。

## 6. 单tick原子提交

1. 校验bundle，复制候选snapshot/log，独立恢复RNG。
2. A1 Clock取tick+1，到期命令按inputSeq执行，成功/规则拒绝仅写候选。
3. A1 Scheduler推进到本tick，按原排序调用系统，读取命令后的候选，保存新队列。
4. 候选RNG、tick/revision、计数器、事件一同全局校验，通过才返回。

系统异常/异步/非法事实/不变量失败/预算或溢出都回退整个tick，原资源、tick/revision、RNG、队列、回执、ID、日志逐项不变。错误带failedTick，意外异常保留cause；不吞错或伪装RULE_REJECTED。调用者保留最后成功bundle；A4才做多tick runner/非零退出。不做递归监听、子命令链或通用事件溯源reducer。

## 7. 验收合同

先写针对缺失能力失败的测试，再实现；静态导出检查不能代替真实链：

- **V1数据/审计**：初始完整字段、seed0、clone隔离、JSON往返；未知版本/字段/非有限/稀疏/异类/循环/访问器拒绝；原型键安全；事件断号/未来倒序tick/前向缺失因果、回执错引用、计数不一致、预算入口拒绝。用紧凑输入或受控子进程，不制造主进程OOM。
- **V2命令闭环**：A=10/B=0，同tick按inputSeq转移7再转移5，第二条拒绝，最终A=3/B=7且守恒；不足/同账户/未知账户/目标溢出拒绝；pending/成功/拒绝回执重复查询不写；payload键序无关，amount/type/targetTick变化冲突；未知命令拒绝；完整输入可重跑。
- **V3原子tick**：命令先于系统，系统排序符合A1。先成功转移，再由系统消费RNG、推进nextEntityId、发事实后抛错，证明全部回退；修好重试与干净运行一致。非法事实/Promise/不变量/计数器失败也回退。深冻结输入可运行，返回值/context别名隔离。288tick与100+188tick（中间JSON往返）完整snapshot/log一致；仅内存恢复，不是A3磁盘验收。

```powershell
node --test tests/simulation/world-state.test.mjs tests/simulation/command-engine.test.mjs
node --test tests/simulation/rng.test.mjs tests/simulation/clock-scheduler.test.mjs
node --test tests/export-boundaries.test.mjs
git diff --check
git status --short --branch
```

核心仅相对引用runtime/core，扫描无Math.random/墙钟/定时器/DOM/网络/环境变量/磁盘。原A1 30项与边界3项须继续通过；不运行旧浏览器E2E，不宣称磁盘/生态/AI验收。

## 8. 交付与停止

精确提交允许文件并推`origin/codex/world-runtime-a2`，不merge/push main。回执含任务、源码/分支、实际基准/交付完整SHA/远端、脏改动归属、接口、V1/V2/V3命令结果与修复、未验证/偏差、下一步/保护范围；测试数按本次实测。

交付后等中控验收，不执行A3或更新看板。合同冲突先报告具体字段/场景与建议，中控裁定，不自行降低门槛。


## 本轮收口

用户改为本对话实施。A2提交0988707，新增17项+原33项共50/50通过；新进程消费者探针验证真实转移/输入隔离/审计破坏/访问器拒绝。系统不得改写输入及身份，发布context隔离。四个core文件及两份测试，无A1改动。下一步[A3](A3-CHECKPOINT-TASK.md)，不再等待外部执行者。
