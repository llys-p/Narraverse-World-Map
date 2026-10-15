# 当前状态与接手方向

更新时间：2026-10-15 21:51（Asia/Shanghai）。当前进度仅在本文件维护。
本轮改写前的完整版本固定于控制仓库远端提交 `3361d653a61d0ee7901426f3edd41b951017e2d6`，Git blob `c07b928553f57c5a9fab1d55280a84504e0b1ddb` 已核实与旧字节哈希相符，可从远端链接恢复：
[旧版 PROJECT_CONTEXT](https://github.com/llys-p/Narraverse-World-Map/blob/3361d653a61d0ee7901426f3edd41b951017e2d6/PROJECT_CONTEXT.md)。
旧字节 SHA256：`9adb3accdd3a31261f2e60dd2f117da537813b79ac0dae8b2a3e0c8d81f77777`。

## 当前验证约束（2026-10-14）

按用户本次明确指令，仅运行当前核心交付直接必要的最少定向功能检查；同一源码及直接依赖未变且有有效原始通过证据时复用，不跑全量/无关测试，不扩展边角测试或重构，不做截图、录屏、像素、布局或视觉巡检。此前视觉、全量及阶段收口验证约定按本次指令调整，冻结历史任务书/验收合同不改写；不得为更多验收次数重启既有5小时预算或37分钟H7链。真实输入边界、权威状态和存档/恢复校验仍是核心要求；取消或未验证项如实标注，不能写成通过。

## 当前能力

- 本项目是独立 World Map 原型，不属于 Narraverse 正式平台；没有生产接入或真实存档迁移。
- M4 有界自主生存合同已限定 PASS，源码 `115e256` 已推送并读回。
  最终证据见 [M4B 复核](docs/runtime/M4B-REVIEW-20261011.md) 和
  `artifacts/world-runtime-m4b-review-20261011/final-acceptance-index.json`；
  证据按合同分次覆盖，非旧全量重跑。
- D3-1、D3-2、D3-3、D3-4 各自限定 PASS；D3 整体未验收。
  现有范围仅含遭遇预留内核、世界候选适配、命令会话和单狼战斗内核。
- D3-5 候选已接入真实世界推进、M4 生存规则、服务持久提交、CLI 保存/恢复及页面消费者。A施工及 B1/B2/B3 共28个独立验收成员已分批覆盖：B2按2项既绿+原3红补验+本轮2项新增/扩展门=7项；root限定裁定D3-5 G1–G8 PASS。非一次28/28运行，不代表D3整体或正式平台接入。见[D3-5B复核](docs/runtime/D3-5B-REVIEW-20261013.md)。

## 集成基准与实际位置

- 最新限定PASS任务候选：`D:\Narraverse-World-Map-d4-data-fast` / `codex/world-runtime-d4-data-fast`，交付 `b7e5a9e7c131ee79acd017276ff62910a549d5ad` 已推送读回、干净；唯一生产data-contract吸收DeepSeek安全复制并新增单次有界键名转义复用，完整实档链一致。上一轮 `D:\Narraverse-World-Map-d4-canonical` / `codex/world-runtime-d4-canonical` 的已验2936233426e990857f3c88a39ad58623832419fd保持不动、作为可回退基准；旧A/B/模型实验与标签均保留。未main/deploy/启动日常入口，不能称日常性能或D整体通过。
- GitHub 分支 `codex/world-runtime-d4-cp1a-review` 已读回A候选 `254c27d143f735dfff2051f561dee129012b5a99`；B分支 `codex/world-runtime-d4-acceptance` 已读回 `f0fa73dd2b41db6fb5aa1c11a221a3fa142ae30a`。存档标签 [checkpoint/d4-functional-20261014](https://github.com/llys-p/Narraverse-World-Map/tree/checkpoint/d4-functional-20261014) 指向B提交，包含A源码祖先；控制文档另在 `codex/world-runtime-control`。均未合入main或部署，ignored原始证据仍保留本地。执行树origin仍指本机clone，本次推送使用精确GitHub URL。

- 控制文档树：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`；
  本轮D4B收口前 HEAD `491d6498b74fadc64554e5d09b6bed5d6007206e`；规则/验收摘要提交 `8f002553fa31d701892f275b0f83627d848beb70` 已推送并读回。更早完整状态见上方保留的 `3361d653` 快照链接。
- D3 施工树：`D:\Narraverse-World-Map\hds-reservation`，分支 `codex/world-runtime-d3-reservation`；A生产冻结为 `d22c730707646eabe8c68b4d2c739e09f942fbab`（主体祖先 `2ecfc0cd5c8991d57053e2e04c17a312469ef96f`，仅含 owner 队列修复和A回归测试）。B测试提交为 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`（父3c、仅新增/扩展B2测试）；相关D3提交现随D4任务分支远端可达；未合入main、未部署。
- 新遭遇规则使用隔离的 profile/schema，旧 profile 与存档行为保持；M4 正式实现和生产边界不变。M4 独立体验对话 `01a12aff-2703-71c2-ab00-cc7ae733ca2a` 使用 `http://127.0.0.1:18324/`；控制文档工作不得启停该实例。

## 活动工作、阻塞与下一步

- **D4E1固定本地入口已交付（CLI/HTTP限定PASS）**：[任务](tasks/D4E1-FIXED-EXPERIENCE-ENTRY-TASK.md)/[复核](docs/runtime/D4E1-REVIEW-20261015.md)，新树 `D:\Narraverse-World-Map-d4-experience` / `codex/world-runtime-d4-experience` @5acf6472已推送读回且干净；业务接b7e5a9e不变，仅Start-D4.cmd/说明/README。固定18325，首次新隔离scene世界，数据本树artifacts/d4-daily/world；不导入原世界、不启停旧18324。初版重开带初始化参数被保护拒绝，修正后临时端口/目录CLI/HTTP启动/quit/重开签名与r0字节一致、锁/子进程释放；非Windows双击/浏览器/日常性能验收。默认用户世界未创建、无常驻服务。看板D4E1已先待验收再读回Done/已验收（启动包限定范围），D仍In Progress/进行中。
- **剩余性能已交GitHub开放问题**：[Issue #3](https://github.com/llys-p/Narraverse-World-Map/issues/3)，已创建并读回、加入Project #2/Todo。给仓库AI固定b7e5a9e与代码/原始已推送证据链接，写明私有原档未上传及不可削弱的校验/重演边界；没有自动指派AI，优化保持开放。

- **D4P5限定PASS并收口**：[复核](docs/runtime/D4P5-REVIEW-20261015.md)，任务b7e5a9e已推送且干净、实测生产d8d1dc6字节未变；等价13/13+真实持久篡改1/1。唯一无Profiler受监督完整r170链：开档47901.369/返村49255.913/关闭1.221/重开62098.170ms，总159545.607ms exit0；19内部核验、r182原始字节/回执/重开五投影一致，原8档/7副本未变/无锁/测量子进程。相对历史2936233总计低18.79%，非成对稳定性能证明；首开未胜过历史DeepSeek47.38秒，新增键名复用只获编码短对照中位11.57%收益支持。校验展开无稳定增益已弃，仍几十秒等待；未合main/部署/启停旧实例，D/日常性能仍未验。D4P5看板已先待验收再逐字段读回Done/已验收，D仍In Progress/进行中；原始Git/板证据在 `artifacts/d4p5-20261015/`。

- **D4P4-R2方案沟通/短试跑已复核**，见[原报告R2](docs/runtime/D4P4-DSH-FREE-MODEL-COMPARISON-20261015.md)：Hy3复用（d838c41）、用户手动恢复后的Hy4 fromEntries（8bc88df）、Step5返修复用（c5692b7）三个实验已保存推送；Hy4原Relay hard_credit失败保留，手动runId/路由unknown。DeepSeek本轮未重新调用，只复用第一轮实际候选，额度故障后只探测了一个获准备选Step。中控四真实函数各10/10直接语义检查，统一合成100轮：原始455.7/DeepSeek166.9/Hy3170.6/Step182.5/Hy4227.1ms，仍首选DeepSeek，不外推真实档或p95。Hy4示意patch早return会漏清理，不可照搬；原型与真实DeepSeek均通过反例。只新增实验文件，四树生产/原测试/旧派工hash不变；无新慢档/main/deploy/服务启停。原始终态/保护/独立对照在 `artifacts/d4p4-dsh-20261015/r2/`；看板D4P4已先待验收再读回Done/已验收（方案试跑比较完成，非生产采纳或D整体验收）；报告/独立脚本与JSON提交8504155已推送读回。

- **D4P4四个DSH目录x0.00模型比较完成**，见[报告](docs/runtime/D4P4-DSH-FREE-MODEL-COMPARISON-20261015.md)。统一基准2936233，独立树在 `D:\Narraverse-World-Map\free-perf-trials\{deepseek,hy4,hy3,step5}`。DeepSeek候选10a2180：中控11/11语义+1/1持久篡改通过，唯一r170打开47377.2192ms、投影签名/原档保护一致，较历史61.85秒单样本低约23.4%；仅推荐候选，未采纳到2936233。Hy4 f8128f0/Step5 7226859因继承setter/只读属性语义反例拒收、未测慢存档；Hy3原429失败，用户手动恢复后NO_CHANGE/零diff（EPERM交回），两轮分记。三个有改动实验分支已保存推送；实际费用/共享额度池未知，无付费回退。原已验版本/标签保持，D整体仍进行中；本轮到比较收口停止。
- D4P2首轮脚本失败与R1诊断历史保留：原生产611b3aff首次无Profiler95147.747ms；R1交付1c2713a4，带Profiler111303.165ms、起点170/168/6commands、无返村/重开。诊断限定PASS及统计勘误见[R1复核](docs/runtime/D4P2-R1-REVIEW-20261015.md)，不把它改写为原完整链全绿。后续D4P3已在新候选补齐测量事项。
- **D4P3与D4P2测量事项已限定PASS收口**，见[中控复核](docs/runtime/D4P3-REVIEW-20261015.md)。唯一无Profiler完整链：开档61851.345ms→返村63404.284ms→关闭1.381ms→重开70974.714ms，总196451.860ms/exit0；完整r182原始字节及回执与参考一致，五投影跨重开一致、原8档/7副本未变/锁释放。中控补真65536/65537 UTF-8边界及自有constructor键，最终等价5/5、持久篡改1/1通过，仅测试/说明改动，未重跑业务。相对历史开档约35%只是单样本差值；仍有分钟级等待，日常性能未验，D整体仍进行中。本轮停止，不自动派发下一阶段或部署。
- D3-5A 生产候选在 `2ecfc0c` 主体上已有真实服务、CLI、持久化预算及浏览器消费者证据：服务6/6、旧parser窄回归3/3；CLI窄测4/4、旧clock-smoke 1/1、有界reader 1/1；Edge组合1/1（92.5秒）；新profile metadata负例1/1。format8 128输入/129正式service文件边界1/1（269秒）；旧profile 128文件上限1/1（127条真实命令，887.98秒）。这些是既有定向回执，不代表新候选整体验收。
- B1 15项、B2 7项（2+3+2）、B3 6项共28个独立成员已分批通过、无skip；并非一次28/28。B2新增 owner durable-failure 与G7共11种checkpoint变体均通过。原失败记录与定向补验保留，见[D3-5B复核](docs/runtime/D3-5B-REVIEW-20261013.md)。A唯一源码行为修复为 `d22c730` 的 owner queue 幂等优先级及回归；B测试候选提交 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb` 仅改B2测试。相关D3提交现随D4任务分支远端可达；未合入main、未部署；D3整体未验收。
- D4 合同 `d4-scene-continuity-v1` 已冻结，基准 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`；任务书见[A](tasks/D4A-SCENE-GIFT-MEMORY-TASK.md)与[B](tasks/D4B-SCENE-CONTINUITY-ACCEPTANCE-TASK.md)。CP1a、CP1b历史候选修正与限定PASS记录保留；A最终候选CP1/CP2/CP3内部门完成。B独立验收裁定H1–H7功能合同限定PASS，复核见[D4B复核](docs/runtime/D4B-REVIEW-20261014.md)；D4功能合同与本次性能slice均限定PASS，D阶段整体仍进行中，正式平台未接入。
- D4A 当前基准树 `D:\Narraverse-World-Map\hds-d4-cp1a-review` @ `codex/world-runtime-d4-cp1a-review`，CP1a检查点 `c84d57d5b5fc4628fe5cb59986528574e924c4de`（父f7699fb，恰3core+1A测试，当时未push/main/deploy）。修复收粮库存恒等式/非actor-2接收限制/ownership预检；新14/14、hunter9/9、society8/8及旧6组初态/日结完整组件字节配对通过。见[D4A CP1a复核](docs/runtime/D4A-CP1A-REVIEW-20261013.md)。
- CP1b记忆层、CP1c、CP1d、CP2a、CP2b、CP2c各自限定PASS，见对应[D4A复核](docs/runtime/D4A-CP1B-REVIEW-20261013.md)及[CP2c复核](docs/runtime/D4A-CP2C-REVIEW-20261014.md)。A最终施工树 `D:\Narraverse-World-Map\hds-d4-cp1a-review` @ `codex/world-runtime-d4-cp1a-review`，提交 `254c27d143f735dfff2051f561dee129012b5a99`（父 `970471ab38b196c4f2f1e39d0bed026006ce2ff8`，仅两项A测试及478行，工作区干净）；90个生产文件hash不变。已按用户授权推送并读回，未合main/deploy。CP3结果及实测/交付UI字节差异见[D4A CP3复核](docs/runtime/D4A-CP3-REVIEW-20261014.md)。
- D4B 独立验收测试提交 `f0fa73dd2b41db6fb5aa1c11a221a3fa142ae30a`，父/A生产基准 `254c27d143f735dfff2051f561dee129012b5a99`；B树干净且仅三测试文件，90个A生产文件rawhash不变，A/B归一化后90文件一致（74字节完全相同，16仅CRLF/LF差异）。19个唯一成员分批通过：14 H1–H5（含H4预检）、1 H2 retention、3 H6、1 H7 HTTP（定向补验1/1，101460.3776ms，exit 0），非一次19/19。完整180 tick浏览器链与128 journal/129正式档预算复用A原始证据；B未运行完整UI H7。原RED、中间失败及两次取消均保留。A/B任务分支已推送并读回，存档标签指向B提交。
- D4性能限定不可变完整审计复用：树 `D:\Narraverse-World-Map-d4-performance` @ `codex/world-runtime-d4-performance`，基准 `f0fa73dd2b41db6fb5aa1c11a221a3fa142ae30a`，候选 `611b3aff1e98150af069478a50e09923f4d5f633` 已推送GitHub并读回、工作区干净；7路径（6 production + 1 test），134+/22-，未合入main/deploy。固定4 actors、seed42、Gift+Travel12、2 journal、并发1：Travel提交 13941.0633→2704.5997ms，正常重开 12756.2005→2957.6288ms；完整bundle/journal/五投影 SHA 与基线相同。最终定向运行10/10，0 failed/cancelled/skipped/todo，30083.8052ms；真实EACCES保旧、幂等、外部service篡改拒绝、完整恢复、公开mutable副本与getter=0边界均通过；非D4全合同重跑。原immutable misscache中间样本保留。见 `artifacts/d4-performance-20261014/final-acceptance-index.json` 与[任务书及测量回执](tasks/D4-PERFORMANCE-IMMUTABLE-AUDIT-TASK.md)。该611b3aff当时只验短历史；后续D4P3已完成到tick180的固定样本，128commands性能、p95/峰值仍未验。本轮无browser/visual/full重跑。
- 流程优化已分给独立Codex对话 `01a133e5-db80-7e81-af05-941188b1598e`（DSH｜流程优化与中断恢复）；任务书/修复/实验全部在 `E:\codex\2026-10-13\dsh-workflow-optimization`，本项目仅只读参考，禁止改活动STATE/源码/合同/看板或续派业务。当前对话继续业务派工验收；两路不得共用包工头写入会话。
- D4 体验目标：给同村猎人一份私粮→立即记得本人收粮→日结实际吃粮→去森林完成遭遇→返回/刷新/关闭重开仍是同一人。局部知识展示同地点公开人物，不泄漏他人私账，不加信任或模型。合同版本、文件范围与手算见任务书，D 整体仍待体验收口。
- DSH 流程优化已落地：原包工头会话 `session-2564efe0-949b-48ed-90a5-f7f7feb9cbce` 使用Global DeepSeek Flash完成复盘与两名顺序工人接续演练；Codex独立核对并修正停止证明/证据归属。运行册 `D:\Narraverse-World-Map\docs\operations\DSH-TEAM-RUNBOOK.md`，持久检查点 `.dsh-team/STATE.json`；原生任务task-24/25为历史演练完成；当前业务状态以CP2c复核及A/B验收记录为准。
- 流程默认短工单/并发1、额度与502分流、最多一次重试及一个获准免费备选探测、工人和包工头各自落盘检查点；同文件换写者须有停止证据。CP2c门与上一轮真实128 journal/129档预算门均限定PASS。用户明确继续后，CP3严格day144续接1/1 PASS，与首轮已确认Gift/day144合并形成CP3功能门PASS；不是一次fresh完整全绿，首轮1 fail仍保留。A候选 `254c27d` 已就绪，D4A/B冻结功能PASS、D4不可变审计复用性能slice限定PASS；D阶段整体仍进行中。固定长历史样本后续已由D4P3补齐；更大历史、128commands性能、p95/峰值仍未验。细节见[D4A CP3复核](docs/runtime/D4A-CP3-REVIEW-20261014.md)、[D4B复核](docs/runtime/D4B-REVIEW-20261014.md)及D4性能任务书与测量回执。
- 更早的R3、DSH停工与接管过程、旧候选拒收和上下文恢复等活动流水压缩为历史；本地证据相对路径：`artifacts/world-runtime-d35-hour-review-20261012/repair-workers-latest.json`、`artifacts/world-runtime-d35-r3-review-20261012/`。历史状态不代表当前验收结论。

## 证据入口

- [M4A 公共合同](tasks/M4A-BOUNDED-SURVIVAL-TASK.md) ·
  [M4B 独立验收](tasks/M4B-SURVIVAL-ACCEPTANCE-TASK.md) ·
  [M4B 最终复核](docs/runtime/M4B-REVIEW-20261011.md)
- [D3-1 预留内核](tasks/D3-1-ENCOUNTER-RESERVATION-TASK.md) ·
  [D3-2 世界候选](tasks/D3-2-ENCOUNTER-WORLD-TASK.md) ·
  [D3-3 命令会话](tasks/D3-3-ENCOUNTER-SESSION-TASK.md) ·
  [D3-4 战斗内核](tasks/D3-4-ENCOUNTER-COMBAT-TASK.md)
- [D3-5A 实现与公共合同](tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md) · [D3-5B 独立验收](tasks/D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md)；发布SHA：A `d13a89768c652f74c0c4278eea4f227cf4660a98`、范围补充 `f667adfcc47e1c470df9687eb2053906d83c3230`、合同rev3 `c83492dfb56b98bfdd1976196929c2d97f1f35db`。
- 本轮前旧版完整历史与细节：控制仓库快照 [3361d653](https://github.com/llys-p/Narraverse-World-Map/blob/3361d653a61d0ee7901426f3edd41b951017e2d6/PROJECT_CONTEXT.md)。
  历史日期结论只代表当时证据范围，不替代当前合同或源码核验。

## 角色与看板

- 总方向与架构仍由“GPT6 Astra world Map总负责人”对话负责；本对话“世界运行 主线 发布任务 2.0”（Codex thread `01a13984-749d-7e83-9181-0f10d795bc5d`）自2026-10-14起接替日常派工、独立验收与看板收口。
  旧主线“世界运行 主线 发布任务 1.0（历史）”（`01a11464-319d-7201-97d0-ab6059fe788f`）仅作历史记录，不再作为活动派工入口。具体交接使用当前源码 SHA、合同和证据索引。
- DSH 包工头链接仅作历史交接入口，当前 D3-5 施工已由授权的 Codex 子代理完成；体验结论仍由对应体验对话核实。
- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)，
  owner `llys-p`，project #2；状态变化需读回并链接证据。
  正式平台 Project #1 独立维护。
- D4P2卡 `PVTI_lAHOEF9IDs4BmADfzhA2qB8` 与D4P3卡 `PVTI_lAHOEF9IDs4BmADfzhA3b1M` 已先登记待验收，再逐字/按字段ID读回 Done / 已验收（测量/编码优化限定PASS）；D仍 In Progress / 进行中，D4A/B仍Done。收口报告提交 `75fb5d34febdf733d2e714fcda7cf4f4caebd46e` 已推送；独立原始索引/看板读回证据在 `artifacts/d4p3-review-20261015/`。本轮无业务重跑，最终源码2936233已推送读回且干净。
- D4P4卡 `PVTI_lAHOEF9IDs4BmADfzhA4L_c` 已先待验收再读回 Done / 已验收（候选比较范围完成，不代表四模型代码均通过），D仍 In Progress / 进行中、D4P2/P3仍Done；报告提交 `4d348e2b504ba02b0451c5f86b0f999f3a9c86e8` 已推送。原始模型输出/manifest/候选索引/一次开档及看板读回在 `artifacts/d4p4-dsh-20261015/`，各树另保留测试/反例和Hy3手动恢复回执；所有已派原生run终态，无旧实例启停。
- 本轮合同 rev3 勘误 `c83492dfb56b98bfdd1976196929c2d97f1f35db` 已推送并读回；D4 原预规划 `cb0067a` 保留为历史；历史发布时A/B任务待派。
  D卡正文保留D3-5限定PASS并登记D4发布；D阶段仍进行中。A候选提交 `254c27d` 已就绪，B独立验收H1–H7功能合同限定PASS；D4功能范围已限定PASS，不等于性能通过或D阶段整体收口。原D4状态卡与证据保留，项目简介未改。
  此前不可变审计复用slice的D卡已同步并逐字/按字段ID读回，仍In Progress/进行中；证据 `artifacts/world-runtime-d4-performance-review-20261014/board-verification.json`。D4A/B冻结功能PASS与存档tag不变；该历史轮次性能只限审计复用slice。此前D4B、CP2b/CP2c与合同发布证据目录保留，均只代表当时范围。
  旧接入边界方案标为冻结前历史，不以其“待冻结”措辞阻塞正式A/B合同；源任务副本与控制树逐文件指纹相等。
