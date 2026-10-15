# D4P5｜安全复制与单次编码键名复用

2026-10-15 16:22（Asia/Shanghai）。合同 `d4-data-contract-fast-path-v1`；用户授权Codex吸收DSH方案并继续优化。**本任务限定PASS；未main/部署，不等于D整体或日常体验性能合格。**

## 给用户看

已吸收DeepSeek的安全复制方案，并新增单次规范编码内的键名转义复用。固定长历史样本的完整开档→返村→关闭→重开由历史196.45秒变成本次159.55秒，差约36.91秒/18.8%。最终存档原始字节、回执与五项投影一致，仍有几十秒等待。

首开47.90秒没有胜过历史DeepSeek47.38秒；新增编码改动的独立收益只在短对照中得到支持，不能把整链下降全归于它，也不声称稳定延迟或p95改善。

## 实现与来源

- 执行树 `D:\Narraverse-World-Map-d4-data-fast`，任务分支 `codex/world-runtime-d4-data-fast`；已验基准2936233426e990857f3c88a39ad58623832419fd，接续DeepSeek10a2180441fcc9509a6ddd561ac97679f279aa9f；本次实测生产提交 `d8d1dc6b6d554ad6dc51f00ea7374ecf07e2bb30`。
- 唯一生产文件 `runtime/core/data-contract.mjs`，SHA256 `9ab3bc12265351a822beb652e50f3e62620b36a6f265790bd966b822ed9a0c28`。其余runtime文件及测量脚本与2936233一致（源码保护索引有归一化比较）。
- 采纳DeepSeek动态Object.hasOwn守卫：普通键快速写入，Object.prototype冲突键保持defineProperty，继承setter/只读键不改变语义。Hy3/Step的独立复用验证支持该选择。
- 新增私有Map只在一次canonicalJson调用内保存最多256个、UTF-16长度最多128的键名转义字符串。递归共享这张表；每个值仍逐次完整校验/编码，长键/满表继续正常编码，不增加拒绝限制。无对象、权威状态、审计或跨调用缓存。
- 保持所有数据/深度/字节预算、键排序、错误码/信息、getter/setter=0、返回原型/描述符。公开put、cloneData签名、完整外部存档验证/历史重演/receipt规则/磁盘发布均保持。

Reference Review：采用D4P4真实DeepSeek候选及R2反例/短对照；Hy4 fromEntries虽可行，但合成样本慢于DeepSeek且多分配，未拼入。本人尝试的16处成功校验展开在短对照中收益不稳定，已丢弃；原数字保留在discarded-inline-result.json，非原始完整stdout。编码转义复用针对R1已测CPU热点，避免未测的业务架构变化。

## 最少直接核验

1. 规范编码原5项 + DeepSeek复制6项 + 新增键名2项：**13/13 PASS、0skip，189.7215ms**。旧oracle独立SHA为c6f3bb2c…244f。覆盖真实8档规范字符串、复制r170/r182、负零/Unicode/整数外观键、256项和128长度后回退、getter/循环拒绝、继承setter/只读键、自有__proto__、真正65536/65537 UTF-8边界。新测试不削弱原断言。
2. 真实持久化篡改拒绝 `CP2a-S7`：**1/1 PASS、0skip，703.4485ms**。没有运行其余场景用例。
3. 250次r170已解析对象的复制/编码，三轮轮换顺序：原始/DeepSeek/本候选复制中位441.910/235.299/230.934ms；编码370.403/393.538/347.994ms。候选相对DeepSeek编码分别低8.38%/5.73%/14.06%，中位低11.57%；这是clone/encode短工作负载，不是完整存档打开、统计显著性或规模保证。复制实现与DeepSeek相同，不把约2%的测量差归为新增复制优化。

第一次测试输出采集因Python Windows默认GBK解码失败而没有有效stdout，不记为通过证据；改为保存原始字节后重跑上述窄集合一次并得到TAP13/13。无全量、视觉、H7/128命令或Profiler重跑。

## 唯一真实服务链

原测量器字节保持，命令 `node scripts/measure-d4-long-history.mjs run --run-id run-20261015-p5 --contract d4-data-contract-fast-path-v1`；独立父进程监督，单阶段120秒/子进程420秒/退出确认5秒。

| 分项 | 历史2936233（ms） | 本次d8d1dc6（ms） | 差值 |
| --- | ---: | ---: | ---: |
| first-open | 61851.345 | 47901.369 | -22.55% |
| submit-travel | 63404.284 | 49255.913 | -22.31% |
| close | 1.381 | 1.221 | 毫秒级 |
| reopen | 70974.714 | 62098.170 | -12.51% |
| 父进程总计 | 196451.860 | 159545.607 | -18.79% |

历史与本次不是同时成对实验。DeepSeek历史只有首开47377.2192ms、没有该候选全链；不能推断本次返村/重开比DeepSeek更快。

- 父/子均COMPLETED_CONSISTENT、exit0、killed=null、exitUnconfirmed=false，19项内部检查通过，reviewCause=NONE。
- 起点rev170/tick168/6命令，唯一真实PlayerTravel成功提交到rev182/tick180/7命令，actor-4返回village、私粮18；不是伪造状态或直接写档。
- r182为136020字节，与参考原始字节完全相同，SHA256 `d2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c`。
- 起点五投影SHA `046e7b2ef5da06bf3bf3d54096535601a84d7074e0754233c98d4f4031ec5f07`；提交后/重开后SHA同为 `2dd3b73b24fb95c1dcf815a63ae075f4f0f0131711f8e921a0d98f63c2bea48f`，回执/业务结果保持。
- protection=PROTECTION_OK，原8档和复制7档SHA未变、两次正常关闭、无残留锁；测量子进程48640已退出。原18324/正式平台未操作。

## 证据与停止

原始日志在 `artifacts/d4p5-20261015/`（TAP、微测/失败尝试、source-protection.json、acceptance-index.json）及 `artifacts/d4-long-history-20261015/run-20261015-p5/`（manifest、parent/child/protection、事件及独立副本）。不提交原始私有存档。可复跑微测脚本直接从固定Git提交读取参照；有效原始证据保留，不因文档提交重跑业务。

本轮到数据合同有界优化/真实链核验停止。更大历史、128commands性能、并发、峰值内存、p95与日常入口未验；性能仍有明显余量但不自动开下一轮。最终交付SHA由中控读回记录，实测源码d8d1dc6与本报告后的生产字节一致。
