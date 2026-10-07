# B3：库存价格与付费延迟贸易

2026-10-07（Asia/Shanghai）。本对话自行实施，基准B2 `efda6f656c9300100b1d47a0fa26a365dcc8d132`，源码 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-b3`。不合并main、不接UI/模型/旧存档。A/B1/B2旧规则和fixture继续兼容。

## 固定规则

- 新规则 `b-market-v1`，配置 `market-config-v1`嵌套B2生态配置；每日144 tick一次，唯一daily-market任务。持久化价格、routeOpen、在途订单、连续订单计数、累计订购/到货/付款账。默认外部供应无限，但出发受库存需求、运力和金币约束；没有免费进口、商队寻路、人口生死或实名NPC。
- food价格单位为金币最小单位/口粮份，base/min/max=10/5/30，每日最大变化2，目标库存400，单笔最多100；herbs单位为金币最小单位/治疗单位，base/min/max=50/25/150，最大变化10，目标40，单笔最多20。
- 唯一稀缺指标 `gap=clamp(trunc((target-stock)*1000/max(1,target)),-1000,1000)`，正为短缺、负为富余；gain=1000。运输风险100/1000、风险加价系数200/1000，仅为价格修正，没有随机丢货。`targetPrice=clamp(floor(base*(1000+trunc(gap*gain/1000)+trunc(risk*premium/1000))/1000),min,max)`；当天价从前一天价向目标价移动，绝对变化不超过maxDailyChange。伤病需求仅通过消耗改变库存，不额外重复加入需求加价。最低分母1、价格/参数是有界安全整数。
- 当天顺序：收取已到期且路线开放的货→B2生态/生产/消费/治疗/损耗→按结算库存更新价格→按food、herbs顺序采购。采购缺口=目标−现货−本资源在途数量（不足0则不买）；数量再受单笔上限、剩余总在途运力、可支付金币限制。总在途容量120货物单位（简化：粮和药每单位均占1运力），运输2整日，订单日d在d+2每日结算前到达，出发即扣qty×当天锁定价；金币不够则数量降低或不订购，订单在途不计入可消费库存。
- 到货全部记资源inflow，仓库容量溢出依原账记损失；金币支出记gold资源consumption和市场累计paid，外部资金接收者为开放边界。不实现卖出/退款/中途丢货。事实内生态子账金币行反映采购前余额，EconomyDaySettled付款账记录随后支出；economy.csv金币行合并当天付款为实际consumption，期末与snapshot金币一致，trade.csv的paidAmount到货为0。
- 新命令 `SetTradeRoute {open:boolean}`，与RemovePopulation同样经inputSeq/ID/receipt原子处理。关闭阻止新出发，并保留/延期已付款货物；重新开放后在下次每日结算卸载所有到期货一次，不重复扣款。相同状态设置成功并记录事实；非法类型拒绝。命令在每日结算前处理，规则版本禁跨单位TransferResource。
- 日事实EconomyDaySettled保存到货明细、B2生态/资源日账、价格前后及gap/目标、订单锁价/费用/dueDay、日金币开/收账、在途量；因果引用真实PopulationRemoved/TradeRouteSet事实。订单ID连续、每单正整数且arrivalDay≥orderDay+delay；当前在途与累计ordered−arrived对账，金币初值−paid=当前余额；保存/恢复从配置+命令+每日RNG重放全部事实和账户，不能改配置/到货日/价格/回执骗过校验。
- 保护预算沿用生态≤10000日、人口/种群≤1000000；价格/目标/采购上限/运力≤1000000、delayDays=1..30、总在途订单≤1000。满预算先拒绝，不丢单。中间乘法/账目用BigInt，结果安全整数。默认除价格/运力外不增加新随机抽样，沿用B2每天1次RNG。

## fixture与验收

market-village使用B2基础初值。market-shortage仅初值改为粮100、药0、金币2000、伤者2；展示真实付款和day3到货。market-route-pause在shortage配置基础上加tick288关闭、tick576开启路线，day3不卸货、day4只卸一次。输入/配置导出并进入checkpoint，不与日期写死的生态结果混淆。

TDD：库存0/目标0/富余价格有界、每日最大变化；金币为0不采购；整笔锁价与在途运力受限；到货日前不消费、准时一次到货、关闭/恢复不重复付/收货；药材消费→库存/价格→付费运输闭环；收支/在途账、命令幂等、失败tick全回退；事件/配置/价格/费用/dueDay/RNG篡改拒绝。真实磁盘跨在途/关闭保存恢复，CLI导出market-config.json、market.csv、trade.csv以及原生态/资源CSV；连续与分块完整状态/事件一致；原79项全回归。

只验收B3，阶段B门槛在B4执行100/500/1000天、多seed与扰动。逐tick历史重算性能瓶颈后续须独立解决且保留严校验，不在本轮悄悄放宽。

## 实施与验收收口：PASS

2026-10-07（Asia/Shanghai）。本对话自行实施及复核，未派外部执行者。基准B2 efda6f6，主实现 `2807db2be23e6f317e27607be2516f6243d96eb3`，最终代码修正 `18ae1fe41a8984aa94d5d0b3a21e6532ac878e98`；源码D:\Narraverse-World-Map-a2 @ codex/world-runtime-b3。新增core/market.mjs、fixtures/market-village.mjs、两份测试；显式市场版本接入world-state/command-engine/event-log/runner。生态与资源结算仅增加精确的已付货币/实际到货参数，旧默认行为和fixture保持兼容；A1与磁盘checkpoint实现未改。

接口：defaultMarketConfig/shortageMarketConfig/createMarketWorld/quotePrice/validateMarketWorld/settleMarketDay/applyMarketCommand/marketCommandFact/marketCauses/validateMarketPayload/validateMarketHistory；MARKET_RULES、MAX_TRANSIT_ORDERS；fixture导出createMarketVillage/createMarketShortage/createMarketRoutePause。资源/生态结算不读取外部模型或宿主服务，市场纯日规则，engine负责原子tick/ID去重及因果序号。

TDD：核心先ERR_MODULE_NOT_FOUND，CLI先Unknown fixture；初版预期库存遗漏原B2捕猎产2鹿×20口粮，已按真实生产账核实并纠正测试，没有改生态规则。额外输出反例发现economy.csv金币消费为0而日付款1980；修正合并当天付款后，现金行2000−1980=20，与snapshot一致，贸易到货paidAmount=0。修正前后相同场景stateHash/eventHash不变，只修输出账。

Node v24.14.0，最终干净18ae1fe全部simulation+export-boundaries90/90（原79+新增11），约124秒，diff检查通过。覆盖0库存/0资金/目标0/有界价格、运输容量/待到货占位、锁价付款、准时一次到货、闭路暂停/恢复、药材缺口→价格/付费货→治疗、花钱后人口干预、非法数据/预算、配置/价格/费用/dueDay/RNG/回执篡改拒绝、系统失败整tick回退。真实磁盘4=2+2包含关闭中带已付订单存盘、未来重开命令、完整RNG/事件/价格/在途账；坏货物日期档拒绝。旧A/B1/B2全回归，未降门槛。

干净新消费者18ae1fe，实际CLI market-route-pause seed0连续4天 vs 2天保存+2天恢复，完整snapshot/EventLog、两哈希、population/ecology/economy/market/trade五CSV、inputs与市场配置一致。tick576、6事实，2订单/2到货，共支付1980、剩余金币20；第3天闭路到货0，第4天粮100/药13一次入账。另market-shortage开放路线3天，第3天正常到同两单。BigInt独立核对每单成本/锁价/ID/运输日期、商品收支、价格公式和日变幅、CSV付款总额与金币期末。4天约13秒为同期全回归条件，内存仅末尾采样未测峰值。

stateHash=05fdf0dac8617e4b81aa61245d869172d5939235db58f947d19486dc567c2f6f；eventHash=c7e4d181dcd3fe266dff6be38568a6ec95a414d949ea026e8c8193870d09070d；marketConfigHash=8b7d8ad30a96f27f1fb5d03295550244440eb62fdf766bb0999d2e9f8cd499dc。runtime sourceHash=92674ff27e87cbb28d2888fb0e1392d74909871abc0724cf6ed35f65b3f5ccb8。本地忽略目录artifacts/world-runtime-b3-acceptance-20261007-1359保留修正前证据与最终final-full-tests.txt、consumer-probe.mjs、final/comparison.json及closed4/closed2/resumed2/shortage3产物，不上传。

只验收B3，B阶段仍进行中；B4先优化逐tick历史重算开销并保留严格恢复/篡改/回退验证，再进行100/500/1000天、多seed与扰动门槛。外部无限供应是明确模型边界，实际采购受运力/金币约束；未实现卖出/退款/随机货物损失/商队寻路/NPC/页面/AI。源码不合并main，不启停服务，不迁移真实存档；E1预研独立状态保留。

最终交接 `ee480ea442f3ac5f367de2e0b24eca00925c9993` 已推origin/codex/world-runtime-b3（末次仅文档同步）。最终干净提交seed0一天烟测通过，现金CSV2000−1980=20，runtime指纹与验收相同，工作树干净。
