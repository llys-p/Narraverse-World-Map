# D4A CP1d 复核：真实 Gift、即时记忆与完整重演

更新时间：2026-10-13 22:21（Asia/Shanghai）。结论：CP1d 限定 PASS；D4A 整体与 D 仍未 PASS。

## 范围与基准

- 源码树 D:/Narraverse-World-Map/hds-d4-cp1a-review，CP1d 本地提交 ba43118f096dabdc877a5ac39f7af3fa154becea（父 597940d4917f372dea4d9c41409ebd9399645d3c），7 paths：5 个生产文件、既有 scene 测试及获准的 G1 旧测试修订；提交后工作区干净。未推送、未合入 main、未部署。
- 五个生产文件的集合指纹 SHA256：b87ee4ce4c6fef281f12f50c9816174809a8207dc226e49b8db03038064fcf54；scene 测试 SHA256：86e7059bb13d61239ae4ca7d1ab3cc5851ef53d5ba3435bb5124de595fcb9cd9；G1 测试 SHA256：6e7d31a8df2bfb7f7d73d947e313ecedcf785afd155f43fd5ca75cd3272cf23b。
- 范围为真实双边 Gift 资产变化及 FoodGiftCommitted、一个 Resolved/DTO 进入 encounterModel inputHistory（上限128）、即时 observer-v3 本人记忆和完整 journal/replay。复用既有 executor/profile，没有复制约43k engine。

## 验收结果

- 新增 R1–R10 以分批方式全覆盖：首轮9通过、R1因测试期望漏计 actor-2 inventory +1 构造误红；仅修正期望后单独重跑 R1，1/1 通过。不是同一次10/10。真实行为含 Gift 零tick、rev+1、双方账本变动各一次；recipient 与 donor 即时记忆各一条，其他观察者为0，信任、既有 Plan/Goal 保持不变。
- 直接定向回归共62项，分组覆盖 runtime32、encounter replay15、memory4、world-state5、CP1c6；runtime 首轮31过/G1 exact-export 失败后，仅对获准 G1 修订定向复验通过。runtime以31项既过加G1单项复验覆盖32项；其余15/15、4/4、5/5、6/6均通过，最终覆盖成员无skip。分批合计62项，不是旧51项加新增项的一次全量运行。
- G1 将精确导出名单从6扩至8，新增的是 CP1c 已有的 createSceneEncounterRuntimeHooks 与 validateSceneEncounterWorldState，并保护旧公共函数 arity；其余31项断言未放宽。此为最小旧测试例外，未改生产行为或任意扩大 API。
- 即时记忆验证覆盖真实非日界 tick 1 Gift 观察，随后144日结保留准确来源、不重写观察时点。合法配置/链拒绝码、幂等与 stale/conflict、真实 checkpoint restore、6类篡改拒绝、4模块冷启动导入，以及旧完整 bundle 固定 SHA 对照均通过。
- 施工期曾观察到180 tick、狼13与health920；该探测发生在两项小型防御门加载前，只作施工探针。独立 R6 短旅行遭遇链另有验证，不把整段180 tick链宣称为最终字节级独立验收门。

## 证据及边界

- 新门结果与原始输出：源码树 artifacts/world-runtime-d4-cp1d-controller/cp1d-r1-r10-first-red.report.json、同名raw.log、cp1d-r1-corrected.report.json、同名raw.log及cp1d-r1-red.*；首轮runtime G1 RED、修订记录和后续各批回归均保留在同一controller目录。最终索引 artifacts/world-runtime-d4-cp1d-controller/final-acceptance-index.json，SHA256 95044051dc836e81a427fe74f657734bf1ca111e51e1bd242380c08734b01797；原始索引保留，机器复核确认源码、测试及 raw 引用均匹配。
- 复核记录 CP1c 上轮遗漏 hard exact-export 门的边界；本次仅按最小授权修复对应旧测试，不回写 CP1c 发布报告或母任务书。CP1c 原报告与证据保留。
- CP1d 不包含 scene knowledge 页面、service format9、完整 HTTP/CLI 故障面或 UI；这些未验证。D4A 整体及 D 不因此通过，B 仍等待完整 A 交付。后续 CP2 可按依赖先做只读 projection 与真实 HTTP/持久化，再推进 CLI/UI；这是建议顺序，不是已派发任务。
