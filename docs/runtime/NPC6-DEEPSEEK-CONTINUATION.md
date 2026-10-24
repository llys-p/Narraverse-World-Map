# NPC6：DeepSeek 接口与中断续接

2026-10-24（Asia/Shanghai），接 NPC5 草稿 PR #13。截图里的后续代码没有出现在已确认的远端基准，本片重新实现并验证以下范围。截图只证明上次工作曾中断，不能证明某次模型请求、401 或模型评测已发生。

## 本项目配置

仍用 `Start-NPC-Negotiation.cmd` 和 NPC4 的确认流程。将下面字段填写在**本项目** `.env`；示例默认关闭，不能直接发起调用。密钥填本项目专用值，不放到 GitHub、浏览器或聊天里。

```dotenv
NPC_LLM_ENABLED=false
NPC_LLM_BASE_URL=https://api.deepseek.com
NPC_LLM_MODEL=deepseek-flash
NPC_LLM_API_KEY=
NPC_LLM_THINKING=disabled
```

取得真实调用范围后，再配置密钥并设置 `NPC_LLM_ENABLED=true`。程序不读取旧 `DEEPSEEK_API_KEY` / `LLM_*` 或其他项目凭据。换配置需要正常关闭本项目服务再重开。

2026-10-24核对 [DeepSeek 官方模型说明](https://api-docs.deepseek.com/quick_start/pricing) 与 [思考模式文档](https://api-docs.deepseek.com/guides/thinking_mode/)：当前 Flash 的调用名为 `deepseek-flash`，官方接口默认开启思考。这里面向短 NPC 回复明确发送 `thinking: {"type":"disabled"}`，仍用 JSON 对象、非流式与最多900输出tokens；没有实测费用或速度收益，不硬编码价格。

| 配置/服务 | 实际请求 |
| --- | --- |
| 官方 `api.deepseek.com`，未填思考设置 | 明确发送 `disabled` |
| 任意服务，填 `disabled` / `enabled` | 发送该值；兼容服务须自行支持此参数 |
| 其他兼容服务，未填或空值 | 不发送 `thinking`，保留旧协议 |
| 其他值，包括 `auto`、拼写错误、空格 | 创建 Provider 时拒绝，尚未调用模型 |

`enabled` 不提高900tokens或20秒预算，可能因为思考占用额度而截断。只接受完整最终 `content`；仅有 `reasoning_content`、空内容或 `finish_reason:length` 均拒绝，不将推理内容写入对话、报告或下一轮。

## 继续评测

默认离线运行仍是零外部模型调用：

```sh
node scripts/evaluate-npc-dialogue.mjs
```

明确授权和配置后，首轮可以选既有的一个开发场景、最多一次请求：

```sh
node scripts/evaluate-npc-dialogue.mjs --mode live --case unsupported --max-requests 1 --allow-model-calls
```

最初交付时这只是待授权示例；随后用户明确确认目的地、虚构上下文及1次上限，已执行一次本场景，结果见下方续测记录。未来调用仍须实际授权；`--allow-model-calls` 不能替代授权，请求上限也不是金额上限。完整场景、16轮和人工复核方法见[评测说明](../../benchmarks/npc-dialogue-v1/README.md)。

JSON报告的 `provider.thinking` 和每轮 `metrics.thinking` 表示请求设置，不是服务商确实遵守设置的证明。`metrics.httpStatus` 保留收到的状态；未收到响应为null。401/403表示接口拒绝该请求，仍使用既有 `MODEL_UNAVAILABLE`；报告不记录上游错误正文。失败消耗一次请求预算，相同ID/内容明确重试复用失败结果，不自动换模型、换密钥或重试。同场景后续轮次阻塞，覆盖不会被删除。

有效 usage 的输入、输出和总数继续核对；DeepSeek缓存命中/未命中计数必须都存在且相加等于输入量，才写入 `usage.inputCache`。缺失整份usage为null；出现不一致缓存字段时只有 `inputCache` 为null，仍可保留有效总量。无法由缺失数据推断零费用。

## 已验证的范围

初始交付用测试替身和真实本机HTTP验证请求、错误诊断、原预览/签名/确认/重开链，并运行全部离线开发场景。后续增加下面的单次真实接线；多轮语言理解、人物一致性、账单成本、稳定响应速度、Windows启动器和真实浏览器外观仍未验。没有读取真实存档或启停日常实例。

原有中文协议继续生效：生成预览不写世界；确认交谈保存说过的话；行动建议须另行确认，再经原有规则核验；说“已修好”不算履约，未知小偷不能成为目击事实。Provider变化不授予模型写资产或改关系的能力。

本片运行与源码指纹见[证据索引](../evidence/npc6-deepseek-continuation-20261024/index.json)。可在仓库根目录执行 `node scripts/check-npc6-evidence.mjs`，核对清单中的字节、SHA、日志计数及离线覆盖。本片到叠在 #13 上的草稿PR停止，候选待主线复核，不裁定整个 NPC 系统通过。

## 2026-10-24 单次真实接线

用户在明确官方目的地、虚构猎人上下文及1次上限后确认继续。`unsupported` 场景调用 `deepseek-flash` 成功，HTTP200；输入663、输出56 tokens，适配器墙钟6259.285ms。回复拒绝系统不支持的赠物与村庄转让，proposal=null；预览零写入、建议类别、引用及交谈不执行行动4项检查通过，世界重放通过。

助手逐句检查符合此例要求，报告仍保留人工复核pending。其他场景没有真实调用；一次接线不能证明讨价还价、否定/转述、旧伤记忆、未知小偷或多轮承接通过，也不是模型速度基准。凭据仅用于这次进程环境，未创建项目`.env`或追加自动调用。公开[汇总](../evidence/npc6-deepseek-continuation-20261024/live-smoke-summary.json)不含原始回复、完整上下文或密钥，完整报告另交用户。

## 后续多轮结果：需修正

用户继续后完成其余7个场景15轮，加先前1轮共16次；HTTP全部成功，自动约束14/16通过，8个世界重放通过。累计输入13470、输出1189 tokens。2个自动失败分别为纯问询误生协商建议、明确修理未给help建议。

助手逐句检查还发现自动检查漏掉的事实错误：持有人actor-2未被理解为NPC本人；亲历破坏被否认为目击；实际20分钟逾期说成两小时以上；未领取时暗示已借出。许多无关话题强行回到修理换借用。人工语义仍待复核，当前语言质量需修正。

[多轮脱敏汇总](../evidence/npc6-deepseek-continuation-20261024/live-multiturn-summary.json)记录问题与证据来源。完整回复另交用户。下一步先补明确身份/来源语义、程序派生时间与物品状态、询问和行动区分，再用新场景验证；本轮没有改提示词或追加重试。包装脚本第一次解析失败（0调用）与随后正常执行均如实保留。
