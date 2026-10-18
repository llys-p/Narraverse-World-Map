# D4E12 冷开完整审计去重：限定结果

2026-10-18（Asia/Shanghai）。本报告只覆盖 D4E12 campaign/format11 合成短世界的冷重开；它不是私有长档、128 命令上限、日常入口或整体验收结论。

## 2026-10-18 16:23 复核修正与合并建议（Asia/Shanghai）

结论：**PASS，建议将本片修正后候选提交交由集成线合并；尚未执行合并。** 复核目标 `45288ec1b66a5cdf5a37b391cd8bfd2f9eb952b2`，修正源码提交 `478d4aee55ca261c1fd21585ce4a973f870ef850`，生产文件 SHA-256 `00383c1a24c92f8e10a082970d28c260afdd2b9e8339e4d025dbc1086146644b`。无剩余 P0/P1/P2 阻断；这是同一对话的复核后修正与重新验证，未声称另一个独立模型已审查修正提交。

- 恢复最终 replay 的 public/encounter/scene 投影门，放在与 raw final 精确相等之后；未恢复 raw final 的重复完整 audit。此前“投影可用性”P2 是恢复原验收边界的审慎要求，未复现合法世界无法投影的实例，不能把它写成已确认产品故障。
- 原既有稀疏超限测试失败确认为预算检查晚于复制：外层 clone 先报 INVALID_INPUT。增加私有共用分离入口，先拒绝外壳访问器，再以 MAX_SERVICE_COMMANDS 检查命令数组，随后执行原完整 clone/audit。公开验证和私有认证共用；原断言不放宽。新增反例先 RED（`merge-repair-budget-red-01`，1 fail），覆盖稀疏/稠密超限、预算内稀疏和两种 getter 执行次数 0。
- `merge-review-core-01` 的 17 pass/1 fail 和 `merge-review-boundaries-01` 的 2 pass 均保留，不能合称一次全绿。修正后 `merge-repair-core-02` 六个文件一次 **21/21 PASS**，0 fail/skip/cancel，退出 0、墙钟 37028.556ms、180 秒硬限。覆盖旧格式 service commit、认证、derivation、owner、worker、跨日/RNG、地图及 JRPG 回放。监督回执的父进程 CPU 不代表 Node 子测试总 CPU。源码/测试语法与 diff 检查通过。

修正后固定 seed42、8×AdvanceTime(2)、r16 的 ABBA 如下，单位 ms；baseline 仍为 `63b3ddf`。每轮独立进程/目录/随机端口、180 秒硬限，顺序 B2→C1→C2→B3：

| 轮次 | 冷重开墙钟 / CPU | 完整 journal audit 墙钟 / CPU |
| --- | ---: | ---: |
| B2 | 1840.869 / 1750 | 1864.283 / 1829 |
| C1 | 1555.538 / 1563 | 1578.012 / 1610 |
| C2 | 1628.942 / 1609 | 1602.659 / 1578 |
| B3 | 1971.231 / 1798 | 1857.410 / 1766 |

冷重开均值 1906.050→1592.240，墙钟改善 **16.46%**；CPU 1774→1586，改善 **10.60%**。四轮 PASS、退出 0、无超时、残余锁 0；正式文件、五投影、回执三组 hash 与下方历史 ABBA 相同。首个 `merge-repair-perf-b1` 与测试末尾短暂重叠，仅保留原始回执，不纳入统计。不得将本轮绝对耗时与前轮不同负载的绝对耗时比较来宣称额外收益，也不推断长档、p95 或稳定性。

复现：`python scripts/run-d4e12-check.py merge-repair-core-02 180 node --test --test-concurrency=1 tests/simulation/service-commit.test.mjs tests/simulation/demo-service-certification.test.mjs tests/simulation/campaign-live-derivation.test.mjs tests/simulation/campaign-live-owner.test.mjs tests/simulation/demo-worker.test.mjs tests/simulation/campaign-live-world-boundaries.test.mjs`。标签已存在，重跑须新标签。性能命令沿用本报告测量器，标签 `merge-repair-perf-{b2,c1,c2,b3}`，模式依次 baseline/candidate/candidate/baseline；每轮传 `--phase-file artifacts/d4e12/<label>/phase.json`，输出 `artifacts/d4e12/<label>`。原始数据保留本树忽略目录，未上传存档。

独立项目使用 Node v24.14.0 / Windows，自带 runtime-server，无 Denova 可执行文件。HTTP 关闭重开和投影一致性由上述隔离测量器验证，端口为每轮系统分配（未单独记录 URL 数字）；worker/耐久失败回滚由本次自动化门验证。未跑全量、浏览器/视觉、私有长档、日常目录或现有服务；不阻塞这片审计去重合并，但阻塞宣称整体性能完成。主线唯一状态及看板由控制树管理，本次仅更新本工作树摘要，未同步控制树。下一步只进入集成合并决策；D4E12/Stage D 整体验收未完成。

以下为原候选与历史测量记录，修正后的源码及裁定以上节为准。

## 范围与源码

- 独立树：`D:/Narraverse-World-Map-cold-open`，分支 `codex/world-runtime-cold-open`，基线 `63b3ddf3483b5486e3d9dc2c19fc2f0b1c4e4bef`。未触碰 control、demo-gameplay、原型原件、任务草案或看板。
- 实际候选仅改 `runtime/service/service-commit.mjs`：公共完整审计继续完整验证 anchor，逐 DTO 使用原固定转移和完整 world audit，并精确比较最终 replay 与磁盘 raw final。删除的是此前已被该精确比较蕴含的 raw final 第二次完整 audit 与投影构造。
- 为保留直接库调用的输入隔离，`createAuditedServiceCommit` 只在其已分离的副本上继续执行私有认证。没有新增 public `trusted`/`skip` 输入、缓存、格式、时间规则、预算或持久化语义。
- 最终候选 `runtime/service/service-commit.mjs` SHA-256：`ca6e1e6b85180c15b1ecc737adea6d44eb47a14c87cb69bb0d61bf457c0e0091`；最终 ABBA 使用的测量器 SHA-256：`7a15c3ade781b02e09328253e12321843d6967d8a416dfd10ec602ab46a4ac73`。后续路径归因将同一测量器扩展为 SHA-256 `3f3736ea26435e4d5d5309dc12ecb838654e19765abb4bb9d056945493e6184e`，不改变生产源码。

## 归因

新的测量器先新建 seed42 短世界，提交固定 ID 的 `8 × AdvanceTime(2)` 至 r16，关闭后分别执行完整 `loadRuntimeServiceCommit`、独立投影构造和真实 HTTP 冷重开。各进程由 `scripts/run-d4e12-check.py` 以 180 秒硬限监督，目录与端口均独立。

- 初始分段样本显示完整 audit 5140.545ms / 冷重开 5541.565ms，而五投影构造仅 15.853ms；投影不是冷开的主瓶颈。
- 最终 B5 的冷开 audit 内部时间为 anchor 38.087ms、raw final 第二次 audit 674.507ms、投影预检及 journal replay 3849.482ms。C5 保留 anchor 45.941ms，取消 raw final 重复 audit，journal replay 仍为 3705.614ms。
- 因此本片只消除已证明重复的约一段 final audit；完整 journal replay 仍保留且仍是主要成本。没有把这个结果说成“冷开问题已解决”。

### 后续 journal 路径归因（未采纳生产改动）

在同一已完整认证 r16 commit 上，测量器逐条复算并对每条 receipt 与最终 bundle 做精确比对；四种输出仍为既有正式文件、五投影与回执 hash。`journal-path-attribution-c1` 中，公开完整转移为 2321.952ms，私有认证前缀 derivation 为 791.050ms。`journal-path-attribution-c2` 重测为 1618.622ms 与 759.727ms；一个只移除 audit loop 内重复 DTO 校验、但仍调用原完整 campaign 转移的候选为 1754.250ms，较公开路径更慢，已拒收。

私有 derivation 的快结果不进入公开 `validateServiceCommit` 或冷加载：它的前提是 WeakMap 中仅进程内可得的已认证前缀，而公开 JSON/冷加载合同要求保留原完整 oracle。把它用于公开审计会改变该明确边界，即使本次合成输出相同也不擅自采纳。上述两个回执均退出 0、180 秒硬限内；原始数据在 `artifacts/d4e12/journal-path-attribution-{c1,c2}/result.json`，仅含合成指标、hash 和回执。

### 再次 CPU 归因与停止线（未采纳生产改动）

继续对最终候选做一次 `--cpu-prof` 短采样，仍使用独立 seed42/r16 世界和 180 秒硬限。监督进程 `cold-open-cpu-profile-run` 退出 0，墙钟 9050.961ms、CPU 9218.750ms；其中完整 journal audit 1771.220ms、公开逐命令转移 1755.780ms、冷重开 1740.260ms。正式文件、五投影和回执聚合 hash 与最终 ABBA 完全一致，残余 lock 为 0。

该样本只有 10 条事实：8 条 `EncounterCommandResolved`、1 条 `CampaignRegionsChanged`、1 条 `SurvivalFoodQuoteAnnounced`。`event-log.mjs` 中 4 处 `find/filter` 因此不构成本次可量化瓶颈。采样 Self 热点仍集中在 `encodeCanonical` 约 2220.3ms、`requireCondition` 约 2182.4ms、`cloneData` 约 1121.6ms、描述符递归 `visit` 约 811.0ms 和 `record` 约 619.2ms；这些是跨审计调用累加的诊断值，不是单阶段耗时，也不能直接相加解释冷开墙钟。

已有受控试验已经分别拒收编码断言写法、副本复用和规范相等比较替代；本轮不重复这些候选。把私有前缀证明用于公开恢复虽能明显缩短时间，却会削弱本任务明确要求保留的公开完整审计边界。因此在不运行私有长档、不裁剪重演、不新增 trusted/skip/cache 的授权范围内，没有发现第二个同时满足合同与可量化收益的生产改动，本次继续到此停止。原始 profile 和结果仅保留在本树忽略的 `artifacts/d4e12/cold-open-cpu-profile*`，不上传存档。

## 最终同机 ABBA

Windows / Node v24.14.0；顺序 B5→C5→C6→B6；每轮新进程、新目录、随机端口，`runtimeWorker:false`，相同 seed42 和相同 8 个命令。数值单位为 ms。

| 轮次 | 版本 | 冷重开墙钟 / CPU | 全量 journal audit 墙钟 / CPU | 投影构造墙钟 |
| --- | --- | ---: | ---: | ---: |
| B5 | baseline | 4644.692 / 4548.000 | 4358.617 / 4281.000 | 12.453 |
| C5 | candidate | 3843.309 / 3563.000 | 3599.839 / 3515.000 | 14.484 |
| C6 | candidate | 3715.066 / 3546.000 | 3452.415 / 3391.000 | 8.999 |
| B6 | baseline | 4340.291 / 4156.000 | 3951.052 / 4000.000 | 11.242 |

- 冷重开平均：4492.492 → 3779.188（墙钟 **15.88%** 改善），CPU 4352.000 → 3554.500（**18.32%** 改善）。
- 完整 journal audit 平均：4154.834 → 3526.127（墙钟 **15.13%** 改善）。样本仅各两次，不作 p95、长历史或日常体验承诺。
- 四轮均 `PASS`、退出 0、未超时、无残余 lock。所有轮次的 9 个正式 service 文件聚合 SHA-256 都是 `b05514a96600f45770be54947ee7738e389e79d0adb30515c5727b04e1663e0f`；五投影 SHA-256 都是 `9e6cddddfd6bbc2a185223c60e36cfdd8b09b481f667342b90d0ca6e1dafa1e4`；八个回执 SHA-256 都是 `04f78b838c70147bf2c3fb9f788530166b083abcafcf98f179eda8ed9bfe0dba`。
- 未提交的脱敏逐轮原始结果在本树 `artifacts/d4e12/cold-open-final-{b5,c5,c6,b6}/result.json`，每轮的监督回执在相邻 `artifacts/d4e12/cold-open-final-*.json`。它们只含合成指标、hash 和回执，不含 world 目录或用户存档。

## 定向验证

下列均为最终候选、180 秒硬限、退出 0；没有运行全量、视觉检查、私有长档或旧补验。

```powershell
python scripts/run-d4e12-check.py cold-open-final-core-owner 180 node --test --test-concurrency=1 tests/simulation/campaign-live-derivation.test.mjs tests/simulation/campaign-live-owner.test.mjs tests/simulation/demo-service-certification.test.mjs tests/simulation/demo-worker.test.mjs
python scripts/run-d4e12-check.py cold-open-final-boundaries 180 node --test --test-concurrency=1 tests/simulation/campaign-live-world-boundaries.test.mjs
```

这些门覆盖 live derivation/owner、完整 service certification、worker、跨日和地图/JRPG replay 边界；公开 `validateServiceCommit`、冷加载、非法篡改拒绝、失败回滚、同 ID 重试、耐久后发布和格式11/DTO5边界保持原合同。

`cold-open-c3` 曾因量测器只识别旧返回字面量而在 import 阶段退出 1；没有进入服务、没有生成 world 或性能样本。失败回执保留，测量器修复后使用新标签完成最终 ABBA；不把该次失败计入通过结果。

## 未验范围与结论

此优化予以保留，理由是受控 HTTP 冷重开和 CPU 都有超过最终两轮同版波动的端到端收益，且正式文件、回执和五投影完全一致。它不改变运行中前缀审计成果，亦不替代冷加载和公开独立审计。

未运行私有长档、128 命令极限、多人并发、浏览器页面链、视觉/听感、日常目录或任何 18338/18340/18342 服务。没有合 main、部署、迁移、模型调用或上传存档；D4E12 性能整体仍需修正，Stage D 仍进行中。
