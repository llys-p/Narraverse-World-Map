
# Sandbox World / World Map 游戏参考目录

更新时间：2026-10-08。

## SW-BANNERLORD: Mount & Blade II: Bannerlord

Bannerlord 的 Campaign Map 是 settlement、trade、diplomacy、quest、siege、battle 的总入口，与 Narraverse 当前“地图 → 场景 → 战斗 → 成长”的层级非常接近。

官方 API 可见 MobilePartyAi 的高层行为包括 GoToSettlement、EngageParty、GoAroundParty、EscortParty、Patrol、RaidSettlement、BesiegeSettlement、DefendSettlement 与 flee；Caravan 还有 DailyTick、HourlyTickParty、SettlementEntered、SettlementLeft 等生命周期。

可借：MobileParty 统一地图移动实体、高层 objective 与近端战斗 AI 分离、地图实体进入场景/战斗的状态切换。

参考：
https://www.taleworlds.com/en/Games/Bannerlord/Blog/65
https://apidoc.bannerlord.com/v/1.3.4/class_tale_worlds_1_1_campaign_system_1_1_party_1_1_mobile_party_ai.html
https://apidoc.bannerlord.com/v/1.3.4/class_tale_worlds_1_1_campaign_system_1_1_campaign_behaviors_1_1_caravans_campaign_behavior.html

## SW-KENSHI: Kenshi

Kenshi 的 World States 能让重要角色的死亡或被俘长期改变城镇归属、Town Override、faction presence、spawn/patrol 与 power vacuum。Zone 还包含资源、土壤、天气等世界层含义。

可借：World State Override、关键人物与宏观世界桥接、派系控制变化。

参考：
https://kenshi.fandom.com/wiki/World_States
https://kenshi.fandom.com/wiki/World_of_Kenshi
https://kenshi.fandom.com/wiki/How_to_make_a_War_Campaign_or_Trader_Visit_About_AI_Campaigns

## SW-X4: X4 Foundations

官方强调 dynamic universe、factions dynamically build and expand stations、react to economy and military threats、fully simulated dynamic economy。

最值得借的不是完整经济公式，而是 production → transport → consumption → shortage → price / military capability / faction reaction 的闭环。

参考：
https://www.egosoft.com/games/x4/info_en.php

## SW-STARSECTOR: Starsector

适合参考 campaign travel 的追逐、传感器、隐蔽、路线选择，market shortage/surplus，fleet/convoy，intel，campaign mission 以及 disruption 对经济的反馈。

可借：route risk、visibility/detection、intel layer、convoy opportunity、shortage/surplus 生成世界机会。

参考：
https://fractalsoftworks.com/2015/04/21/abilities/
https://fractalsoftworks.com/forum/index.php?topic=13008.0

## SW-BATTLE-BROTHERS: Battle Brothers

随机世界地图包含 settlements、差异化服务、hostile camps、caravans、factions、contracts，terrain 又会影响进入战斗后的环境。

最值得借的是 World Problem → Settlement/Faction Contract → Map Target → World Consequence。

参考：
https://battlebrothers.fandom.com/wiki/Global_Map
https://battlebrothers.fandom.com/wiki/Contracts
https://battlebrothers.fandom.com/wiki/Factions_and_Relations

## SW-ENDLESS-SKY: Endless Sky

开源沙盒世界地图游戏。源码能看到 System、Trade、StepEconomy、Fleet/FleetCargo、Mission、MissionAction、MissionTimer、Map 与 NPC。经济更新还把本地生产与贸易发送分阶段处理。

可借：数据驱动 Mission、世界节点贸易状态、Fleet Cargo、Mission Condition/Trigger、世界数据与任务系统低耦合。

参考：
https://github.com/endless-sky/endless-sky
https://github.com/endless-sky/endless-sky/wiki/CreatingMissions

## SW-OPENTTD: OpenTTD

虽然不是角色沙盒，但非常适合参考世界经济时钟。源码把 economy time 用于 industry/house production-consumption、industry change/closure/spawning、town growth、payment interval 和 cargo delivery time。

可借：不同世界子系统使用不同更新时间尺度；production / transit / delivery / history 分离；宏观经济不需要具体 NPC 搬每一单位货物。

参考：
https://github.com/OpenTTD/OpenTTD

重点源码：src/economy.cpp、src/timer/timer_game_economy.cpp、src/industry.h。

## SW-SONGS-OF-SYX: Songs of Syx

世界地图层包含 region、resource、trade、kingdom、army、war、diplomacy、ruler preference、world log、army supplies。开发者也说明 faction trade 会让战争影响价格。

可借：ruler traits 对宏观外交、army supply、war/trade/region control 联动、world log。

## SW-FACTORIO: Factorio

Pollution 是低成本区域 field：由建筑产生、按 chunk 扩散、被环境吸收，并影响敌人攻击。

Narraverse 可抽象为 DangerField、WarPressure、PlagueField、MonsterPressure、Corruption 等。

参考：
https://wiki.factorio.com/Pollution

## SW-QUD: Caves of Qud

官方强调手工世界与程序内容混合、generated villages、generated history、factions、secrets 以及物理/社会/历史模拟叠加。

最值得借的是：历史必须在现在留下可发现、争夺、解释的 state，例如 ruin、relic、faction claim、taboo、old debt、rumor、secret location。

参考：
https://cavesofqud.com/
https://cavesofqud.com/roadmap/

## 与 Character Mind 的连接

World Map 参考线不单独造第二套 AI：

~~~text
World Runtime
├─ settlement
├─ mobile party
├─ route
├─ trade
├─ faction
├─ environment
└─ world event
        ↓
Perception / Intel
        ↓
Character Mind
        ↓
Intent
        ↓
World Command
~~~

M2/M3 解决“人物怎么想”。

World Map 参考线解决“世界有哪些可供人物感知、利用、争夺和改变的结构”。
