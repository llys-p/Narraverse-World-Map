# D4E10 图形体验接入合同 v1

2026-10-17（Asia/Shanghai）。用户已明确“那开始吧”，批准此前提出的地图/地点真实绑定及确认回执战斗表现。基准D4E9 `fe66af943069bb62324a82aa1cd43d0b1bfb8212`，执行树 `D:/Narraverse-World-Map-graphical-loop`，分支 `codex/world-runtime-graphical-loop`。功能施工与验收独立，不合main/部署/迁移。

## 给用户

采用A的两地点布局、B经复核的真实字段绑定、C的火柴人与狼素材及回执播放思路。现有工作、买粮、赠粮、旅行、攻击、返村与保存恢复继续使用原命令。地图标记只跟随已提交位置；查看森林不代表旅行。场景画同版可见人物，姓名和操作仍用可访问HTML。战斗画面只解释已确认回执，跳过/停止只结束表现。

## 冻结边界

1. 不改任何runtime/**内核、HTTP DTO/receipt版本、存档schema/规则、历史重演/审计；本轮没有新玩法或API数据字段。唯一服务改动为固定白名单静态资源路由，沿现有GET/HEAD、同源/CSP/只读门；不允许任意路径拼接或目录暴露。
2. 使用本分支已经跟踪的绘制脚本原字节：stickman-engine.js、stickart/stickart-core.js、stickart/beasts/quad.js、stickart/beasts/deep.js、world-combat-fx.js。它们与旧脏绘制树的原字节可能不同，必须记录各自SHA，不复制旧脏源、不改引擎。不加载world-rpg/skills/save/AI，素材许可不扩大。
3. 地图示意点只绑定player.self.identity.location（village/forest）与actor-4，位置无中间路线/权威坐标。地点cast仅来自同版scene.actors，玩家仅在实际location等于查看地点时出现；查看异地显示明确空态，不用snapshot名册伪造在场人物。村庄三NPC姓名/actorId与赠粮锚点保留，旧命令不重复建通道。
4. 所有图形状态只在页面现有一致组校验通过后更新；错误/迟到读数保留或明确过期，不画来自不同revision的组。可用textContent/固定有限CSS，不把名称插HTML。canvas为装饰，HTML人物清单/回执和原按钮仍可操作。
5. 遭遇表现：玩家DemoStickman独立stage，狼StickArt shadow_wolf；使用实际actions小写API，不读不存在has/ACTIONS。只在成功且已通过现有严格receipt校验的新EncounterAction(attack/flee)上播放；恢复、刷新、sessionStorage历史不自动播放，不根据UI点击预测结果。receipt before/after生命作为前后状态插值，狼死亡/玩家死亡/结局仅来自权威末态。
6. 不伪造MISS/暴击/逐击伤害。单命令可能跨日结，before-after生命净变化不能标成武器伤害；只标“已确认动作/前后健康/结果”。动画毫秒是表现节奏，与回执durationTicks世界时间区分。玩家满血刻度1000/狼300为现行冻结配方，不以initialPlayerHealth冒充上限。
7. 取消：每次新同版组、新回执、刷新/断连、离页、跳过/停止使旧代次失效；rAF/WAAPI可取消，清粒子。所有延后写UI均检查捕获token。禁用WorldFX.shake、freeze与延迟actorAction等不可取消路径，不为它改旧引擎。清空stage用hidden占位避免ensureDefault补假hero。表现结束/取消回到最新已确认末态；跳过/停止无fetch/存档/新命令，重复回执不重复播放。prefers-reduced-motion直接末态。
8. 同一世界三页旧版DTO3与D4E9 DTO4兼容分派继续保留，原pending/幂等/只读/死亡/遭遇占用/余额等门不削弱。动画期间暂禁战斗写按钮，跳过后恢复；导航、返回和读数刷新不触发旅行/攻击。

## 精确文件所有权

- 页面工人（性价比模型）：runtime-map.html/mjs/css、runtime-village.html/mjs/css。地图SVG标记与链接、村庄图形及HTML锚点。村庄调用共享createPlaceView，不写共享模块、服务或战斗。
- 根：runtime-presentation.mjs、runtime-presentation.css、runtime-playback-state.mjs（极小纯回执/代次工具，便于定向反例）；runtime-encounter.html/mjs/css；runtime-server.mjs仅静态白名单；Start-D4E10.cmd；README.md、PROJECT_CONTEXT.md、本文、docs/runtime/D4E10-GRAPHICAL-LOOP-RESULT.md、tests/simulation/graphical-playback.test.mjs、scripts/verify-d4e10-graphical-loop.mjs、docs/evidence/d4e10-graphical-loop-20261017/脱敏摘要。
- 共享API createPlaceView(canvas,labels).show({simulationId,revision,tick,viewPlace,player:{actorId,name,location,alive},actors:scene.actors})。只渲染viewPlace内人物，标签取真实name/actorId，布局坐标静态示意；不fetch，不建业务按钮。
- 素材5文件保持原字节；A/B/C原目录全部只读。若必要文件超白名单，由根先核定原因，不让执行者猜测扩项。

## 最少验收与预算

先跑纯表现适配/取消/去重/同版边界定向测试（父限30秒）；语法检查每Node限15秒。根单一fresh scene-livelihood-village seed42：页面地图定位actor4村庄→村庄赠1粮→真实旅行森林→开始遭遇→攻击2次胜利（测试取消/跳过时不重复命令）→返村→正常close/reopen，五投影/活动/正式档SHA与原receipt一致。其余工作/买粮/day等内核未改，复用D4E9证据，不为本轮重复跑。可额外做一次0命令旧DTO3只读资产加载/标记检查，不复跑旧长链。

每业务阶段120秒、子总600秒、退出确认5秒；页面操作最多分阶段受监督，不在UI线程timer里自称硬限。所有本轮过程/首败保留；异常先保全，不盲目重复故事。浏览器只查DOM/输入/网络结果/控制台，不截图、录屏、像素或视觉巡检；动画外观/音效未验如实报告。无全量/无关/长历史/H7复跑。

## 来源采用与静态勘误

A只借布局/actorId，去掉静态cast/假玩家位置。B三份清单保留原件；纠正工作receipt仅wallet/fatigue、AdvanceTime result=null、attackTicks/canBegin已有投影、人口可读不等于人物知识、initialPlayerHealth不是上限；简单动作表现不必新增事件API。C只借分层/原素材/捕获token，去掉MOCK步骤、错误ACTIONS/has、自行伤害与旧屏震timer路径；使用本仓库固定资源路由。三者均无浏览器验证，不称已验收原型。

## 交付与停止

代码/任务/结果及脱敏证据推送独立分支，Projects先进行中再待验收再按证据收口；控制唯一状态≤150行。保护原八档、既有5控制文件、D4E9树与用户18325/18327/18336服务。新日常入口18338/本树artifacts/d4e10-daily/world，不覆盖旧入口或自动运行用户世界。原始私档/完整bundle不上传；D整体继续进行中，Issue3暂停。只完成本合同后停止。
