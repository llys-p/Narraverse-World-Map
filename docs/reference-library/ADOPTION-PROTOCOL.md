# 参考库使用协议

本文件定义未来写任务书、做架构设计、实现新模块时怎样使用参考库。

## 1. 先写“问题”，不要先找要抄的游戏

例如：

- NPC 为什么会产生“去买药”这个候选？
- 已经在执行 Goal 时，什么事件允许打断？
- 远端 NPC 半年不在玩家附近，如何低成本继续生活？
- Director 如何选择哪个角色适合进入一次背叛诱惑事件？

然后去 MODULE-INDEX.md 查相同问题。

## 2. 选 1 个主参考 + 最多 2 个辅助参考

不要把五款游戏全部揉成一个巨型系统。

例：

```text
问题：Goal 总是抖动

主参考：CDDA committed_goal
辅助：ONI busy duplicant completes current errand
辅助：RimWorld urgent vs normal thinking
```

## 3. 提取 Pattern，不提取表面功能

错误：

```text
RimWorld 有娱乐条，所以我们也做娱乐条。
```

正确：

```text
RimWorld 把可持续 Need 与行动产生分开。
Narraverse 可借“Need 是动机输入，不直接等于动作”。
```

## 4. 对照 Narraverse 权力边界

任何外部模式都必须重新过以下边界：

- World Runtime 是客观事实唯一权威。
- Character Mind 只能形成 Belief / Intent / Plan。
- Director 制造处境，不直接写人物答案。
- LLM / Provider 没有世界写权限。
- Fact 与 Interpretation 分离。
- 保存、重放、幂等、资产守恒等已有合同优先于外部设计。

如果参考模式破坏这些边界，默认拒绝或改造。

## 5. 先算复杂度收益

每个候选模式写：

```text
Frequency:
Gameplay impact:
Determinism requirement:
Testing cost:
Runtime cost:
Maintenance cost:
Could LLM handle rare cases instead?
```

遵守 Character Mind v0.2 的复杂度预算原则：

- 高频、关键、可验证、要重放 -> 规则 / Runtime。
- 低频、语义复杂、不直接改世界 -> 优先 LLM / Provider。
- 不因为“别人游戏里有”就必须实现。

## 6. 任务书必须增加 Reference Review

未来 M2/M3/Director 等新任务书建议加入：

```text
## Reference Review

Problem:
Primary references:
Patterns adopted:
Patterns rejected:
Why:
Code reuse:
License notes:
Narraverse-specific changes:
```

如果没有真正使用参考，可以写“无外部模式依赖”，不要为了形式硬塞引用。

## 7. 实现后回写 PATTERN-DECISIONS

当某个参考模式真正进入已验收实现后，记录：

- Pattern ID；
- 来源；
- 最终 Narraverse 版本；
- 实现任务 / commit；
- 做了哪些改造；
- 后续是否仍需要回看外部来源。

这样以后新的 Agent 不需要重新争论同一个设计。

## 8. 参考代码的规则

优先级：

```text
公开架构文档
  >
官方 / 开源源码阅读
  >
高质量 Mod / 社区技术资料
  >
专有反编译资料
```

默认“读架构，独立实现”。

只有明确的 license review 后才允许代码级复用。

## 9. 验收时不测试“像不像某游戏”

验收必须验证 Narraverse 自己的目标。

例如借鉴 CDDA committed goal 后，不测试：

“是否跟 CDDA 一模一样”。

而测试：

- 新信息是否会造成不必要 Goal 抖动；
- 紧急威胁是否仍能打断；
- Goal 是否能完成、失败、过期和局部重规划；
- 保存恢复后是否保持一致；
- 角色是否使用了不该知道的信息。

外部系统只是帮助我们少走弯路，不是最终规格。
