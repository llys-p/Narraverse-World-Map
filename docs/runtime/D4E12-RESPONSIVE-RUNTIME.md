# D4E12：模拟执行与入口响应分离

2026-10-17（Asia/Shanghai）。用户要求自主阅读开源游戏并解决行动等待。本轮源码 `216cd124cb992bc593007ebdec2c154ad046daaa`，基准 `eaddf683659465194b784b631be6e78b94f11a0e`。

**已消除新入口中同步审计堵住HTTP事件循环的问题；行动确认与长档冷开成本尚未解决，性能整体仍不判合格。** 没有把仍在等待的行动提前标成成功。现有18338/18340/18342实例未启停，新代码没有切换进这些进程。

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
