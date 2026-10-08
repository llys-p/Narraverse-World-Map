# M2A1：候选收集、承诺门与纯规划器

合同：m2-contract-v2；状态：已交付，2026-10-08 中控首次审查 NEED REVISION。唯一公共定义：[M2 共同合同](M2-MOTIVATION-PLAN-CONTRACT.md)。

## 给用户看

实现一个只读本人 Knowledge 的五候选收集器与纯规划器。它说明候选从何而来、分数如何构成、当前计划为何继续/恢复/被重评；World Runtime 仍决定真实行动是否成功。

## Reference Review

- Problem：候选从何而来，普通高分何时不能打断承诺，急迫疲劳和重大职责何时允许重评。
- Primary：REF-CDDA。固定源码提交 43be0bb0e65d995a5cbb07a5dc48dab361638f0d：[npcmove.cpp：1697–1849](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1697-L1849)、[npcmove.cpp：1913–1937](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1913-L1937) 与 [npc_test.cpp：6053–6170](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/tests/npc_test.cpp#L6053-L6170)。借按执行状态区分承诺保持/抢占及可恢复阻塞结构；不借实现或数值。
- Secondary：REF-RW / REF-ONI 仅为参考库社区目录级 Urgent/Normal 概念，不声称源码已核验。
- Adopt：PAT-001 的 Need 输入原则、PAT-004 的 Goal 承诺、PAT-009 的事实/主观分离；只借 PAT-003 的有限候选入口，不建通用框架。
- Reject：不复制 CDDA 源码、阈值、Oracle 或优先级；不建通用插件、多层暂停、全知候选过滤或实时日内打断。
- Code copied：no。来源等级为指定固定提交源码/测试切片的静态阅读；未运行外部测试。Narraverse 专属改造是按 Knowledge、permille 评分、确定性计划与重放实现。
- 参考库冻结于 b0b13a3baccf0d26fae167f7827930a1df995876：[ADOPTION-PROTOCOL](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/ADOPTION-PROTOCOL.md)、[MODULE-INDEX](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/MODULE-INDEX.md)、[PATTERN-DECISIONS](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/PATTERN-DECISIONS.md)、[REF-CDDA](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/GAME-CATALOG.md)、[CODE-REFERENCE](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/CODE-REFERENCE.md)。

## 开工、依赖与停止

- 计划工作树：D:\Narraverse-World-Map-m2-core；分支：codex/world-runtime-m2-core。A1 完成且经中控验收后，A2 才能在同一工作树串行继续，不能同时编辑。
- 源码唯一基准：D:\Narraverse-World-Map-m1-integration @ 87aa9b605f5f509ce3b0daa97e34ded004d22f33。main 没有 runtime。
- 开工记录实际代码 HEAD、合同/任务书导入控制树 SHA、分支、工作区状态与所有权。M2 v1 未开工且无实现/存档，v2 不做迁移。
- A1 完成并交付 SHA 后停止；不执行 resolver、不接 runner/service/UI、不推进世界或 A2。

## 文件白名单

仅新增：

- runtime/core/motivation-state.mjs
- runtime/core/motivation-planner.mjs
- tests/simulation/motivation-state.test.mjs
- tests/simulation/motivation-planner.test.mjs

不得修改其它文件，包括 A2 runtime/fixture/knowledge/runner/service、旧 resolver/物理规则、旧 profile 测试、公共合同、状态文档或看板。超出白名单先给中控精确调用链和必要理由。

## 实现范围

1. `runtime/core/motivation-state.mjs` 必须导出合同 §4.0 列明的精确常量和值：MOTIVATION_RULES、五个 MOTIVATION_*_VERSION，以及八个 MAX_MOTIVATION_*；同时导出 validateMotivationConfig(config)、createMotivationModel(config)、validateMotivationModel(model)。validator 只校验 motivation config/model 自身结构、普通/null 原型、密集数组、无 getter、安全整数和预算；不接 memory/mind，不校验跨 mind+motivation 总预算、输入前缀/cursor 或完整历史。不得以“沿用 v1”代替合同常量表。
2. motivation-planner.mjs 导出 collectMotivationCandidates(knowledge)、planMotivationDecision(knowledge)、buildFastCounterfactual(decision)：
   - collect 返回合同固定五项及 provider/sourceRef、eligible、score、support、opposition、reasonCode；只读 Knowledge，健康 Goal 仅纯推导候选，不分配真实 ID。
   - plan 额外应用合同六级 gate，产生 selectable/selectionBlockCode、gateReason、三层意图、Goal/Plan/reviewedDutyId 状态。潜在 Goal id 从 Knowledge.self.nextGoalId 纯提议，Plan id 从 Knowledge.planState.nextPlanId 纯提议，检查溢出且不改输入；A2 按 proposal 原样提交，不得重分配。返回 {currentGoal,nextGoalId,activePlan,suspendedPlan,nextPlanId,lastReviewedDutyId,decision}。
   - buildFastCounterfactual 验证完整 canonical Knowledge 文本和 baseline 的 choice/candidates/gateReason 后返回固定三个假设；每项含 gateReason。不能执行 action、改 ID/Role/状态、消耗 RNG/clock 或访问 world。
3. 五候选顺序、评分与 reasonCode 沿合同保持；候选的 provider/sourceRef、选择门、plan.goalId、failureOwner 等不可自行扩展或省略。真实候选评分不可访问 communalGold 或隐藏供给。
4. 不把旧 resolver 失败语义当作纯 planner 能证明的事实；A1 仅验证 DTO 纯逻辑。

## 定向验证

运行本路两个新增测试文件及 git diff --check。覆盖候选来源/顺序与软前提、逐项分数/reasonCode、major urgency 1000/899 配对、同分顺序、urgent fatigue 只开 Rest、continuation 对普通高分变化稳定、从 Knowledge.self.nextGoalId/Knowledge.planState.nextPlanId 纯提议并递增、ID溢出拒绝、A2不得重分配，恢复原 planId、local replan、Duty fulfilled 不再形成 Work 候选、lastReviewedDutyId 仅在 major gate 更新。

Q1 独立手算 Work710 / Use700 / Rest650、固定顺序、承诺门和权重配对。Q4 反事实必须验证保存 Decision 的 baseline choice+candidates+gateReason，全量字段拒坏输入、三个 case 都不修改输入/ID/Role 状态/RNG/clock/文件。覆盖 blocked/deferred/impossible 语义、Plan.goalId 与临时 payload 规则。

建议命令：

    node --test --test-concurrency=2 tests/simulation/motivation-state.test.mjs tests/simulation/motivation-planner.test.mjs
    git diff --check

不跑整套 simulation/export，不把 A2 依赖未交付当作 A1 验收通过。

## 交付回执

用户摘要说明候选和承诺门可解释范围及限制。中控回执包含目录/分支/基准 SHA、合同导入 SHA、A1 SHA、工作树所有权、精确文件、Q1/Q2 对应验证命令与结果、证据位置、未验证项和停止点。A1 完成即停止，不做 A2、不合并 main、不改阶段状态。


## 中控首次审查（2026-10-08 15:34 Asia/Shanghai）
交付 `6ee1719e0403a8bff0422a046ab221f3b79fc89b` 已推送，四个白名单文件、tracked 工作区干净。原定向 Node v24.14.0 suite 35/35、0 skip、exit 0（325ms）。新增两项紧凑纯 DTO retry probes 均失败（329ms、exit 1）：有 active aid Plan、无 suspended Plan、pending duty 的 day1 直接 Work 被拒后，day2 blocked retry 实际换成 Plan2/nextPlan3，expected 保持 Plan1/nextPlan2；去掉 Goal 的对应输入实际为 SELECT/Plan2。该构造仅检 planner DTO，不代表真实 world 历史。较早的宽 DTO probes 另显示 sourceRef 丢失与 counter 边界/ID 复用问题；不把宽 probes 描述为规范 suite 的业务 case。证据均在交付树 ignored `artifacts/world-runtime-m2a1-controller-review-20261008/`，含 `focused-retry.test.mjs`、TAP、metadata、independent probes。A1 结论仅限纯 DTO，A2 未测试；NEED REVISION。