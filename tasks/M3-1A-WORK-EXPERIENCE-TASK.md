# M3-1A：本人工作执行经验内核

合同版本：`m3-kernels-contract-v1`。状态：中控裁定 PASS/本地已验收（仅内核）。合同发布 SHA：`8282a135a85967818c39a6289cd1a0e7dcec769d`。

## 给用户看

让人物只从自己的 WorkForPay 权威执行结果中积累一段很短的经历。最近四次结果里失败越多，后续工作候选受到的实验性阻力越大；新的真实成功会逐步纠正旧失败的影响。它只改变未来 M3-2 接入时可读取的工作经历读数，不代表人物真的改变了计划、采取了行动或形成了心理判断。

本项只做 M3-1 纯内核。运行时接入、经历如何从真实命令/回执构造、完整 M3 体验另行派发。完成本任务不代表 M3 已通过。

## Reference Review

- 问题：如何让经历保持在可核验的本人事实范围内，并允许新事实纠正当前摘要而不改写旧事实或旧决定。
- 主要边界：参考库冻结对象 `b0b13a3baccf0d26fae167f7827930a1df995876` 的 `docs/reference-library/PATTERN-DECISIONS.md` 中 PAT-009「World Fact != Subjective State」：canonical fact 不因人物判断而改变；后来证据可以纠正当前判断，但不能改写过去决策的冻结依据。此次是基于控制库本地 Git 对象的目录/模式审阅。
- 采用：仅借 PAT-009 的事实与解释分离原则。此内核记录 WorkForPay 成功或权威拒绝的窄事实投影，再以确定公式派生当前有限窗口读数。
- 不采用：不增加疲劳、伤害、现金、信任、拒绝原因推断、心理状态、时间衰减、先验或 AI 推理；不扩成通用记忆系统。
- 来源边界：参考库协议、PATTERN-DECISIONS、MODULE-INDEX 已在上述本地 Git 对象中阅读。没有核验或运行外部游戏源码，不声称外部游戏实现了此规则。Code copied：no。

## 基准、目录与所有权

- 控制文档目录：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`，合同发布提交 `8282a135a85967818c39a6289cd1a0e7dcec769d`。
- 唯一代码交接基准：`D:\Narraverse-World-Map-m2-integration`，分支 `codex/world-runtime-m2-integration`，本地基准 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9`。冻结 M2 验收代码 SHA `83826a82fea5c0edfe62aa3d676313eefe2a7790` 与该基准仅 README/PROJECT_CONTEXT 不同；M2 历史 401/401 不重跑，也不把该历史结果当本任务验证。
- 从本地 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9` 建立专用工作树：`D:\Narraverse-World-Map-m3-experience`，分支 `codex/world-runtime-m3-experience`。创建前核实路径不存在，且分支未被其他工作树占用；若已存在，先确认其归属与实际状态，不覆盖、不重置、不挪用。
- 不从 `main` 或其他工作树复制 runtime；不碰已验收 integration 树、B 路工作树或他人数据。A/B 互不导入，不新增 helper。
- 允许新增且仅允许新增：
  - `runtime/core/work-experience.mjs`
  - `tests/simulation/work-experience.test.mjs`
- 唯一允许的只读 import：`./data-contract.mjs`。不得修改该模块或其他既有生产、测试、合同、状态及看板文件。
- 中控在指定提交 SHA 上独立定向补反例。任务执行者提交精确本地代码 commit，不 push、不合并 main、不部署；控制库发布合同 SHA 见本任务顶部。
- 测试与机械批处理交给本路子代理，推理程度统一 high；明确分配本路测试文件的唯一所有权，测试者不修改生产模块。验证时冻结被测代码，按实际 SHA 和真实命令交回证据。

## 精确公共接口与 DTO

`runtime/core/work-experience.mjs` 必须同步导出且只增加本任务约定的公共符号：

```js
WORK_EXPERIENCE_STATE_VERSION = 'work-experience-state-v1'
WORK_EXPERIENCE_VIEW_VERSION = 'work-experience-view-v1'
MAX_WORK_EXPERIENCE_SAMPLES = 4
MAX_WORK_EXPERIENCE_STATE_BYTES = 8192
MAX_WORK_EXPERIENCE_OUTCOME_BYTES = 2048
WORK_EXPERIENCE_PENALTY_STEP = 100
MAX_WORK_EXPERIENCE_PENALTY = 300

createWorkExperienceState(simulationId, actorId)
validateWorkExperienceState(state)
observeWorkOutcome(state, outcome)
deriveWorkExperience(state)
```

`actorId` 仅允许 `actor-2`、`actor-3`；`simulationId` 按现有 `data-contract.mjs` identifier 规则校验（≤64 字符）。tick 是通用正安全整数，不要求 tick 位于日界。

新状态精确为 `{ version, simulationId, actorId, samples: [] }`。状态顶层及各 outcome 键集合严格匹配下列定义，不接受额外键：

```js
outcome = {
  simulationId, actorId, sourceEventSeq, occurrenceTick,
  decisionId, commandId, action: 'WorkForPay',
  status: 'succeeded' | 'rejected',
  code: null | 'RULE_REJECTED'
}
```

`sourceEventSeq` 与 `occurrenceTick` 均为 ≥1 的安全整数；`decisionId`、`commandId` 使用既有 identifier 规则。成功必须 `code: null`，拒绝必须 `code: 'RULE_REJECTED'`。样本只能是上述完整窄 DTO，按 `sourceEventSeq` 严格递增、`occurrenceTick` 非递减；当前四条窗口内 `commandId` 和 `decisionId` 各自唯一。state 的 simulation/actor 必须与每条样本完全一致。初始 state 的样本为空。

该 DTO 是将来 adapter 的输入形状，不证明事件真实发生。`sourceEventSeq` 对应 `MotivationDecisionResolved.eventSeq`；`action` 是通过关联 Planned.choice 得到的唯一投影，因为 Resolved payload 自身不含 action。M3-2 adapter 必须核对 planned/outcome/command/receipt 的关联：成功 receipt 与 `SocietyActionCommitted` 一致；拒绝 receipt 的 `eventSeqs=[]`，仍须关联到 Resolved。M3-1 不写 adapter，也不从世界对象、事件全文或其他 actor 私账构造事实。

调用者必须先筛选本人 `WorkForPay` 的 `succeeded` 或权威 `RULE_REJECTED`。非 WorkForPay 与 NoAction 输入均为 `INVALID_INPUT`；内核不把 NoAction、等待或普通日结当作失败样本。

## 算法与错误语义

- `createWorkExperienceState(simulationId, actorId)` 返回独立的新空状态。
- `validateWorkExperienceState(state)` 严格验证版本、精确键、嵌套形状、排序、身份一致性、窗口长度与字节预算；成功按约定返回原参数 `state`，不得偷偷重置无效 state。
- `observeWorkOutcome(state, outcome)` 先完整校验两项输入和预算，再返回 `{ state, disposition: 'learned' | 'duplicate' }`。不原地修改输入；返回 state 与输入、 outcome 均脱离对象引用。
- 若 `sourceEventSeq` 仍在当前窗口，且规范化后的完整窄投影相同（对象键顺序不影响比较），返回 `duplicate`，state 内容保持原样。相同 seq 的不同 payload 拒绝 `INVALID_INPUT`。
- 若输入 seq 已被淘汰、且不大于窗口最新 seq，拒绝 `INVALID_INPUT`：不得重新学习，不宣称窗口外全历史幂等。新 seq 必须大于当前最新 seq，tick 不早于最新 occurrenceTick；同窗口复用 commandId 或 decisionId 即使 seq 较新也拒绝。全历史命令去重由未来完整 replay adapter 负责，不在此存无限 ID 集。
- 合法新样本 append 后仅保留最近四条；不能改变任何原有样本。加入后 state 或输入超预算时先拒绝，不得部分更新。
- `deriveWorkExperience(state)` 返回精确 DTO：

```js
{
  version: 'work-experience-view-v1', simulationId, actorId,
  topic: 'work-for-pay-execution', sampleCount, failureCount,
  penaltyPermille, evidenceRefs
}
```

其中 `sampleCount` 是当前窗口长度，`failureCount` 是 `rejected` 数量，`penaltyPermille = min(300, 100 * failureCount)`；`evidenceRefs` 是窗口全部 `sourceEventSeq`，升序排列。无失败惩罚为 0；两次失败为 200。公式只是实验参数，不是心理结论。
- 可纠正含义：后来的真实成功进入窗口，可将旧失败挤出，使新派生惩罚下降；既有事件及其过去派生结果保持不可变。例：`F,F,S,S,S,S` 的逐次 penalty 为 `100,200,200,200,100,0`；`F,F,F,F` 为 `100,200,300,300`；空窗口为 0。
- 后续 M3-2 的配对示例：若其他输入相同，当前 Work.score=710，额外 opposition +100 后 Work.score=610；Use.score=700 保持不变。这只是说明该经历读数将来可能影响候选评分的示例；本轮不实现 candidate/planner 修改，不声称计划或真实动作已变化。
- 非普通或 null 原型 JSON 记录、稀疏数组、symbol、getter/accessor、未知键、非 JSON 值、循环引用、非安全整数均按既有 `data-contract.mjs` 习惯 fail-closed。先进行无 getter 执行的描述符/对象树检查，再做完整克隆、canonical JSON 字节预算和业务校验。
- 错误码统一沿用数据合同：非法输入 `INVALID_INPUT`；未知版本 `UNSUPPORTED_VERSION`；超字节、硬上限或运算溢出 `LIMIT_EXCEEDED`。失败时不得部分更新。
- 所有公开函数为同步纯函数：不使用 Date、Math.random/RNG、文件系统、HTTP、世界推进、命令、模型或全世界私账；不得 mutate 输入。返回引用契约例外仅为验证器：`validateWorkExperienceState` 成功返回原 `state`；`createWorkExperienceState` 返回新对象，`observeWorkOutcome` 的 state 与输入及 outcome 脱离，`deriveWorkExperience` 的结果与输入脱离。测试需 deep-freeze 输入并确认可调用；不得用 getters 证明拒绝（需断言 getter 未执行）。

## 独立验收

`deriveWorkExperience` 的 expected 必须独立手算或静态写入 fixture，不能由被测 derive 自产。测试至少覆盖：

- 空窗口、四条上限、第五条淘汰最旧样本及前述逐步 success correction 公式。
- 窗口内 canonical duplicate（键顺序变化仍等价）；相同 seq 冲突；被淘汰旧 seq；tick 回退；错 actor/simulation；非 Work/NoAction；窗口内 command/decision 重用。
- JSON 序列化恢复后结构等价，并可继续观察得到相同结果；旧样本不被改写；验证器成功原样返回输入。
- 普通对象及 null 原型对象有效；拒绝稀疏数组、symbol、未知键、getter/accessor（getter 未执行）、非 JSON/cycle、unsafe integer。预算测试验证合法最大 shape 在预算内，并验证超限输入被提前拒绝；固定字段和 ID 规则下合法 DTO 无法达到 8192/2048 字节，不要求构造恰好达到上限的合法 DTO，也不新增 padding 字段。可用超长 ID 字符串构造超限 state/outcome，并断言在业务 ID 长度校验前返回 `LIMIT_EXCEEDED`。
- deep-freeze 输入、返回对象引用脱离、重复读取派生相同、错误后原输入内容未变。

记录每个失败反例的 expected、actual 与红绿范围。实现前因目标模块尚不存在导致的加载失败是依赖/起步状态，不是业务反例。

## 验证命令与停止点

实现后只运行本路单文件：

```powershell
node --test tests/simulation/work-experience.test.mjs
git diff --check
```

代码未变化且该提交已有有效通过证据时不重复。全量回归留给 M3 阶段收口。不得把 M2 历史 401/401 当成本路验证，也不得增跑另一任务的测试。

交付回执说明：用户可见行为与限制；实际工作树、分支、基准 SHA、精确代码 commit SHA；控制合同发布 SHA `8282a135a85967818c39a6289cd1a0e7dcec769d`；本路精确文件；命令、数字结果、真实证据路径；PASS 建议及未验范围。执行范围止于 M3-1A 本地代码交付；不执行 M3-2 adapter、完整体验、合并、push、部署或阶段验收。本路中控定向复核已完成；M3-1 整体仍待 B 路交付与独立验收，M3 整体仍未验收。

## 中控验收记录（2026-10-08 19:50 Asia/Shanghai）

- 裁定：M3-1A PASS/本地已验收，仅限内核；M3-1 整体未收口，M3-2 未发布、未实现，M3 整体未验收。用户原交付 `5a2f641f4e26d78bb9c71ae8368abb7425dcb999`；代码树 `D:\Narraverse-World-Map-m3-experience @ codex/world-runtime-m3-experience`，基准 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9`，修复后的生产代码 SHA `473f608f792fb840211a16779a175ffe4e7b7eb5`，最终仅测试变化的交接 `275b81a37253ddf0bada93e2252b30629d3f3dc5`，当前干净。仅两项白名单 tracked file 参与；data-contract 与旧 M2 未改。
- 作者定义的原套件为 13 项；中控未在最终提交重跑原 13 项。首次新增的 8 项独立门为 7 pass/1 fail，发现 array 自定义 prototype 上的 `map` getter 会执行，三个 state 入口都可触发 getter。修复在本模块先做不执行 getter 的 descriptor/tree 检查并限制数组原型，再复用 cloneData；未改共享 data-contract。原 red 证据保留。
- 修复后在生产代码修复点执行本路原 13 项加新增 1 项，共 14/14 pass、0 fail/skip，145.3728 ms；证据 `artifacts/world-runtime-m3a-controller-review-20261008/repair/green-single-pass-2.tap`。随后两个测试反例改用 fresh seq 6，仅测试文件变化；定向 window-order 为 1/1 pass、113.4017 ms，日志 `artifacts/world-runtime-m3a-controller-review-20261008/repair/window-order-focused.tap`。当次运行时 Git HEAD 为生产代码 `473f608`，测试文件仍有未提交改动；这些 test-only 字节随后提交于交接 `275b81a`，生产源码未变。独立旧失败门另在实际 `275b81a` 上运行，为 1/1 pass、87.3141 ms、exit 0：三个入口均 `INVALID_INPUT` 且 getterCalls=0；对应证据 `artifacts/world-runtime-m3a-controller-review-20261008/focused-after-repair.json` 与 `focused-review-after-repair.md`。此前 7 个通过门未在最终提交重跑；256 序列、2048 次读取是 1 个独立门，不是 2048 个测试。不能将最终提交表述为全 8 门重跑通过或全 14 项复跑。
- 修复回执的 source/test 标签曾对调，中控已独立核正；源码 SHA256 `99f1df33a5cef74a660172bdac3280261fbfc4a1538d4b512e459c7b6fda10a2`，最终测试 SHA256 `69d010dc28eb69cab9a69d9a6cc722d53ab7a4addc471a5afc9a51cc4b5f2350`。一组合法 escaped 样例 `1355` outcome / `5856` state 仍在预算内；作者给出的 `1365/315` 仅是 ASCII 形态，不是合法最大值，未放宽合同。
