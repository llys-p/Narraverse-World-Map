# B3：库存价格与付费延迟贸易

2026-10-07（Asia/Shanghai）。本对话自行实施，基准B2 `efda6f656c9300100b1d47a0fa26a365dcc8d132`，源码 `D:\Narraverse-World-Map-a2 @ codex/world-runtime-b3`。不合并main、不接UI/模型/旧存档。A/B1/B2旧规则和fixture继续兼容。

## 固定规则

- 新规则 `b-market-v1`，配置 `market-config-v1`嵌套B2生态配置；每日144 tick一次，唯一daily-market任务。持久化价格、routeOpen、在途订单、连续订单计数、累计订购/到货/付款账。默认外部供应无限，但出发受库存需求、运力和金币约束；没有免费进口、商队寻路、人口生死或实名NPC。
- food价格单位为金币最小单位/口粮份，base/min/max=10/5/30，每日最大变化2，目标库存400，单笔最多100；herbs单位为金币最小单位/治疗单位，base/min/max=50/25/150，最大变化10，目标40，单笔最多20。
- 唯一稀缺指标 `gap=clamp(trunc((target-stock)*1000/max(1,target)),-1000,1000)`，正为短缺、负为富余；gain=1000。运输风险100/1000、风险加价系数200/1000，仅为价格修正，没有随机丢货。`targetPrice=clamp(floor(base*(1000+trunc(gap*gain/1000)+trunc(risk*premium/1000))/1000),min,max)`；当天价从前一天价向目标价移动，绝对变化不超过maxDailyChange。伤病需求仅通过消耗改变库存，不额外重复加入需求加价。最低分母1、价格/参数是有界安全整数。
- 当天顺序：收取已到期且路线开放的货→B2生态/生产/消费/治疗/损耗→按结算库存更新价格→按food、herbs顺序采购。采购缺口=目标−现货−本资源在途数量（不足0则不买）；数量再受单笔上限、剩余总在途运力、可支付金币限制。总在途容量120货物单位（简化：粮和药每单位均占1运力），运输2整日，订单日d在d+2每日结算前到达，出发即扣qty×当天锁定价；金币不够则数量降低或不订购，订单在途不计入可消费库存。
- 到货全部记资源inflow，仓库容量溢出依原账记损失；金币支出记gold资源consumption和市场累计paid，外部资金接收者为开放边界。不实现卖出/退款/中途丢货。资源日账金币行反映生态结算前余额；当天付款在EconomyDaySettled付款账记录，两者共同构成完整账。
- 新命令 `SetTradeRoute {open:boolean}`，与RemovePopulation同样经inputSeq/ID/receipt原子处理。关闭阻止新出发，并保留/延期已付款货物；重新开放后在下次每日结算卸载所有到期货一次，不重复扣款。相同状态设置成功并记录事实；非法类型拒绝。命令在每日结算前处理，规则版本禁跨单位TransferResource。
- 日事实EconomyDaySettled保存到货明细、B2生态/资源日账、价格前后及gap/目标、订单锁价/费用/dueDay、日金币开/收账、在途量；因果引用真实PopulationRemoved/TradeRouteSet事实。订单ID连续、每单正整数且arrivalDay≥orderDay+delay；当前在途与累计ordered−arrived对账，金币初值−paid=当前余额；保存/恢复从配置+命令+每日RNG重放全部事实和账户，不能改配置/到货日/价格/回执骗过校验。
- 保护预算沿用生态≤10000日、人口/种群≤1000000；价格/目标/采购上限/运力≤1000000、delayDays=1..30、总在途订单≤1000。满预算先拒绝，不丢单。中间乘法/账目用BigInt，结果安全整数。默认除价格/运力外不增加新随机抽样，沿用B2每天1次RNG。

## fixture与验收

market-village使用B2基础初值。market-shortage仅初值改为粮100、药0、金币2000、伤者2；展示真实付款和day3到货。market-route-pause在shortage配置基础上加tick288关闭、tick576开启路线，day3不卸货、day4只卸一次。输入/配置导出并进入checkpoint，不与日期写死的生态结果混淆。

TDD：库存0/目标0/富余价格有界、每日最大变化；金币为0不采购；整笔锁价与在途运力受限；到货日前不消费、准时一次到货、关闭/恢复不重复付/收货；药材消费→库存/价格→付费运输闭环；收支/在途账、命令幂等、失败tick全回退；事件/配置/价格/费用/dueDay/RNG篡改拒绝。真实磁盘跨在途/关闭保存恢复，CLI导出market-config.json、market.csv、trade.csv以及原生态/资源CSV；连续与分块完整状态/事件一致；原79项全回归。

只验收B3，阶段B门槛在B4执行100/500/1000天、多seed与扰动。逐tick历史重算性能瓶颈后续须独立解决且保留严校验，不在本轮悄悄放宽。
