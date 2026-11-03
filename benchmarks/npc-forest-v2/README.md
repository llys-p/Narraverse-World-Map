# 森林对话收尾开发基准

12轮作者自写用例，不是盲测或人工金标。借用场景沿用v1全部4问，补齐次日问题；破坏场景明确追问部分修理；逾期场景从v1真实错误对话的已完成合成档复制，检验纠错、转题、诱导和次日重开。

默认plan零模型；controlled-test为受控协议测试，不代表语言质量：

```sh
node scripts/evaluate-forest-dialogue.mjs --suite continuity-v2 --case borrow-return --mode controlled-test --out artifacts/forest-dialogue/new-borrow
node scripts/evaluate-forest-dialogue.mjs --suite continuity-v2 --case witness-denial --mode controlled-test --out artifacts/forest-dialogue/new-repair
node scripts/evaluate-forest-dialogue.mjs --suite continuity-v2 --case overdue-denial --mode controlled-test --continue-from artifacts/forest-dialogue/live-01/report.json --out artifacts/forest-dialogue/new-correction
```

最后一项需要先前评测生成的私有合成档，公开仓库不包含存档。源报告必须有完成回执，选中场景全部协议接受、停服且末态未改变。工具只在新目录继续副本，检查原档逐文件哈希；不适用于真实玩家存档。原报告中的语义错误仍保留，不能把其automatic-pass视为语义正确。

真实请求须live、显式case、--allow-model-calls、--max-requests 4以及进程内模型配置；禁止把凭据写入命令/脚本/报告。本轮合计计划12，必要失败复测最多4，不自动重试。humanReview持续pending，助手逐句意见单独保存。
