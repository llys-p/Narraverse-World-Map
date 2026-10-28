# 借工具探路：续接与交接（2026-10-28）

## 给用户

第一章完成后，任务板增加可选委托“借工具探路”。接取后向猎人实际借到工具，带工具抵达森林，再按借期归还，最后在村庄领取“守约伙伴”称号。也可沿用协商修理换借用；必须实际领取工具，修好了不等于借到了。

入口是 `Start-Trust-Journey.cmd`，页面 `http://127.0.0.1:18354/demo-runtime.html`。新旅程包含原来的第一章；完成生计、帮助猎人和森林往返后解锁支线。人物卡里的实际按钮名是“请求借工具”“归还工具”，任务卡提供当前可见猎人的查看/走近入口。接取、领取和放弃仍在村庄进行。

工具只有一件，有实际持有人。偷抢、口头声称完成、接取前的旅行均不能替代这次借用；借出后的探路和归还分别记进度。期限用世界时间计算，实际归还也耗时。到期当刻完成归还有效，之后再归还仍会清掉持有，但任务失败，NPC保留失约经历。提前归还而未探路也会失败。放弃不替玩家归还，重新接取前须先还手中工具。

称号以完成任务状态表示，任务领取不额外发钱粮或关系分数。NPC关系与借还记忆沿用实际行动的结算，不会因领奖再增加，也不会删掉之前的伤害或失约。本轮没有另加通用记忆更新算法，也没有导入2.0人物资料。

本次与截图的关系：在可访问的GitHub分支和当前环境中未取得截图对应支线的源码/日志，因此以PR #39重新实现并独立验证。截图里的“12项通过”不计为本轮证据。

验证结果见下方及证据索引。真实浏览器画面、移动端/键盘/读屏、Windows双击启动、真人体验仍待验；本轮外部模型调用0次。当前规则不要求工具耐久达到新的额外门槛，也没有多人NPC传播、通用任务生成或新战斗系统。

## 给接手AI

- 仓库 `llys-p/Narraverse-World-Map`；父提交 `c5df3c8d69951545fa33e59707766c2295d3b9ed`（PR #39），分支 `codex/trust-journey-resume-20261028`。本轮树 `/workspace/scratch/d4eebd62b5b0/Narraverse-Trust-Journey`。任务合同 `tasks/TRUST-JOURNEY-RESUME-TASK.md`。
- 新profile `campaign-trust-village` / fixture7，沿用map5、service format11和原社会/协商/记忆规则。`playable-v2`有第五个任务 `hunter-trust` 与私有 `trustLoan`；公共playable view版本2，外层map view仍4。旧fixture1–6不迁移。独立档目录 `artifacts/trust-journey/world`，可用 `TRUST_JOURNEY_SAVE_DIR` 指定另一独立新目录；关闭输入 `quit` 等待 `stopped`。
- `runtime/core/campaign-trust.mjs`：只观察成功提交的 `ask-help` / `PlayerAgreement claim` 的 `lent` 结果，保存借出事件序号、tick和真实借期；实际携带到森林、同次真实归还分别推进。失败/放弃后仍记录实际归还来源，不改变世界债务。`campaign-play.mjs`负责解锁、领取和总期限。任务14天总期限保留，借出至归还期间显示更早的借期；按期归还后可在总期限内领称号。
- 公共投影只给借出、到期、探路、归还四个时间，不公开私有事件序号或NPC记忆模型。`runtime-playable-contract.mjs`拒绝无借用的进度、未来归还、错误版本形状。完整重放另核对真实来源，拒绝伪造eventSeq、时间、进度和fixture拼接。
- `demo-playable-goals.mjs`只消费已确认公共投影，借用失败/放弃仍持有时提示先还；可见人物入口复查当前状态。DOM替身与静态文件HTTP校验不能当作浏览器实测。
- `event-log.mjs`补齐旧fixture6也会实际产生的 `NpcPerceptionRecorded` / `NpcAgreementClosed` 版本白名单。原代码会把真实逾期事件误拒为 `Invalid perception source`；修复前失败日志保留。这是必要恢复兼容修复，不能声称此前失败的所有旧历史已逐一覆盖。
- fixture7接入原512条命令预算、原存档完整审计和既有重放复用条件；未放宽内容审计，不继续性能优化。本轮持续推进用户体验，不能重新进入已暂停的性能研究。

### 验证与可复跑入口

本轮所有测试使用合成新世界/隔离临时服务目录，不触碰真实存档。测试文件中的受控文字回执只检验口头声明不能完成任务，不表示真实模型表达已验。

- `tests/simulation/trust-journey.test.mjs`：8项核心，含真正偷到工具、协商领取、逾期/放弃/提前归还、临界归还、来源篡改和重复领取。
- `tests/simulation/trust-journey-guidance.test.mjs`：3项公共契约/DOM。
- `tests/simulation/trust-journey-legacy-events.test.mjs`：1项旧fixture6逾期协商的完整审计修复。
- `tests/simulation/trust-journey-service.test.mjs`：2项真实worker/HTTP正常和逾期路线，完整第一章后借用、借出后关闭重开、实际探路/归还、归还后再次重开、相同DTO重试、保存文件SHA与投影一致、借还/失约记忆各一次。SSE实际消费，并在关闭前取消和等待读取结束。
- `scripts/check-trust-legacy.mjs <干净PR39工作树> <新报告路径>`：对照旧fixture1–6，fixture6走完第一章再跨七天，比较完整bundle规范编码SHA并完整审计。报告路径须尚不存在，避免覆盖证据。
- `scripts/check-trust-journey-evidence.mjs`：核验本轮日志、源码指纹及保留的历史证据。

最终 **73项不同测试通过**，无跳过：核心/DOM/旧逾期修复12项，组合回归61项（含2项新支线HTTP、原第一章HTTP及猎人人物卡HTTP）。另有旧fixture1–6的15个完整bundle检查点一致；第6种世界完成原第一章后推进七天，猎人仍存活且实际工作/买粮多次，完整重放通过。原PR39历史证据核验也在干净父树复跑通过，其18项历史日志不重复计入73。

证据目录 `docs/evidence/trust-journey-resume-20261028/`。最终日志 `trust-core-verified.txt` / `trust-adjacent-regression.txt`，对照报告 `trust-legacy-report.json`。`trust-service-first`两项早期通过与最终组合重复，不另计数。保留三份失败记录：`trust-legacy-events-red`是真实旧事件审计问题；`trust-core-first`缺少交流topic，已改为有明确payload的受控文字命令；`trust-core-final`错误沿用旧NPC在tick112的位置，实际此时仍可目击，已等其实际到工作点tick120再验证成功偷窃。后两项修的是测试安排，没有改偷窃或文字行动规则。

所有最终生产修改在这两组绿色测试之前完成；后续仅补交接与证据。七天对照与部分回归并行，耗时只作运行记录，不是性能基准。

### 后续顺序与停止点

1. 有浏览器/Windows环境时，实走新入口到新任务，检查人物卡发现、借期提示、失败后实际归还和中途关闭重开；当前只验代码消费与真实服务。
2. 用户下一次授权继续玩法时，优先收集这条支线的实际操作阻碍，再扩展更有差异的NPC交互目标。2.0仅作设计参考，不导入人物记忆或原更新流程；另开有界任务再改记忆算法。
3. 本轮交独立草稿PR，停止于可评审状态。不合并main、不部署、不启停旧实例、不迁移真实档；GitHub Projects没有可用写入能力，记录为待同步。
