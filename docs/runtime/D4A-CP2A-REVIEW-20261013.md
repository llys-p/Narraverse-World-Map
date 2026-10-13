# D4A CP2a 复核：只读场景知识与 HTTP 服务持久化

更新时间：2026-10-13 23:34（Asia/Shanghai）。结论：CP2a 投影与 format9 服务限定 PASS；D4A 整体、母合同与 D 仍未 PASS。

## 坐标与改动范围

- 源码树 D:/Narraverse-World-Map/hds-d4-cp1a-review，CP2a 本地提交 12f45f65ab63621cbfdbfb3464ae26678acf2b26（父 ba43118f096dabdc877a5ac39f7af3fa154becea），10 paths：8 个生产文件、2 个测试文件，811+/41-，工作区干净。该提交未推送、未合入 main、未部署；CP1d 基准 ba43118 已推送。
- 投影改动为新增 sceneKnowledge 1文件及对 encounterKnowledge、coreEncounter、runtimeScene 3个既有文件的窄改。只读 sceneView 显示同地点人物的 actorId/name/occupation/location/alive/condition，以及本人收到的 Gift 记忆；不暴露他人钱包、库存、精确 health 或计划，不接入旧 NPC planner。
- 服务改动为 HTTP contract、serviceCommit、runtimeOwner、runtimeServer 4个既有文件的窄改。format9 owner 新增 sceneAvailable/getScene，不扩旧 owner API shape；GET HEAD scene、POST 已有 commands Gift 与五投影 save-before-swap。sceneBodyReads 上限16，仅只读解析阶段计数并在进入 owner queue 前释放；durable 幂等优先级保持。投影预算65536 bytes、descriptor-first、deep clone；旧公开入口沿旧 gate，scene 只走显式 opt-in，不作类型强转。
- 既有 scene runtime 测试原61项正文不变。新增验收18成员（K1–K4/S1–S14）分批16+2通过；旧直接服务回归18成员按6+8+4三批通过，均0 skip。不是一次全量运行。

## 验收证据

- 新增前置 K1 missingSceneModule 与 S1 unknownProfile 的真实 RED 原始记录保留；首轮一次运行被中断并按 interrupted 记载。完整16门曾9通过/7测试构造或合同期待误红；仅修正新增测试后16门通过，生产 revision 2 未变。K3赠粮后余额19可继续赠与；K4使用 occurrenceTick/observedTick；S2使用合法 recipient DTO 再验ID冲突；S4旧Gift parser拒绝码为 INVALID_INPUT；S5/S7/S12对已保存目录重开不重传profile/seed。
- 新增16门 raw SHA256 35e3871d5ff719337029dc651b8119dcaea1c49969e463b664967ebdc28386ec，报告 SHA256 43b820df5f7827afb179d0125fc2231e1174507f538e328289406b69a2f9e5ae。S13/S14请求体16并发/abort释放及owner队满原DTO优先 32893.2187ms通过，raw SHA256 b1e10c1d5de0e4da20b6f324fa440577b1f9679d9b470954de542b8cfe56b681。旧服务18门分批6+8+4通过，TAP分别为 direct-encounter-service.tap.raw.log、direct-service-commit.tap.raw.log、direct-time-http.tap.raw.log；encounter-service排除2项重预算门，不计为 skip。完整测试子索引 cp2a-final-acceptance-index.json SHA256 e35efc1bbcc87b31c524988895481d0eca5859e6c69eedcdd4e4a878c498887b。
- 机器复核覆盖10个文件、5批raw SHA/TAP计数、原61项正文、4份旧canonical pair和真实一天五投影。scene consumer 结果为tick144/rev145，完整bundle与service replay为true。原始probe误读 hunter.trade.foodUsed/hunter.state.hunger 的错误结果保留；从保存canonical重新做的 corrected checks 均通过，self inventory=0、hunger=100、Gift memory=1，支持收粮后被日结吃完；准确 foodUsed 账字段未单独采集。4份旧 inspector/encounter snapshot/player/actions 与 ba43118 字节一致；owner/cap未做直接pair比较，另由本轮S3与旧服务6门覆盖。
- 最终验收索引 artifacts/world-runtime-d4-cp2a-controller/controller-final-acceptance-index.json SHA256 6a2c660567728fff17ee8ad3d714230209fb851d3aa6b7b72108c1365da436a4；测试子索引仍为上述 e35efc1...。消费者组合自然运行约11分钟，此为完整审计组合用时，不是单次HTTP性能计时。

## 未完成边界

- 129文件真实满盘压力延期至完整A/B；不能以旧format8或其它边界结果代替scene format9/真实磁盘压力证据。母合同尚未完整验收。
- CLI runner 注册/导出、村庄 UI/static 与正式平台未做；下一 CP2b 按依赖先 CLI，再 UI/static。B仍等待完整A，D卡继续进行中。CP2a限定PASS不代表D4A或D整体PASS。
- 本轮未发布新外部任务书；看板由中控收口时同步。证据范围限于源码 artifacts/world-runtime-d4-cp2a-controller/、artifacts/world-runtime-d4-cp2a-projection/、artifacts/world-runtime-d4-cp2a-service/。

