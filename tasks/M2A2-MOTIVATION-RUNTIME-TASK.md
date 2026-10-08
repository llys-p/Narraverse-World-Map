# M2A2：动机运行时、权威结算与重演

合同：m2-contract-v2；状态：待派发、未开工。唯一公共定义：[M2 共同合同](M2-MOTIVATION-PLAN-CONTRACT.md)。

## 给用户看

把 A1 的候选与承诺门接入真实日结、旧规则结算和可重演存档。人物的计划和意图只提供有限提议；真实资产及行动结果仍由 World Runtime 的 authority resolver 决定。

## Reference Review

- Problem：承诺计划何时保持或切换，失败如何归属到实际行动，而非错误地算进被挂起 Goal。
- Primary：REF-CDDA。固定源码提交 43be0bb0e65d995a5cbb07a5dc48dab361638f0d：[npcmove.cpp：1697–1849](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1697-L1849)、[npcmove.cpp：1913–1937](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1913-L1937) 与 [npc_test.cpp：6053–6170](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/tests/npc_test.cpp#L6053-L6170)。借按执行状态区分承诺保持/抢占及可恢复阻塞结构；不借实现或数值。
- Secondary：REF-RW / REF-ONI 仅为参考库社区目录级 Urgent/Normal 概念；未核验其官方源码。
- Adopt：PAT-001 的 Need 输入原则、PAT-004 的 Goal 承诺、PAT-009 的事实/主观分离；只借 PAT-003 的有限候选入口，不建通用框架。
- Reject：不复制外部代码、阈值、Oracle 或优先级，不降低本项目确定性、重放与资源守恒要求，不增加运行时通用插件系统。
- Code copied：no。只静态阅读固定代码切片，没有运行外部测试。Narraverse 以自有日结/命令/事实合同独立实现。
- 参考库冻结于 b0b13a3baccf0d26fae167f7827930a1df995876：[ADOPTION-PROTOCOL](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/ADOPTION-PROTOCOL.md)、[MODULE-INDEX](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/MODULE-INDEX.md)、[PATTERN-DECISIONS](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/PATTERN-DECISIONS.md)、[REF-CDDA](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/GAME-CATALOG.md)、[CODE-REFERENCE](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/CODE-REFERENCE.md)。

## 开工、依赖与停止

- 计划工作树：D:\Narraverse-World-Map-m2-core；分支：codex/world-runtime-m2-core。A2 必须等 A1 实际交付并经中控验收，再在同一树串行继续。
- 唯一代码基准：D:\Narraverse-World-Map-m1-integration @ 87aa9b605f5f509ce3b0daa97e34ded004d22f33；main 无 runtime。
- 记录实际 A1 SHA、代码 HEAD、合同/任务书导入控制树 SHA、工作区状态与所有权。缺少 A1 导出或签名不一致时显式停报，不复制实现、不吞 import。
- M2 v1 未开工；v2 首次实现使用已有 motivation-*v1 / m-motivation-v1 / service5 名称，不做旧 M2 数据迁移。
- 本路交付后停止；不合并 main、不启 M3/D3、不接模型/正式平台/真实旧存档/旧实例。

## 文件白名单

新增：

- runtime/core/motivation-runtime.mjs
- runtime/knowledge/motivation-knowledge.mjs
- runtime/fixtures/motivation-village.mjs
- tests/simulation/motivation-runtime.test.mjs
- tests/simulation/motivation-knowledge.test.mjs
- tests/simulation/motivation-runner.test.mjs

允许必要修改：

- runtime/core/command-engine.mjs
- runtime/core/world-state.mjs
- runtime/core/event-log.mjs
- simulation-runner.mjs

禁止修改 persistence 通用审计、society.mjs、hunter.mjs、actors.mjs、rng.mjs、simulation-clock.mjs 的旧语义，服务/UI、A1 源码与测试、B/C 测试、旧 profile 预期、PROJECT_CONTEXT/看板及其它文件。超出白名单先由中控裁定。

## 实现范围

1. 保持 A2 既定公共导出：defaultMotivationVillageConfig()、createMotivationVillage(seed=42,simulationId='motivation-village',config=defaultMotivationVillageConfig())、motivationSystems()、validateMotivationWorld(world,sealed=true)、`executeMotivationPlayerIntent(bundle,intent)`、`describeMotivationPlayerActions(bundle)`、buildMotivationKnowledge(bundle,actorId)（committed phase only）、projectMotivationInspector(bundle)。A2 private decision Knowledge helper 不导出给 B/C。所有函数按合同字段产出，不用 mock 替代生产依赖。
2. 按合同构造固定 memory/mind/motivation config 与封闭 motivationModel。M1 stimuli + M2 requests 的总预算、每 tick 上限、request prefix/cursor、lastDuty、lastReviewedDutyId、履约状态与完整历史由 A2 fixture/world/runtime 交叉校验；使用 A1 proposal 中同一 Goal/Plan id 与递增计数，不另选或重分配；A1 validator 不承担该职责。
3. 只在 M2 rules 分支新增四类事实、候选/Decision/PlanSettled、Duty fulfilled 状态和完整重演。same-tick 顺序沿合同。两位 M2 actor 从同一冻结候选快照规划，再按序由原 resolver 执行；不读取彼此当 tick 结果后重规划。按本合同核对事件实体、commandId、causation refs、gate/score/candidate 状态、failureOwner 与 transitions。
4. 临时 Work/Rest 使用 M2-only 隔离 Goal 投影视图：从候选 world 的副本构造 society 投影，只在其中令该 actor.currentGoal=null，再调用原 authority resolver；不得直接写源 world。提取并提交 resolver 的合法结算结果时保留真实资产、failedActions、lastAction/lastActionDay、产粮、fatigue 与 RNG；仅恢复原 actor 的健康 Goal 字段（含原字段、failures、step），不得用投影 snapshot 覆盖结算结果，不得覆盖/回滚资产、ledger、failedActions、lastAction、其他 actor 或 RNG。投影不持久化、不进入历史。健康 action 走旧 resolver 原语义。不得改旧 society/hunter/actors、物理规则、clock 或 RNG 语义。
5. 失败时，临时 Plan blocked、failureOwner.goalId=null、通用 ledger.failedActions 照常记；被挂起的 health Goal.failures/step 不变。健康 Buy/use 真实拒绝仍由原规则记健康 Goal.failures。Work 成功才标 Duty fulfilled；拒绝保持 pending。NoAction/deferred 不产生命令、receipt 或失败。
6. buildMotivationKnowledge/projectMotivationInspector 严格按冻结顶层字段投影、完整审计后脱离源对象克隆；不泄露 world、他人私账、communalGold、事件全文或未来 RNG。新 rules validator 必须完整重演资产、RNG、失败账、命令与状态转换。
7. CLI 明确注册 motivation-village、恢复规则及 motivation-config.json / motivation-inspector.json 导出；保留旧 mind-config 和全部原 CSV。M2 fixture/rules/service 标识保持原合同版本名，不声称兼容已有 M2 档案。

## 定向验证

运行本路三个新增测试与合同规定的直接消费者验证，至少覆盖：

- Q2 固定四日三层意图链、重大职责请求与 urgent fatigue、真实 Work/Rest payload goalId=0、Goal/Plan ID 连续、Duty 只在真实 Work receipt 成功后履约、失败/成功结果一致。
- Q1 承诺配对：dutyWeight1000/risk0 下 urgency1000 vs899；1000 重新评分选 Work，899 保持治疗 Plan1 Use。核候选来源/score/selectable/gate，非重大请求的高分不得打断。另送达新的本人 requestId 覆盖旧请求时，旧 aid-village Plan 必须转 REQUEST_SUPERSEDED 并取消、不执行、不改资产/Goal.failure、不履约旧请求；保留 suspended 健康 Plan，新 Duty 与 Work candidate/Plan sourceRef 必须同 requestId，不能把旧 Plan 用于履行新请求。
- Q3 期限 fixture 与死亡 fixture 按合同合法 config 从 tick0 连续/分段推进，不改 snapshot、不跳时；health Buy 拒绝 Plan blocked、Goal failure+1 一次；死亡 recipe 中已成功 Buy 后死亡，society estate.state.ledger.goalsFailed 只增加一次、failedActions 不增加、死亡不再额外增加 Goal.failures。另执行真实临时 Work 失败 recipe：player.initialHerbs=20、公仓 herbs initial=50 / production=0、resources.gold.initial=350（路径 memory.society.actors.market.ecology.resources.resources.gold.initial）；actor-2/3 tick144 各购药后，tick144 后且288前经真实 PlayerSell 卖 herbs qty7，duration=1 tick，确认 public cash 降至10、tick200 d01送达、tick288 Work RULE_REJECTED，临时 Plan2 blocked / failureOwner={planId:2,goalId:null} / ledger.failedActions+1，健康 Goal1.failures=0且 step=use，Duty pending、私账/疲劳不变且无供给Belief副作用；tick432过期后恢复 Plan1 Use。逐日核对所有公仓现金、余额、药材、工资、生产和旧日结账。若真实配置与预期不合，停报最小偏差，不改旧 resolver/母规则、不过写deadline、不手造snapshot。
- own-rejection 只对本人 BuyMedicine 权威拒绝；Work/Rest rejection 不改供给belief；日末 public observation 作为独立来源。
- Q4 baseline/反事实不执行、不读隐藏 world、无 RNG/clock/存档写入；A2 只产可审计 Inspector 数据。
- Q5 连续/分段 576 tick（200+376、288+288、432+144）及 CLI 两日保存+两日恢复；tamper 候选来源、selectable/gate、reviewedDutyId、Duty fulfilled 状态或与 Work Plan/candidate 不一致的 requestId/sourceRef、failureOwner、plan/Goal 引用、cursor、事件或 fingerprint 后拒绝；覆盖非日界/日界请求 supersession 的持久化与单一 PlanSettled 合并。
- Q6 A2 adapter：Knowledge/Inspector 只读克隆、服务上限、死亡不再收输入；恢复/重演不重复履约或重置 profile。Q7 旧兼容：M1 默认288、原 Goal deadline、D2C六操作与C5短程，依相同 SHA 已有证据和受影响代码决定复用或定向补跑；不跑全量simulation，阶段集成收口全量一次。
- M1 默认288、原 Goal deadline、D2C六操作与C5短程兼容，依相同 SHA 已有证据和受影响代码决定复用或定向补跑；不跑全量simulation，阶段集成收口全量一次。

建议命令：

    node --test --test-concurrency=2 tests/simulation/motivation-runtime.test.mjs tests/simulation/motivation-knowledge.test.mjs tests/simulation/motivation-runner.test.mjs
    git diff --check

运行时/消费者证据记录真实命令、seed、产物、hash、源码 SHA 与证据目录；不把 mock、旧 SHA 或未执行的外部测试写成本轮通过。

## 交付回执

给用户说明可执行选择、持久恢复和边界。给中控提交 A1/A2 SHA、代码/合同/依赖 SHA、工作树所有权与状态、白名单差异、真实命令/结果、事件/物理/失败账与服务消费者证据、兼容证据、未验证项。完成本路即停止，等待独立 B/C 与中控裁定。
