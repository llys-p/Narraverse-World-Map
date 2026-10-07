# 当前状态与接手方向

更新时间：2026-10-07 12:45（Asia/Shanghai）。

## 项目定位

地图 → 场景 → 战斗 → 成长的独立可玩原型；先单独保存和迭代，不自动替换Narraverse模块四。
代码保持现有纯JS/HTML结构；本轮没有TS化、没有改战斗/地图玩法、没有引入依赖。
后续方向已确定为世界运行时 / 生态模拟；按 [架构与分阶段实施计划](WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md) 逐步推进。

## 已有资产

- 地图、场景、战斗、角色与商店五个页面。
- WorldRPG、WorldInv、WorldState、WorldSkill、WorldFX、WorldCombatFX模块。
- kit、stickart绘制资源与现有浏览器E2E脚本。
- 历史README、阶段总结、两个review和HANDOFF文档。

## 独立化边界

- 新仓库只保存经过白名单与敏感特征检查的源码/资源/文档，不包含用户运行数据或密钥。
- 新Start-World.cmd从自身目录启动，默认18312；server直接运行仍尊重既有WORLD_PORT/18212逻辑。
- server不再读取旧fusion .env，只读取此仓库本地.env；未配置时云模型不可用。
- 默认不启动Laya桥；离线地图与战斗不证明AI/桥完整闭环。
- 新origin浏览器存档不是旧origin存档；目前没有迁移。

## 验证口径

- 历史：小Z复跑fix4/rpg/inv/game/skill/fallback六套；world/ctx未复跑。
- 2026-10-06 独立化时：边界回归3项通过，53个JS/MJS/CJS脚本语法检查通过。
- 同次隔离18313服务：五个页面与三个脚本路由均HTTP200；模型配置configured=false，没有调用模型或桥；测试后停止自己的服务。
- 不宣称原型全部E2E、真实模型、状态恢复或素材许可通过。
- 2026-10-07 本次只修订架构计划与状态入口；阶段依赖、文档链接、代码围栏与 diff 格式已检查。不新增运行时代码，未运行模拟、浏览器或模型验收；上述原型测试不代表新模拟内核通过。
- 2026-10-07 A1 执行者交付（分支 `codex/world-runtime-a1`，基准 14293ba）：`node --test tests/simulation/rng.test.mjs tests/simulation/clock-scheduler.test.mjs` 23 项通过（R1～I1，含 RNG 已知向量/恢复、tick 边界与溢出、调度排序/分块一致/边界一次/非法拒绝、纯 Node 静态扫描）；`node --test tests/export-boundaries.test.mjs` 3 项通过；`git diff --check` 干净。实现前先跑过两份测试并确认失败为 ERR_MODULE_NOT_FOUND。未运行浏览器 E2E、模型或 Laya 桥。以上为执行者自报，待中控独立验收。
- 2026-10-07 A1 中控验收结论 NEED REVISION（任务 [A1R-SCHEDULER-LIMITS-TASK](tasks/A1R-SCHEDULER-LIMITS-TASK.md)，main f28ed3e）：F1 展开总量无预算、F2 稀疏数组绕过校验、F3 异类对象被当普通记录。A1R 执行者修正交付（同分支，代码基准 eee6cb8）：调度队列上限 100000 项、单次到期结果上限 1000000 项并展开前预检（含安全整数精确溢出判定）；稀疏/null/undefined 描述符 create/restore/advance 三入口拒绝；选项/恢复记录/描述符/对象注册表强制普通数据对象（原型 Object.prototype 或 null）。新增 7 项回归先红后绿，全套 30/30，边界回归 3/3，`git diff --check` 干净；64 MiB 受限子进程 32 任务×144000 提前得到 LIMIT_EXCEEDED，不 OOM。未运行浏览器 E2E、模型或 Laya 桥。待中控复验。

## 尚未完成

- 两个localStorage键非事务、多标签页冲突、战斗中途刷新恢复。
- Laya心境驱动地图行为；可信人物判断不是躯干可视化可以证明的。
- 原浏览器E2E端口与外部路径尚未统一，部分测试会触发云调用。
- 素材许可/公开发布许可尚未核实，仓库先私有。
- 旧正式平台移植建议属于历史，不自动成为此独立项目任务。

## 下一步

A1/A1R已验收；用户授权本对话自行推进。A2基于7b4a2db完成Snapshot/命令/EventLog/原子tick，新增17项及原33项共50/50通过；资源闭环、回退、去重、严格输入及288tick内存恢复已核验。代码保留codex/world-runtime-a2，不合并main；下一步A3保存恢复。

阶段顺序：A 底座 → B 生态经济 → C 人物决策 → D 玩法接入 → E AI增强；F 世界扩展按需拆项，G 正式平台适配单独规划与授权。

- A1～A4：时间与随机数 → 状态/命令/事实事件 → 保存恢复 → Node runner。连续100天与40天存档后再跑60天必须一致；通过只代表底座通过。
- B 才验证100天生态经济因果闭环，并进行500/1000天、多seed与扰动对照；聚合捕猎和简化贸易不能宣称实名NPC决策完成。
- A～C 使用新建实验数据，隔离旧页面与真实浏览器存档；不改正式平台、不启停旧实例、不调用付费模型或Laya桥。
- 后续按用户指定的任务/阶段范围推进；每项验收后更新本文件的当前任务和下一步，不把方向文档当作实现证据。

## 中控与进度看板

- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)；owner `llys-p`，number `2`，Project ID `PVT_kwHOEF9IDs4BmADf`。与正式平台 Project #1 分开维护。
- 当前卡定位：阶段 A `PVTI_lAHOEF9IDs4BmADfzg_Bv9M`；任务 A1 `PVTI_lAHOEF9IDs4BmADfzg_BwKU`。更新前用 `gh project field-list 2 --owner llys-p --format json` 与 `gh project item-list 2 --owner llys-p --format json --limit 100` 读取真实字段/状态，按稳定 ID 更新，避免重复建卡。
- 中控按架构依赖逐项写任务书，用户转发给执行者；执行者使用任务分支实现、提交并回传证据，中控负责独立验收与发布下一项。
- 待派发不代表开工；收到实际开工回执才进入进行中，交付进入待验收。中控复核通过后标已验收，失败标需修正并保留原因。
- 每个任务/阶段收口同步看板与本文件；阶段需所有必需任务及阶段门槛通过。收到回执后触发更新，远端失败明确记录待同步，不凭执行者自报测试数量判定完成。
- A1/A1R已验收；A2由本对话实现并复核通过，A3/A4待推进；B～G未开始。用户已将执行改为本对话自行推进，看板由本对话同步。
