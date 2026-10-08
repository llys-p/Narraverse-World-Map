# 按功能查参考

本文件是未来任务设计的第一入口。

| Narraverse 功能 | 首选参考 | 次选参考 | 主要借什么 | 预期阶段 |
|---|---|---|---|---|
| Needs / 生理与心理需求 | RimWorld, Dwarf Fortress | The Sims, ONI | 连续需求、个体化 Need、需求不必人人相同 | M2 |
| 动机排序 / Utility | The Sims | RimWorld, CDDA | Motive + Affordance + Utility，不扫描所有行为 | M2 |
| 行为候选如何出现 | The Sims, RimWorld | CDDA | Affordance、JobGiver、Behavior Provider | M2 |
| 紧急行为打断 | RimWorld, ONI | Veloren | Urgent / Normal 分流、Interrupt | M2 |
| Goal 不抖动 | ONI, CDDA | RimWorld | Busy actor 继续当前任务、committed goal | M2 |
| Plan / Replan | CDDA | Veloren, RimWorld | Goal commitment、blocked/deferred、局部换方案 | M2 |
| Thought / Mood / Stress | RimWorld | Dwarf Fortress, CK3 | 短期经历与长期状态分开，情绪不直接等于动作 | M2 |
| Values / Personality | Dwarf Fortress | CK3, Wildermyth | 人格与价值观影响 Needs、反应和长期目标 | M2/M3 |
| Aspiration / 人生理想 | Dwarf Fortress | Wildermyth | 长期愿景不直接等于即时行动 | M2 |
| Relationship / Person Model | Wildermyth | Dwarf Fortress | 关系作为人物与事件选择的重要输入 | M2/M3 |
| Subjective information | Shadows of Doubt | S.T.A.L.K.E.R. A-Life | 有限知情、记忆、可疑线索、局部可见性 | M1/M2 |
| Daily Routine | Shadows of Doubt | ONI | 默认生活轨道 + 异常事件偏离 | M3 |
| Cognitive LOD | Veloren rtsim | S.T.A.L.K.E.R., Shadows of Doubt | 高层低分辨率后台模拟，接近时提高精度 | M3 |
| Online / Offline NPC | S.T.A.L.K.E.R. | Veloren | 远端只保存高层行为与目的地，近端详细模拟 | M3 |
| Director 选角色制造事件 | Wildermyth | CK3 | Event casting，按人格/关系/Hook 选择适合角色 | Director |
| 大规模世界故事涌现 | Dwarf Fortress, Veloren | Wildermyth | 世界事实 + 人物差异 + 事件选择，而非单一剧情脚本 | M3/Director |
| 可读开源 NPC AI | Cataclysm:DDA | Veloren | Goal commitment、need executor、测试方式 | M2 |
| 可读开源大世界 NPC | Veloren | Cataclysm:DDA | rtsim、Action abstraction、simulated tick skip | M3 |

## M2 建议优先翻阅

1. RimWorld
2. The Sims
3. Dwarf Fortress
4. Oxygen Not Included
5. Cataclysm:DDA

M2 的核心问题是：

- 为什么某个行为会成为候选？
- 为什么此刻它比别的候选更重要？
- 什么情况允许打断已有 Goal？
- 怎样让 NPC 有需求差异而不是共用一个模板？
- 怎样避免每次收到信息都重新规划人生？

## M3 建议优先翻阅

1. Veloren rtsim
2. Shadows of Doubt
3. S.T.A.L.K.E.R. A-Life

M3 的核心问题是：

- 远端重要人物怎样继续“活着”？
- 如何降低更新频率但保持连续性？
- 如何从低精度状态重水化到 Focus Character？
- 怎样让数百 NPC 不需要逐 tick 完整思考？

## Director 建议优先翻阅

1. Wildermyth
2. Crusader Kings III
3. Dwarf Fortress

重点不是让 Director 决定人物行为，而是：

- 根据人物条件选择适合被卷入事件的人；
- 制造压力、机会、冲突、秘密；
- 把人物的最终反应留给 Character Mind。


## World Map / Sandbox 建议优先翻阅

入口：[WORLD-MAP-INDEX.md](WORLD-MAP-INDEX.md)。

核心参考：

1. Mount & Blade II: Bannerlord：Campaign Map / MobileParty / Settlement / Battle transition。
2. Kenshi：World States / Town Override / faction presence。
3. X4 Foundations：dynamic universe / economy / faction expansion。
4. Starsector：route risk / visibility / intel / convoy / shortage。
5. Battle Brothers：procedural map / settlement / contract / caravan。
6. Endless Sky：开源 mission / fleet / trade / system。
7. OpenTTD：开源 economy clock / cargo / industry / town。
8. Factorio：regional field / diffusion / threshold response。
9. Caves of Qud：history footprints / factions / secrets。

世界地图线的核心问题是：

- 什么东西应该成为持久世界实体，而不是临时 UI 图标？
- 地图移动实体如何有 Goal、Cargo、Supply、Target 与 Faction？
- 聚落、道路、贸易和战争怎样互相影响？
- 世界事件如何自然产生任务、新闻和遭遇？
- 地图进入场景/战斗后，结果怎样结构化写回唯一 World Runtime？
