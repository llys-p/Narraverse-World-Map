# D4A CP1b：记忆层独立复核与修正

2026-10-13（Asia/Shanghai）。裁定：原候选 NEED REVISION；修正后限定 PASS，仅记忆层。

## 坐标与授权

- 执行/验收树：D:\Narraverse-World-Map\hds-d4-cp1a-review，分支 codex/world-runtime-d4-cp1a-review。
- 基准 c84d57d5b5fc4628fe5cb59986528574e924c4de；本地精确提交 c4ac067a3debe6d104a7b0d85672c442184e4972。
- 恰三文件：memory-runtime.mjs、memory-observer.mjs、已有 scene-gift-runtime.test.mjs。无新增 tracked 文件；未push源码/合main/部署/触碰用户实例。
- 用户指定新DSH主对话直接写测，无DSH子代理。该会话现已停止（原生running=false），交付只在工作区；Codex修源，经济型gpt-6-luna high测试代理只写测试/证据，中控核对日志与最终字节。

## 原交付与独立反例

- 原14条CP1a未删改；执行者追加12项，候选26/26自报。仅CP1B-CHECKPOINT.md保留汇总，未发现其原始RED/GREEN TAP原件，不能将汇总当原始日志。
- 中控在不切换工作树/覆盖源码的情况下，钉定读取c84的两个记忆模块，复现原交付测试：26项/15pass/11fail/exit1。此为新复现证据，不冒称原执行者RED原件。
- 新独立边界第一版5红，第二版收紧森林/死亡事实须整次拒绝并加999→1000正例，11项/5pass/6fail。两版脚本/日志原件保留；没有放宽期望。
- 反例：赠粮观察时间被批次时间重写、已有时间篡改漏拒；v3旅行来源门和位置更新仍只认v2；容量1000后仍可收粮；已知死亡/森林状态仍可制造矛盾的赠粮事实。

## 修正与证据

- 仅memory-observer增加窄v3保护：gift observedTick固定occurrenceTick并结构校验；旅行门/位置更新沿用v2；容量及已知生命/位置矛盾整次拒绝，输入不变。
- 恢复projectActorEvent公开三参数签名，用内部版本helper；旧默认投影和v1/v2行为保留。没有增加无界ID集或业务字段。
- 新11项独立脚本同测试hash由RED转GREEN，迁移至已有A测试文件，原26项不变。最终A文件37/37，旧observer11/11、memory-runtime4/4、memory-engine4/4；均exit0/0skip。独立脚本11与迁移后37有重叠，不累计成额外测试数。
- 以上定向成员由测试代理实际执行，中控核实际日志/迁移前后hash；提交后代码未变，不重复跑同一成员。执行者其余扩展回归仅保留历史自报，未当本次独立证据；未跑旧822或浏览器/CLI全量。
- 原交付三文件及diff保留于源码树 artifacts/world-runtime-d4-cp1b-controller/original-delivery/；原DSH检查点不覆盖。
- 完整证据：源码树 artifacts/world-runtime-d4-cp1b-controller/final-acceptance-index.json、controller-final-report.json、boundary-tests.red.v2/green.tap、scene-gift-runtime-37.tap及三个直接回归原始日志。完整源码/测试指纹见index。

## 限定与下一步

单observer只审结构/投影，reduceMemoryFacts只审当前suffix，跨suffix全历史去重由full-history audit拒绝；不认证真正发生过资产转移。延迟全日志复算保留真实gift观察时间，不要求批次时间等于每条旧事实时间。
本片能创建/校验记忆层空态、投影本人赠粮事实及延续旅行位置；尚无scene fixture/bundle、executeSceneIntent、真实Gift资产提交/事件分派/完整世界重演、format9服务/CLI/UI。D4A整体和B/H1–H7未验收。
后继须从c4ac067按依赖分短单接新世界创建、真实Gift与完整重演；本轮未派发后继，不重启未知所有权的旧hds-d4-scene。