# D4E11 自主行军、地图NPC相遇与日式回合制：执行合同 v1

2026-10-17（Asia/Shanghai）。用户明确选择途中暂停/改道，并补充地图可遇见NPC；战斗明确采用日式RPG回合制。**以本合同替换v0.1按段旅行草案，直接按已确认目标开工，不再请求重复确认。**

## 给用户

点击地图目的地开始行军，途中可暂停或另点目的地改道；已确认的位置/路线随世界保存。附近会出现同一身份的村长、猎人、商人；新相遇暂停行军供查看人物/已有收粮记忆。村长留村，猎人与商人走固定有界路线。本版人物交互复用真实已有能力，不加模型对话、假台词或新任务系统。

森林遭遇进入大幅JRPG战斗画面，指令→选择目标→确认→攻击/真实反击/倒地演出→下一回合/结算。地图和战斗都使用同一个世界、同一个玩家。

## 1. 行军语义与预算

- 沿v0.1的20×12地图、村庄中心(4,7)、森林入口(16,7)、村庄区x3..5/y6..8、森林区x14..19/y2..11、河列x10仅桥y7通行；其余为road。四邻接最短路，固定北/东/南/西，最多240搜索节点/48步。地图坐标是真实世界状态，画布像素仅表现。
- 新profile campaign-village / d-campaign-v1 / serviceFormat11 / DTO5/receipt5 / actor-config-v5、society-config-v7、memory-config-v8 / memory-observer-v4；工资账沿player-state-v4。旧profile与DTO、原始存档规则/字节不变，不迁移。
- 新命令 MarchSet{x,y}（开始/改道）、MarchPause{}、MarchResume{} 均0 tick/revision+1；MarchStep{}每次推进min(剩余步数,2)真实tick，其余字段由服务计算。前端一次只提交一笔，确认后再续发，决不按每个动画帧写档。
- 每tick先按路线走一格、更新真实区域，再执行该tick原规则/日结。只存活者可移动；日结死亡后暂停，后续格不再走。一次已接收的至多2tick仍完成，可能因相遇/死亡出现一tick原地等待；仅真正走格增加步数/疲劳。
- mapModel精确 `{version:'campaign-map-v1',mapId:'village-forest-v1',position:{x,y},travelledSteps,npcs:[{actorId,x,y,routeIndex}],order:null|{target:{x,y},path:[{x,y}],index,status},contact:null|{actorId,tick}}`。order状态marching/paused/arrived，position等于path[index]；到末端必arrived。累计路程折算疲劳：每格取ceil(新总步数×100/12)−ceil(旧总步数×100/12)，上限1000，暂停/改道不额外收费。
- 点击暂停立即停止续发行军步进；若已在提交，完成这一笔至多2tick后，以最新revision提交暂停，界面明确待确认。改道也先确认在途请求，再从实际当前位置重算。不能回滚已走路程/时间，不并发写，不覆盖旧pending ID。
- 刷新、离页、断连、重开均停止前端续发；存档保留订单，但页面不自动恢复行军，用户明确点继续才运行。暂停等待/查看/拖动镜头不推进世界。服务不建墙钟后台模拟器。
- 保留原128命令/129正式文件预算，不提高上限或清档。MarchSet/Resume至少留3笔空间；MarchStep必须保留最后1笔给暂停；预算不足则停止续发并使用保留位落盘暂停，向用户说明本实验存档预算已满。旧profile门不变。
- 相同点/水面/不可达/死亡/遭遇占用拒绝；格式/越界/未知键/成本注入4xx无提交。相同完整DTO幂等，异DTO同ID冲突。行军中不接受工作/交易/休整/赠粮/遭遇/任意AdvanceTime旁路，先暂停；旧PlayerTravel仅在旧profile保留。

## 2. NPC真实位置与相遇

- NPC地图位置纳入mapModel与完整重演，跨区域变化写入CampaignRegionsChanged事实供新observer-v4逐条重演；旧observer-v1/v2/v3不放宽。actor.location必须与各自坐标派生区域一致；只有新actor-config-v5允许三NPC实际离村。旧NPC固定村庄规则不改。
- 初态：村长(4,6)固定，猎人(5,7)沿水平路到(16,7)折返（每4tick一格），商人(3,7)经(3,8)沿南路到(9,8)折返（每6tick一格）。确定性、无随机抽样，不加通用日程AI。
- 地图展示Chebyshev距离≤4的存活/遗留在场人物，≤1可查看身份、可观察身体状态及该NPC本人收到玩家粮食的既有记忆；不泄漏钱包/目标/计划/他人记忆。
- 当一次tick后新进入≤1范围且上tick不在范围，记录最低actorId的contact并暂停行军；已在附近的人不反复触发。contact对象NPC暂留待交互，其他NPC照规则走；MarchPause清contact并保持暂停，MarchResume或MarchSet清contact后继续。到终点时contact可存在但order仍arrived。
- 赠粮继续既有村庄/猎人等条件，仅再收紧真实距离≤1，不扩展野外赠粮规则；地图路遇先支持查看人物与记忆。查看本身不推进时间、不伪造对话结果。

## 3. 权威接口和回合表现

- 原命令通道接DTO5。March类成功result为 `{action,before:{x,y},after:{x,y},stepsMoved,status,contact}`；拒绝为 `{code}`。顶层保持原scene精确12字段，receiptVersion5。全量原子发布、坏最新档拒绝、幂等/版本/同源/只读保护保留。
- 新只读 `/api/runtime/map`：`{apiVersion:1,mapViewVersion:1,simulationId,revision,tick,mapId,width,height,blocked,landmarks,self:{actorId,x,y,location,alive},order,contact,actors:[{actorId,name,occupation,location,alive,condition,x,y,canInteract,receivedGifts}],movement:{maxSteps:48,ticksPerStep:1,batchTicks:2},budget:{remainingCommands}}`。actors仅上述可见范围；receivedGifts仅本人收到玩家的既有收粮记忆。客户端严格组校验。
- 新profile仍有snapshot/player/encounter/scene/activities；mind检查器本片不开放。新界面用runtime-campaign.html/mjs/css，原DTO3/4页面和原入口保持；不让旧页面假称支持DTO5。所有地图与战斗交互都从新界面消费新合同。
- PlayerGiftFood/Rest/Buy/Sell/Work及EncounterBegin/Action/Cancel沿原规则；scene可见人物加距离门，工作/交易仍村庄。NPC私有AI决策与玩家可知信息分开。
- EncounterAction的新receipt5 result增加turnEvents至多6条，事件精确 `{kind,actorId,targetId,beforeHealth,afterHealth}`；kind player-strike/wolf-counter/world-settlement/defeat/flee。由真实执行点产生、按完整输入重演，空字段null；旧receipt3/4不加键。
- 保留150攻击/80存活狼反击/6tick/两次攻击胜利等原战斗规则。真正战斗变化与日结前后变化分开；完成前死亡不得播放未发生的攻击，击杀回合不得让死狼反击。UI不计算伤害/命中/暴击或因点击预测结果。
- 战斗模块API `mountCampaignBattle({element,onCommand,onStateChange})` 返回 `{sync(group),cancel(),get busy()}`；group含同版capabilities/snapshot/map/player/encounter/scene。onCommand(type,payload)返回 `{receipt,command,group}`（已严格校验并刷新），模块据真实turnEvents播放。root共享 `runtime-campaign-contract.mjs` 提供严格receipt验证。
- 图形素材5文件原字节复用。独立时间线rAF/WAAPI、捕获代次、减少动态、跳过/停止；新revision/刷新/离页/错误取消旧回调。HTML菜单/HP/人物姓名可键盘操作，详情折叠；失败保留真实结果。禁止旧WorldFX不可取消屏震timer。

## 4. 复用与文件所有权

沿v0.1参考裁定：旧index.html只借点击/跟随/地图表现；不接其前端WorldState/随机怪/本地时间存档。Bannerlord仅为既有资料库的设计线索，不声称复刻其内部实现。复用原encounter完整审计/日结与真实战斗规则，不复制整套Runtime、不放宽校验。

- 根：campaign-map.mjs、scene-campaign-runtime.mjs、campaign-village fixture；encounter-runtime/world-state/command-engine/event-log/experience-state/memory-observer；http-contract/service-commit/runtime-owner/world-activity/runtime-server；runtime-campaign-contract.mjs、Start-D4E11.cmd；任务/状态/README/结果与脱敏证据、直接必要核验脚本。
- 版本接线工人：actors.mjs、society.mjs、player-state.mjs、memory-runtime.mjs、mind-runtime.mjs、motivation-runtime.mjs。只新增campaign新版本配对与base hooks，旧默认门不变，不改算法/审计。
- 地图页面工人：runtime-campaign.html/mjs/css，仅新界面、真实API接线/行军续发、暂停改道与NPC卡、已有工作/交易/赠粮入口；不写核心/服务/战斗模块/共用验证器。
- 战斗工人：runtime-campaign-battle.mjs/css，按上方API实现JRPG场景与捕获token播放；不写其他页面/服务/核心/共用验证器。
- 原绘制5素材、data-contract、旧入口、外部A/B/C原件、原私档不改；不得顺便重构。文件范围变化由根先核定具体依赖。

## 5. 实施与核验

基准6c60fe2d5b6276660936e1ab55a43385a79737ba；执行树D:/Narraverse-World-Map-campaign-jrpg，分支codex/world-runtime-campaign-jrpg。先权威行军/暂停改道/位置恢复，再接页面/NPC相遇与回合表现；根复核廉价模型负责的机械接线，不调用DSH/第三方模型。

只做最少定向功能检查：坐标/碰撞/确定路由/费用/暂停改道/预算保留、真实NPC位置/相遇/隐私；一次服务发布失败回滚和篡改拒绝；真实owner同一世界暂停中重开，route/position/NPC/回执/正式档SHA一致；一例跨日结战斗归因及死亡停止。纯检查父限60秒、定向服务各180秒；根消费者阶段120秒/总600秒/退出确认5秒。无全量、长史、视觉、无关或扩展边角核验；失败保留，不盲重跑整链，不削弱重演来提速。

真实页面主链至少含：地图新订单→中途暂停→改道→NPC真实相遇/查看→继续到森林→开始/攻击胜利→回地图→关闭重开同位置/订单/世界；以实际回执累计tick/revision，不能沿用v0.1的36/38/7命令常数。

现有18325/18327/18336及新发现18338 PID61236均保护，不启停；验收新目录随机端口，日常入口拟18340，先查占用且不自动启动。原八档、D4E9/D4E10产品/用户数据、控制5旧文件保留；dual-presentation-demo.html以当前字节为准，不回写旧散列版本。

交付代码/报告/脱敏摘要到独立分支，控制状态≤150行和Projects逐字段读回；功能、外观、性能、D整体分别判断。无main合并、部署、迁移或上传私档/完整bundle。有限128命令预算与2tick确认粒度明示，不承诺无限长期游玩或实时战斗。本合同范围完成后停止。

## 已授权补验（2026-10-17 Asia/Shanghai）

原页面600秒预算已耗尽，保留PHASE_LIMIT/TOTAL_LIMIT及已胜利存档，不把超时记作通过。用户明确授权仅一次300秒补验、单阶段120秒、退出确认5秒，接续同一隔离r39返村订单，仅完成返村与正常关闭/重开比对，不重复攻击/新建世界或重跑整链。脚本以wx标记限制一次补验；返回途中每个实际revision确认作为下一有界阶段，补验总限不重置。

2026-10-17后续用户明确“继续”，安排一次新的有界接续 `20261017-user-continue`：仍300秒总限/120秒阶段限/5秒退出确认，从同一r50商人相遇继续返村及正常重开，不重复战斗。与原600秒、首个补验分别计时/留证，不能覆盖旧失败或把接续说成单次全绿。
