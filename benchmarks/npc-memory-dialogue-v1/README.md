# 新记忆对话开发场景

本场景集为 `schemaVersion:2 / fixtureVersion:5`，8场景17轮，使用真实世界命令建立记忆；不是盲测或独立语义金标。原 `npc-dialogue-v1` 仍默认使用fixture4，历史样本和结果保留。

```sh
node scripts/evaluate-npc-dialogue.mjs --suite memory-v1 --out artifacts/npc9/my-plan.json
```

默认plan零调用、不读密钥。输出报告明确标注fixture5，每个场景在末尾执行完整重放。生成对话仍不执行建议；受控/真实对话确认后另核对没有把言语制造成事实经历。

| 场景ID | 重点 |
| --- | --- |
| repair-bargain | 可兑现候选、询问旧条款、口头谎称履约 |
| repair-progress | 明确现在修理、真实修好后仍待领取 |
| repair-denial | 实际修好与原先亲历破坏并存 |
| repeated-apology | 重复道歉不等于赔偿或原谅 |
| loss-return | 发现失物后实际归还，归还者不自动变成小偷 |
| fixed-lateness | 40分钟迟还，归还后等待也不增长 |
| no-action | 否定、引用和不谈修理的聊天 |
| false-story | 传闻只作为说过的话，不变成真实帮助 |

真实模型需要本项目配置和明确调用预算。仅在获得新预算后才运行live；指定完整新集需 `--suite memory-v1 --mode live --case all --allow-model-calls --max-requests 17`。单场景预算必须覆盖该场景轮数；repair-bargain为3轮，其余为2轮。没有自动重试，失败会阻塞同场景后续轮次。失败不因HTTP200而计成功。

报告中 `metrics.failure` 为固定失败类别，`finishReason` 是白名单值或other，`contentBytes` 是有界响应中最终内容的字节数。报告不保存被拒绝的原始上游正文、推理内容或凭据；可保留有效usage，未知用量不按零计。

容量与遗忘另由合成观察测试覆盖：新帮助在大量旧伤害之后仍被传给Provider，已淘汰事件不可引用。它们没有被伪装成这里的90次真实游戏操作或长历史模型实测。所有新例仍是公开开发回归，真实措辞、引用是否切题及角色自然度需要人工逐句核对。
