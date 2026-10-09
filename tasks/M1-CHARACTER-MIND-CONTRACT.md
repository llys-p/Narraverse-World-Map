# M1 共同合同：最小规则心智闭环与检查器

合同版本：`m1-contract-v1`；冻结：2026-10-08（Asia/Shanghai）。状态：M1 阶段已验收；本文合同正文保持冻结，不随状态更新改写。

本合同是 [M0](M0-CHARACTER-MIND-CONTRACT-TASK.md) 的交付物；[架构 M 主线](../WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md#character-mind-runtime)规定长期方向。实现分为 [M1A 核心](M1A-MIND-CORE-TASK.md)、[M1B 服务与检查器](M1B-MIND-INSPECTOR-TASK.md)、[M1C 独立验收](M1C-MIND-ACCEPTANCE-TASK.md)。公共字段只在本文定义，变更须由中控同步三路合同，不能各自猜补。

## 1. 起点、范围与取舍

- Runtime：`D:\Narraverse-World-Map-a2 @ codex/world-runtime-d2c`，实际 HEAD `feb2856910bf8a9a6757aba892128d00d795bc15`；运行时代码验收点 `172ac9f39abed9d6a1091d4f50e341c10d63f681`。本次只读盘点，工作区干净；历史 270/270 未重跑。
- 控制文档起点：`D:\Narraverse-World-Map-control @ codex/world-runtime-control`，`d444e718971de8cdf175d764655d3f88a85e8709`。main 没有 runtime；M1 必须从上述 runtime HEAD 建工作树，再按白名单导入冻结合同。
- 新增独立实验 profile `mind-village`，两位 Mind 为 `actor-2` 猎人、`actor-3` 商人；`actor-1` 村长仍用旧规则，`actor-4` 玩家保留 D2C 行为。总人口仍 80（4 实名 + 76 匿名），不新造人物或钱货。
- M1 的两位人物只执行**恢复健康的窄策略**：买药、用药、无外显行动。该实验暂不运行他们旧有的工作/捕猎/转售策略；这些能力在旧 D2C profile 原样保留。这样能用单一命题证明主观判断的真实消费，不把整个 Utility AI 一次搬迁。M2 再扩动机竞争和行为库。
- 使用结构化实验消息，不做自然语言解析、自由聊天、人格四轴、复杂情绪、学习、认知 LOD 或 Provider 实现。无需 npm 依赖、真实模型或 Laya。新版不自动迁移任何旧档。

## 2. 源码消费链与注册点（基准 feb2856）

下列文件均指 runtime 任务分支。可按函数名定位，不把 main 的旧原型当作实现。

| 当前入口 | 已有行为 | M1 的明确接法 |
|---|---|---|
| `runtime/fixtures/player-play-village.mjs:createPlayerPlayVillage` | `createInitialBundle`，唯一 `daily-memory/society` 每 144 tick | 新 `mind-village.mjs` 保留该日调度，增加独立 mind 配置/状态 |
| `runtime/core/player-intents.mjs:enqueuePlayerIntent/executePlayerIntent` | 玩家动态注册，按耗时完成；history 对照 inputSeq | 新 profile 专用适配 `executeMindPlayerIntent`，复用 D2C 物理动作和耗时，不能把 M bundle 冒充 PLAY_RULES 通过审计 |
| `command-engine.mjs:performTick` | 到期外部命令 → prepare/plan NPC → NPC 提交 → 日系统 → PlayerDay → MemoryDay | 仅 M 分支插入结构化观察和窄心智决策；旧 profile 分支保持原轨迹 |
| `command-engine.mjs:createSimulationSession/canonicalSystems` | 私有冻结 session 跳过空 tick，并与规范 transition 对照 | 将下一实验消息 tick 纳入 nextActivity；注册 M 的规范系统与同等审计，不用外部 callback 改事实 |
| `memory-runtime.mjs:planMemoryDay`、`society.mjs:planSocietyDay` | 全世界输入、三人规划，含库存可执行性和转售等待 | 不能把这些函数输出当作两位 Mind 的知识或决策；仅保留村长自己的计划/状态，不拷贝另外两人的旧规划结果 |
| `society.mjs:applySocietyAction/settleSocietyDay` | 权威资产复核、真实药品/现金与人口日结算 | 窄策略仍提交 `SocietyAction`，真实结果沿原账本；通过精确 base-world 适配复用，不放松旧校验 |
| `memory-observer.mjs:projectActorEvent` | 日结算后村庄库存是公开事实；玩家动作只给本人 | 保留这条公开语义：日末报告可纠正误信。不能在新 Brain 隐藏已经观察的日末事实来强造误信 |
| `actor-knowledge.mjs:buildActorKnowledge` | 只接受 C4/C5，且 tick0 fallback 直接读全局库存 | M 显式分派到新 knowledge；不复用 tick0 全库存 fallback，不接完整 bundle 到纯规划函数 |
| `world-state.mjs:validateBundle/validateSnapshotStructure`、`event-log.mjs:validateEventLog` | 严格字段、规则/fixture 注册、事实/回执完整重放 | 独立 M 分支验证 mindModel、所有事实与动态输入；不把 M 简单塞进旧 MEMORY_RULE_VERSIONS 后跳过审计 |
| `checkpoint-store.mjs:saveCheckpoint/loadCheckpoint` | formatVersion 1，64 MiB，有界原子发布 | 格式复用，通用验证分派到 M；不需改磁盘发布器 |
| `http-contract.mjs:runtimeProfile`、`service-commit.mjs:transitionServiceCommand/validateServiceCommit` | profile 1/2/3；完整 anchor→commands→bundle 重演 | M 注册 serviceFormatVersion 4，命令 DTO 仍 v1/v2；接受新版 bundle 的唯一服务桥 |
| `runtime-owner.mjs:createRuntimeOwner`、`runtime-server.mjs` | 独占锁、同 ID 幂等、revision 冲突、保存后才发布缓存 | 增加 M profile 与只读检查器缓存；下一份所有投影在发布前构造，保存失败保持旧读数 |

关键细节：`settleSocietyDay` 根据 `lastAction==='Rest'` 给 NPC 休息收益，且读取的是持久字段。因此无动作日必须清掉该日的旧动作标识为 `None`，不能沿用上日 Rest；不造 Rest 命令、不增加 restDays。旧 snapshot/账本对 `None` 已有合法表示。

## 3. 版本矩阵与世界状态

| 层 | M1 固定值 | 处理 |
|---|---|---|
| rules / fixture | `m-mind-v1` / `mind-village` / fixtureVersion `1` | 显式新分支，旧版本不变 |
| snapshot / event 外壳 / checkpoint | `2` / `1` / formatVersion `1` | 外壳复用，不能因此略过新业务审计 |
| 原物理配置与状态 | memory-config-v4 / society-config-v3 / actor-config-v3 / player-state-v2 / memory-observer-v2 | 保留其物理、公开信息和消费语义，不添心理字段到旧 schema |
| 心智配置 / 状态 / knowledge / decision | mind-config-v1 / mind-state-v1 / mind-knowledge-v1 / mind-decision-v1 | 新增、严格字段白名单 |
| service envelope / 命令 DTO / receipt | `4` / `1` 与 `2` / 原时间回执与 receiptVersion `2` | 只新增 profile 分派，不新增心智写 HTTP 命令 |
| 检查器 DTO | apiVersion `1` + mind-inspector-v1 | 显式开发者只读面 |

`world` 为 D2C 的完整字段，加一个 `mindModel`。新适配器先严格识别 M，分离/验证完整 mindModel，再将精确的 D2C 字段投影交给旧 memory/society/player 物理函数，最后重组并完整验证。禁止接受任意额外字段、修改 rulesVersion 冒充旧 bundle、建立可由调用者开启的 skipValidation。

```text
mindModel = {
  version:'mind-state-v1', config:MindConfig,
  configFingerprint:canonicalJson(config), scriptCursor:uint,
  cursor:uint, actors:[MindActor(actor-2), MindActor(actor-3)]
}
MindConfig = {version:'mind-config-v1', actorIds:['actor-2','actor-3'], stimuli:[Stimulus]}
MindActor = {actorId, observations:[Observation], lastDecision:Decision|null, lastOutcome:Outcome|null}
```

初始 scriptCursor=cursor=0，两人 observations=[]、lastDecision=lastOutcome=null。`scriptCursor` 是已处理的 stimuli 前缀长度；`cursor` 是已消费的 EventLog 序号，每个完整活动 tick 后等于当前最后 eventSeq（含忽略的事实）。同一事实对同一人最多观察一次。心智不新增实体 ID。所有数组密集、键精确；未知字段/访问器/异类原型/NaN/危险整数按现有 data-contract 拒绝。

**Belief、InnerStance 是由有界 observations 和当前 tick 按固定规则重建的派生值**，不重复保存一份可漂移的缓存。CommittedIntent 引用本人唯一 `currentGoal`；ApparentAction 由 lastDecision/lastOutcome 表达。目标仍存在 society estate 中，不能在 mindModel 另存一套完成条件。决定时的依据通过 Decision 指纹与事件引用固定，后来知道真相不能改写当时判断。

## 4. 输入渠道、注意与判断

### 4.1 实验输入

Stimulus 两种精确形状：

```text
{stimulusId, tick, kind:'statement', speakerId:'actor-1', listenerId, available:boolean}
{stimulusId, tick, kind:'market-check', listenerId}
```

listenerId 只能为 actor-2/actor-3。数组按 `(tick, stimulusId 码元序)` 严格排序、ID 唯一，tick 为 1..1440000。它们只由新 fixture 配置声明，不进 pendingCommands、不消耗 inputSeq；HTTP 没有提交这种输入的入口。固定剧情输入只规定“提供这个信息/观察机会”，不规定人物回答、购买成功或世界库存。

statement 表示实验安排村长向该人说“公仓有/无药”；允许说法错误，发生的是一次发言，不是库存事实。到期时说话人和听者必须存活、同在 village；否则记录未送达。market-check 表示本人查验公仓，听者须存活且在 village；`available` 必须由当时 `resources.herbs>0` 得出，配置不得指定结果。所有未送达记录仍推进 scriptCursor，不循环重试。

### 4.2 Observation / Belief

```text
Observation = {
 sourceEventSeq, occurrenceTick, observedTick,
 channel:'statement'|'market-check'|'daily-public'|'own-rejection',
 sourceActorId:'actor-1'|null, available:boolean|null, confidencePermille, expiresTick
}
Belief = {topic:'public-herbs-available', value:'available'|'unavailable'|'unknown',
 confidencePermille, evidenceRefs:[eventSeq], contradictionRefs:[eventSeq], lastUpdatedTick:uint|null}
```

- 只注意“公仓是否有药”这一命题，M1 无通用注意力评分器。statement=600，market-check/daily-public=900，own-rejection=0 且 available=null；这是 v1 游戏启发式确信程度，不是可信概率或通用渠道排名。
- delivered stimulus 对指定听者产生 Observation；日末 `SocietyDaySettled` 的已可见 village-market 为两位存活 NPC 各产生 daily-public 观察，available 取该事实的药材 closing>0；不能读下一日库存。普通 MedicalRequest/MedicineOffer 是个人需求/私药供给，不是公仓命题，不作为该 Belief 的证据。
- 买药的 generic RULE_REJECTED 不能推断公仓为空（也可能是其他执行条件失败），只有本人 BuyMedicine 的 rejected `MindDecisionResolved` 产生 own-rejection/unknown，等待下一可见证据。UseMedicine 的结果不成为公仓证据。成功买到最后一份也不能据此断言“现在仍有药”。
- `occurrenceTick=源事件.tick`；M1 送达即时，故 observedTick 相同；未来延迟传播不在本版。expiresTick=observedTick+288，先查安全整数溢出。当前 tick `< expiresTick` 才有效，过期在读取/决策时纯计算为未知，不发新事件、不触发额外 tick。
- 活跃证据按 `(observedTick,sourceEventSeq)` 取最新一条；其 value/confidence 为当前判断。相同日末的新事实可纠正先前说法。evidenceRefs 为胜出源一项，contradictionRefs 为其余活跃、布尔值相反的源，按 eventSeq 升序；未知时 contradictionRefs=[]。没有活跃项时 confidence=0、refs=[]、lastUpdatedTick=null。
- 同一 `(actorId,sourceEventSeq)` 不重复加入；每人保留最近 8 条，按上述顺序确定性淘汰最早项。原 EventLog 不裁剪；lastDecision 引用即使离开热列表仍可从原事实与冻结决策上下文重建，不能丢审计依据。
- 不公开未来 stimuli、他人 observations、原事件全文或其他钱包。tick0 不凭空观察真实库存；报价为公开牌价，可从初始 market config 派生，此后从该人可见日末事实更新。报价单独从完整的已可见日末事件派生，不因 8 条观察热窗口淘汰而丢失；死者不接死亡日及其后的新报价/观察。initial quote 的 observedTick=0、sourceEventSeq=null。

## 5. 有限目标与行动

纯 `planMindDecision(knowledge)` 只接 §8 的 DTO，不能接 world/bundle、库存查询函数或模型。返回 `{goal, nextGoalId, decision}`；goal/计数为本人新状态，decision 为 §7 的冻结记录。Knowledge 指纹使用 `canonicalJson(knowledge)`，不是加密签名。planner 校验 DTO 形状/预算，但不凭空证明来源；真实来源由 bundle 入口审计保证。正常引擎不对死者调用 planner；直接传入合法但 self.alive=false 的 DTO 返回 RULE_REJECTED，不产生决定。

每日每位存活 Mind 最多决定一次，执行顺序 actor-1→actor-2→actor-3。两位 Mind **先从同一提交前世界各自生成 knowledge 和计划，再按 ID 提交**；后者不能因前者消耗最后一份而被规划器全知地提前过滤，允许权威拒绝。

1. 仅复用 `recover-health` 目标：本人 health<=700、无 currentGoal、当日>=cooldownUntilDay 时创建，goalId=nextGoalId++、step=wait、startDay=day、deadlineDay=day+20、failures=0、target=800。M 配置的 economics 固定 deadlineDays=20/maxFailures=3/cooldownDays=2，不接受覆写这三项。已存目标不每次重新生成；结束/失败/死亡与日结算沿原 Goal 规则。
2. 候选恒为 `[UseMedicine, BuyMedicine, NoAction]`，各自独立计算 eligible，再按此顺序取首个真值，无 RNG、无评分并列。有目标且本人私药>0且health<1000时 UseMedicine 可选；有目标、Belief=available、confidence>=600、钱包>=本人已知报价且私药<1000时 BuyMedicine 可选；NoAction 恒可选。其它条件不读全局库存/他人状态。死亡人物不调用规划器。
3. step 分别为 use/buy/wait。等待未知或相信无药不增加 Goal.failures；真实执行失败按原 applySocietyAction 增加一次，日结算按原规则判断完成/失败。超 20 日终止并冷却，不能无限挂起。
4. 决策前将两人的 `societyModel.agents[].state.lastAction` 清为 `None`、同一 estate 的旧 Utility `lastDecision` 置 null；不篡改 lastActionDay/ledger，也不清除 mindModel 中上次心智决定，后者只由新决定替换。真实成功/拒绝仍由 applySocietyAction 改 lastAction/lastActionDay 和资产/失败账。NoAction 不生成命令、回执、inputSeq 或休息收益，不增加额外耗时；私粮消费、饥饿/死亡仍日结算，两位受管理 NPC 不额外领取公共治疗。
5. 有动作时生成内部 `SocietyAction`：commandId=`mind-day-${day}-${actorId}`，targetTick=day*144，payload 为 `{actorId,goalId,action,targetActorId:null}`。全部复用原物理执行/账本结果。外部不得伪造内部 ID/来源；M 的玩家适配及服务的 v1 时间/v2 玩家命令均保留 `society-day-`、`mind-day-` 前缀，外部使用报 INVALID_INPUT；不扩大旧 profile 的拒绝范围。

候选 reasonCode 按先匹配者确定：无目标 NO_GOAL；UseMedicine 无私药 NO_PRIVATE_MEDICINE、health>=1000 HEALTH_FULL，否则 READY；BuyMedicine 的 Belief 未知/无货依次 SUPPLY_UNKNOWN/SUPPLY_UNAVAILABLE，其后 FUNDS_INSUFFICIENT、INVENTORY_FULL，否则 READY。NoAction=WAIT。最终 choice 的 reasonCode：UseMedicine→USE_OWN_MEDICINE，BuyMedicine→BUY_KNOWN_SUPPLY，NoAction→无目标 NO_GOAL，否则沿 BuyMedicine 的首个失败原因。本轮只有三级选择，不将规则复杂度包装成完整心理智能。

## 6. 同 tick 顺序、保存与完整重演

M 的每个活动 tick 固定顺序：

1. 按 inputSeq 完成到期玩家 PlayerAction，保留 D2C 耗时/途中死亡语义。
2. 处理该 tick 全部 stimuli（码元序），追加规范事实，消费本人的可见证据。
3. 非日边界结束业务；日边界执行旧 prepareMemoryDay 的真实公告。村长用 `planSocietyDay` 的旧个人/公共粮策略：输入为精确 society base-world、`publicTrade={buyerId:null,price:null}` 和原 personalities，只取 actor-1 的 estate 状态/命令；另外两人的旧规划结果及转售/等待字段一概不回写。其后从同一候选状态为两位 Mind 构造只知自身的 decision-phase Knowledge，生成 Goal/Decision，按 actor ID 追加 MindDecisionPlanned。
4. 按 actor ID 提交村长和两位 Mind 的实际命令。每个 Mind 紧跟自己的执行结果追加 MindDecisionResolved；NoAction 也有 resolved 事实但没有 command receipt。消费本人拒绝观察，不在同 tick 再决策。
5. 原 society 日结算（每日一份 RNG）→PlayerDaySettled→MemoryDaySettled；日结算后仍存活的两位 Mind 消费日末公开事实，新亡者封存已有心智记录。旧 base-world 的记忆/关系更新一次，新 Mind cursor 推进到当前最后 eventSeq。两位 Mind 已由 managedActors 接管，只吃私粮、仅用私药治疗；不会额外领取公共治疗，沿用 C/D 规则。
6. 校验候选、计数、配置指纹和全部不变量，一次发布 tick/revision/RNG/世界。系统错误整 tick 回退；规则拒绝保留回执并继续。

只有日边界真正生成外显行动；日间消息即时更新 observations，Belief/立场随投影变化。到期/目标/需求在下一日决策口检查，不增加每 10 分钟模型或规则规划循环。日间多条刺激只做一次批消费；无新活动时 session 仍跳空 tick。nextActivity 必须包含下一 stimulus.tick，不能跳过它；旧 scheduler 常量与旧 profile 路径不改。

完整重演从初始 memory config + mind config + seed 开始，按 `(tick, phase)` 合并 stimuli、日边界、玩家注册和完成：玩家完成在该 tick 心智前，已提交 tick 上的新玩家注册在全部该 tick 规则之后（继承 D2C）。NPC 内部输入按重建计划核对 inputSeq/指纹/回执，禁止用保存的“模型决定/lastDecision”替代重算。逐项核对 stimuli prefix、观察去重/可知范围、Goal、每条新增事实、资产/人口/死亡、RNG、pending、nextInputSeq、所有 counters 及最终 bundle；拒绝多余/缺失的事实或未认领输入。

保存点是完整提交的 tick，可在 tick24/143（获知后、行动前）或 tick144（决定/拒绝后）保存；不能保存半个计划或半次交易。读取/检查器不能修改观察游标或 tick。原事件不裁剪，数据超现有事件/文件预算明确失败。

## 7. 新事实与持久决定

新增三类事实，统一 sourceSystem=`mind`；mind 是仅 M 版本承认的引擎内置事实来源，不额外创建空 scheduler 系统；`mindSystems()` 只注册真正的 society 日结算函数。只有引擎 M 分支可产生这些类型。EventLog 外壳仍为原 schemaVersion=1，tick/eventSeq 由引擎分配，entityIds=[actorId/listenerId]。不能借现有只允许空 entityIds 的日系统验证漏校验新事实。

```text
MindStimulusResolved.payload = {
 stimulusId, kind:'statement'|'market-check', speakerId:'actor-1'|null,
 listenerId, status:'delivered'|'unavailable', available:boolean|null
}
Decision = {
 version:'mind-decision-v1', decisionId:'mind-day-'+day+'-'+actorId,
 actorId, tick, goalId:uint|null, choice:'UseMedicine'|'BuyMedicine'|'NoAction',
 reasonCode, candidates:[{action,eligible:boolean,reasonCode}],
 evidenceRefs:[eventSeq], knowledgeFingerprint:string
}
MindDecisionPlanned.payload = Decision
Outcome = {
 decisionId, actorId, commandId:string|null,
 status:'succeeded'|'rejected'|'no-action', code:null|'RULE_REJECTED',
 delta:{wallet:safeInt,herbs:safeInt,health:safeInt}, price:uint|null
}
MindDecisionResolved.payload = Outcome
```

Stimulus 的 commandId=null、causationEventSeqs=[]。Decision.evidenceRefs 是当时 Belief 的 evidenceRefs 与 contradictionRefs 的去重升序并集；planned 的 commandId=null、causationEventSeqs=decision.evidenceRefs，严格引用更早且该人可知的源。resolved 的 commandId=真实内部命令 ID 或 NoAction 时 null，causationEventSeqs 仅对应 planned eventSeq；一个 planned 恰有一个 resolved。成功原 `SocietyActionCommitted` 事实/receipt 继续存在，resolved 不重复结算，也不加入 receipt.eventSeqs 或旧 commandEvents 的“一命令一成功事实”映射。失败原 receipt 无 success fact，resolved 使本人获得不暴露隐藏原因的结果。

Decision.goalId 为规划后本人目标 ID，无目标时为 null（只能 NoAction）；实际 SocietyAction 必须有合法整数 goalId，不能将 null 传给物理执行器。Outcome 只给本人钱/药/健康差量及自己交易价格：NoAction/rejected 均为零 delta、price=null；买药 price 为实扣报价；用药 price=null。禁止嵌入原 action result 的 communalGold、他人余额或整个 before/after world。statement status=unavailable 时 available=null，不声称真的说过/听到；日志中的此记录只代表一次未送达实验刺激。

## 8. 三路共用 API、预算与错误

### 8.1 核心导出（M1A）

| 文件 | 必须实现的导出 |
|---|---|
| `runtime/fixtures/mind-village.mjs` | `defaultMindVillageConfig()`→`{memory,mind}`；`createMindVillage(seed=42,simulationId='mind-village',config=defaultMindVillageConfig())`→`{bundle,systems}`；`mindSystems()`→规范 system map |
| `runtime/core/mind-state.mjs` | `MIND_RULES='m-mind-v1'`；`deriveMindBelief(observations,tick)`→Belief；§8.3 命名常量 |
| `runtime/core/mind-planner.mjs` | `planMindDecision(knowledge)`→`{goal,nextGoalId,decision}`，纯函数、不修改输入 |
| `runtime/core/mind-runtime.mjs` | `validateMindRuntimeHistory(snapshot,events)`；`executeMindPlayerIntent(bundle,intent)`→与 executePlayerIntent 同形 `{bundle,durationTicks,outcome,result}`；`describeMindPlayerActions(bundle)`→与 D2C describePlayerActions 同形，先审计 M |
| `runtime/knowledge/mind-knowledge.mjs` | `buildMindKnowledge(bundle,actorId)`→Knowledge；`projectMindInspector(bundle)`→Inspector；两者完整验证 bundle 后只返回脱离源对象的 JSON 数据 |
| `runtime/knowledge/actor-knowledge.mjs` | 保留现有 `buildActorKnowledge`，只在明确 M rules 时转给 buildMindKnowledge；不顺便扩展 D2C 旧规则的返回形状 |
| `runtime/knowledge/player-knowledge.mjs` | 现有 `buildPlayerKnowledge` 为 M 增加完整审计后共用的纯投影，保留旧返回形状；不改 rulesVersion 假扮 D2C 来取得投影 |

```text
Knowledge = {
 knowledgeVersion:'mind-knowledge-v1', phase:'committed'|'decision', simulationId, actorId, tick, revision,
 self:{name,occupation,location,alive,health,hunger,fatigue,wallet,inventory:{food,herbs},
       currentGoal:原Goal|null,nextGoalId,cooldownUntilDay},
 quote:{product:'herbs',price:uint,observedTick:uint,sourceEventSeq:uint|null},
 observations:[Observation], belief:Belief,
 innerStance:'uncertain-supply'|'expect-supply'|'expect-no-supply',
 committedIntent:{goalId,kind:'recover-health'}|null
}
Inspector = {
 apiVersion:1,mindVersion:'mind-inspector-v1',view:'developer',simulationId,revision,tick,
 worldFacts:{publicHerbs:uint,postedHerbPrice:uint},
 actors:[{knowledge:Knowledge,lastDecision:Decision|null,lastOutcome:Outcome|null}]
}
```

公开 buildMindKnowledge 只返回 phase=committed、tick=revision=当前已提交 tick。引擎内部只读投影 helper 使用 phase=decision、tick=本次到期日 tick、revision=tick-1（上一已提交 revision）；在 §6.3 的冻结候选上构造，尚不包含本轮计划/执行结果。planner 只接受 decision 且 tick 为正144倍数、revision=tick-1；否则 INVALID_INPUT。不在半次事务内调用会审计完整 bundle 的公开接口、不递归全历史重放；内部 helper 不是对外跳过审计开关。planner 返回的新 goalId 记入 Decision，指纹仍对应创建/更新 Goal 之前的这份输入。

knowledge 不含未来 stimuli、事件全文或他人私有状态；self 仅本人当前值，公开报价有来源。死亡人物 self.alive=false、Goal/committedIntent=null，observations/lastDecision/lastOutcome 封存，Belief 仍按查询 tick 的 TTL 派生；不接新观察、不生成新决定，不抹去资产或墓碑。非 Mind 的 actorId 抛 MIND_ACTOR_UNAVAILABLE，不能退回全知 DTO。姓名/职业/位置限制复用原 actor schema，名字≤64字符；quote 只含本人存活时可见的公开价格。

innerStance 只映射当前 Belief 三值；不是完整情绪或人格。Inspector 显式把全知 worldFacts 与 actor knowledge 分区，禁止用于 NPC Provider 或替换 player-knowledge。

### 8.2 服务合同（M1B）

- 在 `runtimeProfile` 明确注册 mind-village/serviceFormatVersion4，保留 1/2/3。时间命令 v1 和玩家动作 v2 的形状、耗时、错误与幂等合同不变；M 路径调用 executeMindPlayerIntent。不能用 `>=3` 放行任意未来格式。
- owner 接受 profile `mind-village`，`--checkpoint` 明确加载 M；未知规则/坏档仍拒绝。新增 owner `mindAvailable:boolean`、`getMindInspector()`。私有 Inspector 缓存和公共/player 缓存在同一候选上预先构造，service 文件成功发布后一起切换；读取只返回克隆，不能触发恢复/推理/写档。
- server 新布尔选项/CLI `inspectMind` / `--inspect-mind true|false`，默认 false，只控制调试面的暴露，不改运行规则，不传给 owner 当作运行配置。开启且 profile 支持时提供 `GET|HEAD /api/runtime/minds`，固定返回两人，无查询参数/分页；关闭或无 M profile 返回 404 `MIND_UNAVAILABLE`。沿用 Host/Origin 限制；通过该保护后先检查能力（404），再方法（非读405），再查询串（存在即400）。HEAD 沿用相同状态/响应头，但不发送正文。
- 新页面 `/runtime-mind.html`、静态 `runtime-mind.mjs/.css` 同受开关约束；capabilities 增加 `mindAvailable`（开关与 owner 能力同时满足才 true）。原地图只有能力为真才显示入口；检查器自己没有写操作，时间/玩家动作仍在原地图按已有命令提交。
- 页面显示“开发者心智检查器”、tick/revision、人物选择、刷新、世界事实/本人所知/当时决策及结果三个区域。当前已纠正的判断与此前决策依据分别显示，不用新判断改写旧解释。空决定显示“尚未到决策时点”，死亡显示封存；断连/非 JSON 显示读失败且保留上次读数与旧 revision，不显示成功。
- 该开关仅是单机调试面的显式开启，不宣称具备多用户鉴权；沿用 localhost 监听/CSP/无跨域，不接正式平台。

### 8.3 硬上限与失败语义

| 常量 / 边界 | 固定值与行为 |
|---|---|
| `MAX_MIND_ACTORS` | 2，固定 actor-2/3，配置不支持增删身份 |
| `MAX_MIND_STIMULI` / `MAX_MIND_STIMULI_PER_TICK` | 64 / 8，配置入口预检，超限 LIMIT_EXCEEDED |
| `MAX_MIND_OBSERVATIONS` / `MIND_EVIDENCE_TTL_TICKS` | 8 / 288，按 §4 确定性保留/纯派生过期 |
| `MAX_MIND_CANDIDATES` / Goal / plan 步数 | 3 / 每人 1 Goal / 当前一步 use、buy 或 wait；不开放动态步骤数组 |
| `MAX_MIND_KNOWLEDGE_BYTES` / `MAX_MIND_INSPECTOR_BYTES` | canonical UTF-8 8192 / 65536；先计字节，超限失败，不截断 JSON 或引用 |
| 字符串 / ID | 自由文本不开放；ID≤64 字符，stimulusId 只用 `[A-Za-z0-9_-]+`；版本/枚举严格白名单；knowledgeFingerprint 上限按 8192 字节，不套 64 字符 ID 限制 |
| 唤醒/决定 | 每 tick 最多批处理 8 刺激、每人每日 1 决定；单次核心 advance≤144000 tick，最多 2000 个 Mind 决定；结果回写不再唤醒行动 |
| 事件 / 推进 / 状态文件 | 继续受 140000 条 memory 审计预算、MAX_ADVANCE_TICKS 与 64 MiB 文件保护；服务单次推进≤1440、命令/文件各128、队列16、请求体4096不变 |

所有上限是保护值，不是性能承诺。JSON 数据合法性检查之后先检查整体字节/集合预算，再检查字段值语义；例如超大 DTO 中过长的 name 首先因字节上限报 LIMIT_EXCEEDED，未超字节上限的非法 name 才报 INVALID_INPUT。Goal/证据/事件/整数溢出整次非法输入或整 tick 拒绝，不部分发布。core 沿用异常 `error.code`：INVALID_INPUT（坏字段/来源/引用/顺序）、UNSUPPORTED_VERSION（未知版本/profile）、LIMIT_EXCEEDED、COMMAND_ID_CONFLICT、RULE_REJECTED；MIND_ACTOR_UNAVAILABLE 仅查询不存在/未纳入 Mind 的角色。磁盘坏档按既有 INVALID_CHECKPOINT / INVALID_SERVICE_COMMIT 包装；service 新查询缺能力为 MIND_UNAVAILABLE。HTTP 映射保留现有合同（400/409/413/422/503），查询类 MIND_* 为404，未知内部故障仍500，不暴露栈。

## 9. 固定实验与 K1～K6

默认 config.memory 从基准 `defaultPlayerPlayConfig()` 深复制；只改下列初值：两位 Mind health=400/hunger=0/fatigue=200、私粮各20/私药0/钱包各100；player initialHerbs=0，其余玩家初值不变；公仓药 initial=20、production.numerator=0、匿名 injuredCount=0。chief 和所有其它数值沿基准；Mind 两人的人格三权重均1000。初始药价50。初始人口仍80；所有私粮与钱包仍从真实仓库/总金币移交。默认 mind.stimuli 为 `s01` tick12 statement(actor-1→actor-2, false) 与 `s02` tick24 market-check(actor-3)。不改 RNG、生产/治疗公式或预写未来结果。

以下均 seed42，除点名变量外配置完全相同。比较 cash/herbs 指 **动作事实内当次 before/after**，不把其后的公共治疗/市场外采算成该人物动作；总金币在内部买药时不变、归属改变。

| 用例 | 精确操作与预期 |
|---|---|
| **K1 信息隔离/因果配对** | 默认推进到24：actor-2 belief=unavailable/600，actor-3=available/900，双方看不到另一刺激；world 公仓仍20。到143两人尚无 Decision。推进1到144：2选择NoAction，钱包100/私药0；3选择BuyMedicine，动作单价50、钱包100→50、私药0→1、公仓20→19一次。配对将 s01.available 改为 true（其余不变）：2在144也买药，自己的钱包100→50/药0→1。此配对只变同一人所获消息，不能用职业差异代替因果证据 |
| **K2 未知/反证/过期** | 空 stimuli 对照在143两人 belief=unknown/0，144均NoAction。默认场景在144结算后，两位通过真实日末公开库存获得新证据，2的 belief 以该 closing>0为 available/900，contradictionRefs 含 s01 源；2的 lastDecision 仍保留当时 unavailable 的指纹/来源。到288：2的原 recover-health Goal 尚在，执行BuyMedicine，实扣当时已发布药价；3用自己的1私药，UseMedicine 当次health+100/私药−1。TTL纯函数边界：仅保留tick12 statement的输入，在299有效、300未知；无新来源时不续期 |
| **K3 竞争/失败回写** | 默认 config 的公药 initial 改1，stimuli 改 tick12对2、tick24对3各一次market-check；两人144同快照均计划BuyMedicine。2先成功花50、药+1、公仓1→0；3明确rejected/RULE_REJECTED、钱包100/药0不变、Goal.failures恰+1，own-rejection先为unknown；随后日末真实报告可更新为unavailable。附玩家反例：同配置推进到143，玩家通过唯一入口买1药（完成144），NPC2/3均因旧证据计划购买而在权威提交拒绝；人物不能凭信念造药或绕过 PlayerAction→NPC 顺序 |
| **K4 无外显行动** | 空stimuli、两人初始fatigue200，推进144：两人NoAction，无mind-day-* command receipt/inputSeq、无restDays增加，fatigue仍200，不因旧动作标识得到休息收益。正常私粮仍各消费1，日末生态/市场及其它人的份额照常；两Mind不会得到公药治疗。再推进144可依据新报告买药，但仍不可产生Rest回执或restDays。M1不支持带旧Rest历史的迁移档，不用手改存档伪造这种前置条件 |
| **K5 保存与重演** | 默认连续288 = 保存tick24后续264 = 保存tick143后续145；竞争分支连续288 = 保存tick144失败后续144。在隔离新目录比整份bundle（含观察、决策指纹、目标、输入/回执/RNG），不只比hash。篡改 stimulus来源/游标、observedTick、belief所依赖证据、decision choice/指纹、Goal或重复事件/回执必须拒绝；冷冻输入不变；故障整tick回退。服务同ID同DTO跨重启重试只返回原回执，同ID异payload冲突 |
| **K6 检查器/权限/死亡/预算** | 新M profile + inspectMind true；先GET tick0，再原地图推进24/120，检查器刷新对应24/144并区分“当前判断/当时依据”。人物切换/双页签/重复GET/HEAD不改变revision、输入或文件字节；开关false/旧profile404，POST405，查询串400。无法通过POST命令伪造statement/market-check/MindDecision。非法actor ID/来源、未知版本、65条刺激、同tick9条、超8192字节DTO构造入口反例明确拒绝。新fixture合法死亡分支：两Mind health=1、hunger=1000、fatigue=200，所有人私粮/私药0、粮药initial及production=0、maxOrder(food/herbs)=0、gold足额分配；加 s03 tick156 market-check(actor-2)。144按规则死亡后，156刺激unavailable，不再观察/决策，保留墓碑/私账与封存判断记录 |

K2 的 tick288 检查需同时核对先前公开报价与具体动作结果，不把日末的新报价当成执行时价格。K3 同 tick resolved→daily-public 的先后通过事件验证；最终页面可能已展示纠正后的结果，不能据最终判断倒推没有发生误判。

CLI 接入限于 `simulation-runner.mjs` 明确注册 mind-village 与恢复规则；M 产物必须包含原 checkpoint、inputs.json、events.csv、summary.json，加 `mind-inspector.json` 和 `mind-config.json`。物理资源/生态/人物 CSV 沿原相应 writer 导出，分类显式认定 M 为相应业务 profile，不能把 M 当成 clock-smoke；旧 fixture 的导出字段/字节不变。M1 不顺带补 D2C CLI 注册或重做报告框架。

## 10. Provider、验证与停止

未来 Provider 仅接 Knowledge 的有界副本，返回候选；调用在事务/锁之外。任何被接受且影响未来的输出或 fallback 须绑定 actor/requestId/上下文指纹/规则版本、有效期，进入同一个有序输入与提交，拒绝迟到/重复/已死/越权；恢复消费已接受记录，不重调模型。M1 只保留此边界，不建空 Adapter，不为尚不存在的模型结果虚构字段或事件。

开发期按三路任务书跑直接范围；本版修改 profile/replay/save 消费，所以 A/C 补直接 D2C 与 C5 兼容、失败回退、完整跨档反例。兼容字节对照为 checkpoint、inputs、业务配置/CSV；summary 中源码 SHA、计时与宿主信息单独核对，不要求新旧代码身份相同。阶段最终集成后全量 `node --test --test-concurrency=2 tests/simulation/*.test.mjs tests/export-boundaries.test.mjs` 一次；通过且代码不变不重跑。100/500/1000天旧生态实验不自动重做；M1新增实验验证至288/576ticks及必要目标截止边界，不宣称规模/长程心理质量。

M1 收口还需真实 HTTP/浏览器检查器、原玩家动作与服务恢复消费链；mock、接口存在、测试数量或执行者自报均不能单独过关。所有证据标实际 SHA/fixture/seed/命令、已验证和未验证。M0 仅验收本文可实施与三路无写冲突；当前没有运行这些 M1 测试，不宣称 M1 完成。
