# M2B：动机检查器与服务接入

合同：m2-contract-v2；状态：待派发、未开工。唯一公共定义：[M2 共同合同](M2-MOTIVATION-PLAN-CONTRACT.md)。

## 给用户看

开发者只读检查器展示人物实际所知、候选来源与分数、承诺门、已提交意图/行动、计划状态和权威结果。最高分不自动等于被选中；假设结果也不等于世界成功。

## Reference Review

- Problem：怎样把候选、承诺保持/打断原因和阻塞结果呈现为可核验的因果链。
- Primary：REF-CDDA。固定源码提交 43be0bb0e65d995a5cbb07a5dc48dab361638f0d：[npcmove.cpp：1697–1849](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1697-L1849)、[npcmove.cpp：1913–1937](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1913-L1937) 与 [npc_test.cpp：6053–6170](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/tests/npc_test.cpp#L6053-L6170)。借按执行状态区分承诺保持/抢占及可恢复阻塞结构；不借实现或数值。
- Secondary：REF-RW / REF-ONI 仅为参考库社区目录级 Urgent/Normal 概念，不声称源码已核验。
- Adopt：PAT-001 的 Need 输入原则、PAT-004 的 Goal 承诺、PAT-009 的事实/主观分离；只借 PAT-003 的有限候选入口，不建通用框架。
- Reject：不从最高分推断 selected，不从 choice 猜 innerStance，不把反事实显示为真实资产成功；不加入心理诊断或复制外部 UI/代码。
- Code copied：no。来源等级为固定源码/测试切片静态阅读；未运行外部测试。Narraverse 使用自己的只读 API 与服务合同。
- 参考库冻结于 b0b13a3baccf0d26fae167f7827930a1df995876：[ADOPTION-PROTOCOL](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/ADOPTION-PROTOCOL.md)、[MODULE-INDEX](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/MODULE-INDEX.md)、[PATTERN-DECISIONS](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/PATTERN-DECISIONS.md)、[REF-CDDA](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/GAME-CATALOG.md)、[CODE-REFERENCE](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/CODE-REFERENCE.md)。

## 开工、依赖与停止

- 计划工作树：D:\Narraverse-World-Map-m2-service；分支：codex/world-runtime-m2-service。当前只派发计划，不预先创建。
- 代码基准：D:\Narraverse-World-Map-m1-integration @ 87aa9b605f5f509ce3b0daa97e34ded004d22f33。
- 记录实际 HEAD、合同/任务书导入控制树 SHA、工作区状态和所有权。可以先用合同 DTO mock 开发 UI/测试；生产路由不得静默 fallback 到 mock。A2 未交付时标依赖待接入/待验，不吞 import、不写死缺失断言、不声称完整 M2B 通过。
- 本路交付停止；不合并 main、不接模型/真实旧档、不启停他人服务。

## 文件白名单

新增：

- tests/simulation/motivation-service.test.mjs
- tests/motivation-inspector.test.mjs

允许必要修改：

- runtime/service/http-contract.mjs
- runtime/service/service-commit.mjs
- runtime/service/runtime-owner.mjs
- runtime-server.mjs
- runtime-mind.html
- runtime-mind.mjs
- runtime-mind.css
- runtime-map.html
- runtime-map.mjs

禁止改 core、knowledge、fixtures、persistence、simulation-runner、A/C tests、旧预算断言、旧 M1 Inspector 行为及状态/架构/看板。超出名单先由中控裁定。

## 实现范围

1. 保留 owner 对旧 profiles/checkpoints 的恢复与处理能力；新增 motivation-village 与 service format 5。service5 只消费 A2 的真实导出和真实服务候选，不改写人物规则或目标归属。M2 v1 未实现，不做档案迁移。
2. public/private Inspector、counterfactual、player 投影与能力信息基于同一候选：全部构造和验证后 durable publish，再一起 swap。GET/HEAD 只读克隆，不恢复、不推理、不落盘、不推进。
3. /api/runtime/minds 沿用 inspectMind=true。默认关闭时任何 method/query 都404；开启后无 M1/M2 检查器能力404。通过 Host/Origin 保护后先能力检查，再方法，再 query；非 GET/HEAD 405，有 query 400。HEAD 与 GET 同状态/头但无正文。API 与三份检查器静态文件同受门控。旧 M1 mind-inspector-v1、时间 DTO1、玩家动作 DTO2 保持原状。不得增加心理/模型/反事实写 API。
4. UI 按真实 DTO 展示：worldFacts、Knowledge、Decision/Outcome、active/suspended/blocked Plan、duty 与履约、反事实。候选列 provider/sourceRef、eligible、分数、selectable 与 selectionBlockCode；展示 gateReason，清楚说明高分候选可能被承诺门挡住。innerStance 原样读 Decision 字段，不从 choice 派生；committedIntent、apparentAction 和 Outcome 分开展示。失败归属只读真实 outcome.failureOwner。假设面板明确是假设，不表示 action 可执行或成功。
5. 人物切换/刷新/双页签不写；迟到响应不得覆盖新 revision；断连保留最后读数并标读失败；安全显示所有人物/配置字段。

## 定向验证

Q6 真实消费者验证：运行本路 service/Inspector 新增测试，并在 A2 接通后执行真实服务与浏览器核验：

- GET/HEAD 两人、实际 revision 与三投影同候选；重复读取不改 tick/revision/input/file bytes。
- 关闭开关和旧 profile 无该能力时404；POST405、query400；Host/Origin 检查顺序正确；静态资源同门。
- 原 ID 重启幂等、stale409；durable save fault 时公共/player/mind/能力都保持旧值；真实玩家动作走 A2 adapter。不得用模拟路由作为生产 fallback。
- 浏览器显示 candidate source/score/eligible/selectable/gate、三层意图、计划保持/打断/恢复、真实 outcome/failureOwner/duty fulfillment；刷新、切换、双页签和断连不推进/写入；反事实不冒充成功。
- Q7 旧兼容只依同 SHA 证据核 M1 Inspector 同服务、默认288、Goal deadline、D2C六操作与C5短程；受影响代码或证据缺口才定向补跑。阶段全量 simulation/export 留给中控收口一次。
- 只用本路创建的临时目录与 port0/已核实空闲端口；不启动/停止他人或旧18212/18302/18312进程，只关闭本路进程。

建议命令：

    node --test --test-concurrency=2 tests/simulation/motivation-service.test.mjs tests/motivation-inspector.test.mjs
    git diff --check

mock、HTTP、浏览器证据分开说明；依赖未交付的部分标未验证，不称通过。

## 交付回执

用户摘要说明入口、候选解释、计划与意图展示及反事实限制。中控回执含代码/合同/A2 SHA、工作树/分支所有权、精确文件、测试命令/结果、真实 HTTP 与浏览器只读证据、临时目录/进程归属和未验证项。验收前维持待验收，不更新阶段结论。
