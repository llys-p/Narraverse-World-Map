# D2B2：玩家服务与页面

依赖[共同合同](D2B-PLAYER-CONTRACT.md)，D2A交接0aa76fb。工作树D:\Narraverse-World-Map-d2b-service、分支codex/world-runtime-d2b-service；实际合同基准SHA由中控开工回执给出。接口冻结后即可与核心并行实现，真实运行待核心依赖交付；不造mock核心来宣称验收。

白名单：runtime/service/http-contract.mjs、runtime-owner.mjs、service-commit.mjs，runtime-server.mjs、runtime-map.html、runtime-map.mjs、runtime-map.css；新增tests/simulation/player-service.test.mjs。依赖导入按共同合同路径与字段，旧profile/format1保持。不得改core、fixtures、knowledge、原tests、持久化共享工具或文档/看板。

负责：显式profile新目录、serviceFormat2严格配对与完整journal replay、同发布点两DTO缓存、玩家固定只读入口与隐私、页面两读数一致性、真实显示本人字段。AdvanceTime原ID/revision/幂等/限额/存盘门槛不变，不开放旅行交易或选择NPC身份。默认旧profile/只读不变化。

测试先红后绿，覆盖新旧配对/未知拒绝、纯读与复制、实际玩家资产/人口、一致发布/两读数不同revision处理、存盘重启/原ID重试、坏最新拒绝。不以静态页面或类型字段作为通过证据。定向node --test --test-concurrency=1 tests/simulation/player-service.test.mjs，最多同时跑本路小范围；全量与真浏览器统一交中控，不占旧服务端口。

核心代码未落地时保留明确依赖，及时报告；中控交付核心依赖提交后可在本工作树纳入，只提交自己白名单的实现，回执区分依赖SHA与本路SHA。精确推送任务分支，不合并main/不更新状态文档，不自行进入D2C。

## 收口

2026-10-07 20:18（Asia/Shanghai）。服务bf61578已推，纳入实际核心依赖后定向8/8、无skip；中控最终8e596a3全量232/232与真实CLI/双页签/断连重试/键盘/磁盘本人DTO通过，本路已验收。页面两DTO失配重读门槛另经真实DTO脚本测试，未冒充浏览器注入网络证据。统一见[共同合同收口](D2B-PLAYER-CONTRACT.md)。不自行开启下一阶段。
