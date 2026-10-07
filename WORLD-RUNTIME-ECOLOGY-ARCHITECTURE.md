# 世界运行时与生态模拟架构决策

> 状态：设计基线（2026-10-07）
>
> 目标：把 Narraverse-World-Map 从“地图 → 场景 → 战斗 → 成长”的独立 RPG 原型，逐步发展为一个**即使玩家不参与，也能持续运行、产生因果、形成历史的 World Runtime（世界运行时）**。
>
> 本文记录当前讨论形成的架构决策。它不是已经完成的实现，也不代表自动并入 Narraverse 正式平台。

## 1. 核心判断

这个项目下一阶段不应继续优先堆技能、怪物、装备或特效，而应先验证一个更基础的问题：

> **没有玩家、没有 UI、没有 Laya、没有 LLM 时，这个世界能不能自己合理地活 100 个游戏日？**

世界本身负责状态、时间、规则、Actor 与事件；AI 只增强高价值的社会理解和叙事表达。

```text
世界 = 状态 + 时间 + 规则 + Actor + 事件

Laya = 理解复杂的社会/行为信号
LLM  = 表达已经决定的行为与已经发生的世界历史
```

因此应坚持：

- 确定性模拟内核优先，AI 是增强层而不是世界本体。
- NPC 是生态中的 Actor，不是等待玩家输入的站桩聊天对象。
- 生态、经济、聚落、势力、NPC 与战斗结果必须通过同一套世界因果链相互影响。
- 可选 AI/Laya 失败时，世界仍然能够继续运行。
- 第一阶段先验证因果传播，不追求内容规模和视觉完成度。

## 2. 总体分层

```text
┌──────────────────────────────┐
│ 7. 叙事层：LLM               │
│ 对话 / 描述 / 历史叙事        │
├──────────────────────────────┤
│ 6. 认知层：Laya              │
│ 社会判断 / 意图变化 / 状态观察 │
├──────────────────────────────┤
│ 5. Actor 决策层               │
│ Utility AI / Goal / 行为计划   │
├──────────────────────────────┤
│ 4. 世界系统层                  │
│ 生态 / 经济 / 聚落 / 势力      │
├──────────────────────────────┤
│ 3. World Event Engine         │
│ 统一世界变化与因果传播          │
├──────────────────────────────┤
│ 2. World State               │
│ Snapshot / EventLog / Cache   │
├──────────────────────────────┤
│ 1. Simulation Clock          │
│ 世界时间 / Tick / 调度         │
└──────────────────────────────┘
```

现有 `WorldRPG / WorldInv / WorldSkill / Combat / WorldFX / WorldCombatFX` 保留，逐渐成为 World Runtime 的规则与表现子系统，而不是反过来让世界模拟依附页面。

## 3. Simulation Clock：先有世界时间，再有生态

生态模拟不能绑定 60 FPS。建立独立的世界时钟和调度器，例如：

```text
1 simulation tick = 10 游戏分钟
```

但各系统按不同频率运行：

| 系统 | 建议更新频率 |
|---|---:|
| 激活 NPC 移动 | 10 分钟 |
| NPC 基础需求 | 30 分钟 |
| 工作 / 生产 | 1 小时 |
| 商店库存 | 6 小时 |
| 捕食 / 迁徙 | 6 小时 |
| 资源恢复 | 1 天 |
| 市场价格 | 1 天 |
| 聚落人口统计 | 1 天 |
| 势力战略 | 3 天 |
| 季节 | 30 天 |

调度模型应类似：

```text
SimulationScheduler
  ├─ NPCSystem.tick()
  ├─ EcologySystem.tick()
  ├─ EconomySystem.tick()
  ├─ SettlementSystem.tick()
  └─ FactionSystem.tick()
```

不要设计成每 Tick 遍历所有 NPC 并调用 `npc.think()`。

## 4. WorldState：Snapshot、EventLog、RuntimeCache 分离

不要把 `world_state_v1` 无限扩展成超级 JSON。下一代世界状态建议明确拆成三类。

### 4.1 WorldSnapshot

保存“现在世界是什么样”：

```text
WorldSnapshot
  ├─ time
  ├─ regions
  ├─ settlements
  ├─ actors
  ├─ populations
  ├─ resources
  ├─ markets
  └─ factions
```

示意：

```json
{
  "wolf_pack_01": {
    "species": "wolf",
    "region": "north_forest",
    "population": 17,
    "food": 0.32,
    "territoryPressure": 0.71
  }
}
```

### 4.2 EventLog

只记录“发生过什么”，例如：

```text
Day 31 08:20  WolfPackEnteredFarmland
Day 31 10:40  LivestockKilled(count=3)
Day 31 18:00  FoodPriceChanged(+7%)
Day 32        HunterGroupCreated
```

EventLog 是后续世界回放、调试、历史生成、NPC 记忆和因果解释的基础。

### 4.3 RuntimeCache

只保存可重新计算的临时信息：

- 寻路结果
- nearby actors
- utility score
- visibility
- 关系查询缓存

RuntimeCache 不进入正式存档。

## 5. World Event Engine：世界变化的统一入口

核心工程约束：

> **业务系统不要随意跨模块直接修改别人的状态；重要世界变化通过事件/命令进入规则层。**

不推荐：

```js
npc.gold -= 20;
shop.stock.food -= 1;
npc.inventory.food += 1;
```

推荐先产生明确意图/命令，校验成功后形成事实事件：

```text
TradeIntent
  ↓ 规则校验
TradeCompleted
  ├─ EconomySystem
  ├─ InventorySystem
  ├─ RelationshipSystem
  └─ HistorySystem
```

LLM/Laya 永远不能直接修改存档。AI 可以提出意图或社会信号，最终结果必须由确定性规则验证和执行。

## 6. 生态：默认模拟种群，而不是每只动物

动物默认使用 Population Actor：

```text
WolfPack.population = 27
DeerHerd.population = 103
```

第一版只需要可解释、可调参的简化模型：

```text
猎物变化 = 繁殖 - 自然死亡 - 捕食 - 人类捕猎
捕食量   = 捕食者 × 猎物 × 遭遇系数
捕食者变化 = 食物收益影响繁殖 - 死亡
```

目标不是学术级生态准确，而是：

- 稳定；
- 可解释；
- 有反馈；
- 能被玩家行为扰动；
- 不轻易进入无限增长或快速全灭。

## 7. Simulation LOD：聚合 → 实例化 → 精细模拟 → 压缩

这是世界规模化的关键。

### L0：聚合模拟

远离玩家时只维护：

- 区域人口
- 种群数量
- 资源库存
- 财富
- 安全度
- 供需等统计值

### L1：Actor 模拟

玩家附近或具有世界重要性的实体实例化为：

- 猎人
- 商队
- 狼群狩猎队
- 重要 NPC
- 关键事件参与者

使用规则、Goal 与 Utility AI 决策。

### L2：精细/叙事模拟

玩家正在接触的 Actor 才进入最高精度：

- 精细状态
- 社会判断
- Laya
- LLM 对话/叙事
- 场景与战斗表现

典型流程：

```text
WolfPack(population=24)       # L0
        ↓ materialize
HuntingParty                  # L1
        ↓ encounter
4 个具体敌人                  # L2
        ↓ 战斗：死亡3，逃跑1
WolfPack(population -= 3)     # collapse 回 L0
```

即：

> **Aggregate → Materialize → Simulate → Collapse**

## 8. NPC：聚合人口与永久 Actor 并存

不能为 50,000 世界人口创建 50,000 个永久精细 NPC。

### Population Actor

普通人口按群体存在：

```text
农民 63
矿工 17
流民 8
```

### Persistent Actor

重要人物拥有永久 ID 和身份连续性：

- 玩家认识的人
- 重要职业人物
- 重大事件参与者
- 建立重要关系的人

普通人口在需要时 `materialize()` 成具体 NPC；一旦与玩家形成重要关系或参与重大事件，可以“晋升”为 Persistent Actor。

## 9. NPC Model

Persistent NPC 第一版建议包含：

```text
Actor
  ├─ identity
  ├─ location
  ├─ physicalState
  ├─ needs
  ├─ personality
  ├─ occupation
  ├─ inventory / wealth
  ├─ relationships
  ├─ memories
  ├─ currentGoal
  └─ simulationLevel
```

基础需求可从少量维度开始：

- health
- hunger
- fatigue
- wealth
- safety

社会/心理维度再逐步增加：

- fear
- trust
- hostility
- stress
- debt
- affection / interest（有实际玩法需求时再加）

不要第一版就做几十个心理参数。

## 10. NPC 决策：Utility AI + Goal

本项目优先使用 Utility AI，而不是让 LLM 决定日常行为。

例如 NPC 当前状态：

```text
饥饿       0.72
疲劳       0.41
恐惧       0.81
缺钱       0.55
家人生病   0.90
```

候选行为计算效用：

```text
eat       0.72
sleep     0.41
work      0.55
buyDrug   0.86
flee      0.74
```

选择 `buyDrug` 后，如果资金不足，不是直接失败，而是形成上层 Goal：

```text
获得药
  ↓ 缺钱
获得钱
  ├─ 工作
  ├─ 出售物品
  ├─ 借钱
  └─ 偷窃
```

人格、关系、风险偏好用于影响候选方案评分。

### Goal 稳定性

NPC 不应每 10 分钟重新选择人生目标。

```text
Think
  ↓
Commit Goal
  ↓
Execute
  ↓
仅在以下情况重新评估：
- 目标完成
- 目标失败
- 重大事件
- 关键需求越过阈值
```

否则会出现 NPC 每个 Tick 反复改变方向的抖动。

## 11. NPC Memory：不要永久保存完整聊天记录

建议三层：

### 短期记忆

几十条近期事实，例如：

- 玩家威胁了我
- 看见狼群
- 商店没有药

### 情景记忆

只保存高影响事件：

```text
player_saved_my_family
day = 72
emotionalImpact = 0.92
```

### 长期语义关系

把旧事件压缩为关系状态：

```text
player:
  trust = 0.81
  fear = 0.12
  debt = 0.65
```

演化方向：

```text
具体记忆 → 摘要/重要记忆 → 关系变化
```

避免把完整历史永久塞进模型上下文。

## 12. Laya 的职责边界

Laya 不接管基础 Utility AI。

以下行为由确定性系统完成：

- 饿了找食物
- 困了休息
- 缺钱工作
- 遇到明确危险逃跑
- 正常生产、交易、移动

Laya 更适合处理：

- 玩家是在威胁、讨好还是试探？
- 多个矛盾社会信号如何综合？
- NPC 的信任、恐惧、兴趣应怎样变化？
- 当前社会态度更接近接近、回避、对抗、合作还是欺骗？

建议接口：

```text
WorldState
+ RecentEvents
+ PlayerAction
        ↓
      Laya
        ↓
SocialSignal
  trust_shift
  threat
  interest
  hostility_shift
        ↓
Utility AI / Goal
        ↓
实际行为
```

Laya 是**状态解释器/社会判断器**，不是世界规则裁判。

## 13. LLM 的职责边界

世界系统先决定行为，LLM 再负责表达。

例如世界已确定：

```text
NPC_ACTION = ACCEPT_HELP
```

LLM 得到 NPC 身份、当前处境、关系和行为结果后生成自然语言。

同样，世界历史由 EventLog 真实产生，LLM 可以把：

```text
Day 17 鹿群减少
Day 31 狼群进入农田
Day 39 村长组织猎狼
Day 41 猎人受伤
Day 43 药材短缺
```

整理成可读的“青石村纪事”，但**不能反过来由叙事文本创造事实状态**。

原则：

> LLM 讲述历史，不创造未经规则系统确认的历史。

## 14. 经济、生态与 NPC 必须真正互相传导

第一阶段希望验证的典型因果链：

```text
鹿群减少
  ↓
狼群食物不足
  ↓
狼群迁移到农田
  ↓
牲畜死亡
  ↓
村庄食物下降
  ↓
猎人增加猎狼行为
  ↓
猎人受伤
  ↓
药品需求增加
  ↓
药价上涨
  ↓
贫穷 NPC 买不起药
  ↓
借钱 / 工作 / 求助 / 偷窃
  ↓
玩家未来可以介入
```

这整条链在没有 LLM 的情况下也必须成立。

经济第一版按库存和供需聚合：

```text
Village:
  grain = 842
  medicine = 72
  wood = 530
  iron = 91
```

价格可以从简单公式开始：

```text
price = basePrice × scarcity × demand × danger
```

关系折扣属于交易层，不必污染基础市场价格。

## 15. 离线/时间跳跃

玩家离开很久后，不补算所有 NPC 的每个细 Tick。

```text
offlineDuration
  ↓
L0 coarse simulation
  ↓
玩家回来
  ↓
materialize nearby L1/L2
```

离线时主要推进：

- 种群
- 资源
- 聚落
- 市场
- 势力
- 重大事件概率/调度

重要 Persistent Actor 可按“目标结果/时间预算”做粗粒度结算，而不是逐步寻路。

## 16. 第一阶段不要急着上 ECS

长期可能适合 ECS，但当前 Actor、生态、势力和经济的数据边界还没有稳定。

第一版继续纯 JS，建议目标目录：

```text
/core
  simulation-clock.js
  world-state.js
  event-bus.js

/systems
  ecology-system.js
  economy-system.js
  npc-system.js
  settlement-system.js
  faction-system.js

/actors
  actor-model.js
  npc-model.js
  population-model.js

/ai
  utility-ai.js
  goal-planner.js
  laya-adapter.js

/persistence
  snapshot-store.js
  event-store.js

/tests
  simulation/
```

等模拟模型稳定后，再评估 ECS、数据库或 Worker 化，不为了架构“先进”提前引入复杂度。

## 17. 第一阶段最小实验世界

进一步压缩范围，不先做 10 个精细 NPC。

```text
1 个村庄

聚合人口：
- 约 80 人

实名 Persistent NPC：
- 村长
- 猎人
- 商人

生态：
- 鹿群
- 狼群

资源：
- 粮食
- 药材

经济：
- 粮价
- 药价

外部系统：
- 商队

玩家：
- 不存在
```

第一阶段是在验证“因果传播”，不是验证内容量。

## 18. 第一份实现：simulation-runner

不要先改地图 UI。第一份实现建议是纯 Node runner：

```text
node simulation-runner.mjs --days 100 --seed 42
```

输出：

```text
Day 1
Population  80
Deer        120
Wolf        14
Food        900
Medicine    80

Day 47
EVENT: WolvesEnteredFarmland

Day 49
EVENT: HunterInjured

Day 51
EVENT: MedicinePriceChanged(+31%)

Day 63
EVENT: MerchantImportedMedicine
```

并导出便于分析的结果：

```text
population.csv
ecology.csv
economy.csv
events.csv
```

建议模拟必须支持固定 seed，保证 bug 可复现。

## 19. 第一阶段验收标准

至少进行：

- 100 天快速回归；
- 500 天平衡观察；
- 1000 天压力/崩溃测试；
- 多 seed 重复模拟。

重点检查：

1. 鹿/狼是否存在合理反馈，而不是无限增长或快速灭绝。
2. 食物不足是否会改变狼群行为和区域压力。
3. 猎人是否会因危险、收益、自身状态改变行为。
4. 资源变化是否能传导到库存、供需、价格与贸易。
5. NPC 是否因经济、生存和社会状态改变目标。
6. 重大事件是否持久化并影响后续世界。
7. 是否存在单一变量指数爆炸、负库存、重复死亡、幽灵 Actor 等不变量破坏。
8. 同 seed 是否能复现同一结果。
9. Laya/LLM 完全关闭时模拟是否仍成立。

成功标准不是“世界永远稳定”，而是：

> **系统能产生可解释的动态平衡、局部危机和恢复过程，并且这些变化来自规则和历史，而不是脚本硬写结局。**

## 20. 开发优先级

### P0：模拟底座

1. SimulationClock / Scheduler
2. WorldSnapshot V2 数据合同
3. EventLog / World Event Engine
4. 确定性随机数与 seed
5. simulation-runner
6. 不变量检查与模拟统计

### P0：最小生态

7. Population Model
8. EcologySystem（鹿/狼）
9. ResourceSystem（粮食/药材）
10. EconomySystem（库存/供需/价格）
11. Settlement 最小状态

### P1：Actor

12. Persistent NPC Model
13. Needs
14. Utility AI
15. Goal / Goal 稳定性
16. Population → Persistent Actor materialize
17. L0/L1/L2 与 collapse

### P1：社会

18. Relationship
19. Memory
20. Rumor / Information
21. 商队与区域传播
22. Faction（生态闭环稳定后再开）

### P2：智能与叙事

23. Laya SocialSignal Adapter
24. Laya fallback
25. LLM 对话表达
26. EventLog → 世界历史叙事
27. 动态机会/委托 UI

### P3：接回现有玩法

28. 地图读取 World Runtime
29. 场景 materialize Actor
30. 战斗结果写回世界事件
31. 商店读取真实市场状态
32. 时间/休整/旅行推进 SimulationClock
33. Narraverse 平台适配层

## 21. 暂缓

在 100 天无玩家模拟闭环稳定前，暂缓：

- 大量新技能
- 大量新怪物
- 大量装备
- Boss 内容
- 大规模地图美术
- 复杂天气表现
- 大量 LLM NPC
- 大规模世界生成
- ECS 重构
- 正式 Narraverse 平台迁移

## 22. 最终方向

如果这套架构成立，Narraverse-World-Map 的长期定位不再只是“世界地图页面”，而是：

> **Narraverse World Runtime / 世界模拟底座**

地图、场景、战斗、文字聊天都只是这个世界的不同客户端/观察窗口。

玩家进入的也不再是一张等待触发的地图，而是一个：

> **在玩家出现以前已经运行，在玩家离开以后仍会继续变化，并且会记住玩家造成后果的世界。**
