# D4P4｜DSH目录零倍率模型优化比较回执

时间：2026-10-15 12:49（Asia/Shanghai）。范围：[统一任务合同](../../tasks/D4P4-DSH-FREE-MODEL-OPTIMIZATION-TASK.md)。**四模型尝试和独立候选比较已完成；只有DeepSeek候选通过本轮语义与打开测量门，不自动替换已验收2936233。** D阶段整体仍进行中。

## 结果

| 目录模型（请求路由均workbuddy-global/high） | 中控核对结果 | r170首次打开单样本 | 保存点 |
| --- | --- | --- | --- |
| deepseek-v4.1-flash | 候选通过语义门；完整公开投影与原存档一致；持久化篡改拒绝通过 | **47377.2192ms** | `10a2180441fcc9509a6ddd561ac97679f279aa9f` |
| hy4-preview-f | **拒绝**：普通键写入会触发继承setter或在继承只读属性上抛错 | 不运行，避免给不兼容候选计性能 | `f8128f0f4d007ff8aac59a27f44281e801db330c`（拒收实验存档） |
| hy3 | 原Relay调用429失败；用户手动恢复后落盘 **NO_CHANGE**，因node测试spawn EPERM而交回，现场零源码diff | 无候选，不重复测基准 | 基准2936233；恢复回执留本地 |
| step-5-preview | **拒绝**：与Hy4相同的继承属性反例；自带测试通过不能代替边界核验 | 不运行 | `722685969c3c6728381bbb0954e5913e572a2936`（拒收实验存档） |

相较历史2936233的61851.345ms，DeepSeek样本低约14474ms（约23.4%）；不是同时成对实验、稳定延迟/p95或全部玩法收益。模型自己报告的复制小样本2.57倍也不能替代47.38秒真实owner结果。等待仍在几十秒量级。

## 实际派工与权限

- 四树均由统一 `2936233426e990857f3c88a39ad58623832419fd` 建立，位于注册工作区 `D:\Narraverse-World-Map\free-perf-trials\{deepseek,hy4,hy3,step5}`，独立分支 `codex/world-runtime-d4-free-<label>`。实现顺序派发；CPU业务测量只运行了通过语义门的DeepSeek一次。
- DSH原生Relay读取路径/写范围、workspace-write授权；没有向其task/content粘贴源码或diff，没有用shell客户端调用Relay。读取probe均成功，写任务以指定目录为界。模型自己从工作区读取材料。
- 目录4种不同模型均标x0.00，同名国内Step不重复作第五种。实际费用、额度池和下游实际模型身份没有独立账单/遥测证明；Relay返回所选provider/model不等于账单免费证明。未主动切付费模型或购买额度。
- 原有两个未跟踪派工/规则文件在每棵树字节不变；除该两文件，候选树tracked内容均已精确保存。3个有改动候选分支由Codex提交、推送，DSH没有提交权限。Hy3无源码改动，不造空提交。

| 模型 | 只读probe runId | 实现runId / 原生终态 | 实现会话 |
| --- | --- | --- | --- |
| DeepSeek | e62202c7-c28a-4cbf-a89b-16d9d4aa38e2 | d814490c-73c9-467f-88d5-f5c83350b6e1 / succeeded | [DSH](http://127.0.0.1:19387/?sessionId=session-380e9f59-cdb8-4e93-9307-feaa058be3d2) |
| Hy4 | bc1af8e8-7aec-41aa-bdfe-20c390f271eb | 0b6a5c17-afba-4a73-9661-7b47e854e751 / succeeded | [DSH](http://127.0.0.1:19387/?sessionId=session-c836ba5d-7b31-48de-8e15-e17c2beec35f) |
| Hy3 | 69df8fed-387c-42ba-a46d-2d6febf00f0b | e5d3cd16-1a0a-4ea6-8162-d5f793367e37 / failed；用户手动后续不是新的Relay成功记录 | [DSH](http://127.0.0.1:19387/?sessionId=session-25ade05e-5994-4e39-9dbd-29984ac4b097) |
| Step5 | 48c54bf4-da5f-43f9-941b-653c6afaa560 | abe09e19-ccb7-47e4-8c4c-a02d8ef8d573 / succeeded | [DSH](http://127.0.0.1:19387/?sessionId=session-7a6cb456-2d46-45e5-ac2e-b6b2a7c90508) |

## 为什么保留DeepSeek、拒绝另外两个候选

三个实际候选都优化cloneData记录分支的逐键属性写入。DeepSeek先检查键是否为Object.prototype的自有属性，冲突键仍用原put/defineProperty；其余在新普通对象上赋值。公开put、canonicalJson、校验和预算保持原字节。该行为由继承setter/只读属性、原型和返回描述符的定向样本核对。

Hy4与Step5只特殊处理字面`__proto__`。`record()`校验输入的自有描述符和原型身份，并不保证Object.prototype不存在其他setter/只读键。中控在干净短Node进程给Object.prototype临时增加普通键，分别核对原/新cloneData，再finally清理：原实现安全产生自有数据属性且setter=0；二者候选调用setter一次、丢失自有属性；改为继承只读属性后二者抛TypeError，原实现仍成功。这是本改动直接改变的语义，不能凭原8份存档都是普通JSON就忽略。

中控未把相同缺陷修成相同答案后再冒充两个模型独立成功；拒收源、反例和失败日志原样存档，不合入已验分支。

## 独立执行证据

- DeepSeek：中控原编码5项+新增复制6项合计 **11/11 PASS**、0skip（243.2577ms），真实持久化CP2a-S7 **1/1 PASS**（931.9731ms）。原8档编码/拒绝边界及getter/原型/描述符保持；只有数据合同生产文件有差异。
- Hy4：中控原编码/其自带测试合计 **8pass/2fail**（10成员，227.8161ms），原RED保留；另有上述两个生产语义反例，已足够拒收。其部分自带测试断言也不准确，不为候选比较继续返修。
- Step5：中控原编码/其自带测试 **9/9 PASS**（338.4203ms），但上述生产反例失败，故明确拒收；没有把passing count当结论。
- Hy3：现场sourceSHA `98b645381f611302019ad5b8931df5b1149b23ea2d1ca0213fe10706cb05a370` 与2936233一致，零diff；用户手动恢复回执 `artifacts/free-model-optimization/hy3-handback.md` 12:34落盘，宣告NO_CHANGE。自报路由文字有workbuddy/hy3记法，手动后实际路由不可独立确认，记unknown；不改写原failed终态，不把EPERM理解为模型能力失败，也不为未变基准重复测试。
- DeepSeek唯一无Profiler测量：独立父进程监督120秒打开/150秒总预算；firstOpen47377.2192ms，正常关闭4.4346ms，父进程47508.4767ms、exit0、未触发watchdog。五公开投影由固定2936233编码器签名为 `046e7b2ef5da06bf3bf3d54096535601a84d7074e0754233c98d4f4031ec5f07`，与原R1同一起点记录一致；7副本和原8档SHA不变，无残留锁/进程。未返村、未重开、未创造新r182。

## 失败与流程偏差如实保留

Hy3原始错误包含 `QUOTA:429`、wrapper的`quota_exceeded`和内部`14003 / too many requests`，没有可核实余额；本轮按有界约定不自动重试它，仅再probe一个已授权Step备选。用户随后明确手动重启Hy3，产生新的NO_CHANGE交回，单独登记。

DSH多路都遇node --test的spawn EPERM。Hy4按约定交回；DeepSeek使用同进程测试并额外跑了41个回归成员，Step使用test-isolation=none且自报4轮测试修正，超出短工单/最少验证预期。中控已用原生steer收束，最终皆终态、无同文件写者；不将超额测试当本轮需要或更多质量证明。实际工单耗时超过目标5–10分钟，不能声称已实现严格模型执行硬截止。

## 收口与后续边界

本轮为候选比较完成，D4P4可收口；仅推荐DeepSeek候选继续候选验证。未将其替换2936233或合main，未部署/启动18324和其他旧实例/接模型/迁移真实档，也没有扩大到全量、截图或H7/128命令重跑。若采纳DeepSeek，还需该候选直接影响的最少持久提交/正常重开完整结果核验；此前D4P3全链证据不能冒充新候选全链新跑。

控制树原始证据索引在 `artifacts/d4p4-dsh-20261015/`：各路manifest/probe/dispatch/终态，`candidate-index.json`，`open-deepseek/result.json`及原始测量driver/输出。模型自身的试验/回执/中控测试与反例保留在各候选 `artifacts/free-model-optimization/`；原始私有档和凭据不上传。
