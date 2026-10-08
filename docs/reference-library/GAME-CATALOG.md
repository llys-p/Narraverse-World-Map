# 游戏设计参考目录

> 这里记录的是“可以借的结构”，不是对游戏完整 AI 的复刻说明。

## REF-RW: RimWorld

### 可参考

- Needs 作为持续变化的角色状态。
- Thought / Mood 分离：近期经历影响情绪，但情绪不是动作开关。
- ThinkTree 将常规思考与紧急打断拆开。
- JobGiver 负责判断某类工作是否适用并产生 Job。
- 行为执行与“为什么选择这个行为”分离。

### 对 Narraverse 的映射

```text
Need
+ Thought/Appraisal
+ Current Goal
      ↓
Urgent Gate / Normal Decision
      ↓
Behavior Provider
      ↓
Committed Intent
      ↓
World Command
```

### 不直接照搬

- 不使用原版反编译源码作为实现来源。
- 不把 Mental Break 复制成随机“发疯表”。
- 不把 Thought 简化成固定“事件 = 情绪 +N”的唯一心理模型。

### 参考

- RimWorld modding reference, AI / ThinkTree:
  https://github.com/Dev-Jahn/rimworld-modding-reference/blob/main/03-gameplay-systems/ai-behavior.md
- Needs:
  https://github.com/Dev-Jahn/rimworld-modding-reference/blob/main/03-gameplay-systems/needs-system.md
- Job system:
  https://github.com/Dev-Jahn/rimworld-modding-reference/blob/main/03-gameplay-systems/job-system.md

---

## REF-SIMS: The Sims

### 可参考

最重要的是 Affordance / Utility 思想。

角色不需要扫描世界上所有“可能动作”。对象、地点和人物自己暴露可用交互及其满足的 Motive。

```text
NPC Needs
   ×
Object Affordances
   ×
Personality / Preference
   ×
Context / Cost
   ↓
Utility
```

例：

```text
药店 -> BuyMedicine / AskDoctor
酒馆 -> Eat / Drink / Socialize / GatherRumor
卫兵 -> AskHelp / ReportCrime / Bribe
敌人 -> Attack / Flee / Negotiate
```

### 对 Narraverse 的价值

把“行为库”升级为 Behavior Provider / Affordance Provider。

这能避免一个角色每次思考都枚举几十上百个行为。

### 参考

- Game Developer Magazine / GDC Archive, Utility AI and The Sims related design material:
  https://media.gdcvault.com/GD_Mag_Archives/GDM_August_2012.pdf

---

## REF-DF: Dwarf Fortress

### 可参考

- Needs 不只来自生理，也受 personality facets 与 values 影响。
- 不同人物可能根本不存在同一种心理需求，或权重差异很大。
- Values 和 Personality 可以冲突。
- Dreams / life goals 适合作为长期 Aspiration。
- 未满足需求更适合影响长期 Focus，而不是马上强制动作。

### Narraverse 可吸收

```text
Core Personality
+ Values
+ Background
      ↓
Need Profile
      ↓
Motivation
```

Need 不再是“所有 NPC 统一的一套马斯洛条”。

### 参考

- Needs:
  https://dwarffortresswiki.org/index.php/Need
- Personality values:
  https://dwarffortresswiki.org/index.php/Personality_value
- Dreams / goals:
  https://dwarffortresswiki.org/index.php/Dream

---

## REF-ONI: Oxygen Not Included

### 可参考

- Errand 有优先级，但忙碌的 Duplicant 通常会先完成当前 Errand。
- 不是每出现一个更高分任务就立即跳转。
- Schedule 为不同时间段施加行为框架。
- Stress / Stress Response 可以覆盖普通行为。

### Narraverse 可吸收

- Goal Commitment / Action Inertia。
- Urgent / Normal 双通道。
- Routine / Schedule 与自主 Need 并存。

```text
Emergency
> Committed Goal
> Need-driven
> Role/Duty
> Opportunity
> Fluff
```

注意：这是概念顺序，不是冻结的全局硬优先级表。

### 参考

- Errand:
  https://oxygennotincluded.wiki.gg/wiki/Errand

---

## REF-SOD: Shadows of Doubt

### 可参考

核心不是“每个市民一直实时推理”，而是：

- 大量市民有日常工作、地点、吃喝和生活路径。
- 生活可以沿默认 routine 运行。
- 新版 AI 又叠加 goal/stat 驱动的临时行为。
- 可疑声音、异常目击等事件能够让市民偏离原计划。
- 市民记忆对侦探玩法是可查询证据的一部分。

### Narraverse 可吸收

```text
Default Routine
      ↓
Low-cost background life
      ↓
Important Event
      ↓
Wake Character Mind
      ↓
Temporary deviation / Replan
```

适合 M3 的后台生活与低频唤醒。

### 参考

- Simulating a City:
  https://colepowered.com/shadows-of-doubt-devblog-8-simulating-a-city/
- Moving in the Citizens:
  https://colepowered.com/shadows-of-doubt-devblog-15-moving-in-the-citizens/
- Gameplay / witness memory:
  https://colepowered.com/shadows-of-doubt-devblog-10-gameplay-loop/

---

## REF-STALKER: S.T.A.L.K.E.R. A-Life / Smart Terrain

### 可参考

- Online / Offline simulation。
- 远处 NPC / squad 使用高层世界逻辑。
- Smart Terrain 提供地点、容量、Job 与高层任务。
- 接近玩家后再交给更细粒度 AI / GOAP / scheme。
- 世界事件可改变 squad 目标。

### Narraverse 可吸收

非常适合 M3 的：

- Simulation Proximity；
- Cognitive LOD；
- 高层目的地 / 任务与近端详细行动分离。

### 参考

- Smart Terrain technical guide:
  https://github.com/robE127/stalker-anomaly-modding-guide/blob/main/docs/systems/smart-terrains.md
- AlifePlus architecture / event-driven extension:
  https://github.com/damiansirbu-stalker/AlifePlus

社区 Mod 资料用于理解架构，关键实现不要默认视为原版一手规格。

---

## REF-WM: Wildermyth

### 可参考

最值得借的是“Event Casting”。

事件像剧本，需要适合的角色：

```text
Event requires:
leader
hothead
friend/rival/lover
specific hook
      ↓
Director searches Character State
      ↓
cast suitable actors
      ↓
create situation
      ↓
actors respond
```

人物的 personality、relationship、history hook 会影响谁适合进入某事件。

### Narraverse 可吸收

这正适合 Director：

- Director 不规定“NPC 必须背叛”。
- Director 找到一个存在忠诚与利益冲突的人。
- Director 制造交易、威胁、秘密或相遇。
- Character Mind 自己决定如何回应。

### 参考

- Developer interview:
  https://turnbasedlovers.com/10-turns-interview/with-wildermyth-developer/
- Story inputs / targets:
  https://wildermyth.com/wiki/Story_Inputs_and_Outputs
- Event targeting:
  https://wildermyth.com/wiki/Event_Types

---

## REF-CDDA: Cataclysm: Dark Days Ahead

### 可参考

这是目前参考库中最值得直接阅读 NPC AI 实现的开源项目之一。

现有代码能看到：

- committed_goal；
- goal flip-flopping 防护；
- combat / investigate / needs / duty / idle 等行为类别；
- NPC AI 专门测试。

### Narraverse 可吸收

尤其适合 M2：

- Committed Goal；
- Goal 被更高优先级目标覆盖；
- need executor 的状态；
- blocked / deferred / holding / impossible 等规划反馈；
- AI 行为回归测试。

### 参考

- NPC main behavior:
  https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/npcmove.cpp
- NPC state:
  https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/npc.h
- NPC tests:
  https://github.com/CleverRaven/Cataclysm-DDA/blob/master/tests/npc_test.cpp

许可证见 CODE-REFERENCE.md。默认借架构，不直接复制实现。

---

## REF-VEL: Veloren rtsim

### 可参考

Veloren 的 rtsim 是高层、低分辨率世界模拟。

它明确用于：

- 未加载区域；
- 大量 NPC；
- 长时行为；
- faction / conflict / population / migration / economy / wildlife；
- NPC high-level action。

NPC AI 的 Action abstraction 用于表示长时间行为，介于 coroutine 与传统 decision tree 之间。

Simulated NPC 还可以降低 AI 执行频率，而 loaded NPC 更高频运行。

### Narraverse 可吸收

几乎就是 M3 的关键参考：

```text
Low-resolution World Actor
        ↓
long-running Action
        ↓
loaded / relevant?
    ↙          ↘
  no            yes
slow tick     detailed actor
```

### 参考

- rtsim overview:
  https://docs.veloren.net/veloren_rtsim/
- NPC AI:
  https://docs.veloren.net/veloren_rtsim/rule/npc_ai/index.html
- source:
  https://github.com/veloren/veloren/tree/master/rtsim

---

## REF-CK3: Crusader Kings III

### 当前定位

二级参考，后续如果正式做 Role / Obligation / Stress / Moral Debt 再深入调查。

当前只借以下设计问题：

- 人格与角色处境冲突时，是否留下长期心理代价；
- 违反自身性格倾向是否产生 Stress；
- coping / relief 是否形成后续行为差异。

目前不把 CK3 的具体公式或阈值写进 Narraverse。
