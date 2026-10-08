# M2C：承诺门、失败归属与真实消费者独立验收

合同：m2-contract-v2；状态：原独立30项red为29 pass/1 browser fail/0 skip；C修复 `574856e9c84c650edebb4ec110cfe806884f4984` 集成于 `83826a8`，修后定向浏览器用例1 pass覆盖原失败，原29项未重跑。集成冻结SHA `83826a82fea5c0edfe62aa3d676313eefe2a7790` 阶段全量58 files、401/401 pass、0 fail/skip/cancel/todo、exit 0；M2及A1/A2/B/C中控PASS。共同合同 Q1–Q7 为唯一 expected 来源；不从 A1/A2/B 输出倒抄预期。

## 给用户看

用独立输入与消费者证据证明候选如何产生、何时保持或打断计划、真实失败记到哪个 Goal，以及保存恢复和页面读取是否保留相同状态。本路只补独立验收，不改生产代码或 A/B 测试预期。

## Reference Review

- Problem：怎样设计能区分普通高分、承诺继续、急迫覆盖、blocked 重试与真实不可能的反例。
- Primary：REF-CDDA。固定源码提交 43be0bb0e65d995a5cbb07a5dc48dab361638f0d：[npcmove.cpp：1697–1849](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1697-L1849)、[npcmove.cpp：1913–1937](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/src/npcmove.cpp#L1913-L1937) 与 [npc_test.cpp：6053–6170](https://github.com/CleverRaven/Cataclysm-DDA/blob/43be0bb0e65d995a5cbb07a5dc48dab361638f0d/tests/npc_test.cpp#L6053-L6170)。借按执行状态区分承诺保持/抢占及可恢复阻塞结构；不借实现或数值。
- Secondary：REF-RW / REF-ONI 仅是参考库社区目录级 Urgent/Normal 概念；未核验官方源码。
- Adopt：PAT-001 的 Need 输入原则、PAT-004 的 Goal 承诺、PAT-009 的事实/主观分离；只借 PAT-003 的有限候选入口，不建通用框架。
- Reject：不测试是否像 CDDA，不复制代码/阈值/Oracle，不把单次拒绝认定 impossible，不接受执行者通过数或 mock 作为独立结论。
- Code copied：no。固定源码与测试切片仅静态阅读；本路独立复算 Narraverse 输入和真实消费链。
- 参考库冻结于 b0b13a3baccf0d26fae167f7827930a1df995876：[ADOPTION-PROTOCOL](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/ADOPTION-PROTOCOL.md)、[MODULE-INDEX](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/MODULE-INDEX.md)、[PATTERN-DECISIONS](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/PATTERN-DECISIONS.md)、[REF-CDDA](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/GAME-CATALOG.md)、[CODE-REFERENCE](https://github.com/llys-p/Narraverse-World-Map/blob/b0b13a3baccf0d26fae167f7827930a1df995876/docs/reference-library/CODE-REFERENCE.md)。

## 开工、依赖与停止

- 计划工作树：D:\Narraverse-World-Map-m2-acceptance；分支：codex/world-runtime-m2-acceptance。
- 代码基准：D:\Narraverse-World-Map-m1-integration @ 87aa9b605f5f509ce3b0daa97e34ded004d22f33。记录工作区、合同 SHA、导入的 A1/A2/B SHA 与所有权。
- A2/B 未交付时可独立审阅合同、准备输入/expected；依赖加载失败只能记待交付，不能报业务缺陷、PASS 或假造反例先红后绿。
- 只做独立验收；不改生产代码、A/B测试、公共合同来消除失败。完成本路停止，不合并 main、不启动 M3/D3、不碰模型或真实旧档。

## 文件白名单

仅新增：

- tests/simulation/motivation-acceptance.test.mjs
- tests/simulation/motivation-service-acceptance.test.mjs
- tests/motivation-inspector-acceptance.test.mjs

证据写入忽略目录 artifacts/world-runtime-m2-acceptance-*。不得改生产代码、A/B tests、旧预期、公共合同、共享 fixture helper 或中控状态/看板。需要共享 helper 时先由中控分配唯一所有权。

## 独立反例范围

1. Q1 候选来源与独立分数：从冻结 Knowledge 独立核验 provider/sourceRef、soft eligibility、Work710/Use700/Rest650、候选固定顺序与同分选择。不调用 planner 生成 expected。
2. Q1 承诺配对：profile dutyWeight1000/risk0，同 actor/初态只改变 d01 urgency：1000 触发 NEW_MAJOR_DUTY 并可选 Work；899 不触发，CONTINUE_COMMITTED 继续 Plan1 Use，即使 Work 分数899。另独立核验原900/200配对中权重单变量变化导致完整重评选择变化。
3. Q2 固定四日链：tick144 Buy / Goal1 / Plan1 step1；tick200 duty 到达；tick288 首次重大门选 Work，health Goal.step仍use、Plan1挂起、Plan2.goalId null、payload goalId0，成功后工资/生产账正确且仅该 requestId 对应 Duty fulfilled/288；Decision 三层意图分离；tick432只Rest并保留健康Goal/Plan；tick576恢复原 Plan1 Use，health500、Goal未完成。
4. Q3 失败归属、漂移和生命周期：从 tick0 用合同 recipe 推进，不手改 snapshot/跳时。期限 fixture 须设 `memory.society.actors.market.products.herbs.maxOrder=0` 禁止外来药材补给；其 Buy refusal 使治疗 Plan blocked，day2–20 NoAction 不重扣，day21 Goal 终止一次，day23新Goal不复活旧Plan；死亡 fixture 的 Buy 已成功，核对 ledger.goalsFailed 仅增加一次、failedActions不增加、死亡不额外作为 Goal.failures 动作失败，后续请求 unavailable。
5. Q3 临时失败归属真实 recipe：使用合同 Q3 指定 player.initialHerbs20、公仓herbs50/production0、resources.gold.initial350（memory.society.actors.market.ecology.resources.resources.gold.initial）。tick144 两NPC各购药后，144与288之间真实 PlayerSell herbs qty7，duration=1 tick，得到140金币并将 public cash 从150降到10；不把玩家私账输入 Knowledge。tick200 d01，tick288 Work score710/major gate，但真实 wage20 支付失败。独立核对 ledger.failedActions +1、failureOwner={planId:2,goalId:null}、健康 Goal1.failures=0/stepuse、健康Plan保持、Work Plan blocked、Duty pending、无私账/疲劳变化和无供给Belief副作用；tick432过期后回到 Plan1 Use。逐日独立对账金币、药材、工资、产粮、actor资产与旧日结。如真实旧规则不匹配，记录最小差异并请求合同修订；不改实现或快照消除失败。
6. Q4 反事实纯度：冻结完整 Decision/Knowledge，独立验证 canonical 文本、baseline choice+candidates+gateReason，再核 duty-minus-200/risk-plus-200。检查高分被 gate 挡住仍显示 gate，零 tick/RNG/clock/command/event/file/ID/Role 状态变化。
7. Q5 完整重演：连续576、200+376、288+288、432+144与CLI两日保存+两日恢复相等；独立覆盖非日界 request supersession 同 tick 持久化以及日界单一 PlanSettled 合并；独立篡改 reviewedDutyId、Duty fulfillmentTick/status、Duty与Work Plan/candidate 的 requestId/sourceRef 错配、source、provider、selectable/block/gate、Goal failureOwner、Plan/Goal引用及A1 proposal的Goal/Plan ID重分配、score、fingerprint、cursor、额外事实后拒绝。restore 不得再消费已履约请求或丢失 supersession 取消记录。
8. Q6 真实消费者：真实HTTP、玩家动作和 A2 adapter；三投影同候选原子发布、同ID重启幂等、stale409、save fault保留旧投影、关闭404。两页真实浏览器读取零写，显示来源、gate、意图/动作/结果和失败归属。mock仅作隔离 DTO 测试，不能替代真实链。
9. Q7 旧兼容：以 87aa9b6 基准的已有证据核 M1 default288/Goal deadline、D2C六操作、C5短程。确认关联代码未变化即可复用；只补直接影响。阶段全量 simulation+export 留给中控收口一次，不跑100/500/1000日旧长程。

## 定向验证

建议命令：

    node --test --test-concurrency=2 tests/simulation/motivation-acceptance.test.mjs tests/simulation/motivation-service-acceptance.test.mjs tests/motivation-inspector-acceptance.test.mjs
    git diff --check

只跑独立反例和直接消费者链。每项失败记录前置配置、最小输入、expected/actual、命令、代码位置、影响、阻断级别；没运行的标未验证。不得用 A1 planner 自产 expected、A2测试计数或 mock 替代中控独立裁定。

## 回执与裁定

用户摘要说明通过的独立证据与限制。给中控目录/分支/基准 SHA、合同及 A1/A2/B SHA、本路交付 SHA、Q1–Q7映射、真实命令与结果、证据目录、PASS/NEED REVISION 和未验证项。只有中控结合 A/B 与真实消费者证据裁定阶段；本路不更新看板/PROJECT_CONTEXT、不将阶段标为通过。


## 中控首次审查（2026-10-08 15:31 Asia/Shanghai）
交付 fbae74d80cf57c9cd6e1df6a6082daebbe692486 已推送，仅三测试文件。原27 tests为6 pass/21 skip；仅将导入接至 A1 ignored 临时副本后12 tests为6 pass/6 skip，仍是假绿：Q1–Q6大多只有依赖 gate 与注释，没有真实 core/runner/http 断言；B 错导入合同不存在的 service/motivation-inspector.mjs，宽 catch-all 会吞掉语法/初始化错误，Q7 固定诊断不核对基准与证据。另修正服务检查概念：合同要求 inspectMind 关闭时 HTTP 404；服务停止时应 connection refused。故 NEED REVISION。证据：交付树 ignored artifacts/world-runtime-m2c-controller-review-20261008/review.md 与 TAP。A1 已交付不等于 C 已导入；不改生产代码或 expected。

## 中控返修复核（2026-10-08 16:26 Asia/Shanghai）
C 修复 `880c10de924b7fdd3b0f17a8900a326e3b53bc8c` 已本地提交，未推送且 tracked 工作区 clean，三项测试现已填实。prepared30 为1 baseline-prep pass、29 精确 A2 dependency skips、0 fail，不算 M2 兼容验收；冻结 A1 副本独立8 pass、4 A2 skips、0 fail。四项 import-failure 负探针与一次冻结 `87aa9b6` oracle 检查已完成。中控源审尚待完成，故 C 未获正式验收。证据 `artifacts/world-runtime-m2-acceptance-repair-20261008`；oracle payload SHA `983717df5384b1f20498b49bbe311dd76fdfdb649f469eb6bf76134f83f21805`，后续消费不重复跑基准。

中控源审补正（2026-10-08 16:33，Asia/Shanghai）：Q7 必须采用已归档 `world-runtime-m1a-compat/scenario.mjs` 的原输入：单条 `m1a-buy-food` 买 food quantity=2，再卖 herbs1、旅行 forest、Rest、返回 village、推进144，最终 tick176；C5 使用 `createPersonalityHealth(42,'personality-health-seed-42')` 推进576。不得换成另一组六条交易或 personality-food。已生成 oracle 的未变场景可复用，原 oracle 保留，补正场景另存新版本；不把准备性通过当作 M2 兼容通过。

## 中控真实集成复核与剩余修正（2026-10-08 17:06 Asia/Shanghai）

C 增量修正 `1b715afbddbab26018c4017c2171cf4a3b27752d` 已本地提交并导入，原17份兼容产物核验通过；v2 oracle payload SHA `1ebe129b1a252434e8b103796778f3b71f9ffc6587cb0578f8ea7828d6c87f67`，旧v1保留。集成 `12ed715` 实际执行三份 C 测试30项：29 pass、1 fail、0 skip、exit1、322187.9791ms。已过 Q1/Q2/Q3/Q4、完整 checkpoint/terminal CLI/篡改拒绝、真实 HTTP/幂等409/保存故障、原 M1/D2C/C5 与服务兼容；不把浏览器失败或阶段回归算通过。62份验收范围文件测试前后 hash 未变。完整证据：集成树 `artifacts/world-runtime-m2-integration-acceptance-20261008/C-independent-12ed715/` 与 `controller-review.json`。

唯一失败位于 `tests/motivation-inspector-acceptance.test.mjs:115`：等待 `NEW_MAJOR_DUTY` 超时，源码将 gate/inner stance 显示为“新的重大职责 · 打开完整重评”/“以健康为虑”。C 的原始枚举文本断言与中文页面显示不一致，尚不能凭源审认定真实页面通过。额度恢复后只修本路浏览器断言，用实际 API DTO 核原 gate/stance/kind，用可见 DOM 专用 ID 核对应中文门控、意图、计划/Goal、来源和失败归属；保留两页、切换/刷新/重载、反事实/磁盘/网络零写、console/pageerror 检查，不给 UI 塞原枚举凑测试，不 skip 或削弱断言。仅定向补跑该浏览器用例并归档截图；已过29项不重复。随后对最终冻结代码做一次阶段全量回归，当前未开始。B/C 子代理因额度限制中断，下一步已排队但尚未执行；不启 M3/D3，不合并 main，不 push。

使用现有本机 driver：`M2C_PLAYWRIGHT_MODULE=file:///C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`；`M2C_BROWSER_EXECUTABLE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`；`M2C_LEGACY_ORACLE=D:\Narraverse-World-Map-m2-acceptance\artifacts\world-runtime-m2-acceptance-repair-20261008\legacy-oracle-87aa9b6-v2.json`。不重复生成基准。

## 中控修复定向复验与阶段收口（2026-10-08 17:40 Asia/Shanghai）

C 浏览器断言修复 `574856e9c84c650edebb4ec110cfe806884f4984` 已导入集成冻结 SHA `83826a82fea5c0edfe62aa3d676313eefe2a7790`。原30项red结果仍为29 pass/1 fail/0 skip；仅定向复跑浏览器用例1 pass，覆盖原失败，不声称重跑30/30。真实 Edge 154.0.4258.62 双页/双 actor、API原枚举与中文DOM、五候选/三反事实/失败归属、刷新重载通过；18 GET/0写、pageerror/console warning/error均0，存档字节不变，四截图证据 `artifacts/world-runtime-m2-integration-acceptance-20261008/C-browser-repair-4f71fcb/`。B 四日真实UI及断连/迟到 DTO 保留也通过；B三条 harness red 保留。阶段全量在该冻结SHA上57 simulation + export共58 files，Node 24.14.0/concurrency2，401/401 pass、0 fail/skip/cancel/todo、exit0；17:23:13–17:37:36（Asia/Shanghai），runner 862724.7246ms、wall 863113.088ms。测试前后tracked/source/test指纹一致且工作树clean；sourceHash `634382b8331645ea83af710a7297a33619fba165712ea774367fc3a69e8159fa`，testHash `7471c392e9f0e0fe64fa7f9a4947b25f9606837c40f5a37e9880813a4dc3ebae`，trackedHash `7ec28fb7786159c086a0b6578d00c641a674fb62e177b973273592e15ad8a6d0`。阶段证据 `artifacts/world-runtime-m2-stage-closeout-20261008/{manifest-before.json,test-files.txt,tests.txt,result.json}`，log SHA `a58a95f3a9e096b7705615e490133fa89e8c6fc288e6d9beb53ac2bc277e3129`。中控据此裁定M2及A1/A2/B/C PASS；停止于M2，不启M3/D3、不合并main。
