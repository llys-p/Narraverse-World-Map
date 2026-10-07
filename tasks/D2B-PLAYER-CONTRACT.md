# D2B：玩家身份与资产公共合同

2026-10-07（Asia/Shanghai）。用户批准中控与三路子代理并行。共同代码基准0aa76fbc25860b8d072f4b2afec440bdf40b0e42（D2A最终交接）；合同提交后各工作树从同一提交出发。D2B尚未验收，不等于D2旅行交易或阶段D完成。

## 结果与范围

独立新实验profile中有真正玩家，页面可观察其身体、本人库存和钱包，时间命令继续驱动真实生态/经济/NPC与玩家日需求。玩家不借NPC身份或钱包、不自动执行NPC Goal，不加入三NPC agents。没有旅行/主动休整/交易/用药/战斗或真实存档迁移。

## 核心冻结

- rules为d-player-v1，fixture为player-village、fixtureVersion为1；明确新Society/Memory配置版本（society-config-v2、memory-config-v3），旧C4/C5精确合同保留。Actor配置若增加新版本，仅显式注册actor-config-v2，不放宽旧Society/Memory的三人合同。默认参数沿用C5 neutral（三NPC及人格），额外玩家姓名“玩家”、occupation player、actor-4，初始health1000/hunger0/fatigue0；actorModel唯一保存身体/Needs/位置/墓碑。实名4、匿名76、总80、nextEntityId5；玩家来自匿名份额，不增加人口。
- societyModel.agents仍精确actor-1/2/3。playerModel为唯一玩家资产源，与actor-4引用一致，包含显式版本、wallet、inventory和守恒ledger，不重复身体，不增加Goal/Utility/人格字段。新Society配置player记录初始actorId/initialWallet/initialFood/initialHerbs；默认100金币、3粮、1药。初始私粮药真实从公仓扣，同量记resource outflow。world.resources.gold仍是总币量，不能减掉玩家钱后再伪装总量；公共可用金=总币量−所有NPC钱包−玩家钱包（包括死者）。
- 日结玩家被动休息（不属于玩家主动Rest命令），每个存活日最多吃本人私粮1；没私粮就本人饥饿，不拿公粮、不自动用私药或公药，不参与匿名劳动。与三NPC一起传入同一真实Actor管理批次，managedFood/managedInjured/累计privateFoodConsumed包含玩家；死后保留ID/余额/库存/旧历史，不再消费/治疗/休息或获得新观察。
- 工资可执行性、Hunter foreignWallets/foreignFoodUsed、市场reservedGold、公开日账communalGold必须都包含玩家。派生自当前完整所有者，客户端不得提供预算。不能增加skip/trusted开关、临时改总金币绕过校验，不能仅有字段却不穿透真实结算。
- 完整重演包括新配置、原输入序列/回执、RNG、四人注册和份额、玩家账、NPC行动与每日事实/记忆。从规范初始世界推导最终bundle；篡改资产/死亡/人口/回执并重算指纹也不能通过。保留旧NPC私密事实可知边界，新增玩家私账事实与只属于本人的投影；不能因其不在NPC agents而丢掉全部公开观察。

## 三路共同函数边界

核心提供以下路径/导出（不得在服务复制世界规则）：

- runtime/core/player-runtime.mjs：PLAYER_RULES='d-player-v1'、defaultPlayerConfig()、createPlayerWorld(config)、validatePlayerWorld(world)。defaultPlayerConfig返回memory-config-v3配置，含society（v2、原三estates、四initialActors、player初始资产记录）、原discountEnabled与三NPC personalities；可在现有数值保护范围内构造验收配置，未知字段明确拒绝。
- runtime/fixtures/player-village.mjs：playerSystems()、createPlayerVillage(seed=42,simulationId='player-village',config=defaultPlayerConfig()) -> {bundle,systems}；正式core createSimulationSession/validateBundle/存盘仍审核此profile，不能另建跳过规范审计的引擎。
- runtime/knowledge/player-knowledge.mjs：buildPlayerKnowledge(bundle)，先严格审核d-player-v1+player-village，再只返回{simulationId,revision,tick,self:{identity:{actorId,name,occupation,location,simulationLevel,alive,deathTick},health,hunger,fatigue,needs,wallet,inventory}}；deathTick始终字段，活时null。复制隔离，不含任何NPC私账、Goal、人格、原配置、events、RNG或内部路径。HTTP外层添加apiVersion1。不接受可选actorId，不提供冒名知识入口。
- 新核心配置字段或这些函数若必须变更，先由中控更新共同合同通知另外两路；不得自行另造兼容层。新增内部player-state模块可由核心安排。

## 服务与页面冻结

- CLI/library明确profile:'player-village'初始化新目录；默认依旧personality-neutral。--profile与--checkpoint互斥；已有目录禁止显式重新profile、禁止重设seed。读取已有service档从严格审核的版本/anchor识别，不自动迁移；默认只读保持，写须--writable true。
- 玩家serviceFormatVersion2、原C5格式1。顶层仍{serviceFormatVersion,anchor,commands,bundle}，2只配d-player-v1/player-village，1只配c-personality-v1/personality-neutral，混配或未知拒绝。完整journal逐项重演使用正确systems；AdvanceTime DTO/原ID先判/过期revision/回执字段、原子发布、目录/文件/队列预算保持D2A。只读player profile也保存service格式2，不伪装旧checkpoint。
- GET /api/runtime/player仅绑定当前世界唯一玩家，200返回上述白名单加apiVersion1；旧profile返回404 PLAYER_UNAVAILABLE。capabilities增加playerAvailable:boolean。公开snapshot仍仅公开人物身份（新profile四人，匿名76），没有玩家或NPC钱包。读取不推进/写盘，无查询actorId或私密/万能实体接口。
- owner在同一发布点交换公开DTO与玩家DTO。页面请求两份读数后核对simulationId/revision一致；失配最多再读一次，仍不一致保留上一次一致读数并明确错误，不混新世界与旧钱包。旧只读界面不出现玩家占位成功；新界面显示实际自己的状态/物资，时间入口与断连同ID重试保持。不存localStorage世界，不接模型/桥。

## 并行归属与验收

三路任务书D2B1/D2B2/D2B3规定白名单，各自独立Git分支/工作树。同一文件只归一路。共同合同、PROJECT_CONTEXT、README、看板和最终集成只由中控修改。不得改旧测试断言/跳过/删除以过关；不得启停非本次服务。各路只跑定向测试，完整回归统一由中控在集成候选上以--test-concurrency=2执行，避免共享Windows机测试同时争内存。付费模型/Laya/正式平台与真实数据不在授权范围。

必须真实验证：四人注册+76匿名、真实公仓需求76与四私粮一次；玩家无私粮但公仓有粮仍饥饿；最后20公共金币仅一次工资；公共金0时外采不偷玩家钱；NPC真实购买将金币归回公共可用；死亡封存；143+1跨档完整等于144；篡改与坏最新不回退；旧C4/C5/service1兼容；真CLI/浏览器本人DTO与真实bundle一致，双页签/重启原ID仍不重复。mock或三个独立定向绿灯不能代替集成验收。

任务分支精确提交推送后中控集成，不合并runtime main、不部署。若归属/预算/完整重演任一门槛失败，D2B保持待修正，不能提前标D2或D完成。
