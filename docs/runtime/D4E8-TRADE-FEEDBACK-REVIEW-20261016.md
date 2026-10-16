# D4E8：交易前余额、库存与数量提示验收

更新时间：2026-10-16 19:47（Asia/Shanghai）。结论：**本合同范围限定 PASS**。玩家操作前能看到预计金额、本人余额和可卖库存；明显余额不足、库存不足和非法数量对应按钮禁用。服务端继续裁决最终交易。D整体仍进行中，性能Issue3保持开放并暂停。

## 1. 对象与实现

| 对象 | 精确版本/位置 |
|---|---|
| 独立树 / 分支 | `D:/Narraverse-World-Map-trade-feedback` / `codex/world-runtime-trade-feedback` |
| 基准D4E7 | `06e922217904d17cca81ae30bb07a273ed9a3693` |
| 冻结合同 | `2fbb074b56b38123ceb604e7095be7dd409d11d0`，`tasks/D4E8-TRADE-FEEDBACK-TASK.md` |
| 被验实现 / 两次CLI源码HEAD | `99659a2e215dedacb396e927ba9137fc72c1704a` |
| 环境 | Windows / Node.js v24.14.0，真实Codex浏览器DOM与语义控件 |

按用户的成本路由要求，请求gpt-6-luna/high子代理处理现有模式的两文件接入；实际底层模型身份未独立观察，不推断费用。执行者只修改runtime-map.mjs/html，25行新增/2行删除，提交后停写。其原始回执报告node --check runtime-map.mjs与git diff --check均exit0，未运行suite/服务/业务；该回执不替代下面的root独立验收。没有调用DSH或第三方模型接口。

root复核完整差异：复用同版player.self.wallet/inventory和actions.prices/maxQuantity，新增textContent状态提示；商品/数量事件只本地重算，没有新API或命令。数量为1至maxQuantity的安全整数，预计买价乘数量也须安全整数；余额不足禁买、库存不足禁卖。现有可交易位置/生命状态、只读、未加载/过期、遭遇占用、pending/submitting门包含在预算判断中，不能被余额充足重新开启。交易区明确当前仅为预计，完成时报价及服务端规则最终裁决，不读取隐藏公共金币或承诺公仓支付能力。

提交函数、DTO构造、回执校验、刷新发布逻辑、同ID重试与核心规则不变。未新增依赖、模块、玩家工作、战利品或初始钱粮；没有视觉重设计。root只补[入口说明](D4-EXPERIENCE-ENTRY.md)、报告及控制证据。

## 2. 实际页面验证

独立端口18334，新建唯一artifacts/d4e8-20261016/world，默认scene-survival-village、seed42、writable true、inspect-mind false、inspect-activity true。未启动默认Start-D4世界。所有业务命令均由页面按钮提交，脚本只读API/正式文件。

| 实际页面条件 | 观察结果 |
|---|---|
| 初始金币0、私粮20、粮食数量1 | 显示预计10金币、余额0、库存20、差10；买禁/卖可用 |
| 数量0、11、1.5，分别录入 | 买卖都禁用；明确1至10安全整数；输入可修正；时间/旅行/休整仍可用 |
| 切药材、数量1、本人药材0 | 显示预计50金币、可卖0、缺库存1；卖禁；未误读粮食20为药材 |
| 切回粮食数量4，尚未提交 | 预计40金币，买禁/卖可用；上述纯输入仍rev0/零命令/r0不变 |
| 点击卖4粮期间 | 买/卖/输入/时间/旅行/休整全部禁用，显示正在提交 |
| 卖出完成，金币20/私粮16，仍数量4 | 预计40，差20，买仍禁/卖可用 |
| 改数量2 | 预计20，余额20，买卖可用；没有自动提交 |
| 明确点击买2粮期间及完成后 | 提交中全部禁用；完成金币0/私粮18/rev2，买再次禁用 |
| 数量复位1，刷新与正常重开 | 同一预计10/余额0/库存18，买禁/卖可用，其他正常操作可用 |

原始页面观察摘要在browser-dom-proof.json。控件操作经真实浏览器语义API，evaluate只读取DOM，不用脚本伪造页面状态。没有截图、录屏、布局/视觉巡检。两次控制台error读取为空，临时验收页已关闭。

## 3. 权威数据与持久恢复

initial与after-inputs整个核对对象深相等，包括五项HTTP响应正文SHA256、r0原字节、玩家资产、零命令与活动。纯输入不推进或写档，由源码审查确认事件处理不调用接口；未对每个输入事件做网络计数采样。

唯一真实业务链为**卖4粮→买2粮**：第一次单价5、收入20，私粮20→16、钱包0→20、公仓540→544、公共金币-20；第二次单价10、支付20，私粮16→18、钱包20→0、公仓544→542、公共金币+20。正式service DTO/receipt核对成功、数量×单价及公私粮/资金反向变化；公开玩家读数与正式world一致。期末foodSold4/foodBought2/foodUsed0、earned20/spent20，rev/tick2，活动恰两条。

bought/refreshed/reopened三个核对对象深相等，五项读数与三份正式文件没有变化；正常CLI恢复仍经原完整service审计与历史重演，并非跳过验证读JSON。没有再推进一天，D4E7日结、D4E6人物追踪以及不变核心的输入/篡改/回滚证据按原范围复用，**不计本轮新测**。

| 五项HTTP响应正文（不上传完整正文） | SHA256 |
|---|---|
| snapshot | `d80627ca56201fb5a6bb6dff59d9c3d8fcc29a472473837148e1e21aecf35d03` |
| player | `2a1d17f2d8e11174ee9373f781faa3821c304dd41fe950731f6875b8b487dd42` |
| scene | `05e1c56ed64ae42de3863e1830fec345ac13cfe97707bee747534b7e5f9ffb2e` |
| encounter | `ad0a765578fd8941a2331d1961913c6e45f062e8a3636ab172767bd3a52deb56` |
| activity | `12c9499acdcecda310e135ee9d8394c5829be13ea1cacbc624326a62f24fb38e` |

| 隔离测试正式文件原字节（不上传正文） | SHA256 |
|---|---|
| service-commit-r0.json | `85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b` |
| service-commit-r1.json | `1651f67a656c00b23783a54e65f02341712bee317373b3f83f27dd4a1b620518` |
| service-commit-r2.json | `7a0b30baf40933c57a2e5a82de3178e51a09e6ef34569060ec86f488853e9ace` |

## 4. 命令、时限与保护

```powershell
node artifacts/d4e8-20261016/server.mjs
node artifacts/d4e8-20261016/inspect.mjs initial
# 页面修改数量/商品，不提交
node artifacts/d4e8-20261016/inspect.mjs after-inputs initial
# 监督终端phase sell；页面卖4粮；读数确认后phase done
node artifacts/d4e8-20261016/inspect.mjs sold
# 监督终端phase buy；页面买2粮；读数确认后phase done
node artifacts/d4e8-20261016/inspect.mjs bought
node artifacts/d4e8-20261016/inspect.mjs refreshed bought
# 监督终端quit正常关闭，随后恢复同一目录
node artifacts/d4e8-20261016/server.mjs --reopen
node artifacts/d4e8-20261016/inspect.mjs reopened bought
# 浏览器恢复确认，再quit
C:/Python311/python.exe artifacts/d4e8-20261016/protect.py
```

首次实际child argv：`node runtime-server.mjs --data-dir D:/Narraverse-World-Map-trade-feedback/artifacts/d4e8-20261016/world --port 18334 --profile scene-survival-village --seed 42 --writable true --inspect-mind false --inspect-activity true`；恢复去掉初始化profile/seed。首次PID40532、存活105487ms，恢复PID33552、存活54895ms，均正常exit0、signal null、timedOut false。各600秒总硬限、启动/业务120秒阶段限和5秒强制退出后备，HTTP读数10秒限；存活时间含交互等待，**不是性能测量**。没有失败后换目录重跑。

19:45:35+08保护终检：原八档SHA全部不变；除允许的两个前端文件外其余91份产品文件、包括全部78份runtime均未变；控制五旧未跟踪文件保持。用户18325 PID2592、18327 PID4432的身份、源码与既有9/3份档保持。自己的两个CLI退出，无匹配测试Node、锁或临时文件；默认18331日常目录未创建。root最终git暂存仅包含本片文件，没有触碰旧原型/用户世界或正式平台。

## 5. 未验项、参考与收口

本轮0新增suite运行，1个真实隔离世界、2条成功交易；静态checks与真实DOM/数据断言分别列出，未虚报2/2或其他suite计数。只读、死亡、异地、遭遇、断网/过期读数和超大整数守卫只做源差异审查，未分别动态注入；提交中禁用已实测。没有新日结/死亡/长期生存/并发/性能样本，不声称全部交易条件已提前预测。

Reference Review：复用现有本人资产与报价、controls门与原权威交易；浏览器原生number输入加安全整数检查、textContent状态区满足本片。新收入来源涉及独立权威账本/规则版本，留待有界设计，不在提示层实现。无外网选型或新依赖。

报告/说明/脱敏证据推送codex/world-runtime-trade-feedback，控制唯一状态同步codex/world-runtime-control；Projects先交付待验收，root核验后限定Done/已验收并读回正文与字段，D保持In Progress/进行中。证据在[docs/evidence/d4e8-20261016](../evidence/d4e8-20261016/)，包含原日志/阶段/进程、签名和复核摘要，不上传私档、完整投影/回执；SHA256SUMS/.gitattributes与Git blob原字节逐项校对。最终远端SHA读回。本片结束停止，无main合并、部署、迁移或现有用户服务启停。
