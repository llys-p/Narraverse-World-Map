# E1R 修正回执（执行者 → 中控）

任务：E1R 修复评测与盲审隔离 ｜ 分支：`codex/laya-model-benchmark` ｜ 复核对象：`e9196ab`（本报告在其后提交）
范围：只动 `benchmarks/npc-socialsignal/`。未安装 CUDA torch、未训练、未启动旧桥、未写 Runtime、未合并 main、未改 `PROJECT_CONTEXT.md` 与看板。pilot 的原始预测、`split-manifest.json`、`seal-record`(v1 语义) 与旧脚本一律保留未覆盖。

## R1 final 金标出仓 + 盲审包去提示

| 动作 | 结果 |
|---|---|
| 拆分 | `scripts/seal_final.py`：final 家族（F09–F20，62 条）的 `labels`/`basis`/`ambiguous_by_design`/`hidden_truth` 从 `samples/src-batch*.jsonl` 中移除；dev/calibration 行**逐行原样保留**，不动 pilot 证据 |
| 金标位置 | 仓库外 `D:\ModelBench\laya\sealed\v2\gold-final.jsonl`，sha256 `e85c67912de649a264e2a65afb130ef633078857b74a0d6849b8b7dbe189617c`（v1 那份 `4b245c18…` 原样保留，只作历史记录） |
| 仓库内 final 输入 | `samples/scenarios-final-blind.jsonl`，62 条无答案，sha256 `bafb177afb19d47e30fae06a09d35087b5b4d206e627a14d201823bcbd11b662` |
| 泄漏扫描 | `seal-record-v2.json → repo_final_gold_scan.status = clean`：全目录 `.jsonl` 逐行扫描，无 final 行携带答案字段；`validate_data_v2.py` 把"final 行含答案字段"直接判为 ERROR |
| 匿名包（仓库外） | `D:\ModelBench\laya\review-pack\blind\`（125 条，sha256 `859f028039e16b7e…`）与 `review-pack\sanity-dev\`（25 条分层抽样，sha256 `b610139560d9fc48…`）；四件套：`review-inputs.jsonl`（仅匿名编号 + 模型可见文本 + 待填槽位）、`answer-sheet.jsonl`（含 `evidence_quote` 摘录栏）、`LABEL_SPEC.md`、`README.md`。家族/切分/标签/依据/作者意图/模型输出一律不在包内 |
| id 映射 | 仓库外 `sealed/v2/id-map-*.json`；包内编号 `E1R-BLIND-xxxx` / `E1R-SANITY-xxxx` 与 sid 无规律可推 |
| 旧包撤回 | `reviews/blind-package.jsonl`、`reviews/blind-answer-sheet.jsonl` 已 `git rm`（历史仍可查），`reviews/README.md` 写明作废原因：**包内含 `ambiguous_by_design` 与 `family`/`split`，且仓库历史含 final 金标** |
| 历史暴露（明确承认） | 提交 `5599c46` / `6adb2bd` / `e9196ab` 的 `samples/src-batch*.jsonl` 含 62 条 final 金标与依据，**可从历史重建，我没有改写历史**（遵 E1R）。因此：读过这些提交、pilot 报告错例清单或本任务讨论中具体例题的人，不得对相关样本充当盲审者；`freeze-gate.json` 要求书面确认 `no_gold_exposure_attested` |

`run_bench_v2.py --split final` 只读 `scenarios-final-blind.jsonl`；`score.py --split final` 必须显式 `--gold <仓库外文件>`，并当场校验其 sha256 等于 `seal-record-v2.json` 的记录值，不符即退出。

## R2 分母固定 + 类别集合统一（附最小反例）

`scripts/score.py` 重写为 `e1r-scores-v1`：

- 主指标分母 = **全部计划场景**；`predict_error`、超时、缺失、非法标签一律计为未答对，另列 `run_success_rate` / `accuracy_returned_only` / `accuracy_accepted_only` / `abstain_coverage_over_planned`，四种口径不混用。
- macro-F1 的类别集合 = 该信号 canonical 顺序中**在金标里有支持**的标签，与"模型预测了什么"无关；模型从未预测且未答对的类别按 0 计入平均。每类 `support/tp/fp/fn/precision/recall/f1` 全列。
- 混淆矩阵显式含 `__MISSING__` 与 `__ILLEGAL__` 两列。
- 完整性校验：重复 `(sid,signal)`、非法 gold、`probs` 出现 NaN/Inf/越界/和不为 1 → 记入 `prediction_integrity_problems` 并报错退出，原始错误保留，不静默修正。
- 基线拆成三条：`oracle_majority`（在被评集事后挑最优常量，只作描述）、`locked_majority`（在 dev 上选定并锁进 `calibration/majority-lock.json`：social_act=合作 / trust=不变 / fear=不变 / deception=信息不足 / boundary=未越过）、`rule`（附 `rule_coverage`，因为关键字规则在 30 条上只触发 1–14 条，单看命中率会骗人）。

最小反例（`score.py --selftest`，现 25 项全通过）：

```
timeout_counts_wrong_accuracy            got 0.5   want 0.5      ← 中控反例：一题正确+一题超时
timeout_counts_wrong_macro_f1            got 0.5   want 0.5
run_success_rate                         got 0.5   want 0.5
returned_only_accuracy_is_separate       got 1.0   want 1.0
confusion_has_missing_column             got 1     want 1
all_failed_accuracy_zero                 got 0.0   want 0.0      ← 全失败不可能得到 100%
illegal_label_not_correct                got 0.5   want 0.5
asymmetric_failures_same_denominator     got (2,2) want (2,2)     ← A/B 同题不同失败，分母仍相同
nan_probs_rejected                       got None  want None
```

**重算 pilot 的差异**：准确率完全不变（本轮无缺失/失败，`problems=0`），macro-F1 因类别集合固定而变化——dev：A `social_act` 0.069→0.0833、`fear_shift` 0.179→0.2381；B `social_act` 0.142→0.170、`trust_shift` 0.229→0.3056、`fear_shift` 0.122→0.1621；calibration：A `social_act` 0.175→0.2095、`trust_shift` 0.223→0.297、`fear_shift` 0.189→0.251、`boundary` 0.251；B `social_act` 0.184→0.2215。新结果写入 `results/scores-{dev,calibration}-primary.e1r.json`，旧 `scores-*.json` 未覆盖。

顺带一个读数陷阱，值得写进 E1 的指标口径：**calibration 上 `deception` A 准确率 0.667 看着远高于锁定多数类 0.212，其实是 A 几乎恒答「无线索」（该切分 22/33 是无线索）**，同一格 macro-F1 只有 0.288。单看准确率会得出与 F1 相反的结论。

## R3 最终集只评分 + 冻结不能只看布尔

- CLI 层面**删除** `--calibrate-from`（中控的反例 `--split dev --calibrate-from final` 现在直接是 argparse 错误：这个接口不存在了）。
- 新增 `--fit-calibration`：唯一合法拟合集是 `calibration`，其他切分一律拒绝；产出 `calibration/temperature-lock.json`（记录每个 model×signal 的温度、拟合样本量、class set、来源文件）。温度值：A `social_act` 20.0(顶到下界=压平)、`trust` 1.0917、`fear` 8.9427、`deception` 2.2693、`boundary` 1.7277；B 6.0838 / 0.382 / 20.0 / 0.7718 / 0.8167。
- 评 dev 时套用该锁 = 样本外（`ece_calibrated_applied`）：A `social_act` 0.347→0.080 改善，但 A `trust` 0.212→0.247、A `fear` 0.129→0.222、B `trust` 0.066→0.199 **变差**——跨切分传递不可靠。calibration 自身套同一锁是样本内，已在报告里标为不构成证据。pilot 的 dev↔calibration 交叉试验降格为诊断，不作最终验证。
- `--allow-unfrozen` 取消。final 开跑/评分前，`verify_freeze_gate()` 逐项校验：`status=frozen`、两名复核者、`independent` 与 `no_gold_exposure_attested` 为真、裁定完成且裁定人非原标注人、`samples_sha256`/`templates_sha256`/`model_config_sha256`/`calibration_sha256` 与**当前文件实算哈希**一致、`scenario_count` 与实际条数一致，且 `final_split_opened_before` 不为真。
- 反例实测（全部拒绝）：`--fit-calibration --split final`／`--split dev` → 拒；无 gate → 拒；伪造 gate 但四个哈希全错 → 四条 `does not match the current …(frozen artifact changed)` 全报出；`run_bench_v2 --split final` 同样拒绝。
- `build_review_artifacts.py` 打印 `preserved (not rewritten)` 并只写 v2 文件；`validate_data_v2.py` 若发现已有 `label_freeze`/`blind_review`/`frozen_at` 会**原样携带**，重跑验证器不能把冻结信息洗掉。

## R4 稳定性条件真跑（dev，CPU，A/B 各 7 次运行）

| 条件 | A 判定不变率 | B 判定不变率 | 说明 |
|---|---|---|---|
| `perm_rotated` | 0.620（翻 57/150） | 0.607（59/150） | 仅调选项顺序 |
| `perm_reversed` | 0.673（49/150） | 0.647（53/150） | 同上，反向 |
| `paraphrase` | 0.683（19/60） | 0.717（17/60） | 12 条 dev 场景的作者等义改写（`samples/paraphrase-dev.jsonl`，含逐条 `why`；**未经独立确认**，翻转可能是改写走了语义） |
| `long`（真预算 768 token） | 1.000（0 翻转，0 截断） | 1.000 | 诚实结果：dev 样本太短（state 中位 68 token，head 实测中位 46/256），**根本没触发截断**。dev 缺长上下文样本，是补样要修的缺口（F17 目前只落在 final） |
| `probe_malformed`（5 种异常 × 5 信号） | 15 确定回答 / 10 拒答 / **0 报错** | 13 / 12 / **0 报错** | 空 body、只称呼应、超长、纯英文、含控制字符——两款模型都不报错，且多数照样给确定答案 |
| 强制小预算（`--max-len 320`，仅为验证截断代码路径） | 90 项删行、35 项丢掉 `已知边界` | 同 | 删的是最旧的 `既往` 行，顺序符合政策；`items_losing_decisive_evidence=0` **不是好消息**——dev 行没有 `decisive_evidence` 字段，"删掉判断依据就必须重审标签"这条检测还没数据可触发，补样时要补这个字段 |

置换映射用 stable semantic id（选项键即语义标签，`semantic_labels` 与 `requested_criteria_order` 都写进原始预测），映射回原标签无误；超时是真界：`threading` + `join(timeout_s)`，默认 120 s，本轮**没有触发超时**，触发时会写成 `predict_error=TIMEOUT>` 记录并计为未答对，不会退回 primary。延迟（本机 CPU，batch=8，每判定项）：A 中位 225.8 ms、B 162.8 ms——这是**CPU 数**，不代表 4060 部署形态。原始预测存 `results/raw/{A,B}-dev-{condition}.e1r.jsonl`（含 `body_text`、token 数、被删行、置信），分析在 `results/stability-dev.json`。

## R5 标签规范、复现与措辞

- `LABEL_SPEC.md` §0.3：**废止**"看到 `ambiguous_by_design` 就判不确定"；改为金标只能来自可见文本，作者意图不参与，复核者拿不到任何作者标记。
- §4：**反讽/调侃/虚构/不可核实陈述与欺骗线索分开**——反讽默认不是欺骗（归 `social_act` 的语气维度）；不可核实自陈 → `信息不足`；故事/假设/戏文 → `无线索`；给 `有线索` 必须同时指出"哪句陈述"与"与哪条可见事实相抵"。
- §5：边界信号拆成两条轴（A. 该 NPC 是否知道这条边界 → 决定能不能判；B. 玩家是否被告知 → 只影响解释与 `trust_shift`，不影响越没越）。
- `M4-DECISION-REPORT.md` 顶部加了勘误横幅，明确降级三处结论（换模型无用 / 排除出题因素 / 最终集重拟），并指出其 macro-F1 已被 R2 重算取代。
- 确定性 fallback 的措辞改正：只处理**结构化、已知、可核验**的事件与规则；当自由文本里的事实无法可靠提取时返回"未知/不改变状态"，不写成"规则已解决自由文本欺骗检测"。
- 复现命令修正：pilot 里 `.. \venv\...` 这种无效相对路径全部换成绝对路径；环境依赖以 `config.lock.json` 的包版本为准。
- 只读来源 + 运行副本：`scripts/make_runtime_copy.py` 把 `weights/<M>` 复制到 `runtime/<M>`，`run_bench_v2` 只加载副本，并写 `RUNTIME-COPY.json` 记录源文件逐文件 sha256。理由是实测到 `laya.load()` 会就地改写 `tokenizer_config.json`。**不再声称"加载前哈希一致"就能证明运行时配置一致**——副本目录里被 SDK 改了什么，要靠源/副本哈希对比现场取证。
- 清理误提交的 `scripts/__pycache__/body.cpython-311.pyc` 与 `score.cpython-311.pyc`（`git rm` 已删，工作树也删），新增 `benchmarks/npc-socialsignal/.gitignore` 忽略 `__pycache__/`、`*.pyc`。只动了这两个文件，没碰模型文件或别的目录。

## 还没做完的

1. **补样**：现在总计 125（dev 30 / cal 33 / final 62），距合同 300–500 与 final ≥150 还差很多；final 里 `social_act:威胁/不确定`、`fear_shift:下降/不确定`、`deception:有线索` 支持量 <20，仍标"证据不足"。稀有类定向补样要用**新情节/新措辞家族**，不用同句改名；挑战集过采样比例要单列。
2. **dev 缺长上下文样本**：`long` 条件在 dev 上等于空跑，补样时要给 dev 也放长样本，并给场景加 `decisive_evidence` 字段，让"删依据→重审标签"的检测真能触发。
3. **盲审未派出**：25 条试审包已就绪（在仓库外），需要中控安排两名互不相识、未接触过金标的复核者；回收后我先做逐信号一致率/κ/支持量/分歧清单，再裁定、再冻结。`freeze-gate.json` 目前不存在 = final 物理上打不开。
4. **等长输入条件在 dev 定稿后**才在 calibration 上做参数拟合与阈值检查，final 只评分一次。
5. **C 仍未测**（未继续 MLX 修复、未做权重转换）；**CUDA 未装**，本轮所有延迟都是 CPU 数。

## 回执

```text
任务：E1R 修复评测与盲审隔离（先修工具与隔离，再补样，暂不装 CUDA/不训练）
修正提交 SHA：本文件所在提交（分支 codex/laya-model-benchmark HEAD，见推送后回执消息）；pilot 基准 e9196ab，main 已 merge（E1R 任务书 67fadfb）
R1～R5 对应文件：R1 scripts/seal_final.py, scripts/build_review_artifacts.py, samples/scenarios-final-blind.jsonl, samples/src-batch*.jsonl(已拆), seal-record-v2.json, reviews/README.md, 撤回 reviews/blind-*；R2 scripts/score.py(重写), calibration/majority-lock.json, results/scores-*.e1r.json；R3 scripts/score.py(--fit-calibration/verify_freeze_gate), scripts/run_bench_v2.py, calibration/temperature-lock.json, scripts/validate_data_v2.py(携带冻结)；R4 scripts/inputs.py, scripts/run_bench_v2.py(条件/超时/截断), scripts/stability.py, samples/paraphrase-dev.jsonl, results/raw/*-dev-*.e1r.jsonl, results/stability-dev.json；R5 LABEL_SPEC.md, M4-DECISION-REPORT.md(勘误横幅), scripts/make_runtime_copy.py, .gitignore, pyc 清理
封存/盲审扫描结果：repo_final_gold_scan=clean；final 金标 sha256 e85c67912de649a2…（仓库外）；final 无标签输入 sha256 bafb177afb19d47e…；盲审包 sha256 859f028039e16b7e…(125 条)、试审包 b610139560d9fc48…(25 条)，两包与 id-map 均在仓库外；历史提交可重建旧金标这一事实已写明并附复核者排除规则
R2/R3/R4 最小反例命令与结果：见上文三节，共 score.py --selftest 25 项通过（含超时→0.5、全失败→0.0、非法标签、A/B 异题失败同分母、NaN probs 拒绝）；final 作拟合集拒绝、无 gate 拒绝、四个冻结哈希被改各报一条、run_bench --split final 拒绝
重算 pilot 的差异：准确率逐格不变（无缺失/失败）；macro-F1 因类别集合固定而上调若干格，明细见 R2 节；旧 scores-*.json 未覆盖
匿名试审包哈希：review-pack/sanity-dev/review-inputs.jsonl sha256 b610139560d9fc48c6f619e37fe02a2445fbd572b38af1021535bce9c04b07c9（25 条）
未完成的补样/复核/模型条件：总量 125 未达 300–500、final 62 未达 ≥150、稀有类支持量不足、dev 无长上下文样本、缺 decisive_evidence 字段、盲审未派出未回收、final 未打开、C 未测、GPU 延迟未测
保护范围：Runtime、正式平台、旧 Laya/CUDA 桥、真实存档、GitHub Project #2、PROJECT_CONTEXT.md、main 均未改动；权重/venv/金标/复核包都在仓库外
```
