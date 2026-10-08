# M3-2A：本人 Work 经验消费运行时

合同版本：m3-experience-runtime-contract-v1。状态：待派发/未开工。合同发布 SHA：由中控提交后填写。

## 给用户看

把 M3-1 的本人工作经历真正接入世界运行时：人物完成或被规则拒绝一次 WorkForPay 后，事件会生成可追溯经历；下一次新决策据此调整 Work 候选风险分。已承诺计划、真实世界规则、命令回执、日结和存档重演仍按确定性规则运行。本场景只验证规则消费，不代表通用心理学习、认知降频、UI、服务或模型能力已经完成。

本任务负责运行时实现和实现测试。独立验收见 [M3-2B](M3-2B-EXPERIENCE-ACCEPTANCE-TASK.md)。A/B 均通过也不自动代表完整 M3 收口。

## Reference Review

- 采用冻结本地对象 b0b13a3baccf0d26fae167f7827930a1df995876 的 docs/reference-library/PATTERN-DECISIONS.md 中 PAT-009「事实与主观状态分离」和 PAT-004「承诺保护」作为审阅边界：真实事件可派生当前经历，不能改写旧事件、旧决策依据或已承诺计划。
- 这是本项目根据冻结参考库作出的设计，不是外部项目实现事实。没有核验外部源码，也不声称外部项目采用相同规则。Code copied: no；复用本项目 M2 与 M3-1 内核允许。

## 基准、状态与所有权

- 唯一代码基准：`D:\Narraverse-World-Map-m3-base`，分支 codex/world-runtime-m3-base，HEAD fe1dec0f3ee2ca4560438d268ae90a73cb3199db。
- M3-1A/B 已验收代码与测试字节已在该基准核对一致；本任务不重跑其测试。冻结文件：runtime/core/work-experience.mjs、tests/simulation/work-experience.test.mjs、runtime/core/cognitive-review.mjs、tests/simulation/cognitive-review.test.mjs。不得修改、复制改名或放宽其合同。
- 专用工作树：`D:\Narraverse-World-Map-m3-runtime`，分支 codex/world-runtime-m3-runtime。创建前核实路径不存在且分支未被占用；如已存在，查清归属和脏状态，不覆盖、不重置、不挪用。只从精确基准建立，不从 main 或其他任务树复制。
- 唯一代码提交为本地精确 commit；不 push、不合并 main、不部署、不改控制库状态/看板。测试和机械批处理交给 high 推理子代理；按切片明确测试文件唯一所有权，不让多个执行者同时写同一文件。
- 唯一允许修改路径：
  - 可改既有：`runtime/core/motivation-runtime.mjs`、`runtime/core/motivation-planner.mjs`、`runtime/core/motivation-state.mjs`、`runtime/core/world-state.mjs`、`runtime/core/command-engine.mjs`、`runtime/core/event-log.mjs`、`simulation-runner.mjs`。
  - 可新增：`runtime/core/experience-state.mjs`、`runtime/core/work-experience-adapter.mjs`、`runtime/fixtures/experience-village.mjs`、`tests/simulation/experience-planner.test.mjs`、`tests/simulation/experience-runtime.test.mjs`、`tests/simulation/experience-runner.test.mjs`。
- 禁止改冻结内核与测试、旧测试/helper、数据合同、物理/经济规则、存档模块、HTTP/service、UI、其他 fixture 和文档。若闭环必须改白名单外文件，停止扩范围，把精确调用链、缺失能力和建议最小路径交中控裁定。

## 共同合同（唯一权威版本）

B 路只引用本节，不复制另立合同。共同版本为 m3-experience-runtime-contract-v1。

### 1. 新规则和配置隔离

- 新规则标识 m-experience-v1；fixture id experience-village、fixtureVersion 1。旧 m-motivation-v1 默认、输入、DTO、事件版本和行为字节保持不变；不能只改 version 字符串来接纳新状态。
- defaultExperienceVillageConfig() 返回 {memory,mind,motivation,experience}。前三项分别深克隆当前 M2 默认、不共享引用。experience 精确为 {version:"experience-config-v1",useWorkExperience:true}。开关严格 boolean；false 只关闭候选惩罚消费，真实经历仍记录并发 Observed。
- 保留 motivation-config-v1 字段、actor-2/3 两 profiles、M1 stimuli + requests 合计最多64、同 tick 输入最多8；Work 工资20、耗粮8、fatigue +150、health Goal deadlineDays=20、最多失败3次、cooldown 2日均不得改动；motivation request window 上限仍为288 ticks。
- 新配置 validator 只接受精确键和版本；旧 validator 只接受旧版本。新规则输入由真实事件/命令构造，不提供初始经验字段、注入 API 或预置样本。

### 2. Experience 状态与 world

新增 runtime/core/experience-state.mjs，导出：
EXPERIENCE_RULES="m-experience-v1"、EXPERIENCE_CONFIG_VERSION="experience-config-v1"、EXPERIENCE_RUNTIME_STATE_VERSION="experience-runtime-state-v1"、EXPERIENCE_MOTIVATION_STATE_VERSION="experience-motivation-state-v1"、EXPERIENCE_KNOWLEDGE_VERSION="experience-knowledge-v1"、EXPERIENCE_DECISION_VERSION="experience-decision-v1"、MAX_EXPERIENCE_EVIDENCE_REFS=69、MAX_EXPERIENCE_KNOWLEDGE_BYTES=16384、MAX_EXPERIENCE_MODEL_BYTES=32768，以及 validateExperienceConfig(config)、createExperienceModel(simulationId,config)、validateExperienceModel(model)。

- validator 成功返回原对象；create 返回脱离输入引用的副本。严格 JSON、精确键、字节预算、身份和版本校验；失败不部分更新。
- world.experienceModel 精确为 {version,simulationId,config,configFingerprint,cursor,actors}；actors 仅 actor-2、actor-3，各含 {actorId,workExperienceState}。kernel state 以真实 simulationId 创建且 samples 为空。
- configFingerprint 使用 canonical JSON；cursor 为安全无符号整数，与 kernel 身份及事件历史严格对齐。禁止 fixture/API 注入初始样本。
- motivationModel 旧键保持原样；新 profile 下仅 version 为 experience-motivation-state-v1，config 仍 motivation-config-v1，decisions 使用新 experience-decision-v1。在 `runtime/core/motivation-state.mjs` 新增并导出 `validateExperienceMotivationDecision(decision)`、`validateExperienceMotivationModel(model)`，复用私有参数化实现；原 public validator 严格只认旧 v1，不放宽。
- snapshot schema 2、event schema 1、checkpoint container 1 不变。新增规则必须按 rulesVersion 分派严格校验、事件校验和 replay；旧规则收到新版本拒绝，新规则收到旧/错版本拒绝。按 checkpoint-store 现有行为，loadCheckpoint 对 UNSUPPORTED_VERSION 与 LIMIT_EXCEEDED 保留原码直接抛出；其他结构或历史校验错误包装为 INVALID_CHECKPOINT 并保留 cause。

### 3. 决策知识、评分与承诺

在 motivation-planner.mjs 新增 planExperienceMotivationDecision(knowledge)，与旧候选计算共享私有实现，禁止复制整套 FSM 或另造通用插件框架。

- 新 knowledge 保留旧 knowledge 全部精确字段，再加 experience（由本人 kernel 的 deriveWorkExperience 得到完整 view）与严格 boolean useWorkExperience；knowledgeVersion 为 experience-knowledge-v1，revision 仍为 tick-1。
- 冻结 deriveWorkExperience view 的完整键为 {version,simulationId,actorId,topic,sampleCount,failureCount,penaltyPermille,evidenceRefs}；topic 固定 work-for-pay-execution。view 校验 actor/simulation/version/topic、sampleCount≤4、failureCount≤sampleCount、evidenceRefs 长度等于样本数且严格升序；penaltyPermille 必须等于 min(300,100*failureCount)。身份或推导不符拒绝，不能将损坏状态降级为空经验。
- 只对 soft-eligible WorkForPay 加 opposition：开关 true 时加 penalty，false 时加0；score=support-opposition。opposition 可到1300，不得夹到1000。soft-ineligible 保持 score=null、support=0、opposition=0。其余四候选、5候选次序、6类 gate、承诺优先级和物理规则不变。
- 新 decision 保留旧 decision 全部键与语义，使用新 decisionVersion，id 前缀 experience-day-{day}-{actorId}，knowledgeFingerprint 为完整新 knowledge 的 canonical JSON。
- evidenceRefs 是旧 belief evidence + contradiction + duty + 本人最多4条 experience refs 的升序去重并集，上限69。M2旧64上限保持；不得接入 M2 counterfactual 或 HTTP inspector。
- 计划按既有 M2 gate 流程生成。经验只影响下一次 decision；同日两位 actor 的 proposals 先冻结，后续 actor 事件不改变已冻结 proposals。

### 4. 受信任 Work 结果投影

新增 runtime/core/work-experience-adapter.mjs，导出 projectOwnWorkOutcome(context,actorId,resolvedEventSeq)。

- context 精确为 {simulationId,rulesVersion,eventLog,commandReceipts}，只供新 rule 使用。调用方须是可信运行时或完整历史审计路径；裸 DTO 的静态关联不证明真实发生。
- 逐层核对 MotivationDecisionResolved 的 source/type/schema/entity/actor/tick/command；唯一 causation 指向 MotivationDecisionPlanned；planned payload 的 actorId/tick/decisionId 与 Resolved 匹配，payload.choice 是唯一 action；Planned event.commandId 必须为 null。非 NoAction 时 planned payload.decisionId 必须等于 resolved.commandId。
- receipt 必须是对应 SocietyAction 输入，actor/action/goalId/targetActorId/tick 一致；receipt 与 Resolved outcome 按 status/code/delta 等字段语义对应，不要求这两种不同 DTO 整体相等。成功须有唯一对应 SocietyActionCommitted，receipt.eventSeqs 恰含该事件序号，receipt.result 与该事件 payload 的完整 canonical JSON 必须相等，actor/action/command/tick 均匹配；拒绝必须 eventSeqs=[] 且 RULE_REJECTED。
- 合法其他 actor、非 Work、NoAction 返回 null；损坏、缺失、冲突或伪造链接抛 INVALID_INPUT，不能静默 null。本人 Work 成功/拒绝投影为冻结内核九字段 {simulationId,actorId,sourceEventSeq,occurrenceTick,decisionId,commandId,action,status,code}；最终调用冻结 API observeWorkOutcome(state,outcome)，不改其签名或文件。
- 不在 adapter 内调用 validateBundle，避免 replay 递归。事件总预算140000不增加。所有新增公共函数，以及既有 public 入口的新规则路径，须在首次调用共享 cloneData 或 canonicalJson 之前，对完整输入对象树做 descriptor 预检（包括 knowledge/config/model 与 raw bundle/snapshot/eventLog/pendingCommands/commandReceipts、继承数组的 map 等方法 getter），确保 getter 不执行；之后再做 canonical 字节预算与业务验证。检查只加在白名单内，不改共享 data-contract，也不宣称旧规则路径整体具备同等保护。

### 5. Runtime hooks、事务和日界顺序

- 在 motivation-runtime.mjs 暴露新 experienceRuntimeHooks，并新增 validateExperienceWorld(world,sealed=true)；hooks 精确形状为 `{createWorld,beforeSystems,afterSystems,applyAction,settleDay,validateHistory}`。原 motivationRuntimeHooks 保持不变。
- 新 createWorld 接收 `(memory,mind,motivation,experience,simulationId)`；旧 createWorld 保持原三参数签名，新 hooks 其余五项沿用原签名。复用 FSM 与私有 knowledge 构造，不复制 M2 FSM。lowerWorld 移除 motivationModel/experienceModel 后应精确验证 Mind 真实下层，不改 snapshot schema。
- settleDay 固定绑定新规则 profile；由配置、seed、空 experience 重建。保留 namespaces society-day-、mind-day-、mind-settle-、motivation-day-、experience-day-。旧 profile 命名不变。
- 保留日界顺序：先为两 actor 生成并冻结 proposals，再发 Planned；chief commit 后 actor-2/3 authority 执行并发 Resolved；每个本人 Work Resolved 后立即调 adapter、冻结 API observeWorkOutcome 更新本人 state，再发 ExperienceWorkObserved，sourceSystem="experience"。Observed payload 精确 {actorId,sourceEventSeq,experienceView}；cause 唯一指向 Resolved seq，entityIds=[actorId]，commandId 为 Work command；view 从新 state 派生。
- 全部真实本人 Work Resolved 与 Observed 一对一；其他 actor、非 Work、NoAction 不学习不发事件。死亡人物沿用旧 M2 cleanup，不复活且不再学习，本人既有 experience/state 保留。经验不能反向改变当天已冻结的另一人 proposal。
- sealed 时 mindModel、motivationModel、experienceModel 三 cursor 均等于最终 nextEventSeq-1（包括 Observed/PlanSettled）。新规则 replay 从空经验重算，不信任保存后的 model/cursor 自证。
- 新增 executeExperiencePlayerIntent(bundle,intent)，复用既有事务，返回 {bundle,durationTicks,outcome,result}。仅 authority 命令路径可写物理世界；玩家入口不得直接改资产。
- post-learning 任一预算错误/失败须整 tick rollback，不得部分写入经验、receipt、事件、RNG 或物理状态。

### 6. Fixture、runner、保存和消费者

- 新增 runtime/fixtures/experience-village.mjs，导出 defaultExperienceVillageConfig()、createExperienceVillage(seed=42,simulationId="experience-village",config=defaultExperienceVillageConfig())、experienceSystems。签名按现有注册器的位置参数，不用 options 对象。
- simulation-runner.mjs 注册新 fixture，复用 --days、--seed、--out、--resume，不增加经济开关。导出适用 config/resources/ecology/market/actors/society/memory/mind/motivation、CSV、inputs、checkpoint、现有 summary.json，并新增 experience-config.json 和完整脱离引用的 work-experience.json（experienceModel）。
- 注册贯通 world-state、command-engine（createSimulationSession/事务位于此模块）、event-log、fixture、CLI 与存档 full restore。checkpoint-store 本身规则 agnostic；若必须改白名单外文件，停止并交中控，不自行扩大。
- 本轮不支持 HTTP/service/UI；不能让旧 inspector 对新规则返回假读数。

## A 实现切片

测试和机械工作委派 high 推理子代理，代码生产保持唯一所有者。按序切片，完成一片后核对 diff：
- A0：只做合同/调用链核实；使用既有 M2 fixture 和真实输入 recipe 核实拒付、交易与物理可达性。此时不要求新 profile/fixture 已实现，不先接新 fixture。若真实链不同或场景漂移，报告中控裁定，不改物理规则凑数。
- A1：experience state、精确命名的专属 validators、共享候选规划器；尽量限制在4–5个白名单文件。
- A2：接入新 profile/fixture，加入受信任 adapter、事件观察、runtime hooks、事务和 full replay，不改冻结 kernel；此后跑完整 E2。
- A3：CLI 注册、summary 导出、checkpoint resume 和业务产物核对。
- 一次只推进一片；不得安排多个 AI 同时修改同一文件。

## A 必须实现并交回的验收场景

期待值由实现者之外检查者独立推导；不得从被测输出复制 expected。配对反事实只调用纯 planner，不能向存档世界/历史注入样本。

**E1 候选消费配对。** 同一冻结 new knowledge 下，空经历与真实 kernel 派生 penalty=100 配对：Work score 710→610，UseMedicine 700 不变，其余候选逐字段不变。ordinary committed gate 仍保护计划。

**E2 真实拒付后改变下一日选择。** A0 先从基准核实 recipe。配方候选精确底值：memory.society.player.initialHerbs=20（不是顶层 player）；memory.society.actors.market.ecology.resources.resources.herbs.initial=50 且 production={numerator:0,denominator:8}；同层 gold.initial=350；actor-2/3 默认钱包100、私 herbs=0、私 food=20，player wallet=100、公共 gold=50。tick144 两人各买药50后公共 gold=150；tick144后且200前，真实 PlayerSell herbs qty=7，耗1 tick，玩家+140、公共 gold=10。保留 d01 tick200/expiry432；新增 d02 tick344/expiry576、urgency1000、actor1→actor2。tick288 Work 被 authority 真实 RULE_REJECTED；样本 rejected/penalty100；temporary failure ownerGoal=null、health goal failures=0。tick432 开启经历时 Work=610、Use=700，由真实成功 UseMedicine 使 health 400→500并恢复原 healthPlan；false 仍记录样本但 Work=710。开关 false 对照仅证明不消费惩罚，不要求其与旧 M2 存档字节相等。第三日起两 world 必须真实分歧。recipe 是未运行假设，执行者须报告源码核实与烟测，不得把本任务书说成已验证。

**E3 连续成功修正窗口。** 默认新 profile 第二日真实 Work 成功、sampleCount1/penalty0。另作富裕10日 recipe：actor-2 dutyWeight=1000/risk=0、gold=20000；requests tick=56+(day-1)*144、expiresTick=(day+1)*144、urgency1000、actor1→actor2。至少5次真实成功、Rest 不学、最终四窗引用真实 seq/receipt 独立核。不得冻结未经运行的精确 Work 日期或钱包值。旧 kernel 序列 F,F,S,S,S,S 对应 penalty 100,200,200,200,100,0；这是已验收公式引用，不是本轮六个运行事实。

**E4 因果、幂等和边界。** 他人/非 Work/NoAction 不学习；坏 planned/resolved/receipt 报错而非 null。重复防护以真实 resolvedEventSeq 及同一权威 command/receipt 关联为粒度，不按职责 requestId 去重：同一 request 在不同日产生新的 decision、command、resolved 时，每个合法本人 Work 结果都学习一次。kernel 窗口内相同 sourceEventSeq 且完整九字段 outcome 相同为幂等 duplicate；同 seq 但关联/投影字段不同必须拒绝；已淘汰的旧 seq 拒绝。不得新增无界全历史 seen-set；同一权威 command 不得重复发 Observed。历史 decision/views 不变。

**E5 确定性和恢复。** 同 seed 连续432 ticks 对比200+232及288+144；默认576对比288+288。CLI真实执行2日存 checkpoint 再 resume 2日；业务 bundle/config/inputs/适用 JSON/CSV 一致。只沿用现有 summary.json；summary 对比排除 source identity、startTick、elapsed、memory、executionStats 等运行元数据，不要求整份 summary 字节相同。summary 新增 experienceConfigHash 和 workExperienceHash。

**E6 全恢复历史篡改。** 篡改 sample身份/seq/tick/status/penalty/refs、开关/fingerprint、decision knowledge/score/opposition/gate、Observed缺失/重复/错误cause、receipt result、step/cursor/ID/RNG；full restore 拒绝，重新计算 hash 不能绕过；post-learning预算/故障整tick rollback。

**E7 旧 profile 隔离。** 旧 M2 默认四日须以未改的冻结 M2 源码与既有有效证据核对，不得声称 oracle 文件包含该默认场景。历史 oracle 由中控只读提供：`D:\Narraverse-World-Map-m2-acceptance\artifacts\world-runtime-m2-acceptance-repair-20261008\legacy-oracle-87aa9b6-v2.json`，RAW SHA256 `e7fee8c0bd872a8294615172dd4ee7fef6e6464663d2df9fc4099d9261221b18`；schema 2 baseline `87aa9b605f5f509ce3b0daa97e34ded004d22f33`；canonical `{scenarioSpecs,provenance,results}` payload SHA256 `1ebe129b1a252434e8b103796778f3b71f9ffc6587cb0578f8ea7828d6c87f67`。先核文件 RAW 与 payload 指纹，再只读消费；不得重建、覆盖或提交 artifact。跨机器缺文件时由中控单独提供，不自行复制进代码提交。oracle 中 D2C 精确六操作为一次 m1a-buy-food quantity=2 → sell herbs=1 → forest → rest → village → advance144，终 tick=176；C5 为 createPersonalityHealth(42,"personality-health-seed-42") 推进576 ticks。HTTP 归档字段本轮不复跑。共享底座只做直接受影响的 engine/session（实现位于 command-engine）、world-state、event-log、checkpoint 定向回归。冻结四个 M3-1 文件未变则不重跑内核测试；完整 M3 收口时再集中全量。真实消费者为 API 与 CLI/盘存档，不测浏览器/HTTP。

## 验证、停止与交付

实现者运行改动范围测试和真实消费者检查。测试和机械操作使用 high 推理子代理，独立测试者不得改生产文件。运行本路三项测试：

    node --test tests/simulation/experience-planner.test.mjs
    node --test tests/simulation/experience-runtime.test.mjs
    node --test tests/simulation/experience-runner.test.mjs
    git diff --check

交付说明用户可见行为/限制、工作树/分支/基准 SHA/本地精确 commit、合同发布 SHA、白名单 diff、A0实测结果、E1–E7证据与未验项。发布 SHA由中控提交后填写，不得猜。

范围止于 M3-2A 实现交付；不得做 M3-2B验收、合并 main、push、部署、HTTP/service/UI、M3-3认知频率接入或D3/D4。测试全过也只是待中控验收。

## 当前状态

M3-1已收口；M3-2A/B待派发、未开工；M3-3待设计；完整M3未验收。main未动、远端待同步。
