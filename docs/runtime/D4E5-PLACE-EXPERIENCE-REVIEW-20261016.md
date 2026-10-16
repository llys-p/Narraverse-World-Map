# D4E5 地图到地点现有玩法闭环：限定验收 PASS

2026-10-16 18:07（Asia/Shanghai）。本片功能交付及定向验收完成，D阶段整体仍进行中。

## 给用户：实际变化与边界

地图可直接查看村庄、森林，并通过稳定人物链接进入地点。地点页区分「正在查看的地点」与玩家实际位置；村庄仍只呈现同地点人物和真实收粮记忆，森林只显示已有本人/遭遇读数，不造其他人物。两个地点页复用已有世界活动窗口，严格筛选来源明确属于该地点的事实；**地点未知的历史仍留在地图，不补造地点**。活动区醒目标为开发者观察，不代表玩家或NPC已经知道。

已由真实浏览器跑通：地图查看森林（本人仍村庄）→地图定位猎人→村庄赠粮→真实旅行到森林→真实开始并取消遭遇→查看村庄（本人仍森林）→明确返村旅行→同一世界地图→刷新→正常关闭重开。最终rev27/tick24、健康1000、私粮19、猎人收粮记忆1条；遭遇结果是取消，**没有宣称本轮战胜狼**。

新候选本机入口：`D:/Narraverse-World-Map-place-loop/Start-D4.cmd`，固定18329、本树独立数据目录。**本次未启动18329或创建其日常世界**；实际验收在18330专属测试目录进行。原18325/18327两个用户实例、源码和既有存档均保持，不迁移旧世界。详见[体验说明](D4-EXPERIENCE-ENTRY.md)。性能优化仍暂停，Issue #3开放；未把几十秒等待称为流畅。

## 给AI：精确版本、执行范围与停止点

| 项目 | 精确值 |
|---|---|
| 执行树/分支 | `D:/Narraverse-World-Map-place-loop` / `codex/world-runtime-place-loop` |
| 接续基准 | `b594b454238623a451f3e26ebc47986c75d6f04c`（D4E4，底座生产b7） |
| 冻结合同 | `c36704e6081c0597f579465b66d7a6d5ea3c8d32` / [任务书](../../tasks/D4E5-PLACE-EXPERIENCE-LOOP-TASK.md) |
| 主实现 | `07b3d8e3b88e31a6442ea5bca2296c82516c4e11` |
| 森林读取期间停写保护 | `42fea29347df84cc80d4b05d3b0fd4df15645566` |
| 浏览器被验候选 | `17074c4ef6f9cb372b4cbdf4d8925e231a541283`（仅再补森林人物空状态文字） |
| 本机环境 | Windows 11 / Node.js v24.14.0 x64，内置模块，无新依赖 |

工人使用请求的性价比high路由，仅写合同允许的前端、唯一新测试、启动器与说明，提交后停写。中控复核diff并补必要的小文字后独立浏览器验收。后续报告/证据/状态提交不再改被验JS。没有修改`runtime/`或`runtime-server.mjs`；78份runtime `.mjs`前后原字节SHA全部一致，没有降低校验、绕过审计或修改重演/持久化/人物知识。

## 审查与复用判断

- 活动DTO完整校验从map移到已有`runtime-activity.mjs`供三个页面复用：字段、身份/修订/tick、来源顺序/ID、类型、行数及65536字节规则保留；默认未开启活动能力时不取活动API。地点筛选严格`entry.location===location`且不修改输入。
- 地点投影与活动全部校验同版后才一起发布；失败保留上一组一致读数并暂停新动作。森林刷新开始即禁用动作，`makeCommand`要求新鲜读数；已有pending重试、命令格式/回执/幂等协议保持。
- 中途发现森林无条件读scene会破坏旧format8，已在交付前去除；保留原player+encounter读取和旧地图已在森林时的入口。新增村庄/人物链接仅scene能力开放，未知位置不猜。此项为源码审查，未另跑旧profile浏览器链。
- Reference Review：复用[D4E3实际场景/命令链](D4E3-PLAYABLE-REVIEW-20261016.md)和[D4E4开发者事实窗口](D4E4-WORLD-ACTIVITY-REVIEW-20261016.md)，沿用指南的World权威与人物知识隔离。没有引入外部引擎、通用空间/任务/日志平台或新规则；本轮无需外部资料调研。

## 实际运行与通过证据

脱敏原始输出、PID/argv、五项读取散列、六份文件散列及保护记录见[`docs/evidence/d4e5-20261016/`](../evidence/d4e5-20261016/)。目录内`.gitattributes`保留原始证据字节，`SHA256SUMS.json`可逐文件核对；未上传私档或完整投影/回执。

### 新增前端helper门：2个唯一成员，最终2/2

```powershell
node --test tests/simulation/place-navigation.test.mjs
```

| 运行 | PID | 外层墙钟 | Node测试计时 | 硬限 | 结果 |
|---|---:|---:|---:|---:|---|
| 主实现后 | 40820 | 148ms | 67.5037ms | 60000ms | 2/2，exit0、未超时 |
| 森林读取停写修正后 | 21184 | 141ms | 70.5154ms | 60000ms | 2/2，exit0、未超时 |

两次原始stdout/stderr和元数据分别保留，没有覆盖；是2个成员在不同候选上的两次运行，不是4个不同成员。核对完整同版DTO、错版本/身份拒绝、严格地点过滤/排除未知和输入不变。中控读取同源有效证据，不再复跑这些相同JS；最后的HTML空状态由独立浏览器验证。五个JS语法检查和diff检查通过。本次没有Node测试失败/超时。

### 一条中控真实浏览器导航链：PASS

```powershell
node artifacts/d4e5-controller-20261016/browser-server.mjs
node artifacts/d4e5-controller-20261016/browser-server.mjs --restore --navigation
node artifacts/d4e5-controller-20261016/browser-server.mjs --restore
node artifacts/d4e5-controller-20261016/inspect-world.mjs initial
node artifacts/d4e5-controller-20261016/inspect-world.mjs after-view-navigation initial
node artifacts/d4e5-controller-20261016/inspect-world.mjs after-begin
node artifacts/d4e5-controller-20261016/inspect-world.mjs before-view-village
node artifacts/d4e5-controller-20261016/inspect-world.mjs after-view-village before-view-village
node artifacts/d4e5-controller-20261016/inspect-world.mjs final-before-refresh
node artifacts/d4e5-controller-20261016/inspect-world.mjs final-after-refresh final-before-refresh
node artifacts/d4e5-controller-20261016/inspect-world.mjs final-reopened final-before-refresh
```

首个监督服务PID6060负责新建测试r0并确认ready，中控补HTML空状态前正常quit，未进行业务操作；随后PID9464在最终候选恢复该r0，执行唯一浏览器业务链，正常quit后PID38300重开。三个服务各600000ms独立硬限，分别正常驻留48393/149442/51415ms（包含操作等待，**不是性能数据**），均exit0、signal null、未超时。完整子进程argv见`{first,navigation,reopen}-process.json`：仅测试端口18330及本树`artifacts/d4e5-controller-20261016/world`，`--writable true --inspect-mind false --inspect-activity true`；仅首次带`--profile scene-survival-village --seed 42`。

| 实际操作 | 权威结果 | 页面直接观察 |
|---|---|---|
| 地图→森林→地图→猎人锚点 | rev0/tick0、全部五项API/原r0字节不变 | 本人仍村庄、开始遭遇禁用、actor-2目标存在 |
| 村庄赠粮 | succeeded，rev1/tick0，私粮19 | 猎人记得赠粮，村庄活动1条 |
| 旅行森林 | succeeded，rev13/tick12，位置forest | 村庄同地点人物不可见 |
| 森林开始遭遇 | succeeded，rev14/tick12，active | 森林活动2条，真实遭遇encounter-1 |
| 正常取消 | succeeded，rev15/tick12，closed/cancel | 森林活动3条，狼保留释放 |
| 查看村庄 | 五项API/五份当时service文件字节不变 | 本人仍森林、无赠粮按钮、村庄活动仅赠粮 |
| 点击真实返村 | succeeded，rev27/tick24，位置village | 猎人记忆保持，村庄活动2条 |
| 返回地图/刷新/正常重开 | 五项API与六份service文件全部一致 | 地图5条活动顺序/ID一致，重开后猎人筛选仅1条赠粮 |

五项读取具体指`/snapshot`、`/player`、`/scene`、`/encounter`、`/activities`，未读取关闭的mind检查器。最终活动SHA256：`263d644b248ff4f6c7585e578e63a4ea7d2d3d288c8c032ffc3639246ea449ef`；最终r27文件SHA256：`04c466d9c9fb1da506c892248f9994ee311abe3cc22506d31807d4e882deaeed`。

浏览器一个精确label自动定位未匹配嵌套label文本；检查实际DOM后定位该`data-activity-actor`控件，筛选成功，无业务重发或代码变更。无浏览器console error；临时页已关闭。没有截图、录屏、视觉/像素巡检。没有日结、旧两攻击胜利故事、180tick/H7/128命令、性能或全量重跑；未改部分的审计、篡改/回滚等证据复用既有结论，不冒称本轮新测。

## 保护、发布与停止

最终`protection-final.json`确认：原八份档逐字节不变；78份runtime源码不变；控制树5个既有未跟踪文件不变；18325 PID2592与18327 PID4432启动身份/命令/源码保持，原有9份和3份service文件分别不变（用户后续新增文件不属于本轮写入）。本轮三个服务全部正常退出，测试锁释放，无本轮Node进程残留；18329默认目录未创建。

裁定：**D4E5现有地图到地点体验闭环功能合同限定PASS**。任务源码、报告及脱敏证据已推送独立分支并读回；Projects先待验收，再Done/已验收并读回，D整体仍In Progress。性能Issue3保持开放/暂停；没有main合并、部署、真实数据迁移或外部模型/DSH调用。第三步重要人物新行为仅为后续方向，本轮停止。
