# 外部探索 A / C 静态接入评审

2026-10-17（Asia/Shanghai）。结论：**可提取设计与接法，当前不能当作真实业务交付或原样合入。** 本轮只读已有文件及源代码；未启动外部原型、浏览器、服务、第三方模型或新测试，也未修改外部目录、旧绘制源与当前Runtime。

## 1. 实际收件与来源

| 目录 | 本轮实际文件 | 状态 |
|---|---|---|
| `D:/Narraverse-World-Map-exploration/EXT-A-map-place` | app.js、index.html、styles.css、README.md、DELIVERY.md | 五文件存在，静态展示方案可参考；未做运行或业务验收 |
| 同根 `EXT-B-view-bindings` | 目录不存在 | 未收件，不猜测开工/完成状态 |
| 同根 `EXT-C-battle-playback` | app.js、index.html、styles.css、README.md | 有播放样板，**缺DELIVERY.md**；README虽列交付回执，实际未见 |

本轮用性价比子代理做只读源码核对；root重新读取了两处关键API/回调源码交叉确认。没有调用DSH或再次派发外部探索，未创建这些探索的任务板卡。外部文档的模型身份、验证和费用自述不作为本机运行证据。

当前真实业务树 `D:/Narraverse-World-Map-trade-feedback` / `codex/world-runtime-trade-feedback`，HEAD `f7bc32818f25053ef8ae564a389dcd26028bb7a0`、Git干净；93份产品文件已登记散列。旧绘制树 `D:/Narraverse-World-Map` / `codex/world-runtime-a1`，HEAD `7b4a2db98184078021647e8a59eb9dc0c00f67e5`，**有既存改动**。C引用的六份脚本中，当前stickman-engine.js字节与该HEAD不同；其余五份匹配。不能只凭旧SHA就称六份当前文件完全冻结，当前与HEAD的逐文件SHA256见本轮[source-inventory.json](../evidence/d4e9-planning-20261017/source-inventory.json)。旧改动保留。

A DELIVERY引用control `29d8f76`、place-loop `6ed7263`和旧绘制 `7b4a2db`作为当时参考；它没有绑定当前D4E8真实读数。外部两个目录没有自身交付Git提交，不把其说明里的SHA当产物版本；本轮以九份实际文件字节散列定位。外部文件可能以后继续变化，此结论仅对应本次登记的字节。

## 2. A：采纳布局思路，替换静态位置与人物集合

`EXT-A/app.js:72,84-93`的currentPlace/enterPlace只换界面；`app.js:48-60`的森林站位包含静态玩家；`app.js:349-354`的按钮只本地提示。README:11、35-37明确静态/不旅行，未把切换宣称为真实世界移动。

actor-1/2/3/4和village/forest标识与当前Runtime一致。真实身份由`runtime/core/actors.mjs:40-41`、`player-runtime.mjs:9`创建；玩家允许村庄/森林的位置门见actors.mjs:66-67。三个NPC固定村庄的规则仍在。

| 可复用 | 接入前必须适配 |
|---|---|
| 地图与地点双视图、两个地点入口、actorId视觉锚点、姓名/按钮层 | 当前查看地点与玩家实际位置分开；地图标记取同版玩家投影，地点cast取实际可见人物 |
| 无依赖的SVG地图与场景分层思路 | 静态ACTORS、台词与坐标不能成为世界事实；看森林不能把仍在村庄的玩家画成已到森林 |
| 返回地图与语义地点入口 | 旅行仍须提交原PlayerTravel并确认回执；导航/刷新不推进时间 |

A没有实际调用DemoStickman或DrawingKit，而是自包含的简化火柴人。因此主要复用布局/绑定思路；正式消费者应优先使用已存在的绘制资产，避免为静态样例再维护一套人物引擎。A同目录脚本/CSS引用可搬移，但搬移不等于业务绑定完成。

## 3. C：可参考播放层，但有三项明确适配点

### C1 API自检大小写错误

`EXT-C/app.js:646-649`探测 `DemoStickman.ACTIONS.attack/dodge/knockdown/victory`；当前`stickman-engine.js:1647-1648`导出的是小写 **actions**。这会把动作误报缺失。动作本身在源码中存在，实际stage播放接法与这项自检不是同一问题。接入时应纠正自检和文档，不据该面板认定素材没有动作。

### C2 屏震旧定时器未被播放代次取消

C自身的tween/beat等原语捕获my并检查my.alive（`app.js:277-300`），resetAll作废旧token并清动画层（186-212），这是可复用思路。可是它调用的`world-fx.js:94-102`给同一DOM容器加class，再用无代次的setTimeout在260ms后删除该class；resetAll没有取消这个外部timer。

静态可达的时序为：旧屏震启动→重置→新屏震加相同class→旧timer删除新class。它可能截断新一轮屏震；**不是世界/HP状态被篡改的证据**，本轮也没有浏览器复现。README:117-119“唯一例外只是浮字移除”的说法不完整。真实接入前须让屏震也受本次播放的取消边界管理，或在这个消费者中采用可取消表现；不能为处理一个timer泛改共享旧引擎。

### C3 素材路径绑定旧本机布局

`index.html:121-126`通过 `../../Narraverse-World-Map/...`引用六份旧脚本。原固定目录下路径存在；复制进独立运行树后会指向错误位置。接入必须用目标仓库中经过确认的实际资产及现有静态资源路由，不继续跨树读取用户脏工作区，也不复制整个旧原型。

六份脚本的关键实际API已逐项静态对照：DemoStickman.createStage/stage方法、StickArt.list/get/draw、WorldCombatFX.init/ready/resize/anchor/burst/particles/clear、WorldFX.play/shake/freeze。`app.js:15-16`注释把stage方法写得像DemoStickman顶层成员，实际调用使用stage，文档应澄清。路径存在和函数存在都不代表运行或视觉通过。

## 4. 播放与权威的接入边界

C的`MOCK`表（app.js:5-12及29起）手写HP、命中、伤害与末态；applyHp及步骤播放消费这些值（451-475），没有发现联网、存档或业务提交逻辑。跳过本步/全部与作废token有实现（538-575），但未运行验证其实际效果。

当前真实单狼规则是狼血300、玩家每击150、存活狼反击80、最多两击（`runtime/core/encounter-combat.mjs:13-24`）；C的120/90初始HP及24/40/26伤害是模拟表，不能拿来当现有规则或奖励。真正接入应把**已确认服务回执**中的前后HP、实际动作、resolution转为表现步骤；播放不能计算命中/伤害/胜负、提交额外攻击、发奖励或重复写世界。新回执/遭遇到达或重置时取消旧表现，恢复页只重建已确认状态。

原型也不能直接新增伤害字段到既有API来适配自身模拟表。先完成真实字段绑定矩阵；B尚未收件，本轮不假造B交付或代其实现完整适配。

## 5. 结论与后续

- A：布局/人物标识方案可参考，真实位置/可见人物/合法命令绑定未做。
- C：分层canvas、stage调用、线性结果播放器及自身token守卫可参考；API自检、外部屏震取消、目标资产路径和缺交付回执须补齐，运行状态未知。
- B：未收件；先保留缺项。没有扩地图、NPC移动或战斗奖励的新授权结论。

本轮仅做静态必要核验，没有重复交付者语法检查，没有打开原型/截图/视觉巡检，没有修外部文件、提交其代码或启停现有18325/18327服务。后续收到完整交付再按精确字节/目标源码规划最小消费者适配，不能原样合入或自称业务已验收。
