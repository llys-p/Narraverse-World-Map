# C1：实名身份、聚合人口份额与 Needs

2026-10-07（Asia/Shanghai），本对话自行实施。代码基准B4 `28c60d4858d98800a9d85b3cb99c3de2f38a8f61`；源码 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-c1`。采用冻结b4-baseline配置作C实验基础；旧A/B规则/fixture保持兼容，不合并main、不接UI/模型/旧存档。

## 固定合同

- 新规则 `c-actors-v1` / fixture `actor-village` v1 / 配置 `actor-config-v1`，嵌套冻结的市场配置。默认3人：村长、猎人、商人。初始聚落80人**已经包含**实名3人，未实例化77，不增加总人口。初始injuredCount仅指未实例化人口，不能超过77；实名伤者另算。实名者暂从原未分配劳动力中移出，C1不允许作为聚合农民/采药者/猎人；C2再接独立行动，不能双算。
- Actor ID依配置数组顺序由nextEntityId分配：actor-1/2/3，快照nextEntityId=4；全局连续分配、绝不复用死者ID。当前C1不开放新增/删除/变更simulationLevel命令。配置initialActors最多64，初始health0表示已有死亡墓碑deathTick=0；其他为存活。保存姓名、occupation(chief/hunter/merchant)、location(village)、L1、alive、health/hunger/fatigue(0..1000)、needs(food/healing/rest)、lastNeedsTick、deathTick。人格/关系/记忆/Goal归C2～C4，不建空框架或声称决策已完成。
- C1最小频率固定每144tick每日一次（不是原建议的30分钟Needs；后续提高频率须版本变更）。每日完整顺序：已到期货到达→匿名生态/生产/捕猎→粮药实际消费→市场价格/采购→实名份额分配/需求更新（分配是同一消费账的所有权明细，不额外扣库存，价格读取已消费后的库存）；actor当前Goal尚无，默认休息。
- 每存活人每日1口粮，强制食物consumption=1/1。资源总需求=匿名存活数+实名存活数；死者不消费；分配按匿名群体先、实名ID顺序后，不因身份凭空增加粮食或重复扣库存。实名当天分配food只可能0/1；所有实名+匿名实际消费=同一资源账consumption。
- 药需求=匿名当日伤者+health在1..999的实名存活者，每人每日1治疗单位；匿名先治疗，剩余按实名ID顺序分配，实名每实际消耗1单位health+100（上限1000），无药不得恢复。生态healed字段只代表匿名伤者，namedShares字段记录实名份额与实名治疗量，累计总herbs消费仍一笔资源账。
- 存活者每日 hunger=min(1000,hunger+100)，吃到1份后hunger=max(0,hunger−200)；fatigue=max(0,fatigue−200)表示默认休息；粮未分到且hunger≥500时health−50（不低于0）。治疗先health+100、随后应用饥饿伤害。health降0时一次死亡，alive=false/deathTick=当日tick，保留记录；下一日从存活人口/消费/治疗排除，不重新生成替身。匿名群体本阶段不生死，C1仅有界实名饥饿死亡。
- needs为纯派生值：存活food=hunger，healing=1000−health，rest=fatigue；死者三项为0。需求更新只来源于实际分配/休息/健康规则，不接受任意SetNeeds/模型修改。累计命名food/herbs消费、死亡计数和初始份额持久化，可与资源/姓名/ID对账。
- 新日事实 `ActorDaySettled`包含原市场/生态资源账、人口开/收账、匿名份额与实名逐人开/收状态、实际food/herbs分配、饥饿损伤/休息/死亡。现有RemovePopulation与SetTradeRoute命令仍通过core inputSeq/receipt处理；日事件引用其事实。存档从初始配置+命令+每日1次RNG完整重放，验证Actor ID/份额/Needs/消费/墓碑/计数，系统不得改配置或冒分新ID。
- Session活动tick扩展规范Actor规则候选，保持B4入口/导出/持久化全量历史审计与冻结状态。未知规则/字段、异类、稀疏、超量或非法数字拒绝；CLI/保存明确失败，不猜B旧档转人物。

## 验收

先红后绿：80=77+3、密集/唯一ID及nextEntityId；名单不增加消费；实名/匿名劳动力互斥；真实短缺决定逐人饥饿、药材不足不恢复、疲劳随休息下降；死者不消费/治疗/生产、不复用ID；配置/身份/Needs/余量/墓碑/消费/事件/RNG篡改拒绝，失败整tick回退，原98项回归。真实CLI导出actor-config.json/actors.csv/population.csv，原五CSV与完整checkpoint/inputs保留；磁盘与连续/分块完整状态事件一致，100天实际消费者、固定seed/短缺对照有账可追踪。

## 给用户

本项完成后人物会有连续身份、真实消费份额和需求变化；仍没有自主猎人/商人/村长决策。下一项C2猎人Utility/Goal与行动消费移交，C3竞争及C4记忆后续实施；C1不能冒充阶段C完成。

## 给AI

从B4任务代码取基准，不从仅控制文档的main取运行时代码。精确提交推codex/world-runtime-c1，每项结束更新PROJECT_CONTEXT与Project2；保护其他worktree与同期E1文件。持续推进至五小时/周窗口实际剩约10%～15%时保存停下，不为过测试降合同、自动合并main、部署或调用模型。
