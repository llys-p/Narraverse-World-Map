# DSH 施工团队协作规则

> 2026-10-11（Asia/Shanghai）；新监督对话已接任，三名原生子代理已完成纯文字接手验证并停止待命。D3-1已通过可监控的独立Global执行对话完成并由Codex验收；原生子代理通道实测不可靠。

## 监督入口与分工
- [DSH监督对话](http://127.0.0.1:19387/?sessionId=session-2564efe0-949b-48ed-90a5-f7f7feb9cbce)。主路线workbuddy-global/gpt-6.1-sol，high；Relay读回选择一致，用户在HDS界面确认GPT-6.1 Sol。
- Codex负责路线、架构、合同、基准、最终验收、提交整合和看板；DSH负责现场拆分、派工、模型选择、监控纠偏与证据回执。
- 保留旧混元4对话历史，后续施工由上述新监督对话承接；不复制常驻架构团队。
- 无具体任务时待命，不自行推进D3、不后台循环。

## 已创建的原生子代理
| 角色 | 原生agentId | 本轮指定provider/model |
|---|---|---|
| 代码/脚本 | 25a3aaa2-1f7f-40b3-a259-1dc95a335e8f | workbuddy-global/deepseek-v4.1-flash high |
| 页面/交互 | b640cabc-fab5-4cf4-8979-43ac37eaa6a8 | workbuddy-global/hy4-preview-f high |
| 独立测试/复核 | 146531b1-3661-481c-a84e-118ab96c5952 | workbuddy-global/hy4-preview-f high |

- 三名均按functions.subagent原生工具创建并收到finished通知；完成仅文字ACK，无文件读取、代码或测试执行。
- 创建工具接受provider/model/reasoning_effort参数，但未返回effectiveModel；本表是实际请求的路线，不能据此声称免费线路实际计费已核实。
- 子代理sessionId和parentSessionId未由原生工具返回，不猜填。Relay项目会话列表未暴露这些子代理。
- 旧agentId续用实测返回not found；新子代理也出现“started后状态不可查、父run结束后迟到写入”。不能用started或父run结束判断子任务终态。
- 子代理是按任务临时启用的角色，不是永久运行团队；完成停止以节约额度。

## 模型路由
- 代码、工具、脚本、批处理优先workbuddy-global/deepseek-v4.1-flash；页面/交互优先workbuddy-global/hy4-preview-f。
- 独立复核尽量另一模型家族：DeepSeek实现选HY4复核，HY4实现选DeepSeek复核。
- 两路Global目录均标x0.00；不保证无限额度或永不限流。原CN workbuddy/hy4-preview x0.29不能当免费Global入口。
- 本轮未调用付费子模型。复杂专项或免费线路失败需向Codex说明原因、范围、当前证据及升级方案，由Codex裁定。
- 主监督使用GPT-6.1 Sol属于用户明确选择；日常机械操作仍交免费子代理。
- 额度耗尽或路由不明不无限重试、不自动付费回退；也不凭时间猜额度恢复。

## 工作目录与范围
- 登记根D:/Narraverse-World-Map仍为旧A1，stickman-engine.js有他人修改，保留且不读取。
- 施工树D:/Narraverse-World-Map/hds-runtime @ codex/world-runtime-d3-hds；业务基准3394a53，源自M4的115e256；本团队规则为其后的文档提交。
- 本次新监督对话仅纯文字建队，没有读取项目文件或导入旧私有源码历史。每次业务派工另给精确读写范围、SHA、验证和停止点。
- 排除.env、凭据、真实运行数据、浏览器数据及无关项目；不直接改.git内部。
- 同一文件仅一名代理写入，独立任务才并行；不同时改测试与生产来消除独立性。

## 短派工与纠偏
任务卡：目标/合同、目录分支SHA、明确输入与读写文件、执行者与模型、独立预期/验证命令、预算及停止点。
通常一单10–20分钟，单/双文件切片优先；复杂任务先拆分，不为消耗免费额度制造空任务。
默认只验证改动及直接影响；相同已通过字节不重跑。时间调度、重演、存档公共底座才扩大验证。
独立验收按合同手算或独立事实，不能反抄实现、弱化断言、跳过必需门槛凑绿。最终裁定归Codex。
同一问题三轮无实质进展停止重复排障，提交目标、改动、失败原因、已试方法、证据、Git状态及最小下一步。
切模型在安全检查点，保存合同/SHA/未提交归属/证据/剩余工作；不强制中断写入，不假定换站点隐藏状态继承。
权限或能力不足提交具体操作、路径、原因、风险和替代方案给Codex，不自行扩权或无限等待。
子代理和监督者不擅自提交/push/main/部署、删除、改配置、扩大合同或访问凭据。

## 能力验证与当前停止点
- 已验证：Relay新建监督对话、主模型选定及用户界面确认、原生子代理创建和纯文字ACK、监督者明确接任。
- 配置支持未完全验证：子代理effectiveModel/实际计费；原ID续用；实际代码/工具/前端任务稳定性。
- 未实现：自动复杂度路由系统、配额探测/回退、实际成本统计；本轮不修改HDS配置或开发这些平台能力。
- 模型元数据矛盾由用户界面确认主路线后不再排查；不拿该字段推断真实子代理路由。
- 本轮完成团队建立和监督约定，等待Codex下一份有界施工任务；D3未实现。

## 证据
建队runId 9ced6262-5016-499a-bc88-14ad77159ec6；元数据核对e4e13dac-6aa7-4415-ad08-7788e8b8aa91；监督接任9b8da22d-f4ba-48ac-9d98-785459158c3b，均终态succeeded。
本地机器结果artifacts/dsh-team-setup-20261011/team-setup-result.json，用户原方案同目录user-scheduling-plan-v1.txt。

## 首单实测与过渡执行方式
- D3-1：Global HY4独立测试/fixture修正，Global DeepSeek实现，中控标准命令14/14；代码8478bce，仅预留守恒纯内核，完整D3未接入。
- 首个原生子代理4e6c0ac1-cadd-4141-aa25-3fa376139423状态脱钩并迟到写hds-runtime；该树保留不整合，不抢写、不删除。
- 隔离交付树D:/Narraverse-World-Map/hds-reservation @ codex/world-runtime-d3-reservation；两个独立Relay执行对话有稳定runId和终态，不能伪称原生子代理。
- 原监督run显示succeeded而session仍running，原生steer拒绝terminal、cancel返回无操作；只读复核无法派发。最后验收由Codex独立完成，尚未修复HDS平台状态。
- 在原生通道修复前先用Codex原生Relay持续监控短执行会话，不在状态未知的工作树重试，也不自动开启更多并行链。
