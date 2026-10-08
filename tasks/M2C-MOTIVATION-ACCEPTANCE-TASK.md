# M2C：动机因果、计划连续性与消费者独立验收

合同：`m2-contract-v1`；状态：任务书已发布、未开工。以 [M2 共同合同](M2-MOTIVATION-PLAN-CONTRACT.md) 的 Q1～Q7 为唯一预期，不从 A/B 输出倒抄 expected。

## 给用户看

独立证明动机分数确实改变选择、计划中断后恢复原步骤、失败不会伪造资产，以及保存/服务读取保留同一状态。此路只加独立反例与证据，不改生产代码或测试预期。

## 开工、依赖与停止

- 计划工作树：`D:\Narraverse-World-Map-m2-acceptance`；分支：`codex/world-runtime-m2-acceptance`。当前仅计划、不创建。
- 基准固定为 `D:\Narraverse-World-Map-m1-integration` @ `87aa9b605f5f509ce3b0daa97e34ded004d22f33`；main 无 runtime。
- 记录实际 HEAD、工作区状态、合同/任务书 SHA、已导入 A1/A2/B 交付 SHA 及工作区所有权。A2/B 未交付时可审合同、写独立输入/预期；加载失败只记依赖未交付，不声称业务缺陷或反例先红后绿。
- 导入依赖后只运行独立验收；不得改生产代码、A/B测试或公共合同来消除失败。完成本路停止，不合并 main、不启动 M3/D3、不碰模型/真实旧档。

## 文件白名单

仅新增：

- `tests/simulation/motivation-acceptance.test.mjs`
- `tests/simulation/motivation-service-acceptance.test.mjs`
- `tests/motivation-inspector-acceptance.test.mjs`

证据放忽略的 `artifacts/world-runtime-m2-acceptance-*`。不得修改生产代码、A/B测试、旧测试预期、公共合同、共享 fixture helper 或中控状态/看板。需要共享 helper 时先由中控分配唯一所有权。

## 独立反例范围

1. **Q1 评分与配对因果**：从 Knowledge 独立手算职责 710、治疗 700、休息 650；只改一个权重 900→700 或 200→400 后应选 Use。确认同一 actor、初态、其它输入完全一致；不调用 planner 生成 expected。
2. **Q2 连续计划**：独立验证 actor-2 Goal 1 / planId 1 的 tick144 Buy，tick200 duty 到达，tick288 Work 并挂起治疗下一步，tick432 emergency Rest，tick576 恢复原 plan 执行 Use；健康到500、真实工资/私药/公粮生产记账正确，长期目标尚未达到800。
3. **Q3 失败/漂移/生命周期**：按共同合同 §3.1 两份合法 fixture 验证。期限 fixture 必须留下 Plan1 来证明拒绝后存续、day21 清理与 day23 新 Goal；死亡 fixture 使用原规则真实日结，不手改 snapshot。另查前提漂移不补旧步骤；resolver 拒绝不推进 step、不重复扣 Goal.failures；只允许 BuyMedicine 拒绝新增 own-rejection/unknown，WorkForPay 拒绝不得改变药材 Belief 或旧证据，日末公开观察单独核对；NoAction 无命令/回执/rest收益。
4. **Q4 反事实隔离**：用已冻结 Decision 验证 baseline/duty-minus-200/risk-plus-200，只改变指定 profile 字段；tick/RNG/事件/输入/计划/Goal/文件与 hash 不变，假设结果不冒充物理成功。
5. **Q5 完整重演与篡改**：比较连续576、200+376、288+288、432+144，以及 CLI 两日保存+两日恢复；检查完整 bundle/input/event/CSV/配置。篡改 Goal/Plan/source/score/fingerprint/suspended/cursor/额外事实都必须拒绝。
6. **事件与计划状态机**：独立核对四种事实的精确 payload/entityIds/commandId/causationEventSeqs；特别验证 RequestResolved 无因果引用、Decision Planned 引用含 duty 源的 evidenceRefs、Resolved 只引 planned、PlanSettled 只引当日合法 resolved/settled facts。检查固定 transitions/reasonCode、最多8条、只记录真实状态/step变化；NoAction 仍有 Planned/Resolved/no-action，不造 command/receipt/成功；死亡无状态变化的后续日不继续发心理事件。
7. **Q6 真实消费者**：依赖齐备后独立核对 HTTP/玩家动作/A2 adapter、三投影同候选发布、同 ID 重启幂等、stale 409、保存故障保持旧投影、关闭 404、双页真实浏览器读零写。mock 只能作为隔离的 DTO 测试，不能代替消费者链。
8. **Q7 旧兼容**：按基准 87aa9b6 核对 M1 默认288、目标 deadline 原测试、D2C 六操作及 C5 短程。先检查已有相同 SHA 证据和关联代码是否变化；未变化就复用，不重跑同一昂贵验证。

## 定向验证

```powershell
node --test --test-concurrency=2 tests/simulation/motivation-acceptance.test.mjs tests/simulation/motivation-service-acceptance.test.mjs tests/motivation-inspector-acceptance.test.mjs
git diff --check
```

只跑独立反例和直接消费链，不跑全量 simulation；阶段集成收口全量 simulation+export 由中控执行一次。真实浏览器使用独立临时服务、port0/已核实空闲端口，不触发云调用，不关闭他人进程。每条失败记录前置配置、最小输入、预期/实际、命令、代码位置、影响及阻断级别；未运行项标未验证。

## 回执与裁定

给用户概述独立证据和限制。给中控提供工作树/分支/基准 SHA、合同及 A1/A2/B 依赖 SHA、本路交付 SHA、Q1～Q7映射、实际命令/结果、证据目录、PASS/NEED REVISION 和未验证项。只有中控结合 A/B 与真实消费者证据裁定阶段；本路不自行更新看板/PROJECT_CONTEXT，不将阶段标为通过。
