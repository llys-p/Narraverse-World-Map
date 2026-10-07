# C4：可知事实记忆、关系与阶段C验收

2026-10-07（Asia/Shanghai）。任务合同已准备，**观察层已开工，C4整体未验收**，不把局部模块当完整NPC记忆闭环。依赖C3完整收口；源码真源仍D:\Narraverse-World-Map-a2，开工从最终codex/world-runtime-c3交接点创建codex/world-runtime-c4，必须先核对最终SHA/dirty与实际额度。用户要求持续推进至额度停点，若本轮停在合同则下轮继续本项，不拆成更低的验收目标。

## 给用户：本项结果与边界

完成后，每个人只记自己经历、交易对象透露以及村内公开的事实，不能从世界快照直接知道别人的钱包、目标或心理。关系必须来自真实事件，并能影响下一次交易选择或报价；保存后继续同一个人物/关系/记忆。仍没有LLM社会信号、页面或完整社会网络，不能把存储几个字符串当阶段C验收。

## 给AI：实现范围与规则冻结

### 1. 世界状态与观察权限

- 新规则c-memory-v1/config memory-config-v1嵌套C3society-config-v1，保留旧C3/C2/C1/B规则和配置。新增memoryModel：配置指纹、day、已扫描原事实序号、每个Actor的有界memories/relationships、当前公共药物请求/供应公告。Actor身份与死亡墓碑沿用，不重建/复用ID。
- 每条记忆保留memoryId、sourceEventSeq、occurrenceTick、observedTick、channel(public/self/interaction)、importance、结构化observable事实。发生时间和观察时间分开；来源事实必须真实存在，不能用模型文字替代。记忆可有对事实的本地解释，但解释必须单列且不当客观事实；首版不加入LLM解释。
- 当事方规则：SocietyActionCommitted只有entityIds中的Actor可记自己的动作/双方直接交易。peer出售只记录双方ID、药1/价钱与**自身**付款/收款，不复制另一方钱包余额、库存或Goal。别人做的Hunt/Work没有默认全村广播，不据此推断他人需求/财产。
- SocietyDaySettled可以形成公开记忆，但仅投影公仓粮药/已公布价格/路线和聚落总存活数；不能将agents数组、私人账、Goal/Needs拷入公共记忆。每人可以记自己的日消费、状态变化、目标完成/失败，来源仍指向该真实日事实，只投影自身。
- 对其他NPC的医疗需求不能让商人读取全知private health/wallet来规划。先由每人自身规则发布有界公开请求：需要1药/愿意支付的当前报价/有效期；不公布钱包余额、精确健康或完整Goal。商人可自愿发布“有1药/当前报价”供给，不公布全部私人库存。这些MedicalRequestAnnounced/MedicineOfferAnnounced事实先提交、带Actor来源和截止tick，再作为本日商人候选/买方偏好依据。可执行性最终仍由权威提交检查实际资产，不用公告代替资金校验。
- 默认同村公开公告可见，直接交易仅双方可见；死亡Actor不再观察新事实，但已有记忆/关系和引用保留。C4未实现旅行/视野/广播网络，后续D/F扩展须版本化权限，不默认所有事件全知。

### 2. 容量、顺序、去重与重放

- 默认每人最多32条记忆；按sourceEventSeq/memoryId稳定顺序，直接交易importance2、自己的行动/状态1、公共日行情0。超量先淘汰最低importance中最早记录，同分按码元序；不随机删除。原EventLog保持完整，聚合私账/Goal不受记忆淘汰影响。
- cursor只前进，重复处理同来源/同channel不产生第二份记忆或关系增量；即使旧记忆已淘汰，也不能反复重放来源刷信任。预算拒绝先验，不大复制超预算输入或把稀疏/异类对象猜成空记忆。
- 每日日序：外部命令→自我医疗请求/供给公告事实→依据可知公告与旧关系同时规划→按ID提交三人动作→原SocietyDaySettled→过滤、记忆与关系更新→MemoryDaySettled。日记忆事实只因果引用已提交事实，不自引用/指向未来；公告不算第二次物理行动或额外扣款。
- 系统只能获得已提交事实的断开/只读集合，不能改历史；观察过滤器必须产出明确投影。私有session仍比较完整规范候选，入口/导出/存盘全量审计，不开放skipValidation/可信标志。保存加载从初始配置、公告、外部/内部输入、三人顺序、RNG、可见性与淘汰规则重放全部事实/记忆/关系；篡改引用、视角、时间、cursor、信任或资产必须拒绝。

### 3. 最小关系与实际作用

- 关系只存对真实Actor ID的有向trust（0..1000，默认0）与最近依据事件；不加入未经行为使用的情绪维度。成功完成peer药交易时双方对对方trust各+10，最高1000；不把抢公仓失败当对某人的背叛，不对无证据事件扣信任。一次真实交易最多增一次，死者引用保留。
- 在交易层使用关系：已有成功交易使买方对商人trust≥20时，商人的原2金币加价降为0（不低于公布价、不影响成本/资源所有权）。商人多个公开有效买方可选时按自身对该买方的trust高者优先，同分按ID；只基于已观察关系和公开报价请求。
- 买方有公开供给、自己资金足够、信任≥20且报价不高于可用公仓时，可选择等待可信商人一笔交付，保留自己的recover-health Goal，不重复从公仓购买。等待的买方必须与卖方实际选定买方一致，不能让多名买方等待唯一一份药却都计成功。成功交付才获得药，下一日使用；未交付须计失败/终止/冷却，不能用“相信他”绕过账。
- 固定关系对照fixture：公仓药初值4全部归商人私人，私粮每人20、买方猎人health400/wallet500、其他钱包0，总gold500所以公共外采无资金；真实连续peer交易/用药累积关系，第三次起报价去掉2金币加价，商品和两钱包总额不变。另同初值关闭关系优惠的对照使用显式policy版本/配置字段（不能临时改函数），验证关系确实改变行为或付款。

### 4. Actor-known 消费接口

- 导出buildActorKnowledge(bundle,actorId)：返回自身identity/健康需求/私账/当前Goal、当前公开公告/行情、有向关系和有界记忆，使用当前revision/tick并过滤已过期公告；返回复制对象，调用不能写世界。
- 不返回完整Snapshot/EventLog、他人Goal/钱包/健康/库存，不能通过隐含嵌套配置initialActors等泄漏私人初始状态。未知Actor/死者观察请求明确错误或只返回其已封存历史（合同开工时固定，不猜）；首版建议死者仅墓碑/封存记忆，不能获取当前新行情。
- 公共记忆不能夹带原SocietyDaySettled.payload；交易投影不能夹带before/after的另一方钱包；所有返回字段做白名单，私有别名/引用不能修改内核。

## 验收与阶段C门槛

先红后绿：自身/双方/公开/无关事件分别测试，其他人物钱包/Goal/精确健康不能出现在非当事记忆或knowledge；公开自愿医疗请求与供应才可进入规划，查询纯读/别名保护；重复来源不刷trust、32条稳定淘汰后重放仍不重复增益、坏引用/未来tick/cursor/稀疏/异类/溢出拒绝、死者不获新记忆但旧ID/引用仍在。

真实Runtime链：两次实际药交易后关系跨过20、后续真实报价/客户选择改变，现金/药账守恒；公告/三人同快照竞争仍只能一次成功，不额外调用买方动作。保存中间Goal/关系/淘汰前后后续完整snapshot/EventLog/knowledge一致；失败整tick回退包含公告、交易、记忆、信任和RNG。CLI导出memory-config.json、memories.csv、relationships.csv以及原社会/账户/事件/输入产物，可独立复算来源/可见性/交易与关系。

原阶段C验收逐项证据：饥饿/伤病/缺钱改变目标→真实行为影响同世界→目标恢复/死者不工作→多人竞争仅一次成功→循环目标终止/冷却→NPC只获得可知事实→人物身份/关系/记忆跨存档连续。C1～C4及当前所有回归、真实100日/跨档消费者与隐私反例全通过才将阶段C已验收；不因个人模块测试绿就进入D。未经授权不开放旧页面写入口、不用模型/桥、不迁移真实存档，D单独合同后续。

C3最终交接点 `13b137c798fca9a9534e3d6daf83786b47562250` 已推origin/codex/world-runtime-c3，139/139及真实消费者已验收。开C4从这个保存点取代码；本C4整体尚未验收。

## 当前实现切片（2026-10-07 16:38 Asia/Shanghai）

- 已从13b137c建立codex/world-runtime-c4；新增memory-observer.mjs与memory-observer.test.mjs。基于真实C3事实，输出自己的行动/日状态、双方药交易投影及村庄公开行情，拒绝嵌套私人账；32条稳定淘汰、cursor重扫不刷trust、真实死亡后封存ID。定向9/9、全simulation+边界148/148（原139+新9，132.7秒），观察层切片8a02917已推origin，C4整体仍进行中；干净代码真实磁盘消费者15=6+9完整C3 bundle/独立observer一致，来源/可见性/cashDelta/trust逐项独立核对，证据artifacts/world-runtime-c4-acceptance-20261007/observer-disk15/comparison.json（忽略不上传）。
- RED：缺模块ERR_MODULE_NOT_FOUND；独立重复commandId但新eventSeq反例先失败，现来源序号/命令去重及日tick校验拒绝。真实初始死亡与运行中死亡均有消费者反例。
- 当前API为createMemoryState/advanceActorMemory/projectActorEvent/validateMemoryHistory/buildObservedMemory；这是独立观察器，不是完整buildActorKnowledge或c-memory-v1世界规则。validateMemoryHistory核对投影/淘汰/关系来源，但不认证原始世界、初始人物状态或真实观察时机；这些必须由后续整世界命令/公告/MemoryDaySettled全量重放证明。没有skipValidation接口。
- 下一步继续公告事实及同日可知规划，报价/选客/买方等待必须由真实交易落账；随后集成Snapshot、完整重放、CLI导出和100日/存档消费者。尚未达到阶段C门槛，不进入D。
