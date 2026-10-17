# D4E10 图形体验接入：实现与根复核

2026-10-17（Asia/Shanghai）。**合同范围功能 PASS；外观与性能未验收，D阶段整体仍进行中。**

## 给用户：可以直接体验什么

地图标记现在显示真实玩家所在地点，点击村庄或森林进入地点页。村庄图形绑定同一修订中的在场人物，原赠粮按钮与本人记忆仍在。森林使用已有火柴人与狼素材，在真实攻击/逃跑回执确认后播放前后健康过渡；没有编造MISS、暴击或逐击伤害。跳过/停止只结束表现。

本树双击 `Start-D4E10.cmd`，等待 ready 后打开 `http://127.0.0.1:18338/runtime-map.html`；输入 `quit` 并等待 stopped 后可再次双击恢复。本入口独占新目录 `artifacts/d4e10-daily/world`，沿用 `scene-livelihood-village`，没有存档升级。本次没有创建或启动该日常世界，用户原18336世界保持运行。

根实际页面已完成：村庄赠猎人1粮→旅行森林→开始遭遇→两次攻击胜利→返村。最终 **tick36 / rev38 / 健康920 / 私粮19 / 狼健康0 / 胜利 / 狼死亡账1**。返村后四个人物身份与猎人收粮记忆仍在；关闭重开后地图、村庄和森林读取一致，查看异地不画假在场玩家，也不自动重播战斗。

只做DOM、操作及控制台核验，**未截图、录屏、视觉或音效检查**。图形已接真实业务，外观质量仍待用户体验；没有日常流畅或长历史性能合格结论。

## 给AI：源码、范围与来源取舍

- 执行树：`D:/Narraverse-World-Map-graphical-loop`，分支 `codex/world-runtime-graphical-loop`。
- 基准：`fe66af943069bb62324a82aa1cd43d0b1bfb8212`（已验D4E9）。实现提交：`157c5ddfe57e3ef53c2ee71df2001726b12d5369`。本报告与证据为随后文档提交；精确最终交付SHA见控制状态及远端读回。
- [冻结合同](../../tasks/D4E10-GRAPHICAL-LOOP-TASK.md)，控制发布提交 `1f19b62`。实现15文件，373增/5删；`runtime/**`、五份素材、DTO/receipt/schema/规则/完整审计及历史重演零diff。
- 服务仅增加8条固定静态白名单：三个表现模块/样式与五份本仓库已有绘制素材。沿原同源、GET/HEAD、CSP门，不通过路径参数读取目录或其他树。
- 页面工人负责地图/村庄机械接线，请求 gpt-6-luna/high；根负责回执与取消机制、战斗接线、服务路由，并逐项审查与真实消费者验收。模型请求标识不代表独立观测的计费路由；无DSH或第三方模型API调用。

| 来源 | 采用 | 调整或不采用 |
|---|---|---|
| EXT-A 五文件 | 两地点布局、同一actor-4身份 | 静态cast和假位置改为真实同版投影；不复制假业务 |
| EXT-B 三文档 | 消费者与权威字段锚点 | 修正工作receipt仅wallet/fatigue、AdvanceTime result=null、attackTicks/canBegin已有；initialPlayerHealth不作上限、人口/活动不作人物知识 |
| EXT-C 五文件 | 火柴人/狼分层、确认结果播放、捕获token | 不采用MOCK伤害/命中/暴击、错误ACTIONS/has、跨树脚本或不可取消的WorldFX屏震timer |

五份素材来自本候选已经跟踪的文件，原字节SHA见 `protection-before.json` 的assets。没有复制旧脏绘制树引擎，未改外部13文件或扩展分发许可。原型本身未经本次运行验收，不将原作者静态检查混为真实业务通过。

## 环境、命令与次数

Windows / Node.js **v24.14.0** / win32；详细OS见证据 `environment.json`。没有安装依赖。实际子命令：

```powershell
node --test tests/simulation/graphical-playback.test.mjs
node scripts/verify-d4e10-graphical-loop.mjs --browser
```

另外对 `syntax-final.json` 中7个文件逐个执行 `node --check`。纯测试由父进程限30秒，每个语法检查限15秒；浏览器消费者父进程监督单阶段120秒、子进程总600秒、退出确认5秒。`--browser` 等待根真实浏览器操作完成标记，单独执行不会自动点击，未提供标记将按硬限退出。所有业务写入在子进程独占的新world。

| 检查 | 实际结果 | 边界 |
|---|---|---|
| 表现数据/取消工具 | 最终3/3 PASS，68.7291ms；无fail/cancel/skip | 异地过滤、确认回执/同版门/不修改原回执、不造damage、取消/新修订失效、重复回执拒播 |
| 7文件语法 | 全部exit0 | map/village/encounter/presentation/playback-state/server/监督脚本 |
| 根真实页面故事 | 一次PASS，6条成功命令 | 地图位置、异地空态、赠粮记忆、旅行、战斗胜利、返村；首次播放时攻击禁用，跳过回到确认末态 |
| 静态资源门 | 8路GET+HEAD，未知404/POST405/外源403 | 安全门未绕过，HEAD无正文、长度一致、nosniff |
| 完整磁盘审计及重开 | PASS | 正式service-commit全审计/重演，五投影/活动、七档SHA一致；六完整DTO再次POST得到原回执且不增档 |
| 恢复页面只读观察 | PASS | rev38地图村庄、村庄四身份/记忆、森林idle无在场玩家/狼，无自动重播；不发业务命令 |
| 旧DTO3 | 一次0命令只读门PASS | scene-survival-village的capabilities DTO3、8路资产可读；未复跑旧玩法链 |

一次预期RED在新模块不存在时失败，随后唯一纯GREEN通过。GREEN的Python包装器保存Node exit0和原stdout后，因GBK打印✔抛UnicodeEncodeError；已独立读回原始证据，没有为了打印重跑测试。说明按工具结果重建，非原始错误日志。

自动化选择器问题见 `browser-observations.json`：森林文字/图形链接同名，改用已观察到的SVG id；第二攻击1.4秒播放已结束才等待playing，未捕获中间态；村庄revision在graphic-stage，纠正定位后读到38。没有重发攻击。第二次停止按钮只在已完成末态点击，**不宣称测过第二次播放中停止**；播放中跳过有第一攻击证据，代次取消另有纯测试。刷新/断连/离页/减少动态等浏览器分支仅静态审查，未做完整运行覆盖。

## 原始结果与性能边界

执行目录：`artifacts/d4e10-acceptance/2026-10-17T02-44-42-522Z`。子PID62856，exit0 / signal=null / killed=null。监督器未介入；第一攻击页面阶段113701.196ms接近120秒上限，含人工编排与上下文整理等待，**不能当攻击耗时**。

| 阶段 | 墙钟ms |
|---|---:|
| fresh-open | 204.2721 |
| full-file-audit | 7897.9357 |
| close | 6.6585 |
| reopen | 8342.0871 |
| reclose | 2.2789 |
| old-profile-read-only | 155.1181 |

browser-*阶段含根页面操作、等待与证据记录，数值全在result.json。这是一次短史功能样本，未测CPU、交替A/B或波动；不与D4E9另一条不同历史的23.6秒重开比较，不宣称优化收益。Issue3保持暂停。

- 五投影canonical SHA256：`4fc83f2deb39cd43fd257a67ccd6fa34099f6e35c6418e6f0612121fb883c5ba`。
- 终档r38原字节SHA256：`e7b8be933ade1df21fbfcc3f184cf2765f450f457e114993d7d4968c56056d50`。
- 七份测试正式文件为r0/r1/r13/r14/r20/r26/r38，跨关闭/重开/六请求幂等重试/只读页面全部不变。全部SHA与六条原回执见脱敏result.json，**不上传完整service-commit或原始八档正文**。

## 保护、交付与停止

原八档8/8 SHA未变；D4E9原97产品源、用户原日常7文件（含现存锁）、外部13文件、控制5旧文件均未变。候选103份运行源验收前后逐字节匹配；素材5文件和runtime/**零diff。证据包含逐文件前后SHA。

既有18325/PID2592、18327/PID4432、18336/PID48192仍监听，未启停。测试子62856已退出，9600/9984无监听，两测试目录无锁，临时浏览器页已关闭。新日常18338世界尚未创建。

报告与[27份脱敏证据文件](../evidence/d4e10-graphical-loop-20261017/SHA256SUMS)随独立任务分支交付；证据目录`.gitattributes`保持原始行尾，SHA256SUMS覆盖除自身外26文件。Projects按进行中→待验收→限定已验收读回，最终远端与看板SHA由控制状态登记。

未运行全量/无关/长历史/视觉测试，未启动日常入口、合main、部署、迁移。工作/买粮/日结、非法篡改拒绝与失败回滚复用未改内核的[D4E9证据](https://github.com/llys-p/Narraverse-World-Map/blob/fe66af943069bb62324a82aa1cd43d0b1bfb8212/docs/runtime/D4E9-PLAYER-WORK-RESULT.md)，不称本轮重测。长期补给、NPC新行为/移动、逐击事件API与更多地点另定合同，本次范围完成停止。
