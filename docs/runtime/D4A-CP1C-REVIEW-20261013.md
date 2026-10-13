# D4A CP1c：真实场景命令分派复核

更新时间：2026-10-13 21:20（Asia/Shanghai）。裁定：CP1c限定 PASS；D4A整体与D仍未PASS，B等待完整A交付。

## 坐标与范围

- 源码树 `D:\Narraverse-World-Map\hds-d4-cp1a-review`，分支 `codex/world-runtime-d4-cp1a-review`。最终本地提交 `597940d4917f372dea4d9c41409ebd9399645d3c`，父 `c4ac067a3debe6d104a7b0d85672c442184e4972`；12 paths，工作区干净。源码未推送、未合入 main、未部署。
- CP1a 与 CP1b 限定结论分别见 [CP1a 复核](D4A-CP1A-REVIEW-20261013.md) 和 [CP1b 记忆层复核](D4A-CP1B-REVIEW-20261013.md)。CP1b原37项测试前缀字节保留且未变，SHA256 `69cd00998885c585e62073eac563713ec7956060a0b1caa7e3db2e2bccc269a7`。
- 本轮为当前对话内部施工与复核，没有派发新任务书；源码不推送、不合入 main、不部署，控制文档与看板按既有授权同步。

## CP1c 结果与证据

- R13曾真实 RED：affordable Scene 的 day-one `BuyFood` 未被 SocietyAction 路由，猎人饥饿值实际300而期望100。只在 `command-engine` 给 Scene 加 `|| SCENE_RULES` 分派门后，R1-R14 定向运行14/14通过，exit 0、skip 0。test SHA `9e3707f596dcb6c8a3dde853ddf648ae7fc228298503035aba2f207e3cc6800b`；source SHA `099c16aada636dbe0b6c6ba508a4ddd4827052b52f865f24628feeafc897f681`。报告/raw见源码树 `artifacts/world-runtime-d4-cp1c-controller/cp1c-14-green.report.json` 与 `cp1c-14-green.raw.log`；R13 RED 证据同目录。
- 49项直接回归也已全部通过，exit 0、skip 0：world-state 5、command-engine 12、encounter replay 15（含CLI保存恢复）、mind 6、observer 11。与14个新门分批验证，不是一次全文件或51/51运行。场景测试冻结 SHA仍为 `9e3707f596dcb6c8a3dde853ddf648ae7fc228298503035aba2f207e3cc6800b`；五份回归测试各自的 SHA见索引，source SHA同为 `099c16aada636dbe0b6c6ba508a4ddd4827052b52f865f24628feeafc897f681`；各批 raw/report位于 `artifacts/world-runtime-d4-cp1c-controller/` 与 `artifacts/world-runtime-d4-cp1c-core/`。最终索引 `artifacts/world-runtime-d4-cp1c-controller/final-acceptance-index.json` SHA256 `92d33f2ffc48676ae5d22202afbb4e2a0de78de949c6bdb71ed655a9e75b1d58`；索引核对包括父级 raw hash、提交后11文件 source match、test match 与 tracked dirty=0。
- 这项限定 PASS 覆盖 Scene 创建、真实自主日常行为、144/288 tick 推进、现有 checkpoint 保存恢复和整批 rollback。Null/accessor getter 与四模块冷启动 TDZ 问题已修并纳入对应回归。
- earn-then-buy 的旧 Work 路径工资为20，新 Scene 路径原先被拒时工资为0；修复后的 R14 验证工资只入账一次，后续购买成功。原37项测试前缀字节仍完整保留；首轮整文件47项由原37通过、新增7通过、3项测试fixture构造失败组成。fixture修正后只跑14个新门，不宣称整文件51/51复跑。
- `original5recipes-probe` 只通过结构检查，不能证明五种配方消费行为均正确；三种其他 fixture 配方没有独立行为门。母级白名单原未包含 `mind-runtime`，父级按用户授权为 Scene 增加共享路径 opt-in；旧公共门/签名不扩张。Reference Review 复用旧 encounter 六个 hooks 和母级 mind-survival 逻辑，未复制约43k engine、未加依赖。

## 未完成边界与后续

- 外部 `executeSceneIntent` 仍为 `UNSUPPORTED_VERSION`；Gift、完整外部 journal（当前 `emptyOnly`）、format9、CLI、UI尚未做。B仍等完整A交付。
- 下一内部小片应把 Gift、即时 memory 与完整 replay 做成同一提交闭包；不先发布只有弱重演的 Gift。没有派发外部任务书。D4A整体和D仍进行中。
- CP1a/CP1b/CP1c是分片限定结论，不代表D4A整体验收或正式平台接入；未触碰用户实例。