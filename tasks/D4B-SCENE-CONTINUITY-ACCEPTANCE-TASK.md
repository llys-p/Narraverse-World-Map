# D4B：场景连续独立验收

合同：`d4-scene-continuity-v1`，2026-10-13（Asia/Shanghai）。生产/API/字段唯一母合同：[D4A](D4A-SCENE-GIFT-MEMORY-TASK.md)。
状态：已发布、等待A交付；可先准备独立期望，但准备完不是通过。共同发布SHA为首次引入本A/B文件的控制提交，中控回执/看板给出，开工用精确git show读取，不猜最新版。

## 给用户看

验收“给一个同村人物真实粮食、他立即记得、真实吃掉、离开回来及保存重开仍连续”，并核对村庄与森林使用同一世界。失败、未验、环境阻碍分开报告；不会把事件存在当作人物已记得，也不会把测试脚本写好当作体验通过。

## 1. 基准、依赖和唯一所有权

- 独立期望的代码基准：`D:\Narraverse-World-Map\hds-reservation` @ `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`（本地存在、未push）；控制发布前HEAD `32f98e27360cbe2d22b227713d5a82362d402ee7`。
- 建议B树 `D:\Narraverse-World-Map-d4-acceptance`，分支 `codex/world-runtime-d4-acceptance`；建树前核存在/分支占用/实际基准，保护原树。A建议树 `D:\Narraverse-World-Map-d4-scene`，**其精确交付SHA须由中控派发后导入**，不能猜最新HEAD或构造生产mock。
- 模块来自被测集成树的相对路径，或显式env被测root+完整SHA pin；不能写死绝对file://指向另一A树却把B提交当独立可运行交付。导入方式、生产SHA/测试SHA各自输出。
- A未交付只报告逐门待验，正式required验收运行非零阻断，不把skip、缺依赖、timeout或exit143记作pass。依赖缺失/工具不可用写明实体；不要降门槛或安装新付费工具。
- 仅B写三文件：`tests/simulation/scene-gift-acceptance.test.mjs`、`tests/simulation/scene-service-acceptance.test.mjs`、`tests/scene-ui-acceptance.test.mjs`。不改A生产/测试/旧oracle/控制文档/看板。证据写本树ignored artifacts，保留原失败和更正前预期。
- 测试期望按母合同手算，不能用被测函数生成expected。合法config+真实命令造状态；不edit bundle/event/receipt制造成功场景。篡改负例可改临时副本，先证canonical变化。
- 机械测试工作优先获准经济型子代理，负责人核磁盘与真实输出；模型限流报告，不自动付费/Astra。最多两写入者、同文件唯一所有权，测试顺序跑重型真实链，别并发抢服务/浏览器。

## 2. H1–H7 必需矩阵

| 门 | 独立期望与必须反例 | 真实消费 |
|---|---|---|
| H1 输入与资产 | descriptor-first/getter0、4096字节、DTO精确键及固定actor2；新旧版本配对拒串型；赠前20/0→赠后19/1，双边foodGiven/foodReceived均1，公仓/现金/药/他人/RNG零变化；拒绝优先序与容量1000，非法不占ID，规则拒绝零tick/rev+1且零赠粮事实/记忆 | 新fixture、executeSceneIntent、完整validateBundle；原配置及指纹不改 |
| H2 本人记忆与可见性 | 同提交donor/recipient各一条真实self food-gift，source/command/direction一致，首次GET可读；other actors零条、trust不涨；旧medicine-trade既有副作用保持；32条留存及重演一致；同地点人物可见公开字段，私账/精确health/原receipt/他人Goal不泄漏，死亡历史不复活，getter0 | observer、projectSceneKnowledge、scene API和页面本人表达，不只查EventLog |
| H3 日结与承诺 | no-op赠后advance144：hunterfood0/hunger100、player18、公粮464；无赠对照hunger300/player19/公粮464，两边工资/Work经验0；Gift提交不评审/清除Goal/Plan/旧decisions。earn-then-buy已有承诺中赠粮后按原条件继续/失效，不伪报完成、不误扣旧健康failures | 真实周期/命令、完整历史及对应守恒 |
| H4 服务事务与幂等 | format9、五投影同revision；原DTO重放在stale/queue16/关闭重开仍原receipt且无双赠；异DTO同ID409、新IDstale409；128journal/129service文件预算旧cap不扩；真实linkEACCES失败后五缓存/完整bundle/RNG/事件/正式磁盘保旧，修复后同DTO只发布一次 | owner.submit、真实HTTP、磁盘原始字节和同目录reopen，不能mock submit结果 |
| H5 完整恢复与版本 | 合法checkpoint完整snapshot/eventLog/业务export等价；input/receipt/source/数量/双方身份/账/记忆observable或source/causation/RNG/scheduler/规则或配置至少各一个实质变体显式拒绝；scene-view.json/sceneHash对真实投影；旧format1–8、新旧profile混用拒绝且基准旧导出零漂移 | validateBundle+完整replay、CLI保存/resume、真实service journal审计 |
| H6 真实浏览器 | runtime-map进村→选actor2→赠1→本人记忆、导航/刷新/硬关闭标签页无副作用；响应已commit后断连→同canonicalDTO重试/刷新，不双赠；同revision双页签不同ID一成功一409，旧读数不覆盖新；textContent注入；dead封存；新静态/CSP/HEAD/门序与旧profile404 | 隔离Edge/现有Playwright、真实服务port0，记录截图/网络/console/pageerror |
| H7 同世界村庄与森林 | 赠粮→advance144→forest Travel12→Begin0→attack6→attack6胜→返村Travel12；tick180、狼14→13、战斗counter伤80（用真实当前身体锚），同actor2同赠粮记忆及账；ACTIVE gift须ENCOUNTER_BUSY且不打断战斗，退出/导航不cancel；再保存重开仍完整同一世界 | 真实命令链+页面两入口，共用唯一runtime目录，不换fixture或用两世界截图拼接 |

上述期望固定母合同字段和拒绝顺序，不能由实现方便而改。无法自然造出某反例时明确区分不可达与未验证，给合法配置/入口分析供中控裁定，不能用合成DTO证明真实行为。

## 3. 核心断言与审计顺序

1. H1一条成功必须核私账恒等式、scene成功fact、唯一EncounterCommandResolved、inputHistory receipt、零tick offset；其他资源与原配置完整比对。失败不应把实际给出的粮记作foodBought/公共outflow，不能修改initialFood。
2. H2核一条直接记忆entry和来源事实一一配对，再读scene snapshot及knowledge；第三人不能从全知event自动知道赠粮。receivedGifts来自NPC自己的持久记忆，而非页面localStorage/即时生成字符串。查看重复GET、HEAD和刷新不得新增事实/观察时间。
3. H3赠粮后19/1是日结前的瞬时数字，日末18/0；公共粮540→464是匿名76消耗，不是Gift产生公共转移。基准内存改分配的算术probe只支持手算，不是D4生产链验证。两个world须唯一Gift差异和相同seed/config。
4. H4注入真实候选发布点且初始化r0已完成；失败前后五缓存和所有正式磁盘字节整份相等，不只revision。queue满期间已经提交的ID可以重试，不把“排队之后最终返回”当作优先幂等。解故障后同输入落地一次，关闭重开与不中断世界全bundle一致。
5. H5每份篡改先canonical与合法原件不同；同一已验证合法resume参数下报明确 `INVALID_CHECKPOINT/UNSUPPORTED_VERSION` 等合同错误，不能接受任意非零（语法、路径、权限错误不算拒绝证据）。source/receipt/ledger都改得自洽仍应被完整重演拒绝。checkpoint外壳路径由summary给出，不猜文件名或把summary当snapshot。
6. H6保留断连原DTO（原expectedRevision）和network实际响应；只按注入stage允许预期abort/409，其他console/pageerror须失败。未知/非JSON响应不能自动换新ID。页面低revision不得覆盖；动态HTML作为文本显示。
7. H7关服务是graceful close/CLI stdin `quit`，核stopped、exit0、lock消失和旧端口关闭后才同目录重开。硬关闭仅指浏览器标签页；OS硬杀残锁接管不属本合同，不擅自删锁。临时目录/本轮PID归属登记，用户Edge Default与18324禁止启停。

## 4. 定向验证范围与兼容证据

A到位后三白名单测试均 required，运行 `node --test --test-concurrency=1 <三个明确文件>`，也可按H门分片并记录每成员源码/测试指纹及分母。最终零失败/skip/todo/cancel，分批覆盖不写成一次全跑计数。同提交+直接依赖不变且已有原始通过证据，不重复跑。
公共重演/存档/版本分派改到哪些模块，就跑其直接关联用例及旧profile完整业务导出配对：至少 survival、cognition、encounter与改动的memory/society/player来源账。用同一固定输入在干净f7699fb基准与新候选比完整bundle和canonical业务文件；elapsedMs/memoryUsage/checkpointPath和resume startTick差异明确单列，不能任意剔除业务字段。
D3-5历史822全量和100/500/1000天不自动重跑；D阶段最终体验收口如需集中相关suite，由中控在A/B通过后制定清单，不新增第三份业务任务书。浏览器驱动缺失写未验；现有可用驱动优先，不擅自安装。
CLI新profile只新增scene-view.json与summary.sceneHash，断言导出集合精确、不出现第二权威scene-state。未知profile/版本、新profile用旧checkpoint、旧profile接受Gift等负例均覆盖旧实际错误码；旧DTO3未知type保持 `INVALID_INPUT`，不是自行统一成COMMAND_UNSUPPORTED。

## 5. 交付给用户与中控

给用户：哪些真实交互已过、尚存bug、被阻断与未验。给中控：实际树/分支、base/发布/A生产/B测试精确SHA、未提交改动归属、三文件白名单差异、每H门成员与命令/exit/count/时长/源码测试fingerprints、原RED与修复归因、原始TAP/JSON/截图/HTTP/磁盘故障证明和PID清理。
任务书没有预定测试总数，按实际矩阵成员报告；通过必须有真实消费者。只输出 PASS/NEED REVISION 的有范围建议，D4最终裁定/控制状态/看板由中控负责。完成精确本地测试commit即停，不push、不main、不部署、不代改A、不开下一阶段。首轮阻断给最小反例；同轮反复返修交中控处理，不让用户无限转发。