# D3-5 接入边界方案（冻结前历史方案）

> 2026-10-12 阅读入口更新：本方案已由正式 [D3-5A 公共行为合同](D3-5A-PLAYABLE-ENCOUNTER-TASK.md) 与 [D3-5B 独立验收](D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md) 承接。原始合同发布 d13a897，范围解释 rev2 为 f667adf，字段勘误/死亡约束 rev3 为 c83492d。实施以正式合同和其补充为准；当前核心段需内部修正，完整 D3-5 未验收。
> 下文的“未冻结、未注册、冻结前须裁定”等措辞是冻结前历史状态，保留作决策依据，不要求施工队重新申请已完成的冻结，也不授权另造 shape/影子世界。源码及在途写者状态由中控 PROJECT_CONTEXT 与原生回执核实。

> 状态：**方案已裁定；未实施；不是开工合同。** 本文只定义下一阶段需要冻结的边界、阻塞项和最多两份后续合同结构，不授权修改源码、测试、服务、运行数据或存档。任何实现前，中控须完成技术审查、确定字段/接口形状与文件白名单，再另发冻结合同。
## 1. 目标体验与当前基准

用户要体验“骑砍式大地图 → 地点场景 → 互动/战斗 → 结果回到持续世界”。本轮只贯通一个有边界的 forest 地点：从 runtime-map 旅行到 forest，在地点场景进入狼遭遇，选择攻击或逃跑；
Runtime 裁决人物/狼健康、生死、耗时和狼账，保存关闭重开后继续同一世界。actor-2 的 M4 取食/收入闭环和 actor-3 cognition 每日行为持续。用户可以看到地点、角色与狼的进入路径、真实回执/状态结果并保存续玩；不承诺完整骑砍地图、全地图遭遇或通用场景系统。
集成基准候选为 D:/Narraverse-World-Map/hds-reservation，基准 SHA f335abf30e3eef9d1b40a99a791a6c3c6ae962ab；
其中包含 M4 最终提交 115e256eec196ffcf73f3e3010da5324ab101439 的祖先，旧 M4 生产 Git blob 相同，基准相对 M4 增加 4 个 D3 encounter 模块。M4 限定历史证据可按原范围沿用；尚无已验收的统一新 profile 或 D3→地图/场景/战斗体验。
新版本候选为 profile encounter-survival-village、规则版本 d-encounter-survival-v1。这些名称及其数据格式均未注册、未冻结。旧 d-player-v2、m-survival-v1 的轨迹和存档保持原义；
不自动迁移旧存档，也不把 D3-3 固定 sourceTick 的内存 session 升格成第二个世界或世界时钟。

## 2. 已裁定的权威边界

1. 唯一权威是一个受管 World Bundle、一个 command engine 和一个 runtime owner。
命令候选、事件、快照、索引投影与持久化必须走既有 Runtime 单写者事务；owner 采用完整候选校验后 save-then-swap。
2. UI/API 客户端只提交合法 intent 与当前 revision，不能提交结果、胜负、health、death、伤害、狼数、reservation、elapsed tick 或世界事件。真实玩家身体和遭遇状态从受管世界读取。
3. Encounter ACTIVE 状态、输入序号、事件与因果引用必须属于同一 bundle/revision、可由该版本完整审计。旧 D3-3 session 的 sourceTick 是建会话时固定的历史锚点，只能用于纯内核/历史回放，不得充当持续世界时钟。
4. Begin 不耗时；
attack 和 flee 各耗时 6 tick；cancel 耗时 0 tick。D3-4 的伤害规则候选仍为每次攻击对狼造成 150、未击杀时反击造成 80、wolf 初始 HP 300，但动态 HP 接入算法须按第 4 节与第 9 节阻塞项先冻结。
5. 攻击或逃跑结果在 completion target tick 上提交。相同 target tick 的次序复用现有 command-engine 已核实语义：先提交外部输入，再运行 beforeSystems 与到期日结；不得用 UI 或第二套推进循环绕开它。
6. Encounter ACTIVE 时仅接受 EncounterAction、EncounterCancel 及无副作用只读查询。TimeAdvance、Travel、Trade、Rest 等世界命令明确拒绝，不偷偷先推进时间。世界仍由 Runtime 按正常 tick 运行，其他 NPC 到日结照常消费/行动。
7. 延时动作真实跨过 tick 144 时，世界照常完成日结，完成动作时读取届时玩家当前 body health 和持久 wolfHealth 进行战斗裁决；初始战斗 fixture 的 health 不是跨日常量。
8. 若日结使玩家在动作完成 tick 之前死亡，动作以明确的 player-died 结果终止，不伪造战斗 win/lose；只要狼仍存活，归还 reservation 恰一次。实际已流逝时间与日结事实保留，未执行的攻击不得造成伤害或击杀。
若动作 completion 恰好是 tick 144，先完成该 tick 的玩家动作，再按规则日结；因此已完成的狼击杀不得被“前置死亡”分支撤销。终态码、事件 shape 与边界细节须在合同中冻结。
9. 玩家离开 Encounter ACTIVE 的唯一方式是成功的合法完成/取消/终止事务；
保存、加载、重开不能自行 cancel、释放后重生或重复扣减人口。
10. 新 rules 明确分离世界 tick 与提交 revision。通过完整输入、幂等、当前 revision 与预算检查的 Begin/cancel 零耗时命令（含领域拒绝）须令 revision/审计恰增一次、world tick 不变；
6 tick action 推进真实世界 tick 6，不伪造 tick 以换 revision。同 ID 同输入重试不再增加二者。
11. 当前 world-state 校验 snapshot.revision===tick，command-engine 的 idle 推进会直接设 revision=idleTarget，runtime-map 的 validReceipt（约 70–78 行）要求 revision 增长、tick 与 revision相等且 duration>=1。
方案裁定新 rules 将世界 tick 与独立单调 revision 分离；零耗时提交偏移可由权威历史重算表达。新 rules 必须显式版本化 snapshot/schema、service format、DTO 与 receipt。Idle 跳过须保住该偏移，持久文件命名以 durable revision 为准。具体字段/版本号由合同冻结；
旧 profile 的 revision=tick 和 DTO v1/v2 原样保留，不为满足旧解码器凑假 tick。
## 3. 新 profile 的生态账本与 actor 兼容

D3-1 reservation 内核有固定初始人口不变量 available + reserved + battleDeaths = initialPopulation。
D3-2 的 frame.world.wolves 表示 available，且禁止 battleDeaths；此模型没有真实跨日出生/自然死亡账，不能直接作为新 profile 的权威存档，不能修改 initialPopulation 来糊平跨日变化。
D3-1/D3-2/D3-3/D3-4 是已验收的窄内核/候选适配/会话/战斗片；只可复用其有证明的纯语义，不宣称四个模块原样组合成跨日生产 Runtime。

新 profile 保留生态权威字段“总活狼”的意义；遭遇的 held wolf 只是该总数中一个精细预留实例，不是第二套群体人口。
公用世界、人口、钱与运行时钟只有一个权威 World Bundle。建议的可用数为 available = totalLivingWolves - reservedWolves；预留本身不改变真实死亡账。新 profile validator 必须拒绝越界、负数、重复预留及不平账状态。
战斗胜利且实际狼死亡时，在一个权威提交中释放 reservation、让 totalLivingWolves 减 1、让 battleDeaths 加 1，并写入可审计死亡事件。逃跑、取消、玩家先死亡或狼未死，只释放 reservation，不记死亡。
不得将真实战斗死亡塞进 removed、predation、hunted 等既有统计来凑守恒。

新 profile 的累计守恒应明确验证：总活狼 = 初始狼数 + 出生 - 自然死亡 - 饥饿死亡 - 狩猎死亡 - 真实移除 - battleDeaths。
跨日聚合只对 available 狼执行出生、捕食及其他群体日结；reserved 狼不参与会与单体战斗冲突的聚合出生/捕食/死亡。一个日结事务须提交聚合生态、单体预留及其他实体变化，不留中间不一致状态。旧 ecology v1 不得直接读取或接受新账本。

这不是“日结结束后把 held wolf 加回去”的窄补丁。
狼的可用数、群体聚合、日结来源、事件因果、战斗死亡与 checkpoint/replay 的精确字段和接入钩子都是**待技术冻结接口**；需要源码责任人先审查真实消费链，并用并行边界反例证明守恒和顺序。reservation 与新 profile 的映射不得复用 D3-2 frame 作为权威存档。
旧 actor validator 只允许 deathTick 为 144 的倍数。新 profile 若支持任意 tick 的真实战斗死亡，必须版本化地允许相应死因/时间，保留墓碑、ledger、needs 与既有历史，确保死亡立即影响后续日结/行动且不会复活；旧 profile validator 和存档语义不变。
actor 死亡事件、终态字段、重演校验及 actor-3 cognition 后续消费属于冻结阻塞项。

## 4. 战斗生命值、日结和死亡裁决

D3-4 当前是纯 HP 可达性内核及同日 oracle；它从冻结的初始 player health 开始，不能原样承担跨日 Runtime 身体变化。
实施方案应保留固定伤害参数候选，但每个实际完成 action 都从当前玩家 body health 与持久 wolfHealth 开始裁决，并将被日结改变的 body 字段、来源事件和新 HP 一起写入新 profile。

bodyHealth 唯一来自权威 actors；
wolfHealth 是受管世界中唯一 held wolf 实例的战斗状态。不得把人物当前 HP 或狼 HP 另存为会话里的第二份权威血量。初始值只能留作历史锚点，不能在日结后篡改成当前值。

同日 D3-4 结果仍可作为新 Runtime 的直接对照：初始玩家 health 1000，两次攻击各耗 6 tick；
狼先受击，再按 150/80 规则反击，最终结果、round/tick 与 oracle 一致。跨日则须单独验证日结饥饿/恢复/疲劳等规则先真实作用于人物，再由实际 health 判定战斗承受能力；不可改写初始 health 来伪装日结结果。
在动作尚未执行而人物已死亡时，回执必须区分领域拒绝/提前终止与实际战斗结果；未发生的攻击不扣 wolf health，已过去的时间、死亡及 NPC 日结均留在事件历史。动作完成恰逢死亡日结时依第 2 节顺序。所有拒绝不再施加伤害，reservation 最多归还一次。
D3-4 的纯战斗合同保持可兼容，不更改既有已验收语义。具体如何将 battle state 转为当前 body/狼字段、何时产生单体死亡、跨日最多允许几次动作，以及事件与 result 对照均是**待冻结项**；未裁定前不能声称“复用 D3-4 即可”。
## 5. 幂等、持久化、重演和兼容门

每个外部命令需完整 canonical 输入与 currentRevision。同 ID 同完整输入无论当前 revision 已 stale 或队列已满，都返回原 receipt 且不二次提交；同 ID 异输入优先返回 COMMAND_ID_CONFLICT。
新 ID 先检查 expected revision，再检查请求预算；stale revision 不占 ID/预算，超限也不留下部分事件。该顺序与同 ID 去重/冲突优先级一起在新合同冻结。

投影候选须在保存前预构建并验证。
耐久提交的发布点之前若 save/rename 失败，必须保持 World Bundle、RNG、事件/receipt、NPC 决策、投影和已有正式文件为原状态，并按既有清理规则处理临时文件。耐久提交成功后崩溃或响应丢失属于已提交待恢复，不得声称回滚磁盘；
同 ID 同输入重试/重开必须返回原 receipt 并恰好提交一次。合同须定义 durable linearization point，并实注入其前的 save fault。
保存中的 ACTIVE reservation、已过 action 时间、actor death、NPC 日结和 pending encounter 均须在关闭/重开后保持同一结论；不得恢复成可再战的重生狼或遗漏实际死亡。采用 checkpoint + 完整规范输入/事件链做审计与恢复；
篡改 reservation、伤害、来源、输入、事件因果或旧规则版本须拒绝。旧格式可明确报“不支持此规则/格式”，不自动升级、不安装工具、不迁移用户真实存档。
新 profile/rules 必须显式分派 validator、runtime hooks、runner、服务 loader、checkpoint、保存、重放与只读投影。跨 profile 的误路由、缺依赖和内部错误均需 fail-closed；不允许无声降级到旧生态/旧 combat。
## 6. M4 能力持续与交叉门

M4 仅限已验收范围：profile survival-village（rules m-survival-v1）下 actor-2 的有界取食/收入闭环及 actor-3 cognition 持续运行。
M4 最终源 115e256eec196ffcf73f3e3010da5324ab101439 的 final-acceptance-index.json 引用 runtime-direct-final.log 中 earn-then-buy 测试 127/152，matched 9/9；
这是**可引用的历史证据，不是本轮新跑**。M4 保持限定 PASS。新 profile 集成必须额外证明遭遇不会破坏 actor-2 的本人计划/资金/购粮、actor-3 每日日结 cognition 与旧 profile 轨迹，不能将 M4 的通过范围扩大成 D3 集成通过。
现有 Rest 用例 333 未建立 activePlan；相邻 commitment 用例 342 是独立场景。源码中 fatigue urgent Rest 路径可生成/绑定 recover-rest，而暂停槽目前主要保留 recover-health。这只是**未复现的静态组合风险**，不裁定旧 M4 缺陷。
集成前须有真实合法组合反例：先形成有效 secure-food 承诺，再触发紧急 Rest，检验 planId/步骤、请求与 deadline 是否保留/可恢复、是否每日最多一动作、工资是否仅付一次、购粮是否仍按权威条件成功或有理由失败。按证据裁定需修改或确认边界，再冻结实施合同。
## 7. 主参考与可复用体验入口

唯一主参考采用固定库快照 b0b13a3baccf0d26fae167f7827930a1df995876 中的 Bannerlord Campaign Map / PAT-018：采用地图→地点/遭遇的编排、已验证参与者上下文、结构化 Context 进入场景、World Runtime 校验提交 Outcome。不移植 Party/商队移动，不重研全库、不搬通用框架、不建立 Runtime 之外的第二状态或结果权威。
官方公开 API 可核对 [EncounterManager 1.3.4](https://apidoc.bannerlord.com/v/1.3.4/class_tale_worlds_1_1_campaign_system_1_1_encounter_manager.html) 的 StartPartyEncounter / StartSettlementEncounter，以及 [PlayerEncounter 1.3.4](https://apidoc.bannerlord.com/v/1.3.4/class_tale_worlds_1_1_campaign_system_1_1_encounters_1_1_player_encounter.html) 的 Battle、EncounterSettlement、Finish、OnLoad 边界。
它们只证明公开遭遇/结算入口，不证明上游内部算法；Narraverse Context/Outcome 是本项目适配裁定。

- runtime-map.html、runtime-map.mjs、runtime-map.css 是当前服务投影与旅行/动作入口。
runtime-map.mjs 的 submitIntent、pending 重试、409 与 controls（约 95–117 行）可按新 profile capability 扩展。validReceipt（约 70–78 行）当前假设旧 DTO 的 revision/tick/耗时关系；
需新 DTO 版本支持 Begin/cancel 为 0 tick 但 revision 增长，不能放宽旧 DTO v1/v2。
- 旧 index.html 可参考 battleUrl（约 359 行）、迎战跳转（375）、地点进入 scene（392、410）、遇敌面板（487）的地图编排交互。
其本地对象和存档不成为新 profile 世界状态。
- scene.html 约 1719 行后的地点配置、actor 层、门钥匙互动和纯渲染素材可作为窄场景的展示/交互壳；身份、地点、可执行动作与互动结果都由新 Runtime 上下文/命令决定。
- battle.html 约 64–93 行的 HP 条、攻击/逃跑按钮、画布、日志与结果展示可复用其视觉结构/素材。约 128–160 行由 URL 和 R.load 私档创建本地 battle、约 301–305 行浏览器侧伤害计算、约 428 行随机逃跑都不是权威，不能直接把旧 battle 整页接入新服务。
- runtime-server.mjs 约 10–13 行采用静态资源显式 allowlist 与禁止 inline 的 CSP。新体验需审查后添加明确页面/外部脚本资源；不直接服务含旧本地状态/API/可选云调用的 scene/battle 整页。
场景传递只含地图已验证地点 ID、玩家身份、Runtime revision 和窄遭遇上下文；战斗 UI 只发送 encounter ID、command ID、expected revision 与允许的 action intent。状态只读新服务投影；
结果由 Runtime 回传地图/场景，不让浏览器提交 health、伤害、胜负、狼数或 elapsed tick。
## 8. 实施合同的结构与检查点

用户功能交付目标是一轮完整窄场景接入：A 实现合同内部含三个按真实消费者递进的 checkpoint，B 为独立集成验收合同，最多两份任务书。checkpoint 是同一轮内的实现顺序，不是三轮交付；只有冻结前发现可复核的真实源码/运行阻塞并经中控另行裁定，才考虑拆分。不得默认拆轮或承诺工期。实际集成 SHA 由中控逐 checkpoint 冻结，本方案不猜接口签名或文件白名单。
**Checkpoint A — Runtime world + time + events + CLI。** A 任务首个检查点必须将真实 forest 玩家、reservation、持久狼、权威事件/输入、世界 tick 与已注册日结放入同一新 profile。
CLI 实际消费攻击/逃跑、跨 144 日界、角色当前 health 和狼账；同 tick 顺序、NPC 正常日结、玩家死亡前后与战斗归账均形成真实事件链。没有先做另一个只停在 session/DTO 的“过渡内核”。

**Checkpoint B — Service + persistence**
同一命令链经现有单 owner 服务入口提交，revision、receipt、checkpoint/replay 与 save-then-swap 保持一致。以新 data-dir 启动独立服务，故障注入后同输入重试一次，关闭重开仍核对 world、狼数/账、人物、NPC、事件与投影。
检查 loader、旧 profile 回归和明确的未知版本拒绝。

**Checkpoint C — 复用 UI 体验。** 从 runtime-map 的真实 forest 旅行进入窄地点场景，再进入 Runtime 遭遇；
复用地点布局/互动壳及 battle HP/按钮/画布/日志/结果结构，数值、动作与结果全部来自新服务投影/receipt。结果返回地图/场景并显示耗时、health/death/狼变化；ACTIVE 的其他世界命令显示有因果的拒绝。保存、关闭、重开后继续同一世界，actor-2/3 继续消费。
借用体验对话 01a12aff-2703-71c2-ab00-cc7ae733ca2a 和既有 DSH 包工头对话，不新建中控或触碰当前 M4 体验环境。C 后由 B 合同独立验收；A 收口一次性覆盖本合同直接影响，公共时间/重演/存档变更才扩大对应回归。
## 9. 冻结前阻塞清单与验收底线

冻结实施合同前，中控必须裁定并在合同中写明：新 profile/rules 注册名与完整字段 shape；World Bundle 中 encounter/actor/body/狼/reservation 的唯一归属；
事件类型、输入 intent、receipt/终态码与 cause/ref；同 tick 和死亡边界；生态总活狼/available/reserved 的日结 adapter 及守恒 proof；任意 tick actor death 与墓碑/ledger validator；当前 HP 的日结交互和持续遭遇动作限制；
checkpoint/replay/service save 故障注入及 durable linearization point；snapshot.revision/tick 分离、idle offset、service format/DTO/receipt 版本与旧 DTO v1/v2 兼容门；
UI 地图→地点场景→遭遇→结果回传的消费入口；M4 active secure-food × urgent Rest 组合证据；逐阶段文件白名单、启动命令、新 data-dir 与可复核证据索引。

未解决上述任一项时，只能先做只读技术冻结，不开工生产文件；不得由执行者猜 API、目录白名单或终态码。
任务范围不得顺手增加 Hunt、新机会/关系/经济/治疗系统、模型接入、通用遭遇框架、旧存档迁移、部署或正式平台整合。

阶段验收至少需交叉通过：同日 battle oracle；跨 144 日界狼仍被预留且只结算一次；available/wildlife/battleDeaths 全守恒；
玩家先死与 completion==144 两种顺序反例；NPC actor-2 plan × urgent Rest 与真实工资/购粮；actor-3 cognition 继续；save fault + same-ID retry；ACTIVE/死亡 checkpoint reopen 与完整 replay；
旧 profile 固定历史兼容；runtime-map forest旅行→地点互动→狼遭遇→Runtime结果回传闭环。各证据必须绑定精确源码 SHA、测试 SHA、实际 CLI/服务启动入口和新 data-dir，并标清复用的历史证据与本次新跑证据。
当前仅形成方案：无源改动、无服务启动、无真实数据迁移、无实现测试或新验收结论。根目录文档/看板更新与后续合同发布由中控在复核本方案后另行处理；源码 push 当前未授权，本轮不 push。
