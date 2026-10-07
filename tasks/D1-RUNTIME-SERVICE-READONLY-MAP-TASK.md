# D1：独立Runtime服务、只读地图与写入合同

2026-10-07 19:00（Asia/Shanghai）。中控直接实施，已验收。代码0f86d4076b3a49a11ac41e32f56c79182b5130a7；D:\Narraverse-World-Map-a2 @ codex/world-runtime-d1，基准a8ff72a（C5代码04dc222）。新独立入口，不改旧server.cjs/index.html/页面、正式平台或真实存档。

## 给用户：本项结果

独立本机页面能读取服务保存的真实世界时间、村庄公仓和价格、种群合计及人物固定身份；刷新/两个页签读同一个世界，重启服务仍一致。先只读观察，时间不自动流逝、刷新不推进时间；旅行/交易/战斗在D2～D4，不添加占位成功按钮。

## 给AI：冻结接口与归属

- runtime-server.mjs使用Node内置模块，默认只绑定127.0.0.1:18314，可明确指定空闲端口；不读取.env/模型/Laya、不监听外网、不启停旧18312/18212/18302/正式实例。库测试可用随机空闲端口。
- 服务从专用新实验data directory托管一个私有SimulationSession；默认personality-neutral seed42，可在新建时明确seed。可从明确指定、严格审核的同profile实验checkpoint初始化新空目录；已有目录不允许重设seed或用另一个checkpoint替换。
- 完整checkpoint仍由现有独占持久化接口保存/加载，选择已完成的最大revision文件且核对文件名/规则/profile；坏最新档明确失败，不回退旧档或重建。目录有不属于本服务的文件时拒绝初始化，不覆盖/清理；最多128档为保护预算。完整Snapshot/EventLog不向HTTP提供。
- 专用.runtime-owner.lock以wx原子创建，持有期间另一进程即使使用不同端口也不能接管同目录。正常停止只清理自己nonce匹配的锁；过期锁/硬崩溃不自动窃取或删除，明确OWNER_BUSY。启动失败释放自己的锁，不删除checkpoint；不扩展成分布式锁或承诺断电恢复。
- GET /api/runtime/snapshot返回白名单DTO：apiVersion1、simulationId、revision/tick、派生clock、公开market粮药/价格/路线、population匿名/实名/总存活和鹿狼合计、actors仅ID/name/occupation/location/alive。无钱包、私人药/Goal/Needs/人格、完整配置、RNG、日志或内部路径。GET纯读，返回复制；HEAD与重复读取不推进时钟，不存localStorage世界。
- GET /api/runtime/capabilities明确writes=false、commandDtoVersion1、单次推进预算1440ticks/JSON4096字节；GET /healthz仅本服务健康及revision，不透传旧桥。只白名单提供新runtime-map.html/runtime-map.mjs/runtime-map.css，其他路径404；返回no-store、无CORS通配，校验Host与存在的Origin只允许同端口loopback来源，拒绝DNS重绑定式Host，错误不暴露堆栈/文件路径。
- 预冻结D2时间写DTO：{version:1,commandId,expectedRevision,type:'AdvanceTime',payload:{ticks}}，commandId为1..64 ASCII字母数字/下划线/连字符，revision非负安全整数，ticks整数1..1440。写入前检查完整预算/类型，服务器单队列持锁；首次expectedRevision必须等于当前，否则409 REVISION_CONFLICT并返回currentRevision，客户端重读而非自动改revision重发。
- 成功同ID同完整DTO重试先返回原持久回执，不因revision变旧重复推进；同ID不同DTO为409 COMMAND_ID_CONFLICT。保存成功才发布新状态/成功回执，失败整请求不公布半写。这个写合同在D1仅文档/纯DTO验证，不开放POST写入；/api/runtime/commands固定405 WRITE_DISABLED，其他已知只读资源非法方法405并列Allow，D2才能实现。后续旅行/交易DTO另补明确实体归属和耗时合同。
- 错误统一{apiVersion:1,error:{code,message}}，未知路由404 ROUTE_NOT_FOUND，非法输入400 INVALID_INPUT，Host/Origin403 ORIGIN_REJECTED，未开放写405 WRITE_DISABLED，Owner启动竞争OWNER_BUSY，存盘失败SAVE_FAILED；HTTP不返回原cause。HTTP header/body/超时有界，拒绝后不分配无界请求体。
- 新地图呈现真实公仓、种群及三人身份；画布不虚造人物位置或旅行结果。加载中/错误/重试可辨，错误后标明旧读数，键盘可操作刷新/读取状态，桌面优先。不会取旧浏览器存档、模型文字或另一个页面的世界对象作回退真源。

## 验收与停止点

1. RED→GREEN：公开DTO私密字段/别名、纯读取、未知规则/坏档、目录异物、最新档不回退、seed/checkpoint重设拒绝；两个owner争同目录、启动端口失败释放自锁、替换锁不能删除，数据保持。
2. 真HTTP：GET/HEAD/错误/只读POST、Host/Origin、路径穿越/敏感文件、预算/超时边界；独立两次请求同revision且没有额外事件；CLI真实启动/正常停止/同目录重启并完整checkpoint字节未变。
3. 真浏览器新页面→JSON服务→实际私有world DTO闭环，时间/库存/人物与checkpoint一致；刷新/第二页签不变；断连出现错误并可重试；无页面异常或模型/桥请求。不能只用静态HTML或mock响应通过。
4. 所有当前simulation+边界及D1定向回归通过。D1通过才进入D2，D整体仍进行中；旅行/交易/遭遇/多标签页过期写需D2～D4验收，不提前标D完成。

产物留忽略artifacts/world-runtime-d1-*，只能启停本次新服务/隔离浏览器，精确暂存推任务分支，不合并runtime main/部署/迁移真实数据。

## 中控验收

- 定向7/7通过；干净0f86d40上`node --test --test-concurrency=2 tests/simulation/*.test.mjs tests/export-boundaries.test.mjs`全量184/184、零失败/跳过，279.7秒。首次默认并发失败，多个旧模块及D1子进程出现VirtualAlloc/Zone Allocation内存错误；保留失败日志，降低运行并发后原测试全过，没有删测试/改断言。失败后采样物理可用约845MiB、系统commit约57.3/68.4GB，不代表崩溃时峰值。
- 真HTTP覆盖公开字段/复制隔离、GET/HEAD纯读、私有路径404、Host/Origin403、POST405、超限413、chunked400及owner竞争。独立socket探针：9000字节header431；未完成header约24.9秒400断开。Node配置5秒受连接巡检影响，未承诺严格5秒响应。
- 真实in-app browser两页签读取实际磁盘世界：tick/revision0、粮894、药8、人80（3实名/77匿名）、鹿120/狼14。刷新不推进；断连显示旧读数与重试提示，同目录重启重试恢复。正常与复验console无error/warn；不是静态HTML/mock验收。
- 硬终止本次自有服务后锁保留，CLI重启OWNER_BUSY。仅实验锁经原token、死PID与存档哈希核对后人工移除；产品没有自动抢锁。TTY实际quit正常停止并清理自锁；再CLI启动仍读原档，两次正常quit成功。最终自有18314服务和验收页签已停止/关闭。
- checkpoint-r0.json前后SHA256保持0149f370d05852a3dc90f1653235d1945efc3cec789dc1cf0937764bfbebafa6。忽略证据目录artifacts/world-runtime-d1-acceptance-20261007：full-tests.txt（首次失败）、full-tests-bounded.txt、browser-before.json、browser-restart.json、hard-crash.json、normal-stop.json、http-header-timeout.json。
- D1 PASS，阶段D继续进行中。下一项[D2A时间提交合同](D2A-TIME-COMMAND-COMMIT-TASK.md)已定义未开工；按用户要求本轮在D1收口后停止。旅行/休整/交易/战斗及完整多页签写入未实现，未合并runtime main/部署。
