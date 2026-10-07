# D2A：时间命令与持久幂等回执

2026-10-07 19:32（Asia/Shanghai）。D2A已验收；基准da1155f，最终代码d29da21bc14791b17fddc7451f3e7db17b6ac467，全量196/196及真实HTTP/浏览器/磁盘消费者通过。中控直接实施，不转交外部执行者。源码D:\Narraverse-World-Map-a2 @ codex/world-runtime-d2a；不合并runtime main，不触碰正式平台、旧页或真实存档。

## 给用户：本项结果

新世界观察页可以明确推进一段世界时间；生态、经济与三位NPC沿用已验收规则真实结算。刷新不推进时间。同一次请求重试、服务重启后重试均不会再推进；旧页签提交过期读数会收到冲突并要求重新读取。这里只是世界时间入口，不宣称玩家休整、旅行、买卖或D阶段完成。

## 给AI：冻结实现范围

- 默认仍只读；库选项writable:true或CLI --writable true才开放写入，使用新独立实验目录；旧D1目录不得隐式升级，只能明确指定checkpoint复制为新目录anchor。只读启动仍支持严格读取新service-commit档。
- 仅开放POST /api/runtime/commands中的AdvanceTime，沿用D1精确DTO：{version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}}；ticks整数1..1440，JSON最多4096字节，ID为1..64 ASCII字母数字/下划线/连字符，revision非负安全整数。未知/多余字段、重复JSON键、非法UTF-8、异类/getter记录、预算外输入先拒绝，不能调用原型或把未知输入改成默认值。
- 单owner/单提交队列。首次提交必须expectedRevision===当前revision；不一致409 REVISION_CONFLICT并携带currentRevision。revision沿用世界revision/tick，不增加另一套可混淆的页面计数。HTTP读仍只返回上一份成功发布的DTO，不见候选半状态。
- 同commandId同完整规范DTO（包括expectedRevision）重试，在过期判定前返回原持久回执；语义键顺序不影响判等。不同完整DTO409 COMMAND_ID_CONFLICT。拒绝请求不占用成功ID、不增加tick或事件；队列失败不得阻塞后续有效请求。输入队列与HTTP回执命名分开，不伪造已有核心commandReceipts。
- 候选独立Session从当前严格审核bundle创建，在候选上推进；任一tick/资源/预算/存盘失败均不发布当前Session或公开DTO。成功回执固定{apiVersion:1,commandId,status:'committed',fromRevision,toRevision,tick}；同ID重试返回这些原值，即使已有后续成功命令。
- 世界与HTTP回执必须在同一个不可覆盖的服务commit envelope中原子发布，禁止先保存checkpoint再另写receipt造成两个真源。格式显式版本化；完整bundle仍通过C5严格审核，服务记录含初始化anchor与顺序命令/原回执，恢复需逐项核对唯一ID、DTO、revision连续性并重演到最终bundle；重新算一个摘要不能让篡改回执通过。不能增加skip/trusted开关。
- 服务commit采用现有同目录临时文件写入+sync+hard link独占发布语义，完整文件发布后才能交换内存候选、响应成功。未完成.tmp不是提交；已发布文件为提交点，模拟“发布后断连/崩溃但未响应”时重启仍能找到回执。只承诺已定义的进程失败恢复，不承诺磁盘断电恢复。
- 仅专用实验目录。保留D1独占锁、最大revision坏档不回退、异物拒绝、自己的锁才能清理。D1旧实验checkpoint只能作为显式审核anchor；不改其内容，不兼容猜测未知service格式。恢复不重设seed/profile，不自动删除旧commit、临时遗留或崩溃锁。
- 已有正式service-commit的目录，可保留并忽略最多128个格式精确匹配`.service-commit-rN.json.PID.SEQ.tmp`的普通临时文件；不读取为状态、不删除，不占正式文件预算。只有临时文件的初始化目录明确失败；异名/目录/链接仍拒绝。这样发布后尚未清理临时硬链接的硬退出不会抹掉已提交事实；锁仍须另行明确人工处理，不自动接管。
- 保护预算在分配前校验：单服务commit最大64MiB，目录最多128个正式状态文件（anchor与commit一起计数），成功HTTP命令总数最多128（初始化文件也占目录一项，因此正常目录最多127次成功新命令），排队请求最多16。满预算明确LIMIT_EXCEEDED，不自动清理或放宽。预算是保护限额，不是吞吐/长程性能承诺。先预检再展开/序列化，不构造预算外巨型字符串。
- HTTP沿用loopback/Host/Origin/白名单/no-store/CSP边界；POST要求application/json，有界读取Content-Length或流式分块累计（不得无界收集），超时/断连不能重复应用；不得读取模型/.env/Laya。错误不回传cause/内部路径。
- 页面提供可键盘操作的明确时间量选择与提交状态；每次用户意图生成一个ID，超时重试保留同ID/原DTO，不自动换ID或抬高expectedRevision。成功后重新GET公开读数；409显示冲突并重读，重新点击才构成新意图。两个页签共读服务，不把world保存至localStorage。
- 不增加玩家实体，不代玩家花猎人/村长/商人钱包，不修改旧C4/C5人格或规则。后续D2B需独立定义玩家Persistent Actor、人口/金币/物资唯一归属；D2C才接旅行、休整与真实交易。D3战斗及D4完整身份/并发验收继续单独执行。

## 验收与停止点

1. RED→GREEN覆盖DTO/解析/预算/幂等判序、首个冲突、同ID并发、不同ID同revision仅一个成功、队列失败恢复；拒绝输入前后世界/回执/磁盘字节相同。
2. 真磁盘发布前失败不交换状态；发布后响应丢失重启重试只应用一次；篡改回执/revision/顺序/最终bundle拒绝，坏最新不回退；目录/文件/队列预算紧凑反例，不使用OOM证明。
3. 干净CLI启动真实服务，POST推进144ticks；实际checkpoint/公开DTO/资源账/NPC事实与直接C5推进144ticks逐字节或规范数据一致。两个真实页签同revision并发提交，409和重读可见；重启同ID重试、读取与刷新不再推进。
4. 全部simulation+边界回归通过；共享Windows机默认--test-concurrency=2，保留实际命令和失败日志。旧C4/C5消费者不变。产物置忽略artifacts/world-runtime-d2a-*。
5. 精确提交/推送任务分支，更新PROJECT_CONTEXT与Project #2。D2A通过只代表世界时间提交链通过；D2B/D2C及D3/D4未完成时D2/阶段D不得标已验收。

## 接手前第一步

核对D1最终SHA、Git clean、owner/目录合同与本任务；先建立服务commit格式、恢复审核和失败注入测试，再开放POST与页面。若原子世界/回执恢复无法验证，保留只读服务，不以“单线程所以安全”替代持久证据。

## 中控验收与交接

- RED→GREEN证据：service模块缺失红灯、HTTP writable未开放红灯、硬退出留下临时硬链接导致目录拒绝的独立反例及新回归先红后绿。首次容量用例混入异物触发另一合法拒绝，改成纯129个正式文件后验证精确容量边界，没有改产品断言或放宽门槛。
- 干净最终代码d29da21上`node --test --test-concurrency=2 tests/simulation/*.test.mjs tests/export-boundaries.test.mjs`196/196、零失败/跳过，296.7秒；原D1七项及全部A/B/C回归保留。首版392fc45的195/195不是最终修正的替代证据。Node v24.14.0，无新增npm依赖。
- 单owner保持状态与HTTP回执同一service envelope，初始anchor及顺序DTO/回执与完整C5重演审核；同ID重试先于旧revision判断，异ID同revision只有一个成功，同ID不同DTO冲突，拒绝不占ID。队列16包含正在提交项；保存期间读者看旧revision、正常close等待队列后释放自锁。故障注入link失败后同ID可再次成功，坏最新不回退，64MiB文件/128正式档/128记录预算先检。
- 真HTTP测试覆盖非法媒体类型、重复/转义重复键、非法UTF8、4096字节边界、chunked累计超限及截断断连；拒绝后tick与磁盘不变，后续正常请求继续可用。收到响应头后丢弃响应、不确认回执，重启同DTO仍只提交一次。
- 更严格独立子进程：io.link完成正式发布后立即process.exit(75)，来不及返回回执或清理临时硬链接。初版确实在恢复时拒绝目录；最终识别有界临时文件并保留。崩溃锁仍OWNER_BUSY；核对自己的已退出测试PID及原token后仅人工移除该测试锁，严格恢复已发布档、同ID返回原回执，tick仍144。没有产品自动删锁、删临时档或回退。
- 真CLI127.0.0.1:18314 --writable true、两个in-app browser页签同时从revision0提交一天：一个成功、一个409并重读，世界只到tick144，粮894→909、药8→6、鹿120→121。实际service bundle与C5直接144ticks完整一致。正常quit/同目录CLI重启后原请求重试不改变r144存档字节。
- 页面断连后保留同一请求并提供重试；服务恢复后再推进144ticks。最终键盘提交一小时6ticks/键盘刷新通过，实际三个成功DTO为[144,144,6]；完整bundle与C5直接294ticks完全一致，粮923、药7、鹿122、人80，刷新及重试第一条原DTO都不再推进。浏览器console无error/warn；无模型/桥请求。验收页签及本次服务已正常关闭。
- 复用的有界文件I/O经原写/sync/close/link故障回归和独立旧D1/C5初始化checkpoint字节对照通过。此对照证明共享编码/存盘兼容，不冒称已经实现新玩家或全部D玩法。
- 忽略证据目录artifacts/world-runtime-d2a-acceptance-20261007：red*.txt、targeted.txt、full-tests.txt（首版）、full-tests-final.txt（最终）、comparison.json、browser-day1-comparison.json、restart-original-retry.json、hard-crash.json、checkpoint-byte-compat.json及browser-conflict.png/browser-final.png。最终r294文件SHA256 bf552c89f5252f81050ad51b72d5580d7b94be772978914fa7a9ca09fe00faa2；不是恶意编辑的数字签名。
- D2A PASS，仅世界时间提交链通过。下一步D2B先冻结独立玩家身份及资产唯一归属，再发布实现合同；当前Society配置/代理严格为三种NPC角色，不能直接增项或借用其钱包。D2B/D2C/D3/D4未开工，D2与阶段D未验收，源码仍留任务分支。
