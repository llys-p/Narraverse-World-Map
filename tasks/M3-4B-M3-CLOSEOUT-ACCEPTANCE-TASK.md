# M3-4B：服务与检查器独立验收、完整 M3 收口

合同版本：`m3-closeout-contract-v1`；状态：待派发，未开工。共同 DTO、服务版本、场景输入和业务边界唯一权威见 [M3-4A](M3-4A-COGNITION-INSPECTOR-TASK.md)，本文件只规定独立验收和阶段门槛。合同本地发布 SHA：`fb4e5007ecde38df0553aa8ccc4d2dbe716f4a2b`。

## 给用户看

核对检查器是否读取真正提交的世界：本人工作拒绝影响下一次选择，合法交易恢复付款条件后，本人四次真实工作成功使旧失败离开四样本窗口；低频期间旧计划仍执行。检查器只读，展示不制造行动或心理事实。完整 M3 通过须同时具备实际 HTTP、真实浏览器、保存恢复、独立反例和阶段完整相关回归，不能只凭页面能打开或单元测试数量。

## 给 AI 看：基准、依赖、所有权

- 唯一代码起点：`D:\Narraverse-World-Map-m3-cognition-integration @ codex/world-runtime-m3-cognition-integration`，`6562460c2a0610afff6ba49f25524e1ae191b8c5`；其中生产修复 `0e58d5b39286f23e87cab2e978f57b683e90902b` 已包含，不能退回原 A `1b117d8`、旧 a638 或 main。
- 计划 B 树：`D:\Narraverse-World-Map-m3-closeout @ codex/world-runtime-m3-closeout`。发布前路径/分支不存在；建树前重新核对。独立 worktree/clone 均可，须从精确基准建立，记录实际 git common dir、origin 和 owner；本地 origin 不代表 GitHub 备份，不覆盖/重置/清理已有树。
- A 交付后由中控派发其精确 SHA，再导入指定生产及 A 测试字节。B 可先写独立期望，但未得 A SHA 不猜导出、不用任意最新树。导入冲突由中控处理。
- 长文本、机械操作和可拆分测试使用 high 推理子代理；每个测试文件唯一写入者。B 不修 A/生产、UI、core、合同或看板。失败精确报告中控，不为了绿灯改 expected、预算或业务输入。

## 精确文件范围

仅新增以下四份独立验收文件：

- `tests/simulation/cognition-service-acceptance.test.mjs`：真实 owner/HTTP、投影权限、事务与完整 journal 重演。
- `tests/simulation/m3-closeout-acceptance.test.mjs`：固定学习 ON/OFF、真实成功窗口、continuation 重启、业务输出对照。
- `tests/cognition-inspector-acceptance.test.mjs`：真实浏览器与只读交互、当前/冻结读数区分、旧 M1/M2 消费回归。
- `tests/simulation/m3-required-evidence.test.mjs`：required 依赖/oracle gate 的独立子进程反例；不运行无关旧长场景。

仅额外允许修改 `tests/simulation/experience-runner-acceptance.test.mjs`，且范围严格限于原 `gate()`/`loadOracle()`/E7 指纹门的 required 前置校验及本地路径解析；不得改原场景、公式、业务断言、optional 标识或扩大测试内容。此例外由本轮明列，不能夹入 A 文件或先前 M3-3B 白名单。

## G0：required 证据先行，缺失必须阻断 PASS

- 原 E7 的两个 oracle `catch { t.skip(...) }` 与精确 A 缺依赖的 skip 改为明确失败/前置阻塞：缺required实体/依赖为 `REQUIRED_EVIDENCE_MISSING`，不合法RAW/payload为 `EVIDENCE_INTEGRITY_FAILED`，已可解析但未知schema/baseline为 `UNSUPPORTED_EVIDENCE_VERSION`；均为本地验收错误，不新增HTTP错误协议。未知 export、SyntaxError、transitive missing、初始化错误继续 fail；禁止兜底 mock、宽泛 catch 和永久缺失断言。
- `M34_ORACLE_FILE` 可指定本地只读 oracle；未设置时沿用原控制路径。只能指定证据实体，不能作为世界配置/业务输入或 HTTP 选项。文件缺失、损坏、未知 schema/baseline、RAW/payload 不符均非零；permission/I/O 错误不得被解释为合法缺文件。
- E7 权威基准 `87aa9b605f5f509ce3b0daa97e34ded004d22f33`，schema 2；RAW SHA256 `e7fee8c0bd872a8294615172dd4ee7fef6e6464663d2df9fc4099d9261221b18`；canonical `{scenarioSpecs,provenance,results}` SHA256 `1ebe129b1a252434e8b103796778f3b71f9ffc6587cb0578f8ea7828d6c87f67`。原件 `D:\Narraverse-World-Map-m2-acceptance\artifacts\world-runtime-m2-acceptance-repair-20261008\legacy-oracle-87aa9b6-v2.json`。
- C8 冻结 manifest `8c8abf2feff514f9a1d289b93cf5c64344c56c3817d021c16307c97fa2040346`，来源 a638、experience-village seed42 四日，23稳定文件+完整 bundle；位于 `D:\Narraverse-World-Map-m3-cognition-acceptance-review\artifacts\world-runtime-m33b-preparation-review-20261009\legacy-baseline\`。不得用当前 candidate 生成/更新 expected。
- 换机由中控移交必需实体与 locator manifest，按包内相对路径定位后核哈希；现成本地恢复包与索引由控制树 `D:\Narraverse-World-Map-control\docs\evidence\PRESERVATION-20261009.json` 提供（不假定该文件已进入运行时代码基准）（原九源包不含新的 M3-3/M3-4 交付）。只有一张裁定 JSON 不足以替代 required cache。
- 子进程反例至少覆盖：oracle不存在、RAW损坏、错误schema/基准、缺必需依赖。用本路临时副本，不移动/损坏/覆盖原 oracle 或源码；每例断言明确错误和非零 exit、无 skip/假 PASS。修改 schema 的副本无需伪造可过权威哈希；结构/指纹门拒绝即可。缺证据是验收 blocker，不是自动生产缺陷，也不得裁 M3 通过。

## G1：真实 format6 服务、完整提交与旧边界

- 仅 cognition-village / m-cognition-v1 新增 serviceFormatVersion6；不把 experience-village 静默伪装成 format6。旧1–5、apiVersion1、命令DTO1/2、checkpoint1和旧 namespaces 保持原行为。
- 从默认 profile 创建、从合法显式 checkpoint 初始化新的 writable 目录、已有 service6 目录正常关闭再重启恢复都通过。拒绝 profile+checkpoint 同传、已有目录重置 profile/checkpoint/seed；不能篡改规则以借旧 PlayerKnowledge 投影。
- `/capabilities`、`/snapshot`、`/player`、`/minds` 真实消费完整提交世界，三投影 simulationId/tick/revision一致；玩家 actions 使用真实 cognition 描述器，知识只限本人。重复 GET/HEAD 与检查器刷新不推进时间、不改输入/RNG/IDs/日志/磁盘字节。
- 既有 Host/Origin 保护后，inspectMind 默认关闭时任何 method/query/static 都404；启用且有能力时 POST→405、GET+query→400，HEAD 同状态/头无正文，三个静态资源同门。不提供新的写接口。
- DTO1 AdvanceTime 与 DTO2 真 PlayerBuy/PlayerSell（至少一笔）走 format6 canonical transition；七内部命名空间对两种 DTO 都拒绝。相同 commandId+完全相同 DTO 在当前/重启后幂等；同ID异输入为 COMMAND_ID_CONFLICT 409，新的过期 expectedRevision 为 REVISION_CONFLICT 409并带 currentRevision；别把同ID原DTO误判 stale。
- 真实 `io.link`/durable save 故障：未失败路径必须调用真实 fs.link，不能 no-op。失败前后完整 public/player/mind DTO、旧 service 文件 bytes 及可提交 revision相同；修复并重试一次才一起 swap，重启仍只提交一次。存盘过程中GET只能读旧提交，不读临时候选。
- 对合法 service6 成员做实质变化：anchor/config、commands顺序或DTO、receipt、最终bundle/cursor/mode/样本，确认 canonical 已变化；即使重算显示哈希也被完整 journal/world replay 拒绝。保留原输入，无部分更新。

## G2：真实工作学习闭环，固定输入独立手算

- B 按 A 共同合同的字面 patch 自己构造配方；不能拿被测 `createM3CloseoutConfig()`、projection/derive 函数输出当 expected。先核 A helper 配置与合同固定输入等价，再实际加载 tick0 checkpoint；完整离线探针 actualTimeline 只是基准可行性记录，不是未来 B oracle。
- ON/OFF 两世界除了 useWorkExperience 开关完全相同，seed42、simulationId、初态、请求和玩家操作一致。所有 HTTP命令 expectedRevision 必须读取实际前态；不能调整输入以避失败、直接注入经验或公共现金。
- 日2 Work710 > Use700，真实 RULE_REJECTED，最近窗口为F、penalty100；日3 ON Work610 < Use700，实际用药，OFF Work710 > Use700、实际再次拒付。ON 用药成功不增删 Work 样本、penalty仍100。
- tick432后合法 PlayerBuy herbs4 实付100、公共可支付资金10→110，不是直接改账。随后同 actor 的真 Work 成功分别在日5/6/8/10，四窗 `F,S → F,S,S → F,S,S,S → S,S,S,S`，penalty `100,100,100,0`。可以夹自然 Rest；四次连续工作结果成功不等于四个连续世界日。每个样本必须证明 Planned→权威 receipt/Committed→Resolved→Observed、工资20与同人因果。
- 日11 Work730 的零惩罚进入候选。旧失败事实和旧决定/knowledgeFingerprint 保持原字节，不能重写过去；源eventSeq按真实command/因果查找，不把探针数字当永久协议。
- ON/OFF完整服务重演、checkpoint/独立直跑业务 bundle 对照一致；tick432关闭owner、同目录恢复后仍显示同一失败与旧决定，然后继续同操作，最终与无重启控制链字节相等。四人12日存活是本短场景要求，不是100日平衡/自主取食保证。每世界14命令、初始加后续共15个service文件，预算内完整推进。

## G3：低频延续与读数语义

- 独立 continuation config 仅 actor2 importance400、requests空，保留默认市场 stimuli与身体条件。真实 day144 review买药后关闭/恢复同service目录，day288 maintain用药；同Goal/Plan IDs及旧review anchor、nextID不增加、新command、空candidates、正常日结与保存恢复；不能用该成功代替 G2 的 Work成功。
- 新 projection 的 workExperience/cognition 是 actor 内的开发者读数，位于 knowledge 之外。Knowledge 只能为 committed 本人 DTO；禁止把调度器元数据或他人私账塞进决策输入。错误演员身份、getter、稀疏/异类对象、预算与篡改 bundle fail closed；成功返回 detached clone。
- UI区分事实、当前本人知识、冻结决定、权威结果、当前经验窗口；当时经验只取冻结 fingerprint 中的 summary，不能用当前 samples 伪造当时历史。OFF记录照常、惩罚不消费；maintain空候选必须显示本次未比较，dormant不假称新行动，counterfactual null不调用旧M2打分器。

## G4：真实浏览器消费者（必需，不能 mock PASS）

- 使用已配置/现有浏览器驱动和本路 port0/已核实空闲端口；driver若需要额外安装先报告，不为本任务擅自装工具。缺驱动、页面无法加载或断言失败均阻断正式 M3 PASS，不 skip/todo。
- 浏览器实际加载 `/runtime-mind.html`，同源真实API。至少在日2失败、日3ON改选、日10窗口归零、continuation日2maintain 四个断点刷新、选择actor2/actor3并核可见内容与当时API匹配；选择器/键盘1、2/R、刷新、双页签只GET，不改世界。
- 迟到低revision与断连保留最后读数，显式失败状态；不能清空后显示成功。页面内只 textContent 显示带HTML的合法名字/可展示字符串，不执行注入。记录pageerror、console/request/status与真实POST来源；只读检查器本身零POST，驱动阶段推进的同源harness/既有runtime-map POST单独标注。
- 旧 M1/M2 真实API/页面局部回归：已有块保留、新经验/认知块不冒出、反事实仍原M2语义；从固定旧配置/API核对用户读数，不能因源码身份变了要求runner sourceHash仍相同。M1旧permanent browser占位不算本门证据。

## G5：完整 M3 收口一次、证据口径与失败处理

- A先交付，G0–G4以及直接旧service/UI回归先跑；失败修复只复验改动与直接风险。最终生产和 A/B 测试字节冻结后，由中控协调 B 跑一次完整相关 native suite，避免A/B/中控同时重复整套。结果记录精确SHA、Node、文件list/hash、TAP、exit、pass/fail/skip/cancel/todo、耗时与前后源码/测试指纹；不得硬编码未来用例总数。
- 选择规则：全部 tracked `tests/simulation/*.test.mjs` + `tests/export-boundaries.test.mjs` + 根目录三个旧/新 UI单测 `mind-inspector.test.mjs`、`motivation-inspector.test.mjs`、`cognition-inspector.test.mjs` + 本轮 `tests/cognition-inspector-acceptance.test.mjs`。按路径排序，使用 `--test-concurrency=2`，浏览器门按环境可独立顺序调度但归入同一最终收口结果；同一测试不可重复计数。
- 明列排除两个历史根目录验收文件 `tests/mind-inspector-acceptance.test.mjs`、`tests/motivation-inspector-acceptance.test.mjs`：前者包含永久browser占位，后者绑定旧阶段准备/源码身份与独立旧browser；其 HTTP/UI必要兼容由 G1/G4 本轮真实门替代。不是按失败临时删名单，不称“仓库所有测试全跑”。其余不临时排除、取消或跳过 required 成员。
- 某个库/CLI失败被作者称为环境问题时，保留实际路径/命令/错误并在干净656基准仅复现同失败；相同失败可定位为既存问题，但仍明确列 blocker/合同范围与中控裁定，不能一句“14项同败”自动免责。required失败、未跑、skip/cancel/todo均阻断正式PASS；全套初始失败保留，修复后只有受影响门需重跑，报告分次覆盖，不伪称统一一次全绿。
- Native完整相关suite、G0–G4、格式1–5兼容、真实学习/continuation、readonly与保存恢复全部通过后，B仅建议 PASS；完整M3最终由中控核验实际字节与证据裁定。阶段未收口前不发布自主取食或D3/D4。
- 独立完整指纹集合至少覆盖所有 runtime `.mjs`、`runtime-server.mjs`、`simulation-runner.mjs`、`runtime-map.html/mjs/css`、`runtime-mind.html/mjs/css`及选中测试。runner sourceHash的局部范围、全生产清单、证据包成员清单分开命名与核验。
- 交付 manifest 含原基准/A依赖/B测试SHA、输入/输出、required oracle来源/实体与RAW/payload、分次命令与未验项、可移交相对locator；不得收ModelBench、secret、用户旧存档或无关大片CSV/截图。截图/TAP可作证据但不替代业务值，候选不更新expected。

## 命令、回执与停止

    node --test --test-concurrency=2 tests/simulation/cognition-service-acceptance.test.mjs tests/simulation/m3-closeout-acceptance.test.mjs tests/simulation/m3-required-evidence.test.mjs
    node --test tests/cognition-inspector-acceptance.test.mjs
    node --test --test-name-pattern '^E7 oracle 指纹门' tests/simulation/experience-runner-acceptance.test.mjs
    git diff --check

完整相关suite先生成固定文件manifest再按G5执行，不在发布时运行。本路本地精确commit后停止：不push/main/deploy、不改control/看板，不自行续开下一阶段。回执两块：用户看到的完整体验、问题与未验；AI接手所需目录/分支/实际依赖及测试SHA、白名单diff、真实命令结果、完整TAP/矩阵/locator、PASS/NEED REVISION建议与停止点。仅准备测试且A未到时逐项标待验，不能把“已写断言”当通过。
