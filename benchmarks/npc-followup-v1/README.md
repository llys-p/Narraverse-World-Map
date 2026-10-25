# 短追问与话题切换评测

fixture5，两个公开开发场景、八轮。`repair-followup` 从实际砸坏和一次修理开始，连续追问后转到无经历的赠粮话题；`false-topic` 从口头声称赠粮开始，短追问、天气问句，再次追问。回复由模型生成时必须逐条核查是否承接恰当、承认缺失事实、避免重复推销修理；自动引用检查不等于语义通过。

离线准备（零调用，不读取密钥）：

```sh
node scripts/evaluate-npc-dialogue.mjs --suite followup-v1 --out artifacts/npc10-followup-plan.json
```

plan不生成或确认交谈，因此后续轮的 `recallFocus.source` 可能为none。不能把这个计划当成连续对话验证；受控测试和获准live运行才会实际确认上一轮交谈形成锚点。

后续真实复测的具体范围：本集最多8次请求、串行、无自动重试；输入仅为fixture5临时世界的虚构猎人可知上下文及玩家原话，模型建议不执行，失败阻塞本场景后续轮。需明确新的调用授权、项目配置和金额预算后再运行，历史授权或旧密钥不复用。请求数不是金额上限；本片没有调用外部模型。

获准后的命令形态（本轮未执行）：

```sh
node scripts/evaluate-npc-dialogue.mjs --suite followup-v1 --mode live --case all --allow-model-calls --max-requests 8 --out artifacts/npc10-followup-live.json
```

使用新的输出路径，保留所有失败，不覆盖此前NPC6/NPC7实测。本集没有覆盖所有自然表述，拥挤窗口和遗忘源的机制边界另用明确标注的合成上下文测试，不能冒充真实长时间游玩或盲测。
