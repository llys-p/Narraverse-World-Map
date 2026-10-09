# 当前状态与接手方向

更新时间：2026-10-09 14:54（Asia/Shanghai）。

## 项目定位

地图 → 场景 → 战斗 → 成长的独立可玩原型；先单独保存和迭代，不自动替换Narraverse模块四。
代码保持现有纯JS/HTML结构；本轮没有TS化、没有改战斗/地图玩法、没有引入依赖。
后续方向为世界运行时 / 生态模拟与人物心智（Character Mind Runtime）；主方向与取舍见 [项目指导书](PROJECT_GUIDE.md)，详细约定见 [架构与分阶段实施计划](WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md)，实际执行按冻结任务书逐步推进。

2026-10-09：新增统一指导书，整理核心权责、扩展/重演成本/认知降频注意事项及参考采用条件。已通过 GitHub API 读取参考库全部9份文档，来源为独立分支 `docs/game-ai-reference-library-20261008 @ b0b13a3baccf0d26fae167f7827930a1df995876`；本次取证时远端 main `a7a10f2` 尚无参考库。复核 CDDA 源码、Veloren 项目文档、Shadows of Doubt 历史开发博客、Bannerlord API 和 Endless Sky 任务文档；Wildermyth 原站本轮未成功读取，仅保留库内线索。指导书147行，5个本地链接、9个固定快照链接、模式编号/采用状态与文档一致性已独立检查通过；UTF-8无BOM、LF、零尾空白，diff check通过。只修改文档入口与指导内容，不改变 M3-2 合同或开工状态；未运行模拟、浏览器或性能测试。

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
- E1首批30dev：71825aa原件与136项暂定参考/14项未解决保留，整批五信号金标未验收。筛查9b7f88c实跑A/B各150记录（260返回+40超预算），278.1秒；中控187a2e6独立按索引/raw/hash/token复算与三套临时副本回归通过，未重跑模型。总体五信号都低于锁定常量；可执行同参考子集A boundary打平、其余九组更差，无继续投入信号。当前A/B预研已收档，正式准入为空，停止400扩样/微调/rotated/C；见[收口与保存点](tasks/E1-DEV30-SCREENING-TASK.md)。一次性脚本未作通用runner验收，新模型路线另发合同。

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

- 历史 M1 交接：`D:\Narraverse-World-Map-m1-integration @ codex/world-runtime-m1-integration`，生产代码验收 SHA `78303b4ff14af69a8faa1c70847e8b98153cbb69`，独立目标截止/cooldown测试 `3be94c6a85d17e0baf7c03583eb62fad9f52f0e9`，当前 integration 交接 `87aa9b605f5f509ce3b0daa97e34ded004d22f33`；源码尚未合并 main。完整M1收口文档在 `b2e56bcf6ef6fb57206740d248afdbc960342fcd`。旧运行时基准仍是 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-d2c`，D2C验收 `172ac9f` / 交接 `feb2856`；控制文档在 `D:\Narraverse-World-Map-control @ codex/world-runtime-control`。
- A/B/C 与 D1～D2C 均已验收。C5 177/177、D1 184/184、D2A 196/196、D2B 及边界修正 238/238、D2C 270/270 为各提交已归档证据，非本次复跑；详见 [C5](tasks/C5-PERSONALITY-CHOICE-TASK.md)、[D1](tasks/D1-RUNTIME-SERVICE-READONLY-MAP-TASK.md)、[D2A](tasks/D2A-TIME-COMMAND-COMMIT-TASK.md)、[D2B](tasks/D2B-PLAYER-CONTRACT.md)、[D2C 收口](tasks/D2C-PLAY-CONTRACT.md)。D2C 真实浏览器/重启原 ID/硬退出恢复、旧 C5 四天完整存档与 20 份导出字节对照通过；本地证据 `artifacts/world-runtime-d2c-acceptance-20261007`。D3/D4 未开始，D 整体未验收。
- 本次完整阅读 [NPC Brain 灵感笔记 v0.2](docs/character-mind/NPC_Brain_Character_Mind_Runtime_灵感笔记_v0.2.md)（原分支 docs/npc-brain-v0.2-20261008，原提交 8c187a2），原文保留；依据真实源码将后续重点改为 Character Mind Runtime。旧人格只有三项需求权重，NPC knowledge 尚未适配 D2C；完整信念/动机/学习不是已有能力。
- [M0 合同与场景冻结](tasks/M0-CHARACTER-MIND-CONTRACT-TASK.md)已交付：[M1 共同合同](tasks/M1-CHARACTER-MIND-CONTRACT.md) `m1-contract-v1` 冻结新 mind-village、两位 NPC 的公仓药材判断、买药/用药/等待、完整重演、只读检查器及 K1～K6。M1A/B/C 分别交付并推送：A `d82bfd9cf67a64b74aa0f7a42b21b6538c660ab6`、B `ca78d1c5202fca6d5676e1dab797ae4974278e6c`、C `45a2ccd7bc6e62843735db76c0c43bf23f620399`；集成树 `D:\Narraverse-World-Map-m1-integration @ codex/world-runtime-m1-integration`，独立验收代码 SHA `78303b4ff14af69a8faa1c70847e8b98153cbb69`，当前交接 `87aa9b605f5f509ce3b0daa97e34ded004d22f33`。中控最终裁定 M1 与 A/B/C 均 PASS/已验收；源码尚未合并 main。
- M2 已收口：合同 `m2-contract-v2` 原冻结 `0d7cc74`、期限 fixture 补正控制 `02c1a64`；原源码基准 M1 integration `87aa9b6`。A1 `79b0c50`、A2 `51b9975`、B `2a8eb52` 与 C 浏览器修正 `574856e9c84c650edebb4ec110cfe806884f4984` 均已中控验收并导入 integration。冻结验收 SHA `83826a82fea5c0edfe62aa3d676313eefe2a7790`：阶段全量57 simulation（排除两份C独立测试文件）+ export 共58 files，401/401 pass、0 fail/skip/cancel/todo，exit 0，17:23:13–17:37:36（Asia/Shanghai）。测试前后 tracked/source/test 指纹一致且工作树干净；完整证据在 integration `artifacts/world-runtime-m2-stage-closeout-20261008/result.json`，中控最终回执 `artifacts/world-runtime-m2-integration-acceptance-20261008/controller-review.json`。C原独立30项29 pass/1 browser fail，修后仅定向浏览器1 pass，原29项未重复；B真实四日UI、断连/迟到 DTO 保留通过，harness red原件保留。文档交接 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9` 只改README/状态，源码未变；未合并main、未push。
- M3-1 合同 `m3-kernels-contract-v1` 发布于控制 SHA `8282a135a85967818c39a6289cd1a0e7dcec769d`。[A 工作结果经验内核](tasks/M3-1A-WORK-EXPERIENCE-TASK.md)与[B 认知审查内核](tasks/M3-1B-COGNITIVE-REVIEW-TASK.md)均由中控裁定 PASS/本地已验收（仅纯内核），M3-1 两项至此收口。A 代码树 `D:\Narraverse-World-Map-m3-experience @ codex/world-runtime-m3-experience`，基准 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9`，生产代码 `473f608f792fb840211a16779a175ffe4e7b7eb5`，最终测试交接 `275b81a37253ddf0bada93e2252b30629d3f3dc5`；历史验收范围见 A 任务书。
- B 代码树 `D:\Narraverse-World-Map-m3-cognition @ codex/world-runtime-m3-cognition`，用户交付 `3d4b21e3eb64f68f3d0b9a4d2801a113a1a9be0d`，基准 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9`，最终提交 `9a4794700234f097be0e1b7cb490dad4341e2e85`。B 的中控反例、修复与定向复核范围见任务书；未在已提交 `9a47947` 上重跑 27 项模块套件，也未重跑原 5 个通过门。
- M3-2A/B共同合同 `m3-experience-runtime-contract-v1` 发布 SHA `b4c39e36cf13cb8e3b10073ef695ad105d991e47`；基准 `D:\Narraverse-World-Map-m3-base @ codex/world-runtime-m3-base`，HEAD `fe1dec0f3ee2ca4560438d268ae90a73cb3199db`。A唯一生产依赖为 `ad8695097b6b974030fd43f4947d7a01f627abf3`；B原测试提交 `2387ad38a856a7b6b5bfaada4d062ff5480ad780`，导入提交 `56e2df4d6d95f1fa76fda0af547a41b0c2507763`，最终集成 commit `a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2`。集成树只修两份 B 测试，相对 A 生产文件零差异；58 个生产文件 SHA256 前后稳定为 `b8806fb4edc0722360014477931c30a6ca53fd5db00e148195d8dab75a9fbc8c`。
- 中控裁定 M3-2A、M3-2B 与 M3-2 限定轮次 PASS/已验收。B 证据分次记录：gate 首轮有效验收10项中5通过、5测试失败；修正失败项后定向5/5，E1增强再1/1；runner 旧兼容 4/4、真实 CLI/resume 1/1、隔离 1/1、E6 篡改恢复 1/1。合计覆盖 17 项唯一必需检查，不代表单次 17/17 套件；初始 gate/runner 中由测试夹具导致的 skip 不计验收。optional 的旧 default288 Inspector、deadlineStates/deadlineHashes 23 日与旧 profile CLI 未运行、不计通过。证据见集成树 `artifacts/world-runtime-m32b-controller-review-20261009/`，包括 `controller-review.json`、`test-review.json`、`test-repair-reasons.md` 与 `oracle-definition/deadlineHashes-provenance.md`。完整 M3 未验收；M3-3合同与A/B本地任务书已发布于控制提交 `6b02918b60a1a5681fa2194ab362aaf808bceb06`，当前执行进度见下段；D3/D4顺序不变，未合并 main 或 push。上述结论是限定门槛验收，不表示本次重跑 A 全量或 M3 全量。
- M3-3 已中控验收收口：合同 m3-cognition-runtime-contract-v1 @6b02918保持冻结；A原交付 1b117d8e65d4d0e6fadb113d8b625472706750e3，白名单9改/6新、四冻结文件及data-contract不变。中控隔离独立克隆 `D:\Narraverse-World-Map-m3-cognition-integration @ codex/world-runtime-m3-cognition-integration`，本地origin指原A；B原6241809→导入af16b4f，准备修正2fdc895→导入8cc9c17，修三处P2生产提交 `0e58d5b39286f23e87cab2e978f57b683e90902b`，最终仅修一份B测试交接 `6562460c2a0610afff6ba49f25524e1ae191b8c5`，工作区干净。原A/B/review树保留，代码未push或合并main。
- M3-3 A/B/阶段 PASS（限定本轮，不是完整M3）：修复review来源ID的规范/严格过去、baseline canonical语义和plan/Goal deadline错配；修复探针32/32、24种合法baseline、getter0。C1-C8按原A与定向修复分次覆盖：最终C1/C3/C4/C7通过，C7有23种实变和两种真实学习后整tick回滚；C2/C5保留原A未变有效行为证据；C6/C8原A四项及真实CLI6=2+4、25业务文件通过，最终修复后的checkpoint1+公共底座22+有界存盘4共27/27通过。不是一次全套运行，未跑M3 full suite。证据在集成树 `artifacts/world-runtime-m33-controller-review-20261009/controller-review.json`、`source-and-tests-final.json`及acceptance/runner分次记录；61生产文件匹配提交，最终测试字节匹配交接。
- 作者自报159自测无保留TAP，14项“基准环境同败”无具体路径/日志，本轮不采为独立证据或自动免责。自然maintain Work未实现不欠本合同（只验纯分支/合法adapter链）；mode真伪由完整replay裁定，未新增HTTP/UI或物理LOD。完整M3仍未验收，下一轮最多两份任务书实现服务/检查器并独立验收完整体验；真实Work失败→改选→合法恢复→同人真实工作成功→旧失败退出四样本窗口、低频延续、保存恢复与最终full suite须保留。之后先冻结有界自主取食/收入闭环，再评估D3/D4。
- M3-4共同合同 `m3-closeout-contract-v1` @fb4e500保持，当前A/B任务入口见上轮发布。A树 `D:\Narraverse-World-Map-m3-inspector @ codex/world-runtime-m3-inspector` 已建，执行者停止回执：干净基准6562460、无提交交付；中控确认c9e6bf9仅填A发布SHA头，业务/7改5新白名单未变，固定blob7ce12a9、LF SHA256488ec2c8…5b25d已核。代码SHA在独立cognition-integration仓库有效，文档仓库无对象正常；工具garbling原因无原日志仅保留报告。可复用A树按钉定合同恢复执行，尚无复工回执，不清理原树。
- M3-4B第一轮 `D:\Narraverse-World-Map-m3-closeout @ codex/world-runtime-m3-closeout` 干净交付 `2570dbf550d232d137d99bad972a8264a2e26275`，common dir为cognition-integration独立clone的.git、origin本地路径，3个test文件白名单。实体指纹/手算准备不能当真实service/UI通过；G1–G5全未验。原树保留，中控复核树 `D:\Narraverse-World-Map-m3-closeout-review @ codex/world-runtime-m3-closeout-review`，修正交接 `caf7b12a8a1770443af5e552c03d5514aa62b966` 干净，仅3test窄修共享oracle权威哈希绕过、依赖/导出guard及外层locator；生产零差异。本人自办按该会话指令，M3-1A未变不再复跑。

- B已交付准备范围PASS，完整G0/G1–G5与M3未验：三个争议按合同接受（传递missing硬失败、版本分类可先RAW、optional消费者仍需合法证据）；原14/14、新增绕过两反例红→修后16/16，最终locator1/1；A缺席项仍预期1fail不计通过。146个源/test当前bytes匹配最终manifest、原oracle不变。证据review树 `artifacts/world-runtime-m34b-preparation-repair-20261009/controller-review.json`；未重跑作者167秒旧回归。B后续只从caf7b12接手，不自行在2570重复修或从A脏树凑依赖；中控待A精确交付才派发G1–G5。

- 本次有界规划验证：656基准上合法ON/OFF各12日可达：日2真Work拒付、日3ON610<Use700而OFFWork710；玩家真实Buy恢复公金10→110，日5/6/8/10四次真Work使罚分100→0，日11Work730；日3实际checkpoint恢复一致、四人12日存活。仅离线可行性，不是新服务/browser或未来B oracle；证据基准树 `artifacts/world-runtime-m34-contract-probes-20261009/experience-scenario/report.json`。完整学习修正场景在既有合法权威链可达，不扩写学习/评分。完整M3收口须本轮G0–G5、真实HTTP/browser及最终一次完整相关suite，缺required证据/driver/依赖阻断PASS；两历史根验收预排除理由与替代真实门已冻结，不临时降门槛。

- A 的精确测试边界、source/test SHA256 与忽略产物证据路径见任务书中控验收记录：修复点本路 14/14 通过；测试字节与交接 `275b81a` 一致的 window-order 1/1，以及实际在 `275b81a` 上运行的独立旧失败门 1/1，有各自定向证据。作者原 13 项和先前 7 个通过门未在最终交接重跑，不声称全套复跑。仅两项白名单 tracked file 参与，data-contract 与旧 M2 未改；修复回执 source/test 标签对调已中控核正。
- M3 源码与近期控制文档未合并 main、未 push；GitHub Project #2 已同步并完成远端读回核对。原有用户文件本轮未读取或操作。
- E 调整为可选 Provider 支线，正式准入仍为空；M 不依赖 Laya/LLM，旧 E1 不重开，未来按真实消费缺口另发窄合同。F/G 尚未开工；不接正式平台、模型/桥或真实旧存档，不启停旧实例，不自动合并 runtime main。
- 验证按用户约定：只查改动及直接影响；相同提交已过且代码未变不重复；公共时间/重演/存档底座变更才扩大，较大阶段收口集中全量一次。最终生产代码验收 SHA `78303b4ff14af69a8faa1c70847e8b98153cbb69`：既有 simulation+export 与边界共328/328，0失败、0跳过，596911ms，源文件SHA256前后不变；补充目标截止/cooldown边界测试在该运行时 HEAD 上1/1、217534ms（exit 0），生产代码 SHA 未变；测试文件随后归档于 `3be94c6a85d17e0baf7c03583eb62fad9f52f0e9`。38对兼容 checkpoint/导出 SHA 一致；12份冻结合同副本统一换行符为LF后内容一致。真实浏览器用隔离 Edge 154.0.4258.62 验证能力入口、tick0空态、HTTP 24+120至144并刷新；tick144猎人私药为0、当时冻结判断无药并选NoAction，而日末公开信息已使当前判断变为有药；商人成功买药；人物按钮/键盘1和2/手动刷新、来源/候选、双页签读零写、断连保留revision144、关闭开关页面/API均404。证据与截图：`D:\Narraverse-World-Map-m1-integration\artifacts\world-runtime-m1-controller-review-20261008\browser\run-20261008-78303b4`。PageError为0；唯一console error是断连模拟主动拦截GET产生的预期`ERR_FAILED`，请求URL/status已记录；两个自建port0服务已关闭。中控裁定M1及A/B/C通过；runtime代码仍在任务分支，未合并main。

- 本轮本地保全：原九源精确 commit 的 Git bundle 在全新隔离库恢复，9/9 SHA/tree、9条祖先覆盖及对象完整性通过；218个精选原始证据（2,977,117字节）与 E7/C8 必需实体已打包，隔离目录只按包内相对路径校验通过，缺失/损坏/版本反例均非零。精确来源与裁定见 [恢复证据索引](docs/evidence/PRESERVATION-20261009.json)，包在 control `artifacts/world-runtime-preservation-20261009-0910/`。本机同盘恢复包，不是异地备份；未 push/改 origin/main。新 A 提交1b117d8及用户未跟踪文件不在原九源包内。
- 下一轮独立验收明列旧 E7 required gate 补丁，缺依赖、缺坏/版本不符 oracle 阻断正式 PASS；当前 M3-3 A/B 白名单、生产及冻结 expected 未改。M3 收口仍须真实 Work 失败→改选→合法恢复→同人真实 Work 成功→四样本挤出旧失败、低频承诺延续、保存恢复、真实检查器消费链与最终一次 full suite；用药成功不能代替工作学习。

## 中控与进度看板

- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)；owner `llys-p`，number `2`，Project ID `PVT_kwHOEF9IDs4BmADf`。与正式平台 Project #1 分开维护。
- M 主线：M 卡 `PVTI_lAHOEF9IDs4BmADfzg_Q8JY` 与 M3 卡 `PVTI_lAHOEF9IDs4BmADfzg_Q8Sg` 的 Status/进度/阶段保持 In Progress / 进行中 / M，完整 M3 未验收。M3-2A、M3-2B、M3-2 三卡保持 Done / 已验收。此前发布新增 M3-3 阶段、A、B 三张卡，并更新 M/M3 两父卡正文；当时新卡发布时为 Todo / 待派发 / M，父卡字段未变。项目由53项增至56项，三标题各唯一。GraphQL 当前读回、expected/actual、ID 与字段证明见忽略目录 `artifacts/world-runtime-m33-publication-20261009/`；本目录 `before.json` 是上一轮 M3-2 收口快照副本，不是本轮写入前原件，不能据此声称本轮51项签名逐项前后相同。当前状态与本轮 mutation/readback 证据见 `artifacts/world-runtime-m33b-preparation-state-20261009/`。控制文档尚未 push。
- 新卡定位：M3-1 `PVTI_lAHOEF9IDs4BmADfzg_cvKU`；M3-1A `PVTI_lAHOEF9IDs4BmADfzg_cwwE`；M3-1B `PVTI_lAHOEF9IDs4BmADfzg_cyMQ`；M3-2 `PVTI_lAHOEF9IDs4BmADfzg_cySk`；M3-2A `PVTI_lAHOEF9IDs4BmADfzg_cyZs`；M3-2B `PVTI_lAHOEF9IDs4BmADfzg_cyig`。按稳定ID更新，避免重复建卡。
- M3-3 卡定位：阶段 `PVTI_lAHOEF9IDs4BmADfzg_hna4`；A `PVTI_lAHOEF9IDs4BmADfzg_hnbE`；B `PVTI_lAHOEF9IDs4BmADfzg_hnbc`。当前阶段/A/B均 Done / 已验收，M3父卡仍 In Progress；此前准备轮的56项证据保存于 `artifacts/world-runtime-m33b-preparation-state-20261009/`，本次收口证据见后文。
- 此前保全轮同步：Project #2 简介和 M/M3/M3-3阶段/A/B 五张卡正文已更新，区分本地恢复验证、未完成异地备份、A提交待核验与功能未验；56项读回，51个非目标签名及所有单选字段不变，未新建卡。首 mutation EOF 后先读回旧值，再用同一精确幂等请求重试成功；证据 `artifacts/world-runtime-preservation-20261009-0910/board/readback-result.json`。
- 当前卡定位：阶段 A `PVTI_lAHOEF9IDs4BmADfzg_Bv9M`；A1 `PVTI_lAHOEF9IDs4BmADfzg_BwKU`；B阶段 `PVTI_lAHOEF9IDs4BmADfzg_Bv-0`、B1 `PVTI_lAHOEF9IDs4BmADfzg_DZNs`、B2 `PVTI_lAHOEF9IDs4BmADfzg_DkN4`、B3 `PVTI_lAHOEF9IDs4BmADfzg_Dvno`、B4 `PVTI_lAHOEF9IDs4BmADfzg_D8HE`；C阶段 `PVTI_lAHOEF9IDs4BmADfzg_BwAs`、C1 `PVTI_lAHOEF9IDs4BmADfzg_ERTg`、C2 `PVTI_lAHOEF9IDs4BmADfzg_EnoU`、C3 `PVTI_lAHOEF9IDs4BmADfzg_FGww`、C4 `PVTI_lAHOEF9IDs4BmADfzg_Fov0`（已验收）、C5 `PVTI_lAHOEF9IDs4BmADfzg_G6Gg`（已验收）；D阶段 `PVTI_lAHOEF9IDs4BmADfzg_BwCU`（进行中）、D1 `PVTI_lAHOEF9IDs4BmADfzg_HMTc`、D2A `PVTI_lAHOEF9IDs4BmADfzg_Hq7Y`（已验收）；D2B `PVTI_lAHOEF9IDs4BmADfzg_IGm4`、三路 `PVTI_lAHOEF9IDs4BmADfzg_IGrM` / `PVTI_lAHOEF9IDs4BmADfzg_IGuY` / `PVTI_lAHOEF9IDs4BmADfzg_IG0Q`（已验收）。更新前用 `gh project field-list 2 --owner llys-p --format json` 与 `gh project item-list 2 --owner llys-p --format json --limit 100` 读取真实字段/状态，按稳定 ID 更新，避免重复建卡。
- 用户已授权本对话按架构依赖自行实施、测试、复核、提交及同步看板；保留任务书定义范围，阶段门槛通过再推进下一项。源码不自动合并main，仍不接入正式平台。
- M3-3本轮看板已同步并读回：阶段/A/B三卡 Done / 已验收，M/M3两父卡仍进行中且完整M3未验收；简介与五卡正文更新，新任务未发布。56项、51非目标签名不变，仅三卡Status/进度六字段改为已验收；完整before/after与核对见 control `artifacts/world-runtime-m33-acceptance-state-20261009/readback-result.json`。首次读取EOF后重试取得真实写前快照，不用旧副本充当本轮before。
- M3-4发布看板已同步/读回：新增阶段 `PVTI_lAHOEF9IDs4BmADfzg_kdUo`、A `PVTI_lAHOEF9IDs4BmADfzg_kdUs`、B `PVTI_lAHOEF9IDs4BmADfzg_kdUw`，均 Todo / 待派发 / M；M/M3两父卡正文更新，字段仍进行中。实际56→59项、三标题各唯一、54非目标签名不变；真实before/after及expected/actual在 control `artifacts/world-runtime-m34-publication-20261009/readback-result.json`。只发布两任务书，未创建执行树/未实施service6，合同本地未push。

- M3-4B前置回执看板已同步：B仍Todo（未编写交付代码/测试），进度改阻塞（等待A精确交付）；其实体盘点不记正式G0/G1–G4通过。A/阶段仍待派发，其他58卡签名不变、总59，读回证据 `artifacts/world-runtime-m34-dispatch-correction-20261009/readback-result.json`。

- 两回执看板已同步/读回：M3-4阶段InProgress/进行中（阶段未完成，不代表AI都在运行），A InProgress/阻塞（停止待恢复派发），B InProgress/阻塞（准备已复验、待A精确依赖）；简介和五卡正文更新、54非目标签名不变、总59无新卡。真实before/after在control `artifacts/world-runtime-m34-contract-readback-20261009/board-readback-result.json`。A原树与B原2570均干净保留，未清理/覆盖/push。

- 待派发不代表开工；核实实际开工回执或任务树中的实现/测试改动后进入进行中，交付进入待验收。中控复核通过后标已验收，失败标需修正并保留原因。
- 每个任务/阶段收口同步看板与本文件；阶段需所有必需任务及阶段门槛通过。收到回执后触发更新，远端失败明确记录待同步，不凭执行者自报测试数量判定完成。
- A1～A4及A/B/C阶段门槛已通过；C1～C5均已验收，D1已验收，D2A已验收，D2B三路已验收，D2C三路已验收，D2门槛通过，D3/D4未开始，D整体未验收，F/G主线未开始。E阶段待开始；E1本轮A/B投入筛查已复验收档，无信号达继续投入门槛、正式准入为空；[合同与保存点](https://github.com/llys-p/Narraverse-World-Map/blob/main/tasks/E1-DEV30-SCREENING-TASK.md)。停止当前400扩样/微调路线，不开新模型调用/校准/final/CUDA/C/E2/qoder_cron；保留数据环境。D主线不依赖AI，后续模型探索须另发定向合同，不把本轮预研收口当E1正式或E阶段验收。
