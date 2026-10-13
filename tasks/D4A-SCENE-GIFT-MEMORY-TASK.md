# D4A：村庄赠粮与本人记忆连续

合同：`d4-scene-continuity-v1`。编写日期：2026-10-13（Asia/Shanghai）。配套：[D4B 独立验收](D4B-SCENE-CONTINUITY-ACCEPTANCE-TASK.md)。
状态：已发布、待派发；发布不代表开工或验收。共同发布 SHA 是首次同时引入本 A/B 文件的控制提交，由中控回执及看板给出；开工以 `git show <发布SHA>:tasks/D4A-SCENE-GIFT-MEMORY-TASK.md` 钉定读取，不猜自引用 SHA。

## 给用户看

本轮做一条完整窄路线：在村庄给猎人一份自己的粮，他立即留下真实收粮记忆；去森林完成既有遭遇后回来，刷新或关闭重开仍是同一人物、同一世界。人物看得到同地点的公开身份和可观察状态；受粮事实属于本人经历。赠粮不增加信任、情绪或模型判断，既有计划如何继续由原规则决定。本轮不做通用送礼、自由对话、第三人目击传播或正式平台接入。

## 1. 给执行者：坐标与工作方式

- 唯一代码基准：`D:\Narraverse-World-Map\hds-reservation` @ `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`，已获 D3-5 G1–G8 限定 PASS。该 SHA 仅本地可用，不能声称 GitHub 可达；不得从 main 或任意最新树取 runtime。
- 建议执行树：`D:\Narraverse-World-Map-d4-scene`；分支 `codex/world-runtime-d4-scene`。创建前检查路径存在、分支占用、Git common dir 和基准可达；已有树先核所有权，不覆盖/重置。返回 `{bundle,systems}` 的 fixture 不能当作 bundle 直接传入。
- 中控负责合同、风险和最终验收；施工负责人负责内部短工单。最多两名同时写入，共享 core/资产/记忆链始终单写入者；测试可先准备独立期望，页面接替已结束的写入者。
- 长文本、机械编辑、定向测试优先获准的免费路由或经济型子代理；限流要报告，不自动用付费模型/Astra。子代理自报须核磁盘和实际日志。
- 每张内部工单明确当轮至多 3–5 个写文件、一个停止断言和交接坐标；合同白名单不是一次把全部文件交给一名工人。15 分钟无 diff 或连续两轮重复阅读时报告具体阻碍并缩小工单，不设长阻塞睡眠或反复重启分析。
- 完成本地精确提交和证据后停止。**不 push、不合 main、不部署、不迁移旧档、不启停 18324 或其它用户实例**。发现不合理规则提交最小反例给中控裁定，不自行放宽期望。

## 2. 版本与唯一状态

新 profile `scene-survival-village`，rules `d-scene-survival-v1`，fixtureVersion `1`，serviceFormatVersion `9`。沿用 schema3、`revision=tick+instantCommits`、DTO3、receipt3、checkpoint 外壳 formatVersion1；未知/跨档版本显式拒绝。旧 profile、format1–8、配置及字段形状保持原义，无自动迁移。
新配置只升级 `memory-config-v6` → `society-config-v5`；嵌套仍 `actor-config-v4 / market-config-v2 / ecology-config-v2`，参数和嵌套值沿用 D3-5。玩家态 `player-state-v3`，observer `memory-observer-v3`；其余心智/经验/认知模型不增加无消费者字段。
沿用唯一 `world.encounterModel`，新 profile 版本 `encounter-runtime-v2`；字段仍为 `version,nextEncounterId,encounter,inputHistory`。一份 inputHistory 同时记所有被接受的外部命令，最多 128 项 `{dto,receipt}`，成功遭遇最多 16 场。无 sceneModel、第二世界或独立赠粮 journal。
新规则复用现有遭遇/生存规则并显式分派校验。可抽窄共享 helper；不得复制整套遭遇引擎，也不得把新 snapshot/rules/config 临时改成旧版本以绕过 validator/replay。创建、推进、日结、死亡、保存和所有投影均校验真实新版本。

## 3. 必要公开接口

- `runtime/core/scene-runtime.mjs`：`SCENE_RULES`、`SCENE_PROFILE`、`sceneRuntimeHooks`（既有 createWorld/beforeSystems/afterSystems/applyAction/settleDay/validateHistory 职责）、`executeSceneIntent(bundle,dto)`、`validateSceneWorldState(world,{tick})`。
- `runtime/fixtures/scene-survival-village.mjs`：`defaultSceneVillageConfig(recipe='no-opportunity')`、`sceneSystems()`、`createSceneVillage(seed=42,simulationId='scene-survival-village',config?)`，返回 `{bundle,systems}`。五个 recipe 沿用 D3-5 参数，仅换上述版本；默认 no-opportunity。systems keys 为 society/survival/encounter/scene；scene 仅注册事实来源，不增加周期行动。
- `runtime/service/http-contract.mjs`：新增 `validateSceneCommandDto(dto)`、`parseSceneCommandBytes(bytes)`、`projectSceneSnapshot(bundle)`。format9 专用 parser 复用严格 JSON、旧合法 DTO3 命令校验和 4096 UTF-8 字节预算，仅新增本合同赠粮。旧 parser 的 DTO3 未知 type 仍按基准 `INVALID_INPUT`，不能全局放行 Gift；format9 非 DTO3 报 `UNSUPPORTED_VERSION`。
- `runtime/knowledge/scene-knowledge.mjs`：`projectSceneKnowledge(bundle,actorId)`；从真实 snapshot 和持久 observer 过滤本人可知信息，先 descriptor-first 审计再读取/复制，getter 调用为零。
返回值与嵌套值不可泄漏可变引用。旧公开函数不得改签名或输出形状。必要新增内部 helper 无需新增业务字段；白名单缺口先报告。

## 4. 赠粮意图、时钟与回执

DTO3 恰 `{version:3,commandId,expectedRevision,type:'PlayerGiftFood',payload:{recipientId:'actor-2'}}`。固定 actor-4 向 actor-2 赠 food1；客户端不能指定 quantity、库存、health、记忆、关系或成功结果。ID、内部保留前缀和 JSON 校验沿用 D3-5；未知接收者/多字段/坏类型为 `INVALID_INPUT`，不占 ID/revision。
同 ID 原完整 canonical DTO（包括原 expectedRevision）先于 stale、历史预算和 pending 队列满返回原 receipt；异 DTO 同 ID 为 `COMMAND_ID_CONFLICT`，新 ID 过期为 `REVISION_CONFLICT`，二者 HTTP409。queue16、journal128、format9 正式 service 文件129（含r0），旧 cap128 不扩张。溢出/预算整体拒绝无部分更新。
合法新请求按顺序判：`PLAYER_DEAD` → `ENCOUNTER_BUSY` → `RECIPIENT_DEAD` → `NOT_COLOCATED`（双方必须 village）→ `NO_FOOD` → `RECIPIENT_FULL`（接收库存上限1000）。失败是已接受领域拒绝：零 tick、instantCommits/revision 各+1，receipt outcome rejected；无赠粮事实、无受粮记忆、无库存/信任/失败行动账变化。
成功也是零 tick、instantCommits/revision 各+1。不给赠粮额外 RNG、日结、NPC动作或计划完成；与时间推进共用单写者事务。页面查看/切换/刷新为纯读取。
receipt 沿用原12字段：`apiVersion,receiptVersion,commandId,status,fromRevision,toRevision,fromTick,tick,durationTicks,type,outcome,result`；apiVersion1/receiptVersion3/status committed。
Gift result 恰 `{donorId:'actor-4',recipientId:'actor-2',product:'food',quantity:1,sourceEventSeq,reasonCode}`；成功 sourceEventSeq 是赠粮事实 seq、reasonCode null；拒绝 sourceEventSeq null、reasonCode 为上述拒绝码。不透传接收者余额/私粮等原始 before/after。

## 5. 双边来源账与事件

玩家 inventory.food 减1，`playerModel.ledger.foodGiven` 加1（新v3才有）；actor-2 inventory.food 加1，`societyModel.agents[*].trade.foodReceived` 加1（新v5每个agent均有，非actor2固定0）。所有新增量初始0、安全整数、容量校验，原初始配置和 configFingerprint 不变。
玩家 food 恒等式：initialFood + foodBought − foodSold − foodUsed − foodGiven；接收者恒等式：initialFood + foodBought + hunts×huntFood + foodReceived − foodUsed。society 总 foodReceived == player.foodGiven；赠粮增量双方私粮净变0、公共库存与原 outflow/inflow账0、现金/药/他人账0。
Hunter 原 config/ledger 不增字段；新society-v5传明确 `society-ownership-v2` 上下文（原 ownership 六字段再加 `version,foodReceived`），验证转入而不把它算第二次公仓 outflow。旧上下文字段集严格不变。society agent.trade 新字段、player日结ledger、ownership派生与深校验均按新版本配对，不能靠临时改 initialFood 或库存旁账凑守恒。
成功新增 `FoodGiftCommitted`：sourceSystem scene、commandId为输入ID、entityIds `['actor-4','actor-2']`、causationEventSeqs空；payload 恰 `donorId,recipientId,product,quantity,location,donorFoodBefore,donorFoodAfter,recipientFoodBefore,recipientFoodAfter`，固定food1/village，完整 before/after 对真实资产。
每个 accepted 命令仍恰一个 `EncounterCommandResolved`（沿用source encounter/entityIds actor4/payload `{dto,receipt}`）；Gift成功 cause恰引用上述赠粮事实，失败cause空。原命令因果保持D3-5原义。inputHistory/sourceEventSeq/真实转移事实/receipt严格一对一，由完整重演重建；source存在或结构合法都不足以证明真实。失败不得制造 FoodGiftCommitted。

## 6. 即时本人记忆与局部可见性

Gift成功同一候选内先形成真实事实，再由 observer-v3 即时消费（无需等日结）；donor、recipient各一条本人记忆，其他NPC零条。沿用原entry字段/确定性memoryId、32条留存及排序，observedTick=occurrenceTick；channel self、importance1，observable恰 `{type:'food-gift',donorId,recipientId,product:'food',quantity:1,direction:'given'|'received',commandId}`。不放入对方私账或raw receipt。
Gift不改变关系；旧medicine-trade在旧/新profile仍按原规则trust+10，新分派不把所有互动当交易。所有 observer/mind/motivation/experience/cognition游标及身份与提交事实一致；完整replay从相同输入和观察时点重建记忆/留存/账/事件/回执。不改旧样本、过去决定、Goal/Plan字段或认知评审结果；后续周期规则正常消费状态，不能绕过原健康/承诺保护。
`projectSceneKnowledge` 恰 `{knowledgeVersion:'scene-knowledge-v1',simulationId,revision,tick,actorId,self,visibleActors,giftMemories}`；self 为本人 `{name,occupation,location,alive,condition}`；visibleActors 为同地点其他人的 `{actorId,name,occupation,location,alive,condition}`，按actorId码元序。condition：health1000为healthy、0<health<1000为wounded、死亡为dead。giftMemories只含本人observer持久的food-gift entries。不暴露他人精确health/库存/钱包/评分/计划；该新场景知识不默认接旧NPC规划器。死亡本人可读封存，未知actor拒绝。
`projectSceneSnapshot` 恰 `{apiVersion:1,sceneViewVersion:1,simulationId,revision,tick,location,self,actors}`；self `{actorId:'actor-4',alive,food}`；actors 为玩家在village时同地点NPC，否则空，每项上述公开六字段再加 `receivedGifts,gift`。receivedGifts只取该NPC本人持久记忆中donor4/direction received条目，用于本人表达；gift `{available,reasonCode}`按第4节规则派生。墓碑保留同一ID/死前历史，不复活；无第三人目击/传闻。两投影均限65536 UTF-8字节，读取不写观察事件。

## 7. 服务、CLI 与真实页面

format9注册新fixture/rules，owner新增 `sceneAvailable/getScene()`；capabilities只追加 `sceneAvailable:true`，原DTO3/encounterAvailable字段沿用，不发明别的cap字段。`GET/HEAD /api/runtime/scene` 与新runtime-village三静态资源仅该profile可用；旧profile404。门序能力404→方法405→query400，HEAD同头无正文；只读owner的写入口405。
候选中构建 snapshot/player/minds/encounter/scene 五投影，完整保存成功后同步swap；`/api/runtime/minds`为既有复数路径。真实 `io.link` EACCES 失败后五投影、完整旧bundle/RNG/日结/正式文件不变，同原DTO重试一次落地，重开一致。读取零磁盘写入；CLI/checkpoint与profile初始化互斥及已有目录防重置沿用原合同。
simulation-runner注册新fixture（默认no-opportunity，不新增recipe CLI参数）；保留原遭遇业务导出集合，只额外 `scene-view.json`（投影canonical JSON），summary加 `sceneHash=sha256(canonicalJson(sceneView))`。不导出第二权威scene-state。resume仅 `--resume <checkpoint> --days 0 --out <新目录>`，不混fixture/seed；完整 snapshot/eventLog 和业务字节比对，summary只明确列出非业务运行量及startTick差异，不任意忽略新字段。
新增 `runtime-village.html/.mjs/.css`，地图提供真实村庄入口；forest继续原遭遇入口。显示同地点人物、赠1粮、真实回执和本人收粮记忆；全部动态文本用textContent，按钮能力以权威投影为准。默认人在村庄时入口是read，不伪造Travel；从forest返村用真实12tick Travel。
页面按simulationId/revision/tick对齐读数，迟到低revision不覆盖；断连/非JSON保留同canonical DTO待重试，刷新可恢复同一pending，409刷新状态不自动生成新赠粮意图。导航/刷新/关闭标签页本身不赠粮、不cancel遭遇、不推进世界。
浏览器标签页可硬关闭后返回；服务重开用真实graceful quit/close并核stopped/exit/lockgone/portclosed。本轮不增加OS硬杀服务的残锁接管，也不删锁伪造自动恢复。测试用新TEMP目录、port0和隔离Edge，退出清理本轮PID，不碰用户浏览器/18324。

## 8. 手算与内部检查点

no-opportunity原参数：玩家20、hunter0/hunger200/wallet0；公共粮分配后540。赠后瞬时19/1，公仓/钱包不变；推进到tick144，hunter吃1→库存0/hunger100，玩家也吃1→18；对照无赠hunter hunger300、player19，两边工资/Work经验0，公共粮同为464（匿名人口消费76）。这是按基准日结的手算/内存配方算术核对，D4真实Gift仍须实跑，不能拿改起始分配冒充赠粮链。
从赠粮后的同一世界advance144→Travel forest12→Begin0→attack6→attack6 win→Travel village12：终tick180，活狼14→13，玩家战斗counter伤80（身体以实际日结后值为锚），仍同actor2/同gift来源。赠粮/Begin各零tick增加revision，其他动作照既有耗时；保存重开不增加业务事实。
- CP1：新版本空世界可创建/完整校验且旧档拒串型；随后真实gift双边账+即时observer+完整replay及最小拒绝反例。初始版本接入和转移实现分成内部短工单。
- CP2：format9真实HTTP、故障回滚、原DTO重试、checkpoint/CLI及旧profile字节兼容；冻结核心接口后页面工人接替，不并写共享core。
- CP3：真实浏览器村庄→森林→返回/刷新/重开和双页签；给出精确A SHA及证据，B才正式接入。
不靠测试数量增加范围；同提交已过且直接依赖未变的成员复用。公共重演/存档分派改动需覆盖完整直接影响路径；旧822项/长程100/500/1000天不默认重跑。

## 9. 文件范围与交付停止点

新增允许：`runtime/core/scene-runtime.mjs`、`runtime/knowledge/scene-knowledge.mjs`、`runtime/fixtures/scene-survival-village.mjs`；`runtime-village.html/.mjs/.css`；A测试 `tests/simulation/scene-gift-runtime.test.mjs`、`tests/simulation/scene-gift-service.test.mjs`、`tests/simulation/scene-gift-runner.test.mjs`、`tests/scene-village-ui.test.mjs`。
允许窄改 core：hunter、society、player-state、memory-runtime、memory-observer、encounter-runtime、world-state、command-engine、event-log、motivation-runtime、experience-state、cognition-state、survival-state；knowledge：encounter-knowledge、player-knowledge；service：http-contract、service-commit、runtime-owner；根：runtime-server、simulation-runner、runtime-map三件、runtime-encounter.mjs。只做新版本必需分派/校验/消费者，不重构全模块。某文件无需改就不改，不声称恰N文件。
禁止改旧fixture/旧测试/B文件、data-contract/rng/clock/scheduler、work-experience/cognitive-review冻结内核、旧scene.html、公共仓底层与正式平台/旧存档/用户配置；不新增依赖或模型桥。需要额外文件先报告最小缺口，中控可修订合同并保留理由。
交付给用户：真实功能/尚存bug/未验范围。交付给中控：目录分支、基准/精确本地SHA、未提交改动及归属、精确文件/API、每门命令/exit/count/源码指纹、原RED与修复、消费者截图/HTTP/故障证据、PID端口退出证据。精确commit字节对应被测字节；artifacts原件保留，不能只给摘要。提交后停止等B/中控，不自行push或开展下一阶段。