# M4A：有界自主取食与收入闭环（含唯一公共合同）

合同版本：`m4-survival-contract-v1`。状态：已发布、待派发；发布不代表开工。发布时间：2026-10-10（Asia/Shanghai）。合同来源以中控派发提示词中的完整文档发布 SHA 钉定；不拿文档仓库查运行时代码对象，不拿浮动 HEAD 替代发布版本。

## 给用户看

让 actor-2 在一个短期村庄场景中，因为私粮不足而直接买粮，或先接受本人收到的合法工作机会、取得工资，再买粮。粮食真实进入私有库存，吃饭仍由既有日结执行。无供给、无合法收入或工资付不出时，允许等待、失败乃至死亡。

本轮只实现这个小闭环和现有检查器的必要展示，不承诺永久生存、百日平衡、全人口智能或新遭遇系统。M3 已验收，不能改写其合同、旧轨迹或旧存档。

## 1. 坐标、所有权与停止点

- 唯一代码基准：`667628166546a3f342873105b93a8684063504c1`。
- 基准只读树：`D:\Narraverse-World-Map-m3-closeout-controller @ codex/world-runtime-m3-closeout-controller`；GitHub 已有该精确提交。不得从 main 取 runtime。
- A 计划树：`D:\Narraverse-World-Map-m4-survival @ codex/world-runtime-m4-survival`。发布前路径核对不存在；开工仍须核对路径、分支占用、Git 状态与归属，不能覆盖已有树。
- B 计划树：`D:\Narraverse-World-Map-m4-survival-acceptance @ codex/world-runtime-m4-survival-acceptance`。A 不写 B 测试；B 不写生产或 A 测试。公共合同只在本文件，B 引用本文件。
- 文档控制树：`D:\Narraverse-World-Map-control`。A 不修改控制树、指导书、看板或冻结合同。
- 开工读项目 AGENTS、README、PROJECT_CONTEXT、本文件；长文本、机械批处理与测试可委派性价比子代理，推理 high，逐个核对实际文件/命令证据。核心合同判断由本路负责人负责，不能凭代理回报计通过。
- 按 §8 的三个里程碑顺序完成，本地精确提交后停止。**不 push、不合并 main、不部署、不推进 D3/D4**。中控给出 A 精确 SHA 后 B 才接入；不得把 A 自测当 B 验收。

## 2. 现有接口与方案选择

代码基准已有 `applySocietyAction` → `applyHunterAction` 的 BuyFood/WorkForPay 权威路径。BuyFood 每次购买 1 份、按真实市价转移私有钱包和公共库存；`lastActionDay` 限制每日一次个人动作。`settleSocietyDay` 对活人每日最多消费 1 份私粮，随后 `settleActorDay` 计算饥饿和健康。上述底座复用，不加吃饭命令、不修改产粮或工资规则。

`projectActorEvent(SocietyDaySettled, actorId)` 已提供村庄公开 food closing stock 与价格；旧心智报价仅覆盖 herbs，且首日使用配置回填。新食物输入不能沿用这条回填路径。

采用新规则中的固定两步计划，而不是给旧五候选直接加一个动作，也不建设通用职业/机会生成器。只扩展 actor-2；actor-1 沿用原社会路径，actor-3 沿用原 cognition 心智，actor-4 沿用玩家输入。新 profile 中它们仍会受真实世界变化影响，不承诺与另一个世界的个人轨迹相同；**旧 profile 的完整产物必须不变**。

## 3. 版本、接口与有界形状

### 3.1 版本与入口

| 项 | 冻结值 |
|---|---|
| fixture/profile | `survival-village`，fixtureVersion `1` |
| rules | `m-survival-v1` |
| motivationModel.version | `survival-motivation-state-v1` |
| cognitionModel.version | `survival-cognition-state-v1`（沿用原字段/内核；仅新规则允许 actor-2 的新决定锚点） |
| actor-2 Knowledge / Decision | `survival-knowledge-v1` / `survival-decision-v1` |
| inspector mindVersion | `survival-inspector-v1`，apiVersion `1` |
| ServiceCommit format | `7`，仅对应本 profile/rules |

不得让这些版本落入旧 profile，或以旧版本存新增字段。无需修改 checkpoint 容器版本；它保存显式新规则的完整 bundle。未知版本或交叉 profile 必须显式拒绝，没有自动迁移。

冻结公共导出（内部拆分不另建泛型插件）：

- `runtime/core/survival-state.mjs`：上述 `SURVIVAL_*` 版本/预算常量，`validateSurvivalKnowledge`、`validateSurvivalPlan`、`validateSurvivalDecision`。
- `runtime/core/survival-planner.mjs`：`collectSurvivalCandidates(knowledge)`、`planSurvivalDecision(knowledge, context)`、`continueSurvivalPlan(knowledge, context)`、`isSurvivalCommittedStepEligible(knowledge, plan)`。proposal 外层沿用 cognition planner 的 goal/plan/counter/decision 返回字段；context 沿用 evaluationEventSeq/sourceReviewDecisionId/sourceReviewEventSeq。
- `runtime/core/survival-signals.mjs`：`deriveActorSurvivalSignals(knowledge, importancePermille, baseline, previousExecution)`，仅接受 actor-2 新 Knowledge，返回 `{input,baseline}`，字段与旧 signals 返回形状相同。这是唯一食物 urgentNeed 派生处：原 urgentNeed OR `self.inventory.food<=1`；只读本人输入，planner 不直接求 kernel mode、不修改其输入或重要性。baseline 的语义指纹仍为旧 value/confidenceEnough/penaltyPermille 三项，不把每次报价 seq 或钱包变化当关键证据唤醒；待执行 secure-food 的失效检查按 §5 区分 Work/BuyFood。actor-3 调用原 signals。
- `runtime/core/motivation-runtime.mjs`：新增 `survivalRuntimeHooks`（createWorld/beforeSystems/afterSystems/applyAction/settleDay/validateHistory）、`executeSurvivalPlayerIntent(bundle, intent)`、`describeSurvivalPlayerActions(bundle)`、`validateSurvivalWorld(world, sealed=true)`。hooks 签名与 cognition 对应入口一致。
- `runtime/fixtures/survival-village.mjs`：`defaultSurvivalVillageConfig(recipe='affordable')`、`createSurvivalVillage(seed=42, simulationId='survival-village', config=defaultSurvivalVillageConfig())`、`survivalSystems()`；工厂返回 `{bundle, systems}`。只接受 §7 五个 recipe，未知名字拒绝。
- `runtime/knowledge/survival-knowledge.mjs`：`buildSurvivalKnowledge(bundle, actorId)`、`projectSurvivalInspector(bundle)`。actor-2 返回新 Knowledge；actor-3 返回原 cognition Knowledge 形状，审计按新世界规则进行；不修改旧投影入口的含义。

Config 外层沿用 cognition 的 `{memory,mind,motivation,experience,cognition}`，不增加通用机会/心理配置块。新规则含义由版本固定。新 motivation/cognition model 保留已有字段闭集、cursor/roster预算；新模型允许的差异仅为 actor-2 本合同版本、计划与事件锚点。四个 M3-1 冻结内核及其测试不动。

认知锚点的唯一口径：每天先发布本人的 `CognitionReviewEvaluated`（冻结内核原事件形状），其当前 eventSeq 进入 planner.context.evaluationEventSeq。full review 的 context.sourceReviewDecisionId/sourceReviewEventSeq 为 null/null，decision.mode=review；发布本人 `MotivationDecisionPlanned` 后，保存 lastReviewDecisionId=`survival-day-{day}-actor-2`、lastReviewEventSeq=该 Planned 的 seq。maintain 的 context 引用严格早于当前日的这一对本人 review Planned 锚点，decision.mode=maintain/candidates=[]，不把当前 Evaluated 的 seq 当旧 Planned 锚点，不覆盖保存的 review 对。actor-3 的 review ID 仍为 cognition-day 前缀。同主体、同 tick、同模式、事件类型与版本由新模型 validator 和完整重演共同核对；不得双锚点半空、跨 actor/未来引用或伪造 mode。

### 3.2 本人 Knowledge 与公开事实

actor-2 Knowledge 沿用 cognition Knowledge 字段，额外恰为 `foodQuote`、`workOffer`；两者可为 null。不携带公共现金、他人私账、全知 bundle、完整市场对象或原始回执。

- `foodQuote`：`{product:'food', price, available, observedTick, expiresTick, sourceEventSeq}`。price 是正安全整数；available 是公开“有粮”布尔值，不携带隐藏精确库存；`expiresTick=observedTick+288`（先检查溢出）。来源只能是本人在 village 可见的公开食物公告，或既有 SocietyDaySettled 的公开市场投影。选择最近的有效来源，不能从隐藏 world/config 补缺失值。
- 新世界 tick1 发布一条 `SurvivalFoodQuoteAnnounced`：sourceSystem=`survival`，commandId=null，entityIds=[]，causationEventSeqs=[]；payload 恰为 `{location:'village',product:'food',price,available}`，记录的是当时真实挂牌价格和公开有粮状态。其 event.tick 是 observedTick；当前 sourceEventSeq 来自日志，不由输入伪造。之后采用既有公开日结报价，不额外逐 tick 广播。
- 有效时间为 `observedTick <= decisionTick < expiresTick`；未来 observedTick、本人/请求绑定不符等 DTO 可证明的错误为 INVALID_INPUT；缺失或过期来源是合法不可行，不偷读真库存来“修好”输入。纯 DTO 校验只证形状与输入内约束，不宣称任意正整数 seq 真存在；真实 seq 对应的事件类型、公开可见性及报价真伪由 trusted projection、权威入口及 bundle 完整重演核对，错事件引用/伪造来源整次拒绝。
- `workOffer`：`{requestId, wage, observedTick, expiresTick, sourceEventSeq}`；wage 为正安全整数。仅本人真实收到且尚 pending 的 Duty 可提供此机会。
- 本人原请求投递时，新 profile 为 actor-2 同时发布 `SurvivalWorkOfferAnnounced`：sourceSystem=`survival`，commandId=null，entityIds=[actor-2]；payload 恰为 `{actorId:'actor-2',requestId,wage,expiresTick}`，causationEventSeqs 恰指该次 delivered 的 `MotivationRequestResolved`。公告工资等于该世界经济配置的真实工资；它是显式可见信息，不是 planner 偷读配置。公告/请求须同 tick、同本人、同 requestId/到期点；Knowledge 中只保留最新本人机会，不把请求配置数组当已收到的事实。
- 工作可用需 `tick < expiresTick`、本人的 lastDuty pending 且同请求。职责 fulfilled/expired 后 Knowledge.workOffer=null；已赚到工资的计划仍可保留历史 requestId，见 §5。
- “最近”按 tick→eventSeq；trusted projection 核对 sourceEventSeq 在已提交可知 cursor 内（不在 Knowledge 增加全日志或 cursor 来假装能认证）。任意公告或账户篡改由 bundle 完整重演拒绝。descriptor 预检先于 clone/canonical，getter 调用数为 0；无未知字段、稀疏数组、symbol、环或非 JSON 值。decision.evidenceRefs 必须含实际采用的 foodQuote/workOffer 来源和对应本人请求来源，不用来源数量溢出来截断证据；超预算整次 LIMIT_EXCEEDED。

### 3.3 计划、候选与结果

- Knowledge canonical UTF-8 上限 16384 字节；新 actor-2 完整 review 的候选恰为 6 个，顺序为旧 5 候选顺序后追加 BuyFood（旧 NoAction 仍在第5位）；maintain 继续沿用空 candidates，不伪造重新比较。已有 evidenceRefs、计划两步、8个 transition、模型/日志/回执预算不扩张；新 BuyFood 的 support1200 属于显式新版本取值，不放宽旧候选取值。预算失败为 LIMIT_EXCEEDED，不能削弱审计来提速。
- `secure-food` 计划沿用既有 plan DTO 的全部字段，新增许可仅限新规则；`goalId=null`，steps 恰为 `[BuyFood]` 或 `[WorkForPay,BuyFood]`，createdDay 为创建日，deadlineDay=`createdDay+3`，允许 d..d+3 当日一步。d+4 在当天选择/命令提交前取消旧 plan，新规则 `MotivationPlanSettled.transitions` 必须记录 cancelled/DEADLINE_EXPIRED，旧步骤不得执行；日终不能才取消已经过期但当日执行的计划。新版本 validator/重演许可并复算该 reason，旧 reason 集不放宽。若条件再次允许，可分配新 planId；不能沿用超期 ID。
- 两步计划 requestId 为本人的来源请求 ID；单步 BuyFood requestId=null。历史 requestId 在 BuyFood 阶段仅作来源，不是再次取工资的许可。planId 由已有 nextPlanId 分配，不另设多目标或第二暂停槽。
- actor-2 decision 沿用 cognition decision 字段、模式与来源锚点，版本改为 survival-decision-v1，decisionId=`survival-day-{day}-actor-2`；新候选 provider=`food-need`、sourceRef=`self-food`。旧候选评分不改写。actor-3 仍输出 cognition 决定/ID。
- 新 actor-2 outcome 沿用 outcome 字段，delta 恰为 `{wallet,food,herbs,health,fatigue}`；price 对 BuyFood/BuyMedicine 都记录真实支付价格；其余来源/失败归属不变。actor-3 outcome 的旧 delta 字段不增加。决定时冻结摘要和当前库存必须分别展示，不能更新旧决定。
- format7 外部 commandId 保护：保留 format6 的七个前缀，再加入 `survival-day-`。format1～6 的集合不扩大。仍使用原 DTO1 advance / DTO2 player-intent；不新增写接口。

## 4. 有限需求与选择规则

仅 actor-2 在 alive 且私粮 `<=1` 时产生本轮食物需求；一次计划约定取得 1 份粮，不承诺把库存维持到某个永久水位。新 profile 对该本人需求增加 cognition urgentNeed；仍使用冻结 review 内核和世界日结，不强行降低审查次数。actor-3 信号、旧 profile 信号语义不变。

新 BuyFood 候选：需求成立、本人在村庄、来源新鲜、公开 available=true、钱包>=报价、容量允许时 eligible，support=1200/opposition=0/score=1200；否则保留候选但 score=null/eligible=false，并记录可解释原因（NO_FOOD_NEED、FOOD_QUOTE_MISSING、FOOD_QUOTE_EXPIRED、FOOD_UNAVAILABLE、WALLET_INSUFFICIENT、CAPACITY_UNAVAILABLE）。NoAction 是合法结果。

优先序只对新 actor-2 生效：死亡不决定；fatigue>=800 先沿用紧急休息；已有未过期 secure-food 承诺先推进当前可行步骤，不重置 planId；新食物需求且有新鲜/available 食物来源时，钱包够则建单步 BuyFood，不够但本人合法工作机会、身体工作条件和 `wallet+wage >= quote.price` 同时满足则建两步 Work→BuyFood；否则等待/阻塞。不能通过公共现金判断 Work 候选，不能无机会自动挣钱，不能把普通 DUTY 高分强制变为“食物计划”。无食物需求且无当前食物计划时沿用旧 cognition 选择。

两步计划的 first Work 是食物需求选择的合法动作，旧 Work 候选 support/opposition/经验分数仍如实保留；选中理由显式为 FOOD_INCOME，不伪造高分或改写旧经验。只有这一条窄选择路径可使用已有可行 Work，即使其原分数低于 NoAction；身体软 guard、合法机会和权威拒绝均不能绕过。若无 fresh/available 食物来源，不为本轮食物需求启动工作。

健康 Goal 本身不扩张：临时 secure-food 的 goalId=null，可以暂停最多一个 recover-health plan，保留本人原 currentGoal、Goal ID、失败数及期限。食物计划的成功/拒绝不扣被暂停健康 Goal；不复制第二个健康目标。已有其他临时计划不能被静默挤出；允许按明确 transition 取消临时职责/休息计划再承诺食物，已产生的履约和失败不回退。无食物需求时按原单暂停槽规则恢复仍有效的健康计划；不要仅因粮计划结束而在私粮仍<=1时绕过需求。每日买1并吃1并不会积累库存，故本轮 recipe 不承诺暂停健康计划自然恢复；只验保留/归属及纯输入私粮>1时的有条件恢复，不增加补给来表演恢复。

## 5. 权威执行、履约与失败

每天只提交一笔本人 SocietyAction；不能同 tick 执行 Work 和 BuyFood。首步 Work 必须三向绑定本人的 planned decision、active plan、pending request/可见 offer，且未过期；权威继续检查真实身体、工资和公共可支付余额（排除私有钱包）。plan 不携带全知公共现金。

Work 成功后：真实工资到账，正常记录本人 Work 经验，Duty 当日 fulfilled；stepIndex 由0到1，保留同一 planId、requestId、createdDay/deadlineDay，active plan 不清空。下一日 BuyFood 只检查计划有效、本人可知报价和购买条件，**不得要求来源职责仍 pending、不得因职责已 fulfilled/已到期取消购粮、不得再次执行 Work**。新职责不能抢掉这个已赚工资的购粮步骤。

BuyFood 由新规则权威层核对来源/时效和当时真实挂牌价格，再沿用社会购买资产路径：当前价格与冻结报价不一致、真实库存不足或钱包不足，均整次 RULE_REJECTED；不能按虚构报价支付，不能凭旧 available 保证有粮。成功仅转入1份私粮，价格和粮食 ledger 对账；不改饥饿/健康、不额外消费。成功后该短计划 completed；日结随后真实消费最多1份。

Work 权威拒绝：没有工资/产粮，失败账和经验恰一次，原 Work 步保持 blocked；下一日若同请求已失效，取消该待工作计划并转合法等待，不能凭历史 requestId 开工。BuyFood 拒绝：保持 BuyFood 步和已挣工资，来源更新或条件恢复后在原期限内可重试；重复输入/重启不产生双重工资、转移、经验或消费。软不可行等待不伪造 CommandRejected，不扣失败账；只有真提交的拒绝记失败。

secure-food 属临时计划：下层 SocietyAction 执行期间隔离本人保留的健康 currentGoal，随后恢复同一 Goal 的原值（包括 failures），如已有 aid-village 临时保护；不得让下层 hunter 的失败计数误扣健康 Goal。本次失败 failureOwner 为 secure-food planId / goalId=null，且真实 failedActions 只加一次。 验收可用合法初始配置和真实市场观测/玩家交易先形成 recover-health 计划，再触发食物步骤的真实权威拒绝，以验证原健康 failures 不变、健康计划仍保留；这不是第六个默认 recipe，不得直接改写 bundle、回执或历史来造状态。

死亡先于后续审查：当日行为/日结事实保留，次日 dormant，无买粮或工作，历史不删、不复活。保存/恢复须保留计划、履约、经验、引用与时间。工作观察 adapter 必须校验本规则实际 planned/resolved/receipt/SocietyActionCommitted 链；不能把 DTO 合法或健康/买粮成功当工作经历。事件、snapshot、journal 的实质篡改须完整重演拒绝；任一 tick/保存失败无部分发布。

## 6. CLI、服务与检查器的最小消费

- simulation-runner 注册 survival-village，保存/恢复选择显式规则；已有各业务产物照常导出，新增 `survival-config.json`（完整 config）和相应 summary config hash；不添加无消费者的心理数据文件。
- 服务 format7 走现有单 owner、不可变候选 save-then-swap，三投影同 revision；同ID同DTO幂等、异DTO/过期revision按现有409；保存故障保持旧世界与三投影/磁盘，恢复重试只发布一次。loader 仅精确缺失目标依赖可报告 unavailable；不吞内部错误、无 mock fallback。
- `/runtime-mind.html` + `/api/runtime/mind` 复用 inspect-mind 开关、404→405→400 和 HEAD 同头无正文门；不新建吃饭/工作页面或写 API。actor-2 显示本人私粮/钱包、公开 foodQuote 来源与时效、本人 workOffer、当前 secure-food 步骤、为何等待、真实 Work/BuyFood 回执和日结消费。世界事实与本人输入分开，旧决定不更新。反事实仍 null，诚实标注未提供；旧 M1/M2/M3 界面条件不被新分支覆盖。
- 浏览器读只用 GET/HEAD；测试推进由独立 harness 调用原合法 DTO。迟到低 revision/断连保旧已显示数据，textContent 防注入；服务只用自建临时目录/隔离端口，不启停旧实例或用户浏览器。

## 7. 冻结 recipe 与独立手算锚点

五个 recipe 均从 defaultCognitionVillageConfig 的深副本构建，将存在的 mind.stimuli 置为空数组（memory 没有 stimuli 字段，不新增）；原 profiles 及 experience 开关沿用，cognition importance 保持 actor-2=700、actor-3=400。所有人初始 health1000/fatigue0/hunger0，actor-2 hunger200。初始私粮：actor-1/3/player 各20、actor-2=0；私药/私钱其他人全0。公共初始资源 food600、gold1000（这里是分配前总资源），herbs20。经济 wage20、workFood0；food price base/min/max=10、maxDailyChange0；herbs base/min/max=50、maxDailyChange0。普通食物 production.numerator=0、lossPermille=0、flows=[]；maxHunters=0、transportCapacity=0、products.food/herbs.maxOrder=0。其他合法配置沿用基准，不动态调整付款/补给以凑通过。

| recipe | 差异输入 | 必须独立成立的锚点 |
|---|---|---|
| affordable | actor-2 wallet30，无 requests | tick144 BuyFood 真成功：wallet30→20、private0→1；同日消费1，日末私粮0、foodBought1/foodUsed1、hunger200→100。tick288再买1并真实吃饭，钱包10、hunger0；不工作。 |
| earn-then-buy | actor-2 wallet0；一请求 `s-food-01`，tick100/speaker1/listener2/urgency1000/expires200 | tick144 Work 真成功：wallet0→20、workDays1、wages20、foodProduced0；privateFood0、hunger200→300。职责fulfilled。tick288 来源已到期但同 plan 的 BuyFood 真成功：wallet20→10、私粮转入1再消费1、hunger300→200；不再次工作。 |
| no-opportunity | actor-2 wallet0，无 requests | 公开有粮但无合法挣钱机会；tick144/288等待，无工资/买粮/Work经验，无绕道 Hunt；私粮0、hunger200→300→400。 |
| wage-refused | 与 earn-then-buy 相同，仅分配前 gold=0 | 本人可知报价/offer与该 Work 候选在 tick144 相同，但真实工资支付失败；wallet/wages/workDays/foodProduced/foodBought/foodUsed仍0，一次失败与一条本人拒绝经验；tick288已失效请求不可重试工作。其他人的20私粮防止村长偷跑 Work/交易改变支付前提。 |
| no-food | food initial=0，所有人的 initialFood=0；actor-2 wallet30/health50/hunger400，无 requests；workFood0等禁补给项保留 | 日初/日末公共粮0，所有生产/捕猎/运输/工作产粮为0。tick144不会凭钱造粮，真实食物消费0、hunger400→500、饥饿损伤50→死亡；tick288 dormant，无追加动作/删除历史。 |

请求合法与工资公告按本合同公开生成，不注入假 receipt。初始总资源、私有分配和真实剩余公共量不可混淆。每份测试先证明 recipe 的输入与禁止补给项成立，再验行为，不从模块输出抄 expected。

另授权一个明确对抗变体（不是第六个默认 recipe）：从 affordable 完整合法 config 深副本改分配前 food=61、player.initialWallet=10，其他私粮分配仍合计60。tick1 公告时公共粮1且available=true；通过原合法玩家接口提交 `{commandId:'supply-drain-1',type:'PlayerBuy',payload:{product:'food',quantity:1}}`，tick2 玩家买走最后1粮。tick144 仍只有可知的旧报价，actor-2 的购买软候选可行，但权威因真实库存0拒绝；没有私粮转入或消费，不产生 Work 经验。不篡改 bundle、报价或回执；不依赖常规 recipe 下没钱的玩家耗尽540粮。

## 8. A 里程碑与白名单

A1：新 DTO/纯规划器/两个固定 plan、来源 guard、职责履约后续购粮口径。先做模块反例，不跑世界全量。

A2：新 profile 路由、真实命令/观察/日结、CLI 与 checkpoint、五个 recipe。完成 Work→BuyFood 和拒绝/真缺粮链后再接服务。

A3：format7 与旧检查器最小消费、事务/只读/UI检查。三个里程碑属于同一份任务书、同一 A 所有权；可分提交但交付一个完整 SHA。

新增允许文件（最多这些，不自行添框架）：

1. runtime/core/survival-state.mjs
2. runtime/core/survival-planner.mjs
3. runtime/core/survival-signals.mjs
4. runtime/fixtures/survival-village.mjs
5. runtime/knowledge/survival-knowledge.mjs
6. tests/simulation/survival-planner.test.mjs
7. tests/simulation/survival-runtime.test.mjs
8. tests/simulation/survival-service.test.mjs
9. tests/survival-inspector.test.mjs

允许窄修改既有文件：runtime/core/motivation-state.mjs、motivation-planner.mjs、motivation-runtime.mjs、cognition-state.mjs、experience-state.mjs、work-experience-adapter.mjs、world-state.mjs、command-engine.mjs、event-log.mjs、memory-observer.mjs；runtime/service/http-contract.mjs、service-commit.mjs、runtime-owner.mjs；simulation-runner.mjs；runtime-mind.html/.mjs/.css。只增新版本有界分派和必需验证/展示，不重构全部旧分支。

白名单以本列表为准，不声称“恰好 N 文件”后另加清单。若某文件无需改，不改。禁止修改 data-contract、rng/clock/scheduler、hunter/society/actors/ecology/market/resource-ledger、checkpoint底层、M3-1四份冻结文件、旧fixture/旧测试、B白名单和任何控制文档。实现发现白名单缺口或合同矛盾，给最小反例/具体文件，停止该依赖处，不能任意扩大。

## 9. 定向验证、交付与未验边界

A 的测试覆盖 B 任务书 S1～S8 对应行为，但不借用 B 的 expected。模块只跑新 planner 与直接依赖；新规则接入公共重演/版本分派后，扩大到被改 validator/planner/command 路由和服务格式的直接回归，写清每个扩大的依赖原因。

旧 M3 历史全量 822 项是既有证据，不称本轮新跑。不重跑字节与依赖路径均未变化的用例；共享文件变化时不能仅凭旧测试文件 hash 就认为其依赖无影响。B 用同固定输入在6676281与A树做旧 profile 直接兼容对照；阶段集中复验仍限本轮必需新链和直接底座范围，不新开百日/千日压测或全面性能重构。

每次运行保留命令、精确源/test SHA、TAP/exit、耗时、临时服务/进程归属；不能把 timeout、skip、依赖加载崩溃或代理自报当 PASS。并发由资源决定，长模拟/浏览器优先单进程；不要制造假 session API 或弱化反例。

回执包含给用户的闭环与限制、实际目录/分支、代码/文档/交付SHA、精确文件、S1～S8证据、失败修复、未验项和停止点。已有 M3 原始证据异地备份为独立收尾，不能为了本轮先安装工具或重跑已验收模拟。所有新产物只本地精确提交，等待中控独立验收与上传指令。
