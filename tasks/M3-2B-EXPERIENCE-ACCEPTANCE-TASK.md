# M3-2B：本人 Work 经验消费独立验收

合同版本：m3-experience-runtime-contract-v1；共同合同唯一权威见 [M3-2A §共同合同](M3-2A-EXPERIENCE-RUNTIME-TASK.md#共同合同唯一权威版本)。状态：待派发/未开工。合同发布 SHA：由中控提交后填写。

## 给用户看

独立验证人物是否从自己的 WorkForPay 权威结果学习，并在后续选择中使用经历；检查错误关联、重复消费、日结顺序、存档恢复篡改和旧 M2 兼容。本项只新增验收测试，不修生产实现，不把作者自报测试数当裁定。中控核对证据后决定 PASS/NEED REVISION；本路通过不代表完整 M3 验收。

## Reference Review

共同设计边界和来源审阅见 [M3-2A Reference Review](M3-2A-EXPERIENCE-RUNTIME-TASK.md#reference-review)。本路按共同合同独立验收，不增加外部项目事实或另立规则。

## 基准、工作树与所有权

- 唯一起点：`D:\Narraverse-World-Map-m3-base`，分支 `codex/world-runtime-m3-base`，基准 `fe1dec0f3ee2ca4560438d268ae90a73cb3199db`。M3-1冻结文件字节已对齐；本任务不重跑历史内核测试。
- 专用工作树：`D:\Narraverse-World-Map-m3-acceptance`，分支 `codex/world-runtime-m3-acceptance`。创建前核实路径不存在且分支未占用；如存在先查归属和脏状态，不覆盖或重置。不得从 main 复制。
- 白名单仅新增 `tests/simulation/experience-acceptance.test.mjs` 与 `tests/simulation/experience-runner-acceptance.test.mjs`。不修改生产、helper、既有测试或合同文件。
- 测试设计/机械操作委派 high 推理子代理；两份测试文件只给一名写入者，生产实现由 A 路唯一所有者负责。
- 先从共同合同独立写 expected、静态断言、recipe 和篡改案例；可在缺生产实现时验证测试能正确报告依赖未到，但不把失败测试提交成永久 skip。
- 可先独立编写 B 测试并保持未提交，或提交自己的测试文件后再导入依赖。中控派发 A 路精确代码 SHA 后，再导入该 SHA 指定的生产与 A 测试字节，记录实际依赖 HEAD。B 本人白名单以本人提交的差异核对，仅新增本路两个测试文件；若测试是在依赖导入后提交，则使用依赖导入完成 SHA..B 交付 SHA 核对。A 继承的生产改动单独列为依赖，不计入 B 作者修改。若导入与 B 修改冲突，交中控处理，不自行篡改 A。不得使用 main 或任意最新工作树；A SHA 未派发前不猜填、不运行依赖性验收。
- 若依赖缺失，仅精确的 ERR_MODULE_NOT_FOUND 可标记“待跑”；SyntaxError、断言失败和运行缺陷均是未通过证据，不吞错、不伪造 mock pass。

## 独立性、错误码与证据

- E1–E7 expected 独立手算，或来自冻结 M2 源码/独立 recipe；禁止由被测 planner、runtime 或导出文件自产 expected。
- 真实链至少覆盖 recipe → 输入/命令 → authority → events/receipts → kernel/history → decision → save/full restore。纯 planner 配对只证明局部评分。
- 对新增公共函数的 knowledge/config/model 和既有 public 入口的新规则 raw bundle/snapshot/eventLog/pendingCommands/commandReceipts，检查完整树在共享 cloneData/canonicalJson 前已做 descriptor 预检（含继承数组 map 等方法 getter）且 getterCalls=0；之后才做字节预算与业务校验。仅保护白名单内新规则路径，不改共享 data-contract，也不宣称旧规则整体同样安全。
- 模块非法输入/坏关联为 INVALID_INPUT，未知版本为 UNSUPPORTED_VERSION，预算越界为 LIMIT_EXCEEDED。按当前 checkpoint-store 行为，loadCheckpoint 对 UNSUPPORTED_VERSION 与 LIMIT_EXCEEDED 保留原码直接抛出；其他结构/历史错误包装为 INVALID_CHECKPOINT 并保留 cause。不得把所有磁盘错误统一期待为 INVALID_CHECKPOINT。
- Planned 事件的 event.commandId 必须为 null；其 payload.choice 表示 action。非 NoAction 时，payload.decisionId 与 Resolved.commandId 对齐。成功 receipt.result 与 SocietyActionCommitted.payload 必须完整 canonical 相等；Resolved outcome 是另一种 DTO，按 status/code/delta 等字段语义核对，不能把两种关系混为一谈。
- 验收回执保留命令、exit code、pass/fail/skip 数、实际依赖 SHA、B commit SHA、证据路径，以及每个拒绝反例的 expected/actual。明确区分环境缺依赖、测试自身问题、真实实现缺陷和未覆盖项。

## 验收范围

**E1 候选消费与计划保护。** 同一新 knowledge 配对空经历/penalty=100，Work score 710→610，UseMedicine 700 不变、其余候选逐字段不变；committed gate 继续保护计划；soft-ineligible 不改分。useWorkExperience=false 仍观察/保存本人事实，只关闭惩罚消费；该对照不要求与旧 M2 存档字节相等。

**E2 真实拒付闭环。** A0 先用既有 M2 fixture 和真实输入核 recipe/authority/物理可达性；新 profile 接入后再按 A2 实现执行完整场景。tick288 本人 Work RULE_REJECTED 后应有唯一 Resolved→Observed 和 kernel sample；tick432 新 decision 消费该真实样本，由 authority 成功 UseMedicine。false 对照仍记录事实但 Work=710；核对同日 proposals 已冻结、temporary failure 状态及第三日起真实 world 分歧。不得改物理规则凑场景。

**E3 成功窗口。** 默认新 profile 第二日真实 Work 成功、sampleCount=1/penalty=0；富裕 recipe 至少五次本人真实 Work 成功、Rest 不学习，最终四窗引用真实递增 event seq/receipt。旧 kernel 序列 F,F,S,S,S,S 对应 penalty 100,200,200,200,100,0，仅是已验收公式，不是本轮六个运行事实。

**E4 因果、身份、幂等与事件顺序。** 他人、非 Work、NoAction 不学习；坏 planned/resolved/receipt 报错而非 null。去重按真实 resolvedEventSeq 与同一权威 command/receipt 关联，不按职责 requestId：同一 request 在不同日期生成新 decision/command/resolved 时，每个合法本人 Work 结果都学习一次。kernel 窗口内同 sourceEventSeq 且完整九字段 outcome 一致才是幂等 duplicate；同 seq 关联或投影被篡改必须拒绝，淘汰的旧 seq 拒绝，且不新增无界 seen-set。同一权威 command 不多发 Observed，历史 decision/view 不改。核对 planned → chief commit → authority → resolved → 即时 Observed → settle，cause/entity/command/sourceSystem/payload 精确，Work Resolved 与 Observed 一对一，sealed 后 mind/motivation/experience cursor 均等 nextEventSeq-1。死亡人物不复活、不再学习，但本人历史 state 保留。

**E5 连续、分段与 CLI 恢复。** 同 seed 连续432 ticks 对比200+232与288+144，默认576对比288+288；CLI两日 checkpoint 后 resume 两日，比较业务 bundle/config/inputs/适用 JSON/CSV。只沿用已有 summary.json；排除 source identity、startTick、elapsed、memory、executionStats 等运行元数据，不要求整份 summary 字节一致。检查新增 experienceConfigHash 与 workExperienceHash 及其对应业务文件正确。

**E6 篡改与 rollback。** 覆盖共同合同列出的 sample 身份/seq/tick/status/penalty/refs、flag/fingerprint、decision knowledge/score/opposition/gate、Observed 缺失/重复/wrong cause、receipt result、step/cursor/IDs/RNG。hash 重算不能绕过 full replay；checkpoint 的结构/历史错误为 INVALID_CHECKPOINT（cause 保留），版本与预算错误按上述原码例外处理。post-learning fault/budget overflow 必须整 tick rollback。

**E7 旧 profile 兼容。** 旧 M2 默认四日须对照未改的冻结 M2 源码与既有有效证据；不得声称以下 oracle 含 M2 默认四日。中控提供的只读 oracle 路径为 `D:\Narraverse-World-Map-m2-acceptance\artifacts\world-runtime-m2-acceptance-repair-20261008\legacy-oracle-87aa9b6-v2.json`，RAW SHA256 `e7fee8c0bd872a8294615172dd4ee7fef6e6464663d2df9fc4099d9261221b18`，schema 2 baseline `87aa9b605f5f509ce3b0daa97e34ded004d22f33`，canonical `{scenarioSpecs,provenance,results}` payload SHA256 `1ebe129b1a252434e8b103796778f3b71f9ffc6587cb0578f8ea7828d6c87f67`。验收先核 RAW 与 payload 指纹再只读消费，不重建、覆盖或提交 artifact；跨机器缺文件由中控单独提供，缺失则将 oracle 项标待验。D2C 六操作是一次 m1a-buy-food quantity=2 → sell herbs=1 → forest → rest → village → advance144，终 tick=176；C5 为 createPersonalityHealth(42,"personality-health-seed-42") 推进576 ticks。HTTP 归档字段不复跑。只补新共享底座直接受影响的 engine/session（实现在 command-engine）、world-state、event-log、checkpoint 定向回归。M3-1四冻结文件未变则不重跑其测试，也不在本路跑数百项全套 suite。

## 测试文件分工与执行

- `tests/simulation/experience-acceptance.test.mjs`：独立 planner 期待、adapter 因果反例、runtime 日界事件/cursor、坏输入和 rollback。
- `tests/simulation/experience-runner-acceptance.test.mjs`：真实 CLI、checkpoint/resume、业务文件哈希/内容对照、旧 profile 和历史 oracle。
- 等待 A SHA 派发期间，先完成独立断言与 fixtures 设计，明确哪些结果可静态验证、哪些必须等真实生产实现；依赖未到时只记录精确 ERR_MODULE_NOT_FOUND 与待跑门，不降低门槛，不把占位断言或 skip 当通过。
- A SHA 到达后确认工作树 HEAD/文件内容与指派 SHA 对齐；运行两份测试和必要消费者命令。失败后先保存原始输出与最小复现，再判定实现缺陷或环境问题。修订测试 expected 必须有独立来源和理由，不能为适配生产输出而改。

## 命令、停止与交付

在指定 A SHA 依赖就绪后运行：

    node --test tests/simulation/experience-acceptance.test.mjs
    node --test tests/simulation/experience-runner-acceptance.test.mjs
    git diff --check

如需单独检查直接消费者，记录真实命令和产物；不要重复无关全量。交回工作树/分支、A 实际依赖 SHA、B 本地精确 commit、各命令数字结果、expected/actual 与证据路径、PASS/NEED REVISION 建议和未验证范围。缺依赖时交回待跑清单和精确错误，不声称通过。

本路完成后停止交中控裁定；不改 A 文件、不合并 main、不 push、不部署、不接 HTTP/UI/M3-3/D3/D4。M3-2A/B 当前待派发/未开工，M3-3待设计，完整 M3未验收。
