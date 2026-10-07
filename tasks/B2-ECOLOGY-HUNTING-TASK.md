# B2：鹿狼生态与聚合捕猎

2026-10-07（Asia/Shanghai）。本对话自行实施，基准B1 `f3aff786fae405f1b9196307a1110a0ccba88f84`，源码 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-b2`。不合并main、不接页面/AI/旧存档。B1旧fixture和规则继续通过原门槛。

## 规则冻结

新规则 `b-ecology-v1`、fixture `ecology-village` v1与 `ecology-deer-shock` v1，配置 `ecology-config-v1`。复用B1配置/资源账，增加持久种群、伤者、生态累计账与有理数余量。每日tick144一次，只有daily-ecology任务；人口固定80，无实名NPC或人口生死。

- 默认鹿120、狼14、鹿容量240。鹿日出生率20/1000，乘剩余容量比例（固定分母capacity×1000）；自然死亡2/1000；狼日需鹿1/10只，有持久需求余量，实际捕食不超过鹿存量。零种群出生为零，不补种群。
- 狼食物压力 `floor(未满足捕食需求×1000/max(1,需求))`；实际需求为0时压力0。狼出生5/1000乘满足率，自然死亡3/1000，额外饥饿死亡30/1000乘压力；出生/饥饿死亡固定分母1000000，余量持久。所有死亡/捕食/捕猎依次受当前存量约束。
- 顺序：鹿出生/自然死亡→捕食与压力→狼出生/自然/饥饿死亡→聚合捕猎→资源生产、农田损失、消费与治疗。饥饿狼数 `min(死亡/捕猎后存活狼, ceil(当日捕食前狼数×压力/1000))`，每只请求破坏4份粮，实际农田损失受生产和流入后的库存限制，计入资源loss并单独记录。不得按日期写死饥饿或损失。
- 粮食低于人口5日口粮或狼有压力时触发捕猎；猎人数不超过8与未受伤可用劳动力。缺粮时目标鹿，否则目标狼；每4猎人最多猎1只，受猎物数量限制，每只鹿产20份粮（production入账），狼没有物资收益。农田工人60、采药者4优先按剩余健康人口配置，猎人占用剩余人口，不能重复分配劳动力。
- 每天固定抽1个mulberry32样本用于猎人受伤的随机舍入：风险 `100 + floor(压力×400/1000)` /1000，期望伤数=猎人数×风险/1000；下取整加一个按样本决定的余数伤者，限制在本次猎人数。猎人无死亡模型。已有伤者+新伤者产生药材需求，每实际消耗1治疗单位恢复1人（默认药需求1/人/日）；没有药不得自动恢复。伤者不作为生产者/猎人；粮食缺口逐日记录，不实现人死亡。
- Commands新增 `RemovePopulation {species: deer|wolves, amount: 正整数}`，目标tick前先执行；超过存量整条RULE_REJECTED，无事实/无部分删除。成功PopulationRemoved事实与回执记录before/after/amount，按ID去重。仅生态规则可用，禁跨单位转账。扰动fixture唯一差异为tick1440（第10天结算前）命令移除90鹿；基线不含该命令。命令本身不预写任何后续行为。
- 日事实 `EcologyDaySettled` 包含开/结种群、各项出生/死亡/捕食/捕猎、压力、农田损失、劳动力/伤病/治疗、样本及资源日账。系统日事件引用已发生PopulationRemoved事实作为causation，未发生/无关引用拒绝。保存恢复从初始配置+成功/拒绝命令按inputSeq与每日规则重放，核对事实、资源账、种群账、余量和RNG状态，配置不能被系统改写。
- 保护预算：种群/人口/容量≤1000000，生态结算≤10000天，配置flows≤1000，命令沿用A2队列上限；整数中间值用BigInt，不支持非有限数、稀疏/异类记录或溢出。

## 验收与边界

TDD：真实种群收支、零/低存量、饥饿死亡/捕食/捕猎不超存量、农田和粮账、无药不恢复、劳动力互斥、seed/恢复决定随机结果；移除鹿命令成功/拒绝/幂等，基线与扰动同seed对照出现压力→农田损失→捕猎/伤病→药需求的规则链；失败整tick回退。恶意事件/种群/配置/余量/RNG/命令回执拒绝。真实CLI导出ecology-config.json、population.csv、ecology.csv及economy.csv；磁盘续跑完整状态/事件一致；原70项回归。

B2只验证局部因果链及存档正确性，B3价格/付费延迟贸易、B4多seed100/500/1000天平衡门槛后续实施。每tick历史重算性能问题保持公开记录，不以跳过坏档/篡改验证掩盖；若本轮需优化先单独反例与合同，不悄悄降低校验。

## 实施与验收收口：PASS

2026-10-07（Asia/Shanghai）。本对话自行实施及复核，未派外部执行者。基准B1 f3aff78，实现 `dc2d7d79cc3263618b8bd25e11cbf6b1cc64509c`，源码D:\Narraverse-World-Map-a2 @ codex/world-runtime-b2。新增core/ecology.mjs、fixtures/ecology-village.mjs、两份生态测试；扩展现有命令/世界/事件的显式生态规则合同和runner CSV导出。A1/磁盘checkpoint实现未改；B1 settleResourceDay增加精确的当日劳动力/捕猎粮食/农田损失参数，原默认行为与旧fixture全部回归。

接口：defaultEcologyConfig/createEcologyWorld/validateEcologyWorld/settleEcologyDay(world,sample)/removePopulation(world,payload)/validateEcologyPayload/validateEcologyHistory/ecologyCauses；ECOLOGY_RULES、MAX_POPULATION。fixture：createEcologyVillage与createDeerShock。日规则纯函数不读墙钟/网络，sample只能来自可恢复RNG；command-engine负责原子提交、去重和因果序号。

TDD：新核心先ERR_MODULE_NOT_FOUND；CLI先Unknown fixture失败。额外反例暴露死亡后的狼仍造成56粮食农田损失，修为存活数上限后归零。真实系统同tick命令→每日结算、失败回退、跨档命令、治疗/劳动力、零库存/灭绝、非法配置、种群/资源/事件/样本/RNG/余量/回执/因果篡改均通过。恢复按初始配置+已处理命令+每日规则重放，拒绝有合法字段但规则结果不同的档。

Node v24.14.0，干净dc2d7d7全部simulation+export-boundaries共79/79（原70+新增9），约127秒，diff通过。测试真实磁盘3天=1天存档+2天恢复，含tick145未来干预及伤病/RNG/回执/因果恢复；坏RNG档明确拒绝。真实CLI和旧A/B1格式/故障/不覆盖回归通过。

干净新消费者CLI ecology-deer-shock seed1连续12天 vs 8天checkpoint+4天恢复，完整snapshot/EventLog、stateHash/eventHash、population/ecology/economy三CSV一致。与baseline12前9天事实完全一致；tick1440命令移除90鹿一次，后续事实引用真实移除事件。最终tick1728、13事实；12天约31秒（同期全回归），内存仅末尾采样，未测峰值。

另60天配对每日业务规则实验（非CLI、非B4长程验收）同配置/seed1，在第10天仅移除90鹿，第32天开始出现额外狼食物压力；基线农田损失/新伤者/药实际消耗为0/0/0，干预为176/28/28，末种群基线鹿89/狼16、干预鹿0/狼0。逐日用BigInt独立核对种群/资源账、伤者变化及劳动互斥。严重干预允许灭绝，此结果不证明基线长期平衡，不改参数使结果好看。

CLI stateHash=a105231577ff80e07771d8d946435697a598ceed38e8a82417851e9b608f413c；eventHash=5ca4315be3c53e07ebc6433e6e6f45eee0c11d8537daecabdeee711d417e85ef；ecologyConfigHash=7b4586d6a86a908c624e60ee429023dd4ed0b668223ce256eaf8966f7124b147。runtime sourceHash=7449385b12384f9d620c60438c999a8c0e7932346d7673fba4d5f3b3b6112520。证据在源码树忽略目录artifacts/world-runtime-b2-acceptance-20261007-1340：full-tests.txt、consumer-probe.mjs、comparison.json、paired-daily-rules.json、shock12/shock8/resumed4/baseline12；不上传运行产物。

只收口B2，阶段B仍进行中；B3价格/付费延迟贸易与B4多seed100/500/1000天门槛未实施。逐tick历史重算仍有性能瓶颈，后续需改进且保留全部坏档/篡改/回退校验。不合并源码main，不启停现有服务，不接页面/模型/桥或真实存档。同期main E1R2文档更新374ce63已保留，未改其代码或评测。

最终交接 `efda6f656c9300100b1d47a0fa26a365dcc8d132` 已推origin/codex/world-runtime-b2（末次仅文档同步）。最终干净提交seed0一天烟测通过，runtime源码指纹与上述验收相同；工作树干净。
