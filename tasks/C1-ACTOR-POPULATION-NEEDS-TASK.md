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

## 实施与验收收口：PASS

2026-10-07（Asia/Shanghai）。本对话自行实施及复核，代码基准B4 28c60d4，实现 `7c59ad0b41b6283d6f6eaf82031b37fc0fe367cf`；源码D:\Narraverse-World-Map-a2 @ codex/world-runtime-c1。新增core/actors.mjs、fixtures/actor-village.mjs及两份测试；显式Actor规则接入世界/事件/引擎私有session和runner。resource/ecology/market只增加声明的实名份额/死亡人口扣除接口，旧规则默认行为回归。冻结市场配置抽到calibratedMarketConfig复用，B4参数指纹及真实1000日轨迹未变。

导出ACTOR_RULES、MAX_PERSISTENT_ACTORS，defaultActorConfig/createActorWorld/populationShares/validateActorWorld/settleActorDay/applyActorCommand/validateActorPayload/validateActorHistory；fixture createActorVillage/createActorNeeds/createActorShortage。身份依配置次序分配连续ID，snapshot nextEntityId只允许C1预分配后的计数。匿名劳动/伤者不能挤占实名份额，资源一次结算后分配实际消费明细，不重复扣库存；Need纯派生且持久化，饥饿死亡墓碑不复用。

TDD核心先ERR_MODULE_NOT_FOUND，CLI先Unknown fixture；9项核心+2项真实磁盘/CLI共新增11项，全部simulation+export-boundaries109/109（原98保留），约197秒，diff通过。最后1药的独立分配用例初版被原生态捕猎新伤者消耗，已隔离该用例捕猎、另有匿名优先治疗明确反例，未改真实生态规则。身份/人口/Needs/药粮不足/有限数与预算/死亡一次/不复活/非法数据/配置/墓碑/回执/事件/RNG篡改及整tick回退覆盖。

干净消费者Node v24.14.0：actor-village seed42连续100日 vs40日保存+60日恢复，完整snapshot/EventLog及stateHash/eventHash、actors/population/ecology/economy/market/trade六CSV、inputs/actor-config一致。独立新进程825人日核对匿名77+实名存活、劳动互斥、消费分配、状态变化与墓碑；100日实名粮300，世界总消费8000。actor-needs5通过真实粮药和休息将猎人健康500/饥饿500/疲劳600恢复至1000/0/0；actor-shortage30中村长tick144、猎人/商人tick3456死亡，身份记录持续且无额外消费。真实磁盘4=1+3恢复Needs和墓碑完整相同，坏需求档拒绝。

100日约9秒，条件为同期全回归，summary内存末尾采样不是峰值。B4冻结baseline seed42 1000日复跑完整checkpoint字节与之前相同（19.1秒，同期回归条件）。stateHash=e9ed423355d0f0420e36d034f7fbb7086bff864128fea918b6f3bc5da3075262；eventHash=77c9ae3bfc30571a10a2eb8e27e7f7feb9a6c9dde5ea943544ef6f076fd6c347；actorConfigHash=f9bc2b2021c732fb365b30ad39bb26d48ec93981f219756ef19c92930045dc39；runtime sourceHash=95bfa553e1f619d23f30d07cc4ddbaf5ab05f8351e8cd96de56068a826aeaf57。

证据本地忽略目录artifacts/world-runtime-c1-acceptance-20261007：full-tests.txt、consumer-probe.mjs、comparison.json、continuous100/prefix40/resumed60/needs5/shortage30及b4-compatible1000，不上传运行数据。仅C1单项通过，C2 Utility/Goal/猎人独立工作/捕猎、C3竞争与C4关系/记忆仍未开始；C阶段未验收。
