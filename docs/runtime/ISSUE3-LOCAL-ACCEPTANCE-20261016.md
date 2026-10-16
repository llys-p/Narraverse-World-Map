# Issue #3｜Windows / Node24 原始 r170 本机独立验收

2026-10-16 11:07（Asia/Shanghai）。验收分支：`codex/issue-3-local-acceptance-20261016`。本报告仅裁定下述冻结提交、真实固定负载及定向边界；不代表全项目、日常性能或更大规模通过。

## 1. 裁定与合并建议

**功能：限定 PASS。性能：观察到正向样本中位数，但未证明可重复改善；Issue #3 继续 OPEN，日常性能不合格问题未解决。当前暂缓以性能收益为依据合并 PR #6、#7。**

- 每版各2次，实际顺序 A1→B1→B2→A2，4次完整链均 exit0、24/24内部断言通过、无Watchdog介入。候选首次打开中位数44.658秒、返村45.828秒、重开51.787秒，仍有明显等待。
- 数值中位数相对基准分别改善4.50%、5.27%、20.42%；CPU分别改善4.18%、5.22%、18.77%。不能据此宣称稳定改善：第一组候选三个主要阶段全部慢3.53%–4.81%，第二组全部快12.79%–38.49%；基准重开54.313→75.833秒、候选重开56.926→46.648秒，方向与幅度不稳定。
- 受监督子进程总墙钟中位数 160358.598→142420.456ms，数值低11.19%；其中包括初始化/读取/完整对照/收尾。该差值受最后一个基准样本影响，不是可承诺的11.19%稳定收益。
- PR #6（null/布尔值）与PR #7（有限数转字符串）的组合语义及持久化门均通过；未发现削弱审计或历史重演。**本轮没有“仅PR #6”的第三臂，不能将组合差值拆成各PR的独立真实收益，也不能判断哪个单独造成首组退化。** 两PR均建议暂缓性能准入，保留b7e5a9e7作为已验基准；这不是认定每个PR独立退化。
- 如果后续继续，应先在资源/时钟更稳定的时段取得更多交替观测，或单独采有界剖析定位波动；不要为本轮凑通过而删样本、改预算或自动续跑。本次四个样本全部保留，未剔除A2。

## 2. 精确对象、环境与改动审查

| 对象 | 精确提交 / 边界 |
| --- | --- |
| 原始A | `b7e5a9e7c131ee79acd017276ff62910a549d5ad`，`codex/world-runtime-d4-data-fast` |
| 优化B / PR #7 head | `aa21ba32b6fcc92e04d0e3152060028be89dc63b`，`codex/issue-3-number-encoding` |
| PR #6 head | `87d95751fa55f3a082f1545d6b03b20cca25d3bd`，包含在B祖先中 |
| PR #5 | `71660fc7429165be341cef7a10c3ae5a27d3dc53`，仅阅读诊断上下文；本轮没有执行其合成/Profiler脚本 |
| PR #4 | 不纳入本轮验收 |
| 验收测量器冻结提交 | `5c76282169c5f87a2fa35ffde05b572d115739b2`，在B上仅加测量/合同，不改生产代码 |

Windows x64，内核`10.0.26200`；Node`v24.14.0`（`C:\Program Files\nodejs\node.EXE`）；CPU `13th Gen Intel(R) Core(TM) i5-13500HX`，20逻辑CPU；总内存15.73GiB，准备时可用1.81GiB；电源方案为高性能。操作系统后台负载、频率/温度、GC和内存压力未固定，也未量化它们各自贡献。没有通过结束其它服务或应用来“净化”环境。

两个独立worktree：A=`D:\Narraverse-World-Map-issue3-baseline`（detached b7），B/验收=`D:\Narraverse-World-Map-issue3-acceptance`。实际生产树逐文件SHA记录在[准备证据](../../artifacts/issue3-acceptance-20261016/public/preflight.json)，全部runtime/页面文件中两版仅`runtime/core/data-contract.mjs`不同；测量前后各自生产文件全量指纹保持。

B相对A唯一生产差异是[encodeCanonical第80行起](https://github.com/llys-p/Narraverse-World-Map/blob/aa21ba32b6fcc92e04d0e3152060028be89dc63b/runtime/core/data-contract.mjs#L80)：null直接输出`null`，布尔值输出固定拼写，有限数在原Number.isFinite检查和负零归一化之后使用`'' + value`；字符串仍JSON.stringify。深度/类型/非有限数/循环/访问器/键排序/有界键名缓存/负零/UTF8预算未改。owner、service commit、存档格式、DTO、公开API、完整验证及重演代码零diff。没有新增trusted或审计结果缓存。

## 3. 真实数据、顺序与实际命令

原档只读来源：`D:\Narraverse-World-Map\hds-d4-cp1a-review\artifacts\world-runtime-d4-cp3-controller\CP3-FULL-19796-1791960566578\runtime-data`。每次独立目录只复制r0/r1/r145/r157/r158/r164/r170，共7个原字节文件；原r182只作目录外对照，不注入终态。format9 / schema3 / scene-survival-village；r170为tick168、revision170、6条命令，返村后r182为tick180、7条命令。这是固定小世界，非大人口、128命令或默认新世界从零成长压测。

仅新增原参考最后一条DTO：

```json
{"commandId":"0d851472-c18d-4060-95a2-476d903130a7","expectedRevision":170,"payload":{"destination":"village"},"type":"PlayerTravel","version":3}
```

在验收worktree依次执行（Python 3.11标准库驱动，所有业务都由同一个Node24可执行文件执行）：

```powershell
C:/Python311/python.exe scripts/accept-issue3-local.py prepare
C:/Python311/python.exe scripts/accept-issue3-local.py tests
C:/Python311/python.exe scripts/accept-issue3-local.py run
C:/Python311/python.exe scripts/accept-issue3-local.py summarize
```

以上为本次原样执行记录。驱动是固定目录/起始HEAD的一次性验收工具，拒绝覆盖既有preflight、日志或样本；在已完成的验收树直接再次prepare会按设计停止。重新测量需另定隔离树、运行标识及对应冻结源码，保留本次证据，不能将这些命令当成可覆盖旧样本的通用基准入口。

每个真实样本的实际Node命令同为下式，源码通过`D4_ACCEPTANCE_SOURCE`分别指向A/B；驱动清除继承的NODE_OPTIONS与旧测量路径覆盖，再固定原档来源。四次相同脚本SHA：`122977b207c5aed4f9902402c428759ad09ecbc0f55b3295f1b5702dfe1e9f2a`，driver SHA：`aee1f61212a4d0078eb0232bc7af6976593a9bc03ff62e600937dd9ee649264b`。

```powershell
node scripts/measure-d4-long-history.mjs prepare --run-id issue3-abba-A1 --contract issue3-local-abba-r170-v1 --git-head b7e5a9e7c131ee79acd017276ff62910a549d5ad
node scripts/measure-d4-long-history.mjs run --run-id issue3-abba-A1 --contract issue3-local-abba-r170-v1
node scripts/measure-d4-long-history.mjs verify --run-id issue3-abba-A1
```

随后按B1、B2、A2执行对应run-id（B的git-head为aa21ba32…）。每项完整argv/cwd/源码目录/父PID/退出码/外层限时见public中的`*-process.json`，例如[measure-A1](../../artifacts/issue3-acceptance-20261016/public/measure-A1-process.json)。Node父进程监督独立业务子进程，阶段120000ms、总420000ms、退出确认5000ms；外层驱动460秒，超时只终止它持有的进程树；测试命令100秒、准备/保护30秒。短Watchdog探针204.992ms触发，209.667ms内确认终止（总计），bounded=true。

没有Profiler、预热、OS缓存清空或并行业务测试。first-open指每个新Node进程第一次打开副本，**不是物理冷盘读**；reopen在同一子进程内正常关闭后重开。墙钟performance.now，CPU为process.cpuUsage的user+system，包含该进程线程的CPU消耗，逐项user/system原读数留JSON。五投影读取在关闭计时之外，关闭仅owner.close；因此本次关闭口径比旧脚本更明确，不拿旧单样本算提升。

## 4. 四次原始墙钟与CPU数据

### 墙钟（ms）

| 运行（实际顺序） | 首次打开 ms | 返村提交 ms | 关闭 ms | 重开 ms | 受监督子进程总墙钟 ms |
| --- | --- | --- | --- | --- | --- |
| A1 | 45124.735 | 47703.737 | 1.017 | 54313.402 | 147296.306 |
| B1 | 47107.572 | 49385.486 | 1.030 | 56926.049 | 153574.553 |
| B2 | 42208.898 | 42270.978 | 1.797 | 46648.480 | 131266.358 |
| A2 | 48399.077 | 49053.783 | 1.929 | 75832.875 | 173420.890 |

### CPU合计（ms）

| 运行 | 首次打开 CPU ms | 返村 CPU ms | 关闭 CPU ms | 重开 CPU ms |
| --- | --- | --- | --- | --- |
| A1 | 44360.000 | 46594.000 | 0.000 | 52938.000 |
| B1 | 46500.000 | 48093.000 | 0.000 | 55328.000 |
| B2 | 41625.000 | 41750.000 | 16.000 | 45937.000 |
| A2 | 47610.000 | 48202.000 | 0.000 | 71719.000 |

关闭CPU0/16ms为该短窗口取得的离散进程计数；可能受计数分辨率及后台线程影响，不能解释为零成本或16ms真实串行关闭，不用关闭CPU百分比判性能。毫秒级关闭的百分比也不用于合并判断。

### 各版n=2统计与配对方向

改善公式=`100 × (1 − B中位数/A中位数)`，正数为快，负数为慢。两观察值的中位数是两值平均；样本标准差使用n−1，CV=样本标准差/均值，精确SD及所有未舍入数值见[summary.json](../../artifacts/issue3-acceptance-20261016/public/summary.json)。第二组实际顺序B2→A2，百分比仍用相邻B2相对A2计算。

| 阶段/指标 | A 均值=中位数 ms | B 均值=中位数 ms | 数值改善 | A 范围 ms / CV | B 范围 ms / CV | A1→B1 配对 | A2 与 B2 反序配对 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| first-open/墙钟 | 46761.906 | 44658.235 | +4.50% | 45124.735–48399.077 / +4.95% | 42208.898–47107.572 / +7.76% | -4.39% | +12.79% |
| first-open/CPU | 45985.000 | 44062.500 | +4.18% | 44360.000–47610.000 / +5.00% | 41625.000–46500.000 / +7.82% | -4.82% | +12.57% |
| submit-travel/墙钟 | 48378.760 | 45828.232 | +5.27% | 47703.737–49053.783 / +1.97% | 42270.978–49385.486 / +10.98% | -3.53% | +13.83% |
| submit-travel/CPU | 47398.000 | 44921.500 | +5.22% | 46594.000–48202.000 / +2.40% | 41750.000–48093.000 / +9.98% | -3.22% | +13.39% |
| close/墙钟 | 1.473 | 1.413 | +4.04% | 1.017–1.929 / +43.78% | 1.030–1.797 / +38.37% | -1.28% | +6.84% |
| close/CPU | 0.000 | 8.000 | N/A | 0.000–0.000 / N/A | 0.000–16.000 / +141.42% | N/A | N/A |
| reopen/墙钟 | 65073.139 | 51787.265 | +20.42% | 54313.402–75832.875 / +23.38% | 46648.480–56926.049 / +14.03% | -4.81% | +38.49% |
| reopen/CPU | 62328.500 | 50632.500 | +18.77% | 52938.000–71719.000 / +21.31% | 45937.000–55328.000 / +13.11% | -4.51% | +35.95% |

只有两次/版，不计算p95、置信区间或统计显著性，不把样本数值改善写成稳定收益。原历史D4P5单次47.9/49.3/62.1秒仅作背景，没有进入本次A/B统计。

## 5. 功能、权威与恢复验证

| 核验 | A | B | 证据与范围 |
| --- | --- | --- | --- |
| 原规范编码等价5项 + 有界键名复用2项 | 7/7 | 7/7 | 包含真实8档编码/错误码消息/零getter/UTF8预算，不是新微基准 |
| PR新增固定原语3项 + 有限数3项 | 不适用 | 6/6 | 1000+数值/浮点边界、负零、非有限拒绝、全局String变异；基准原语语义由原等价门覆盖 |
| CP2a-S5 durable失败回滚/重试/重开 | 1/1 | 1/1 | 合成format9小世界注入真实link EACCES，SAVE_FAILED后五投影与磁盘字节不变，同DTO成功重试并重开一致 |
| CP2a-S7真实journal篡改拒绝 | 1/1 | 1/1 | 合成format9持久文件receipt.toRevision篡改，重开INVALID_SERVICE_COMMIT；不是对原私档做篡改 |
| 完整r170→r182真实服务链 | 2/2 | 2/2 | 每次24/24断言，真实submit与原路径完整审计/重演/发布，不注入状态 |
| 原字节、完整规范化对象、回执、五投影、跨重开 | PASS | PASS | 下面散列及每次独立保护证据 |

实际定向测试命令：

```powershell
node --test --test-isolation=none --test-reporter=tap --test-timeout=90000 tests/simulation/canonical-json-equivalence.test.mjs tests/simulation/canonical-key-reuse.test.mjs
node --test --test-isolation=none --test-reporter=tap --test-timeout=90000 tests/simulation/canonical-json-equivalence.test.mjs tests/simulation/canonical-key-reuse.test.mjs tests/simulation/canonical-primitive-fast.test.mjs tests/simulation/canonical-number-fast.test.mjs
node --test --test-isolation=none --test-reporter=tap --test-timeout=90000 --test-name-pattern "^CP2a-S(?:5|7) " tests/simulation/scene-gift-service.test.mjs
```

前两条分别在A/B执行，第三条分别执行一次；无skip/cancel/fail。TAP原始输出：[A编码](../../artifacts/issue3-acceptance-20261016/public/unit-A-stdout.txt)、[B编码](../../artifacts/issue3-acceptance-20261016/public/unit-B-stdout.txt)、[A持久化](../../artifacts/issue3-acceptance-20261016/public/persistence-A-stdout.txt)、[B持久化](../../artifacts/issue3-acceptance-20261016/public/persistence-B-stdout.txt)。未运行全量、视觉、浏览器、旧H7、128命令、并发或更大规模验收；不能外推这些范围。

四份新r182均136020字节，raw SHA256均为`d2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c`，与原r182完整字节相同；完整canonical比较同时覆盖anchor/bundle/snapshot/eventLog/commands/receipts/RNG/scheduler。返回回执完整规范SHA均为`9b67b487d1737b7462404291bd1e2dd84c420b0d8547e77de817d4783d06497c`，与原最后journal receipt完全一致；输入DTO与原最后dto字段全等。

起点五投影组合SHA均`046e7b2ef5da06bf3bf3d54096535601a84d7074e0754233c98d4f4031ec5f07`，提交及重开组合SHA均`2dd3b73b24fb95c1dcf815a63ae075f4f0f0131711f8e921a0d98f63c2bea48f`。逐投影如下，包含心智私账的内容仅留本机，仓库只提交散列：

| 投影 | r170 起点（四次一致） | r182 提交后及重开后（四次一致） |
| --- | --- | --- |
| snapshot | `76bad82268cc9c5a5595050168c2f21692dd9b192278f299b360393992afd012` | `7f7af29e2047f3c3e407d1defda9b697d674281a1611e0179f0fea54f83cb421` |
| player | `4ae04ddc432f43d46e7759d722191bae8ee28b9b8a39668e76b797f4a614eca1` | `08be1b893183136f47db8ec4d26db820b534cbe2ba2e45edeee9b847ba990963` |
| mind | `8ccd19e4fee567f09bf0da0836cbafd8f65cd30f8e693010cc7810edba4a3368` | `edfe06727850e9e89524b2f5e017da8d28b95fdae079e97293183903f32a6fa7` |
| encounter | `14f1b6defc654bddca48acf1c9645cc5f1499342160b2aa3171adf75b4c247f1` | `7c05562659feb2d8c5dfba7ca498db834b71f8cb35487da3fbc0ede7cdb8b00e` |
| scene | `c50e97b68ffa64bcda98ca1601acf7ad0be5a6475c0c02d7d5682b12c442dcb2` | `84addc04363874e9208012ef1cb3710ab63c0a1f09a39b193111d704b3008a14` |

## 6. 原始8档、锁/进程与发布保护

| 原始文件 | 字节数 | 运行前后 SHA256（完全相同） |
| --- | --- | --- |
| service-commit-r0.json | 82290 | `85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b` |
| service-commit-r1.json | 85039 | `01055647588a97c2cf52586c945de35dafbedce553e6cba039fa362fab1ec682` |
| service-commit-r145.json | 117495 | `867ce2730c7fb01cc96f5451e4c690ab836ebe2b64b002da0fd62f9df3267e1e` |
| service-commit-r157.json | 122259 | `7670a2007b4e4aaf679eec5d83ac37b20037cea90abb4862bd895a0d4000792b` |
| service-commit-r158.json | 125381 | `86c08be81faed693d9b33d58ca953c6c7abf8e033de6ae87d688ae50822dc73e` |
| service-commit-r164.json | 128313 | `812fb209293b49beaa55f8d1d32da2c4d345dfa6cb6d53683b2ee4c35dcd786c` |
| service-commit-r170.json | 131239 | `3bf39f7cf0b9e7adb5a39a1969dbf0bc111ec20d18fb5b4b7e92c907969450dd` |
| service-commit-r182.json | 136020 | `d2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c` |

运行前、每次测量前、每次verify及最终重新检查均匹配；原目录仍恰为8个原始正式文件，无新增锁/临时文件。每个运行目录保留7个字节相同输入副本和1个真实生成r182。

[最终保护证据](../../artifacts/issue3-acceptance-20261016/public/final-process-protection.json)：22个本任务Node PID（准备/定向测试/Watchdog/测量父子/verify）全部不在进程表；4个运行目录无锁/临时文件。原控制树5个既有untracked文件SHA保持，原基准源码树未写，A/B生产指纹保持。已知业务端口18324/18325/18212/18302/8084监听快照运行前后均为空；全程未运行任何现有服务启停命令，没有将此快照冒充所有后台服务的逐一验收。没有常驻HTTP服务、main合并、部署、原档迁移或模型调用。

39份公开验收证据为实际墙钟/CPU/TAP/命令/散列与保护记录，入口[index.json](../../artifacts/issue3-acceptance-20261016/public/index.json)。原始存档、完整投影、私有回执内容、运行目录与包含其细节的child-result仅留本机；public的run-*.json保留全部计时/断言名及结果，去掉断言detail载荷，不冒充未脱敏的原存档。Git只精确暂存public名单和报告/测量器，不暂存runtime-data。

## 7. 剩余成本与下一步边界

- 现在实际等待仍是42–57秒的候选开档/提交/重开；CPU消耗也在42–55秒量级，毫秒级投影读取与关闭不是主要耗时。这是本轮阶段测量直接支持的结论。
- 未变化的[owner load路径](https://github.com/llys-p/Narraverse-World-Map/blob/aa21ba32b6fcc92e04d0e3152060028be89dc63b/runtime/service/runtime-owner.mjs#L97)进入[loadServiceCommit](https://github.com/llys-p/Narraverse-World-Map/blob/aa21ba32b6fcc92e04d0e3152060028be89dc63b/runtime/service/service-commit.mjs#L90)，严格解析后完整validateServiceCommit，审计anchor和final、逐条命令重演并核对完整结果；提交同样在[saveServiceCommit](https://github.com/llys-p/Narraverse-World-Map/blob/aa21ba32b6fcc92e04d0e3152060028be89dc63b/runtime/service/service-commit.mjs#L86)前完整验证。primitive编码只是这些CPU密集路径的局部开销，未改变历史规模/遍历和重演成本。
- **本轮未新采Profiler，不能给当前encodeCanonical/cloneData/requireCondition的准确占比**，也不能把旧R1的87.47% self或85.78% inclusive当成新候选热点。现有证据不足以将波动归因于某个函数、GC、频率或后台负载；不据此派发缓存信任/跳审计方案。
- 正式决定合并前，应以稳定资源下的追加交替重复或明确的局部剖析复核可重复收益；若要分别裁定两PR的增量，再引入仅PR #6第三臂。该后续没有在本次自动执行。Issue #3不关闭，PR保持原状态；本轮只给建议，不执行合并。
