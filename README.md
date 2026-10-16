# Narraverse World Map — 独立原型项目

从 Narraverse 的地图/场景/战斗/成长原型独立保存，**不是已经集成的正式 Module4**。
本仓库先保持私有；绘制资源来源有记录，但分发许可未完成核实，不擅自添加开源许可证。

## 独立项目入口

- **当前 D4 固定本地体验候选：双击 `Start-D4.cmd`**，地图地址 `http://127.0.0.1:18325/runtime-map.html`。使用新的独立世界与存档目录，原18324保持；[启动、关闭、重开说明](docs/runtime/D4-EXPERIENCE-ENTRY.md)。长历史性能仍待优化，见[Issue #3](https://github.com/llys-p/Narraverse-World-Map/issues/3)。

- 仓库 AI 可直接运行 `node scripts/measure-data-contract-synthetic.mjs`，见[可移植短性能探针](docs/runtime/DATA-CONTRACT-PORTABLE-PROBE.md)。使用合成数据，无需本机私有存档；不代表真实长历史开档性能。

- GitHub：`llys-p/Narraverse-World-Map`。
- 本机开发目录：`D:\Narraverse-World-Map`；原 Narraverse artifacts 目录未移动、未删除。
- Node.js 20+，服务仅用内置模块；不需要先安装 npm 依赖。
- Windows 双击 `Start-World.cmd`：默认新端口18312，不启动或停止原项目的18212/18302/8084。
- 或执行 `node server.cjs`，默认18212；已有实例占用时，用 `WORLD_PORT` 指定空闲端口。
- 不配置 `.env` 时没有可用的云模型配置，不会自动读取旧 fusion 的密钥。
- AI和Laya是可选外部能力；不要为了查看地图自动配置模型或启动另一个CUDA实例。
- `node --test tests/export-boundaries.test.mjs`：独立化边界回归，不调用模型。
- 原浏览器E2E脚本仍含旧端口、Windows Edge路径和可能的云调用；运行前逐个核实，不直接全跑。
- 当前目录的浏览器存档与旧端口按origin隔离；本次没有迁移真实存档。

详见 [独立化与下一步](PROJECT_CONTEXT.md)、[世界运行时架构与分阶段计划](WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md)、[来源记录](SOURCE_ORIGIN.md)。

## 世界运行时：离线模拟底座

当前运行时代码位于 `D:\Narraverse-World-Map-m1-integration`，分支为 `codex/world-runtime-m1-integration`；它包含已提交的 A/B/C 阶段代码及 M1 集成修复，尚未合并 main。下方 D1～D2C 条目记录各阶段当时的实现与验收事实；离线 runner 无需 npm 依赖，不启动页面、服务或模型。Node 实际验证版本见运行 summary。

D1已新增独立只读世界服务：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-d1/my-world --port 18314
```

打开`http://127.0.0.1:18314/`；终端输入`quit`后回车正常停止。目录专用于新实验，已有档严格恢复，不覆盖重建。页面显示真实公仓/价格/种群/人物身份；刷新与重启不推进时间，没有旅行/交易/战斗写入口。崩溃锁不自动清理，不能删除其他实例的锁。D1全量184/184与真HTTP/双页签/断连重启通过，见[D1证据](tasks/D1-RUNTIME-SERVICE-READONLY-MAP-TASK.md)。共享机全回归建议给`node --test`加`--test-concurrency=2`，测试集保持完整。

D2A提供显式世界时间写入口，使用新的专用目录：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-d2a/my-world --port 18314 --writable true
```

页面可选择1小时/2小时/1天推进，生态、经济与NPC会真实结算；刷新仍纯读，过期页签409后重读，同请求重试或重启不会重复推进。世界与回执一起存盘。默认不加--writable仍只读；旧D1目录不隐式升级，可用明确--checkpoint初始化另一个新目录。初始化也占一档，因此每个实验目录最多127次新成功请求；满预算明确失败，不自动清理。正式提交之外的已知临时档保留但不加载，崩溃锁仍需明确处理；不承诺断电恢复。196/196及真实消费者已通过，见[D2A证据](tasks/D2A-TIME-COMMAND-COMMIT-TASK.md)。这不是玩家旅行/休整/交易或战斗入口。

D2B的玩家世界使用明确的新profile与新目录：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-d2b/my-world --profile player-village --port 18314 --writable true
# 已有这个目录时，恢复命令省略 --profile；不重设seed：
node runtime-server.mjs --data-dir artifacts/world-runtime-d2b/my-world --port 18314 --writable true
```

玩家是第四名实名居民，匿名76、总人口仍80；默认本人100金币/3粮/1药有真实分拨账，不借NPC钱包。页面显示本人状态与私货，活着有存粮时日结只吃本人一份；无私粮则增加本人饥饿，不自动拿公粮/用药。玩家死亡后私产与身份封存。公开世界与本人读数必须同revision，失配重读后仍不一致就保留上一份一致显示。`--profile`仅用于新目录，与`--checkpoint`互斥；不自动给旧世界新增玩家。仍默认只读，写需明确`--writable true`。当前238/238与真实双页签、跨档、隐私、资产守恒和恢复通过；丢锁/空档案明确拒绝、同类临时档保留恢复与非JSON错误意图处理已修，见[D2B收口](tasks/D2B-PLAYER-CONTRACT.md)。旅行、主动休整、交易和战斗仍待后续合同。

D2C新增旅行、主动休整和公仓真实买卖，仅新玩法profile开启：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-d2c/my-world --profile player-play-village --port 18314 --writable true
# 恢复同目录时省略 --profile：
node runtime-server.mjs --data-dir artifacts/world-runtime-d2c/my-world --port 18314 --writable true
```

旅行村庄↔森林耗120分钟、疲劳增加100；主动休整耗60分钟、疲劳减少100，不回血。买卖仅村庄、公仓粮/药，每笔1～10份耗10分钟，按完成时权威价整笔结算，真实转移金币与公私库存。午夜仍按原规则结算；途中死亡时耗时会保存，动作完成拒绝，页面明确区分。过期请求重读、未确认结果重试同一请求，不重复执行。默认及旧profile不隐式开启动作，真实存档不迁移。中控270/270、真实浏览器/CLI重启/硬退出恢复/旧C5字节对照通过，见[D2C收口证据](tasks/D2C-PLAY-CONTRACT.md)。D2门槛通过，战斗与完整场景连续仍待D3/D4；本轮测试服务已停止。

### M1：角色心智与只读检查器（已验收）

M1 新增独立 `mind-village` profile（service format 4），保留旧 profile 1/2/3；新建独立数据目录运行，不迁移 D2C 或其他真实存档。检查器默认关闭，`--inspect-mind true` 只开放只读调试页面和接口，不改变世界规则；`--writable true` 才允许时间推进和玩家动作提交，不提供心理字段编辑或实验输入入口。

首次启动新实验：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-m1/demo --profile mind-village --writable true --inspect-mind true --port 0
```

先确认将使用的新数据目录不存在。启动后从终端 `ready` 输出读取实际 URL，再打开该地址；地图具备 M 能力时可进入检查器，也可直接访问该 URL 的 `/runtime-mind.html`。只读模式可省略 `--writable true`；省略 `--inspect-mind true` 时检查器保持关闭（默认 `false`）。结束时在服务终端输入 `quit` 并回车，正常关闭本次服务。恢复同一服务目录时不要再传 `--profile`，原服务提交会按目录自动恢复：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-m1/demo --writable true --inspect-mind true --port 0
```

从明确 checkpoint 初始化另一个全新服务目录时，使用 `--checkpoint` 替代 `--profile`；两者不能同时传入：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-m1/from-checkpoint --checkpoint artifacts/world-runtime-m1/source/checkpoint-r24.json --writable true --inspect-mind true --port 0
```

端口 `0` 让系统分配空闲本机端口；若改用固定端口，先确认它空闲。`--writable true` 开启服务时间推进与玩家动作提交；该参数不允许编辑心理状态或提交实验刺激。

历史 M1 集成代码 `78303b4` 已通过中控验收，Goal边界测试 `3be94c6`；模拟/边界328/328、服务19/19、玩家/时间13/13、Goal边界1/1与真实浏览器均为当轮证据。原A/B/C分别 `d82bfd9`/`ca78d1c`/`45a2ccd`，已推送。证据在M1树 `artifacts/world-runtime-m1-controller-review-20261008`；38对存档/导出与12份合同兼容核对亦属历史结果。合同见 [M1 共同合同](tasks/M1-CHARACTER-MIND-CONTRACT.md)。本树当前M2状态见下文与 [当前状态](PROJECT_CONTEXT.md)。

### M2 本地集成状态

2026-10-08 17:40（Asia/Shanghai）：当前树 `D:\Narraverse-World-Map-m2-integration @ codex/world-runtime-m2-integration`，冻结验收HEAD `83826a82fea5c0edfe62aa3d676313eefe2a7790`；基准M1 `87aa9b6`，A1/A2/B/C均由中控验收，M2整体PASS。阶段全量57 simulation + export共58 files，Node24.14.0/concurrency2，401/401 pass、0 fail/skip/cancel/todo、exit0。C原30项red=29 pass/1 browser fail/0 skip；修后仅定向浏览器用例1 pass覆盖原失败，原29项未重跑。B四日UI与断连/迟到DTO保留通过，三条harness red保留。详见 `artifacts/world-runtime-m2-stage-closeout-20261008/result.json`、控制文档 `D:\Narraverse-World-Map-control\PROJECT_CONTEXT.md`。停止于M2，不启M3/D3、不合并main。Projects/push因应用网络权限撤销待同步，未声称远端已更新。

本地实验可使用新的数据目录；运行下面命令会启动一个服务，本轮没有代用户保持常驻实例：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-m2/demo --profile motivation-village --writable true --inspect-mind true --port 0
```

检查器只读，五种候选、当前职责、挂起计划和反事实均来自真实运行时；完整浏览器验收尚未通过。

```powershell
node simulation-runner.mjs --fixture clock-smoke --days 100 --seed 42 --out artifacts/simulation/run100
node simulation-runner.mjs --fixture clock-smoke --days 40 --seed 42 --out artifacts/simulation/run40
node simulation-runner.mjs --resume artifacts/simulation/run40/checkpoint-r5760.json --days 60 --out artifacts/simulation/resumed60
$simulationTests = @(Get-ChildItem -LiteralPath tests/simulation -Filter '*.test.mjs' -File | ForEach-Object FullName)
node --test @simulationTests tests/export-boundaries.test.mjs
```

输出目录必须是新的，已有目录即使为空也拒绝；需要重跑时另取名字。`--days`是新增天数，整数1～1000；seed默认42，0合法；恢复禁止另传seed/fixture，沿用完整RNG/队列/回执。fixture输入不随days变化。

产物为summary.json、完整有序inputs.json、events.csv和按revision命名的checkpoint。比较summary的stateHash/eventHash以及完整checkpoint状态/日志；耗时、内存、路径不参与哈希。代码SHA、dirty和sourceHash记录实际代码，不能用dirty运行假装精确HEAD。系统错误非零退出，保留最后成功tick；保存失败明确报错，不覆盖旧档或静默重置。

checkpoint采用同目录hard link独占发布，平台不支持时明确SAVE_FAILED；临时档不作为存档加载。clock-smoke仅测试资源和每日随机事实，完成100天不表示生态平衡、NPC智能或页面接入完成。产物放已忽略的artifacts目录，禁止上传用户真实存档。

### B1：离线资源账本

`resource-village` 是版本化资源实验：80人、粮食/药材生产消费与损耗、整数余量、容量损失、显式配置的外部流量。鹿狼为静态初值，价格与付费贸易尚未实现；不同seed的此确定性fixture应得到相同资源轨迹，RNG暂不使用。

```powershell
node simulation-runner.mjs --fixture resource-village --days 30 --seed 42 --out artifacts/simulation/resources30
node simulation-runner.mjs --resume artifacts/simulation/resources30/checkpoint-r4320.json --days 10 --out artifacts/simulation/resources40
```

额外导出 resource-config.json 与 economy.csv，逐日包含期初、生产/流入、需求/实际消费/缺口、流出/缺口、损耗、容量损失、期末和三种余量。金币保持不变。实验流量来自配置的flows，不是交互命令或付费贸易；inputs.json仍只表示Command队列/回执输入。保存与恢复会逐日复算账本并严格验证完整世界；配置指纹用于一致性检查，不是防恶意修改的数字签名。累计10000资源日为保护预算，不是性能承诺。见[B1合同](tasks/B1-RESOURCE-LEDGER-TASK.md)。

### B2：鹿狼、聚合捕猎与治疗

新规则b-ecology-v1保存种群收支、出生/死亡/捕食余量、狼食物压力、农田损失、健康劳动力和伤者。每天固定抽一个RNG样本，种群不自动回填；药实际消耗才能恢复伤者。食物少于5日口粮或有狼压力才捕猎，猎人来自未受伤且未分配给生产的剩余劳动力。这是聚合模型，未实现实名NPC、人口出生死亡、价格或付费贸易。

```powershell
node simulation-runner.mjs --fixture ecology-village --days 60 --seed 1 --out artifacts/simulation/ecology-base60
node simulation-runner.mjs --fixture ecology-deer-shock --days 60 --seed 1 --out artifacts/simulation/ecology-shock60
```

两fixture使用相同配置；shock仅在tick1440（第10天结算前）通过RemovePopulation命令移除90鹿，inputs.json保存该输入，超出当时存量时拒绝。产物新增ecology-config.json、population.csv、ecology.csv，并保留资源配置、资源账CSV与完整checkpoint。续跑沿用fixture、配置、输入回执和RNG，无另传seed/fixture。60天是示例，逐tick历史重算成本会随日志增长，B4长程性能尚未验收；需快速查看时先用--days 3。见[B2合同](tasks/B2-ECOLOGY-HUNTING-TASK.md)。

### B3：价格、付款与两日运输

b-market-v1在原生态/资源账上增加有界库存价格、金币付款、在途运力及路线状态。外部供应无限，采购要有金币和运输空间；出发付款锁价，2日后路线开放才能到货，关闭路线保留已付货物，恢复后只卸一次。没有免费补货、卖出/退款或随机货物损失。

```powershell
node simulation-runner.mjs --fixture market-shortage --days 4 --seed 0 --out artifacts/simulation/market4
node simulation-runner.mjs --fixture market-route-pause --days 2 --seed 0 --out artifacts/simulation/market-closed2
node simulation-runner.mjs --resume artifacts/simulation/market-closed2/checkpoint-r288.json --days 2 --out artifacts/simulation/market-reopened4
```

market-village使用原生态初值；shortage仅为粮100/药0/金币2000/伤者2，捕猎生产仍实际生效，不能把捕猎粮当成提前到货。route-pause在同配置上加第2日关闭、第4日开启命令，第3日到期货被保留。SetTradeRoute与RemovePopulation均有幂等回执、因果事实和整tick回退。

导出market-config.json、market.csv（逐商品报价）和trade.csv（订单/到货明细），保留原配置、population/ecology/economy.csv与完整checkpoint。trade.csv中cost为锁定订单成本，paidAmount仅ordered行为非零，到货为0，避免重复计付款。事实内生态子账金币行为采购前余额；economy.csv金币行合并当天付款为实际consumption，期末与snapshot余额一致；trade.csv单独记录每单付款。运输风险只加价；伤病只经消费改变价格，没有重复需求加价。见[B3合同](tasks/B3-MARKET-TRADE-TASK.md)。B4长程/多seed尚未验收，逐tick重算历史成本仍待解决。

### B4：私有推进会话与冻结实验

runner使用私有simulation session：入口与保存/加载全历史审计；无命令/调度的tick直接推进时钟，每个活动tick核对完整状态结构，并与规范规则从同一私有前态构造的完整候选一致。历史/私有状态深冻结，外部只能取复制bundle，无跳过校验参数。旧advanceOneTick保留为严格差分参考，不能把validateSnapshotStructure当存档审计。

旧market-village参数1000日pilot鹿狼最终灭绝，旧fixture与规则未修改。新b4-*实验参数依据seed42首次校准冻结，见[B4任务与冻结门槛](tasks/B4-LONG-RUN-ACCEPTANCE-TASK.md)。基线/轻扰动必须存活和恢复，严重扰动允许有账可解释的灭绝；完整阶段仍需矩阵通过。

```powershell
node simulation-runner.mjs --fixture b4-baseline --days 1000 --seed 42 --out artifacts/simulation/b4-base1000
node runtime/experiments/b4-experiments.mjs artifacts/simulation/b4-matrix-new
```

矩阵入口要求干净代码/冻结配置指纹，用固定5seeds及2个holdout执行100日快测/完整断点续跑、500/1000日基线、轻扰动恢复及重鹿扰动/药材短缺/贸易阻断配对，逐行独立核对种群、资源、现金、运力、订单、价格和事件。失败非零，不偷偷调门槛；全部实验输出在新目录，report.json只在全门槛通过时写passed。summary包含idle/activity ticks、实际源码指纹和末尾内存；1000日不是大人口压测。控制文档仍在main、代码保留任务分支。

### C1：实名人物份额与 Needs

actor-village在冻结b4-baseline上分出村长/猎人/商人三个持续身份：80人=匿名77+实名3，并非新增人口。实名者默认休息、不参与匿名劳动/捕猎；从同一笔粮药消费账分配实际份额（匿名优先、实名ID顺序），Needs由饥饿/健康/疲劳派生。没药不恢复，没粮导致饥饿伤害，死亡一次且保留ID墓碑，后续不消费/治疗，不再生成替身。

```powershell
node simulation-runner.mjs --fixture actor-village --days 100 --seed 42 --out artifacts/simulation/actors100
node simulation-runner.mjs --fixture actor-needs --days 4 --seed 0 --out artifacts/simulation/actors-needs4
node simulation-runner.mjs --fixture actor-shortage --days 10 --seed 0 --out artifacts/simulation/actors-shortage10
```

actor-needs只改变猎人的初始健康500/饥饿500/疲劳600，用真实药粮验证恢复；actor-shortage无粮生产/鹿粮收益/药生产/金币，初始村长濒危，用于验证饥饿死亡。额外导出actor-config.json、actors.csv和人口分层；原市场/资源/生态CSV与完整checkpoint仍保留。日事件保存实名逐人份额，存档/私有session从配置/命令/RNG重放完整身份、消费和墓碑；不猜B旧档升级。

当前C1需求每日一次，尚无Utility/Goal、自主工作或猎人行动、关系/记忆/完整LOD。[C1合同](tasks/C1-ACTOR-POPULATION-NEEDS-TASK.md)定义边界；后续C2再接实际人物行为。

### C2：猎人 Utility / Goal 与实际行动

c-hunter-v1每日评估一个自主猎人：缺粮/伤病/疲劳/钱包改变目标和步骤，实际Rest、WorkForPay、Hunt、BuyFood、BuyMedicine、UseMedicine走command-engine，具有inputSeq/幂等回执/事实。Goal跨日保存，20日截止、3次阻塞终止并冷却；外部不能伪造内部hunter-day-*命令。

```powershell
node simulation-runner.mjs --fixture hunter-recovery --days 20 --seed 42 --out artifacts/simulation/hunter-heal20
node simulation-runner.mjs --fixture hunter-hunger --days 10 --seed 1 --out artifacts/simulation/hunter-food10
node simulation-runner.mjs --fixture hunter-village --days 100 --seed 42 --out artifacts/simulation/hunter100
```

猎人的私人粮药和钱包有明确归属。初始私粮3从仓库移交；工资将公共金币份额转给钱包，内部购买将货物移到私人、现金归公共，world.gold仍是全聚落货币总量，不重复增减。公共市场不能花个人钱；私人药使用/吃饭不再扣仓库，使用另记私账。内部outflow不是外部出口，资源总账需加私人余量/消费；首版私人库存无损耗。捕猎扣同鹿群1只、私人粮20，风险受伤使用额外1个可恢复RNG样本；匿名猎人不包含该实名者。

hunter-recovery初始猎人health500、私粮20，实际演示缺钱→工作→买药→用药；hunter-hunger初始私粮0/hunger500，演示真正捕猎。额外hunter-config.json、hunter.csv（目标/私账）、actions.csv（命令/价格/工资/捕猎/伤损/回执），原Actor/市场/生态CSV及inputs/checkpoint保留。actors.csv食物是每人实际消费（自主猎人为私人粮）；economy.csv只记公用仓库，完整内部转移/使用事实在events.csv和hunter.csv/actions.csv。

当前只猎人自主；商人/村长仍默认休息，竞争在C3，关系/事实可知记忆在C4。未接UI/模型或旧存档，不能把C2标阶段C全部完成。见[C2合同](tasks/C2-HUNTER-UTILITY-GOAL-TASK.md)。

### C3：三人独立目标与最后一份资源

c-society-v1给村长/猎人/商人独立私账和Goal：先对同一快照规划，再按actorId提交重校验。两人抢最后1公药/20工资时只有首个合法提交成功，失败者不损钱货；系统异常则三人整个tick回退。村长有公共粮目标、猎人沿用真实捕猎链、商人持真实私药并转售给需要药的同村人物，不是换三个人名共用一个目标。

```powershell
node simulation-runner.mjs --fixture society-village --days 100 --seed 42 --out artifacts/simulation/society100
node simulation-runner.mjs --fixture society-medicine-race --days 4 --seed 0 --out artifacts/simulation/medicine-race4
node simulation-runner.mjs --fixture society-peer-sale --days 4 --seed 42 --out artifacts/simulation/peer-sale4
```

peer出售同时转移双方金币归属与药，公仓不再扣药，買方下一日使用；已拿到药或死者拒绝交易。总gold=公共金+三钱包，外采不能花私钱；资产/墓碑/Goal/阻塞失败都随存档持续。新增society-config.json、society.csv（每人目标/私账/peer账）、actions.csv（成功/拒绝、双方价格/现金），原Actor/市场/生态CSV与全部内部inputs/checkpoint保留。公仓outflow包含内部移交，完整资源总账须加三人私有余量/消费并扣除peer内部重复购买，不能当外部出口。

初始三人私粮各3从公仓移交，商人钱包100是初始聚落金币份额。C3仍每日最多一步、无记忆/关系/复杂寻路/AI；C4可知事实记忆后续，未验完整C阶段。见[C3合同](tasks/C3-SOCIETY-COMPETITION-TASK.md)。

## 原型历史说明（以下路径、端口与测试结论属于原项目阶段）

历史文档中的“移植正式版”是当时建议；本仓库现在作为独立项目发展，不自动执行该建议。

# 世界地图原型（骑砍式双层结构）· 2026-10-06

地址：http://127.0.0.1:18212/ （场景层 `/scene`，战斗层 `/battle`，个人面板 `/character`，交易 `/shop`）。启动：`Start-World.cmd`。
依赖：Laya 桥 8130（`../laya-torso-20261005/Start-LayaBridge.cmd`）——**离线时地图/场景/战斗照常可玩，只是没有 Laya 读数和躯干反应**。

评审：`REVIEW-2026-10-06.md`（代码缺陷）、`GAMEPLAY-REVIEW-2026-10-06.md`（游戏体验）。
移植到正式版的任务书：`HANDOFF-TO-PLATFORM-2026-10-06.md`（给另一位 AI，含模块 API、移植顺序、验收标准、禁区）。

## 日式 RPG 技能模块 + 战场特效层（2026-10-06 20:05，用户点名三件事）

用户原话：「战斗时候的攻击特效，还有受击动画等等再优化一下。还有那些剑气的粒子效果，嗯，要从左边释放到右边，现在的也还是奇怪得很，你再加一个技能模块，可以先往日式RPG那个方向。」

### 一、剑气为什么「奇怪得很」——根因是结构，不是画得不好

旧实现把特效画在两块 **220×146 的小画布**上，两块画布分别贴死在玩家和敌人身上（`fxP` / `fxE`）。这个结构下特效画得再漂亮也**飞不出那块画布**，所以剑气只能原地闪一下。另外 `kit/effects.js` 里 `jianyu`（剑雨）有一处死表达式：`x = W*(.08 + (i*1.3)%W/W)`，其中 `(i*1.3)%W/W` 恒 ≈ 0，七把剑实际落在同一列上。

修法是换掉载体，而不是调参数：

- 新增 `world-combat-fx.js`，用**一块覆盖整块战场的 canvas**，坐标全部归一化到 0..1，特效不再属于某个角色，而是属于战场。
- 投射物是「头 + 拖尾 + 沿途火星」，方向显式取左右——这就是「从左边释放到右边」能被保证的那一行：
  ```js
  const dirX = (b.x - a.x) >= 0 ? 1 : -1;
  ```
- 锚点 `anchor(x, 'chest' | 'ground' | 'high')`；玩家位 `P_X=0.30`、敌方位 `E_X=0.72`，所以出手一律左→右。
- `cast()` 返回 Promise，且带 `setTimeout` 超时守卫：画布被冻结、被隐藏、模块缺失时也**绝不会卡住回合**（`await` 不会锁死）。
- 支持种类：`jianqi / fengren / huoqiu / bingci / shuijian / leiji / jianyu / moyan`，缺 `SandboxDrawingKit` 时自动降到内置画法。

### 二、出手与受击动画

回合流程被改成一条完整的动作链：**起手式（聚气）→ 前冲 → 飞行 → 命中爆点 → 受击后仰**。之前是「点完按钮立刻掉血」，投射物还没到伤害就跳完了，观感上等于打空。现在伤害数字在投射物**抵达之后**才飘。

玩家和敌人共用同一套位移（`lunge` / `recoil` / `hitReact`），玩家走 `stage.setActor`，敌人是 StickArt 线稿、走 `enemyOffsetX` 像素偏移。命中帧叠上旧的打击感三件套：顿帧（`WorldFX.freeze`）+ 屏幕震动 + WebAudio 音效。

冲击闪光原来是**一层刷满全屏的白色 fillRect**（alpha 0.26），深色场景下整块战场被糊成灰、最该亮的命中点反而不亮。改成以命中点为圆心的径向绽放 + 一层极轻底光后，实测照亮像素从 285600（铺满）降到 43107，光晕落在敌方一侧（见下面连拍第 5 帧）。

### 三、技能模块（日式 RPG 方向）

新增 `world-skill.js`，按 JRPG 的常规结构搭：

- **属性 8 种**：无 / 斩 / 火 / 冰 / 雷 / 风 / 光 / 暗。克制关系放在 `MONSTER_TAGS` 里按怪物模板 id 配（有意放在技能模块而不是 BESTIARY，避开另一位 AI 正在重构的妖兽表）。
- **效果拔群 ×1.6 / 效果不佳 ×0.55**，命中时在战斗日志里明说，不做暗改。
- **真元 = MP**。所有技能带 `mp`，不够则按钮禁用。这是「真元」第一次成为真正的资源取舍，而不只是一根装饰条。
- **按等级习得**：`known(level)` / `newLearned(from, to)`。Lv1 三个（斩击 / 防御 / 力斩），Lv12 十个，Lv15 万剑诀，Lv20 雷神降临。
- **12 个技能**覆盖分段（`hits`）、穿透（`pierce`）、命中率（`acc`）、迟滞代价（`stagger`）、治疗与回元（`heal` / `healRate` / `mpGain`）、减伤（`mitigate`）。
- **异常状态**毒 / 灼烧 / 冻结 / 麻痹，回合末 DOT 结算；冻结额外让速度减半并参与先攻判定（`world-rpg.js` 的 `effSpeed` 已接上）。
- **不造第二套伤害公式**：技能只往既有的 `WorldRPG.damage`（hedra 式）里塞修正项。多段技用 `resolveHit` 分段结算——一段一段飞、一段一段飘字，MP 只在施放时扣一次。

### 验证

`skill-e2e.mjs` 的 P / P2 / Q / R / S / T / U / U2 / V 全绿：特效层覆盖整块战场（`coversView: true`）；特效像素质心 **0.432 → 0.696（`movedRight: true`）**，证明剑气真的从左侧飞到右侧；Lv12 面板列出 10 项、火球术提示「效果拔群！」、真元 36 → 28；毒挂上 `du:3` 并在回合末扣血；`known(1)` / `known(12)` / `newLearned(12,15)` 正确；掌心雷 3 段且日志出现「1 段落空」；400 次采样命中率约 0.155、会心约 0.08；`window.__errors` 为空。

回归：`game-e2e.mjs` A–J 十节全绿（背包、休整、存读档、区域定级、打击感 API 都在）。

`ctx-e2e.mjs` 的 K1/K2/K3 一度**误报**：地图从 990×560 扩到 1560×840 并加了摄像机后，脚本仍按旧尺寸做线性换算，右键落点整体偏移、全部掉进「空地」分支。改用页面自带的 `worldToScreen` 换算后，K1「迎战」、K2「拔刀相向」、K3 地点菜单全部恢复。**这不是游戏 bug，是测试脚本过期**——但结论是：凡是用世界坐标伪造右键事件的脚本，都必须走 `worldToScreen`。

连拍取证：`fx-shot.mjs` 抓一轮「剑气斩」的 6 连帧（`fx-shot-1..6.png`），每帧记录特效层重心与锋尖位置，左→右的位移可以直接从图上读出来。

### 四、实机翻车：可选依赖被写成了硬依赖（同晚 20:2x）

用户实机报：`战局没有找到技能：zhanji` / `战局没有找到技能：fangyu`，接着 `战局出现异常，已恢复行动：Cannot read properties of null (reading 'speedOf')`，连普攻都点不动。

两个原因叠在一起：

1. 正在跑的那个服务进程（`Start-World.cmd`，默认 18212）**启动得比我登记 `server.cjs` 名单还早**。Node 进程只在启动时读一次路由表，老进程眼里 `/world-skill.js` 永远不存在——页面拿到 404，`window.WorldSkill` 就是空的。我自己的验证实例是之后重启的，所以跑出来全绿，没有暴露这个问题。
2. `battle.html` 把一个**可选**模块当成了硬依赖：`const SK=window.WorldSkill||null`，SK 一为空，`playerAct` 就在「没有找到技能」那一步返回，连斩击都走不下去；第 554 行的 `SK.speedOf` 更是完全没做保护。

修了两处：

- `battle.html` 新增 `SKILL_FALLBACK`：最小降级实现，只有斩击／防御／力斩，数值照搬 `world-skill.js` 的前三个技能，伤害仍然走既有的 `WorldRPG.damage`（不另写公式），没有属性克制与异常状态。模块缺席时战斗照常打得动，技能面板还会明说现在为什么只有三式（`#fallbackNote`）。**原则：可选依赖必须有降级实现。**
- `server.cjs` 不再手工维护 `STATIC_JS` 名单：根目录下真实存在的 `.js` 直接发（仍然只收根级、只收 `.js`、排除 `server.cjs` 自身，`README.md` / `.mjs` 依旧 404）。这个坑踩了三次，而且它的第二层原因——**老进程不重读配置**——意味着「改名单」这件事本身就救不了正在跑的实例。

你的 18212 实例要**重启一次**才能拿到完整技能表（关掉那个 cmd 窗口，再跑一次 `Start-World.cmd`）。不重启也能玩，因为有降级实现。

验证：`fallback-e2e.mjs` 用 CDP 的 `Fetch.failRequest` 主动把这两个模块的请求掐掉，复现「模块缺失」现场——普攻造成 4 伤害、防御回 3 气血 + 4 真元、力斩造成 8 伤害并挂迟滞、面板显示降级提示、日志里既没有「没有找到技能」也没有「出现异常」、`window.__errors` 为空。

### 这轮故意没做

ATB 时间条、奥义 / 极限槽、召唤、队伍与人物切换。另外现在弱点直接写在技能菜单的提示里，日式 RPG 通常要先「调查」过敌人才显示——下一轮可以把这层探索感补上。

## 右键交互 + 文本 RP 呈现 + 场景内真打（2026-10-06 17:50，用户逐条点名）

### 一、世界地图也能用右键对单位的做事

此前地图只有「左键走过去」和「点地点图标旅行」，站在你面前的妖兽、散修都没有可交互的入口。现在右键任意对象都会就地弹出上下文菜单（`#ctxMenu`），按光标下是谁给不同选项：

- **妖兽**：迎战 / 后退脱离 / 打量。迎战直接进战斗页，并带上这只怪的模板、等级、名字、`mid` 和所在区域名；后退脱离让它自己走开一段；打量用小气泡报出它的等级、出没区域和与你相距几步（气泡 `#mapBubble` 4.6 秒后消失）。
- **散修**：搭话 / 打探消息 / 拔刀相向 / 打量。搭话与打探会把这句话送进 Laya 桥，按回来的敌意/合作读数决定他怎么回你（桥离线时降级为按心境给本地口吻）。
- **地点**：进入 / 交易（有 `shop` 服务时）/ 歇脚（有 `rest` 服务时）/ 打量；离得远时多一条「前往此处」。
- **空地**：走向此处 / 原地休整 / 打量（打量会告诉你这里属于哪个区域、妖兽等级带多少）。

菜单项都带 `disabled` 判断，`document` 上的 pointerdown 与窗口失焦会收起菜单。

### 二、文本 RP 的呈现按说话人拆开了

原来所有文本都被拍平成「角色：内容」的一行字符串，而且每次追加都整块重绘（丢滚动位置、所有行一起重播入场动画、日志只留 8 行）。现在：

- 每条是一行 `.sd-message`，内含 `.sd-who`（说话人）与 `.sd-line`（正文），按角色给样式：`is-user`（你说的话，右对齐，铜色右边框）、`is-ai`（模型叙述，铜色左边框）、`is-story`（补充叙述，虚线左边框）、`is-sys`（行动结果/世界记忆，弱化的虚线小框）、`is-warn`（系统报错）。不再有「角色：」前缀。
- 追加改为增量 append，不再整块重绘；`recordStory` 里改写走位那条日志也改成原地改那一行。
- **读数标签**：叙述行下方会贴一枚 `.sd-mood`，「掌柜 · 敌意 0.38 · 怀疑变化 2.0档」，跟页面上「Laya 读数」同一口径。读数比叙述晚到，所以标签由 `refreshMoodChips()` 在读数落地后回填——这里踩过一个坑：它必须在 `layaActors.set()` **之后**调用，否则第一次交互时 Map 里还没有这个 NPC，标签永远取不到值（表现为「标签功能像没做」）。

### 三、进了地点也能真打起来

场景层原本就有右键菜单，但人物的攻击项写着「攻击（演示）」，只把对方 hp 从 3 减到 2、播个受击动作，不合任何结算——这就是「进去以后攻击他们都没反应」。现在：

- 菜单项改成**拔刀相向**，点了跳战斗页 `/battle?kind=human&lv=<玩家等级>&name=<人物名>&loc=<地点名>&flag=<题材>&foe=<人物id>&back=<返回的 scene 地址>`。人形对手用 `BESTIARY` 里的 `human` 模板（`humanoid:true, noSpawn:true`——不参与地图随机刷新，只在被主动拔刀时出现），战斗页据此用火柴人而不是线条妖兽来画敌人。
- **打完回场景要看得见**：战斗页把结果写进 `world_state_v1` 的 `locFlags[flag]`——赢写 `defeated:<id>`，输或遁走写 `hostile:<id>`（拔了刀又跑，同样结怨）。场景页 `applyBattleMemory()` 在每次 `apply()` 后读这些标记：倒地的人自动切 `knockdown` 动作、`flow.people[id].hp=0`、菜单里对话/拔刀/偷窃置灰、`查看` 报「体力 0/3，已警觉」；结怨的人自动切 `guard` 并保持警觉。返回时报告栏与日志各写一条「世界记得：……」。
- 顺带把场景里的人形对手接到同一个战斗页，和地图上的妖兽共用一套回合制、真元、迟滞、掉落与经验结算。

验证 `ctx-e2e.mjs`（真实 Edge + CDP，与 `game-e2e.mjs` 并列，互不替代）：K1 妖兽菜单→迎战→战斗页 URL 与敌名一致；K2 散修菜单含拔刀相向→`kind=human` 且敌人用火柴人；K3 地点菜单与空地菜单；L 场景右键人物菜单是「拔刀相向」→跳转带上 `flag/foe/back`；M 打赢后 `locFlags.wuxia['defeated:host']=true`、回场景 `host` 动作为 `knockdown`、菜单三项置灰；N 日志行角色类与 `.sd-who`/`.sd-line` 拆分正确、无「角色：」前缀。`window.__errors` 为空。

写用例时踩到的：散修会在地图上走动，可能正好和某只妖兽重叠，右键按「妖兽优先」命中，导致用例不稳定——所以用例里先把两者分开再点（产品行为本身没问题，是测试要控制前提）。

## 游戏性补齐（2026-10-06 16:20，依据上面两份评审）

往返于「能跑通的演示」和「循环能闭合的最小可玩品」之间的那几处，本轮补上了：

- **真元**：`WorldRPG.SKILLS` 给出四个技能的真元收支（普攻 +2 / 重击 -5 / 防御 +4 / 遁走 -3）。此前技能零消耗，重击期望 1.44 严格优于普攻，玩家其实只有一个按钮。真元不足时按钮自动禁用。
- **先手与迟滞**：`turnOrder()` 真的接进了回合循环（此前零调用），`effSpeed` 会把重击挂的迟滞按 -8 计入，所以重击的代价存在。迟滞用 `_pendingStagger` 中转，下一轮才生效、那一轮末才清除。
- **装备属性进战斗**：战斗建角色改用 `WorldInv.totals()`，装备的 +hp / +qi 不再是死属性；消耗品回血上限同步改成 `totals().hp`。
- **世界状态持久化**：新增 `world-state.js`（单键 `world_state_v1`），地图的天/时辰/坐标/怪物、场景层写回的 NPC 记忆、世界日志都在里面。刷新不再洗牌，打死的怪会从地图上移除。
- **休整有代价**：野外休整消耗一份干粮，没干粮只能回一成；含 `rest` 服务的地点（山间客栈、空间站观测舱）免费且回满真元。此前休整完全免费，间接让半个背包失去意义。
- **铜币有出口**：新增 `/shop`（`shop.html` + `INV.buy()`），有 `shop` 服务的地点可进。此前金币只有进项。
- **败北有代价**：失三成铜币，并被商队救回（气血一半、真元一半）。

顺带修掉的：遁走按钮的 `clamp` 未定义（点了会整局锁死）、地图怪物等级写死、单 rAF 取代 setInterval 固定 dt（后台标签页会降速）、canvas DPR、`matchMedia` 每帧查询、`server.cjs` 的 `busy` 锁误伤 `/api/decide`、`X-Frame-Options: DENY` 换成 CSP `frame-ancestors`。

验证：`game-e2e.mjs`（真实 Edge + CDP），A 遁走 / B 真元 / H 迟滞跨轮 / C 先手 / D 商店 / E 休整代价 / F 持久化 / G 击杀移除与日志，全绿、`window.__errors` 为空。跑法见任务书第 5 节——记得给 Edge 加 `--no-proxy-server`。

## 区域定级 + 打击感（2026-10-06 16:40）

- **区域定级**：`WorldRPG.ZONES` 给出村口（Lv1-3）/ 山道（Lv4-8）/ 深山（Lv9-14）三条固定等级带，怪物等级取自所在区域而**不再跟着玩家走**——此前 `profile.level + 0~1` 让升到 Lv10 打 Lv10 和 Lv1 打 Lv1 一样难，成长感被抵消。区域圈画在地表上并标注等级带，HUD 显示当前区域，遭遇面板告诉你是在哪片地方被拦下的。现在可以回村口碾压，也可以越级进深山。
- 老存档的怪没有 `zoneId`，开局按坐标归区，否则区域补给会把它们当成「三区皆空」而不断增殖（实测一度涨到 6 只）。
- **打击感三件套**：新增 `world-fx.js`（零依赖），WebAudio 现场合成命中/重击/会心/格挡/受击/倒地/胜负/突破/铜币音效，配屏震（CSS 动画两档强度）与顿帧（命中瞬间停 70~120ms）。命中、挥空、格挡、受击、胜负、突破各有各的声音。全部调用都带 `if(window.WorldFX)` 守卫，模块缺失时页面照常工作。
- 坑：新的根级 .js 必须在 `server.cjs` 的 `STATIC_JS` 白名单里登记，否则页面拿到 404，表现为「某个全局 is not defined」——`world-beasts.js` 和 `world-fx.js` 都踩过，这次改成显式常量并写明提醒。

验证 `game-e2e.mjs` 增加 I（区域定级）与 J（打击感）：玩家 Lv3 时村口出 Lv1、山道 Lv4、深山 Lv14，与玩家等级无关；`zoneText` 随坐标切换；命中时 `isFrozen` 与屏震 class 同时为真，`window.__errors` 为空。

**还没做**（下一轮候选，按性价比排）：任务与委托（玩家仍然「不知道该干嘛」，这是最后一个断点）、突破境界三选一（成长仍无选择）、迷雾与随机事件（探索仍无惊喜）、时辰影响世界（现在只是数字在变）。

## 个人面板 + 背包装备（2026-10-06 深夜补充）

### 调研结论

- GitHub 搜索（inventory/equipment system, rpg inventory）：结果以 Unity/Godot 为主，
  **没有可独立复用的 vanilla-JS 背包库**（RPGJS 是整体框架）。故采纳
  **hedra-engine 的 Equip schema**（slot / required.level / statModifier{add}）作为数据模型，
  UI 胶水（~150 行）自写——这正是 kit 设计文档中"宿主层"的职责。
- **接入 SandboxDrawingKit**（`C:\Users\11\Doubao\chats\2026-10-05\new-chat\sandbox-drawing-kit-delivery`，
  190 组件全部通过确定性/性能校验的纯表现层，无依赖）：整包拷为 `kit/`（192KB，loadOrder 16 文件）。
  物品/装备图标、战斗怪物本体（wolf/goblin/golem 生物组件）、技能特效（剑气/剑雨/治疗/雷球）全部由 kit 绘制，零图片资产。

### 实现

- `world-inv.js`：物品目录（武器/防具/饰品/消耗品/材料，hedra 式 mods 加法修饰）、
  三槽装备（weapon/armor/accessory）、背包堆叠、装备/卸下/使用/出售、属性聚合 `INV.totals()`；
  掉落表 `dropRoll` 按等级加权（药/干粮/铁锭/武器/圆盾/光环）。
- `battle.html`：战斗属性改用 `INV.totals`（穿装生效）；胜利掉落直接入包并展示；
  **怪物本体换 kit 生物绘制**（狼=creature wolf，黑风寨贼=goblin，石魔=gołem），受击 hurt/死亡 dead 状态机；
  技能特效走 `K.drawEffect`（剑气斩=普攻，剑雨=重击，治疗=调息，雷击=嚎叫）——注意特效组件 `draw:null`，
  **不能用 drawEntity**，这是 kit 的独立试验接口。
- `/character` 个人面板：角色卡（等级/境界/气血/经验/铜币）、属性表（基础 vs 装备聚合高亮）、
  三槽装备栏（点击卸下）、背包格（点击装备/使用/出售）、战绩。
- 地图 actions 行加「个人面板 / 背包」入口。

### 验证（inv-e2e.mjs + win-path.mjs，全绿）

空背包→种入铁剑/疗伤药×2/圆盾→背包 3 格渲染（kit 图标）→装备铁剑：`gear.weapon='sword'`、攻击 2→4（面板高亮）
→战斗页 pMeta 攻 4（装备聚合生效）→扣血后使用疗伤药：11→19、库存 2→1。全程 0 页面错误。
截图：`e2e-character.png`（面板+图标）、`e2e-battle.png`（狼本体+剑气特效+会心飘字）。

### 画风统一（B 方案，2026-10-06 用户裁决）

用户反馈 kit 填色卡通生物与火柴人线条风不搭。裁决：**妖兽改用自写线条绘制器** `world-beasts.js`
（与火柴人同笔画语言：单色描边/圆头线条/极简几何；species 参数化 wolf/golem；状态机 idle/attack/hurt/howl/dead），
**人形敌人（黑风寨贼）还原引擎火柴人**（动作库齐全：attack/hit/knockdown/dodge）；kit 退回图标+特效+设施。
踩坑：①特效必须 K.drawEffect（draw=null）；②服务静态白名单漏 world-beasts.js→404→WorldBeasts undefined；
③facing 镜像：f=1 时头在 -x，'left' 应映射 f=1；④绘制盒底边必须压到引擎地面线 groundY=H-18。
⚠️ 本目录存在**并行会话同时开发**（真元系统/WorldState 桥/monsterFromTpl 均为并行会话所加），
编辑前先重读文件，保存后立即验证；battle.html 曾被编辑器旧缓冲覆盖回退过一次。

### 地图扩宽与 StickArt 妖兽（2026-10-06 第三轮，接豆包素材交付）

- **StickArt 接入**：豆包按我方合同交付的 7 只线条风妖兽（野狗/野猪崽/竹青蛇/黑熊/巨蟒/影狼/岩傀儡）
  整包拷为 stickart/ 目录（core+quad+serpent+village+mountain+deep 六文件，loadOrder 敏感），
  服务加 /stickart/* 路由；BESTIARY 七兽带 zone 与 artId 字段按区域出没，
  旧 wolf/golem 保留为 noSpawn 后备（老存档仍按 WorldBeasts 渲染）。
  battle 渲染链：artId→StickArt 优先，WorldBeasts 兜底，人形→引擎火柴人。
- **地图扩宽**：世界 990×560→**1560×840**，视口不变加**摄像机跟随**（draw 平移 -cam、点击换算 +cam）；
  地点 3→**5**（新增 青石集市=shop、深山古刹=深山歇脚点）；区域带按地理重摆并画在地表；
  新增**小地图**（140×76：地点/妖兽/区域圈/摄像机框）。踩坑：全局 canvas{width:100%} 会把
  小地图拉伸满屏（内容放大 7.4 倍），必须钉死 #minimap 尺寸。
- **场景扩容**：scene.html 新增 configs.market / configs.temple 两套场景（商贩/铁匠/庙祝/守山弟子）+
  主题下拉选项 + sceneInfo 条目；地图新地点 key 与场景主题一一对应。

### 右键菜单坐标修复（2026-10-06 用户实测反馈）

摄像机引入后右键目标整体偏移：contextmenu 处理器用 `*W/r.width`（放大 1.58 倍）且漏加 cam。
修成**双轨坐标**：sx/sy=屏幕坐标（菜单/气泡定位），wx/wy=世界坐标（+cam，目标判定/寻路）；
打量气泡统一走 `atScreen(p)`；wandererSay 同修；showCtx 的 clamp 一度被误改成 sx/sy（形参是 px/py），已修。
`__mapDebug` 增加 `worldToScreen/cam` 供自动化使用。
验证：fix4-e2e.mjs 三段全绿（野猪崽菜单 / 荒野菜单 / 打量气泡贴点击点）。

### 已知边界

- 装备无耐久/强化；掉落表是加权桩，未接"怪物图鉴专属掉落"；出售无商店页（面板内直接变现）。
- 战斗页怪物动作映射只有 alert/hurt/dead 三态（kit 生物动作更全，未逐一接）。

### 用户反馈修复（2026-10-06 深夜第二轮）

1. **场景里打人不倒地**：Laya 躯干补间每帧 `setCustomPose` 会把 commit 刚设置的 `hit/knockdown` 顶回 custom。
   修复：layaFrame 对播放瞬态动作（hit/knockdown/hurt/dodge/attack/cast…）的演员**让位跳帧**，动作结束后躯干自动恢复。
2. **战斗页怪物位置/朝向错误**：怪物画布浮在半空且朝向背离玩家。修复：画布改覆盖全舞台、
   绘制盒底边压到引擎地面线（H-18）、`facing` 翻转修正（kit 生物原生朝左，facing:'left' 反而向右）。
3. **伤害飘字看不见**：1s 动画太短。加长到 1.6s、字号 26、带 z-index。
4. 顺手清掉战斗页中间的默认 hero（createStage 自带）。
   验证：`fix3-e2e.mjs`（场景三连攻击后 knockdown 持续 3s 不被顶掉；战斗页飘字在 DOM、截图确认贴地与朝向）。

## 战斗与成长系统（2026-10-06 晚补充）

### 调研结论（为什么这样设计，不造轮子的依据）

- **采纳 `WhiteMinds/trial-tower`（MIT）的 hedra-engine 设计**：实体属性形状与等级缩放
  （maxHP = 10+level×5，atk = 1+level/4，速度定先手）、技能→结构化战斗日志、
  伤害 DamageEffect（base×multiplier+modifiers）、战利品=EXP+金币、onKill 结算。
  它是 TypeScript 工作区（yarn+lodash），不能直接 npm 进本原型，故**采纳公式与架构、以纯 JS 重写**（`world-rpg.js`，公式出处逐条写在文件头注释）。
- **本地基线对照**：xianxia-AI-town 的 combat.js 是减法伤害 `max(1, atk-def×0.5)×(1±10%)`，高防会归零；
  本原型改用比值式减伤 `100/(100+def×8)`（防越高收益递减），随机 ±10% 与暴击 8%×1.6。
- 完整 RPG 框架（RPGJS 等）与本沙盒栈不匹配，未采用。

### 玩法闭环

- 地图上妖兽 token（灰狼/黑风寨贼/石魔傀儡，按玩家等级缩放）自主游荡，接触 → 遭遇面板（迎战/后退脱离）；
- **`/battle` 回合制战斗**：速度定先手；技能=普通攻击/重击(×1.8·80%命中·迟滞)/防御调息(受伤减半+回3)/遁走(速度差判定)；
  怪物 AI 按权重出招（普通/猛扑/嚎叫加攻）。全部动作由火柴人动作库可视化（attack/charge/knockdown…），伤害飘字+战斗日志；
- **胜利**：EXP+铜币入账（经验曲线 `20×level^1.5`，境界表 练气→筑基→金丹→…→陆地神仙，境界提供攻击加成），
  升级即满血并按 hedra 缩放重算属性；**败北**：被拖回、气血减半、losses 计数；遁走：无惩罚脱离；
- 档案存 localStorage（`world_rpg_profile_v1`），地图左上成长面板（等级/境界/气血条/经验/铜币）实时读取；
  「原地休整」回血三成。

### 验证（rpg-e2e.mjs / win-path.mjs，全绿）

遭遇→迎战→回合影可视→胜/败两路结算入库（败：HP 10/19+losses 1；胜：+38EXP/+15铜/kills 1，无跳级）→
回地图面板持久。修复过程：战斗实体漏传 level 导致结算 NaN（已修+防御性消毒），步骤函数引用陷阱（setInterval 先捕获原引用，重构为单循环内挂点）。
截图：`e2e-battle.png`。

## C4：可知事实与关系实验

`memory-village`保存每人最多32条有来源的记忆，仅含本人、直接交易或村内公开事实。`memory-relations`和`memory-relations-control`使用相同资产与伤病，前者两次真实交易后少收2金币；`memory-medicine-race`验证最后一份公药竞争。人物上下文通过`buildActorKnowledge`白名单读取，不返回他人私账或全知日志。新增memory-config.json、memories.csv、relationships.csv；CSV包含每天保留状态，不按重复行累加信任。

```powershell
node simulation-runner.mjs --fixture memory-relations --days 8 --seed 42 --out artifacts/simulation/memory-relations8
node simulation-runner.mjs --fixture memory-village --days 100 --seed 42 --out artifacts/simulation/memory100
```

完整入口/保存/知识读取保持全量审计，私有session只对已验证历史增量推进。C4已验收；见[C4合同与验收](tasks/C4-KNOWABLE-MEMORY-RELATION-TASK.md)。

### C5：持久人格偏好

`personality-neutral/health/food`保持相同资产和伤病，以本人持久需求权重改变新目标的优先级，经真实命令扣款/转移货物，原Goal继续及失败冷却保留。新c-personality-v1/memory-config-v2显式版本，不迁移旧C4；额外输出personality-config.json。C5与C阶段已通过177/177、100日跨档、独立评分/资产消费者及旧C4存档字节兼容；见[C5合同](tasks/C5-PERSONALITY-CHOICE-TASK.md)。仍不代表页面、模型或完整心理网络完成。以下原型描述与历史E2E不代表新Runtime页面接入。

## 结构（用户提案：骑马与砍杀式两层 + 火柴人）

```
第一层 世界地图（index.html，新写）
  token 行走（点击地面/地点）· 时辰流动（旅行/休整消耗，按天进位）
  3 个地点节点 = 沙盒三题材（山间客栈/雨夜街角/空间站观测舱）
  散修 NPC 自主游荡；每次到达跑一次 Laya tick → 心境徽章（警惕/友善/平静）+ 底部读数
  桥状态灯 /healthz
      │ 点「进入」
      ▼
第二层 场景（scene.html = 18209 沙盒副本 + 补丁，不动 18209 原件）
  主题由 /scene?theme= 带入 · 头部「← 返回世界地图」
  ★ Laya 躯干反应：玩家对 NPC 说话/攻击/偷窃/自定义行动/AI 对话后，
    该轮文字 → /api/decide → 信号映射 lean/bend/head/手臂 → 60fps 补间 + 呼吸微动
  AI 开关自动配置（deepseek-flash，key 在服务端）；无 AI 时本地规则照旧
```

## server.cjs（18212，仅本机）

| 路由 | 作用 |
|---|---|
| GET / / /scene | 地图页 / 沙盒场景页 |
| GET /healthz | 桥状态透传 |
| POST /api/decide | 同源代理 → 8130；**中文先服务端直译**（无 effort，~1s，缓存）——绕开桥内推理循环 |
| GET /api/status · POST /api/config · /api/chat | 沙盒叙事接口（校验逻辑移植自 18209 原版 server.cjs），默认配置来自 fusion laya .env，可被表单覆盖 |

## 对 scene.html 的补丁（18209 原件未动）

1. 头部加「← 返回世界地图」；
2. `?theme=` 参数带入题材；
3. **execute() / modelTurn() 包装**：本地文字行动（analyze 命中或 intent 含 NPC 名）、菜单行动（talk/attack/steal→固定英文短语直传）、AI 对话（target 或按名字回退）都会触发 `layaDecide` → 对应 NPC 躯干；
4. 映射代码与 laya-torso-20261005 相同（对比拉伸 + 加大系数版）；
5. `window.__worldDebug` 调试出口（stage/current/laya/decide，供 CDP 验证）。

## 验证（world-e2e.mjs，全绿）

地图 → 点客栈（时辰推进到巳时）→ 进入山间客栈 → 本地对话「掌柜，听说山道上最近不太平？」→ 掌柜躯干 lean +0.50/bend +0.27/head +0.32（警觉弓背）→ AI 对话「来一碗热酒…」→ 新读数 hostility 0.409 → lean 更新 0.567。全程 0 页面错误。
截图：`e2e-map.png`（地图+散修读数）、`e2e-scene.png`（场景+掌柜躯干反应）。

## 已知边界（框架桩，故意没做）

- 地图 NPC 只有一名散修、心境只影响徽章，不影响其行为树；
- 时辰只被旅行/休整消耗，场景内行动不耗时间；
- 场景状态不回写世界地图（上下层状态桥是下一步）；
- 想换场景素材：沙盒三题材的 configs 在 scene.html 顶部，加地点即加 LOCS 数组项 + configs 项。
