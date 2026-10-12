# D3-5A 内部 R3：真实引擎推进与重演

这是原 A 的内部工单，不是第三份阶段合同。行为以 D3-5A 公共合同及 rev2/rev3 为准。
R2 创建链已由中控验证；29/29 与旧回归41/41是执行者报告，本工单不机械重跑。
源码 HEAD f335abf，尚有R1/R2未提交代码；保护已有改动，不重写已正确部分。
工人领取前核对唯一写入者已停止；包工头仍负责原生任务板、模型路由和最终工单核对。

## 独立反例（已运行）

1. 新 fixture 创建后 validateBundle 接受 schema3、初始14狼。
2. createSimulationSession 新 bundle 报 UNSUPPORTED_VERSION: Session rules are not registered。
3. executeEncounterIntent 的 Travel 返回 tick12；validateBundle 发现 tick1任务仍未执行而拒绝。
4. 新 bundle 初始 rng.state 从42改43后，validateBundle 仍接受：重演复制终态RNG，未还原初始seed。
5. createSurvivalVillage 使用 defaultEncounterVillageConfig 后仍被接受为 m-survival-v1/memory-config-v5；
   旧规则匹配门已全局放宽，必须恢复原版本，只让新 ENCOUNTER_RULES 分支接新五版本。
29绿中的跨日用例直接调用 settleDay，不是命令真实跨144日界，不能替代以下门。

## 实施顺序

A. 接真实主循环：session规则注册、canonicalSystems/证明分派、活动tick与stimuli/request时间、
before/afterSystems、内部NPC动作、真实society系统日结。现新hooks的参数/职责未对齐旧snapshot
hooks；修正时复用真实survival/cognition行为，不把能力描述当beforeSystems返回上下文。

B. 外部DTO3入口驱动同一候选引擎：时长到期前推进所有真实tick，完成动作先于同tick日结，
接受零tick命令独立记账。不能把公开executeEncounterIntent从performTick递归调用而双推进/
双事件；domain apply与推进编排须有清楚边界。只有一个世界时钟/输入历史，不能再手加tick。
AdvanceTime、Travel/Rest/Buy/Sell继续真实旧结果/身体/资产/记忆规则，ACTIVE阻断按原合同。

C. revision=tick+instantCommits：真实tick推进和idle都保留offset，安全整数预检及故障整次不更新。
仅改performTick末行不足；禁止将零tickBegin人为变成1tick。所有其他旧规则仍revision=tick。
原子候选失败保旧bundle；不把真实时间事务中间态发布给调用方。

D. 完整重演从初始seed/config/scheduler/计数器开始，按实际DTO3和真实日结/RNG复放；
不能拿终态rng/tasks/pending等当初始值。比较完整bundle/全部事件/receipts/所有账与游标，
不只比EncounterCommandResolved或指纹。恢复旧profile版本门；新配置拒绝跨载旧规则。

## 独占写域与派工

生产只可改 command-engine.mjs、encounter-runtime.mjs、world-state.mjs、event-log.mjs、
fixtures/encounter-survival-village.mjs，以及必要的 motivation-runtime.mjs 新profile兼容；
这些均在原A白名单。无需改已完成配置层；发现真实新依赖先报具体位置与最小闭包。
主循环与runtime共用一个工人顺序写，勿在同文件开多工人；测试另一路只写
tests/simulation/encounter-replay.test.mjs（原A测试白名单），独立手算期望。
必要R2测试修正由原文件所有者在其停止后完成，不得因期望难通过而删弱断言。
只把本卡、合同相关段和局部源码交新短上下文工人，压缩前保存精确下一操作。
默认免费Global DeepSeek V4.1 Flash high；不得自动升级付费/Astra。

## 本工单停止门

- 真 session/DTO推进到144、报价tick1和actor2/3日结一次，最终完整validateBundle接受。
- 已接受零tickBegin→cancel产生offset2，后续idle/日结不丢；重复ID不再推进。
- 公共合同G3：t12 Travel、t137、t143第一攻920/150、t144日结→870、t149胜且870/0。
- G4：先日结死亡end144、狼300返还、receipt149/duration6拒绝；completion144先杀狼后人死不撤销。
- 完整连续/分段/重演一致；篡改初始RNG、日结、receipt、reservation、因果和来源都拒绝。
- 旧规则跨载新配置拒绝；只跑实际修改的直接旧回归，同字节已有证据不重复。
首个consumer通过即保存证据，再推进剩余门；不得内核绿即声称整A完成。
R3只交精确diff/指纹、真实命令与反例结果；不提交源码/push/main/部署，不做service/CLI/UI、
D4、安装或模型/Laya/旧18324运行数据。后续service/CLI/UI仍是原A必须交付，不在本R3抢做。
## 中控复验：R3 短返修（2026-10-12）

中控读取当前文件并运行独立消费者，R3不得按七绿直接收口。
已复现：合法Travel后的bundle、DTO后session idle、session后DTO、
以及真实870跨日完整validateBundle均报 INVALID_INPUT/System fact identity mismatch。
event-log 尚未在统一事实校验中识别 EncounterCommandResolved/EncounterTerminated，
落入旧系统事实分支要求commandId=null。领域validateHistory绿不能替代统一Bundle审计。

先完成这一最小修正，再进下一检查点：
1. event-log 在新 ENCOUNTER_RULES 专属分派校验两类领域事实与journal/真实day因果；
   旧系统事实身份门保持，不删除、catch忽略、跳过或以领域校验替代统一校验。
2. replay测试helper的validateHistory必须同时调用真实validateBundle(options)；
   保留七项手算与篡改期望。先记录新增统一门失败，再修生产，不能把坏日志当合法期望。
3. 补合规DTO结果→session idle与session推进→DTO的混合续跑直接检查；
   统一审计失败时修真实重演，不能禁止原已注册消费者或造额外DTO历史凑绿。
4. 主验收B的Harness.create只取fixture返回值.bundle，worldOf读bundle.snapshot.world、
   eventLog读bundle.eventLog、总狼读ecologyModel.populations.wolves。
   删除猜测多形状locator fallback；只改适配/明确路径，不改业务期望、篡改正文或skip门。
   生产fixture/execute保持原接口，不接受两形状，不给world加alias。
5. gate5 当前是JSON内存往返，不是磁盘checkpoint保存/重开。
   更正报告和该测试注释；不谎称保存恢复通过。真实checkpoint/store/reopen留下一消费者。

包工头先确认task22/23及返修写者已结束；新增写域仅 event-log、encounter-runtime、
tests/simulation/encounter-replay.test.mjs、
tests/simulation/encounter-integration-acceptance.test.mjs（均原A/B白名单）。
先单独补统一门与最小反例，别重读所有模板/重派完整六文件包。
可把B机械适配交另一独占写者；免费路由耗尽报确切原生错误，不无限重试/自动付费升级。
本次无source commit/push/main/部署，无scratch清理，旧probe文件保留。
停止于全部关键最终bundle统一校验接受、四类合法组合/七手算与篡改门维持；
实际checkpoint/服务/CLI/UI仍未验，B形状修正只能报准备完成，不报独立验收通过。