# A4：离线simulation-runner与阶段A收口

2026-10-07（Asia/Shanghai），本对话自行实施。依赖A3实际保存/恢复通过；代码基准取A3提交，不从只有控制文档的main取代码。

新增根目录 `simulation-runner.mjs`、`tests/simulation/runner.test.mjs`，必要修改README和.gitignore（仅新增模拟产物目录规则）。A1～A3只读，有缺陷先回归再修，不降低门槛。

CLI：`--fixture clock-smoke --days 1..1000 --seed uint32 --out 新目录`；seed默认42。或 `--resume 显式checkpoint路径 --days 1..1000 --out 另一个新目录`，resume禁止seed/fixture。days指新增天数；fixture初始数据不随本次days变化。simulationId新建固定为fixture/seed组合，恢复沿用原ID。

严格拒绝未知/重复/缺值参数与非法整数。输出目录独占新建，已有目录拒绝，文件全部wx，不覆盖。格式：summary.json、inputs.json、events.csv、完整checkpoint。失败退出非零，保留最后成功tick的checkpoint及失败summary（存盘本身失败则明确失败，不能报告保存成功）。不处理真实存档、UI、模型、网络或后台常驻服务。

summary记录代码SHA/dirty、实际runtime源码指纹、Node/fixture/rulesVersion、seed、起止tick、完整状态/事件规范JSON SHA-256、失败tick/原因、耗时/内存、checkpoint路径。宿主测量/路径不入状态哈希。Git不可用标缺失，不伪造clean/SHA。inputs由pending+receipt按inputSeq完整导出；CSV含完整事件字段，字符串正确转义。

导出 `parseArguments(argv)` 和异步 `runSimulation(options, hooks?)` 供真实消费者测试。hooks只用于测试注入系统失败，summary明确标systemOverride；命令行不开放hook。导入runner不能自动运行。

验收：CLI真实输出；参数/坏档/已有目录非零退出；失败tick回退且最后成功checkpoint可加载；连续100天与40天保存加载+60天完整snapshot/eventLog及两哈希一致；不同seed不冒充同轨迹；A1～A3、分块与磁盘故障回归通过。阶段A全部门槛通过才标已验收，结果仅为模拟底座，B生态经济未开始。

精确提交并推codex/world-runtime-a4，更新PROJECT_CONTEXT及Project2；不自动合并main、部署页面或开始B。后续B需要先固定业务schema、单位和公式。

## 验收收口：PASS

2026-10-07（Asia/Shanghai）。A3基准cac590cb6436f15ac16d5c548f298db3c4ecfdd1；A4实现796b483d4ca431fef3a90b5ae2b71be6cf16336b；最终交接02cecea38697c9607a14c0098812b3df0c4ef14d（仅状态文档收口）。源码路径D:\Narraverse-World-Map-a2、分支codex/world-runtime-a4，已推origin，未合并main。

全部simulation+export-boundaries共60/60通过，diff检查通过。包含A1原行为、A2严格输入/命令/整tick回退/内存分块、A3真实磁盘坏档/故障/不覆盖及100天断点续跑、A4真实CLI参数/产物/失败保存。新的消费者探针及磁盘close错误分类通过。

真实CLI在干净796b483 / Node v24.14.0执行：连续100天、40天、加载40天checkpoint再60天。完整checkpoint（snapshot+eventLog）和inputs深比较相同，最终tick14400、103事件；stateHash=`da5ba5eecafef903340907a2546fed191959431baa48d348b7b30954ae9471b0`，eventHash=`e814ac251d4e21e43868ddd411bad729292e665bdcc860640cac9ba67a59d297`。

runtime sourceHash=`d972e092055782e36dedcbf718d2d9c45c6af452474835f4762c71631009d7b4`。最终02cecea上的干净seed0一天烟测通过、源码指纹相同；文档提交没有改变验证逻辑。

实际证据在源码树已忽略目录artifacts/world-runtime-a-acceptance-20261007-1258：comparison.json、continuous100、prefix40、resumed60、final-clean-smoke。不上传这些运行产物。100天约46秒；内存为summary结束时采样，未测真实峰值，不能从该fixture推断规模性能。

阶段A门槛通过。B生态经济、NPC/玩法/AI/平台接入均未验收；未启停既有服务、调用模型或迁移旧存档。下一步进入B前定义具体业务合同，不把此smoke当100天生态平衡。
