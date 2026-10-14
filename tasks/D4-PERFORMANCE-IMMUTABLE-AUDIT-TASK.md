# D4 性能修复：同一不可变候选的审计复用

冻结时间：2026-10-14（Asia/Shanghai）。用户在D4存档推送后明确继续；本合同限定当前性能修复，不新增玩法或改写D4母合同。

- 实际树 `D:\Narraverse-World-Map-d4-performance`，分支 `codex/world-runtime-d4-performance`；精确基准 `f0fa73dd2b41db6fb5aa1c11a221a3fa142ae30a`，A生产祖先 `254c27d143f735dfff2051f561dee129012b5a99`。
- 固定工作负载：Node v24.14.0、4个实名角色、seed42、默认无机会scene；Gift→Travel12，最终tick12/revision13、两个journal命令、并发1。分别测转换、完整bundle审计、五投影、完整service journal审计；只报告同一负载的单次样本，不报p95或长期复杂度。
- 基线：fixture117ms、Gift152ms、Travel1608ms；完整audit820ms、public805ms/player816ms/mind814ms/encounter1642ms/scene2229ms、service journal6558ms。CPU原始采样及摘要在性能树ignored `artifacts/d4-performance-20261014/`。
- 修改限定为scene规则；内部数据只有经过完整审计才可认证并深冻结。复用需同一私有对象身份、同rules和相同system handler；mutable副本、不同system、getter/accessor、篡改及外部load不得命中旧认证。
- 公开API继续返回独立可修改副本；不增加 `trusted`/skip-validation 参数、不弱化预算或错误码、不复制终态造replay、不改变world/receipt/event/RNG/scheduler。service仍完整重演journal，未增加prefix或跨世界缓存。
- 磁盘发布仍为提交点，候选转换/投影/审计/写盘失败不得修改缓存；正常关闭与同目录重开保持完整bundle和五投影。旧profile不启用此缓存。
- 本地Reference Review：采用 `createSimulationSession` 已有的私有深冻结快照模式和此前M3测量指出的不可变审计复用方向；拒绝跳过外部存档/receipt重演及用户可传入的信任标记。使用Node内置工具，无新依赖。
- 源码计划范围：`runtime/core/world-state.mjs`、`runtime/core/command-engine.mjs`、`runtime/core/scene-runtime.mjs`、`runtime/fixtures/scene-survival-village.mjs`、`runtime/service/service-commit.mjs`、`runtime/service/runtime-owner.mjs`；新增一份短定向认证/篡改检查。负责人实施核心缓存；机械文档整理可交经济子代理。
- 必要验证：相同测量脚本最终bundle/journal/五投影SHA必须一致；缓存仅认证不可变对象、mutable副本篡改拒绝、系统替换不复用；现有H4真实EACCES/幂等及H5合法恢复/篡改成员定向跑一次；实际owner正常关闭重开短链。禁止全量、截图/浏览器视觉巡检、128命令预算与完整H7重跑。
- 收口：记录源码/test指纹、测量/检查原始证据与失败；更正唯一 `PROJECT_CONTEXT.md`，保存精确本地提交与看板当前状态。此范围通过后停，不自动部署/main/手机或下一阶段。

## 本轮测量及交付（2026-10-14，Asia/Shanghai）

- 限定范围 PASS：性能候选 `611b3aff1e98150af069478a50e09923f4d5f633` 已推送并读回 `codex/world-runtime-d4-performance`；7路径（6生产+1测试）134增/22删，工作区干净，无main/deploy。
- 同一机器（Windows x64、i5-13500HX、20逻辑CPU、约15.73GiB RAM）、同负载单次成对测量：初始化1902.14→265.11ms；赠粮提交2058.83→163.53ms；旅行提交13941.06→2704.60ms（约5.15倍）；正常重开12756.20→2957.63ms（约4.31倍）。五个已缓存读取原本不足1ms，未将其列作主要收益。
- 基线与最终候选的完整service commit、回执/journal和五投影合并SHA256均为 `a202565801e7abad65c1bb9df965c1bfd8d0b724011369b7af0e493cebb979a3`；包括原始world、事件、RNG、scheduler，正常重开前后保持一致。
- 最终定向单次10/10、0失败/取消/skip/todo、exit0，30083.8052ms：新增两项认证/immutable/mutable副本与getter0/system/rules边界；原CP2a-S7真实journal篡改拒重开、S8读投影独立无写；B descriptor-first、真实link EACCES保旧、满queue原DTO优先、13个checkpoint篡改与合法恢复、旧format8字节配对，以及短HTTP ACTIVE gift拒绝/重开。
- 证据位于性能树ignored `artifacts/d4-performance-20261014/`：`baseline.cpuprofile`、`baseline.json`（函数级测量）、`baseline-owner.json`、`candidate-final-owner.json`、`final-directed.tap`和`final-acceptance-index.json`；所有指纹记录于索引。固定实际owner工作负载可用该目录的 `measure-owner.mjs <精确源码树> <输出标签>` 重现；`finalize.mjs`只读取证据，不运行业务。
- 中间 `candidate-owner.json` 因scene工厂每次新建handler，只有微小改善；源中统一canonical handler身份后才得到上述最终收益。中间测量与早期定向输出保留，没有写成最终候选结果。
- Code review：证书仅由完整审计后的深冻结副本建立，私有WeakMap不保留world键；规则/注册key/handler引用需全等，继承键不能替代注册key。公开业务bundle/receipt/投影及systems映射仍独立可修改；内部handler实现共享。外部load仍完整bundle+service journal replay，持久写成功后才发布，失败保旧、旧profile不缓存，无跨世界/前缀缓存。
- 当前只完成上述固定短历史优化；未测tick180/128条命令大历史性能、p95、峰值内存、长期规模，也未进行浏览器或视觉验证。原D4完整母合同冻结证据仍针对其旧基准，本轮10项不能写成重跑全部D4。
