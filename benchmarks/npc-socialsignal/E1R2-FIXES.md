# E1R2 修正回执（执行者 → 中控）

任务：E1R2 关闭评测门槛漏洞 ｜ 分支：`codex/laya-model-benchmark` ｜ 复验对象：`b2df7a9` ｜ 基线合并：main `feb5bb0`
范围：只动 `benchmarks/npc-socialsignal/`。未装 CUDA、未训练、未动 MLX/C、未开 final、未启旧桥、未改 Runtime/正式平台/PROJECT_CONTEXT/看板。pilot 与 E1R 的原始预测、锁件、封存件、旧脚本一律保留，新产物另名（`.e1r3.jsonl`、`*.e1r2.json`、`split-manifest-v2.json`）。

## F1 完整性错误必须拒绝 + 消费链统一

改动：`scripts/score.py`（v2 重写）、`scripts/run_bench_v3.py`、`scripts/register_runs.py`、`results/raw/run-index.json`。

- runner 每次运行向 `results/raw/run-index.json` 追加一条：`model|split|condition` → 路径、**sha256**、记录数、完整运行配置（device/max_len/head_max_len/state_budget/batch/timeout/limit）、worker 身份与重启计数。
- scorer **只按索引解析**预测文件；索引里没有就拒绝，不再猜文件名，也不会退回同名旧 pilot raw。跨盘符（C 临时目录 vs D 仓库）的 `relpath` 崩溃已修（`display_path`）。索引条目哈希与实际文件不符 → 拒绝（"indexed file hash changed"）。每条预测还要 `model/split/condition/signal` 与被调用参数一致、`sid` 属于计划集、键唯一，否则计为完整性问题。
- 金标与计划场景 ID 必须**精确同集合**；缺失/多余/重复/非法标签全部 fail closed，分母绝不缩小（`integrity_problems()` 抽出为可测函数）。
- 任何完整性问题：**exit=4，不写 scores，不写/不改校准锁**，改写 `results/integrity-errors-<split>-<condition>.json`（`scores_published:false`）。
- `requires_relabel` 项（截断删掉判断依据或把边界移出窗口）**在正式评分中被拒绝**，只有显式 `--diagnostic-only` 才允许出诊断结果。

回归实测（`python scripts/regressions_e1r2.py`，无权重；下列为我先前失败/现通过的对照）：

| 反例 | 先前（b2df7a9） | 现在 |
|---|---|---|
| 索引无登记条目 | 静默读旧 pilot raw | CLI **exit=4**，`run index has no entry …`，提示 pilot 不被隐式消费 |
| 只有新命名产物 | scorer 找不到文件 | 正常评测，输出内记录 `consumed_predictions.A.path/sha256` |
| NaN 概率 + 重复行 | exit=0 且仍写正常分数 | **exit=4**，无 scores 文件，锁 sha256 前后一致，诊断文件生成 |
| 空预测文件 | 无反应 | **exit=4** 并列出 `MISSING prediction row` |
| 全量失败（每行 predict_error） | — | **exit=0** 且 acc=0.0、run_success=0.0、planned=全量（明确全败报告，不装作没计划） |
| 计划 2 条只 1 条金标 | planned=1、acc=1.0 | fail closed：`gold/planned id sets differ` |

## F2 冻结绑定真实回执与运行方案

改动：`score.verify_freeze_gate(HERE, rows, model, condition, split, plan, gate_path)` 严格化；`run_bench_v3.py` 与 `score.py` 共用同一函数与同一 `rows_for()` 数据源（**runner 与 scorer 都只读 `samples/scenarios-final-blind.jsonl`**，消除"一个读 blind、一个从 src-batch 重建"的分裂）。

- 要求：`schema=e1r2-freeze-gate-v1`、`status=frozen`、`split=final`；两名**非空且互不相同**的复核者，每人 `independent`/`no_gold_exposure_attested`/`no_cross_reviewer_communication_attested` 必须**恰好是 true**（字符串"yes"被拒），并各自带 `answers_sha256`、`disclosure_sha256`、`covered_tokens == planned_tokens`；裁定人身份、`completed=true`、`non_original_annotator=true`（缺失即拒，不再是"只在 True 时拒绝"）、`receipt_sha256`，且裁定人不得同时是复核者。
- 冻结件哈希逐项与**当前实算**比对：blind 样本、question-templates、LABEL_SPEC、config.lock、temperature-lock、外部金标哈希（后者还要与 `seal-record-v2.json` 一致）。
- 运行方案绑定：`frozen_plan` 必须包含 models/conditions/max_len/head_max_len/device/limit/截断政策/scenario_count；模型或条件不在预注册集合 → 拒；`--limit` 与冻结值不同 → 拒；缺字段也拒。
- `results/final-run-journal.json` 记录开启状态与每次评分消费的预测哈希：同一 model+condition+同一产物重复评分幂等，**换 model/condition 重开** → 拒（"a new holdout is required"）。
- 正式 final 仍未开放：`freeze-gate.json` 不存在。所有反例都在 `regressions_e1r2.py` 的临时 fixture 里注入（`gate(...)`），没有伪造正式 gate 去过测试。
- 回归结果：`valid_fixture accepted`（合法回执清单零错误）、`duplicate_reviewer_ids refused`、`adjudicator_unstated refused`、`adjudicator_is_reviewer refused`、`partial_coverage refused`、`truthy_string_instead_of_bool refused`、`tampered_template_hash refused`、`unregistered_model/condition caught`、`limit_flag_cannot_bypass`、`absent_gate_refused` —— 全部通过（regressions: 0 failure）。

## F3 超时要终止计算

改动：推理从进程内线程搬到**可终止的子进程 worker**（`scripts/infer_worker.py` + `run_bench_v3.Worker`）。

- 子进程一次性加载权重，按行接作业；父进程用队列 + 截止时间等待。超时后 `proc.kill()` → `proc.wait()` **确认回收** → 记 `killed_for_timeouts/restarts` → 重启新 worker → 该批写成 `predict_error=TIMEOUT>…`、`not_executed=true`，**该信号剩余批次全部落 `NOT_EXECUTED after …` 记录**，不回退 primary，不改写旧产物（新文件名 `.e1r3.jsonl`），运行 `exit=4`。
- 因为一次只有一个在途请求，"同一 agent 被并发调用"从结构上消失；空/短/畸形回包按 `WORKER_SHAPE` 记录，不再索引崩溃。
- token 计数也走 worker（`count` 作业），预算由 checkpoint 自己的 tokenizer 决定，不是估算。
- 合成回归：`timeout_reported`、`old_worker_reaped`（`poll()` 非 None）、`killed_and_restarted`、`replacement_worker_answers`、`no_overlapping_live_workers`、`shutdown_leaves_no_worker` 全通过。
- 真实权重通路已跑：`A|dev|primary`（150 条，sha `c61127d7…`，restarts 0、killed 0）、`B|dev|primary`（`965b9e27…`）、`A|dev|long`（`afc488f5…`）；评分器按索引消费 v3 产物后，dev 准确率与 pilot **逐格相同**（A 0.1/0.6/0.5/0.3667/0.5667）。这说明新链路真的通了，也说明跨 runner 结果可复现。真实超时未在生产运行中触发（回归用的是 hang stub），这一点我不写成"已在真模型上验证超时"。

## F4 截断守住预算与事实

改动：`scripts/inputs.py` 重写。

- 删除顺序：`既往` 从最旧开始**持续删到预算内或删空**（修掉 `len(history)>len(removed)` 提前停下的错条件），只有历史删空仍超预算才把边界移出窗口；边界态用三值 `stated / never_declared / outside_window`，`outside_window` 渲染成"该条边界不在可见窗口内"，**不再出现"从未被告知"**，也不把 SDK 静默截断当"输入一致"。
- 不可删核心（NPC + 此刻 + 框架）仍超预算 → 返回 `refused=core_over_budget`，runner 写成拒绝记录而不是超限硬塞。
- 每个长/8192 条件都记录 `tokens_before_truncation / tokens_after / state_budget / removed_lines(带 reason) / history_remaining / boundary_state / decisive_evidence / lost_decisive_evidence / requires_relabel`。
- `decisive_evidence` 现在是**按信号**的文本引用（`{"deception": ["…"], "boundary_violation": ["…"]}`），不进模型输入、不进盲审包；final 的依据权威副本留在仓库外标注件。
- 丢失依据或边界出窗口的项，正式评分被拒（F1 联动）。
- 回归：`budget_respected_or_refused`、`boundary_only_dropped_after_history_exhausted`、`history_trimmed_before_boundary`、`truncated_boundary_is_not_never_informed`、`requires_relabel_on_decisive_loss`、`core_over_budget_refused`、`authored_absence_still_marked`（"设计上未告知"仍如实渲染，两者不被混同）全通过。中控反例里"预算 100 实返 458 tokens、留 4 条历史却先删边界"两类现象现在都被断言挡住。
- 诚实缺口：dev 现有样本最长约 68 state tokens，远低于 768 预算，因此**长上下文路径在 dev 真数据上仍未被触发**（v3 的 `long` 跑同样是零截断）；这正是 24 条长 dev 要补的，`decisive_evidence` 字段目前也只有回归 fixture 在用，真样本还没标。稳定性分母改用计划对照项、双方失败不跳过——这条在 `stability.py` 里仍是旧算法，随长样本批次一起修（见"未完成"）。

## F5 一套定义、一套枚举

改动：`LABEL_SPEC.md`、`scripts/make_review_pack.py`（替代 `seal_final.py` 发包，不重跑它——源已被拆过，重跑会把金标写空，这点写在脚本注释里）。

- 删除互相矛盾的活动规则：§0.3 不再把"两句口头不一致"一律算欺骗线索，改为「只有与 NPC 可见事实可对撞才算」+ 新增「公开承认的意向变更不算欺骗」；§4 表头与定义统一成机器枚举 `有线索/无线索/信息不足`，并把 `有欺骗线索/缺乏欺骗线索` 明确降为**登记别名**（别名表在包 README 与 manifest 里，映射只改写法不改语义）。
- 新增 **§8 裁定细则 v2**（8 条，回应 10 条分歧）：R-8.1 可对撞才算线索；R-8.2 `无线索` 需要可比对证据、口头一致不算、否则 `信息不足`；R-8.3 边界触发条件与阈值不明→`信息不足`，不许标注者自补阈值（对应"天还没全黑"）；R-8.4 请求越界与既成越界（当面提出触线要求即为越界，不必等 NPC 服从）；R-8.5 口头承诺≠履约（对应求保密/明日再付）；R-8.6 求保密≠说出来路；R-8.7 指路三档分类；R-8.8 枚举唯一、别名机械登记、第三种写法算非法答案。
- 答案表补齐规范要求的字段：每个信号 `{label, basis}`（basis 填原文片段或规则号），加 `spec_question`；`allowed_labels` 随包给出。
- 新包（仓库外，25 条同输入 + 125 条全量）：
  - `review-pack-v3/sanity-retrial-v2`：25 条，`review-inputs` sha256 `424f6076d626a728…`，`answer-sheet` sha256 见 `pack-manifest.json`，LABEL_SPEC sha256 `840f2c74f2de3315…`
  - `review-pack-v3/blind`：125 条，sha256 `736a6180a1eb4040…`
  - 两个包的 manifest 都写明："同一输入在修订规范下重试是**新一轮**可靠性测量，不得沿用旧 κ"。原 25 条回执目录 `review-return/sanity-dev/` 未被覆盖。
- `README.md` 的复跑入口改为唯一一组：`register_runs.py → score.py --selftest/--regressions → run_bench_v3.py → score.py`，并写明 `--calibrate-from`、`--allow-unfrozen`、`run_bench.py`/`run_bench_v2.py` 已废弃，不得再当推荐路径。

## 存量重算差异与回归总账

- `score.py --selftest`：17 项通过（含超时→0.5、全失败→0.0、非法标签列、`requires_relabel` 不计正确、缺行记错、Brier 约定、温度、bootstrap 确定性）。
- `regressions_e1r2.py`：**0 failure**（F1×12、F2×10、F3×6、F4×7）。首次运行时 12 项失败，其中 2 项是我的断言写错（`_reviewer` 把 covered 与 planned 设成同一个数；Brier 期望值），10 项是真 bug（KeyError、跨盘符 relpath、空 preds 未拒、relabel 未拦、索引缺失未拒、边界删除顺序、覆盖率检查、CLI exit）。
- dev/calibration 准确率与 E1R 相同；v3 真跑产物经索引重算后与 pilot 逐格一致。
- 校准锁由 calibration 拟合、dev 样本外应用：A `social_act` ECE 0.347→0.080 改善，A `trust` 0.212→0.247、A `fear` 0.129→0.222 变差 → 跨切分传递不可靠的结论保持。锁内现在记录消费的预测文件哈希与运行配置。

## 未完成

1. `stability.py` 的分母口径（缺失/双方失败不得跳过）还没改到 F4 要求，且它读的是 `.e1r.jsonl`（v2 产物）；随 24 条长 dev 一起改并重新出 dev 稳定性表。
2. 24 条长 dev 与真样本 `decisive_evidence` 标注未开始（等中控确认规范/小批合同）。
3. 规范修订后的 25 条重试包已就绪但**未派出**；正式盲审、裁定、`freeze-gate.json`、final 评分仍未发生。
4. 完整补样（建议 400：dev150/cal90/final160 新家族）未开始；旧 125 条退休为开发/诊断。
5. C 未测；GPU/CUDA 未装；生产运行中未出现过真实超时（回归用 hang stub 证明）。

## 回执

```text
任务：E1R2 关闭评测门槛漏洞（先修工具与规范，再做 24 条长 dev；不扩完整样本、不装 CUDA、不训练、不开 final）
修正提交 SHA：本文件所在提交 = 分支 codex/laya-model-benchmark HEAD（推送见回执消息）；复验对象 b2df7a9；main 已 merge（E1R2 任务书 374ce63 / 状态 feb5bb0）
F1～F5 对应文件：F1 scripts/score.py(重写 v2)、scripts/run_bench_v3.py、scripts/register_runs.py、results/raw/run-index.json、results/integrity-errors-dev-primary.json；F2 score.verify_freeze_gate + run_bench_v3/score 共用 inputs.rows_for、results/final-run-journal.json(逻辑)；F3 scripts/infer_worker.py、run_bench_v3.Worker；F4 scripts/inputs.py(三态边界+删序+拒绝)、samples/paraphrase-dev.jsonl 保持不变；F5 LABEL_SPEC.md(§0.3/§4/新增§8)、scripts/make_review_pack.py、review-pack-v3/*、README.md 复跑入口
隔离与哈希扫描：validate_data_v2 errors=0、仓库内 final 无答案字段；blind 输入 sha256 bafb177afb19d47e…（与中控核对一致）；金标仍在仓库外 sealed/v2/gold-final.jsonl sha256 e85c6791…；历史可重建旧金标的事实与复核者排除规则见 seal-record-v2.json 与 reviews/README.md
最小反例命令与结果：python scripts/score.py --selftest → 17 项 0 失败；python scripts/regressions_e1r2.py → regressions: 0 failure(s)；单条 CLI：--index 空索引 exit=4；NaN+重复行 exit=4 且 scores 未写、温度锁 sha256 未变；空预测 exit=4；全失败 exit=0 且 acc=0.0/planned=30；requires_relabel exit=4，加 --diagnostic-only exit=0；伪造 gate 各负例逐条拒绝、合法 fixture 零错误；--fit-calibration --split final|dev 均 exit=3
重算 pilot 差异：准确率与 F1 与 E1R 相同；新增 v3 真跑（A/B dev primary、A dev long）经索引消费后与 pilot 逐格一致，consumed 路径与 sha256 已写入 scores-dev-primary.e1r2.json
新版试审包哈希：review-pack-v3/sanity-retrial-v2 review-inputs sha256 424f6076d626a728…；review-pack-v3/blind sha256 736a6180a1eb4040…；LABEL_SPEC sha256 840f2c74f2de3315…（旧 25 条回执目录未覆盖）
未完成：stability 分母口径与真样本 decisive_evidence、24 条长 dev、重试包派出与裁定、freeze-gate 与 final 评分、完整补样 400、C 未测、GPU 延迟未测、生产环境真实超时未观测
保护范围：Runtime、正式平台、旧桥、真实存档、Project #2、PROJECT_CONTEXT.md、main 未改动；权重/金标/复核包/回执都在仓库外；未新增依赖、未装 CUDA、未训练、未做 MLX/C 修复
```
