# D2C：旅行、主动休整与公仓交易公共合同

2026-10-07（Asia/Shanghai）。用户批准继续三路并行。代码基准33e8154a579465e66a31295e1a84eedb6927c980（D2B及四边界修复238/238）；任务书提交后各路同一基准出发。D2C尚未交付/验收，不代表战斗或完整D阶段完成。仅新实验世界，不迁移真实档、不合并Runtime main、不部署/接模型/桥。

## 本项行为

玩家在村庄与森林间真实旅行、主动休整，并在村庄公仓用自己的钱粮药买卖。按钮提交服务权威命令，同一世界统一耗时、真实日结与原ID回执；玩家位置与私账有完整来源可重演，客户端不写世界。不增加战斗、NPC直接对话、地域生产或任意玩家/人物身份选择。

## 冻结核心语义

- 新规则d-player-v2、fixture player-play-village/version1；actor-config-v3、society-config-v3、memory-config-v4、player-state-v2，与旧所有版本精确配对。默认初态沿D2B（玩家100币3粮1药，人口4+76=80，三NPC代理与三人格）。旧d-player-v1/player-village和旧C4/C5/Actor1/2、service1/2严格保留，不能隐式升级或把旧版本放宽支持forest/动作。
- 身体唯一真源仍actorModel。仅actor-4在新profile可为village/forest，其他NPC仍village。日需求lastNeedsTick仍每日边界，动作改变位置/疲劳/needs不冒充一次日需求结算。钱包/粮药唯一源playerModel，新ledger精确记录food/herbs bought/sold/used及spent/earned币量；world.resources.gold仍聚落总币，公共可用=总币−全部NPC钱包−玩家钱包（亡者也扣）。
- Travel：只能village↔forest，目标不能等于当前位置；12ticks（2小时），完成时疲劳+100上限1000，不回血，不随机遇敌，直到完成前身体保持原位置。Rest：6ticks（1小时），完成时疲劳−100下限0，不回血/产粮，不耗药，可在两地执行。Buy/Sell：仅village、公仓food或herbs、整数quantity1..10、耗1tick，整笔成交，无免费/部分成交。
- 买价=完成前当前market posted价；卖价=max(1,floor(posted价/2))。不是客户端报价或开始时锁价，页面说明耗时期间价格可能变化。买入须公仓够货/玩家够钱/私库存成交后≤1000；卖出须私货够、公仓成交后≤配置capacity、当前公共可用金币够付，不偷NPC/亡者钱包。总金币不变；玩家↔公仓货物真实转移，ledger.outflow记录买出、ledger.inflow记录卖回，不倒扣既有outflow/伪造生产或外部金币收入。
- 动作从tick T开始，核心推导startTick=T、targetTick=T+cost。到期tick先执行玩家动作，再沿现有NPC规划/提交→生态经济/人物日结→玩家日事实/观察完成；较早跨过的日结正常执行。tick143买粮→144先买再本人消费；143卖最后粮→144先卖再可能饥饿死亡，成交币封存。143旅行12tick若于144死亡，155完成时拒绝，不改位置/疲劳/币货，但已耗12tick、死亡和拒绝回执仍保存。
- 保留既有每日被动休息（最多减疲劳200）的D2B规则，包括动作耗时跨过的午夜；不新增忙碌/疲劳恢复抑制状态。本轮主动休整另有完成时−100的真实效果，日结恢复另在日账中记录，不能混作主动效果。旅行跨日的最终疲劳可能被日结抵消，测试必须分开核算。无跨日的Travel12→Rest6必须实际100→0。未来改变活动期间被动恢复需另版本合同，不悄悄改变已验收日规则。
- 入场不合法（起点已死、同地点旅行、村外交易、初始资金/库存不足、容量溢出等）明确RULE_REJECTED，不推进/写盘/占ID。开始合法后在耗时期间死亡、价格/资源变化导致完成不合法：保存已推进候选与核心rejected回执，不转移货物/钱，不回滚成免费时间。服务committed仅表示持久提交，动作outcome必须区分succeeded/rejected。
- 玩家动作必须是真实核心输入/回执/成功PlayerActionCommitted事实，含唯一本人ID、动作、登记/完成tick、权威数量/价格及相关前后币货/位置/疲劳。核心输入序号可与NPC内部命令交错，完整审核必须按登记时刻和inputSeq重建队列及日规则/RNG，不能沿用“所有外部命令初始化一次登记”的旧假设。登记时刻/耗时由核心派生，不能让HTTP提供admittedTick/targetTick/actorId/price/budget。
- 旧NPC私密边界保持；新玩家动作私事实只本人获得，拒绝没有成功动作事实。世界观察页面公开公仓/行情仍全局，不代表玩家在森林听到新村内公告。新观察版本memory-observer-v2仅新profile：真实location从初始身份/旅行来源重演；玩家forest期间不获得新MedicalRequest/MedicineOffer或village-market观察，仍保留自己的日事实/动作与旧已知记忆，死亡后封存。旧observer-v1维持原行为，不能只过滤最终DTO却留全知观察账。两地不是NPC活动地理升级，NPC不迁移。

## 三路共同接口

- runtime/core/player-intents.mjs提供PLAY_RULES='d-player-v2'、defaultPlayerPlayConfig()（memory-config-v4）、executePlayerIntent(bundle,{commandId,type,payload}) -> {bundle,durationTicks,outcome,result}，严格只用于新profile。type为PlayerTravel/PlayerRest/PlayerBuy/PlayerSell，payload与下文一致。函数先严格审核bundle/参数、复制隔离、合法入场后在私候选注册真实核心输入并推进规定耗时，完整审核后返回。失败原bundle不动。result是核心自身严格定义/重演的精确动作结果，succeeded含实际相关before/after、start/end、数量价款，rejected为{code:'RULE_REJECTED'}；服务不得复制规则或直接改bundle。
- runtime/fixtures/player-play-village.mjs提供playerPlaySystems()、createPlayerPlayVillage(seed=42,id='player-play-village',config=defaultPlayerPlayConfig()) -> {bundle,systems}。新profile也走公共createSimulationSession/validateBundle/checkpoint严格审核，没有trusted/skip。
- runtime/knowledge/player-knowledge.mjs的buildPlayerKnowledge显式支持新profile，同样固定本人字段，不含NPC私账/原配置/日志。旧Player1结果逐字段不变。
- player-intents.mjs另提供describePlayerActions(bundle)，严格审核新profile返回{travelTicks:12,restTicks:6,tradeTicks:1,maxQuantity:10,locations:['village','forest'],prices:{food:{buy,sell},herbs:{buy,sell}},canTrade:boolean}。由当前正式状态派生，死者/forest canTrade=false。服务对新profile的player DTO增加actions字段，旧profile DTO不增加；不让客户端价格变权威。
- 核心可添加enqueuePlayerAction/纯注册内部helper，但外部参数严格等于上述意图，不接收handler/systems/trusted可选控制。若函数/字段无法按合同实现，先通知中控统一修订再让另外两路消费。

## 服务与页面合同

- 新CLI/library profile:'player-play-village'仅新目录初始化，--profile/--checkpoint互斥、已有目录不重设、默认仍旧C5只读；旧service1/2恢复不迁移。新profile用serviceFormatVersion3、同四字段envelope；只能配PLAY_RULES/new fixture，旧1/2仍原配对。初态/最终bundle及每条DTO/receipt按正确系统与executePlayerIntent全重演。AdvanceTime依旧version1和原六字段回执，不静默加字段。
- 新动作DTO：{version:2,commandId,expectedRevision,type,payload}。Travel payload精确{destination:'village'|'forest'}，Rest精确{}，Buy/Sell精确{product:'food'|'herbs',quantity:1..10}。旧profile接收新动作须明确400 COMMAND_UNSUPPORTED，非法JSON/字段/version/预算仍按现有合同拒绝。新profile仍接受旧AdvanceTime。新action receipt精确{apiVersion:1,receiptVersion:2,commandId,status:'committed',fromRevision,toRevision,tick,type,outcome,result}，outcome/result与核心返回逐字段一致。
- 原ID同完整规范DTO重试先于旧revision校验，返回原持久回执，成功或已耗时rejected都不再推进；同ID不同DTO409。首次过期409并currentRevision。入场RULE_REJECTED映射422，不占ID。队列、JSON4096字节、1440ticks时间预算、64MiB档、128正式档/命令、16排队及崩溃锁/原子发布/两DTO缓存门槛保持。新增HTTP错误不泄漏cause。
- POST仍只有统一/api/runtime/commands，新parser版本精确分派（不要让旧validateTimeCommandDto接受动作）；owner与service journal共享核心executePlayerIntent，保存成功才交换两DTO。中途rule-rejected也保存耗时世界并返回200/committed+outcome rejected，不以HTTP失败诱导客户端换ID重跑。
- 新capabilities明确playerActionsAvailable；旧profile false，动作UI只在新profile显示。页面展示真实地点、公仓和本人库存/钱包、当前权威买卖价格和动作耗时；Travel选择目的地、Rest按钮、Buy/Sell的product/quantity使用键盘可操作表单，提交不带actorId/price/ticks。不能加占位成功按钮或在localStorage保存世界。
- snapshot/player仍同simulationId/revision/tick，失配最多重读一次后保留原一致显示。提交期间不创建第二意图；非JSON明确拒绝（含422）释放意图，不确定502/断连/损坏成功回执保留原ID+原DTO。200必须识别outcome，rejected显示“时间已推进，动作未完成”并重读，不能提示成功旅行/成交；旧AdvanceTime UI与旧profile行为不变。森林物理位置真实显示，地图地理示意不能伪装成野生动物位置。

## 验收与分工

任务书D2C1核心、D2C2服务页面、D2C3独立反例各独立worktree/branch、文件白名单互不重叠。各路只单并发定向测试、精确提交/推送，依赖未到时明确RED，不用mock核心报绿灯。公共文档/状态/看板与最终集成只归中控；完整回归在集成候选统一--test-concurrency=2，真CLI/浏览器消费者不是VM替代。

必须验证：村庄↔森林24tick且无跨日两次疲劳各100；Travel→Rest无跨日100→0/不回血；tick143买粮/卖粮同日消费与死亡；旅行途中先死亡完成拒绝但耗时保存；村外买卖/预算/小数/非法字段拒绝；玩家与NPC最后库存/公共币竞争按顺序仅支付一次；Buy/Sell总币、公私粮药及累计生产/消耗/损耗独立BigInt守恒；service重启原ID成功/已耗时拒绝重试不重复；143+1及动作中间checkpoint完整续跑；改价/数量/start/end/位置/核心与HTTP回执/journal顺序重算指纹仍拒绝；森林新观察权限、旧版本/全部已有门槛、非JSON边界保持。保存失败不公开半状态，坏最新不回退。

D2C全部及真消费者通过后才将D2旅行/休整/交易门槛收口；D3战斗与D4完整场景身份/知识连续仍未完成，不能将D标已验收。
