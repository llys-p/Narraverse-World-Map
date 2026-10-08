# M1A：规则心智、真实行动与完整重演

合同：`m1-contract-v1`；2026-10-08（Asia/Shanghai）。状态：待派发，未开工。唯一公共定义：[M1 共同合同](M1-CHARACTER-MIND-CONTRACT.md)。

## 给用户看

让两位已有 NPC 在同一世界中，因为掌握的信息不同，形成不同判断并真正买药、用药或等待。错误说法可以被后来的事实纠正；保存恢复后保留原来的目标、依据和实际钱货。此路不做页面、服务或模型。

## 开工与停止

- 计划目录/分支：`D:\Narraverse-World-Map-m1-core @ codex/world-runtime-m1-core`，当前尚未创建。由中控确认开工再创建独立 worktree，不切换现有 a2 或 control。
- 代码基准：`feb2856910bf8a9a6757aba892128d00d795bc15`（D2C 代码验收点 `172ac9f`），开工记录 HEAD/实际基准/干净状态。
- 文档包：本任务书及 M1 共同合同、B/C 任务书取自同一个 M0 最终交付提交，版本必须为 `m1-contract-v1`；由中控按白名单导入并在派发回执记录该 SHA。不从 main 重新创建 runtime，不复制 main 的 README/PROJECT_CONTEXT 覆盖源码树说明。
- 只完成本路并给出交付 SHA；不能自行合并 main、修改公共合同、开启 M2/D3/E、接模型/桥或迁移旧档。

## 文件白名单

新增：

- `runtime/core/mind-state.mjs`
- `runtime/core/mind-planner.mjs`
- `runtime/core/mind-runtime.mjs`
- `runtime/knowledge/mind-knowledge.mjs`
- `runtime/fixtures/mind-village.mjs`
- `tests/simulation/mind-core.test.mjs`
- `tests/simulation/mind-runtime.test.mjs`
- `tests/simulation/mind-knowledge.test.mjs`
- `tests/simulation/mind-runner.test.mjs`

允许必要分派修改：`runtime/core/command-engine.mjs`、`runtime/core/world-state.mjs`、`runtime/core/event-log.mjs`、`runtime/knowledge/actor-knowledge.mjs`、`runtime/knowledge/player-knowledge.mjs`、根目录 `simulation-runner.mjs`。

禁止修改：`runtime/service/**`、`runtime-server.mjs`、任何页面/CSS、B/C 的测试、旧物理模块/常量/fixture/测试预期、磁盘发布器。若发现必须超白名单，先给中控精确调用链与最小文件变更，由中控更新合同；不能在别路文件中偷偷修适配。PROJECT_CONTEXT 和看板由中控收口更新，执行者不写重复交付日志。

## 实现顺序与交接点

1. 按共同合同 §3/§8 实现严格 mind config/state 与纯 DTO/Belief/planner。先证明 statement≠真实库存、tick0未知、TTL/去重/预算与冻结输入不变；不是只建空类型。
2. 实现 mind-village 与 M 专用 base-world 适配：两人唯一 Goal、NoAction 无命令/休息收益；真实 SocietyAction 使用旧执行器。村长仅保留自己的旧计划，不能把旧规划器为两位 Mind 读取的库存结果带入 Brain。
3. 接通活动 tick、session 空 tick 跳跃、规范 transition 对照、事件/输入/回执完整重演。必须验证 12/24 的刺激不会被直接跳到144漏掉，且同 tick 玩家先于 NPC、规划同快照/执行重校验。
4. 完成 §8.1 的所有公共导出和真实 fixture；先交付一个可导入提交给 B/C。接口名/字段/错误码以共同合同为准；模块缺失期间 B/C 的 mock 不能声称真实接通。
5. 完成原 player knowledge/actions 的 M 审计适配、checkpoint 恢复与 CLI 明确注册/导出。保留旧 profile 轨迹；无需修改共享物理规则或推出新 checkpoint 外壳。

## 定向验证

以下命令是实现后待运行，不是 M0 已有通过证据：

```powershell
node --test --test-concurrency=2 tests/simulation/mind-core.test.mjs tests/simulation/mind-runtime.test.mjs tests/simulation/mind-knowledge.test.mjs tests/simulation/mind-runner.test.mjs
node --test --test-concurrency=2 tests/simulation/player-play-core.test.mjs tests/simulation/actor-knowledge.test.mjs tests/simulation/session.test.mjs tests/simulation/checkpoint-store.test.mjs tests/export-boundaries.test.mjs
git diff --check
```

新增测试覆盖 K1～K5 的核心部分及 K6 的数据/死亡边界；CLI 在新的 artifacts 子目录跑 mind-village 两日与一日保存后再一日恢复，比完整 checkpoint、inputs 与 mind-inspector 投影。tick24/143/144 的精确分割用核心/存档接口验证，不能拿只支持整日的 CLI 假称这些分割已覆盖。

公共重演/存档分派涉及旧行为，增加同一份 D2C 六操作输入、旧 C5 四日的基准/新代码完整 bundle 与数据导出对照；复用已有可核对原产物或在独立基准进程生成一次，不调用服务/模型、不覆盖历史产物。证据只取实际需要的直接兼容链，不跑全部 100/500/1000 天。全量模拟由中控阶段集成收口集中一次，A 不单独再跑整套。

## 交付回执

给用户：能看到的行为、局限与未完成项（无页面/服务验收）。给中控：任务/目录/分支/基准/交付 SHA、精确文件、导出合同版本、实际命令/结果、K 用例映射、反例先红后绿、证据目录、剩余风险与未验证项。工作区干净、代码推送任务分支；收到中控验收前不标整阶段通过。
