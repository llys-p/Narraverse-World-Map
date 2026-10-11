# D3 单次野兽遭遇边界（草案）

> 草案，完整 D3 未冻结、未实现。中控修正日期：2026-10-11（Asia/Shanghai）。
> 基准115e256；施工树 D:/Narraverse-World-Map/hds-runtime，分支codex/world-runtime-d3-hds。

## 现有约束与源码锚点
- player-state.mjs: playerModel固定actor-4；现有位置为village/forest，私有物品仅food/herbs，不能直接搬旧RPG的XP/金币奖励。
- ecology.mjs:56–85：聚合账有固定守恒；wolves的predation必须为0；RemovePopulation是永久removed，不是临时预留。
- runtime-owner.mjs:113–134：串行去重/版本检查，候选完整保存后发布三个投影；新能力继续使用这个单写者边界。

## 本轮范围
actor-4存活且在forest，一次预留恰好1只wolves；同一玩家最多1个活动遭遇。身份由Runtime从playerModel取得，不接受浏览器选择他人。
完整接入用显式新rules/profile隔离，旧规则与存档不自动迁移；新命令/字段以下仅为提案，不表示已被现有DTO接受。

## 拟定最少意图
- EncounterBegin：payload为空；Runtime校验玩家位置、生命、无活动遭遇及可用wolves>0，再确定性分配encounterId。
- EncounterAction：payload为encounterId及action（attack/flee/cancel）；commandId、expectedRevision沿用服务外壳语义。
- 浏览器不能提交胜负、伤害、金币、经验或掉落；Runtime依据已版本化规则和记录的动作确定性裁决。

## 预留状态与守恒
未开始 → ACTIVE（available减1，reserved加1）→ CLOSED；关闭原因记录win/lose/flee/cancel及实际死亡结果。
核算式：available + reserved + battleDeaths = 本子账初始数量 + 已审计聚合净变化；reserved只能为0或1。
预留wolves退出聚合出生/捕食/自然死亡等日结计算，战斗层只裁决预留实例；跨日规则只对available份额进行聚合，不能让同一只狼拥有两个结算者。
结束时该狼确实死亡：reserved减1，battleDeaths加1；该狼存活：reserved减1，available加1。仅一次转移。
不根据win/lose标签盲目推断死亡；不伪造removed/predation账，新增battleDeaths及其映射只在新profile中定义。
玩家真实死亡不得自动复活；身体健康/死亡映射仍待接入合同，纯预留内核不修改人物。

## 请求、时间与持久化
同commandId且同输入返回原回执，异输入拒绝；不同commandId再次操作已关闭encounterId拒绝，不发奖励、不改数量。
过期expectedRevision明确冲突；保存失败保持旧状态。重开恢复ACTIVE和相同ID，不自动归还或重新生成。
动作使用显式world tick耗时；没有墙钟、渲染帧或浏览器随机裁决。仅允许活动遭遇命令期间推进，其他旅行/交易与时间入口的门控须在接入合同冻结。
取消须经合法命令，不能用关闭页面代替取消；取消不免费恢复战斗中已产生的伤害。

## 尚待确定的接入事项（不阻塞纯内核）
1. 新profile的种群预留字段、生态日结适配与存档验证映射；旧ecology校验禁止静默扩字段。
2. 攻击/逃跑/取消的tick耗时、伤害和玩家身体映射；规则定稿前不实现战斗回合。
3. 真实资源掉落及其资源账本来源；没有合法映射前不发旧RPG金币/经验或临时奖励。

## 下一块代码（仅两文件）
新增runtime/core/encounter-reservation.mjs及tests/simulation/encounter-reservation.test.mjs：同步纯函数创建、预留1只、关闭时归还或登记死亡及严格数据校验。
首片仅处理一个可保存DTO的数量与生命周期，不写world、网络、UI或存档，不修改ecology.mjs；DTO是合法形状，尚不证明真实遭遇发生。
验收围绕初始0/1边界、数量守恒、重复关闭不再转移、异ID/坏状态拒绝、输入不变、保存DTO复制后继续关闭一致。完整接口与精确导出另发短任务。
