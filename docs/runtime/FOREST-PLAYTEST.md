# 森林试玩候选4：记忆续聊与借期表达（2026-11-03）

## 给玩家

入口仍是 `Start-Forest-Journey.cmd`，另开新局用 `Start-Forest-Journey-New.cmd`。这轮没有增加支线，集中修正NPC如何谈论已经发生的事：部分修理不能笼统说全修好；纠正旧话时不用内部刻数；约定借期、实际持有时长、逾期分别计算。

本次可核对的示例是：约定借一天为1440分钟，实际借出到归还1470分钟，晚还30分钟。归还后再聊天、跨日、重开，都不应把30分钟继续增加。说话仍由模型自由生成，世界物品、行动和客观记忆不由语言直接改写。

**代码已保存，真实语言验收仍有证据缺口。** 环境维护前实际做过20次请求，工具输出中可见次日归还、部分修理与旧错纠正结果；尚未上传的原始报告和合成档被环境维护回退，未能找回。已保留可从本次对话核对的失败摘录，明确标为观察记录，不能当原报告。

恢复最终代码后，74项回归再次通过；源码eab73a6的Linux/Windows真实Chrome完整玩法旅程通过。受控服务流程另作12轮验证，用来检查输入事实、确认、保存和重开，不能当模型语言能力。两次真实模型恢复请求均返回503，没有生成或保存回复，已停止追加。

仍有表达问题：有时主动补充“修理换借用”、聊钱粮时多说工具，部分措辞生硬。真人语义评审、真实模型与浏览器表单连起来的完整测试、Windows双击启动、真手机及读屏仍待验。

## 给接手AI

### 当前代码与目录

- 仓库llys-p/Narraverse-World-Map，独立草稿[PR47](https://github.com/llys-p/Narraverse-World-Map/pull/47)，续接PR46 `433fc5248197b9012620d08a36c412f9c177f99d`。
- 分支 `codex/forest-dialogue-continuity-20261103`；维护后工作树 `/workspace/scratch/d4eebd62b5b0/Narraverse-Forest-Continuity`。最终游戏源码提交 `eab73a6318d047de95f4792a7fc71ee1f952d6b7`；后续提交收证据/交接。
- 旧 `/workspace/scratch/d4eebd62b5b0/Narraverse-Forest-Dialogue` 被恢复为早期本地状态，仍有PR46暂存内容，index树为 `7ee38e9ccc26df5c29721621df972572f06b9f44`。不要重置或覆盖它；该内容已在远端PR46完整保存。
- 生产修改仅 `runtime/service/npc-language-provider.mjs` 和 `runtime/service/npc-dialogue-grounding.mjs`。新增 `knownFacts.simpleLoan.borrowedMinutes` 由原本可见的typed借出/归还经历计算；约定借期loanMinutes、实际持有borrowedMinutes、逾期overdueMinutes分别说明。无可靠来源时仍为空，不从旧回复补造事实。
- Provider收紧部分修理、人物口吻、当前库存与准备状态的说明；不替换回复、不截断引用、不自动重试。未更改世界规则、记忆更新算法、命令权限或存档格式。候选4仍192份游戏文件、fixture8、18356端口。

### 验证、维护事件与费用记录

- `node scripts/check-forest-continuity-evidence.mjs` 核对当前证据；输出明确保留语言门槛未闭合。证据目录 `docs/evidence/forest-continuity-20261103`。
- 维护后实际重跑74项不同回归，无跳过。历史/重复执行次数不累加。最终代码[浏览器CI41587465354](https://github.com/llys-p/Narraverse-World-Map/actions/runs/41587465354)的Linux/Windows均通过，关闭模型，不等于自然对话表单真实模型端到端。
- `controlled-*` 为维护后12轮实际worker/HTTP受控协议报告，绑定最终源码，具有JSON/HTML完成回执；不是模型答案。普通归还次日、40耐久部分修理、旧错历史中的1440/1470/30分别核对。
- 维护前20请求：初轮12、表达复测4、总时长修复复测4。源码642dc5a→a60d2f7→eab73a6已先行推送而保住；原始报告丢失。`maintenance-observations.json`仅从本次对话可见输出整理，标明notOriginalReport，不伪造源文件哈希、usage或完成回执。PR46已有原始1460错误记录仍完整。
- 维护后2次live请求均HTTP503，分别保存 `recovery-unavailable` 与 `recovery-unavailable-retry`；未生成回复、预览未改世界、合成世界重放通过。此后停止模型调用。合计观察到22次外部请求，后两次服务未返回token用量；不能猜费用，也不能称已取得22条回复。
- 两次503之后未换用受控回复冒充模型；humanReview持续pending。原20轮目前不能独立复核，因此不声称语言已全面通过。

### 如何继续

1. 模型服务恢复后，按新有界安排重跑continuity-v2的三个4轮用例；原20轮不能重建成相同报告。使用新的输出目录，每组完成立即保存证据。沿用用户授权的低成本DeepSeek、thinking关闭，凭据只进入进程。
2. 关注“归还次日追问”、部分修理、原错误历史持续纠正。逾期末问现明确区分约定1440、实际1470和迟还30；不能只看协议接受，逐句检查。
3. 随后完成真实模型浏览器表单全流程，并处理不必要的修理邀约/工具话题；暂不扩大支线或重做记忆系统。

```sh
node scripts/evaluate-forest-dialogue.mjs --suite continuity-v2 --case borrow-return --mode controlled-test --out artifacts/forest-dialogue/my-new-borrow
node scripts/evaluate-forest-dialogue.mjs --suite continuity-v2 --case witness-denial --mode controlled-test --out artifacts/forest-dialogue/my-new-repair
node scripts/evaluate-forest-dialogue.mjs --suite continuity-v2 --case overdue-denial --mode controlled-test --continue-from artifacts/forest-dialogue/live-01/report.json --out artifacts/forest-dialogue/my-new-correction
```

第三项需要旧工具生成的私有合成档，公开仓库不含存档。维护后已从旧工作树只读复制PR46原始overdue-denial合成档到当前工作树；源报告/末态须核验。工具只继续隔离副本，源档不变；不适用于真实玩家档。若以后该合成档丢失，只能重新建立相应实测，不能伪造原错误对话作为同一真实历史。

维持草稿，不合main、不部署、不迁移真实档、不启停旧实例、不导入2.0；GitHub Projects缺写入能力待同步。用户“继续”授权在此范围内自主修复与验证，不需要反复询问既有授权。
