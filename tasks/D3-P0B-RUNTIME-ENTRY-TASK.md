# D3-P0b：Runtime 命令提交入口核对

状态：混元4已交付；中控逐行复核完成，只读定位通过。D3实现未开工。

## 给用户看

只回答一个问题：现有 Runtime 如何接受并仅一次发布玩家命令，下一步战斗接入应从哪里开始。
本轮为静态核对，不改变玩法。目标回复不超过 400 个中文字符，约 5 分钟工作量；遇到范围外依赖就点名缺口并停止。

## 给施工团队

- 执行者：HDS 混元4，workbuddy/hy4-preview，high；保持既有施工对话。
- 已验收源：D:/Narraverse-World-Map-m4-ui-review；本轮施工树：D:/Narraverse-World-Map/hds-runtime，由同一基准新建，不改旧 A1。
- 施工分支：codex/world-runtime-d3-hds。
- 精确代码基准：115e256eec196ffcf73f3e3010da5324ab101439。若实际 HEAD 不符即报告，不自行切分支。
- HDS 当前登记的 D:/Narraverse-World-Map 仍为旧 A1，不可作为本任务 Runtime 依据。
- HDS 登记根：D:/Narraverse-World-Map；读取目标：hds-runtime/runtime/service/runtime-owner.mjs、hds-runtime/runtime/service/service-commit.mjs。
- 支持读取仅限上述源码树的 AGENTS.md、README.md、PROJECT_CONTEXT.md 必要部分及只读 Git 状态。
- 排除 .env*、密钥、运行数据、ignored artifacts、浏览器数据及任何其他项目；writeScope 为空。
- 先核对局部规则及 Git 状态，保护全部已有修改。

## 唯一问题与交付

用最多 5 条定位回答 owner.submit 的命令校验、重复 commandId / 过期 expectedRevision 处理、候选世界生成、持久化完成及内存投影发布的顺序。每条包含文件与准确行号，未知明确标注。

结尾给一个最小后续接口核对建议。不要设计完整 D3，不新增命令 DTO、战斗规则或版本，不提出浏览器自行裁决结果。

## 验证与停止

- 本轮不改文件、不跑测试、不启服务、不配置模型、不提交/推送/部署、不修改 .git 内部。
- 不需要公开研究；若判断确需范围外资料，列具体路径/理由交中控，不自行扩读。
- 前后 Git 状态一致；源码定位可由中控复核。
- 约 5 分钟内完成已有定位或报告准确缺口，不为凑齐条数延长任务。
- 完成当前问题立即停止，下一项另行派发。此核对不代表 D3 实现或验收通过。

## 接入状态

2026-10-11（Asia/Shanghai）：新增源码读取经用户明确授权后，挂接独立M4目录返回未登记错误。中控在已登记项目下创建 hds-runtime 独立施工工作树，仍为115e256基准，保留旧A1与stickman-engine.js既有改动；按限定路径派发，不扩大工作区白名单。runId 67af99ac-a80c-44d0-be4c-b2ac5b3935fc，session-e3045ff1-5909-421d-9aaf-44bcebb264b8；模型workbuddy/hy4-preview high，read-only，promptAdmission accepted。原始审批失败保留于对话及本任务接入记录，授权后未再要求确认。

## 中控复核结果

2026-10-11（Asia/Shanghai）：本轮运行成功结束，复用原施工对话。已逐行复核 runtime-owner.mjs:113–134 与 service-commit.mjs:21–61：去重在版本检查之前；串行提交；保存成功后更新三个投影；服务恢复按相同 transition 重演并核对回执及完整 bundle。施工树 HEAD 仍115e256、工作区干净，父目录仍只有原stickman-engine.js修改和新增hds-runtime目录。

本轮仅静态核对，未运行测试、模拟或服务。未接受报告中对未读底层文件“tmp→rename”的推测；本轮没有证实底层发布方式，也不为此重跑未变化存储层的已有验收。下一小步应固定一次遭遇的命令/权威裁决边界，再开首个实现切片，不直接让旧浏览器存档承担最终事实。

## 后续短任务 D3-P0c：一页遭遇边界草案

用户继续后，混元4仅获准写hds-runtime/docs/runtime/D3-ENCOUNTER-BOUNDARY-DRAFT.md；读取玩家状态、生态、HTTP及已核对服务模块的必要部分。runId b79a77fd-1ba7-49ce-95f2-a492a0b928eb，模型/会话不变；原回复自报63行，磁盘实际37行，以实体为准。中控保存原稿至ignored证据后修正日界重复结算、wolves捕食账违规、不必要客户端字段及冻结ecology修改范围。

最终42行草案，完整D3未冻结/未实现；施工树本地文档提交3394a530d3c3965da3e458c64bdafc8be29a88d4，唯一新增该文档，工作区干净，未push/main/部署。关键边界是一次预留1只wolves、Runtime裁决结果、预留不参加聚合日结、死亡与归还仅一次转移。下一首个实现片限定新增纯encounter-reservation内核和一份测试两文件；精确DTO/导出另派任务，不自动进入战斗回合。

只做文档检查与源码约束复核，未运行测试/模拟；记录artifacts/world-runtime-d3-preflight-20261011/p0c-review.json及p0c-hy4-original.md。路径校验首次尝试扩大docs父目录被自动审批拒绝，已按其建议在本地预建精确空目标文件，再以单文件读写范围成功派发；不存在剩余审批阻断。
