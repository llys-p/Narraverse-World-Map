# D4E12：Demo真实世界接入结果

2026-10-18补充：用户已批准运行中审计调整，候选分支codex/world-runtime-live-session-audit实测行动确认改善56.40%（合成短世界ABBA）；完整冷开保持，未切日常入口。见[限定验收报告](D4E12-LIVE-SESSION-AUDIT-RESULT.md)。

2026-10-17（Asia/Shanghai）。**功能限定通过；性能未达标；外观/听感未验。** 分次证据共同覆盖合同，未宣称一次整链全绿。D4E11历史未完成验收不改写。

## 给用户看

后续自主修复：[模拟与HTTP响应分离](D4E12-RESPONSIVE-RUNTIME.md)。读取阻塞已在同机ABBA中明显改善；行动确认与长档冷开仍未达标，原历史结论保留。

采用原demo的地图、场景、火柴人、兽类绘制和合成音效，接入现有村庄/森林与三NPC。赠粮记忆、工作收入、买卖、休整、途中暂停/改道、路遇、两回合单狼胜利和返村都已消费真实世界结果。地图页面只下达订单，由服务端生成并保存MarchStep；钱包、位置、生命与战果只有一个权威来源。

新入口为 `Start-Demo.cmd` → `http://127.0.0.1:18342/demo-runtime.html`，新档仅 `artifacts/d4e12-daily/world`。首次交付时未创建日常档、未启动18342；16:26回访已观察到既有18342/PID14520及匹配的日常档锁（进程16:04启动），由本轮继续保留，不启停或操作。旧18338与18340服务保留；固定CMD仅静态核对，实测使用等价CLI/API及随机端口。

**流畅度不能判合格。** 较短样本两次攻击从点击到确认及表现结束约2.29/2.48秒；较长样本曾达5.13/8.52秒；最终30命令/81tick样本冷开仍74.35秒。连续订单消除了浏览器逐步驱动，完整世界历史审计仍造成多秒确认和冷启动等待。

## 16:26补充：确认提示修复与一次短行军归因

修复源码 `f4b93894dbaf82ff0fe30f3620c2c4077ecd8732`，接原交付 `2191da54e89c938f99d1042ac26ca3860a547480`。生产修改仅两份前端文件：SSE在POST进行中保持“正在确认”，此时不展示重试；响应中断且可恢复时才展示重试。原requestId、原请求字节、sessionStorage保全和严格POST回执校验不变。较新的SSE投影不能确认该POST成功，也不清除pending。

定向检查先以原实现复现冲突RED，再以修复实现通过1/1（墙钟1514.913ms、Node CPU1765.625ms，180秒硬限、退出0）；覆盖恢复pending→POST未回→较新SSE到达→连接失败→原字节/ID重试→有效POST回执才清除pending。最初两次测试构造错误保留在本机，不计为产品缺陷或通过次数。证据：[RED](../evidence/d4e12-demo-runtime-20261017/pending-status-red.tap)、[GREEN](../evidence/d4e12-demo-runtime-20261017/pending-status-green.tap)、[进程计时](../evidence/d4e12-demo-runtime-20261017/pending-status-green.json)。

**只运行一次短业务采样**：新隔离世界、seed42、随机端口和独立Edge配置，正常点击森林→两次内部MarchStep落盘→点击暂停。最终r6/tick4/road(8,7)，订单paused、runner停止；无浏览器MarchStep请求、JS异常0、正常关闭、隔离锁0。整进程墙钟4873.836ms、Node CPU2718.750ms、180秒硬限、退出0。没有复跑长链、历史档或视觉检查。

| owner分段（ms墙钟） | MarchSet | 首次MarchStep | 第二次MarchStep | MarchPause |
| --- | ---: | ---: | ---: | ---: |
| owner排队 | 0.555 | 0.044 | 0.044 | 0.048 |
| 预检与锁 | 2.351 | 1.858 | 1.835 | 1.616 |
| 存档目录核对 | 0.634 | 0.903 | 1.021 | 0.789 |
| 审计后的状态推进 | 120.603 | 383.440 | 743.498 | 343.079 |
| session复制 | 2.096 | 2.245 | 2.753 | 2.238 |
| 投影 | 4.278 | 5.269 | 5.589 | 3.702 |
| 持久发布 | 20.881 | 14.569 | 18.762 | 15.993 |
| 发布内存状态 | 0.046 | 0.023 | 0.024 | 0.026 |
| owner被测总段 | 151.562 | 408.370 | 773.544 | 367.510 |

订单进入runner的排队为0.635/0.480ms；浏览器MarchSet/MarchPause请求完成约158.040/370.541ms。POST后的额外状态GET为3.316/1.773ms，暂停排空后的GET为2.374ms。两次步进的状态推进约占owner总段94%/96%；该段进程CPU分别436/719ms，持久发布CPU为16/32ms。完整分段CPU、源码指纹和网络数据见[采样原始结果](../evidence/d4e12-demo-runtime-20261017/march-attribution.json)、[父进程计时](../evidence/d4e12-demo-runtime-20261017/march-attribution-process.json)。CPU包含进程内其他线程，受计时粒度影响，可大于墙钟；不是函数Self采样。

诊断只通过Node加载钩子在内存插入时钟，逐一断言替换锚点；不改生产文件或判断/发布顺序。被测owner段从入队至内存发布，尚未计返回回执副本/HTTP发送；网络wallMs另取CDP requestWillBeSent→loadingFinished。原始headersMs有少数大于wallMs，属于此采集口径下时间戳不自洽，保留原值但不用于头部/网络耗时结论。

**本次结论**：排队、复制、额外GET和写盘在该短样本中都不是主要等待；本轮不据此改动它们。`advanceAuditedServiceCommit`已复用私有认证的服务前缀，并非每步重新冷开/重演整份service journal；新候选仍走`executeAuditedCampaignIntent`与完整world/history审计。当前分段尚不能区分该段内部的实际推进、descriptor遍历、复制/编码、历史核对各占多少。下一最小性能工作是细分这一个热段，再决定优化；不能把两次耗时差异当成历史增长的受控证明。

时间规则保持原合同：**每格1 tick，每次MarchStep至多2 ticks**，不是每条MarchStep固定1 tick；每次提交后仍等500ms再调度，未改成墙钟实时推进。本轮86份backend文件零改动，format11/DTO5、逐步保存、外部审计/重演、失败回滚和断连语义均不变。已有未变源码的核心证据复用，不重跑。

原8档/16依赖/原型/旧88源码/控制树其他文件与先前已存在的日常文件散列仍一致，[保护核对](../evidence/d4e12-demo-runtime-20261017/followup-protection.json)。新发现18342日常档没有本轮开工前快照，故只确认锁PID与服务相符，不声称为其做了前后字节验收。旧18338/PID61236、18340/PID63160及既有18342/PID14520保留；无本轮测试进程或隔离锁残留。本轮已改源码不等于用户已打开的页面完成更新，当前浏览器缓存版本未核实。性能仍未达标，不以新建短存档或提示修复代替长档性能验收。

实际执行命令（label不可复用）：

```powershell
python scripts/run-d4e12-check.py pending-green-01 180 node --test --test-isolation=none tests/simulation/demo-pending-status.test.mjs
python scripts/run-d4e12-check.py march-attribution-01 180 --phase-file artifacts/d4e12/march-attribution-01/phase.json node scripts/measure-d4e12-march.mjs artifacts/d4e12/march-attribution-01
```

## 源码与环境

- Windows 11 10.0.26200；Node v24.14.0；Intel i5-13500HX，14核/20线程。
- 执行树 `D:/Narraverse-World-Map-demo-integration`，分支 `codex/world-runtime-demo-integration`。
- 基准 `80d6206ab2382f8bc96a20ef3e650fbcda1b9e97`。
- `456e35b`：私有不可变服务前缀认证，免除运行中重复服务前缀重演。
- `4d39b39`：单写者连续订单、同源SSE与停止/断连处理。
- `3c1cfbf`：外部存档完整审计后保留同一认证，消除加载后再次完整认证。
- 产品源码 `9899d9ee88fc97a21b6ae06a574af69832818c7d`：Demo三层真实接入、请求恢复与暂停锁；报告和验证工具在后续交付提交。
- [合同](../../tasks/D4E12-DEMO-RUNTIME-TASK.md)、[方案及Reference Review](DEMO-WORLD-RUNTIME-INTEGRATION-DRAFT.md)。原型机械提取使用既有Codex性价比子代理，核心与接线由主代理处理；未调用DSH或外部付费服务。

## 权威与审计边界

1. 新入口显式 `continuousMarch=true`；旧服务默认入口行为不变。保存仍format11/DTO5、128输入/129正式文件限额，暂停保留位未删除。
2. 每个新提交仍执行原完整世界/历史校验。外部JSON仍完整审计与命令重演；公开验证器继续独立完整核对，公开load返回可变副本。只有完整审计得到的深冻结对象可取得模块私有WeakSet证书，JSON副本和篡改对象不能取得。
3. 运行时在串行执行点给订单分配revision。重复ID使用原DTO回执；不同内容同ID拒绝。保存文件成功发布后才同时替换全部公开投影；写盘失败保留原世界。
4. 页面不计算伤害/胜负，不维护独立钱包；不搬入原型的偷窃、修炼、ATB或自动敌人裁决。回合表现仅解释已确认turnEvents，切层/跳过不会发命令。
5. 暂停、抵达、路遇或等待回合指令时不自动推进世界；隐藏/断连停止续发，恢复需明确继续，无离线补时。五投影来自同一修订，地图像素只是20×12权威格点的展示映射。

## 验证范围与实际结果

| 项目 | 结果及证据 |
| --- | --- |
| 核心定向检查 | 最终4个唯一成员一次4/4 PASS：不可变认证/外部篡改拒绝、预算暂停/离线不追赶、真实HTTP/断连/重开、owner发布失败回滚及全投影原子发布。11.963s墙钟、9.922s Node CPU，退出0。 |
| 原较长页面样本 | consumer-02实际完成赠粮记忆、工作20金币、买粮/休整、暂停改道、路遇与两回合胜利；返村读取连接失败退出，未伪报完成。未保存底层errno，不推断为存档损坏。 |
| 同档返村与完整文件重演 | consumer-02-tail返村成功，独立loadServiceCommit完整重演95.709s通过，正常关闭11.490ms。旧重复认证实现的重开超阶段限，外部在推算135.511s处停止自有进程，故该补验不判PASS。 |
| 最终较长档恢复 | restore-01 PASS：同一r92/tick81/30命令；单次完整认证冷开74.351s，五投影逐值与签名一致、31份已生成正式文件SHA一致、旧订单幂等重试不再续跑，真实浏览器恢复村庄/行囊/已胜战斗，关闭与文件保护通过。总79.339s，Node CPU75.969s，退出0。 |
| 最终新页面短链 | consumer-ui-04 PASS：赠粮→暂停/改道→森林两回合胜利→返村→正常关闭；26命令，r48/tick37，HP920/粮19/钱包0。40.644s墙钟、29.922s Node CPU；异常与控制台错误0；网络记录无页面MarchStep。此短链未重跑工作/完整重演/重开，相关证据来自上两行及核心门。 |
| 数据与服务保护 | 原8档全部SHA不变，原型SHA不变、16依赖原字节一致；旧树88源码文件及control其他4文件未变，已存在日常文件未变。18338/PID61236、18340/PID63160仍监听。新测试无进程/锁残留。 |

原始可审阅数据：[验收索引](../evidence/d4e12-demo-runtime-20261017/acceptance.json)、[耗时与超时](../evidence/d4e12-demo-runtime-20261017/timings.json)、[保护散列](../evidence/d4e12-demo-runtime-20261017/protection.json)、[失败记录](../evidence/d4e12-demo-runtime-20261017/failures.json)、[本机源码指纹](../evidence/d4e12-demo-runtime-20261017/source-fingerprint.json)、[核心TAP](../evidence/d4e12-demo-runtime-20261017/core-loader-01.tap)。只提交合成测试结果和散列，不含原始/测试存档文件、原型原字节快照或新增素材。

较长档最终 `service-commit-r92.json` SHA256：`02370e9566adc4e38e6988baa69864a10e13fa317bdec681e00b5c290b2958a7`。五投影签名：`fcb3505b0f0368932249ee4371cbfa8ad1e73da9b86b6b9eca87160ec00e6f32`。玩家actor-4在村庄(4,7)，HP920、金币10、粮20，战果win；关闭重开未变。

## 性能数据的解释

| 最终短页面阶段 | 墙钟ms | Node进程CPU ms |
| --- | ---: | ---: |
| 启服务与浏览器连接 | 1627.174 | 562 |
| 人物与赠粮记忆 | 414.541 | 297 |
| 行军、暂停改道、到森林 | 8199.592 | 4875 |
| 两回合（含表现） | 5664.277 | 3782 |
| 返村（含路遇与继续） | 24403.945 | 20047 |
| 正常关闭 | 10.811 | 0 |

命令耗时是“发起鼠标输入→回执与读取确认→表现结束”的墙钟，不是纯HTTP时延；CPU来自运行服务及测量脚本所在Node进程，未计Edge进程。没有单独采样每次暂停的确认时延、FPS或输入反馈延迟。较短/较长样本数据不同，没有受控A/B或重复统计，不报改善百分比、p95或稳定帧率，也不扩查3–5秒范围的普通波动。

剩余瓶颈是每个新候选完整世界历史审计、命令数量增长后的完整服务重演和同步CPU工作占用事件循环。此次仅消除可证明重复的认证；未削弱任何审计/重演。继续性能工作须保持这些边界，不能凭短样本或动画宣布达标。

## 失败与超时工具修正

- 初次浏览器脚本过早读取尚未创建的DOM，修正连接就绪条件后推进。
- 最初调度检查揭示停止确认可能早于当前发布完成；改为停止并等待串行尾部。另修正测试替身的幂等行为，保留runner-01失败TAP。
- consumer-02的只读测量连接失败后改独立读取连接，同档仅补余项；原失败保留。
- 原阶段计时器位于Node自身，同步审计可阻塞它；旧重开未按120秒被及时终止，135.511秒处由外部停止，确认自有PID终止后只移除了该PID的孤立锁。不能声称这次满足阶段硬限。最终父进程独立读phase.json，Windows Job Object约束整棵测试进程树。非业务阻塞探针按预期223ms被终止，退出确认有界；最终restore与UI04均无超时。
- UI03发现暂停排空与持久暂停之间的短暂可写窗口，修正按钮锁覆盖完整过程后，UI04同操作通过。

## 可复现命令

需Windows、Node24、Python3及本机Edge；不安装依赖。以下输出label/目录须换成全新的名字，旧证据不会覆盖。

```powershell
python scripts/run-d4e12-check.py core-new 180 node --test --test-isolation=none tests/simulation/demo-service-certification.test.mjs tests/simulation/demo-march-runner.test.mjs tests/simulation/demo-owner-publication.test.mjs
python scripts/run-d4e12-check.py ui-new 600 --phase-file artifacts/d4e12/ui-new/phase.json node scripts/verify-d4e12-demo.mjs artifacts/d4e12/ui-new --ui-only
```

原较长样本的实际修正后恢复命令（世界仅保留在本机，不上传）：

```powershell
python scripts/run-d4e12-check.py restore-01 180 --phase-file artifacts/d4e12/restore-01/phase.json node scripts/verify-d4e12-restore.mjs artifacts/d4e12/restore-01 artifacts/d4e12/consumer-02/world
```

去掉 `--ui-only` 的主验证脚本会新增工作/买粮/休整及独立文件重演/重开，仍受600秒总限与120秒阶段限；本次未为统一“全绿”次数再跑完整长链。公开仓库AI可复现短链，不能据此宣称读到了本机较长档。

## 收口与下一步

- 代码与功能范围可审阅，P1–P4实施/定向核验完成；**性能门未通过，D4E12保持需修正，D阶段仍进行中**。未合main、部署、迁移存档或切换旧体验服务。
- 本轮不继续增加地点/NPC/技能。下一步先处理已定位的同步审计与历史增长成本，再评估流畅度；外观/听感另行体验，当前未做截图、录屏、像素或布局验收。
