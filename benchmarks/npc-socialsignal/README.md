# benchmarks/npc-socialsignal — E1 多版本 Laya SocialSignal 对照预研

执行合同见 [`tasks/E1-LAYA-MODEL-SELECTION-BENCHMARK-TASK.md`](../../tasks/E1-LAYA-MODEL-SELECTION-BENCHMARK-TASK.md)，信号定义出处见 [`WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md` §10.2](../../WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md)。
状态：**pilot 版被 E1R 判 NEED REVISION，M1/M2 与选型验收未通过。** 修正件见 [`E1R-FIXES.md`](E1R-FIXES.md)，其 R1–R5 小节按问题列出了新脚本与新产物（`seal_final.py` / `validate_data_v2.py` / `build_review_artifacts.py` / `inputs.py` / `run_bench_v2.py` / `stability.py` / `make_runtime_copy.py`、`score.py` 已重写、`seal-record-v2.json`、`split-manifest-v2.json`、`calibration/*-lock.json`、`samples/scenarios-final-blind.jsonl`）。下表描述的是 pilot 版，其中盲审包已作废（见 `reviews/README.md`），pilot 原始预测与旧 manifest 全部保留未覆盖。

| 文件 | 内容 |
|---|---|
| `M0-SOURCES.md` | 候选 revision/文件哈希/许可/依赖/主机；SDK 与任务书的 revision 差异；`laya.load()` 改写 checkpoint 目录的实测副作用；C 在本机的具体障碍 |
| `LABEL_SPEC.md` | 五信号中文定义、Actor 可见性规则、矛盾线索裁定、正反例、`信息不足/不确定` 使用条件、盲审协议。**待冻结**（M3 开最终集的前提） |
| `question-templates.json` | 冻结件：body 版式、截断规则、逐信号问题措辞与选项键/顺序、各测试条件定义 |
| `config.lock.json` | `make_lock.py` 生成：包版本、逐文件哈希与官方 revision 比对结果、C 的 blocked 状态与副作用记录 |
| `split-assignment.json` | 家族→切分的互斥归属（F01–F20），防止近似样本跨集合 |
| `samples/src-batch*.jsonl` | 原创场景（含金标与该 NPC 可见依据） |
| `samples/scenarios-{dev,calibration}.jsonl` | 工作切分成品；`final` 只出无标签件 |
| `reviews/blind-package.jsonl` | **可直接转交第三方的全量盲审包**：125 场景，含模型实际收到的输入文本，不含任何金标 |
| `reviews/blind-answer-sheet.jsonl` | 空白答案表，复核者逐信号填写 |
| `split-manifest.json` | 各切分数量、类别分布、`classes_under_20`、内容哈希、`label_freeze`（含 final 金标 sha256 与盲审状态） |
| `scripts/validate_data.py` | 样本合同校验 + manifest 生成（家族互斥、高风险信号必须带依据、重复话轮检测） |
| `scripts/build_dataset.py` | 生成切分成品与盲审包；final 金标写到仓库外并记哈希 |
| `scripts/run_bench.py` | 统一评测器；三模型同一输入；未冻结时**拒绝**跑 final；错误/超时单独记录，不计为正确 |
| `scripts/score.py` | 逐信号指标、多数类与规则基线、跨切分温度校准、按场景配对 bootstrap；`--selftest` 为固定预测复算 |
| `scripts/probe_control.py` | 诊断探针：中/英、带/不带框架、带/不带选项描述四种形状，用来区分"模型不行"还是"出题不行" |
| `M4-DECISION-REPORT.md` | 结果表、五条决定性发现、三层结论、复跑命令、未测清单、§6 回执 |

## 权重与敏感件的位置（都不进仓库）

`D:\ModelBench\laya\weights\{A,B,C}`（约 2.7 GB）、`venv`、`pristine`（加载前的小配置快照）、`sealed`（final 金标）。仓库内只保留哈希、脚本与结果。`results/raw/*` 含 dev/calibration 的金标列，**不要**把 final 的原始预测提交进来。

## 复跑顺序

```
make_lock.py（首次 laya.load 之前）→ validate_data.py → build_dataset.py
→ score.py --selftest → run_bench.py --split dev|calibration → score.py --calibrate-from <另一切分>
```

完整命令与硬件说明见 `M4-DECISION-REPORT.md` §4。
