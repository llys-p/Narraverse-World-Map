# 世界运行时与生态模拟：架构基线与分阶段实施计划

> 修订：2026-10-07 11:12（Asia/Shanghai）；本次更新 E 阶段 Laya 技术认知。
> 状态：方向已确定；本文是实施约定，不是实现或验收报告。
> 本次规划起点：阶段 A / A1。实际交付与验收进度唯一记录在 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)。
> 承接 `9db7035` 的架构方向和 `28b1ebb` 的状态记录；原版本保留在 Git 历史。

## 1. 目标与使用方式

把独立 RPG 原型逐步发展成能在没有玩家输入时推进、产生因果并保存历史的 World Runtime。长期目标是让地图、场景、战斗与文字交流成为同一个运行世界的不同交互入口。

```text
确定性时间、状态与事件
  → 生态 / 经济 / 聚落
  → Population 与 Persistent Actor
  → Needs / Utility AI / Goal / Memory
  → 地图、场景、交易与战斗接入
  → Laya 社会信号与 LLM 表达增强
```

先回答两个不同的问题：A 验证“模拟能否正确运行和恢复”；B 验证“没有玩家、UI、Laya、LLM，生态经济能否合理运行 100 天”。两者不可互相代替。

- **已确定**：确定性内核优先、纯 JS、Node runner、聚合人口、AI 可选、阶段顺序与 A 阶段契约。
- **待实验校准**：生态系数、经济参数、平衡区间、性能目标；记录配置和结果，不写成已证明。
- **未来计划**：完整 LOD、社会传播、势力、现实离线补算、正式平台适配。
- **主线未完成**：新模拟系统尚未验收；A1 候选实现已在任务分支交付，状态见 PROJECT_CONTEXT。Snapshot V2、事件引擎、runner 和业务模拟仍为后续任务。

执行时读阶段表与当前阶段的合同。后续阶段固定边界和验收目标，细节在进入该阶段时补充到本文，不另建重复路线图。本文的目标命令和模块目前不能当作已经存在的能力。

## 2. 源码基线与保护边界

源码根目录为 `D:\Narraverse-World-Map`，远端为私有仓库 `llys-p/Narraverse-World-Map`。这是独立项目，不是 Narraverse 正式平台的工作树。

已有地图、场景、战斗、角色、商店与 `WorldRPG / WorldInv / WorldState / WorldSkill / WorldFX / WorldCombatFX`。现有代码不能直接视为新内核：

- 根目录 `world-state.js` 使用 `world_state_v1`，是浏览器状态桥；怪物生成使用 `Math.random()` 和 `Date.now()`，日志只留最近 20 条。
- `world-rpg.js` 使用独立的 `world_rpg_profile_v1`；战斗、背包与世界写入尚非一个事务。
- `index.html` 的时间和移动在页面逻辑中；旧“区域至少补一只怪”规则不能直接作为生态出生机制。
- 旧 E2E 脚本含历史端口和可能的模型调用，不直接全跑来验证新内核。

A～C 只新增隔离的模拟模块和测试，不迁移真实存档、不替换旧页面读写、不启停旧实例。旧数值规则可在 D 经纯函数提取和回归后复用，不整包导入存储与随机副作用。

正式平台分别拥有世界设定、书籍与互动运行状态。未来适配须明确 `worldDefinitionId / worldDefinitionRevision / simulationId` 的映射；模拟事件不能自动改写正式世界设定或书籍。该适配属于 G。

## 3. 阶段表与推进规则

| 阶段 | 必要交付 | 通过标准 | 本阶段不做 |
|---|---|---|---|
| A：模拟底座 | RNG、Clock/Scheduler、Snapshot、命令提交、EventLog、保存恢复、runner | 连续运行与断点续跑一致；失败不留下半次变更 | 生态平衡、NPC 智能、UI、AI、旧档迁移 |
| B：生态经济 | 鹿狼、粮食药材、村庄库存与价格、聚合捕猎、简化外部贸易 | 100 天因果闭环；500/1000 天和多 seed 观察；扰动对照 | 实名 NPC 决策、完整商队寻路、LOD |
| C：人物决策 | 村长/猎人/商人、Needs、Utility AI、Goal、基础关系与事实记忆 | 人物状态影响行动，行动反向影响世界 | 通用规划器、大量 NPC、完整社会网络、AI |
| D：玩法接入 | 地图观察、统一时间入口、一次交易、一次战斗、最小 LOD | 玩家行动造成可保存且仅结算一次的世界后果 | 全面 UI 重做、正式平台迁移 |
| E：智能叙事 | NPC SocialSignal Benchmark、Laya Adapter/fallback、LLM 表达、历史摘要 | 窄信号经独立测试与校准；AI 关闭或失败仍可玩；迟到/重复结果不污染状态 | AI 直接写世界、全人口常驻模型调用 |
| F：世界扩展 | 完整 LOD、Rumor、跨区商队、势力、离线粗模拟 | 分项有合同、守恒与规模证据 | 一次实现全部长期愿景 |
| G：平台适配 | 适配层、身份/版本映射、显式迁移与回滚 | 单独授权后通过平台边界验收 | 自动同步、隐式改写正式资料 |

依赖为 A → B → C → D → E。F 在 B～D 证据充分后按需求拆项，G 单独规划。D 前置于完整 AI 接入，尽早验证玩家能否感知并改变世界。

每次只领取一个任务或一个用户明确授权的阶段。完成当前范围后报告并停在约定边界；同一已授权阶段内的顺序任务无需反复询问。文档改写本身不授权立即实现 A～G。

开工核对 Git 与局部规则；每个任务完成后运行定向验证，更新 `PROJECT_CONTEXT.md` 的结果与下一步。失败如实记录，不跳过门槛宣称整阶段通过。

## 4. A 阶段：确定性时间与执行合同

### 4.1 时间语义

- `tick` 从 0 开始，为非负安全整数；`tickMinutes = 10`，144 tick 为一天，日期/时辰由 tick 派生。
- 初始状态代表 tick 0 已完成。`advanceTicks(n)` 执行接下来的 n 个 tick；拒绝负数、小数、非有限值和安全整数溢出，不隐式取整。
- 世界只由显式推进驱动。暂停不变化，倍速只改变宿主请求节奏，渲染帧率不参与规则计算。
- A 的“无玩家”表示无需玩家输入，不表示服务常驻或关机后仍执行。A～E 不按现实离线时长自动补算；F 再定义倍率、上限和粗细模拟误差。
- 内核不使用 `Date.now()`、`performance.now()`、DOM、网络或定时器作为规则输入。runner 可测量真实耗时，但该指标不参与状态一致性比较。

### 4.2 同 tick 顺序与调度

```text
复制已提交状态及 RNG/队列/计数器
  → 取下一个 tick
  → 执行到期外部命令（按持久化 inputSeq 排序）
  → 执行到期任务（dueTick、priority、systemId、taskId 升序）
  → 校验全局不变量
  → 一次发布候选状态、事件与新 tick
```

- 外部输入只能排到未来 tick；A 的输入来自 fixture/runner，不开放远程写入接口。
- 周期任务保存 `nextDueTick`，完成后从原到期点加周期，不依据真实时间重排。
- 同 tick 产生的后续命令最早在下一 tick 执行；禁止同步监听器递归触发无限事件链。
- 默认优先级：资源恢复/生产 10、生态 20、人口消耗与聚落 30、市场与贸易 40、Actor 决策 50。业务任务在 B/C 按需注册，A 不建空系统。改变顺序必须升级 `rulesVersion`。
- 系统读取当前候选状态并提出变更，由规则层应用；不能直接改已发布对象或依赖对象遍历的偶然顺序。
- 系统抛错或全局校验失败：整个 tick 的状态、RNG、队列、ID 与事件回退，runner 非零退出，保留最后成功 tick。预期的无效命令可记录拒绝回执后继续，不算系统崩溃。

建议业务频率：资源生产/人口消耗每日，生态与聚合捕猎每 6 小时，价格每日；C 的 Needs 每 30 分钟、工作每小时。频率集中配置并记录版本，不散落到页面。

### 4.3 随机数

- 使用一个显式注入、可序列化的 `mulberry32-v1` 随机流，seed 为包含 0 的 uint32。A1 固定算法/溢出运算并以已知输出向量测试。
- 快照保存算法名、初始 seed 与当前 uint32 state；加载恢复 state，不重新从 seed 开始。
- 模拟规则禁止 `Math.random()`；Actor/event/task ID 使用持久化计数器，不使用时钟或随机 UUID。
- 确定性承诺限于相同规则版本、初始 fixture、有序输入和已验证 Node 环境；记录 Node 版本，不承诺跨环境浮点行为永久一致。
- 表现特效使用独立随机源。以后拆分随机流需显式版本升级，不能改变旧档轨迹而不说明。

## 5. A 阶段：状态、事件与保存恢复

### 5.1 唯一状态与数据合同

内核只有一份已提交的运行状态：Snapshot 是保存形式，EventLog 是事实审计，RuntimeCache 是可重建的派生信息。Snapshot V2 与旧 `world_state_v1` 隔离，V2 不代表已支持旧档转换。

| 必需字段 | 合同 |
|---|---|
| `schemaVersion` | 固定整数 2，不支持的版本明确拒绝 |
| `rulesVersion` | 非空、最长 64 字符；覆盖 RNG、调度、规则与配置兼容性，不兼容拒绝加载 |
| `simulationId` | runner/fixture 指定的非空 ID，最长 64 字符，不按墙钟生成 |
| `fixtureId / fixtureVersion` | 初始世界与参数来源，均为非空、最长 64 字符 |
| `tick / tickMinutes / revision` | tick 非负安全整数；tickMinutes 固定 10；revision 从 0 起，每次成功 tick 加 1 |
| `rng` | `{ algorithm: 'mulberry32-v1', seed, state }`，seed/state 均为 uint32 |
| `nextEntityId / nextEventSeq / nextInputSeq` | 从 1 开始的安全整数，只随所属操作成功推进 |
| `scheduledTasks` | 数组：唯一 taskId、已注册 systemId、nextDueTick、正整数 intervalTicks、整数 priority；nextDueTick 大于已提交 tick，A 只用周期任务 |
| `pendingCommands` | 数组：commandId、inputSeq、targetTick、type、payload；inputSeq 唯一，targetTick 大于已提交 tick |
| `commandReceipts` | commandId → `{ inputSeq, input, fingerprint, status, result, eventSeqs }`；input 保留 type/payload/targetTick，status 为 succeeded/rejected；result 为该命令 schema 定义的结果对象，拒绝结果包含 code |
| `world` | A 最小 `{ resources: {} }`，只允许 fixture 测试资源；B/C 显式版本扩展种群/聚落/市场/Actor |

空集合显式为 `{}` 或 `[]`，不以 null 代替缺省字段。入口拒绝未知字段、非法类型、非有限数、重复 ID、非法引用、不支持的任务/命令类型。业务 payload 在实现规则时提供白名单 schema 与反例测试，不开放任意路径写状态。

RuntimeCache 可保存寻路、附近 Actor、效用分数、可见性；不入档、不参与事实哈希。RNG、队列、目标进度、预留资源和未结算行动会影响未来结果，必须持久化，不能归入 cache。

### 5.2 命令与提交

```text
Intent/Command → 输入及前置条件校验 → 完整状态变更与事实事件
  → 一次应用到候选状态 → tick 总校验后发布 → UI/统计读取
```

交易扣款、库存减少与物品增加属于同一次规则结算，不能由三个独立监听器分别写入。消费者失败不能留下半笔交易。

- commandId 在一次 simulation 中唯一。相同 ID 和规范化输入重复提交只返回原回执，尚在队列中的重复请求也不重复排队。
- A 的外部命令随 fixture 在初始化时装入队列；记录完整输入并按 inputSeq 导出，确保从初始世界重跑。未来运行中接受新输入时，接收时刻与排队操作也必须进入持久化合同，不能在未增加 revision 的情况下静默改已提交快照。
- fingerprint 覆盖 type、payload、targetTick；相同 ID 携带不同输入返回 `COMMAND_ID_CONFLICT`。
- 规则拒绝不消耗资源、不产生成功事实，记录拒绝回执；A 不裁剪回执，避免恢复后丢失去重依据。
- A 仅支持单进程、单写者；多标签页/客户端写入在 D 的权威服务入口解决。
- 稳定错误 code：`INVALID_INPUT`、`COMMAND_ID_CONFLICT`、`RULE_REJECTED`、`UNSUPPORTED_VERSION`、`INVALID_CHECKPOINT`、`LIMIT_EXCEEDED`、`SAVE_FAILED`。意外错误停止推进并报告失败 tick。

### 5.3 EventLog 的准确承诺

事实事件至少有：`eventSeq`、`tick`、`type`、`schemaVersion`、`sourceSystem`、`commandId`（内部周期事件为 null）、`causationEventSeqs`（无直接原因时为空数组）、`entityIds` 和类型限定的 `payload`。

eventSeq 连续递增；因果引用只能指向更早事件。随机决定记录已决结果，不只记“抽过签”。连续生态变化可按周期记录数值收支，不要求每只动物一条日志。

**A 的 EventLog 是结构化事实审计，不是完整事件溯源。** 它用于追查规则和变化，不承诺仅凭日志重建任意过去 tick。确定性复现依靠相同初始条件与输入重跑，续跑依靠完整 checkpoint。未来状态回放另加完整 reducer/差量合同与验证。

记忆引用事实事件，LLM 摘要是派生表达。A 不裁剪日志，超预算显式停止；未来压缩必须处理因果与记忆引用生命周期。

### 5.4 checkpoint 与错误恢复

Node 文件 adapter 一次保存完整 bundle：`{ formatVersion: 1, snapshot, eventLog }`。状态和日志在同一文件，CSV 仅为分析产物。

- 只在成功 tick 边界生成 checkpoint。内存推进成功与磁盘保存成功分开报告；保存失败不能提示成功。
- 在目标目录写独占临时文件，完整写入、flush/close，再重命名为不存在的 checkpoint 文件。文件名使用 revision；目标已存在则拒绝覆盖，运行目录不得有并发写者。
- 保留前一份 checkpoint；中断残留临时文件不作为存档。A 不承诺硬件断电下的绝对持久保证。
- 加载显式指定路径，完整解码校验后才替换内存状态。版本不支持、截断 JSON、tick/队列不一致、日志断号、回执引用缺失均失败；不静默重置世界或自动换档。
- 恢复 RNG、计数器、队列、回执；cache 重建，不重跑已完成任务、不重新抽签。
- 不自动转换旧浏览器存档或读取其他项目数据。

初始保护预算：单次推进最多 144000 tick，单文件 64 MiB，累计事实事件 1000000 条；任务/待处理命令/回执集合各最多 100000 项；单条命令/事件 payload 最多 64 KiB（UTF-8 JSON）。入队和提交前检查，触限显式失败，不截断历史后继续。这些是保护上限，不是性能能力证明；B 实测不足时先调整并记录依据。

A1 独立验收补充（2026-10-07）：调度器单次到期结果最多1000000项，在展开前预检总次数及下一到期点溢出；跨度预算不能代替结果量预算。任务数组必须密集，普通数据对象不能接受Date等异类对象并静默缺省。修正验收见 [A1R任务书](tasks/A1R-SCHEDULER-LIMITS-TASK.md)。

## 6. A 阶段任务与验收

新模块使用 `.mjs` 和 Node 内置模块，不更改根目录模块解析方式、不引入第三方依赖。路径建议为 `runtime/core/`、`runtime/persistence/`、`tests/simulation/` 和根目录 `simulation-runner.mjs`。后续按需增加 systems/actors，不先建空系统。

| 任务 | 依赖 | 建议文件范围（另更新状态摘要） | 验收 |
|---|---|---|---|
| A1：确定性时间 | 无 | `runtime/core/rng.mjs`、`simulation-clock.mjs`、`scheduler.mjs`，对应两份测试 | RNG 已知向量/恢复；tick 输入边界；同 tick 顺序、跨天、不同调用分块无漏调度 |
| A2：状态与提交 | A1 | `runtime/core/world-state.mjs`、`command-engine.mjs`、`event-log.mjs`，对应两份测试 | 测试资源转移原子生效；重复命令不重复扣减；异常使 tick/RNG/队列/日志一同回退 |
| A3：保存恢复 | A2 | `runtime/persistence/checkpoint-store.mjs`、存档/恢复测试、最小 fixture | 连续 100 天 = 40 天保存加载 + 60 天；坏档/版本错误/已有目标明确失败并保留旧档 |
| A4：runner | A3 | `simulation-runner.mjs`、runner 测试、fixture 和使用说明必要小改 | CLI 贯通 A1～A3；产出 summary/events/checkpoint；错误非零退出，无网络/浏览器依赖 |

若单项需触及明显更多业务模块，先拆小项，不顺手进入 B。目标验证命令（实现后运行）：

```powershell
$simulationTests = @(Get-ChildItem -LiteralPath tests/simulation -Filter '*.test.mjs' -File | ForEach-Object FullName)
node --test @simulationTests
node simulation-runner.mjs --fixture clock-smoke --days 100 --seed 42 --out <新的实验目录>
node simulation-runner.mjs --fixture clock-smoke --days 40 --seed 42 --out <新的实验目录>
node simulation-runner.mjs --resume <40天checkpoint路径> --days 60 --out <另一个新目录>
```

`--days` 为本次新增推进天数，只接受 1～1000 的整数；`--seed` 仅用于新建、默认 42；resume 禁止另传 seed/fixture。fixture 和初始输入不能依赖本次 --days 的长度，否则断点续跑将改变实验前提。输出目录须新建，不得使用其他项目用户数据目录。默认 simulationId 按 fixture/seed 规范化生成，resume 沿用原 ID。

clock-smoke 只含周期任务和测试资源，不冒充生态。产物至少为 `summary.json`、`inputs.json`、`events.csv`、checkpoint；summary 记录代码提交及 dirty 状态、Node/fixture/rulesVersion、seed、起止 tick、状态/事件哈希、失败原因、耗时和内存。脏工作区不能仅用 HEAD 冒充精确代码版本。

哈希使用规范化 JSON（对象键排序、数组保留业务顺序）与 SHA-256；排除宿主耗时和路径。100 天连续与 40+60 天续跑应比较完整状态和事件，不能只比较人口总数。

**A 门槛**：A1～A4、断点续跑、分块推进一致性、持久化故障和 tick 回退反例均通过。只可报告“底座通过”，不能报告“生态世界能活 100 天”。

## 7. B 阶段：最小生态经济世界

### 7.1 范围、单位与开放边界

1 个村庄、80 人聚合人口、鹿群、狼群、粮食/药材、粮价/药价；村外是显式的简化贸易边界。没有实名 NPC、完整商队 AI 或玩家。

起始样例：鹿 120、狼 14、粮食 900、药材 80。这只是 fixture，不是平衡结论。B1 开工时固定具体参数、单位和公式，写入版本化配置及本文。

- 人/动物为整数计数，粮食定义为口粮份，药材为治疗单位，金币使用整数最小货币单位；比例注明范围。
- 定义每人每日消耗、每周期产量、治疗消耗、容量与损耗，不能把每日系数每 10 分钟应用一次。
- 小数繁殖/消耗使用持久化余数或指定随机舍入，不无说明地每 tick 四舍五入。
- B 可以固定人口 80，记录饥饿/健康压力；不声称人口出生死亡已实现，鹿狼必须有真实收支。

### 7.2 规则要求

生态至少包含鹿群环境容量、繁殖、自然死亡、捕食、聚合捕猎，以及狼群食物压力与进入农田的行为变化。

```text
鹿群变化 = 繁殖 - 自然死亡 - 捕食 - 人类捕猎
捕食量 = 遭遇需求经猎物存量与捕食能力约束后的实际数量
狼群变化 = 食物影响下的繁殖 - 自然死亡 - 捕猎
村庄库存变化 = 生产 + 进口 - 消费 - 出口 - 损失
```

捕食不超可用猎物，生产受容量约束；限制参与规则计算并记录实际收支。不得先制造负库存再用通用 clamp 掩盖错误，不为稳定而凭空补鹿补狼。

价格先用一个归一化库存缺口指标，加有界需求/运输风险修正；定义最低分母、价格上下限和每次最大变幅。短缺与需求项不得无说明地重复放大同一压力。B3 前固定公式和系数，关系折扣以后放交易层。

简化贸易须有进口成本、可用货币、运力、到货延迟和途中货物。若外部供应假设无限，要明确开放边界；货物到货、金币流出均有事件，不无条件刷库存或提前入账。

聚合捕猎受劳动力、危险和收益约束；伤病产生药材需求属于聚合机制，不描述成猎人 NPC 自主决策。

### 7.3 任务与验收

| 任务 | 依赖 | 交付与验收 |
|---|---|---|
| B1：配置与资源账 | A | 固定参数/单位/版本，生产/消费/损失/外部流入流出可对账，零资源不产生 NaN |
| B2：鹿狼与捕猎 | B1 | 食物压力影响行为，捕食/死亡不超存量，扰动经规则传播，不预写结局 |
| B3：价格与贸易 | B2 | 库存影响价格和贸易，迟到货物不提前消费，货币与商品账相符 |
| B4：实验验收 | B3 | 100/500/1000 天、多 seed、扰动对照及收支报告，异常能由事件定位 |

进入 B 时补每项文件范围和定向命令，不一次铺满系统。

- **100 天快速回归**：seed 42 的基线和受控扰动，硬不变量零违规，重复及断点续跑一致。
- **500 天平衡观察**：固定 seeds `[1, 7, 42, 2026, 65535]`，报告种群、食物缺口、价格、危机恢复分布，不只选好看结果。
- **1000 天长程检查**：同一 seed 集合检查漂移、日志增长、挂起事件、耗时和内存。长时运行不等于大人口规模压测；规模验证放 F。
- **扰动对照**：相同 fixture/seed，在第 10 天通过命令减少部分鹿群，与无扰动运行对照；另测阻断贸易/药材短缺。记录干预量、因果事件和中间变量，不用日期脚本写死结果。

硬不变量：有限数值；非负合法数量；收支守恒（外部流入流出有账）；ID/事件序号唯一；无重复死亡、到货、扣款；无漏调度；同条件复现一致。

平衡目标：基线有反馈和恢复，不靠保底补给伪造稳定；严重扰动可导致灭绝，只要可解释。B1 先声明参数/观察指标，首次校准后冻结回归阈值，再用额外 seed 验证，不事后改门槛遮蔽失败。

输出增加 `population.csv / ecology.csv / economy.csv`。性能先测量，再按硬件与规模设回归预算；“很快”不算通过。

**B 门槛**：鹿减少 → 狼食物压力 → 农田/粮食损失 → 聚合捕猎与健康压力 → 药材需求/价格 → 有成本且延迟的补给，无 AI 成立。结果同时注明简化模型与未覆盖范围。

## 8. C 阶段：人口、永久人物与决策

普通人口仍为聚合计数，村长/猎人/商人为首批 3 个 Persistent Actor。约定：村庄总人口包含已实例化居民；未实例化人口 = 总人口 - 已登记居民，不能重复相加。

Actor 最小字段：identity、location、health/hunger/fatigue、occupation、inventory/wealth、needs、personality、relationships、memories、currentGoal、执行进度、simulationLevel。只增加会参与规则的心理变量。

### 8.1 Utility AI + Goal

- 先校验候选行为可执行性，再按需求、人格、关系和风险评分；同分走固定顺序或受控 RNG。
- 目标以有限步骤分解，例如“买药 → 缺钱 → 工作 → 收入 → 买药”；不先做通用无限深规划器。
- 保存目标进度、预留资源、截止条件、失败次数与冷却；仅在完成/失败/重大事件/需求越阈值时重评，避免每 tick 换目标。
- 行动通过命令引擎；两个 Actor 争最后一份药只能一个成功。
- 猎人实例化后，其消费、捕猎和伤病从聚合份额移交，不双重结算。

### 8.2 关系与 Memory

- 短期记忆：有上限的近期可感知事实；情景记忆：高影响事件及 eventSeq；长期关系：信任/恐惧/债务等规则状态。
- NPC 只记住亲历、目击或明确传播得到的事实，不给所有人全知 EventLog。
- 关系变化只在规则结算时应用一次；压缩记忆不能再次加信任或扣好感。
- 摘要是派生内容，不能压掉重要事实 ID、身份和真实债务。Rumor/Information 网络留到 F。

任务顺序：C1 身份/人口份额与需求 → C2 猎人目标闭环 → C3 商人/村长与资源竞争 → C4 关系/记忆回归。每项开工前补字段 schema 与场景测试。

**C 验收**：伤病/饥饿/缺钱改变目标和行动；恢复后目标继续；死者不工作；买不到药有失败或替代步骤；循环目标可终止/冷却；结果进入同一世界状态。人格可改变选择，不保证每个 seed 都出现相同剧情。

## 9. D 阶段：LOD 与玩法接入

### 9.1 L0/L1/L2 的状态与守恒

| 层级 | 含义 | 持久化责任 |
|---|---|---|
| L0 | 聚合人口、种群、库存、财富 | 数量与规则必需状态 |
| L1 | 重要 NPC、商队、狩猎队 | 身份、位置、目标、资源、执行进度 |
| L2 | 玩家接触对象的精细行为、战斗与表现 | 事实仍归内核，渲染/文本不另建事实库 |

固定账本：`总存活数 = 未实例化存活数 + 已实例化存活数`。实例化是转移，不是新生；统计、生产和捕食仅由当前拥有该份额的模型结算。

```text
狼总数 24：未实例化 24，实例化 0
  → 取出 4：未实例化 20，实例化 4，总数 24
  → 死亡 3：未实例化 20，实例化 1，总数 21
  → 幸存者回归：未实例化 21，实例化 0，总数 21
```

用 materializationId/encounterId 关联出入账，结算幂等，取消/失败/恢复均有去向；反复进出场景不能复制人口、资源或掉落。

Persistent Actor 身份独立于 simulationLevel。离开视野可降频，不能丢 ID/关系/记忆再生替身；死亡保留必要墓碑/引用，不复用 ID。D 先做一类有界遭遇，完整通用 LOD 与大规模压缩留 F。

### 9.2 接入任务

1. D1：独立 Node 服务托管单写者 Runtime，地图只读快照；先固定命令 DTO、revision 冲突、限额和错误合同再开放写接口。
2. D2：旅行/休整走统一时间入口；交易读取真实库存并提交命令，页面不直接保存新世界。
3. D3：一类野兽遭遇的实例化与战斗结算；战斗 ID、参与者、预留资源和结果只应用一次。
4. D4：场景人物身份与事实记忆连续，验证刷新、返回、多标签页过期请求。

首版回合战斗期间建议暂停该存档的宏观自动推进，战斗回合按明确耗时由权威入口推进；具体耗时在 D 开工前固定。地图不能另用帧循环推进世界。

旧玩法留作对照；真实存档迁移须单独确认目标/备份/转换/回滚，开发用新 fixture。localStorage 可存 UI 偏好，不作新 Runtime 的第二个权威写入者。

**D 验收**：真实交易/狩猎改变库存/种群，重启后仍一致；重复结算无额外奖励；过期写入明确拒绝/重读；真实浏览器消费链通过，不能只交付按钮或类型。

## 10. E 阶段：Laya 与 LLM 边界

### 10.1 候选模型与资料核对

E 阶段不预定胜出 checkpoint。首轮用同一套 Narraverse 中文 NPC 数据比较官方 `convaiinnovations/laya-multilingual`、`SGK86/laya-multilingual-typed-decisions` 与 `ZLHAOOO/laya-mlx-zh` v0.2；它们都只竞争 NPC perception layer 的 SocialSignal 候选。官方 multilingual 保留为可复现基线及后续自有数据微调的备选底座。模型卡上的分数来自不同任务，不能直接跨模型排名。具体执行合同见 [E1 模型选型对照任务书](tasks/E1-LAYA-MODEL-SELECTION-BENCHMARK-TASK.md)。这项离线预研不改变 A → B → C → D → E 的实施顺序，不在 A～D 接入 Runtime。

2026-10-07 核对的上游事实：

- 官方模型卡标注约 322M 参数、mmBERT-base、多语言覆盖 100+（包含中文）；默认上下文上限 1024 token，可显式设置 `max_len=8192`。这是总输入预算，问题/选项也占 token，不能全部分配给 NPC 上下文。长上下文的准确率和耗时另测，不能把更大上限当作更可靠的证据。[模型卡](https://huggingface.co/convaiinnovations/laya-multilingual)
- 权重、编码器/分词器资料可下载，上游支持从本地目录加载；完整模型组件与运行依赖准备后可离线推理，无需云 API。代码与该 checkpoint 标注 Apache-2.0，后续可针对自己的有权使用的中文社会信号数据 fine-tune；这不自动证明训练数据或第三方演示代码的许可。[模型文件](https://huggingface.co/convaiinnovations/laya-multilingual/tree/main)、[上游本地加载与微调说明](https://github.com/NandhaKishorM/laya)
- 上游承认基础 checkpoint 的零样本 typed-decisions 能力有限，任务 fine-tune 后改善明显。不同页面/版本的基准数值不完全一致，不将它们当作 Narraverse 的成绩。模型卡提示出厂未校准，`score` 有位置偏差，因此小规模 `choice` 为首轮优先形状，概率须在自有数据上校准。[模型卡限制](https://huggingface.co/convaiinnovations/laya-multilingual#limits)、[上游已知限制](https://github.com/NandhaKishorM/laya#honest-limits)

本轮来源锚点：上游 GitHub `a4a8921afebfd852bba0000475cfb6ab737a124c`，HF checkpoint revision `1720e3e3357cfe1e281542e223f8273b0890ca34`。进入 E1 时重新核对并固定实际使用的模型、SDK、tokenizer 与校准版本，不用浮动 latest 混合测试结果。

2026-10-07 增补候选核对：[`SGK86/laya-multilingual-typed-decisions`](https://huggingface.co/SGK86/laya-multilingual-typed-decisions) 报告在其 typed-decisions 测试集上达到 0.786，不能据此推断中文 NPC 准确率；[`ZLHAOOO/laya-mlx-zh`](https://huggingface.co/ZLHAOOO/laya-mlx-zh) v0.2 报告 9 任务头 1116 个 held-out 决策上 0.750 对原版 0.681，但权重/推理主要面向 Apple Silicon MLX。两者模型卡标注 Apache-2.0；实际使用仍要核对各自权重、代码和数据来源。情感三分类的 [`leafiy/mia-laya`](https://huggingface.co/leafiy/mia-laya) 可作窄任务参考，不能与五类社会信号主排名混算；[`ZichenAI/layazh-zh`](https://huggingface.co/ZichenAI/layazh-zh) 标注自定义商业许可及部分研究用途训练数据，暂不进入可部署候选。以上均为上游自报，不是本项目实测。

用户提供的 [ModelScope 演示入口](https://modelscope.cn/studios/AI-ModelScope/laya-demo) 一并保留。当前公开读取只得到登录提示，未核实其运行 checkpoint、配置或实际推理结果；不能用该演示代替 benchmark。以上是资料核对，本轮没有下载模型、安装依赖、训练或执行推理。

### 10.2 E1：Narraverse NPC SocialSignal Benchmark

E1 先建立一套中文 NPC 社会交互测试集，离线评测，不先写 Runtime Adapter。正式样本规模和逐信号门槛在 E1 任务书中于运行前固定。

| 窄信号 | 首轮测试形状与解释边界 |
|---|---|
| `social_act` | 少量 choice，如威胁、示好、求助、合作、中性、不确定；仅描述 NPC 感知的交互性质 |
| `trust_shift` | 上升/不变/下降/不确定；是候选方向，不直接写 trust 数值，幅度由确定性规则映射 |
| `fear_shift` | 上升/不变/下降/不确定；与可见危险、人格及已知上下文分开标注 |
| `deception` | 有欺骗线索/缺乏线索/信息不足等 perception 标签；没有证据时不把潜在意图判成客观事实 |
| `boundary_violation` | 已越过/未越过/信息不足；基于该 NPC 明确可知的边界，不作全局道德判断 |

测试集必须包含正常例、否定、讽刺/隐喻、礼貌威胁、矛盾线索、多人物指代、中文与混合语言、信息不足和越界要求。输入只包含 Actor 可知上下文、相关事件与玩家行为；全知信息不能泄漏给模型。按场景/模板家族拆分训练、校准和最终测试集，避免同一句换名字跨集合泄漏；标签有定义、依据、分歧处理和“不确定”，不直接用一个模型生成的标签作唯一真值。

对每个候选固定 checkpoint revision、运行 SDK、问题措辞、choice 选项/顺序、输入预算和截断策略；语义输入、标签和最终测试集保持一致，MLX 的硬件与耗时单独报告。先测小选项集合，避免 yes/no 等标签诱导；加入选项置换、等义改写与短/长上下文对照，验证顺序/措辞偏差。不直接把连续 score 当可信心理刻度。

记录逐信号准确率、macro-F1/混淆矩阵、危险误判与漏判、Brier/ECE、拒答覆盖率和接受子集错误率；校准与阈值拟合只能使用校准集，最终测试不参与调参。原始 confidence 不能被称为正确率；上游的 act/escalate 概率也不能未经自测直接作为信号准入门槛。延迟/内存记录实际硬件与长度，不搬用官方毫秒数作本机承诺。

对每个 signal 单独给出“可准入 / 降级或删除 / 需要 fine-tune / 证据不足”的结论。fine-tune 不是必做流程：仅在基线失败类型明确、标注数据充足时提出，训练后重新校准并在未参与训练的测试集复验。无证据支持的信号不进入关键规则。

E1 产物为版本化数据与标签规范、可复跑离线评测、模型/配置/校准记录、逐信号准入表及 fallback 方案。E1 通过表示 benchmark 方法和准入结论可信，不要求所有信号都能使用，也不代表 Runtime 接入完成。

### 10.3 E2：规则接受、外部输入与确定性

Laya 定位为社会信号解释器，不接管吃饭、休息、工作、交易、攻击或基础避险；实际行为仍由 Needs / Utility AI / Goal 和世界规则决定。

```text
Actor 可知的有界上下文 + 玩家行动 + 相关事件
  → Laya SocialSignal 候选信号
  → 类型/置信度/时效/revision/身份与准入策略校验
  → 接受的 SocialSignal 作为一次外部输入记录
  → Utility AI / Goal
  → Command Engine / WorldState 确认实际行动和后果
  → LLM 表达结果
```

- Adapter 带 simulationId、actorId、requestId、发起时 revision/行动序号；过期、重复、对象已死或版本不符的结果不直接应用。
- 仅接受 E1 准入的信号，检查类型、有限数、范围、上下文与 confidence 所用校准版本；低置信度、超时或不可用走可解释 fallback，不阻塞世界。
- 通过规则接受的结果作为外部输入，在同一次提交中写入输入记录及 EventLog（如 `SocialSignalAccepted`）。保存 signal、已校准置信度、模型/checkpoint/schema/calibration/policy 版本、requestId、Actor、来源事件/上下文指纹、有效 revision、接受 tick 与 inputSeq；具体 DTO 和去重语义在 E2 冻结。
- 保存恢复或确定性重跑使用已接受 SocialSignal 及原顺序，不重新调用模型、不重新拟合校准、不再次应用同一输入。拒绝结果可以保留诊断，但不能伪装成已接受的世界事实。
- EventLog 记录此输入的接受，不意味着 A 的审计日志自动升级为完整事件溯源；E2 必须把输入记录与 checkpoint 一致性、重复接受和断点续跑作为真实验收。
- 离线部署仍是外部模型推理，不能因在本机运行就作为确定性内核直接写入者。需要准备完整依赖和断网验证；付费调用及桥启停继续遵守仓库授权。

### 10.4 E3/E4：表达与阶段验收

- LLM 只表达规则已确认的行为和事实；文本说“给你 100 金币”不能写背包，摘要不能创建历史。
- 历史摘要可追溯事件，NPC 可知范围与完整世界日志分离，模型上下文设限。

顺序：E1 中文 NPC SocialSignal Benchmark/准入表 → E2 异步接受、输入记录与 fallback → E3 对话表达 → E4 历史摘要/动态机会。当前只更新认知和计划，不开展这些实现任务。

**E 验收**：逐信号独立测试/校准证据可复核；关闭 AI 仍能完成 D；超时/重复/迟到/低置信度反例通过；恢复与重跑消费已接受信号而不调用模型；表达与事实冲突不改变世界。资料支持、本机断网推理、NPC benchmark 和 Runtime 接入分别报告验证范围。

## 11. F/G 与暂缓项

F 按需求推进完整 LOD、跨区运输、Rumor、势力和现实离线补算，不因有目录就默认开发。粗细模拟不要求每个微观事件完全一致，但须定义守恒、不变量和统计误差预算，并保证重要身份与事件不被跳过。

G 单独确定平台边界、模型网关、存档归属、迁移与回滚；独立项目路线不授权修改正式 8084 或其他仓库。

B 的 100 天闭环通过前暂缓大量技能/怪物/装备/Boss、大规模美术、复杂天气、大量 LLM NPC、世界生成、ECS、数据库/Worker 化；以后只因实测瓶颈或明确体验需要引入。

取舍明确：纯 JS/单写者降低验证成本，但暂不支持分布式并行世界；聚合人口控制规模，但普通居民不是永久精细个体；审计日志缩小 A 范围，但任意历史状态回放仍待开发。交付时不得隐去这些限制。

## 12. 交付与下一次开工

每项报告包含任务 ID、源码目录/分支/提交、变更范围、实际命令与结果、未验证事项、失败原因、下一项。实验另记 fixture/规则版本/seed/输入和产物路径；几行合理数字不等于因果验收。

`PROJECT_CONTEXT.md` 维护当前进度，本文维护合同和任务；直接修订相关小节，由 Git 保留历史，不追加多份冲突方案。

**实施入口：A1——确定性 RNG、SimulationClock 与 Scheduler。** 只实现 §4 和 A1 的定向测试，不提前做生态、迁移、页面或 AI。交付/验收状态以 PROJECT_CONTEXT 为准；A1 通过后才推进 A2，并按用户当次授权范围停下。
