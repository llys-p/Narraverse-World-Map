# D3-5B：可玩遭遇独立验收

任务版本：`d3-playable-encounter-acceptance-v1`。发布日期：2026-10-12（Asia/Shanghai）。唯一公共行为合同为 [D3-5A 可玩遭遇端到端集成](D3-5A-PLAYABLE-ENCOUNTER-TASK.md)，本文件只冻结独立验收的期待、证据规则和白名单，不复制其完整 schema。

## 基准、依赖与等待门

- 共同基准：`D:\Narraverse-World-Map\hds-reservation`，分支 `codex/world-runtime-d3-reservation`，SHA `f335abf30e3eef9d1b40a99a791a6c3c6ae962ab`。
- 共同合同精确发布 SHA 由中控派发消息和 `PROJECT_CONTEXT.md` 提供；开工从该提交钉定读取任务书。A 精确交付 SHA 由中控在收到完整 A 交付后随验收任务给出。未收到前，B 只可在共同基准树的独占测试文件中准备独立期望；真实运行须等待 root 指定的 A SHA。B 不自行 reset、切树或 cherry-pick，以免污染 A。依赖缺失、加载失败、超时和 skip 均为 required gate 非零阻断。
- B 唯一新增文件白名单：
  1. `tests/simulation/encounter-integration-acceptance.test.mjs`
  2. `tests/simulation/encounter-service-acceptance.test.mjs`
  3. `tests/encounter-ui-acceptance.test.mjs`
- B 不改生产代码、A 测试、旧冻结 D3-1～4 与其测试、合同/项目文档、服务配置或旧数据。使用临时服务随机端口和新 TEMP data-dir；浏览器只访问本任务临时实例。不得触碰 M4 体验端口、数据或服务。
- B 执行与证据收集交给性价比 worker；最多两路并行、单文件单写者。A/B 不自己 push/main；root 做最终验收与提交。

## 独立预期来源和复用界限

每个断言须按 A 合同和本文件手算，不读取被测 runtime/service/UI 的输出反抄 expected。可引用 D3-1～4 已验收的纯模块语义，但不能以旧纯模块结果替代世界、service、存档或 UI 的真实消费证明。

M4 提交 `115e256` 的既有 `matched 9/9` 与真实 UI 证据可按原文件/测试未变范围引用为历史事实，不记作本轮新跑。必须新增本轮合法组合链：使用从 `earn-then-buy` 深拷、actor-2 初始 fatigue=700 的真实配置。tick144 Work 后疲劳850；该日结 `resting=false`，不降低疲劳；tick288 urgent Rest 后日结降至650、工资仍20、购粮0、原 food plan step=1；tick432 同计划购买后钱包20→10、工资只支付一次、食物消费1。原 request 的 `expiresTick=200`、食物计划创建于 day1 且 deadline day4，仍让 tick432 合法购买。不得注入伪造 receipt/snapshot；计划、stepIndex、request/deadline 与已有 suspended health 全程逐字段保留，不建 recover-rest，不新增暂停槽或临时 Rest 持久对象。每日最多一动作。旧 Rest 333 未建立 activePlan，不能作组合通过证据。旧候选 `520e838` 的 claim bug 不是本轮目标。

完整源文件/字段/API 的唯一规范见 A §“唯一新 profile 与版本边界”至“原子持久化、恢复与旧 profile”。B 的以下矩阵列出可观察行为及独立交叉点；不得擅自发明 A 未冻结的字段。若真实消费者证明合同形状不足，停止相关门并向 root 回报证据，不能通过静默扩 schema 绕过。

## G1–G8 独立门

### G1：真实世界与同日遭遇

经正式新 profile fixture/CLI 入口创建 forest 玩家和 14 只狼。确认成功 Begin 生成由服务/Runtime 决定的遭遇身份，零耗时却有独立审计 revision；攻击两次各推进 6 tick。以手算结果交叉：玩家初始 health 1000 时，第一次后为 920、狼为 150；第二次后玩家仍为 920、狼为 0，累计经过 12 tick，只记一只战斗死亡。狼击杀回合不反击。其余狼总活数、reserved、battleDeaths 与事件历史一致。

同一 DTO3 必须产生一条新规则专属 `EncounterCommandResolved` 且与 receipt/inputHistory 逐值对应；零耗时领域拒绝也有审计事件但不改 tick。Begin 无 cause；Action/Cancel 的 cause 指向已提交 Begin 及必要的前置日结/终止事实，不得自引用。最终用完整初始 seed/config + DTO3 重放，比较全部 bundle、RNG、事件、receipts、journal 和 reservation。

### G2：边界伤害、逃跑/取消和时钟

以合法初始配置（不可改已通过 validator 的快照字段）构造反击前玩家 health `<=80`，验证第一次 attack 结果为玩家死亡、狼为 150；活动预留只归还一次。flee 固定耗 6 tick 且保留既有生命值/狼伤害；cancel 为零 tick且不回血。对可成功接受的 Begin/cancel 及领域拒绝验证 revision 恰增一次、world tick 不变；重复同 ID 不再次增长。Idle 跳过前后保持 revision-tick offset。ACTIVE 中 AdvanceTime、PlayerTravel、PlayerRest、PlayerBuy、PlayerSell 统一返回领域拒绝 `{code:'ENCOUNTER_BUSY'}`，0 tick、revision 增1、输入进入审计；不暗中推进。

再覆盖入场领域拒绝 `ENCOUNTER_BUSY`、`ENCOUNTER_UNAVAILABLE`、`ENCOUNTER_ID_MISMATCH`、`ENCOUNTER_CLOSED`、当下玩家死亡的 `PLAYER_DEAD` 和 `RULE_REJECTED`：这些 accepted reject 记历史、toRevision 增 1、duration 0。动作 completion 前由真实日结导致玩家死亡的 `PLAYER_DEAD` 已推进 action，按 G4 目标 tick 返回 duration 6、toRevision 增 6，不套用零 tick 规则。malformed/overflow 不生成 receipt。相同 ID canonical DTO 原 receipt 原样复制返回，异 DTO `COMMAND_ID_CONFLICT` 优先 stale；new-ID stale `REVISION_CONFLICT` 不占 ID/预算。

### G3：144 日界和真实当前身体

以新 config 从 `affordable` 派生（actor-4 初始 health=1000、hunger=400，player.initialFood=0，其他经济项不变）作真实跨日 HP 锚点：Travel 到 forest 至 tick12，AdvanceTime 125 至 tick137，Begin 0、attack 6 至 tick143，player 920/wolf 150；第二次 attack target149，tick144 先由真实日结令 hunger=500、无私粮伤害50，当前 player health=870，然后在 tick149 击杀狼且无反击，player仍870/wolf0。核对 actor-2/3 日结一次、available 聚合时 held wolf 排除、全程重放与 save/reopen 一致。配置须通过正常 validator，不能手改 snapshot。

对照同 tick 144 顺序：使用合法初始 health=100、同样无私粮的配置，从 tick132 Begin，首攻完成138后玩家20、狼150；第二攻 target144 时先杀狼并保持玩家20，随后日结饥饿损失50使玩家死于 tick144。狼死亡仍记一次，不能被日结前置死亡分支撤销。另以合法初始配置 health<=80 验证首攻反击杀玩家、狼存活并归还 reservation，不裸改 validator 已通过的 snapshot。

所有跨日时 actor-2/actor-3 与狼的正常日结事件必须出现。狼日结只聚合 available 群体，held wolf 不被出生、捕食或群体死亡流程误改。跨日后从 actor-4 当前 body health 判战；不把 initial health 改写成日结后的当前生命。逐笔手算 `totalLiving = initial + births - naturalDeaths - starvationDeaths - predation - hunted - removed - battleDeaths`，确认 reserved 不进死亡账，战斗死亡只由真实 win 记一次。

### G4：相同 target 顺序、玩家死亡与 completion==144

建立两个最小确定性反例：

- 前置日结死亡：合法配置 actor-4 初始 health=50、hunger=400、player.initialFood=0；Travel 12 tick，AdvanceTime 131 到143，Begin 后 attack target149。tick144 日结饥饿损50杀死玩家，不执行攻击，狼仍300并恰好归还 reservation；遭遇 endTick144、elapsedTicks1，最终世界/receipt tick149、receipt duration6、rejected/PLAYER_DEAD。
- completion==144：合法初始 health=100，从 tick132 Begin、首攻138 后玩家20/狼150；第二攻 target144 先击杀狼，随后日结令 player health=0。`SocietyDaySettled` player opening health=20；receipt 最终 after.health=0，狼死亡仍记一次且不被撤销。两种顺序都需完整重演并绑定对应 cause。

核对所有同 target tick 外部输入先于 beforeSystems/到期日结，不接受 UI 或第二套时钟造序。

### G5：M4 actor-2/3 交叉和旧规则隔离

复用 actor-2 secure-food 计划，触发真实 urgent Rest，确认仍保同 planId、步骤、请求/deadline，暂停期间 health/food 信号未丢；后续实际工资只一次，购粮是真实成功或有权威拒绝原因。确认同一日不超过一动作。actor-3 cognition 按真实日结继续运行。旧 survival profile、旧 schema/DTO、旧 service format 和旧 actor/ecology config 的历史 fixture 继续原行为；新任意 tick death 只由 actor-config-v4 新 profile 接受，旧 validator 不放宽。

### G6：幂等、预算和 save-before-publish 故障

同 ID 同完整输入在 stale/队列满/关闭重开后返回原 receipt 且不再提交；同 ID 异输入冲突优先。新 ID stale revision 不占 ID/预算，预算超限整批无事件/状态部分变化。通过真实 `io.link(EACCES)` 或 `io.writeFile` before-link 注入 durable publication 前故障，逐项确认旧磁盘文件、bundle、RNG、events/receipts、NPC 决策与全部投影仍一致。发布后丢失响应时重开同 ID，返回旧 receipt、恰好一个提交；不能声称已回滚已发布磁盘。

### G7：checkpoint/replay 与 ACTIVE 恢复

在 ACTIVE 中途 checkpoint、关闭并重开，身份、狼、actor 当前 health、reserved 数和已经过的时间保持一致；不能重生遭遇、归还两次或丢失已提交 action。连续运行与保存重开路径比较完整 bundle、事件、inputs/receipts、随机游标和 projections。篡改 input、receipt、reservation、damage、cause 引用、事件、rules/config version 至少各覆盖直接关联审计拒绝；未知/旧不兼容版本明确失败。按共享公共文件影响只扩大直接关联验证，不重跑整套旧 822 项。

### G8：地图→地点→狼交互→回传与断连

使用本次随机端口、新 data-dir 服务和真实浏览器，从 runtime-map 旅行进入 forest，使用“进入森林场景”，查看狼群并发起遭遇，再攻击或逃跑/取消；显示真实 HP、狼账、耗时和终态并返回地图/场景，保存关闭重开后仍同世界。验证 `/api/runtime/encounter` 的 GET 为真实投影、HEAD 同 headers 无 body、只读查询不写历史；旧 profile 对该 endpoint 404。format8 capabilities 增值且旧字段含义保持。不得将 query string 或浏览器本地存档当权威。

确认新页面通过新静态资源 allowlist 和外部 CSS/JS 加载，CSP 不含 inline；`/runtime-encounter.html` 只用于新 profile，UI 没有 WorldRPG/Inv/State 本地权威状态、model 或 bridge 请求。退出地图只导航、不隐式 cancel；active 禁用世界命令且原因可见。刷新/重开可继续 active pending；同 ID 重试只产生一条提交。

验证两 tab 同 revision 的冲突只有一条提交、另一条收到真实 409/current revision；断连后的同 ID 重试得到原 receipt。UI 不得提交 health、damage、winner、狼数或 elapsed ticks；只读查询/结果投影与 service receipt 对齐。

## 证据格式、required gate 与停止

每个 G1–G8 记录：基准/A 精确 SHA、涉及源/测试 SHA、独立手算输入与期望、命令和退出码、实际 TAP 数（零 fail/skip/todo）、HTTP 状态或真实浏览器路径、临时进程 PID/端口/data-dir、复用的历史证据及未验项。测试可用的服务必须是当前 A SHA 的本地代码；截图/旧日志不能代替本轮运行证据。

B 只写上述三份测试。A 未完成或某 required gate 不可运行时用非零结果显式阻断并报告最小缺口；不得删断言、skip、放宽 expected、改写 A 期望、伪造导出或把 pending 写 PASS。B 完成一次完整本合同范围的独立复核后停止，不自行修生产、不进入下一阶段、不 push/main。最终结论由 root 以证据裁定。
