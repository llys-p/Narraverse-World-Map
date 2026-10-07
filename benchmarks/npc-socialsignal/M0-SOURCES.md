# M0：候选来源、哈希与可运行性核对

核对时间：2026-10-07（Asia/Shanghai）。基准 SHA：`f28ed3e975d345b89375eadda8096e94bfa0c57a`（main）。任务分支：`codex/laya-model-benchmark`。本工作包只做来源与可运行性核对，未做训练、未接入 Runtime、未启动旧 Laya/CUDA 桥、未运行浏览器 E2E、未调用任何付费接口。

## 1. 实际运行主机

| 项 | 值 |
|---|---|
| OS | Windows 10.0.26200 x64 |
| CPU/内存 | 16 GB 物理内存笔记本 |
| GPU | NVIDIA GeForce RTX 4060 Laptop 8188 MiB，驱动 595.71 |
| Python | 3.11.5（venv：`D:\ModelBench\laya\venv`） |
| torch | 2.14.1，**CPU wheel**（因此推理实际跑在 CPU；GPU 部署路径未测，见 §6） |
| 磁盘 | 权重与缓存全部在 `D:\ModelBench\laya\`，未写入任何项目目录 |

依赖版本（`pip list` 实测）：`laya 0.3.28`、`laya-mlx 0.3.0`、`mlx 0.32.3`、`torch 2.14.1`、`transformers 5.18.0`、`tokenizers 0.23.2`、`huggingface_hub 1.33.0`、`numpy 2.4.6`、`safetensors 0.8.0`。

## 2. 三款候选与哈希

| | 仓库 | 固定 revision | model.safetensors SHA256 | 许可标注 | 模型卡自报（**不是本项目成绩**） | 本机状态 |
|---|---|---|---|---|---|---|
| A | `convaiinnovations/laya-multilingual` | `1720e3e3357cfe1e281542e223f8273b0890ca34` | `9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204` | Apache-2.0 | 无 NPC 相关自报；卡上自承零样本 typed-decisions 0.342（随机 0.318，多数类 0.461） | **已测**，可离线原样运行 |
| B | `SGK86/laya-multilingual-typed-decisions` | `8fc29deeba77c74004756dfd64217287b1e52e47` | `194544a0ff0f05e681dc637d397a92f5d46c80da00d1d0c7912502b64187c98f` | Apache-2.0 | 0.786，作者自己的 typed-decisions 测试集 | **已测**，可离线原样运行 |
| C | `ZLHAOOO/laya-mlx-zh` | `0d5398ca9f41d5a7823e536eb6ad58e53c86872b` | `de30b056fa1540ae8aca4c7f45fbd8344f6687d2726111eaf5bb246e1c3fd887` | Apache-2.0 | 0.750 vs 0.681，9 任务头 1116 held-out 决策 | **未测**，本机无法加载（§5） |

三份权重互不相同（SHA256 与字节数都不同：A 643835514、B 643835524、C 643835426），而 `tokenizer/tokenizer.json` 三家完全一致（`609d8f4c067cd395…`）——同一 tokenizer、不同权重，这是"同卷公平对照"成立的前提。B 仓库里 `model.safetensors` 与 `checkpoint_latest/model.safetensors` 是同一份哈希，我下载时排除了 `checkpoint_latest/*`，不丢信息。

哈希核对方法（可复跑）：`GET https://huggingface.co/api/models/{repo}/tree/{revision}?recursive=1&blobs=1`，取 `lfs.oid`。**64 位十六进制是 LFS 对象的 SHA256；40 位是普通 git blob 的 SHA1**，两者不能混比——把小文件的 `oid` 当 SHA256 比会产生假失配，我第一次就踩了这个。`scripts/make_lock.py` 已按长度分支处理，本机结果：A 7/7、B 8/8、C 7/7 全部与官方 revision 一致。

## 3. 两处必须让中控知道的来源差异

**(a) SDK 自带的 revision 与任务书固定的 revision 不同。** `laya.PINNED_REVISIONS` 把 `convaiinnovations/laya-multilingual` 钉在 `e4e9ddf21a7b1903b7acffd8814ad4307bf63a67`，而任务书核对的是 `1720e3e3…`。我按任务书用 `--revision 1720e3e3…` 下载并逐字节验证，评测器用本地目录加载，所以本 benchmark 跑的是**任务书固定的那一版**，不是 SDK 默认版。若有人主张两者等价，需要另行 diff。

**(b) `laya.load()` 会就地改写 checkpoint 目录。** 实测：加载 A 之后 `tokenizer/tokenizer_config.json` 从 502 字节（blob `eea1ed61…`）变成 545 字节（blob `1c711b65…`），`extra_special_tokens` 被 transformers 由 list 重写成 dict。权重与 `tokenizer.json` 未被改动（SHA256 复核一致），所以**预测结果不受影响**，但任何"加载之后再哈希整个目录"的复现检查都会报假失配。处理方式：`config.lock.json` 由加载前的 pristine 快照生成，小配置文件另存 `D:\ModelBench\laya\pristine\<ID>\` 便于还原复核。

## 4. 模型卡中与本合同直接相关的限制（A，2026-10-07 核对原文）

- 结构 mmBERT-base 307M + 决策头，总 322M；**每问预算 1024 token，其中 256 归问题与选项**；`model_max_length` 8192 需显式设置。
- **出厂未校准**，`temperature = [1.0,1.0,1.0]`，系统性过自信（平均置信 0.75–0.83 对更低准确率）。
- `choice` 选项数建议 <20，选项共享那 256 token。
- `score` 原语最弱且有**首选项位置偏差**（一次独立运行中 290 次里 0 次选第一项）。故本 benchmark 五信号全部用 `choice`，不用 `score`，`noul` 亦不用（该 checkpoint 上会低估 true）。
- 零样本 typed-decisions 0.342，低于多数类基线 0.461。

## 5. C（MLX）在本机的具体障碍

`laya-mlx 0.3.0` 安装成功，但 `import mlx.core` 失败：`ImportError: DLL load failed while importing core`（WinError 126）。已做的排查与结果：

- PyPI 上 `mlx` 提供 win_amd64 wheel 的版本只有 **0.32.0–0.32.3**，没有更旧版本可回溯定位引入点；
- `pip install "mlx[cpu]"` 在 Windows 上不拉任何额外运行时包，症状不变；
- 逐个 `ctypes.WinDLL` 测试 `core.cp311-win_amd64.pyd` 直接引用的 DLL（`MSVCP140`、`VCRUNTIME140`、`VCRUNTIME140_1`、ucrt 与 api-ms 系列、`python311.dll`）全部可加载，失败来自更深层依赖，需要系统级运行时安装才能继续——这超出"不动系统环境"的授权范围；
- 未制作任何转换版权重，未用其他后端冒名替代。

按任务书 §5 与我的处理原则：**C 标"当前环境未测"**，其模型卡的 0.750/0.681 只作为上游自报记录，不参与任何排名，也不作为本机部署依据。C 的权重已按固定 revision 下载并验证哈希，若日后拿到 Apple Silicon，`results/raw` 的同一批冻结样本可直接复用（问题模板与样本内容哈希已封存）。

## 6. 部署可行性口径

计划部署环境是**本机 Windows + RTX 4060 离线**。当前 A/B 的证据是"CPU 上可原样离线运行"，因为安装的是 torch CPU wheel；**GPU/CUDA 路径本机未测**，我没有把官方"32.8 ms/问 on T4"这类数字当作本机承诺。要给出部署级延迟，需要再装 CUDA 版 torch 并复测——这一步涉及下载约 3 GB 与独占 GPU，按规则先请示。

## 7. 许可与合规记录

三款模型卡均标 Apache-2.0；模型卡自报许可**不等于**其训练数据或第三方演示代码的许可证明，这点在 M4 的准入建议里保留为未决风险。权重、缓存、密封金标签都在仓库外（`D:\ModelBench\laya\`），仓库内只有哈希与脚本。未使用 `ZichenAI/layazh-zh`（自定义商业许可）、未使用 `leafiy/mia-laya`、未使用 ModelScope 演示入口（公开读取只得登录提示，无法核实其 checkpoint）。
