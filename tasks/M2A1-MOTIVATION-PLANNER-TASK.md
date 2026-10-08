# M2A1：动机状态与纯规划器

合同：`m2-contract-v1`；状态：任务书已发布、未开工。唯一公共定义：[M2 共同合同](M2-MOTIVATION-PLAN-CONTRACT.md)。

## 给用户看

实现有限、可解释的动机比较：人物依据自己收到的信息、长期健康目标、职责请求和疲劳，在五种固定行动里选择，并能展示支持与反对分数。此路只交付状态校验和纯规划，不执行任何世界行动。

## 开工、依赖与停止

- 计划工作树：`D:\Narraverse-World-Map-m2-core`；分支：`codex/world-runtime-m2-core`。当前不创建、不代表开工。
- 代码基准固定为 `D:\Narraverse-World-Map-m1-integration` @ `87aa9b605f5f509ce3b0daa97e34ded004d22f33`。main 没有 runtime，不得从 main 开工。
- 派发时记录实际 HEAD、干净/脏状态、工作区所有权，以及共同合同/本任务书导入的控制树 SHA。只按合同导出接口实现，不自造第二套规则。
- A1 完成并交付 SHA 后停止；A2 才能在同一工作树依赖该 SHA 继续，A1/A2 不可同时编辑。A1 不执行 resolver，不接 runner/service/UI，不推进世界。

## 文件白名单

仅新增：

- `runtime/core/motivation-state.mjs`
- `runtime/core/motivation-planner.mjs`
- `tests/simulation/motivation-state.test.mjs`
- `tests/simulation/motivation-planner.test.mjs`

不得修改其它文件，包括 A2 runtime、fixture、knowledge、runner、service、旧 resolver/物理规则、旧 profile 测试、公共合同、状态文档和看板。超出白名单先交中控精确理由与调用链，不自行扩围。

## 实现范围

1. `motivation-state.mjs` 导出合同 §4.0 列明的全部常量及精确版本字符串，并实现 `validateMotivationConfig(config)`、`createMotivationModel(config)`、`validateMotivationModel(model)`。validator 仅校验 motivation config/model 的结构、字段、普通/null 原型、密集数组、无 getter、安全整数与自身预算；不接收 memory/mind，不校验跨 mind+motivation 的合计输入上限，不验证已到期请求前缀/cursor/历史重演。
2. `motivation-planner.mjs` 导出 `planMotivationDecision(knowledge)` 与 `buildFastCounterfactual(decision)`。两者是纯函数，严格按合同 Knowledge、候选顺序、仅 Knowledge 软前提、整数公式、plan lifecycle、反事实三 case 与 canonical JSON 文本指纹工作；先根据软前提评分再选择，不用 resolver 的权威可执行性预过滤候选；不读 bundle/world/他人私账，不修改输入、不消耗 RNG、不执行动作。A1 只证明对 DTO 的纯规划和候选分数，不证明世界行动会成功。
3. M1/M2 公式、 reasonCode、Decision/Plan/Counterfactual 字段以共同合同为唯一字段源；不得把 M2 决定写进 M1 lastDecision。

## 定向验证

运行本路新增的两个测试文件，并检查：

- 候选顺序、每项软前提、score/support/opposition/reasonCode 与并列选择；独立手算 Q1 的 710/700/650 与权重配对；区分 unknown、unavailable 和 confidence 不足。
- Goal/Plan ID 连续性、买药两步计划、治疗计划挂起/恢复、临时职责期限、前提漂移、失败不推进、NoAction 不伪装 Rest、ID 溢出拒绝。
- Counterfactual 对 JSON.parse→canonicalJson 的文本严格相等、actor/tick/revision/版本、baseline choice+candidates 逐项验证，再检查固定三 case、零输入/文件副作用；使用冻结 Decision/Knowledge 而非 planner 自己生成 expected。
- 字节/集合/安全整数/稀疏数组/原型/getter/超限拒绝为整体失败，不返回部分状态。

建议命令：

```powershell
node --test --test-concurrency=2 tests/simulation/motivation-state.test.mjs tests/simulation/motivation-planner.test.mjs
git diff --check
```

只报告真实运行结果；不运行整套 simulation/export，不把 A2 依赖未交付当作 planner 验收通过。

## 交付回执

给用户说明选择与可解释分数的可用范围和限制。给中控提供目录、分支、基准 SHA、合同导入 SHA、A1 交付 SHA、精确文件、公式/Plan/Q1映射、命令与结果、证据路径、未验证项以及工作区仍归本任务树所有的状态。A1 交付即停止，不接着做 A2、不合并 main、不改阶段状态。
