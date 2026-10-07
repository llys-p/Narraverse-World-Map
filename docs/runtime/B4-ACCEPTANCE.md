# 阶段B：校准实验配置验收 PASS

2026-10-07（Asia/Shanghai）。源码 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-b4`，基准B3 ee480ea；验证实现 `8ef4d455d97e12fdf92ad343b7664c998a914b8e` / Node v24.14.0。只验收新实验fixture与明确边界内的生态经济，不代表页面/NPC/AI或大人口规模验收。源码不合并main。

## 实际证据

- 全部simulation及export-boundaries **98/98**（原90+session5+报告3）。入口/存档仍全历史重放；私有状态深冻结，空tick按命令/调度边界推进，活动tick完整规范候选对照；短跨度四规则与旧逐tick引擎深比较一致。保留旧公开advanceOneTick，无跳过验档开关。
- 冻结配置后实际CLI矩阵 **42次**：seed42基线/重鹿扰动/药短缺/贸易阻断100日、重复100与40+60完整checkpoint一致；固定seeds `[1,7,42,2026,65535]`各500/1000日基线及500日轻扰动、100日配对扰动；额外holdout `[31415,27182]`的1000日基线/500日轻扰动。
- 独立新进程重算全部summary状态/事件SHA-256、确认各运行同一干净代码/源码指纹、核对 **45,420行**资源CSV、付款/金币与存档一致，完整在途订单与原付款条款一致，另累计时钟溢出探针通过。不是仅采信report.json里的passed。

| 冻结门槛 | 实际结果 |
|---|---|
| 基线不灭绝、粮药缺口0；500/1000日期末鹿150..210、狼10..18 | 所有seed及holdout通过；鹿182，狼13/14 |
| 第10日移除30鹿，200日内恢复至移除前数量 | 7个seed均第49日恢复 |
| 第10日移除110鹿，100日内完整因果链 | 5个seed均出现狼压力→农田损失→捕猎/伤病→药消费/价格→付费延迟到货；严重干预允许鹿狼灭绝，有账可解释 |
| 同药材初值/产量配对，关闭贸易须阻断出发/卸货且恶化药缺口 | 开放缺口0，关闭累计缺口分别1099/1089/1099/1079/1099 |
| 1000日实际CLI≤60000ms | 最长12878.8999ms；内存仅末尾采样，未测峰值 |
| 同fixture/seed优化不能改变轨迹 | 旧B3闭路4日完整checkpoint字节相同、两哈希相同；同机采样13099.1306ms→259.9804ms，约50倍。并发条件不同，不宣称隔离基准倍率 |

1000日运行实际仅执行1000个业务tick，跳过143000个空tick，日志仍完整记录每日事实；不漏命令/周期，不重复死亡、到货或扣款。大量人口/复杂NPC性能未测。

## 校准与边界

旧market-village参数1000日pilot鹿狼均灭绝，首次压力第146日，不能据旧默认参数验收平衡。旧fixture/规则/历史结果保留。

新b4-*配置在seed42首次校准后冻结：鹿出生40/1000、狼出生3/1000（自然死亡3）、药初值8、每采药者生产1/8治疗单位/日、目标药库存12，其余B3参数不变。normal配置SHA-256 `f66f9dce1a8f74fd5e98c5d68706e76bd9e26644be8cd4d46783134e559d3761`；shortage配置仅药初值0/生产分子0，SHA-256 `3c70fcd22e0c9da515b3127943253004aa4ae833feae1968a233d3ef062b5ffa`。参数/门槛冻结在[B4合同](../../tasks/B4-LONG-RUN-ACCEPTANCE-TASK.md)，没有对剩余seed失败事后改线。

外部无限供给是显式开放边界，但每单有金币支付、运力、锁价和2日延迟；不存在免费保底补给或回填种群。人口固定80；聚合捕猎/伤病不等于实名NPC决策。基线不同seed的聚合轨迹相同是本模型的限制，随机样本/干预后轨迹仍可追踪，不伪造多样性。

runtime sourceHash `405ee7e0856e7b66f586755dbcf5ad6a799a72f11e15b1f3512df0dea2160cc3`。本地忽略目录 `artifacts/world-runtime-b4-acceptance-20261007/`保存pilot.json、performance-comparison.json、final-full-tests.txt、matrix/report.json、各运行CSV/checkpoint、verify-matrix.mjs、independent-verification.json；不上传运行产物。

复跑：干净任务分支执行 `node runtime/experiments/b4-experiments.mjs artifacts/simulation/B4_NEW_DIRECTORY`；已有输出目录拒绝，未过全部门槛不写passed报告。阶段B门槛通过，下一项C1身份/聚合份额/Needs，另开有界合同；不自动进入页面/模型或正式平台。

最终交接 `28c60d4858d98800a9d85b3cb99c3de2f38a8f61` 已推origin/codex/world-runtime-b4（末次仅文档同步）；最终干净seed42一天烟测和runtime源码指纹复核通过，源树干净。
