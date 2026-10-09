# M3-3B：认知降频与延续运行时独立验收

合同版本：`m3-cognition-runtime-contract-v1`。共同合同唯一权威见 [M3-3A §共同合同](M3-3A-COGNITION-RUNTIME-TASK.md#共同合同唯一权威)。本文件只定义 B 的独立验收。状态：**B 与 M3-3 限定阶段已中控 PASS**（2026-10-09 12:41 Asia/Shanghai）；完整M3未验收。合同本地发布 SHA：`6b02918b60a1a5681fa2194ab362aaf808bceb06`。准备复核提交：`2fdc895f4bc54ad9507156726a630486094e8722`。

## 中控独立验收记录（2026-10-09 12:41 Asia/Shanghai）

原A交付 `1b117d8e65d4d0e6fadb113d8b625472706750e3`；原B6241809与准备修正2fdc895保留。隔离独立克隆 `D:\Narraverse-World-Map-m3-cognition-integration @ codex/world-runtime-m3-cognition-integration` 导入B至8cc9c17，修复三处输入/信号校验提交 `0e58d5b39286f23e87cab2e978f57b683e90902b`，最终仅B测试修正交接 `6562460c2a0610afff6ba49f25524e1ae191b8c5`。生产共61文件、冻结四文件及data-contract不变；合同业务正文未改。

C1-C8按原A与定向修复分次覆盖，C1/C3/C4/C7在修复字节通过；C2/C5原有效未变行为证据保留，C6/C8原A四门及真实CLI6=2+4/25业务文件通过。最终repair存盘1+公共底座22+有界存盘4共27/27，三处修复探针32/32、24合法baseline、getter0；C7最终23实变、两种真实学习后整tick回滚通过。不是一次完整套件，未把作者159自测/14环境失败口述当独立证据。细项与字节归属见集成树 `artifacts/world-runtime-m33-controller-review-20261009/controller-review.json`、acceptance/runner分次记录。完整M3、服务/检查器、真实工作失败被后续真实成功挤出窗口及阶段full suite仍待后续；未push/main/deploy。

## 给用户看

B 独立核对人物降频后是否仍延续真实承诺，重要本人事实是否能唤醒，以及新运行时能否保存、恢复并从固定历史完整重演。B 的通过结论只覆盖本合同的独立验收范围，不代表完整 M3、正式平台集成或规模性能已验收。

## 基准、依赖与所有权

- 唯一起点：`D:\Narraverse-World-Map-m3-integration`，`codex/world-runtime-m3-integration @ a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2`。禁止从 `main` 或任意最新树取基线。
- 计划验收树：`D:\Narraverse-World-Map-m3-cognition-acceptance`，分支 `codex/world-runtime-m3-cognition-acceptance`；起草时目录不存在、分支未占用。派发后先核实 owner、HEAD、dirty/untracked/ignored 和分支，绝不覆盖他人树。
- 只允许新增 `tests/simulation/cognition-acceptance.test.mjs` 与 `tests/simulation/cognition-runner-acceptance.test.mjs`。B 不改生产文件、A 测试、既有测试、helper、合同或 fixture。
- 可先从 a638 独立编写不依赖新 API 的 expected/oracle；依赖未到且仅收到精确 `ERR_MODULE_NOT_FOUND` 时可标待跑，不记为实现缺陷，也不写 skip。A 已导入后缺少/错误 export、SyntaxError 或断言失败都属于未通过，不可用前置状态解释、永久 skip 或模拟 pass。未获得中控派发的 A 精确交付 SHA 前，不导入或猜测任意新代码，不运行依赖性验收。
- 收到 A SHA 后，按精确 SHA 导入/检出所需工作树并记录依赖 HEAD；不得取任意最新提交。若 A/B 测试冲突，交中控处理，不改 A 文件。记录依赖导入后的 SHA 与 B 交付 SHA；用该区间核实 B 作者差异仅含本路两个测试文件。A 继承的生产/测试差异单独列为依赖，不计入 B 作者改动。

## 独立性与报告规则

- Expected 必须由固定输入、独立手算、静态 oracle 或 a638 原行为记录定义，不能由被测 signals/kernel/planner/runtime 自产。每个需要真实调用链的场景从实际 fresh profile/context 起步；single-tick 定向测试不得替代连续/切片 replay。
- 覆盖 A 合同 C1–C8 中适用于独立验收的行为，以真实 consumer chain 验证 signals → kernel → review/maintain decision → authority/receipt → experience observation → day settle → checkpoint/replay。只测导出、DTO、按钮或静态 hash 不足以 PASS。
- 用实质不同的变体制造反例；每个 mutation 必须先断言 canonical bytes 已变化。验证篡改后重算 hash 仍能被完整历史证明拒绝。
- getter/accessor 探针需断言 `getterCalls===0`。合同要求 hook 是含六函数的对象，误认作单一 function 属测试错误，不可改实现配合。
- 错误语义按 A 合同和既有 data-contract 精确比较；记录 expected、actual、依赖 SHA、B 测试 SHA、命令和退出码。分清缺依赖、测试错误、生产缺陷、skip 与未覆盖。
- 不重跑已通过的旧 M3-1/M3-2 套件；只运行 B 新增测试和因新增 B 反例所需的最小直接回归。不要扩成几百轮全量运行或千日性能试验。

## B 必需验收矩阵

- **C1 Signals/边界**：独立核对 relevance 三值、need/duty/semantic key evidence、baseline 首次行为、raw seq 与语义无关字段不唤醒；隐藏 communal cash 或其他 actor 私账/执行结果变化不影响本人 input。
- **C2 频率/晋升**：用真实 fresh cognition-village profile，health=1000、fatigue=0、无请求；保留默认 `mc02` tick12 和 `mc03` tick24 两个 market-check，起始本人 belief available/confidence900。之后不加 stimulus/duty；raw price/seq 可变化但 semantic 稳定，核 INITIAL144 → maintain288/432 → PERIOD576。 另用完全无 stimuli 样本核144 INITIAL、首次 daily-public 在288真实改变本人 belief 后 `EVIDENCE_CHANGED`、432/576 maintain、720 PERIOD（无其他 wake）。不接受手工 false flags 代替真实 signals。
- **C3 Continuation 消费链**：用独立 recipe 固定 actor-2 importance400、health400/hunger0/fatigue650、motivation.requests=[]；保留默认 mc02 tick12 与 mc03 tick24 两个初次 market-check，不增加第二日 stimulus/duty；day1 authority 真实买药成功，day2 maintain 用现有 plan 真实 Use 成功。要求同 Goal/Plan ID、nextID 不增长、anchor 保持旧 review Planned、今日 command 新建、空 candidates 且世界照常结算。
- **C4 阻塞与唤醒**：同一 blocked step 在资格恢复后重试；active null 才恢复 eligible suspended；空 slots 保留 Goal 并等待；soft guard 失效只触发规定唤醒；deadline/真实前日 RULE_REJECTED/new major duty/urgent need 按 policy 处理。验证两 actor proposal 均先冻结。真实 Work(review) 必须生成合法本人观察；纯 continuation 覆盖 maintain Work step，adapter 对 cognition DTO 完整核验。除非独立 review 找到自然 recipe，不要求也不声称当前 fixture 能产生真实 maintain Work。消费开关关闭不抑制事实记录。
- **C5 生死与身份**：day144 评估后当日死亡，day288 dormant、保留历史且不可 revive；跨 actor 信号/anchor、过期 tick、同 tick 合并与因果引用做独立拒绝探针。
- **C6 CLI/恢复/完整重演**：验证连续864、非日界切分200+664与432+432，CLI 2+4 对比6；逐 fact/receipt/IDs/RNG、四 cursor、业务 bundle、JSON/CSV 对照。忽略 summary run metadata，不以状态内 anchor/mode 自证历史。
- **C7 篡改/事务/访问器**：覆盖 A 合同列出的 signals、baseline、input、mode、score/tier、candidate、anchor、plan step/ID、receipt/work link、cursor/RNG 篡改；重算 hash 后仍须 fail closed。每类篡改都至少有实质变体，且逐个确认 canonical bytes 已变化。post-learning 异常及真实预算溢出整 tick rollback，getter 零执行。
- **C8 旧规则兼容**：以 a638 固定基准为 oracle，比对 `m-experience-v1` 默认四日完整业务输出和 hash；必要时 bounded compare M2 四日、D2 C6 ops/C5 已冻结 controller proof，oracle SHA 只取 M3-2 tasks。禁止重新跑未改的 kernel 测试，不把历史结果说成本次复跑。

## 文件分工、命令与停止

- `cognition-acceptance.test.mjs` 负责 signals、策略、continuation、authority、身份/死亡、adapter 与篡改反例；`cognition-runner-acceptance.test.mjs` 负责 fixture、CLI、保存恢复、连续/切片重演及旧规则兼容。允许合理调整分配，但文件白名单不变。
- 派发后运行本路两个新增测试文件及直接关联的旧模块/存盘回归；不重跑四个冻结 kernel 测试、未变化且已有有效证据的套件或无关全量 suite，阶段 M3 总收口再集中跑 full suite；记录 Node 版本、精确命令、exit code、通过/失败/skip 数、耗时、A 依赖 SHA、B 测试 commit SHA、证据目录和未验范围。依赖未到时不运行并注明 blocker 的精确错误。命令：

    node --test tests/simulation/cognition-acceptance.test.mjs
    node --test tests/simulation/cognition-runner-acceptance.test.mjs
    git diff --check

- B 不修改 A、不修复 production；发现缺陷时报告最小复现、expected/actual 与 A SHA，停止该验收门等待中控处理。不得自行跳过失败或改写 oracle 迎合实现。
- 测试由唯一写入者负责；测试/机械任务交 high 推理子代理。测试 commit 后停止：不合并、不 push、不部署、不改 main、不更新状态/看板。给出独立裁定建议，最终验收由中控复核。控制合同发布 SHA 为 `6b02918b60a1a5681fa2194ab362aaf808bceb06`。

## 中控验收准备复核记录

记录时间：2026-10-09 08:25（Asia/Shanghai）。准备复核树 `D:\Narraverse-World-Map-m3-cognition-acceptance-review @ codex/world-runtime-m3-cognition-acceptance-review`，HEAD `2fdc895f4bc54ad9507156726a630486094e8722`，工作区干净。原 B 树 `D:\Narraverse-World-Map-m3-cognition-acceptance @ codex/world-runtime-m3-cognition-acceptance` 保留在干净的原交付提交 `6241809f2a9c73273772ea67183cd8487c7fc68c`；修正树只改两份 B 验收测试，提交测试字节与当前 checkout 相符；58 个生产文件相对共同基准 `a638e5f19eaf7bdd9a4f4f3acc2456e62126fbf2` 无 tracked 差异，不 push、不合并 main。

A 计划树 `D:\Narraverse-World-Map-m3-cognition-runtime @ codex/world-runtime-m3-cognition-runtime` 当前 HEAD 为共同基准 a638，工作区已有未提交源码与新模块改动，但还没有可供 B 锁定的提交交付 SHA。建树和未提交实现不等于交付或验收；在取得精确 A SHA 前不运行 C1-C7，也不猜测模块/API。

准备复核修正覆盖：取消永久 skip，将缺少 A 依赖明确报告为 `A_DEPENDENCY_PENDING`，真实语法/export 错误继续失败；严格核对六函数 hooks、合法经验 view/GoalPlan 与计数器、C3 初始 actor 固定索引、C2 时点/原因、C4 缺口与因果、C5 真实死亡历史、C7 日界后学习异常与预算回滚的真实路径，并将 C8 改为消费独立冻结的旧规则期望。

本次实际运行仅为：旧合法 DTO 准备检查 1/1 通过；当前 a638 生产代码的 C8 基准消费者 2/2 通过，0 fail、0 skip、exit 0（约 25.5 秒）。两份验收测试 `node --check` 与 `git diff --check` 通过。C7 自然 day2 配方随后调整后只运行 `node --check` 和 `git diff --check`，未运行该 C7 body；不宣称 C1-C7 或全套验收通过。当前基准消费者结果不代表未来 A 兼容。

C8 冻结基线由干净 a638 独立运行 `experience-village`、`m-experience-v1`、seed 42、4 日（tick 576）生成；原始产物含 23 个稳定文件及完整 bundle，原始 manifest SHA256 `8c8abf2feff514f9a1d289b93cf5c64344c56c3817d021c16307c97fa2040346`，文件见 review 树 `artifacts/world-runtime-m33b-preparation-review-20261009/legacy-baseline/manifest.json`。C8 比对业务摘要、bundle、配置/状态及 23 个稳定文件；candidate 不得自建或更新 expected，缺失缓存即阻塞。已有 M2 default576、D2C 六操作和 C5 四日冻结证明仅复用，不是本轮重跑。证据与逐项范围见 `artifacts/world-runtime-m33b-preparation-review-20261009/test-preparation-verification.json`；该记录的早期 head 字段为基准阶段记录，最终提交以本节精确 SHA 为准。

本轮结论仅为：**B 验收准备已复核修正，可等待 A 精确依赖；M3-3B 功能验收 C1-C7 未运行，C8 新 A 兼容待跑。** M3-2 既有 PASS 保持，完整 M3 未验收。
