# World Map / Sandbox Reference Checklist

更新时间：2026-10-08。

这张表是世界地图参考线的轻量索引。

原则：

- **参考库 ≠ 开发清单。**
- 先保留成熟游戏的可借模式，等真正出现对应需求时再深入。
- 不因为某个系统“很酷”就提前实现。
- 每次只挑当前任务直接需要的 1 个主参考 + 最多 2 个辅助参考。
- 仍遵守复杂度预算：高频、关键、可验证、需要重放的才优先工程化；低频复杂内容后续可交给 LLM / Provider。

## 一、当前最值得保留的参考

| 模块 / 问题 | 首选参考 | 主要看什么 | 当前态度 | 可能落点 |
|---|---|---|---|---|
| 地图作为总入口 | Bannerlord | Campaign Map 串联聚落、贸易、遭遇、战斗 | 保留参考 | D3/D4 |
| 地图移动实体 | Bannerlord / Kenshi | Mobile Party / squad / caravan | 保留参考 | 后续 World Map |
| 聚落状态 | Bannerlord / X4 | 聚落不只是图标，而有库存、服务、阵营等状态 | 保留参考 | 后续 World Runtime |
| 路线与旅行 | Starsector / Bannerlord | 距离、风险、可见性、追逐、补给 | 保留参考 | D4 之后 |
| 世界问题生成任务 | Battle Brothers / Endless Sky | shortage / threat / missing caravan → contract | 保留参考 | 后续任务系统 |
| 城市/派系状态变化 | Kenshi | World State / Town Override | 保留参考 | 中期 |
| 经济与物流 | X4 / Endless Sky / OpenTTD | 生产、运输、短缺、价格反馈 | 保留参考 | 中期 |
| 情报 / 地图不全知 | Starsector / Caves of Qud | intel、rumor、stale information | 保留参考 | M3 / World Map |
| 远端世界低成本运行 | Veloren / S.T.A.L.K.E.R. | coarse simulation / online-offline | 已有方向 | M3 |
| 区域压力场 | Factorio | diffusion / decay / threshold reaction | 候选 | 后期 |
| 历史留下实体痕迹 | Caves of Qud | ruin / relic / claim / secret | 候选 | 后期 |

## 二、近期优先级

这不是开发排期，只表示“如果马上需要设计，优先从这里查”。

| 优先级 | 参考主题 | 为什么值得先看 | 是否现在开工 |
|---|---|---|---|
| P1 | World Context Packet | 直接关系地图 → 场景 → 战斗 → 世界写回 | 否，等 D3/D4 任务触发 |
| P1 | Mobile Party 基础抽象 | 后续商队、巡逻、敌群都可复用 | 否，先留设计参考 |
| P1 | Route / Travel 基础 | 已经有旅行，未来自然会扩 | 否 |
| P2 | Settlement Runtime | 聚落迟早需要不只是地点图标 | 否 |
| P2 | Dynamic Contract | 能把世界状态和任务串起来 | 否 |
| P2 | Intel / Rumor | 与 Character Mind 的有限认知高度兼容 | 否 |
| P3 | Physical Trade Flow | 有价值，但要等世界对象和路线更成熟 | 暂缓 |
| P3 | Faction Territory | 系统价值高，但早做会膨胀 | 暂缓 |
| P3 | World State Override | 等关键人物/派系系统成熟后再做 | 暂缓 |
| P4 | Environment Field | 适合灾害/妖兽潮等，但当前无必要 | 暂缓 |
| P4 | Procedural History | 很有味道，但不是第一阶段收益 | 暂缓 |

## 三、以后写任务书时怎么查

### 如果任务是“商队”

先查：

1. Bannerlord：MobileParty / Caravan
2. X4：物流与经济反馈
3. Endless Sky：Fleet / Cargo

只回答：

- 商队是不是持久实体？
- 需要哪些最小状态？
- 什么结果必须写回 World Runtime？

不要一上来做完整贸易国家模拟。

### 如果任务是“地图进入战斗”

先查：

1. Bannerlord：Campaign → Battle
2. Narraverse 自己的 D2C / D3 / D4 合同

重点确认：

- Context Packet
- Outcome
- 唯一事实权威
- 战斗结果如何回写

### 如果任务是“城市被攻陷后要变化”

先查：

1. Kenshi：World State / Town Override
2. Bannerlord：settlement ownership / garrison

只实现当前玩法真正消费的变化，例如 owner、services、patrol、market availability。

### 如果任务是“缺药生成护送任务”

先查：

1. Battle Brothers：world problem → contract
2. Endless Sky：mission condition / trigger
3. X4：shortage / logistics

目标是最小闭环：

~~~text
真实短缺
→ 生成机会
→ 玩家处理
→ 世界状态变化
~~~

不要同时做完整任务生成器、外交 AI、国家经济和新闻系统。

## 四、明确暂不展开

以下内容保留在参考库，但不因为已研究就进入当前开发：

- 完整国家级战争 AI
- 完整宏观外交
- 全商品逐单位物流
- 大规模动态疆域争夺
- 多层级程序历史生成
- 全地图生态扩散场
- 复杂政治继承
- 大型城市模拟
- 全自动任务生成网络

这些等真实模块出现“消费需求”后再补。

## 五、当前一句话原则

> **先把世界做成能可靠承载人物和事件的骨架，再一点点让它变得更活。**
