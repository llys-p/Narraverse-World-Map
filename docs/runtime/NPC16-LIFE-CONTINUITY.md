# NPC16：决策理由、跨日连续性与预览恢复

2026-10-26（Asia/Shanghai）。基线NPC15 `e7bfd1c8c56c943a2ee97cef1288eedd41c29304` / 草稿#23。用户同意连续推进的计划后，本片完成对话依据、连续场景和实际流程三项工作。外部模型调用0次。

## 给用户：变化与边界

猎人的私人对话资料新增本人最近一次已记录决策的有限理由。例如实际工作是为了获得买粮收入、实际选择购买、该次只记录等待。仍区分当前余额、当前行进准备、旧步骤和已执行结果。原NPC13中赠粮后编造缺钱或等工作的解释，不能靠“等待”得到支持；本片不给WAIT补造原因。

新增life-v3，4场景28轮，前三个连续场景各8轮，最长到tick576（第4次日结），覆盖工资、重复购买与现金耗尽、赠粮暂停及跨日恢复、工具损坏修复与工作恢复、换话题后再追问。第四场景保留库存与饥饿分离的4轮反例。schema3才允许每场景8轮/tick576，旧schema1/2仍4轮/tick288，总请求上限仍32。

实际复现并修复了页面状态缺陷：服务重开且关闭自然对话后，同修订的旧预览仍可点击确认。现在确认预览同时要求服务报告对话启用；普通已确认行动建议仍按原世界规则处理。世界变更或关闭人物卡后，迟到响应也不能恢复旧预览。

原回复不被改写，旧错误与人工pending不变。新增的正确受控回复来自测试夹具，证明接线、状态和协议机制，不证明真实模型语言改善。因原8次授权已完成，本片未用历史密钥或追加付费请求；下一次真实复测需新的明确预算。

## 给接手AI：实现与复现

- `runtime/core/npc-life-context.mjs` 仅在本人lastDecision/lastOutcome已按actor和decisionId配对后，取action/tick/reasonCode生成可选decisionBasis。Provider边界重建白名单，必须与合法lastResult的action/tick一致，未知代码、未来/错配记录或额外字段均丢弃。没有加载候选、knowledgeFingerprint、他人数据或重跑规划器；不写入世界/存档或公开投影，不增加memoryRefs来源。
- `runtime/service/npc-life-facts.mjs` 派生reason的自然语言说明，所有原因只描述该次决策时的可知条件。relationToPreparation只有在无改道、旧意图等待更新且行动/时间相符时为same-record，其余historical。任何理由均不证明当前准备的完整原因、未来机会或执行拒绝原因。WAIT尤其只表示等待；不将当前粮1和过去需求判断混为一谈。
- `runtime/service/npc-language-provider.mjs` 增加上述时序与未知边界的提示，保持原输出验证、签名、32KiB输入、900输出token上限和显式调用预算。真实回复不自动拦截、重写或重试。
- `runtime/evaluation/npc-dialogue-eval.mjs` 支持schema3的有限时间/轮次扩展，新增lifeDecisionReason前置断言；rubric不进入模型。CLI支持 `--suite life-v3`，其他集合和默认项保留。
- `demo-npc-dialogue.mjs` 仅收紧canCommit的服务启用条件。真实HTTP/worker回归通过模拟“服务已生成但响应丢失”，确认同requestId重取不再调用，预览零写入；显式确认一次保存，重开后同DTO恢复且文件SHA不变，私人理由可重建且不写入存档。

离线入口：

```sh
node scripts/evaluate-npc-dialogue.mjs --suite life-v3 --out artifacts/npc16/example-plan.json
node scripts/check-npc16-evidence.mjs
```

输出路径须不存在。四场景28轮是公开开发回归，非盲测、独立金标、长期生存平衡或性能验收；世界仍只有原有有限工作机会。未做真实浏览器外观和Windows启动验收。

## 本片验证与交接

最终113项不同检查（相邻105、新增8）分组通过：63/63，98,217.740ms / 600秒；48/48，227,634.354ms / 600秒；新life-v3另2/2，100,899.989ms / 360秒。均0 fail/skip/cancel/todo、exit0、无超时。两组合跑及28轮受控测试对应的360份代码/配置/测试字节交付前保持不变，不用早期运行冒充最终源码验证。

独立plan最终新路径串行运行并在进程内、进程结束后分别复读JSON：completed=true、28轮前置全部通过、4世界完整重放、0调用，95,894.790ms / 360秒。旧fixture1–5初始/行动后10处完整bundle与NPC15一致、均完整重放通过，11,082.747ms / 180秒。父树NPC15原检查器复验通过，全部历史证据保留。

保留的失败：理由接线前2/2失败；首次接线后11/12（测试直接修改冻结bundle，被只读保护拒绝，改为明确合成克隆）；页面可用性1/2失败后修复；首套新场景有一轮错误地预期工作后已经购买，修正fixture断言；HTTP流程初测使用过宽的“任何reasonCode不得公开”断言，而既有公开动作已包含该通用字段，收窄为新增私人字段，不改公开投影。原测试/场景快照与日志均保留，后续最终组覆盖修正。

一次独立plan的日志返回完成，但外部复读文件仍为14轮中间进度、completed=false；原因未定位，不宣称修复了写盘问题，也不把该文件作为完整证据。保留该文件SHA及脱敏中间摘要；在其他运行全部结束后，新路径串行重跑，并同时检查进程内与结束后的完整文件，两次复读均通过。导入评审原有completed要求继续拒绝中间报告。以上耗时是本次机器记录，不作为性能基准。

任务合同见 `tasks/NPC16-LIFE-CONTINUITY-TASK.md`，新证据目录 `docs/evidence/npc16-life-continuity-20261026/`。

停于叠在#23的独立草稿，不合main、部署、迁移真实档、启停日常实例或导入2.0记忆。当前连接无Projects操作能力，控制树/Projects待同步复核。
