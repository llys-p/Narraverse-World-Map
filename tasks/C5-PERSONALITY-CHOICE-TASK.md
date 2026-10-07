# C5：持久人格偏好与阶段C最后门槛

2026-10-07 18:15（Asia/Shanghai）。中控直接实施，尚未交付。依赖C4代码2793dad，源码D:\Narraverse-World-Map-a2；独立分支codex/world-runtime-c5。架构C验收要求人格影响选择，当前C1～C4只有需求、职业及关系，补本项再收口C。

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
