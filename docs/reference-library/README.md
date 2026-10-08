# Game AI / Character Mind 参考库

更新时间：2026-10-08

## 目的

本目录用于保存与 Narraverse-World-Map 的 World Runtime、Character Mind Runtime、Director、NPC 行为、后台生活和认知 LOD 有关的外部游戏设计参考。

它不是“照抄其他游戏”的资料夹，而是一个**按功能查找成熟模式**的工程参考库。

以后设计新模块、写任务书、做架构评审时，先从本目录按功能定位参考，再决定：

1. 哪个成熟系统解决过类似问题。
2. 它采用了什么结构，而不是只看表面功能。
3. 哪些设计适合 Narraverse，哪些不适合。
4. 是否值得工程化，还是应该交给 LLM / Provider 按需处理。
5. 如果涉及代码级借鉴，许可证是否允许。

## 使用入口

- [MODULE-INDEX.md](MODULE-INDEX.md)：按“我要做什么功能”查参考。
- [GAME-CATALOG.md](GAME-CATALOG.md)：按游戏看 Character Mind / Agent 可借鉴机制。
- [WORLD-MAP-INDEX.md](WORLD-MAP-INDEX.md)：按世界地图 / 沙盒功能查参考。
- [WORLD-MAP-CHECKLIST.md](WORLD-MAP-CHECKLIST.md)：世界地图参考的轻量清单索引，标明近期、候选与暂缓。
- [SANDBOX-WORLD-CATALOG.md](SANDBOX-WORLD-CATALOG.md)：按沙盒游戏看 world-map / campaign-layer 机制。
- [CODE-REFERENCE.md](CODE-REFERENCE.md)：公开代码、Mod 接口、许可证和可读文件。
- [ADOPTION-PROTOCOL.md](ADOPTION-PROTOCOL.md)：以后写任务书或实现前怎样使用本参考库。
- [PATTERN-DECISIONS.md](PATTERN-DECISIONS.md)：已经吸收进 Narraverse 的设计模式与暂不采用项。

## 参考优先级

### A. 一手或接近一手设计资料

开发者文章、官方 Mod 文档、官方/项目文档、公开源码。

优先用于确认机制和实现边界。

### B. 高质量社区技术资料

Wiki、Modding Reference、经过代码核对的社区文档。

适合补充结构、术语和实例，但实现关键点仍尽量回到源码或一手资料核对。

### C. 专有游戏 / 反编译资料

只用于理解架构和接口思想。

**默认禁止把反编译或专有源码复制、改写后直接放进本仓库。**

## 代码复用默认规则

- 默认做法：**借设计模式，独立实现。**
- 开源不等于可以无条件复制。
- 真正复制或改造任何外部代码前，必须重新检查：
  - 仓库与具体文件许可证；
  - 当前 commit；
  - 是否存在额外版权声明；
  - 与 Narraverse 当前许可/分发方式是否兼容。
- 强 copyleft、ShareAlike、NonCommercial、NoDerivatives 等许可证默认只做架构参考，除非专门完成兼容性判断。
- 不把“公开可见”误当成“可复制”。

## 当前参考主题

当前参考分成两条主线：Character Mind / Agent，以及 Sandbox World / World Map。第一批主题包括：

- Needs / Motives
- Thought / Mood / Stress
- Urgent 与 Normal 双通道
- Behavior Provider / JobGiver
- Affordance / 物体提供行为
- Goal Commitment / Replan
- Values / Personality / Aspiration
- Cognitive LOD / Online-Offline Simulation
- Daily Routine / Background Life
- Director Event Casting
- Relationship-driven Event
- Open-source NPC AI
- Mobile Party / Fleet / Caravan
- Settlement Runtime
- Route / Travel Risk
- Dynamic Trade / Supply Chain
- Faction World State / Territory
- World State Override
- Dynamic Contract / Mission
- Intel / Fog / Rumor
- Environment Field
- World Context Packet
- Procedural History Footprints

后续遇到新模块时继续扩充，不要求一次把所有游戏 AI 或沙盒世界理论做全。
