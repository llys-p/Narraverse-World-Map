# M3-4A：认知服务、只读检查器与 M3 体验收口

合同版本：`m3-closeout-contract-v1`。状态：**待派发**；本文件是下一轮 A/B 唯一共同合同，B 只引用本合同并定义独立验收。合同本地发布 SHA：**待中控提交后填写**，不得猜测或用代码 SHA 代替。最多两份任务书，发布不等于开工，完整 M3 仍未验收。

## 给用户看

在开发者检查器看到同一人物真实工作拒绝如何改变下一次选择，以及后续真实工作成功如何让旧失败退出最近四次窗口；另看到低关注人物保持已承诺计划、保存重开后继续执行。检查器只读，世界推进与交易使用已有地图命令或同源测试入口；不会增加模型、心理写入接口或正式平台集成。

## Reference Review

沿用已冻结 M3 的 Goal commitment、认知降频及事实/本人可知分离原则（项目指导书 PAT-004/007/009）；本轮只消费已实现的 Narraverse DTO、服务事务和检查器，不复制外部游戏代码/UI，不新增心理或模型推理。本次依据本地656源码与既有合同审查，未做新联网研究。

## 给 AI 看：基准、执行树与所有权

- 唯一代码基准：`D:\Narraverse-World-Map-m3-cognition-integration @ codex/world-runtime-m3-cognition-integration`，完整 SHA `6562460c2a0610afff6ba49f25524e1ae191b8c5`。
  已包含中控生产修复 `0e58d5b39286f23e87cab2e978f57b683e90902b`；禁止退回原 A `1b117d8e65d4d0e6fadb113d8b625472706750e3` 或以 main/浮动 HEAD 替代。
- 计划执行树：`D:\Narraverse-World-Map-m3-inspector`；分支 `codex/world-runtime-m3-inspector`。发布准备时目录/分支均不存在；收到派发后创建前再次核实目录、分支、Git 状态与归属，不覆盖、重置或挪用已有树。
- 可从精确基准建 worktree 或 independent clone；记录实际方式、HEAD、合同发布 SHA 和文件 owner。基准 `origin` 当前指向本地 `D:\Narraverse-World-Map-m3-cognition-runtime`，不得写成 GitHub 已可达；本轮不 push、不合并 main、不部署。
- 先读执行树 AGENTS/README；同时读控制树 `D:\Narraverse-World-Map-control\PROJECT_CONTEXT.md`、PROJECT_GUIDE 与本合同。运行时分支内状态文档可能保留历史，派发/验收以控制树当前状态和精确合同为准；既有 [M3-3A](M3-3A-COGNITION-RUNTIME-TASK.md) 的核心时序/状态合同和 [M2B](M2B-PLAN-INSPECTOR-TASK.md) 的旧检查器行为继续有效，发生本轮新增接口冲突时以本合同明确条款为准。
- 复杂生产衔接由执行者负责；可拆分测试、长文和机械工作安排 high 子代理，先登记精确文件唯一 owner，禁止多人写同一文件。机械工作按全局性价比规则选模型，不为此增设任务书或新阶段。

## 文件白名单与停止点

允许修改恰好七个既有文件：

1. `runtime/core/motivation-runtime.mjs`：仅新增 `describeCognitionPlayerActions` wrapper 与共享只读描述 helper；
  wrapper 先 `inspectDescriptorTree(bundle)` 再 `auditFor(...,COGNITION_PROFILE)`，旧描述输出不变。
2. `runtime/service/http-contract.mjs`。
3. `runtime/service/service-commit.mjs`。
4. `runtime/service/runtime-owner.mjs`。
5. `runtime-mind.html`。
6. `runtime-mind.mjs`。
7. `runtime-mind.css`。

允许新增恰好五个文件：

1. `runtime/knowledge/cognition-knowledge.mjs`。
2. `runtime/experiments/m3-closeout-scenario.mjs`。
3. `tests/simulation/cognition-knowledge.test.mjs`。
4. `tests/simulation/cognition-service.test.mjs`。
5. `tests/cognition-inspector.test.mjs`。

- 不改 FSM、评分、日结、history、调度和冻结内核；`runtime-server.mjs`、runtime-map 三文件、persistence、其他 core、fixtures、simulation-runner 及其他既有测试冻结。现有 server 可透传 profile/checkpoint 且门控已具备；若有真实缺口先报告调用链，不扩白名单。
- 不改 control 状态/看板、他人建议文件、旧 oracle/expected，不开自由 config HTTP、心理状态命令、experience 服务或 format 7。不接 LLM/Provider/Laya、正式平台、真实旧档、千日/千人性能或下一阶段。
- B 专属返修 `tests/simulation/experience-runner-acceptance.test.mjs` 的 E7 required gate，本路不得触碰；A 交付提交后停止，等待中控/B。

## 共同合同（唯一权威）

### 1. 版本与只读投影

- 只新增 service format **6** 对应 `fixtureId:'cognition-village'`、`fixtureVersion:'1'`、`rulesVersion:'m-cognition-v1'`，经验已在该 profile 内。
  保持 apiVersion 1、command DTO 1/2、snapshot 2、event 1、checkpoint 1 以及 service 1–5 的版本、行为和内部命名空间原状，不迁移旧档。
- 新 knowledge 模块同步导出 `buildCognitionKnowledge(bundle,actorId)`、`projectCognitionInspector(bundle)`、`COGNITION_INSPECTOR_VERSION='cognition-inspector-v1'`、`MAX_COGNITION_INSPECTOR_BYTES=131072`。单人知识沿用 `MAX_COGNITION_KNOWLEDGE_BYTES=16384`。
- 两个入口先对**完整 bundle descriptor tree** 预检（复用现有 `inspectDescriptorTree`），再精确规则/结构验证并 `validateBundle(bundle,{rulesVersion:COGNITION_RULES,systems:cognitionSystems()})`，然后投影/预算，最后 clone。
  不得先读取 discriminator/调用 getter、map、clone 或 canonical。拒绝 accessor/继承数组 getter、稀疏数组、非 JSON、循环与超预算；getter 调用数必须为 0。
- 已验证合法 bundle 的未知 actor 抛 `MIND_UNAVAILABLE`，不得返回另一人、空 mock 或全知输入；所有输出与输入脱离引用，不修改输入。坏规则保留 `UNSUPPORTED_VERSION`，超预算为 `LIMIT_EXCEEDED`，结构/来源错误 fail closed。
- Knowledge 的精确顶层键：`knowledgeVersion,phase,simulationId,actorId,tick,revision,self,quote,observations,belief,profile,duty,planState,experience,useWorkExperience`；
  版本 `cognition-knowledge-v1`、phase `committed`，tick/revision 取当前已提交 snapshot。
- `self/quote/observations/belief/profile/duty/planState` 完整沿用基准 `motivation-knowledge.mjs` 的 committed 投影键与可知语义：本人身体/私账、已公开报价、本人观察及 belief、900/200 等实际 profile、本人 duty/plan；
  死者 currentGoal 为 null，报价来源不得使用死亡后事件。不得把公共现金、他人私账、原始 Work samples 或 cognition 调度元数据塞入 Knowledge。
- `experience` 精确使用 `deriveWorkExperience(本人workExperienceState)` 现有派生 DTO，`useWorkExperience` 取真实 experience config；复用 M3-3 决策知识的经验字段，不复制学习/惩罚算法。
- Inspector 精确顶层 `{apiVersion:1,mindVersion:'cognition-inspector-v1',view:'developer',simulationId,revision,tick,worldFacts:{publicFood,publicHerbs,postedHerbPrice},actors}`；
  actors 恰为 actor-2、actor-3，按此顺序，仅通过 `knowledge.actorId` 标识，不另添 actorId。
- 每 actor 精确 `{knowledge,lastDecision,lastOutcome,counterfactual:null,workExperience:{state,view},cognition:{importancePermille,reviewState,signalBaseline,lastReviewDecisionId,lastReviewEventSeq}}`。state 为本人完整真实 workExperienceState，view 为同一 state 的 derive 结果；importance 来自本人 profile，其余来自本人 cognitionModel。
- `workExperience/cognition/worldFacts` 明确为 Knowledge **外部的 developer 只读对照**，不得透传 planner/signals/角色输入。不重算决定、signals、kernel 或反事实；未发生决定/结果保持 null，counterfactual 恒 null。
  全 Inspector canonical UTF-8 不超过 131072 字节，两人 Knowledge 分别不超过 16384 字节。

### 2. Service6、初始化与事务

- http-contract 为 cognition 注册精确 fixture/runtime/knowledge backend；实际消费 `defaultCognitionVillageConfig/createCognitionVillage/cognitionSystems`、`validateCognitionWorld/executeCognitionPlayerIntent/describeCognitionPlayerActions` 及本合同 Knowledge 导出。无 barrel、mock 或冒充旧 rulesVersion。
- `http-contract.mjs` 同步导出 `loadCognitionBackend()`（async，按既有M2 loader记录方式返回 `{backend,dependencyPending,missingSpecifier,error,errorCode,failure}`）、`cognitionBackendState()`（只读 `{available,dependencyPending,missingSpecifier,error,errorCode}`）、`requireCognitionBackend()`（成功返回 `{fixture,runtime,knowledge}`，有已记录失败则原样抛出；未available则UNSUPPORTED_VERSION）。新知识模块只按本节固定导出定位，不虚构 cognition-runtime.mjs 或 cognition-planner.mjs。
- loader 仅已知**精确目标模块本身**的 `ERR_MODULE_NOT_FOUND` 且 error.url 匹配目标 specifier 可标 dependencyPending；错误导出/常量、语法、传递依赖缺失、初始化异常必须失败并保留原因。所需模块缺失时 service6 创建/恢复失败，旧 profiles 按原路径可用；
  真实集成 gate 必须 available 且零 required skip，不接受 forever pending 的断言。显式checkpoint profile未传时仍须按真实rules加载对应backend，不能只在options.profile指定时加载。
- owner 新 profile 创建与显式 checkpoint 初始化、既有 service6 目录恢复全部验证真实 cognition bundle；journal audit 和 submit 复用同一 `transitionServiceCommand`，严格校验 anchor、每笔 DTO/receipt 和最终 bundle，不靠版本/哈希自证。
- 真实 PlayerDTO 用 cognition rules/systems 验证后，按 format5 既有白名单投影 actor-4/playerModel/actions，actions 由新描述 wrapper 提供；不得调用不支持 cognition 的旧 buildPlayerKnowledge 或篡改规则。
  `playerAvailable/playerActionsAvailable/mindAvailable` 正确反映 service6 能力。
- format6 的 DTO1 和 DTO2 都拒绝七个内部 prefix：`society-day-`、`mind-day-`、`mind-settle-`、`motivation-day-`、`experience-day-`、`cognition-day-`、`cognition-eval-`；旧 format 命名空间不扩张。
- 公共、玩家、mind 三投影从同一候选完整构造/验证，再 durable publish，最后一起 swap；读接口返回 clone。候选或保存失败时三投影、能力、旧 bundle 与磁盘业务文件 bytes 全部保旧；不删除旧文件或先改内存。
- 同 commandId **原完整 DTO** 优先幂等（包括旧 expectedRevision，重开仍如此）；同 ID 异输入与新的 stale revision 409。不能只按 ID 返回而忽略原 DTO，不能先 stale 检查挡住合法重试。
- 用真实文件 IO 注入保存/link 故障：非故障路径必须调用真实 fs 方法，不可 no-op link。核对完整三投影、文件集合/bytes；解除故障后同一命令 retry 一次，仅发布一次，再重开复核。
- 固定配置先在独立 source 临时目录用 `createCognitionVillage` 生成 tick0 bundle，经现有 `saveCheckpoint` 保存；再用新空 runtime 目录和显式 `--checkpoint <文件>` 初始化 owner。source 与运行目录分开，既有目录不得被替换；不新增 server config 入口。

### 3. HTTP 与 UI 消费

- 沿用 `/api/runtime/minds` 与 inspectMind（默认 false）。正常请求门序：Host/Origin → 未开启/无能力 404 → 非 GET/HEAD 405 → query 400；三份检查器静态资源同 gate。GET/HEAD 同状态与响应头，HEAD 正文空，不改变已有 server 安全规则。
- GET 不推进、不写盘、不重评、不重新采样；刷新、actor 切换和两页签零 POST。reload 保持读数；返回 DTO 修改不影响后续 GET。保留迟到 revision 防覆盖与断连最后读数/失败提示。
- 保留 M1/M2 原页面行为、字体/布局/focus；复用 M2 的有限知识、worldFacts、候选 source/provider/eligible/score/selectable、承诺 gate、active/suspended/blocked plan、duty、三层意图、真实 Outcome/failureOwner 展示。
- cognition 展示保存的 reviewState.lastEvaluation.input/decision：importance/relevance、tier/score、mode/shouldReview/reasonCodes、intervalTicks/nextReviewTick；
  显示当前 lastReview anchors 与 lastDecision 的 sourceReview anchors，注明来源与实际 tick。不得由 UI 重算。
- maintain `candidates:[]` 明确显示“沿用承诺，本次未比较候选”；不借 review 的旧候选冒充当次评分。dead/dormant 显示封存旧决定/计划/经验及 DEAD，不展示新的行动或复活。
- 解析 canonical `lastDecision.knowledgeFingerprint` 取得**决定时冻结的** cognition decision Knowledge（phase decision），展示该时刻 experience 摘要，与当前 workExperience.state.samples/view 分开。
  当前样本不可冒充旧决定输入，不能从选择猜 innerStance/成功，也不能用用药成功冒充 Work 学习。
- 经验窗口展示本人最新至多四条 FIFO、sourceEventSeq/tick/actor/decision/command/status；与 view sampleCount/failureCount/penalty/evidenceRefs 一致。NoAction 与权威 rejected 分开，非 Work 不增加样本；
  旧失败退出窗口后仍存在 eventLog。
- counterfactual null 显示“本轮无反事实”，不调用旧 counterfactual planner、不伪造假设分数。人物/配置/原因等全部安全 textContent，不把字符串注入 HTML。

### 4. 固定体验配置与命令 recipe

- `runtime/experiments/m3-closeout-scenario.mjs` 只导出 `createM3CloseoutConfig(kind,useWorkExperience=true)`，kind 仅 `work-learning|continuation`；
  校验 kind/布尔参数，返回 defaultCognitionVillageConfig 的独立深拷贝后作下列固定 patch。不开自由参数、HTTP 注入或自动推进；continuation 使用默认 true，显式 false 应拒绝。
- work-learning 从默认配置仅改 `memory.society.player.initialHerbs=20,initialFood=30`；`memory.society.estates[1].initialFood=100,[2].initialFood=30`；
  `memory.society.actors.market.ecology.resources.resources.herbs.initial=50,gold.initial=350`；`experience.useWorkExperience` 取参数。
- motivation.requests 恰为 12 条（i=0..11）：`requestId=closeout-duty-${i+1},tick=200+144*i,expiresTick=432+144*i,speakerId:'actor-1',listenerId:'actor-2',urgencyPermille:1000`，沿用基准 request 精确结构。seed42、simulationId `m34-experience-closeout`；ON/OFF 仅该 useWorkExperience flag 不同。
- 不改初始身体、工资20、workFood8、workFatigue150、profile900/200、health target800、maxFailures3，不直接写公共金库、替换人物、补样本或事后改状态。gold350 是总初始额，私账300、公金50。
- 每笔使用既有 DTO，读当前 revision 后提交，新 commandId。时间 DTO1 AdvanceTime `{ticks:n}`；交易 DTO2 PlayerSell/PlayerBuy `{product:'herbs',quantity:n}`。命令从地图入口或同源测试 harness 发出，检查器本身仍只 GET。
- 顺序：0→144；`closeout-sell-seven` Sell7 到145；advance143→288；advance144→432；`closeout-buy-four` Buy4 到433；advance143→576；之后每次 advance144 至720、864、1008、1152、1296、1440、1584、1728。
  时间命令 ID 固定 `closeout-advance-<目标tick>`。
- 单路径 **14 笔业务 DTO（12推进+2交易）+初始1=15个service文件**；初始化不算业务命令。ON/OFF 用独立目录与相同输入；保存/GET/reload 不加业务命令，不把内部 NPC 命令计为 service DTO。
- 第2天 actor-2 Work710>Use700 且公金10<工资20，真实 Work 被拒；当前探针 Resolved seq27、四窗 F、penalty100。第3天 ON Work610<Use700 选择 Use，OFF 仍 Work710>700 再拒；用药不改变 Work 窗口。
- Buy4 实际单价25、支付100，公金10→110，仅通过合法交易恢复付款条件。ON 后续本人真实 Work 成功在 tick720/864/1152/1440：窗口 F,S → F,S,S → F,S,S,S → S,S,S,S，penalty100/100/100/0；旧失败仍保留日志。要求四次连续的**工作结果**成功，允许中间 Rest，不要求四个连续日。

- 第11天 tick1584 在归零窗口下 Work730。用固定公式独立核对 `support900-opposition`：strain=`min(1000,fatigue+max(0,700-health))`，opposition=`floor(strain*200/1000)+启用时经验惩罚`；
  不能用 A actualTimeline 回填 expected。
- continuation 从默认仅 patch 本人 actor-2 importancePermille400、`motivation.requests=[]`，其余默认；seed42、simulationId `m34-continuation-closeout`。
  tick144 真 review BuyMedicine → 优雅 close 同目录重开 → advance144 至288 真 maintain UseMedicine。
- continuation 核对 same goal/plan、day1 review anchor、空 candidates、day2 新 commandId/真实 receipt、药-1/健康+100；与不中断相同输入结果一致。该 Use 不计 Work 成功，不能替代上一场景的学习证据。
- 可行性线索为基准树 ignored `artifacts/world-runtime-m34-contract-probes-20261009/experience-scenario/README.md`、`report.json` 及配置/日志：已离线跑 ON/OFF 各12日，**不是本轮 service/browser 证明或未来 B oracle**。
  seq27 等只描述该探针；正式验收按实际 commandId/causation 识别，不锁死全局 eventSeq。

## 实现切片与有界验证

1. 投影切片：实现 cognition knowledge/new tests，核精确键、版本/预算、完整审计、错 actor/错来源、descriptor getter0、输出脱离输入和 dead 语义；完成后再接服务。
2. 服务切片：新增 format6、真实 player actions、profile/checkpoint/reopen/journal、七 prefix×两 DTO、三投影 durable/fault rollback。运行 cognition-service 新测试及直接关联旧 service 回归，不改其断言。
3. UI/固定 demo 切片：实现固定配置 helper、cognition UI 与 cognition-inspector tests；复用现有只读/迟到/断连保护，做针对真实 service6 的 HTTP 与页面烟测。mock UI、真实 HTTP、真实浏览器证据分别列出。

建议分次执行 `node --test tests/simulation/cognition-knowledge.test.mjs`、`node --test tests/simulation/cognition-service.test.mjs`、`node --test tests/cognition-inspector.test.mjs`，补实际受影响的旧 service/Inspector 定向回归；语法检查白名单脚本并 `git diff --check`。不在 A 反复跑全 M3；最终完整 suite 与正式浏览器/两条 recipe 独立验收交 B/中控集中一次。

- 必需反例：完整 descriptor 深处 getter、继承数组 map getter且0调用；知识混入隐藏字段/本人错配；服务6错误/缺失导出和传递依赖异常；未知规则/错误 journal；两版本 reserved IDs；同 ID 改 payload；旧 rev；真实 link/save fault；GET 连读/HEAD/静态门控与输出修改；
  maintain 不造候选/反事实，旧决定经验与当前窗口不同，死亡封存。
- 独立临时 source/runtime/证据目录与 port0 或已核实空闲端口；不启停旧实例或他人进程，只优雅关闭自己 owner，保留失败证据。记录 Node/命令/exit、代码 SHA、配置和有序 DTO、完整三投影/业务文件 bytes 对照、实际 authority chain 与 cleanup。
- A tests 不自产未来 B expected；必需 gate 不得 skip/缩减为计数。若依赖/环境不可用，报告未验和最小缺口，不把 pending/静态检查写成消费链 PASS。

## 交付回执与停止

- 给用户：检查器入口、可看到的工作拒绝/选择变化/失败自然退出窗口、低频续跑与保存重开、已验范围、尚存 bug 和下一步；不堆实现术语，不称完整 M3 已通过。
- 给 AI/中控：精确工作树/分支/代码完整 SHA/合同发布 SHA、文件 owner 和白名单差异、各分次命令/结果及证据目录、真实 HTTP/browser 与 mock 区分、两 recipe 的配置/DTO/authority 对照、dirty/临时目录/进程归属、未验项。
- 精确暂存本路文件并提交 A；交付状态为待验收。停止于本任务，不 push/main/deploy、不更改 board/阶段结论、不新派其他任务；B/中控裁定完整 M3。
