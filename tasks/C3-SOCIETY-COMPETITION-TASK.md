# C3：村长/猎人/商人独立目标、私人账与资源竞争

2026-10-07（Asia/Shanghai），本对话自行实施。基准C2 `31c4690cfc9849fafc867f2184ccbf5a59288b1e`；源码 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-c3`。不合并main，不接UI/模型/真实存档。原C2猎人规则/配置和旧轨迹保留。

## 固定合同

- 新规则c-society-v1/配置society-config-v1；固定3个C1身份chief/hunter/merchant各1，默认Actor顺序仍1/2/3，80=77匿名+3实名。三位全部有独立私人粮/药/wallet/Goal/冷却/回执；依旧不参加匿名劳动。复用C2行动/需求规则，不做通用规划框架。初始每人私粮3从公仓移交，私药0；村长/猎人钱包0、商人100，均为聚落原金币分配而非新增。
- world.gold=公共金+三钱包，公共外采只能花公共金，工资真实从公共归属转个人；私仓移交/私人使用分别记账。个人药可peer转售，出售与接收分别记账，不再从公仓扣；钱包收入/支出一增一减，聚落总金不变。死者资产/墓碑仍持久但不能行动/消费/买卖或领工资。
- 每日时序：外部命令→对同一提交前快照规划3个意图→按actorId码元序提交（1村长/2猎人/3商人）→一次匿名生态/市场/三人私粮消费/Need更新。计划不预扣货币/资源；提交时重新校验。当两人选同一份药/工资，首个合法提交成功，后者RULE_REJECTED且不能部分付款/领工资/扣货。拒绝计该目标失败，但不消除他人的成功；整个tick系统出错仍原子回退所有行动。
- 既有自我目标recover-health/secure-food/recover-rest沿用C2阈值/有限步骤，紧急需求优先，固定同分顺序；每个目标和单人nextGoalId独立，内部命令ID society-day-D-actor-N；inputSeq覆盖3人动作和外部命令，无外部伪造内部来源或ActorAction。新内部DTO SocietyAction {actorId,goalId,action,targetActorId}，target仅peer出售非null，允许原6行动及SellMedicine。
- 村长新增support-village：公共粮少于聚落存活人数×2日口粮且无个人紧急Goal时WorkForPay，真实产8粮、工资20；目标达到公共粮目标或失败/截止结束。不能无资金刷生产，不能重算匿名劳动，死亡不组织。
- 商人新增stock-medicine：无私人药、无个人紧急目标时尝试按公仓发布药价购1份作为私人库存；钱不够先WorkForPay，有钱无货则等待、3次阻塞终止/冷却。持有1药且同村有存活health≤700、无私药、钱包够报价的另一Actor时sell-medicine；依buyerId顺序锁定目标，报价min(发布药价+2金币,药价上限)。买方公仓有药且能买时优先公仓，商人若同日落后提交须复查买方是否已拿到药，已拿药则拒绝，不重复购买。
- SellMedicine事务校验卖方职业merchant、私药≥1、买方存活同村/需要药/私药0、买方钱≥锁定报价与私仓容量，双方钱包/药库存同事务转移。成功只记卖方一次动作/正常receipt与包含双方的SocietyActionCommitted事实；买方当日原动作已发生，不能因此多执行一次UseMedicine。下一日其恢复Goal可继续使用新药。买方花钱有账，卖方收入不是凭空工资。无折扣关系/无限商队/复杂议价。
- 角色目标（公共2日粮、药库存1、转售1药）均沿用20日截止、3次失败、冷却2日，不每天无条件换目标。目标完成/失败和被拒绝的计划保存，货物/钱不因目标变更消失。三个人不是同一个Goal换名字；要有村长补公粮、猎人实际同鹿群捕猎、商人持货/售药与个人康复的实测链。
- 规范规划器由engine负责生成内部输入/提交，系统回调仍不能写protected input/counter。session比较完整规范候选；创世/存盘从配置、全部外部和内生意图、RNG、3人顺序与日规则重放，核对所有资产/Goal/回执/因果/墓碑。新SocietyDaySettled保存原生态/市场及每人Goal/私账/真实消费，不能只验证类型或按钮。

## 验收

TDD：最后1药只有1人成功、最后20工资只有1人领到、钱/库存/人口/劳动不双算；peer真实售药一出一入/双方现金对账，已有药或死者拒绝买卖，不额外执行买方行动；三角色独立目标/进度/冷却改变选择；外部输入/内生receipt/钱/目标/交易/顺序/RNG篡改拒绝，整tick回退。真实磁盘在竞争拒绝/持药/下一步目标时保存，续跑完整状态/事件一致；CLI导出society-config.json、society.csv、actions.csv/actors.csv和公仓CSV，私人账与peer账可独立复算。原125项全回归、旧C2/C1/B4有界对照；无AI情况下运行完整消费者才标单项通过。

## 给用户

完成后村长会处理公共粮目标，猎人保持自我需求/捕猎链，商人会持有和转售真实药材；三者会争同一公仓和工资。尚无人物关系/事实记忆或页面/模型接入，C4后续，不把C3冒充阶段C结束。

## 给AI

复用C2私账/行动/个人目标，新增多Actor所有权上下文必须从同一世界推导；不得做假快照或虚增余额以骗过旧校验。先规划后按ID提交，提交时资源会被前人改变，失败保留目标状态但无部分经济更新。精确提交推任务分支，更新PROJECT_CONTEXT/Project2；持续推进至用户额度停点，保护其他worktree/同期E预研，不自动合并main或部署/启桥/用模型。

## 实施与验收收口：PASS

2026-10-07（Asia/Shanghai）。本对话直接实施/复核，基准C2 31c4690，实现3756071c05f681e9667d9074c765acdbdbc0f4e1；测试保存点a3fbde653228731e21379817796b93bc0a7fb1b3仅补真实村长public-food引擎用例，runtime未变。新增society模块/fixture/三份测试，复用C2个人账/动作并显式传入同一世界的其他钱包、私人消费和peer收支；没有假余额或skipValidation。批量Actor管理只一次结算公用资源，3人私粮和目标分别更新。内部SocietyAction由规范规划器生成，engine按ID/来源/inputSeq记录成功及拒绝回执；私有session完整规范候选和保存完整重放保留。

Node v24.14.0，最终所有simulation+export-boundaries139/139（原125+新增14），约195秒，diff通过。最后1药/20工资、村长真实paid产8粮/角色目标、转售一药/52金币、下一日买方使用、死者/已有药拒绝、Goal/钱货/来源/顺序/回执/RNG篡改、所有行动整tick回退、磁盘中间失败Goal/持药续跑通过。公开事实访问器和null/异类批策略反例先红后绿，拒绝前不调用getter。

干净3756071实际CLI society-village seed42 100天=40天保存+60天续跑，society-peer-sale4=1天保存+3天续跑，完整snapshot/EventLog、两哈希、society/actions/actors/population/ecology/economy/market/trade八CSV、inputs/配置一致。独立新进程逐步核对3个钱包/私仓合计、所有权移交/真实消费、公共市场资金、每次交易双方现金与药、inputSeq/拒绝回执。首单转售52金币、买方下一日UseMedicine，不能再从公仓扣药；race4第1日村长公药购买成功、猎人拒绝，保留全部资金。

基线100天实测5次实名猎鹿、三人私粮实际消费245、工资680、目标完成145；部分工作日未吃私粮由饥饿规则如实记账，不声称私人需求零缺口。100天约90.7秒，条件为同期全回归，末尾内存不是峰值；三人验证开销明显增加，规模/长程C性能未验收。旧C2 hunter-village100天真实复跑完整checkpoint字节与C2验收相同。

stateHash=3621d0f29b3390f34e21bf2c67b94ababb2350a8c67716caa85c68277f43de30；eventHash=a7857a3a68e465b5ef5fb2376f38aed6f946eb94af246cb8325d9fd125f573f3；societyConfigHash=76d7563a8eedf8cccc3a47b346c4a4e6fde3bc8424aafeae0dbf15eaf6375409；runtime sourceHash=fff194b770da08242808da46d53f7919f9b50ff428d6588d4986398c7261213c。本地忽略artifacts/world-runtime-c3-acceptance-20261007保存comparison.json、consumer-probe.mjs、full-tests/final-full-tests、continuous100/prefix40/resumed60/race4/sale4/sale1/sale-resumed3及c2-compatible100，不上传运行产物。

仅C3通过，C阶段尚缺C4。额度检查剩12%进入用户停点，本轮保存暂停，不开启C4代码。[C4合同](C4-KNOWABLE-MEMORY-RELATION-TASK.md)已准备：可知公告/事实投影、有界记忆/关系实际作用/完整隐私与恢复门槛，未实施。下轮从C3最终分支保存点核对状态/额度继续，不从main控制文档猜运行时代码。不合并源码main、不接页面/模型/桥或旧存档，E预研独立保留。
