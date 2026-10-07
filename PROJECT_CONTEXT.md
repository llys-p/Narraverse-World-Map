# 当前状态与接手方向

更新时间：2026-10-07 19:00（Asia/Shanghai）。

## 项目定位

地图 → 场景 → 战斗 → 成长的独立可玩原型；先单独保存和迭代，不自动替换Narraverse模块四。
代码保持现有纯JS/HTML结构；本轮没有TS化、没有改战斗/地图玩法、没有引入依赖。
后续方向已确定为世界运行时 / 生态模拟；按 [架构与分阶段实施计划](WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md) 逐步推进。

## 已有资产

- 地图、场景、战斗、角色与商店五个页面。
- WorldRPG、WorldInv、WorldState、WorldSkill、WorldFX、WorldCombatFX模块。
- kit、stickart绘制资源与现有浏览器E2E脚本。
- 历史README、阶段总结、两个review和HANDOFF文档。

## 独立化边界

- 新仓库只保存经过白名单与敏感特征检查的源码/资源/文档，不包含用户运行数据或密钥。
- 新Start-World.cmd从自身目录启动，默认18312；server直接运行仍尊重既有WORLD_PORT/18212逻辑。
- server不再读取旧fusion .env，只读取此仓库本地.env；未配置时云模型不可用。
- 默认不启动Laya桥；离线地图与战斗不证明AI/桥完整闭环。
- 新origin浏览器存档不是旧origin存档；目前没有迁移。

## 验证口径

- 历史：小Z复跑fix4/rpg/inv/game/skill/fallback六套；world/ctx未复跑。
- 2026-10-06 独立化时：边界回归3项通过，53个JS/MJS/CJS脚本语法检查通过。
- 同次隔离18313服务：五个页面与三个脚本路由均HTTP200；模型配置configured=false，没有调用模型或桥；测试后停止自己的服务。
- 不宣称原型全部E2E、真实模型、状态恢复或素材许可通过。
- 2026-10-07 架构文档修订时：只修订计划与状态入口；阶段依赖、文档链接、代码围栏与 diff 格式已检查。不新增运行时代码，未运行模拟、浏览器或模型验收；上述原型测试不代表新模拟内核通过。
- A1/A1R `7b4a2db` 中控复验 PASS：Node v24.14.0 定向30/30、边界3/3、diff格式通过；受限堆超预算提前拒绝、100万结果边界、advance队列上限、600组BigInt大tick对照通过。F1/F2/F3关闭，详见 [A1R复验记录](tasks/A1R-SCHEDULER-LIMITS-TASK.md)；源码仍在任务分支，未合并main。
- E1R2 `226a09a` 中控复跑原回归通过，但单独反例仍发现重复键/概率键、回执实算、token失败估算及稳定性漏项；已内部修复并推 `codex/laya-benchmark-control` @ `fa0550a`（源码D:\Narraverse-World-Map-benchmark-review）。稳定性18项、中控8项、原门槛回归及语法/diff检查通过；临时副本按索引重算dev/calibration准确率不变。新运行不覆盖raw，回归不改研究原件，未重跑真实模型、未开final、未合并源码main。工具限定收尾通过，E1整体未验收。
- E1新版规范试审：两名全新AI各25条已回收，包规范哈希840f2c74…；social/trust/fear/deception/boundary一致率96/68/88/96/100%，κ0.9427/0.4737/0.7549/0.6528/1.0。回执/支持/混淆矩阵/13项分歧在仓库外D:\ModelBench\laya\review-return\sanity-retrial-v2；仅同模型独立上下文试标。中控随后明确信任“不变/不确定”及历史违约不得重复扣信任，新修订未独立验证，旧κ不能沿用；仍不冻结/准入。
- E1长dev小批：作者7ee4a91的v1原件保留，中控修正NPC/玩家履约主体与当前窗口标签，另建v2并推codex/laya-long-dev-control @ 0c8fc10（源码D:\Narraverse-World-Map-benchmark-review）。四类各6条/8家族、真token路径、两次构建逐字节一致与三套回归通过；新cat2匿名信任复核6/6一致。输入设计/信任反例限定验收，五信号未冻结、无推理/扩400/final/训练。v2 primary缺依据13条、超预算8条，不能与long共用完整标签评分；详见[小批收口](tasks/E1-LONG-DEV-TASK.md)。
- E1首批30dev：codex/laya-corpus400-dev30 @ 71825aa（D:\Narraverse-World-Map-corpus400）远端/干净树/hash核对；构建11.474秒、三回归4.343秒通过，不是98分钟模型计算。双独立上下文复核及一次作者外裁定完成：五信号一致率86.7/90/90/93.3/90%，136项暂定dev参考、14项规范/语义未解决；不称整批金标验收。回执与裁定hash见[投入筛查合同](tasks/E1-DEV30-SCREENING-TASK.md)。下一项有界真实A/B诊断待派发，新入口/推理未做；400改条件性计划，不默认扩满/训练。

- A2/A3/A4：全部simulation及独立化边界60/60通过；独立消费者/磁盘探针通过。干净796b483上的CLI100天与40天保存加载+60天完整checkpoint/inputs一致，tick14400、103事件，两哈希相同。最终02cecea干净seed0烟测通过，runtime源码指纹与100天验证相同。
- 证据：源码树artifacts/world-runtime-a-acceptance-20261007-1258/comparison.json及continuous100/prefix40/resumed60；产物保持忽略、不入仓。Node v24.14.0，100天实测约46秒；只是clock-smoke正确性，规模/生态/页面/模型/桥接入未验证。[A4合同与收口](tasks/A4-RUNNER-TASK.md)。

- B1 `6382ad5`：配置/单位/每日资源收支与整数余量入存档，ResourceDaySettled事实与配置逐日复算；零库存、缺口、容量损失、非法数据、整tick回退及超预算提前拒绝通过。全部simulation+边界70/70（本轮约228秒，含并发运行），原A行为保持；[B1合同与收口](tasks/B1-RESOURCE-LEDGER-TASK.md)。
- 干净6382ad5实际CLI10天=4天保存+6天续跑，完整checkpoint/配置一致，30行CSV使用BigInt逐行对账；最终f3aff78干净seed0一天烟测通过、源码指纹相同；tick1440、10事实、粮1012/药87/金币20000。源码指纹49bc5f3718a744a75b33069c99c2341bbb7ee1e826c01ae70cc73b3e6612e2b0；证据artifacts/world-runtime-b1-acceptance-20261007-1321/comparison.json与full-tests.txt保持忽略。10天约17秒（并发回归条件），内存为末尾采样；逐tick历史重算开销大，长程实验前需要改进验证策略，不能据此承诺1000天性能。此fixture不使用RNG，鹿狼静态，不宣称生态平衡或贸易完成。

- B2 `dc2d7d7`：鹿狼真实出生/死亡/捕食/饥饿压力、农田损失、聚合捕猎/治疗，RemovePopulation命令与幂等回执、因果事实、RNG/种群/资源完整重放已实现。79/79全回归通过（原70+新增9；约127秒）；死亡/猎杀狼不再产生农田损失反例先红后绿。[B2合同及收口](tasks/B2-ECOLOGY-HUNTING-TASK.md)。
- 干净dc2d7d7实际CLI扰动12天=8天保存+4天续跑，完整checkpoint、两哈希和三CSV一致；最终efda6f6干净seed0一天烟测通过、源码指纹相同；tick1728、13事实，tick1440移除90鹿一次，之前9天与基线同轨迹。12天约31秒（同期全回归）；另60天配对每日业务规则实验seed1在第32天首次出现额外压力，基线农田损失/伤者/药消耗=0/0/0，扰动=176/28/28，末鹿狼=0/0。严重扰动灭绝有账可解释，但不证明平衡；此60天实验不是CLI/B4长程验收。源码指纹7449385b12384f9d620c60438c999a8c0e7932346d7673fba4d5f3b3b6112520；证据artifacts/world-runtime-b2-acceptance-20261007-1340/comparison.json、paired-daily-rules.json及full-tests.txt保持忽略。价格/付费贸易/人口生死/NPC/页面/AI未实现，历史逐tick重算瓶颈仍待B4前处理。

- B3主实现2807db2、CSV现金账修正18ae1fe：有界库存价格、锁价付款、在途运力、两日到货与SetTradeRoute命令，关闭保持已付货物，恢复只卸一次；金币/商品/完整事实重放通过。最终simulation+边界90/90（原79+新增11，约124秒）；金币CSV遗漏采购付款反例先红后绿，现逐日现金期末与存档一致。[B3合同及收口](tasks/B3-MARKET-TRADE-TASK.md)。
- 干净18ae1fe真实CLI路线暂停4天=2天存盘+2天恢复，完整checkpoint、两哈希、五CSV/输入/配置一致；最终ee480ea干净seed0一天烟测与现金CSV通过、源码指纹相同；tick576、6事实，订2单、到2单，共支付1980，金币20；第3天到货0、第4天粮100/药13一次入账，另开放路线3天正常到货。BigInt独立核对商品/金币账、锁价与价格公式/日变幅、CSV付款与期末；到货paidAmount=0。4天约13秒（同期全回归），只测末尾内存非峰值；runtime指纹92674ff27e87cbb28d2888fb0e1392d74909871abc0724cf6ed35f65b3f5ccb8。证据artifacts/world-runtime-b3-acceptance-20261007-1359/final/comparison.json与final-full-tests.txt保持忽略。外部无限供给仍受运力/金币限制，无卖出/退款/货损随机模型；B4长期平衡和历史重算性能尚未验收。

- B4 `8ef4d45`：私有冻结session跳过空tick，活动tick整候选规则对照，入口/持久化全量审计保留；原90+新增8全回归98/98；最终28c60d4干净seed42一天烟测、源码指纹复核通过。实际42次干净CLI实验通过；7seeds基线1000日鹿182/狼14、轻扰动均第49日恢复；重扰动完整价格/付款/延迟药补给链、同药材条件贸易阻断缺口显著。1000日最长12.9秒；旧4日轨迹字节一致，采样13.1秒→0.26秒（并发条件不同）。原B3参数基线灭绝，旧fixture不改，新校准参数/门槛先冻结再验剩余seed，不能把旧默认参数称平衡通过。
- 独立复核42次运行的代码/源码指纹与状态事件哈希、45420行资源CSV、现金/在途订单及累计时钟溢出通过；证据artifacts/world-runtime-b4-acceptance-20261007/independent-verification.json、matrix/report.json、final-full-tests.txt保持忽略。runtime指纹405ee7e0856e7b66f586755dbcf5ad6a799a72f11e15b1f3512df0dea2160cc3；末尾RSS不是峰值、1000日不是规模压测。[B4报告](docs/runtime/B4-ACCEPTANCE.md)。

- C1 `7c59ad0`：实名3人从80人口移交、匿名77，ID/nextEntityId连续，匿名劳动排除实名者；同一粮药账分配实际份额、Needs、饥饿死亡一次并保留墓碑。109/109（原98+新增11）全回归；实名/匿名最后粮药分配、无药不恢复、死亡不消费/治疗/身份重建、非法数据与配置/份额/Needs/墓碑/RNG篡改/整tick回退通过。[C1合同及交接](tasks/C1-ACTOR-POPULATION-NEEDS-TASK.md)。
- 干净7c59ad0实际CLI100天=40保存+60恢复，完整checkpoint/两哈希/六CSV/inputs/配置一致；825人日独立核对人口/劳动/消费/需求/死亡，100日实名粮300、世界粮消费8000。needs5猎人健康/饥饿/疲劳回1000/0/0；shortage30实名3人死亡（村长tick144，猎人/商人3456），墓碑不再消费。100日约9秒（同期全回归，末尾内存非峰值）；复跑B4 frozen baseline1000日完整checkpoint字节相同。runtime指纹95bfa553e1f619d23f30d07cc4ddbaf5ab05f8351e8cd96de56068a826aeaf57；证据artifacts/world-runtime-c1-acceptance-20261007/comparison.json、full-tests.txt与五组CLI产物保持忽略。最终13ed16c干净seed0一天烟测及源码指纹通过。只有身份/份额/Needs基础，自主行动/Goal/关系/记忆未实现。

- C2 `d3f3d39`：猎人私人粮药/钱包实际归属、工作工资/捕猎/锁价购买/私药使用，经规范Utility/持久Goal生成内部ActorAction输入→engine回执/事实→日规则。公共市场不能花钱包，实名消费/劳动不双算，死者不行动/消费/复活；125/125（原109+新增16）全回归，真实CLI/磁盘目标/部分工资/库存恢复、失败整tick回退、输入/Goal/资产/回执/RNG篡改拒绝通过。[C2合同](tasks/C2-HUNTER-UTILITY-GOAL-TASK.md)。
- 干净d3f3d39实际CLI baseline100=40保存+60恢复，恢复目标20=2保存+18恢复，完整checkpoint/两哈希/八CSV/inputs/配置一致；独立核对公共+私人粮药、现金归属、实际工资/锁价/私药使用/同鹿群扣除与inputSeq。recovery20同一Goal完成7次工作、3次买药/使用：工资140/药费125/钱包15，health到800；基线100含5次实名猎鹿、个人真实吃100份粮、Goal完成5次。100日约15秒（并发全回归，末尾内存非峰值）；旧C1 100日与B4 frozen 1000日完整checkpoint字节未变。runtime指纹3e1cf858c838910be0a01da6ec47e6cc7f05f7b90930f7f12c77cd3b0a69c759；证据artifacts/world-runtime-c2-acceptance-20261007/comparison.json、full-tests.txt与消费者输出保持忽略。最终31c4690干净seed42一天烟测/源码指纹通过。仅猎人自主，C3多人物竞争/C4关系记忆未实现；world.gold为聚落总量、钱包是归属份额，内部outflow不是外部出口。

- C3实现3756071/补测a3fbde6：三人独立私账/Goal，同快照规划后按ID提交重校验；最后1公药/20工资只有1人成功，拒绝不损钱货；村长实际公共粮工作、猎人同鹿群捕猎、商人持药并peer转售。139/139（原125+新增14）全回归，坏输入/访问器/空批策略、来源/资产/Goal/交易/RNG篡改及整tick回退通过。[C3合同及交接](tasks/C3-SOCIETY-COMPETITION-TASK.md)。
- 干净3756071实际CLI100=40保存+60恢复，转售4=1保存+3恢复，完整checkpoint/两哈希/八CSV/inputs/配置一致；独立核对合计钱包、公共+私人粮药/真实使用、转售双方现金与药一增一减，拒绝回执及inputSeq。peer首单52金币、买方下一日才用药；基线100有5实名猎鹿、三人真实吃私粮245、工资680、目标完成145，无假增人口或货币；未吃饭日由Need/饥饿规则如实体现，不声称私粮需求全满足。100日约91秒（并发回归），末尾内存非峰值，三人校验明显变慢，未测规模。旧C2 100日完整checkpoint字节未变；runtime指纹fff194b770da08242808da46d53f7919f9b50ff428d6588d4986398c7261213c。证据artifacts/world-runtime-c3-acceptance-20261007/comparison.json、final-full-tests.txt等保持忽略。最终13b137c干净peer-sale一天烟测和源码指纹相同；C4记忆/关系/Actor-known上下文尚未实现。
## 尚未完成

- 两个localStorage键非事务、多标签页冲突、战斗中途刷新恢复。
- Laya心境驱动地图行为；可信人物判断不是躯干可视化可以证明的。
- 原浏览器E2E端口与外部路径尚未统一，部分测试会触发云调用。
- 素材许可/公开发布许可尚未核实，仓库先私有。
- 旧正式平台移植建议属于历史，不自动成为此独立项目任务。

## 下一步

A/B及阶段C全部已验收。C5代码04dc222（D:\Narraverse-World-Map-a2 @ codex/world-runtime-c5）：177/177全回归，干净100=40+60完整checkpoint/14导出一致，独立评分/真实现金商品账、偏好跨档/篡改拒绝通过；旧C4 100日完整存档/13导出字节不变。源码指纹d3a2129dddc20dfe168b3b0af7a02c6dda6124f7b05289e35bf27be5c436b2a0，证据artifacts/world-runtime-c5-acceptance-20261007/comparison.json与[C5收口](tasks/C5-PERSONALITY-CHOICE-TASK.md)。D1代码0f86d40（当前codex/world-runtime-d1）已验收：全量184/184，真实HTTP/两个浏览器页签、纯读/断连/重启、锁归属/字节一致通过；首次默认并发系统内存分配失败，保留日志后两路并发原测试全过。证据artifacts/world-runtime-d1-acceptance-20261007，见[D1收口](tasks/D1-RUNTIME-SERVICE-READONLY-MAP-TASK.md)。下一项[D2A时间提交](tasks/D2A-TIME-COMMAND-COMMIT-TASK.md)已定义未开工；用户要求当前项结束后停止，本轮停在D1，D整体未验收。源码仍不合并main、不部署/接模型/桥/真实旧档，E预研独立。

阶段顺序：A 底座 → B 生态经济 → C 人物决策 → D 玩法接入 → E AI增强；F 世界扩展按需拆项，G 正式平台适配单独规划与授权。

- A1～A4：时间与随机数 → 状态/命令/事实事件 → 保存恢复 → Node runner。连续100天与40天存档后再跑60天必须一致；通过只代表底座通过。
- B 才验证100天生态经济因果闭环，并进行500/1000天、多seed与扰动对照；聚合捕猎和简化贸易不能宣称实名NPC决策完成。
- A～C 使用新建实验数据，隔离旧页面与真实浏览器存档；不改正式平台、不启停旧实例、不调用付费模型或Laya桥。
- 后续按用户指定的任务/阶段范围推进；每项验收后更新本文件的当前任务和下一步，不把方向文档当作实现证据。

## 中控与进度看板

- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)；owner `llys-p`，number `2`，Project ID `PVT_kwHOEF9IDs4BmADf`。与正式平台 Project #1 分开维护。
- 当前卡定位：阶段 A `PVTI_lAHOEF9IDs4BmADfzg_Bv9M`；A1 `PVTI_lAHOEF9IDs4BmADfzg_BwKU`；B阶段 `PVTI_lAHOEF9IDs4BmADfzg_Bv-0`、B1 `PVTI_lAHOEF9IDs4BmADfzg_DZNs`、B2 `PVTI_lAHOEF9IDs4BmADfzg_DkN4`、B3 `PVTI_lAHOEF9IDs4BmADfzg_Dvno`、B4 `PVTI_lAHOEF9IDs4BmADfzg_D8HE`；C阶段 `PVTI_lAHOEF9IDs4BmADfzg_BwAs`、C1 `PVTI_lAHOEF9IDs4BmADfzg_ERTg`、C2 `PVTI_lAHOEF9IDs4BmADfzg_EnoU`、C3 `PVTI_lAHOEF9IDs4BmADfzg_FGww`、C4 `PVTI_lAHOEF9IDs4BmADfzg_Fov0`（已验收）、C5 `PVTI_lAHOEF9IDs4BmADfzg_G6Gg`（已验收）；D阶段 `PVTI_lAHOEF9IDs4BmADfzg_BwCU`（进行中）、D1 `PVTI_lAHOEF9IDs4BmADfzg_HMTc`（已验收）。更新前用 `gh project field-list 2 --owner llys-p --format json` 与 `gh project item-list 2 --owner llys-p --format json --limit 100` 读取真实字段/状态，按稳定 ID 更新，避免重复建卡。
- 用户已授权本对话按架构依赖自行实施、测试、复核、提交及同步看板；保留任务书定义范围，阶段门槛通过再推进下一项。源码不自动合并main，仍不接入正式平台。
- 待派发不代表开工；收到实际开工回执才进入进行中，交付进入待验收。中控复核通过后标已验收，失败标需修正并保留原因。
- 每个任务/阶段收口同步看板与本文件；阶段需所有必需任务及阶段门槛通过。收到回执后触发更新，远端失败明确记录待同步，不凭执行者自报测试数量判定完成。
- A1～A4及A/B/C阶段门槛已通过；C1～C5均已验收，D1已验收，D2A已定义未开工，D整体未验收，F/G主线未开始。E阶段待开始；E1双复核/一次裁定完成，136项暂定参考/14项未解决；接着按[小dev投入筛查合同](tasks/E1-DEV30-SCREENING-TASK.md)作有界A/B诊断，当前待派发未开工。无信号值得投入则收口当前预研，正式准入仍为空；400仅条件性计划，不训练/装CUDA/启E2/qoder_cron。
