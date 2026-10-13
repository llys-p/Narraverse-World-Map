# D4A / CP1b：记忆层版本接入与即时赠粮投影

2026-10-13，Asia/Shanghai。内部短工单，不增加第三份正式任务书。
母合同 d4-scene-continuity-v1，A/B 发布 fbd128be5dfc36008717caa13026ceaef70875e7。

## 唯一施工坐标

- 注册 workspace D:\Narraverse-World-Map；所有业务编辑必须在子树 hds-d4-cp1a-review。
- 分支 codex/world-runtime-d4-cp1a-review，精确基准 c84d57d5b5fc4628fe5cb59986528574e924c4de；预期 tracked clean。
- 本树是中控独立验收 CP1a 后的后继，不向 hds-d4-scene 回写。原 hds-d4-scene 旧 worker 终态 unknown，禁止使用或转移其写租约。
- CP1a 收粮账已修正并验收。源码尚未 push；不要重跑未受本单影响的 CP1a / hunter / society 套件。
- 根 workspace 是旧 A1，绝不是本单代码基准。根 stickman-engine.js、STATE 及已有成果保留。

## 本轮写域：恰三个业务文件

1. hds-d4-cp1a-review/runtime/core/memory-runtime.mjs
2. hds-d4-cp1a-review/runtime/core/memory-observer.mjs
3. hds-d4-cp1a-review/tests/simulation/scene-gift-runtime.test.mjs
证据仅写 hds-d4-cp1a-review/artifacts/world-runtime-d4-cp1b/；不编辑原 CP1a 证据。
禁止更改其余生产、旧测试、三项 CP1a 源码、控制文档/看板、根 STATE、流程优化会话或工作区。

## 功能与停止断言

- memory-config-v6 显式配 society-config-v5；createMemoryWorld / validateMemoryWorld 能创建、接受真实新版本的记忆层空世界，player-state-v3 / memory-observer-v3，原配置参数与字段保持合同。
- v1–v5 原映射、默认输出、observer-v1/v2 原义保持。v6 配 v4、旧 memory 配 v5、v6 配旧 observer 或新配置配旧 player 必须拒绝；不临时改版本绕过校验。
- observer-v3 保留 v2 位置/旅行与既有行为，再增加 FoodGiftCommitted 的严格来源与字段/转移恒等式校验，以及 donor4 / recipient2 本人投影。消费真实结构事实后，各一条 self importance1，observable 严格合同 §6；其他 NPC 零条、trust 不变、即时 observedTick=occurrenceTick。
- v1/v2 的 reducer 不接受赠粮来源。既有 projectActorEvent 的公开签名/旧输出不改；可增加窄内部版本分派 helper。不得向旧 profile 全局注入赠粮。
- checkEvent/sourceLog/consume/validateMemoryHistory 一致识别新版本：未来/坏因果、错 actor、错 sourceSystem/commandId/entityIds/payload/方向与前后账等拒绝；重复 suffix 不新增记忆，cursor 与观察时点正确。不能把单 observer 结构审计声称为权威资产认证。
- 保留 32 条留存、排序、确定性 ID、旧 medicine-trade trust+10；赠粮不增加信任、不改计划/Goal。
- getter=0、稀疏/异类/非 JSON 等按现有 descriptor-first 路径拒绝；不要先调用 getter 再补校验。
- 停止：记忆层空状态 + 新赠粮事实的 reducer/历史投影 + 最小反例全通过。此轮不创建 scene fixture / bundle，不接 executeSceneIntent、Gift 资产提交、世界事件分派、CLI/HTTP/UI；这些属于后继最小闭包，不写桩伪装通过。

## 测试和团队

- 包工头负责两个可见板卡：CP1b-T 独立期望测试、CP1b-C 两个记忆模块实现。优先真实子代理，免费 workbuddy-global/deepseek-v4.1-flash high；另一免费路由只按运行册获准探测一次，不转 SG/付费/Astra。
- 测试先加在现有 scene-gift-runtime.test.mjs，保留 14 条原断言，仅新增本卡断言，先跑并保存真 RED；独立手算 expected，不复制实现输出。测试作者单独拥有测试文件。
- 核心写者只拥有两个 memory 文件，测试作者已完成后核心开始；核心不得修改测试凑绿。包工头核真实文件与日志，不把 spawn started 当 finished。
- subagent 无可用终态时记录 workerId/路由 unknown 和具体故障，不默默亲任两个角色、不连续重复创建。完成已知证据后向 Codex 返回阻碍。
- 同一写域没有 verified stopped 不换写者。最多并发1。连续两轮重复阅读/15分钟无实质进展则保存检查点并报告具体缺口，不重新全文分析。
- 默认仅跑新增 CP1b 名称成员及 memory-observer.test.mjs / memory-runtime.test.mjs；若本单触及旅行分派，再加 memory-engine 的相关旅行成员。可 node 文件直接运行以避免 --test 进程 EPERM；不要降级断言或 skip required。
- RED/GREEN 精确代码与测试 hash、原始 TAP/exit/count、各任务原生 ID 与 stopped/finished 证据写本单证据目录。停止时报告目录/分支/基准/精确 diff/读过路径/下一具体命令/PID 活性。测试没有失败不等于完整 Gift 或 D4A 完成。
- 不 commit/push/merge/deploy/reset/clean，不启停18324/用户Edge，不读凭据。额外白名单缺口带最小调用链报 Codex裁定。任务相关公共研究可用，但不登录/上传/外部写入。