# D4E9：玩家村庄劳务收入闭环（冻结施工合同 v1）

2026-10-17（Asia/Shanghai）。**状态：2026-10-17 用户明确确认“按草案开工”；规则及接口冻结，实施中。** 用户在D4E8交付后要求继续；本草案把此前明确未实现的新增收入来源具体化。新增玩家命令、收入账本和档案版本属于重大玩法/数据语义变化，确认本节参数与边界后才能实施；当前D4E8体验版继续保留。

## 给用户：做什么、为什么、需要确认什么

现在玩家初始有20份私粮、0金币；只能卖掉已有物资得到钱。NPC虽然有WorkForPay，但它属于NPC私账/日规划，玩家不是society agents，不能借NPC身份执行。

建议只加一个明确的「村庄劳务」动作：玩家主动点击，工作6小时，完成时由公共可用金币支付20金币，增加150疲劳。同一玩家两次成功工作的开始时间至少相隔24小时；途中发生的日结、饥饿、生死仍真实推进。然后仍用原买粮与日结，形成 **工作→收入真实入账→买粮→每天消耗私粮→保存重开**。

| 参数 | 提案 | 依据/性质 |
|---|---|---|
| 地点/身份 | 村庄，存活actor-4；非遭遇中 | 复用原玩家位置、生死与遭遇占用门 |
| 工资 | 一班20金币，从公共可用金转给玩家 | 与现行NPC工资20一致；不增加总货币 |
| 工时 | 36tick，即6小时 | **新增玩法参数，待确认**；1tick=10分钟 |
| 成功间隔 | 两次成功工作的startTick至少差144tick | **新增玩法参数，待确认**；限制连续刷班 |
| 疲劳/身体门槛 | 完成时+150；开始/完成时health≥300且fatigue≤700 | 借现有NPC工作疲劳与身体门槛；不把NPC日规划搬给玩家 |
| 食物产出 | 0；工作只支付工资，不直接给私粮或公粮 | 沿当前scene的workFood0；买粮仍真实扣公仓 |
| 起始资产与NPC规则 | 私粮20、金币0，NPC旧规则不变 | 不靠改初始资产掩盖收入缺口 |

这不是赚钱/生存平衡承诺。默认scene公粮有限，没有新增农产、商队补货或自动救济；公共现金不足、玩家身体不允许时工作可以失败。长期供应与NPC生计另定合同。

## 给AI：现状证据与禁止偷换

基准为 `D:/Narraverse-World-Map-trade-feedback` / `codex/world-runtime-trade-feedback`，提交 `f7bc32818f25053ef8ae564a389dcd26028bb7a0`。现有D4E8只改交易前端，核心仍c7c2132/b7。新收入不混入当前format9或旧私档。

- `runtime/core/player-state.mjs:8-11`目前只接受旅行/休整/买卖；`scene-runtime.mjs:34-46`也无PlayerWork。
- `player-state.mjs:74-77`的钱粮字段及等式严格；钱包=初始+earned−spent，earned沿旧路径为出售收入。新工资不能悄悄记成卖出收入。
- `hunter.mjs:18-19,83,102-107`定义NPC工资/公共金/疲劳；`survival-village.mjs:58-59`当前scene工资20、workFood0。复用守恒算法和门槛，不复用NPC钱包或goalId。
- `encounter-runtime.mjs:738-781`真实推进及目标tick落地次序已冻结；新工作也须在完成tick的日结之前落地，不能仅移动时钟或把UI动画当劳动。
- `runtime-owner.mjs:121-145`的profile、公开投影与提交路径，`service-commit.mjs:62-85`的完整journal/replay均需显式接新格式；禁止全局放宽版本/字段或新增trusted/skip校验开关。

## 拟冻结规则与协议（确认后转正式合同）

1. **隔离版本**：新opt-in fixture `scene-livelihood-village`、rules `d-scene-livelihood-v1`、serviceFormatVersion10；新memory-config-v7→society-config-v6→player-state-v4配对。既有schema3快照结构可保持，只有新rules配对接受新世界/玩家账本。旧profile、DTO1–3、format1–9和旧存档语义完全保留；旧scene拒绝PlayerWork，不自动升级/迁移/重写八档。
2. **客户端只提意图**：新profile commandDtoVersion4；请求仍精确 `{version,commandId,expectedRevision,type,payload}`，新增type=`PlayerWork`、payload精确`{}`。客户端不能传工资、工时、疲劳、公共余额、目标actor或日期。新profile的既有旅行/交易/赠粮/遭遇/时间命令也使用DTO4；old profiles继续原版本，不做降级猜测。
3. **新账本**：新player-state-v4沿原字段，ledger增加`wages`、`workCount`；增加`lastWorkStartTick`（初始null，成功后记录本次实际startTick）。钱包等式改为初始+出售earned+工资wages−spent；wages=workCount×20，私粮旧等式不变。lastWorkStartTick只能由成功工作更新，与严格输入重演一致；失败、重试、恢复不增计数。配置中的工资/时长/间隔/疲劳/门槛是有界冻结整数，不读墙钟或模型。
4. **公共金守恒**：公共可用金币=world.resources.gold−全部NPC钱包−玩家钱包（死者保留资产照计）。支付前公共可用金≥20；成功玩家钱包+20、公共可用金−20，总金币不变，NPC钱包/粮药不变。没有免费发钱、虚构卖出、隐式私粮或浮点溢出。所有计数/加法/nextWorkTick需安全整数/BigInt核对。
5. **开始与完成重校验**：开始时检查村庄、存活、非遭遇、身体、冷却、现金及溢出预算；拒绝遵循原scene零tick且revision+1的正式domain receipt。接受后真实执行36个tick，完成前重新检查付款与身体/位置，成功才付钱/+150疲劳/更新工作账；成功间隔为`newStartTick>=lastSuccessfulStartTick+144`，不是按电脑日期。完成tick先落地工作，再跑该tick日结。若期间死亡或完成条件不满足，不付钱不增加工作账，但已经真实经过的36tick及其日结事实保留；不能回滚生活事件来伪装没经过时间。
6. **持久失败与业务拒绝分开**：业务完成时拒绝按上一条保留真实时间，无工资；磁盘发布失败则整条候选不发布，owner仍旧版、投影/内存/磁盘不出现半笔工资。恢复的坏最新正式档显式失败，不能回退旧档隐藏坏账；临时文件不当正式档。
7. **结果与事实**：新profile receiptVersion4，顶层沿DTO3的精确字段（apiVersion、receiptVersion、commandId、status、fromRevision、toRevision、fromTick、tick、durationTicks、type、outcome、result）。PlayerWork成功result精确 `{actorId,type,startTick,endTick,wage,location,nextWorkTick,before,after}`，before/after只含本人wallet/fatigue，location固定实际完成村庄；nextWorkTick=startTick+144。新`PlayerWorkCommitted`只在成功时由权威输入/回执产生，与外层命令已解决事实通过commandId/因果严格关联，不能伪造或双记。工资事实不向NPC注入记忆/知识；本轮不扩心智模型。
8. **拒绝结果与隐私**：玩家死亡/遭遇占用沿既有相应码，冷却/身体/地点/公共金等按通用RULE_REJECTED；不向前端暴露隐藏公共金币余额。DTO格式/未知字段/工资注入等为解析层4xx且无提交。新profile客户端严格校验receiptVersion4和PlayerWork结果，不因新命令跳过原有回执验证。
9. **重试与重演**：同一commandId+同完整DTO优先返回原回执（含重开后），不因expectedRevision过期再付工资；同ID异载荷拒绝。完整历史必须从规范初态按新规则复现钱包、工作计数/时点、疲劳、日结、RNG、事件、命令回执/输入、遭遇和所有计数。工资/计数/冷却/回执/事件改动后即使重算指纹也拒绝。
10. **只读消费者**：capabilities显式标明DTO4与work可用；玩家actions新增仅本人/公开规则可知的工作报价 `{wage,durationTicks,fatigueCost,nextWorkTick}`。前端只据位置/生死/冷却/身体/占用做本地提示，公共付款能力仍由服务裁决。地图或村庄一个「工作6小时 · 预计20金币」按钮，显示权威回执、钱包与冷却。默认旧profile不显示新按钮。不新增HTTP路径/客户端世界状态，也不更换旧日常入口。
11. **派生展示**：活动沿现有有界DTO的`player-action`类型展示一次成功/拒绝；成功工作从真实location/receipt得工资与疲劳变化，双事件只生成一行。读取窗口、64条/65536字节和原知识隔离不放宽。日结仍每天只消费一次本人私粮；不会因新工作再扣一次粮、额外发药或重算NPC工资。

## 实施切片、所有权与最少验证

确认规则后先冻结最终文件白名单和接口，再分三片推进；目前不创建执行树、不运行样本、不派实现工人。

| 片 | 具体交付 | 验证范围/停止点 |
|---|---|---|
| A 核心规则/新版本 | player-work小内核，新玩家工资账与显式新profile/配置配对；旧profile保持 | 工资守恒、身体/地点/冷却/现金/整数边界、新旧版本混配拒绝的最少定向成员；不称可玩闭环 |
| B 权威事务/恢复 | 新profile接command engine、完整事件/输入/receipt重演、format10服务与owner发布 | 真实owner工作及同ID重试/恢复；一次工资/事件/冷却篡改拒绝；一次发布失败原子回滚；同源证据不泛跑 |
| C 页面消费者闭环 | DTO4各已有消费者兼容、工作按钮、本人报价、派生活动；独立启动包 | 单一新seed42真实页面：work到36→买2粮到37→推进107到144，期末工资20/花20/金币0/私粮21；只一次日结；正常关闭重开五读数/档/回执/工作账一致 |

上述参数下工作后疲劳+150；日结继续原有规则，可能恢复部分或全部疲劳，不新造小时作息系统。C的期末私粮21是规范初始20+买2−吃1；NPC本次实际行动/未行动按真实记录，不以永久存活或NoAction变少为门槛。

高耦合的A/B由中控或适合复杂规则的模型负责；C的既有UI接入可交性价比模型，单写文件分配，根代理独立核验。用户禁止全量/无关/视觉/边角扩展继续有效；新改职责必要的输入边界、权限、持久审计和恢复不能省略。

## 文件影响面与预算（待冻结精确白名单，不是改动授权）

- 核心：拟新`runtime/core/player-work.mjs`、`scene-livelihood-runtime.mjs`及新fixture；现有player-state、society、memory/motivation profile配对、scene/encounter工厂、command-engine、data-contract、event-log、world-state仅按新分支接入。不得把PlayerWork塞入旧scene规则；共享旧函数若需要参数化，保留旧参数默认值与精确拒绝语义，避免复制整套Runtime或搭通用插件框架。
- 服务/知识：http-contract、service-commit、runtime-owner、runtime-server的显式新profile与格式门；必要的player/scene/encounter知识派生新profile支持、world-activity。没有新事实的NPC知识仍按本人可知过滤，不输全知bundle给角色。
- 前端：runtime-map、runtime-village、runtime-encounter中DTO/receipt版本分派与工作入口；旧capabilities/DTO分支保持，场景/战斗原有功能不能消失。新启动包用全新端口/目录，不覆盖旧Start-D4或导入其档。
- 测试只新增本片定向文件，不删除/放宽/跳过原测试。每个Node进程设硬超时并记录首次输出；root整链每动作120秒、总600秒、退出确认5秒；若首轮超时先保全诊断，不自动重测新故事或启动性能优化。旧长历史/H7/128命令链不复跑。
- 进入施工前要按上述源文件影响面冻结逐文件责任和实际运行命令；若发现需改变现有社会/记忆语义、奖励/生产规则、NPC身份或更广泛重构，退回设计，不交给执行者猜测。

## Reference Review与备选

采用：现有NPC工作工资/疲劳/公共金守恒、玩家独立库存、单写者命令事务、显式版本隔离和完整重演；继续让UI只提出意图。新增参数是本项目小规模玩法选择，不伪称成熟产品或历史平衡结论。

暂不采用：击杀奖励（需掉落/资源来源与多次领取规则）、直接加初始现金（不能解决持续收入）、让玩家冒用NPC WorkForPay（身份/日规划/私账错误）、泛化职业/任务/商队系统（当前消费链不需要）。6小时与24小时间隔可在确认时调整，不能在验收不佳后静默改门槛。

## 保护、同步与停止

本轮只写方案、外部产物静态评审和唯一状态；原八档/当前生产源码/五旧文件/18325及18327服务不动，不运行/上传私档。规划文档推送`codex/world-runtime-control`供用户/GitHub AI读取；看板可登记Todo/待确认，不登记实现进行中或已验收。待用户确认新玩法与版本隔离，再冻结施工合同并开工。D整体仍进行中，Issue3暂停，无main合并、部署、迁移、DSH或第三方模型调用。

## 2026-10-17 用户确认后的施工冻结补充（优先于上文草案流程措辞）

用户已确认6小时、20金币、疲劳+150、成功开始间隔144tick。上文“待确认/未开工/拟”仅保留设计沿革，全部规则和接口按第1–11条冻结。本轮实施树 `D:/Narraverse-World-Map-player-work`，分支 `codex/world-runtime-player-work`，基准 `f7bc32818f25053ef8ae564a389dcd26028bb7a0`。不合入main、不动旧存档/服务。

精确文件白名单和所有权：
- 核心执行者：runtime/core/{player-work,scene-livelihood-runtime,player-state,society,hunter,memory-runtime,mind-runtime,motivation-runtime,scene-runtime,encounter-runtime,encounter-session,command-engine,data-contract,experience-state,event-log,world-state}.mjs；runtime/fixtures/scene-livelihood-village.mjs；runtime/knowledge/{player-knowledge,actor-knowledge,encounter-knowledge,scene-knowledge}.mjs；runtime/service/{http-contract,service-commit,runtime-owner,world-activity}.mjs；tests/simulation/player-work-{runtime,service}.test.mjs。只改新profile必要门和hooks，不改变旧profile规则。
- 页面执行者：runtime-map.{mjs,html}、runtime-village.mjs、runtime-encounter.mjs；只消费已冻结DTO4/receipt4和player.actions.work报价。capabilities增加playerWorkAvailable:true，仅format10。新profile所有命令version4，旧profile严格保持3或原值。
- 中控：runtime-server.mjs（仅capability/maxAdvanceTicks/新版本命令路由必要改动）；Start-D4E9.cmd；README.md；PROJECT_CONTEXT.md；本任务合同；docs/runtime/D4E9-PLAYER-WORK-RESULT.md；scripts/verify-d4e9-player-work.mjs；本轮docs/evidence/d4e9-player-work-20261017/脱敏摘要。若必要文件超白名单，先报告根代理核定，不自行扩散。

冻结导出：新模块导出LIVELIHOOD_RULES='d-scene-livelihood-v1'、LIVELIHOOD_PROFILE='scene-livelihood-village'；fixture导出createLivelihoodVillage/defaultLivelihoodVillageConfig/livelihoodSystems；新player.actions.work={wage:20,durationTicks:36,fatigueCost:150,nextWorkTick:null或安全整数}。新runtime owner.commandDtoVersion=4及playerWorkAvailable=true。完成工作receipt4 result精确字段沿第7条。

最少运行命令：`node --test --test-concurrency=1 tests/simulation/player-work-runtime.test.mjs`（父硬限180s）；对应service文件（父硬限360s）；`node scripts/verify-d4e9-player-work.mjs`（单动作120s/总600s/退出5s）。只为新命令的版本/账/校验/重演/回滚/恢复运行相关断言，保留首次失败。真实页面DOM和交互采用隔离本机临时服务，无视觉检查。端口18336待启动前查空；新启动包独占artifacts/d4e9-daily/world。无授权旧八档重演、原始文件复制或全量测试。
