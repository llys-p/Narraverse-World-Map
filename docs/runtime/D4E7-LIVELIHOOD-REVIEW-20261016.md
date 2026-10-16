# D4E7：既有交易到日结页面链验收

更新时间：2026-10-16 19:27（Asia/Shanghai）。结论：**D4E7 v1.1 功能范围限定 PASS**。一条真实页面路径完成出售筹资、购买、一天日结与正常保存重开；未发现需要修改生产代码的阻塞，仅补操作说明。D 整体仍进行中，性能 Issue #3 开放并暂停。

## 1. 范围、环境与精确版本

- 独立验收树：`D:/Narraverse-World-Map-livelihood-loop`，分支 `codex/world-runtime-livelihood-loop`；基准 `1cde8888f1af2a0930929c94ff5fbbded991a1c2`。产品实现仍为 D4E6 `c7c213239911976ce45c6403c67f750e091e19b8`，性能底座 b7，未引入 PR6/7 或配置性能试验。
- v1 合同/首次 CLI HEAD：`6ba9a637672181f5d555c5248a43685b211e4d04`；初始读取后、业务前的 v1.1 勘误/恢复 CLI HEAD：`2cdf3c6fedfce2473df7458bce5bfa32f7046b3c`。二者只改合同文档，93 份产品文件与基准逐字节一致；未在运行时热改产品源码。
- Windows / Node.js **v24.14.0**，真实 Codex 浏览器 DOM/语义控件，本机临时端口18333。没有截图、录屏、像素、布局或视觉验收，没有调用DSH、模型或外部服务。root负责与权威回执、浏览器和进程生命周期耦合的核验，未派并行写工单。
- 唯一新世界 `artifacts/d4e7-20261016/world`，默认 scene-survival-village、seed42、writable true、inspect-mind false、inspect-activity true。未复制原私档或用户世界，未创建默认日常目录。

## 2. 首个真实发现与合同修正

v1 准备直接买2粮；初始 API、页面和正式r0一致显示：私粮20、钱包0，粮食买10/卖5。这个资金前提不成立。保留v1原文，在业务命令前追加v1.1勘误，采用已有规则先卖4粮取得20金币，再买2粮。初始证据仍只有r0、零命令，没有先失败再覆盖或重跑故事，也没有修改初始资产、铸币或放宽交易条件。

这条链检验交易与日结消费，买卖价差会实际减少资产，不代表可持续赚钱或生存策略已完成。入口说明现已写明初始0金币、筹资顺序、实际数值和已有世界按当前报价/回执操作。

## 3. 实际操作与权威核对

所有三条业务命令由真实页面按钮提交，未从脚本发送POST：

| 页面动作 | tick/revision | 玩家私粮 | 玩家金币 | 公仓粮 | 核对 |
|---|---:|---:|---:|---:|---|
| 默认新世界 | 0 | 20 | 0 | 540 | r0、零命令 |
| 粮食数量4，卖出 | 1 | 16 | 20 | 544 | 单价5/收入20，公共金币-20，公私粮反向±4 |
| 数量2，买入 | 2 | 18 | 0 | 542 | 单价10/支出20，公共金币+20，公私粮反向±2 |
| 明确推进1天 | 146 | 17 | 0 | 466 | 只跨tick144日结一次，消费私粮1；无重复收费 |

脚本从正式service文件读取DTO/receipt，逐项核对成功结果、数量×单位价=金额、钱包、私粮、公仓粮和公共金币的对等差值，并对照同版公开玩家API。卖出/买入各耗1tick（10分钟），随后AdvanceTime耗144tick，期末并非tick144而是146。当天公共粮另有既有规则结算，不能把公仓542→466全归于玩家消费。

期末ledger：foodSold4、foodBought2、foodUsed1、earned20、spent20，其他本轮字段为0；满足私粮20-4+2-1=17、金币0+20-20=0。完整正式回执由原持久恢复路径再次审计/重演，本轮脚本只保存允许的核对元数据，不上传完整回执。

开发者活动面板选择玩家，恰四条：卖4粮成功、买2粮成功、tick144消耗1份本人私粮、推进tick2→146成功。卡片成功3/拒绝0/未行动0/日结1/等待0，最近事实tick146。不会把买粮和消费合并、或把日结再次当作一次买入。切换猎人仍显示实际NoAction1/日结1、消耗0、饥饿200→300、日结收尾村庄；其余三NPC行均与本次真实SocietyDaySettled逐项核对。没有强迫产生NPC工作或购买。

## 4. 刷新、关闭与恢复

页面刷新后玩家卡、四条列表、钱粮保持。settled/refreshed/reopened三个核对对象整体深相等，包含同simulationId/revision/tick、五项HTTP响应正文SHA256、正式文件原字节SHA256、命令摘要、账本、日结与活动；第二次读取还在原正式事实中核对三NPC行。页面正常恢复后选择玩家，卡片与列表同关闭前，私粮17/金币0。刷新/重开没有新增正式文件或消费，页面两次控制台error均为空。

| 五项HTTP响应正文（不上传完整正文） | SHA256 |
|---|---|
| snapshot | `9457f29dc7af147c7ed5978bf77b2d099ed80947a09d234107b8cb445960a242` |
| player | `8aa567fa9c16dcd2490a05228b85479f16e768789aa3a6f1f91817f2cb5c4b99` |
| scene | `02cf28994a133efd37d2556497e3c090fe994be992f769e692ceaeb6f61231c8` |
| encounter | `1a2e7daee669ce1775e5ad734d458781fb5452dbd832f5038e375d8a5613afaf` |
| activity | `fc5f34d265d7960cee1157bc441d84399e0fbc7b0d47ce94e5cc2d810730b765` |

| 隔离测试正式文件原字节（不上传正文） | SHA256 |
|---|---|
| service-commit-r0.json | `85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b` |
| service-commit-r1.json | `9b6a2a801e4878687eba1517d0570390c8a26869758ed3f2d2db37b9afe9d245` |
| service-commit-r2.json | `d9c92ea84d0d05dd8376526b09f20c0452a58b592cbf6a04d83d4f331d3c076f` |
| service-commit-r146.json | `f56d5ae2339030217b35eb74986e704282ebb8d44ebcc01853fea05e7206d3ec` |

两次CLI都正常quit、exit0、signal null、未超时。首次PID1780存活201119ms；恢复PID11372存活88833ms，**含人工式页面操作和等待，不是业务性能测量**。每次总硬限600000ms，startup/动作阶段硬限120000ms，触发后先quit、5秒强制退出后备。HTTP核对请求有10000ms硬限。日志与阶段时间原件保留，没有重启或绕过截止。

## 5. 实际命令与可追溯证据

在本独立树执行：

```powershell
node artifacts/d4e7-20261016/server.mjs
node artifacts/d4e7-20261016/inspect.mjs initial
# 页面卖4粮
node artifacts/d4e7-20261016/inspect.mjs sold
# 页面买2粮
node artifacts/d4e7-20261016/inspect.mjs bought
# 页面推进1天
node artifacts/d4e7-20261016/inspect.mjs settled
# 页面刷新
node artifacts/d4e7-20261016/inspect.mjs refreshed settled
# 向监督进程输入quit，正常结束；恢复同一世界
node artifacts/d4e7-20261016/server.mjs --reopen
node artifacts/d4e7-20261016/inspect.mjs reopened settled
# 页面恢复核对，再quit
C:/Python311/python.exe artifacts/d4e7-20261016/protect.py
```

监督器首次实际child argv：`node runtime-server.mjs --data-dir D:/Narraverse-World-Map-livelihood-loop/artifacts/d4e7-20261016/world --port 18333 --profile scene-survival-village --seed 42 --writable true --inspect-mind false --inspect-activity true`；恢复仅去掉初始化profile/seed参数。业务阶段前输入`phase sell`、`phase buy`、`phase advance`，核对完成输入`phase done`来持有阶段截止。包装器无后台脱管进程。复制证据中的脚本复查时须先在本树重建其明示out目录；不要对现有同名世界自动重跑，脚本本身会拒绝已有首次运行元数据/目录。

只执行 **1条新业务链、3条成功命令、1次日结、1次正常恢复**；本轮新增测试suite运行数为0。直接断言嵌在可运行inspect/protect脚本；未把它们虚报为既有suite的新通过数。代码不变的输入边界、篡改拒绝、回滚和旧玩法证据沿用[D4E3](D4E3-PLAYABLE-REVIEW-20261016.md)、[D4E5](D4E5-PLACE-EXPERIENCE-REVIEW-20261016.md)与[D4E6](D4E6-IMPORTANT-PERSON-REVIEW-20261016.md)的明确范围，不新增全量、旧H7或长历史运行。

## 6. 保护、未验项与交付

19:25:07+08终检：原八份私档全部SHA匹配；93份产品文件（含78份runtime、相关页面/脚本及Start-D4）逐字节不变，控制五份旧未跟踪文件保持；用户18325 PID2592/18327 PID4432的进程身份、源码与已有9/3份档保持。自己的两CLI进程退出，无匹配测试Node、锁或临时文件，18331默认日常世界未创建。验收浏览器临时页已关闭。

未验：零余额直接买粮的动态拒绝、卖光粮后长期生存、NPC新工作/购买/移动、死亡分支、并发/断网/持久故障注入和长历史性能；原有源码合同对应证据按上述范围复用，未假称本轮重新通过。没有改core/knowledge/owner/审计/重演/配置/DTO/schema或交易条件。

产物为本合同及勘误、入口操作说明、报告、唯一状态与[脱敏证据目录](../evidence/d4e7-20261016/)。证据包含初始/出售/购买/日结/刷新/恢复签名、关键账本数、浏览器观察摘要、正常退出/时限日志、保护快照及Projects读回；不含原始私档、测试service正文、完整投影或完整回执。SHA256SUMS覆盖同目录其余证据原字节，.gitattributes禁换行转换，暂存与Git blob逐字节对照。

源码无阻塞修改，Reference Review沿用既有交易权威和日结事件消费链，不加通用交易/人物系统或依赖。报告与证据推送独立验收分支、控制摘要同步控制分支，远端精确SHA读回；看板先待验收，复核后本片Done/已验收，D仍进行中。本片收口停止，性能Issue3继续暂停，无main合并、部署、真实数据迁移、启停现有用户服务或模型调用。
