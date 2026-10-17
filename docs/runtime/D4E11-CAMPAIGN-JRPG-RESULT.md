# D4E11 自主行军与日式回合制：候选交付

记录时间：2026-10-17 14:46（Asia/Shanghai）。

**裁定：`INCOMPLETE_NOT_ACCEPTED`。** 核心与服务定向检查有通过证据；真实页面已完成行军、暂停改道、NPC路遇和森林两回合胜利。返村及最终正常关闭重开尚未完成，D4E10仍为上一已验业务基准。提交/推送不代表阶段通过。

## 一、给用户看

### 已实现

- 点击可达地图位置下达真实行军订单，每笔确认最多推进2刻，可以中途暂停、从实际位置改道；镜头支持缩放和跟随。
- 村长、猎人、商人沿用原人物身份；坐标与有限路线进入存档和完整重演。近距离路遇会暂停，显示人物及本人收到玩家赠粮的既有记忆。
- 森林战斗采用日式回合指令。攻击确认后按服务真实事件播放出手、反击、结算与倒地；击杀后没有死狼反击，跳过表现不改变结果。
- 工作、交易、休整和赠粮沿用权威服务规则；开发者全知活动不当作人物知识。旧页面与旧存档版本隔离。

### 缺项及限制

最终保存于道路 `(9,7)`，因商人路遇暂停，返村目的地 `(4,7)`；玩家HP920、私粮19、狼0、已胜利。返村和最终重开没有通过证据。

页面检查有原600秒及两次分别授权的300秒有界接续，保留全部失败/超时，**不是一次完整全绿运行**。最新接续在等待返村阶段触发120秒上限，包含页面交互等待，不能直接作为某一命令120秒的耗时，也不能据此确定性能根因。

每世界仍限128条命令，至多2刻一笔并保留暂停位。隐藏、刷新或离页停止续发，需明确点继续；不是墙钟后台模拟。外观、音效和长历史性能未验收，不承诺无限游玩或流畅性能。

候选入口为本树 `Start-D4E11.cmd`，拟用 `http://127.0.0.1:18340/runtime-campaign.html` 和独立 `artifacts/d4e11-daily/world`；**本轮未启动日常入口、未创建其世界目录**。下一步只接续同一隔离存档返村、正常关闭和重开比对；新的业务运行需新的有界授权，不重置旧限额或重打战斗。

## 二、给 AI / 中控看

### 目录和版本

| 项目 | 精确值 |
| --- | --- |
| 执行树 | `D:/Narraverse-World-Map-campaign-jrpg` |
| 分支 | `codex/world-runtime-campaign-jrpg` |
| D4E10基准 | `6c60fe2d5b6276660936e1ab55a43385a79737ba` |
| 核心实现 | `27ddaba51e080ef9db38361eaafe1c09c9863b57` |
| 页面/入口/检查器实现 | `e7f622350be5912082239ddaab5d20f406b50b03` |
| 合同 | [D4E11-CAMPAIGN-JRPG-TASK.md](../../tasks/D4E11-CAMPAIGN-JRPG-TASK.md) |
| 原始证据索引 | [execution-index.json](../evidence/d4e11-campaign-jrpg-20261017/execution-index.json) |

本报告与检查器授权标识修正另随交付提交。运行产品108项 [SHA256清单](../evidence/d4e11-campaign-jrpg-20261017/product-sha256.json) 已逐项确认匹配；不含本报告和检查器脚本。环境 Windows `10.0.26200.0` / Node.js `v24.14.0` / PowerShell，仅内置Node模块，无依赖安装、模型或付费调用。

远端发布状态：2026-10-17本轮 `gh repo view llys-p/Narraverse-World-Map --json isPrivate,url` 实际返回 `isPrivate:false`。与本项目AGENTS.md“保持私有、素材许可未核实”要求冲突；先完成本地精确提交，未向公开远端推送本候选或更新Projects，等待用户明确公开范围或恢复私有的决定。

新合同为 campaign-village / d-campaign-v1 / serviceFormat11 / DTO5、receipt5；actor5、society7、memory8、observer4，工资账仍player-state4。MarchSet/Pause/Resume为0刻、revision+1；MarchStep至多2刻。确定性有限路由、桥梁碰撞、距离隐私、累计路程费用和预算保留位均进审计。

完整外部校验、历史重演、原子发布、失败回滚、幂等和坏最新档拒绝保留。NPC区域变化通过CampaignRegionsChanged与新observer4验证，旧版本规则不放宽。turnEvents来自真实战斗执行点，日结生命变化单列world-settlement；完成前死亡不补造攻击。5个绘制素材原字节复用，回调代次可取消，宿主返回地图也取消旧播放。未改data-contract做性能优化。

### 定向检查

**8个不同功能成员分次有通过证据，不是一次8/8套件。** JSON含实际argv、父进程耗时/硬限/退出码，TXT保留TAP；证据位于同一目录。

| 检查 | 最终证据 | 结果 |
| --- | --- | --- |
| 路由/费用/位置/NPC纯边界 | map-all-03.json/.txt | 3通过，TAP107.6ms，父187ms |
| 输入/getter/命令预算保留 | input-reserve-03.json/.txt | 1通过，父250ms |
| 跨日攻击/反击/日结归因 | runtime-day-03.json/.txt | 1通过，父45.406s，硬限60s |
| 完成前日结死亡不出手 | runtime-death-02.json/.txt | 1通过，父31.718s，硬限60s |
| owner回滚/幂等/暂停重开/篡改 | service-check-02.json/.txt | 1通过，父14.219s，硬限180s |
| HTTP版本/同源/隐私/旧DTO4工作 | service-check-01.txt中第二成员 | 1通过约9.903s；同次owner失败保留 |
| 语法 | syntax-final.json、syntax-harness-grant.json | 28源文件通过；grant修正后脚本单查通过 |

实际定向命令：

```powershell
node --test tests/simulation/campaign-map.test.mjs
node --test --test-name-pattern="campaign input" tests/simulation/campaign-runtime.test.mjs
node --test --test-name-pattern="cross-day attack" tests/simulation/campaign-runtime.test.mjs
node --test --test-name-pattern="death before completion" tests/simulation/campaign-runtime.test.mjs
node --test tests/simulation/campaign-service.test.mjs
node --test --test-name-pattern="campaign owner rollback" tests/simulation/campaign-service.test.mjs
node --check scripts/verify-d4e11-campaign-jrpg.mjs
```

owner实际覆盖同一世界暂停中正常关闭重开，五投影、正式文件SHA、原回执幂等不变，地图/NPC/回执篡改及坏最新档拒绝。**它不替代页面返村后的最终重开门。** 跨日攻击实际归因为300→150、900→820、820→770三段，第二击击杀无反击；死亡样本没有未发生的攻击。

### 页面及失败历史

主目录 `artifacts/d4e11-acceptance/2026-10-17T03-45-59-812Z`，全新合成世界，没有使用原私档。

1. 前置03-44-36-116Z：赠粮已提交，页面type未定义误报失败；修复局部引用、回执与菜单刷新，原失败保留。
2. 主链：赠粮r1→订单r2→行军r10→暂停r11→改道r12→猎人接触r16（既有赠粮记忆1）→森林r25→开始r26→第一击r32→第二击r38胜利。等待根标记时阶段超时；r38安全发布。
3. 同预算恢复后从r38接到返村订单r39，用户中断期间原600秒总限耗尽；没有重复攻击。
4. 用户一次300秒补验：检查器15秒GET超时而失败，真实Resume仍落盘r40；进度观察改为正式文件revision，同一300秒剩余预算接续至r50商人路遇。尚未到村，road/village断言失败并正常关闭，不是通过。
5. 后续用户“继续”授权独立grant `20261017-user-continue`，开始于2026-10-17T06:39:15.950Z，PID58772，同r50恢复。页面读取r50、点继续后待确认；监督在return-confirmed-r50阶段120秒上限SIGKILL，最新正式档仍r50。页面06:41:46.048Z记录Failed to fetch，最终重开未跑。见[最新观察](../evidence/d4e11-campaign-jrpg-20261017/browser-latest-observation.json)。这是含交互等待的阶段限，无单请求CPU计时，不确认性能根因。
6. 03-53-44-958Z准备误启动目录仅r0、未执行业务，中止证据保留。

检查器历史命令（不是重新执行清单）：

```powershell
node scripts/verify-d4e11-campaign-jrpg.mjs --browser
node scripts/verify-d4e11-campaign-jrpg.mjs --resume artifacts/d4e11-acceptance/2026-10-17T03-45-59-812Z
node scripts/verify-d4e11-campaign-jrpg.mjs --resume artifacts/d4e11-acceptance/2026-10-17T03-45-59-812Z --supplement
node scripts/verify-d4e11-campaign-jrpg.mjs --resume artifacts/d4e11-acceptance/2026-10-17T03-45-59-812Z --continue-supplement
node scripts/verify-d4e11-campaign-jrpg.mjs --resume artifacts/d4e11-acceptance/2026-10-17T03-45-59-812Z --supplement --grant-id 20261017-user-continue
```

其他失败原件同目录保留：缺模块RED；旧observer道路限制后隔离到observer4；跨日内部无mapModel的Non-JSON已修复并有day03通过；service01错误期望野外赠粮成功，改为村内赠粮、路遇查旧记忆，未放宽生产规则；初次组合60秒超时且包装器缺TAP，明确记为输出缺失，不冒充通过。

### 落盘及保护

- 最后service-commit-r50.json SHA256：`674d590c8de5ca5b4e414bc28df9b9e39b2244bde54e7c559de9a82d98f96aaa`。
- tick40/revision50/26命令/27正式文件，玩家road(9,7)、alive、HP920、粮19；订单paused、目标(4,7)，商人actor-3接触tick39；战斗win/wolf0，恰两次攻击。只发布合成回执摘要和散列，不发布完整存档/bundle。
- 原D4E10产品98项、原素材5项、EXT交付13项、原八档及日常世界17文件SHA均不变。控制旧5个未跟踪文件中4个不变，dual-presentation-demo.html被并行工作改变，当前字节完整保留，本任务未写/还原/暂存；控制状态并行原型摘要也保留，提交只暂存本任务状态改动。
- 列举保护端口中最后仅18338/PID61236监听，前后一致；18325/18327/18336实际未监听，未启停。不能把历史PID说成当前运行。
- SIGKILL后先核对PID不存在、锁精确路径和owner，再保存元数据、清理这一自有孤锁。测试锁/测试进程最终为空，18340未启动，日常目录未创建。见[cleanup-final.json](../evidence/d4e11-campaign-jrpg-20261017/cleanup-final.json)与[protection-after.json](../evidence/d4e11-campaign-jrpg-20261017/protection-after.json)。

### 最终裁定

| 维度 | 结果 |
| --- | --- |
| 已覆盖核心/owner/HTTP成员 | 分次通过 |
| 页面返村、正常关闭重开门 | 未完成 |
| D4E11 | 未验收，候选交付，需完成尾链 |
| 外观/声音/长历史性能 | 未验收 |
| D整体 | 进行中 |
| main合并/部署/迁移/正式服务启停 | 均未执行 |

后续AI应先读本报告与索引，保护同一r50及全部旧失败；在新的有界授权下仅补尾链，不把旧owner检查或提交成功替代页面验收。
