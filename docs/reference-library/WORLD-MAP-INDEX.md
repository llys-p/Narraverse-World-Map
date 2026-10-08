
# Sandbox World / World Map 功能索引

轻量索引见 [WORLD-MAP-CHECKLIST.md](WORLD-MAP-CHECKLIST.md)。

更新时间：2026-10-08。

本文件服务于 Narraverse 的世界地图、沙盒运行时、地图→场景→战斗切换、聚落、队伍、商路、派系与区域事件设计。

## 按问题找参考

| Narraverse 世界层问题 | 主参考 | 辅助参考 | 可借模式 |
|---|---|---|---|
| 世界地图如何成为所有玩法总入口 | Mount & Blade II: Bannerlord | Battle Brothers | Campaign Map 作为 settlement / trade / diplomacy / encounter / battle portal |
| 地图上什么东西应该是独立移动实体 | Bannerlord MobileParty | Kenshi squads, Starsector fleets | Mobile Party / Fleet / Caravan / Patrol 统一高层实体 |
| 队伍需要哪些高层意图 | Bannerlord | Kenshi | travel / patrol / escort / engage / flee / raid / besiege / defend |
| 聚落不只是图标，应该有什么状态 | Bannerlord, X4 | Battle Brothers, Songs of Syx | population / market / garrison / services / faction / prosperity / storage |
| 商路怎么活起来 | X4, Battle Brothers | Endless Sky, Kenshi | 实体商队 + 库存/价格 + 路线风险 + 护卫/劫掠 |
| 经济怎么受战争、道路和资源影响 | X4 | Songs of Syx, OpenTTD | supply chain、短缺、物流瓶颈、贸易中断 |
| 玩家行动如何永久改变地图 | Kenshi World States | Bannerlord | Town Override / faction control / spawn tables / power vacuum |
| 世界事件如何从状态中长出来 | Battle Brothers | Endless Sky, Songs of Syx | shortage/threat/war → contract / mission / crisis |
| 地图旅行怎样有游戏性 | Starsector | Bannerlord, Battle Brothers | route cost / terrain / visibility / pursuer / supply / risk |
| 区域环境如何影响地图 | Factorio | Kenshi, Caves of Qud | diffusing field / weather / ecology / hazard / resource affordance |
| 世界历史如何留下现在可见的痕迹 | Caves of Qud | Kenshi | generated history → sites / relics / factions / secrets / ruins |
| 信息是否应该成为地图玩法 | Starsector, Caves of Qud | Shadows of Doubt | intel / rumor / discovered route / known threat / secret location |
| 远端世界如何低成本运行 | Veloren rtsim | S.T.A.L.K.E.R. A-Life | coarse simulation / lower tick frequency / materialize near player |
| 地图和场景如何来回传递结果 | Bannerlord | Narraverse D2C/D3/D4 | World Context Packet + Scene Outcome Commit |

## 候选功能模块

### WM-01 Mobile Party Runtime

统一描述 caravan、patrol、bandit group、hunting party、army、refugees、messenger、expedition。

建议最小状态：partyId、partyType、factionId、members/aggregatePower、cargo、supplies、position/route、homeSettlement、currentObjective、target、visibility、status。

### WM-02 Settlement Runtime

聚落至少可逐步拥有 owner faction、population、public resources、market、production profile、services、garrison、prosperity/damage、local law、known problems/opportunities。

不做完整城建模拟，只实现真实玩法消费者需要的状态。

### WM-03 Route / Travel Layer

道路和区域不只决定寻路，还可影响 travel time、food/rest cost、ambush risk、visibility、weather hazard、caravan capacity、military reach、trade attractiveness。

### WM-04 Physical Trade Flow

将重要物流逐步实体化：

~~~text
Settlement A surplus
→ Trade Order
→ Caravan
→ Route
→ arrives / delayed / robbed
→ Settlement B stock
→ price / shortage changes
~~~

不需要每一单位商品都有实体商队，可只实体化重要运输批次。

### WM-05 Faction World State / Territory

派系影响拆成 settlement ownership、route control、patrol presence、military pressure、relationship、strategic objectives。

### WM-06 World State Override

参考 Kenshi：

~~~text
关键人物死亡 / 被俘
+ faction preconditions
→ TownOverride / SpawnOverride / PatrolOverride
~~~

用于政权更替、城市沦陷、帮派瓦解和商路改道。

### WM-07 Dynamic Contract Generator

世界状态先产生 Problem：shortage、caravan missing、bandit pressure、wounded settlement、border dispute、missing person、monster migration，再派生 Contract / Opportunity。

任务成为世界运行结果，而不是随机感叹号。

### WM-08 Intel / Fog / Rumor Layer

Canonical World 与 Player Known World 分开。来源可包括 personally discovered、merchant rumor、guard report、map、scout、faction intelligence。Intel 可以过期、错误、不完整。

### WM-09 Environment Field

参考 Factorio 的区域场思想，可抽象成 danger、plague、corruption、monster pressure、war pressure、weather severity、magical disturbance。

场可以由地点或事件产生，在邻区扩散或衰减，并在阈值后触发 party / NPC / faction response。

### WM-10 World Context Packet

从地图进入场景或战斗时传结构化上下文，而不是让场景重新猜世界：

~~~text
locationId
time
weather
participants
party states
terrain
world reason
known relations
active threats
relevant resources
~~~

退出时提交 casualties、resource delta、capture、escape、damage、faction consequence、new facts，由 World Runtime 验证并写回。

### WM-11 Procedural History Footprints

参考 Caves of Qud。历史只有在能留下现在可查询的 state 时才值得做：

~~~text
old war
→ ruined fort
→ local hatred
→ buried weapon
→ rumor / quest / faction claim
~~~

### WM-12 World Log / Intel Feed

EventLog 不直接暴露给玩家。战争、城市易主、贸易中断、灾害等转成 local news、faction report、rumor、discovered crisis、map marker。

## 当前优先级建议

近期，与 D3/D4、M2/M3 最贴近：

1. World Context Packet
2. Mobile Party Runtime
3. Route / Travel Layer
4. Settlement Runtime
5. Dynamic Contract Generator
6. Intel / Fog / Rumor

中期：

7. Physical Trade Flow
8. Faction World State / Territory
9. World State Override
10. Environment Field

后期或按真实消费再做：

11. Procedural History Footprints
12. 复杂宏观外交、战争经济与国家 AI

继续遵守复杂度预算：没有实际玩法消费者的模块，不因为参考游戏很酷就提前造完整系统。
