# D4A CP2b 复核：CLI 场景导出与只读恢复

更新时间：2026-10-14 06:53（Asia/Shanghai）。结论：CP2b CLI 范围限定 PASS；不代表 D4A、母合同或 D/B 整体通过。

## 范围与坐标

- 源码树 `D:\Narraverse-World-Map\hds-d4-cp1a-review`，分支 `codex/world-runtime-d4-cp1a-review`，本地提交 `aea035f5b11311f70efd343cfbab78eb42251ff4`（父 `12f45f65ab63621cbfdbfb3464ae26678acf2b26`）。仅2 paths：既有 `simulation-runner.mjs` 与新增 `tests/simulation/scene-gift-runner.test.mjs`，423+/30-，提交后工作区干净；未推送、未合入 main、未部署。
- scene 显式注册；默认无机会。CLI 支持 `--days 0`、DTO3 与沿用的合法 Gift encounter input，导出既有29项集合并仅新增 canonical `scene-view.json`，共30个工件；summary 增加 `sceneHash`。
- scene resume 依母合同§7以 `--resume checkpoint --days 0 --out <新目录>` 只读恢复；不混入 fixture/seed/input、不推进状态。未知 rule、篡改和超预算均拒绝；不推断 legacy。旧规则正天恢复保持原行为。未改 core、HTTP 或 UI。

## 证据与结果

- 最小 RED 场景保留：days=0 在实现前以 `INVALID_INPUT` 失败。新增测试首轮8项中5过、3项属于测试构造错误（库存路径、checkpoint 文件名、未知 rule 错码假设）；仅改测试，没有为变绿调整生产代码。最终新增用例8/8通过，退出码0，用时107053.1959 ms；旧 `runner.test.mjs` 5/5通过，退出码0，用时1339.9309 ms，仅运行一次。两份 raw 文件名带 `.tap`，实际 reporter 是 spec；计数由报告索引机器读取，不能称作 TAP 格式。
- 最终索引 `artifacts/world-runtime-d4-cp2b-controller/controller-final-acceptance-index.json` SHA256 `e0aa24585b2565e73f3150acc0f6a6212fd7588630a83df142ba905401e3ea24`；生产文件 SHA256 `cae2229a016ed166f77f6746231a1e91124123897bb1bbeed003a7fd56aac832`，新增测试 SHA256 `941d4c6d8139b0fd312c39005a4d846e5dfc416d8f721673886f99aae493cf12`。新 raw SHA256 `bbc0fdfe778a53969fe32a651f5d6842665458e3cf33740d8dd8584ec29bc3a8`；旧 raw SHA256 `77be97a848a922cd73f0a8ba57b89accb3c2c80552b58566f79427ef9a7aa624`。索引核验覆盖78个生产文件及两份 raw。
- 旧零日 encounter 的开工前基准为29项导出，其中28项业务文件哈希在新测试中固定，未依赖 ignored 原件。Gift+AdvanceTime(1)后以零天恢复，完整 snapshot/eventLog 及29项非 summary 业务输出均逐字节一致；summary全部业务字段逐项比较，仅明确列出的运行 meta/startTick 允许差异。
- 真实默认 scene CLI 一天归档于 `artifacts/world-runtime-d4-cp2b-controller/scene-day-one/`：tick/revision 144，player food 19、hunter hunger 300/private food 0、public food 464；归档30项。summary 内 checkpointPath 指向已清理的临时目录；检查点以归档的 `checkpoint-r144.json` 为准。

## 限制与下一步

- 当前通过只覆盖 CLI 注册、导出与只读 resume。村庄 UI/static 和真实浏览器消费者核验未做；129 个真实 format-9 服务文件压力及完整 A/B 仍待验。D4A、母合同与 D 未通过，B 仍等待完整 A 交付。
- 下一步为村庄 UI/static 与真实浏览器消费者门，再继续完整 A 的合同验收。CP2b 源码及证据留在本地源码树，未推送；本报告不提供 GitHub 源码提交链接。
