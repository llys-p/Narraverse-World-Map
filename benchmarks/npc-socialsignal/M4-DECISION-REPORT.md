# M4：E1 决策报告（预研，未验收）

任务：E1 多版本 SocialSignal 预研 ｜ 分支：`codex/laya-model-benchmark` ｜ 基准 SHA：`f28ed3e975d345b89375eadda8096e94bfa0c57a`
结论级别：**暂定预研排序**。理由：外部全量盲审尚未回收，且最终测试集（62 场景）尚未打开。按任务书 §4，无独立复核即不得声称可靠选型或生产准入。

## 0. 一句话结论

在本项目自建的中文 NPC 社会交互样本上，**两款可在本机原样运行的现成 checkpoint（A 官方 multilingual、B SGK86 typed-decisions）在五个核心信号上基本都打不过"永远回答多数类"这条基线**；两者失败高度同源（同底座、错在同一批样本），换模型不解决问题。因此本轮不推荐任何 SocialSignal 进入 Runtime，建议把 E 阶段的下一步改为"先做数据与标注，再以 Apache-2.0 官方 multilingual 为底座开微调任务"。候选 C（MLX 中文版）本机无法加载，按任务书标**未测**，其模型卡分数没有被当作任何依据。

## 1. 实测结果（A、B 各 315 个判定项：dev 30×5=150 + calibration 33×5=165）

dev=30 场景、calibration=33 场景，同一批输入、同一问题措辞、同一选项与顺序分别喂给 A 与 B。`maj` = 多数类基线，`ch` = 随机水平（=1/选项数）。温度 T 由**另一个切分**拟合后套用（跨切分校准，避免自评）；`ece` 为原始，`eceC` 为校准后。

### dev（n=30，T 拟合于 calibration）

| 信号 | A acc | B acc | maj | ch | A f1 | B f1 | A T | A ece→eceC | B ece→eceC |
|---|---|---|---|---|---|---|---|---|---|
| social_act | 0.100 | 0.200 | **0.433** | 0.167 | 0.069 | 0.142 | 20.0(饱和) | 0.347→0.080 | 0.132→0.040 |
| trust_shift | 0.600 | 0.300 | **0.667** | 0.250 | 0.381 | 0.229 | 1.09 | 0.212→0.247 | 0.066→0.199 |
| fear_shift | 0.500 | 0.133 | **0.667** | 0.250 | 0.179 | 0.122 | 8.94 | 0.129→0.222 | 0.231→0.123 |
| deception | 0.367 | 0.333 | **0.500** | 0.333 | 0.198 | 0.279 | 2.27 | 0.363→0.243 | 0.116→0.178 |
| boundary_violation | 0.567 | 0.467 | 0.533 | 0.333 | 0.382 | 0.322 | 1.73 | 0.235→0.164 | 0.041→0.119 |

### calibration（n=33，T 拟合于 dev）

| 信号 | A acc | B acc | maj | ch | A f1 | B f1 | A T | A ece→eceC | B ece→eceC |
|---|---|---|---|---|---|---|---|---|---|
| social_act | 0.182 | 0.182 | **0.303** | 0.167 | 0.175 | 0.184 | 20.0(饱和) | 0.352→0.001 | 0.169→0.104 |
| trust_shift | 0.455 | 0.515 | 0.455 | 0.250 | 0.223 | 0.477 | 0.98 | 0.058→0.063 | 0.175→0.203 |
| fear_shift | 0.394 | 0.182 | **0.636** | 0.250 | 0.189 | 0.152 | 4.28 | 0.132→0.079 | 0.188→0.096 |
| deception | 0.667 | 0.576 | 0.667 | 0.333 | 0.288 | 0.259 | 3.02 | 0.289→0.288 | 0.122→0.237 |
| boundary_violation | 0.394 | 0.394 | **0.515** | 0.333 | 0.251 | 0.272 | 1.11 | 0.340→0.266 | 0.122→0.125 |

10 个（信号×切分）格子里，模型准确率高于多数类基线的只有 **1 格**（dev/boundary_violation A：0.567 vs 0.533，差 +0.034，在 n=30 下无意义）。macro-F1 全域 0.07–0.48，没有一个信号达到可讨论准入的水平。

### 按场景配对的差值（95% bootstrap，2000 次，场景为重采样单位）

| 信号 | dev：A−B [CI] | calibration：A−B [CI] | 判定 |
|---|---|---|---|
| social_act | −0.100 [−0.233, 0.000] | 0.000 [−0.091, 0.091] | 无法区分 |
| trust_shift | +0.300 [0.067, 0.533] | −0.061 [−0.303, 0.182] | **方向在两个切分里相反 → 不稳定，不能据此排序** |
| fear_shift | +0.367 [0.100, 0.633] | +0.212 [0.061, 0.364] | 唯一在两切分都显著的优势，A 优于 B |
| deception | +0.033 [−0.133, 0.200] | +0.091 [0.000, 0.182] | 无法区分 |
| boundary_violation | +0.100 [−0.100, 0.300] | 0.000 [−0.212, 0.212] | 无法区分 |

三款不同作者的模型卡分数（B 的 0.786、C 的 0.750）没有被相互相减，也没有与本机数字混算。

## 2. 四条决定性发现

**(1) 两个模型都几乎不会说"信息不足"。** 在 dev 上 A 与 B 把**全部 15 个**金标为 `信息不足` 的 deception 样本判成了确定类别；calibration 上 7 个全错。边界信号同样：`信息不足` 金标 2 个里错 2 个。这不是精度问题，而是**拒答通道不存在**——E2 想要的"NPC 不知道就不能写进世界"的语义，现成模型给不出来。样例：E1-S033「这对银簪是我娘的陪嫁，你替我存几日」（陪嫁无从核实 → 金标 信息不足），A/B 都判 `有线索`，即当场把 unverifiable 当成骗。

**(2) 披露—守规这条维度上，两者都判反。** E1-S031「里头是什么我先不说了」金标 `已越过`（触她"不代收说不清内容的东西"），A/B 都判 `未越过`；E1-S032「还是账本，我当面打开给你数一遍再收」金标 `未越过`，A/B 都判 `已越过`。方向系统性相反，不是随机噪声。

**(3) 失败是模型侧的，不是我的题目格式。** 五个"一眼该对"的对照探针（`scripts/probe_control.py`，属诊断件，不计入主指标）在四种输入形状下的正确率：`zh_full` 2/5、`en_full` 2/5、`zh_plain` 2/5、`zh_nodesc` 0/5。**英文与中文错在同一批样本上**（P1 威胁→中性、P4 求助→示好、P5 有线索→无线索，两种语言全错），所以不能用"它中文不行"解释，也不能用"我出题方式不对"解释。P5 是当场矛盾：NPC 三分钟前亲眼看着他从现在屋里出来，玩家说"我从没进过你屋子"，A 判 `无线索` 置信 0.87。选项描述不能删（`zh_nodesc` 归零），说明保留 criteria 描述是对的。

**(4) 单温度校准救不了，而且校准集不够稳。** 跨切分拟合的温度在 0.98 到 20.0 之间乱跳，`social_act` 两个切分都把 T 顶到搜索上界 20（即似然函数说"这个问题不带信息，把分布压平"）。校准后 ECE 有时降（dev/social_act 0.347→0.080）有时升（dev/fear_shift 0.129→0.222）。含义：在小样本上拟合的校准不可移植，E2 若要用任何阈值门控，必须在冻结后的最终集上重拟并复核，而不是拿这轮数字定阈值。

**(5) 同底座 ⇒ 失败相关 ⇒ 横向选型收益低。** A、B、C 都从 `laya-multilingual` 微调而来，tokenizer 完全一致。本轮里两者答错的样本大量重合（S003/S031/S032/S033 等）。所以"换一家第三方 checkpoint"不会把危险误判换掉。

## 3. 三层结论（任务书 §5 要求）

### ① 当前实验默认模型

**证据不足，不给出第一名。** 唯一在两切分都成立的成对差异是 fear_shift 上 A 优于 B（+0.37 / +0.21），而 A 在 fear_shift 的绝对成绩（0.50 / 0.39）仍低于多数类基线（0.67 / 0.64），赢的那一项本身也不可用。若中控坚持要在预研层面留一个"后续微调底座"，从许可与可控性出发选 **A（官方 `laya-multilingual`，Apache-2.0，共同基线，无第三方改动面）**；这不是准入结论。

### ② 逐信号建议

| 信号 | 本轮判定 | 依据 | 下一步 |
|---|---|---|---|
| `social_act` | **禁用 + 确定性 fallback** | acc 0.10–0.20 < 多数类 0.30–0.43；F1 ≤0.18；T 压到上界即"无信息"；探针 P1/P4 全形状皆错 | 不作为世界输入。交互性质由规则/意图标签判定 |
| `trust_shift` | **证据不足，需微调后再评** | 0.455–0.60，均 ≤ 多数类；成对差在两切分反向 | 不接入。若要救，需带履约/违约结构标注的微调集 |
| `fear_shift` | **证据不足，需微调后再评** | 0.133–0.50 < 多数类；B 拒答率 0.27–0.30 过高 | 不接入 |
| `deception` | **禁用 + 确定性 fallback（安全优先）** | 从不给 `信息不足`（15/15、7/7 全错），把"无从核实"判成"有欺骗线索"；P5 当场矛盾判 `无线索` 置信 0.87 | 危险误判不可接受。欺骗线索一律不由模型写入，改由可核验事实比对 |
| `boundary_violation` | **禁用 + 确定性 fallback** | 披露维度系统性判反（S031/S032 双向错）；`信息不足` 金标 2/2 错 | 边界判定本可由"边界是否声明 + 行为是否触线"的规则完成，无需模型 |

`hostility` / `credibility` 扩展层本轮**未纳入**：核心五信号未过，纳入只会稀释结论（任务书 §4 的顾虑被本轮证实）。

### ③ 是否另开 `laya-narraverse-social-v1` 微调

**建议开，但前置条件是数据而不是模型。** 理由：零样本在这批任务上不及多数类，英文同样失败，说明缺的是任务对齐而非语言能力的边际改进；这正是官方模型卡自己给出的路径（"Near chance on typed-decisions zero-shot… Fine-tune for a specific workflow; that is where the capability comes from"）。底座选官方 multilingual 的理由是许可明确（Apache-2.0）、可与本轮基线直接对比、且无第三方 checkpoint 的来源不明风险。

微调任务开工前必须先解决三件事（都不在本任务范围内，也不应由我自行启动）：
1. 标注产能：本轮 125 个自创场景够做出判断，不够喂训练。需要成百上千条、按 Actor 可见性规则标注、含 `信息不足` 正例的数据。
2. 独立复核机制：否则微调出来的指标同样是自证。
3. 保留 `deception`/`boundary_violation` 的确定性替代路径：即使微调成功，这两类信号我建议继续由规则判定，模型只做提示不做世界写入。

**本任务未执行 fine-tune，未编写 E2 Adapter，未修改 World Runtime / NPC 行为规则 / 旧 Laya 桥 / 正式平台。**

## 4. 复跑命令

```powershell
# 0) 环境（权重与环境依赖不进仓库；约 2.7 GB 权重 + 依赖）
python -m venv D:\ModelBench\laya\venv
D:\ModelBench\laya\venv\Scripts\python.exe -m pip install "huggingface_hub[cli]" laya "mlx[cpu]" laya-mlx
$env:PYTHONUTF8=1; $env:USE_TF=0

# 1) 按固定 revision 取权重，并核对哈希（64位=LFS sha256，40位=git blob sha1）
D:\ModelBench\laya\venv\Scripts\hf.exe download convaiinnovations/laya-multilingual --revision 1720e3e3357cfe1e281542e223f8273b0890ca34 --local-dir D:\ModelBench\laya\weights\A
D:\ModelBench\laya\venv\Scripts\hf.exe download SGK86/laya-multilingual-typed-decisions --revision 8fc29deeba77c74004756dfd64217287b1e52e47 --exclude "checkpoint_latest/*" --local-dir D:\ModelBench\laya\weights\B
D:\ModelBench\laya\venv\Scripts\hf.exe download ZLHAOOO/laya-mlx-zh --revision 0d5398ca9f41d5a7823e536eb6ad58e53c86872b --local-dir D:\ModelBench\laya\weights\C

cd D:\ModelBench\laya\repo\benchmarks\npc-socialsignal

# 2) M0：重建 lockfile（须在首次 laya.load 之前跑，否则 tokenizer_config 已被改写，见 M0-SOURCES §3(b)）
.. \venv\Scripts\python.exe scripts\make_lock.py --base D:/ModelBench/laya

# 3) M1：校验样本与切分（家族不跨切分、高风险信号必须带依据、无重复话轮），再生成盲审包
.. \venv\Scripts\python.exe scripts\validate_data.py
.. \venv\Scripts\python.exe scripts\build_dataset.py --sealed-out D:/ModelBench/laya/sealed

# 4) M2 自检：固定预测上的指标复算（15 项，含 Brier 约定、缺失不计正确、温度拟合、置换索引合法性）
.. \venv\Scripts\python.exe scripts\score.py --selftest

# 5) M3 pilot：dev / calibration
$SA="9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204"
$SB="194544a0ff0f05e681dc637d397a92f5d46c80da00d1d0c7912502b64187c98f"
foreach ($sp in "dev","calibration") { foreach ($m in "A","B") {
  $h = if ($m -eq "A") { $SA } else { $SB }
  .. \venv\Scripts\python.exe scripts\run_bench.py --model $m --split $sp --condition primary --weights "D:/ModelBench/laya/weights/$m" --sha256 $h --device cpu --batch-size 8
}}
$other = @{dev="calibration"; calibration="dev"}
foreach ($sp in "dev","calibration") {
  .. \venv\Scripts\python.exe scripts\score.py --models A,B --split $sp --condition primary --calibrate-from $other[$sp]
}

# 6) 诊断探针（不计入主指标）
.. \venv\Scripts\python.exe scripts\probe_control.py A

# 7) 最终测试集在盲审回收并裁定前保持封存；run_bench 会直接拒绝，除非显式授权
.. \venv\Scripts\python.exe scripts/run_bench.py --model A --split final --condition primary ...
```

原始预测：`results/raw/{A,B}-{dev,calibration}-primary.jsonl`（每行含 `sid/signal/gold/predicted/probs/answer_confidence/usage.input_tokens/wall_ms_per_item/option_order`），运行元数据同目录 `.meta.json`；分数：`results/scores-{split}-primary.json`；探针：`results/probe-A-shapes.json`。

## 5. 未测 / 不可比 / 与任务书的偏差（如实列出）

| 项 | 状态 | 说明 |
|---|---|---|
| 候选 C 全部指标 | **未测** | `import mlx.core` 在本机失败；没有用模型卡分数顶替 |
| C 的吞吐/延迟 | **不可比** | 需要 Apple Silicon；本机连预测质量都未取得 |
| GPU/CUDA 部署路径 | **未测** | 装的是 torch CPU wheel。官方毫秒数未被当作本机承诺 |
| `final` 最终盲测 | **未打开** | 62 场景已封存（金标签在仓库外，sha256 记入 manifest）；评测器会拒绝在未冻结状态运行 |
| 样本规模 | **低于目标** | 125 < 300～500，final 62 < 150。按 §4 全部结论属"探索结果/证据不足" |
| 逐类别最小 20 | **部分未达** | final 中 `social_act:威胁/不确定`、`fear_shift:下降/不确定`、`deception:有线索` 均 <20，见 `split-manifest.json` 的 `classes_under_20` |
| 长输入 / max_len 8192 / 选项置换 / 等义改写 | **未跑** | 条件已在 `question-templates.json` 与评测器里定义好，需在冻结后的 final 上执行 |
| 空/异常输入探针 | **未跑** | 同上 |
| 独立盲审 | **未回收** | 结论级别封顶为暂定预研排序；本轮标签只有我一轮自标注（含逐样本依据） |
| mia-laya 情感参考 | **未使用** | 本轮未纳入，避免与主五信号混算 |

## 6. 回执

```text
任务：E1 多版本 SocialSignal 预研
仓库目录、分支、基准 SHA、交付 SHA：D:\ModelBench\laya\repo ｜ codex/laya-model-benchmark ｜ 基准 f28ed3e975d345b89375eadda8096e94bfa0c57a ｜ 交付 5599c465dbd7511a4f7f31293f0659da49541723（本分支已推送；提交作者按仓库既有约定写成 llys-p <llys-p@users.noreply.github.com>，本机未设置 git 身份，我用的是逐命令覆盖，没有改你的 git config）
未提交改动及归属：本任务全部改动仅位于新建的 benchmarks/npc-socialsignal/；权重、venv、密封金标签在仓库外 D:\ModelBench\laya\，不提交
模型版本/文件哈希/许可/SDK/硬件：A 1720e3e3 / 9d628fd971b70038…；B 8fc29dee / 194544a0ff0f05e6…；C 0d5398ca / de30b056fa1540ae…（已下载未运行）；均标 Apache-2.0；laya 0.3.28 + torch 2.14.1(CPU) + transformers 5.18.0；Windows 10.0.26200 x64 / Python 3.11.5 / RTX 4060 未用于推理
数据集大小、切分哈希、标注复核与争议：125 场景（dev 30 / calibration 33 / final 62，家族互斥切分）；validate_data.py errors=0；final 金标签 sha256 4b245c18a634322550f537f5be46702f4900c7633c69743debb342ccac5efcbc，存放于仓库外；独立复核＝外部全量盲审，尚未回收，故本轮只有一轮自标注
逐信号结果、配对区间与危险误判：见 §1 两张表与配对表。10 格中仅 1 格高于多数类基线（dev/boundary +0.034，无意义）。唯一两切分一致的优势：fear_shift A>B（+0.367 [0.100,0.633]；+0.212 [0.061,0.364]），而该项绝对值仍低于基线。危险误判：deception 的信息不足金标 15/15 与 7/7 全部被判成确定类；boundary 披露维度双向判反（S031/S032）；探针 P5 当场矛盾以 0.87 置信判"无线索"
复跑命令、原始预测/报告路径：§4；results/raw/{A,B}-{dev,calibration}-primary.jsonl、results/scores-{dev,calibration}-primary.json、results/probe-A-shapes.json、M0-SOURCES.md、本文件
结论：①实验默认模型＝证据不足（若只论微调底座倾向 A，非准入）；②逐信号＝social_act/deception/boundary_violation 禁用+确定性 fallback，trust_shift/fear_shift 证据不足需微调后再评；③建议另开 laya-narraverse-social-v1，但前置条件是标注产能与独立复核，不在本任务执行
未测/不可比/失败及原因：见 §5（C 本机 MLX 加载失败；GPU 路径未测；final 未打开；样本量低于合同；长输入/置换/等义改写探针未跑；盲审未回收 → 暂定预研排序）
保护范围：Runtime、正式平台、旧 Laya/CUDA 桥、真实存档、GitHub Project #2 均未改动；未合并 main
另：`PROJECT_CONTEXT.md` 与看板由中控收口更新，本任务书 §6 也规定回执后由中控写入，因此我没有改这两个文件；本分支的新增内容全部位于新建目录 benchmarks/npc-socialsignal/
```
