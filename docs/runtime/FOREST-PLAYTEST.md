# 森林试玩候选3：真实对话与跨日记忆（2026-11-01）

## 给玩家

**这轮把当前森林的自由对话接到了真实经历上，并修正了一个实际算错时间的问题。** 游戏入口仍是 `Start-Forest-Journey.cmd`；另开新局用 `Start-Forest-Journey-New.cmd`，不增加支线。

本轮真实对话中，猎人能区分“说带回来了”和“真正交还工具”，也没有凭空知道玩家在森林里造成的磨损；实际收回后才知道耐久70。玩家否认亲手砸坏工具时，他仍坚持亲历记录，之后实际修理也不会把旧事抹去。

发现的主要错误是：猎人把“借出以来1460分钟”当成逾期，实际只晚20分钟。现在给普通借用补上程序核对过的时间说明，修复后的真实回复依次为：到期后20分钟；实际归还时晚30分钟；道歉后仍记得30分钟；跨日、重开后仍是30分钟。语言由模型生成，物品、修理、记忆和关系仍由世界规则决定。

| 当前门槛 | 本轮结果 |
| --- | --- |
| 森林真实模型HTTP流程 | 16次请求，15条协议接受并保存；失败也保留 |
| 普通借期理解 | 原1460错误保留；修复后4轮20/30/30/30 |
| 亲历、否认、修理与跨日 | 4轮真实对话保持经历与后续修理并存 |
| 客观状态边界 | 核对15条实际交谈落盘前后，未把说话变成行动或客观记忆 |
| 定向回归 | 70项不同检查通过，无跳过 |
| Linux/Windows浏览器完整玩法旅程 | 两端通过；本组关闭模型 |
| 真实语义、真人体验 | 仍待人工评审 |

预定12个不同问法，实际11个得到过可接受回复；“归还后次日追问”因前轮失败阻塞，本轮没有调用模型。另有“修好了”用于部分修理、提到“系统里确认”、无必要提“小偷/别瞎猜”等措辞问题。它们没有改变世界，但还需要改善，不能把协议通过说成NPC已经完全智能。

下一步应补这个未测问法、检查旧错误话术能否在更长对话中纠正，再做真实浏览器自然对话与真人试玩；Windows游戏入口双击、真手机和读屏仍待验。继续冻结新内容。

## 给接手AI

### 分支与实现

- 仓库llys-p/Narraverse-World-Map，草稿[PR46](https://github.com/llys-p/Narraverse-World-Map/pull/46)，父PR45 a272484c0e74f4079bb11259e721b57abc4b89fd。分支codex/forest-dialogue-acceptance-20261101，工作树/workspace/scratch/d4eebd62b5b0/Narraverse-Forest-Dialogue。
- 修复代码66eb0a21a710988b4e50b518906dfd5fff23e5f8，后续提交只收证据/交接/核验工具。候选清单docs/runtime/forest-playtest-candidate.json，候选3，192份游戏文件，fixture8与18356端口不变。
- 生产仅修改runtime/core/npc-social.mjs、runtime/service/npc-dialogue-grounding.mjs、runtime/service/npc-language-provider.mjs。前者只把既有144刻借期提成共享常量；普通借用规则、世界状态和存档格式没有变化。
- knownFacts.simpleLoan只从NPC仍保留的typed lent/returned亲历派生，且来源必须在本轮给模型的资料中。没有有效借出来源、来源未选中、只剩旧交谈、拒绝借用或不明持有人时不编造。正式协议较新时不拿旧普通借期冒充。计算到期后分钟，实际归还后固定，旧回复不能覆盖。
- Provider只新增准确时间与引用优先级说明，没改写模型回复、没有截断引用或自动重试；超过3引用和未知引用仍拒绝。原记忆更新算法/公共契约/存档格式不变，未复制或导入2.0。

### 验收与复跑

```sh
node scripts/check-forest-dialogue-evidence.mjs
node scripts/evaluate-forest-dialogue.mjs --mode plan --case all --out artifacts/forest-dialogue/my-new-plan
node scripts/evaluate-forest-dialogue.mjs --mode controlled-test --case all --out artifacts/forest-dialogue/my-new-protocol
```

新工具只创建隔离合成档与临时端口，不读取.env/真实档。plan零模型调用；controlled-test用测试回复核对协议，不代表模型语言质量。实际模型必须显式配置本项目进程环境与live标志/足额预算，默认不调用模型。每场景独立world，普通动作经现有DTO，预览不写文件/投影，确认只保存一次交谈；同ID预览不重复调用模型，关服重开后已提交交谈的原DTO可重试。

`--resume-failed`只接受本工具artifacts/forest-dialogue内、带完成回执的fixture8真实失败报告；合成档必须仍停在那一轮，完整bundle哈希须相同。它不用于真实档迁移。原报告不改，在新输出目录记录重取；本轮同档重取保留了此前两轮真实交谈。

- 基准benchmarks/npc-forest-v1/cases.json为自写公开开发例，3场景12轮，不是盲测或独立金标。
- 70项不同测试包含Provider、事实边界、旧社交/协商、森林/信任支线、普通借期与费用入口保护；不与重复15项或历史49项相加。
- 当前候选实际[CI41226497989](https://github.com/llys-p/Narraverse-World-Map/actions/runs/41226497989)的Ubuntu24.04/Windows2022真实Chrome六阶段均通过。截图/存档不上传，仅日志文本/文件哈希；自然对话真实模型走HTTP专项，浏览器旅程模型关闭，不混成一个端到端结论。
- scripts/audit-forest-dialogue-saves.mjs对本轮合成档15条实际已确认交谈逐条比较落盘前后物品/关系/生命钱粮/任务/客观记忆，只读生成证据，不上传存档。这与完整世界重放审计分别记录。

### 模型结果、限制与接续

本轮deepseek-flash，thinking关闭，实际16请求（54686输入、1140输出token，按服务回报，不猜账单）。初测11，因一轮4引用被拒而阻塞1问法；未使用初测额度1用于原失败轮重新生成，另外4用于逾期修复。无自动重试，本轮已结束；这是助手投入安排，不是用户永久调用上限，后续仍按用户低成本授权与有界任务推进。密钥未写入文件/日志/提交。

证据docs/evidence/forest-dialogue-20261101：live-01保留原始错误与拒绝，borrow-retest为原失败档的1次重取，overdue-retest为修复后4轮，JSON/HTML/完成回执与源码绑定。baseline-evaluator.mjs与初测脚本原SHA完全一致，parent-candidate/helper来自PR45；旧候选核验在干净父树运行。assistant-review.json是助手意见，原humanReview与semanticVerdict始终pending。不要写成12个真实问法全部通过，也不能说15条接受的回复都没有事实错误，初测有三轮沿用1460。

下一项集中补borrow-return/next-day，旧错误对话的持续纠正，以及角色口吻中“系统/小偷”等无根据话题；再做真实浏览器自然对话和真人体验。不要把待验当完成，不扩支线/重做整套记忆或回到性能优化。保持独立草稿，不合main、不部署、不迁移真实档、不启停旧实例、不导入2.0；GitHub Projects缺写入能力待同步。
