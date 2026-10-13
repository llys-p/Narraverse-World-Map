# D4A CP1a：资产版本底座复核

2026-10-13（Asia/Shanghai）。范围：d4-scene-continuity-v1 的 CP1a 内部检查点，不是完整 D4A/Gift/记忆/服务/UI 验收。

## 裁定

原 DSH 四文件交付为 NEED REVISION：原10项新测试复跑10/10，但非零来源账反例揭示合法收粮被拒绝、收粮账有记录却库存未增加反被接受；禁止接收者计数亦未限制为actor-2。修正及补验后，CP1a 限定 PASS。

当前继续施工的唯一检查点：`D:\Narraverse-World-Map\hds-d4-cp1a-review` @ `codex/world-runtime-d4-cp1a-review`，本地提交 `c84d57d5b5fc4628fe5cb59986528574e924c4de`（父 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`）。恰为三core与一个A测试文件，tracked干净、未push/main/deploy。原执行树 `hds-d4-scene` 及其交付/evidence/备份保持原样；旧后台测试工人bed77884的终态未核实，因此不在原树移交同文件写权。

## 实际缺陷与修复

- Hunter food恒等式未加ownership-v2.foodReceived：合法玩家19/猎人1、given=received=1反被拒；玩家19/猎人0却记received1反被接受。只在明确新ownership上下文加接收来源，旧六字段上下文按0处理。
- Society v5未限制非actor-2的foodReceived=0：新增逐actor门，双边数值即使自洽也不允许把礼物计入actor-1/3。
- 新ownership版本分派先Object.hasOwn/读取version，null漏出TypeError，version访问器可能执行；先record预检，null/访问器明确INVALID_INPUT、getter0。
- 原CP1a-7用actor-1计数变化而库存未配平，却声称“唯一Σ门”，断言被局部库存错误遮住；补成双方库存各自自洽的反例，并断言明确Society gift ledger mismatch。补测试时纠正actor-1初始20→收1后21的fixture算术，原RED及更正版本保留。

保留原交付的player-state-v3 factory及foodGiven分派，无无关重构。原日报ledger按字段选择union是结构校验，不代替上层profile/history审计；后续完整场景须在真实新规则下重演。

## 验证与指纹

- 原10项定向复跑：10 pass/0 fail。原D3基准→原交付RED 3 pass/7 fail回执保留；不能称7项全部为正例（其中含新版本负例定位）。
- 中控独立补反例RED：14 tests、9 pass/5 fail、exit1；修正后同测试字节GREEN：14/14、exit0。
- 直接关联回归：hunter 9/9、society 8/8、exit0。测试由经济型Codex子代理补写/实跑，生产修复由中控完成；未重复原16套件或旧全量。
- 旧完整组件字节配对：固定f7699fb三模块旧blob，在不覆写现场的进程内加载；society-v1及5个旧society-v4 recipe，6组完整初态与6组第1日settle返回的world/payload逐字节相等。该证据是组件层，不是CLI/full World Bundle replay。
- 证据位置：复核树 `artifacts/world-runtime-d4-cp1a-controller/`：cp1a-local-red-20261013.raw.txt（SHA B70D3B1A7927FDDE92E7CC3EA737F20F35A7D781A56F78A2C66D7BDB00A233FD）、cp1a-local-green-20261013.json、三份*-local-green-20261013.raw.txt、legacy-byte-comparison.json/mjs、original-delivery-sha.json。
- 最终字节：hunter A37AED05C2877B21C7774C1C2FD11DCAB73069A95AD7A8751CA36EF710002ECE；society 5354784694AEC4CBFD2753B1C6EF2A839AC0A876D6E400855A8E8D2A753BDC48；player-state 467B07D95AB9FD7E0D10EBC24BA882A8A217C56F67634FB1E522348D0B562609；A测试 643386AC041B04900E0D27A590D49E045F8FF022AF4DE24DEE9FD2CAE109CF7F。

## 交付偏差与未验边界

执行者报告subagent启动后无可用终态，测试及源码由lead自办；task-27不存在。测试独立性和原工人停止不能靠completed板卡或文件不变证明。中控因此在另一个独占树复核/修复，原scope交付无覆盖；同文件原树所有权仍unknown。
原交付曾为基线验证切换现场源码，重复状态变更损坏备份，随后用保全diff重建；本轮仅按交付SHA复制四文件到新树，旧byte对比用只读Git blob，不reset/checkout/clean原树。
执行者另报4项既有/环境失败（runner spawn、旧页面断言）；本轮未独立核定其全部归因，原日志保留，不作为CP1a的PASS依据，不自动修旧页面。

下一步只在c84d57d上准备CP1b闭包：先新memory/observer版本与世界创建，再接真实零tick Gift/立即记忆及完整replay。仍属同一D4A任务，不能把叶层账本测试当作真实礼物发生，也不能直接进入B完整验收。CP1b尚未派发。