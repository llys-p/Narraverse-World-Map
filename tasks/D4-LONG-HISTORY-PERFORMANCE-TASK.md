# D4P2｜长历史存档性能定向验证

发布时间：2026-10-15 09:00（Asia/Shanghai）。合同 `d4-long-history-performance-v1`。
状态：已发布，待开工；发布任务书不代表执行者已开工，也不代表性能通过。任务状态在 GitHub Project #2，当前摘要在 `PROJECT_CONTEXT.md`。

## 给用户看的交付

回答一个具体问题：现有性能优化，能否让已经经历赠粮、日结和战斗的同一世界正常打开、返村和重新打开，各需要多久。

直接复制已保留的战后存档，只执行一次返村，用已有返村后的完整存档核对结果。不会从零重跑完整故事。这次交付是测量回执；根据结果，再发布“固定日常体验版本与入口”或一项有明确瓶颈的修复任务。D 阶段整体仍进行中。

## 1. 执行位置与精确基准

| 项目 | 冻结值 |
| --- | --- |
| 控制文档树 | `D:\Narraverse-World-Map-control`，`codex/world-runtime-control` |
| 生产基准 | `611b3aff1e98150af069478a50e09923f4d5f633`，远端 `codex/world-runtime-d4-performance` |
| 现有源码树 | `D:\Narraverse-World-Map-d4-performance`；只读引用，不在该树施工 |
| 计划执行树 | `D:\Narraverse-World-Map-d4-long-history` |
| 计划执行分支 | `codex/world-runtime-d4-long-history`，从上述精确 SHA 建立；发布时尚未创建 |
| GitHub 仓库 | `https://github.com/llys-p/Narraverse-World-Map.git`，私有 |

先确认目录/分支不存在或确属本任务；若已有其他工作，不覆盖或切走。记录实际 HEAD、分支、未提交改动和 Node/机器信息。各执行树 origin 可能指向本机 clone，提交或推送前必须核对目标。生产源码与上述冻结基准相同才可称为本合同的结果。

开工仅读本合同、当前控制树 `AGENTS.md` / `PROJECT_CONTEXT.md`，以及实际树局部规则与所需源码。执行树旧副本中的全量/视觉验证要求按控制树 2026-10-14 用户约定调整。无需重读全部历史或旧平台文档。

## 2. 唯一工作负载与已存在的参考结果

原始存档目录（只读）：

`D:\Narraverse-World-Map\hds-d4-cp1a-review\artifacts\world-runtime-d4-cp3-controller\CP3-FULL-19796-1791960566578\runtime-data`

来源索引是 `D:\Narraverse-World-Map\hds-d4-cp1a-review\artifacts\world-runtime-d4-cp3-controller\controller-final-acceptance-index.json`，原始运行证据是该 CP3-FULL 目录的 `evidence.json`。2026-10-15 发布前已直接读取文件并核对下表 SHA 与原运行证据；这只是静态核对，没有重新运行业务。

| 文件 | 原始字节 SHA256 |
| --- | --- |
| `service-commit-r0.json` | `85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b` |
| `service-commit-r1.json` | `01055647588a97c2cf52586c945de35dafbedce553e6cba039fa362fab1ec682` |
| `service-commit-r145.json` | `867ce2730c7fb01cc96f5451e4c690ab836ebe2b64b002da0fd62f9df3267e1e` |
| `service-commit-r157.json` | `7670a2007b4e4aaf679eec5d83ac37b20037cea90abb4862bd895a0d4000792b` |
| `service-commit-r158.json` | `86c08be81faed693d9b33d58ca953c6c7abf8e033de6ae87d688ae50822dc73e` |
| `service-commit-r164.json` | `812fb209293b49beaa55f8d1d32da2c4d345dfa6cb6d53683b2ee4c35dcd786c` |
| `service-commit-r170.json` | `3bf39f7cf0b9e7adb5a39a1969dbf0bc111ec20d18fb5b4b7e92c907969450dd` |
| `service-commit-r182.json` | `d2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c` |

起点是 format 9 / schema 3 / `d-scene-survival-v1` / `scene-survival-village`：revision 170、tick 168、6 条 service commands，森林战斗已胜利关闭。原参考终点为 revision 182、tick 180、7 条 commands。它是时间历史较长的固定小世界，不是 128 命令或大人口压力样本。

唯一新增命令必须逐字段使用参考终点 `commands.at(-1).dto`，固定为：

```json
{"commandId":"0d851472-c18d-4060-95a2-476d903130a7","expectedRevision":170,"payload":{"destination":"village"},"type":"PlayerTravel","version":3}
```

读取参考 DTO 仅用于固定真实输入和完整结果对照；不得把终态注入 owner、替换重演、删减 commands/eventLog 或改变种子、规则、人物、库存、血量。已有存档含原 CP3 接续所用的锚点，沿用原字节并注明来源，不宣称默认新世界自然成长样本。

## 3. 顺序步骤与停止点

1. **准备。** 核对源码基准与上述 8 个原文件。创建本任务独有的空目录 `artifacts/d4-long-history-20261015/<run-id>/runtime-data/`，仅复制 r0、r1、r145、r157、r158、r164、r170 七个原文件；逐字节核对副本。r182 仅作目录外只读参考，不复制进运行目录。日志、manifest 与结果也放运行目录之外；不复制原锁文件。
2. **第一次打开。** 在独立子进程用真实 `createRuntimeOwner({directory, writable:true})` 打开副本；走原完整存档校验、journal 重演与投影初始化。单独记录这次打开耗时和五个公开读取耗时；核对 revision/tick/commands 起点。
3. **唯一动作。** 经 `owner.submit(dto)` 真实提交返村命令；计时覆盖转换、投影、完整 service 审计和 durable 发布。保存真实返回回执；核对 r182 已成为正式文件，原七文件未改。用 `canonicalJson` 对完整新 r182 与原参考 r182 做等值比较并记录 SHA，不得只比 revision 或挑选字段。
4. **正常关闭与重开。** 留存五投影（public/player/mind/encounter/scene），正常 `owner.close()`，核对副本锁释放；同目录、同源码再打开一次并单独计时。核对重开前后五投影完整相等，完整 r182 字节未变；最终正常关闭。不得为五投影额外重新审计参考 bundle 或反复重开。
5. **回执后停止。** 再核对原始 8 文件不变、生产源码不变、本任务进程退出、正常路径锁已释放。保留本次副本与原始输出供中控复核，不自动重测、优化或启动体验服务。

完整对象一致性是主结论；辅助可读结果应与参考一致：tick 180/revision 182，玩家在村庄、私粮 18、health 920，狼 13/预留 0/战斗死亡 1，原 actor-2 收粮来源与本人记忆保持。辅助字段不能代替完整 bundle/anchor/commands/receipt/eventLog/RNG/scheduler 比较。

## 4. 硬时限与结果含义

- 并发 1、单次样本。第一次打开、返村提交、关闭后的重开各最多 **120 秒**；整次受监督子进程最多 **420 秒**，包括读取、比较和收尾。不预热、不计算 p95、不做第二轮基准。准备脚本和静态文件核对不算业务运行。
- 必须由**独立父进程**根据子进程开始/结束阶段消息执行 watchdog；同步 CPU 密集校验可能阻塞子进程事件循环，不能只用子进程 `Promise.race` 或同线程计时器冒充硬时限。
- 任一阶段超时立即停止后续业务，只终止本次明确持有的子 PID；最多留 5 秒退出确认，不触碰其他 Node/服务。保留部分日志、副本和可能残留的本任务锁，报告未正常关闭，不强删锁冒充恢复成功。
- 阶段无完成消息时，记录“已观测运行至 X 毫秒，超时中止”，不得填写为完成耗时。未开始阶段写“未运行”。原存档缺失/指纹不符则准备受阻，禁止从零重建历史或换短历史替代。
- 仅纯脚本路径/语法等在首次 owner 开始前的准备错误允许修正；一旦真实业务阶段开始，就不自动重试。若发生不一致或超时，交回证据和最小瓶颈定位建议，后续修复另发有界任务。
- 结果分类：`COMPLETED_CONSISTENT`、`TIMEOUT`、`FUNCTIONAL_MISMATCH`、`SETUP_BLOCKED`。前者只表示此次测量完成且结果一致；120 秒是防止失控的执行预算，**不是日常体验的合格延迟指标**。如实列出耗时，再由中控决定下一项。
- 原返村的 408255ms 是旧浏览器观察口径；本任务是 owner 调用口径，不能据此计算严格提升倍数。上一轮 tick12/2commands 的短历史结果也不能与本次直接算同负载倍数。本轮不重复旧慢版本，只回答当前候选的绝对耗时与一致性。

## 5. 允许改动、工具与模型安排

- 执行分支最多新增两份可提交文件：`scripts/measure-d4-long-history.mjs`（Node 内置模块、有父进程硬时限）和 `docs/runtime/D4-LONG-HISTORY-PERFORMANCE-RESULT.md`（可携带的简短回执）。结果未产生时不得先写成功结论。
- 原始日志、来源与副本 manifest、原始结果 JSON 及失败信息保存本任务 ignored artifacts 目录。结果应含实际脚本命令、Git SHA/dirty 状态、源码/脚本指纹、Node/机器信息、阶段耗时、完整比对签名、原文件保护和退出状态。
- 只读相关 `runtime/service/runtime-owner.mjs`、`service-commit.mjs`、`http-contract.mjs` 和 `runtime/core/data-contract.mjs`；复用上一轮 ignored `artifacts/d4-performance-20261014/measure-owner.mjs` 的实际 owner 调用方式。该脚本源于短历史且无硬超时，不能原样拿来跑本任务。
- 不修改 `runtime/`、页面、fixture、存档格式、既有测试、预算或校验规则；不新增依赖/跨世界缓存/历史压缩/信任开关。只做本次测量直接需要的脚本语法与静态检查，加上述唯一业务运行。
- 机械脚本和回执整理适合性价比模型，默认一名执行者、并发 1；根因判断、完整对象比较范围和最终裁定由中控复核。记录实际路由，未知则写 unknown；不为本任务创建新的包工头体系。

本地 Reference Review：采用已完成的不可变审计复用候选及真实 owner 测量路径，采用 CP3 已保存的真实前后存档作固定输入/结果参考；拒绝重跑完整历史和通过删校验追求数字。没有新模块或外部依赖，本轮无需外网参考调研。

## 6. 禁区与交付检查表

不跑全量/无关/边角测试，不做截图、录屏、像素/布局/视觉巡检或新浏览器验收；不重跑 128 命令预算、整条 H7 或旧已通过用例。不启动/停止 18324 或其他旧实例，不接正式平台、不迁移真实用户数据、不调用模型、不合 main、不部署、不改旧标签。原始证据留在本机，不上传完整原始存档或配置。

- [ ] 开工回执给出精确树/分支/基准、dirty 保护、计划脚本和硬时限；开工后才由中控把看板改为进行中。
- [ ] 交付含上述四种结果之一；每阶段已跑/未跑/超时分开，完整一致性和保护/退出结论有原始证据。
- [ ] 精确提交本任务两文件；按既有保存授权仅推送本任务分支并读回远端 SHA，禁止 force push。执行者不改控制树/看板，不自报已验收。
- [ ] 中控先把交付登记为待验收，核对源 SHA、脚本、原输出与完整比对，复用有效证据，不默认再跑一轮；收口只更新唯一状态和本任务卡。

## 7. 后续接续条件

本任务交付后，中控根据三项实测耗时和完整一致性决定：可供体验则发布“固定日常体验版本与入口”任务；若明显等待过长、超时或状态不一致，则先发布一个针对已有证据中具体瓶颈的修复任务。日常入口需再冻结源码版本、隔离数据、启动/关闭/重开方法及旧实例保护；本书不授权自动部署该入口，也不代替 D 阶段整体收口。
