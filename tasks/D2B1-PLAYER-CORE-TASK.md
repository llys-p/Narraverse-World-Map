# D2B1：玩家核心

依赖[共同合同](D2B-PLAYER-CONTRACT.md)，D2A交接0aa76fb。工作树D:\Narraverse-World-Map-d2b-core、分支codex/world-runtime-d2b-core；实际合同基准SHA由中控开工回执给出。用户授权子代理实施，状态为进行中（工作树基准2f04ac7），不能自报阶段验收。

负责：新profile、唯一四人登记、独立玩家资产、日需求与全部工资/外采私币预留、完整事实/RNG/回执重演，提供共同合同的构造、systems与知识函数。

白名单：新增runtime/core/player-state.mjs、player-runtime.mjs，runtime/fixtures/player-village.mjs，runtime/knowledge/player-knowledge.mjs；现有runtime/core/actors.mjs、society.mjs、hunter.mjs、memory-runtime.mjs、memory-observer.mjs、public-medicine.mjs、world-state.mjs、command-engine.mjs、event-log.mjs；新增tests/simulation/player-core.test.mjs。其他路径必须先向中控说明理由，不自行修改。

禁止：runtime/service、HTTP/server、页面、旧tests、runner、共同合同/README/PROJECT_CONTEXT、其他工作树/分支、main与所有运行实例。NPC人格仍三行，不因多一个玩家扩成四NPC。新Actor版本如非必要可保持通用原Actor结构，但旧C4/C5的3人精确门槛不变。

TDD先真实反例再实现。定向覆盖初始分拨、四人一次消费、缺粮/死亡、玩家私币贯穿工资与外采、完整重演/伪改拒绝、知识隔离；node --test --test-concurrency=1 tests/simulation/player-core.test.mjs，并复跑直接改动关联的小范围测试。不同时运行全量。服务路与独立测试路将依你的冻结接口开发；出现合同不适配先及时通知中控。

交付：实际基准/交付SHA、Git clean与文件列表、定向命令/通过失败证据、未验证项；精确暂存/提交/推任务分支，不合并main。报告给中控，等待独立集成验收；不得自行开始D2C。
