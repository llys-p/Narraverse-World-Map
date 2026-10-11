# D3-4：最小确定性单狼战斗内核

合同d3-combat-kernel-v1；代码基准05117e0d4da84c82d92a30753c6041d41f260106。
树D:/Narraverse-World-Map/hds-reservation，分支codex/world-runtime-d3-reservation。
唯一DSH包工头自行派原生子代理、监督/初验、维护原生任务板，Codex发布合同/最终验收。

## 用户目标与边界
补攻击、逃跑、取消的确定性裁决，客户端不指定胜负/死亡/伤害。
本片是纯同步候选内核，尚未接encounter-session/world、人物身体、旧SimulationSession/EventLog/checkpoint/HTTP/UI；不称网页战斗可玩或完整D3通过。
固定配方，不是平衡设计；无随机、装备、技能、掉落、金币、XP、全局时间推进或多怪物。
白名单仅新增runtime/core/encounter-combat.mjs、tests/simulation/encounter-combat.test.mjs；旧文件/旧测试/项目文档均只读，不新增依赖或包装器。

## 接口和固定规则
恰4导出：ENCOUNTER_COMBAT_VERSION='encounter-combat-v1'、createEncounterCombat(encounterId,initialPlayerHealth)、validateEncounterCombat(state)、applyEncounterCombatAction(state,intent)。
initialPlayerHealth为受信适配器从真实人物取得的正安全整数1..1000；该参数不是公开浏览器DTO，内核不证明来源真实性。0/死亡不得创建。
狼初始health300；玩家攻击150；狼仍存活时反击80；击杀回合不反击。HP钳制到0。
attack局部耗时6 tick；flee固定成功、耗时6、无额外伤害；cancel耗时0、无额外伤害。两者均不恢复已有伤害。elapsedTicks仅候选耗时，不调用世界推进。

## 精确状态与可达性
state恰10字段：version、encounterId、initialPlayerHealth、playerHealth、wolfHealth、rounds、elapsedTicks、status、resolution、wolfDied。
create：playerHealth=initial、wolfHealth300、rounds0、elapsedTicks0、status active、resolution null、wolfDied false。
rounds只计attack，0..2。完整validator必须证明下列可达状态，不能只查类型：
- active/round0：初始玩家HP、狼300；active/round1：initial>80、玩家initial-80、狼150；无active/round2。
- closed/win：round2、initial>80、玩家initial-80、狼0、wolfDied true。
- closed/lose：round1、initial<=80、玩家0、狼150、wolfDied false。
- closed/flee或cancel：round0或1，HP与对应active一致，狼300或150；round1须initial>80，wolfDied false。
elapsedTicks=rounds*6+(resolution==='flee'?6:0)；wolfDied恰等于wolfHealth===0，不凭win标签推死亡。
validate成功返回原引用；其它函数不写输入，返回独立深副本。
所有数据入口先descriptor预检再读取/clone/canonical：getter调用0，拒稀疏/symbol/环/异类/非JSON/额外字段，冻结/null原型可用；复用data-contract/experience-state，不写另一个JSON工具。
state和intent各canonical UTF8预算4096，顺序descriptor合法性→预算→业务字段/ID/数值；超限LIMIT_EXCEEDED。不同字符串version为UNSUPPORTED_VERSION，缺失/非字符串及其它非法为INVALID_INPUT。
合法固定shape天然不到预算，用超长ID证明预算优先，不加padding合法字段。

## 意图与返回
intent恰encounterId、action；仅attack/flee/cancel，禁damage/health/result/outcome/actorId/奖励注入。
apply先完整校验state和intent，再检查异ID ENCOUNTER_ID_MISMATCH，最后同ID closed ENCOUNTER_CLOSED（异ID优先）。
错误全部抛出且输入整次不变，不返回伪造拒绝结果。
返回恰{state,result}；active result=null；closed result恰encounterId、resolution、playerHealth、wolfHealth、wolfDied、elapsedTicks六字段，与返回state精确对应且独立副本。
attack先扣狼150并rounds+1/ticks+6；狼0→win不反击；否则玩家扣80，玩家0→lose，否则active。flee/cancel仅关闭和规定耗时，HP/rounds不变。
本纯函数无commandId缓存，同输入重算同候选不等于应用两次；closed再行动拒绝。未来权威接入复用D3-3幂等，不另建会话/日志。

## 独立验收（按语义合并，约12–18项）
1. 精确导出/shape；玩家1000首攻920/狼150/round1/tick6 active resultnull；次攻920/0/round2/tick12 win、wolfDied true、无击杀反击。
2. 玩家80首攻0/150 lose、狼存活；81首攻1/150，次攻1/0胜；1立即败；0/1001创建拒绝。
3. 初始flee tick6/cancel tick0；首攻后flee 920/150/tick12，cancel920/150/tick6；不回血。
4. ID/closed顺序、未知意图/客户端注入拒绝；冻结/null原型、深层getter0、异类/符号/环、预算优先、异常不写输入。
5. 篡改rounds、HP、elapsedTicks、status/resolution、wolfDied、version，先断言canonical确变，再断言拒绝；合法JSON往返继续与连续两攻deepEqual，不称磁盘已验。
6. 输入state/intent与返回state/result/不同返回值不共享引用，输入canonical不变。
7. 真实只读消费者：D3-3 player-play合法旅行forest tick12→Begin得到encounter-1与真实玩家health1000→本内核两攻。局部tick12但会话sourceTick恒12、源bundle不变，明确未写回会话。
8. 消费D3-1真实ledger：win按wolfDied true关闭died→available13/reserved0/battleDeaths1；lose/flee/cancel按false关闭released→14/0/0；同结果重复关闭不重复扣还。仅候选消费，不改D3-2的battleDeaths禁止，不伪造removed/predation/hunted账。
标准命令：node --test --test-reporter=tap tests/simulation/encounter-combat.test.mjs tests/simulation/encounter-session.test.mjs tests/simulation/encounter-reservation.test.mjs。
仅新模块和直接关联；不跑全量。DSH沙箱spawn EPERM可同三文件用--experimental-test-isolation=none（中控已准许环境替代），区分环境失败/业务红，最终Codex标准验收。

## 派工与停止
包工头国内workbuddy/deepseek-v4-pro high；执行原生子代理优先workbuddy-global/deepseek-v4.1-flash high（目录零倍率）；HY4限流暂避，不自动付费回退/Astra；effective路线/费用未知如实写。
最多两路同时、单文件单写者；先独立测试最小红测，再实现与补测；测试手算合同期望，不读实现反抄。替补先收齐旧工人finished，不据父run结束判断。
原生新任务卡关联已完成D3-3 task5，保留历史；约20分钟，同问题3轮失败或状态不可观测则具体报告停止，不无限重开。
任务相关公开查证允许并给URL；禁止凭据/运行数据/DSH配置/外部写入/破坏清理；不得commit/push/main/部署或改白名单外。
普通边界问题请求Codex裁定，别停在等待用户。交付两文件、真实命令/退出码、工人ID/终态、任务板/git状态/未验项；全部写者结束即停，不进入世界写回/持久化/服务UI。文档与提交由Codex负责。
