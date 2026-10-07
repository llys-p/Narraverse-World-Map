# reviews/ — 盲审件状态

## v1（已撤回，不要使用）

`blind-package.jsonl` 与 `blind-answer-sheet.jsonl` 是 pilot 版盲审包，**存在两处使盲审失效的缺陷**，已由 E1R 判定作废：

1. 包内含 `ambiguous_by_design` 与 `split`、`family` 字段。`ambiguous_by_design` 直接告诉复核者"这条应该判不确定/信息不足"，等于发放答案提示；`family`/`split` 让复核者能反查到仓库里的类别分布。
2. 包放在仓库内，而仓库历史提交（`5599c46` / `6adb2bd` / `e9196ab`）的 `samples/src-batch*.jsonl` 当时含有 final 全部 62 条金标与依据。**只要复核者能读仓库，盲审就不成立。**

这两个文件保留在版本历史中作为缺陷证据，不再作为交付件。

## v2（当前有效，生成在仓库之外）

由 `scripts/seal_final.py` 生成，位于仓库外（路径与哈希记录在仓库根的 `seal-record-v2.json`）：

| 目录 | 内容 | 用途 |
|---|---|---|
| `<pack>/sanity-dev/` | 25 条匿名 dev 场景：`review-inputs.jsonl` + `answer-sheet.jsonl` + `LABEL_SPEC.md` + `README.md` | **先做的标签规范试审**：只看规范是否能把人引到同一答案，不看模型 |
| `<pack>/blind/` | 全部 125 条匿名场景，同样四件套 | 规范修正定稿后的完整盲审 |

包里只有匿名编号、模型实际可见的文本、统一规范和空白答案表；没有家族、切分、标签、依据、作者意图标记，也没有任何模型预测或报告。id→sid 映射表在 `<sealed>/v2/id-map-*.json`，同样在仓库外。

## 谁不能当复核者

读过原标签、pilot 报告、`M4-DECISION-REPORT.md` 的错例清单，或本任务相关讨论中具体例题的人，不得对应用样本充当盲审者；两位复核者互相独立，裁定人不得是原标注人。回执里要书面确认这一点（`freeze-gate.json` 的 `no_gold_exposure_attested`），不能默认成立。

## 回收之后要做的事

逐信号算一致率、κ、每类支持量与分歧清单（不是一个总体 κ）；分歧交非原标注人裁定；文本证据不足以支撑任一方时改判 `不确定`/`信息不足` 或降级为诊断样本并补新 final。全部完成后写 `freeze-gate.json`（status=frozen），`run_bench_v2.py --split final` 与 `score.py --split final` 才会放行。
