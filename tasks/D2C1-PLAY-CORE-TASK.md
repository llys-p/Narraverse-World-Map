# D2C1：玩家动作核心

共同基准为[公共合同](D2C-PLAY-CONTRACT.md)提交，上接33e8154。工作树D:\Narraverse-World-Map-d2c-core @ codex/world-runtime-d2c-core；中控下发实际SHA后开工。负责新玩法规则、唯一位置/资产、真实动作登记/完成/事实/回执和动态inputSeq完整重演，原日规则/旧版本不变。

白名单：新增runtime/core/player-intents.mjs、runtime/fixtures/player-play-village.mjs与tests/simulation/player-play-core.test.mjs；修改runtime/core/player-state.mjs、player-runtime.mjs、actors.mjs、society.mjs、memory-runtime.mjs、memory-observer.mjs、public-medicine.mjs、world-state.mjs、command-engine.mjs、event-log.mjs、data-contract.mjs、runtime/knowledge/player-knowledge.mjs。其他模块必要改动先向中控说明，不自行扩大。

不得改service/server/页面、runner、旧tests/断言、公共合同、README/PROJECT_CONTEXT/看板、其他树/运行实例。不要把玩家做第四NPC Agent。实现入口与describePlayerActions严格按合同；完成前保持原位置，完成tick玩家先于NPC/日结。日被动休息保持，主动效果独立记录；村庄之外的新观察权属从旅行事实重演，不提供自由resting/price预算控制。

TDD从旅行/真实买卖/跨日/动态输入序号及重演反例开始，先红后绿。只node --test --test-concurrency=1 tests/simulation/player-play-core.test.mjs及必要直接关联短回归；中控统一全量。短回执立即确认冻结函数/字段，以供另外两路并行写。输入中途保存/恢复、私产守恒、reject耗时与旧版本拒绝都是真门槛，不能提供仅type/provider实现。

精确提交推送本路干净保存点，回执给基准/交付SHA、验证/失败/未验证、文件列表；不合并main，不自行开始战斗。公共合同有问题先消息中控，勿一边假设改接口一边让服务继续猜。
