# Narraverse Pattern Decisions / 候选模式

这里记录“参考已经如何影响我们的设计”。

状态：

- ADOPTED-DESIGN：已进入设计原则，但未必已有代码。
- IMPLEMENTED：已有代码并通过对应验收。
- CANDIDATE：值得研究，尚未冻结。
- REJECTED：明确不采用原形式。

---

## PAT-001 Need is input, not command

状态：ADOPTED-DESIGN

参考：RimWorld / Dwarf Fortress / The Sims。

决定：

Need 是动机输入，不直接写成：

```text
Hunger > 80 -> Eat
```

应经过可知性、行为可用性、Goal、人格/价值观及世界约束。

---

## PAT-002 Urgent / Normal 双通道

状态：CANDIDATE for M2

参考：RimWorld / Oxygen Not Included。

目的：

避免角色每收到一条新信息就重做全部决策，同时允许火灾、攻击、濒死、家人危险等真正紧急事件打断当前计划。

---

## PAT-003 Behavior Provider / Affordance

状态：CANDIDATE for M2

参考：The Sims / RimWorld JobGiver。

决定方向：

不是让 NPC 枚举整个行为宇宙。

由对象、地点、人物和角色能力暴露有限行为候选：

```text
World affordances
      ↓
Behavior Providers
      ↓
Candidate Intents
```

复杂、低频的新策略可由 LLM Provider 提议，再经规则过滤。

---

## PAT-004 Goal Commitment / Anti Flip-Flop

状态：ADOPTED-DESIGN，M1 已有窄 Goal 连续性，M2 待扩展。

参考：Cataclysm:DDA / Oxygen Not Included。

目标：

已有 Goal 不因轻微信息变化每 tick 切换。

允许：

- complete；
- failed；
- deadline；
- blocked；
- major event；
- true emergency；
- higher-priority obligation；

触发重新规划。

---

## PAT-005 Personalized Needs

状态：CANDIDATE for M2

参考：Dwarf Fortress。

方向：

人物的 Values / Personality / Background 可以决定：

- 哪些 Need 存在；
- Need 权重；
- Need 多久不满足才明显影响行为。

避免所有人物共用同一套“心理仪表盘”。

---

## PAT-006 Routine + Event Wakeup

状态：CANDIDATE for M3

参考：Shadows of Doubt。

方向：

普通生活沿低成本 Routine 推进。

只有相关世界事件、内部阈值、Goal deadline 等触发 Character Mind 深度唤醒。

---

## PAT-007 Importance x Relevance Cognitive LOD

状态：ADOPTED-DESIGN，M3 待实现。

参考：Veloren rtsim / S.T.A.L.K.E.R. A-Life / Shadows of Doubt。

决定：

认知深度不只看物理距离。

```text
Character Importance
×
Current Relevance / Proximity
```

决定更新频率和推理深度。

重要人物远在外地仍保留身份、长期 Goal、关键关系和历史，只降低运行频率。

---

## PAT-008 Director Event Casting

状态：ADOPTED-DESIGN，Director 待实现。

参考：Wildermyth。

决定：

Director 选择“适合被卷入某处境的人”，不直接规定人物最终行动。

```text
Situation requirement
↓
match personality / relation / role / pressure
↓
cast actors
↓
create event
↓
Character Mind responds
```

---

## PAT-009 World Fact != Subjective State

状态：IMPLEMENTED in M1 concept/runtime line。

外部辅助参考：Shadows of Doubt 等。

Narraverse 自己的硬边界：

- Canonical Fact 不因人物误解被修改；
- Belief 可错误；
- 后来的证据可纠正当前判断；
- 但不能改写“当时为什么做出决定”的冻结依据。

这是后续所有参考模式必须服从的本项目原则。

---

## PAT-010 Low-value psychology -> Provider

状态：ADOPTED-DESIGN。

决定：

不为每一种罕见心理现象做高成本确定性模块。

如果某现象：

- 低频；
- 难验证；
- 规则复用价值低；
- 不直接修改世界；

优先让 LLM / Model Provider 根据受限 Character Context 生成解释或候选策略。

高频、关键、需要重放和资产一致性的部分仍工程化。


---

## PAT-011 Campaign Map as Orchestrator

状态：CANDIDATE for World Map。

参考：Mount & Blade II: Bannerlord。

方向：

世界地图不是单独小游戏，而是 settlement、travel、trade、diplomacy、encounter、scene、battle 的编排层。

地图只负责高层 state / intent；进入具体场景后由对应子系统执行，结果结构化写回 World Runtime。

---

## PAT-012 Mobile Party as Persistent World Actor

状态：CANDIDATE。

参考：Bannerlord / Kenshi / Starsector。

方向：

Caravan、Patrol、Army、Bandit、Refugees、Messenger 等共享一个高层 Party contract，而不是每类各写一套地图移动逻辑。

---

## PAT-013 Physicalized Important Logistics

状态：CANDIDATE。

参考：X4 / Battle Brothers / Endless Sky。

方向：

宏观经济继续允许 aggregate，但对真正影响玩法的重要物流批次实体化成 caravan / convoy。

这样护送、劫掠、延误、道路风险和短缺可以连接成同一因果链。

---

## PAT-014 World State Override

状态：CANDIDATE。

参考：Kenshi。

方向：

关键人物、战役和 faction state 可以切换 settlement owner、patrol / spawn、service、law 等世界状态。

避免“剧情说城市沦陷了，但地图和系统没变”。

---

## PAT-015 World Problem -> Contract

状态：CANDIDATE。

参考：Battle Brothers / Endless Sky。

方向：

先产生真实世界问题，再派生任务。

~~~text
shortage / threat / missing caravan / monster pressure
→ opportunity or contract
→ player intervention
→ canonical world consequence
~~~

---

## PAT-016 Intel != World Truth

状态：ADOPTED-DESIGN，地图侧待实现。

参考：Starsector / Caves of Qud；与 PAT-009 同源。

方向：

Player Map 也不应默认全知。

地点、敌军、商路风险、资源短缺等信息可以有 source、age、confidence / certainty 与 lastObservedTick。

---

## PAT-017 Regional Field

状态：CANDIDATE。

参考：Factorio pollution。

方向：

对适合空间扩散的宏观压力使用低成本 field，而不是给每个 NPC 分别跑逻辑。

可用于 plague、monster pressure、war pressure、corruption、weather severity 等。

---

## PAT-018 World Context Packet

状态：ADOPTED-DESIGN，D3/D4 候选落点。

参考：Bannerlord 的 campaign → scene / battle 层次；Narraverse 自身 World Runtime 边界。

决定：

地图进入场景/战斗时传结构化 Context；退出时只返回 Outcome，由 World Runtime 验证并提交。

Scene / Battle 不成为第二世界权威。
