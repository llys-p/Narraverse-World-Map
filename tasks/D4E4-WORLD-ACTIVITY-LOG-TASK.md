# D4E4：真实世界活动日志（冻结合同 v1）

2026-10-16（Asia/Shanghai）。用户经总负责人明确授权发布、实现、定向验收与交付，本轮完成后停止；地图贯通和重要人物新行为仅为后续指引。

## 给用户：本轮新增能看见什么

在现有世界地图增加只读「世界活动」列表，可按人物和地点筛选，看见已记录的居民行动/结果、本人命令成功或拒绝、赠粮、日结个人消费与狼鹿群体变化。只翻译真实事实，不新造行为、动物个体、地点或故事。意图与执行结果分开，无已确认结果时不写成已发生。

本轮选择**显式开发者全知世界观察入口**，页面醒目标注「开发者观察，非玩家/角色可知信息」。它不进入NPC知识、不扩张玩家scene投影，不直接导出EventLog、记忆、计划全文、原始回执或完整私账。普通服务默认关闭；只有显式--inspect-activity true才提供API和列表。mind检查器仍关闭。

## 执行位置与写入所有权

- 基准0f4bba27f68a5841ca672288a76512e11ea729b1（runtime生产b7），独立树D:/Narraverse-World-Map-world-activity / codex/world-runtime-world-activity。
- 原18325 PID2592在D:/Narraverse-World-Map-d4-playable运行，视为用户实例；不改、不重启、不迁移其数据。日志候选新Start-D4.cmd固定仅本机18327、本树artifacts/d4-daily/world的新隔离世界；测试另用端口0或18328及独占测试目录。不得复制原8私档或活跃用户存档。
- 中控单写本合同、PROJECT_CONTEXT、PROJECT_GUIDE、看板、最终复核；执行工人单写下列产品/直接测试文件，同文件不并行写。没有活动性能工人；Issue3保持开放但不启动新归因/大规模测量，未达日常流畅的事实保留。
- 实现允许：runtime/service/world-activity.mjs（新增）、runtime/service/runtime-owner.mjs、runtime-server.mjs、runtime-map.html、runtime-map.mjs、runtime-activity.mjs（新增）、必要最少runtime-map.css、Start-D4.cmd、README.md、docs/runtime/D4-EXPERIENCE-ENTRY.md、tests/simulation/world-activity.test.mjs（新增）。不得改core规则、知识/观察器、持久格式/验证/审计/重演或旧测试。

## 来源和语义

1. 唯一权威来源为完整校验后的bundle中已提交EventLog；不得从浏览器pending、当前计划、当前地点或模型补写历史。MotivationDecisionPlanned仅可用于给有causation引用的MotivationDecisionResolved补动作名称，不单独当执行行。
2. NPC：优先MotivationDecisionResolved的真实succeeded/rejected/no-action与delta（成功结果可列真实粮/金币等增减）；NoAction写「未行动」，不能笼统等同等待、休息、死亡。SocietyActionCommitted仅成功动作；与上述resolved共享commandId时只呈现一行。必要的等待结果仅可来自MemoryDaySettled的真实waitingActorId/waitingOutcome，明确「等待结果已送达/未送达」，不能伪称还在等待或计划已执行。无来源不补造等待。
3. 玩家：EncounterCommandResolved内的dto/receipt是命令成功或拒绝的来源，精简白名单摘要；赠粮成功由FoodGiftCommitted展示双方和1粮，跳过同一成功赠粮的重复resolved行，拒绝赠粮仍由resolved呈现。旅行可用真实before/after地点；拒绝动作不渲染成已旅行/交易。
4. 日结：SocietyDaySettled的actor/agent行与PlayerDaySettled列真实消费/生死变化；狼鹿用同一日结内actors.market.ecology（或真实生态结算）群体账，注明「群体统计」，不出现自造狼鹿ID、单只移动或个体捕食。EncounterTerminated可用真实来源说明终止，不编造动机。
5. 位置仅village/forest/null。事实明确location、旅行起止、遭遇事实的森林可标注来源；缺地点则null并显示「地点未知/群体范围未记录」。不能用人物今天的位置冒充历史地点，也不能从种群类型猜发生森林。身份用已有稳定actorId和实际名称，不生成新身份。

## 投影/发布合同

- 新增projectWorldActivity(bundle)：完整沿用runtimeProfile/validateBundle权威校验，限定当前scene profile；每次公开调用仍校验，不增trusted/skip参数。不输出raw payload、observer或完整receipt。
- DTO固定apiVersion:1、activityViewVersion:1、perspective:'developer-world'、simulationId、revision、tick、actors:[{actorId,name}]、window:{maxSourceEvents:256,maxEntries:64,sourceEventsConsidered,truncated}、entries。
- 每条entry字段固定：activityId、sourceEventSeq、sourceItemIndex、tick、actorIds、location、locationEvidence、kind、status、summary。activityId由来源seq+同事件子行索引稳定生成；sourceEventSeq/itemIndex对应真实来源。status仅succeeded/rejected/no-action/settled/waiting-resolved；kind为受支持事实的短枚举。summary为受控中文白名单，不能原样串接不可信HTML。
- 固定最多扫描最近256个真实事件，最多返回最近64行；按sourceEventSeq、sourceItemIndex升序显示，重复读取/恢复同档顺序与ID相同。最多65536 UTF-8字节，沿用LIMIT_EXCEEDED明确失败。截断/未知类型导致无行时明确列表不是全史，筛选只作用最近窗口。
- owner按现有模式派生只读缓存：新活动投影与其他投影在候选完整验证后预生成，只有saveServiceCommit成功后一起发布。getActivity返回脱离内部对象的副本；重复GET/筛选不重演、不推进tick/修订、不写观察/命令/文件。失败持久化时活动列表与旧五投影一起保持旧版本。
- Server新增inspectActivity布尔选项及CLI --inspect-activity true/false，默认false；仅inspectActivity&&sceneAvailable时capabilities额外activityAvailable:true并开放GET/HEAD /api/runtime/activities。未启用/旧profile返回404，不改变旧capabilities形状。写方法405、查询参数400，沿用原同源/预算保护。静态渲染辅助JS可正常服务，不因默认关闭导致地图模块import404。

## 页面与入口

在runtime-map现有入口追加默认hidden活动区，显式说明全知观察、最近窗口/条数和非角色知识。和地图/player/encounter同simulationId/revision/tick才展示本次读数；失败不混合新旧列表，不破坏原动作、pending及幂等逻辑。人物选择包括实际4名重要人物及全部；地点选择全部/村庄/森林/未知；筛选只读本地已获取列表，无分页/复杂搜索/自动播放/动画。用textContent创建文本，空/加载/错误有明确提示。新启动说明写明18327是独立候选，18325原世界仍在运行，不误称它已更新或已迁移。

## 最少定向核对（不扩大）

- 执行者最多一个新测试文件，复用一个短真实fixture/一天结算轨迹：覆盖成功/拒绝/NoAction及日结/群体来源、去重、位置未知、身份与ID/排序稳定、窗口/字节界限、无raw私账/记忆泄漏；既有原理不变的审计/篡改/回滚证据复用。
- 同一个短HTTP/owner链核对默认关闭与显式开启、GET/HEAD只读及方法/查询拒绝、同revision发布、返回副本、一次失败持久化保旧、正常恢复列表一致。不跑全量或无关旧套件；Node进程设硬超时且保存退出证据。
- 中控只复核新增源码及必要最小反例，前述有效同源通过证据复用；页面用真实浏览器DOM/语义操作核验列表与两种筛选及刷新不推进，不截图/录屏/视觉检查，不重跑180tick/H7/128命令/37分钟链。
- Source/指南/原始8档/活跃用户实例保护，测试锁/子进程正常释放；只提交脱敏散列/布尔和必要日志，不上传私档或完整投影。

## 发布与停止

先将合同提交推送、读回并登记看板为已发布；实际工人接单后才标进行中。实现/证据推送后先待验收，按本合同定向核对后决定限定PASS或具体问题；功能、性能、发布/部署状态分别写。记录Reference Review采用本次真实事件/既有只读投影及缓存发布模式，不加依赖或通用日志平台。最多本一份任务书，最终复核报告另记结果。

后续仅在现有指导/状态留简短指引，不开工：②现有村庄/森林贯通地图→地点人物/活动→已有交互→返回同世界；③少数重要人物可追踪工作/休息/取食/地点变化，再评估扩图。本轮不新增这些行为或空间系统，不合main/部署/自动付费调用或调用DSH。
