# M3-1B：重要性 × 相关性的认知审查内核

合同版本：`m3-kernels-contract-v1`。状态：待派发；尚未开工、未实现、未验收。任务书发布提交由中控发布后填入控制状态，不在此预填。

## 给用户看

给每名人物一个稳定的认知节奏：每个世界日根据显式重要性和当前相关性，决定进入完整审查或低频复查；紧急需要、新重大职责、关键证据变化或计划失效可以唤醒审查。死亡人物进入 dormant。低频复查只表示少做一次候选比较，不会暂停已承诺计划或世界日常运行。

本项只做 M3-1 纯内核。它不接世界信号、不迁移 Goal、不运行 NPC，也不实现完整 M3 体验；运行时 adapter 与体验另行派发。完成本任务不代表 M3 已通过。

## Reference Review

- 问题：如何按重要性与当前相关性调整认知审查频率，同时允许关键事件唤醒审查，且不把低频误解为暂停世界。
- 参考对象：冻结本地 Git 对象 `b0b13a3baccf0d26fae167f7827930a1df995876` 的 `docs/reference-library/ADOPTION-PROTOCOL.md`、`PATTERN-DECISIONS.md`、`MODULE-INDEX.md`。
- 采用：PAT-006 Routine + Event Wakeup 的「低成本日常、相关事件唤醒」方向；PAT-007 Importance × Relevance Cognitive LOD 的「人物重要性 × 当前相关性决定更新频率与推理深度」方向。仅采纳目录/模式原则；本次固定阈值、周期和 reason 是本项目合同，非参考项目事实。
- 不采用：没有核验或运行 Veloren、Shadows of Doubt、S.T.A.L.K.E.R. 源码；不声称其实现与本任务相同，不填写未经核实的外部实现细节、来源链接或代码。Code copied：no。

## 基准、目录与所有权

- 控制文档目录：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`，任务书编写前 HEAD `0af0b79aadbc0bbd127de87c6de2a68f9b83967c`。
- 唯一代码交接基准：`D:\Narraverse-World-Map-m2-integration`，分支 `codex/world-runtime-m2-integration`，本地基准 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9`。冻结 M2 验收代码 SHA `83826a82fea5c0edfe62aa3d676313eefe2a7790` 与该基准仅 README/PROJECT_CONTEXT 不同；M2 历史 401/401 不重跑，也不把该历史结果当本任务验证。
- 从本地 `c8d78d4270f3c58ad530fdc8e7d6a2ce4c8b03c9` 建立专用工作树：`D:\Narraverse-World-Map-m3-cognition`，分支 `codex/world-runtime-m3-cognition`。创建前核实路径不存在，且分支未被其他工作树占用；若已存在，先确认其归属与实际状态，不覆盖、不重置、不挪用。
- 不从 `main` 或其他工作树复制 runtime；不碰已验收 integration 树、A 路工作树或他人数据。A/B 互不导入，不新增 helper。
- 允许新增且仅允许新增：
  - `runtime/core/cognitive-review.mjs`
  - `tests/simulation/cognitive-review.test.mjs`
- 唯一允许的只读 import：`./data-contract.mjs` 与共享日界常量 `./simulation-clock.mjs` 的 `TICKS_PER_DAY`。不得修改这些模块或其他既有生产、测试、合同、状态及看板文件。
- 中控后续在指定提交 SHA 上独立定向补反例。任务执行者提交精确本地代码 commit，不 push、不合并 main、不部署；控制库发布合同 SHA 由中控在发布时填写。
- 测试与机械批处理交给本路子代理，推理程度统一 high；明确分配本路测试文件的唯一所有权，测试者不修改生产模块。验证时冻结被测代码，按实际 SHA 和真实命令交回证据。

## 精确公共接口与 DTO

`runtime/core/cognitive-review.mjs` 必须同步导出且只增加本任务约定的公共符号：

```js
COGNITIVE_REVIEW_STATE_VERSION = 'cognitive-review-state-v1'
COGNITIVE_REVIEW_DECISION_VERSION = 'cognitive-review-decision-v1'
COGNITIVE_FULL_THRESHOLD = 600000
COGNITIVE_FULL_INTERVAL_TICKS = 144
COGNITIVE_REDUCED_INTERVAL_TICKS = 432
MAX_COGNITIVE_REVIEW_STATE_BYTES = 8192
MAX_COGNITIVE_REVIEW_INPUT_BYTES = 2048

createCognitiveReviewState(simulationId, actorId)
validateCognitiveReviewState(state)
evaluateCognitiveReview(state, input)
```

`actorId` 仅允许 `actor-2`、`actor-3`；`simulationId` 按既有 identifier 规则（≤64 字符）。输入 DTO 精确为：

```js
{
  simulationId, actorId, tick, alive, importancePermille,
  relevancePermille, urgentNeed, newMajorDuty,
  keyEvidenceChanged, goalOrPlanInvalidated
}
```

`tick` 是非负安全整数且必须满足 `tick % TICKS_PER_DAY === 0`；仅日界有认知资格，首次 tick 0 合法。其余五个布尔字段严格为 boolean。两个 permille 均为 0..1000 的安全整数。信号代表未来 actor-local 且已审计的 adapter 汇总；本模块不读隐藏现金、其他 actor 状态或世界对象。重要性为显式配置值；相关性来源由未来 adapter 合同决定，本轮不得自行连接世界。

状态精确为 `{ version, simulationId, actorId, lastEvaluation, lastReviewTick }`，空状态为 `lastEvaluation: null, lastReviewTick: null`。非空 `lastEvaluation` 精确含 `{ input, decision }`，其中 input 是上述精确输入的克隆、decision 是下述精确 decision。不得增添状态键。

Decision 精确为：

```js
{
  version: 'cognitive-review-decision-v1', simulationId, actorId, tick,
  tier: 'full' | 'reduced' | 'dormant', score,
  intervalTicks: 144 | 432 | null,
  mode: 'review' | 'maintain' | 'dormant',
  shouldReview, reasonCodes: [], nextReviewTick
}
```

## 算法与错误语义

- 分数 `score = importancePermille * relevancePermille`，范围 0..1,000,000。活人分数 `>=600000` 为 `full`，低于阈值为 `reduced`；`full` 周期 144 tick，`reduced` 周期 432 tick。
- 死亡优先：`alive:false` 得到 `tier/mode='dormant'`、`shouldReview:false`、`intervalTicks:null`、`nextReviewTick:null`、`reasonCodes:['DEAD']`，其余 flags 不能覆盖。上次曾 alive=false 后再输入 alive=true 必须拒绝 `INVALID_INPUT`，人物不可复活。
- 活人 reasonCodes 按固定顺序、各最多一次组合：
  1. `INITIAL`：尚未发生过 review（`lastReviewTick === null`）。
  2. `PROMOTED`：上一条评估是活人的 reduced，本次为 full。
  3. `URGENT_NEED`：`urgentNeed === true`。
  4. `MAJOR_DUTY`：`newMajorDuty === true`。
  5. `EVIDENCE_CHANGED`：`keyEvidenceChanged === true`。
  6. `PLAN_INVALIDATED`：`goalOrPlanInvalidated === true`。
  7. `PERIOD_DUE`：存在上次 review，且本次 tick `>= lastReviewTick + 当前 tier interval`。
- 活人只要 reasonCodes 非空，`mode='review'`、`shouldReview=true`，并把 `lastReviewTick` 更新为当前 tick；否则 `mode='maintain'`、`shouldReview=false`，保留上次 review tick。`nextReviewTick` 为结果 lastReviewTick 加当前 tier interval；若没有 lastReviewTick 则为 null。降级后以新的 432 interval 计算，不强制 review；reduced 上的关键刺激会唤醒 review，但 tier 仍只由分数决定。PROMOTED 会立即 review。
- 每个日界最多评估一次：tick 等于上次 evaluation tick 且 canonical input 相同，幂等返回保存的 decision；同 tick 不同 input 拒绝 `INVALID_INPUT`。tick 小于上次 evaluation tick 拒绝。上游负责把同 tick 多条刺激合并后调用一次。本模块不接刺激流。tick 跳跃仅评估本次 tick 一次，不回填离场历史。
- 首次 alive tick0 产生 `INITIAL`，tier 依分数而定，下一次为 tick432（低分）或144（高分）。低分 tick144、288 无 flags 时 maintain；tick432 触发 `PERIOD_DUE` 并令 next=864。高分 tick0 下一次 tick144 到期。600×1000 为 full，599×1000 为 reduced。reduced 从 tick0 到 tick144 升到阈值时，触发 PROMOTED、next=288。低分 tick144 的 urgent、evidence、duty、plan invalidation 各可独立唤醒；同 tick 多个信号只产生一次 review。
- `lastReviewTick` 为空或为非负安全整数，且在非空 state 中不得大于 `lastEvaluation.input.tick`。maintain/dormant 保留既有 review tick；首次死亡为 null。任何用于到期判断或 `nextReviewTick` 的加法若溢出安全整数，先拒绝 `LIMIT_EXCEEDED`，不能返回不安全 tick。
- `evaluateCognitiveReview(state, input)` 返回 `{ state, decision }`。输入先完整校验再计算；state 含保存的 input/decision；返回 state 与 decision 是彼此分离的克隆，不共享可变子结构，也不与输入或传入 state 共享引用。相同 tick 幂等时返回保存的 decision 副本。
- `validateCognitiveReviewState(state)` 验结构、精确键、版本、字节预算、state/input/decision 身份和 tick 对齐、分数乘积与 tier/interval 对应（full=144、reduced=432、dormant=null）、nextReviewTick、lastReviewTick 关系、布尔值和 reason/tier 枚举，并检查可由单个保存 DTO 直接证明的不变量：空 `lastEvaluation` 时 `lastReviewTick` 必须为 null；活人非空评估必须已有 `lastReviewTick`，review 时它等于当前 tick，maintain 时它小于当前 tick；`shouldReview` 与 `mode` 一致，且 mode/tier 与 input.alive 一致；review reasons 非空、值合法、固定次序且无重复，maintain reasons 必须为空，dormant reasons 必须恰为 `['DEAD']`；非 dormant 且已有 review tick 时 `nextReviewTick` 必须等于 `lastReviewTick + intervalTicks` 且为安全整数，没有 review tick 或处于 dormant 时必须为 null。`INITIAL`、`PROMOTED` 与 `PERIOD_DUE` 的历史因果不能由末态确认，留给未来完整 replay。验证器成功按约定返回原参数 `state`。
- 已承诺计划继续执行、已存在的 action 请求、日结与生命周期都属于完整世界；`maintain` 只表示此日不重新比较候选，不代表不执行计划、暂停 NPC 或停止 world。M3-1 不做世界推进、身份/Goal 迁移/清理、模拟 level 切换或运行时接入。上述完整世界接点留给 M3-2 冻结与实现。
- 非普通/null 原型 JSON 记录、稀疏数组、symbol、getter/accessor、额外键、非 JSON 值、循环引用或不安全数字均 fail-closed。先无 getter 执行地检查描述符与对象树，再完整克隆、canonical JSON 预算和业务校验。
- 错误码沿用数据合同：非法输入 `INVALID_INPUT`；未知版本 `UNSUPPORTED_VERSION`；字节/硬上限/计算溢出 `LIMIT_EXCEEDED`。失败时不得部分更新。
- 所有公共函数为同步纯函数：不使用 Date、Math.random/RNG、FS、HTTP、世界推进、命令、模型或跨 actor/world 状态；不 mutate 输入。返回引用契约例外仅为验证器：`validateCognitiveReviewState` 成功返回原 `state`；`createCognitiveReviewState` 返回新对象，`evaluateCognitiveReview` 返回的 state 与 decision 互不共享可变子结构，且均与输入及传入 state 脱离。测试用 deep-freeze 输入并断言 getter 未执行。

## 独立验收

expected 必须从冻结规则独立手算或静态写 fixture，不能由 `evaluateCognitiveReview` 自产。测试至少覆盖：

- score 与 tier 阈值上下界；tick0 首次审查；144/288 maintain 与432到期；full 144周期；reduced→full PROMOTED；full→reduced 的新周期；reduced 状态下每个唤醒信号及多个 reason 固定排序、同 tick 只审一次。
- 同 tick 相同输入幂等；同 tick 不同输入冲突；tick 倒退；跳 tick 不补评；actor/simulation/版本不匹配。
- DEAD 优先、死亡 dormant 字段、死亡后拒绝复活；maintain/dormant 保留 lastReviewTick；首次死亡仍为 null。
- `Number.MAX_SAFE_INTEGER` 附近日界合法 tick 的 interval/nextReview 加法溢出拒绝且无状态部分更新。
- JSON 序列化恢复后的结构等价并继续评估得同结果；validator 对身份、tick、score/tier、interval/nextReview 与 review tick 不一致的反例拒绝，但不把它描述成完整历史证明。
- 普通/null 原型对象有效；拒绝稀疏数组、symbol、未知键、getter/accessor（getter 未执行）、非 JSON/cycle、unsafe number。预算测试验证合法最大 shape 在预算内，并验证超限输入被提前拒绝；固定 DTO 和 ID 规则下合法输入无法达到 8192/2048 字节，不要求构造恰好达到上限的合法输入，也不新增 padding 字段。可用超长 ID 字符串构造超限 state/input，并断言在业务 ID 长度校验前返回 `LIMIT_EXCEEDED`。
- deep-freeze 输入、state/decision/输入之间不共享可变引用、纯度与重复读取确定性。

记录每个失败反例的 expected、actual 与红绿范围。实现前因目标模块尚不存在导致的加载失败是依赖/起步状态，不是业务反例。

## 验证命令与停止点

实现后只运行本路单文件：

```powershell
node --test tests/simulation/cognitive-review.test.mjs
git diff --check
```

代码未变化且该提交已有有效通过证据时不重复。全量回归留给 M3 阶段收口。不得把 M2 历史 401/401 当成本路验证，也不得增跑另一任务的测试。

交付回执说明：用户可见行为与限制；实际工作树、分支、基准 SHA、精确代码 commit SHA；控制合同发布 SHA（按中控提供值填写）；本路精确文件；命令、数字结果、真实证据路径；PASS 建议及未验范围。结束于 M3-1B 本地精确 commit；不执行 M3-2 adapter、完整体验、合并、push、部署或阶段验收。M3-1 尚需中控按提交 SHA 定向补反例；M3 整体仍未验收。
