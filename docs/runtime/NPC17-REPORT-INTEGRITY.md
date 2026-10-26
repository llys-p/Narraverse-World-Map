# NPC17：长场景评审与报告完成核验

2026-10-26（Asia/Shanghai）。基线NPC16 `5f2b0c9f5fdaca3c1c8fdc39616a910d80821af9` / 草稿#24。本片外部模型调用0次。

## 给用户

修复一个明确断点：life-v3可以生成每场景8轮的28轮报告，但评审入口仍按旧的每场景4轮校验，因此不能生成评审表。现在支持每场景8轮，总数仍最多32；未运行的轮次保持pending，不能填写通过或不通过。

新报告同时生成JSON、HTML和 `.complete.json` 完成回执。只有最终两份文件关闭、重新读取并与预期字节一致后，才写入绑定SHA与字节数的回执；成功日志也在完成核验后输出。独立核验命令可发现缺文件、仍为中间进度或之后发生的内容漂移。离线评审会核对新报告的完成证明，派生报告也有自己的回执。旧报告仍可评审，明确标记legacy-no-completion，不补写旧证据。

这补上了上一轮发现的报告验证缺口；NPC16那次“日志完成而文件停在14轮”的根因仍未定位，本片不宣称已找到或修复根因。旧异常原SHA与中间摘要保留。本地SHA回执只说明文件在检查时一致，不是签名、独立世界认证或语言质量结论。

## 给接手AI

- 新 `runtime/evaluation/npc-report-files.mjs` 共用writer与verifier。wx独占预留三份路径，冲突时只撤回本次创建的文件；运行中回执为空，不能作为完成证据。progress写入保留，支持真实部分写入与缩短内容截断；零写、异常、超限或复读不符均拒绝收口。save失败后writer不能再完成旧内容。写入失败的中间文件保留，重跑用新路径，不自动清理证据。
- finish关闭JSON/HTML后逐字节复读，要求completed=true及completionProtocol=1，再写回执、关闭并经同一独立verifier复验。JSON限4MiB，HTML限8MiB，回执限4KiB；严格JSON与回执字段/整数/摘要校验。回执不接受任意文件路径，JSON/HTML/回执名都由指定JSON路径派生。
- `scripts/evaluate-npc-dialogue.mjs` 只有writer.finish通过后才返回或输出plan-ready等结果，source指纹新增文件模块。预算、模型配置、原回复、协议与有限数值检查保持原行为；未添加重试。
- `scripts/review-npc-dialogue.mjs` 对带completionProtocol或有回执的来源先核验，并检查消费的原JSON字节与核验SHA相同；旧来源标记legacy-no-completion。绑定原文/轮次SHA、人工pending及评审者独立性限制保持。模板仍只生成JSON；派生报告用共同writer并保留sourceFileIntegrity。
- `runtime/evaluation/npc-dialogue-review.mjs` 单场景上限由4改为8，总数32不变。没有增加Provider输入、事实引用、行动能力或存档字段。核心、服务、fixture、Provider与页面源文件均与NPC16相同。

```sh
# 离线准备，会产生JSON、HTML和完成回执；三个路径都必须不存在。
node scripts/evaluate-npc-dialogue.mjs --suite life-v3 --out artifacts/example/plan.json
# 只验证文件配对及完成，不调用模型或加载.env。
node scripts/verify-npc-dialogue-report.mjs --report artifacts/example/plan.json
# 核验新来源后生成28行pending表。
node scripts/review-npc-dialogue.mjs --report artifacts/example/plan.json --template artifacts/example/review.json
```

成功后文件仍可能被外部修改，再次核验会检查相对回执的漂移；同时改写全部文件与回执不提供防伪能力。对旧格式的兼容入口不等于认证旧文件的生成过程。当前没有事务式替换两个最终文件，完成回执作为是否可消费的最后标记；消费者仍须使用核验入口。

## 验证与交接

最终41项相关检查分组通过：工具/离线评审34/34（26,691.770ms / 360秒），life-v1/v2/v3另7/7（156,907.556ms / 360秒），共新增10项；均0 fail/skip/cancel/todo、exit0、无超时。367份代码/配置/测试字节在运行后保持一致。初始4/4回归在旧代码失败，随后接线10/10、故障注入等8/8通过；旧失败日志保留。

独立最终消费链93,202.784ms / 360秒：实际life-v3 plan零调用、28轮前置/4世界重放通过；原报告核验、28行pending模板、导入派生报告、两份完成回执均通过，源JSON SHA保持。进程结束后的独立复读再次核验两份JSON/HTML与回执。语义not-evaluated、原humanReview全部pending，独立人工not-verified。

生产核心、服务、fixture、Provider及页面差异为空，因此未重复上一片未变化的全部113项或10处世界数据对照；本片验证集中在改动的评测/评审生产者与消费者。NPC16原检查器在干净父树复验通过，全部历史证据保留；原异常文件再次离线读取仍是同SHA、14轮、completed=false，未被改写或算作本次通过。上述耗时仅为本机记录，不是性能基准。

任务书 `tasks/NPC17-REPORT-INTEGRITY-TASK.md`，证据 `docs/evidence/npc17-report-integrity-20261026/`。独立有界交付叠#24，不合main、部署、迁移真实档、启停日常实例或导入2.0记忆；当前连接无Projects操作能力，控制树/Projects待同步复核。真实模型语言、Windows与浏览器外观不在本片验收范围。
