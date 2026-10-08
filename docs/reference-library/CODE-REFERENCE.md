# 外部代码与实现参考

更新时间：2026-10-08。

## 总规则

参考库里的“代码参考”分两种：

1. **读架构**：看数据结构、模块边界、调用链、测试方式，然后在 Narraverse 独立实现。
2. **代码复用**：复制或改造外部实现。

默认只允许第 1 种。

第 2 种必须在任务书里单列 license review，并记录具体 repository / commit / file。

---

## CODE-CDDA: Cataclysm:DDA

仓库：

https://github.com/CleverRaven/Cataclysm-DDA

2026-10-08 检查到的相关代码：

- `src/npcmove.cpp`
  - NPC 行为决策；
  - committed goal；
  - 防止 goal flip-flopping。
- `src/npc.h`
  - AI cache / committed_goal。
- `tests/npc_test.cpp`
  - NPC AI 行为测试。

许可证：

Cataclysm:DDA README / LICENSE.txt 声明代码和内容使用 Creative Commons Attribution-ShareAlike 3.0，且部分随项目分发的代码可能使用其他许可证。

### 本项目规则

默认只做结构参考。

若未来确实希望复用具体代码：

- 先检查目标文件的具体许可；
- 评估 BY-SA 3.0 与本仓库未来许可/分发方式的兼容性；
- 没有完成这一判断前，不复制代码正文。

---

## CODE-VEL: Veloren

仓库：

https://github.com/veloren/veloren

重点：

- `rtsim/src/rule/npc_ai/mod.rs`
- `rtsim` crate
- Action abstraction
- simulated tick skip
- loaded / simulated NPC 两种运行深度

文档：

https://docs.veloren.net/veloren_rtsim/

许可证：

仓库根 LICENSE 为 GNU GPL v3。

### 本项目规则

GPLv3 代码默认只读架构。

优先独立实现：

- Cognitive LOD；
- long-running Action；
- 低频 simulated NPC tick；
- controller / world simulation 分层。

如需直接复用任何 GPL 代码，必须先明确本项目许可策略。

---

## CODE-VEF: Vanilla Expanded Framework

仓库：

https://github.com/Vanilla-Expanded/VanillaExpandedFramework

可阅读示例：

`Source/VEF/AnimalBehaviours/AI/JobGivers/JobGiver_GetWeirdFood.cs`

可以观察 RimWorld Mod 如何读取 Need 并产生 JobGiver 行为。

2026-10-08 检查到仓库根 LICENSE 为：

Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International。

### 本项目规则

**只做阅读参考，不复制、不修改、不移植该仓库代码。**

它最适合帮助理解 RimWorld Mod API 的使用形态。

---

## PROPRIETARY-DECOMPILED: 专有 / 反编译源码

搜索 RimWorld、The Sims 等机制时可能出现反编译仓库。

规则：

- 可以用来确认“存在某个接口/类/调用关系”的事实；
- 不作为 Narraverse 代码模板；
- 不把大段反编译代码、常量表或实现逻辑复制进本仓库；
- 优先使用公开 Modding Reference、官方资料、开发者演讲和合法开源 Mod。

---

## 代码参考进入任务书时的标准格式

```text
Reference:
- Ref ID: REF-CDDA / CODE-CDDA
- Source: CleverRaven/Cataclysm-DDA
- Files inspected: src/npcmove.cpp, src/npc.h
- Pattern used: committed goal / anti-flip-flop
- Code copied: no
- License impact: none, architecture-only
```

如果真的复制：

```text
Code reused: yes
Exact commit:
Exact file/range:
License:
Compatibility decision:
Required attribution/share-alike obligations:
```

没有这些字段，不允许把外部代码直接放入生产实现。


---

## CODE-ENDLESS-SKY: Endless Sky

仓库：

https://github.com/endless-sky/endless-sky

2026-10-08 重点代码参考：

- source/System.h / System.cpp：system trade state、StepEconomy。
- source/Trade.h / Trade.cpp：commodity / price range。
- source/FleetCargo.cpp：fleet cargo。
- source/Mission.h / Mission.cpp：mission 数据与生命周期。
- source/MissionAction.h / MissionTimer.h：action / timer。
- Wiki CreatingMissions：条件、来源/目的地过滤、NPC、timer、action trigger。

许可证：

仓库 license.txt 为 GNU GPL v3。

### 本项目规则

默认只做架构参考。

尤其适合独立重写：

- Data-driven Mission；
- World node trade state；
- Fleet / Cargo；
- Condition / Trigger；
- economy step separation。

---

## CODE-OPENTTD: OpenTTD

仓库：

https://github.com/OpenTTD/OpenTTD

重点代码：

- src/economy.cpp
- src/economy_func.h
- src/industry.h
- src/timer/timer_game_economy.cpp
- src/town_cmd.cpp
- src/cargopacket.h

可观察：

- economy 使用独立时间尺度；
- industry / house production-consumption；
- industry closure / spawning；
- town growth；
- waiting cargo / delivery / history；
- payment 与 transit time。

代码文件声明 GNU GPL version 2。

### 本项目规则

默认只读架构，独立实现 economy clock / aggregate logistics 思想；如未来需要复制具体实现，另做许可证兼容判断。
