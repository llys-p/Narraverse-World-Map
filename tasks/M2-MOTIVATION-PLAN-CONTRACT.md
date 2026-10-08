# M2 共同合同：动机计划与受约束反事实

合同版本：`m2-contract-v1`；状态：任务书已发布、未开工。冻结日期：2026-10-08（Asia/Shanghai）。本合同是 M2A1、M2A2、M2B、M2C 的唯一公共定义；修改公共字段、公式、顺序或错误语义，须由中控同步修订本合同及受影响任务书。四份任务书与本文共用一个合同版本。

执行书：[M2A1 纯规划器](M2A1-MOTIVATION-PLANNER-TASK.md)、[M2A2 运行时集成](M2A2-MOTIVATION-RUNTIME-TASK.md)、[M2B 检查器](M2B-PLAN-INSPECTOR-TASK.md)、[M2C 独立验收](M2C-MOTIVATION-ACCEPTANCE-TASK.md)。

## 1. 起点与范围

- Runtime 唯一基准：`D:\Narraverse-World-Map-m1-integration`，提交 `87aa9b605f5f509ce3b0daa97e34ded004d22f33`。从该提交创建各任务工作树；`main` 没有 runtime，不能作为代码起点。
- 控制文档位于 `D:\Narraverse-World-Map-control`。执行者在派发时记录合同与任务书导入的控制树提交 SHA、实际代码 HEAD、工作区状态和依赖 SHA。
- 新增实验 profile `motivation-village`、fixture 版本 1、rules `m-motivation-v1`、service 格式 5。snapshot 版本 2、event schema 版本 1、checkpoint 容器版本 1 不变。M1、D2C 及其它旧 profile 的行为与兼容产物保持原样。
- 人物固定为 actor-2 猎人、actor-3 商人、actor-1 村长对照、actor-4 玩家；人口仍为 80。M1 的 `mindModel` 保留为观察、公药信念与刺激来源；M2 使用独立 `motivationModel`。M2 中 M1 mind actors 的 `lastDecision`、`lastOutcome` 恒为 null。
- 只增加五种固定候选，顺序为 `UseMedicine`、`BuyMedicine`、`WorkForPay`、`Rest`、`NoAction`。不实现 Hunt、聊天、战斗、模型、MBTI、多目标栈、通用搜索或经验 LOD。
- 动机范围是响应真实村长的做工请求，并在健康恢复、职责、疲劳恢复之间作有限比较。权威物理效果一律复用现有 society resolver，不复制或私写资产规则。

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

固定四日预期（seed 42，未列变量均为默认值）：actor-2 在 tick 144 买药，建立 Goal 1、planId 1，购买成功后下一步为 UseMedicine；tick 200 收到 d01；tick 288 因职责分高于治疗分而执行 WorkForPay，获得工资 20、公粮生产记账 8、fatigue 650→800，治疗 planId 1 / stepIndex 1 挂起；tick 432 请求已过期且疲劳强制 Rest，日结后 fatigue 600；tick 576 恢复原 planId 1 执行 UseMedicine，私药 -1、health 400→500。治疗子计划完成不等于长期 health 目标完成。公仓期末值须按旧日结逐日复算，不能把 `+8` 直接加到最终公仓值。仅将 actor-2 dutyWeight 从 900 改为 700，或 riskAversion 从 200 改为 400，其它不变时，tick 288 改选 UseMedicine。

### Q3 专用合法配置 recipe

以下只为合同 Q3 的存活期限与死亡清理边界，不增加新业务；均从合法配置构造，执行者不得手改 snapshot 或跳时。

- **期限等待 fixture**：从默认配置仅改 actor-2/3 fatigue=200；全部三名 NPC initialFood=32；public herbs initial=0、production=0；全部 NPC/玩家 initialHerbs=0；mind.stimuli 仅为 `[{stimulusId:'deadline-statement',tick:12,kind:'statement',speakerId:'actor-1',listenerId:'actor-2',available:true}]`；motivation.requests=[]；经济固定 wage=20/workFood=8/workFatigue=150/deadlineDays=20/maxFailures=3/cooldownDays=2。actor-2 day1 依据已送达陈述相信有药，创建 Goal1/Plan1（BuyMedicine）；权威库存为0而拒绝，failedActions 与 Goal.failures 各增加一次，Plan1 stepIndex=0。日末公开无药纠正后，day2～20 保留 Goal/Plan1，每日 NoAction，不再扣 failures、不休息、不消费药。day21 旧 Goal deadline 失败只结算一次并清 Plan1，cooldownUntilDay=23；day22 不建新 Goal/Plan；day23 可建 Goal2，belief 仍无药，NoAction 不建新 Plan、不复活 Plan1。通过从 tick0 引擎分段推进覆盖真实前缀。
- **死亡清理 fixture**：从默认配置仅改 actor-2 health=1、hunger=1000、initialFood=0；private herbs=0、wallet=100；其它默认，包括 tick200 的 d01 请求。actor-2 在 tick144 的 BuyMedicine 成功但不回血，日末因无私粮按旧规则死亡；canonical Goal 与待执行 Use Plan 清理、Goal failures 仅计一次，已购私药/钱包及最后 Decision/Outcome 封存。tick200 的 d01 记录 unavailable、不进入 duty；可增加 tick210 给 actor-2 的 market-check，同样 unavailable。推进到 tick576 后死者不再增加 Plan/Decision/报价/观察，旧记录不变，背景世界仍按规则结算。若真实旧 actor 规则不产生此死亡结果，记录阻断并停在合法配置，不手造死亡快照。

## 3. 长期目标、计划与固定状态

- 唯一长期 Goal 继续存于 `world.societyModel.agents[].state.currentGoal`。沿用 M1 的 `recover-health`：仅当没有 currentGoal 且 health≤700、day≥cooldownUntilDay 时创建；Goal deadline 为当前 day+20，原 Goal 字段 `target=800`。Goal 未完成/失败时沿用原 goalId。终止和死亡按旧 society 规则处理，不在 motivationModel 复制 Goal 实体。
- 临时职责和休息计划不创建新的长期 Goal；Plan.goalId 对所有 kind 都引用该人物当前唯一 canonical health Goal，只有无 Goal 时才为 null。临时计划只表达职责/休息用途，绝不复制 Goal。Goal.step 映射为 Use=`use`、Buy=`buy`、Work=`earn`、Rest=`rest`、NoAction=`wait`；不能将 suspended 等计划状态塞入旧 Goal 字段。实际 SocietyAction payload 的 goalId=`Decision.goalId ?? 0`；sentinel `0` 仅对应本日 canonicalGoal=null，其余绑定精确 canonical Goal ID，并绑定本日 Decision/Plan。
- Plan 精确字段：`{planId,goalId,kind,steps,stepIndex,status,createdDay,deadlineDay,requestId}`。kind 为 `recover-health`、`aid-village`、`recover-rest`；status 为 `ready`、`suspended`、`completed`、`cancelled`。治疗无私药时 steps=`[BuyMedicine,UseMedicine]`，有药时为 `[UseMedicine]`；duty 为 `[WorkForPay]`；rest 为 `[Rest]`。最多两步。所有 Plan.goalId 都必须等于本日人物 canonical health Goal ID 或 null；recover-health Plan 必须非 null。若当时存在 Goal，aid-village/recover-rest Plan 同样引用该 Goal ID；若无 Goal 则为 null。health Plan 的 deadlineDay 与 Goal 匹配；临时职责/休息 deadlineDay 为自身请求或当日期限，不要求等于健康 Goal 的期限。除 `aid-village` 外 requestId=null；职责 Plan 的 requestId 必须精确等于其有效本人 duty.requestId。duty deadlineDay=`floor((expiresTick-1)/144)`，rest deadlineDay 为创建当日。ready/suspended 的 stepIndex 满足 `0≤stepIndex<steps.length`；completed 时 `stepIndex===steps.length`；cancelled 时索引仍在合法范围。
- `motivationModel` 精确为 `{version:'motivation-state-v1',config,configFingerprint,requestCursor,cursor,actors}`，不得加额外元字段。`configFingerprint=canonicalJson(config)`；初始 requestCursor=0、cursor=0。actors 恰为 `[ {actorId,lastDuty,activePlan,suspendedPlan,nextPlanId,lastDecision,lastOutcome}, ... ]`，顺序 actor-2、actor-3；初始 lastDuty/activePlan/suspendedPlan/lastDecision/lastOutcome 均 null，nextPlanId=1。requestCursor 是已处理 M2 request 前缀长度；actor-2/3 的 activePlan 若非 null 必须 status=ready，suspendedPlan 若非 null 必须 status=suspended，并仅属于该 actor。所有 active/suspended Plan 的 goalId 按前述规则引用本人 canonical health Goal；健康 Plan 必须非 null，职责/休息 Plan 仅在本人没有 Goal 时为 null。终端 completed/cancelled 只允许出现在当 tick planner/settlement 的瞬时状态与 transitions，不跨日保留在 active/suspended slot；日结清空对应 slot。`cursor` 是已消费 EventLog 序号。nextPlanId 为正安全整数，溢出先拒绝。active/suspended 不得同 planId。计划 ID 与 Goal ID 归属于本人，禁止跨人引用。
- duty 精确字段：`{requestId,sourceEventSeq,observedTick,expiresTick,urgencyPermille}`。仅保留本人收到的最新有效 request；有效窗口为 `[observedTick,expiresTick)`，请求不叠加。过期只在 Knowledge 投影中映射为 null，lastDuty 原记录保留。死亡者不再收到消息、报价或计划。
- committedIntent 精确为 `{goalId,kind:'recover-health'}` 或 null。`apparentAction` 只表示本次所选 choice；是否成功只看 outcome。

## 4. Knowledge、Decision 与公式

### 4.0 公共导出与校验边界

- A1 `runtime/core/motivation-state.mjs` 导出固定常量：`MOTIVATION_RULES='m-motivation-v1'`、`MOTIVATION_CONFIG_VERSION='motivation-config-v1'`、`MOTIVATION_STATE_VERSION='motivation-state-v1'`、`MOTIVATION_KNOWLEDGE_VERSION='motivation-knowledge-v1'`、`MOTIVATION_DECISION_VERSION='motivation-decision-v1'`、`MOTIVATION_INSPECTOR_VERSION='motivation-inspector-v1'`、`MAX_MOTIVATION_ACTORS=2`、`MAX_MOTIVATION_CANDIDATES=5`、`MAX_MOTIVATION_PLAN_STEPS=2`、`MAX_MOTIVATION_REQUESTS=64`、`MAX_MOTIVATION_INPUTS_PER_TICK=8`、`MAX_MOTIVATION_KNOWLEDGE_BYTES=16384`、`MAX_MOTIVATION_INSPECTOR_BYTES=131072`、`MAX_MOTIVATION_PLAN_TRANSITIONS=8`。
- A1 函数签名固定：`validateMotivationConfig(config)` 只接 motivation config；`createMotivationModel(config)`；`validateMotivationModel(model)` 只负责结构/预算合法性，不做历史重演。
- A2 固定导出：`buildMotivationKnowledge(bundle,actorId)` 只构造 committed phase；`projectMotivationInspector(bundle)` 做完整 bundle audit 后克隆。仅 A2 可有 decision-phase 内部 helper，B/C 不得调用内部 helper 或用 A1 planner 生成验收 expected。
- A2 `validateMotivationWorld(world,sealed=true)` 的 sealed=true 只保证配对结构；不替代对 bundle 的完整审计与历史重演。M1 stimuli + M2 requests 的跨配置总预算、每 tick 总量、request 前缀/cursor 及完整历史均由 A2 fixture/world/runtime 校验，不能放进 A1 config validator。

### 4.1 Knowledge

Knowledge 的精确字段白名单为（对象键插入顺序不是合同；fingerprint 使用 canonicalJson）：
`{knowledgeVersion,phase,simulationId,actorId,tick,revision,self,quote,observations,belief,profile,duty,planState}`。

- `knowledgeVersion='motivation-knowledge-v1'`；phase 为 `committed` 或 `decision`。公开投影为当前已提交 tick/revision；每日 planner 输入为当日 tick、revision=tick-1。
- `self` 白名单：`{name,occupation,location,alive,health,hunger,fatigue,wallet,inventory:{food,herbs},currentGoal,nextGoalId,cooldownUntilDay}`。currentGoal 沿 M1 原字段；只含本人值。
- `self.health/hunger/fatigue` 均为 0..1000 安全整数；wallet 为非负安全整数；inventory.food/herbs 均为 0..1000 整数。`quote={product:'herbs',price:uint≥1,observedTick:uint,sourceEventSeq:uint|null}`；sourceEventSeq 非 null 时须为≥1安全整数。`observations` 项为 `{sourceEventSeq,occurrenceTick,observedTick,channel:'statement'|'market-check'|'daily-public'|'own-rejection',sourceActorId:'actor-1'|null,available:boolean|null,confidencePermille,expiresTick}`；`belief={topic:'public-herbs-available',value:'available'|'unavailable'|'unknown',confidencePermille,evidenceRefs:[eventSeq],contradictionRefs:[eventSeq],lastUpdatedTick:uint|null}`。派生/TTL/去重规则沿 [M1 共同合同](M1-CHARACTER-MIND-CONTRACT.md) §4.2；不得使用当前 world truth 替代主体可知信息。
- 所有嵌套数据遵 M1 §8.1 的普通/null 原型、密集数组、无 getter 与预算规则；M2 再按本合同更高的 16384/131072 字节界限拒绝。
- `own-rejection` 继续严格沿 M1 §4.2：仅本人 `BuyMedicine` 的权威拒绝可追加 `channel:'own-rejection'`、`available:null`、`confidencePermille:0` 的观察，使公仓药材 Belief 暂为 unknown；后续可见日末 public observation 可纠正。WorkForPay、Rest、UseMedicine 的拒绝只影响自身 Outcome/既有 Goal 失败账，不产生公仓 Belief 证据。不得增加第二命题或学习字段。
- `profile={dutyWeightPermille,riskAversionPermille}`；`duty` 为上述有效本人请求或 null；`planState={activePlan,suspendedPlan,nextPlanId}`。M2 Knowledge 不含可从 Decision 推导的 `innerStance`、`committedIntent`，也不含 world、他人私账、未来 RNG、事件全文或隐藏 getter。
- 死亡 actor 的 self.alive=false、currentGoal=null、意图/计划清空或封存；不接新观察、请求或决定。历史观察和最近决定/结果按合同封存规则投影，Belief 仅由已知历史及 TTL 纯派生。

### 4.2 Decision 与候选

Decision 精确为：
`{version,decisionId,actorId,tick,goalId,planId,innerStance,committedIntent,apparentAction,choice,reasonCode,strainPermille,candidates,evidenceRefs,knowledgeFingerprint}`。

- `version='motivation-decision-v1'`；decisionId=`motivation-day-{day}-{actorId}`；`apparentAction===choice`。goalId 为当时 canonical health Goal id 或 null。NoAction 的 planId 为 active 治疗 planId 或 null。evidenceRefs 是当时 belief 的 evidenceRefs、contradictionRefs 与当前有效 duty.sourceEventSeq 的去重升序并集；所有来源必须早于本 Decision 且对本人可知。
- candidates 固定 5 项且顺序不变，每项 `{action,eligible,score,support,opposition,reasonCode}`。不合格候选固定 `score=null,support=0,opposition=0`，不参与选优；eligible 才按表公式计算 `score=support-opposition`。同分按候选固定顺序选择。
- 每个候选的软前提仅读 Knowledge：

| action | eligibility | support / opposition / score |
|---|---|---|
| UseMedicine | 有 recover-health Goal、私药>0、health<1000 | support=`recoveryScore`，opposition=0 |
| BuyMedicine | 有 Goal、私药=0、belief.value=`available`、confidence≥600、本人 wallet≥已知报价、本人容量合法 | support=`recoveryScore`，opposition=0 |
| WorkForPay | 本人 duty 有效、health≥300、fatigue≤700 | support=`floor(urgencyPermille*dutyWeightPermille/1000)`；opposition=`floor(strainPermille*riskAversionPermille/1000)` |
| Rest | fatigue≥600 | support=`fatigue`；fatigue≥800 时 support 与 score 固定为 2000；opposition=0 |
| NoAction | 始终合格 | support=0，opposition=0，score=0 |

- `recoveryScore=0`（无 Goal）；有 Goal 时 `max(0,800-health)+300`。`strainPermille=min(1000,fatigue+max(0,700-health))`。所有运算输入为 0..1000 的安全整数；乘法项按表中 `floor(.../1000)` 先整除向下取整。strain 只是派生的压力代理，不是心理测量。
- reasonCode 只允许下表。候选未满足多个前提时按 eligibility 表从左到右遇到的首个失败项返回；Use/Buy/Work/Rest 各自按表中前提顺序检查。NoAction 始终用 `WAIT`。Decision.reasonCode 等于所选候选的 reasonCode。

| reasonCode | 含义 |
|---|---|
| `RECOVER_HEALTH` | UseMedicine/BuyMedicine 合格并表示健康恢复动机 |
| `NO_HEALTH_GOAL` / `PRIVATE_MEDICINE_MISSING` / `HEALTH_ALREADY_FULL` | UseMedicine 前提失败 |
| `PRIVATE_MEDICINE_PRESENT` / `SUPPLY_UNKNOWN` / `SUPPLY_UNAVAILABLE` / `SUPPLY_CONFIDENCE_LOW` / `WALLET_INSUFFICIENT` / `CAPACITY_UNAVAILABLE` | BuyMedicine 前提失败 |
| `DUTY_UNAVAILABLE` / `HEALTH_TOO_LOW_FOR_WORK` / `FATIGUE_TOO_HIGH_FOR_WORK` | WorkForPay 前提失败 |
| `DUTY` | WorkForPay 合格并表示职责动机 |
| `FATIGUE_BELOW_REST_THRESHOLD` | Rest 前提失败 |
| `FATIGUE_RELIEF` | Rest 合格且 fatigue<800 |
| `EMERGENCY_FATIGUE` | Rest 合格且 fatigue≥800 |
| `WAIT` | NoAction |

- innerStance 只由选中候选映射：Use/Buy→`self-preservation`，Work→`duty-leaning`，Rest→`overloaded`，NoAction→`undecided`。不表示完整人格/情绪。
- `knowledgeFingerprint` 是完整 decision-phase Knowledge 的规范 JSON 文本本身（不是不可逆散列值），UTF-8 字节≤16384；不得通过状态摘要替代。

### 4.3 规划纯度与计划转换

`planMotivationDecision(knowledge)` 为纯函数，返回 `{currentGoal,nextGoalId,activePlan,suspendedPlan,nextPlanId,decision}`；不执行命令、不修改输入、不消耗 RNG、不读其他 actor/world。A1 的 validateMotivationConfig 只接 motivation config 并做自身结构/预算检查；M1 stimuli 与 M2 requests 合计≤64、每 tick≤8、已到期请求前缀/cursor 与完整历史由 A2 fixture/world/runtime 交叉校验。

- planner 基于五个候选的 eligible score 与固定顺序选一个动作，并输出与 choice 对应的 canonical Goal/计划状态。
- 四日 FSM 固定为：day1 创建健康 planId 1，Buy 成功后 stepIndex=1/status=ready；day2 挂起 planId 1 并新建职责 planId 2，Work 成功后职责计划 completed 并清 active，健康计划仍 suspended，不在该 tick 自动恢复或执行健康行动；day3 新建 Rest planId 3，Rest 成功后 completed 并清 active，健康计划仍 suspended；day4 恢复原 planId 1 执行 Use，stepIndex=2/status=completed 并清 active，Goal 1 因 health=500 仍未完成。此四日中三个 Plan 的 goalId 都是 canonical Goal 1；临时 duty/rest Plan 不创建新 Goal。每日最多一个真实人物行动。NoAction 不让前日 Rest 标记继续产生 Rest 收益；挂起不延长 canonical Goal deadline。
- NoAction 不创建新的 Plan。可按旧规则建立/保留 canonical health Goal；若已有 ready 治疗计划因本人药物/信念前提暂不满足，可保留原 plan、不推进。空状态仍保持 activePlan/suspendedPlan=null、nextPlanId=1；无 duty/历史决定/结果时 lastDuty/lastDecision/lastOutcome=null。
- active 治疗计划被更高分 WorkForPay 或 Rest 打断时，保留原 planId 与 next step 为 suspendedPlan；最多一层，不复制 Goal。职责计划只有请求仍有效时可执行。
- 治疗恢复时先检查本人当前信息及 Goal；保留原 planId。若前提变化，只局部重算剩余 steps，不补执行旧步骤。成功才推进 stepIndex；失败不推进，也不在 wrapper 之外重复增加 Goal.failures。每日旧 society 结算只允许对每个 Goal 计一次失败。
- 计划完成、canonical Goal 完成/失败、请求过期、deadline、死亡时清理相应计划并记终止原因；active 与 suspended 不得分别对同一 Goal 重复扣失败次数。Goal 创建门槛、失败、冷却与死亡终止遵旧 society 规则；Goal deadline 为 day+20，不因挂起延长。步骤只有对应权威 receipt 成功后推进；失败不推进，Goal.failures 只由旧 resolver 增加一次；NoAction 不加失败。前提变化只局部调整未执行步骤，保留 planId/Goal，不重放已完成购买。死亡/Goal 结束清除 active 与 suspended，不额外计失败。
- M2 wrapper 负责把计划、Goal、step、choice、commandId、事实及完整重演绑定；不修改旧 resolver 行为。NoAction 无命令、receipt 或休息收益。Rest 立即 delta.fatigue=0；日结 `restReduction` 才扣 200，禁止两处扣减。

## 5. 反事实函数

`buildFastCounterfactual(decision)` 先对保存的完整 JSON 文本执行 JSON.parse，再 canonical 重编码并严格要求与 knowledgeFingerprint 字节一致；同时核对 actor、tick、revision、Decision/Knowledge 版本。重算 baseline 的 choice 与 candidates，必须与记录的 Decision 完全一致才可返回任何 case；坏保存 Decision 不能生成假反事实回执。对原 decision-phase Knowledge 副本计算固定三个 case：

1. `baseline`：changedField/fromValue/toValue 均为 null；
2. `duty-minus-200`：changedField=`profile.dutyWeightPermille`，将其设为 `max(0,原值-200)`；
3. `risk-plus-200`：changedField=`profile.riskAversionPermille`，将其设为 `min(1000,原值+200)`。

返回数组项 `{caseId,changedField,fromValue,toValue,choice,candidates}`。仅重跑纯 planner 并返回选择及评分，标注为假设；不承诺 world action 成功。不得生成未来 Knowledge、执行命令、推进 tick、消费 RNG、读取隐藏 world、改原 Goal/Plan/历史 fingerprint/世界文件/hash。无 lastDecision 时 Inspector.counterfactual 为 null。每 actor 固定三 case。

## 6. Outcome、事件与确定性顺序

Outcome 精确字段：`{decisionId,actorId,commandId,status,code,delta,price,publicFoodProduced}`，其中 `delta={wallet,herbs,health,fatigue}`；status 为 `succeeded`、`rejected`、`no-action`。拒绝 code=`RULE_REJECTED`，其它为 null。非成功的 delta 全零、price=null、publicFoodProduced=0。Buy 的 price 为真实扣款；Work price=null、publicFoodProduced=8（旧账生产记账值，不表示净库存增加 8）；Use/Rest price=null。Rest 即时 fatigue delta 为 0，日结另按旧规则减 200。Outcome/Knowledge/Counterfactual 不得包含 communalGold、他人余额、全量 action result 或世界 before/after。

M2 新规则可接收四类 sourceSystem=`motivation` 事实：

- `MotivationRequestResolved`：payload `{requestId,speakerId,listenerId,urgencyPermille,expiresTick,status}`；status=`delivered|unavailable`。entityIds=[listenerId]、commandId=null、causationEventSeqs=[]；unavailable 不进入 duty。
- `MotivationDecisionPlanned`：payload 为完整 Decision；entityIds=[actorId]、commandId=null、causationEventSeqs=decision.evidenceRefs。
- `MotivationDecisionResolved`：payload 为 Outcome；entityIds=[actorId]、commandId=outcome.commandId、causationEventSeqs=[对应 planned eventSeq]。NoAction 仍产生 Planned 与 Resolved/no-action，但没有 SocietyCommand/receipt，不能伪造计划成功。
- 仅 `MotivationDecisionResolved` 中本人 BuyMedicine 的 authority rejected `RULE_REJECTED`，按 M1 own-rejection 规则追加 Observation，引用本事件 eventSeq 并将该命题暂置 unknown；WorkForPay/Rest/UseMedicine 拒绝不得改变该人物的药材 observations/Belief 或旧证据。日末可见 public observation 是独立新来源，不算动作拒绝副作用。
- `MotivationPlanSettled`：仅对当日有 Decision，或死亡/目标终止需清理状态的人物在该日产生一次；没有当日 Decision 时 `decisionId=null`。payload 精确 `{actorId,decisionId,currentGoalId,activePlan,suspendedPlan,transitions}`；entityIds=[actorId]、commandId=null、causationEventSeqs 包含当日 DecisionResolved 和 SocietyDaySettled（若存在），按 eventSeq 升序去重。每个 transition 为 `{planId,kind,fromStatus,toStatus,reasonCode}`，fromStatus 可 null，toStatus 必须为 Plan.status。reasonCode 仅 `CREATED`、`INTERRUPTED_DUTY`、`INTERRUPTED_REST`、`RESUMED`、`PRECONDITION_CHANGED`、`STEP_SUCCEEDED`、`EXECUTION_REJECTED`、`PLAN_COMPLETED`、`GOAL_COMPLETED`、`GOAL_FAILED`、`REQUEST_EXPIRED`、`DEAD`。最多 8 条，按实际 FSM 发生顺序记录；`STEP_SUCCEEDED` 可用 ready→ready 记录 stepIndex 真实推进；`EXECUTION_REJECTED` 可用 ready→ready 记录当日真实拒绝 receipt（Goal.failure 仍由旧 resolver 单次增加）；`PRECONDITION_CHANGED` 可用 ready→ready 记录确有剩余 steps 变化。NoAction 且计划稳定时不产生 transition；其它无实际 Plan/状态变化不记录；不得重复记录稳定状态。reason 按发生顺序：规划创建/挂起/恢复或局部更新→真实动作 receipt 推进或失败→日结完成/死亡/目标终止→清理。每个 plan 的终止 reason 只记录一次；已由 PLAN_COMPLETED 终止的子计划不再为同一 plan 追加 GOAL_COMPLETED。currentGoalId 始终投影 Society 日结后的 canonical Goal。已死亡且无状态变化的人物不继续产生心理事件。

M2 不改 event schemaVersion=1 外壳；tick/eventSeq/输入序列由原引擎分配。NoAction 不登记 SocietyCommand/receipt，但仍记录 Planned 与 Resolved/no-action；不能让计划因 NoAction 假成功。每个 M2 actor 每日最多一个真实动作；chief 按旧规则独立处理，无额外行动。命令 ID 固定 `motivation-day-{day}-{actorId}`，Decision ID 同式。M1 的 `scriptCursor` 和 M2 `requestCursor` 分别精确对应各自已到期并处理的输入前缀；M1/M2 各自的 event cursor 在已提交状态均须等于 `nextEventSeq-1`。来源引用、游标和请求消费均按各自定义完整重演，不重复消费输入。

同一 tick 严格顺序：

1. PlayerAction；
2. M1 心智信息刺激；
3. M2 请求（按 requestId）；
4. 既有每日公开 announcement；
5. 同一候选快照计算 chief 旧 plan 与两位 M2 pure plans；chief 仅保留自身旧结果，丢弃旧 planner 对 actor-2/3 的候选/Goal/资产改动；
6. 按 chief、actor-2、actor-3 顺序执行并由权威 resolver 重新验证当前真实世界；两位 M2 不得读取彼此当 tick 的执行结果再规划；
7. SocietyDaySettled；
8. PlayerDaySettled；
9. MemoryDaySettled；
10. 更新存活者公开 belief，封存死亡者观察与计划状态。

完整重演必须从配置、初始 world/mind/motivation state 与 seed 重算所有事件、输入、计划/Goal/命令绑定、RNG、人口、资产及旧物理账；不得只以 config fingerprint、state hash 或保存的决定通过。M2 validator 只能在新 rules 分支分离 motivationModel 后复用 mind/memory/society 校验，并严格重演完整历史；不得降低 M1 validator 或省略旧物理账。

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

- **Q1 公式与配对因果**：独立计算 tick 288 的 Work 710、Use 700、Rest 650；只改 actor-2 dutyWeight 900→700 或 risk 200→400 后改选 Use。配对除一个 profile 权重外输入完全相同。
- **Q2 四日计划链**：验证 Goal 1 / planId 1 的 Buy→挂起→职责 Work→紧急 Rest→原 Use；health=500、真实工资/私药/公粮账正确，health target 800 未宣称完成。
- **Q3 漂移与失败**：用 §3.1 期限等待/死亡两个合法 fixture。前提变化后按当前本人 Knowledge 局部调整，不补旧步骤；失败不推进、不重复扣 failures；BuyMedicine 权威拒绝产生 M1 own-rejection/unknown，WorkForPay 拒绝不改药材 Belief 或旧证据（若当日日末公开观察改变 Belief，按独立来源核对）；NoAction 不是 Rest。验证死亡、Goal deadline 第 21 日、cooldown 第 23 日清计划且不重复扣失败。
- **Q4 Counterfactual 纯度**：三 case 和公式独立核算；零 RNG、命令、事件、文件/tick 变化，不读取 world/未来。
- **Q5 重演与磁盘**：576 连续与 200+376、288+288、432+144 分段一致；CLI 两日+两日恢复，format5 磁盘与重启；篡改 goal/plan/source/score/fingerprint/suspended/cursor/额外事实均拒绝。
- **Q6 消费者链**：真实 HTTP、玩家动作、三投影候选同次发布、原 ID 幂等、stale 409、保存故障保持旧投影、双页浏览器读取零写、开关关闭 404。
- **Q7 兼容**：旧 M1 默认 288、目标 deadline 原测试、D2C 六操作与 C5 短程对照基准 87aa9b6。复用同 SHA 既有证据；若公共底座变化再补直接配对，不重复已绿组凑数量。

## 10. 路线边界、交付与停止

- 三条执行路：A 含串行 A1→A2；B 为服务/检查器；C 为独立验收。A1、A2 使用同一计划工作树但绝不同时编辑。A2 依赖 A1 实际交付 SHA。B/C 可先用合同定义的模拟 DTO 开发，但集成只接受 A2 实际导出；依赖缺失须显式记为待验，不得吞 import 或写成永远缺失。
- A1/A2/B/C 均只按对应任务白名单修改。超白名单时先提供精确调用链、必要文件与理由，等中控更新合同。中控独占 PROJECT_CONTEXT、架构文档与看板。
- 每份任务交付包含用户可读功能摘要、目录/分支/实际基准 SHA、工作区所有权/状态、合同与依赖 SHA、精确文件、真实运行命令与结果、证据位置、未验证项和停止点。执行者不得把计划任务书标为开工，不得自行接 M3/D3、合并 main、部署或改真实档。
- M2 发布阶段只验证本文与四份任务书的链接、白名单互斥和合同一致性；不宣称代码实现、运行测试或阶段验收。M2 开发定向验证；阶段集成收口时全量 simulation+export 一次。旧 100/500/1000 日 CLI、模型和下一阶段均不在本合同范围。
