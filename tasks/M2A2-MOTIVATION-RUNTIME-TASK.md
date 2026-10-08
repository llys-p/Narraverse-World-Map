# M2A2：动机世界权威集成与重演

合同：`m2-contract-v1`；状态：任务书已发布、未开工。唯一公共定义：[M2 共同合同](M2-MOTIVATION-PLAN-CONTRACT.md)。

## 给用户看

让 M2 规划进入真实世界事务：行动由旧规则重新核验，保存恢复后仍能重演请求、计划、目标、行动和钱粮变化。此路接入 fixture、knowledge、引擎与 CLI，不做服务页面。

## 开工、依赖与停止

- 计划工作树：`D:\Narraverse-World-Map-m2-core`；分支：`codex/world-runtime-m2-core`。A2 必须在 A1 交付后串行继续同一树，不能并行编辑。
- 代码基准固定为 `D:\Narraverse-World-Map-m1-integration` @ `87aa9b605f5f509ce3b0daa97e34ded004d22f33`；main 没有 runtime。
- 必须记录 A1 实际交付 SHA、共同合同/任务书导入 SHA、当前 HEAD、工作区状态及文件所有权。A1 导出缺失或不符时停止并报精确阻断，不复制实现、不吞 import。
- 本路完成后交付并停止；不合并 main、不启动 M3/D3、不接模型/正式平台/真实旧存档。

## 文件白名单

新增：

- `runtime/core/motivation-runtime.mjs`
- `runtime/knowledge/motivation-knowledge.mjs`
- `runtime/fixtures/motivation-village.mjs`
- `tests/simulation/motivation-runtime.test.mjs`
- `tests/simulation/motivation-knowledge.test.mjs`
- `tests/simulation/motivation-runner.test.mjs`

允许必要修改：

- `runtime/core/command-engine.mjs`
- `runtime/core/world-state.mjs`
- `runtime/core/event-log.mjs`
- `simulation-runner.mjs`

禁止修改 persistence 的通用审计实现、`runtime/core/society.mjs`、`runtime/core/hunter.mjs`、`runtime/core/actors.mjs`、`runtime/core/rng.mjs`、`runtime/core/simulation-clock.mjs` 的旧语义、服务/UI、A1 源码与 A1 测试、B/C 测试、其它旧测试预期、PROJECT_CONTEXT/看板。任何额外文件先由中控裁定。

## 实现范围

1. 导出 `defaultMotivationVillageConfig()`、`createMotivationVillage(seed=42,simulationId='motivation-village',config=defaultMotivationVillageConfig())`、`motivationSystems()`；按共同合同构造固定 config、M1 mindModel 和独立且精确封闭的 motivationModel。A1 的 `validateMotivationModel` 只做结构校验；A2 负责 mind+motivation 总请求/刺激预算、每tick上限、请求前缀/tick/cursor 和完整历史验证。
2. 导出 `validateMotivationWorld(world,sealed=true)`、`executeMotivationPlayerIntent`、`describeMotivationPlayerActions` 及仅供本路引擎接入的必要内部函数。sealed=true 只做配对结构验证，公开入口仍需完整 bundle audit。新 rules 分支先分离 motivationModel，再复用 mind/memory/真实 society 结构校验；完整重演必须覆盖全部历史、旧物理账、RNG、事件/输入/计划/Goal/command 绑定。
3. 导出 `buildMotivationKnowledge(bundle,actorId)`（committed phase only）与 `projectMotivationInspector(bundle)`。完整审计 bundle 后只返回符合合同的脱离源对象 JSON DTO；决策阶段 Knowledge helper 为 A2 私有，B/C 不调用或用它生成独立预期；不泄露 world、他人私账、未来 RNG。
4. 只在新 profile/rules 分支引入四类新事实和固定同 tick 顺序。旧 chief 只保留自身旧 plan；过滤旧 planner 对 actor-2/3 的候选/Goal/资产变更。两名 M2 actor 从同一冻结候选快照规划，再按序由原 resolver 执行，禁止看到彼此当 tick 结果后重规划。按合同精确输出事件实体、commandId、causation refs、PlanSettled transitions 与 FSM 原因码。
5. 完成 CLI 明确注册、M2 恢复规则与 `motivation-config.json`、`motivation-inspector.json` 导出；保留旧 mind-config 和全部原业务 CSV。旧 profile 的导出字段/字节不变。

## 定向验证

运行本路三个新增测试文件以及合同规定的直接消费者验证：

- Q2 四日链、Goal/Plan/Outcome 与真实工资、私药、公粮生产记账；deadline/cooldown/失败只计一次。
- Q3 只使用共同合同 §3.1 的期限等待与死亡清理 recipe；分别从合法 config 构造并从 tick0 连续/分段推进，不手改 snapshot、不跑无关长程实验。
- 反例核对仅 BuyMedicine authority rejection 追加 own-rejection/unknown；WorkForPay rejection 不改药材 Belief/旧证据，日末公开观察单独核算。
- Q5 连续/分段 576 tick 重演，保存 200、288、432 边界及 CLI 两日保存+两日恢复；反例篡改 goal/plan/source/score/fingerprint/suspended/cursor/事件。
- Knowledge/Inspector 只读克隆和字节上限；请求与 M1 stimuli 合并预算、死亡不可收新输入、报价和信念不得用 world truth 替代。
- 旧 M1 默认 288、目标 deadline 原测试、D2C 六操作/C5 短程兼容对照基准。相同 SHA 已有证据且关联代码未变时复用，不重复重跑。
- 定向运行本路 runner 导出边界；不跑整套全量模拟。全量 simulation+export 留给 M2 集成阶段收口。
- 所有外部入口拒绝未知字段、异类/非普通原型、稀疏数组、getter 与非法数字；只对新 rules 注册检查 `society-day-`、`mind-day-`、`motivation-day-` 前缀限制，旧 profiles 原限制不变。

建议命令：

```powershell
node --test --test-concurrency=2 tests/simulation/motivation-runtime.test.mjs tests/simulation/motivation-knowledge.test.mjs tests/simulation/motivation-runner.test.mjs
git diff --check
```

实际消费者、CLI 与兼容验证须记录真实命令、seed、产物、哈希和证据目录；不得把 mock 或旧 SHA 的证据写成新代码复跑。

## 交付回执

给用户说明可执行的动机选择、保存恢复及尚未覆盖的玩法。给中控提交 A1/A2 SHA、合同/依赖 SHA、工作树所有权与状态、白名单差异、实际命令/结果、事件和物理账证据、旧兼容证据、未验证项。完成本路即停止，等待独立 B/C 与中控验收。
