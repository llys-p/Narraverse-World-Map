# D4P3｜保留校验语义的规范编码遍历优化

发布时间：2026-10-15 10:30（Asia/Shanghai）。合同 `d4-canonical-encoding-performance-v1`。状态：已发布，待开工。任务属于D阶段的性能修复，不代表日常性能或D整体已通过。

## 给用户看的交付

减少存档打开/重演中用于编码比较的重复遍历和临时对象分配，同时保持原来的数据检查。先证明编码与拒绝行为相同，再只用既有战后存档做一次打开→返村→关闭重开，核对完整结果并记录耗时。没有足够收益或出现不一致就交回，不自行扩改其他热点。

## 1. 精确基准、位置与职责

- 控制树 `D:\Narraverse-World-Map-control`，执行前读本合同、当前`AGENTS.md`/`PROJECT_CONTEXT.md`及[R1中控复核](../docs/runtime/D4P2-R1-REVIEW-20261015.md)，历史按需。
- 精确接续基准 **`1c2713a4a12f05259031dd167239ade800929be0`**；生产祖先仍 `611b3aff1e98150af069478a50e09923f4d5f633`。源码/测量器来源树 `D:\Narraverse-World-Map-d4-long-history` 只读保留。
- 计划新树 `D:\Narraverse-World-Map-d4-canonical`，分支 `codex/world-runtime-d4-canonical`，从上述接续基准建立，发布时未创建；已有同名目录/分支须核归属，不覆盖别人工作。
- 精确提交、仅推送本任务分支并读回SHA，远端 `https://github.com/llys-p/Narraverse-World-Map.git`；origin可能指本机clone，先核对。中控裁定与更新控制状态/看板，执行者不自报已验收、不改其他任务树。
- 公共数据边界和编码算法需要严格审查，由主执行者负责；有界机械对照/回执适合性价比协作者。默认并发1，不为此创建新包工头体系。

## 2. 唯一生产改动与语义合同

生产改动仅 `runtime/core/data-contract.mjs` 的 **canonicalJson及其私有编码辅助**：在有证据的编码路径中把校验与编码合为一次遍历，避免先构造一份完整clone再遍历编码。允许调用既有record/denseArray等校验；不得跳过它们拥有的约束。先写清等价方案和检查范围，再实施。

以下边界必须成立：

- 对全部支持的数据，输出与冻结基准canonicalJson **逐字节相同**：递归字典序键（含看似整数的键）、数组次序、字符串转义/Unicode、有限数字、-0、null/boolean、空值、null原型记录、自有`__proto__`/constructor键及共享但无环引用等。输入不变，公开API签名不变，不加trusted/skip参数。
- 对非法数据，保留原拒绝及错误码/预算语义：非有限数、非JSON值、非支持原型、符号/不可枚举/访问器属性、稀疏或带额外属性数组、循环和深度上限等。不能让getter/setter或toJSON替代原数据校验；原本不执行的getter仍不执行。保留合理的原校验次序，不用原生JSON.stringify吞掉非法值。
- **不改cloneData、put、record、denseArray或公共常量/预算的行为**，不把put换成普通赋值，不额外优化复制/其他校验。不要把原安全边界当纯开销删去。
- 不改world/runtime/service、journal/receipt/event/RNG/scheduler、磁盘发布点、缓存认证、存档版本和profile规则；外部存档仍完整校验并逐条重演，原篡改拒绝仍成立。
- 该文件是所有profile共享底座；本次要求编码/拒绝行为兼容，不宣称旧profile不经过改动函数。不得借性能需求引入scene分叉或另一套弱校验编码器。

本地 Reference Review：采用R1原始profile及中控独立统计；原canonicalJson的“cloneData校验→排序encode”是唯一行为参考。保留现有校验职责，合并遍历以减少临时分配；不改共享put，不改完整历史重演。Node内置实现，无新增依赖、外网调研或通用序列化框架。

## 3. 文件范围与最少必要验证

最多4份文件：上述生产文件、新 `tests/simulation/canonical-json-equivalence.test.mjs`、新 `docs/runtime/D4-CANONICAL-ENCODING-RESULT.md`，以及测量脚本 `scripts/measure-d4-long-history.mjs`（仅当本合同实际运行必需才改，保留父进程硬时限）。不顺手拆/重构现有约980行测量器。

1. **等价检查先行。** 从精确基准加载独立参考模块，记录其源指纹，不把新实现当oracle；以小而明确的合法/非法样本比较编码字节、异常code及getter调用数。覆盖本次替代clone遍历直接触及的边界，不扩展无关功能或用例数量目标。生产方案若不能保持合同，停止，不弱化断言。
2. **真实文件编码对照。** 只解析母合同原8档，每档用原/新canonicalJson各编码一次，记录完整签名并相等；此步不调用业务审计/owner/重演，不修改原档。原始路径与SHA清单见[D4P2母合同](D4-LONG-HISTORY-PERFORMANCE-TASK.md)。同时对payloadBudget做一个直接定向边界核对，防止规范输出/字节计量改变。
3. **直接篡改拒绝。** 只选现有 `tests/simulation/scene-gift-service.test.mjs` 的 `CP2a-S7` 真实持久journal/receipt篡改拒绝成员跑一次；这是公共编码函数已变后直接依赖的必要校验，不泛跑整文件/全量。记录准确名字匹配和实际结果，不能只写空匹配成功。
4. **唯一集成测量。** 修正后的测量器用新独占run-id、无`r1`子串、**不加--profile**，从原7档副本真实执行一次母合同的打开→唯一DTO返村→正常关闭重开；逐字节保护原8档和原7副本，完整新r182与原参考r182做canonical等值，真实回执及重开五投影一致。不得只比较几个字段，不把参考终态注入候选。

步骤1–3均有清晰结束和原始输出，不运行全量/无关/视觉测试；语法检查按实际修改文件。用有效原证据复用未变部分，不能因为公共底座变更而重跑所有profile。

## 4. 集成测量的工作负载、时限与收益判断

沿用母合同的原r170：format9/schema3/d-scene-survival-v1，rev170/tick168/6commands；唯一命令逐字段取原r182最后DTO（PlayerTravel到village、expectedRevision170、原commandId），终点rev182/tick180/7commands。完整锚点、日志、回执、RNG、scheduler和世界均按原数据；原CP3锚点来源如实标注。

每个首次打开/提交/重开最多 **120秒**，受监督子进程总计 **420秒**；独立父进程watchdog，退出确认最多5秒。不预热、不重新跑旧慢版本、不做第二轮/CPU采样/p95或扩大人口。若超时/失败，只保留已经完成的阶段和观测下界，后续未跑如实标记，不自动续跑或增预算。

收益依据为本次候选的实际绝对耗时，以及编码路径已减少临时分配的证据。首轮未采样95.147747秒可作历史参考，R1的111.303165秒带Profiler不能当同口径性能基线；不得包装成严格同时成对实验或承诺固定提升倍数。报告机器/Node、准备步骤、完整语义等价和各阶段耗时。语义等价但耗时收益不明确，也须报告不明确，不自动改put或缓存寻找更多收益。

## 5. 交付与停止点

回执先说编码变化、实际效果、已验/未验项；给中控附精确Git SHA/dirty、源码/测试/测量脚本指纹、原/新编码对照、定向篡改日志、唯一集成测量原始输出及完整r182/回执/五投影签名、文件保护、锁/进程退出状态。原始档和profile留本机ignored目录，不上传原档/配置。

完成当前范围即停，不main/deploy，不启动日常体验入口/18324或其他旧实例，不接正式平台/模型，不迁移真实存档。中控独立核验通过后，才能据本次完整链证据收口原D4P2缺项；D阶段整体与日常入口另行裁定。取消、超时或未验项不能写成通过。
