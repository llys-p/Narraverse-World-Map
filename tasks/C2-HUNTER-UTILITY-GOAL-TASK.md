# C2：猎人 Utility / Goal、私人资源与真实行动

2026-10-07（Asia/Shanghai）。本对话自行实施，基准C1 `13ed16ce94158a99acbeb8d555dff4315ce160ee`；源码 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-c2`。不合并main，不接UI/模型/旧存档。C2按“资源归属/原子行动→Utility/Goal→内核与续跑消费者”薄片推进，薄片提交不等于单项已验收。

## 固定业务与账本

- 新规则 `c-hunter-v1` / 配置 `hunter-config-v1`嵌套C1配置，第一名occupation=hunter者为唯一自主猎人；村长/商人仍C1默认休息，C3才决策竞争。每日144 tick评估/最多执行一个行动；目标跨天保存，不做无限规划。连续Actor身份与匿名劳动排除继续，不复制猎人数/人口。
- 猎人私人inventory={food,herbs}、wallet持久化。食物/药私有库存与村庄仓库分别拥有，转移即记仓库outflow；私人使用不再次扣仓库，记录个人consumed；首版私人粮药无自然损耗，村庄仓库仍按原损耗率。初始food=3、herbs=0、wallet=0，私人food从初始村庄粮移交，初始worldfood900→仓库897+私人3，不凭空新增。world.resources.gold仍为**全聚落金币总数**，wallet是其中已分配给个人的实际货币份额； communalGold=总gold−所有钱包，市场外采只能花communalGold。工资/内部买卖只改变货币所有权，总金币仅因外部订单付款减少，不双扣/凭空发薪。
- 村庄粮药需求排除自主猎人消费份额；其daily food优先从私有库存消费1，没粮饥饿按C1规则伤害/死亡。C1其余实名与匿名仍原分配。猎人不自动领取公用药，仅UseMedicine消费私人药并health+100，健康上限1000。死亡保留身份、财产和目标终止记录，不复活、不继续工作/消费或领取工资。
- 原子行动：Rest（降疲劳200，一天只一次）；WorkForPay（health≥300/fatigue≤700且communalGold≥20，实际生产8粮并将20金币所有权从公共移给钱包，疲劳+150）；Hunt（health≥600/fatigue≤600且鹿≥1，实际鹿−1、20粮产出归私人，疲劳+200；额外1个RNG sample决定200/1000风险受伤health−100）；BuyFood（钱包有当天food价、仓库粮≥1，锁价从仓库转1粮给私人、金币所有权回公共）；BuyMedicine（同理1药，当前药价）；UseMedicine（私有药≥1且health<1000，真实药−1、health+100）。不加卖出/路径规划。产量溢出仓库容量记录损失；私人库存上限1000，超量/非法/安全整数溢出拒绝。
- 食物守恒：初始村庄+初始私人（初始私人从村庄转出）+生态/工作/猎粮+外部到货=当前仓库+当前私人+公共/实名真实消费+私人使用+外部流出/损耗，内部转移不当外部消费。现金守恒：总gold=公共gold+钱包，初值−外部paid=总gold；wallet=initialWallet+工资−内部采购额，工资不足整条拒绝；药有对应转移/消费账。

## Utility / Goal 与命令合同

- 候选先查硬约束再评分；饥饿≥300、缺私人粮、health≤700、fatigue≥600及可支付/可用资源改变选择，同分顺序rest→health→food；健康分数1500−health（health≤700才入选）、缺私粮分数600+hunger、疲劳≥600时分数600+fatigue；行动可执行性仍先查硬约束。已有目标在完成/3次失败/20日deadline/死亡或紧急饥饿/疲劳时处理，不每tick无条件换目标。紧急休息/获取口粮可以插入同目标，药与钱不丢失；持续失败终止并冷却2日，不能反复原地旋转。
- 最小目标：secure-food（有私粮则消费由日规则处理，否则钱够BuyFood、不够且能猎Hunt，再不够Work）；recover-health（有私药Use，否则钱够且公药存在BuyMedicine，否则WorkForPay→BuyMedicine→UseMedicine，达到health800完成）；recover-rest（Rest至fatigue≤200完成）。目标保存goalId/kind/step/startDay/deadlineDay/failures/状态/nextGoalId/cooldown，不越级宣称村长/商人/Memory完成。
- 所有行动走command-engine提交路径，内核注册规划器在每日业务点产生确定ID的ActorAction输入、inputSeq和正常receipt；行动成功有HunterActionCommitted事实，失败RULE_REJECTED无成功事实。禁止外部伪造内部命令/同ID不同输入，重复查询/恢复不重付工资/不再猎杀。输入与source、goal关联明确保存；公开系统回调不能自行写protected input/counter。
- 系统每日结算HunterDaySettled记录原市场/生态、人口/实名份额、私人消费、账户与Goal结果；公共资源账consumption不含私人使用，私人消费独立记录，报告需同时核对仓库outflow和私人入/使用/余量。私有session仍整候选规范对照。保存加载按初始配置→外部命令→规范目标规划/行动→每日规则与RNG完整重放，核对inputSeq/receipt/事实/钱包/库存/目标/墓碑，拒绝靠改回执伪造行动。不开放skipValidation标志。

## 验收

TDD：真实私有归属与粮/药/现金守恒、公共资金不足不发薪/外采、库存不足不买、死者不行动、Hunt从同鹿群扣除且与匿名捕猎不重复、受伤必须消药治疗、饥饿/伤病/疲劳/钱包改变选择、Work→Buy→Use目标跨档延续、失败/冷却/截止终止、整tick回退、身份/目标/资产/输入/回执/RNG篡改拒绝。原109项回归与C1/B4对照；真实CLI与磁盘恢复完整状态/事件一致，行动/目标/私账CSV可复算。单元函数绿不等于Runtime闭环；全部消费者通过才标C2已验收。

## 给用户

完成后猎人会因需求做有成本的实际工作/捕猎/采购/治疗，行动改变同一个生态世界；本项尚不含其他人物自主决策、关系、事实记忆或页面/AI接入。

## 给AI

从C1任务分支代码取基准，复用现有资源/生态/市场/Actor内核。先把归属账和行动接口验证/提交，再接规划与command-engine；不得把私有钱包当新增金币、把库存外移当真实消费或让公用市场花掉个人钱。按合同保留未完成事项，精确提交/推任务分支与同步唯一状态/Project2；持续推进到用户额度停点再保存，不自动合并main、部署/启停旧服务或用模型。
