# D3-2：玩家狼遭遇候选世界适配

合同d3-encounter-world-v1；代码基准76eaab8052e97293d86b203c6fb97893f53104ef，施工树D:/Narraverse-World-Map/hds-reservation @ codex/world-runtime-d3-reservation。
给用户看：用真实玩家/种群数据生成开始遭遇与取消归还的原子候选；本片尚未接Runtime提交、事件、存档或UI，不代表遭遇真实已发生。

## 范围、分工与验证
- 仅新runtime/core/encounter-world.mjs、tests/simulation/encounter-world.test.mjs；禁止改D3-1、旧生态/Clock/WorldState/服务/存档及旧测试。
- Global DeepSeek high实现模块；Global HY4 high写独立测试。共享合同后并行，各文件单写者。测试代理不得阅读实现正文或反抄输出。
- Codex已预建有真实world创建断言的最小测试并标准实跑RED。测试代理保留该断言并扩充；实现代理只依合同写模块，不等测试全部完成，不读正在写的测试。
- 实现者仅node --check模块，不跑可能尚未完成的测试；测试者只node --check本测试。两路终态后由Codex集中标准node --test本测试与D3-1直接关联回归一次。
- 预算各8分钟；无实物/明确进展2分钟就报卡点，同问题3轮失败即停；不复写大量开工摘要，不开原生子代理/孙代理，不付费回退。
- 禁提交/push/main/部署、临时副本/新日志、配置/凭据/外部消息及.git内部写入；状态和收口由Codex一次更新。

## 导出与新数据形状
仅导出ENCOUNTER_WORLD_VERSION（encounter-world-v1）、createEncounterWorld(world)、validateEncounterWorld(frame)、beginPlayerWolfEncounter(frame,encounterId)、cancelPlayerWolfEncounter(frame,encounterId)。
frame恰4字段：version、anchorDay、world、reservation。anchorDay为world.ecologyModel.day；reservation复用D3-1，不重新实现计数器。
仅支持经validateMemoryWorld合法校验的memory-config-v4/player-state-v2世界，playerModel.actorId必须actor-4。已知其他Memory/Player版本UNSUPPORTED_VERSION，坏字段/身份/不变量INVALID_INPUT。
外壳版本是新候选DTO，不是已注册的Runtime profile，也不是checkpoint格式；禁止把ACTIVE frame.world直接交给旧日结/旧validateBundle。

## 预检、创建与校验
所有入口先用experience-state.mjs的inspectDescriptorTree，后字段读取/clone，getter不执行；再复用data-contract与旧validateMemoryWorld，严格拒访问器/异类/额外字段/自定义数组原型等。
create先完整校验旧world；得到独立world副本、anchorDay固定、createEncounterReservation(当前wolves)。仅受D3-1的100000人口上限限制，不改旧生态1000000上限。
validate返回原frame引用。成功转换独立深副本，失败不改变输入，可接受冻结输入/null原型JSON记录。
frame.world.ecologyModel.populations.wolves必须等于reservation.available；available+reserved=reservation.initialPopulation；battleDeaths必须0，本片不支持died。
world生态day必须等于anchorDay；不允许把日结后的world塞回旧frame。
为了校验其余旧世界不变量，只在临时独立校验副本将wolves加回reserved，再调用validateMemoryWorld；这个副本不返回/不记账，原world的available含义不变。
其他配置、账本、财富、食物、药材、人物和记忆须保持原值；预留/归还都不得计入removed、predation、hunted等永久账。

## 开始及取消
begin先校验frame/ID。首次必须actor-4活着且location=forest，wolves>=1；否则RULE_REJECTED。人物ID取真实playerModel，不允许客户端指定别人。
首次调用reserveEncounter，world wolves减1，reservation reserved加1。active同ID重复等值副本无再扣，active异ID ENCOUNTER_BUSY，closed再次begin ENCOUNTER_CLOSED（复用内核语义）。
cancel调用closeEncounterReservation(...,released)。仅实际active→closed时world wolves加1；同ID重复取消不再加。缺遭遇/异ID分别复用ENCOUNTER_UNAVAILABLE/ENCOUNTER_ID_MISMATCH。
取消用于资源退还，不再次要求人物活着/在forest；没有伤害、奖励、时间推进或隐式复活。
world/reservation等所有候选变化一起返回frame，不写输入、不执行权威提交。跨日、正式命令ID/回执、真实死亡和多次遭遇留下一合同。

## 独立预期与已核实fixture
现有createPlayerPlayVillage(42)初始wolves=14，actor-4在village；executePlayerIntent合法PlayerTravel到forest结束tick12，旧world校验通过。
create frame不改world；forest begin后world wolves=13/reserved=1，cancel后14/0；所有永久账/私账/资源完整不变。重复开始/取消、冲突、无遭遇与冻结输入保护必须验证。
村庄/合法初始死亡/零wolves均RULE_REJECTED。死亡fixture可用defaultPlayerPlayConfig().society.actors.initialActors[3].health=0；必须先验证旧world合法。零狼cfg路径society.actors.market.ecology.resources.populations.wolves。
篡改available对应、永久removed账、anchorDay、battleDeaths/died、版本、外壳字段、深层getter及数组原型均拒绝；fixture先断言确实变化，getterCalls=0。
ACTIVE经JSON往返cancel与连续cancel deepEqual，不称磁盘恢复已验。旧输入与候选副本互不共享；不改原player-play bundle/规则。
最终node --test --test-reporter=tap tests/simulation/encounter-world.test.mjs tests/simulation/encounter-reservation.test.mjs；只此新模块及直接关联，不跑旧全量。

## 中控收口（2026-10-11 19:47 Asia/Shanghai）

- 限定PASS：源码提交 b94d71d08da808de53eb7f23f64fae95847d034d；36项新测试与D3-1直接关联14项，共50/50、0失败/skip/todo，10.2秒；语法和diff检查通过。提交后文件字节与被测版本相同，不重复跑已通过测试。
- 真玩家合法到森林后，候选狼14→13/预留1→取消14/0；重复不再扣/加。真实死于森林场景、坏人口记录、冻结输入、深层访问器与账本篡改均按合同拒绝。
- 证据：control artifacts/world-runtime-d3-world-20261011/acceptance.json 和 controller-final.tap；首轮失败日志保留。尚无权威提交、事件、磁盘存档、服务/页面或战斗接入，完整D3未验收。未推送源码、未合并main、未部署。
- 本单使用两个独立Relay执行对话，是已结束的过渡例外。用户最新要求生效：后续由唯一DSH包工头主对话自行开原生子代理、维护原生任务板和监督；Codex发布有界任务并最终验收，不再直接给平级工人派活。
