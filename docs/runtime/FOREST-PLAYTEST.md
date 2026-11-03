# 森林试玩候选3：简短交接（2026-11-03）

## 给玩家

统一入口仍为Start-Forest-Journey.cmd。本轮修正了普通借用的时间理解：NPC此前把借出至今的总时长当成逾期；现在按实际到期时间计算，并在归还后固定逾期时长。修复复测中，未归还时20分钟、实际归还时30分钟，跨日、重开和道歉后仍保留30分钟。

本轮还验证了口头声称与实际归还的区别，以及亲历破坏、玩家否认和后续修理的区分。世界动作、关系和客观记忆继续由规则决定，语言模型不能直接改写它们。

定向回归70项通过，Linux/Windows实际浏览器完整旅程通过。模型本轮共16请求；覆盖11个不同问法，归还后次日追问仍未调用。少量措辞与话题问题仍待审，不能说NPC语言已全部验收。Windows游戏cmd双击、真手机、读屏及真实模型浏览器表单端到端体验也仍待验。

本公开交接不包含原始模型对话、内部报告、存档或截图。完整本地交接与证据保留，尚未公开。

## 给接手AI

- 仓库llys-p/Narraverse-World-Map，草稿PR46；分支codex/forest-dialogue-acceptance-20261101，父PR45 a272484c0e74f4079bb11259e721b57abc4b89fd。修复代码66eb0a21a710988b4e50b518906dfd5fff23e5f8。
- 当前候选3，fixture8，入口与18356端口不变。生产改动为普通借期共享常量、private knownFacts.simpleLoan派生说明和有限引用提示；没有复制或导入2.0、修改存档格式、截断未知引用或自动重试模型。
- 借期事实只从仍保留且本轮提供的typed实际借出/归还经历派生，旧交谈或缺失来源不补造记忆。实际归还后不再累计逾期。
- benchmarks/npc-forest-v1/cases.json是自写开发场景，不是独立金标。脚本scripts/evaluate-forest-dialogue.mjs的plan模式零模型调用；controlled-test仅验证协议，不代表真实语言质量。live需要显式配置与调用标志，密钥不得落盘或提交。
- 可复跑零调用计划：node scripts/evaluate-forest-dialogue.mjs --mode plan --case all --out artifacts/forest-dialogue/my-new-plan。输出目录必须不存在，不读真实档。
- 代码提交的两端浏览器CI：https://github.com/llys-p/Narraverse-World-Map/actions/runs/41226497989 。浏览器旅程关闭模型，与真实模型HTTP专项分开记录。
- 本轮16请求已经结束。1个预定问法未调用，人工语义仍pending；不要把15条协议接受的回复当成全部事实正确。原始失败和完整证据未随此公开摘要发布，不应假定它们已在仓库。
- 下一项先补未测问法、长对话纠错和角色口吻，再做真实浏览器自然对话及真人体验。冻结新支线/性能优化，停独立草稿，不合main、不部署、不迁移真实档、不启停旧实例、不导入2.0。
