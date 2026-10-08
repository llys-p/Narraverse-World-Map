# M3-3A：认知降频与既有计划延续运行时

合同版本：`m3-cognition-runtime-contract-v1`。状态：**本地已发布，待派发、未开工**（2026-10-09 07:41 Asia/Shanghai）。本文件是 A/B 共用 DTO、时序与运行时行为的唯一权威版本；B
只引用本文件，不复制合同。

## 给用户看

本项把“重要性 × 当前相关性”的认知 LOD 接入已有确定性世界：低关注人物减少重新评估的次数，但仍按原规则推进已承诺计划、命令、经验观察、社会日结和保存恢复。遇到本人重要新事实或计划真正失效时会唤醒；降频期间保留本人状态，不生成虚构的经历。它不增加界面、模型或通用插件机制，也不改变物理模拟精度。

## Reference Review

- 设计依据为 control 本地固定参考库对象 `b0b13a3baccf0d26fae167f7827930a1df995876` 的 `PATTERN-DECISIONS.md`：主参考 PAT-007 仅借用重要性×相关性认知 LOD 原则，辅助 辅助 PAT-004 仅沿用已冻结的 commitment 防抖原则。
- 这是 Narraverse 自己的运行时合同，不声称 Veloren、Cataclysm 或其他游戏实现了相同信号、阈值、FSM 或算法；不复制外部代码。本轮不做新联网研究。

## 基准、树与所有权

- 唯一代码起点：`D:\Narraverse-World-Map-m3-integration`，分支 `codex/world-runtime-m3-integration`，HEAD `a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2`。禁止以 `main` 或任意更新的工作树替代。
- 计划执行树：`D:\Narraverse-World-Map-m3-cognition-runtime`，分支 `codex/world-runtime-m3-cognition-runtime`；发布前核实时目录不存在、分支未占用。收到派发后仍须复核目录、分支和归属；已存在时先核实，不覆盖、不重置、不挪用。
- A 交付精确 SHA 由中控在派发/交接时填写。交付前不预填未来提交号。
- 已冻结文件不得修改、复制改名或放宽：`runtime/core/work-experience.mjs`、`tests/simulation/work-experience.test.mjs`、`runtime/core/cognitive-review.mjs`、`tests/simulation/cognitive-review.test.mjs`。不重跑其历史已过套件。
- 只允许改动以下 9 个既有文件：`runtime/core/motivation-runtime.mjs`、`runtime/core/motivation-planner.mjs`、`runtime/core/motivation-state.mjs`、`runtime/core/world-state.mjs`、`runtime/core/command-engine.mjs`、`runtime/core/event-log.mjs`、`runtime/core/work-experience-adapter.mjs`、`runtime/core/experience-state.mjs`、`simulation-runner.mjs`（项目根目录）。
- 只允许新增以下 6 个文件：`runtime/core/cognition-state.mjs`、`runtime/core/cognition-signals.mjs`、`runtime/fixtures/cognition-village.mjs`、`tests/simulation/cognition-planner.test.mjs`、`tests/simulation/cognition-runtime.test.mjs`、`tests/simulation/cognition-runner.test.mjs`。
- 不改 `data-contract`、其他既有测试、HTTP/service/UI、物理/经济/存档模块、他人文件或运行目录。不得碰 control 树中 `ADVISORY-*.md`、`asset-studio.html`、`dual-presentation-demo.html`、`docs/character-mind/REFERENCE-BASED-REPLAN-20261008.md` 等外部建议材料；它们没有本合同指令权。
- 若白名单不能闭环，停止并报告最小缺口及调用链，由中控裁定；不扩白名单。

## 共同合同（唯一权威）

### 1. 规则版本、配置与状态

- 新规则名 `m-cognition-v1`；fixture 名 `cognition-village`，`fixtureVersion: '1'`。不得改旧 `m-experience-v1`、`m-motivation-v1` 或 world 旧版本行为；既有 experience 规则底层 FSM、private fixed profile、authority、日结、学习及 replay 均复用，不复制实现、不建通用插件框架。
- `runtime/core/cognition-state.mjs` 同步导出：`COGNITION_RULES='m-cognition-v1'`、`COGNITION_CONFIG_VERSION='cognition-config-v1'`、`COGNITION_RUNTIME_STATE_VERSION='cognition-runtime-state-v1'`、`COGNITION_MOTIVATION_STATE_VERSION='cognition-motivation-state-v1'`、`COGNITION_KNOWLEDGE_VERSION='cognition-knowledge-v1'`、`COGNITION_DECISION_VERSION='cognition-decision-v1'`、`MAX_COGNITION_MODEL_BYTES=32768`、`MAX_COGNITION_KNOWLEDGE_BYTES=16384`、`MAX_COGNITION_EVIDENCE_REFS=71`，以及 `validateCognitionConfig(config)`、`createCognitionModel(simulationId, config)`、`validateCognitionModel(model)`。
- 默认配置精确为 `{version:'cognition-config-v1',profiles:[{actorId:'actor-2',importancePermille:700},{actorId:'actor-3',importancePermille:400}]}`。顺序固定且恰有两人；validator 接受每个 actor 的 importancePermille 为 0..1000 安全整数，不限制为默认值。`validateCognitionConfig`、`validateCognitionModel`、`validateCognitionWorld` 成功原样返回输入；create 返回脱离输入引用的副本。planner/derive 输出也与输入脱离引用；新建/深克隆结果不得与任何输入共享可变子对象。严格校验精确键、身份和预算。
- `world.cognitionModel` 精确为 `{version,simulationId,config,configFingerprint,cursor,actors}`；actors 按 actor-2、actor-3 排列，每项精确 `{actorId,reviewState,signalBaseline,lastReviewDecisionId,lastReviewEventSeq}`。初态 reviewState 由冻结的 `createCognitiveReviewState(真实simulationId,actorId)` 创建且为空；baseline 和两个 review anchor 均为 null。日内评估后到 Planned append 前的中间态只由可信 hooks 内部持有；sealed 状态须验证 review anchor 的 actor/tick/ID/seq 与完整的本人 review Planned 对应。首次死亡且从未 review 时 anchors 可为 null；sealed store load 不接受中间态。不得预填真实信号/样本、计数器或无界 seen-set。
- 非空 baseline 精确 `{keyEvidenceFingerprint}`。ID/引用只能配对为空或非空，且仅记录本人最近一次完整 review 的 Planned 决定；maintain 不推进 review anchor。
- 当前 `world.experienceModel` 保留 M3-2 版本和结构，不 fork；`motivationModel` 只把版本换成 `cognition-motivation-state-v1`，actors 字段沿用 M3-2。新增专属 decision validator，不放宽旧 validator。Mind 仍为 observation-only。
- 新配置/新规则沿用严格版本隔离和原 checkpoint 语义；合法的旧规则 bundle 行为字节不变。不得改变 snapshot schema 2、event schema 1、checkpoint schema 1。

### 2. Actor-local knowledge 与纯 signals

- 新增 `runtime/core/cognition-signals.mjs`，导出同步纯函数 `deriveActorCognitionSignals(knowledge, importancePermille, baseline, previousExecution) -> {input,baseline}`。知识 DTO 完整复用 M3-2 experience knowledge 的全部精确键、版本校验和派生语义（见 M3-2A §3），只把 `knowledgeVersion` 设为 `cognition-knowledge-v1`；不增加全局 cognitive/world 对象。输入额外参数必须显式传入，不读隐藏世界状态。
- `previousExecution` 仅为 null 或精确 `{simulationId,actorId,tick,decisionId,choice,status,code,failureOwner}`，由可信 runtime 从本人 lastDecision/outcome 投影，完整重演证明来源。simulationId/actorId 必须与 knowledge 相同；tick 是严格早于当前 tick 的正安全整数日界，decisionId 必须为 `cognition-day-{tick/144}-{actorId}`。choice/status/code/failureOwner 遵循原合法动作和结果语义：NoAction 当且仅当 no-action；拒绝为 RULE_REJECTED 且 failureOwner 是合法 `{planId,goalId}`；成功或 no-action 的 code/failureOwner 均 null。任何错配抛 INVALID_INPUT，不降级为无唤醒。importancePermille 只能来自 config 的本人 profile。
- 输出 input 精确为冻结内核的十字段：`simulationId,actorId,tick,alive,importancePermille,relevancePermille,urgentNeed,newMajorDuty,keyEvidenceChanged,goalOrPlanInvalidated`。不得改 frozen kernel 签名。
- `relevancePermille`：死者为 0；存活且本人 currentGoal、activePlan、suspendedPlan 任一非空，或有有效 pending duty（open 且 `observedTick <= tick < expiresTick`），或 `health <= 700 && day >= cooldownUntilDay` 时为 1000；其余为 500。它不是 viewport/距离信号，不使用玩家状态。
- `urgentNeed = alive && (fatigue >= 800 || hunger >= 900 || health <= 300)`。
- `newMajorDuty = alive && 存在open pending duty且urgency>=900且requestId!=planState.lastReviewedDutyId`。
- key evidence semantic value 精确 `{value:belief.value,confidenceEnough:belief.confidencePermille>=600,penaltyPermille:experience.penaltyPermille}`。首次 baseline 为 null 时 `keyEvidenceChanged=false`；之后仅此 semantic canonical 值变化才为 true。raw sequence/tick、日常钱包/草药、计划 step、轻微价格波动不得触发此 flag；这些合法已知值仍可用于当步软资格判断。不得读 communalGold 或他人私账等隐藏状态。
- goalOrPlanInvalidated 仅在存活且满足下列任一项时为 true：既有 cognition-village plan 已过期（day > deadlineDay）、该 plan 与 Goal/request 解绑或不一致、既有 aid-village plan 所绑定的 duty 窗口不合法；本人真实 previous execution 恰为 `tick-144` 且 status='rejected' && code='RULE_REJECTED'（不要求失败 plan 仍 active）；没有 currentGoal 且 health<=700 && day>=cooldownUntilDay；或 activePlan.status 为 ready 且当前 step 的 soft guard 已不满足。仅 lastDuty 到期本身不触发。静态 blocked 条件不逐日唤醒；suspended 非 ready/soft-ineligible 只等待，不算失效，但 expired/unbound 仍按正常失效条件唤醒。
- baseline 每次评估都更新。只有本人现存上一日 outcome 可参与信号，不以 raw event seq 的日增量每日唤醒。

### 3. Planner、continuation 与 decision

- `motivation-planner.mjs` 新增 `isCommittedStepEligible(knowledge,plan)->{eligible,reasonCode}`。plan 必须是该 knowledge 的 activePlan 或 suspendedPlan；只校验当前既有 step，不打分。四类 guard 与旧完整候选共用私有检查，不复制规则：BuyMedicine 要有既有 Goal、草药为 0、belief available 且 confidence>=600、钱包够 quote price、容量足；UseMedicine 要有既有 Goal、私药且 health<1000；WorkForPay 要求同 request open、health>=300、fatigue<=700；Rest 要求 fatigue>=600。沿用现有 reason code。
- 新增 `planCognitionMotivationDecision(knowledge,context)` 与 `continueCognitionPlan(knowledge,context)`；context 精确 `{evaluationEventSeq,sourceReviewDecisionId,sourceReviewEventSeq}`，maintain 的非空 sourceReviewEventSeq 必须严格小于 evaluationEventSeq。full review 的 sources 为 null；只参数化复用既有五候选/full FSM。
- maintain 来源必须是本人最近、严格更早且仍可核验的 review Planned；禁止调用 `collectCandidates`、旧 full planner 或计算 support/opposition/score。maintain 只执行有效 active 当前 step（ready 继续、blocked 对同一步重试）；active 为空时仅可把 eligible suspended 恢复为 active。不得改 steps/stepIndex，不建 Goal/Plan、不消费 nextID、不标新 duty 已 review。
- 无 plan 或 soft blocked 时 NoAction；保留 Goal/合法 slots，状态为 blocked 等待。不得用 scope 外 NoPlan 临时 Rest。Goal 未完成但 actionPlan 已完成且无 slots 时，等待下个 period/critical wake 后再规划，不能假称继续未知 plan。恢复/重试使用原 shared transitions 与 stillBlocked 语义，不制造 `CONDITION_READY` 假转换。
- 新 decision 版本为 `cognition-decision-v1`，保留 M3-2 所有 decision keys，新增 `mode:'review'|'maintain'`、`sourceReviewDecisionId`、`sourceReviewEventSeq`；ID 为 `cognition-day-{day}-{actorId}`。motivation-state 导出 `validateCognitionMotivationDecision`、`validateCognitionMotivationModel`；用参数化私有校验保留旧版本 stric keys、版本和五候选约束。
- review 有原五个 candidates、原六类 gates、sources null。maintain `candidates:[]`，不得伪造旧分数；gate 为 `CONTINUE_MAINTAIN`（执行既有 step）或 `WAIT_MAINTAIN`（NoAction）。choice/reason 按当前意图：Work、Use、Buy、Rest 使用原 `DUTY`/`RECOVER_HEALTH`/`FATIGUE_RELIEF`；空槽等待用 WAIT；软 guard 阻塞用真实 reason。committedIntent/goalId/planId/innerStance 与当前意图一致；NoAction bound plan 可按 M2 语义保留 blocked/suspended plan。
- knowledgeFingerprint 覆盖完整新 knowledge canonical。evidenceRefs 是原 belief + contradiction + duty + experience refs 的并集，加本人 `CognitionReviewEvaluated` seq 和 maintain 所引用最近 review Planned seq，升序去重且最多 71。Runtime full proof 必须核验全部因果来源、配对 anchor、身份及严格先后。

### 4. Runtime、事务、日界与事件

- `motivation-runtime.mjs` 导出 `cognitionRuntimeHooks`，精确形状 `{createWorld,beforeSystems,afterSystems,applyAction,settleDay,validateHistory}`。`createWorld(memory,mind,motivation,experience,cognition,simulationId)`；其余五个函数签名沿用现有 hooks。另导出 `validateCognitionWorld(world,sealed=true)`、`executeCognitionPlayerIntent(bundle,intent)`。hooks 是六函数对象，不是函数本身。
- 所有新增 public API 和新规则 public 路径在任何 clone/canonical 字节预算之前，对完整 descriptor tree 预检：raw bundle/config/snapshot/events/pending/receipts 均覆盖；包含继承数组的 `map` getter，拒绝且 getter 调用数为 0；callbacks/functions 不当作 JSON 扫描。之后才 clone 和计算 canonical 预算。`experience-state` 对该规则窄扩 prefligh 或共享私有分派，不改 `data-contract`。
- 首次只在真实日界 tick 144 评估 kernel；tick 0 只建空 kernel，不发伪 event。默认低分初次 review tick144，之后 next review tick576。日内既有 stimuli/requests → `prepareMindDay` 先照旧；再冻结两名 actor 的完整 knowledge 与 signal input，每人（包括 dead）调用冻结 kernel 一次并更新 reviewState/baseline。
- 先按 actor ID 发两条 `CognitionReviewEvaluated`，精确 `type`、`sourceSystem:'cognition'`、`commandId:null`、`entityIds:[actorId]`、空 cause；payload 精确 `{actorId,input,decision}`。使用各自 eval seq 与旧 review anchor 选择 full/maintain proposal。两个 actor proposal 必须在 chief/任何 actor authority 前全部冻结，再发每个存活者 `MotivationDecisionPlanned`。review Planned 后更新本人 anchor 为该 Planned ID/seq；maintain 保留旧 anchor。anchor 表示最近完整评估，而非该 plan 的最初创建事件；恢复较早的 suspended health plan 仍引用最近 review，并由完整历史证明其原始创建。
- 后续次序为 chief commit → actor-2/actor-3 authority → resolved → 本人 Work immediate observation → society day settle → MindMemory/PlanSettled cleanup。旧共享 world rules/RNG 不得跳过。每动作当天生成新 commandId/receipt，不复用 review command。
- dead actor 只发 `CognitionReviewEvaluated` dormant；不发新 Planned/Resolved/Observed。保留历史 experience、last review anchor 和 kernel。若日结导致死亡，日界 pre-decision live evaluation 可保留，但必须 `deathTick===lastEvaluation.tick`；之后日界 dormant，不能复活，也不能同 tick 以不同 alive 再评。
- authority 对 cognition day decision 要求 `tick === (world.societyModel.day+1)*144`。maintain Work 来源从完整 knowledge 的 duty.requestId、当前 activePlan.requestId、lastDuty request 三方绑定，不用 `d.candidates.find`（maintain candidates 为空）；old/review 仍校验候选 sourceRef。
- post-learning 错误必须回滚整个 tick。world 更新走单写者事务；任何新增 fact 都计入 sealed world 四 cursor。
- sealed cursor 精确要求 `mind,motivation,experience,cognition = finalNextEventSeq-1`（含所有新增事实）；完整审计四模型身份/version/schedule/epoch。

### 5. 经验 adapter、重演与 CLI

- `work-experience-adapter.mjs` 新增 `projectOwnCognitionWorkOutcome(context,actorId,resolvedEventSeq)`；context 精确为 `{simulationId,rulesVersion,eventLog,commandReceipts}`，只接受 cognition rulesVersion。用专属 validator 复用 private chain 核验；不得放宽旧 `projectOwnWorkOutcome` 的 experience validator。
- adapter 核对本规则 review 或 maintain Planned/Resolved/receipt/唯一 Committed 的完整链后，才投影冻结九字段 observe DTO。链内 actor/decision/command/source/tick 错配、重复或缺失 authority 均 fail closed；完整合法但不是请求人物自己的 Work（包括合法其他人物、非 Work、NoAction）返回 null。坏链不能提前 null；不得递归调用 validateBundle。
- 完整 history 必须从 fixture seed/config 与空 cognition kernel 开始，逐日重建 merged signals、kernel eval、full/maintain 选择、authority、observation、day settle，并逐 fact/receipt/ID/RNG 对照。不得以 snapshot 内 mode/anchor 自证，不可只重算 hash。四 cursor 必须都到最终事实。
- namespace 保持现有 `society-day-`、`mind-day-`、`mind-settle-`、`motivation-day-`、`experience-day-`；新用 `cognition-day-` 与 `cognition-eval-`，避免与玩家 ID 冲突。
- 新 fixture `runtime/fixtures/cognition-village.mjs`：`defaultCognitionVillageConfig()` 返回深拷贝 `{memory,mind,motivation,experience,cognition}`；前四项与 M3-2 defaultExperience 配置逐字节等价但互不共享引用。导出位置参数 `createCognitionVillage(seed=42,simulationId='cognition-village',config=...)` 与 `cognitionSystems()`。
- runner 只注册 fixture；沿用原 `days/seed/out/resume`，不加新 API；适用的 M3-2 exports 全部保留。另输出 `cognition-config.json`、`cognition-state.json`（完整 cognitionModel，不共享引用），summary 增加 `cognitionConfigHash` 与 `cognitionStateHash`，复用唯一 summary metadata exclude 规则。
- checkpoint store 不改。同规则且完整合法的 checkpoint 可恢复。完整合法但选项/规则不匹配的旧/新 cross-load，以及真正未知版本，保留 `UNSUPPORTED_VERSION`；超预算保留 `LIMIT_EXCEEDED`。已知旧 rulesVersion 搭配新 cognition world 结构等结构/历史错误包装为 `INVALID_CHECKPOINT` 并保留 cause。不得把不匹配版本误归为结构损坏。

### 6. 错误、安全与旧规则兼容

- 新规则 DTO 精确键、版本与枚举；安全整数、有限范围、身份和事件因果均 fail closed。拒绝 getter/accessor/cycle/symbol/稀疏或自定义数组方法等不安全树，确保不执行访问器。非法输入/坏关联为 INVALID_INPUT，未知版本为 UNSUPPORTED_VERSION，字节或集合/安全整数预算越界为 LIMIT_EXCEEDED；保持完整检查后一次更新，失败不部分写入。磁盘恢复按前述包装/保留 cause 约定，不用宽松 fallback。
- 新旧规则互相隔离。必须以 M3-2 默认四日行为与完整 business bundle 对照，确认 M3-3 新代码下旧规则事件、决定、RNG、世界业务结果相同；不得把新版本行为套到旧档。
- cognition 的降频不是物理 LOD，不暂停 simulation、计划、authority、日结或存档；不得引入 UI/service/LLM/platform、千日压测、自动 main/push/deploy，也不扩展到经济或存档模块。

## A 切片、验证与停止点

- A0：核实 integration 固定 SHA 的当前调用链、signals、recipe 与旧行为；不改文件。本轮 source audit 已完成，不做新网研。`artifacts/.../world-runtime-m33-contract-probes-20261009/result.json` 仅证明手动 kernel 信号时序和既有 daily，不证明新 adapter/集成通过。
- A1：state、guards、signals 与 continuation；共用 helper 和专属 validator，完成 planner 单测。
- A2：hooks、authority、事件、adapter、事务 rollback 与从 genesis 的完整 replay；完成 runtime 单测。
- A3：fixture、CLI、保存恢复及 runner 对照，完成 runner 单测。各片切通过后继续下一片；白名单不能闭环则停止。两路测试与机械任务交给 high 推理子代理；每路测试文件只指定一名写入者，A 生产代码由唯一 owner 修改。
- 必须从真实 `createCognitionVillage` 建立 fresh profile/context；single-tick 定向测试只覆盖局部门，不得替代连续/切片完整 replay。只在被改模块与必要调用链运行本合同新测试；不重跑四个冻结 kernel 测试、未变化且已有有效证据的套件或无关全量 suite；仍运行直接关联的旧模块/存盘回归。测试由唯一测试写入者执行并精确记录命令、exit code、pass/fail/skip/cancel、耗时、被测 SHA 与证据路径。命令为 `node --test tests/simulation/cognition-planner.test.mjs`、`node --test tests/simulation/cognition-runtime.test.mjs`、`node --test tests/simulation/cognition-runner.test.mjs` 及 `git diff --check`。本次合同发布未运行 runtime 验证。
- 任一失败不得 skip/弱化合同；区分缺依赖、测试自身问题与真实缺陷。保持输入与源数据不变，精确 diff，不提交非白名单文件。
- A 本地提交后停止：不合并、不 push、不部署、不改 main、不宣称完整 M3 验收，不更新 control 状态文件或看板。回执需列用户可见行为/限制、执行树/分支/基准 SHA/A 精确交付 SHA、白名单差异、分片验证及未验范围。control 任务发布 SHA 由中控实际发布后回填。

## A 必须实现并交回的验收场景

- **C1 Signals/knowledge 边界**：穷举 relevance/need/duty/semantic变化；只改变隐藏 cash 或他人执行记录不得影响本人 signals。raw seq 变化但 semantic 相同不醒；raw 钱包/草药变化、计划 step 进展本身不醒。阈值用独立 expected 表。
- **C2 降频策略**：真实 fresh cognition-village profile，health=1000、fatigue=0、无请求；保留默认 `mc02` tick12 与 `mc03` tick24 两个 market-check，起始本人 belief 为 available/confidence900。之后不加 stimulus/duty；市场价格/raw seq 可变化但 key-evidence semantic 保持稳定。预期 INITIAL144 → maintain288/432 → PERIOD576。 另测完全无 stimuli：144 INITIAL；首次 daily-public 在288使本人 belief 真实变 available/confidence900，必须 `EVIDENCE_CHANGED` 唤醒；432/576 maintain，720 PERIOD（假定期间无其他 wake）。不得用手工 false flags 代替真实 signals 证据。
- **C3 真实 continuation**：actor-2 importance400，初态沿用 M3-2 默认 health400/hunger0/fatigue650，motivation.requests=[]；确认默认 `mc02` tick12 与 `mc03` tick24 都是 market-check，且本人 belief available/confidence>=600。第二日不新增 stimulus/duty。day1 真买药后 day2 maintain 真 Use 成功。Goal/Plan ID 不变、nextID 不增加、review anchor 仍为旧144 Planned、今日 command 新建、candidates=[] 且正常日结。
- **C4 blocked/wakeup**：blocked 同 step 在条件满足后重试；active null 时只恢复 eligible suspended；空 slots wait；ready 软资格失效触发一次；过期/上一日真实拒绝/new major duty/urgent need 按原 policy 唤醒。验证同日两 proposal 先 freeze。真实 Work(review) 仍产生本人经验；纯 planner continuation 覆盖 maintain Work 分支，并用合法 cognition adapter DTO 验证该链形状。当前 fixture 不必为此制造不可达的 maintain Work 情境；除非独立 review 找到自然 recipe，不得声称此真实场景已实现。消费开关仅关闭惩罚消费。
- **C5 death/身份/时序**：144 当日死亡后 288 dormant；历史不删、不复活；跨 actor、旧 tick、旧 anchor、同 tick merge 都拒绝或严格符合序列。
- **C6 完整重演/CLI**：连续864；非日界切片 200+664、432+432；CLI 2+4 日 vs 连跑6日；业务 bundle、JSON/CSV 与所有 hash 相同，但不比较 summary run metadata。
- **C7 完整性与原子性**：篡改 signals/baseline/input/mode/score/tier、full/empty candidates、anchor、steps/IDs、receipt/work links、cursor/RNG 后即使重算 hash 也拒绝。合同列出的各类篡改反例都必须实质改变数据；每个 mutation 先断言 canonical bytes 实质变化。post-learning 故障及合法自然触发预算上限均整 tick rollback。所有 getter 调用数 0。
- **C8 兼容**：旧 `m-experience-v1` 默认4日源码 a638 与新代码的完整 bundle/所有业务结果相同；M2 默认4日及 D2 C6 ops/C5 已冻结 controller proof 按必要的 bounded compare，原 SHA/oracle 数据来自 M3-2 tasks。不得跑不变的 M3-1 kernel 或几百次 full suite；完整 M3 closeout 留后续。
