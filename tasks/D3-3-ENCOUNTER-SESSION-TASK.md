# D3-3：有界遭遇命令会话

合同 d3-encounter-session-v1；代码基准 6790b4d756c506dc10325e81149146a11371068f。
施工树 D:/Narraverse-World-Map/hds-reservation，分支 codex/world-runtime-d3-reservation。
本单由唯一DSH包工头拆分、派原生子代理、监督、验收初审并维护原生任务板；Codex最终验收。

## 目标与边界
给用户看：开始/取消遭遇成为一个有状态内存会话的合法命令，返回可追溯回执；网络式重复提交不会重复扣狼或归还，过期版本和冲突显式拒绝。
本模块是后续Runtime接入的事务组件，仅拥有创建时独立复制的世界；不声称已写入原SimulationSession、旧bundle、EventLog、checkpoint、HTTP或UI。会话时间固定，不支持跨日/攻击/死亡/奖励；完整D3仍未验收。
白名单仅新增 runtime/core/encounter-session.mjs 和 tests/simulation/encounter-session.test.mjs。禁止修改已有文件及公共底座，禁止第三份生产包装器。项目文档与提交由Codex负责。

## 导出与所有权
仅导出 ENCOUNTER_SESSION_VERSION='encounter-session-v1'、MAX_ENCOUNTER_COMMANDS=100、createEncounterSession(bundle, systems)。
构造先inspectDescriptorTree(bundle)，再完整validateBundle(bundle,{rulesVersion:bundle.snapshot.rulesVersion,systems})；仅接受PLAY_RULES的合法player-play bundle，其他规则UNSUPPORTED_VERSION，非空pendingCommands拒绝INVALID_INPUT。复制输入，不接受外来frame或调用方提交的新world。复用D3-2创建frame，不修改旧校验器。
systems是受信的函数注册表，不能对函数值套JSON数据树预检：只查注册表原型/own descriptors，拒getter/symbol/非枚举项后复用normalizeSystems，不调用handler。命令缓存须安全处理__proto__/constructor等合法ID（例如Map），用独立用例证明无原型键碰撞。
返回冻结的方法对象：getSnapshot()、getJournal()、submit(command)，全部同步。内部状态和索引只能由会话闭包持有；任何返回值都为独立深副本。
getSnapshot恰6字段：version、simulationId、sourceTick、sourceRevision、encounterRevision、frame。sourceTick/sourceRevision来自创建bundle且永不变化；encounterRevision初始0，是独立会话序号，不冒充旧snapshot.revision。
getJournal返回接受过的唯一请求数组；每项恰command、receipt两字段。这个审计日志属于本会话，不是旧EventLog，不新增restore/export/advance接口。

## 请求、ID与处理顺序
请求恰4字段：commandId、expectedEncounterRevision、type、payload。identifier规则复用；revision非负安全整数；type仅EncounterBegin/EncounterCancel。
Begin payload恰空对象；Cancel payload恰encounterId。人物从受管世界真实playerModel取，客户端不可传人物、frame、狼数、胜负或结果。
会话仅一个遭遇生命周期；首次成功Begin由会话确定encounterId='encounter-1'（在此simulationId+sourceTick所标识的孤立会话内有效，不宣称跨会话全局身份）。Begin不能由客户端指定ID。
所有方法处理输入前先descriptor预检；getter调用数0，拒异类/稀疏/symbol/环/额外字段。合法null原型记录与冻结输入应可用。请求canonical UTF8预算4096字节，超限LIMIT_EXCEEDED；不引入依赖。
提交顺序：完整输入校验/预算 → 按commandId查重 → 新请求revision检查 → 新请求100项预算检查 → 候选计算 → 完整校验候选 → 一次发布frame+receipt+journal+encounterRevision。
相同commandId且完整canonical请求完全相同：返回原receipt副本（即使原expectedEncounterRevision现已过期、队列已满）；不新增日志、不改变任何状态。相同ID异输入：抛COMMAND_ID_CONFLICT，优先于版本冲突。
新ID且expectedEncounterRevision不等当前：抛REVISION_CONFLICT；不留回执、不占ID/预算。累计唯一已接受请求100项后新ID抛LIMIT_EXCEEDED。失败检查不消耗ID；修正请求后可正常提交。

## 回执与原子语义
receipt恰7字段：commandId、encounterId、type、status、code、encounterRevision、sourceTick。
status为succeeded/rejected；成功code=null；拒绝code为下文领域码。Begin回执encounterId成功为encounter-1；Begin拒绝为当前遭遇ID或无遭遇时null；Cancel回执encounterId为请求ID。
每个通过输入/去重/版本/预算门的唯一请求，不论领域成功或拒绝，encounterRevision恰+1，回执记录更新后的序号，journal恰+1。安全整数加法防溢出，检查应在发布前。世界tick永不推进。
首次Begin复用beginPlayerWolfEncounter：合法森林活玩家/有狼则14→13/reserved1；条件不满足rejected/RULE_REJECTED。活动中不同commandId再次Begin：rejected/ENCOUNTER_BUSY；已关闭再Begin：rejected/ENCOUNTER_CLOSED。
Cancel无遭遇：rejected/ENCOUNTER_UNAVAILABLE；异ID：rejected/ENCOUNTER_ID_MISMATCH（先于closed判定）；同ID且已关闭但新commandId：rejected/ENCOUNTER_CLOSED。仅active同ID正常Cancel成功：13→14/reserved0。相同commandId重试由上游去重返回旧成功，不是再次调用内核。
上述领域拒绝被显式捕获，只发布拒绝回执和版本/日志，frame逐字节不变。INVALID_INPUT、UNSUPPORTED_VERSION、LIMIT_EXCEEDED或意外异常继续抛出，整个提交不变；禁止catch-all洗成RULE_REJECTED。
每次成功候选用validateEncounterWorld完整校验。成功/拒绝都不改任何永久账、金钱、人物、原始bundle或sourceTick；不向旧bundle硬塞ACTIVE frame.world。

## 独立验收（约12–18项，按语义合并，不追求数量）
1. 真实createPlayerPlayVillage(42)，经executePlayerIntent合法旅行至forest（tick12）；创建时完整validateBundle通过。初始rev0/狼14；Begin(cmd1,rev0)→rev1/13+1，Cancel(cmd2,rev1)→rev2/14+0，sourceTick恒12；两回执与journal精确对应。
2. 同ID同请求重复在旧revision、完成取消后以及日志满后仍返回原回执；返回对象被外部篡改不影响内存。不同ID重复Begin/Cancel遵守领域码，证明与底层DTO的幂等口径不同。
3. 同ID异输入优先COMMAND_ID_CONFLICT；新ID旧revision冲突无记录，使用正确revision后同ID可提交；未来revision同样拒绝。字段/type/payload/人物注入与深层访问器拒绝，getter=0。
4. 村庄、合法死亡、零狼真实fixture的Begin拒绝；拒绝frame不变但journal/revision+1。Cancel无遭遇/异ID/closed与Beginbusy/closed逐项验证；不得用非法fixture撞上别的校验而冒充领域拒绝。
5. 以重复领域拒绝填满100唯一命令，边界内全有真实回执，第101新ID不变；第1同输入仍幂等。冻结/null原型输入可用；原bundle/快照/journal/request/receipt各副本互不泄漏引用。
6. 意外故障回滚用可复现且不依赖公共代码修改的方式验证；若同步纯模块没有可注入的后置故障点，明确标记未注入此类故障，不新增生产测试后门、不把前置拒绝冒充后置故障。
标准命令：node --test --test-reporter=tap tests/simulation/encounter-session.test.mjs tests/simulation/encounter-world.test.mjs tests/simulation/encounter-reservation.test.mjs；只新模块与两个直接依赖。已通过不变的旧全量不跑。

## 包工头执行与停止点
使用既有主对话及任务板，将pending task-5承接为本任务或关联新卡，保留历史卡。你决定具体原生子代理和依赖，最多两路，单文件单写者；实现优先Global DeepSeek，独立测试优先Global HY4，high；测试期望按本合同推导，不能读实现反抄。
先由测试路落下包含真实fixture的最小红测，包工头核红；随后实现与其余测试可按独占文件并行。包工头等待真实finished，再运行上述唯一组合验证并审查，必要修正仍通过自己的子代理。Codex不直接指挥工人。
预算约20分钟；有明确进展可给一次简短估计，遇同问题三轮失败或工具状态不可观测时停止并汇报，不无限重开代理。只在实质进度/阻塞变化时更新，禁止反复重述开工计划。
允许任务相关公开资料查证并给来源；不得读凭据/运行数据或改DSH配置。禁止提交、push、main、部署和越界改文件；付费子模型升级先请求Codex裁定。
交付：两文件、真实命令结果、任务板/子代理ID及终态、未验项和git status；到交付停止。完成本片不代表完整D3或持久化通过。

## 中控收口（2026-10-11，Asia/Shanghai）

- 限定PASS：源码4947adddddbca8f7a0478b845c8c960af2e4cda3；中控标准node --test三文件69/69（19新+36世界适配+14预留），0 fail/skip/todo、约10.1秒；语法/diff通过，测试前后哈希一致。未重复旧全量。
- 唯一DSH包工头在原对话恢复，国内workbuddy/deepseek-v4-pro high带队；本轮测试返修由免费Global deepseek-v4.1-flash high子代理26193003-7e06-4377-aa04-4f39cb7c84ff完成。包工头run145eb92b-5a81-4df4-9e81-8261a13e8fe7终态succeeded；报告全部写入者结束、原生task6/7/8完成、父task5经中控验收后completed。子代理实际计费与effective路线未返回，不称已实测费用。
- 内存会话开始/取消、回执、幂等、100项预算和单次发布已验；未注入后置故障，合同允许且已明示。未接旧SimulationSession/EventLog/checkpoint/HTTP/UI/战斗；完整D3未验收。
- 证据位于control artifacts/world-runtime-d3-session-20261011/controller-final.tap、controller-validation.json及foreman-delivery.json；源码本地提交、未push/main/部署。本片完成停止，下一片另定合同。
