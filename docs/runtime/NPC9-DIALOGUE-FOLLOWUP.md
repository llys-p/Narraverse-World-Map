# NPC9：输出诊断、协商建议与新记忆评测

2026-10-25（Asia/Shanghai）。依据用户提供的NPC8交接，从 `a63e4cbda0b9ed2ae6c108265c8fea4671546a39` / 草稿PR #16建立 `codex/npc9-dialogue-followup-20261025`。2.0仅作设计参考，本轮未复制或导入其人物记忆。旧工作树的未提交补丁保留，未用它覆盖NPC8。

## 功能变化

Provider失败时仍拒绝草稿，不放宽JSON、引用、字段或签名规则；新增安全诊断帮助定位失败。`getMetrics()`和评测JSON/HTML保留固定的 `failure.stage/reason`、白名单 `finishReason` 及内容字节数，不保存无效上游正文或推理文本。HTTP状态和有效usage继续保留，HTTP200不等于对话有效。用户页面仍显示安全通用错误，不展示内部诊断或原始响应。

| 类别 | 示例reason |
| --- | --- |
| 请求/传输 | network-error、timeout、http-error |
| 响应解析/完成 | response-too-large、envelope-json、choice-missing、finish-reason、content-type |
| 最终内容 | content-too-large、content-json（包括重复JSON键） |
| 字段契约 | output-fields、reply-field、memory-refs-field、proposal-field |
| 引用/建议 | unknown-reference、terms-outside-known-options、question-has-action、explicit-intent-missing-proposal |
| 草稿 | payload-field |

历史NPC7的HTTP200无效回复没有足够原始证据，本轮不能追溯判定它具体属于哪类。

协商计算提取到 `runtime/core/npc-negotiation-terms.mjs`，实际世界与Provider候选共用修理量/借期计算。模型只能提出当前已知条件对应的候选，例如初始耐久60、信任50时，需要修40点，借期可6或12小时；不能再签出20点修理或24小时的建议。工具未知、不可用、关系拒绝、已有进行中约定或所需知识不完整时，不签出新协商建议。候选不表示距离/当前资产/未来关系已经批准，实际提交仍重新审核。

完整句式提示增加了明确修理换借用。识别到可协商却缺少协商建议、询问旧条款却附动作、明确动手修理却没有help，均拒绝该次输出并留下类别；不自动补写proposal、不替模型编造回复、不执行行动。否定、引语、转述、过去完成和追加多动作没有通过删词凑成这类提示。

这些提示是有限句式。未识别的表达仍交模型理解，纯自然语言中的错误承诺尚没有通用事实校验；即使建议字段有效，reply仍可能说错或跑题，必须保留语义复核。

新入口 `--suite memory-v1` 真正创建fixture5，8场景17轮，并在报告明确标注世界版本。原默认 `dialogue-v1` 仍为fixture4；新例说明见[场景集](../../benchmarks/npc-memory-dialogue-v1/README.md)。确认说话后增加事实经历不变检查；真实动作仍由场景脚本预先指定，模型建议不被自动执行。

## 验证及证据

本轮外部模型调用0。定向覆盖原记忆/社交/协商/地图/Provider、真实本机HTTP worker保存恢复、输出分类、候选与签名、fixture5评测、容量遗忘。初始诊断回归2项均在旧代码上失败，分类实现后通过；日志保留。早期61项合跑及两个补充检查通过后，复查收紧了“不完整知识也不可提议”的边界，再以最终源码完整合跑。最终 **63/63通过**（原相邻54、新增9），0 fail/skip/cancel/todo，exit0，无超时，95,125.198ms / 360秒硬限。见[证据索引](../evidence/npc9-dialogue-followup-20261025/index.json)。

新fixture5计划8场景17轮、零调用、8个世界重放通过；受控17轮全部保持语义待复核。真实本机HTTP的截断回复在JSON/HTML报告中留下finish-reason分类、HTTP200和usage，后续2轮被阻塞，原正文/推理/凭据未写入报告。记忆容量测试使用明确标注的合成观察，验证新帮助保留与淘汰细节拒绝引用；不是长历史真实游戏或外部模型测试。

提取世界条款算法后，与NPC8干净基准对照fixture1～5各初始及行动后完整bundle，共10处SHA一致，所有最终状态通过完整重放。NPC8原54项与NPC6/NPC7真实失败记录原样保留，新证据不覆盖历史哈希。

```sh
node scripts/check-npc9-evidence.mjs
```

该检查器核对本轮源码/日志/fixture5计划/旧世界比较，并核对历史证据字节。NPC8原检查器仍对应它的历史提交，应在干净 `a63e4cb...` 检出上运行；本候选修改源码后不能用旧哈希宣布新版本通过。

## 下一步与限制

准备好明确的新请求预算后，优先用fixture5新例复测初次协商、纯条款问询、记忆更新及无关话题承接；分类诊断用于区分格式错误和语义错误，不把拒绝输出算模型成功。角色自然度、真实模型使用这些候选的可靠性、付费与性能尚未验收。

没有合main、部署、启停日常实例或迁移真实存档；默认模型入口仍关闭。Linux / Node v24.22.1，真实浏览器和Windows启动器未验。控制树/Projects待主线复核，本片交独立草稿PR。范围及停止点见[任务合同](../../tasks/NPC9-DIALOGUE-FOLLOWUP-TASK.md)。
