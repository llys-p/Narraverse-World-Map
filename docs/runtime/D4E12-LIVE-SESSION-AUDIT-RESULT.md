# D4E12 运行中前缀审计：实现与限定验收

2026-10-18（Asia/Shanghai）。用户明确批准补充合同后实施。**本轮合成短世界功能通过，行动确认有明确收益；长档冷开和持续日常体验仍未验收。**

## 代码与环境

- 候选：`1b6211c67dc1bf4287a327648d94520233166846`，分支 `codex/world-runtime-live-session-audit`，树 `D:/Narraverse-World-Map-live-session-audit`。
- 对照：`669256348d3c5f07e47cd0f17cddf1da3c4700ff`，其生产为 `d22bc5d2462d4f5ccdfbad237534c3b9f3ae698d`；原执行树保持干净。
- Windows / Node.js v24.14.0；Intel i5-13500HX，14核20逻辑处理器。所有世界为seed42新建合成数据，无私有长档。
- 同机按A/B/B/A顺序、每版2次；每次新进程、新目录、随机端口，`runtimeWorker:false`测量完整实际HTTP确认；最终页面另测默认worker路径。五个生产文件分别以Git完整blob回装成基准，脚本记录其SHA。

## 实测数据（毫秒）

| 次序 | 版本 | 首开 墙钟/CPU | 八次确认合计 墙钟/CPU | 正常关闭 墙钟/CPU | 完整重开 墙钟/CPU |
| --- | --- | ---: | ---: | ---: | ---: |
| b3 | baseline | 336.218 / 422.000 | 4326.026 / 4359.000 | 4.072 / 0.000 | 5229.229 / 4875.000 |
| c3 | candidate | 342.643 / 548.000 | 1995.922 / 2109.000 | 2.538 / 0.000 | 5523.493 / 5359.000 |
| c4 | candidate | 350.722 / 453.000 | 1775.314 / 2031.000 | 2.857 / 15.000 | 5118.131 / 5000.000 |
| b4 | baseline | 314.279 / 437.000 | 4323.165 / 4484.000 | 3.135 / 0.000 | 4869.596 / 4704.000 |

八次行动合计平均墙钟改善 **56.40%**，CPU改善 **53.18%**。
同版两轮范围与首开/关闭/重开平均值、全部逐次原始数据见 `summary.json` 和 `http-*.json`。冷开仍完整重演，毫秒差异不追查、不宣称冷开性能收益；不同历史优化轮次百分比不累计。

## 核验结果

- 最终定向成员分批覆盖12项：派生差分/资格2项、真实owner6项、真实日界和地图战斗2项、既有service完整审计/worker2项。不是一次12项同时运行。最终8项新core/owner为9.768秒，日界/地图战斗2项为35.810秒；既有2项在此前同生产版本9项批次通过。
- 真实143→145历史跨日结算、RNG及整个bundle/receipt与原完整oracle一致；地图暂停/续行/路遇和两回合胜利逐步完整差分。没有伪造可加载的143tick起点。
- 并发同revision仅一笔成功；旧head、跨owner、重复writer、冻结/JSON副本及任意candidate/trusted输入拒绝；关闭后资格失效，重复关闭不移除新writer登记；getter零执行、Proxy脱离后的版本漂移拒绝。
- 失败回滚、同ID重试/冲突、输出与输入别名隔离、正常关闭重开一致通过。注入link已成功但返回错误：未提前发布成功/新head，阻止继续分叉；完整重开后同ID重试没有第二次效果，然后可继续提交。
- raw JSON的新增事实、回执、RNG及调度篡改由原公开完整审计拒绝。公开validateServiceCommit先复制输入，不能继承内存派生证明。
- 全部9份正式文件逐字节SHA相同；最终r16 SHA `4d6c6b2f3fbe33a7b1639fcb4cb00ec78a20d334a3a1382c9d37550ed97a6f9a`，8个回执规范签名 `aca4cd5210750995837d963dd1b15d0df26b84cc06718ae8a69eeab1425be4a2`，五投影 `9e6cddddfd6bbc2a185223c60e36cfdd8b09b481f667342b90d0ca6e1dafa1e4`。
- 最终隔离页面：赠粮→行军暂停改道/路遇→两回合胜利→返村→正常关闭，25.121秒，无浏览器错误。`--ui-only`明确未在这一页面链测工作交易休息、独立全重演或重开；重开/全审另由HTTP与core覆盖，无视觉或听感结论。
- 首次差分测试1/2失败原样保留：测试DTO漏写recipientId，修正测试输入后通过；未降低生产校验。独立源码复核发现事件数据gate和重复writer/stale head缺口，均已修复后通过最终测试，复核未见剩余阻断。

## 审计与提交边界

- core私有数学证明只能由已审冻结父bundle按固定规则内部计算：保持原事件数据/因果/receipt检查、完整snapshot检查、历史前缀只追加、身份/时间、并将完整本次canonical转移复算比对。数学证明不代表已写盘。
- owner私有writer只接受分离后的DTO，绑定realpath唯一活动实例及当前完整磁盘head；两次写前核对当前revision/内容/锁。所有投影与session先准备，原子发布成功后才登记完整service证明、切换head并返回成功。
- 外部首次加载、公开完整验证与原完整转移oracle保留；格式11/DTO5、128命令/129文件、每格1tick/每片≤2ticks、确认后500ms续跑、失败回滚与时间规则不变。

## 运行命令与硬限

```powershell
python scripts/run-d4e12-check.py live-final-core-owner-r2 180 node --test --test-concurrency=1 tests/simulation/campaign-live-derivation.test.mjs tests/simulation/campaign-live-owner.test.mjs
python scripts/run-d4e12-check.py live-boundaries-r1 180 node --test --test-concurrency=1 tests/simulation/campaign-live-world-boundaries.test.mjs
python scripts/run-d4e12-check.py live-final-core-owner 180 node --test --test-concurrency=1 tests/simulation/campaign-live-derivation.test.mjs tests/simulation/campaign-live-owner.test.mjs tests/simulation/demo-service-certification.test.mjs tests/simulation/demo-worker.test.mjs
```
性能四轮实际参数分别为b3/baseline、c3/candidate、c4/candidate、b4/baseline，形式如下；复用脚本请使用新的label和目录，拒绝覆盖旧证据。
```powershell
python scripts/run-d4e12-check.py live-http-b3 180 --phase-file artifacts/d4e12/live-http-b3-world/phase.json node scripts/measure-d4e12-live-session.mjs baseline artifacts/d4e12/live-http-b3-world
python scripts/run-d4e12-check.py live-ui-final 600 --phase-file artifacts/d4e12/live-ui-final-world/phase.json node scripts/verify-d4e12-demo.mjs artifacts/d4e12/live-ui-final-world --ui-only
```
每个业务/定向进程180秒外部硬限；页面总600秒/每阶段120秒，退出确认5秒、Windows Job保护。最终有效测试/测量/页面链均退出0，未超时/未有退出不明；首次测试DTO缺字段的失败退出1原样保留。CPU比较来自HTTP进程的process.cpuUsage；node --test监督父进程CPU不包含其测试子进程，不能拿该字段当功能测试CPU总量。

## 保护、未验范围与结论

- 原8档SHA、16绘制依赖、旧88源码文件、107既有日常文件、并行原型和脏摘要保持。仅上传合成指标/回执/哈希，不上传原始或日常存档。
- 18338/18340/18342开工时已无监听，本轮未启停。日常入口未切换，原长档74.351秒只是旧样本，未复跑。最终无自有运行进程/测试锁另见关闭保护证据。
- 本轮建议保留运行中优化，足以继续真实短闭环开发；不能宣称长档冷开、128命令极限、多人并发或无限持续游玩合格。冷开仍是剩余明确瓶颈，不擅自增设可信快照、裁剪历史或弱化校验。
- 不合main、不部署、不迁移、不调用外部模型。D4E12性能整体仍需修正，Stage D保持进行中。

## Reference Review

沿用已有OpenTTD/Mindustry权威模拟/表现分离研究，未复制游戏源码。采用本项目私有不可变前缀的归纳核验；保留旧完整oracle和持久发布，拒绝公开skip/trusted开关、任意候选授证及提前成功。

证据目录：[原始数据](../evidence/d4e12-live-session-audit-20261018/summary.json)。
