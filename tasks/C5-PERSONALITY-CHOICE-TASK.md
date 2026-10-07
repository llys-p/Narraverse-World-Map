# C5：持久人格偏好与阶段C最后门槛

2026-10-07 18:33（Asia/Shanghai）。**C5与阶段C已验收**。中控直接实施，代码04dc222d7480a878b561767ff391ea1c37402e68已推origin/codex/world-runtime-c5，源码D:\Narraverse-World-Map-a2。旧C4代码2793dad轨迹保持，下一项D1单独合同。

## 给用户：完成后能看到什么

相同人物、伤病、库存和资金，偏重备粮的人会先补粮，偏重健康的人会先治疗；选择经真实命令扣款和转移商品。偏好保存后保持，已有目标照常完成、失败或冷却。不是LLM性格或完整心理模型，仍不接页面/模型/旧存档。

## 给AI：冻结合同

- 新规则c-personality-v1，memory-config-v2保留原society-config-v1及discountEnabled，增加personalities密集有序三行，字段actorId/healthWeightPermille/foodWeightPermille/restWeightPermille；ID必须actor-1/2/3，权重整数500..2000，默认1000。偏好是初始配置中不可变的持久规则，不做每tick漂移、不增加第二套角色资产。
- 现有memory-config-v1、C4及所有旧profile保持原结构、轨迹与拒绝规则，不能旧rulesVersion接受新配置。未知配置/规则显式拒绝，无自动猜测或静默补字段。
- 每次新目标选择使用既有Needs基础分数×权重÷1000向下取整；0分仍0，同分仍既有rest→health→food顺序。已有Goal不因为权重/日状态变化随意切换，紧急口粮/疲劳、截止/失败/冷却及职业动作沿用；权重不使死者行动、不绕过真实可执行性/资源/命令回执/RNG校验。
- personality.mjs负责白名单/整数范围/三人ID及纯整数分数转换；猎人规划器使用可选已校验权重，社会规划器依据对应actor配置传递，不增加回调或trusted/skip参数。三人世界、记忆、公告、真实交易、完整候选和从原配置全量重放共同使用同一策略。
- buildActorKnowledge在新profile只增加本人self.personality，不能返回其他人的偏好/私账或整个配置。死者仍墓碑/封存历史；旧C4接口字段不变。
- 新fixture personality-neutral/personality-health/personality-food：相同seed与资产，猎人health650/hunger0/fatigue0/私粮0/钱包100，其他人物原配置；neutral三权重1000，health仅猎人healthWeight=2000，food仅猎人foodWeight=2000。health基础850、food600；health优先治疗，food优先补粮。实际首日BuyMedicine/BuyFood通过命令引擎及账本；后续不靠固定日期脚本强制剧情。
- CLI登记新规则、显式恢复/配置指纹、personality-config.json导出；所有原生态/社会/记忆导出继续有真实来源，不仅增加一个显示字段。

## 验收与停止点

1. 先红后绿：同状态偏好改变真实首日Goal/动作/价格扣款/私货；权重500/2000边界、稀疏/访问器/未知版本/非整数/越界/错误ID拒绝且不读getter、不改输入；零Needs不虚造目标，已有Goal持续，死者不行动。
2. 完整引擎/真实磁盘恢复原始偏好、Goal、三人资产、记忆和trust；篡改偏好/分数/结果/规则配对拒绝；处理器改策略整tick回退；knowledge仅本人偏好且返回复制。
3. 全simulation+独立化边界通过，真实新profile100日=40保存+60恢复完整checkpoint/全部导出一致；health/food对照独立核对首日真实现金和商品。旧C4完整100日存档/导出字节保持，旧C1～C3/B回归保留。只测三人，不承诺规模性能。
4. C1身份/需求/死亡、C2缺钱→收入→药→恢复及有限Goal、C3多人竞争、C4可知记忆/真实关系/保存连续、C5人格同条件选择全部有证据，才阶段C已验收并启动D1。失败保留待验收/需修正，不降低门槛。

精确暂存、任务分支推送；产物留忽略artifacts，不提交真实存档或运行目录。保护main并行E文档、旧实例/页面/正式平台；不合并runtime main、不部署。

## 最终验收与两类交接（2026-10-07 18:33 Asia/Shanghai）

- 给用户：相同初值，健康优先买药，备粮优先买粮并当天完成口粮目标；4日健康750/650，100日中立配置最终健康850。偏好真实改变选择，没有强制按日期写剧情；治病目标仍可因缺钱先工作，权重不跳过失败/截止/冷却或死亡规则。C阶段基础闭环通过，仍只是三人、同村公告，非完整心理/社会网络或可玩页面。
- 给AI：D:\Narraverse-World-Map-a2 @ codex/world-runtime-c5，代码04dc222，干净且已推；新增personality纯模块/fixture/三份测试、memory-config-v2及新显式profile，旧配置不猜测迁移。full-tests.txt为177/177（原168+新9），275.5秒，含磁盘/CLI、旧规则、配置指纹重算后仍拒绝伪造、完整候选回退及本人知识隔离。
- 干净代码100日=40存盘+60恢复，完整checkpoint与14类导出一致；独立消费者复算每个猎人日的基础Needs×本人权重、实际购买现金/商品与BigInt所有权账。旧C4完整100日checkpoint和13导出字节相同。stateHash 80b61e1ee4930dedbbd8c20a84422bea52ec386e9bf16b9aaedafa30440ff990，eventHash 05d62ea08c6e953a22247ac82410c561aec53284011e9a5f988839158f105993；runtime指纹d3a2129dddc20dfe168b3b0af7a02c6dda6124f7b05289e35bf27be5c436b2a0。
- 证据artifacts/world-runtime-c5-acceptance-20261007/comparison.json、full-tests.txt及五组CLI产物，保持忽略。100日235.6秒（同期全回归与其他长程实验），末尾RSS258600960非峰值，不能与单次/不同并发条件比较性能或承诺大规模。
- C1～C5所需身份/需求/死亡、缺钱多步Goal、真实竞争、公私资源所有权、可知记忆/关系、人格及跨档连续均有消费者/反例证据，阶段C已验收。下一项D1；D整体仍未开始验收，不改旧页面/真实存档，不合并runtime main。
