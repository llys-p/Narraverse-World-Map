# D4E12：模拟执行与入口响应分离

2026-10-17（Asia/Shanghai）。用户要求自主阅读开源游戏并解决行动等待。线程隔离 `216cd124cb992bc593007ebdec2c154ad046daaa`、固定tick优化 `7e6806a4ac0c802fa9322cdc58c95b37d9010e79`、单条结构证明 `1e5e16cfab302b56da89e93383b6eefdb13f3213` 均保留。最新初始模板优化源码 `d22bc5d2462d4f5ccdfbad237534c3b9f3ae698d`，本片比较基准 `a42957b28bb7482fa8da5f2184abd22a428d4793`。

**最新已获批的运行中前缀审计见[限定验收报告](D4E12-LIVE-SESSION-AUDIT-RESULT.md)，新分支codex/world-runtime-live-session-audit；旧版以下性能记录仅代表当时源码。已隔离HTTP事件循环阻塞；最新短世界行动确认与完整重开审计相对上一已采纳版再改善9.20%/18.81%，长档冷开与持续流畅体验尚未解决，性能整体仍不判合格。** 不把不同轮次的百分比相加，不提前确认行动。23:35本轮开工只读核验发现18338/18340/18342已无监听，原PID61236/63160/14520已退出；不是本轮启停，未重启或操作日常存档，新代码未投入日常入口。

## 2026-10-18 12:08 跟进：撤回actor模板，提交审计组织方式草案

基准 `b6aa958e5647937be77244abd7bb021e6c491bf7`。试验仅对actor-config-v5复用按完整内容核验的初始市场模板，输入和输出分离、复制后重验字段/版本；实时角色与账本校验及完整历史重演保持。四轮同seed42/同ID/HTTP 8×AdvanceTime(2)至r16，新进程/目录/随机端口、ABBA各版2次、180秒总限/阶段120秒，均退出0。

| 轮次 | 行动墙钟/CPU ms | 完整重开墙钟/CPU ms | 初始市场构造数 |
| --- | ---: | ---: | ---: |
| A1原版 | 2006.818 / 2031 | 2004.682 / 2015 | 4440 |
| B1候选 | 1907.686 / 1938 | 1932.058 / 1845 | 1 |
| B2候选 | 1900.876 / 1935 | 2082.667 / 2031 | 1 |
| A2原版 | 1804.076 / 1891 | 1970.500 / 1985 | 4440 |

行动墙钟中位1905.447→1904.281ms（0.06%），CPU1961→1936.5ms（1.25%）；重开1987.591→2007.363ms（反慢0.99%），CPU2000→1938ms（3.10%）。构造次数下降不能代表真实收益。**候选、活动工具和未运行的3项补充测试全部撤回；生产保持d22bc5d，不宣称新修复。** 四轮9档SHA/8回执/五投影/重开/原ID重试一致，无新档或隔离锁；不追加核心或页面运行，不把未运行测试计PASS。

[原始result/process](../evidence/d4e12-actor-template-trial-20261018/runs.json)、[统计/决策](../evidence/d4e12-actor-template-trial-20261018/summary.json)、[弃用补丁](../evidence/d4e12-actor-template-trial-20261018/candidate.patch)、[保护](../evidence/d4e12-actor-template-trial-20261018/protection.json)。测量器和测试仅保留`.txt`审阅副本，需在独立树应用补丁并恢复原路径后复现，非活动代码。完整命令见runs.json：`python scripts/run-d4e12-check.py actor-template-k 180 --phase-file artifacts/d4e12/actor-template-k/phase.json node scripts/measure-d4e12-actor-template.mjs variant artifacts/d4e12/actor-template-k`，k/variant依次a1/baseline、b1/candidate、b2/candidate、a2/baseline。

进一步核对的合同边界：[原D4E12任务书](../../tasks/D4E12-DEMO-RUNTIME-TASK.md)实现约束第4条仍要求每次新世界转移执行原完整校验；[原接入报告](D4E12-DEMO-RUNTIME-RESULT.md)明确新提交保持完整world/history核验。源码 `executeAuditedCampaignIntent→createAuditedBundle→validateBundle→hooksValidateHistory` 仍走该路径。这是每次行动仍须承担历史相关工作的一项明确来源；本次构造微优化不能消除它，不将此解释为所有剩余耗时均来自重演。

已准备[运行中前缀审计补充合同草案](../../tasks/D4E12-LIVE-SESSION-AUDIT-AMENDMENT-DRAFT.md)，并经独立只读风险审查。拟仅对当前owner的已耐久提交、深冻结、全commit认证前缀作归纳转移核验，外部JSON/冷加载/公开独立审计保留原全历史重演；whole-commit证明、当前head隔离、输入分离和持久成功先于发布必须具备。**该草案需要用户明确批准合同变化，尚未批准、未实施、未派发。** 不把“继续”当作允许删除完整重演，也不承诺此草案能加速冷开。若保留原合同，就仅继续等价实现优化，不能承诺消除每步的历史增长成本。

本轮原8档/16依赖/旧88源码/107既有日常文件、中控并行原型和脏摘要保持。三个旧体验端口开工与结束仍无监听，启停动作0，未操作存档；测试进程/隔离锁无残留，无main/部署/迁移/存档上传/DSH外部模型。D4E12及D阶段均未收口；新增审计方式在用户决定前不执行，已有功能/性能证据仍各按原范围有效。

## 23:41 继续推进：复用 campaign v8 纯配置初始模板

**本片功能限定PASS，最终短世界行动/重开样本改善成立；整体性能仍需修正。** 唯一生产修改为 `runtime/core/memory-runtime.mjs` 私有 `validateConfig`，另新增定向测试与HTTP测量工具。

### 范围和校验边界

不断变化的world无法频繁命中整份结构证明，但其 `memory-config-v8` 长期不变。原路径在每次模型结构校验时，都会经 `createSocietyWorld` 及其下层重新构造同一份初始世界。新实现只对v8先复制配置、再次核验复制后的版本，然后按**完整规范配置字符串**匹配一条私有初始模板；配置不同则执行全部原配置规则和构造器。每次存取均复制，调用方修改返回的资源、角色或配置不会污染模板。

只复用纯配置→初始模板的确定性结果；不保存运行中world、RNG、tick、事件或命令回执结论，不缓存历史重演。实时 `validateMemoryWorld`、完整配置指纹/账本/身份检查、公开完整审计、从零历史重演及事实/receipt对比仍执行。耐久发布、失败回滚、幂等、世界时间与存档版本不变；v6/v7及其他旧配置保留原路径。成功后才保存，key上限65536、模板规范表示上限262144个UTF-16代码单元；这限制的是规范表示长度，不是精确JS堆字节。超过长度仍执行校验/构造，但不保留该模板。

独立只读复核认为普通JSON的纯构造、完整内容键和引用隔离没有发现新增问题，并指出复制后版本需再核验。新增Proxy版本漂移反例先RED（原候选没有抛异常），随即补上 `config.version==='memory-config-v8'` 检查；最终16项定向通过。旧路径本来也存在Proxy多次读取漂移，不能据此宣称曾有完整公开审计绕过；也不承诺拒绝所有Proxy或不执行trap。直接构造器收到多个同时非法字段时，v8提前复制可能改变首个报错的优先级，非法数据仍拒绝；服务完整JSON预检保持。该边界如实记录，不称所有直接构造器错误顺序完全相同。

### 最终源码同机ABBA（独立于加固前样本）

Windows / Node v24.14.0；seed42、相同commandId、真实HTTP 8×`AdvanceTime(2)`、终点r16/tick16。每轮新进程/目录/随机端口，两侧同为 `runtimeWorker:false`；A只通过加载钩子读取固定基准的memory模块，B读取最终候选，记录原模块SHA。每进程180秒/阶段120秒硬限，四轮退出0，无watchdog介入。机器负载未固定，因此只比较本轮交替对照，不与此前报告的绝对秒数跨轮比较。

| 最终轮次 | 新世界打开墙钟/CPU ms | 8条行动墙钟/CPU ms | 关闭墙钟/CPU ms | 完整重开墙钟/CPU ms |
| --- | ---: | ---: | ---: | ---: |
| A1 | 234.318 / 328 | 3525.185 / 3656 | 2.145 / 0 | 3809.604 / 3937 |
| B1 | 242.883 / 344 | 3314.928 / 3422 | 2.158 / 0 | 3087.520 / 3140 |
| B2 | 208.436 / 312 | 2954.257 / 3203 | 1.979 / 0 | 3119.355 / 3266 |
| A2 | 225.943 / 313 | 3379.440 / 3765 | 2.345 / 0 | 3835.153 / 3860 |

各版2次。行动墙钟中位3452.313→3134.592ms（**9.20%**），CPU3710.5→3312.5ms（**10.73%**）；完整重开3822.379→3103.438ms（**18.81%**），CPU3898.5→3203ms（**17.84%**）。行动范围A3379–3525/B2954–3315ms；重开A3810–3835/B3088–3119ms。新世界打开与关闭没有确认收益；两次样本不作置信区间，更不能代表私有长档或持续游玩性能。

四轮9份正式文件SHA、8回执和五投影完全一致，完整重开逐项一致，原ID重试回原回执且不新增档，前后9文件SHA保持。终点r16 SHA `4d6c6b2f3fbe33a7b1639fcb4cb00ec78a20d334a3a1382c9d37550ed97a6f9a`，回执`aca4cd5210750995837d963dd1b15d0df26b84cc06718ae8a69eeab1425be4a2`，五投影`9e6cddddfd6bbc2a185223c60e36cfdd8b09b481f667342b90d0ca6e1dafa1e4`。

加固前也完成一次ABBA，各版2次，数据完整保留且**不混入最终统计**：行动中位3810→3143ms；基准重开样本3748/6418ms出现明显波动，未据此确认冷开收益，也未追查这类普通波动。之所以重新测最终ABBA，是Proxy边界修复改变了生产源码，而不是为了刷出更好成绩。

### 功能证据与分次覆盖

- `initial-template-core-01`：加固前15/15 PASS，墙钟7809.028ms/CPU8468.75ms。
- `initial-template-proxy-red-01`：新增版本漂移反例1/1 FAIL、退出1（预期的RED），保留原始错误，不计PASS。
- `initial-template-core-02`：**最终源码16/16 PASS**，墙钟7045.135ms/CPU7828.125ms。含v6/v7及合法变化v8与冻结基准oracle对照、返回引用隔离、配置变更重验、getter0、复制后版本漂移拒绝；同时覆盖固定tick/日结RNG、结构证明防投毒、暖证明下历史事实伪造拒绝、全服务重演、持久发布失败回滚、worker恢复与幂等。
- `initial-template-ui-01`：在最终Proxy边界加固**之前**完成实际Edge新隔离世界26命令，赠粮→行军暂停改道→NPC路遇→两回合胜利→返村→正常关闭PASS；墙钟42696.028ms/Node CPU30671.875ms（不含浏览器CPU），终态r48/tick37、HP920/私粮19/钱包0、村庄(4,7)，errors0。最终版本检查没有改变普通v8 JSON行为，但**没有重跑最终源码页面链，不把此前页面运行冒称最终源码复验**；最终16项及完整HTTP ABBA是本轮最终源码的运行证据。页面 `--ui-only` 本来也不含工作交易休息/独立全档审计/重开；后两项由核心和ABBA分次覆盖，无视觉检查。

命令（加固前prefix为 `initial-template`，最终为 `initial-template-final`；k/variant依次a1/baseline、b1/candidate、b2/candidate、a2/baseline，完整展开命令见原始JSON）：

```powershell
python scripts/run-d4e12-check.py prefix-k 180 --phase-file artifacts/d4e12/prefix-k/phase.json node scripts/measure-d4e12-initial-template.mjs variant artifacts/d4e12/prefix-k
python scripts/run-d4e12-check.py initial-template-proxy-red-01 180 node --test --test-name-pattern "detached campaign configuration" tests/simulation/campaign-initial-template.test.mjs
python scripts/run-d4e12-check.py initial-template-core-02 180 node --test --test-isolation=none tests/simulation/campaign-initial-template.test.mjs tests/simulation/campaign-canonical-tick.test.mjs tests/simulation/campaign-structure-proof.test.mjs tests/simulation/demo-service-certification.test.mjs tests/simulation/demo-worker.test.mjs
python scripts/run-d4e12-check.py initial-template-ui-01 600 --phase-file artifacts/d4e12/initial-template-ui-01/phase.json node scripts/verify-d4e12-demo.mjs artifacts/d4e12/initial-template-ui-01 --ui-only
```

[最终原始四轮](../evidence/d4e12-initial-template-20261017/final-runs.json)、[统计](../evidence/d4e12-initial-template-20261017/summary.json)、[最终16项TAP](../evidence/d4e12-initial-template-20261017/initial-template-core-02.txt)、[RED反例](../evidence/d4e12-initial-template-20261017/initial-template-proxy-red-01.txt)、[加固前页面](../evidence/d4e12-initial-template-20261017/initial-template-ui-01-result.json)、[保护](../evidence/d4e12-initial-template-20261017/protection.json)。同目录保留加固前ABBA和15项结果；没有存档上传。

开工前和结束时三个旧端口均无监听，旧PID已退出，启停动作0；不将23:35外部现场变化写成由本轮代码导致，也不猜退出原因。原8档、16依赖、旧88源码、107份既有日常文件、中控并行原型和脏摘要均字节保持，测试进程/隔离锁无残留；未main/部署/迁移/DSH外部模型。较长档74.351秒旧样本未复跑，历史增长成本仍在，性能整体未达标。Projects仍In Progress/需修正，继续有界推进。

## 20:23 自动跟进：多条结构证明未改善冷开，已撤回

基准 `8fbfc7ef621bb0f4c8d73830ce7ba73e8f330c3e`。试验把单条结构证明换为最多8条LRU，所有key合计仍限制262144个UTF-16代码单元；描述符检查、独立复制、完整world+tick精确内容匹配以及历史重演边界保持。每轮均新进程/目录/随机端口，seed42、同ID、HTTP 8×AdvanceTime(2)至r16，ABBA各版2次、180秒总限/阶段120秒。只在两侧同一模块位置计数实际结构校验次数，不修改规则或计时边界。

| 轮次 | 行动墙钟/CPU ms | 完整重开墙钟/CPU ms | 结构谓词实际校验数 |
| --- | ---: | ---: | ---: |
| A1单条 | 2081.605 / 2344 | 2168.645 / 2109 | 211 |
| B1八条 | 1973.391 / 2078 | 2147.925 / 2251 | 199 |
| B2八条 | 2006.062 / 2031 | 2199.739 / 2125 | 199 |
| A2单条 | 2178.233 / 2359 | 2208.788 / 2234 | 211 |

行动墙钟中位2129.919→1989.727ms（6.58%），CPU2351.5→2054.5ms（12.63%）；完整重开2188.717→2173.832ms（0.68%），CPU2171.5→2188ms（反增0.76%）。只多复用了12次结构证明，**没有证实本轮目标——冷开加速**。行动样本有小幅改善，如实保留；不足以为此保留LRU状态和淘汰逻辑，不追查十余ms重开差异。候选生产改动和活动脚本全部撤回，生产保持 `1e5e16c` 的单条实现，不能宣称新性能修复。

四轮均退出0、无watchdog介入，9份正式文件SHA、8回执、五投影、完整重开及原ID重试一致，无新增档或残留锁。既然候选不采纳，没有运行额外核心或页面链；上一已验生产的9项核心、后增2项反例及页面结果仅复用历史证据，不当成本次复验。

[原始四轮result/process](../evidence/d4e12-structure-lru-trial-20261017/runs.json)、[统计与决策](../evidence/d4e12-structure-lru-trial-20261017/summary.json)、[弃用补丁](../evidence/d4e12-structure-lru-trial-20261017/candidate.patch)、[保护核验](../evidence/d4e12-structure-lru-trial-20261017/protection.json)。测量器保留`.txt`审阅副本，需在独立树应用候选补丁并恢复原脚本路径才复现；不是当前活动工具。完整展开命令保留在runs.json：`python scripts/run-d4e12-check.py structure-lru-k 180 --phase-file artifacts/d4e12/structure-lru-k/phase.json node scripts/measure-d4e12-structure-lru.mjs variant artifacts/d4e12/structure-lru-k`，k/variant为a1/baseline、b1/candidate、b2/candidate、a2/baseline。

原8档/16依赖/旧88源码/107既有日常文件、中控并行原型及脏摘要保持，18338/PID61236、18340/PID63160、18342/PID14520未启停或更新，无测试进程/隔离锁；没有main/部署/迁移/存档上传/DSH外部模型。剩余成本在不断变化的历史状态及完整重演本身，不能靠扩大结构证明条数解决；后续不再微调LRU容量，不重跑私有长档。性能整体仍需修正。

## 20:13 继续推进：按完整内容复用单条结构证明

**本片功能限定PASS，短世界性能改善成立；整体性能仍需修正。** 执行树/分支不变。唯一生产修改为 `runtime/core/scene-campaign-runtime.mjs` 的 `validateCampaignWorldState`；新增定向测试与独立HTTP A/B工具。

### 原因与证明边界

相同世界状态经 `checkBudgets`、快照结构检查、事件结构检查及重演入口时，会反复校验整套嵌套模型和配置。新实现每次仍完整检查输入描述符、精确参数字段和tick，再复制为独立JSON数据，计算包含**完整world与options.tick**的规范字符串；只有与私有的一条已成功结构校验内容逐字符完全相同，才复用该结构谓词的证明。不同数据或tick重走原三项结构校验；没有哈希碰撞、可变对象identity信任或调用方跳过参数。

该缓存只保留一条规范字符串和独立结果，key最多262144个UTF-16代码单元（约512KiB上限，不是262144个UTF-8字节）；更大内容照常完整验证但不写缓存。结果写入及每次返回均复制，调用方改返回值不能污染证明。只复用纯结构谓词，**没有缓存任何历史重演结果、事件/命令回执结论或磁盘完整性结论**。公开 `validateBundle` / `validateServiceCommit` 及每次从零历史重演仍调用；世界结构相同也不能使伪造历史事实通过。没有改耐久发布、失败回滚、幂等、时间或worker机制。

独立只读复核未发现新增正确性/审计漏洞；代码检查了完整key、tick隔离、负零/空原型归一化和结果投毒。边界必须明确：反射/复制仍可能执行Proxy trap，不承诺拒绝所有Proxy；这里证明最终独立数据的结构合法。常规getter在复制前拒绝且测试执行次数0。完整重演的fresh-world、逐tick、事实和receipt比较保持原代码。复核是静态证据，不能替代下面的运行门。

### 同机真实HTTP ABBA

Windows / Node v24.14.0，固定seed42及相同commandId，8条 `AdvanceTime(2)` 至r16/tick16。每轮新隔离目录/随机端口/独立进程；都为 `runtimeWorker:false`，只比较同一放置下的计算。A用加载钩子读取上述固定基准的campaign模块，B用候选；记录原模块SHA，未插入规则、判定或缓存命中计数。每进程180秒/阶段120秒硬限，四轮退出0、无watchdog介入。

| 轮次 | 新世界打开墙钟/CPU ms | 8条行动墙钟/CPU ms | 关闭墙钟/CPU ms | 完整重开墙钟/CPU ms |
| --- | ---: | ---: | ---: | ---: |
| A1 | 221.185 / 344 | 2624.652 / 2765 | 1.491 / 0 | 2891.197 / 2907 |
| B1 | 133.011 / 156 | 2058.626 / 1969 | 1.288 / 0 | 2175.776 / 2312 |
| B2 | 129.489 / 202 | 2033.616 / 2033 | 1.327 / 0 | 2172.325 / 2124 |
| A2 | 223.033 / 266 | 2654.725 / 2812 | 1.387 / 0 | 2980.360 / 2938 |

各版2次。行动墙钟中位2639.689→2046.121ms（**22.49%**），CPU2788.5→2001ms（**28.24%**）；完整重开2935.778→2174.051ms（**25.95%**），CPU2922.5→2218ms（24.11%）。行动墙钟范围A2625–2655/B2034–2059ms，重开A2891–2980/B2172–2176ms；样本量小，不作置信区间或长史外推。关闭近1ms，不追查波动；新世界打开样本有下降，也不能称长档冷开已解决。

四轮9份正式文件逐文件SHA一致、8回执和五投影规范签名完全相同，完整重开逐项一致；原ID重试回原回执、无新档，关闭重开前后9文件SHA均保持。终点r16 SHA `4d6c6b2f3fbe33a7b1639fcb4cb00ec78a20d334a3a1382c9d37550ed97a6f9a`，回执`aca4cd5210750995837d963dd1b15d0df26b84cc06718ae8a69eeab1425be4a2`，五投影`9e6cddddfd6bbc2a185223c60e36cfdd8b09b481f667342b90d0ca6e1dafa1e4`。

### 定向门与真实页面

- `structure-proof-core-01`：9/9 PASS，墙钟4592.941ms/CPU5265.625ms；包含新3项内容/tick变化重验、返回值防投毒、零getter与伪trusted字段拒绝，以及固定tick等价/日结RNG、通用自定义规则拒绝、全服务重演/篡改拒绝/发布失败回滚/worker恢复/幂等。
- 后增的两项反例单独运行 `structure-proof-adversarial-01`：2/2 PASS，墙钟426.292ms/CPU78.125ms；Proxy提供不同数据不能复用先前证明；**结构证明已命中且world/tick未变时，仅把合法历史报价10篡改为11，公开完整审计仍拒绝**。不是一次11/11，不重复已绿成员。
- `structure-proof-ui-01`：实际Edge隔离新世界26命令PASS，赠粮→行军暂停改道→NPC路遇→两回合胜利→返村→正常关闭；墙钟23425.970ms/Node CPU14390.625ms（不含浏览器CPU），终态r48/tick37、HP920/私粮19/钱包0、村庄(4,7)，errors0。该 `--ui-only` 链未包含工作交易休息、独立重演或重开；后两项由ABBA与核心分次覆盖，不声称单次全链全绿。无视觉检查，不把跨轮页面时长作为性能对照。

命令（ABBA的k/variant依次a1/baseline、b1/candidate、b2/candidate、a2/baseline；完整展开命令见原始process.json）：

```powershell
python scripts/run-d4e12-check.py structure-proof-k 180 --phase-file artifacts/d4e12/structure-proof-k/phase.json node scripts/measure-d4e12-structure-proof.mjs variant artifacts/d4e12/structure-proof-k
python scripts/run-d4e12-check.py structure-proof-core-01 180 node --test --test-isolation=none tests/simulation/campaign-structure-proof.test.mjs tests/simulation/campaign-canonical-tick.test.mjs tests/simulation/demo-service-certification.test.mjs tests/simulation/demo-worker.test.mjs
python scripts/run-d4e12-check.py structure-proof-adversarial-01 180 node --test --test-name-pattern "Proxy|warmed structural" tests/simulation/campaign-structure-proof.test.mjs
python scripts/run-d4e12-check.py structure-proof-ui-01 600 --phase-file artifacts/d4e12/structure-proof-ui-01/phase.json node scripts/verify-d4e12-demo.mjs artifacts/d4e12/structure-proof-ui-01 --ui-only
```

[原始数据与中位统计](../evidence/d4e12-structure-proof-20261017/summary.json)、[核心门](../evidence/d4e12-structure-proof-20261017/structure-proof-core-01.txt)、[后增反例](../evidence/d4e12-structure-proof-20261017/structure-proof-adversarial-01.txt)、[页面结果](../evidence/d4e12-structure-proof-20261017/structure-proof-ui-01-result.json)、[保护证据](../evidence/d4e12-structure-proof-20261017/protection.json)。同目录保留四轮result/process原始JSON，不上传存档。

本轮前两项试验也保留失败选择，不混进已采纳收益：

| 已撤回候选 | 行动墙钟/CPU中位变化 | 重开墙钟/CPU中位变化 | 结果 |
| --- | --- | --- | --- |
| 空系统循环省envelope | 2823.417→2656.985ms / 2851.5→2766ms | 3007.584→3202.573ms / 3007.5→3172.5ms | envelope384→38，但没有一致端到端收益；撤回 |
| 有限数String编码 | 2714.713→2577.596ms / 2805→2773ms | 2939.555→2799.868ms / 2937→2836.5ms | 幅度小、CPU确认不足；撤回 |

两试验各自ABBA各版2次，9档/回执/五投影/重开一致、退出0。新增测试仅撰写未运行，不计通过；源码/活动工具/新增测试均撤回，归档[空循环补丁与数据](../evidence/d4e12-idle-envelope-trial-20261017/summary.json)及[数值编码补丁与数据](../evidence/d4e12-number-spelling-trial-20261017/summary.json)。没有追查小幅波动或重新运行私有长档。

原8档/16依赖/旧88源码/107既有日常文件与中控并行原型、脏摘要保持；18338/PID61236、18340/PID63160、18342/PID14520保持、未更新，测试进程/隔离锁无残留。无main/部署/迁移/存档上传/DSH外部模型。剩余瓶颈仍是历史增长下的完整重演及嵌套模型遍历；此单条结构证明不能消除不同历史状态的全部成本。较长档74.351秒旧样本本次未复跑，不能作为候选耗时或宣布已解决。Projects保持In Progress/需修正，继续按有界证据推进。

## 19:52 自动跟进：编码断言写法试验未采纳

基准 `59adfe9871a9cee772155725dfd98a942552b263`。按前次采样中的编码/断言Self热点，仅把私有 `encodeCanonical` 的4处 `requireCondition` 改成条件失败时抛相同 `fault`，条件、错误码/消息、遍历、结构/访问器检查均未取消；没有改公开函数、审计、重演、发布或时间规则。

同一seed42合成短世界、HTTP 8×AdvanceTime(2)、r16/9份输出，新进程/目录/随机端口，ABBA各版2次；每进程180秒/阶段120秒硬限，全部退出0，无watchdog介入。

| 轮次 | 行动墙钟/CPU ms | 完整重开墙钟/CPU ms |
| --- | ---: | ---: |
| A1原版 | 2609.104 / 2579 | 2813.323 / 2672 |
| B1候选 | 2562.900 / 2609 | 2834.978 / 2970 |
| B2候选 | 2594.582 / 2734 | 2842.251 / 2702 |
| A2原版 | 2618.634 / 2578 | 2864.873 / 2844 |

行动墙钟中位2613.869→2578.741ms（1.34%），CPU2578.5→2671.5ms（反增3.61%）；重开2839.098→2838.614ms（0.02%），CPU2758→2836ms（反增2.83%）。**没有可靠收益，候选与活动测量器已全部撤回，生产仍为7e6806a；不宣称新修复，不再追查这些小幅波动。** 四轮9档SHA、8回执、五投影与完整重开一致；原ID重试回原回执且不新增档。没有运行新增核心/页面测试，不把HTTP样本等同全面功能验收。

[原始数据和统计](../evidence/d4e12-encode-guards-trial-20261017/summary.json)、[弃用补丁](../evidence/d4e12-encode-guards-trial-20261017/candidate.patch)、[保护核验](../evidence/d4e12-encode-guards-trial-20261017/protection.json)。同目录包含四轮result/process原始JSON与测量器`.txt`审阅副本；不含存档。复现命令的完整参数见process.json：`python scripts/run-d4e12-check.py encode-guards-k 180 --phase-file artifacts/d4e12/encode-guards-k/phase.json node scripts/measure-d4e12-encode-guards.mjs variant artifacts/d4e12/encode-guards-k`，k/variant依次a1/baseline、b1/candidate、b2/candidate、a2/baseline；活动脚本已删除，需在独立树应用补丁、恢复原脚本路径后运行。

原8档/16依赖/旧88源码/107既有日常文件与中控并行原型摘要保持；三个既有服务PID不变，无测试进程/隔离锁，未main/部署/迁移/外部模型。后续回到审计调用链重复工作定位，不再尝试断言写法微优化。前一轮控制收口复核的源码“脏状态”确认仅为本任务回写换行造成的stat差异，源码与Git blob一致，现已恢复干净；无遗留生产diff。性能整体仍需修正，自动跟进继续。

## 18:23 自动跟进：内部副本复用试验未采纳

基准 `386602e7ccba295247e5e13f39e0499bf1e3372c`。先在同一合成短世界采样，编码/断言仍是主要Self热点；`cloneData`约694ms、描述符递归检查约428ms（诊断采样总时长约6.1秒，含Profiler/计数插桩，不能当无采样耗时）。试验只在上一轮私有campaign入口中复用刚由 `cloneBundle` 完整检查并深拷贝的内部副本，省去紧随其后的重复preflight和snapshot拷贝；外部数据检查、结构验证、通用自定义系统比较与完整历史重演均未改变。

按相同seed42/8条HTTP `AdvanceTime(2)`/r16、独立新目录及进程、相同主线程放置，执行ABBA各版2次；每进程180秒/阶段120秒硬限，四轮退出0，无watchdog介入。

| 轮次 | 行动墙钟/CPU ms | 完整重开墙钟/CPU ms |
| --- | ---: | ---: |
| A1原版 | 2617.665 / 2734 | 2925.812 / 2970 |
| B1候选 | 2590.523 / 2750 | 2776.743 / 2828 |
| B2候选 | 2582.574 / 2782 | 2912.543 / 2906 |
| A2原版 | 2622.581 / 2656 | 2867.401 / 2891 |

行动墙钟中位2620.123→2586.549ms（1.28%），CPU2695→2766ms（反增2.63%）；重开2896.607→2844.643ms（1.79%），CPU2930.5→2867ms（2.17%）。**收益不足以保留候选，不追查这些小幅差异。候选生产改动、补充测试及活动测量脚本已全部撤回；生产保持7e6806a，不宣称新修复。**

四轮9文件SHA、8回执和五投影完全一致，全部session计数192、无proof；关闭后完整审计重开一致、原ID重试无新增档，隔离锁为0。新增返回值别名测试仅撰写并归档，**未执行，不计PASS**；既然候选被弃用，没有复跑核心测试或页面链。上一轮6/6及实际页面证据只适用于保持不变的生产源码，不混称本次复验。

[原始数据/中位统计](../evidence/d4e12-tick-copy-trial-20261017/summary.json)、[采样Self摘要](../evidence/d4e12-tick-copy-trial-20261017/profile-summary.json)、[弃用补丁](../evidence/d4e12-tick-copy-trial-20261017/candidate.patch)、[保护核验](../evidence/d4e12-tick-copy-trial-20261017/protection.json)。测量器与未运行测试保留为`.txt`审阅副本；仅在独立树应用补丁并恢复原路径时才用于复现，均非当前活动代码。四轮原始进程回执同目录保留，无存档上传。实际命令模式：`python scripts/run-d4e12-check.py tick-copy-k 180 --phase-file artifacts/d4e12/tick-copy-k/phase.json node scripts/measure-d4e12-tick-copy.mjs variant artifacts/d4e12/tick-copy-k`，k/variant依次a1/baseline、b1/candidate、b2/candidate、a2/baseline，完整展开命令见各process.json。

原八档/16依赖/旧88源码/107份既有日常文件、中控并行原型及脏摘要均保护；18338/PID61236、18340/PID63160、18342/PID14520保持，没有本轮测试进程或隔离锁。无main/部署/迁移/DSH外部模型；性能整体仍未达标，Projects保持需修正。后续按编码与规则校验的实际调用热点定位，不继续此副本复用微优化，不重跑私有长档。

## 18:02 自动跟进：固定规则 tick 去除重复计算，保留完整重演

**本片功能限定PASS，短世界性能改善成立；D4E12仍需修正。** 执行树 `D:/Narraverse-World-Map-demo-integration`，分支 `codex/world-runtime-demo-integration`。生产变更只有 `runtime/core/command-engine.mjs`、`runtime/core/encounter-runtime.mjs`；新增一个定向测试和可复现A/B测量脚本。

原 `performTick(...,'session')` 会先运行调用方系统，再运行固定系统一次来比较结果。campaign命令执行及历史重演本来就传入固定系统，因此这条链上的每个tick重复计算。新增 `performCampaignTick(bundle)`：先通过原数据合同深拷贝/拒绝访问器，只能选择代码内部固定campaign系统，仍检查结构、调度、计数器、预算、受保护字段和事实；对这条专用路径省去第二次相同计算。通用 `performTick` 仍保留自定义系统的固定规则比较，调用方不能通过第四参数或自造Symbol启用专用路径。

正确性依据：输入已脱离调用方可变数据，专用入口不接受回调或跳过校验参数，时间与随机数全部来自同一输入快照，因此同一固定规则的第二次运行不是独立审计。**公开 `validateBundle` / `validateServiceCommit`、从零完整历史重演、逐事实/回执/终态比较全部保留**；没有缓存重演结果、裁剪历史、削减规则、改变世界时间或异步提前确认。七处campaign推进/重演tick调用改接专用入口；其他profile保持旧路径。磁盘发布、失败回滚、幂等、HTTP及worker实现没有修改。

### 同机ABBA真实HTTP对照

Windows / Node.js v24.14.0。每轮独立进程、随机端口、新隔离目录；seed42、相同commandId，8次真实HTTP `AdvanceTime(2)`，终点r16/tick16。A读取上述固定基准的两个生产模块，B读取候选；Node加载钩子只添加执行次数计数，记录插桩前模块SHA。两侧都使用 `runtimeWorker:false` 比较相同主线程放置的计算成本，不能用此表推断worker读取延迟。每进程180秒外部硬限、阶段120秒；四轮全部退出0、无watchdog介入。

| 顺序 | 新世界打开墙钟/CPU ms | 8条行动墙钟/CPU ms | 关闭墙钟/CPU ms | 完整重开墙钟/CPU ms |
| --- | ---: | ---: | ---: | ---: |
| A1原版 | 219.342 / 250 | 3341.453 / 3391 | 1.339 / 0 | 3657.675 / 3593 |
| B1候选 | 223.974 / 250 | 2629.315 / 2625 | 1.338 / 16 | 2910.815 / 2953 |
| B2候选 | 237.720 / 359 | 2660.990 / 2828 | 1.243 / 0 | 2899.690 / 2969 |
| A2原版 | 220.237 / 297 | 3325.451 / 3344 | 1.501 / 0 | 3740.994 / 3673 |

各版2次；行动墙钟中位3333.452→2645.153ms（**20.65%**），CPU3367.5→2726.5ms（19.03%）；重开墙钟3699.334→2905.252ms（**21.47%**），CPU3633→2961ms（18.50%）。行动墙钟范围A3325–3341/B2629–2661ms，重开A3658–3741/B2900–2911ms；仅两次样本，不作置信区间或长档外推，不追查普通小幅波动。新世界打开及关闭没有确认的性能收益。

四轮均计到192次session推进；A另有192次proof重算，B为0。**实际session次数没有减少**，完整审计仍执行所有历史ticks。四轮9份正式输出逐文件SHA、8份回执、五投影完全相同，关闭后完整重开逐项一致；重试原ID返回原回执、没有新增存档，原9文件SHA不变。

- r16文件SHA256：`4d6c6b2f3fbe33a7b1639fcb4cb00ec78a20d334a3a1382c9d37550ed97a6f9a`
- 回执规范签名：`aca4cd5210750995837d963dd1b15d0df26b84cc06718ae8a69eeab1425be4a2`
- 五投影规范签名：`9e6cddddfd6bbc2a185223c60e36cfdd8b09b481f667342b90d0ca6e1dafa1e4`

### 最少定向门与实际页面

`canonical-tick-core-01`：6/6 PASS，墙钟6268.867ms/CPU6578.125ms，包括连续6tick与旧路径等价/输入不变、单个合成日结边界tick143→144的事实及RNG等价、自定义系统伪造与第四参数绕过拒绝、非法数据/错误profile/零getter执行、完整服务重演与篡改拒绝、耐久发布失败回滚、worker恢复/精确幂等。日结用例是原语输入，不冒称合法长历史恢复。

`canonical-tick-ui-01`：同一次隔离新世界实际Edge页面26命令，赠粮→行军暂停改道→NPC路遇→JRPG两回合胜利→返村→正常关闭PASS；墙钟25388.722ms/Node CPU16328.125ms（不含浏览器CPU）。终态r48/tick37、HP920/私粮19/钱包0、村庄(4,7)，页面errors为0。该链使用 `--ui-only`，**没有在本页面链测试工作交易休息、独立全档审计或重开**；完整短史审计/重开由上面的A/B与核心门单独覆盖，不能说一次全链全绿。未截图、录屏或视觉巡检；不以两次不同时间页面时长作性能对照。

实际命令（`k`按a1、b1、b2、a2，`variant`依次baseline、candidate、candidate、baseline；每条只运行一次）：

```powershell
python scripts/run-d4e12-check.py canonical-tick-k 180 --phase-file artifacts/d4e12/canonical-tick-k/phase.json node scripts/measure-d4e12-canonical-tick.mjs variant artifacts/d4e12/canonical-tick-k
python scripts/run-d4e12-check.py canonical-tick-core-01 180 node --test --test-isolation=none tests/simulation/campaign-canonical-tick.test.mjs tests/simulation/demo-service-certification.test.mjs tests/simulation/demo-worker.test.mjs
python scripts/run-d4e12-check.py canonical-tick-ui-01 600 --phase-file artifacts/d4e12/canonical-tick-ui-01/phase.json node scripts/verify-d4e12-demo.mjs artifacts/d4e12/canonical-tick-ui-01 --ui-only
```

[原始数据与统计](../evidence/d4e12-canonical-tick-20261017/summary.json)、[定向检查TAP](../evidence/d4e12-canonical-tick-20261017/canonical-tick-core-01.txt)、[页面结果](../evidence/d4e12-canonical-tick-20261017/canonical-tick-ui-01-result.json)、[保护核验](../evidence/d4e12-canonical-tick-20261017/protection.json)。同目录保留四轮原始JSON和各父进程硬限回执；只上传合成指标、回执及SHA，不上传任何存档。

原8份存档、16依赖、旧88源码、107份既有日常文件字节未变；中控并行原型与未提交摘要保留。18338/PID61236、18340/PID63160、18342/PID14520保持；本轮测试进程及隔离锁均无残留。未合main/部署/迁移，未调用DSH或外部模型。下一片继续定位历史增长下的重复遍历/审计成本；不复跑私有长档，不宣称日常入口已应用候选。Projects保持In Progress/需修正，自动跟进继续。

## 17:27 自动跟进：流式相等比较试验已弃用

基准`24ee9f909d4532742ea3a4da695420869ce53fb6`。测试了不构造规范JSON字符串、也不复制对象的token序列比较：保留两侧完整数据校验、原错误优先级与全量重演，只替换11处相等比较。合法/非法输入、零getter执行及深度边界等价；连同完整服务重演/篡改拒绝/worker恢复共5/5 PASS，5.849s墙钟/6.203s CPU。功能正确不代表值得采用。

独立进程按ABBA执行固定seed42、相同ID的8条真实HTTP `AdvanceTime(2)`，共16ticks；每轮新隔离目录/随机端口，均以相同的主线程模式测纯确认与完整重开审计，未混入worker放置差异。基准只通过Node加载钩子读取固定提交的原比较消费者；规则、序列化与磁盘发布相同。每进程180秒硬限/阶段120秒，四轮退出0。

| 轮次 | 8条行动墙钟ms | 行动CPU ms | 完整重开墙钟ms | 重开CPU ms |
| --- | ---: | ---: | ---: | ---: |
| A1原版 | 3282.411 | 3313 | 3601.768 | 3562 |
| B1候选 | 3328.749 | 3390 | 3628.908 | 3672 |
| B2候选 | 3284.274 | 3376 | 3600.674 | 3625 |
| A2原版 | 3275.620 | 3455 | 3706.386 | 3656 |

原版/候选行动墙钟中位为3279.015/3306.512ms，CPU3384/3383ms；重开3654.077/3614.791ms。没有可采纳的确认加速，不追查数十毫秒波动。**候选全部撤回，生产源码保持216cd12，新增试验测试/脚本也不留在活动测试或工具目录。** 本轮只交付弃用证据，不能宣称新性能修复。

四轮9份正式存档逐文件SHA一致，所有回执及五投影签名一致，重开逐项一致；重试原ID得到原回执且无新增档。终点r16文件SHA `4d6c6b2f3fbe33a7b1639fcb4cb00ec78a20d334a3a1382c9d37550ed97a6f9a`；回执签名`aca4cd5210750995837d963dd1b15d0df26b84cc06718ae8a69eeab1425be4a2`；五投影`9e6cddddfd6bbc2a185223c60e36cfdd8b09b481f667342b90d0ca6e1dafa1e4`。

[原始数据与汇总](../evidence/d4e12-equality-trial-20261017/summary.json)、[可审阅的弃用补丁](../evidence/d4e12-equality-trial-20261017/candidate.patch)、[定向TAP](../evidence/d4e12-equality-trial-20261017/equality-core-01.txt)。同目录保留测试及测量脚本的`.txt`原字节副本：仅供独立树应用候选补丁后恢复到原`tests/simulation/`、`scripts/`路径复现，不是当前活动测试。原始JSON/进程计时均为合成世界，未上传存档。

下一步应定位完整重演中逐tick推进与重复数据遍历的占比，不再重复尝试`clone+deepEqual`或token相等比较；完整公开审计与历史重演边界保持。原8档、现有服务及其日常数据保护详见同目录`protection.json`。长档冷开与确认等待仍未解决，自动跟进继续，D4E12仍需修正。

## 参考阅读与取舍

- 阅读用户给定的[开源游戏清单](https://github.com/bobeff/open-source-games/blob/3a9ab8fc892a2cdadf8989a72ba7624a11e39cec/README.md)，进一步读取实际实现，未把清单本身当成技术方案。
- OpenTTD：[`StateGameLoop`](https://github.com/OpenTTD/OpenTTD/blob/c0d5c0b3fc2588ac001e301e97ce795aefb8a90c/src/openttd.cpp#L1197-L1269)保持顺序执行；[游戏线程与绘制之间让出执行机会](https://github.com/OpenTTD/OpenTTD/blob/c0d5c0b3fc2588ac001e301e97ce795aefb8a90c/src/video/video_driver.cpp#L30-L62)；[保存任务的线程化与串行保护](https://github.com/OpenTTD/OpenTTD/blob/c0d5c0b3fc2588ac001e301e97ce795aefb8a90c/src/saveload/saveload.cpp#L3052-L3150)。采纳“顺序的权威模拟与入口/绘制响应分离”；本项目写盘只有十余ms，未照搬后台保存或降低逐步耐久性。
- Mindustry：[`Logic.update`](https://github.com/Anuken/Mindustry/blob/17012d61d9e4c3cbd9820d87e81c24495486ac53/core/src/mindustry/core/Logic.java#L517-L600)与[自动保存调度](https://github.com/Anuken/Mindustry/blob/17012d61d9e4c3cbd9820d87e81c24495486ac53/core/src/mindustry/game/Saves.java#L204-L230)职责分开；[保存失败恢复旧文件](https://github.com/Anuken/Mindustry/blob/17012d61d9e4c3cbd9820d87e81c24495486ac53/core/src/mindustry/io/SaveIO.java#L118-L180)。本项目已有原子发布和回滚，保持现实现。
- RimWorld不是可直接复用的开源游戏。核实[官方EULA](https://rimworldgame.com/eula/)，只做学习性阅读与摘要。阅读了非官方反编译镜像的[`TickManager`](https://github.com/IlyaChichkov/RimworldDecompiled/blob/d2d70e57a8042c08c3f7ac41659b4988d63e2491/Verse/TickManager.cs#L318-L475)与[`SafeSaver`](https://github.com/IlyaChichkov/RimworldDecompiled/blob/d2d70e57a8042c08c3f7ac41659b4988d63e2491/Verse/SafeSaver.cs#L28-L99)；对应游戏发行版本未证实，未复制源码进本项目。未采用过载时丢弃积压时间的策略，以保留既定世界时间语义。

## 实际改动

新Demo模式默认把**原有runtime owner**运行在Node工作线程；旧非continuousMarch入口保持原模式。HTTP主线程只缓存上次已持久发布的公开投影，并转发指令。主线程没有第二份可写世界、伤害计算或资产账。

工作线程仍依次执行：输入验证→实际世界变化→完整世界历史审计→磁盘原子发布→发送完整投影组及回执。主线程原子替换缓存后才完成POST。恢复仍完整审计存档；WeakSet证书不跨线程传递。format11/DTO5、每格1tick/每批最多2ticks、500ms片间隔、128命令预算及暂停保留位保持。

RPC仅submit/close，有界16笔，close有独立排空机会。投影返回副本，所有投影版本一致；非零anchor中已有的命令也进入幂等缓存。工作线程异常则读写失败并拒绝待处理请求，终止该线程，保留锁供明确恢复，不自动删锁或创建替代世界。正常关闭等待落盘、释放锁及线程退出。停止请求可及时进入主线程，但其成功确认仍必须等当前片完成；不承诺中途打断同步审计。

`startRuntimeServer`新增仅用于有界对照的`runtimeWorker:false`选项；它只改变执行线程，不绕过任何规则。CLI无需新参数，continuousMarch默认使用工作线程。正在运行的旧实例及已打开页面没有被更新。

## 同机ABBA原始结果

Windows / Node24.14.0；独立新世界、seed42、相同固定ID的一条真实`AdvanceTime(12)`。每20ms尝试读取同源demo-state；观测阻塞为计时器超期加HTTP读取耗时。ABBA各版2次，非p95或稳定性统计。

| 顺序 | 模式 | 行动确认墙钟ms | Node CPU ms | 本轮最长读取阻塞ms |
| --- | --- | ---: | ---: | ---: |
| A1 | 原主线程 | 916.266 | 907 | 868.124 |
| B1 | 工作线程 | 964.491 | 1032 | 7.383 |
| B2 | 工作线程 | 900.828 | 1047 | 4.543 |
| A2 | 原主线程 | 846.074 | 797 | 804.210 |

工作线程期间完成40/42次读取，原模式各2次；原模式也可在写盘等待时读到旧修订，因此“读到旧修订”单独不构成响应性证明。四轮输出`service-commit-r12.json` SHA256完全一致：`e579083e98cb4d7b056f46e66e94a59811ceccb9d216c355f9496adb0ebb1032`。

**行动确认没有可证明的加速，CPU也未下降。** 明确改善的是计算期间服务读取与事件循环响应。不能把这组结果说成长档开档加速或消除了所有按钮等待。

## 功能证据、弃用试验与限制

- 最终定向worker检查1/1，1430ms墙钟/1906ms CPU，180秒硬限、退出0：提交前仍读旧投影、目录异常时不发布/不丢请求、同ID原回执、不同内容拒绝、getter执行0、正常关闭线程及锁释放、全文件独立审计/恢复一致、非零anchor幂等、篡改文件拒绝且保留原字节。前两轮通过后增加anchor/失败路径检查，分别保留，不计为3个唯一用例。
- 真实Edge页面短链：赠粮→暂停改道/路遇→两回合胜利→返村→关闭，26命令，r48/tick37，HP920/粮19/钱包0/村庄(4,7)。总30.099s，Node CPU21.234s，无JS错误/隔离锁。两次攻击含表现约1.898/2.040s；不是与旧样本受控A/B，不报改善率。此链未做工作/买卖/休整、完整文件重演或重开；短档完整恢复来自上述定向检查，不冒称整链重开。
- 弃用试验：11处规范JSON字符串比较换成`cloneData+isDeepStrictEqual`；功能检查通过，但新短行军228/300ms（带Profiler的旧观测）与234/369ms（候选、未采样）不能建立收益，原始151/408/774ms也受运行负载影响，故全部撤掉。最终核心重演代码零改；未为确认噪声追加长史采样。
- CPU短采样提示canonical编码/校验/复制仍重；没有把此诊断当成已解决。本轮没有测长档冷开、性能极限或突然杀死工作线程的磁盘中断恢复；既有完整审计、磁盘失败回滚代码保持。D4E12仍In Progress/需修正。

证据位于`docs/evidence/d4e12-responsive-20261017/`，仅包含合成运行结果/散列，不含任何存档。复现命令必须换全新label与目录：

```powershell
python scripts/run-d4e12-check.py responsive-core-new 180 node --test --test-isolation=none tests/simulation/demo-worker.test.mjs
python scripts/run-d4e12-check.py responsive-abba-new 180 node scripts/measure-d4e12-responsive.mjs artifacts/d4e12/responsive-abba-new
```

后续需要解决的是新候选完整历史核对的计算复杂度。不能用提前成功、放松审计或仅播放动画替代。已有完整重演机制保持，本轮没有实施新的历史增量认证。
