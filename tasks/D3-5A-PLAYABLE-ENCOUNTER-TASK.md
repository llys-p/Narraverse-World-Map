# D3-5A：可玩遭遇端到端集成

任务版本：`d3-playable-encounter-v1`。发布日期：2026-10-12（Asia/Shanghai）。本任务是 D3-5 唯一公共行为合同；B 独立验收引用本文件，不复制 schema。目标是一轮完整窄场景交付，不是拆成多次阶段发布。

## 给用户看

从 runtime-map 把玩家带到 forest，在地点场景遇到一只狼，选择攻击、逃跑或取消；地图、角色健康、狼数、日结与事件都来自同一个可持续世界。保存、关闭、重开后仍回到同一世界和遭遇结论。仅此一个 forest 窄场景，不承诺全地图遭遇或通用场景框架。

## 坐标、基准和停点

- 唯一施工树：`D:\Narraverse-World-Map\hds-reservation`，分支 `codex/world-runtime-d3-reservation`，本轮共同代码基准 `f335abf30e3eef9d1b40a99a791a6c3c6ae962ab`，含 M4 最终提交 `115e256eec196ffcf73f3e3010da5324ab101439`。
- 共同合同精确发布 SHA 由中控在派发消息和 `PROJECT_CONTEXT.md` 提供。开工时须从该提交钉定读取这两份任务书，不用浮动 HEAD。施工源码基准固定为上列 `f335abf`；A 精确交付 SHA 由中控在实施完成后随 B 验收派发。A/B 共用现有施工树，按文件白名单和单写者顺序协作，不新建或猜测 worktree。
- 本任务只授权指定代码树及临时测试数据。不得访问、启动、停止、改写 M4 体验实例 `127.0.0.1:18324`，不得碰其服务、数据、存档、配置或密钥。新服务只使用随机端口与新 TEMP data-dir，后台进程隐藏运行并由本任务收尾。
- 本项目业务代码/验证不调用付费 LLM、CUDA/Laya 或外部模型；不启停 CUDA/Laya、不安装工具、不迁移真实存档、不接正式平台。包工头的已授权国内 workbuddy/deepseek-v4-pro high 路线按派工授权使用；worker 优先 Global deepseek-v4.1-flash high 免费池。允许查阅任务相关公开 API 并在证据中给 URL。
- 唯一主参考为冻结库快照 `b0b13a3baccf0d26fae167f7827930a1df995876` 中 Bannerlord Campaign Map / PAT-018；公开接口仅核对 [EncounterManager 1.3.4](https://apidoc.bannerlord.com/v/1.3.4/class_tale_worlds_1_1_campaign_system_1_1_encounter_manager.html) 与 [PlayerEncounter 1.3.4](https://apidoc.bannerlord.com/v/1.3.4/class_tale_worlds_1_1_campaign_system_1_1_encounters_1_1_player_encounter.html)。不重研全库，不迁移 Party/商队移动或通用框架。
- A 可在本任务白名单内使用最多两名并行单文件单写者；包工头自行安排核心、外围和独测，核心共享文件顺序单写。UI 仅在 profile/API 冻结后开写。替补须等前一写者明确 finished。包工头国内 workbuddy/deepseek-v4-pro high；worker Global deepseek-v4.1-flash high、免费优先。不得调用旗舰模型写样板，不得因免费路线失败自动改用付费路线。A/B 均不自行 push、合 main 或部署；root 最终验收及提交。

## A 文件白名单与实际入口

A 只改以下明确文件；按阶段顺序单写，不能以“补模块”扩大范围：

- 可作新 profile 版本兼容/领域处理的既有文件：`runtime/core/world-state.mjs`、`runtime/core/mind-runtime.mjs`（仅新 memory-config-v5 兼容）、`command-engine.mjs`、`event-log.mjs`、`data-contract.mjs`、`ecology.mjs`、`market.mjs`、`actors.mjs`、`hunter.mjs`、`society.mjs`、`memory-runtime.mjs`、`memory-observer.mjs`、`motivation-runtime.mjs`、`survival-planner.mjs`、`survival-state.mjs`、`player-state.mjs`；`runtime/persistence/checkpoint-store.mjs` 仅改新 rules 的结构与恢复分派；`runtime/service/http-contract.mjs`（`projectEncounterSnapshot(bundle)` 从此导出，可必要时使用独立 helper）、`service-commit.mjs`、`runtime-owner.mjs`；根 `runtime-server.mjs`、`simulation-runner.mjs`、`runtime-map.html`、`runtime-map.mjs`、`runtime-map.css`、`runtime-mind.mjs`（仅新 profile 投影能力，旧页面行为不变）。
- 新增文件：`runtime/core/encounter-runtime.mjs`、`runtime/fixtures/encounter-survival-village.mjs`、`runtime/knowledge/encounter-knowledge.mjs`（仅确有隔离只读投影依赖时使用，不需要就不新增）、`runtime-encounter.html`、`runtime-encounter.mjs`、`runtime-encounter.css`；新增测试 `tests/simulation/encounter-runtime.test.mjs`、`tests/simulation/encounter-replay.test.mjs`、`tests/simulation/encounter-service.test.mjs`、`tests/encounter-ui.test.mjs`。
- B 独占 `tests/simulation/encounter-integration-acceptance.test.mjs`、`tests/simulation/encounter-service-acceptance.test.mjs`、`tests/encounter-ui-acceptance.test.mjs`。A 不碰这些文件。
- 冻结文件：旧 D3-1～4 的模块和测试、其余旧测试、`runtime/core/rng.mjs`、clock/scheduler/checkpoint 底层、strict JSON helper。不得读取外层 stickman 改动、根 `.env`、model key 或配置秘密。若真实依赖要求额外文件，先交最小引用链/消费者和字段，等中控裁定后再改。

真实服务从项目根启动：`node runtime-server.mjs --profile encounter-survival-village --data-dir artifacts/world-runtime-d35/<newname> --port 18325 --writable true --inspect-mind true`。端口需核空闲；测试实际必须改用 port 0 与 TEMP 独立 data-dir，不触碰 18324。

CLI 参数解析器现有入口仅有 `--fixture`、`--resume`、`--days`、`--seed`、`--out`。冻结新增 `--encounter-inputs <JSON file>`：`--fixture encounter-survival-village` 时 `--days` 允许 0（其他 profile 仍 1..1000）；runner 按 JSON 数组顺序调用完整 DTO3。之后将 `--days * 144` 作为一个合法 DTO3 `AdvanceTime` 提交（days=0 不追加），其 commandId 固定 `runner-advance-<当前revision>`、expectedRevision 为当前值；若同 ID 冲突，整体 runner 失败且不得修改用户 DTO。示例：`node simulation-runner.mjs --fixture encounter-survival-village --seed 42 --days 0 --encounter-inputs <DTO3.json> --out <newdir>`。`--resume <checkpoint file>` 使用真实续跑入口，只消费新续输入，不重放旧 history。非法输入非零退出。运行后检查 `encounter-state.json`、`encounter-inputs.json` 及 summary hashes；恢复后内容一致，不增加 save flag。UI 与 `/api/runtime/encounter` 从同一个临时服务加载。

## 唯一新 profile 与版本边界

- 新 profile：`encounter-survival-village`；新 rules：`d-encounter-survival-v1`；fixture version：`1`。
- 新 snapshot schema 为 3：完整保留 schema 2 原字段，仅增加 `instantCommits`。`revision = tick + instantCommits`，两者均为安全整数，初始 `instantCommits=0`。每个被接受的零耗时命令（含领域拒绝）令 `instantCommits` 和 `revision` 各增 1，`tick` 不变；6 tick 动作和 PlayerIntent/AdvanceTime 推进真实 tick，instantCommits 不变。Idle 跳过必须保留 offset。
- 新 `serviceFormatVersion=8`，只接受 DTO3。checkpoint 外壳仍 `formatVersion=1`、内部 schema 为 3，由 rules validator 严格校验并拒绝跨档；不改旧底层发布文件机制。旧 schema 2、DTO 1/2、service format 1–7 和旧 profile 保持原义。旧 DTO 的 `revision/tick`、旧 profile 行为不得为适配新 profile 放宽。新规则须按 rules history 明确注册；未知 profile/version fail-closed，不静默退回旧规则。
- 五个新配置层分别为 `ecology-config-v2`、`market-config-v2`、`actor-config-v4`、`society-config-v4`、`memory-config-v5`；字段及嵌套值沿用各自上一版，仅 version 更新。Mind、motivation、experience、cognition 上层静态 version 可沿用，不增加无用途字段。`playerModel` 保持 `player-state-v2`。

## 公开 runtime 与 fixture 合同

新增 `runtime/core/encounter-runtime.mjs`，精确公开以下名称：

- `ENCOUNTER_RULES`、`ENCOUNTER_PROFILE`、`encounterRuntimeHooks`
- `executeEncounterIntent(bundle, intent)`
- `describeEncounterActions(bundle)`
- `validateEncounterWorldState(world, snapshotContext)`（避免与旧 `encounter-world` 重名）

`encounterRuntimeHooks` 覆盖 `createWorld`、`beforeSystems`、`afterSystems`、`applyAction`、`settleDay`、`validateHistory` 的既有职责。新 fixture `runtime/fixtures/encounter-survival-village.mjs` 导出 `defaultEncounterVillageConfig(recipe='affordable')`、`encounterSystems()`、`createEncounterVillage(seed=42, simulationId='encounter-survival-village', config?)`。`encounterSystems()` 只注册 `society`、`survival`、`encounter` keys；encounter key 允许领域事实来源注册，不增加每日 system 执行。配置以 survival config 的 memory/mind/motivation/experience/cognition 五层为基底，仅换上述五层 version；固定 recipes 恰为 `affordable`、`earn-then-buy`、`no-opportunity`、`wage-refused`、`no-food`，均可构造，默认仍是 `affordable`，初始有 14 只真实活狼。

新 profile 的唯一遭遇状态为 `world.encounterModel`，恰含 `version='encounter-runtime-v1'`、`nextEncounterId`（初始 1）、`encounter`（null 或最近一场）和 `inputHistory`。`inputHistory` 最多保留 128 个被接受的完整外部输入，含 AdvanceTime、旧玩家动作、Begin、Action、Cancel；每项恰为 `{dto,receipt}`，使用完整 DTO3/receipt3 并用于重演。它不是第二个 bundle，也不维护无限 ID 集。预算复用 `MAX_SERVICE_COMMANDS=128`，允许最多 16 场成功遭遇，`nextEncounterId<=17`；超预算整体拒绝且不占 ID。预算从可重算记录导出。

一场遭遇恰含：`encounterId='encounter-N'`、`actorId='actor-4'`、`location='forest'`、`status`（active/closed）、`resolution`（null/win/lose/flee/cancel/player-died）、`startTick`、`endTick`（null 或终态 tick）、`initialPlayerHealth`（历史锚点）、`wolfHealth`（300/150/0）、`attackCount`（0/1/2）、`elapsedTicks`（active 时为当前 tick-startTick，closed 时为 endTick-startTick，含日结前置死亡的实际停止 tick）、`beginCommandId`、`lastCommandId`、`reserved`。不得另存 `wolfDied`；其值由狼 HP 派生。人物当前 HP 唯一来自权威 actor body，不能把初始 HP 改成当前 HP。

ACTIVE 必须对应存活且位于 forest 的 actor-4、恰一只预留狼和 `ecologyModel.reservedWolves=1`。总活狼存于 `ecologyModel.populations.wolves`；累计 `battleDeaths` 仅存于 `ecologyModel.ledger.wolves.battleDeaths`，不可给其它 species 增加此账。available 为总活狼减预留。终态同一提交归还预留；win 才将一只狼记为战斗死亡，其他终态狼仍活着。closed 后可开始下一场，ID 仅在服务成功 Begin 后递增，旧结局留在 events/inputHistory。完整 validator 和 replay 必须复算所有状态、游标、账本、command/event；DTO validator 不代表真实性。输入 preflight 必须 descriptor-first、getter 调用为零、严格 JSON，接受 null-prototype/冻结输入；输入 UTF-8 预算 4096 字节，整体超限拒绝。

如实现需要本节未列出的新增公开 adapter 字段，先停在冻结审查并向中控提交真实消费者证据；不可自行扩 schema。

新 profile 唯一初始化器以 `defaultSurvivalVillageConfig` 的五个 recipe 深副本为基底，仅替换五个已冻结配置版本并初始化新 `encounterModel`；不得改旧配置参数。`describeEncounterActions(bundle)` 恰返回 `profile`、`rulesVersion`、`beginTicks=0`、`attackTicks=6`、`fleeTicks=6`、`cancelTicks=0`、`canBegin`、`canAct`、`canCancel`、`blockedWorldActions`（类型数组）及 `encounterId`。能力布尔值从真实状态/位置/存活情况派生。

`runtime/service/http-contract.mjs` 导出 `projectEncounterSnapshot(bundle)`，恰返回 `apiVersion=1`、`encounterViewVersion=1`、`simulationId`、`revision`、`tick`、`actorId='actor-4'`、`self={alive,health,location,deathTick}`、`encounter`（当前完整遭遇副本或 null）、`population={totalLivingWolves,availableWolves,reservedWolves,battleDeaths}` 与 `actions`。`validateEncounterWorldState(world,snapshotContext)` 的 context 恰为 `{tick}`，不依赖 handler JSON。返回的 bundle、snapshot、receipt 和嵌套值均不得泄漏可变引用。

## DTO3、receipt3 与事件审计

外部 DTO3 恰为 `{version:3,commandId,expectedRevision,type,payload}`。`serviceFormatVersion=8` 仅接受 DTO3；DTO1/2 在新格式下报 `UNSUPPORTED_VERSION`，旧 profile 的 DTO3 报 `COMMAND_UNSUPPORTED`。支持命令：`AdvanceTime` payload `{ticks}`（正整数 1..144000）、沿用既有真实耗时的 `PlayerTravel {destination}`、`PlayerRest {}`、`PlayerBuy {product,quantity}`、`PlayerSell {product,quantity}`、`EncounterBegin {}`、`EncounterAction {encounterId,action:'attack'|'flee'}`、`EncounterCancel {encounterId}`。

`executeEncounterIntent(bundle,dto)` 接受完整 DTO3 并同步返回 `{bundle,receipt}`。顺序为 4096-byte/完整 shape preflight、profile、同 ID 全 canonical 去重、new ID expectedRevision、128 条输入预算、候选与完整审计、原子发布。相同 ID 异输入 `COMMAND_ID_CONFLICT` 优先 revision；新 ID stale 为 `REVISION_CONFLICT` 且不占 ID/预算；malformed/overflow 抛错且不留 receipt；领域拒绝是已接受命令，进入历史。

receipt3 恰为 `apiVersion=1`、`receiptVersion=3`、`commandId`、`status='committed'`、`fromRevision`、`toRevision`、`fromTick`、`tick`、`durationTicks`、`type`、`outcome`（succeeded/rejected）、`result`。`durationTicks=tick-fromTick`；零耗时 `toRevision=fromRevision+1`，非零 `toRevision=fromRevision+durationTicks`。AdvanceTime 成功的 result 为 null；旧玩家动作继续旧 `PlayerActionResult` 或 `{code}` 拒绝形状。遭遇结果恰含 `actorId='actor-4'`、`encounterId`（null/当前/请求 ID）、`action`（begin/attack/flee/cancel）、`before`、`after`、`reasonCode`；before/after 恰含 `tick,playerHealth,playerAlive,wolfHealth,totalLivingWolves,reservedWolves,availableWolves,battleDeaths,status,resolution`。没有遭遇时 wolfHealth 为 null，状态为 none；reasonCode 成功为 null、领域拒绝为闭集 `RULE_REJECTED,ENCOUNTER_BUSY,ENCOUNTER_UNAVAILABLE,ENCOUNTER_ID_MISMATCH,ENCOUNTER_CLOSED,PLAYER_DEAD`。同 ID 重试返回原 DTO3/receipt3 的复制值。

每条被接受 DTO3 对应一条新规则专属 `EncounterCommandResolved`，包括 AdvanceTime、旧玩家动作及领域拒绝；`sourceSystem='encounter'`、`commandId=dto.commandId`、`entityIds=['actor-4']`、payload 恰为 `{dto,receipt}`，与 inputHistory 对应。Begin 无 cause；Action/Cancel 引用成功 Begin 事实和必要的本次前置日结/终止事实，所有 cause 必须是较早已存在 seq，禁止 self-cycle。玩家/NPC 普通事实照常生成，mind/motivation/experience/cognition 的每 Tick cursors 最终等于 `nextEventSeq-1`。

若动作完成前日结真让玩家死亡，另写一条 `EncounterTerminated`，payload 恰 `encounterId,actorId,reason:'player-died',deathTick,wolfHealth,reservedBefore:1,reservedAfter:0`，cause 精确指向触发死亡的 `SocietyDaySettled` 序号；遭遇 `endTick=deathTick`。无真实死亡不得发。不得把提前终止伪造为攻击或 win。`validateHistory` 必须从相同初始 config/seed 和规范 DTO3 输入完整重放，并比较完整 bundle、RNG、所有事件、receipts、journal、reservation；不能只比 shape/hash。

format 8 新 profile service 的 `GET/HEAD /api/runtime/encounter` 返回只读遭遇投影；旧 profile 对该路由返回 404。format8 capabilities 保留旧字段含义，并新增 `commandDtoVersion:3` 与 `encounterAvailable:true`。同 revision 的 snapshot/player/mind/encounter 四份投影须保存前一起预构造，磁盘成功后一起同步替换；HEAD 复用 GET headers 且无 body。

## 世界、狼账与 actor 规则

`ecologyModel` 沿用旧字段结构，但新 v2 的 `ecologyModel.ledger.wolves` 增加 `battleDeaths`，`ecologyModel` 增加 `reservedWolves`（仅 0/1）。`ecologyModel.populations.wolves` 永远表示总活狼；可用数为总活狼减 `ecologyModel.reservedWolves`。D3-2 frame 不得成为权威 bundle。旧 ecology v1 拒绝新键；不在其它 species ledger 增加 `battleDeaths`。

新账本须恒等于：`ecologyModel.populations.wolves = initial + births - naturalDeaths - starvationDeaths - predation(固定为0) - hunted - removed - ecologyModel.ledger.wolves.battleDeaths`。预留不算死亡；战斗胜利才使狼账 `battleDeaths += 1`、`ecologyModel.populations.wolves -= 1`。不得改 `initialPopulation`，不得把战斗死亡塞进 removed/hunted/predation。

ACTIVE 时日结只对 `wolves - reservedWolves` 的 available 狼运行出生、捕食、自然死亡、饥饿/狩猎及余量计算；reserved 个体不参与这些群体变动。一次日结原子更新群体账、预留和其他实体。新日结 payload 在原 payload 上仅附加恰六字段 `encounterOwnership`：`reservedOpening`、`reservedClosing`、`battleDeathsOpening`、`battleDeathsClosing`、`totalLivingOpening`、`totalLivingClosing`，opening/closing 的普通 wolves 统计含义为可用群体。旧 payload 不扩。

新 actor-config-v4 的 actor-4 可移动并允许任意 tick 死亡；其死亡必须 `health=0`、`alive=false`、`deathTick` 为实际动作完成 tick 或日结 tick、`lastNeedsTick=deathTick`、三项 needs 为 0、actor ledger.deaths 恰加 1。存活伤害仅更新 health/healing needs，`lastNeedsTick` 保持上次日界。仅新 validator 接受 actor-config-v4 任意死亡 tick，并在上层审计 `deathTick<=snapshot.tick`；其他 actors 保持旧 daily/metadata 约束。actor 已死亡后若在名单中须同步 observer 中的 player alive 状态，不伪造日结。旧 D3 模块、旧 actor config 与历史规则不改义。

## 玩家、战斗与世界时间

- Begin 零 tick；attack 和 flee 各推进 6 tick；cancel 推进 0 tick。攻击每次先对狼造成 150；狼存活时才反击玩家 80；击杀回合不反击。狼起始 HP 300。逃跑固定成功，不附加伤害；cancel 不改变双方 HP。两者均不恢复已有伤害。
- 每个实际完成 action 从届时权威 actor-4 health 与持久 wolfHealth 裁决。跨日不能拿初始 HP 代替当前身体。active 中只允许 encounter action、cancel 与只读查询；TimeAdvance、Travel、Trade、Rest 等世界命令明确拒绝且不暗中推进。
- ACTIVE 时普通 `AdvanceTime`、`PlayerTravel`、`PlayerRest`、`PlayerBuy`、`PlayerSell` 一律接受为零 tick 领域拒绝，DTO3 receipt outcome 为 rejected 且 result 恰 `{code:'ENCOUNTER_BUSY'}`；零耗时仍 increment instantCommits/revision 并记录 EncounterCommandResolved。不得走旧 PlayerActionResult 规则返回 `RULE_REJECTED`。成功 AdvanceTime 的 result 仍为 null；旧 DTO1/2 行为不放宽。
- 世界按正常 tick 运行，actor-2/actor-3 的 M4 行为持续。延时 action 跨 tick 144 时照常日结；同一 completion tick 的外部输入先提交，再跑 beforeSystems 和到期日结。
- 若日结在 action completion 前杀死玩家，动作以 `player-died` 终止，不伪造 win/lose；未执行攻击不造成伤害，只要狼仍活着就恰好归还预留。若 completion 恰好在 tick 144，先执行动作，再日结；已经完成的狼击杀不得被前置死亡分支撤销。
- action 在到达自身 completion target 前因真实日结死亡而提前终止时，原 action 仍推进完整预定 6 tick；receipt 为 `rejected/PLAYER_DEAD`，duration 为 6，tick 是原 targetTick，EncounterTerminated 记实际 deathTick。不得把失败回执错误截短到 deathTick 或再执行攻击。
- 零 tick 合法提交或领域拒绝可增长 revision 而不增长 tick。同 ID 同完整输入重试返回原 receipt 且不重复提交；同 ID 异输入冲突优先于 stale revision/预算。新 ID 先校验 expected revision，再检查预算；stale 不占 ID/预算，超限不留下部分事件。

新 profile 的 M4 紧急 Rest 专属语义：已有未过期 secure-food active plan 时，fatigue>=800 触发临时 Rest，decision 的 goalId/planId 均为 null；不建立 recover-rest 替换对象，不新增暂停槽或持久临时对象。food plan 的完整字段、stepIndex、request、deadline 及已有 suspended health 字节级保留。日结照常休息，下一正常日继续同一 food plan，直至完成或按原 deadline 取消。`m-survival-v1` 旧行为不变。

真实可达组合配置从 `earn-then-buy` 深拷，仅将 actor-2 初始 fatigue 设为合法值 700，不新增 recipe 名、不更改默认五个 recipe。由真实 Work 与日结驱动：tick 144 Work 后 fatigue 850；该日结的 `resting=false`，不降低 fatigue；tick 288 urgent Rest 后日结降至 650，仍只领一次工资 20、尚未购粮，原计划 step 仍为 1；tick 432 同计划 BuyFood，钱包 20→10、工资只支付一次、日结食物消费一份。原 request 的 `expiresTick=200` 仍能在 tick 432 买粮，因为食物计划创建于 day 1、deadline 为 day 4 尚未过期。不得注入伪造的已工作 receipt 或 snapshot。

## 原子持久化、恢复与旧 profile

继续使用现有单 owner/command engine 事务和完整候选校验 save-then-swap。投影候选在保存前构建、校验。durable 发布点是 `bounded-json-file` 的 `publishStateFile` 成功通过 `io.link` 发布正式 service-commit 文件。发布前故障用真实 `io.link(EACCES)` 或 `io.writeFile` before-link 注入，必须保留旧 bundle、RNG、事件/receipt、NPC 决策、投影及正式文件；发布后响应丢失视为已提交，按同 ID 重试/重开返回原 receipt，不能声称回滚磁盘。故障只在新 TEMP data-dir 注入，不改底层 publish 文件机制。

ACTIVE 期间关闭/重开须保留 reservation、已经过的真实时间、角色当前状态与狼状态，不重生或重复归还；完整 checkpoint/replay 审计须拒绝 reservation、伤害、来源、input、因果关系或规则版本篡改。未知旧格式清楚拒绝，不迁移旧存档。`service-commit` 新格式/DTO/receipt 版本与静态资源/API 路由必须按文件白名单添加；旧格式1–7、DTO1/2 和旧 profile 的回归不变。

## 一轮内的实现检查点

检查点是同一轮施工顺序，不能单独交付或宣称完整可玩。每个检查点先留下包工头交付物与精确文件 SHA，中控检查方向后在同一合同内继续；这不是新增独立内核任务：

1. **Runtime、世界时间、事件、CLI**：真实 forest 玩家、预留狼、当前身体、命令、事件、tick 与日结在同一新 profile。以 CLI 跑攻击/逃跑、跨日、同 tick 顺序、死亡前后和狼账；不得停在 session 或 DTO 内核。
2. **Service、存档**：同一命令经单 owner service，revision/receipt/checkpoint/replay/save-then-swap 一致。新 TEMP data-dir、新端口，覆盖前置 save fault、同 ID 重试、关闭重开、投影一致、未知格式拒绝和旧 profile 对照。
3. **UI 真实消费者**：runtime-map 在 forest 提供“进入森林场景”；新 `/runtime-encounter.html` 复用窄地点互动和 battle HP/攻击/逃跑/取消/日志/结果视觉结构。地点内可“查看狼群/发起遭遇”，Begin 走合法 API，不扣库存。浏览器只发 DTO/intent/ID/revision；地图、self、遇敌、结果均来自新 service。退出只导航、不 cancel；active 中禁用世界命令并说明原因。刷新/重开读取 active，pending 同 ID 重试不得双推进。服务资源白名单只启用新页面及独立 `runtime-encounter.mjs`/`.css`，CSP 禁 inline；不得加载 WorldRPG/Inv/State 旧私档，也不得调用 model/bridge。

没有跨完 CLI、service/persistence、UI 三个真实消费者链，不能作为交付。A 未完成时标 pending 并如实给出阻塞证据，不伪造导出、不移动期望、不以 skip 通过。用户不得在本任务中接收“内核完成”替代完整窄场景。

## 完成证据与停止

按 B 任务定义的 8 个独立门交付运行证据，并记录基准/A SHA、源和测试 SHA、实际命令/退出码/计数、临时服务 PID/端口/data-dir、浏览器消费路径、历史复用范围、失败与未验项。只改公共时间、确定性重演、schema 等共享底座才扩相关直接回归；同 SHA 未变的历史证据不重复跑，阶段收口只完整运行本合同一次，不重跑旧 822 项全量。

任务限一轮窄场景，短运行遇阻据实交回，不无限重开。所有执行者结束立即停止；不 push、合 main、部署、接正式平台或启动其他阶段。源码 push 未授权；控制文档发布不等于源码发布。

## 2026-10-12 中控范围补充与执行解释（rev2）

本补充不改 d3-playable-encounter-v1 的行为/字段/验收门，只解除真实创建链的一个漏列文件。
- A 既有文件白名单补充 runtime/core/mind-runtime.mjs。仅支持新 memory-config-v5 的 createMindWorld/validateMindWorld 版本兼容，复用既有创建与日结；不得另造简化世界。
- 旧 ACTOR/HUNTER/MIND 等 profile 的顶层 rules/config 匹配保持原样：world-state 原 ACTOR/HUNTER 分支仍要求 actor-config-v1，旧 Mind 仍要求 memory-config-v4；新 v4/v5 数据只走 D3-5 显式分支，不能全局放宽旧 guard。
- 狼账 predation=0 仅针对 wolves，鹿继续旧捕食。新生态日结六个 ownership 字段记录该次聚合输入/输出；身体日结致死后的 EncounterTerminated 归还属于后续事实，不篡改先前日结 payload。
- 新 actor-v4 的 actor-4 deathTick<=真实提交 snapshot.tick 在上层审计，并由完整重演证明。深层可在该专属路径接受 day 内死亡和日界动作先于日结的中间候选；旧版本/其他人物不放宽，不引入另一套时钟。
- 死者 needs 三字段归0，alive 伤害仅同步真实派生需求；死亡 ledger、tombstone、lastNeedsTick 按原合同一次更新。无新增心理字段或复活。
- hooks 须对齐真实现存底座签名与消费链；工人“不得 import/简化 bundle”不是本合同。使用已有 data-contract/descriptor 预检工具和真实 World Bundle，不能把自造 fixture 的绿测当接入完成。
- 首轮简化核心及其30项测试标需修正，只作历史过程证据；完整 CLI/service/UI/B 的 required 门不降低。
本补充精确提交由中控状态和派发消息钉定；B 继续依据公共合同和本解释检验，不得改独立期望凑绿。

## 2026-10-12 中控字段勘误与死亡反例（rev3）

- §3/§6 总活狼的唯一真实路径为 `world.ecologyModel.populations.wolves`；前文描述及公式漏写 populations 已一并勘误。不得添加 ecologyModel.wolves 别名/影子账，字段形状仍按真实 ecology model，仅增加原合同的 reservedWolves 和 wolves.battleDeaths。
- rev2 的死亡裁定须落到实际 validator：新 actor-config-v4 的 actor-4 在 day0、deathTick=6 的深层中间候选不得再被 deathTick<=day*144 误拒；该专属路径可采用下一日界安全上界，顶层仍要求 deathTick<=snapshot.tick，并由完整重演认证来源。旧 v3 同构非日界死亡、其它 NPC 非日界死亡以及顶层未来死亡继续拒绝。
- 中控仅以进程内深层探针核实旧 v3 拒绝符合旧规则、新 v4 同时拒绝违背本合同；这不是合法命令链或 A/B 验收通过。完整消费者须在真实 fixture 到位后补证。
- 预留狼日结探针已核实 reserved=1、totalLiving=1 的个体不参与当日自然死亡/饥饿，battleDeaths 保持0；不据此代替真实战斗/完整日结验收。
- 本勘误不增模型字段或白名单、不改变耗时与旧规则，不允许移动独立期望凑绿。中控源码未改；包工头等旧写者结束后在原授权内安排精准修正。
