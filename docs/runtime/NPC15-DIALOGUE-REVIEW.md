# NPC15：对话事实核查与离线评审

2026-10-26（Asia/Shanghai）。基线NPC14 `7edfd75a17f39c86b600d2009f72fe6530ec9028` / 草稿#22。本片外部模型调用0次，生产Provider、世界决策、存档和页面没有变更。

## 能做什么

评测报告现在把协议/建议/引用/世界检查、有限数值核查和人工评审分开显示。不能再把automaticPassed当作语言正确。原始回复照常保留，报告显示每条已识别断言、记录值与差异；缺少断言或资料时明确未覆盖。HTML继续全部转义、无脚本/外链并保持CSP，导入的姓名和备注也只作为文本。

核查器只消费受限context.self.food/wallet。它识别一组完整、明确的当前表述（如“我现在有两份粮”“钱包里还有二十块钱”“现在没有粮”），支持有限中文整数和阿拉伯整数。“刚买一份口粮，眼下就剩这一份了”仅在紧邻前句明确以粮食结尾时识别一份指代；历史买入本身不当作当前库存。问句、引号（含未闭合）、转述、过去/假设、撤回更正等保守跳过；“几块”“一袋粮”、模糊数词或“一百二”缩略数值不猜测。

这不是通用语义裁判。它不检查停购完整原因、找工作、未记录的走访、所有否定结构、词法变体或全部资源；checked-no-contradiction仅指已识别数值相符，unassessed不是通过。输入报告中的本人状态是比较基准，不因SHA绑定而变成独立世界认证。生产Provider不会据此拦截、替换或修正回复；只有评测CLI在检测到明确矛盾时返回1并标明fact-contradiction-detected。原语义结论与人工pending保留，场景仍在显式预算内运行，不追加重试。

新[life-v2](../../benchmarks/npc-life-v2/README.md)使用4场景16轮真实动作：工作/购买/消费，1份与2份赠粮，工具受损改道再修好恢复工作，以及错误口述和饥饿/库存分离。每轮先核对前置事实，评审答案不进入模型。旧life-v1、memory-v1、followup-v1及默认旧集保留。

## 离线评审流程

以下命令只读取指定报告，不读取.env或配置Provider，不调用模型。原报告JSON/HTML不覆盖；目标文件必须不存在。

```sh
# 生成包含原玩家文本、回复、评审问题和绑定SHA的pending表。
node scripts/review-npc-dialogue.mjs --report artifacts/example/run.json --template artifacts/example/review.json

# 只用新核查器检查旧报告，另存JSON和HTML。
node scripts/review-npc-dialogue.mjs --report artifacts/example/run.json --out artifacts/example/audited.json

# 填完reviewer和逐轮verdict/notes后导入，仍另存JSON和HTML。
node scripts/review-npc-dialogue.mjs --report artifacts/example/run.json --reviews artifacts/example/review.json --out artifacts/example/reviewed.json
```

reviewer.kind为assistant、human或unassigned，label为自报名称。结论仅pending/pass/needs-correction；没有回复的轮次只能pending。先对照原HTML中的该轮受限上下文、实际前置回执和问题，再填写。模板的文本、回复、问题、轮次和SHA不可改；错误源报告、篡改绑定、重复/缺失轮次、无评审者却给结论、给未运行轮次判通过等均拒绝。

导入结果置于reviewImport和importedReview，不覆盖原humanReview或semanticVerdict。human也只是填写者自报，reviewerIdentityVerified始终false、independentHumanVerdict始终not-verified；助手判断不能冒充独立人工。all-replies-reviewed表示已填完回复的评审表，不是自动质量通过；存在未运行轮次仍标partial-coverage-reviewed。需要另一份评审时使用原报告，不能把已导入的派生报告当新的原件。最多4MiB输入、32轮；输出JSON或HTML已存在时保留旧文件，不留下预占的另一半。

## 本次验证

共105项不同检查分组通过：相邻90、新增15。其中100/100合跑，0 fail/skip/cancel/todo、exit0、无超时，512,324.092ms / 600秒；life-v2另3/3通过，102,091.605ms / 360秒。随后导入报告字段的两条实际失败回归得到修正：requestLimit须为0–32安全整数，复用渲染器也转义显示；相关8/8再跑通过，401.139ms / 120秒。未在两处输入修正后重复整套100项，原两份源码快照和精确差异保留，不把之前合跑冒充最终输入修正后的重复执行。

最终life-v2独立准备0调用、16轮前置全部通过、4世界完整重放通过，68,724.616ms / 240秒，来源指纹绑定最终代码。旧fixture1–5初始/行动后10处完整bundle与NPC14一致，均全量重放通过，32,867.659ms / 120秒。上述时间是本次机器记录，不是稳定性能基准。

首次缺少新核查模块的加载失败及两条输入字段失败原样保留，随后基本与扩展核查、评审错源/篡改/输出碰撞、超大输入和HTML转义检查通过。生产Provider、核心/服务/fixture及页面的差异检查为空，父树NPC14检查器复验通过。新[证据索引](../evidence/npc15-dialogue-review-20261026/index.json)与 `node scripts/check-npc15-evidence.mjs` 核验最终源码、分组结果、历史材料及输入修正范围。旧NPC13八轮只做离线重读，没有再次调用模型：明确库存矛盾1轮，识别数值未见矛盾2轮，其余5轮未覆盖；停购原因等既有3轮问题不能被这个核查器判为通过。原8次结果与语义needs-correction/独立人工pending不变。

## 交接

新模块为runtime/evaluation/npc-fact-audit.mjs、npc-dialogue-review.mjs，新入口为scripts/review-npc-dialogue.mjs，现有评测器新增分列核查与life-v2选择。任务边界见[任务书](../../tasks/NPC15-DIALOGUE-REVIEW-TASK.md)。停于叠在#22的草稿，不合main、部署、迁移真实档、启停日常实例或导入2.0记忆；当前连接无Projects操作能力，控制树/Projects待同步复核。
