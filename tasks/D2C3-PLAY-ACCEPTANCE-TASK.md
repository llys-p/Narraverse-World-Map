# D2C3：独立玩家玩法反例

依赖[公共合同](D2C-PLAY-CONTRACT.md)，工作树D:\Narraverse-World-Map-d2c-acceptance @ codex/world-runtime-d2c-acceptance；实际SHA由中控下发，上接33e8154。与实现并行建立冻结反例，缺依赖先RED。

白名单仅新增tests/simulation/player-play-acceptance.test.mjs、player-play-service-acceptance.test.mjs和本树忽略artifacts/world-runtime-d2c-*；不改生产、旧tests/阈值/断言、公共文档/看板、其他树。用固定预期/独立BigInt守恒/真实来源而非复制实现输出。

核心反例：无跨午夜来回24tick/两次+100与主动休息6tick减100不回血；跨日被动恢复另算不误判；143买最后私粮→144先买后吃，143卖最后粮→144先卖后饿死封存款；143起旅行155结束而144死亡→拒绝不移动但12tick/死亡仍保存。最后公仓药/公共可用币与NPC同tick竞争：玩家先，后者重检，不能花其他钱包或未来回款。交易返售累计inflow/outflow、私bought/sold/used及现金总量独立守恒，村外/不足/超限/非法参数入场不耗时。

恢复/界面：真正核心PlayerAction回执和事实、动态登记/NPC inputSeq无缝；143+1与进行中动作checkpoint续跑完整相等；改价/数量/起止/位置/两层回执/journal顺序并重算指纹仍拒绝；真实HTTP统一提交与原ID重启、已耗时reject重试不重复、保存失败不发布两DTO、坏最新不回退。森林真实观察不收新村内公告/行情却收本人事实，老观察器/旧profile精确不变。不得只mock/静态页面/新增函数存在即通过。

只node --test --test-concurrency=1跑本路两文件；生产失败给中控最小反例，不顺手改实现。全量与真CLI/浏览器中控独立验收，不能本路绿灯标D2C完成。精确提交推送并报依赖/交付SHA、红绿证据与未验证，保护原数据/旧服务。
