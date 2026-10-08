# M2 共同合同：动机计划与受约束反事实

合同版本：`m2-contract-v2`；状态：A1 已验收，A2/B/C 已本地集成；独立验收 29/30，浏览器断言待修，阶段全量回归未开始；M2 未验收。冻结日期：2026-10-08（Asia/Shanghai）。本合同是 M2A1、M2A2、M2B、M2C 的唯一公共定义；修改公共字段、公式、顺序或错误语义，须由中控同步修订本合同及受影响任务书。四份任务书与本文共用一个合同版本。本文取代尚未开工的 `m2-contract-v1`（发布提交 `be7ca9ba44684c7b1e2cbf1c9051b94bef4f3b68`）；v1 保留在 Git 历史，不要求回滚、迁移或改写任何实现/存档。

执行书：[M2A1 纯规划器](M2A1-MOTIVATION-PLANNER-TASK.md)、[M2A2 运行时集成](M2A2-MOTIVATION-RUNTIME-TASK.md)、[M2B 检查器](M2B-PLAN-INSPECTOR-TASK.md)、[M2C 独立验收](M2C-MOTIVATION-ACCEPTANCE-TASK.md)。

## 1. 起点与范围

- Runtime 唯一基准：`D:\Narraverse-World-Map-m1-integration`，提交 `87aa9b605f5f509ce3b0daa97e34ded004d22f33`。从该提交创建各任务工作树；`main` 没有 runtime，不能作为代码起点。
- 控制文档位于 `D:\Narraverse-World-Map-control`。执行者在派发时记录合同与任务书导入的控制树提交 SHA、实际代码 HEAD、工作区状态和依赖 SHA。
- 新增实验 profile `motivation-village`、fixture 版本 1、rules `m-motivation-v1`、service 格式 5。snapshot 版本 2、event schema 版本 1、checkpoint 容器版本 1 不变。M1、D2C 及其它旧 profile 的行为与兼容产物保持原样。
- `motivation-*v1` 字符串、`m-motivation-v1` 和 service5 是 M2 从未实现/存档情况下的首个运行时版本标识，不代表兼容或迁移旧 M2。M2 唯一源码基准仍为 M1 integration `87aa9b605f5f509ce3b0daa97e34ded004d22f33`。
- 人物固定为 actor-2 猎人、actor-3 商人、actor-1 村长对照、actor-4 玩家；人口仍为 80。M1 的 `mindModel` 保留为观察、公药信念与刺激来源；M2 使用独立 `motivationModel`。M2 中 M1 mind actors 的 `lastDecision`、`lastOutcome` 恒为 null。
- 只增加五种固定候选，顺序为 `UseMedicine`、`BuyMedicine`、`WorkForPay`、`Rest`、`NoAction`，由三个固定 provider 和一个 fallback 收集。不实现插件框架、Hunt、聊天、战斗、模型、MBTI、多目标栈、通用搜索或经验 LOD。
- 动机范围是响应真实村长的做工请求，并在健康恢复、职责、疲劳恢复之间作有限比较。权威物理效果一律复用现有 society resolver，不复制或私写资产规则。

## Reference Review

**Problem：** 限定五个候选如何出现；普通分数变化何时可以改变已承诺计划；阻塞、延期与权威拒绝如何影响计划及长期 Goal。

**Primary：** REF-CDDA。固定源码提交 43be0bb0e65d995a5cbb07a5dc48dab361638f0d：[npcmove.cpp：1697–1849](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1697-L1849)、[npcmove.cpp：1913–1937](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1913-L1937) 与 [npc_test.cpp：6053–6170](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/tests/npc_test.cpp#L6053-L6170)。已读范围支持 committed goal、按执行状态区分保持/抢占，并以 holding/progressed/deferred 与 urgent 反例测试边界；只借结构，不借实现或数值。

**Secondary：** `REF-RW` / `REF-ONI` 仅取参考库社区目录层的 Urgent/Normal 概念；未核验其官方源码，不据此声称数值、具体机制或官方实现事实。参考库冻结于 `b0b13a3baccf0d26fae167f7827930a1df995876`：[ADOPTION-PROTOCOL](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/ADOPTION-PROTOCOL.md)、[MODULE-INDEX](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/MODULE-INDEX.md)、[PATTERN-DECISIONS](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/PATTERN-DECISIONS.md)、[REF-CDDA 所在目录](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/GAME-CATALOG.md) 与 [CODE-REFERENCE](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/CODE-REFERENCE.md)。

**Adopted：** 对应 PAT-001（Need 是输入，不直接命令）、PAT-004（Goal commitment / anti flip-flop）与 PAT-009（World Fact != Subjective State）；PAT-003 只借有限候选由固定 provider 暴露的入口，不采纳其通用框架。日结决策高频、关键且必须重放，因此用确定规则；低频语义策略本阶段不造高成本确定性系统。

**Rejected：** 不移植 CDDA 的候选层级、Oracle、阈值、优先级数值、游戏规则或代码；不把 RW/ONI 概念扩成通用急迫度系统；不加多层暂停栈、持续行为扫描或外部 LOD。世界事实仍只由 World Runtime 决定，Mind 只形成有限知识、意图与计划，提交时由原权威 resolver 重验；反事实不得成为事实。

**Code copied：** no。**Source level：** 指定开源仓库固定提交的源码与测试切片静态阅读；未运行 CDDA 测试。**Narraverse changes：** 使用自有五候选、permille 评分、确定性日结、持久可重演状态和现有资产账；不复制代码、数值阈值、全知 Oracle 或弱化不变量的架构。参考只限定本 M2 可执行范围，不重新排 M3/D3/D4 全项目路线。

## 2. 配置与固定实验

`defaultMotivationVillageConfig()` 返回 `{memory,mind,motivation}`。

- `memory=deepCopy(defaultMindVillageConfig().memory)`；即以已验收 M1 mind-village fixture 的 memory 为基底（公药初始20、production=0），不是更底层的 defaultMemoryConfig/calibrated 参数。随后覆写 actor-2/3 初值为 health=400、hunger=0、fatigue=650、private food=20、herbs=0、wallet=100；其它 M1 物理参数保持。`memory.society.economics` 固定为 `wage=20`、`workFood=8`、`workFatigue=150`、`deadlineDays=20`、`maxFailures=3`、`cooldownDays=2`。这些 M2 数值不得由调用方覆写。
- `mind` 仍为 `mind-config-v1`、actor-2/3 两个固定 actor；刺激精确为 `[ {stimulusId:'mc02',tick:12,kind:'market-check',listenerId:'actor-2'}, {stimulusId:'mc03',tick:24,kind:'market-check',listenerId:'actor-3'} ]`。market-check 没有 speaker；原 `s01` statement 不沿用。
- `motivation` 精确为：

```json
{
  "version": "motivation-config-v1",
  "profiles": [
    {"actorId":"actor-2","dutyWeightPermille":900,"riskAversionPermille":200},
    {"actorId":"actor-3","dutyWeightPermille":900,"riskAversionPermille":200}
  ],
  "requests": [
    {"requestId":"d01","tick":200,"speakerId":"actor-1","listenerId":"actor-2","urgencyPermille":1000,"expiresTick":432}
  ]
}
```

  仅允许覆写 profiles 中两个固定 actor 的合法权重、requests 合法数组、`mind.stimuli` 合法数组以及 memory 的合法实验输入；M1 `mind-config-v1` 的 schema、固定 actorIds、TTL 与 M1+M2 总计64/每tick8预算不变。默认 mind stimuli 仍为上列 mc02/mc03。M2 economics 六项不接受覆写。除上述明确项外不开放其它配置键。request 只表示输入消息，不直接改变库存、需求或决定。speaker 或 listener 死亡时记录 `unavailable`，不交付 duty。请求按 tick 后 requestId 码元序排序；ID 唯一；`expiresTick>tick` 且不大于 `tick+288`。先做安全整数及加法溢出检查，再做范围检查。

固定四日预期（seed 42，未列变量均为默认值）：actor-2 在 tick144 买药，创建 Goal1/planId1，购买成功后等待 Use；tick200 收到 d01。tick288 首次评估该未读 Duty，urgency=1000 打开 NEW_MAJOR_DUTY 完整重评，Work710 高于 Use700 和 Rest650，于是本次选择 Work，而非单因高分打断；成功回执后将 d01 置为 fulfilled/fulfilledTick=288，工资+20、公粮生产记账8、fatigue 650→800，Goal1/Plan1 挂起且 Goal.step 仍为 use。tick432 请求已过期，URGENT_FATIGUE 只选择 Rest，日结 fatigue=600；tick576 恢复原 planId1 执行 Use，私药-1、health=500，长期 health Goal 未完成。完成一次 Work 不会在 TTL 内重复履约；公仓值按旧日结逐日复算。权重配对：在相同 major gate 下，只将 dutyWeight 900→700 或 riskAversion 200→400，其它不变时，tick288 改选 UseMedicine。

### Q3 专用合法配置 recipe

以下只为合同 Q3 的存活期限与死亡清理边界，不增加新业务；均从合法配置构造，执行者不得手改 snapshot 或跳时。

- **期限等待 fixture**：从默认配置仅改 actor-2/3 fatigue=200；全部三名 NPC initialFood=32；public herbs initial=0、production=0，并设 `memory.society.actors.market.products.herbs.maxOrder=0` 禁止该实验的外来药材补给；全部 NPC/玩家 initialHerbs=0；mind.stimuli 仅为 `[{stimulusId:'deadline-statement',tick:12,kind:'statement',speakerId:'actor-1',listenerId:'actor-2',available:true}]`；motivation.requests=[]；经济固定 wage=20/workFood=8/workFatigue=150/deadlineDays=20/maxFailures=3/cooldownDays=2。actor-2 day1 依据已送达陈述相信有药，创建 Goal1/Plan1（BuyMedicine）；权威库存为0而拒绝，failedActions 与 Goal.failures 各增加一次，Plan1 stepIndex=0/status=blocked。日末公开无药纠正后，day2～20 保留 Goal/Plan1，每日 NoAction，不再扣 failures、不休息、不消费药。day21 旧 Goal deadline 失败只结算一次并清 Plan1，cooldownUntilDay=23；day22 不建新 Goal/Plan；day23 可建 Goal2，belief 仍无药，NoAction 不建新 Plan、不复活 Plan1。通过从 tick0 引擎分段推进覆盖真实前缀。
中控实验补正（2026-10-08 16:33，Asia/Shanghai）：原期限 recipe 的库存/生产均为 0，仍允许旧市场第 1 天采购 12 药、第 3 天到货，第 4 天恢复 BuyMedicine；执行者报告该真实反例后，中控补充上述合法 maxOrder=0 前提。此补正覆盖原 0d7cc74 recipe 的漏项，保留原等待/截止验收预期，不改默认 M2、旧经济规则、公式、预算、DTO 或运行时版本。补正后的真实期限链尚待验证。

- **死亡清理 fixture**：从默认配置仅改 actor-2 health=1、hunger=1000、initialFood=0；private herbs=0、wallet=100；其它默认，包括 tick200 的 d01 请求。actor-2 在 tick144 的 BuyMedicine 成功但不回血，日末按旧规则因无私粮死亡；canonical Goal 与待执行 Use Plan 清理；society estate.state.ledger.goalsFailed 仅增加一次，因 Buy 已成功 failedActions 不增，死亡本身不再作为一次 Goal.failures 的动作失败。已购私药/钱包及最后 Decision/Outcome 封存。tick200 的 d01 记录 unavailable、不进入 duty；可增加 tick210 给 actor-2 的 market-check，同样 unavailable。推进到 tick576 后死者不再增加 Plan/Decision/报价/观察，旧记录不变，背景世界仍按规则结算。若真实旧 actor 规则不产生此死亡结果，记录阻断并停在合法配置，不手造死亡快照。

## 3. 长期目标、计划与固定状态

- 唯一长期 Goal 继续存于 world.societyModel.agents[].state.currentGoal。沿用 M1 的 recover-health：仅当没有 currentGoal 且 health≤700、day≥cooldownUntilDay 时创建；Goal deadline 为当前 day+20，原 Goal 字段 target=800。Goal 未完成/失败时沿用原 goalId。终止和死亡按旧 society 规则处理，不在 motivationModel 复制 Goal 实体。
- 临时职责和休息计划不创建长期 Goal，Plan.goalId 必须为 null；治疗计划 goalId 必须等于本人的 canonical health Goal id。Goal.step 只由治疗计划的 Buy/use/wait 变化；Work/Rest 不把旧 Goal.step 改为 earn/rest，且不得把 Plan 状态塞进旧 Goal 字段。Decision.goalId 等于所选或等待计划的 goalId；没有计划时为 null。committedIntent 可继续指向背景健康 Goal。
- SocietyAction.payload.goalId=Decision.goalId ?? 0。临时 Work/Rest 即使背景健康 Goal 仍存在也传 0，wrapper 与完整重演按 Plan.kind 绑定本日 Decision/Plan，不要求 payload goalId 等于背景 Goal。0 是合法临时任务标记。
- Plan 精确字段：{planId,goalId,kind,steps,stepIndex,status,createdDay,deadlineDay,requestId}。kind 为 recover-health、aid-village、recover-rest；status 为 ready、blocked、suspended、completed、cancelled。治疗无私药时 steps=[BuyMedicine,UseMedicine]，有药时为 [UseMedicine]；duty 为 [WorkForPay]；rest 为 [Rest]。最多两步。recover-health Plan.goalId 必须等于本人 canonical health Goal id；aid-village/recover-rest Plan.goalId 必须为 null。health Plan 的 deadlineDay 与 Goal 匹配；临时职责/休息 deadlineDay 为自身请求或当日期限。除 aid-village 外 requestId=null；职责 Plan.requestId 精确等于本人 duty.requestId。duty deadlineDay=floor((expiresTick-1)/144)，rest deadlineDay 为创建当日。ready/blocked/suspended 的 stepIndex 满足 0≤stepIndex<steps.length；completed 时 stepIndex===steps.length；cancelled 时索引仍合法。
- motivationModel 精确为 {version:'motivation-state-v1',config,configFingerprint,requestCursor,cursor,actors}，不得加额外元字段。configFingerprint=canonicalJson(config)；初始 requestCursor=0、cursor=0。actors 恰为 [{actorId,lastDuty,lastReviewedDutyId,activePlan,suspendedPlan,nextPlanId,lastDecision,lastOutcome}, ...]，顺序 actor-2、actor-3；初始 lastDuty、lastReviewedDutyId、activePlan、suspendedPlan、lastDecision、lastOutcome 均 null，nextPlanId=1。requestCursor 是已处理 M2 request 前缀长度；activePlan 若非 null 必须 status=ready|blocked，suspendedPlan 若非 null 必须 status=suspended，并仅属于该 actor。健康 Plan 绑定本人 canonical health Goal；临时 Plan 的 goalId 为 null。completed/cancelled 仅出现在当 tick planner/settlement 的瞬时状态与 transitions，不跨日保留。cursor 是已消费 EventLog 序号。nextPlanId 为正安全整数，溢出先拒绝；active/suspended 不得同 planId；计划与 Goal ID 不得跨人引用。
- Duty 精确字段：{requestId,sourceEventSeq,observedTick,expiresTick,urgencyPermille,status,fulfilledTick}。仅保留本人最后收到的请求；status 为 pending|fulfilled，fulfilledTick 为 null 或安全整数 tick。新请求覆盖旧记录，不叠加；有效机会窗口为 [observedTick,expiresTick)。Knowledge 保留最后已知记录，包括过期或 fulfilled 状态；候选只在 pending 且窗口有效时可选。新请求成功送达后，任何 requestId 不同于新 Duty.requestId 的 active aid-village Plan 立即以 REQUEST_SUPERSEDED 取消，不执行、不改变资产或 Goal.failure、不履约旧请求，也不转移旧 commitment；保留 suspended 健康 Plan，当前新请求仍按承诺门重新评估且不强制 Work。Duty、Work Plan 与 Work 候选 sourceRef 必须 requestId 一致，方可继续、提交 authority command 或标记 fulfilled。只有对应 WorkForPay 成功才把该 duty 标为 fulfilled 并记录执行 tick；拒绝保持 pending；fulfilled 请求在 TTL 内不得重复工作。过期历史留在 lastDuty，不再活动。死亡者不再收到消息、报价或计划。
- lastReviewedDutyId 初始为 null，只记录已经打开 NEW_MAJOR_DUTY 重评门的本人 requestId；若 urgent fatigue 先覆盖，不标记尚未评估的请求。
- committedIntent 精确为 {goalId,kind:'recover-health'} 或 null，表示长期健康 Goal；apparentAction / choice 只表示本次动作。Intent、action、outcome 三者独立。

## 4. Knowledge、Decision 与公式

### 4.0 公共导出与校验边界

- A1 `runtime/core/motivation-state.mjs` 导出以下固定常量：`MOTIVATION_RULES='m-motivation-v1'`；`MOTIVATION_CONFIG_VERSION='motivation-config-v1'`、`MOTIVATION_STATE_VERSION='motivation-state-v1'`、`MOTIVATION_KNOWLEDGE_VERSION='motivation-knowledge-v1'`、`MOTIVATION_DECISION_VERSION='motivation-decision-v1'`、`MOTIVATION_INSPECTOR_VERSION='motivation-inspector-v1'`；`MAX_MOTIVATION_ACTORS=2`、`MAX_MOTIVATION_CANDIDATES=5`、`MAX_MOTIVATION_PLAN_STEPS=2`、`MAX_MOTIVATION_REQUESTS=64`、`MAX_MOTIVATION_INPUTS_PER_TICK=8`、`MAX_MOTIVATION_KNOWLEDGE_BYTES=16384`、`MAX_MOTIVATION_INSPECTOR_BYTES=131072`、`MAX_MOTIVATION_PLAN_TRANSITIONS=8`。同模块导出 `validateMotivationConfig(config)`、`createMotivationModel(config)`、`validateMotivationModel(model)`。validator 只接 motivation config/model，并做自身结构/预算检查，不做历史重演。
- A1 `runtime/core/motivation-planner.mjs` 导出 `collectMotivationCandidates(knowledge)`、`planMotivationDecision(knowledge)`、`buildFastCounterfactual(decision)`。planner 纯计算候选、承诺门和计划变化；不执行命令、不修改输入、不消耗 RNG/clock、不读其他 actor/world。
- A2 公共导出及签名为 `defaultMotivationVillageConfig()`、`createMotivationVillage(seed=42,simulationId='motivation-village',config=defaultMotivationVillageConfig())`、`motivationSystems()`、`validateMotivationWorld(world,sealed=true)`、`executeMotivationPlayerIntent(bundle,intent)`、`describeMotivationPlayerActions(bundle)`、`buildMotivationKnowledge(bundle,actorId)`、`projectMotivationInspector(bundle)`。`buildMotivationKnowledge` 只构造 committed phase；`projectMotivationInspector` 完整 bundle audit 后返回克隆。A2 的 decision-phase helper 私有，B/C 不得调用或用 A1 planner 生成独立 expected。`validateMotivationWorld` 只保证配对结构，不替代 bundle 完整审计和历史重演。M1 stimuli + M2 requests 的跨配置总预算、每 tick 总量、request 前缀/cursor 及完整历史由 A2 校验。

A2 公共函数的模块归属如下；函数名、签名与业务 DTO 仍按本合同，不要求额外 barrel/re-export：

| 公共函数 | 所属模块 |
|---|---|
| `defaultMotivationVillageConfig()`、`createMotivationVillage(...)`、`motivationSystems()` | `runtime/fixtures/motivation-village.mjs` |
| `validateMotivationWorld(...)`、`executeMotivationPlayerIntent(...)`、`describeMotivationPlayerActions(...)` | `runtime/core/motivation-runtime.mjs` |
| `buildMotivationKnowledge(...)`、`projectMotivationInspector(...)` | `runtime/knowledge/motivation-knowledge.mjs` |

中控实现澄清（2026-10-08）：A2 可在其白名单文件内部定义一个具名 `hooks` 对象，仅供白名单内 `engine/world-state/event-log/fixture` 连接，拟含 `createWorld`、`beforeSystems`、`afterSystems`、`applyAction`、`settleDay`、`validateHistory` 六项；每项须有实际消费者且为完成本合同所必需。它不是业务接口，不得由 B/C 引用，不得新增 barrel/re-export。上表八个业务公共函数的模块归属保持不变；decision-phase Knowledge builder 必须是 core 私有闭包，不加入 hooks、不 export。此项只澄清内部接线，不修改公式、DTO、业务版本或白名单。

### 4.1 Knowledge

Knowledge 顶层精确白名单为 {knowledgeVersion,phase,simulationId,actorId,tick,revision,self,quote,observations,belief,profile,duty,planState}。不增其它顶层键；对象键插入顺序不属于合同，fingerprint 使用 canonical JSON。

- knowledgeVersion='motivation-knowledge-v1'；phase 为 committed 或 decision。公开投影是当前已提交 tick/revision；每日 planner 输入为当日 tick、revision=tick-1。
- self 白名单：{name,occupation,location,alive,health,hunger,fatigue,wallet,inventory:{food,herbs},currentGoal,nextGoalId,cooldownUntilDay}。currentGoal 沿用 M1 原字段，且只含本人值。health/hunger/fatigue 为 0..1000 安全整数；wallet 非负安全整数；inventory.food/herbs 为 0..1000 整数。
- quote={product:'herbs',price:uint≥1,observedTick:uint,sourceEventSeq:uint|null}；非 null sourceEventSeq 须为≥1安全整数。observations 项为 {sourceEventSeq,occurrenceTick,observedTick,channel:'statement'|'market-check'|'daily-public'|'own-rejection',sourceActorId:'actor-1'|null,available:boolean|null,confidencePermille,expiresTick}。belief 为 {topic:'public-herbs-available',value:'available'|'unavailable'|'unknown',confidencePermille,evidenceRefs:[eventSeq],contradictionRefs:[eventSeq],lastUpdatedTick:uint|null}。派生、TTL、去重遵 [M1 共同合同](M1-CHARACTER-MIND-CONTRACT.md) §4.2；不得以当前 world truth 替代人物可知信息。
- 所有嵌套数据遵 [M1 共同合同](M1-CHARACTER-MIND-CONTRACT.md) §8.1 的普通/null 原型、密集数组、无 getter 和预算规则；M2 Knowledge/Inspector 上限分别为 16384/131072 UTF-8 bytes。
- own-rejection 继续遵 [M1 共同合同](M1-CHARACTER-MIND-CONTRACT.md) §4.2：仅本人 BuyMedicine 的权威拒绝可追加 channel='own-rejection'、available:null、confidencePermille:0 的观察，令公仓药材 Belief 暂为 unknown；后续可见日末 public observation 可纠正。WorkForPay、Rest、UseMedicine 拒绝不新增/改写供给观察或旧证据。不得增加第二命题或学习字段。
- profile={dutyWeightPermille,riskAversionPermille}；duty 是本人最后收到的 Duty 记录，可能过期或 fulfilled。planState={activePlan,suspendedPlan,nextPlanId,lastReviewedDutyId}。M2 Knowledge 不含 world、他人私账、未来 RNG、事件全文或隐藏 getter。
- 死亡 actor 的 self.alive=false、currentGoal=null；意图/计划清理或按历史封存规则投影，且不接新观察、请求或决定。历史观察和最近决定/结果封存，Belief 只由已知历史及 TTL 纯派生。

### 4.2 候选、Decision 与承诺门

候选固定 5 项，顺序为 UseMedicine、BuyMedicine、WorkForPay、Rest、NoAction。collectMotivationCandidates(knowledge) 只依本人的 Knowledge 收集和评分，绝不访问真实公仓、他人钱包、communalGold、隐藏 World Truth 或 resolver。潜在健康 Goal 按 M1 创建门槛纯推导，不真实分配 ID。

每项精确字段为 {action,provider,sourceRef,eligible,score,support,opposition,reasonCode}；Decision 中每项再含 {selectable,selectionBlockCode}。来源固定如下：

| action | provider | sourceRef |
|---|---|---|
| UseMedicine | health-need | recover-health |
| BuyMedicine | health-need | recover-health |
| WorkForPay | role-request | 本人当前有效 pending Duty 的 requestId；否则 null |
| Rest | fatigue-need | self-fatigue |
| NoAction | fallback | null |

候选软前提、分数公式、reasonCode 与同分固定顺序沿用 v1：

| action | eligibility | support / opposition / score |
|---|---|---|
| UseMedicine | 有 recover-health Goal、私药>0、health<1000 | support=recoveryScore，opposition=0 |
| BuyMedicine | 有 Goal、私药=0、belief.value=available、confidence≥600、本人 wallet≥已知报价、本人容量合法 | support=recoveryScore，opposition=0 |
| WorkForPay | 本人 Duty 为 pending、当前位于 [observedTick,expiresTick)、health≥300、fatigue≤700 | support=floor(urgencyPermille*dutyWeightPermille/1000)；opposition=floor(strainPermille*riskAversionPermille/1000) |
| Rest | fatigue≥600 | support=fatigue；fatigue≥800 时 support 与 score 固定为 2000；opposition=0 |
| NoAction | 始终 eligible | support=0，opposition=0，score=0 |

不合格候选固定 score=null,support=0,opposition=0。recoveryScore=0（无 Goal）；有 Goal 时 max(0,800-health)+300。strainPermille=min(1000,fatigue+max(0,700-health))。所有输入为 0..1000 安全整数；表内乘法按 floor(.../1000) 向下取整。strain 是支持/反对因素所用的压力代理，不是心理测量。Work 候选来源存在不代表本人知晓库存、一定能执行或请求已回复。

进入 gate 评估前先按本人 Knowledge 清理已知死亡、Goal 终止、Duty 过期与临时 Plan deadline：已过期请求不可重试；因过期失效的临时 Plan 先取消，若健康 Plan 仍有效则同一决策可恢复它。该规范化不执行第二个动作、不消耗 RNG。

承诺门严格按以下次序选一个 gate；不能在更后级覆盖前级：

1. URGENT_FATIGUE：活人 fatigue≥800。只 Rest selectable=true；其它 eligible 候选 selectionBlockCode=URGENT_OVERRIDE。保留长期健康 Goal 和暂停治疗 Plan。仍按日结，每日最多一个真实行动，不即时行动。
2. NEW_MAJOR_DUTY：本人 Duty 为 pending、窗口有效、urgencyPermille≥900，且 requestId 不等于 lastReviewedDutyId。更新 lastReviewedDutyId=requestId，打开一次完整重评门；不强制接受 Work。899 不是重大请求。
3. CONTINUE_COMMITTED：无上两条件，activePlan.status=ready 且当前下一步 soft eligible。仅该下一步 selectable；其他 eligible 项 selectionBlockCode=COMMITMENT_PROTECTED。普通高分变化不能暂停承诺。
4. RESUME_COMMITTED：没有有效 active（失效 active 先按本合同清理），有有效 suspended health Plan 且下一步 soft eligible，无 urgent/重大请求时恢复原 planId，只原步骤 selectable。
5. LOCAL_REPLAN_BLOCKED：active blocked、ready 下一步前提失效/需等待，或没有 active 但 suspended health Plan 的下一步已不 eligible 时，按本人 Knowledge 局部修复剩余步骤并允许当前可知候选重评；保留 health Plan 原 planId 与已完成步骤，不补执行旧步骤。若临时 Plan 被可执行的健康 Plan 替代，可取消该临时 Plan、保留对应 Duty pending 并恢复原健康 Plan，不得另建第二层暂停栈。没有可选实际动作时 NoAction 保持现有 blocked/suspended 状态，不清仍有效的长期 Goal、不循环多动作。
6. SELECT_NEW_PLAN：没有有效 active/suspended Plan 时才按 eligible score 和固定顺序选择新计划。NoAction 不建 Plan。

gateReason 精确取上述枚举之一。Decision 精确为 {version,decisionId,actorId,tick,goalId,planId,innerStance,committedIntent,apparentAction,choice,reasonCode,gateReason,strainPermille,candidates,evidenceRefs,knowledgeFingerprint}。apparentAction===choice。Decision.goalId 等于本次所选/继续/恢复 Plan.goalId；若没有 Plan 则 null。planId 指对应 active/suspended/新建 Plan，若无则 null。Decision.reasonCode 保持为选中候选的 reasonCode，gateReason 说明为什么继续、恢复或全量重评，二者不能混用。

selectable 只能在 eligible=true 时为 true。完整重评门（NEW_MAJOR_DUTY、LOCAL_REPLAN_BLOCKED、SELECT_NEW_PLAN）将全部 eligible 候选设为 selectable、block=null；所有 ineligible 候选设 selectable=false,selectionBlockCode=SOFT_PRECONDITION_FAILED。CONTINUE_COMMITTED 与 RESUME_COMMITTED 只开放对应下一步，其它 eligible 候选 block=COMMITMENT_PROTECTED；URGENT_FATIGUE 只开放 Rest，其它 eligible 候选 block=URGENT_OVERRIDE。selectionBlockCode 只允许 null、SOFT_PRECONDITION_FAILED、COMMITMENT_PROTECTED、URGENT_OVERRIDE；仅软前提不满足时使用 SOFT_PRECONDITION_FAILED。

- 候选 reasonCode 固定沿用 v1 枚举：RECOVER_HEALTH、NO_HEALTH_GOAL、PRIVATE_MEDICINE_MISSING、HEALTH_ALREADY_FULL、PRIVATE_MEDICINE_PRESENT、SUPPLY_UNKNOWN、SUPPLY_UNAVAILABLE、SUPPLY_CONFIDENCE_LOW、WALLET_INSUFFICIENT、CAPACITY_UNAVAILABLE、DUTY_UNAVAILABLE、HEALTH_TOO_LOW_FOR_WORK、FATIGUE_TOO_HIGH_FOR_WORK、DUTY、FATIGUE_BELOW_REST_THRESHOLD、FATIGUE_RELIEF、EMERGENCY_FATIGUE、WAIT。候选多项前提失败时沿原 eligibility 顺序返回首个失败原因；NoAction 始终为 WAIT。
- innerStance 不从 choice 映射：fatigue≥800 → fatigue-concerned；否则 health≤700 或仍有 recover-health Goal → health-concerned；否则 balanced。它只是本人 Need 评价代理，不代表完整心理学。committedIntent 只指健康 Goal {goalId,kind:'recover-health'} 或 null；apparentAction/choice 是本次动作，Outcome 才说明权威结果。
- evidenceRefs 是本次 belief 的 evidenceRefs、contradictionRefs 与当前记录 Duty.sourceEventSeq 的去重升序并集（只包含有效、已送达且对本人可知的请求来源）；每个 source 必须早于本 Decision。knowledgeFingerprint 为完整 decision-phase Knowledge 的 canonical JSON 文本本身，非散列摘要，UTF-8≤16384 bytes。

### 4.3 规划纯度、计划与失败归属

planMotivationDecision(knowledge) 返回 {currentGoal,nextGoalId,activePlan,suspendedPlan,nextPlanId,lastReviewedDutyId,decision}。它与 collectMotivationCandidates 都是纯函数：不执行命令、不改输入、不消耗 RNG/clock、不读取其他人物或 world。若需要按 M1 门槛创建潜在 Goal，planner 从 Knowledge.self.nextGoalId 纯提议 exact Goal id 和递增后的 nextGoalId，并先检查安全整数溢出；planId 同样从 Knowledge.planState.nextPlanId 提议。A2 必须按 proposal 原样提交，不能另选、重分配或改序号；collectMotivationCandidates 仅推导潜在 Goal eligibility，不占用 ID。所有纯函数不得修改输入对象。

- NEW_MAJOR_DUTY 门中，actor-2 的 710 分 Work 高于 Use 700 和 Rest 650，才产生示例职责行动；urgent Rest≥800 只开 Rest。普通分数即使更高，也不能绕过 CONTINUE_COMMITTED。
- 固定四日示例：day1 / tick144 actor-2 创建健康 Goal1 和治疗 planId1，Buy 成功后 stepIndex=1 等待 Use；tick200 收到 d01。tick288 d01 urgency1000 首次打开 NEW_MAJOR_DUTY，候选 Work=710、Use=700、Rest=650，选择 Work；innerStance=health-concerned、committedIntent=Goal1、apparentAction=WorkForPay 各自表达 Need、长期目的、本次动作。治疗 Goal.step 仍为 use，Plan1 挂起；临时 Plan2.goalId=null，命令 payload goalId=0，成功后实际工资+20、公粮生产记账8、fatigue 650→800，且只在成功回执后将 d01 设为 fulfilled/fulfilledTick=288。tick432 由 URGENT_FATIGUE 选临时 Rest Plan3（goalId=null/payload0），保留 Goal1/Plan1；日末 fatigue=600。tick576 由 RESUME_COMMITTED 恢复原 Plan1 执行 Use，私药-1、health 400→500，健康 Goal1 未完成。每日最多一个真实动作，NoAction 不产生休息收益，挂起不延长 Goal deadline。
- 给承诺门的可执行配对 fixture：从默认配置只将 actor-2 的 dutyWeightPermille=1000、riskAversionPermille=0；其余合法输入不变。d01 urgency1000 与 urgency899 两个分支只差请求 urgency。两者 tick144 先 Buy；tick288 urgency1000 触发 NEW_MAJOR_DUTY 并因 Work=1000>Use=700 选 Work；urgency899 不触发重大门，CONTINUE_COMMITTED 继续 Plan1 的 Use，即使 Work 分数899。此反例不能通过修改 Goal/私账制造。
- 临时Work/Rest在 M2-only adapter 中隔离失败归属：只在不写入源 world 的候选 society 投影视图中暂置该 actor.currentGoal=null，再调用原 authority resolver。真实资产、failedActions、lastAction/lastActionDay、产粮、fatigue 和 resolver/RNG 结果照常提交；随后只恢复该 actor 的原健康 Goal 数据（包含原字段、failures 与 step），不能覆盖/回滚资产、ledger、failedActions、lastAction、其它人物或 RNG。投影视图不写源、不持久化、不进入历史。健康 action 直接走原 resolver，失败沿旧规则增加健康 Goal.failures 一次。
- 临时 action 的真实 RULE_REJECTED 只令对应临时 Plan blocked，照常增加通用 ledger.failedActions；Outcome.failureOwner 为 {planId,goalId:null}，挂起健康 Goal.failure 与 Goal.step 不变。健康 action 拒绝使健康 Plan blocked，failureOwner 为 {planId,goalId:<healthGoalId>}，由旧 resolver 增加健康 Goal.failures 一次。NoAction 或被承诺门挡下的候选不产生命令、receipt 或失败。
- blocked 表示等待 soft precondition 恢复或真实通用拒绝后的有界重试；deferred 只由当前 gate 选择结果派生（如 COMMITMENT_PROTECTED），不存为 Plan.status，不创建 deferred Plan/多层暂停栈。impossible 只能由已知死亡、Goal 结束、职责过期或 Plan deadline 等明确终止条件导出；一条 RULE_REJECTED 不足以证明永久 impossible。只支持单层 suspended 健康 Plan。
- 成功 receipt 才推进对应 stepIndex；失败不推进。职责成功将 Duty 标 fulfilled；职责拒绝保留 pending。Goal deadline、cooldown、死亡按旧 society 规则；临时 Work/Rest 不改变健康 Goal.step/failures。任一计划的状态只因真实状态变化产生 transitions。Goal 结束/死亡清除健康 active/suspended；临时职责过期可取消 Plan 并恢复仍有效的健康 Plan，不能伪造第二个暂停栈。
- M2 wrapper/replay 按 Plan.kind 绑定 Decision、commandId、SocietyAction、facts 与 Outcome，不修改旧 society.mjs、hunter.mjs 或其它旧 profile 语义。Rest 即时 delta.fatigue=0；日结 restReduction 只扣200，不双扣。
## 5. 反事实函数

buildFastCounterfactual(decision) 先解析保存的完整 canonical JSON Knowledge，再 canonical 重编码并严格要求与 knowledgeFingerprint 字节一致；同时核对 actor、tick、revision、Decision/Knowledge 版本。基于冻结 Decision 与原 Knowledge 副本重新验证 baseline。baseline 的 choice、完整 candidates（含 provider/sourceRef、eligible、评分、selectable 与 selectionBlockCode）及 gateReason 必须全部与保存 Decision 一致，任何不一致即拒绝，不返回部分结果。

之后对原 decision-phase Knowledge 的副本计算且只计算三个 case：
1. baseline：changedField/fromValue/toValue 均为 null。
2. duty-minus-200：changedField=profile.dutyWeightPermille，设为 max(0,原值-200)。
3. risk-plus-200：changedField=profile.riskAversionPermille，设为 min(1000,原值+200)。

返回数组项 {caseId,changedField,fromValue,toValue,choice,candidates,gateReason}。只重跑纯 planner 并返回选择、诊断与门控，标注为假设；不承诺 World action 成功。不得执行命令、推进 tick/clock、消费 RNG、读取隐藏 world、修改原 Knowledge/Decision/ID/Role 状态/Goal/Plan/历史 fingerprint/世界文件/hash。无 lastDecision 时 Inspector.counterfactual 为 null。每 actor 固定三 case。候选分数增加但被承诺门阻挡时，输出仍须显示原 gateReason 与 selectionBlockCode。

## 6. Outcome、事件与确定性顺序

Outcome 精确字段为 {decisionId,actorId,commandId,status,code,delta,price,publicFoodProduced,failureOwner}，其中 delta={wallet,herbs,health,fatigue}；status 为 succeeded、rejected、no-action。rejected code=RULE_REJECTED，其它为 null。failureOwner 仅在 rejected 时非 null：健康行动为 {planId,goalId:<healthGoalId>}，临时 Work/Rest 为 {planId,goalId:null}；成功/no-action 必须为 null。非成功 delta 全零、price=null、publicFoodProduced=0。Buy.price 为真实扣款；Work.price=null、publicFoodProduced=8（旧账生产记账，不表示净库存增加 8）；Use/Rest.price=null。Rest 即时 fatigue delta 为0，日结另按旧规则减200。Outcome/Knowledge/Counterfactual 不得包含 communalGold、他人余额、全量 action result 或世界 before/after。

M2 新规则可接收四类 sourceSystem=motivation 事实：
- MotivationRequestResolved：payload {requestId,speakerId,listenerId,urgencyPermille,expiresTick,status}；status=delivered|unavailable。entityIds=[listenerId]、commandId=null、causationEventSeqs=[]；unavailable 不进入 duty。送达后 actor.lastDuty 记录完整 Duty，fulfilled 只能在对应 Work 成功回执后写入状态。
- MotivationDecisionPlanned：payload 为完整 Decision；entityIds=[actorId]、commandId=null、causationEventSeqs=decision.evidenceRefs。
- MotivationDecisionResolved：payload 为 Outcome；entityIds=[actorId]、commandId=outcome.commandId、causationEventSeqs=[对应 planned eventSeq]。NoAction 仍产生 Planned 与 Resolved/no-action，但没有 SocietyCommand/receipt，不能伪造计划成功。
- 仅 MotivationDecisionResolved 中本人 BuyMedicine 的 authority rejected RULE_REJECTED，按 M1 own-rejection 规则追加 Observation，引用本事件 eventSeq 并将该命题暂置 unknown；WorkForPay/Rest/UseMedicine 拒绝不得改变该人物药材 observations/Belief 或旧证据。日末可见 public observation 是独立新来源，不算动作拒绝副作用。
- MotivationPlanSettled：每 actor 每 tick 至多一次，仅当该 tick 有 Decision、发生请求覆盖取消、或死亡/目标终止需清理状态时产生；没有当日 Decision 时 decisionId=null。payload 精确 {actorId,decisionId,currentGoalId,lastDuty,lastReviewedDutyId,activePlan,suspendedPlan,transitions}；entityIds=[actorId]、commandId=null。非日界仅因 request batch 消费导致旧职责 Plan 取消时，在该 tick 请求批处理后发出，causationEventSeqs 为造成状态变化的 MotivationRequestResolved eventSeq；若在日界则合并本 tick 请求覆盖、DecisionResolved 和 SocietyDaySettled（若存在）的 causation refs，按 eventSeq 升序去重。请求覆盖的取消必须在本 tick 持久化，不得缓存 transitions 到下一日；请求处理不额外 advance tick、不产生命令，也不自动恢复/执行 suspended Plan。无状态变化不发噪声事件；每 actor 每 tick 的 PlanSettled.transitions 超过8则该 tick 整体拒绝；每份 payload 上限8，两个 actor 同 tick 合计最多16。currentGoalId 在日界为 Society 日结后的 canonical Goal，在非日界为该已提交 tick 的当前 canonical Goal。
- 每个 transition 为 {planId,kind,fromStatus,toStatus,reasonCode}，fromStatus 可 null，toStatus 为 Plan.status。reasonCode 允许 CREATED、INTERRUPTED_DUTY、INTERRUPTED_REST、RESUMED、PRECONDITION_CHANGED、CONDITION_READY、POLICY_DEFERRED、STEP_SUCCEEDED、EXECUTION_REJECTED、PLAN_BLOCKED、DUTY_FULFILLED、PLAN_COMPLETED、GOAL_COMPLETED、GOAL_FAILED、REQUEST_EXPIRED、REQUEST_SUPERSEDED、DEAD。最多8条，按实际 FSM 顺序；仅记录真实状态或 stepIndex 变化。STEP_SUCCEEDED 可用 ready→ready 记录真实 stepIndex 前进；EXECUTION_REJECTED / PLAN_BLOCKED 可用 ready→blocked 记录真实拒绝；CONDITION_READY 可用 blocked→ready 记录前提恢复；DUTY_FULFILLED 只对应真实成功 receipt；POLICY_DEFERRED 说明由 gate 导出的本次未选行为，不创建 deferred Plan，且只在对应计划/步骤状态确实变化时记录。NoAction 且计划稳定不产生 transition；同一 blocked Plan 再次被 authority 拒绝、状态未变化时只记 Outcome/failedActions，不重复产生 transition；不得重复记录稳定状态。终止 reason 对每个 plan 只记一次，已 PLAN_COMPLETED 的子计划不再为同一 plan 加 GOAL_COMPLETED。currentGoalId 在日界为 Society 日结后的 canonical Goal，在非日界为该已提交 tick 的当前 canonical Goal。已死亡且无状态变化的人物不继续产生心理事件。

M2 不改 event schemaVersion=1 外壳；tick/eventSeq/输入序列由原引擎分配。NoAction 不登记 SocietyCommand/receipt，但仍记录 Planned 与 Resolved/no-action。每个 M2 actor 每日最多一个真实动作；chief 按旧规则独立处理，无额外行动。命令 ID 和 Decision ID 固定 motivation-day-{day}-{actorId}。M1 scriptCursor 和 M2 requestCursor 分别精确对应已到期并处理的输入前缀；M1/M2 各自 event cursor 在已提交状态须等于 nextEventSeq-1。来源引用、游标和请求消费均按定义完整重演，不重复消费输入。

同一 tick 严格顺序保持 v1：PlayerAction；M1心智刺激；M2请求（requestId排序）；既有每日公开 announcement；请求成功送达并写入新 lastDuty 后，若当前 aid-village Plan.requestId 与新 Duty.requestId 不同，立即以 REQUEST_SUPERSEDED 取消旧职责 Plan（不执行、不改钱货或 Goal.failure，不履约旧请求、不转移 commitment），保留 suspended 健康 Plan；随后同一候选快照计算 chief 旧 plan 与两位 M2 pure plans（chief 只保留自身旧结果，丢弃旧 planner 对 actor-2/3 的候选/Goal/资产改动）；按 chief、actor-2、actor-3 顺序执行并由 authority resolver 重新验证真实世界（两位 M2 不读取彼此当 tick 执行结果）；SocietyDaySettled；PlayerDaySettled；MemoryDaySettled；更新存活者公开 belief 并封存死亡者观察/计划。

完整重演必须从配置、初始 world/mind/motivation state 与 seed 重算所有事件、输入、候选/门控/Decision、计划/Goal/命令绑定、failureOwner、Duty fulfillment、RNG、人口、资产及旧物理账；不得只以 config fingerprint、state hash 或保存的决定通过。M2 validator 只能在新 rules 分支分离 motivationModel 后复用 mind/memory/society 校验，并严格重演完整历史；不得降低 M1 validator 或省略旧物理账。
## 7. Inspector 与服务

`projectMotivationInspector(bundle)` 完整审计后返回脱离原对象的 JSON 克隆：

```text
{
  apiVersion:1, mindVersion:'motivation-inspector-v1', view:'developer',
  simulationId, revision, tick,
  worldFacts:{publicFood,publicHerbs,postedHerbPrice},
  actors:[{knowledge,lastDecision,lastOutcome,counterfactual}]
}
```

worldFacts 只展示公仓 food/herbs 与已公布药价；不得展示全部私账。`GET|HEAD /api/runtime/minds` 复用既有 `inspectMind=true` 门；M1 `mind-inspector-v1` 不变。新 profile 才用 service5 并使 capabilities.mindAvailable/playerActions 按真实能力报告。服务命令 v1/v2 经 A2 adapter；不能造永远缺依赖的断言或生产 mock fallback。不得新增写心理/模型/反事实 POST。反事实随私有投影预计算并缓存；GET/HEAD 零写。

M2 service format 5 的 `projectPlayerSnapshot` 必须先执行完整 `validateBundle(bundle,{rulesVersion:MOTIVATION_RULES,systems:motivationSystems()})` 校验，再按既有 PlayerDTO 白名单投影本人 `actor-4` 与 `playerModel`。DTO 精确为 `{apiVersion:1,simulationId,revision,tick,self:{identity:{actorId,name,occupation,location,simulationLevel,alive,deathTick},health,hunger,fatigue,needs,wallet,inventory},actions}`，其中 `actions` 来自真实 `describeMotivationPlayerActions(bundle)`，返回值须为脱离源对象的克隆。不得改写 `rulesVersion` 伪装旧版本，也不得继续调用会选择 `PLAYER_RULES` 并拒绝合法 M2 bundle 的旧 `buildPlayerKnowledge`。B 可在白名单 `runtime/service/http-contract.mjs` 实现只读投影 adapter；不新增 A2 公共函数、不扩展 Knowledge 白名单、不复制人物执行规则。M1 与旧 profiles 保持原 helper 路径。
- 开关默认关闭。关闭时任意 method/query 均 404。开启但没有 M1/M2 检查器能力时 404；旧 M1 能力继续返回原 DTO/状态。通过现有 Host/Origin 保护后，能力检查先于方法；有能力时非 GET/HEAD 为 405，再检查 query（有 query 为 400）。三份检查器静态文件与 API 同门。
- 在保留旧 service profiles 1/2/3/4 的前提下新增 service5；不得把 owner 限制为只接受 M2。service5、capability、playerActions、私有 Inspector、公共/player 投影必须基于同一候选：全部构造验证后 durable publish，再一起 swap。保存故障保留旧状态。重启同 ID 幂等，stale revision 409。
- M2 命名空间为 `society-day-`、`mind-day-`、`motivation-day-`；仅新 rules 对这三类内部前缀实施其合同限制。旧 profile 保留原有命名空间规则，不全局禁用 `motivation-day-`。
- 使用显式 checkpoint 或新 profile 新数据目录；不迁移 M1/真实旧存档，不接入正式平台、模型或旧实例。

## 8. 硬预算与错误

| 边界 | 固定限制 |
|---|---|
| Actor / 候选 | 2 个固定 Mind actor；5 个固定候选 |
| Plan | 每人最多 2 steps、1 层 suspended；active/suspended planId 不同 |
| Requests + M1 stimuli | 总计≤64；每 tick 合计≤8 |
| profiles / urgency | 整数 permille 0..1000 |
| Knowledge / Inspector | canonical UTF-8 分别≤16384 / 131072 bytes |
| 反事实 | 每 actor 恰为 3 case |
| 旧运行时预算 | 140000 events、64 MiB 文件；服务 advance≤1440、命令历史≤128；原 clock/session 推进预算不放宽 |

所有集合、输入和输出先做普通/null 原型、密集数组、无 getter、safe integer、canonical 字节数及总体预算检查，再做字段语义检查；整数加法、ID 溢出或任一整体预算超限时整次拒绝，不部分分配或发布。沿用项目错误语义；非法输入为 `INVALID_INPUT`，未知版本/profile 为 `UNSUPPORTED_VERSION`，超界为 `LIMIT_EXCEEDED`，同 ID 不同 payload 为 `COMMAND_ID_CONFLICT`，权威规则拒绝为 `RULE_REJECTED`。磁盘错误沿用现有 INVALID_CHECKPOINT / INVALID_SERVICE_COMMIT 包装；检查器不可用为 `MIND_UNAVAILABLE`。HTTP 沿用现有状态映射，不暴露栈。

## 9. 固定验收命题

- Q1 候选来源、公式和承诺因果：确认五项 provider/sourceRef 正确、软前提只读 Knowledge；独立手算 tick288 的 Work710、Use700、Rest650。只改 actor-2 dutyWeight 900→700 或 risk 200→400 时，完整重评应改选 Use。额外运行承诺门配对 fixture：profile dutyWeight1000/risk0，比较 request urgency1000 与899 的单变量输入；1000 打开 NEW_MAJOR_DUTY 并选 Work，899 由 CONTINUE_COMMITTED 保持 Plan1 Use，即使 Work 得分899。另以同一合法本人 request 替换 fixture，只改变新 requestId/urgency：旧职责 Plan 必须在新请求送达后取消为 REQUEST_SUPERSEDED，旧请求不得 fulfilled，健康 suspended Plan 保留，新请求只按门重评；Duty/Plan/candidate sourceRef 不一致时禁止 continue/执行/履约。核对同分候选按固定次序。
- Q2 四日三层链：验证 Goal1 / health Plan1 的 Buy→挂起→Use 恢复，duty Work Plan2 与 urgent Rest Plan3 的 goalId=null、payload goalId=0；Decision 的 innerStance=health-concerned、committedIntent=Goal1、apparentAction=WorkForPay 同时成立。验证仅 Work 成功后 d01 fulfilled/fulfilledTick=288，工资20/公粮生产记账8/疲劳650→800；tick432只可 Rest、日结fatigue600；tick576恢复 Plan1，私药-1、health400→500，Goal target800未完成。每日最多一个真实动作，NoAction不获Rest收益。
- Q3 失败归属、漂移和生命周期：保留期限等待与死亡两个合法 fixture；Buy 权威拒绝使健康 Plan blocked、健康 Goal.failure按旧规则只加一次，day2–20 NoAction不重复失败，day21 deadline结束一次，day23可新建Goal且不复活旧Plan。死亡 actor 真实日结清理 Goal/计划一次，ledger.goalsFailed 仅加一次，failedActions不增，死亡不作为额外Goal.failures动作失败，后续请求记 unavailable。临时 Work/Rest 拒绝只增加通用 failedActions、不增加挂起健康 Goal.failures；NoAction/承诺保护不创建命令、receipt或失败，blocked可有界等待，impossible只由已知终止条件判定。
- Q3 临时失败归属配对 recipe：从默认 M2 config 只改 player.initialHerbs=20、公仓herbs.initial=50且production=0、resources.gold.initial=350（memory.society.actors.market.ecology.resources.resources.gold.initial）；其它默认。actor-2/3 各在 tick144 以公药价50购买，令 public cash 由50到150；两人钱包各50；player wallet100。tick144之后、288之前真实 PlayerSell 一次卖 herbs qty7（固定服务价格20，卖得140，public cash变10，小于 wage20），这条真实输入/命令进入重演，但不暴露给NPC Knowledge。tick200 d01送达；tick288 Work 候选仍为710并按重大门选中，权威因工资不足 RULE_REJECTED：ledger.failedActions +1、failureOwner={planId:2,goalId:null}、health Goal1.failures仍0且step仍use、钱包/药/疲劳不变、Belief与供给观察不变、duty保持pending，Work Plan2=blocked。tick432请求过期取消临时计划并恢复健康 Plan1 Use；health到500。实施时逐日核实公共现金与资源账；若配置/旧规则不产生该精确序列，停下报告最小偏差，不改母规则、不手改快照、不跳时、不调经济deadline凑绿。该配对同时证明玩家输入及服务/Inspector消费者。
- Q4 反事实纯度：baseline 先验证完整保存 Decision 与 choice/candidates/gateReason 一致；三 case 独立复算。包含高分 Work 被承诺门挡下的反例。零 ID/Role/输入/文件/RNG/clock/world 变化，不执行行动、不声称成功。
- Q5 完整重演与持久化：连续576 tick 与200+376、288+288、432+144 分段一致；另覆盖非日界新请求导致的旧职责 Plan REQUEST_SUPERSEDED 取消，并在请求批处理后同 tick 持久化单一 PlanSettled；覆盖日界请求覆盖与当天决策合并为单一 PlanSettled。CLI两日保存+两日恢复。篡改 reviewedDutyId、Duty fulfillmentTick/status、Duty与Work Plan/candidate的requestId/sourceRef对应关系、source、candidateProvider/selectable/blockCode/gate、Goal failure归属、Plan引用/step、score、fingerprint、cursor或额外事实均拒绝；restore不得重置profile或误复用已fulfilled request，也不得丢失跨 request 的取消记录。
- Q6 真实消费者：真实 HTTP、玩家动作和 A2 adapter；三投影同候选原子发布、同ID重启幂等、stale409、save fault保持旧投影、关闭404。真实浏览器两页只读并显示来源、gate、意图/动作/结果与失败归属；mock不能替代真实链。
- Q7 旧兼容：以 M1 integration 基准 87aa9b6 的同 SHA 证据核对旧 M1 Inspector 同服务、默认288、Goal deadline、D2C六操作和C5短程；仅当关联代码变化或证据不覆盖直接影响时定向补跑。阶段收口按约定一次全量simulation+export；不跑旧100/500/1000日长程。
## 10. 路线边界、交付与停止

- 三条执行路：A 含串行 A1→A2；B 为服务/检查器；C 为独立验收。A1、A2 使用同一计划工作树但绝不同时编辑。A2 依赖 A1 实际交付 SHA。B/C 可先用合同定义的模拟 DTO 开发，但集成只接受 A2 实际导出；依赖缺失须显式记为待验，不得吞 import 或写成永远缺失。
- A1/A2/B/C 均只按对应任务白名单修改。超白名单时先提供精确调用链、必要文件与理由，等中控更新合同。中控独占 PROJECT_CONTEXT、架构文档与看板。
- 每份任务交付包含用户可读功能摘要、目录/分支/实际基准 SHA、工作区所有权/状态、合同与依赖 SHA、精确文件、真实运行命令与结果、证据位置、未验证项和停止点。执行者不得把计划任务书标为开工，不得自行接 M3/D3、合并 main、部署或改真实档。
- M2 发布阶段只验证本文与四份任务书的链接、白名单互斥和合同一致性；不宣称代码实现、运行测试或阶段验收。M2 开发定向验证；阶段集成收口时全量 simulation+export 一次。旧 100/500/1000 日 CLI、模型和下一阶段均不在本合同范围。
