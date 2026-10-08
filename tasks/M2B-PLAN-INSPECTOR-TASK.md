# M2B：动机计划检查器与服务接入

合同：`m2-contract-v1`；状态：任务书已发布、未开工。唯一公共定义：[M2 共同合同](M2-MOTIVATION-PLAN-CONTRACT.md)。

## 给用户看

在开发者检查器中查看人物所知、公仓事实、长期目标、当前/挂起计划、候选分数、已提交决定和结果，并比较三种受限假设。页面读取不推进世界、不改心理或计划状态。

## 开工、依赖与停止

- 计划工作树：`D:\Narraverse-World-Map-m2-service`；分支：`codex/world-runtime-m2-service`。当前仅计划、不创建。
- 基准固定为 `D:\Narraverse-World-Map-m1-integration` @ `87aa9b605f5f509ce3b0daa97e34ded004d22f33`；main 没有 runtime。
- 记录实际 HEAD、合同/任务书导入 SHA、工作区状态及所有权。可先用合同 DTO mock 开发页面/测试，但不得将生产路由静默 fallback 为 mock；集成须使用 A2 的真实导出和服务候选。
- A2 尚未交付时依赖标为待接入/待验；不可 catch-all 吞 import、写死模块永远缺失的断言或宣称完整 M2B 通过。完成本路即交付停止，不合并 main、不接模型、不改真实档。

## 文件白名单

新增：

- `tests/simulation/motivation-service.test.mjs`
- `tests/motivation-inspector.test.mjs`

允许必要修改：

- `runtime/service/http-contract.mjs`
- `runtime/service/service-commit.mjs`
- `runtime/service/runtime-owner.mjs`
- `runtime-server.mjs`
- `runtime-mind.html`
- `runtime-mind.mjs`
- `runtime-mind.css`
- `runtime-map.html`
- `runtime-map.mjs`

禁止修改 core、knowledge、fixtures、persistence、simulation-runner、A/C tests、旧断言预算、旧 M1 检查器行为和状态/架构/看板。新增文件超出名单须先报中控。

## 实现范围

1. 在保留 owner 对旧 profiles/checkpoints 的恢复和行为后新增 `motivation-village` / service format 5；不能将 owner 限制为只接受 M2，也不得改变旧 service 1/2/3/4、M1 `mind-inspector-v1`、时间 DTO1、玩家动作 DTO2。仅 M2 命令适配调用 A2 的真实 `executeMotivationPlayerIntent`，不重写人物规则。
2. owner 保留旧 profiles/checkpoints 的恢复与处理能力，并新增 M2 profile 与明确 checkpoint；private Inspector/counterfactual、公共和 player 投影在同一候选上完整构造验证后 durable publish，再一起 swap。GET/HEAD 只读克隆，不触发恢复、推理、落盘或推进。
3. `/api/runtime/minds` 复用 `inspectMind=true`；默认关。关闭时任意请求 404；开启但没有 M1/M2 检查器能力时 404。旧 M1 检查器仍按原 DTO/状态工作。通过 Host/Origin 保护后先检查能力，再检查方法、再检查 query；HEAD 状态/头与 GET 相同但无正文。API 和三份静态检查器文件同受开关约束；不添加心理/模型/反事实写 API。
4. 检查器展示合同规定的 worldFacts、Knowledge、Decision/Outcome、Plan 的 active/suspended 状态及预计算的 Counterfactual。页面不得把假设说成真实成功；人物切换/刷新/双页签不推进、不写。使用安全文本呈现配置和人物字段，迟到响应不得覆盖新 revision，断连保留最后读数并标读失败。UI消费 A2 公开 committed DTO，不调用 A2 内部 decision helper。
5. B 可先用模拟 DTO 开发，但必须在 A2 到达后改为真实 service5 / Inspector 导出，完成消费者集成。集成缺依赖要显式失败并标待验。

## 定向验证

运行本路新增 service 与 inspector 测试，并在 A2 集成后做真实服务/浏览器核验：

- GET/HEAD 两人、真实 revision、三投影同 revision；重复读取不改 tick/revision/输入/文件字节。
- 关开关与旧 profile 404；POST 405；query 400；Host/Origin 顺序遵守共同合同；静态页面/API 同门。
- 原 ID 重启重试幂等，stale 409；durable save 故障时公共、player、mind 投影全保持旧值；真实玩家动作走 A2 adapter。
- 页面显示当前判断与历史决定分开、active/suspended plan 与三 case 假设；刷新、切换、双页签、断连只读；无隐藏推进或写操作。
- 只使用本路新建的临时目录和 port0/已核实空闲端口。禁止启停他人/旧18212、18302、18312等服务，只关闭本路启动的进程。

建议命令：

```powershell
node --test --test-concurrency=2 tests/simulation/motivation-service.test.mjs tests/motivation-inspector.test.mjs
git diff --check
```

mock、HTTP、浏览器证据分别标明；A2 未接通时只交付真实完成的模拟部分，不称完整通过。

## 交付回执

给用户说明入口、展示内容、反事实含义及未完成项。给中控提供基准/合同/A2依赖/本路 SHA、精确文件、测试命令和结果、真实 HTTP/浏览器与只读证据、临时目录/进程归属、剩余风险。验收前状态为待验收，不更新阶段结论。
