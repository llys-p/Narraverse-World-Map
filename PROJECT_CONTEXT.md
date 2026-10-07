# 当前状态与接手方向

更新时间：2026-10-07 13:59（Asia/Shanghai）。

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
- E1R `b2df7a9` 中控复验 NEED REVISION：当前树final答案字段扫描无泄漏，25条匿名包哈希匹配，评分自检零失败、dev/calibration完整JSON独立重算一致，置换翻转数核对一致；未重跑模型、未打开外部final金标。合成反例发现完整性错误仍exit=0、金标缺项缩分母、重复复核者/缺失裁定声明可过gate、超时后线程重叠、截断提前停止及删依据仍评分；[E1R2合同](https://github.com/llys-p/Narraverse-World-Map/blob/main/tasks/E1R2-BENCHMARK-GATES-TASK.md)定义四项修复。C未测、全部信号不准入Runtime，代码未合并main。
- E1规范试审：已派两名无对话继承、只读25条匿名包的AI，相互不通信；回执位于仓库外 `D:\ModelBench\laya\review-return\sanity-dev\reviewer-r{1,2}\`。这只是同模型独立上下文试标，不证明人类/异构复核独立性，不冻结final；双方回收后统计逐信号一致率/κ/支持量及分歧，中控复核规范，原作者不单独裁定。

- A2/A3/A4：全部simulation及独立化边界60/60通过；独立消费者/磁盘探针通过。干净796b483上的CLI100天与40天保存加载+60天完整checkpoint/inputs一致，tick14400、103事件，两哈希相同。最终02cecea干净seed0烟测通过，runtime源码指纹与100天验证相同。
- 证据：源码树artifacts/world-runtime-a-acceptance-20261007-1258/comparison.json及continuous100/prefix40/resumed60；产物保持忽略、不入仓。Node v24.14.0，100天实测约46秒；只是clock-smoke正确性，规模/生态/页面/模型/桥接入未验证。[A4合同与收口](tasks/A4-RUNNER-TASK.md)。

- B1 `6382ad5`：配置/单位/每日资源收支与整数余量入存档，ResourceDaySettled事实与配置逐日复算；零库存、缺口、容量损失、非法数据、整tick回退及超预算提前拒绝通过。全部simulation+边界70/70（本轮约228秒，含并发运行），原A行为保持；[B1合同与收口](tasks/B1-RESOURCE-LEDGER-TASK.md)。
- 干净6382ad5实际CLI10天=4天保存+6天续跑，完整checkpoint/配置一致，30行CSV使用BigInt逐行对账；最终f3aff78干净seed0一天烟测通过、源码指纹相同；tick1440、10事实、粮1012/药87/金币20000。源码指纹49bc5f3718a744a75b33069c99c2341bbb7ee1e826c01ae70cc73b3e6612e2b0；证据artifacts/world-runtime-b1-acceptance-20261007-1321/comparison.json与full-tests.txt保持忽略。10天约17秒（并发回归条件），内存为末尾采样；逐tick历史重算开销大，长程实验前需要改进验证策略，不能据此承诺1000天性能。此fixture不使用RNG，鹿狼静态，不宣称生态平衡或贸易完成。

- B2 `dc2d7d7`：鹿狼真实出生/死亡/捕食/饥饿压力、农田损失、聚合捕猎/治疗，RemovePopulation命令与幂等回执、因果事实、RNG/种群/资源完整重放已实现。79/79全回归通过（原70+新增9；约127秒）；死亡/猎杀狼不再产生农田损失反例先红后绿。[B2合同及收口](tasks/B2-ECOLOGY-HUNTING-TASK.md)。
- 干净dc2d7d7实际CLI扰动12天=8天保存+4天续跑，完整checkpoint、两哈希和三CSV一致；tick1728、13事实，tick1440移除90鹿一次，之前9天与基线同轨迹。12天约31秒（同期全回归）；另60天配对每日业务规则实验seed1在第32天首次出现额外压力，基线农田损失/伤者/药消耗=0/0/0，扰动=176/28/28，末鹿狼=0/0。严重扰动灭绝有账可解释，但不证明平衡；此60天实验不是CLI/B4长程验收。源码指纹7449385b12384f9d620c60438c999a8c0e7932346d7673fba4d5f3b3b6112520；证据artifacts/world-runtime-b2-acceptance-20261007-1340/comparison.json、paired-daily-rules.json及full-tests.txt保持忽略。价格/付费贸易/人口生死/NPC/页面/AI未实现，历史逐tick重算瓶颈仍待B4前处理。
## 尚未完成

- 两个localStorage键非事务、多标签页冲突、战斗中途刷新恢复。
- Laya心境驱动地图行为；可信人物判断不是躯干可视化可以证明的。
- 原浏览器E2E端口与外部路径尚未统一，部分测试会触发云调用。
- 素材许可/公开发布许可尚未核实，仓库先私有。
- 旧正式平台移植建议属于历史，不自动成为此独立项目任务。

## 下一步

A、B1/B2已通过；当前本对话自行实施B3，基准B2 efda6f6，源码D:\Narraverse-World-Map-a2 @ codex/world-runtime-b3。价格/付款/运力/两日到货、路线关闭/恢复及完整账户重放已实现；11项新增定向验证已通过，待最终90项全回归及干净代码消费者。源码不自动合并main，B阶段仍进行中；下一项B4先解决逐tick历史重算瓶颈，再运行多seed100/500/1000天门槛。E预研独立，不影响主线。

阶段顺序：A 底座 → B 生态经济 → C 人物决策 → D 玩法接入 → E AI增强；F 世界扩展按需拆项，G 正式平台适配单独规划与授权。

- A1～A4：时间与随机数 → 状态/命令/事实事件 → 保存恢复 → Node runner。连续100天与40天存档后再跑60天必须一致；通过只代表底座通过。
- B 才验证100天生态经济因果闭环，并进行500/1000天、多seed与扰动对照；聚合捕猎和简化贸易不能宣称实名NPC决策完成。
- A～C 使用新建实验数据，隔离旧页面与真实浏览器存档；不改正式平台、不启停旧实例、不调用付费模型或Laya桥。
- 后续按用户指定的任务/阶段范围推进；每项验收后更新本文件的当前任务和下一步，不把方向文档当作实现证据。

## 中控与进度看板

- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)；owner `llys-p`，number `2`，Project ID `PVT_kwHOEF9IDs4BmADf`。与正式平台 Project #1 分开维护。
- 当前卡定位：阶段 A `PVTI_lAHOEF9IDs4BmADfzg_Bv9M`；A1 `PVTI_lAHOEF9IDs4BmADfzg_BwKU`；B阶段 `PVTI_lAHOEF9IDs4BmADfzg_Bv-0`、B1 `PVTI_lAHOEF9IDs4BmADfzg_DZNs`、B2 `PVTI_lAHOEF9IDs4BmADfzg_DkN4`。更新前用 `gh project field-list 2 --owner llys-p --format json` 与 `gh project item-list 2 --owner llys-p --format json --limit 100` 读取真实字段/状态，按稳定 ID 更新，避免重复建卡。
- 用户已授权本对话按架构依赖自行实施、测试、复核、提交及同步看板；保留任务书定义范围，阶段门槛通过再推进下一项。源码不自动合并main，仍不接入正式平台。
- 待派发不代表开工；收到实际开工回执才进入进行中，交付进入待验收。中控复核通过后标已验收，失败标需修正并保留原因。
- 每个任务/阶段收口同步看板与本文件；阶段需所有必需任务及阶段门槛通过。收到回执后触发更新，远端失败明确记录待同步，不凭执行者自报测试数量判定完成。
- A1～A4与阶段A门槛、B1/B2单项已通过；B阶段进行中，B3/B4未开始，C～G主线未开始。E阶段待开始，E1预研仍需修正：先E1R2四项工具门槛与25条规范试审，再经中控确认补24条长dev；完整扩样另发合同，建议400=dev150/calibration90/全新final160。旧125条转开发/诊断、保留旧封存，不训练/装CUDA/启动E2；本轮不启用qoder_cron，按批交回。
