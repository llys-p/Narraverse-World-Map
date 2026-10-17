# D4E9 玩家村庄劳务收入闭环：实现与独立复核

2026-10-17 10:01（Asia/Shanghai）。**合同范围功能 PASS；性能未验收，D阶段整体仍进行中。**

## 给用户：已能体验什么

用户确认后实现了村庄工作：6小时、成功领20金币、疲劳+150；两次成功工作的开始至少间隔24小时。工资来自公共可用金币，有限公共粮食和现金仍会真实约束行动。

本树双击 `Start-D4E9.cmd`，等待ready，再访问 `http://127.0.0.1:18336/runtime-map.html`。这是独立新世界，目录 `artifacts/d4e9-daily/world`；不升级旧D4档。输入quit等待stopped后再次双击可恢复。本轮没有启动/创建该日常世界，只启动并正常关闭了临时验收世界。

真实页面已点击工作、买入两粮：06:00工资到账/疲劳150且工作冷却；06:10钱包0/私粮22。地图、村庄、森林页读取同一个rev37，查看森林没有旅行。随后**沿同一档由HTTP提交Advance107**到tick144（日结一次），正常关闭重开：工资累计20、买粮支出20、钱包0、私粮21、工作一次，五投影、活动、原回执及四档SHA一致。不是全部动作都由页面点击；没有截图/视觉检查。

本短历史重开约23.6秒；仍需等待。没有宣称日常流畅或长历史性能合格。长期粮食补给、长期平衡、NPC新日程与更大地图不在本合同。

## 给AI：精确交付与边界

- 实施树：`D:/Narraverse-World-Map-player-work`，分支 `codex/world-runtime-player-work`。
- 基准：`f7bc32818f25053ef8ae564a389dcd26028bb7a0`（D4E8）。
- 实现提交：`a375acc283f8b0bf94291078b47b18f6af78be3c`；本报告/证据是后续文档提交，不混称代码已入main。
- 合同：[冻结任务书](../../tasks/D4E9-PLAYER-WORK-TASK.md)，原发布控制提交8e06fd8；后续仅明确experience-state必要版本门、清理草案流程措辞和页面验收方式，玩法参数未改。
- 新profile `scene-livelihood-village`，rules `d-scene-livelihood-v1`，format10，DTO4/receipt4，memory7→society6→player4；旧profile/DTO/存档不迁移。
- 核心复用现有scene/encounter hooks、完整事务和从初态重演。工资独立wages/workCount/lastWorkStartTick，不记成出售收入；公共金守恒，不改变初始资产或NPC规则。
- 客户端payload精确空对象；持久化失败全候选不发布，完成条件拒绝保留已流逝时间。相同完整DTO优先复用原回执，包括重开后；冲突ID拒绝。
- 页面机械接入请求gpt-6-luna/high；高耦合规则由核心代理实施，根逐项静态审查并运行独立消费者/旧接口门。请求模型标识不等于独立观测的计费路由；无DSH或第三方模型API调用。

## 环境、命令与测试次数

Windows x64 / Node.js **v24.14.0**，纯Node内置模块，无安装依赖。两个最终新测试文件串行，独立监督进程硬限；根消费者分阶段120s、总600s、退出确认5s。未超时、无杀进程介入。

| 最终执行 | 结果 | 实测范围与时间 |
|---|---|---|
| `node --test --test-concurrency=1 tests/simulation/player-work-runtime.test.mjs` | 5/5 PASS | 49,870.0432ms；版本配对/旧helper拒绝、钱粮/身体/冷却/整数、真实工作重演/篡改、完成恰逢日结、完成身体门拒绝保留时间 |
| `node --test --test-concurrency=1 tests/simulation/player-work-service.test.mjs` | 3/3 PASS | 58,876.3903ms；DTO注入/getter=0；EACCES发布回滚/重试/重开/坏最新档不回退；DTO4原赠粮旅行遭遇攻击取消返村休整卖粮链 |
| `node --test --test-concurrency=1 --test-name-pattern="CP2a-S[24] " tests/simulation/scene-gift-service.test.mjs` | 根2/2选中成员PASS | 522.8583ms；旧DTO3真实HTTP赠粮五投影与幂等、旧默认精确输入/descriptor门。非旧全量 |
| `node scripts/verify-d4e9-player-work.mjs --browser` | 根1次同档消费者链PASS | 实际页面work/buy→HTTP日结→完整磁盘审计→close/reopen；新旧HTTP版本/工资注入/未知字段拒绝且不增档；重开后旧工作回执可重试、同ID异DTO409 |

最终新核心8成员加根旧接口2成员=**10个定向成员**，另有**一次根真实页面/HTTP消费者链**；不是全量套件10/10。首轮runtime旧helper边界收紧前也5/5，但只以最终源码runtime-tests-02及service-tests-01作为当前功能证据；不把两轮计成更多不同用例。

前置probe：smoke-01/02为机械转写语法错误，修正后smoke-03通过；owner合成链曾在120秒父预算内通过。runtime-tests-01的Node五项通过，但监督Python打印✔发生GBK编码异常（wrapper失败），原日志保留；修UTF-8输出和精确子树超时清理后最终wrapper/Node均exit0。没有删除测试、削弱断言或修改规则来消除失败。静态复核还收紧了旧helper默认拒绝及旧snapshot结构不能承认工作receipt，修正S3手算tick30→37（在首轮service前），只在新profile active遭遇清单标明工作被阻塞。

## 根验收原始数值与完整性

根隔离运行目录：`artifacts/d4e9-acceptance/2026-10-17T01-57-58-554Z`。监督子PID52712，code0，signal/killed均null。自动分配本机端口7503；没有占用旧服务端口。

| 阶段 | 墙钟ms | CPU user/system微秒 |
|---|---:|---:|
| fresh-open | 212.7668 | 250000 / 47000 |
| browser-work-and-buy | 55208.8920 | 9860000 / 281000 |
| one-day | 21300.1097 | 19515000 / 1515000 |
| full-disk-audit | 17943.8381 | 15359000 / 2047000 |
| close | 1.9656 | 0 / 0 |
| reopen | 23623.9893 | 21735000 / 1422000 |
| reclose | 3.3923 | 0 / 0 |
| legacy-profile-isolation | 155.2413 | 156000 / 31000 |

`browser-work-and-buy`的55.2秒包含人工式工具操作、读数等待与检查，**不是工作或买粮单动作延迟**；本表只是本次功能验收诊断，无A/B、重复测量、p95或性能改善结论。

- 五投影canonical签名：`ad2d492f2014d1764858f4735a65c089cc9b2c635ff80f50daeedc74e3424426`；重开逐字段一致。
- 最新r144原字节SHA256：`44d9397a663f4917651d47d2d1b39e4366430d782477d02919802a44c73745ba`。
- 四份正式档（r0/r36/r37/r144）全部SHA见[root-result.json](../evidence/d4e9-player-work-20261017/root-result.json)，重开/重复工作请求/ID冲突之后均不变。
- 工作事实1个、成功活动1行；PlayerDaySettled1个；service命令3条；wages20、workCount1、lastWorkStartTick0、foodBought2、foodUsed1。
- 根消费者97份候选运行源的验收前后原字节指纹一致；核心回执23份生产/测试源指纹逐项匹配。原八档只读哈希仍全部一致，未复制/重演/上传；旧D4E8树93产品源和控制5旧文件保持，旧树Git干净。
- 本次测试锁与Node均无残留，临时页面已关。18325 PID2592、18327 PID4432仍在监听；未启停正式服务，未启动18336日常实例。

公开给仓库AI的是[脱敏证据目录](../evidence/d4e9-player-work-20261017/)与SHA256SUMS：测试原始输出、执行预算、首败、消费者回执/账本摘要、源码与档案哈希。**不包含任何完整service-commit/原始私档/五投影正文**；本轮合成世界只保留本机artifacts。

## 判定与停止点

| 项目 | 判定 |
|---|---|
| 工作规则、现金/粮食边界、独立账本、版本隔离 | PASS（所列定向成员与静态复核范围） |
| 完整历史重演、工资/冷却/事实/回执篡改、幂等 | PASS |
| 真实EACCES整候选回滚、坏最新档显式失败、关闭重开 | PASS |
| 页面工作/买粮、三页同世界、一天私粮消费与持久恢复 | PASS（页面工作/买粮；日结由HTTP提交） |
| 原档/旧树/服务保护、测试清理 | PASS |
| 长历史性能、长期平衡、全量旧profile回归、视觉/正式发布 | 未验/不在本轮范围 |

D4E9本合同功能范围可收口，D整体仍进行中；Issue3暂停且不以本次新样本替代长历史性能验收。未合并main、部署、迁移或启动用户日常世界。下一步由实际体验反馈决定，不自动扩展补货、任务系统或继续性能优化。
