# 项目指导书：世界运行时与人物心智

更新时间：2026-10-16 16:57（Asia/Shanghai）

## 1. 项目方向与边界

本项目是独立的 Narraverse World Map 原型，目标是构建确定性纯 JavaScript 单写者 World Runtime，并让地图、场景、战斗与文字互动落在同一持续世界中。它不是 Narraverse 正式平台，也不代表已经集成 Module 4。

用户价值是：在一个可持续推进的世界里，不同角色凭各自有限的知识、动机与经历形成判断和行动；玩家在地图、场景、战斗或文字入口造成的结果，最终由同一世界规则裁决并留下可重演状态。Director 可制造处境、压力与机会，角色心智决定回应，World Runtime 决定事实。

保持现有纯 JS/HTML 项目形态。当前主线不是自由对话模型、全人口实时 AI、完整心理学或国家级模拟。所有现存和计划中的实时能力均以实际源码、合同与运行证据为准；本指南描述方向，不证明功能已实现。

## 2. 文档分工与冲突处理

- 本指南：项目稳定方向、职责边界、复杂度取舍与参考模式。
- [世界运行时架构与分阶段计划](WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md)：详细架构、阶段依赖与阶段边界。
- [tasks/](tasks/)：具体冻结合同、文件范围、输入输出和验收标准；执行以任务书为准。
- [当前状态与接手方向](PROJECT_CONTEXT.md)：唯一最新进度状态与下一步入口。
- [Character Mind 灵感笔记 v0.2](docs/character-mind/NPC_Brain_Character_Mind_Runtime_灵感笔记_v0.2.md)：愿景与探索材料，不是实施承诺。
- 外部参考库：设计资料与开源项目线索，不是开发排期、内部实现证明或本项目合同。

本指南不隐式修改或扩张已发布的 M3-2 合同。若稳定方向与已发布合同冲突，中控先修订合同、说明影响并重新冻结；执行者不得猜测或自行扩项。实际状态以 Git、源码、任务合同和本轮验证证据为准，旧报告只代表其当时的验证范围。

## 3. 世界、心智与提交权限

| 部分 | 唯一职责 | 权限边界 |
|---|---|---|
| World | 世界事实、资产、位置、时间、规则、生死和权威状态 | 仅经 Runtime 的权威事务路径（命令及已注册周期规则）改变事实 |
| Mind | 角色有限可知信息、belief、判断、动机、意图、计划与学习 | 只能使用本人有界输入；不能直接写世界 |
| Command | 校验并提交唯一权威世界变更 | 成功或拒绝都产生可审计结果；不得被模型绕过 |
| Controller | 触发、预算、版本、请求合并、接受/提交与 fallback | 管流程和权限，不创造世界事实 |
| Director | 提议情境、压力、机会与合适事件参与者 | 不替角色决定回应，不预定结局，不越权写事实 |
| Provider | 提供可选解释、策略候选或表达 | 只读输入、无写权限；接受且影响未来的输出须固化重演 |
| UI | 展示状态并提出合法命令 | 不作为事实权威，不绕过 Command |

Snapshot 保存唯一提交后的权威状态。EventLog 用于事实审计，不承诺单凭日志重建状态。确定性复现依靠固定初始配置、规则/数据版本与有序输入；续跑依靠完整 checkpoint。可重建的评分、展示和缓存属于派生数据。模型或 Provider 的已接受结果若影响未来，必须与版本和次序一并记录，重演消费记录而不重新调用或采样。

人物有限知识与世界真相分开。某人听到“仓库无药”是真实发言事件；仓库是否无药仍是待核实命题。Belief 保留主体、命题、来源、证据/反证与更新时间；全知 World Bundle 不得作为角色输入。执行器可读取真库存校验命令，但拒绝原因也须按可知规则过滤。

## 4. 确定性主链与复杂度预算

```text
World Snapshot
  → 过滤后的本人可知信息 / 有界证据
  → Belief、经历、需求与动机
  → 有限候选与有限计划
  → Command 校验与单写者提交
  → 真实成功或拒绝结果
  → 本人观察、记忆与后续学习
```

高频、高影响、可验证且需要重演的规则进入 Runtime。低频、语义复杂、难形式化且不直接改世界的内容，可在真实需求出现后交由可选 Provider 提供候选；模型不逐 tick 调用，不给每个 NPC 建常驻 API 通道，也不负责世界裁决。

M3-1 已交付的工作经验纯内核处理最近四次本人工作结果记录，仅校验输入数据结构与内核不变量；它本身不证明工作真实发生。真实事件、命令和回执的关联须由 M3-2 adapter 核对并接入运行时，当前进度见状态文件。这个窄实验不代表全部心智能力、通用学习或模型已接入。

认知 LOD 与物理模拟 L0/L1/L2 是两条独立轴。认知降频依据重要性与当前相关性；恢复须延续保存的本人状态和可传达的新事实。降频不能暂停已承诺计划、世界时间或日结规则，不能捏造离场历史，也不能把重要角色退化成匿名计数。

扩展前先证明可体验消费链，再添加心理字段或通用模块。性能结论必须来自固定历史和明确工作负载的实测；回执、日志上限、预算或小 fixture 都不等于规模性能证明。确定性、高频裁决留在规则层；复杂、低频表达按需实验，并保持无模型路径成立。

## 5. 推进主线与停止点

近期按消费链顺序推进：①真实世界活动日志先呈现已有事实与结果；②在现有村庄/森林贯通地图→地点人物与活动→已有交互→返回同一世界；③围绕少数重要人物补可追踪的工作/休息/取食/地点变化，再评估扩地图。后两步只是后续指引，不随日志轮并行开工；日志不以全部性能问题解决为前置，仍不得把几十秒等待称为日常流畅。

主线阶段依赖与稳定边界见本指南后续章节；阶段通过情况、源码/分支基准和接手事项只维护在 [当前状态](PROJECT_CONTEXT.md)。冻结合同仍以 `tasks/` 对应文件为准。M4 完成与 D3 后续集成边界以当前状态文件和原合同证据为准，不把历史摘要当作现状。

闭环仅扩展新 survival-village/m-survival-v1 中的 actor-2：本人私粮不足 → 本人可知的有来源报价/合法工作机会 → 买粮或工作后买粮 → 私有库存真实入账 → 原日结真实消费。Work 成功正常关闭职责，后续购粮步骤仍保留承诺；不扫描公共现金来作心智选择。无收入、付不起工资、真实缺粮时等待/失败/死亡都允许，不以 NoAction 越少或永久存活为目标。

保持旧 profile/旧存档隔离；不加 Hunt、救济、关系、情绪、模型、通用职业/机会系统或通用多目标。单次买1粮并日结吃1粮不代表能积累储备；M4 合同仅定义有界能力，不承诺百日平衡。原始 M3 证据异地保全是独立收尾项，不为发布本轮重跑已验收模拟或安装新工具。

M3-2、M3-3、[M3-4A](tasks/M3-4A-COGNITION-INSPECTOR-TASK.md)/[M3-4B](tasks/M3-4B-M3-CLOSEOUT-ACCEPTANCE-TASK.md)是已收口历史合同，不再称下一轮，也不静默改正文。历史测试仅在文件及直接依赖均未变化时复用；新增规则的公共分派、重演与服务格式按直接影响扩大验证，不再泛跑旧 M3 全量。

D3/D4 按真实遭遇需求另冻最小地图上下文、场景结果和 World Runtime 写回；不能因参考库提前搭建通用商队、国家经济或全自动任务网络。F/G 只按消费需求推进；正式平台身份映射、真实旧存档迁移、部署与旧实例仍需单独授权。

## 6. 已知审查关注点与触发条件

以下是基于 `fe1dec0` 源码基准的静态风险与后续触发点，不是本轮 benchmark 结果，也不是当前重写任务。

1. **Profile 分派与底层依赖。** 规则分派若继续散落或底层反向依赖应用层，后续新增 profile 时先建立有界的 hooks、validator、wakeup 映射；可把工厂从 fixture 移入适配层。不要现在重写全套模块。
2. **Replay 和活动 tick 成本。** `getBundle`、`createSimulationSession`、玩家动作存在多次完整审计入口，活动 tick 存在重复 proof。扩规模前，固定历史并分别测动作、读取、保存的耗时与调用次数。不要为了测快直接删除校验。
3. **规模证据。** 1000 天小 fixture 只证明该 fixture 的运行情况，不证明千人性能。日志、回执和预算上限也不是性能保证。未来压缩历史须保住因果、去重与完整重演依据。
4. **Continuation 与日结。** continuation / review 走不同路径可以减少候选比较；但继续承诺仍需权威执行、观察与日结，不得跳过整段 `beforeSystems` 或其他世界规则。
5. **版本隔离。** 新规则不能静默改变旧轨迹；新 profile 显式选版本，旧档没有自动迁移。任何格式或规则迁移都须单独合同、反例与回滚方案。
6. **体验先于字段。** 心理字段只有在体验消费者确实读取、展示或改变可验证行为时再加入；不为理论完整性扩字段。

## 7. 参考模式：可借原则，不等于上游实现

以下采用 GitHub 参考库固定快照 `b0b13a3baccf0d26fae167f7827930a1df995876`。截至 2026-10-09 本次取证，参考库属于 `docs/game-ai-reference-library-20261008` 分支；`main` 的 `a7a10f2` 没有该目录，本地 control 树也没有参考库副本。链接均指固定 commit，不以浮动分支替代证据。

表中区分已采用的设计原则与尚待评估的候选；两者都不自动表示本项目已实现、已验收或上游游戏内部恰按此方式工作。参考库内旧 M2/M3 阶段标签只是参考库当时的分类，不是本项目当前进度；以 PROJECT_CONTEXT.md 为准。上游公开表现、开发者说明、官方 API、开源源码和社区资料的证据等级须分别标注。

| 模式 / 来源 | 借鉴内容 | 不搬什么 | 落点与状态 |
|---|---|---|---|
| **PAT-001/003 / The Sims、RimWorld**；[模式决策][ref-patterns] | Need 是动机输入；Behavior Provider/Affordance 只暴露有限候选 | 不让 Need 直接变命令，不扫描全行为宇宙；不扩大 M3 已冻结候选 | PAT-001 原则沿用；PAT-003 为候选，待真实机会系统消费者出现后评估 |
| **PAT-004 / Cataclysm: DDA**；[模式决策][ref-patterns] | Goal commitment 与防抖，沿用 M2 已有窄语义 | 不移植完整 NPC AI 或扩张 M3-2 合同 | M2 原则沿用；参考源码有固定提交证据 |
| **PAT-006/002 / Shadows of Doubt、RimWorld、Oxygen Not Included**；[模式决策][ref-patterns] | 日常 Routine 低成本推进，相关事件唤醒；PAT-002 双通道是紧急/常规参考线索 | 不宣称博客等于最终发行源码；PAT-002 尚未本轮一手复核，不新增紧急通道任务 | 两项均为候选；M3-3 沿用既有计划的低成本维护；新通用 Routine 仍属后续，不据此新增日程系统 |
| **PAT-007 / Veloren rtsim、S.T.A.L.K.E.R. A-Life**；[模式决策][ref-patterns] | 认知 LOD 按重要性×相关性；远端可使用长时 Action 与低频更新 | 重要性×相关性是 Narraverse 设计，不伪称 Veloren 上游公式；STALKER 社区 Mod 资料不作原版一手规格 | 认知分级已由 M3 接入并验收；通用远端长时 Action 与物理精度切换仍是后续候选 |
| **PAT-011/018 / Bannerlord**；[模块索引][ref-modules]、[世界地图索引][ref-world-index] | Campaign Map 编排地图到遭遇；结构化 Context 进入场景、Outcome 由 World Runtime 校验提交 | 官方 API 只证明移动实体与决策节奏；Context/Outcome 单写者边界是本项目设计 | PAT-018 设计已采纳、窄内核已验；真实场景消费待接入，以当前状态文件为准；PAT-011 地图编排候选，不因此加通用商队 |
| **PAT-012/013 / Bannerlord、Endless Sky**；[模式决策][ref-patterns]、[世界地图索引][ref-world-index] | 重要 Party 可作为持久地图实体；重要物流批次可实体化 | 不把每单位商品实体化，不提前做完整经济模拟 | F 后续真实需求；当前不实施物流系统 |
| **PAT-015 / Battle Brothers、Endless Sky**；[模式决策][ref-patterns]、[世界地图索引][ref-world-index] | 真实世界问题派生任务，形成玩家处理到世界后果的因果链 | Battle Brothers 条目尚未独立复核；不做无因果任务或自动生成网络 | 后续任务消费者；Endless Sky 条件/触发文档可核对 |
| **PAT-009/016 / Shadows of Doubt、Starsector、Caves of Qud**；[模式决策][ref-patterns]、[世界地图索引][ref-world-index] | 世界事实与主观状态分开；地图情报可有来源、时效、不完整或错误 | NPC 输入与面向玩家的情报界面按可知性过滤；开发者检查器可独立展示全知对照，不向前两者透传 | 两项原则已定；地图侧情报实现待后续合同，不要求本轮改造已验收调试页 |
| **PAT-008 / Wildermyth**；[模式决策][ref-patterns] | Director 可按人格、关系与历史 hook 选择适合事件的人物，由角色心智回应 | 不预定人物结局；本轮未核对 Wildermyth 原站，参考库摘录仍属线索 | 选角原则已定，实现留后续专题，不属于当前 D3/D4 必做 |

2026-10-09 整理时复核的上游证据（本轮不重复核对以下全部来源）：CDDA 的 [npcmove.cpp 固定提交](https://github.com/CleverRaven/Cataclysm-DDA/blob/1d0db7c75849d762808637f9b9517d809c2f7437/src/npcmove.cpp#L1708-L1715) 显示目标承诺防抖相关代码；[Veloren 0.18.0 NPC AI 文档](https://docs.veloren.net/veloren_rtsim/rule/npc_ai/index.html) 说明长时 Action/controller 与 `SIMULATED_TICK_SKIP`；[Shadows of Doubt 2018 年城市模拟开发博客](https://colepowered.com/shadows-of-doubt-devblog-8-simulating-a-city/) 说明当时的日常预规划和异常重算设计，不作为最终发行实现的证明；[Bannerlord MobilePartyAi 官方 API](https://apidoc.bannerlord.com/v/1.3.4/class_tale_worlds_1_1_campaign_system_1_1_party_1_1_mobile_party_ai.html) 可见 `RethinkAtNextHourlyTick` 与 `DoNotMakeNewDecisions`；[Endless Sky Creating Missions](https://github.com/endless-sky/endless-sky/wiki/CreatingMissions) 描述条件、期限与动作触发。

参考库建议的其他模式保留为远期线索：Kenshi World State/Town Override、Factorio 区域压力场、Caves of Qud 历史痕迹。它们不构成当前实施授权；不得据此提前搭建完整派系覆盖、全地图扩散场或程序历史系统。

## 8. 未来查阅与采用流程

每次具体设计只选 **1 个主参考，最多 2 个辅助参考**。按固定快照核对原文来源与证据类型，先说明本项目适配点和拒绝照搬点，再写可体验场景、必要反例与成本预算；中控冻结任务合同后才实施，验收后更新唯一状态入口。

任务链应短而可验证：具体问题 → 定向参考 → 本项目适配/拒绝理由 → 可体验场景与反例 → 冻结合同 → 有界实现 → 独立验收 → 更新 `PROJECT_CONTEXT.md`。长文本整理、机械操作和可拆分测试可委派；复杂核心设计由中控复核。只做与改动风险相称的定向检查，阶段收口复用有效证据，仅补当前核心交付直接必要的最少定向功能检查；不以测试数量代替真实消费者链。
施工团队操作入口（2026-10-13）：DSH 工作区 `D:Narraverse-World-Map` 的 `docs/operations/DSH-TEAM-RUNBOOK.md` 定义额度错误分流、短工单、写租约及压缩恢复；`.dsh-team/STATE.json` 是工人/包工头持久检查点。运行册和状态当前仅本地，后续进场必须按新任务登记的执行树与精确基准核现场，不把根目录旧 A1 HEAD 当 D4 基准。子代理请求路由与实际路由分别记录；未可观测的额度/身份写 unknown。此次两名顺序工人验证了检查点读取接续；额度触发自动换路、强杀恢复及宿主 API 完善尚未实现/验证，不据此宣称自动接管。操作运行册不替代冻结业务合同。

稳定工作原则：

- 每阶段优先一轮交付完整窄场景，可在实现任务内设置真实消费者 checkpoint；仅确有集成阻塞才拆独立片，不以小内核数量替代体验。
- 规则交叉场景与最小反例先于用例数量扩张，优先证明边界不会被相邻规则绕过。
- 计划、实现、独立验收分别记录；一项工作最多保留两份相互引用的合同，同一文件同一时段只有一名写入者。
- 交接包写明集成基准 SHA、启动入口、必要证据索引和停止点；远端保存仅按既有授权执行，未授权不推送。
- 复用既有 DSH 包工头与体验线，避免重复派工或把内核测试误当实际体验。

引用外部代码前，先确定固定 commit、文件与许可证，并按许可证处理；本指导书不作法律结论，也不授权复制代码、公开仓库、部署或付费调用。不要把分支名称、游戏宣传文案、社区 Wiki 或开发博客写成内部源码证明。

## 9. 参考证据的使用边界

参考材料只回答“某种设计是否值得本项目试用”，不能代替本项目的接口合同或验收。采用时注明来源类型：官方文档/API、固定提交源码、开发者公开说明、社区指南、Wiki/二手整理；引用上游行为表现时，只描述可见行为或作者明确说明，不推断未公开的内部源码结构。

开源实现阅读用于理解数据结构、边界和测试思路，不自动成为代码复制许可。来源仓库的 license、具体文件归属、固定 commit 和派生方式需要在复用前核对。外部依赖升级、游戏新版本和当前项目阶段变化都可能使旧结论过期，因此主指导书保留稳定结论，细节留在定向任务材料。

模式之间有时会给出不同机制。例如 routine 可以减少远端计算，Utility 候选可以表达局部机会，目标承诺可以避免抖动；它们不应拼成一个无边界的大型 AI。落入 Narraverse 时，优先检查是否能由确定性单写者、有限状态和小型纯函数表达，并让命令拒绝保持可解释。

## 10. 场景和验证的最低要求

每项新能力都要指出谁在何处消费它、输入来自谁、权威结果由谁提交，以及保存/恢复后如何保持同一结果。只有类型、Provider 返回值或 UI 按钮而没有真实消费者链，不构成闭环。

按用户2026-10-14明确指令，验证仅运行当前核心交付直接必要的最少定向功能检查；有效原始通过证据所对应的源码及直接依赖未变时复用。不跑全量（包括公共底座变更或阶段收口触发）、无关测试，不为验收扩展边角测试或重构，也不做截图、录屏、像素、布局或视觉巡检；该指令调整此前冲突的视觉、全量和阶段门约定，不改写冻结历史任务书/验收合同。真实输入边界、权威状态及存档/恢复校验仍是核心功能要求。取消或未验证项如实标注，不得写成通过。

性能任务先冻结工作负载与测量边界：历史长度、角色数、动作/读取/保存次数、并发条件、机器与耗时口径。记录源码指纹并区分平均值、尾部和峰值；单次小样本不得外推到千人或长期规模。

交付状态分清：方向已采纳、合同已冻结、实现已提交、独立验收已通过是不同状态。报告引用证据时说明提交、文件、运行范围和未测项；不以旧阶段通过、外部游戏表现或执行者数量汇报替代本阶段证据。恢复包在本机的完整性/恢复验证不等于异地备份。`required` 成员缺失、损坏或与声明不符时必须阻断 PASS；`sourceHash` 只覆盖明示的源文件集合，须与独立的包成员/归档 manifest 分开核验。未提交的 A 工作区改动不自动包含在恢复包中，须明确列为包外内容。执行者遵守任务合同的推送边界，未获明确授权不自行 push。

本地保全的精确来源、裁定范围和必需 expected 指纹见 [恢复证据索引](docs/evidence/PRESERVATION-20261009.json)；该索引不另作进度状态源。该保全记录当时只验证包完整性与恢复，不代表后续源码/文档的推送状态；当前推送状态见 `PROJECT_CONTEXT.md`。

## 11. 资料快照与稳定链接

以下链接固定到参考库快照，不依赖分支名：

[参考库入口][ref-readme] · [模式决策][ref-patterns] · [模块索引][ref-modules] · [世界地图索引][ref-world-index] · [代码证据索引][ref-code] · [采用流程][ref-adoption] · [游戏目录][ref-games] · [沙盒世界目录][ref-sandbox] · [世界地图清单][ref-checklist]

该快照 SHA：`b0b13a3baccf0d26fae167f7827930a1df995876`。本指南引用参考库摘录时，继续保留“线索”与“独立核验”区别；若来源文件发生变化，更新链接和证据说明，不静默改写旧结论。

[ref-readme]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/README.md
[ref-patterns]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/PATTERN-DECISIONS.md
[ref-modules]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/MODULE-INDEX.md
[ref-world-index]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/WORLD-MAP-INDEX.md
[ref-code]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/CODE-REFERENCE.md
[ref-adoption]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/ADOPTION-PROTOCOL.md
[ref-games]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/GAME-CATALOG.md
[ref-sandbox]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/SANDBOX-WORLD-CATALOG.md
[ref-checklist]: https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/WORLD-MAP-CHECKLIST.md
