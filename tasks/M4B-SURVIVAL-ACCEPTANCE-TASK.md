# M4B：有界自主取食与收入闭环独立验收

任务版本：`m4-survival-acceptance-v2`。本文件是独立验收任务书，不复制或改写公共合同；行为期望唯一引用 [M4A 有界自主取食与收入闭环](M4A-BOUNDED-SURVIVAL-TASK.md)。

本轮中控精确代码交付：`520e838b162edae7419fcb69a4edb32c79bdb65e`，源码 `D:\Narraverse-World-Map-m4-controller @ codex/world-runtime-m4-controller`，仅本地。B 以此 SHA 导入，原 A 0bf08dd 不替代修正候选；159 项定向通过是中控证据，B 必须独立完成自己的门。

## 1. 坐标、依赖与停止点

- 唯一代码基准：`D:\Narraverse-World-Map-m3-closeout-controller @ 667628166546a3f342873105b93a8684063504c1`。
- B 计划工作树：`D:\Narraverse-World-Map-m4-survival-acceptance`，分支 `codex/world-runtime-m4-survival-acceptance`。开工先核实路径、分支、归属和 Git 状态；不覆盖现有树或改动。
- A 交付 SHA 必须由中控精确派发。收到前只可准备不依赖 A 产物的独立期望；没有 SHA 不可检验 A 交付、不可宣称通过。缺少依赖时 required gate 非零阻断；skip/timeout/加载失败均不通过。
- 只新增本文件 §2 列出的三份验收测试。测试证据可写入 ignored artifacts。不可修改生产、A 测试、既有 oracle、任何其他任务书/项目文档/看板。A 未到时可先编写独立断言，依赖门须非零报告“未交付”，不能给 PASS；中控提供精确 A SHA 后才导入并实跑真实链。
- 仅本地精确提交测试文件，不 push、不合并 main、不部署、不推进 D3/D4。B 完成当前范围即停止，交中控独立审查。

执行公共合同 m4-survival-contract-v2；原 A 0bf08dd 不是本轮验收目标，以中控修正候选精确 SHA 为准。

公共合同的派发前疑点已由中控在 A §3～§5 钉定，见本任务末尾的执行口径。B 执行者只按钉定合同和收到的 A 精确交付 SHA 验收，不私自改写期望。

## 2. B 白名单与证据规约

仅允许新增：

1. `tests/simulation/survival-acceptance.test.mjs`
2. `tests/simulation/survival-service-acceptance.test.mjs`
3. `tests/survival-inspector-acceptance.test.mjs`

可用 A 导出构造配置、bundle、CLI 场景；不得把被测 planner/derive/inspector 的输出反抄成 expected。S4、死亡、资产、TTL 和旧 profile 期望从 A 固定 recipe、权威规则及手算锚点独立推导。服务使用临时目录和隔离端口；浏览器只对本任务临时服务发 GET/HEAD。

每个 required gate 记录命令、基准/A 精确 SHA、相关源文件与测试文件 SHA、TAP/exit、耗时和临时进程归属。只测改动及直接影响；若扩展到共享 validator、重放、ServiceCommit、CLI 或 HTTP 文件，说明依赖路径。不能凭测试文件 hash 推定变更依赖未受影响。

## 3. S1—S8 独立验收门

### S1：Knowledge 可见性与报价来源

证明 actor-2 Knowledge 只有 A 指定字段；无公共现金、其他人私账、隐藏市场对象、原始回执。报价来自本人在场时的 tick1 / 每日决策前现场公告或公开 `SocietyDaySettled` 投影；核对活着/在 village 的可见边界、每 tick 至多一次，以及观察→全体 proposal 冻结→命令执行的顺序，核对真实价格、available、来源序号、TTL 边界、未来/错主体拒绝及缺失/过期不可行。纯 DTO 只验形状和输入内绑定；错事件 seq/伪造报价真伪在 trusted projection、权威入口与 bundle 完整重演层验拒绝，不能要求不读事件的纯函数认证外部事实。以 descriptor/getter 反例确认 getter 调用数为 0，并覆盖额外键、稀疏数组、symbol、环和非 JSON 值。actor-3 仍得到 cognition Knowledge。

### S2：纯规划、锚点、健康计划与失败归属

用冻结 Knowledge/context 调用候选和规划器，验证相同输入不变异且结果确定，不读取 world/bundle/provider；full review 候选恰 6 项且旧 5 项顺序、分数不被改写，maintain candidates 为空，BuyFood 理由码按 A。覆盖 BuyFood、合法 Work→BuyFood、无请求、不可用/过时报价、低余额、身体 guard、已承诺步骤、期限 d+3/d+4，以及 decisionId/evaluation 与 source review 锚点。验证 `goalId=null`、固定两种 plan shape、same planId continuation；最多暂停一个 recover-health plan并保留 currentGoal/goal ID/失败数/截止日，拒绝双暂停/其他 goal 绑定。用纯 Knowledge 输入 `privateFood>1` 验证条件性恢复，不要求普通购粮/消费链自然恢复。失败只归属于真实 rejected command 的当前步骤，不能把软阻塞计作拒绝。 按 A §5 的合法配置/真实交易变体，先证明 recover-health 计划真实存在并被暂停，再制造 secure-food 步骤的真实 RULE_REJECTED；断言健康 Goal 的 failures 与暂停计划不变，failureOwner={planId:foodPlanId,goalId:null}，本人 failedActions 恰加一次，并保留全部准备链证据。

### S3：真实可买与收入后购粮闭环

按 A `affordable` 与 `earn-then-buy` 手算锚点走完整服务/运行链：真实权威成功回执、私钱包/库存与 ledger 对账、Work 经验只记本人、Duty fulfilled 后仍用同一 planId 在后续日购粮、request 到期不阻断第二步、日结后 privateFood/foodUsed 恰消费一份。断言无同 tick 双动作、无免费工资/产粮、无以买粮成功替代 Work 履约。

### S4：无机会、工资拒绝与真实缺粮

按 A `no-opportunity`、`wage-refused`、`no-food` 配置核对独立手算结果。区分合法等待、authoritative RULE_REJECTED、库存不足拒绝及真实死亡；工资拒绝不得发工资/产粮/买粮，只记一次本人失败与 Work 经验，过期请求不得重试；真实缺粮不得凭 wallet/报价造粮，死亡后 dormant 且历史保留。再分别执行 A §7 两个对抗变体：玩家于 tick2 买光后，tick144 必须观察到缺货并合法等待（无失败账）；同日最后一粮竞争时，先看到有粮、后被 actor-1 合法买走，actor-2 真提交被拒，failedActions 恰加1且不转移/消费私粮、不产生 Work 经验。不得用篡改 world、报价或 receipt 代替此链。

### S5：资产、幂等与生命边界

跨多个日结核验私粮、公共库存 outflow、消费、工资、现金、购买价、经验样本和日动作上限守恒。重复同 ID/同 DTO 只一个效果；同 ID 异 DTO、过期 revision 按现有冲突语义拒绝；重放与保存/恢复不得重复工资、购买、经验、消费。死亡当日事实存在，次日无新计划/动作且不复活。

### S6：checkpoint、CLI 导出与完整重放

对 survival 场景连续运行 288 ticks，与 144 ticks 保存/恢复后再运行 144 ticks 比较完整 bundle、事件顺序、receipt、计划/履约、经验、RNG 和 CLI 导出的 `survival-config.json`/摘要 hash；导出值须与当前合法配置一致。对 event、snapshot、journal 各做实质篡改，完整审计应拒绝；tick/save 失败必须证明旧 bundle/owner state 无部分发布。

对 `m-motivation-v1`、`m-experience-v1`、`m-cognition-v1` 使用默认 fixture、固定 seed 42、288 ticks，在基准与 A 树比较完整 bundle 和全部既有业务 JSON/CSV 导出及 summary 的业务 hash 逐字节一致（临时目录/端口等 harness 外部记录不属于业务导出）。文件与依赖路径未变的历史证据可标记复用；本轮不得谎称复跑旧 M3 全量 822 项。若共享文件有差异，给出依赖影响证据；不得仅凭旧测试 hash 宣称无影响。

### S7：ServiceCommit format 7 与旧格式兼容

覆盖 format7 新规则/`survival-day-` ID 前缀、其余旧前缀精确保护、DTO1 advance 与 DTO2 player-intent 路径。断言三投影同 revision、同 ID 同 DTO 幂等、异 DTO与旧 revision 为 409、磁盘保存失败保留旧内存/磁盘/三投影且可安全重试；只允许新增 survival 前缀，不扩大 format1–6 集合。loader 对精确缺失目标依赖可报告 unavailable；内部错误不能吞掉或 mock。

### S8：真实浏览器检查器与旧 cognition 对照

隔离启动当前 A checkout 的临时服务，在真实浏览器通过 GET/HEAD 验证 `/runtime-mind.html`、`/api/runtime/mind`：actor-2 展示本人钱包/私粮、报价来源与时效、workOffer、当前步骤、等待原因、真实回执和日结消费；静态公开事实与本人账分开，旧决定不被改写，反事实诚实为 null。验证断连、低 revision 不回退已显示数据、用户文本不执行；旧 cognition UI 路径/字段保持。禁止浏览器发写请求、调用不存在的 endpoint 或连接旧实例。

## 中控修正后的重点交接

中控原 A 反例包括隐藏工资支付布尔值进入规划器、首次健康目标漏建、真实购粮拒绝漏记失败、maintain 超期执行、旧 cognition validator 错收 survival 输入。验收以中控修正提交为目标；现有中控测试只是定向佐证，不能代替 B 的独立期望。额外核对 §S2 的真实健康目标保护链、报价未来时间/请求绑定，以及旧三 profile 完整 bundle/业务导出的基准对照；只报告实际执行过的消费者与浏览器证据。

B 计划路径已有 .m4b-tasks 目录且尚未被中控确认是 Git 工作树，开工必须先清点归属，保留现有内容；不得删目录后重建或猜一个浮动分支。代码仅本地，不因文档远端发布就声称代码可从 GitHub 取得。

## 4. 完成条件与交付

S1～S8 所有适用 required 项有可复查证据，零 skip/fail/timeout；任何缺依赖、P1 矛盾或资源中断均显式阻断，不降低门槛。交付报告包含实际目录/分支、基准与 A SHA、精确改动文件、S1～S8 证据、旧 profile 复用/重跑边界、失败修复、未验项和停止点。完成后仅精确本地提交 §2 三个测试文件，等待中控独立验收。

## 5. 已钉定的执行口径

1. A §3：当前 `CognitionReviewEvaluated` seq 只作为 evaluation context；full review 的 source 对为 null/null，发布本人 review Planned 后才把 lastReviewDecisionId/lastReviewEventSeq 保存为 survival-day ID/该 Planned seq。maintain 指向严格过去的本人 review Planned 对且不覆盖锚点，actor-3 仍用 cognition-day。B 必须包含跨 actor、未来、错事件类型/模式反例，不能混同 kernel 输入和 Planned 锚点。
2. A §3～§4：新 `deriveActorSurvivalSignals` 是唯一食物 urgentNeed 派生处，从本人 Knowledge 私粮<=1纯派生，与原 urgentNeed OR；冻结内核决定 mode。full review 才比较6候选，maintain 为空，不由 planner 伪造 kernel mode。旧 actor/profile signals 不变。
3. A §3/§5：d+4 当日选择/命令之前取消过期旧计划，日终保存 cancelled/DEADLINE_EXPIRED transition，新版本完整重演许可并复算该 reason；同日不能执行旧步骤。secure-food 临时隔离下层健康 Goal，恢复其原 failures；新失败 owner 为 food planId/goalId=null。

这三项是已冻结的必验边界，不是实现已完成的声明。A 未交付时仍按 §1 的依赖门阻断。
