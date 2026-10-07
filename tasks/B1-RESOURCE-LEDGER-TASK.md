# B1：版本化配置与每日资源账本

2026-10-07（Asia/Shanghai）。本对话自行实施；代码基准 A4 `02cecea38697c9607a14c0098812b3df0c4ef14d`，源码目录 `D:\Narraverse-World-Map-a2`，任务分支 `codex/world-runtime-b1`。不合并 main、不接 UI/模型/旧存档。

## 固定合同

- 新规则 `b-resources-v1`、fixture `resource-village` v1、配置 `resource-config-v1`；累计资源结算最多10000天是保护预算、不是性能承诺；A 的 clock-smoke 保持兼容。B1 世界保存完整配置、资源、结算日、生产/消费/损耗余量及累计账本。只允许已注册版本和精确字段，未知/异类/非有限/负值/溢出拒绝。
- 固定聚落：80 人，60 名粮食生产者、4 名采药者、0 名伤者；鹿120、狼14仅为静态初值。粮食单位口粮份、药材治疗单位、金币最小货币单位。粮900、药80、金币20000；粮容量1800、药容量160。
- 每144 tick结算一次，首次tick144。粮每工人每日产8/5份、每人每日需求1份；药每采药者每日产3/8单位、每伤者需求1单位。粮/药损耗率分别5/1000、10/1000，金币B1不生产、不消费、不损耗。分数运算使用精确整数及持久余量，不依赖随机舍入。
- 顺序：期初→生产→显式外部流入→居民实际消费→显式外部流出→损耗→容量溢出。消费/流出不足记录未满足量，实际扣除不超过现存；容量溢出是有记录的损失。逐资源核对 `期末=期初+生产+流入-消费-流出-损耗-容量损失`，累计账本与初值对账。
- 外部流量是本 fixture 的预先声明实验输入，配置保存 `{day,resource,direction,amount}` 密集数组（最多1000条，food/herbs，in/out，正整数）。它们按日一次结算，导出完整配置供复现；不是付费交易、在途商品或自动救济。默认为空。B1 不开放跨单位 TransferResource 命令，真实扰动命令留B2、付费延迟交易留B3。
- 每天产生一条 `ResourceDaySettled` 事实，记录三个资源的期初、实际流量、需求/缺口、损耗、容量损失、期末和余量。恢复时核对完整历史与当前资源账，不接受漏日、重复结算、篡改余量/配置/事件；系统不能改写配置。生态只接受唯一固定的每日资源任务，其他任务留后续版本。
- runner显式注册两套fixture/规则；恢复只尝试已注册版本的严格校验，未知版本拒绝，不猜旧档。保留A产物，B额外导出 resource-config.json 和 economy.csv（日、资源、实际流量与缺口）。源码指纹包含所有新增模块。

## 验收

先红后绿：闭式账目、每日频率、小数余量、零人口/零库存、消费/流出受限、外部流入流出、容量损失、安全整数极值、坏配置/异类/密集数组、历史/配置篡改拒绝、失败tick无部分更新。真实fixture→scheduler→system→event→checkpoint→resume→runner链路通过；连续30天与12天存盘+18天续跑完整状态/事件相同，CLI实际产物和配置可复算。A1～A4和独立化边界全部回归。

B1不宣称生态平衡或阶段B完成，不执行B4的100/500/1000天平衡实验。记录观察指标：库存、生产/消费、未满足需求、外部流量、损耗/容量损失；基线暂不冻结平衡阈值。验收后更新唯一状态与Project2，再进入B2。

## 实施与验收收口：PASS

2026-10-07（Asia/Shanghai）。本对话自行实施并复核，未派外部执行者。实现 `6382ad5fc9945cf9a3cb68ce72cd63e2f61f9d19`，代码基准A4 02cecea；源码D:\Narraverse-World-Map-a2 @ codex/world-runtime-b1。新增core/resource-ledger与fixture/resource-village及两份测试，扩展world-state/event-log/command-engine的显式B规则合同，runner注册B fixture并导出资源配置/economy.csv。A1和checkpoint磁盘实现未改。

公开接口：defaultResourceConfig / createResourceWorld / settleResourceDay / validateResourceWorld / validateResourcePayload / validateResourceHistory，RESOURCE_RULES、MAX_RESOURCE_DAYS；fixture导出createResourceVillage(seed, simulationId, config)。settleResourceDay是纯函数，返回断开引用的world/payload；累计账本和事件均可从完整配置复算。

先红后绿：新增核心能力时ERR_MODULE_NOT_FOUND；真实CLI先因Unknown fixture失败；审查补充超量配置应先报LIMIT_EXCEEDED的反例，旧实现先复制元素导致返回INVALID_INPUT，已改为配置/世界/事件预算先验后复制。100001流量的64 MiB子进程立即拒绝，无OOM；10001资源事件同样提前拒绝。配置指纹是规范JSON一致性检查，不是数字签名。

最终干净6382ad5：Node v24.14.0，`node --test` 全部simulation测试及export-boundaries共70/70通过（原60+新增10），diff检查通过。30天连续与12天磁盘保存恢复+18天深比较完整snapshot/eventLog一致，跨档第13天流入和第29天流出各执行一次；坏余量档拒绝。真实CLI配置/CSV、未知版本/原A产物及失败路径回归通过。

新消费者干净提交实跑CLI10天 vs 4天checkpoint+6天，完整checkpoint和配置一致，30行economy.csv逐行BigInt核账。最终tick1440、10事实，粮1012、药87、金币20000。stateHash=bfaeef981a2374e954e748bf8c7700c2f4f5a684832e8fff1aae51296ac7d32c；eventHash=e2b9f498d54a80ee41103b4b2dd470b3d1bbbb45d1a90130e388b015e2cf12c5；resourceConfigHash=8db6bfefbf4680c355f621d2c2b351af822c918a86cd7cd67f1737eed8167663。

runtime sourceHash=49bc5f3718a744a75b33069c99c2341bbb7ee1e826c01ae70cc73b3e6612e2b0。本地忽略目录artifacts/world-runtime-b1-acceptance-20261007-1321保存full-tests.txt、consumer-probe.mjs、comparison.json与continuous10/prefix4/resumed6。10天约17秒，条件为同期完整回归；内存只在结束时采样，未测峰值。逐tick完整历史重算成本明显，B4长程前需优化验证策略并保持坏档、篡改、回退门槛。

只验收B1，阶段B仍进行中。无生态反馈/平衡、价格/付费延迟交易、实名人物或UI/AI接入结论；不合并源码main，不启停服务，不迁移真实存档。下一项B2固定鹿狼/捕猎因果规则后实施；B3/B4保持后续依赖。

最终交接 `f3aff786fae405f1b9196307a1110a0ccba88f84` 已推origin/codex/world-runtime-b1（末次仅文档同步）。最终干净提交seed0一天烟测通过，runtime源码指纹与上述验收一致；工作树干净。
