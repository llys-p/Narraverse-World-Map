# Issue #3 配置校验调用链优化：实现与本机验证

2026-10-16（Asia/Shanghai）。本次用户要求继续推进，三五秒以内波动不追查、不作为优化收益证据。限定任务交付；非日常性能或D整体验收。

## 结论

**功能限定PASS；重开得到两组同向改善；整体性能未通过，不替换b7已验基准。** 完整候选重开墙钟中位67.592→55.654秒（减少11.938秒，17.66%），CPU中位63.648→52.875秒（16.93%）；两组重开分别少15.872与8.005秒。但首开中位52.866→56.299秒，且第二组候选比原版慢11.629秒；首开收益未重复出现。返村中位46.940→43.637秒，仅差3.303秒，按用户要求不作为明确收益或继续排查对象。整链父进程中位167.580→155.790秒，约减少7.04%，仍不能掩盖首开方向反转。每版n=2，保留候选分支和全部失利/高波动样本，不以微基准替代实档。PR6/7此前暂缓性能准入的结论不变，本轮不将它们混入新候选。

## 1. 环境、精确版本和隔离

- Windows 10.0.26200 x64；Node.js v24.14.0，`C:\Program Files\nodejs\node.EXE`；CPU 13th Gen Intel(R) Core(TM) i5-13500HX，20逻辑处理器，内存15.73GiB。电源高性能；不清OS缓存、不绑核、不启停其他服务。机器是日常运行状态，并非独占实验机。
- A：`b7e5a9e7c131ee79acd017276ff62910a549d5ad`，独立树`D:/Narraverse-World-Map-issue3-baseline`。
- M1下层试验：`fbaf5147c6aea516007c61f60498493cf3c5af29`，`D:/Narraverse-World-Map-issue3-history-cost`，分支`codex/issue-3-history-cost`；已测，未独立采纳为性能改善。
- B/M2完整配置检查候选：`c94a228e3c671ea6142ba90eb9ab690a930e0e72`，`D:/Narraverse-World-Map-issue3-config-checks`，分支`codex/issue-3-config-checks`。接续M1，生产总范围8个core模块；不含PR6/7的数字编码生产修改，PR4不纳入。之前PR6/7独立报告结论保持。
- 测量器SHA256 `122977b207c5aed4f9902402c428759ad09ecbc0f55b3295f1b5702dfe1e9f2a`；驱动SHA256 `c54e0b56b8cc4b7fdccc22a761a8962d98b143a6c871d6e765f74dc55ebced06`。M2测量开始后生产哈希保持冻结。
- 原r170及前6档逐字节复制到每轮独占目录；r182只作外部参考，不预置到运行目录。原始8档、完整投影、完整回执、CPU原始profile仅留本机。公开证据见[索引](../../artifacts/issue3-config-checks-20261016/public/index.json)。

## 2. 一次真实r170 CPU采样与修复依据

对原b7生产一次首开采样：首开78.909秒，Profiler总采样跨度78.931秒，48,545采样点。该时间含采样开销，**不纳入无Profiler的A/B比较**。

- 完整审计bundle调用栈inclusive占86.707%，journal/history replay占83.868%；二者重叠不能相加。
- Self采样权重：`encodeCanonical`32.566%，`requireCondition`24.339%，`cloneData`12.601%，`record`6.929%，experience-state `visit`6.664%，GC1.631%。百分比来自timeDeltas采样权重，不是精确process.cpuUsage分账。
- canonicalJson上层调用可见createMarketWorld/生态/Actor/Resource/Hunter等构造函数：配置校验为检查嵌套配置反复创建随后丢弃的初始世界、账本和指纹。详见[热点](../../artifacts/issue3-config-checks-20261016/public/profile-analysis.json)、[规范编码调用归属](../../artifacts/issue3-config-checks-20261016/public/canonical-callers.json)。
- Reference Review采用本仓库本次真实调用栈及既有构造函数，复用已有字段规则、cloneData、初始人物构造和createMemoryState。未引入依赖或外部方案。

## 3. 生产改动及不变量

范围：`data-contract/resource-ledger/ecology/market/actors/hunter/society/memory-runtime.mjs`。新增完整配置检查/检查结果入口，内部私有validateConfig可选择是否需要构造完整初始世界。验证世界时只移除无人消费的初始世界分配与字符串生成。

- `validateJsonData`保留canonicalJson同序JSON数据检查（深度、有限数、循环、原型、描述符、密集数组与预算），每次重新检查所有节点，无对象审计缓存或信任标记。原canonicalJson/cloneData/put输出行为未改。
- 公开create*World仍走原完整构造路径；Actor人物初始化共用同一私有函数，检查结果脱离输入，避免复制一套身份规则。Memory仍经原createMemoryState核对初始身份；Society两轮庄产检查和原玩家初始化检查保留。
- 实际世界的每个configFingerprint、跨层配置对应、账目、生命/时间/初始身份检查仍执行。未改service/owner/持久化/命令DTO/历史重演代码；没有减少重演命令或ticks，没有公开trusted/skip参数。
- 维护代价：validation-only walker与规范编码的验证顺序需同步维护；修改数据合同必须继续运行二者边界等价检查。不是任意Proxy/宿主全局函数被篡改的普遍语义保证。

## 4. 定向功能结果

| 项目 | 结果 | 证据/范围 |
|---|---|---|
| 编码等价及8真实档逐字节签名 | PASS | 原编码5项，键名复用2项；编码器生产不变 |
| 下层配置边界/公共构造输出/拒绝顺序 | PASS | 4项；非有限数/非JSON/访问器零调用/循环/深度/数组预算等 |
| 上层6配置版本初始人物、余额、构造输出、指纹和身份篡改 | PASS | 3项；合计14/14，0跳过/取消/失败 |
| 真实持久篡改拒绝 | PASS | CP2a-S7 |
| 持久失败回滚 | PASS | CP2a-S5；本版两项2/2 |
| 真实r170→返村→关闭→重开 | PASS | 两版本各2次，共4×24项断言，原完整审计重演路径 |
| r182磁盘字节、回执、逐项5投影、重开一致 | PASS | 每轮一致；散列见下 |
| 原档/副本/生产/既有控制树未跟踪文件保护 | PASS | 四轮PROTECTION_OK；前后哈希一致 |
| 锁/测试进程/原服务 | PASS | 每轮无锁；本次公开记录38个PID查询无存活；所选原服务监听身份前后一致 |
| 日常体验性能/128命令/并发/p95/视觉 | 未验 | 不扩展全量、H7或浏览器检查 |

同一基准源码与依赖未变，A的编码/持久门复用[前次独立验收](https://github.com/llys-p/Narraverse-World-Map/blob/220f62adc26da6938d730fa5a67b647d3b4afc97/docs/runtime/ISSUE3-LOCAL-ACCEPTANCE-20261016.md)，此次只重跑B直接门。测量器父进程看门狗字节同前次已验版本，复用其200ms短探针，不重复启动业务来验证看门狗。

## 5. 无Profiler整链A/B

顺序A1→B1→B2→A2，每版n=2，独立新进程/独占目录，不并行业务测量。墙钟performance计时、CPU为process.cpuUsage的user+system，CPU分项均在原始JSON中。关闭只计owner.close，不含额外五投影读取。阶段120秒、子进程总420秒、退出确认5秒、外层460秒；每次exit0且未触发杀进程。

| 轮次 | 版本 | 首开 墙钟/CPU秒 | 返村 墙钟/CPU秒 | 关闭 墙钟毫秒 | 重开 墙钟/CPU秒 | 整链墙钟秒 |
|---|---|---:|---:|---:|---:|---:|
| A1 | 基准 | 62.498 / 59.797 | 48.647 / 47.672 | 1.213 | 82.656 / 75.813 | 194.020 |
| B1 | 完整配置检查候选 | 57.734 / 54.781 | 40.366 / 39.563 | 0.978 | 66.784 / 61.922 | 165.091 |
| B2 | 完整配置检查候选 | 54.863 / 51.578 | 46.908 / 45.297 | 0.966 | 44.523 / 43.828 | 146.488 |
| A2 | 基准 | 43.234 / 42.500 | 45.233 / 44.656 | 1.099 | 52.528 / 51.484 | 141.140 |

| 阶段 | A墙钟中位秒 | B墙钟中位秒 | 墙钟减少秒/百分比 | CPU中位 A→B秒 | CPU减少 | A/B墙钟范围秒 |
|---|---:|---:|---:|---:|---:|---|
| 首次打开 | 52.866 | 56.299 | -3.433 / -6.49% | 51.148 → 53.179 | -3.97% | 43.234–62.498 / 54.863–57.734 |
| 返村提交 | 46.940 | 43.637 | 3.303 / 7.04% | 46.164 → 42.430 | 8.09% | 45.233–48.647 / 40.366–46.908 |
| 重新打开 | 67.592 | 55.654 | 11.938 / 17.66% | 63.648 → 52.875 | 16.93% | 52.528–82.656 / 44.523–66.784 |

改善率=(A中位−B中位)/A中位。关闭为毫秒级，CPU常因Windows计时粒度记0；不解读其百分比。

- A1/B1（后一组实际先B2后A2）：首次打开减少4.763秒；返村提交减少8.281秒；重新打开减少15.872秒。
- A2/B2（后一组实际先B2后A2）：首次打开减少-11.629秒；返村提交减少-1.675秒；重新打开减少8.005秒。

每版仅2次，均值=中位数，样本标准差/CV和原始user/system数据见[summary](../../artifacts/issue3-config-checks-20261016/public/complete/summary.json)及逐轮JSON；不得当成p95或稳定性分布。三五秒内差异按用户要求不追查；大于此幅度仍须展示样本，不以机器状态推测替代可重复收益证据。

## 6. 保留的弱收益/未采纳结果

M1先做Resource→Actor下层链，完整ABBA各2次：A1首开41.918/提交43.528/重开48.841秒；B1为42.713/42.228/48.066秒，差约1秒，未作为有效收益。后半轮B2为40.877/51.375/82.618秒，A2为74.347/67.851/68.282秒，存在20–35秒变化。首开/提交中位看似快28.10%/15.96%，重开却慢11.58%，不能挑选有利百分比。全部样本与原始证据在[partial](../../artifacts/issue3-config-checks-20261016/public/partial/summary.json)。完整M2使用另一棵树，未修改M1运行中的源码。

另外两个不改生产的编码参数初始化/字符串拼写复用短试验，6轮交替结果不稳定，均放弃。M2的Memory校验6轮各50次短对照全部墙钟较低，约17–20%，只用于选择实档验证对象，不能据此宣布长历史合格。

## 7. SHA与原始证据

r182每轮136020字节，原始磁盘与规范编码散列均为`d2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c`。起点五投影组合`046e7b2ef5da06bf3bf3d54096535601a84d7074e0754233c98d4f4031ec5f07`，终点/重开组合`2dd3b73b24fb95c1dcf815a63ae075f4f0f0131711f8e921a0d98f63c2bea48f`。返回命令回执散列`9b67b487d1737b7462404291bd1e2dd84c420b0d8547e77de817d4783d06497c`。逐项投影签名、24项布尔断言、每轮保护结果详见公开run JSON；回执正文和投影正文未导出。

原8档前后SHA256全部一致：

| 文件 | 字节 | SHA256 |
|---|---:|---|
| service-commit-r0.json | 82290 | `85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b` |
| service-commit-r1.json | 85039 | `01055647588a97c2cf52586c945de35dafbedce553e6cba039fa362fab1ec682` |
| service-commit-r145.json | 117495 | `867ce2730c7fb01cc96f5451e4c690ab836ebe2b64b002da0fd62f9df3267e1e` |
| service-commit-r157.json | 122259 | `7670a2007b4e4aaf679eec5d83ac37b20037cea90abb4862bd895a0d4000792b` |
| service-commit-r158.json | 125381 | `86c08be81faed693d9b33d58ca953c6c7abf8e033de6ae87d688ae50822dc73e` |
| service-commit-r164.json | 128313 | `812fb209293b49beaa55f8d1d32da2c4d345dfa6cb6d53683b2ee4c35dcd786c` |
| service-commit-r170.json | 131239 | `3bf39f7cf0b9e7adb5a39a1969dbf0bc111ec20d18fb5b4b7e92c907969450dd` |
| service-commit-r182.json | 136020 | `d2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c` |

## 8. 剩余瓶颈与采纳建议

本轮只消除了配置检查时不需要的部分世界/账本/指纹构造；完整历史重演、实际状态的规范编码/指纹比较、cloneData及经验事实检查仍存在。基准采样显示这些路径成本很高，但没有对新候选做第二次Profiler，不能将基准百分比冒充优化后的剩余占比。当前实际首开54.9–57.7秒、返村40.4–46.9秒、重开44.5–66.8秒，仍是几十秒等待。

建议保留本分支供后续优化比较，暂不替换固定体验基准或据此合并PR6/7。若继续，先以候选的完整状态编码/复制消费者为下一项有界优化对象，保留所有审计、重演及持久化规则；不再追查本轮三五秒级差异。首开第二组11.629秒的不利差值保留为未解决的性能风险，不能只用重开提升抵消后宣布全面通过。

## 9. 复现命令与停止点

在上述Windows目录、原私档仍在本机的前提下执行；驱动是一次性输出，拒绝覆盖既有轮次。新一轮需显式改输出/run-id命名并重新冻结，不直接重跑覆盖。

```powershell
$env:ISSUE3_CANDIDATE_SHA='c94a228e3c671ea6142ba90eb9ab690a930e0e72'
C:/Python311/python.exe scripts/accept-issue3-history.py prepare
C:/Python311/python.exe scripts/accept-issue3-history.py tests
C:/Python311/python.exe scripts/accept-issue3-history.py run
C:/Python311/python.exe scripts/accept-issue3-history.py summarize
C:/Python311/python.exe scripts/export-issue3-config-evidence.py
```

实际每个Node argv、PID、外层时限、退出码见`public/complete/*-process.json`；运行ID为`issue3-complete-{A1,B1,B2,A2}`，contract为`issue3-complete-config-validation-v1`。单轮业务命令为`node scripts/measure-d4-long-history.mjs run --run-id issue3-complete-B1 --contract issue3-complete-config-validation-v1`，基准轮通过D4_ACCEPTANCE_SOURCE指定A树。

未合main、未部署、未启动日常入口、未接正式平台、未上传私档、未调用模型或协调DSH。Issue #3与D保持开放/进行中；本任务报告交付与性能阶段整体通过分开。
