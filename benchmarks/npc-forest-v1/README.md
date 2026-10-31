# 当前森林HTTP对话开发集

fixture8，3场景12轮。全部经历由真实worker与HTTP普通命令建立；预览不写世界，明确确认才提交交谈，旧口述不成为事实记忆。场景含真实采集磨损、归还、目击破坏、修理、逾期、道歉、跨日与存档重开。

```sh
node scripts/evaluate-forest-dialogue.mjs --mode plan --case all --out artifacts/forest-dialogue/my-plan
node scripts/evaluate-forest-dialogue.mjs --mode controlled-test --case all --out artifacts/forest-dialogue/my-protocol
```

plan零模型调用，只验证场景与恢复。controlled-test用测试回复验证生成/确认、同ID重试及重开后的已提交交谈重试；它不访问模型服务，也不评判语言质量。两者均新建合成档，不读.env或真实档，输出目录必须不存在。

live必须显式提供本项目进程内NPC_LLM配置、`--mode live --case all --allow-model-calls --max-requests 12`（单场景选其id、4请求）。本轮总投入最多16：初次12，必要修复重测最多4；不自动重试，不把历史单轮上限当永久用户限制。当前限定deepseek-flash、thinking关闭。

`report.json`/HTML/完成回执含当前源码SHA、实际发给模型的受限上下文、有限用量诊断、自动协议/来源检查与真人待审项。单独oracle来自合成档的真实状态，仅用于评审，不发送给模型。尤其要检查未见的工具磨损：模型应依猎人所知，而非oracle作答。

自动通过不等于语义通过；受控测试不等于真实模型。原始失败不可覆盖，fixture5旧样本不当作当前fixture8实测。
