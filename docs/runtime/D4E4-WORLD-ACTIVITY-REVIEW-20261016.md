# D4E4 真实世界活动日志：限定验收 PASS

2026-10-16 17:23（Asia/Shanghai）。本次仅收口活动日志，不代表D阶段整体完成或长历史性能合格。

## 给用户：已经能做什么

现有地图新增「世界活动」：展示真实已提交的人物行动和结果、赠粮、玩家旅行/遭遇/交易/时间推进、日结消费与狼鹿群体统计，可按人物和地点筛选。明确区分成功、拒绝、未行动、日结及等待结果；缺历史地点显示未知。计划不单独列为已执行动作，狼鹿不编造个体身份或故事。

这是显式开启的**开发者全知观察**，页面标明「非玩家/角色可知信息」。普通服务默认关闭；不写入NPC知识，不输出完整私账、原始回执、计划或记忆。

入口为本树 `Start-D4.cmd`，新候选地址 `http://127.0.0.1:18327/runtime-map.html`。**本次没有启动18327或创建其日常世界**；独立页面验收实际使用18328和专属测试目录。原18325用户实例没有升级、重启或迁移，继续保持原样。启动/正常关闭/重开见[D4体验入口](D4-EXPERIENCE-ENTRY.md)。

性能优化保持暂停，Issue #3仍开放；长历史可能等待几十秒，未认定日常流畅。下一步地图→现有村庄/森林人物与活动→已有交互→返回同世界，以及少数重要人物行为追踪，仅记录方向，本轮未开工。

## 精确版本与范围

| 项目 | 值 |
|---|---|
| 执行树 | `D:/Narraverse-World-Map-world-activity` |
| 分支 | `codex/world-runtime-world-activity` |
| 接续基准 | `0f4bba27f68a5841ca672288a76512e11ea729b1`（D4E3，生产底座b7） |
| 冻结合同 | `2562f40e1420c98939b18279369c7cd3e95e495f` / [任务书](../../tasks/D4E4-WORLD-ACTIVITY-LOG-TASK.md) |
| 被验源码/测试 | `28d3f793a18f223e7df8d2378b1e81eba2d8e1e5` |
| 环境 | Windows 11 10.0.26200、Node.js v24.14.0 x64；纯内置模块，无模型调用 |

执行者在上述源码提交后停写，中控独立审查新增源码并执行隔离浏览器门。产品/测试恰11个合同允许文件；后续提交只增加报告、脱敏证据与状态说明。不改core、知识、存档格式、审计或历史重演机制。未合main、未部署、未迁移真实数据，未调用DSH/付费模型。

## 实现审查

- `projectWorldActivity`沿用`runtimeProfile`及完整`validateBundle`；不增加trusted/skip入口。仅最近256事件派生，最多64行，规范编码字节超过65536明确`LIMIT_EXCEEDED`。顺序及ID来自真实事件序号和子行索引。
- 动机结果通过真实因果引用取得动作名，缺引用不猜。NPC缺历史地点为null；成功旅行用回执起止，成功遭遇的森林地点来自既有严格规则，拒绝请求不据目标地点补造事实。赠粮去重仅用来源窗口。
- 日结保留NPC零消费记录；玩家消费与死亡事实分别取权威来源。狼群区分总数、可用与遭遇保留，读取顶层`ecology.encounterOwnership`。狼鹿只展示群体统计。
- owner在候选校验后预生成缓存，持久提交成功才与原投影一起发布；读取返回副本。HTTP/CLI显式开关默认false，不增加旧capabilities字段；静态辅助模块始终可取。
- 页面先完整检查DTO及同simulation/revision/tick后一起展示；文本使用`textContent`。筛选只操作已读列表，刷新不发写命令。

Reference Review：沿用本项目EventLog权威事实、既有只读投影、owner持久成功后发布缓存模式；采用事实/角色知识分层。没有引入日志平台、前端框架、新依赖或外部故事生成。已有成熟参考原则仅复用，此轮不做外部资料调研。

## 实际验证与原始证据

原始输出、进程参数及脱敏证明在[`docs/evidence/d4e4-20261016/`](../evidence/d4e4-20261016/)。完整私档和投影未上传。

### 1. 唯一新增定向文件：最终2/2通过

```powershell
node --test tests/simulation/world-activity.test.mjs
```

执行者最终门：PID20352，外层硬超时90000ms，未触发，exit0，48104.4388ms；两成员分别45301.0126ms、2670.7968ms。中控读回最终同源测试和完整stdout，没有为了增加次数重跑此文件。

- 一条真实短动作轨迹后只补到144ticks：旅行、开始遭遇、攻击、逃跑、返村、交易尝试、拒绝和时间区间；核对真实成功/NoAction/拒绝、三名NPC日结、狼群总/可用/保留摘要、精确公开字段和不泄漏私字段。
- 同一短owner/HTTP链：默认关闭和caps兼容、开启、读取副本、一次注入EIO持久失败保旧、同DTO重试成功、正常恢复一致、同版本投影、HEAD空body、query400、POST405、读取不改变snapshot。
- 边界说明：该短fixture只核对实际输出不超过行数/字节上限；256来源/64行截断与65536超限分支本次由源码审查确认，未另造超长历史或预算极限运行。非法存档/全历史重演拒绝机制未改，复用底座既有证据，未重跑旧篡改套件。

历史尝试如实保留：第一次两个断言失败（交易实际拒绝与清理guard）；第二次90秒超时（不合适的96tick前缀轨迹，弃用并改到总144tick）；第三次1/2（redaction误匹配`travel-receipt`标签）。旧同名日志已被执行者后续运行覆盖，只能从工具回显重建，见`d4e4-world-activity-attempt-history.txt`；不冒称原始失败日志完整。最终通过输出使用独立路径完整保全。

### 2. 中控独立真实浏览器门：PASS

```powershell
node artifacts/d4e4-controller-20261016/browser-server.mjs
node artifacts/d4e4-controller-20261016/browser-server.mjs --restore
```

两次子进程完整argv分别见`first-process.json`、`reopen-process.json`。共同参数：`runtime-server.mjs --data-dir <本树>/artifacts/d4e4-controller-20261016/world --port 18328 --writable true --inspect-mind false --inspect-activity true`；仅首次附加`--profile scene-survival-village --seed 42`。每个监督服务600000ms硬限，正常quit退出，不超时、不强杀。PID44812/5752，驻留墙钟60581/51474ms含人工验收等待，**不是性能测量**。

首次用真实HTTP提交村庄EncounterBegin（规则拒绝）和PlayerGiftFood给actor-2（成功），得到rev2/tick0。页面呈现恰2行：拒绝/地点未知；赠粮/村庄，无重复。真实DOM语义操作确认：猎人仅赠粮、商人为空提示、未知地点仅拒绝、村庄仅赠粮。恢复全部后点击刷新，活动ID及内容不变，3份service文件散列不变。正常quit后重开同目录，API与页面再次完全相同；无浏览器console error，临时页已关闭。没有截图、录屏或视觉检查。

活动ID：`event-1-item-0`、`event-2-item-0`。首次与重开API原始响应SHA256相同：

`8082bec932e6aa3f122c4b388b8386829b22efeef39e4a5b65a237dd0d4bc427`

本门验证新增列表消费者；旧完整给粮→森林战斗→返村页面链复用[D4E3](D4E3-PLAYABLE-REVIEW-20261016.md)同源证据，未冒称本轮再跑完整故事。新owner发布路径变化已由本轮持久失败/重开门覆盖。

## 保护与裁定

`protection.json`读回：原八份档SHA256全部不变；控制树5个既有未跟踪文件不变；原18325此前9个service文件不变，源码仍0f4bba2且干净，PID2592命令行/启动时刻一致。两个本轮服务均正常exit0，测试锁释放；进程清单无本轮Node残留，TEMP无该前缀测试目录。新18327日常目录尚未创建。

裁定：**D4E4新增活动日志功能合同限定PASS**。功能、性能和发布分别判断：本片功能已验；性能未新测且未合格；源码/脱敏证据已推送任务分支，控制树与Projects先待验收再已验收并读回。D阶段整体仍进行中。本轮完成即停止。
