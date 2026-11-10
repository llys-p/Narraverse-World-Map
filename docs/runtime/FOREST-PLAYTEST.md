# 森林试玩候选4（2026-11-10）

从 `Start-Forest-Journey.cmd` 进入，或用 `Start-Forest-Journey-New.cmd` 新开一局。猎人把眼下的工具耐久与真实发生的修理分开。问「工具现在还有多少耐久？」时，系统只接受无行动建议的对话预览。说「我现在要帮你修理这个工具」可以预览修理建议，另点确认才会动手。把耐久问题和明确的修理或借用请求说在一起时，仍可得到相应建议。

首轮 6 次真实生成中，猎人对原帮修问法没有提借用，也直接答出了目击到的行为人。有一条耐久问句却附带了修理建议，另有交换回复把 40 点说成「四成」。[真实原报告](../evidence/forest-repair-language-20261110/initial-live.html) 保留这些原话。

修正后，82 项回归和 6 轮受控 HTTP 通过。本机 Chromium 用受控回复验证了预览、单独保存交谈、另行确认修理和同档重开，也在关闭模型的情况下完成六阶段森林旅程。[复验证据及源码指纹](../evidence/forest-repair-language-20261110/verification.json) 记录了本次结果。修正后真实模型回归、真实模型表单、真人试玩、Windows 双击、真手机和读屏仍待验。

接手时从 [草稿 PR #47](https://github.com/llys-p/Narraverse-World-Map/pull/47) 的 `codex/forest-dialogue-continuity-20261103` 继续。改动集中在私有对话投影、Provider 提示与输出校验。真实模型复验按[任务合同](../../tasks/FOREST-DIALOGUE-CONTINUITY-TASK.md)中的剩余范围，使用独立合成档和本项目进程内的模型配置。

## 前次验收（2026-11-05）

### 给玩家

入口是 `Start-Forest-Journey.cmd`，另开新局用 `Start-Forest-Journey-New.cmd`。这轮重点是让猎人分清你说了什么和实际发生了什么。玩家只说“带回来了”时，实测猎人回答工具仍由玩家持有；实际交还后，它才确认接回并看到耐久。隔天重开，它仍记得已归还。另一场景里，玩家否认破坏、随后帮忙修理，猎人仍记得原先目击的破坏，也知道只修了一部分。

逾期回归保留了真实的旧错误回复。猎人这次主动纠正：约定借一天（1440 分钟），实际借到归还 1470 分钟，迟还 30 分钟。跨日重开后这些时长不再变化。

**自然对话的操作流程已用真实模型跑通。** 在 Chrome 输入“我现在要帮你修理这个工具”，生成预览不写档；确认交谈只保存双方说的话，耐久仍是 60；另点行动确认后才修到 80。重开时保留原对话和修理结果。

目前仍需真人试玩。最后的浏览器回复会多说没有发生过的旧修理，又把帮忙拐到借用，个别回复也有归还人称错误或没有直接回答是谁砸的。Windows 双击启动、真手机与读屏未验。Linux/Windows 的自动浏览器玩法验收不等于这些实机体验。

### 给接手 AI

- 仓库 `llys-p/Narraverse-World-Map`，独立草稿 [PR47](https://github.com/llys-p/Narraverse-World-Map/pull/47)，续接 PR46 `433fc5248197b9012620d08a36c412f9c177f99d`。远端分支 `codex/forest-dialogue-continuity-20261103`。实际被测源码 `9daf36a609530bd0d314d6788de0afc2c7ab1359`。
- 当前隔离工作树 `/workspace/scratch/d4eebd62b5b0/Narraverse-Forest-Recovery`，本地分支 `codex/forest-dialogue-recovery-local-20261105`。如工作区清理，从远端恢复；不要复位旧 `Narraverse-Forest-Dialogue` 的 PR46 暂存内容（index 树 `7ee38e9ccc26df5c29721621df972572f06b9f44`）。
- 本次生产改动只有 `runtime/service/npc-language-provider.mjs`：向现有 system 说明补充程序派生的本轮可知持有人、耐久、普通借用三个时长；不传入玩家原话、旧 NPC 回复或隐藏世界事实。继续自由生成，不替换台词。客观记忆、世界规则、动作确认和存档格式不变。候选仍为 fixture8、192 份游戏文件、端口 18356。
- [本次证据索引](../evidence/forest-dialogue-recovery-20261105/index.json)：77 项不同回归；三组各 4 轮 live HTTP（借还、目击破坏、旧错纠正）均通过自动协议、确认幂等、世界重放与保存恢复检查；三份原始 JSON/HTML 与完成回执可复核。程序在干净源码 `9daf36a` 上实测。公开证据不包含合成存档。
- [双平台 CI 41963305835](https://github.com/llys-p/Narraverse-World-Map/actions/runs/41963305835) 是实际 Linux/Windows Chrome 六阶段玩法，模型关闭。另一个浏览器脚本在本地 Linux Chrome 上有一条受控对照和一条真实模型记录。真实模型仅 1 次，不把受控回合计入。相同结论只计一次。
- 本轮 13 次 DeepSeek Flash 生成，thinking 关闭，无自动重试。HTTP 12 轮报告用量合计 50,381 输入、892 输出 token；浏览器那一轮未采集用量，不能用这两个数估全轮账单。原 4 轮错误基线见 [baseline-borrow.json](../evidence/forest-language-recovery-20261103/baseline-borrow.json)。更早维护前 20 次原报告丢失和恢复后两次 503 的历史在 `docs/evidence/forest-continuity-20261103`，旧核验脚本用当时源码，不适用于当前候选。
- [助手逐句检查](../evidence/forest-dialogue-recovery-20261105/assistant-review.json) 与自动协议结论分开，真人评审保持 pending。特别不要把浏览器的操作 PASS 当作回复无事实错误。

```sh
git switch --detach d333071 # 在单独检出中核验这批历史证据
node scripts/check-forest-dialogue-recovery-evidence.mjs
node scripts/verify-forest-dialogue-browser.mjs controlled-test artifacts/forest-dialogue/my-new-browser-test
node scripts/evaluate-forest-dialogue.mjs --suite continuity-v2 --case borrow-return --mode controlled-test --out artifacts/forest-dialogue/my-new-borrow-test
```

浏览器测试需将 `DEMO_BROWSER_EXECUTABLE` 指向可运行的本机 Chromium/Edge。真实生成需要显式 live 和预算开关，凭据只进进程。逾期纠错必须继续原 `artifacts/forest-dialogue/live-01/report.json` 的合成档副本；先核验完成回执、原末态与历史，不编辑原档。若以后原合成档不在，不能伪造为同一段真实错误历史。
