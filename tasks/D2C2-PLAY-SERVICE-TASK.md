# D2C2：动作服务与页面

依赖[公共合同](D2C-PLAY-CONTRACT.md)的冻结接口，可与核心并行实施；工作树D:\Narraverse-World-Map-d2c-service @ codex/world-runtime-d2c-service，实际合同基准由中控下发（上接33e8154）。

白名单：runtime/service/http-contract.mjs、runtime-owner.mjs、service-commit.mjs、runtime-server.mjs、runtime-map.html/mjs/css，新增tests/simulation/player-play-service.test.mjs。禁止改core/fixtures/knowledge/persistence共享工具、旧tests、文档/看板或其他树。不要直接给bundle改钱包/位置，唯一核心executePlayerIntent由提交与journal恢复共用。

负责：新显式profile/format3严格配对、DTO version2精确分派、原AdvanceTime不变、成功及已耗时reject都持久回执/原ID、rule-preflight422无推进、非JSON与两DTO一致性保留、玩家权威报价/耗时/地点表单和可辨outcome。capabilities旧profile false、新profile true，不能旧世界暗迁移或让客户端指定NPC/预算/价格。

先记录真实RED，不造fake核心报通过；等核心干净提交由中控提供后本路纳入跑真实HTTP/磁盘。只单并发本路定向测试，真浏览器与全量归中控。范围不足/字段不适配立即消息，不自己扩公共API。成功typed receipt必须核对type/outcome，拒绝不能显示旅行/买卖成功。

精确提交推送，回执本路SHA/依赖SHA分别给出、实际验证与未验证；不改状态文档、不合并main/部署，不自行进入D3。
